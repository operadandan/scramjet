// ---------------------------------------------------------------- camera / viewmodel
const camTarget = new V3(), _camQ = new THREE.Quaternion(), _camE = new THREE.Quaternion(), _camEu = new THREE.Euler();
function updateCamera(dt) {
  if (!S.mode || (!P.alive && !P.rag)) {
    const t = performance.now() / 1000 * 0.05;
    camera.position.set(Math.cos(t) * 42, 17, Math.sin(t) * 42); camera.lookAt(0, 1.5, 0);
    camera.fov = 70; camera.updateProjectionMatrix();
    return;
  }
  if (!P.alive || P.downed) {
    // first person from the ragdoll's own head: the view goes where the head goes, the mouse only shifts the eyes a little
    const rg = P.rag; rg.headG.visible = false;
    _camQ.copy(rg.headG.quaternion).multiply(_camE.setFromEuler(_camEu.set(P.lookY + 0.12, P.lookX, 0, 'YXZ')));
    camera.quaternion.slerp(_camQ, 1 - Math.exp(-10 * dt));
    camTarget.copy(rg.p[0]).add(_a.set(0, 0.06, -0.07).applyQuaternion(rg.headG.quaternion)); camTarget.y = Math.max(0.09, camTarget.y);
    camera.position.lerp(camTarget, 1 - Math.exp(-18 * dt));
    camera.fov = 80; camera.updateProjectionMatrix();
    return;
  }
  const h = standHeight(), eye = h - 0.14;
  const head = new V3(P.pos.x, P.pos.y + eye, P.pos.z);
  const right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  if (P.prone > 0.01) {
    const fwd = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    let f = 0.75 * P.prone; while (f > 0 && pointBlocked(head.clone().addScaledVector(fwd, f), 0.12)) f -= 0.05;
    head.addScaledVector(fwd, Math.max(0, f));
  }
  const an = P.anat, shake = an.pain * 0.004 + (P.supp || 0) * 0.01 + an.concussion * 0.006 + (an.blood < 3500 ? (3500 - an.blood) / 1000 * 0.004 : 0);
  let s = 1;
  if (Math.abs(P.lean) > 0.01) {
    for (s = 1; s > 0; s -= 0.1) { const t = head.clone().addScaledVector(right, P.lean * 0.42 * s); t.y -= Math.abs(P.lean) * 0.08 * s; if (!pointBlocked(t, 0.18)) break; }
    s = Math.max(0, s);
  }
  P.leanEff = P.lean * s;
  const mv = P.onGround ? clamp(P.speed / 4.3, 0, 1.7) : 0;
  P.bobT += dt * (5 + P.speed * 1.4) * (mv > 0.05 ? 1 : 0);
  const bob = 0.035 * mv * (1 - P.ads * 0.8);
  camera.position.copy(head).addScaledVector(right, P.leanEff * 0.42 + Math.sin(P.bobT * 0.5) * bob * 0.5);
  camera.position.y += -Math.abs(P.leanEff) * 0.08 + Math.abs(Math.sin(P.bobT)) * bob * -0.6;
  const tt = performance.now() / 1000;
  const rlB = P.reloading ? Math.sin(P.reloadT / P.reloadDur * Math.PI) : 0;
  camera.rotation.set(P.pitch + P.recoilPitch - rlB * 0.03 + Math.sin(tt * 3.1) * shake, P.yaw + Math.sin(tt * 2.3) * shake, -P.leanEff * 0.22);
  const w = WEAPONS[P.weapon];
  const zW = VMW[P.weapon], mag = zW && zW.lens; camera.fov = lerp(75, mag ? (w.scope ? 52 : 60) : w.fovAds, P.ads) + P.sprintBlend * 4; camera.updateProjectionMatrix();
}
const _vt = new V3(), _wr = new V3(), _fd = new V3();
function updateViewmodel(dt) {
  const W = VMW[P.weapon], w = WEAPONS[P.weapon];
  VMW.forEach((v, i) => { v.g.visible = P.slot < 2 && i === P.weapon; }); VMK.g.visible = P.slot === 2; VMP.g.visible = P.slot === 3;
  if (P.slot === 4) { $('scope').style.display = 'none'; $('acog').style.display = 'none'; $('vigads').style.opacity = '0'; return; }
  if (P.slot === 3) {
    vm.visible = true; $('scope').style.display = 'none'; $('acog').style.display = 'none';
    const k = P.plating ? P.plateT / PLATE_TIME : 0, out = ramp(k, 0.1, 0.45), back = ramp(k, 0.55, 0.95), s2 = P.sprintBlend;
    vm.position.set(VMP.hip.x + P.swayX + Math.sin(P.bobT * 0.5) * 0.008 * Math.min(1, P.speed / 4), VMP.hip.y + P.swayY - P.switchT * 0.7 - 0.25 * out + 0.25 * back - 0.05 * s2, VMP.hip.z + 0.1 * out - 0.1 * back);
    vm.rotation.set(-0.3 * s2 - P.aimOY * 0.5 + 0.9 * out - 0.9 * back, -P.aimOX * 0.5, 0);
    VMP.plate.visible = P.platesInv > 0 || P.plating;
    P.aimOX = damp(P.aimOX, 0, 3, dt); P.aimOY = damp(P.aimOY, 0, 3, dt); P.swayX = damp(P.swayX, 0, 8, dt); P.swayY = damp(P.swayY, 0, 8, dt);
    vmCamera.position.copy(camera.position); vmCamera.quaternion.copy(camera.quaternion); vmCamera.fov = camera.fov; vmCamera.updateProjectionMatrix();
    vmSun.position.copy(camera.position).addScaledVector(sunDir, 10); vmSun.target.position.copy(camera.position);
    $('vigads').style.opacity = '0';
    return;
  }
  if (P.slot === 2) {
    vm.visible = true; $('scope').style.display = 'none'; $('acog').style.display = 'none';
    const tt = performance.now() / 1000, hk = P.healing ? 1 : 0, s2 = P.sprintBlend;
    vm.position.set(VMK.hip.x + P.swayX + Math.sin(P.bobT * 0.5) * 0.008 * Math.min(1, P.speed / 4), VMK.hip.y + P.swayY - P.switchT * 0.7 - 0.06 * hk + Math.sin(tt * 9) * 0.006 * hk - 0.05 * s2, VMK.hip.z + 0.06 * hk);
    vm.rotation.set(0.35 * hk - 0.3 * s2 - P.aimOY * 0.5, -P.aimOX * 0.5 + Math.sin(tt * 6) * 0.05 * hk, Math.sin(tt * 4) * 0.04 * hk);
    VMK.flap.rotation.x = -1.2 * hk; VMK.flap.position.z = -0.03 * hk;
    P.aimOX = damp(P.aimOX, 0, 3, dt); P.aimOY = damp(P.aimOY, 0, 3, dt); P.swayX = damp(P.swayX, 0, 8, dt); P.swayY = damp(P.swayY, 0, 8, dt);
    vmCamera.position.copy(camera.position); vmCamera.quaternion.copy(camera.quaternion); vmCamera.fov = camera.fov; vmCamera.updateProjectionMatrix();
    vmSun.position.copy(camera.position).addScaledVector(sunDir, 10); vmSun.target.position.copy(camera.position);
    $('vigads').style.opacity = '0';
    return;
  }
  const a = P.ads, s = P.sprintBlend, t = _vt.copy(W.hip).lerp(W.ads, a);
  const mv = P.onGround ? clamp(P.speed / 4.3, 0, 1.7) : 0;
  const bobAmp = (0.007 + 0.01 * s) * mv * (1 - a * 0.88);
  const bx = Math.sin(P.bobT * 0.5) * bobAmp, by = -Math.abs(Math.cos(P.bobT * 0.5)) * bobAmp;
  const r = P.reloading ? P.reloadT / P.reloadDur : 0, b = P.reloading && !(w.pellets && P.sgPhase !== 'load') ? Math.sin(r * Math.PI) * (w.pellets ? 0.45 : 1) : 0;
  const ik = P.inspecting ? P.inspectT / w.inspect : 0;
  const ib = P.inspecting ? ramp(ik, 0, 0.18) * (1 - ramp(ik, 0.82, 1)) : 0;
  const air = P.onGround ? 0 : clamp(-P.vel.y * 0.004, -0.02, 0.02);
  P.aimOX = damp(P.aimOX, 0, 3, dt); P.aimOY = damp(P.aimOY, 0, 3, dt);
  const ao = 1 - a * 0.93;
  W.L.h.visible = W.L.fa.visible = !P.anat.lost.armL; if (W.rh) W.rh.visible = !P.anat.lost.armR;
  const scoped = (!!w.scope || W.zoom > 1) && a > 0.86;
  vm.visible = true; $('scope').style.display = 'none'; $('acog').style.display = 'none';
  vm.position.set(
    t.x + bx + P.swayX - 0.05 * s + P.aimOX * 0.06 * ao - 0.02 * ib,
    t.y + by + P.swayY - 0.05 * s - 0.03 * b - P.switchT * 0.7 + air - P.aimOY * 0.04 * ao + 0.02 * ib,
    t.z + P.kick * 0.05 * (1 - a * 0.4) + 0.03 * s + 0.03 * ib);
  vm.rotation.set(
    P.kick * 0.09 * (1 - a * 0.6) - 0.35 * s - 0.12 * b + P.swayY * 2 * ao - P.aimOY * ao + 0.06 * ib,
    0.6 * s + P.swayX * 2 * ao - P.aimOX * ao + 0.08 * ib + 0.12 * b,
    0.35 * b + P.leanEff * 0.04 * (1 - a) + 0.18 * ib);
  { const tt = performance.now() / 1000, an = P.anat, sh = (an.anyArm() ? 0.02 : 0) + an.pain * 0.008 + (an.blood < 3500 ? 0.01 : 0) + (P.supp || 0) * 0.014;
    vm.rotation.x += Math.sin(tt * 6.3) * sh; vm.rotation.y += Math.sin(tt * 4.7 + 1) * sh; vm.position.x += Math.sin(tt * 3.9) * sh * 0.3; }
  // left hand + magazine choreography
  const L = W.L;
  let seq = null, st = 0;
  if (P.reloading) { seq = P.rlSeq || (P.reloadEmpty ? SEQ.empty : SEQ.tac); st = r; } else if (P.inspecting) { seq = SEQ.inspect; st = ik; }
  if (seq) poseAt(W, seq, st, L.h.position, L.h.quaternion);
  else { L.h.position.copy(W.poses.H0.p); L.h.quaternion.copy(W.poses.H0.q); }
  { const vfg = !!W.vfgHand && W.vfgOn && !seq && !P.anat.lost.armL; if (W.vfgHand) W.vfgHand.visible = vfg; if (vfg) L.h.visible = L.fa.visible = false; }
  P.rlJ = damp(P.rlJ || 0, 0, 9, dt);
  if (P.reloading) {
    // stress: hands tremble and the rifle wanders while it is being fed
    const tt = performance.now() / 1000 + (P.rlSeed || 0), sk = 0.6 + P.anat.pain * 1.5 + (P.stamina < 40 ? 0.6 : 0) + (P.anat.blood < 4000 ? 0.5 : 0), a2 = 0.0016 * sk;
    L.h.position.x += Math.sin(tt * 23) * a2; L.h.position.y += Math.sin(tt * 29 + 1) * a2; L.h.position.z += Math.sin(tt * 19 + 2) * a2;
    vm.rotation.z += b * (Math.sin(tt * 2.3) * 0.05 + Math.sin(tt * 13.1) * 0.006 * sk); vm.rotation.x += b * (Math.sin(tt * 1.7 + 2) * 0.03 + Math.sin(tt * 15.7) * 0.005 * sk);
    vm.position.y += b * Math.sin(tt * 3.1) * 0.006; vm.position.x += b * Math.sin(tt * 2.1 + 1) * 0.006;
  }
  vm.rotation.x -= P.rlJ * 0.035; vm.position.y += P.rlJ * 0.006;
  const held = seq && inRanges(seq.held, st), hidden = seq && inRanges(seq.hidden, st);
  if (held) { W.mag.position.copy(W.magLocal).applyQuaternion(L.h.quaternion).add(L.h.position); W.mag.quaternion.copy(L.h.quaternion).multiply(W.magQLocal); }
  else { W.mag.position.copy(W.magBase); W.mag.quaternion.copy(W.magQBase); }
  W.mag.visible = !hidden && (!w.pellets || !!held);
  W.brass.visible = !!held && ((P.guns[P.weapon] ? P.guns[P.weapon].mag > 0 : true) || (P.reloading && r > 0.4));
  // pump gun: the forend, action bars and bolt ride back together, and the support hand goes with them
  if (w.pellets) {
    let k = pumpCurve(performance.now() / 1000 - P.lastShot);
    if (P.reloading && P.sgPhase === 'rack') k = pumpCurve(0.13 + (r - P.rlSeq.rack) * P.reloadDur * 0.95);
    else if (P.reloading) k = 0;
    W.pumpK = k; if (!seq || P.sgPhase === 'rack') L.h.position.z += W.boltTravel * k;
  }
  _wr.copy(L.wrist).applyQuaternion(L.h.quaternion).add(L.h.position);
  _fd.subVectors(_wr, W.elbow); const fl = _fd.length();
  L.fa.position.addVectors(_wr, W.elbow).multiplyScalar(0.5);
  L.fa.quaternion.setFromUnitVectors(_Y, _fd.multiplyScalar(1 / fl));
  L.fa.scale.set(1, fl, 1);
  if (W.chg) W.chg.position.z = (P.reloading && P.reloadEmpty) ? 0.0 : 0;
  if (W.slide) W.slide.position.z = P.slideBack;
  W.boltK = Math.max(0, W.boltK - dt / 0.075);
  if (W.bolt) {
    const G = P.guns[P.weapon], rr = P.reloading ? P.reloadT / P.reloadDur : 0;
    const locked = W.id !== 'ak74' && !w.pellets && G && G.mag === 0 && !G.chamber && !(P.reloading && P.reloadEmpty && rr > 0.86);
    const pull = W.id === 'ak74' && P.reloading && P.reloadEmpty && rr > 0.78 && rr < 0.885 ? ramp(rr, 0.78, 0.82) : 0;
    let k = Math.max(locked ? 1 : 0, pull, Math.sin(Math.min(1, W.boltK) * Math.PI));
    // pump gun: the forend, action bars and bolt ride back together, and the support hand goes with them
    if (w.pellets) { k = W.pumpK; if (W.boltIn) W.boltIn.scale.z = 1 - 0.85 * k; }
    if (W.boltMode === 'scale') W.bolt.scale.z = 1 - 0.82 * k; else W.bolt.position.z = W.boltTravel * k;
  }
  // a hot barrel keeps smoking after a long string of shots
  W.heat = Math.max(0, W.heat - dt * 4);
  const sinceShot = performance.now() / 1000 - P.lastShot;
  // a short wisp off a hot barrel right after a burst, gone within about a second and a half
  if (W.heat > 3 && !S.tp && sinceShot > 0.3 && sinceShot < 1.5) { W.wispT = (W.wispT || 0) - dt; if (W.wispT <= 0) { W.wispT = 0.07; smoke(W.muzzle.getWorldPosition(new V3()), new V3(rnd(-0.03, 0.03), 0.22, rnd(-0.03, 0.03)), 0.05, 0.9, Math.min(0.14, (W.heat - 3) * 0.03), 0xdedbd4); } }
  if (W.ret) { const op = ramp(a, 0.85, 1); W.ret.material.opacity = op; W.ret.visible = op > 0.01; }
  P.swayX = damp(P.swayX, 0, 8, dt); P.swayY = damp(P.swayY, 0, 8, dt);
  vmCamera.position.copy(camera.position); vmCamera.quaternion.copy(camera.quaternion);
  vmCamera.fov = camera.fov; vmCamera.updateProjectionMatrix();
  vmSun.position.copy(camera.position).addScaledVector(sunDir, 10); vmSun.target.position.copy(camera.position);
  $('vigads').style.opacity = String(a * 0.85);
}

// ---------------------------------------------------------------- HUD
const bodyPanel = makeBodyPanel($('bodyui'), 'CONDITION'), targetPanel = makeBodyPanel($('targetui'), 'TARGET');
function updateHUD() {
  const w = WEAPONS[P.weapon];
  $('wname').textContent = P.downed ? (P.anat.paralyzed ? 'PARALYZED' : 'UNCONSCIOUS') : P.slot === 2 ? 'MEDKIT x' + P.medUses : P.slot === 3 ? 'ARMOR PLATE x' + P.platesInv : P.slot === 4 ? 'UNARMED' : w.name + (P.anat.anyArm() ? '  (ARM DISABLED)' : '');
  if (P.downed) $('downwhy').textContent = P.anat.paralyzed ? 'Spinal cord injury. You will not get up.' : 'You blacked out from the pain. You may come to if it eases (pain ' + Math.round(P.anat.painLvl) + ').';
  if (!P.alive || P.downed || P.slot >= 2) { $('scope').style.display = 'none'; $('acog').style.display = 'none'; }
  bodyPanel.update(P.alive ? P.anat : null, P.prone > 0.5 ? (P.anat.bothLegs() ? 'Legs out: crawling' : 'Prone') : '');
  if (S.mode === 'test' && S.target && S.showTarget) targetPanel.update(S.target.anat, 'Target: ' + S.target.label + (S.target.dead ? ' (dead: ' + (DEATH_TEXT[S.target.anat.cause] || '') + ')' : ''));
  else targetPanel.update(null);
  const an = P.anat, loss = clamp((5000 - an.blood) / 2500, 0, 1);
  const dn = P.alive && P.downed, tn = performance.now() / 1000;
  $('downfx').style.display = dn ? 'block' : 'none';
  const sup = P.alive ? (P.supp || 0) : 0, mf = dn ? 380 : sup > 0.45 ? 2600 : 20000;
  $('suppv').style.opacity = String(Math.min(0.95, sup * 0.9));
  if (aMaster && mf !== S.muff) { S.muff = mf; aMaster.frequency.setTargetAtTime(mf, actx.currentTime, 0.25); }
  if (dn && tn - (S.beatT || 0) > 1.05) { S.beatT = tn; blip(58, 0.14, 0.5, 'sine'); setTimeout(() => blip(50, 0.16, 0.35, 'sine'), 230); }
  $('downblink').style.opacity = dn ? String(Math.min(0.92, Math.pow(Math.max(0, Math.sin(tn * 0.55)), 6) * (0.55 + loss * 0.5))) : '0';
  const filt = (sup > 0.15 && !dn ? 'blur(' + (Math.round(sup * 3) / 2) + 'px) saturate(' + (1 - sup * 0.5).toFixed(1) + ') ' : '') + (dn ? 'grayscale(0.6) sepia(0.35) hue-rotate(-25deg) contrast(1.15) brightness(0.8) blur(' + (1 + Math.round((1 + Math.sin(tn * 1.3)) * 2) / 2) + 'px) ' : '') + (loss > 0.05 ? 'grayscale(' + (loss * 0.85).toFixed(2) + ') brightness(' + (1 - loss * 0.4).toFixed(2) + ') ' : '') + (an.concussion > 0 ? 'blur(' + (an.concussion * 1.5).toFixed(1) + 'px) ' : '') + (S.slow ? 'saturate(0.55) contrast(1.08)' : '');
  if (filt !== S.filt) { S.filt = filt; renderer.domElement.style.filter = filt; }
  $('stb').style.width = P.stamina + '%'; $('stb').style.background = P.staminaLock ? '#ff9a4a' : '#7fc4ff';
  if (S.mode === 'online') $('info').textContent = 'ROOM ' + S.room + '   |   ' + (S.remotes.size + 1) + ' PLAYERS' + (!net.ready() ? '   |   CONNECTING' : '') + (net.mode === 'host' ? '   |   HOSTING' : '');
  else $('info').textContent = 'TESTING MODE (temporary)';
}

// ---------------------------------------------------------------- input
function toggleAds() { if (!P.alive || P.sprinting) return; P.adsOn = !P.adsOn; if (P.adsOn) P.inspecting = false; }
addEventListener('keydown', e => {
  if (!S.mode || document.activeElement.tagName === 'INPUT') return;
  if (S.inv) { if (e.code === 'KeyR' && !e.repeat) dragRotate(); if (!e.repeat && (e.code === 'KeyG' || e.code === 'Escape')) closeInv(); if (e.code === 'Space' && P.downed && P.alive) { P.anat.kill('gaveup'); localDeath(); } return; }
  if (e.code === 'KeyG' && !e.repeat && P.alive) { openInv(); return; }
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (e.code === 'Tab') { renderScore(); $('score').style.display = 'block'; }
  if (e.repeat) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyM') startInspect();
  if (e.code === 'AltLeft' && !e.repeat) { e.preventDefault(); S.tp = !S.tp; blip(500, 0.03, 0.03); }
  if (e.code === 'KeyF') pickUp();
  if (e.code === 'KeyB') dropHeld();
  if (S.mode === 'test' && e.code === 'KeyN') suppress(0.8, 900);
  if (e.code === 'KeyT') { P.deviceOn = !P.deviceOn; noiseHit(3000, 0.02, 0.04); }
  if (e.code === 'KeyZ') toggleAds();
  if (e.code === 'Backquote') { S.slow = !S.slow; $('slowmo').style.display = S.slow ? 'block' : 'none'; }
  if (e.code === 'KeyQ') P.leanState = P.leanState === -1 ? 0 : -1;
  if (e.code === 'KeyE') P.leanState = P.leanState === 1 ? 0 : 1;
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'Digit3' && toolSlotIndex(0) >= 0) switchWeapon(toolSlotIndex(0));
  if (e.code === 'Digit4' && toolSlotIndex(1) >= 0) switchWeapon(toolSlotIndex(1));
  if (e.code === 'Space' && P.alive && P.downed && !e.repeat) { P.anat.kill('gaveup'); localDeath(); }
  if (e.code === 'KeyC' && P.alive && !P.anat.bothLegs()) P.stance = P.stance === 1 ? 0 : 1;
  if (e.code === 'KeyX' && P.alive && !P.anat.bothLegs()) { P.stance = P.stance === 2 ? 0 : 2; if (P.stance === 2) P.leanState = 0; }
  if (S.mode === 'test' && e.code === 'KeyH') testSelfHit();
  if (S.mode === 'test' && e.code === 'KeyK') testDeath(true);
  if (S.mode === 'test' && e.code === 'KeyJ') testDeath(false);
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') $('score').style.display = 'none'; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.left = false; });
renderer.domElement.addEventListener('mousedown', e => {
  if (!S.mode) return;
  if (!S.locked) { renderer.domElement.requestPointerLock(); return; }
  audio();
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) toggleAds();
});
addEventListener('mouseup', e => { if (e.button === 0) { mouse.left = false; P.semiReady = true; } });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!S.locked) return;
  if (!P.alive || P.downed) { P.lookX = clamp(P.lookX - e.movementX * 0.0012, -0.55, 0.55); P.lookY = clamp(P.lookY - e.movementY * 0.0012, -0.4, 0.4); return; }
  const zl = P.slot < 2 && VMW[P.weapon] && VMW[P.weapon].lens; const sens = 0.0022 * (camera.fov / 75) * lerp(1, 0.85, P.ads) * (zl ? lerp(1, 1.5 / zl.userData.zoom, P.ads) : 1);
  P.yaw -= e.movementX * sens; P.pitch = clamp(P.pitch - e.movementY * sens, -1.5, 1.5);
  P.swayX = clamp(P.swayX - e.movementX * 0.00003, -0.02, 0.02); P.swayY = clamp(P.swayY + e.movementY * 0.00003, -0.02, 0.02);
  P.aimOX = clamp(P.aimOX + e.movementX * 0.0012, -0.08, 0.08); P.aimOY = clamp(P.aimOY + e.movementY * 0.0012, -0.06, 0.06);
});
addEventListener('wheel', e => { if (S.mode && S.locked) switchWeapon((P.slot + (e.deltaY > 0 ? 1 : 2)) % 3); });
document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === renderer.domElement;
  $('pause').style.display = (!S.locked && S.mode && !S.inv) ? 'flex' : 'none';
  if (!S.locked) { mouse.left = false; for (const k in keys) keys[k] = false; }
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix();
});

