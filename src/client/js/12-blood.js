// ---------------------------------------------------------------- blood: ballistic droplets, splats that run down walls, pooling on floors, wounds on bodies
const BLOOD_MAX = 900, drops = [], drips = [], floorSplats = [];
const dropIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5c0207, roughness: 0.08, metalness: 0.1 }), BLOOD_MAX);
dropIM.frustumCulled = false; dropIM.count = 0; scene.add(dropIM);
const wetMat = (tex, off) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: off, roughness: 0.14, metalness: 0 });
// Blood textures are built as metaball fields: soft blobs are added together, then the field is cut at a threshold.
// That gives the smooth, surface-tension edges real blood has, and the field height doubles as depth (thicker = darker).
function fieldTex(size, draw, opt) {
  opt = opt || {};
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size); g.globalCompositeOperation = 'lighter';
  const blob = (x, y, r, w) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); const a = Math.min(1, w === undefined ? 1 : w); gr.addColorStop(0, 'rgba(255,0,0,' + a + ')'); gr.addColorStop(0.45, 'rgba(255,0,0,' + a * 0.62 + ')'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  // a run of blobs from (x0,y0) to (x1,y1) with the radius going r0 -> r1: tails, spines, drips
  const run = (x0, y0, x1, y1, r0, r1, n) => { n = n || 8; for (let i = 0; i <= n; i++) { const t = i / n; blob(lerp(x0, x1, t), lerp(y0, y1, t), lerp(r0, r1, t)); } };
  draw({ blob, run, s: size, c: size / 2 });
  const im = g.getImageData(0, 0, size, size), d = im.data, th = opt.th || 0.36, soft = opt.soft || 0.06;
  const C0 = opt.c0 || [150, 10, 12], C1 = opt.c1 || [58, 0, 3];
  for (let i = 0; i < d.length; i += 4) {
    const f = d[i] / 255, k = smooth(clamp((f - th) / soft, 0, 1)), depth = Math.pow(clamp((f - th) / (1 - th), 0, 1), 0.55);
    const n = (Math.random() - 0.5) * 10;
    d[i] = clamp(lerp(C0[0], C1[0], depth) + n, 0, 255); d[i + 1] = clamp(lerp(C0[1], C1[1], depth) + n * 0.2, 0, 255); d[i + 2] = clamp(lerp(C0[2], C1[2], depth) + n * 0.2, 0, 255);
    d[i + 3] = 255 * k * (opt.alpha || (0.86 + 0.14 * depth));
  }
  g.globalCompositeOperation = 'source-over'; g.putImageData(im, 0, 0);
  if (opt.post) opt.post(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true;
  return t;
}
const BLOOD_TEX = {
  // a drop or stream landing from above: body, crown of spines, satellite droplets close in
  splat: fieldTex(512, ({ blob, run, s, c }) => {
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, d = rnd(0, 0.07) * s; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, s * rnd(0.13, 0.2)); }
    const n = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.28 + rnd(-0.3, 0.3), L = rnd(0.2, 0.3) * s, w = rnd(0.03, 0.05) * s;
      run(c + Math.cos(a) * s * 0.14, c + Math.sin(a) * s * 0.14, c + Math.cos(a) * L, c + Math.sin(a) * L, w * 1.6, w * 0.8, 7);
      if (Math.random() < 0.7) blob(c + Math.cos(a) * (L + w * 1.8), c + Math.sin(a) * (L + w * 1.8), w * rnd(0.9, 1.3));
    }
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, d = rnd(0.32, 0.42) * s; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, s * rnd(0.012, 0.024)); }
  }),
  // hitting a wall at an angle: a teardrop with its tail along the direction of travel (texture "up")
  cast: fieldTex(512, ({ blob, run, s, c }) => {
    run(c, s * 0.7, c, s * 0.42, s * 0.16, s * 0.1, 10);
    for (let i = 0; i < 4; i++) { const x = c + rnd(-0.14, 0.14) * s; run(x, s * 0.62, x + rnd(-0.03, 0.03) * s, s * rnd(0.12, 0.3), s * 0.05, s * 0.015, 10); blob(x, s * rnd(0.08, 0.14), s * 0.018); }
    for (let i = 0; i < 10; i++) blob(c + rnd(-0.3, 0.3) * s, s * rnd(0.05, 0.4), s * rnd(0.01, 0.025));
  }, { th: 0.34 }),
  // exit spray: a fan of droplets thrown along the direction of travel (texture "up"), heaviest near where it started
  spray: fieldTex(512, ({ blob, run, s, c }) => {
    const oy = s * 0.9;
    run(c, oy, c, oy - s * 0.2, s * 0.085, s * 0.06, 10);
    for (let i = 0; i < 26; i++) {
      const a = rnd(-0.42, 0.42), L = s * rnd(0.25, 0.78) * (1 - Math.abs(a) * 0.8), w = s * rnd(0.018, 0.034);
      const x1 = c + Math.sin(a) * L, y1 = oy - Math.cos(a) * L;
      run(c + Math.sin(a) * s * 0.06, oy - Math.cos(a) * s * 0.06, x1, y1, w * 1.5, w * 0.45, 14);
      blob(x1 + Math.sin(a) * w * 1.2, y1 - Math.cos(a) * w * 1.6, w * rnd(0.9, 1.4));
    }
    for (let i = 0; i < 14; i++) { const a = rnd(-0.35, 0.35), L = s * rnd(0.3, 0.8); run(c + Math.sin(a) * L, oy - Math.cos(a) * L, c + Math.sin(a) * (L + s * 0.03), oy - Math.cos(a) * (L + s * 0.06), s * 0.011, s * 0.006, 5); }
  }, { th: 0.36, c0: [130, 6, 10], c1: [52, 0, 3] }),
  // a head shot on the wall behind: a heavy irregular core, a ring of streaks and teardrops thrown outward
  spatter: fieldTex(512, ({ blob, run, s, c }) => {
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = rnd(0, 0.08) * s; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, s * rnd(0.07, 0.12)); }
    for (let i = 0; i < 34; i++) { const a = Math.random() * 6.28, L = s * rnd(0.16, 0.44), w = s * rnd(0.012, 0.028); run(c + Math.cos(a) * s * 0.06, c + Math.sin(a) * s * 0.06, c + Math.cos(a) * L, c + Math.sin(a) * L, w * 1.4, w * 0.4, 10); blob(c + Math.cos(a) * (L + w * 1.5), c + Math.sin(a) * (L + w * 1.5), w * rnd(0.9, 1.5)); }
    for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, L = s * rnd(0.2, 0.46), w = s * rnd(0.008, 0.014); run(c + Math.cos(a) * L, c + Math.sin(a) * L, c + Math.cos(a) * (L + w * 3), c + Math.sin(a) * (L + w * 3), w, w * 0.4, 4); }
  }, { th: 0.36, c0: [128, 6, 10], c1: [50, 0, 3] }),
  // a run down a wall: a thin trail ending in a heavy bead
  drip: fieldTex(256, ({ blob, run, s, c }) => { run(c, 0, c, s * 0.82, s * 0.07, s * 0.1, 16); blob(c, s * 0.86, s * 0.14); }, { th: 0.3 }),
  // a puddle on the floor: big lobes merged together
  pool: fieldTex(512, ({ blob, s, c }) => {
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, d = rnd(0, 0.2) * s; blob(c + Math.cos(a) * d, c + Math.sin(a) * d * 0.8, s * rnd(0.12, 0.22)); }
  }, { th: 0.42, c0: [120, 6, 8], c1: [45, 0, 2] }),
  // soaked into cloth: soft, uneven edge, wicking along the weave
  soak: fieldTex(256, ({ blob, run, s, c }) => {
    const top = s * 0.2;
    for (let i = 0; i < 7; i++) blob(c + rnd(-0.08, 0.08) * s, top + rnd(0.02, 0.16) * s, s * rnd(0.07, 0.12));
    for (let i = 0; i < 3; i++) { const x = c + rnd(-0.1, 0.1) * s, L = s * rnd(0.35, 0.72); run(x, top + s * 0.08, x + rnd(-0.03, 0.03) * s, L, s * 0.05, s * 0.024, 12); blob(x, L + s * 0.02, s * 0.035); }
  }, { th: 0.36, c0: [92, 4, 8], c1: [38, 0, 3] }),
  stain: fieldTex(256, ({ blob, s, c }) => {
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, d = rnd(0, 0.24) * s; blob(c + Math.cos(a) * d, c + Math.sin(a) * d + s * 0.06, s * rnd(0.08, 0.16), 0.7); }
  }, { th: 0.22, soft: 0.25, c0: [95, 6, 6], c1: [52, 0, 2], alpha: 0.85 }),
  // small entry wound: dark hole, abrasion ring, a little blood
  entry: fieldTex(256, ({ blob, s, c }) => { blob(c, c, s * 0.3); for (let i = 0; i < 6; i++) blob(c + rnd(-0.12, 0.12) * s, c + rnd(0, 0.2) * s, s * 0.12); }, { th: 0.3, c0: [140, 18, 16], c1: [70, 2, 3],
    post: (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.12); gr.addColorStop(0, 'rgba(10,0,0,1)'); gr.addColorStop(0.6, 'rgba(25,0,0,0.95)'); gr.addColorStop(1, 'rgba(60,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } }),
  // ring around a see-through hole: torn edge, transparent middle so the hole shows
  rim: fieldTex(256, ({ blob, s, c }) => { for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; blob(c + Math.cos(a) * s * 0.2, c + Math.sin(a) * s * 0.2, s * rnd(0.09, 0.15)); } for (let i = 0; i < 4; i++) blob(c + rnd(-0.1, 0.1) * s, c + rnd(0.15, 0.35) * s, s * 0.08); }, { th: 0.3, c0: [150, 16, 14], c1: [75, 2, 3],
    post: (g, s) => { g.globalCompositeOperation = 'destination-out'; const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.17); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.75, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'source-over'; } }),
  // exit: bigger, ragged and blown outward
  rimX: fieldTex(256, ({ blob, run, s, c }) => { for (let i = 0; i < 11; i++) { const a = i / 11 * 6.28 + rnd(-0.2, 0.2); run(c + Math.cos(a) * s * 0.18, c + Math.sin(a) * s * 0.18, c + Math.cos(a) * s * rnd(0.3, 0.42), c + Math.sin(a) * s * rnd(0.3, 0.42), s * 0.08, s * 0.03, 5); } }, { th: 0.3, c0: [160, 22, 18], c1: [80, 3, 4],
    post: (g, s) => { g.globalCompositeOperation = 'destination-out'; const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.15); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'source-over'; } }),
  exit: fieldTex(256, ({ blob, run, s, c }) => { blob(c, c, s * 0.26); for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28; run(c, c, c + Math.cos(a) * s * 0.36, c + Math.sin(a) * s * 0.36, s * 0.08, s * 0.025, 6); } }, { th: 0.3, c0: [150, 18, 16], c1: [60, 0, 2],
    post: (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.16); gr.addColorStop(0, 'rgba(12,0,0,1)'); gr.addColorStop(1, 'rgba(50,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } })
};
// pools: several shapes, wet and glossy, thin bright edges and a dark thick middle
const POOL_MAT = [0, 1, 2].map(() => { const m = wetMat(fieldTex(512, ({ blob, run, s, c }) => {
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, d = rnd(0, 0.19) * s; blob(c + Math.cos(a) * d, c + Math.sin(a) * d * 0.85, s * rnd(0.13, 0.21)); }
  for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, L = rnd(0.26, 0.33) * s; run(c + Math.cos(a) * s * 0.15, c + Math.sin(a) * s * 0.15, c + Math.cos(a) * L, c + Math.sin(a) * L, s * 0.13, s * 0.09, 6); }
}, { th: 0.42, soft: 0.04, c0: [120, 8, 12], c1: [36, 0, 3], alpha: 0.97 }), -3); m.roughness = 0.05; m.metalness = 0.15; return m; });
const BLOOD_MAT = {}; for (const k in BLOOD_TEX) BLOOD_MAT[k] = wetMat(BLOOD_TEX[k], k === 'stain' ? -3 : /entry|exit|rim/.test(k) ? -5 : -4);
BLOOD_MAT.soak.side = THREE.DoubleSide; BLOOD_MAT.soak.roughness = 0.5;
BLOOD_MAT.stain.roughness = 0.5; BLOOD_MAT.entry.roughness = BLOOD_MAT.exit.roughness = 0.3;
// ---------------------------------------------------------------- muzzle smoke and barrel heat
function smoke(p, vel, size, life, op, col) {
  const mt = new THREE.SpriteMaterial({ map: puffTex, color: col || 0xc4c1ba, transparent: true, depthWrite: false, opacity: op }); mt.rotation = Math.random() * 6.28;
  const s = new THREE.Sprite(mt); s.position.copy(p); s.scale.setScalar(size * 0.3); scene.add(s);
  fx.push({ o: s, life, max: life, fade: op, grow: size, rise: 0.1, dispose: true, sprite: true, sv: vel });
}
function muzzleSmoke(p, dir, wi, sup) {
  const big = wi === 2 ? 2.2 : isPistol(wi) ? 0.6 : isShotgun(wi) ? 1.6 : 1;
  for (let i = 0; i < 3; i++) smoke(p.clone().addScaledVector(dir, 0.02 + i * 0.03), dir.clone().multiplyScalar(rnd(0.6, 2.6) * big).add(new V3(rnd(-0.25, 0.25), rnd(0, 0.3), rnd(-0.25, 0.25))), (0.16 + i * 0.06) * big * (sup ? 0.7 : 1), rnd(0.7, 1.3), 0.22 * (sup ? 0.8 : 1));
  if (wi === 2) for (const s of [-1, 1]) smoke(p, new V3().crossVectors(dir, _Y).normalize().multiplyScalar(s * 3).addScaledVector(dir, 0.5), 0.5, 0.8, 0.25);
}
// ---------------------------------------------------------------- kill notification: skull and name, when you down or kill someone
const SKULL_SVG = '<svg viewBox="0 0 64 64" width="30" height="30"><path fill="#e9e6df" d="M32 4C17 4 7 14 7 28c0 8 4 14 9 17v8c0 3 2 5 5 5h3v-6h4v6h8v-6h4v6h3c3 0 5-2 5-5v-8c5-3 9-9 9-17C57 14 47 4 32 4z"/><circle cx="22" cy="29" r="7" fill="#111"/><circle cx="42" cy="29" r="7" fill="#111"/><path d="M32 36l-5 8h10z" fill="#111"/></svg>';
function killNotice(name) {
  const k = $('killn'); k.innerHTML = SKULL_SVG + '<span>' + esc(name) + '</span>';
  k.style.transition = 'none'; k.style.opacity = '1'; k.style.transform = 'translateX(-50%) scale(1.12)';
  requestAnimationFrame(() => requestAnimationFrame(() => { k.style.transition = 'transform .18s, opacity .5s 1.8s'; k.style.transform = 'translateX(-50%) scale(1)'; k.style.opacity = '0'; }));
  blip(880, 0.08, 0.05, 'sine'); setTimeout(() => blip(660, 0.12, 0.04, 'sine'), 70);
}
