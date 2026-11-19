// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, renderer, rnd, scene, sky, sun, sunDir, vmScene, vmSun } from './00-setup.js';
import { colliders } from './01-world.js';
import { noiseHit } from './10-audio.js';
import { pick } from './15-destruction.js';
import { S } from './17-dummies.js';
import { net } from './19-network.js';
// ---- end module links ----
// ---------------------------------------------------------------- time of day and weather
// The sun goes round (a whole day in 24 minutes by default), the sky, the light, its colour and the fog follow it; at night a
// dim blue moonlight is left, and the lights in the house come on. The weather drifts on its own every few minutes between
// clear, cloudy, rain, storm (rain, wind, lightning) and fog, easing from one into the next. Online the host's clock and
// weather are everyone's (sent with each round and whenever the weather turns); the command bar can set either.
const ENV = { tod: 13, rate: 1 / 60, w: 'clear', from: 'clear', k: 1, nextT: 200, flash: 0, thunderT: 0, sendT: 0 };
const WEATHER = {
  clear: { cloud: 0, rain: 0, fog: 0.0011, wind: 0.2 },
  cloudy: { cloud: 0.65, rain: 0, fog: 0.0028, wind: 0.5 },
  rain: { cloud: 0.85, rain: 0.7, fog: 0.006, wind: 0.7 },
  storm: { cloud: 1, rain: 1, fog: 0.009, wind: 1.3 },
  fog: { cloud: 0.55, rain: 0, fog: 0.035, wind: 0.1 }
};
const _hemi = scene.children.find(o => o.isHemisphereLight), _hemiI = _hemi ? _hemi.intensity : 0.25;
const _fogDay = new THREE.Color(0xb4c2cf), _fogNight = new THREE.Color(0x0a0e15), _fogGrey = new THREE.Color(0x8a9096), _sunDay = new THREE.Color(0xfff0d8), _sunLow = new THREE.Color(0xff9a50), _moon = new THREE.Color(0x8fa6d8), _tmpC = new THREE.Color();
const _sunReal = new V3();
// the house lights: always there (a light added later would rebuild every shader), only lit at night
const houseLights = [new THREE.PointLight(0xffd8a0, 0, 16, 1.6), new THREE.PointLight(0xffd8a0, 0, 16, 1.6), new THREE.PointLight(0xffd8a0, 0, 12, 1.6)];
houseLights[0].position.set(-2, 2.5, 2); houseLights[1].position.set(2, 5.5, -2); houseLights[2].position.set(5, 2.5, -3.5);
for (const l of houseLights) scene.add(l);
// rain: streaks in a box that follows the camera
const RAIN_N = 2400, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = rnd(-22, 22), y = rnd(0, 20), z = rnd(-22, 22); rainPos.set([x, y, z, x, y - 0.5, z], i * 6); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0, depthWrite: false });
const rainMesh = new THREE.LineSegments(rainGeo, rainMat); rainMesh.frustumCulled = false; rainMesh.visible = false; scene.add(rainMesh);

const envMix = key => { const a = WEATHER[ENV.from][key], b = WEATHER[ENV.w][key]; return a + (b - a) * ENV.k; };
function envSet(w, now) { if (!WEATHER[w]) return false; if (w !== ENV.w) { ENV.from = now ? w : envCur(); ENV.w = w; ENV.k = now ? 1 : 0; } ENV.nextT = rnd(180, 360); return true; }
// (whatever it is closest to right now, mid-change)
function envCur() { return ENV.k > 0.5 ? ENV.w : ENV.from; }
function envSnap() { return { tod: Math.round(ENV.tod * 1000) / 1000, rate: ENV.rate, w: ENV.w }; }
function envApply(m) {
  if (!m || typeof m !== 'object') return;
  if (Number.isFinite(m.tod)) ENV.tod = ((m.tod % 24) + 24) % 24;
  if (Number.isFinite(m.rate)) ENV.rate = clamp(m.rate, 0, 1);
  if (typeof m.w === 'string' && WEATHER[m.w]) envSet(m.w, false);
}
// the host tells everyone (when the weather turns, or someone with the command bar changed it)
function envShare() { if (S.mode === 'online' && net.mode === 'host' && net.host) net.host.broadcast(Object.assign({ t: 'env' }, envSnap())); }
function updateEnv(dt) {
  const online = S.mode === 'online', client = online && net.mode !== 'host';
  ENV.tod = (ENV.tod + dt * ENV.rate) % 24;
  ENV.k = Math.min(1, ENV.k + dt / 30);
  // the weather moves on by itself (online only the host decides)
  if (!client) { ENV.nextT -= dt; if (ENV.nextT <= 0) { const opts = Object.keys(WEATHER).filter(x => x !== ENV.w), wts = { clear: 3, cloudy: 3, rain: 2, storm: 1, fog: 1 }; let r = Math.random() * opts.reduce((s, x) => s + wts[x], 0), pick = opts[0]; for (const x of opts) { r -= wts[x]; if (r <= 0) { pick = x; break; } } envSet(pick, false); envShare(); } }
  if (online && net.mode === 'host') { ENV.sendT -= dt; if (ENV.sendT <= 0) { ENV.sendT = 30; envShare(); } }
  // the sun: up at 6, highest at 13, down at 20; its height through the day
  const dayA = (ENV.tod - 6.5) / 13.5 * Math.PI, el = Math.sin(dayA) * 62, az = 95 + (ENV.tod - 6.5) / 13.5 * 170;
  _sunReal.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
  const day = clamp((el + 4) / 14, 0, 1), cloud = envMix('cloud'), rain = envMix('rain'), fogD = envMix('fog');
  // the light that casts the shadows: the sun by day, the moon (high, opposite) by night
  if (day > 0.02) sunDir.copy(_sunReal); else sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(az + 180));
  if (sunDir.y < 0.12) { sunDir.y = 0.12; sunDir.normalize(); }
  const low = clamp(1 - el / 25, 0, 1) * day;
  _tmpC.copy(_sunDay).lerp(_sunLow, low * 0.8);
  if (day <= 0.02) _tmpC.copy(_moon);
  sun.color.copy(_tmpC); vmSun.color.copy(_tmpC);
  const sunI = day > 0.02 ? Math.max(0.6, 4.6 * day) * (1 - cloud * 0.72) : 0.6 * (1 - cloud * 0.5);
  ENV.flash = Math.max(0, ENV.flash - dt * 6);
  sun.intensity = sunI + ENV.flash * 6; vmSun.intensity = sunI * 0.74 + ENV.flash * 4;
  if (_hemi) _hemi.intensity = _hemiI * (0.55 + day * 0.45) * (1 + cloud * 0.6) + ENV.flash * 0.6;   // (night is dark, but never too dark to play)
  scene.environmentIntensity = 0.05 + 0.55 * day * (1 - cloud * 0.4); vmScene.environmentIntensity = 0.1 + 0.65 * day * (1 - cloud * 0.4);
  // the sky dome: turbid and grey under cloud, dark at night
  const u = sky.material.uniforms; u.sunPosition.value.copy(_sunReal); u.turbidity.value = 7 + cloud * 13; u.rayleigh.value = 1.8 * (1 - cloud * 0.7) + 0.1;
  renderer.toneMappingExposure = 0.55 * (0.62 + day * 0.38) * (1 - cloud * 0.2) + 0.1 * (1 - day) + ENV.flash * 0.3;
  _tmpC.copy(_fogNight).lerp(_fogDay, day).lerp(_fogGrey, cloud * day * 0.7);
  scene.fog.color.copy(_tmpC); scene.fog.density = fogD;
  // the house lights at dusk
  const lit = clamp(1 - day * 1.4, 0, 1) + cloud * 0.25 * day; for (const l of houseLights) l.intensity = lit * 7;
  // rain round the camera, falling and blown with the wind; not under a roof (it is only drawn outdoors)
  const indoor = rain > 0.02 && colliders.some(c => c.min.y > camera.position.y + 0.3 && c.min.y < camera.position.y + 12 && camera.position.x > c.min.x && camera.position.x < c.max.x && camera.position.z > c.min.z && camera.position.z < c.max.z && (c.max.x - c.min.x) > 3 && (c.max.z - c.min.z) > 3);
  rainMat.opacity = rain * (indoor ? 0.08 : 0.5); rainMesh.visible = rain > 0.02 && S.mode;
  if (rainMesh.visible) {
    const P_ = rainGeo.attributes.position.array, fall = (9 + rain * 4) * dt, wind = envMix('wind') * 2.2 * dt;
    rainMesh.position.set(Math.floor(camera.position.x), 0, Math.floor(camera.position.z));
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6; let y = P_[o + 1] - fall; let x = P_[o] + wind;
      if (y < 0) { y += 20; x = rnd(-22, 22); P_[o + 2] = P_[o + 5] = rnd(-22, 22); } if (x > 22) x -= 44;
      P_[o] = x; P_[o + 1] = y; P_[o + 3] = x - envMix('wind') * 0.12; P_[o + 4] = y - 0.5;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // lightning in a storm: the sky lights up, then the thunder comes after it
  if (envCur() === 'storm' && ENV.k > 0.6 && S.mode) {
    ENV.thunderT -= dt;
    if (ENV.thunderT <= 0) { ENV.thunderT = rnd(8, 25); ENV.flash = 1; const dly = rnd(0.6, 3); setTimeout(() => noiseHit(rnd(60, 110), rnd(1.2, 2.4), 0.25 / (1 + dly * 0.3)), dly * 1000); }
  }
}
const envClock = () => { const h = Math.floor(ENV.tod), m = Math.floor((ENV.tod - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

// ---- module exports: build.mjs strips this block ----
export { ENV, WEATHER, envApply, envClock, envCur, envSet, envShare, envSnap, updateEnv };
// ---- end module exports ----
