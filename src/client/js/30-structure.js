// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, rnd, scene } from './00-setup.js';
import { colliders, worldMeshes } from './01-world.js';
import { HOUSE, TOWN } from './01b-town.js';
import { tdRelease } from './01c-town-detail.js';
import { inside, noiseHit } from './10-audio.js';
import { decals, splatGeo } from './11-fx.js';
import { holeify } from './14-wounds.js';
import { DESTR, DESTR_OF, SLOTS, debris, dust, spawnDebris, wallGrid, wallMask, wallShape } from './15-destruction.js';
import { doorLaunch, doorQuiet, doors } from './15b-doors.js';
import { P, S, dummies } from './17-dummies.js';
import { flashMsg, hurtFlash, localDeath } from './18-player.js';
import { net } from './19-network.js';
import { screenBlood } from './21b-screenfx.js';
import { boardBreak } from './23-siege.js';
import { navDirty } from './32-ai.js';
// ---- end module links ----
// ---------------------------------------------------------------- what holds the building up
// Every solid in and on the house is a structural piece: wall panels, floor and roof tiles, stairs, the furniture. A piece
// stands if it is on the ground, or rests on a piece that stands; a wall that is mostly blown or shot away no longer holds
// anything up; a floor or roof tile can reach one tile out past what holds it (a short cantilever), no further. After every
// break the whole thing is worked out again, and whatever has nothing under it comes down: a wall tips over off its floor, a
// tile drops, a roof caves in where the walls under it are gone, and it all comes down on whoever is underneath. Nothing is
// left hanging in the air. Every machine works this out from the same damage, so they agree.
var STRUCT = { dirty: false, t: 0, fall: [] };
function structDirty() { if (!STRUCT) return; STRUCT.dirty = true; STRUCT.t = 0.15; }
const inHouseArea = b => b.max.x > HOUSE.x0 - 4 && b.min.x < HOUSE.x1 + 4 && b.max.z > HOUSE.z0 - 4 && b.min.z < HOUSE.z1 + 4;
// how much of a wall is left (0-1) and how much of its bottom edge still stands on what it was standing on
function wallState(m) {
  const G = m.userData.grid; if (!G) return { left: 1, foot: 1 };
  if (G._sv === G.tex.version) return G._st;
  let open = 0; for (let k = 0; k < G.cell.length; k++) if (G.cell[k]) open++;
  let fo = 0; const rows = Math.max(1, Math.round(0.08 / G.cs2)); for (let j = 0; j < rows; j++) for (let i = 0; i < G.n1; i++) if (G.cell[j * G.n1 + i]) fo++;
  G._sv = G.tex.version; return (G._st = { left: 1 - open / G.cell.length, foot: 1 - fo / (G.n1 * rows) });
}
function structCheck() {
  const els = [];
  for (const m of worldMeshes) { const ud = m.userData, b = ud.box; if (!b || !ud.town || !m.visible || ud.door || ud.doorFrame || ud.falling || ud.lamp !== undefined || ud.board !== undefined || !inHouseArea(b)) continue; const st = wallState(m); els.push({ m, b, st, failed: st.left < 0.22, up: false, direct: false }); }
  // on the ground
  const q = [];
  for (const e of els) if (e.b.min.y <= 0.03 && !e.failed && e.st.foot > 0.12) { e.up = true; e.direct = true; q.push(e); }
  const onTop = (f, e) => f.b.min.y >= e.b.min.y + Math.min(0.25, (e.b.max.y - e.b.min.y) * 0.5) && f.b.min.y <= e.b.max.y + 0.06;
  const xz = (a, c) => a.max.x > c.min.x + 0.02 && a.min.x < c.max.x - 0.02 && a.max.z > c.min.z + 0.02 && a.min.z < c.max.z - 0.02;
  while (q.length) {
    const e = q.pop(); if (e.failed) continue;
    for (const f of els) if (!f.up && !f.failed && onTop(f, e) && xz(f.b, e.b)) { f.up = true; f.direct = true; q.push(f); }
  }
  // the piece of wall over a door or window is held by the wall each side of it (one step across, no further)
  const side = (a, c) => { const yo = Math.min(a.max.y, c.max.y) - Math.max(a.min.y, c.min.y) > 0.1;
    const tx = (Math.abs(a.max.x - c.min.x) < 0.05 || Math.abs(a.min.x - c.max.x) < 0.05) && a.max.z > c.min.z + 0.02 && a.min.z < c.max.z - 0.02;
    const tz = (Math.abs(a.max.z - c.min.z) < 0.05 || Math.abs(a.min.z - c.max.z) < 0.05) && a.max.x > c.min.x + 0.02 && a.min.x < c.max.x - 0.02; return yo && (tx || tz); };
  for (const f of els) if (!f.up && !f.failed && !f.m.userData.slab) for (const e of els) if (e.direct && !e.failed && !e.m.userData.slab && side(f.b, e.b)) { f.up = true; break; }
  // floor and roof tiles are one slab really (joists run across): a tile stands if it is within two tiles of one that sits on
  // a wall
  const near2 = (a, c) => { const gx = Math.max(a.min.x - c.max.x, c.min.x - a.max.x), gz = Math.max(a.min.z - c.max.z, c.min.z - a.max.z); return gx < 0.06 && gz < 0.06 && (gx > -0.12 || gz > -0.12); };
  for (let pass = 0; pass < 2; pass++) { const add = [];
    for (const f of els) if (!f.up && !f.failed && f.m.userData.slab) for (const e of els) if (e.up && e.m.userData.slab && (pass > 0 || e.direct) && Math.abs(e.b.min.y - f.b.min.y) < 0.05 && near2(e.b, f.b)) { add.push(f); break; }
    for (const f of add) f.up = true; }
  // (and what stands on a cantilevered tile)
  let more = true; while (more) { more = false; for (const e of els) if (e.up && !e.failed) for (const f of els) if (!f.up && !f.failed && onTop(f, e) && xz(f.b, e.b)) { f.up = true; more = true; } }
  let n = 0;
  for (const e of els) if (!e.up && !e.failed) { structFall(e.m, e.st); n++; }
  // a door whose wall is gone round it: the frame breaks out and the door falls with it
  for (const d of doors) {
    if (d.fly || d.fallen || !d.frame.length || !d.frame[0].userData.town || !d.frame[0].parent) continue; const fb = d.frame[0].userData.box; if (!fb || !inHouseArea(fb)) continue;
    const c = d.g.position, hold = els.some(e => e.up && !e.failed && !e.m.userData.slab && e.b.max.y > c.y + 0.5 && e.b.min.y < c.y + 2.2 && e.b.max.x > c.x - 0.75 && e.b.min.x < c.x + 0.75 && e.b.max.z > c.z - 0.75 && e.b.min.z < c.z + 0.75);
    if (hold) continue;
    for (const f of d.frame) { const k = worldMeshes.indexOf(f); if (k >= 0) worldMeshes.splice(k, 1); const j = colliders.indexOf(f.userData.box); if (j >= 0) colliders.splice(j, 1); f.visible = false;
      // (it splinters: lengths of the jamb and head come down, not a frame that blinks out)
      const fb2 = f.userData.box, sz = fb2.getSize(new V3()), long = sz.y > Math.max(sz.x, sz.z) ? 1 : sz.x > sz.z ? 0 : 2, nP = Math.max(2, Math.round(sz.getComponent(long) / 0.45));
      for (let i = 0; i < nP; i++) { const p = fb2.getCenter(new V3()); p.setComponent(long, fb2.min.getComponent(long) + (i + 0.5) / nP * sz.getComponent(long)); const dm = [sz.x, sz.y, sz.z]; dm[long] = sz.getComponent(long) / nP * rnd(0.7, 0.95); spawnDebris(p, 1, new V3(rnd(-0.5, 0.5), -0.2, rnd(-0.5, 0.5)), 0.5, rnd(0.3, 1.2), DESTR.wood, 0, dm); }
      spawnDebris(fb2.getCenter(new V3()), 6, new V3(0, -1, 0), 1, 1, DESTR.wood, 0.02); }
    doorQuiet(() => doorLaunch(d, new V3(0, -0.5, 0), new V3(0.4, 0, 0.3)));
  }
  // boards nailed across a window come down when the wall they were nailed to is gone
  if (TOWN.windows) TOWN.windows.forEach((w, i) => { if (w.boards) w.boards.forEach((m, k) => { if (!m || !m.userData.box) return; const bb = m.userData.box;
    const ex = { min: bb.min.clone().addScalar(-0.15), max: bb.max.clone().addScalar(0.15) };
    if (!els.some(e => e.up && !e.failed && !e.m.userData.slab && (e.m.userData.grid || e.m.userData.house !== undefined) && ex.max.x > e.b.min.x && ex.min.x < e.b.max.x && ex.max.y > e.b.min.y && ex.min.y < e.b.max.y && ex.max.z > e.b.min.z && ex.min.z < e.b.max.z)) { boardBreak(i, k, new V3(0, -1, 0), false); if (typeof net !== 'undefined' && net.mode === 'host' && net.host && net.host.R && net.host.R.sgw) net.host.R.sgw.push(['bk', i, k]); } }); });
  if (n >= 3) { noiseHit(120, 1.4, 0.6); noiseHit(60, 2, 0.5); }
}
// (demolish takes out everything standing on the ground floor that could hold the house up: walls, posts, the stairs)
// a piece with nothing under it comes down: out of the solids at once (so what it held is worked out again), then falling
function structFall(m, st) {
  tdRelease(m); m.matrixWorldAutoUpdate = true; m.traverse(o => { o.matrixAutoUpdate = true; });
  const ud = m.userData, b = ud.box; ud.falling = true; if (typeof navDirty === 'function') navDirty(); if (TOWN.gone) TOWN.gone.push(boxKey(b));
  const i = worldMeshes.indexOf(m); if (i >= 0) worldMeshes.splice(i, 1);
  const j = colliders.indexOf(b); if (j >= 0) colliders.splice(j, 1);
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
  // (only a panel standing on something tips over; one with nothing under it, a lintel, a wall whose floor went, drops)
  const wall = h > Math.max(w, d) * 0.6 && Math.min(w, d) < 0.4 && Math.abs(floorUnder((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, b.min.y + 0.02) - b.min.y) < 0.12;
  // a standing panel tips over about its bottom edge (toward whichever side is open); a flat piece drops
  const F = { m, b: { min: b.min.clone(), max: b.max.clone() }, kind: ud.kind, v: 0, ph: 0, w: 0, wall, t: 0, h, footY: b.min.y };
  if (wall) {
    // (which way it goes over is worked out from where it stands, so it falls the same way for everyone)
    const thinX = w < d, s = (Math.floor((b.min.x + b.max.x) * 7.3 + (b.min.z + b.max.z) * 3.1 + b.min.y * 11) & 1) ? 1 : -1;
    F.axis = thinX ? new V3(0, 0, 1) : new V3(1, 0, 0); F.s = s;
    F.pivot = new V3(thinX ? (s > 0 ? b.max.x : b.min.x) : (b.min.x + b.max.x) / 2, b.min.y, thinX ? (b.min.z + b.max.z) / 2 : (s > 0 ? b.max.z : b.min.z));
    F.off = m.position.clone().sub(F.pivot); F.q0 = m.quaternion.clone();
  } else { F.spin = new V3(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6)); }
  STRUCT.fall.push(F);
}
// the highest solid surface under a point (the ground at 0)
function floorUnder(x, z, below) { let fy = 0; for (const c of colliders) if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z && c.max.y <= below + 0.05 && c.max.y > fy) fy = c.max.y; return fy; }
const _sq = new THREE.Quaternion();
function updateStructure(dt) {
  if (STRUCT.dirty) { STRUCT.t -= dt; if (STRUCT.t <= 0) { STRUCT.dirty = false; structCheck(); } }
  for (let k = STRUCT.fall.length - 1; k >= 0; k--) {
    const F = STRUCT.fall[k], m = F.m; F.t += dt;
    if (F.wall) {
      // tipping: slow to start, faster as it goes over (a plank about its edge)
      F.w += (3 * 9.8 / (2 * Math.max(0.5, F.h))) * Math.sin(F.ph + 0.08) * dt; F.ph += F.w * dt;
      const ang = F.ph * F.s * (F.axis.x ? 1 : -1);
      _sq.setFromAxisAngle(F.axis, ang); m.quaternion.copy(F.q0).premultiply(_sq); m.position.copy(F.pivot).add(F.off.clone().applyQuaternion(_sq));
      if (F.ph >= Math.PI / 2 - 0.05) { structLand(F); STRUCT.fall.splice(k, 1); }
    } else {
      F.v -= 9.8 * dt; m.position.y += F.v * dt; m.rotation.x += F.spin.x * dt; m.rotation.z += F.spin.z * dt;
      const bottom = m.position.y - (F.b.max.y - F.b.min.y) / 2, fy = floorUnder(m.position.x, m.position.z, F.footY);
      // it comes down on whoever is under it on the way
      structCrush(F, bottom);
      if (bottom <= fy) { structLand(F); STRUCT.fall.splice(k, 1); }
    }
  }
  // debris resting on something that has since gone wakes up and falls again
  if (STRUCT.wake) { STRUCT.wake = false; for (const d of debris) d.rest = false; }
}
// hitting the floor: it breaks up into pieces of itself, dust everywhere, and is gone
function structLand(F) {
  const m = F.m, b = new THREE.Box3().setFromObject(m), c = b.getCenter(new V3()), sz = b.getSize(new V3());
  const D = DESTR[DESTR_OF[F.kind] || (F.kind === 'metal' ? 'concrete' : 'wood')] || DESTR.wood, area = Math.max(sz.x * sz.z, sz.x * sz.y, sz.y * sz.z);
  const gp = m.geometry && m.geometry.parameters, trueTh = gp && gp.width !== undefined ? Math.min(gp.width, gp.height, gp.depth) : Math.min(sz.x, sz.y, sz.z);
  const n = clamp(Math.round(area * 6), 6, 70);
  for (let i = 0; i < n; i++) {
    const p = new V3(rnd(b.min.x, b.max.x), rnd(b.min.y, b.max.y) + 0.05, rnd(b.min.z, b.max.z));
    // (the piece's own thickness, not its box in the world: a tilted roof's box is metres deep, and its bits came out as pillars)
    const th = clamp(trueTh, 0.03, 0.3);
    spawnDebris(p, 1, new V3(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize(), 0.5, rnd(0.6, 2.4), D, 0, [rnd(0.18, 0.5), rnd(0.18, 0.5), th]);
  }
  spawnDebris(c, 16, new V3(0, 1, 0), 0.9, 2.5, D, 0.03);
  dust(c, new V3(0, 1, 0), D.dust, 1.5 + Math.sqrt(area) * 0.9, 0.75, 5);
  const dd = camera.position.distanceTo(c); noiseHit(90, 0.6, 0.9 / (1 + dd * 0.08)); noiseHit(420, 0.35, 0.5 / (1 + dd * 0.1));
  structCrush(F, b.min.y, true);
  m.traverse(o => { const k = worldMeshes.indexOf(o); if (k >= 0) worldMeshes.splice(k, 1); if (o !== m && o.userData.lamp !== undefined && TOWN.lampAll[o.userData.lamp]) TOWN.lampAll[o.userData.lamp].out = true; });
  for (let q = decals.length - 1; q >= 0; q--) { const p = decals[q].position; if (b.containsPoint(p) || b.distanceToPoint(p) < 0.08) { scene.remove(decals[q]); if (decals[q].geometry !== splatGeo) decals[q].geometry.dispose(); decals.splice(q, 1); } }
  m.removeFromParent(); m.traverse(o => { if (o.geometry && o.geometry !== splatGeo) o.geometry.dispose(); }); if (m.material && !m.material.userData.shared) m.material.dispose();
  const G = m.userData.grid; if (G) { if (G.tex) G.tex.dispose(); if (G.stex) G.stex.dispose(); }
  STRUCT.wake = true; structDirty();
}
// under a falling slab or wall: heavy blunt trauma, a big one kills; anyone under it when it lands is crushed
function structCrush(F, bottom, land) {
  if (F.hit) return;
  const b = new THREE.Box3().setFromObject(F.m), inside = (x, z, y) => x > b.min.x - 0.1 && x < b.max.x + 0.1 && z > b.min.z - 0.1 && z < b.max.z + 0.1 && y < bottom + 0.2 && y + 1.9 > bottom - 0.2;
  const mass = (F.b.max.x - F.b.min.x) * (F.b.max.y - F.b.min.y) * (F.b.max.z - F.b.min.z) * (DESTR_OF[F.kind] === 'concrete' || F.kind === 'brick' ? 2000 : 600);
  if (!land && bottom > 2.2 + F.footY - 3) return;
  if (P.alive && inside(P.pos.x, P.pos.z, P.pos.y) && bottom < P.pos.y + 1.9) {
    F.hit = true; const an = P.anat, k = clamp(mass / 120, 0.4, 4);
    try { an.blunt('head', new V3(0, 0.1, 0), Math.min(1.2, k)); an.blunt('spine', new V3(0, 0.3, 0), Math.min(1.2, k)); an.pain = Math.min(100, (an.pain || 0) + 30 * k); an.blood -= 300 * k; } catch (er) {}
    hurtFlash(); screenBlood(1.2); flashMsg('CRUSHED<small>The building came down on you.</small>', 2200);
    if (mass > 260) { an.kill('crushed'); localDeath(); }
  }
  for (const dm of dummies) { if (dm.dead || !dm.hum) continue; const p = dm.hum.root.position; if (inside(p.x, p.z, p.y)) { F.hit = true; try { dm.punched({ frame: 'head', e: new V3(0, 0.1, 0), d: new V3(0, -1, 0) }, new V3(0, -1, 0), 1.2); if (mass > 260 && dm.anat && !dm.anat.dead) { dm.anat.kill('crushed'); if (dm.die) dm.die(); } } catch (er) {} } }
}
// a charge on or under a floor or roof tile breaks it out (the blast code only opens walls)
function blastSlabs(p, W) {
  if (W < 0.5) return;
  const r = 0.9 * Math.cbrt(W);
  for (const m of worldMeshes.slice()) { const ud = m.userData; if (!ud.slab || ud.falling) continue; const b = ud.box, q = new V3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z)); if (q.distanceTo(p) < r) { structFall(m, null); } }
  structDirty();
}
// ---- solid things that are not wall panels (furniture, posts, the fridge, a skip, slabs) still take damage: each has a
// strength from its size and what it is made of, rounds, blasts and blows wear it down, and at zero it breaks apart
const BOX_K = { crate: 1, plywood: 0.6, drywall: 0.8, wood: 1, metal: 4, concrete: 7, brick: 5 };
// (who: 'peer' for someone else's bullet, which wears it down but never breaks it here, since only the shooter's machine
// decides that and tells everyone; 'own' for our bullet; nothing for blasts and blows, which every machine works out the same)
function boxHit(m, E, who) {
  const ud = m.userData, b = ud.box; if (!b || ud.falling || ud.door || ud.doorFrame || ud.bomb || ud.lamp !== undefined || ud.board !== undefined || ud.grid || wallShape(m)) return;
  const vol = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z); if (vol > 30 || b.max.y - b.min.y > 3.4) return;   // (hedges, the ground)
  if (ud.bhp === undefined) ud.bhp = (3000 + vol * 20000) * (BOX_K[ud.kind] || 1);
  if (who === 'peer') { ud.bhp = Math.max(1, ud.bhp - E); return; }
  ud.bhp -= E; if (ud.bhp > 0) return;
  if (who === 'own' && S.mode === 'online') net.send({ t: 'x', a: 'bx', p: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2].map(v => Math.round(v * 1000) / 1000) });
  boxBreak(m);
}
function boxBreak(m) {
  tdRelease(m); m.matrixWorldAutoUpdate = true; m.traverse(o => { o.matrixAutoUpdate = true; });
  // (a piece of furniture gone only opens up room: the bots' map of the house is still good, so it is not worked out again)
  const ud = m.userData, b = ud.box; if (typeof navDirty === 'function' && !ud.furn) navDirty(); if (TOWN.gone) TOWN.gone.push(boxKey(b));
  const i = worldMeshes.indexOf(m); if (i >= 0) worldMeshes.splice(i, 1); const j = colliders.indexOf(b); if (j >= 0) colliders.splice(j, 1);
  ud.falling = true; structLand({ m, b: { min: b.min.clone(), max: b.max.clone() }, kind: ud.kind, footY: b.min.y }); structDirty();
}
// someone's round broke a piece of furniture on their machine: it breaks here too
function boxBreakAt(c) {
  const m = worldMeshes.find(o => { const u = o.userData, b = u.box; return b && !u.falling && !u.door && !u.bomb && !u.grid && Math.abs((b.min.x + b.max.x) / 2 - c.x) < 0.02 && Math.abs((b.min.y + b.max.y) / 2 - c.y) < 0.02 && Math.abs((b.min.z + b.max.z) / 2 - c.z) < 0.02; });
  if (m && !wallShape(m)) boxBreak(m);
}
function blastBoxes(p, W) {
  if (W < 0.1) return;
  const r = 2.2 * Math.cbrt(W);
  for (const m of worldMeshes.slice()) { const ud = m.userData, b = ud.box; if (!b || ud.grid || ud.slab || ud.door || wallShape(m)) continue; const q = new V3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z)), d = q.distanceTo(p); if (d < r) boxHit(m, W * 60000 / (0.15 + d * d)); }
}
// the host's demolition: every load-bearing wall on the ground floor gives way, one after another along the house, and the
// rest comes down by itself (the same on every machine: same order, same timing)
function demolish() {
  if (TOWN.demolished) return 0; TOWN.demolished = true;
  const walls = worldMeshes.filter(m => { const u = m.userData, b = u.box; return b && u.town && !u.door && !u.doorFrame && u.board === undefined && u.lamp === undefined && b.min.y < 0.05 && ((u.house === 0 && !u.slab && b.max.y > 0.5) || b.max.y > 1.5 && (b.min.x >= HOUSE.x0 - 3 && b.max.x <= HOUSE.x1 + 3 && b.min.z >= HOUSE.z0 - 3 && b.max.z <= HOUSE.z1 + 3)); })
    .sort((a, b) => (a.userData.box.min.x - b.userData.box.min.x) || (a.userData.box.min.z - b.userData.box.min.z));
  noiseHit(70, 2.5, 0.8); noiseHit(140, 1.8, 0.5);
  walls.forEach((m, i) => setTimeout(() => { if (!m.userData.falling && m.parent && worldMeshes.includes(m)) { structFall(m, null); structDirty(); if (i % 6 === 0) noiseHit(rnd(60, 110), 0.8, 0.4); } }, 300 + i * 45));
  return walls.length;
}
// ---- the house as it is now, for someone joining mid-round: every hole in every wall, and what has fallen or broken
const boxKey = b => [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2].map(v => Math.round(v * 1000) / 1000);
const byKey = (k, pred) => worldMeshes.find(o => { const u = o.userData, b = u.box; if (!b || u.falling || !pred(o)) return false; const c = boxKey(b); return Math.abs(c[0] - k[0]) < 0.01 && Math.abs(c[1] - k[1]) < 0.01 && Math.abs(c[2] - k[2]) < 0.01; });
function damageSnap() {
  const out = [];
  for (const m of worldMeshes) {
    const G = m.userData.grid; if (!G || !G.any || m.userData.door || m.userData.falling) continue;
    const c = G.cell, n = c.length, key = boxKey(m.userData.box); let runs = [];
    for (let k = 0; k < n;) { if (c[k]) { let e = k; while (e < n && c[e]) e++; runs.push(k, e - k); k = e; if (runs.length >= 160) { out.push(['w', key, runs]); runs = []; } } else k++; }
    if (runs.length) out.push(['w', key, runs]);
  }
  // (and the doors' leaves: shot through, sledged)
  if (typeof doors !== 'undefined') for (const d of doors) { const G = d.leaf && d.leaf.userData.grid; if (!G || !G.any || d.fly) continue; let runs = [];
    for (let k = 0, n = G.cell.length; k < n;) { if (G.cell[k]) { let e = k; while (e < n && G.cell[e]) e++; runs.push(k, e - k); k = e; if (runs.length >= 160) { out.push(['d', d.i, runs]); runs = []; } } else k++; }
    if (runs.length) out.push(['d', d.i, runs]); }
  const g = (TOWN.gone || []).slice(); for (let i = 0; i < g.length; i += 60) out.push(['g', g.slice(i, i + 60)]);
  return out.slice(0, 600);
}
function damageApply(s) {
  if (!Array.isArray(s)) return;
  const fin = k => Array.isArray(k) && k.length === 3 && k.every(Number.isFinite);
  if (s[0] === 'w' && fin(s[1]) && Array.isArray(s[2])) {
    const m = byKey(s[1], o => !o.userData.door && wallShape(o)); if (!m) return; const G = wallGrid(m), D = DESTR[DESTR_OF[m.userData.kind]]; if (!D) return;
    if (m.userData.holeN === undefined) holeify(m, SLOTS, D.inner); m.userData.holeMax = SLOTS; wallMask(m);
    const data = G.tex.image.data;
    for (let r = 0; r + 1 < s[2].length; r += 2) { const a = s[2][r] | 0, L = s[2][r + 1] | 0; for (let k = Math.max(0, a); k < Math.min(G.cell.length, a + L); k++) { G.cell[k] = 1; G.dmg[k] = 1; data[k] = 255; } }
    G.any = true; G.tex.needsUpdate = true; structDirty();
  } else if (s[0] === 'd' && Number.isInteger(s[1]) && Array.isArray(s[2]) && typeof doors !== 'undefined' && doors[s[1]] && !doors[s[1]].fly) {
    const m = doors[s[1]].leaf, G = wallGrid(m), D = DESTR[DESTR_OF[m.userData.kind]]; if (!G || !D) return;
    if (m.userData.holeN === undefined) holeify(m, SLOTS, D.inner); m.userData.holeMax = SLOTS; wallMask(m);
    const data = G.tex.image.data;
    for (let r = 0; r + 1 < s[2].length; r += 2) { const a = s[2][r] | 0, L = s[2][r + 1] | 0; for (let k = Math.max(0, a); k < Math.min(G.cell.length, a + L); k++) { G.cell[k] = 1; G.dmg[k] = 1; data[k] = 255; } }
    G.any = true; G.tex.needsUpdate = true;
  } else if (s[0] === 'g' && Array.isArray(s[1])) {
    for (const k of s[1]) { if (!fin(k)) continue; const m = byKey(k, o => !o.userData.door && !o.userData.bomb && o.userData.lamp === undefined && o.userData.board === undefined); if (!m) continue;
      const i = worldMeshes.indexOf(m); worldMeshes.splice(i, 1); const j = colliders.indexOf(m.userData.box); if (j >= 0) colliders.splice(j, 1); m.userData.falling = true; m.visible = false; if (TOWN.gone) TOWN.gone.push(k); }
    structDirty();
  }
}
function clearStructure() { if (!STRUCT) return; STRUCT.fall.length = 0; STRUCT.dirty = false; }

// ---- module exports: build.mjs strips this block ----
export { blastBoxes, blastSlabs, boxBreakAt, boxHit, clearStructure, damageApply, damageSnap, demolish, floorUnder, structDirty, updateStructure };
// ---- end module exports ----
