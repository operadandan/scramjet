// BREACH - multiplayer FPS on Cloudflare Workers + Durable Objects
import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS = 12;
const SPAWN_COUNT = 8;

// Multiplayer works two ways:
//  1. Durable Object "ROOMS" (needs a wrangler deploy), or
//  2. Dashboard-only: bind a D1 database as "DB". Players connect peer-to-peer (WebRTC);
//     the room creator's browser runs the game server and D1 only carries the connection handshake.
//     Optional: add TURN_KEY_ID and TURN_KEY_API_TOKEN (Realtime > TURN in the dashboard) for strict networks.
let dbReady = false;
async function getDB(env) {
  if (!env.DB) return null;
  if (!dbReady) {
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, host TEXT NOT NULL, seen INTEGER NOT NULL)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS sig (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, dst TEXT NOT NULL, src TEXT NOT NULL, data TEXT NOT NULL, ts INTEGER NOT NULL)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS sig_dst ON sig (room, dst, id)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS pubs (code TEXT PRIMARY KEY, seen INTEGER NOT NULL, open INTEGER NOT NULL, n INTEGER NOT NULL)"),
      // the server browser: every public server and what it is running
      env.DB.prepare("CREATE TABLE IF NOT EXISTS servers (code TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, map TEXT NOT NULL, ph TEXT NOT NULL, n INTEGER NOT NULL, max INTEGER NOT NULL, seen INTEGER NOT NULL, hold INTEGER NOT NULL DEFAULT 0)")
    ]);
    // (columns added after the tables first went out: the room's takeover key, when a reserved place was last handed out)
    for (const q of ["ALTER TABLE rooms ADD COLUMN tk TEXT", "ALTER TABLE servers ADD COLUMN holdT INTEGER NOT NULL DEFAULT 0"]) { try { await env.DB.prepare(q).run(); } catch (e) {} }
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS qrate (ip TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL)").run();
    dbReady = true;
  }
  return env.DB;
}
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const cleanCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
// the room's takeover key is only kept hashed: a player in the room knows it, nobody reading the database does
async function hashTk(t) { t = String(t || "").slice(0, 64); if (!t) return ""; const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("breach:" + t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const HOLD_MS = 20000;
const cleanId = c => String(c || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
const HOST_TTL = 20000;
const WEAPON_GAP = [55, 95, 350, 70, 95, 450]; // min ms between hits per weapon index (fire-rate sanity check)
const PELLETS = [0, 0, 0, 0, 0, 9]; // shotgun: this many pellet hits may land together before the gap applies
const wIndex = w => Number.isInteger(w) && w >= 0 && w < WEAPON_GAP.length ? w : 0;

async function handleApi(request, env, url) {
  const db = await getDB(env);
  if (url.pathname === "/api/ice") {
    if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
      try {
        const r = await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/" + env.TURN_KEY_ID + "/credentials/generate-ice-servers", {
          method: "POST", headers: { Authorization: "Bearer " + env.TURN_KEY_API_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ ttl: 86400 })
        });
        if (r.ok) {
          const j = await r.json();
          const iceServers = (j.iceServers || []).map(s => Object.assign({}, s, { urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) }));
          return json({ iceServers });
        }
      } catch (e) {}
    }
    return json({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  }
  if (!db) return json({ error: "no DB binding" }, 503);
  const now = Date.now();
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  switch (url.pathname) {
    case "/api/host": {
      const code = cleanCode(body.room), id = cleanId(body.id);
      if (code.length < 4 || !id) return json({ error: "bad request" }, 400);
      const row = await db.prepare("SELECT host, seen, tk FROM rooms WHERE code = ?").bind(code).first(), tk = await hashTk(body.tk);
      // (a lobby whose host left moves to one of its players: a takeover is allowed once the old host has stopped pinging
      // for a few seconds, or said it was leaving)
      const stale = body.takeover ? 7000 : HOST_TTL;
      if (row && row.host !== id && now - row.seen < stale) return json({ error: "taken" }, 409);
      // (taking over someone else's room needs the key everyone in it was given)
      if (row && row.host !== id && body.takeover && row.tk && row.tk !== tk) return json({ error: "taken" }, 409);
      await db.batch([
        db.prepare("INSERT OR REPLACE INTO rooms (code, host, seen, tk) VALUES (?, ?, ?, ?)").bind(code, id, now, tk || (row && row.tk) || null),
        db.prepare("DELETE FROM sig WHERE ts < ?").bind(now - 120000),
        db.prepare("DELETE FROM rooms WHERE seen < ?").bind(now - 3600000)
      ]);
      return json({ ok: true });
    }
    case "/api/ping": {
      await db.prepare("UPDATE rooms SET seen = ? WHERE code = ? AND host = ?").bind(now, cleanCode(body.room), cleanId(body.id)).run();
      // a public room (made by "queue up"): listed while it is on its baseplate with room to spare
      const own = await db.prepare("SELECT 1 FROM rooms WHERE code = ? AND host = ?").bind(cleanCode(body.room), cleanId(body.id)).first();
      if (own && body.pub) {
        const n = Math.max(0, Math.min(12, Number(body.n) || 0)), name = String(body.name || "").replace(/[<>]/g, "").slice(0, 32) || "BREACH server";
        const mode = body.mode === "raid" ? "raid" : "siege", ph = ["lobby", "load", "live", "post"].includes(body.ph) ? body.ph : "lobby", max = Math.max(2, Math.min(12, Number(body.max) || 12));
        await db.batch([
          db.prepare("INSERT OR REPLACE INTO pubs (code, seen, open, n) VALUES (?, ?, ?, ?)").bind(cleanCode(body.room), now, body.open ? 1 : 0, n),
          // (a queued player's reserved place is kept until the host's count catches up with it)
          db.prepare("INSERT INTO servers (code, name, mode, map, ph, n, max, seen, hold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT(code) DO UPDATE SET name = excluded.name, mode = excluded.mode, ph = excluded.ph, max = excluded.max, seen = excluded.seen, hold = CASE WHEN servers.holdT < ? THEN 0 WHEN excluded.n > servers.n THEN MAX(0, servers.hold - (excluded.n - servers.n)) ELSE servers.hold END, n = excluded.n").bind(cleanCode(body.room), name, mode, "Suburban House", ph, n, max, now, now - HOLD_MS)
        ]);
      } else if (own) await db.prepare("DELETE FROM servers WHERE code = ?").bind(cleanCode(body.room)).run();
      // (a host told it no longer owns its room, because a player took it over, stops running it)
      return json({ ok: true, own: !!own });
    }
    case "/api/unhost": {
      let b = body; if (!b.room) { try { b = JSON.parse(await request.text()); } catch (e) {} }
      await db.prepare("DELETE FROM rooms WHERE code = ? AND host = ?").bind(cleanCode(b.room), cleanId(b.id)).run();
      await db.prepare("DELETE FROM pubs WHERE code = ? AND NOT EXISTS (SELECT 1 FROM rooms WHERE code = ? AND host != ?)").bind(cleanCode(b.room), cleanCode(b.room), cleanId(b.id)).run();
      // (off the server browser at once; whoever takes over as host lists it again with their first ping)
      await db.prepare("DELETE FROM servers WHERE code = ? AND NOT EXISTS (SELECT 1 FROM rooms WHERE code = ?)").bind(cleanCode(b.room), cleanCode(b.room)).run();
      return json({ ok: true });
    }
    // queue up: the fullest public room still between matches (on its baseplate) with room for one more, if there is one
    case "/api/queue": {
      // the fullest public server of that mode still between matches with a place free; the place is held for you (so two
      // people queueing at once don't both take the last one, and do end up together). None: you are told to make one, and it
      // is listed at once, so the next one to queue finds you.
      // (a few a minute from one address: queueing in a loop can't fill every lobby with places nobody takes)
      const ip = cleanId(request.headers.get("cf-connecting-ip") || "local").slice(0, 24) || "local", qr = await db.prepare("SELECT n, t FROM qrate WHERE ip = ?").bind(ip).first();
      if (qr && now - qr.t < 30000 && qr.n >= 6) return json({ error: "slow down" }, 429);
      await db.batch([
        db.prepare("INSERT INTO qrate (ip, n, t) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET n = CASE WHEN qrate.t < ? THEN 1 ELSE qrate.n + 1 END, t = CASE WHEN qrate.t < ? THEN excluded.t ELSE qrate.t END").bind(ip, now, now - 30000, now - 30000),
        db.prepare("DELETE FROM qrate WHERE t < ?").bind(now - 600000),
        db.prepare("DELETE FROM pubs WHERE seen < ?").bind(now - 60000), db.prepare("DELETE FROM servers WHERE seen < ?").bind(now - 60000)]);
      const mode = body.mode === "raid" ? "raid" : "siege";
      // (a place held for someone who never turned up is let go after a few seconds)
      const held = "(CASE WHEN holdT < " + (now - HOLD_MS) + " THEN 0 ELSE hold END)";
      const row = await db.prepare("SELECT code FROM servers WHERE mode = ? AND ph = 'lobby' AND seen > ? AND n + " + held + " < max ORDER BY n + " + held + " DESC LIMIT 1").bind(mode, now - HOST_TTL).first();
      if (row) { await db.prepare("UPDATE servers SET hold = CASE WHEN holdT < ? THEN 1 ELSE hold + 1 END, holdT = ? WHERE code = ?").bind(now - HOLD_MS, now, row.code).run(); return json({ room: row.code }); }
      // none: a fresh code nobody is using, which is only listed once its host is up and pinging
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let tries = 0; tries < 6; tries++) {
        let code = ""; for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const used = await db.prepare("SELECT 1 FROM rooms WHERE code = ? UNION ALL SELECT 1 FROM servers WHERE code = ?").bind(code, code).first();
        if (!used) return json({ room: null, make: code });
      }
      return json({ error: "busy" }, 503);
    }
    case "/api/servers": {
      await db.prepare("DELETE FROM servers WHERE seen < ? OR NOT EXISTS (SELECT 1 FROM rooms WHERE rooms.code = servers.code)").bind(now - 60000).run();
      const rows = await db.prepare("SELECT code, name, mode, map, ph, n, max FROM servers WHERE seen > ? ORDER BY ph = 'lobby' DESC, n DESC LIMIT 60").bind(now - HOST_TTL).all();
      return json({ servers: rows.results || [] });
    }
    case "/api/room": {
      const row = await db.prepare("SELECT host, seen FROM rooms WHERE code = ?").bind(cleanCode(url.searchParams.get("room"))).first();
      if (!row || now - row.seen > HOST_TTL) return json({ error: "not found" }, 404);
      return json({ host: row.host });
    }
    case "/api/sig": {
      if (request.method === "POST") {
        const data = String(body.data || "");
        if (data.length > 30000) return json({ error: "too big" }, 413);
        await db.prepare("INSERT INTO sig (room, dst, src, data, ts) VALUES (?, ?, ?, ?, ?)").bind(cleanCode(body.room), cleanId(body.dst), cleanId(body.src), data, now).run();
        return json({ ok: true });
      }
      const room = cleanCode(url.searchParams.get("room")), me = cleanId(url.searchParams.get("me")), after = Number(url.searchParams.get("after")) || 0;
      const { results } = await db.prepare("SELECT id, src, data FROM sig WHERE room = ? AND dst = ? AND id > ? ORDER BY id LIMIT 20").bind(room, me, after).all();
      if (results.length) await db.prepare("DELETE FROM sig WHERE room = ? AND dst = ? AND id <= ?").bind(room, me, results[results.length - 1].id).run();
      return json({ rows: results });
    }
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        return json({ ok: true, rooms: !!(env.ROOMS && env.ROOMS.idFromName), rtc: !!env.DB, turn: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) });
      }
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname === "/ws") {
        if (!env.ROOMS) return new Response("ROOMS Durable Object binding missing", { status: 500 });
        const room = cleanCode(url.searchParams.get("room"));
        if (room.length < 4) return new Response("bad room code", { status: 400 });
        return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
      }
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
    return new Response(HTML, { headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store" } });
  }
};

export const GD_RULES = { beartrap: ['b', 3], wire: ['b', 2], shield: ['b', 1], alarm: ['b', 2] };
class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.nextId = 1;
    this.rInit();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    if (this.players.size >= MAX_PLAYERS) {
      server.send(JSON.stringify({ t: "full" }));
      server.close(1000, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    const p = { id: this.nextId++, ws: server, name: "", ready: false, hp: 100, alive: false, state: null, lastHit: 0, kills: 0, deaths: 0 };
    this.players.set(p.id, p);
    server.addEventListener("message", e => this.onMessage(p, e.data));
    const drop = () => { if (this.players.has(p.id)) this.sgDrop(p); delete this.R.votes[p.id]; if (this.players.delete(p.id)) { this.broadcast({ t: "leave", id: p.id }); if (!this.players.size) { if (this.R.tm) clearTimeout(this.R.tm); this.rInit(); } else this.rCheck(); } };
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(p, msg) { try { p.ws.send(JSON.stringify(msg)); } catch (e) {} }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p !== except && p.ready) { try { p.ws.send(s); } catch (e) {} }
  }

  onMessage(p, raw) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    switch (m.t) {
      case "hello": {
        if (p.ready) return;
        p.name = String(m.name || "").replace(/[<>]/g, "").slice(0, 16) || ("Op" + p.id);
        p.ready = true;
        p.team = this.rTeam();
        const players = [...this.players.values()].filter(x => x.ready).map(x => ({ id: x.id, name: x.name, alive: x.alive, state: x.state, k: x.kills, d: x.deaths, tm: x.team }));
        this.send(p, { t: "welcome", id: p.id, players, r: this.rMsg() });
        this.broadcast({ t: "join", id: p.id, name: p.name, tm: p.team }, p);
        // mid-round: waits for the next one
        if (this.R.ph === "lobby" || this.R.ph === "load") this.spawn(p);
        this.rCheck();
        break;
      }
      case "s": {
        if (!p.ready || !p.alive || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
        if (this.holdStill(p, m) === false) break; m.id = p.id; p.state = m;
        this.broadcast(m, p);
        break;
      }
      case "shot": {
        if (!p.ready || !p.alive || this.frozen()) return;
        const nums = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
        if (!nums(m.o) || !nums(m.d)) return;
        this.broadcast({ t: "shot", id: p.id, o: m.o, d: m.d, w: wIndex(m.w), tr: m.tr ? 1 : 0, sp: m.sp ? 1 : 0, sd: (Number(m.sd) >>> 0) || 0 }, p);
        break;
      }
      case "idrop": {
        if (!p.ready || !m.it || typeof m.it !== "object" || JSON.stringify(m).length > 600) return;
        this.broadcast({ t: "idrop", it: m.it, p: m.p, v: m.v }, p);
        break;
      }
      case "itake": { if (p.ready) this.broadcast({ t: "itake", iid: Number(m.iid) || 0 }, p); break; }
      // explosives: a C4 charge set, a grenade thrown, a charge or grenade going off (each client works out its own damage)
      // doors: what a player did to one goes to everyone else; the doors as they are, from one player to one joining
      case "door": { if (p.ready && Number.isInteger(m.i) && m.i >= 0 && m.i < 64 && raw.length < 300) { if (m.a === "sd") { if (p.team !== "r" || !p.alive || Date.now() - (p.sdT || 0) < 1100) break; p.sdT = Date.now(); } m.id = p.id; this.broadcast(m, p); } break; }
      case "wsnap": { const tg = this.players.get(m.to); if (p.ready && tg && tg !== p && Array.isArray(m.s) && raw.length < 1900) this.send(tg, { t: "wsnap", s: m.s }); break; }
      case "dsnap": { const tg = this.players.get(m.to); if (p.ready && tg && tg !== p && Array.isArray(m.s) && raw.length < 1900) this.send(tg, { t: "dsnap", s: m.s }); break; }
      case "vote": if (p.ready && this.R.ph === "lobby" && m.map === "house") { this.R.votes[p.id] = "house"; this.broadcast(this.rMsg()); } break;
      case "sg": if (raw.length < 400) this.sgMsg(p, m); break;
      case "chat": if (p.ready && typeof m.s === "string" && m.s.trim() && (p.chatT || 0) < Date.now() - 500) { p.chatT = Date.now(); this.broadcast({ t: "chat", id: p.id, s: m.s.slice(0, 120) }, p); } break;
      case "x": { if (p.ready && raw.length < 600 && ["c4p", "c4t", "nade", "boom", "chk", "gd", "gdx", "mw", "bx"].includes(m.a) && !this.frozen() && this.xGuard(p, m)) this.broadcast({ t: "x", id: p.id, a: m.a, k: ["c4", "frag", "smoke", "flash", "teargas", "bcharge", "claymore", "beartrap", "wire", "shield", "alarm", "snap", "rustle", "dis", "cut"].includes(m.k) ? m.k : "frag", i: Number(m.i) || 0, p: m.p, n: m.n, v: m.v, f: Number(m.f) || 0, w: m.w, c: Number(m.c) || 0, tg: Number.isFinite(m.tg) ? m.tg : undefined, tp: Number(m.tp) || 0, lp: m.lp, lq: m.lq, ob: m.ob ? 1 : 0, T: Array.isArray(m.T) ? m.T.slice(0, 48).map(Number) : undefined, C: Array.isArray(m.C) ? m.C.slice(0, 32).map(Number) : undefined, H: Array.isArray(m.H) ? m.H.slice(0, 24).map(Number) : undefined }, p); break; }
      // a punch: forwarded to the one hit, whose client works out the bruise
      case "punch": { const sl = m.sl && p.team === "r" && Date.now() - (p.lastSl || 0) > 1200; if (sl) p.lastSl = Date.now(); const tgt = this.players.get(m.id), pa = p.state && p.state.p, ta = tgt && tgt.state && tgt.state.p; if (p.ready && p.alive && !this.frozen() && (!pa || !ta || Math.hypot(pa[0] - ta[0], pa[1] - ta[1], pa[2] - ta[2]) < 2.6) && tgt && tgt !== p && tgt.alive && Date.now() - (p.lastPunch || 0) > 220) { p.lastPunch = Date.now(); this.send(tgt, { t: "punched", by: p.id, f: String(m.f || "").slice(0, 8), p: m.p, wd: m.wd, pw: Math.min(1.2, Math.max(0, Number(m.pw) || 0)), sl: sl ? 1 : 0 }); } break; }
      case "hit": this.hit(p, m); break;
      case "died": this.died(p, m); break;
      case "down": this.down(p, m); break;
    }
  }

  // gadgets: the room keeps track of what was placed, by whom, so a placement or a trigger can be checked (and stamped with the sender's side)
  xGuard(p, m) {
    const R = this.R, now = Date.now(), at = p.state && Array.isArray(p.state.p) ? p.state.p : null;
    const fin = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite), near = (q, r) => !at || Math.hypot(at[0] - q[0], at[1] - q[1], at[2] - q[2]) < r;
    if (!R.gd) R.gd = {};
    if (m.a === 'gd') {
      const rule = Object.hasOwn(GD_RULES, m.k) ? GD_RULES[m.k] : null; p.gdN = p.gdN || {};
      if (!rule || R.ph !== 'live' || !p.alive || p.team !== rule[0] || (p.gdN[m.k] || 0) >= rule[1] || !fin(m.p) || !near(m.p, 4)) return false;
      p.gdN[m.k] = (p.gdN[m.k] || 0) + 1; m.c = p.team === 'r' ? 1 : 2; R.gd[p.id + ':' + (Number(m.i) || 0)] = { team: p.team, k: m.k, p: m.p, f: Number(m.f) || 0, o: p.id, i: Number(m.i) || 0 };
      return true;
    }
    // a blast wrecks the gadgets round it, the same way every client works it out: the room forgets them too, once the boom
    // itself is accepted (and never the gadget that is going off)
    const sweep = skip => { if (!fin(m.p)) return; const W = { c4: 0.76, frag: 0.24, claymore: 0.3, bcharge: 0.3 }[m.k] || 0; if (W < 0.1) return;
      for (const key in R.gd) { const g = R.gd[key]; if (key !== skip && g.k !== 'bcharge' && Math.hypot(g.p[0] - m.p[0], g.p[1] - m.p[1], g.p[2] - m.p[2]) < 1.1 * Math.cbrt(W) + 0.4) delete R.gd[key]; } };
    if (m.a === 'boom' && m.k === 'bcharge') { const key = m.tg + ':' + (Number(m.i) || 0), g = Object.hasOwn(R.gd, key) ? R.gd[key] : null; if (!g || g.k !== 'bcharge' || m.tg !== p.id || !fin(m.p) || Math.hypot(g.p[0] - m.p[0], g.p[1] - m.p[1], g.p[2] - m.p[2]) > 0.6) return false; delete R.gd[key]; sweep(key); return true; }
    if (m.a === 'bx') { p.bxT = (p.bxT || []).filter(t => t > now - 1000); if (!fin(m.p) || !p.alive || p.bxT.length >= 4 || Math.abs(m.p[0]) > 60 || Math.abs(m.p[2]) > 60) return false; p.bxT.push(now); return true; }
    // a fist, gun butt or sledge through a soft wall: only from where they stand, only alive, in a round, a few a second
    if (m.a === 'mw') {
      p.mwT = (p.mwT || []).filter(t => t > now - 1000);
      if (!p.alive || !at || !fin(m.p) || !near(m.p, 2.6) || p.mwT.length >= 3 || (R.ph !== 'live' && R.ph !== 'lobby')) return false;
      p.mwT.push(now); m.n = Math.max(0, Math.min(16, m.n | 0)); m.w = Math.max(0, Math.min(4500, Number(m.w) || 0)); m.f = Math.max(0, Math.min(0.35, Number(m.f) || 0)); return true;
    }
    if (m.a === 'gdx' || (m.a === 'boom' && m.k === 'claymore')) {
      const key = m.tg + ':' + (Number(m.i) || 0), g = Object.hasOwn(R.gd, key) ? R.gd[key] : null;
      if (!g || R.ph !== 'live' || !p.alive || (p.gxT || 0) > now - 250) return false;
      if (m.a === 'boom') { if (g.k !== 'claymore' || (p.team === g.team && p.id !== m.tg) || !near(g.p, 6)) return false; delete R.gd[key]; sweep(key); return true; }
      if (m.k === 'dis' || m.k === 'cut') { if ((m.k === 'dis' && (g.k === 'wire' || !near(g.p, 90))) || (m.k === 'cut' && !near(g.p, 3))) return false; delete R.gd[key]; p.gxT = now; return true; }
      if (p.team === g.team || !near(g.p, 4) || !['snap', 'rustle', 'alarm'].includes(m.k) || (m.k === 'snap' && (g.k !== 'beartrap' || g.sn)) || (m.k === 'rustle' && g.k !== 'wire') || (m.k === 'alarm' && (g.k !== 'alarm' || !fin(m.p)))) return false;
      if (m.k === 'snap') g.sn = 1; p.gxT = now; return true;
    }
    if (m.a === 'boom') sweep('');
    return true;
  }
  // held still at round start (loadout and the 5 s count): the room keeps you where you spawned and drops your shots
  frozen() { const R = this.R; return R.ph === 'load' || (R.ph === 'live' && Date.now() < R.go); }
  holdStill(p, m) {
    if (!this.frozen()) { p.frz = null; return true; }
    if (m.lf !== p.life) return false;
    if (!p.frz) { p.frz = m.p.slice(0, 3); return true; }
    if (Math.hypot(m.p[0] - p.frz[0], m.p[2] - p.frz[2]) > 0.6) m.p = p.frz.slice();
    return true;
  }
  hit(p, m) {
    if (this.R.ph === 'load' || (this.R.ph === 'live' && Date.now() < this.R.go)) return;
    // bullets do no fixed damage: the hit is forwarded to the victim, whose client runs the anatomy model
    if (!p.ready || !p.alive) return;
    const tgt = this.players.get(m.id);
    if (!tgt || tgt === p || !tgt.alive) return;
    const w = wIndex(m.w), now = Date.now();
    if (PELLETS[w] && now - p.lastHit < 200 && (p.pel || 0) < PELLETS[w]) p.pel = (p.pel || 0) + 1;
    else { if (now - p.lastHit < WEAPON_GAP[w]) return; p.lastHit = now; p.pel = 1; }
    const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (!ok(m.p) || !ok(m.d)) return;
    const num = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));
    this.send(tgt, { t: "hurt", by: p.id, f: String(m.f || "").slice(0, 8), p: m.p, d: m.d, v: num(m.v, 0, 1200), w, ar: ["plate", "plateF", "plateB", "helmet"].includes(m.ar) ? m.ar : "", pd: num(m.pd, 0, 2), wd: ok(m.wd) ? m.wd : m.d, dist: Math.round(num(m.dist, 0, 5000)) });
  }

  died(p, m) {
    // (a death from a life already over, arriving late, is dropped)
    if (!p.ready || !p.alive || (m.lf !== undefined && m.lf !== p.life)) return;
    p.alive = false; p.deaths++; this.sgDrop(p, m.dp);
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0, kc = by && !p.credited && this.players.get(by).team !== p.team ? 1 : 0;
    if (kc) this.players.get(by).kills++;
    this.broadcast({ t: "die", id: p.id, by, kc, part: ["head", "torso", "arm", "leg"].includes(m.part) ? m.part : "torso", head: !!m.head, gib: m.gib ? 1 : 0,
      d: Array.isArray(m.d) ? m.d.slice(0, 3).map(Number) : [0, 0, -1], dist: Math.max(0, Math.min(5000, Math.round(Number(m.dist) || 0))), cause: String(m.cause || "").slice(0, 10) });
    // on the baseplate: back in 3 s; in a round: out until the next one
    if (this.R.ph === "lobby") setTimeout(() => { if (this.R.ph === "lobby" && !p.alive && this.players.has(p.id)) this.spawn(p); }, 3000); else this.rCheck();
  }

  // downing someone counts as the kill, once per life
  down(p, m) {
    if (!p.ready || !p.alive || (m.lf !== undefined && m.lf !== p.life)) return;
    // past saving (organ damage, paralysis...): still breathing, but out of the round, so it can end without waiting for them
    if (m.ft && !p.fatal) { p.fatal = true; this.broadcast({ t: 'fatal', id: p.id }); this.rCheck(); }
    if (p.credited) return;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0; if (!by || this.players.get(by).team === p.team) return;
    p.credited = by; this.players.get(by).kills++;
    this.broadcast({ t: 'kill', id: p.id, by });
  }

  spawn(p) {
    if (!this.players.has(p.id)) return;
    p.hp = 100; p.alive = true; p.fatal = false; p.frz = null; p.state = null; p.credited = 0; p.life = (p.life || 0) + 1;
    this.broadcast({ t: "spawn", id: p.id, lf: p.life, sp: Math.floor(Math.random() * SPAWN_COUNT), tm: p.team });
  }
  // ---------------------------------------------------------------- teams and rounds
  // Red attacks, Blue defends the house. While either team is empty it is warm-up (respawn after 4 s). With someone on both
  // teams a round starts: everyone spawns on their side, the dead stay dead until the next round. Attackers win by killing
  // every defender, defenders by killing every attacker or by holding out until the clock runs out.
  rInit() { if (this.R && this.R.pt) clearTimeout(this.R.pt); if (this.R && this.R.tm) clearTimeout(this.R.tm); this.R = { n: 0, ph: 'lobby', go: 0, votes: {}, map: 'house', end: 0, sc: { r: 0, b: 0 }, tm: null, pt: null, carrier: null, dz: null, plant: null, sgw: [], found: [] }; }
  rTeam() { let r = 0, b = 0; for (const x of this.players.values()) if (x.ready && x.team) x.team === 'r' ? r++ : b++; return r < b ? 'r' : b < r ? 'b' : (Math.random() < 0.5 ? 'r' : 'b'); }
  rCount(alive) { const c = { r: 0, b: 0 }; for (const x of this.players.values()) if (x.ready && x.team && (!alive || (x.alive && !x.fatal))) c[x.team]++; return c; }
  rTeams() { const o = {}; for (const x of this.players.values()) if (x.ready && x.team) o[x.id] = x.team; return o; }
  rMsg(extra) { const R = this.R; return Object.assign({ t: 'round', n: R.n, ph: R.ph, left: Math.max(0, R.end - Date.now()), go: Math.max(0, (R.go || 0) - Date.now()), sc: R.sc, mv: Object.values(R.votes || {}).length, map: R.map, tm: this.rTeams(), dfz: R.carrier, dz: R.dz, pl: R.plant && { site: R.plant.site, left: Math.max(0, R.plant.end - Date.now()) }, sp: R.sp | 0, sgw: R.sgw, gdw: Object.values(R.gd || {}).map(g => [g.o, g.i, g.k, g.p, g.f, g.team, g.sn ? 1 : 0]), fd: R.found, env: typeof envSnap === 'function' ? envSnap() : undefined }, extra || {}); }
  rTimer(ms, f) { if (this.R.tm) clearTimeout(this.R.tm); this.R.tm = setTimeout(() => { this.R.tm = null; f(); }, ms); }
  // ---- the match: a lobby on the baseplate (voting for the map) until there is someone on each team, then rounds to 5 wins.
  // A round: 15 s to pick a loadout (everyone at their start, held there), then the round itself, the first 5 s still held.
  rCheck() {
    const R = this.R, c = this.rCount(false), now = Date.now();
    if (R.ph === 'lobby') {
      // everyone on one side: the newest crosses over, so a match can start
      if (c.r + c.b >= 2 && !(c.r && c.b)) { const from = c.r ? 'r' : 'b', mv = [...this.players.values()].filter(x => x.ready && x.team === from).pop(); mv.team = from === 'r' ? 'b' : 'r'; c.r = c.r ? c.r - 1 : 1; c.b = c.b ? c.b - 1 : 1; this.broadcast(this.rMsg()); }
      if (c.r && c.b && !R.end) { R.end = now + 20000; this.broadcast(this.rMsg()); this.rTimer(20000, () => this.rMatch()); }
      else if (!(c.r && c.b) && R.end) { R.end = 0; if (R.tm) clearTimeout(R.tm); R.tm = null; this.broadcast(this.rMsg()); }
      return;
    }
    if (!c.r && !c.b) return this.rLobby();
    if (R.ph === 'load' && !(c.r && c.b)) { if (!(R.sc.r || R.sc.b)) return this.rLobby(); R.ph = 'live'; return this.rEnd(c.r ? 'r' : 'b', 'left'); }
    if (R.ph !== 'live') return;
    if (!c.r || !c.b) return this.rEnd(c.r ? 'r' : 'b', 'left');
    const a = this.rCount(true);
    // (with the defuser down, killing the attackers isn't enough: it still has to be disabled)
    if (!a.b) this.rEnd('r', 'elim'); else if (!a.r && !R.plant) this.rEnd('b', 'elim');
  }
  // back to the baseplate: the match is over (or there aren't players enough for one)
  rLobby() {
    const R = this.R; if (R.pt) clearTimeout(R.pt); R.pt = null; if (R.tm) clearTimeout(R.tm); R.tm = null;
    R.ph = 'lobby'; R.end = 0; R.go = 0; R.sc = { r: 0, b: 0 }; R.n = 0; R.plant = null; R.carrier = null; R.dz = null; R.sgw = []; R.bkSet = {}; R.found = []; R.demo = false; R.votes = {}; R.gd = {};
    this.broadcast(this.rMsg());
    for (const x of this.players.values()) if (x.ready) this.spawn(x);
    this.rCheck();
  }
  rMatch() { const R = this.R; R.sc = { r: 0, b: 0 }; R.n = 0; R.map = 'house'; R.votes = {}; this.rStart(); }
  rStart() {
    const R = this.R; let c = this.rCount(false);
    // evens the teams up first (the newest to join moves)
    while (Math.abs(c.r - c.b) > 1) { const from = c.r > c.b ? 'r' : 'b', mv = [...this.players.values()].filter(x => x.ready && x.team === from).pop(); mv.team = from === 'r' ? 'b' : 'r'; c = this.rCount(false); }
    if (!c.r || !c.b) return this.rLobby();
    R.n++; R.ph = 'load'; R.end = Date.now() + 15000; R.go = 0;
    // the bombs move every round: another pair of sites
    { R.sp = R.sp === undefined ? Math.floor(Math.random() * 4) : ((R.sp | 0) + 1 + Math.floor(Math.random() * 3)) % 4; }
    // a new round: one attacker, picked at random, carries the defuser; nothing boarded or reinforced yet
    if (R.pt) clearTimeout(R.pt); R.pt = null; R.plant = null; R.dz = null; R.sgw = []; R.bkSet = {}; R.found = []; R.demo = false;
    for (const x of this.players.values()) { x.rfN = 0; x.gdN = {}; } R.gd = {};
    { const at = [...this.players.values()].filter(x => x.ready && x.team === 'r'); R.carrier = at.length ? at[Math.floor(Math.random() * at.length)].id : null; }
    this.broadcast(this.rMsg());
    for (const x of this.players.values()) if (x.ready && x.team) this.spawn(x);
    const n = R.n; this.rTimer(15000, () => { if (R.n === n && R.ph === 'load') this.rGo(); });
  }
  // the loadouts are in: the round starts (held still for the first 5 s)
  rGo() {
    const R = this.R, now = Date.now(); R.ph = 'live'; R.go = now + 5000; R.end = now + 5000 + 180000;
    this.broadcast(this.rMsg()); this.rCheck();
    const n = R.n; this.rTimer(185000, () => { if (R.n === n && R.ph === 'live' && !R.plant) this.rEnd('b', 'time'); });
  }
  // ---------------------------------------------------------------- the bomb, the defuser, boards and reinforcements (Siege)
  // One attacker carries the defuser. Planted on a bomb site (A or B) it runs 45 s; if it finishes the attackers win, if a
  // defender disables it first the defenders win. Planted, the round goes on past the clock, and killing every attacker is not
  // enough: it still has to be disabled. Boards and reinforcements go out to everyone (and to anyone joining mid-round).
  sgMsg(p, m) {
    const R = this.R; if (!p.ready || !p.alive || typeof m.a !== 'string') return;
    const live = R.ph === 'live', now = Date.now(), at = p.state && Array.isArray(p.state.p) ? p.state.p : null;
    // (where the room last saw them: a plant, a disable or a revive has to be done from right there)
    const near = (q, r) => !at || !q || Math.hypot(at[0] - q[0], at[1] - q[1], at[2] - q[2]) < r;
    const site = id => typeof TOWN !== 'undefined' && TOWN.sites ? (TOWN.sites.find(x => x.id === id) || {}).p : null, sp = v => v ? [v.x, v.y, v.z] : null;
    p.sgT = p.sgT || {}; if (m.a !== 'found' && m.a !== 'bk' && (p.sgT[m.a] || 0) > now - 150) return; p.sgT[m.a] = now;
    switch (m.a) {
      case 'rv': { const tg = this.players.get(m.to), tq = tg && tg.state && Array.isArray(tg.state.p) ? tg.state.p : null; if (tg && tg !== p && tg.alive && tg.team === p.team && near(tq, 3.2)) this.send(tg, { t: 'sg', a: 'rv', by: p.id }); break; }
      case 'take': if (live && p.team === 'r' && R.dz && !R.carrier && near(R.dz, 2.5)) { R.carrier = p.id; R.dz = null; this.broadcast({ t: 'sg', a: 'carrier', id: p.id }); } break;
      case 'plant': if (live && p.id === R.carrier && !R.plant && (m.site === 'A' || m.site === 'B') && near(sp(site(m.site)), 2.8)) {
        R.plant = { site: m.site, end: now + 45000, by: p.id }; R.carrier = null;
        this.broadcast({ t: 'sg', a: 'plant', site: m.site, by: p.id, left: 45000 });
        const n = R.n; if (R.pt) clearTimeout(R.pt); R.pt = setTimeout(() => { R.pt = null; if (typeof net !== 'undefined' && net.host !== this) return; if (R.n === n && R.ph === 'live' && R.plant) this.rEnd('r', 'defuse'); }, 45000);
      } break;
      case 'disable': if (live && R.plant && p.team === 'b' && near(sp(site(R.plant.site)), 2.8)) this.rEnd('b', 'disabled'); break;
      case 'found': if (live && p.team === 'r' && (m.site === 'A' || m.site === 'B') && !R.found.includes(m.site)) { R.found.push(m.site); this.broadcast({ t: 'sg', a: 'found', site: m.site, by: p.id }, p); } break;
      case 'bk': {
        // a board knocked off: only in a live round, near that window (where the room has the map), a few a second at most,
        // each plank of each boarding once
        const i = m.i | 0, k = m.k | 0, w = typeof TOWN !== 'undefined' && TOWN.windows ? TOWN.windows[i] : null;
        p.bkT = (p.bkT || []).filter(t => t > now - 1000);
        if (!live || this.frozen() || i < 0 || i >= 64 || k < 0 || k > 2 || p.bkT.length >= 6 || R.sgw.length >= 300) break;
        if (w && w.p && !near([w.p.x, w.p.y, w.p.z], 3.5)) break;
        const gen = R.sgw.filter(e => e[0] === 'bd' && e[1] === i).length, key = i + ':' + k + ':' + gen; R.bkSet = R.bkSet || {};
        if (R.bkSet[key]) break; R.bkSet[key] = 1; p.bkT.push(now);
        R.sgw.push(['bk', i, k]); this.broadcast({ t: 'sg', a: 'bk', i, k }, p); break;
      }
      case 'bd': { const i = m.i | 0; if (p.team === 'b' && i >= 0 && i < 64 && R.sgw.length < 300) { R.sgw.push(['bd', i]); this.broadcast({ t: 'sg', a: 'bd', i }, p); } break; }
      case 'rf': { const b = m.b; if (p.team === 'b' && (p.rfN || 0) < 2 && Array.isArray(b) && b.length === 6 && b.every(v => Number.isFinite(v) && Math.abs(v) < 60) && b[3] > 0 && b[3] <= 1.45 && b[4] > 0 && b[4] <= 3.1 && b[5] > 0 && b[5] <= 1.45 && Math.min(b[3], b[5]) <= 0.07 && near([b[0], b[1], b[2]], 4) && R.sgw.length < 300) { p.rfN = (p.rfN || 0) + 1; const e = b.map(v => Math.round(v * 1000) / 1000); R.sgw.push(['rf', e]); this.broadcast({ t: 'sg', a: 'rf', b: e }, p); } break; }
    }
  }
  // the defuser carrier is gone (dead, or left): it drops where they were
  sgDrop(p, at) {
    const R = this.R; if (R.carrier !== p.id) return;
    const s = p.state && Array.isArray(p.state.p) ? p.state.p : null;
    let q = Array.isArray(at) && at.length === 3 && at.every(Number.isFinite) && (!s || Math.hypot(at[0] - s[0], at[1] - s[1], at[2] - s[2]) < 3) ? at : s;
    if (!q) q = [0, 0, 34];   // (never lost: if nothing is known it turns up where the attackers come in)
    R.carrier = null; R.dz = q ? q.map(v => Math.round(v * 100) / 100) : null;
    this.broadcast({ t: 'sg', a: 'drop', p: R.dz });
  }
  rEnd(win, why) {
    const R = this.R; if (R.ph !== 'live') return;
    R.ph = 'post'; R.sc[win]++; R.end = Date.now() + 7000; R.go = 0; if (R.pt) clearTimeout(R.pt); R.pt = null;
    const over = R.sc[win] >= 5;
    this.broadcast(this.rMsg({ win, why, over: over ? 1 : 0 }));
    // first to 5 wins the match: its result stays up, then everyone goes back to the baseplate
    this.rTimer(over ? 12000 : 7000, () => over ? this.rLobby() : this.rStart());
  }


}
