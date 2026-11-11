// ---------------------------------------------------------------- weapons data
// vel m/s, drag per metre, disp = intrinsic dispersion (rad), zero = barrel tilt so the sight is zeroed (M4 100 m, G17 25 m)
// index is the network id. vel m/s, mass kg, drag per metre, disp = intrinsic dispersion (rad), sightH = sight height over bore (m)
const WEAPONS = [
  { id: 'm4', name: 'M4A1', kind: 'rifle', auto: true, rpm: 800, cap: 30, spare: 5, tac: 2.3, empty: 2.9, inspect: 2.1, recoil: 0.011, fovAds: 48, shell: '556', vel: 910, mass: 0.004, drag: 0.00095, disp: 0.00045, tracerEvery: 4, snd: 0, gap: 55 },
  { id: 'g17', name: 'Glock 17', kind: 'pistol', auto: false, rpm: 450, cap: 17, spare: 3, tac: 1.7, empty: 2.0, inspect: 1.7, recoil: 0.028, fovAds: 62, shell: '9mm', vel: 375, mass: 0.0075, drag: 0.0014, disp: 0.0012, tracerEvery: 0, snd: 1, gap: 95 },
  { id: 'm107', name: 'Barrett M107', kind: 'sniper', auto: false, rpm: 110, cap: 10, spare: 4, tac: 3.2, empty: 3.8, inspect: 2.4, recoil: 0.085, fovAds: 5.5, scope: true, shell: '50', vel: 853, mass: 0.0428, drag: 0.00032, disp: 0.00025, tracerEvery: 0, snd: 2, gap: 350 },
  { id: 'ak74', name: 'AK-74M', kind: 'rifle', auto: true, rpm: 650, cap: 30, spare: 5, tac: 2.5, empty: 3.1, inspect: 2.1, recoil: 0.013, fovAds: 55, shell: '545', vel: 900, mass: 0.0034, drag: 0.00105, disp: 0.0006, tracerEvery: 4, snd: 3, gap: 70 },
  { id: 'm9', name: 'Beretta M9', kind: 'pistol', auto: false, rpm: 450, cap: 15, spare: 3, tac: 1.8, empty: 2.1, inspect: 1.7, recoil: 0.03, fovAds: 62, shell: '9mm', vel: 381, mass: 0.008, drag: 0.0014, disp: 0.0013, tracerEvery: 0, snd: 1, gap: 95 },
  // Remington 870 with an 18.5 in cylinder-bore barrel and a +2 extension (6 in the tube). 2 3/4 in 00 buck: 9 pellets of 3.49 g at 404 m/s,
  // round balls shed speed fast (about 945 fps left at 50 yd). Pattern opens about 2.5 cm per metre. Spares are 8-shell carriers, loaded one shell at a time.
  { id: 'm870', name: 'M870', kind: 'shotgun', auto: false, rpm: 105, cap: 6, spare: 4, carrier: 8, tac: 0.62, empty: 0.62, inspect: 1.8, recoil: 0.075, fovAds: 58, shell: '12g', vel: 404, mass: 0.00349, drag: 0.0074, disp: 0.0005, pellets: 9, spread: 0.0125, zero: 25, tracerEvery: 0, snd: 4, gap: 450 }
];
const PRIMARIES = [0, 3, 2, 5], SECONDARIES = [1, 4], MEDKIT_W = 9;
const isPistol = w => WEAPONS[w] && WEAPONS[w].kind === 'pistol';
const isShotgun = w => WEAPONS[w] && WEAPONS[w].kind === 'shotgun';
const roundsPer = w => WEAPONS[w].carrier || WEAPONS[w].cap;
// pellet directions from a seed, so every client draws the same pattern for a shot
function seededRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pelletDirs(dir, wi, seed) {
  const w = WEAPONS[wi], R = seededRng(seed), right = new V3().crossVectors(dir, new V3(0, 1, 0)); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
  const up = new V3().crossVectors(right, dir).normalize(), out = [];
  // roughly normal spread: most pellets near the centre, a few fliers
  for (let i = 0; i < w.pellets; i++) { const a = R() * Math.PI * 2, r = w.spread * Math.min(1.6, Math.sqrt(-2 * Math.log(1 - R() * 0.999)) * 0.62); out.push(dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize()); }
  return out;
}
function freshGuns(lo) { const g = {}; for (const i of lo) { const w = WEAPONS[i]; g[i] = { mag: w.cap, chamber: 1, pouch: Array(w.spare).fill(w.carrier || w.cap) }; } return g; }

// ---------------------------------------------------------------- viewmodel
const vm = new THREE.Group(); vmCamera.add(vm);
const flashTex = makeTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,180,80,0.8)'); gr.addColorStop(1, 'rgba(255,100,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 128);
const flashMat = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function vbox(w, h, d, m, parent, x, y, z, rx, ry, rz) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(rx || 0, ry || 0, rz || 0); parent.add(b); return b; }
function vrbox(w, h, d, r, m, parent, x, y, z, rx, ry, rz) { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m); b.position.set(x, y, z); b.rotation.set(rx || 0, ry || 0, rz || 0); parent.add(b); return b; }
function vcyl(r, len, m, parent, x, y, z, seg, spin) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 16), m); c.rotation.set(Math.PI / 2, spin || 0, 0); c.position.set(x, y, z); parent.add(c); return c; }
function addFlash(parent) {
  const f = new THREE.Group();
  for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat); pl.rotation.z = i * 1.05; f.add(pl); }
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.22), flashMat); side.rotation.x = Math.PI / 2; side.position.z = -0.08; f.add(side);
  f.visible = false; parent.add(f); return f;
}
function rail(parent, z0, z1, y) {
  const len = z1 - z0;
  vbox(0.021, 0.006, len, GM.anod, parent, 0, y, (z0 + z1) / 2);
  const n = Math.floor(len / 0.01);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0225, 0.0035, 0.0052), GM.anod, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m.makeTranslation(0, y + 0.0047, z0 + 0.005 + i * 0.01); im.setMatrixAt(i, m); }
  parent.add(im);
}
const reticleTex = canvasTex((g, s) => {
  g.clearRect(0, 0, s, s); g.strokeStyle = '#ff2a1a'; g.fillStyle = '#ff2a1a'; g.shadowColor = '#ff2a1a'; g.shadowBlur = 6;
  g.lineWidth = s * 0.035; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.03, 0, Math.PI * 2); g.fill();
  const t = s * 0.08; g.lineWidth = s * 0.03;
  [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([x, y]) => { g.beginPath(); g.moveTo(s / 2 + x * s * 0.4, s / 2 + y * s * 0.4); g.lineTo(s / 2 + x * (s * 0.4 - t), s / 2 + y * (s * 0.4 - t)); g.stroke(); });
}, 256, false);
function roundRect(sh, x, y, w, h, r) {
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
}
const glassRear = new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0.03, depthWrite: false });
const glassFront = new THREE.MeshBasicMaterial({ color: 0x7fe0cc, transparent: true, opacity: 0.07, depthWrite: false });
const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
// Holographic sight in the shape of an XPS-style unit: hood tunnel, base with battery cap, rear buttons, cross-bolt mount
function buildHolo(parent, y, z) {
  const e = new THREE.Group(); e.position.set(0, y, z); parent.add(e);
  const A = GM.anodEO;
  vrbox(0.05, 0.021, 0.098, 0.004, A, e, 0, 0.0105, -0.004);
  vrbox(0.044, 0.006, 0.03, 0.002, A, e, 0, -0.001, 0.008);
  const outer = new THREE.Shape(); roundRect(outer, -0.0255, 0.017, 0.051, 0.05, 0.0095);
  const hole = new THREE.Path(); roundRect(hole, -0.0195, 0.0232, 0.039, 0.0372, 0.0035); outer.holes.push(hole);
  const hoodGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 8 });
  const hood = new THREE.Mesh(hoodGeo, A); hood.position.z = -0.047; e.add(hood);
  const brow = new THREE.Shape(); brow.moveTo(-0.0255, 0); brow.lineTo(0.0255, 0); brow.lineTo(0.0255, 0.004); brow.lineTo(-0.0255, 0.004); brow.closePath();
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.005, 0.022), A); visor.position.set(0, 0.0655, -0.056); visor.rotation.x = 0.32; e.add(visor);
  vbox(0.0045, 0.03, 0.018, A, e, 0.0235, 0.034, -0.055, 0.32); vbox(0.0045, 0.03, 0.018, A, e, -0.0235, 0.034, -0.055, 0.32);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.039, 0.0372), glassRear); gr.position.set(0, 0.0418, 0.0232); e.add(gr);
  const gf = new THREE.Mesh(new THREE.PlaneGeometry(0.039, 0.0372), glassFront); gf.position.set(0, 0.0418, -0.042); e.add(gf);
  const cap = vcyl(0.0085, 0.008, A, e, 0.028, 0.011, -0.03, 18); cap.rotation.set(0, 0, Math.PI / 2);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; vbox(0.009, 0.0012, 0.0012, A, e, 0.028, 0.011 + Math.sin(a) * 0.0086, -0.03 + Math.cos(a) * 0.0086); }
  vrbox(0.009, 0.007, 0.004, 0.002, rubber, e, 0.009, 0.011, 0.046); vrbox(0.009, 0.007, 0.004, 0.002, rubber, e, -0.002, 0.011, 0.046);
  vrbox(0.006, 0.006, 0.004, 0.002, rubber, e, -0.014, 0.011, 0.046);
  const nut = vcyl(0.0052, 0.006, GM.steel, e, -0.028, 0.002, 0.012, 6); nut.rotation.set(0, 0, Math.PI / 2);
  vbox(0.004, 0.012, 0.02, A, e, -0.027, 0.002, -0.025);
  const retMat = new THREE.MeshBasicMaterial({ map: reticleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.0095, 0.0095), retMat); ret.position.set(0, 0.0418, -0.012); ret.renderOrder = 5; e.add(ret);
  return { ret, sightY: y + 0.0418 };
}
// camouflage cloth for sleeves: layered organic blotches
const camoTex = canvasTex((g, s) => {
  g.fillStyle = '#8a8466'; g.fillRect(0, 0, s, s);
  const cols = ['#5d6143', '#a49a78', '#4a4433', '#6f7350', '#b8ad8c', '#3d4030'];
  for (let i = 0; i < 90; i++) {
    g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.85;
    const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 22;
    g.beginPath(); for (let k = 0; k < 9; k++) { const t = k / 9 * Math.PI * 2, rr = r * (0.55 + Math.random() * 0.7); g.lineTo(x + Math.cos(t) * rr * 1.5, y + Math.sin(t) * rr * 0.7); } g.closePath(); g.fill();
    for (const [ox, oy] of [[s, 0], [-s, 0], [0, s], [0, -s]]) { g.save(); g.translate(ox, oy); g.fill(); g.restore(); }
  }
  g.globalAlpha = 0.12; for (let i = 0; i < 5000; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.fillRect(Math.random() * s, Math.random() * s, 1, 1); }
  g.globalAlpha = 1;
}, 256);
camoTex.repeat.set(2, 1.2);
GM.sleeve = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.95, bumpMap: fineNoise, bumpScale: 1 });
GM.glove = new THREE.MeshStandardMaterial({ color: 0x2b2a25, roughness: 0.88, bumpMap: fineNoise, bumpScale: 0.9 });
