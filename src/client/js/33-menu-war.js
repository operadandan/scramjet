// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, V3, camera, clamp, rnd, smooth } from './00-setup.js';
import { TOWN } from './01b-town.js';
import { Anatomy } from './05-anatomy.js';
import { WEAPONS } from './06-weapons.js';
import { audioMute } from './10-audio.js';
import { nz } from './12b-gore.js';
import { clearWounds } from './14-wounds.js';
import { Dummy, S, dummies } from './17-dummies.js';
import { clearWorldFx } from './22-menu-loop.js';
import { ENV, envSet } from './24-env.js';
import { floorUnder } from './30-structure.js';
import { AIBot, AI_PAL, aiSees, navBlocked } from './32-ai.js';
// ---- end module links ----
// The main menu's backdrop: a firefight somewhere round the house, attackers in red against defenders in navy. It moves
// between a few places (the street out front, the side road to the west, the east yard), a round or so at each. The fighters
// are the game's own bots with a simple fighting brain: pop up, find someone on the other side, shoot, duck, reload, and
// every so often break from cover and dash for another spot, diving the last stretch into it. Hits are real (rounds,
// tracers, flashes, blood, wounds) and one or two of them fall in each fight; the rest shrug off what would drop them.
// None of it is heard: the menu is quiet.
const MW = { on: false, list: [], shot: 0, shotT: 0, t: 0, loc: Math.floor(Math.random() * 6), locT: 0, deaths: 0 };
const MW_RED = { shirt: 0x6e2a22, vest: 0x58241f, vest2: 0x4a1e1a, pack: 0x4e2420, helmet: 0x5a2a24 };
// each place: the attackers' and defenders' cover spots (x, z), more spots than fighters so they have somewhere to run to,
// and the weapons they carry (indices into WEAPONS: 0 M4, 3 AK-74, 5 M870)
// each place: how many a side, their spots (x, z; more than fighters, so they have somewhere to run to), spread about rather
// than in two lines, and for the places indoors the camera shots (high in a corner of the room) since one from outside
// would only see the wall
const MW_LOCS = [
  { name: 'street', nr: 4, nb: 3,
    r: [[-6.8, 31.2], [4.6, 31.8], [12, 33.0], [-17, 31.0], [7.2, 31.6], [-0.3, 31.5], [-12, 22.8], [16.6, 23.4]],
    b: [[9.5, 11.0], [-4.6, 13.0], [-17, 14.2], [1.3, 13.2], [-10.5, 12.0], [5.6, 11.4]] },
  { name: 'living room', nr: 2, nb: 2,
    r: [[-5.0, 7.8], [-5.4, 2.0], [-6.6, 5.0], [-5.2, 9.2]],
    b: [[-12.8, 1.4], [-12.2, 8.6], [-10.6, 4.4], [-13.2, 5.8]],
    shots: [{ a: [-13.6, 2.55, 0.4], b: [-13.5, 2.5, 1.4], la: [-6, 0.9, 6], lb: [-6, 0.9, 5] }, { a: [-4.4, 2.5, 9.6], b: [-4.5, 2.5, 8.6], la: [-12, 0.9, 3], lb: [-12, 0.9, 4] }] },
  { name: 'kitchen', nr: 2, nb: 3,
    r: [[1.2, -1.2], [1.4, -8.8], [2.6, -5.0], [1.0, -3.6]],
    b: [[12.4, -8.6], [11.0, -1.4], [12.8, -4.6], [9.6, -9.0], [10.0, -6.0]],
    shots: [{ a: [13.6, 2.55, -9.6], b: [13.5, 2.5, -8.6], la: [2, 0.9, -4], lb: [2, 0.9, -5] }, { a: [0.5, 2.5, -0.5], b: [0.6, 2.5, -1.4], la: [11, 0.9, -6], lb: [11, 0.9, -5] }] },
  { name: 'back garden', nr: 3, nb: 3,
    r: [[-18.6, -14.6], [-15.0, -11.4], [-11.6, -14.8], [-17.0, -12.0], [-8.4, -13.0]],
    b: [[13.6, -12.2], [8.0, -14.8], [4.0, -11.2], [10.6, -11.4], [1.8, -14.6]],
    shots: [{ a: [-4, 8, -27], b: [0, 8.4, -27.5], la: [-2, 0.6, -13], lb: [-2, 0.6, -13] }, { a: [-24, 6.5, -20], b: [-23, 6.8, -22], la: [4, 0.6, -13], lb: [4, 0.6, -13] }] },
  { name: 'west road', nr: 3, nb: 2,
    r: [[-26.0, -0.8], [-26.0, -7.0], [-31.5, -3.4], [-29.0, 5.6], [-24.0, -19.0], [-28.6, -12.4]],
    b: [[-17.4, -12.6], [-15.0, 4.0], [-15.2, -4.0], [-16.8, 8.4], [-15.0, -8.6]] },
  { name: 'east yard', nr: 2, nb: 3,
    r: [[22.7, -6.3], [30.7, 10.3], [28.0, 17.8], [25.5, -1.0], [24.4, 3.0]],
    b: [[15.2, -2.2], [16.7, 11.5], [15.3, 5.0], [15.2, -7.5], [16.0, 2.0]] }
];
const MW_W = { r: [0, 3, 0, 5], b: [0, 5, 3, 0] };
class MenuFighter extends AIBot {
  constructor(p, side, w) {
    // (the defenders wear the bots' navy; the attackers are put in red while this one is built)
    const keep = Object.assign({}, AI_PAL); if (side === 'r') Object.assign(AI_PAL, MW_RED);
    try { super(p, { w, yaw: 0 }); } finally { Object.assign(AI_PAL, keep); }
    this.side = side; this.mid = MW.list.length + 1; this.popT = rnd(0.5, 3); this.up = Math.random() < 0.5; this.aimZ = 'chest';
    this.moveT = rnd(4, 10); this.dive = null; this.downT = 0;
  }
  active() { return MW.on && !this.dead; }
  moveSpeed() { return 5.6; }
  // what it can see: anyone on the other side it has a clear line to; the nearest of them is the one it fights
  perceive() {
    let best = null, bd = 1e9; const e = this.eye;
    for (const o of MW.list) { if (o.side === this.side || o.dead || o.rag || o.out) continue;
      const q = o.pos.clone(); q.y += 1.62 - 0.6 * o.crouchK - 1.1 * o.proneK; const d = q.distanceTo(e);
      if (d < bd && aiSees(e, q)) { bd = d; best = o; } }
    this.know.clear();
    if (best && !this.dive && !this.run) { this.tgt = { id: best.mid, pos: best.pos, c: best.crouchK, pr: best.proneK, dn: false, r: { tpos: best.pos, pos: best.pos } }; this.know.set(best.mid, { vis: true, last: best.pos.clone() }); this.dist = bd; }
    else { this.tgt = null; this.engT = 0; }
  }
  // up to fire, down behind cover to reload or when it has been up a while, a lean out round the side now and then; and
  // every several seconds a dash to another spot that nobody on its side holds
  decide() {
    this.state = 'camp';
    if (this.dive) return;
    if (this.run) { this.state = 'dodge'; this.stance = 0; this.lean = 0; if (!this.path || !this.path.length) this.run = null; return; }
    this.path = null; this.popT -= 0.1; this.moveT -= 0.1;
    if (this.moveT <= 0 && this.reloadT <= 0) {
      this.moveT = rnd(6, 13); const L = MW_LOCS[MW.loc][this.side], free = L.filter(([x, z]) => Math.hypot(x - this.pos.x, z - this.pos.z) > 2 && Math.hypot(x - this.pos.x, z - this.pos.z) < 14 && !MW.list.some(o => o !== this && o.side === this.side && !o.dead && Math.hypot(o.spot.x - x, o.spot.z - z) < 1));
      if (free.length) { const [x, z] = free[Math.floor(Math.random() * free.length)]; this.spot.set(x, floorUnder(x, z, 3), z); this.run = this.spot.clone(); this.path = [this.run.clone()]; this.dodgeT = 6; this.state = 'dodge'; this.stance = 0; this.lean = 0; return; }
    }
    if (this.reloadT > 0) { this.stance = 1; this.lean = 0; return; }
    if (this.popT <= 0) { this.up = !this.up; this.popT = this.up ? rnd(2.5, 5.5) : rnd(1.2, 3); this.lean = this.up && Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) : 0; this.aimZ = Math.random() < 0.2 ? 'head' : 'chest'; }
    this.stance = this.up ? 0 : 1;
    if (!this.tgt) { const e = MW.list.find(o => o.side !== this.side); if (e) { this.lookYaw = Math.atan2(-(e.pos.x - this.pos.x), -(e.pos.z - this.pos.z)); this.lookP = 0; } }
  }
  reload() { if (this.reloadT > 0) return; this.reloadT = WEAPONS[this.w].pellets ? 2.8 : 2.6; this.burst = 0; this.up = false; this.popT = rnd(0.4, 1.2); }
  doorAhead() {} claymores() {} tryThrow() {}
  // (one or two fall for good in each fight; the others shrug off what would drop them and their bodies start over sound)
  die() { if (this.fall) return Dummy.prototype.die.call(this); this.anat = new Anatomy(); }
  goLimp(soft) { if (this.fall) return Dummy.prototype.goLimp.call(this, soft); }
  startReaction(k) { if (this.fall) return Dummy.prototype.startReaction.call(this, k); this.react = undefined; }
  update(dt) {
    if (this.dead) { this.respawnT = 1e9; return super.update(dt); }
    const a = this.anat, bad = a.dead || a.isDowned() || a.bothLegs() || a.koT > 0 || a.paralyzed || a.legBroken('L') || a.legBroken('R') || a.blood < 3800;
    if ((a.dead || a.isDowned()) && !this.fall && MW.deaths > 0 && MW.locT > 8 && MW.t - (MW.lastFall || -99) > 9) { MW.deaths--; MW.lastFall = MW.t; this.fall = true; this.dive = null; this.run = null; this.path = null; }
    if (this.fall) { if (!this.rag && !this.dead) { this.forceDown = true; } return super.update(dt); }
    if (bad) this.anat = new Anatomy();
    this.forceDown = false; this.react = undefined; this.stag = undefined;
    this.healT = (this.healT || 0) + dt; if (this.healT > 45) { this.healT = 0; clearWounds(this.hum); this.hum.erosion = []; }
    // the dash: run at it, and from a couple of metres out throw itself the rest of the way, landing flat, then up on a knee
    if (this.run && !this.dive) { const dx = this.run.x - this.pos.x, dz = this.run.z - this.pos.z, L = Math.hypot(dx, dz);
      if (L < 2.3 && this.speedNow > 2.5) { this.dive = { t: 0, d: new V3(dx / L, 0, dz / L), L: Math.max(0.6, L - 0.35), y0: this.pos.y }; this.path = null; this.run = null; this.ayaw = Math.atan2(-dx, -dz); this.yawV = 0; } }
    super.update(dt);
    if (this.dive) {
      const D = this.dive, k0 = Math.min(1, D.t / 0.5); D.t += dt; const k1 = Math.min(1, D.t / 0.5);
      if (k1 < 1) { const step = D.L * (smooth(k1) - smooth(k0)), nx = this.pos.x + D.d.x * step, nz = this.pos.z + D.d.z * step, y = floorUnder(nx, nz, this.pos.y + 0.6);
        if (!navBlocked(nx, y + 0.45, nz, 1.0, 0.15)) this.pos.set(nx, y, nz); }
      // (the arc of the leap, the body going from upright to flat on the way down)
      const air = k1 < 1 ? Math.sin(Math.PI * k1) * 0.32 : 0;
      this.proneK = D.t < 0.5 ? Math.min(1, k1 * 1.6) : D.t < 1.1 ? 1 : this.proneK; this.stance = D.t < 1.1 ? 2 : 1;
      this.hum.root.position.copy(this.pos); this.hum.root.position.y += air; this.hum.root.rotation.y = this.ayaw;
      Object.assign(this.hum.anim, { prone: this.proneK, speed: 0, sprint: 0 });
      if (D.t > 1.1) { this.dive = null; this.up = false; this.popT = rnd(0.8, 1.6); }
    }
  }
}
// ---- a fight: its fighters set out at their place, two a side looking at the other; then, after a while, the next place
function menuWarStart() {
  if (MW.on) return; MW.on = true; if (typeof ENV !== 'undefined' && ENV.w === 'fog') envSet('cloudy', true);
  audioMute(true); MW.list.length = 0; MW.t = 0; MW.locT = 0; MW.shot = 0; MW.shotT = 0; MW.deaths = Math.random() < 0.5 ? 1 : 2;
  const L = MW_LOCS[MW.loc];
  for (const side of ['r', 'b']) { const spots = L[side].slice(0, side === 'r' ? L.nr : L.nb);
    spots.forEach(([x, z], i) => { const p = new V3(x, 0, z); p.y = floorUnder(x, z, 3);
      const f = new MenuFighter(p, side, MW_W[side][i % 4]); f.spot = p.clone(); MW.list.push(f); dummies.push(f);
      const o = L[side === 'r' ? 'b' : 'r'][0]; f.ayaw = f.yaw = Math.atan2(-(o[0] - x), -(o[1] - z)); }); }
  MW.shots = mwShots(L);
}
function menuWarStop() {
  if (!MW.on) return; MW.on = false;
  for (const f of MW.list) { f.dispose(); const k = dummies.indexOf(f); if (k >= 0) dummies.splice(k, 1); }
  MW.list.length = 0; clearWorldFx(); audioMute(false);
}
function updateMenuWar(dt) {
  if (S.mode) { if (MW.on) menuWarStop(); return; }
  if (!MW.on) { if ($('menu').style.display !== 'none' && typeof TOWN !== 'undefined' && TOWN.windows && TOWN.windows.length) menuWarStart(); else return; }
  MW.t += dt; MW.locT += dt;
  // (a fight runs its course, three shots of it, then it is over and the next one starts somewhere else)
  if (MW.locT > MW_FIGHT) { menuWarStop(); { let n; do n = Math.floor(Math.random() * MW_LOCS.length); while (n === MW.loc && MW_LOCS.length > 1); MW.loc = n; } menuWarStart(); return; }
  for (const f of MW.list) f.update(dt);
}
// ---- the camera: a few slow shots, each a gentle drift, cutting from one to the next. The menu covers the left of the
// screen, so each shot is framed into the clear part on the right: the lens is pointed so the whole fight (both sides) sits
// in that strip, and opened just wide enough to hold it
// (high and along the line between the two sides, behind the attackers, so one side is near the bottom of the picture and
// the other far up it: both fit the strip big enough to see. Three of them, straight behind and off to either side)
const MW_FIGHT = 36;
function mwShots(L) {
  if (L.shots) return L.shots;
  const c = (list) => list.reduce((s, [x, z]) => [s[0] + x / list.length, s[1] + z / list.length], [0, 0]);
  const A = c(L.r), B = c(L.b), dx = A[0] - B[0], dz = A[1] - B[1], n = Math.hypot(dx, dz), ux = dx / n, uz = dz / n, sx = -uz, sz = ux, mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  return [[0, 12, 9], [7, 11, 8], [-7, 11, 8.5]].map(([side, back, h]) => {
    const p = [A[0] + ux * back + sx * side, h, A[1] + uz * back + sz * side];
    return { a: p, b: [p[0] + sx * 2, p[1] - 0.6, p[2] + sz * 2], la: [mid[0], 0.6, mid[1]], lb: [mid[0] + sx * 0.5, 0.6, mid[1] + sz * 0.5] };
  });
}
const _mwA = new V3(), _mwB = new V3(), _mwP = new V3();
function mwFree() {
  // (the right edge of what the menu shows: its column and the open pane)
  const now = performance.now(); if (MW.freeT && now - MW.freeT < 500) return MW.free; MW.freeT = now;
  let r = 0; for (const el of document.querySelectorAll('#menu .mcol, #menu .mpane')) { if (el.offsetParent === null) continue; const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) r = Math.max(r, b.right - (el.classList.contains('mpane') ? 50 : 0)); }
  return MW.free = clamp(r / innerWidth, 0.25, 0.72);
}
function menuWarCam(dt) {
  const SH = MW.shots, DUR = MW_FIGHT / SH.length; MW.shotT += dt; if (MW.shotT > DUR) { MW.shotT = 0; MW.shot = (MW.shot + 1) % SH.length; }
  const s = SH[MW.shot], k = MW.shotT / DUR, e = k * k * (3 - 2 * k), t = performance.now() / 1000;
  _mwA.fromArray(s.a).lerp(_mwB.fromArray(s.b), e); camera.position.copy(_mwA); camera.position.y += Math.sin(t * 0.7) * 0.04;
  _mwA.fromArray(s.la).lerp(_mwB.fromArray(s.lb), e); camera.lookAt(_mwA); camera.updateMatrixWorld(true);
  // where everyone is, as seen from here (head and feet)
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; const inv = camera.matrixWorldInverse;
  for (const f of MW.list) if (!f.dead) for (const h of [0.05, 1.8]) { _mwP.copy(f.pos); _mwP.y += h; _mwP.applyMatrix4(inv); if (_mwP.z > -1) continue; const u = _mwP.x / -_mwP.z, v = _mwP.y / -_mwP.z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const W = innerWidth, H = innerHeight, asp = W / H, f0 = mwFree(), sw = (1 - f0) * 0.74, c = f0 + (1 - f0) * 0.54;
  if (u0 > u1) { u0 = -0.2; u1 = 0.2; v0 = -0.2; v1 = 0.2; }
  // half the width of the picture (at one unit out) such that the fight fills the strip, and its height fits too
  let T = Math.max((u1 - u0) / (2 * sw), (v1 - v0) / 2 * asp / 0.8, Math.tan(0.2) * asp);
  T = Math.min(T, Math.tan(1.1) * asp);
  const Tv = T / asp, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  camera.fov = 2 * Math.atan(Tv) * 180 / Math.PI;
  // the picture slid so the middle of the fight lands in the middle of the strip, a little below centre
  const x = W * (uc - 2 * T * c + T) / (2 * T), y = H * (-vc - 0.1 * Tv) / (2 * Tv);
  camera.setViewOffset(W, H, x, y, W, H);
  camera.updateProjectionMatrix();
}

// ---- module exports: build.mjs strips this block ----
export { MW, menuWarCam, menuWarStop, updateMenuWar };
// ---- end module exports ----
