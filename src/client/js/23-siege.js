// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, rnd, scene } from './00-setup.js';
import { addBox, colliders, worldMeshes } from './01-world.js';
import { BOARD_COL, TOWN } from './01b-town.js';
import { vm } from './06-weapons.js';
import { blip, noiseHit } from './10-audio.js';
import { floorAt } from './14-wounds.js';
import { DESTR, dust, spawnDebris } from './15-destruction.js';
import { P, S } from './17-dummies.js';
import { esc, feed, flashMsg, wakeUp } from './18-player.js';
import { DEF_TEAM, net, teamName } from './19-network.js';
import { gadgetAdd } from './27-gadgets.js';
// ---- end module links ----
// ---------------------------------------------------------------- Siege: the bomb, the defuser, boards, reinforcements, revives
// The room decides (19-network HostRoom.sgMsg): who carries the defuser, when it is planted, when it is disabled. This file is
// what each player sees and does: hold F to plant or disable the defuser, board up a window, reinforce a wall, or revive a
// downed teammate; a dropped defuser is picked up by walking over it. Everything held shows what F will do and how far along it is.
const SG = { carrier: null, drop: null, plant: null, rfLeft: 2, act: null, takeT: 0, beepT: 0, markers: [], dropM: null, plantM: null, found: new Set(), findT: 0 };
const SG_REACH = 2.3;
const _sgRay = new THREE.Raycaster(), _sgO = new V3(), _sgD = new V3(), _sgV = new V3();
// the look of what F will make, before it is made: a see-through board or panel, or a ring round a body or a site
const SG_GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, depthWrite: false });
const SG_RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
const sgGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), SG_GHOST_MAT), sgRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), SG_RING_MAT);
sgRing.rotation.x = -Math.PI / 2; sgGhost.visible = sgRing.visible = false; sgGhost.renderOrder = sgRing.renderOrder = 5; scene.add(sgGhost, sgRing);
SG_GHOST_MAT.userData.shared = SG_RING_MAT.userData.shared = true;

// a marker that shows through walls, the same size on screen at any distance
function sgMarker(text, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(text, 64, 32); g.fillStyle = color; g.fillText(text, 64, 32);
  const t = new THREE.CanvasTexture(c), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
  s.scale.set(0.07, 0.035, 1); s.renderOrder = 20; scene.add(s); return s;
}
function sgDisposeMarker(s) { if (!s) return; scene.remove(s); s.material.map.dispose(); s.material.dispose(); }
// the defuser itself: a dark case with a light that blinks once it is running
function sgDefuserModel() {
  const g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a2d2a, roughness: 0.6, metalness: 0.3 }));
  body.position.y = 0.06; g.add(body);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); led.position.set(0.1, 0.125, 0.06); g.add(led); g.userData.led = led;
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 5), body.material); ant.position.set(-0.12, 0.2, -0.07); g.add(ant);
  scene.add(g); return g;
}
function sgDisposeModel(g) { if (!g) return; scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }

// a new round, or the world just built again: the site markers back, nothing planted, two reinforcements to place
function siegeClear() {
  for (const s of SG.markers) sgDisposeMarker(s); SG.markers = [];
  sgDisposeMarker(SG.dropM); SG.dropM = null; sgDisposeModel(SG.plantM); SG.plantM = null; sgDisposeModel(SG.dropG); SG.dropG = null;
  SG.plant = null; SG.drop = null; SG.act = null; SG.carrier = null; sgCand = null; SG.walls = null;
}
function siegeReset() {
  siegeClear(); SG.rfLeft = 2;
  SG.found = new Set();
  for (const s of TOWN.sites) { const m = sgMarker(s.id, '#ffd166'); m.position.copy(s.p).setY(s.p.y + 1.4); m.userData.site = s.id; m.visible = false; SG.markers.push(m); }
}
// the round's state as the room sent it (joining: the boards and reinforcements already up, too)
function siegeRound(m, joining) {
  if (joining || (m.ph === 'live' && !SG.markers.length)) siegeReset();
  SG.carrier = m.dfz || null;
  if (Array.isArray(m.fd)) for (const id of m.fd) SG.found.add(id);
  siegeSetDrop(Array.isArray(m.dz) ? m.dz : null);
  if (m.pl && !SG.plant) siegePlanted(m.pl.site, Number(m.pl.left) || 0);
  if (!m.pl && SG.plant && m.ph !== 'post') { SG.plant = null; sgDisposeModel(SG.plantM); SG.plantM = null; }
  // gadgets already out when you join mid-round
  if (joining && Array.isArray(m.gdw)) for (const g of m.gdw) if (Array.isArray(g) && Array.isArray(g[3]) && g[3].length === 3 && g[3].every(Number.isFinite)) gadgetAdd(g[0], g[1], String(g[2]), new V3().fromArray(g[3]), Number(g[4]) || 0, g[5] === 'r' ? 'r' : 'b');
  if (joining && Array.isArray(m.sgw)) for (const e of m.sgw) if (Array.isArray(e)) e[0] === 'bd' ? boardWindow(e[1] | 0) : e[0] === 'bk' ? boardBreak(e[1] | 0, e[2] | 0, null) : e[0] === 'rf' && reinforceBox(e[1]);
}
function siegeSetDrop(p) {
  sgDisposeMarker(SG.dropM); SG.dropM = null; sgDisposeModel(SG.dropG); SG.dropG = null; SG.drop = null;
  if (!p || !p.every(Number.isFinite)) return;
  SG.drop = new V3().fromArray(p); SG.drop.y = floorAt(SG.drop.x, SG.drop.y + 0.5, SG.drop.z);
  SG.dropG = sgDefuserModel(); SG.dropG.position.copy(SG.drop);
  // (only the attackers are shown where it lies)
  if (S.team[S.myId] === 'r') { SG.dropM = sgMarker('DEFUSER', '#ff8a7a'); SG.dropM.scale.set(0.11, 0.035, 1); SG.dropM.position.copy(SG.drop).setY(SG.drop.y + 0.6); }
}
function siegePlanted(site, left) {
  const s = TOWN.sites.find(x => x.id === site); if (!s) return;
  SG.plant = { site, end: performance.now() + left }; SG.carrier = null;
  sgDisposeModel(SG.plantM); SG.plantM = sgDefuserModel(); SG.plantM.position.copy(s.p).add(new V3(0.35, 0, 0.35));
}
// what the room says happened
function siegeRx(m) {
  switch (m.a) {
    case 'rv': reviveMe(m.by); break;
    case 'carrier': SG.carrier = m.id; siegeSetDrop(null); if (m.id === S.myId) flashMsg('YOU HAVE THE DEFUSER<small>Plant it at bomb site A or B</small>', 2500); break;
    case 'drop': SG.carrier = null; siegeSetDrop(Array.isArray(m.p) ? m.p : null); if (S.team[S.myId] === 'r') feed('<span style="color:#ffd166">The defuser was dropped</span>'); break;
    case 'plant': siegePlanted(m.site, Number(m.left) || 45000); feed(teamName(m.by) + ' <span style="color:#ffd166">planted the defuser at ' + esc(String(m.site)) + '</span>'); noiseHit(900, 0.1, 0.06); break;
    case 'found': if (!SG.found.has(m.site)) { SG.found.add(m.site); if (S.team[S.myId] === 'r') feed(teamName(m.by) + ' <span style="color:#ffd166">found bomb site ' + esc(String(m.site)) + '</span>'); } break;
    case 'bd': boardWindow(m.i | 0); break;
    case 'bk': boardBreak(m.i | 0, m.k | 0, null); break;
    case 'rf': reinforceBox(m.b); break;
  }
}

// ---- boards and reinforcements
// three planks across the opening, with slits between them to see (and shoot) through. Plywood: shot or blown apart like any
function boardWindow(i) {
  const w = TOWN.windows[i]; if (!w || w.boarded) return; w.boarded = true; w.boards = [];
  const h = (w.y1 - w.y0 - 0.1) / 3;
  for (let k = 0; k < 3; k++) {
    const y = w.y0 + 0.02 + k * (h + 0.04);
    if (w.ax === 'x') addBox(w.p.x, y, w.p.z, w.w + 0.14, h, 0.04, 'plywood', BOARD_COL); else addBox(w.p.x, y, w.p.z, 0.04, h, w.w + 0.14, 'plywood', BOARD_COL);
    const m = worldMeshes[worldMeshes.length - 1]; m.userData.board = i; w.boards.push(m);
  }
}
// one plank of a boarded window breaks off in pieces (bashed, or someone else's bash coming in over the network)
function boardBreak(i, k, d) {
  const w = TOWN.windows[i]; if (!w || !w.boards || !w.boards[k]) return;
  const m = w.boards[k]; w.boards[k] = null;
  const bx = m.userData.box, gp = m.geometry.parameters, c = m.position.clone(), dir = d ? d.clone() : new V3(0, 0, 1);
  const wi = worldMeshes.indexOf(m); if (wi >= 0) worldMeshes.splice(wi, 1); const ci = colliders.indexOf(bx); if (ci >= 0) colliders.splice(ci, 1);
  m.removeFromParent(); if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } m.geometry.dispose();
  const long = Math.max(gp.width, gp.depth), n = 3 + Math.floor(Math.random() * 2);
  for (let j = 0; j < n; j++) {
    const off = (j + 0.5) / n - 0.5, p = c.clone(); if (gp.width > gp.depth) p.x += off * long; else p.z += off * long;
    spawnDebris(p, 1, dir.clone().add(new V3(rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3))).normalize(), 0.3, rnd(2, 4), DESTR.plywood, 0, [long / n * rnd(0.8, 1), gp.height * rnd(0.7, 1), 0.035]);
  }
  spawnDebris(c, 8, dir, 0.6, rnd(2, 4), DESTR.plywood, 0.02); dust(c, dir, DESTR.plywood.dust, 0.6, 0.5, 1.4); noiseHit(rnd(700, 1000), 0.12, 0.6);
  if (w.boards.every(b => !b)) { w.boarded = false; w.boards = []; }
}
// a steel panel bolted over a stretch of wall: rounds and grenades don't go through it; a charge right on it tears it off
function reinforceBox(b) {
  if (!Array.isArray(b) || b.length !== 6 || !b.every(Number.isFinite)) return;
  addBox(b[0], b[1], b[2], b[3], b[4], b[5], 'metal', 0x6a7078); const m = worldMeshes[worldMeshes.length - 1]; m.userData.reinf = true;
}
// the panel a reinforcement would make on the wall mesh m, hit at point p from the side the camera is on
function reinfPanel(m, p) {
  const bx = m.userData.box, alongX = bx.max.x - bx.min.x > bx.max.z - bx.min.z, L = alongX ? bx.max.x - bx.min.x : bx.max.z - bx.min.z;
  if (bx.max.y - bx.min.y < 2.6 || L < 0.6) return null;
  const w = Math.min(1.4, L), u0 = alongX ? bx.min.x : bx.min.z, u = clamp(alongX ? p.x : p.z, u0 + w / 2, u0 + L - w / 2);
  const side = Math.sign((alongX ? camera.position.z - (bx.min.z + bx.max.z) / 2 : camera.position.x - (bx.min.x + bx.max.x) / 2)) || 1;
  const face = side > 0 ? (alongX ? bx.max.z : bx.max.x) : (alongX ? bx.min.z : bx.min.x), c = face + side * 0.03;
  const b = alongX ? [u, bx.min.y, c, w, bx.max.y - bx.min.y, 0.05] : [c, bx.min.y, u, 0.05, bx.max.y - bx.min.y, w];
  // not over another panel
  for (const o of worldMeshes) if (o.userData.reinf) { const ob = o.userData.box; if (Math.abs((ob.min.x + ob.max.x) / 2 - b[0]) < (ob.max.x - ob.min.x + b[3]) / 2 - 0.02 && Math.abs((ob.min.z + ob.max.z) / 2 - b[2]) < (ob.max.z - ob.min.z + b[5]) / 2 - 0.02 && Math.abs(ob.min.y - b[1]) < 1) return null; }
  return b.map(v => Math.round(v * 1000) / 1000);
}
// a charge on (or right by) a panel tears it away. Every machine works this out itself from the same blast
function siegeBlast(p, W) {
  if (W < 0.5) return;
  for (let i = worldMeshes.length - 1; i >= 0; i--) {
    const m = worldMeshes[i]; if (!m.userData.reinf) continue; const bx = m.userData.box;
    const q = _sgV.set(clamp(p.x, bx.min.x, bx.max.x), clamp(p.y, bx.min.y, bx.max.y), clamp(p.z, bx.min.z, bx.max.z));
    if (q.distanceTo(p) > 0.6) continue;
    worldMeshes.splice(i, 1); const ci = colliders.indexOf(bx); if (ci >= 0) colliders.splice(ci, 1);
    m.removeFromParent(); m.geometry.dispose(); m.material.map && m.material.map.dispose(); m.material.dispose();
    if (net.mode === 'host' && net.host && net.host.R) { const R = net.host.R, c = [(bx.min.x + bx.max.x) / 2, bx.min.y, (bx.min.z + bx.max.z) / 2]; R.sgw = R.sgw.filter(e => !(e[0] === 'rf' && Math.abs(e[1][0] - c[0]) < 0.01 && Math.abs(e[1][1] - c[1]) < 0.01 && Math.abs(e[1][2] - c[2]) < 0.01)); }
    noiseHit(500, 0.2, 0.15);
  }
}

// ---- revives
// a teammate held F over you: the bleeding is stopped and bound up, the pain dulled, and if your legs and spine still work you get up
function reviveMe(by) {
  if (!P.alive || !P.downed || P.fatal) return;
  const an = P.anat; an.treat(); an.blood = Math.max(an.blood, 3400); an.koT = 0; an.painDown = false; an.shock = 0; P.forceDown = false;
  if (!an.isDowned()) wakeUp();
  flashMsg('REVIVED<small>' + esc(S.names[by] || 'A teammate') + ' patched you up' + (an.isDowned() ? ', but you still cannot stand' : '') + '</small>', 2500);
}

// ---- what F would do here, now
function siegeCandidate() {
  if (S.mode !== 'online' || !S.R || !P.alive || P.downed || P.mantle) return null;
  const my = S.team[S.myId], live = S.R.ph === 'live';
  const o = camera.getWorldPosition(_sgO), dir = camera.getWorldDirection(_sgD);
  // a downed teammate at your feet
  for (const [id, r] of S.remotes) {
    if (!r.rag || !r.alive || r.fatal || S.team[id] !== my) continue;
    const pc = r.rag.p[2]; if (pc.distanceTo(P.pos) > 2.2) continue;
    const to = _sgV.copy(pc).sub(o).normalize(); if (to.dot(dir) < 0.82) continue;
    return { key: 'rv' + id, label: 'Revive ' + esc(r.name), time: 4, ring: pc, go: () => net.send({ t: 'sg', a: 'rv', to: id }) };
  }
  if (live) {
    // the defuser onto a site (whoever carries it), or off one (a defender)
    for (const s of TOWN.sites) {
      if (Math.abs(s.p.y - P.pos.y) > 1.2 || Math.hypot(s.p.x - P.pos.x, s.p.z - P.pos.z) > 2) continue;
      if (SG.carrier === S.myId && !SG.plant) return P.defOut ? { key: 'pl' + s.id, label: 'Plant the defuser on bomb ' + s.id, time: 5, ring: s.p, go: () => net.send({ t: 'sg', a: 'plant', site: s.id }) }
        : { key: 'pq' + s.id, label: 'Take out the defuser (5), then plant it', time: Infinity, ring: s.p, go: () => {} };
      if (my === DEF_TEAM && SG.plant && SG.plant.site === s.id) return { key: 'ds' + s.id, label: 'Disable the defuser', time: 6, ring: s.p, go: () => net.send({ t: 'sg', a: 'disable' }) };
    }
  }
  if (my !== DEF_TEAM) return null;
  // a window looked at, from close: board it up
  for (let i = 0; i < TOWN.windows.length; i++) {
    const w = TOWN.windows[i]; if (w.boarded || w.p.distanceTo(o) > 2.6) continue;
    const n = w.ax === 'x' ? 'z' : 'x', u = w.ax, dn = dir[n]; if (Math.abs(dn) < 1e-3) continue;
    const t = (w.p[n] - o[n]) / dn; if (t < 0 || t > 2.2) continue;
    const hu = o[u] + dir[u] * t, hy = o.y + dir.y * t;
    if (Math.abs(hu - w.p[u]) > w.w / 2 + 0.05 || hy < w.y0 - 0.05 || hy > w.y1 + 0.05) continue;
    const b = w.ax === 'x' ? [w.p.x, (w.y0 + w.y1) / 2, w.p.z, w.w + 0.14, w.y1 - w.y0, 0.05] : [w.p.x, (w.y0 + w.y1) / 2, w.p.z, 0.05, w.y1 - w.y0, w.w + 0.14];
    return { key: 'bd' + i, label: 'Board up the window', time: 2.5, go: () => { boardWindow(i); net.send({ t: 'sg', a: 'bd', i }); } };
  }
  // a wall of the house looked at: reinforce it
  if (SG.rfLeft > 0) {
    _sgRay.set(o, dir); _sgRay.far = SG_REACH; _sgRay.firstHitOnly = true;
    if (!SG.walls || SG.wallsN !== worldMeshes.length) { SG.wallsN = worldMeshes.length; SG.walls = worldMeshes.filter(m => m.userData.house !== undefined || m.userData.board !== undefined || m.userData.reinf || m.userData.door); }
    const h = _sgRay.intersectObjects(SG.walls, false)[0]; _sgRay.firstHitOnly = false;
    if (h && h.object.userData.house !== undefined && h.object.userData.kind === 'drywall') {
      const b = reinfPanel(h.object, h.point);
      if (b) return { key: 'rf' + b.join(','), label: 'Reinforce the wall (' + SG.rfLeft + ' left)', time: 3, go: () => { reinforceBox(b); SG.rfLeft--; net.send({ t: 'sg', a: 'rf', b }); } };
    }
  }
  return null;
}
let sgCand = null;
// F pressed: starts holding whatever is there (true: it was ours, the door and pick-up code leave it alone)
function siegeKeyDown(prio) { const c = siegeCandidate(); if (!c || (prio && !/^(rv|pl|ds)/.test(c.key))) return false; SG.act = Object.assign({ t: 0 }, c); return true; }
function siegeKeyUp() { SG.act = null; }
function siegeHint() {
  const c = SG.act || sgCand; if (!c) return '';
  const k = SG.act ? clamp(SG.act.t / SG.act.time, 0, 1) : 0;
  return '<b>F</b> Hold to ' + c.label.charAt(0).toLowerCase() + c.label.slice(1) + '<div class="hb"><i style="width:' + Math.round(k * 100) + '%"></i></div>';
}
// the defuser in your hands (slot 5)
let sgVmDef = null;
function siegeUpdate(dt) {
  if (!sgVmDef) { sgVmDef = sgDefuserModel(); scene.remove(sgVmDef); sgVmDef.position.set(0.17, -0.25, -0.42); sgVmDef.rotation.set(0.5, -0.4, 0); sgVmDef.scale.setScalar(0.9); vm.add(sgVmDef); }
  sgVmDef.visible = !!(S.mode === 'online' && P.alive && !P.downed && P.defOut && P.slot === 4 && SG.carrier === S.myId);
  if (P.defOut && SG.carrier !== S.myId) P.defOut = false;
  if (S.mode !== 'online' || !S.R) { sgGhost.visible = sgRing.visible = false; return; }
  // (what F would do is looked for ten times a second, not every frame)
  SG.candT = (SG.candT || 0) - dt; if (SG.candT <= 0 || SG.act) { SG.candT = 0.1; sgCand = siegeCandidate(); }
  // a hold carries on while it is still what F would do, and you are not running off
  if (SG.act) {
    if (!sgCand || sgCand.key !== SG.act.key || P.speed > 1.6) SG.act = null;
    else { SG.act.t += dt; if (SG.act.t >= SG.act.time) { const a = SG.act; SG.act = null; a.go(); blip(700, 0.04, 0.05); } }
  }
  // the selection: what F will make or who it will help, lit up where it will be
  const c = SG.act || sgCand;
  sgGhost.visible = !!(c && c.ghost); if (sgGhost.visible) { const g = c.ghost; sgGhost.position.set(g[0], g[1], g[2]); sgGhost.scale.set(g[3], g[4], g[5]); }
  sgRing.visible = !!(c && c.ring); if (sgRing.visible) { sgRing.position.set(c.ring.x, (c.ring.y < 0.6 ? floorAt(c.ring.x, c.ring.y + 0.5, c.ring.z) : c.ring.y) + 0.03, c.ring.z); const k = 1 + Math.sin(performance.now() / 160) * 0.06; sgRing.scale.set(k, k, k); }
  // the bomb sites: the defenders know where they are; the attackers have to find them (in sight, close enough to see what it
  // is), and once one of them has, the rest of the team sees it marked too
  const my = S.team[S.myId];
  for (const m of SG.markers) m.visible = S.R.ph !== 'lobby' && (my === DEF_TEAM || SG.found.has(m.userData.site));
  SG.findT -= dt;
  if (my === 'r' && P.alive && S.R.ph === 'live' && SG.findT <= 0) {
    SG.findT = 0.3; const o = camera.getWorldPosition(_sgO), dir = camera.getWorldDirection(_sgD);
    for (const s of TOWN.sites) {
      if (SG.found.has(s.id)) continue; const to = _sgV.copy(s.p).setY(s.p.y + 0.35).sub(o), d = to.length(); if (d > 9 || to.normalize().dot(dir) < 0.55) continue;
      _sgRay.set(o, to); _sgRay.far = d; _sgRay.firstHitOnly = true; const h = _sgRay.intersectObjects(worldMeshes, false)[0]; _sgRay.firstHitOnly = false;
      if (!h || h.distance > d - 0.5) { SG.found.add(s.id); net.send({ t: 'sg', a: 'found', site: s.id }); feed('<span style="color:#ffd166">You found bomb site ' + s.id + '</span>'); }
    }
  }
  // the defuser lying where its carrier fell: an attacker walking over it picks it up
  SG.takeT -= dt;
  if (SG.drop && P.alive && !P.downed && S.team[S.myId] === 'r' && SG.takeT <= 0 && SG.drop.distanceTo(P.pos) < 1.3) { SG.takeT = 1; net.send({ t: 'sg', a: 'take' }); }
  // the planted defuser: its light blinks and it beeps, faster as it runs down
  if (SG.plant && SG.plantM) {
    const left = Math.max(0, SG.plant.end - performance.now()) / 1000, per = left > 15 ? 1 : left > 5 ? 0.5 : 0.25;
    SG.beepT -= dt; SG.plantM.userData.led.visible = SG.beepT > per * 0.6;
    if (SG.beepT <= 0) { SG.beepT = per; const d = SG.plantM.position.distanceTo(camera.position); if (d < 30) blip(1800, 0.05, 0.05 / (1 + d * 0.15)); }
  }
}

// ---- module exports: build.mjs strips this block ----
export { SG, boardBreak, boardWindow, reinforceBox, sgDisposeMarker, sgMarker, siegeBlast, siegeClear, siegeHint, siegeKeyDown, siegeKeyUp, siegeReset, siegeRound, siegeRx, siegeUpdate };
// ---- end module exports ----
