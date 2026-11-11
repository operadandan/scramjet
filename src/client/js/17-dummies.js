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
      if (this.rag && this.anat) bleedDrips(this, this.anat.bleedRate() * 0.6 * Math.max(0, 1 - this.deadT / 25), dt, 0);
      this.respawnT -= dt; if (this.respawnT <= 0) { this.deadT = 0; this.dead = false; this.unarmed = false; this.credited = false; this.stag = undefined; this.stagDone = false; this.anat = new Anatomy(); this.rag = null; clearWounds(this.hum); this.hum.setLost(0); this.hum.root.visible = true; setHelmet(this.hum, true); } return; }
    this.anat.update(dt);
    if (this.anat.dead) { this.die(); return; }
    const down = this.anat.isDowned() || this.anat.bothLegs();
    if (down && !this.rag) {
      // hurt badly but not dropped outright: let go of the gun, stagger, feel for the wound, then collapse
      const an = this.anat, canStagger = !an.paralyzed && !an.bothLegs();
      if (canStagger && this.stag === undefined && !this.stagDone) this.startStagger();
      if (canStagger && this.stag !== undefined) { this.stagger(dt); return; }
      this.stag = undefined; this.goLimp();
    }
    else if (this.rag && !down) { freeRag(this.rag); this.rag = null; this.hum.root.visible = true; this.stag = undefined; this.stagDone = false; }
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
    if (this.stag !== undefined && this.stagT > 0.15 && !this.rag) { this.stag = undefined; this.stagDone = true; this.goLimp(); }
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
  startStagger() {
    const an = this.anat, d = an.lastDir.clone().setY(0); if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
    this.stag = rnd(2.2, 3.8); this.stagT = 0; this.stagDir = d.normalize(); this.stagOff = new V3(); this.stagSeed = Math.random() * 10;
    this.dropGun(this.stagDir.clone().multiplyScalar(0.8).add(new V3(rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4))));
    // which wound to clutch, and with which hand: the free arm on the same side, the other one for a wound on an arm
    const w = this.hum.wounds && this.hum.wounds.length ? this.hum.wounds[this.hum.wounds.length - 1] : null;
    this.stagWound = w; let side = 'R';
    if (w) { if (/^(sh|el)L$/.test(w.frame)) side = 'R'; else if (/^(sh|el)R$/.test(w.frame)) side = 'L'; else { const lp = this.hum.spine.worldToLocal(w.m.getWorldPosition(new V3())); side = lp.x < 0 ? 'L' : 'R'; } }
    if (an.armBroken(side) || an.lost['arm' + side]) side = side === 'L' ? 'R' : 'L';
    this.stagSide = an.armBroken(side) || an.lost['arm' + side] ? null : side;
  }
  // three phases: stagger (stumbling, hunched, hand on the wound), kneel (legs give way, down onto the knees), slump (folds
  // forward), then the ragdoll takes over from that pose with no push, so the body settles instead of being thrown
  stagger(dt) {
    this.stagT += dt; const t = this.stagT, T1 = this.stag, T2 = T1 + 1.3, T3 = T2 + 0.9, hum = this.hum, a = hum.anim, root = hum.root;
    if (t >= T3) { this.stag = undefined; this.goLimp(true); return; }
    const k = smooth(clamp(t / 0.5, 0, 1)), ph = t + this.stagSeed;
    const kn = smooth(clamp((t - T1) / (T2 - T1), 0, 1)), sl = smooth(clamp((t - T2) / (T3 - T2), 0, 1));
    // lurching steps along the hit, slowing, swaying side to side; none once the legs go
    const sp = (0.55 * Math.exp(-t * 0.8) + 0.12) * (1 - kn);
    this.stagOff.addScaledVector(this.stagDir, sp * dt).add(new V3(-this.stagDir.z, 0, this.stagDir.x).multiplyScalar(Math.sin(ph * 1.9) * 0.18 * dt * (1 - kn)));
    const np = this.home.clone().add(this.stagOff); if (!blocked(np, 1.7, 0.3)) root.position.copy(np);
    Object.assign(a, { speed: sp * 2.2, crouch: (0.2 + 0.12 * Math.sin(ph * 1.5) * k) * (1 - kn), pitch: -0.45 * k, reload: 0, sprint: 0, air: 0, weapon: MEDKIT_W, ads: 0, prone: 0, limp: 1 - kn, lean: Math.sin(ph * 1.6) * 0.35 * (1 - kn), unarmed: true });
    a.bb = this.anat.brokenMask(); a.ah = this.anat.armHangMask(); a.ls = this.anat.lostMask();
    root.rotation.y = Math.PI + Math.sin(ph * 1.1) * 0.25 * (1 - kn);
    hum.update(dt);
    // everything below is set on top of the animated pose every frame (the animation rewrites these each update)
    if (kn > 0) {
      const lerpR = (g, x, z) => { g.rotation.x = lerp(g.rotation.x, x, kn); g.rotation.z = lerp(g.rotation.z, z, kn); };
      // knees on the floor with the shins lying flat behind (shin angle = thigh + knee = -90 deg); as the body folds the hips
      // sink back toward the heels, so the thighs tip forward and the knees bend further, shins still flat
      const thL = 0.1 + 0.55 * sl, thR = 0.06 + 0.55 * sl;
      lerpR(hum.lgL, thL, -0.1); lerpR(hum.lgR, thR, 0.1);
      lerpR(hum.knL, -Math.PI / 2 - thL, 0); lerpR(hum.knR, -Math.PI / 2 - thR, 0);
      hum.hips.position.y = lerp(hum.hips.position.y, 0.08 + 0.44 * Math.cos((thL + thR) / 2), kn);
    }
    hum.spine.rotation.x += -0.28 * k - 0.25 * kn - 0.55 * sl;
    hum.neck.rotation.x = lerp(hum.neck.rotation.x, -0.55, k);
    const w = this.stagWound, sd = this.stagSide;
    if (w && sd && w.m.parent) {
      root.updateMatrixWorld(true);
      const sh = hum['sh' + sd], el = hum['el' + sd], S = sh.getWorldPosition(new V3()), T = w.m.getWorldPosition(new V3());
      T.addScaledVector(w.n.clone().transformDirection(w.m.parent.matrixWorld), 0.05).add(new V3(Math.sin(ph * 5) * 0.008, Math.sin(ph * 4) * 0.008, 0));
      const L1 = 0.3, L2 = 0.33, dv = T.clone().sub(S); let dd = dv.length(); dv.normalize(); dd = clamp(dd, 0.12, L1 + L2 - 0.01);
      const sx = sd === 'L' ? -1 : 1, rgt = new V3(1, 0, 0).applyQuaternion(root.quaternion), fwd = new V3(0, 0, -1).applyQuaternion(root.quaternion);
      const hint = rgt.multiplyScalar(sx * 0.8).add(new V3(0, -0.6, 0)).addScaledVector(fwd, -0.2); hint.addScaledVector(dv, -hint.dot(dv)).normalize();
      const ae = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), he = Math.sqrt(Math.max(0, L1 * L1 - ae * ae));
      const E = S.clone().addScaledVector(dv, ae).addScaledVector(hint, he), Tc = S.clone().addScaledVector(dv, dd);
      const hold = k * (1 - sl * 0.7);
      const aim = (g, from, to) => { const pq = g.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); const dl = to.clone().sub(from).normalize().applyQuaternion(pq); const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), dl); g.quaternion.slerp(q, hold); g.updateMatrixWorld(true); };
      aim(sh, S, E); aim(el, el.getWorldPosition(new V3()), Tc);
    }
    bleedDrips(this, this.anat.bleedRate(), dt, arteryRate(this.anat), clamp(this.anat.blood / 5000, 0.2, 1));
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
    if (this.rag) { this.rag.keep = false; this.rag.owner = { anat: an }; }
    else spawnRagdoll(this.hum, this.vel, an.lastDir, PART_OF_REGION(an.lastRegion), an.cause === 'brain', { bb: an.brokenMask(), ls: an.lostMask(), lc: an.cutArr(), gib: an.cause === 'brain' && an.lastW === 2 }).owner = { anat: an };
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

