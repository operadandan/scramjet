// ---------------------------------------------------------------- third person (Left Alt)
let localVis = null;
function tpBody() { if (!localVis) { const id = S.myId || 0; localVis = new Humanoid(Object.assign({ skin: SKINS[id % SKINS.length] }, PALS[id % PALS.length])); scene.add(localVis.root); } return localVis; }
function updateTPBody(dt) {
  if (!localVis && !S.tp) return;
  const show = S.tp && S.mode && P.alive && !P.downed;
  if (!show) { if (localVis) localVis.root.visible = false; return; }
  const lv = tpBody(); lv.root.visible = true;
  lv.root.position.copy(localBody.root.position); lv.root.rotation.y = localBody.root.rotation.y;
  Object.assign(lv.anim, localBody.anim);
  lv.setLost(P.anat.lostMask(), P.anat.cutArr());
  setHelmet(lv, P.anat.helmetOn);
  lv.update(dt);
}
// over-the-shoulder camera, pulled in when something is in the way
function tpCamera() {
  P.eye = (P.eye || new V3()).copy(camera.position);
  P.eyeQ = (P.eyeQ || new THREE.Quaternion()).copy(camera.quaternion);
  if (!S.tp || S.bodycam) return;   // the body cam is placed after the body has moved (bodyCam)
  const back = new V3(0, 0, 1).applyQuaternion(camera.quaternion), right = new V3(1, 0, 0).applyQuaternion(camera.quaternion);
  const want = camera.position.clone().addScaledVector(back, 2.2 - 1.0 * P.ads).addScaledVector(right, 0.55 - 0.15 * P.ads).add(new V3(0, 0.12, 0));
  const d = want.clone().sub(camera.position), len = d.length(); d.normalize();
  ray.set(camera.position, d); ray.far = len;
  const h = ray.intersectObjects(worldMeshes, false)[0];
  camera.position.copy(h ? camera.position.clone().addScaledVector(d, Math.max(0.2, h.distance - 0.2)) : want);
  camera.fov = lerp(72, 52, P.ads); camera.updateProjectionMatrix();
}
// where a third-person shot goes: from the eyes toward whatever is under the centre of the screen
function tpAim() {
  const camF = new V3(); if (S.bodycam && P.eyeQ) camF.set(0, 0, -1).applyQuaternion(P.eyeQ); else camera.getWorldDirection(camF);
  if (S.bodycam) camera.position.copy(P.eye);   // shots go from the eyes along where you look, not from the chest
  try {
  ray.set(camera.position, camF); ray.far = 1500;
  const tg = bulletTargets(); const h = ray.intersectObjects(tg, false).find(x => x.distance > camera.position.distanceTo(P.eye) + 0.3);
  const T = h ? h.point : camera.position.clone().addScaledVector(camF, 1500);
  const origin = P.eye.clone().addScaledVector(camF, 0.35);
  return { origin, dir: T.sub(origin).normalize() };
  } finally { if (S.bodycam) camera.position.copy(BCAM.pos); }
}
// ---------------------------------------------------------------- body cam
// A camera clipped to the middle of the chest: it goes wherever the torso goes (every step, twist and lean), sees the arms
// and the gun from below, and has the wide, barrel-bent lens, dark corners and grain of real body-worn footage. You still
// aim with your eyes: where you are looking shows as a small dot.
const BCAM = { pos: new V3(), q: new THREE.Quaternion(), tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)), K: 0.2 };
const _bcF = new V3(), _bcE = new V3(), _bcQ = new THREE.Quaternion();
function bodyCam() {
  if (!S.bodycam || !S.mode || !P.alive || P.downed || !localBody) return false;
  const sp = localBody.spine; localBody.root.updateMatrixWorld(true);
  sp.localToWorld(BCAM.pos.fromArray(BCAM.off || [0, 0.29, -0.16]));
  // the chest is turned off the line of fire in a rifle stance (bladed ~25 deg); a vest-mounted camera is worn squared to
  // the front and the shoulders square up to what you look at, so the heading is pulled most of the way to the gaze. The
  // torso's own pitch, roll and every bounce of the stride stay in.
  sp.getWorldQuaternion(BCAM.q);
  const f = _bcF.set(0, 0, -1).applyQuaternion(BCAM.q), e = _bcE.set(0, 0, -1).applyQuaternion(P.eyeQ || BCAM.q);
  const dy = Math.atan2(-e.x, -e.z) - Math.atan2(-f.x, -f.z), dyw = Math.atan2(Math.sin(dy), Math.cos(dy));
  BCAM.q.premultiply(_bcQ.setFromAxisAngle(_Y, dyw * 0.8)).multiply(BCAM.tilt);
  camera.position.copy(BCAM.pos); camera.quaternion.copy(BCAM.q);
  camera.fov = 84; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return true;
}
// where the aim point lands on the bent picture: project it, then undo the lens (q = p (1 - K + K r^2), solved for p)
function bodyCamDot(el) {
  if (!P.eyeQ) return;
  const f = new V3(0, 0, -1).applyQuaternion(P.eyeQ), q = P.eye.clone().addScaledVector(f, 30).project(camera);
  if (q.z > 1) { el.style.display = 'none'; return; }
  const asp = innerWidth / innerHeight, K = BCAM.K; let px = q.x, py = q.y;
  for (let i = 0; i < 6; i++) { const r2 = px * px + (py / asp) * (py / asp); const s_ = 1 - K + K * r2; px = q.x / s_; py = q.y / s_; }
  el.style.left = ((px + 1) / 2 * 100) + '%'; el.style.top = ((1 - py) / 2 * 100) + '%';
}
