// ---------------------------------------------------------------- textures / materials
function canvasTex(draw, size, repeat) {
  size = size || 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const makeTex = canvasTex;
function speckle(g, s, base, amt, n) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amt;
    g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')';
    const r = Math.random() * 2.2 + 0.4; g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}
const TEX = {
  concrete: makeTex((g, s) => { speckle(g, s, '#8e8b85', 0.22, 7000); for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.05 + ')'; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 40 + 10, 0, 7); g.fill(); } }),
  ground: makeTex((g, s) => { speckle(g, s, '#6c675c', 0.3, 12000); for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(40,35,25,' + Math.random() * 0.12 + ')'; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 30 + 5, 0, 7); g.fill(); } }),
  grid: makeTex((g, s) => { speckle(g, s, '#596068', 0.12, 3000); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4; g.strokeRect(0, 0, s, s); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); } }),
  crate: makeTex((g, s) => { speckle(g, s, '#7a5a36', 0.18, 3000); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(0, i * s / 6, s, 3); g.strokeStyle = '#4d3820'; g.lineWidth = 14; g.strokeRect(7, 7, s - 14, s - 14); g.beginPath(); g.moveTo(10, 10); g.lineTo(s - 10, s - 10); g.stroke(); }),
  metal: makeTex((g, s) => { speckle(g, s, '#9a9a9a', 0.12, 2500); for (let i = 0; i < s; i += 16) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(i, 0, 5, s); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(i + 7, 0, 3, s); } })
};
const SURF = { concrete: 'concrete', ground: 'dirt', grid: 'concrete', crate: 'wood', metal: 'metal', plywood: 'wood', drywall: 'concrete' };
const matCache = {};
function mat(color, rough, metal) {
  rough = rough === undefined ? 0.85 : rough; metal = metal || 0;
  const k = color + '_' + rough + '_' + metal;
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// gun surface detail maps
const fineNoise = canvasTex((g, s) => { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); for (let i = 0; i < 9000; i++) { const v = Math.floor(Math.random() * 255); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(Math.random() * s, Math.random() * s, 1, 1); } }, 128);
fineNoise.colorSpace = THREE.NoColorSpace; fineNoise.repeat.set(4, 4);
const stipple = canvasTex((g, s) => { g.fillStyle = '#707070'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 4) for (let x = (y / 4 % 2) * 2; x < s; x += 4) { g.fillStyle = '#c8c8c8'; g.fillRect(x, y, 2, 2); } }, 128);
stipple.colorSpace = THREE.NoColorSpace; stipple.repeat.set(3, 3);
const GM = {
  anod: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.6, bumpMap: fineNoise, bumpScale: 0.4 }),
  anodEO: new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.62, metalness: 0.4, bumpMap: fineNoise, bumpScale: 0.5 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.78, metalness: 0.05, bumpMap: stipple, bumpScale: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.3, metalness: 0.92 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x34342d, roughness: 0.92, bumpMap: fineNoise, bumpScale: 0.8 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4b5240, roughness: 0.96, bumpMap: fineNoise, bumpScale: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fc0ff, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false }),
  white: new THREE.MeshBasicMaterial({ color: 0xe8ffe0, toneMapped: false })
};

// ---------------------------------------------------------------- world
let worldGroup = new THREE.Group(); scene.add(worldGroup);
const colliders = [], worldMeshes = [];
let spawns = [new V3()];

function clearWorld() {
  worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
  scene.remove(worldGroup); worldGroup = new THREE.Group(); scene.add(worldGroup);
  colliders.length = 0; worldMeshes.length = 0;
}
function addBox(x, y, z, w, h, d, kind, color) {
  const t = TEX[kind === 'plywood' ? 'crate' : kind === 'drywall' ? 'concrete' : kind].clone(); t.needsUpdate = true; t.repeat.set(Math.max(w, d) / 2.5, Math.max(h, 0.5) / 2.5);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
    map: t, color: color || 0xffffff, roughness: kind === 'metal' ? 0.55 : 0.92, metalness: kind === 'metal' ? 0.35 : 0
  }));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  m.userData.surf = SURF[kind];
  worldGroup.add(m); worldMeshes.push(m);
  colliders.push({ min: new V3(x - w / 2, y, z - d / 2), max: new V3(x + w / 2, y + h, z + d / 2) });
  m.userData.box = colliders[colliders.length - 1]; m.userData.box.mesh = m; m.userData.kind = kind;
}
function addGround(size, kind) {
  const t = TEX[kind].clone(); t.needsUpdate = true; t.repeat.set(size / 4, size / 4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.userData.surf = SURF[kind];
  worldGroup.add(m); worldMeshes.push(m);
}
function building(cx, cz, doors) {
  const s = 10, t = 0.4, h = 3.5, hs = s / 2, gap = 1.6, col = 0xb5ab9a, seg = (s - gap) / 2;
  const wallX = (z, door) => {
    if (!door) return addBox(cx, 0, z, s + t, h, t, 'concrete', col);
    addBox(cx - gap / 2 - seg / 2, 0, z, seg, h, t, 'concrete', col);
    addBox(cx + gap / 2 + seg / 2, 0, z, seg, h, t, 'concrete', col);
    addBox(cx, 2.3, z, gap, h - 2.3, t, 'concrete', col);
  };
  const wallZ = (x, door) => {
    if (!door) return addBox(x, 0, cz, t, h, s, 'concrete', col);
    addBox(x, 0, cz - gap / 2 - seg / 2, t, h, seg, 'concrete', col);
    addBox(x, 0, cz + gap / 2 + seg / 2, t, h, seg, 'concrete', col);
    addBox(x, 2.3, cz, t, h - 2.3, gap, 'concrete', col);
  };
  wallX(cz - hs, doors.includes('n')); wallX(cz + hs, doors.includes('s'));
  wallZ(cx - hs, doors.includes('w')); wallZ(cx + hs, doors.includes('e'));
  addBox(cx, h, cz, s + t, 0.25, s + t, 'concrete', 0x8c8476);
  addBox(cx + 2.4, 0, cz + 2.4, 1.2, 1.2, 1.2, 'crate');
  addBox(cx - 2.6, 0, cz - 1.5, 0.5, 1.0, 3, 'concrete', 0x9a9285);
  addBox(cx + 0.8, 0, cz + 1.2, 3.2, 2.4, 0.12, 'drywall', 0xe2ddd3); addBox(cx - 1.2, 0, cz + 3, 0.018, 2.4, 2.4, 'plywood', 0xc89c66);
}
function buildArena() {
  clearWorld();
  addGround(180, 'ground');
  const H = 4, half = 36, wc = 0x9a958c;
  addBox(0, 0, -half, 73, H, 1, 'concrete', wc); addBox(0, 0, half, 73, H, 1, 'concrete', wc);
  addBox(-half, 0, 0, 1, H, 71, 'concrete', wc); addBox(half, 0, 0, 1, H, 71, 'concrete', wc);
  building(-16, -16, 'se'); building(16, 16, 'nw');
  addBox(-4, 0, -20, 6.1, 2.6, 2.44, 'metal', 0x2f5d7c);
  addBox(4, 0, 20, 6.1, 2.6, 2.44, 'metal', 0x8a3b2a);
  addBox(22, 0, -14, 2.44, 2.6, 6.1, 'metal', 0x56703a);
  addBox(-22, 0, 14, 2.44, 2.6, 6.1, 'metal', 0x7a6a2a);
  addBox(22, 2.6, -14, 2.44, 2.6, 6.1, 'metal', 0x2f5d7c);
  addBox(0, 0, 0, 8, 1.0, 0.5, 'concrete');
  addBox(-7, 0, 6, 0.5, 3, 5, 'concrete'); addBox(7, 0, -6, 0.5, 3, 5, 'concrete');
  addBox(-11, 0, -4, 4, 3, 0.5, 'concrete'); addBox(11, 0, 4, 4, 3, 0.5, 'concrete');
  const crates = [[-2, 26], [2, -26], [28, 4], [-28, -4], [12, -24], [-12, 24], [26, 26], [-26, -26], [31, -25], [-31, 25]];
  crates.forEach((c, i) => { addBox(c[0], 0, c[1], 1.2, 1.2, 1.2, 'crate'); if (i % 3 === 0) addBox(c[0] + 0.1, 1.2, c[1] - 0.1, 1.2, 1.2, 1.2, 'crate'); });
  spawns = [[-30, -30], [30, 30], [-30, 30], [30, -30], [0, -30], [0, 30], [-30, 0], [30, 0]].map(a => new V3(a[0], 0, a[1]));
}
function rangeSign(text, x, z) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#f2f2ea'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#c0392b'; g.fillRect(0, 0, 256, 14); g.fillRect(0, 114, 256, 14);
  g.fillStyle = '#111'; g.font = 'bold 64px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  m.position.set(x, 2.6, z); m.castShadow = true; worldGroup.add(m);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), mat(0x555555)); post.position.set(x, 1.05, z - 0.02); post.castShadow = true; worldGroup.add(post);
}
const RANGE_X = 34, RANGE_DISTS = [25, 50, 100, 200, 300, 400, 500, 750];
function buildTest() {
  clearWorld();
  addGround(1800, 'grid');
  for (const d of RANGE_DISTS) rangeSign(d + ' m', RANGE_X - 3.2, 8 - d);
  addBox(RANGE_X, 0, 9.5, 6, 0.9, 0.4, 'crate');
  addBox(-9, 0, 2, 0.5, 3, 4, 'concrete');
  addBox(9, 0, 2, 3, 1.0, 0.5, 'concrete');
  addBox(-5, 0, -4, 1.2, 1.2, 1.2, 'crate');
  addBox(-13, 0, 4, 2.44, 2.6, 2, 'metal', 0x2f5d7c);
  // penetration test walls in front of the dummies: plywood, a drywall partition, 30 cm of concrete
  addBox(-1.6, 0, -8, 2.4, 2.2, 0.018, 'plywood', 0xd2a874); addBox(1.6, 0, -8, 2.4, 2.2, 0.12, 'drywall', 0xe6e2da); addBox(4.8, 0, -8, 2.4, 2.2, 0.3, 'concrete', 0xa8a39a);
  spawns = [new V3(0, 0, 8)];
}

// ---------------------------------------------------------------- third-person guns
function tpBox(M, w, h, d, c, parent, x, y, z, rx, r, m) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c, r, m));
  b.position.set(x, y, z); if (rx) b.rotation.x = rx; b.castShadow = true; parent.add(b); return b;
}
function tpCyl(M, rad, len, c, parent, x, y, z, seg, r, m) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, seg || 10), M(c, r, m));
  b.rotation.x = Math.PI / 2; b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b;
}
function mark(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }

