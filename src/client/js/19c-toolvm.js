// ---------------------------------------------------------------- tool viewmodels: grenade, C4 + remote, fists
// The same rigged arms, the same skin and sleeves, the same way of placing a hand as the guns: each hand's grip on what it
// holds is solved once at load (the palm settled onto the object, every finger curled until it touches, the thumb aimed),
// and per frame the object is moved and the hand follows it. Elbows come from the same solver, hanging from shoulders in
// the same place, and the whole thing rides on the same bob, sway, breathing drift and draw as a gun.
const TV = { g: new THREE.Group(), ok: !!ARM_DATA };
TV.g.visible = false; vm.add(TV.g);
const TSH = { R: new V3(0.2, -0.3, 0.05), L: new V3(-0.2, -0.3, 0.05) }, REACH = 0.535;
const tvHolder = () => { const h = new THREE.Group(); TV.g.add(h); return h; };
TV.nadeH = tvHolder(); TV.nade = makeFrag(); TV.nadeH.add(TV.nade.g);
TV.c4H = tvHolder(); TV.c4 = makeC4(true); TV.c4H.add(TV.c4);
TV.remH = tvHolder(); TV.rem = makeRemote(); TV.remH.add(TV.rem.g);
const tpose = (x, y, z, rx, ry, rz) => ({ p: new V3(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)) });
const pmix = (a, b, k) => ({ p: a.p.clone().lerp(b.p, k), q: a.q.clone().slerp(b.q, k) });
const ez = t => t * t * (3 - 2 * t), seg = (k, a, b) => ez(clamp((k - a) / (b - a), 0, 1)), outk = (k, a, b) => { const u = clamp((k - a) / (b - a), 0, 1); return 1 - (1 - u) * (1 - u); };
const CURL = (th, f) => ({ thumb: th, index: f.slice(), middle: f.slice(), ring: f.slice(), pinky: f.slice() });
const C_FIST = CURL([0.7, 0.8, 0.6, 1.35], [1.5, 1.75, 1.2, 0]), C_RELAX = CURL([0.2, 0.25, 0.2, 0.45], [0.42, 0.62, 0.4, 0]), C_OPEN = CURL([0.1, 0.05, 0.05, 0.3], [0.08, 0.12, 0.06, 0]);
C_FIST.index[3] = -0.04; C_FIST.pinky[3] = 0.08;
// a hand's grip on a held object, in the object's frame
function solveGrip(rig, holder, spec) {
  holder.position.set(0, 0, 0); holder.quaternion.identity(); holder.updateMatrixWorld(true);
  const cloud = new GraspCloud(0.003).addTree(holder);
  const pn = v3a(spec.pn).normalize(), f = v3a(spec.fwd).normalize(), q = rig.orient(f, pn);
  let w = settleHand(rig, cloud, q, rig.wristForMcp(q, v3a(spec.mcp)), pn);
  if (spec.press) w = pressHand(rig, cloud, q, w, pn);
  rig.setHand(q, w);
  const c = graspSolve(rig, cloud, Object.assign({ thumb: { fixed: [0, 0, 0] } }, spec.fing || {}));
  if (spec.thumb) c.thumb = thumbTo(rig, cloud, v3a(spec.thumb));
  if (spec.squeeze) for (const k of ['index', 'middle', 'ring', 'pinky']) c[k] = c[k].map((v, i) => i < 3 ? v + spec.squeeze * (i ? 1 : 0.6) : v);
  return { q, w, c, cloud };
}
// a free hand: wrist, finger direction, palm normal
function freeHand(rig, w, fwd, pn) { return { w: v3a(w), q: rig.orient(v3a(fwd), v3a(pn)) }; }
if (TV.ok) {
  const R = TV.R = new ArmRig('R'), L = TV.L = new ArmRig('L'); TV.g.add(R.root, L.root);
  for (const r of [R, L]) r.mesh.castShadow = false;
  // the grenade in the right hand: the spoon under the palm, fingers round the body, the thumb across the top of the lever
  TV.gripNade = solveGrip(R, TV.nadeH, { pn: [-1, -0.12, 0.08], fwd: [0.05, -0.22, -1], mcp: [0.03, -0.004, -0.024], thumb: [0.006, TV.nade.top + 0.006, 0.012], squeeze: 0.08 });
  // the left index hooked through the pull ring from behind, the other fingers loosely closed
  { const rp = TV.nade.ring.position, cl = new GraspCloud(); TV.nadeH.updateMatrixWorld(true);
    const q = L.orient(new V3(0.25, 0.05, -1), new V3(0.95, 0.15, 0.25)), w = L.wristForMcp(q, rp.clone().add(new V3(-0.016, -0.024, 0.052)));
    L.setHand(q, w); const c = { thumb: [0.3, 0.3, 0.25, 0.6], middle: [1.1, 1.3, 0.9, 0], ring: [1.2, 1.4, 0.9, 0.05], pinky: [1.25, 1.4, 0.9, 0.1] };
    c.index = fingerTo(L, cl, 'index', rp.clone().add(new V3(0.003, 0.0, -0.012))); TV.gripRing = { q, w, c }; }
  // the C4 block on the right palm, fingers up its far side, thumb on top
  TV.gripC4 = solveGrip(R, TV.c4H, { pn: [0, 1, 0.05], fwd: [-0.25, 0.05, -1], mcp: [0.07, -0.034, -0.012], thumb: [0.06, 0.03, 0.03], squeeze: 0.05 });
  // the remote in the left hand like a phone, face to you, thumb over the cover
  TV.gripRem = solveGrip(L, TV.remH, { pn: [1, 0, 0.1], fwd: [0.1, 0.3, -1], mcp: [-0.04, -0.012, -0.004], thumb: [0.0, 0.02, 0.026] });
  L.setHand(TV.gripRem.q, TV.gripRem.w);
  TV.remCover = thumbTo(L, new GraspCloud(), new V3(0.012, 0.012, 0.03));
  TV.remPress = thumbTo(L, new GraspCloud(), new V3(0.0, 0.022, 0.019));
  // a fist: the thumb laid across the middle bones of the index and middle fingers, outside them
  for (const rig of [R, L]) {
    rig.setHand(new THREE.Quaternion(), rig.wrist0.clone()); const cl = new GraspCloud(0.003), J = [new V3(), new V3(), new V3(), new V3()];
    for (const f of ['index', 'middle', 'ring', 'pinky']) { rig.fingerFK(f, C_FIST[f], C_FIST[f][3], J); for (let i = 0; i < 3; i++) for (let k = 0; k <= 6; k++) cl.add(J[i].clone().lerp(J[i + 1], k / 6)); }
    rig.fingerFK('index', C_FIST.index, C_FIST.index[3], J); const a1 = J[1].clone().lerp(J[2], 0.5); rig.fingerFK('middle', C_FIST.middle, 0, J); const a2 = J[1].clone().lerp(J[2], 0.5);
    const out = rig.pn0.clone().multiplyScalar(-1);
    rig.fistC = Object.assign({}, C_FIST, { thumb: thumbTo(rig, cl, a1.lerp(a2, 0.6).addScaledVector(out, 0.0)) });
  }
  // free hands
  TV.free = {
    Lidle: freeHand(L, [-0.15, -0.26, -0.33], [0.35, 0.55, -0.75], [0.9, 0.1, 0.3]),
    Lpoint: freeHand(L, [-0.14, -0.08, -0.42], [0.1, 0.15, -1], [0.25, -1, 0]),
    Llow: freeHand(L, [-0.13, -0.36, -0.28], [0.3, 0.2, -1], [0.9, 0.2, 0.2]),
    Ltuck: freeHand(L, [-0.07, -0.3, -0.24], [0.6, 0.3, -0.7], [0.6, 0.2, 0.7]),
    Ridle: freeHand(R, [0.15, -0.27, -0.33], [-0.35, 0.55, -0.75], [-0.9, 0.1, 0.3]),
    // fists: guard, knuckles up and forward, palms in; a punch turns the fist over, palm down, knuckles leading
    Rguard: freeHand(R, [0.115, -0.21, -0.31], [-0.2, 0.7, -0.68], [-0.88, 0.05, -0.4]),
    Lguard: freeHand(L, [-0.095, -0.18, -0.36], [0.2, 0.7, -0.68], [0.88, 0.05, -0.4]),
    Rpunch: freeHand(R, [0.06, -0.12, -0.43], [-0.15, 0.1, -1], [-0.45, -0.9, 0]),
    Lpunch: freeHand(L, [-0.05, -0.11, -0.45], [0.15, 0.1, -1], [0.45, -0.9, 0])
  };
}
// hand from a held object's pose and the grip on it
function handOn(H, grip) { return { q: H.q.clone().multiply(grip.q), w: grip.w.clone().applyQuaternion(H.q).add(H.p) }; }
const hmix = (a, b, k) => ({ q: a.q.clone().slerp(b.q, k), w: a.w.clone().lerp(b.w, k) });
function driveArm(rig, hand, curls, S, lost) {
  rig.mesh.visible = !lost; if (lost) return;
  const dS = hand.w.distanceTo(S); if (dS > REACH) hand = { q: hand.q, w: S.clone().lerp(hand.w, REACH / dS) };
  rig.setHand(hand.q, hand.w); rig.setCurls(curls);
  const f = rig.fwd0.clone().applyQuaternion(hand.q), n = rig.pn0.clone().applyQuaternion(hand.q);
  rig.elbowT.copy(solveElbow(hand.w, f, n, S, 0.3, 0.3, 0.5)); rig.shoulderT.copy(S); rig.apply();
}
const setH = (h, P_) => { h.position.copy(P_.p); h.quaternion.copy(P_.q); };
// ---- poses (object frames in camera space)
const G_ = { idle: tpose(0.135, -0.16, -0.36, 0.1, -0.35, 0.05), pres: tpose(0.085, -0.15, -0.37, 0.15, -0.7, 0.15), over: tpose(0.24, -0.01, -0.1, -0.6, -0.5, 0.4), under: tpose(0.2, -0.4, -0.2, 0.7, -0.3, 0),
  relO: tpose(0.06, -0.07, -0.43, 0.5, 0, 0), relU: tpose(0.06, -0.15, -0.41, -0.4, 0, 0), folO: tpose(-0.02, -0.36, -0.3, 1.2, 0.3, 0), folU: tpose(0.04, -0.03, -0.4, -0.9, 0, 0), low: tpose(0.14, -0.5, -0.28, 0.6, -0.3, 0) };
const B_ = { idle: tpose(0.06, -0.17, -0.38, 0.45, 0.35, 0.05), back: tpose(0.18, -0.03, -0.15, -0.3, 0.2, 0.4), rel: tpose(0.0, -0.09, -0.42, 0.4, 0.3, 0), fol: tpose(-0.04, -0.36, -0.3, 1, 0.5, 0), low: tpose(0.08, -0.5, -0.3, 0.8, 0.3, 0) };
const RM_ = { idle: tpose(-0.13, -0.2, -0.37, 0.25, 0.35, -0.1), up: tpose(-0.075, -0.125, -0.35, 0.12, 0.28, -0.05), tuck: tpose(-0.1, -0.29, -0.3, 0.4, 0.4, -0.1) };
// ---- per frame
function vmTools(dt) {
  VMW.forEach(v => { v.g.visible = false; }); TV.g.visible = true;
  const slot = P.slot, an = P.anat, lostL = !!an.lost.armL, lostR = !!an.lost.armR, F = TV.free;
  TV.nadeH.visible = slot === 3; TV.c4H.visible = slot === 2; TV.remH.visible = slot === 2 && !lostL;
  let rx = 0, ry = 0, rz = 0, pz = 0;
  if (slot === 3) {
    const N = P.nade || { ph: 'idle', t: 0, inHand: true }, t = N.t, over = N.btn === 0;
    let H = G_.idle, Lh = F && F.Lidle, Lc = C_RELAX, Rc = TV.gripNade && TV.gripNade.c, pinOff = null, open = 0;
    if (N.ph === 'idle') H = N.draw > 0 ? pmix(G_.low, G_.idle, ez(1 - N.draw / 0.45)) : G_.idle;
    else if (N.ph === 'pin') {
      H = pmix(G_.idle, G_.pres, seg(t, 0, 0.15));
      if (TV.ok) {
        const ring = handOn(H, TV.gripRing), pulled = { q: ring.q, w: ring.w.clone().add(new V3(-0.12, -0.02, 0.03)) }, after = over ? F.Lpoint : F.Llow;
        if (t < 0.18) { Lh = hmix(F.Lidle, ring, seg(t, 0, 0.18)); Lc = lerpCurls(C_RELAX, TV.gripRing.c, seg(t, 0.08, 0.18)); }
        else if (t < 0.42) { const k = seg(t, 0.25, 0.4); Lh = hmix(ring, pulled, k); Lc = TV.gripRing.c; pinOff = pulled.w.clone().sub(ring.w).multiplyScalar(k).applyQuaternion(H.q.clone().invert()); }
        else { Lh = hmix(pulled, after, seg(t, 0.42, 0.5)); Lc = lerpCurls(TV.gripRing.c, over ? C_OPEN : C_RELAX, seg(t, 0.42, 0.5)); }
      }
    } else if (N.ph === 'ready') { H = pmix(G_.pres, over ? G_.over : G_.under, seg(t, 0, 0.22)); Lh = F && (over ? F.Lpoint : F.Llow); Lc = over ? C_OPEN : C_RELAX; rx = over ? -0.03 * seg(t, 0, 0.22) : 0.04 * seg(t, 0, 0.22); }
    else if (N.ph === 'throw') {
      const cock = over ? G_.over : G_.under, rel = over ? G_.relO : G_.relU, fol = over ? G_.folO : G_.folU;
      H = t < 0.13 ? pmix(cock, rel, outk(t, 0, 0.13)) : t < 0.38 ? pmix(rel, fol, seg(t, 0.13, 0.38)) : pmix(fol, G_.low, seg(t, 0.38, 0.6));
      open = seg(t, 0.12, 0.2);
      if (F) { Lh = t < 0.2 ? hmix(over ? F.Lpoint : F.Llow, F.Ltuck, seg(t, 0, 0.2)) : hmix(F.Ltuck, F.Lidle, seg(t, 0.3, 0.6)); Lc = C_RELAX; }
      const sw = Math.sin(clamp(t / 0.38, 0, 1) * Math.PI); ry = (over ? 0.16 : 0.08) * sw; rx = over ? 0.1 * sw : -0.05 * sw; pz = -0.03 * sw;
    }
    setH(TV.nadeH, H);
    TV.nade.g.visible = !!N.inHand && P.fragN > 0;
    TV.nade.spoon.visible = !N.spoonOff;
    TV.nade.pin.visible = N.ph === 'idle' || (N.ph === 'pin' && t < 0.42) || (!N.pinOut && N.ph !== 'throw');
    TV.nade.pin.position.copy(pinOff || _ZV);
    if (TV.ok) {
      const rh = TV.nade.g.visible || N.ph === 'throw' ? handOn(H, TV.gripNade) : F.Ridle;
      driveArm(TV.R, rh, TV.nade.g.visible ? Rc : lerpCurls(Rc, C_OPEN, Math.max(open, N.ph === 'idle' ? 1 : 0)), TSH.R, lostR);
      driveArm(TV.L, Lh, Lc, TSH.L, lostL);
    }
  } else if (slot === 2) {
    const C = P.c4 || { ph: 'idle', t: 0, inHand: true }, t = C.t;
    let H = B_.idle, Hr = RM_.idle, open = 0, thumb = 0;
    if (C.ph === 'idle') H = C.draw > 0 ? pmix(B_.low, B_.idle, ez(1 - C.draw / 0.45)) : B_.idle;
    else if (C.ph === 'throw') {
      H = t < 0.1 ? pmix(B_.idle, B_.back, seg(t, 0, 0.1)) : t < 0.17 ? pmix(B_.back, B_.rel, outk(t, 0.1, 0.17)) : t < 0.4 ? pmix(B_.rel, B_.fol, seg(t, 0.17, 0.4)) : pmix(B_.fol, B_.low, seg(t, 0.4, 0.6));
      Hr = t < 0.2 ? pmix(RM_.idle, RM_.tuck, seg(t, 0, 0.2)) : pmix(RM_.tuck, RM_.idle, seg(t, 0.3, 0.6));
      open = seg(t, 0.16, 0.24); const sw = Math.sin(clamp(t / 0.4, 0, 1) * Math.PI); ry = 0.13 * sw; rx = 0.08 * sw; pz = -0.025 * sw;
    } else if (C.ph === 'det') {
      Hr = t < 0.45 ? pmix(RM_.idle, RM_.up, seg(t, 0, 0.1)) : pmix(RM_.up, RM_.idle, seg(t, 0.45, 0.65));
      thumb = t < 0.18 ? seg(t, 0.02, 0.1) : t < 0.36 ? 1 + seg(t, 0.18, 0.28) : 2 - 2 * seg(t, 0.36, 0.5);
    }
    setH(TV.c4H, H); setH(TV.remH, Hr);
    TV.c4.visible = !!C.inHand && P.c4N > 0;
    TV.rem.cover.rotation.x = -1.7 * clamp(C.ph === 'det' ? seg(t, 0.04, 0.12) * (1 - seg(t, 0.45, 0.6)) : 0, 0, 1);
    TV.rem.btn.position.z = 0.017 - 0.0022 * (C.ph === 'det' ? seg(t, 0.26, 0.3) * (1 - seg(t, 0.36, 0.42)) : 0);
    TV.rem.lamp.material.color.setHex(C.ph === 'det' && t > 0.3 && t < 0.5 ? 0xff3010 : c4Mine().length ? 0x2aff40 : 0x0a3a10);
    if (TV.ok) {
      const rh = TV.c4.visible || C.ph === 'throw' ? handOn(H, TV.gripC4) : F.Ridle;
      driveArm(TV.R, rh, TV.c4.visible ? TV.gripC4.c : lerpCurls(TV.gripC4.c, C_OPEN, Math.max(open, C.ph === 'idle' ? 1 : 0)), TSH.R, lostR);
      const lt = (a, b, u) => a.map((v, i) => lerp(v, b[i] || 0, u)), lc = Object.assign({}, TV.gripRem.c);
      lc.thumb = thumb <= 1 ? lt(TV.gripRem.c.thumb, TV.remCover, thumb) : lt(TV.remCover, TV.remPress, thumb - 1);
      driveArm(TV.L, handOn(Hr, TV.gripRem), lc, TSH.L, lostL);
    }
  } else {
    // fists
    const Fs = P.fist || { ph: 'guard', t: 0 }, tt = performance.now() / 1000;
    if (TV.ok) {
      const bob = Math.sin(tt * 5.2) * 0.004, bob2 = Math.sin(tt * 5.2 + 1.8) * 0.004;
      let rh = { q: F.Rguard.q, w: F.Rguard.w.clone().add(new V3(0, bob, 0)) }, lh = { q: F.Lguard.q, w: F.Lguard.w.clone().add(new V3(0, bob2, 0)) };
      if (Fs.ph === 'punch') {
        const k = Fs.t / Fs.dur, ext = k < 0.35 ? outk(k, 0, 0.35) : k < 0.5 ? 1 : 1 - seg(k, 0.5, 1);
        if (Fs.side === 'R') { rh = hmix(rh, F.Rpunch, ext); ry = -0.12 * ext; rz = 0.03 * ext; } else { lh = hmix(lh, F.Lpunch, ext); ry = 0.06 * ext; }
        pz = -0.03 * ext;
      }
      driveArm(TV.R, rh, TV.R.fistC, TSH.R, lostR); driveArm(TV.L, lh, TV.L.fistC, TSH.L, lostL);
    }
  }
  // the same motion a gun rides on: walking bob, mouse sway, look lag, breathing drift, draw, sprint
  const s = P.sprintBlend, mv = P.onGround ? clamp(P.speed / 4.3, 0, 1.7) : 0, bobAmp = (0.007 + 0.01 * s) * mv;
  const bx = Math.sin(P.bobT * 0.5) * bobAmp, by = -Math.abs(Math.cos(P.bobT * 0.5)) * bobAmp, air = P.onGround ? 0 : clamp(-P.vel.y * 0.004, -0.02, 0.02);
  const tb = performance.now() / 1000, still = 1 - s;
  P.aimOX = damp(P.aimOX, 0, 3, dt); P.aimOY = damp(P.aimOY, 0, 3, dt); P.swayX = damp(P.swayX, 0, 8, dt); P.swayY = damp(P.swayY, 0, 8, dt);
  vm.position.set(bx + P.swayX + P.aimOX * 0.06 - 0.03 * s + Math.sin(tb * 0.53) * 0.0018 * still, by + P.swayY - 0.06 * s - P.switchT * 0.7 + air - P.aimOY * 0.04 + Math.sin(tb * 1.55 + 0.6) * 0.0022 * still, 0.02 * s + pz);
  vm.rotation.set(-0.3 * s + P.swayY * 2 - P.aimOY * 0.6 + Math.sin(tb * 1.55) * 0.007 * still + rx, 0.35 * s + P.swayX * 2 - P.aimOX * 0.6 + Math.sin(tb * 0.61 + 2) * 0.007 * still + ry, (P.leanEff || 0) * 0.04 + Math.sin(tb * 0.37) * 0.01 * still + rz);
  vm.visible = !(P.reactV > 0.3);
  vmCamera.position.copy(camera.position); vmCamera.quaternion.copy(camera.quaternion); vmCamera.fov = camera.fov; vmCamera.updateProjectionMatrix();
  vmSun.position.copy(camera.position).addScaledVector(sunDir, 10); vmSun.target.position.copy(camera.position);
  $('scope').style.display = 'none'; $('acog').style.display = 'none'; $('vigads').style.opacity = '0';
}
const _ZV = new V3();
// ---------------------------------------------------------------- fists
// Left button: a jab with the left hand, fast. Right button: a cross with the right, slower, with the hips in it. Reach is
// about arm's length from the eyes. Everything is blunt: bruising, concussion, a broken nose or cracked ribs, a knockout.
function updateFists(dt) {
  const F = P.fist || (P.fist = { ph: 'guard', t: 0, prevR: false });
  F.t += dt;
  const rEdge = mouse.right && !F.prevR; F.prevR = mouse.right;
  if (F.ph === 'guard') {
    if (P.switchT > 0 || !S.locked || P.stun > 0 || P.sprinting) return;
    const lostL = !!P.anat.lost.armL, lostR = !!P.anat.lost.armR;
    if (mouse.left && P.semiReady && !(lostL && lostR)) { P.semiReady = false; startPunch(F, lostL ? 'R' : 'L', lostL ? 0.9 : 0.6); }
    else if (rEdge && !(lostL && lostR)) startPunch(F, lostR ? 'L' : 'R', lostR ? 0.6 : 1);
  } else if (F.ph === 'punch') {
    if (!F.hit && F.t > F.dur * 0.3) { F.hit = true; landPunch(F.pw, F.side); }
    if (F.t >= F.dur) { F.ph = 'guard'; F.t = 0; }
  }
}
function startPunch(F, side, pw) {
  F.ph = 'punch'; F.t = 0; F.side = side; F.pw = pw * rnd(0.9, 1.1); F.dur = side === 'R' && pw > 0.8 ? 0.42 : 0.3; F.hit = false;
  noiseHit(rnd(500, 800), 0.09, 0.03);
}
const _pr = new THREE.Raycaster();
function landPunch(pw, side) {
  const q = camera.quaternion, d = new V3(0, 0, -1).applyQuaternion(q), o = camera.position.clone().add(new V3(side === 'R' ? 0.03 : -0.03, -0.06, 0).applyQuaternion(q));
  const tg = worldMeshes.slice();
  for (const dm of dummies) { if (dm.rag) tg.push(...ragMeshes(dm.rag)); else if (dm.hum.root.visible) { dm.hum.root.updateMatrixWorld(true); tg.push(...dm.hum.hitMeshes.filter(m => m.visible)); } }
  if (S.remotes) for (const r of S.remotes.values()) if (r.hum && r.hum.root.visible && r.alive) tg.push(...r.hum.hitMeshes.filter(m => m.visible));
  for (const r of ragdolls) if (r !== P.rag && (!r.owner || !r.owner.dummy)) tg.push(...ragMeshes(r));
  _pr.set(o, d); _pr.far = 0.82;
  const h = _pr.intersectObjects(tg, false).find(x => !(x.object.userData.grid && gridOpenW(x.object, x.point.clone().addScaledVector(d, 0.01))));
  if (!h) return;
  const ud = h.object.userData, hum = ud.hum;
  P.kick += 0.15 * pw;
  if (hum && (hum.dummy || hum.remote)) {
    const info = hitToFrame(hum, h.object, h.point, d), head = info.frame === 'head';
    noiseHit(rnd(150, 260), 0.07, 0.4 * pw); if (head) noiseHit(rnd(900, 1300), 0.03, 0.12 * pw);
    if (hum.dummy) { const res = hum.dummy.punched(info, d, pw); if (res && res.ko) flashMsg('KNOCKOUT', 900); }
    else net.send({ t: 'punch', id: hum.remote.id, f: info.frame, p: info.e.toArray().map(r4x), wd: d.toArray().map(r4x), pw: Math.round(pw * 100) / 100 });
  } else if (ud.rag) { noiseHit(rnd(150, 240), 0.06, 0.3 * pw); const r = ud.rag; for (let i = 0; i < r.p.length; i++) if (r.p[i].distanceTo(h.point) < 0.35) r.q[i].addScaledVector(d, -0.02 * pw); r.asleep = false; }
  else { noiseHit(rnd(120, 200), 0.05, 0.35 * pw); P.stun = Math.max(P.stun || 0, 0.15); }     // a wall: it stops you dead
}
// someone punched us
function onPunched(m) {
  if (!P.alive || !P.anat || !Array.isArray(m.p)) return;
  const an = P.anat, pw = clamp(Number(m.pw) || 0.6, 0, 1.2); an.lastBy = m.by; if (Array.isArray(m.wd)) an.lastDir.fromArray(m.wd);
  const res = an.blunt(String(m.f), new V3().fromArray(m.p), pw);
  hurtFlash(); noiseHit(rnd(150, 260), 0.07, 0.45 * pw);
  P.pitch = clamp(P.pitch + rnd(0.03, 0.08) * pw, PITCH_MIN, 1.5); P.yaw += rnd(-0.08, 0.08) * pw; P.kick += 0.5 * pw;
  P.stun = Math.max(P.stun || 0, res.winded ? 0.7 : 0.15 * pw);
  if (res.ko) flashMsg('KNOCKED OUT', 1800);
}
// keep a slot in hand at all times: an empty one is fists, and one that fills up while you hold it is taken up
function keepSlot() {
  if (!P.alive) return;
  const empty = n => n < 2 ? P.activeLo[n] == null : toolSlotIndex(n - 2) < 0;
  if (P.slot === 4) {
    if (!(P.emptySel >= 0 && P.emptySel <= 3)) { const k = [0, 1, 2, 3].find(empty); P.emptySel = k === undefined ? 0 : k; }
    if (P.emptySel >= 2 && !empty(P.emptySel) && !P.fist?.hit && (!P.fist || P.fist.ph === 'guard')) pressSlot(P.emptySel);
  }
}
