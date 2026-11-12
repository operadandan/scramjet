// ---------------------------------------------------------------- state
function loadLoadout() {
  let lo = [0, 1];
  try { const j = JSON.parse(localStorage.getItem('breach_loadout') || 'null'); if (j && PRIMARIES.includes(j[0]) && SECONDARIES.includes(j[1])) lo = j; } catch (e) {}
  return lo;
}
const S = { mode: null, ws: null, myId: 0, room: '', remotes: new Map(), names: {}, locked: false };
const P = {
  pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, onGround: false, crouch: 0, lean: 0, leanEff: 0, leanState: 0, adsOn: false,
  stamina: 100, staminaLock: false, staminaDelay: 0, sprinting: false, sprintBlend: 0, speed: 0,
  alive: false, weapon: 0, loadout: loadLoadout(), guns: {}, downed: false,
  reloading: false, reloadT: 0, reloadDur: 1, reloadEmpty: false, reloadStage: 0,
  inspecting: false, inspectT: 0, inspectShown: false,
  lastShot: 0, semiReady: true, deviceOn: true, switchT: 0, ads: 0, kick: 0, recoilPitch: 0, bobT: 0, swayX: 0, swayY: 0, aimOX: 0, aimOY: 0,
  slideBack: 0, headDeath: false, rag: null, flashT: 0,
  slot: 0, stance: 0, prone: 0, anat: new Anatomy(), medUses: 3, platesInv: 2, tools: ['medkit', 'plate'], packGuns: [], loose: [], packPos: {}, supp: 0, activeLo: [0, 1], lookX: 0, lookY: 0, healing: false, healT: 0
};
const keys = {}, mouse = { left: false };
const localBody = new Humanoid({}, true); scene.add(localBody.root);
// what you see of yourself when you look down: chest rig, belt and legs. The viewmodel draws the arms, so the body's own arms,
// head, neck and slung weapons are hidden, and it sits a little behind the eye so the camera never ends up inside it.
const fpBody = new Humanoid({ noRig: true });
for (const k of ['head', 'neck', 'shL', 'shR']) if (fpBody[k]) fpBody[k].visible = false;
if (fpBody.rPiv) fpBody.rPiv.visible = false; if (fpBody.pPiv) fpBody.pPiv.visible = false;
fpBody.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.userData.fp = true; } }); fpBody.root.visible = false; scene.add(fpBody.root);
// the player's eyes sit about 20 cm above the shoulders and over the front of the chest: the humanoid's neck is short, so for
// the first-person body the torso is set lower into the hips (the camera goes where the eyes would be)
fpBody.spine.position.y -= 0.1;
// and everything above and behind a plane through the eyes is cut away (shoulders, straps, the upper back): the cut is seen
// edge-on from the eye, so it never shows; what stays is what you see looking down, the front of the rig, the belt and the legs
const fpClip = new THREE.Plane(); renderer.localClippingEnabled = true;
fpBody.root.traverse(o => { if (!o.isMesh || !o.material) return; const cl = m => { m = m.clone(); m.clippingPlanes = [fpClip]; return m; }; o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material); });
const PALS = [
  { shirt: 0x6b6650, pants: 0x5a5644, vest: 0x7a6e52, vest2: 0x6e6349, helmet: 0x6a6250 },
  { shirt: 0x3e4636, pants: 0x3a4032, vest: 0x4b5440, vest2: 0x434b39, helmet: 0x454c3c },
  { shirt: 0x2a2c30, pants: 0x26282b, vest: 0x303236, vest2: 0x2b2d30, helmet: 0x2c2e31 },
  { shirt: 0x58616b, pants: 0x4a5058, vest: 0x5c636b, vest2: 0x535a61, helmet: 0x50565e },
  { shirt: 0x7d6c55, pants: 0x6a5c48, vest: 0x8a7a5e, vest2: 0x7c6d53, helmet: 0x7a6c56 },
  { shirt: 0x4d4a3c, pants: 0x3f3d33, vest: 0x5c5643, vest2: 0x544f3e, helmet: 0x4f4b3d }];
const SKINS = [0xc19275, 0x8d5a3b, 0xe0b49a, 0x6b4430, 0xd2a07e];
const dummies = [];

// third-person suppressor, shown on remote players' guns when they run one
function addTPSupp(hum) {
  hum.root.updateMatrixWorld(true);
  hum.tp.forEach((t, i) => {
    if (!WEAPONS[i]) return;
    const inv = t.g.matrixWorld.clone().invert(), bb = new THREE.Box3();
    let minZ = Infinity, y = 0;
    t.g.traverse(o => { if (o.isMesh) { bb.setFromObject(o).applyMatrix4(inv); if (bb.min.z < minZ) { minZ = bb.min.z; y = (bb.min.y + bb.max.y) / 2; } } });
    const pis = isPistol(i), r = pis ? 0.014 : i === 2 ? 0.032 : 0.019, len = pis ? 0.15 : i === 2 ? 0.27 : 0.17;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat(0x1c1d1f)); m.rotation.x = Math.PI / 2; m.position.set(0, y, minZ - len / 2 + 0.02); m.visible = false; m.castShadow = true;
    t.g.add(m); t.sup = m;
  });
}
class Remote {
  constructor(id, name) {
    this.id = id; this.name = name;
    this.hum = new Humanoid(Object.assign({ skin: SKINS[id % SKINS.length] }, PALS[id % PALS.length]));
    this.hum.remote = this; scene.add(this.hum.root); addTPSupp(this.hum);
    this.label = makeLabel(name); this.hum.root.add(this.label);
    this.pos = new V3(); this.tpos = new V3(); this.yaw = 0; this.tyaw = 0;
    this.st = null; this.alive = false; this.snap = true;
  }
  setState(m) {
    this.st = m; this.tpos.fromArray(m.p); this.tyaw = m.y;
    if (this.snap) { this.pos.copy(this.tpos); this.yaw = this.tyaw; this.snap = false; }
  }
  update(dt) {
    const m0 = this.st;
    if (m0 && m0.dn && !this.rag && this.alive) {
      this.hum.root.visible = true;
      this.rag = spawnRagdoll(this.hum, new V3(), new V3(0, -0.3, 1).normalize(), 'torso', false, { bb: m0.bb, ls: m0.ls, lc: m0.lc, keep: true });
      this.rag.owner = { remote: this.id };
    }
    if (m0 && !m0.dn && this.rag && this.alive) { freeRag(this.rag); this.rag = null; }
    if (m0 && this.rag) this.rag.applyLost(m0.ls || 0, null, m0.lc);
    if (m0 && (m0.ar & 1) && !this.hum.helmetOff) setHelmet(this.hum, false, new V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).negate());
    const vis = !!this.st && this.alive && !this.rag; this.hum.root.visible = vis; if (!vis) return;
    this.pos.lerp(this.tpos, 1 - Math.exp(-14 * dt));
    this.yaw = angLerp(this.yaw, this.tyaw, 1 - Math.exp(-16 * dt));
    this.hum.root.position.copy(this.pos); this.hum.root.rotation.y = this.yaw;
    const a = this.hum.anim, m = this.st;
    a.speed = damp(a.speed, m.v, 10, dt); a.crouch = damp(a.crouch, m.c, 12, dt);
    a.lean = damp(a.lean, m.l, 12, dt); a.pitch = damp(a.pitch, m.pi, 14, dt);
    a.sprint = damp(a.sprint, m.sp ? 1 : 0, 8, dt); a.air = damp(a.air, m.g ? 0 : 1, 10, dt);
    a.ads = m.a; a.weapon = WEAPONS[m.w] || m.w === MEDKIT_W ? m.w : m.w === PLATE_W || m.w === 7 ? MEDKIT_W : 0; a.unarmed = m.w === 7; a.reload = m.r; a.prone = damp(a.prone, m.pr || 0, 5, dt); a.limp = m.lm || 0;
    for (let i = 0; i < this.hum.tp.length; i++) if (this.hum.tp[i].sup) this.hum.tp[i].sup.visible = i === a.weapon && !!m.su;
    a.bb = m.bb || 0; a.ah = m.ah || 0; a.ls = m.ls || 0; syncLost(this.hum, a.ls, new V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).negate(), m.lc);
    this.hum.update(dt);
    bleedDrips(this, m.bl || 0, dt);
  }
  dispose() { scene.remove(this.hum.root); }
}

// ---------------------------------------------------------------- dummies (testing mode)
class Dummy {
  constructor(x, z, anim, label) {
    this.hum = new Humanoid({ shirt: 0xb8662a, vest: 0x5a5a56, vest2: 0x4e4e4a, helmet: 0x4a4a46, skin: SKINS[Math.floor(Math.random() * SKINS.length)] });
    this.hum.dummy = this; scene.add(this.hum.root);
    this.hum.root.add(makeLabel(label, '#ffd166'));
    this.label = label;
    this.home = new V3(x, 0, z); this.anim = anim; this.anat = new Anatomy(); this.dead = false; this.respawnT = 0;
    this.t = Math.random() * 3; this.vel = new V3(); this.dripAcc = 0;
    this.hum.root.position.copy(this.home); this.hum.root.rotation.y = Math.PI;
  }
  update(dt) {
    if (this.dead) {
      // the heart has stopped: wounds keep draining by gravity for a while, slowing down, and the pool under the body keeps spreading
      this.deadT = (this.deadT || 0) + dt;
      this.respawnT -= dt; if (this.respawnT <= 0) { this.deadT = 0; this.dead = false; this.unarmed = false; this.credited = false; this.stag = undefined; this.react = undefined; this.reactDone = false; this.forceDown = false; this.anat = new Anatomy(); this.rag = null; clearWounds(this.hum); this.hum.setLost(0); this.hum.root.visible = true; setHelmet(this.hum, true); } return; }
    this.anat.update(dt);
    if (this.anat.dead) { this.die(); return; }
    const down = this.anat.isDowned() || this.anat.bothLegs() || this.forceDown || this.react !== undefined;
    if (down && !this.rag) {
      // hurt badly but not dropped outright: let go of the gun, react to the wound, then collapse
      const an = this.anat, canReact = !an.paralyzed && !an.bothLegs();
      if (canReact && this.react === undefined && !this.reactDone) this.startReaction('hit');
      if (canReact && this.react !== undefined) { this.reactStep(dt); return; }
      this.react = undefined; this.stag = undefined; this.forceDown = true; this.goLimp();
    }
    else if (this.rag && !down) { freeRag(this.rag); this.rag = null; this.hum.root.visible = true; this.stag = undefined; this.reactDone = false; }
    if (this.rag) { bleedDrips(this, this.anat.bleedRate(), dt, arteryRate(this.anat), clamp(this.anat.blood / 5000, 0.2, 1)); return; }
    this.t += dt; const t = this.t, a = this.hum.anim, root = this.hum.root;
    Object.assign(a, { speed: 0, crouch: 0, pitch: 0, reload: 0, sprint: 0, air: 0, weapon: 0, ads: 0, prone: 0, limp: 0 });
    root.position.copy(this.home); this.vel.set(0, 0, 0);
    const downed = false;
    switch (this.anim) {
      case 'walk': a.speed = 1.6; break;
      case 'run': a.speed = 4.3; break;
      case 'sprint': a.speed = 7.2; a.sprint = 1; break;
      case 'reload': a.reload = (t % 2.6) / 2.6 + 0.001; break;
      case 'reloadp': a.weapon = 1; a.reload = (t % 1.9) / 1.9 + 0.001; break;
      case 'ak': a.weapon = 3; a.pitch = Math.sin(t * 0.7) * 0.3; break;
      case 'barrett': a.weapon = 2; a.pitch = Math.sin(t * 0.5) * 0.2; a.ads = 1; break;
      case 'm9': a.weapon = 4; break;
      case 'crouch': a.crouch = 1; break;
      case 'crouchwalk': a.crouch = 1; a.speed = 2; break;
      case 'lean': a.lean = clamp(Math.sin(t * 1.4) * 2, -1, 1); break;
      case 'aim': a.pitch = Math.sin(t * 1.2) * 0.9; a.ads = 1; break;
      case 'pistol': a.weapon = 1; a.pitch = Math.sin(t * 0.8) * 0.4; break;
      case 'prone': a.prone = 1; break;
      case 'crawl': a.prone = 1; a.speed = 0.8; break;
      case 'medkit': a.weapon = MEDKIT_W; break;
      case 'jump': { const ph = t % 1.4; if (ph < 0.7) { const u = ph / 0.7; root.position.y = 4 * 1.1 * u * (1 - u); a.air = 1; } break; }
      case 'patrol': {
        const ang = t * 0.5;
        root.position.set(this.home.x + Math.cos(ang) * 4, 0, this.home.z + Math.sin(ang) * 4);
        root.rotation.y = Math.PI - ang; a.speed = 2; this.vel.set(-Math.sin(ang) * 2, 0, Math.cos(ang) * 2);
        break;
      }
    }
    a.unarmed = !!this.unarmed; if (this.unarmed) { a.weapon = MEDKIT_W; a.reload = 0; a.ads = 0; }
    a.bb = this.anat.brokenMask(); a.ah = this.anat.armHangMask(); a.ls = this.anat.lostMask();
    if (downed) { a.prone = 1; a.limp = 1; }
    else if (this.anat.legBroken('L') || this.anat.legBroken('R')) { a.limp = 1; a.speed *= 0.5; }
    if (this.anim !== 'patrol' || downed) root.rotation.y = Math.PI;
    if (this.anim !== 'lean') a.lean = 0;
    this.hum.update(dt);
    bleedDrips(this, this.anat.bleedRate(), dt, arteryRate(this.anat), clamp(this.anat.blood / 5000, 0.2, 1));
  }
  shot(info, v, w, wdir, dist) {
    if (this.dead) return { killed: false };
    this.anat.lastDir.copy(wdir); this.anat.lastDist = dist;
    const res = this.anat.hit(info.frame, info.e, info.d, v, w, info.armor, info.pd);
    if (res.blast && res.blast.big && !this.rag && !this.anat.dead) this.blastFall(wdir);
    else if (this.react !== undefined && this.stagT > 0.15 && !this.rag && this.react.kind !== 'neck') { this.react = undefined; this.stag = undefined; this.reactDone = true; this.forceDown = true; this.goLimp(); }
    else if (res.region === 'neck' && !res.stopped && !this.rag && !this.anat.dead && !this.anat.paralyzed && (this.react === undefined || this.react.kind !== 'neck')) { this.forceDown = true; this.startReaction('neck'); }
    if (!this.credited && (this.anat.dead || this.anat.paralyzed || this.anat.bothLegs())) { this.credited = true; S.testKills = (S.testKills || 0) + 1; killNotice('AI'); }
    if (res.helmetOff) { setHelmet(this.hum, false, wdir); if (this.rag) this.rag.group.traverse(o => { if (o.userData.armor === 'helmet') o.visible = false; }); }
    if ((res.region === 'handL' || res.region === 'handR') && !res.missing && !this.unarmed && WEAPONS[this.hum.anim.weapon]) {
      this.unarmed = true; const wi = this.hum.anim.weapon;
      spawnItem({ kind: 'gun', w: wi, mag: Math.floor(rnd(3, WEAPONS[wi].cap)), chamber: 1, att: Object.assign({}, ATT_DEFAULT[WEAPONS[wi].id]) }, this.hum.activeGun().g.getWorldPosition(new V3()), new V3(rnd(-0.6, 0.6), 1, rnd(-0.6, 0.6)), true, 60);
    }
    if (!this.unarmed && this.anat.handBroken('L') && this.anat.handBroken('R')) this.dropGun(new V3(rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4)));
    if (this.rag) { this.rag.applyLost(this.anat.lostMask(), wdir, this.anat.cutArr()); this.hum.setLost(this.anat.lostMask(), this.anat.cutArr()); } else syncLost(this.hum, this.anat.lostMask(), wdir, this.anat.cutArr());
    S.target = this;
    if (this.anat.dead) { this.die(); return { killed: true, head: this.anat.cause === 'brain' }; }
    return { killed: false };
  }
  // ---------------------------------------------------------------- reactions to being shot
  // Picked by stance and wound: standing, crouched and prone bodies each go down their own way, a neck wound brings both hands
  // to the throat, and a shotgun blast knocks the body straight over. Every reaction is put together fresh from random choices
  // (which variant, timing, step length, sway, twist, which way it topples), so no two look the same.
  stanceKind() { return /^(prone|crawl)$/.test(this.anim) ? 'prone' : /^crouch/.test(this.anim) ? 'crouch' : 'stand'; }
  moveVel() {
    if (this.anim === 'patrol') return this.vel.clone();
    const sp = { walk: 1.6, run: 4.3, sprint: 7.2, crouchwalk: 2, crawl: 0.8 }[this.anim] || 0;
    return new V3(0, 0, -1).applyQuaternion(this.hum.root.quaternion).multiplyScalar(sp);
  }
  startReaction(kind) {
    const an = this.anat, d = an.lastDir.clone().setY(0); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
    const R = { kind, stance: this.stanceKind(), t: 0, seed: Math.random() * 100, dir: d, off: new V3(), v: Math.floor(Math.random() * 3),
      T1: rnd(1.6, 3.6), T2d: rnd(1.0, 1.4), sway: rnd(0.08, 0.3), swayF: rnd(1.1, 2.5), twist: rnd(-0.7, 0.7), lean: rnd(-0.45, 0.45), step: rnd(0.3, 0.75), side: Math.random() < 0.5 ? -1 : 1, slump: rnd(0.4, 0.75), knee: Math.random() < 0.5 };
    // sometimes the stumble goes back toward the shooter instead of with the hit, or off to the side
    const r = Math.random(); if (r < 0.2) R.dir.negate(); else if (r < 0.4) R.dir.set(-d.z * R.side, 0, d.x * R.side);
    if (kind === 'neck') { R.T1 = rnd(1.8, 3.4); R.step = rnd(0.15, 0.4); }
    this.react = R; this.stag = 1; this.stagT = 0;
    this.dropGun(d.clone().multiplyScalar(0.8).add(new V3(rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4))));
    // which wound to clutch, and with which hand: the free arm on the same side, the other one for a wound on an arm
    const w = this.hum.wounds && this.hum.wounds.length ? this.hum.wounds[this.hum.wounds.length - 1] : null;
    R.wound = w; let side = 'R';
    if (w) { if (/^(sh|el)L$/.test(w.frame)) side = 'R'; else if (/^(sh|el)R$/.test(w.frame)) side = 'L'; else { const lp = this.hum.spine.worldToLocal(w.m.getWorldPosition(new V3())); side = lp.x < 0 ? 'L' : 'R'; } }
    if (an.armBroken(side) || an.lost['arm' + side]) side = side === 'L' ? 'R' : 'L';
    R.hand = an.armBroken(side) || an.lost['arm' + side] ? null : side;
  }
  // knocked straight over by a shotgun blast: back along the shot, or forward the way it was going if it was on the move
  blastFall(dir) {
    if (this.rag || this.dead) return;
    this.forceDown = true; this.react = undefined; this.stag = undefined; this.reactDone = true;
    const an = this.anat, d = dir.clone().setY(0).normalize(), mv = this.moveVel(), moving = mv.length() > 1;
    this.dropGun(d.clone().multiplyScalar(1.2).add(new V3(rnd(-0.4, 0.4), 0.7, rnd(-0.4, 0.4))));
    const vTop = moving ? mv.clone().multiplyScalar(rnd(1.05, 1.35)).addScaledVector(d, rnd(0.4, 0.9)) : d.clone().multiplyScalar(rnd(1.8, 2.8)).add(new V3(rnd(-0.3, 0.3), rnd(0.1, 0.4), rnd(-0.3, 0.3)));
    const vLeg = moving ? mv.clone().multiplyScalar(rnd(0.2, 0.45)) : d.clone().multiplyScalar(rnd(-0.2, 0.3));
    this.rag = spawnRagdoll(this.hum, new V3(), d, PART_OF_REGION(an.lastRegion), false, { bb: an.brokenMask(), ls: an.lostMask(), lc: an.cutArr(), keep: true, soft: true, vTop, vLeg });
    this.rag.owner = { dummy: this }; this.hum.root.visible = false;
  }
  reactStep(dt) {
    const R = this.react; R.t += dt; this.stagT = R.t;
    const hum = this.hum, a = hum.anim, root = hum.root, an = this.anat, t = R.t, ph = t + R.seed;
    const T1 = R.T1, T2 = T1 + R.T2d, T3 = T2 + 0.9;
    const k = smooth(clamp(t / 0.45, 0, 1));
    const base = { speed: 0, crouch: 0, pitch: 0, reload: 0, sprint: 0, air: 0, weapon: MEDKIT_W, ads: 0, prone: 0, limp: 0, lean: 0, unarmed: true };
    const ST = R.stance, neck = R.kind === 'neck';
    const finish = () => { this.react = undefined; this.stag = undefined; this.reactDone = true; this.goLimp(true); };
    let kn = 0, sl = 0;
    if (ST === 'prone') {
      // ---- on the ground: roll onto a side and curl up, writhe, or push up and fall flat again
      const Tp = T1 + 1.2; if (t >= Tp) return finish();
      const e = smooth(clamp(t / 0.8, 0, 1)), fade = 1 - smooth(clamp((t - T1) / 1.2, 0, 1));
      Object.assign(a, base, { prone: 1, speed: R.v === 1 ? 0.6 * fade : 0 }); root.position.copy(this.home);
      a.bb = an.brokenMask(); a.ah = an.armHangMask(); a.ls = an.lostMask(); hum.update(dt);
      if (R.v === 0) { hum.pose.rotation.y = R.side * 1.25 * e; hum.pose.position.y += 0.12 * e; for (const s of ['L', 'R']) { hum['lg' + s].rotation.x += 0.9 * e; hum['kn' + s].rotation.x -= 1.3 * e; } hum.spine.rotation.x -= 0.4 * e; hum.neck.rotation.x -= 0.35 * e; }
      else if (R.v === 1) { const w = Math.sin(ph * 4.2) * fade; hum.spine.rotation.x += 0.25 * e * fade + 0.1 * w; hum.neck.rotation.x += 0.4 * e * fade * (0.5 + 0.5 * Math.sin(ph * 2.7)); hum.pose.rotation.y = 0.35 * Math.sin(ph * 1.6) * fade; hum.lgL.rotation.x += 0.4 * Math.max(0, w); hum.lgR.rotation.x += 0.4 * Math.max(0, -w); }
      else { const up = smooth(clamp(t / 0.7, 0, 1)) * (1 - smooth(clamp((t - T1 * 0.6) / 0.5, 0, 1))); hum.pose.rotation.x += 0.4 * up; hum.spine.rotation.x -= 0.2 * up; }
      if (R.hand || neck) this.clutch(R, neck, e * fade + (1 - fade) * 0.4);
      bleedDrips(this, an.bleedRate(), dt, arteryRate(an), clamp(an.blood / 5000, 0.2, 1));
      return;
    }
    if (ST === 'crouch' && !neck) {
      // ---- crouched: sit back onto the floor, fall forward onto the hands, or topple over sideways
      const Tc = T1 + 0.9; if (t >= Tc) return finish();
      const e = smooth(clamp(t / (T1 * 0.7), 0, 1));
      Object.assign(a, base, { crouch: 1 }); root.position.copy(this.home); root.rotation.y = Math.PI + R.twist * 0.4 * e;
      a.bb = an.brokenMask(); a.ah = an.armHangMask(); a.ls = an.lostMask(); hum.update(dt);
      if (R.v === 0) { hum.hips.position.y = lerp(hum.hips.position.y, 0.2, e); for (const s of ['L', 'R']) { hum['lg' + s].rotation.x = lerp(hum['lg' + s].rotation.x, 1.45, e); hum['kn' + s].rotation.x = lerp(hum['kn' + s].rotation.x, -0.5 - (s === 'L' ? 0.3 : 0), e); } hum.spine.rotation.x += 0.35 * e; hum.neck.rotation.x -= 0.3 * e; }
      else if (R.v === 1) { hum.spine.rotation.x -= 0.9 * e; hum.neck.rotation.x += 0.4 * e; hum.hips.position.y = lerp(hum.hips.position.y, 0.42, e); root.updateMatrixWorld(true); const fw = new V3(0, 0, -1).applyQuaternion(root.quaternion), rt = new V3(1, 0, 0).applyQuaternion(root.quaternion), pole = new V3(0, -1, 0); for (const s of ['L', 'R']) { if (R.hand === s && e < 0.5) continue; solveArm(hum['sh' + s], hum['el' + s], root.position.clone().addScaledVector(fw, 0.42).addScaledVector(rt, (s === 'L' ? -1 : 1) * 0.2).setY(0.08), pole, 0.3, 0.3); } }
      else { hum.spine.rotation.z += R.side * 0.7 * e; hum.hips.position.x += R.side * 0.1 * e; hum.pose.rotation.z = R.side * 0.25 * e; }
      if (R.hand && R.v !== 1) this.clutch(R, false, e);
      bleedDrips(this, an.bleedRate(), dt, arteryRate(an), clamp(an.blood / 5000, 0.2, 1));
      return;
    }
    // ---- standing (and the neck grab from standing or crouched)
    if (R.v === 1 && !neck && t >= T1 * 0.75) return finish();      // the legs just go, mid-stumble, and momentum takes it
    if (t >= T3) return finish();
    kn = smooth(clamp((t - T1) / (T2 - T1), 0, 1)); sl = smooth(clamp((t - T2) / (T3 - T2), 0, 1));
    const back = R.v === 2 && !neck, sp = (R.step * Math.exp(-t * 0.8) + 0.1) * (1 - kn);
    R.off.addScaledVector(R.dir, sp * dt * (back ? -0.7 : 1)).add(new V3(-R.dir.z, 0, R.dir.x).multiplyScalar(Math.sin(ph * R.swayF) * R.sway * dt * (1 - kn)));
    const np = this.home.clone().add(R.off); if (!blocked(np, 1.7, 0.3)) root.position.copy(np);
    Object.assign(a, base, { speed: sp * 2.2, crouch: (ST === 'crouch' ? 0.8 : 0.2 + 0.12 * Math.sin(ph * 1.5) * k) * (1 - kn), pitch: (neck ? -0.2 : -0.45) * k, limp: 1 - kn, lean: (Math.sin(ph * 1.6) * 0.3 + R.lean) * (1 - kn) });
    a.bb = an.brokenMask(); a.ah = an.armHangMask(); a.ls = an.lostMask();
    root.rotation.y = Math.PI + (Math.sin(ph * 1.1) * 0.25 + R.twist * k) * (1 - kn);
    hum.update(dt);
    if (kn > 0) {
      const lerpR = (g, x, z) => { g.rotation.x = lerp(g.rotation.x, x, kn); g.rotation.z = lerp(g.rotation.z, z, kn); };
      if (back) {
        // sits down hard and rocks back
        lerpR(hum.lgL, 1.5, -0.12); lerpR(hum.lgR, 1.4, 0.12); lerpR(hum.knL, -0.6, 0); lerpR(hum.knR, -0.9, 0);
        hum.hips.position.y = lerp(hum.hips.position.y, 0.16, kn); hum.spine.rotation.x += 0.45 * sl;
      } else {
        // knees on the floor with the shins flat behind; as it folds the hips sink back toward the heels
        const first = R.knee ? 1 : 0, thL = 0.1 + R.slump * sl, thR = 0.06 + R.slump * sl;
        lerpR(hum.lgL, thL, -0.1); lerpR(hum.lgR, thR, 0.1);
        hum.knL.rotation.x = lerp(hum.knL.rotation.x, -Math.PI / 2 - thL, clamp(kn * (first ? 1.4 : 0.8), 0, 1)); hum.knR.rotation.x = lerp(hum.knR.rotation.x, -Math.PI / 2 - thR, clamp(kn * (first ? 0.8 : 1.4), 0, 1));
        hum.hips.position.y = lerp(hum.hips.position.y, 0.08 + 0.44 * Math.cos((thL + thR) / 2), kn);
      }
    }
    if (!back) hum.spine.rotation.x += -0.28 * k - 0.25 * kn - R.slump * sl;
    hum.spine.rotation.z += R.lean * 0.3 * kn;
    hum.neck.rotation.x = lerp(hum.neck.rotation.x, neck ? -0.2 + 0.25 * Math.sin(ph * 3) : -0.55, k);
    if (R.hand || neck) this.clutch(R, neck, k * (1 - sl * 0.7));
    bleedDrips(this, an.bleedRate(), dt, arteryRate(an), clamp(an.blood / 5000, 0.2, 1));
  }
  // hands to the wound: one hand pressed on it, or both hands at the throat for a neck wound
  clutch(R, neck, hold) {
    const hum = this.hum, root = hum.root; root.updateMatrixWorld(true);
    const fw = new V3(0, 0, -1).applyQuaternion(root.quaternion), rt = new V3(1, 0, 0).applyQuaternion(root.quaternion), ph = R.t + R.seed;
    const jitter = new V3(Math.sin(ph * 5) * 0.008, Math.sin(ph * 4) * 0.008, Math.sin(ph * 6) * 0.006);
    const reach = (s, T) => {
      const sh = hum['sh' + s], el = hum['el' + s], q0 = sh.quaternion.clone(), q1 = el.quaternion.clone();
      const pole = rt.clone().multiplyScalar(s === 'L' ? -0.8 : 0.8).add(new V3(0, -0.6, 0)).addScaledVector(fw, -0.2);
      solveArm(sh, el, T, pole, 0.3, 0.3);
      sh.quaternion.copy(q0.slerp(sh.quaternion, hold)); el.quaternion.copy(q1.slerp(el.quaternion, hold)); sh.updateMatrixWorld(true);
    };
    if (neck) {
      const T = hum.neck.getWorldPosition(new V3()).addScaledVector(fw, 0.06).add(new V3(0, 0.04, 0)).add(jitter);
      for (const s of ['L', 'R']) if (!this.anat.lost['arm' + s] && !this.anat.armBroken(s)) reach(s, T.clone().addScaledVector(rt, (s === 'L' ? -1 : 1) * 0.035));
      return;
    }
    const w = R.wound; if (!w || !w.m.parent || !R.hand) return;
    const T = w.m.getWorldPosition(new V3()).addScaledVector(w.n.clone().transformDirection(w.m.parent.matrixWorld), 0.05).add(jitter);
    reach(R.hand, T);
  }
  dropGun(v) {
    const wi = this.hum.anim.weapon; if (this.unarmed || !WEAPONS[wi]) return;
    this.unarmed = true;
    spawnItem({ kind: 'gun', w: wi, mag: Math.floor(rnd(3, WEAPONS[wi].cap)), chamber: 1, att: Object.assign({}, ATT_DEFAULT[WEAPONS[wi].id]) }, this.hum.activeGun().g.getWorldPosition(new V3()), v || new V3(rnd(-0.5, 0.5), 0.5, rnd(-0.5, 0.5)), true, 60);
  }
  goLimp(soft) {
    const an = this.anat;
    this.rag = spawnRagdoll(this.hum, soft ? new V3() : this.vel, an.lastDir, PART_OF_REGION(an.lastRegion), false, { bb: an.brokenMask(), ls: an.lostMask(), lc: an.cutArr(), keep: true, soft: !!soft });
    this.rag.owner = { dummy: this };
    this.hum.root.visible = false;
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.respawnT = 6;
    const an = this.anat;
    // the body bleeds on: the wounds as they were at death, at least a little from every open one
    // the scalp and face bleed heavily, so a head or neck wound adds a lot
    const headW = an.wounds.some(w => w.region === 'head' || w.region === 'neck');
    const pm = Math.min(160, Math.max(an.bleedRate() * 0.8, 12 + 7 * an.wounds.length) + (headW ? 28 : 0));
    // a sudden death to the brain or spine sets the limbs jerking for a few seconds
    const tw = /brain|spinal/.test(an.cause) || an.gibHead ? rnd(2, 5) : Math.random() < 0.3 ? rnd(1, 2.5) : 0;
    if (this.rag) { this.rag.keep = false; this.rag.owner = { anat: an }; this.rag.bleedR = Math.max(this.rag.bleedR, pm); this.rag.twitch = tw; this.rag.asleep = false; }
    else {
      // killed on its feet: by a blast it goes over backwards (or along its stride), otherwise it drops where it stands
      const mv = this.moveVel(), d = an.lastDir.clone().setY(0).normalize(), blast = an.lastW !== undefined && isShotgun(an.lastW);
      const vTop = blast ? (mv.length() > 1 ? mv.clone().multiplyScalar(1.2).addScaledVector(d, 0.6) : d.clone().multiplyScalar(rnd(1.6, 2.4))) : null;
      this.rag = spawnRagdoll(this.hum, mv.length() > 1 ? mv.multiplyScalar(0.6) : this.vel, an.lastDir, PART_OF_REGION(an.lastRegion), an.cause === 'brain', { bb: an.brokenMask(), ls: an.lostMask(), lc: an.cutArr(), gib: an.gibHead || (an.cause === 'brain' && an.lastW === 2), tear: an.neckTear || (an.lastRegion === 'neck' && an.lastW === 2), vTop, bleed: pm, twitch: tw });
      this.rag.owner = { anat: an };
    }
    this.hum.root.visible = false;
  }
  dispose() { scene.remove(this.hum.root); }
}
function spawnDummies() {
  const defs = [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run'], ['sprint', 'Sprint'], ['reload', 'Reload M4'], ['reloadp', 'Reload G17'],
    ['crouch', 'Crouch'], ['crouchwalk', 'Crouch walk'], ['lean', 'Lean L/R'], ['aim', 'Aim pitch'], ['pistol', 'Pistol'], ['jump', 'Jump'],
    ['prone', 'Prone'], ['crawl', 'Crawl'], ['medkit', 'Medkit'], ['ak', 'AK-74M'], ['barrett', 'M107'], ['m9', 'M9']];
  defs.forEach((d, i) => dummies.push(new Dummy(-27.2 + i * 3.2, -10, d[0], d[1])));
  dummies.push(new Dummy(0, -20, 'patrol', 'Patrol'));
  for (const d of RANGE_DISTS) dummies.push(new Dummy(RANGE_X, 8 - d, 'idle', d + ' m'));
}
// blood dripping from anyone who is bleeding
const _dp = new V3();
// where blood comes from: the newest wound on the standing body, or on the ragdoll if the body is down
const _dn = new V3();
function woundSource(owner) {
  const rag = owner.rag;
  if (rag && rag.anchors && rag.anchors.length) { const a = rag.anchors[rag.anchors.length - 1]; a.m.getWorldPosition(_dp); _dn.copy(a.n).transformDirection(a.m.parent.matrixWorld); return true; }
  const hum = owner.hum; if (!hum || !hum.root.visible) return false;
  const w = hum.wounds && hum.wounds.length ? hum.wounds[hum.wounds.length - 1] : null;
  if (w && w.m.parent) { w.m.getWorldPosition(_dp); _dn.copy(w.n).transformDirection(w.m.parent.matrixWorld); return true; }
  hum.spine.getWorldPosition(_dp); _dp.y += rnd(-0.2, 0.25); _dn.set(rnd(-1, 1), 0, rnd(-1, 1)).normalize(); return true;
}
function bleedDrips(owner, rate, dt, artery, pressure) {
  const hum = owner.hum; if (!hum) return;
  if (hum.root.visible) updateWounds(hum, dt);
  if (rate <= 0 || !woundSource(owner)) return;
  owner.dripAcc = (owner.dripAcc || 0) + dt * Math.min(8, 0.4 + rate * 0.12);
  while (owner.dripAcc > 1) { owner.dripAcc -= 1; spawnDrop(_dp, _dn.clone().multiplyScalar(0.12).add(new V3(rnd(-0.05, 0.05), -0.1, rnd(-0.05, 0.05))), rnd(0.005, 0.009)); }
  // the rest soaks down the clothes and collects on the floor: under the wound when lying, at the feet when standing
  const fy = floorAt(_dp.x, _dp.y, _dp.z), lying = _dp.y - fy < 0.5;
  if (lying) feedPool(_dp.x + _dn.x * 0.06, fy, _dp.z + _dn.z * 0.06, rate * dt * 0.8);
  else if (hum.root.visible) feedPool(hum.root.position.x + rnd(-0.08, 0.08), floorAt(hum.root.position.x, hum.root.position.y + 0.3, hum.root.position.z), hum.root.position.z + rnd(-0.08, 0.08), rate * dt * 0.35);
  // a cut artery pumps a jet out of the wound with every heartbeat, weaker as the blood runs out
  if (artery === undefined) artery = rate > 14 ? rate : 0;
  if (artery > 4) {
    owner.beat = ((owner.beat || 0) + dt) % 0.8;
    if (owner.beat < 0.24) {
      const k = (pressure === undefined ? 1 : pressure) * Math.sin(owner.beat / 0.24 * Math.PI), sp = (1.3 + Math.min(1.4, artery * 0.012)) * Math.max(0.35, k);
      owner.jetAcc = (owner.jetAcc || 0) + dt * 200 * Math.max(0.3, k);
      const d = _dn.clone(); d.y = Math.min(d.y, 0.15); if (d.lengthSq() < 0.01) d.set(rnd(-1, 1), 0, rnd(-1, 1)); d.normalize();
      const ml = Math.max(0.3, artery * 0.8 / 200 / 0.24 * 0.8);
      while (owner.jetAcc > 1) { owner.jetAcc -= 1; spawnDrop(_dp.clone().addScaledVector(d, 0.015), d.clone().multiplyScalar(sp * rnd(0.9, 1.08)).add(new V3(rnd(-0.05, 0.05), rnd(-0.04, 0.04), rnd(-0.05, 0.05))), rnd(0.004, 0.007), 0.8, 0.2, ml); }
    }
  }
}
const arteryRate = an => { let r = 0; for (const w of an.wounds) if (w.artery && !w.treated) r += w.rate; return r; };

