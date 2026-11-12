// ---------------------------------------------------------------- gun modelling kit (profile extrusions shared by viewmodels, third-person guns and ground items)
const steelGray = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.45, metalness: 0.85, bumpMap: fineNoise, bumpScale: 0.3 });
const plum = new THREE.MeshStandardMaterial({ color: 0x4f2e2a, roughness: 0.62, metalness: 0.05, bumpMap: stipple, bumpScale: 0.3 });
const lensMat = new THREE.MeshStandardMaterial({ color: 0x0a1830, roughness: 0.05, metalness: 0.6 });
const brassMatVM = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.3 });
const copperMat = new THREE.MeshStandardMaterial({ color: 0xb8703a, metalness: 1, roughness: 0.32 });
const KMAT = {
  anod: GM.anod, eo: GM.anodEO, poly: GM.poly, steel: GM.steel, dark: GM.dark, park: steelGray, plum, rubber, white: GM.white, lens: lensMat,
  grip: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.85, bumpMap: stipple, bumpScale: 0.9 }),
  bolt: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.34, metalness: 0.95 }),
  worn: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.38, metalness: 0.9, bumpMap: fineNoise, bumpScale: 0.25 }),
  fde: new THREE.MeshStandardMaterial({ color: 0x8a7654, roughness: 0.8, metalness: 0.05, bumpMap: stipple, bumpScale: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb01c1c, roughness: 0.6 }), brass: brassMatVM,
  glove: GM.glove, sleeve: GM.sleeve,
  gpad: new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.7, bumpMap: stipple, bumpScale: 0.6 }),
  gpalm: new THREE.MeshStandardMaterial({ color: 0x3f3d31, roughness: 0.9, bumpMap: stipple, bumpScale: 0.4 })
};
const _Yc = new V3(0, 1, 0);
// closed polygon with rounded corners; a point may carry its own corner radius as a third value
function polyShape(pts, r, S) {
  S = S || new THREE.Shape(); const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], rr = p[2] === undefined ? r : p[2];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1, lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1, k = Math.min(rr || 0, la * 0.45, lb * 0.45);
    const ax = p[0] + (a[0] - p[0]) / la * k, ay = p[1] + (a[1] - p[1]) / la * k, bx = p[0] + (b[0] - p[0]) / lb * k, by = p[1] + (b[1] - p[1]) / lb * k;
    if (i === 0) S.moveTo(ax, ay); else S.lineTo(ax, ay);
    if (k > 0) S.quadraticCurveTo(p[0], p[1], bx, by);
  }
  S.closePath(); return S;
}
function makeKit(hi, conv) {
  const m = k => conv ? conv(KMAT[k]) : KMAT[k];
  const add = (geo, mk, P, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, m(mk)); o.position.set(x || 0, y || 0, z || 0); if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0); P.add(o); return o; };
  const ext = (pts, depth, o) => {
    o = o || {}; const sh = polyShape(pts, o.r === undefined ? 0.002 : o.r);
    if (o.holes) for (const h of o.holes) sh.holes.push(polyShape(h, o.hr === undefined ? 0.002 : o.hr, new THREE.Path()));
    const bv = Math.min(o.bev === undefined ? 0.0012 : o.bev, depth / 2 - 0.0001);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: depth - 2 * bv, bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: hi ? (o.bs || 2) : 1, curveSegments: hi ? 6 : 3 });
    geo.translate(0, 0, bv); const uv = geo.attributes.uv; for (let i = 0; i < uv.array.length; i++) uv.array[i] *= 24; return geo;
  };
  return {
    hi, m, add,
    grp(P, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); P.add(g); return g; },
    b(w, h, d, mk, P, x, y, z, rx, ry, rz) { return add(new THREE.BoxGeometry(w, h, d), mk, P, x, y, z, rx, ry, rz); },
    rb(w, h, d, r, mk, P, x, y, z, rx, ry, rz) { return add(new RoundedBoxGeometry(w, h, d, hi ? 2 : 1, r), mk, P, x, y, z, rx, ry, rz); },
    // cylinders along z (r at the rear, rF at the front), x and y
    c(r, len, mk, P, x, y, z, seg, rF) { const g = new THREE.CylinderGeometry(r, rF === undefined ? r : rF, len, seg || (hi ? 20 : 10)); g.rotateX(Math.PI / 2); return add(g, mk, P, x, y, z); },
    cx(r, len, mk, P, x, y, z, seg) { const g = new THREE.CylinderGeometry(r, r, len, seg || (hi ? 14 : 8)); g.rotateZ(Math.PI / 2); return add(g, mk, P, x, y, z); },
    cy(r, len, mk, P, x, y, z, seg, rB) { return add(new THREE.CylinderGeometry(r, rB === undefined ? r : rB, len, seg || (hi ? 14 : 8)), mk, P, x, y, z); },
    sp(r, mk, P, x, y, z, sx, sy, sz) { const o = add(new THREE.SphereGeometry(r, hi ? 14 : 8, hi ? 10 : 6), mk, P, x, y, z); if (sx) o.scale.set(sx, sy, sz); return o; },
    tor(R, r, mk, P, x, y, z, rx, ry) { return add(new THREE.TorusGeometry(R, r, hi ? 8 : 5, hi ? 20 : 10), mk, P, x, y, z, rx, ry); },
    // side profile in (z, y), extruded across the gun with width w
    e(pts, w, mk, P, o) { const geo = ext(pts, w, o); geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2); return add(geo, mk, P, o && o.x, o && o.y, o && o.z); },
    // cross-section in (x, y), extruded along z from z0 to z1
    ez(pts, z0, z1, mk, P, o) { const geo = ext(pts, Math.abs(z1 - z0), o); geo.translate(0, 0, Math.min(z0, z1)); return add(geo, mk, P); },
    // top-view profile in (x, z), extruded along y from y0 to y1
    ey(pts, y0, y1, mk, P, o) { const geo = ext(pts.map(p => [p[0], -p[1], p[2]]), Math.abs(y1 - y0), o); geo.rotateX(-Math.PI / 2); geo.translate(0, Math.min(y0, y1), 0); return add(geo, mk, P); },
    disc2(r, t, mk, P, hw, y, z) { for (const s of [-1, 1]) this.cx(r, t, mk, P, s * hw, y, z, hi ? 12 : 6); },
    rail(P, z0, z1, y, mk) {
      const len = z1 - z0; this.b(0.021, 0.006, len, mk || 'anod', P, 0, y, (z0 + z1) / 2);
      if (!hi) { this.b(0.0225, 0.0035, len, mk || 'anod', P, 0, y + 0.0047, (z0 + z1) / 2); return; }
      const n = Math.floor(len / 0.01), im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0225, 0.0035, 0.0052), m(mk || 'anod'), n), mt = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { mt.makeTranslation(0, y + 0.0047, z0 + 0.005 + i * 0.01); im.setMatrixAt(i, mt); }
      P.add(im);
    }
  };
}
// merge a group's own meshes by material (a few draw calls per gun instead of hundreds)
function compact(group) {
  const by = new Map();
  for (const c of group.children.slice()) {
    if (!c.isMesh || c.isInstancedMesh || c.userData.keep) continue;
    c.updateMatrix(); let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(c.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(g); group.remove(c);
  }
  for (const [mt, gs] of by) { const o = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], mt); group.add(o); }
  return group;
}
// bake an imported tree into one geometry in the root's frame, keeping UVs for its texture (all its parts share one material)
function bakeTextured(root, skip) {
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(), gs = [];
  const walk = o => {
    if (skip && skip.includes(o)) return;
    if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); gs.push(g); }
    for (const c of o.children) walk(c);
  };
  walk(root); return gs.length > 1 ? mergeGeometries(gs) : gs[0];
}
// bake a whole tree into one vertex-coloured geometry in the root's frame, skipping the listed sub-groups
function bakeColored(root, skip) {
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(), gs = [];
  const walk = o => {
    if (skip && skip.includes(o)) return;
    if (o.isMesh && !o.isInstancedMesh) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const col = o.material.color || new THREE.Color(1, 1, 1), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); gs.push(g);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return gs.length ? mergeGeometries(gs) : new THREE.BufferGeometry();
}
// ---------------------------------------------------------------- weapon models. x right, y up, z back; bore along -z
function gunM4(K) {
  if (IMPORTED.m4) return gunM4Imported(K);
  const g = new THREE.Group(), by = 0.003;
  // upper receiver: flat top, forward assist, ejection port with open dust cover, brass deflector
  K.e([[0.095, -0.011], [-0.097, -0.011], [-0.097, 0.0245], [0.095, 0.0245]], 0.029, 'anod', g, { r: 0.001, bev: 0.004 });
  K.c(0.0062, 0.032, 'anod', g, 0.0165, 0.009, 0.062, 12).rotation.y = -0.38; K.c(0.0072, 0.006, 'worn', g, 0.0232, 0.009, 0.079, 12).rotation.y = -0.38;
  K.b(0.001, 0.015, 0.056, 'dark', g, 0.0146, 0.006, -0.02);
  // bolt carrier seen through the port: shrinks toward the rear as the carrier travels back
  const bolt = K.grp(g, 0.0151, 0.0065, 0.004); K.b(0.0006, 0.0105, 0.05, 'bolt', bolt, 0, 0, -0.025);
  if (K.hi) for (let i = 0; i < 5; i++) K.b(0.0007, 0.0105, 0.0012, 'dark', bolt, 0.0001, 0, -0.008 - i * 0.004);
  K.b(0.0012, 0.017, 0.058, 'anod', g, 0.0172, -0.0105, -0.02, 0, 0, -0.4); K.c(0.0016, 0.066, 'worn', g, 0.0152, -0.003, -0.02, 8);
  K.rb(0.009, 0.017, 0.02, 0.003, 'anod', g, 0.0152, 0.006, 0.021, 0, 0.55, 0);
  K.c(0.0205, 0.014, 'anod', g, 0, by, -0.103, 16); K.c(0.019, 0.004, 'worn', g, 0, by, -0.097, 16);
  const chg = K.grp(g);
  K.b(0.012, 0.006, 0.034, 'anod', chg, 0, 0.0218, 0.1); K.rb(0.046, 0.007, 0.012, 0.002, 'anod', chg, 0, 0.0218, 0.113); K.rb(0.013, 0.008, 0.017, 0.002, 'worn', chg, -0.0195, 0.0218, 0.108);
  // lower receiver with buffer tower, flared magazine well, controls
  K.e([[0.097, -0.011], [-0.094, -0.011], [-0.098, -0.021], [-0.087, -0.031], [-0.081, -0.071, 0.004], [-0.01, -0.066, 0.003], [-0.006, -0.043], [0.058, -0.043], [0.066, -0.05], [0.094, -0.042], [0.107, -0.022], [0.107, 0.018, 0.006], [0.097, 0.018, 0.004]], 0.027, 'anod', g, { bev: 0.002 });
  K.e([[-0.084, -0.036], [-0.079, -0.072, 0.004], [-0.011, -0.067, 0.003], [-0.009, -0.047], [-0.03, -0.04]], 0.0305, 'anod', g, { bev: 0.002 });
  K.e([[-0.012, -0.064], [0.066, -0.0585], [0.066, -0.062], [-0.012, -0.0675]], 0.009, 'anod', g, { r: 0.001, bev: 0.0008 });
  K.e([[0.027, -0.043], [0.033, -0.043], [0.031, -0.052], [0.027, -0.06, 0.003], [0.0235, -0.059, 0.002], [0.026, -0.051]], 0.005, 'worn', g, { r: 0.001, bev: 0.001 });
  K.disc2(0.0036, 0.002, 'worn', g, 0.0138, -0.019, 0.076); K.disc2(0.0036, 0.002, 'worn', g, 0.0138, -0.0205, -0.089);
  K.disc2(0.0019, 0.0012, 'worn', g, 0.0136, -0.03, 0.03); K.disc2(0.0019, 0.0012, 'worn', g, 0.0136, -0.026, 0.05);
  K.cx(0.0055, 0.003, 'anod', g, -0.0148, -0.02, 0.062, 12); K.rb(0.0025, 0.005, 0.02, 0.001, 'anod', g, -0.0158, -0.02, 0.052, 0.25);
  K.rb(0.003, 0.02, 0.011, 0.001, 'anod', g, -0.0148, -0.012, -0.004); K.rb(0.004, 0.009, 0.013, 0.0015, 'anod', g, -0.016, -0.004, -0.004);
  K.cx(0.0052, 0.003, 'anod', g, 0.0152, -0.03, -0.012, 12); K.b(0.002, 0.016, 0.004, 'anod', g, 0.0145, -0.03, 0.0);
  // A2 pistol grip
  K.e([[0.062, -0.046], [0.098, -0.04], [0.106, -0.052, 0.004], [0.138, -0.128, 0.004], [0.134, -0.136, 0.003], [0.1, -0.138, 0.003], [0.094, -0.13], [0.081, -0.088, 0.006], [0.0765, -0.078, 0.003], [0.07, -0.062, 0.004]], 0.029, 'grip', g, { r: 0.003, bev: 0.005, bs: 3 });
  // receiver extension, castle nut, end plate, collapsible stock
  K.c(0.0147, 0.2, 'anod', g, 0, by, 0.205, 20); K.c(0.0188, 0.011, 'anod', g, 0, by, 0.1135, 12); K.rb(0.031, 0.037, 0.004, 0.001, 'anod', g, 0, -0.002, 0.108);
  K.b(0.009, 0.007, 0.18, 'anod', g, 0, -0.0135, 0.205);
  K.e([[0.168, 0.0225, 0.004], [0.326, 0.0225, 0.004], [0.334, 0.012, 0.004], [0.336, -0.096, 0.004], [0.326, -0.104, 0.004], [0.31, -0.1, 0.004], [0.284, -0.06, 0.012], [0.2, -0.026, 0.006], [0.168, -0.021, 0.004]], 0.04, 'poly', g, { r: 0.004, bev: 0.004, bs: 3, holes: [[[0.302, -0.022], [0.321, -0.022], [0.321, -0.08], [0.298, -0.05]]] });
  K.rb(0.041, 0.124, 0.007, 0.003, 'rubber', g, 0, -0.041, 0.3385);
  K.e([[0.2, -0.027], [0.25, -0.034], [0.25, -0.04], [0.205, -0.036]], 0.016, 'poly', g, { r: 0.002 });
  if (K.hi) { for (let i = 0; i < 5; i++) K.b(0.0404, 0.012, 0.003, 'dark', g, 0, 0.012, 0.19 + i * 0.022); K.disc2(0.005, 0.0015, 'worn', g, 0.0196, -0.04, 0.31); }
  // free-float handguard with M-LOK slots, continuous top rail
  const a = 0.0215, cc = 0.009, oct = [[-a + cc, -a], [a - cc, -a], [a, -a + cc], [a, a - cc], [a - cc, a], [-a + cc, a], [-a, a - cc], [-a, -a + cc]].map(p => [p[0], p[1] + by]);
  const ring = []; for (let i = 0; i < 16; i++) { const t = -i / 16 * Math.PI * 2; ring.push([Math.cos(t) * 0.016, by + Math.sin(t) * 0.016]); }
  K.ez(oct, -0.11, -0.4, 'anod', g, { r: 0.002, bev: 0.0015, holes: [ring], hr: 0 });
  for (let i = 0; i < 6; i++) {
    const zz = -0.142 - i * 0.045;
    K.b(0.044, 0.007, 0.032, 'dark', g, 0, by - 0.002, zz); K.b(0.007, 0.044, 0.032, 'dark', g, 0, by, zz).scale.set(1, 0.98, 1);
    if (K.hi) for (const s of [-1, 1]) K.b(0.006, 0.0012, 0.032, 'dark', g, s * 0.017, by - 0.017, zz, 0, 0, s * Math.PI / 4);
  }
  K.rail(g, -0.4, 0.092, 0.0245);
  if (K.hi) for (const s of [-1, 1]) for (const z of [-0.118, -0.128]) K.cx(0.0022, 0.002, 'worn', g, s * 0.0215, by - 0.008, z, 6);
  // barrel, gas tube, A2 flash hider
  K.c(0.0092, 0.3, 'worn', g, 0, by, -0.25, 14); K.c(0.003, 0.2, 'bolt', g, 0, by + 0.0125, -0.2, 6); K.rb(0.02, 0.026, 0.03, 0.003, 'worn', g, 0, by + 0.004, -0.32);
  K.c(0.0082, 0.11, 'worn', g, 0, by, -0.452, 16); K.c(0.0115, 0.004, 'bolt', g, 0, by, -0.508, 14);
  K.c(0.0108, 0.044, 'worn', g, 0, by, -0.532, 16); K.c(0.0048, 0.002, 'dark', g, 0, by, -0.5545, 10);
  for (let i = 0; i < 5; i++) { const ang = Math.PI * 0.1 + i * Math.PI * 0.2; K.b(0.0022, 0.004, 0.026, 'dark', g, Math.cos(ang) * 0.01, by + Math.sin(ang) * 0.01, -0.535, 0, 0, ang + Math.PI / 2); }
  // 30-round polymer magazine
  const mag = K.grp(g, 0, -0.075, -0.034);
  K.e([[0.031, 0.012], [0.031, -0.03], [0.0275, -0.075, 0.02], [0.016, -0.113, 0.003], [-0.047, -0.101, 0.003], [-0.038, -0.062, 0.02], [-0.0325, -0.03], [-0.031, 0.012]], 0.0225, 'poly', mag, { r: 0.002, bev: 0.002 });
  for (let i = 0; i < 5; i++) K.rb(0.0238, 0.0035, 0.05, 0.001, 'poly', mag, 0, -0.042 - i * 0.013, -0.004 - i * 0.0028, 0.06 + i * 0.03);
  K.rb(0.026, 0.008, 0.07, 0.002, 'poly', mag, 0, -0.1085, -0.016, 0.19); K.b(0.0228, 0.03, 0.004, 'dark', mag, 0, -0.03, 0.02, 0.06);
  return { g, mag, chg, slide: null, bolt, boltMode: 'scale', muzzle: [0, by, -0.56], port: [0.02, 0.008, -0.02], brass: [0.013, '556'] };
}
// the Studio-built M4: named parts become the moving pieces (magazine, charging handle, bolt carrier); the rounds in the magazine are its cartridge group
function gunM4Imported(K) {
  const I = IMPORTED.m4, g = new THREE.Group(), MAG = new V3(0, -0.075, -0.034), own = ['Magazine', 'MagazineCartridges', 'ChargingHandle', 'BoltCarrier'];
  const mesh = (name, P, off) => { const p = I.parts[name]; if (!p) return null; const m = new THREE.Mesh(p.geo, I.mats[p.mat]); m.userData.keep = true; m.userData.part = name; m.castShadow = true; if (off) m.position.copy(off).negate(); P.add(m); return m; };
  for (const n in I.parts) if (!own.includes(n)) mesh(n, g);
  const mag = K.grp(g, MAG.x, MAG.y, MAG.z); mesh('Magazine', mag, MAG);
  const cart = K.grp(mag); cart.userData.keep = true; mesh('MagazineCartridges', cart, MAG);
  const chg = K.grp(g); mesh('ChargingHandle', chg);
  const bolt = K.grp(g); mesh('BoltCarrier', bolt);
  return { g, mag, chg, slide: null, bolt, boltMode: 'slide', travel: 0.07, cart, imported: true, textured: true, muzzle: [0, -0.0067, -0.473], port: [0.022, -0.006, -0.02], brass: [0, '556'], ironsY: 0.0556 };
}
// the Studio-built G17: slide (with its top plate) is the moving part, the magazine swings out at the grip's angle
function gunG17Imported(K) {
  const I = IMPORTED.g17, g = new THREE.Group(), slide = K.grp(g);
  const FIN = { Slide: 'anod', Union: 'anod', SlideStop: 'anod', Barrel: 'worn', Mag: 'anod', Frame: 'poly', FramePart2: 'poly', Trigger: 'poly', MagRelease: 'poly' };
  const mesh = (name, P) => { const p = I.parts[name]; if (!p) return null; const m = K.add(p.geo, FIN[name] || 'poly', P); m.userData.part = name; m.castShadow = true; return m; };
  for (const n in I.parts) if (n !== 'Mag' && n !== 'Slide' && n !== 'Union') mesh(n, g);
  mesh('Slide', slide); mesh('Union', slide);
  const mag = K.grp(g, 0, -0.07, 0.064); mag.rotation.x = -0.36; mag.updateMatrix();
  const inv = mag.matrix.clone().invert(), mm = mesh('Mag', mag); if (mm) mm.applyMatrix4(inv);
  // the top round sits at the magazine's lips
  const lips = new V3(0, 0.011, 0.047).applyMatrix4(inv);
  return { g, mag, chg: null, slide, imported: true, textured: false, muzzle: [0, 0.014, -0.095], port: [0.012, 0.03, -0.02], brass: [lips.y, '9mm'] };
}
function gunG17(K) {
  if (IMPORTED.g17) return gunG17Imported(K);
  const g = new THREE.Group(), by = 0.014, slide = K.grp(g);
  K.ez([[-0.0127, -0.004], [0.0127, -0.004], [0.0127, 0.021], [0.0098, 0.0285], [-0.0098, 0.0285], [-0.0127, 0.021]], -0.093, 0.093, 'anod', slide, { r: 0.0012, bev: 0.0015 });
  for (let i = 0; i < 9; i++) K.b(0.0258, 0.019, 0.0016, 'dark', slide, 0, 0.0095, 0.05 + i * 0.0042);
  K.b(0.012, 0.004, 0.031, 'dark', slide, 0.0045, 0.0272, -0.018); K.b(0.002, 0.011, 0.031, 'dark', slide, 0.0122, 0.0215, -0.018);
  K.b(0.0105, 0.003, 0.027, 'bolt', slide, 0.004, 0.0263, -0.018); K.b(0.0008, 0.003, 0.022, 'worn', slide, 0.0129, 0.017, 0.012);
  K.b(0.0035, 0.0058, 0.007, 'worn', slide, 0, 0.0323, -0.085); K.b(0.0018, 0.0018, 0.0006, 'white', slide, 0, 0.033, -0.0815);
  K.rb(0.021, 0.004, 0.012, 0.001, 'worn', slide, 0, 0.03, 0.082);
  for (const s of [-1, 1]) { K.b(0.0068, 0.0052, 0.01, 'worn', slide, s * 0.0058, 0.0326, 0.083); K.b(0.0015, 0.0015, 0.0006, 'white', slide, s * 0.0058, 0.033, 0.0882); }
  K.b(0.015, 0.018, 0.0008, 'dark', slide, 0, 0.011, 0.0932);
  K.c(0.0072, 0.006, 'worn', slide, 0, by, -0.0925, 16); K.c(0.0046, 0.002, 'dark', slide, 0, by, -0.0962, 10); K.c(0.0042, 0.003, 'worn', slide, 0, 0.002, -0.0928, 10);
  // polymer frame with trigger guard, accessory rail and textured grip
  K.e([[-0.088, -0.004], [0.082, -0.004], [0.093, -0.009, 0.003], [0.079, -0.02, 0.006], [0.0815, -0.05, 0.01], [0.094, -0.085, 0.02], [0.112, -0.127, 0.004], [0.063, -0.135, 0.004], [0.046, -0.09, 0.01], [0.032, -0.052, 0.004], [0.02, -0.061, 0.004], [-0.03, -0.06, 0.004], [-0.04, -0.05, 0.004], [-0.036, -0.024, 0.003], [-0.088, -0.022, 0.003]],
    0.029, 'poly', g, { r: 0.002, bev: 0.0035, bs: 3, holes: [[[0.028, -0.027], [-0.03, -0.027], [-0.032, -0.047], [-0.026, -0.054], [0.018, -0.055], [0.03, -0.046]]], hr: 0.004 });
  K.e([[0.05, -0.05], [0.079, -0.05], [0.106, -0.122], [0.066, -0.128]], 0.0302, 'grip', g, { r: 0.006, bev: 0.002 });
  K.e([[0.004, -0.026], [0.012, -0.026], [0.009, -0.039], [0.003, -0.05, 0.003], [-0.001, -0.049, 0.002], [0.003, -0.038]], 0.006, 'poly', g, { r: 0.001, bev: 0.001 });
  for (let i = 0; i < 3; i++) K.b(0.0296, 0.003, 0.004, 'dark', g, 0, -0.0215, -0.078 + i * 0.012);
  K.b(0.0305, 0.003, 0.009, 'poly', g, 0, -0.0125, 0.02); K.rb(0.002, 0.0035, 0.022, 0.001, 'worn', g, -0.0152, -0.0065, 0.05);
  K.cx(0.0035, 0.031, 'poly', g, 0, -0.03, 0.036, 10); K.disc2(0.0016, 0.001, 'worn', g, 0.0146, -0.014, 0.03); K.disc2(0.0016, 0.001, 'worn', g, 0.0146, -0.018, 0.062);
  const mag = K.grp(g, 0, -0.07, 0.064); mag.rotation.x = -0.36;
  K.rb(0.022, 0.1, 0.034, 0.003, 'anod', mag, 0, 0, 0); K.rb(0.031, 0.011, 0.052, 0.003, 'poly', mag, 0, -0.057, 0.001);
  if (K.hi) for (let i = 0; i < 6; i++) K.c(0.0016, 0.001, 'dark', mag, 0.004 * (i % 2 ? 1 : -1), -0.035 + i * 0.012, 0.0172, 6);
  return { g, mag, chg: null, slide, muzzle: [0, by, -0.1], port: [0.012, 0.03, -0.02], brass: [0.051, '9mm'] };
}
function gunAK(K) {
  const g = new THREE.Group(), R = 'park';
  // stamped receiver, rivets, trunnion dimple, ribbed top cover
  K.e([[-0.092, -0.038], [0.15, -0.038], [0.158, -0.03], [0.158, 0.004], [0.15, 0.008], [-0.092, 0.008]], 0.031, R, g, { r: 0.002, bev: 0.0015 });
  K.ez([[-0.0148, 0.007], [0.0148, 0.007], [0.0148, 0.018, 0.005], [0.009, 0.0265, 0.006], [-0.009, 0.0265, 0.006], [-0.0148, 0.018, 0.005]], -0.075, 0.15, R, g, { bev: 0.001 });
  for (let i = 0; i < 6; i++) K.ez([[-0.0153, 0.012], [0.0153, 0.012], [0.0153, 0.0185, 0.005], [0.0093, 0.0272, 0.006], [-0.0093, 0.0272, 0.006], [-0.0153, 0.0185, 0.005]], 0.062 + i * 0.014, 0.066 + i * 0.014, R, g, { bev: 0.0006 });
  K.b(0.01, 0.008, 0.006, 'worn', g, 0, 0.012, 0.152);
  K.disc2(0.0022, 0.001, 'worn', g, 0.0155, -0.008, -0.078); K.disc2(0.0022, 0.001, 'worn', g, 0.0155, -0.026, -0.078); K.disc2(0.0022, 0.001, 'worn', g, 0.0155, -0.012, 0.14); K.disc2(0.0022, 0.001, 'worn', g, 0.0155, -0.028, 0.14);
  K.disc2(0.0018, 0.001, 'worn', g, 0.0155, -0.022, 0.03); K.disc2(0.0018, 0.001, 'worn', g, 0.0155, -0.016, 0.052);
  for (const s of [-1, 1]) K.rb(0.001, 0.012, 0.026, 0.0004, 'dark', g, s * 0.0153, -0.018, -0.052);
  // ejection port, bolt carrier with charging handle, big selector lever
  K.b(0.001, 0.013, 0.075, 'dark', g, 0.0152, 0.0125, -0.03);
  const bolt = K.grp(g); K.b(0.0012, 0.011, 0.11, 'bolt', bolt, 0.0157, 0.0125, -0.015);
  K.cx(0.0042, 0.024, 'bolt', bolt, 0.028, 0.0125, -0.05, 10); K.sp(0.0052, 'bolt', bolt, 0.04, 0.0125, -0.05);
  K.e([[0.114, 0.006], [0.114, -0.007], [0.02, -0.013], [0.004, -0.013], [0.004, -0.003], [0.02, -0.002]], 0.0014, 'worn', g, { r: 0.002, bev: 0.0004, x: 0.0166 });
  K.cx(0.005, 0.003, 'worn', g, 0.0172, 0.0, 0.107, 10); K.rb(0.007, 0.003, 0.014, 0.001, 'worn', g, 0.0195, -0.0135, 0.012);
  K.b(0.003, 0.014, 0.09, 'worn', g, -0.0168, -0.012, 0.03); K.b(0.0015, 0.004, 0.09, 'worn', g, -0.0185, -0.006, 0.03); K.b(0.0015, 0.004, 0.09, 'worn', g, -0.0185, -0.018, 0.03);
  // rear sight block with tangent leaf
  K.e([[-0.075, 0.007], [-0.136, 0.007], [-0.136, 0.022], [-0.122, 0.03], [-0.08, 0.03]], 0.026, R, g, { r: 0.002, bev: 0.002 });
  K.rb(0.01, 0.003, 0.062, 0.001, 'worn', g, 0, 0.0325, -0.11, 0.04); K.b(0.016, 0.003, 0.004, 'worn', g, 0, 0.0345, -0.125);
  K.b(0.013, 0.004, 0.002, 'worn', g, 0, 0.035, -0.081); for (const s of [-1, 1]) K.b(0.0048, 0.006, 0.002, 'worn', g, s * 0.0041, 0.038, -0.081);
  // gas tube, upper and lower polymer handguards, retainer, gas block
  K.c(0.0092, 0.21, R, g, 0, 0.021, -0.24, 14);
  K.ez([[-0.0165, 0.012], [0.0165, 0.012], [0.0165, 0.026, 0.006], [0.008, 0.034, 0.006], [-0.008, 0.034, 0.006], [-0.0165, 0.026, 0.006]], -0.15, -0.3, 'poly', g, { bev: 0.002 });
  K.ez([[-0.019, 0.0125], [0.019, 0.0125], [0.0215, 0.0, 0.006], [0.0205, -0.02, 0.008], [0.012, -0.028, 0.006], [-0.012, -0.028, 0.006], [-0.0205, -0.02, 0.008], [-0.0215, 0.0, 0.006]], -0.137, -0.332, 'poly', g, { bev: 0.003, bs: 3 });
  for (let i = 0; i < 3; i++) K.b(0.0432, 0.0022, 0.15, 'dark', g, 0, -0.003 - i * 0.007, -0.235);
  if (K.hi) for (let i = 0; i < 4; i++) K.b(0.034, 0.002, 0.01, 'dark', g, 0, 0.0335, -0.18 - i * 0.03);
  K.rb(0.04, 0.046, 0.009, 0.003, 'worn', g, 0, -0.004, -0.337); K.rb(0.034, 0.03, 0.012, 0.003, R, g, 0, 0.012, -0.143);
  K.e([[-0.34, -0.011], [-0.37, -0.011], [-0.37, 0.022], [-0.352, 0.031], [-0.34, 0.031]], 0.021, R, g, { r: 0.003, bev: 0.002 });
  K.b(0.006, 0.012, 0.012, R, g, 0, -0.016, -0.36);
  // barrel, cleaning rod, front sight tower with ears, two-chamber muzzle brake
  K.c(0.0084, 0.39, 'worn', g, 0, 0, -0.285, 16); K.c(0.0024, 0.345, 'bolt', g, 0, -0.0135, -0.3, 6); K.c(0.0034, 0.008, 'bolt', g, 0, -0.0135, -0.476, 8);
  K.e([[-0.426, -0.012], [-0.456, -0.012], [-0.456, 0.012], [-0.45, 0.029], [-0.432, 0.029], [-0.426, 0.012]], 0.02, R, g, { r: 0.003, bev: 0.002 });
  for (const s of [-1, 1]) K.rb(0.0022, 0.017, 0.014, 0.001, R, g, s * 0.0082, 0.036, -0.441, 0, 0, s * -0.12);
  K.cy(0.0012, 0.012, 'worn', g, 0, 0.0346, -0.441, 6);
  K.c(0.0105, 0.018, R, g, 0, 0, -0.479, 14); K.c(0.0128, 0.034, R, g, 0, 0, -0.505, 16); K.c(0.0128, 0.03, R, g, 0, 0, -0.5385, 16);
  K.c(0.0085, 0.006, R, g, 0, 0, -0.522, 12); K.b(0.027, 0.0125, 0.015, 'dark', g, 0, 0, -0.537); K.c(0.0046, 0.002, 'dark', g, 0, 0, -0.5542, 10);
  for (let i = 0; i < 3; i++) K.cy(0.0016, 0.001, 'dark', g, (i - 1) * 0.005, 0.0126, -0.503, 6);
  // pistol grip, trigger guard with magazine catch, trigger
  K.e([[0.07, -0.038], [0.108, -0.038], [0.136, -0.12, 0.004], [0.129, -0.129, 0.004], [0.101, -0.129, 0.004], [0.077, -0.062, 0.006]], 0.028, 'grip', g, { r: 0.003, bev: 0.005, bs: 3 });
  K.e([[-0.022, -0.036], [0.072, -0.036], [0.072, -0.071, 0.004], [-0.014, -0.076, 0.006], [-0.022, -0.066, 0.004]], 0.016, 'worn', g, { r: 0.001, bev: 0.0008, holes: [[[-0.0195, -0.038], [0.0695, -0.038], [0.0695, -0.0685], [-0.014, -0.0735], [-0.0195, -0.065]]], hr: 0.003 });
  K.rb(0.012, 0.022, 0.004, 0.001, 'worn', g, 0, -0.054, -0.0235, 0.2);
  K.e([[0.03, -0.038], [0.037, -0.038], [0.034, -0.05], [0.029, -0.06, 0.003], [0.0255, -0.059, 0.002], [0.028, -0.05]], 0.005, 'worn', g, { r: 0.001, bev: 0.001 });
  // side-folding polymer stock with latch groove
  K.e([[0.158, 0.006, 0.003], [0.39, 0.0, 0.004], [0.4, -0.006, 0.004], [0.402, -0.106, 0.004], [0.392, -0.113, 0.004], [0.375, -0.108, 0.004], [0.3, -0.05, 0.02], [0.2, -0.035, 0.006], [0.158, -0.035, 0.003]], 0.031, 'poly', g, { r: 0.004, bev: 0.004, bs: 3 });
  K.rb(0.0316, 0.013, 0.12, 0.004, 'dark', g, 0, -0.012, 0.27); K.rb(0.033, 0.116, 0.006, 0.002, 'worn', g, 0, -0.053, 0.4035);
  K.cy(0.0055, 0.046, 'worn', g, -0.011, -0.014, 0.161, 8); K.tor(0.006, 0.0014, 'worn', g, -0.017, -0.02, 0.2, 0, Math.PI / 2);
  // 30-round 5.45 magazine
  const mag = K.grp(g, 0, -0.04, -0.055);
  K.e([[0.03, 0.012], [0.03, -0.03], [0.022, -0.082, 0.03], [0.0, -0.132, 0.03], [-0.022, -0.16, 0.003], [-0.079, -0.133, 0.003], [-0.053, -0.09, 0.03], [-0.037, -0.045, 0.03], [-0.031, 0.012]], 0.0225, 'plum', mag, { r: 0.002, bev: 0.002 });
  for (let i = 0; i < 4; i++) K.rb(0.0238, 0.003, 0.052, 0.001, 'plum', mag, 0, -0.028 - i * 0.031, -0.003 - i * 0.012, 0.1 + i * 0.16);
  K.rb(0.0245, 0.007, 0.064, 0.002, 'plum', mag, 0, -0.1485, -0.05, 0.445); K.b(0.012, 0.01, 0.006, 'plum', mag, 0, 0.004, -0.033);
  return { g, mag, chg: null, slide: null, bolt, boltMode: 'slide', travel: 0.085, muzzle: [0, 0, -0.56], port: [0.02, 0.012, -0.03], brass: [0.008, '545'] };
}
function gunM107(K) {
  const g = new THREE.Group(), A = 'anod';
  const sec = [[-0.031, -0.03], [0.031, -0.03], [0.031, 0.02], [0.02, 0.04, 0.004], [-0.02, 0.04, 0.004], [-0.031, 0.02]];
  K.ez(sec, 0.49, -0.33, A, g, { r: 0.002, bev: 0.002 });
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) K.rb(0.0012, 0.02, 0.04, 0.0005, 'dark', g, s * 0.031, 0.0, -0.285 + i * 0.052);
  K.b(0.0012, 0.03, 0.12, 'dark', g, 0.031, 0.004, -0.02);
  const bolt = K.grp(g); K.b(0.0012, 0.022, 0.11, 'bolt', bolt, 0.0314, 0.004, -0.018);
  K.cx(0.0055, 0.04, 'bolt', bolt, 0.05, 0.004, 0.0, 10); K.sp(0.009, 'poly', bolt, 0.074, 0.004, 0.0);
  K.rail(g, -0.32, 0.22, 0.043);
  if (K.hi) for (const z of [-0.3, -0.12, 0.06, 0.24, 0.42]) K.disc2(0.004, 0.0015, 'worn', g, 0.0312, -0.02, z);
  // lower receiver, magazine well, trigger group, grip
  K.e([[-0.09, -0.03], [0.27, -0.03], [0.27, -0.07], [0.19, -0.09, 0.006], [0.05, -0.09], [0.047, -0.106], [-0.05, -0.106], [-0.09, -0.08, 0.006]], 0.056, A, g, { r: 0.003, bev: 0.002 });
  K.disc2(0.0065, 0.002, 'worn', g, 0.0285, -0.05, 0.24); K.disc2(0.0065, 0.002, 'worn', g, 0.0285, -0.05, -0.07);
  K.cx(0.004, 0.006, 'worn', g, -0.03, -0.062, 0.1, 10); K.rb(0.003, 0.006, 0.02, 0.001, 'worn', g, -0.032, -0.062, 0.09);
  K.e([[0.062, -0.088], [0.152, -0.088], [0.152, -0.122, 0.005], [0.07, -0.126, 0.006], [0.062, -0.116, 0.004]], 0.014, A, g, { r: 0.001, bev: 0.0008, holes: [[[0.065, -0.09], [0.149, -0.09], [0.149, -0.119], [0.07, -0.123], [0.065, -0.114]]], hr: 0.003 });
  K.e([[0.1, -0.089], [0.107, -0.089], [0.104, -0.1], [0.099, -0.111, 0.003], [0.0955, -0.11, 0.002], [0.098, -0.1]], 0.006, 'worn', g, { r: 0.001, bev: 0.001 });
  K.e([[0.15, -0.088], [0.188, -0.088], [0.214, -0.178, 0.004], [0.207, -0.186, 0.004], [0.178, -0.186, 0.004], [0.156, -0.115, 0.006]], 0.03, 'grip', g, { r: 0.003, bev: 0.005, bs: 3 });
  // rear: lower stock body with rear hand grip, cheek piece, recoil pad
  K.e([[0.27, -0.03], [0.49, -0.03], [0.49, -0.086], [0.445, -0.102, 0.008], [0.4, -0.102, 0.008], [0.38, -0.072], [0.27, -0.07]], 0.05, A, g, { r: 0.003, bev: 0.003 });
  K.rb(0.05, 0.012, 0.17, 0.004, 'poly', g, 0, 0.045, 0.37); K.rb(0.062, 0.14, 0.03, 0.008, 'rubber', g, 0, -0.022, 0.505);
  if (K.hi) for (let i = 0; i < 6; i++) K.b(0.063, 0.003, 0.031, 'dark', g, 0, -0.07 + i * 0.02, 0.505);
  K.cy(0.008, 0.05, A, g, 0, -0.118, 0.42, 10);
  // fluted barrel and arrowhead muzzle brake
  K.c(0.023, 0.06, A, g, 0, 0, -0.36, 20); K.c(0.019, 0.5, 'worn', g, 0, 0, -0.63, 20);
  for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; K.b(0.004, 0.002, 0.36, 'dark', g, Math.cos(t) * 0.0186, Math.sin(t) * 0.0186, -0.62, 0, 0, t + Math.PI / 2); }
  K.c(0.022, 0.12, A, g, 0, 0, -0.93, 16);
  K.ey([[0.021, -0.875], [0.044, -0.888], [0.044, -0.9], [0.022, -0.915], [0.022, -0.925], [0.042, -0.94], [0.042, -0.952], [0.022, -0.968], [0.022, -0.99], [-0.022, -0.99], [-0.022, -0.968], [-0.042, -0.952], [-0.042, -0.94], [-0.022, -0.925], [-0.022, -0.915], [-0.044, -0.9], [-0.044, -0.888], [-0.021, -0.875]], -0.022, 0.022, A, g, { r: 0.001, bev: 0.002 });
  K.b(0.06, 0.024, 0.012, 'dark', g, 0, 0, -0.906); K.b(0.06, 0.024, 0.012, 'dark', g, 0, 0, -0.958); K.c(0.0075, 0.002, 'dark', g, 0, 0, -0.9905, 12);
  // folded bipod
  K.rb(0.07, 0.022, 0.03, 0.004, A, g, 0, -0.03, -0.345);
  for (const s of [-1, 1]) { K.c(0.0065, 0.27, A, g, s * 0.026, -0.044, -0.49, 8); K.c(0.0048, 0.06, 'worn', g, s * 0.026, -0.044, -0.63, 8); K.rb(0.018, 0.012, 0.03, 0.004, 'rubber', g, s * 0.026, -0.046, -0.665); }
  // 10x scope on two rings
  const sc = K.grp(g, 0, 0.106, -0.03);
  K.c(0.017, 0.3, A, sc, 0, 0, 0, 24); K.c(0.019, 0.05, A, sc, 0, 0, -0.142, 24, 0.029); K.c(0.029, 0.075, A, sc, 0, 0, -0.2045, 24); K.c(0.0305, 0.006, A, sc, 0, 0, -0.239, 24);
  K.c(0.0225, 0.035, A, sc, 0, 0, 0.142, 24, 0.017); K.c(0.0225, 0.055, A, sc, 0, 0, 0.187, 24); K.c(0.024, 0.014, 'rubber', sc, 0, 0, 0.212, 24);
  K.c(0.0265, 0.003, 'lens', sc, 0, 0, -0.2405, 24); K.c(0.019, 0.003, 'lens', sc, 0, 0, 0.2185, 20);
  K.rb(0.04, 0.036, 0.04, 0.008, A, sc, 0, 0, -0.01); K.cy(0.012, 0.024, A, sc, 0, 0.03, -0.01, 18); K.cy(0.0128, 0.008, 'worn', sc, 0, 0.044, -0.01, 18);
  K.cx(0.012, 0.024, A, sc, 0.03, 0, -0.01, 18); K.cx(0.0128, 0.008, 'worn', sc, 0.044, 0, -0.01, 18); K.cx(0.011, 0.02, A, sc, -0.028, 0, -0.01, 16);
  K.c(0.0185, 0.014, 'worn', sc, 0, 0, 0.11, 24);
  for (const z of [-0.09, 0.075]) { K.rb(0.042, 0.044, 0.02, 0.006, A, sc, 0, 0, z); K.rb(0.03, 0.034, 0.02, 0.003, A, sc, 0, -0.038, z); K.rb(0.038, 0.01, 0.024, 0.002, A, sc, 0, -0.056, z); K.cx(0.005, 0.012, 'worn', sc, 0.022, -0.056, z, 6); for (const s of [-1, 1]) K.cy(0.0022, 0.004, 'worn', sc, s * 0.016, 0.022, z, 6); }
  // 10-round box magazine
  const mag = K.grp(g, 0, -0.09, 0.0);
  K.rb(0.044, 0.124, 0.086, 0.004, A, mag, 0, -0.05, 0); K.rb(0.048, 0.01, 0.092, 0.003, A, mag, 0, -0.114, 0);
  for (let i = 0; i < 3; i++) K.b(0.0455, 0.085, 0.006, A, mag, 0, -0.06, -0.026 + i * 0.026);
  return { g, mag, chg: null, slide: null, bolt, boltMode: 'slide', travel: 0.09, muzzle: [0, 0, -0.995], port: [0.035, 0.01, -0.05], brass: [0.013, '50'], eye: [0, 0.106, -0.03 + 0.2205], eyeR: 0.0188 };
}
function gunM9(K) {
  const g = new THREE.Group(), by = 0.013, slide = K.grp(g);
  // open-top slide: two rails, front bridge, rear block with safety and serrations
  K.e([[0.101, -0.001], [0.101, 0.02, 0.004], [0.094, 0.025, 0.003], [0.03, 0.025], [0.022, 0.021], [-0.066, 0.02], [-0.072, 0.0235], [-0.101, 0.022, 0.003], [-0.102, -0.001]], 0.029, 'anod', slide, { r: 0.001, bev: 0.003, holes: [] });
  K.b(0.016, 0.006, 0.086, 'dark', slide, 0, 0.0178, -0.022); K.c(0.0074, 0.094, 'worn', slide, 0, by + 0.003, -0.022, 16); K.b(0.012, 0.004, 0.02, 'worn', slide, 0, 0.0215, 0.012);
  for (let i = 0; i < 8; i++) K.b(0.0296, 0.016, 0.0016, 'dark', slide, 0, 0.012, 0.05 + i * 0.0042, 0.12);
  for (const s of [-1, 1]) { K.cx(0.0042, 0.004, 'worn', slide, s * 0.0155, 0.015, 0.088, 10); K.rb(0.003, 0.004, 0.016, 0.001, 'worn', slide, s * 0.0168, 0.0165, 0.079, -0.25); }
  K.b(0.0008, 0.003, 0.02, 'worn', slide, 0.0148, 0.014, 0.022);
  K.b(0.0032, 0.0055, 0.007, 'worn', slide, 0, 0.02625, -0.092); K.b(0.0016, 0.0016, 0.0006, 'white', slide, 0, 0.0274, -0.0884);
  K.rb(0.02, 0.0035, 0.01, 0.001, 'worn', slide, 0, 0.0262, 0.09); for (const s of [-1, 1]) { K.b(0.006, 0.004, 0.008, 'worn', slide, s * 0.0052, 0.027, 0.091); K.b(0.0014, 0.0014, 0.0006, 'white', slide, s * 0.0052, 0.0276, 0.0952); }
  K.c(0.0074, 0.012, 'worn', slide, 0, by, -0.103, 16); K.c(0.0046, 0.002, 'dark', slide, 0, by, -0.1092, 10); K.c(0.004, 0.004, 'worn', slide, 0, 0.002, -0.101, 8);
  // alloy frame, trigger guard, external hammer, grip panels with screws
  K.e([[-0.088, -0.002], [0.09, -0.002], [0.108, -0.007, 0.004], [0.093, -0.02, 0.006], [0.093, -0.05, 0.01], [0.104, -0.09, 0.02], [0.118, -0.126, 0.004], [0.068, -0.134, 0.004], [0.05, -0.085, 0.01], [0.04, -0.05, 0.004], [0.028, -0.061, 0.004], [-0.024, -0.062, 0.006], [-0.036, -0.05, 0.006], [-0.04, -0.034, 0.004], [-0.03, -0.021, 0.003], [-0.082, -0.019, 0.006]],
    0.027, 'anod', g, { r: 0.002, bev: 0.003, bs: 3, holes: [[[0.036, -0.026], [-0.026, -0.026], [-0.03, -0.045], [-0.02, -0.056], [0.024, -0.055], [0.037, -0.044]]], hr: 0.005 });
  K.e([[0.058, -0.03], [0.09, -0.03], [0.1, -0.09], [0.112, -0.12], [0.072, -0.127], [0.056, -0.085]], 0.034, 'grip', g, { r: 0.006, bev: 0.003, bs: 2 });
  for (const s of [-1, 1]) { K.cx(0.0028, 0.002, 'bolt', g, s * 0.0168, -0.045, 0.076, 8); K.cx(0.0028, 0.002, 'bolt', g, s * 0.0168, -0.108, 0.094, 8); K.cx(0.0055, 0.0012, 'worn', g, s * 0.0171, -0.075, 0.082, 12); }
  K.e([[0.006, -0.026], [0.013, -0.026], [0.011, -0.038], [0.006, -0.05, 0.003], [0.002, -0.049, 0.002], [0.005, -0.038]], 0.006, 'worn', g, { r: 0.001, bev: 0.001 });
  K.rb(0.002, 0.004, 0.03, 0.001, 'worn', g, -0.0146, -0.008, 0.03); K.rb(0.003, 0.006, 0.012, 0.001, 'worn', g, -0.0146, -0.01, -0.03); K.cx(0.0036, 0.029, 'worn', g, 0, -0.032, 0.044, 10);
  K.e([[0.1, 0.002], [0.106, 0.016, 0.003], [0.113, 0.017, 0.003], [0.112, 0.004], [0.106, -0.004]], 0.008, 'worn', g, { r: 0.001, bev: 0.001 });
  K.tor(0.004, 0.0013, 'worn', g, 0, -0.134, 0.1, 0, Math.PI / 2);
  const mag = K.grp(g, 0, -0.07, 0.066); mag.rotation.x = -0.3;
  K.rb(0.021, 0.1, 0.033, 0.003, 'bolt', mag, 0, 0, 0); K.rb(0.03, 0.01, 0.052, 0.003, 'poly', mag, 0, -0.058, 0.001);
  if (K.hi) for (let i = 0; i < 5; i++) K.c(0.0016, 0.001, 'dark', mag, 0, -0.03 + i * 0.014, 0.0167, 6);
  return { g, mag, chg: null, slide, muzzle: [0, by, -0.112], port: [0.012, 0.026, -0.01], brass: [0.051, '9mm'] };
}
// Remington 870 Police: 18.5 in barrel with brass bead, +2 magazine extension and clamp, parkerized receiver, ribbed synthetic pump on twin
// action bars, cross-bolt safety, synthetic stock with recoil pad. Bore axis at y = 0, magazine tube underneath.
function gunM870(K) {
  const g = new THREE.Group(), R = 'park', ty = -0.0255;
  // receiver: flat top with a sighting groove, rear sloping into the stock tang
  K.e([[-0.104, 0.008], [-0.099, 0.0135], [0.058, 0.0135], [0.084, 0.0065], [0.096, -0.004], [0.096, -0.042], [-0.104, -0.042]], 0.029, R, g, { r: 0.002, bev: 0.0018 });
  K.b(0.004, 0.0012, 0.15, 'dark', g, 0, 0.0136, -0.025);
  if (K.hi) for (const s of [-1, 1]) K.b(0.0006, 0.002, 0.19, 'worn', g, s * 0.0146, 0.009, -0.004);
  // ejection port on the right, loading port and shell lifter underneath
  K.b(0.001, 0.021, 0.072, 'dark', g, 0.0146, -0.002, -0.056);
  const boltIn = K.grp(g, 0.0148, -0.002, -0.02); K.b(0.0008, 0.016, 0.068, 'bolt', boltIn, 0, 0, -0.034);
  if (K.hi) K.b(0.0009, 0.004, 0.012, 'dark', boltIn, 0.0001, 0.004, -0.058);
  K.b(0.021, 0.001, 0.078, 'dark', g, 0, -0.0424, -0.058); K.b(0.016, 0.0012, 0.062, 'worn', g, 0, -0.0412, -0.054);
  // trigger plate pins, slide release, aluminium trigger guard, trigger, cross-bolt safety
  K.disc2(0.0028, 0.0012, 'worn', g, 0.0146, -0.034, 0.004); K.disc2(0.0028, 0.0012, 'worn', g, 0.0146, -0.034, 0.064);
  K.rb(0.003, 0.004, 0.02, 0.001, 'anod', g, -0.0156, -0.044, 0.004, 0.2);
  K.e([[-0.012, -0.042], [0.092, -0.042], [0.092, -0.05], [0.076, -0.075, 0.006], [0.02, -0.076, 0.006], [0.002, -0.061, 0.004], [-0.012, -0.05]], 0.016, 'anod', g, { r: 0.001, bev: 0.0008, holes: [[[0.005, -0.046], [0.071, -0.046], [0.071, -0.069], [0.023, -0.072], [0.007, -0.06]]], hr: 0.004 });
  K.e([[0.031, -0.043], [0.037, -0.043], [0.035, -0.055], [0.03, -0.065, 0.003], [0.0265, -0.064, 0.002], [0.029, -0.055]], 0.005, 'worn', g, { r: 0.001, bev: 0.001 });
  K.cx(0.003, 0.025, 'worn', g, 0, -0.047, 0.08, 10); K.cx(0.0012, 0.0005, 'red', g, 0.0127, -0.047, 0.08, 8);
  // barrel with breech ring, bead post and brass bead, open bore
  K.c(0.0118, 0.014, R, g, 0, 0, -0.111, 20); K.c(0.0104, 0.452, R, g, 0, 0, -0.342, 20);
  K.c(0.0093, 0.002, 'dark', g, 0, 0, -0.5675, 16);
  K.cy(0.0013, 0.003, R, g, 0, 0.0116, -0.553, 8); K.sp(0.0017, 'brass', g, 0, 0.0142, -0.553);
  // magazine tube, extension joint, barrel loop, extension clamp with screw, knurled cap
  K.c(0.0112, 0.42, R, g, 0, ty, -0.314, 18); K.c(0.0118, 0.006, R, g, 0, ty, -0.372, 18);
  K.rb(0.0255, 0.042, 0.014, 0.004, R, g, 0, -0.0128, -0.378);
  K.rb(0.028, 0.045, 0.017, 0.003, 'anod', g, 0, -0.0128, -0.5); K.cx(0.0028, 0.032, 'worn', g, 0, -0.0128, -0.5, 8);
  K.c(0.0124, 0.022, R, g, 0, ty, -0.535, 18); K.sp(0.0124, R, g, 0, ty, -0.546, 1, 1, 0.35);
  if (K.hi) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; K.b(0.0016, 0.0012, 0.018, 'worn', g, Math.cos(a) * 0.0124, ty + Math.sin(a) * 0.0124, -0.535, 0, 0, a + Math.PI / 2); }
  // pump: ribbed synthetic forend wrapping the tube, twin action bars running back into the receiver
  const pump = K.grp(g);
  K.ez([[-0.0195, -0.0118], [0.0195, -0.0118], [0.0228, -0.026, 0.01], [0.0175, -0.0465, 0.012], [-0.0175, -0.0465, 0.012], [-0.0228, -0.026, 0.01]], -0.198, -0.364, 'poly', pump, { bev: 0.003, bs: 3 });
  for (const z of [-0.198, -0.364]) K.ez([[-0.0205, -0.0118], [0.0205, -0.0118], [0.0238, -0.026, 0.01], [0.0183, -0.0475, 0.012], [-0.0183, -0.0475, 0.012], [-0.0238, -0.026, 0.01]], z - 0.004, z + 0.004, 'poly', pump, { bev: 0.0015 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) K.b(0.0014, 0.0022, 0.13, 'dark', pump, s * (0.0222 - i * 0.0012), -0.019 - i * 0.0068, -0.281);
  for (let i = 0; i < 3; i++) K.b(0.022, 0.0016, 0.13, 'dark', pump, 0, -0.0468, -0.281).position.x = (i - 1) * 0.008;
  for (const s of [-1, 1]) K.b(0.0018, 0.0045, 0.15, 'worn', pump, s * 0.0118, ty, -0.135);
  // synthetic stock: straight wrist, comb, butt with a ventilated recoil pad and sling stud
  K.e([[0.094, 0.0125], [0.122, -0.008, 0.02], [0.16, -0.013, 0.03], [0.23, -0.012, 0.03], [0.392, -0.036, 0.004], [0.392, -0.172, 0.004], [0.33, -0.14, 0.03], [0.21, -0.078, 0.03], [0.15, -0.058, 0.02], [0.105, -0.05, 0.006], [0.094, -0.042]], 0.034, 'poly', g, { r: 0.004, bev: 0.005, bs: 3 });
  K.e([[0.391, -0.035], [0.414, -0.037], [0.419, -0.045, 0.004], [0.419, -0.174, 0.004], [0.412, -0.182], [0.391, -0.18]], 0.039, 'rubber', g, { r: 0.003, bev: 0.003 });
  if (K.hi) for (let i = 0; i < 5; i++) K.b(0.03, 0.012, 0.016, 'dark', g, 0, -0.06 - i * 0.024, 0.408);
  K.cy(0.0032, 0.01, 'worn', g, 0, -0.152, 0.335, 8); K.tor(0.007, 0.0014, 'worn', g, 0, -0.16, 0.335, 0, Math.PI / 2);
  // one 12 ga shell sitting in the loading port (shown in the hand while loading): red hull, brass head and rim
  const mag = K.grp(g, 0, -0.036, -0.06);
  K.c(0.0101, 0.052, 'red', mag, 0, 0, -0.008, 16); K.c(0.0086, 0.002, 'red', mag, 0, 0, -0.0345, 12);
  K.c(0.0104, 0.014, 'brass', mag, 0, 0, 0.025, 16); K.c(0.0112, 0.0014, 'brass', mag, 0, 0, 0.0327, 16);
  return { g, mag, chg: null, slide: null, bolt: pump, boltMode: 'slide', travel: 0.088, boltIn, muzzle: [0, 0, -0.568], port: [0.018, 0.0, -0.05], brass: [0, '12g'] };
}
const GUN_MODEL = { m4: gunM4, g17: gunG17, m107: gunM107, ak74: gunAK, m9: gunM9, m870: gunM870 };
