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
function chunkShader(sh, U, solid) {
  if (!U.chT) Object.assign(U, { chT: { value: new Float32Array(36) }, chH: { value: new Float32Array(18) }, chAny: { value: 0 } });   // a cut-off piece: no blocks
  sh.uniforms.chT = U.chT; sh.uniforms.chH = U.chH; sh.uniforms.chAny = U.chAny;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 bz;\nvarying vec4 vBZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBZ = bz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CHUNK_F).replace('#include <emissivemap_fragment>',
    'if (vBZ.w > 0.5 && chAny > 0.5) {\n' +
    '  vec3 q = vBZ.xyz, qj = q + (vec3(chN(q * 38.0), chN(q * 38.0 + 11.3), chN(q * 38.0 + 23.7)) - 0.5) * 0.05;\n' +
    '  if (chCell(qj, vBZ.w) > 0.5) discard;\n' +
    '  float rr = 0.02, rim = max(max(chCell(qj + vec3(rr, 0.0, 0.0), vBZ.w), chCell(qj - vec3(rr, 0.0, 0.0), vBZ.w)), max(chCell(qj + vec3(0.0, rr, 0.0), vBZ.w), chCell(qj - vec3(0.0, rr, 0.0), vBZ.w)));\n' +
    '  rim = max(rim, max(chCell(qj + vec3(0.0, 0.0, 0.035), vBZ.w), chCell(qj - vec3(0.0, 0.0, 0.035), vBZ.w)));\n' +
    '  vec3 meat = mix(vec3(0.36, 0.03, 0.04), vec3(0.6, 0.1, 0.09), chN(q * 95.0)); meat = mix(meat, vec3(0.86, 0.76, 0.6), step(0.78, chN(q * 55.0 + 3.0)) * 0.55);\n' +
    (solid ? '  if (!gl_FrontFacing) diffuseColor.rgb = meat * (0.35 + 0.25 * chN(q * 40.0));\n  else ' : '  ') +
    'if (rim > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, meat, 0.88);\n}\n#include <emissivemap_fragment>');
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
  if (res.t + res.h) chunkOpen(root);
  return res;
}
// a body with blocks gone shows its inside: from then on the skin and clothes are drawn on both faces
function chunkOpen(root) {
  const st = root.userData.chunk; st.any.value = 1;
  if (st.open) return; st.open = true;
  root.traverse(o => { if (o.isMesh && o._skin && o.geometry.attributes.bz && o.material.side !== THREE.DoubleSide) { o.material.side = THREE.DoubleSide; o.material.needsUpdate = true; } });
}
function chunkCopy(from, to) {
  const a = from && from.userData.chunk, b = to && to.userData.chunk; if (!a || !b) return;
  b.T.set(a.T); b.H.set(a.H); if (a.any.value) chunkOpen(to);
}
function chunkReset(root) { const st = root && root.userData.chunk; if (!st) return; st.T.fill(0); st.H.fill(0); st.any.value = 0; }
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
