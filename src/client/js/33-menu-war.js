// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, V3, camera, rnd } from './00-setup.js';
import { TOWN } from './01b-town.js';
import { ragdolls } from './04-ragdoll.js';
import { WEAPONS } from './06-weapons.js';
import { Dummy, S, dummies } from './17-dummies.js';
import { clearWorldFx } from './22-menu-loop.js';
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
const MW_SPOTS = {
  r: [[-6.8, 31.2, 0], [0.4, 31.5, 5], [4.5, 31.7, 3], [6.4, 31.75, 0]],
  b: [[-6.4, 11.7, 0], [3.4, 12.1, 5], [-10.5, 12.0, 3], [-1.8, 12.9, 0]]
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
  die() {
    if (this.dead) return;
    Dummy.prototype.die.call(this); this.respawnT = rnd(7, 11); this.tgt = null;
  }
  update(dt) {
    // (back on its feet: its old body goes, it stands up in its spot again)
    if (this.rag && !this.dead) { this.downT = (this.downT || 0) + dt; if (this.downT > 9) this.die(); } else this.downT = 0;
    if (this.dead && this.respawnT - dt <= 0) { const R = this.rag; if (R) { const i = ragdolls.indexOf(R); if (i >= 0) ragdolls.splice(i, 1); R.dispose(); } this.pos.copy(this.spot); this.mag = WEAPONS[this.w].cap; this.reloadT = 0; }
    super.update(dt);
  }
}
function menuWarStart() {
  if (MW.on) return; MW.on = true; MW.list.length = 0; MW.t = 0; MW.shot = Math.floor(Math.random() * 3); MW.shotT = 0;
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
// ---- the camera: a few slow shots, each a gentle drift, cutting from one to the next
const MW_SHOTS = [
  // down the street from the east, both sides in frame
  { a: [23, 3.9, 23.0], b: [19.5, 3.6, 23.2], la: [-1, 1.0, 21.5], lb: [-3, 1.1, 21.8] },
  // over the attackers' heads behind the van, toward the house
  { a: [-3.5, 4.1, 35.4], b: [-1.5, 4.2, 35.8], la: [-1, 0.8, 12], lb: [0.5, 0.8, 12] },
  // from the west end of the front garden, past the defenders, out at the street
  { a: [-12.5, 1.7, 10.8], b: [-12.2, 1.85, 11.4], la: [6, 1.5, 24], lb: [4, 1.4, 25] },
  // high and wide from the west end of the street
  { a: [-30, 6.5, 24], b: [-27, 6, 19], la: [0, 1, 21], lb: [2, 1, 22] }
];
const _mwA = new V3(), _mwB = new V3();
function menuWarCam(dt) {
  MW.shotT += dt; const DUR = 11; if (MW.shotT > DUR) { MW.shotT = 0; MW.shot = (MW.shot + 1) % MW_SHOTS.length; }
  const s = MW_SHOTS[MW.shot], k = MW.shotT / DUR, e = k * k * (3 - 2 * k), t = performance.now() / 1000;
  _mwA.fromArray(s.a).lerp(_mwB.fromArray(s.b), e); camera.position.copy(_mwA); camera.position.y += Math.sin(t * 0.7) * 0.05; camera.position.x += Math.sin(t * 0.43) * 0.04;
  _mwA.fromArray(s.la).lerp(_mwB.fromArray(s.lb), e); camera.lookAt(_mwA);
  camera.fov = 58; camera.updateProjectionMatrix();
}

// ---- module exports: build.mjs strips this block ----
export { MW, menuWarCam, menuWarStop, updateMenuWar };
// ---- end module exports ----
