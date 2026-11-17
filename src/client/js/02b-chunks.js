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
  } else if (${'SOLID'} && dE > 0.5) {
    discard;   // inside of the skin away from any cut: hidden, as on an unopened body
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
  chunkPrepInside(root); chunkCaps(root); for (const c of root.userData.chunk.caps || []) c.visible = true;
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
function chunkOrgans(root) {
  const at = root.userData.chunkAt, st = root.userData.chunk; if (!at || !st) return;
  chunkPrepInside(root);
  const nH = chunkCount(root, 'H'), nT = chunkCount(root, 'T');
  for (const [seg, k] of [['hips', 'T'], ['spine', 'T'], ['head', 'H']]) {
    const A = at[seg]; if (!A || !(k === 'H' ? nH : nT)) continue;
    for (const o of A[0].children) if (o.isMesh && (o.userData.organ || o.userData.inner)) { if (o.userData.chVis0 === undefined) o.userData.chVis0 = o.visible; o.visible = true; }
  }
}
function chunkCopy(from, to) {
  const a = from && from.userData.chunk, b = to && to.userData.chunk; if (!a || !b) return;
  b.T.set(a.T); b.H.set(a.H); if (a.any.value) chunkOpen(to);
}
function chunkReset(root) {
  const st = root && root.userData.chunk; if (!st) return; const was = st.open;
  st.T.fill(0); st.H.fill(0); st.any.value = 0; st.open = false;
  for (const c of st.caps || []) c.visible = false;
  root.traverse(o => { if (o.isMesh && o.userData.chVis0 !== undefined) { o.visible = o.userData.chVis0; delete o.userData.chVis0; } });
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
// ---------------------------------------------------------------- solid cut faces
// Where a destroyed block meets one still there, the body is cut flat along the block face, and that face is drawn as a
// solid cross-section (skin, fat, muscle and bone; on the head scalp, skull and brain), so a hole is a clean, filled cut and
// not a view into an empty shell. The faces are quads on every boundary between two blocks; a quad only shows when exactly
// one of its two blocks is gone, and only within the body's outline at that spot (a front/back depth map of the body, made
// from its own mesh, so the face fits the body it is cut into).
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
  const d = new Uint8Array(n * 4), q = v => Math.round(clamp((v - H.Z0) / (H.Z1 - H.Z0), 0, 1) * 255);
  for (let k = 0; k < n; k++) {
    const ok = lo[k] < 9 && hi[k] > -9 && hi[k] - lo[k] > 0.02;
    d[k * 4] = ok ? q(lo[k] + 0.004) : 255; d[k * 4 + 1] = ok ? q(hi[k] - 0.004) : 0; d[k * 4 + 2] = ok ? 255 : 0; d[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, H.NX, H.NY, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
const CAP_V = `
uniform float chT[36]; uniform float chH[18]; uniform float cK;
attribute vec2 cc; varying vec3 vQ; varying vec3 vN;
#include <fog_pars_vertex>
float cGone(float i) { if (i < -0.5) return 0.0; int j = int(i + 0.5); return cK < 1.5 ? chT[j] : chH[j]; }
void main() {
  vQ = position; vN = normalize(mat3(modelMatrix) * normal);
  bool show = (cGone(cc.x) > 0.5) != (cGone(cc.y) > 0.5);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = show ? projectionMatrix * mvPosition : vec4(2.0, 2.0, 2.0, 1.0);
  #include <fog_vertex>
}`;
const CAP_FR = `
uniform sampler2D hf; uniform vec4 hfR; uniform vec2 hfZ; uniform float cK; varying vec3 vQ; varying vec3 vN;
#include <fog_pars_fragment>
float cH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float cN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cH(i), cH(i + vec3(1,0,0)), f.x), mix(cH(i + vec3(0,1,0)), cH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cH(i + vec3(0,0,1)), cH(i + vec3(1,0,1)), f.x), mix(cH(i + vec3(0,1,1)), cH(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vec4 t = texture2D(hf, vec2((vQ.x - hfR.x) / (hfR.y - hfR.x), (vQ.y - hfR.z) / (hfR.w - hfR.z)));
  if (t.b < 0.6) discard;
  float zl = mix(hfZ.x, hfZ.y, t.r), zh = mix(hfZ.x, hfZ.y, t.g);
  if (vQ.z < zl || vQ.z > zh) discard;
  float d = min(min(vQ.z - zl, zh - vQ.z), (t.b - 0.6) * 0.09);
  vec3 q = vQ;
  vec3 muscle = mix(vec3(0.42, 0.04, 0.05), vec3(0.62, 0.12, 0.11), cN(q * 90.0)) * (0.85 + 0.3 * cN(q * vec3(300.0, 40.0, 300.0)));
  vec3 c;
  if (cK > 1.5) {
    // scalp, skull, then brain: pinkish grey, folded, with blood through it
    vec3 brain = mix(vec3(0.66, 0.46, 0.46), vec3(0.5, 0.3, 0.32), smoothstep(0.55, 0.9, abs(sin(q.x * 150.0 + cN(q * 28.0) * 7.0) * sin(q.y * 140.0 + q.z * 80.0))));
    brain = mix(brain, vec3(0.35, 0.03, 0.04), smoothstep(0.45, 0.75, cN(q * 20.0)) * 0.7);
    c = d < 0.004 ? vec3(0.38, 0.08, 0.07) : d < 0.012 ? mix(vec3(0.82, 0.72, 0.6), vec3(0.6, 0.38, 0.32), cN(q * 120.0) * 0.6) : brain;
    if (q.y < -0.03 && d >= 0.012) c = muscle;   // the jaw and the floor of the mouth are muscle, not brain
  } else {
    c = d < 0.003 ? vec3(0.42, 0.1, 0.08) : d < 0.013 ? mix(vec3(0.86, 0.72, 0.42), vec3(0.75, 0.55, 0.3), cN(q * 140.0)) : muscle;
    // ribs round the chest just under the muscle, the spine at the back, the gut low in front
    if (q.y > 0.08 && q.y < 0.5 && d > 0.016 && d < 0.034 && fract(q.y / 0.036) < 0.4) c = vec3(0.8, 0.68, 0.56);
    if (abs(q.x) < 0.024 && zh - q.z > 0.03 && zh - q.z < 0.075 && q.y > -0.05) c = mix(vec3(0.82, 0.72, 0.6), vec3(0.45, 0.1, 0.09), smoothstep(0.7, 0.9, fract(q.y / 0.032)));
    else if (d > 0.04 && q.y < 0.15 && vQ.z - zl < 0.12) c = mix(vec3(0.7, 0.42, 0.4), vec3(0.45, 0.18, 0.18), cN(q * 45.0));
    c = mix(c, vec3(0.3, 0.02, 0.03), smoothstep(0.6, 0.8, cN(q * 16.0)) * 0.55);
  }
  float l = 0.62 + 0.38 * abs(dot(normalize(vN), normalize(vec3(0.3, 1.0, 0.5))));
  gl_FragColor = vec4(pow(c * l, vec3(2.2)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
// the quads on every block boundary of one region, in the body frame, kept to the y range [ya, yb) (one skinned segment)
function capGeo(k, ya, yb) {
  const G = CHK[k], H = CAP_HF[k === 'T' ? 1 : 2], P = [], Nn = [], C = [], idx = [];
  const cell = (ix, iy, iz) => iz * G.nx * G.ny + iy * G.nx + ix;
  const zr = [[H.Z0, G.zs], [G.zs, H.Z1]];
  const quad = (a, b, c2, d, n, A, B) => { const b0 = P.length / 3; for (const v of [a, b, c2, d]) { P.push(v[0], v[1], v[2]); Nn.push(n[0], n[1], n[2]); C.push(A, B); } idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); };
  const cy = (y0, y1) => [Math.max(y0, ya), Math.min(y1, yb)];
  for (let iy = 0; iy < G.ny; iy++) {
    const [y0, y1] = cy(G.y0 + iy * G.dy - (iy === 0 ? 0.03 : 0), G.y0 + (iy + 1) * G.dy + (iy === G.ny - 1 ? 0.04 : 0)); if (y1 <= y0) continue;
    for (let iz = 0; iz < 2; iz++) {
      const [z0, z1] = zr[iz];
      for (let ix = 1; ix < G.nx; ix++) { const x = G.x0 + ix * G.dx; quad([x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1], [1, 0, 0], cell(ix - 1, iy, iz), cell(ix, iy, iz)); }
    }
    for (let ix = 0; ix < G.nx; ix++) {
      const x0 = G.x0 + ix * G.dx - (ix === 0 ? 0.04 : 0), x1 = G.x0 + (ix + 1) * G.dx + (ix === G.nx - 1 ? 0.04 : 0);
      quad([x0, y0, G.zs], [x1, y0, G.zs], [x1, y1, G.zs], [x0, y1, G.zs], [0, 0, 1], cell(ix, iy, 0), cell(ix, iy, 1));
    }
  }
  for (let iy = 1; iy < G.ny; iy++) {
    const y = G.y0 + iy * G.dy; if (y < ya || y >= yb) continue;
    for (let iz = 0; iz < 2; iz++) { const [z0, z1] = zr[iz];
      for (let ix = 0; ix < G.nx; ix++) {
        const x0 = G.x0 + ix * G.dx - (ix === 0 ? 0.04 : 0), x1 = G.x0 + (ix + 1) * G.dx + (ix === G.nx - 1 ? 0.04 : 0);
        quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], cell(ix, iy - 1, iz), cell(ix, iy, iz));
      } }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('cc', new THREE.Float32BufferAttribute(C, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new V3(0, (ya + yb) / 2, 0), 0.6);
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
    const m = new THREE.ShaderMaterial({ vertexShader: CAP_V, fragmentShader: CAP_FR, side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { hf: { value: null }, hfR: { value: new THREE.Vector4(H.X0, H.X1, H.Y0, H.Y1) }, hfZ: { value: new THREE.Vector2(H.Z0, H.Z1) }, cK: { value: w } }]) });
    m.uniforms.hf.value = tex; m.uniforms.chT = U.chT; m.uniforms.chH = U.chH;
    const key = k + ya, g = _capGeo[key] || (_capGeo[key] = capGeo(k, ya, yb));
    const mesh = new THREE.Mesh(g, m); mesh.position.y = A[1] + off; mesh.frustumCulled = false; mesh.userData.chCap = true; mesh.userData.keep = true; mesh.castShadow = false;
    A[0].add(mesh); st.caps.push(mesh);
  }
}
