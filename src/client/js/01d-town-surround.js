// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, scene } from './00-setup.js';
import { TEX, mat } from './01-world.js';
import { townTree } from './01b-town.js';
import { Kit, MT, TDM, TEXD, tdCar, tdCarBody, tdMat, tdPanel, tdRnd, tdTex } from './01c-town-detail.js';
import { fx } from './11-fx.js';
import { S } from './17-dummies.js';
import { ENV } from './24-env.js';
// ---- end module links ----
// The neighbourhood round the house: proper trees (a branching trunk, leaves on cards that move in the wind), the
// neighbours' houses on every side past the hedge (two storeys or one, porches, garages, chimneys, drives with cars in them,
// their own trees and gardens), a ring of woodland on the horizon, cars parked along the kerbs, and birds wheeling overhead.
// Everything is built with the furniture kit, so it is merged into a handful of big meshes like the rest of the finish.

// ---- leaves: a card of many small leaves (cut out where there is none), tinted per cluster, swaying in the wind
const TREE_T = { value: 0 };
function tdLeafTex(kind) {
  return tdTex('leafcard' + kind, 256, (g, s) => {
    g.clearRect(0, 0, s, s);
    const n = kind === 1 ? 260 : 150;
    for (let i = 0; i < n; i++) {
      // (denser toward the middle of the card, so its edge is a ragged outline and not a square)
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * s * 0.44, x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r, v = tdRnd(-28, 22) | 0;
      g.save(); g.translate(x, y); g.rotate(Math.random() * 6.283);
      if (kind === 1) { g.strokeStyle = 'rgb(' + (52 + v) + ',' + (82 + v) + ',' + (48 + v * 0.5 | 0) + ')'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke(); }
      else {
        const L = tdRnd(9, 15), W = L * tdRnd(0.45, 0.62);
        g.fillStyle = 'rgb(' + (92 + v) + ',' + (128 + v) + ',' + (62 + v * 0.6 | 0) + ')'; g.beginPath(); g.ellipse(0, 0, L, W, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(40,60,25,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
      }
      g.restore();
    }
  });
}
function tdLeafMat(kind) {
  const key = 'leafcard' + kind; if (TDM[key]) return TDM[key];
  const m = tdMat(key, { map: tdLeafTex(kind), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82 });
  // (the merged geometry is in world space: the sway is worked out from where each leaf is, gusting through the crown)
  m.onBeforeCompile = sh => { sh.uniforms.uWT = TREE_T;
    sh.vertexShader = 'uniform float uWT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
      '  float wph = position.x * 0.31 + position.z * 0.23, gust = 0.6 + 0.4 * sin(uWT * 0.37 + position.x * 0.02);\n' +
      '  transformed.x += (sin(uWT * 1.9 + wph) * 0.05 + sin(uWT * 5.3 + wph * 3.1) * 0.015) * gust * clamp(position.y * 0.2, 0.0, 1.0);\n' +
      '  transformed.z += cos(uWT * 1.5 + wph * 1.3) * 0.04 * gust * clamp(position.y * 0.2, 0.0, 1.0);\n' +
      '  transformed.y += sin(uWT * 4.1 + wph * 2.0) * 0.012 * gust;'); };
  m.customProgramCacheKey = () => 'leafwind';
  return m;
}
const tdBarkMat = birch => birch ? tdMat('barkBirch', { map: TEXD.bark(), color: 0xe4e0d6, roughness: 0.9 }) : MT.bark;

// ---- a tree. kind 0: a broad-leaved shade tree (oak, maple); 1: a conifer; 2: a birch. s: its size. Built from a trunk
// that forks into limbs and twigs, a dense dark heart of foliage at each tip (what casts the shadow) and leaf cards round it
function tdTreeX(x, z, s, kind, o) {
  o = o || {}; s = s || 1; const K = new Kit(), C = new Kit(), seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5, R = (() => { let t = seed; return (a, b) => { t = (t * 9301 + 49297) % 233280; return a + (t / 233280) * (b - a); }; })();
  const bark = tdBarkMat(kind === 2), leafM = tdLeafMat(kind === 1 ? 1 : 0), core = kind === 1 ? tdMat('coreC', { color: 0x24381f, roughness: 1 }) : tdMat('coreB', { color: 0x2c4622, roughness: 1 });
  const hue = kind === 1 ? [0xd8e0d0, 0xc0ccb8, 0xe8eedc] : kind === 2 ? [0xffffff, 0xf0ffd0, 0xe8f8c0] : [0xffffff, 0xdfe8c8, 0xf2f0d0, 0xd0dcc0];
  const limb = (a, b, r0, r1) => { const d = new V3().subVectors(b, a), L = d.length(), g = new THREE.CylinderGeometry(r1, r0, L, o.far ? 5 : 7, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize())); K.add(bark, g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, { uv: [1, L * 0.6] }); };
  const cluster = (p, r) => {
    K.add(core, new THREE.IcosahedronGeometry(r * 0.58, 1), p.x, p.y, p.z, { sy: 0.8 });
    const n = o.far ? 7 : 12;
    for (let i = 0; i < n; i++) { const a = R(0, 6.283), e = R(-0.5, 1.0), d = r * R(0.35, 0.8), sz = r * R(1.25, 1.7);
      C.add(leafM, new THREE.PlaneGeometry(sz, sz), p.x + Math.cos(a) * Math.cos(e) * d, p.y + Math.sin(e) * d * 0.8, p.z + Math.sin(a) * Math.cos(e) * d, { rx: R(-1.2, 1.2), ry: R(0, 3.14), rz: R(-0.6, 0.6), col: hue[i % hue.length] }); }
  };
  if (kind === 1) {
    // a spruce: a straight trunk, tiers of drooping boughs, narrowing to the top
    const h = 7.5 * s; limb(new V3(0, 0, 0), new V3(0, h, 0), 0.2 * s, 0.03 * s); K.cyl(bark, 0, 0, 0, 0.26 * s, 0.32 * s, 0.3 * s, 8);
    const tiers = o.far ? 6 : 9;
    for (let t = 0; t < tiers; t++) { const f = t / tiers, y = h * (0.18 + f * 0.8), rr = (1 - f) * 2.3 * s + 0.35 * s;
      K.add(core, new THREE.ConeGeometry(rr * 0.8, 1.3 * s, 9, 1, true), 0, y + 0.3 * s, 0);
      const nb = o.far ? 6 : 9; for (let i = 0; i < nb; i++) { const a = i / nb * 6.283 + t * 0.7 + R(-0.2, 0.2), sz = rr * 1.25;
        C.add(leafM, new THREE.PlaneGeometry(sz, sz * 0.7), Math.cos(a) * rr * 0.55, y, Math.sin(a) * rr * 0.55, { ry: -a + Math.PI / 2, rx: 0.5 + R(-0.15, 0.15), col: hue[(i + t) % 3] }); } }
    C.add(leafM, new THREE.PlaneGeometry(0.9 * s, 1.4 * s), 0, h + 0.2 * s, 0, { col: hue[0] }); C.add(leafM, new THREE.PlaneGeometry(0.9 * s, 1.4 * s), 0, h + 0.2 * s, 0, { ry: 1.57, col: hue[1] });
  } else {
    // a trunk that leans a little, forks into limbs, each limb into twigs, foliage at the ends
    const birch = kind === 2, h = (birch ? 2.8 : 1.9) * s, top = new V3(R(-0.15, 0.15) * s, h, R(-0.15, 0.15) * s);
    limb(new V3(0, 0, 0), top, (birch ? 0.13 : 0.22) * s, (birch ? 0.1 : 0.17) * s);
    if (!birch) for (let i = 0; i < 4; i++) { const a = i * 1.57 + R(-0.3, 0.3); limb(new V3(0, 0, 0), new V3(Math.cos(a) * 0.35 * s, 0.05, Math.sin(a) * 0.35 * s), 0.1 * s, 0.05 * s); }
    const grow = (p, dir, L, r, d) => {
      const q = p.clone().addScaledVector(dir, L); limb(p, q, r, r * 0.68);
      if (d === 0) { cluster(q, (birch ? 1.15 : 1.45) * s * (o.big || 1)); return; }
      const nk = d === 2 ? (birch ? 3 : 5) : 3;
      for (let i = 0; i < nk; i++) { const a = (i / nk) * 6.283 + R(-0.5, 0.5), up = birch ? (d === 2 ? R(0.55, 0.8) : R(0.35, 0.7)) : (d === 2 ? R(0.25, 0.55) : R(0.1, 0.5));
        const nd = new V3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).add(dir.clone().multiplyScalar(0.35)).normalize();
        grow(q, nd, L * R(0.7, 0.9), r * 0.62, d - 1); }
      if (d === 1) cluster(q.clone().addScaledVector(dir, L * 0.3), (birch ? 0.75 : 1.3) * s);
    };
    grow(top, new V3(0, 1, 0), (birch ? 1.6 : 1.1) * s, (birch ? 0.1 : 0.17) * s, 2);
    // (and the top of the crown filled in over the fork)
    if (birch) for (let i = 0; i < 4; i++) { const a = i * 1.7 + R(0, 1); cluster(top.clone().add(new V3(Math.cos(a) * 0.7 * s, (1.2 + i * 0.6) * s, Math.sin(a) * 0.7 * s)), 1.0 * s); }
    if (!birch) { cluster(top.clone().add(new V3(0, 2.6 * s, 0)), 1.7 * s); cluster(top.clone().add(new V3(R(-1, 1) * s, 1.6 * s, R(-1, 1) * s)), 1.5 * s); }
  }
  K.build(x, 0, z, R(0, 6.28), { shadow: !o.far, deco: false }); C.build(x, 0, z, 0, { shadow: false, deco: false });
}

// ---- a neighbour's house, built in its own frame with its front toward local -z (it is then turned to face its road)
function tdNbr(cx, cz, ry, o) {
  const K = new Kit(), SV = tdMat('sidingVC', { map: TEXD.siding(), vertexColors: true, roughness: 0.8 }), BR = tdMat('nbrBrick', { map: TEX.brick || TEX.concrete, vertexColors: true, roughness: 0.92 });
  const pane = tdMat('nbrPane', { color: 0x223040, roughness: 0.06, metalness: 0.7 }), lit = tdMat('nbrLit', { color: 0x6a5a40, emissive: 0xffc070, emissiveIntensity: 0.55, roughness: 0.5 });
  const { w, d, col } = o, two = o.two, H = two ? 5.8 : 3.1, half = d / 2 + 0.45, S = o.pitch || 0.5, L = half / Math.cos(Math.atan(S)), shut = o.shut || 0x2f3e50;
  const sh = tdMat('shut' + shut, { color: shut, roughness: 0.6 });
  // walls: siding all round, a brick skirt along the front on some
  K.box(SV, 0, 0, 0, w, H, d, { col, uv: [w / 0.92, H / 0.6] });
  if (o.brick) K.box(BR, 0, 0, -d / 2 - 0.04, w + 0.04, 1.0, 0.08, { col: o.brick, uv: [w / 1.2, 1] });
  K.box(MT.conc, 0, 0, 0, w + 0.3, 0.25, d + 0.3);
  // the roof: gabled, an overhang, fascia and a ridge cap; gable ends filled in
  for (const sd of [-1, 1]) K.add(MT.shingle, new THREE.BoxGeometry(w + 0.7, 0.09, L + 0.06), 0, H + half * S / 2, sd * half / 2, { rx: sd * Math.atan(S), uv: [w / 1.6, L / 1.6] });
  K.box(MT.trim, 0, H + half * S - 0.03, 0, w + 0.72, 0.09, 0.18);
  for (const sd of [-1, 1]) K.box(MT.gutter, 0, H - 0.1, sd * (half + 0.02), w + 0.7, 0.12, 0.1);
  for (const lx of [-w / 2 - 0.002, w / 2 + 0.002]) tdPanel(K, SV, [[-d / 2, H], [d / 2, H], [0, H + (d / 2) * S]], lx, null, 0.92);
  // a brick chimney up one gable end
  if (o.chim) { const cx2 = o.chim * (w / 2 - 0.5); K.box(BR, cx2, 0, 0.6, 0.9, H + half * S + 0.9, 0.7, { col: 0xb07060, uv: [1, 6] }); K.box(MT.conc, cx2, H + half * S + 0.9, 0.6, 1.0, 0.08, 0.8); }
  // windows front and back on each floor, with trim, a pane and shutters; one or two lit behind
  const floors = two ? [1.0, 3.9] : [1.0], nW = Math.max(2, Math.round((w - 3) / 2.6));
  for (const fl of floors) for (let i = 0; i < nW; i++) { const lx = -w / 2 + 1.2 + (w - 2.4) * (i + 0.5) / nW;
    if (o.garageSide !== undefined && fl < 2 && Math.abs(lx - o.doorX) < 1.1) continue;
    for (const fz of [-1, 1]) { const zz = fz * (d / 2 + 0.01), on = ((i * 7 + Math.round(fl) * 3 + (fz > 0 ? 1 : 0) + Math.round(cx)) % 5) === 0;
      K.box(MT.trim, lx, fl - 0.08, zz, 1.26, 1.36, 0.05); K.box(on ? lit : pane, lx, fl, zz + fz * 0.02, 1.08, 1.12, 0.03);
      K.box(MT.trim, lx, fl + 0.55, zz + fz * 0.035, 0.05, 0.03, 0.01); K.box(MT.trim, lx, fl - 0.12, zz + fz * 0.05, 1.36, 0.06, 0.12);
      if (fz < 0) for (const sx of [-1, 1]) K.box(sh, lx + sx * 0.82, fl - 0.06, zz - 0.02, 0.36, 1.26, 0.03); } }
  // the front door under a little porch roof on two posts, a step, a lantern
  const dx = o.doorX || 0;
  K.box(tdMat('door' + (o.door || 0x6a2a2a), { color: o.door || 0x6a2a2a, roughness: 0.5 }), dx, 0.25, -d / 2 - 0.03, 1.0, 2.1, 0.06); K.box(MT.trim, dx, 0.25, -d / 2 - 0.02, 1.2, 2.2, 0.04); K.sph(MT.brass, dx + 0.35, 1.25, -d / 2 - 0.08, 0.03);
  K.box(MT.conc, dx, 0, -d / 2 - 0.9, 2.4, 0.25, 1.8); K.box(MT.conc, dx, 0, -d / 2 - 1.95, 1.6, 0.13, 0.4);
  for (const sx of [-1, 1]) K.box(MT.trim, dx + sx * 1.05, 0.25, -d / 2 - 1.6, 0.14, 2.55, 0.14);
  for (const sd of [-1, 1]) K.add(MT.shingle, new THREE.BoxGeometry(1.4, 0.06, 2.0), dx + sd * 0.62, 2.95, -d / 2 - 0.9, { rz: -sd * 0.5, uv: [1, 1.2] });
  K.box(MT.black, dx - 0.75, 1.6, -d / 2 - 0.07, 0.16, 0.3, 0.1); K.box(MT.glow, dx - 0.75, 1.65, -d / 2 - 0.12, 0.1, 0.18, 0.02);
  // a garage on one side: its door, a drive down to the road; a car on the drive on most
  if (o.garageSide !== undefined) { const gs = o.garageSide, gx = gs * (w / 2 + 2.0);
    K.box(SV, gx, 0, -0.4, 4.0, 2.9, d - 0.8, { col, uv: [4 / 0.92, 2.9 / 0.6] });
    for (const sd of [-1, 1]) K.add(MT.shingle, new THREE.BoxGeometry(4.5, 0.08, (d - 0.8) / 2 / Math.cos(0.35) + 0.4), gx, 2.9 + (d - 0.8) / 4 * Math.tan(0.35), -0.4 + sd * (d - 0.8) / 4, { rx: sd * 0.35, uv: [3, 2] });
    for (const sd of [-1, 1]) tdPanel(K, SV, [[-0.4 - (d - 0.8) / 2, 2.9], [-0.4 + (d - 0.8) / 2, 2.9], [-0.4, 2.9 + (d - 0.8) / 2 * Math.tan(0.35)]], gx + sd * 2.0, null, 0.92);
    K.box(MT.paintedS, gx, 0.05, -d / 2 - 0.01, 3.0, 2.25, 0.05); for (let k = 1; k < 4; k++) K.box(MT.trim, gx, 0.05 + k * 0.56, -d / 2 - 0.04, 3.0, 0.03, 0.02);
    K.box(MT.conc, gx, 0, -d / 2 - 4.5, 3.4, 0.02, 9.0);
    if (o.car !== undefined) tdCarK(K, gx, 0, -d / 2 - 4.2, Math.PI / 2, o.car);
    if (o.hoop) { K.box(MT.steel, gx + 1.9, 0, -d / 2 - 0.2, 0.08, 3.05, 0.08); K.box(MT.trim, gx + 1.9, 2.95, -d / 2 - 0.45, 1.1, 0.75, 0.04); K.add(tdMat('rim', { color: 0xd04a1a, roughness: 0.4 }), new THREE.TorusGeometry(0.23, 0.012, 6, 16), gx + 1.9, 3.05, -d / 2 - 0.72, { rx: Math.PI / 2 }); }
  }
  // the garden: a path, bushes along the front, a mailbox at the road, a flag by the door on some
  K.box(MT.conc, dx, 0, -d / 2 - 5.0, 1.1, 0.02, 6.0);
  for (let i = 0; i < 5; i++) { const bx = -w / 2 + 0.7 + i * (w - 1.4) / 4; if (Math.abs(bx - dx) < 1.4) continue; K.add(i % 2 ? MT.leaf : MT.leafD, new THREE.IcosahedronGeometry(0.5, 1), bx, 0.35, -d / 2 - 0.55, { sy: 0.8 }); }
  K.box(MT.oak, dx + 1.3, 0, -d / 2 - 7.8, 0.1, 1.05, 0.1); K.rbox(MT.black, dx + 1.3, 1.05, -d / 2 - 7.8, 0.22, 0.24, 0.46, 0.05);
  if (o.flag) { K.rod(MT.steel, new V3(dx + 1.0, 2.2, -d / 2 - 0.05), new V3(dx + 1.0, 3.0, -d / 2 - 0.8), 0.015); K.add(tdMat('flagC', { color: o.flag, roughness: 0.8, side: THREE.DoubleSide }), new THREE.PlaneGeometry(0.75, 0.45), dx + 1.0, 2.75, -d / 2 - 0.55, { ry: Math.PI / 2, rx: -0.85 }); }
  // the back: a deck or a swing set on some
  if (o.swing) { const sz = d / 2 + 5; for (const sx of [-1, 1]) for (const sd of [-1, 1]) K.rod(MT.steel, new V3(sx * 1.4, 2.2, sz), new V3(sx * 1.6, 0, sz + sd * 0.9), 0.04); K.rod(MT.steel, new V3(-1.5, 2.2, sz), new V3(1.5, 2.2, sz), 0.045);
    for (const sx of [-0.6, 0.6]) { for (const t of [-0.2, 0.2]) K.rod(MT.black, new V3(sx + t, 2.2, sz), new V3(sx + t, 0.5, sz), 0.008); K.box(tdMat('seat', { color: 0x2a5a9a, roughness: 0.6 }), sx, 0.47, sz, 0.5, 0.04, 0.2); } }
  K.build(cx, 0, cz, ry, { shadow: false, deco: false });
}
// a parked car drawn into a kit (no solids: the neighbours' cars and the far ones are only to look at)
function tdCarK(K, x, y, z, ry, color) {
  const T = new Kit(), BM = tdMat('car' + color, { color, metalness: 0.55, roughness: 0.28 }), M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  tdCarBody(T, BM);
  for (const [mat, list] of T.b) { let Lst = K.b.get(mat); if (!Lst) K.b.set(mat, Lst = []); for (const g of list) { g.applyMatrix4(M); Lst.push(g); } } T.b.clear();
}

// ---- everything round the house
const CAR_COLS = [0x34506e, 0x9a9a92, 0x6e2e2e, 0x2e2e2e, 0xd9d6cc, 0x2f4a3a, 0x7a6a50, 0x1f2a44, 0xa83a2a, 0x5a5f66];
const NBR_COLS = [0xd9cfbd, 0xa8b8c4, 0xe6d8a8, 0xc8a090, 0xb8c4a8, 0xc4b0a0, 0xc8c0b0, 0xa8b0b8, 0xe0e0d8, 0x9fb0a0, 0xd8c8b0, 0xb0a8c0];
function tdSurround() {
  // the neighbours: a row along each side past the hedge, every other one two storeys, facing out toward their own roads
  let k = 0;
  const row = (list, fix, axis, ry) => { for (const u of list) { const i = k++, two = i % 3 !== 1, w = two ? 12 + (i % 2) * 1.5 : 14, d = two ? 8 : 9;
    const [x, z] = axis === 'x' ? [u, fix] : [fix, u];
    tdNbr(x, z, ry, { w, d, col: NBR_COLS[i % NBR_COLS.length], two, chim: i % 4 === 0 ? 1 : i % 4 === 2 ? -1 : 0, brick: i % 3 === 0 ? 0xc0a090 : 0, shut: [0x2f3e50, 0x3d5248, 0x5a2a2a, 0x1e1e1e][i % 4],
      door: [0x6a2a2a, 0x2a3a5a, 0x2f4a3a, 0xe8e4d8][i % 4], doorX: (i % 2 ? -1 : 1) * (w / 4), garageSide: i % 4 === 3 ? undefined : (i % 2 ? 1 : -1), car: i % 5 === 4 ? undefined : CAR_COLS[(i * 3) % CAR_COLS.length],
      hoop: i % 6 === 2, flag: i % 5 === 1 ? 0x2a4a8a : 0, swing: i % 4 === 1, pitch: two ? 0.45 : 0.55 });
    // a tree or two in each front garden and one out back
    const tf = (lx, lz) => { const c = Math.cos(ry), s = Math.sin(ry); return [x + lx * c + lz * s, z - lx * s + lz * c]; };
    const [t1x, t1z] = tf((i % 2 ? 1 : -1) * (w / 2 - 1.5), -d / 2 - 6.5); tdTreeX(t1x, t1z, 1.15 + (i % 3) * 0.12, i % 7 === 3 ? 2 : 0, { far: true });
    const [t2x, t2z] = tf((i % 2 ? -1 : 1) * (w / 2 + 3), d / 2 + 6); tdTreeX(t2x, t2z, 1.2, i % 3 === 0 ? 1 : 0, { far: true }); } };
  row([-66, -44, -22, 0, 22, 44, 66], 58, 'x', 0);             // across the street, past the hedge, facing us
  row([-66, -44, -22, 0, 22, 44, 66], -58, 'x', Math.PI);       // behind the back gardens
  row([-36, -12, 12, 36], -60, 'z', -Math.PI / 2);              // down the west side
  row([-36, -12, 12, 36], 60, 'z', Math.PI / 2);                // and the east
  // woodland on the horizon all round: a ragged band of conifers and broadleaves
  for (let i = 0; i < 50; i++) { const a = i / 50 * 6.283 + Math.sin(i * 3.7) * 0.03, r = 92 + Math.abs(Math.sin(i * 7.3)) * 22, x = Math.cos(a) * r, z = Math.sin(a) * r;
    tdTreeX(x, z, 1.5 + Math.abs(Math.sin(i * 1.9)) * 0.9, i % 3 === 0 ? 0 : 1, { far: true });
    if (i % 2 === 0) tdTreeX(x + Math.cos(a) * 8, z + Math.sin(a) * 8, 1.7 + Math.abs(Math.cos(i * 2.3)) * 0.8, 1, { far: true }); }
  // inside the hedges: trees along the verges and in the corners, out of everyone's way
  for (const [x, z, s, kd] of [[-40, 42, 1.25, 0], [-24, 43, 1.1, 2], [8, 43.5, 1.3, 0], [24, 42.5, 1.15, 1], [40, 41, 1.3, 0], [42, 14, 1.2, 2], [42, -8, 1.25, 0], [41, -30, 1.3, 1], [24, -42, 1.2, 0], [-6, -42.5, 1.3, 0], [-40, -40, 1.25, 1], [-42, -24, 1.1, 2], [-42, 30, 1.2, 0], [26, 16.6, 0.95, 0], [-36, 16.6, 0.95, 2]]) townTree(x, z, s, kd);
  // more cars parked along the kerbs (they stop rounds and bodies like the others)
  for (const [x, z, al, c] of [[-40, 19.4, 'x', 0xd9d6cc], [-17.5, 19.4, 'x', 0x2f4a3a], [28, 19.4, 'x', 0x1f2a44], [36.5, 24.6, 'x', 0xa83a2a], [-38, 24.6, 'x', 0x5a5f66], [20, 24.6, 'x', 0x7a6a50], [-24.4, -22, 'z', 0x34506e], [-27.6, 8, 'z', 0xd9d6cc]]) tdCar(x, z, al, c);
}
// birds: a few loose flocks wheeling high over the neighbourhood, wings beating and gliding
const BIRDS = { m: null, list: [] };
function birdsInit() {
  if (BIRDS.m) return; const N = 26, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 9 * 2);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  BIRDS.m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a1c20, side: THREE.DoubleSide, fog: true })); BIRDS.m.frustumCulled = false; scene.add(BIRDS.m);
  for (let i = 0; i < N; i++) { const f = i % 3; BIRDS.list.push({ f, a: Math.random() * 6.28, r: 40 + f * 25 + Math.random() * 10, h: 28 + f * 9 + Math.random() * 6, sp: 0.07 + Math.random() * 0.02, ph: Math.random() * 6, off: [Math.random() * 6 - 3, Math.random() * 3, Math.random() * 6 - 3], cx: [-20, 30, 0][f], cz: [10, -30, 50][f] }); }
}
function updateBirds(dt) {
  if (!BIRDS.m) birdsInit(); const on = S.world === 'town' && !(typeof ENV !== 'undefined' && (ENV.w === 'rain' || ENV.w === 'storm')); BIRDS.m.visible = on; if (!on) return;
  const P_ = BIRDS.m.geometry.attributes.position.array; let o = 0;
  for (const b of BIRDS.list) { b.a += dt * b.sp * (b.f === 1 ? -1 : 1); b.ph += dt * 9;
    const x = b.cx + Math.cos(b.a) * b.r + b.off[0], z = b.cz + Math.sin(b.a) * b.r + b.off[2], y = b.h + b.off[1] + Math.sin(b.a * 3) * 2;
    const fx = -Math.sin(b.a) * (b.f === 1 ? -1 : 1), fz = Math.cos(b.a) * (b.f === 1 ? -1 : 1), sx = -fz, sz = fx, glide = Math.sin(b.ph * 0.13) > 0.3, flap = glide ? 0.12 : Math.sin(b.ph) * 0.55, sp = 0.55;
    // two triangles: each wing from the body out to its tip
    for (const s of [-1, 1]) { P_[o++] = x + fx * 0.25; P_[o++] = y; P_[o++] = z + fz * 0.25; P_[o++] = x - fx * 0.2; P_[o++] = y; P_[o++] = z - fz * 0.2;
      P_[o++] = x + sx * s * sp - fx * 0.12; P_[o++] = y + flap * sp; P_[o++] = z + sz * s * sp - fz * 0.12; } }
  BIRDS.m.geometry.attributes.position.needsUpdate = true;
}

// ---- module exports: build.mjs strips this block ----
export { TREE_T, tdSurround, tdTreeX, updateBirds };
// ---- end module exports ----
