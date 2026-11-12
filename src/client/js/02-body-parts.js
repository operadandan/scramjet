// ---------------------------------------------------------------- body parts (shared by humanoids and ragdolls)
const geoCache = {};
const GC = (k, make) => geoCache[k] || (geoCache[k] = make());
const rbox = (w, h, d, r) => GC('rb' + w + '_' + h + '_' + d + '_' + r, () => new RoundedBoxGeometry(w, h, d, 1, r));
const sph = r => GC('sp' + r, () => new THREE.SphereGeometry(r, 14, 10));
const hemi = r => GC('hm' + r, () => new THREE.SphereGeometry(r, 16, 7, 0, Math.PI * 2, 0, Math.PI * 0.5));
const cylg = (r, h, s, r2) => GC('cy' + r + '_' + h + '_' + s + '_' + r2, () => new THREE.CylinderGeometry(r, r2 === undefined ? r : r2, h, s || 14));
// lathe profile [radius, y] pairs, bottom to top
const latheG = (key, pts) => GC('la' + key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 14));
// tapered limb with rounded ends, from y=0 (top joint) down to y=-len
function limbG(len, rt, rm, rb) {
  return GC('lb' + len + '_' + rt + '_' + rm + '_' + rb, () => {
    const pts = [[0, -len - rb * 0.6]];
    for (let i = 1; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push([Math.sin(a) * rb, -len - rb * 0.6 * Math.cos(a) + 0.0]); }
    const N = 8;
    for (let i = 1; i < N; i++) { const t = i / N, r = t < 0.5 ? lerp(rb, rm, smooth(t / 0.5)) : lerp(rm, rt, smooth((t - 0.5) / 0.5)); pts.push([r, -len + t * len]); }
    for (let i = 0; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push([Math.cos(a) * rt, rt * 0.6 * Math.sin(a)]); }
    pts.push([0, rt * 0.6]);
    return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), 12);
  });
}
const HUM_DEFAULT = { skin: 0xc19275, shirt: 0x5f6349, pants: 0x565a44, vest: 0x86734f, vest2: 0x756445, pack: 0x4f5340, belt: 0x4a4232, boots: 0x3b3227, sole: 0x1c1915, helmet: 0x6a6250, glove: 0x2f2c26, pad: 0x3a372f, dark: 0x161616, hair: 0x2a1f18 };
const TORSO_PTS = [[0.0, 0.0], [0.145, 0.0], [0.15, 0.06], [0.148, 0.14], [0.158, 0.22], [0.178, 0.31], [0.19, 0.4], [0.192, 0.47], [0.175, 0.52], [0.13, 0.555], [0.07, 0.575], [0.0, 0.58]];
const PELVIS_PTS = [[0.0, -0.13], [0.09, -0.125], [0.15, -0.08], [0.165, -0.02], [0.158, 0.05], [0.148, 0.1], [0.0, 0.1]];
// merge each skeleton segment's meshes into one vertex-coloured mesh (one draw call per bone instead of dozens)
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
function mergeChildren(group, matl, pick) {
  const parts = group.children.filter(pick || (c => c.isMesh && !c.isInstancedMesh && !c.userData.armor && !c.userData.keep && !c.userData.organ && !c.userData.inner));
  if (parts.length < 2) return parts[0] || null;
  const geos = []; let frame = null, hum = null;
  for (const m of parts) {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    const tn = g.attributes.tint ? g.attributes.tint.array : null;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const col = m.material.color || new THREE.Color(1, 1, 1), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r * (tn ? tn[i * 3] : 1); arr[i * 3 + 1] = col.g * (tn ? tn[i * 3 + 1] : 1); arr[i * 3 + 2] = col.b * (tn ? tn[i * 3 + 2] : 1); }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
    if (m.userData.frame) { frame = m.userData.frame; hum = m.userData.hum; }
    group.remove(m);
  }
  const merged = new THREE.Mesh(mergeGeometries(geos), matl);
  merged.castShadow = true; merged.receiveShadow = matl !== shadowMat;
  if (frame) { merged.userData.frame = frame; merged.userData.hum = hum; }
  group.add(merged);
  return merged;
}
function mergeTree(root, matl) { const groups = []; root.traverse(o => { if (!o.isMesh && !o.isSprite) groups.push(o); }); for (const g of groups) { mergeChildren(g, matl); const o = mergeChildren(g, matl, c => c.isMesh && c.userData.organ); if (o) { o.userData.organ = true; o.castShadow = false; o.visible = false; } } }
const capg = (r, l) => GC('cp' + r + '_' + l, () => new THREE.CapsuleGeometry(r, l, 2, 6));
const hemiBack = r => GC('hb' + r, () => new THREE.SphereGeometry(r, 12, 4, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.5, Math.PI * 0.2));
const plateGeo = () => { const g = new THREE.ExtrudeGeometry(polyShape([[-0.122, 0], [0.122, 0], [0.135, 0.02], [0.135, 0.2], [0.085, 0.31], [-0.085, 0.31], [-0.135, 0.2], [-0.135, 0.02]], 0.018), { depth: 0.026, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: 2, curveSegments: 4 }); return g; };
// Head: one smooth surface with the skull, cheek and jaw shape, deliberately featureless.
// brain: a rounded mass with folds pressed into it
const brainGeo = () => {
  const g = new THREE.SphereGeometry(1, 28, 20), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 - 0.07 * Math.abs(Math.sin(x * 9 + y * 4) * Math.sin(z * 8 - y * 6)) - (Math.abs(x) < 0.08 && y > 0 ? 0.08 : 0); p.setXYZ(i, x * k, y * k * (y < -0.3 ? 0.8 : 1), z * k); }
  g.computeVertexNormals(); return g;
};
const faceGeo = () => {
  const g = new THREE.SphereGeometry(1, 48, 36), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 0.078, y = pos.getY(i) * 0.115, z = pos.getZ(i) * 0.097;
    const jaw = smooth(clamp((-0.012 - y) / 0.1, 0, 1));
    x *= 1 - 0.3 * jaw;
    if (z > 0) z *= (1 + 0.07 * (1 - jaw)) * (1 - 0.42 * jaw);
    if (z < -0.074) z = -0.074 + (z + 0.074) * 0.5;
    // soft brow ridge and cheekbones so the face plane still reads under light
    const f = z < 0 ? Math.min(1, -z / 0.045) : 0, ax = Math.abs(x);
    z -= f * (0.004 * Math.exp(-((y - 0.02) ** 2) / 0.00008) * Math.exp(-(x * x) / 0.003) + 0.003 * Math.exp(-((ax - 0.04) ** 2 + (y + 0.02) ** 2) / 0.0003));
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
};
// FAST-style high-cut helmet, built once per colour scheme and baked to a single vertex-coloured mesh.
// Shell: a dome whose lower edge follows the high cut (low at the brow, cut up over the ears, dropping at the nape).
const HSH = { cx: 0, cy: 0.012, cz: 0.004, sx: 0.094, sy: 0.119, sz: 0.113 };
function helmetEdge(az) { const a = Math.abs(az); return 1.36 + 0.5 * smooth(clamp((a - 2.05) / 0.85, 0, 1)) - 0.19 * Math.exp(-(((a - 1.62) / 0.3) ** 2)); }
function shellPt(az, pol, k) { k = k || 1; return new V3(HSH.cx + HSH.sx * k * Math.sin(pol) * Math.sin(az), HSH.cy + HSH.sy * k * Math.cos(pol), HSH.cz - HSH.sz * k * Math.sin(pol) * Math.cos(az)); }
function shellN(az, pol) { const p = shellPt(az, pol); return new V3((p.x - HSH.cx) / (HSH.sx * HSH.sx), (p.y - HSH.cy) / (HSH.sy * HSH.sy), (p.z - HSH.cz) / (HSH.sz * HSH.sz)).normalize(); }
function shellGeo() {
  const A = 64, Pn = 18, pos = [], idx = [], ring = (k, flip) => {
    const base = pos.length / 3;
    for (let i = 0; i <= A; i++) { const az = -Math.PI + i / A * Math.PI * 2, e = helmetEdge(az); for (let j = 0; j <= Pn; j++) { const p = shellPt(az, e * j / Pn, k); pos.push(p.x, p.y, p.z); } }
    for (let i = 0; i < A; i++) for (let j = 0; j < Pn; j++) { const a = base + i * (Pn + 1) + j, b = a + Pn + 1; if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return base;
  };
  const o = ring(1, false), n = ring(0.93, true);
  // rolled rim joining outer and inner shell along the cut edge
  for (let i = 0; i < A; i++) { const a = o + i * (Pn + 1) + Pn, b = o + (i + 1) * (Pn + 1) + Pn, c = n + i * (Pn + 1) + Pn, d = n + (i + 1) * (Pn + 1) + Pn; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a piece of material lying on the shell: (u, v) in 0..1 mapped to (azimuth, polar angle), lifted off the surface by off
function shellBand(f, off, nu, nv) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const [az, pol] = f(i / nu, j / nv); const p = shellPt(az, pol).addScaledVector(shellN(az, pol), off); pos.push(p.x, p.y, p.z); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function helmetBaked(c) {
  return GC('helmet_' + c.helmet + '_' + c.dark + '_' + c.vest2, () => {
    const grp = new THREE.Group(), M = col => mat(col, 0.8, 0);
    const put = (geo, col, p, q) => { const m = new THREE.Mesh(geo, M(col)); m.position.copy(p); if (q) m.quaternion.copy(q); grp.add(m); return m; };
    const onShell = (az, pol, off) => { const n = shellN(az, pol), p = shellPt(az, pol).addScaledVector(n, off || 0); const t = new V3(Math.cos(az), 0, Math.sin(az)); const up = new V3().crossVectors(n, t).normalize(); const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, up, n)); return { p, q, n }; };
    put(shellGeo(), c.helmet, new V3());
    // ARC side rails: a band following the curve just above the cut, with slots
    for (const s of [-1, 1]) {
      const az0 = s < 0 ? -2.15 : 0.95, az1 = s < 0 ? -0.95 : 2.15;
      put(shellBand((u, v) => { const az = lerp(az0, az1, u); return [az, helmetEdge(az) - lerp(0.17, 0.08, v)]; }, 0.005, 16, 2), c.dark, new V3());
      put(shellBand((u, v) => { const az = lerp(az0, az1, u); return [az, helmetEdge(az) - lerp(0.17, 0.08, v)]; }, 0.002, 16, 1), c.dark, new V3());
      for (let i = 0; i < 6; i++) { const az = s * (1.08 + i * 0.19), r = onShell(az, helmetEdge(az) - 0.125, 0.0055); put(new THREE.BoxGeometry(0.009, 0.006, 0.002), 0x050505, r.p, r.q); }
    }
    // NVG shroud on the brow, with its slot
    { const r = onShell(0, 1.08, 0.005); put(new RoundedBoxGeometry(0.056, 0.036, 0.012, 1, 0.004), c.dark, r.p, r.q); put(new THREE.BoxGeometry(0.02, 0.012, 0.004), 0x050505, r.p.clone().addScaledVector(r.n, 0.006), r.q); }
    // hook-and-loop panels on the crown and the back
    put(shellBand((u, v) => [lerp(-0.6, 0.6, u), lerp(0.14, 0.46, v)], 0.0022, 8, 4), c.vest2, new V3());
    put(shellBand((u, v) => [lerp(Math.PI - 0.38, Math.PI + 0.38, u), lerp(0.95, 1.24, v)], 0.0022, 6, 3), c.vest2, new V3());
    // bungee cords from front to back along both sides
    for (const s of [-1, 1]) for (const pol0 of [0.75, 1.0]) {
      const pts = []; for (let i = 0; i <= 10; i++) { const az = s * lerp(0.55, 2.55, i / 10), pol = pol0 + 0.15 * Math.sin(i / 10 * Math.PI); pts.push(shellPt(az, pol).addScaledVector(shellN(az, pol), 0.004)); }
      put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.0018, 5), 0x1a1a1a, new V3());
    }
    // counterweight / battery pouch at the back, IR strobe on top
    { const r = onShell(Math.PI, 1.45, 0.014); put(new RoundedBoxGeometry(0.07, 0.042, 0.028, 1, 0.008), c.vest2, r.p, r.q); }
    { const r = onShell(Math.PI, 0.55, 0.008); put(new RoundedBoxGeometry(0.024, 0.014, 0.016, 1, 0.004), c.dark, r.p, r.q); }
    // retention harness: side straps from the rails down to a chin cup, rear strap with dial
    for (const s of [-1, 1]) {
      const top = shellPt(s * 1.62, helmetEdge(s * 1.62) - 0.02), chin = new V3(s * 0.028, -0.118, -0.05);
      const mid = top.clone().lerp(chin, 0.5), len = top.distanceTo(chin), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), top.clone().sub(chin).normalize());
      put(new THREE.BoxGeometry(0.012, len, 0.003), 0x1c1c1a, mid, q);
      const rear = shellPt(s * 2.3, helmetEdge(s * 2.3) - 0.02), mid2 = rear.clone().lerp(chin, 0.5), q2 = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), rear.clone().sub(chin).normalize());
      put(new THREE.BoxGeometry(0.01, rear.distanceTo(chin), 0.003), 0x1c1c1a, mid2, q2);
    }
    put(new RoundedBoxGeometry(0.046, 0.016, 0.026, 1, 0.006), 0x1c1c1a, new V3(0, -0.122, -0.056));
    { const r = onShell(Math.PI, helmetEdge(Math.PI) - 0.06, -0.012); put(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 14).rotateX(Math.PI / 2), 0x111111, r.p, r.q); }
    return bakeColored(grp);
  });
}

const noseGeo = () => { const g = new THREE.ConeGeometry(0.016, 0.046, 4, 1); g.rotateY(Math.PI / 4); g.scale(0.8, 1, 1.1); return g; };
class Body {
  constructor(pal, M, onHit) { this.c = pal; this.M = M; this.onHit = onHit; }
  add(geo, col, parent, x, y, z, frame, s, r, armor) {
    const m = new THREE.Mesh(geo, col && col.isMaterial ? (this.M(0) === shadowMat ? shadowMat : col) : this.M(col));
    // first-person body: the chest rig is drawn smaller and pulled in against the torso, so looking down it doesn't fill the view
    if (this.rk) { const k = this.rk.k; x *= k; z *= k * 0.9; y = this.rk.y0 + (y - this.rk.y0) * 0.94; s = s ? [s[0] * k, s[1] * k, s[2] * k] : [k, k, k]; }
    m.position.set(x, y, z); if (s) m.scale.set(s[0], s[1], s[2]); if (r) m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (armor) m.userData.armor = armor;
    if (frame && this.onHit) this.onHit(m, frame, armor);
    return m;
  }
  // an internal part: organs and bones stay solid (holes go around them), the skull gets cut like skin
  gut(geo, col, p, x, y, z, s, r, inner) {
    if (this.M(0) === shadowMat) return null;
    const m = this.add(geo, col, p, x, y, z, null, s, r); m.castShadow = false; m.visible = false;
    if (inner) { m.userData.inner = true; m.userData.hIn = inner; } else m.userData.organ = true;
    return m;
  }
  guts(kind, p, y, L) {
    const BONE = 0xe4d9c2, MAR = 0x9a3a2a;
    if (kind === 'chest') {
      // spine, ribs, lungs, heart, liver, stomach
      this.gut(cylg(0.016, 0.38, 8), BONE, p, 0, y + 0.26, 0.042);
      for (let i = 0; i < 7; i++) this.gut(rbox(0.03, 0.02, 0.022, 0.005), BONE, p, 0, y + 0.1 + i * 0.05, 0.048);
      for (let i = 0; i < 7; i++) { const yy = y + 0.2 + i * 0.038, rr = 0.11 + Math.min(i, 3) * 0.01 - Math.max(0, i - 4) * 0.012; this.gut(GC('rib' + i, () => new THREE.TorusGeometry(1, 0.06, 4, 20)), BONE, p, 0, yy, 0, [rr, rr * 0.6, 0.009 / 0.06 * 1], [Math.PI / 2, 0, 0]); }
      for (const sx of [-1, 1]) this.gut(sph(1), 0xc8838a, p, sx * 0.07, y + 0.37, 0.0, [0.058, 0.11, 0.06]);
      this.gut(sph(1), 0x6e1016, p, 0.025, y + 0.32, -0.025, [0.042, 0.05, 0.036]);
      this.gut(sph(1), 0x5a1a14, p, -0.035, y + 0.2, -0.005, [0.09, 0.045, 0.055]);
      this.gut(sph(1), 0xb87a74, p, 0.06, y + 0.2, -0.02, [0.05, 0.04, 0.04]);
      for (let i = 0; i < 6; i++) this.gut(GC('gut', () => new THREE.TorusGeometry(0.024, 0.011, 6, 12)), 0xc48a82, p, ((i % 3) - 1) * 0.045, y + 0.06 + Math.floor(i / 3) * 0.05, -0.01 + (i % 2) * 0.03, null, [Math.PI / 2 + i, i * 0.7, 0]);
    } else if (kind === 'pelvis') {
      this.gut(GC('pbone', () => new THREE.TorusGeometry(0.1, 0.022, 5, 14, Math.PI * 1.3)), BONE, p, 0, y - 0.03, 0, [1, 1, 0.7], [Math.PI / 2, 0, Math.PI * 0.85]);
      for (let i = 0; i < 6; i++) this.gut(GC('gut', () => new THREE.TorusGeometry(0.024, 0.011, 6, 12)), 0xc48a82, p, ((i % 3) - 1) * 0.045, y + 0.0 + Math.floor(i / 3) * 0.045, -0.02 + (i % 2) * 0.03, null, [Math.PI / 2 + i, i * 0.9, 0]);
    } else if (kind === 'head') {
      // skull shell (cut like skin, bone-coloured inside) and the brain
      this.gut(GC('face', faceGeo), BONE, p, 0, y, 0, [0.92, 0.92, 0.92], null, 0xc9b8a0);
      this.gut(GC('brain', brainGeo), 0xd4a3a3, p, 0, y + 0.028, 0.006, [0.062, 0.066, 0.08]);
    } else {
      // long bones down the middle of a limb segment (two in the forearm and shin)
      const two = kind === 'forearm' || kind === 'shin', r = kind === 'thigh' ? 0.017 : kind === 'upperArm' ? 0.013 : 0.009, len = L * 0.92;
      for (const ox of two ? [-0.012, 0.012] : [0]) this.gut(cylg(r, len, 8), BONE, p, ox, y - L / 2, 0);
      this.gut(cylg(r * 0.55, len * 0.96, 6), MAR, p, two ? 0.012 : 0, y - L / 2, 0);
    }
  }
  pelvis(p, y, f) {
    const c = this.c; f = f && 'hips';
    this.guts('pelvis', p, y);
    this.add(latheG('pelvis', PELVIS_PTS), c.pants, p, 0, y, 0, f, [1, 1, 0.68]);
    // battle belt with buckle and pistol magazine pouches
    this.add(rbox(0.345, 0.055, 0.245, 0.018), c.belt, p, 0, y + 0.075, 0, f);
    this.add(rbox(0.05, 0.04, 0.012, 0.004), c.dark, p, 0, y + 0.075, -0.125);
    for (const sx of [-0.07, -0.115]) { this.add(rbox(0.036, 0.085, 0.03, 0.006), c.vest2, p, sx, y + 0.055, -0.128); this.add(rbox(0.024, 0.02, 0.02, 0.003), c.dark, p, sx, y + 0.103, -0.128); }
    // dump pouch, rear medical pouch with red pull tab
    this.add(rbox(0.07, 0.11, 0.06, 0.02), c.vest2, p, -0.185, y + 0.02, 0.03);
    this.add(rbox(0.13, 0.085, 0.055, 0.015), c.vest2, p, 0, y + 0.05, 0.14); this.add(rbox(0.03, 0.012, 0.008, 0.002), 0xb02020, p, 0.03, y + 0.09, 0.168);
    // holster on the right hip with the pistol grip showing
    this.add(rbox(0.045, 0.15, 0.075, 0.012), c.dark, p, 0.185, y - 0.02, -0.01, null, null, [0.12, 0, 0]);
    this.add(rbox(0.03, 0.075, 0.04, 0.008), 0x1a1a1a, p, 0.19, y + 0.075, 0.035, null, null, [-0.35, 0, 0]);
    this.add(rbox(0.032, 0.03, 0.07, 0.006), 0x232427, p, 0.19, y + 0.065, -0.005);
    this.add(rbox(0.012, 0.03, 0.02, 0.003), c.pants, p, 0, y - 0.03, -0.108);
  }
  chest(p, y, f) {
    const c = this.c; f = f && 'spine';
    this.guts('chest', p, y);
    this.add(latheG('torso', TORSO_PTS), c.shirt, p, 0, y, 0, f, [1, 1, 0.6]);
    if (c.noRig) this.rk = { k: 0.84, y0: y + 0.3 };
    // plate carrier: the front plate bag is the only armour; soft back panel, cummerbund, shoulder straps
    this.add(GC('plate', plateGeo), c.vest, p, 0, y + 0.19, -0.15, f, null, [0.05, 0, 0], 'plateF');
    this.add(rbox(0.29, 0.31, 0.03, 0.014), c.vest, p, 0, y + 0.345, 0.122, f, null, [-0.04, 0, 0]);
    for (const sx of [-1, 1]) {
      this.add(rbox(0.035, 0.14, 0.23, 0.014), c.vest, p, sx * 0.176, y + 0.27, 0, f);
      for (let i = 0; i < 3; i++) this.add(rbox(0.037, 0.012, 0.2, 0.004), c.vest2, p, sx * 0.177, y + 0.225 + i * 0.045, 0);
      this.add(rbox(0.07, 0.03, 0.14, 0.012), c.vest, p, sx * 0.1, y + 0.525, -0.06, f, null, [0.5, 0, 0]);
      this.add(rbox(0.07, 0.03, 0.15, 0.012), c.vest, p, sx * 0.1, y + 0.53, 0.06, f, null, [-0.45, 0, 0]);
      this.add(rbox(0.078, 0.036, 0.1, 0.014), c.vest2, p, sx * 0.1, y + 0.556, 0.0);
    }
    for (let i = 0; i < 4; i++) this.add(rbox(0.26, 0.014, 0.006, 0.002), c.vest2, p, 0, y + 0.24 + i * 0.05, 0.139, null, null, [-0.04, 0, 0]);
    // front: three rifle magazine pouches, admin pouch with patches, radio with antenna, tourniquet
    for (let i = -1; i <= 1; i++) {
      this.add(rbox(0.076, 0.115, 0.04, 0.01), c.vest2, p, i * 0.084, y + 0.255, -0.172, null, null, [0.05, 0, 0]);
      this.add(rbox(0.06, 0.05, 0.022, 0.004), 0x232427, p, i * 0.084, y + 0.325, -0.174, null, null, [0.05, 0, 0]);
      this.add(rbox(0.012, 0.09, 0.046, 0.003), c.dark, p, i * 0.084, y + 0.29, -0.173);
    }
    this.add(rbox(0.16, 0.075, 0.03, 0.01), c.vest2, p, 0, y + 0.43, -0.168, null, null, [0.05, 0, 0]);
    this.add(rbox(0.06, 0.035, 0.004, 0.001), c.patch || 0x3d5a3a, p, 0.04, y + 0.432, -0.1845);
    this.add(rbox(0.045, 0.012, 0.004, 0.001), 0xc8c0a8, p, -0.04, y + 0.44, -0.1845);
    this.add(rbox(0.05, 0.12, 0.04, 0.008), c.dark, p, -0.15, y + 0.39, -0.1); this.add(cylg(0.004, 0.11, 6), c.dark, p, -0.16, y + 0.5, -0.1);
    this.add(rbox(0.03, 0.04, 0.02, 0.005), c.dark, p, 0.11, y + 0.47, -0.162);
    this.add(cylg(0.016, 0.1, 8), c.dark, p, 0.137, y + 0.36, -0.135, null, null, [0, 0, 0.2]); this.add(cylg(0.0165, 0.015, 8), 0xb02020, p, 0.147, y + 0.405, -0.135, null, null, [0, 0, 0.2]);
    // assault pack with lid, front pocket, compression straps and grab handle
    const pk = c.pack || c.vest2;
    this.add(rbox(0.27, 0.36, 0.13, 0.045), pk, p, 0, y + 0.31, 0.205, f, null, null, 'pack');
    this.add(rbox(0.21, 0.2, 0.05, 0.02), pk, p, 0, y + 0.25, 0.285, f, null, null, 'pack');
    this.add(rbox(0.25, 0.05, 0.12, 0.02), c.vest, p, 0, y + 0.485, 0.2, f, null, null, 'pack');
    for (const sx of [-1, 1]) { this.add(rbox(0.012, 0.3, 0.02, 0.003), c.dark, p, sx * 0.137, y + 0.3, 0.2); this.add(rbox(0.02, 0.012, 0.14, 0.003), c.dark, p, sx * 0.13, y + 0.2, 0.21); this.add(rbox(0.02, 0.012, 0.14, 0.003), c.dark, p, sx * 0.13, y + 0.4, 0.21); }
    this.add(rbox(0.06, 0.016, 0.02, 0.005), c.dark, p, 0, y + 0.52, 0.17);
    for (let i = 0; i < 3; i++) this.add(rbox(0.19, 0.012, 0.006, 0.002), c.dark, p, 0, y + 0.19 + i * 0.05, 0.311);
    this.rk = null;
  }
  head(p, cy, f) {
    const c = this.c; f = f && 'head';
    // smooth featureless head, ears, cropped hair
    this.add(GC('face', faceGeo), c.skin, p, 0, cy, 0, f);
    this.guts('head', p, cy);
    for (const sx of [-1, 1]) this.add(sph(0.02), c.skin, p, sx * 0.0775, cy - 0.016, 0.008, null, [0.34, 1, 0.66], [0, sx * -0.25, 0]);
  }
  upperArm(p, top, L, side) {
    const c = this.c, f = side && 'sh' + side, sx = side === 'L' ? -1 : side === 'R' ? 1 : 0;
    this.guts('upperArm', p, top, L);
    this.add(sph(0.066), c.shirt, p, 0, top - 0.015, 0, f, [1, 0.92, 1]);
    this.add(limbG(L - 0.02, 0.054, 0.05, 0.042), c.shirt, p, 0, top - 0.01, 0, f);
    // sleeve pocket with patch
    this.add(rbox(0.016, 0.085, 0.07, 0.006), c.vest2, p, sx * 0.05, top - 0.1, 0);
    this.add(rbox(0.006, 0.04, 0.05, 0.002), sx > 0 ? 0x6a2a2a : 0x2f3f5a, p, sx * 0.059, top - 0.095, 0);
    this.add(rbox(0.018, 0.016, 0.072, 0.004), c.pants, p, sx * 0.05, top - 0.062, 0);
  }
  forearm(p, top, L, side) {
    const c = this.c, f = side && 'el' + side, sx = side === 'L' ? -1 : 1;
    this.guts('forearm', p, top, L);
    this.add(limbG(L - 0.07, 0.045, 0.043, 0.033), c.shirt, p, 0, top, 0, f);
    // elbow pad with strap
    this.add(rbox(0.082, 0.085, 0.036, 0.016), c.pad, p, 0, top - 0.005, 0.04); this.add(cylg(0.049, 0.018, 12), c.dark, p, 0, top - 0.03, 0.0);
    // glove: cuff, back of the hand with knuckle guard, four curled fingers, thumb
    this.add(cylg(0.036, 0.04, 10, 0.034), c.glove, p, 0, top - L + 0.045, 0, f);
    this.add(rbox(0.074, 0.075, 0.03, 0.013), c.glove, p, 0, top - L - 0.002, 0, f);
    this.add(rbox(0.066, 0.02, 0.012, 0.005), c.dark, p, 0, top - L - 0.03, 0.014);
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.0175;
      this.add(capg(0.0085, 0.028), c.glove, p, fx, top - L - 0.055, -0.006, null, null, [0.45, 0, 0]);
      this.add(capg(0.0078, 0.022), c.glove, p, fx, top - L - 0.078, -0.027, null, null, [1.25, 0, 0]);
    }
    this.add(capg(0.01, 0.03), c.glove, p, -sx * 0.036, top - L - 0.012, -0.018, f, null, [0.7, 0, -sx * 0.5]);
    if (side === 'L') { this.add(rbox(0.05, 0.022, 0.05, 0.008), c.dark, p, 0, top - L + 0.078, 0.0); this.add(cylg(0.019, 0.008, 10), 0x1b2a22, p, 0, top - L + 0.078, 0.03, null, null, [Math.PI / 2, 0, 0]); }
  }
  thigh(p, top, L, side) {
    const c = this.c, f = side && 'lg' + side, sx = side === 'L' ? -1 : 1;
    this.guts('thigh', p, top, L);
    this.add(limbG(L, 0.086, 0.078, 0.058), c.pants, p, 0, top, 0, f);
    // cargo pocket with flap
    this.add(rbox(0.04, 0.13, 0.11, 0.012), c.pants, p, sx * 0.072, top - L / 2 - 0.01, 0, f);
    this.add(rbox(0.043, 0.035, 0.115, 0.008), c.vest2, p, sx * 0.073, top - L / 2 + 0.045, 0);
    this.add(rbox(0.012, 0.012, 0.012, 0.003), c.dark, p, sx * 0.095, top - L / 2 + 0.036, 0);
    if (side === 'R') this.add(cylg(0.089, 0.02, 12, 0.087), c.dark, p, 0, top - 0.11, 0);
  }
  shin(p, top, L, side) {
    const c = this.c, f = side && 'kn' + side;
    this.guts('shin', p, top, L);
    // knee pad: hard cap on a soft pad, two straps
    this.add(rbox(0.115, 0.13, 0.05, 0.022), c.pad, p, 0, top - 0.03, -0.058);
    this.add(sph(0.05), c.dark, p, 0, top - 0.02, -0.07, null, [0.95, 1.1, 0.55]);
    this.add(cylg(0.066, 0.016, 12), c.dark, p, 0, top + 0.012, 0.0); this.add(cylg(0.063, 0.016, 12), c.dark, p, 0, top - 0.075, 0.004);
    this.add(limbG(L - 0.08, 0.056, 0.06, 0.04), c.pants, p, 0, top, 0.004, f);
    this.add(cylg(0.052, 0.03, 10, 0.05), c.pants, p, 0, top - L + 0.135, 0.004);
    // boot: shaft, foot, toe cap, laces, heel and treaded sole
    this.add(cylg(0.05, 0.1, 10, 0.055), c.boots, p, 0, top - L + 0.075, 0.006, f);
    this.add(rbox(0.105, 0.085, 0.24, 0.036), c.boots, p, 0, top - L + 0.018, -0.04, f);
    this.add(sph(0.053), c.boots, p, 0, top - L + 0.012, -0.13, null, [0.98, 0.72, 1.0]);
    for (let i = 0; i < 4; i++) this.add(rbox(0.05, 0.006, 0.008, 0.002), c.dark, p, 0, top - L + 0.062 - i * 0.012, -0.05 - i * 0.022, null, null, [0.6, 0, 0]);
    this.add(rbox(0.112, 0.02, 0.27, 0.008), c.sole, p, 0, top - L - 0.03, -0.047, f);
    this.add(rbox(0.108, 0.018, 0.08, 0.006), c.sole, p, 0, top - L - 0.043, 0.045);
    for (let i = 0; i < 4; i++) this.add(rbox(0.108, 0.01, 0.022, 0.003), c.sole, p, 0, top - L - 0.043, -0.03 - i * 0.04);
  }
}

