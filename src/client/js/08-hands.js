// ---------------------------------------------------------------- hands and arms for the viewmodel: gloved, jointed fingers
const _fp = new V3(), _fdir = new V3();
function fingerChain(P, mt, p, d, ax, lens, curls, r) {
  _fp.fromArray(p); _fdir.fromArray(d).normalize(); const axis = new V3().fromArray(ax).normalize();
  for (let i = 0; i < lens.length; i++) {
    _fdir.applyAxisAngle(axis, curls[i]);
    const L = lens[i], c = new THREE.Mesh(new THREE.CapsuleGeometry(r, L, 3, 8), mt);
    c.position.copy(_fp).addScaledVector(_fdir, L / 2); c.quaternion.setFromUnitVectors(_Yc, _fdir); P.add(c);
    _fp.addScaledVector(_fdir, L); r *= 0.9;
  }
  return _fp.clone();
}
// unit-length sleeve (y from elbow -0.5 to wrist +0.5) with folds and a cuff
const sleeveGeo = (() => {
  const pts = [], N = 22;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2(lerp(0.046, 0.031, t) + Math.sin(t * 34) * 0.0012 * (1 - t) + (t > 0.9 ? 0.002 : 0), t - 0.5)); }
  pts.push(new THREE.Vector2(0.026, 0.5));
  return new THREE.LatheGeometry(pts, 16);
})();
function vsleeve(parent, a, b) {
  const A = new V3().fromArray(a), B = new V3().fromArray(b), len = A.distanceTo(B);
  const c = new THREE.Mesh(sleeveGeo, GM.sleeve); c.scale.set(1, len, 1);
  c.position.addVectors(A, B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(_Yc, A.clone().sub(B).normalize());
  parent.add(c); return c;
}
function ell(P, mt, r, pos, sc) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mt); o.position.fromArray(pos); o.scale.fromArray(sc); P.add(o); return o; }
function gloveCuff(P, at, dir) {
  const d = new V3().fromArray(dir).normalize(), c = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.0295, 0.03, 14), KMAT.gpad);
  c.position.fromArray(at).addScaledVector(d, 0.012); c.quaternion.setFromUnitVectors(_Yc, d.clone().negate()); P.add(c);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0292, 0.0298, 0.008, 14), KMAT.gpalm); st.position.fromArray(at).addScaledVector(d, 0.016); st.quaternion.copy(c.quaternion); P.add(st);
}
// support hand: palm on the left of whatever it holds, fingers wrapped underneath and up the right side, thumb forward along the left side
function buildLeftHand(parent) {
  const h = new THREE.Group(); parent.add(h); const G = KMAT.glove, PD = KMAT.gpad;
  ell(h, G, 0.03, [-0.03, -0.008, 0.004], [0.44, 0.98, 1.45]);
  ell(h, G, 0.028, [-0.031, -0.013, 0.052], [0.66, 0.98, 1.0]); ell(h, G, 0.017, [-0.031, 0.01, 0.034], [0.8, 1, 1.1]);
  const zs = [-0.031, -0.0105, 0.0105, 0.031], ln = [[0.04, 0.025, 0.02], [0.043, 0.027, 0.021], [0.041, 0.025, 0.02], [0.034, 0.021, 0.018]];
  for (let i = 0; i < 4; i++) { fingerChain(h, G, [-0.022, -0.031, zs[i]], [1, -0.1, 0], [0, 0, 1], ln[i], [0, 1.05, 0.8], i === 3 ? 0.0086 : 0.0096); ell(h, PD, 0.0092, [-0.025, -0.035, zs[i]], [1.1, 0.75, 1]); }
  fingerChain(h, G, [-0.03, 0.01, 0.028], [0.1, 0.16, -1], [0, 1, 0], [0.032, 0.028], [-0.1, -0.35], 0.0108);
  gloveCuff(h, [-0.031, -0.014, 0.07], [-0.39, -0.66, 0.64]);
  compact(h);
  const fa = new THREE.Mesh(sleeveGeo, GM.sleeve); parent.add(fa);
  return { h, fa, wrist: new V3(-0.036, -0.026, 0.084) };
}
// firing hand on a grip. Local frame: y up the grip axis, z back; index finger rests straight along the frame
function buildGripHand(parent, at, tilt, elbow, o) {
  o = o || {}; const rh = new THREE.Group(); parent.add(rh);
  const h = new THREE.Group(); h.position.fromArray(at); h.rotation.x = tilt; rh.add(h);
  const G = KMAT.glove, PD = KMAT.gpad, w = o.w || 0.014;
  ell(h, G, 0.034, [w + 0.009, 0.004, 0.014], [0.52, 1.22, 0.98]);
  ell(h, G, 0.021, [0.003, 0.04, 0.03], [1.05, 0.62, 0.95]); ell(h, G, 0.025, [w + 0.003, -0.03, 0.04], [0.8, 1.0, 0.9]);
  const ys = [0.02, -0.001, -0.022];
  for (let i = 0; i < 3; i++) { fingerChain(h, G, [w + 0.006, ys[i], -0.014], [-0.3, 0, -1], [0, 1, 0], [0.03, 0.027, 0.022], [0.55, 1.2, 1.05], i === 2 ? 0.0088 : 0.0098); ell(h, PD, 0.0092, [w + 0.013, ys[i], -0.017], [0.8, 1, 1]); }
  if (o.wrap) fingerChain(h, G, [w + 0.006, 0.041, -0.014], [-0.3, 0, -1], [0, 1, 0], [0.03, 0.027, 0.022], [0.55, 1.2, 1.05], 0.0098);
  else fingerChain(h, G, [w + 0.007, 0.041, -0.012], [-0.08, o.idx === undefined ? 0.3 : o.idx, -1], [0, 1, 0], [0.036, 0.026, 0.022], [0, 0.1, 0.12], 0.0096);
  ell(h, PD, 0.0092, [w + 0.012, 0.041, -0.012], [0.8, 1, 1]);
  fingerChain(h, G, [0.004, 0.043, 0.026], [-1, 0.05, -0.45], [0, -1, 0], [0.028, 0.03], [0.1, 0.6], 0.0108);
  h.updateMatrix(); const wr = new V3(w + 0.004, -0.04, 0.05).applyMatrix4(h.matrix), inv = h.matrix.clone().invert();
  const dl = new V3().fromArray(elbow).sub(wr).transformDirection(inv);
  gloveCuff(h, [w + 0.004, -0.034, 0.046], dl.toArray());
  compact(h);
  vsleeve(rh, wr.clone().addScaledVector(new V3().fromArray(elbow).sub(wr).normalize(), 0.022).toArray(), elbow);
  return rh;
}
// visible rounds at the top of a magazine (brass case + copper tip), shown when the mag has ammo
function cartridgeTop(parent, y, type) {
  const grp = new THREE.Group(); grp.position.y = y; parent.add(grp);
  const C0 = { '556': [0.0047, 0.04, 0.0029, 0.016, 0.0042], '545': [0.005, 0.038, 0.0028, 0.017, 0.0044], '9mm': [0.0047, 0.016, 0.0029, 0.008, 0.0042], '50': [0.0098, 0.08, 0.0065, 0.035, 0.0] }, C = C0[type];
  if (!C) return grp;
  const rows = type === '50' ? [[0, 0]] : [[-C[4], 0], [C[4], 0.004]];
  for (const [x, dz] of rows) {
    vcyl(C[0], C[1], brassMatVM, grp, x, 0, C[1] * 0.15 + dz, 12);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(C[2], C[3], 12), copperMat); tip.rotation.x = -Math.PI / 2;
    tip.position.set(x, 0, -C[1] * 0.35 - C[3] / 2 + dz); grp.add(tip);
  }
  return grp;
}
function makePoses(def) {
  const out = {};
  for (const k in def) out[k] = { p: new V3().fromArray(def[k][0]), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(def[k][1][0], def[k][1][1], def[k][1][2])) };
  return out;
}
const VM_DEF = {
  m4: { hand: [[0, -0.09, 0.098], -0.4], elbowR: [0.1, -0.25, 0.37], elbow: [-0.14, -0.31, 0.0], hip: [0.115, -0.152, -0.29], ads: [0, -0.0665, -0.24], sightH: 0.0733, magAxis: [0, -1, 0.12],
    imp: { H0: [[0, -0.006, -0.19], [0, 0, 0]] },   // the Studio M4's quad rail is shorter and sits lower: the support hand goes on it, not on the barrel
    H0: [[0, 0.002, -0.3], [0, 0, 0]], H1: [0, -0.112, -0.03], rot: [0, 0, 0], d: [0.07, 0.11], HP: [[-0.15, -0.42, 0.1], [0.6, 0, 0.4]], HB: [[-0.006, -0.02, 0.004], [0, 0, 0.2]], HBp: [[0.0, -0.022, 0.006], [0, 0, 0.2]], HV: [[-0.13, 0.15, 0.04], [1.0, -0.55, 0.35]] },
  g17: { hand: [[0, -0.07, 0.068], -0.36, { idx: 0.5, w: 0.013 }], elbowR: [0.07, -0.22, 0.42], elbow: [-0.11, -0.25, 0.42], hip: [0.085, -0.16, -0.38], ads: [0, -0.0352, -0.5], sightH: 0.0212, magRot: true,
    imp: { ads: [0, -0.0229, -0.5] },   // the Studio G17's sights sit lower over the bore
    H0: [[0.0, -0.056, 0.064], [-0.36, 0, 0]], H1: [0.0, -0.118, 0.082], rot: [-0.36, 0, 0], d: [0.06, 0.08], HP: [[-0.12, -0.4, 0.16], [0.4, 0, 0.4]], HB: [[-0.012, -0.03, 0.014], [0, 0, 0.2]], HBp: [[-0.008, -0.028, 0.016], [0, 0, 0.2]], HV: [[-0.11, 0.05, 0.07], [0.7, -0.55, 0.35]], flash: 0.7 },
  m107: { hand: [[0, -0.135, 0.185], -0.3], elbowR: [0.1, -0.3, 0.46], elbow: [-0.2, -0.32, 0.1], hip: [0.135, -0.185, -0.39], ads: [0, -0.106, -0.33], sightH: 0.106, magAxis: [0, -1, 0], scope: true,
    H0: [[0, -0.06, -0.22], [0, 0, 0]], H1: [0, -0.15, 0.0], rot: [0, 0, 0], d: [0.08, 0.12], HP: [[-0.15, -0.45, 0.12], [0.6, 0, 0.4]], HB: [[0.034, 0.02, 0.0], [0, 0, -0.4]], HBp: [[0.034, 0.02, 0.06], [0, 0, -0.4]], HV: [[-0.16, 0.16, 0.08], [1.0, -0.55, 0.35]], flash: 1.8 },
  ak74: { hand: [[0, -0.083, 0.104], -0.33], elbowR: [0.1, -0.25, 0.38], elbow: [-0.2, -0.3, 0.04], hip: [0.115, -0.152, -0.3], ads: [0, -0.04, -0.34], sightH: 0.04, magAxis: [0, -1, 0.15],
    H0: [[0, -0.006, -0.25], [0, 0, 0]], H1: [0, -0.09, -0.06], rot: [0, 0, 0], d: [0.07, 0.11], HP: [[-0.15, -0.42, 0.1], [0.6, 0, 0.4]], HB: [[0.016, 0.012, 0.11], [0, 0, -0.3]], HBp: [[0.016, 0.012, 0.15], [0, 0, -0.3]], HV: [[-0.14, 0.17, 0.06], [1.0, -0.55, 0.35]] },
  // shotgun: right hand on the stock wrist, left hand on the pump; H1 sits under the loading port, magAxis is the way a shell comes out of it
  m870: { hand: [[0, -0.062, 0.1], -0.98], elbowR: [0.1, -0.24, 0.42], elbow: [-0.2, -0.3, 0.02], hip: [0.115, -0.148, -0.29], ads: [0, -0.0185, -0.34], sightH: 0.0148, magAxis: [0, -0.55, 0.84],
    H0: [[0, -0.031, -0.28], [0, 0, 0]], H1: [0, -0.07, -0.05], rot: [0, 0, 0], d: [0.05, 0.08], HP: [[-0.15, -0.42, 0.1], [0.6, 0, 0.4]], HB: [[0, -0.031, -0.28], [0, 0, 0]], HBp: [[0, -0.031, -0.192], [0, 0, 0]], HV: [[-0.13, 0.15, 0.04], [1.0, -0.55, 0.35]], flash: 1.3 },
  m9: { hand: [[0, -0.07, 0.072], -0.3, { idx: 0.5, w: 0.014 }], elbowR: [0.07, -0.22, 0.42], elbow: [-0.11, -0.25, 0.42], hip: [0.085, -0.16, -0.38], ads: [0, -0.029, -0.5], sightH: 0.016, magRot: true,
    H0: [[0.0, -0.056, 0.064], [-0.3, 0, 0]], H1: [0.0, -0.118, 0.082], rot: [-0.3, 0, 0], d: [0.06, 0.08], HP: [[-0.12, -0.4, 0.16], [0.4, 0, 0.4]], HB: [[-0.012, -0.02, 0.02], [0, 0, 0.2]], HBp: [[-0.008, -0.018, 0.024], [0, 0, 0.2]], HV: [[-0.11, 0.05, 0.07], [0.7, -0.55, 0.35]], flash: 0.7 }
};
const VM_KIT = makeKit(true);
function buildVM(id) {
  const M = GUN_MODEL[id](VM_KIT), g = M.g, D = M.imported && VM_DEF[id].imp ? Object.assign({}, VM_DEF[id], VM_DEF[id].imp) : VM_DEF[id];
  const brass = M.cart || cartridgeTop(M.mag, M.brass[0], M.brass[1]); brass.userData.keep = true;
  for (const grp of [g, M.mag, M.slide, M.chg]) if (grp) { compact(grp); grp.children.forEach(c => { if (c.isGroup && c !== M.mag && c !== M.slide && c !== M.chg && c !== brass) compact(c); }); }
  const port = new THREE.Object3D(); port.position.fromArray(M.port); (M.slide || g).add(port);
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(M.muzzle); g.add(muzzle);
  const flash = addFlash(muzzle); if (D.flash) flash.scale.setScalar(D.flash);
  const rh = buildGripHand(g, D.hand[0], D.hand[1], D.elbowR, D.hand[2]);
  const L = buildLeftHand(g); vm.add(g);
  const magAxis = D.magRot ? new V3(0, -1, 0).applyEuler(M.mag.rotation) : new V3().fromArray(D.magAxis).normalize();
  const W = { dust: M.dust || null, imported: !!M.imported, ironsY: M.ironsY, boltIn: M.boltIn || null, bolt: M.bolt || null, boltMode: M.boltMode, boltTravel: M.travel || 0, boltK: 0, heat: 0, id, rh, g, mag: M.mag, magBase: M.mag.position.clone(), magQBase: M.mag.quaternion.clone(), magAxis, muzzle, flash, port, chg: M.chg, ret: null, slide: M.slide, brass, L, scope: !!D.scope,
    elbow: new V3().fromArray(D.elbow), hip: new V3().fromArray(D.hip), ads: new V3().fromArray(D.ads), sightH: D.sightH };
  if (M.eye) W.lens = W.scopeLens = makeScopeLens(g, M.eye, M.eyeR, 6, 'mildot');
  const H1 = new V3().fromArray(D.H1), r0 = D.rot, r1 = [r0[0] + (D.magRot ? 0.06 : 0.1), r0[1], r0[2]];
  W.poses = makePoses({ H0: D.H0, H1: [H1.toArray(), r0], H1d: [H1.clone().addScaledVector(magAxis, D.d[0]).toArray(), r0], H1dd: [H1.clone().addScaledVector(magAxis, D.d[1]).toArray(), r1],
    H1up: [H1.clone().addScaledVector(magAxis, -0.006).toArray(), r0], H1miss: [H1.clone().addScaledVector(magAxis, 0.022).add(new V3(0.009, 0, -0.012)).toArray(), [r0[0] + 0.12, r0[1], r0[2] - 0.1]],
    HP: D.HP, HB: D.HB, HBp: D.HBp, HV: D.HV });
  setupArms(W, D, !!D.magRot);
  return W;
}
// third-person / ground versions: one cached vertex-coloured geometry per weapon (body and magazine)
const gunVcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
const TP_KIT = makeKit(false, m => mat(m.color ? m.color.getHex() : 0x202020, 0.6, 0));
const TP_OFF = { m870: [0, -0.027, -0.38], m4: [0, 0.005, -0.345], ak74: [0, 0.005, -0.4], m107: [0, 0.01, -0.5], g17: [0, 0, -0.03], m9: [0, 0, -0.03] };
const TP_FORE = { m870: [-0.004, -0.046, -0.28], m4: [-0.004, -0.02, -0.26], ak74: [-0.004, -0.024, -0.2], m107: [-0.004, -0.1, -0.08] };
if (IMPORTED.m4) TP_FORE.m4 = [-0.004, -0.03, -0.19];
const tpCache = {};
function tpGunGeo(id) {
  if (tpCache[id]) return tpCache[id];
  const M = GUN_MODEL[id](TP_KIT), D = VM_DEF[id]; M.g.updateMatrixWorld(true);
  // an imported model keeps its UVs and textures; the cartridges stay out (hidden in the magazine at that distance)
  const body = M.textured ? bakeTextured(M.g, [M.mag]) : bakeColored(M.g, [M.mag]), mag = M.textured ? bakeTextured(M.mag, [M.cart]) : bakeColored(M.mag);
  return tpCache[id] = { body, mag, mat: M.textured ? body.userData.mats : null, magMat: M.textured ? mag.userData.mats : null, magPos: M.mag.position.clone(), magRot: M.mag.rotation.clone(), grip: D.hand[0], H0: D.H0[0], muzzle: M.muzzle };
}
function tpGun(id, shadow) {
  const C = tpGunGeo(id), off = TP_OFF[id], pistol = id === 'g17' || id === 'm9', mt = shadow ? shadowMat : (C.mat || gunVcMat);
  const g = new THREE.Group(), inner = new THREE.Group(); inner.position.fromArray(off); g.add(inner);
  const body = new THREE.Mesh(C.body, mt); body.castShadow = true; body.userData.keep = true; inner.add(body);
  const mag = new THREE.Group(); mag.position.copy(C.magPos); mag.rotation.copy(C.magRot); inner.add(mag);
  const mm = new THREE.Mesh(C.mag, shadow ? shadowMat : (C.magMat || gunVcMat)); mm.castShadow = true; mm.userData.keep = true; mag.add(mm);
  const mk = (p, dx, dy, dz) => mark(g, p[0] + off[0] + (dx || 0), p[1] + off[1] + (dy || 0), p[2] + off[2] + (dz || 0));
  const fore = pistol ? mk(C.grip, -0.018, -0.004, -0.008) : mk(TP_FORE[id]);
  return { g, mag, body, grip: mk(C.grip, 0.004, 0.012, 0), fore, well: mk([C.magPos.x, C.magPos.y - 0.03, C.magPos.z]) };
}
// a loose magazine or whole gun as a single mesh (ground items, magazines in hands)
function gunMatOf(id) { return tpGunGeo(id).magMat || gunVcMat; }
function gunItemMesh(id, magOnly) { const C = tpGunGeo(id), mt = C.mat || gunVcMat, mgt = C.magMat || gunVcMat; const m = new THREE.Mesh(magOnly ? C.mag : C.body, magOnly ? mgt : mt); m.castShadow = true; if (!magOnly) { const mg = new THREE.Mesh(C.mag, mgt); mg.position.copy(C.magPos); mg.rotation.copy(C.magRot); mg.castShadow = true; m.add(mg); } return m; }
// ---------------------------------------------------------------- rigged arms on the viewmodel guns
// The hand-built hands stay as invisible targets (their poses and reload choreography are already tuned); the skinned
// arms follow them: the firing hand is set once on the grip, the support hand rides on the left-hand target, and the
// fingers of both close on what they hold.
const ARM_SET = {
  // firing hand in the grip frame (y up the grip, z back): back of the hand to the right, middle knuckle at the front-right
  // corner of the grip, fingers wrapping the front strap to the left side
  grip: { pn: [-1, 0, 0], fwd: [0, 0.1, -1], mcp: [0.02, -0.004, -0.01], thumb: [-0.024, 0.045, -0.025] },
  // support hand on a rifle's handguard, in the left-hand target's frame: palm under and to the left, knuckles along the
  // bottom right edge, fingers up the right side, thumb along the left
  fore: { pn: [0.2, 0.98, 0.0], fwd: [0.9, -0.1, -0.42], mcp: [0.012, -0.052, 0.0], thumb: [-0.04, 0.005, -0.05], shoulder: [-0.3, -0.12, 0.32], dev: 0.12, squeeze: 0.3 },
  // support hand on a pistol: palm on the firing hand's fingers from the left, fingers wrapping over them
  // thumbs-forward support grip, in the gun's own frame. The heel of the support palm fills the bare left grip panel under the
  // firing thumb; the wrist is canted down and the fingers wrap the front of the firing
  // hand's fingers, the index tight under the trigger guard (the knuckles run forward, the fingers fold down round the front); the support thumb lies along the frame under the slide, pointing
  // at the target. The forearm continues the hand with the wrist bent toward the little finger (ulnar deviation, dev radians),
  // and the elbow sits where that forearm meets an upper arm hanging from the left shoulder.
  pist: { g: 1, pn: [0.95, 0.28, 0.0], fwd: [0.16, -0.22, -0.96], mcp: [-0.036, -0.066, 0.05], thumb: [-0.019, -0.013, -0.006], shoulder: [-0.15, -0.34, 0.6], dev: 0.42 }
};
function palmVerts(rig) {
  if (rig._pv) return rig._pv;
  const g = rig.mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, hb = rig.mesh.skeleton.bones.indexOf(rig.bones.hand), out = [];
  for (let i = 0; i < P.count; i++) if (SI.getX(i) === hb && SW.getX(i) > 0.95) out.push(new V3().fromBufferAttribute(P, i));
  return rig._pv = out;
}
// back the hand off along its palm normal until no palm point is inside what it holds
function settleHand(rig, cloud, q, wrist, pnW) {
  const pv = palmVerts(rig), p = new V3();
  for (let it = 0; it < 40; it++) {
    let hit = false;
    for (let i = 0; i < pv.length && !hit; i += 2) { p.copy(pv[i]).sub(rig.wrist0).applyQuaternion(q).add(wrist); if (cloud.hit(p, 0.0012)) hit = true; }
    // the knuckles too: a finger whose base is already inside what it holds can never close around it
    for (const f of FINGERS) { if (f === 'thumb' || hit) continue; p.copy(rig.fing[f].j[0]).sub(rig.wrist0).applyQuaternion(q).add(wrist); if (cloud.hit(p, rig.fing[f].r[0] * 0.95)) hit = true; }
    if (!hit) return wrist;
    wrist.addScaledVector(pnW, -0.0012);
  }
  return wrist;
}
function postedVerts(rig, step) {
  rig.apply(); rig.root.updateMatrixWorld(true); const out = [], v = new V3(), n = rig.mesh.geometry.attributes.position.count;
  for (let i = 0; i < n; i += step || 1) out.push(rig.mesh.getVertexPosition(i, v).clone());
  return out;
}
// where the elbow goes, given the wrist W, the hand's finger direction f and palm normal n, and the shoulder S.
// The elbow lies on the circle where the sphere of forearm length around the wrist meets the sphere of upper-arm length round
// the shoulder. Of all points on that circle, take the one whose forearm direction is closest to the hand's own axis bent by the
// wrist's natural deviation (rotating -f about the palm normal by dev, the way that brings the forearm down), with a slight
// preference for the elbow hanging down rather than winging out.
function solveElbow(W, f, n, S, dev, Lf, Lu) {
  Lf = Lf || 0.254; Lu = Lu || 0.3;
  const back = f.clone().negate(), q = new THREE.Quaternion();
  const cand = [dev || 0, -(dev || 0)].map(a => back.clone().applyQuaternion(q.setFromAxisAngle(n, a)));
  const sc = c => c.z * 0.5 - c.y, nat = sc(cand[0]) > sc(cand[1]) ? cand[0] : cand[1];   // the one that brings the forearm down and back toward the body
  const d = S.clone().sub(W), D = Math.min(d.length(), Lf + Lu - 1e-4), u = d.clone().normalize();
  const a = (Lf * Lf - Lu * Lu + D * D) / (2 * D), h = Math.sqrt(Math.max(0, Lf * Lf - a * a));   // circle centre distance from W, radius
  const C = W.clone().addScaledVector(u, a), e1 = new V3(0, 1, 0).cross(u); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize(); const e2 = u.clone().cross(e1);
  let best = null, bs = Infinity;
  for (let i = 0; i < 180; i++) {
    const t = i / 180 * Math.PI * 2, E = C.clone().addScaledVector(e1, Math.cos(t) * h).addScaledVector(e2, Math.sin(t) * h);
    const fd = E.clone().sub(W).normalize(), cost = Math.acos(clamp(fd.dot(nat), -1, 1)) + 0.25 * Math.max(0, E.y - W.y) / Lf;
    if (cost < bs) { bs = cost; best = E; }
  }
  return best;
}
function setupArms(W, D, pistol) {
  if (!ARM_DATA) return;
  const g = W.g, R = new ArmRig('R'), L = new ArmRig('L');
  g.add(R.root, L.root); g.updateMatrixWorld(true);
  const skip = o => o.userData.armSkip, hide = o => { o.traverse(c => { if (c.isMesh) { c.visible = false; c.userData.armSkip = true; } }); };
  hide(W.rh); hide(W.L.h); W.L.fa.material = new THREE.MeshBasicMaterial({ visible: false }); W.L.fa.userData.armSkip = true;
  const gun = new GraspCloud().addTree(g, skip);
  // firing hand: frame of the hand-built grip hand
  // a pistol hand sits a little lower in the grip than on a rifle's pistol grip (the web of the hand under the slide's tang, not up against it)
  const h = W.rh.children[0]; h.updateMatrix(); const hq = h.quaternion, S = pistol ? Object.assign({}, ARM_SET.grip, { mcp: [0.02, -0.017, -0.006], thumb: [-0.024, 0.033, -0.025] }) : ARM_SET.grip;
  const pnR = v3a(S.pn).applyQuaternion(hq), fR = v3a(S.fwd).applyQuaternion(hq), qR = R.orient(fR, pnR);
  const wR = settleHand(R, gun, qR, R.wristForMcp(qR, v3a(S.mcp).applyMatrix4(h.matrix)), pnR);
  R.setHand(qR, wR); R.elbowT.fromArray(D.elbowR); R.shoulderT.copy(R.elbowT).add(new V3(0.07, -0.12, 0.26));
  W.curlR = graspSolve(R, gun, { index: { fixed: [-0.05, 0.06, 0.05, 0.45] }, thumb: { fixed: [0, 0, 0] } });
  W.curlR.thumb = thumbTo(R, gun, v3a(S.thumb).applyMatrix4(h.matrix));
  // trigger finger: along the frame by default, into the guard on the trigger when shooting
  W.curlRT = Object.assign({}, W.curlR, graspSolve(R, gun, { thumb: { fixed: [0, 0, 0] }, middle: { fixed: [0, 0, 0] }, ring: { fixed: [0, 0, 0] }, pinky: { fixed: [0, 0, 0] }, index: { start: [-0.05, 0.05, 0.05], lim: [0.75, 1.2, 0.9], rate: [1, 0.8, 0.6] } }));
  // magazine release: the trigger finger (rifles) or the thumb (pistols) reaches the button while the magazine drops
  let rel = null; g.traverse(o => { if (o.userData.part === 'MagazineRelease' || o.userData.part === 'MagRelease') rel = o; });
  if (rel) {
    rel.geometry.computeBoundingBox(); const bb = rel.geometry.boundingBox, mid = bb.getCenter(new V3()), f = pistol ? 'thumb' : 'index';
    const tip = new V3(pistol ? bb.min.x - 0.004 : bb.max.x + 0.004, mid.y, mid.z);
    W.curlRM = Object.assign({}, W.curlR); W.curlRM[f] = fingerTo(R, new GraspCloud(), f, tip);
    W.magRel = { m: rel, x0: rel.position.x, dx: pistol ? 0.0025 : -0.0025 };
  }
  W.curlRT.middle = W.curlR.middle; W.curlRT.ring = W.curlR.ring; W.curlRT.pinky = W.curlR.pinky; W.curlRT.thumb = W.curlR.thumb; W.curlRcur = lerpCurls(W.curlR, W.curlR, 0);
  R.setCurls(W.curlR); R.apply();
  // support hand, rigid on the left-hand target: solved at rest on the gun, and again holding the magazine
  const H0 = W.poses.H0, SL = pistol ? ARM_SET.pist : ARM_SET.fore;
  // pistol support hand is specified straight in the gun's frame (G), the rifle one in the left-hand target's frame
  const toG = (v, pt) => SL.g ? v3a(v) : pt ? v3a(v).applyQuaternion(H0.q).add(H0.p) : v3a(v).applyQuaternion(H0.q);
  const pnL = toG(SL.pn).normalize(), fL = toG(SL.fwd).normalize(), qL = L.orient(fL, pnL);
  const cloudL = pistol ? new GraspCloud().addTree(g, skip).addPoints(postedVerts(R, 1)) : gun;
  const wL = settleHand(L, cloudL, qL, L.wristForMcp(qL, toG(SL.mcp, true)), pnL);
  if (SL.shoulder) W.elbow.copy(solveElbow(wL, fL, pnL, v3a(SL.shoulder), SL.dev));
  L.setHand(qL, wL);
  const iq = H0.q.clone().invert();
  W.armOffL = { q: iq.clone().multiply(qL), p: wL.clone().sub(H0.p).applyQuaternion(iq) };
  const curlRest = graspSolve(L, cloudL, { thumb: { fixed: [0, 0, 0] } }); curlRest.thumb = thumbTo(L, cloudL, toG(SL.thumb, true));
  // a firm grip: the fingers close a little past first contact, pressing into the handguard instead of resting round it
  if (SL.squeeze) for (const f of ['index', 'middle', 'ring', 'pinky']) curlRest[f] = curlRest[f].map((v, k) => k < 3 ? v + SL.squeeze * (k === 0 ? 0.6 : 1) : v);
  const H1 = W.poses.H1; L.setHand(H1.q.clone().multiply(W.armOffL.q), W.armOffL.p.clone().applyQuaternion(H1.q).add(H1.p));
  const mp = new V3(0, -0.03, 0); W.mag.localToWorld(mp); g.worldToLocal(mp);
  const curlMag = graspSolve(L, gun, { thumb: { fixed: [0, 0, 0] } }); curlMag.thumb = thumbTo(L, gun, mp.clone().add(new V3(-0.02, 0, 0)));
  const curlOpen = {}; for (const f of FINGERS) curlOpen[f] = f === 'thumb' ? [0.1, 0, 0, 0.2] : [0.25, 0.35, 0.25];
  for (const k in W.poses) W.poses[k].c = k === 'H0' || k === 'HV' ? curlRest : k === 'HB' || k === 'HBp' ? curlOpen : curlMag;
  L.setCurls(curlRest); L.elbowT.copy(W.elbow); if (SL.shoulder) L.shoulderT.fromArray(SL.shoulder); else L.shoulderT.copy(L.elbowT).add(new V3(-0.07, -0.12, 0.26)); L.apply();
  W.armR = R; W.armL = L; W.curlL = lerpCurls(curlRest, curlRest, 0);
  W.curlOpenL = {}; for (const f of FINGERS) W.curlOpenL[f] = f === 'thumb' ? [0.25, 0.1, 0.1, 0.35] : [0.06, 0.1, 0.06, 0];   // flat hand, for pushing on things
  rackPoses(W, D, L, gun, skip);
  L.setHand(qL, wL); L.setCurls(curlRest); L.apply();
}
// ---------------------------------------------------------------- hand poses for working the action (F)
// where each gun's action is worked, in the gun's frame: the hand's palm normal and finger direction, where its middle knuckle
// goes, and how far the part travels. 'chg': AR charging handle at the back of the receiver; 'side': a handle on the right of
// the bolt carrier; 'slide': a pistol slide gripped over the top at the rear serrations.
const RACK = {
  m4: { kind: 'chg', pn: [0.15, -0.99, 0.0], fwd: [0.8, 0.0, -0.6], mcp: [-0.03, 0.058, 0.128], travel: 0.07, slap: [-0.0147, -0.023, 0.0085] },
  ak74: { kind: 'side', pn: [0.2, -0.98, 0.0], fwd: [0.98, 0.0, -0.2], mcp: [-0.012, 0.052, -0.045], travel: 0.085 },
  m107: { kind: 'side', pn: [0.2, -0.98, 0.0], fwd: [0.98, 0.0, -0.2], mcp: [0.02, 0.07, 0.0], travel: 0.09 },
  // overhand on the slide: palm across the top, heel of the hand and thumb down the left serrations, knuckles over the
  // right top edge so the fingers fold down onto the right serrations and pinch
  g17: { kind: 'slide', pn: [0.55, -0.83, 0.05], fwd: [0.8, 0.55, -0.22], mcp: [0.014, 0.034, 0.068], thumb: [-0.017, 0.004, 0.072], travel: 0.04, stop: [-0.0175, 0.003, 0.022] },
  m9: { kind: 'slide', pn: [0.15, -0.99, 0.0], fwd: [0.97, 0.0, 0.25], mcp: [-0.018, 0.044, 0.07], travel: 0.04, stop: [-0.017, 0.006, 0.035] }
};
// a left-hand target pose (W.poses entry) that puts the rigged hand at q / wrist
function poseForRig(W, q, wrist) {
  const hq = q.clone().multiply(W.armOffL.q.clone().invert()), hp = wrist.clone().sub(W.armOffL.p.clone().applyQuaternion(hq));
  return { p: hp, q: hq };
}
function rackPoses(W, D, L, gun, skip) {
  const R = RACK[W.id]; if (!R) return; W.rack = R;
  const q = L.orient(v3a(R.fwd), v3a(R.pn)), w = settleHand(L, gun, q, L.wristForMcp(q, v3a(R.mcp)), v3a(R.pn).normalize());
  L.setHand(q, w); const c = graspSolve(L, gun, { thumb: { fixed: [0, 0, 0] } }); c.thumb = thumbTo(L, gun, R.thumb ? v3a(R.thumb) : v3a(R.mcp).add(new V3(0.0, -0.035, 0.02)));
  W.poses.HC = Object.assign(poseForRig(W, q, w), { c });
  W.poses.HCb = Object.assign(poseForRig(W, q, w.clone().add(new V3(0, 0, R.travel))), { c });
  if (R.slap) {
    // flat palm onto the bolt catch, fingers forward along the receiver
    const sq = L.orient(new V3(0, 0.35, -0.94), new V3(1, 0, 0)), sw = L.wristForPalm(sq, v3a(R.slap).add(new V3(-0.009, -0.022, 0.012)));
    const open = {}; for (const f of FINGERS) open[f] = f === 'thumb' ? [0.15, 0.1, 0.1, 0.3] : [0.05, 0.1, 0.08, 0];
    W.poses.HS = Object.assign(poseForRig(W, sq, sw.clone().add(new V3(-0.05, 0.01, 0.01))), { c: open });
    W.poses.HSp = Object.assign(poseForRig(W, sq, sw), { c: open });
  }
  if (R.stop) {
    // pistol: the support thumb rides up onto the slide stop and pushes it down; the rest of the hand stays on the grip
    const H0 = W.poses.H0; L.setHand(H0.q.clone().multiply(W.armOffL.q), W.armOffL.p.clone().applyQuaternion(H0.q).add(H0.p));
    const cl = new GraspCloud().addTree(W.g, skip), up = Object.assign({}, H0.c), dn = Object.assign({}, H0.c);
    up.thumb = thumbTo(L, cl, v3a(R.stop).add(new V3(-0.004, 0.006, 0))); dn.thumb = thumbTo(L, new GraspCloud(), v3a(R.stop).add(new V3(0, -0.004, 0)));
    W.poses.HT = { p: H0.p.clone(), q: H0.q.clone(), c: up }; W.poses.HTp = { p: H0.p.clone(), q: H0.q.clone(), c: dn };
  }
}
// per frame: the support arm follows its target, fingers blend between the poses' grips
// support hand on a vertical foregrip: the firing hand's grip, mirrored
function solveVfg(W) {
  const vg = W.vfgHand, L = W.armL, g = W.g, under = MOUNTS[WEAPONS[VMW.indexOf(W)] ? WEAPONS[VMW.indexOf(W)].id : 'm4'].under;
  vg.traverse(c => { if (c.isMesh) { c.visible = false; c.userData.armSkip = true; } });
  const gq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 0, 0)), at = new V3(0, under[1] - 0.05, under[2] + 0.002), S = ARM_SET.grip;
  const mir = v => new V3(-v[0], v[1], v[2]);
  const pn = mir(S.pn).applyQuaternion(gq), fw = mir(S.fwd).applyQuaternion(gq), q = L.orient(fw, pn);
  const cloud = new GraspCloud().addTree(g, o => o.userData.armSkip);
  const w = settleHand(L, cloud, q, L.wristForMcp(q, mir(S.mcp).applyQuaternion(gq).add(at)), pn);
  L.setHand(q, w);
  const c = graspSolve(L, cloud, { thumb: { fixed: [0, 0, 0] } }); c.thumb = thumbTo(L, cloud, mir(S.thumb).applyQuaternion(gq).add(at));
  return { q, w, c };
}
function updateArms(W) {
  if (!W.armL) return;
  const L = W.armL, h = W.L.h, vfg = !!(W.vfgHand && W.vfgHand.visible);
  L.mesh.visible = h.visible || vfg; W.armR.mesh.visible = W.rh.visible;
  if (vfg) { if (!W.armVfg) W.armVfg = solveVfg(W); L.setHand(W.armVfg.q, W.armVfg.w); L.setCurls(W.armVfg.c); }
  else { L.setHand(h.quaternion.clone().multiply(W.armOffL.q), W.armOffL.p.clone().applyQuaternion(h.quaternion).add(h.position)); L.setCurls(W.curlL); }
  L.apply();
  const R = W.armR, k = mouse.left ? 1 : P.ads;
  W.trigK = damp(W.trigK || 0, k > 0.5 && !P.reloading ? 1 : 0, 14, 1 / 60);
  lerpCurls(W.curlR, W.curlRT, W.trigK, W.curlRcur);
  // magazine out: press the release just as it drops
  const rr = P.reloading && VMW[P.weapon] === W ? P.reloadT / P.reloadDur : -1, pr = W.curlRM ? ramp(rr, 0.05, 0.1) * (1 - ramp(rr, 0.16, 0.22)) : 0;
  if (pr > 0) lerpCurls(W.curlRcur, W.curlRM, pr, W.curlRcur);
  if (W.magRel) W.magRel.m.position.x = W.magRel.x0 + W.magRel.dx * ramp(pr, 0.6, 1);
  R.setCurls(W.curlRcur); R.apply();
}
const VMW = WEAPONS.map(w => buildVM(w.id));
// left-hand choreography. Reloads include a fumbled first try at the magazine well, a slap to seat it and a tug to check it
const SEQ = {
  tac: { keys: [[0, 'H0'], [0.1, 'H1'], [0.14, 'H1'], [0.2, 'H1d'], [0.36, 'HP'], [0.46, 'HP'], [0.57, 'H1miss'], [0.615, 'H1d'], [0.665, 'H1'], [0.69, 'H1up'], [0.73, 'H1'], [0.79, 'H1d'], [0.83, 'H1'], [0.95, 'H0'], [1, 'H0']], held: [[0.12, 0.665]], hidden: [], fum: 0.57, seat: 0.665 },
  empty: { keys: [[0, 'H0'], [0.09, 'H1'], [0.13, 'H1'], [0.17, 'H1d'], [0.34, 'HP'], [0.43, 'HP'], [0.54, 'H1miss'], [0.595, 'H1d'], [0.645, 'H1'], [0.675, 'H1up'], [0.71, 'H1'], [0.8, 'HB'], [0.845, 'HBp'], [0.885, 'HB'], [1, 'H0']], held: [[0.42, 0.645]], hidden: [[0.13, 0.42]], fum: 0.54, seat: 0.645 },
  inspect: { keys: [[0, 'H0'], [0.12, 'H1'], [0.24, 'H1dd'], [0.4, 'HV'], [0.66, 'HV'], [0.78, 'H1dd'], [0.86, 'H1'], [1, 'H0']], held: [[0.12, 0.86]], hidden: [] },

};
// shotgun: hand to the shell carrier, a shell up into the loading port, thumb pushes it home; racking keeps the hand on the pump
const SG_SEQ = {
  first: { keys: [[0, 'H0'], [0.24, 'HP'], [0.36, 'HP'], [0.62, 'H1d'], [0.74, 'H1'], [0.84, 'H1up'], [1, 'H1']], held: [[0.33, 0.85]], hidden: [], fum: 9, seat: 0.84 },
  shell: { keys: [[0, 'H1'], [0.24, 'HP'], [0.36, 'HP'], [0.62, 'H1d'], [0.74, 'H1'], [0.84, 'H1up'], [1, 'H1']], held: [[0.33, 0.85]], hidden: [], fum: 9, seat: 0.84 },
  end: { keys: [[0, 'H1'], [1, 'H0']], held: [], hidden: [], fum: 9, seat: 9 },
  rack: { keys: [[0, 'H0'], [1, 'H0']], held: [], hidden: [], fum: 9, seat: 9, rack: 0.05 },
  rackH1: { keys: [[0, 'H1'], [0.26, 'H0'], [1, 'H0']], held: [], hidden: [], fum: 9, seat: 9, rack: 0.28 }
};
// every reload is put together fresh: it may fumble the magazine well, may tug the magazine to check it, and the hand never takes quite the same path
function makeReloadSeq(empty, stress) {
  // an empty reload is the same as a tactical one: the bolt stays where it is until the shooter works it (F)
  const base = SEQ.tac, fumble = Math.random() < 0.22 + 0.6 * stress, tug = !empty && Math.random() < 0.5, warp = rnd(-0.02, 0.02);
  let keys = base.keys.map(k => [k[0] + (k[1] === 'HP' ? warp : 0), fumble || k[1] !== 'H1miss' ? k[1] : 'H1d', /^(H0|H1|H1up|HB|HBp)$/.test(k[1]) ? null : new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.005 + 0.012 * stress)]);
  if (!tug && !empty) keys = keys.filter(k => k[0] !== 0.79 && k[0] !== 0.83);
  return { keys, held: base.held, hidden: base.hidden, fum: fumble ? base.fum : 9, seat: base.seat, fumble };
}
const _po = new V3();
// holding the charging handle / slide back
const HOLD_SEQ = { keys: [[0, 'HCb'], [1, 'HCb']], held: [], hidden: [] };
function inRanges(rs, t) { for (const [a, b] of rs) if (t >= a && t < b) return true; return false; }
function poseAt(W, seq, t, outP, outQ) {
  const k = seq.keys;
  for (let i = 0; i < k.length - 1; i++) {
    if (t <= k[i + 1][0] || i === k.length - 2) {
      const a = W.poses[k[i][1]], b = W.poses[k[i + 1][1]];
      const span = (k[i + 1][0] - k[i][0]) || 1, raw = clamp((t - k[i][0]) / span, 0, 1);
      // short moves snap and settle, long ones start slow and arrive fast
      const u = span < 0.055 ? 1 - Math.pow(1 - raw, 2.4) : span > 0.12 ? lerp(smooth(raw), raw * raw, 0.35) : smooth(raw);
      outP.copy(a.p).lerp(b.p, u); outQ.copy(a.q).slerp(b.q, u);
      if (W.curlL && a.c && b.c) lerpCurls(a.c, b.c, u, W.curlL);
      if (k[i][2]) outP.addScaledVector(k[i][2], 1 - u); if (k[i + 1][2]) outP.addScaledVector(k[i + 1][2], u);
      return;
    }
  }
}
