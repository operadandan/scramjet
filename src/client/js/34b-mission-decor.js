// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3 } from './00-setup.js';
import { TEX, addBox, colliders, worldMeshes } from './01-world.js';
import { townFlat, townTree } from './01b-town.js';
import { Kit, MT, tdCar, tdMat, tdShrub } from './01c-town-detail.js';
import { MIS, MIS_HOUSES, sandbags } from './34-mission.js';
// ---- end module links ----
// The mission's neighbourhood, dressed: everything a street that was lived in and then taken over has standing about in it.
// Front walls, picket fences and hedges along the pavements, privacy fences between the gardens, sheds, trampolines, swings and
// barbecues out the back, cars parked along the kerbs and on the drives, bins, dumpsters, telegraph poles with their wires,
// street lamps, a bus shelter; and the militia's leavings on top: HESCO walls, rubble, oil drums, crate stacks, a burnt bus,
// tents and fire barrels. Most of it is cover: a hidden box (what rounds and bodies meet) under the model, as the furniture has.
// Nothing goes on a house, on the siege map's own street (its centre is already dressed), on a man's post, or in the yard you
// come in at: a walled staging point at the east end of the main street, so the first thing you see is not a machine gun.
// Built from a fixed seed, so the street is the same every time.

function mdRand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// the hidden solid of a piece (x, z its centre, w along x, d along z)
function mdSolid(x, z, w, d, h, kind, y) {
  addBox(x, y || 0, z, w, h, d, kind || 'crate', 0x777777); const m = worldMeshes[worldMeshes.length - 1];
  m.material.visible = false; m.castShadow = m.receiveShadow = false; m.userData.furn = true; return m;
}
const MDM = {
  get brick() { return tdMat('mdBrick', { map: TEX.brick, color: 0xb8a898, roughness: 0.95 }); },
  get planks() { return tdMat('mdPlank', { map: TEX.planks, color: 0xa88560, roughness: 0.9 }); },
  get planksG() { return tdMat('mdPlankG', { map: TEX.planks, color: 0x7a7266, roughness: 0.95 }); },
  get picket() { return tdMat('mdPicket', { color: 0xeeeae0, roughness: 0.6 }); },
  get hesco() { return tdMat('mdHesco', { color: 0x9c8e6a, roughness: 1 }); },
  get earth() { return tdMat('mdEarth', { color: 0x5e4c36, roughness: 1 }); },
  get wire() { return tdMat('mdWire', { color: 0x55554e, metalness: 0.6, roughness: 0.5 }); },
  get cable() { return tdMat('mdCable', { color: 0x161616, roughness: 0.7 }); },
  get dump() { return tdMat('mdDump', { color: 0x2f5a3a, metalness: 0.3, roughness: 0.6 }); },
  get dumpB() { return tdMat('mdDumpB', { color: 0x2a3e5a, metalness: 0.3, roughness: 0.6 }); },
  get rust() { return tdMat('mdRust', { color: 0x6a3a22, metalness: 0.3, roughness: 0.85 }); },
  get soot() { return tdMat('mdSoot', { color: 0x1d1a18, metalness: 0.2, roughness: 0.95 }); },
  get drumB() { return tdMat('mdDrumB', { color: 0x2a4a7a, metalness: 0.35, roughness: 0.6 }); },
  get drumR() { return tdMat('mdDrumR', { color: 0x8a2a20, metalness: 0.35, roughness: 0.6 }); },
  get drumY() { return tdMat('mdDrumY', { color: 0xb08a20, metalness: 0.35, roughness: 0.6 }); },
  get rubble() { return tdMat('mdRubble', { map: TEX.concrete, color: 0x9a968e, roughness: 1 }); },
  get bag() { return tdMat('mdBag', { color: 0x161616, roughness: 0.35 }); },
  get tarp() { return tdMat('mdTarp', { color: 0x55603e, roughness: 0.9, side: THREE.DoubleSide }); },
  get tarpB() { return tdMat('mdTarpB', { color: 0x2e4a6a, roughness: 0.9, side: THREE.DoubleSide }); },
  get olive() { return tdMat('mdOlive', { color: 0x4a5236, metalness: 0.25, roughness: 0.7 }); },
  get yellow() { return tdMat('mdBus', { color: 0xd8a420, metalness: 0.3, roughness: 0.55 }); },
  get flame() { return tdMat('mdFire', { color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 1 }); },
  get red() { return tdMat('mdRed', { color: 0xb02a22, roughness: 0.5 }); },
  get grass() { return tdMat('mdGrass', { color: 0x4f6e34, roughness: 1 }); }
};
// ---- the pieces. along: 'x' or 'z' (which way the long side runs); every one built along x in its kit, turned if it runs along z
const mdRy = along => along === 'z' ? Math.PI / 2 : 0;
const mdWD = (along, l, t) => along === 'z' ? [t, l] : [l, t];
// a HESCO wall: wire baskets of earth, a metre square each, a row of them h high
function mdHesco(x, z, len, along, h) {
  h = h || 1.4; const n = Math.max(1, Math.round(len / 1.05)), c = len / n, K = new Kit();
  for (let i = 0; i < n; i++) { const u = -len / 2 + (i + 0.5) * c;
    K.box(MDM.hesco, u, 0, 0, c - 0.05, h - 0.04, 1.0); K.box(MDM.earth, u, h - 0.04, 0, c - 0.12, 0.05, 0.92);
    for (const s of [-1, 1]) for (const t of [-1, 1]) K.box(MDM.wire, u + s * (c / 2 - 0.03), 0, t * 0.51, 0.025, h, 0.025);
    for (let k = 1; k < 4; k++) for (const t of [-1, 1]) K.box(MDM.wire, u, h * k / 4, t * 0.505, c - 0.05, 0.015, 0.012); }
  const G = K.build(x, 0, z, mdRy(along), { shadow: true, deco: false });
  const [w, d] = mdWD(along, len, 1.04); return { G, m: mdSolid(x, z, w, d, h, 'concrete') };
}
// a low garden wall: brick with a concrete coping
function mdLowWall(x, z, len, along, h) {
  h = h || 0.85; const K = new Kit(); K.box(MDM.brick, 0, 0, 0, len, h, 0.28, { uv: [len / 1.6, h / 1.6] }); K.box(MT.conc, 0, h, 0, len + 0.04, 0.07, 0.36);
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, len, 0.36); mdSolid(x, z, w, d, h + 0.07, 'brick');
}
// a close-boarded fence: posts, rails and boards, head high
function mdFence(x, z, len, along, h, worn) {
  h = h || 1.8; const K = new Kit(), M = worn ? MDM.planksG : MDM.planks;
  K.box(M, 0, 0.06, 0, len, h - 0.06, 0.035, { uv: [len / 1.2, h / 1.2] });
  for (let u = -len / 2; u <= len / 2 + 1e-3; u += len / Math.max(1, Math.round(len / 2.4))) K.box(MT.dark, u, 0, 0.06, 0.1, h + 0.05, 0.1);
  for (const y of [0.3, h - 0.3]) K.box(MT.dark, 0, y, 0.05, len, 0.08, 0.04);
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, len, 0.12); mdSolid(x, z, w, d, h, 'plywood');
}
// a white picket fence, knee high
function mdPicket(x, z, len, along) {
  const K = new Kit(), n = Math.max(2, Math.round(len / 0.17));
  for (let i = 0; i < n; i++) { const u = -len / 2 + (i + 0.5) * len / n; K.box(MDM.picket, u, 0, 0, 0.08, 0.86, 0.022); K.add(MDM.picket, new THREE.ConeGeometry(0.057, 0.1, 4), u, 0.91, 0, { ry: Math.PI / 4, sz: 0.4 }); }
  for (const y of [0.22, 0.66]) K.box(MDM.picket, 0, y, 0.03, len, 0.07, 0.025);
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, len, 0.1); mdSolid(x, z, w, d, 0.9, 'plywood');
}
// a privet hedge: leafy lumps, two rows high. You can't see through it; a round goes through it
function mdHedge(x, z, len, along, h, R) {
  h = h || 1.5; const K = new Kit(), n = Math.max(2, Math.round(len / 0.85));
  for (let i = 0; i < n; i++) { const u = -len / 2 + (i + 0.5) * len / n, r = 0.5 + R() * 0.12;
    K.add(R() < 0.5 ? MT.leaf : MT.leafD, new THREE.IcosahedronGeometry(r, 1), u, h * 0.32, (R() - 0.5) * 0.1, { sy: h * 0.42 / r, sz: 0.85 });
    K.add(R() < 0.5 ? MT.leafD : MT.leaf, new THREE.IcosahedronGeometry(r * 0.9, 1), u + 0.2, h * 0.75, (R() - 0.5) * 0.1, { sy: h * 0.3 / r, sz: 0.8 }); }
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, len, 0.8); mdSolid(x, z, w, d, h, 'plywood');
}
// a dumpster, its lid up or down
function mdDumpster(x, z, along, blue, open) {
  const K = new Kit(), M = blue ? MDM.dumpB : MDM.dump;
  K.box(M, 0, 0.14, 0, 1.9, 1.05, 1.15); K.box(MT.black, 0, 1.12, 0, 1.96, 0.06, 1.22);
  K.add(MT.black, new THREE.BoxGeometry(1.9, 0.05, 1.2), 0, open ? 1.6 : 1.22, open ? -0.62 : 0, { rx: open ? -1.25 : 0.08 });
  for (const s of [-1, 1]) { K.box(M, s * 1.0, 0.55, 0, 0.08, 0.1, 0.9); for (const t of [-1, 1]) K.cyl(MT.black, s * 0.75, 0, t * 0.45, 0.07, 0.07, 0.14, 10); }
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, 2.0, 1.25); mdSolid(x, z, w, d, 1.2, 'metal');
}
// oil drums, standing (and one on its side)
function mdDrums(x, z, n, R, burning) {
  const K = new Kit(), mats = [MDM.drumB, MDM.drumR, MDM.drumY, MDM.rust];
  for (let i = 0; i < n; i++) { const a = i * 2.4 + R(), r = i ? 0.62 : 0, dx = Math.cos(a) * r, dz = Math.sin(a) * r, M = burning && !i ? MDM.rust : mats[Math.floor(R() * 4)];
    if (i === 3) { K.cyl(M, 0, -0.29, 0, 0.29, 0.29, 0.88, 14, { rz: Math.PI / 2 }); K.build(x + dx, 0.29, z + dz + 0.3, R() * 3, { shadow: true, deco: false }); mdSolid(x + dx, z + dz + 0.3, 0.8, 0.8, 0.58, 'metal'); continue; }
    const L = new Kit(); L.cyl(M, 0, 0, 0, 0.29, 0.29, 0.88, 14); for (const y of [0.29, 0.58]) L.cyl(M, 0, y, 0, 0.3, 0.3, 0.03, 14);
    if (burning && !i) { L.cyl(MDM.soot, 0, 0.86, 0, 0.27, 0.27, 0.02, 14); for (let k = 0; k < 4; k++) L.add(MDM.flame, new THREE.ConeGeometry(0.1, 0.35, 5), Math.cos(k * 1.6) * 0.1, 1.05, Math.sin(k * 1.6) * 0.1); }
    L.build(x + dx, 0, z + dz, 0, { shadow: true, deco: false }); mdSolid(x + dx, z + dz, 0.58, 0.58, 0.88, 'metal');
  }
}
// a stack of wooden crates, two high in places
function mdCrates(x, z, R) {
  const K = new Kit(), n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) { const s = 0.7 + R() * 0.35, dx = (i % 2) * 0.95 - 0.45, dz = Math.floor(i / 2) * 0.95 - 0.3, top = i === n - 1 && n > 2;
    const y = top ? 0.9 : 0, px = top ? 0 : dx, pz = top ? 0 : dz;
    K.box(MDM.planks, px, y, pz, s, s, s, { uv: [1, 1] }); for (const t of [-1, 1]) K.box(MT.dark, px, y + s * 0.15, pz + t * (s / 2 + 0.005), s + 0.01, 0.07, 0.01);
    mdSolid(x + px, z + pz, s, s, y + s, 'crate'); }
  K.build(x, 0, z, 0, { shadow: true, deco: false });
}
// black bin bags in a heap (no solid: they give)
function mdBags(x, z, R) { const K = new Kit(); for (let i = 0; i < 5; i++) K.add(MDM.bag, new THREE.IcosahedronGeometry(0.3, 1), (R() - 0.5) * 1.1, 0.22, (R() - 0.5) * 0.9, { sy: 0.75, ry: R() * 3 }); K.build(x, 0, z, 0, { shadow: true, deco: false }); }
// a heap of broken concrete and brick, waist high: cover you crouch behind
function mdRubble(x, z, R) {
  const K = new Kit();
  for (let i = 0; i < 14; i++) { const r = R() * 1.3, a = R() * 6.28, s = 0.25 + R() * 0.5;
    K.add(i % 3 ? MDM.rubble : MDM.brick, new THREE.BoxGeometry(s, s * 0.6, s * 0.8), Math.cos(a) * r, (1.4 - r) * 0.45 + 0.05, Math.sin(a) * r, { rx: R() * 2, ry: R() * 3, rz: R() * 2 }); }
  for (let i = 0; i < 3; i++) K.rod(MDM.rust, new V3((R() - 0.5) * 2, 0.1, (R() - 0.5) * 2), new V3((R() - 0.5) * 2, 0.6 + R() * 0.5, (R() - 0.5) * 2), 0.015);
  K.build(x, 0, z, 0, { shadow: true, deco: false }); mdSolid(x, z, 1.6, 1.6, 0.75, 'concrete');
}
// a telegraph pole: the post, a cross arm with its insulators; returns where the wires hang from
function mdPole(x, z) {
  const K = new Kit(); K.cyl(MT.dark, 0, 0, 0, 0.12, 0.16, 9.2, 10); K.box(MT.dark, 0, 8.4, 0, 0.12, 0.14, 2.0);
  for (const u of [-0.85, -0.3, 0.3, 0.85]) K.cyl(MT.ceramic, 0, 8.54, u, 0.04, 0.05, 0.14, 8);
  K.cyl(MT.steel, 0.25, 7.2, 0, 0.22, 0.22, 0.6, 10); K.build(x, 0, z, 0, { shadow: true, deco: false }); mdSolid(x, z, 0.32, 0.32, 9, 'crate');
  return [-0.85, -0.3, 0.3, 0.85].map(u => new V3(x, 8.66, z + u));
}
// a street lamp, its arm out over the road (dir: +1 or -1 on z)
function mdLamp(x, z, dir) {
  const K = new Kit(); K.cyl(MT.black, 0, 0, 0, 0.07, 0.1, 6.2, 10); K.rod(MT.black, new V3(0, 6.1, 0), new V3(0, 6.3, dir * 1.4), 0.04);
  K.rbox(MT.black, 0, 6.12, dir * 1.6, 0.3, 0.14, 0.6, 0.04); K.box(MT.glow, 0, 6.1, dir * 1.6, 0.22, 0.02, 0.48);
  K.build(x, 0, z, 0, { shadow: true, deco: false }); mdSolid(x, z, 0.22, 0.22, 6, 'metal');
}
// a hydrant, a mailbox: small things on the verge
function mdHydrant(x, z) { const K = new Kit(); K.cyl(MDM.red, 0, 0, 0, 0.13, 0.15, 0.6, 12); K.sph(MDM.red, 0, 0.62, 0, 0.13); for (const s of [-1, 1]) K.cyl(MDM.red, s * 0.15, 0.4, 0, 0.05, 0.05, 0.12, 8, { rz: Math.PI / 2 }); K.build(x, 0, z, 0, { shadow: true, deco: false }); mdSolid(x, z, 0.32, 0.32, 0.72, 'metal'); }
function mdMailbox(x, z, ry) { const K = new Kit(); K.box(MT.dark, 0, 0, 0, 0.1, 1.05, 0.1); K.rbox(MT.black, 0, 1.05, 0, 0.22, 0.24, 0.46, 0.05); K.build(x, 0, z, ry, { shadow: true, deco: false }); }
// wheelie bins at the kerb
function mdBins(x, z, R) {
  for (let i = 0; i < 2; i++) { const c = [0x2e5a3a, 0x2a3a5a, 0x4a4a4a, 0x6a4a22][Math.floor(R() * 4)], M = tdMat('bin' + c, { color: c, roughness: 0.6 }), K = new Kit(), bx = x + i * 0.7;
    K.box(M, 0, 0.05, 0, 0.58, 1.0, 0.58); K.rbox(M, 0, 1.03, -0.02, 0.62, 0.05, 0.64, 0.02); for (const s of [-1, 1]) K.cyl(MT.black, s * 0.26, 0.1, -0.24, 0.1, 0.1, 0.06, 12, { rz: Math.PI / 2 });
    if (R() < 0.3) K.build(bx, 0.3, z + 0.4, 0, { shadow: true, deco: false }).rotation.x = -1.4;   // (knocked over)
    else { K.build(bx, 0, z, R() * 0.4 - 0.2, { shadow: true, deco: false }); mdSolid(bx, z, 0.6, 0.6, 1.05, 'metal'); } }
}
// a bus shelter: a frame, glass, a bench, a roof
function mdShelter(x, z, ry) {
  const K = new Kit(), w = 3.2, d = 1.3;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(MT.steel, a * w / 2, 0, b * d / 2, 0.06, 2.4, 0.06);
  K.box(MT.steel, 0, 2.4, 0, w + 0.2, 0.08, d + 0.2); K.box(MT.glass, 0, 0.2, d / 2, w, 2.0, 0.02); for (const s of [-1, 1]) K.box(MT.glass, s * w / 2, 0.2, 0.1, 0.02, 2.0, d - 0.2);
  K.box(MT.steel, 0, 0.45, d / 2 - 0.25, w - 0.4, 0.05, 0.36); K.box(MT.poster(2), -w / 2 + 0.02, 0.6, 0.1, 0.01, 1.2, 0.8);
  K.build(x, 0, z, ry, { shadow: true, deco: false });
}
// a garden shed: plank walls, a felt roof, a door
function mdShed(x, z, along, R) {
  const K = new Kit(), w = 2.6, d = 2.0, h = 2.05;
  K.box(R() < 0.5 ? MDM.planks : MDM.planksG, 0, 0, 0, w, h, d, { uv: [2, 1.7] }); K.box(MT.shingle, 0, h, 0, w + 0.3, 0.1, d + 0.3, { rx: 0.0 });
  K.box(MT.dark, 0.5, 0.02, d / 2 + 0.01, 0.8, 1.85, 0.03); K.box(MT.brass, 0.75, 0.95, d / 2 + 0.035, 0.03, 0.12, 0.02); K.box(MT.trim, -0.6, 1.1, d / 2 + 0.01, 0.6, 0.5, 0.03); K.plane(MT.blackG, -0.6, 1.35, d / 2 + 0.03, 0.5, 0.4);
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [ww, dd] = mdWD(along, w, d); mdSolid(x, z, ww, dd, h + 0.1, 'plywood');
}
function mdTrampoline(x, z) {
  const K = new Kit(); K.add(MT.steel, new THREE.TorusGeometry(1.7, 0.04, 6, 28), 0, 0.75, 0, { rx: Math.PI / 2 }); K.cyl(MT.black, 0, 0.72, 0, 1.55, 1.55, 0.02, 28);
  K.add(MDM.tarpB, new THREE.TorusGeometry(1.68, 0.13, 4, 28), 0, 0.78, 0, { rx: Math.PI / 2, sz: 0.25 });
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; K.rod(MT.steel, new V3(Math.cos(a) * 1.7, 0.75, Math.sin(a) * 1.7), new V3(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75), 0.025); }
  K.build(x, 0, z, 0, { shadow: true, deco: false });
}
function mdSwing(x, z, ry) {
  const K = new Kit(), w = 3.0, H = 2.2;
  for (const s of [-1, 1]) for (const t of [-1, 1]) K.rod(MT.steel, new V3(s * w / 2, H, 0), new V3(s * (w / 2 + 0.2), 0, t * 0.8), 0.035);
  K.rod(MT.steel, new V3(-w / 2, H, 0), new V3(w / 2, H, 0), 0.04);
  for (const u of [-0.6, 0.6]) { for (const t of [-0.2, 0.2]) K.rod(MT.chrome, new V3(u + t, H, 0), new V3(u + t, 0.45, 0), 0.008); K.box(MT.black, u, 0.42, 0, 0.48, 0.03, 0.18); }
  K.build(x, 0, z, ry, { shadow: true, deco: false });
}
function mdBBQ(x, z) {
  const K = new Kit(); K.add(MT.black, new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0, 0.85, 0); K.add(MT.black, new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.88, 0);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; K.rod(MT.black, new V3(Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2), new V3(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), 0.015); }
  K.build(x, 0, z, 0, { shadow: true, deco: false });
  // the picnic table beside it
  const T = new Kit(); T.box(MDM.planks, 0, 0.72, 0, 1.8, 0.06, 0.8); for (const s of [-1, 1]) { T.box(MDM.planks, 0, 0.42, s * 0.62, 1.8, 0.05, 0.28); T.box(MT.dark, s * 0.75, 0, 0, 0.08, 0.72, 1.4); }
  T.build(x + 1.6, 0, z + 0.3, 0, { shadow: true, deco: false }); mdSolid(x + 1.6, z + 0.3, 1.8, 1.5, 0.78, 'crate');
}
function mdWoodpile(x, z, along, R) {
  const K = new Kit();
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9 - r; i++) K.cyl(i % 3 ? MT.bark : MT.dark, -1.0 + (i + r * 0.5) * 0.25, 0.12 + r * 0.21, 0, 0.11 + R() * 0.02, 0.11, 0.7, 7, { rx: Math.PI / 2 });
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, 2.3, 0.75); mdSolid(x, z, w, d, 0.95, 'crate');
}
function mdPool(x, z) { const K = new Kit(); K.cyl(MDM.tarpB, 0, 0, 0, 1.3, 1.3, 0.35, 24); K.cyl(tdMat('mdWater', { color: 0x6aa0b8, roughness: 0.1 }), 0, 0.3, 0, 1.2, 1.2, 0.02, 24); K.build(x, 0, z, 0, { shadow: true, deco: false }); }
function mdRaisedBed(x, z, along) {
  const K = new Kit(); K.box(MDM.planks, 0, 0, 0, 2.4, 0.35, 1.1); K.box(MT.soil, 0, 0.35, 0, 2.3, 0.01, 1.0);
  for (let i = 0; i < 6; i++) K.add(MT.leaf, new THREE.IcosahedronGeometry(0.16, 0), -0.95 + i * 0.38, 0.45, (i % 2 - 0.5) * 0.4);
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, 2.4, 1.1); mdSolid(x, z, w, d, 0.36, 'crate');
}
// a militia tent: a ridge tent of drab canvas, guy lines, a cot inside
function mdTent(x, z, along, blue) {
  const K = new Kit(), L = 3.6, W = 2.6, H = 1.9, s = Math.atan2(H, W / 2), sl = Math.hypot(H, W / 2), M = blue ? MDM.tarpB : MDM.tarp;
  // (the two slopes: planes leaned in from either side to the ridge)
  for (const t of [-1, 1]) { const g = new THREE.PlaneGeometry(L, sl); g.rotateX(t > 0 ? -(Math.PI / 2 - s) : (Math.PI / 2 - s)); K.add(M, g, 0, H / 2, t * W / 4); }
  K.rod(MT.dark, new V3(-L / 2, 0, 0), new V3(-L / 2, H + 0.05, 0), 0.03); K.rod(MT.dark, new V3(L / 2, 0, 0), new V3(L / 2, H + 0.05, 0), 0.03);
  K.box(MDM.olive, 0, 0.3, -0.4, 1.9, 0.1, 0.7);
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false });
}
// a burnt-out bus across the road: a long box on its rims, the windows gone black
function mdBus(x, z, along) {
  const K = new Kit(), L = 10.5, W = 2.5, H = 2.9;
  K.box(MDM.soot, 0, 0.45, 0, L, 1.0, W); K.box(MDM.yellow, 0.6, 0.55, 0, L - 2, 0.75, W + 0.02); K.box(MDM.soot, 0, 1.45, 0, L, 1.1, W - 0.06); K.box(MDM.rust, 0, 2.55, 0, L, 0.35, W - 0.1);
  for (let i = 0; i < 8; i++) K.box(MDM.yellow, -L / 2 + 1.6 + i * 1.12, 1.45, 0, 0.12, 1.1, W - 0.02);
  for (const a of [-L / 2 + 1.6, L / 2 - 2.2]) for (const b of [-1, 1]) K.cyl(MDM.rust, a, 0.48, b * (W / 2 - 0.15), 0.32, 0.32, 0.3, 14, { rx: Math.PI / 2 });
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, L, W); mdSolid(x, z, w, d, H, 'metal');
}
// a military truck (the one you came in on): a cab and a canvas-covered bed
function mdTruck(x, z, along) {
  const K = new Kit(), L = 7.2, W = 2.5;
  K.box(MDM.olive, 0, 0.55, 0, L, 0.35, W - 0.3); K.box(MDM.olive, L / 2 - 1.2, 0.9, 0, 2.2, 1.6, W); K.box(MT.blackG, L / 2 - 0.08, 1.75, 0, 0.02, 0.6, W - 0.4);
  K.box(MDM.olive, -1.0, 0.9, 0, 4.9, 0.6, W); K.add(MDM.tarp, new THREE.CylinderGeometry(W / 2, W / 2, 4.9, 14, 1, false, 0, Math.PI), -1.0, 1.5, 0, { rz: Math.PI / 2, sy: 1, sx: 1.05 });
  K.box(MDM.tarp, -1.0, 1.5, 0, 4.9, 0.02, W);
  for (const a of [L / 2 - 1.3, -0.6, -2.4]) for (const b of [-1, 1]) K.cyl(MT.black, a, 0.5, b * (W / 2 - 0.2), 0.5, 0.5, 0.4, 16, { rx: Math.PI / 2 });
  K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); const [w, d] = mdWD(along, L, W); mdSolid(x, z, w, d, 2.8, 'metal');
}
// concertina wire: coils along a line (it's in the way, not cover)
function mdWireLine(x, z, len, along) {
  const K = new Kit(), n = Math.round(len / 0.45);
  for (let i = 0; i < n; i++) K.add(MDM.wire, new THREE.TorusGeometry(0.42, 0.01, 4, 18), -len / 2 + (i + 0.5) * len / n, 0.42, 0, { ry: Math.PI / 2 + 0.25 });
  K.build(x, 0, z, mdRy(along), { shadow: false, deco: false });
}

// ---- the dressing itself
function missionDecor(E) {
  const R = mdRand(1311), hard = [], roads = [];
  const rect = (L, x0, z0, x1, z1) => L.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  const hits = (L, x0, z0, x1, z1) => L.some(o => x1 > o[0] && x0 < o[2] && z1 > o[1] && z0 < o[3]);
  const free = (x, z, w, d, yard) => Math.abs(x) + w / 2 < E - 0.6 && Math.abs(z) + d / 2 < E - 0.6 && !hits(hard, x - w / 2, z - d / 2, x + w / 2, z + d / 2) && !(yard && hits(roads, x - w / 2, z - d / 2, x + w / 2, z + d / 2));
  const take = (x, z, w, d) => rect(hard, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  // what's there already: the houses, the siege map's own lot and street, the militia's works and posts, the staging yard
  for (const h of MIS.houses) rect(hard, h.x0 - 0.8, h.z0 - 0.8, h.x1 + 0.8, h.z1 + 0.8);
  rect(hard, -48, -16, 48, 31); rect(hard, -48, -48, -20, -16); rect(hard, 20, -48, 48, -16);
  rect(hard, 110, 9, E, 33.5);
  // the way through (34-mission's route): its walls go up first, so nothing else is put on them
  missionRoute(R, hard);
  for (const [x, z] of [[58, 22], [62, 24.4], [-56, 22], [-60, 21.6], [3, -72], [12, -71], [-12, -67.5], [30, 20], [-24, 30], [40, 31], [-40, 17.6], [51, 22], [-49, 22], [-4, -66.6],
    [34, 38], [-40, 36.5], [72, -64], [-70, -80], [70, 19.4], [-80, 24.6], [100, 24.6], [-50, -69.4], [60, -74.6], [-110, -74.6], [55.5, 21], [54.8, 26.2], [-53.5, 23], [-51.5, 18.6], [2, -68.6], [29, 21.2], [56, -14], [51, -33], [59, -50], [-9, -30], [11, -24], [76, 26], [92, 18.4], [68, 30.6], [84, 13.4], [24, -75.5], [36, -69.5], [-9, -76], [-21, 27.5], [-20.5, 15.5], [21, 27.5], [20.5, 15.5]]) rect(hard, x - 1.5, z - 1.5, x + 1.5, z + 1.5);
  for (const [x, z] of [[-120, 30], [-84, 31], [-40, 31], [64, 31], [104, 31], [-120, -60], [-84, -62], [14, -62], [64, -62], [110, -62], [-54, -84], [0, -84], [60, -84], [118, -84]]) rect(hard, x - 1, z - 1, x + 1, z + 1);
  rect(roads, -E, 15.4, E, 28.6); rect(roads, -E, -78.6, E, -65.4); rect(roads, -30.6, -66, -21.4, 18);

  // ---- the staging yard at the east end, where you come in: HESCO round three sides, the way out at the south-west corner
  // behind a baffle wall; the truck, ammunition and a tent inside. (It sees nothing and nothing sees into it.)
  mdHesco(116.5, 24.6, 16, 'z', 2.5); mdHesco(112.2, 17.2, 9, 'z', 2.5);
  mdTruck(129, 28.6, 'x'); mdCrates(134, 14, R); mdCrates(120.5, 30, R); mdDrums(135.5, 30.5, 3, R); mdTent(125, 14.3, 'x');

  // ---- the streets: parked and burnt cars at the kerbs, dumpsters, drums, crates, rubble; poles, lamps and bins on the verges
  const carCols = [0x5a5f66, 0x34506e, 0xd9d6cc, 0x6e2e2e, 0x2f4a3a, 0x9a9a92, 0x1d1f22, 0x8a6a3a, 0xa8acb0, 0x2a3a5e];
  const street = (zc, x0, x1, skip) => {
    for (let x = x0; x < x1; x += 6 + R() * 7) {
      if (skip && x > skip[0] && x < skip[1]) continue;
      for (const side of [-1, 1]) {
        if (R() < 0.35) continue; const z = zc + side * 2.7, r = R();
        if (r < 0.45) { if (free(x, z, 5, 2.4)) { tdCar(x, z, 'x', carCols[Math.floor(R() * carCols.length)]); take(x, z, 5, 2.4); } }
        else if (r < 0.6) { if (free(x, z, 5, 2.4)) { tdCar(x, z, 'x', 0x2a221c); take(x, z, 5, 2.4); if (R() < 0.6) mdRubble(x + 3.2, z, R); } }
        else if (r < 0.7) { if (free(x, z, 2.2, 1.4)) { mdDumpster(x, z, 'x', R() < 0.4, R() < 0.4); take(x, z, 2.2, 1.4); } }
        else if (r < 0.8) { if (free(x, z, 2, 2)) { mdDrums(x, z, 2 + Math.floor(R() * 3), R, R() < 0.3); take(x, z, 2, 2); } }
        else if (r < 0.9) { if (free(x, z, 2.2, 2.2)) { mdCrates(x, z, R); take(x, z, 2.2, 2.2); } }
        else if (free(x, z, 2, 2)) { mdRubble(x, z, R); take(x, z, 2, 2); }
      }
    }
  };
  street(22, -E + 4, -48); street(22, 48, 112); street(-72, -E + 4, E - 4, [-16, 16]);
  // (the side road down to the back street, past the siege map's end of it)
  for (let z = -62; z < -46; z += 7) for (const x of [-28.6, -23.4]) if (R() < 0.6 && free(x, z, 2.4, 5)) { tdCar(x, z, 'z', R() < 0.3 ? 0x2a221c : carCols[Math.floor(R() * carCols.length)]); take(x, z, 2.4, 5); }
  // militia blocks across the roads between: HESCO and wire, a bus on its rims, sandbag walls with a gap
  mdHesco(-92, 19.5, 4.2, 'z', 1.4); mdWireLine(-92, 25, 3.5, 'z'); mdHesco(-96, 24.6, 3.2, 'z', 1.4);
  mdBus(88, 21.4, 'x'); take(88, 21.4, 11, 3);
  mdHesco(-36, -70.6, 5.2, 'x', 1.4); mdHesco(-42, -74, 4.2, 'x', 1.4); mdWireLine(-39, -68, 4, 'x');
  mdHesco(40, -74.2, 4.2, 'x', 1.4); mdHesco(46, -69.8, 4.2, 'x', 1.4); mdRubble(52, -72, R);
  mdBus(-100, -71.2, 'x'); take(-100, -71.2, 11, 3);
  for (const [x0, x1, z0, z1] of [[-94, -89, 17, 27], [-102, -78, -77, -66], [-45, -33, -77, -66], [36, 50, -77, -66]]) rect(hard, x0, z0, x1, z1);
  // the verges: telegraph poles down one side with their wires, lamps down the other, a bus shelter, hydrants
  const wires = new Kit(), poleRow = (z, x0, x1) => { let prevTops = null;
    for (let x = x0; x <= x1; x += 32) { let px = x; while (!free(px, z, 0.6, 0.6) && px < x + 8) px += 1.5; if (px >= x + 8) { prevTops = null; continue; }
      const tops = mdPole(px, z); take(px, z, 0.6, 0.6);
      if (prevTops) for (let i = 0; i < 4; i++) { const a = prevTops[i], b = tops[i], m = a.clone().lerp(b, 0.5); m.y -= 0.7; wires.rod(MDM.cable, a, m, 0.012, 4); wires.rod(MDM.cable, m, b, 0.012, 4); }
      prevTops = tops; } };
  poleRow(30.4, -E + 6, 112); poleRow(-64.4, -E + 6, E - 6); wires.build(0, 0, 0, 0, { shadow: false, deco: false });
  for (let x = -E + 18; x < E - 6; x += 36) { if (free(x, 13.8, 0.5, 0.5) && x < 112) { mdLamp(x, 14.4, 1); take(x, 14.4, 0.5, 0.5); } if (free(x + 18, -79.6, 0.5, 0.5)) { mdLamp(x + 18, -79.6, 1); take(x + 18, -79.6, 0.5, 0.5); } }
  mdShelter(-70, 30.2, Math.PI); take(-70, 30.2, 3.6, 1.8); mdShelter(20, -80.4, 0); take(20, -80.4, 3.6, 1.8);
  for (const [x, z] of [[-122, 13.8], [-64, 13.6], [76, 13.8], [-120, -64.2], [-30, -64.2], [94, -79.8], [30, -64.2]]) if (free(x, z, 0.4, 0.4)) { mdHydrant(x, z); take(x, z, 0.4, 0.4); }

  // ---- the gardens, house by house
  MIS.houses.forEach((h, i) => {
    const front = MIS_HOUSES[i][2], sg = front === 'n' ? -1 : 1;
    const fz = front === 'n' ? h.z0 : h.z1, bz = front === 'n' ? h.z1 : h.z0;
    const edge = h.cz > 0 ? 29.4 : front === 'n' ? -64.8 : -79.2;          // the front boundary, on the pavement's far side
    const lx0 = h.cx - 15, lx1 = h.cx + 15, ds = i % 2 ? 1 : -1, dx = h.cx + ds * ((h.x1 - h.x0) / 2 + 2.6), gx = h.cx;
    const kind = i % 4, fenceRun = (x0, x1, fn) => { for (let a = x0; a < x1 - 0.4; a += 3) { const b = Math.min(x1, a + 3), m = (a + b) / 2, L = b - a; if (free(m, edge, L, 0.6, true) || free(m, edge, L, 0.6)) { fn(m, L); take(m, edge, L, 0.6); } } };
    // the front: a wall, a picket fence or a hedge, gaps for the path and the drive
    const run = (x0, x1) => fenceRun(x0, x1, (m, L) => misInRoute(m, edge, 0.5) && kind === 2 ? mdLowWall(m, edge, L, 'x', 0.6) : kind === 0 ? mdLowWall(m, edge, L, 'x') : kind === 1 ? mdPicket(m, edge, L, 'x') : kind === 2 ? mdHedge(m, edge, L, 'x', 1.3, R) : mdLowWall(m, edge, L, 'x', 0.6));
    const gaps = [[gx - 0.8, gx + 0.8], [dx - 1.8, dx + 1.8]].sort((a, b) => a[0] - b[0]); run(lx0, gaps[0][0]); run(gaps[0][1], gaps[1][0]); run(gaps[1][1], lx1);
    // the path and the drive, a car on most drives, the mailbox by the gate
    const pz = (edge + fz) / 2, pl = Math.abs(fz - edge);
    townFlat(gx, pz, 1.2, pl, 'pave', 1.2, 0.006, 0xb8b0a4); townFlat(dx, pz, 3.2, pl, 'pave', 1.5, 0.0058, 0x9a968e);
    if (R() < 0.7) { const cz = fz + sg * 3.4; if (free(dx, cz, 2.4, 5)) { tdCar(dx, cz, 'z', R() < 0.25 ? 0x2a221c : carCols[(i * 3) % carCols.length]); take(dx, cz, 2.4, 5); } }
    mdMailbox(gx + 1.2, edge - sg * 0.4, 0); if (free(dx + ds * 2.4, edge - sg * 0.6, 1.6, 0.8)) mdBins(dx + ds * 2.4, edge - sg * 0.6, R);
    // shrubs along the front wall of the house, a tree in the front garden
    for (let x = h.x0 + 0.8; x < h.x1 - 0.5; x += 2.2 + R()) if (Math.abs(x - gx) > 1.2) tdShrub(x, fz + sg * 0.75, 0.8 + R() * 0.3, R() < 0.3 ? [0xd84a6a, 0xf2e05a, 0xf2f2f2][Math.floor(R() * 3)] : 0);
    { const tx = h.cx - ds * (5 + R() * 5), tz = fz + sg * (3 + R() * Math.max(0, pl - 6)); if (free(tx, tz, 1, 1, true)) { townTree(tx, tz, 0.9 + R() * 0.4); take(tx, tz, 1, 1); } }
    // privacy fences down the sides and across the back, a gate gap in the back one
    const back = bz - sg * 13;
    for (const sx of [lx0, lx1]) for (let a = Math.min(fz, back); a < Math.max(fz, back) - 0.4; a += 3) { const b = Math.min(Math.max(fz, back), a + 3), m = (a + b) / 2;
      if (free(sx, m, 0.3, b - a, true) && !misInRoute(sx, m, 0.6)) { mdFence(sx, m, b - a, 'z', 1.8, i % 3 === 1); take(sx, m, 0.3, b - a); } }
    for (let a = lx0; a < lx1 - 0.4; a += 3) { const b = Math.min(lx1, a + 3), m = (a + b) / 2; if (Math.abs(m - h.cx - 6) < 1.6) continue;
      if (free(m, back, b - a, 0.3, true) && !misInRoute(m, back, 0.6)) { mdFence(m, back, b - a, 'x', 1.8, i % 3 === 1); take(m, back, b - a, 0.3); } }
    // the back garden: a shed in a corner, and some of: a trampoline, a swing, the barbecue, a woodpile, a paddling pool, a veg bed
    const yz = (bz + back) / 2, sx = h.cx + (i % 2 ? -1 : 1) * 11.5, sz = back + sg * 1.8;
    if (free(sx, sz, 2.8, 2.4, true)) { mdShed(sx, sz, 'x', R); take(sx, sz, 2.8, 2.4); }
    const opts = [0, 1, 2, 3, 4, 5].sort(() => R() - 0.5).slice(0, 3);
    opts.forEach((o, k) => { const x = h.cx - 8 + k * 7 + R() * 2, z = yz + (R() - 0.5) * 3;
      if (o === 0 && free(x, z, 3.6, 3.6, true)) { mdTrampoline(x, z); take(x, z, 3.6, 3.6); }
      else if (o === 1 && free(x, z, 3.6, 2, true)) { mdSwing(x, z, 0); take(x, z, 3.6, 2); }
      else if (o === 2 && free(x + 0.8, z, 3, 1.6, true)) { mdBBQ(x, z); take(x + 0.8, z, 3, 1.6); }
      else if (o === 3 && free(x, z, 2.4, 0.9, true)) { mdWoodpile(x, z, 'x', R); take(x, z, 2.4, 0.9); }
      else if (o === 4 && free(x, z, 2.8, 2.8, true)) { mdPool(x, z); take(x, z, 2.8, 2.8); }
      else if (o === 5 && free(x, z, 2.6, 1.3, true)) { mdRaisedBed(x, z, 'x'); take(x, z, 2.6, 1.3); } });
    { const tx = h.cx + (i % 2 ? 1 : -1) * (6 + R() * 6), tz = back + sg * 3.5; if (free(tx, tz, 1, 1, true)) { townTree(tx, tz, 1.0 + R() * 0.4); take(tx, tz, 1, 1); } }
    // the militia in the front gardens: a sandbag position facing the street at every other house, drums and crates by the door
    if (i % 2 === 0) { const x = h.cx + ds * -6, z = edge - sg * 2.2; if (free(x, z, 3, 0.8, true)) { sandbags(x, z, 2.8, 'x', 1.1); take(x, z, 3, 0.8); } }
    if (i % 3 === 0) { const x = h.cx - ds * 3, z = fz + sg * 2.2; if (free(x, z, 2.2, 2.2, true)) { mdCrates(x, z, R); take(x, z, 2.2, 2.2); } }
  });

  // ---- the open ground between: copses, a militia camp, wrecks and rubble, drums burning
  const scatter = (x0, z0, x1, z1, n) => { for (let k = 0; k < n * 4 && n > 0; k++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), r = R();
    if (r < 0.32) { if (free(x, z, 1.2, 1.2, true)) { townTree(x, z, 1.0 + R() * 0.5); take(x, z, 1.2, 1.2); n--; for (let j = 0; j < 2; j++) { const a = R() * 6.28, sx = x + Math.cos(a) * 2.5, sz = z + Math.sin(a) * 2.5; if (free(sx, sz, 0.8, 0.8, true)) tdShrub(sx, sz, 0.9 + R() * 0.4, 0); } } }
    else if (r < 0.45) { if (free(x, z, 5, 2.4, true)) { tdCar(x, z, R() < 0.5 ? 'x' : 'z', 0x2a221c); take(x, z, 5, 5); n--; } }
    else if (r < 0.6) { if (free(x, z, 2, 2, true)) { mdRubble(x, z, R); take(x, z, 2, 2); n--; } }
    else if (r < 0.72) { if (free(x, z, 2, 2, true)) { mdDrums(x, z, 2 + Math.floor(R() * 3), R, R() < 0.4); take(x, z, 2, 2); n--; } }
    else if (r < 0.84) { if (free(x, z, 2.2, 2.2, true)) { mdCrates(x, z, R); take(x, z, 2.2, 2.2); n--; } }
    else if (r < 0.92) { const al = R() < 0.5 ? 'x' : 'z'; if (free(x, z, 3.4, 3.4, true)) { sandbags(x, z, 3, al, 1.1); take(x, z, 3.4, 3.4); n--; } }
    else if (free(x, z, 3.2, 3.2, true)) { mdHesco(x, z, 3.2, R() < 0.5 ? 'x' : 'z', 1.4); take(x, z, 3.4, 3.4); n--; } } };
  scatter(-48, 31, 34, 60, 16); scatter(-E + 2, 31, E - 2, 70, 14); scatter(-E + 2, -64, -48, -40, 10); scatter(48, -64, E - 2, -40, 10);
  scatter(-E + 2, -62, E - 2, -30, 8); scatter(-E + 2, -115, E - 2, -80, 18); scatter(60, -40, E - 2, 14, 12); scatter(-E + 2, -40, -50, 14, 12);
  // (more of it along the way through: down the gardens and in the big house's back garden)
  // (down the gardens: something to get behind every few metres, either side in turn)
  for (let z = 6, k = 0; z > -58; z -= 5.5 + R() * 2, k++) { const x = k % 2 ? 51 + R() * 2 : 58 + R() * 2, c = k % 6;
    if (c === 0 && free(x, z, 3.2, 1, true)) { sandbags(x, z, 3, 'x', 1.1); take(x, z, 3.2, 1); }
    else if (c === 1 && free(x, z, 2.2, 2.2, true)) { mdCrates(x, z, R); take(x, z, 2.2, 2.2); }
    else if (c === 2 && free(x, z, 2.8, 2.4, true)) { mdShed(x, z, 'x', R); take(x, z, 2.8, 2.4); }
    else if (c === 3 && free(x, z, 2.4, 0.9, true)) { mdWoodpile(x, z, 'x', R); take(x, z, 2.4, 0.9); }
    else if (c === 4 && free(x, z, 2, 2, true)) { mdDrums(x, z, 3, R); take(x, z, 2, 2); }
    else if (free(x, z, 2.6, 1.3, true)) { mdRaisedBed(x, z, 'x'); take(x, z, 2.6, 1.3); } }
  scatter(48.5, -58, 61.5, 9, 6); scatter(-18.5, -44, 18.5, -18, 9);
  // the camp: tents round a fire barrel, behind a horseshoe of sandbags, in the field north-west
  for (const [x, z, al, b] of [[-14, 52, 'x', false], [-8, 56, 'z', true], [-20, 57, 'z', false], [-3, 50.5, 'x', false]]) if (free(x, z, 4, 4, true)) { mdTent(x, z, al, b); take(x, z, 4, 4); }
  mdDrums(-11.5, 55, 1, R, true); mdCrates(-5, 59, R); mdBags(-16, 50.5, R); mdBags(-1, 55, R);
  for (let k = 0; k < 18; k++) { const x = -E + 4 + R() * (2 * E - 8), z = R() < 0.5 ? 14.4 + R() * 0.5 : 29.5 + R() * 0.6; if (free(x, z, 1.4, 1.2)) { mdBags(x, z, R); take(x, z, 1.4, 1.2); } }
}


// ---- the way through. Mission 1 runs one way: down the main street from the staging yard, into one house for the radio, down
// a strip of gardens to the back street, through the plug in the wall there (the cache blown up against it) into the big house's
// back garden, through the house, out to the street at its front. These are the places you can be; everything round them is
// walled off: HESCO where a wall crosses a road, a tall close-boarded fence through the gardens, and over each a hidden wall
// too high to climb. Two of the walls open as you go: the gate into the gardens (when you have the radio) and the plug.
const E_MIS = 138;
const MIS_ROUTE = [[44, 7, E_MIS, 32.6], [39, 32.6, 57, 54], [47.5, -62, 62.5, 12], [-16, -79.5, 62.5, -62], [-6, -62, 6, -46], [-20, -46, 20, -16], [-24, -16, 24, 32.6]];
function misInRoute(x, z, m) { m = m || 0; return MIS_ROUTE.some(r => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m); }
// a chain-link gate across a gap: its own meshes (kept out of the batching) so it can be taken away
function mdGate(x, z, len, along) {
  const K = new Kit(), mesh = tdMat('mdChain', { color: 0x9aa0a4, metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  K.plane(mesh, 0, 1.25, 0, len, 2.3); for (let u = -len / 2; u <= len / 2 + 1e-3; u += len / 4) K.cyl(MT.steel, u, 0, 0, 0.04, 0.04, 2.45, 8);
  for (const y of [0.1, 2.4]) K.rod(MT.steel, new V3(-len / 2, y, 0), new V3(len / 2, y, 0), 0.03);
  K.rod(MT.chrome, new V3(-0.3, 1.1, 0.03), new V3(0.3, 1.1, 0.03), 0.012); K.box(MDM.olive, 0, 0.95, 0.05, 0.12, 0.14, 0.05);
  for (let i = 0; i < 6; i++) K.add(MDM.wire, new THREE.TorusGeometry(0.3, 0.008, 4, 14), -len / 2 + (i + 0.5) * len / 6, 2.7, 0, { ry: Math.PI / 2 });
  const G = K.build(x, 0, z, mdRy(along), { shadow: true, deco: false }); G.userData.td = false;
  const [w, d] = mdWD(along, len, 0.2); return { G, m: mdSolid(x, z, w, d, 3.4, 'metal') };
}
function missionRoute(R, hard) {
  const roads = [[-E_MIS, 15.4, E_MIS, 28.6], [-E_MIS, -78.6, E_MIS, -65.4]], onRoad = (x, z) => roads.some(r => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
  // a wall along a line, in pieces about 3 m long: HESCO on the roads, the fence through the gardens; a hidden wall over all
  const wall = (x0, z0, x1, z1) => {
    const along = z0 === z1 ? 'x' : 'z', a = along === 'x' ? x0 : z0, b = along === 'x' ? x1 : z1, n = Math.max(1, Math.round((b - a) / 3)), L = (b - a) / n;
    for (let i = 0; i < n; i++) { const u = a + (i + 0.5) * L, x = along === 'x' ? u : x0, z = along === 'x' ? z0 : u;
      if (onRoad(x, z)) mdHesco(x, z, L, along, 2.5); else { mdFence(x, z, L, along, 2.4, (i + Math.round(u)) % 3 === 0); if (R() < 0.35) tdShrub(x + (along === 'z' ? 0.6 : 0), z + (along === 'x' ? 0.6 : 0), 1.0, 0); } }
    const [w, d] = along === 'x' ? [b - a, 1.1] : [1.1, b - a]; const m = mdSolid((x0 + x1) / 2, (z0 + z1) / 2, w, d, 3.6, 'concrete'); m.userData.misWall = true;
    hard.push([Math.min(x0, x1) - 0.7, Math.min(z0, z1) - 0.7, Math.max(x0, x1) + 0.7, Math.max(z0, z1) + 0.7]);
  };
  // the main street (the staging yard's walls are the east end)
  wall(57, 32.6, 137.5, 32.6); wall(62.5, 12, 137.5, 12); wall(44, 12, 47.5, 12); wall(44, 12, 44, 32.6); mdBus(41.5, 22, 'z');
  // the radio house's garden
  wall(39, 32.6, 44, 32.6); wall(39, 32.6, 39, 54); wall(39, 54, 57, 54); wall(57, 32.6, 57, 54);
  // the gardens down to the back street, the gate at the top
  wall(47.5, -62, 47.5, 12); wall(62.5, -62, 62.5, 12);
  MIS.gate = mdGate(55, 12, 15, 'x');
  // the back street: walled across at both ends and along its far side; the plug into the big house's garden
  wall(-16, -62, -6, -62); wall(6, -62, 47.5, -62); wall(-16, -79.5, 62.5, -79.5); wall(62.5, -79.5, 62.5, -62); wall(-16, -79.5, -16, -62);
  MIS.plug = mdHesco(0, -62, 12, 'x', 2.5); MIS.plug.G.userData.td = false;
  // the cache against it: green ammunition boxes, long rifle crates, a tarp half over them (it goes up with the plug)
  { const K = new Kit(), box = tdMat('mdAmmo', { color: 0x3e4a2c, roughness: 0.7 }), stencil = tdMat('mdStencil', { color: 0xd8c870, roughness: 0.8 });
    for (let i = 0; i < 6; i++) { const x = -2.2 + (i % 3) * 1.4, y = Math.floor(i / 3) * 0.42; K.box(box, x, y, -1.4, 1.2, 0.4, 0.55); K.box(stencil, x - 0.3, y + 0.15, -1.68, 0.4, 0.08, 0.005); }
    for (let i = 0; i < 3; i++) K.box(MDM.planks, 2.3, i * 0.32, -1.5 + (i % 2) * 0.1, 1.8, 0.3, 0.5);
    K.add(MDM.tarp, new THREE.PlaneGeometry(2.6, 1.8), -1.0, 0.95, -1.5, { rx: -1.2 });
    K.build(0, 0, 0, 0, { shadow: true, deco: false, parent: MIS.plug.G }).userData.td = false; } MIS.plug.m2 = mdSolid(0, -62, 12, 1.1, 3.6, 'concrete');
  // the strip into the garden, the garden, the house and the street in front of it
  wall(-6, -62, -6, -46); wall(6, -62, 6, -46); wall(-20, -46, -6, -46); wall(6, -46, 20, -46); wall(-20, -46, -20, -16); wall(20, -46, 20, -16);
  wall(-24, -16, -20, -16); wall(20, -16, 24, -16); wall(-24, -16, -24, 32.6); wall(24, -16, 24, 32.6); wall(-24, 32.6, 24, 32.6);
  hard.push([-8, -66, 8, -58]);
}
// take a gate or the plug away (its meshes, its solids)
function mdRemove(o) {
  if (!o) return; if (o.G) { o.G.removeFromParent(); o.G.traverse(q => { if (q.isMesh) q.geometry.dispose(); }); }
  for (const m of [o.m, o.m2]) { if (!m) continue; const i = worldMeshes.indexOf(m); if (i >= 0) worldMeshes.splice(i, 1); const j = colliders.indexOf(m.userData.box); if (j >= 0) colliders.splice(j, 1); m.removeFromParent(); }
}

// ---- module exports: build.mjs strips this block ----
export { mdRemove, missionDecor };
// ---- end module exports ----
