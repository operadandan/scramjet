// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, V3, clamp, scene } from './00-setup.js';
import { spawns } from './01-world.js';
import { TOWN, buildTown } from './01b-town.js';
import { chunkReset } from './02b-chunks.js';
import { hurtClutch } from './03-humanoid.js';
import { limbBodies, ragdolls, setHelmet, spawnRagdoll } from './04-ragdoll.js';
import { Anatomy, DEATH_TEXT } from './05-anatomy.js';
import { MEDKIT_W, WEAPONS } from './06-weapons.js';
import { VMW } from './08-hands.js';
import { decals, splatGeo } from './11-fx.js';
import { drops, killNotice } from './12-blood.js';
import { clearGore } from './12b-gore.js';
import { clearPools, clearWounds, splatIM } from './14-wounds.js';
import { DEB_POOLS, debris } from './15-destruction.js';
import { doorApplySnap, doorLeft, doorRx, doorSnap } from './15b-doors.js';
import { bullets, props, removeBullet } from './16-ballistics.js';
import { P, Remote, S, localBody, reactPack } from './17-dummies.js';
import { esc, feed, localDeath, onSelfHurt, remoteShot, respawnLocal } from './18-player.js';
import { clearExplosives, onExplosiveMsg } from './19b-explosives.js';
import { onPunched } from './19c-toolvm.js';
import { clearItems, hlMesh, removeItem, spawnItem } from './21-items-inventory.js';
import { leave, scoreOf } from './22-menu-loop.js';
// ---- end module links ----
// ---------------------------------------------------------------- transport (Durable Object websocket, or peer-to-peer WebRTC with the room creator as host)
const net = {
  mode: null, ws: null, host: null, rel: null, unr: null, pcs: [], timers: [], code: '', hostId: '',
  ready() {
    if (this.mode === 'ws') return !!this.ws && this.ws.readyState === 1;
    if (this.mode === 'host') return true;
    if (this.mode === 'peer') return !!this.rel && this.rel.readyState === 'open';
    return false;
  },
  send(m, fast) {
    if (this.mode === 'ws') { if (this.ready()) this.ws.send(JSON.stringify(m)); }
    else if (this.mode === 'host') { if (this.host) this.host.onMessage(this.host.self, m); }
    else if (this.mode === 'peer') {
      const ch = fast && this.unr && this.unr.readyState === 'open' ? this.unr : this.rel;
      if (ch && ch.readyState === 'open') try { ch.send(JSON.stringify(m)); } catch (e) {}
    }
  },
  close() {
    if (this.mode === 'host' && this.code) { try { navigator.sendBeacon('/api/unhost', JSON.stringify({ room: this.code, id: this.hostId })); } catch (e) {} }
    this.mode = null;
    if (this.ws) try { this.ws.close(); } catch (e) {}
    this.ws = null;
    for (const t of this.timers) clearInterval(t); this.timers = [];
    for (const pc of this.pcs) try { pc.close(); } catch (e) {} this.pcs = [];
    this.host = null; this.rel = this.unr = null; this.code = ''; this.hostId = '';
  }
};
const api = (path, body) => fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
  .then(r => r.ok ? r.json() : r.text().then(t => { const e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e; }));
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ICE = null;
async function getIce() {
  if (ICE) return ICE;
  try { ICE = (await api('/api/ice')).iceServers; } catch (e) { ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }]; }
  return ICE;
}
function waitIce(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 3000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
// in-browser game server, run by whoever created the room
const MAX_P2P = 8;
class HostRoom {
  constructor() { this.players = new Map(); this.nextId = 1; this.rInit(); this.self = this.add(null); }
  add(peer) { const p = { id: this.nextId++, peer, name: '', ready: false, alive: false, state: null, lastHit: 0, kills: 0, deaths: 0 }; this.players.set(p.id, p); return p; }
  deliver(p, s, fast) {
    if (!p.peer) { const m = JSON.parse(s); queueMicrotask(() => { if (net.mode === 'host') onNet(m); }); return; }
    const ch = fast && p.peer.unr && p.peer.unr.readyState === 'open' ? p.peer.unr : p.peer.rel;
    if (ch && ch.readyState === 'open') try { ch.send(s); } catch (e) {}
  }
  send(p, m) { this.deliver(p, JSON.stringify(m)); }
  broadcast(m, except, fast) { const s = JSON.stringify(m); for (const p of this.players.values()) if (p !== except && p.ready) this.deliver(p, s, fast); }
  drop(p) { if (this.players.delete(p.id)) { this.broadcast({ t: 'leave', id: p.id }); this.rCheck(); } }
  onMessage(p, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello': {
        if (p.ready) return;
        p.name = String(m.name || '').replace(/[<>]/g, '').slice(0, 16) || ('Op' + p.id); p.ready = true;
        p.team = this.rTeam();
        const players = [...this.players.values()].filter(x => x.ready).map(x => ({ id: x.id, name: x.name, alive: x.alive, state: x.state, k: x.kills, d: x.deaths, tm: x.team }));
        this.send(p, { t: 'welcome', id: p.id, players, r: this.rMsg() });
        this.broadcast({ t: 'join', id: p.id, name: p.name, tm: p.team }, p);
        // mid-round: waits for the next one
        if (this.R.ph === 'warm' || this.R.ph === 'pre') this.spawn(p);
        this.rCheck();
        break;
      }
      case 's': if (p.ready && p.alive && Array.isArray(m.p)) { m.id = p.id; p.state = m; this.broadcast(m, p, true); } break;
      case 'shot': {
        const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
        if (p.ready && p.alive && ok(m.o) && ok(m.d)) this.broadcast({ t: 'shot', id: p.id, o: m.o, d: m.d, w: WEAPONS[m.w] ? m.w : 0, tr: m.tr ? 1 : 0, sp: m.sp ? 1 : 0, sd: (Number(m.sd) >>> 0) || 0 }, p);
        break;
      }
      case 'idrop': { const s = JSON.stringify(m); if (p.ready && s.length < 600 && m.it && typeof m.it === 'object') this.broadcast({ t: 'idrop', it: m.it, p: m.p, v: m.v }, p); break; }
      case 'itake': if (p.ready) this.broadcast({ t: 'itake', iid: Number(m.iid) || 0 }, p); break;
      case 'door': if (p.ready && Number.isInteger(m.i) && m.i >= 0 && m.i < 64 && JSON.stringify(m).length < 300) { m.id = p.id; this.broadcast(m, p); } break;
      case 'dsnap': { const tg = this.players.get(m.to); if (p.ready && tg && tg !== p && Array.isArray(m.s) && JSON.stringify(m).length < 1900) this.send(tg, { t: 'dsnap', s: m.s }); break; }
      case 'x': if (p.ready && JSON.stringify(m).length < 600 && ['c4p', 'c4t', 'nade', 'boom', 'chk'].includes(m.a)) this.broadcast({ t: 'x', id: p.id, a: m.a, k: m.k, i: Number(m.i) || 0, p: m.p, n: m.n, v: m.v, f: m.f, w: m.w, c: m.c, tg: m.tg, tp: m.tp, lp: m.lp, lq: m.lq, ob: m.ob, T: m.T, C: m.C, H: m.H }, p); break;
      case 'punch': { const tgt = this.players.get(m.id); if (p.ready && p.alive && tgt && tgt !== p && tgt.alive) this.send(tgt, { t: 'punched', by: p.id, f: String(m.f || '').slice(0, 8), p: m.p, wd: m.wd, pw: Math.min(1.2, Math.max(0, Number(m.pw) || 0)) }); break; }
      case 'hit': this.hit(p, m); break;
      case 'died': this.died(p, m); break;
      case 'down': this.down(p, m); break;
    }
  }
  hit(p, m) {
    if (!p.ready || !p.alive) return;
    const tgt = this.players.get(m.id); if (!tgt || tgt === p || !tgt.alive) return;
    const w = WEAPONS[m.w] ? m.w : 0, now = Date.now();
    // a shotgun shot lands up to 9 pellets inside a short window; after that the next hit has to wait out the pump
    if (WEAPONS[w].pellets && now - p.lastHit < 200 && (p.pel || 0) < WEAPONS[w].pellets) p.pel = (p.pel || 0) + 1;
    else { if (now - p.lastHit < WEAPONS[w].gap) return; p.lastHit = now; p.pel = 1; }
    const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (!ok(m.p) || !ok(m.d)) return;
    this.send(tgt, { t: 'hurt', by: p.id, f: String(m.f || '').slice(0, 8), p: m.p, d: m.d, v: clamp(Number(m.v) || 0, 0, 1200), w, ar: ['plate', 'plateF', 'plateB', 'helmet'].includes(m.ar) ? m.ar : '', pd: clamp(Number(m.pd), 0, 2) || 0, wd: ok(m.wd) ? m.wd : m.d, dist: clamp(Math.round(Number(m.dist) || 0), 0, 5000) });
  }
  died(p, m) {
    // (a death from a life already over, arriving late, is dropped)
    if (!p.ready || !p.alive || (m.lf !== undefined && m.lf !== p.life)) return;
    p.alive = false; p.deaths++;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0, kc = by && !p.credited && this.players.get(by).team !== p.team ? 1 : 0;
    if (kc) this.players.get(by).kills++;
    this.broadcast({ t: 'die', id: p.id, by, kc, part: ['head', 'torso', 'arm', 'leg'].includes(m.part) ? m.part : 'torso', head: !!m.head, gib: m.gib ? 1 : 0, d: Array.isArray(m.d) ? m.d.slice(0, 3).map(Number) : [0, 0, -1], dist: clamp(Math.round(Number(m.dist) || 0), 0, 5000), cause: String(m.cause || '').slice(0, 10) });
    // warm-up: back in 4 s; in a round: out until the next one
    if (this.R.ph === 'warm') setTimeout(() => { if (this.players.has(p.id) && net.host === this && this.R.ph === 'warm' && !p.alive) this.spawn(p); }, 4000); else this.rCheck();
  }
  // downing someone counts as the kill, once per life
  down(p, m) {
    if (!p.ready || !p.alive || p.credited || (m.lf !== undefined && m.lf !== p.life)) return;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0; if (!by || this.players.get(by).team === p.team) return;
    p.credited = by; this.players.get(by).kills++;
    this.broadcast({ t: 'kill', id: p.id, by });
  }
  spawn(p) { if (!this.players.has(p.id)) return; p.hp = 100; p.alive = true; p.state = null; p.credited = 0; p.life = (p.life || 0) + 1; this.broadcast({ t: 'spawn', id: p.id, lf: p.life, sp: Math.floor(Math.random() * 8), tm: p.team }); }
  // ---------------------------------------------------------------- teams and rounds
  // Red attacks, Blue defends the house. While either team is empty it is warm-up (respawn after 4 s). With someone on both
  // teams a round starts: everyone spawns on their side, the dead stay dead until the next round. Attackers win by killing
  // every defender, defenders by killing every attacker or by holding out until the clock runs out.
  rInit() { this.R = { n: 0, ph: 'warm', end: 0, sc: { r: 0, b: 0 }, tm: null }; }
  rTeam() { let r = 0, b = 0; for (const x of this.players.values()) if (x.ready && x.team) x.team === 'r' ? r++ : b++; return r < b ? 'r' : b < r ? 'b' : (Math.random() < 0.5 ? 'r' : 'b'); }
  rCount(alive) { const c = { r: 0, b: 0 }; for (const x of this.players.values()) if (x.ready && x.team && (!alive || x.alive)) c[x.team]++; return c; }
  rTeams() { const o = {}; for (const x of this.players.values()) if (x.ready && x.team) o[x.id] = x.team; return o; }
  rMsg(extra) { return Object.assign({ t: 'round', n: this.R.n, ph: this.R.ph, left: Math.max(0, this.R.end - Date.now()), sc: this.R.sc, tm: this.rTeams() }, extra || {}); }
  rTimer(ms, f) { if (this.R.tm) clearTimeout(this.R.tm); this.R.tm = setTimeout(() => { if (net.host !== this) return; this.R.tm = null; f(); }, ms); }
  rCheck() {
    const R = this.R, c = this.rCount(false);
    // warm-up with two or more players all on one side: the newest crosses over, so a round can start
    if (R.ph === 'warm' && c.r + c.b >= 2 && !(c.r && c.b)) { const from = c.r ? 'r' : 'b', mv = [...this.players.values()].filter(x => x.ready && x.team === from).pop(); mv.team = from === 'r' ? 'b' : 'r'; c.r = c.r ? c.r - 1 : 1; c.b = c.b ? c.b - 1 : 1; this.broadcast(this.rMsg()); }
    if (R.ph === 'warm') { if (c.r && c.b) { R.ph = 'pre'; R.end = Date.now() + 5000; this.broadcast(this.rMsg()); this.rTimer(5000, () => this.rStart()); } return; }
    if (R.ph === 'pre' && !(c.r && c.b)) { R.ph = 'warm'; R.end = 0; if (R.tm) clearTimeout(R.tm); R.tm = null; this.broadcast(this.rMsg()); for (const x of this.players.values()) if (x.ready && !x.alive) this.spawn(x); return; }
    if (R.ph !== 'live') return;
    if (!c.r && !c.b) { if (R.tm) clearTimeout(R.tm); R.tm = null; R.ph = 'warm'; R.end = 0; this.broadcast(this.rMsg()); return; }
    if (!c.r || !c.b) return this.rEnd(c.r ? 'r' : 'b', 'left');
    const a = this.rCount(true);
    if (!a.b) this.rEnd('r', 'elim'); else if (!a.r) this.rEnd('b', 'elim');
  }
  rStart() {
    const R = this.R; let c = this.rCount(false);
    // evens the teams up first (the newest to join moves)
    while (Math.abs(c.r - c.b) > 1) { const from = c.r > c.b ? 'r' : 'b', mv = [...this.players.values()].filter(x => x.ready && x.team === from).pop(); mv.team = from === 'r' ? 'b' : 'r'; c = this.rCount(false); }
    if (!c.r || !c.b) { R.ph = 'warm'; R.end = 0; this.broadcast(this.rMsg()); for (const x of this.players.values()) if (x.ready && !x.alive) this.spawn(x); return; }
    R.n++; R.ph = 'live'; R.end = Date.now() + 180000;
    this.broadcast(this.rMsg());
    for (const x of this.players.values()) if (x.ready && x.team) this.spawn(x);
    const n = R.n; this.rTimer(180000, () => { if (R.n === n && R.ph === 'live') this.rEnd('b', 'time'); });
  }
  rEnd(win, why) {
    const R = this.R; if (R.ph !== 'live') return;
    R.ph = 'post'; R.sc[win]++; R.end = Date.now() + 7000;
    this.broadcast(this.rMsg({ win, why }));
    this.rTimer(7000, () => this.rStart());
  }

}
async function startHosting(code) {
  const me = rid();
  await api('/api/host', { room: code, id: me });
  net.mode = 'host'; net.host = new HostRoom(); net.code = code; net.hostId = me;
  net.timers.push(setInterval(() => { api('/api/ping', { room: code, id: me }).catch(() => {}); }, 5000));
  let after = 0, busy = false;
  net.timers.push(setInterval(async () => {
    if (busy || net.mode !== 'host') return; busy = true;
    try {
      const j = await api('/api/sig?room=' + code + '&me=' + me + '&after=' + after);
      for (const row of j.rows) { after = Math.max(after, row.id); const d = JSON.parse(row.data); if (d.type === 'offer') acceptPeer(code, me, row.src, d.sdp).catch(e => console.warn(e)); }
    } catch (e) {}
    busy = false;
  }, 1000));
  net.host.onMessage(net.host.self, { t: 'hello', name: S.myName });
}
async function acceptPeer(code, me, src, sdp) {
  const host = net.host; if (!host) return;
  if (host.players.size >= MAX_P2P) { await api('/api/sig', { room: code, src: me, dst: src, data: JSON.stringify({ type: 'full' }) }); return; }
  const pc = new RTCPeerConnection({ iceServers: await getIce() }); net.pcs.push(pc);
  const peer = { pc, rel: null, unr: null }; let p = null;
  const onmsg = ev => { if (!p || net.host !== host) return; let m; try { m = JSON.parse(ev.data); } catch (e) { return; } host.onMessage(p, m); };
  pc.ondatachannel = e => {
    const ch = e.channel; ch.onmessage = onmsg;
    if (ch.label === 'u') { peer.unr = ch; return; }
    peer.rel = ch;
    const open = () => { if (!p && net.host === host) p = host.add(peer); };
    ch.onopen = open; if (ch.readyState === 'open') open();
    ch.onclose = () => { if (p && net.host === host) host.drop(p); };
  };
  pc.onconnectionstatechange = () => { if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && p && net.host === host) host.drop(p); };
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);
  await api('/api/sig', { room: code, src: me, dst: src, data: JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp }) });
}
async function joinPeer(code) {
  let info; try { info = await api('/api/room?room=' + code); } catch (e) { throw new Error('Room ' + code + ' not found. The host may have left.'); }
  const me = rid();
  const pc = new RTCPeerConnection({ iceServers: await getIce() }); net.pcs.push(pc);
  const rel = pc.createDataChannel('r'), unr = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  await api('/api/sig', { room: code, src: me, dst: info.host, data: JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }) });
  let after = 0; const t0 = Date.now(), wanted = S.mode;
  for (;;) {
    if (S.mode !== wanted) throw new Error('Cancelled');
    if (Date.now() - t0 > 20000) throw new Error('The host did not answer. They may have left or lost connection.');
    const j = await api('/api/sig?room=' + code + '&me=' + me + '&after=' + after);
    let done = false;
    for (const row of j.rows) {
      after = Math.max(after, row.id); const d = JSON.parse(row.data);
      if (d.type === 'full') throw new Error('Room is full (' + MAX_P2P + ' players max).');
      if (d.type === 'answer') { await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); done = true; }
    }
    if (done) break;
    await sleep(700);
  }
  await new Promise((res, rej) => {
    if (rel.readyState === 'open') return res();
    const t = setTimeout(() => rej(new Error('Could not connect directly to the host. One of your networks blocks peer-to-peer; add TURN keys to fix it (see setup notes).')), 15000);
    rel.onopen = () => { clearTimeout(t); res(); };
  });
  net.mode = 'peer'; net.rel = rel; net.unr = unr; net.code = code;
  const onmsg = ev => { try { onNet(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
  rel.onmessage = onmsg; unr.onmessage = onmsg;
  const lost = why => { if (net.mode === 'peer' && net.rel === rel) { leave(); $('err').textContent = why + ' - room ' + code; } };
  rel.onclose = () => lost('The host left or the connection dropped');
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') lost('Connection to the host failed'); };
  net.send({ t: 'hello', name: S.myName });
}

// ---------------------------------------------------------------- networking
function onNet(m) {
  switch (m.t) {
    case 'welcome':
      S.myId = m.id; S.welcomed = true; S.names[m.id] = S.myName;
      S.team = {}; for (const pl of m.players) if (pl.tm) S.team[pl.id] = pl.tm;
      for (const pl of m.players) { S.score[pl.id] = { k: pl.k || 0, d: pl.d || 0 }; if (pl.id !== m.id) { const r = addRemote(pl.id, pl.name); r.alive = pl.alive; if (pl.state) r.setState(pl.state); } }
      if (m.r) roundRx(m.r, true);
      // joined mid-round: watching until the next one starts
      if (m.r && (m.r.ph === 'live' || m.r.ph === 'post')) $('deathmsg').textContent = 'ROUND IN PROGRESS · YOU SPAWN NEXT ROUND';
      break;
    case 'round': roundRx(m); break;
    case 'join': if (m.id !== S.myId) { if (m.tm) S.team[m.id] = m.tm; addRemote(m.id, m.name); feed(teamName(m.id) + ' joined');
      // the doors as they are now go to the one joining, from whoever has been in the room longest (lowest id)
      // (a moment later, so whatever was on its way to us about the doors has come; in pieces, to stay small)
      if (S.welcomed && [...S.remotes.keys()].every(id => id === m.id || id > S.myId)) { const to = m.id; setTimeout(() => { if (!S.remotes.has(to)) return; const s = doorSnap(); for (let i = 0; i < s.length; i += 12) net.send({ t: 'dsnap', to, s: s.slice(i, i + 12) }); }, 300); } }
      break;
    case 'door': doorRx(m); break;
    case 'dsnap': doorApplySnap(m.s); break;
    case 'leave': { const r = S.remotes.get(m.id); if (r) { feed(teamName(m.id) + ' left'); r.dispose(); S.remotes.delete(m.id); } delete S.team[m.id]; doorLeft(m.id); break; }
    case 's': { const r = S.remotes.get(m.id); if (r) r.setState(m); break; }
    case 'shot': remoteShot(m); break;
    case 'idrop': if (m.it && WEAPONS[m.it.w === undefined ? 0 : m.it.w] && ['gun', 'mag', 'medkit', 'plate'].includes(m.it.kind) && Array.isArray(m.p) && Array.isArray(m.v)) spawnItem(m.it, new V3().fromArray(m.p), new V3().fromArray(m.v), true); break;
    case 'itake': removeItem(m.iid); break;
    case 'x': onExplosiveMsg(m); break;
    case 'punched': onPunched(m); break;
    case 'hurt':
      if (P.alive && P.anat && Array.isArray(m.p) && Array.isArray(m.d)) {
        const an = P.anat; an.lastBy = m.by; an.lastDir.fromArray(m.wd || [0, 0, -1]); an.lastDist = m.dist || 0;
        hurtClutch(localBody.anim, String(m.f), new V3().fromArray(m.p));
        onSelfHurt(an.hit(String(m.f), new V3().fromArray(m.p), new V3().fromArray(m.d).normalize(), Number(m.v) || 0, WEAPONS[m.w] ? m.w : 0, m.ar || undefined, Number.isFinite(m.pd) ? m.pd : undefined));
      }
      break;
    case 'die': {
      const dir = new V3().fromArray(m.d || [0, 0, -1]).normalize();
      const killer = S.names[m.by] || ('P' + m.by), victim = S.names[m.id] || ('P' + m.id);
      if (m.id === S.myId) { if (P.alive) { P.anat.kill(m.cause || 'bleed'); localDeath(); } }
      else {
        const r = S.remotes.get(m.id);
        if (r && r.rag) { r.rag.keep = false; r.rag.owner = { anat: new Anatomy() }; r.rag = null; }
        else if (r && r.alive && r.st) { r.hum.root.updateMatrixWorld(true); (r.deadRag = spawnRagdoll(r.hum, new V3(), dir, m.part, m.head, { bb: r.st.bb, ls: r.st.ls, lc: r.st.lc, gib: !!m.gib, tear: !!m.tear, bleed: clamp(Number(m.bl) || 20, 0, 160), twitch: clamp(Number(m.tw) || 0, 0, 5) })).owner = { anat: new Anatomy() }; }
        if (r) r.alive = false;
      }
      scoreOf(m.id).d++; if (m.by && m.kc) scoreOf(m.by).k++;
      if (m.by === S.myId && m.kc) killNotice(victim);
      const why = DEATH_TEXT[m.cause] ? ' <span style="color:#9aa4ad">' + DEATH_TEXT[m.cause] + (m.by && m.dist ? ', ' + m.dist + ' m' : '') + '</span>' : '';
      feed(m.by ? esc(killer) + (m.head ? ' <span class="hs">HEADSHOT</span> ' : ' &rarr; ') + esc(victim) + why : esc(victim) + ' died' + why);
      break;
    }
    case 'kill': {
      scoreOf(m.by).k++;
      if (m.by === S.myId) killNotice(S.names[m.id] || ('P' + m.id));
      feed(esc(S.names[m.by] || ('P' + m.by)) + ' <span style="color:#9aa4ad">downed</span> ' + esc(S.names[m.id] || ('P' + m.id)));
      break;
    }
    case 'spawn':
      if (m.tm) { S.team[m.id] = m.tm; teamSync(); }
      if (m.id === S.myId) { S.life = m.lf; respawnLocal(teamSpawn(m.tm, m.sp)); }
      else { const r = S.remotes.get(m.id); if (r) { r.alive = true; r.snap = true; r.rag = null; r.deadRag = null; chunkReset(r.hum.root); r.st = null; r.react = null; clearWounds(r.hum); r.hum.setLost(0); setHelmet(r.hum, true); r.hum.fl = null; Object.assign(r.hum.anim, { hurt: 0, clutchT: 0, clutchW: 0, clutchF: null, braceP: null, braceW: 0, stag: 0, stagW: 0 }); } }
      break;
    case 'full': S.closeReason = 'Room is full (12 players max).'; break;
  }
}
function addRemote(id, name) {
  S.names[id] = name;
  let r = S.remotes.get(id); if (r) return r;
  r = new Remote(id, name, S.team[id]); S.remotes.set(id, r); teamSync(); return r;
}
// ---------------------------------------------------------------- teams and rounds (client side)
// Blue defends the house, Red attacks it. The room (19-network HostRoom / the Worker) runs the rounds; this shows them.
const DEF_TEAM = 'b';
const teamName = id => '<span style="color:' + (S.team[id] === 'r' ? '#ff8a7a' : S.team[id] === 'b' ? '#8ab4ff' : '#fff') + '">' + esc(S.names[id] || ('P' + id)) + '</span>';
// where a player of team tm starts: inside the house for the defenders, at the south end of town for the attackers
function teamSpawn(tm, sp) { const L = tm === DEF_TEAM ? TOWN.def : tm ? TOWN.atk : spawns; return (L.length ? L : spawns)[(sp | 0) % (L.length || spawns.length)]; }
// everyone dressed in their team's colours, and only teammates' names shown over their heads
function teamSync() {
  for (const [id, r] of [...S.remotes]) {
    const tm = S.team[id] || '';
    if (tm !== r.tm && !r.deadRag && !r.rag) { const n = new Remote(id, r.name, tm); n.alive = r.alive; if (r.st) n.setState(r.st); r.dispose(); S.remotes.set(id, n); }
    const R = S.remotes.get(id); R.label.visible = !!tm && tm === S.team[S.myId];
  }
}
function roundRx(m, joining) {
  const old = S.R || {}; S.R = { n: m.n | 0, ph: String(m.ph), end: performance.now() + (Number(m.left) || 0), sc: m.sc || { r: 0, b: 0 }, win: m.win, why: m.why };
  if (m.tm && typeof m.tm === 'object') { S.team = {}; for (const k in m.tm) S.team[k] = m.tm[k]; teamSync(); }
  // a new round: the town is put back as it was (walls, doors, glass), and everything left lying about is cleared away
  if (S.R.ph === 'live' && S.R.n !== old.n && !joining) resetRoundWorld();
  if (S.R.ph === 'post') { const mine = S.R.win === S.team[S.myId]; roundBanner((S.R.win === 'r' ? '<span style="color:#ff6a5a">RED WINS</span>' : '<span style="color:#6aa0ff">BLUE WINS</span>') + '<small>' + (S.R.why === 'time' ? 'The defenders held out' : S.R.why === 'left' ? 'The other team left' : S.R.win === DEF_TEAM ? 'Every attacker is dead' : 'Every defender is dead') + (S.team[S.myId] ? ' · ' + (mine ? 'your team won the round' : 'your team lost the round') : '') + '</small>', 6500); }
  if (S.R.ph === 'live' && !joining) roundBanner('ROUND ' + S.R.n + '<small>' + (S.team[S.myId] === DEF_TEAM ? 'Defend the house: kill every attacker or hold out' : 'Attack: kill every defender in the house') + '</small>', 3500);
}
function resetRoundWorld() {
  for (const r of S.remotes.values()) { r.deadRag = null; r.rag = null; }
  while (ragdolls.length) ragdolls.pop().dispose(); P.rag = null;
  clearItems(); drops.length = 0; hlMesh.visible = false;
  for (const d of decals) { scene.remove(d); if (d.geometry !== splatGeo) d.geometry.dispose(); } decals.length = 0; clearPools(); clearGore(); debris.length = 0; clearExplosives();
  splatIM.count = 0; splatIM.userData.next = 0;
  for (const Q of DEB_POOLS) { Q.im.count = 0; Q.next = 0; Q.slot.fill(null); }
  for (const p of props) scene.remove(p.m); props.length = 0; for (const L of limbBodies) L.dispose(); limbBodies.length = 0;
  while (bullets.length) removeBullet(bullets.length - 1);
  buildTown();
}
let bannerT = 0;
function roundBanner(html, ms) { const el = $('rbanner'); el.innerHTML = html; el.style.opacity = '1'; bannerT = performance.now() + ms; }
// the round line at the top of the screen, every frame
function roundHud() {
  const el = $('round'); if (S.mode !== 'online' || !S.R) { el.style.display = 'none'; return; }
  const R = S.R, my = S.team[S.myId], left = Math.max(0, Math.ceil((R.end - performance.now()) / 1000)), mm = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  let alive = { r: 0, b: 0 }; if (P.alive && my) alive[my]++; for (const [id, r] of S.remotes) if (r.alive && S.team[id]) alive[S.team[id]]++;
  const line = R.ph === 'warm' ? 'WARM-UP · waiting for a player on each team' : R.ph === 'pre' ? 'ROUND STARTS IN ' + left : R.ph === 'post' ? 'NEXT ROUND IN ' + left : 'ROUND ' + R.n + ' · ' + mm;
  const role = my ? (my === DEF_TEAM ? 'BLUE · DEFENDING' : 'RED · ATTACKING') : '';
  const out = R.ph === 'live' && !P.alive ? '<div class="out">You are out until the next round · ' + (my ? alive[my] : 0) + ' teammate' + ((my ? alive[my] : 0) === 1 ? '' : 's') + ' left</div>' : '';
  const html = '<div><b style="color:#6aa0ff">BLUE ' + R.sc.b + '</b> <span class="rl">' + line + '</span> <b style="color:#ff6a5a">' + R.sc.r + ' RED</b></div><div class="rs"><span style="color:' + (my === 'r' ? '#ff8a7a' : '#8ab4ff') + '">' + role + '</span>' + (R.ph === 'live' ? ' · alive: <span style="color:#8ab4ff">' + alive.b + '</span> v <span style="color:#ff8a7a">' + alive.r + '</span>' : '') + '</div>' + out;
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } el.style.display = 'block';
  if (bannerT && performance.now() > bannerT) { bannerT = 0; $('rbanner').style.opacity = '0'; }
}
let sendAcc = 0;
function netSend(dt) {
  if (S.mode !== 'online' || !net.ready() || !P.alive) return;
  sendAcc += dt; if (sendAcc < 0.05) return; sendAcc = 0;
  const r2 = v => Math.round(v * 100) / 100;
  net.send({
    t: 's', p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], y: r2(P.yaw), pi: r2(P.pitch), l: r2(P.leanEff), c: r2(P.crouch),
    v: r2(P.speed), sp: P.sprinting ? 1 : 0, r: P.reloading ? Math.max(0.01, r2(P.reloadT / P.reloadDur)) : 0,
    w: P.slot === 2 || P.slot === 3 ? MEDKIT_W : P.slot === 4 ? 7 : P.weapon, ar: P.anat.helmetOn ? 0 : 1, su: P.slot < 2 && VMW[P.weapon].supp ? 1 : 0, a: r2(P.ads), dn: P.downed ? 1 : 0, bb: P.anat.brokenMask(), ah: P.anat.armHangMask(), ls: P.anat.lostMask(), lc: P.anat.cutArr(), g: P.onGround ? 1 : 0, pr: r2(P.prone), lm: P.anat.bothLegs() ? 1 : (P.anat.legBroken('L') || P.anat.legBroken('R')) ? 0.5 : 0, bl: Math.round(P.anat.bleedRate()), hu: r2(localBody.anim.hurt || 0), sg: localBody.anim.stag || 0, rx: P.react && !P.downed ? reactPack(P.react) : 0, cl: localBody.anim.clutchT > 0 && localBody.anim.clutchW > 0.2 ? [localBody.anim.clutchF].concat(localBody.anim.clutchP.map(r2)) : 0
  }, true);
}

// ---- module exports: build.mjs strips this block ----
export { api, joinPeer, net, netSend, onNet, roundHud, startHosting };
// ---- end module exports ----
