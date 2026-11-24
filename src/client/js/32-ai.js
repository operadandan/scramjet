// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, damp, rnd, scene } from './00-setup.js';
import { addBox, colliders, worldMeshes } from './01-world.js';
import { HOUSE, TOWN } from './01b-town.js';
import { chunkReset } from './02b-chunks.js';
import { hurtLevel } from './03-humanoid.js';
import { _Y, freeRag, setHelmet } from './04-ragdoll.js';
import { Anatomy, PART_OF_REGION } from './05-anatomy.js';
import { WEAPONS, flashMat, pelletDirs } from './06-weapons.js';
import { footSound, shotSound, surfaceAt } from './10-audio.js';
import { fx } from './11-fx.js';
import { smoke } from './12-blood.js';
import { nz } from './12b-gore.js';
import { clearWounds } from './14-wounds.js';
import { gridOpenW } from './15-destruction.js';
import { DOOR_H, DOOR_OPEN, DOOR_W, addDoor, doorNet, doors } from './15b-doors.js';
import { bullets, ejectShell, spawnBullet } from './16-ballistics.js';
import { Dummy, P, S, arteryRate, dummies } from './17-dummies.js';
import { flashMsg } from './18-player.js';
import { net } from './19-network.js';
import { r3, r4x } from './19b-explosives.js';
import { last } from './22-menu-loop.js';
import { SL, lightLevel } from './26-lights.js';
import { sledgeBody, smokeAt } from './27-gadgets.js';
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
function navPath(N, from, to) {
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
    for (let k = 0; k < c.e.length; k += 2) { const ni = c.e[k]; if (shut[ni]) continue; const ng = g[ci] + c.e[k + 1]; if (ng < g[ni]) { g[ni] = ng; came[ni] = ci; push(ni, ng + hh(ni)); } }
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
  const hits = _aiR.intersectObjects(worldMeshes, false);
  for (const h of hits) { const u = h.object.userData; if (!u.box && !u.door) continue; if (u.grid && gridOpenW(h.object, h.point.clone().addScaledVector(_aiV, 0.01))) continue; if (h.object.visible === false) continue; return false; }
  for (let k = 1; k < 6; k++) { _aiW.copy(eye).addScaledVector(_aiV, L * k / 6); if (smokeAt(_aiW, false) > 0.45) return false; }
  return true;
}

class AIBot extends Dummy {
  constructor(pos, o) {
    super(pos.x, pos.z, 'ai', null, AI_PAL);
    o = o || {};
    this.pos = pos.clone(); this.home = this.pos; this.yaw = o.yaw || 0; this.pitch = 0; this.ayaw = this.yaw; this.apitch = 0;
    this.w = o.w === undefined ? 0 : o.w; this.mag = WEAPONS[this.w].cap; this.pid = o.pid || 0; this.hostP = o.hostP || null; this.name = o.name || 'AI';
    this.post = (o.post || pos).clone(); this.zone = o.zone || null; this.traps = o.traps || [];
    this.state = 'idle'; this.path = null; this.pathT = 0; this.goal = null; this.thinkT = Math.random() * 0.2; this.know = new Map(); this.tgt = null;
    this.errY = 0; this.errP = 0; this.fireT = 0; this.burst = 0; this.reloadT = 0; this.err = 0.15; this.engT = 0; this.recoil = 0; this.crouchK = 0; this.strafe = 0; this.strafeT = 0;
    this.vel = new V3(); this.speedNow = 0; this.stepD = 0; this.lookT = 0; this.lookYaw = this.yaw; this.waitT = 0; this.sendT = 0; this.callT = 0; this.defuseT = 0;
    this.hum.root.position.copy(this.pos); this.hum.root.rotation.y = this.yaw;
    AIS.push(this);
  }
  get eye() { return _aiW.set(this.pos.x, this.pos.y + 1.62 - 0.55 * this.crouchK, this.pos.z).clone(); }
  // ---- the brain, run from Dummy.update in place of the canned animations
  aiTick(dt, a, root) {
    if (this.out) return;
    const live = this.active();
    this.thinkT -= dt; if (live && this.thinkT <= 0) { this.thinkT = 0.1; this.perceive(0.1); this.decide(); }
    const blind = (this.flashT || 0) > 0; if (this.flashT > 0) this.flashT -= dt;
    // aim: turns fast but not instantly, onto where it means to look
    let ty = this.lookYaw, tp = 0;
    const T = this.tgt && this.know.get(this.tgt.id);
    if (live && this.tgt && T && T.vis && !blind) {
      const aim = this.aimPoint(this.tgt), e = this.eye, d = aim.sub(e);
      ty = Math.atan2(-d.x, -d.z); tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      ty += this.errY; tp += this.errP;
    } else if (this.path && this.path.length) { const n = this.path[0]; ty = Math.atan2(-(n.x - this.pos.x), -(n.z - this.pos.z)); }
    const turn = (blind ? 1.5 : 9) * dt;
    this.ayaw += clamp(angWrap(ty - this.ayaw), -turn, turn) * Math.min(1, dt * 14 + 0.15); this.apitch += clamp(tp - this.apitch, -turn, turn) * Math.min(1, dt * 14 + 0.15);
    this.recoil = Math.max(0, this.recoil - dt * 0.45);
    this.yaw = this.ayaw; this.pitch = this.apitch + this.recoil;
    // moving
    let sp = 0, mv = null;
    if (live && this.path && this.path.length && !this.tgtVis()) {
      const n = this.path[0], dx = n.x - this.pos.x, dz = n.z - this.pos.z, L = Math.hypot(dx, dz);
      if (L < 0.25) { this.path.shift(); this.doorAhead(); }
      else { sp = this.moveSpeed(); mv = new V3(dx / L, 0, dz / L); }
    }
    if (live && this.tgtVis() && this.strafeT > 0) { this.strafeT -= dt; const s = new V3(Math.cos(this.ayaw), 0, -Math.sin(this.ayaw)).multiplyScalar(this.strafe); mv = mv ? mv.add(s).normalize() : s; sp = Math.max(sp, 2.2); }
    if (this.anat.legBroken('L') || this.anat.legBroken('R')) sp *= 0.45;
    this.speedNow = damp(this.speedNow, sp, 10, dt);
    if (mv && this.speedNow > 0.05) {
      const nx = this.pos.x + mv.x * this.speedNow * dt, nz = this.pos.z + mv.z * this.speedNow * dt, y = this.pos.y;
      const fy = floorUnder(nx, nz, y + 0.6);
      if (!navBlocked(nx, fy + 0.45, nz, 1.25, 0.15)) { this.vel.set((nx - this.pos.x) / dt, 0, (nz - this.pos.z) / dt); this.pos.set(nx, fy, nz); }
      else { this.vel.set(0, 0, 0); this.path = null; }
    } else this.vel.set(0, 0, 0);
    { const fy = floorUnder(this.pos.x, this.pos.z, this.pos.y + 0.6); if (this.pos.y > fy + 0.02) this.pos.y = Math.max(fy, this.pos.y - 6 * dt); else this.pos.y = fy; }
    // its steps, heard by whoever is near
    if (this.speedNow > 0.5) { this.stepD += this.speedNow * dt; const stride = this.speedNow > 3.5 ? 0.95 : 0.7; if (this.stepD > stride) { this.stepD = 0; const dd = camera.position.distanceTo(this.pos); if (dd < 40) footSound(this.pos, surfaceAt(this.pos), this.crouchK > 0.5 ? 0.3 : this.speedNow > 3.5 ? 1.1 : 0.6, dd); } }
    // shooting and reloading
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = WEAPONS[this.w].cap; }
    this.fireT -= dt; if (live && !blind && this.reloadT <= 0) this.tryFire(dt);
    const wantC = live && this.tgtVis() && this.dist > 9 && this.speedNow < 1 ? 1 : this.state === 'hold' ? 0.6 : 0;
    this.crouchK = damp(this.crouchK, wantC, 6, dt);
    root.position.copy(this.pos); root.rotation.y = this.yaw;
    Object.assign(a, { speed: this.speedNow, crouch: this.crouchK, pitch: this.pitch, weapon: this.w, ads: this.tgtVis() ? 1 : 0.2, sprint: this.speedNow > 5 ? 1 : 0, reload: this.reloadT > 0 ? 1 - this.reloadT / 2.6 + 0.001 : 0 });
    // in a raid the others see it as a player
    if (this.hostP) { this.sendT -= dt; if (this.sendT <= 0) { this.sendT = 0.066; this.sendState(); } }
  }
  active() {
    if (S.mode === 'test') return true;
    if (!this.hostP || !this.hostP.alive) return false;
    const H = net.host; return !!H && H.R.ph === 'live' && !H.frozen();
  }
  tgtVis() { const T = this.tgt && this.know.get(this.tgt.id); return !!(T && T.vis); }
  moveSpeed() { return this.state === 'hunt' ? 2.4 : this.state === 'rush' || this.state === 'defuse' || this.state === 'fall' ? 4.6 : this.state === 'engage' ? 2 : 1.7; }
  aimPoint(t) {
    const h = t.dn ? 0.35 : t.pr > 0.5 ? 0.3 : 1.62 - 0.6 * (t.c || 0);
    // (head, or under the plate: the pelvis; the chest only when it has nothing better)
    const chest = h * 0.78, y = this.aimZ === 'head' ? h - 0.07 : this.aimZ === 'hips' ? h * 0.56 : chest;
    // (it leads a moving target a little)
    const lead = t.r && t.r.st ? 0.08 : 0.06, vx = t.self ? P.vel.x : (t.r.tpos.x - t.r.pos.x) * 12, vz = t.self ? P.vel.z : (t.r.tpos.z - t.r.pos.z) * 12;
    return new V3(t.pos.x + vx * lead, t.pos.y + y, t.pos.z + vz * lead);
  }
  // ---- seeing and hearing
  perceive(dt) {
    const now = performance.now(), e = this.eye, fwd = new V3(-Math.sin(this.ayaw), 0, -Math.cos(this.ayaw)), blind = (this.flashT || 0) > 0;
    const smoke = (this.smokeK || 0) > 0.5;
    const TG = aiTargets();
    for (const t of TG) {
      let K = this.know.get(t.id); if (!K) { K = { aw: 0, seen: 0, last: null, vis: false, heard: 0 }; this.know.set(t.id, K); }
      const dx = t.pos.x - e.x, dz = t.pos.z - e.z, d = Math.hypot(dx, dz), cs = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / d : 1;
      let vis = false;
      if (!blind && !smoke && d < 70 && (cs > AI_FOV || d < 2.2)) {
        const h = t.dn ? 0.35 : t.pr > 0.5 ? 0.3 : 1.55 - 0.6 * (t.c || 0);
        vis = aiSees(e, new V3(t.pos.x, t.pos.y + h, t.pos.z)) || aiSees(e, new V3(t.pos.x, t.pos.y + h * 0.55, t.pos.z));
      }
      if (vis) {
        // how fast it picks you out: close, moving, lit up (your own light most of all), right in front
        const lit = t.fl ? 1.5 : clamp((lightLevel(new V3(t.pos.x, t.pos.y + 1, t.pos.z)) || 0) * 2.5, 0.35, 1), rate = (7 / (1 + d * 0.1)) * (0.7 + Math.min(1, t.v / 3)) * lit * (0.6 + Math.max(0, cs)) * (t.c > 0.5 ? 0.75 : 1) + (d < 4 ? 10 : 0);
        K.aw = Math.min(1.5, K.aw + rate * dt * (K.seen && now - K.seen < 4000 ? 4 : 1));
      } else K.aw = Math.max(0, K.aw - dt * 0.25);
      K.vis = vis && K.aw >= 1;
      if (K.vis) { if (!K.wasVis) { this.engT = 0; this.err = 0.11 + Math.random() * 0.06; } K.seen = now; K.last = t.pos.clone(); this.callout(t, K.last); }
      K.wasVis = K.vis;
      // footsteps: a sprint carries, a crouch-walk barely does
      const fr = t.v > 5 ? 15 : t.v > 3 ? 9 : t.v > 0.6 ? (t.c > 0.5 ? 2 : 5) : 0;
      if (fr && d < fr && !K.vis) { K.heard = now; K.last = t.pos.clone().add(new V3(rnd(-1, 1), 0, rnd(-1, 1))); }
      K.t = t;
    }
    for (const id of [...this.know.keys()]) if (!TG.some(t => t.id === id)) this.know.delete(id);
    // shots and blasts
    const deaf = (this.deafT || 0) > 0; if (this.deafT > 0) this.deafT -= dt;
    if (!deaf) for (const n of AI_NOISE) { if (now - n.t > 400 || n.heardBy && n.heardBy.has(this)) continue; (n.heardBy || (n.heardBy = new Set())).add(this);
      const d = n.p.distanceTo(this.pos); if (d > n.r || (n.by && AIS.some(b => b.pid && b.pid === n.by))) continue;
      this.noise = { p: n.p.clone().add(new V3(rnd(-1.5, 1.5) * d / 20, 0, rnd(-1.5, 1.5) * d / 20)), t: now }; }
    // pick who to shoot: the one in view, nearest first, a downed one last
    let best = null, bs = 1e9; for (const K of this.know.values()) if (K.vis && K.t) { const s = K.t.pos.distanceTo(this.pos) + (K.t.dn ? 30 : 0); if (s < bs) { bs = s; best = K.t; } }
    if (best) { if (!this.tgt || this.tgt.id !== best.id) { this.engT = 0; this.err = 0.11 + Math.random() * 0.06; const r = Math.random(), hp = bs < 12 ? 0.5 : 0.28; this.aimZ = r < hp ? 'head' : r < hp + 0.3 ? 'hips' : 'chest'; } this.tgt = best; this.dist = bs; }
    else if (this.tgt && !this.tgtVis()) this.tgt = null;
  }
  // what one sees, the rest know a moment later
  callout(t, p) {
    const now = performance.now(); if (now - this.callT < 900) return; this.callT = now;
    for (const b of AIS) if (b !== this && !b.dead && !b.out && b.pos.distanceTo(this.pos) < 60) setTimeout(() => { if (b.dead) return; let K = b.know.get(t.id); if (!K) { K = { aw: 0, seen: 0, last: null, vis: false, heard: 0 }; b.know.set(t.id, K); } if (!K.vis) { K.last = p.clone(); K.heard = performance.now(); K.aw = Math.max(K.aw, 0.6); } }, 700 + Math.random() * 500);
  }
  // ---- what to do now
  decide() {
    const now = performance.now(), hurt = this.anat.blood < 3200 || hurtLevel(this.anat) > 0.6;
    if (this.tgtVis()) {
      this.state = 'engage'; this.path = null;
      // a step to the side now and then, never standing still in a doorway trading shots
      if (this.strafeT <= 0 && Math.random() < 0.06) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = rnd(0.3, 0.8); }
      // out of rounds with them close, or badly hurt: back off out of sight
      if ((this.mag === 0 && this.dist < 10) || (hurt && Math.random() < 0.04)) this.fallBack();
      return;
    }
    // the bomb is down: everyone goes to stop it
    const site = this.plantSite();
    if (site) {
      if (this.pos.distanceTo(site) < 1.6) { this.state = 'defuse'; this.path = null; this.defuseT += 0.1; if (this.defuseT > 6.5) { this.defuseT = 0; this.disable(); } return; }
      this.defuseT = 0; this.goTo(site, 'defuse'); return;
    }
    // something heard or called out: a recent one is hunted down, carefully
    let lk = null, lt = 0; for (const K of this.know.values()) { const t = Math.max(K.seen, K.heard); if (K.last && t > lt) { lt = t; lk = K.last; } }
    if (this.noise && this.noise.t > lt) { lt = this.noise.t; lk = this.noise.p; }
    if (lk && now - lt < 14000) {
      // half of them hold an angle on where it came from, half go for it
      if ((this.slot || 0) % 2 === 0 || this.holdHere) { this.state = 'hold'; this.lookYaw = Math.atan2(-(lk.x - this.pos.x), -(lk.z - this.pos.z)); if (!this.path || !this.path.length) return; }
      if (!this.goal || this.goal.distanceTo(lk) > 2 || !this.path || !this.path.length) this.goTo(lk, 'hunt');
      return;
    }
    // nothing going on: set the traps first, then patrol their part of the house
    const tr = this.traps.find(t => !t.done);
    if (tr) {
      if (this.pos.distanceTo(tr.p) < 1.4 || (tr.k === 'bd' && Math.hypot(this.pos.x - tr.p.x, this.pos.z - tr.p.z) < 2.2)) { tr.done = true; this.placeTrap(tr); }
      // (somewhere it can't get to: tried a few times, then given up on)
      else if (this.goal && this.goal.distanceTo(tr.p) < 0.1 && !this.path) { tr.tries = (tr.tries || 0) + 1; this.goal = null; if (tr.tries > 3) tr.done = true; }
      else this.goTo(tr.p, 'rush');
      return;
    }
    this.state = 'patrol';
    if (!this.path || !this.path.length) {
      this.waitT -= 0.1;
      if (this.waitT <= 0) { this.waitT = rnd(2, 6); const N = navFor(this.post), cand = N.nodes.filter(n => Math.abs(n.y - this.post.y) < 0.5 && Math.hypot(n.x - this.post.x, n.z - this.post.z) < (this.zone || 5)); if (cand.length) this.goTo(new V3().copy(cand[Math.floor(Math.random() * cand.length)]), 'patrol'); }
      else if (Math.random() < 0.15) this.lookYaw = this.ayaw + rnd(-1.6, 1.6);
    }
  }
  goTo(p, st) {
    this.state = st; const now = performance.now();
    if (this.goal && this.goal.distanceTo(p) < 0.5 && this.path && this.path.length && now - this.pathT < 3000) return;
    const N = navFor(this.pos), path = navPath(N, this.pos, p); this.goal = p.clone(); this.pathT = now;
    this.path = path ? path.slice() : null;
  }
  fallBack() {
    const t = this.tgt; if (!t) return; const N = navFor(this.pos); let best = null, bs = -1;
    for (let k = 0; k < 40; k++) { const n = N.nodes[Math.floor(Math.random() * N.nodes.length)]; if (!n || Math.abs(n.y - this.pos.y) > 0.5) continue; const q = new V3(n.x, n.y + 1.5, n.z), d = q.distanceTo(t.pos);
      if (d > 6 && d < 25 && Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 12 && !aiSees(q, new V3(t.pos.x, t.pos.y + 1.4, t.pos.z)) && d > bs) { bs = d; best = n; } }
    if (best) { this.goTo(new V3(best.x, best.y, best.z), 'fall'); if (this.mag < WEAPONS[this.w].cap) this.reload(); }
  }
  plantSite() {
    if (S.mode !== 'online' || !net.host || !net.host.R.plant) return null;
    const s = TOWN.sites && TOWN.sites.find(x => x.id === net.host.R.plant.site); return s && s.p ? new V3(s.p.x, s.p.y || 0, s.p.z) : null;
  }
  disable() { if (this.hostP && net.host) net.host.sgMsg(this.hostP, { t: 'sg', a: 'disable' }); }
  // the door in the way: opened (and unlocked: it's their house)
  doorAhead() {
    if (typeof doors === 'undefined') return; const n = this.path && this.path[0]; if (!n) return;
    for (const d of doors) {
      if (d.fallen || !d.leaf) continue; const c = d.g.position; if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) > 1.8) continue;
      if (Math.abs(d.a) > 0.6) continue;
      const L = d.leaf; L.updateMatrixWorld(true); const s = L.worldToLocal(this.pos.clone().setY(c.y + 1)).z >= 0 ? -1 : 1;
      d.lock = 0; d.tgt = s * DOOR_OPEN; d.w = s * 4;
      doorNet({ i: d.i, a: 'st', tg: d.tgt, w: d.w, an: d.a, h: 0, lk: 0 });
    }
  }
  // ---- the gun
  tryFire(dt) {
    const T = this.tgt && this.know.get(this.tgt.id); if (!T || !T.vis || this.fireT > 0) return;
    if (this.mag <= 0) { this.reload(); return; }
    this.engT += dt;
    // the first look is rough, it settles onto the target over about half a second, worse at range, moving or hurt
    const base = 0.008 * (1 + this.dist / 30) * (this.speedNow > 1 ? 1.8 : 1) * (1 + hurtLevel(this.anat)) * ((this.gasK || 0) > 0.3 ? 3 : 1);
    this.err = Math.max(base, this.err - dt * 0.28);
    if (Math.random() < dt * 4) { this.errY = rnd(-1, 1) * this.err; this.errP = rnd(-1, 1) * this.err * 0.6; }
    const aim = this.aimPoint(this.tgt), e = this.eye, d = aim.clone().sub(e), wy = Math.atan2(-d.x, -d.z), wp = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const off = Math.hypot(angWrap(wy - this.ayaw), wp - this.apitch);
    if (this.engT < 0.22 || off > Math.max(0.05, this.err * 2.5)) return;   // (reaction time, and not firing before it is on)
    const W = WEAPONS[this.w];
    // bursts at range, full auto up close, a pump between shotgun shells
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
    if (S.mode !== 'online') return;   // (the course has its own fixed traps)
    if (!this.hostP || !net.host) return;
    const H = net.host, id = (Math.random() * 1e6) | 0;
    if (T.k === 'bd') { H.sgMsg(this.hostP, { t: 'sg', a: 'bd', i: T.i }); return; }
    H.onMessage(this.hostP, { t: 'x', a: 'gd', k: T.k, i: id, p: [T.p.x, T.p.y, T.p.z].map(r3), f: T.f || 0, c: 2 });
  }
  // ---- the network (raid): its state as a player's, its hits and deaths through the room
  sendState() {
    const an = this.anat, a = this.hum.anim;
    const m = { t: 's', p: [this.pos.x, this.pos.y, this.pos.z].map(r4x), y: r4x(this.yaw), pi: r4x(this.pitch), v: r4x(this.speedNow), c: r4x(this.crouchK), l: 0, sp: this.speedNow > 5 ? 1 : 0, g: 1, a: r4x(a.ads || 0), w: this.w, r: r4x(a.reload || 0),
      pr: 0, lm: an.legBroken('L') || an.legBroken('R') ? 0.5 : 0, hu: r4x(a.hurt || 0), sg: 0, su: 0, fl: 0, dv: 0, ar: an.helmetOn ? 0 : 1, dn: 0, bb: an.brokenMask(), ah: an.armHangMask(), ls: an.lostMask(), lc: an.cutArr(),
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
      else this.respawn(TOWN.def && TOWN.def.length ? TOWN.def[this.slot % TOWN.def.length] : this.post);
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
    this.know.clear(); this.tgt = null; this.noise = null; this.path = null; this.mag = WEAPONS[this.w].cap; this.reloadT = 0; this.flashT = 0; this.deafT = 0; this.state = 'idle';
    for (const t of this.traps) { t.done = false; t.tries = 0; }
  }
  hide() { this.out = true; this.hum.root.visible = false; if (this.rag) { this.rag.keep = false; this.rag = null; } }
  update(dt) {
    super.update(dt);
    // out of the fight: dead, or down for good (no one is coming to drag it out)
    if (!this.dead && !this.out && (this.anat.paralyzed || this.anat.bothLegs() || (this.anat.isDowned() && !(this.anat.koT > 0)))) { if (!this.anat.dead) this.anat.kill(this.anat.paralyzed ? 'spinal' : 'bleed'); this.die(); }
  }
  die() {
    if (this.dead) return;
    super.die(); this.respawnT = 1e12; this.tgt = null; this.path = null;
    if (this.hostP && net.host) {
      const an = this.anat, d = an.lastDir.clone();
      net.host.died(this.hostP, { t: 'died', by: this.lastBy || 0, part: PART_OF_REGION(an.lastRegion), head: an.cause === 'brain', d: d.toArray().map(r4x), dist: Math.round(an.lastDist || 0), cause: an.cause || 'bleed', gib: an.gibHead ? 1 : 0, lf: this.hostP.life });
    }
    if (S.mode === 'test' && CQC.bots.includes(this) && CQC.bots.every(b => b.dead)) { flashMsg('COURSE CLEARED<small>It resets in 8 s.</small>', 3000); setTimeout(() => { if (S.mode === 'test') cqcReset(); }, 8000); }
  }
  dispose() { super.dispose(); const i = AIS.indexOf(this); if (i >= 0) AIS.splice(i, 1); }
}
const angWrap = a => Math.atan2(Math.sin(a), Math.cos(a));

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
  navClear(); const traps = raidTraps();
  H.bots.forEach((p, i) => {
    const sp = TOWN.def && TOWN.def.length ? TOWN.def[i % TOWN.def.length] : new V3();
    // (the traps first, then the boarding of the windows, shared out between them)
    const b = new AIBot(sp, { pid: p.id, hostP: p, name: p.name, w: i === 2 || i === 5 ? 5 : 0, post: sp, zone: 6, traps: [traps[i], traps[i + 6]].filter(Boolean) });
    b.slot = i; p.bot = b; dummies.push(b);
    if (!p.alive) b.hide();
  });
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
  CQC.bots = []; navClear();
  const posts = [[-6, 25, 0.5, 0], [6, 37, 2.5, 5], [-5, 31, 1.5, 0], [-6, 38, 2.2, 0]];
  posts.forEach(([x, z, yaw, w], i) => { const b = new AIBot(new V3(x, 0, z), { yaw, w, post: new V3(x, 0, z), zone: 3, name: 'CQC ' + (i + 1) }); b.slot = i; CQC.bots.push(b); dummies.push(b); });
}
// a bot wherever you are (console "spawn ai")
function spawnAI(p) { const b = new AIBot(p.clone(), { post: p.clone(), zone: 4 }); dummies.push(b); return b; }
function aiClearAll() { for (const b of AIS.slice()) { b.dispose(); const k = dummies.indexOf(b); if (k >= 0) dummies.splice(k, 1); } CQC.bots = []; navClear(); }
function updateAI() { const now = performance.now(); while (AI_NOISE.length && now - AI_NOISE[0].t > 1500) AI_NOISE.shift(); }

// ---- module exports: build.mjs strips this block ----
export { CQC, aiNoise, buildCqc, cqcReset, navClear, navDirty, raidAddBots, raidBodies, spawnAI, updateAI };
// ---- end module exports ----
