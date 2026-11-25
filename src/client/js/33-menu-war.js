// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, V3, camera, clamp, rnd } from './00-setup.js';
import { TOWN } from './01b-town.js';
import { Anatomy } from './05-anatomy.js';
import { WEAPONS } from './06-weapons.js';
import { clearWounds } from './14-wounds.js';
import { S, dummies } from './17-dummies.js';
import { clearWorldFx } from './22-menu-loop.js';
import { ENV, envSet } from './24-env.js';
import { floorUnder } from './30-structure.js';
import { AIBot, AI_PAL, aiSees } from './32-ai.js';
// ---- end module links ----
// The main menu's backdrop: a firefight in the street outside the house. Attackers in red behind the van, the low wall and
// the barriers across the road; defenders in navy in the front garden behind the car, the tree and the porch. They are the
// game's own bots with a simple fighting brain (pop up, find someone on the other side, shoot, duck, reload), so everything
// seen is real: the rounds and tracers, muzzle flashes, shells, hits, blood, wounds and bodies. The fallen get up again a
// few seconds later where they fell. The camera drifts between a few slow shots of it.
const MW = { on: false, list: [], shot: 0, shotT: 0, t: 0 };
const MW_RED = { shirt: 0x6e2a22, vest: 0x58241f, vest2: 0x4a1e1a, pack: 0x4e2420, helmet: 0x5a2a24 };
// (bunched across the middle of the street, so the whole fight fits the clear part of the screen beside the menu)
const MW_SPOTS = {
  r: [[-0.3, 31.5, 5], [2.8, 31.75, 3], [5.0, 31.75, 0]],
  b: [[-2.4, 12.4, 0], [2.6, 12.2, 5], [0.2, 13.4, 3]]
};
class MenuFighter extends AIBot {
  constructor(p, side, w) {
    // (the defenders wear the bots' navy; the attackers are put in red while this one is built)
    const keep = Object.assign({}, AI_PAL); if (side === 'r') Object.assign(AI_PAL, MW_RED);
    try { super(p, { w, yaw: side === 'r' ? 0 : Math.PI }); } finally { Object.assign(AI_PAL, keep); }
    this.side = side; this.mid = MW.list.length + 1; this.popT = rnd(0.5, 3); this.up = Math.random() < 0.5; this.aimZ = 'chest';
  }
  active() { return MW.on && !this.dead; }
  // what it can see: anyone on the other side it has a clear line to; the nearest of them is the one it fights
  perceive() {
    let best = null, bd = 1e9; const e = this.eye;
    for (const o of MW.list) { if (o.side === this.side || o.dead || o.rag || o.out) continue;
      const q = o.pos.clone(); q.y += 1.62 - 0.6 * o.crouchK; const d = q.distanceTo(e);
      if (d < bd && aiSees(e, q)) { bd = d; best = o; } }
    this.know.clear();
    if (best) { this.tgt = { id: best.mid, pos: best.pos, c: best.crouchK, pr: 0, dn: false, r: { tpos: best.pos, pos: best.pos } }; this.know.set(best.mid, { vis: true, last: best.pos.clone() }); this.dist = bd; }
    else { this.tgt = null; this.engT = 0; }
  }
  // up to fire, down behind cover to reload or when it has been up a while; now and then a lean out round the side
  decide() {
    this.path = null; this.state = 'camp';
    this.popT -= 0.1;
    if (this.reloadT > 0) { this.stance = 1; this.lean = 0; return; }
    if (this.popT <= 0) { this.up = !this.up; this.popT = this.up ? rnd(2.5, 5.5) : rnd(1.2, 3); this.lean = this.up && Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) : 0; this.aimZ = Math.random() < 0.2 ? 'head' : 'chest'; }
    this.stance = this.up ? 0 : 1;
    if (!this.tgt) { const e = MW.list.find(o => o.side !== this.side); if (e) { this.lookYaw = Math.atan2(-(e.pos.x - this.pos.x), -(e.pos.z - this.pos.z)); this.lookP = 0; } }
  }
  reload() { if (this.reloadT > 0) return; this.reloadT = WEAPONS[this.w].pellets ? 2.8 : 2.6; this.burst = 0; this.up = false; this.popT = rnd(0.4, 1.2); }
  doorAhead() {} claymores() {} tryThrow() {}
  // nobody falls in the menu's fight: the rounds hit (blood, holes, a flinch), but whatever would drop it is shrugged off
  // and its body starts over sound; the wounds it has taken stay on it for a while, then heal over
  die() { this.anat = new Anatomy(); }
  goLimp() {}
  startReaction() { this.react = undefined; }
  update(dt) {
    const a = this.anat;
    if (a.dead || a.isDowned() || a.bothLegs() || a.koT > 0 || a.paralyzed || a.legBroken('L') || a.legBroken('R') || a.blood < 3800) this.anat = new Anatomy();
    this.forceDown = false; this.react = undefined; this.stag = undefined; this.dead = false;
    this.healT = (this.healT || 0) + dt; if (this.healT > 45) { this.healT = 0; clearWounds(this.hum); this.hum.erosion = []; }
    super.update(dt);
  }
}
function menuWarStart() {
  if (MW.on) return; MW.on = true; if (typeof ENV !== 'undefined' && ENV.w === 'fog') envSet('cloudy', true); MW.list.length = 0; MW.t = 0; MW.shot = Math.floor(Math.random() * 3); MW.shotT = 0;
  for (const side of ['r', 'b']) MW_SPOTS[side].forEach(([x, z, w]) => {
    const p = new V3(x, 0, z); p.y = floorUnder(x, z, 3);
    const f = new MenuFighter(p, side, w); f.spot = p.clone(); MW.list.push(f); dummies.push(f);
  });
}
function menuWarStop() {
  if (!MW.on) return; MW.on = false;
  for (const f of MW.list) { f.dispose(); const k = dummies.indexOf(f); if (k >= 0) dummies.splice(k, 1); }
  MW.list.length = 0; clearWorldFx();
}
function updateMenuWar(dt) {
  if (S.mode) { if (MW.on) menuWarStop(); return; }
  if (!MW.on) { if ($('menu').style.display !== 'none' && typeof TOWN !== 'undefined' && TOWN.windows && TOWN.windows.length) menuWarStart(); else return; }
  MW.t += dt;
  for (const f of MW.list) f.update(dt);
}
// ---- the camera: a few slow shots, each a gentle drift, cutting from one to the next. The menu covers the left of the
// screen, so each shot is framed into the clear part on the right: the lens is pointed so the whole fight (both sides) sits
// in that strip, and opened just wide enough to hold it
// (high and along the line between the two sides, so one side is near the bottom of the picture and the other far up it:
// both fit the strip big enough to see)
const MW_SHOTS = [
  // up behind the attackers, down across the street at the house
  { a: [0.5, 10, 45], b: [2.5, 9.4, 44.5], la: [0, 0.6, 22], lb: [0.5, 0.6, 22] },
  // low over the van
  { a: [-1.5, 4.8, 39], b: [1.5, 5.2, 39.5], la: [0.5, 0.8, 14], lb: [0.5, 0.8, 14] },
  // from the attackers' right rear
  { a: [12, 9, 40.5], b: [10.5, 9.4, 41.5], la: [1.5, 0.6, 21], lb: [1.5, 0.6, 21] },
  // from the attackers' left rear
  { a: [-9, 8.5, 41], b: [-7.5, 8, 42], la: [1.5, 0.6, 21], lb: [1.5, 0.6, 21] }
];
const _mwA = new V3(), _mwB = new V3(), _mwP = new V3();
function mwFree() {
  // (the right edge of what the menu shows: its column and the open pane)
  const now = performance.now(); if (MW.freeT && now - MW.freeT < 500) return MW.free; MW.freeT = now;
  let r = 0; for (const el of document.querySelectorAll('#menu .mcol, #menu .mpane')) { if (el.offsetParent === null) continue; const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) r = Math.max(r, b.right - (el.classList.contains('mpane') ? 50 : 0)); }
  return MW.free = clamp(r / innerWidth, 0.25, 0.72);
}
function menuWarCam(dt) {
  MW.shotT += dt; const DUR = 12; if (MW.shotT > DUR) { MW.shotT = 0; MW.shot = (MW.shot + 1) % MW_SHOTS.length; }
  const s = MW_SHOTS[MW.shot], k = MW.shotT / DUR, e = k * k * (3 - 2 * k), t = performance.now() / 1000;
  _mwA.fromArray(s.a).lerp(_mwB.fromArray(s.b), e); camera.position.copy(_mwA); camera.position.y += Math.sin(t * 0.7) * 0.04;
  _mwA.fromArray(s.la).lerp(_mwB.fromArray(s.lb), e); camera.lookAt(_mwA); camera.updateMatrixWorld(true);
  // where everyone is, as seen from here (head and feet)
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; const inv = camera.matrixWorldInverse;
  for (const f of MW.list) for (const h of [0.05, 1.8]) { _mwP.copy(f.pos); _mwP.y += h; _mwP.applyMatrix4(inv); if (_mwP.z > -1) continue; const u = _mwP.x / -_mwP.z, v = _mwP.y / -_mwP.z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const W = innerWidth, H = innerHeight, asp = W / H, f0 = mwFree(), sw = (1 - f0) * 0.82, c = f0 + (1 - f0) * 0.48;
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
