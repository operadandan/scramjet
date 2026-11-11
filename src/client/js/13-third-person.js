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
  if (!S.tp) return;
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
  const camF = new V3(); camera.getWorldDirection(camF);
  ray.set(camera.position, camF); ray.far = 1500;
  const tg = bulletTargets(); const h = ray.intersectObjects(tg, false).find(x => x.distance > camera.position.distanceTo(P.eye) + 0.3);
  const T = h ? h.point : camera.position.clone().addScaledVector(camF, 1500);
  const origin = P.eye.clone().addScaledVector(camF, 0.35);
  return { origin, dir: T.sub(origin).normalize() };
}
