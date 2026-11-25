// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera } from './00-setup.js';
import { addBox, spawns, worldMeshes } from './01-world.js';
import { TOWN, buildTown, doorHole, townFlat, townTree, townWall, winHole } from './01b-town.js';
import { Kit, MT, TEXD, tdArmchair, tdArt, tdBed, tdBookcase, tdCar, tdClock, tdCoffeeTable, tdDresser, tdFloorLamp, tdFridge, tdKitchenRun, tdMat, tdMediaUnit, tdNightstand, tdPanel, tdPlant, tdRoundTable, tdRug, tdSofa, tdToilet, tdTub, tdVanity, tdWardrobe } from './01c-town-detail.js';
import { WEAPONS } from './06-weapons.js';
import { fx } from './11-fx.js';
import { addDoor } from './15b-doors.js';
import { P, S, dummies, keys } from './17-dummies.js';
import { flashMsg, respawnLocal } from './18-player.js';
import { explode } from './19b-explosives.js';
import { items } from './21-items-inventory.js';
import { enterGame, leave } from './22-menu-loop.js';
import { boardWindow } from './23-siege.js';
import { ENV } from './24-env.js';
import { loadoutUI } from './28-match.js';
import { deploy } from './31-menu.js';
import { AIBot, AI_PAL, aiLoadout } from './32-ai.js';
import { menuWarStop } from './33-menu-war.js';
import { mdRemove, missionDecor } from './34b-mission-decor.js';
// ---- end module links ----
// Mission mode. Mission 1, "Clear the Neighbourhood": the suburb round the house, three times the size of the siege map, with
// a dozen more houses (each its own layout) and a militia holding the lot: barricades and burnt-out cars across the streets,
// sandbag walls, machine-gun nests, sniper towers over the roads, men in the houses. You come in from the east end of the
// main street on your own; the mission is won when every one of them is down. No bombs. Its edge is an invisible wall; the
// houses and woods go on past it. (The siege map's house stays as it was: this is built only for the mission.)

const MIS = { n: 0, bots: [], done: false, failT: 0, cleared: false, start: null };
const MILITIA_PAL = [
  { shirt: 0x4f5a3a, vest: 0x3d4530, vest2: 0x2e3326, pack: 0x463e2e, helmet: 0x3e4632 },
  { shirt: 0x6a5c44, vest: 0x4a4232, vest2: 0x3a3428, pack: 0x544632, helmet: 0x4a4032 },
  { shirt: 0x3c3f44, vest: 0x2c2e30, vest2: 0x222426, pack: 0x34302a, helmet: 0x2a2c2e }
];
// ---- a militia man: one of the game's bots, kept to his post (a room, a tower top, a nest), in the militia's mixed kit
class MilitiaBot extends AIBot {
  constructor(p, o) {
    const keep = Object.assign({}, AI_PAL); Object.assign(AI_PAL, MILITIA_PAL[(o.pal || 0) % MILITIA_PAL.length]);
    try { super(p, o); } finally { Object.assign(AI_PAL, keep); }
    this.mg = !!o.mg; this.sniper = !!o.sniper; this.militia = true;
    if (this.mg) this.mag = 100;
  }
  update(dt) {
    // (the machine gun runs off a belt: a hundred rounds, a long change)
    if (this.mg && !this.dead && this.reloadT <= 0 && this.mag === WEAPONS[this.w].cap) this.mag = 100;
    if (this.mg && this.reloadT > 0 && this.reloadT < 2.6 && !this.mgSlow) { this.reloadT += 3; this.mgSlow = true; } else if (this.reloadT <= 0) this.mgSlow = false;
    super.update(dt);
  }
  // (for the first seconds after you are in, out of the loadout, nobody has spotted you yet)
  perceive(dt) { if (S.mission && MIS.grace > 0) return; super.perceive(dt); }
}

// ---- the houses: one storey, each laid out from its own seed (two or three bays across, one of them split front to back),
// furnished room by room, a gable roof over the lot. front: which long side faces its street ('n' toward -z, 's' toward +z)
const _mr = s => () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
function missionHouse(cx, cz, w, d, front, seed, col) {
  const R = _mr(seed * 7919 + 13), H = 2.75, t = 0.16, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const fz = front === 'n' ? z0 : z1, bz = front === 'n' ? z1 : z0;
  // the bays across the house
  const nb = w > 13 ? 3 : 2, cuts = [x0]; for (let i = 1; i < nb; i++) cuts.push(x0 + w * i / nb + (R() - 0.5) * 1.2); cuts.push(x1);
  const split = Math.floor(R() * nb), zm = cz + (R() - 0.5) * 1.6;
  const rooms = [], inner = [];
  for (let i = 0; i < nb; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (i > 0) inner.push(['z', z0 + 0.06, z1 - 0.06, a, [cz + (R() - 0.5) * (d - 3)]]);
    if (i === split) { inner.push(['x', a + 0.06, b - 0.06, zm, [(a + b) / 2 + (R() - 0.5) * (b - a - 2.2)]]); rooms.push({ x0: a, x1: b, z0, z1: zm }, { x0: a, x1: b, z0: zm, z1 }); }
    else rooms.push({ x0: a, x1: b, z0, z1 });
  }
  // the outside: the front door in one bay, the back door in another, windows in the rest of each wall
  const fb = Math.floor(R() * nb), bb = (fb + 1 + Math.floor(R() * (nb - 1))) % nb, fd = (cuts[fb] + cuts[fb + 1]) / 2, bd = (cuts[bb] + cuts[bb + 1]) / 2;
  const items = { front: [['d', fd]], back: [['d', bd]], w: [], e: [] };
  for (let i = 0; i < nb; i++) { const u = (cuts[i] + cuts[i + 1]) / 2; if (i !== fb) items.front.push(['w', u, 1.2]); if (i !== bb) items.back.push(['w', u, 1.2]); }
  items.w.push(['w', cz, 1.0]); items.e.push(['w', cz, 1.0]);
  const holes = L => L.map(e => e[0] === 'd' ? doorHole(e[1]) : winHole(e[1], e[2]));
  const wallX = (c, L) => { townWall('x', x0 - t / 2, x1 + t / 2, c, H, t, 'drywall', col, holes(L)); for (const e of L) if (e[0] === 'w') { const i = TOWN.windows.length; TOWN.windows.push({ p: new V3(e[1], 1.5, c), ax: 'x', w: e[2], y0: 0.95, y1: 2.05, t, boarded: false }); if (R() < 0.5) boardWindow(i); } };
  const wallZ = (c, L) => { townWall('z', z0 + t / 2, z1 - t / 2, c, H, t, 'drywall', col, holes(L)); for (const e of L) if (e[0] === 'w') { const i = TOWN.windows.length; TOWN.windows.push({ p: new V3(c, 1.5, e[1]), ax: 'z', w: e[2], y0: 0.95, y1: 2.05, t, boarded: false }); if (R() < 0.5) boardWindow(i); } };
  wallX(fz, items.front); wallX(bz, items.back); wallZ(x0, items.w); wallZ(x1, items.e);
  addDoor(fd, fz, 0, 'plywood', 1, 0); addDoor(bd, bz, 0, 'plywood', 1, 0);
  for (const [ax, a, b, c, hs] of inner) { townWall(ax, a, b, c, H, 0.1, 'drywall', 0xe8e3d8, hs.map(u => doorHole(u))); for (const u of hs) addDoor(ax === 'x' ? u : c, ax === 'x' ? c : u, ax === 'x' ? 0 : Math.PI / 2, 'plywood', 1, 0); }
  // floor, ceiling (solid), and over it a pitched roof to look at
  townFlat(cx, cz, w, d, 'pave', 1.2, 0.004, [0xb59b78, 0x9a8468, 0xc4b096][seed % 3]);
  addBox(cx, H, cz, w + 0.9, 0.18, d + 0.9, 'crate', 0x4a4440);
  { const K = new Kit(), half = d / 2 + 0.45, S = 0.5, L = half / Math.cos(Math.atan(S)), SV = tdMat('sidingVC', { map: TEXD.siding(), vertexColors: true, roughness: 0.8 });
    for (const sd of [-1, 1]) K.add(MT.shingle, new THREE.BoxGeometry(w + 0.9, 0.09, L + 0.06), 0, H + 0.18 + half * S / 2, sd * half / 2, { rx: sd * Math.atan(S), uv: [w / 1.6, L / 1.6] });
    K.box(MT.trim, 0, H + 0.18 + half * S - 0.03, 0, w + 0.92, 0.09, 0.18);
    for (const lx of [-w / 2 - 0.002, w / 2 + 0.002]) tdPanel(K, SV, [[-d / 2, H + 0.18], [d / 2, H + 0.18], [0, H + 0.18 + (d / 2) * S]], lx, null, 0.92);
    // the front: a step and a little porch roof over the door, a lantern, trim round the windows
    const fs = front === 'n' ? -1 : 1, lz = fs * d / 2;
    K.box(MT.conc, fd - cx, 0, lz + fs * 0.6, 2.2, 0.18, 1.2);
    K.add(MT.shingle, new THREE.BoxGeometry(2.2, 0.07, 1.3), fd - cx, 2.55, lz + fs * 0.65, { rx: fs * 0.25 });
    K.box(MT.black, fd - cx - 0.8, 1.6, lz + fs * 0.06, 0.14, 0.26, 0.1);
    for (const e of items.front) if (e[0] === 'w') { K.box(MT.trim, e[1] - cx, 0.87, lz + fs * 0.1, 1.42, 0.06, 0.12); K.box(MT.trim, e[1] - cx, 2.05, lz + fs * 0.1, 1.42, 0.08, 0.05); }
    K.build(cx, 0, cz, 0, { shadow: true, deco: false }); }
  // the rooms: whatever fits them, against a wall with no doorway in it
  const doorsAt = [[fd, fz], [bd, bz]].concat(inner.flatMap(([ax, a, b, c, hs]) => hs.map(u => ax === 'x' ? [u, c] : [c, u])));
  const clear = (ax, c, a, b) => !doorsAt.some(([x, z]) => ax === 'x' ? Math.abs(z - c) < 0.3 && x > a - 1 && x < b + 1 : Math.abs(x - c) < 0.3 && z > a - 1 && z < b + 1);
  const kinds = ['living', 'kitchen', 'bed', 'bed', 'bath'];
  rooms.forEach((r, i) => {
    const kind = i === 0 ? 'living' : i === 1 ? 'kitchen' : (r.x1 - r.x0) * (r.z1 - r.z0) < 14 ? 'bath' : kinds[2 + (i % 2)];
    const rw = r.x1 - r.x0, rd = r.z1 - r.z0, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    // (which wall: the first of the four with no door and room enough)
    const walls = [['x', r.z0 + 0.1, 0, rw], ['x', r.z1 - 0.1, Math.PI, rw], ['z', r.x0 + 0.1, -Math.PI / 2, rd], ['z', r.x1 - 0.1, Math.PI / 2, rd]].filter(([ax, c, rot, len]) => len > 2.6 && clear(ax, c, ax === 'x' ? r.x0 : r.z0, ax === 'x' ? r.x1 : r.z1));
    if (!walls.length) return; const [ax, c, rot, len] = walls[0];
    const at = (depth, along) => ax === 'x' ? [mx + (along || 0), c + (rot === 0 ? 1 : -1) * depth] : [c + (rot === -Math.PI / 2 ? 1 : -1) * depth, mz + (along || 0)];
    try {
      if (kind === 'living') { const [a1, b1] = at(0.5); tdSofa(a1, 0, b1, rot, Math.min(2.2, len - 0.8), [0x5a6a7a, 0x7a5a4a, 0x4a5a4a][seed % 3]); const [a2, b2] = at(1.6); tdCoffeeTable(a2, 0, b2, rot, 1.1, 0.6); tdRug(a2, 0, b2, 2.4, 1.8, seed % 3, rot); }
      else if (kind === 'kitchen') { const [a1, b1] = at(0.32); tdKitchenRun(a1, 0, b1, rot, Math.min(3, len - 1)); const [a2, b2] = at(Math.min(2.2, (ax === 'x' ? rd : rw) / 2)); tdRoundTable(a2, 0, b2, 0.5); }
      else if (kind === 'bed') { const [a1, b1] = at(1.05); tdBed(a1, 0, b1, rot, 1.5, 2.0); const [a2, b2] = at(0.25, len / 2 - 0.5 > 1.4 ? 1.3 : -1.3); tdNightstand(a2, 0, b2, rot, true); }
      else { const [a1, b1] = at(0.35, -0.6); tdToilet(a1, 0, b1, rot); const [a2, b2] = at(0.3, 0.6); tdVanity(a2, 0, b2, rot, 0.8, true); }
    } catch (e) {}
    // more of it: the other free wall, the corners, pictures on the walls, a rug, a plant; in the rooms the militia hold, their kit
    const W2 = walls[1], at2 = (depth, along) => !W2 ? null : W2[0] === 'x' ? [mx + (along || 0), W2[1] + (W2[2] === 0 ? 1 : -1) * depth] : [W2[1] + (W2[2] === -Math.PI / 2 ? 1 : -1) * depth, mz + (along || 0)];
    const cn = [[r.x0 + 0.45, r.z0 + 0.45], [r.x1 - 0.45, r.z0 + 0.45], [r.x0 + 0.45, r.z1 - 0.45], [r.x1 - 0.45, r.z1 - 0.45]].filter(([x, z]) => !doorsAt.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 1.3));
    const art = k => { const [a, b] = at(0.0); tdArt(a, 1.75, b, rot, Math.min(1.0, len * 0.3), 0.7, k); };
    try {
      if (kind === 'living') { if (W2) { const [a, b] = at2(0.3); tdMediaUnit(a, 0, b, W2[2], Math.min(1.8, W2[3] - 1)); const [c2, d2] = at2(1.9, W2[3] > 3.4 ? 1.1 : 0); tdArmchair(c2, 0, d2, W2[2] + Math.PI, [0x6a5a4a, 0x3a4a5a][seed % 2]); }
        art(seed % 6); if (cn[0]) tdFloorLamp(cn[0][0], 0, cn[0][1]); if (cn[1]) tdPlant(cn[1][0], 0, cn[1][1], 1.2, seed % 2); if (cn[2] && rw * rd > 16) tdBookcase(cn[2][0], 0, cn[2][1], rot, 0.8, 1.9); }
      else if (kind === 'kitchen') { if (W2) { const [a, b] = at2(0.36, W2[3] / 2 - 0.5); tdFridge(a, 0, b, W2[2]); } if (cn[0]) tdPlant(cn[0][0], 0, cn[0][1], 0.8, 1); tdClock(...(([a, b]) => [a, 1.9, b])(at(0.0, len / 2 - 0.4)), rot); }
      else if (kind === 'bed') { art((seed + i) % 6); if (W2) { const [a, b] = at2(0.32); tdWardrobe(a, 0, b, W2[2], Math.min(1.4, W2[3] - 1.2)); }
        else if (cn[1]) tdDresser(cn[1][0], 0, cn[1][1], rot, 1.0, true); const [a3, b3] = at(1.05); tdRug(a3, 0, b3, 2.2, 1.6, (seed + i) % 3, rot); }
      else if (W2) { const [a, b] = at2(0.4); tdTub(a, 0, b, W2[2], Math.min(1.6, W2[3] - 0.4), 0.75); }
    } catch (e) {}
    r.kind = kind;
  });
  // (in the garden: a tree, some of them a car on the drive)
  townTree(cx + (R() < 0.5 ? -1 : 1) * (w / 2 + 3), cz + (front === 'n' ? -1 : 1) * (d / 2 + 5), 1.1 + R() * 0.3);
  return { x0, x1, z0, z1, rooms, fd, fz, cx, cz };
}

// ---- the militia's works
// a wall of sandbags: a solid you can't see through (the bags drawn over it), chest high or knee high
function sandbags(x, z, len, along, h) {
  h = h || 1.1; const w = along === 'x' ? len : 0.6, d = along === 'x' ? 0.6 : len;
  addBox(x, 0, z, w, h, d, 'concrete', 0x8a7a5a); const m = worldMeshes[worldMeshes.length - 1]; m.material.visible = false; m.userData.furn = true;
  const K = new Kit(), bag = tdMat('sandbag', { color: 0x9a8a62, roughness: 1 }), bag2 = tdMat('sandbag2', { color: 0x857652, roughness: 1 }), rows = Math.round(h / 0.16), n = Math.max(1, Math.round(len / 0.55));
  for (let r = 0; r < rows; r++) for (let i = 0; i < n + (r % 2 ? 0 : 0); i++) { const u = -len / 2 + (i + 0.5 + (r % 2) * 0.5) * len / (n + 0.5);
    for (const s of [-0.15, 0.15]) K.rbox((r + i) % 3 ? bag : bag2, along === 'x' ? u : s, r * 0.16, along === 'x' ? s : u, along === 'x' ? 0.54 : 0.28, 0.17, along === 'x' ? 0.28 : 0.54, 0.07); }
  K.build(x, 0, z, 0, { shadow: true, deco: false });
}
// a concrete barrier, the jersey kind
function jersey(x, z, along) { addBox(x, 0, z, along === 'x' ? 3 : 0.7, 0.9, along === 'x' ? 0.7 : 3, 'concrete', 0x9a968c); }
// a car that burned: black and rust, on its rims
function wreck(x, z, along) { tdCar(x, z, along, 0x2a221c); }
// a stack of tyres
function tyres(x, z) { const K = new Kit(); for (let i = 0; i < 4; i++) K.add(MT.black, new THREE.TorusGeometry(0.3, 0.12, 8, 16), 0, 0.12 + i * 0.22, 0, { rx: Math.PI / 2 }); K.build(x, 0, z, 0, { shadow: true, deco: false }); addBox(x, 0, z, 0.8, 0.9, 0.8, 'crate', 0x222222); worldMeshes[worldMeshes.length - 1].material.visible = false; }
// a sniper tower: four posts, a platform 5 m up behind a breast-high plank wall, a tin roof, a ladder up one side
function tower(x, z) {
  const P = 5, S = 3.2, K = new Kit(), wood = MT.oak;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { addBox(x + a * (S / 2 - 0.12), 0, z + b * (S / 2 - 0.12), 0.24, P + 2.6, 0.24, 'crate', 0x6a5238); }
  addBox(x, P, z, S, 0.16, S, 'crate', 0x7a6040);
  for (const s of [-1, 1]) { addBox(x, P + 0.16, z + s * (S / 2 - 0.04), S, 1.05, 0.08, 'plywood', 0x7a6040); addBox(x + s * (S / 2 - 0.04), P + 0.16, z, 0.08, 1.05, S - 0.16, 'plywood', 0x7a6040); }
  for (let i = 0; i < 4; i++) { const y = 0.9 + i * 1.1; K.rod(wood, new V3(-S / 2 + 0.12, y, -S / 2 + 0.12), new V3(S / 2 - 0.12, y + 0.8, -S / 2 + 0.12), 0.04); K.rod(wood, new V3(-S / 2 + 0.12, y, S / 2 - 0.12), new V3(S / 2 - 0.12, y + 0.8, S / 2 - 0.12), 0.04); }
  K.add(tdMat('tin', { color: 0x7a7c78, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }), new THREE.BoxGeometry(S + 0.6, 0.04, S + 0.6), 0, P + 2.6, 0, { rx: 0.08 });
  for (let i = 0; i < 16; i++) K.box(wood, S / 2 + 0.25, 0.3 * i + 0.2, 0, 0.06, 0.05, 0.5);
  for (const s of [-0.25, 0.25]) K.rod(wood, new V3(S / 2 + 0.25, 0, s), new V3(S / 2 + 0.25, P + 1, s), 0.035);
  K.build(x, 0, z, 0, { shadow: true, deco: false });
  return new V3(x, P + 0.16, z);
}
// a machine gun on its tripod behind a horseshoe of sandbags, pointing along ry
function mgNest(x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const [fx, fz] = at(0, -1.0), [lx, lz] = at(-1.0, -0.3), [rx, rz] = at(1.0, -0.3);
  const across = Math.abs(Math.sin(ry)) < 0.5 ? 'x' : 'z', side = across === 'x' ? 'z' : 'x';
  sandbags(fx, fz, 2.4, across, 1.0); sandbags(lx, lz, 1.4, side, 1.0); sandbags(rx, rz, 1.4, side, 1.0);
  const K = new Kit(), gun = tdMat('mgsteel', { color: 0x2a2c2e, metalness: 0.6, roughness: 0.4 });
  K.rod(gun, new V3(0, 1.08, 0.1), new V3(0, 1.08, -0.95), 0.035); K.box(gun, 0, 1.0, 0.0, 0.12, 0.16, 0.5); K.box(gun, 0.1, 0.96, -0.05, 0.12, 0.14, 0.16);
  for (const a of [0, 2.1, 4.2]) K.rod(gun, new V3(0, 1.0, -0.2), new V3(Math.sin(a) * 0.55, 0, -0.2 + Math.cos(a) * 0.55), 0.02);
  K.build(x, 0, z, ry, { shadow: true, deco: false });
  return new V3(x + Math.sin(ry) * 0.25, 0, z + Math.cos(ry) * 0.25);
}

// ---- the neighbourhood: built into the siege map's town (01b buildTown) when it is made for the mission
const MIS_HOUSES = [
  [-105, 46, 'n'], [-62, 46, 'n'], [48, 46, 'n'], [88, 46, 'n'], [121, 46, 'n'],
  [-105, -52, 'n'], [-62, -52, 'n'], [40, -52, 'n'], [86, -52, 'n'],
  [-82, -94, 's'], [-28, -94, 's'], [30, -94, 's'], [92, -94, 's']
];
function missionWorld(E) {
  // the streets: the main one runs the width already; a back street behind the gardens, the side road on to it, pavements
  townFlat(0, -72, 2 * E, 8, 'asphalt', 6, 0.003); townFlat(0, -66.8, 2 * E, 2.4, 'pave', 1.2, 0.005); townFlat(0, -77.2, 2 * E, 2.4, 'pave', 1.2, 0.005);
  townFlat(0, 27.2, 2 * E, 2.4, 'pave', 1.2, 0.005);
  MIS.houses = MIS_HOUSES.map(([x, z, f], i) => { const w = 12 + (i * 7 % 4), d = 9 + (i * 5 % 3); return missionHouse(x, z, w, d, f, i + 1, [0xd9cfbd, 0xa8b8c4, 0xe6d8a8, 0xc8a090, 0xb8c4a8, 0xc4b0a0][i % 6]); });
  // drives and parked (and burnt) cars, trees along the streets
  for (const [x, z, al, c] of [[70, 19.4, 'x', 0x5a5f66], [-80, 24.6, 'x', 0x34506e], [100, 24.6, 'x', 0xd9d6cc], [-50, -69.4, 'x', 0x6e2e2e], [60, -74.6, 'x', 0x2f4a3a], [-110, -74.6, 'x', 0x9a9a92]]) tdCar(x, z, al, c);
  for (const [x, z] of [[-120, 30], [-84, 31], [-40, 31], [64, 31], [104, 31], [-120, -60], [-84, -62], [14, -62], [64, -62], [110, -62], [-54, -84], [0, -84], [60, -84], [118, -84]]) townTree(x, z, 1.1 + Math.abs(Math.sin(x * z)) * 0.3, Math.round(Math.abs(x + z)) % 3);
  // the militia's line across the main street toward the east (where you come in), another to the west, one on the back street
  for (const z of [18.8, 22, 25.2]) jersey(58, z, 'z'); wreck(62, 24.4, 'x'); tyres(56, 19.2); tyres(56, 26);
  for (const z of [19, 25]) jersey(-56, z, 'z'); wreck(-60, 21.6, 'x'); sandbags(-52, 17.6, 3.6, 'z', 1.1);
  for (const x of [-6, 0, 6]) jersey(x, -72, 'x'); wreck(12, -71, 'z'); sandbags(-12, -67.5, 3.2, 'x', 1.1);
  sandbags(30, 20, 3.2, 'z', 1.1); sandbags(-24, 30, 3.2, 'x', 1.1); sandbags(40, 31, 2.8, 'x', 1.0); sandbags(-40, 17.6, 2.8, 'x', 1.0);
  // the nests and the towers
  MIS.nests = [mgNest(51, 22, Math.PI / 2), mgNest(-49, 22, -Math.PI / 2), mgNest(-4, -66.6, Math.PI)];
  MIS.towers = [tower(34, 38), tower(-40, 36.5), tower(72, -64), tower(-70, -80)];
  // and everything else a lived-in street has, the militia's leavings on top (34b)
  missionDecor(E);
}
// ---- the men: where each one is posted, stretch by stretch along the way through (st: which objective's stretch).
// Only the houses on the way are held; the rest of the street stands empty behind the walls
function missionBots() {
  const out = []; let k = 0;
  const night = typeof ENV !== 'undefined' && (ENV.tod < 6.5 || ENV.tod > 19);
  const add = MIS.addBot = (p, o) => { const b = new MilitiaBot(p, Object.assign({ pal: k++, post: p.clone() }, o)); b.st = o.st; dummies.push(b); out.push(b); return b; };
  const st = (n, x, z, w, o) => add(new V3(x, 0, z), Object.assign({ st: n, w, zone: 3, lo: aiLoadout(k, night, w) }, o || {}));
  // 1, the main street: the gun at the barricade, men behind the cars and in the gardens, the marksman on the tower over it
  { const n = MIS.nests[0], b = add(n.clone().setY(0), { st: 0, w: 3, mg: true, zone: 0.4, area: { x0: n.x - 0.8, x1: n.x + 0.8, z0: n.z - 0.8, z1: n.z + 0.8 }, lo: aiLoadout(0, night, 3) }); b.stance = 1; }
  for (const [x, z, w] of [[55.5, 21, 0], [54.8, 26.2, 3], [76, 26, 0], [92, 18.4, 5], [68, 30.6, 0], [84, 13.4, 3]]) st(0, x, z, w);
  { const t = MIS.towers[0]; add(t.clone(), { st: 0, w: 2, sniper: true, side: true, zone: 0.6, area: { x0: t.x - 1.3, x1: t.x + 1.3, z0: t.z - 1.3, z1: t.z + 1.3 }, lo: aiLoadout(0, night, 2) }); }
  // 2, the radio house: three inside
  { const h = MIS.houses[2], area = { x0: h.x0 + 0.3, x1: h.x1 - 0.3, z0: h.z0 + 0.3, z1: h.z1 - 0.3 };
    h.rooms.forEach((r, j) => { if (j < 3) add(new V3((r.x0 + r.x1) / 2 + 0.4, 0, (r.z0 + r.z1) / 2), { st: 1, w: [0, 5, 3][j], zone: 4, area, lo: aiLoadout(j, night, [0, 5, 3][j]) }); }); }
  // 3, the gardens down to the back street, the marksman on the tower past the fence
  for (const [x, z, w] of [[56, -14, 0], [51, -33, 5], [59, -50, 0]]) st(2, x, z, w);
  { const t = MIS.towers[2]; add(t.clone(), { st: 2, w: 2, sniper: true, side: true, zone: 0.6, area: { x0: t.x - 1.3, x1: t.x + 1.3, z0: t.z - 1.3, z1: t.z + 1.3 }, lo: aiLoadout(0, night, 2) }); }
  // 4, the back street: the gun, men at the barricade and guarding the cache
  { const n = MIS.nests[2], b = add(n.clone().setY(0), { st: 3, w: 3, mg: true, zone: 0.4, area: { x0: n.x - 0.8, x1: n.x + 0.8, z0: n.z - 0.8, z1: n.z + 0.8 }, lo: aiLoadout(0, night, 3) }); b.stance = 1; }
  for (const [x, z, w] of [[2, -68.6, 0], [-12, -66.2, 3], [24, -75.5, 5], [36, -69.5, 0], [-9, -76, 0]]) st(3, x, z, w);
  // 5, the headquarters: two in the back garden, four in the house, the commander upstairs
  for (const [x, z, w] of [[-9, -30, 0], [11, -24, 5]]) st(4, x, z, w);
  const HH = { x0: -13.8, x1: 13.8, z0: -9.8, z1: 9.8 };
  for (const [x, y, z, w] of [[-9.5, 0, 2.8, 0], [5.5, 0, -2.8, 5], [-1.5, 3, -4.5, 3], [9, 3, -3.5, 0]]) add(new V3(x, y, z), { st: 4, w, zone: 5, area: HH, lo: aiLoadout(1, night, w) });
  MIS.cmdr = add(new V3(-8, 3, -5), { st: 4, w: 5, zone: 5, area: HH, pal: 2, lo: aiLoadout(2, night, 5) }); MIS.cmdr.cmdr = true;
  return out;
}
// ---- the objectives, one after another. kind: 'kill' (every man of its stretch down), 'use' (hold F at the spot), 'reach'
// (get to the spot), 'hold' (stay alive till the time is up). at: where the marker points
const MIS_OBJ = [
  { kind: 'kill', st: 0, text: 'Push down Main Street and silence the machine gun at the barricade', at: () => new V3(51, 1.2, 22) },
  { kind: 'use', text: 'Search the house at No. 14 for the militia\'s radio', hint: 'searching', t: 2.5, at: () => MIS.radio },
  { kind: 'reach', text: 'Through the gate: cut down the gardens to the back street', at: () => new V3(55, 1.2, -66), r: 6 },
  { kind: 'use', text: 'Blow the weapons cache against the wall on the back street', hint: 'planting the charge', t: 3.5, at: () => new V3(0, 1.0, -63.6) },
  { kind: 'wait', text: 'Get clear of the cache!', t: 6 },
  { kind: 'cmdr', text: 'Storm their headquarters and take down the commander', at: () => MIS.cmdr && !misDown(MIS.cmdr) ? MIS.cmdr.pos.clone().setY(MIS.cmdr.pos.y + 1.9) : new V3(0, 1.5, 0) },
  { kind: 'use', text: 'Out to the street: pop smoke for the helicopter', hint: 'popping smoke', t: 1.5, at: () => new V3(0, 0.6, 22) },
  { kind: 'hold', text: 'Hold the street until the helicopter is down', t: 50, at: () => new V3(0, 0.6, 22) }
];
// ---- the mission itself
function startMission(n) {
  menuWarStop(); MIS.n = n || 1; MIS.done = false; MIS.cleared = false; MIS.failT = 0;
  for (const d of dummies) d.dispose(); dummies.length = 0;
  buildTown(0, { mission: MIS.n });
  // the radio: on a table in the house's back room
  { const h = MIS.houses[2], r = h.rooms[h.rooms.length - 1]; MIS.radio = new V3((r.x0 + r.x1) / 2 - 0.6, 0.85, (r.z0 + r.z1) / 2 + 0.5);
    const K = new Kit(); K.box(MT.oak, 0, 0.74, 0, 0.9, 0.05, 0.6); for (const a of [-1, 1]) for (const c of [-1, 1]) K.box(MT.dark, a * 0.4, 0, c * 0.25, 0.05, 0.74, 0.05);
    K.rbox(tdMat('mdRadio', { color: 0x3a4030, roughness: 0.6 }), 0, 0.79, 0, 0.42, 0.22, 0.26, 0.02); K.rod(MT.black, new V3(0.15, 1.0, 0), new V3(0.17, 1.6, 0), 0.006); K.box(MT.glow, -0.1, 0.92, 0.131, 0.12, 0.04, 0.005);
    K.build(MIS.radio.x, 0, MIS.radio.z, 0, { shadow: true }); }
  spawns = [new V3(131, 0, 21), new V3(131, 0, 23)];
  MIS.bots = missionBots(); MIS.obj = 0; MIS.objT = 0; MIS.use = 0; MIS.extra = false;
  S.mission = { n: MIS.n }; enterGame('test'); respawnLocal(spawns[0]); P.yaw = Math.PI / 2;
  MIS.start = performance.now(); MIS.grace = 12;
  setTimeout(() => { if (S.mission) { loadoutUI(true); flashMsg('MISSION 1 · CLEAR THE NEIGHBOURHOOD<small>A militia holds the street and their headquarters is the big house. Fight down Main Street, find their radio, blow their weapons cache, take down the commander, then get out by helicopter.</small>', 8000); } }, 300);
}
// down and out: the ones dead, or bleeding out on the ground with no getting up
const misDown = b => b.dead || (b.rag && (b.anat.paralyzed || b.anat.bothLegs() || b.anat.blood < 2500));
function misEl(id, css) { let el = document.getElementById(id); if (!el) { el = document.createElement('div'); el.id = id; el.style.cssText = css; document.body.appendChild(el); } return el; }
// one objective done: what it opens, and on to the next
function misNext() {
  const o = MIS_OBJ[MIS.obj];
  if (MIS.obj === 1) { mdRemove(MIS.gate); MIS.gate = null; flashMsg('RADIO FOUND<small>The gate code is taped to it. Their cache is on the back street, their commander in the big house.</small>', 5000); }
  if (MIS.obj === 4) { explode(new V3(0, 0.5, -63.6), 'c4', S.myIdOr0(), true, new V3(0, 1, 0)); mdRemove(MIS.plug); MIS.plug = null; flashMsg('CACHE DESTROYED<small>The wall is down. Their headquarters is through the garden.</small>', 4500); }
  if (MIS.obj === 5) flashMsg('COMMANDER DOWN<small>Get out to the street and call the helicopter in.</small>', 4500);
  if (MIS.obj === 6) { // the rest of them come for you: four up the street from either end, the marksman on the west tower
    const night = ENV.tod < 6.5 || ENV.tod > 19;
    for (const [x, z, w] of [[-21, 27.5, 0], [-20.5, 15.5, 5], [21, 27.5, 3], [20.5, 15.5, 0]]) MIS.addBot(new V3(x, 0, z), { st: 6, w, zone: 6, lo: aiLoadout(1, night, w) });
    const t = MIS.towers[1]; MIS.addBot(t.clone(), { st: 6, w: 2, sniper: true, zone: 0.6, area: { x0: t.x - 1.3, x1: t.x + 1.3, z0: t.z - 1.3, z1: t.z + 1.3 }, lo: aiLoadout(0, night, 2) });
    flashMsg('SMOKE OUT<small>The helicopter is fifty seconds away. They know you are here.</small>', 4500); }
  MIS.obj++; MIS.objT = 0; MIS.use = 0;
}
function updateMission(dt) {
  if (!S.mission || MIS.done) return;
  if (!S.loOpen && MIS.grace > 0) MIS.grace = Math.max(0, MIS.grace - dt);
  const o = MIS_OBJ[MIS.obj], left = MIS.bots.filter(b => !misDown(b)).length, me = P.pos;
  // what to do now (top of the screen), how far it is (a marker on it)
  const top = misEl('misleft', 'position:fixed;top:12px;left:50%;transform:translateX(-50%);font:600 12px/1.5 Inter,system-ui,sans-serif;letter-spacing:.14em;color:#e8e4dc;text-shadow:0 1px 3px #000;z-index:6;pointer-events:none;text-align:center');
  const mk = misEl('mismark', 'position:fixed;z-index:6;pointer-events:none;font:600 11px/1 Inter,system-ui,sans-serif;color:#ffd27a;text-shadow:0 1px 2px #000;transform:translate(-50%,-100%);text-align:center');
  top.style.display = mk.style.display = S.mode ? 'block' : 'none';
  let sub = '';
  if (o) {
    MIS.objT += dt;
    if (o.kind === 'kill') { const n = MIS.bots.filter(b => b.st === o.st && !b.sniper && !misDown(b)).length; sub = n + ' left on this stretch'; if (!n) misNext(); }
    else if (o.kind === 'reach') { const p = o.at(); if (Math.hypot(me.x - p.x, me.z - p.z) < o.r) misNext(); }
    else if (o.kind === 'use') { const p = o.at(), d = Math.hypot(me.x - p.x, me.z - p.z);
      if (d < 1.8 && Math.abs(me.y - (p.y - 0.8)) < 1.5 && P.alive && !P.downed) { sub = keys.KeyF ? o.hint + ' ' + Math.round(100 * MIS.use / o.t) + '%' : 'hold F'; if (keys.KeyF) { MIS.use += dt; if (MIS.use >= o.t) misNext(); } else MIS.use = 0; } else MIS.use = 0; }
    else if (o.kind === 'wait') { sub = Math.ceil(o.t - MIS.objT) + ' s'; if (MIS.objT >= o.t) misNext(); }
    else if (o.kind === 'cmdr') { if (MIS.cmdr && misDown(MIS.cmdr)) misNext(); }
    else if (o.kind === 'hold') { const r = Math.max(0, o.t - MIS.objT); sub = 'helicopter in ' + Math.floor(r / 60) + ':' + String(Math.ceil(r) % 60).padStart(2, '0'); if (r <= 0) misNext(); }
  }
  const o2 = MIS_OBJ[MIS.obj]; if (o2 !== o) sub = '';
  if (!o2) {
    MIS.done = true; MIS.cleared = true; const t = Math.round((performance.now() - MIS.start) / 1000); top.innerHTML = '';
    flashMsg('MISSION COMPLETE<small>Extracted · ' + (MIS.bots.length - left) + ' militia down · ' + Math.floor(t / 60) + ' min ' + (t % 60) + ' s · back to the menu shortly</small>', 9000);
    setTimeout(() => { if (S.mission && MIS.cleared) leave(); }, 9500); return;
  }
  const html = 'MISSION 1 · OBJECTIVE ' + (MIS.obj + 1) + '/' + MIS_OBJ.length + '<br><span style="color:#ffd27a;letter-spacing:.06em;font-size:14px">' + o2.text + '</span>' + (sub ? '<br><span style="color:#ff8a7a">' + sub + '</span>' : '');
  if (S.mission.html !== html) { S.mission.html = html; top.innerHTML = html; }
  const p = o2.at && o2.at();
  if (p && S.mode) { const v = p.clone().project(camera), on = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    mk.style.display = on ? 'block' : 'none'; if (on) { mk.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; mk.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; mk.innerHTML = '◆<br>' + Math.round(p.distanceTo(me)) + ' m'; } }
  else mk.style.display = 'none';
}
function missionFailed() {
  if (MIS.done) return; MIS.done = true;
  flashMsg('MISSION FAILED<small>You went down. Starting again…</small>', 5000);
  setTimeout(() => { if (S.mission) deploy('MISSION 1', () => startMission(MIS.n)); }, 5200);
}

// ---- module exports: build.mjs strips this block ----
export { MIS, MIS_HOUSES, missionFailed, missionWorld, sandbags, startMission, updateMission };
// ---- end module exports ----
