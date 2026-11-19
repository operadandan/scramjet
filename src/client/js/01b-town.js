// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3 } from './00-setup.js';
import { addBox, addGround, canvasTex, clearWorld, spawns, worldGroup, worldMeshes } from './01-world.js';
import { DOOR_FW, DOOR_H, DOOR_W, addDoor } from './15b-doors.js';
import { items } from './21-items-inventory.js';
// ---- end module links ----
// ---------------------------------------------------------------- map building helpers (the multiplayer map is at the end)
// (the helpers below were written for a whole street of houses: walls with openings, flats, cars, trees, fences)
const TOWN = { def: [], atk: [], half: 46, windows: [], sites: [] };
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
// x runs east, z south; the house stands from x -10 to 10, z -7 to 7, the front (south) facing the street.
const HOUSE = { x0: -10, x1: 10, z0: -7, z1: 7, f1: 3.0, H: 2.8, t: 0.2 };
function buildTown() {
  clearWorld();
  TOWN.windows = []; TOWN.sites = []; TOWN.def = []; TOWN.atk = [];
  addGround(180, 'ground'); { const g = worldMeshes[worldMeshes.length - 1], t = TOWN_TEX.grass.clone(); t.needsUpdate = true; t.repeat.set(60, 60); g.material.map.dispose(); g.material.map = t; }
  const E = 46;
  // the street out front, the side road to the west, pavements, the drive and the path
  townFlat(0, 22, 2 * E, 8, 'asphalt', 6, 0.003); townFlat(-26, -12, 8, 60, 'asphalt', 6, 0.0032);
  townFlat(0, 16.8, 2 * E, 2.4, 'pave', 1.2, 0.005); townFlat(-20.8, -12, 2.4, 60, 'pave', 1.2, 0.0052);
  townFlat(-3, 12, 1.4, 9.5, 'pave', 1.2, 0.0055); townFlat(7, 11.5, 3.4, 9, 'pave', 1.5, 0.005);
  // the edge of the playing area: tall hedges all round
  for (const s of [-1, 1]) { addBox(0, 0, s * E, 2 * E + 2, 3.2, 1.6, 'concrete', 0x3c5a2c); addBox(s * E, 0, 0, 1.6, 3.2, 2 * E, 'concrete', 0x3c5a2c); }
  const { x0, x1, z0, z1, f1, H, t } = HOUSE, col = 0xd9d4c4, col2 = 0xc9cfc8;
  const win = [], tag = (n0, floor, ext) => { for (let i = n0; i < worldMeshes.length; i++) { const m = worldMeshes[i]; m.userData.house = floor; m.userData.ext = ext; } };
  // a wall of the house, recording its windows (for the boards) as it goes
  const wall = (ax, a, b, c, floor, ext, items, inner) => {
    const base = floor ? f1 : 0, holes = [];
    for (const [k, u, w] of items || []) {
      if (k === 'd') holes.push(doorHole(u));
      else { holes.push(winHole(u, w)); const p = ax === 'x' ? new V3(u, base + 1.5, c) : new V3(c, base + 1.5, u); TOWN.windows.push({ p, ax, w: w || 1.2, y0: base + 0.95, y1: base + 2.05, t: inner ? 0.12 : t, boarded: false }); }
    }
    const n0 = worldMeshes.length; townWall(ax, a, b, c, floor ? H : f1, inner ? 0.12 : t, 'drywall', inner ? 0xe8e3d8 : floor ? col2 : col, holes, base); tag(n0, floor, ext);
  };
  // ---- ground floor
  wall('x', x0 - t / 2, x1 + t / 2, z1, 0, 1, [['w', -7.5], ['d', -3], ['w', 1], ['w', 4.5], ['w', 8]]);
  wall('x', x0 - t / 2, x1 + t / 2, z0, 0, 1, [['w', -1.5], ['w', 2.5], ['d', 6]]);
  wall('z', z0 + t / 2, z1 - t / 2, x0, 0, 1, [['w', -2.5], ['w', 3.5]]);
  wall('z', z0 + t / 2, z1 - t / 2, x1, 0, 1, [['d', -2], ['w', 3.5]]);
  // inside: a wall across the middle (kitchen and stair hall behind, living and dining rooms in front)
  wall('x', x0 + t / 2, x1 - t / 2, 0, 0, 0, [['d', -7], ['d', 1.5], ['d', 7]], true);
  wall('z', z0 + t / 2, -0.06, -3, 0, 0, [['d', -2.5]], true);
  wall('z', 0.06, z1 - t / 2, -1, 0, 0, [['d', 3.5]], true);
  // the outside doors are locked from outside (they open, and lock, from inside only); the inside ones are not
  addDoor(-3, z1, 0, 'metal', 1, -1); addDoor(6, z0, 0, 'plywood', -1, 1); addDoor(x1, -2, Math.PI / 2, 'plywood', 1, -1);
  addDoor(-7, 0, 0, 'plywood', 1, 0); addDoor(1.5, 0, 0, 'plywood', -1, 0); addDoor(7, 0, 0, 'plywood', 1, 0); addDoor(-3, -2.5, Math.PI / 2, 'plywood', 1, 0); addDoor(-1, 3.5, Math.PI / 2, 'plywood', -1, 0);
  townFlat(0, 0, x1 - x0, z1 - z0, 'pave', 1.2, 0.004, 0xa98d6c);
  // the stairs, up along the north wall of the stair hall: 16 steps of 19 cm
  const sz0 = z0 + t / 2 + 0.02, sz1 = sz0 + 1.15, sN = 16, rise = f1 / sN, run = 0.28, sx0 = -9.6;
  for (let i = 0; i < sN; i++) addBox(sx0 + i * run + run / 2, 0, (sz0 + sz1) / 2, run, (i + 1) * rise, sz1 - sz0, 'crate', 0x7a5a3a);
  const sTop = sx0 + sN * run;   // the top step ends here; the landing begins
  // ---- the upper floor: its floor (with the stair well left open), then its walls
  addBox(0, f1 - 0.2, (sz1 + z1) / 2, x1 - x0 + t, 0.2, z1 - sz1 + t / 2, 'crate', 0x8a7458);
  addBox((sTop + x1) / 2, f1 - 0.2, (z0 + sz1) / 2, x1 - sTop + t / 2, 0.2, sz1 - z0 + t / 2, 'crate', 0x8a7458);
  townFlat(0, (sz1 + z1) / 2 - 0.0, x1 - x0, z1 - sz1, 'pave', 1.2, f1 + 0.004, 0x9a8466);
  // a rail along the open side of the stair well
  addBox((sx0 + 0.9 + sTop) / 2, f1, sz1 + 0.03, sTop - sx0 - 0.9, 1, 0.05, 'crate', 0x5a4632);
  wall('x', x0 - t / 2, x1 + t / 2, z1, 1, 1, [['w', -7], ['w', -2], ['w', 3], ['w', 7.5]]);
  wall('x', x0 - t / 2, x1 + t / 2, z0, 1, 1, [['w', -1], ['w', 3.5], ['w', 7.5]]);
  wall('z', z0 + t / 2, z1 - t / 2, x0, 1, 1, [['w', -3], ['w', 3]]);
  wall('z', z0 + t / 2, z1 - t / 2, x1, 1, 1, [['w', -4], ['w', 3]]);
  wall('x', x0 + t / 2, x1 - t / 2, 0, 1, 0, [['d', -6], ['d', 5]], true);
  wall('z', z0 + t / 2, -0.06, 0, 1, 0, [['d', -1.4]], true);
  wall('z', 0.06, z1 - t / 2, 1, 1, 0, [['d', 1.4]], true);
  addDoor(-6, 0, 0, 'plywood', 1, 0, f1); addDoor(5, 0, 0, 'plywood', -1, 0, f1); addDoor(0, -1.4, Math.PI / 2, 'plywood', 1, 0, f1); addDoor(1, 1.4, Math.PI / 2, 'plywood', -1, 0, f1);
  // the roof: a slab and the pitch in steps
  addBox(0, f1 + H, 0, x1 - x0 + 1, 0.2, z1 - z0 + 1, 'crate', 0x4a4440);
  for (let i = 1; i <= 2; i++) addBox(0, f1 + H + 0.2 + (i - 1) * 0.4, 0, x1 - x0 + 1, 0.4, (z1 - z0 + 1) * (1 - i * 0.36), 'crate', 0x4a4440);
  // ---- the front porch: a roof on two posts over the front door, and a skip beside it to climb up from
  addBox(-3, f1 - 0.2, z1 + 1.4, 5, 0.2, 2.6, 'crate', 0x4a4440); for (const px of [-5.3, -0.7]) addBox(px, 0, z1 + 2.55, 0.18, f1 - 0.2, 0.18, 'crate', 0xe8e3d8);
  addBox(-3, 0, z1 + 0.9, 3, 0.15, 1.6, 'concrete', 0x9b978f);
  addBox(-6.6, 0, z1 + 1.9, 2, 1.45, 1.4, 'metal', 0x2e5a3a); addBox(-5.5, 0, z1 + 1.4, 0.1, f1, 2.6, 'crate', 0xe8e3d8);   // (and the porch's side wall, to get a hand on)   // (stand on it, then up onto the porch roof, then in at the window above)
  // ---- furniture: cover inside (and something to plant beside on each site)
  addBox(-6.5, 0, 4.8, 2.2, 0.85, 0.9, 'crate', 0x5b6a7a); addBox(-8.8, 0, 1.4, 0.9, 0.8, 2, 'crate', 0x5b6a7a);   // couches
  addBox(4.5, 0, 4, 1.8, 0.78, 1, 'crate', 0x7a5a3a);   // dining table
  addBox(2.5, 0, -6.4, 4, 0.95, 0.65, 'crate', 0xd8d2c4); addBox(9.35, 0, -4.9, 0.65, 0.95, 2.6, 'crate', 0xd8d2c4); addBox(4.5, 0, -3, 1.8, 0.95, 0.9, 'crate', 0xb8b2a4);   // kitchen counters and island
  addBox(6.5, f1, -5, 2.2, 0.55, 2, 'crate', 0x8a96a8); addBox(9.4, f1, -1.2, 0.6, 1.9, 1.4, 'crate', 0x6a4e34);   // main bedroom
  addBox(-7, f1, 4.6, 2, 0.55, 1.6, 'crate', 0xa8908a); addBox(-2.3, f1, -4, 1.4, 0.75, 0.7, 'crate', 0x6a4e34); addBox(6, f1, 5.8, 2.2, 0.85, 0.9, 'crate', 0x7a6a5a);
  // ---- the two bomb sites
  TOWN.sites = [{ id: 'A', p: new V3(6.5, 0, -3), name: 'A · Kitchen' }, { id: 'B', p: new V3(4.4, f1, -4.2), name: 'B · Main bedroom' }];
  // ---- the lot: fences round the back garden, a shed, a car in the drive, trees, the street
  townFence('x', x0 - 6, x1 + 6, -16, 1.8); townFence('z', -16, 2, x0 - 6, 1.5); townFence('z', -16, 2, x1 + 6, 1.5);
  addBox(10.5, 0, -12.5, 3, 2.3, 2.4, 'crate', 0x7a6650);
  townCar(7, 12.5, 'z', 0x34506e); townCar(-12, 22, 'x', 0x9a9a92); townCar(16, 21.6, 'x', 0x6e2e2e); townCar(-26, -4, 'z', 0x2e2e2e);
  for (const [x, z, k] of [[-13, 11, 1], [13, 9, 0.9], [-14, -11, 1.1], [3, -12, 0.9], [20, -6, 1], [-34, 8, 1], [30, 10, 1]]) townTree(x, z, k);
  for (const [x, z] of [[-17, 30], [12, 32], [-30, 26], [30, 30]]) addBox(x, 0, z, 2.6, 1.2, 1.2, 'concrete', 0x8a867e);   // planters across the street
  // ---- spawns
  TOWN.def = [new V3(-6, 0, 2.5), new V3(4, 0, 1.8), new V3(-6.5, 0, -3), new V3(1, 0, -4), new V3(-5, f1, 3), new V3(4.5, f1, 2.5), new V3(-4, f1, -3), new V3(4.5, f1, -2)];
  TOWN.atk = [new V3(-8, 0, 34), new V3(-3, 0, 35), new V3(3, 0, 34), new V3(8, 0, 35), new V3(-36, 0, -10), new V3(-36, 0, -4), new V3(-36, 0, 2), new V3(-36, 0, -16)];
  spawns = TOWN.atk.concat(TOWN.def);
}

// ---- module exports: build.mjs strips this block ----
export { TOWN, buildTown };
// ---- end module exports ----
