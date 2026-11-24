// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, lerp, rnd, scene } from './00-setup.js';
import { canvasTex, colliders, worldGroup, worldMeshes } from './01-world.js';
import { decoMat } from './01b-town.js';
import { STRUCTS, hitToFrame } from './05-anatomy.js';
import { laserBeam } from './09-attachments.js';
import { blip, noiseHit } from './10-audio.js';
import { impactFx } from './11-fx.js';
import { DESTR_OF, gridOpenW } from './15-destruction.js';
import { doorDent, doorLaunch, doorNet, hingeOff, knobOff } from './15b-doors.js';
import { P, S, dummies, mouse } from './17-dummies.js';
import { PITCH_MIN, flashMsg, hurtFlash, selectEmpty } from './18-player.js';
import { DEF_TEAM, net } from './19-network.js';
import { boomL, boomLight, explSeq, explode, los, r3, r4x } from './19b-explosives.js';
import { TV, bashBoard, meleeWall, punchMark, seg } from './19c-toolvm.js';
import { screenBlood } from './21b-screenfx.js';
import { sgDisposeMarker, sgMarker } from './23-siege.js';
import { matchFrozen } from './28-match.js';
import { flashHit } from './29-eyes.js';
import { boxHit } from './30-structure.js';
// ---- end module links ----
// ---------------------------------------------------------------- gadgets
// Slot 3 holds a gadget, slot 4 a throwable, slot 6 a breaching tool (attackers), plus headgear: picked in the loadout.
// Attackers: C4 (breach), a claymore (a tripwire laser; it throws its steel forward at whoever walks into it), smoke grenades
// (a thick cloud for 20 s), flashbangs (blinding and deafening if you see or are close to them).
// Defenders: bear traps (hidden-ish on the floor; they hold the leg of whoever steps in, and hurt), barbed wire (slow, noisy and
// painful to go through), a deployable steel shield (cover that stops rounds), proximity alarms (they shriek and mark whoever
// comes near, for the defenders), frags and flashbangs.
// A placed gadget goes out to everyone ('x' 'gd'); what sets one off is worked out by whoever walks into it ('x' 'gdx').
const GADGETS = {
  // breaching (attackers only): its own slot (6)
  c4: { name: 'C4 (M112)', team: 'r', slot: 'b', n: 2, desc: 'stick it, set it off: walls, doors, floors' },
  sledge: { name: 'Sledgehammer', team: 'r', slot: 'b', n: 0, desc: 'smash through boards, plywood, drywall, doors' },
  // gadgets (3)
  claymore: { name: 'Claymore', team: 'r', slot: 2, n: 1, desc: 'laser tripwire, blasts forward' },
  beartrap: { name: 'Bear trap', team: 'b', slot: 2, n: 3, desc: 'snaps on the leg and takes them down' },
  wire: { name: 'Barbed wire', team: 'b', slot: 2, n: 2, desc: 'slows, cuts and rattles' },
  shield: { name: 'Deployable shield', team: 'b', slot: 2, n: 1, desc: 'steel cover that stops rounds' },
  alarm: { name: 'Proximity alarm', team: 'b', slot: 2, n: 2, desc: 'shrieks and marks attackers nearby' },
  // throwables (4)
  frag: { name: 'M67 frag', team: 'rb', slot: 3, n: 2, desc: 'fragmentation grenade' },
  smoke: { name: 'M18 smoke', team: 'r', slot: 3, n: 2, desc: 'a thick cloud for 20 s; chokes without a mask' },
  flash: { name: 'M84 flashbang', team: 'rb', slot: 3, n: 2, desc: 'blinds and deafens' },
  teargas: { name: 'CS tear gas', team: 'r', slot: 3, n: 2, desc: 'burning gas: blinds, chokes; a mask stops it' }
};
// what you wear on your head (loadout)
const HEADGEAR = {
  none: { name: 'Nothing', desc: 'full view' },
  gasmask: { name: 'Gas mask (M50)', desc: 'smoke and tear gas do nothing to you; the view is narrowed by the lenses' },
  nvg: { name: 'Night vision (PVS-14)', desc: 'N to flip it down: green, grainy, sees in the dark and sees laser beams' }
};
const GD = [], SMOKES = [];
const gdKey = (o, i) => o + ':' + i;
const _gdV = new V3(), _gdV2 = new V3(), _gdRay = new THREE.Raycaster();
function gdMat(c) { return decoMat(c); }
// ---------------------------------------------------------------- models (placed in the world, and held in the hand)
function gdModel(k) {
  const g = new THREE.Group(), box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gdMat(c)); m.position.set(x || 0, (y || 0) + h / 2, z || 0); m.castShadow = true; g.add(m); return m; };
  const cyl = (r, h, c, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 14), gdMat(c)); m.position.set(x || 0, (y || 0) + h / 2, z || 0); m.castShadow = true; g.add(m); return m; };
  if (k === 'beartrap') {
    const jawM = gdMat(0x5a5650), ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 20), jawM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.015; g.add(ring);
    g.userData.jaws = [];
    for (const s of [-1, 1]) { const j = new THREE.Group(); j.position.set(0, 0.015, 0); const a = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.01, 5, 14, Math.PI), jawM); a.rotation.x = Math.PI / 2; a.rotation.z = s < 0 ? 0 : Math.PI; j.add(a);
      for (let t = 0; t < 7; t++) { const an = (t + 0.5) / 7 * Math.PI * (s < 0 ? 1 : -1), c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 4), jawM); c.position.set(Math.cos(an) * 0.19, 0.02, Math.sin(an) * 0.19 * s * -1); j.add(c); }
      g.add(j); g.userData.jaws.push(j); }
    box(0.08, 0.02, 0.08, 0x3a3a36); box(0.3, 0.012, 0.03, 0x4a4842, 0.24, 0, 0);   // trigger pan and the spring arm
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 4, 8), jawM); chain.position.set(0.42, 0.006, 0); chain.rotation.x = Math.PI / 2; g.add(chain);
  } else if (k === 'wire') {
    const wm = gdMat(0x8a8a86);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.006, 4, 18), wm); c.position.set(-1.05 + i * 0.42, 0.28, 0); c.rotation.y = Math.PI / 2 + rnd(-0.2, 0.2); c.rotation.z = rnd(-0.2, 0.2); g.add(c); }
    for (const x of [-1.2, 0, 1.2]) box(0.03, 0.55, 0.03, 0x4a3a2a, x, 0, 0);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 2.4, 4), wm); line.rotation.z = Math.PI / 2; line.position.y = 0.45; g.add(line);
  } else if (k === 'alarm') {
    box(0.12, 0.07, 0.08, 0x2a2e2a); box(0.02, 0.02, 0.02, 0x111111, -0.03, 0.07, 0.03);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0x30ff60 })); led.position.set(0.035, 0.075, 0.03); g.add(led); g.userData.led = led;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 4), gdMat(0x111111)); ant.position.set(-0.05, 0.13, -0.03); g.add(ant);
  } else if (k === 'claymore') {
    // M18A1: curved olive case, "FRONT TOWARD ENEMY", two pairs of scissor legs, a sight on top, the detonator well
    const m = box(0.216, 0.083, 0.035, 0x4a5a32, 0, 0.08, 0); m.rotation.x = 0.1;
    box(0.04, 0.012, 0.012, 0x2a2e22, 0, 0.165, 0); box(0.016, 0.02, 0.016, 0x2a2e22, 0.06, 0.163, 0.004);
    for (const x of [-0.08, 0.08]) for (const z of [-0.03, 0.03]) box(0.008, 0.09, 0.008, 0x2a2a2a, x, 0, z);
    const las = new THREE.Mesh(laserBeam.geometry, laserBeam.material); las.scale.set(1, 2.6, 1); las.rotation.x = -Math.PI / 2 + 0.06; las.position.set(0, 0.16, -1.3); las.userData.laser = true; g.add(las);
  } else if (k === 'shield') {
    // a steel panel on two folding legs, a vision slot near the top: built facing along -z, turned to where it was placed
    const pm = gdMat(0x4a5058); const pl = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.07), pm); pl.position.y = 0.525; pl.castShadow = true; g.add(pl);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.075), gdMat(0x111111)); sl.position.set(0, 0.86, 0); g.add(sl);
    for (const x of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), gdMat(0x2a2e32)); l.position.set(x, 0.22, 0.22); l.rotation.x = 0.55; g.add(l); }
    g.userData.plate = pl;
  } else if (k === 'bcharge') {
    // a frame charge: a strip of explosive on a foam frame, a detonator box with a countdown light
    box(0.6, 0.6, 0.025, 0x3a3f2a); for (const y of [0.02, 0.56]) box(0.6, 0.04, 0.03, 0x9a8a4a, 0, y, 0.003); for (const x of [-0.28, 0.28]) box(0.04, 0.6, 0.03, 0x9a8a4a, x, 0, 0.003);
    box(0.09, 0.06, 0.04, 0x1a1a1a, 0, 0.27, 0.025);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 })); led.position.set(0.025, 0.315, 0.05); g.add(led); g.userData.led = led;
  } else if (k === 'sledge') {
    // 10 lb sledge: hickory handle, forged head
    // (the head runs front to back: one striking face leads, the other trails)
    cyl(0.016, 0.82, 0x8a6a42, 0, 0, 0, 8); const h = box(0.07, 0.07, 0.19, 0x3a3c40, 0, 0.79, 0);
    for (const z of [-0.098, 0.098]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.076, 0.012), gdMat(0x6a6c70)); f.position.set(0, 0.825, z); g.add(f); }
    box(0.04, 0.12, 0.04, 0x1a1a1a, 0, 0, 0);   // grip
  } else if (k === 'smoke' || k === 'teargas' || k === 'flash') {
    // M18 smoke (olive can, coloured top band), CS (grey can, red band), M84 (perforated steel tube): held and thrown models
    const body = k === 'flash' ? 0x5a5c58 : k === 'teargas' ? 0x6a6e66 : 0x4f5733, band = k === 'teargas' ? 0xa02020 : k === 'smoke' ? 0xd8d8d8 : 0x3a3a3a;
    cyl(0.03, 0.115, body, 0, -0.06, 0, 16); cyl(0.031, 0.012, band, 0, 0.04, 0, 16);
    if (k === 'flash') for (let r = 0; r < 3; r++) for (let a = 0; a < 6; a++) { const hm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 6), gdMat(0x111111)); const an = a / 6 * Math.PI * 2; hm.position.set(Math.cos(an) * 0.029, -0.04 + r * 0.03, Math.sin(an) * 0.029); hm.rotation.z = Math.PI / 2; hm.rotation.y = -an; g.add(hm); }
    cyl(0.012, 0.02, 0x5c5e58, 0, 0.055, 0, 10);
    box(0.012, 0.075, 0.014, 0x6a6c66, 0.028, -0.005, 0);   // spoon
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0014, 6, 18), gdMat(0xb8b8b0)); ring.position.set(-0.03, 0.062, 0); g.add(ring);
  }
  return g;
}
// one placed: kept in GD. The shield is a solid steel panel, faced the way it was set down (its collision is a row of boxes
// along it, so it can stand at any angle)
function gadgetAdd(owner, id, k, p, yaw, team) {
  if (!GADGETS[k] || GD.some(o => o.key === gdKey(owner, id))) return;
  const o = { key: gdKey(owner, id), owner, id, k, p: p.clone(), yaw, team, t: 0, sprung: false, cd: 0 };
  o.g = gdModel(k); o.g.position.copy(p); o.g.rotation.y = yaw; worldGroup.add(o.g);
  if (k === 'shield') {
    const pl = o.g.userData.plate; o.g.updateMatrixWorld(true);
    pl.userData.kind = 'metal'; pl.userData.surf = 'metal'; pl.userData.gadget = o.key; pl.userData.box = (() => { const bs = shieldBoxes(p, yaw), b = { min: bs[0].min.clone(), max: bs[0].max.clone(), mesh: pl }; for (const q of bs) { b.min.min(q.min); b.max.max(q.max); } return b; })(); worldMeshes.push(pl); o.mesh = pl;
    o.segs = shieldBoxes(p, yaw); for (const c of o.segs) { c.mesh = pl; colliders.push(c); }
  }
  if (k === 'bcharge') { o.fuse = 3; noiseHit(1800, 0.05, 0.05); }
  GD.push(o); return o;
}
// the shield's footprint: four boxes along the panel (the plate's own box, for the penetration code, is all four together)
function shieldBoxes(p, yaw) {
  const f = new V3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new V3(Math.cos(yaw), 0, -Math.sin(yaw)), out = [];
  for (let i = 0; i < 4; i++) {
    const a = p.clone().addScaledVector(r, -0.525 + i * 0.2625), b = p.clone().addScaledVector(r, -0.525 + (i + 1) * 0.2625);
    const min = new V3(Math.min(a.x, b.x), p.y, Math.min(a.z, b.z)).addScaledVector(new V3(Math.abs(f.x), 0, Math.abs(f.z)), -0.04), max = new V3(Math.max(a.x, b.x), p.y + 1.05, Math.max(a.z, b.z)).addScaledVector(new V3(Math.abs(f.x), 0, Math.abs(f.z)), 0.04);
    out.push({ min, max });
  }
  return out;
}
// a gadget's own geometry and materials go with it (the shared ones, the laser's and the deco colours, stay)
function gdDispose(g) {
  g.traverse(x => {
    if (x.geometry && !x.isSprite && x.geometry !== laserBeam.geometry) x.geometry.dispose();
    const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    for (const m of ms) if (m !== laserBeam.material && !(m.userData && m.userData.shared)) { if (m.map && m.map !== SMOKE_TEX && !(m.map.userData && m.map.userData.shared)) m.map.dispose(); m.dispose(); }
  });
}
function gadgetRemove(o) {
  const i = GD.indexOf(o); if (i >= 0) GD.splice(i, 1);
  if (o.mesh) { const j = worldMeshes.indexOf(o.mesh); if (j >= 0) worldMeshes.splice(j, 1); }
  if (o.segs) for (const c of o.segs) { const j = colliders.indexOf(c); if (j >= 0) colliders.splice(j, 1); }
  if (o.g) { o.g.removeFromParent(); gdDispose(o.g); }
  if (o.marker) sgDisposeMarker(o.marker);
}
function clearGadgets() { while (GD.length) gadgetRemove(GD[0]); for (const s of SMOKES) { s.g.removeFromParent(); gdDispose(s.g); } SMOKES.length = 0; P.trapped = null; gadgetGhostOff(); }
// a blast near one: it is wrecked (worked out the same everywhere)
function gadgetBlast(p, W) { if (W < 0.1) return; for (const o of GD.slice()) if (o.k !== 'bcharge' && o.p.distanceTo(p) < 1.1 * Math.cbrt(W) + 0.4) gadgetRemove(o); }

// ---- placing one: where you look. Traps, wire, the shield and the claymore on the floor; the alarm on a floor or a wall;
// the breach charge flat on a wall or a door. A ghost shows it, red where it can't go (the shield into a wall, say).
let gdGhost = null, gdGhostK = '';
const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, depthWrite: false }), GHOST_NO = new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.28, depthWrite: false });
GHOST_OK.userData.shared = GHOST_NO.userData.shared = true;
function gdCount(k) { return P.gN; }
function updateGadget(dt, kk) {
  if (typeof TV !== 'undefined' && TV.c4) TV.c4.visible = false;
  const k = kk || P.tool2, G = GADGETS[k]; if (!G) return;
  if (gdCount(k) <= 0) { selectEmpty(kk ? 5 : 2); return; }
  const o = camera.getWorldPosition(new V3()), d = camera.getWorldDirection(new V3());
  _gdRay.set(o, d); _gdRay.far = 3; _gdRay.firstHitOnly = true; const h = _gdRay.intersectObjects(worldMeshes, false)[0]; _gdRay.firstHitOnly = false;
  let ok = false, at = null, n = null, yaw = P.yaw;
  if (h && h.face) {
    n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    const floor = n.y > 0.7, wall = Math.abs(n.y) < 0.3;
    if (k === 'bcharge' ? wall : k === 'alarm' ? floor || wall : floor) { ok = true; at = h.point.clone().addScaledVector(n, 0.005); }
    if (ok && wall && (k === 'bcharge' || k === 'alarm')) yaw = Math.atan2(n.x, n.z);
  }
  // the shield: never into a wall, a door or another gadget
  if (ok && k === 'shield') for (const c of shieldBoxes(at, yaw)) { c.min.y += 0.05; if (colliders.some(q => q.max.x > c.min.x && q.min.x < c.max.x && q.max.z > c.min.z && q.min.z < c.max.z && q.max.y > c.min.y && q.min.y < c.max.y)) { ok = false; break; } }
  if (gdGhostK !== k) { if (gdGhost) { gdGhost.removeFromParent(); gdDispose(gdGhost); } gdGhost = gdModel(k); gdGhost.traverse(x => { if (x.isMesh && !x.userData.laser) { if (x.material && !(x.material.userData && x.material.userData.shared)) x.material.dispose(); x.material = GHOST_OK; x.castShadow = false; } else if (x.userData.laser) x.visible = false; }); scene.add(gdGhost); gdGhostK = k; }
  const show = !!at && P.alive && !matchFrozen();
  gdGhost.visible = show;
  if (show) { gdGhost.position.copy(at); gdGhost.rotation.set(0, yaw, 0); gdGhost.traverse(x => { if (x.isMesh && !x.userData.laser) x.material = ok ? GHOST_OK : GHOST_NO; }); }
  if (ok && mouse.left && P.semiReady && P.switchT <= 0 && S.locked && !matchFrozen() && (S.mode !== 'online' || (S.R && S.R.ph === 'live'))) {
    P.semiReady = false;
    const id = explSeq++, team = S.mode === 'online' ? S.team[S.myId] : 'r';
    gadgetAdd(S.myIdOr0(), id, k, at, yaw, team); if (k === 'bcharge') P.bcN--; else P.gN--; noiseHit(420, 0.08, 0.06);
    if (S.mode === 'online') net.send({ t: 'x', a: 'gd', k, i: id, p: at.toArray().map(r3), f: r3(yaw), c: team === 'r' ? 1 : 2 });
  }
}
function gadgetGhostOff() { if (gdGhost) gdGhost.visible = false; }

// ---- the sledgehammer (breach slot): LMB swings it. A big, slow, blunt blow: boards come off, plywood and drywall cave in
// (two or three swings opens a hole you can walk through), wooden doors come off their hinges, metal doors dent, people
// are hit very hard
function updateSledge(dt) {
  const Sg = P.sledge || (P.sledge = { t: 0, ph: 'idle' });
  if (Sg.ph === 'idle') { if (mouse.left && P.semiReady && P.switchT <= 0 && S.locked && !matchFrozen() && P.stun <= 0) { P.semiReady = false; Sg.ph = 'swing'; Sg.t = 0; Sg.hit = false; noiseHit(300, 0.25, 0.06); } return; }
  Sg.t += dt;
  // the wind-up drags the view back and up a little; the blow comes down fast and the whole body goes with it
  if (Sg.t < 0.45) { P.pitch = clamp(P.pitch + dt * 0.12, PITCH_MIN, 1.5); }
  else if (Sg.t < 0.56) { P.pitch = clamp(P.pitch - dt * 0.55, PITCH_MIN, 1.5); P.recShake = Math.min(0.08, (P.recShake || 0) + dt * 0.1); if (!Sg.whoosh) { Sg.whoosh = true; noiseHit(700, 0.12, 0.12); } }
  if (!Sg.hit && Sg.t > 0.55) { Sg.hit = true; sledgeLand(); }
  if (Sg.t > 1.3) { Sg.ph = 'idle'; Sg.t = 0; Sg.whoosh = false; }
}
function sledgeK() { const Sg = P.sledge; if (!Sg || Sg.ph !== 'swing') return 0; const t = Sg.t; return t < 0.45 ? -Math.sin(t / 0.45 * Math.PI / 2) : t < 0.56 ? -1 + (t - 0.45) / 0.11 * 2.3 : 1.3 - (t - 0.56) / 0.74 * 1.3; }
function sledgeLand() {
  const q = camera.quaternion, d = new V3(0, 0, -1).applyQuaternion(q), o = camera.position.clone();
  const tg = worldMeshes.slice();
  for (const dm of dummies) { if (!dm.rag && dm.hum.root.visible) { dm.hum.root.updateMatrixWorld(true); tg.push(...dm.hum.hitMeshes.filter(m => m.visible)); } }
  if (S.remotes) for (const r of S.remotes.values()) if (r.hum && r.hum.root.visible && r.alive) tg.push(...r.hum.hitMeshes.filter(m => m.visible));
  _gdRay.set(o, d); _gdRay.far = 1.7;
  const h = _gdRay.intersectObjects(tg, false).find(x => !(x.object.userData.grid && gridOpenW(x.object, x.point.clone().addScaledVector(d, 0.01))));
  P.kick += 2; P.recShake = Math.min(0.08, (P.recShake || 0) + 0.07);
  if (!h) return;
  // the jolt of it landing comes back up the handle
  P.stun = Math.max(P.stun || 0, 0.12); P.pitch = clamp(P.pitch + 0.05, PITCH_MIN, 1.5);
  const ud = h.object.userData, hum = ud.hum;
  if (hum && (hum.dummy || hum.remote)) {
    const info = hitToFrame(hum, h.object, h.point, d); noiseHit(60, 0.3, 1); noiseHit(900, 0.06, 0.3);
    if (hum.flinch && hum.root.visible) hum.flinch(info.frame, info.d, 5);
    punchMark(hum, h.object.parent, h.object.parent.worldToLocal(h.point.clone()), info.frame, 2.5);
    // a 10 lb sledge: bones break, skulls crack (several blows are as good as a bullet)
    if (hum.dummy) { hum.dummy.punched(info, d, 3.5); try { hum.dummy.anat.blunt(info.frame, info.e, info.frame === 'head' ? 3 : 2.2); } catch (er) {} }
    else net.send({ t: 'punch', id: hum.remote.id, f: info.frame, p: info.e.toArray().map(r4x), wd: d.toArray().map(r4x), pw: 1.2, sl: 1 });
    return;
  }
  noiseHit(rnd(90, 130), 0.25, 1); noiseHit(rnd(1400, 1900), 0.05, 0.25);
  if (ud.board !== undefined) { bashBoard(h.object, d, true); return; }
  if (ud.door && !ud.door.fly) {
    const D = ud.door; D.sgDmg = (D.sgDmg || 0) + 0.7;
    D.sgDmg += 0.5;
    if (D.kind === 'metal') { const s = D.leaf.worldToLocal(o.clone()).z >= 0 ? 1 : -1; doorDent(D, h.point, 0.7, -s); doorNet({ i: D.i, a: 'dn', p: h.point.toArray().map(r3), k: 0.7, s: -s }); if (D.sgDmg >= 3 && !D.fallen) { for (const hg of [...D.hinges]) hingeOff(D, hg.userData.n, d); } }
    else if (D.sgDmg >= 1.4) doorLaunch(D, d.clone().setY(0).normalize().multiplyScalar(3).add(new V3(0, 1, 0)), new V3(0, 1, 0).cross(d).multiplyScalar(2));
    else { const kn = D.knob; if (kn && kn.parent && kn.getWorldPosition(new V3()).distanceTo(h.point) < 0.35) knobOff(D, d); }
    return;
  }
  if (DESTR_OF[ud.kind]) {
    const masonry = DESTR_OF[ud.kind] === 'brick' || DESTR_OF[ud.kind] === 'concrete';
    meleeWall(h.point, d, 3000, 9, masonry ? 0.12 : 0.2, (Math.random() * 1e9) | 0, true);
    if (masonry) impactFx(h.point, d.clone().negate(), 'concrete');
    return;
  }
  // (metal and anything else solid: a blow that dents and wears it down until it gives)
  if (ud.box && !ud.door) boxHit(h.object, 13500, 'own');
  impactFx(h.point, d.clone().negate(), ud.kind === 'metal' ? 'metal' : 'concrete');
}

// ---- what the gadgets do (each player works out what happens to themselves)
function updateGadgets(dt) {
  const my = S.mode === 'online' ? S.team[S.myId] : null, now = performance.now();
  for (const o of GD.slice()) {
    o.t += dt; o.cd -= dt;
    if (o.k === 'alarm' && o.g.userData.led) o.g.userData.led.visible = (now / 500 | 0) % 2 === 0;
    if (o.k === 'bcharge') {
      // the fuse: beeps faster and faster, then the owner sets it off for everyone
      o.fuse -= dt; if (o.fuse < -3) { gadgetRemove(o); continue; }   // (its owner is gone: nobody will set it off)
      const per = o.fuse > 1.5 ? 0.5 : o.fuse > 0.6 ? 0.25 : 0.1; o.beep = (o.beep || 0) - dt;
      if (o.beep <= 0) { o.beep = per; blip(2200, 0.04, 0.12 / (1 + camera.position.distanceTo(o.p) * 0.15), 'square'); if (o.g.userData.led) o.g.userData.led.visible = !o.g.userData.led.visible; }
      if (o.fuse <= 0 && !o.sprung && (o.owner === S.myIdOr0() || S.mode !== 'online')) {
        o.sprung = true; const p = o.p.clone(), nrm = new V3(Math.sin(o.yaw), 0, Math.cos(o.yaw));
        if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'bcharge', i: o.id, tg: o.owner, p: p.toArray().map(r3), n: nrm.toArray().map(r3) });
        gadgetRemove(o); explode(p, 'bcharge', o.owner, true, nrm);
      }
      continue;
    }
    if (o.marker) { o.mt -= dt; if (o.marker && o.mt <= 0) { sgDisposeMarker(o.marker); o.marker = null; } }
    const enemy = P.alive && !P.downed && my && o.team && o.team !== my;
    if (!enemy || o.sprung) continue;
    const dx = P.pos.x - o.p.x, dz = P.pos.z - o.p.z, dy = P.pos.y - o.p.y;
    if (o.k === 'beartrap' && dx * dx + dz * dz < 0.16 && Math.abs(dy) < 0.5) {
      // the jaws close on the leg: it breaks the shin and drops you where you stand (a teammate can free you: revive)
      o.sprung = true; gdSnap(o); P.trapped = { p: o.p.clone(), t: 1e9 };
      const an = P.anat; an.pain = Math.min(100, (an.pain || 0) + 55); an.blood -= 260; hurtFlash(); screenBlood(0.8);
      try { an.blunt('knL', new V3(0, -0.2, 0), 1.6); an.damage(an.s.tibiaL, STRUCTS.find(x => x.id === 'tibiaL'), 120, 'shinL'); } catch (er) {}
      P.forceDown = true; P.trapDown = true;
      flashMsg('CAUGHT IN A BEAR TRAP<small>Your leg is crushed. A teammate can free you.</small>', 2600);
      net.send({ t: 'x', a: 'gdx', k: 'snap', i: o.id, tg: o.owner });
    } else if (o.k === 'wire') {
      // in the wire: an oriented 2.4 x 0.7 m strip
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw), u = dx * c - dz * s, v = dx * s + dz * c;
      if (Math.abs(u) < 1.25 && Math.abs(v) < 0.4 && Math.abs(dy) < 0.6) {
        P.inWire = true;
        if (o.cd <= 0) { o.cd = 0.6; noiseHit(3000, 0.15, 0.05); P.anat.pain = Math.min(100, (P.anat.pain || 0) + 3); P.anat.blood -= 12; net.send({ t: 'x', a: 'gdx', k: 'rustle', i: o.id, tg: o.owner }); }
      }
    } else if (o.k === 'alarm' && dx * dx + dz * dz + dy * dy < 16 && o.cd <= 0) {
      o.cd = 3; gdAlarm(o, P.pos); net.send({ t: 'x', a: 'gdx', k: 'alarm', i: o.id, tg: o.owner, p: P.pos.toArray().map(r3) });
    } else if (o.k === 'claymore' && o.t > 1.5) {
      // in front of it, close, in its line: it goes off (the one who set it off sends the blast)
      const f = _gdV.set(-Math.sin(o.yaw), 0, -Math.cos(o.yaw)), d = Math.hypot(dx, dz);
      if (d < 2.7 && Math.abs(dy) < 1.2 && (dx * f.x + dz * f.z) / Math.max(d, 1e-3) > 0.6) {
        o.sprung = true; const p = o.p.clone().setY(o.p.y + 0.15);
        net.send({ t: 'x', a: 'boom', k: 'claymore', i: o.id, tg: o.owner, p: p.toArray().map(r3) });
        gadgetRemove(o); explode(p, 'claymore', o.owner, true);
      }
    }
  }
  // held by a trap: you can't move off it till you are freed (revived) or die
  if (P.trapped) { P.pos.x = P.trapped.p.x; P.pos.z = P.trapped.p.z; P.vel.x = 0; P.vel.z = 0; if (!P.alive || !P.forceDown) { P.trapped = null; P.trapDown = false; } }
  // smoke and gas clouds: grow, hang, thin out
  for (let i = SMOKES.length - 1; i >= 0; i--) {
    const s = SMOKES[i]; s.t += dt; const grow = clamp(s.t / 3, 0, 1), fade = clamp((s.life - s.t) / 4, 0, 1);
    s.r = 0.6 + 3.6 * grow; s.k = fade;
    for (const p of s.parts) { p.s.position.addScaledVector(p.v, dt * (1 - grow * 0.8)); const sc = (0.8 + 3.2 * grow) * p.k; p.s.scale.set(sc, sc, 1); p.s.material.opacity = (s.gas ? 0.55 : 0.82) * fade; }
    if (s.t > s.life) { s.g.removeFromParent(); for (const p of s.parts) p.s.material.dispose(); SMOKES.splice(i, 1); }
  }
}
// how thick the smoke (or gas) is at a point: 0 none, 1 in the middle of it
function smokeAt(p, gasOnly) {
  let k = 0; for (const s of SMOKES) { if (gasOnly && !s.gas) continue; const d = p.distanceTo(s.c); if (d < s.r) k = Math.max(k, (1 - d / s.r) * s.k * (s.gas ? 1 : 0.8) + (s.gas ? 0.25 : 0)); }
  return clamp(k, 0, 1);
}
// the wire slows you through it (called after the move: most of it is taken back)
function wireDrag(prev) { if (!P.inWire) return; P.inWire = false; P.pos.x = lerp(P.pos.x, prev.x, 0.62); P.pos.z = lerp(P.pos.z, prev.z, 0.62); }
function gdSnap(o) { if (o.g && o.g.userData.jaws) o.g.userData.jaws.forEach((j, i) => { j.rotation.x = (i ? 1 : -1) * 1.35; }); noiseHit(900, 0.12, 0.25); noiseHit(140, 0.1, 0.3); }
function gdAlarm(o, at) {
  const d = camera.position.distanceTo(o.p); for (let k = 0; k < 4; k++) setTimeout(() => blip(2400, 0.12, 0.12 / (1 + d * 0.08), 'square'), k * 180);
  // the defenders see where it went off (and who set it off), for a few seconds
  if (S.team[S.myId] === DEF_TEAM && at) { if (o.marker) sgDisposeMarker(o.marker); o.marker = sgMarker('!', '#ff6a5a'); o.marker.position.copy(at).setY(at.y + 1.9); o.mt = 4; }
}
// what someone else did with theirs
function gadgetRx(m) {
  const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (m.a === 'gd' && ok(m.p) && GADGETS[m.k] && (GADGETS[m.k].slot === 2 || m.k === 'bcharge')) gadgetAdd(m.id, m.i, m.k, new V3().fromArray(m.p), Number(m.f) || 0, m.c === 1 ? 'r' : 'b');
  else if (m.a === 'gdx') {
    const o = GD.find(x => x.key === gdKey(m.tg, m.i)); if (!o) return;
    if (m.k === 'snap') { o.sprung = true; gdSnap(o); }
    else if (m.k === 'alarm') gdAlarm(o, ok(m.p) ? new V3().fromArray(m.p) : o.p);
    else if (m.k === 'rustle') noiseHit(3000, 0.15, 0.05 / (1 + camera.position.distanceTo(o.p) * 0.2));
  }
}

// ---- smoke, tear gas and flash
const SMOKE_TEX = canvasTex((g, s) => { const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(225,225,222,1)'); gr.addColorStop(0.5, 'rgba(210,210,208,0.7)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
function smokeCloud(p, gas) {
  const g = new THREE.Group(); scene.add(g); const parts = [];
  for (let i = 0; i < 34; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE_TEX, color: gas ? 0xd8dcc8 : 0xbfc0bd, transparent: true, opacity: 0, depthWrite: false }));
    s.position.copy(p).add(new V3(rnd(-0.3, 0.3), rnd(0.1, 0.6), rnd(-0.3, 0.3))); g.add(s);
    parts.push({ s, v: new V3(rnd(-1.1, 1.1), rnd(0.05, 0.5), rnd(-1.1, 1.1)), k: rnd(0.7, 1.3) });
  }
  SMOKES.push({ g, parts, t: 0, c: p.clone().setY(p.y + 0.9), r: 0.6, k: 0, gas: !!gas, life: gas ? 26 : 22 }); noiseHit(300, 0.8, 0.08);
}
function flashBang(p) {
  boomLight.position.copy(p); boomLight.intensity = 400; boomL = 1; noiseHit(180, 0.4, 0.5);
  flashBodies(p);
  if (!S.mode || !P.alive) return;
  const eye = camera.position, d = eye.distanceTo(p); if (d > 22) return;
  const seen = los(p, eye), look = camera.getWorldDirection(new V3()).dot(_gdV.copy(p).sub(eye).normalize());
  const k = clamp(1 - d / 22, 0, 1) * (seen ? (look > 0.3 ? 1 : 0.45) : 0.15);
  if (k <= 0.05) return;
  flashHit(k, clamp(1 - d / 14, 0, 1));
}
// AI bodies and dummies near a flash: blinded and deafened for a few seconds too (they stop seeing, flinch, cover their eyes)
function flashBodies(p) {
  for (const dm of dummies) {
    if (dm.dead || !dm.hum || !dm.hum.root.visible) continue;
    const e = dm.hum.root.position.clone().setY(dm.hum.root.position.y + 1.6), d = e.distanceTo(p); if (d > 18) continue;
    const k = clamp(1 - d / 18, 0, 1) * (los(p, e) ? 1 : 0.2); if (k < 0.1) continue;
    dm.flashT = Math.max(dm.flashT || 0, 1 + k * 5); dm.deafT = Math.max(dm.deafT || 0, k * 7);
    if (dm.hum.flinch) dm.hum.flinch('head', new V3(0, 0, 1), 1.2 * k);
  }
}

// ---- module exports: build.mjs strips this block ----
export { GADGETS, GD, HEADGEAR, clearGadgets, flashBang, gadgetAdd, gadgetBlast, gadgetGhostOff, gadgetRemove, gadgetRx, gdKey, gdModel, sledgeK, smokeAt, smokeCloud, updateGadget, updateGadgets, updateSledge, wireDrag };
// ---- end module exports ----
