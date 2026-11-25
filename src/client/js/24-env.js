// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, renderer, rnd, scene, sky, sun, sunDir, vmScene, vmSun } from './00-setup.js';
import { colliders, worldMeshes } from './01-world.js';
import { HOUSE, TOWN, lampMat } from './01b-town.js';
import { TREE_T, updateBirds } from './01d-town-surround.js';
import { noiseHit } from './10-audio.js';
import { PMAT, particles } from './11-fx.js';
import { pick } from './15-destruction.js';
import { P, S } from './17-dummies.js';
import { net } from './19-network.js';
// ---- end module links ----
// ---------------------------------------------------------------- time of day and weather
// The sun goes round (a whole day in an hour by default; the house map starts every round at dawn, in the rain), the sky, the light, its colour and the fog follow it; at night a
// dim blue moonlight is left, and the lights in the house come on. The weather drifts on its own every few minutes between
// clear, cloudy, rain, storm (rain, wind, lightning) and fog, easing from one into the next. Online the host's clock and
// weather are everyone's (sent with each round and whenever the weather turns); the command bar can set either.
const ENV = { tod: 6.4, rate: 1 / 150, w: 'rain', from: 'rain', k: 1, nextT: 200, flash: 0, thunderT: 0, sendT: 0 };
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
// (one per room the map puts a lamp in: TOWN.lamps; the rest stay dark)
// Only the few lamps nearest the camera get a real light (every light in the scene is paid for by every lit pixel, lit or not:
// fourteen of them made the inside of the house the most expensive thing in the game to draw). The rest still glow (their
// shades are emissive); a lamp coming into or leaving the nearest few fades rather than pops.
const HL_N = 3, _hlW = new Map(), _hlS = [];
const houseLights = []; for (let i = 0; i < HL_N; i++) { const l = new THREE.PointLight(0xffd8a0, 0, 12, 1.6); l.position.set(0, -50, 0); scene.add(l); houseLights.push(l); }
// (the lamp shades' glowing material, lampMat, is in 01b-town: the map is built before this file runs)
// rain: streaks in a box that follows the camera
const RAIN_N = 2400, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = rnd(-22, 22), y = rnd(0, 20), z = rnd(-22, 22); rainPos.set([x, y, z, x, y - 0.5, z], i * 6); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0, depthWrite: false });
const rainMesh = new THREE.LineSegments(rainGeo, rainMat); rainMesh.frustumCulled = false; rainMesh.visible = false; scene.add(rainMesh);

// ---- the cloud deck: a layer of drifting cloud high over the map, thin and broken when it is cloudy, a low, heavy, dark
// overcast in rain and a storm (lit from inside where lightning goes off). It follows the camera and fades into the haze
// toward the horizon
const CLOUD_Y = 340, cloudMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uCover: { value: 0 }, uDark: { value: 0 }, uSun: { value: new V3(0, 1, 0) }, uLit: { value: new THREE.Color() }, uBase: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uOp: { value: 0 }, uFlash: { value: 0 }, uFP: { value: new THREE.Vector2() }, uWind: { value: new THREE.Vector2(1, 0.3) } },
  vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW; uniform float uT, uCover, uDark, uOp, uFlash; uniform vec3 uSun, uLit, uBase, uHaze; uniform vec2 uFP, uWind;
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float a = 0.5, s = 0.0; mat2 r = mat2(0.8, 0.6, -0.6, 0.8); for (int i = 0; i < 6; i++) { s += a * vn(p); p = r * p * 2.03 + 1.7; a *= 0.5; } return s; }
    void main() {
      vec2 q = vW.xz * 0.0019 + uWind * uT * 0.004;
      // big shapes, then the billowing detail on their edges, drifting a little faster
      float n = fbm(q) * 0.65 + fbm(q * 2.7 + uWind * uT * 0.006) * 0.35;
      float th = 1.0 - uCover, c = smoothstep(th - 0.06, th + 0.26, n);
      if (c < 0.003) discard;
      // light: thinner toward the sun-facing edge, thick and dark in the middle and underneath
      float n2 = fbm(q + uSun.xz * 0.05) * 0.65 + fbm((q + uSun.xz * 0.05) * 2.7 + uWind * uT * 0.006) * 0.35;
      float lit = clamp(0.5 + (n - n2) * 2.6, 0.0, 1.0), dens = smoothstep(th - 0.1, th + 0.6, n);
      // thick cloud is dark underneath, thin cloud lets the light through; rain cloud is a low ragged deck, darker in its
      // heavy cells and torn lighter between them
      vec3 col = mix(uLit, uBase, dens * 0.85); col = mix(col, uLit * 1.1, lit * 0.45 * (1.0 - dens));
      float cell = fbm(q * 0.55 - uWind * uT * 0.002);
      col *= 1.0 - uDark * (0.2 + dens * 0.45 + smoothstep(0.45, 0.75, cell) * 0.35);
      c = max(c, uDark * 0.92);
      // lightning inside the cloud: a soft glow round where it went off
      float fd = length(vW.xz - uFP); col += vec3(0.8, 0.85, 1.0) * uFlash * exp(-fd / 240.0) * (0.6 + dens);
      float d = length(vW.xz - cameraPosition.xz), hor = smoothstep(1750.0, 500.0, d);
      col = mix(uHaze, col, 0.25 + 0.75 * hor);
      gl_FragColor = vec4(col, c * uOp * (0.35 + 0.65 * hor));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide
});
const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600, 1, 1).rotateX(Math.PI / 2), cloudMat); cloudMesh.renderOrder = -1; cloudMesh.frustumCulled = false; cloudMesh.visible = false; scene.add(cloudMesh);
// ---- lightning: a forked bolt from the cloud base to the ground somewhere off in the distance, a few flickers, then the
// thunder after it (later the further off it struck)
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.7, 3.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
const boltGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.4, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
const BOLT = { g: null, t: 0, life: 0, seq: null };
function boltBuild(top, bot) {
  const pts = [top, bot], jag = (a, b, d, out) => { if (d === 0) { out.push(b); return; } const m = a.clone().lerp(b, 0.5), L = a.distanceTo(b); m.x += rnd(-0.5, 0.5) * L * 0.32; m.z += rnd(-0.5, 0.5) * L * 0.32; m.y += rnd(-0.1, 0.1) * L * 0.2; jag(a, m, d - 1, out); jag(m, b, d - 1, out); };
  const line = (a, b, d) => { const out = [a]; jag(a, b, d, out); return out; };
  const main = line(top, bot, 7), branches = [];
  for (let i = 0; i < 5; i++) { const k = Math.floor(rnd(0.08, 0.7) * main.length), a = main[k], L = rnd(40, 140), dir = new V3(rnd(-1, 1), -rnd(0.8, 1.6), rnd(-1, 1)).normalize(); branches.push(line(a, a.clone().addScaledVector(dir, L), 5)); }
  const cam = camera.position, ribbon = (P, w0, w1) => { const v = [];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], d = b.clone().sub(a), side = d.clone().cross(a.clone().sub(cam)).normalize(), wa = w0 + (w1 - w0) * i / P.length, wb = w0 + (w1 - w0) * (i + 1) / P.length;
      const a0 = a.clone().addScaledVector(side, -wa), a1 = a.clone().addScaledVector(side, wa), b0 = b.clone().addScaledVector(side, -wb), b1 = b.clone().addScaledVector(side, wb);
      v.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z); }
    return v; };
  const core = [], glow = []; core.push(...ribbon(main, 2.4, 1.3)); glow.push(...ribbon(main, 14, 9)); for (const B of branches) { core.push(...ribbon(B, 1.1, 0.3)); glow.push(...ribbon(B, 6, 2)); }
  const mk = (v, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); const ms = new THREE.Mesh(g, m); ms.frustumCulled = false; return ms; };
  const g = new THREE.Group(); g.add(mk(glow, boltGlowMat)); g.add(mk(core, boltMat)); return g;
}
function lightning(a0, d0) {
  const a = a0 !== undefined ? a0 : rnd(0, Math.PI * 2), dist = d0 || rnd(220, 900), cp = camera.position, x = cp.x + Math.cos(a) * dist, z = cp.z + Math.sin(a) * dist, strike = d0 !== undefined || Math.random() < 0.65;
  cloudMat.uniforms.uFP.value.set(x, z);
  if (BOLT.g) { scene.remove(BOLT.g); BOLT.g.traverse(o => o.geometry && o.geometry.dispose()); BOLT.g = null; }
  if (strike) { BOLT.g = boltBuild(new V3(x + rnd(-60, 60), CLOUD_Y - 20, z + rnd(-60, 60)), new V3(x, 0, z)); scene.add(BOLT.g); }
  // the flicker: a few return strokes
  BOLT.t = 0; BOLT.seq = [[0, 1], [0.06, 0.25], [0.1, 0.95], [0.17, 0.15], [0.24, 0.7], [0.32, 0.1], [0.42, 0.45], [0.6, 0]]; BOLT.strike = strike;
  const dly = dist / 343 * rnd(0.7, 1); setTimeout(() => noiseHit(rnd(55, 95), rnd(1.6, 3), clamp(0.5 / (1 + dist / 400), 0.08, 0.4)), dly * 1000);
}
function updateBolt(dt) {
  if (!BOLT.seq) return; BOLT.t += dt; let v = 0; for (const [t, k] of BOLT.seq) if (BOLT.t >= t) v = k;
  ENV.flash = Math.max(ENV.flash, v * (BOLT.strike ? 1 : 0.6)); cloudMat.uniforms.uFlash.value = v * 1.4;
  boltMat.opacity = v; boltGlowMat.opacity = v * 0.7;
  if (BOLT.t > 0.6) { BOLT.seq = null; cloudMat.uniforms.uFlash.value = 0; if (BOLT.g) { scene.remove(BOLT.g); BOLT.g.traverse(o => o.geometry && o.geometry.dispose()); BOLT.g = null; } }
}
const envMix = key => { const a = WEATHER[ENV.from][key], b = WEATHER[ENV.w][key]; return a + (b - a) * ENV.k; };
// a weather picked at random, the common ones more often (every round starts on one; nothing is forced)
function envRandom() { const wts = { clear: 3, cloudy: 3, rain: 2, storm: 1.5, fog: 1 }; let r = Math.random() * 10.5; for (const k in wts) { r -= wts[k]; if (r <= 0) return k; } return 'clear'; }
function envSet(w, now) { if (w === 'random' || !w) w = envRandom(); if (!WEATHER[w]) return false; if (w !== ENV.w) { ENV.from = now ? w : envCur(); ENV.w = w; ENV.k = now ? 1 : 0; } ENV.nextT = rnd(180, 360); return true; }
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
const LAMP_DEAD = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.6 }); LAMP_DEAD.userData.shared = true;
function lampBreak(i, p, dir) {
  const L = TOWN.lampAll && TOWN.lampAll[i]; if (!L || L.out) return;
  L.out = true; L.mesh.material = LAMP_DEAD; L.mesh.scale.set(1, 0.5, 1);
  const j = worldMeshes.indexOf(L.mesh); if (j >= 0) worldMeshes.splice(j, 1);
  particles(p, 18, PMAT.spark, 2.5, 0.004, 0.3, 0.6, dir.clone().negate(), 6); particles(p, 14, PMAT.chip, 2, 0.006, 0.8, 0.9, new V3(0, -1, 0));
  noiseHit(5200, 0.06, 0.25 / (1 + camera.position.distanceTo(p) * 0.2)); noiseHit(2600, 0.12, 0.15 / (1 + camera.position.distanceTo(p) * 0.2));
}
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
  // (night is really dark: a little moonlight, far less under cloud; inside without a lamp you need a light)
  const sunI = day > 0.02 ? Math.max(0.15, 4.6 * day) * (1 - cloud * 0.72) : 0.13 * (1 - cloud * 0.7);
  ENV.flash = Math.max(0, ENV.flash - dt * 6);
  sun.intensity = sunI + ENV.flash * 6; vmSun.intensity = sunI * 0.74 + ENV.flash * 4;
  // night vision: an image intensifier (and its little infrared lamp) lifts the dark a long way; it is all green and grainy
  const nvg = P.head === 'nvg' && P.nvgOn && P.alive && S.mode;
  // (the sky's light is low even by day: a house with its windows boarded and its lamps out is properly dark inside)
  if (_hemi) _hemi.intensity = _hemiI * (0.012 + day * 0.42) * (1 + cloud * 0.4 * day) + ENV.flash * 0.6 + (nvg ? 0.32 : 0);
  scene.environmentIntensity = (nvg ? 0.25 : 0.003) + 0.3 * day * (1 - cloud * 0.4); vmScene.environmentIntensity = 0.03 + 0.65 * day * (1 - cloud * 0.4);
  // the sky dome: turbid and grey under cloud, dark at night
  const u = sky.material.uniforms; u.sunPosition.value.copy(_sunReal); u.turbidity.value = 7 + cloud * 13; u.rayleigh.value = 1.8 * (1 - cloud * 0.7) + 0.1;
  renderer.toneMappingExposure = (0.55 * (0.55 + day * 0.45) * (1 - cloud * 0.2) + 0.02 * (1 - day) + ENV.flash * 0.3) * (nvg ? 2.6 : 1);
  _tmpC.copy(_fogNight).lerp(_fogDay, day).lerp(_fogGrey, cloud * day * 0.7);
  scene.fog.color.copy(_tmpC); scene.fog.density = fogD;
  // the house lights at dusk
  // the house lights: on through the day too when it is dark out (they are what lights the inside), brighter at night
  const lit = 1, lamps = (typeof TOWN !== 'undefined' && TOWN.lamps) || [];
  const all = (typeof TOWN !== 'undefined' && TOWN.lampAll) || [];
  { const cp = camera.position; _hlS.length = 0;
    for (let i = 0; i < lamps.length; i++) { const q = lamps[i]; if (!q || !S.mode || all.some(L => L.li === i && L.out)) continue; const dy = Math.abs(q.y - cp.y); _hlS.push([i, Math.hypot(q.x - cp.x, q.z - cp.z) + (dy > 2 ? dy * 4 : 0)]); }
    _hlS.sort((a, b) => a[1] - b[1]); const want = new Set(_hlS.slice(0, HL_N - 1).map(e => e[0]));
    for (const e of _hlS) if (!_hlW.has(e[0])) _hlW.set(e[0], 0);
    for (const [i, w] of _hlW) { if (!lamps[i]) { _hlW.delete(i); continue; } const nw = clamp(w + (want.has(i) ? 1 : -1) * Math.min(dt, 0.1) * 3, 0, 1); if (nw <= 0 && !want.has(i)) _hlW.delete(i); else _hlW.set(i, nw); }
    const on = [..._hlW].sort((a, b) => b[1] - a[1]).slice(0, HL_N);
    for (let k = 0; k < HL_N; k++) { const l = houseLights[k], e = on[k]; if (e && lamps[e[0]]) { l.position.copy(lamps[e[0]]); l.intensity = 48 * e[1]; l.distance = 15; } else l.intensity = 0; } }
  lampMat.emissiveIntensity = lamps.length ? 3 : 0;
  ENV.day = day; P.envDay = day; ENV.cloud = cloud; ENV.fogK = clamp((fogD - 0.002) / 0.02, 0, 1);
  // rain round the camera, falling and blown with the wind; not under a roof (it is only drawn outdoors)
  const cp = camera.position, inHouse = S.world !== 'lobby' && cp.x > HOUSE.x0 && cp.x < HOUSE.x1 && cp.z > HOUSE.z0 && cp.z < HOUSE.z1 && cp.y < HOUSE.f1 + HOUSE.H + 1;
  const indoor = rain > 0.02 && (inHouse || colliders.some(c => c.min.y > camera.position.y + 0.3 && c.min.y < camera.position.y + 12 && camera.position.x > c.min.x && camera.position.x < c.max.x && camera.position.z > c.min.z && camera.position.z < c.max.z && (c.max.x - c.min.x) > 3 && (c.max.z - c.min.z) > 3));
  rainMat.opacity = rain * 0.5; rainMesh.visible = rain > 0.02 && S.mode && !indoor;
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
    if (ENV.thunderT <= 0) { ENV.thunderT = rnd(6, 20); lightning(); }
  }
  updateBolt(dt); TREE_T.value += dt * (0.6 + envMix('wind')); updateBirds(dt);
  // the cloud deck: how much of the sky it covers, how dark, lit by the sun and the sky
  { const U = cloudMat.uniforms, storm = WEATHER[ENV.w] === WEATHER.storm ? ENV.k : WEATHER[ENV.from] === WEATHER.storm ? 1 - ENV.k : 0;
    U.uT.value += dt; U.uCover.value = cloud < 0.02 ? 0 : 0.18 + cloud * 0.72 + rain * 0.12; U.uDark.value = clamp(rain * 0.55 + storm * 0.45, 0, 1);
    U.uOp.value = clamp(cloud * 1.4, 0, 1); U.uSun.value.copy(_sunReal).normalize();
    U.uHaze.value.copy(scene.fog.color); U.uBase.value.copy(scene.fog.color).multiplyScalar(0.62 + 0.25 * (1 - rain));
    U.uLit.value.copy(scene.fog.color).multiplyScalar(1.05 + 0.35 * day * (1 - rain)).lerp(_sunLow, 0.12 * day * (1 - cloud));
    const w = envMix('wind'); U.uWind.value.set(0.8 + w, 0.25 + w * 0.3);
    cloudMesh.visible = cloud > 0.02 && S.world !== 'lobby'; cloudMesh.position.set(camera.position.x, CLOUD_Y - rain * 70, camera.position.z); }
}
const envClock = () => { const h = Math.floor(ENV.tod), m = Math.floor((ENV.tod - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

// ---- module exports: build.mjs strips this block ----
export { ENV, WEATHER, envApply, envClock, envCur, envSet, envShare, envSnap, houseLights, lampBreak, updateEnv };
// ---- end module exports ----
