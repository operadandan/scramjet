// ---------------------------------------------------------------- body chunks: the torso and head can be destroyed piece by piece
// The trunk (pelvis to shoulders) is split into 36 blocks: 3 across, 6 up, front and back. The head into 18: 3 across, 3 up
// (jaw and lower face, eyes and cheekbones, cranium), front and back. A body looks exactly the same until a block is
// destroyed; then everything of that block (skin, clothes) is gone, the edges of the hole are torn raw flesh, and through it
// the inside of the body shows as meat. A blast takes out the blocks it reaches; a .50 takes out the blocks along its track.
// Each vertex carries its position in a fixed body frame (attribute bz: xyz, and w = 1 trunk, 2 head, 0 neither), so the
// same blocks line up on the standing body, on the ragdoll, and on every client.
const CHK = { T: { x0: -0.215, dx: 0.143, nx: 3, y0: -0.15, dy: 0.123, ny: 6, zs: -0.025, zc: 0.07 }, H: { x0: -0.095, dx: 0.19 / 3, nx: 3, y0: -0.1, dy: 0.265 / 3, ny: 3, zs: -0.06, zc: 0.06 } };
const BZ_SEG = { hips: [1, 0], spine: [1, 0.07], head: [2, 0] };
function ensureBZ(g, seg) {
  if (!g || g.attributes.bz) return g;
  const P = g.attributes.position, n = P.count, a = new Float32Array(n * 4), s = BZ_SEG[seg];
  if (s) for (let i = 0; i < n; i++) { a[i * 4] = P.getX(i); a[i * 4 + 1] = P.getY(i) + s[1]; a[i * 4 + 2] = P.getZ(i); a[i * 4 + 3] = s[0]; }
  g.setAttribute('bz', new THREE.BufferAttribute(a, 4)); return g;
}
const CHUNK_F = `
uniform float chT[36]; uniform float chH[18]; uniform float chAny; varying vec4 vBZ;
float chHs(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float chN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(chHs(i), chHs(i + vec3(1,0,0)), f.x), mix(chHs(i + vec3(0,1,0)), chHs(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(chHs(i + vec3(0,0,1)), chHs(i + vec3(1,0,1)), f.x), mix(chHs(i + vec3(0,1,1)), chHs(i + vec3(1,1,1)), f.x), f.y), f.z); }
float chCell(vec3 q, float k) {
  if (k < 1.5) { int ix = int(clamp(floor((q.x - (${CHK.T.x0.toFixed(4)})) / ${CHK.T.dx.toFixed(4)}), 0.0, 2.0)), iy = int(clamp(floor((q.y - (${CHK.T.y0.toFixed(4)})) / ${CHK.T.dy.toFixed(4)}), 0.0, 5.0)), iz = q.z < ${CHK.T.zs.toFixed(4)} ? 0 : 1; return chT[iz * 18 + iy * 3 + ix]; }
  int ix = int(clamp(floor((q.x - (${CHK.H.x0.toFixed(4)})) / ${CHK.H.dx.toFixed(4)}), 0.0, 2.0)), iy = int(clamp(floor((q.y - (${CHK.H.y0.toFixed(4)})) / ${CHK.H.dy.toFixed(4)}), 0.0, 2.0)), iz = q.z < ${CHK.H.zs.toFixed(4)} ? 0 : 1; return chH[iz * 9 + iy * 3 + ix];
}
`;
// How a destroyed block is drawn. The edge of the hole is a clean, slightly torn line (a gentle wobble, not speckle). Round it,
// on the outside, the skin is bruised and bloody for a couple of centimetres, then the cut edge shows the layers it is made of:
// skin, a band of yellow fat, then muscle (on the head: scalp, then a band of white skull). Seen through the hole, the inside of
// the body is drawn flat and bright like a cut face, so it reads as solid meat and not as the inside of a shell: muscle with
// its grain, the spine and ribs in the trunk, brain inside the skull.
const CHUNK_MAIN = `
float chCap = 0.0;
if (vBZ.w > 0.5 && chAny > 0.5) {
  vec3 q = vBZ.xyz, qj = q + (vec3(chN(q * 14.0), chN(q * 14.0 + 11.3), chN(q * 14.0 + 23.7)) - 0.5) * 0.026 + (vec3(chN(q * 75.0), chN(q * 75.0 + 5.1), chN(q * 75.0 + 9.7)) - 0.5) * 0.005;
  if (chCell(qj, vBZ.w) > 0.5) discard;
  float dE = 1.0;
  for (int k = 0; k < 4; k++) {
    float r = k == 0 ? 0.004 : k == 1 ? 0.009 : k == 2 ? 0.016 : 0.026;
    if (dE < 1.0) break;
    if (chCell(qj + vec3(r, 0.0, 0.0), vBZ.w) > 0.5 || chCell(qj - vec3(r, 0.0, 0.0), vBZ.w) > 0.5 || chCell(qj + vec3(0.0, r, 0.0), vBZ.w) > 0.5 ||
        chCell(qj - vec3(0.0, r, 0.0), vBZ.w) > 0.5 || chCell(qj + vec3(0.0, 0.0, r), vBZ.w) > 0.5 || chCell(qj - vec3(0.0, 0.0, r), vBZ.w) > 0.5) dE = r;
  }
  bool head = vBZ.w > 1.5;
  vec3 meat = mix(vec3(0.46, 0.05, 0.06), vec3(0.68, 0.14, 0.12), chN(q * 110.0)) * (0.8 + 0.35 * chN(q * vec3(320.0, 45.0, 320.0)));
  vec3 layer = head ? vec3(0.9, 0.86, 0.76) : vec3(0.92, 0.8, 0.52);
  if (gl_FrontFacing) {
    if (dE < 0.03) {
      vec3 c = diffuseColor.rgb;
      c = mix(c, c * vec3(0.55, 0.22, 0.22), (1.0 - smoothstep(0.012, 0.03, dE)) * 0.85);
      if (${'SOLID'}) {
        c = mix(c, layer, smoothstep(0.012, 0.008, dE) * (1.0 - smoothstep(0.006, 0.0035, dE)) * (head ? 1.0 : 0.85));
        c = mix(c, head ? vec3(0.78, 0.58, 0.58) : meat, smoothstep(0.006, 0.0035, dE));
      } else c = mix(c, vec3(0.3, 0.02, 0.03), (1.0 - smoothstep(0.004, 0.014, dE)) * 0.8);   // cloth: just soaked and frayed at the edge
      diffuseColor.rgb = c;
    }
  } else if (${'SOLID'}) {
    vec3 c = meat;
    if (head) {
      float f = abs(sin(q.x * 160.0 + chN(q * 30.0) * 6.0) * sin(q.z * 150.0 + q.y * 90.0));
      c = mix(vec3(0.6, 0.42, 0.43), vec3(0.4, 0.22, 0.24), smoothstep(0.75, 1.0, f)); c = mix(c, vec3(0.3, 0.02, 0.03), smoothstep(0.35, 0.65, chN(q * 22.0)) * 0.75);
    } else {
      // the spine down the back, darker clotted patches
      if (abs(q.x) < 0.028 && q.z > 0.02 && q.y > -0.05) c = mix(vec3(0.8, 0.72, 0.6), vec3(0.5, 0.1, 0.09), smoothstep(0.75, 0.9, fract(q.y / 0.032)));
      c = mix(c, vec3(0.28, 0.02, 0.03), smoothstep(0.62, 0.8, chN(q * 18.0)) * 0.6);
    }
    diffuseColor.rgb = c; chCap = 1.0;
  }
}
`;
function chunkShader(sh, U, solid) {
  if (!U.chT) Object.assign(U, { chT: { value: new Float32Array(36) }, chH: { value: new Float32Array(18) }, chAny: { value: 0 } });   // a cut-off piece: no blocks
  sh.uniforms.chT = U.chT; sh.uniforms.chH = U.chH; sh.uniforms.chAny = U.chAny;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 bz;\nvarying vec4 vBZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBZ = bz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CHUNK_F).replace('#include <emissivemap_fragment>',
    CHUNK_MAIN.split('SOLID').join(solid ? 'true' : 'false') + '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.32 * chCap;');
}
function chunkUniforms(root) {
  const c = root.userData.chunk || (root.userData.chunk = { T: new Float32Array(36), H: new Float32Array(18), any: { value: 0 } });
  return { chT: { value: c.T }, chH: { value: c.H }, chAny: c.any };
}
// the centre of every block, in the world, for a body (standing or ragdoll)
function chunkCenters(root) {
  const at = root.userData.chunkAt; if (!at) return [];
  const out = [];
  for (const k of ['T', 'H']) {
    const G = CHK[k], nz = 2, NN = G.nx * G.ny;
    for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) {
      const lx = G.x0 + (ix + 0.5) * G.dx, ly = G.y0 + (iy + 0.5) * G.dy, lz = G.zs + (iz ? G.zc : -G.zc);
      let seg = k === 'H' ? 'head' : ly > 0.07 ? 'spine' : 'hips'; const A = at[seg]; if (!A || !A[0].visible) continue;
      let vis = true; for (let q = A[0]; q; q = q.parent) if (!q.visible) { vis = false; break; } if (!vis) continue;
      const off = seg === 'spine' ? -0.07 : 0;
      out.push({ k, i: iz * NN + iy * G.nx + ix, iy, p: A[0].localToWorld(new V3(lx, ly + off + A[1], lz)) });
    }
  }
  return out;
}
function chunkRootOf(o) { for (; o; o = o.parent) if (o.userData && o.userData.chunk) return o; return null; }
// destroy the blocks pred() picks; gore flies from each. Returns how many trunk and head blocks went
function destroyChunks(root, pred, dir, skin) {
  const st = root && root.userData.chunk; if (!st) return { t: 0, h: 0 };
  const res = { t: 0, h: 0, pts: [] };
  for (const c of chunkCenters(root)) {
    const A = c.k === 'T' ? st.T : st.H; if (A[c.i] > 0.5 || !pred(c)) continue;
    A[c.i] = 1; if (c.k === 'T') res.t++; else res.h++; res.pts.push(c.p);
    const d = dir.clone().add(new V3(rnd(-0.4, 0.4), rnd(0, 0.5), rnd(-0.4, 0.4))).normalize();
    if (typeof spawnGore === 'function') {
      spawnGore(c.p, d, 'flesh', 4, 5, 0.8, 0.035, skin); spawnGore(c.p, d, 'bone', 2, 6, 0.8, 0.02, skin);
      if (c.k === 'H') { spawnGore(c.p, d, 'skull', 2, 5, 0.7, 0.03, skin); spawnGore(c.p, d, 'brain', c.iy > 0 ? 2 : 0, 4, 0.6, 0.03, skin); }
      else if (c.iy >= 1 && c.iy <= 4) spawnGore(c.p, d, c.iy >= 3 ? 'lung' : 'gut', 1, 4, 0.6, 0.035, skin);
    }
    if (typeof bloodFx === 'function') bloodFx(c.p, d, true);
  }
  if (res.t + res.h) { chunkOpen(root); if (typeof chunkNet === 'function') chunkNet(root); }
  return res;
}
// a body with blocks gone shows its inside: from then on the skin and clothes are drawn on both faces
function chunkOpen(root) {
  const st = root.userData.chunk; st.any.value = 1;
  if (!st.open) { st.open = true; root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) { o.material.side = THREE.DoubleSide; o.material.needsUpdate = true; } }); }
  chunkOrgans(root);
}
// what is inside: organs, ribs and spine whose block is gone go with it; the rest are now in view through the hole. The skull
// shell goes once a few head blocks are gone (the brain shows), the brain once most of the head is
function chunkCell(k, q) { const G = CHK[k]; const ix = clamp(Math.floor((q.x - G.x0) / G.dx), 0, G.nx - 1), iy = clamp(Math.floor((q.y - G.y0) / G.dy), 0, G.ny - 1), iz = q.z < G.zs ? 0 : 1; return iz * G.nx * G.ny + iy * G.nx + ix; }
// The organs, ribs, spine, skull and brain are cut by the same blocks as the skin (what was in a destroyed block is gone, the
// rest is in view through the hole). Done the first time a body loses a block. Bone in a body is not white: it is tinted wet.
function chunkPrepInside(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st || st.inPrep) return; st.inPrep = true;
  const U = chunkUniforms(root);
  for (const [seg, kind, off] of [['hips', 1, 0], ['spine', 1, 0.07], ['head', 2, 0]]) {
    const A = at[seg]; if (!A) continue;
    for (const o of A[0].children) {
      if (!o.isMesh || !(o.userData.organ || o.userData.inner) || o.userData.chunkIn) continue;
      o.userData.chunkIn = true; o.updateMatrix();
      const g = o.geometry.clone(), P = g.attributes.position, n = P.count, a = new Float32Array(n * 4), v = new V3();
      for (let k = 0; k < n; k++) { v.fromBufferAttribute(P, k).applyMatrix4(o.matrix); a[k * 4] = v.x; a[k * 4 + 1] = v.y + off - A[1]; a[k * 4 + 2] = v.z; a[k * 4 + 3] = kind; }
      g.setAttribute('bz', new THREE.BufferAttribute(a, 4)); o.geometry = g;
      const orig = o.material, prev = orig.onBeforeCompile, pk = orig.customProgramCacheKey ? orig.customProgramCacheKey() : '', m = orig.clone();
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(orig, sh, r); chunkShader(sh, U, false);
        sh.fragmentShader = sh.fragmentShader.replace('if (vBZ.w > 0.5 && chAny > 0.5) {', 'if (diffuseColor.r > 0.62 && diffuseColor.g > 0.52 && diffuseColor.b > 0.38) diffuseColor.rgb *= vec3(0.72, 0.5, 0.44);\nif (vBZ.w > 0.5 && chAny > 0.5) {');
      };
      m.userData = orig.userData; m.customProgramCacheKey = () => 'chin' + pk; o.material = m;
    }
  }
}
function chunkOrgans(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st) return;
  chunkPrepInside(root);
  const nH = chunkCount(root, 'H'), nT = chunkCount(root, 'T');
  for (const [seg, k] of [['hips', 'T'], ['spine', 'T'], ['head', 'H']]) {
    const A = at[seg]; if (!A || !(k === 'H' ? nH : nT)) continue;
    for (const o of A[0].children) if (o.isMesh && (o.userData.organ || o.userData.inner)) o.visible = true;
  }
}
function chunkCopy(from, to) {
  const a = from && from.userData.chunk, b = to && to.userData.chunk; if (!a || !b) return;
  b.T.set(a.T); b.H.set(a.H); if (a.any.value) chunkOpen(to);
}
function chunkReset(root) {
  const st = root && root.userData.chunk; if (!st) return; const was = st.open;
  st.T.fill(0); st.H.fill(0); st.any.value = 0; st.open = false;
  if (was) root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz) { o.material.side = o.geometry.attributes.fab ? THREE.DoubleSide : THREE.FrontSide; o.material.needsUpdate = true; } });
}
// distance from a point to a segment
function segDist(p, a, b) { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(p); }
// a .50 through the head takes out the blocks along its track, the exit side worst; through the trunk, the block it leaves by
function chunkShot(root, p, dir, frame, skin) {
  if (!root) return { t: 0, h: 0 };
  if (frame === 'head') {
    const a = p.clone().addScaledVector(dir, -0.02), b = p.clone().addScaledVector(dir, 0.24), ex = p.clone().addScaledVector(dir, 0.19);
    return destroyChunks(root, c => c.k === 'H' && (segDist(c.p, a, b) < 0.055 || c.p.distanceTo(ex) < 0.085), dir, skin);
  }
  if (frame === 'spine' || frame === 'hips') {
    const ex = p.clone().addScaledVector(dir, 0.22); let best = null, bd = 0.13;
    for (const c of chunkCenters(root)) if (c.k === 'T') { const d = c.p.distanceTo(ex); if (d < bd) { bd = d; best = c; } }
    return best ? destroyChunks(root, c => c.k === 'T' && c.i === best.i, dir, skin) : { t: 0, h: 0 };
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
    for (const i of m.T || []) if (i >= 0 && i < 36 && !(st.T[i] > 0.5)) { st.T[i] = 1; n++; }
    for (const i of m.H || []) if (i >= 0 && i < 18 && !(st.H[i] > 0.5)) { st.H[i] = 1; n++; }
    if (n) { CHUNK_RX = true; try { chunkOpen(root); } finally { CHUNK_RX = false; } }
  }
}
