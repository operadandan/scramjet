// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, scene } from './00-setup.js';
import { SURF, TEX, addBox, colliders, worldGroup, worldMeshes } from './01-world.js';
import { _Y } from './04-ragdoll.js';
import { blip, noiseHit } from './10-audio.js';
import { impactFx } from './11-fx.js';
import { gridOpenW } from './15-destruction.js';
import { addProp } from './16-ballistics.js';
import { P, S } from './17-dummies.js';
import { PR, standHeight } from './18-player.js';
import { net } from './19-network.js';
import { CHARGES, chargePos } from './19b-explosives.js';
// ---- end module links ----
// ---------------------------------------------------------------- doors
// A door hangs in a wooden frame on 3 hinges and has a knob. Looking at it (within reach) lights it up; F swings it open
// either way (away from you) or shut, on a damped spring, so it carries on a little past where it is pushed and settles;
// holding F eases it open (or shut, if it was open) for as long as it is held. F on the knob from the lock side locks or
// unlocks it (only while it is shut). A locked door opens only from its lock side and rattles from the other, until its
// knob is shot off.
// Plywood: the knob and each hinge can be shot off; with all 3 hinges gone (shot, or their jamb blown away) the door
// falls out of its frame. The leaf is a plywood wall (shot through, broken up, blown apart like one). A grenade near it
// slams it open away from the blast, and close, or a charge on it, throws it off its hinges.
// Metal: knob and hinges can't be shot. Grenades and charges dent it; only a charge right on it (or almost) is enough to
// tear it out of the frame and throw it.
// The frame is wood, and breaks like any wooden wall. Online: everything a player does to a door goes out to everyone
// (from whoever did it: the one who used it, or whose round took off the knob or a hinge); blasts are worked out the
// same on every machine; a player joining gets every door's state from the host.
const doors = [];
const DOOR_W = 0.9, DOOR_H = 2.05, DOOR_OPEN = 1.65, DOOR_HOLD_T = 0.22, DOOR_REACH = 2.3, DOOR_FW = 0.07;
const DOOR_KIND = {
  plywood: { leaf: 'plywood', color: 0xd2a874, frameColor: 0x8a6a48, t: 0.035, k: 34, c: 7, shootParts: true },
  metal: { leaf: 'metal', color: 0x55606a, frameColor: 0x3c3a36, t: 0.05, k: 22, c: 7.5, shootParts: false }
};
const _dv = new V3(), _dq = new THREE.Quaternion(), _dRay = new THREE.Raycaster(), _X1 = new V3(1, 0, 0);
const hingeMat = new THREE.MeshStandardMaterial({ color: 0x9a927e, metalness: 0.85, roughness: 0.35 }); hingeMat.userData.shared = true;
let DOOR_RX = false;   // applying a door message from someone else: nothing goes back out
const doorNet = m => { if (S.mode === 'online' && !DOOR_RX) net.send(Object.assign({ t: 'door' }, m)); };
const r3d = x => Math.round(x * 1000) / 1000;

// x, z: the middle of the doorway on the floor; rot: which way the wall runs (0: along x, PI/2: along z); hingeSide: -1
// left, 1 right; lock: 0 unlocked, or 1 / -1, the side (along the door's normal) it can be opened and locked from
function addDoor(x, z, rot, kind, hingeSide, lock, y0) {
  const K = DOOR_KIND[kind], g = new THREE.Group(); g.position.set(x, y0 || 0, z); g.rotation.y = rot; worldGroup.add(g); g.updateMatrixWorld(true);
  const d = { i: doors.length, kind, K, g, hs: hingeSide || 1, lock: lock || 0, lock0: lock || 0, a: 0, w: 0, tgt: 0, hold: false, knob: null, hinges: [], fallen: false, fall: null, fly: null, segs: [], frame: [], jamb: null, dented: false, hl: 0, sendT: 0, rattle: 0, ls: lock || 1 };
  // the frame: two jambs and a head, as thin as the leaf plus a little (the hinge knuckles stand proud of it); wood that
  // breaks like any wooden wall
  const fd = K.t + 0.012, sw = Math.abs(Math.cos(rot)) > 0.5, wl = new V3();
  for (const [lx, w, h, y, jamb] of [[-(DOOR_W / 2 + DOOR_FW / 2), DOOR_FW, DOOR_H + 0.1, 0, -1], [DOOR_W / 2 + DOOR_FW / 2, DOOR_FW, DOOR_H + 0.1, 0, 1], [0, DOOR_W + DOOR_FW * 2, 0.1, DOOR_H, 0]]) {
    wl.set(lx, 0, 0).applyAxisAngle(_Y, rot);
    addBox(x + wl.x, (y0 || 0) + y, z + wl.z, sw ? w : fd, h, sw ? fd : w, 'crate', K.frameColor);
    const m = worldMeshes[worldMeshes.length - 1]; m.userData.doorFrame = d; d.frame.push(m); if (jamb === d.hs) d.jamb = m;
  }
  // the leaf turns about its hinge edge: a pivot at that edge holds it
  d.pivot = new THREE.Group(); d.pivot.position.set(d.hs * DOOR_W / 2, 0, 0); g.add(d.pivot);
  const t = TEX[K.leaf === 'plywood' ? 'crate' : 'metal'].clone(); t.needsUpdate = true; t.repeat.set(0.4, 0.9);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.01, DOOR_H - 0.01, K.t, kind === 'metal' ? 9 : 1, kind === 'metal' ? 20 : 1, 1),
    new THREE.MeshStandardMaterial({ map: t, color: K.color, roughness: kind === 'metal' ? 0.5 : 0.9, metalness: kind === 'metal' ? 0.45 : 0 }));
  leaf.position.set(-d.hs * DOOR_W / 2, DOOR_H / 2, 0); leaf.castShadow = leaf.receiveShadow = true;
  leaf.userData.surf = SURF[K.leaf]; leaf.userData.kind = K.leaf; leaf.userData.door = d;
  // its box (what the wall code measures it by) follows it as it swings; it is not one of the solids, the slabs below are
  leaf.userData.box = { min: new V3(), max: new V3(), mesh: leaf };
  d.pivot.add(leaf); worldMeshes.push(leaf); d.leaf = leaf;
  // what the player and loose things bump into: four slabs along the door, each following its own piece of it
  for (let i = 0; i < 4; i++) { const c = { min: new V3(), max: new V3(), door: d }; colliders.push(c); d.segs.push(c); }
  // the knob on both faces, on the side away from the hinges (its own material, so it can be lit up when looked at)
  d.knobMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, metalness: 0.85, roughness: 0.3 });
  const kg = new THREE.Group(); kg.position.set(-d.hs * (DOOR_W / 2 - 0.07), 0.98 - DOOR_H / 2, 0); leaf.add(kg);
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), d.knobMat); k.position.z = s * (K.t / 2 + 0.035); k.scale.z = 0.8;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.035, 8), d.knobMat); st.rotation.x = Math.PI / 2; st.position.z = s * (K.t / 2 + 0.017);
    for (const m of [k, st]) { m.castShadow = true; m.userData.surf = 'metal'; m.userData.kind = 'metal'; m.userData.doorPart = { d, type: 'knob' }; kg.add(m); worldMeshes.push(m); } }
  d.knob = kg;
  // three hinges, seen on both faces of the door: a knuckle standing proud at the hinge edge on each face, with one leaf
  // of the hinge on the jamb and one on the door (that one turns with the door)
  const zf = K.t / 2 + 0.006;
  for (const [n, hy] of [[0, 0.25], [1, DOOR_H / 2], [2, DOOR_H - 0.25]]) {
    const h = new THREE.Group(); h.position.set(d.hs * DOOR_W / 2, hy, 0); g.add(h); h.userData.n = n; h.userData.pd = [];
    for (const s of [-1, 1]) {
      const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.09, 10), hingeMat); kn.position.z = s * zf;
      const pj = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.085, 0.002), hingeMat); pj.position.set(d.hs * 0.016, 0, s * (zf - 0.005));
      const pd = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.085, 0.002), hingeMat); pd.userData.base = new V3(-d.hs * 0.016, 0, s * (zf - 0.005));
      for (const m of [kn, pj, pd]) { m.castShadow = true; m.userData.surf = 'metal'; m.userData.kind = 'metal'; m.userData.doorPart = { d, type: 'hinge', n }; h.add(m); worldMeshes.push(m); }
      h.userData.pd.push(pd);
    }
    d.hinges.push(h);
  }
  doors.push(d); doorBoxes(d);
  return d;
}

// the leaf's box and the four slabs, worked out from where it is now
function doorBoxes(d) {
  const L = d.leaf; (d.fly ? L : d.fall ? d.fall.pv : d.g).updateMatrixWorld(true); const b = L.userData.box, gp = L.geometry.parameters;
  b.min.set(1e9, 1e9, 1e9); b.max.set(-1e9, -1e9, -1e9);
  for (let i = 0; i < 4; i++) {
    const c = d.segs[i]; c.min.set(1e9, 1e9, 1e9); c.max.set(-1e9, -1e9, -1e9);
    for (const sx of [i / 4, (i + 1) / 4]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      _dv.set((sx - 0.5) * gp.width, (sy - 0.5) * gp.height, sz * (d.dentZ || gp.depth / 2)).applyMatrix4(L.matrixWorld); c.min.min(_dv); c.max.max(_dv); b.min.min(_dv); b.max.max(_dv);
    }
  }
  // the hinge leaves on the door turn with it
  if (!d.fallen) for (const h of d.hinges) for (const pd of h.userData.pd) { pd.position.copy(pd.userData.base).applyAxisAngle(_Y, d.a); pd.rotation.y = d.a; }
}

// what the player is looking at, within reach: { d, knob } (the leaf, the knob, or the doorway itself: an open door is
// closed by looking at its frame)
const _dA = { o: new V3(), dir: new V3(), n: new V3(), c: new V3(), l: new V3(), qi: new THREE.Quaternion(), targets: [], occ: [], occN: -1 };
function doorAimed() {
  if (!doors.length || !S.mode || !P.alive || P.downed) return null;
  const A = _dA, o = camera.getWorldPosition(A.o), dir = camera.getWorldDirection(A.dir);
  // nothing to do unless a door is within reach
  if (!doors.some(d => !d.fallen && d.g.position.distanceToSquared(o) < (DOOR_REACH + 1.5) ** 2)) return null;
  const targets = A.targets; targets.length = 0; for (const d of doors) if (!d.fallen) { targets.push(d.leaf); if (d.knob && d.knob.parent) targets.push(...d.knob.children); }
  _dRay.set(o, dir); _dRay.far = DOOR_REACH; _dRay.firstHitOnly = false;
  const h = _dRay.intersectObjects(targets, false)[0];
  // a wall (or anything else) in the way: no door through it
  if (A.occN !== worldMeshes.length) { A.occN = worldMeshes.length; A.occ = worldMeshes.filter(m => !m.userData.door && !m.userData.doorPart && !m.userData.doorFrame); }
  _dRay.firstHitOnly = true; const w = _dRay.intersectObjects(A.occ, false)[0]; _dRay.firstHitOnly = false;
  let best = null, bd = w ? w.distance : DOOR_REACH;
  // (a look within a few cm of the knob counts as at the knob: it is small)
  if (h && h.distance <= bd) { const ud = h.object.userData, d = ud.door || ud.doorPart.d; best = { d, knob: !!ud.doorPart || !!(d.knob && d.knob.parent && d.knob.getWorldPosition(_dv).distanceTo(h.point) < 0.07) }; bd = h.distance; }
  for (const d of doors) {
    if (d.fallen) continue; const q = d.g.getWorldQuaternion(_dq), n = A.n.set(0, 0, 1).applyQuaternion(q), c = d.g.getWorldPosition(A.c), dn = dir.dot(n); if (Math.abs(dn) < 1e-3) continue;
    const t = A.l.copy(c).sub(o).dot(n) / dn; if (t < 0 || t > bd) continue;
    const l = A.l.copy(o).addScaledVector(dir, t).sub(c).applyQuaternion(A.qi.copy(q).invert());
    if (Math.abs(l.x) < DOOR_W / 2 + 0.08 && l.y > 0 && l.y < DOOR_H + 0.08) { best = { d, knob: false }; bd = t; }
  }
  return best;
}
// which side of the door a point is on (along its normal, +1 or -1)
function doorSide(d, p) { const n = new V3(0, 0, 1).applyQuaternion(d.g.getWorldQuaternion(_dq)); return Math.sign(_dv.copy(p).sub(d.g.getWorldPosition(new V3())).dot(n)) || 1; }
// the angle that swings the door away from whatever is on side s: its free edge goes over to the other side
function doorAwayS(d, s) { return -s * d.hs * DOOR_OPEN; }
function doorAway(d, p) { return doorAwayS(d, doorSide(d, p)); }
function doorLocked(d, p) { return d.lock && d.knob && d.knob.parent && doorSide(d, p) !== d.lock; }

// what F will do to the door looked at, for the prompt under the crosshair
let doorAim = null;
function doorHint() {
  const A = doorAim; if (!A || A.d.fallen || S.inv) return '';
  const d = A.d, side = doorSide(d, P.pos);
  if (A.knob && d.knob && Math.abs(d.a) < 0.05 && side === d.ls) return '<b>F</b> ' + (d.lock ? 'Unlock' : 'Lock') + ' door';
  if (Math.abs(d.a) > 0.12) return '<b>F</b> Close door<small>hold to ease it shut</small>';
  if (doorLocked(d, P.pos)) return '<b>F</b> Locked<small>locked from the other side</small>';
  return '<b>F</b> Open door<small>hold to ease it open</small>';
}
// F pressed / released while looking at a door
let doorF = null;
function doorKeyDown() { doorLetGo(); const A = doorAimed(); if (!A) return false; doorF = { d: A.d, knob: A.knob, t: 0, p: P.pos.clone() }; return true; }
// a hold ends where the door is (also when the window loses focus mid-hold)
function doorLetGo() { if (doorF) { const d = doorF.d; if (d.hold) { d.hold = false; d.tgt = d.a; d.w = 0; doorSend(d); } doorF = null; } }
addEventListener('blur', doorLetGo);
function doorKeyUp() {
  const f = doorF; doorF = null; if (!f) return; const d = f.d;
  if (f.t >= DOOR_HOLD_T) { if (d.hold) { d.hold = false; d.tgt = d.a; d.w = 0; doorSend(d); } return; }   // a hold just lets go where it is
  if (d.fallen) return;
  // the knob, from the side it locks from, while the door is shut: lock or unlock it
  const side = doorSide(d, f.p);
  if (f.knob && d.knob && Math.abs(d.a) < 0.05 && side === d.ls) { d.lock = d.lock ? 0 : side; blip(d.lock ? 900 : 700, 0.025, 0.05, 'square'); doorSend(d); return; }
  if (Math.abs(d.a) > 0.12) { d.tgt = 0; doorSend(d); return; }   // open: push it shut
  if (doorLocked(d, f.p)) { d.rattle = 0.35; blip(180, 0.05, 0.05, 'square'); doorNet({ i: d.i, a: 'rt' }); return; }
  d.tgt = doorAwayS(d, side); d.w += Math.sign(d.tgt) * 1.2; blip(320, 0.03, 0.03); doorSend(d);
}
// this door's state, to everyone else
function doorSend(d) { doorNet({ i: d.i, a: 'st', tg: r3d(d.tgt), an: r3d(d.a), w: r3d(d.w), h: d.hold ? 1 : 0, lk: d.lock }); }

function updateDoors(dt) {
  if (!doors.length) return;
  // a charge stuck on a door's leaf goes with it as it swings or falls
  for (const c of CHARGES) { if (c.doorChk) { if (c.g.parent && c.g.parent.userData.door) chargePos(c); continue; } c.doorChk = true;
    for (const d of doors) { const L = d.leaf, lp = L.worldToLocal(c.p.clone()), gp = L.geometry.parameters; if (Math.abs(lp.x) < gp.width / 2 + 0.02 && Math.abs(lp.y) < gp.height / 2 + 0.02 && Math.abs(lp.z) < gp.depth / 2 + 0.06) { L.attach(c.g); break; } } }
  // the door (or the knob) looked at is lit up a little, so it is clear what F will work
  const A = doorAim = doorAimed();
  for (const d of doors) {
    const on = A && A.d === d ? 1 : 0; d.hl += (on - d.hl) * Math.min(1, dt * 14);
    const m = d.leaf.material, k = on && !A.knob ? d.hl : 0, kk = on && A.knob ? d.hl : 0;
    if (m.emissive) m.emissive.setRGB(0.16 * k, 0.13 * k, 0.07 * k); d.knobMat.emissive.setRGB(0.4 * kk, 0.33 * kk, 0.18 * kk);
  }
  if (doorF) {
    doorF.t += dt; const d = doorF.d;
    // held: it eases open, a little at a time, away from the player, or shut again if it was open
    if (doorF.t >= DOOR_HOLD_T && !d.fallen && !doorLocked(d, doorF.p)) {
      if (!d.hold) { d.hold = true; d.holdFrom = d.a; d.holdDir = Math.abs(d.a) > 0.12 ? -Math.sign(d.a) : Math.sign(doorAway(d, doorF.p)); }
      d.tgt = d.a + d.holdDir * 0.75 * dt;
      if (Math.abs(d.tgt) >= DOOR_OPEN) d.tgt = Math.sign(d.tgt) * DOOR_OPEN; if (Math.abs(d.holdFrom) > 0.12 && Math.sign(d.tgt) !== Math.sign(d.holdFrom)) d.tgt = 0;
      d.sendT -= dt; if (d.sendT <= 0) { d.sendT = 0.1; doorSend(d); }   // (others see it ease open, ten times a second)
    } else if (doorF.t >= DOOR_HOLD_T && doorLocked(d, doorF.p) && d.rattle <= 0) d.rattle = 0.25;
  }
  for (const d of doors) {
    if (d.fly) { doorFly(d, dt); continue; }
    if (d.fallen) { doorFall(d, dt); continue; }
    // its jamb on the hinge side blown away: the hinges in that part go with it
    const JG = d.jamb && d.jamb.userData.grid;
    if (JG && JG.any) for (const h of [...d.hinges]) if (gridOpenW(d.jamb, d.g.localToWorld(_dv.set(d.hs * (DOOR_W / 2 + 0.025), h.position.y, 0)))) { DOOR_RX = true; try { hingeOff(d, h.userData.n, new V3(0, -1, 0)); } finally { DOOR_RX = false; } }
    if (d.fallen) continue;
    const a0 = d.a;
    if (d.hold) { d.a = d.tgt; d.w = 0; }
    else {
      // a damped spring toward where it was pushed: it runs on a little and settles; the hinge stops it at full open
      d.w += (d.K.k * (d.tgt - d.a) - d.K.c * d.w) * dt; d.a += d.w * dt;
      if (Math.abs(d.a) > DOOR_OPEN) { d.a = Math.sign(d.a) * DOOR_OPEN; d.w *= -0.3; }
      // swung shut: it latches
      if (d.tgt === 0 && Math.abs(d.a) < 0.02 && Math.abs(d.w) < 0.6 && a0 !== 0) { if (Math.abs(a0) > 0.004) blip(140, 0.04, 0.05); d.a = 0; d.w = 0; }
    }
    let r = 0; if (d.rattle > 0) { d.rattle -= dt; r = Math.sin(d.rattle * 90) * 0.012 * (d.rattle / 0.35); }
    // a door swinging into the player stops against them
    const was = d.pivot.rotation.y; d.pivot.rotation.y = d.a + r;
    if (d.a !== a0 || r) { doorBoxes(d); if (doorHitsPlayer(d)) { d.pivot.rotation.y = was; d.a = a0; d.w = 0; d.tgt = d.hold ? d.a : d.tgt; doorBoxes(d); } }
  }
}
function doorHitsPlayer(d) {
  if (!S.mode || !P.alive) return false; const p = P.pos, R = PR + 0.03, H = standHeight();
  return d.segs.some(c => p.x + R > c.min.x && p.x - R < c.max.x && p.z + R > c.min.z && p.z - R < c.max.z && p.y + H > c.min.y && p.y < c.max.y);
}

// a round into the knob or a hinge. Only the shooter's own machine decides it (and tells everyone), so it can't come out
// differently on two screens. A plywood door only (on a metal door they are just metal)
function doorPartHit(part, hit, dir, local) {
  const d = part.d; if (!d.K.shootParts) return false;
  impactFx(hit.point, dir.clone().negate(), 'metal'); noiseHit(2600, 0.06, 0.06);
  if (!local) return true;
  if (part.type === 'knob') knobOff(d, dir); else hingeOff(d, part.n, dir);
  return true;
}
// the whole knob comes off the door (both handles): unlocked, it can be pushed open from either side
function knobOff(d, dir, quiet) {
  if (!d.knob || !d.knob.parent) return;
  const k = d.knob; k.updateMatrixWorld(true); const g = new THREE.Group(); k.matrixWorld.decompose(g.position, g.quaternion, g.scale);
  for (const c of [...k.children]) { const i = worldMeshes.indexOf(c); if (i >= 0) worldMeshes.splice(i, 1); g.add(c); }
  k.removeFromParent(); d.knob = null; d.lock = 0;
  if (!quiet) { scene.add(g); addProp(g, dir.clone().multiplyScalar(3).add(new V3(0, 1, 0)), new V3(14, -9, 17), 0.035, 'knob', 40); }
  doorNet({ i: d.i, a: 'kn', d: dir.toArray().map(r3d) });
}
// hinge n comes off and drops; with none left, the door falls
function hingeOff(d, n, dir, quiet) {
  const h = d.hinges.find(x => x.userData.n === n); if (!h) return;
  d.hinges.splice(d.hinges.indexOf(h), 1); for (const m of h.children) { const j = worldMeshes.indexOf(m); if (j >= 0) worldMeshes.splice(j, 1); }
  h.updateMatrixWorld(true); const p = h.getWorldPosition(new V3()), q = h.getWorldQuaternion(new THREE.Quaternion()); h.removeFromParent();
  if (!quiet) { h.position.copy(p); h.quaternion.copy(q); scene.add(h); addProp(h, dir.clone().multiplyScalar(2).add(new V3(0, 0.6, 0)), new V3(20, -15, 22), 0.015, 'hinge', 40); }
  doorNet({ i: d.i, a: 'hg', n, d: dir.toArray().map(r3d) });
  if (!d.hinges.length && !d.fly) doorDrop(d, dir);
}

// off its hinges: the leaf tips over about its bottom edge onto the floor, falling the way it was pushed
function doorDrop(d, dir) {
  if (d.fallen) return; d.fallen = true; d.hold = false; if (doorF && doorF.d === d) doorF = null;
  const L = d.leaf; L.updateMatrixWorld(true);
  const n = new V3(0, 0, 1).applyQuaternion(L.getWorldQuaternion(_dq)); const s = Math.sign(dir ? dir.dot(n) : 1) || 1;
  // a new pivot on the bottom edge, on the face it falls toward, keeping the leaf where it is
  const bottom = L.localToWorld(new V3(0, -DOOR_H / 2, s * L.geometry.parameters.depth / 2));
  const pv = new THREE.Group(); pv.position.copy(bottom); pv.quaternion.copy(L.getWorldQuaternion(new THREE.Quaternion())); worldGroup.add(pv); pv.updateMatrixWorld(true);
  pv.attach(L); d.fall = { pv, s, ph: 0, w: 0.6 * s, done: false, q0: pv.quaternion.clone() };
}
function doorFall(d, dt) {
  const f = d.fall; if (!f || f.done) return;
  // a plank toppling about its bottom edge: it speeds up as it goes over, then lands flat with a small bounce
  const h = DOOR_H; f.w += (3 * 9.8 / (2 * h)) * Math.sin(Math.abs(f.ph) + 0.05) * f.s * dt; f.ph += f.w * dt;
  if (Math.abs(f.ph) >= Math.PI / 2) {
    f.ph = f.s * Math.PI / 2; if (Math.abs(f.w) > 1.2) { f.w = -f.w * 0.2; noiseHit(400, 0.12, 0.12); } else { f.done = true; noiseHit(300, 0.08, 0.06); }
  }
  // (turned about its own width, the bottom edge it stands on, whichever way the door was hanging)
  const ph0 = f.pv.userData.ph || 0; f.pv.quaternion.copy(f.q0).multiply(_dq.setFromAxisAngle(_X1, f.ph)); f.pv.userData.ph = f.ph; doorBoxes(d);
  // it comes down on the player instead of through them: it rests against them
  if (doorHitsPlayer(d)) { f.ph = ph0; f.w = 0; f.pv.quaternion.copy(f.q0).multiply(_dq.setFromAxisAngle(_X1, f.ph)); doorBoxes(d); }
}

// torn out of its frame by a blast and thrown: the whole leaf flies, tumbling, comes down and comes to rest lying flat
function doorLaunch(d, v, spin) {
  if (d.fly) return;
  const L = d.leaf; L.updateMatrixWorld(true);
  doorNet({ i: d.i, a: 'fl', v: v.toArray().map(r3d), w: spin.toArray().map(r3d), p: L.getWorldPosition(new V3()).toArray().map(r3d), q: L.getWorldQuaternion(new THREE.Quaternion()).toArray().map(r3d) });
  d.fly = { v: v.clone(), w: spin.clone(), rest: false }; d.fallen = true; d.hold = false; if (doorF && doorF.d === d) doorF = null;
  const rx = DOOR_RX; DOOR_RX = true; try { for (const h of [...d.hinges]) hingeOff(d, h.userData.n, v.clone().normalize()); } finally { DOOR_RX = rx; }
  worldGroup.attach(L); if (d.fall) { d.fall.pv.removeFromParent(); d.fall = null; }
}
const _dflq = new THREE.Quaternion(), _dfla = new V3();
function doorFly(d, dt) {
  const f = d.fly; if (f.rest) return;
  const L = d.leaf, gp = L.geometry.parameters;
  f.v.y -= 9.8 * dt; L.position.addScaledVector(f.v, dt);
  const wl = f.w.length(); if (wl > 1e-4) { _dflq.setFromAxisAngle(_dfla.copy(f.w).multiplyScalar(1 / wl), wl * dt); L.quaternion.premultiply(_dflq); }
  // the lowest corner meets the floor: it bounces off it, and once it is slow it settles flat on a face
  L.updateMatrixWorld(true); let lo = 1e9; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) lo = Math.min(lo, _dv.set(sx * gp.width / 2, sy * gp.height / 2, sz * gp.depth / 2).applyMatrix4(L.matrixWorld).y);
  // (the floor under it: the ground or whatever it comes down on, not its own slabs)
  let fy = 0; const X = L.position.x, Z = L.position.z, Y = L.position.y + 0.5; for (const c of colliders) if (c.door !== d && X > c.min.x && X < c.max.x && Z > c.min.z && Z < c.max.z && c.max.y <= Y && c.max.y > fy) fy = c.max.y;
  if (lo < fy) {
    L.position.y += fy - lo;
    if (f.v.length() > 1.6) { f.v.y = Math.abs(f.v.y) * 0.25; f.v.x *= 0.55; f.v.z *= 0.55; f.w.multiplyScalar(0.45); noiseHit(450, 0.12, 0.14); }
    else {
      // flat: keep which way it points along the floor, lay it on its face
      const n = new V3(0, 0, 1).applyQuaternion(L.quaternion), up = n.y < 0 ? -1 : 1, x = new V3(1, 0, 0).applyQuaternion(L.quaternion); x.y = 0; if (x.lengthSq() < 1e-4) x.set(1, 0, 0); x.normalize();
      const z = new V3(0, up, 0), y = new V3().crossVectors(z, x); L.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      L.position.y = fy + gp.depth / 2 + 0.002; f.rest = true; noiseHit(300, 0.1, 0.08);
    }
  }
  doorBoxes(d);
}

// a blast near a door. It goes away from the side the blast was on. Nothing here is left to chance: every machine works
// out every blast itself, so it comes out the same on all of them.
// Metal: a grenade, or a charge further off, only dents it; a charge on it (or almost) tears it out and throws it.
// Plywood: a grenade slams it open away from the blast, or throws it off its hinges if it went off right by it; a charge
// close throws it, further off slams it open (and the wall code breaks it up as well)
function doorBlast(p, W, auth) {
  if (!auth) return;   // (online, what a blast does to the doors comes from whoever set it off)
  const c4 = W >= 0.5, cW = Math.cbrt(W);
  for (const d of doors) {
    if (d.fly) continue;
    const L = d.leaf, gp = L.geometry.parameters; L.updateMatrixWorld(true);
    const lp = L.worldToLocal(p.clone()), q = new V3(clamp(lp.x, -gp.width / 2, gp.width / 2), clamp(lp.y, -gp.height / 2, gp.height / 2), clamp(lp.z, -gp.depth / 2, gp.depth / 2)), dist = q.distanceTo(lp);
    if (dist > 2.6 * cW) continue;
    // which face it went off at, by the leaf's own plane (a charge stuck right on it included)
    const s = lp.z >= 0 ? 1 : -1, nW = new V3(0, 0, 1).applyQuaternion(L.getWorldQuaternion(_dq)), out = nW.clone().multiplyScalar(-s), k = clamp(1 - dist / (2.6 * cW), 0, 1);
    const spin = (m, y) => new V3(0, 1, 0).cross(out).multiplyScalar(m).add(new V3(0, y * d.hs, 0));
    if (d.kind === 'metal') {
      doorDent(d, p, c4 ? k : k * 0.45, s); doorNet({ i: d.i, a: 'dn', p: p.toArray().map(r3d), k: r3d(c4 ? k : k * 0.45), s });
      if (c4 && dist < 0.3) doorLaunch(d, out.clone().multiplyScalar(5 + 4 * (1 - dist / 0.3)).add(new V3(0, 2, 0)), spin(3, 0.8));
    } else if (!d.fallen) {
      if (c4 ? dist < 0.6 : dist < 0.45) doorLaunch(d, out.clone().multiplyScalar(c4 ? 9 : 5.5).add(new V3(0, c4 ? 2.5 : 1.6, 0)), spin(c4 ? 4 : 2.5, 0.5));
      else {
        // slammed open away from the blast: it goes as far as it will and bounces back off the stop (the lock bursts)
        d.hold = false; d.lock = 0; d.tgt = doorAwayS(d, s); d.w += Math.sign(d.tgt) * (c4 ? 14 : 9) * (0.4 + k);
        for (const h of [...d.hinges]) if (h.getWorldPosition(new V3()).distanceTo(p) < (c4 ? 0.9 : 0.35)) hingeOff(d, h.userData.n, out);
        if (!d.fallen) doorSend(d);
      }
    }
  }
}
// the door a charge went off on (or right by its frame): then only that door and its frame are hurt, not the walls next to it
function doorAt(p, W) {
  if (W < 0.5) return null;
  for (const d of doors) { if (d.fly || d.fallen || Math.abs(d.a) > 0.1) continue; const L = d.leaf, gp = L.geometry.parameters, lp = d.g.worldToLocal(p.clone());
    if (Math.abs(lp.x) < DOOR_W / 2 + DOOR_FW + 0.08 && lp.y > -0.05 && lp.y < DOOR_H + 0.2 && Math.abs(lp.z) < gp.depth / 2 + 0.25) return d; }
  return null;
}
// the metal pushed in round the point facing the blast, deepest in the middle; the whole sheet bends (both faces), and in
// all it never goes deeper than 12 cm
function doorDent(d, p, k, side) {
  if (k <= 0.02) return;
  const L = d.leaf, G = L.geometry, P = G.attributes.position, lp = L.worldToLocal(p.clone());
  const R = 0.3 + 0.4 * k, depth = 0.015 + 0.075 * k, gp = G.parameters;
  // (the rim stays in the frame: the dent eases off to nothing within 10 cm of the edges, so the sheet never bulges into the
  // jamb, the floor or the wall; a door lying flat is only pushed away from whatever it lies on; at most 6 cm either way,
  // and the door's own hit box grows to take in what bulges out)
  L.updateMatrixWorld(true); const zy = new V3(0, 0, 1).transformDirection(L.matrixWorld).y, flat = Math.abs(zy) > 0.7;
  let zmax = gp.depth / 2;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x - lp.x, y - lp.y); if (r > R) continue;
    const edge = clamp(Math.min(gp.width / 2 - Math.abs(x), gp.height / 2 - Math.abs(y)) / 0.1, 0, 1);
    let push = -side * depth * Math.pow(Math.cos(r / R * Math.PI / 2), 2) * edge;
    if (flat && push * zy < 0) push = 0;
    const z0 = Math.sign(z) * d.K.t / 2, pushed = z - z0;
    P.setZ(i, z0 + clamp(pushed + push, -0.06, 0.06));
  }
  for (let i = 0; i < P.count; i++) zmax = Math.max(zmax, Math.abs(P.getZ(i)));
  d.dentZ = zmax;
  P.needsUpdate = true; G.computeVertexNormals(); G.computeBoundingSphere(); G.computeBoundingBox(); d.dented = true;
  if (G.boundsTree) G.disposeBoundsTree(); G.boundsTree = null;   // (the raycast tree is built again for the new shape)
}
// a shotgun blast into a door (all the pellets of one shot together, worked out by the shooter and sent to everyone as dents,
// hinges and launches). Metal: each close blast dents it hard; two or three and it buckles out of its frame and falls over.
// Wood: buckshot chews through the leaf round the hinges and lock; a couple of close blasts and the door comes off whole.
function doorShotgun(d, p, dir, E, shot) {
  if (!shot || d.fly) return;
  const m = shot.door || (shot.door = new Map()); let e = m.get(d);
  if (!e) { e = { E: 0, p: new V3(), n: 0 }; m.set(d, e); setTimeout(() => doorShotFlush(d, e, dir), 0); }
  e.E += E; e.p.add(p); e.n++;
}
function doorShotFlush(d, e, dir) {
  if (d.fly || !e.n) return;
  const k = clamp(e.E / 2400, 0, 1.2), p = e.p.multiplyScalar(1 / e.n), L = d.leaf; L.updateMatrixWorld(true);
  const s = L.worldToLocal(p.clone().addScaledVector(dir, -0.3)).z >= 0 ? 1 : -1;
  d.sgDmg = (d.sgDmg || 0) + k;
  if (d.kind === 'metal') {
    doorDent(d, p, k * 0.5, s); doorNet({ i: d.i, a: 'dn', p: p.toArray().map(r3d), k: r3d(k * 0.5), s }); noiseHit(900, 0.18, 0.2);
    if (d.sgDmg >= 2.3 && !d.fallen) { for (const h of [...d.hinges]) hingeOff(d, h.userData.n, dir); if (!d.fallen) { doorNet({ i: d.i, a: 'dr', d: dir.toArray().map(r3d) }); doorDrop(d, dir); } }
  } else if (d.sgDmg >= 1.7) {
    const out = dir.clone().setY(0).normalize();
    doorLaunch(d, out.multiplyScalar(3.5 + k * 2).add(new V3(0, 1.2, 0)), new V3(0, 1, 0).cross(out).multiplyScalar(2.5).add(new V3(0, 0.6 * d.hs, 0)));
  } else {
    // the hinge nearest the blast goes first
    let hb = null, hd = 0.45; for (const h of d.hinges) { const dd = h.getWorldPosition(new V3()).distanceTo(p); if (dd < hd) { hd = dd; hb = h; } }
    if (hb && k > 0.5) hingeOff(d, hb.userData.n, dir);
  }
}
function clearDoors() { doors.length = 0; doorF = null; }
// a player left: a door they were holding is let go where it is
function doorLeft(id) { for (const d of doors) if (d.hold && d.holdBy === id) { d.hold = false; d.tgt = d.a; d.w = 0; } }

// ---------------------------------------------------------------- doors online
// what another player did to a door
const ok3 = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
function doorRx(m) {
  const d = doors[m.i | 0]; if (!d || typeof m.a !== 'string') return;
  DOOR_RX = true; d.rxT = 1;
  try {
    const dir = Array.isArray(m.d) && m.d.length === 3 && m.d.every(Number.isFinite) ? new V3().fromArray(m.d) : new V3(0, 0, 1);
    if (m.a === 'st' && !d.fallen) {
      if (Number.isFinite(m.tg)) d.tgt = clamp(m.tg, -DOOR_OPEN, DOOR_OPEN); if (Number.isFinite(m.w)) d.w = clamp(m.w, -30, 30);
      if (Number.isFinite(m.an) && (m.h || Math.abs(m.an - d.a) > 0.15)) d.a = clamp(m.an, -DOOR_OPEN, DOOR_OPEN);
      d.hold = !!m.h; d.holdBy = d.hold ? m.id : 0; if (d.hold) d.tgt = d.a; if ([-1, 0, 1].includes(m.lk) && (d.knob || !m.lk)) d.lock = m.lk;
    }
    else if (m.a === 'rt') d.rattle = 0.35;
    else if (m.a === 'dr' && !d.fallen) doorDrop(d, dir);
    else if (m.a === 'dn' && d.kind === 'metal' && ok3(m.p) && Number.isFinite(m.k)) doorDent(d, new V3().fromArray(m.p), clamp(m.k, 0, 1), m.s === -1 ? -1 : 1);
    else if (m.a === 'fl' && !d.fly && ok3(m.v) && ok3(m.w) && ok3(m.p) && Array.isArray(m.q) && m.q.length === 4 && m.q.every(Number.isFinite)) {
      const L = d.leaf, v = new V3().fromArray(m.v).clampLength(0, 30), w = new V3().fromArray(m.w).clampLength(0, 20);
      doorLaunch(d, v, w); L.position.fromArray(m.p); L.quaternion.fromArray(m.q).normalize(); doorBoxes(d);
    }
    else if (m.a === 'kn') knobOff(d, dir);
    else if (m.a === 'hg') hingeOff(d, m.n | 0, dir);
  } finally { DOOR_RX = false; }
}
// every door that is not as it was built, for a player joining (the host sends it with the welcome)
function doorSnap() {
  const out = [];
  for (const d of doors) {
    const hm = d.hinges.reduce((s, h) => s | (1 << h.userData.n), 0);
    if (!d.a && !d.tgt && d.knob && hm === 7 && !d.fallen && d.lock === d.lock0) continue;
    const L = d.leaf; L.updateMatrixWorld(true); const wp = L.getWorldPosition(new V3()), wq = L.getWorldQuaternion(new THREE.Quaternion());
    out.push([d.i, r3d(d.a), r3d(d.tgt), d.lock, d.knob ? 1 : 0, hm, d.fallen ? 1 : 0, wp.toArray().map(r3d), wq.toArray().map(r3d)]);
  }
  return out;
}
// a joining player's doors set to how they are in the room (nothing thrown, nothing heard)
function doorApplySnap(list) {
  if (!Array.isArray(list)) return;
  DOOR_RX = true;
  try {
    for (const e of list) {
      if (!Array.isArray(e)) continue; const d = doors[e[0] | 0]; if (!d || d.rxT) continue;   // (heard of since joining: that is newer)
      if (!e[4]) knobOff(d, new V3(0, -1, 0), true);
      d.lock = [-1, 0, 1].includes(e[3]) && (d.knob || !e[3]) ? e[3] : 0;
      if (e[6] && ok3(e[7]) && Array.isArray(e[8]) && e[8].length === 4 && e[8].every(Number.isFinite)) {
        // lying where it fell or was thrown
        d.fly = { v: new V3(), w: new V3(), rest: true }; d.fallen = true;
        for (const h of [...d.hinges]) hingeOff(d, h.userData.n, new V3(0, -1, 0), true);
        const L = d.leaf; worldGroup.attach(L); L.position.fromArray(e[7]); L.quaternion.fromArray(e[8]).normalize();
      } else {
        for (let n = 0; n < 3; n++) if (!((e[5] | 0) & (1 << n))) hingeOff(d, n, new V3(0, -1, 0), true);
        d.a = clamp(+e[1] || 0, -DOOR_OPEN, DOOR_OPEN); d.tgt = clamp(+e[2] || 0, -DOOR_OPEN, DOOR_OPEN); d.pivot.rotation.y = d.a;
      }
      doorBoxes(d);
    }
  } finally { DOOR_RX = false; }
}

// ---- module exports: build.mjs strips this block ----
export { DOOR_FW, DOOR_H, DOOR_W, addDoor, clearDoors, doorApplySnap, doorAt, doorBlast, doorHint, doorKeyDown, doorKeyUp, doorLeft, doorPartHit, doorRx, doorShotgun, doorSnap, updateDoors };
// ---- end module exports ----
