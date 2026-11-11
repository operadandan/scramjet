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
      env.DB.prepare("CREATE INDEX IF NOT EXISTS sig_dst ON sig (room, dst, id)")
    ]);
    dbReady = true;
  }
  return env.DB;
}
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const cleanCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const cleanId = c => String(c || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
const HOST_TTL = 20000;
const WEAPON_GAP = [55, 95, 350, 70, 95]; // min ms between hits per weapon index (fire-rate sanity check)
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
      const row = await db.prepare("SELECT host, seen FROM rooms WHERE code = ?").bind(code).first();
      if (row && row.host !== id && now - row.seen < HOST_TTL) return json({ error: "taken" }, 409);
      await db.batch([
        db.prepare("INSERT OR REPLACE INTO rooms (code, host, seen) VALUES (?, ?, ?)").bind(code, id, now),
        db.prepare("DELETE FROM sig WHERE ts < ?").bind(now - 120000),
        db.prepare("DELETE FROM rooms WHERE seen < ?").bind(now - 3600000)
      ]);
      return json({ ok: true });
    }
    case "/api/ping": {
      await db.prepare("UPDATE rooms SET seen = ? WHERE code = ? AND host = ?").bind(now, cleanCode(body.room), cleanId(body.id)).run();
      return json({ ok: true });
    }
    case "/api/unhost": {
      let b = body; if (!b.room) { try { b = JSON.parse(await request.text()); } catch (e) {} }
      await db.prepare("DELETE FROM rooms WHERE code = ? AND host = ?").bind(cleanCode(b.room), cleanId(b.id)).run();
      return json({ ok: true });
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

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.nextId = 1;
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
    const drop = () => { if (this.players.delete(p.id)) this.broadcast({ t: "leave", id: p.id }); };
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
        const players = [...this.players.values()].filter(x => x.ready).map(x => ({ id: x.id, name: x.name, alive: x.alive, state: x.state, k: x.kills, d: x.deaths }));
        this.send(p, { t: "welcome", id: p.id, players });
        this.broadcast({ t: "join", id: p.id, name: p.name }, p);
        this.spawn(p);
        break;
      }
      case "s": {
        if (!p.ready || !p.alive || !Array.isArray(m.p)) return;
        m.id = p.id; p.state = m;
        this.broadcast(m, p);
        break;
      }
      case "shot": {
        if (!p.ready || !p.alive) return;
        const nums = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
        if (!nums(m.o) || !nums(m.d)) return;
        this.broadcast({ t: "shot", id: p.id, o: m.o, d: m.d, w: wIndex(m.w), tr: m.tr ? 1 : 0, sp: m.sp ? 1 : 0 }, p);
        break;
      }
      case "idrop": {
        if (!p.ready || !m.it || typeof m.it !== "object" || JSON.stringify(m).length > 600) return;
        this.broadcast({ t: "idrop", it: m.it, p: m.p, v: m.v }, p);
        break;
      }
      case "itake": { if (p.ready) this.broadcast({ t: "itake", iid: Number(m.iid) || 0 }, p); break; }
      case "hit": this.hit(p, m); break;
      case "died": this.died(p, m); break;
      case "down": this.down(p, m); break;
    }
  }

  hit(p, m) {
    // bullets do no fixed damage: the hit is forwarded to the victim, whose client runs the anatomy model
    if (!p.ready || !p.alive) return;
    const tgt = this.players.get(m.id);
    if (!tgt || tgt === p || !tgt.alive) return;
    const w = wIndex(m.w), now = Date.now();
    if (now - p.lastHit < WEAPON_GAP[w]) return;
    p.lastHit = now;
    const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (!ok(m.p) || !ok(m.d)) return;
    const num = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));
    this.send(tgt, { t: "hurt", by: p.id, f: String(m.f || "").slice(0, 8), p: m.p, d: m.d, v: num(m.v, 0, 1200), w, ar: ["plate", "plateF", "plateB", "helmet"].includes(m.ar) ? m.ar : "", pd: num(m.pd, 0, 2), wd: ok(m.wd) ? m.wd : m.d, dist: Math.round(num(m.dist, 0, 5000)) });
  }

  died(p, m) {
    if (!p.ready || !p.alive) return;
    p.alive = false; p.deaths++;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0, kc = by && !p.credited ? 1 : 0;
    if (kc) this.players.get(by).kills++;
    this.broadcast({ t: "die", id: p.id, by, kc, part: ["head", "torso", "arm", "leg"].includes(m.part) ? m.part : "torso", head: !!m.head, gib: m.gib ? 1 : 0,
      d: Array.isArray(m.d) ? m.d.slice(0, 3).map(Number) : [0, 0, -1], dist: Math.max(0, Math.min(5000, Math.round(Number(m.dist) || 0))), cause: String(m.cause || "").slice(0, 10) });
    setTimeout(() => this.spawn(p), 4000);
  }

  // downing someone counts as the kill, once per life
  down(p, m) {
    if (!p.ready || !p.alive || p.credited) return;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0;
    if (!by) return;
    p.credited = by; this.players.get(by).kills++;
    this.broadcast({ t: "kill", id: p.id, by });
  }

  spawn(p) {
    if (!this.players.has(p.id)) return;
    p.hp = 100; p.alive = true; p.state = null; p.credited = 0;
    this.broadcast({ t: "spawn", id: p.id, sp: Math.floor(Math.random() * SPAWN_COUNT) });
  }
}
