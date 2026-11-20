// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { GFX, V3, clamp, renderer, rnd, scene } from './00-setup.js';
import { canvasTex, colliders, mat } from './01-world.js';
import { _Y, _a } from './04-ragdoll.js';
import { isPistol, isShotgun } from './06-weapons.js';
import { noiseHit } from './10-audio.js';
import { PMAT, decalHelper, decals, fx, fxBox, irregular, particles, puff, puffTex, splatGeo } from './11-fx.js';
import { bmat } from './12-blood.js';
import { boneIn, goreDry, goreWet, nz } from './12b-gore.js';
import { CAL, FABRIC_IN, HOLE_JAG, _hm, _sUp, boxExit, cutHole, dropSplat, exitThrough, groundSplat, holeTube, holeify, trimDecals } from './14-wounds.js';
import { P } from './17-dummies.js';
import { pointBlocked } from './18-player.js';
import { frame } from './22-menu-loop.js';
// ---- end module links ----
// ---------------------------------------------------------------- backpack: rounds tear straight through the fabric and carry on
// a round stopped by the plate still tears the carrier: a ragged hole in the fabric with the plate showing through
function markPlate(hit, dir, w) {
  const mesh = hit.object; if (!mesh.isMesh) return;
  if (mesh.userData.holeN === undefined) mesh.userData.holeMax = 16;
  const inv = _hm.copy(mesh.matrixWorld).invert(), a = hit.point.clone().addScaledVector(dir, -0.01).applyMatrix4(inv), dd = dir.clone().transformDirection(inv);
  const r = (CAL[w] || CAL[0])[0] * 1.5; cutHole(mesh, a, dd, 0.022, r, r * 0.7, 0x26282a);
  particles(hit.point.clone().addScaledVector(dir, -0.02), 6, debMat(0x3c3f33), 1.5, 0.005, 0.8, 0.3, dir.clone().negate());
}
function packHit(hit, dir, v) {
  const mesh = hit.object, ex = exitThrough([mesh], hit.point, dir, 0.45);
  const L = ex ? ex.len : 0.12, inv = _hm.copy(mesh.matrixWorld).invert();
  const a = hit.point.clone().addScaledVector(dir, -0.02).applyMatrix4(inv), dd = dir.clone().transformDirection(inv);
  if (mesh.userData.holeN === undefined) mesh.userData.holeMax = 12; const r0 = rnd(0.011, 0.015), r1 = r0 * rnd(1.2, 1.6);
  cutHole(mesh, a, dd, L + 0.04, r0, r1, FABRIC_IN);
  const hum = mesh.userData.hum, g = mesh.parent;
  if (hum && g && mesh.userData.frame) { const ig = _hm.copy(g.matrixWorld).invert(); hum.holes = hum.holes || []; hum.holes.push({ frame: mesh.userData.frame, p: hit.point.clone().addScaledVector(dir, -0.02).applyMatrix4(ig), d: dir.clone().transformDirection(ig), len: L + 0.04, r0, r1, pack: true }); if (hum.holes.length > 14) hum.holes.shift(); }
  particles(hit.point.clone().addScaledVector(dir, -0.02), 5, debMat(0x4f5340), 1.2, 0.006, 0.8, 0.3, dir.clone().negate());
  puff(hit.point.clone().addScaledVector(dir, -0.03), 0x55534a, 0.18, 0.5, 0.05, 0.35);
  noiseHit(700, 0.05, 0.05);
  return { point: (ex ? ex.point : hit.point.clone().addScaledVector(dir, L)).addScaledVector(dir, 0.003), dir, v: v * 0.95 };
}

// ---------------------------------------------------------------- wall destruction
// Every round chips the face it hits: a crater, a shallow pit in thick walls, chunks and dust. Damage adds up in patches about
// 10 cm across. When a patch has taken enough it breaks open into a ragged hole, and every round landing around it after that
// tears the hole wider. Plaster and plywood give way after a few rounds; concrete takes rifle fire for a long time or a couple of .50s.
const DESTR = {
  plywood:  { hp: 600, grow: 0.09, rmax: 0.8, col: 0xc89c66, inner: 0x6a4a28, pit: 0x6a4a28, deb: 'wood', dust: 0xb48c5c, snd: [900, 0.07] },
  wood:     { hp: 2600, grow: 0.07, rmax: 0.5, col: 0xa0784a, inner: 0x3a2614, pit: 0x3a2614, deb: 'wood', dust: 0x8a6a45, snd: [800, 0.07] },
  drywall:  { hp: 800, grow: 0.11, rmax: 0.9, col: 0xe8e4dc, inner: 0x8f8a80, pit: 0xb9b3a8, deb: 'plaster', dust: 0xeeeae4, snd: [1100, 0.06] },
  concrete: { hp: 24000, grow: 0.09, rmax: 0.55, col: 0x9d988f, inner: 0x6e6a62, pit: 0x7c776e, deb: 'rock', dust: 0xb8b2a6, snd: [1400, 0.07] }
};
const DESTR_OF = { plywood: 'plywood', crate: 'wood', drywall: 'drywall', concrete: 'concrete' };
const BRK = 32, PIT0 = 32, SLOTS = 48;

// ---------------------------------------------------------------- what is left of a wall
// A grid of 5 cm cells over the wall face records what is open: inside a hole that goes all the way through, or broken away.
// After every break, any solid part no longer joined to something that holds it up (the floor, a wall or roof it touches)
// falls out as chunks, so nothing hangs in the air. The same grid lets players, bodies, blood and rounds through the openings.
// 1.2 cm cells (1.5 cm on concrete): fine enough that a single rifle round through plywood makes a hole its own size
const GRID_CS = 0.012;
function wallGrid(mesh) {
  const ud = mesh.userData; if (ud.grid !== undefined) return ud.grid;
  const gp = mesh.geometry.parameters; if (!gp || gp.width === undefined || !ud.box) return ud.grid = null;
  const dims = [gp.width, gp.height, gp.depth]; let ax = 0; for (let k = 1; k < 3; k++) if (dims[k] < dims[ax]) ax = k;
  if (ax === 1 || dims[ax] > 0.4) return ud.grid = null;
  const cs = GRID_CS * (DESTR_OF[ud.kind] === 'concrete' ? 1.25 : 1);
  const a1 = ax === 0 ? 2 : 0, a2 = 1, n1 = Math.max(2, Math.round(dims[a1] / cs)), n2 = Math.max(2, Math.round(dims[a2] / cs));
  const tex = new THREE.DataTexture(new Uint8Array(n1 * n2), n1, n2, THREE.RedFormat, THREE.UnsignedByteType); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const shr = new Uint8Array(n1 * n2 * 2).fill(128), stex = new THREE.DataTexture(shr, n1, n2, THREE.RGFormat, THREE.UnsignedByteType); stex.magFilter = THREE.NearestFilter; stex.minFilter = THREE.NearestFilter; stex.needsUpdate = true;
  const G = { shr, stex, ax, a1, a2, n1, n2, cs1: dims[a1] / n1, cs2: dims[a2] / n2, min1: -dims[a1] / 2, min2: -dims[a2] / 2, cell: new Uint8Array(n1 * n2), dmg: new Float32Array(n1 * n2), tex, any: false };
  // what holds it up: the floor under it, and any other solid it touches at the sides or on top
  const b = ud.box, touch = (x, y, z) => b.min.y <= 0.02 && y < 0.01 ? true : colliders.some(c => c !== b && x > c.min.x - 0.01 && x < c.max.x + 0.01 && y > c.min.y - 0.01 && y < c.max.y + 0.01 && z > c.min.z - 0.01 && z < c.max.z + 0.01);
  const ctr = mesh.position, hs = (k, s) => ctr.getComponent(k) + s * (dims[k] / 2 + 0.02), side = s => [0.2, 0.5, 0.8].some(f => { const p = ctr.clone(); p.setComponent(a1, hs(a1, s)); p.y = b.min.y + dims[1] * f; return touch(p.x, p.y, p.z); });
  G.hold = ud.door ? { bottom: false, top: false, s0: ud.door.hs < 0, s1: ud.door.hs > 0 }   // a door's leaf hangs on its hinge edge only
    : { bottom: b.min.y <= 0.02 || touch(ctr.x, b.min.y - 0.02, ctr.z), top: touch(ctr.x, b.max.y + 0.02, ctr.z), s0: side(-1), s1: side(1) };
  return ud.grid = G;
}
// local wall coordinates of a world point (walls are never rotated; a door's leaf is, so it goes through its own frame)
const _gil = new V3();
// (a hole can run through the wall at a slant, as the round went: the mask holds each opening where it crosses the middle of
// the wall, and a shear field says how far it moves across per metre of depth, so a point is looked up where its hole is)
const gridIdx = (G, mesh, x, y, z) => {
  let l1, l2, dep; if (mesh.userData.door) { mesh.worldToLocal(_gil.set(x, y, z)); l1 = _gil.getComponent(G.a1); l2 = _gil.y; dep = _gil.getComponent(G.ax); } else { l1 = (G.a1 === 0 ? x : z) - mesh.position.getComponent(G.a1); l2 = y - mesh.position.y; dep = (G.ax === 0 ? x : z) - mesh.position.getComponent(G.ax); }
  let i = Math.floor((l1 - G.min1) / G.cs1), j = Math.floor((l2 - G.min2) / G.cs2);
  if (G.shr && i >= 0 && j >= 0 && i < G.n1 && j < G.n2) { const k = (j * G.n1 + i) * 2, s1 = (G.shr[k] - 128) / 32, s2 = (G.shr[k + 1] - 128) / 32; if (s1 || s2) { i = Math.floor((l1 - s1 * dep - G.min1) / G.cs1); j = Math.floor((l2 - s2 * dep - G.min2) / G.cs2); } }
  return i < 0 || j < 0 || i >= G.n1 || j >= G.n2 ? -1 : j * G.n1 + i;
};
function gridOpenW(mesh, p) { const G = mesh.userData.grid; if (!G || !G.any) return false; const k = gridIdx(G, mesh, p.x, p.y, p.z); return k >= 0 && G.cell[k] > 0; }
// can something of this half-width and height stand where pos is and pass through the wall's openings
function gridPass(c, pos, h, r) {
  const mesh = c.mesh, G = mesh && mesh.userData.grid; if (!G || !G.any) return false;
  const along = G.a1 === 0 ? 'x' : 'z';
  // a low sill left at the bottom of an opening is stepped over
  for (let y = pos.y + 0.26; y <= pos.y + h - 0.02 + 1e-6; y += 0.1) for (const s of [-1, -0.5, 0, 0.5, 1]) {
    const q = { x: pos.x, y, z: pos.z }; q[along] += s * r * 0.8;
    const k = gridIdx(G, mesh, q.x, q.y, q.z); if (k >= 0 && !G.cell[k]) return false;
  }
  return true;
}
function updateWallGrid(mesh, D, dir) {
  const G = wallGrid(mesh); if (!G) return;
  const ud = mesh.userData, { n1, n2, cs1, cs2, min1, min2, cell } = G, q = new V3();
  // flood fill the solid part from whatever holds it up; the rest breaks away
  // only sound material carries load: a cell damaged past the point it shows as open does not hold anything up, so a piece
  // hanging on by cracked rubble alone comes away
  const WEAK = 0.42, dm = G.dmg;
  const seen = new Uint8Array(n1 * n2), st = [], push = k => { if (!cell[k] && !seen[k] && dm[k] < WEAK) { seen[k] = 1; st.push(k); } };
  if (G.hold.bottom) for (let i = 0; i < n1; i++) push(i);
  if (G.hold.top) for (let i = 0; i < n1; i++) push((n2 - 1) * n1 + i);
  if (G.hold.s0) for (let j = 0; j < n2; j++) push(j * n1);
  if (G.hold.s1) for (let j = 0; j < n2; j++) push(j * n1 + n1 - 1);
  while (st.length) { const k = st.pop(), i = k % n1, j = (k - i) / n1; if (i > 0) push(k - 1); if (i < n1 - 1) push(k + 1); if (j > 0) push(k - n1); if (j < n2 - 1) push(k + n1); }
  // cracked cells stay only where they cling to sound wall that is held up
  const held = k => { const i = k % n1; return (i > 0 && seen[k - 1]) || (i < n1 - 1 && seen[k + 1]) || (k >= n1 && seen[k - n1]) || (k + n1 < n1 * n2 && seen[k + n1]); };
  const fall = []; for (let k = 0; k < n1 * n2; k++) if (!cell[k] && !seen[k] && !(dm[k] >= WEAK && held(k))) { cell[k] = 2; fall.push(k); }
  if (G.dirty) { G.tex.needsUpdate = true; G.dirty = false; }
  if (!fall.length) return;
  for (const k of fall) G.tex.image.data[k] = 255; G.tex.needsUpdate = true;
  // the loose piece comes down as chunks, roughly one per 10 x 10 cm, capped so a big slab does not flood the scene
  const thick = [mesh.geometry.parameters.width, mesh.geometry.parameters.height, mesh.geometry.parameters.depth][G.ax], step = Math.max(1, Math.round(Math.sqrt(fall.length / 70)));
  // the loose part breaks up into slabs of the wall itself (bigger the more came loose, at most ~80 of them), each the
  // wall's full thickness, plus a scatter of rubble from the broken edges
  const fs = new Set(fall), bs = Math.max(Math.round(0.09 / G.cs1), Math.round(Math.sqrt(fall.length / 80)));
  const done = new Set();
  for (const k of fall) {
    const i0 = k % n1, j0 = (k - i0) / n1, bi = Math.floor(i0 / bs), bj = Math.floor(j0 / bs), key = bi + ',' + bj; if (done.has(key)) continue; done.add(key);
    let cnt = 0, su = 0, sv = 0; for (let dj = 0; dj < bs; dj++) for (let di = 0; di < bs; di++) { const kk = (bj * bs + dj) * n1 + bi * bs + di; if (bi * bs + di < n1 && fs.has(kk)) { cnt++; su += bi * bs + di; sv += bj * bs + dj; } }
    if (!cnt) continue; const fu = Math.sqrt(cnt / (bs * bs));
    q.set(0, 0, 0); q.setComponent(G.a1, min1 + (su / cnt + 0.5) * cs1); q.setComponent(G.a2, min2 + (sv / cnt + 0.5) * cs2);
    const wp = mesh.localToWorld(q.clone()), out = new V3().setComponent(G.ax, Math.random() < 0.5 ? 1 : -1).transformDirection(mesh.matrixWorld);
    const vd = (dir ? dir.clone().lerp(out, 0.4) : out).normalize();
    if (D.deb === 'wood' || thick < 0.03) spawnDebris(wp, 1, vd, 0.3, rnd(0.3, 1.4), D, 0, [cs1 * bs * fu * rnd(0.8, 1.05), cs2 * bs * fu * rnd(0.8, 1.05), thick]);
    else spawnDebris(wp, 1, vd, 0.3, rnd(0.3, 1.4), D, 0, [cs1 * bs * fu * rnd(0.75, 1.0), cs2 * bs * fu * rnd(0.75, 1.0), thick * rnd(0.7, 1)]);
    spawnDebris(wp, D.deb === 'wood' ? 1 : 3, vd, 0.6, rnd(0.6, 2), D, 0.012 + thick * 0.15);
  }
  const mid = fall[fall.length >> 1], mi = mid % n1, mj = (mid - mi) / n1; q.set(0, 0, 0); q.setComponent(G.a1, min1 + (mi + 0.5) * cs1); q.setComponent(G.a2, min2 + (mj + 0.5) * cs2);
  dust(mesh.localToWorld(q.clone()), new V3(0, -1, 0), D.dust, 1.2 + Math.sqrt(fall.length) * 0.08, 0.7, 4.5); noiseHit(D.deb === 'rock' ? 300 : 520, 0.3, 0.14);
  // craters that sat on the piece that fell go with it
  for (const c of ud.dmg) c.chips = c.chips.filter(ch => { q.set(0, 0, 0); q.setComponent((c.ax + 1) % 3, ch.u); q.setComponent((c.ax + 2) % 3, ch.v); const w = mesh.localToWorld(q.clone()); if (gridOpenW(mesh, w)) { dropDecal(ch.m); return false; } return true; });
}
// The wall shader reads the damage field (0 = sound, 1 = gone; filtered between cells): past a threshold broken by fine
// noise it is open, so every opening has a ragged, flawed edge; below it, the broken material shows (raw splintered wood
// fibres, crumbled gypsum, fresh concrete and aggregate) in a band that follows the opening's own outline.
const WALL_NOISE = 'float wh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\n' +
  'float wn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(wh(i), wh(i + vec3(1, 0, 0)), f.x), mix(wh(i + vec3(0, 1, 0)), wh(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(wh(i + vec3(0, 0, 1)), wh(i + vec3(1, 0, 1)), f.x), mix(wh(i + vec3(0, 1, 1)), wh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }\n' +
  'float wallV = 0.0; float wallIn = 0.0; vec3 wallP = vec3(0.0);\n';
// noise taken on the face plane, so an opening's outline is the same at every depth through the wall
// (the wall's own edges and ends sit exactly on the border of the mask: a hair of leeway lets them go with the cells
// they belong to; and past the wall's ends is air, so looking into an end that is gone finds nothing there: before, it
// was taken for solid wall and the ends and top stood on as a thin frame round a blown-out wall)
const MASK_FN = 'vec2 wUV0(vec3 q) { return vec2((dot(q, hS1) - hMP.x) / hMP.z, (dot(q, hS2) - hMP.y) / hMP.w); }\n' +
  'vec2 wUV(vec3 q) { vec2 m = wUV0(q); vec2 sh = (texture2D(hShr, clamp(m, 0.0, 1.0)).rg * 255.0 - 128.0) / 32.0; float d = dot(q, hTh.xyz); return m - vec2(sh.x * d / hMP.z, sh.y * d / hMP.w); }\n' +
  'float wThr(vec3 q) { vec3 f = q - hTh.xyz * dot(q, hTh.xyz); return 0.5 + (wn3(f * 95.0) * 0.55 + wn3(f * 30.0) * 0.45 - 0.5) * 0.55; }\n' +
  'bool wOpen(vec3 q) { vec2 m = wUV(q); if (m.x < -0.004 || m.x > 1.004 || m.y < -0.004 || m.y > 1.004) return true; return texture2D(hMask, clamp(m, 0.0, 1.0)).r > wThr(q); }\n';
const MASK_GLSL = p => '{ vec2 muv = wUV(' + p + '); if (muv.x >= -0.004 && muv.x <= 1.004 && muv.y >= -0.004 && muv.y <= 1.004) { wallV = texture2D(hMask, clamp(muv, 0.0, 1.0)).r; if (wallV > wThr(' + p + ')) discard; } }\n';
// the visible wall: where the face is open, follow the view ray into the wall; if it meets material on the way through,
// that is the side of the hole and gets drawn (raw material, darker the deeper), otherwise the ray comes out the far side
const MASK_GLSL_IN = p => '{ vec2 muv = wUV(' + p + '); wallP = ' + p + '; if (muv.x >= -0.004 && muv.x <= 1.004 && muv.y >= -0.004 && muv.y <= 1.004) { wallV = texture2D(hMask, clamp(muv, 0.0, 1.0)).r; if (wallV > wThr(' + p + ')) {\n' +
  '  vec3 rd = normalize(' + p + ' - vCamL); float dn = abs(dot(rd, hTh.xyz)), tM = 2.0 * hTh.w / max(dn, 0.08); bool hit = false;\n' +
  '  for (int i = 1; i <= 12; i++) { float t = tM * float(i) / 12.0; vec3 q = ' + p + ' + rd * t; if (!wOpen(q)) {\n' +
  '    float t0 = tM * float(i - 1) / 12.0; for (int k = 0; k < 4; k++) { float tm = 0.5 * (t0 + t); if (wOpen(' + p + ' + rd * tm)) t0 = tm; else t = tm; }\n' +
  '    wallP = ' + p + ' + rd * t; wallIn = clamp(t * dn / (2.0 * hTh.w), 0.0, 1.0); hit = true; break; } }\n' +
  '  if (!hit) discard; wallIn = max(wallIn, 0.001); wallV = 0.0; } } }\n';
const WALL_EDGE = p0 => { const p = 'wallP'; return '{\n' +
  '  vec3 bc; float bn = wn3(' + p + ' * 60.0);\n' +
  '  if (hKind < 0.5) { float fib = wn3(vec3(dot(' + p + ', hS1) * 14.0, dot(' + p + ', hS2) * 240.0, 0.0)); bc = mix(vec3(0.86, 0.69, 0.46), vec3(0.6, 0.43, 0.25), fib); }\n' +
  '  else if (hKind < 1.5) { float g = wn3(' + p + ' * 170.0); bc = mix(vec3(0.94, 0.93, 0.89), vec3(0.76, 0.74, 0.7), g); }\n' +
  '  else { float a = wn3(' + p + ' * 150.0), g = wn3(' + p + ' * 40.0), s2 = wn3(' + p + ' * 420.0); bc = mix(vec3(0.66, 0.64, 0.6), vec3(0.45, 0.43, 0.4), g); bc = mix(bc, vec3(0.36, 0.34, 0.31), step(0.66, a)); bc *= 0.85 + 0.3 * s2; }\n' +
  // inside the wall (seen through an opening): the raw material all the way through, in shadow
  '  if (wallIn > 0.0) diffuseColor.rgb = bc * mix(0.42, 0.16, wallIn) * (0.8 + 0.3 * bn);\n' +
  '  else if (!gl_FrontFacing) diffuseColor.rgb = bc * (0.26 + 0.12 * bn);\n' +
  // round an opening: a ragged band of broken material that follows its outline
  '  else if (wallV > 0.02) { float e = smoothstep(0.1, 0.24, wallV + (bn - 0.5) * 0.3), lip = smoothstep(0.32, 0.5, wallV);\n' +
  '    diffuseColor.rgb = mix(diffuseColor.rgb, bc * (1.0 - 0.35 * lip), e * (0.6 + 0.35 * bn)); }\n' +
  '}\n'; };
function maskUniforms(G) {
  const s1 = new V3().setComponent(G.a1, 1), s2 = new V3().setComponent(G.a2, 1);
  return { hShr: { value: G.stex }, hMask: { value: G.tex }, hMP: { value: new THREE.Vector4(G.min1, G.min2, G.n1 * G.cs1, G.n2 * G.cs2) }, hS1: { value: s1 }, hS2: { value: s2 }, hKind: { value: G.kind || 0 }, hTh: { value: new THREE.Vector4().setComponent(G.ax, 1).setW(G.half || 0.01) } };
}
// a wall with no grid still gets the same shader, with an empty mask
const NO_SHR = new THREE.DataTexture(new Uint8Array([128, 128]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType); NO_SHR.needsUpdate = true;
const NO_MASK = { hShr: { value: NO_SHR }, hMask: { value: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType) }, hMP: { value: new THREE.Vector4(0, 0, 1, 1) }, hS1: { value: new V3(1, 0, 0) }, hS2: { value: new V3(0, 1, 0) }, hKind: { value: 0 }, hTh: { value: new THREE.Vector4(0, 0, 1, 0.01) } };
NO_MASK.hMask.value.needsUpdate = true;
const MASK_DECL = '\nuniform sampler2D hShr; uniform sampler2D hMask; uniform vec4 hMP; uniform vec3 hS1; uniform vec3 hS2; uniform float hKind; uniform vec4 hTh;\n' + WALL_NOISE + MASK_FN;
function wallMask(mesh) {
  const G = wallGrid(mesh), m = mesh.material; if (!G || m.userData.hMask) return;
  G.kind = { plywood: 0, crate: 0, drywall: 1, concrete: 2 }[mesh.userData.kind] || 0;
  { const gp = mesh.geometry.parameters; G.half = [gp.width, gp.height, gp.depth][G.ax] / 2; }
  const U = maskUniforms(G); Object.assign(m.userData, U); const prev = m.onBeforeCompile;
  m.onBeforeCompile = sh => { prev(sh); Object.assign(sh.uniforms, U); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCamL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamL = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;'); sh.fragmentShader = sh.fragmentShader.replace('uniform vec4 hCut;', 'uniform vec4 hCut;\nvarying vec3 vCamL;' + MASK_DECL).replace('if (dot(vHolePos, hCut.xyz) > hCut.w) discard;', 'if (dot(vHolePos, hCut.xyz) > hCut.w) discard;\n' + MASK_GLSL_IN('vHolePos')).replace('#include <emissivemap_fragment>', WALL_EDGE('vHolePos') + '#include <emissivemap_fragment>'); };
  m.customProgramCacheKey = () => 'holesmask3' + SLOTS; m.needsUpdate = true;
  // the wall's shadow gets the same openings
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { hA: m.userData.hA, hB: m.userData.hB });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHolePos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;' + MASK_DECL + 'uniform vec4 hA[' + SLOTS + '];\nuniform vec4 hB[' + SLOTS + '];\n' + HOLE_JAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + MASK_GLSL('vHolePos') + 'for (int i = 0; i < ' + BRK + '; i++) { if (hA[i].w > 0.0) { vec3 hq = vHolePos - hA[i].xyz; float L2 = max(dot(hB[i].xyz, hB[i].xyz), 1e-8); float t = dot(hq, hB[i].xyz) / L2; if (t > 0.0 && t < 1.0) { vec3 hp = hq - hB[i].xyz * t; if (length(hp) < mix(hA[i].w, hB[i].w, t) * holeJag(i, hp, hB[i].xyz)) discard; } } }');
  };
  dm.customProgramCacheKey = () => 'wallshadow'; mesh.customDepthMaterial = dm;
}
function warmShaders() {
  try {
    const ws = new THREE.Scene(), L = new THREE.DirectionalLight(0xffffff, 1); L.castShadow = true; ws.add(L, new THREE.AmbientLight(0xffffff, 0.3));
    const mk = (kind, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0x999999)); m.userData.kind = kind; m.userData.box = { min: new V3(-w / 2, 0, -d / 2), max: new V3(w / 2, h, d / 2), mesh: m }; m.position.set(0, h / 2, -3); m.updateMatrixWorld(true); m.userData.grid = undefined; ws.add(m); return m; };
    const w = mk('plywood', 1.2, 2, 0.02), w2 = mk('metal', 1, 1, 1);
    holeify(w, SLOTS, DESTR.plywood.inner); w.userData.holeMax = SLOTS; wallMask(w);
    const add = mt => { const q = new THREE.Mesh(splatGeo, mt); q.position.set(0, 1, -2.9); ws.add(q); };
    for (const k of ['spatter', 'gore', 'spray', 'cast', 'splat', 'drip', 'smear']) { add(wallClipMat(bmat(k), w, -1)); add(bmat(k)); add(edgeClipMat(bmat(k), w2)); }
    add(wallClipMat(tubeMat(w), w, 0)); add(bmat('tear')); add(goreWet); add(goreDry); add(boneIn);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 10); renderer.compile(ws, cam);
    ws.traverse(o => { if (o.isMesh && o.customDepthMaterial) renderer.compile(o, cam); });
  } catch (e) { console.warn('shader warm-up skipped', e); }
}
function cutSlot(mesh, i, p, d, len, r0, r1, inner, t0, t1, cap) {
  holeify(mesh, SLOTS, inner); mesh.userData.holeMax = SLOTS; wallMask(mesh);
  const u = mesh.material.userData; u.hA.value[i].set(p.x, p.y, p.z, r0); u.hB.value[i].set(d.x * len, d.y * len, d.z * len, r1);
  const T = mesh.userData.tubes = mesh.userData.tubes || {};
  if (T[i]) { T[i].removeFromParent(); T[i].geometry.dispose(); }
  const D = DESTR[DESTR_OF[mesh.userData.kind]];
  const tm = new THREE.Mesh(holeTube(i, p, d, len, r0, r1, t0, t1, cap, shade(D.pit, 1.15), shade(D.inner, 0.8)), wallClipMat(tubeMat(mesh), mesh, i));
  tm.userData.tube = true; tm.receiveShadow = true; mesh.add(tm); T[i] = tm;
}
// inside of a wall: the wall's own texture, darker, lit from both sides
function tubeMat(mesh) {
  if (mesh.userData.tubeMat) return mesh.userData.tubeMat;
  const b = mesh.userData.baseMat || mesh.material;
  return mesh.userData.tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
}
// a material that is cut away wherever the given wall has an opening (blood on the wall, the wall's own tunnels). skip: own slot
// decals (skip = -1) are also cut off wherever they hang past the wall's own edges
const _wallBox = wall => { const g = wall.geometry; if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; };
function edgeClipMat(base, wall) {
  const bb = _wallBox(wall), m = base.clone(), hW = { value: wall.matrixWorld.clone().invert() }, bMin = { value: bb.min.clone() }, bMax = { value: bb.max.clone() };
  m.onBeforeCompile = sh => {
    sh.uniforms.hW = hW; sh.uniforms.bMin = bMin; sh.uniforms.bMax = bMax;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 hW;\nvarying vec3 vWallPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallPos = (hW * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWallPos;\nuniform vec3 bMin; uniform vec3 bMax;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + EDGE_CLIP);
  };
  m.customProgramCacheKey = () => 'eclip';
  return m;
}
const EDGE_CLIP = 'if (any(lessThan(vWallPos, bMin - vec3(0.012))) || any(greaterThan(vWallPos, bMax + vec3(0.012)))) discard;';
function wallClipMat(base, wall, skip) {
  if (!DESTR_OF[wall.userData.kind]) return skip === -1 && wall.geometry ? edgeClipMat(base, wall) : base;
  if (wall.userData.holeN === undefined) holeify(wall, SLOTS, DESTR[DESTR_OF[wall.userData.kind]].inner);
  wall.userData.holeMax = SLOTS;
  // one shader for every decal and tunnel on a wall: which slot to leave out is a uniform, not baked into the code, so a new hole
  // never has to compile a new program (that stall was the lag when shooting walls). Everything is also cut at the wall's edges.
  const m = base.clone(), U = wall.material.userData, hW = { value: wall.matrixWorld.clone().invert() }, bb = _wallBox(wall), bMin = { value: bb.min.clone() }, bMax = { value: bb.max.clone() }, G = wallGrid(wall), MU = G ? maskUniforms(G) : NO_MASK, hSkip = { value: skip };
  m.onBeforeCompile = sh => {
    sh.uniforms.hA = U.hA; sh.uniforms.hB = U.hB; sh.uniforms.hW = hW; sh.uniforms.bMin = bMin; sh.uniforms.bMax = bMax; sh.uniforms.hSkip = hSkip; Object.assign(sh.uniforms, MU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 hW;\nvarying vec3 vWallPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallPos = (hW * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWallPos;\nuniform vec3 bMin; uniform vec3 bMax; uniform int hSkip;' + MASK_DECL + '\nuniform vec4 hA[' + SLOTS + '];\nuniform vec4 hB[' + SLOTS + '];\n' + HOLE_JAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + EDGE_CLIP + MASK_GLSL('vWallPos') + '\nfor (int i = 0; i < ' + SLOTS + '; i++) { if (i != hSkip && hA[i].w > 0.0) { vec3 hq = vWallPos - hA[i].xyz; float L2 = max(dot(hB[i].xyz, hB[i].xyz), 1e-8); float t = dot(hq, hB[i].xyz) / L2; if (t > 0.0 && t < 1.0) { vec3 hp = hq - hB[i].xyz * t; if (length(hp) < mix(hA[i].w, hB[i].w, t) * holeJag(i, hp, hB[i].xyz)) discard; } } }');
  };
  m.customProgramCacheKey = () => 'wclipU';
  return m;
}
function placeDecalD(mesh, point, normal, size, material, depth) {
  decalHelper.position.copy(point); decalHelper.lookAt(_a.copy(point).add(normal)); decalHelper.rotateZ(Math.random() * Math.PI * 2);
  let geo; try { geo = new DecalGeometry(mesh, point, decalHelper.rotation, new V3(size, size, depth)); } catch (e) { return null; }
  if (!geo.attributes.position || !geo.attributes.position.count) { geo.dispose(); return null; }
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; scene.add(m); decals.push(m); trimDecals(); if (mesh.userData.door) mesh.attach(m); return m;
}
const dropDecal = m => { if (!m) return; scene.remove(m); const i = decals.indexOf(m); if (i >= 0) decals.splice(i, 1); m.geometry.dispose(); };
// chip craters (opaque) and the torn edge round an opened hole (clear in the middle so the hole shows)
function chipCanvas(draw, clear) {
  const t = canvasTex((g, s) => { g.clearRect(0, 0, s, s); const c = s / 2; draw(g, s, c); if (clear) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.283, r = s * clear * (1 + (Math.random() < 0.3 ? rnd(0, 0.06) : 0)); i ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.fill(); g.globalCompositeOperation = 'source-over'; } }, 256, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; return t;
}
const cracks = (g, c, r0, r1, n, col, lw) => { g.strokeStyle = col; g.lineCap = 'round'; for (let i = 0; i < n; i++) { let a = Math.random() * 6.283, x = c + Math.cos(a) * r0, y = c + Math.sin(a) * r0; g.lineWidth = lw * rnd(0.6, 1.3); g.beginPath(); g.moveTo(x, y); const st = 5, L = rnd(0.6, 1) * (r1 - r0) / st; for (let k = 0; k < st; k++) { a += rnd(-0.45, 0.45); x += Math.cos(a) * L; y += Math.sin(a) * L; g.lineTo(x, y); if (Math.random() < 0.25) { g.stroke(); g.lineWidth *= 0.6; g.beginPath(); g.moveTo(x, y); } } g.stroke(); } };
const speck = (g, c, r0, r1, n, cols, a0, a1) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = rnd(r0, r1), sz = rnd(a0, a1); g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, sz, sz * rnd(0.5, 1), Math.random() * 3, 0, 7); g.fill(); } };
const CHIP_TEX = {
  // a bullet strike on concrete: a shallow spalled crater of fresh, slightly paler concrete, broken aggregate, a dark pocket
  // where the round bit in, shaded as if lit from above, and hairline cracks. Twelve of them, no two alike; laid over the
  // wall's own texture half-transparent so they take on its colour instead of sitting on it like stickers
  rock: Array.from({ length: 12 }, () => chipCanvas((g, s, c) => {
    const R = s * rnd(0.26, 0.4), ox = rnd(-0.03, 0.03) * s, oy = rnd(-0.03, 0.03) * s;
    const du = g.createRadialGradient(c, c, R * 0.6, c, c, R * 1.5); du.addColorStop(0, 'rgba(120,116,108,0.22)'); du.addColorStop(1, 'rgba(120,116,108,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c + ox, c + oy, R, Math.floor(rnd(9, 17)), rnd(0.25, 0.45), 'rgba(128,124,116,0.5)');
    irregular(g, c + ox * 0.5, c + oy * 0.5, R * rnd(0.6, 0.78), Math.floor(rnd(8, 14)), rnd(0.3, 0.5), 'rgba(96,92,85,0.62)');
    // relief: the upper edge of the crater catches light, the lower inner wall is in shadow
    const sh = g.createLinearGradient(c, c - R, c, c + R); sh.addColorStop(0, 'rgba(60,57,52,0.0)'); sh.addColorStop(0.45, 'rgba(60,57,52,0.0)'); sh.addColorStop(1, 'rgba(45,42,38,0.35)');
    g.save(); g.beginPath(); g.arc(c, c, R * 0.75, 0, 7); g.clip(); g.fillStyle = sh; g.fillRect(0, 0, s, s); g.restore();
    speck(g, c, 0, R * 0.95, Math.floor(rnd(30, 70)), ['rgba(80,76,70,0.85)', 'rgba(140,136,128,0.6)', 'rgba(60,57,52,0.9)', 'rgba(118,110,95,0.7)'], s * 0.004, s * 0.018);
    const pr = R * rnd(0.22, 0.4), h = g.createRadialGradient(c, c, 0, c, c, pr); h.addColorStop(0, 'rgba(30,28,25,1)'); h.addColorStop(0.55, 'rgba(62,58,52,0.95)'); h.addColorStop(1, 'rgba(100,95,87,0)');
    g.fillStyle = h; irregular(g, c, c, pr, 9, 0.35, h);
    cracks(g, c, R * 0.6, R * rnd(1.1, 1.45), Math.floor(rnd(2, 7)), 'rgba(48,45,41,0.6)', s * 0.004);
  })),
  wood: Array.from({ length: 8 }, () => chipCanvas((g, s, c) => {
    g.save(); g.translate(c, c); g.scale(rnd(0.5, 0.7), rnd(1.1, 1.4)); irregular(g, 0, 0, s * 0.28, 16, 0.4, 'rgba(222,190,138,1)'); g.restore();
    g.strokeStyle = 'rgba(240,214,166,1)'; for (let i = 0; i < 26; i++) { const x = c + rnd(-0.16, 0.16) * s, y0 = c + rnd(-0.2, 0.2) * s; g.lineWidth = rnd(1, 3); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + rnd(-4, 4), y0 + rnd(-0.22, 0.22) * s); g.stroke(); }
    g.strokeStyle = 'rgba(150,110,62,0.9)'; for (let i = 0; i < 8; i++) { const x = c + rnd(-0.12, 0.12) * s; g.lineWidth = 1; g.beginPath(); g.moveTo(x, c - s * 0.3); g.lineTo(x + rnd(-2, 2), c + s * 0.3); g.stroke(); }
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.12); h.addColorStop(0, 'rgba(40,24,10,1)'); h.addColorStop(0.7, 'rgba(90,60,30,0.9)'); h.addColorStop(1, 'rgba(120,85,45,0)'); g.fillStyle = h; g.beginPath(); g.ellipse(c, c, s * 0.08, s * 0.13, 0, 0, 7); g.fill();
  })),
  plaster: Array.from({ length: 10 }, () => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.2, c, c, s * 0.5); du.addColorStop(0, 'rgba(150,146,138,0.35)'); du.addColorStop(1, 'rgba(150,146,138,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * 0.34, 18, 0.25, 'rgba(178,172,162,1)');
    irregular(g, c, c, s * 0.31, 18, 0.22, 'rgba(250,248,244,1)');
    speck(g, c, s * 0.05, s * 0.3, 30, ['rgba(232,228,220,1)', 'rgba(205,200,192,1)'], 1.5, 4);
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.15); h.addColorStop(0, 'rgba(70,68,64,1)'); h.addColorStop(0.5, 'rgba(150,146,138,1)'); h.addColorStop(1, 'rgba(225,221,214,0)'); g.fillStyle = h; g.beginPath(); g.arc(c, c, s * 0.15, 0, 7); g.fill();
  }))
};
const BREAK_TEX = {
  rock: Array.from({ length: 6 }, () => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5); du.addColorStop(0, 'rgba(110,106,98,0.3)'); du.addColorStop(1, 'rgba(110,106,98,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * rnd(0.4, 0.46), 22, rnd(0.12, 0.22), 'rgba(120,116,108,0.5)'); irregular(g, c, c, s * 0.36, 22, 0.1, 'rgba(84,80,74,0.7)');
    speck(g, c, s * 0.3, s * 0.42, 60, ['rgba(80,76,70,0.9)', 'rgba(140,136,128,0.7)', 'rgba(58,55,50,0.9)'], 1.5, 5);
    cracks(g, c, s * 0.38, s * 0.5, 9, 'rgba(55,52,47,0.85)', 1.8);
  }, 0.3)),
  wood: Array.from({ length: 4 }, () => chipCanvas((g, s, c) => {
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, L = s * (0.32 + Math.pow(Math.random(), 3) * 0.17), w = rnd(0.015, 0.05); g.fillStyle = ['rgba(214,180,130,0.95)', 'rgba(180,140,92,0.95)', 'rgba(120,86,50,0.9)'][i % 3]; g.beginPath(); g.moveTo(c + Math.cos(a - w) * s * 0.28, c + Math.sin(a - w) * s * 0.28); g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L); g.lineTo(c + Math.cos(a + w) * s * 0.28, c + Math.sin(a + w) * s * 0.28); g.fill(); }
    irregular(g, c, c, s * 0.335, 30, 0.05, 'rgba(196,160,110,1)'); irregular(g, c, c, s * 0.315, 30, 0.04, 'rgba(110,78,44,1)');
  }, 0.3)),
  plaster: Array.from({ length: 4 }, () => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5); du.addColorStop(0, 'rgba(160,156,148,0.45)'); du.addColorStop(1, 'rgba(160,156,148,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * rnd(0.39, 0.44), 30, rnd(0.08, 0.16), 'rgba(150,146,138,0.55)'); irregular(g, c, c, s * 0.37, 30, 0.08, 'rgba(206,202,195,0.85)'); irregular(g, c, c, s * 0.33, 30, 0.05, 'rgba(140,135,127,1)');
    speck(g, c, s * 0.3, s * 0.38, 40, ['rgba(226,222,214,1)', 'rgba(200,196,188,1)'], 1.5, 3.5);
  }, 0.3))
};
const decalMatOf = t => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.95 });
const CHIP_MAT = {}, BREAK_MAT = {};
for (const k in CHIP_TEX) { CHIP_MAT[k] = CHIP_TEX[k].map(decalMatOf); BREAK_MAT[k] = BREAK_TEX[k].map(decalMatOf); }
const pick = a => a[Math.floor(Math.random() * a.length)];

// debris: rough rock chunks, wood splinters, plaster flakes. They tumble, bounce and settle, and stay on the floor for a while
const DEB_GEO = [0, 1, 2, 3].map(() => {
  const g = new THREE.DodecahedronGeometry(1, 0), p = g.attributes.position, J = {};
  for (let i = 0; i < p.count; i++) { const k = Math.round(p.getX(i) * 100) + ',' + Math.round(p.getY(i) * 100) + ',' + Math.round(p.getZ(i) * 100); const j = J[k] || (J[k] = rnd(0.55, 1.15)); p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.8, p.getZ(i) * j); }
  g.computeVertexNormals(); return g;
});
// All debris is drawn instanced: one mesh per shape (four rough rock forms, a splinter box, a flat slab), each piece a slot
// with its own matrix and colour. Thousands of pieces cost a handful of draw calls, so a wall can come apart into as many
// chunks as it really would and the rubble can stay on the floor.
const DEB_CAP = 1400, debris = [];
const DEB_POOLS = [...DEB_GEO, fxBox, new THREE.BoxGeometry(1, 1, 1, 2, 1, 2)].map((geo, gi) => {
  if (gi === 5) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rnd(0.85, 1.15), p.getY(i), p.getZ(i) * rnd(0.85, 1.15)); geo.computeVertexNormals(); }
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97 }), DEB_CAP);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB_CAP * 3), 3);
  im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.userData.keep = true; scene.add(im);
  return { im, next: 0, slot: new Array(DEB_CAP).fill(null), dirty: false };
});
const _dM = new THREE.Matrix4(), _dE = new THREE.Euler(), _dQ = new THREE.Quaternion(), _dCol = new THREE.Color(), _dZero = new THREE.Matrix4().makeScale(0, 0, 0);
const debLimit = () => Math.round(DEB_CAP * ((typeof GFX !== 'undefined' && GFX.debris) || 1));
function debAdd(gi, pos, rot, sc, col) {
  const P = DEB_POOLS[gi], lim = debLimit(); let i = P.next; P.next = (P.next + 1) % lim;
  const old = P.slot[i]; if (old) old.dead = true;
  const d = { gi, i, p: pos, rot, sc, dead: false }; P.slot[i] = d; P.im.count = Math.max(P.im.count, i + 1);
  P.im.setColorAt(i, _dCol.setHex(col)); P.im.instanceColor.needsUpdate = true; debWrite(d); return d;
}
function debWrite(d) { const P = DEB_POOLS[d.gi]; P.im.setMatrixAt(d.i, _dM.compose(d.p, _dQ.setFromEuler(d.rot), d.sc)); P.dirty = true; }
const shade = (col, k) => { const c = new THREE.Color(col).multiplyScalar(k); return c.getHex(); };
// slab: a flat piece of the wall itself (sx x sy x thickness), for what breaks away in one piece
function spawnDebris(p, n, dir, spread, speed, D, sz, slab) {
  for (let i = 0; i < n; i++) {
    const s = sz * rnd(0.3, 1.25); let gi, sc;
    if (slab) { gi = 5; sc = new V3(slab[0] * rnd(0.6, 1), slab[2], slab[1] * rnd(0.6, 1)); }
    else if (D.deb === 'wood') { gi = 4; sc = new V3(s * rnd(0.2, 0.45), s * rnd(0.12, 0.3), s * rnd(1.5, 4.5)); }
    else if (D.deb === 'plaster') { gi = Math.floor(Math.random() * 4); sc = new V3(s, s * 0.22, s * rnd(0.7, 1.1)); }
    else { gi = Math.floor(Math.random() * 4); sc = new V3(s, s * rnd(0.6, 1), s * rnd(0.7, 1.1)); }
    const col = D.deb === 'wood' ? (Math.random() < 0.5 ? 0xe0c08c : 0xb48a58) : shade(Math.random() < 0.35 ? D.pit : D.col, rnd(0.78, 1.08));
    const pos = p.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.012));
    const d = debAdd(gi, pos, new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), sc, col);
    d.v = dir.clone().multiplyScalar(speed * rnd(0.35, 1.1)).add(new V3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).multiplyScalar(spread * speed));
    d.w = new V3(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25)).multiplyScalar(slab ? 0.15 : 1);
    d.r = slab ? Math.max(sc.y * 0.5, 0.01) : Math.min(sc.x, sc.y, sc.z) * 0.5; d.life = rnd(90, 150); d.rest = false; d.flake = D.deb === 'plaster' && !slab; d.slab = !!slab;
    debris.push(d);
  }
}
const _dprev = new V3();
function updateDebris(dt) {
  let w = 0;
  for (let i = 0; i < debris.length; i++) {
    const d = debris[i]; if (d.dead) continue; debris[w++] = d;
    d.life -= dt;
    if (d.life <= 0) { d.sc.multiplyScalar(Math.max(0, 1 - dt * 3)); debWrite(d); if (d.life < -1) { d.dead = true; DEB_POOLS[d.gi].im.setMatrixAt(d.i, _dZero); DEB_POOLS[d.gi].slot[d.i] = null; w--; } continue; }
    if (d.rest) continue;
    if (d.flake) { d.v.multiplyScalar(1 - 2.5 * dt); d.v.y -= 4 * dt; } else d.v.y -= 9.8 * dt;
    _dprev.copy(d.p); d.p.addScaledVector(d.v, dt);
    d.rot.x += d.w.x * dt; d.rot.y += d.w.y * dt; d.rot.z += d.w.z * dt;
    let floor = d.r;
    for (const c of colliders) {
      const p = d.p;
      if (p.x > c.min.x && p.x < c.max.x && p.z > c.min.z && p.z < c.max.z && p.y < c.max.y + d.r && p.y > c.min.y && !(c.mesh && gridOpenW(c.mesh, p))) {
        if (_dprev.y >= c.max.y + d.r * 0.5) floor = Math.max(floor, c.max.y + d.r);
        else { d.p.x = _dprev.x; d.p.z = _dprev.z; if (_dprev.x <= c.min.x || _dprev.x >= c.max.x) d.v.x *= -0.3; else d.v.z *= -0.3; }
      }
    }
    if (d.p.y < floor) {
      d.p.y = floor;
      if (d.v.y < -0.9) { d.v.y *= d.slab ? -0.12 : -0.28; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5); if (d.slab && d.v.y > 0.3) { noiseHit(260, 0.12, 0.08); dust(d.p, new V3(0, 1, 0), 0xb8b2a6, 0.5, 0.35, 1.6); } }
      else { d.rest = true; d.rot.x = Math.round(d.rot.x / Math.PI) * Math.PI; d.rot.z = Math.round(d.rot.z / Math.PI) * Math.PI; }
    }
    debWrite(d);
  }
  debris.length = Math.max(0, w);
  for (const P of DEB_POOLS) if (P.dirty) { P.im.instanceMatrix.needsUpdate = true; P.dirty = false; }
}
function dust(p, n, col, size, op, life) {
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: col, transparent: true, depthWrite: false, opacity: op }));
    s.position.copy(p); s.scale.setScalar(size * 0.3); scene.add(s);
    const v = n.clone().multiplyScalar(rnd(0.6, 2.2)).add(new V3(rnd(-0.5, 0.5), rnd(-0.2, 0.5), rnd(-0.5, 0.5)));
    fx.push({ o: s, life: life * rnd(0.7, 1.2), max: life, fade: op, grow: size * rnd(0.8, 1.4), rise: 0.06, dispose: true, sprite: true, sv: v });
  }
}
// an open hole that a round goes straight through without touching anything
// a world direction in a wall's own frame (the same for every wall but a door's turning leaf)
const _wnM = new THREE.Matrix4();
function wallN(mesh, n) { return mesh.userData.door ? n.clone().transformDirection(_wnM.copy(mesh.matrixWorld).invert()) : n; }
function holePass(mesh, point, n, dir, v) {
  const ud = mesh.userData; if (!ud.dmg || !ud.box) return null;
  const fresh = performance.now() - (ud.brokeT || 0) < 40;
  if (!fresh && gridOpenW(mesh, point.clone().addScaledVector(dir, 0.01))) { const bx = boxExit(ud.box, point, dir); return { point: point.clone().addScaledVector(dir, bx.t + 0.01), dir, v, free: true }; }
  const nl = wallN(mesh, n), ax = Math.abs(nl.x) > 0.7 ? 0 : Math.abs(nl.y) > 0.7 ? 1 : 2, pl = mesh.worldToLocal(point.clone());
  for (const c of ud.dmg) {
    if (c.r <= 0 || !c.through || c.ax !== ax || fresh) continue;
    if (Math.hypot(pl.getComponent((ax + 1) % 3) - c.u, pl.getComponent((ax + 2) % 3) - c.v) < c.r * 0.92) {
      const bx = boxExit(ud.box, point, dir); return { point: point.clone().addScaledVector(dir, bx.t + 0.01), dir, v, free: true };
    }
  }
  return null;
}
// one round's worth of damage to one face. side 1 = the face it went in through, 0 = the far face it came out of
function wallDamage(mesh, point, n, dir, E, w, side, through) {
  const D = DESTR[DESTR_OF[mesh.userData.kind]]; if (!D) return;
  const ud = mesh.userData, gp = mesh.geometry.parameters, dims = [gp.width, gp.height, gp.depth];
  const nl = wallN(mesh, n), ax = Math.abs(nl.x) > 0.7 ? 0 : Math.abs(nl.y) > 0.7 ? 1 : 2, sgn = Math.sign(nl.getComponent(ax)) || 1, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
  const thick = dims[ax], pl = mesh.worldToLocal(point.clone()), u = pl.getComponent(a1), v = pl.getComponent(a2);
  const cal = (CAL[w] || CAL[0])[0], pistol = isPistol(w), rock = D.deb === 'rock';
  ud.dmg = ud.dmg || [];
  let c = null, bd = 1e9;
  for (const k of ud.dmg) { if (k.ax !== ax) continue; const dd = Math.hypot(k.u - u, k.v - v); if (dd < Math.max(0.09, k.r + 0.12) && dd < bd) { bd = dd; c = k; } }
  if (!c) { c = { ax, u, v, d: 0, r: 0, slot: -1, chips: [], rings: [], through: false }; ud.dmg.push(c); }
  // a pistol round flattens and bursts on concrete: lots of dust and a scar, very little real damage
  c.d += E * (side ? 1 : 0.5) * (rock && pistol ? 0.2 : 1) * (isShotgun(w) ? (rock ? 1.4 : 3.2) : 1);
  const out = n.clone(), pOut = point.clone().addScaledVector(out, 0.012);
  const refl = dir.clone().addScaledVector(out, -2 * dir.dot(out)).normalize();
  const eject = side ? refl.lerp(out, 0.5).normalize() : dir.clone().lerp(out, 0.4).normalize();
  const bits = clamp(Math.round((side ? 4 : 6) + E / (rock ? 700 : 500)), 3, 22);
  spawnDebris(pOut, bits, eject, 0.45, rock ? rnd(2.5, 4.5) : rnd(1.8, 3.2), D, (rock ? 0.006 : 0.008) + cal * (rock ? 0.6 : 0.8) + Math.min(0.02, E / 900000));
  dust(pOut, eject, D.dust, 0.35 + Math.min(0.9, E / 9000) + (side ? 0 : 0.2), D.deb === 'plaster' ? 0.75 : 0.6, rock ? 1.6 : 1.2);
  if (rock && side) particles(pOut, pistol ? 6 : 3, PMAT.spark, 3.5, 0.004, 0.14, 0.3, out, 5);
  if (side) noiseHit(D.snd[0], D.snd[1], 0.05);
  // the damage itself: what the round does to the material, stamped into the wall's damage field (see stampWall)
  const G = wallGrid(mesh), opened = G && ax === G.ax ? stampWall(mesh, G, D, u, v, E, cal, w, side, through, dir, pl.getComponent(ax), wallN(mesh, dir)) : 0;
  // a crater on the face it hit, unless it is now part of an opening
  if (side && !gridOpenW(mesh, point.clone().addScaledVector(dir, 0.005))) {
    const size = (rock ? 0.05 + cal * 4.2 : D.deb === 'wood' ? 0.035 + cal * 2.6 : 0.05 + cal * 3.2) * rnd(0.8, 1.25) + Math.min(0.06, E / 300000);
    const m = placeDecalD(mesh, point, n, size, pick(CHIP_MAT[D.deb]), Math.min(0.03, thick * 0.45));
    if (m) c.chips.push({ m, u, v });
    if (rock && thick > 0.05) {
      const i = PIT0 + ((ud.pitN = (ud.pitN || 0) + 1) % (SLOTS - PIT0)), nl = new V3(); nl.setComponent(ax, sgn);
      const depth = Math.min(thick * 0.35, 0.006 + E / D.hp * 0.05);
      cutSlot(mesh, i, pl.clone().addScaledVector(nl, 0.02), nl.clone().negate(), 0.02 + depth, size * 0.14, size * 0.07, D.pit, 0.02 / (0.02 + depth), 1, true);
    }
  }
}
// What a round really does to the material, by material, round and energy (E, joules, as it arrived):
//  wood: punches a clean hole a little bigger than the bullet; the far side splinters out wider along the grain
//  drywall: crumbles, a ragged hole a couple of calibres wide, paper torn round it
//  concrete: a rifle or pistol round only spalls a shallow crater and weakens the wall round it; enough rounds in one
//    place (or a .50, or buckshot up close) and it breaks through
// Every hit adds damage to the cells it reaches (1 = gone), with noise so no two are alike, and damage builds up: rounds
// grouped in one spot weaken it until the hole grows into one ragged opening. Returns how many cells opened.
const _sh = (a, b, c) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };
function stampWall(mesh, G, D, u0, v0, E, cal, w, side, through, dir, d0, dl) {
  // into the grid's own axes (a1 across, a2 up): u/v came in the face's (ax+1, ax+2) order
  const q = new V3(); q.setComponent((G.ax + 1) % 3, u0); q.setComponent((G.ax + 2) % 3, v0);
  let U = q.getComponent(G.a1), V = q.getComponent(G.a2);
  // a round that goes through at a slant: the hole runs along its path (stored where it crosses the middle of the wall)
  if (through && dl && d0 !== undefined) {
    const dn = Math.abs(dl.getComponent(G.ax)) || 1e-3, s1 = clamp(dl.getComponent(G.a1) / dn, -3.9, 3.9), s2 = clamp(dl.getComponent(G.a2) / dn, -3.9, 3.9);
    U -= s1 * d0; V -= s2 * d0;
    const rr = Math.max(0.03, cal * 8) + (Math.abs(s1) + Math.abs(s2)) * (G.half || 0.05) + 0.03;
    const i0 = Math.max(0, Math.floor((U - rr - G.min1) / G.cs1)), i1 = Math.min(G.n1 - 1, Math.ceil((U + rr - G.min1) / G.cs1)), j0 = Math.max(0, Math.floor((V - rr - G.min2) / G.cs2)), j1 = Math.min(G.n2 - 1, Math.ceil((V + rr - G.min2) / G.cs2));
    const e1 = Math.round(128 + s1 * 32), e2 = Math.round(128 + s2 * 32);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * G.n1 + i; if (G.cell[k] === 2) continue; G.shr[k * 2] = e1; G.shr[k * 2 + 1] = e2; }
    G.stex.needsUpdate = true;
  }
  const kJ = E / 1700, shot = isShotgun(w), big = cal > 0.012;
  const seed = Math.round(U * 1000) * 0.37 + Math.round(V * 1000) * 0.61;
  let core = 0, coreAmt = 1.25, halo, haloAmt, el = 1;
  if (D.deb === 'wood') {
    core = side ? Math.max(0.005, cal * (1.1 + 0.25 * kJ)) : 0;
    halo = Math.max(0.02, cal * 4) * (side ? 1 : 1.5 + 0.3 * Math.min(2, kJ)); haloAmt = (side ? 0.16 : 0.32) * Math.min(2.2, 0.5 + kJ); el = 1.7;
  } else if (D.deb === 'plaster') {
    core = side ? Math.max(0.008, cal * (2.0 + 0.4 * kJ)) : 0;
    halo = Math.max(0.03, cal * 6); haloAmt = (side ? 0.22 : 0.3) * Math.min(2.2, 0.6 + kJ);
  } else {
    // concrete: only something heavy breaks straight through
    core = side && (big || (shot && E > 900)) ? (big ? 0.012 + cal * 1.6 : 0.006) * Math.min(1.6, 0.5 + kJ * 0.15) : 0;
    halo = 0.035 + cal * 2.5 + Math.min(0.05, E / 120000); haloAmt = (side ? 0.075 : 0.05) * Math.min(4, kJ) * (isPistol(w) ? 0.35 : 1) * (shot ? 0.6 : 1);
  }
  holeify(mesh, SLOTS, D.inner); mesh.userData.holeMax = SLOTS; wallMask(mesh);
  const R = Math.max(core, halo) * 1.3, i0 = Math.floor((U - R - G.min1) / G.cs1), i1 = Math.ceil((U + R - G.min1) / G.cs1), j0 = Math.floor((V - R - G.min2) / G.cs2), j1 = Math.ceil((V + R - G.min2) / G.cs2);
  let opened = 0, ou = 0, ov = 0; const data = G.tex.image.data;
  // the core's outline is lumpy, not round
  const lump = a => 1 + 0.22 * Math.sin(3 * a + seed) + 0.14 * Math.sin(5 * a + seed * 1.7) + 0.08 * Math.sin(9 * a + seed * 2.3);
  for (let j = Math.max(0, j0); j <= Math.min(G.n2 - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(G.n1 - 1, i1); i++) {
    const k = j * G.n1 + i; if (G.cell[k]) continue;
    const cu = G.min1 + (i + 0.5) * G.cs1 - U, cv = G.min2 + (j + 0.5) * G.cs2 - V, ang = Math.atan2(cv, cu);
    const dc = Math.hypot(cu, cv), dh = Math.hypot(cu / el, cv);
    const nz = 0.55 + 0.9 * _sh(i, j, seed);
    let add = 0;
    if (core > 0 && dc < core * lump(ang)) add += coreAmt;
    if (dh < halo) { const t = 1 - dh / halo; add += haloAmt * t * t * nz; }
    if (!add) continue;
    // damage already there makes it give way more easily
    G.dmg[k] += add * (1 + 0.6 * Math.min(1, G.dmg[k]));
    if (G.dmg[k] >= 1) {
      G.cell[k] = 1; G.any = true; data[k] = 255; opened++; ou += cu; ov += cv;
      // the material round a fresh break is cracked and spalled too, unevenly, so the broken band is ragged, not a line
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj; if ((!di && !dj) || ii < 0 || jj < 0 || ii >= G.n1 || jj >= G.n2) continue;
        const kk = jj * G.n1 + ii; if (G.cell[kk]) continue;
        const r = _sh(ii * 3 + 1, jj * 7 + 2, seed); if (r < 0.35) continue;
        G.dmg[kk] = Math.min(0.9, G.dmg[kk] + (r - 0.35) * 0.55 / (Math.abs(di) + Math.abs(dj))); data[kk] = Math.round(Math.min(0.92, G.dmg[kk]) * 255);
      }
    }
    else data[k] = Math.round(Math.min(0.92, G.dmg[k]) * 255);
  }
  G.tex.needsUpdate = true;
  if (opened) settleWall(mesh, G, D, dir, U + ou / opened, V + ov / opened, opened);
  return opened;
}
// after a part opened: chunks of what was there, anything left hanging falls, craters inside the opening go, and the steel
// in reinforced concrete shows across it
function settleWall(mesh, G, D, dir, U, V, opened, spd) {
  spd = spd || 1;
  const ud = mesh.userData, gp = mesh.geometry.parameters, thick = [gp.width, gp.height, gp.depth][G.ax], q = new V3();
  const fw = dir.clone().normalize(), area = opened * G.cs1 * G.cs2, n = clamp(Math.round(area * 9000), 2, 90);
  for (let i = 0; i < n; i++) {
    q.set(0, 0, 0); q.setComponent(G.a1, U + rnd(-1, 1) * Math.sqrt(area) * 0.6); q.setComponent(G.a2, V + rnd(-1, 1) * Math.sqrt(area) * 0.6); q.setComponent(G.ax, rnd(-0.5, 0.5) * thick);
    const fwd = Math.random() < 0.75;
    spawnDebris(mesh.localToWorld(q.clone()), 1, (fwd ? fw : fw.clone().negate()).lerp(new V3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)), 0.35).normalize(), 0.45, rnd(1.2, 3.6) * spd, D,
      D.deb === 'rock' ? rnd(0.008, 0.025) : D.deb === 'wood' ? rnd(0.01, 0.03) : rnd(0.008, 0.022));
  }
  q.set(0, 0, 0); q.setComponent(G.a1, U); q.setComponent(G.a2, V);
  dust(mesh.localToWorld(q.clone()), fw, D.dust, 0.4 + Math.sqrt(area) * 6, 0.6, 2.2);
  ud.brokeT = performance.now();
  updateWallGrid(mesh, D, dir);
  for (const c of ud.dmg || []) c.chips = c.chips.filter(ch => { q.set(0, 0, 0); q.setComponent((c.ax + 1) % 3, ch.u); q.setComponent((c.ax + 2) % 3, ch.v); if (gridOpenW(mesh, mesh.localToWorld(q.clone()))) { dropDecal(ch.m); return false; } return true; });
  if (D.deb === 'rock' && thick > 0.12) rebuildRebar(mesh, G, thick);
}
// the reinforcing mesh: bars every 16 cm both ways in two layers; a bar shows wherever it runs across open cells
const REBAR_GEO = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6), REBAR_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3b2a, roughness: 0.75, metalness: 0.55 });
function rebuildRebar(mesh, G, thick) {
  const ud = mesh.userData; if (ud.rebar) ud.rebar.removeFromParent(); const rg = ud.rebar = new THREE.Group(); mesh.add(rg);
  const sp = 0.16, open = (i, j) => i >= 0 && j >= 0 && i < G.n1 && j < G.n2 && G.cell[j * G.n1 + i] > 0;
  for (const layer of [-0.28, 0.28]) for (const along of [0, 1]) {
    const nL = along ? G.n1 : G.n2, nA = along ? G.n2 : G.n1, csL = along ? G.cs1 : G.cs2, csA = along ? G.cs2 : G.cs1, minL = along ? G.min1 : G.min2, minA = along ? G.min2 : G.min1;
    for (let x = minL + sp * 0.5; x < -minL; x += sp) {
      const li = Math.floor((x - minL) / csL); let run = -1;
      for (let a = 0; a <= nA; a++) {
        const o = a < nA && (along ? open(li, a) : open(a, li));
        if (o && run < 0) run = a;
        if (!o && run >= 0) {
          if (a - run >= 2) {
            const y0 = minA + run * csA - 0.02, y1 = minA + a * csA + 0.02, rod = new THREE.Mesh(REBAR_GEO, REBAR_MAT), p = new V3();
            p.setComponent(G.ax, layer * thick); p.setComponent(along ? G.a1 : G.a2, x); p.setComponent(along ? G.a2 : G.a1, (y0 + y1) / 2);
            rod.position.copy(p); rod.scale.set(1, y1 - y0, 1); rod.quaternion.setFromUnitVectors(_Y, new V3().setComponent(along ? G.a2 : G.a1, 1));
            rod.rotateX(rnd(-0.05, 0.05)); rod.rotateZ(rnd(-0.05, 0.05)); rod.castShadow = true; rg.add(rod);
          }
          run = -1;
        }
      }
    }
  }
}
// a hit on a ragdoll piece, expressed in the skeleton frame that piece stands for, so the anatomy sees the right body part
function ragHitInfo(hit, dir) {
  const g = hit.object.parent, rf = g.userData.rf, lp = g.worldToLocal(hit.point.clone());
  const d = dir.clone().applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  let frame = 'spine', armor = hit.object.userData.armor;
  if (rf === 'torso') { if (lp.y + 0.24 >= -0.02) lp.y += 0.24; else { frame = 'hips'; lp.y += 0.31; } }
  else if (rf === 'head') { if (lp.y >= -0.085) { frame = 'head'; lp.y += 0.1; } else { frame = 'neck'; lp.y += 0.16; } }
  else if (rf) { frame = ['shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR'][rf.seg]; lp.y += rf.dy; }
  return { frame, e: lp, d, armor };
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    if (f.v) {
      if (f.grav) f.v.y -= 9.8 * dt;
      f.o.position.addScaledVector(f.v, dt);
      if (f.spin) { f.o.rotation.x += dt * 9; f.o.rotation.y += dt * 7; }
      if (f.align) f.o.lookAt(_a.copy(f.o.position).add(f.v));
      if (f.o.position.y < 0.005) {
        if (f.drop) { dropSplat(new V3(f.o.position.x, 0, f.o.position.z), _sUp, f.o.scale.x * 0.6 + 0.002, f.v); groundSplat(new V3(f.o.position.x, 0.003 + Math.random() * 0.002, f.o.position.z), rnd(0.07, 0.18)); f.life = 0; }
        else { f.o.position.y = 0.005; f.v.y *= -0.25; f.v.x *= 0.5; f.v.z *= 0.5; }
      } else if (f.drop && pointBlocked(f.o.position, 0)) f.life = 0;
    }
    if (f.sv) { f.o.position.addScaledVector(f.sv, dt); f.sv.multiplyScalar(Math.max(0, 1 - 3 * dt)); }
    if (f.sprite) { const k = 1 - f.life / f.max; f.o.scale.setScalar(f.grow * (0.4 + k * 0.9)); f.o.position.y += f.rise * dt; }
    if (f.fade !== undefined) f.o.material.opacity = f.fade * Math.max(0, f.life / f.max);
    if (f.life <= 0) { scene.remove(f.o); if (f.dispose) f.o.material.dispose(); fx.splice(i, 1); }
  }
}

// ---- module exports: build.mjs strips this block ----
export { DEB_POOLS, DESTR, DESTR_OF, REBAR_GEO, REBAR_MAT, SLOTS, _sh, cutSlot, debris, dust, edgeClipMat, gridOpenW, gridPass, holePass, markPlate, packHit, pick, ragHitInfo, settleWall, spawnDebris, updateDebris, updateFx, wallClipMat, wallDamage, wallGrid, wallMask, warmShaders };
// ---- end module exports ----
