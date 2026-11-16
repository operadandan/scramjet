// ---------------------------------------------------------------- explosives: M112 C4 (slot 3) and the M67 fragmentation grenade (slot 4)
// Charges are rated in kilograms of TNT. Blast effects scale with Hopkinson's scaled distance Z = d / W^(1/3) (m / kg^1/3):
// below about 0.5 a body comes apart, below about 1.1 the overpressure alone kills (lungs, brain), below about 2.2 it knocks a
// person down with internal injuries and burst eardrums, below about 4 it staggers and deafens.
//   M112 block: 0.57 kg of C4 (RE 1.34) = 0.76 kg TNT. No casing, so no fragments: it kills and breaches by blast.
//   M67: 180 g of Composition B (RE 1.35) = 0.24 kg TNT inside a 2.5 mm steel body that breaks into a few thousand fragments.
//   Fuze M213: the striker is held by the spoon; once the spoon flies the delay burns 4 to 5.5 s. Pulling the pin alone
//   does nothing as long as the spoon is held. Lethal radius about 5 m, casualties out to about 15 m.
const EXPL = { c4: { W: 0.76, frags: 0 }, frag: { W: 0.24, frags: 4000 } };
const NADE_R = 0.032, C4_REACH = 1.7;
const CHARGES = [], NADES = [], BOOM_FX = [];
let explSeq = 1;
// ---------------------------------------------------------------- models
const EXM = {
  od: new THREE.MeshStandardMaterial({ color: 0x4f5733, roughness: 0.62, metalness: 0.15 }),
  odDark: new THREE.MeshStandardMaterial({ color: 0x3a4026, roughness: 0.7, metalness: 0.1 }),
  fuze: new THREE.MeshStandardMaterial({ color: 0x5c5e58, roughness: 0.38, metalness: 0.85 }),
  spoon: new THREE.MeshStandardMaterial({ color: 0x4a4c40, roughness: 0.5, metalness: 0.7 }),
  ring: new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.3, metalness: 0.95 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xc9a82a, roughness: 0.6 }),
  mylar: new THREE.MeshStandardMaterial({ color: 0x5a6136, roughness: 0.48, metalness: 0.08 }),
  label: new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.8 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x1c1c18, roughness: 0.8 }),
  cap: new THREE.MeshStandardMaterial({ color: 0xc8c4b8, roughness: 0.25, metalness: 0.95 }),
  wire: new THREE.MeshStandardMaterial({ color: 0x2a2d1c, roughness: 0.7 }),
  red: new THREE.MeshStandardMaterial({ color: 0x9a1c14, roughness: 0.6 })
};
// the M67: a 63.5 mm steel ball, the M213 fuze on top, the spoon down one side, the pull ring and pin on the other
function makeFrag() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(NADE_R, 20, 14), EXM.od); body.scale.set(1, 1.04, 1); g.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(NADE_R * 0.985, 0.0012, 4, 28), EXM.yellow); band.rotation.x = Math.PI / 2; band.position.y = 0.012; g.add(band);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.012, 14), EXM.fuze); neck.position.y = NADE_R + 0.002; g.add(neck);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.016, 14), EXM.fuze); head.position.y = NADE_R + 0.015; g.add(head);
  const spoon = new THREE.Group(); spoon.position.set(0.006, NADE_R + 0.022, 0); g.add(spoon);
  vbox(0.022, 0.0025, 0.013, EXM.spoon, spoon, 0.008, 0, 0);
  vbox(0.0025, 0.062, 0.013, EXM.spoon, spoon, 0.019, -0.03, 0, 0, 0, 0.12);
  vbox(0.0025, 0.012, 0.01, EXM.spoon, spoon, 0.022, -0.065, 0, 0, 0, 0.5);
  const pin = new THREE.Group(); pin.position.set(-0.004, NADE_R + 0.018, 0); g.add(pin);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.03, 6), EXM.ring); bar.rotation.z = Math.PI / 2; pin.add(bar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0013, 6, 20), EXM.ring); ring.position.set(-0.022, -0.004, 0.004); ring.rotation.set(0.3, 0.9, 0); pin.add(ring);
  const clip = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0008, 4, 14, Math.PI), EXM.ring); clip.position.set(0.004, -0.004, 0.012); clip.rotation.y = Math.PI / 2; pin.add(clip);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, spoon, pin };
}
// the M112 block: 28 x 5 x 7.6 cm in olive mylar film, with an adhesive face; an M7-style cap and its leads in one end
function makeC4(cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.279, 0.051, 0.076, 2, 0.004), EXM.mylar); g.add(b);
  vbox(0.2, 0.052, 0.04, EXM.label, g, 0.01, 0, 0);
  for (let i = 0; i < 3; i++) vbox(0.15 - i * 0.04, 0.0525, 0.003, EXM.ink, g, -0.005, 0, -0.012 + i * 0.009);
  if (cap) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.05, 8), EXM.cap); c.rotation.z = Math.PI / 2; c.position.set(0.15, 0.008, 0.012); g.add(c);
    const rx = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.022, 0.03, 2, 0.003), EXM.odDark); rx.position.set(0.19, 0.012, 0.012); g.add(rx);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a10 })); led.position.set(0.19, 0.024, 0.012); g.add(led); g.userData.led = led;
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 4), EXM.wire); w.position.set(0.172, 0.01, 0.012 + s * 0.004); w.rotation.z = Math.PI / 2; g.add(w); }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// the M57 firing device ("clacker"): squeeze the handle three times hard and it fires
function makeClacker() {
  const g = new THREE.Group();
  vrbox(0.035, 0.1, 0.03, 0.006, EXM.od, g, 0, 0, 0);
  const lever = new THREE.Group(); lever.position.set(0.018, 0.045, 0); g.add(lever);
  vrbox(0.012, 0.095, 0.026, 0.004, EXM.odDark, lever, 0.008, -0.045, 0);
  vbox(0.006, 0.016, 0.02, EXM.red, g, 0.0, 0.058, 0.0);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 5), EXM.wire); c.position.set(0, -0.08, 0); g.add(c);
  return { g, lever };
}
// one gloved hand gripping something of half-width hw, as on the medkit
function oneHand(g, sx, hw, y) {
  const h = new THREE.Group(); g.add(h);
  ell(h, KMAT.glove, 0.03, [sx * (hw + 0.008), y, 0.004], [0.45, 1.35, 1.25]);
  for (let i = 0; i < 4; i++) fingerChain(h, KMAT.glove, [sx * (hw + 0.004), y + 0.03 - i * 0.02, -0.022], [-sx, 0, -0.55], [0, -sx, 0], [0.034, 0.024, 0.02], [0.35, 0.5, 0.3], i === 3 ? 0.0086 : 0.0096);
  fingerChain(h, KMAT.glove, [sx * (hw + 0.004), y + 0.03, 0.026], [-sx, -0.15, 0.45], [0, sx, 0], [0.03, 0.026], [0.2, 0.4], 0.0105);
  gloveCuff(h, [sx * (hw + 0.012), y - 0.04, 0.03], [sx * 0.3, -0.75, 0.6]);
  compact(h);
  vsleeve(h, [sx * (hw + 0.02), y - 0.062, 0.05], [sx * (hw + 0.09), y - 0.22, 0.3]);
  return h;
}
function buildFragVM() {
  const g = new THREE.Group(); g.visible = false; vm.add(g);
  const R = new THREE.Group(); R.position.set(0.1, 0, 0); g.add(R);
  const n = makeFrag(); n.g.position.set(0, 0.012, -0.01); n.g.rotation.set(0, -0.4, -0.15); R.add(n.g);
  oneHand(R, 1, NADE_R, -0.012);
  const L = new THREE.Group(); L.position.set(-0.11, -0.02, 0.02); g.add(L); oneHand(L, -1, 0.012, -0.01);
  return { g, R, L, nade: n, hip: new V3(0.03, -0.115, -0.3) };
}
function buildC4VM() {
  const g = new THREE.Group(); g.visible = false; vm.add(g);
  const blk = makeC4(true); blk.rotation.set(0.5, 0, 0); blk.position.set(0, 0.0, 0.0); g.add(blk);
  const hg = new THREE.Group(); g.add(hg); holdHands(hg, 0.14, -0.01);
  const det = new THREE.Group(); det.visible = false; g.add(det);
  const c = makeClacker(); c.g.position.set(0.04, 0.02, -0.02); c.g.rotation.set(0.2, 0, -0.1); det.add(c.g); oneHand(det, 1, 0.018, 0.0).position.x = 0.04;
  return { g, blk, det, lever: c.lever, hands: hg, hip: new V3(0.0, -0.2, -0.46) };
}
const VMG = buildFragVM(), VMC = buildC4VM();
// ---------------------------------------------------------------- fireball, smoke, scorch, sound
const FIRE_TEX = canvasTex((g, s) => { const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.95)'); gr.addColorStop(0.55, 'rgba(230,90,20,0.55)'); gr.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 128);
const SCORCH_TEX = canvasTex((g, s) => {
  const c = s / 2; for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = Math.random() * c * 0.55, x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, rr = c * (0.25 + Math.random() * 0.45); const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(12,10,8,0.5)'); gr.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r0 = c * 0.25, r1 = c * (0.6 + Math.random() * 0.38); g.strokeStyle = 'rgba(10,8,6,' + (0.15 + Math.random() * 0.25) + ')'; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke(); }
}, 256);
const SCORCH_MAT = new THREE.MeshBasicMaterial({ map: SCORCH_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0xffffff });
const SOIL = { deb: 'rock', col: 0x6b6253, pit: 0x4a4339, dust: 0x8a7d68 };
const boomLight = new THREE.PointLight(0xffa850, 0, 28, 2); scene.add(boomLight);
let boomL = 0, tinn = 0;
function boomSound(dist, W) {
  const a = audio(), t = a.currentTime + dist / 343, big = Math.cbrt(W) / 0.9, att = 1 / (1 + dist * 0.035);
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(2600 - dist * 14, 260, 2600);
  const g = a.createGain(); g.gain.setValueAtTime(1.6 * att * big, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6 + dist * 0.01);
  src.connect(f).connect(g).connect(aMaster); src.start(t, 0, 2.2);
  const o = a.createOscillator(); o.frequency.setValueAtTime(70 * (1.2 - 0.3 * big), t); o.frequency.exponentialRampToValueAtTime(24, t + 0.6);
  const og = a.createGain(); og.gain.setValueAtTime(1.4 * att * big, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(og).connect(aMaster); o.start(t); o.stop(t + 0.85);
  if (dist < 120) { const s2 = a.createBufferSource(); s2.buffer = noiseBuf; const h = a.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 2500; const hg = a.createGain(); hg.gain.setValueAtTime(0.7 * att, t); hg.gain.exponentialRampToValueAtTime(0.0008, t + 0.12); s2.connect(h).connect(hg).connect(aMaster); s2.start(t, Math.random() * 0.5, 0.15); }
  // debris coming down afterwards
  for (let i = 0; i < 6; i++) setTimeout(() => noiseHit(rnd(900, 2400), 0.05, 0.08 * att), (dist / 343 + rnd(0.5, 1.6)) * 1000);
}
// burst eardrums / temporary threshold shift: everything goes dull and a tone rings, fading over seconds
function deafen(k) {
  const a = audio(), t = a.currentTime, dur = 2 + 7 * k;
  aMaster.frequency.cancelScheduledValues(t); aMaster.frequency.setValueAtTime(clamp(1400 - 1100 * k, 250, 1400), t); aMaster.frequency.exponentialRampToValueAtTime(20000, t + dur);
  const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = rnd(3400, 4200); const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.08 * k, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.1);
}
function boomVisual(p, n, W, kind) {
  const k = Math.cbrt(W) / 0.9, frag = kind === 'frag';
  boomL = 1; boomLight.position.copy(p).addScaledVector(n, 0.3); boomLight.intensity = (frag ? 60 : 180) * k;
  // the flash itself: for a few milliseconds a white-hot ball, then the burning gases rolling outward
  { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FIRE_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff })); s.position.copy(p).addScaledVector(n, 0.25 * k); scene.add(s); BOOM_FX.push({ o: s, t: 0, life: frag ? 0.035 : 0.07, r: (frag ? 1.6 : 4.5) * k, v: new V3() }); }
  // a frag grenade has no fireball: 180 g of Comp B gives a split-second flash, then grey-black smoke and dust; the work is done by the steel
  for (let i = 0; i < (frag ? 0 : 14); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FIRE_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 }));
    const o = new V3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0, 0.5) * k).addScaledVector(n, 0.2 * k);
    s.position.copy(p).add(o); s.scale.setScalar(0.1); scene.add(s);
    BOOM_FX.push({ o: s, t: 0, life: rnd(0.16, 0.4) * (0.8 + 0.4 * k), r: rnd(1.5, 3) * k, v: o.clone().multiplyScalar(rnd(4, 9)) });
  }
  const up = n.y > 0.6 ? n : n.clone().add(new V3(0, 0.6, 0)).normalize();
  for (let i = 0; i < 5; i++) dust(p.clone().add(new V3(rnd(-0.6, 0.6), rnd(0, 0.8), rnd(-0.6, 0.6)).multiplyScalar(k)), up, frag ? (i < 2 ? 0x4a4640 : 0x6e675c) : (i < 2 ? 0x2c2925 : 0x58524a), 3.2 * k, 0.85, rnd(4, 7));
  // the blast ring kicking dust out along the ground
  if (frag && p.y < 1) for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + rnd(-0.3, 0.3); dust(new V3(p.x, 0.15, p.z), new V3(Math.cos(a), 0.15, Math.sin(a)), 0x7d7464, 1.8, 0.6, rnd(1.5, 2.5)); }
  for (let i = 0; i < 3; i++) dust(p, n, 0x8a8070, 2.2 * k, 0.5, 2.5);
  // ground under it: a scorch and thrown soil
  if (p.y < 1.2 * k) {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * k, 2.6 * k), SCORCH_MAT); sc.rotation.set(-Math.PI / 2, 0, rnd(0, 6.28)); sc.position.set(p.x, 0.012, p.z); scene.add(sc);
    BOOM_FX.push({ o: sc, t: 0, life: 90, scorch: true });
    spawnDebris(new V3(p.x, 0.05, p.z), Math.round(18 * k), new V3(0, 1, 0), 0.9, rnd(3, 8) * k, SOIL, 0.035);
  }
  const dist = camera.position.distanceTo(p); boomSound(dist, W);
  const sh = clamp(3 / (1 + dist * 0.25), 0, 2.5) * k; P.kick += sh; P.pitch = clamp(P.pitch + rnd(-0.03, 0.05) * sh, PITCH_MIN, 1.5); P.yaw += rnd(-0.03, 0.03) * sh;
}
function updateBoomFx(dt) {
  if (boomL > 0) { boomL = Math.max(0, boomL - dt * 9); boomLight.intensity *= Math.exp(-dt * 26); if (boomL <= 0) boomLight.intensity = 0; }
  for (let i = BOOM_FX.length - 1; i >= 0; i--) {
    const f = BOOM_FX[i]; f.t += dt;
    if (f.scorch) { if (f.t > f.life) { scene.remove(f.o); f.o.geometry.dispose(); BOOM_FX.splice(i, 1); } continue; }
    const k = f.t / f.life; f.o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.exp(-dt * 10));
    f.o.scale.setScalar(f.r * (0.35 + 0.65 * Math.sqrt(Math.min(1, k * 2.5))));
    f.o.material.opacity = k < 0.3 ? 1 : Math.max(0, 1 - (k - 0.3) / 0.7); f.o.material.color.setRGB(1, 1 - 0.45 * k, 1 - 0.85 * k);
    if (k >= 1) { scene.remove(f.o); f.o.material.dispose(); BOOM_FX.splice(i, 1); }
  }
}
// ---------------------------------------------------------------- what is between two points (openings in walls let it through)
const _ray = new THREE.Raycaster();
function worldHit(o, d, max) {
  _ray.set(o, d); _ray.far = max;
  for (const h of _ray.intersectObjects(worldMeshes, false)) { if (h.object.userData.grid && gridOpenW(h.object, h.point.clone().addScaledVector(d, 0.01))) continue; return h; }
  return null;
}
function los(a, b) { const d = b.clone().sub(a), L = d.length(); if (L < 1e-3) return true; d.multiplyScalar(1 / L); return !worldHit(a, d, L - 0.02); }
// ---------------------------------------------------------------- walls: the blast punches out and cracks what it reaches
function blastWalls(p, W, owner) {
  const cW = Math.cbrt(W);
  for (const mesh of worldMeshes) {
    const ud = mesh.userData, kind = DESTR_OF[ud.kind]; if (!kind || !ud.box) continue;
    const G = wallGrid(mesh); if (!G) continue;
    const D = DESTR[kind], b = ud.box, near = new V3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z));
    const d = near.distanceTo(p); if (d > 3.2 * cW) continue;
    const gp = mesh.geometry.parameters, th = [gp.width, gp.height, gp.depth][G.ax], z = Math.max(0.02, d) / cW;
    // breach radius at contact, and how fast it falls off with scaled distance, by material
    let Rb, zc, amt;
    if (kind === 'concrete') { Rb = (W > 0.5 ? 0.34 : 0.07) * cW * clamp(0.25 / th, 0.6, 1.5); zc = 0.55; amt = 0.5; }
    else if (kind === 'drywall') { Rb = 0.85 * cW; zc = 1.5; amt = 0.75; }
    else if (kind === 'wood') { Rb = 0.55 * cW; zc = 1.1; amt = 0.6; }
    else { Rb = 0.8 * cW; zc = 1.7; amt = 0.8; }
    Rb *= Math.max(0, 1 - z / zc); const Rh = Rb * 1.7 + (kind === 'concrete' ? 0.35 : 0.25) * cW * Math.max(0, 1 - z / (zc * 1.8));
    if (Rh < 0.02) continue;
    holeify(mesh, SLOTS, D.inner); ud.holeMax = SLOTS; wallMask(mesh); ud.dmg = ud.dmg || [];
    const lp = mesh.worldToLocal(near.clone()), U = lp.getComponent(G.a1), V = lp.getComponent(G.a2), seed = Math.round(U * 1000) * 0.37 + Math.round(V * 1000) * 0.61 + 3.1;
    const lump = a => 1 + 0.2 * Math.sin(3 * a + seed) + 0.13 * Math.sin(5 * a + seed * 1.7) + 0.08 * Math.sin(11 * a + seed * 2.3);
    const i0 = Math.floor((U - Rh * 1.4 - G.min1) / G.cs1), i1 = Math.ceil((U + Rh * 1.4 - G.min1) / G.cs1), j0 = Math.floor((V - Rh * 1.4 - G.min2) / G.cs2), j1 = Math.ceil((V + Rh * 1.4 - G.min2) / G.cs2);
    let opened = 0, ou = 0, ov = 0; const data = G.tex.image.data;
    for (let j = Math.max(0, j0); j <= Math.min(G.n2 - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(G.n1 - 1, i1); i++) {
      const k = j * G.n1 + i; if (G.cell[k]) continue;
      const cu = G.min1 + (i + 0.5) * G.cs1 - U, cv = G.min2 + (j + 0.5) * G.cs2 - V, r = Math.hypot(cu, cv), L = lump(Math.atan2(cv, cu));
      let add = 0;
      if (r < Rb * L) add = 1.4;
      else if (r < Rh * L) { const t = 1 - (r - Rb * L) / Math.max(0.01, Rh * L - Rb * L); add = amt * t * t * (0.5 + _sh(i, j, seed)); }
      if (!add) continue;
      G.dmg[k] += add * (1 + 0.6 * Math.min(1, G.dmg[k]));
      if (G.dmg[k] >= 1) { G.cell[k] = 1; G.any = true; data[k] = 255; opened++; ou += cu; ov += cv; }
      else data[k] = Math.round(Math.min(0.92, G.dmg[k]) * 255);
    }
    G.tex.needsUpdate = true;
    if (opened) { const dir = d > 0.01 ? near.clone().sub(p).normalize() : new V3().setComponent(G.ax, Math.sign(mesh.worldToLocal(p.clone()).getComponent(G.ax)) * -1 || 1).transformDirection(mesh.matrixWorld); settleWall(mesh, G, D, dir, U + ou / opened, V + ov / opened, opened, clamp(2.5 / (z + 0.3), 1, 5)); }
  }
}
// ---------------------------------------------------------------- bodies
function poisson(l) { if (l > 30) return Math.round(l + Math.sqrt(l) * rnd(-1, 1)); const L = Math.exp(-l); let k = 0, q = 1; do { k++; q *= Math.random(); } while (q > L); return k - 1; }
// fragments that reach this set of body meshes. Every fragment is a straight ray from the burst, spread evenly over the
// sphere, and only the ones that actually strike the body (past walls, crates and the ground) count, each as a real hit
// through the same wound and anatomy code a pellet uses. Rays are only cast into the cone the body fills, so the cost
// stays small. That is what makes going prone work: a grenade bursts just above the ground, everything below the horizon
// goes into the dirt, and a body lying flat only shows the burst a thin strip about 25 cm high, so most of the steel
// passes over it. Standing, you show it your whole height.
function fragsAt(p, meshes, nFrag, area, owner, apply) {
  if (!meshes.length) return 0;
  const c = new V3(), sph = [];
  for (const m of meshes) { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); const bs = m.geometry.boundingSphere, w = m.localToWorld(bs.center.clone()); sph.push([w, bs.radius]); c.add(w); }
  c.multiplyScalar(1 / sph.length); let R = 0.05; for (const [w, r] of sph) R = Math.max(R, w.distanceTo(c) + r);
  const ax = c.clone().sub(p), d = ax.length(); if (d > 60) return 0; ax.multiplyScalar(1 / Math.max(d, 1e-4));
  const cosT = d > R ? Math.sqrt(1 - (R / d) * (R / d)) : -1, nAll = poisson(nFrag * (1 - cosT) / 2), n = Math.min(320, nAll), wgt = nAll / Math.max(1, n);
  // a frame around the axis, to aim rays inside the cone
  const u = Math.abs(ax.y) < 0.9 ? new V3(0, 1, 0).cross(ax).normalize() : new V3(1, 0, 0).cross(ax).normalize(), v = ax.clone().cross(u);
  // only what could stand between the burst and the body: things within reach of the segment, plus the ground
  const reach = d + R, cand = worldMeshes.filter(m => { const b = m.userData.box; if (!b) return true; const q = new V3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z)); if (q.distanceTo(p) > reach) return false; const cb = new V3(clamp(c.x, b.min.x, b.max.x), clamp(c.y, b.min.y, b.max.y), clamp(c.z, b.min.z, b.max.z)); return cb.distanceTo(c) < reach; }).concat(meshes);
  let hits = 0;
  for (let i = 0; i < n && hits < 60; i++) {
    const cz = 1 - Math.random() * (1 - cosT), sz = Math.sqrt(Math.max(0, 1 - cz * cz)), ph = Math.random() * 6.2832;
    const dir = ax.clone().multiplyScalar(cz).addScaledVector(u, sz * Math.cos(ph)).addScaledVector(v, sz * Math.sin(ph));
    _ray.set(p, dir); _ray.far = d + R;
    const h = _ray.intersectObjects(cand, false).find(x => !(x.object.userData.grid && gridOpenW(x.object, x.point.clone().addScaledVector(dir, 0.01))));
    if (!h || !meshes.includes(h.object)) continue;
    // real ground is never flat: dirt, stones, grass and kerbs stand a few centimetres up, and a fragment skimming
    // along under that height for a metre or two is very likely to hit something and stop
    const L = clutterRun(p.y, dir.y, h.distance); if (L > 0 && Math.random() > Math.exp(-L / 0.6)) continue;
    // close in there are more fragments than rays cast: each ray that lands stands for its share of them
    for (let k = Math.floor(wgt) + (Math.random() < wgt % 1 ? 1 : 0); k > 0 && hits < 60; k--) {
    hits++;
    // a fragment leaves at about 1500 m/s and sheds speed fast; expressed as the speed of a 00 buck pellet of the same energy
    apply(h, dir, 520 * Math.exp(-h.distance / 15) * rnd(0.8, 1.2), h.distance);
    }
  }
  return hits;
}
const _fv = new V3(), CLUTTER_H = 0.12;
// how far a ray from height y0 with vertical direction dy runs below the clutter height before travelling dist
function clutterRun(y0, dy, dist) {
  if (y0 < CLUTTER_H) { if (dy <= 0) return dist; return Math.min(dist, (CLUTTER_H - y0) / dy); }
  if (dy >= 0) return 0; return Math.max(0, dist - (y0 - CLUTTER_H) / -dy);
}
function ragPush(r, p, sp) {
  if (!r || !r.p) return;
  for (let i = 0; i < r.p.length; i++) { const d = r.p[i].clone().sub(p), L = Math.max(0.3, d.length()); d.multiplyScalar(1 / L).add(new V3(0, 0.35, 0)); r.q[i].addScaledVector(d, -sp * clamp(1.5 / L, 0.3, 1.2) / 120); }
  r.asleep = false;
}
// limbs nearest the blast come off
function blastLimbs(an, near, maxN) {
  const L = ['armL', 'armR', 'legL', 'legR'].filter(l => !an.lost[l]).sort(() => Math.random() - 0.5).slice(0, maxN);
  for (const l of L) an.sever(l, Math.random() < 0.5 ? 1 : 2, rnd(0.2, 0.8));
  return L.length;
}
function blastBodies(p, kind, owner, isOwner) {
  const E = EXPL[kind], cW = Math.cbrt(E.W), shot = { hits: new Map() };
  // the local player, on every client: nobody else can know where you stand
  if (P.alive) {
    const tgt = P.downed && P.rag ? null : localBody.hitMeshes.filter(m => m.visible);
    const c = P.pos.clone().setY(P.downed ? 0.3 : P.pos.y + (P.prone > 0.5 ? 0.25 : 0.95)), d = Math.max(0.15, c.distanceTo(p)), cover = !los(p, c);
    const z = d / cW * (cover ? 1.7 : 1), an = P.anat, dir = c.clone().sub(p).setY(Math.max(0.1, c.y - p.y)).normalize();
    an.lastBy = owner; an.lastDir.copy(dir); an.lastDist = d;
    let res = null;
    if (E.frags && tgt) {
      localBody.root.updateMatrixWorld(true);
      fragsAt(p, tgt, E.frags, P.prone > 0.5 ? 0.18 : P.crouch > 0.5 ? 0.33 : 0.5, owner, (h, fd, v) => {
        if (an.dead) return;
        const info = hitToFrame(localBody, h.object, h.point, fd); an.lastDir.copy(fd);
        an.frag = true; const r = an.hit(info.frame, info.e, info.d, v, 5, info.armor, info.pd); an.frag = false; if (!res || (r && r.blast)) res = r;
      });
    }
    if (E.frags && P.downed && P.rag) fragsAt(p, ragMeshes(P.rag), E.frags, 0.4, owner, (h, fd, v, L) => fragHit(h, fd, v, L, shot, p));
    if (z < 0.5) { an.kill('blast'); if (z < 0.35 && kind === 'c4') an.gibHead = true; blastLimbs(an, p, z < 0.35 ? 3 : 1); }
    else if (z < 1.1 && !an.dead) an.kill('blast');
    else if (z < 2.2) { an.shock = (an.shock || 0) + 60; an.pain = Math.min(1, (an.pain || 0) + 0.5); an.wounds.push({ region: 'chest', name: 'Blast injury (lungs)', rate: 4 + 10 * (2.2 - z), treated: false }); an.version++; res = Object.assign(res || {}, { blast: { big: true } }); }
    else if (z < 4) { P.stun = Math.max(P.stun || 0, 0.5); }
    if (z < 6) deafen(clamp(1 - z / 6, 0, 1));
    P.vel.addScaledVector(dir, clamp(5 / (z * z), 0, 8)); if (P.rag) ragPush(P.rag, p, clamp(10 / (z * z), 0, 14));
    if (res || an.dead) onSelfHurt(res || {});
    if (P.rag && an.dead) ragPush(P.rag, p, clamp(10 / (z * z), 0, 14));
  }
  if (!isOwner) return;
  // the AI bodies and bodies on the ground: worked out once, by whoever set it off
  for (const dm of dummies) {
    if (dm.dead && !dm.rag) continue;
    const c = (dm.rag ? dm.rag.p[1] : dm.hum.root.position.clone().setY(0.95)).clone(), d = Math.max(0.15, c.distanceTo(p)); if (d > 50) continue;
    const z = d / cW * (los(p, c) ? 1 : 1.7), an = dm.anat, dir = c.clone().sub(p).setY(0.3).normalize();
    if (E.frags) {
      const ms = dm.rag ? ragMeshes(dm.rag) : (dm.hum.root.updateMatrixWorld(true), dm.hum.hitMeshes.filter(m => m.visible));
      fragsAt(p, ms, E.frags, dm.rag ? 0.4 : 0.5, owner, (h, fd, v, L) => fragHit(h, fd, v, L, shot, p));
    }
    if (dm.dead) { ragPush(dm.rag, p, clamp(10 / (z * z), 0, 14)); continue; }
    an.lastDir.copy(dir); an.lastW = 5; an.lastDist = d;
    let gone = false;
    if (z < 0.5) { if (z < 0.35 && kind === 'c4') an.gibHead = true; blastLimbs(an, p, z < 0.35 ? 3 : 1); an.kill('blast'); gone = true; }
    else if (z < 1.1) { an.kill('blast'); gone = true; }
    else if (z < 2.2) { an.shock = (an.shock || 0) + 60; an.wounds.push({ region: 'chest', name: 'Blast injury (lungs)', rate: 4 + 10 * (2.2 - z), treated: false }); dm.blastFall(dir); }
    if (gone) {
      if (!dm.credited) { dm.credited = true; S.testKills = (S.testKills || 0) + 1; killNotice('AI'); }
      if (dm.rag) dm.rag.applyLost(an.lostMask(), dir, an.cutArr()); else syncLost(dm.hum, an.lostMask(), dir, an.cutArr());
      dm.die(); if (an.gibHead && dm.rag && dm.rag.headG.visible) dm.rag.gibHead(dir);
    }
    if (dm.rag) ragPush(dm.rag, p, clamp(10 / (z * z), 0, 14));
  }
  // loose corpses (not a player's body still being simulated by its own client)
  for (const r of ragdolls) if (!r.owner || (!r.owner.dummy && !r.owner.nd && !r.owner.remote && r !== P.rag)) { const z = r.p[1].distanceTo(p) / cW; if (z < 6) ragPush(r, p, clamp(10 / (z * z), 0, 14)); }
}
// a fragment into an AI body or a body on the ground: the normal hit code, with the anatomy told it is steel from a grenade
function fragHit(h, fd, v, L, shot, p) {
  const ud = h.object.userData, own = ud.rag ? ud.rag.owner || {} : {}, an = ud.hum && ud.hum.dummy ? ud.hum.dummy.anat : own.dummy ? own.dummy.anat : own.anat || null;
  if (an) an.frag = true;
  try { onBulletHit({ vel: fd.clone().multiplyScalar(v), w: 5, local: true, shot, dist: L, pos: p.clone() }, h, fd, L); } finally { if (an) an.frag = false; }
}
function ragMeshes(r) { const out = []; r.group.traverse(o => { if (o.isMesh && o.visible && o.userData.rag) out.push(o); }); return out; }
// ---------------------------------------------------------------- the explosion
function explode(p, kind, owner, isOwner, n) {
  const E = EXPL[kind]; n = n || new V3(0, 1, 0);
  boomVisual(p, n, E.W, kind);
  blastWalls(p, E.W, owner);
  // fragments flying everywhere: they chip and hole walls and crates (bodies are worked out above, hit by hit)
  if (E.frags) for (let i = 0; i < 110; i++) {
    const d = new V3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize(); spawnBullet(p.clone().addScaledVector(d, 0.05), d, 5, false, false, owner, null);
    const b = bullets[bullets.length - 1]; b.vel.setLength(rnd(500, 900)); b.drag *= 6; b.frag = true;
  }
  blastBodies(p, kind, owner, isOwner);
  // charges close enough go off with it (sympathetic detonation)
  for (const c of CHARGES.slice()) if (c.p.distanceTo(p) < 1.2 * Math.cbrt(E.W) && c.owner === S.myIdOr0()) { removeCharge(c); setTimeout(() => detonateCharge(c, true), 30); }
}
S.myIdOr0 = () => S.mode === 'online' ? S.myId || 0 : 0;
// ---------------------------------------------------------------- charges
function addCharge(owner, id, p, n) {
  const g = makeC4(true); g.position.copy(p).addScaledVector(n, 0.026);
  // flat on the surface, long side across
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), n); g.quaternion.copy(q); if (Math.abs(n.y) < 0.7) g.rotateY(rnd(-0.2, 0.2));
  scene.add(g); const c = { g, p: p.clone().addScaledVector(n, 0.03), n: n.clone(), owner, id, t: 0 }; CHARGES.push(c); return c;
}
function removeCharge(c) { const i = CHARGES.indexOf(c); if (i >= 0) CHARGES.splice(i, 1); scene.remove(c.g); }
function detonateCharge(c, already) {
  if (!already) removeCharge(c);
  if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'c4', i: c.id, p: c.p.toArray().map(r3), n: c.n.toArray().map(r3) });
  explode(c.p, 'c4', S.myIdOr0(), true, c.n);
}
const r3 = x => Math.round(x * 1000) / 1000;
// ---------------------------------------------------------------- grenades in flight: bounce, roll, then go off
function throwNade(owner, id, p, v, fuse, local) {
  const n = makeFrag(); n.pin.visible = false; n.spoon.visible = false; n.g.position.copy(p); scene.add(n.g);
  const o = { g: n.g, p: p.clone(), v: v.clone(), w: new V3(rnd(-12, 12), rnd(-6, 6), rnd(-12, 12)), fuse, owner, id, local, t: 0 };
  NADES.push(o); return o;
}
function nadeCollide(o) {
  const r = NADE_R, p = o.p;
  if (p.y < r) { p.y = r; if (o.v.y < 0) { o.hitV = Math.max(o.hitV || 0, -o.v.y); o.v.y = -o.v.y * 0.28; o.v.x *= 0.72; o.v.z *= 0.72; o.ground = true; } }
  for (const c of colliders) {
    if (p.x + r < c.min.x || p.x - r > c.max.x || p.y + r < c.min.y || p.y - r > c.max.y || p.z + r < c.min.z || p.z - r > c.max.z) continue;
    if (c.mesh && gridOpenW(c.mesh, p)) continue;
    // push out along the shallowest axis and bounce off that face
    const pen = [[p.x + r - c.min.x, 0, -1], [c.max.x - (p.x - r), 0, 1], [p.y + r - c.min.y, 1, -1], [c.max.y - (p.y - r), 1, 1], [p.z + r - c.min.z, 2, -1], [c.max.z - (p.z - r), 2, 1]];
    let best = pen[0]; for (const q of pen) if (q[0] < best[0]) best = q;
    p.setComponent(best[1], p.getComponent(best[1]) + best[0] * best[2]);
    const vn = o.v.getComponent(best[1]) * best[2];
    if (vn < 0) {
      o.hitV = Math.max(o.hitV || 0, -vn); o.v.setComponent(best[1], -o.v.getComponent(best[1]) * 0.3);
      for (let k = 0; k < 3; k++) if (k !== best[1]) o.v.setComponent(k, o.v.getComponent(k) * 0.75);
      if (best[1] === 1 && best[2] > 0) o.ground = true;
    }
  }
}
function updateNades(dt) {
  for (let i = NADES.length - 1; i >= 0; i--) {
    const o = NADES[i]; o.t += dt; o.fuse -= dt; o.ground = false;
    const sp = o.v.length(), n = Math.max(1, Math.ceil(sp * dt / 0.012));
    for (let s = 0; s < n; s++) { o.v.y -= 9.81 * dt / n; o.p.addScaledVector(o.v, dt / n); nadeCollide(o); }
    if (o.ground) { o.v.multiplyScalar(Math.exp(-dt * 1.6)); o.w.multiplyScalar(Math.exp(-dt * 2)); if (o.v.length() < 0.05) o.v.set(0, 0, 0); }
    if (o.hitV > 1.2) noiseHit(rnd(2000, 3200), 0.04, clamp(o.hitV * 0.03, 0, 0.25) / (1 + camera.position.distanceTo(o.p) * 0.1));
    o.hitV = 0;
    o.g.position.copy(o.p); o.g.rotation.x += o.w.x * dt; o.g.rotation.y += o.w.y * dt; o.g.rotation.z += o.w.z * dt;
    if (o.fuse <= 0) {
      if (o.local) { if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'frag', i: o.id, p: o.p.toArray().map(r3) }); explode(o.p.clone(), 'frag', o.owner, true); }
      if (o.local || o.fuse < -4) { scene.remove(o.g); NADES.splice(i, 1); }
    }
  }
}
// ---------------------------------------------------------------- held: the grenade
// Left button pulls the pin and keeps the spoon held; letting go throws overhand. Right button the same, underhand (a short
// lob or a roll). R with the pin out lets the spoon fly while you still hold it: the fuse is burning ("cooking").
function nadeReset() { P.nade = { ph: 'idle', t: 0, btn: 0, fuse: 0, cook: false }; VMG.nade.pin.visible = true; VMG.nade.spoon.visible = true; VMG.nade.g.visible = true; }
function updateFrag(dt) {
  const N = P.nade || (nadeReset(), P.nade); N.t += dt;
  if (N.cook) { N.fuse -= dt; if (N.fuse <= 0) { const hp = camera.position.clone().add(new V3(0.12, -0.15, -0.3).applyQuaternion(camera.quaternion)); N.cook = false; P.fragN = Math.max(0, P.fragN - 1); nadeReset(); if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'frag', i: 0, p: hp.toArray().map(r3) }); explode(hp, 'frag', S.myIdOr0(), true); return; } }
  if (N.ph === 'idle') {
    if (P.fragN <= 0) { VMG.nade.g.visible = false; if (N.t > 0.3) selectEmpty(3); return; }
    VMG.nade.g.visible = true;
    if (P.switchT <= 0 && S.locked && (mouse.left || mouse.right)) { N.ph = 'pin'; N.t = 0; N.btn = mouse.left ? 0 : 2; }
  } else if (N.ph === 'pin') {
    if (N.t > 0.3 && VMG.nade.pin.visible) { VMG.nade.pin.visible = false; noiseHit(3800, 0.05, 0.12); blip(2400, 0.03, 0.03, 'triangle'); }
    if (N.t > 0.45) { N.ph = 'ready'; N.t = 0; }
  } else if (N.ph === 'ready') {
    if (!(N.btn === 0 ? mouse.left : mouse.right)) { N.ph = 'throw'; N.t = 0; }
  } else if (N.ph === 'throw') {
    if (N.t > 0.12 && VMG.nade.g.visible) {
      VMG.nade.g.visible = false;
      const q = camera.quaternion, fwd = new V3(0, 0, -1).applyQuaternion(q), over = N.btn === 0;
      const dir = fwd.clone().add(new V3(0, over ? 0.18 : 0.05, 0)).normalize(), speed = over ? rnd(16, 18.5) : rnd(7, 8.5);
      const p0 = camera.position.clone().add(new V3(over ? 0.18 : 0.1, over ? 0.05 : -0.35, -0.35).applyQuaternion(q));
      const v = dir.multiplyScalar(speed).add(P.vel.clone().multiplyScalar(0.8)), fuse = N.cook ? N.fuse : rnd(4, 5.5), id = explSeq++;
      throwNade(S.myIdOr0(), id, p0, v, fuse, true);
      if (S.mode === 'online') net.send({ t: 'x', a: 'nade', i: id, p: p0.toArray().map(r3), v: v.toArray().map(r3), f: r3(fuse) });
      if (!N.cook) blip(3000, 0.04, 0.05, 'triangle');      // the spoon flies off
      noiseHit(700, 0.12, 0.06); N.cook = false; P.fragN = Math.max(0, P.fragN - 1);
    }
    if (N.t > 0.55) { nadeReset(); P.nade.t = 0; }
  }
}
addEventListener('keydown', e => {
  if (e.code === 'KeyR' && P.slot === 3 && P.nade && (P.nade.ph === 'ready' || P.nade.ph === 'pin') && !P.nade.cook) { P.nade.cook = true; P.nade.fuse = rnd(4, 5.5); VMG.nade.spoon.visible = false; blip(3000, 0.04, 0.05, 'triangle'); flashMsg('SPOON RELEASED<small>The fuse is burning</small>', 900); }
});
addEventListener('mousedown', e => { if (e.button === 2) mouse.right = true; });
addEventListener('mouseup', e => { if (e.button === 2) mouse.right = false; });
// leaving the slot with the pin out: an uncooked grenade gets its pin back; a cooked one is dropped where you stand
function nadeAbandon() {
  const N = P.nade; if (!N || N.ph === 'idle') return;
  if (N.cook) { const p0 = P.pos.clone().setY(0.6); throwNade(S.myIdOr0(), explSeq++, p0, new V3(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)), N.fuse, true); P.fragN = Math.max(0, P.fragN - 1); flashMsg('LIVE GRENADE DROPPED', 1500); }
  nadeReset();
}
// ---------------------------------------------------------------- held: C4 and the firing device
function c4Mine() { const me = S.myIdOr0(); return CHARGES.filter(c => c.owner === me); }
function updateC4(dt) {
  const C = P.c4 || (P.c4 = { ph: 'idle', t: 0 }); C.t += dt;
  const mine = c4Mine(), haveBlock = P.c4N > 0;
  VMC.blk.visible = haveBlock && C.ph !== 'det'; VMC.hands.visible = VMC.blk.visible; VMC.det.visible = !VMC.blk.visible;
  if (C.ph === 'idle') {
    if (!haveBlock && !mine.length) { if (C.t > 0.3) selectEmpty(2); return; }
    if (P.switchT > 0 || !S.locked) return;
    if (mouse.left && haveBlock && P.semiReady) {
      P.semiReady = false;
      const d = new V3(0, 0, -1).applyQuaternion(camera.quaternion), h = worldHit(camera.position, d, C4_REACH);
      const gy = d.y < -0.05 ? -camera.position.y / d.y : 1e9;
      if (h && h.face) { C.ph = 'plant'; C.t = 0; C.at = h.point.clone(); C.n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize(); }
      else if (gy < C4_REACH) { C.ph = 'plant'; C.t = 0; C.at = camera.position.clone().addScaledVector(d, gy); C.at.y = 0; C.n = new V3(0, 1, 0); }
      else flashMsg('NOTHING IN REACH TO STICK IT TO', 900);
    } else if ((mouse.right || (mouse.left && !haveBlock && P.semiReady)) && mine.length) { P.semiReady = false; C.ph = 'det'; C.t = 0; }
  } else if (C.ph === 'plant') {
    if (C.t > 0.7) {
      const id = explSeq++; addCharge(S.myIdOr0(), id, C.at, C.n); P.c4N--; noiseHit(500, 0.08, 0.1); blip(1800, 0.05, 0.04, 'sine');
      if (S.mode === 'online') net.send({ t: 'x', a: 'c4p', i: id, p: C.at.toArray().map(r3), n: C.n.toArray().map(r3) });
      flashMsg('CHARGE SET<small>' + (P.c4N ? P.c4N + ' left. ' : '') + 'Right mouse to fire' + (P.c4N ? '' : ' (or left)') + '</small>', 1600);
      C.ph = 'idle'; C.t = 0;
    }
  } else if (C.ph === 'det') {
    // the handle has to be squeezed hard, three times, before it fires
    const sq = Math.floor(C.t / 0.16); if (sq !== C.sq) { C.sq = sq; if (sq < 3) noiseHit(1300, 0.03, 0.12); }
    if (C.t > 0.5) { for (const c of mine) { removeCharge(c); setTimeout(() => detonateCharge(c, true), rnd(0, 40)); } C.ph = 'idle'; C.t = 0; C.sq = -1; }
  }
}
function updateExplosives(dt) {
  updateNades(dt); updateBoomFx(dt);
  for (const c of CHARGES) { c.t += dt; const led = c.g.userData.led; if (led) led.visible = (c.t % 1.2) < 0.08; }
  if (P.slot !== 3 && P.nade && P.nade.ph !== 'idle') nadeAbandon();
  if (P.slot !== 2 && P.c4 && P.c4.ph !== 'idle') P.c4.ph = 'idle';
  if (P.nade && P.nade.cook && P.slot !== 3) nadeAbandon();
  // on the test range the crates of explosives never run dry: a few seconds after the last one is used, more are there
  if (S.mode === 'test' && P.alive) {
    if (P.c4N <= 0 && !c4Mine().length) { P.c4R = (P.c4R || 0) + dt; if (P.c4R > 4) { P.c4N = 2; P.c4R = 0; flashMsg('C4 RESTOCKED', 900); } } else P.c4R = 0;
    if (P.fragN <= 0 && !NADES.some(o => o.local)) { P.fragR = (P.fragR || 0) + dt; if (P.fragR > 4) { P.fragN = 3; P.fragR = 0; flashMsg('GRENADES RESTOCKED', 900); } } else P.fragR = 0;
  }
}
// viewmodels for slots 3 and 4 (called from updateViewmodel)
function vmExplosives(dt) {
  VMG.g.visible = P.slot === 3; VMC.g.visible = P.slot === 2;
  const s2 = P.sprintBlend, bob = Math.sin(P.bobT * 0.5) * 0.008 * Math.min(1, P.speed / 4);
  if (P.slot === 3) {
    const N = P.nade || { ph: 'idle', t: 0 }, H = VMG.hip;
    let x = H.x, y = H.y, z = H.z, rx = 0, ry = 0, lx = -0.11, ly = -0.02, lz = 0.02;
    if (N.ph === 'pin') { const k = clamp(N.t / 0.45, 0, 1); lx = -0.11 + 0.1 * ramp(k, 0, 0.4) - 0.14 * ramp(k, 0.55, 1); ly = -0.02 + 0.03 * ramp(k, 0, 0.4); }
    if (N.ph === 'ready') { y += 0.02; z += 0.02; lx = -0.2; }
    if (N.ph === 'throw') { const k = clamp(N.t / 0.55, 0, 1), over = N.btn === 0, a = ramp(k, 0, 0.2), b = ramp(k, 0.2, 0.6); y += over ? 0.12 * a - 0.35 * b : -0.15 * a - 0.1 * b; z += over ? 0.1 * a - 0.25 * b : -0.2 * b; rx = over ? 0.8 * a - 1.6 * b : -0.6 * a + 0.4 * b; lx = -0.25; }
    if (N.ph === 'idle' && N.t < 0.35) y -= 0.3 * (1 - N.t / 0.35);
    vm.position.set(x + P.swayX + bob, y + P.swayY - P.switchT * 0.7 - 0.05 * s2, z); vm.rotation.set(rx - 0.3 * s2 - P.aimOY * 0.5, ry - P.aimOX * 0.5, 0);
    VMG.L.position.set(lx, ly, lz); VMG.L.visible = N.ph !== 'throw';
  } else {
    const C = P.c4 || { ph: 'idle', t: 0 }, H = VMC.hip; let y = H.y, z = H.z, rx = 0;
    if (C.ph === 'plant') { const k = clamp(C.t / 0.7, 0, 1), a = ramp(k, 0, 0.5), b = ramp(k, 0.6, 1); y += 0.05 * a - 0.3 * b; z -= 0.25 * a; rx = -0.7 * a; }
    if (C.ph === 'det') { const sq = (C.t % 0.16) / 0.16; VMC.lever.rotation.z = -0.25 * Math.sin(sq * Math.PI); y += 0.02; }
    vm.position.set(H.x + P.swayX + bob + (VMC.det.visible ? 0.04 : 0), y + P.swayY - P.switchT * 0.7 - 0.05 * s2, z); vm.rotation.set(rx - 0.3 * s2 - P.aimOY * 0.5, -P.aimOX * 0.5, 0);
  }
  vm.visible = !(P.reactV > 0.3);
  P.aimOX = damp(P.aimOX, 0, 3, dt); P.aimOY = damp(P.aimOY, 0, 3, dt); P.swayX = damp(P.swayX, 0, 8, dt); P.swayY = damp(P.swayY, 0, 8, dt);
  vmCamera.position.copy(camera.position); vmCamera.quaternion.copy(camera.quaternion); vmCamera.fov = camera.fov; vmCamera.updateProjectionMatrix();
  vmSun.position.copy(camera.position).addScaledVector(sunDir, 10); vmSun.target.position.copy(camera.position);
  $('scope').style.display = 'none'; $('acog').style.display = 'none'; $('vigads').style.opacity = '0';
}
// ---------------------------------------------------------------- from the network
function onExplosiveMsg(m) {
  const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (!ok(m.p)) return;
  const p = new V3().fromArray(m.p);
  if (m.a === 'c4p' && ok(m.n)) addCharge(m.id, m.i, p, new V3().fromArray(m.n).normalize());
  else if (m.a === 'nade' && ok(m.v)) throwNade(m.id, m.i, p, new V3().fromArray(m.v), clamp(Number(m.f) || 4, 0, 6) + 0.5, false);
  else if (m.a === 'boom') {
    const kind = m.k === 'c4' ? 'c4' : 'frag';
    for (const c of CHARGES.slice()) if (c.owner === m.id && c.id === m.i) removeCharge(c);
    for (let i = NADES.length - 1; i >= 0; i--) if (NADES[i].owner === m.id && NADES[i].id === m.i) { scene.remove(NADES[i].g); NADES.splice(i, 1); }
    explode(p, kind, m.id, false, ok(m.n) ? new V3().fromArray(m.n) : null);
  }
}
function clearExplosives() {
  for (const c of CHARGES) scene.remove(c.g); CHARGES.length = 0;
  for (const o of NADES) scene.remove(o.g); NADES.length = 0;
  for (const f of BOOM_FX) scene.remove(f.o); BOOM_FX.length = 0; boomLight.intensity = 0;
}
