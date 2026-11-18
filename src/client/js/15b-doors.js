// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, rnd, scene } from './00-setup.js';
import { SURF, TEX, addBox, colliders, worldGroup, worldMeshes } from './01-world.js';
import { _Y } from './04-ragdoll.js';
import { blip, noiseHit } from './10-audio.js';
import { impactFx } from './11-fx.js';
import { addProp } from './16-ballistics.js';
import { P, S } from './17-dummies.js';
import { PR, standHeight } from './18-player.js';
import { CHARGES, chargePos } from './19b-explosives.js';
// ---- end module links ----
// ---------------------------------------------------------------- doors
// A door hangs in a frame on 3 hinges and has a knob. F while looking at it (within reach) swings it open or shut on a
// damped spring, so it carries on a little past where it is pushed and settles; holding F eases it open slowly for as
// long as it is held. A locked door opens only from its lock side; from the other it only rattles, until its knob is shot
// off. Plywood: the knob and each hinge can be shot off, and with all 3 hinges gone the door falls out of its frame onto
// the floor; the door itself is a plywood wall (shot through, broken up, blown apart like one). Metal: knob and hinges
// can't be shot, but a C4 charge close to it dents it and blows it open (lock or not). Offline only for now (test map).
const doors = [];
const DOOR_W = 0.9, DOOR_H = 2.05, DOOR_OPEN = 1.65, DOOR_HOLD_T = 0.22, DOOR_REACH = 2.3;
const DOOR_KIND = {
  plywood: { leaf: 'plywood', color: 0xd2a874, frame: 'crate', frameColor: 0x8a6a48, t: 0.035, k: 34, c: 7, shootParts: true },
  metal: { leaf: 'metal', color: 0x55606a, frame: 'metal', frameColor: 0x3c4248, t: 0.05, k: 22, c: 7.5, shootParts: false }
};
const _dv = new V3(), _dq = new THREE.Quaternion(), _dRay = new THREE.Raycaster();
const knobMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, metalness: 0.85, roughness: 0.3 }), hingeMat = new THREE.MeshStandardMaterial({ color: 0x8c8676, metalness: 0.8, roughness: 0.4 });

// x, z: the middle of the doorway on the floor; rot: which way the wall runs (0: along x); hingeSide: -1 left, 1 right;
// lock: 0 unlocked, or 1 / -1, the side (along the door's normal) it can be opened from
function addDoor(x, z, rot, kind, hingeSide, lock) {
  const K = DOOR_KIND[kind], g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; worldGroup.add(g); g.updateMatrixWorld(true);
  const d = { kind, K, g, hs: hingeSide || 1, lock: lock || 0, a: 0, w: 0, tgt: 0, hold: false, knob: null, hinges: [], fallen: false, fall: null, segs: [], rattle: 0 };
  // the frame: two jambs and a head, solid like any box in the map
  const fw = 0.07, fd = Math.max(0.1, K.t + 0.06), wl = new V3();
  for (const [lx, w, h, y] of [[-(DOOR_W / 2 + fw / 2), fw, DOOR_H + fw, 0], [DOOR_W / 2 + fw / 2, fw, DOOR_H + fw, 0], [0, DOOR_W + fw * 2, fw, DOOR_H]]) {
    wl.set(lx, 0, 0).applyAxisAngle(_Y, rot); const sw = Math.abs(Math.cos(rot)) > 0.5;
    addBox(x + wl.x, y, z + wl.z, sw ? w : fd, h, sw ? fd : w, K.frame, K.frameColor);
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
  // the knob on both faces, on the side away from the hinges
  const kg = new THREE.Group(); kg.position.set(-d.hs * (DOOR_W / 2 - 0.07), 0.98 - DOOR_H / 2, 0); leaf.add(kg);
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), knobMat); k.position.z = s * (K.t / 2 + 0.035); k.scale.z = 0.8;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.035, 8), knobMat); st.rotation.x = Math.PI / 2; st.position.z = s * (K.t / 2 + 0.017);
    for (const m of [k, st]) { m.castShadow = true; m.userData.surf = 'metal'; m.userData.kind = 'metal'; m.userData.doorPart = { d, type: 'knob' }; kg.add(m); worldMeshes.push(m); } }
  d.knob = kg;
  // three hinges on the jamb at the hinge edge
  for (const hy of [0.25, DOOR_H / 2, DOOR_H - 0.25]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), hingeMat); h.position.set(d.hs * DOOR_W / 2, hy, 0); h.castShadow = true;
    h.userData.surf = 'metal'; h.userData.kind = 'metal'; h.userData.doorPart = { d, type: 'hinge' }; g.add(h); worldMeshes.push(h); d.hinges.push(h);
  }
  doors.push(d); doorBoxes(d);
  return d;
}

// the leaf's box and the four slabs, worked out from where it is now
function doorBoxes(d) {
  const L = d.leaf; (d.fall ? d.fall.pv : d.g).updateMatrixWorld(true); const b = L.userData.box, gp = L.geometry.parameters;
  b.min.set(1e9, 1e9, 1e9); b.max.set(-1e9, -1e9, -1e9);
  for (let i = 0; i < 4; i++) {
    const c = d.segs[i]; c.min.set(1e9, 1e9, 1e9); c.max.set(-1e9, -1e9, -1e9);
    for (const sx of [i / 4, (i + 1) / 4]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      _dv.set((sx - 0.5) * gp.width, (sy - 0.5) * gp.height, sz * gp.depth / 2).applyMatrix4(L.matrixWorld); c.min.min(_dv); c.max.max(_dv); b.min.min(_dv); b.max.max(_dv);
    }
  }
}

// the door the player is looking at, within reach: its leaf or knob, or the doorway itself (an open door is closed by
// looking at its frame)
function doorAimed() {
  if (!doors.length) return null;
  const targets = []; for (const d of doors) if (!d.fallen) { targets.push(d.leaf); if (d.knob && d.knob.parent) targets.push(...d.knob.children); }
  const o = camera.getWorldPosition(new V3()), dir = camera.getWorldDirection(new V3()); _dRay.set(o, dir); _dRay.far = DOOR_REACH;
  const h = _dRay.intersectObjects(targets, false)[0];
  let best = h ? ((h.object.userData.door || (h.object.userData.doorPart && h.object.userData.doorPart.d)) || null) : null, bd = h ? h.distance : DOOR_REACH;
  for (const d of doors) {
    if (d.fallen) continue; const q = d.g.getWorldQuaternion(_dq), n = new V3(0, 0, 1).applyQuaternion(q), c = d.g.getWorldPosition(new V3()), dn = dir.dot(n); if (Math.abs(dn) < 1e-3) continue;
    const t = c.clone().sub(o).dot(n) / dn; if (t < 0 || t > bd) continue;
    const l = o.clone().addScaledVector(dir, t).sub(c).applyQuaternion(q.clone().invert());
    if (Math.abs(l.x) < DOOR_W / 2 + 0.08 && l.y > 0 && l.y < DOOR_H + 0.08) { best = d; bd = t; }
  }
  return best;
}
// which side of the door a point is on (along its normal, +1 or -1)
function doorSide(d, p) { const n = new V3(0, 0, 1).applyQuaternion(d.g.getWorldQuaternion(_dq)); return Math.sign(_dv.copy(p).sub(d.g.getWorldPosition(new V3())).dot(n)) || 1; }
// the angle that swings the door away from whoever opens it
function doorAway(d, p) { return -doorSide(d, p) * d.hs * DOOR_OPEN; }

// F pressed / released while looking at a door
let doorF = null;
function doorKeyDown() { doorLetGo(); const d = doorAimed(); if (!d) return false; doorF = { d, t: 0, p: P.pos.clone() }; return true; }
// a hold ends where the door is (also when the window loses focus mid-hold)
function doorLetGo() { if (doorF) { const d = doorF.d; if (d.hold) { d.hold = false; d.tgt = d.a; d.w = 0; } doorF = null; } }
addEventListener('blur', doorLetGo);
function doorKeyUp() {
  const f = doorF; doorF = null; if (!f) return; const d = f.d;
  if (f.t >= DOOR_HOLD_T) { d.hold = false; d.tgt = d.a; d.w = 0; return; }   // a hold just lets go where it is
  if (d.fallen) return;
  if (Math.abs(d.a) > 0.12) { d.tgt = 0; return; }   // open: push it shut
  if (doorLocked(d, f.p)) { d.rattle = 0.35; blip(180, 0.05, 0.05, 'square'); return; }
  d.tgt = doorAway(d, f.p); d.w += Math.sign(d.tgt) * 1.2; blip(320, 0.03, 0.03);
}
function doorLocked(d, p) { return d.lock && d.knob && d.knob.parent && doorSide(d, p) !== d.lock; }

function updateDoors(dt) {
  if (!doors.length) return;
  // a charge stuck on a door's leaf goes with it as it swings or falls
  for (const c of CHARGES) { if (c.doorChk) { if (c.g.parent && c.g.parent.userData.door) chargePos(c); continue; } c.doorChk = true;
    for (const d of doors) { const L = d.leaf, lp = L.worldToLocal(c.p.clone()), gp = L.geometry.parameters; if (Math.abs(lp.x) < gp.width / 2 + 0.02 && Math.abs(lp.y) < gp.height / 2 + 0.02 && Math.abs(lp.z) < gp.depth / 2 + 0.06) { L.attach(c.g); break; } } }
  if (doorF) {
    doorF.t += dt; const d = doorF.d;
    // held: it eases open, a little at a time, away from the player (or shut again if it was already open the other way)
    if (doorF.t >= DOOR_HOLD_T && !d.fallen && !doorLocked(d, doorF.p)) {
      if (!d.hold) { d.hold = true; d.holdFrom = d.a; d.holdDir = Math.abs(d.a) > 0.12 ? -Math.sign(d.a) : Math.sign(doorAway(d, doorF.p)); }
      d.tgt = d.a + d.holdDir * 0.75 * dt;
      // eased open as far as it goes, or eased shut (it stops at closed)
      if (Math.abs(d.tgt) >= DOOR_OPEN) d.tgt = Math.sign(d.tgt) * DOOR_OPEN; if (Math.abs(d.holdFrom) > 0.12 && Math.sign(d.tgt) !== Math.sign(d.holdFrom)) d.tgt = 0;
    } else if (doorF.t >= DOOR_HOLD_T && doorLocked(d, doorF.p) && d.rattle <= 0) d.rattle = 0.25;
  }
  for (const d of doors) {
    if (d.fallen) { doorFall(d, dt); continue; }
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

// a shot into the knob or a hinge (plywood doors; on a metal door they are just metal)
function doorPartHit(part, hit, dir) {
  const d = part.d, m = hit.object; if (!d.K.shootParts) return false;
  impactFx(hit.point, dir.clone().negate(), 'metal'); noiseHit(2600, 0.06, 0.06);
  if (part.type === 'knob') {
    if (!d.knob || !d.knob.parent) return true;
    // the whole knob comes off the door (both handles): unlocked, it can be pushed open from either side
    const k = d.knob; k.updateMatrixWorld(true); const g = new THREE.Group(); k.matrixWorld.decompose(g.position, g.quaternion, g.scale);
    for (const c of [...k.children]) { const i = worldMeshes.indexOf(c); if (i >= 0) worldMeshes.splice(i, 1); g.add(c); }
    k.removeFromParent(); d.knob = null; d.lock = 0; scene.add(g);
    addProp(g, dir.clone().multiplyScalar(rnd(2, 4)).add(new V3(0, rnd(0.5, 1.5), 0)), new V3(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20)), 0.035, 'knob', 40);
  } else {
    const i = d.hinges.indexOf(m); if (i < 0) return true;
    d.hinges.splice(i, 1); const j = worldMeshes.indexOf(m); if (j >= 0) worldMeshes.splice(j, 1);
    m.updateMatrixWorld(true); const p = m.getWorldPosition(new V3()), q = m.getWorldQuaternion(new THREE.Quaternion()); m.removeFromParent(); m.position.copy(p); m.quaternion.copy(q); scene.add(m);
    addProp(m, dir.clone().multiplyScalar(rnd(1.5, 3)).add(new V3(0, rnd(0.3, 1), 0)), new V3(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25)), 0.015, 'hinge', 40);
    // nothing left holding it: it comes out of the frame and falls
    if (!d.hinges.length) doorDrop(d, dir);
  }
  return true;
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
const _X1 = new V3(1, 0, 0);

// a blast near a door: a metal door is dented where it faces the charge and blown open (the lock gives); a plywood door
// is broken up like any plywood wall (blastWalls), and loses any hinge close to the charge
function doorBlast(p, W) {
  const cW = Math.cbrt(W);
  for (const d of doors) {
    const L = d.leaf, b = L.userData.box, near = new V3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z)), dist = near.distanceTo(p);
    if (dist > 2.2 * cW || d.fallen) continue;
    // which face it was on: from the leaf's own plane (the charge can be stuck right on it)
    const away = new V3(0, 0, 1).applyQuaternion(L.getWorldQuaternion(_dq)), sgn = -(Math.sign(_dv.copy(p).sub(L.getWorldPosition(new V3())).dot(away)) || 1), k = clamp(1 - dist / (2.2 * cW), 0, 1);
    const out = away.clone().multiplyScalar(sgn);
    if (d.kind === 'metal') {
      if (W < 0.5) continue;   // a grenade's blast doesn't move it; a charge does
      doorDent(d, p, k);
      d.lock = 0; d.hold = false; d.tgt = -sgn * d.hs * DOOR_OPEN * (0.6 + 0.4 * k);
      d.w += d.tgt * (6 + 10 * k);
    } else {
      for (const h of [...d.hinges]) if (h.getWorldPosition(new V3()).distanceTo(p) < 0.9 * cW) doorPartHit({ d, type: 'hinge' }, { object: h, point: h.getWorldPosition(new V3()) }, out);
      if (!d.fallen) { d.hold = false; d.w += -sgn * d.hs * 6 * k; d.tgt = Math.abs(d.a) > 0.12 ? d.a : -sgn * d.hs * DOOR_OPEN * k; }
    }
  }
}
// the metal pushed in round the point of the leaf facing the charge, deepest in the middle
function doorDent(d, p, k) {
  const L = d.leaf, G = L.geometry, P = G.attributes.position, lp = L.worldToLocal(p.clone()), side = Math.sign(lp.z) || 1;
  const R = 0.35 + 0.35 * k, depth = 0.02 + 0.07 * k;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x - lp.x, y - lp.y); if (r > R) continue;
    const f = Math.pow(Math.cos(r / R * Math.PI / 2), 2), z0 = Math.sign(z) * d.K.t / 2, pushed = z - z0;
    P.setZ(i, z0 + clamp(pushed - side * depth * f, -0.12, 0.12));
  }
  P.needsUpdate = true; G.computeVertexNormals(); G.computeBoundingSphere(); G.computeBoundingBox();
  if (G.boundsTree) G.disposeBoundsTree(); G.boundsTree = null;   // (the raycast tree is built again for the new shape)
}
function clearDoors() { doors.length = 0; doorF = null; }

// ---- module exports: build.mjs strips this block ----
export { DOOR_H, DOOR_W, addDoor, clearDoors, doorBlast, doorKeyDown, doorKeyUp, doorPartHit, doors, updateDoors };
// ---- end module exports ----
