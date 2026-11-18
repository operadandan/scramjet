// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, clamp, rnd, scene } from './00-setup.js';
import { HUMAN_SEGS } from './02a-human-mesh.js';
import { RAG_LIMBS, _Y } from './04-ragdoll.js';
import { brainSmears, goreThrow, spawnGore } from './12b-gore.js';
import { bloodFx, copySegment, liquidBlood, spawnDrop } from './14-wounds.js';
import { addSoak, soakClear, soakCopy, soakFrame, soakUniforms } from './14b-soak.js';
import { P, S, localBody } from './17-dummies.js';
import { net } from './19-network.js';
import { seg } from './19c-toolvm.js';
import { frame } from './22-menu-loop.js';
// ---- end module links ----
// ---------------------------------------------------------------- body chunks: the torso and head can be destroyed piece by piece
// The trunk (pelvis to shoulders) is split into 48 irregular cells and the head into 24, a Voronoi split round fixed seed
// points (the same on every client), so a piece of a body that goes is an uneven chunk, not a box. A body looks exactly the
// same until a cell is destroyed; then everything in that cell (skin, clothes, hair, organs) is gone, the edge of the hole is
// torn skin with a band of fat and muscle under it, and where a gone cell meets one still there the body shows a solid cut
// face (cross-section). A blast takes out the cells it reaches; a .50 takes out the cells along its track.
// Each vertex carries its position in a fixed body frame (attribute bz: xyz, and w = 1 trunk, 2 head, 0 neither), so the
// same cells line up on the standing body, on the ragdoll, and on every client.
const BZ_SEG = { hips: [1, 0], spine: [1, 0.07], head: [2, 0] };
function ensureBZ(g, seg) {
  if (!g || g.attributes.bz) return g;
  const P = g.attributes.position, n = P.count, a = new Float32Array(n * 4), s = BZ_SEG[seg];
  // arms, legs and the neck: the segment's own frame, w = 10 + segment number (cells never cut them; blood soaks them)
  const ls = s ? null : HUMAN_SEGS.indexOf(seg);
  if (s) for (let i = 0; i < n; i++) { a[i * 4] = P.getX(i); a[i * 4 + 1] = P.getY(i) + s[1]; a[i * 4 + 2] = P.getZ(i); a[i * 4 + 3] = s[0]; }
  else if (ls >= 0) for (let i = 0; i < n; i++) { a[i * 4] = P.getX(i); a[i * 4 + 1] = P.getY(i); a[i * 4 + 2] = P.getZ(i); a[i * 4 + 3] = 10 + ls; }
  g.setAttribute('bz', new THREE.BufferAttribute(a, 4)); return g;
}
// the seed points: spread out evenly (best-candidate sampling) inside a box round the trunk and the head, from a fixed seed
const CH_N = { T: 48, H: 24 }, CH_GIB = 13, HC_MAX = 8;   // HC_MAX: craters a head can carry   // CH_GIB: head cells gone before the whole head counts as destroyed
const CH_SEEDS = (() => {
  let sd = 917; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const gen = (n, lo, hi, w) => { const P = [];
    for (let i = 0; i < n; i++) { let best = null, bd = -1;
      for (let t = 0; t < 40; t++) { const c = [lo[0] + R() * (hi[0] - lo[0]), lo[1] + R() * (hi[1] - lo[1]), lo[2] + R() * (hi[2] - lo[2])];
        let d = 1e9; for (const p of P) d = Math.min(d, Math.hypot((c[0] - p[0]) * w[0], (c[1] - p[1]) * w[1], (c[2] - p[2]) * w[2]));
        if (d > bd) { bd = d; best = c; } }
      P.push(best); }
    return P.map(p => new V3(p[0], p[1], p[2])); };
  // depth is weighted up so the cells are not all long front-to-back columns: a body has a front and a back
  return { T: gen(CH_N.T, [-0.19, -0.13, -0.12], [0.19, 0.57, 0.08], [1, 0.8, 1.6]), H: gen(CH_N.H, [-0.08, -0.08, -0.13], [0.08, 0.15, 0.03], [1, 0.9, 1.3]) };
})();
const CH_SEEDS_GLSL = k => 'const vec3 CS' + k + '[' + CH_N[k] + '] = vec3[' + CH_N[k] + '](' + CH_SEEDS[k].map(v => 'vec3(' + v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4) + ')').join(',') + ');\n';
// colours here are written as sRGB (what they look like on screen) and converted to the renderer's linear space
const CHUNK_F = `
uniform float chT[${CH_N.T}]; uniform float chH[${CH_N.H}]; uniform float chAny; uniform vec4 hc[${HC_MAX}]; uniform float hcN; varying vec4 vBZ;
${CH_SEEDS_GLSL('T')}${CH_SEEDS_GLSL('H')}
vec3 chS(vec3 c) { return pow(c, vec3(2.2)); }
float chHs(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float chN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(chHs(i), chHs(i + vec3(1,0,0)), f.x), mix(chHs(i + vec3(0,1,0)), chHs(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(chHs(i + vec3(0,0,1)), chHs(i + vec3(1,0,1)), f.x), mix(chHs(i + vec3(0,1,1)), chHs(i + vec3(1,1,1)), f.x), f.y), f.z); }
// the warp that makes the cell walls torn rather than flat: two octaves
vec3 chWarp(vec3 q) { return (vec3(chN(q * 14.0), chN(q * 14.0 + 11.3), chN(q * 14.0 + 23.7)) - 0.5) * 0.04 + (vec3(chN(q * 32.0 + 3.0), chN(q * 32.0 + 7.7), chN(q * 32.0 + 13.1)) - 0.5) * 0.014; }
vec3 chSeed(int i, float w) { return w < 1.5 ? CST[i] : CSH[i]; }
float chGone(int i, float w) { return w < 1.5 ? chT[i] : chH[i]; }
int chNear(vec3 q, float w) { int n = w < 1.5 ? ${CH_N.T} : ${CH_N.H}, bi = 0; float bd = 1e9;
  for (int i = 0; i < ${CH_N.T}; i++) { if (i >= n) break; vec3 d = q - chSeed(i, w); float e = dot(d, d); if (e < bd) { bd = e; bi = i; } }
  return bi; }
// distance from q (in cell i) to the nearest wall it shares with a gone cell; 1 when there is none
float chEdge(vec3 q, int i, float w) { int n = w < 1.5 ? ${CH_N.T} : ${CH_N.H}; vec3 si = chSeed(i, w); float dE = 1.0;
  for (int j = 0; j < ${CH_N.T}; j++) { if (j >= n) break; if (j == i || chGone(j, w) < 0.5) continue;
    vec3 ab = chSeed(j, w) - si; float L = length(ab); float d = -dot(q - (si + chSeed(j, w)) * 0.5, ab / L); dE = min(dE, d); }
  return dE; }
`;
// How a cut is drawn on the skin. Torn skin, bruised and bloody for a centimetre or two round the hole; at the very edge, a thin
// band of fat (scalp and skull on the head) smeared with blood, then muscle. Nothing glows. Seen through the hole, the inside of
// the skin near the cut is meat; away from any cut it is not drawn at all (the cut faces close the body).
const CHUNK_MAIN = `
if (vBZ.w > 0.5 && vBZ.w < 2.5 && chAny > 0.5) {
  bool head = vBZ.w > 1.5;
  vec3 q = vBZ.xyz;
  float dE = 1.0;
  if (head) {
    // the head: one or more blown-out craters (spheres), each a single clean, solid wound; the rim torn a little
    if (hcN < 0.5) { dE = 1.0; } else {
      vec3 qh = q + (vec3(chN(q * 30.0), chN(q * 30.0 + 5.3), chN(q * 30.0 + 9.1)) - 0.5) * 0.014
        + (vec3(chN(q * 85.0 + 2.1), chN(q * 85.0 + 6.7), chN(q * 85.0 + 12.9)) - 0.5) * 0.007;   // small torn flaps along the edge
      for (int i = 0; i < ${HC_MAX}; i++) { if (float(i) >= hcN) break; float d = length(qh - hc[i].xyz) - hc[i].w; if (d < 0.0) discard; dE = min(dE, d); }
    }
  } else {
    vec3 qj = q + chWarp(q);
    int ci = chNear(qj, vBZ.w);
    if (chGone(ci, vBZ.w) > 0.5) discard;
    dE = chEdge(qj, ci, vBZ.w);
  }
  float bn = chN(q * 60.0);
  vec3 blood = chS(mix(vec3(0.24, 0.03, 0.025), vec3(0.42, 0.06, 0.045), chN(q * 140.0)));
  vec3 meat = chS(mix(vec3(0.36, 0.06, 0.05), vec3(0.5, 0.1, 0.08), chN(q * 110.0)) * (0.85 + 0.25 * chN(q * vec3(320.0, 45.0, 320.0))));
  vec3 layer = chS(head ? vec3(0.66, 0.58, 0.5) : vec3(0.62, 0.48, 0.3));
  layer = mix(layer, blood, bn * 0.6);
  if (gl_FrontFacing) {
    if (dE < 0.03) {
      vec3 c = diffuseColor.rgb;
      c = mix(c, c * vec3(0.45, 0.16, 0.14), (1.0 - smoothstep(0.01, 0.03, dE)) * 0.8);
      c = mix(c, blood, (1.0 - smoothstep(0.004, 0.016, dE)) * 0.75);
      if (${'SOLID'}) {
        c = mix(c, layer, smoothstep(0.008, 0.006, dE) * (1.0 - smoothstep(0.004, 0.003, dE)) * (head ? 0.9 : 0.7));
        c = mix(c, head ? blood : meat, smoothstep(0.004, 0.002, dE));
      }
      diffuseColor.rgb = c;
    }
  } else if (${'SOLID'} && dE > 0.06) {
    discard;
  } else if (${'SOLID'}) {
    diffuseColor.rgb = mix(meat, blood, smoothstep(0.55, 0.8, chN(q * 18.0)) * 0.7);
  }
}
`;
function chunkShader(sh, U, solid) {
  if (!U.chT) Object.assign(U, { chT: { value: new Float32Array(CH_N.T) }, chH: { value: new Float32Array(CH_N.H) }, chAny: { value: 0 } });   // a cut-off piece: no cells
  if (!U.hc) Object.assign(U, { hc: { value: Array.from({ length: HC_MAX }, () => new THREE.Vector4()) }, hcN: { value: 0 } });
  sh.uniforms.chT = U.chT; sh.uniforms.chH = U.chH; sh.uniforms.chAny = U.chAny; sh.uniforms.hc = U.hc; sh.uniforms.hcN = U.hcN;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 bz;\nvarying vec4 vBZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBZ = bz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CHUNK_F).replace('#include <emissivemap_fragment>',
    CHUNK_MAIN.split('SOLID').join(solid ? 'true' : 'false') + '#include <emissivemap_fragment>');
}
function chunkUniforms(root) {
  const c = root.userData.chunk || (root.userData.chunk = { T: new Float32Array(CH_N.T), H: new Float32Array(CH_N.H), any: { value: 0 } });
  if (!c.sk) c.sk = soakUniforms();
  if (!c.hcU) { c.hcU = { hc: { value: Array.from({ length: HC_MAX }, () => new THREE.Vector4()) }, hcN: { value: 0 } }; c.HC = []; }
  return Object.assign({ chT: { value: c.T }, chH: { value: c.H }, chAny: c.any }, c.sk, c.hcU);
}
// which cell a body-frame point is in
function chunkCell(k, q) { let bi = 0, bd = 1e9; const S = CH_SEEDS[k]; for (let i = 0; i < S.length; i++) { const d = S[i].distanceToSquared(q); if (d < bd) { bd = d; bi = i; } } return bi; }
// the centre of every cell (its seed), in the world, for a body (standing or ragdoll)
function chunkCenters(root) {
  const at = root.userData.chunkAt; if (!at) return [];
  const out = [];
  for (const k of ['T']) CH_SEEDS[k].forEach((s, i) => {
    const seg = k === 'H' ? 'head' : s.y > 0.07 ? 'spine' : 'hips'; const A = at[seg]; if (!A) return;
    for (let q = A[0]; q; q = q.parent) if (!q.visible) return;
    const off = seg === 'spine' ? -0.07 : 0;
    out.push({ k, i, x: s.x, y: s.y, z: s.z, p: A[0].localToWorld(new V3(s.x, s.y + off + A[1], s.z)) });
  });
  return out;
}
function chunkRootOf(o) { for (; o; o = o.parent) if (o.userData && o.userData.chunk) return o; return null; }
// destroy the cells pred() picks. Gore comes from each cell (a few pieces), blood once for the whole lot, from the middle of
// what went. Returns how many trunk and head cells went
function destroyChunks(root, pred, dir, skin) {
  const st = root && root.userData.chunk; if (!st) return { t: 0, h: 0 };
  const res = { t: 0, h: 0, pts: [] };
  for (const c of chunkCenters(root)) {
    const A = c.k === 'T' ? st.T : st.H; if (A[c.i] > 0.5 || !pred(c)) continue;
    A[c.i] = 1; if (c.k === 'T') res.t++; else res.h++; res.pts.push(c.p);
    if (typeof spawnGore === 'function') {
      spawnGore(c.p, dir, 'flesh', 4, 4.5, 0.55, 0.03, skin); spawnGore(c.p, dir, 'bone', 1, 5, 0.55, 0.018, skin);
      if (c.k === 'H') spawnGore(c.p, dir, c.y > 0.0 && Math.random() < 0.6 ? 'brain' : 'skull', 1, 3.5, 0.45, 0.028, skin);
      else if (Math.random() < 0.5) spawnGore(c.p, dir, c.y > 0.25 ? (Math.random() < 0.5 ? 'lung' : 'bone') : 'gut', 1, 3, 0.45, 0.03, skin);
    }
  }
  if (res.t + res.h) {
    const m = new V3(); for (const p of res.pts) m.add(p); m.multiplyScalar(1 / res.pts.length);
    if (typeof bloodFx === 'function') bloodFx(m, dir, true, Math.min(3, 1 + res.pts.length * 0.25));
    chunkOpen(root); if (typeof chunkNet === 'function') chunkNet(root);
    chunkIslands(root, dir);
    if (res.t) { const W = []; for (const c of chunkCenters(root)) if (c.k === 'T' && st.T[c.i] > 0.5 && res.pts.some(p => p.distanceTo(c.p) < 0.01)) { const sp = c.y > 0.07;
        W.push({ seg: sp ? 'spine' : 'hips', c: new V3(c.x, c.y, c.z), r: 0.06, off: sp ? -0.07 : 0, mid: new V3(0, c.y, -0.02) }); }
      woundBlood(root, W.slice(0, 3), dir); }
  }
  return res;
}
// a body with cells gone shows its inside: from then on the skin and clothes are drawn on both faces
function chunkOpen(root) {
  const st = root.userData.chunk; st.any.value = 1;
  if (!st.open) { st.open = true; root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) { o.material.side = THREE.DoubleSide; o.material.needsUpdate = true; } }); }
  chunkPrepInside(root); chunkTubes(root); chunkCaps(root); chunkCraters(root); for (const c of root.userData.chunk.caps || []) c.visible = true; craterSync(root);
}
// a wound channel (the walled tube along a bullet's track) running through a cell that is now gone would stand in open air:
// it goes with the cell
function chunkTubes(root) {
  chunkLoose(root);
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st || !st.any.value) return; const v = new V3();
  for (const [seg, k, off] of [['hips', 'T', 0], ['spine', 'T', 0.07], ['head', 'H', 0]]) {
    const A = at[seg]; if (!A) continue; const arr = k === 'T' ? st.T : st.H;
    for (const o of A[0].children) {
      if (!o.userData.tube || !o.visible) continue; o.updateMatrix(); const P = o.geometry.attributes.position;
      // (the head is cut by its craters, the trunk by its cells)
      for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrix); v.y += off - A[1]; if (k === 'H' ? (st.HC || []).some(h => h.c.distanceTo(v) < h.r) : arr[chunkCell(k, v)] > 0.5) { o.visible = false; break; } }
    }
  }
}
// Blood lying on the body (the wet drops round a wound, the runs, the tear at a blast wound), stumps and bleeding points are
// separate meshes the shader does not cut: when what they lay on is blown away they would hang in the air. They go with it,
// and blood that was lying there falls as drops.
const _clw = new V3(), _clM = new THREE.Matrix4();
function liqTrim(root, im) {
  const L = im.userData.liqI, keep = [];
  for (const e of L) { _clw.copy(e.p).applyMatrix4(im.matrixWorld); if (chunkGoneAt(root, _clw)) { if (typeof spawnDrop === 'function' && Math.random() < 0.3) spawnDrop(_clw, new V3(rnd(-0.2, 0.2), 0, rnd(-0.2, 0.2)), clamp(e.r * 0.5, 0.0015, 0.0045)); } else keep.push(e); }
  if (keep.length === L.length) return;
  keep.forEach((e, i) => im.setMatrixAt(i, _clM.compose(e.p, e.q, e.s))); im.count = keep.length; im.userData.liqI = keep; im.instanceMatrix.needsUpdate = true;
}
function chunkLoose(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st || !st.any.value) return;
  root.updateMatrixWorld(true); const rg = root.userData.ragObj, seen = new Set(), gone = [];
  for (const seg of ['head', 'spine', 'hips']) {
    const A = at[seg]; if (!A || seen.has(A[0])) continue; seen.add(A[0]);
    A[0].traverse(o => {
      if (o === A[0] || o.userData.cavity || o.userData.chCap || o.userData.tube || o.userData.armor || o.userData.ci !== undefined) return;
      // a patch of wet blood is many drops in one mesh: only the drops over what is gone go (each falls as a drop)
      if (o.isInstancedMesh && o.userData.liqI) { liqTrim(root, o); return; }
      if (o.isMesh) { if (o.geometry.attributes.bz || !o.visible) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); _clw.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld); }
      else if (!o.children.length && o.userData.keep) o.getWorldPosition(_clw);
      else return;
      if (chunkGoneAt(root, _clw)) gone.push([o, _clw.clone()]);
    });
  }
  for (const [o, p] of gone) {
    if (o.isMesh && typeof spawnDrop === 'function') { const s = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(); if (s > 0.002 && s < 0.08) for (let i = 0; i < 2; i++) spawnDrop(p, new V3(rnd(-0.4, 0.4), rnd(-0.2, 0.4), rnd(-0.4, 0.4)), clamp(s * 0.25, 0.0015, 0.0045)); }
    if (rg) rg.anchors = rg.anchors.filter(a => a.m !== o);
    o.removeFromParent();
  }
}
// is a world point on a body inside a gone cell (raycasts don't see the shader's cut, so blood and wound walls check this)
function chunkGoneAt(root, wp) {
  const at = root && root.userData.chunkAt, st = root && root.userData.chunk; if (!at || !st || !st.any.value) return false;
  // the head is cut by its craters
  if (at.head && (st.HC || []).length) { const l = at.head[0].worldToLocal(wp.clone()); l.y -= at.head[1];
    if (Math.abs(l.x) < 0.13 && l.y > -0.1 && l.y < 0.24 && l.z > -0.2 && l.z < 0.11) return st.HC.some(h => h.c.distanceTo(l) < h.r); }
  for (const [seg, k, off] of [['head', 'H', 0], ['spine', 'T', 0.07], ['hips', 'T', 0]]) {
    const A = at[seg]; if (!A) continue; const l = A[0].worldToLocal(wp.clone()); l.y += off - A[1];
    const S = CH_SEEDS[k], c = chunkCell(k, l); if (S[c].distanceTo(l) > (k === 'H' ? 0.09 : 0.13)) continue;
    if ((k === 'H') !== (seg === 'head')) continue; if (k === 'T' && (seg === 'spine') !== (l.y > 0.07)) continue;
    return (k === 'T' ? st.T : st.H)[c] > 0.5;
  }
  return false;
}
// The organs, ribs, spine, skull and brain are cut by the same blocks as the skin (what was in a destroyed block is gone, the
// rest is in view through the hole). Done the first time a body loses a block. Bone in a body is not white: it is tinted wet.
function chunkPrepInside(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st || st.inPrep) return; st.inPrep = true;
  const U = chunkUniforms(root);
  for (const [seg, kind, off] of [['hips', 1, 0], ['spine', 1, 0.07], ['head', 2, 0]]) {
    const A = at[seg]; if (!A) continue;
    for (const o of A[0].children) {
      // everything else riding on the trunk or the head is cut by the blocks too: hair, eyes, brows, pouches; not armour
      if (!o.isMesh || o.userData.chunkIn || o._skin || o.userData.keep || o.userData.tube || o.userData.armor || o.geometry.attributes.bz || o.isInstancedMesh) continue;
      const wet = o.userData.organ || o.userData.inner;
      o.userData.chunkIn = true; o.updateMatrix();
      const g = o.geometry.clone(), P = g.attributes.position, n = P.count, a = new Float32Array(n * 4), v = new V3();
      for (let k = 0; k < n; k++) { v.fromBufferAttribute(P, k).applyMatrix4(o.matrix); a[k * 4] = v.x; a[k * 4 + 1] = v.y + off - A[1]; a[k * 4 + 2] = v.z; a[k * 4 + 3] = kind; }
      g.setAttribute('bz', new THREE.BufferAttribute(a, 4)); o.geometry = g;
      const orig = o.material, prev = orig.onBeforeCompile, pk = orig.customProgramCacheKey ? orig.customProgramCacheKey() : '', m = orig.clone();
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(orig, sh, r); chunkShader(sh, U, false);
        if (wet) sh.fragmentShader = sh.fragmentShader.replace('if (vBZ.w > 0.5 && chAny > 0.5) {', 'if (diffuseColor.r > 0.62 && diffuseColor.g > 0.52 && diffuseColor.b > 0.38) diffuseColor.rgb *= vec3(0.72, 0.5, 0.44);\nif (vBZ.w > 0.5 && chAny > 0.5) {');
      };
      m.userData = orig.userData; m.customProgramCacheKey = () => (wet ? 'chin' : 'chon') + pk; o.material = m;
    }
  }
}
function chunkCopy(from, to) {
  const a = from && from.userData.chunk, b = to && to.userData.chunk; if (!a || !b) return;
  b.T.set(a.T); b.H.set(a.H); chunkUniforms(to); b.HC = (a.HC || []).map(h => ({ c: h.c.clone(), r: h.r })); craterSync(to); if (a.any.value) chunkOpen(to);
  soakCopy(from, to);
}
function chunkReset(root) {
  const st = root && root.userData.chunk; if (!st) return; const was = st.open;
  st.T.fill(0); st.H.fill(0); st.any.value = 0; st.open = false; soakClear(root); st.HC = []; if (st.hcU) st.hcU.hcN.value = 0;
  for (const c of st.caps || []) c.visible = false;
  root.traverse(o => { if (o.isMesh && o.userData.chVis0 !== undefined) { o.visible = o.userData.chVis0; delete o.userData.chVis0; } });
  if (was) root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) { o.material.side = o.geometry.attributes.fab ? THREE.DoubleSide : THREE.FrontSide; o.material.needsUpdate = true; } });
}
// distance from a point to a segment
function segDist(p, a, b) { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(p); }
// a .50 through the head is a hydraulic burst: the cells along its track and round the exit go, and two to four more of the
// cranium with them. Through the trunk, the cell it leaves by
function chunkShot(root, p, dir, frame, skin) {
  if (!root) return { t: 0, h: 0 };
  if (frame === 'head') {
    // a .50 through the head: a small entry and a big blown-out exit, the cavity between them
    const ex = p.clone().addScaledVector(dir, 0.13);
    headCrater(root, p.clone().addScaledVector(dir, 0.015), 0.03, dir, skin, true);
    return headCrater(root, ex, rnd(0.07, 0.085), dir, skin);
  }
  if (frame === 'spine' || frame === 'hips') {
    const ex = p.clone().addScaledVector(dir, 0.22); let best = null, bd = 0.13;
    for (const c of chunkCenters(root)) if (c.k === 'T') { const d = c.p.distanceTo(ex); if (d < bd) { bd = d; best = c; } }
    const r = best ? destroyChunks(root, c => c.k === 'T' && c.i === best.i, dir, skin) : { t: 0, h: 0 };
    chunkTubes(root);   // a second round through a cell already gone still has to take its new wound channel with it
    return r;
  }
  return { t: 0, h: 0 };
}
const chunkCount = (root, k) => { const st = root && root.userData.chunk; if (!st) return 0; if (k === 'H') return headGone(root) ? CH_GIB : (st.HC || []).length; let n = 0; for (const v of st[k]) n += v > 0.5 ? 1 : 0; return n; };
// ---------------------------------------------------------------- head craters
// A head is too small for cells: chunks of it read as random shards. What a big round does to a head is blow out one part of
// it, so the head carries up to eight craters (body-frame centre and radius). Inside a crater everything (skin, hair, skull,
// brain, eyes) is gone; the crater's wall is drawn as a solid cavity (scalp, skull, then brain), so the hole is one clean wound.
function craterSync(root) {
  const st = root.userData.chunk; if (!st || !st.hcU) return; const H = st.HC || [];
  H.forEach((h, i) => st.hcU.hc.value[i].set(h.c.x, h.c.y, h.c.z, h.r)); st.hcU.hcN.value = H.length;
  for (const m of st.craters || []) { const i = m.userData.ci, h = H[i]; m.visible = !!h; if (h) { m.position.copy(h.c); m.scale.setScalar(h.r); m.material.userData.cC.value.set(h.c.x, h.c.y, h.c.z, h.r); } }
}
const headGone = root => { const H = (root && root.userData.chunk && root.userData.chunk.HC) || []; let s = 0, m = 0; for (const h of H) { s += h.r; m = Math.max(m, h.r); } return s >= 0.16 || m >= 0.095; };
// a crater at the world point wp, radius r. Returns { t: 0, h: 1 } like destroyChunks when it took something
function headCrater(root, wp, r, dir, skin, quiet) {
  if (!root) return { t: 0, h: 0 }; chunkUniforms(root); const at = root.userData.chunkAt; if (!at || !at.head) return { t: 0, h: 0 };
  const g = at.head[0]; for (let q = g; q; q = q.parent) if (!q.visible) return { t: 0, h: 0 };
  const f = soakFrame(root, 'head', g, g.worldToLocal(wp.clone())); if (!f) return { t: 0, h: 0 };
  const c = f[1]; c.x = clamp(c.x, -0.09, 0.09); c.y = clamp(c.y, -0.07, 0.17); c.z = clamp(c.z, -0.15, 0.06);
  const st = root.userData.chunk, H = st.HC = st.HC || [];
  let hit = H.find(h => h.c.distanceTo(c) < Math.max(h.r, r) * 0.7);
  if (hit) { hit.r = Math.min(0.11, Math.max(hit.r, r) * 1.12); hit.c.lerp(c, 0.3); }
  else { if (H.length >= HC_MAX) { H.sort((a, b) => b.r - a.r); H.pop(); } H.push({ c: c.clone(), r }); }
  if (!quiet && typeof spawnGore === 'function') {
    const k = r / 0.07;
    spawnGore(wp, dir, 'skull', Math.round(4 * k), 4, 0.5, 0.03, skin); spawnGore(wp, dir, 'brain', Math.round(4 * k), 3.5, 0.5, 0.026, skin);
    spawnGore(wp, dir, 'flesh', Math.round(5 * k), 4, 0.55, 0.022, skin); spawnGore(wp, dir, 'bone', Math.round(2 * k), 4.5, 0.55, 0.012, skin);
    if (typeof bloodFx === 'function') bloodFx(wp, dir, true, 1 + k);
    if (typeof brainSmears === 'function') brainSmears(wp, dir, 2 + Math.floor(k * 2));
  }
  craterSync(root); chunkOpen(root); if (typeof chunkNet === 'function') chunkNet(root);
  chunkIslands(root, dir);
  { const h = H.find(x => x.c.distanceTo(c) < x.r + 0.01) || { c, r }; woundBlood(root, [{ seg: 'head', c: h.c.clone(), r: h.r, off: 0, mid: new V3(0, 0.08, -0.03) }], dir); }
  return { t: 0, h: 1 };
}
const CRATER_GEO = new THREE.IcosahedronGeometry(1, 3);
function chunkCraters(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !at.head || st.craters) return; st.craters = [];
  const A = at.head, H = CAP_HF[2], tex = st.hf2 || (st.hf2 = capDepthMap(root, 2)), U = chunkUniforms(root);
  const box = new THREE.Group(); box.position.y = A[1]; box.userData.keep = true; A[0].add(box);
  for (let i = 0; i < HC_MAX; i++) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0, side: THREE.BackSide, flatShading: true });
    const CU = { hf: { value: tex }, hfR: { value: new THREE.Vector4(H.X0, H.X1, H.Y0, H.Y1) }, hfZ: { value: new THREE.Vector2(H.Z0, H.Z1) }, cC: { value: new THREE.Vector4() }, cI: { value: i } };
    m.userData.cC = CU.cC;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, CU); sh.uniforms.hc = U.hc; sh.uniforms.hcN = U.hcN; sh.uniforms.chT = U.chT; sh.uniforms.chH = U.chH; sh.uniforms.chAny = U.chAny;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 cC;\nvarying vec3 vQ;\nvarying vec3 vWN;')
        .replace('#include <common>', '#include <common>\nuniform float cI;\nfloat cvH(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
        // the wall is not a smooth bowl: broken bone and torn tissue push it out unevenly, in flat-faced lumps
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= 1.0 + cvH(position * 5.0 + cI * 3.1) * 0.09 + cvH(position * 12.0 + 7.0) * 0.04;\nvQ = transformed * cC.w + cC.xyz; vWN = normalize(mat3(modelMatrix) * -normal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CHUNK_F + 'uniform sampler2D hf;\nuniform vec4 hfR;\nuniform vec2 hfZ;\nuniform vec4 cC;\nuniform float cI;\nvarying vec3 vQ;\nvarying vec3 vWN;\n')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
for (int j = 0; j < ${HC_MAX}; j++) { if (float(j) >= hcN) break; if (abs(float(j) - cI) < 0.5) continue; if (length(vQ - hc[j].xyz) < hc[j].w) discard; }
vec4 hft = texture2D(hf, vec2((vQ.x - hfR.x) / (hfR.y - hfR.x), (vQ.y - hfR.z) / (hfR.w - hfR.z)));
if (hft.b < 0.6) discard;
float zl = mix(hfZ.x, hfZ.y, hft.r), zh = mix(hfZ.x, hfZ.y, hft.g);
if (vQ.z < zl - 0.004 || vQ.z > zh + 0.004) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 q = vQ; float d = min(min(q.z - zl, zh - q.z), (hft.b - 0.6) * 0.09) + (chN(q * 18.0) - 0.5) * 0.006;
  vec3 blood = chS(mix(vec3(0.22, 0.025, 0.02), vec3(0.38, 0.05, 0.04), chN(q * 120.0)));
  vec3 bone = mix(chS(vec3(0.66, 0.56, 0.47)), blood, chN(q * 70.0) * 0.5);
  float fold = smoothstep(0.35, 0.65, chN(q * vec3(90.0, 60.0, 90.0) + chN(q * 25.0) * 2.0));
  vec3 brain = mix(chS(mix(vec3(0.5, 0.33, 0.32), vec3(0.34, 0.17, 0.17), fold)), blood, smoothstep(0.3, 0.7, chN(q * 20.0)) * 0.8);
  vec3 c = d < 0.004 ? chS(vec3(0.33, 0.07, 0.06)) : d < 0.012 ? bone : brain;
  if (q.y < -0.03 && d >= 0.012) c = chS(mix(vec3(0.34, 0.06, 0.05), vec3(0.48, 0.1, 0.08), chN(q * 90.0)));
  c = mix(c, blood * 0.8, smoothstep(0.2, 0.9, vWN.y) * 0.6);
  diffuseColor.rgb = c; }`);
    };
    m.customProgramCacheKey = () => 'crater';
    const mesh = new THREE.Mesh(CRATER_GEO, m); mesh.userData.ci = i; mesh.userData.keep = true; mesh.userData.chCap = true; mesh.visible = false; mesh.frustumCulled = false; mesh.receiveShadow = true;
    box.add(mesh); st.craters.push(mesh);
  }
  craterSync(root);
}

// ---------------------------------------------------------------- the wound itself: blood round a blown-out hole
// Round the edge of a crater or a hole in the trunk the skin and hair are soaked dark, wet blood sits on the surface and runs,
// and on a body that is down the hole keeps welling and pumping out in pulses for a while. No solid pieces.
function woundBlood(root, pts, dir) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st) return;
  root.updateMatrixWorld(true); const rg = root.userData.ragObj; let made = 0, anch = 0;
  for (const P of pts) {
    const A = at[P.seg]; if (!A) continue;
    for (let k = 0; k < 20 && made < 8 * pts.length; k++) {
      const u = new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(), q = P.c.clone().addScaledVector(u, P.r + rnd(0.004, 0.014));
      const lp = new V3(q.x, q.y + P.off + A[1], q.z), wp = A[0].localToWorld(lp.clone()); if (chunkGoneAt(root, wp)) continue;
      const n = q.clone().sub(P.mid); if (P.seg !== 'head') n.y *= 0.3; n.normalize();
      // the wet blood is laid on the skin out along that way (it finds the surface itself)
      const sq = P.mid.clone().addScaledVector(n, P.seg === 'head' ? 0.09 : 0.14), sp = new V3(sq.x, sq.y + P.off + A[1], sq.z);
      if (typeof liquidBlood === 'function' && !chunkGoneAt(root, A[0].localToWorld(sp.clone()))) liquidBlood(A[0], sp, n, rnd(0.03, 0.05), 14, made % 2 ? 1 : 2, 0);
      // and the skin, hair and clothes round the hole are soaked dark at once
      if (made % 2 === 0 && typeof addSoak === 'function') addSoak(root, P.seg, A[0], lp, P.seg === 'head' ? 0.12 : 0.17, 10);
      // the hole keeps bleeding where the body lies: a pumping point on its edge
      if (rg && anch < 3 && made % 2 === 0) { const a = new THREE.Object3D(); a.position.copy(lp); a.userData.cavity = true; A[0].add(a); rg.anchors.push({ m: a, n: n.clone(), spurt: rnd(6, 10) }); anch++; }
      made++;
    }
    // a wet gush out of the hole as it opens
    if (typeof spawnDrop === 'function') { const c = A[0].localToWorld(new V3(P.c.x, P.c.y + P.off + A[1], P.c.z));
      for (let i = 0; i < 26; i++) spawnDrop(c, (dir || _Y).clone().multiplyScalar(rnd(0.3, 1.6)).add(new V3(rnd(-0.8, 0.8), rnd(-0.2, 1), rnd(-0.8, 0.8))), rnd(0.002, 0.0045)); }
  }
  if (rg && anch) { rg.bleedR += 25 * anch; rg.asleep = false; }
}
// ---------------------------------------------------------------- loose pieces
// Whatever the damage leaves with nothing joining it to the rest of the body comes away as its own piece with its own
// physics: a trunk cell (or a group of them) cut off from the rest, a strip of scalp or an eye left between two head craters,
// an arm, a leg or the head whose root on the trunk is gone. Done on ragdolls (a standing body that loses that much is dead,
// and its ragdoll runs this when it is made). Every client works it out the same from the same sets.
let CH_GRAPH = null;
// which trunk cells touch inside the body: worked out once from a body's own shape (its trunk skin, and points part way in)
function chunkGraph(root) {
  if (CH_GRAPH) return CH_GRAPH;
  const pts = []; let cz = 0;
  root.traverse(o => { if (!o.isMesh || !o._skin) return; const b = o.geometry.attributes.bz; if (!b) return;
    for (let i = 0; i < b.count; i += 2) if (Math.abs(b.getW(i) - 1) < 0.1) { pts.push(new V3(b.getX(i), b.getY(i), b.getZ(i))); cz += b.getZ(i); } });
  if (pts.length < 50) return null; cz /= pts.length;
  const nodes = []; for (const p of pts) for (const k of [1, 0.66, 0.33, 0]) nodes.push(new V3(p.x * k, p.y, cz + (p.z - cz) * k));
  const cell = nodes.map(n => chunkCell('T', n)), adj = Array.from({ length: CH_N.T }, () => new Set()), has = new Array(CH_N.T).fill(false);
  const h = 0.03, B = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  nodes.forEach((n, i) => { has[cell[i]] = true; const k = key(Math.floor(n.x / h), Math.floor(n.y / h), Math.floor(n.z / h)); (B.get(k) || B.set(k, []).get(k)).push(i); });
  nodes.forEach((n, i) => { const X = Math.floor(n.x / h), Y = Math.floor(n.y / h), Z = Math.floor(n.z / h);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of B.get(key(X + dx, Y + dy, Z + dz)) || [])
      if (cell[j] !== cell[i] && n.distanceToSquared(nodes[j]) < h * h) { adj[cell[i]].add(cell[j]); adj[cell[j]].add(cell[i]); } });
  return (CH_GRAPH = { adj, has });
}
// a world point in the trunk's body frame
function trunkBZ(root, wp) {
  const at = root.userData.chunkAt; let lp = null;
  for (const [seg, off] of [['spine', 0.07], ['hips', 0]]) { const A = at && at[seg]; if (!A) continue; const l = A[0].worldToLocal(wp.clone()); l.y += off - A[1]; lp = l; if ((seg === 'spine') === (l.y > 0.07)) return l; }
  return lp;
}
// the trunk cells a joint hangs on: the cell it is in and those within 4 cm of it
const _ciO = [[0, 0, 0], [0.04, 0, 0], [-0.04, 0, 0], [0, 0.04, 0], [0, -0.04, 0], [0, 0, 0.04], [0, 0, -0.04]];
function jointCells(root, wp) { const q = trunkBZ(root, wp); if (!q) return []; const S = new Set(); for (const o of _ciO) S.add(chunkCell('T', new V3(q.x + o[0], q.y + o[1], q.z + o[2]))); return [...S]; }
function chunkIslands(root, dir) {
  const st = root && root.userData.chunk, r = root && root.userData.ragObj; if (!st || !r || root.userData.chunkHold || !st.any.value) return;
  root.updateMatrixWorld(true);
  dir = dir ? dir.clone().normalize() : new V3(0, 1, 0); trunkIslands(root, st, r, dir); headIslands(root, st, r, dir);
}
function trunkIslands(root, st, r, dir) {
  if (!st.T.some(v => v > 0.5)) return; const G = chunkGraph(root); if (!G) return;
  const alive = i => G.has[i] && st.T[i] < 0.5, comp = new Array(CH_N.T).fill(-1), comps = [];
  for (let i = 0; i < CH_N.T; i++) { if (!alive(i) || comp[i] >= 0) continue; const c = [i]; comp[i] = comps.length;
    for (let k = 0; k < c.length; k++) for (const j of G.adj[c[k]]) if (alive(j) && comp[j] < 0) { comp[j] = comps.length; c.push(j); }
    comps.push(c); }
  // what hangs on the trunk: the legs (and with them the pelvis the ragdoll is built round) count most, then the arms and the neck
  const J = [];
  for (const [seg, bit, w] of [[4, 16, 3], [6, 64, 3], [0, 1, 1], [2, 4, 1]]) if (r.limbs.some(l => l.seg === seg && l.first)) J.push({ bit, w, cells: jointCells(root, r.p[RAG_LIMBS[seg][0]]) });
  if (r.headG.visible && !r.headGone) J.push({ head: true, w: 1, cells: jointCells(root, r.torso.localToWorld(new V3(0, 0.29, 0))) });
  let main = -1, best = -1;
  comps.forEach((c, ci) => { let sc = c.length * 0.01; for (const j of J) if (j.cells.some(x => comp[x] === ci)) sc += j.w; if (sc > best) { best = sc; main = ci; } });
  comps.forEach((c, ci) => { if (ci === main) return; trunkFragment(root, r, c, dir); for (const i of c) st.T[i] = 1; });
  if (comps.length > 1) { chunkOpen(root); if (typeof chunkNet === 'function') chunkNet(root); }
  // whatever no longer hangs on the part of the trunk that is left comes off
  for (const j of J) { if (j.cells.some(x => comp[x] === main && main >= 0)) continue;
    if (j.head) { if (typeof r.dropHead === 'function') r.dropHead(r.torso.localToWorld(new V3(0, 0.3, 0))); }
    else if (!(r.lostMask & j.bit)) r.applyLost(r.lostMask | j.bit, dir); }
}
// the cells c of a ragdoll's trunk as a piece of their own: a copy of the trunk drawn with every other cell gone, so it shows
// the same solid cut faces all round
function trunkFragment(root, r, cells, dir) {
  const at = root.userData.chunkAt, st = root.userData.chunk, piece = copySegment(r.torso);
  const T = new Float32Array(CH_N.T).fill(1); for (const i of cells) T[i] = 0;
  const U = { chT: { value: T }, chH: { value: new Float32Array(CH_N.H) }, chAny: { value: 1 }, hc: { value: Array.from({ length: HC_MAX }, () => new THREE.Vector4()) }, hcN: { value: 0 } };
  for (const m of [...piece.children]) {
    // only the skin and clothes are cut to the piece; anything else on the trunk (organs, armour, pouches) is left out of it
    if (!m._skin || m.userData.armor) { piece.remove(m); continue; }
    Object.assign(m._skin.U, U, st.sk); m.material.side = THREE.DoubleSide;
  }
  // and the solid cut faces all round it
  for (const seg of ['hips', 'spine']) { const cm = capMesh(root, seg, U); if (cm) { cm.visible = true; piece.add(cm); } }
  // centred on the middle of the cells it is made of, which are also what it rests on
  const loc = cells.map(i => { const s = CH_SEEDS.T[i], spine = s.y > 0.07, A = at[spine ? 'spine' : 'hips']; return A[0].localToWorld(new V3(s.x, s.y + (spine ? -0.07 : 0) + A[1], s.z)); });
  const c = new V3(); for (const p of loc) c.add(p); c.multiplyScalar(1 / loc.length);
  const g = new THREE.Group(); g.position.copy(c); scene.add(g); scene.add(piece); piece.updateMatrixWorld(true); g.updateMatrixWorld(true); g.attach(piece);
  const samp = []; for (const p of loc) { const q = p.clone().sub(c); samp.push(q.x, q.y, q.z); }
  const v = r.p[1].clone().sub(r.q[1]).multiplyScalar(120).add(c.clone().sub(r.torso.getWorldPosition(new V3())).normalize().multiplyScalar(rnd(0.5, 1.2))).addScaledVector(dir, rnd(0.3, 1)); v.y += rnd(0.4, 1);
  if (typeof goreThrow === 'function') goreThrow(g, v, new V3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), new Float32Array(samp), 0.045, 0.06);
  if (typeof bloodFx === 'function') bloodFx(c, v.clone().normalize(), true, 0.6);
}
// the head: its surface and points part way in toward the middle, every one not inside a crater; what is not joined (within
// a centimetre and a half) to the bottom of the head, where the neck holds it, is loose
function headIslands(root, st, r, dir) {
  const H = st.HC || []; if (!H.length || !r.headG.visible || r.headGone) return;
  const at = root.userData.chunkAt, A = at && at.head; if (!A) return;
  const pts = [];
  A[0].traverse(o => { if (!o.isMesh || !o.visible) return; const b = o.geometry.attributes.bz; if (!b) return;
    for (let i = 0; i < b.count; i += 3) if (Math.abs(b.getW(i) - 2) < 0.1) pts.push(new V3(b.getX(i), b.getY(i), b.getZ(i))); });
  if (pts.length < 30) return;
  const cc = new V3(0, 0.08, -0.03), nodes = []; for (const p of pts) for (const k of [1, 0.6, 0.25]) nodes.push(cc.clone().lerp(p, k));
  const live = nodes.filter(n => H.every(h => n.distanceTo(h.c) > h.r + 0.004)); if (!live.length) return;
  let lo = 1e9; for (const n of live) lo = Math.min(lo, n.y);
  const hh = 0.015, B = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  live.forEach((n, i) => { const k = key(Math.floor(n.x / hh), Math.floor(n.y / hh), Math.floor(n.z / hh)); (B.get(k) || B.set(k, []).get(k)).push(i); });
  const seen = new Array(live.length).fill(false), comps = [];
  for (let s = 0; s < live.length; s++) { if (seen[s]) continue; const c = [s]; seen[s] = true;
    for (let k = 0; k < c.length; k++) { const n = live[c[k]], X = Math.floor(n.x / hh), Y = Math.floor(n.y / hh), Z = Math.floor(n.z / hh);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of B.get(key(X + dx, Y + dy, Z + dz)) || [])
        if (!seen[j] && n.distanceToSquared(live[j]) < hh * hh) { seen[j] = true; c.push(j); } }
    comps.push(c); }
  if (comps.length < 2) return;
  // the piece the neck holds: the one reaching lowest
  let main = -1; comps.forEach((c, ci) => { if (c.some(i => live[i].y < lo + 0.02) && (main < 0 || c.length > comps[main].length)) main = ci; });
  comps.forEach((c, ci) => {
    if (ci === main) return;
    const m = new V3(); for (const i of c) m.add(live[i]); m.multiplyScalar(1 / c.length); let rad = 0; for (const i of c) rad = Math.max(rad, live[i].distanceTo(m));
    // it comes off the head (a crater over it, or the nearest crater grown over it), and is thrown as skull and scalp
    if (H.length < HC_MAX) H.push({ c: m.clone(), r: Math.min(0.11, rad + 0.008) });
    else { let b = H[0]; for (const h of H) if (h.c.distanceTo(m) - h.r < b.c.distanceTo(m) - b.r) b = h; b.r = Math.min(0.11, Math.max(b.r, b.c.distanceTo(m) + rad + 0.008)); }
    if (c.length > 6 && typeof spawnGore === 'function') { const wp = A[0].localToWorld(new V3(m.x, m.y + A[1], m.z)), out = wp.clone().sub(A[0].localToWorld(new V3(cc.x, cc.y + A[1], cc.z))).normalize();
      spawnGore(wp, out.addScaledVector(dir, 0.3), 'skull', clamp(Math.round(rad / 0.02), 1, 4), rnd(0.8, 1.6), 0.6, clamp(rad * 0.8, 0.012, 0.045), r.skin);
      spawnGore(wp, out, 'flesh', 2, rnd(0.6, 1.2), 0.6, 0.012); }
  });
  craterSync(root); chunkOpen(root); if (typeof chunkNet === 'function') chunkNet(root);
}


// online: what is gone from a player's body is the same for everyone. Whoever works it out sends the body's whole set; the
// rest take it (sets only ever grow, so the order messages arrive in does not matter)
let CHUNK_RX = false;
function chunkOwner(root) {
  if (typeof S === 'undefined' || S.mode !== 'online') return null;
  if (root === localBody.root || (P.rag && root === P.rag.group)) return S.myId;
  for (const [id, r] of S.remotes) if (root === r.hum.root || (r.rag && root === r.rag.group) || (r.deadRag && root === r.deadRag.group)) return id;
  return null;
}
function chunkNet(root) {
  if (CHUNK_RX) return; const id = chunkOwner(root); if (id == null) return;
  const st = root.userData.chunk, T = [], H = [];
  st.T.forEach((v, i) => { if (v > 0.5) T.push(i); });
  const C = []; for (const h of st.HC || []) C.push(+h.c.x.toFixed(3), +h.c.y.toFixed(3), +h.c.z.toFixed(3), +h.r.toFixed(3));
  net.send({ t: 'x', a: 'chk', i: 0, p: [0, 0, 0], tg: id, T, H, C });
}
function chunkRx(m) {
  const roots = m.tg === S.myId ? [localBody.root, P.rag && P.rag.group] : (() => { const r = S.remotes.get(m.tg); return r ? [r.hum.root, r.rag && r.rag.group, r.deadRag && r.deadRag.group] : []; })();
  for (const root of roots) {
    const st = root && root.userData.chunk; if (!st) continue; let n = 0;
    for (const i of m.T || []) if (i >= 0 && i < CH_N.T && !(st.T[i] > 0.5)) { st.T[i] = 1; n++; }
    if (Array.isArray(m.C)) { chunkUniforms(root); const Hc = st.HC = st.HC || []; for (let k = 0; k + 3 < m.C.length && k < HC_MAX * 4; k += 4) { const c = new V3(+m.C[k], +m.C[k + 1], +m.C[k + 2]), r = clamp(+m.C[k + 3] || 0, 0, 0.11); if (!(r > 0) || Hc.some(h => h.c.distanceTo(c) < 0.005 && Math.abs(h.r - r) < 0.003)) continue; if (Hc.length >= 4) Hc.shift(); Hc.push({ c, r }); n++; } if (n) craterSync(root); }
    if (n || Array.isArray(m.C)) { CHUNK_RX = true; try { if (n) chunkOpen(root); chunkIslands(root); } finally { CHUNK_RX = false; } }
  }
}
// ---------------------------------------------------------------- solid cut faces
// Where a gone cell meets one still there, the body shows a solid cross-section (skin, fat, muscle, ribs and spine; on the
// head scalp, skull and brain), so a hole is a filled cut, not a view into an empty shell. Every pair of neighbouring cells
// has a face on the plane halfway between their seeds, subdivided and pushed by the same warp the skin uses, so it lies on
// the torn boundary the skin shows. A face is drawn only when exactly one of its two cells is gone, only where those two
// really are the nearest cells, and only inside the body's outline (a front/back depth map made from that body's own mesh).
// It is an ordinary lit material: it takes the scene's light, shadows and fog like the rest of the body.
const CAP_HF = { 1: { X0: -0.25, X1: 0.25, NX: 26, Y0: -0.17, Y1: 0.62, NY: 40, Z0: -0.22, Z1: 0.22 }, 2: { X0: -0.115, X1: 0.115, NX: 16, Y0: -0.115, Y1: 0.19, NY: 22, Z0: -0.16, Z1: 0.16 } };
function capDepthMap(root, w) {
  const H = CAP_HF[w], n = H.NX * H.NY, lo = new Float32Array(n).fill(9), hi = new Float32Array(n).fill(-9);
  const pts = [];
  root.traverse(o => {
    const a = o.isMesh && o._skin && o.geometry.attributes.bz; if (!a) return;
    for (let i = 0; i < a.count; i++) if (Math.abs(a.getW(i) - w) < 0.5) pts.push(a.getX(i), a.getY(i), a.getZ(i));
  });
  let mid = 0; for (let i = 2; i < pts.length; i += 3) mid += pts[i]; mid /= Math.max(1, pts.length / 3);
  // the front surface from the vertices in front of the middle, the back from those behind it
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    const ix = Math.floor((x - H.X0) / (H.X1 - H.X0) * H.NX), iy = Math.floor((y - H.Y0) / (H.Y1 - H.Y0) * H.NY);
    if (ix < 0 || iy < 0 || ix >= H.NX || iy >= H.NY) continue;
    const k = iy * H.NX + ix; if (z < mid) lo[k] = Math.min(lo[k], z); else hi[k] = Math.max(hi[k], z);
  }
  // a texel no vertex fell in, with filled texels both sides of it (along the row, then the column), is filled in between
  const fill = (A, none, count, len, at) => {
    for (let r = 0; r < count; r++) {
      let prev = -1;
      for (let s = 0; s < len; s++) {
        const k = at(r, s); if (A[k] === none) continue;
        if (prev >= 0 && s - prev > 1) { const a = at(r, prev); for (let t = prev + 1; t < s; t++) { const m = at(r, t); if (A[m] === none) A[m] = A[a] + (A[k] - A[a]) * (t - prev) / (s - prev); } }
        prev = s;
      }
    }
  };
  for (const [A, none] of [[lo, 9], [hi, -9]]) { fill(A, none, H.NY, H.NX, (r, s) => r * H.NX + s); fill(A, none, H.NX, H.NY, (r, s) => s * H.NX + r); }
  // one more ring outward, so the cut faces reach right to the skin at the body's sides
  { const L0 = lo.slice(), H0 = hi.slice();
    for (let y = 0; y < H.NY; y++) for (let x = 0; x < H.NX; x++) { const k = y * H.NX + x; if (L0[k] < 9 && H0[k] > -9) continue;
      let sl = 0, sh = 0, c = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= H.NX || Y >= H.NY) continue; const j = Y * H.NX + X; if (L0[j] < 9 && H0[j] > -9) { sl += L0[j]; sh += H0[j]; c++; } }
      if (c) { lo[k] = sl / c; hi[k] = sh / c; } } }
  const ins = w === 2 ? 0.002 : 0.004;
  const d = new Uint8Array(n * 4), q = v => Math.round(clamp((v - H.Z0) / (H.Z1 - H.Z0), 0, 1) * 255);
  for (let k = 0; k < n; k++) {
    const ok = lo[k] < 9 && hi[k] > -9 && hi[k] - lo[k] > 0.02;
    d[k * 4] = ok ? q(lo[k] + ins) : 255; d[k * 4 + 1] = ok ? q(hi[k] - ins) : 0; d[k * 4 + 2] = ok ? 255 : 0; d[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, H.NX, H.NY, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
const CAP_MAIN = `
if (vShow < 0.5) discard;
if (vQ.y < yR.x || vQ.y > yR.y) discard;
{ vec3 qj = vQ + chWarp(vQ); int ni = chNear(qj, cK); if (ni != int(vCC.x + 0.5) && ni != int(vCC.y + 0.5)) discard; }
vec4 hft = texture2D(hf, vec2((vQ.x - hfR.x) / (hfR.y - hfR.x), (vQ.y - hfR.z) / (hfR.w - hfR.z)));
if (hft.b < 0.6) discard;
float zl = mix(hfZ.x, hfZ.y, hft.r), zh = mix(hfZ.x, hfZ.y, hft.g);
if (vQ.z < zl || vQ.z > zh) discard;
`;
const CAP_COL = `
{
  vec3 q = vQ;
  float d = min(min(q.z - zl, zh - q.z), (hft.b - 0.6) * 0.09) + (chN(q * 18.0) - 0.5) * 0.008;
  vec3 blood = chS(mix(vec3(0.24, 0.03, 0.025), vec3(0.4, 0.06, 0.045), chN(q * 120.0)));
  vec3 muscle = chS(mix(vec3(0.34, 0.06, 0.05), vec3(0.5, 0.11, 0.09), chN(q * 90.0)) * (0.85 + 0.25 * chN(q * vec3(300.0, 40.0, 300.0))));
  vec3 bone = mix(chS(vec3(0.7, 0.62, 0.52)), blood, chN(q * 70.0) * 0.45);
  vec3 c;
  if (cK > 1.5) {
    float fold = smoothstep(0.35, 0.65, chN(q * vec3(90.0, 60.0, 90.0) + chN(q * 25.0) * 2.0));
    vec3 brain = chS(mix(vec3(0.5, 0.34, 0.33), vec3(0.34, 0.17, 0.17), fold));
    brain = mix(brain, blood, smoothstep(0.35, 0.7, chN(q * 20.0)) * 0.75);
    c = d < 0.004 ? chS(vec3(0.35, 0.08, 0.07)) : d < 0.011 ? bone : brain;
    if (q.y < -0.03 && d >= 0.011) c = muscle;
  } else {
    float fat = 0.003 + 0.004 + 0.006 * chN(q * 9.0 + 2.0);
    c = d < 0.003 ? chS(vec3(0.42, 0.1, 0.08)) : d < fat ? mix(chS(vec3(0.62, 0.48, 0.3)), blood, chN(q * 60.0) * 0.55) : muscle;
    if (q.y > 0.08 && q.y < 0.5 && d > fat + 0.01 && d < fat + 0.02 && fract(q.y / 0.036 + chN(q * 8.0) * 0.3) < 0.28) c = mix(bone, blood, 0.35);
    if (abs(q.x) < 0.024 && zh - q.z > 0.03 && zh - q.z < 0.075 && q.y > -0.05) c = mix(bone, chS(vec3(0.45, 0.1, 0.09)), smoothstep(0.7, 0.9, fract(q.y / 0.032)));
    else if (d > 0.04 && q.y < 0.15 && q.z - zl < 0.12) c = chS(mix(vec3(0.55, 0.32, 0.3), vec3(0.4, 0.16, 0.16), chN(q * 45.0)));
  }
  c = mix(c, blood, smoothstep(0.6, 0.8, chN(q * 16.0)) * 0.55);
  // blood runs to the low side of a cut and lies on faces that point up
  c = mix(c, blood * 0.8, smoothstep(0.3, 0.9, vWN.y) * (0.4 + 0.4 * chN(q * 30.0)));
  diffuseColor.rgb = c;
}
`;
// neighbouring cells, and where their shared face lies: sample points through the region, and wherever the nearest and the
// second-nearest seeds are about equally near, that point is on their face
const CAP_FACES = (() => {
  let sd = 4242; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const out = {};
  for (const [k, lo, hi] of [['T', [-0.26, -0.18, -0.2], [0.26, 0.64, 0.16]], ['H', [-0.12, -0.12, -0.17], [0.12, 0.2, 0.08]]]) {
    const S = CH_SEEDS[k], F = new Map(), p = new V3();
    for (let n = 0; n < 60000; n++) {
      p.set(lo[0] + R() * (hi[0] - lo[0]), lo[1] + R() * (hi[1] - lo[1]), lo[2] + R() * (hi[2] - lo[2]));
      let a = -1, b = -1, da = 1e9, db = 1e9;
      for (let i = 0; i < S.length; i++) { const d = S[i].distanceTo(p); if (d < da) { db = da; b = a; da = d; a = i; } else if (d < db) { db = d; b = i; } }
      if (db - da > 0.008) continue;
      const key = Math.min(a, b) * 100 + Math.max(a, b); let f = F.get(key); if (!f) F.set(key, f = { a: Math.min(a, b), b: Math.max(a, b), pts: [] }); f.pts.push(p.clone());
    }
    out[k] = [...F.values()].filter(f => f.pts.length >= 3);
  }
  return out;
})();
function capGeo(k) {
  const S = CH_SEEDS[k], P = [], Nn = [], C = [], idx = [], N = 6;
  for (const f of CAP_FACES[k]) {
    const sa = S[f.a], sb = S[f.b], n = sb.clone().sub(sa).normalize(), mid = sa.clone().add(sb).multiplyScalar(0.5);
    const c = new V3(); for (const q of f.pts) c.add(q); c.multiplyScalar(1 / f.pts.length); c.addScaledVector(n, -c.clone().sub(mid).dot(n));
    let ext = 0; for (const q of f.pts) ext = Math.max(ext, q.clone().sub(c).addScaledVector(n, -q.clone().sub(c).dot(n)).length()); ext += 0.035;
    const u = new V3().crossVectors(n, Math.abs(n.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize(), v = new V3().crossVectors(n, u);
    const b0 = P.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const q = c.clone().addScaledVector(u, (i / N * 2 - 1) * ext).addScaledVector(v, (j / N * 2 - 1) * ext); P.push(q.x, q.y, q.z); Nn.push(n.x, n.y, n.z); C.push(f.a, f.b); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = b0 + j * (N + 1) + i; idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('cc', new THREE.Float32BufferAttribute(C, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new V3(0, k === 'T' ? 0.22 : 0.03, 0), 0.6);
  return g;
}
const _capGeo = {};
function chunkCaps(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st || st.caps) return; st.caps = [];
  const U = chunkUniforms(root);
  for (const seg of ['hips', 'spine']) { const mesh = capMesh(root, seg, U); if (mesh) { at[seg][0].add(mesh); st.caps.push(mesh); } }
}
// the cut faces of one trunk segment, drawn for the gone/not-gone pattern in U (a body's own, or a loose piece's)
function capMesh(root, seg, U) {
  const at = root.userData.chunkAt, st = root.userData.chunk;
  { const [k, ya, yb, off] = seg === 'hips' ? ['T', -1, 0.07, 0] : ['T', 0.07, 1, -0.07];
    const A = at[seg]; if (!A) return null;
    const w = k === 'T' ? 1 : 2, H = CAP_HF[w];
    const tex = st['hf' + w] || (st['hf' + w] = capDepthMap(root, w));
    const m = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    const CU = { hf: { value: tex }, hfR: { value: new THREE.Vector4(H.X0, H.X1, H.Y0, H.Y1) }, hfZ: { value: new THREE.Vector2(H.Z0, H.Z1) }, cK: { value: w }, yR: { value: new THREE.Vector2(ya, yb) } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, CU); sh.uniforms.chT = U.chT; sh.uniforms.chH = U.chH; sh.uniforms.chAny = U.chAny;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CHUNK_F + 'uniform float cK;\nattribute vec2 cc;\nvarying vec3 vQ;\nvarying vec2 vCC;\nvarying float vShow;\nvarying vec3 vWN;\n')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCC = cc; vShow = ((chGone(int(cc.x + 0.5), cK) > 0.5) != (chGone(int(cc.y + 0.5), cK) > 0.5)) ? 1.0 : 0.0;\ntransformed = position - normal * dot(chWarp(position), normal); vQ = transformed; vWN = normalize(mat3(modelMatrix) * normal);')
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (vShow < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CHUNK_F + 'uniform float cK;\nuniform sampler2D hf;\nuniform vec4 hfR;\nuniform vec2 hfZ;\nuniform vec2 yR;\nvarying vec3 vQ;\nvarying vec2 vCC;\nvarying float vShow;\nvarying vec3 vWN;\n')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CAP_MAIN)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + CAP_COL);
    };
    m.customProgramCacheKey = () => 'chcap' + w;
    const g = _capGeo[k] || (_capGeo[k] = capGeo(k));
    const mesh = new THREE.Mesh(g, m); mesh.position.y = A[1] + off; mesh.frustumCulled = false; mesh.receiveShadow = true;
    mesh.userData.chCap = true; mesh.userData.keep = true; mesh.castShadow = false;
    return mesh;
  }
}

// ---- module exports: build.mjs strips this block ----
export { BZ_SEG, CH_GIB, chunkCenters, chunkCopy, chunkCount, chunkGoneAt, chunkIslands, chunkReset, chunkRootOf, chunkRx, chunkShader, chunkShot, chunkTubes, chunkUniforms, destroyChunks, ensureBZ, headCrater };
// ---- end module exports ----
