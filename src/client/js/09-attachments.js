// ---------------------------------------------------------------- attachments
const ATT = {
  optic: { irons: 'Iron sights', holo: 'Holographic sight', reddot: 'Micro red dot', acog: '4x prism scope' },
  muzzle: { std: 'Standard muzzle device', supp: 'Suppressor' },
  under: { none: 'None', vert: 'Vertical grip', angled: 'Angled grip' },
  side: { none: 'None', laser: 'Visible laser', light: 'Weapon light' }
};
const ATT_SLOT_NAME = { optic: 'Optic', muzzle: 'Muzzle', under: 'Underbarrel', side: 'Laser / light' };
const ATT_SLOTS = { m4: ['optic', 'muzzle', 'under', 'side'], ak74: ['optic', 'muzzle', 'under', 'side'], m107: ['muzzle'], g17: ['muzzle', 'side'], m9: ['muzzle', 'side'], m870: ['side'] };
const ATT_DEFAULT = { m4: { optic: 'holo', muzzle: 'std', under: 'none', side: 'none' }, ak74: { optic: 'irons', muzzle: 'std', under: 'none', side: 'none' }, m107: { muzzle: 'std' }, g17: { muzzle: 'std', side: 'none' }, m9: { muzzle: 'std', side: 'none' }, m870: { side: 'none' } };
const MOUNTS = {
  m4: { optic: [0, 0.0315, -0.005], rearIron: [0, 0.0315, 0.072], frontIron: [0, 0.0315, -0.37], muzzle: [0, 0.003, -0.5], muzR: 0.0185, supLen: 0.17, under: [0, -0.0185, -0.3], side: [0.0245, 0.003, -0.33], ironsH: 0.0665, adsZ: -0.25 },
  ak74: { optic: [0, 0.03, -0.01], muzzle: [0, 0.0, -0.47], muzR: 0.019, supLen: 0.17, under: [0, -0.028, -0.25], side: [0.023, -0.006, -0.25], ironsH: 0.04, sideMount: true, adsZ: -0.27 },
  m107: { muzzle: [0, 0, -0.9], muzR: 0.036, supLen: 0.27 },
  g17: { muzzle: [0, 0.0, -0.093], muzR: 0.0145, supLen: 0.15, side: [0, -0.027, -0.062], pistol: true },
  // weapon light clamped to the magazine tube on the right of the barrel
  m870: { side: [0.019, -0.0128, -0.46] },
  m9: { muzzle: [0, 0.013, -0.1], muzR: 0.0145, supLen: 0.15, side: [0, -0.024, -0.062], pistol: true }
};
// the Studio M4: rails on its shorter quad-rail handguard
if (IMPORTED.m4) Object.assign(MOUNTS.m4, { under: [0, -0.0397, -0.2], side: [0.0315, -0.007, -0.205] });
const dotTex = canvasTex((g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#ff2a1a'; g.shadowColor = '#ff2a1a'; g.shadowBlur = 10; g.beginPath(); g.arc(s / 2, s / 2, s * 0.06, 0, 7); g.fill(); }, 128, false);
const lensGlow = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
const lightLens = new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false });
const fiber = new THREE.MeshStandardMaterial({ color: 0x9a2a10, emissive: 0x501000, roughness: 0.3 });
function reticlePlane(tex, size, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: opacity || 0 }));
  m.renderOrder = 5; return m;
}
// XPS-style holographic sight: angled hood walls, arched roof, transverse battery, rear buttons, cross-bolt clamp
function buildHoloSight(parent, at) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  const A = GM.anodEO;
  vrbox(0.04, 0.008, 0.088, 0.002, A, e, 0, 0.004, 0.0);
  vrbox(0.05, 0.017, 0.062, 0.004, A, e, 0, 0.0165, 0.012);
  const bat = vcyl(0.0098, 0.05, A, e, 0, 0.0185, -0.031, 22); bat.rotation.set(0, 0, Math.PI / 2);
  const cap = vcyl(0.0106, 0.007, A, e, 0.0265, 0.0185, -0.031, 22); cap.rotation.set(0, 0, Math.PI / 2);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; vbox(0.007, 0.0012, 0.0012, GM.dark, e, 0.0268, 0.0185 + Math.sin(a) * 0.0106, -0.031 + Math.cos(a) * 0.0106); }
  const prof = new THREE.Shape();
  prof.moveTo(0.031, 0.024); prof.lineTo(0.031, 0.064); prof.quadraticCurveTo(0.03, 0.07, 0.024, 0.07); prof.lineTo(-0.014, 0.07);
  prof.quadraticCurveTo(-0.02, 0.07, -0.024, 0.065); prof.lineTo(-0.044, 0.04); prof.lineTo(-0.044, 0.026); prof.closePath();
  const wallG = new THREE.ExtrudeGeometry(prof, { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0007, bevelSegments: 1, curveSegments: 6 });
  for (const sx of [1, -1]) {
    const w = new THREE.Mesh(wallG, A); w.rotation.y = -Math.PI / 2; w.position.x = sx > 0 ? 0.026 : -0.0215; e.add(w);
    vbox(0.0008, 0.016, 0.03, GM.dark, e, sx * 0.0264, 0.046, 0.006);
  }
  vrbox(0.052, 0.0045, 0.042, 0.0018, A, e, 0, 0.0683, 0.006);
  const visor = vrbox(0.052, 0.0042, 0.024, 0.0015, A, e, 0, 0.0688, -0.027); visor.rotation.x = -0.1;
  vbox(0.044, 0.004, 0.004, A, e, 0, 0.0255, -0.04);
  vbox(0.044, 0.003, 0.004, A, e, 0, 0.0262, 0.03);
  const gf = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.036), glassFront); gf.position.set(0, 0.046, -0.028); gf.rotation.x = 0.08; e.add(gf);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.034), glassRear); gr.position.set(0, 0.046, 0.03); e.add(gr);
  vrbox(0.009, 0.006, 0.004, 0.002, rubber, e, 0.011, 0.016, 0.0445); vrbox(0.009, 0.006, 0.004, 0.002, rubber, e, 0.0, 0.016, 0.0445);
  vrbox(0.006, 0.005, 0.004, 0.002, rubber, e, -0.012, 0.016, 0.0445);
  const nut = vcyl(0.0052, 0.006, GM.steel, e, -0.0245, 0.003, 0.012, 6); nut.rotation.set(0, 0, Math.PI / 2);
  vbox(0.003, 0.01, 0.022, A, e, -0.0225, 0.003, -0.022);
  const ret = reticlePlane(reticleTex, 0.0095); ret.position.set(0, 0.046, -0.006); e.add(ret);
  return { g: e, ret, sightY: at[1] + 0.046 };
}
// micro red dot on a riser
function buildRedDot(parent, at) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  const A = GM.anod;
  vrbox(0.022, 0.006, 0.045, 0.002, A, e, 0, 0.003, 0);
  vrbox(0.02, 0.02, 0.034, 0.003, A, e, 0, 0.016, 0.0);
  const tubeM = A.clone(); tubeM.side = THREE.DoubleSide;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 0.026, 28, 1, true), tubeM); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.039, 0); e.add(tube);
  for (const z of [-0.013, 0.013]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0128, 0.0014, 8, 28), A); ring.position.set(0, 0.039, z); e.add(ring); }
  vcyl(0.0068, 0.008, A, e, 0, 0.055, 0.0, 16).rotation.set(0, 0, 0);
  vcyl(0.0068, 0.008, A, e, 0.0185, 0.039, 0.0, 16).rotation.set(0, 0, Math.PI / 2);
  const gf = new THREE.Mesh(new THREE.CircleGeometry(0.0112, 24), glassFront); gf.position.set(0, 0.039, -0.0136); e.add(gf);
  const ret = reticlePlane(dotTex, 0.008); ret.position.set(0, 0.039, -0.004); e.add(ret);
  return { g: e, ret, sightY: at[1] + 0.039 };
}
// 4x prism scope with fiber optic illumination strip
function buildPrism(parent, at) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e); const K = VM_KIT;
  // thumbscrew base
  K.rb(0.03, 0.009, 0.075, 0.002, 'anod', e, 0, 0.0045, 0.0);
  for (const z of [-0.022, 0.022]) { K.cx(0.006, 0.012, 'worn', e, -0.019, 0.005, z, 10); K.cx(0.0075, 0.004, 'anod', e, -0.027, 0.005, z, 8); }
  // forged housing: tapered body between the objective bell and the eyepiece, with the raised fibre-optic hump
  K.e([[0.068, 0.012], [0.068, 0.046, 0.006], [0.03, 0.05, 0.004], [-0.02, 0.054, 0.006], [-0.085, 0.056, 0.004], [-0.085, 0.01, 0.004], [-0.03, 0.012], [0.02, 0.016]], 0.032, 'anod', e, { r: 0.003, bev: 0.006, bs: 3 });
  K.c(0.019, 0.03, 'anod', e, 0, 0.032, -0.095, 24, 0.0205); K.c(0.0215, 0.006, 'anod', e, 0, 0.032, -0.112, 24); K.c(0.0175, 0.003, 'lens', e, 0, 0.032, -0.1125, 24);
  K.c(0.0165, 0.024, 'anod', e, 0, 0.032, 0.078, 24, 0.0175); K.c(0.0178, 0.008, 'rubber', e, 0, 0.032, 0.092, 24); K.c(0.0125, 0.003, 'lens', e, 0, 0.032, 0.0945, 20);
  K.e([[0.02, 0.05], [-0.07, 0.056], [-0.07, 0.062, 0.003], [0.02, 0.058, 0.003]], 0.012, 'anod', e, { r: 0.001, bev: 0.002 });
  const fb = K.c(0.0034, 0.085, 'red', e, 0, 0.0625, -0.025, 10); fb.material = fiber; fb.rotation.x = 0.066;
  // adjuster caps with lanyards
  K.cy(0.0085, 0.012, 'anod', e, 0, 0.06, 0.04, 14); K.cx(0.0085, 0.012, 'anod', e, 0.021, 0.034, 0.04, 14);
  for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; K.b(0.002, 0.012, 0.002, 'dark', e, Math.cos(t) * 0.0085, 0.06, 0.04 + Math.sin(t) * 0.0085); }
  compact(e);
  const lens = makeScopeLens(e, [0, 0.032, 0.0962], 0.0124, 4, 'chevron');
  return { g: e, ret: null, sightY: at[1] + 0.032, zoom: 4, lens };
}
// flip-up back-up iron sights (rear aperture, front post)
function buildIrons(parent, rear, front, h) {
  const e = new THREE.Group(); parent.add(e);
  const A = GM.anod, base = rear[1];
  const r = new THREE.Group(); r.position.fromArray(rear); e.add(r);
  vrbox(0.022, 0.008, 0.03, 0.002, A, r, 0, 0.004, 0);
  vbox(0.004, h - base - 0.004, 0.006, A, r, 0.009, (h - base) / 2, 0); vbox(0.004, h - base - 0.004, 0.006, A, r, -0.009, (h - base) / 2, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0032, 0.0013, 8, 18), A); ring.position.set(0, h - base, 0); r.add(ring);
  vbox(0.014, 0.003, 0.004, A, r, 0, h - base - 0.0045, 0);
  const f = new THREE.Group(); f.position.fromArray(front); e.add(f);
  vrbox(0.022, 0.008, 0.026, 0.002, A, f, 0, 0.004, 0);
  vbox(0.004, h - base + 0.004, 0.005, A, f, 0.008, (h - base) / 2 + 0.002, 0); vbox(0.004, h - base + 0.004, 0.005, A, f, -0.008, (h - base) / 2 + 0.002, 0);
  vbox(0.0022, h - base - 0.006, 0.0022, A, f, 0, (h - base) / 2 - 0.003, 0);
  return { g: e, ret: null, sightY: h };
}
function buildSuppressor(parent, at, r, len) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  const A = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.62, metalness: 0.5, bumpMap: fineNoise, bumpScale: 0.6 });
  vcyl(r, len, A, e, 0, 0, -len / 2, 28);
  vcyl(r * 1.04, 0.012, A, e, 0, 0, -0.006, 28); vcyl(r * 1.04, 0.01, A, e, 0, 0, -len + 0.005, 28);
  for (let i = 0; i < 3; i++) vcyl(r * 1.01, 0.002, GM.dark, e, 0, 0, -0.025 - i * 0.008, 28);
  vcyl(r * 0.28, 0.003, GM.dark, e, 0, 0, -len - 0.0005, 16);
  return { g: e, end: -len };
}
function buildVertGrip(parent, at) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  vrbox(0.02, 0.008, 0.04, 0.002, GM.anod, e, 0, -0.004, 0);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.014, 0.085, 18), GM.poly); c.position.set(0, -0.05, 0); e.add(c);
  for (let i = 0; i < 4; i++) { const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0012, 6, 18), GM.poly); r2.rotation.x = Math.PI / 2; r2.position.set(0, -0.025 - i * 0.016, 0); e.add(r2); }
  vcyl(0.014, 0.006, GM.poly, e, 0, -0.094, 0, 18).rotation.set(0, 0, 0);
  return { g: e };
}
function buildAngledGrip(parent, at) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  vrbox(0.022, 0.012, 0.075, 0.004, GM.poly, e, 0, -0.008, 0);
  vrbox(0.022, 0.03, 0.03, 0.006, GM.poly, e, 0, -0.022, -0.028, 0.65);
  vrbox(0.022, 0.016, 0.03, 0.004, GM.poly, e, 0, -0.016, 0.03, -0.3);
  return { g: e };
}
function buildLaser(parent, at, pistol) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  vrbox(pistol ? 0.024 : 0.018, pistol ? 0.022 : 0.03, pistol ? 0.045 : 0.06, 0.004, GM.anodEO, e, 0, pistol ? -0.008 : 0, 0);
  vcyl(0.0035, 0.004, lensGlow, e, pistol ? 0.006 : 0.004, pistol ? -0.012 : 0.006, pistol ? -0.0235 : -0.0305, 12);
  vcyl(0.0042, 0.004, lensMat, e, pistol ? -0.006 : 0.004, pistol ? -0.012 : -0.007, pistol ? -0.0235 : -0.0305, 12);
  vrbox(0.006, 0.006, 0.01, 0.002, rubber, e, pistol ? 0 : 0.009, pistol ? -0.02 : 0.004, 0.02);
  const em = new THREE.Object3D(); em.position.set(pistol ? 0.006 : 0.004, pistol ? -0.012 : 0.006, pistol ? -0.026 : -0.033); e.add(em);
  return { g: e, em };
}
function buildLight(parent, at, pistol) {
  const e = new THREE.Group(); e.position.fromArray(at); parent.add(e);
  if (pistol) { vrbox(0.026, 0.024, 0.05, 0.005, GM.anodEO, e, 0, -0.008, 0); vcyl(0.009, 0.004, lightLens, e, 0, -0.01, -0.026, 18); }
  else {
    vrbox(0.012, 0.012, 0.03, 0.003, GM.anod, e, -0.004, 0.0, 0.0);
    vcyl(0.0115, 0.075, GM.anod, e, 0.008, 0.0, -0.005, 20);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0118, 0.022, 20), GM.anod); head.rotation.x = Math.PI / 2; head.position.set(0.008, 0, -0.052); e.add(head);
    vcyl(0.012, 0.003, lightLens, e, 0.008, 0, -0.0635, 20);
    for (let i = 0; i < 6; i++) vbox(0.0235, 0.0012, 0.002, GM.dark, e, 0.008, 0, -0.01 + i * 0.008);
  }
  const em = new THREE.Object3D(); em.position.set(pistol ? 0 : 0.008, pistol ? -0.01 : 0, pistol ? -0.03 : -0.068); e.add(em);
  return { g: e, em };
}
// build every optional attachment once per viewmodel, then toggle visibility
for (const [wi, W] of VMW.entries()) {
  const id = WEAPONS[wi].id, M = MOUNTS[id];
  W.parts = { optic: {}, muzzle: {}, under: {}, side: {} };
  W.muzzleBaseZ = W.muzzle.position.z;
  if (ATT_SLOTS[id].includes('optic')) {
    if (id === 'm4' && W.imported) W.parts.optic.irons = { g: new THREE.Group(), ret: null, sightY: W.ironsY };   // the model's own front sight and flip-up rear
    else if (id === 'm4') W.parts.optic.irons = buildIrons(W.g, M.rearIron, M.frontIron, M.ironsH);
    else W.parts.optic.irons = { g: new THREE.Group(), ret: null, sightY: M.ironsH };
    if (M.sideMount) { const sm = new THREE.Group(); W.g.add(sm); vrbox(0.006, 0.05, 0.06, 0.002, GM.anod, sm, -0.021, 0.005, -0.01); vrbox(0.04, 0.006, 0.07, 0.002, GM.anod, sm, -0.002, 0.03, -0.01); rail(sm, -0.045, 0.025, 0.033); W.sideMountG = sm; }
    const top = M.sideMount ? [0, 0.036, -0.01] : M.optic;
    W.parts.optic.holo = buildHoloSight(W.g, top);
    W.parts.optic.reddot = buildRedDot(W.g, top);
    W.parts.optic.acog = buildPrism(W.g, top);
  }
  if (ATT_SLOTS[id].includes('muzzle')) {
    const at = W.muzzle.position.toArray(); at[2] += M.pistol ? 0.006 : 0.04;
    W.parts.muzzle.supp = buildSuppressor(W.g, at, M.muzR, M.supLen); W.parts.muzzle.supp.endZ = at[2] - M.supLen;
  }
  if (ATT_SLOTS[id].includes('under')) { W.parts.under.vert = buildVertGrip(W.g, M.under); W.parts.under.angled = buildAngledGrip(W.g, M.under); W.vfgHand = buildVfgHand(W, M.under, W.elbow); }
  if (ATT_SLOTS[id].includes('side')) { W.parts.side.laser = buildLaser(W.g, M.side, M.pistol); W.parts.side.light = buildLight(W.g, M.side, M.pistol); }
}
function loadAtt() { let a = {}; try { a = JSON.parse(localStorage.getItem('breach_att') || '{}') || {}; } catch (e) {} const out = {}; for (const id in ATT_DEFAULT) out[id] = Object.assign({}, ATT_DEFAULT[id], a[id] || {}); return out; }
const ATTS = loadAtt();
function attOf(wi) { return ATTS[WEAPONS[wi].id] || {}; }
function applyAttachments(wi) {
  const W = VMW[wi], id = WEAPONS[wi].id, A = ATTS[id], M = MOUNTS[id];
  for (const slot in W.parts) for (const k in W.parts[slot]) W.parts[slot][k].g.visible = A[slot] === k;
  if (W.parts.optic.irons) {
    const o = W.parts.optic[A.optic] || W.parts.optic.irons;
    W.ret = o.ret; W.sightH = o.sightY; W.zoom = o.zoom || 1; W.lens = o.lens || W.scopeLens || null;
    W.ads.set(0, -o.sightY, A.optic === 'irons' ? (id === 'ak74' ? -0.34 : -0.25) : A.optic === 'acog' ? -0.27 : (M.adsZ || -0.25));
    if (W.sideMountG) W.sideMountG.visible = A.optic !== 'irons';
    // with an optic on, the iron sights come off (front sight and flip-up rear)
    if (W.imported) W.g.traverse(o => { if (o.userData.part === 'RearBackupIronSightUp' || o.userData.part === 'ForwardIronSight') o.visible = A.optic === 'irons'; });
    for (const k in W.parts.optic) if (W.parts.optic[k].ret) W.parts.optic[k].ret.material.opacity = 0;
  }
  // the support hand goes where the grip is: around a vertical grip, back on the ramp of an angled one
  if (!W.H0base) W.H0base = { p: W.poses.H0.p.clone(), q: W.poses.H0.q.clone() };
  W.vfgOn = A.under === 'vert';
  W.poses.H0.p.copy(W.H0base.p); W.poses.H0.q.copy(W.H0base.q);
  if (A.under === 'angled') { W.poses.H0.p.add(new V3(0, -0.009, 0.02)); W.poses.H0.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0, 0))); }
  if (W.vfgOn) W.poses.H0.p.set(W.H0base.p.x, MOUNTS[id].under[1] - 0.03, MOUNTS[id].under[2] + 0.01);
  W.supp = A.muzzle === 'supp';
  W.muzzle.position.z = W.supp ? W.parts.muzzle.supp.endZ - 0.005 : W.muzzleBaseZ;
  W.side = A.side || 'none';
  W.mods = { recoil: (A.under === 'vert' ? 0.82 : A.under === 'angled' ? 0.9 : 1) * (W.supp ? 0.9 : 1), ads: A.under === 'angled' ? 1.3 : 1, hipSway: A.side === 'laser' ? 0.6 : 1 };
}
function saveAtt() { try { localStorage.setItem('breach_att', JSON.stringify(ATTS)); } catch (e) {} }
VMW.forEach((W, i) => applyAttachments(i));
// laser beam + dot and weapon light, in the world scene
const laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
const laserDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex((g, s) => { const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 64, false), color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
laserBeam.visible = laserDot.visible = false; scene.add(laserBeam, laserDot);
const weaponLight = new THREE.SpotLight(0xfff4e0, 0, 60, 0.32, 0.45, 1.5); scene.add(weaponLight, weaponLight.target);
const vmLight = new THREE.PointLight(0xfff4e0, 0, 1.2, 2); vmScene.add(vmLight);
const _lp = new V3(), _ld = new V3(), _lq = new THREE.Quaternion();
function updateDevices() {
  const W = VMW[P.weapon], on = S.mode && P.alive && !P.downed && P.slot < 2 && W && W.side !== 'none' && P.deviceOn;
  laserBeam.visible = laserDot.visible = false; weaponLight.intensity = 0; vmLight.intensity = 0;
  if (!on) return;
  const part = W.parts.side[W.side]; part.em.getWorldPosition(_lp); W.g.getWorldQuaternion(_lq); _ld.set(0, 0, -1).applyQuaternion(_lq);
  if (W.side === 'laser') {
    ray.set(_lp, _ld); ray.far = 300;
    const h = ray.intersectObjects(bulletTargets(), false)[0];
    const end = h ? h.point : _lp.clone().addScaledVector(_ld, 300), len = _lp.distanceTo(end);
    laserBeam.visible = true; laserBeam.scale.set(1, len, 1); laserBeam.position.copy(_lp).addScaledVector(_ld, len / 2); laserBeam.quaternion.setFromUnitVectors(_Y, _ld);
    if (h) { laserDot.visible = true; laserDot.position.copy(h.point).addScaledVector(_ld, -0.01); laserDot.scale.setScalar(0.03 + len * 0.0015); }
  } else {
    weaponLight.intensity = 60; weaponLight.position.copy(_lp); weaponLight.target.position.copy(_lp).addScaledVector(_ld, 10);
    vmLight.intensity = 0.4; vmLight.position.copy(_lp).addScaledVector(_ld, 0.15);
  }
}

for (const W of VMW) {
  const H1 = W.poses.H1, iq = H1.q.clone().invert();
  W.magLocal = W.magBase.clone().sub(H1.p).applyQuaternion(iq);
  W.magQLocal = iq.clone().multiply(W.magQBase);
}

// ---------------------------------------------------------------- medkit (slot 3)
const MED_TIME = 4.5;
KMAT.olive = new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 0.95, bumpMap: fineNoise, bumpScale: 1 });
KMAT.olive2 = new THREE.MeshStandardMaterial({ color: 0x3c4130, roughness: 0.95, bumpMap: fineNoise, bumpScale: 1 });
KMAT.cream = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.8 });
// individual first aid kit: zipped pouch with webbing, cross patch, pull tab and a tourniquet strapped on top
function buildMedPouch(K, g) {
  K.rb(0.15, 0.1, 0.065, 0.014, 'olive', g, 0, 0, 0);
  K.rb(0.152, 0.004, 0.067, 0.001, 'dark', g, 0, 0.03, 0); K.rb(0.012, 0.01, 0.004, 0.001, 'worn', g, 0.07, 0.03, 0.034);
  for (let i = 0; i < 2; i++) K.rb(0.13, 0.014, 0.003, 0.001, 'olive2', g, 0, -0.012 - i * 0.026, 0.0335);
  for (let i = 0; i < 4; i++) K.b(0.002, 0.045, 0.0035, 'olive2', g, -0.045 + i * 0.03, -0.025, 0.0336);
  K.rb(0.04, 0.04, 0.003, 0.004, 'cream', g, -0.04, 0.012, 0.034); K.b(0.028, 0.009, 0.0034, 'red', g, -0.04, 0.012, 0.0345); K.b(0.009, 0.028, 0.0034, 'red', g, -0.04, 0.012, 0.0345);
  K.rb(0.03, 0.012, 0.03, 0.003, 'red', g, 0.045, 0.054, 0.02);
  K.cx(0.014, 0.1, 'dark', g, 0, 0.062, -0.012, 10); K.cx(0.0145, 0.014, 'red', g, 0.04, 0.062, -0.012, 10); K.cx(0.004, 0.07, 'worn', g, 0, 0.078, -0.012, 6);
  for (const sx of [-1, 1]) K.rb(0.012, 0.03, 0.03, 0.002, 'olive2', g, sx * 0.035, 0.06, -0.012);
}
// hands holding an item from both sides: fingers across the far face, thumbs on the near face
function holdHands(g, hw, y) {
  for (const sx of [-1, 1]) {
    const h = new THREE.Group(); g.add(h);
    ell(h, KMAT.glove, 0.03, [sx * (hw + 0.008), y, 0.004], [0.45, 1.35, 1.25]);
    for (let i = 0; i < 4; i++) fingerChain(h, KMAT.glove, [sx * (hw + 0.004), y + 0.03 - i * 0.02, -0.022], [-sx, 0, -0.55], [0, -sx, 0], [0.034, 0.024, 0.02], [0.35, 0.5, 0.3], i === 3 ? 0.0086 : 0.0096);
    fingerChain(h, KMAT.glove, [sx * (hw + 0.004), y + 0.03, 0.026], [-sx, -0.15, 0.45], [0, sx, 0], [0.03, 0.026], [0.2, 0.4], 0.0105);
    gloveCuff(h, [sx * (hw + 0.012), y - 0.04, 0.03], [sx * 0.3, -0.75, 0.6]);
    compact(h);
    vsleeve(g, [sx * (hw + 0.02), y - 0.062, 0.05], [sx * (hw + 0.09), y - 0.22, 0.3]);
  }
}
function buildMedkitVM() {
  const g = new THREE.Group(), pouch = new THREE.Group(); g.add(pouch);
  buildMedPouch(VM_KIT, pouch); compact(pouch);
  const flap = vrbox(0.152, 0.02, 0.07, 0.008, KMAT.olive, pouch, 0, 0.045, 0);
  holdHands(g, 0.075, -0.005);
  vm.add(g);
  return { g, pouch, flap, hip: new V3(0.0, -0.17, -0.34) };
}
const VMK = buildMedkitVM();
function updateMedkit(dt) {
  if (mouse.left && P.alive && S.locked && P.medUses > 0) {
    if (!P.healing) { P.healing = true; P.healT = 0; noiseHit(700, 0.2, 0.06); }
    P.healT += dt;
    if (Math.floor(P.healT / 0.45) !== Math.floor((P.healT - dt) / 0.45)) noiseHit(rnd(500, 1400), 0.12, 0.05);
    flashMsg('APPLYING MEDKIT ' + Math.min(100, Math.round(P.healT / MED_TIME * 100)) + '%<small>Hold left mouse. Uses left: ' + P.medUses + '</small>', 400);
    if (P.healT >= MED_TIME) {
      const n = P.anat.treat(); P.medUses--; P.healing = false; P.healT = 0; mouse.left = false;
      flashMsg(n ? 'TREATED ' + n + ' INJUR' + (n === 1 ? 'Y' : 'IES') + '<small>Bleeding stopped, fractures splinted. Uses left: ' + P.medUses + '</small>' : 'NOTHING TO TREAT', 1800);
      blip(880, 0.12, 0.05, 'sine');
    }
  } else {
    if (P.healing) { P.healing = false; P.healT = 0; }
    if (mouse.left && P.medUses <= 0 && P.semiReady) { flashMsg('MEDKIT EMPTY', 1000); P.semiReady = false; }
  }
}

// ---------------------------------------------------------------- armor plate (slot 4)
const PLATE_TIME = 3, PLATE_W = 8;
function buildPlateVM() {
  const g = new THREE.Group(), plate = new THREE.Group(); g.add(plate);
  const cover = new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.8, bumpMap: fineNoise, bumpScale: 0.6 });
  const pm = new THREE.Mesh(GC('plate', plateGeo), cover); pm.position.set(0, -0.155, -0.013); plate.add(pm); plate.rotation.x = -0.15;
  vrbox(0.12, 0.07, 0.002, 0.004, KMAT.cream, plate, 0, -0.03, 0.02);
  for (let i = 0; i < 4; i++) vbox(0.09, 0.004, 0.0024, GM.dark, plate, -0.008, -0.01 - i * 0.012, 0.0202);
  vbox(0.03, 0.012, 0.0024, KMAT.red, plate, 0.04, -0.052, 0.0202);
  vrbox(0.272, 0.012, 0.03, 0.004, rubber, plate, 0, -0.152, 0.0); vrbox(0.012, 0.2, 0.03, 0.004, rubber, plate, 0.136, -0.05, 0.0); vrbox(0.012, 0.2, 0.03, 0.004, rubber, plate, -0.136, -0.05, 0.0);
  holdHands(g, 0.136, -0.05);
  g.visible = false; vm.add(g);
  return { g, plate, hip: new V3(0.0, -0.25, -0.52) };
}
const VMP = buildPlateVM();
function worstPlate() { return 'plateF'; }
function installPlate(which) {
  if (P.platesInv <= 0) return false;
  P.anat.armor[which] = 100; P.anat.version++; P.platesInv--;
  flashMsg('FRONT PLATE REPLACED<small>Spare plates: ' + P.platesInv + '</small>', 1800);
  noiseHit(400, 0.2, 0.12); blip(660, 0.08, 0.04, 'sine');
  return true;
}
function updatePlate(dt) {
  if (mouse.left && P.alive && S.locked && P.platesInv > 0) {
    if (!P.plating) { P.plating = true; P.plateT = 0; P.plateWhich = P.plateTarget || worstPlate(); noiseHit(600, 0.15, 0.06); }
    P.plateT += dt;
    flashMsg('SWAPPING FRONT PLATE ' + Math.min(100, Math.round(P.plateT / PLATE_TIME * 100)) + '%<small>Hold left mouse. Current plate: ' + Math.round(P.anat.armor[P.plateWhich]) + '%</small>', 400);
    if (P.plateT >= PLATE_TIME) { installPlate(P.plateWhich); P.plating = false; P.plateT = 0; P.plateTarget = null; mouse.left = false; }
  } else {
    if (P.plating) { P.plating = false; P.plateT = 0; }
    if (mouse.left && P.platesInv <= 0 && P.semiReady) { flashMsg('NO SPARE PLATES', 1000); P.semiReady = false; }
  }
}

