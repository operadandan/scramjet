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
  m4: { hand: [[0, -0.09, 0.098], -0.4], elbowR: [0.1, -0.25, 0.37], elbow: [-0.2, -0.3, 0.06], hip: [0.13, -0.135, -0.32], ads: [0, -0.0665, -0.24], sightH: 0.0733, magAxis: [0, -1, 0.12],
    H0: [[0, 0.002, -0.3], [0, 0, 0]], H1: [0, -0.112, -0.03], rot: [0, 0, 0], d: [0.07, 0.11], HP: [[-0.15, -0.42, 0.1], [0.6, 0, 0.4]], HB: [[-0.006, -0.02, 0.004], [0, 0, 0.2]], HBp: [[0.0, -0.022, 0.006], [0, 0, 0.2]], HV: [[-0.13, 0.15, 0.04], [1.0, -0.55, 0.35]] },
  g17: { hand: [[0, -0.07, 0.068], -0.36, { idx: 0.5, w: 0.013 }], elbowR: [0.08, -0.23, 0.32], elbow: [-0.13, -0.3, 0.28], hip: [0.12, -0.125, -0.36], ads: [0, -0.0352, -0.4], sightH: 0.0212, magRot: true,
    H0: [[0.0, -0.056, 0.064], [-0.36, 0, 0]], H1: [0.0, -0.118, 0.082], rot: [-0.36, 0, 0], d: [0.06, 0.08], HP: [[-0.12, -0.4, 0.16], [0.4, 0, 0.4]], HB: [[-0.012, -0.03, 0.014], [0, 0, 0.2]], HBp: [[-0.008, -0.028, 0.016], [0, 0, 0.2]], HV: [[-0.11, 0.05, 0.07], [0.7, -0.55, 0.35]], flash: 0.7 },
  m107: { hand: [[0, -0.135, 0.185], -0.3], elbowR: [0.1, -0.3, 0.46], elbow: [-0.2, -0.32, 0.1], hip: [0.15, -0.17, -0.42], ads: [0, -0.106, -0.33], sightH: 0.106, magAxis: [0, -1, 0], scope: true,
    H0: [[0, -0.06, -0.22], [0, 0, 0]], H1: [0, -0.15, 0.0], rot: [0, 0, 0], d: [0.08, 0.12], HP: [[-0.15, -0.45, 0.12], [0.6, 0, 0.4]], HB: [[0.034, 0.02, 0.0], [0, 0, -0.4]], HBp: [[0.034, 0.02, 0.06], [0, 0, -0.4]], HV: [[-0.16, 0.16, 0.08], [1.0, -0.55, 0.35]], flash: 1.8 },
  ak74: { hand: [[0, -0.083, 0.104], -0.33], elbowR: [0.1, -0.25, 0.38], elbow: [-0.2, -0.3, 0.04], hip: [0.13, -0.135, -0.33], ads: [0, -0.04, -0.34], sightH: 0.04, magAxis: [0, -1, 0.15],
    H0: [[0, -0.006, -0.25], [0, 0, 0]], H1: [0, -0.09, -0.06], rot: [0, 0, 0], d: [0.07, 0.11], HP: [[-0.15, -0.42, 0.1], [0.6, 0, 0.4]], HB: [[0.016, 0.012, 0.11], [0, 0, -0.3]], HBp: [[0.016, 0.012, 0.15], [0, 0, -0.3]], HV: [[-0.14, 0.17, 0.06], [1.0, -0.55, 0.35]] },
  // shotgun: right hand on the stock wrist, left hand on the pump; H1 sits under the loading port, magAxis is the way a shell comes out of it
  m870: { hand: [[0, -0.062, 0.1], -0.98], elbowR: [0.1, -0.24, 0.42], elbow: [-0.2, -0.3, 0.02], hip: [0.13, -0.13, -0.32], ads: [0, -0.0185, -0.34], sightH: 0.0148, magAxis: [0, -0.55, 0.84],
    H0: [[0, -0.031, -0.28], [0, 0, 0]], H1: [0, -0.07, -0.05], rot: [0, 0, 0], d: [0.05, 0.08], HP: [[-0.15, -0.42, 0.1], [0.6, 0, 0.4]], HB: [[0, -0.031, -0.28], [0, 0, 0]], HBp: [[0, -0.031, -0.192], [0, 0, 0]], HV: [[-0.13, 0.15, 0.04], [1.0, -0.55, 0.35]], flash: 1.3 },
  m9: { hand: [[0, -0.07, 0.072], -0.3, { idx: 0.5, w: 0.014 }], elbowR: [0.08, -0.23, 0.32], elbow: [-0.13, -0.3, 0.28], hip: [0.12, -0.125, -0.36], ads: [0, -0.029, -0.4], sightH: 0.016, magRot: true,
    H0: [[0.0, -0.056, 0.064], [-0.3, 0, 0]], H1: [0.0, -0.118, 0.082], rot: [-0.3, 0, 0], d: [0.06, 0.08], HP: [[-0.12, -0.4, 0.16], [0.4, 0, 0.4]], HB: [[-0.012, -0.02, 0.02], [0, 0, 0.2]], HBp: [[-0.008, -0.018, 0.024], [0, 0, 0.2]], HV: [[-0.11, 0.05, 0.07], [0.7, -0.55, 0.35]], flash: 0.7 }
};
const VM_KIT = makeKit(true);
function buildVM(id) {
  const D = VM_DEF[id], M = GUN_MODEL[id](VM_KIT), g = M.g;
  const brass = cartridgeTop(M.mag, M.brass[0], M.brass[1]); brass.userData.keep = true;
  for (const grp of [g, M.mag, M.slide, M.chg]) if (grp) { compact(grp); grp.children.forEach(c => { if (c.isGroup && c !== M.mag && c !== M.slide && c !== M.chg && c !== brass) compact(c); }); }
  const port = new THREE.Object3D(); port.position.fromArray(M.port); (M.slide || g).add(port);
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(M.muzzle); g.add(muzzle);
  const flash = addFlash(muzzle); if (D.flash) flash.scale.setScalar(D.flash);
  const rh = buildGripHand(g, D.hand[0], D.hand[1], D.elbowR, D.hand[2]);
  const L = buildLeftHand(g); vm.add(g);
  const magAxis = D.magRot ? new V3(0, -1, 0).applyEuler(M.mag.rotation) : new V3().fromArray(D.magAxis).normalize();
  const W = { boltIn: M.boltIn || null, bolt: M.bolt || null, boltMode: M.boltMode, boltTravel: M.travel || 0, boltK: 0, heat: 0, id, rh, g, mag: M.mag, magBase: M.mag.position.clone(), magQBase: M.mag.quaternion.clone(), magAxis, muzzle, flash, port, chg: M.chg, ret: null, slide: M.slide, brass, L, scope: !!D.scope,
    elbow: new V3().fromArray(D.elbow), hip: new V3().fromArray(D.hip), ads: new V3().fromArray(D.ads), sightH: D.sightH };
  if (M.eye) W.lens = W.scopeLens = makeScopeLens(g, M.eye, M.eyeR, 6, 'mildot');
  const H1 = new V3().fromArray(D.H1), r0 = D.rot, r1 = [r0[0] + (D.magRot ? 0.06 : 0.1), r0[1], r0[2]];
  W.poses = makePoses({ H0: D.H0, H1: [H1.toArray(), r0], H1d: [H1.clone().addScaledVector(magAxis, D.d[0]).toArray(), r0], H1dd: [H1.clone().addScaledVector(magAxis, D.d[1]).toArray(), r1],
    H1up: [H1.clone().addScaledVector(magAxis, -0.006).toArray(), r0], H1miss: [H1.clone().addScaledVector(magAxis, 0.022).add(new V3(0.009, 0, -0.012)).toArray(), [r0[0] + 0.12, r0[1], r0[2] - 0.1]],
    HP: D.HP, HB: D.HB, HBp: D.HBp, HV: D.HV });
  return W;
}
// third-person / ground versions: one cached vertex-coloured geometry per weapon (body and magazine)
const gunVcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
const TP_KIT = makeKit(false, m => mat(m.color ? m.color.getHex() : 0x202020, 0.6, 0));
const TP_OFF = { m870: [0, -0.027, -0.38], m4: [0, 0.005, -0.345], ak74: [0, 0.005, -0.4], m107: [0, 0.01, -0.5], g17: [0, 0, -0.03], m9: [0, 0, -0.03] };
const TP_FORE = { m870: [-0.004, -0.046, -0.28], m4: [-0.004, -0.02, -0.26], ak74: [-0.004, -0.024, -0.2], m107: [-0.004, -0.1, -0.08] };
const tpCache = {};
function tpGunGeo(id) {
  if (tpCache[id]) return tpCache[id];
  const M = GUN_MODEL[id](TP_KIT), D = VM_DEF[id]; M.g.updateMatrixWorld(true);
  const body = bakeColored(M.g, [M.mag]), mag = bakeColored(M.mag);
  return tpCache[id] = { body, mag, magPos: M.mag.position.clone(), magRot: M.mag.rotation.clone(), grip: D.hand[0], H0: D.H0[0], muzzle: M.muzzle };
}
function tpGun(id, shadow) {
  const C = tpGunGeo(id), off = TP_OFF[id], pistol = id === 'g17' || id === 'm9', mt = shadow ? shadowMat : gunVcMat;
  const g = new THREE.Group(), inner = new THREE.Group(); inner.position.fromArray(off); g.add(inner);
  const body = new THREE.Mesh(C.body, mt); body.castShadow = true; body.userData.keep = true; inner.add(body);
  const mag = new THREE.Group(); mag.position.copy(C.magPos); mag.rotation.copy(C.magRot); inner.add(mag);
  const mm = new THREE.Mesh(C.mag, mt); mm.castShadow = true; mm.userData.keep = true; mag.add(mm);
  const mk = (p, dx, dy, dz) => mark(g, p[0] + off[0] + (dx || 0), p[1] + off[1] + (dy || 0), p[2] + off[2] + (dz || 0));
  const fore = pistol ? mk(C.grip, -0.018, -0.004, -0.008) : mk(TP_FORE[id]);
  return { g, mag, body, grip: mk(C.grip, 0.004, 0.012, 0), fore, well: mk([C.magPos.x, C.magPos.y - 0.03, C.magPos.z]) };
}
// a loose magazine or whole gun as a single mesh (ground items, magazines in hands)
function gunItemMesh(id, magOnly) { const C = tpGunGeo(id); const m = new THREE.Mesh(magOnly ? C.mag : C.body, gunVcMat); m.castShadow = true; if (!magOnly) { const mg = new THREE.Mesh(C.mag, gunVcMat); mg.position.copy(C.magPos); mg.rotation.copy(C.magRot); mg.castShadow = true; m.add(mg); } return m; }
const VMW = WEAPONS.map(w => buildVM(w.id));
// left-hand choreography. Reloads include a fumbled first try at the magazine well, a slap to seat it and a tug to check it
const SEQ = {
  tac: { keys: [[0, 'H0'], [0.1, 'H1'], [0.14, 'H1'], [0.2, 'H1d'], [0.36, 'HP'], [0.46, 'HP'], [0.57, 'H1miss'], [0.615, 'H1d'], [0.665, 'H1'], [0.69, 'H1up'], [0.73, 'H1'], [0.79, 'H1d'], [0.83, 'H1'], [0.95, 'H0'], [1, 'H0']], held: [[0.12, 0.665]], hidden: [], fum: 0.57, seat: 0.665 },
  empty: { keys: [[0, 'H0'], [0.09, 'H1'], [0.13, 'H1'], [0.17, 'H1d'], [0.34, 'HP'], [0.43, 'HP'], [0.54, 'H1miss'], [0.595, 'H1d'], [0.645, 'H1'], [0.675, 'H1up'], [0.71, 'H1'], [0.8, 'HB'], [0.845, 'HBp'], [0.885, 'HB'], [1, 'H0']], held: [[0.42, 0.645]], hidden: [[0.13, 0.42]], fum: 0.54, seat: 0.645 },
  inspect: { keys: [[0, 'H0'], [0.12, 'H1'], [0.24, 'H1dd'], [0.4, 'HV'], [0.66, 'HV'], [0.78, 'H1dd'], [0.86, 'H1'], [1, 'H0']], held: [[0.12, 0.86]], hidden: [] }
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
  // an empty reload stows the empty magazine like a tactical one, then hits the bolt release
  const base = empty ? { keys: SEQ.tac.keys.filter(k => k[0] <= 0.73).concat([[0.8, 'HB'], [0.845, 'HBp'], [0.885, 'HB'], [1, 'H0']]), held: SEQ.tac.held, hidden: [], fum: SEQ.tac.fum, seat: SEQ.tac.seat } : SEQ.tac, fumble = Math.random() < 0.22 + 0.6 * stress, tug = !empty && Math.random() < 0.5, warp = rnd(-0.02, 0.02);
  let keys = base.keys.map(k => [k[0] + (k[1] === 'HP' ? warp : 0), fumble || k[1] !== 'H1miss' ? k[1] : 'H1d', /^(H0|H1|H1up|HB|HBp)$/.test(k[1]) ? null : new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.005 + 0.012 * stress)]);
  if (!tug && !empty) keys = keys.filter(k => k[0] !== 0.79 && k[0] !== 0.83);
  return { keys, held: base.held, hidden: base.hidden, fum: fumble ? base.fum : 9, seat: base.seat, fumble };
}
const _po = new V3();
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
      if (k[i][2]) outP.addScaledVector(k[i][2], 1 - u); if (k[i + 1][2]) outP.addScaledVector(k[i + 1][2], u);
      return;
    }
  }
}
