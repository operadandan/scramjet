// ---------------------------------------------------------------- physics helpers
function blocked(pos, h, r) {
  for (const c of colliders) if (pos.x + r > c.min.x && pos.x - r < c.max.x && pos.z + r > c.min.z && pos.z - r < c.max.z && pos.y + h > c.min.y && pos.y < c.max.y && !gridPass(c, pos, h, r)) return c;
  return null;
}
function pointBlocked(p, r) {
  for (const c of colliders) if (p.x + r > c.min.x && p.x - r < c.max.x && p.y + r > c.min.y && p.y - r < c.max.y && p.z + r > c.min.z && p.z - r < c.max.z && !(c.mesh && gridOpenW(c.mesh, p))) return true;
  return false;
}
const PR = 0.35;
// how far down the player can look: about 60 degrees, the boots and the front of the rig at the bottom of the view
const PITCH_MIN = -1.05;
function enterDowned(extra) {
  const an = P.anat;
  P.downed = true; P.adsOn = false; P.reloading = false; P.healing = false; P.inspecting = false; mouse.left = false; P.react = null; P.stun = 0;
  localBody.update(0);
  P.rag = spawnRagdoll(localBody, P.vel.clone(), an.lastDir.clone(), PART_OF_REGION(an.lastRegion), false, Object.assign({ bb: an.brokenMask(), ls: an.lostMask(), lc: an.cutArr(), keep: true }, extra || {}));
  P.rag.owner = { anat: an };
  $('downmsg').style.display = 'block';
  $('downwhy').textContent = an.paralyzed ? 'Spinal cord injury. You will not get up.' : P.forceDown ? 'You went down and cannot get back up.' : 'You blacked out from the pain. You may come to if it eases.';
}
function wakeUp() {
  const r = P.rag; P.downed = false; P.reactDone = false;
  if (r) { P.pos.set(r.p[2].x, P.pos.y, r.p[2].z); freeRag(r); }
  P.rag = null; P.stance = 2; P.prone = 1; P.crouch = 0; P.vel.set(0, 0, 0);
  $('downmsg').style.display = 'none';
  flashMsg('YOU CAME TO<small>The pain eased enough to move.</small>', 2500);
}
// climbing over: something ahead whose top is between knee and chest-plus height, with room to stand on it. The body goes up
// first (hands on the edge, gun pulled in), then over, slower the higher it is
function tryMantle() {
  const fwd = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  for (let d = 0.2; d <= 0.75; d += 0.08) {
    const p = P.pos.clone().addScaledVector(fwd, d); p.y += 0.25;
    const c = blocked(p, 0.1, 0.05); if (!c) continue;
    const top = c.max.y, up = top - P.pos.y;
    if (up < 0.4 || up > 1.75) return false;
    for (const ex of [0.35, 0.5, 0.65]) {
      const L = P.pos.clone().addScaledVector(fwd, d + ex); L.y = top + 0.005;
      if (!blocked(L, 1.8, PR - 0.03) && !blocked(new V3(P.pos.x, top + 0.05, P.pos.z), 1.8 - up * 0.3, PR - 0.1)) {
        const edge = P.pos.clone().addScaledVector(fwd, d + 0.03); edge.y = top;
        P.mantle = { t: 0, dur: 0.75 + up * 0.45, a: P.pos.clone(), a2: P.pos.clone().addScaledVector(fwd, Math.max(0, d - 0.3)), b: L, up, edge: edge.toArray() }; P.adsOn = false; P.leanState = 0; P.inspecting = false; P.sprinting = false;
        return true;
      }
    }
    return false;
  }
  return false;
}
function updateMantle(dt) {
  const M = P.mantle; M.t += dt / M.dur; const t = Math.min(1, M.t);
  // step in to the edge and get the hand on it (body still on its feet), push up, then swing over
  const step = clamp(t / 0.18, 0, 1), rise = clamp((t - 0.14) / 0.52, 0, 1), over = clamp((t - 0.45) / 0.55, 0, 1), e = x => x * x * (3 - 2 * x);
  const ax = lerp(M.a.x, M.a2.x, e(step)), az = lerp(M.a.z, M.a2.z, e(step));
  P.pos.x = lerp(ax, M.b.x, e(over)); P.pos.z = lerp(az, M.b.z, e(over));
  P.pos.y = M.a.y + (M.b.y - M.a.y) * (1 - Math.pow(1 - rise, 2.2)) + Math.sin(rise * Math.PI) * 0.04;
  P.mantleK = Math.sin(t * Math.PI);
  if (M.t >= 1) { P.pos.copy(M.b); P.mantle = null; P.onGround = true; P.vel.set(0, 0, 0); P.jumpCD = 0.4; P.landKick = (P.landKick || 0) + 0.35; }
}
// you, as a body for the shared wound reactions (the same code and the same choices an AI body uses)
const PB = {
  get hum() { return localBody; }, get anat() { return P.anat; }, get baseYaw() { return P.yaw; },
  get react() { return P.react; }, set react(v) { P.react = v || null; },
  get reactDone() { return P.reactDone; }, set reactDone(v) { P.reactDone = v; },
  stanceKind() { return P.prone > 0.5 ? 'prone' : P.crouch > 0.5 ? 'crouch' : 'stand'; },
  dropGun() { if (P.slot < 2 && P.guns[P.weapon]) dropWeapon(); },
  goLimp(soft) { P.react = null; enterDowned({ soft: !!soft }); }
};
function standHeight() { return 1.8 - 0.6 * P.crouch - 1.3 * P.prone; }
function updatePlayer(dt) {
  if (!P.alive) { localBody.root.visible = false; fpBody.root.visible = false; return; }
  const an = P.anat;
  an.update(dt);
  if (an.dead) { localDeath(); return; }
  P.supp = Math.max(0, (P.supp || 0) - dt * 0.2);
  // going down: like an AI body, unless the spine or both legs are gone it reacts to the wound first (stumbles, clutches it,
  // folds) and then collapses. No control until it is over.
  if ((an.isDowned() || P.forceDown || P.react) && !P.downed) {
    const canReact = !an.paralyzed && !an.bothLegs();
    if (canReact && !P.react && !P.reactDone) { localBody.root.position.copy(P.pos); localBody.root.rotation.y = P.yaw; reactStart(PB, 'hit'); }
    if (canReact && P.react) {
      P.adsOn = false; P.reloading = false; P.inspecting = false; P.healing = false; mouse.left = false;
      reactRun(PB, dt);
      if (P.react) { P.pos.copy(localBody.root.position); P.vel.set(0, 0, 0); P.speed = 0; localBody.root.visible = true; fpBody.root.visible = false; if (!S.tp) { localBody.head.visible = false; localBody.neck.visible = false; } return; }
      if (!P.downed) enterDowned({ soft: true });
    } else { P.react = null; enterDowned(); }
  }
  // a down only counts as a kill for the shooter if it isn't just pain (spine or both legs gone); pain knockouts wait for the death
  if (P.downed && !P.downSent && S.mode === 'online' && an.lastBy && (an.paralyzed || an.bothLegs())) { P.downSent = true; net.send({ t: 'down', by: an.lastBy }); }
  else if (P.downed && !an.isDowned() && !P.forceDown) wakeUp();
  if (P.downed) { bleedDrips(P, an.bleedRate(), dt, arteryRate(an), clamp(an.blood / 5000, 0.2, 1)); localBody.root.visible = false; fpBody.root.visible = false; if (P.rag) P.pos.set(P.rag.p[2].x, 0, P.rag.p[2].z); P.vel.set(0, 0, 0); P.speed = 0; return; }
  let fx_ = 0, fz = 0;
  // rocked by a hit: a moment with no control
  P.stun = Math.max(0, (P.stun || 0) - dt);
  const dazed = P.stun > 0;
  if (dazed) { P.adsOn = false; P.leanState = 0; P.inspecting = false; P.healing = false; mouse.left = false; }
  if (!dazed) {
  if (keys.KeyW) fz -= 1; if (keys.KeyS) fz += 1; if (keys.KeyA) fx_ -= 1; if (keys.KeyD) fx_ += 1;
  }
  const len = Math.hypot(fx_, fz); if (len) { fx_ /= len; fz /= len; }
  const sn = Math.sin(P.yaw), cs = Math.cos(P.yaw);
  const wx = fx_ * cs + fz * sn, wz = -fx_ * sn + fz * cs;

  const downed = an.bothLegs(), oneLeg = an.legBroken('L') || an.legBroken('R');
  if (downed) P.stance = 2;
  // standing back up needs headroom
  if (P.stance < 2 && P.prone > 0.05 && blocked(P.pos, 1.2, PR - 0.02)) P.stance = 2;
  if (P.stance === 0 && P.crouch > 0.05 && blocked(P.pos, 1.8, PR - 0.02)) P.stance = 1;
  P.crouch = damp(P.crouch, P.stance === 1 ? 1 : 0, 10, dt);
  P.prone = damp(P.prone, P.stance === 2 ? 1 : 0, 5, dt);

  // ---- movement. No stamina; instead the body has weight: it takes time to get going and to stop, sprints only forward,
  // walks slower backward and sideways, surges and slows with each step, can't hop again right after landing, loses speed when
  // it lands, and climbs over things it can't step onto.
  const wantSprint = keys.ShiftLeft && fz < 0 && len > 0 && P.stance === 0 && !oneLeg && !P.mantle && !dazed;
  P.sprinting = !!(wantSprint && P.onGround) || (P.sprinting && wantSprint && !P.onGround);
  if (P.sprinting) { P.adsOn = false; P.leanState = 0; P.inspecting = false; P.healing = false; }
  P.stamina = 100;

  if (P.mantle) { updateMantle(dt); P.speed = 0; P.vel.set(0, 0, 0); }
  else {
  let spd = P.sprinting ? 5.4 : 3.0;
  // backward and sideways are slower than forward
  if (len) spd *= fz > 0.1 ? 0.62 : Math.abs(fx_) > 0.5 ? 0.8 : 1;
  spd *= lerp(1, 0.47, P.crouch); spd *= lerp(1, downed ? 0.1 : 0.21, P.prone);
  spd *= lerp(1, 0.6, P.ads); spd *= 1 - Math.abs(P.lean) * 0.25;
  if (oneLeg && !downed) spd *= 0.45;
  if (P.healing) spd *= 0.4;
  spd *= clamp((an.blood - 2500) / 1500, 0.4, 1);
  spd *= 1 - clamp(P.landK || 0, 0, 0.7);                                     // just landed
  if (len && P.onGround) spd *= 1 + Math.sin((P.bobT || 0) * 2) * 0.07;      // each footfall pushes, then the stride carries
  // drift: feet are never perfectly straight, the heading wanders a little with the stride
  const wob = len ? Math.sin((P.bobT || 0) * 0.5 + 0.7) * 0.035 + Math.sin(performance.now() / 1300) * 0.02 : 0;
  const mx = wx * Math.cos(wob) - wz * Math.sin(wob), mz = wx * Math.sin(wob) + wz * Math.cos(wob);
  const cur = Math.hypot(P.vel.x, P.vel.z), speeding = spd * (len ? 1 : 0) > cur;
  // speeding up is slow (slower still into a sprint), stopping is quicker but not instant; in the air almost no control
  const rate = !P.onGround ? 0.8 : speeding ? (P.sprinting ? 2.6 : 5) : 7.5;
  const k = 1 - Math.exp(-rate * dt);
  P.vel.x += (mx * spd - P.vel.x) * k; P.vel.z += (mz * spd - P.vel.z) * k;
  P.vel.y -= 22 * dt;
  P.jumpCD = Math.max(0, (P.jumpCD || 0) - dt); P.landK = Math.max(0, (P.landK || 0) - dt * 2.2);
  if (keys.Space && P.onGround && P.stance === 0 && !oneLeg && !P.jumpCD && !dazed) {
    if (!tryMantle()) { P.vel.y = 4.6; P.onGround = false; P.jumpCD = 0.9; P.jumpKick = 1; }   // about half a metre of hop
  }

  const h = standHeight();
  // horizontal moves step up onto anything up to a kerb's height instead of stopping dead
  const stepX = (axis, v) => {
    const old = P.pos[axis]; P.pos[axis] += v * dt;
    const c = blocked(P.pos, h, PR); if (!c) return;
    const up = c.max.y - P.pos.y;
    if (P.onGround && up > 0 && up <= 0.36 && !blocked(new V3(P.pos.x, c.max.y + 0.01, P.pos.z), h, PR)) { P.pos.y = c.max.y; P.stepDip = (P.stepDip || 0) + up; return; }
    P.pos[axis] = v > 0 ? c.min[axis] - PR - 1e-4 : c.max[axis] + PR + 1e-4; P.vel[axis] = 0;
  };
  stepX('x', P.vel.x); stepX('z', P.vel.z);
  const wasGround = P.onGround, vy = P.vel.y;
  P.pos.y += P.vel.y * dt; P.onGround = false;
  if (P.pos.y <= 0) { P.pos.y = 0; P.vel.y = 0; P.onGround = true; }
  let c = blocked(P.pos, h, PR);
  if (c) { if (P.vel.y <= 0) { P.pos.y = c.max.y; P.onGround = true; } else P.pos.y = c.min.y - h - 1e-4; P.vel.y = 0; }
  // stay glued to the ground walking down a small step instead of floating off it
  if (!P.onGround && wasGround && vy <= 0 && P.vel.y <= 0) { const g = new V3(P.pos.x, P.pos.y - 0.36, P.pos.z), cb = blocked(g, 0.36, PR); if (cb && cb.max.y <= P.pos.y + 0.01) { P.pos.y = cb.max.y; P.onGround = true; P.vel.y = 0; } else if (P.pos.y - 0.36 <= 0 && P.pos.y > 0) { P.pos.y = 0; P.onGround = true; P.vel.y = 0; } }
  if (P.onGround && !wasGround && vy < -2) { const imp = clamp((-vy - 2) / 6, 0, 1); P.landK = 0.25 + imp * 0.5; P.landImp = imp; P.jumpCD = Math.max(P.jumpCD, 0.35); P.landKick = (P.landKick || 0) + 0.4 + imp; }
  }
  if (P.pos.y < -20) respawnLocal(spawns[0]);
  P.speed = Math.hypot(P.vel.x, P.vel.z);
  if (P.prone > 0.5) P.pitch = clamp(P.pitch, -0.45, 0.6);

  P.lean = damp(P.lean, P.sprinting || P.prone > 0.3 ? 0 : P.leanState, 9, dt);

  const a = localBody.anim;
  localBody.root.visible = true;
  localBody.root.position.copy(P.pos); localBody.root.rotation.y = P.yaw;
  Object.assign(a, { speed: P.speed, crouch: P.crouch, prone: P.prone, limp: downed ? 1 : oneLeg ? 0.5 : 0, lean: P.leanEff, pitch: P.pitch, sprint: P.sprintBlend, ads: P.ads, air: P.onGround ? 0 : 1, weapon: P.slot >= 2 ? MEDKIT_W : P.weapon, unarmed: P.slot === 4, bb: an.brokenMask(), ah: an.armHangMask(), ls: an.lostMask(), lc: an.cutArr(), reload: P.reloading ? Math.max(0.001, P.reloadT / P.reloadDur) : 0 });
  a.stag = P.stun > 0 ? 0.5 : 0;
  a.hurt = damp(a.hurt || 0, hurtLevel(an), 2, dt); a.downedPose = downed; reClutch(a, an, dt); updateBrace(localBody, dt);
  localBody.update(dt);
  // the visible first-person body follows the same pose, set back from the eye; hidden when prone (the eye is down among it)
  fpBody.root.visible = !S.tp && P.prone < 0.3;
  if (fpBody.root.visible) {
    fpBody.root.position.copy(P.pos).add(_fpo.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)).multiplyScalar(0.29 + 0.2 * P.crouch));
    fpBody.root.rotation.y = P.yaw; Object.assign(fpBody.anim, a); fpBody.update(dt);
    for (const k of ['head', 'neck', 'shL', 'shR']) if (fpBody[k]) fpBody[k].visible = false;
    // the third-person rifle stance twists the torso to the right; the body you look down at faces straight ahead
    fpBody.spine.rotation.y = 0; fpBody.hips.rotation.y = 0; fpBody.spine.rotation.z *= 0.3; fpBody.root.updateMatrixWorld(true);
    { // nothing of the body above eye level is drawn (the neck and collar would be around the camera)
      fpClip.setFromNormalAndCoplanarPoint(_fpo.set(0, -1, 0), camera.position.clone().setY(camera.position.y - 0.06 - 0.08 * P.crouch)); }
  }
  bleedDrips(P, an.bleedRate(), dt, arteryRate(an), clamp(an.blood / 5000, 0.2, 1));
}
const _fpo = new V3();
P.hum = localBody;

// ---------------------------------------------------------------- weapons logic
function flashMsg(html, ms) { const m = $('magcheck'); m.innerHTML = html; m.style.opacity = '1'; clearTimeout(flashMsg.t); flashMsg.t = setTimeout(() => { m.style.opacity = '0'; }, ms || 1600); }
function startReload() {
  const w = WEAPONS[P.weapon], G = P.guns[P.weapon];
  if (!P.alive || P.slot >= 2 || P.reloading || P.rack || P.switchT > 0 || P.sprinting || P.react || P.stun > 0) return;
  if (G.mag >= w.cap && G.chamber) return;
  if (w.pellets) return startShellLoad(w, G);
  if (S.mode === 'test' && !G.pouch.some(n => n > 0)) G.pouch = G.pouch.concat(Array(w.spare).fill(w.cap));
  if (!G.pouch.some(n => n > 0)) { flashMsg(G.pouch.length ? 'NO LOADED MAGAZINES' : 'NO SPARE MAGAZINES', 1200); blip(200, 0.06, 0.03); return; }
  P.inspecting = false;
  P.reloading = true; P.reloadT = 0; P.reloadStage = 0; P.reloadFum = false; P.rlSeed = Math.random() * 100;
  P.reloadEmpty = !G.chamber;
  const stress = clamp(P.anat.pain * 0.8 + (P.supp || 0) * 0.8 + (P.stamina < 35 ? 0.2 : 0), 0, 1);
  P.rlSeq = makeReloadSeq(P.reloadEmpty, stress);
  P.reloadDur = w.tac * 1.3 * rnd(0.86, 1.16) * (1 + P.anat.pain * 0.35 + (P.supp || 0) * 0.45) * (P.rlSeq.fumble ? 1.1 : 0.95) * (P.anat.handBroken('L') || P.anat.handBroken('R') ? 1.6 : 1) * (P.anat.anyArm() ? 1.3 : 1);
}
// ---------------------------------------------------------------- working the action by hand (F)
// Nothing chambers by itself after an empty reload. Locked back (AR, pistols, Barrett): F hits the bolt catch / drops the slide
// stop (the Barrett: a tug on the handle). Bolt forward on an empty chamber, or to clear one: F pulls the charging handle or
// slide back and holds it, F again lets it go and it strips a round off the magazine.
const HOLD_OPEN = { m4: 1, g17: 1, m9: 1, m107: 1 };
const RK = (keys, extra) => Object.assign({ seq: { keys, held: [], hidden: [] } }, extra);
function canRack() { const w = WEAPONS[P.weapon], V = VMW[P.weapon]; return P.alive && !P.downed && P.slot < 2 && !w.pellets && V && V.rack && !P.reloading && !P.inspecting && !P.rack && P.switchT <= 0; }
function rackNeeded() { const G = P.guns[P.weapon]; return canRack() && G && (G.held || (!G.chamber && G.mag > 0)); }
function workAction() {
  const V = VMW[P.weapon], G = P.guns[P.weapon], R = V.rack;
  P.adsOn = false;
  if (G.held) P.rack = RK([[0, 'HCb'], [0.22, 'HCb'], [1, 'H0']], { type: 'fwd', dur: 0.5, ev: 0.14 });
  else if (G.lockBack && R.slap) P.rack = RK([[0, 'H0'], [0.42, 'HS'], [0.56, 'HSp'], [0.68, 'HS'], [1, 'H0']], { type: 'slap', dur: 0.62, ev: 0.56 });
  else if (G.lockBack && R.stop) P.rack = RK([[0, 'H0'], [0.42, 'HT'], [0.58, 'HTp'], [0.72, 'HT'], [1, 'H0']], { type: 'stop', dur: 0.55, ev: 0.58 });
  else if (G.lockBack) P.rack = RK([[0, 'H0'], [0.4, 'HC'], [0.55, 'HCb'], [0.62, 'HCb'], [1, 'H0']], { type: 'tug', dur: 0.7, ev: 0.6 });
  else P.rack = RK([[0, 'H0'], [0.48, 'HC'], [0.6, 'HC'], [1, 'HCb']], { type: 'back', dur: 0.6, ev: 0.85 });
  P.rack.t = 0; P.rack.done = false;
  blip(420, 0.02, 0.03);
}
function boltHome(G) {
  G.held = false; G.lockBack = false;
  if (!G.chamber && G.mag > 0) { G.mag--; G.chamber = 1; }
  noiseHit(1700, 0.09, 0.1); blip(950, 0.04, 0.08); P.kick += 0.25;
}
function updateRack(w, G, V, dt) {
  const R = P.rack; if (!R) return;
  R.t += dt / R.dur;
  if (!R.done && R.t >= R.ev) {
    R.done = true;
    if (R.type === 'back') {
      // the bolt comes back past the ejector: a round in the chamber flies out
      if (G.chamber) { G.chamber = 0; vmCamera.updateMatrixWorld(true); const q = V.g.getWorldQuaternion(new THREE.Quaternion()); ejectShell(V.port.getWorldPosition(new V3()), new V3(1, 0, 0).applyQuaternion(q), new V3(0, 1, 0).applyQuaternion(q), new V3(0, 0, -1).applyQuaternion(q), P.vel, w.shell); }
      noiseHit(1300, 0.06, 0.06); blip(600, 0.03, 0.04);
    } else boltHome(G);
  }
  if (R.t >= 1) { if (R.type === 'back') G.held = true; P.rack = null; }
}
// how far back the bolt / slide / charging handle is being held by the hand (0..1)
function rackK(G) {
  const R = P.rack;
  if (!R) return G && G.held ? 1 : 0;
  const t = R.t;
  if (R.type === 'back') return ramp(t, 0.6, 1);
  if (R.type === 'fwd') return t < R.ev ? 1 : Math.max(0, 1 - (t - R.ev) * R.dur / 0.035);
  if (R.type === 'tug') return t < R.ev ? Math.max(G.lockBack ? 1 : 0, ramp(t, 0.4, 0.55)) : Math.max(0, 1 - (t - R.ev) * R.dur / 0.035);
  return t < R.ev ? 1 : Math.max(0, 1 - (t - R.ev) * R.dur / 0.035);
}
function rackHint() {
  const el = $('rackhint'); if (!el) return;
  const w = WEAPONS[P.weapon], G = P.guns[P.weapon], V = VMW[P.weapon];
  let txt = '';
  if (P.alive && !P.downed && P.slot < 2 && G && V && V.rack && !w.pellets && !P.reloading && !P.rack) {
    const R = V.rack, part = R.kind === 'slide' ? 'SLIDE' : R.kind === 'chg' ? 'CHARGING HANDLE' : 'BOLT HANDLE';
    if (G.held) txt = 'PRESS <b>F</b> TO LET THE ' + part + ' GO';
    else if (G.lockBack && G.mag > 0) txt = 'PRESS <b>F</b> TO ' + (R.slap ? 'HIT THE BOLT CATCH' : R.stop ? 'DROP THE SLIDE STOP' : 'RACK THE BOLT');
    else if (!G.chamber && G.mag > 0) txt = 'CHAMBER EMPTY: PRESS <b>F</b> TO RACK THE ' + part + '<small>F pulls it back, F again lets it go</small>';
  }
  if (el.dataset.t !== txt) { el.dataset.t = txt; el.innerHTML = txt; el.style.opacity = txt ? '1' : '0'; }
}
// ---------------------------------------------------------------- shotgun: shells go into the tube one at a time, the pump chambers one
// Loading can be cut short by pulling the trigger: the shell in hand still goes in, then the hand goes back to the pump.
const shellsLeft = G => G.pouch.reduce((a, n) => a + n, 0);
function shellTime(w) {
  return w.tac * rnd(0.88, 1.15) * (1 + P.anat.pain * 0.35 + (P.supp || 0) * 0.45) * (P.anat.handBroken('L') || P.anat.handBroken('R') ? 1.6 : 1) * (P.anat.anyArm() ? 1.3 : 1);
}
function startShellLoad(w, G) {
  if (S.mode === 'test' && !shellsLeft(G)) G.pouch = G.pouch.concat(Array(w.spare).fill(w.carrier));
  P.inspecting = false; P.reloading = true; P.reloadT = 0; P.reloadEmpty = false; P.reloadFum = true; P.reloadStage = 0; P.sgStop = false; P.sgIn = false; P.sgLoaded = 0; P.rlSeed = Math.random() * 100;
  if (G.mag >= w.cap || !shellsLeft(G)) {
    if (G.chamber || !G.mag) { flashMsg(shellsLeft(G) ? 'TUBE FULL' : 'NO SHELLS', 1200); blip(200, 0.06, 0.03); P.reloading = false; return; }
    return sgPhase('rack');
  }
  sgPhase('load', true);
}
function sgPhase(ph, first) {
  P.sgPhase = ph; P.reloadT = 0; P.sgIn = false;
  if (ph === 'load') { P.rlSeq = first ? SG_SEQ.first : SG_SEQ.shell; P.reloadDur = shellTime(WEAPONS[P.weapon]) * (first ? 1.15 : 1); }
  else if (ph === 'rack') { P.rlSeq = P.sgLoaded ? SG_SEQ.rackH1 : SG_SEQ.rack; P.reloadDur = 0.62; }
  else { P.rlSeq = SG_SEQ.end; P.reloadDur = 0.28; }
}
function updateShellLoad(w, G, dt) {
  P.reloadT += dt; const r = P.reloadT / P.reloadDur;
  if (P.sgPhase === 'load') {
    if (r > 0.4 && P.reloadStage === 0) { P.reloadStage = 1; noiseHit(2600, 0.03, 0.03); }
    if (r > 0.84 && !P.sgIn) {
      // take from the emptiest carrier that still has shells, so carriers run dry one at a time
      let k = -1; for (let i = 0; i < G.pouch.length; i++) if (G.pouch[i] > 0 && (k < 0 || G.pouch[i] < G.pouch[k])) k = i;
      if (k >= 0) { G.pouch[k]--; G.mag++; P.sgLoaded++; }
      P.sgIn = true; noiseHit(1300, 0.05, 0.08); blip(820, 0.025, 0.05); P.rlJ = (P.rlJ || 0) + 0.5;
    }
    if (r >= 1) {
      P.reloadStage = 0;
      if (!P.sgStop && G.mag < w.cap && shellsLeft(G)) sgPhase('load');
      else if (!G.chamber && G.mag > 0) sgPhase('rack');
      else sgPhase('end');
    }
  } else if (P.sgPhase === 'rack') {
    const k0 = P.sgLoaded ? 0.28 : 0.05;
    if (r > k0 + 0.18 && P.reloadStage === 0) { P.reloadStage = 1; pumpSound(0); }
    if (r > k0 + 0.42 && P.reloadStage === 1) { P.reloadStage = 2; pumpSound(1); if (!G.chamber && G.mag > 0) { G.mag--; G.chamber = 1; } }
    if (r >= 1) P.reloading = false;
  } else if (r >= 1) P.reloading = false;
}
// pump stroke after a shot: back from 0.13 s, held, forward by 0.44 s. Rack during loading uses the same shape on its own clock
function pumpCurve(t) { return t < 0.13 ? 0 : t < 0.27 ? smooth((t - 0.13) / 0.14) : t < 0.31 ? 1 : t < 0.44 ? 1 - smooth((t - 0.31) / 0.13) : 0; }
function pumpSound(fwd) { if (fwd) { noiseHit(1500, 0.06, 0.12); blip(380, 0.03, 0.05); } else { noiseHit(1100, 0.07, 0.1); blip(250, 0.035, 0.05); } }
function finishReload() {
  const w = WEAPONS[P.weapon], G = P.guns[P.weapon];
  let best = 0; for (let i = 1; i < G.pouch.length; i++) if (G.pouch[i] > G.pouch[best]) best = i;
  if (G.next != null && G.next < G.pouch.length) best = G.next; G.next = null;
  const nm = G.pouch.splice(best, 1)[0];
  G.pouch.push(G.mag);   // the old magazine goes back in the pouch, even when it is empty
  G.mag = nm;
  P.reloading = false;
  // bolt or slide locked back on the empty mag: the hand goes straight to the bolt catch / slide stop and sends it home
  const V = VMW[P.weapon];
  if (G.lockBack && G.mag > 0 && V && V.rack && (V.rack.slap || V.rack.stop) && canRack()) workAction();
}
function startInspect() {
  if (!P.alive || P.slot >= 2 || P.reloading || P.inspecting || P.sprinting) return;
  P.switchT = 0; P.inspecting = true; P.inspectT = 0; P.inspectShown = false; P.adsOn = false;
}
function magEstimate(n, cap) {
  if (n <= 0) return 'Empty'; const f = n / cap;
  if (f >= 1) return 'Full'; if (f > 0.8) return 'Nearly full'; if (f > 0.58) return 'More than half';
  if (f > 0.42) return 'About half'; if (f > 0.15) return 'Less than half'; return 'Nearly empty';
}
function switchWeapon(i) {
  if (i === P.slot || !P.alive) return;
  if (i < 2 && P.activeLo[i] == null) { flashMsg('NO WEAPON IN THAT SLOT', 900); return; }
  P.slot = i; if (i < 2) P.weapon = P.activeLo[i];
  P.rack = null; P.reloading = false; P.inspecting = false; P.healing = false; P.healT = 0; P.plating = false; P.plateT = 0; P.adsOn = false; P.switchT = 0.35; blip(320, 0.05, 0.05);
}
function updateWeapons(dt) {
  const w = WEAPONS[P.weapon], G = P.guns[P.weapon], V = VMW[P.weapon];
  if (P.switchT > 0) P.switchT = Math.max(0, P.switchT - dt);
  rackHint();
  if (P.downed || !P.alive || (!G && P.slot < 2)) { P.ads = 0; muzzleLight.intensity = 0; vmMuzzleLight.intensity = 0; return; }
  if (P.slot >= 2) {
    if (P.switchT <= 0) { if (P.slot === 2) updateMedkit(dt); else if (P.slot === 3) updatePlate(dt); }
    P.ads = damp(P.ads, 0, 14, dt); P.sprintBlend = damp(P.sprintBlend, P.sprinting ? 1 : 0, 10, dt);
    P.kick = damp(P.kick, 0, 14, dt); P.recoilPitch = damp(P.recoilPitch, 0, 9, dt);
    VMW.forEach(v => { v.flash.visible = false; }); muzzleLight.intensity = 0; vmMuzzleLight.intensity = 0;
    return;
  }
  if (P.reloading && w.pellets) updateShellLoad(w, G, dt);
  else if (P.reloading) {
    P.reloadT += dt; const r = P.reloadT / P.reloadDur;
    if (P.reloadStage === 0 && r > (P.reloadEmpty ? 0.13 : 0.14)) {
      P.reloadStage = 1; blip(900, 0.04, 0.06); noiseHit(1200, 0.06, 0.06);
    }
    const sq = P.rlSeq;
    if (!P.reloadFum && r > sq.fum) { P.reloadFum = true; noiseHit(1900, 0.03, 0.05); blip(520, 0.02, 0.03); P.rlJ = (P.rlJ || 0) - 0.5; }
    if (P.reloadStage === 1 && r > sq.seat) { P.reloadStage = 2; blip(700, 0.05, 0.08); noiseHit(900, 0.07, 0.09); P.rlJ = (P.rlJ || 0) + 1.2; }
    if (P.reloadT >= P.reloadDur) finishReload();
  }
  if (P.inspecting) {
    P.inspectT += dt; const k = P.inspectT / w.inspect;
    if (k > 0.4 && !P.inspectShown) {
      P.inspectShown = true; noiseHit(1100, 0.05, 0.05);
      if (w.pellets) flashMsg('TUBE: ' + G.mag + (G.chamber ? ' + 1' : '') + ' SHELLS<small>Carriers: ' + (G.pouch.length ? G.pouch.join(', ') : 'none') + '</small>', w.inspect * 1000 * 0.55);
      else flashMsg('MAG: ' + magEstimate(G.mag, w.cap).toUpperCase() + '<small>Spare: ' + (G.pouch.length ? G.pouch.map(n => magEstimate(n, w.cap)).join(', ') : 'none') + '</small>', w.inspect * 1000 * 0.55);
    }
    if (k >= 1) P.inspecting = false;
  }
  const adsWant = P.adsOn && !P.sprinting && !P.reloading && !P.inspecting && P.alive && P.switchT <= 0 && !P.anat.anyArm();
  P.ads = damp(P.ads, adsWant ? 1 : 0, 14 * (V.mods ? V.mods.ads : 1), dt);
  P.sprintBlend = damp(P.sprintBlend, P.sprinting ? 1 : 0, 10, dt);
  if (mouse.left && P.alive && S.locked) tryFire();
  if (w.pellets && P.pumpStage < 2) {
    const ts = performance.now() / 1000 - P.lastShot;
    if (P.pumpStage === 0 && ts > 0.17) { P.pumpStage = 1; pumpSound(0); if (P.pumpEject) { const e = P.pumpEject; vmCamera.updateMatrixWorld(true); ejectShell(S.tp ? e.o : V.port.getWorldPosition(new V3()), e.right, e.up, e.f, P.vel, '12g'); P.pumpEject = null; } }
    if (P.pumpStage === 1 && ts > 0.36) { P.pumpStage = 2; pumpSound(1); }
  }
  P.kick = damp(P.kick, 0, 14, dt); P.recoilPitch = damp(P.recoilPitch, 0, 9, dt);
  updateRack(w, G, V, dt);
  const rk = rackK(G), back = V.rack ? Math.max(G.lockBack ? 0.03 : 0, rk * V.rack.travel) : 0;
  P.slideBack = back > 0 ? back : damp(P.slideBack, 0, 28, dt);
  P.flashT -= dt;
  const flashOn = P.flashT > 0;
  VMW.forEach(v => { v.flash.visible = flashOn && v === V && !v.supp; if (flashOn) v.flash.rotation.z = Math.random() * 3; });
  muzzleLight.intensity = flashOn && !V.supp ? 6 : 0; vmMuzzleLight.intensity = flashOn && !V.supp ? 2 : 0;
}
function tryFire() {
  const w = WEAPONS[P.weapon], G = P.guns[P.weapon], now = performance.now() / 1000;
  if (P.reloading && w.pellets && P.sgPhase === 'load' && P.semiReady) { P.sgStop = true; P.semiReady = false; }
  if (P.reloading || P.inspecting || P.rack || G.held || P.switchT > 0 || P.sprintBlend > 0.3 || P.mantle || P.react || P.stun > 0) return;
  if (!w.auto && !P.semiReady) return;
  if (now - P.lastShot < 60 / w.rpm) return;
  if (!G.chamber) { if (P.semiReady) { blip(1500, 0.02, 0.05); noiseHit(2200, 0.03, 0.04); P.semiReady = false; } return; }
  P.lastShot = now; P.semiReady = false;
  G.chamber = 0; if (G.mag > 0) { G.mag--; G.chamber = 1; }
  // last round gone: guns with a hold-open device lock the bolt / slide back on the empty magazine
  if (!G.chamber && HOLD_OPEN[w.id]) G.lockBack = true;
  P.shots = (P.shots || 0) + 1;
  fire(w);
}
function dropMag(wi) {
  const src = VMW[wi].mag; vmCamera.updateMatrixWorld(true);
  const m = src.clone(); src.matrixWorld.decompose(m.position, m.quaternion, m.scale);
  m.traverse(o => { o.castShadow = true; });
  addProp(m, P.vel.clone().add(new V3(0, -1, 0)), new V3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)), 0.015, 'mag', 30);
}
const _fq = new THREE.Quaternion();
const ray = new THREE.Raycaster();
function fire(w) {
  vmCamera.updateMatrixWorld(true);
  const V = VMW[P.weapon];
  V.g.getWorldQuaternion(_fq);
  const gF = new V3(0, 0, -1).applyQuaternion(_fq), up = new V3(0, 1, 0).applyQuaternion(_fq), right = new V3(1, 0, 0).applyQuaternion(_fq);
  let origin = V.muzzle.getWorldPosition(new V3());
  // the barrel is angled so the round crosses the line of sight at the zero distance (100 m), with drop compensation
  const Z = w.zero || 100, tz = Z / (w.vel * 0.93), drop = 0.5 * 9.81 * tz * tz;
  const camF = new V3(); camera.getWorldDirection(camF);
  const camU = new V3(0, 1, 0).applyQuaternion(camera.quaternion);
  const tGun = origin.clone().addScaledVector(gF, Z).addScaledVector(up, V.sightH + drop);
  const tSight = camera.position.clone().addScaledVector(camF, Z).addScaledVector(camU, drop);
  const ak = smooth(clamp(P.ads * 1.15, 0, 1));
  const target = tGun.lerp(tSight, ak);
  // aimed: the round effectively leaves along the sight line, so point of impact = point of aim
  const fwdDist = _a.subVectors(origin, camera.position).dot(camF);
  origin.lerp(camera.position.clone().addScaledVector(camF, fwdDist), ak * 0.97);
  const dir = target.sub(origin).normalize();
  const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * w.disp;
  dir.addScaledVector(right, Math.cos(ang) * rad).addScaledVector(up, Math.sin(ang) * rad).normalize();
  // muzzle poking through a wall: start the round at the wall instead
  ray.set(camera.position, _a.subVectors(origin, camera.position).normalize()); ray.far = camera.position.distanceTo(origin);
  const block = ray.intersectObjects(worldMeshes, false)[0];
  if (block) origin = block.point.clone().addScaledVector(_a, -0.02);
  if (S.tp) { const ta = tpAim(); origin = ta.origin; dir.copy(ta.dir); const sp = w.disp * (1 + (1 - P.ads) * 1.5), a2 = Math.random() * 6.28, r2 = Math.sqrt(Math.random()) * sp; dir.addScaledVector(right, Math.cos(a2) * r2).addScaledVector(up, Math.sin(a2) * r2).normalize(); }
  const tracer = w.tracerEvery > 0 && P.shots % w.tracerEvery === 0;
  const seed = (Math.random() * 4294967295) >>> 0;
  const shot = { hits: new Map() };
  if (w.pellets) for (const d of pelletDirs(dir, P.weapon, seed)) spawnBullet(origin, d, P.weapon, false, true, S.myId, shot);
  else spawnBullet(origin, dir, P.weapon, tracer, true, S.myId);
  muzzleLight.position.copy(origin).addScaledVector(dir, 0.3);
  vmMuzzleLight.position.copy(V.muzzle.getWorldPosition(new V3()));
  P.flashT = w.snd === 2 || w.pellets ? 0.07 : 0.045;
  shotSound(P.weapon, 0, V.supp);
  muzzleSmoke(S.tp ? origin : V.muzzle.getWorldPosition(new V3()), dir, P.weapon, V.supp); V.boltK = 1; V.heat = Math.min(14, V.heat + (w.snd === 2 ? 2 : 1));
  P.kick = Math.min(w.snd === 2 ? 3 : w.pellets ? 2.4 : 1.5, P.kick + (w.snd === 2 ? 2.5 : w.pellets ? 2 : 1));
  if (V.slide) P.slideBack = 0.03;
  // a pump gun keeps its hull until the pump comes back
  if (w.pellets) { P.pumpStage = 0; P.pumpEject = { o: origin.clone(), right: right.clone(), up: up.clone(), f: gF.clone() }; V.boltK = 0; }
  else ejectShell(V.port.getWorldPosition(new V3()), right, up, gF, P.vel, w.shell);
  const rc = w.recoil * (V.mods ? V.mods.recoil : 1) * lerp(1, 0.6, P.ads) * lerp(1, 0.75, P.crouch) * lerp(1, 0.45, P.prone) * (P.anat.anyArm() ? 1.8 : 1);
  P.pitch = clamp(P.pitch + rc * 0.7, PITCH_MIN, 1.5); P.recoilPitch += rc * 0.6; P.yaw += (Math.random() - 0.45) * rc * 0.6;
  if (S.mode === 'online' && net.ready()) {
    const r4 = v => Math.round(v * 10000) / 10000;
    net.send({ t: 'shot', o: [r4(origin.x), r4(origin.y), r4(origin.z)], d: [r4(dir.x), r4(dir.y), r4(dir.z)], w: P.weapon, tr: tracer ? 1 : 0, sp: V.supp ? 1 : 0, sd: seed });
  }
}
function remoteShot(m) {
  if (!Array.isArray(m.o) || !Array.isArray(m.d)) return;
  const o = new V3().fromArray(m.o), dir = new V3().fromArray(m.d).normalize();
  const wi = WEAPONS[m.w] ? m.w : 0;
  const shot = { hits: new Map() };
  if (WEAPONS[wi].pellets) for (const d of pelletDirs(dir, wi, (Number(m.sd) >>> 0) || 1)) spawnBullet(o, d, wi, false, false, m.id, shot);
  else spawnBullet(o, dir, wi, !!m.tr, false, m.id);
  if (!m.sp) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), flashMat); f.position.copy(o); f.lookAt(camera.position);
  scene.add(f); fx.push({ o: f, life: 0.04, max: 0.04 }); }
  const right = new V3().crossVectors(dir, _Y).normalize(), up = new V3().crossVectors(right, dir);
  const ep = o.clone().addScaledVector(dir, isPistol(wi) ? -0.12 : wi === 2 ? -0.95 : -0.45);
  if (WEAPONS[wi].pellets) setTimeout(() => { if (S.mode) ejectShell(ep, right, up, dir, new V3(), '12g'); }, 190);
  else ejectShell(ep, right, up, dir, new V3(), WEAPONS[wi].shell);
  shotSound(wi, o.distanceTo(camera.position), !!m.sp);
  muzzleSmoke(o, dir, wi, !!m.sp);
}

// ---------------------------------------------------------------- death / spawn
function killSelf(head, dir, part, byName, causeText) {
  if (!P.alive) return;
  if (S.inv) closeInv();
  dropWeapon();
  P.alive = false; P.reloading = false; P.inspecting = false; P.headDeath = head;
  mouse.left = false;
  localBody.update(0);
  $('downmsg').style.display = 'none';
  const dm = P.deathM || deathMasks(P.anat); P.deathM = null;
  if (P.downed && P.rag) { P.rag.keep = false; P.rag.bleedR = Math.max(P.rag.bleedR, dm.bleed); P.rag.twitch = dm.twitch; P.rag.asleep = false; }
  else P.rag = spawnRagdoll(localBody, P.vel.clone(), dir, part, head, dm);
  P.rag.owner = { anat: P.anat };
  if (head) { $('black').style.transition = 'none'; $('black').style.opacity = '1'; $('deathmsg').style.display = 'none'; }
  else { $('dmgv').style.opacity = '1'; $('deathmsg').style.display = 'block'; $('deathmsg').textContent = (byName ? 'KILLED BY ' + byName.toUpperCase() : 'YOU DIED') + (causeText ? '  (' + causeText.toUpperCase() + ')' : ''); }
}
function localDeath() {
  const an = P.anat; if (!P.alive) return;
  const head = an.cause === 'brain' && an.lastRegion === 'head';
  const part = PART_OF_REGION(an.lastRegion), killer = an.lastBy ? (S.names[an.lastBy] || ('P' + an.lastBy)) : '';
  killSelf(head, an.lastDir.clone(), part, killer, DEATH_TEXT[an.cause]);
  const dm = P.deathM = deathMasks(an);
  if (S.mode === 'online') net.send({ t: 'died', by: an.lastBy || 0, part, head, d: an.lastDir.toArray(), dist: Math.round(an.lastDist || 0), cause: an.cause, gib: dm.gib ? 1 : 0, tear: dm.tear ? 1 : 0, bl: Math.round(dm.bleed), tw: +dm.twitch.toFixed(1) });
  else { S.testDeaths = (S.testDeaths || 0) + 1; setTimeout(() => { if (S.mode === 'test') respawnLocal(spawns[0]); }, 4000); }
}
function onSelfHurt(res) {
  hurtFlash();
  syncLost(localBody, P.anat.lostMask(), P.anat.lastDir, P.anat.cutArr()); fpBody.setLost(P.anat.lostMask(), P.anat.cutArr());
  if (res && res.severed) flashMsg(LIMB_NAME[res.severed].toUpperCase() + ' SEVERED', 2500);
  P.pitch = clamp(P.pitch + rnd(0.02, 0.06), PITCH_MIN, 1.5); P.yaw += rnd(-0.04, 0.04); P.kick += 0.6;
  if (res && res.stopped) noiseHit(300, 0.15, 0.12);
  if (res && (res.region === 'handL' || res.region === 'handR') && !res.missing && !res.stopped && !P.anat.dead && dropWeapon()) flashMsg('HIT IN THE HAND<small>You dropped your weapon. Press F to pick it up.</small>', 2600);
  if (res && res.helmetOff) { setHelmet(localBody, false, P.anat.lastDir); flashMsg('HELMET KNOCKED OFF', 2000); }
  else if (res && res.plate) flashMsg('FRONT PLATE ' + (res.stopped ? 'HIT' : 'PENETRATED') + '<small>Plate condition ' + Math.round(P.anat.armor[res.plate]) + '%</small>', 1600);
  // the same reactions as an AI body, from the same rules: a blast knocks you over; a round through the neck staggers you,
  // hands to the throat, gun gone, and puts you down; hit again while staggering, you collapse. Any solid hit rocks you for a
  // moment. While staggered or rocked you can do nothing.
  const an = P.anat;
  if (res && !an.dead && !P.downed) {
    const d = an.lastDir.clone().setY(0); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
    if (res.blast && res.blast.big) {
      P.forceDown = true; dropWeapon();
      const mv = P.vel.clone(), moving = mv.length() > 1;
      enterDowned({ soft: true, vTop: moving ? mv.clone().multiplyScalar(rnd(1.05, 1.35)).addScaledVector(d, rnd(0.4, 0.9)) : d.clone().multiplyScalar(rnd(1.8, 2.8)).add(new V3(rnd(-0.3, 0.3), rnd(0.1, 0.4), rnd(-0.3, 0.3))), vLeg: moving ? mv.clone().multiplyScalar(rnd(0.2, 0.45)) : d.clone().multiplyScalar(rnd(-0.2, 0.3)) });
    } else if (P.react && P.react.t > 0.15 && P.react.kind !== 'neck') {
      P.react = null; P.reactDone = true; P.forceDown = true; enterDowned();     // hit again mid-stumble: the legs go
    } else if (res.region === 'neck' && !res.stopped && !an.paralyzed && !(P.react && P.react.kind === 'neck')) {
      P.forceDown = true; localBody.root.position.copy(P.pos); localBody.root.rotation.y = P.yaw; reactStart(PB, 'neck');
    } else if (!res.stopped && !res.missing) {
      const E = res.energy || (an.lastV ? 0.5 * WEAPONS[an.lastW || 0].mass * an.lastV * an.lastV : 1500); P.stun = Math.max(P.stun || 0, clamp(E / 6000, 0.12, 0.45)); P.stunDir = d;
    }
  }
  if (P.anat.dead) localDeath();
}
function testSelfHit() {
  if (!P.alive) return;
  const ms = localBody.hitMeshes, m = ms[Math.floor(Math.random() * ms.length)];
  localBody.root.updateMatrixWorld(true);
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  const pt = m.localToWorld(m.geometry.boundingSphere.center.clone()).add(new V3(rnd(-0.03, 0.03), rnd(-0.03, 0.03), rnd(-0.03, 0.03)));
  const fwd = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const dir = pt.clone().sub(P.pos.clone().addScaledVector(fwd, 15).setY(1.4)).normalize();
  const info = hitToFrame(localBody, m, pt.clone().addScaledVector(dir, -0.12), dir);
  P.anat.lastDir.copy(dir); P.anat.lastBy = 0;
  const res = P.anat.hit(info.frame, info.e, info.d, rnd(600, 900), 0, info.armor);
  if (!res.stopped) hurtClutch(localBody.anim, info.frame, info.e);
  flashMsg('TEST HIT: ' + REGION_NAME[res.region || 'chest'] + (res.stopped ? ' (armor stopped it)' : '') + '<small>' + ((res.structures || []).join(', ') || 'flesh only') + '</small>', 2000);
  onSelfHurt(res);
}
function respawnLocal(sp) {
  P.forceDown = false; P.react = null; P.reactDone = false; P.stun = 0; P.deathM = null;
  P.pos.copy(sp); P.vel.set(0, 0, 0); P.yaw = Math.atan2(sp.x, sp.z); P.pitch = 0;
  if (S.mode === 'test') P.yaw = 0;
  if (P.rag) { P.rag.keep = false; P.rag.headG.visible = true; }
  // a fresh body: no holes, wounds, blood, tubes or missing parts carried over from the last life, on either body you own
  clearWounds(localBody); clearWounds(fpBody); fpBody.setLost(0); setHelmet(localBody, true);
  { const a = localBody.anim; a.hurt = 0; a.clutchT = 0; a.clutchW = 0; a.clutchF = null; a.woundF = null; a.braceP = null; a.braceW = 0; a.stag = 0; a.stagW = 0; localBody.fl = null; }
  P.anat = new Anatomy(); P.downed = false; localBody.setLost(0); P.stance = 0; P.prone = 0; P.slot = 0; P.weapon = P.loadout[0]; P.medUses = 3; P.healing = false; P.healT = 0; P.platesInv = 2; P.plating = false; P.plateTarget = null; P.invPlate = null; P.packGuns = []; P.loose = []; P.packPos = {}; P.supp = 0; P.downSent = false; P.lookX = P.lookY = 0; setHelmet(localBody, true);
  P.alive = true; P.stamina = 100; P.staminaLock = false; P.mantle = null; P.mantleK = 0; P.jumpCD = 0; P.landK = 0; P.crouch = 0; P.lean = 0; P.leanState = 0; P.adsOn = false;
  P.activeLo = P.loadout.slice(); P.guns = freshGuns(P.activeLo); P.reloading = false; P.inspecting = false; P.rag = null; P.headDeath = false;
  $('black').style.transition = 'opacity .35s'; $('black').style.opacity = '0';
  $('deathmsg').style.display = 'none'; $('dmgv').style.opacity = '0';
}
function hurtFlash() { const d = $('dmgv'); d.style.transition = 'none'; d.style.opacity = '0.7'; requestAnimationFrame(() => { d.style.transition = 'opacity .6s'; d.style.opacity = String(clamp((5000 - P.anat.blood) / 6000, 0, 0.4)); }); }
function hitmarker(kill) {
  return;
  const h = $('hitm'); h.className = kill ? 'kill' : ''; h.style.transition = 'none'; h.style.opacity = '1';
  requestAnimationFrame(() => { h.style.transition = 'opacity .25s'; h.style.opacity = '0'; });
}
function headshotConfirm() {
  return;
  blip(1400, 0.25, 0.07, 'sine'); blip(2100, 0.2, 0.04, 'sine');
  const h = $('hs'); h.style.transition = 'none'; h.style.opacity = '1';
  setTimeout(() => { h.style.transition = 'opacity .5s'; h.style.opacity = '0'; }, 600);
}
function feed(html) {
  const d = document.createElement('div'); d.innerHTML = html; $('feed').prepend(d);
  setTimeout(() => d.remove(), 6000);
  while ($('feed').children.length > 6) $('feed').lastChild.remove();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function testDeath(head) {
  if (!P.alive) return;
  killSelf(head, new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), head ? 'head' : 'torso', 'test');
  setTimeout(() => { if (S.mode === 'test') respawnLocal(spawns[0]); }, 3000);
}

