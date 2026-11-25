// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, rnd } from './00-setup.js';
import { TEX, addBox, canvasTex, mat, speckle, worldGroup, worldMeshes } from './01-world.js';
import { HOUSE, TOWN, lampMat } from './01b-town.js';
import { tdSurround, tdTreeX } from './01d-town-surround.js';
import { inside } from './10-audio.js';
import { fx } from './11-fx.js';
import { DESTR, spawnDebris, wallShape } from './15-destruction.js';
import { DOOR_FW, DOOR_H, DOOR_W, doors } from './15b-doors.js';
import { P, S } from './17-dummies.js';
import { ez, seg } from './19c-toolvm.js';
import { items } from './21-items-inventory.js';
// ---- end module links ----
// ---------------------------------------------------------------- the house, furnished and finished
// Everything that makes the house look lived in: furniture, fittings, finishes, trim, the roof, the garden and the street.
// Each piece of furniture is a detailed model (merged into a mesh or two per material, so it costs a draw or two) over a
// tight box that is what bodies, rounds and grenades actually meet; the box itself is never drawn. Little things (books,
// cushions, lamps on a table) ride on the box of what they sit on, so they go with it when it breaks.
// Local coordinates of a piece: centred on its footprint, standing on y 0, its front facing +z (its back against a wall
// is at -z). rot turns it about y: 0 front south (+z), PI front north, PI/2 front east (+x), -PI/2 front west.

// ---- textures (made once, kept between rounds)
const TDX = {};
function tdTex(key, size, draw) {
  if (TDX[key]) return TDX[key];
  const t = canvasTex(draw, size); t.userData.shared = true; return TDX[key] = t;
}
const tdRnd = (a, b) => a + Math.random() * (b - a);
function tdWood(g, s, base, dark) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) {
    const y0 = Math.random() * s, a = tdRnd(0.04, 0.16); g.strokeStyle = (Math.random() < 0.6 ? 'rgba(' + dark + ',' : 'rgba(255,240,220,') + a + ')'; g.lineWidth = tdRnd(0.6, 2.4);
    g.beginPath(); for (let x = 0; x <= s; x += 8) { const y = y0 + Math.sin(x * 0.02 + i) * 3 + Math.sin(x * 0.07 + i * 3) * 1.2; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  }
  for (let i = 0; i < 4; i++) { const x = Math.random() * s, y = Math.random() * s; const gr = g.createRadialGradient(x, y, 1, x, y, tdRnd(4, 10)); gr.addColorStop(0, 'rgba(' + dark + ',0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 12, y - 12, 24, 24); }
}
const TEXD = {
  wood: () => tdTex('wood', 256, (g, s) => tdWood(g, s, '#b9b9b9', '40,25,10')),
  floorWood: () => tdTex('floorWood', 512, (g, s) => {
    const rows = 8, rh = s / rows;
    for (let r = 0; r < rows; r++) { let x = -Math.random() * s * 0.5; while (x < s) { const L = tdRnd(s * 0.35, s * 0.8), v = tdRnd(-18, 18) | 0;
      g.fillStyle = 'rgb(' + (168 + v) + ',' + (122 + v) + ',' + (80 + v * 0.7 | 0) + ')'; g.fillRect(x, r * rh, L, rh);
      for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(70,40,15,' + tdRnd(0.05, 0.18) + ')'; g.lineWidth = tdRnd(0.5, 1.6); const yy = r * rh + Math.random() * rh; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + L * 0.3, yy + tdRnd(-3, 3), x + L * 0.6, yy + tdRnd(-3, 3), x + L, yy + tdRnd(-2, 2)); g.stroke(); }
      g.fillStyle = 'rgba(40,22,8,0.55)'; g.fillRect(x, r * rh, 1.5, rh); x += L; }
      g.fillStyle = 'rgba(40,22,8,0.5)'; g.fillRect(0, r * rh, s, 1.5); }
  }),
  tile: () => tdTex('tile', 256, (g, s) => { const n = 4, c = s / n; g.fillStyle = '#9a968e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = tdRnd(-10, 10) | 0; g.fillStyle = 'rgb(' + (228 + v) + ',' + (226 + v) + ',' + (220 + v) + ')'; g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
      for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(120,115,105,' + tdRnd(0.03, 0.1) + ')'; g.fillRect(i * c + Math.random() * c, j * c + Math.random() * c, 2, 2); } } }),
  tileDark: () => tdTex('tileDark', 256, (g, s) => { const n = 2, c = s / n; g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = tdRnd(-8, 8) | 0; g.fillStyle = 'rgb(' + (92 + v) + ',' + (88 + v) + ',' + (84 + v) + ')'; g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
      for (let k = 0; k < 140; k++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,0') + ',' + tdRnd(0.03, 0.09) + ')'; g.fillRect(i * c + Math.random() * c, j * c + Math.random() * c, 2, 2); } } }),
  carpet: () => tdTex('carpet', 256, (g, s) => speckle(g, s, '#bdbdbd', 0.16, 16000)),
  fabric: () => tdTex('fabric', 128, (g, s) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 2) { g.fillStyle = 'rgba(0,0,0,' + tdRnd(0.03, 0.09) + ')'; g.fillRect(i, 0, 1, s); g.fillStyle = 'rgba(255,255,255,' + tdRnd(0.02, 0.07) + ')'; g.fillRect(0, i, s, 1); } }),
  marble: () => tdTex('marble', 256, (g, s) => { g.fillStyle = '#ece9e4'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(110,105,100,' + tdRnd(0.08, 0.3) + ')'; g.lineWidth = tdRnd(0.5, 2); let x = Math.random() * s, y = 0; g.beginPath(); g.moveTo(x, y); while (y < s) { x += tdRnd(-12, 12); y += tdRnd(6, 18); g.lineTo(x, y); } g.stroke(); } }),
  shingle: () => tdTex('shingle', 256, (g, s) => { const rows = 8, rh = s / rows; g.fillStyle = '#26272a'; g.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) { const off = (r % 2) * 16; for (let x = -32 + off; x < s; x += 32) { const v = tdRnd(-12, 12) | 0; g.fillStyle = 'rgb(' + (74 + v) + ',' + (70 + v) + ',' + (68 + v) + ')'; g.fillRect(x + 1, r * rh, 30, rh - 3);
      for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,0') + ',' + tdRnd(0.04, 0.14) + ')'; g.fillRect(x + Math.random() * 30, r * rh + Math.random() * rh, 1.5, 1.5); } }
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, r * rh + rh - 3, s, 3); } }),
  siding: () => tdTex('siding', 256, (g, s) => { const n = 4, bh = s / n; for (let i = 0; i < n; i++) { const gr = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh); gr.addColorStop(0, '#d9d6cf'); gr.addColorStop(0.85, '#f4f2ec'); gr.addColorStop(1, '#8e8b84'); g.fillStyle = gr; g.fillRect(0, i * bh, s, bh); }
    for (let k = 0; k < 2500; k++) { g.fillStyle = 'rgba(0,0,0,' + tdRnd(0.01, 0.05) + ')'; g.fillRect(Math.random() * s, Math.random() * s, 3, 1); } }),
  rug: k => tdTex('rug' + k, 512, (g, s) => {
    const P = [['#7a2a24', '#d8c7a0', '#23324f', '#b8862f'], ['#2f4858', '#e4dccb', '#a65e3d', '#86a39a'], ['#5b5f66', '#efe9de', '#c7b08a', '#3b3d42'], ['#3f7fbf', '#f5d547', '#e35d5b', '#6cc070']][k % 4];
    g.fillStyle = P[0]; g.fillRect(0, 0, s, s);
    if (k === 3) { for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.fillStyle = P[(i + j) % 4]; g.beginPath(); g.arc(s * (i + 0.5) / 6, s * (j + 0.5) / 6, s / 16, 0, 7); g.fill(); } }
    else {
      for (let b = 0; b < 3; b++) { g.strokeStyle = P[1 + b % 3]; g.lineWidth = s * 0.02; const m = s * (0.05 + b * 0.05); g.strokeRect(m, m, s - 2 * m, s - 2 * m); }
      if (k === 0) { g.fillStyle = P[2]; g.beginPath(); g.moveTo(s / 2, s * 0.22); g.lineTo(s * 0.78, s / 2); g.lineTo(s / 2, s * 0.78); g.lineTo(s * 0.22, s / 2); g.closePath(); g.fill(); g.fillStyle = P[3]; g.beginPath(); g.arc(s / 2, s / 2, s * 0.1, 0, 7); g.fill();
        for (let i = 0; i < 40; i++) { g.fillStyle = P[1 + (i % 3)]; g.fillRect(s * 0.22 + Math.random() * s * 0.56, s * 0.22 + Math.random() * s * 0.56, 6, 6); } }
      else if (k === 1) { for (let i = 0; i < 9; i++) { g.fillStyle = P[1 + i % 3]; g.fillRect(s * 0.2, s * (0.2 + i * 0.068), s * 0.6, s * 0.03); } }
      else { for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { g.strokeStyle = P[1 + (i * j) % 3]; g.lineWidth = 3; g.strokeRect(s * (0.22 + i * 0.112), s * (0.22 + j * 0.112), s * 0.08, s * 0.08); } }
    }
    for (let i = 0; i < 20000; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,0') + ',' + tdRnd(0.02, 0.07) + ')'; g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); }
  }),
  art: k => tdTex('art' + k, 256, (g, s) => {
    if (k === 0) { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#f2b57a'); gr.addColorStop(0.55, '#e7d3b0'); gr.addColorStop(0.56, '#6d8a8f'); gr.addColorStop(1, '#2f4a55'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
      g.fillStyle = '#3c4f4a'; g.beginPath(); g.moveTo(0, s * 0.56); for (let x = 0; x <= s; x += 16) g.lineTo(x, s * (0.4 + Math.sin(x * 0.03) * 0.06 + Math.random() * 0.03)); g.lineTo(s, s * 0.56); g.fill(); g.fillStyle = '#fff3d6'; g.beginPath(); g.arc(s * 0.7, s * 0.3, s * 0.07, 0, 7); g.fill(); }
    else if (k === 1) { g.fillStyle = '#efe8da'; g.fillRect(0, 0, s, s); for (let i = 0; i < 9; i++) { g.fillStyle = ['#c0463a', '#24496b', '#e3b23c', '#1c1c1c', '#7c9a7a'][i % 5]; const w = tdRnd(30, 110), h = tdRnd(30, 110); g.globalAlpha = 0.85; g.fillRect(tdRnd(0, s - w), tdRnd(0, s - h), w, h); } g.globalAlpha = 1; }
    else if (k === 2) { g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, s, s); g.strokeStyle = '#3d5c3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(s / 2, s * 0.92); g.bezierCurveTo(s * 0.45, s * 0.6, s * 0.55, s * 0.4, s / 2, s * 0.1); g.stroke();
      for (let i = 0; i < 10; i++) { const y = s * (0.2 + i * 0.07), sd = i % 2 ? 1 : -1; g.fillStyle = i % 3 ? '#5f8a4f' : '#7aa36a'; g.beginPath(); g.ellipse(s / 2 + sd * 30, y, 28, 10, sd * 0.5, 0, 7); g.fill(); } }
    else { const gr = g.createRadialGradient(s * 0.4, s * 0.4, 10, s / 2, s / 2, s * 0.7); gr.addColorStop(0, '#d9a441'); gr.addColorStop(0.5, '#8c3b2e'); gr.addColorStop(1, '#1f1a24'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(255,230,180,' + tdRnd(0.1, 0.4) + ')'; g.lineWidth = tdRnd(1, 5); g.beginPath(); g.arc(s / 2, s / 2, tdRnd(20, 120), tdRnd(0, 6), tdRnd(0, 6)); g.stroke(); } }
  }),
  poster: k => tdTex('poster' + k, 256, (g, s) => {
    const C = [['#1b2a4a', '#f2c14e', '#f78154'], ['#2d6a4f', '#f4f1de', '#e07a5f'], ['#5e3c99', '#ffd166', '#06d6a0']][k % 3];
    g.fillStyle = C[0]; g.fillRect(0, 0, s, s); g.fillStyle = C[1]; g.beginPath(); g.arc(s / 2, s * 0.42, s * 0.24, 0, 7); g.fill();
    g.fillStyle = C[2]; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(tdRnd(20, s - 20), tdRnd(20, s * 0.8), tdRnd(4, 14), 0, 7); g.fill(); }
    g.fillStyle = C[1]; g.fillRect(s * 0.15, s * 0.78, s * 0.7, s * 0.06); g.fillRect(s * 0.25, s * 0.87, s * 0.5, s * 0.03);
  }),
  shade: () => tdTex('shade', 128, (g, s) => { g.fillStyle = '#e9e0cf'; g.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 3) { g.fillStyle = 'rgba(120,100,70,0.06)'; g.fillRect(i, 0, 1, s); } }),
  louver: () => tdTex('louver', 128, (g, s) => { for (let i = 0; i < 12; i++) { const gr = g.createLinearGradient(0, i * s / 12, 0, (i + 1) * s / 12); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8a8a8a'); g.fillStyle = gr; g.fillRect(0, i * s / 12, s, s / 12); } }),
  bark: () => tdTex('bark', 128, (g, s) => { g.fillStyle = '#5a4634'; g.fillRect(0, 0, s, s); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,' + tdRnd(0.1, 0.35) + ')'; g.fillRect(Math.random() * s, 0, tdRnd(1, 3), s); } for (let i = 0; i < 800; i++) { g.fillStyle = 'rgba(255,230,200,' + tdRnd(0.03, 0.1) + ')'; g.fillRect(Math.random() * s, Math.random() * s, 2, 4); } }),
  leaves: () => tdTex('leaves', 128, (g, s) => { g.fillStyle = '#4c6d38'; g.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(20,40,10,' + tdRnd(0.2, 0.5) + ')' : 'rgba(150,190,90,' + tdRnd(0.1, 0.35) + ')'; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, tdRnd(2, 5), tdRnd(1, 3), Math.random() * 3, 0, 7); g.fill(); } }),
  stone: () => tdTex('stone', 256, (g, s) => { speckle(g, s, '#8f8a82', 0.25, 9000); g.strokeStyle = 'rgba(40,36,30,0.6)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); for (let j = 0; j < 3; j++) { const x = (j + (i % 2) * 0.5) * s / 3; g.beginPath(); g.moveTo(x, i * s / 4); g.lineTo(x, (i + 1) * s / 4); g.stroke(); } } })
};
// ---- materials (shared: kept between rounds)
const TDM = {};
function tdMat(key, o) {
  if (TDM[key]) return TDM[key];
  const m = o.basic ? new THREE.MeshBasicMaterial(o.basic) : new THREE.MeshStandardMaterial(o); m.userData.shared = true; return TDM[key] = m;
}
const MT = {
  get trim() { return tdMat('trim', { color: 0xf1eee7, roughness: 0.45 }); },
  get oak() { return tdMat('oak', { map: TEXD.wood(), color: 0xd2a271, roughness: 0.6 }); },
  get walnut() { return tdMat('walnut', { map: TEXD.wood(), color: 0x7d5234, roughness: 0.55 }); },
  get dark() { return tdMat('darkw', { map: TEXD.wood(), color: 0x4a3122, roughness: 0.5 }); },
  get painted() { return tdMat('painted', { color: 0xe7e2d8, roughness: 0.55 }); },
  get paintedG() { return tdMat('paintedG', { color: 0x5f6f66, roughness: 0.55 }); },
  get paintedS() { return tdMat('paintedS', { color: 0xd3cdc1, roughness: 0.6 }); },
  get paintedB() { return tdMat('paintedB', { color: 0x2f3e50, roughness: 0.55 }); },
  fab(c) { return tdMat('fab' + c, { map: TEXD.fabric(), color: c, roughness: 0.95 }); },
  get leather() { return tdMat('leather', { color: 0x6b3f25, roughness: 0.5 }); },
  get chrome() { return tdMat('chrome', { color: 0xdedede, metalness: 0.9, roughness: 0.18 }); },
  get steel() { return tdMat('steel', { color: 0xb6b9bd, metalness: 0.75, roughness: 0.32 }); },
  get black() { return tdMat('blackm', { color: 0x1c1c1e, roughness: 0.55 }); },
  get blackG() { return tdMat('blackg', { color: 0x0c0d10, roughness: 0.15, metalness: 0.3 }); },
  get ceramic() { return tdMat('ceramic', { color: 0xf5f5f2, roughness: 0.12 }); },
  get glass() { return tdMat('glass', { color: 0xc8dde8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }); },
  get mirror() { return tdMat('mirror', { color: 0xd4dbe0, metalness: 1, roughness: 0.04 }); },
  get marble() { return tdMat('marble', { map: TEXD.marble(), roughness: 0.18 }); },
  get brass() { return tdMat('brass', { color: 0xb8913f, metalness: 0.85, roughness: 0.3 }); },
  get paper() { return tdMat('paper', { color: 0xf3efe6, roughness: 0.9 }); },
  get linen() { return tdMat('linen', { map: TEXD.fabric(), color: 0xf1ede5, roughness: 0.95 }); },
  get pot() { return tdMat('pot', { color: 0xb0603a, roughness: 0.85 }); },
  get potW() { return tdMat('potW', { color: 0xe8e4dc, roughness: 0.35 }); },
  get soil() { return tdMat('soil', { color: 0x35261b, roughness: 1 }); },
  get leaf() { return tdMat('leaf', { map: TEXD.leaves(), color: 0x6f9a55, roughness: 0.9 }); },
  get leafD() { return tdMat('leafD', { map: TEXD.leaves(), color: 0x46663a, roughness: 0.9 }); },
  get bark() { return tdMat('bark', { map: TEXD.bark(), roughness: 1 }); },
  get vc() { return tdMat('vc', { vertexColors: true, roughness: 0.7 }); },
  get vcG() { return tdMat('vcg', { vertexColors: true, roughness: 0.3 }); },
  get shade() { return lampMat; },
  get shadeT() { return tdMat('shadeT', { map: TEXD.shade(), color: 0xf2e6cf, emissive: 0xffd8a0, emissiveIntensity: 0.15, roughness: 0.9 }); },
  rug(k) { return tdMat('rug' + k, { map: TEXD.rug(k), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }); },
  art(k) { return tdMat('art' + k, { map: TEXD.art(k), roughness: 0.7 }); },
  poster(k) { return tdMat('poster' + k, { map: TEXD.poster(k), roughness: 0.8 }); },
  get louver() { return tdMat('louver', { map: TEXD.louver(), color: 0x3d5248, roughness: 0.6 }); },
  get shingle() { return tdMat('shingle', { map: TEXD.shingle(), roughness: 0.95 }); },
  get siding() { return tdMat('siding', { map: TEXD.siding(), color: 0xe9e4d6, roughness: 0.8 }); },
  get gutter() { return tdMat('gutter', { color: 0xe6e4df, roughness: 0.4, metalness: 0.2 }); },
  get stone() { return tdMat('stone', { map: TEXD.stone(), roughness: 0.95 }); },
  get conc() { return tdMat('conc', { map: TEX.concrete, color: 0xbab6ae, roughness: 0.95 }); },
  get glow() { return tdMat('glow', { color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 1.2, roughness: 0.5 }); }
};
// ---- the kit: geometry gathered per material, then merged into one mesh each
const _kM = new THREE.Matrix4(), _kQ = new THREE.Quaternion(), _kE = new THREE.Euler(), _kS = new V3(), _kP = new V3(), _kC = new THREE.Color();
class Kit {
  constructor() { this.b = new Map(); }
  add(mat, geo, x, y, z, o) {
    o = o || {}; let g = geo.index ? geo.toNonIndexed() : geo.clone(); if (geo !== g) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.uv) { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * o.uv[0], U.getY(i) * o.uv[1]); }
    g.clearGroups(); g.morphAttributes = {};
    _kM.compose(_kP.set(x, y, z), _kQ.setFromEuler(_kE.set(o.rx || 0, o.ry || 0, o.rz || 0)), _kS.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)); g.applyMatrix4(_kM);
    if (mat.vertexColors) { _kC.set(o.col ?? 0xffffff); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = _kC.r; a[i * 3 + 1] = _kC.g; a[i * 3 + 2] = _kC.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    let L = this.b.get(mat); if (!L) this.b.set(mat, L = []); L.push(g); return this;
  }
  // a box standing on y (its bottom), centred on x, z
  box(mat, x, y, z, w, h, d, o) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, o); }
  rbox(mat, x, y, z, w, h, d, r, o) { return this.add(mat, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), x, y + h / 2, z, o); }
  cyl(mat, x, y, z, rt, rb, h, seg, o) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg || 14), x, y + h / 2, z, o); }
  // a rod from a to b (local points)
  rod(mat, a, b, r, seg) { const d = new V3().subVectors(b, a), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, seg || 8); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize())); return this.add(mat, g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); }
  sph(mat, x, y, z, r, o) { return this.add(mat, new THREE.SphereGeometry(r, 14, 10), x, y, z, o); }
  lathe(mat, pts, x, y, z, o) { return this.add(mat, new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 20), x, y, z, o); }
  plane(mat, x, y, z, w, h, o) { return this.add(mat, new THREE.PlaneGeometry(w, h), x, y, z, o); }
  // the merged meshes in a group placed at (x, y, z) turned by ry; deco: goes with the box it sits in
  build(x, y, z, ry, opt) {
    opt = opt || {}; const G = new THREE.Group(); G.position.set(x, y, z); G.rotation.y = ry || 0;
    for (const [mat, list] of this.b) {
      const g = mergeGeometries(list, false); for (const q of list) q.dispose(); if (!g) continue;
      const m = new THREE.Mesh(g, mat); m.castShadow = !!opt.shadow && !mat.transparent; m.receiveShadow = !mat.transparent; m.userData.deco = true; G.add(m);
    }
    G.userData.deco = opt.deco !== false; G.userData.td = true; (opt.parent || worldGroup).add(G); this.b.clear(); return G;
  }
}
// ---- the solid part of a piece: a hidden box (bodies and rounds meet it; the model over it is what is seen)
// placed in the piece's own frame (lx, lz: its centre; w across, d deep, h tall, standing on ly)
const TD = { furn: [], keep: [], wall: [] };
function tdPiece(x, y, z, rot) { return { x, y, z, rot, c: Math.round(Math.cos(rot)), s: Math.round(Math.sin(rot)) }; }
function tdWorld(P, lx, lz) { return [P.x + lx * P.c + lz * P.s, P.z - lx * P.s + lz * P.c]; }
function tdCol(P, lx, lz, w, d, h, ly, kind, surf) {
  const [cx, cz] = tdWorld(P, lx, lz), sw = P.s !== 0, W = sw ? d : w, D = sw ? w : d;
  addBox(cx, P.y + (ly || 0), cz, W, h, D, kind || 'crate', 0x7a5a3a);
  const m = worldMeshes[worldMeshes.length - 1]; m.material.visible = false; m.castShadow = m.receiveShadow = false; m.userData.furn = true; if (surf) m.userData.surf = surf;
  TD.furn.push(m); return m;
}
// ---- the pieces
const CUSH = 0.06;
function tdSofa(x, y, z, rot, w, fab, o) {
  o = o || {}; const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.92, F = MT.fab(fab), arm = o.arms === false ? 0 : 0.2, legM = MT.dark;
  K.rbox(F, 0, 0.1, -d / 2 + 0.11, w, 0.78, 0.22, 0.05);                                // back
  if (arm) for (const s of [-1, 1]) K.rbox(F, s * (w / 2 - arm / 2), 0.1, 0.02, arm, 0.52, d - 0.04, 0.05);  // arms
  K.rbox(F, 0, 0.1, 0.04, w - arm * 2, 0.24, d - 0.26, 0.04);                          // base
  const n = Math.max(1, Math.round((w - arm * 2) / 0.72)), cw = (w - arm * 2) / n;
  for (let i = 0; i < n; i++) { const cx = -w / 2 + arm + cw * (i + 0.5);
    K.rbox(F, cx, 0.34, 0.08, cw - 0.02, 0.13, d - 0.32, CUSH);                           // seat cushions
    K.rbox(F, cx, 0.42, -d / 2 + 0.28, cw - 0.04, 0.46, 0.16, CUSH, { rx: -0.18 }); }       // back cushions
  if (o.pillows) for (const [px, c] of o.pillows) K.rbox(MT.vc, px, 0.48, -d / 2 + 0.42, 0.42, 0.38, 0.13, 0.05, { rx: -0.25, ry: px * 0.15, col: c });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(legM, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 0.022, 0.016, 0.1, 8);
  K.build(x, y, z, rot);
  tdCol(P, 0, 0.04, w, d - 0.04, 0.48, 0, 'crate', 'wood'); tdCol(P, 0, -d / 2 + 0.11, w, 0.22, 0.88 - 0.48, 0.48);
}
function tdArmchair(x, y, z, rot, fab, leather) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.86, d = 0.86, F = leather ? MT.leather : MT.fab(fab);
  K.rbox(F, 0, 0.12, -d / 2 + 0.1, w, 0.8, 0.2, 0.06); for (const s of [-1, 1]) K.rbox(F, s * (w / 2 - 0.09), 0.12, 0.02, 0.18, 0.5, d - 0.04, 0.06);
  K.rbox(F, 0, 0.12, 0.05, w - 0.36, 0.22, d - 0.24, 0.04); K.rbox(F, 0, 0.34, 0.07, w - 0.38, 0.12, d - 0.3, CUSH); K.rbox(F, 0, 0.44, -d / 2 + 0.26, w - 0.4, 0.42, 0.14, CUSH, { rx: -0.15 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(MT.dark, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07), 0.02, 0.014, 0.12, 8);
  K.build(x, y, z, rot); tdCol(P, 0, 0.02, w, d - 0.04, 0.5); tdCol(P, 0, -d / 2 + 0.1, w, 0.2, 0.42, 0.5);
}
function tdCoffeeTable(x, y, z, rot, w, d, round) {
  const P = tdPiece(x, y, z, rot), K = new Kit();
  if (round) { K.cyl(MT.walnut, 0, 0.38, 0, w / 2, w / 2, 0.04, 28); K.cyl(MT.walnut, 0, 0.06, 0, w / 2 - 0.08, w / 2 - 0.08, 0.02, 28); for (let i = 0; i < 3; i++) { const a = i * 2.09; K.cyl(MT.dark, Math.cos(a) * w * 0.32, 0, Math.sin(a) * w * 0.32, 0.02, 0.016, 0.38, 8); } }
  else { K.rbox(MT.walnut, 0, 0.36, 0, w, 0.05, d, 0.012); K.box(MT.walnut, 0, 0.1, 0, w - 0.12, 0.02, d - 0.12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(MT.dark, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.04, 0.36, 0.04); }
  // a book, a bowl, a small plant on it
  K.box(MT.vc, -w * 0.22, 0.41, 0, 0.22, 0.03, 0.16, { ry: 0.3, col: 0x8a3a2a }); K.box(MT.vc, -w * 0.22, 0.44, 0.01, 0.2, 0.025, 0.15, { ry: 0.25, col: 0x2a4a6a });
  K.lathe(MT.potW, [[0, 0], [0.09, 0.01], [0.12, 0.06], [0.11, 0.07]], w * 0.2, 0.41, 0);
  K.build(x, y, z, rot); tdCol(P, 0, 0, round ? w : w, round ? w : d, 0.41);
}
function tdSideTable(x, y, z, rot, lampOn) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), s = 0.46;
  K.rbox(MT.oak, 0, 0.5, 0, s, 0.04, s, 0.01); K.box(MT.oak, 0, 0.12, 0, s - 0.06, 0.02, s - 0.06); for (const a of [-1, 1]) for (const b of [-1, 1]) K.box(MT.oak, a * (s / 2 - 0.03), 0, b * (s / 2 - 0.03), 0.035, 0.5, 0.035);
  if (lampOn) tdTableLamp(K, 0.02, 0.54, -0.02, 1);
  K.build(x, y, z, rot); tdCol(P, 0, 0, s, s, 0.54);
}
function tdTableLamp(K, x, y, z, k) {
  k = k || 1; K.lathe(MT.potW, [[0, 0], [0.07 * k, 0], [0.08 * k, 0.03 * k], [0.06 * k, 0.18 * k], [0.02 * k, 0.26 * k], [0.012 * k, 0.3 * k]], x, y, z);
  K.add(MT.shadeT, new THREE.CylinderGeometry(0.1 * k, 0.15 * k, 0.18 * k, 20, 1, true), x, y + 0.36 * k, z);
}
function tdFloorLamp(x, y, z) {
  const P = tdPiece(x, y, z, 0), K = new Kit();
  K.cyl(MT.black, 0, 0, 0, 0.15, 0.16, 0.025, 20); K.cyl(MT.brass, 0, 0.02, 0, 0.012, 0.012, 1.45, 8);
  K.add(MT.shadeT, new THREE.CylinderGeometry(0.16, 0.22, 0.28, 22, 1, true), 0, 1.5, 0);
  K.build(x, y, z, 0); tdCol(P, 0, 0, 0.34, 0.34, 1.62);
}
function tdTV(K, x, y, z, w) {
  const h = w * 0.58; K.rbox(MT.blackG, x, y + 0.08, z, w, h, 0.045, 0.01); K.plane(MT.blackG, x, y + 0.08 + h / 2, z + 0.024, w - 0.03, h - 0.03);
  K.box(MT.black, x, y, z, 0.3, 0.012, 0.2); K.box(MT.black, x, y, z - 0.01, 0.05, 0.1, 0.03);
}
function tdMediaUnit(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.42, h = 0.5;
  K.rbox(MT.walnut, 0, 0.06, 0, w, h - 0.06, d, 0.01); for (const s of [-1, 1]) K.box(MT.black, s * (w / 2 - 0.06), 0, 0, 0.04, 0.06, d - 0.08);
  for (let i = 0; i < 3; i++) K.box(MT.dark, -w / 2 + w * (i + 0.5) / 3, 0.1, d / 2 + 0.002, w / 3 - 0.02, h - 0.14, 0.006);
  for (let i = 0; i < 3; i++) K.box(MT.brass, -w / 2 + w * (i + 0.5) / 3, 0.28, d / 2 + 0.01, 0.12, 0.012, 0.012);
  tdTV(K, 0, h, -0.06, Math.min(1.4, w * 0.75));
  K.box(MT.vc, w * 0.38, h, 0.05, 0.12, 0.2, 0.12, { col: 0x2b2b2b }); K.lathe(MT.potW, [[0, 0], [0.06, 0.01], [0.07, 0.12], [0.04, 0.2]], -w * 0.4, h, 0.05);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
// shelves of books: rows of books of all sizes and colours (one draw: they share a vertex-coloured material)
const BOOKC = [0x7a2a24, 0x23324f, 0x3c5a3a, 0xc8a24a, 0x5a3a5a, 0x2b2b2b, 0xd8d0c0, 0x8a5a2a, 0x2f5e7a, 0xa04030, 0x556b2f, 0x6b4c3b];
function tdBooks(K, x0, x1, y, z, depth, hMax) {
  let x = x0 + 0.01; while (x < x1 - 0.03) { const t = tdRnd(0.018, 0.045), h = tdRnd(hMax * 0.62, hMax), lean = Math.random() < 0.07;
    if (x + t > x1 - 0.01) break; K.box(MT.vc, x + t / 2, y, z, t, h, depth * tdRnd(0.75, 0.95), { col: BOOKC[(Math.random() * BOOKC.length) | 0], rz: lean ? 0.12 : 0 }); x += t + (lean ? 0.03 : 0.002);
    if (Math.random() < 0.06) x += tdRnd(0.06, 0.16); }
}
function tdBookcase(x, y, z, rot, w, h, mat) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.36, M = mat || MT.walnut, n = Math.max(3, Math.round(h / 0.36)), t = 0.025;
  K.box(M, 0, 0, -d / 2 + 0.005, w, h, 0.01); for (const s of [-1, 1]) K.box(M, s * (w / 2 - t / 2), 0, 0, t, h, d); K.box(M, 0, h - t, 0, w, t, d); K.box(M, 0, 0, 0.0, w, 0.08, d);
  for (let i = 1; i < n; i++) { const yy = 0.08 + (h - 0.1) * i / n; K.box(M, 0, yy - t / 2, 0, w - 2 * t, t, d - 0.01); }
  for (let i = 0; i < n; i++) { const yy = 0.08 + (h - 0.1) * i / n + t / 2, hh = (h - 0.1) / n - t - 0.03;
    if (i === n - 1 && Math.random() < 0.6) { K.lathe(MT.potW, [[0, 0], [0.05, 0], [0.07, 0.1], [0.04, 0.2], [0.03, 0.22]], -w * 0.25, yy, 0); tdBooks(K, 0, w / 2 - t, yy, 0, d, hh); }
    else tdBooks(K, -w / 2 + t, w / 2 - t, yy, 0, d, Math.min(0.3, hh)); }
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdChair(K, x, z, ry, M, seatC, armless) {
  // a dining chair: four tapered legs, a seat with a pad, a back of slats (in the kit's own frame)
  const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c], w = 0.44;
  for (const a of [-1, 1]) for (const b of [-1, 1]) { const [px, pz] = at(a * 0.18, b * 0.18); K.cyl(M, px, 0, pz, 0.018, 0.014, 0.45, 8); }
  { const [px, pz] = at(0, 0); K.rbox(M, px, 0.44, pz, w, 0.04, w, 0.01, { ry }); K.rbox(seatC, px, 0.48, pz, w - 0.06, 0.035, w - 0.06, 0.012, { ry }); }
  for (const a of [-1, 1]) { const [px, pz] = at(a * 0.18, -0.19); K.box(M, px, 0.45, pz, 0.035, 0.5, 0.035, { ry }); }
  { const [px, pz] = at(0, -0.195); K.box(M, px, 0.82, pz, w - 0.04, 0.09, 0.03, { ry }); K.box(M, px, 0.6, pz, w - 0.08, 0.04, 0.02, { ry }); }
}
function tdDining(x, y, z, rot, w, d, nSide, seatC) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), M = MT.walnut, S = MT.fab(seatC || 0x7d6a55);
  K.rbox(M, 0, 0.72, 0, w, 0.045, d, 0.012); K.box(M, 0, 0.62, 0, w - 0.2, 0.1, d - 0.2);
  for (const a of [-1, 1]) for (const b of [-1, 1]) K.box(M, a * (w / 2 - 0.12), 0, b * (d / 2 - 0.12), 0.07, 0.72, 0.07);
  // a runner, plates, a bowl of fruit, candles
  K.box(MT.linen, 0, 0.765, 0, w * 0.75, 0.004, 0.32);
  K.lathe(MT.ceramic, [[0, 0], [0.13, 0.005], [0.16, 0.06], [0.15, 0.065]], 0, 0.766, 0);
  for (let i = 0; i < 5; i++) K.sph(MT.vcG, tdRnd(-0.06, 0.06), 0.81, tdRnd(-0.06, 0.06), 0.04, { col: [0xd23a2a, 0xe6a02a, 0x8ab83a, 0xd23a2a, 0xe8c040][i] });
  for (const cx of [-0.35, 0.35]) { K.cyl(MT.brass, cx, 0.766, 0, 0.03, 0.04, 0.03, 10); K.cyl(MT.paper, cx, 0.79, 0, 0.012, 0.012, 0.22, 8); }
  // chairs: along both long sides, and one at each end; pulled in under the edge of the table
  const sp = w / nSide;
  for (let i = 0; i < nSide; i++) { const cx = -w / 2 + sp * (i + 0.5); tdChair(K, cx, d / 2 + 0.16, Math.PI, MT.dark, S); tdChair(K, cx, -d / 2 - 0.16, 0, MT.dark, S);
    K.lathe(MT.ceramic, [[0, 0], [0.12, 0.003], [0.13, 0.015]], cx, 0.766, d / 2 - 0.2); K.lathe(MT.ceramic, [[0, 0], [0.12, 0.003], [0.13, 0.015]], cx, 0.766, -d / 2 + 0.2); }
  tdChair(K, w / 2 + 0.16, 0, -Math.PI / 2, MT.dark, S); tdChair(K, -w / 2 - 0.16, 0, Math.PI / 2, MT.dark, S);
  K.build(x, y, z, rot);
  // the top is solid (go round it, or crawl under it); each chair is a small box of its own
  tdCol(P, 0, 0, w, d, 0.05, 0.72);
  for (let i = 0; i < nSide; i++) { const cx = -w / 2 + sp * (i + 0.5); tdCol(P, cx, d / 2 + 0.2, 0.44, 0.36, 0.5); tdCol(P, cx, -d / 2 - 0.2, 0.44, 0.36, 0.5); }
  tdCol(P, w / 2 + 0.2, 0, 0.36, 0.44, 0.5); tdCol(P, -w / 2 - 0.2, 0, 0.36, 0.44, 0.5);
}
function tdBed(x, y, z, rot, w, l, duvet, headC) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), H = MT.fab(headC || 0x6e6a64), D = MT.fab(duvet), L = MT.linen, bz = -l / 2;
  K.rbox(H, 0, 0, bz + 0.05, w + 0.1, 1.15, 0.1, 0.04);                                     // headboard
  for (let i = 0; i < Math.round(w / 0.3); i++) K.box(H, -w / 2 + 0.15 + i * (w - 0.3) / Math.max(1, Math.round(w / 0.3) - 1), 0.45, bz + 0.105, 0.012, 0.62, 0.01); // its channels
  K.rbox(MT.dark, 0, 0.08, 0.04, w, 0.24, l - 0.1, 0.02); for (const a of [-1, 1]) for (const b of [-1, 1]) K.cyl(MT.dark, a * (w / 2 - 0.06), 0, 0.04 + b * (l / 2 - 0.11), 0.03, 0.025, 0.08, 8);
  K.rbox(L, 0, 0.32, 0.05, w - 0.04, 0.22, l - 0.14, 0.05);                                 // mattress
  K.rbox(D, 0, 0.5, 0.18, w + 0.02, 0.07, l - 0.42, 0.03);                                  // duvet over it
  K.box(D, 0, 0.18, l / 2 - 0.035, w + 0.02, 0.36, 0.035);                                  // the duvet hangs down the foot
  for (const s of [-1, 1]) K.box(D, s * (w / 2 + 0.02), 0.2, 0.18, 0.025, 0.34, l - 0.42);
  K.rbox(L, 0, 0.5, bz + 0.5, w - 0.06, 0.06, 0.55, 0.03);                                  // the folded-back sheet
  const np = w > 1.3 ? 2 : 1; for (let i = 0; i < np; i++) { const px = np === 1 ? 0 : (i ? 1 : -1) * w / 4; K.rbox(L, px, 0.55, bz + 0.3, w / np - 0.1, 0.16, 0.36, 0.07, { rx: -0.25 }); }
  K.rbox(MT.vc, 0, 0.6, bz + 0.48, 0.42, 0.3, 0.12, 0.05, { rx: -0.3, col: duvet === 0x4f6378 ? 0xd9c27a : 0x6f8aa0 });
  K.rbox(MT.fab(0x8a6e5a), 0, 0.57, l / 2 - 0.45, w + 0.03, 0.02, 0.5, 0.01);              // throw across the foot
  K.build(x, y, z, rot); tdCol(P, 0, 0.03, w, l - 0.06, 0.58); tdCol(P, 0, bz + 0.05, w + 0.1, 0.1, 1.15 - 0.58, 0.58);
}
function tdNightstand(x, y, z, rot, lamp) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.48, d = 0.4, h = 0.56;
  K.rbox(MT.oak, 0, 0.08, 0, w, h - 0.08, d, 0.01); for (const a of [-1, 1]) for (const b of [-1, 1]) K.cyl(MT.oak, a * (w / 2 - 0.04), 0, b * (d / 2 - 0.04), 0.018, 0.014, 0.08, 8);
  for (let i = 0; i < 2; i++) { K.box(MT.painted, 0, 0.12 + i * 0.22, d / 2, w - 0.04, 0.2, 0.006); K.box(MT.brass, 0, 0.21 + i * 0.22, d / 2 + 0.012, 0.1, 0.012, 0.012); }
  if (lamp) tdTableLamp(K, -0.06, h, -0.04, 0.95);
  K.box(MT.vc, 0.12, h, 0.06, 0.15, 0.025, 0.21, { ry: 0.4, col: 0x7a2a24 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdWardrobe(x, y, z, rot, w, M) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.6, h = 2.05; M = M || MT.painted;
  K.rbox(M, 0, 0.06, 0, w, h - 0.06, d, 0.01); K.box(MT.dark, 0, 0, 0, w - 0.06, 0.06, d - 0.06); K.box(M, 0, h - 0.04, 0, w + 0.04, 0.04, d + 0.03);
  const n = w > 1 ? 2 : 1; for (let i = 0; i < n; i++) { const cx = -w / 2 + w * (i + 0.5) / n, dw = w / n - 0.02;
    const PM = M === MT.painted ? MT.paintedS : M;
    for (const [fx, fy, fw, fh] of [[cx - dw / 2 + 0.04, 0.1, 0.08, h - 0.2], [cx + dw / 2 - 0.04, 0.1, 0.08, h - 0.2]]) K.box(M, fx, fy, d / 2 + 0.008, fw, fh, 0.016);
    for (const fy of [0.1, h * 0.52, h - 0.18]) K.box(M, cx, fy, d / 2 + 0.008, dw - 0.16, 0.08, 0.016);
    K.box(PM, cx, 0.18, d / 2 + 0.002, dw - 0.1, h - 0.36, 0.006); K.box(MT.dark, cx + dw / 2, 0.1, d / 2 + 0.004, 0.006, h - 0.2, 0.01); K.box(MT.brass, cx + (i ? -1 : 1) * (dw / 2 - 0.05) * (n === 1 ? 1 : 1), 0.95, d / 2 + 0.025, 0.012, 0.22, 0.012); }
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdDresser(x, y, z, rot, w, mirror, M) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.48, h = 0.84; M = M || MT.oak;
  K.rbox(M, 0, 0.08, 0, w, h - 0.08, d, 0.01); for (const a of [-1, 1]) for (const b of [-1, 1]) K.cyl(M, a * (w / 2 - 0.05), 0, b * (d / 2 - 0.05), 0.02, 0.016, 0.08, 8);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const cx = -w / 4 + c * w / 2, cy = 0.12 + r * 0.235; K.box(M, cx, cy, d / 2, w / 2 - 0.04, 0.215, 0.008); K.box(MT.brass, cx, cy + 0.1, d / 2 + 0.014, 0.12, 0.014, 0.014); }
  if (mirror) { K.rbox(M, 0, h + 0.18, -d / 2 + 0.03, w * 0.7, 0.85, 0.035, 0.01); K.plane(MT.mirror, 0, h + 0.18 + 0.425, -d / 2 + 0.05, w * 0.7 - 0.08, 0.77); }
  K.lathe(MT.potW, [[0, 0], [0.05, 0], [0.06, 0.1], [0.03, 0.18], [0.035, 0.2]], w * 0.36, h, 0.02); K.box(MT.vc, -w * 0.3, h, 0.06, 0.2, 0.03, 0.14, { ry: 0.2, col: 0xd8c08a });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h); if (mirror) tdCol(P, 0, -d / 2 + 0.03, w * 0.7, 0.04, 0.85, h + 0.18);
}
function tdDesk(x, y, z, rot, w, office) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.72, M = office ? MT.dark : MT.oak;
  K.rbox(M, 0, 0.72, 0, w, 0.04, d, 0.008);
  K.rbox(M, w / 2 - 0.22, 0, 0, 0.42, 0.72, d - 0.06, 0.008); for (let i = 0; i < 3; i++) { K.box(M, w / 2 - 0.22, 0.06 + i * 0.22, (d - 0.06) / 2, 0.38, 0.2, 0.008); K.box(MT.steel, w / 2 - 0.22, 0.15 + i * 0.22, (d - 0.06) / 2 + 0.012, 0.1, 0.012, 0.012); }
  for (const b of [-1, 1]) K.box(M, -w / 2 + 0.04, 0, b * (d / 2 - 0.05), 0.04, 0.72, 0.04); K.box(M, -w / 2 + 0.04, 0.05, 0, 0.04, 0.04, d - 0.1);
  K.box(M, 0, 0.3, -d / 2 + 0.04, w - 0.5, 0.4, 0.015);
  // monitor, keyboard, mouse, lamp, mug, papers
  K.rbox(MT.blackG, -0.1, 0.92, -0.18, 0.62, 0.37, 0.03, 0.01); K.plane(MT.blackG, -0.1, 1.105, -0.164, 0.59, 0.34); K.box(MT.black, -0.1, 0.76, -0.2, 0.04, 0.17, 0.04); K.box(MT.black, -0.1, 0.76, -0.2, 0.24, 0.012, 0.16);
  K.rbox(MT.black, -0.1, 0.76, 0.08, 0.44, 0.02, 0.14, 0.005); K.rbox(MT.black, 0.22, 0.76, 0.1, 0.06, 0.02, 0.1, 0.01);
  K.lathe(MT.black, [[0, 0], [0.08, 0], [0.08, 0.015], [0.01, 0.02], [0.01, 0.35]], -w / 2 + 0.18, 0.76, -0.2); K.add(MT.shadeT, new THREE.ConeGeometry(0.09, 0.12, 16, 1, true), -w / 2 + 0.18, 1.14, -0.15, { rx: 0.5 });
  K.cyl(MT.ceramic, w / 2 - 0.2, 0.76, 0.12, 0.04, 0.036, 0.1, 12); K.box(MT.paper, 0.4, 0.761, 0.05, 0.21, 0.004, 0.297, { ry: 0.15 }); K.box(MT.paper, 0.42, 0.765, 0.04, 0.21, 0.004, 0.297, { ry: -0.1 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, 0.04, 0.72); tdCol(P, w / 2 - 0.22, 0, 0.42, d - 0.06, 0.72); tdCol(P, -0.1, -0.18, 0.62, 0.08, 0.4, 0.76);
}
function tdOfficeChair(x, y, z, rot, leather) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), F = leather ? MT.leather : MT.fab(0x2f3338);
  for (let i = 0; i < 5; i++) { const a = i * 1.2566; K.box(MT.black, Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15, 0.3, 0.03, 0.04, { ry: -a }); K.sph(MT.black, Math.cos(a) * 0.28, 0.025, Math.sin(a) * 0.28, 0.025); }
  K.cyl(MT.chrome, 0, 0.07, 0, 0.025, 0.025, 0.32, 10); K.rbox(F, 0, 0.42, 0.02, 0.5, 0.08, 0.48, 0.03);
  K.rbox(F, 0, 0.56, -0.22, 0.46, 0.58, 0.07, 0.03, { rx: -0.12 }); for (const s of [-1, 1]) { K.box(MT.black, s * 0.26, 0.5, 0.02, 0.03, 0.16, 0.03); K.rbox(MT.black, s * 0.26, 0.66, 0.04, 0.06, 0.03, 0.26, 0.01); }
  K.build(x, y, z, rot); tdCol(P, 0, 0, 0.56, 0.56, 0.5);
}
function tdPlant(x, y, z, size, kind) {
  const P = tdPiece(x, y, z, 0), K = new Kit(), s = size || 1;
  K.lathe(kind === 1 ? MT.potW : MT.pot, [[0, 0], [0.13 * s, 0], [0.18 * s, 0.32 * s], [0.19 * s, 0.34 * s], [0.17 * s, 0.34 * s]], 0, 0, 0); K.cyl(MT.soil, 0, 0.3 * s, 0, 0.165 * s, 0.165 * s, 0.02, 14);
  if (kind === 2) { // a tall leafy plant: a stem and leaves all the way up
    K.cyl(MT.bark, 0, 0.3 * s, 0, 0.012 * s, 0.018 * s, 1.0 * s, 6);
    for (let i = 0; i < 16; i++) { const a = i * 2.4, yy = (0.55 + i * 0.055) * s, r = 0.18 * s; K.add(i % 2 ? MT.leaf : MT.leafD, new THREE.SphereGeometry(0.11 * s, 8, 6), Math.cos(a) * r * 0.6, yy, Math.sin(a) * r * 0.6, { sx: 1.6, sy: 0.35, sz: 0.8, ry: -a }); }
  } else for (let i = 0; i < 9; i++) { const a = i * 0.7; K.add(i % 2 ? MT.leaf : MT.leafD, new THREE.IcosahedronGeometry(0.14 * s, 1), Math.cos(a) * 0.08 * s, (0.42 + (i % 3) * 0.1) * s, Math.sin(a) * 0.08 * s, { sx: 1.1, sy: 0.9, sz: 1.1 }); }
  K.build(x, y, z, 0); tdCol(P, 0, 0, 0.38 * s, 0.38 * s, kind === 2 ? 1.35 * s : 0.7 * s);
}
function tdRug(x, y, z, w, d, k, ry) {
  const K = new Kit(); K.plane(MT.rug(k), 0, 0, 0, w, d, { rx: -Math.PI / 2 }); const g = K.build(x, y + 0.011, z, ry || 0, { deco: false }); g.userData.rug = true; return g;
}
// a picture on a wall: the frame, the mat, the print (wall: which way it faces, the point is on the wall's face)
function tdArt(x, y, z, rot, w, h, k, frameM) { TD.wall.push([x, y, z, w]);
  const K = new Kit(), F = frameM || MT.dark;
  K.box(F, 0, -h / 2, 0.012, w, h, 0.024); K.plane(MT.paper, 0, 0, 0.0245, w - 0.05, h - 0.05); K.plane(typeof k === 'number' ? MT.art(k) : k, 0, 0, 0.025, w - 0.14, h - 0.14);
  K.build(x, y, z, rot);
}
function tdMirror(x, y, z, rot, w, h) { TD.wall.push([x, y, z, w]); const K = new Kit(); K.rbox(MT.brass, 0, -h / 2, 0.01, w, h, 0.02, 0.01); K.plane(MT.mirror, 0, 0, 0.021, w - 0.05, h - 0.05); K.build(x, y, z, rot); }
function tdClock(x, y, z, rot) { TD.wall.push([x, y, z, 0.36]); const K = new Kit(); K.cyl(MT.black, 0, -0.02, 0, 0.17, 0.17, 0.04, 28, { rx: Math.PI / 2 }); K.cyl(MT.paper, 0, 0.0, 0.021, 0.15, 0.15, 0.002, 28, { rx: Math.PI / 2 }); K.box(MT.black, 0, 0.022, 0.03, 0.008, 0.1, 0.004); K.box(MT.black, 0.03, 0.022, 0.03, 0.07, 0.008, 0.004); K.build(x, y, z, rot); }
// curtains either side of a window and a rod over it (u: along the wall; inside: the room side of the wall's face)
function tdCurtains(K, w, top, fab) {
  const F = MT.fab(fab); K.rod(MT.brass, new V3(-(w / 2 + 0.45), top + 0.12, 0.06), new V3(w / 2 + 0.45, top + 0.12, 0.06), 0.012); for (const s of [-1, 1]) K.sph(MT.brass, s * (w / 2 + 0.45), top + 0.12, 0.06, 0.025);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) K.cyl(F, s * (w / 2 + 0.08 + i * 0.065), 0.02, 0.06 + (i % 2) * 0.02, 0.035, 0.04, top + 0.1, 8);
}
// ---- more pieces: kitchen, bathroom, laundry, odds and ends
function tdWasher(x, y, z, rot, dryer) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.66, h = 0.88;
  K.rbox(MT.ceramic, 0, 0, 0, w, h, w, 0.02); K.box(MT.steel, 0, h - 0.12, w / 2 + 0.002, w - 0.04, 0.1, 0.004);
  const door = new THREE.TorusGeometry(0.19, 0.03, 10, 28); K.add(MT.chrome, door, 0, 0.42, w / 2 + 0.02);
  K.add(dryer ? MT.blackG : MT.glass, new THREE.CircleGeometry(0.17, 28), 0, 0.42, w / 2 + 0.012);
  for (let i = 0; i < 3; i++) K.cyl(MT.black, -0.2 + i * 0.07, h - 0.08, w / 2 + 0.012, 0.018, 0.018, 0.02, 10, { rx: Math.PI / 2 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, w, h, 0, 'metal', 'metal');
}
function tdWallShelf(x, y, z, rot, w, items) { TD.wall.push([x, y, z, w]);
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.3;
  K.box(MT.oak, 0, 0, 0, w, 0.03, d); for (const s of [-1, 1]) K.box(MT.black, s * (w / 2 - 0.1), -0.15, -d / 2 + 0.02, 0.025, 0.15, 0.025);
  if (items) { let xx = -w / 2 + 0.1; while (xx < w / 2 - 0.15) { const kind = (Math.random() * 3) | 0;
    if (kind === 0) K.box(MT.vc, xx, 0.03, 0, 0.14, tdRnd(0.18, 0.3), 0.1, { col: [0x2a6ab0, 0xe0e0e0, 0xd04a2a, 0x3a9a5a][(Math.random() * 4) | 0] });
    else if (kind === 1) K.box(MT.vc, xx, 0.03, 0, 0.26, 0.2, 0.24, { col: 0xb59466 });
    else K.cyl(MT.vcG, xx, 0.03, 0, 0.05, 0.05, tdRnd(0.15, 0.26), 10, { col: [0xffffff, 0x2a8ad0, 0xe8c040][(Math.random() * 3) | 0] });
    xx += tdRnd(0.18, 0.32); } }
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, 0.03 + (items ? 0.3 : 0));
}
function tdUtilSink(x, y, z, rot) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.62, d = 0.55;
  K.rbox(MT.painted, 0, 0, 0, w, 0.86, d, 0.01); K.box(MT.ceramic, 0, 0.86, 0, w + 0.02, 0.05, d + 0.01); K.box(MT.steel, 0, 0.885, 0.02, w - 0.14, 0.03, d - 0.18);
  K.box(MT.painted, 0, 0.08, d / 2 + 0.002, w - 0.06, 0.7, 0.008); K.cyl(MT.chrome, 0, 0.9, -d / 2 + 0.08, 0.016, 0.016, 0.26, 8); K.rod(MT.chrome, new V3(0, 1.15, -d / 2 + 0.08), new V3(0, 1.15, -d / 2 + 0.24), 0.014);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, 0.91);
}
function tdShelving(x, y, z, rot, w, h) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.42;
  for (const a of [-1, 1]) for (const b of [-1, 1]) K.box(MT.steel, a * (w / 2 - 0.02), 0, b * (d / 2 - 0.02), 0.03, h, 0.03);
  for (let i = 0; i < 5; i++) { const yy = 0.1 + i * (h - 0.15) / 4; K.box(MT.steel, 0, yy, 0, w, 0.02, d);
    if (i < 4) { let xx = -w / 2 + 0.12; while (xx < w / 2 - 0.16) { const bw = tdRnd(0.2, 0.34); if (Math.random() < 0.8) K.box(MT.vc, xx + bw / 2, yy + 0.02, tdRnd(-0.03, 0.03), bw - 0.02, tdRnd(0.16, 0.3), tdRnd(0.26, 0.36), { col: [0xb59466, 0xa5865a, 0x2b5a8a, 0xd9d4c8, 0x6a7a4a][(Math.random() * 5) | 0] }); xx += bw; } } }
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h, 0, 'metal', 'metal');
}
function tdWaterHeater(x, y, z) {
  const P = tdPiece(x, y, z, 0), K = new Kit();
  K.cyl(MT.ceramic, 0, 0.05, 0, 0.28, 0.28, 1.45, 24); K.lathe(MT.ceramic, [[0, 0.06], [0.24, 0.02], [0.28, 0]], 0, 1.5, 0, { sy: -1 });
  K.cyl(MT.steel, 0, 0, 0, 0.29, 0.29, 0.06, 24); K.cyl(MT.chrome, 0.1, 1.5, 0, 0.02, 0.02, 0.4, 8); K.cyl(MT.brass, -0.1, 1.5, 0, 0.02, 0.02, 0.4, 8); K.box(MT.black, 0, 0.3, 0.27, 0.14, 0.12, 0.04);
  K.build(x, y, z, 0); tdCol(P, 0, 0, 0.6, 0.6, 1.6, 0, 'metal', 'metal');
}
function tdWorkbench(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.62;
  K.box(MT.oak, 0, 0.86, 0, w, 0.05, d); for (const a of [-1, 1]) for (const b of [-1, 1]) K.box(MT.dark, a * (w / 2 - 0.05), 0, b * (d / 2 - 0.05), 0.06, 0.86, 0.06);
  K.box(MT.oak, 0, 0.18, 0, w - 0.1, 0.03, d - 0.1); K.box(MT.vc, -w * 0.3, 0.21, 0, 0.45, 0.26, 0.34, { col: 0xc0392b }); K.box(MT.vc, w * 0.2, 0.21, 0, 0.5, 0.2, 0.36, { col: 0x5a5a5a });
  // pegboard and tools on the wall behind
  K.box(MT.vc, 0, 1.05, -d / 2 + 0.01, w - 0.1, 0.8, 0.015, { col: 0xc8a878 });
  for (let i = 0; i < 9; i++) { const tx = -w / 2 + 0.2 + i * (w - 0.4) / 8; K.box(MT.vc, tx, tdRnd(1.25, 1.55), -d / 2 + 0.03, tdRnd(0.03, 0.06), tdRnd(0.18, 0.32), 0.02, { col: [0x2b2b2b, 0xc0392b, 0x8a8a8a, 0xe0a020][i % 4] }); }
  K.box(MT.vc, w * 0.25, 0.91, -0.05, 0.4, 0.12, 0.2, { col: 0x2b2b2b }); K.cyl(MT.vcG, -w * 0.32, 0.91, 0.1, 0.06, 0.06, 0.14, 10, { col: 0xe0a020 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, 0.91); tdCol(P, 0, -d / 2 + 0.01, w - 0.1, 0.02, 0.8, 1.05);
}
function tdBench(x, y, z, rot, w, cushion) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.4;
  K.rbox(MT.oak, 0, 0.4, 0, w, 0.05, d, 0.01); for (const a of [-1, 1]) K.box(MT.oak, a * (w / 2 - 0.05), 0, 0, 0.05, 0.4, d - 0.04); K.box(MT.oak, 0, 0.12, 0, w - 0.1, 0.02, d - 0.08);
  if (cushion) K.rbox(MT.fab(cushion), 0, 0.45, 0, w - 0.04, 0.06, d - 0.04, 0.02);
  // shoes under it
  for (let i = 0; i < Math.floor(w / 0.32); i++) K.rbox(MT.vc, -w / 2 + 0.2 + i * 0.32, 0.14, 0.02, 0.11, 0.08, 0.27, 0.03, { col: [0x2b2b2b, 0x7a4a2a, 0x3a5a8a][i % 3] });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, 0.45 + (cushion ? 0.06 : 0));
}
function tdCoatHooks(x, y, z, rot, w, coats) { TD.wall.push([x, y, z, w]);
  const K = new Kit(); K.box(MT.oak, 0, 0, 0.01, w, 0.12, 0.02); const n = Math.max(2, Math.round(w / 0.25));
  for (let i = 0; i < n; i++) { const hx = -w / 2 + (i + 0.5) * w / n; K.rod(MT.brass, new V3(hx, 0.06, 0.02), new V3(hx, 0.1, 0.09), 0.008);
    if (coats && i % 2 === 0) K.rbox(MT.fab([0x3c4a5a, 0x7a5a3a, 0x2b2b2b, 0x8a2a2a][i % 4]), hx, -0.75, 0.1, 0.36, 0.84, 0.12, 0.05); }
  K.build(x, y, z, rot);
}
function tdFreezer(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.62, h = 0.86; K.rbox(MT.ceramic, 0, 0.04, 0, w, h - 0.04, d, 0.03); K.box(MT.black, 0, 0, 0, w - 0.06, 0.04, d - 0.06);
  K.box(MT.steel, 0, h - 0.12, d / 2 + 0.01, 0.4, 0.03, 0.03); K.box(MT.vc, w / 2 - 0.12, h - 0.25, d / 2 + 0.003, 0.08, 0.05, 0.004, { col: 0x30c050 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h, 0, 'metal', 'metal');
}
function tdBasket(x, y, z, col) { const P = tdPiece(x, y, z, 0), K = new Kit(); K.lathe(MT.vc, [[0, 0], [0.17, 0], [0.2, 0.45], [0.21, 0.46]], 0, 0, 0, { col: col || 0xc8b088 }); K.sph(MT.fab(0xd8d0c8), 0, 0.44, 0, 0.16, { sy: 0.4 }); K.build(x, y, z, 0); tdCol(P, 0, 0, 0.42, 0.42, 0.5); }
function tdConsole(x, y, z, rot, w, lamp) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.36, h = 0.8;
  K.rbox(MT.walnut, 0, h - 0.04, 0, w, 0.04, d, 0.008); K.box(MT.walnut, 0, h - 0.16, 0, w - 0.1, 0.12, d - 0.06);
  for (const a of [-1, 1]) for (const b of [-1, 1]) K.box(MT.dark, a * (w / 2 - 0.04), 0, b * (d / 2 - 0.04), 0.035, h - 0.04, 0.035); K.box(MT.walnut, 0, 0.15, 0, w - 0.08, 0.025, d - 0.08);
  for (let i = 0; i < 2; i++) K.rbox(MT.vc, -w / 2 + 0.3 + i * (w - 0.6), 0.175, 0, 0.32, 0.22, 0.26, 0.04, { col: 0xb59466 });
  if (lamp) tdTableLamp(K, -w * 0.32, h, -0.04, 1.05);
  K.lathe(MT.ceramic, [[0, 0], [0.1, 0.01], [0.14, 0.07], [0.13, 0.075]], w * 0.25, h, 0.02); K.box(MT.vc, w * 0.05, h, 0.06, 0.18, 0.04, 0.24, { ry: 0.2, col: 0x23324f });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdShoeCabinet(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.36, h = 0.5;
  K.rbox(MT.painted, 0, 0.05, 0, w, h - 0.05, d, 0.01); K.box(MT.dark, 0, 0, 0, w - 0.06, 0.05, d - 0.06);
  for (let i = 0; i < 3; i++) { K.box(MT.painted, -w / 2 + w * (i + 0.5) / 3, 0.08, d / 2 + 0.002, w / 3 - 0.02, h - 0.12, 0.008); K.cyl(MT.brass, -w / 2 + w * (i + 0.5) / 3, 0.34, d / 2 + 0.01, 0.012, 0.012, 0.02, 8, { rx: Math.PI / 2 }); }
  K.rbox(MT.vc, -w * 0.25, h, 0, 0.3, 0.1, 0.22, 0.03, { col: 0x8a5a3a }); K.box(MT.vc, w * 0.2, h, 0.02, 0.1, 0.02, 0.06, { col: 0xb8913f });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdFridge(x, y, z, rot) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.9, d = 0.76, h = 1.85;
  K.rbox(MT.steel, 0, 0.04, -0.03, w, h - 0.04, d - 0.06, 0.03); K.box(MT.black, 0, 0, 0, w - 0.06, 0.06, d - 0.1);
  for (const s of [-1, 1]) K.rbox(MT.steel, s * (w / 4), 0.62, d / 2 - 0.04, w / 2 - 0.012, h - 0.66, 0.05, 0.015); K.rbox(MT.steel, 0, 0.06, d / 2 - 0.04, w - 0.01, 0.54, 0.05, 0.015);
  for (const s of [-1, 1]) K.box(MT.chrome, s * 0.035, 0.95, d / 2 + 0.01, 0.02, 0.55, 0.025); K.box(MT.chrome, 0, 0.5, d / 2 + 0.01, 0.5, 0.02, 0.025);
  K.box(MT.blackG, -w / 4, 1.2, d / 2 + 0.002, 0.16, 0.24, 0.004);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h, 0, 'metal', 'metal');
}
// a run of kitchen cabinets along a wall: base units with a stone top, from l0 to l1 (along the piece's x), with a sink at
// sinkX, a cooktop and oven at stoveX, a dishwasher at dwX; wall cabinets over [a, b] spans with a hood over the stove
function tdKitchenRun(x, y, z, rot, w, o) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.62, h = 0.88, M = MT.paintedG;
  K.box(MT.black, 0, 0, 0.02, w - 0.02, 0.1, d - 0.08);
  K.box(M, 0, 0.1, -0.01, w, h - 0.1, d - 0.04); K.box(MT.marble, 0, h, 0.01, w, 0.04, d + 0.02);
  K.box(MT.marble, 0, h + 0.04, -d / 2 + 0.01, w, 0.5, 0.012);                                             // the splashback
  const skip = (o.skip || []), inSkip = cx => skip.some(([a, b]) => cx > a - 0.01 && cx < b + 0.01);
  for (let cx = -w / 2 + 0.3; cx < w / 2 - 0.1; cx += 0.6) { if (inSkip(cx)) continue;
    K.box(M, cx, 0.12, d / 2 - 0.018, 0.58, 0.56, 0.012); K.box(M, cx, 0.7, d / 2 - 0.018, 0.58, 0.15, 0.012); K.box(MT.brass, cx, 0.77, d / 2 - 0.006, 0.16, 0.012, 0.014); K.box(MT.brass, cx + 0.22, 0.45, d / 2 - 0.006, 0.012, 0.14, 0.014); }
  if (o.sinkX !== undefined) { const sx = o.sinkX; K.box(MT.steel, sx, h + 0.005, 0.02, 0.66, 0.04, 0.42); K.box(MT.blackG, sx, h + 0.012, 0.02, 0.58, 0.035, 0.34);
    K.cyl(MT.chrome, sx, h + 0.04, -0.2, 0.022, 0.026, 0.3, 10); K.add(MT.chrome, new THREE.TorusGeometry(0.11, 0.014, 8, 16, Math.PI), sx, h + 0.34, -0.09, { ry: Math.PI / 2 });
    K.box(M, sx, 0.12, d / 2 - 0.018, 0.78, 0.7, 0.012); }
  if (o.dwX !== undefined) { K.box(MT.steel, o.dwX, 0.12, d / 2 - 0.016, 0.59, 0.73, 0.014); K.box(MT.chrome, o.dwX, 0.78, d / 2 - 0.004, 0.42, 0.02, 0.02); }
  if (o.stoveX !== undefined) { const sx = o.stoveX; K.box(MT.steel, sx, 0.1, d / 2 - 0.016, 0.76, 0.74, 0.016); K.box(MT.blackG, sx, 0.22, d / 2 - 0.006, 0.6, 0.38, 0.006); K.box(MT.chrome, sx, 0.68, d / 2 + 0.01, 0.6, 0.02, 0.03);
    K.box(MT.blackG, sx, h + 0.04, 0.0, 0.74, 0.012, 0.52); for (const a of [-1, 1]) for (const b of [-1, 1]) K.add(MT.steel, new THREE.TorusGeometry(0.075, 0.006, 6, 20), sx + a * 0.18, h + 0.054, b * 0.13, { rx: Math.PI / 2 });
    for (let i = 0; i < 4; i++) K.cyl(MT.black, sx - 0.24 + i * 0.16, 0.8, d / 2 - 0.004, 0.02, 0.02, 0.03, 10, { rx: Math.PI / 2 }); }
  // wall cabinets and the hood
  for (const [a, b] of o.upper || []) { const cw = b - a, cxm = (a + b) / 2, n = Math.max(1, Math.round(cw / 0.6)); K.box(M, cxm, 1.45, -d / 2 + 0.175, cw, 0.72, 0.35); K.box(M, cxm, 2.17, -d / 2 + 0.19, cw + 0.02, 0.04, 0.38);
    for (let i = 0; i < n; i++) { const ex = a + cw * (i + 0.5) / n; K.box(M, ex, 1.47, -d / 2 + 0.355, cw / n - 0.02, 0.68, 0.012); K.box(MT.brass, ex + (i % 2 ? -1 : 1) * (cw / n / 2 - 0.05), 1.52, -d / 2 + 0.367, 0.012, 0.14, 0.014); }
    K.box(MT.glow, cxm, 1.44, -d / 2 + 0.3, cw - 0.1, 0.012, 0.03); }
  if (o.stoveX !== undefined && o.hood) { const sx = o.stoveX; K.add(MT.steel, new THREE.CylinderGeometry(0.2, 0.42, 0.3, 4, 1), sx, 1.72, -d / 2 + 0.25, { ry: Math.PI / 4, sz: 0.7 }); K.box(MT.steel, sx, 1.87, -d / 2 + 0.12, 0.28, 0.9, 0.2); }
  // things on the counter
  for (const it of o.items || []) { const [kind, ix] = it;
    if (kind === 'kettle') { K.lathe(MT.chrome, [[0, 0], [0.09, 0], [0.1, 0.12], [0.06, 0.2], [0.02, 0.22]], ix, h + 0.04, -0.1); K.box(MT.black, ix, h + 0.04, -0.1, 0.18, 0.02, 0.16); }
    else if (kind === 'micro') { K.rbox(MT.black, ix, h + 0.04, -0.08, 0.5, 0.3, 0.38, 0.02); K.box(MT.blackG, ix - 0.05, h + 0.08, 0.11, 0.32, 0.22, 0.004); }
    else if (kind === 'knives') { K.box(MT.dark, ix, h + 0.04, -0.15, 0.12, 0.24, 0.16, { rx: -0.3 }); for (let i = 0; i < 4; i++) K.box(MT.black, ix - 0.04 + i * 0.027, h + 0.26, -0.18, 0.015, 0.08, 0.02, { rx: -0.3 }); }
    else if (kind === 'herbs') { for (let i = 0; i < 3; i++) { K.lathe(MT.pot, [[0, 0], [0.05, 0], [0.065, 0.11]], ix + i * 0.16, h + 0.04, -0.18); K.add(MT.leaf, new THREE.IcosahedronGeometry(0.07, 1), ix + i * 0.16, h + 0.2, -0.18); } }
    else if (kind === 'board') { K.rbox(MT.oak, ix, h + 0.04, -0.2, 0.42, 0.025, 0.28, 0.008, { rx: -1.25 }); }
    else if (kind === 'coffee') { K.rbox(MT.black, ix, h + 0.04, -0.12, 0.26, 0.36, 0.32, 0.02); K.cyl(MT.glass, ix, h + 0.08, 0.02, 0.06, 0.06, 0.14, 12); } }
  K.build(x, y, z, rot); tdCol(P, 0, 0.01, w, d + 0.02, h + 0.04);
  for (const [a, b] of o.upper || []) tdCol(P, (a + b) / 2, -d / 2 + 0.19, b - a, 0.38, 0.76, 1.45);
  if (o.stoveX !== undefined && o.hood) tdCol(P, o.stoveX, -d / 2 + 0.2, 0.66, 0.4, 0.8, 1.5, 'metal', 'metal');
}
function tdIsland(x, y, z, rot, w, d, nStools) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), h = 0.9, M = MT.paintedB, ov = 0.3;
  K.box(MT.black, 0, 0, 0, w - 0.06, 0.1, d - 0.06); K.box(M, 0, 0.1, 0, w, h - 0.1, d); K.box(MT.marble, 0, h, ov / 2, w + 0.06, 0.04, d + ov + 0.02);
  for (let cx = -w / 2 + 0.3; cx < w / 2 - 0.1; cx += 0.6) { K.box(M, cx, 0.12, -d / 2 - 0.006, 0.58, 0.72, 0.012); K.box(MT.brass, cx, 0.75, -d / 2 - 0.014, 0.16, 0.012, 0.012); }
  K.lathe(MT.ceramic, [[0, 0], [0.15, 0.01], [0.19, 0.08], [0.18, 0.085]], -w * 0.25, h + 0.04, 0.05); for (let i = 0; i < 4; i++) K.sph(MT.vcG, -w * 0.25 + tdRnd(-0.07, 0.07), h + 0.11, 0.05 + tdRnd(-0.07, 0.07), 0.045, { col: [0xe6a02a, 0x8ab83a, 0xd23a2a, 0xe8c040][i] });
  K.lathe(MT.glass, [[0, 0], [0.06, 0], [0.07, 0.25], [0.03, 0.32]], w * 0.3, h + 0.04, 0.1); K.add(MT.leaf, new THREE.IcosahedronGeometry(0.06, 1), w * 0.3, h + 0.42, 0.1);
  // stools tucked in under the overhang
  const sp = w / nStools; for (let i = 0; i < nStools; i++) { const sx = -w / 2 + sp * (i + 0.5), sz = d / 2 + ov - 0.12;
    K.cyl(MT.oak, sx, 0.64, sz, 0.17, 0.17, 0.04, 20); K.rbox(MT.leather, sx, 0.67, sz, 0.32, 0.03, 0.32, 0.012);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; K.rod(MT.black, new V3(sx + Math.cos(a) * 0.12, 0.64, sz + Math.sin(a) * 0.12), new V3(sx + Math.cos(a) * 0.16, 0, sz + Math.sin(a) * 0.16), 0.012); }
    K.add(MT.black, new THREE.TorusGeometry(0.13, 0.008, 6, 20), sx, 0.25, sz, { rx: Math.PI / 2 }); }
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h + 0.04); tdCol(P, 0, d / 2 + ov / 2 + 0.01, w + 0.06, ov - 0.02, 0.04, h);
  for (let i = 0; i < nStools; i++) tdCol(P, -w / 2 + sp * (i + 0.5), d / 2 + ov - 0.12, 0.34, 0.34, 0.66);
}
function tdRoundTable(x, y, z, r, seatC) {
  const P = tdPiece(x, y, z, 0), K = new Kit(), S = MT.fab(seatC || 0xb59466);
  K.cyl(MT.oak, 0, 0.72, 0, r, r, 0.04, 32); K.cyl(MT.dark, 0, 0.04, 0, 0.05, 0.06, 0.68, 12); K.cyl(MT.dark, 0, 0, 0, 0.3, 0.32, 0.04, 20);
  K.lathe(MT.ceramic, [[0, 0], [0.05, 0], [0.06, 0.16], [0.03, 0.24], [0.035, 0.26]], 0, 0.76, 0); for (let i = 0; i < 3; i++) K.add(MT.vcG, new THREE.IcosahedronGeometry(0.035, 0), tdRnd(-0.03, 0.03), 1.04 + i * 0.02, tdRnd(-0.03, 0.03), { col: [0xe86a5a, 0xf2c14e, 0xffffff][i] });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, cx = Math.sin(a) * (r + 0.2), cz = Math.cos(a) * (r + 0.2); tdChair(K, cx, cz, a + Math.PI, MT.dark, S); }
  K.build(x, y, z, 0); tdCol(P, 0, 0, r * 2, r * 2, 0.04, 0.72);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; tdCol(P, Math.sin(a) * (r + 0.24), Math.cos(a) * (r + 0.24), Math.abs(Math.sin(a)) > 0.5 ? 0.36 : 0.44, Math.abs(Math.sin(a)) > 0.5 ? 0.44 : 0.36, 0.5); }
}
function tdFireplace(x, y, z, rot, w) {
  // built from parts that meet without passing through each other: two stone jambs, a lintel over the opening and a sill
  // under it, the stone back, the soot-black lining of the firebox just inside the stone, a bed of embers on its floor, logs
  // laid on it (two side by side, one across them; the kit's cylinders are placed by their base, hence the half-lengths), the hearth slab out front and the mantel over the top, its back flush
  // with the wall behind
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.5, h = 1.15, ow = w * 0.55, oy0 = 0.1, oy1 = 0.72, jw = (w - ow) / 2, f = d / 2;
  for (const sx of [-1, 1]) K.box(MT.stone, sx * (ow / 2 + jw / 2), 0, 0, jw, h, d);           // the jambs
  K.box(MT.stone, 0, oy1, 0, ow, h - oy1, d);                                                     // the lintel
  K.box(MT.stone, 0, 0, 0, ow, oy0, d);                                                           // the sill
  K.box(MT.stone, 0, oy0, -f + 0.05, ow, oy1 - oy0, 0.1);                                         // the back
  const soot = tdMat('soot', { color: 0x141210, roughness: 1 });
  K.box(soot, 0, oy0, -f + 0.1 + 0.003, ow - 0.004, oy1 - oy0 - 0.004, 0.006);                   // lining: back,
  for (const sx of [-1, 1]) K.box(soot, sx * (ow / 2 - 0.004), oy0 + 0.002, 0.024, 0.006, oy1 - oy0 - 0.006, d - 0.1 - 0.06); // sides,
  K.box(soot, 0, oy1 - 0.007, 0.024, ow - 0.012, 0.006, d - 0.1 - 0.06);                          // and roof
  K.box(tdMat('ember', { color: 0x3a1206, emissive: 0xff5a14, emissiveIntensity: 1.3, roughness: 0.9 }), 0, oy0, 0.02, ow * 0.7, 0.012, 0.2); // embers on the floor
  for (const zz of [-0.025, 0.065]) K.cyl(MT.bark, 0, oy0 + 0.012 + 0.04 - 0.17, zz, 0.04, 0.04, 0.34, 8, { rz: Math.PI / 2 });
  K.cyl(MT.bark, 0, oy0 + 0.012 + 0.04 + 0.078 - 0.16, 0.02, 0.038, 0.038, 0.32, 8, { rz: Math.PI / 2, ry: 0.55 });
  K.box(MT.stone, 0, 0, f + 0.002 + 0.13, w + 0.1, 0.06, 0.26);                                  // the hearth, in front
  K.box(MT.trim, 0, h, -f + 0.002 + (d + 0.08) / 2, w + 0.14, 0.07, d + 0.08);                    // the mantel
  // on the mantel: candles, a clock, a little plant
  for (const cx of [-w * 0.38, -w * 0.3]) K.cyl(MT.paper, cx, h + 0.07, 0, 0.025, 0.025, 0.16 + cx * 0.1, 10);
  K.box(MT.dark, w * 0.08, h + 0.07, -0.02, 0.2, 0.24, 0.08); K.cyl(MT.paper, w * 0.08, h + 0.12, 0.022, 0.07, 0.07, 0.002, 18, { rx: Math.PI / 2 });
  K.lathe(MT.potW, [[0, 0], [0.05, 0], [0.06, 0.08]], w * 0.35, h + 0.07, 0); K.add(MT.leaf, new THREE.IcosahedronGeometry(0.07, 1), w * 0.35, h + 0.2, 0);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h + 0.07, 0, 'brick', 'concrete');
}
function tdGrandClock(x, y, z, rot) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.5, d = 0.4, h = 2.05;
  K.box(MT.walnut, 0, 0, 0, w, 0.25, d); K.box(MT.walnut, 0, 0.25, 0, w - 0.1, 1.2, d - 0.06); K.box(MT.walnut, 0, 1.45, 0, w, 0.55, d); K.box(MT.dark, 0, h - 0.06, 0, w + 0.06, 0.06, d + 0.04);
  K.cyl(MT.paper, 0, 1.73, d / 2 + 0.002, 0.17, 0.17, 0.004, 24, { rx: Math.PI / 2 }); K.add(MT.brass, new THREE.TorusGeometry(0.175, 0.012, 6, 24), 0, 1.73, d / 2 + 0.006);
  K.plane(MT.glass, 0, 0.85, d / 2 - 0.028, w - 0.2, 0.9); K.cyl(MT.brass, 0, 0.5, d / 2 - 0.1, 0.07, 0.07, 0.01, 18, { rx: Math.PI / 2 }); K.box(MT.brass, 0, 0.55, d / 2 - 0.1, 0.012, 0.75, 0.006);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdUmbrella(x, y, z) { const P = tdPiece(x, y, z, 0), K = new Kit(); K.lathe(MT.brass, [[0, 0], [0.11, 0], [0.12, 0.5], [0.13, 0.52]], 0, 0, 0); for (let i = 0; i < 3; i++) K.rod(MT.black, new V3(-0.04 + i * 0.04, 0.05, 0), new V3(-0.08 + i * 0.08, 0.95, tdRnd(-0.05, 0.05)), 0.014); K.build(x, y, z, 0); tdCol(P, 0, 0, 0.27, 0.27, 0.55, 0, 'metal', 'metal'); }
function tdSideboard(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.46, h = 0.82;
  K.rbox(MT.walnut, 0, 0.14, 0, w, h - 0.14, d, 0.01); for (const a of [-1, 1]) for (const b of [-1, 1]) K.cyl(MT.dark, a * (w / 2 - 0.06), 0, b * (d / 2 - 0.06), 0.022, 0.015, 0.14, 8);
  const n = Math.round(w / 0.55); for (let i = 0; i < n; i++) { const cx = -w / 2 + w * (i + 0.5) / n; K.box(MT.walnut, cx, 0.18, d / 2, w / n - 0.02, h - 0.22, 0.008); for (let k = 0; k < 7; k++) K.box(MT.dark, cx - (w / n) * 0.35 + k * (w / n) * 0.117, 0.2, d / 2 + 0.006, 0.012, h - 0.26, 0.004); }
  K.lathe(MT.ceramic, [[0, 0], [0.07, 0], [0.09, 0.08], [0.05, 0.3], [0.06, 0.34]], -w * 0.35, h, 0); K.lathe(MT.ceramic, [[0, 0], [0.05, 0], [0.07, 0.06], [0.04, 0.22]], -w * 0.25, h, 0.05);
  K.box(MT.vc, w * 0.1, h, 0.0, 0.3, 0.06, 0.22, { col: 0x23324f }); K.lathe(MT.glass, [[0, 0], [0.12, 0.01], [0.15, 0.09]], w * 0.32, h, 0);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdHutch(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.5, M = MT.walnut;
  // the base: a cupboard with two panelled doors, a top that overhangs, a dark plinth
  K.box(M, 0, 0.08, 0, w, 0.8, d); K.box(MT.oak, 0, 0.88, 0.01, w + 0.04, 0.04, d + 0.03); K.box(MT.dark, 0, 0, 0, w - 0.06, 0.08, d - 0.06);
  for (let i = 0; i < 2; i++) { const cx = -w / 4 + i * w / 2; K.box(M, cx, 0.12, d / 2 + 0.004, w / 2 - 0.03, 0.72, 0.012); K.box(MT.oak, cx, 0.2, d / 2 + 0.012, w / 2 - 0.15, 0.56, 0.006); K.sph(MT.brass, cx + (i ? -1 : 1) * (w / 4 - 0.06), 0.62, d / 2 + 0.03, 0.016); }
  // the top: an open-backed glazed case (sides, back, three shelves, a cornice), plates stood on the shelves behind the glass
  const bz = -d / 2 + 0.02, cd = 0.34, fz = bz + cd;
  K.box(M, 0, 0.92, bz, w, 1.1, 0.02); for (const a of [-1, 1]) K.box(M, a * (w / 2 - 0.02), 0.92, bz + cd / 2, 0.04, 1.1, cd);
  for (const sy of [0.92, 1.28, 1.64]) K.box(M, 0, sy, bz + cd / 2, w - 0.06, 0.025, cd - 0.02);
  K.box(M, 0, 2.0, bz + cd / 2 + 0.02, w + 0.08, 0.08, cd + 0.06); K.box(MT.oak, 0, 2.08, bz + cd / 2 + 0.02, w + 0.12, 0.03, cd + 0.1);
  for (let i = 0; i < 2; i++) { const cx = -w / 4 + i * w / 2, gw = w / 2 - 0.04;
    for (const a of [-1, 1]) K.box(M, cx + a * (gw / 2 - 0.02), 0.94, fz, 0.04, 1.04, 0.025); for (const gy of [0.94, 1.94]) K.box(M, cx, gy, fz, gw, 0.04, 0.025);
    K.plane(MT.glass, cx, 1.46, fz + 0.002, gw - 0.08, 0.96); }
  for (let sh = 0; sh < 3; sh++) for (let i = 0; i < 4; i++) K.lathe(MT.ceramic, [[0, 0], [0.11, 0], [0.115, 0.01]], -w / 2 + 0.2 + i * (w - 0.4) / 3, 1.06 + sh * 0.36, bz + 0.06, { rx: -1.3 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, 0.92); tdCol(P, 0, -d / 2 + 0.2, w + 0.06, 0.4, 1.16, 0.92);
}
function tdFiling(x, y, z, rot) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.46, d = 0.5, h = 1.32; K.rbox(MT.steel, 0, 0, 0, w, h, d, 0.01);
  for (let i = 0; i < 4; i++) { K.box(MT.steel, 0, 0.04 + i * 0.32, d / 2 + 0.002, w - 0.03, 0.3, 0.008); K.box(MT.chrome, 0, 0.26 + i * 0.32, d / 2 + 0.014, 0.12, 0.02, 0.02); K.box(MT.paper, 0, 0.29 + i * 0.32, d / 2 + 0.008, 0.08, 0.04, 0.002); }
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h, 0, 'metal', 'metal');
}
function tdSafe(x, y, z, rot) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), w = 0.6, d = 0.6, h = 0.9; K.rbox(MT.black, 0, 0, 0, w, h, d, 0.03); K.box(MT.black, 0, 0.06, d / 2, w - 0.08, h - 0.12, 0.02);
  K.cyl(MT.chrome, 0.05, 0.55, d / 2 + 0.01, 0.06, 0.06, 0.03, 20, { rx: Math.PI / 2 }); K.rod(MT.chrome, new V3(-0.12, 0.4, d / 2 + 0.02), new V3(-0.12, 0.62, d / 2 + 0.02), 0.012);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h, 0, 'metal', 'metal');
}
function tdTub(x, y, z, rot, w, d) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), h = 0.56;
  K.rbox(MT.ceramic, 0, 0, 0, w, h, d, 0.06); K.rbox(MT.vc, 0, h - 0.4, 0, w - 0.14, 0.4, d - 0.14, 0.12, { col: 0xdfe8ec }); K.box(MT.vc, 0, h - 0.12, 0, w - 0.2, 0.004, d - 0.2, { col: 0x9ac0d0 });
  K.cyl(MT.chrome, -w / 2 + 0.12, h, -d / 2 + 0.1, 0.02, 0.02, 0.22, 8); K.rod(MT.chrome, new V3(-w / 2 + 0.12, h + 0.22, -d / 2 + 0.1), new V3(-w / 2 + 0.26, h + 0.22, -d / 2 + 0.1), 0.016);
  for (const s of [-1, 1]) K.cyl(MT.chrome, -w / 2 + 0.12 + s * 0.08, h, -d / 2 + 0.06, 0.018, 0.018, 0.05, 8);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h);
}
function tdToilet(x, y, z, rot) {
  const P = tdPiece(x, y, z, rot), K = new Kit();
  K.rbox(MT.ceramic, 0, 0.4, -0.25, 0.4, 0.38, 0.18, 0.03); K.box(MT.ceramic, 0, 0.78, -0.25, 0.42, 0.03, 0.2); K.box(MT.chrome, 0.12, 0.7, -0.155, 0.05, 0.015, 0.02);
  K.lathe(MT.ceramic, [[0, 0], [0.12, 0], [0.13, 0.18], [0.19, 0.36], [0.2, 0.4], [0.17, 0.4]], 0, 0, 0.0, { sz: 1.25 });
  K.add(MT.ceramic, new THREE.TorusGeometry(0.17, 0.025, 8, 24), 0, 0.42, 0.0, { rx: Math.PI / 2, sy: 1.25 });
  K.build(x, y, z, rot); tdCol(P, 0, -0.06, 0.42, 0.62, 0.44); tdCol(P, 0, -0.25, 0.42, 0.2, 0.37, 0.44);
}
function tdVanity(x, y, z, rot, w, mirror) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.55, h = 0.86, M = MT.oak;
  K.box(M, 0, 0.1, 0, w, h - 0.14, d); K.box(MT.black, 0, 0, 0, w - 0.06, 0.1, d - 0.06); K.box(MT.marble, 0, h - 0.04, 0.01, w + 0.02, 0.04, d + 0.02);
  const n = w > 1.1 ? 2 : 1; for (let i = 0; i < n; i++) { const cx = n === 1 ? 0 : (i ? 1 : -1) * w / 4;
    K.box(M, cx, 0.14, d / 2 + 0.003, w / n - 0.03, h - 0.24, 0.008); K.box(MT.brass, cx, 0.62, d / 2 + 0.016, 0.14, 0.012, 0.012);
    K.lathe(MT.ceramic, [[0, 0], [0.14, 0], [0.19, 0.12], [0.2, 0.13]], cx, h, 0.03, { sz: 0.75 }); K.box(MT.blackG, cx, h + 0.11, 0.03, 0.26, 0.004, 0.2);
    K.cyl(MT.chrome, cx, h, -d / 2 + 0.08, 0.018, 0.02, 0.22, 8); K.rod(MT.chrome, new V3(cx, h + 0.21, -d / 2 + 0.08), new V3(cx, h + 0.2, -d / 2 + 0.2), 0.012);
    if (mirror) { K.rbox(MT.black, cx, h + 0.38, -d / 2 + 0.012, w / n - 0.2, 0.75, 0.025, 0.01); K.plane(MT.mirror, cx, h + 0.38 + 0.375, -d / 2 + 0.026, w / n - 0.24, 0.71); } }
  K.lathe(MT.vcG, [[0, 0], [0.03, 0], [0.035, 0.12], [0.012, 0.15], [0.012, 0.18]], w / 2 - 0.12, h, -0.1, { col: 0xe8f0f4 }); K.box(MT.vc, -w / 2 + 0.15, h, -0.12, 0.16, 0.08, 0.1, { col: 0xd8c8b8 });
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h); if (mirror) tdCol(P, 0, -d / 2 + 0.014, w - 0.1, 0.03, 0.75, h + 0.38);
}
function tdShower(x, y, z, rot, s) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), h = 2.0;
  K.box(MT.ceramic, 0, 0, 0, s, 0.08, s); K.box(MT.steel, 0, 0.081, 0, 0.1, 0.004, 0.1);
  K.plane(MT.glass, 0, h / 2 + 0.08, s / 2 - 0.01, s - 0.02, h); K.plane(MT.glass, s / 2 - 0.01, h / 2 + 0.08, 0, s - 0.02, h, { ry: Math.PI / 2 });
  K.box(MT.chrome, 0, 0.08, s / 2 - 0.01, s, 0.03, 0.02); K.box(MT.chrome, 0, h + 0.05, s / 2 - 0.01, s, 0.03, 0.02); K.box(MT.chrome, s / 2 - 0.01, 0.08, 0, 0.02, 0.03, s); K.box(MT.chrome, s / 2 - 0.01, h + 0.05, 0, 0.02, 0.03, s);
  K.box(MT.chrome, s / 2 - 0.01, 0.08, s / 2 - 0.01, 0.03, h, 0.03); K.box(MT.chrome, 0.1, 1.0, s / 2 - 0.02, 0.02, 0.4, 0.03);
  K.cyl(MT.chrome, -s / 2 + 0.1, 0.8, -s / 2 + 0.04, 0.012, 0.012, 1.25, 8); K.cyl(MT.chrome, -s / 2 + 0.1, 2.03, -s / 2 + 0.1, 0.1, 0.1, 0.02, 16);
  K.build(x, y, z, rot); tdCol(P, 0, 0, s, s, 2.1);
}
function tdToyBox(x, y, z, rot, w) {
  const P = tdPiece(x, y, z, rot), K = new Kit(), d = 0.5, h = 0.5; K.rbox(MT.vc, 0, 0, 0, w, h, d, 0.02, { col: 0x3f7fbf }); K.rbox(MT.vc, 0, h, 0, w + 0.02, 0.04, d + 0.02, 0.01, { col: 0xf5d547 });
  K.sph(MT.vcG, -w * 0.2, h + 0.13, 0, 0.09, { col: 0xe35d5b }); K.rbox(MT.vcG, w * 0.2, h + 0.04, 0.02, 0.18, 0.12, 0.12, 0.02, { col: 0x6cc070 }); K.rbox(MT.fab(0xb08a6a), w * 0.05, h + 0.04, -0.05, 0.16, 0.22, 0.14, 0.06);
  K.build(x, y, z, rot); tdCol(P, 0, 0, w, d, h + 0.04);
}
function tdBeanBag(x, y, z, col) { const P = tdPiece(x, y, z, 0), K = new Kit(); K.add(MT.fab(col), new THREE.SphereGeometry(0.36, 20, 14), 0, 0.27, 0, { sy: 0.75 }); K.add(MT.fab(col), new THREE.SphereGeometry(0.3, 16, 12), 0, 0.44, -0.12, { sy: 0.7 }); K.build(x, y, z, 0); tdCol(P, 0, 0, 0.66, 0.66, 0.6); }
function tdGlobe(x, y, z) { const P = tdPiece(x, y, z, 0), K = new Kit(); K.cyl(MT.walnut, 0, 0, 0, 0.16, 0.18, 0.03, 16); K.cyl(MT.walnut, 0, 0.03, 0, 0.02, 0.03, 0.7, 8); K.add(MT.brass, new THREE.TorusGeometry(0.2, 0.008, 6, 28, Math.PI), 0, 0.92, 0, { rz: 0.4 }); K.sph(MT.vcG, 0, 0.92, 0, 0.18, { col: 0x3f7fa8 }); for (let i = 0; i < 6; i++) K.sph(MT.vc, Math.cos(i) * 0.12, 0.92 + Math.sin(i * 2) * 0.1, Math.sin(i) * 0.12, 0.06, { col: 0x8aa860, sx: 1.2, sy: 0.6 }); K.build(x, y, z, 0); tdCol(P, 0, 0, 0.42, 0.42, 1.12); }
function tdTowelRack(x, y, z, rot, w) { TD.wall.push([x, y, z, w]); const K = new Kit(); for (const s of [-1, 1]) K.box(MT.chrome, s * w / 2, -0.03, 0.04, 0.03, 0.06, 0.08); K.rod(MT.chrome, new V3(-w / 2, 0, 0.07), new V3(w / 2, 0, 0.07), 0.012); K.rbox(MT.fab(0xe8e0d0), 0, -0.45, 0.08, w * 0.6, 0.5, 0.03, 0.01); K.build(x, y, z, rot); }
function tdChandelier(x, y, z) {
  const K = new Kit(); K.cyl(MT.brass, 0, -0.04, 0, 0.08, 0.08, 0.04, 14); K.cyl(MT.brass, 0, -0.6, 0, 0.008, 0.008, 0.56, 6); K.lathe(MT.brass, [[0, -0.1], [0.06, -0.06], [0.05, 0], [0.01, 0.04]], 0, -0.68, 0);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, cx = Math.cos(a) * 0.32, cz = Math.sin(a) * 0.32; K.rod(MT.brass, new V3(0, -0.7, 0), new V3(cx, -0.66, cz), 0.008); K.cyl(MT.brass, cx, -0.68, cz, 0.03, 0.02, 0.03, 10); K.add(MT.shadeT, new THREE.CylinderGeometry(0.05, 0.08, 0.1, 14, 1, true), cx, -0.58, cz); }
  K.build(x, y, z, 0, { deco: false });
}
// ---- the rooms: floors, ceilings, trim, then what is in them
// room rectangles (inside faces of their walls): [x0, x1, z0, z1, floor material, floor]
function tdFloorMat(k) {
  if (k === 'wood') return tdMat('flWood', { map: TEXD.floorWood(), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1 });
  if (k === 'woodD') return tdMat('flWoodD', { map: TEXD.floorWood(), color: 0x8a6a52, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 });
  if (k === 'tile') return tdMat('flTile', { map: TEXD.tile(), roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -1 });
  if (k === 'stone') return tdMat('flStone', { map: TEXD.tileDark(), roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 });
  if (k === 'carpetB') return tdMat('flCarB', { map: TEXD.carpet(), color: 0x8a96a6, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  if (k === 'carpetK') return tdMat('flCarK', { map: TEXD.carpet(), color: 0xa6c0a0, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  return tdMat('flCar', { map: TEXD.carpet(), color: 0xc8bba8, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
}
const TD_TILE_M = { wood: 2.4, woodD: 2.4, tile: 1.2, stone: 1.2, carpet: 1.5, carpetB: 1.5, carpetK: 1.5 };
// a flat floor (or ceiling) piece: x0..x1, z0..z1 at y, facing up (or down)
function tdFlat(K, mat, x0, x1, z0, z1, y, rep, down) {
  const w = x1 - x0, d = z1 - z0; if (w <= 0.01 || d <= 0.01) return;
  const g = new THREE.PlaneGeometry(w, d), U = g.attributes.uv, P = g.attributes.position;
  for (let i = 0; i < U.count; i++) U.setXY(i, (P.getX(i) + x0 + w / 2) / rep, (P.getY(i) - (z0 + d / 2)) / rep);
  K.add(mat, g, (x0 + x1) / 2, y, (z0 + z1) / 2, { rx: down ? Math.PI / 2 : -Math.PI / 2 });
}
const TD_ROOMS = [
  // ground
  [-13.9, -7.06, -9.9, -0.06, 'tile', 0, 'Laundry'], [-6.94, -0.06, -9.9, -0.06, 'wood', 0, 'Hall'], [0.06, 13.9, -9.9, -0.06, 'stone', 0, 'Kitchen'],
  [-13.9, -4.06, 0.06, 9.9, 'wood', 0, 'Living room'], [-3.94, 1.94, 0.06, 9.9, 'stone', 0, 'Front hall'], [2.06, 7.94, 0.06, 9.9, 'wood', 0, 'Dining room'], [8.06, 13.9, 0.06, 9.9, 'woodD', 0, 'Office'],
  // upper
  [-13.9, -7.26, -9.9, -0.06, 'tile', 1, 'Bathroom'], [-7.14, 3.94, -9.9, -0.06, 'carpet', 1, 'Landing'], [4.06, 13.9, -9.9, -0.06, 'carpetB', 1, 'Main bedroom'],
  [-13.9, -5.06, 0.06, 9.9, 'carpet', 1, 'Guest bedroom'], [-4.94, 2.94, 0.06, 9.9, 'carpetK', 1, 'Kids room'], [3.06, 7.94, 0.06, 9.9, 'woodD', 1, 'Study'], [8.06, 13.9, 0.06, 9.9, 'tile', 1, 'Bathroom 2']
];
const tdCeil = () => tdMat('ceil', { color: 0xf4f2ee, roughness: 0.92 });
// floors and ceilings: downstairs a floor piece per room; upstairs and the ceilings, a piece per floor tile (it goes with
// its tile when part of a floor or the roof comes down)
function tdFloors(H) {
  const { f1 } = H;
  for (const [x0, x1, z0, z1, fm, fl] of TD_ROOMS) { if (fl) continue; const K = new Kit(); tdFlat(K, tdFloorMat(fm), x0, x1, z0, z1, 0.006, TD_TILE_M[fm]); const g = K.build(0, 0, 0, 0, { deco: false });
    for (const m of g.children) { m.userData.surf = fm === 'wood' || fm === 'woodD' ? 'wood' : 'concrete'; worldMeshes.push(m); } }
  for (const t of worldMeshes.slice()) {
    const u = t.userData; if (!u.slab || !u.box) continue; const b = u.box;
    if (Math.abs(b.max.y - f1) < 0.01) {
      // a tile of the upper floor: the finish of every room over it on top, a ceiling under it
      const K = new Kit();
      for (const [x0, x1, z0, z1, fm, fl] of TD_ROOMS) { if (!fl) continue; const a0 = Math.max(x0, b.min.x), a1 = Math.min(x1, b.max.x), c0 = Math.max(z0, b.min.z), c1 = Math.min(z1, b.max.z); if (a1 - a0 > 0.01 && c1 - c0 > 0.01) tdFlat(K, tdFloorMat(fm), a0, a1, c0, c1, f1 + 0.004, TD_TILE_M[fm]); }
      tdFlat(K, tdCeil(), b.min.x, b.max.x, b.min.z, b.max.z, b.min.y - 0.003, 3, true);
      t.attach(K.build(0, 0, 0, 0, { deco: false }));
    } else if (b.min.y > f1 + 1) { const K = new Kit(); tdFlat(K, tdCeil(), b.min.x, b.max.x, b.min.z, b.max.z, b.min.y - 0.003, 3, true); t.attach(K.build(0, 0, 0, 0, { deco: false })); }
  }
}
// skirting and coving along every inside wall of the house, on each face that is inside a room; it goes with the wall
function tdTrims(H) {
  const { f1, H: WH } = H, M = MT.trim;
  for (const m of worldMeshes.slice()) {
    const u = m.userData; if (u.house === undefined || u.kind !== 'drywall' || !u.box) continue;
    const b = u.box, gp = m.geometry.parameters, along = gp.width >= gp.depth ? 'x' : 'z', L = along === 'x' ? gp.width : gp.depth, T = along === 'x' ? gp.depth : gp.width;
    const base = u.house ? f1 : 0, ceil = u.house ? f1 + WH : f1 - 0.2, K = new Kit(); let any = false;
    for (const s of [-1, 1]) {
      const c = along === 'x' ? m.position.z : m.position.x; if (u.ext && Math.sign(c) === s) continue;   // (the outside face of an outside wall: brick)
      const off = s * (T / 2 + 0.007), fx = along === 'x' ? 0 : off, fz = along === 'x' ? off : 0, dw = along === 'x' ? L : 0.014, dd = along === 'x' ? 0.014 : L;
      const ly = b.min.y - m.position.y;
      if (Math.abs(b.min.y - base) < 0.02 && b.max.y - b.min.y > 0.2) { K.box(M, fx, ly, fz, dw, 0.11, dd); K.box(M, fx * 1.0 + (along === 'x' ? 0 : s * 0.004), ly + 0.11, fz + (along === 'x' ? s * 0.004 : 0), along === 'x' ? L : 0.008, 0.012, along === 'x' ? 0.008 : L); any = true; }
      if (b.max.y > ceil - 0.02 && ceil - b.min.y > 0.15) { const cy = ceil - m.position.y; K.box(M, fx, cy - 0.06, fz, dw, 0.06, dd); K.box(M, fx + (along === 'x' ? 0 : s * 0.012), cy - 0.035, fz + (along === 'x' ? s * 0.012 : 0), along === 'x' ? L : 0.012, 0.035, along === 'x' ? 0.012 : L); any = true; }
    }
    if (any) { const g = K.build(m.position.x, m.position.y, m.position.z, 0, { deco: false }); m.attach(g); } else K.b.clear();
  }
}
// casings round every doorway, on both faces
function tdDoorCasings(H) {
  if (typeof doors === 'undefined') return; const M = MT.trim, cw = 0.07, ht = DOOR_H + 0.1;
  for (const d of doors) {
    const g = d.g, ext = Math.abs(Math.abs(g.position.x) - 14) < 0.05 || Math.abs(Math.abs(g.position.z) - 10) < 0.05, K = new Kit();
    for (const s of [-1, 1]) {
      let face = ext ? 0.1 : 0.06; if (ext) { const out = Math.abs(Math.abs(g.position.z) - 10) < 0.05 ? Math.sign(g.position.z) : Math.sign(g.position.x); const sideOut = (Math.abs(Math.cos(g.rotation.y)) > 0.5 ? 1 : -1) * s; if (sideOut === out || (Math.abs(Math.cos(g.rotation.y)) < 0.5 && -s === out)) face = 0.16; }
      const z = s * (face + 0.009), xo = DOOR_W / 2 + DOOR_FW + cw / 2;
      for (const a of [-1, 1]) K.box(M, a * xo, 0, z, cw, ht + cw, 0.018);
      K.box(M, 0, ht, z, DOOR_W + 2 * DOOR_FW + 2 * cw, cw, 0.018); K.box(M, 0, ht + cw, z + s * 0.006, DOOR_W + 2 * DOOR_FW + 2 * cw + 0.04, 0.025, 0.03);
      for (const a of [-1, 1]) K.box(M, a * xo, 0, z + s * 0.004, cw + 0.012, 0.13, 0.026);       // the plinth blocks at the foot
    }
    K.build(g.position.x, g.position.y, g.position.z, g.rotation.y, { deco: false });
  }
}
// windows: a casing and a stool inside, curtains on the sides that are clear; the outside trim, sill and shutters go in the
// outside kit (ext)
function tdWindows(H, ext, noCurtain) {
  const M = MT.trim;
  for (const w of TOWN.windows) {
    const alongX = w.ax === 'x', c = alongX ? w.p.z : w.p.x, out = Math.sign(c), u = alongX ? w.p.x : w.p.z, base = w.y0 - 0.95, hw = w.w / 2;
    const room = TD_ROOMS.find(r => r[5] === (base > 1 ? 1 : 0) && (alongX ? (u > r[0] && u < r[1] && Math.abs((out > 0 ? r[3] : r[2]) - c) < 0.2) : (u > r[2] && u < r[3] && Math.abs((out > 0 ? r[1] : r[0]) - c) < 0.2)));
    // its own frame: x along the wall, z out of the wall into the room, y up from the floor
    const ry = alongX ? (out > 0 ? Math.PI : 0) : (out > 0 ? -Math.PI / 2 : Math.PI / 2), fz = 0.1, K = new Kit(), wx = alongX ? w.p.x : c - out * fz, wz = alongX ? c - out * fz : w.p.z;
    for (const a of [-1, 1]) K.box(M, a * (hw + 0.035), w.y0 - base - 0.02, 0.009, 0.07, w.y1 - w.y0 + 0.09, 0.018);
    K.box(M, 0, w.y1 - base, 0.009, w.w + 0.14, 0.07, 0.018); K.box(M, 0, w.y0 - base - 0.035, 0.035, w.w + 0.2, 0.03, 0.075); K.box(M, 0, w.y0 - base - 0.14, 0.009, w.w + 0.1, 0.1, 0.018);
    const name = room ? room[6] : '';
    if (!noCurtain.includes(name)) {
      // (a side is left bare where something stands against the wall there)
      const fab = { 'Living room': 0x8a6e5a, 'Dining room': 0x5e6e4f, 'Office': 0x3c4a5a, 'Main bedroom': 0xd9cfbd, 'Guest bedroom': 0xb87d7b, 'Kids room': 0x6aa0c8, 'Study': 0x7d5234 }[name] || 0xd9cfbd;
      const free = side => { const lx0 = side * (hw + 0.06), lx1 = side * (hw + 0.38), z0 = 0.02, z1 = 0.12; return !TD.furn.some(m => { const b = m.userData.box; if (!b || b.max.y < base + 0.3 || b.min.y > base + 2.3) return false;
        const pts = [[lx0, z0], [lx1, z1]].map(([lx, lz]) => [wx + lx * Math.cos(ry) + lz * Math.sin(ry), wz - lx * Math.sin(ry) + lz * Math.cos(ry)]); const mnx = Math.min(pts[0][0], pts[1][0]), mxx = Math.max(pts[0][0], pts[1][0]), mnz = Math.min(pts[0][1], pts[1][1]), mxz = Math.max(pts[0][1], pts[1][1]);
        return mxx > b.min.x - 0.02 && mnx < b.max.x + 0.02 && mxz > b.min.z - 0.02 && mnz < b.max.z + 0.02; }); };
      const top = w.y1 - base + 0.1, F = MT.fab(fab); K.rod(MT.brass, new V3(-(hw + 0.4), top, 0.07), new V3(hw + 0.4, top, 0.07), 0.012);
      for (const sd of [-1, 1]) { K.sph(MT.brass, sd * (hw + 0.4), top, 0.07, 0.022); if (!free(sd)) continue; for (let i = 0; i < 4; i++) K.cyl(F, sd * (hw + 0.1 + i * 0.07), 0.03, 0.07 + (i % 2) * 0.018, 0.034, 0.04, top - 0.04, 8); }
    }
    const g = K.build(wx, base, wz, ry, { deco: false });
    // outside: casing, a sill, louvred shutters (on the brick or siding face)
    const ox = alongX ? w.p.x : c + out * 0.16, oz = alongX ? c + out * 0.16 : w.p.z, ory = ry + Math.PI;
    const E = new Kit(); for (const a of [-1, 1]) E.box(M, a * (hw + 0.045), w.y0 - base - 0.02, 0.012, 0.09, w.y1 - w.y0 + 0.1, 0.024);
    E.box(M, 0, w.y1 - base, 0.012, w.w + 0.18, 0.1, 0.024); E.box(M, 0, w.y1 - base + 0.1, 0.03, w.w + 0.24, 0.03, 0.06); E.box(MT.stone, 0, w.y0 - base - 0.07, 0.04, w.w + 0.22, 0.06, 0.1);
    for (const a of [-1, 1]) { const sx = a * (hw + 0.09 + 0.19); E.box(MT.louver, sx, w.y0 - base - 0.03, 0.02, 0.38, w.y1 - w.y0 + 0.08, 0.03); for (const k of [0.1, w.y1 - w.y0 - 0.06]) E.box(MT.dark, sx, w.y0 - base + k, 0.04, 0.3, 0.02, 0.012); }
    for (const [mat, list] of E.b) for (const q of list) { q.applyMatrix4(new THREE.Matrix4().makeRotationY(ory)); q.translate(ox, base, oz); ext.add(mat, q, 0, 0, 0); } E.b.clear();
  }
}
// the rails round the stair well upstairs (a balustrade: a handrail on posts with spindles), and the handrail down the
// banister wall
function tdRails(H) {
  const { f1, sx0, sz0, sz1, sTop, run, rise } = H, K = new Kit(), M = MT.trim, R = MT.walnut;
  // along the open side of the well, from its far end to where the stairs come up, and across its far end
  const zr = sz1 + 0.04, xr = sx0 - 0.04;
  tdCol(tdPiece(0, 0, 0, 0), (sx0 + sTop) / 2, zr, sTop - sx0, 0.08, 0.95, f1);
  tdCol(tdPiece(0, 0, 0, 0), xr, (sz0 + sz1) / 2 - 0.02, 0.08, sz1 - sz0 - 0.04, 0.95, f1);
  K.box(R, (sx0 + sTop) / 2, f1 + 0.9, zr, sTop - sx0 + 0.08, 0.06, 0.09); K.box(R, xr, f1 + 0.9, (sz0 + sz1) / 2, 0.09, 0.06, sz1 - sz0);
  K.box(M, (sx0 + sTop) / 2, f1, zr, sTop - sx0, 0.06, 0.08); K.box(M, xr, f1, (sz0 + sz1) / 2, 0.08, 0.06, sz1 - sz0);
  for (let x = sx0 + 0.15; x < sTop - 0.05; x += 0.13) K.box(M, x, f1 + 0.06, zr, 0.03, 0.84, 0.03);
  for (let z = sz0 + 0.12; z < sz1 - 0.05; z += 0.13) K.box(M, xr, f1 + 0.06, z, 0.03, 0.84, 0.03);
  for (const [px, pz] of [[sx0, zr], [sTop, zr], [xr, sz0 + 0.06]]) { K.box(R, px, f1, pz, 0.1, 1.02, 0.1); K.box(R, px, f1 + 1.02, pz, 0.13, 0.04, 0.13); }
  // the handrail along the top of the banister wall, stepping up with the stairs, and a newel at its foot
  for (let i = 2; i < 15; i++) { const top = Math.min((i + 1) * rise + 0.9, f1 - 0.2); if (top >= f1 - 0.2) break; K.box(R, sx0 + i * run + run / 2, top, sz1 + 0.04, run + 0.002, 0.05, 0.11); }
  K.build(0, 0, 0, 0, { deco: false });
}
// a picture or mirror on a wall face (x, z: on the face; rot: the way it faces)
function tdOnWall(fn, x, y, z, rot, ...a) { return fn(x, y, z, rot, ...a); }
function tdRoomsFurnish(H) {
  const F = H.f1, PI = Math.PI, H2 = PI / 2;
  // ---- downstairs
  // laundry and mud room
  tdWasher(-13.45, 0, -9.5, 0); tdWasher(-12.75, 0, -9.5, 0, true); tdWallShelf(-13.1, 1.5, -9.75, 0, 1.5, true);
  tdUtilSink(-11.0, 0, -9.62, 0); tdShelving(-13.69, 0, -8.2, H2, 1.6, 1.9); tdWaterHeater(-7.45, 0, -9.5);
  tdWorkbench(-7.38, 0, -7.7, -H2, 1.8); tdBench(-13.68, 0, -0.75, H2, 1.0, 0x5e6e4f); tdCoatHooks(-13.9, 1.6, -0.75, H2, 1.0, true);
  tdFreezer(-12.2, 0, -0.45, PI, 1.3); tdBasket(-11.75, 0, -9.62); tdBasket(-7.35, 0, -6.45, 0x5a7aa8);
  tdClock(-9.0, 2.0, -0.06, PI);
  // stair hall
  tdConsole(-0.24, 0, -7.6, -H2, 1.4, true); tdMirror(-0.06, 1.95, -7.6, -H2, 0.9, 0.7); tdBench(-5.6, 0, -0.26, PI, 1.6, 0x8a6e5a); tdShoeCabinet(-1.0, 0, -0.24, PI, 1.2);
  tdPlant(-0.4, 0, -9.5, 1.0, 2); tdRug(-3.4, 0, -5.4, 3.6, 1.6, 2); tdArt(-6.94, 1.6, -5.8, H2, 0.9, 0.65, 0); tdArt(-5.6, 1.7, -0.06, PI, 0.7, 0.5, 2);
  // kitchen
  tdFridge(0.57, 0, -9.5, 0);
  tdKitchenRun(5.98, 0, -9.59, 0, 9.84, { sinkX: 0.02, dwX: 0.97, stoveX: 2.22, hood: true, skip: [[-0.4, 0.4], [0.66, 1.28], [1.82, 2.62]], upper: [[-3.28, -0.68], [0.72, 1.87], [2.57, 3.32]],
    items: [['herbs', -4.5], ['knives', -2.4], ['board', -1.6], ['kettle', 3.9], ['coffee', -3.4]] });
  tdKitchenRun(13.59, 0, -6.8, -H2, 3.2, { items: [['micro', 0.6], ['herbs', -1.2]] });
  tdIsland(7.2, 0, -5.4, 0, 2.4, 1.0, 3); tdRoundTable(2.9, 0, -2.5, 0.55, 0x8a6e5a); tdRug(5.98, 0, -8.85, 1.6, 0.6, 1);
  tdClock(9.0, 2.15, -0.06, PI); tdArt(13.9, 1.7, -2.6, -H2, 0.8, 0.6, 2); tdPlant(13.45, 0, -0.5, 1.0, 1);
  // living room
  tdMediaUnit(-7.75, 0, 0.27, 0, 1.7); tdSofa(-7.75, 0, 6.35, PI, 2.5, 0x6e7884, { pillows: [[-0.7, 0xd9c27a], [0.7, 0x8a3a2a]] }); tdCoffeeTable(-7.75, 0, 4.55, 0, 1.2, 0.65);
  tdArmchair(-10.0, 0, 4.4, H2, 0xc49a3c); tdArmchair(-5.5, 0, 5.3, -H2, 0, true); tdSideTable(-9.35, 0, 6.35, 0, true); tdFloorLamp(-6.05, 0, 6.6);
  tdBookcase(-13.72, 0, 7.1, H2, 1.8, 2.0); tdFireplace(-10.0, 0, 9.65, PI, 1.7); tdRug(-7.75, 0, 5.2, 4.2, 3.2, 0);
  tdPlant(-13.45, 0, 9.45, 1.1, 2); tdPlant(-4.5, 0, 9.45, 1.0, 0); tdArt(-10.0, 1.95, 9.9, PI, 1.2, 0.8, 3); tdArt(-4.06, 1.6, 8.6, -H2, 0.7, 0.9, 1); tdArt(-13.9, 1.65, 2.0, H2, 1.1, 0.75, 0);
  // front hall
  tdConsole(1.76, 0, 2.3, -H2, 1.4, true); tdMirror(1.94, 1.75, 2.3, -H2, 0.8, 1.0); tdBench(-3.74, 0, 6.8, H2, 1.2, 0x3c4a5a); tdCoatHooks(-3.94, 1.65, 6.8, H2, 1.2, true);
  tdGrandClock(1.72, 0, 7.4, -H2); tdUmbrella(0.5, 0, 9.55); tdPlant(1.55, 0, 9.5, 1.0, 1); tdRug(-1.0, 0, 5.2, 1.2, 7.6, 2); tdArt(0.6, 1.6, 0.06, 0, 0.8, 0.6, 1);
  // dining room
  tdDining(5.0, 0, 6.4, 0, 2.0, 1.0, 3, 0x7d6a55); tdSideboard(6.3, 0, 0.29, 0, 2.2); tdHutch(2.31, 0, 7.9, H2, 1.4); tdPlant(7.5, 0, 9.45, 1.0, 2); tdPlant(2.5, 0, 9.45, 0.9, 1);
  tdRug(5.0, 0, 6.4, 3.4, 2.4, 1); tdChandelier(5.0, F - 0.2, 6.4); tdArt(7.94, 1.6, 7.2, -H2, 1.0, 0.7, 3); tdArt(6.3, 1.75, 0.06, 0, 1.2, 0.6, 0);
  // office
  tdDesk(11.1, 0, 9.5, PI, 1.6, true); tdOfficeChair(11.1, 0, 8.75, PI, true); tdBookcase(13.72, 0, 8.3, -H2, 2.2, 2.0, MT.dark);
  tdFiling(8.31, 0, 8.35, H2); tdFiling(8.31, 0, 8.9, H2); tdSafe(8.5, 0, 0.5, 0); tdArmchair(13.3, 0, 4.2, -H2, 0, true); tdFloorLamp(13.55, 0, 3.55);
  tdPlant(13.5, 0, 0.5, 1.0, 2); tdRug(11.1, 0, 8.2, 2.6, 2.2, 0); tdArt(12.8, 1.6, 0.06, 0, 0.8, 0.6, 3); tdClock(8.06, 2.0, 5.6, H2);
  // ---- upstairs
  // bathroom
  tdTub(-13.0, F, -9.48, 0, 1.7, 0.8); tdToilet(-13.53, F, -7.8, H2); tdVanity(-7.535, F, -7.6, -H2, 1.4, true); tdShower(-7.79, F, -9.39, -H2, 1.0);
  tdWardrobe(-12.9, F, -0.36, PI, 1.0); tdBasket(-11.75, F, -9.65, 0xd8d0c8); tdPlant(-9.0, F, -9.5, 0.9, 1); tdRug(-11.0, F, -8.6, 1.0, 0.6, 1);
  tdTowelRack(-13.9, F + 1.5, -9.0, H2, 0.6); tdArt(-8.3, F + 1.5, -0.06, PI, 0.6, 0.8, 2);
  // landing
  tdSofa(1.2, F, -9.44, 0, 2.4, 0x5e6e4f, { pillows: [[-0.6, 0xd9cfbd], [0.6, 0xc49a3c]] }); tdCoffeeTable(1.2, F, -8.05, 0, 1.1, 0.55); tdBookcase(3.76, F, -6.4, -H2, 1.6, 2.0);
  tdConsole(1.0, F, -0.24, PI, 1.4, true); tdPlant(-6.7, F, -9.5, 0.9, 2); tdPlant(3.55, F, -9.5, 0.9, 1); tdRug(1.2, F, -7.95, 2.8, 2.0, 2);
  tdArt(-7.14, F + 1.55, -6.5, H2, 1.0, 0.7, 0); tdArt(-0.3, F + 1.6, -0.06, PI, 0.5, 0.6, 1); tdArt(2.3, F + 1.6, -0.06, PI, 0.5, 0.6, 3);
  // main bedroom
  tdBed(9.0, F, -8.77, 0, 2.0, 2.15, 0x4f6378, 0x8a8f96); tdNightstand(7.62, F, -9.65, 0, true); tdNightstand(10.38, F, -9.65, 0, true); tdBench(9.0, F, -7.35, 0, 1.5, 0xd9cfbd);
  tdDresser(4.3, F, -8.7, H2, 1.4, true); tdWardrobe(13.6, F, -2.6, -H2, 1.6); tdArmchair(13.3, F, -9.3, -H2, 0xd9cfbd); tdFloorLamp(13.6, F, -8.5);
  tdMediaUnit(9.5, F, -0.27, PI, 1.2); tdRug(9.0, F, -7.6, 3.4, 2.6, 2); tdPlant(4.45, F, -5.0, 1.0, 2); tdArt(9.0, F + 1.75, -9.9, 0, 1.4, 0.8, 0); tdArt(13.9, F + 1.6, -8.5, -H2, 0.6, 0.8, 2);
  // guest bedroom
  tdBed(-10.5, F, 8.82, PI, 1.6, 2.05, 0xb87d7b, 0xd9cfbd); tdNightstand(-11.62, F, 9.65, PI, true); tdNightstand(-9.38, F, 9.65, PI, true); tdWardrobe(-13.6, F, 8.2, H2, 1.6, MT.oak);
  tdDesk(-5.42, F, 6.3, -H2, 1.4); tdOfficeChair(-6.1, F, 6.3, H2); tdDresser(-13.66, F, 1.9, H2, 1.4, false, MT.walnut); tdArmchair(-13.45, F, 5.0, H2, 0x8a96a6);
  tdRug(-10.5, F, 6.6, 3.0, 2.2, 1); tdPlant(-5.45, F, 9.45, 0.9, 2); tdArt(-10.5, F + 1.8, 9.9, PI, 1.1, 0.6, 2); tdMirror(-5.06, F + 1.55, 4.6, -H2, 0.5, 0.9);
  // kids room
  tdBed(-3.95, F, 5.3, H2, 0.95, 1.95, 0x6aa0c8, 0xf5d547); tdDesk(2.58, F, 7.2, -H2, 1.2); tdOfficeChair(1.9, F, 7.2, H2); tdBookcase(0.0, F, 0.24, 0, 1.6, 1.0, MT.painted);
  tdToyBox(2.45, F, 9.65, PI, 0.9); tdBeanBag(1.6, F, 5.0, 0xe35d5b); tdRug(-1.0, F, 5.8, 2.8, 2.2, 3);
  tdArt(2.94, F + 1.6, 5.2, -H2, 0.6, 0.85, MT.poster(0)); tdArt(-3.2, F + 1.65, 0.06, 0, 0.6, 0.85, MT.poster(1)); tdArt(2.94, F + 1.6, 8.6, -H2, 0.5, 0.7, MT.poster(2));
  { const K = new Kit(); for (let i = 0; i < 8; i++) K.rbox(MT.vcG, 0.6 + Math.cos(i) * 0.5, 0, 6.2 + Math.sin(i * 1.7) * 0.4, 0.08, 0.08, 0.08, 0.01, { ry: i, col: [0xe35d5b, 0xf5d547, 0x3f7fbf, 0x6cc070][i % 4] }); K.build(0, F + 0.006, 0, 0, { deco: false }); }
  // study
  tdDesk(5.5, F, 9.5, PI, 1.4); tdOfficeChair(5.5, F, 8.75, PI); tdBookcase(3.24, F, 9.1, H2, 1.4, 2.0); tdBookcase(3.24, F, 1.15, H2, 1.4, 2.0); tdBookcase(7.76, F, 1.8, -H2, 1.4, 2.0);
  tdArmchair(7.35, F, 9.2, -H2, 0, true); tdFloorLamp(7.55, F, 8.35); tdGlobe(3.9, F, 4.8); tdRug(5.4, F, 6.0, 2.6, 2.0, 0); tdArt(6.6, F + 1.65, 0.06, 0, 1.0, 0.6, 1);
  // second bathroom
  tdTub(13.0, F, 9.48, PI, 1.7, 0.8); tdToilet(13.53, F, 7.4, -H2); tdVanity(8.335, F, 7.0, H2, 1.4, true); tdShower(13.39, F, 0.57, -H2, 1.0);
  tdWardrobe(8.8, F, 0.36, 0, 1.0); tdPlant(9.0, F, 9.5, 0.9, 1); tdRug(11.0, F, 6.0, 1.0, 0.6, 1); tdTowelRack(13.9, F + 1.5, 8.8, -H2, 0.6);
}
// ---- outside
// hide the drawn box of a solid that has a model over it now (found by its footprint centre)
function tdHideAt(x, z, y0) {
  for (const m of worldMeshes) { const b = m.userData.box; if (!b || m.userData.door) continue;
    if (Math.abs((b.min.x + b.max.x) / 2 - x) < 0.06 && Math.abs((b.min.z + b.max.z) / 2 - z) < 0.06 && (y0 === undefined || Math.abs(b.min.y - y0) < 0.06)) { m.material.visible = false; m.castShadow = false; m.userData.furn = true; } }
}
// a vertical panel in the plane x = px (or z = pz) through the given outline [[u, y], ...] (u along z, or along x), both faces
function tdPanel(K, mat, pts, px, pz, uvS) {
  const pos = [], uv = [], nrm = [], tri = (a, b, c, n) => { for (const p of [a, b, c]) { if (px !== null) pos.push(px, p[1], p[0]); else pos.push(p[0], p[1], pz); uv.push(p[0] / uvS, p[1] / uvS); nrm.push(...n); } };
  const n1 = px !== null ? [1, 0, 0] : [0, 0, 1], n2 = n1.map(v => -v);
  for (let i = 1; i < pts.length - 1; i++) { tri(pts[0], pts[i], pts[i + 1], px !== null ? n2 : n1); tri(pts[0], pts[i + 1], pts[i], px !== null ? n1 : n2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  K.add(mat, g, 0, 0, 0);
}
// the pitched roof over the flat one: per tile of the roof slab, the shingled slope above it (and the gable end, the eaves
// board and gutter where the tile is at an edge, the ridge where it meets the other slope), riding on the tile
const ROOF_S = 0.42;
function tdRoof(H) {
  const { f1, H: WH } = H, top = f1 + WH + 0.2, half = 10.5, Y = z => top + (half - Math.abs(z)) * ROOF_S, th = Math.atan(ROOF_S);
  for (const t of worldMeshes.slice()) {
    const u = t.userData; if (!u.slab || !u.box || Math.abs(u.box.min.y - (f1 + WH)) > 0.02) continue;
    const b = u.box, K = new Kit(), za = b.min.z, zb = b.max.z, zc = (za + zb) / 2, south = zc > 0, w = b.max.x - b.min.x, xc = (b.min.x + b.max.x) / 2;
    const L = (zb - za) / Math.cos(th) + 0.02, yc = (Y(za) + Y(zb)) / 2;
    K.add(MT.shingle, new THREE.BoxGeometry(w + 0.004, 0.07, L), xc, yc + 0.035, zc, { rx: south ? th : -th, uv: [w / 1.6, L / 1.6] });
    if (Math.abs(Math.abs(south ? zb : za) - half) < 0.02) { const ez = south ? zb : za, s = south ? 1 : -1;
      K.box(MT.trim, xc, top - 0.22, ez + s * 0.015, w, 0.3, 0.03); K.add(MT.gutter, new THREE.CylinderGeometry(0.075, 0.075, w, 10, 1, true, 0, Math.PI), xc, top - 0.04, ez + s * 0.1, { rz: -Math.PI / 2 }); }
    if (Math.abs(south ? za : zb) < 0.02) K.add(MT.shingle, new THREE.BoxGeometry(w + 0.004, 0.14, 0.32), xc, Y(0) + 0.06, 0, { rx: Math.PI / 4, sz: 0.75 });
    for (const [ex, s] of [[b.min.x, -1], [b.max.x, 1]]) if (Math.abs(Math.abs(ex) - 14.5) < 0.02) {
      tdPanel(K, MT.siding, [[za, top], [zb, top], [zb, Y(zb)], [za, Y(za)]], ex - s * 0.03, null, 0.92);
      K.add(MT.trim, new THREE.BoxGeometry(0.05, 0.2, L), ex - s * 0.005, yc - 0.06, zc, { rx: south ? th : -th });
    }
    t.attach(K.build(0, 0, 0, 0, { shadow: true, deco: false }));
  }
  // the chimney carried up through the roof, a cap and two flue pots (rides on the chimney's own box)
  const ch = worldMeshes.find(m => m.userData.kind === 'brick' && m.userData.box && Math.abs(m.position.x - 9) < 0.1 && Math.abs(m.position.z + 2) < 0.1 && m.position.y > f1 + WH);
  if (ch) { const b = ch.userData.box, K = new Kit(), bm = tdMat('chBrick', { map: TEX.brick, color: 0xc89a86, roughness: 0.9 }), cy = Y(b.min.z) + 0.9;
    K.box(bm, 9, b.max.y, -2, 0.9, cy - b.max.y, 0.9, { uv: [1.5, (cy - b.max.y) / 0.6] }); K.box(MT.conc, 9, cy, -2, 1.05, 0.1, 1.05); for (const dx of [-0.2, 0.2]) K.cyl(tdMat('flue', { color: 0x9a5a3a, roughness: 0.9 }), 9 + dx, cy + 0.1, -2, 0.1, 0.12, 0.35, 12);
    ch.attach(K.build(0, 0, 0, 0, { shadow: true, deco: false })); }
}
// the house front: siding upstairs, a plinth, corner boards, a band between the floors (in the outside kit)
function tdFacade(H, E) {
  const { f1 } = H;
  for (const m of worldMeshes) { const u = m.userData; if (u.house === 1 && u.kind === 'brick') { m.material.map = TEXD.siding(); m.material.color.set(0xe6e0d0); m.material.roughness = 0.8; m.material.needsUpdate = true; } }
  const of = 14.16, oz = 10.16, d = 0.04, M = MT.trim;
  // along a face, from a to b, skipping the gaps: a run of boxes
  const run = (axis, c, s, a, b, gaps, y0, h, dep) => { const g = gaps.slice().sort((p, q) => p[0] - q[0]); let u = a; for (const [g0, g1] of g.concat([[b, b]])) { if (g0 - u > 0.05) { const L = g0 - u, cu = (u + g0) / 2; if (axis === 'x') E.box(MT.conc, cu, y0, c + s * dep / 2, L, h, dep); else E.box(MT.conc, c + s * dep / 2, y0, cu, dep, h, L); } u = Math.max(u, g1); } };
  run('x', oz, 1, -of, of, [[-3.62, -3.38], [-2.55, 0.55]], 0, 0.42, 0.06); run('x', -oz, -1, -of, of, [[11.7, 12.9]], 0, 0.42, 0.06);
  run('z', -of, -1, -oz, oz, [[-2.8, -1.6]], 0, 0.42, 0.06); run('z', of, 1, -oz, oz, [[1.8, 3.0]], 0, 0.42, 0.06);
  const band = (axis, c, s, a, b, gaps) => { const g = gaps.concat([[b, b]]); let u = a; for (const [g0, g1] of g) { if (g0 - u > 0.05) { const L = g0 - u, cu = (u + g0) / 2; if (axis === 'x') E.box(M, cu, f1 - 0.12, c + s * d / 2, L, 0.24, d); else E.box(M, c + s * d / 2, f1 - 0.12, cu, d, 0.24, L); } u = g1; } };
  band('x', oz, 1, -of, of, [[-3.56, 1.56]]); band('x', -oz, -1, -of, of, []); band('z', -of, -1, -oz, oz, []); band('z', of, 1, -oz, oz, []);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { E.box(M, sx * (of - 0.07), 0.42, sz * (oz + 0.015), 0.14, f1 + 2.8 - 0.42, 0.03); E.box(M, sx * (of + 0.015), 0.42, sz * (oz - 0.07), 0.03, f1 + 2.8 - 0.42, 0.14); }
}
// the front porch: turned columns over the posts, the roof's edge and its covering, a lantern, planters, a mat, the number
function tdPorch(H, E) {
  const { f1, z1 } = H;
  for (const px of [-3.3, 1.3]) { tdHideAt(px, z1 + 2.55, 0); E.lathe(MT.trim, [[0.14, 0], [0.14, 0.12], [0.11, 0.16], [0.095, 0.3], [0.085, f1 - 0.55], [0.1, f1 - 0.45], [0.14, f1 - 0.38], [0.14, f1 - 0.2], [0, f1 - 0.2]], px, 0, z1 + 2.55); }
  for (const m of worldMeshes) { const b = m.userData.box; if (b && Math.abs((b.min.x + b.max.x) / 2 + 3.5) < 0.05 && Math.abs((b.min.z + b.max.z) / 2 - (z1 + 1.4)) < 0.05 && b.min.y < 0.1) { m.material.map = TEXD.siding(); m.material.color.set(0xe6e0d0); m.material.needsUpdate = true; } }
  E.box(MT.trim, -1, f1 - 0.24, z1 + 2.72, 5.04, 0.26, 0.04); E.box(MT.trim, 1.52, f1 - 0.24, z1 + 1.4, 0.04, 0.26, 2.64);
  E.box(tdMat('porchTop', { map: TEXD.shingle(), color: 0x8a8a8a, roughness: 0.95 }), -1, f1 + 0.002, z1 + 1.4, 4.98, 0.008, 2.58, { uv: [3, 1.6] });
  E.box(tdCeil(), -1, f1 - 0.205, z1 + 1.4, 4.96, 0.004, 2.56);
  { const K = new Kit(); tdFlat(K, tdFloorMat('woodD'), -3.45, 1.5, z1 + 0.2, z1 + 2.7, 0.006, 2.4); K.build(0, 0, 0, 0, { deco: false }); }
  E.box(tdMat('mat', { map: TEXD.carpet(), color: 0x6a5a48, roughness: 1 }), -1, 0.151, z1 + 0.62, 0.9, 0.008, 0.55);
  tdPlant(-2.15, 0.15, z1 + 0.55, 1.0, 0); tdPlant(0.15, 0.15, z1 + 0.55, 1.0, 0);
  E.box(MT.black, 0.3, 1.9, z1 + 0.175, 0.28, 0.12, 0.02); for (let i = 0; i < 2; i++) E.box(MT.brass, 0.22 + i * 0.14, 1.93, z1 + 0.19, 0.07, 0.07, 0.006);
  // the lantern by the door (its glass glows with the lights)
  E.box(MT.black, -2.6, 1.98, z1 + 0.18, 0.18, 0.04, 0.2); E.box(MT.black, -2.6, 2.4, z1 + 0.18, 0.2, 0.05, 0.22); for (const a of [-1, 1]) for (const b of [-1, 1]) E.box(MT.black, -2.6 + a * 0.075, 2.02, z1 + 0.18 + b * 0.075, 0.015, 0.38, 0.015);
}
// trees, shrubs, beds, the patio, bins, the mailbox, fence posts and the hedges' tops
// (the tree itself: 01d-town-surround)
function tdTree(x, z, s, kind) { tdTreeX(x, z, s, kind); }
function tdShrub(x, z, s, flowers) {
  const P = tdPiece(x, 0, z, 0), K = new Kit();
  for (let i = 0; i < 5; i++) { const a = i * 1.3; K.add(i % 2 ? MT.leaf : MT.leafD, new THREE.IcosahedronGeometry(0.26 * s, 1), Math.cos(a) * 0.12 * s, (0.26 + (i % 3) * 0.12) * s, Math.sin(a) * 0.12 * s, { sx: 1.15, sy: 0.85, sz: 1.15 }); }
  if (flowers) for (let i = 0; i < 9; i++) K.sph(MT.vcG, tdRnd(-0.2, 0.2) * s, (0.45 + tdRnd(0, 0.15)) * s, tdRnd(-0.2, 0.2) * s, 0.035 * s, { col: flowers });
  K.build(x, 0, z, 0, { shadow: true, deco: false });   // (no solid: you walk through a bush)
}
function tdYard(H, E) {
  const { z1 } = H;
  // beds along the front, the sides and the back: soil, a stone edge, shrubs between the windows
  const bed = (x0, x1, z0, zz1) => { const K = new Kit(); tdFlat(K, MT.soil, x0, x1, z0, zz1, 0.008, 1); K.build(0, 0, 0, 0, { deco: false }); };
  bed(-14.1, -3.62, z1 + 0.25, z1 + 1.15); bed(1.6, 7.7, z1 + 0.25, z1 + 1.15); bed(11.3, 14.1, z1 + 0.25, z1 + 1.15);
  for (const [x0, x1] of [[-14.1, -3.62], [1.6, 7.7], [11.3, 14.1]]) E.box(MT.stone, (x0 + x1) / 2, 0, z1 + 1.18, x1 - x0, 0.08, 0.08);
  for (const [x, f] of [[-13.3, 0xd84a6a], [-10.0, 0], [-5.8, 0xf2e05a], [2.6, 0xd84a6a], [7.2, 0], [12.8, 0xf2f2f2]]) tdShrub(x, z1 + 0.7, 0.9, f);
  for (const z of [-8.5, 0.5, 7.5]) tdShrub(-14.85, z, 0.85, 0); for (const z of [-8.5, -2.5, 8.3]) tdShrub(14.85, z, 0.85, 0);
  for (const x of [-13.2, -7.5, 4.0, 8.0]) tdShrub(x, -10.85, 0.85, 0);
  // the patio: a round table under a parasol, four chairs, a barbecue
  tdHideAt(-2, -13, 0);
  { const P = tdPiece(-2, 0, -13, 0), K = new Kit(), M = MT.black, S = MT.fab(0x3c4a5a);
    K.cyl(MT.glass, 0, 0.72, 0, 0.6, 0.6, 0.02, 28); K.add(M, new THREE.TorusGeometry(0.6, 0.015, 6, 28), 0, 0.73, 0, { rx: Math.PI / 2 }); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; K.rod(M, new V3(Math.cos(a) * 0.55, 0.72, Math.sin(a) * 0.55), new V3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), 0.015); }
    K.cyl(MT.steel, 0, 0, 0, 0.02, 0.02, 2.3, 8); K.add(MT.fab(0xd9cfbd), new THREE.ConeGeometry(1.4, 0.45, 8, 1, true), 0, 2.35, 0); K.cyl(MT.steel, 0, 2.55, 0, 0.03, 0.03, 0.06, 8);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; tdChair(K, Math.sin(a) * 0.86, Math.cos(a) * 0.86, a + Math.PI, M, S); }
    K.build(-2, 0, -13, 0, { shadow: true, deco: false }); tdCol(P, 0, 0, 1.2, 1.2, 0.04, 0.72);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; tdCol(P, Math.sin(a) * 0.9, Math.cos(a) * 0.9, Math.abs(Math.sin(a)) > 0.5 ? 0.36 : 0.44, Math.abs(Math.sin(a)) > 0.5 ? 0.44 : 0.36, 0.5); } }
  { const P = tdPiece(0.9, 0, -12.2, 0), K = new Kit(); K.add(MT.black, new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.85, 0, { rx: Math.PI }); K.add(MT.black, new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.86, 0);
    for (let i = 0; i < 3; i++) { const a = i * 2.09; K.rod(MT.black, new V3(Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2), new V3(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), 0.015); } K.box(MT.chrome, 0, 1.15, 0, 0.12, 0.03, 0.03);
    K.build(0.9, 0, -12.2, 0, { shadow: true, deco: false }); tdCol(P, 0, 0, 0.66, 0.66, 1.2, 0, 'metal', 'metal'); }
  // wheelie bins
  for (const [bz, c] of [[-2.5, 0x2e5a3a], [-1.7, 0x2a3a5a]]) { tdHideAt(15.6, bz, 0); const K = new Kit(), M = tdMat('bin' + c, { color: c, roughness: 0.6 });
    K.add(M, new THREE.BoxGeometry(0.58, 1.0, 0.58), 0, 0.55, 0, { sx: 1, sz: 1 }); K.rbox(M, 0, 1.03, -0.02, 0.62, 0.05, 0.64, 0.02); K.box(MT.black, 0, 0.98, -0.31, 0.5, 0.04, 0.04);
    for (const s of [-1, 1]) K.cyl(MT.black, s * 0.26, 0.1, -0.24, 0.1, 0.1, 0.06, 12, { rz: Math.PI / 2 }); K.build(15.6, 0, bz, Math.PI / 2, { shadow: true, deco: false }); }
  // the mailbox at the end of the path
  { tdHideAt(-2.2, 16.2, 0); const K = new Kit(); K.box(MT.oak, 0, 0, 0, 0.1, 1.05, 0.1); K.rbox(MT.black, 0, 1.05, 0, 0.22, 0.24, 0.46, 0.05); K.box(tdMat('flag', { color: 0xc0392b, roughness: 0.6 }), 0.12, 1.15, 0.05, 0.01, 0.18, 0.05); K.build(-2.2, 0, 16.2, 0, { shadow: true, deco: false }); }
  // the shed: a pitched roof, a door, a window, corner trim
  { const K = new Kit(), x0 = 14.0, x1 = 17.0, zc = -13.5, top = 2.3, half = 1.35, S = 0.5;
    for (const s of [-1, 1]) K.add(MT.shingle, new THREE.BoxGeometry(3.3, 0.05, half / Math.cos(Math.atan(S)) + 0.05), 15.5, top + half * S / 2 + 0.03, zc + s * half / 2, { rx: s > 0 ? Math.atan(S) : -Math.atan(S), uv: [2, 1] });
    for (const ex of [x0 - 0.02, x1 + 0.02]) tdPanel(K, MT.siding, [[zc - 1.2, top], [zc + 1.2, top], [zc, top + half * S]], ex, null, 0.92);
    K.box(MT.paintedG, x0 - 0.015, 0.02, zc + 0.3, 0.02, 1.95, 0.9); K.box(MT.trim, x0 - 0.025, 0.02, zc + 0.3, 0.02, 2.02, 1.04); K.box(MT.brass, x0 - 0.04, 1.0, zc - 0.05, 0.02, 0.12, 0.03);
    K.box(MT.trim, x0 - 0.02, 1.2, zc - 0.75, 0.02, 0.62, 0.62); K.plane(MT.blackG, x0 - 0.035, 1.51, zc - 0.75, 0.5, 0.5, { ry: -Math.PI / 2 });
    K.build(0, 0, 0, 0, { shadow: true, deco: false }); }
  // posts and a capping rail along the garden fences
  { const K = new Kit(); for (let x = -19.95; x <= 19.96; x += 2.4) K.box(MT.dark, x, 0, -16 + 0.08, 0.1, 1.8, 0.1);
    for (const sx of [-1, 1]) for (let z = -16 + 2.4; z <= 2.01; z += 2.4) K.box(MT.dark, sx * 20 - sx * 0.08, 0, z, 0.1, 1.5, 0.1);
    K.box(MT.dark, 0, 1.8, -16 + 0.06, 40.1, 0.05, 0.2); for (const sx of [-1, 1]) K.box(MT.dark, sx * 20 - sx * 0.06, 1.5, -6.9, 0.2, 0.05, 17.9);
    K.build(0, 0, 0, 0, { shadow: true, deco: false }); }
  // the hedges round the edge: leafy tops and bulges instead of flat boxes
  { const K = new Kit(), E2 = 46; for (const s of [-1, 1]) for (let u = -E2; u <= E2; u += 1.7) { const r = 0.85 + Math.sin(u * 1.7) * 0.15;
      K.add(Math.sin(u) > 0 ? MT.leafD : MT.leaf, new THREE.IcosahedronGeometry(r, 1), u, 3.15, s * E2, { sy: 0.7 }); K.add(MT.leafD, new THREE.IcosahedronGeometry(r, 1), s * E2, 3.15, u, { sy: 0.7 }); }
    K.build(0, 0, 0, 0, { shadow: false, deco: false }); }
}
// the street: kerbs, road markings, lamps, telegraph poles, a hydrant, a sign; the van and barriers where the attackers start;
// the houses across the road past the hedge
function tdCar(x, z, along, color) {
  const X = along === 'x', K = new Kit(), BM = tdMat('car' + color, { color, metalness: 0.55, roughness: 0.28 }), L = 4.3, W = 1.8;
  // hidden boxes as before (what bodies and rounds meet)
  const [w, d] = X ? [L, W] : [W, L], [cw, cd] = X ? [2.3, 1.6] : [1.6, 2.3];
  addBox(x, 0, z, w * 0.94, 0.2, d * 0.9, 'metal', 0x161616); addBox(x, 0.2, z, w, 0.7, d, 'metal', color); addBox(x, 0.9, z, cw, 0.62, cd, 'metal', color);
  for (let i = 0; i < 3; i++) { const m = worldMeshes[worldMeshes.length - 1 - i]; m.material.visible = false; m.castShadow = false; m.userData.furn = true; }
  tdCarBody(K, BM);
  K.build(x, 0, z, X ? 0 : Math.PI / 2, { shadow: true, deco: false });
}
// the car itself, built along +x into a kit. Nothing in it shares a face or cuts through another part: the wheels sit in
// dark arches on the body sides (the tyre stands just proud of the panel, the hub cap proud of the tyre), the glass is
// thin panes on the faces of the cabin, the lamps are lenses on the front and back faces, the bumpers stand off the ends
function tdCarBody(K, BM) {
  const L = 4.3, W = 1.8, hw = W / 2, tail = tdMat('tail', { color: 0x8a1010, emissive: 0x500000, roughness: 0.4 }), arch = tdMat('carArch', { color: 0x0a0a0b, roughness: 0.9 }), tyre = MT.black;
  K.rbox(BM, 0, 0.28, 0, L, 0.56, W, 0.12);                                   // the lower body: 0.28 to 0.84
  K.rbox(BM, -0.15, 0.84, 0, 2.3, 0.56, W - 0.16, 0.16);                    // the cabin: 0.84 to 1.40
  const cw = (W - 0.16) / 2;
  for (const b of [-1, 1]) {
    K.box(MT.blackG, -0.15, 0.94, b * (cw + 0.004), 1.95, 0.38, 0.006);       // side windows
    K.box(BM, -0.05, 0.94, b * (cw + 0.009), 0.07, 0.38, 0.004);                 // the pillar between the doors
  }
  K.box(MT.blackG, -0.15 + 1.15 + 0.004, 0.92, 0, 0.006, 0.42, W - 0.36);    // windscreen
  K.box(MT.blackG, -0.15 - 1.15 - 0.004, 0.94, 0, 0.006, 0.36, W - 0.4);     // rear window
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    K.add(arch, new THREE.CircleGeometry(0.39, 20, 0, Math.PI), a * 1.35, 0.3, b * (hw + 0.004), { ry: b > 0 ? 0 : Math.PI });
    K.cyl(tyre, a * 1.35, 0.33, b * (hw - 0.1), 0.33, 0.33, 0.22, 18, { rx: Math.PI / 2 });     // tyre: outer face at hw + 0.01
    K.cyl(MT.steel, a * 1.35, 0.33, b * (hw + 0.02), 0.2, 0.2, 0.02, 14, { rx: Math.PI / 2 }); // hub cap: hw + 0.01 to + 0.03
  }
  for (const b of [-1, 1]) {
    K.box(MT.glow, L / 2 + 0.004, 0.55, b * 0.58, 0.012, 0.12, 0.3);
    K.box(tail, -L / 2 - 0.004, 0.58, b * 0.6, 0.012, 0.12, 0.3);
    K.box(BM, 0.88, 0.95, b * (hw + 0.06), 0.12, 0.08, 0.1);                 // mirrors, clear of the cabin side
  }
  K.box(MT.chrome, L / 2 + 0.03, 0.34, 0, 0.06, 0.12, W - 0.24); K.box(MT.chrome, -L / 2 - 0.03, 0.34, 0, 0.06, 0.12, W - 0.24);
  K.box(MT.paper, -L / 2 - 0.007, 0.43, 0, 0.008, 0.1, 0.48);                // the plate, above the bumper
}
function tdStreet(H, E) {
  // kerbs along the pavements, centre lines
  const kerb = (x0, x1, z0, z2) => E.box(MT.conc, (x0 + x1) / 2, 0, (z0 + z2) / 2, x1 - x0, 0.13, z2 - z0);
  kerb(-46, -30, 17.94, 18.1); kerb(-22, 46, 17.94, 18.1); kerb(-22.1, -21.94, -42, 18); kerb(-30.1, -29.94, -42, 18);
  const lineM = tdMat('roadline', { color: 0xe8e4d8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 });
  for (let x = -46; x < 46; x += 6) if (x + 3 < -30 || x > -22) E.box(lineM, x + 1.5, 0.004, 22, 3, 0.002, 0.14);
  for (let z = -42; z < 16; z += 6) E.box(lineM, -26, 0.004, z + 1.5, 0.14, 0.002, 3);
  for (let i = 0; i < 7; i++) E.box(lineM, -12 + i * 0.9 - 2.7, 0.004, 22, 0.45, 0.002, 7.2);
  for (const [mx, mz] of [[-6, 21], [14, 23.5], [-26, 0]]) E.cyl(MT.black, mx, 0, mz, 0.35, 0.35, 0.008, 18);
  // street lamps
  for (const [lx, lz, ry] of [[-38, 17.55, 0], [-14, 17.55, 0], [5.2, 17.55, 0], [22, 17.55, 0], [40, 17.55, 0], [-20.4, -6, -Math.PI / 2], [-20.4, -30, -Math.PI / 2]]) {
    const P = tdPiece(lx, 0, lz, ry); E.cyl(MT.black, lx, 0, lz, 0.09, 0.12, 0.4, 10); E.cyl(MT.steel, lx, 0.4, lz, 0.06, 0.08, 4.6, 10);
    const [ax, az] = tdWorld(P, 0, 1.1); E.rod(MT.steel, new V3(lx, 4.9, lz), new V3(ax, 5.05, az), 0.04); E.box(MT.black, ax, 4.95, az, 0.36, 0.14, 0.36); E.box(MT.glow, ax, 4.93, az, 0.3, 0.02, 0.3);
    tdCol(P, 0, 0, 0.24, 0.24, 5.0, 0, 'metal', 'metal');
  }
  // telegraph poles across the road, with the wires
  const poles = [[-36, 26.9], [-9, 26.9], [16.5, 26.9], [40, 26.9]];
  for (const [px, pz] of poles) { const P = tdPiece(px, 0, pz, 0); E.cyl(MT.bark, px, 0, pz, 0.13, 0.17, 8.5, 10); E.box(MT.dark, px, 7.9, pz, 1.8, 0.12, 0.12); for (const dx of [-0.75, 0, 0.75]) E.cyl(MT.ceramic, px + dx, 8.02, pz, 0.04, 0.05, 0.14, 8); tdCol(P, 0, 0, 0.34, 0.34, 8.5, 0, 'crate', 'wood'); }
  for (let i = 0; i < poles.length - 1; i++) for (const dx of [-0.75, 0, 0.75]) { const a = poles[i], b = poles[i + 1]; E.rod(MT.black, new V3(a[0] + dx, 8.12, a[1]), new V3((a[0] + b[0]) / 2 + dx, 7.7, a[1]), 0.012, 4); E.rod(MT.black, new V3((a[0] + b[0]) / 2 + dx, 7.7, a[1]), new V3(b[0] + dx, 8.12, b[1]), 0.012, 4); }
  // a hydrant, a stop sign at the side road
  { const P = tdPiece(3.4, 0, 17.3, 0), hm = tdMat('hydrant', { color: 0xb82a22, roughness: 0.5 }); E.cyl(hm, 3.4, 0, 17.3, 0.13, 0.15, 0.6, 12); E.sph(hm, 3.4, 0.62, 17.3, 0.13); E.cyl(hm, 3.4, 0.38, 17.3, 0.05, 0.05, 0.4, 8, { rz: Math.PI / 2 }); tdCol(P, 0, 0, 0.32, 0.32, 0.75, 0, 'metal', 'metal'); }
  { const P = tdPiece(-21.1, 0, 17.1, 0); E.cyl(MT.steel, -21.1, 0, 17.1, 0.03, 0.03, 2.3, 8); E.cyl(tdMat('stop', { color: 0xc0201a, roughness: 0.5 }), -21.1, 2.3, 17.13, 0.32, 0.32, 0.02, 8, { rx: Math.PI / 2, ry: Math.PI / 8 }); tdCol(P, 0, 0, 0.12, 0.12, 2.3, 0, 'metal', 'metal'); }
  // the van
  { tdHideAt(-3.5, 31, 0); const K = new Kit(), M = tdMat('van', { color: 0xe8e8e0, metalness: 0.4, roughness: 0.35 });
    K.rbox(M, 0, 0.35, 0, 5.2, 1.9, 2.1, 0.15); K.box(MT.blackG, 2.604, 1.3, 0, 0.008, 0.6, 1.8); for (const b of [-1, 1]) K.box(MT.blackG, 1.6, 1.38, b * 1.054, 1.4, 0.5, 0.006);
    for (const a of [-1, 1]) for (const b of [-1, 1]) { K.add(tdMat('carArch', { color: 0x0a0a0b, roughness: 0.9 }), new THREE.CircleGeometry(0.43, 20, 0, Math.PI), a * 1.8, 0.34, b * 1.054, { ry: b > 0 ? 0 : Math.PI }); K.cyl(MT.black, a * 1.8, 0.36, b * 0.95, 0.36, 0.36, 0.22, 18, { rx: Math.PI / 2 }); K.cyl(MT.steel, a * 1.8, 0.36, b * 1.075, 0.2, 0.2, 0.02, 14, { rx: Math.PI / 2 }); }
    K.box(tdMat('vanstripe', { color: 0x2a5a9a, roughness: 0.4 }), -0.4, 0.9, 1.051, 3.6, 0.18, 0.006); K.box(tdMat('vanstripe', { color: 0x2a5a9a, roughness: 0.4 }), -0.4, 0.9, -1.051, 3.6, 0.18, 0.006);
    for (const b of [-1, 1]) K.box(MT.glow, 2.606, 0.75, b * 0.7, 0.012, 0.14, 0.3); K.build(-3.5, 0, 31, 0, { shadow: true, deco: false }); }
  // concrete barriers (jersey profile) where the attackers take cover
  for (const [bx, bz] of [[-17, 30], [12, 32], [-30, 26], [30, 30]]) { tdHideAt(bx, bz, 0); const K = new Kit(), sh = new THREE.Shape([[-0.6, 0], [0.6, 0], [0.6, 0.08], [0.22, 0.35], [0.12, 1.2], [-0.12, 1.2], [-0.22, 0.35], [-0.6, 0.08]].map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false }); g.translate(0, 0, -1.3); K.add(MT.conc, g, 0, 0, 0, { uv: [0.6, 0.6] }); K.build(bx, 0, bz, Math.PI / 2, { shadow: true, deco: false }); }
  // (the neighbourhood past the hedge: 01d-town-surround)
}
function tdFan(x, yCeil, z, ry, M) {
  const K = new Kit(); M = M || MT.walnut;
  K.cyl(MT.brass, 0, -0.06, 0, 0.07, 0.05, 0.06, 16); K.cyl(MT.brass, 0, -0.32, 0, 0.012, 0.012, 0.27, 6);
  K.cyl(MT.brass, 0, -0.42, 0, 0.11, 0.13, 0.1, 18); K.cyl(MT.brass, 0, -0.45, 0, 0.13, 0.13, 0.03, 18);
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, c = Math.cos(a), sn = Math.sin(a);
    K.box(MT.brass, c * 0.2, -0.43, sn * 0.2, 0.16, 0.012, 0.03, { ry: -a }); K.rbox(M, c * 0.5, -0.43, sn * 0.5, 0.5, 0.012, 0.13, 0.03, { ry: -a, rx: 0.08 }); }
  K.lathe(MT.shadeT, [[0, -0.02], [0.09, -0.02], [0.11, -0.08], [0.08, -0.13], [0, -0.135]], 0, -0.46, 0);
  K.build(x, yCeil, z, ry, { deco: false });
}
// ---- drawing it cheaply: every piece's meshes are merged, per material, into one big mesh for the whole lot, and the
// pieces themselves are put aside. When the thing a piece sits on or hangs from breaks or falls (boxBreak, structFall),
// tdRelease takes that piece's triangles out of the big mesh and puts the piece back on its parent, so it goes with it.
// (a few dozen draws for all the furniture and finish instead of well over a thousand)
const TDB = { meshes: [] };
// the shared stand-in for a plain (or plainly textured) material: everything but the colour, which the vertices carry
const TDC = new Map();
function tdCanon(M) {
  if (!M.isMeshStandardMaterial || M.transparent || M.emissiveMap || (M.emissive && M.emissive.getHex() && M.emissiveIntensity > 0) || M.alphaTest || M.envMap) return M;
  const k = [M.map && M.map.uuid, M.normalMap && M.normalMap.uuid, M.roughnessMap && M.roughnessMap.uuid, M.roughness.toFixed(2), M.metalness.toFixed(2), M.side, M.flatShading ? 1 : 0, M.polygonOffset ? M.polygonOffsetFactor + ',' + M.polygonOffsetUnits : '', M.depthWrite ? 1 : 0].join('|');
  let C = TDC.get(k); if (!C) { C = new THREE.MeshStandardMaterial({ map: M.map, normalMap: M.normalMap, roughnessMap: M.roughnessMap, roughness: M.roughness, metalness: M.metalness, side: M.side, flatShading: M.flatShading, vertexColors: true }); if (M.normalScale) C.normalScale.copy(M.normalScale); C.polygonOffset = M.polygonOffset; C.polygonOffsetFactor = M.polygonOffsetFactor; C.polygonOffsetUnits = M.polygonOffsetUnits; C.depthWrite = M.depthWrite; C.userData.shared = true; TDC.set(k, C); }
  return C;
}
function tdBatch() {
  worldGroup.updateMatrixWorld(true); TDB.meshes = [];
  const groups = []; worldGroup.traverse(o => { if (o.isGroup && o.userData.td && o.parent) groups.push(o); });
  const buckets = new Map(), _m = new THREE.Matrix4();
  // what could hold a piece up, on a 1 m grid: everything solid round the house but the doors and the ground
  const OG = new Map(), og = (i, j) => i * 4096 + j, WMS = new Set(worldMeshes);
  for (const w of worldMeshes) { const u = w.userData, b = u.box; if (!b || u.door || u.doorFrame || u.doorPart || u.falling || u.board !== undefined || u.lamp !== undefined || u.bomb || u.reinf) continue;
    const v = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z); if (v > 40 || b.max.x < HOUSE.x0 - 6 || b.min.x > HOUSE.x1 + 6 || b.max.z < HOUSE.z0 - 6 || b.min.z > HOUSE.z1 + 8) continue;
    for (let i = Math.floor(b.min.x - 0.2); i <= Math.floor(b.max.x + 0.2); i++) for (let j = Math.floor(b.min.z - 0.2); j <= Math.floor(b.max.z + 0.2); j++) { const k = og(i, j); let L = OG.get(k); if (!L) OG.set(k, L = []); L.push([w, b, v]); } }
  // (first choice: a piece the point is squarely in front of, off its face only; then anything it is near. So the casing up the
  // side of a window belongs to the wall beside the window, not to the strip under it, and goes when that wall is holed)
  const ownerAt = (x, y, z) => { const L = OG.get(og(Math.floor(x), Math.floor(z))); if (!L) return null; let best = null, bv = 1e9, best2 = null, bv2 = 1e9;
    for (const [w, b, v] of L) { if (!(x > b.min.x - 0.16 && x < b.max.x + 0.16 && z > b.min.z - 0.16 && z < b.max.z + 0.16 && y > b.min.y - 0.12 && y < b.max.y + 0.12)) continue;
      if (v < bv2) { bv2 = v; best2 = w; }
      const thinX = b.max.x - b.min.x < b.max.z - b.min.z, e = 0.004;
      if (y > b.min.y - e && y < b.max.y + e && (thinX ? z > b.min.z - e && z < b.max.z + e : x > b.min.x - e && x < b.max.x + e) && v < bv) { bv = v; best = w; } }
    return best || best2; };
  const add = (m, q, rec) => { const cm = tdCanon(m.material), key = cm.uuid + (m.castShadow ? 's' : ''); let B = buckets.get(key); if (!B) buckets.set(key, B = { mat: cm, shadow: m.castShadow, list: [], recs: [] });
    // (a material that differs from others only by its colour: the colour goes into the vertices, and they share one)
    if (cm !== m.material && !q.userData.baked) { const n = q.attributes.position.count, c = m.material.color, old = q.attributes.color, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r * (old ? old.getX(i) : 1); a[i * 3 + 1] = c.g * (old ? old.getY(i) : 1); a[i * 3 + 2] = c.b * (old ? old.getZ(i) : 1); }
      q.setAttribute('color', new THREE.BufferAttribute(a, 3)); q.userData.baked = true; }
    B.list.push(q); B.recs.push(rec); B.last = B.list.length - 1; return B; };
  for (const g of groups) {
    const ms = g.children.filter(m => m.isMesh && m.visible); if (!ms.length) continue;
    if (g.parent !== worldGroup) {
      // a piece on something: it goes with it whole
      const rec = { g, parent: g.parent, ranges: [], at: new THREE.Box3().setFromObject(g).getCenter(new V3()) };
      for (const m of ms) add(m, m.geometry.clone().applyMatrix4(_m.copy(m.matrixWorld)), rec);
      (rec.parent.userData.tdRecs = rec.parent.userData.tdRecs || []).push(rec); g.removeFromParent(); continue;
    }
    // the outside finish (siding, trim, shutters, the porch, the roof edges...), built in one piece: each triangle goes with the
    // wall, post or tile it is fixed to, so it comes down with that and nothing is left hanging when the house does
    const recs = new Map(), rest = { g: null, parent: null, ranges: [] };
    // (the downstairs floors are solids of their own: they stay put)
    if (ms.some(m => WMS.has(m))) { for (const m of ms) add(m, m.geometry.clone().applyMatrix4(_m.copy(m.matrixWorld)), rest); g.removeFromParent(); continue; }
    for (const m of ms) {
      const q = m.geometry.clone().applyMatrix4(_m.copy(m.matrixWorld)), P = q.attributes.position, n = P.count / 3, own = new Array(n), by = new Map();
      for (let t = 0; t < n; t++) { const x = (P.getX(t * 3) + P.getX(t * 3 + 1) + P.getX(t * 3 + 2)) / 3, y = (P.getY(t * 3) + P.getY(t * 3 + 1) + P.getY(t * 3 + 2)) / 3, z = (P.getZ(t * 3) + P.getZ(t * 3 + 1) + P.getZ(t * 3 + 2)) / 3;
        const w = ownerAt(x, y, z); let L = by.get(w); if (!L) by.set(w, L = []); L.push(t); }
      if (by.size === 1 && by.has(null)) { add(m, q, rest); continue; }
      for (const [w, T] of by) {
        const sub = new THREE.BufferGeometry();
        for (const nm in q.attributes) { const A = q.attributes[nm], k = A.itemSize, src = A.array, out = new Float32Array(T.length * 3 * k); let o = 0;
          for (const t of T) for (let v = 0; v < 3; v++) for (let c = 0; c < k; c++) out[o++] = src[(t * 3 + v) * k + c];
          sub.setAttribute(nm, new THREE.BufferAttribute(out, k)); }
        if (q.userData.baked) sub.userData.baked = true;
        if (!w) { add(m, sub, rest); continue; }
        let rec = recs.get(w); if (!rec) { recs.set(w, rec = { g: null, parent: w, ranges: [], parts: [] }); (w.userData.tdRecs = w.userData.tdRecs || []).push(rec); }
        const fine = w.userData.box && (w.userData.grid !== undefined ? w.userData.grid : wallShape(w)) ? tdSplit(sub, 0.16) : sub;
        const B = add(m, fine, rec); rec.parts.push({ B, i: B.last, geo: fine });
      }
      q.dispose();
    }
    g.removeFromParent();
  }
  for (const B of buckets.values()) {
    const geo = mergeGeometries(B.list, false); if (!geo) continue; const M = new THREE.Mesh(geo, B.mat);
    M.castShadow = B.shadow; M.receiveShadow = !B.mat.transparent; M.userData.tdBatch = true; M.matrixAutoUpdate = false; worldGroup.add(M); TDB.meshes.push(M);
    let at = 0; B.M = M; B.off = []; B.list.forEach((q, i) => { const n = q.attributes.position.count, r = B.recs[i]; r.ranges.push([M, at, n]); B.off[i] = at; at += n; if (!r.parts) q.dispose(); });
  }
}
// a broken or falling piece of the house: what was merged from on and in it comes back as itself
function tdRelease(m) {
  if (!m) return;
  m.traverse(o => { const R = o.userData.tdRecs; if (!R) return; o.userData.tdRecs = null;
    for (const rec of R) { for (const [M, a, n] of rec.ranges) { const pa = M.geometry.attributes.position; pa.array.fill(0, a * 3, (a + n) * 3); pa.addUpdateRange(a * 3, n * 3); pa.needsUpdate = true; }
      if (rec.dead) continue;
      if (rec.g) { rec.parent.add(rec.g); tdRelease(rec.g); continue; }
      // (a piece of the outside finish: its triangles become a mesh of their own on what held them)
      if (!rec.parts) continue; o.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      for (const p of rec.parts) { const g = p.geo.clone().applyMatrix4(inv), mm = new THREE.Mesh(g, p.B.mat); mm.castShadow = p.B.shadow; mm.userData.deco = true; o.add(mm); }
      rec.parts = null; } });
}
// (long triangles cut down by halving their longest side until none is longer than L, every attribute carried along)
function tdSplit(geo, L) {
  const P = geo.attributes.position, n = P.count / 3, names = Object.keys(geo.attributes), L2 = L * L, out = names.map(() => []), v = [[], [], []];
  const len2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const emit = T => { for (let k = 0; k < names.length; k++) for (let c = 0; c < 3; c++) for (const x of T[c][k]) out[k].push(x); };
  const mid = (a, b) => a.map((A, k) => A.map((x, j) => (x + b[k][j]) / 2));
  const rec = (T, d) => { const p = T.map(t => t[0]), e = [len2(p[0], p[1]), len2(p[1], p[2]), len2(p[2], p[0])], m = Math.max(...e);
    if (m <= L2 || d > 9) { emit(T); return; } const i = e.indexOf(m), a = T[i], b = T[(i + 1) % 3], c = T[(i + 2) % 3], ab = mid(a, b); rec([a, ab, c], d + 1); rec([ab, b, c], d + 1); };
  let big = false; for (let t = 0; t < n && !big; t++) for (let c = 0; c < 3; c++) { const a = t * 3 + c, b = t * 3 + (c + 1) % 3; if ((P.getX(a) - P.getX(b)) ** 2 + (P.getY(a) - P.getY(b)) ** 2 + (P.getZ(a) - P.getZ(b)) ** 2 > L2) { big = true; break; } }
  if (!big) return geo;
  for (let t = 0; t < n; t++) { const T = [0, 1, 2].map(c => names.map(nm => { const A = geo.attributes[nm], k = A.itemSize, o = (t * 3 + c) * k; return Array.from(A.array.slice(o, o + k)); })); rec(T, 0); }
  const g = new THREE.BufferGeometry(); names.forEach((nm, k) => g.setAttribute(nm, new THREE.BufferAttribute(new Float32Array(out[k]), geo.attributes[nm].itemSize)));
  if (geo.userData.baked) g.userData.baked = true; geo.dispose(); return g;
}
// Something changed in a wall (a hole opened in it, or it came down): every piece of finish anywhere near it (trim, casings,
// window frames and sills, jamb linings, siding, skirting, pictures) is checked again, and whatever no longer has solid wall
// within a hand's breadth of it goes, in splinters. It does not matter which wall a piece was counted as belonging to, or
// whether it sat over the wall or out in the window opening beside it: what counts is whether any wall, frame or skin still
// stands close enough to hold it. The finish was cut into short lengths when it was built, so a casing across a hole loses
// just the stretch over the hole, and the stubs left are the ones still nailed to wall.
const _thc = new V3(), TD_HOLD = 0.1;
// is there solid wall within R of this point (any wall-like piece: a wall, its brick skin, a door frame)?
function tdSolidNear(c, x, y, z, R) {
  const u = c.userData, b = u.box; if (!b || u.falling || u.door) return false;
  const G = u.grid, ax = G ? G.ax : (b.max.x - b.min.x < b.max.z - b.min.z ? 0 : 2), a1 = ax === 0 ? 2 : 0;
  const pd = ax === 0 ? x : z, p1 = a1 === 0 ? x : z;
  if (Math.max(b.min.getComponent(ax) - pd, pd - b.max.getComponent(ax), 0) > 0.06) return false;   // (on its face, not a layer away)
  if (Math.max(b.min.getComponent(a1) - p1, p1 - b.max.getComponent(a1), 0) > R || Math.max(b.min.y - y, y - b.max.y, 0) > R) return false;
  if (!G || !G.any) return true;
  const l1 = p1 - c.position.getComponent(a1), l2 = y - c.position.y;
  let n = 0; const ic = Math.floor((clamp(l1, G.min1, -G.min1 - 1e-6) - G.min1) / G.cs1), jc = Math.floor((clamp(l2, G.min2, -G.min2 - 1e-6) - G.min2) / G.cs2), r1 = Math.ceil(R / G.cs1) + 1, r2 = Math.ceil(R / G.cs2) + 1, R2 = (R + 0.5 * Math.max(G.cs1, G.cs2)) ** 2;
  for (let j = Math.max(0, jc - r2); j <= Math.min(G.n2 - 1, jc + r2); j++) for (let i = Math.max(0, ic - r1); i <= Math.min(G.n1 - 1, ic + r1); i++) {
    if (G.cell[j * G.n1 + i]) continue; const d1 = G.min1 + (i + 0.5) * G.cs1 - l1, d2 = G.min2 + (j + 0.5) * G.cs2 - l2; if (d1 * d1 + d2 * d2 <= R2 && ++n >= 3) return true; }
  return false;   // (a crumb or two of wall is not enough to hang anything on)
}
function tdHoleCut(w) {
  const wb = w.userData.box; if (!wb) return; const e = 0.45;
  const inR = (b, m) => b.max.x > wb.min.x - m && b.min.x < wb.max.x + m && b.max.y > wb.min.y - m && b.min.y < wb.max.y + m && b.max.z > wb.min.z - m && b.min.z < wb.max.z + m;
  // what could hold finish round here, and whose finish is round here
  const cands = [], owners = [];
  for (const c of worldMeshes) { const u = c.userData; if (!u.box || u.falling || u.door || !inR(u.box, e + 1.5)) continue; if (u.doorFrame || wallShape(c)) cands.push(c); if (u.tdRecs && inR(u.box, e + 1.1)) owners.push(c); }
  if (tdHasRecs(w) && owners.indexOf(w) < 0 && !w.userData.falling) owners.push(w);
  const held = (x, y, z, R) => { for (const c of cands) if (tdSolidNear(c, x, y, z, R)) return true; return false; };
  const nearM = (x, y, z, m) => x > wb.min.x - m && x < wb.max.x + m && y > wb.min.y - m && y < wb.max.y + m && z > wb.min.z - m && z < wb.max.z + m, near = (x, y, z) => nearM(x, y, z, e);
  // (finish that hangs out in an opening by design, the middle of a window frame, its glazing bars, has no wall right behind
  // it even in a sound house: that is held by the rest of its frame, so it stays as long as some piece of finish within an
  // arm's length of it is still held by wall, and goes when everything round it has)
  const intact = (x, y, z) => { for (const c of cands) { const u = c.userData, G = u.grid; u.grid = null; const r = tdSolidNear(c, x, y, z, TD_HOLD); u.grid = G; if (r) return true; } return false; };
  let deb = 0; const work = [], anch = new Map(), anchI = new Map(), H = 0.35, key = (x, y, z) => Math.floor(x / H) + ',' + Math.floor(y / H) + ',' + Math.floor(z / H);
  for (const o of owners) for (const rec of o.userData.tdRecs || []) {
    if (rec.dead) continue;
    if (rec.g) { if (!rec.at || !near(rec.at.x, rec.at.y, rec.at.z) || held(rec.at.x, rec.at.y, rec.at.z, 0.25)) continue;
      rec.dead = true; for (const [M, a, n] of rec.ranges) { const pa = M.geometry.attributes.position; pa.array.fill(0, a * 3, (a + n) * 3); pa.addUpdateRange(a * 3, n * 3); pa.needsUpdate = true; }
      spawnDebris(rec.at, 5, _thc.set(rnd(-0.3, 0.3), 0.2, rnd(-0.3, 0.3)), 0.8, 1.2, DESTR.wood, 0.03); continue; }
    if (!rec.parts) continue;
    for (const p of rec.parts) {
      if (!p.B.M) continue; const src = p.geo.attributes.position, n = src.count / 3, S = src.array;
      if (!p.gone) p.gone = new Uint8Array(n);
      if (!p.cen) { p.cen = new Float32Array(n * 3); for (let t = 0; t < n; t++) { const q = t * 9; p.cen[t * 3] = (S[q] + S[q + 3] + S[q + 6]) / 3; p.cen[t * 3 + 1] = (S[q + 1] + S[q + 4] + S[q + 7]) / 3; p.cen[t * 3 + 2] = (S[q + 2] + S[q + 5] + S[q + 8]) / 3; } }
      if (!p.anc) p.anc = new Int8Array(n).fill(-1);
      for (let t = 0; t < n; t++) { if (p.gone[t]) continue; const x = p.cen[t * 3], y = p.cen[t * 3 + 1], z = p.cen[t * 3 + 2]; if (!nearM(x, y, z, e + 1.1)) continue;
        if (p.anc[t] < 0) p.anc[t] = intact(x, y, z) ? 1 : 0; const inside = near(x, y, z);
        if (p.anc[t]) { const k = key(x, y, z); anchI.set(k, (anchI.get(k) || 0) + 1); if (held(x, y, z, TD_HOLD)) anch.set(k, (anch.get(k) || 0) + 1); else if (inside) work.push(p, t); }
        else if (inside) work.push(p, t, 1); }
    }
  }
  // (the spanning pieces: any held finish in the neighbouring cells of a coarse grid round it)
  // (it stays only while most of what held it round about is still held: a frame with a stub of casing left on one corner
  // of a blown-out window comes down with the rest)
  const kept = (x, y, z) => { const i = Math.floor(x / H), j = Math.floor(y / H), k = Math.floor(z / H); let h = 0, n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const q = (i + a) + ',' + (j + b) + ',' + (k + c); h += anch.get(q) || 0; n += anchI.get(q) || 0; } return h >= 8 && h >= n * 0.6; };
  const cut = new Map();
  for (let w2 = 0; w2 < work.length;) { const p = work[w2], t = work[w2 + 1], span = work[w2 + 2] === 1; w2 += span ? 3 : 2;
    if (span) { if (kept(p.cen[t * 3], p.cen[t * 3 + 1], p.cen[t * 3 + 2])) continue; }
    let L = cut.get(p); if (!L) cut.set(p, L = []); L.push(t); }
  for (const [p, L] of cut) {
    const M = p.B.M, base = p.B.off[p.i], S = p.geo.attributes.position.array, pa = M.geometry.attributes.position, A = pa.array; let lo = 1e9, hi = -1;
    for (const t of L) { p.gone[t] = 1; const q = t * 9; S.fill(0, q, q + 9); const ao = (base + t * 3) * 3; A.fill(0, ao, ao + 9); lo = Math.min(lo, ao); hi = Math.max(hi, ao + 9);
      if (deb < 10 && (t & 7) === 0) { deb++; spawnDebris(_thc.set(p.cen[t * 3], p.cen[t * 3 + 1], p.cen[t * 3 + 2]), 1, new V3(rnd(-0.4, 0.4), 0.1, rnd(-0.4, 0.4)), 0.7, rnd(0.4, 1.4), DESTR.wood, 0.02); } }
    p.geo.attributes.position.needsUpdate = true; pa.addUpdateRange(lo, hi - lo); pa.needsUpdate = true;
  }
}
const tdHasRecs = w => !!w.userData.tdRecs;
// ---- everything
function townDetail(H) {
  TD.furn = []; TD.wall = [];
  tdRoomsFurnish(H); tdFloors(H);
  tdFan(-9.0, H.f1, 6.9, 0.2); tdFan(9.0, H.f1 + H.H, -7.4, 0.5); tdFan(-10.5, H.f1 + H.H, 6.8, 0.1, MT.oak); tdFan(-1.0, H.f1 + H.H, 7.4, 0.7, MT.painted); tdTrims(H); tdDoorCasings(H); tdRails(H);
  const E = new Kit();
  tdWindows(H, E, ['Kitchen', 'Laundry', 'Bathroom', 'Bathroom 2', 'Hall', 'Front hall']);
  tdFacade(H, E); tdPorch(H, E); tdYard(H, E); tdStreet(H, E); tdSurround();
  E.build(0, 0, 0, 0, { shadow: true, deco: false });
  tdRoof(H);
}

// ---- module exports: build.mjs strips this block ----
export { Kit, MT, TDM, TEXD, tdBatch, tdBed, tdCar, tdCarBody, tdCoffeeTable, tdHoleCut, tdKitchenRun, tdMat, tdNightstand, tdPanel, tdRelease, tdRnd, tdRoundTable, tdRug, tdSofa, tdTex, tdToilet, tdTree, tdVanity, townDetail };
// ---- end module exports ----
