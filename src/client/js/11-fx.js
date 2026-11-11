// ---------------------------------------------------------------- decal textures
function irregular(g, cx, cy, r, n, jit, fill) {
  g.fillStyle = fill; g.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = r * (1 - jit + Math.random() * jit * 2); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill();
}
function decalCanvas(draw) { const t = canvasTex(draw, 128, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }
const DECAL_TEX = {
  concrete: decalCanvas((g, s) => {
    const c = s / 2;
    const gr = g.createRadialGradient(c, c, s * 0.15, c, c, s * 0.48); gr.addColorStop(0, 'rgba(60,58,54,0.5)'); gr.addColorStop(1, 'rgba(60,58,54,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * 0.3, 16, 0.35, 'rgba(178,172,160,0.95)');
    irregular(g, c, c, s * 0.2, 14, 0.3, 'rgba(118,113,105,1)');
    g.strokeStyle = 'rgba(30,28,25,0.8)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; let x = c, y = c; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += Math.cos(a + rnd(-0.5, 0.5)) * s * 0.09; y += Math.sin(a + rnd(-0.5, 0.5)) * s * 0.09; g.lineTo(x, y); } g.stroke(); }
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.12); h.addColorStop(0, '#000'); h.addColorStop(0.7, 'rgba(15,14,12,0.95)'); h.addColorStop(1, 'rgba(40,38,34,0)');
    g.fillStyle = h; g.beginPath(); g.arc(c, c, s * 0.12, 0, 7); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(200,195,185,' + rnd(0.3, 0.8) + ')'; const a = Math.random() * 6.28, d = rnd(0.2, 0.42) * s; g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, 2); }
  }),
  metal: decalCanvas((g, s) => {
    const c = s / 2;
    const sc = g.createRadialGradient(c, c, s * 0.12, c, c, s * 0.45); sc.addColorStop(0, 'rgba(50,35,20,0.7)'); sc.addColorStop(1, 'rgba(50,35,20,0)');
    g.fillStyle = sc; g.fillRect(0, 0, s, s);
    const ring = g.createRadialGradient(c, c, s * 0.08, c, c, s * 0.2); ring.addColorStop(0, 'rgba(235,235,230,1)'); ring.addColorStop(0.6, 'rgba(170,170,165,0.9)'); ring.addColorStop(1, 'rgba(120,120,115,0)');
    g.fillStyle = ring; g.beginPath(); g.arc(c, c, s * 0.2, 0, 7); g.fill();
    g.fillStyle = '#030303'; g.beginPath(); g.arc(c, c, s * 0.085, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(c, c, s * 0.1, 0, 7); g.stroke();
  }),
  wood: decalCanvas((g, s) => {
    const c = s / 2;
    irregular(g, c, c, s * 0.32, 18, 0.45, 'rgba(196,160,110,0.9)');
    g.strokeStyle = 'rgba(230,200,150,0.9)'; g.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const x = c + rnd(-0.25, 0.25) * s; g.beginPath(); g.moveTo(x, c + rnd(-0.1, 0.1) * s); g.lineTo(x + rnd(-3, 3), c + rnd(0.15, 0.4) * s * (Math.random() < 0.5 ? -1 : 1)); g.stroke(); }
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.13); h.addColorStop(0, '#000'); h.addColorStop(0.7, 'rgba(25,15,5,0.95)'); h.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = h; g.beginPath(); g.arc(c, c, s * 0.13, 0, 7); g.fill();
  }),
  dirt: decalCanvas((g, s) => {
    const c = s / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, s * 0.45); gr.addColorStop(0, 'rgba(10,8,5,1)'); gr.addColorStop(0.3, 'rgba(40,32,22,0.9)'); gr.addColorStop(1, 'rgba(70,60,45,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 50; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '30,24,16' : '120,105,85') + ',' + rnd(0.4, 0.9) + ')'; const a = Math.random() * 6.28, d = rnd(0.15, 0.45) * s; g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, rnd(1, 3), rnd(1, 3)); }
  }),
  blood: decalCanvas((g, s) => {
    const c = s / 2;
    irregular(g, c, c, s * 0.22, 20, 0.4, 'rgba(90,0,0,0.92)');
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = rnd(0.18, 0.45) * s, r = rnd(1.5, 6); g.fillStyle = 'rgba(' + Math.floor(rnd(70, 110)) + ',0,0,0.9)'; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(80,0,0,0.85)'; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; g.lineWidth = rnd(2, 4); g.beginPath(); g.moveTo(c + Math.cos(a) * s * 0.15, c + Math.sin(a) * s * 0.15); g.lineTo(c + Math.cos(a) * s * 0.4, c + Math.sin(a) * s * 0.4); g.stroke(); }
  })
};
const glowTex = decalCanvas((g, s) => { const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, s * 0.3); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#ccc'); gr.addColorStop(1, '#000'); g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
glowTex.colorSpace = THREE.NoColorSpace;
const DECAL_MAT = {};
for (const k in DECAL_TEX) DECAL_MAT[k] = new THREE.MeshStandardMaterial({ map: DECAL_TEX[k], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: k === 'metal' ? 0.35 : (k === 'blood' ? 0.25 : 0.95), metalness: k === 'metal' ? 0.6 : 0 });
const DECAL_SIZE = { concrete: 0.095, metal: 0.055, wood: 0.08, dirt: 0.12 };
const poolGeo = new THREE.CircleGeometry(0.55, 24);
const bloodPoolMat = new THREE.MeshStandardMaterial({ map: DECAL_TEX.blood, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.15, metalness: 0 });
const splatGeo = new THREE.PlaneGeometry(1, 1);
const decals = [], heats = [];
const decalHelper = new THREE.Object3D();
function placeDecal(mesh, point, normal, size, material) {
  decalHelper.position.copy(point); decalHelper.lookAt(_a.copy(point).add(normal)); decalHelper.rotateZ(Math.random() * Math.PI * 2);
  let geo;
  try { geo = new DecalGeometry(mesh, point, decalHelper.rotation, new V3(size, size, Math.max(0.03, size * 0.6))); } catch (e) { return null; }
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; scene.add(m); decals.push(m);
  trimDecals();
  return m;
}
function bulletHole(hit, normal, w) {
  const surf = hit.object.userData.surf || 'concrete', ud = hit.object.userData, pierce = ud.box && PEN_MAT[KIND_PEN[ud.kind]];
  const cal = CAL[w] || CAL[0], kind = KIND_PEN[ud.kind];
  const base = pierce ? (PIERCE_MAT[surf] || PIERCE_MAT.concrete) : DECAL_MAT[surf];
  const size = pierce ? Math.max(0.04, cal[0] * (kind === 'concrete' ? 3.4 : kind === 'metal' ? 1.3 : 2.2) * 7.5) * rnd(0.9, 1.15) : DECAL_SIZE[surf] * rnd(0.85, 1.2);
  const hm = base.clone();
  hm.emissive = new THREE.Color(0xffb050); hm.emissiveMap = glowTex; hm.emissiveIntensity = surf === 'metal' ? 6 : 4;
  const d = placeDecal(hit.object, hit.point, normal, size, hm);
  if (d) heats.push({ d, m: hm, base, t: 0, dur: surf === 'metal' ? 2.4 : 1.3, i0: hm.emissiveIntensity });
  impactFx(hit.point, normal, surf);
}
const _hc1 = new THREE.Color(0xffc060), _hc2 = new THREE.Color(0xff2000), _hc3 = new THREE.Color(0x600000);
function updateHeats(dt) {
  for (let i = heats.length - 1; i >= 0; i--) {
    const h = heats[i]; h.t += dt; const k = h.t / h.dur;
    if (k >= 1 || !h.d.parent) { if (h.d.parent) h.d.material = h.base; h.m.dispose(); heats.splice(i, 1); continue; }
    h.m.emissiveIntensity = h.i0 * Math.pow(1 - k, 2.2);
    if (k < 0.3) h.m.emissive.copy(_hc1).lerp(_hc2, k / 0.3); else h.m.emissive.copy(_hc2).lerp(_hc3, (k - 0.3) / 0.7);
  }
}

// ---------------------------------------------------------------- particles / fx
const fx = [];
const fxBox = new THREE.BoxGeometry(1, 1, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const PMAT = {
  spark: new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }),
  chip: new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 1 }),
  splinter: new THREE.MeshStandardMaterial({ color: 0xa0784a, roughness: 1 }),
  clod: new THREE.MeshStandardMaterial({ color: 0x4a3f30, roughness: 1 }),
  blood: new THREE.MeshStandardMaterial({ color: 0x6a0000, roughness: 0.3 })
};
const puffTex = canvasTex((g, s) => { const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 64, false);
function tracer(a, b) {
  const len = a.distanceTo(b); if (len < 0.5) return;
  const m = new THREE.Mesh(fxBox, tracerMat.clone());
  m.scale.set(0.012, 0.012, len); m.position.addVectors(a, b).multiplyScalar(0.5); m.lookAt(b);
  scene.add(m); fx.push({ o: m, life: 0.06, max: 0.06, fade: 0.85, dispose: true });
}
function particles(p, n, m, speed, size, life, up, dirBias, stretch) {
  for (let i = 0; i < n; i++) {
    const o = new THREE.Mesh(fxBox, m); o.scale.set(size, size, size * (stretch || 1)); o.position.copy(p);
    o.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); o.castShadow = false; scene.add(o);
    const v = new V3(Math.random() - 0.5, Math.random() * 0.5 + (up || 0), Math.random() - 0.5).normalize();
    if (dirBias) v.addScaledVector(dirBias, 1.2).normalize();
    v.multiplyScalar(speed * (0.4 + Math.random()));
    fx.push({ o, life: life * rnd(0.6, 1.2), max: life, v, grav: true, spin: m !== PMAT.spark, align: m === PMAT.spark });
  }
}
function puff(p, color, size, life, rise, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: opacity || 0.6 }));
  s.position.copy(p); s.scale.setScalar(size * 0.4); scene.add(s);
  fx.push({ o: s, life, max: life, fade: opacity || 0.6, grow: size, rise: rise || 0.3, dispose: true, sprite: true });
}
function impactFx(point, n, surf) {
  const p = point.clone().addScaledVector(n, 0.02);
  if (surf === 'metal') {
    particles(p, 14, PMAT.spark, 5, 0.006, 0.25, 0.3, n, 6);
    puff(p, 0x777777, 0.25, 0.5, 0.2, 0.35);
    noiseHit(3500, 0.08, 0.05);
  } else if (surf === 'wood') {
    particles(p, 7, PMAT.splinter, 2.5, 0.01, 0.6, 0.4, n, 4);
    puff(p, 0x8a6a45, 0.35, 0.7, 0.2, 0.5);
    noiseHit(900, 0.06, 0.05);
  } else if (surf === 'dirt') {
    particles(p, 8, PMAT.clod, 2.2, 0.018, 0.6, 1.2, n);
    puff(p, 0x6a5a45, 0.6, 1.0, 0.4, 0.65);
    noiseHit(500, 0.07, 0.04);
  } else {
    particles(p, 7, PMAT.chip, 2.6, 0.014, 0.6, 0.5, n);
    particles(p, 3, PMAT.spark, 3.5, 0.005, 0.12, 0.3, n, 5);
    puff(p, 0xb8b2a6, 0.5, 0.9, 0.3, 0.6);
    noiseHit(1400, 0.06, 0.05);
  }
}
