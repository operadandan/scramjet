// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3 } from './00-setup.js';
import { addBox, addGround, canvasTex, clearWorld, mat, spawns, worldGroup, worldMeshes } from './01-world.js';
import { nz } from './12b-gore.js';
import { shade } from './15-destruction.js';
import { DOOR_FW, DOOR_H, DOOR_W, addDoor } from './15b-doors.js';
import { items } from './21-items-inventory.js';
import { boardWindow, reinforceBox } from './23-siege.js';
// ---- end module links ----
// ---------------------------------------------------------------- map building helpers (the multiplayer map is at the end)
// (the helpers below were written for a whole street of houses: walls with openings, flats, cars, trees, fences)
const TOWN = { def: [], atk: [], half: 46, windows: [], sites: [], lamps: [], lampAll: [], pair: 0 };
const TOWN_TEX = {
  grass: canvasTex((g, s) => { g.fillStyle = '#4f6b34'; g.fillRect(0, 0, s, s); for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? 'rgba(30,50,15,0.35)' : 'rgba(120,150,70,0.3)'; g.fillRect(Math.random() * s, Math.random() * s, 1.5, Math.random() * 4 + 1); } }),
  asphalt: canvasTex((g, s) => { g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, s, s); for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.12)'; g.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6); } }),
  pave: canvasTex((g, s) => { g.fillStyle = '#9b978f'; g.fillRect(0, 0, s, s); for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.12 + ')'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); } g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(0, 0, s, s); })
};
// a flat strip on the ground (road, pavement, lawn, drive): only looks, nothing to bump into
function townFlat(x, z, w, d, tex, rep, y, color) {
  const t = TOWN_TEX[tex].clone(); t.needsUpdate = true; t.repeat.set(w / rep, d / rep);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, color: color || 0xffffff, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -Math.min(1.5, (y || 0.003) * 250) }));   // (a little ahead of the ground, behind blood and marks)
  m.rotation.x = -Math.PI / 2; m.position.set(x, y || 0.003, z); m.receiveShadow = true; m.userData.surf = tex === 'grass' ? 'dirt' : 'concrete';
  worldGroup.add(m); worldMeshes.push(m);
}
// a wall from a to b along x (ax 'x', at z = c) or along z (ax 'z', at x = c), H tall, t thick, with openings
// [from, to, bottom, top] measured along the wall: what is left round them is built as boxes
function townWall(ax, a, b, c, H, t, kind, color, holes, base) {
  holes = (holes || []).slice().sort((p, q) => p[0] - q[0]); base = base || 0;
  const box = (u0, u1, y0, y1) => { if (u1 - u0 < 0.02 || y1 - y0 < 0.02) return; const u = (u0 + u1) / 2, L = u1 - u0; if (ax === 'x') addBox(u, base + y0, c, L, y1 - y0, t, kind, color); else addBox(c, base + y0, u, t, y1 - y0, L, kind, color); };
  let u = a;
  for (const [h0, h1, y0, y1] of holes) { box(u, h0, 0, H); box(h0, h1, 0, y0); box(h0, h1, y1, H); u = h1; }
  box(u, b, 0, H);
}
// (worked out when used: the door sizes are defined further on, in 15b-doors)
const doorHole = u => [u - DOOR_W / 2 - DOOR_FW, u + DOOR_W / 2 + DOOR_FW, 0, DOOR_H + 0.1];
const winHole = (u, w) => [u - (w || 1.2) / 2, u + (w || 1.2) / 2, 0.95, 2.05];
// a house: x0..x1, z0..z1. walls: { n, s, w, e } each a list of ['d', u, kind, hinge, lock] doors and ['w', u, width] windows
// (u along that wall); inner: extra walls [ax, a, b, c, holes]; doors in inner walls as [x, z, rot, kind, hinge].
function townHouse(x0, z0, x1, z1, o) {
  const H = 2.75, t = 0.16, kind = o.brick ? 'concrete' : 'drywall', col = o.color || 0xd9d2c0;
  const holes = side => (o.walls[side] || []).map(e => e[0] === 'd' ? doorHole(e[1]) : winHole(e[1], e[2]));
  townWall('x', x0 - t / 2, x1 + t / 2, z0, H, t, kind, col, holes('n'));
  townWall('x', x0 - t / 2, x1 + t / 2, z1, H, t, kind, col, holes('s'));
  townWall('z', z0 + t / 2, z1 - t / 2, x0, H, t, kind, col, holes('w'));
  townWall('z', z0 + t / 2, z1 - t / 2, x1, H, t, kind, col, holes('e'));
  for (const [side, z, x, rot] of [['n', z0, null, 0], ['s', z1, null, 0], ['w', null, x0, Math.PI / 2], ['e', null, x1, Math.PI / 2]])
    for (const e of o.walls[side] || []) if (e[0] === 'd') addDoor(x === null ? e[1] : x, z === null ? e[1] : z, rot, e[2] || 'plywood', e[3] || 1, e[4] || 0);
  // inside: drywall partitions with their own doorways
  for (const [ax, a, b, c, hs] of o.inner || []) townWall(ax, a, b, c, H, 0.1, 'drywall', 0xe8e3d8, (hs || []).map(u => doorHole(u)));
  for (const [x, z, rot, k, hg] of o.innerDoors || []) addDoor(x, z, rot, k || 'plywood', hg || 1, 0);
  // floor and roof: a ceiling slab, then the pitch built up in steps along the ridge
  townFlat((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 'pave', 1.2, 0.004, o.floor || 0xb59b78);
  const ov = 0.45, rc = o.roof || 0x4a4440, ridgeX = (x1 - x0) >= (z1 - z0);
  addBox((x0 + x1) / 2, H, (z0 + z1) / 2, x1 - x0 + ov * 2, 0.18, z1 - z0 + ov * 2, 'crate', rc);
  for (let i = 1; i <= 2; i++) {
    const k = 1 - i * 0.36, w = ridgeX ? x1 - x0 + ov * 2 : (x1 - x0 + ov * 2) * k, d = ridgeX ? (z1 - z0 + ov * 2) * k : z1 - z0 + ov * 2;
    addBox((x0 + x1) / 2, H + 0.18 + (i - 1) * 0.4, (z0 + z1) / 2, w, 0.4, d, 'crate', rc);
  }
}
function townCar(x, z, along, color) {
  const X = along === 'x', [w, d] = X ? [4.3, 1.8] : [1.8, 4.3], [cw, cd] = X ? [2.3, 1.6] : [1.6, 2.3];
  addBox(x, 0, z, w * 0.94, 0.2, d * 0.9, 'metal', 0x161616); addBox(x, 0.2, z, w, 0.7, d, 'metal', color); addBox(x, 0.9, z, cw, 0.62, cd, 'metal', color);
}
const _treeLeaf = new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 1 }); _treeLeaf.userData.shared = true;
function townTree(x, z, s) {
  s = s || 1; addBox(x, 0, z, 0.28 * s, 2.6 * s, 0.28 * s, 'crate', 0x5a4632);
  for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.4], [0.6, 2.7, 0.3, 1], [-0.5, 2.8, -0.4, 1.05], [0.1, 3.7, -0.2, 0.9]]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), _treeLeaf); m.position.set(x + dx * s, dy * s, z + dz * s); m.castShadow = true; worldGroup.add(m);
  }
}
const townFence = (ax, a, b, c, h) => townWall(ax, a, b, c, h || 1.5, 0.06, 'plywood', 0x8f7556);
// ---------------------------------------------------------------- the multiplayer map: one house, Siege style
// A two-storey timber-frame house (siding walls a round goes through and a charge blows open) on its own lot: a front porch
// whose roof can be climbed onto from the skip beside it, a back garden with a shed, the street out front. The defenders
// start inside and have two bomb sites to hold (A: the kitchen downstairs, B: the main bedroom upstairs); the attackers start
// out on the street and down the side road. Every window can be boarded up and every full-height wall panel reinforced.
// x runs east, z south; the house stands from x -14 to 14, z -10 to 10, the front (south) facing the street.
// small furnishings share a material per colour (kept from round to round: the world rebuilds every round)
const DECO_MATS = new Map();
// the lamp shades glow when the lights are on (shared by every lamp; 24-env sets how bright); the boards' colour
const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4ead8, emissive: 0xffd8a0, emissiveIntensity: 0, roughness: 0.8 }); lampMat.userData.shared = true;
const BOARD_COL = 0x9a7a52;
function decoMat(c) { let m = DECO_MATS.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }); m.userData.shared = true; DECO_MATS.set(c, m); } return m; }
// the bomb: a steel case, three canisters strapped to it, the wiring, and a box with a lit display
function townBomb(p) {
  addBox(p.x, p.y, p.z, 0.64, 0.3, 0.44, 'metal', 0x2e322e); const base = worldMeshes[worldMeshes.length - 1]; base.userData.bomb = true; const g = new THREE.Group(); g.position.set(0, -0.15, 0); base.add(g);
  const mk = (geo, c, x, y, z, rx, rz, em) => { const m = new THREE.Mesh(geo, em ? new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, toneMapped: false }) : decoMat(c)); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
  const can = new THREE.CylinderGeometry(0.075, 0.075, 0.5, 16);
  for (const z of [-0.13, 0, 0.13]) mk(can, 0x4a5a32, 0, 0.375, z, 0, Math.PI / 2);
  for (const x of [-0.17, 0.17]) mk(new THREE.BoxGeometry(0.035, 0.17, 0.42), 0x1a1a1a, x, 0.39, 0);
  mk(new THREE.BoxGeometry(0.2, 0.12, 0.16), 0x202224, 0.06, 0.52, 0);
  mk(new THREE.BoxGeometry(0.13, 0.045, 0.01), 0xff3020, 0.06, 0.53, 0.082, 0, 0, true);
  for (let k = 0; k < 4; k++) mk(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 5), [0xc02020, 0x2050c0, 0xe0c020, 0x20a040][k], -0.08 + k * 0.025, 0.47, -0.02 + k * 0.012, 0.9, 0.5);
}
const HOUSE = { x0: -14, x1: 14, z0: -10, z1: 10, f1: 3.0, H: 2.8, t: 0.2 };
// the two bombs move every round: one of these pairs (A downstairs, B upstairs), chosen by the room
const SITE_PAIRS = [
  [{ id: 'A', p: [10, 0, -7.2], name: 'A · Kitchen' }, { id: 'B', p: [11.8, 1, -5.5], name: 'B · Main bedroom' }],
  [{ id: 'A', p: [-12.4, 0, 2.6], name: 'A · Living room' }, { id: 'B', p: [-1.5, 1, 6.6], name: 'B · Kids room' }],
  [{ id: 'A', p: [11, 0, 6.6], name: 'A · Office' }, { id: 'B', p: [5.5, 1, 6.6], name: 'B · Study' }],
  [{ id: 'A', p: [-10.5, 0, -6.8], name: 'A · Laundry' }, { id: 'B', p: [-8, 1, 4.5], name: 'B · Guest bedroom' }]
];
// reinforced walls round each pair's sites, to begin with ([x, y, z, w, h, d], y 0 or 1 = which floor)
const SITE_RF = [
  [[7, 0, -0.1, 1.4, 0, 0.05], [0.1, 0, -8, 0.05, 0, 1.4], [8, 1, -0.1, 1.4, 1, 0.05], [4.1, 1, -7, 0.05, 1, 1.4]],
  [[-4.1, 0, 6.8, 0.05, 0, 1.4], [-6, 0, 0.1, 1.4, 0, 0.05], [-4.9, 1, 7, 0.05, 1, 1.4], [3.1, 1, 6.5, 0.05, 1, 1.4]],
  [[8.1, 0, 7, 0.05, 0, 1.4], [9.5, 0, 0.1, 1.4, 0, 0.05], [3.1, 1, 7.5, 0.05, 1, 1.4], [7.9, 1, 7.5, 0.05, 1, 1.4]],
  [[-6.9, 0, -6, 0.05, 0, 1.4], [-12.5, 0, -0.1, 1.4, 0, 0.05], [-4.9, 1, 7, 0.05, 1, 1.4], [-12.5, 1, 0.1, 1.4, 1, 0.05]]
];
// a floor or roof slab, laid as tiles no bigger than about 3.5 m: each tile stands or falls on its own (30-structure), so
// part of a roof caves in where the walls under it are gone, not all or nothing
function slab(cx, y, cz, w, h, d, kind, col) {
  const nx = Math.max(1, Math.ceil(w / 3.5)), nz = Math.max(1, Math.ceil(d / 3.5)), tw = w / nx, td = d / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { addBox(cx - w / 2 + tw * (i + 0.5), y, cz - d / 2 + td * (j + 0.5), tw, h, td, kind, col, 'planks'); worldMeshes[worldMeshes.length - 1].userData.slab = true; }
}
function buildTown(pair) {
  clearWorld();
  TOWN.windows = []; TOWN.demolished = false; TOWN.gone = []; TOWN.sites = []; TOWN.def = []; TOWN.atk = []; TOWN.lamps = []; TOWN.lampAll = [];
  addGround(180, 'ground'); { const g = worldMeshes[worldMeshes.length - 1], t = TOWN_TEX.grass.clone(); t.needsUpdate = true; t.repeat.set(60, 60); g.material.map = t; }
  const E = 46;
  // the street out front, the side road to the west, pavements, the drive and the path
  townFlat(0, 22, 2 * E, 8, 'asphalt', 6, 0.003); townFlat(-26, -12, 8, 60, 'asphalt', 6, 0.0032);
  townFlat(0, 16.8, 2 * E, 2.4, 'pave', 1.2, 0.005); townFlat(-20.8, -12, 2.4, 60, 'pave', 1.2, 0.0052);
  townFlat(-1, 13.3, 1.4, 6.6, 'pave', 1.2, 0.0055); townFlat(9.5, 13.4, 3.4, 6.8, 'pave', 1.5, 0.005);
  // the edge of the playing area: tall hedges all round
  for (const s of [-1, 1]) { addBox(0, 0, s * E, 2 * E + 2, 3.2, 1.6, 'concrete', 0x3c5a2c); addBox(s * E, 0, 0, 1.6, 3.2, 2 * E, 'concrete', 0x3c5a2c); }
  const { x0, x1, z0, z1, f1, H, t } = HOUSE, col = 0xd9d4c4, col2 = 0xc9cfc8;
  const tag = (n0, floor, ext) => { for (let i = n0; i < worldMeshes.length; i++) { const m = worldMeshes[i]; m.userData.house = floor; m.userData.ext = ext; } };
  // a wall of the house, recording its windows (for the boards) as it goes. Outside walls are timber frame and drywall with a
  // brick skin outside (its own layer: rounds and charges have to get through both)
  const wall = (ax, a, b, c, floor, ext, items, inner) => {
    const base = floor ? f1 : 0, holes = [];
    for (const [k, u, w] of items || []) {
      if (k === 'd') holes.push(doorHole(u));
      else { holes.push(winHole(u, w)); const p = ax === 'x' ? new V3(u, base + 1.5, c) : new V3(c, base + 1.5, u); TOWN.windows.push({ p, ax, w: w || 1.2, y0: base + 0.95, y1: base + 2.05, t: inner ? 0.12 : t, boarded: false }); }
    }
    const n0 = worldMeshes.length; townWall(ax, a, b, c, floor ? H : f1, inner ? 0.12 : t, 'drywall', inner ? 0xe8e3d8 : floor ? col2 : col, holes, base);
    if (ext) { const o = Math.sign(c) * (t / 2 + 0.03); townWall(ax, a - 0.06, b + 0.06, c + o, floor ? H : f1, 0.06, 'brick', 0xffffff, holes, base); }
    tag(n0, floor, ext);
  };
  // ---- ground floor: across the middle (z 0) a wall with doors; behind it the laundry, the stair hall and the kitchen;
  // in front the living room, the hall at the front door, the dining room and the office
  wall('x', x0 - t / 2, x1 + t / 2, z1, 0, 1, [['w', -12], ['w', -8], ['d', -1], ['w', 4.5], ['w', 6.6], ['w', 11]]);
  wall('x', x0 - t / 2, x1 + t / 2, z0, 0, 1, [['w', -11], ['w', -4], ['w', 2], ['w', 6], ['w', 10], ['d', 12.3]]);
  wall('z', z0 + t / 2, z1 - t / 2, x0, 0, 1, [['w', -6], ['d', -2.2], ['w', 5]]);
  wall('z', z0 + t / 2, z1 - t / 2, x1, 0, 1, [['w', -6], ['d', 2.4], ['w', 6]]);
  wall('x', x0 + t / 2, x1 - t / 2, 0, 0, 0, [['d', -10], ['d', -3], ['d', 4], ['d', 11]], true);
  wall('z', z0 + t / 2, -0.06, -7, 0, 0, [['d', -3]], true);
  wall('z', z0 + t / 2, -0.06, 0, 0, 0, [['d', -5]], true);
  wall('z', 0.06, z1 - t / 2, -4, 0, 0, [['d', 4]], true);
  wall('z', 0.06, z1 - t / 2, 2, 0, 0, [['d', 5]], true);
  wall('z', 0.06, z1 - t / 2, 8, 0, 0, [['d', 4]], true);
  // the outside doors are locked from outside (they open, and lock, from inside only); the inside ones are not
  addDoor(-1, z1, 0, 'metal', 1, -1); addDoor(12.3, z0, 0, 'plywood', -1, 1); addDoor(x0, -2.2, Math.PI / 2, 'plywood', 1, 1); addDoor(x1, 2.4, Math.PI / 2, 'plywood', 1, -1);
  for (const x of [-10, -3, 4, 11]) addDoor(x, 0, 0, 'plywood', x > 0 ? -1 : 1, 0);
  addDoor(-7, -3, Math.PI / 2, 'plywood', 1, 0); addDoor(0, -5, Math.PI / 2, 'plywood', -1, 0);
  addDoor(-4, 4, Math.PI / 2, 'plywood', 1, 0); addDoor(2, 5, Math.PI / 2, 'plywood', -1, 0); addDoor(8, 4, Math.PI / 2, 'plywood', 1, 0);
  townFlat(0, 0, x1 - x0, z1 - z0, 'pave', 1.2, 0.004, 0xa98d6c); worldMeshes[worldMeshes.length - 1].userData.surf = 'wood';
  // the stairs, up along the north wall of the stair hall: 16 steps of 19 cm
  const sz0 = z0 + t / 2 + 0.02, sz1 = sz0 + 1.15, sN = 16, rise = f1 / sN, run = 0.28, sx0 = -6.6;
  for (let i = 0; i < sN; i++) addBox(sx0 + i * run + run / 2, 0, (sz0 + sz1) / 2, run, (i + 1) * rise, sz1 - sz0, 'crate', 0x7a5a3a);
  const sTop = sx0 + sN * run;
  // ---- the upper floor: its floor (with the stair well left open), then its walls
  slab(0, f1 - 0.2, (sz1 + z1) / 2, x1 - x0 + t, 0.2, z1 - sz1 + t / 2, 'crate', 0x8a7458);
  slab((x0 - t / 2 + sx0) / 2, f1 - 0.2, (z0 + sz1) / 2, sx0 - x0 + t / 2, 0.2, sz1 - z0 + t / 2, 'crate', 0x8a7458);
  slab((sTop + x1) / 2, f1 - 0.2, (z0 + sz1) / 2, x1 - sTop + t / 2, 0.2, sz1 - z0 + t / 2, 'crate', 0x8a7458);
  addBox((sx0 + 0.9 + sTop) / 2, f1, sz1 + 0.03, sTop - sx0 - 0.9, 1, 0.05, 'crate', 0x5a4632);
  wall('x', x0 - t / 2, x1 + t / 2, z1, 1, 1, [['w', -12], ['w', -9], ['w', -2], ['w', 0.8], ['w', 5.5], ['w', 11]]);
  wall('x', x0 - t / 2, x1 + t / 2, z0, 1, 1, [['w', -11], ['w', -2], ['w', 1.5], ['w', 7], ['w', 11]]);
  wall('z', z0 + t / 2, z1 - t / 2, x0, 1, 1, [['w', -6], ['w', 5]]);
  wall('z', z0 + t / 2, z1 - t / 2, x1, 1, 1, [['w', -6], ['w', 5]]);
  wall('x', x0 + t / 2, x1 - t / 2, 0, 1, 0, [['d', -10], ['d', -2], ['d', 5], ['d', 11]], true);
  wall('z', z0 + t / 2, -0.06, -7.2, 1, 0, [['d', -4]], true);
  wall('z', z0 + t / 2, -0.06, 4, 1, 0, [['d', -3]], true);
  wall('z', 0.06, z1 - t / 2, -5, 1, 0, [['d', 3]], true);
  wall('z', 0.06, z1 - t / 2, 3, 1, 0, [['d', 3]], true);
  wall('z', 0.06, z1 - t / 2, 8, 1, 0, [['d', 4]], true);
  for (const x of [-10, -2, 5, 11]) addDoor(x, 0, 0, 'plywood', x > 0 ? -1 : 1, 0, f1);
  addDoor(-7.2, -4, Math.PI / 2, 'plywood', 1, 0, f1); addDoor(4, -3, Math.PI / 2, 'plywood', -1, 0, f1);
  addDoor(-5, 3, Math.PI / 2, 'plywood', 1, 0, f1); addDoor(3, 3, Math.PI / 2, 'plywood', -1, 0, f1); addDoor(8, 4, Math.PI / 2, 'plywood', 1, 0, f1);
  // the roof: a slab, the pitch in steps, a chimney
  slab(0, f1 + H, 0, x1 - x0 + 1, 0.2, z1 - z0 + 1, 'crate', 0x4a4440);
  for (let i = 1; i <= 3; i++) slab(0, f1 + H + 0.2 + (i - 1) * 0.4, 0, x1 - x0 + 1, 0.4, (z1 - z0 + 1) * (1 - i * 0.27), 'crate', 0x4a4440);
  addBox(9, f1 + H + 0.2, -2, 0.9, 2, 0.9, 'brick', 0xffffff);
  // ---- the front porch: a roof on two posts over the front door, and a skip beside it to climb up from
  slab(-1, f1 - 0.2, z1 + 1.4, 5, 0.2, 2.6, 'crate', 0x4a4440); for (const px of [-3.3, 1.3]) addBox(px, 0, z1 + 2.55, 0.18, f1 - 0.2, 0.18, 'crate', 0xe8e3d8);
  addBox(-1, 0, z1 + 0.9, 3, 0.15, 1.6, 'concrete', 0x9b978f);
  addBox(-4.6, 0, z1 + 1.9, 2, 1.45, 1.4, 'metal', 0x2e5a3a); addBox(-3.5, 0, z1 + 1.4, 0.1, f1, 2.6, 'crate', 0xe8e3d8);
  // ---- furniture. Big pieces are solid (cover, things to vault and stand on); small things are only looks
  const deco = (x, y, z, w, h, d, c, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || decoMat(c)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; m.userData.deco = true; worldGroup.add(m); return m; };
  // a ceiling light: its shade can be shot out (the light goes, glass falls); the first few really light the room
  const lamp = (x, y, z, light) => {
    const shade = deco(x, y - 0.16, z, 0.42, 0.14, 0.42, 0, lampMat); deco(x, y - 0.03, z, 0.06, 0.05, 0.06, 0x2a2a2a);
    const L = { p: new V3(x, y - 0.35, z), mesh: shade, li: light ? TOWN.lamps.length : -1, out: false };
    shade.userData.lamp = TOWN.lampAll.length; shade.userData.surf = 'glass'; worldMeshes.push(shade); TOWN.lampAll.push(L);
    if (light) TOWN.lamps.push(L.p);
  };
  // living room (south-west): couches round a coffee table and the TV, a bookcase, a rug
  addBox(-10, 0, 8.6, 2.4, 0.5, 0.9, 'crate', 0x5b6a7a); deco(-10, 0.5, 8.95, 2.4, 0.4, 0.2, 0x4f5d6c);
  addBox(-13.2, 0, 5, 0.9, 0.5, 2.2, 'crate', 0x5b6a7a); deco(-13.55, 0.5, 5, 0.2, 0.4, 2.2, 0x4f5d6c);
  addBox(-10.2, 0, 6.2, 1.2, 0.42, 0.6, 'crate', 0x6a4e34);
  addBox(-7, 0, 0.38, 1.8, 0.5, 0.45, 'crate', 0x3a3430); deco(-7, 0.5, 0.33, 1.4, 0.8, 0.06, 0x101114);
  addBox(-5, 0, 8.5, 1.4, 1.9, 0.35, 'crate', 0x6a4e34); for (let k = 0; k < 4; k++) deco(-5, 0.3 + k * 0.42, 8.3, 1.2, 0.28, 0.05, [0x8a3a2a, 0x2a4a6a, 0x5a6a3a, 0x7a6a4a][k]);
  townFlat(-10, 6, 3.6, 2.8, 'pave', 3.2, 0.008, 0x6e3c34);
  // front hall: a coat stand, a shoe rack, a side table
  addBox(-3.2, 0, 7.5, 0.35, 0.9, 1.2, 'crate', 0x5a4632); addBox(1.5, 0, 2.5, 0.5, 0.8, 1, 'crate', 0x6a4e34);
  // dining room: a long table and six chairs, a sideboard
  addBox(5, 0, 6, 2.4, 0.76, 1.1, 'crate', 0x7a5a3a);
  for (const cx of [4.2, 5, 5.8]) for (const [cz, s] of [[4.95, -1], [7.05, 1]]) { addBox(cx, 0, cz, 0.44, 0.46, 0.44, 'crate', 0x6a4e34); deco(cx, 0.46, cz + s * 0.2, 0.44, 0.5, 0.05, 0x6a4e34); }
  addBox(6.4, 0, 0.36, 2.2, 0.85, 0.45, 'crate', 0x5a3e2a);
  // office (south-east): desk, chair, filing cabinets, a safe
  addBox(11, 0, 8.6, 1.8, 0.75, 0.8, 'crate', 0x6a4e34); addBox(11, 0, 7.6, 0.5, 0.5, 0.5, 'crate', 0x2a2a2a);
  addBox(13.4, 0, 8.4, 0.5, 1.3, 1.6, 'metal', 0x6a7078); addBox(9, 0, 1, 0.8, 1, 0.8, 'metal', 0x3a3e42);
  // kitchen (north-east): counters along the back wall with the stove and sink, the fridge, an island, a table
  addBox(8, 0, -9.4, 5, 0.92, 0.62, 'crate', 0xd8d2c4); deco(8, 0.92, -9.4, 5.02, 0.04, 0.64, 0x3a3836);
  deco(6.5, 0.96, -9.4, 0.6, 0.02, 0.5, 0x151515); deco(9.5, 0.93, -9.45, 0.5, 0.04, 0.35, 0x9aa0a6);
  addBox(13.4, 0, -7, 0.62, 0.92, 3.2, 'crate', 0xd8d2c4); deco(13.4, 0.92, -7, 0.64, 0.04, 3.22, 0x3a3836);
  addBox(7, 0, -5, 2, 0.92, 1, 'crate', 0xb8b2a4); deco(7, 0.92, -5, 2.02, 0.04, 1.02, 0x3a3836);
  addBox(1.2, 0, -9.4, 0.8, 1.85, 0.7, 'metal', 0xe8e8e4); addBox(3, 0, -2.2, 1.4, 0.75, 0.9, 'crate', 0x7a5a3a);
  deco(7.5, 1.55, -9.68, 1.4, 0.7, 0.32, 0xcfc8b8); deco(10, 1.55, -9.68, 1.2, 0.7, 0.32, 0xcfc8b8);
  // laundry (north-west): washer, dryer, shelves, a boiler
  addBox(-12.5, 0, -9.3, 0.7, 0.9, 0.7, 'metal', 0xe8e8e4); addBox(-11.6, 0, -9.3, 0.7, 0.9, 0.7, 'metal', 0xe8e8e4);
  addBox(-13.5, 0, -5, 0.45, 1.8, 1.6, 'crate', 0x6a5a4a); addBox(-8, 0, -9.4, 0.8, 1.7, 0.6, 'metal', 0x9a9a92);
  // stair hall: a shoe rack and the banister up the stairs
  addBox(-1, 0, -0.45, 1.2, 0.45, 0.32, 'crate', 0x5a4632);
  for (let k = 0; k < 5; k++) deco(sx0 + 0.4 + k * 0.8, k * 0.8 * 0.67, sz1 + 0.02, 0.05, 1.0, 0.05, 0x5a4632);
  // upstairs. Main bedroom (north-east): bed, bedside tables, wardrobe, dresser
  addBox(9, f1, -7.8, 2.2, 0.5, 2, 'crate', 0x8a96a8); deco(9, f1 + 0.5, -8.7, 2.2, 0.55, 0.15, 0x5a4632);
  addBox(7.45, f1, -9.3, 0.5, 0.55, 0.45, 'crate', 0x6a4e34); addBox(10.55, f1, -9.3, 0.5, 0.55, 0.45, 'crate', 0x6a4e34);
  addBox(13.4, f1, -3, 0.6, 1.9, 1.6, 'crate', 0x6a4e34); addBox(5, f1, -9.4, 1.3, 0.9, 0.5, 'crate', 0x7a5a3a);
  // landing (north, middle): a sofa and a bookcase
  addBox(1, f1, -9.3, 2, 0.5, 0.8, 'crate', 0x5b6a7a); addBox(3.6, f1, -6, 0.35, 1.9, 1.4, 'crate', 0x6a4e34);
  // bathroom (north-west): bath, toilet, basin
  addBox(-12.6, f1, -9.2, 1.6, 0.55, 0.8, 'crate', 0xf0f0ec); deco(-12.6, f1 + 0.55, -9.2, 1.4, 0.02, 0.6, 0x9ab8c8);
  addBox(-13.5, f1, -5.5, 0.6, 0.45, 0.42, 'crate', 0xf0f0ec); addBox(-9, f1, -9.5, 0.6, 0.85, 0.4, 'crate', 0xf0f0ec);
  // guest bedroom (south-west), kids room (south middle), study, second bath (south-east)
  addBox(-10, f1, 7, 2, 0.5, 1.6, 'crate', 0xa8908a); deco(-10, f1 + 0.5, 7.75, 2, 0.5, 0.15, 0x5a4632); addBox(-13.3, f1, 2, 0.5, 0.85, 1.2, 'crate', 0x7a5a3a);
  addBox(-1.5, f1, 8.8, 1.6, 0.5, 1.6, 'crate', 0x9a7aa8); addBox(1.8, f1, 9.4, 1, 0.6, 0.5, 'crate', 0x7aa88a);
  addBox(5.5, f1, 8.8, 1.4, 0.75, 0.7, 'crate', 0x6a4e34); addBox(7.6, f1, 1.8, 0.35, 1.9, 1.4, 'crate', 0x6a4e34);
  addBox(12.6, f1, 9.2, 1.6, 0.55, 0.8, 'crate', 0xf0f0ec); addBox(13.5, f1, 5.5, 0.6, 0.45, 0.42, 'crate', 0xf0f0ec);
  // the lights: one in every room, every one a real light (the only light inside), every one can be shot out
  lamp(-3.5, f1 - 0.2, -5, true); lamp(8, f1 - 0.2, -5, true); lamp(-9, f1 - 0.2, 5, true); lamp(5, f1 - 0.2, 5, true);
  lamp(9, f1 + H - 0.02, -5, true); lamp(-1, f1 + H - 0.02, 5, true);
  lamp(-10.5, f1 - 0.2, -5, true); lamp(-1, f1 - 0.2, 5, true); lamp(11, f1 - 0.2, 5, true); lamp(-10.5, f1 + H - 0.02, -5, true); lamp(-1, f1 + H - 0.02, -5, true); lamp(-10, f1 + H - 0.02, 5, true); lamp(5.5, f1 + H - 0.02, 5, true); lamp(11, f1 + H - 0.02, 5, true);
  deco(-2.6, 2.15, z1 + 0.18, 0.14, 0.24, 0.1, 0, lampMat);
  for (const w of TOWN.windows) if (w.t > 0.15) { const out = Math.abs(w.p.z) > 9 ? Math.sign(w.p.z) : 0, ox = out ? 0 : Math.sign(w.p.x); deco(w.p.x + ox * (t / 2 + 0.1), w.y0 - 0.06, w.p.z + out * (t / 2 + 0.1), out ? w.w + 0.16 : 0.12, 0.06, out ? 0.12 : w.w + 0.16, 0xd8d2c4); }
  // ---- the two bombs this round
  const sp = SITE_PAIRS[((pair | 0) % SITE_PAIRS.length + SITE_PAIRS.length) % SITE_PAIRS.length];
  TOWN.sites = sp.map(s => ({ id: s.id, p: new V3(s.p[0], s.p[1] ? f1 : 0, s.p[2]), name: s.name })); TOWN.pair = SITE_PAIRS.indexOf(sp);
  for (const s of TOWN.sites) townBomb(s.p);
  // ---- every window boarded up to begin with, and the walls round the sites already reinforced
  for (let i = 0; i < TOWN.windows.length; i++) boardWindow(i);
  for (const r of SITE_RF[TOWN.pair]) { const fl = r[4] ? f1 : 0, hh = r[4] ? H : f1; reinforceBox([r[0], fl, r[2], r[3], hh, r[5]]); }
  // ---- the lot: fences round the back garden, a shed, a patio, a car in the drive, bins, trees, the street
  townFence('x', x0 - 6, x1 + 6, -16, 1.8); townFence('z', -16, 2, x0 - 6, 1.5); townFence('z', -16, 2, x1 + 6, 1.5);
  addBox(15.5, 0, -13.5, 3, 2.3, 2.4, 'crate', 0x7a6650);
  townFlat(-2, -12.8, 6, 3.4, 'pave', 1.5, 0.006, 0xa8a49c); addBox(-2, 0, -13, 1.2, 0.72, 0.8, 'crate', 0x8a8a84);
  addBox(15.6, 0, -2.5, 0.6, 1.1, 0.6, 'metal', 0x2e4a2e); addBox(15.6, 0, -1.7, 0.6, 1.1, 0.6, 'metal', 0x2a3a5a);
  addBox(-2.2, 0, 16.2, 0.25, 1.15, 0.45, 'metal', 0x2a2a2a);
  townCar(9.5, 13.6, 'z', 0x34506e); townCar(-12, 22, 'x', 0x9a9a92); townCar(16, 21.6, 'x', 0x6e2e2e); townCar(-26, -4, 'z', 0x2e2e2e);
  for (const [x, z, k] of [[-17, 13.5, 1], [16, 12, 0.9], [-18, -13, 1.1], [4, -14, 0.9], [22, -6, 1], [-34, 8, 1], [30, 10, 1]]) townTree(x, z, k);
  // where the attackers start: behind a van and a low wall across the street, and behind a garage down the side road
  addBox(-3.5, 0, 31, 5.2, 2.3, 2.1, 'metal', 0xe8e8e0); addBox(4.5, 0, 31, 4.5, 1.25, 0.4, 'concrete', 0x8a867e);
  for (const [x, z] of [[-17, 30], [12, 32], [-30, 26], [30, 30]]) addBox(x, 0, z, 2.6, 1.2, 1.2, 'concrete', 0x8a867e);
  addBox(-34, 0, -8, 4.5, 2.7, 7, 'crate', 0x9a8a78); addBox(-34, 2.7, -8, 5, 0.2, 7.5, 'crate', 0x4a4440);
  // ---- spawns: the defenders inside, away from the doors and windows; the attackers behind their cover
  TOWN.def = [new V3(-3.5, 0, -5.5), new V3(-1, 0, 2.5), new V3(5.5, 0, -2.8), new V3(5, 0, 2.8), new V3(-9.5, 0, 2.8), new V3(-1.5, f1, -4.5), new V3(9, f1, -3.5), new V3(0, f1, 3.5), new V3(-10, f1, 2.6), new V3(11, f1, 2.6)];
  TOWN.atk = [new V3(-5, 0, 33.4), new V3(-2, 0, 33.4), new V3(3, 0, 32.6), new V3(6, 0, 32.6), new V3(-37.6, 0, -10), new V3(-37.6, 0, -8), new V3(-37.6, 0, -6), new V3(-37.6, 0, -11.8), new V3(-14, 0, 33), new V3(13, 0, 33.5)];
  spawns = TOWN.atk.concat(TOWN.def);
  // the little things go with what they sit on, hang from or are fixed to (a falling shelf takes its books, a ceiling its
  // light, a wall its sill), so nothing is left floating when that goes
  worldGroup.updateMatrixWorld(true);
  for (const m of worldGroup.children.slice()) {
    if (!m.userData.deco) continue;
    const bb = new THREE.Box3().setFromObject(m), c = bb.getCenter(new V3()); let best = null, bv = 1e9;
    for (const w of worldMeshes) { const b = w.userData.box; if (!b || w.userData.door || w === m) continue;
      if (c.x < b.min.x - 0.12 || c.x > b.max.x + 0.12 || c.z < b.min.z - 0.12 || c.z > b.max.z + 0.12) continue;
      if (bb.min.y > b.max.y + 0.08 || bb.max.y < b.min.y - 0.08) continue;
      const v = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z); if (v < bv) { bv = v; best = w; } }
    if (best) best.attach(m);
  }
  // (only the house and its street can come down: the structure code leaves every other world alone)
  for (const m of worldMeshes) m.userData.town = true;
}

// ---- module exports: build.mjs strips this block ----
export { BOARD_COL, HOUSE, SITE_PAIRS, TOWN, buildTown, decoMat, lampMat, slab };
// ---- end module exports ----
