// ---------------------------------------------------------------- explosives: M112 C4 (slot 3) and the M67 fragmentation grenade (slot 4)
// Charges are rated in kilograms of TNT. Blast effects scale with Hopkinson's scaled distance Z = d / W^(1/3) (m / kg^1/3):
// below about 0.5 a body comes apart, below about 1.1 the overpressure alone kills (lungs, brain), below about 2.2 it knocks a
// person down with internal injuries and burst eardrums, below about 4 it staggers and deafens.
//   M112 block: 0.57 kg of C4 (RE 1.34) = 0.76 kg TNT. No casing, so no fragments: it kills and breaches by blast.
//   M67: 180 g of Composition B (RE 1.35) = 0.24 kg TNT inside a 2.5 mm steel body that breaks into a few thousand fragments.
//   Fuze M213: the striker is held by the spoon; once the spoon flies the delay burns 4 to 5.5 s. Pulling the pin alone
//   does nothing as long as the spoon is held. Lethal radius about 5 m, casualties out to about 15 m.
const EXPL = { c4: { W: 0.76, frags: 0 }, frag: { W: 0.24, frags: 5500 } };
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
  red: new THREE.MeshStandardMaterial({ color: 0x9a1c14, roughness: 0.6 }),
  redT: new THREE.MeshStandardMaterial({ color: 0xc02818, roughness: 0.35, transparent: true, opacity: 0.85 }),
  tape: new THREE.MeshStandardMaterial({ color: 0x3d4128, roughness: 0.85 }),
  rem: new THREE.MeshStandardMaterial({ color: 0x2e3324, roughness: 0.55, metalness: 0.15 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x16170f, roughness: 0.9 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x1c1d18, roughness: 0.5 })
};
// ---- the M67. Body: two pressed steel cups welded at the equator, 63.5 mm across, olive drab paint worn at the high spots,
// a yellow band (high explosive filler) and yellow stencilling. Fuze M213 screwed into the top: threaded neck, the fuze body,
// two ears carrying the hinge pin of the safety lever (spoon), which runs down the body on one side. The pull ring and its
// split pin go through the fuze from the other side, and a safety clip loops over the spoon.
const FRAG_TEX = canvasTex((g, s) => {
  g.fillStyle = '#4b5232'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) { const x = Math.random() * s, y = Math.random() * s, l = Math.random(); g.fillStyle = l < 0.5 ? 'rgba(30,34,18,0.18)' : 'rgba(110,116,80,0.12)'; g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  // worn paint: bare steel showing through in scuffs
  for (let i = 0; i < 70; i++) { const x = Math.random() * s, y = s * (0.15 + Math.random() * 0.75); g.fillStyle = 'rgba(120,120,112,' + (0.15 + Math.random() * 0.35) + ')'; g.fillRect(x, y, 1 + Math.random() * 6, 1); }
  g.fillStyle = '#c4a12c'; g.fillRect(0, s * 0.215, s, s * 0.035);
  g.fillStyle = '#c9a832'; g.font = 'bold ' + Math.round(s * 0.045) + 'px monospace'; g.textAlign = 'center';
  g.fillText('GRENADE HAND FRAG M67', s * 0.25, s * 0.42); g.fillText('LOT KMR-41-118', s * 0.25, s * 0.48);
  g.fillText('GRENADE HAND FRAG M67', s * 0.75, s * 0.42); g.fillText('COMP B', s * 0.75, s * 0.48);
}, 512);
const FRAG_MAT = new THREE.MeshStandardMaterial({ map: FRAG_TEX, roughness: 0.62, metalness: 0.25 });
function arcStrip(pts, w, t, m, parent) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), o = new THREE.Mesh(new THREE.BoxGeometry(t, L * 1.04, w), m);
    o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); parent.add(o);
  }
}
function makeFrag() {
  const g = new THREE.Group(), R = NADE_R;
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 20), FRAG_MAT); body.scale.set(1, 1.03, 1); body.rotation.y = Math.PI * 0.5; g.add(body);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 1.002, 0.0007, 4, 40), EXM.odDark); seam.rotation.x = Math.PI / 2; g.add(seam);
  // fuze M213
  const prof = [[0.0125, 0], [0.0125, 0.003], [0.011, 0.004], [0.011, 0.009], [0.0095, 0.0105], [0.0095, 0.022], [0.0085, 0.025], [0.006, 0.027], [0, 0.027]].map(a => new THREE.Vector2(a[0], a[1]));
  const fz = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), EXM.fuze); fz.position.y = R * 0.93; g.add(fz);
  for (let i = 0; i < 4; i++) { const th = new THREE.Mesh(new THREE.TorusGeometry(0.0113, 0.0005, 3, 18), EXM.fuze); th.rotation.x = Math.PI / 2; th.position.y = R * 0.93 + 0.0045 + i * 0.0012; g.add(th); }
  const top = R * 0.93 + 0.022;
  for (const zz of [-0.0055, 0.0055]) vbox(0.009, 0.01, 0.002, EXM.fuze, g, 0.008, top - 0.002, zz);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.014, 6), EXM.ring); hinge.rotation.x = Math.PI / 2; hinge.position.set(0.0105, top, 0); g.add(hinge);
  // spoon: from the hinge out over the shoulder of the fuze, then down along the body a few millimetres off it
  const spoon = new THREE.Group(); g.add(spoon);
  const pts = [new V3(0.009, top + 0.0025, 0), new V3(0.016, top + 0.001, 0), new V3(0.019, top - 0.008, 0)];
  for (let k = 0; k <= 7; k++) { const a = 0.55 + k / 7 * 1.25, r = R + 0.0032; pts.push(new V3(Math.sin(a) * r, Math.cos(a) * r, 0)); }
  pts.push(new V3(Math.sin(1.9) * (R + 0.007), Math.cos(1.9) * (R + 0.007), 0));
  arcStrip(pts, 0.014, 0.0013, EXM.spoon, spoon);
  for (const zz of [-0.0072, 0.0072]) arcStrip(pts.slice(3, 9).map(v => v.clone().multiplyScalar(1.03).setZ(zz)), 0.0018, 0.0026, EXM.spoon, spoon);   // turned-up edges
  // pull ring and pin from the far side, safety clip over the spoon
  const pin = new THREE.Group(); g.add(pin);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.034, 6), EXM.ring); bar.rotation.z = Math.PI / 2; bar.position.set(-0.004, top - 0.009, 0); pin.add(bar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0014, 6, 22), EXM.ring); ring.position.set(-0.033, top - 0.012, 0.001); ring.rotation.set(0, 0.25, 0.15); pin.add(ring);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.0028, 0.0008, 4, 10), EXM.ring); eye.position.set(-0.022, top - 0.009, 0); eye.rotation.y = Math.PI / 2; pin.add(eye);
  const clip = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0008, 4, 16, Math.PI * 1.3), EXM.ring); clip.position.set(0.01, R * 0.93 + 0.004, 0); clip.rotation.set(Math.PI / 2, 0, -0.6); pin.add(clip);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, spoon, pin, ring, top };
}
// ---- the M112 block: 1.25 lb of C4 in olive mylar film, 28 x 5 x 7.6 cm, black stencilling, a pressure-sensitive adhesive
// face. A wireless initiator with its blasting cap pushed into one end (the M57 is wired; a thrown charge is fired by radio).
const C4_TEX = canvasTex((g, s) => {
  // drawn squashed 3.7 : 1 so it comes out right on the 262 x 70 mm face
  g.fillStyle = '#525a31'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 320; i++) { const y = Math.random() * s, x = Math.random() * s; g.strokeStyle = Math.random() < 0.5 ? 'rgba(170,180,120,0.12)' : 'rgba(20,24,8,0.15)'; g.lineWidth = 2 + Math.random() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-40, 40), y + rnd(-25, 25)); g.stroke(); }
  g.save(); g.scale(1, 3.7); const h = s / 3.7;
  g.fillStyle = 'rgba(14,14,10,0.92)'; g.textAlign = 'center';
  g.font = 'bold ' + Math.round(h * 0.15) + 'px sans-serif'; g.fillText('CHARGE, DEMOLITION, M112', s / 2, h * 0.24);
  g.font = 'bold ' + Math.round(h * 0.13) + 'px sans-serif'; g.fillText('1 1/4 LB  COMPOSITION C-4', s / 2, h * 0.44);
  g.font = Math.round(h * 0.09) + 'px sans-serif'; g.fillText('LOT MA-91H112-004      CAUTION: EXPLOSIVE', s / 2, h * 0.62); g.fillText('REMOVE PAPER TO EXPOSE ADHESIVE', s / 2, h * 0.76);
  g.fillRect(s * 0.05, h * 0.86, s * 0.9, h * 0.025);
  g.restore();
}, 1024);
const C4_FILM = new THREE.MeshStandardMaterial({ color: 0x5a6136, roughness: 0.42, metalness: 0.08 });
const C4_LABEL = new THREE.MeshStandardMaterial({ map: C4_TEX, roughness: 0.42, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -2 });
function makeC4(cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.279, 0.051, 0.076, 3, 0.005), C4_FILM); g.add(b);
  // folded film ends
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.044, 0.07), C4_FILM); f.position.x = s * 0.1385; g.add(f); for (let i = 0; i < 3; i++) vbox(0.002, 0.04, 0.0015, EXM.odDark, g, s * 0.1395, 0, -0.02 + i * 0.02); }
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.262, 0.07), C4_LABEL); lab.rotation.x = -Math.PI / 2; lab.position.y = 0.0256; g.add(lab);
  const lab2 = lab.clone(); lab2.rotation.x = Math.PI / 2; lab2.position.y = -0.0256; g.add(lab2);
  if (cap) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.036, 10), EXM.cap); c.rotation.z = Math.PI / 2; c.position.set(0.148, 0.004, 0.016); g.add(c);
    const crimp = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 10), EXM.cap); crimp.rotation.z = Math.PI / 2; crimp.position.set(0.158, 0.004, 0.016); g.add(crimp);
    const rx = new THREE.Mesh(new RoundedBoxGeometry(0.046, 0.026, 0.036, 2, 0.004), EXM.odDark); rx.position.set(0.186, 0.009, 0.012); g.add(rx);
    vbox(0.03, 0.002, 0.02, EXM.ink, g, 0.186, 0.0225, 0.012);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0022, 0.07, 6), EXM.ink); ant.position.set(0.2, 0.05, 0.022); ant.rotation.z = -0.25; g.add(ant);
    const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.005, 8), EXM.fuze); sw.rotation.x = Math.PI / 2; sw.position.set(0.175, 0.012, 0.031); g.add(sw);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a10 })); led.position.set(0.198, 0.023, 0.004); g.add(led); g.userData.led = led;
    // tape holding the initiator on
    for (const x of [0.17, 0.2]) vbox(0.012, 0.03, 0.04, EXM.tape, g, x, 0.008, 0.012);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// ---- the remote firing device: a ruggedised transmitter. Arm switch under a flip-up red cover, the fire button beside it,
// a ready lamp, a stubby rubber antenna.
function makeRemote() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.056, 0.104, 0.03, 3, 0.007), EXM.rem); g.add(body);
  for (const s of [-1, 1]) { const grip = new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.07, 0.026, 2, 0.002), EXM.rubber); grip.position.set(s * 0.028, -0.012, 0); g.add(grip); }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.058, 8), EXM.rubber); ant.position.set(-0.016, 0.08, -0.002); g.add(ant);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), EXM.rubber); tip.position.set(-0.016, 0.109, -0.002); g.add(tip);
  vbox(0.04, 0.03, 0.002, EXM.panel, g, 0, 0.025, 0.0152);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 16), EXM.red); btn.rotation.x = Math.PI / 2; btn.position.set(0.0, 0.022, 0.017); g.add(btn);
  const coverP = new THREE.Group(); coverP.position.set(0, 0.04, 0.018); g.add(coverP);
  vbox(0.026, 0.03, 0.004, EXM.redT, coverP, 0, -0.016, 0.003);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff40 })); lamp.position.set(0.018, 0.044, 0.0155); g.add(lamp);
  const key = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 10), EXM.fuze); key.rotation.x = Math.PI / 2; key.position.set(-0.014, -0.012, 0.016); g.add(key);
  vbox(0.03, 0.012, 0.001, EXM.label, g, 0.006, -0.03, 0.0152);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { g, cover: coverP, btn, lamp };
}
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
function fragsAt(p, meshes, nFrag, area, owner, apply, vs) {
  vs = vs || 1;
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
    apply(h, dir, 520 * vs * Math.exp(-h.distance / 15) * rnd(0.8, 1.2), h.distance);
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
// What the blast wave does to a body, by scaled distance Z (m / kg^1/3, already lengthened for cover). The same physics for
// C4 and the grenade; the grenade's small charge just puts every band much closer in.
//   contact or Z < 0.45: the body comes apart (head, all four limbs, the torso opened)
//   Z < 0.9: dead, two or three limbs torn off
//   Z < 1.6: dead from overpressure (lungs, brain), a limb sometimes off
//   Z < 2.4: half the time dead, otherwise blast lung and thrown down
//   Z < 4: thrown down with lung injury and burst eardrums
function blastFate(z, contact, kind) {
  if (contact || z < 0.45) return { kill: 1, limbs: 4, gore: 3 };
  if (z < 0.9) return { kill: 1, limbs: 2 + (Math.random() < 0.5 ? 1 : 0), gore: 2 };
  if (z < 1.6) return { kill: 1, limbs: Math.random() < 0.4 ? 1 : 0, gore: 1 };
  if (z < 2.4) return Math.random() < 0.5 ? { kill: 1 } : { lung: 14 * (2.4 - z) + 6, down: 1 };
  if (z < 4) return { lung: 2 + 2 * (4 - z), down: Math.random() < 0.7 ? 1 : 0, stun: 0.6 };
  if (z < 7) return { stun: 0.3 };
  return {};
}
function blastGore(c, dir, lvl, skin) {
  if (lvl >= 3) { spawnGore(c, dir, 'flesh', 24, 9, 0.9, 0.05, skin); spawnGore(c, dir, 'bone', 10, 9, 0.9, 0.03, skin); spawnGore(c, dir, 'gut', 6, 6, 0.8, 0.035, skin); spawnGore(c, dir, 'lung', 3, 6, 0.7, 0.04, skin); spawnGore(c, dir, 'liver', 2, 5, 0.6, 0.04, skin); }
  else if (lvl === 2) { spawnGore(c, dir, 'flesh', 10, 7, 0.8, 0.04, skin); spawnGore(c, dir, 'bone', 5, 7, 0.8, 0.025, skin); spawnGore(c, dir, 'gut', 1, 4, 0.6, 0.03, skin); }
  else if (lvl === 1) { spawnGore(c, dir, 'flesh', 3, 5, 0.7, 0.03, skin); spawnGore(c, dir, 'bone', 1, 5, 0.7, 0.02, skin); }
}
function applyFate(an, F, kind) {
  if (F.gib) an.gibHead = true;
  if (F.limbs) blastLimbs(an, null, F.limbs);
  if (F.lung) { an.shock = (an.shock || 0) + 40 + F.lung * 2; an.pain = Math.min(1, (an.pain || 0) + 0.5); an.wounds.push({ region: 'chest', name: 'Blast injury (lungs)', rate: F.lung, treated: false }); an.version++; }
  if (F.kill) an.kill('blast');
}
// the blocks of trunk and head the blast reaches are blown out: anything inside about 0.4 m of a C4 block, 0.2 m of a grenade
function blastChunks(root, p, cW, kind, an, dir, skin) {
  // the side of the body facing the blast goes first: a block on the far side only goes if its near-side twin is close enough
  // to be gone well inside the radius, so a body is blown open, not punched clean through, unless the charge was on it
  const R = (kind === 'c4' ? 0.42 : 0.45) * cW, cs = chunkCenters(root), dist = new Map();
  for (const c of cs) dist.set(c.k + c.i, c.p.distanceTo(p));
  const twin = c => { const G = CHK[c.k], NN = G.nx * G.ny; return c.k + (c.i < NN ? c.i + NN : c.i - NN); };
  const ch = destroyChunks(root, c => { const d = dist.get(c.k + c.i), dt = dist.get(twin(c)); const far = dt !== undefined && dt < d; return (far ? d + 0.12 : d) < R * rnd(0.85, 1.15); }, dir, skin);
  if (an && ch.t + ch.h) {
    if (ch.h) an.wounds.push({ region: 'head', name: 'Head blown apart', rate: 150, treated: false, artery: 1 });
    if (ch.t) an.wounds.push({ region: 'chest', name: 'Torso blown open', rate: 150, treated: false, artery: 1 });
    an.version++; if (!an.dead) an.kill(ch.h ? 'brain' : 'blast');
    if (chunkCount(root, 'H') >= 13) an.gibHead = true;
  }
  return ch;
}
function blastBodies(p, kind, owner, isOwner, onBody) {
  const E = EXPL[kind], cW = Math.cbrt(E.W), shot = { hits: new Map() };
  // fragments: the grenade's steel body; for C4, what the blast tears off whatever it sat on (concrete, wood, or bone when it was on a person)
  const nF = E.frags || (onBody ? 140 : 260), vs = E.frags ? 1.15 : onBody ? 0.4 : 0.5;
  // the local player, on every client: nobody else can know where you stand
  if (P.alive) {
    const tgt = P.downed && P.rag ? null : localBody.hitMeshes.filter(m => m.visible);
    const c = P.pos.clone().setY(P.downed ? 0.3 : P.pos.y + (P.prone > 0.5 ? 0.25 : 0.95)), d = Math.max(0.1, c.distanceTo(p)), cover = !los(p, c);
    const z = d / cW * (cover ? 1.7 : 1), an = P.anat, dir = c.clone().sub(p).setY(Math.max(0.1, c.y - p.y)).normalize();
    an.lastBy = owner; an.lastDir.copy(dir); an.lastDist = d;
    let res = null;
    if (tgt) {
      localBody.root.updateMatrixWorld(true);
      fragsAt(p, tgt, nF, 0, owner, (h, fd, v) => {
        if (an.dead) return;
        const info = hitToFrame(localBody, h.object, h.point, fd); an.lastDir.copy(fd);
        fragGore(h, fd, v); an.frag = true; const r = an.hit(info.frame, info.e, info.d, v, 5, info.armor, info.pd); an.frag = false; if (!res || (r && r.blast)) res = r;
      }, vs);
    }
    if (P.downed && P.rag) fragsAt(p, ragMeshes(P.rag), nF, 0, owner, (h, fd, v, L) => fragHit(h, fd, v, L, shot, p), vs);
    const wasDead = an.dead; blastChunks(P.rag ? P.rag.group : localBody.root, p, cW, kind, an, dir);
    const F = blastFate(z, onBody && d < 0.6, kind); applyFate(an, F, kind);
    if (F.gore && !wasDead) blastGore(c, dir, F.gore);
    if (F.down && !an.dead) res = Object.assign(res || {}, { blast: { big: true } });
    if (F.stun) P.stun = Math.max(P.stun || 0, F.stun);
    if (z < 7) deafen(clamp(1 - z / 7, 0, 1));
    P.vel.addScaledVector(dir, clamp(6 / (z * z), 0, 10));
    if (res || an.dead) onSelfHurt(res || {});
    if (P.rag) ragPush(P.rag, p, clamp(12 / (z * z), 0, 18));
  }
  if (!isOwner) return;
  // the AI bodies and bodies on the ground: worked out once, by whoever set it off
  for (const dm of dummies) {
    if (dm.dead && !dm.rag) continue;
    const c = (dm.rag ? dm.rag.p[1] : dm.hum.root.position.clone().setY(0.95)).clone(), d = Math.max(0.1, c.distanceTo(p)); if (d > 60) continue;
    const z = d / cW * (los(p, c) ? 1 : 1.7), an = dm.anat, dir = c.clone().sub(p).setY(0.3).normalize();
    const ms = dm.rag ? ragMeshes(dm.rag) : (dm.hum.root.updateMatrixWorld(true), dm.hum.hitMeshes.filter(m => m.visible));
    fragsAt(p, ms, nF, 0, owner, (h, fd, v, L) => fragHit(h, fd, v, L, shot, p), vs);
    const croot = dm.rag ? dm.rag.group : dm.hum.root, ch = blastChunks(croot, p, cW, kind, dm.dead ? null : an, dir, dm.hum.pal && dm.hum.pal.skin);
    if (dm.dead && dm.rag && chunkCount(croot, 'H') >= 13 && dm.rag.headG.visible) dm.rag.gibHead(dir);
    const F = blastFate(z, onBody && d < 0.6, kind);
    if (dm.dead) {
      // a body already down still comes apart in a close blast
      if (F.limbs || F.gib) { const l0 = an.lostMask(); applyFate(an, Object.assign({}, F, { kill: 0, lung: 0 }), kind); if (an.lostMask() !== l0) dm.rag.applyLost(an.lostMask(), dir, an.cutArr()); if (an.gibHead && dm.rag.headG.visible) dm.rag.gibHead(dir); if (F.gore >= 2) blastGore(c, dir, F.gore - 1); }
      ragPush(dm.rag, p, clamp(12 / (z * z), 0, 18)); continue;
    }
    an.lastDir.copy(dir); an.lastW = 5; an.lastDist = d;
    applyFate(an, F, kind);
    if (F.gore) blastGore(c, dir, F.gore);
    if (an.dead) {
      if (!dm.credited) { dm.credited = true; S.testKills = (S.testKills || 0) + 1; killNotice('AI'); }
      if (dm.rag) dm.rag.applyLost(an.lostMask(), dir, an.cutArr()); else syncLost(dm.hum, an.lostMask(), dir, an.cutArr());
      dm.die(); if (an.gibHead && dm.rag && dm.rag.headG.visible) dm.rag.gibHead(dir);
    } else if (F.down) dm.blastFall(dir);
    if (dm.rag) ragPush(dm.rag, p, clamp(12 / (z * z), 0, 18));
  }
  // loose corpses (not a player's body still being simulated by its own client)
  for (const r of ragdolls) if (!r.owner || (!r.owner.dummy && !r.owner.nd && !r.owner.remote && r !== P.rag)) { const z = r.p[1].distanceTo(p) / cW; if (z < 7) { if (z < 1.5) { blastChunks(r.group, p, cW, kind, null, r.p[1].clone().sub(p).normalize(), r.skin); if (chunkCount(r.group, 'H') >= 13 && r.headG.visible) r.gibHead(r.p[0].clone().sub(p).normalize()); } ragPush(r, p, clamp(12 / (z * z), 0, 18)); } }
}
// a fragment into an AI body or a body on the ground: the normal hit code, with the anatomy told it is steel from a grenade
function fragGore(h, fd, v) {
  // every fragment that strikes tears a bit out: torn flesh and blood, now and then a splinter of bone
  if (Math.random() < 0.75) spawnGore(h.point, fd, 'flesh', 1 + (v > 300 && Math.random() < 0.5 ? 1 : 0), 2 + v / 150, 0.6, 0.012 + v / 40000);
  if (Math.random() < 0.18) spawnGore(h.point, fd, 'bone', 1, 3, 0.6, 0.008);
  bloodFx(h.point, fd, Math.random() < 0.5, 0.6);
}
function fragHit(h, fd, v, L, shot, p) {
  fragGore(h, fd, v);
  const ud = h.object.userData, own = ud.rag ? ud.rag.owner || {} : {}, an = ud.hum && ud.hum.dummy ? ud.hum.dummy.anat : own.dummy ? own.dummy.anat : own.anat || null;
  if (an) an.frag = true;
  try { onBulletHit({ vel: fd.clone().multiplyScalar(v), w: 5, local: true, shot, dist: L, pos: p.clone() }, h, fd, L); } finally { if (an) an.frag = false; }
}
function ragMeshes(r) { const out = []; r.group.traverse(o => { if (o.isMesh && o.visible && o.userData.rag) out.push(o); }); return out; }
// ---------------------------------------------------------------- the explosion
function explode(p, kind, owner, isOwner, n, onBody) {
  const E = EXPL[kind]; n = n || new V3(0, 1, 0);
  boomVisual(p, n, E.W, kind);
  blastWalls(p, E.W, owner);
  // fragments flying everywhere: they chip and hole walls and crates (bodies are worked out above, hit by hit)
  if (E.frags) for (let i = 0; i < 110; i++) {
    const d = new V3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize(); spawnBullet(p.clone().addScaledVector(d, 0.05), d, 5, false, false, owner, null);
    const b = bullets[bullets.length - 1]; b.vel.setLength(rnd(500, 900)); b.drag *= 6; b.frag = true;
  }
  blastBodies(p, kind, owner, isOwner, onBody);
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
function removeCharge(c) { const i = CHARGES.indexOf(c); if (i >= 0) CHARGES.splice(i, 1); if (c.g.parent) chargePos(c); }
function detonateCharge(c, already) {
  if (!already) removeCharge(c);
  if (c.g.parent) chargePos(c); const host = c.host;
  if (c.g.parent) c.g.parent.remove(c.g);
  if (host && host.userData) c.onBody = true;
  if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'c4', i: c.id, p: c.p.toArray().map(r3), n: c.n.toArray().map(r3), ob: c.onBody ? 1 : 0 });
  explode(c.p.clone(), 'c4', S.myIdOr0(), true, c.n, c.onBody);
}
const r3 = x => Math.round(x * 1000) / 1000;
// ---------------------------------------------------------------- grenades in flight: bounce, roll, then go off
// A rigid body: 400 g, 63.5 mm across, treated as a solid ball for inertia (I = 2/5 m r^2). Every contact is resolved with
// impulses at the contact point: a bounce (restitution by surface, none for a slow touch), and Coulomb friction (mu by
// surface) that turns sliding into rolling, so spin and travel stay coupled and a backspun throw checks up on landing.
// Air drag (Cd 0.5) is applied in flight. On the ground the fuze head and spoon make it an uneven ball: it rolls with
// high rolling resistance, curves toward its narrow end, and wobbles a little as it slows. Bodies standing in the way
// are hit too, so a grenade can bounce off someone's legs.
const NADE_M = 0.4, NADE_I = 0.4 * NADE_M * NADE_R * NADE_R, NADE_DRAG = 0.5 * 1.2 * 0.5 * Math.PI * NADE_R * NADE_R / NADE_M;
const SURF_PHYS = { metal: [0.5, 0.25], concrete: [0.42, 0.55], drywall: [0.3, 0.6], plywood: [0.33, 0.5], crate: [0.33, 0.5], wood: [0.33, 0.5], ground: [0.32, 0.65], body: [0.12, 0.8] };
function throwNade(owner, id, p, v, fuse, local, w, curl) {
  const n = makeFrag(); n.pin.visible = false; n.spoon.visible = false; n.g.position.copy(p); scene.add(n.g);
  const o = { g: n.g, p: p.clone(), v: v.clone(), w: w ? w.clone() : new V3(rnd(-12, 12), rnd(-6, 6), rnd(-12, 12)), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6))), fuse, owner, id, local, t: 0, curl: curl === undefined ? rnd(-0.12, 0.12) : curl, ground: false };
  NADES.push(o); return o;
}
// one contact: normal n (out of the surface), surface kind for restitution and friction
const _ncv = new V3(), _rc = new V3(), _tv = new V3();
function nadeImpulse(o, n, kind) {
  const [e0, mu] = SURF_PHYS[kind] || SURF_PHYS.concrete;
  _rc.copy(n).multiplyScalar(-NADE_R);                                   // centre to contact point
  _ncv.copy(o.w).cross(_rc).add(o.v);                                      // velocity of the contact point
  const vn = _ncv.dot(n); if (vn >= 0) return;
  const e = vn < -0.9 ? e0 * clamp(1.05 - (-vn) * 0.035, 0.45, 1) : 0, Jn = -(1 + e) * vn * NADE_M;
  // a hard landing on an uneven body: the fuze or spoon digs in and it tumbles, losing a good share of its run
  if (vn < -2) { const k = clamp(1 + (vn + 2) * 0.035, 0.6, 1), vnn = o.v.dot(n); o.v.addScaledVector(n, -vnn).multiplyScalar(k).addScaledVector(n, vnn); o.w.multiplyScalar(k); }
  o.v.addScaledVector(n, Jn / NADE_M);
  if (-vn > 1.2) o.hitV = Math.max(o.hitV || 0, -vn), o.hitK = kind;
  // friction: the impulse that would stop the contact point slipping, capped by mu * Jn
  _tv.copy(_ncv).addScaledVector(n, -vn); const vt = _tv.length();
  if (vt > 1e-5) {
    const Jreq = vt / (1 / NADE_M + NADE_R * NADE_R / NADE_I), Jt = Math.min(Jreq, mu * Jn);
    _tv.multiplyScalar(-Jt / vt);                                         // friction impulse vector
    o.v.addScaledVector(_tv, 1 / NADE_M);
    o.w.add(_rc.clone().cross(_tv).multiplyScalar(1 / NADE_I));
  }
}
function nadeCollide(o) {
  const r = NADE_R, p = o.p;
  if (p.y < r) { p.y = r; nadeImpulse(o, _up, 'ground'); o.ground = true; }
  for (const c of colliders) {
    if (p.x + r < c.min.x || p.x - r > c.max.x || p.y + r < c.min.y || p.y - r > c.max.y || p.z + r < c.min.z || p.z - r > c.max.z) continue;
    if (c.mesh && gridOpenW(c.mesh, p)) continue;
    // closest point on the box: faces, edges and corners all give the right normal
    const q = new V3(clamp(p.x, c.min.x, c.max.x), clamp(p.y, c.min.y, c.max.y), clamp(p.z, c.min.z, c.max.z)), d = p.distanceTo(q);
    let n, pen;
    if (d > 1e-6) { if (d >= r) continue; n = p.clone().sub(q).multiplyScalar(1 / d); pen = r - d; }
    else {
      const P_ = [[p.x - c.min.x, -1, 0], [c.max.x - p.x, 1, 0], [p.y - c.min.y, -1, 1], [c.max.y - p.y, 1, 1], [p.z - c.min.z, -1, 2], [c.max.z - p.z, 1, 2]];
      let b = P_[0]; for (const x of P_) if (x[0] < b[0]) b = x; n = new V3().setComponent(b[2], b[1]); pen = b[0] + r;
    }
    p.addScaledVector(n, pen);
    const kind = c.mesh ? c.mesh.userData.kind || 'concrete' : 'concrete';
    nadeImpulse(o, n, kind === 'crate' ? 'wood' : kind);
    if (n.y > 0.7) o.ground = true;
  }
  // people standing in the way: an upright capsule per body
  for (const h of nadeBodies(o)) {
    const by = clamp(p.y, 0.1, h.top), dx = p.x - h.x, dz = p.z - h.z, dy = p.y - by, d = Math.hypot(dx, dy, dz), rr = h.r + r;
    if (d >= rr || d < 1e-5) continue;
    const n = new V3(dx, dy, dz).multiplyScalar(1 / d); p.addScaledVector(n, rr - d); nadeImpulse(o, n, 'body');
  }
}
const _up = new V3(0, 1, 0);
function nadeBodies(o) {
  const out = [];
  for (const d of dummies) if (!d.dead && !d.rag && d.hum.root.visible) { const q = d.hum.root.position; if (Math.abs(q.x - o.p.x) < 1 && Math.abs(q.z - o.p.z) < 1) out.push({ x: q.x, z: q.z, top: /prone|crawl/.test(d.anim) ? 0.3 : /crouch/.test(d.anim) ? 1.1 : 1.6, r: /prone|crawl/.test(d.anim) ? 0.2 : 0.2 }); }
  if (S.remotes) for (const r of S.remotes.values()) if (r.alive && r.hum && r.hum.root.visible) { const q = r.hum.root.position; if (Math.abs(q.x - o.p.x) < 1 && Math.abs(q.z - o.p.z) < 1) out.push({ x: q.x, z: q.z, top: 1.6, r: 0.2 }); }
  if (P.alive && !P.downed && o.t > 0.35 && Math.abs(P.pos.x - o.p.x) < 1 && Math.abs(P.pos.z - o.p.z) < 1) out.push({ x: P.pos.x, z: P.pos.z, top: P.prone > 0.5 ? 0.3 : P.crouch > 0.5 ? 1.1 : 1.6, r: 0.2 });
  return out;
}
const _nwq = new THREE.Quaternion();
function updateNades(dt) {
  for (let i = NADES.length - 1; i >= 0; i--) {
    const o = NADES[i]; o.t += dt; o.fuse -= dt;
    const n = clamp(Math.ceil(Math.max(o.v.length() * dt / 0.01, dt * 240)), 1, 40), h = dt / n;
    let onGround = false;
    for (let s = 0; s < n; s++) {
      const sp = o.v.length();
      o.v.y -= 9.81 * h; if (!o.ground) o.v.addScaledVector(o.v, -NADE_DRAG * sp * h);
      o.p.addScaledVector(o.v, h);
      o.ground = false; nadeCollide(o); onGround = onGround || o.ground;
      if (o.ground) {
        // rolling: an uneven ball loses speed fast, curls toward the fuze end, and stops
        const hv = Math.hypot(o.v.x, o.v.z);
        if (hv > 0.02) {
          const dec = Math.min(hv, 9.81 * 0.4 * h), k = (hv - dec) / hv; o.v.x *= k; o.v.z *= k;
          const side = new V3(-o.v.z, 0, o.v.x).multiplyScalar(1 / Math.max(hv, 1e-4)); o.v.addScaledVector(side, o.curl * hv * hv * h);
          o.w.multiplyScalar(Math.max(0, 1 - 2.5 * h));
          // the lumps knock it about a little
          if (Math.random() < 6 * h * Math.min(1, hv)) { o.v.y += rnd(0, 0.25) * Math.min(1, hv); o.v.x += rnd(-0.08, 0.08) * hv; o.v.z += rnd(-0.08, 0.08) * hv; }
        } else { o.v.x = 0; o.v.z = 0; o.w.multiplyScalar(Math.max(0, 1 - 12 * h)); }
      }
      // turn by the spin
      const wl = o.w.length(); if (wl > 1e-4) { _nwq.setFromAxisAngle(o.w.clone().multiplyScalar(1 / wl), wl * h); o.q.premultiply(_nwq); }
    }
    o.ground = onGround;
    if (o.hitV) { const k = o.hitK, dist = camera.position.distanceTo(o.p), vol = clamp(o.hitV * 0.035, 0, 0.3) / (1 + dist * 0.1); if (k === 'metal') { noiseHit(rnd(2600, 3400), 0.07, vol); blip(rnd(1700, 2300), 0.06, vol * 0.25, 'triangle'); } else if (k === 'body') noiseHit(rnd(400, 700), 0.05, vol * 0.7); else noiseHit(rnd(1400, 2600), 0.04, vol); o.hitV = 0; }
    o.g.position.copy(o.p); o.g.quaternion.copy(o.q);
    if (o.fuse <= 0) {
      if (o.local) { if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'frag', i: o.id, p: o.p.toArray().map(r3) }); explode(o.p.clone(), 'frag', o.owner, true); }
      if (o.local || o.fuse < -4) { scene.remove(o.g); NADES.splice(i, 1); }
    }
  }
  updateSpoons(dt);
}
// the spoon flies off when it is let go, spinning, and lies where it lands
const SPOONS = [];
function flySpoon(p, v) {
  const g = new THREE.Group(); vbox(0.0025, 0.07, 0.013, EXM.spoon, g, 0, 0, 0); vbox(0.022, 0.0025, 0.013, EXM.spoon, g, -0.01, 0.035, 0); g.position.copy(p); scene.add(g);
  SPOONS.push({ g, v: v.clone(), w: new V3(rnd(-30, 30), rnd(-30, 30), rnd(-30, 30)), t: 0, rest: false });
}
function updateSpoons(dt) {
  for (let i = SPOONS.length - 1; i >= 0; i--) {
    const s = SPOONS[i]; s.t += dt;
    if (!s.rest) {
      s.v.y -= 9.81 * dt; s.v.multiplyScalar(Math.exp(-dt * 0.8)); s.g.position.addScaledVector(s.v, dt);
      s.g.rotation.x += s.w.x * dt; s.g.rotation.y += s.w.y * dt; s.g.rotation.z += s.w.z * dt;
      const fy = floorAt(s.g.position.x, s.g.position.y, s.g.position.z) + 0.004;
      if (s.g.position.y < fy) { s.g.position.y = fy; if (Math.abs(s.v.y) > 1) { s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); noiseHit(4200, 0.02, 0.04); } else { s.rest = true; s.g.rotation.set(Math.PI / 2, s.g.rotation.y, 0); } }
    }
    if (s.t > 30) { scene.remove(s.g); SPOONS.splice(i, 1); }
  }
}
// ---------------------------------------------------------------- held: the grenade
// Left button pulls the pin (the off hand hooks the ring and draws it) and keeps the spoon held; letting go throws overhand.
// Right button the same, underhand (a short lob or a roll). R with the pin out lets the spoon fly while you still hold it:
// the fuse is burning ("cooking"). A throw leaves the hand exactly along the line of sight, from a point on it, so it goes
// where the crosshair is; gravity then brings it down.
const FRAG_V = { over: 17, under: 7 }, C4_V = 11;
function nadeReset() { P.nade = { ph: 'idle', t: 0, btn: 0, fuse: 0, cook: false, pinOut: false, spoonOff: false, inHand: true, draw: P.nade ? 0.45 : 0 }; }
function throwOrigin(d) { return camera.position.clone().addScaledVector(d, 0.45); }
function updateFrag(dt) {
  const N = P.nade || (nadeReset(), P.nade); N.t += dt; N.draw = Math.max(0, N.draw - dt);
  if (N.cook) { N.fuse -= dt; if (N.fuse <= 0) { const hp = camera.position.clone().add(new V3(0.12, -0.15, -0.3).applyQuaternion(camera.quaternion)); N.cook = false; P.fragN = Math.max(0, P.fragN - 1); nadeReset(); if (S.mode === 'online') net.send({ t: 'x', a: 'boom', k: 'frag', i: 0, p: hp.toArray().map(r3) }); explode(hp, 'frag', S.myIdOr0(), true); return; } }
  if (N.ph === 'idle') {
    N.inHand = P.fragN > 0;
    if (P.fragN <= 0) { if (N.t > 0.3) selectEmpty(3); return; }
    if (P.switchT <= 0 && N.draw <= 0 && S.locked && (mouse.left || mouse.right)) { N.ph = 'pin'; N.t = 0; N.btn = mouse.left ? 0 : 2; }
  } else if (N.ph === 'pin') {
    if (N.t > 0.3 && !N.pinOut) { N.pinOut = true; noiseHit(3800, 0.05, 0.12); blip(2400, 0.03, 0.03, 'triangle'); }
    if (N.t > 0.42 && !N.pinDropped) { N.pinDropped = true; const q = camera.quaternion; flyPin(camera.position.clone().add(new V3(-0.2, -0.12, -0.42).applyQuaternion(q)), new V3(-0.6, 0.3, 0).applyQuaternion(q).add(P.vel)); }
    if (N.t > 0.5) { N.ph = 'ready'; N.t = 0; }
  } else if (N.ph === 'ready') {
    if (!(N.btn === 0 ? mouse.left : mouse.right)) { N.ph = 'throw'; N.t = 0; }
  } else if (N.ph === 'throw') {
    if (N.t > 0.13 && N.inHand) {
      N.inHand = false;
      const q = camera.quaternion, fwd = new V3(0, 0, -1).applyQuaternion(q), over = N.btn === 0, speed = over ? FRAG_V.over : FRAG_V.under;
      const p0 = throwOrigin(fwd), v = fwd.clone().multiplyScalar(speed), fuse = N.cook ? N.fuse : rnd(4, 5.5), id = explSeq++;
      // spin: overhand it leaves the fingertips with backspin; underhand it is bowled with forward roll
      const side = new V3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
      const w = side.multiplyScalar(over ? rnd(8, 16) : -rnd(0.5, 0.8) * speed / NADE_R * 0.35).add(new V3(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3))), curl = rnd(-0.12, 0.12);
      throwNade(S.myIdOr0(), id, p0, v, fuse, true, w, curl);
      if (S.mode === 'online') net.send({ t: 'x', a: 'nade', i: id, p: p0.toArray().map(r3), v: v.toArray().map(r3), f: r3(fuse), w: w.toArray().map(r3), c: r3(curl) });
      if (!N.cook) { blip(3000, 0.04, 0.05, 'triangle'); flySpoon(p0.clone(), v.clone().multiplyScalar(0.3).add(new V3(rnd(-1, 1), rnd(2, 3.5), rnd(-1, 1)))); }      // the spoon flies off
      noiseHit(700, 0.12, 0.06); N.cook = false; P.fragN = Math.max(0, P.fragN - 1);
    }
    if (N.t > 0.6) { nadeReset(); P.nade.t = 0; }
  }
}
addEventListener('keydown', e => {
  if (e.code === 'KeyR' && P.slot === 3 && P.nade && (P.nade.ph === 'ready' || (P.nade.ph === 'pin' && P.nade.pinOut)) && !P.nade.cook) { P.nade.cook = true; P.nade.spoonOff = true; P.nade.fuse = rnd(4, 5.5); flySpoon(camera.position.clone().add(new V3(0.12, -0.1, -0.3).applyQuaternion(camera.quaternion)), new V3(rnd(-1, 1), rnd(2, 3), rnd(-1, 1)).add(P.vel)); blip(3000, 0.04, 0.05, 'triangle'); flashMsg('SPOON RELEASED<small>The fuse is burning</small>', 900); }
});
addEventListener('mousedown', e => { if (e.button === 2) mouse.right = true; });
addEventListener('mouseup', e => { if (e.button === 2) mouse.right = false; });
// leaving the slot with the pin out: an uncooked grenade gets its pin back; a cooked one is dropped where you stand
function nadeAbandon() {
  const N = P.nade; if (!N || N.ph === 'idle') return;
  if (N.cook) { const p0 = P.pos.clone().setY(0.6); throwNade(S.myIdOr0(), explSeq++, p0, new V3(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)), N.fuse, true); P.fragN = Math.max(0, P.fragN - 1); flashMsg('LIVE GRENADE DROPPED', 1500); }
  nadeReset();
}
// the pin and ring, dropped once they are pulled
function flyPin(p, v) {
  const g = new THREE.Group(), r = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0014, 6, 22), EXM.ring); g.add(r);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.034, 6), EXM.ring); b.position.x = 0.026; b.rotation.z = Math.PI / 2; g.add(b);
  g.position.copy(p); scene.add(g); SPOONS.push({ g, v: v.clone(), w: new V3(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20)), t: 0, rest: false });
}
// ---------------------------------------------------------------- held: C4 and the remote firing device
// Left button throws a block underhand-overhand like a brick; its adhesive face takes on whatever it lands on: wall, floor,
// crate, or a person, and it rides along on them. Right button (or left with no blocks left) arms and fires every charge you
// have out.
function c4Mine() { const me = S.myIdOr0(); return CHARGES.filter(c => c.owner === me).concat(C4_FLY.filter(c => c.owner === me)); }
function updateC4(dt) {
  const C = P.c4 || (P.c4 = { ph: 'idle', t: 0, draw: 0, inHand: true }); C.t += dt; C.draw = Math.max(0, (C.draw || 0) - dt);
  const mine = c4Mine(), haveBlock = P.c4N > 0;
  if (C.ph === 'idle') {
    C.inHand = haveBlock;
    if (!haveBlock && !mine.length) { if (C.t > 0.3) selectEmpty(2); return; }
    if (P.switchT > 0 || !S.locked || C.draw > 0) return;
    if (mouse.left && haveBlock && P.semiReady) { P.semiReady = false; C.ph = 'throw'; C.t = 0; }
    else if ((mouse.right || (mouse.left && !haveBlock && P.semiReady)) && mine.length) { P.semiReady = false; C.ph = 'det'; C.t = 0; C.fired = false; }
  } else if (C.ph === 'throw') {
    if (C.t > 0.17 && C.inHand) {
      C.inHand = false;
      const q = camera.quaternion, fwd = new V3(0, 0, -1).applyQuaternion(q), p0 = throwOrigin(fwd), v = fwd.clone().multiplyScalar(C4_V), id = explSeq++;
      const w = new V3(1, 0, 0).applyQuaternion(q).multiplyScalar(rnd(4, 8)).add(new V3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)));
      throwC4(S.myIdOr0(), id, p0, v, w, true); P.c4N--; noiseHit(500, 0.1, 0.07);
      if (S.mode === 'online') net.send({ t: 'x', a: 'c4t', i: id, p: p0.toArray().map(r3), v: v.toArray().map(r3), w: w.toArray().map(r3) });
    }
    if (C.t > 0.6) { C.ph = 'idle'; C.t = 0; C.draw = haveBlock ? 0.45 : 0; }
  } else if (C.ph === 'det') {
    // flip the cover, press the button
    if (C.t > 0.1 && !C.cov) { C.cov = true; blip(1400, 0.02, 0.04, 'square'); }
    if (C.t > 0.3 && !C.fired) { C.fired = true; noiseHit(1800, 0.02, 0.1); blip(900, 0.06, 0.05, 'square'); for (const c of mine) { if (C4_FLY.includes(c)) { c.boomNow = true; continue; } removeCharge(c); setTimeout(() => detonateCharge(c, true), rnd(0, 40)); } }
    if (C.t > 0.65) { C.ph = 'idle'; C.t = 0; C.cov = false; }
  }
}
// ---------------------------------------------------------------- C4 in flight, and sticking
const C4_FLY = [];
function throwC4(owner, id, p, v, w, local) {
  const g = makeC4(true); g.position.copy(p); scene.add(g);
  C4_FLY.push({ g, p: p.clone(), v: v.clone(), w: w.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(v.x, v.z) + Math.PI / 2, 0)), owner, id, local, t: 0 });
}
// everything a thrown block can land on: the world, standing people and bodies on the ground (not yourself as it leaves)
function stickTargets(o) {
  const out = worldMeshes.slice();
  for (const d of dummies) { if (d.rag) out.push(...ragMeshes(d.rag)); else if (d.hum.root.visible) out.push(...d.hum.hitMeshes.filter(m => m.visible)); }
  if (S.remotes) for (const r of S.remotes.values()) if (r.hum && r.hum.root.visible) out.push(...r.hum.hitMeshes.filter(m => m.visible));
  for (const r of ragdolls) if (!r.owner || !r.owner.dummy) out.push(...ragMeshes(r));
  if (o.t > 0.4 && P.alive && localBody) out.push(...localBody.hitMeshes.filter(m => m.visible));
  return out;
}
const _c4r = new THREE.Raycaster();
function updateC4Fly(dt) {
  for (let i = C4_FLY.length - 1; i >= 0; i--) {
    const o = C4_FLY[i]; o.t += dt;
    const sp = o.v.length(); o.v.y -= 9.81 * dt; o.v.multiplyScalar(1 - 0.012 * sp * dt);
    const step = o.v.clone().multiplyScalar(dt), L = step.length(), dir = step.clone().multiplyScalar(1 / Math.max(L, 1e-6));
    let hit = null;
    // someone else's throw only flies here: where it sticks comes from them
    if (!o.local) { if (o.p.y + step.y < 0.026) { o.v.set(0, 0, 0); step.set(0, 0, 0); } if (o.t > 3) { scene.remove(o.g); C4_FLY.splice(i, 1); continue; } }
    else {
      _c4r.set(o.p, dir); _c4r.far = L + 0.03;
      for (const h of _c4r.intersectObjects(stickTargets(o), false)) { if (h.object.userData.grid && gridOpenW(h.object, h.point.clone().addScaledVector(dir, 0.01))) continue; hit = h; break; }
    }
    const ny = o.p.y + step.y;
    if (o.local && !hit && ny <= 0.026) { const k = (o.p.y - 0.026) / Math.max(1e-5, -step.y); hit = { point: o.p.clone().addScaledVector(step, clamp(k, 0, 1)).setY(0), ground: true }; }
    if (hit || o.boomNow || o.t > 20) {
      C4_FLY.splice(i, 1);
      if (!hit) { scene.remove(o.g); if (o.boomNow && o.local) { const c = { g: o.g, p: o.p.clone(), n: new V3(0, 1, 0), owner: o.owner, id: o.id }; detonateCharge(c, true); } continue; }
      const c = stickCharge(o, hit, dir);
      if (o.local && S.mode === 'online') net.send(Object.assign({ t: 'x', a: 'c4p', i: o.id, p: c.p.toArray().map(r3), n: c.n.toArray().map(r3) }, c.net || {}));
      if (o.boomNow && o.local) { removeCharge(c); detonateCharge(c, true); }
      continue;
    }
    o.p.add(step); const wl = o.w.length(); if (wl > 1e-4) o.q.premultiply(_nwq.setFromAxisAngle(o.w.clone().multiplyScalar(1 / wl), wl * dt));
    o.g.position.copy(o.p); o.g.quaternion.copy(o.q);
  }
}
// lay the block flat on what it hit, adhesive face down, long side along the way it was travelling; on a body it is carried
function stickCharge(o, h, dir) {
  const n = h.ground ? new V3(0, 1, 0) : h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize() : dir.clone().negate();
  if (n.dot(dir) > 0) n.negate();
  const along = dir.clone().addScaledVector(n, -dir.dot(n)); if (along.lengthSq() < 1e-4) along.set(1, 0, 0).addScaledVector(n, -n.x); along.normalize();
  const g = o.g, side = new V3().crossVectors(along, n);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, n, side)); g.rotateY(rnd(-0.25, 0.25));
  g.position.copy(h.point).addScaledVector(n, 0.0255);
  noiseHit(h.object && h.object.userData.hum ? 380 : 650, 0.06, 0.09 / (1 + camera.position.distanceTo(g.position) * 0.1));
  const c = { g, p: g.position.clone(), n: n.clone(), owner: o.owner, id: o.id, t: 0 };
  if (h.object && !worldMeshes.includes(h.object)) {
    h.object.updateMatrixWorld(true); h.object.attach(g); c.host = h.object;
    const ud = h.object.userData, hum = ud.hum, idx = hum ? hum.hitMeshes.indexOf(h.object) : -1;
    if (hum && hum.dummy) c.hostDummy = hum.dummy; if (ud.rag) c.hostRag = ud.rag;
    if (idx >= 0) { const who = hum === localBody ? S.myId : hum.remote ? hum.remote.id : null; if (who != null) c.net = { tg: who, tp: idx, lp: g.position.toArray().map(r4x), lq: g.quaternion.toArray().map(r4x) }; }
    if (hum === localBody) flashMsg('C4 STUCK ON YOU', 1800);
  }
  CHARGES.push(c); return c;
}
const r4x = x => Math.round(x * 10000) / 10000;
// a charge's position right now (it may be riding on someone)
function chargePos(c) { c.g.updateWorldMatrix(true, false); c.p.setFromMatrixPosition(c.g.matrixWorld); c.n.set(0, 1, 0).applyQuaternion(c.g.getWorldQuaternion(new THREE.Quaternion())); return c.p; }
function updateCharges(dt) {
  for (const c of CHARGES) {
    c.t += dt; const led = c.g.userData.led; if (led) led.visible = (c.t % 1.2) < 0.08;
    if (!c.host) continue;
    // the body it was on went limp: it is on the ragdoll now, wherever the same part ended up
    if (c.hostDummy && c.hostDummy.rag && !c.hostRag) {
      const at = chargePos(c).clone(); let best = null, bd = 1e9;
      for (const m of ragMeshes(c.hostDummy.rag)) { const d = m.getWorldPosition(_fv).distanceTo(at); if (d < bd) { bd = d; best = m; } }
      if (best) { best.updateMatrixWorld(true); best.attach(c.g); c.host = best; c.hostRag = c.hostDummy.rag; }
    }
    // the body is gone (respawned, removed): the charge drops where it was
    let alive = true; for (let o = c.host; o; o = o.parent) { if (o === scene) break; if (!o.parent) alive = false; }
    if (!alive || (c.hostDummy && !c.hostDummy.rag && c.hostRag)) { const at = chargePos(c).clone(); scene.attach(c.g); c.g.position.set(at.x, 0.0255, at.z); c.g.quaternion.identity(); c.host = null; c.hostDummy = null; }
  }
}
function updateExplosives(dt) {
  updateNades(dt); updateBoomFx(dt);
  updateC4Fly(dt); updateCharges(dt);
  if (P.slot !== 3 && P.nade && P.nade.ph !== 'idle') nadeAbandon();
  if (P.slot !== 2 && P.c4 && P.c4.ph !== 'idle') P.c4.ph = 'idle';
  if (P.nade && P.nade.cook && P.slot !== 3) nadeAbandon();
  // on the test range the crates of explosives never run dry: a few seconds after the last one is used, more are there
  if (S.mode === 'test' && P.alive) {
    if (P.c4N <= 0 && !c4Mine().length) { P.c4R = (P.c4R || 0) + dt; if (P.c4R > 4) { P.c4N = 2; P.c4R = 0; flashMsg('C4 RESTOCKED', 900); } } else P.c4R = 0;
    if (P.fragN <= 0 && !NADES.some(o => o.local)) { P.fragR = (P.fragR || 0) + dt; if (P.fragR > 4) { P.fragN = 3; P.fragR = 0; flashMsg('GRENADES RESTOCKED', 900); } } else P.fragR = 0;
  }
}
// ---------------------------------------------------------------- from the network
function onExplosiveMsg(m) {
  const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (m.a === 'chk') { chunkRx(m); return; }
  if (!ok(m.p)) return;
  const p = new V3().fromArray(m.p);
  if (m.a === 'c4p' && ok(m.n)) {
    for (let i = C4_FLY.length - 1; i >= 0; i--) if (C4_FLY[i].owner === m.id && C4_FLY[i].id === m.i) { scene.remove(C4_FLY[i].g); C4_FLY.splice(i, 1); }
    const hum = m.tg != null ? (m.tg === S.myId ? localBody : S.remotes.get(m.tg) && S.remotes.get(m.tg).hum) : null, host = hum && hum.hitMeshes[m.tp];
    if (host && Array.isArray(m.lp) && Array.isArray(m.lq) && m.lp.length === 3 && m.lq.length === 4) {
      const g = makeC4(true); host.add(g); g.position.fromArray(m.lp); g.quaternion.fromArray(m.lq);
      const c = { g, p: p.clone(), n: new V3().fromArray(m.n), owner: m.id, id: m.i, t: 0, host }; CHARGES.push(c);
      if (hum === localBody) flashMsg('C4 STUCK ON YOU', 2200);
    } else addCharge(m.id, m.i, p, new V3().fromArray(m.n).normalize());
  }
  else if (m.a === 'c4t' && ok(m.v)) throwC4(m.id, m.i, p, new V3().fromArray(m.v), ok(m.w) ? new V3().fromArray(m.w) : new V3(), false);
  else if (m.a === 'nade' && ok(m.v)) throwNade(m.id, m.i, p, new V3().fromArray(m.v), clamp(Number(m.f) || 4, 0, 6) + 0.5, false, ok(m.w) ? new V3().fromArray(m.w) : null, clamp(Number(m.c) || 0, -0.2, 0.2));
  else if (m.a === 'chk') chunkRx(m);
  else if (m.a === 'boom') {
    const kind = m.k === 'c4' ? 'c4' : 'frag';
    for (const c of CHARGES.slice()) if (c.owner === m.id && c.id === m.i) { removeCharge(c); if (c.g.parent) c.g.parent.remove(c.g); }
    for (let i = C4_FLY.length - 1; i >= 0; i--) if (C4_FLY[i].owner === m.id && C4_FLY[i].id === m.i) { scene.remove(C4_FLY[i].g); C4_FLY.splice(i, 1); }
    for (let i = NADES.length - 1; i >= 0; i--) if (NADES[i].owner === m.id && NADES[i].id === m.i) { scene.remove(NADES[i].g); NADES.splice(i, 1); }
    explode(p, kind, m.id, false, ok(m.n) ? new V3().fromArray(m.n) : null, !!m.ob);
  }
}
function clearExplosives() {
  for (const c of CHARGES) if (c.g.parent) c.g.parent.remove(c.g); CHARGES.length = 0; for (const o of C4_FLY) scene.remove(o.g); C4_FLY.length = 0;
  for (const o of NADES) scene.remove(o.g); NADES.length = 0; for (const o of SPOONS) scene.remove(o.g); SPOONS.length = 0;
  for (const f of BOOM_FX) scene.remove(f.o); BOOM_FX.length = 0; boomLight.intensity = 0;
}
