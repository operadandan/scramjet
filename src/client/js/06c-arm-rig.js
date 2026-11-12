// ---------------------------------------------------------------- skinned viewmodel arms (rigged from the Studio arm model)
// public/models/arms/arms.bin holds both arms already skinned (assets/models/arms/rig.py): upper arm, forearm, hand, and three
// joints for each finger and the thumb. Every bone's bind orientation is the identity, so a joint's rotation is just an angle
// about its own bend axis in bind space. Hands are placed by a target frame (wrist, palm normal, finger direction) and the
// fingers close on whatever they hold: each joint curls until that phalanx touches the gun (or the magazine, or the other hand).
let ARM_DATA = null;
await (async () => {
  try {
    const r = await fetch('/models/arms/arms.bin'); if (!r.ok) throw new Error('arms ' + r.status);
    const b = await r.arrayBuffer(), n = new DataView(b).getUint32(0, true), H = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 4, n))), o = 4 + n;
    const tex = await new THREE.TextureLoader().loadAsync('/models/arms/arm_col.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
    ARM_DATA = { mat };
    for (const side of ['R', 'L']) {
      const a = H.arms[side], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b, o + a.p, a.n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b, o + a.nr, a.n * 3), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b, o + a.uv, a.n * 2), 2));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(b, o + a.si, a.n * 4), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(b, o + a.sw, a.n * 4), 4));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(b, o + a.ix, a.ni), 1));
      g.computeBoundingSphere(); g.boundingSphere.radius = 2;   // posed far from bind: never cull it
      ARM_DATA[side] = { geo: g, F: a.frame };
    }
  } catch (e) { console.warn('rigged arms not loaded, using the built-in hands', e); ARM_DATA = null; }
})();
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const _aq = new THREE.Quaternion(), _aq2 = new THREE.Quaternion(), _av = new V3(), _av2 = new V3(), _am = new THREE.Matrix4(), _am2 = new THREE.Matrix4();
const v3a = a => new V3().fromArray(a);
// basis matrix from three column vectors
function basis(x, y, z) { return new THREE.Matrix4().makeBasis(x, y, z); }
class ArmRig {
  constructor(side) {
    const D = ARM_DATA[side], F = D.F; this.side = side; this.F = F;
    this.root = new THREE.Group(); this.bones = {}; const list = [];
    this.bind = {};
    for (const [name, par, pos] of F.bones) {
      const bo = new THREE.Bone(); bo.name = name; list.push(bo); this.bones[name] = bo; this.bind[name] = v3a(pos);
      if (par < 0) { bo.position.copy(this.bind[name]); this.root.add(bo); }
      else { const pn = F.bones[par][0]; bo.position.copy(this.bind[name]).sub(this.bind[pn]); this.bones[pn].add(bo); }
    }
    this.root.updateMatrixWorld(true);
    this.mesh = new THREE.SkinnedMesh(D.geo, ARM_DATA.mat); this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.root.add(this.mesh); this.mesh.bind(new THREE.Skeleton(list));
    // bind-space hand frame
    this.wrist0 = v3a(F.wrist); this.palm0 = v3a(F.palm); this.fwd0 = v3a(F.fwd); this.lat0 = v3a(F.lat); this.pn0 = v3a(F.pn);
    this.B0inv = basis(this.lat0, this.fwd0, this.pn0).invert();
    this.hs = Math.sign(new V3().crossVectors(this.fwd0, this.pn0).dot(this.lat0));   // handedness: +1 one hand, -1 the mirror
    // per finger: joints (bind), bend axes, lengths, radii
    this.fing = {};
    for (const f of FINGERS) {
      const j = [this.bind[f + '1'], this.bind[f + '2'], this.bind[f + '3'], v3a(F.tips[f])], ax = [];
      const pull = f === 'thumb' ? this.pn0.clone().multiplyScalar(0.86).addScaledVector(this.lat0, -0.5).normalize() : this.pn0;
      for (let i = 0; i < 3; i++) { const d = j[i + 1].clone().sub(j[i]).normalize(); const p = pull.clone().addScaledVector(d, -pull.dot(d)).normalize(); ax.push(new V3().crossVectors(d, p).normalize()); }
      // thumb base also swings across the palm (opposition) about the hand's long axis
      // thumb base swings across the palm about the hand's long axis; a finger's base spreads about the palm normal (+ toward the thumb)
      const opp = f === 'thumb' ? this.fwd0.clone().multiplyScalar(this.pn0.clone().cross(this.fwd0).dot(this.lat0) > 0 ? -1 : 1) : this.pn0.clone().multiplyScalar(-this.hs);
      this.fing[f] = { j, ax, opp, r: F.radius[f], ang: [0, 0, 0], opp_a: 0 };
    }
    this.target = { q: new THREE.Quaternion(), p: new V3() };
    this.elbowT = new V3(); this.shoulderT = new V3();
  }
  // hand rotation for a target frame given by its palm normal and finger direction
  orient(fwd, pn, out) {
    const f = fwd.clone().normalize(), n = pn.clone().addScaledVector(f, -pn.dot(f)).normalize(), l = new V3().crossVectors(f, n).multiplyScalar(this.hs);
    _am.copy(basis(l, f, n)).multiply(this.B0inv); return (out || new THREE.Quaternion()).setFromRotationMatrix(_am);
  }
  // wrist position that puts the palm's surface point on p
  wristForPalm(q, p, out) { return (out || new V3()).copy(this.palm0).sub(this.wrist0).applyQuaternion(q).negate().add(p); }
  // wrist position that puts the middle knuckle on p
  wristForMcp(q, p, out) { return (out || new V3()).copy(this.bind.middle1).sub(this.wrist0).applyQuaternion(q).negate().add(p); }
  setHand(q, wrist) { this.target.q.copy(q); this.target.p.copy(wrist); }
  setCurls(c) {
    for (const f of FINGERS) { const s = this.fing[f], v = c && c[f]; s.ang[0] = v ? v[0] : 0; s.ang[1] = v ? v[1] : 0; s.ang[2] = v ? v[2] : 0; s.opp_a = v && v[3] || 0; }
  }
  // finger joint positions (rig space) for the current hand target and given angles; used by the grasp solver
  fingerFK(f, ang, opp, out) {
    const s = this.fing[f], q = _aq.copy(this.target.q); out = out || [new V3(), new V3(), new V3(), new V3()];
    out[0].copy(s.j[0]).sub(this.wrist0).applyQuaternion(this.target.q).add(this.target.p);
    if (opp) q.multiply(_aq2.setFromAxisAngle(s.opp, opp));
    for (let i = 0; i < 3; i++) {
      q.multiply(_aq2.setFromAxisAngle(s.ax[i], ang[i]));
      out[i + 1].copy(s.j[i + 1]).sub(s.j[i]).applyQuaternion(q).add(out[i]);
    }
    return out;
  }
  apply() {
    const B = this.bones, T = this.target;
    B.hand.position.copy(T.p); B.hand.quaternion.copy(T.q);
    for (const f of FINGERS) {
      const s = this.fing[f];
      B[f + '1'].quaternion.setFromAxisAngle(s.ax[0], s.ang[0]); if (s.opp_a) B[f + '1'].quaternion.premultiply(_aq.setFromAxisAngle(s.opp, s.opp_a));
      B[f + '2'].quaternion.setFromAxisAngle(s.ax[1], s.ang[1]); B[f + '3'].quaternion.setFromAxisAngle(s.ax[2], s.ang[2]);
    }
    // forearm: from the elbow target to the wrist, twisted halfway with the hand so the cuff does not wring
    const e0 = this.bind.fore, w0 = this.wrist0, d0 = _av.copy(w0).sub(e0).normalize(), d = _av2.copy(T.p).sub(this.elbowT).normalize();
    const swing = new THREE.Quaternion().setFromUnitVectors(d0, d);
    const hl = this.lat0.clone().applyQuaternion(T.q), sl = this.lat0.clone().applyQuaternion(swing);
    hl.addScaledVector(d, -hl.dot(d)); sl.addScaledVector(d, -sl.dot(d));
    let tw = Math.atan2(new V3().crossVectors(sl, hl).dot(d), sl.dot(hl)) * 0.5;
    const qf = new THREE.Quaternion().setFromAxisAngle(d, tw).multiply(swing);
    B.fore.quaternion.copy(qf); B.fore.position.copy(T.p).sub(_av.copy(w0).sub(e0).applyQuaternion(qf));
    // upper arm: from the (actual) elbow toward the shoulder target
    const el = B.fore.position, u0 = this.bind.upper.clone().sub(e0).normalize(), u = this.shoulderT.clone().sub(el).normalize();
    const qu = new THREE.Quaternion().setFromUnitVectors(u0, u).multiply(new THREE.Quaternion().setFromAxisAngle(u0, tw));
    B.upper.quaternion.copy(qu); B.upper.position.copy(el).add(this.bind.upper.clone().sub(e0).applyQuaternion(qu));
  }
}
// ---------------------------------------------------------------- grasp: point cloud of what a hand holds, and fingers closing on it
class GraspCloud {
  constructor(cell) { this.c = cell || 0.005; this.m = new Map(); }
  key(x, y, z) { return ((Math.floor(x / this.c) + 512) * 1048576) + ((Math.floor(y / this.c) + 512) * 1024) + (Math.floor(z / this.c) + 512); }
  add(p) { const k = this.key(p.x, p.y, p.z); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(p.x, p.y, p.z); }
  // every triangle of every mesh under root, in root's frame, sampled no coarser than the cell size
  addTree(root, skip) {
    root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(), M = new THREE.Matrix4(), a = new V3(), b = new V3(), c = new V3(), p = new V3();
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || (skip && skip(o))) return;
      let vis = true; for (let q = o; q && q !== root; q = q.parent) if (!q.visible) vis = false; if (!vis) return;
      const m = o.material; if (m && (m.transparent || m.isMeshBasicMaterial || m.isSpriteMaterial)) return;
      M.multiplyMatrices(inv, o.matrixWorld); const g = o.geometry, P = g.attributes.position, I = g.index, n = I ? I.count : P.count;
      for (let t = 0; t < n; t += 3) {
        const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2;
        a.fromBufferAttribute(P, ia).applyMatrix4(M); b.fromBufferAttribute(P, ib).applyMatrix4(M); c.fromBufferAttribute(P, ic).applyMatrix4(M);
        const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), k = Math.min(12, Math.ceil(L / this.c));
        for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) { const u = i / k || 0, v = j / k || 0; p.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v); this.add(p); }
      }
    });
    return this;
  }
  addPoints(pts) { for (const p of pts) this.add(p); return this; }
  hit(p, r) {
    const c = this.c, n = Math.ceil(r / c), r2 = r * r, x0 = Math.floor(p.x / c), y0 = Math.floor(p.y / c), z0 = Math.floor(p.z / c);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
      const a = this.m.get(((x0 + i) + 512) * 1048576 + ((y0 + j) + 512) * 1024 + (z0 + k) + 512); if (!a) continue;
      for (let q = 0; q < a.length; q += 3) { const dx = a[q] - p.x, dy = a[q + 1] - p.y, dz = a[q + 2] - p.z; if (dx * dx + dy * dy + dz * dz < r2) return true; }
    }
    return false;
  }
}
const _gs = [new V3(), new V3(), new V3(), new V3()], _gpt = new V3();
// does phalanx i (or any from i on) of finger f touch the cloud
function fingerHits(rig, cloud, f, ang, opp, from) {
  if (from > 2) return false;
  const J = rig.fingerFK(f, ang, opp, _gs), R = rig.fing[f].r;
  for (let i = from; i < 3; i++) for (let s = 1; s <= 4; s++) { _gpt.copy(J[i]).lerp(J[i + 1], s / 4); if (cloud.hit(_gpt, R[i] * (s === 4 && i === 2 ? 0.8 : 0.92))) return true; }
  return false;
}
// close the hand like a real grasp: all free joints of a finger curl together (the distal ones a little faster); when a
// phalanx touches, it and every joint behind it stop and the joints beyond it keep curling, so fingers wrap what they hold
function graspSolve(rig, cloud, o) {
  o = o || {}; const out = {};
  for (const f of FINGERS) {
    const fo = o[f] || {}, lim = fo.lim || (f === 'thumb' ? [0.9, 1.0, 1.1] : [1.55, 1.9, 1.35]), start = fo.start || [-0.2, -0.15, -0.1];
    if (fo.fixed) { out[f] = fo.fixed.slice(); continue; }
    const ang = start.slice(), rate = fo.rate || (f === 'thumb' ? [0.6, 0.9, 1] : [1, 1.1, 0.8]), free = [true, true, true], st = 0.025;
    let opp = fo.opp !== undefined ? fo.opp : ({ index: -0.05, ring: 0.05, pinky: 0.1 })[f] || 0;   // fingers drawn together
    if (f === 'thumb' && fo.oppMax) { while (opp < fo.oppMax && !fingerHits(rig, cloud, f, ang, opp + 0.03, 0)) opp += 0.03; }
    if (fo.only !== undefined) for (let i = fo.only + 1; i < 3; i++) free[i] = false;
    // a phalanx already inside something at the start (only possible when it starts straight through a gap) is ignored
    // until it comes clear; after that, touching freezes it
    const segHit = i => { const J = rig.fingerFK(f, ang, opp, _gs), R = rig.fing[f].r; for (let s = 1; s <= 4; s++) { _gpt.copy(J[i]).lerp(J[i + 1], s / 4); if (cloud.hit(_gpt, R[i] * (s === 4 && i === 2 ? 0.8 : 0.92))) return true; } return false; };
    const was = [segHit(0), segHit(1), segHit(2)];
    for (let it = 0; it < 160 && (free[0] || free[1] || free[2]); it++) {
      const prev = ang.slice();
      for (let i = 0; i < 3; i++) if (free[i]) { ang[i] = Math.min(lim[i], ang[i] + st * rate[i]); if (ang[i] >= lim[i]) free[i] = false; }
      const now = [segHit(0), segHit(1), segHit(2)];
      // the most proximal phalanx that has just touched: undo this step for it and everything behind it, and freeze them
      let k = -1; for (let i = 0; i < 3; i++) if (now[i] && !was[i]) { k = i; break; }
      if (k >= 0) { for (let i = 0; i <= k; i++) { ang[i] = prev[i]; free[i] = false; } }
      for (let i = 0; i < 3; i++) if (!now[i]) was[i] = false;
    }
    if (fo.add) for (let i = 0; i < 3; i++) ang[i] += fo.add[i] || 0;
    out[f] = [ang[0], ang[1], ang[2], opp];
  }
  return out;
}
// thumb by aim: opposition and the three bends searched so its tip lands near a target point without going through anything
function thumbTo(rig, cloud, target, lim) {
  lim = lim || [[-0.2, 1.2], [-0.4, 1.0], [-0.3, 1.0], [-0.3, 1.1]];
  const x = [0.2, 0.1, 0.1, 0.1], J = [new V3(), new V3(), new V3(), new V3()];
  const cost = v => {
    rig.fingerFK('thumb', [v[1], v[2], v[3]], v[0], J); let c = J[3].distanceToSquared(target) * 1e4;
    const R = rig.fing.thumb.r;
    for (let i = 0; i < 3; i++) for (let s = 1; s <= 3; s++) { _gpt.copy(J[i]).lerp(J[i + 1], s / 3); if (cloud.hit(_gpt, R[i] * 0.9)) c += 4; }
    return c;
  };
  let best = cost(x);
  for (let st = 0.3; st > 0.01; st *= 0.6) for (let rep = 0; rep < 6; rep++) {
    let moved = false;
    for (let i = 0; i < 4; i++) for (const d of [st, -st]) {
      const y = x.slice(); y[i] = clamp(y[i] + d, lim[i][0], lim[i][1]); const c = cost(y);
      if (c < best - 1e-6) { best = c; x[i] = y[i]; moved = true; }
    }
    if (!moved) break;
  }
  return [x[1], x[2], x[3], x[0]];
}
// blend two curl sets
function lerpCurls(a, b, u, out) {
  out = out || {};
  for (const f of FINGERS) { const x = a[f], y = b[f], o = out[f] || (out[f] = [0, 0, 0, 0]); for (let i = 0; i < 4; i++) o[i] = lerp(x[i] || 0, y[i] || 0, u); }
  return out;
}
