import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// TEMPORARY: flip to false to remove testing mode
const ENABLE_TEST_MODE = true;

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = t => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);
function angLerp(a, b, t) { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; }
function bump(r, a, b) { return (r < a || r > b) ? 0 : Math.sin((r - a) / (b - a) * Math.PI); }
function ramp(r, a, b) { return smooth(clamp((r - a) / (b - a), 0, 1)); }

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 2000);
camera.rotation.order = 'YXZ';
scene.add(camera);

const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
vmCamera.rotation.order = 'YXZ';
vmScene.add(vmCamera);

const sunDir = new V3().setFromSphericalCoords(1, Math.PI / 2 - THREE.MathUtils.degToRad(36), THREE.MathUtils.degToRad(140));
function setupSky(s) {
  s.scale.setScalar(1000);
  const u = s.material.uniforms;
  u.turbidity.value = 7; u.rayleigh.value = 1.8; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
}
const sky = new Sky(); setupSky(sky); scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); const sky2 = new Sky(); setupSky(sky2); envScene.add(sky2);
const envTex = pmrem.fromScene(envScene).texture;
scene.environment = envTex; scene.environmentIntensity = 0.6;
vmScene.environment = envTex; vmScene.environmentIntensity = 0.75;
scene.fog = new THREE.FogExp2(0xb4c2cf, 0.0011);

const sun = new THREE.DirectionalLight(0xfff0d8, 4.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x4a4236, 0.25));
const muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(muzzleLight);

const vmSun = new THREE.DirectionalLight(0xfff0d8, 3.4); vmScene.add(vmSun, vmSun.target);
vmScene.add(new THREE.HemisphereLight(0xbfd6ff, 0x4a4236, 0.4));
const vmMuzzleLight = new THREE.PointLight(0xffb060, 0, 3, 2); vmScene.add(vmMuzzleLight);
// ---------------------------------------------------------------- magnified optics: picture-in-picture
// The world is rendered a second time through a narrow camera into a texture, and that texture is shown on the eyepiece of the
// scope in the viewmodel. Everything around the scope stays at normal zoom. The lens darkens when the eye is off the eyepiece.
const scopeRT = new THREE.WebGLRenderTarget(1024, 1024, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
const scopeCam = new THREE.PerspectiveCamera(5, 1, 0.05, 2500); scopeCam.rotation.order = 'YXZ';
function scopeReticleTex(kind) {
  return canvasTex((g, s) => {
    g.clearRect(0, 0, s, s); const c = s / 2;
    if (kind === 'mildot') {
      g.fillStyle = '#000'; g.fillRect(c - 1.6, 0, 3.2, s); g.fillRect(0, c - 1.6, s, 3.2);
      g.fillRect(0, c - 7, s * 0.32, 14); g.fillRect(s * 0.68, c - 7, s * 0.32, 14); g.fillRect(c - 7, s * 0.68, 14, s * 0.32);
      for (let i = -4; i <= 4; i++) if (i) { g.beginPath(); g.arc(c + i * s * 0.045, c, 5, 0, 7); g.fill(); g.beginPath(); g.arc(c, c + i * s * 0.045, 5, 0, 7); g.fill(); }
    } else {
      // 4x chevron with bullet-drop marks, lit amber
      g.strokeStyle = '#000'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, c); g.lineTo(s * 0.32, c); g.moveTo(s * 0.68, c); g.lineTo(s, c); g.moveTo(c, c + s * 0.02); g.lineTo(c, s); g.stroke();
      for (let i = 1; i <= 5; i++) { const y = c + i * s * 0.05, w = s * (0.05 - i * 0.006); g.fillRect(c - w, y, w * 2, 4); }
      g.fillStyle = '#ff6a1a'; g.shadowColor = '#ff3a00'; g.shadowBlur = 6; g.beginPath(); g.moveTo(c, c + 2); g.lineTo(c - 26, c + 46); g.lineTo(c - 16, c + 46); g.lineTo(c, c + 20); g.lineTo(c + 16, c + 46); g.lineTo(c + 26, c + 46); g.closePath(); g.fill();
    }
  }, 512, false);
}
const scopeLensMat = (ret) => new THREE.ShaderMaterial({
  uniforms: { map: { value: scopeRT.texture }, ret: { value: ret }, off: { value: new THREE.Vector2() }, eye: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: '#include <common>\nuniform sampler2D map; uniform sampler2D ret; uniform vec2 off; uniform float eye; varying vec2 vUv;\n' +
    'void main() { vec2 q = vUv - 0.5; float r = length(q) * 2.0;\n' +
    '  vec3 col = texture2D(map, vUv).rgb; vec4 rt = texture2D(ret, vUv); col = mix(col, rt.rgb, rt.a);\n' +
    '  float box = 1.0 - smoothstep(0.62, 0.98, length(q * 2.0 - off));\n' +
    '  col *= box * eye * (1.0 - 0.25 * r * r);\n' +
    '  gl_FragColor = vec4(col, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
});
function makeScopeLens(parent, pos, r, zoom, kind) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), scopeLensMat(scopeReticleTex(kind))); m.position.fromArray(pos); parent.add(m);
  m.userData.zoom = zoom; m.userData.r = r; return m;
}
let lensOn = false;
// called every frame before the main render
function renderScope() {
  const W = VMW[P.weapon], lens = P.slot < 2 && !S.tp && P.alive && !P.downed && W ? W.lens : null;
  lensOn = !!lens && P.ads > 0.2;
  if (!lensOn) return;
  vmScene.updateMatrixWorld(true);
  const lp = lens.getWorldPosition(new V3()), dist = Math.max(0.02, lp.distanceTo(camera.position));
  const half = Math.atan(lens.userData.r / dist);
  scopeCam.position.copy(camera.position); scopeCam.quaternion.copy(camera.quaternion);
  scopeCam.fov = THREE.MathUtils.radToDeg(2 * half) / lens.userData.zoom; scopeCam.updateProjectionMatrix();
  const u = lens.material.uniforms; u.eye.value = ramp(P.ads, 0.6, 0.95); u.off.value.set(clamp(-P.aimOX * 4 - P.swayX * 10, -0.6, 0.6), clamp(P.aimOY * 4 + P.swayY * 10, -0.6, 0.6));
  // smoke and dust right in front of the muzzle would fill a 10x view: leave anything within a few metres out of the scope pass
  const hid = [];
  for (const f of fx) if (f.sprite && f.o.visible && f.o.position.distanceToSquared(camera.position) < 16) { f.o.visible = false; hid.push(f.o); }
  // autoClear is off for the main view, so the target has to be cleared by hand or the first frame's depth freezes the image
  renderer.setRenderTarget(scopeRT); renderer.clear(); renderer.render(scene, scopeCam); renderer.setRenderTarget(null);
  for (const o of hid) o.visible = true;
}

