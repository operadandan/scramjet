// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, rnd } from './00-setup.js';
import { HUMAN_SEGS } from './02a-human-mesh.js';
import { BZ_SEG, chunkUniforms } from './02b-chunks.js';
import { seg } from './19c-toolvm.js';
import { frame } from './22-menu-loop.js';
// ---- end module links ----
// ---------------------------------------------------------------- blood soaking into clothes and skin, and fragment pepper
// Every body vertex knows where it sits in its own segment's frame (attribute bz: trunk and head in the body frame, w 1/2;
// arms, legs and neck in their own frame, w = 10 + segment). A wound puts a soak sphere there; it grows over the next half
// minute and creeps along whatever way is down for that part right now, so a standing body soaks down the shirt and a body
// on its back soaks toward the floor. Cotton goes dark red, denim near black, bare skin gets a film of blood. Fragments
// from a grenade leave small dark dots (pepper), one per strike, as many as 48 on a body, with no mesh at all.
const SOAK_N = 12, PEP_N = 48, SOAK_ROOTS = new Set();
function soakUniforms() {
  return { soak: { value: Array.from({ length: SOAK_N }, () => new THREE.Vector4(0, 0, 0, 0)) }, soakW: { value: new Float32Array(SOAK_N) }, soakN: { value: 0 },
    pep: { value: Array.from({ length: PEP_N }, () => new THREE.Vector4(0, 0, 0, 0)) }, pepW: { value: new Float32Array(PEP_N) }, pepN: { value: 0 },
    burn: { value: new THREE.Vector4(0, 0, 0, 0) } };
}
const SOAK_F = `
uniform vec4 soak[${SOAK_N}]; uniform float soakW[${SOAK_N}]; uniform float soakN;
uniform vec4 pep[${PEP_N}]; uniform float pepW[${PEP_N}]; uniform float pepN; uniform vec4 burn;
float skHs(vec3 p) { return fract(sin(dot(p, vec3(41.3, 289.1, 97.7))) * 43758.5453); }
float skN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(skHs(i), skHs(i + vec3(1,0,0)), f.x), mix(skHs(i + vec3(0,1,0)), skHs(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(skHs(i + vec3(0,0,1)), skHs(i + vec3(1,0,1)), f.x), mix(skHs(i + vec3(0,1,1)), skHs(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const SOAK_MAIN = `
float soakK = 0.0;
if (vBZ.w > 0.5) {
  vec3 q = vBZ.xyz, qj = q + (vec3(skN(q * 40.0), skN(q * 40.0 + 7.1), skN(q * 40.0 + 3.3)) - 0.5) * 0.022 + (vec3(skN(q * 140.0), skN(q * 140.0 + 2.2), 0.5) - 0.5) * 0.006;
  for (int i = 0; i < ${SOAK_N}; i++) { if (float(i) >= soakN) break; if (abs(soakW[i] - vBZ.w) > 0.5) continue;
    float d = length(qj - soak[i].xyz); soakK = max(soakK, (1.0 - smoothstep(soak[i].w * 0.5, soak[i].w, d)) * (0.75 + 0.25 * smoothstep(soak[i].w * 0.6, 0.0, d))); }
  float pepK = 0.0;
  for (int i = 0; i < ${PEP_N}; i++) { if (float(i) >= pepN) break; if (abs(pepW[i] - vBZ.w) > 0.5) continue;
    float d = length(q - pep[i].xyz); pepK = max(pepK, 1.0 - smoothstep(pep[i].w * 0.6, pep[i].w, d)); }
  if (CLOTH) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.32, 0.045, 0.035) + vec3(0.025, 0.001, 0.001), soakK * 0.92);
  else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.012, 0.009), soakK * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.006, 0.005), pepK);
  soakK = max(soakK, pepK);
  // flash burn from a charge set off against the body: soot-black, scorched, with raw red where the skin is gone; the
  // clothes nearest it are shredded away
  if (burn.w > 0.0 && vBZ.w < 2.5) {
    float bd = length(q - burn.xyz), bn = skN(q * 30.0), bk = (1.0 - smoothstep(burn.w * 0.35, burn.w, bd + (bn - 0.5) * 0.06));
    if (CLOTH && bk > 0.55 && skN(q * 60.0) > 0.5) discard;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.013, 0.010, 0.009), bk * 0.85);
    if (bk > 0.3 && bn > 0.7) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.21, 0.013, 0.010), 0.7);
  }
}
`;
function soakShader(sh, U, cloth) {
  for (const k of ['soak', 'soakW', 'soakN', 'pep', 'pepW', 'pepN', 'burn']) sh.uniforms[k] = U[k];
  if (!/varying vec4 vBZ;/.test(sh.vertexShader)) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 bz;\nvarying vec4 vBZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBZ = bz;');
  const decl = /varying vec4 vBZ;/.test(sh.fragmentShader) ? '' : 'varying vec4 vBZ;\n';
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + decl + SOAK_F)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + SOAK_MAIN.split('CLOTH').join(cloth ? 'true' : 'false'))
    // wet cloth and skin go a little glossy
    .replace('#include <lights_physical_fragment>', 'roughnessFactor = mix(roughnessFactor, 0.42, soakK);\n#include <lights_physical_fragment>');
}
// where a point on a body segment group sits in that segment's bz frame: [w, point]
function soakFrame(root, frame, group, p) {
  const rag = root.userData.ragObj || null;
  let dy = 0;
  if (rag) { let r = rag.frameGroup(frame, p.y); if (r[0] !== group) r = rag.frameGroup(frame, p.y - 1); if (r[0] !== group) r = rag.frameGroup(frame, 0); if (r[0] === group) dy = r[1]; }
  const q = p.clone(); q.y -= dy;
  if (frame === 'hips' || frame === 'spine') { q.y += BZ_SEG[frame][1]; return [1, q]; }
  if (frame === 'head') return [2, q];
  const k = HUMAN_SEGS.indexOf(frame); return k < 0 ? null : [10 + k, q];
}
function soakGroupOf(root, w, q) {
  const at = root.userData.chunkAt; if (!at) return null;
  const seg = w === 1 ? (q.y > 0.07 ? 'spine' : 'hips') : w === 2 ? 'head' : HUMAN_SEGS[w - 10];
  return at[seg] ? at[seg][0] : null;
}
function soakSync(root) {
  const st = root.userData.chunk; if (!st || !st.sk) return; const U = st.sk, L = st.soaks || [], Pp = st.peps || [];
  const was = U.soakN.value || U.pepN.value || U.burn.value.w > 0;
  L.forEach((s, i) => { U.soak.value[i].set(s.c.x, s.c.y, s.c.z, s.r); U.soakW.value[i] = s.w; }); U.soakN.value = L.length;
  Pp.forEach((s, i) => { U.pep.value[i].set(s.q.x, s.q.y, s.q.z, s.r); U.pepW.value[i] = s.w; }); U.pepN.value = Pp.length;
  if (!was && (U.soakN.value || U.pepN.value || U.burn.value.w > 0)) root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) o.material.needsUpdate = true; });
}
// a new soak at a wound: tgt is how far it spreads (m)
function addSoak(root, frame, group, p, tgt) {
  if (!root) return; chunkUniforms(root); const st = root.userData.chunk, f = soakFrame(root, frame, group, p); if (!f) return;
  const L = st.soaks = st.soaks || [];
  // a wound right next to one already soaking just makes that one spread further
  for (const s of L) if (s.w === f[0] && s.q.distanceTo(f[1]) < s.r * 0.6) { s.tgt = Math.min(0.2, Math.max(s.tgt, tgt) * 1.15); return; }
  if (L.length >= SOAK_N) { L.sort((a, b) => b.tgt - a.tgt); L.pop(); }
  L.push({ w: f[0], q: f[1].clone(), c: f[1].clone(), r: 0.018, tgt, t: 0 });
  SOAK_ROOTS.add(root); soakSync(root);
}
function addPepper(root, frame, group, p) {
  if (!root) return; chunkUniforms(root); const st = root.userData.chunk, f = soakFrame(root, frame, group, p); if (!f) return;
  const L = st.peps = st.peps || []; if (L.length >= PEP_N) L.shift();
  L.push({ w: f[0], q: f[1].clone(), r: rnd(0.0018, 0.0032) });
  // where several strikes land close together the clothes soak round them
  if (L.filter(s => s.w === f[0] && s.q.distanceTo(f[1]) < 0.06).length === 3) addSoak(root, frame, group, p, 0.06);
  else SOAK_ROOTS.add(root), soakSync(root);
}
function soakCopy(from, to) {
  const a = from && from.userData.chunk, b = to && to.userData.chunk; if (!a || !b) return;
  b.soaks = (a.soaks || []).map(s => ({ w: s.w, q: s.q.clone(), c: s.c.clone(), r: s.r, tgt: s.tgt, t: s.t }));
  b.peps = (a.peps || []).map(s => ({ w: s.w, q: s.q.clone(), r: s.r }));
  if (a.sk && b.sk) b.sk.burn.value.copy(a.sk.burn.value);
  if (b.sk && b.sk.burn.value.w > 0) { SOAK_ROOTS.add(to); soakSync(to); }
  if (b.soaks.length || b.peps.length) { SOAK_ROOTS.add(to); soakSync(to); }
}
function soakClear(root) {
  const st = root && root.userData.chunk; if (!st) return; const had = st.sk && (st.sk.soakN.value || st.sk.pepN.value || st.sk.burn.value.w > 0);
  st.soaks = []; st.peps = []; if (st.sk) { st.sk.soakN.value = 0; st.sk.pepN.value = 0; st.sk.burn.value.set(0, 0, 0, 0); }
  if (had) root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) o.material.needsUpdate = true; });
  SOAK_ROOTS.delete(root);
}
const _skq = new THREE.Quaternion(), _skd = new V3();
function updateSoaks(dt) {
  for (const root of SOAK_ROOTS) {
    if (!root.parent) { SOAK_ROOTS.delete(root); continue; }
    const L = root.userData.chunk.soaks || []; let live = false;
    for (const s of L) {
      s.t += dt; s.r = s.tgt - (s.tgt - 0.025) * Math.exp(-s.t / 9); if (s.t < 120) live = true;
      // creep downhill (in this part's frame, for the way the part is lying now), never far from the wound
      const g = soakGroupOf(root, s.w, s.c); if (!g) continue;
      g.getWorldQuaternion(_skq).invert(); _skd.set(0, -1, 0).applyQuaternion(_skq);
      if (s.c.distanceTo(s.q) < s.r * 0.6) s.c.addScaledVector(_skd, 0.002 * dt);
    }
    soakSync(root);
    if (!live && !(root.userData.chunk.peps || []).length) SOAK_ROOTS.delete(root);
  }
}
// a charge going off at the world point p, close to a body: scorch the side facing it
function addBurn(root, p, radius) {
  if (!root) return; chunkUniforms(root); const at = root.userData.chunkAt; if (!at || !at.spine) return;
  const g = at.spine[0], l = g.worldToLocal(p.clone()), f = soakFrame(root, 'spine', g, l); if (!f) return;
  const B = root.userData.chunk.sk.burn.value; B.set(f[1].x, f[1].y, f[1].z, Math.max(B.w, radius));
  SOAK_ROOTS.add(root); soakSync(root);
}

// ---- module exports: build.mjs strips this block ----
export { addBurn, addPepper, addSoak, soakClear, soakCopy, soakFrame, soakShader, soakUniforms, updateSoaks };
// ---- end module exports ----
