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
const CH_N = { T: 48, H: 24 }, CH_GIB = 13;   // CH_GIB: head cells gone before the whole head counts as destroyed
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
uniform float chT[${CH_N.T}]; uniform float chH[${CH_N.H}]; uniform float chAny; varying vec4 vBZ;
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
  vec3 q = vBZ.xyz, qj = q + chWarp(q);
  int ci = chNear(qj, vBZ.w);
  if (chGone(ci, vBZ.w) > 0.5) discard;
  float dE = chEdge(qj, ci, vBZ.w);
  bool head = vBZ.w > 1.5;
  float bn = chN(q * 60.0);
  vec3 blood = chS(mix(vec3(0.24, 0.03, 0.025), vec3(0.42, 0.06, 0.045), chN(q * 140.0)));
  vec3 meat = chS(mix(vec3(0.36, 0.06, 0.05), vec3(0.5, 0.1, 0.08), chN(q * 110.0)) * (0.85 + 0.25 * chN(q * vec3(320.0, 45.0, 320.0))));
  vec3 layer = chS(head ? vec3(0.66, 0.58, 0.5) : vec3(0.62, 0.48, 0.3));
  layer = mix(layer, blood, bn * 0.6);
  if (gl_FrontFacing) {
    if (dE < 0.03) {
      vec3 c = diffuseColor.rgb;
      c = mix(c, c * vec3(0.45, 0.16, 0.14), (1.0 - smoothstep(0.01, 0.03, dE)) * 0.8);
      c = mix(c, blood, (1.0 - smoothstep(0.004, 0.014, dE)) * 0.7);
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
  sh.uniforms.chT = U.chT; sh.uniforms.chH = U.chH; sh.uniforms.chAny = U.chAny;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 bz;\nvarying vec4 vBZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBZ = bz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CHUNK_F).replace('#include <emissivemap_fragment>',
    CHUNK_MAIN.split('SOLID').join(solid ? 'true' : 'false') + '#include <emissivemap_fragment>');
}
function chunkUniforms(root) {
  const c = root.userData.chunk || (root.userData.chunk = { T: new Float32Array(CH_N.T), H: new Float32Array(CH_N.H), any: { value: 0 } });
  if (!c.sk) c.sk = soakUniforms();
  return Object.assign({ chT: { value: c.T }, chH: { value: c.H }, chAny: c.any }, c.sk);
}
// which cell a body-frame point is in
function chunkCell(k, q) { let bi = 0, bd = 1e9; const S = CH_SEEDS[k]; for (let i = 0; i < S.length; i++) { const d = S[i].distanceToSquared(q); if (d < bd) { bd = d; bi = i; } } return bi; }
// the centre of every cell (its seed), in the world, for a body (standing or ragdoll)
function chunkCenters(root) {
  const at = root.userData.chunkAt; if (!at) return [];
  const out = [];
  for (const k of ['T', 'H']) CH_SEEDS[k].forEach((s, i) => {
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
  }
  return res;
}
// a body with cells gone shows its inside: from then on the skin and clothes are drawn on both faces
function chunkOpen(root) {
  const st = root.userData.chunk; st.any.value = 1;
  if (!st.open) { st.open = true; root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) { o.material.side = THREE.DoubleSide; o.material.needsUpdate = true; } }); }
  chunkPrepInside(root); chunkTubes(root); chunkCaps(root); for (const c of root.userData.chunk.caps || []) c.visible = true;
}
// a wound channel (the walled tube along a bullet's track) running through a cell that is now gone would stand in open air:
// it goes with the cell
function chunkTubes(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st || !st.any.value) return; const v = new V3();
  for (const [seg, k, off] of [['hips', 'T', 0], ['spine', 'T', 0.07], ['head', 'H', 0]]) {
    const A = at[seg]; if (!A) continue; const arr = k === 'T' ? st.T : st.H;
    for (const o of A[0].children) {
      if (!o.userData.tube || !o.visible) continue; o.updateMatrix(); const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrix); v.y += off - A[1]; if (arr[chunkCell(k, v)] > 0.5) { o.visible = false; break; } }
    }
  }
}
// is a world point on a body inside a gone cell (raycasts don't see the shader's cut, so blood and wound walls check this)
function chunkGoneAt(root, wp) {
  const at = root && root.userData.chunkAt, st = root && root.userData.chunk; if (!at || !st || !st.any.value) return false;
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
  b.T.set(a.T); b.H.set(a.H); if (a.any.value) chunkOpen(to);
  soakCopy(from, to);
}
function chunkReset(root) {
  const st = root && root.userData.chunk; if (!st) return; const was = st.open;
  st.T.fill(0); st.H.fill(0); st.any.value = 0; st.open = false; soakClear(root);
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
    const a = p.clone().addScaledVector(dir, -0.02), b = p.clone().addScaledVector(dir, 0.24), ex = p.clone().addScaledVector(dir, 0.19);
    const cs = chunkCenters(root).filter(c => c.k === 'H'), hit = new Set(cs.filter(c => segDist(c.p, a, b) < 0.05 || c.p.distanceTo(ex) < 0.075).map(c => c.i));
    if (hit.size) { const up = cs.filter(c => !hit.has(c.i) && c.y > 0.05).sort(() => Math.random() - 0.5); for (const c of up.slice(0, 2 + Math.floor(Math.random() * 3))) hit.add(c.i); }
    return destroyChunks(root, c => c.k === 'H' && hit.has(c.i), dir, skin);
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
const chunkCount = (root, k) => { const st = root && root.userData.chunk; if (!st) return 0; let n = 0; for (const v of st[k]) n += v > 0.5 ? 1 : 0; return n; };

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
  st.T.forEach((v, i) => { if (v > 0.5) T.push(i); }); st.H.forEach((v, i) => { if (v > 0.5) H.push(i); });
  net.send({ t: 'x', a: 'chk', i: 0, p: [0, 0, 0], tg: id, T, H });
}
function chunkRx(m) {
  const roots = m.tg === S.myId ? [localBody.root, P.rag && P.rag.group] : (() => { const r = S.remotes.get(m.tg); return r ? [r.hum.root, r.rag && r.rag.group, r.deadRag && r.deadRag.group] : []; })();
  for (const root of roots) {
    const st = root && root.userData.chunk; if (!st) continue; let n = 0;
    for (const i of m.T || []) if (i >= 0 && i < CH_N.T && !(st.T[i] > 0.5)) { st.T[i] = 1; n++; }
    for (const i of m.H || []) if (i >= 0 && i < CH_N.H && !(st.H[i] > 0.5)) { st.H[i] = 1; n++; }
    if (n) { CHUNK_RX = true; try { chunkOpen(root); } finally { CHUNK_RX = false; } }
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
  for (const [seg, k, ya, yb, off] of [['hips', 'T', -1, 0.07, 0], ['spine', 'T', 0.07, 1, -0.07], ['head', 'H', -1, 1, 0]]) {
    const A = at[seg]; if (!A) continue;
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
    A[0].add(mesh); st.caps.push(mesh);
  }
}
