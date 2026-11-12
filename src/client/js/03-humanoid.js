// ---------------------------------------------------------------- humanoid (animated, arms by IK)
const _S = new V3(), _D = new V3(), _PP = new V3(), _E = new V3(), _U = new V3(), _F = new V3(), _H = new V3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _DOWN = new V3(0, -1, 0), _YAX = new V3(0, 1, 0);
function solveArm(sh, el, target, pole, L1, L2) {
  sh.getWorldPosition(_S);
  _D.subVectors(target, _S);
  let d = _D.length(); _D.multiplyScalar(1 / (d || 1));
  d = clamp(d, Math.abs(L1 - L2) + 0.03, L1 + L2 - 0.002);
  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  _PP.copy(pole).addScaledVector(_D, -pole.dot(_D)).normalize();
  _E.copy(_S).addScaledVector(_D, x).addScaledVector(_PP, h);
  _H.copy(_S).addScaledVector(_D, d);
  _U.subVectors(_E, _S).normalize(); _F.subVectors(_H, _E).normalize();
  _q1.setFromUnitVectors(_DOWN, _U);
  sh.parent.getWorldQuaternion(_q2);
  sh.quaternion.copy(_q2.invert().multiply(_q1));
  _q3.setFromUnitVectors(_DOWN, _F);
  el.quaternion.copy(_q1.clone().invert().multiply(_q3));
}
function buildTPMedkit(M) {
  const g = new THREE.Group();
  tpBox(M, 0.16, 0.1, 0.07, 0x4a4f3a, g, 0, 0, 0);
  tpBox(M, 0.05, 0.014, 0.004, 0xb02020, g, 0, 0, -0.037); tpBox(M, 0.014, 0.05, 0.004, 0xb02020, g, 0, 0, -0.037);
  return { g, mag: new THREE.Object3D(), grip: mark(g, 0.085, -0.01, 0.0), fore: mark(g, -0.085, -0.01, 0.0), well: mark(g, 0, -0.05, 0) };
}
const RPIV_WORLD = new V3(0.15, 0.53, -0.05);
class Humanoid {
  constructor(pal, shadowOnly) {
    this.pal = Object.assign({}, HUM_DEFAULT, pal || {});
    this.shadowOnly = !!shadowOnly;
    this.root = new THREE.Group();
    this.hitMeshes = [];
    this.wb = 0;
    this.anim = { phase: 0, speed: 0, crouch: 0, prone: 0, limp: 0, lean: 0, pitch: 0, reload: 0, sprint: 0, ads: 0, air: 0, weapon: 0 };
    const pl = this.pal, self = this;
    const M = this.M = (c, r, m) => self.shadowOnly ? shadowMat : mat(c, r, m);
    const B = new Body(pl, M, (m, frame, armor) => { m.userData.frame = frame; m.userData.hum = self; if (armor) m.userData.armor = armor; self.hitMeshes.push(m); });
    const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.pose = grp(this.root, 0, 0, 0);
    this.hips = grp(this.pose, 0, 0.95, 0); B.pelvis(this.hips, 0, true);
    this.spine = grp(this.hips, 0, 0.07, 0); B.chest(this.spine, 0, true);
    this.chestMark = grp(this.spine, 0, 0.3, -0.14);
    this.pouch = grp(this.spine, -0.05, 0.24, -0.22);
    this.neck = grp(this.spine, 0, 0.55, 0);
    B.add(cylg(0.046, 0.1, 14, 0.052), pl.skin, this.neck, 0, 0.03, 0.004, 'neck');
    this.head = grp(this.neck, 0, 0.06, 0); B.head(this.head, 0.1, true);
    this.headMark = grp(this.head, 0, 0.1, 0);
    const arm = side => {
      const sx = side === 'L' ? -1 : 1;
      const sh = grp(this.spine, 0.2 * sx, 0.5, 0.0); B.upperArm(sh, 0, 0.3, side);
      const el = grp(sh, 0, -0.3, 0); B.forearm(el, 0, 0.3, side);
      return [sh, el, grp(el, 0, -0.3, 0)];
    };
    [this.shL, this.elL, this.hdL] = arm('L');
    [this.shR, this.elR, this.hdR] = arm('R');
    const leg = side => {
      const lg = grp(this.hips, 0.1 * (side === 'L' ? -1 : 1), -0.03, 0); B.thigh(lg, 0, 0.44, side);
      const kn = grp(lg, 0, -0.44, 0); B.shin(kn, 0, 0.44, side);
      return [lg, kn, grp(kn, 0, -0.44, 0)];
    };
    [this.lgL, this.knL, this.ftL] = leg('L');
    [this.lgR, this.knR, this.ftR] = leg('R');
    this.frames = { head: this.head, neck: this.neck, spine: this.spine, hips: this.hips, shL: this.shL, elL: this.elL, shR: this.shR, elR: this.elR, lgL: this.lgL, knL: this.knL, lgR: this.lgR, knR: this.knR };
    this.rPiv = grp(this.spine, 0, 0, 0); this.rPiv.rotation.order = 'YXZ';
    this.pPiv = grp(this.spine, 0.05, 0.53, 0); this.pPiv.rotation.order = 'YXZ';
    this.tp = WEAPONS.map(w => { const t = tpGun(w.id, self.shadowOnly); if (w.kind === 'pistol') { t.g.position.set(0, 0, -0.44); this.pPiv.add(t.g); } else this.rPiv.add(t.g); return t; });
    this.medkit = buildTPMedkit(M); this.medkit.g.position.set(0, -0.12, -0.32); this.pPiv.add(this.medkit.g);
    const hmt = this.shadowOnly ? shadowMat : gunVcMat;
    this.handMagR = new THREE.Mesh(tpGunGeo('m4').mag, this.shadowOnly ? shadowMat : gunMatOf('m4')); this.handMagR.position.set(0, 0.02, 0); this.hdL.add(this.handMagR);
    this.handMagP = new THREE.Mesh(tpGunGeo('g17').mag, hmt); this.hdL.add(this.handMagP);
    this.handMagR.visible = this.handMagP.visible = false;
    this.handMagR.userData.keep = this.handMagP.userData.keep = true;
    mergeTree(this.root, this.shadowOnly ? shadowMat : vcMat);
    this.hitMeshes = []; this.root.traverse(o => { if (o.isMesh && o.userData.frame) this.hitMeshes.push(o); });
    this._t = new V3(); this._p1 = new V3(); this._p2 = new V3();
  }
  activeGun() { return this.tp[this.anim.weapon] || this.medkit; }
  setLost(mask, cuts) {
    const key = mask + ':' + (cuts ? cuts.join(',') : '');
    if (key === this.lostKey) return;
    this.lostKey = key; this.lostMask = mask;
    const show = (g, v) => g.traverse(o => { if (o.isMesh && (!v || !(o.userData.organ || o.userData.inner))) o.visible = v; });
    this.handMagR.visible = this.handMagP.visible = false;
    this.stumps = this.stumps || {};
    const LIMBS = [['armL', 1, 2, this.shL, this.elL, 0.3, 0.3, 0.05, 0.04, [this.spine, this.shL.position, [-1, -0.5, 0]]], ['armR', 4, 8, this.shR, this.elR, 0.3, 0.3, 0.05, 0.04, [this.spine, this.shR.position, [1, -0.5, 0]]],
      ['legL', 16, 32, this.lgL, this.knL, 0.44, 0.44, 0.075, 0.055, [this.hips, this.lgL.position, [0, -1, 0]]], ['legR', 64, 128, this.lgR, this.knR, 0.44, 0.44, 0.075, 0.055, [this.hips, this.lgR.position, [0, -1, 0]]]];
    LIMBS.forEach(([nm, up, low, gU, gL, LU, LL, rU, rL, root], i) => {
      const t = cuts ? cuts[i] || 0 : 0;
      show(gU, true); clipGroup(gU, null); clipGroup(gL, null);
      if (this.stumps[nm]) { this.stumps[nm].removeFromParent(); this.stumps[nm] = null; }
      let st = null;
      if (mask & up) { show(gL, false); if (t) { clipGroup(gU, -t * LU); st = [gU, new V3(0, -t * LU, 0), new V3(0, -1, 0), rU * 0.85]; } else { show(gU, false); st = [root[0], root[1], new V3().fromArray(root[2]), rU]; } }
      else if (mask & low) { if (t) { clipGroup(gL, -t * LL); st = [gL, new V3(0, -t * LL, 0), new V3(0, -1, 0), rL * 0.9]; } else { show(gL, false); st = [gU, gL.position, new V3(0, -1, 0), rL]; } }
      if (st && !this.shadowOnly) this.stumps[nm] = addStump(st[0], st[1], st[2], st[3]);
    });
  }
  update(dt) {
    const a = this.anim, pr = a.prone, c = a.crouch * (1 - pr), s = a.sprint * (1 - pr), air = a.air;
    const med = a.weapon === MEDKIT_W, pistol = !med && isPistol(a.weapon), rifleish = !med && !pistol;
    this.wb = damp(this.wb, rifleish ? 0 : 1, 12, dt || 1);
    const bb = a.bb || 0, ah = a.ah || 0, ls = a.ls || 0;
    const rifleK = 1 - this.wb;
    const rate = lerp(2.4, 1.5, s) * (1 + c * 0.6) * (1 + pr * 1.5);
    a.phase += dt * a.speed * rate;
    const amp = Math.min(1, a.speed / 4) * (0.5 + 0.35 * s) * (1 - 0.4 * c) * (1 - pr * 0.6) * (1 - a.limp * 0.5);
    const sw = Math.sin(a.phase), cw = Math.cos(a.phase);
    // prone: whole body pitched forward around the pelvis
    this.pose.rotation.x = -Math.PI / 2 * pr;
    this.pose.position.set(0, 0.13 * pr, 0.95 * pr);
    const limpL = a.limp > 0 ? a.limp : 0;
    const thighBase = (1.15 * c + 0.35 * air) * (1 - pr), kneeBase = (-2.0 * c - 0.7 * air) * (1 - pr);
    const crawl = pr * sw * 0.35 * Math.min(1, a.speed);
    // fractured femur/tibia visibly bend the leg at the break
    this.lgL.rotation.set(thighBase + sw * amp + crawl + (bb & 16 ? 0.12 : 0), 0, -0.04 - 0.1 * c - 0.12 * pr - 0.25 * limpL * pr - (bb & 16 ? 0.12 : 0));
    this.lgR.rotation.set(thighBase - sw * amp - crawl + (bb & 64 ? 0.12 : 0), 0, 0.04 + 0.1 * c + 0.12 * pr + 0.25 * limpL * pr + (bb & 64 ? 0.12 : 0));
    this.knL.rotation.set(kneeBase - amp * 1.3 * Math.max(0, cw) - pr * (0.15 + Math.max(0, sw) * 0.5 * Math.min(1, a.speed)) - 0.4 * limpL * pr - (bb & 32 ? 0.35 : 0), 0, bb & 32 ? 0.3 : 0);
    this.knR.rotation.set(kneeBase - amp * 1.3 * Math.max(0, -cw) - pr * (0.15 + Math.max(0, -sw) * 0.5 * Math.min(1, a.speed)) - 0.25 * limpL * pr - (bb & 128 ? 0.35 : 0), 0, bb & 128 ? -0.3 : 0);
    this.hips.position.set(a.lean * 0.07 * (1 - pr), 0.95 - 0.38 * c - 0.04 * amp * Math.abs(cw), 0);
    this.hips.rotation.set(0, sw * amp * 0.15, 0);
    const stance = -0.45 * rifleK * (1 - s) * (1 - pr);
    const sx = (-0.12 * c - 0.25 * s + a.pitch * 0.25 * (1 - s)) * (1 - pr);
    this.spine.rotation.set(sx, stance - sw * amp * 0.08, -a.lean * 0.42 * (1 - pr));
    this.neck.rotation.set(clamp(a.pitch * (1 - s) - sx, -0.8, 0.8) * 0.75 * (1 - pr) - 0.12 * a.ads * rifleK + pr * (1.25 + a.pitch * 0.5), -stance, a.lean * 0.15 * (1 - pr));
    const P = a.pitch - sx + pr * Math.PI / 2;
    const r = a.reload;
    this.rPiv.position.copy(RPIV_WORLD).applyAxisAngle(_YAX, -stance);
    this.rPiv.position.lerp(this._t.set(0.06, 0.36, -0.12), s);
    let gx = lerp(P, -0.75, s), gy = -stance + lerp(0, 0.85, s), gz = 0;
    if (r > 0) { const b = Math.sin(r * Math.PI); gz = (pistol ? 0.3 : 0.6) * b; gx -= 0.35 * b; }
    if ((ah & 2) || (ls & 12)) gx -= 0.5;
    this.rPiv.rotation.set(gx, gy, gz);
    this.pPiv.rotation.set(lerp(P, -0.9, s) - (r > 0 ? 0.3 * Math.sin(r * Math.PI) : 0) - (med ? 0.35 : 0), lerp(0, 0.5, s), 0);
    this.pPiv.position.set(med ? 0 : 0.05, lerp(0.53, 0.38, s), lerp(0, -0.05, s));
    const G = this.activeGun();
    for (let i = 0; i < this.tp.length; i++) this.tp[i].g.visible = i === a.weapon; this.medkit.g.visible = med && !a.unarmed;
    const magOut = r > 0 && r > 0.18 && r < 0.64;
    G.mag.visible = !magOut;
    this.handMagR.visible = rifleish && !(ls & 3) && r > 0.3 && r < 0.64;
    this.handMagP.visible = pistol && !(ls & 3) && r > 0.3 && r < 0.64;
    this.root.updateMatrixWorld(true);
    const rq = this.spine.getWorldQuaternion(_q3);
    const poleR = this._p1.set(rifleish ? 0.75 : 0.5, -1, 0.25).applyQuaternion(rq);
    const poleL = this._p2.set(rifleish ? -0.55 : -0.5, -1, 0.1).applyQuaternion(rq);
    const tR = G.grip.getWorldPosition(new V3());
    let tL = G.fore.getWorldPosition(new V3());
    if (r > 0) {
      const well = G.well.getWorldPosition(new V3()), pouch = this.pouch.getWorldPosition(new V3());
      const keys = [[0, tL], [0.16, well], [0.26, well], [0.45, pouch], [0.62, well], [0.78, well], [0.92, tL], [1, tL]];
      for (let i = 0; i < keys.length - 1; i++) if (r <= keys[i + 1][0]) { tL = keys[i][1].clone().lerp(keys[i + 1][1], smooth((r - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))); break; }
    }
    // a broken or severed arm can't hold the gun: it hangs and swings
    const hang = (sh, el, side) => { sh.rotation.set(0.08 + sw * amp * 0.2, 0, side * (0.06 + 0.04 * Math.abs(sw))); el.rotation.set(0.15, 0, 0); };
    if ((ah & 2) || (ls & 12)) hang(this.shR, this.elR, 1); else solveArm(this.shR, this.elR, tR, poleR, 0.3, 0.3);
    if ((ah & 1) || (ls & 3)) hang(this.shL, this.elL, -1); else solveArm(this.shL, this.elL, tL, poleL, 0.3, 0.3);
    if (bb & 2) this.elL.rotation.z += 0.4; if (bb & 8) this.elR.rotation.z -= 0.4;
  }
  capture() {
    this.root.updateMatrixWorld(true);
    return [this.headMark, this.neck, this.hips, this.shL, this.elL, this.hdL, this.shR, this.elR, this.hdR,
      this.lgL, this.knL, this.ftL, this.lgR, this.knR, this.ftR, this.chestMark].map(o => o.getWorldPosition(new V3()));
  }
}

