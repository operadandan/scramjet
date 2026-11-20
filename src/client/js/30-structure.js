// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, rnd } from './00-setup.js';
import { colliders, worldMeshes } from './01-world.js';
import { HOUSE } from './01b-town.js';
import { inside, noiseHit } from './10-audio.js';
import { DESTR, DESTR_OF, debris, dust, spawnDebris } from './15-destruction.js';
import { P, dummies } from './17-dummies.js';
import { flashMsg, hurtFlash, localDeath } from './18-player.js';
import { screenBlood } from './21b-screenfx.js';
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
  let open = 0; for (let k = 0; k < G.cell.length; k++) if (G.cell[k]) open++;
  let fo = 0; const rows = Math.max(1, Math.round(0.08 / G.cs2)); for (let j = 0; j < rows; j++) for (let i = 0; i < G.n1; i++) if (G.cell[j * G.n1 + i]) fo++;
  return { left: 1 - open / G.cell.length, foot: 1 - fo / (G.n1 * rows) };
}
function structCheck() {
  const els = [];
  for (const m of worldMeshes) { const ud = m.userData, b = ud.box; if (!b || ud.door || ud.doorFrame || ud.falling || ud.lamp !== undefined || !inHouseArea(b)) continue; const st = wallState(m); els.push({ m, b, st, failed: st.left < 0.22, up: false, direct: false }); }
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
  // tiles reach one tile past their support
  for (const f of els) if (!f.up && f.m.userData.slab) for (const e of els) if (e.direct && e.m.userData.slab && Math.abs(e.b.min.y - f.b.min.y) < 0.05) {
    const touchX = Math.abs(e.b.max.x - f.b.min.x) < 0.05 || Math.abs(e.b.min.x - f.b.max.x) < 0.05, touchZ = Math.abs(e.b.max.z - f.b.min.z) < 0.05 || Math.abs(e.b.min.z - f.b.max.z) < 0.05;
    const ovX = e.b.max.x > f.b.min.x + 0.1 && e.b.min.x < f.b.max.x - 0.1, ovZ = e.b.max.z > f.b.min.z + 0.1 && e.b.min.z < f.b.max.z - 0.1;
    if ((touchX && ovZ) || (touchZ && ovX)) { f.up = true; break; }
  }
  // (and what stands on a cantilevered tile)
  let more = true; while (more) { more = false; for (const e of els) if (e.up && !e.failed) for (const f of els) if (!f.up && !f.failed && onTop(f, e) && xz(f.b, e.b)) { f.up = true; more = true; } }
  let n = 0;
  for (const e of els) if (!e.up && !e.failed) { structFall(e.m, e.st); n++; }
  if (n >= 3) { noiseHit(120, 1.4, 0.6); noiseHit(60, 2, 0.5); }
}
// a piece with nothing under it comes down: out of the solids at once (so what it held is worked out again), then falling
function structFall(m, st) {
  const ud = m.userData, b = ud.box; ud.falling = true;
  const i = worldMeshes.indexOf(m); if (i >= 0) worldMeshes.splice(i, 1);
  const j = colliders.indexOf(b); if (j >= 0) colliders.splice(j, 1);
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
  const wall = h > Math.max(w, d) * 0.6 && Math.min(w, d) < 0.4;
  // a standing panel tips over about its bottom edge (toward whichever side is open); a flat piece drops
  const F = { m, b: { min: b.min.clone(), max: b.max.clone() }, kind: ud.kind, v: 0, ph: 0, w: 0, wall, t: 0, h, footY: b.min.y };
  if (wall) {
    const thinX = w < d, s = Math.random() < 0.5 ? 1 : -1;
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
  const D = DESTR[DESTR_OF[F.kind] || 'wood'] || DESTR.wood, area = Math.max(sz.x * sz.z, sz.x * sz.y, sz.y * sz.z);
  const n = clamp(Math.round(area * 6), 6, 70);
  for (let i = 0; i < n; i++) {
    const p = new V3(rnd(b.min.x, b.max.x), rnd(b.min.y, b.max.y) + 0.05, rnd(b.min.z, b.max.z));
    const th = Math.max(0.03, Math.min(sz.x, sz.y, sz.z));
    spawnDebris(p, 1, new V3(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize(), 0.5, rnd(0.6, 2.4), D, 0, [rnd(0.18, 0.5), rnd(0.18, 0.5), th]);
  }
  spawnDebris(c, 16, new V3(0, 1, 0), 0.9, 2.5, D, 0.03);
  dust(c, new V3(0, 1, 0), D.dust, 1.5 + Math.sqrt(area) * 0.9, 0.75, 5);
  const dd = camera.position.distanceTo(c); noiseHit(90, 0.6, 0.9 / (1 + dd * 0.08)); noiseHit(420, 0.35, 0.5 / (1 + dd * 0.1));
  structCrush(F, b.min.y, true);
  m.removeFromParent(); if (m.geometry) m.geometry.dispose(); if (m.material && !m.material.userData.shared) m.material.dispose();
  STRUCT.wake = true; structDirty();
}
// under a falling slab or wall: heavy blunt trauma, a big one kills; anyone under it when it lands is crushed
function structCrush(F, bottom, land) {
  if (F.hit) return;
  const b = new THREE.Box3().setFromObject(F.m), inside = (x, z, y) => x > b.min.x - 0.1 && x < b.max.x + 0.1 && z > b.min.z - 0.1 && z < b.max.z + 0.1 && y < bottom + 0.2 && y + 1.9 > bottom - 0.2;
  const mass = (F.b.max.x - F.b.min.x) * (F.b.max.y - F.b.min.y) * (F.b.max.z - F.b.min.z) * (DESTR_OF[F.kind] === 'concrete' || F.kind === 'brick' ? 2000 : 600);
  if (!land && bottom > 2.2 + F.footY - 3) return;
  if (P.alive && !P.downed && inside(P.pos.x, P.pos.z, P.pos.y) && bottom < P.pos.y + 1.9) {
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
function clearStructure() { if (!STRUCT) return; STRUCT.fall.length = 0; STRUCT.dirty = false; }

// ---- module exports: build.mjs strips this block ----
export { blastSlabs, clearStructure, structDirty, updateStructure };
// ---- end module exports ----
