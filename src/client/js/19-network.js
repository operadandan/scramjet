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
  constructor() { this.players = new Map(); this.nextId = 1; this.self = this.add(null); }
  add(peer) { const p = { id: this.nextId++, peer, name: '', ready: false, alive: false, state: null, lastHit: 0, kills: 0, deaths: 0 }; this.players.set(p.id, p); return p; }
  deliver(p, s, fast) {
    if (!p.peer) { const m = JSON.parse(s); queueMicrotask(() => { if (net.mode === 'host') onNet(m); }); return; }
    const ch = fast && p.peer.unr && p.peer.unr.readyState === 'open' ? p.peer.unr : p.peer.rel;
    if (ch && ch.readyState === 'open') try { ch.send(s); } catch (e) {}
  }
  send(p, m) { this.deliver(p, JSON.stringify(m)); }
  broadcast(m, except, fast) { const s = JSON.stringify(m); for (const p of this.players.values()) if (p !== except && p.ready) this.deliver(p, s, fast); }
  drop(p) { if (this.players.delete(p.id)) this.broadcast({ t: 'leave', id: p.id }); }
  onMessage(p, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello': {
        if (p.ready) return;
        p.name = String(m.name || '').replace(/[<>]/g, '').slice(0, 16) || ('Op' + p.id); p.ready = true;
        const players = [...this.players.values()].filter(x => x.ready).map(x => ({ id: x.id, name: x.name, alive: x.alive, state: x.state, k: x.kills, d: x.deaths }));
        this.send(p, { t: 'welcome', id: p.id, players });
        this.broadcast({ t: 'join', id: p.id, name: p.name }, p);
        this.spawn(p);
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
    if (!p.ready || !p.alive) return;
    p.alive = false; p.deaths++;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0, kc = by && !p.credited ? 1 : 0;
    if (kc) this.players.get(by).kills++;
    this.broadcast({ t: 'die', id: p.id, by, kc, part: ['head', 'torso', 'arm', 'leg'].includes(m.part) ? m.part : 'torso', head: !!m.head, gib: m.gib ? 1 : 0, d: Array.isArray(m.d) ? m.d.slice(0, 3).map(Number) : [0, 0, -1], dist: clamp(Math.round(Number(m.dist) || 0), 0, 5000), cause: String(m.cause || '').slice(0, 10) });
    setTimeout(() => { if (this.players.has(p.id) && net.host === this) this.spawn(p); }, 4000);
  }
  // downing someone counts as the kill, once per life
  down(p, m) {
    if (!p.ready || !p.alive || p.credited) return;
    const by = this.players.has(m.by) && m.by !== p.id ? m.by : 0; if (!by) return;
    p.credited = by; this.players.get(by).kills++;
    this.broadcast({ t: 'kill', id: p.id, by });
  }
  spawn(p) { p.hp = 100; p.alive = true; p.state = null; p.credited = 0; this.broadcast({ t: 'spawn', id: p.id, sp: Math.floor(Math.random() * 8) }); }
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
      for (const pl of m.players) { S.score[pl.id] = { k: pl.k || 0, d: pl.d || 0 }; if (pl.id !== m.id) { const r = addRemote(pl.id, pl.name); r.alive = pl.alive; if (pl.state) r.setState(pl.state); } }
      break;
    case 'join': if (m.id !== S.myId) { addRemote(m.id, m.name); feed(esc(m.name) + ' joined'); } break;
    case 'leave': { const r = S.remotes.get(m.id); if (r) { feed(esc(r.name) + ' left'); r.dispose(); S.remotes.delete(m.id); } break; }
    case 's': { const r = S.remotes.get(m.id); if (r) r.setState(m); break; }
    case 'shot': remoteShot(m); break;
    case 'idrop': if (m.it && WEAPONS[m.it.w === undefined ? 0 : m.it.w] && ['gun', 'mag', 'medkit', 'plate'].includes(m.it.kind) && Array.isArray(m.p) && Array.isArray(m.v)) spawnItem(m.it, new V3().fromArray(m.p), new V3().fromArray(m.v), true); break;
    case 'itake': removeItem(m.iid); break;
    case 'hurt':
      if (P.alive && P.anat && Array.isArray(m.p) && Array.isArray(m.d)) {
        const an = P.anat; an.lastBy = m.by; an.lastDir.fromArray(m.wd || [0, 0, -1]); an.lastDist = m.dist || 0;
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
        else if (r && r.alive && r.st) { r.hum.root.updateMatrixWorld(true); spawnRagdoll(r.hum, new V3(), dir, m.part, m.head, { bb: r.st.bb, ls: r.st.ls, lc: r.st.lc, gib: !!m.gib }).owner = { anat: new Anatomy() }; }
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
      if (m.id === S.myId) respawnLocal(spawns[m.sp % spawns.length]);
      else { const r = S.remotes.get(m.id); if (r) { r.alive = true; r.snap = true; r.rag = null; r.st = null; clearWounds(r.hum); r.hum.setLost(0); setHelmet(r.hum, true); } }
      break;
    case 'full': S.closeReason = 'Room is full (12 players max).'; break;
  }
}
function addRemote(id, name) {
  S.names[id] = name;
  let r = S.remotes.get(id); if (r) return r;
  r = new Remote(id, name); S.remotes.set(id, r); return r;
}
let sendAcc = 0;
function netSend(dt) {
  if (S.mode !== 'online' || !net.ready() || !P.alive) return;
  sendAcc += dt; if (sendAcc < 0.05) return; sendAcc = 0;
  const r2 = v => Math.round(v * 100) / 100;
  net.send({
    t: 's', p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], y: r2(P.yaw), pi: r2(P.pitch), l: r2(P.leanEff), c: r2(P.crouch),
    v: r2(P.speed), sp: P.sprinting ? 1 : 0, r: P.reloading ? Math.max(0.01, r2(P.reloadT / P.reloadDur)) : 0,
    w: P.slot === 2 ? MEDKIT_W : P.slot === 3 ? PLATE_W : P.slot === 4 ? 7 : P.weapon, ar: P.anat.helmetOn ? 0 : 1, su: P.slot < 2 && VMW[P.weapon].supp ? 1 : 0, a: r2(P.ads), dn: P.downed ? 1 : 0, bb: P.anat.brokenMask(), ah: P.anat.armHangMask(), ls: P.anat.lostMask(), lc: P.anat.cutArr(), g: P.onGround ? 1 : 0, pr: r2(P.prone), lm: P.anat.bothLegs() ? 1 : (P.anat.legBroken('L') || P.anat.legBroken('R')) ? 0.5 : 0, bl: Math.round(P.anat.bleedRate())
  }, true);
}

