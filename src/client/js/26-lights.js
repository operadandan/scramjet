// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, scene } from './00-setup.js';
import { colliders } from './01-world.js';
import { _Y } from './04-ragdoll.js';
import { VMW } from './08-hands.js';
import { laserBeam, laserDot } from './09-attachments.js';
import { blip } from './10-audio.js';
import { wmFor } from './16-ballistics.js';
import { P, S } from './17-dummies.js';
import { SFX } from './21b-screenfx.js';
import { ENV, houseLights } from './24-env.js';
// ---- end module links ----
// ---------------------------------------------------------------- the shoulder light, and other players' lights and lasers
// Everyone has a light on the left shoulder strap. It comes on by itself in the dark (night outside, or an unlit room) and goes
// off again in daylight. Other players' shoulder lights, weapon lights and lasers are seen too: a lit cone in the air, the
// light it throws, and the red beam. The lights are a fixed set (adding a light later would rebuild every shader): the
// nearest players who have one on get them.
const SL = { on: false, lvl: 1, chk: 0 };
const shoulderLight = new THREE.SpotLight(0xfff1dc, 0, 32, 0.48, 0.55, 1.6); scene.add(shoulderLight, shoulderLight.target);
const RL_N = 3, remoteLights = [], remoteLasers = [];
const _coneGeo = new THREE.ConeGeometry(1, 1, 18, 1, true); _coneGeo.translate(0, -0.5, 0); _coneGeo.rotateX(-Math.PI / 2);   // (apex at the origin, opening along +z: lookAt aims it)
const _coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
for (let i = 0; i < RL_N; i++) {
  const l = new THREE.SpotLight(0xfff1dc, 0, 30, 0.45, 0.55, 1.6); scene.add(l, l.target);
  const cone = new THREE.Mesh(_coneGeo, _coneMat); cone.visible = false; cone.renderOrder = 4; scene.add(cone);
  remoteLights.push({ l, cone });
  const beam = new THREE.Mesh(laserBeam.geometry, laserBeam.material); beam.visible = false; scene.add(beam);
  const dot = new THREE.Sprite(laserDot.material); dot.visible = false; scene.add(dot); remoteLasers.push({ beam, dot });
}
const _slO = new V3(), _slD = new V3(), _slR = new V3(), _slT = new V3(), _slRay = new THREE.Raycaster();
// how light it is where the player stands: daylight outside, less under a roof, the room lights if they are on
function lightLevel(p) {
  const day = ENV.day !== undefined ? ENV.day : 1, cloud = ENV.cloud || 0;
  const roofed = colliders.some(c => c.min.y > p.y + 1.9 && c.min.y < p.y + 8 && p.x > c.min.x && p.x < c.max.x && p.z > c.min.z && p.z < c.max.z && (c.max.x - c.min.x) > 2.5 && (c.max.z - c.min.z) > 2.5);
  let lvl = day * (1 - cloud * 0.45) * (roofed ? 0.3 : 1);
  if (roofed) for (const l of houseLights) if (l.intensity > 0) { const d = l.position.distanceTo(p); lvl += l.intensity / 7 * clamp(1 - d / 7, 0, 1) * 0.6; }
  return lvl;
}
// H turns the shoulder light on and off (it starts off; it goes off when you die)
function toggleFlashlight() { SL.on = !SL.on; blip(SL.on ? 1500 : 1100, 0.015, 0.03, 'square'); }
function updateLights(dt) {
  if (!P.alive) SL.on = false;
  // ---- mine: on in the dark, off in the light (a little slack either side so it doesn't flicker at the edge)
  const mine = S.mode && P.alive && SL.on && !SFX.spec;
  shoulderLight.intensity = mine ? 60 : 0; shoulderLight.distance = 40;
  if (mine) {
    // on the left shoulder, a little below the eyes, pointing where you look
    camera.getWorldDirection(_slD); _slR.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    _slO.copy(camera.position).addScaledVector(_slR, -0.2).add(_slT.set(0, -0.28, 0));
    shoulderLight.position.copy(_slO); shoulderLight.target.position.copy(_slO).addScaledVector(_slD, 8);
  }
  // ---- everyone else's: the nearest with a light on get the light set; lasers are drawn for anyone in range
  const lit = [], las = [];
  if (S.mode === 'online') for (const r of S.remotes.values()) {
    if (!r.alive || r.rag || !r.st) continue; const d = r.pos.distanceTo(camera.position); if (d > 80) continue;
    if (r.st.fl || r.st.dv === 2) lit.push([d, r]); if (r.st.dv === 1) las.push([d, r]);
  }
  lit.sort((a, b) => a[0] - b[0]); las.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < RL_N; i++) {
    const L = remoteLights[i], e = lit[i];
    if (!e) { L.l.intensity = 0; L.cone.visible = false; continue; }
    const r = e[1], y = r.yaw, pi = r.st.pi || 0, wl = r.st.dv === 2;
    const fw = _slD.set(-Math.sin(y) * Math.cos(pi), Math.sin(pi), -Math.cos(y) * Math.cos(pi)), rt = _slR.set(Math.cos(y), 0, -Math.sin(y));
    // the shoulder (or the muzzle end of the gun, for a weapon light)
    _slO.copy(r.pos).add(_slT.set(0, 1.62 - (r.st.c || 0) * 0.55 - (wl ? 0.12 : 0.28), 0)).addScaledVector(rt, wl ? 0.18 : -0.2).addScaledVector(fw, wl ? 0.55 : 0.1);
    L.l.intensity = wl ? 110 : 60; L.l.distance = 40; L.l.angle = wl ? 0.32 : 0.48; L.l.position.copy(_slO); L.l.target.position.copy(_slO).addScaledVector(fw, 8);
    // the beam itself, seen in the air (longer and plainer in rain and fog)
    const len = 7 + (ENV.fogK || 0) * 6, wdt = Math.tan(L.l.angle) * len * 0.8;
    L.cone.visible = true; L.cone.position.copy(_slO); L.cone.lookAt(_slT.copy(_slO).add(fw)); L.cone.scale.set(wdt, wdt, len);
  }
  _coneMat.opacity = 0.035 + (ENV.fogK || 0) * 0.05;
  for (let i = 0; i < RL_N; i++) {
    const Z = remoteLasers[i], e = las[i];
    if (!e) { Z.beam.visible = Z.dot.visible = false; continue; }
    const r = e[1], y = r.yaw, pi = r.st.pi || 0, fw = _slD.set(-Math.sin(y) * Math.cos(pi), Math.sin(pi), -Math.cos(y) * Math.cos(pi)), rt = _slR.set(Math.cos(y), 0, -Math.sin(y));
    // the dot goes where they aim (it is zeroed to their gun); the beam from the gun is only seen through night vision
    _slO.copy(r.pos).add(_slT.set(0, 1.62 - (r.st.c || 0) * 0.55, 0)).addScaledVector(fw, 0.3);
    _slRay.set(_slO, fw); _slRay.far = 120; _slRay.firstHitOnly = true; const h = _slRay.intersectObjects(wmFor(_slRay), false)[0]; _slRay.firstHitOnly = false;
    const len = h ? h.distance : 120;
    const nvg = P.head === 'nvg' && P.nvgOn, gun = _slT.copy(r.pos).setY(r.pos.y + 1.45 - (r.st.c || 0) * 0.55).addScaledVector(rt, 0.2).addScaledVector(fw, 0.6), end = h ? h.point : _slO.clone().addScaledVector(fw, 120), bl = gun.distanceTo(end), bd = end.clone().sub(gun).normalize();
    Z.beam.visible = nvg; Z.beam.scale.set(1, bl, 1); Z.beam.position.copy(gun).addScaledVector(bd, bl / 2); Z.beam.quaternion.setFromUnitVectors(_Y, bd);
    Z.dot.visible = !!h; if (h) { Z.dot.position.copy(h.point).addScaledVector(fw, -0.01); Z.dot.scale.setScalar(0.03 + len * 0.0015); }
  }
}
// for the state sent to the others: shoulder light on, and whether a laser (1) or weapon light (2) is on
function lightState() { const W = VMW[P.weapon], dev = P.deviceOn && P.slot < 2 && W && W.side !== 'none' ? (W.side === 'laser' ? 1 : 2) : 0; return { fl: SL.on ? 1 : 0, dv: dev }; }

// ---- module exports: build.mjs strips this block ----
export { SL, lightLevel, lightState, remoteLights, toggleFlashlight, updateLights };
// ---- end module exports ----
