// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, damp, rnd, scene } from './00-setup.js';
import { addBox, colliders } from './01-world.js';
import { HOUSE, TOWN } from './01b-town.js';
import { chunkReset } from './02b-chunks.js';
import { hurtLevel } from './03-humanoid.js';
import { _Y, freeRag, setHelmet } from './04-ragdoll.js';
import { Anatomy, PART_OF_REGION } from './05-anatomy.js';
import { WEAPONS, flashMat, pelletDirs } from './06-weapons.js';
import { footSound, inside, noiseHit, shotSound, surfaceAt } from './10-audio.js';
import { fx } from './11-fx.js';
import { smoke } from './12-blood.js';
import { nz } from './12b-gore.js';
import { clearWounds } from './14-wounds.js';
import { gridOpenW, pick } from './15-destruction.js';
import { DOOR_H, DOOR_OPEN, DOOR_W, addDoor, doorNet, doors } from './15b-doors.js';
import { bullets, ejectShell, spawnBullet, wmFor } from './16-ballistics.js';
import { Dummy, P, S, arteryRate, dummies } from './17-dummies.js';
import { flashMsg } from './18-player.js';
import { net } from './19-network.js';
import { FRAG_V, NADES, explSeq, explode, r3, r4x, throwNade } from './19b-explosives.js';
import { last } from './22-menu-loop.js';
import { ENV } from './24-env.js';
import { SL, lightLevel } from './26-lights.js';
import { GADGETS, GD, gadgetAdd, gadgetRemove, sledgeBody, smokeAt } from './27-gadgets.js';
import { floorUnder } from './30-structure.js';
// ---- end module links ----
// ---------------------------------------------------------------- AI defenders (raid mode, the CQC course, "spawn ai")
// Each one is a full body (the same Dummy, so it takes rounds, bleeds, breaks and dies like anyone) with a brain on top:
// it knows the building (a walk graph worked out from the solids themselves, floors and stairs included), sees in a cone
// (darkness, smoke and a flashbang all get in the way), hears shots, steps and blasts, tells the others what it saw, sets
// traps and boards up before the round, holds the angles the attackers will come through, hunts what it heard, and shoots
// like a player: a short reaction, an aim that settles onto you, bursts at range, full auto up close, recoil pulled down.
// In raid mode the host runs every brain and the others see them as players (their state and shots go out the same way).
var AIS = [];
const AI_NOISE = [];
const AI_PAL = { shirt: 0x2b4a70, vest: 0x24384f, vest2: 0x1f3146, pack: 0x263548, helmet: 0x283a52 };
const AI_NAMES = ['Viper', 'Ghost', 'Hound', 'Wraith', 'Saber', 'Bishop', 'Raven', 'Mako'];
const AI_FOV = Math.cos(58 * Math.PI / 180);
const _aiR = new THREE.Raycaster(), _aiV = new V3(), _aiW = new V3();
// a sound the bots may hear: where, how far it carries, who made it
function aiNoise(p, r, by) { if (!AIS.length || !p) return; AI_NOISE.push({ p: p.clone ? p.clone() : new V3().fromArray(p), r, by: by || 0, t: performance.now() }); if (AI_NOISE.length > 40) AI_NOISE.shift(); }

// ---- the walk graph: every 0.5 m, every height a body can stand at, joined to its neighbours where a body can step across
const NAV_CS = 0.4;
let NAV_SKIP = new WeakSet();
function navSkipDoors() { NAV_SKIP = new WeakSet(); if (typeof doors !== 'undefined') for (const d of doors) for (const c of d.segs || []) NAV_SKIP.add(c); }
// (while the graph is built, the solids are looked up from 2 m buckets instead of all of them for every test)
let NAV_BK = null;
function navBlocked(x, y, z, h, r) {
  const list = NAV_BK ? NAV_BK.get(Math.floor(x / 2) * 1000 + Math.floor(z / 2)) || [] : colliders;
  for (const c of list) {
    if (NAV_SKIP.has(c)) continue;
    if (x + r <= c.min.x || x - r >= c.max.x || z + r <= c.min.z || z - r >= c.max.z || y + h <= c.min.y || y >= c.max.y) continue;
    const u = c.mesh && c.mesh.userData; if (u && (u.door || u.doorPart || u.board !== undefined || u.gadget)) continue;   // (doors get opened, boards get knocked out)
    return true;
  }
  return false;
}
function buildNav(b) {
  navSkipDoors();
  NAV_BK = new Map();
  for (const c of colliders) { if (c.max.x < b.x0 - 2 || c.min.x > b.x1 + 2 || c.max.z < b.z0 - 2 || c.min.z > b.z1 + 2) continue;
    for (let i = Math.floor((c.min.x - 0.3) / 2); i <= Math.floor((c.max.x + 0.3) / 2); i++) for (let j = Math.floor((c.min.z - 0.3) / 2); j <= Math.floor((c.max.z + 0.3) / 2); j++) { const k = i * 1000 + j; let L = NAV_BK.get(k); if (!L) NAV_BK.set(k, L = []); L.push(c); } }
  try { return buildNav0(b); } finally { NAV_BK = null; }
}
function buildNav0(b) {
  const N = { b, nodes: [], cell: new Map(), t: performance.now() };
  const nx = Math.ceil((b.x1 - b.x0) / NAV_CS), nz = Math.ceil((b.z1 - b.z0) / NAV_CS);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = b.x0 + i * NAV_CS, z = b.z0 + j * NAV_CS, ys = [0];
    for (const c of NAV_BK.get(Math.floor(x / 2) * 1000 + Math.floor(z / 2)) || []) if (x > c.min.x - 0.06 && x < c.max.x + 0.06 && z > c.min.z - 0.06 && z < c.max.z + 0.06 && c.max.y > 0.05 && c.max.y < 9) { const u = c.mesh && c.mesh.userData; if (!(u && (u.door || u.doorPart || u.gadget))) ys.push(c.max.y); }
    const list = [];
    for (const y of ys) { if (list.some(n => Math.abs(n.y - y) < 0.05)) continue; if (y > 4.6 || navBlocked(x, y + 0.45, z, 1.25, 0.17)) continue;
      const n = { i: N.nodes.length, x, y, z, e: [], gi: i, gj: j }; N.nodes.push(n); list.push(n); }
    if (list.length) N.cell.set(i * 4096 + j, list);
  }
  for (const n of N.nodes) for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const L = N.cell.get((n.gi + di) * 4096 + n.gj + dj); if (!L) continue;
    for (const m of L) { if (Math.abs(m.y - n.y) > 0.6) continue; const y = Math.max(m.y, n.y) + 0.45;
      if (navBlocked((n.x + m.x) / 2, y, (n.z + m.z) / 2, 1.25, 0.15)) continue;
      if (di && dj && (navBlocked(n.x + di * NAV_CS, y, n.z, 1.25, 0.13) || navBlocked(n.x, y, n.z + dj * NAV_CS, 1.25, 0.13))) continue;   // (no cutting a corner through a wall end)
      const d = Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z); n.e.push(m.i, d); m.e.push(n.i, d); }
  }
  return N;
}
function navNear(N, p, maxD) {
  const gi = Math.round((p.x - N.b.x0) / NAV_CS), gj = Math.round((p.z - N.b.z0) / NAV_CS); let best = null, bd = maxD || 3;
  for (let r = 0; r <= 4; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const L = N.cell.get((gi + di) * 4096 + gj + dj); if (!L) continue;
    for (const n of L) { const d = Math.hypot(n.x - p.x, (n.y - p.y) * 3, n.z - p.z); if (d < bd) { bd = d; best = n; } }
  }
  return best;
}
// A* over the graph (a binary heap for the open set)
function navPath(N, from, to, inside) {
  const a = navNear(N, from), z = navNear(N, to, 6); if (!a || !z) return null; if (a === z) return [z];
  const n = N.nodes.length, g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), shut = new Uint8Array(n);
  const hh = k => { const q = N.nodes[k]; return Math.hypot(q.x - z.x, q.y - z.y, q.z - z.z); };
  const H = [], push = (k, f) => { H.push([f, k]); let i = H.length - 1; while (i > 0) { const pI = (i - 1) >> 1; if (H[pI][0] <= H[i][0]) break; [H[pI], H[i]] = [H[i], H[pI]]; i = pI; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  g[a.i] = 0; push(a.i, hh(a.i));
  let guard = 0;
  while (H.length && guard++ < 40000) {
    const ci = pop()[1]; if (shut[ci]) continue; if (ci === z.i) break; shut[ci] = 1;
    const c = N.nodes[ci];
    for (let k = 0; k < c.e.length; k += 2) { const ni = c.e[k]; if (shut[ni] || (inside && !inside(N.nodes[ni]))) continue; const ng = g[ci] + c.e[k + 1]; if (ng < g[ni]) { g[ni] = ng; came[ni] = ci; push(ni, ng + hh(ni)); } }
  }
  if (came[z.i] < 0) return null;
  const out = []; let k = z.i; while (k >= 0 && k !== a.i) { out.push(N.nodes[k]); k = came[k]; }
  return out.reverse();
}
// the graph for wherever a bot is: the house in a raid, the CQC course, or the patch round a bot spawned by hand; worked
// out again when walls have come down or opened up
const NAVS = [];
function navFor(p) {
  for (const N of NAVS) if (p.x > N.b.x0 && p.x < N.b.x1 && p.z > N.b.z0 && p.z < N.b.z1) {
    if (N.stale && performance.now() - N.t > 2500) { const i = NAVS.indexOf(N); NAVS[i] = buildNav(N.b); return NAVS[i]; }
    return N;
  }
  const b = S.world === 'town' && typeof HOUSE !== 'undefined' && p.x > HOUSE.x0 - 8 && p.x < HOUSE.x1 + 8 && p.z > HOUSE.z0 - 8 && p.z < HOUSE.z1 + 8
    ? { x0: HOUSE.x0 - 8, x1: HOUSE.x1 + 8, z0: HOUSE.z0 - 8, z1: HOUSE.z1 + 8 } : CQC.b && p.x > CQC.b.x0 && p.x < CQC.b.x1 && p.z > CQC.b.z0 && p.z < CQC.b.z1 ? CQC.b
    : { x0: p.x - 16, x1: p.x + 16, z0: p.z - 16, z1: p.z + 16 };
  const N = buildNav(b); NAVS.push(N); return N;
}
function navDirty() { for (const N of NAVS) N.stale = true; }
function navClear() { NAVS.length = 0; }

// ---- who the bots are after
function aiTargets() {
  const out = [];
  if (P.alive && P.anat && (S.mode === 'test' || S.team[S.myId] === 'r')) out.push({ id: S.myId || 1, pos: P.pos, v: P.speed || 0, c: P.crouch, pr: P.prone, dn: !!P.downed, fl: SL.on, self: true });
  if (S.mode === 'online') for (const [id, r] of S.remotes) if (r.alive && r.st && S.team[id] === 'r' && !r.deadRag) out.push({ id, pos: r.pos, v: r.st.v || 0, c: r.st.c || 0, pr: r.st.pr || 0, dn: !!r.st.dn, fl: !!r.st.fl, r });
  return out;
}
// clear line from a bot's eye to a point: walls (through their holes), and smoke on the way
function aiSees(eye, q) {
  _aiV.subVectors(q, eye); const L = _aiV.length(); if (L < 0.01) return true; _aiV.multiplyScalar(1 / L);
  _aiR.set(eye, _aiV); _aiR.far = L - 0.2;
  const hits = _aiR.intersectObjects(wmFor(_aiR), false);
  for (const h of hits) { const u = h.object.userData; if (!u.box && !u.door) continue; if (u.grid && gridOpenW(h.object, h.point.clone().addScaledVector(_aiV, 0.01))) continue; if (h.object.visible === false) continue; return false; }
  for (let k = 1; k < 6; k++) { _aiW.copy(eye).addScaledVector(_aiV, L * k / 6); if (smokeAt(_aiW, false) > 0.45) return false; }
  return true;
}

// The brain. What it does, in order of importance:
//  - it never goes on the attack: it stays inside its building (no opening the doors out, no peeking outside), and the
//    furthest it goes is to hunt down something heard inside, two of them at most;
//  - it is always on the move round its part of the building, unless it knows where the attackers are coming from: then it
//    takes a spot covering the way in nearest them (each bot a different one, off to the side of it, crouched, leaning out
//    from the edge of cover) and waits there;
//  - it shoots only what it is looking at, after a human reaction, with an aim that settles; leans round corners to see and
//    shoot; shoots through soft walls at someone it has just heard or just lost behind one (never at a guess, never through
//    brick or concrete);
//  - it shares what it sees and hears, reloads behind cover, backs off when hurt or empty, runs from a grenade, looks away
//    from a flashbang, and stops shooting anyone once they are down.
const LEAN_D = 0.38;
class AIBot extends Dummy {
  constructor(pos, o) {
    super(pos.x, pos.z, 'ai', null, AI_PAL);
    o = o || {};
    this.pos = pos.clone(); this.home = this.pos; this.yaw = o.yaw || 0; this.pitch = 0; this.ayaw = this.yaw; this.apitch = 0;
    this.w = o.w === undefined ? 0 : o.w; this.mag = WEAPONS[this.w].cap; this.pid = o.pid || 0; this.hostP = o.hostP || null; this.name = o.name || 'AI';
    this.post = (o.post || pos).clone(); this.zone = o.zone || 6; this.traps = o.traps || []; this.area = o.area || null; this.entries = o.entries || [];
    this.state = 'idle'; this.path = null; this.pathT = 0; this.goal = null; this.thinkT = Math.random() * 0.2; this.know = new Map(); this.tgt = null;
    this.errY = 0; this.errP = 0; this.fireT = 0; this.burst = 0; this.reloadT = 0; this.err = 0.15; this.engT = 0; this.recoil = 0; this.crouchK = 0; this.strafe = 0; this.strafeT = 0;
    this.lean = 0; this.leanK = 0; this.vel = new V3(); this.speedNow = 0; this.stepD = 0; this.lookYaw = this.yaw; this.lookP = 0; this.waitT = 0; this.sendT = 0; this.callT = 0; this.defuseT = 0;
    this.camp = null; this.campT = 0; this.wb = null; this.dodgeT = 0; this.visited = [];
    // its kit (what it picked): gadget and how many, a throwable and how many, what it wears on its head
    this.lo = o.lo || aiLoadout(0, false, this.w); this.gN = this.lo.gN; this.tN = this.lo.tN;
    this.stance = 0; this.proneK = 0; this.yawV = 0; this.seeT = 0; this.reactD = rnd(0.16, 0.32); this.act = null; this.myNades = []; this.throwCD = rnd(2, 5); this.avert = null; this.shieldCamp = null; this.proneFor = 0;
    this.hum.root.position.copy(this.pos); this.hum.root.rotation.y = this.yaw;
    AIS.push(this);
  }
  // the eye, out to the side when leaning
  get eyeH() { return 1.62 - 0.55 * this.crouchK * (1 - this.proneK) - 1.27 * this.proneK; }
  get eye() { const r = this.leanK * LEAN_D * (1 - this.proneK), f = this.proneK * 0.55; return new V3(this.pos.x + Math.cos(this.ayaw) * r - Math.sin(this.ayaw) * f, this.pos.y + this.eyeH - Math.abs(this.leanK) * 0.05, this.pos.z - Math.sin(this.ayaw) * r - Math.cos(this.ayaw) * f); }
  eyeAt(side) { const r = side * LEAN_D * (1 - this.proneK); return new V3(this.pos.x + Math.cos(this.ayaw) * r, this.pos.y + this.eyeH, this.pos.z - Math.sin(this.ayaw) * r); }
  // an action with the free hand: throwing (1) or putting something down (2); fn runs at the moment of release
  startAct(k, dur, fn) { this.act = { k, t: 0, dur, fn, rel: k === 1 ? 0.55 : 0.72, done: false }; this.path = null; }
  inA(p) { const A = this.area; return !A || (p.x > A.x0 && p.x < A.x1 && p.z > A.z0 && p.z < A.z1); }
  // ---- the body: turning, walking, leaning, the gun; the thinking runs ten times a second
  aiTick(dt, a, root) {
    if (this.out) return;
    const live = this.active();
    this.thinkT -= dt; if (live && this.thinkT <= 0) { this.thinkT = 0.1; this.perceive(0.1); this.decide(); this.doorAhead(); this.claymores(); }
    const blind = (this.flashT || 0) > 0;
    let ty = this.lookYaw, tp = this.lookP;
    const T = this.tgt && this.know.get(this.tgt.id);
    if (live && T && T.vis) this.seeT += dt; else this.seeT = 0;
    if (live && this.tgt && T && T.vis && !blind && this.seeT > this.reactD) {
      const d = this.aimPoint(this.tgt).sub(this.eye);
      ty = Math.atan2(-d.x, -d.z) + this.errY; tp = Math.atan2(d.y, Math.hypot(d.x, d.z)) + this.errP;
    } else if (live && this.wb) { const d = this.wb.p.clone().sub(this.eye); ty = Math.atan2(-d.x, -d.z); tp = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
    // turning like a body: it speeds up into a turn and slows onto the mark (quick once it is fighting, unhurried on patrol,
    // never a snap); a flashbang leaves it groping
    // walking: it faces where it is going; only a target it is shooting at or has in its sights turns it off its way
    const walking = live && !this.act && this.path && this.path.length && this.proneK < 0.3 && !(T && T.vis) && !this.wb;
    // (what holds its eyes, most first: someone in its sights or being shot at, the spot it is firing through, a sound or
    // shot it heard in the last couple of seconds, then the way it is walking, then whatever it is watching standing still)
    const fresh = this.noise && performance.now() - this.noise.t < 2200 ? this.noise.p : null;
    if (live && fresh && !(T && T.vis) && !this.wb) { ty = Math.atan2(-(fresh.x - this.pos.x), -(fresh.z - this.pos.z)); tp = 0; }
    else if (walking) { const n = this.path[0]; if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) > 0.05) { ty = Math.atan2(-(n.x - this.pos.x), -(n.z - this.pos.z)); tp = 0; } }
    if (this.avert) { ty = Math.atan2(this.avert.x - this.pos.x, this.avert.z - this.pos.z); }
    const fight = !!(this.tgt && T && T.vis) || !!this.wb, maxV = blind ? 1.2 : fight ? 6.5 : this.state === 'patrol' || this.state === 'camp' ? 2.4 : 3.8, acc = fight ? 30 : 12;
    const want = clamp(angWrap(ty - this.ayaw) * 7, -maxV, maxV); this.yawV += clamp(want - this.yawV, -acc * dt, acc * dt); this.ayaw = angWrap(this.ayaw + this.yawV * dt);
    this.apitch += clamp((tp - this.apitch) * Math.min(1, dt * 9), -3 * dt, 3 * dt);
    this.recoil = Math.max(0, this.recoil - dt * 0.45);
    this.yaw = this.ayaw; this.pitch = this.apitch + this.recoil;
    // walking: along the path, looking where the danger is rather than at its feet
    let sp = 0, mv = null;
    const engaged = this.tgtVis() || !!this.wb;
    // the hands busy: standing (or kneeling) still till it is done
    if (this.act) { const A = this.act; A.t += dt; if (!A.done && A.t / A.dur >= A.rel) { A.done = true; try { A.fn(); } catch (er) {} } if (A.t >= A.dur) this.act = null; }
    if (this.avert) { this.avert.t -= dt; if (this.avert.t <= 0) this.avert = null; }
    if (!this.act && (live && this.path && this.path.length && !engaged && this.dodgeT <= 0 || (live && this.dodgeT > 0 && this.path && this.path.length))) {
      const n = this.path[0], dx = n.x - this.pos.x, dz = n.z - this.pos.z, L = Math.hypot(dx, dz);
      // (a waypoint counts as reached only at its height too: one on a step is not reached standing on the floor beside it)
      const dy = Math.abs(n.y - this.pos.y);
      if (L < 0.25 && dy < 0.3) { this.path.shift(); this.pgD = 1e9; }
      else if (L < 0.05) { this.path = null; this.pgD = 1e9; }   // (right under or over it and not at its height: no way there from here)
      else {
        sp = this.moveSpeed(); mv = new V3(dx / L, 0, dz / L);
        // (no closer to the next waypoint for two seconds, though it keeps sliding about: give the path up and work out another)
        const d3 = L + dy; if (this.pgN !== n) { this.pgN = n; this.pgD = 1e9; this.pgT = 0; } if (!(d3 < this.pgD - 0.05)) { this.pgT = (this.pgT || 0) + dt; if (this.pgT > 2) { this.path = null; this.pgT = 0; this.pgD = 1e9; } } else { this.pgD = d3; this.pgT = 0; }
      }
    }
    if (this.dodgeT > 0) this.dodgeT -= dt;
    if (live && engaged && this.strafeT > 0) { this.strafeT -= dt; const s = new V3(Math.cos(this.ayaw), 0, -Math.sin(this.ayaw)).multiplyScalar(this.strafe); const q = this.pos.clone().addScaledVector(s, 0.4); if (this.inA(q)) { mv = s; sp = 2; } }
    if (this.anat.legBroken('L') || this.anat.legBroken('R')) sp *= 0.45;
    if (Math.abs(this.leanK) > 0.3) sp = Math.min(sp, 1.2);
    // (lying down: up first; walking backwards or sideways to keep its eyes on the threat is slower)
    if (this.proneK > 0.3) sp = 0; else if (this.crouchK > 0.5) sp = Math.min(sp, 1.5);
    if (mv && sp > 0) { const fd = -(mv.x * Math.sin(this.ayaw) + mv.z * Math.cos(this.ayaw)); if (fd < -0.3) sp *= 0.55; else if (fd < 0.5) sp *= 0.75; }
    this.speedNow = damp(this.speedNow, sp, 10, dt);
    if (mv && this.speedNow > 0.05) {
      const nx = this.pos.x + mv.x * this.speedNow * dt, nz = this.pos.z + mv.z * this.speedNow * dt, y = this.pos.y;
      const fy = floorUnder(nx, nz, y + 0.6);
      const ok = (x, z) => { const y = floorUnder(x, z, this.pos.y + 0.6); return !navBlocked(x, y + 0.45, z, 1.25, 0.15) && !this.doorShut(x, z) ? y : null; };
      let y2 = ok(nx, nz), qx = nx, qz = nz;
      // (caught on a corner: slide along it; only properly stuck for a while does it give up the path)
      if (y2 === null) { y2 = ok(nx, this.pos.z); qz = this.pos.z; if (y2 === null) { y2 = ok(this.pos.x, nz); qx = this.pos.x; qz = nz; } }
      if (y2 !== null) { this.vel.set((qx - this.pos.x) / dt, 0, (qz - this.pos.z) / dt); this.pos.set(qx, y2, qz); this.stuckT = 0; }
      else { this.vel.set(0, 0, 0); this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 1.2 && !this.doorShut(nx, nz)) { this.stuckT = 0; this.path = null; } }
    } else this.vel.set(0, 0, 0);
    { const fy = floorUnder(this.pos.x, this.pos.z, this.pos.y + 0.6); if (this.pos.y > fy + 0.02) this.pos.y = Math.max(fy, this.pos.y - 6 * dt); else this.pos.y = fy; }
    if (this.speedNow > 0.5) { this.stepD += this.speedNow * dt; const stride = this.speedNow > 3.5 ? 0.95 : 0.7; if (this.stepD > stride) { this.stepD = 0; const dd = camera.position.distanceTo(this.pos); if (dd < 40) footSound(this.pos, surfaceAt(this.pos), this.crouchK > 0.5 ? 0.3 : this.speedNow > 3.5 ? 1.1 : 0.6, dd); } }
    // leaning: only standing still (or nearly)
    this.leanK = damp(this.leanK, this.speedNow < 1.3 && this.stance < 2 && !this.act ? this.lean : 0, 7, dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = WEAPONS[this.w].cap; }
    this.fireT -= dt; if (live && !blind && this.reloadT <= 0 && !this.act && !(this.proneK > 0.15 && this.proneK < 0.85)) this.tryFire(dt);
    // standing, kneeling or lying: what decide() asked for (lying takes a second to get down and up)
    const st = live ? this.stance : 0;
    this.proneK = damp(this.proneK, st === 2 && this.speedNow < 0.3 ? 1 : 0, 2.6, dt);
    this.crouchK = damp(this.crouchK, st === 1 || (this.act && this.act.k === 2) ? 1 : 0, 6, dt);
    root.position.copy(this.pos); root.rotation.y = this.yaw;
    Object.assign(a, { speed: this.speedNow, crouch: this.crouchK, prone: this.proneK, pitch: this.pitch, weapon: this.w, lean: this.leanK, ads: engaged ? 1 : 0.2, sprint: this.speedNow > 5 ? 1 : 0, reload: this.reloadT > 0 ? 1 - this.reloadT / 2.6 + 0.001 : 0,
      act: this.act ? this.act.k + Math.min(0.999, this.act.t / this.act.dur) : 0, hg: this.hgCode() });
  }
  hgCode() { const h = this.lo.hg; return h === 'gasmask' ? 1 : h === 'nvg' ? ((P.envDay === undefined ? 1 : P.envDay) < 0.4 ? 3 : 2) : 0; }
  active() {
    if (S.mode === 'test') return true;
    if (!this.hostP || !this.hostP.alive) return false;
    const H = net.host; return !!H && H.R.ph === 'live' && !H.frozen();
  }
  tgtVis() { const T = this.tgt && this.know.get(this.tgt.id); return !!(T && T.vis); }
  moveSpeed() { return this.state === 'hunt' ? 1.9 : this.state === 'rush' || this.state === 'defuse' || this.state === 'fall' || this.state === 'dodge' ? 4.6 : this.state === 'move' ? 3 : 1.35; }
  aimPoint(t) {
    const h = t.dn ? 0.35 : t.pr > 0.5 ? 0.3 : 1.62 - 0.6 * (t.c || 0);
    // (head, or under the plate: the pelvis; the chest only when it has nothing better)
    const y = t.dn ? h : this.aimZ === 'head' ? h - 0.07 : this.aimZ === 'hips' ? h * 0.56 : h * 0.78;
    const lead = 0.07, vx = t.self ? P.vel.x : (t.r.tpos.x - t.r.pos.x) * 12, vz = t.self ? P.vel.z : (t.r.tpos.z - t.r.pos.z) * 12;
    return new V3(t.pos.x + vx * lead, t.pos.y + y, t.pos.z + vz * lead);
  }
  // a closed door right where it is about to step (it opens inside doors itself; outside ones stay shut)
  doorShut(x, z) {
    if (typeof doors === 'undefined') return false;
    for (const d of doors) { if (d.fallen || Math.abs(d.a) > 0.5) continue; const c = d.g.position; if (Math.hypot(c.x - x, c.z - z) < 0.45 && Math.abs(c.y - this.pos.y) < 1.5) return true; }
    return false;
  }
  outsideDoor(d) {
    if (!this.area) return false; const c = d.g.position, f = new V3(0, 0, 1).applyQuaternion(d.g.quaternion);
    return !this.inA(c.clone().addScaledVector(f, 0.9)) || !this.inA(c.clone().addScaledVector(f, -0.9));
  }
  // ---- seeing and hearing
  perceive(dt) {
    const now = performance.now(), blind = (this.flashT || 0) > 0 || ((this.gasK || 0) > 0.45 && this.lo.hg !== 'gasmask'), smoke = (this.smokeK || 0) > 0.5;
    const e0 = this.eyeAt(0), eL = this.eyeAt(-1), eR = this.eyeAt(1), fwd = new V3(-Math.sin(this.ayaw), 0, -Math.cos(this.ayaw));
    const TG = aiTargets(); let leanVote = 0;
    for (const t of TG) {
      let K = this.know.get(t.id); if (!K) { K = { aw: 0, seen: 0, last: null, vis: false, heard: 0, heardP: null }; this.know.set(t.id, K); }
      const dx = t.pos.x - e0.x, dz = t.pos.z - e0.z, d = Math.hypot(dx, dz), cs = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / d : 1;
      let vis = false, side = 0;
      if (!blind && !smoke && d < 70 && (cs > AI_FOV || d < 2.2)) {
        const h = t.dn ? 0.35 : t.pr > 0.5 ? 0.3 : 1.55 - 0.6 * (t.c || 0), hd = new V3(t.pos.x, t.pos.y + h, t.pos.z), bd = new V3(t.pos.x, t.pos.y + h * 0.55, t.pos.z);
        if (aiSees(e0, hd) || aiSees(e0, bd)) vis = true;
        // round the corner: what it would see leaning out either way (only standing, only near enough to matter)
        else if (this.speedNow < 1.3 && d < 30) { if (aiSees(eR, hd)) { vis = true; side = 1; } else if (aiSees(eL, hd)) { vis = true; side = -1; } }
      }
      if (vis) {
        let lit = t.fl ? 1.5 : clamp((lightLevel(new V3(t.pos.x, t.pos.y + 1, t.pos.z)) || 0) * 2.5, 0.35, 1);
        // night vision down: the dark hides nobody, but a light shone at it whites the tube out
        if (this.hgCode() === 3) lit = t.fl && cs > 0.7 && d < 18 ? 0.45 : Math.max(lit, 0.95);
        const rate = (7 / (1 + d * 0.1)) * (0.7 + Math.min(1, t.v / 3)) * lit * (0.6 + Math.max(0, cs)) * (t.c > 0.5 ? 0.75 : 1) + (d < 4 ? 10 : 0);
        K.aw = Math.min(1.5, K.aw + rate * dt * (K.seen && now - K.seen < 4000 ? 4 : 1));
      } else K.aw = Math.max(0, K.aw - dt * 0.25);
      K.vis = vis && K.aw >= 1; K.side = side;
      if (K.vis) { if (!K.wasVis) { this.engT = 0; this.err = 0.11 + Math.random() * 0.06; } K.seen = now; K.last = t.pos.clone(); K.lastH = t.c > 0.5 ? 1.0 : 1.35; K.vel = t.self ? P.vel.clone() : t.r.tpos.clone().sub(t.r.pos).multiplyScalar(12); this.callout(t, K.last); if (side) leanVote = side; }
      // a body just seen ducking behind a wall: where it was going
      if (!K.vis && K.wasVis) K.lostT = now;
      K.wasVis = K.vis;
      // footsteps: a sprint carries, a crouch-walk barely does (through walls, less)
      const fr = t.v > 5 ? 16 : t.v > 3 ? 10 : t.v > 0.6 ? (t.c > 0.5 ? 2.2 : 5.5) : 0;
      if (fr && d < fr * 0.45 + 1 || (fr && d < fr && aiClear(e0, new V3(t.pos.x, t.pos.y + 1, t.pos.z)))) if (!K.vis) { K.heard = now; K.heardP = t.pos.clone(); K.last = t.pos.clone().add(new V3(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6))); K.lastH = t.c > 0.5 ? 1.0 : 1.35; }
      K.t = t;
    }
    for (const id of [...this.know.keys()]) if (!TG.some(t => t.id === id)) this.know.delete(id);
    // shots and blasts (where from, roughly; closer is more exact)
    if (!((this.deafT || 0) > 0)) for (const n of AI_NOISE) { if (now - n.t > 400 || (n.heardBy && n.heardBy.has(this))) continue; (n.heardBy || (n.heardBy = new Set())).add(this);
      const d = n.p.distanceTo(this.pos); if (d > n.r || (n.by && AIS.some(b => b.pid && b.pid === n.by)) || n.by === -1) continue;
      this.noise = { p: n.p.clone().add(new V3(rnd(-1, 1) * d / 25, 0, rnd(-1, 1) * d / 25)), t: now }; AI_SQUAD.see(this.noise.p, now); }
    // who to shoot: in view, nearest first; never someone already down
    let best = null, bs = 1e9;
    for (const K of this.know.values()) { if (!K.vis || !K.t) continue; const t = K.t; if (t.dn) continue; const s = t.pos.distanceTo(this.pos); if (s < bs) { bs = s; best = t; } }
    if (best) { if (!this.tgt || this.tgt.id !== best.id) { this.engT = 0; this.err = 0.11 + Math.random() * 0.06; const r = Math.random(), hp = bs < 12 ? 0.5 : 0.28; this.aimZ = r < hp ? 'head' : r < hp + 0.3 ? 'hips' : 'chest'; } this.tgt = best; this.dist = bs; }
    else if (this.tgt && !this.tgtVis()) this.tgt = null;
    // leaning: out to whichever side it can see them from; otherwise round the edge it is covering
    this.lean = best ? (this.know.get(best.id).side || 0) : leanVote || (this.state === 'camp' && this.campLean ? this.campLean : 0);
    this.wallbang(now);
  }
  // ---- through the wall: someone heard right behind a thin wall, or just lost behind one, close; only through drywall,
  // plywood, a door or boards (never brick, concrete or metal); a short burst, then it waits to see what happens
  wallbang(now) {
    this.wb = null; if (this.tgtVis() || this.reloadT > 0 || this.mag < 4) return;
    for (const K of this.know.values()) {
      if (!K.t || K.t.dn) continue;
      const fresh = (K.heard && now - K.heard < 700 && K.heardP) || (K.lostT && now - K.lostT < 900 && K.last);
      if (!fresh) continue;
      // (where they must be now: the step it heard, or where they were heading when they went behind the wall)
      const base = K.heard && now - K.heard < 700 ? K.heardP : K.last.clone().addScaledVector(K.vel || new V3(), Math.min(0.6, (now - K.lostT) / 1000));
      const q = base.clone().setY(base.y + (K.lastH || 1.3)), e = this.eye, d = q.distanceTo(e);
      if (d > 9 || d < 1.2 || !this.inA(this.pos)) continue;
      const soft = aiSoftOnly(e, q); if (!soft) continue;
      // (and not with one of its own in the way)
      if (AIS.some(b => b !== this && !b.dead && !b.out && distToSeg(b.pos.clone().setY(b.pos.y + 1.2), e, q) < 0.6)) continue;
      this.wb = { p: q, n: 3 + Math.floor(Math.random() * 3), t: now }; return;
    }
  }
  callout(t, p) {
    const now = performance.now(); if (now - this.callT < 900) return; this.callT = now; AI_SQUAD.see(p, now);
    for (const b of AIS) if (b !== this && !b.dead && !b.out && b.pos.distanceTo(this.pos) < 60) setTimeout(() => { if (b.dead) return; let K = b.know.get(t.id); if (!K) { K = { aw: 0, seen: 0, last: null, vis: false, heard: 0 }; b.know.set(t.id, K); } if (!K.vis) { K.last = p.clone(); K.heard = Math.max(K.heard || 0, performance.now() - 300); K.heardP = null; K.aw = Math.max(K.aw, 0.6); } }, 600 + Math.random() * 500);
  }
  // ---- what to do now
  decide() {
    this.throwCD -= 0.1;
    // hands busy: carry on (a trap being put down is dropped if someone shows up)
    if (this.act) { if (this.act.k !== 1 && this.tgtVis()) this.act = null; else return; }
    this.decide0(); this.pickStance();
  }
  // standing, kneeling or lying down, for what it is doing
  pickStance() {
    let st = 0; const eng = this.tgtVis(), now = performance.now();
    if (this.dodgeT > 0 || this.state === 'dodge' || this.state === 'fall') st = 0;
    else if (this.state === 'camp') st = this.campStance || 0;
    else if (eng && this.speedNow < 0.5) {
      if (this.proneFor === this.tgt.id && this.stance === 2) st = 2;
      else if (this.dist > 14 && Math.abs(this.leanK) < 0.2 && (this.w === 2 || Math.random() < 0.03) && this.roomToLie(this.tgt.pos)) { this.proneFor = this.tgt.id; st = 2; }
      else st = this.dist > 9 || this.w === 2 ? 1 : 0;
    } else if (this.state === 'hunt' && this.goal && this.pos.distanceTo(this.goal) < 7 && !(this.pushT > now)) st = 1;
    else if (this.reloadT > 0 && this.speedNow < 0.5) st = 1;
    this.stance = st;
  }
  // room to lie down facing p (the legs go out behind) with the gun still on it
  roomToLie(p) {
    const y = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)), fx = -Math.sin(y), fz = -Math.cos(y), b = this.pos;
    for (const k of [-1.1, -0.55, 0.45]) if (navBlocked(b.x + fx * k, b.y + 0.08, b.z + fz * k, 0.38, 0.2)) return false;
    return aiSees(new V3(b.x + fx * 0.55, b.y + 0.35, b.z + fz * 0.55), new V3(p.x, p.y + 0.9, p.z));
  }
  // ---- grenades: a frag onto someone it heard or just lost close by (never with one of its own near it), a flashbang ahead
  // of going in after them or onto a doorway they are stacked at
  handPos() { return this.eye.add(new V3(0, 0.18, 0)); }
  tryThrow(now) {
    if (this.tN <= 0 || this.throwCD > 0 || this.reloadT > 0) return false;
    const kind = this.lo.t; let best = null;
    for (const K of this.know.values()) { if (K.vis || !K.last || !K.t || K.t.dn) continue; const t = Math.max(K.seen || 0, K.heard || 0); if (now - t > 2500 || (K.seen && now - K.seen < 600)) continue; if (!best || t > best.t) best = { p: K.last.clone(), t }; }
    // (or a shot or a call-out: where it came from)
    if (this.noise && now - this.noise.t < 2500 && (!best || this.noise.t > best.t)) best = { p: this.noise.p.clone(), t: this.noise.t };
    if (!best) return false;
    const q = best.p, d = Math.hypot(q.x - this.pos.x, q.z - this.pos.z), atDoor = this.entries.some(e => Math.hypot(e.p.x - q.x, e.p.z - q.z) < 4.5);
    if (kind === 'frag') { if (d < 6.5 || d > 20 || now - (AI_SQUAD.fragT || 0) < 3500 || (!this.inA(q) && !atDoor) || AIS.some(b => !b.dead && !b.out && b.pos.distanceTo(q) < 6.5)) return false; }
    else if (d < 3.5 || d > 13 || now - (AI_SQUAD.flashT || 0) < 3000 || !(this.state === 'hunt' || atDoor)) return false;
    // (an arc that would not get there is worked out again only after a second, not every tenth of one)
    if (now < (this.lobNo || 0)) return false;
    const v = aiLob(this.handPos(), q.clone().setY(q.y + 0.1)); if (!v) { this.lobNo = now + rnd(900, 1400); return false; }
    // turned to it first
    const ty = Math.atan2(-(q.x - this.pos.x), -(q.z - this.pos.z)); this.lookYaw = ty; this.lookP = 0.3; this.path = null; this.state = 'throw';
    if (Math.abs(angWrap(ty - this.ayaw)) > 0.35) return true;
    this.tN--; this.throwCD = kind === 'frag' ? rnd(6, 10) : rnd(5, 8); AI_SQUAD[kind === 'frag' ? 'fragT' : 'flashT'] = now;
    this.startAct(1, 0.95, () => this.throwNade(kind, q));
    if (kind === 'flash' && this.state === 'throw') this.pushT = now + 2800;
    return true;
  }
  throwNade(kind, q) {
    const o = this.handPos(), v = aiLob(o, q.clone().setY(q.y + 0.1)) || q.clone().sub(o).setY(0).normalize().multiplyScalar(9).setY(4);
    const fuse = kind === 'frag' ? rnd(2.1, 2.7) : rnd(1.5, 1.9), id = explSeq++, w = new V3(rnd(-12, 12), rnd(-6, 6), rnd(-12, 12));
    noiseHit(700, 0.12, 0.06);
    if (kind === 'flash') this.avert = { x: q.x, z: q.z, t: fuse + 0.5 };
    if (this.hostP && net.host) { net.host.onMessage(this.hostP, { t: 'x', a: 'nade', k: kind, i: id, p: o.toArray().map(r3), v: v.toArray().map(r3), f: r3(fuse), w: w.toArray().map(r3), c: 0 }); this.myNades.push({ id, kind, t: fuse, q: q.clone() }); }
    else throwNade(-1 - (this.slot || 0), id, o, v, fuse, true, w, 0, kind);
  }
  // (in a raid the host's copy of its grenade is only for show: the bang is sent as the bot's, where the grenade has got to)
  nadeBoom(n) {
    if (!this.hostP || !net.host) return; const o = NADES.find(x => x.owner === this.pid && x.id === n.id), p = o ? o.p : n.q;
    net.host.onMessage(this.hostP, { t: 'x', a: 'boom', k: n.kind, i: n.id, p: p.toArray().map(r3) });
  }
  decide0() {
    const now = performance.now(), an = this.anat, hurt = an.blood < 3200 || hurtLevel(an) > 0.6;
    // gas without a mask: out of it
    if ((this.gasK || 0) > 0.3 && this.lo.hg !== 'gasmask' && this.dodgeT <= 0) { this.dodgeT = 2; this.runFrom(this.pos.clone()); return; }
    // a grenade at its feet: get away from it; a flashbang in view: look away
    for (const n of (typeof NADES !== 'undefined' ? NADES : [])) {
      const d = n.p.distanceTo(this.pos);
      if (n.kind === 'frag' && d < 5.5 && this.dodgeT <= 0) { this.dodgeT = 1.4; this.runFrom(n.p); return; }
      if (n.kind === 'flash' && d < 12 && (!this.hostP || n.owner !== this.pid) && aiSees(this.eye, n.p)) { this.avert = { x: n.p.x, z: n.p.z, t: Math.max(0.3, n.fuse + 0.3) }; this.tgt = null; return; }
    }
    if (this.dodgeT > 0) return;
    if (this.tgtVis()) {
      this.state = 'engage'; this.path = null;
      // a small step aside now and then (never out of the building, never forward)
      if (this.strafeT <= 0 && Math.random() < 0.015 && this.speedNow < 0.5 && !this.leanK) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = rnd(0.25, 0.6); }
      if ((this.mag === 0 && this.dist < 12) || (hurt && Math.random() < 0.05) || (this.mag < 6 && this.dist < 7 && Math.random() < 0.2)) this.fallBack();
      return;
    }
    if (this.wb) { this.state = 'engage'; this.path = null; return; }
    // reload while nothing is in view
    if (this.mag < WEAPONS[this.w].cap * 0.4 && this.reloadT <= 0) this.reload();
    if (this.tryThrow(now)) return;
    const site = this.plantSite();
    if (site) {
      if (this.pos.distanceTo(site) < 1.6) { this.state = 'defuse'; this.path = null; this.defuseT += 0.1; if (this.defuseT > 6.5) { this.defuseT = 0; this.disable(); } return; }
      this.defuseT = 0; this.goTo(site, 'defuse'); return;
    }
    // what it knows: the latest place an attacker was seen or heard (its own, or called out)
    let lk = null, lt = 0; for (const K of this.know.values()) { const t = Math.max(K.seen || 0, K.heard || 0); if (K.last && t > lt) { lt = t; lk = K.last; } }
    if (this.noise && this.noise.t > lt) { lt = this.noise.t; lk = this.noise.p; }
    const sq = AI_SQUAD.last(); if (sq && sq.t > lt) { lt = sq.t; lk = sq.p; }
    const age = now - lt; if (lk) this.threat = { p: lk, t: lt };
    // inside, close and fresh: two of them go after it, carefully, guns on where it was; the rest cover the ways to them
    if (lk && age < 9000 && this.inA(lk)) {
      const hunters = AIS.filter(b => b !== this && b.state === 'hunt' && !b.dead && !b.out).length;
      if (hunters < 2 && !hurt && this.mag > 8) {
        this.lookYaw = Math.atan2(-(lk.x - this.pos.x), -(lk.z - this.pos.z)); this.lookP = 0;
        if (!this.goal || this.goal.distanceTo(lk) > 1.5 || !this.path || !this.path.length) this.goTo(lk, 'hunt');
        if (this.pos.distanceTo(lk) < 1.2) { this.forget(lk); this.path = null; }
        return;
      }
    }
    // outside (or the hunt is covered): hold a spot that covers the way in nearest to it
    if (lk && age < 22000) { this.campOn(lk, now); return; }
    // nothing known yet: the traps and boards first
    const tr = this.traps.find(t => !t.done);
    if (tr) {
      if (this.pos.distanceTo(tr.p) < (tr.k === 'shield' ? 0.9 : 1.1) || (tr.k === 'bd' && Math.hypot(this.pos.x - tr.p.x, this.pos.z - tr.p.z) < 2.2)) {
        // facing it, then down on one knee to set it (or the boards nailed up at the window)
        const ty = Math.atan2(-(tr.p.x - this.pos.x), -(tr.p.z - this.pos.z)); this.lookYaw = tr.k === 'shield' ? tr.f : ty; this.path = null; this.state = 'place';
        if (Math.abs(angWrap(this.lookYaw - this.ayaw)) < 0.3) this.startAct(tr.k === 'bd' ? 3 : 2, tr.k === 'bd' ? 1.6 : tr.k === 'shield' ? 1.3 : 1.0, () => { tr.done = true; this.placeTrap(tr); });
      }
      else if (this.goal && this.goal.distanceTo(tr.p) < 0.1 && !this.path) { tr.tries = (tr.tries || 0) + 1; this.goal = null; if (tr.tries > 8) tr.done = true; }
      else this.goTo(tr.p, 'rush');
      return;
    }
    this.patrol(now);
  }
  // patrol: always going somewhere in its part of the building, a short pause and a look round at each stop, the guns on
  // the doorways and windows as it goes
  patrol(now) {
    this.camp = null; this.campLean = 0;
    if (this.path && this.path.length) { this.state = 'patrol'; this.lookAtWay(); return; }
    this.state = 'patrol'; this.waitT -= 0.1;
    if (this.waitT > 0) { if (Math.random() < 0.025) { const en = this.entries[Math.floor(Math.random() * Math.max(1, this.entries.length))]; this.lookYaw = en && Math.random() < 0.6 ? Math.atan2(-(en.p.x - this.pos.x), -(en.p.z - this.pos.z)) : this.ayaw + rnd(-1.6, 1.6); } return; }
    this.waitT = rnd(4, 10);
    // (a good part of the time it stays put a while longer, watching a way in)
    if (Math.random() < 0.35) { this.waitT += rnd(4, 9); return; }
    const N = navFor(this.post), cand = [];
    for (let k = 0; k < 60 && cand.length < 12; k++) { const n = N.nodes[Math.floor(Math.random() * N.nodes.length)]; if (!n || !this.inA(n) || Math.abs(n.y - this.post.y) > 0.6) continue; const dp = Math.hypot(n.x - this.post.x, n.z - this.post.z), dm = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      if (dp < this.zone + 2 && dm > 2.5 && dm < 9 && !this.visited.some(v => Math.hypot(v.x - n.x, v.z - n.z) < 2)) cand.push(n); }
    const n = cand[0] || N.nodes.find(q => this.inA(q) && Math.hypot(q.x - this.post.x, q.z - this.post.z) < this.zone);
    if (n) { this.visited.push({ x: n.x, z: n.z }); if (this.visited.length > 6) this.visited.shift(); this.goTo(new V3(n.x, n.y, n.z), 'patrol'); }
  }
  lookAtWay() {
    // (moving: eyes ahead, swinging onto any doorway or window it passes close to)
    const n = this.path[0]; let y = Math.atan2(-(n.x - this.pos.x), -(n.z - this.pos.z));
    // (a threat it knows about: eyes and gun stay on it, wherever it walks)
    const th = this.threat; if (th && performance.now() - th.t < 15000 && Math.hypot(th.p.x - this.pos.x, th.p.z - this.pos.z) < 30) { this.lookYaw = Math.atan2(-(th.p.x - this.pos.x), -(th.p.z - this.pos.z)); this.lookP = 0; return; }
    for (const en of this.entries) { const d = Math.hypot(en.p.x - this.pos.x, en.p.z - this.pos.z); if (d < 6 && d > 1 && aiSees(this.eyeAt(0), en.p.clone().setY(en.p.y + 1.3))) { y = Math.atan2(-(en.p.x - this.pos.x), -(en.p.z - this.pos.z)); break; } }
    this.lookYaw = y; this.lookP = 0;
  }
  // a spot covering the way in nearest the threat: off to its side, 3-8 m back, on the same floor, with a clear line to it;
  // every bot a different way in (or a different spot on the same one)
  campOn(lk, now) {
    if (!this.entries.length) { this.patrol(now); return; }
    if (this.camp && this.campT > now && this.camp.lk.distanceTo(lk) < 6) { this.holdCamp(); return; }
    const taken = AIS.filter(b => b !== this && b.camp).map(b => b.camp.en);
    const ens = this.entries.slice().sort((a, b) => a.p.distanceTo(lk) - b.p.distanceTo(lk));
    let en = ens.find(x => !taken.includes(x)) || ens[(this.slot || 0) % ens.length];
    // (its own shield, if it put one up covering one of the two ways in nearest the threat: behind that)
    const SC = this.shieldCamp; if (SC && ens.slice(0, 2).includes(SC.en) && !AIS.some(b => b !== this && b.camp && b.camp.p.distanceTo(SC.p) < 1)) {
      this.camp = { en: SC.en, p: SC.p.clone(), lk: lk.clone(), shield: true }; this.campT = now + rnd(14000, 22000); this.campWish = 1; this.goTo(this.camp.p, 'move'); return; }
    const far = this.w === 2 ? 12 : 8.5;
    const N = navFor(this.pos); let best = null, bs = -1e9;
    const inDir = en.dir.clone().negate();
    for (let k = 0; k < 140; k++) {
      const n = N.nodes[Math.floor(Math.random() * N.nodes.length)]; if (!n || !this.inA(n) || Math.abs(n.y - en.p.y) > 0.6) continue;
      const v = new V3(n.x - en.p.x, 0, n.z - en.p.z), d = v.length(); if (d < 3 || d > far) continue;
      const ang = v.normalize().dot(inDir); if (ang < 0.15) continue;   // (inside, in front of it)
      const eye = new V3(n.x, n.y + 1.1, n.z); if (!aiSees(eye, en.p.clone().setY(en.p.y + 1.1))) continue;
      // off the straight line in (not in plain view from outside), near a wall (cover), not on a trap, not on another bot
      const off = 1 - ang, cover = navBlocked(n.x + 0.45, n.y + 0.5, n.z, 0.8, 0.1) || navBlocked(n.x - 0.45, n.y + 0.5, n.z, 0.8, 0.1) || navBlocked(n.x, n.y + 0.5, n.z + 0.45, 0.8, 0.1) || navBlocked(n.x, n.y + 0.5, n.z - 0.45, 0.8, 0.1);
      if (AIS.some(b => b !== this && b.camp && Math.hypot(b.camp.p.x - n.x, b.camp.p.z - n.z) < 2)) continue;
      const s = off * 2 + (cover ? 1.5 : 0) - Math.abs(d - (this.w === 2 ? 8 : this.w === 5 ? 3.5 : 5)) * 0.3 + Math.random() * 0.4; if (s > bs) { bs = s; best = n; }
    }
    if (!best) { this.patrol(now); return; }
    this.camp = { en, p: new V3(best.x, best.y, best.z), lk: lk.clone() }; this.campT = now + rnd(16000, 30000);
    // (lying down covering it if it is far enough off and there is room; the sniper likes to; otherwise mostly kneeling)
    this.campWish = (this.w === 2 ? 0.7 : best && Math.hypot(best.x - en.p.x, best.z - en.p.z) > 5.5 ? 0.3 : 0) > Math.random() ? 2 : Math.random() < 0.6 ? 1 : 0;
    // (which way to lean to look round its cover at the way in)
    this.campLean = 0;
    this.goTo(this.camp.p, 'move');
  }
  holdCamp() {
    const c = this.camp;
    if (this.pos.distanceTo(c.p) > 0.6) { if (!this.path || !this.path.length) this.goTo(c.p, 'move'); this.state = 'move'; if (this.path && this.path.length) this.lookAtWay(); return; }
    this.state = 'camp'; this.path = null;
    const t = c.en.p; this.lookYaw = Math.atan2(-(t.x - this.pos.x), -(t.z - this.pos.z)); this.lookP = 0;
    // can it see the way in from here, or only leaning out?
    const q = t.clone().setY(t.y + 1.2);
    this.campLean = aiSees(this.eyeAt(0), q) ? 0 : aiSees(this.eyeAt(1), q) ? 1 : aiSees(this.eyeAt(-1), q) ? -1 : 0;
    this.campStance = this.campWish === 2 && !this.campLean && Math.abs(angWrap(this.lookYaw - this.ayaw)) < 0.3 ? (this.stance === 2 || this.roomToLie(t) ? 2 : 1) : this.campLean ? 0 : this.campWish === 2 ? 1 : this.campWish || 0;
  }
  goTo(p, st) {
    this.state = st; const now = performance.now();
    // (never out of its building: a place outside is swapped for the nearest place inside)
    if (!this.inA(p)) { const N = navFor(this.pos); let b = null, bd = 1e9; for (const n of N.nodes) { if (!this.inA(n) || Math.abs(n.y - p.y) > 1.5) continue; const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; b = n; } } if (!b) return; p = new V3(b.x, b.y, b.z); }
    if (this.goal && this.goal.distanceTo(p) < 0.5 && this.path && this.path.length && now - this.pathT < 3000) return;
    const N = navFor(this.pos), path = navPath(N, this.pos, p, this.area ? n => this.inA(n) : null); this.goal = p.clone(); this.pathT = now;
    this.path = path ? path.slice() : null;
  }
  runFrom(q) {
    const N = navFor(this.pos); let best = null, bs = -1;
    for (let k = 0; k < 60; k++) { const n = N.nodes[Math.floor(Math.random() * N.nodes.length)]; if (!n || !this.inA(n) || Math.abs(n.y - this.pos.y) > 0.5) continue; const dn = Math.hypot(n.x - this.pos.x, n.z - this.pos.z), dq = Math.hypot(n.x - q.x, n.z - q.z); if (dn < 7 && dq > bs) { bs = dq; best = n; } }
    if (best) { this.goal = null; this.goTo(new V3(best.x, best.y, best.z), 'dodge'); }
  }
  fallBack() {
    const t = this.tgt; if (!t) return; const N = navFor(this.pos); let best = null, bs = -1;
    for (let k = 0; k < 50; k++) { const n = N.nodes[Math.floor(Math.random() * N.nodes.length)]; if (!n || !this.inA(n) || Math.abs(n.y - this.pos.y) > 0.5) continue; const q = new V3(n.x, n.y + 1.5, n.z), d = q.distanceTo(t.pos);
      if (d > 6 && d < 25 && Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 10 && !aiSees(q, new V3(t.pos.x, t.pos.y + 1.4, t.pos.z)) && d > bs) { bs = d; best = n; } }
    if (best) { this.goTo(new V3(best.x, best.y, best.z), 'fall'); if (this.mag < WEAPONS[this.w].cap) this.reload(); }
  }
  forget(lk) { for (const K of this.know.values()) if (K.last && K.last.distanceTo(lk) < 2.5) { K.last = null; K.heard = 0; K.seen = 0; } if (this.noise && this.noise.p.distanceTo(lk) < 2.5) this.noise = null; AI_SQUAD.clear(lk); }
  plantSite() {
    if (S.mode !== 'online' || !net.host || !net.host.R.plant) return null;
    const s = TOWN.sites && TOWN.sites.find(x => x.id === net.host.R.plant.site); return s && s.p ? new V3(s.p.x, s.p.y || 0, s.p.z) : null;
  }
  disable() { if (this.hostP && net.host) net.host.sgMsg(this.hostP, { t: 'sg', a: 'disable' }); }
  // the inside door in the way, opened (and unlocked: it's their house); a door to the outside stays as it is
  doorAhead() {
    if (typeof doors === 'undefined' || !this.path || !this.path.length) return;
    const look = this.path.slice(0, 4);
    for (const d of doors) {
      if (d.fallen || !d.leaf || Math.abs(d.a) > 0.6) continue; const c = d.g.position;
      if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) > 2.2 || !look.some(n => Math.hypot(n.x - c.x, n.z - c.z) < 0.9)) continue;
      if (this.outsideDoor(d)) continue;   // (its paths never leave the building; a door out stays as it is)
      const L = d.leaf; L.updateMatrixWorld(true); const s = L.worldToLocal(this.pos.clone().setY(c.y + 1)).z >= 0 ? -1 : 1;
      d.lock = 0; d.tgt = s * DOOR_OPEN; d.w = s * 4;
      doorNet({ i: d.i, a: 'st', tg: d.tgt, w: d.w, an: d.a, h: 0, lk: 0 });
    }
  }
  claymores() {
    if (typeof GD === 'undefined') return;
    for (const o of GD.slice()) {
      if (o.k !== 'claymore' || o.sprung || !(o.t > 1.5) || o.team === 'b') continue;
      const dx = this.pos.x - o.p.x, dz = this.pos.z - o.p.z, dy = this.pos.y - o.p.y, f = new V3(-Math.sin(o.yaw), 0, -Math.cos(o.yaw)), d = Math.hypot(dx, dz);
      if (!(d < 2.7 && Math.abs(dy) < 1.2 && (dx * f.x + dz * f.z) / Math.max(d, 1e-3) > 0.6)) continue;
      o.sprung = true; const p = o.p.clone().setY(o.p.y + 0.15), m = { t: 'x', a: 'boom', k: 'claymore', i: o.id, tg: o.owner, p: p.toArray().map(r3) };
      if (this.hostP && net.host) net.host.onMessage(this.hostP, m);
      gadgetRemove(o); explode(p, 'claymore', o.owner, true);
    }
  }
  // ---- the gun: only at what it is looking at
  tryFire(dt) {
    if (this.fireT > 0) return;
    const T = this.tgt && this.know.get(this.tgt.id), W = WEAPONS[this.w];
    if (this.mag <= 0) { this.reload(); return; }
    // through the wall: pointed at the spot, a short burst
    if (!(T && T.vis) && this.wb) {
      const d = this.wb.p.clone().sub(this.eye), wy = Math.atan2(-d.x, -d.z), wp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      if (Math.hypot(angWrap(wy - this.ayaw), wp - this.apitch) > 0.05) return;
      this.fireT = W.pellets ? 60 / W.rpm + 0.1 : 60 / W.rpm * 1.4; this.shoot(); if (--this.wb.n <= 0) { this.wbDone = performance.now(); this.wb = null; }
      return;
    }
    if (!T || !T.vis) return;
    this.engT += dt;
    // the first look is rough; it settles onto the target over about half a second (worse at range, moving, hurt, gassed)
    const base = 0.008 * (1 + this.dist / 30) * (this.speedNow > 1 ? 1.8 : 1) * (1 - 0.35 * this.proneK) * (1 + hurtLevel(this.anat)) * ((this.gasK || 0) > 0.3 && this.lo.hg !== 'gasmask' ? 3 : 1);
    this.err = Math.max(base, this.err - dt * 0.28);
    if (Math.random() < dt * 4) { this.errY = rnd(-1, 1) * this.err; this.errP = rnd(-1, 1) * this.err * 0.6; }
    // looking at them: the line it is aiming along has to pass within a body's width of them (and it has had time to react)
    const aim = this.aimPoint(this.tgt), e = this.eye, d = aim.clone().sub(e), dist = d.length();
    const wy = Math.atan2(-d.x, -d.z), wp = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const off = Math.hypot(angWrap(wy - this.ayaw), wp - this.apitch), body = Math.atan2(0.28, Math.max(1, dist));
    // (and not while still swinging round onto them: it settles, then fires, so it is always seen looking at what it shoots)
    if (this.engT < 0.22 || off > body + this.err * 0.6 || Math.abs(this.yawV) > 2) return;
    if (W.pellets) this.fireT = 60 / W.rpm + rnd(0.05, 0.2);
    else if (this.dist > 14) { this.burst++; this.fireT = this.burst >= 3 + Math.floor(Math.random() * 3) ? (this.burst = 0, rnd(0.25, 0.5)) : 60 / W.rpm; }
    else this.fireT = 60 / W.rpm;
    this.shoot();
  }
  reload() { if (this.reloadT > 0) return; this.reloadT = WEAPONS[this.w].pellets ? 2.8 : 2.6; this.burst = 0; }
  shoot() {
    const W = WEAPONS[this.w], e = this.eye, cp = Math.cos(this.pitch), dir = new V3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    dir.x += rnd(-1, 1) * W.disp * 2; dir.y += rnd(-1, 1) * W.disp * 2; dir.normalize();
    const o = e.clone().addScaledVector(dir, 0.55).add(new V3(0, -0.12, 0));
    this.mag--; this.recoil += W.pellets ? 0.06 : 0.011; this.errY = (this.errY || 0) + rnd(-0.004, 0.004);
    const sd = (Math.random() * 1e9) >>> 0, shot = { hits: new Map() }, tr = !W.pellets && (this.mag % (W.tracerEvery || 4) === 0);
    const tag = b => { b.ai = this.pid || -1; b.aiBot = this; };
    if (W.pellets) for (const pd of pelletDirs(dir, this.w, sd)) { spawnBullet(o, pd, this.w, false, true, this.pid || -1, shot); tag(bullets[bullets.length - 1]); }
    else { spawnBullet(o, dir, this.w, tr, true, this.pid || -1); tag(bullets[bullets.length - 1]); }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), flashMat); f.position.copy(o); f.lookAt(camera.position); scene.add(f); fx.push({ o: f, life: 0.04, max: 0.04 });
    shotSound(this.w, camera.position.distanceTo(o), false, o);
    { const right = new V3().crossVectors(dir, _Y).normalize(), up = new V3().crossVectors(right, dir); ejectShell(o.clone().addScaledVector(dir, -0.45), right, up, dir, new V3(), W.shell); }
    aiNoise(o, 70, this.pid || -1);
    if (this.hostP && net.host) net.host.broadcast({ t: 'shot', id: this.pid, o: o.toArray().map(r4x), d: dir.toArray().map(r4x), w: this.w, tr: tr ? 1 : 0, sp: 0, sd }, net.host.self);
  }
  placeTrap(T) {
    if (T.k !== 'bd') { if (this.gN <= 0) return; this.gN--; }
    if (T.k === 'shield' && T.camp) this.shieldCamp = T.camp;
    const id = (Math.random() * 1e6) | 0; noiseHit(420, 0.08, 0.06);
    if (S.mode !== 'online') { if (T.k !== 'bd') gadgetAdd(-1 - (this.slot || 0), id, T.k, T.p, T.f || 0, 'b'); return; }
    if (!this.hostP || !net.host) return;
    const H = net.host;
    if (T.k === 'bd') { H.sgMsg(this.hostP, { t: 'sg', a: 'bd', i: T.i }); return; }
    H.onMessage(this.hostP, { t: 'x', a: 'gd', k: T.k, i: id, p: [T.p.x, T.p.y, T.p.z].map(r3), f: T.f || 0, c: 2 });
  }
  // ---- the network (raid): its state as a player's, its hits and deaths through the room
  sendState() {
    const an = this.anat, a = this.hum.anim;
    const m = { t: 's', lf: this.hostP.life, l: r4x(this.leanK || 0), ac: r4x(a.act || 0), hg: a.hg || 0, p: [this.pos.x, this.pos.y, this.pos.z].map(r4x), y: r4x(this.yaw), pi: r4x(this.pitch), v: r4x(this.speedNow), c: r4x(this.crouchK), sp: this.speedNow > 5 ? 1 : 0, g: 1, a: r4x(a.ads || 0), w: this.w, r: r4x(a.reload || 0),
      pr: r4x(this.proneK), lm: an.legBroken('L') || an.legBroken('R') ? 0.5 : 0, hu: r4x(a.hurt || 0), sg: 0, su: 0, fl: 0, dv: 0, ar: an.helmetOn ? 0 : 1, dn: this.rag ? 1 : 0, bb: an.brokenMask(), ah: an.armHangMask(), ls: an.lostMask(), lc: an.cutArr(),
      bl: Math.round(an.bleedRate()), arr: Math.round(arteryRate(an)), bp: r4x(clamp(an.blood / 5000, 0.2, 1)), rx: 0, cl: 0 };
    net.host.onMessage(this.hostP, m);
  }
  rx(m) {
    if (m.t === 'hurt' && !this.dead && !this.out && Array.isArray(m.p) && Array.isArray(m.d)) {
      this.lastBy = m.by; const info = { frame: String(m.f), e: new V3().fromArray(m.p), d: new V3().fromArray(m.d).normalize(), armor: m.ar || undefined, pd: Number.isFinite(m.pd) ? m.pd : undefined };
      this.shot(info, Number(m.v) || 0, WEAPONS[m.w] ? m.w : 0, new V3().fromArray(m.wd || m.d).normalize(), Number(m.dist) || 0);
      this.gotHit(m.wd || m.d);
    }
    else if (m.t === 'punched' && !this.dead && Array.isArray(m.p)) {
      this.lastBy = m.by; const info = { frame: String(m.f), e: new V3().fromArray(m.p) }, dir = new V3().fromArray(m.wd || [0, 0, -1]).normalize();
      this.punched(info, dir, clamp(Number(m.pw) || 0.6, 0, 1.2)); if (m.sl) sledgeBody(this.hum, info, dir, this.pos.clone().setY(this.pos.y + 1.2));
      this.gotHit(m.wd);
    }
    else if (m.t === 'spawn' && m.id === this.pid) {
      // (between matches the bots wait off the map)
      if (!net.host || net.host.R.ph === 'lobby') { this.hide(); if (this.hostP) this.hostP.alive = false; }
      else this.respawn(this.spawnP || (TOWN.def && TOWN.def.length ? TOWN.def[this.slot % TOWN.def.length] : this.post));
    }
    else if (m.t === 'round' && m.ph === 'lobby') this.hide();
  }
  // shot at: it knows roughly where from, and turns that way at once
  gotHit(wd) {
    if (!Array.isArray(wd)) return; const d = new V3().fromArray(wd); this.lookYaw = Math.atan2(d.x, d.z);
    this.noise = { p: this.pos.clone().addScaledVector(d.normalize(), -8), t: performance.now() };
    if (!this.tgtVis() && Math.random() < 0.5) this.fallBack();
  }
  respawn(p) {
    this.out = false; this.dead = false; this.respawnT = 0; this.deadT = 0; this.neckHits = 0; this.hum.erosion = []; this.hum._skullOpen = false; this.unarmed = false; this.credited = false;
    this.stag = undefined; this.react = undefined; this.reactDone = false; this.forceDown = false;
    if (this.rag) { this.rag.keep = false; freeRag(this.rag); this.rag = null; }
    for (const [o, v] of this.vis0) o.visible = v; chunkReset(this.hum.root); clearWounds(this.hum); this.hum.setLost(0); setHelmet(this.hum, true);
    this.anat = new Anatomy(); this.pos.copy(p); this.post.copy(p); this.home = this.pos; this.hum.root.visible = true; this.hum.root.position.copy(p);
    this.lastBy = 0; this.downSent = false; this.camp = null; this.wb = null; this.lean = 0; this.leanK = 0; this.dodgeT = 0; this.visited = []; this.know.clear(); this.tgt = null; this.noise = null; this.path = null; this.mag = WEAPONS[this.w].cap; this.reloadT = 0; this.flashT = 0; this.deafT = 0; this.state = 'idle';
    for (const t of this.traps) { t.done = false; t.tries = 0; }
    this.gN = this.lo.gN; this.tN = this.lo.tN; this.act = null; this.myNades = []; this.stance = 0; this.proneK = 0; this.crouchK = 0; this.yawV = 0; this.avert = null; this.shieldCamp = null; this.proneFor = 0; this.threat = null; this.throwCD = rnd(2, 5);
  }
  hide() { for (const n of this.myNades.splice(0)) this.nadeBoom(n); this.out = true; this.hum.root.visible = false; if (this.rag) { this.rag.keep = false; this.rag = null; } }
  update(dt) {
    // (its grenades go off on time whatever happens to it)
    for (const n of this.myNades.slice()) { n.t -= dt; if (n.t <= 0) { this.myNades.splice(this.myNades.indexOf(n), 1); this.nadeBoom(n); } }
    super.update(dt);
    // in a raid the others see it as a player (down or on its feet), a bit less often when nobody is near
    if (this.hostP && this.hostP.alive && !this.out) { this.sendT -= dt; if (this.sendT <= 0) { this.sendT = this.tgt || this.state === 'hunt' ? 0.08 : 0.14; this.sendState(); } }
    // down: out of the fight but alive (it counts for its side) until it bleeds out, unless the wound can't be survived;
    // the one who dropped it gets the kill, as for a player
    const down = !!this.rag && !this.dead && !this.out;
    if (down && this.hostP && net.host && this.hostP.alive) {
      const ft = this.anat.fatalWhy() ? 1 : 0;
      if (!this.downSent || (ft && !this.hostP.fatal)) { this.downSent = true; net.host.down(this.hostP, { t: 'down', by: this.lastBy || this.anat.lastBy || 0, ft, lf: this.hostP.life }); }
    } else if (!down) this.downSent = false;
  }
  die() {
    if (this.dead) return;
    super.die(); this.respawnT = 1e12; this.tgt = null; this.path = null;
    if (this.hostP && net.host) {
      const an = this.anat, d = an.lastDir.clone();
      net.host.died(this.hostP, { t: 'died', by: this.lastBy || an.lastBy || 0, part: PART_OF_REGION(an.lastRegion), head: an.cause === 'brain', d: d.toArray().map(r4x), dist: Math.round(an.lastDist || 0), cause: an.cause || 'bleed', gib: an.gibHead ? 1 : 0, lf: this.hostP.life });
    }
    if (S.mode === 'test' && CQC.bots.includes(this) && CQC.bots.every(b => b.dead)) { flashMsg('COURSE CLEARED<small>It resets in 8 s.</small>', 3000); setTimeout(() => { if (S.mode === 'test') cqcReset(); }, 8000); }
  }
  dispose() { super.dispose(); const i = AIS.indexOf(this); if (i >= 0) AIS.splice(i, 1); }
}
const angWrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// ---- a defender's kit: a gun (M4, M870 or the .50), one gadget kind and all of them, frags or flashbangs, and headgear
// (night vision after dark, a mask some of the time)
function aiLoadout(i, night, w) {
  const r = Math.random(), gun = w !== undefined ? w : r < 0.5 ? 0 : r < 0.8 ? 5 : 2;
  const g = ['beartrap', 'wire', 'shield', 'alarm', 'beartrap', 'wire'][i % 6], t = Math.random() < 0.55 ? 'frag' : 'flash';
  const hg = night ? (Math.random() < 0.7 ? 'nvg' : 'gasmask') : Math.random() < 0.4 ? 'gasmask' : 'none';
  return { w: gun, g, gN: GADGETS[g].n, t, tN: GADGETS[t].n, hg };
}
// clear between two points (holes in walls let it through; smoke doesn't matter to a grenade)
function aiClear(a, b) {
  _aiV.subVectors(b, a); const L = _aiV.length(); if (L < 1e-3) return true; _aiV.multiplyScalar(1 / L); _aiR.set(a, _aiV); _aiR.far = L;
  for (const h of _aiR.intersectObjects(wmFor(_aiR), false)) { const u = h.object.userData; if (!u.box && !u.door) continue; if (u.grid && gridOpenW(h.object, h.point.clone().addScaledVector(_aiV, 0.01))) continue; if (h.object.visible === false) continue; return false; }
  return true;
}
// a throw from o that comes down on q, if its arc gets there through the rooms (a few launch angles, flattest first)
function aiLob(o, q) {
  const d = Math.hypot(q.x - o.x, q.z - o.z), h = q.y - o.y, g = 9.81; if (d < 0.5) return null;
  const hd = new V3(q.x - o.x, 0, q.z - o.z).normalize();
  for (const th of [0.25, 0.45, 0.7, 0.95]) {
    const c = Math.cos(th), den = d * Math.tan(th) - h; if (den <= 0.05) continue;
    const v = Math.sqrt(g * d * d / (2 * c * c * den)) * 1.04; if (!(v < FRAG_V.over)) continue;
    const vel = hd.clone().multiplyScalar(v * c).setY(v * Math.sin(th)), T = d / (v * c); let prev = o.clone(), ok = true;
    for (let k = 1; k <= 12 && ok; k++) { const t = T * k / 12, p = new V3(o.x + vel.x * t, o.y + vel.y * t - 0.5 * g * t * t, o.z + vel.z * t); if (p.y > 5 + o.y || !aiClear(prev, p)) ok = false; prev = p; }
    if (ok) return vel;
  }
  return null;
}
// ---- where each defender sets its own gadgets: wire across a door just inside, bear traps a step further in, alarms under
// the windows, its shield a few metres back covering a door (and it camps behind it later); the boards on three windows are
// shared out after
function aiPlan(bots, entries) {
  const used = new Map(), put = [], doorsE = entries.filter(e => !e.win), wins = entries.filter(e => e.win);
  const free = p => !put.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 0.7);
  const pick = pool => pool.slice().sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0) + rnd(-0.4, 0.4))[0];
  const order = { wire: 0, shield: 1, alarm: 2, beartrap: 3 };
  for (const b of bots.slice().sort((x, y) => (order[x.lo.g] || 0) - (order[y.lo.g] || 0))) {
    const L = b.lo, T = [];
    for (let k = 0; k < L.gN; k++) {
      const e = pick(L.g === 'alarm' && wins.length ? wins : doorsE.length ? doorsE : entries); if (!e) break;
      const inw = e.dir.clone().negate(), side = new V3(e.dir.z, 0, -e.dir.x); let p, f = 0, camp = null;
      if (L.g === 'wire') { p = e.p.clone().addScaledVector(inw, 0.15); f = Math.atan2(-side.z, side.x); }
      else if (L.g === 'beartrap') p = e.p.clone().addScaledVector(inw, rnd(0.75, 1.2)).addScaledVector(side, rnd(-0.35, 0.35));
      else if (L.g === 'alarm') p = e.p.clone().addScaledVector(side, rnd(-0.4, 0.4));
      else { // shield: a spot 3-5 m in with a clear view of the way in, facing it
        const N = navFor(e.p); let best = null, bs = -1e9;
        for (let t = 0; t < 120; t++) { const n = N.nodes[Math.floor(Math.random() * N.nodes.length)]; if (!n || !b.inA(n) || Math.abs(n.y - e.p.y) > 0.5) continue; const v = new V3(n.x - e.p.x, 0, n.z - e.p.z), dd = v.length(); if (dd < 3 || dd > 5.5) continue;
          const ang = v.normalize().dot(inw); if (ang < 0.3 || !aiSees(new V3(n.x, n.y + 1, n.z), e.p.clone().setY(e.p.y + 1))) continue; const sc = (1 - ang) + Math.random() * 0.3; if (sc > bs) { bs = sc; best = n; } }
        if (!best) continue; p = new V3(best.x, best.y, best.z); f = Math.atan2(-(e.p.x - p.x), -(e.p.z - p.z));
        camp = { en: e, p: p.clone().add(new V3(Math.sin(f) * 0.75, 0, Math.cos(f) * 0.75)) };
      }
      p.y = floorUnder(p.x, p.z, e.p.y + 0.5);
      if (!free(p) || !b.inA(p)) continue; used.set(e, (used.get(e) || 0) + 1); put.push(p);
      T.push({ k: L.g, p, f, camp });
    }
    b.traps = T;
  }
  return put;
}
const distToSeg = (p, a, b) => { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(p); };
// only soft things between: drywall, plywood, a wooden door, boards (a round goes through those); at least one of them
function aiSoftOnly(e, q) {
  _aiV.subVectors(q, e); const L = _aiV.length(); _aiV.multiplyScalar(1 / L); _aiR.set(e, _aiV); _aiR.far = L - 0.3;
  const hits = _aiR.intersectObjects(wmFor(_aiR), false); let n = 0;
  for (const h of hits) { const u = h.object.userData; if (!u.box && !u.door) continue; if (u.grid && gridOpenW(h.object, h.point.clone().addScaledVector(_aiV, 0.01))) continue;
    const soft = u.board !== undefined || (u.door ? u.door.kind !== 'metal' : (u.kind === 'drywall' || u.kind === 'plywood')); if (!soft) return false; n++; }
  return n > 0 && n <= 4;
}
// what the defenders know between them: the latest places the attackers were seen or heard
const AI_SQUAD = { pts: [], see(p, t) { this.pts.push({ p: p.clone(), t }); if (this.pts.length > 12) this.pts.shift(); }, last() { return this.pts[this.pts.length - 1] || null; }, clear(p) { this.pts = this.pts.filter(x => x.p.distanceTo(p) > 3); } };

// ---- raid: the host's six defenders, one HostRoom player each (so they count in the round like anyone)
function raidTraps() {
  // three bear traps and two wires at the doors in from outside, an alarm on a window, three windows boarded
  const T = [], ex = [];
  if (typeof doors !== 'undefined') for (const d of doors) { const c = d.g.position; if (!inHouseFoot(c, 0.6)) continue; const fwd = new V3(0, 0, 1).applyQuaternion(d.g.quaternion); for (const s of [-1, 1]) { const q = c.clone().addScaledVector(fwd, s * 1.1); if (inHouseFoot(q, -0.3)) ex.push({ p: q.setY(floorUnder(q.x, q.z, c.y + 0.5)), f: Math.atan2(fwd.x, fwd.z) }); } }
  const kinds = ['beartrap', 'beartrap', 'wire', 'beartrap', 'wire', 'alarm'];
  for (let i = 0; i < kinds.length && ex.length; i++) T.push(Object.assign({ k: kinds[i] }, ex[i % ex.length], { p: ex[i % ex.length].p.clone().add(new V3(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3))) }));
  if (TOWN.windows) for (let i = 0; i < Math.min(3, TOWN.windows.length); i++) { const w = TOWN.windows[i]; if (w && w.p) { const c = new V3(HOUSE.x0 + HOUSE.x1, 0, HOUSE.z0 + HOUSE.z1).multiplyScalar(0.5), q = new V3(w.p.x, 0, w.p.z), d = c.sub(q).setY(0).normalize(); q.addScaledVector(d, 0.9); T.push({ k: 'bd', i, p: q.setY(floorUnder(q.x, q.z, (w.p.y || 0) - 0.4)) }); } }
  return T;
}
const inHouseFoot = (p, m) => typeof HOUSE !== 'undefined' && p.x > HOUSE.x0 - m && p.x < HOUSE.x1 + m && p.z > HOUSE.z0 - m && p.z < HOUSE.z1 + m;
// where the defenders start: half on the ground floor, half upstairs, spread through the rooms
function aiSpawns(area, n) {
  const c = new V3((area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2), N = navFor(c), out = [];
  const nodes = N.nodes.filter(q => q.x > area.x0 + 0.5 && q.x < area.x1 - 0.5 && q.z > area.z0 + 0.5 && q.z < area.z1 - 0.5 && q.y < 4.6 && q.e.length >= 12);
  const floors = [nodes.filter(q => q.y < 1), nodes.filter(q => q.y > 2)];
  for (let i = 0; i < n; i++) {
    const L = floors[i % 2].length ? floors[i % 2] : nodes; let best = null, bs = -1;
    for (let k = 0; k < 60; k++) { const q = L[Math.floor(Math.random() * L.length)]; if (!q) break; const d = out.length ? Math.min(...out.map(o => Math.hypot(o.x - q.x, o.z - q.z) + Math.abs(o.y - q.y) * 3)) : 99; if (d > bs) { bs = d; best = q; } }
    if (best) out.push(new V3(best.x, best.y, best.z));
  }
  return out;
}
function raidAddBots(H) {
  if (!H || H.cfg.mode !== 'raid' || H.bots) return; H.bots = [];
  for (let i = 0; i < 6; i++) {
    const p = H.add(null); p.ai = true; p.ready = true; p.team = 'b'; p.name = AI_NAMES[i] + ' [AI]'; p.alive = false; H.bots.push(p);
    H.broadcast({ t: 'join', id: p.id, name: p.name, tm: 'b' }, p);
  }
}
// the bodies live with the town (built fresh every round)
function raidBodies() {
  const H = net.host; if (!H || !H.bots) return;
  for (const b of AIS.slice()) if (b.hostP) { b.dispose(); const k = dummies.indexOf(b); if (k >= 0) dummies.splice(k, 1); }
  navClear(); AI_SQUAD.pts = []; const boards = raidTraps().filter(t => t.k === 'bd'), night = typeof ENV !== 'undefined' && (ENV.tod < 6.5 || ENV.tod > 19);
  // the house: where they stay, and the ways in they watch (the outside doors and the windows, from just inside)
  const area = { x0: HOUSE.x0 + 0.1, x1: HOUSE.x1 - 0.1, z0: HOUSE.z0 + 0.1, z1: HOUSE.z1 - 0.1 }, entries = [], ctr = new V3((HOUSE.x0 + HOUSE.x1) / 2, 0, (HOUSE.z0 + HOUSE.z1) / 2);
  if (typeof doors !== 'undefined') for (const d of doors) { const c = d.g.position, f = new V3(0, 0, 1).applyQuaternion(d.g.quaternion); const a = c.clone().addScaledVector(f, 0.9), b = c.clone().addScaledVector(f, -0.9);
    const ia = a.x > area.x0 && a.x < area.x1 && a.z > area.z0 && a.z < area.z1, ib = b.x > area.x0 && b.x < area.x1 && b.z > area.z0 && b.z < area.z1;
    if (ia !== ib) entries.push({ p: (ia ? a : b).setY(c.y), dir: ia ? f.clone().negate() : f.clone(), door: d.i }); }
  if (TOWN.windows) for (const w of TOWN.windows) if (w && w.p) { const out = new V3(w.p.x - ctr.x, 0, w.p.z - ctr.z), ax = Math.abs(out.x) / (HOUSE.x1 - HOUSE.x0) > Math.abs(out.z) / (HOUSE.z1 - HOUSE.z0); const dir = ax ? new V3(Math.sign(out.x), 0, 0) : new V3(0, 0, Math.sign(out.z));
    const p = new V3(w.p.x, 0, w.p.z).addScaledVector(dir, -0.7); p.y = floorUnder(p.x, p.z, (w.p.y || 0) - 0.3); entries.push({ p, dir, win: true }); }
  const spots = aiSpawns(area, H.bots.length);
  H.bots.forEach((p, i) => {
    const sp = spots[i] || (TOWN.def && TOWN.def.length ? TOWN.def[i % TOWN.def.length] : new V3());
    const lo = aiLoadout(i, night), b = new AIBot(sp, { pid: p.id, hostP: p, name: p.name, w: lo.w, lo, post: sp, zone: 7, area, entries });
    b.slot = i; b.spawnP = sp.clone(); p.bot = b; dummies.push(b);
    if (!p.alive) b.hide();
  });
  // (each sets its own gadgets first, then the boarding of the windows is shared out to whoever has least to do)
  const bots = H.bots.map(p => p.bot); aiPlan(bots, entries);
  for (const t of boards) bots.slice().sort((a, b) => a.traps.length - b.traps.length)[0].traps.push(t);
}

// ---- the CQC course in the testing range: four rooms behind the door wall, four defenders that reset when cleared
const CQC = { b: null, bots: [] };
function buildCqc() {
  const x0 = -10, x1 = 10, z0 = 22, z1 = 40, H = 2.8, T = 0.14, op = DOOR_W / 2 + 0.07;
  CQC.b = { x0: x0 - 3, x1: x1 + 3, z0: z0 - 4, z1: z1 + 3 };
  // a wall along x or z with door openings at the given positions (each with a door or left open)
  const wall = (ax, a, b, c, holes) => { let s = a; for (const h of holes.slice().sort((p, q) => p.at - q.at)) {
      if (h.at - op > s) ax === 'x' ? addBox((s + h.at - op) / 2, 0, c, h.at - op - s, H, T, 'drywall', 0xd9d4ca) : addBox(c, 0, (s + h.at - op) / 2, T, H, h.at - op - s, 'drywall', 0xd9d4ca);
      ax === 'x' ? addBox(h.at, DOOR_H + 0.1, c, op * 2, H - DOOR_H - 0.1, T, 'drywall', 0xd9d4ca) : addBox(c, DOOR_H + 0.1, h.at, T, H - DOOR_H - 0.1, op * 2, 'drywall', 0xd9d4ca);
      if (h.door) ax === 'x' ? addDoor(h.at, c, 0, h.door, 1, 0) : addDoor(c, h.at, Math.PI / 2, h.door, 1, 0);
      s = h.at + op; }
    if (b > s) ax === 'x' ? addBox((s + b) / 2, 0, c, b - s, H, T, 'drywall', 0xd9d4ca) : addBox(c, 0, (s + b) / 2, T, H, b - s, 'drywall', 0xd9d4ca); };
  wall('x', x0, x1, z0, [{ at: -4, door: 'plywood' }, { at: 5 }]);
  wall('x', x0, x1, z1, []);
  wall('z', z0, z1, x0, [{ at: 31 }]);
  wall('z', z0, z1, x1, []);
  wall('x', x0, x1, 28, [{ at: -6 }, { at: 4, door: 'plywood' }]);
  wall('z', 28, z1, 0, [{ at: 34, door: 'plywood' }]);
  wall('x', x0, 0, 34, [{ at: -5 }]);
  // cover: crates, a table, shelves
  addBox(-7, 0, 25, 1.2, 1, 1.2, 'crate'); addBox(6, 0, 24.5, 2, 0.9, 0.8, 'crate'); addBox(-3, 0, 31, 1.6, 0.85, 0.9, 'crate'); addBox(6, 0, 33, 1.2, 1.2, 1.2, 'crate');
  addBox(3, 0, 38, 2.2, 0.9, 1, 'crate'); addBox(-8, 0, 37.5, 0.5, 1.9, 2, 'crate'); addBox(-2, 0, 38, 1.2, 1, 1.2, 'crate');
  // (open to the sky, so it is lit by day)
  addBox(0, 2.2, 21.2, 1.4, 0.4, 0.05, 'crate', 0xffd166);
}
function cqcReset() {
  for (const b of CQC.bots) { b.dispose(); const k = dummies.indexOf(b); if (k >= 0) dummies.splice(k, 1); }
  CQC.bots = []; navClear(); AI_SQUAD.pts = [];
  for (const g of GD.slice()) if (g.team === 'b' && g.owner < 0) gadgetRemove(g);
  const area = { x0: -9.85, x1: 9.85, z0: 22.12, z1: 39.88 }, entries = [{ p: new V3(-4, 0, 22.9), dir: new V3(0, 0, -1) }, { p: new V3(5, 0, 22.9), dir: new V3(0, 0, -1) }, { p: new V3(-9.1, 0, 31), dir: new V3(-1, 0, 0) }];
  const posts = [[-6, 25, 0.5, 0], [6, 37, 2.5, 5], [-5, 31, 1.5, 0], [-6, 38, 2.2, 0]];
  const night = typeof ENV !== 'undefined' && (ENV.tod < 6.5 || ENV.tod > 19);
  posts.forEach(([x, z, yaw, w], i) => { const lo = aiLoadout(i, night, w), b = new AIBot(new V3(x, 0, z), { yaw, w, lo, post: new V3(x, 0, z), zone: 6, area, entries, name: 'CQC ' + (i + 1) }); b.slot = i; CQC.bots.push(b); dummies.push(b); });
  aiPlan(CQC.bots, entries);
}
// a bot wherever you are (console "spawn ai")
function spawnAI(p) { const b = new AIBot(p.clone(), { post: p.clone(), zone: 4 }); dummies.push(b); return b; }
function aiClearAll() { for (const b of AIS.slice()) { b.dispose(); const k = dummies.indexOf(b); if (k >= 0) dummies.splice(k, 1); } CQC.bots = []; navClear(); }
function updateAI() { const now = performance.now(); if (AIS.length && now - (updateAI.t || 0) > 500) { updateAI.t = now; navSkipDoors(); } while (AI_NOISE.length && now - AI_NOISE[0].t > 1500) AI_NOISE.shift(); }

// ---- module exports: build.mjs strips this block ----
export { AIBot, CQC, aiClear, aiNoise, buildCqc, cqcReset, navClear, navDirty, raidAddBots, raidBodies, spawnAI, updateAI };
// ---- end module exports ----
