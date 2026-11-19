// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3 } from './00-setup.js';
import { addBox, addGround, canvasTex, clearWorld, spawns, worldGroup, worldMeshes } from './01-world.js';
import { DOOR_FW, DOOR_H, DOOR_W, addDoor } from './15b-doors.js';
// ---- end module links ----
// ---------------------------------------------------------------- the multiplayer map: a suburban street
// One street of single-storey houses (wood-framed siding walls a round goes through, a brick one now and then), front lawns,
// driveways, fences between the back gardens, parked cars and trees. The defenders' house is the big one at the north end of
// the cross street; the attackers come in from the far (south) end of town.
// x runs east, z south. The main street runs east-west at z = 0, the cross street north-south at x = 0.
const TOWN = { def: [], atk: [], half: 58 };
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
function townWall(ax, a, b, c, H, t, kind, color, holes) {
  holes = (holes || []).slice().sort((p, q) => p[0] - q[0]);
  const box = (u0, u1, y0, y1) => { if (u1 - u0 < 0.02 || y1 - y0 < 0.02) return; const u = (u0 + u1) / 2, L = u1 - u0; if (ax === 'x') addBox(u, y0, c, L, y1 - y0, t, kind, color); else addBox(c, y0, u, t, y1 - y0, L, kind, color); };
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
function buildTown() {
  clearWorld();
  // the ground: grass, with the streets, pavements, drives and paths laid over it
  addGround(180, 'ground'); { const g = worldMeshes[worldMeshes.length - 1], t = TOWN_TEX.grass.clone(); t.needsUpdate = true; t.repeat.set(60, 60); g.material.map.dispose(); g.material.map = t; }
  const H = TOWN.half;
  townFlat(0, 0, 2 * H, 8, 'asphalt', 6, 0.003); townFlat(0, -13, 8, 26, 'asphalt', 6, 0.0032); townFlat(0, 26, 8, 52, 'asphalt', 6, 0.0032);
  for (const s of [-1, 1]) { townFlat(0, s * 5.2, 2 * H, 2.4, 'pave', 1.2, 0.005); townFlat(s * 5.2, -13, 2.4, 26, 'pave', 1.2, 0.0052); townFlat(s * 5.2, 26, 2.4, 52, 'pave', 1.2, 0.0052); }
  // the edge of town: tall hedges all round
  for (const s of [-1, 1]) { addBox(0, 0, s * H, 2 * H + 2, 3.2, 1.6, 'concrete', 0x3c5a2c); addBox(s * H, 0, 0, 1.6, 3.2, 2 * H, 'concrete', 0x3c5a2c); }
  // ---- the defenders' house, at the top of the cross street: a long brick ranch house, front door on the street side
  // (south), back door and a side door, rooms off a hall
  { const x0 = -9, x1 = 9, z0 = -40, z1 = -28;
    townHouse(x0, z0, x1, z1, { brick: true, color: 0x9a5a48, roof: 0x3b3735, floor: 0xa98d6c, walls: {
      s: [['w', -7], ['w', -4], ['d', 0, 'metal', 1, 0], ['w', 4], ['w', 7]],
      n: [['w', -6.5], ['d', -2, 'plywood', -1, 0], ['w', 2.5], ['w', 6.5]],
      w: [['w', -36], ['w', -31.5]],
      e: [['d', -36.5, 'plywood', 1, 0], ['w', -30.5]] },
      // a hall across the middle (z = -34) with doors into the rooms, the living room (south-west), kitchen (south-east),
      // two bedrooms (north)
      inner: [['x', x0, x1, -34, [-5, 5, 0]], ['z', -34, z1, -2, [-31]], ['z', z0, -34, 3, [-37]]],
      innerDoors: [[-5, -34, 0, 'plywood', 1], [5, -34, 0, 'plywood', -1]] });
    // cover inside: a couch, a table, a kitchen counter, beds
    addBox(-6.5, 0, -30.2, 2.2, 0.8, 0.9, 'crate', 0x5b6a7a); addBox(-5.5, 0, -32.3, 1.4, 0.75, 0.9, 'crate', 0x7a5a3a);
    addBox(6, 0, -28.9, 5, 0.95, 0.65, 'crate', 0xd8d2c4); addBox(5.5, 0, -31.5, 1.6, 0.78, 1, 'crate', 0x7a5a3a);
    addBox(-6.5, 0, -38.6, 2, 0.55, 1.6, 'crate', 0x8a96a8); addBox(6.2, 0, -38.6, 2, 0.55, 1.6, 'crate', 0xa8908a); addBox(-0.5, 0, -39.4, 1.2, 1.9, 0.5, 'crate', 0x6a4e34);
    // the garden: front lawn with a path, a low fence round the back
    townFlat(0, -25.5, 1.4, 5, 'pave', 1.2, 0.005);
    townFence('x', -16, -9.5, -40.2, 1.5); townFence('x', 9.5, 16, -40.2, 1.5); townFence('x', -16, 16, -47, 1.8); townFence('z', -47, -40.2, -16, 1.8); townFence('z', -47, -40.2, 16, 1.8);
    townCar(5.5, -24, 'z', 0x6a7a8c); townTree(-12, -24); townTree(12.5, -45);
    TOWN.def = [new V3(-6, 0, -36.5), new V3(6, 0, -36.5), new V3(-6.5, 0, -31.3), new V3(6.5, 0, -32.5), new V3(0, 0, -33.2), new V3(-2, 0, -38.5)];
  }
  // ---- the street: houses facing the main street on both sides, and along the cross street
  const homes = [
    // [x0, z0, x1, z1, front side, colour, brick]
    [-28, -20, -16, -10, 's', 0xc9d4dc], [16, -20, 28, -10, 's', 0xe2d6a8], [-46, -20, -34, -10, 's', 0xd6c3b0, true], [34, -20, 46, -10, 's', 0xb8c9b2],
    [-28, 10, -16, 20, 'n', 0xe6e0d2], [16, 10, 28, 20, 'n', 0xa9b8c8], [-46, 10, -34, 20, 'n', 0xb07a5e, true], [34, 10, 46, 20, 'n', 0xe0c8c8],
    [-20, 26, -10, 36, 'e', 0xd8d8c8], [10, 26, 20, 36, 'w', 0xc8d0a8]
  ];
  for (const [x0, z0, x1, z1, f, col, brick] of homes) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, walls = { n: [['w', cx - 3], ['w', cx + 3]], s: [['w', cx - 3], ['w', cx + 3]], w: [['w', cz]], e: [['w', cz]] };
    // the front door on the street side, a back door opposite
    if (f === 's' || f === 'n') { walls[f] = [['w', cx - 3.5], ['d', cx, 'plywood', 1, 0], ['w', cx + 3.5]]; walls[f === 's' ? 'n' : 's'] = [['d', cx - 2.5, 'plywood', -1, 0], ['w', cx + 2.5]]; }
    else { walls[f] = [['w', cz - 2.8], ['d', cz, 'plywood', 1, 0], ['w', cz + 2.8]]; walls[f === 'e' ? 'w' : 'e'] = [['d', cz + 2, 'plywood', 1, 0]]; }
    const ri = f === 's' || f === 'n' ? [['z', z0, z1, cx + 1.5, [cz + (f === 's' ? 2.4 : -2.4)]]] : [['x', x0, x1, cz - 1, [cx]]];
    townHouse(x0, z0, x1, z1, { color: col, brick, walls, inner: ri, roof: brick ? 0x3f3a36 : 0x575049 });
    // a drive and a car in it, a path to the door, a tree on the lawn
    if (f === 's' || f === 'n') {
      const zs = f === 's' ? z1 : z0, zr = f === 's' ? 4 : -4, dx = x1 - 2;
      townFlat(dx, zs + (f === 's' ? 2.1 : -2.1), 3, 4.2, 'pave', 1.5, 0.005); townFlat(cx, zs + (f === 's' ? 2.1 : -2.1), 1.2, 4.2, 'pave', 1.2, 0.0055);
      if ((x0 + z0) % 3 !== 0) townCar(dx, zs + (f === 's' ? 2.4 : -2.4), 'z', [0x8c2a2a, 0x2a4a6c, 0xb8b8b0, 0x262626, 0x5a6a3a][Math.abs(x0) % 5]);
      townTree(x0 + 2, zs + zr * 0.7);
      // back garden fences
      const zb = f === 's' ? z0 : z1, zf = f === 's' ? z0 - 6 : z1 + 6;
      townFence('x', x0 - 3, x1 + 3, zf); townFence('z', Math.min(zb, zf), Math.max(zb, zf), x0 - 3); townFence('z', Math.min(zb, zf), Math.max(zb, zf), x1 + 3);
    } else townTree(f === 'e' ? x1 + 3 : x0 - 3, cz + 4);
  }
  // cars along the street, a few trees on the verges, bins and a mailbox or two
  townCar(-10, 2.4, 'x', 0x34506e); townCar(24, -2.4, 'x', 0x9a9a92); townCar(-38, -2.4, 'x', 0x6e2e2e); townCar(2.4, 14, 'z', 0x2e2e2e); townCar(-2.4, -14, 'z', 0x7a6a3a);
  for (const [x, z] of [[-8, 7.5], [8, -7.5], [-30, 7.5], [30, -7.5], [44, 7.5], [-44, -7.5], [7.5, 40], [-7.5, 22]]) townTree(x, z, 0.9);
  for (const [x, z] of [[-14, 6.6], [14, -6.6], [-32, -6.6], [32, 6.6]]) { addBox(x, 0, z, 0.6, 1.05, 0.6, 'metal', 0x2e4a2e); }
  // where the attackers come in: the south end of the cross street, behind a bus shelter and a van
  addBox(-5, 0, 47, 3.5, 2.4, 0.08, 'metal', 0x6a7a80); townCar(4, 46, 'x', 0xe8e8e0); addBox(4, 1.5, 46, 3.6, 0.8, 1.7, 'metal', 0xe8e8e0);
  TOWN.atk = [new V3(-8, 0, 52), new V3(-3, 0, 53), new V3(2, 0, 52), new V3(7, 0, 53), new V3(-12, 0, 50), new V3(12, 0, 50)];
  spawns = TOWN.atk.concat(TOWN.def);
}

// ---- module exports: build.mjs strips this block ----
export { TOWN, buildTown };
// ---- end module exports ----
