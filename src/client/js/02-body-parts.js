// ---------------------------------------------------------------- body parts (shared by humanoids and ragdolls)
const geoCache = {};
const GC = (k, make) => geoCache[k] || (geoCache[k] = make());
const rbox = (w, h, d, r) => GC('rb' + w + '_' + h + '_' + d + '_' + r, () => new RoundedBoxGeometry(w, h, d, 1, r));
const sph = r => GC('sp' + r, () => new THREE.SphereGeometry(r, 14, 10));
const hemi = r => GC('hm' + r, () => new THREE.SphereGeometry(r, 16, 7, 0, Math.PI * 2, 0, Math.PI * 0.5));
const cylg = (r, h, s, r2) => GC('cy' + r + '_' + h + '_' + s + '_' + r2, () => new THREE.CylinderGeometry(r, r2 === undefined ? r : r2, h, s || 14));
// the human body from HUMAN_MESH (02a-human-mesh.js): one segment's triangles of one paint region
// regions: 0 skin, 1 shirt, 2 pants, 3 boots, 4 sole, 6 skin under the clothes, 7 hair, 8 socks
const _b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
const _humSeg = {};
function humSeg(seg) {
  if (_humSeg[seg]) return _humSeg[seg];
  const d = HUMAN_MESH[seg], p = new Int16Array(_b64(d.p)), n = new Int8Array(_b64(d.n)), r = new Uint8Array(_b64(d.r)), t = new Uint16Array(_b64(d.t));
  const q = new Int16Array(_b64(d.q)), b = new Uint8Array(_b64(d.b)), w = new Uint8Array(_b64(d.w)), h = new Uint8Array(_b64(d.h)), cc = new Uint8Array(_b64(d.c));
  const pos = new Float32Array(p.length), nrm = new Float32Array(n.length), p2 = new Float32Array(q.length), nb = new Float32Array(b.length), nw = new Float32Array(w.length);
  for (let i = 0; i < p.length; i++) { pos[i] = p[i] / 10000; nrm[i] = n[i] / 127; p2[i] = q[i] / 10000; }
  const hc = new Float32Array(h.length), ck = new Float32Array(h.length), cr = new Float32Array(h.length), ca = new Float32Array(h.length);
  for (let i = 0; i < b.length; i++) { nb[i] = b[i]; nw[i] = w[i] / 255; hc[i] = h[i] / 255; ck[i] = cc[i * 3]; cr[i] = cc[i * 3 + 1] / 100; ca[i] = cc[i * 3 + 2] / 20; }
  return (_humSeg[seg] = { pos, nrm, p2, nb, nw, hc, ck, cr, ca, t, tr: r });   // r: paint region of each triangle
}
const humGeo = (seg, reg) => GC('hum' + seg + '_' + reg, () => {
  const S = humSeg(seg), idx = [];
  for (let k = 0; k < S.tr.length; k++) if (S.tr[k] === reg) idx.push(S.t[k * 3], S.t[k * 3 + 1], S.t[k * 3 + 2]);
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(S.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(S.nrm, 3));
  g.setAttribute('p2', new THREE.BufferAttribute(S.p2, 3)); g.setAttribute('nb', new THREE.BufferAttribute(S.nb, 1)); g.setAttribute('nw', new THREE.BufferAttribute(S.nw, 1));
  g.setIndex(idx);
  // coverage (where a garment or the hair ends: drawn only over 0.5) and the kind of surface for the fabric shader:
  // 0 skin, 1 cotton shirt, 2 trouser cotton, 3 boot leather, 4 sole, 5 hair
  g.setAttribute('hc', reg === 0 || reg === 6 ? new THREE.BufferAttribute(new Float32Array(S.hc.length).fill(1), 1) : new THREE.BufferAttribute(S.hc, 1));
  g.setAttribute('fab', new THREE.BufferAttribute(new Float32Array(S.hc.length).fill({ 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 6: 0, 7: 5, 8: 1 }[reg]), 1));
  // which cloth hoops a vertex hangs from (see ClothSim)
  g.setAttribute('ck', new THREE.BufferAttribute(reg === 1 || reg === 2 ? S.ck : new Float32Array(S.hc.length), 1)); g.setAttribute('cr', new THREE.BufferAttribute(S.cr, 1)); g.setAttribute('ca', new THREE.BufferAttribute(S.ca, 1));
  if (reg === 7) { const n = S.pos.length / 3, tn = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const h = Math.sin(i * 12.9898) * 43758.5453, k = 0.78 + 0.32 * (h - Math.floor(h)); tn[i * 3] = tn[i * 3 + 1] = tn[i * 3 + 2] = k; } g.setAttribute('tint', new THREE.BufferAttribute(tn, 3)); }
  return g;
});
// ---------------------------------------------------------------- real garments
// The outfit (a T-shirt and straight jeans) and lace-up boots are MakeHuman 1.1 system assets (CC0), fitted to this body by
// tools/human from their own .mhclo files: every garment vertex sits where the garment's maker tied it to the body, and
// bends with the same skin weights as the body under it. They keep their textures (public/models/clothes); the shirt's
// white is dyed per outfit.
const _garm = {};
const garmGeo = (g, seg) => {
  const k = g + ':' + seg; if (k in _garm) return _garm[k];
  const d = HUMAN_GARMENTS[g] && HUMAN_GARMENTS[g][seg]; if (!d) return (_garm[k] = null);
  const p = new Int16Array(_b64(d.p)), n = new Int8Array(_b64(d.n)), uv = new Uint16Array(_b64(d.uv)), t = new Uint16Array(_b64(d.t)), q = new Int16Array(_b64(d.q)),
    b = new Uint8Array(_b64(d.b)), w = new Uint8Array(_b64(d.w)), c = new Uint8Array(_b64(d.c)), tm = new Uint8Array(_b64(d.tm)), N = b.length;
  const F = (n_) => new Float32Array(n_);
  const pos = F(N * 3), nrm = F(N * 3), u = F(N * 2), p2 = F(N * 3), nb = F(N), nw = F(N), ck = F(N), cr = F(N), ca = F(N), tt = F(N);
  for (let i = 0; i < N * 3; i++) { pos[i] = p[i] / 10000; nrm[i] = n[i] / 127; p2[i] = q[i] / 10000; }
  for (let i = 0; i < N; i++) { u[i * 2] = uv[i * 2] / 65535; u[i * 2 + 1] = uv[i * 2 + 1] / 65535; nb[i] = b[i]; nw[i] = w[i] / 255; ck[i] = c[i * 3]; cr[i] = c[i * 3 + 1] / 100; ca[i] = c[i * 3 + 2] / 20; tt[i] = tm[i]; }
  const G = new THREE.BufferGeometry(), A = (a, k_) => new THREE.BufferAttribute(a, k_);
  G.setAttribute('position', A(pos, 3)); G.setAttribute('normal', A(nrm, 3)); G.setAttribute('uv', A(u, 2)); G.setAttribute('p2', A(p2, 3)); G.setAttribute('nb', A(nb, 1)); G.setAttribute('nw', A(nw, 1));
  G.setAttribute('ck', A(ck, 1)); G.setAttribute('cr', A(cr, 1)); G.setAttribute('ca', A(ca, 1)); G.setAttribute('tm', A(tt, 1));
  G.setIndex(A(t, 1)); G.computeBoundingSphere();
  return (_garm[k] = G);
};
const GARM_MAT = (() => {
  const L = new THREE.TextureLoader(), tex = (u, srgb) => { const t = L.load(u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return {
    suit: new THREE.MeshStandardMaterial({ map: tex('/models/clothes/suit_col.jpg', true), normalMap: tex('/models/clothes/suit_nrm.jpg'), aoMap: tex('/models/clothes/suit_ao.jpg'), roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),   // two-sided: the inside of the collar and sleeves shows
    shoes: new THREE.MeshStandardMaterial({ map: tex('/models/clothes/shoes_col.jpg', true), roughness: 0.7, metalness: 0, side: THREE.DoubleSide }),
  };
})();
// Skinning across the joints. A body is still one group per bone, but the skin near a joint follows both bones: each vertex
// has its position in the neighbouring bone's frame (p2) and a weight (nw), and the vertex shader blends the two. segM[k]
// takes bone k's frame into the frame of the group this mesh hangs in, every frame; segOK[k] is 0 if that bone isn't there.
const SKIN_VS = ['attribute vec3 p2;\nattribute float nb;\nattribute float nw;\nuniform mat4 segM[12];\nuniform float segOK[12];\n',
  'int skI = int(nb + 0.5); float skW = nw * segOK[skI]; mat4 skM = segM[skI];\nobjectNormal = normalize(mix(objectNormal, mat3(skM) * objectNormal, skW));\n',
  'transformed = mix(transformed, (skM * vec4(p2, 1.0)).xyz, skW);\n'];
function skinShader(sh, U) {
  sh.uniforms.segM = U.segM; sh.uniforms.segOK = U.segOK; if (U.cD) sh.uniforms.cD = U.cD;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SKIN_VS[0])
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SKIN_VS[1])
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SKIN_VS[2]);
}
const _skI = new THREE.Matrix4(), _skT = new THREE.Matrix4(), _skN = new THREE.Matrix3();
function skinUpdate() {
  const sk = this._skin, P = this.parent; if (!sk || !P) return;
  _skI.copy(P.matrixWorld).invert();
  for (let k = 0; k < 12; k++) {
    const at = sk.at[HUMAN_SEGS[k]];
    if (!at || !at[0].parent && at[0] !== P) { sk.U.segOK.value[k] = 0; continue; }
    sk.U.segOK.value[k] = 1;
    sk.U.segM.value[k].multiplyMatrices(_skI, at[0].matrixWorld).multiply(_skT.makeTranslation(0, at[1], 0));
  }
  if (sk.U.cD && sk.sim) { _skN.setFromMatrix4(_skI); const D = sk.sim.d, out = sk.U.cD.value; for (let k = 0; k < 56; k++) out[k].copy(D[k]).applyMatrix3(_skN); }
  if (this.material) this.material.uniformsNeedUpdate = true;
}
// ---------------------------------------------------------------- cloth
// The free parts of the clothes are simulated: hoops of particles round the lower shirt and each jeans leg (HUMAN_CLOTH).
// Each particle is pinned to where its bit of cloth sits on the body, but only by a soft pull: it has inertia (Verlet),
// gravity and drag, keeps its distance to its neighbours round the hoop and to the hoop above, can swing out only so far,
// and can't go into the body. So a hem swings and settles when a body runs, turns or stops, trousers sway, and on a body
// lying down the cloth falls the way gravity pulls. The garments' vertices follow their hoops in the vertex shader.
const CLOTH_SIMS = [];
const _cA = new V3(), _cB = new V3(), _cT = new V3();
class ClothSim {
  constructor(root, at) {
    const n = HUMAN_CLOTH.length; this.root = root; this.at = at; this.n = n; this.on = false; this.idle = 0;
    this.x = Array.from({ length: n }, () => new V3()); this.xp = Array.from({ length: n }, () => new V3()); this.tg = Array.from({ length: n }, () => new V3());
    this.nr = Array.from({ length: n }, () => new V3()); this.ok = new Uint8Array(n); this.d = Array.from({ length: 56 }, () => new V3()); this.rl = null;
    CLOTH_SIMS.push(this);
  }
  // where each particle's bit of cloth sits on the body now (skinned like a vertex)
  targets() {
    for (let i = 0; i < this.n; i++) {
      const r = HUMAN_CLOTH[i], A = this.at[r.s]; if (!A) { this.ok[i] = 0; continue; }
      this.ok[i] = 1; const m = A[0].matrixWorld;
      this.tg[i].set(r.p[0], r.p[1] + A[1], r.p[2]).applyMatrix4(m);
      if (r.w > 0) { const B = this.at[HUMAN_SEGS[r.b]]; if (B) this.tg[i].lerp(_cB.set(r.q[0], r.q[1] + B[1], r.q[2]).applyMatrix4(B[0].matrixWorld), r.w); }
      this.nr[i].set(r.n[0], r.n[1], r.n[2]).transformDirection(m);
    }
  }
  reset() { for (let i = 0; i < this.n; i++) { this.x[i].copy(this.tg[i]); this.xp[i].copy(this.tg[i]); this.d[i].set(0, 0, 0); } }
  step(dt) {
    let p = this.root; while (p.parent) p = p.parent;
    if (p !== scene || !this.root.visible) { this.idle++; this.on = false; return; }
    this.idle = 0;
    // only near bodies are simulated (nobody sees a hem swing at 40 m); far ones wear their clothes at rest
    _cA.setFromMatrixPosition(this.root.matrixWorld);
    if (_cA.distanceToSquared(camera.position) > 1600) { if (this.on) { for (const d of this.d) d.set(0, 0, 0); this.on = false; } return; }
    this.root.updateMatrixWorld(true); this.targets();
    if (!this.on || this.x[0].distanceToSquared(this.tg[0]) > 0.36) {
      this.reset(); this.on = true;
      // rest lengths: round each hoop, and from each particle of the first hoop to the one below it
      this.rl = [];
      for (const [base, N] of [[0, 12], [24, 8], [40, 8]]) for (let ring = 0; ring < 2; ring++) for (let i = 0; i < N; i++) {
        const a = base + ring * N + i, b = base + ring * N + (i + 1) % N; this.rl.push([a, b, this.tg[a].distanceTo(this.tg[b])]);
        if (ring === 0) { const c = base + N + i; this.rl.push([a, c, this.tg[a].distanceTo(this.tg[c])]); }
      }
    }
    const h = Math.min(dt, 0.05) / 2, g = 9.8 * h * h;
    for (let sub = 0; sub < 2; sub++) {
      for (let i = 0; i < this.n; i++) {
        if (!this.ok[i]) continue;
        const x = this.x[i], xp = this.xp[i]; _cT.subVectors(x, xp).multiplyScalar(0.93); xp.copy(x); x.add(_cT); x.y -= g;
      }
      for (let it = 0; it < 3; it++) {
        for (const [a, b, L] of this.rl) {
          if (!this.ok[a] || !this.ok[b]) continue;
          _cT.subVectors(this.x[b], this.x[a]); const l = _cT.length(); if (l < 1e-6) continue;
          _cT.multiplyScalar((l - L) / l * 0.25); this.x[a].add(_cT); this.x[b].sub(_cT);
        }
        for (let i = 0; i < this.n; i++) {
          if (!this.ok[i]) continue;
          const shirt = i < 24, ring2 = shirt ? i >= 12 : (i - 24) % 16 >= 8, x = this.x[i], t = this.tg[i];
          x.lerp(t, ring2 ? 0.1 : 0.22);                                          // soft pin
          _cT.subVectors(x, t); const max = shirt ? (ring2 ? 0.07 : 0.035) : (ring2 ? 0.045 : 0.025), l = _cT.length();
          if (l > max) x.copy(t).addScaledVector(_cT, max / l);                   // cloth can only swing out so far
          const dn = _cT.subVectors(x, t).dot(this.nr[i]); if (dn < -0.002) x.addScaledVector(this.nr[i], -0.002 - dn);   // not into the body
        }
      }
    }
    for (let i = 0; i < 56; i++) if (this.ok[i]) this.d[i].subVectors(this.x[i], this.tg[i]); else this.d[i].set(0, 0, 0);
  }
}
function updateCloth(dt) {
  for (let i = CLOTH_SIMS.length - 1; i >= 0; i--) { const s = CLOTH_SIMS[i]; s.step(dt); if (s.idle > 600) CLOTH_SIMS.splice(i, 1); }
}
// after the body's meshes are merged: every mesh with skin weights gets its own material and the per-frame bone matrices
// Clothes and hair: each garment is its own sheet over the body. The sheet is drawn only where its coverage is over one
// half (so hems and the hairline are smooth curves), on both sides (the inside of the shirt shows at the neck, darker), with
// a fabric relief from its rest position: soft folds that deepen at the joints, a ribbed crew neck, ripstop trousers with
// a waistband, grained leather boots and hair with a direction to it.
const CLOTH_VS = ['attribute float hc;\nattribute float fab;\nvarying float vHc;\nvarying float vFab;\nvarying vec3 vCp;\nvarying float vWk;\n',
  'vHc = hc; vFab = fab; vCp = position; vWk = nw;\n'];
const CLOTH_FS = `varying float vHc;
varying float vFab;
varying vec3 vCp;
varying float vWk;
float cH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float cN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cH(i), cH(i + vec3(1, 0, 0)), f.x), mix(cH(i + vec3(0, 1, 0)), cH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(cH(i + vec3(0, 0, 1)), cH(i + vec3(1, 0, 1)), f.x), mix(cH(i + vec3(0, 1, 1)), cH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float clothH(vec3 p, float fb, float c, float wk) {
  float j = clamp(wk * 3.0, 0.0, 1.0), h = 0.0;
  if (fb < 1.5) {
    h = sin(p.y * 150.0 + cN(p * 16.0) * 6.0) * (0.0003 + 0.0011 * j) + cN(p * 60.0) * 0.0002;
    float band = 1.0 - smoothstep(0.5, 0.66, c);
    h += band * (0.0010 + 0.0003 * sin(atan(p.x, p.z) * 150.0));
  } else if (fb < 2.5) {
    // denim: stiff, so few soft folds but sharper creases at the joints, a raised twill, and a thick hem and waistband
    h = sin(p.y * 90.0 + cN(p * 10.0) * 5.0) * (0.0002 + 0.0009 * j) + cN(p * 40.0) * 0.00012;
    h += sin((p.y + 0.7 * (p.x + p.z)) * 2200.0) * 0.00004;
    h += (1.0 - smoothstep(0.5, 0.6, c)) * 0.0016;
  } else if (fb < 4.5) {
    h = cN(p * 180.0) * 0.00025 + sin(p.y * 200.0 + cN(p * 20.0) * 4.0) * 0.00025 * (1.0 - step(3.5, fb));
  } else {
    h = cN(vec3(p.x * 260.0, p.y * 40.0, p.z * 260.0)) * 0.0005;
  }
  return h;
}
`;
// the cloth simulation moves a garment vertex by its hoops' particles: between the pin line (cr 0) and the first hoop
// (cr 1) it follows that hoop more and more, between the hoops it blends from the first to the second
const CLOTH_MOVE = `if (ck > 0.5) {
  int base = ck < 1.5 ? 0 : (ck < 2.5 ? 24 : 40); int N = ck < 1.5 ? 12 : 8;
  float fa = ca - floor(ca); int i0 = int(floor(ca)); if (i0 >= N) i0 -= N; int i1 = i0 + 1; if (i1 >= N) i1 -= N;
  vec3 r1 = mix(cD[base + i0], cD[base + i1], fa), r2 = mix(cD[base + N + i0], cD[base + N + i1], fa);
  transformed += cr <= 1.0 ? r1 * cr : mix(r1, r2, cr - 1.0);
}
`;
function clothShader(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CLOTH_VS[0]).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CLOTH_VS[1]);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CLOTH_FS)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vHc < 0.5) discard;')
    .replace('#include <color_fragment>', `#include <color_fragment>
if (vFab > 0.5) {
  float cv = cN(vCp * 9.0) * 0.6 + cN(vCp * 140.0) * 0.4;
  diffuseColor.rgb *= 0.95 + 0.08 * cv;
  if (vFab < 1.5) diffuseColor.rgb *= mix(0.84, 1.0, smoothstep(0.5, 0.66, vHc));
  else if (vFab < 2.5) {
    // denim: white weft showing through the indigo, a worn-lighter wash in patches, darker stitched hem and waistband
    float weft = cN(vCp * 420.0), wash = smoothstep(0.35, 0.8, cN(vCp * 7.0 + 3.1));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.68, 0.78) * diffuseColor.rgb * 2.2, 0.10 * weft + 0.16 * wash);
    diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.5, 0.6, vHc));
  }
  if (!gl_FrontFacing) diffuseColor.rgb = vColor.rgb * 0.72;   // the inside of the cloth: a little darker (where a bent sleeve folds through itself it must not show as a dark tear)
}`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vFab > 0.5) roughnessFactor = vFab < 2.5 ? 0.94 : (vFab < 3.5 ? 0.55 : (vFab < 4.5 ? 0.85 : 0.97));')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (vFab > 0.5) {
  float H = clothH(vCp, vFab, vHc, vWk);
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(H), hy = dFdy(H);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2));
}`);
}
// every special material on a body part goes through here, so skinning, clothes and bullet holes stack on one mesh
function clothMoveShader(sh) {
  sh.uniforms.cD = sh.uniforms.cD || { value: Array.from({ length: 56 }, () => new THREE.Vector3()) };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ck;\nattribute float cr;\nattribute float ca;\nuniform vec3 cD[56];\n').replace(SKIN_VS[2], SKIN_VS[2] + CLOTH_MOVE);
}
// a garment's dyed part (the shirt): its white texture times the outfit's colour
function tintShader(sh, mesh) {
  sh.uniforms.gTint = mesh._tintU || (mesh._tintU = { value: new THREE.Color(mesh.userData.tint) });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tm;\nvarying float vTm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTm = tm;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 gTint;\nvarying float vTm;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), gTint * 1.25, vTm);');
}
function bodyPatches(sh, mesh) {
  if (!mesh._skin) return;
  const a = mesh.geometry.attributes; skinShader(sh, mesh._skin.U);
  if (a.ck) clothMoveShader(sh); if (a.fab) clothShader(sh); if (mesh.userData.tint !== undefined && a.tm) tintShader(sh, mesh);
}
const bodyKey = mesh => { const a = mesh.geometry.attributes; return (mesh._skin ? 'sk' : '') + (mesh._skin && a.ck ? 'm' : '') + (mesh._skin && a.fab ? 'c' : '') + (mesh._skin && a.tm && mesh.userData.tint !== undefined ? 't' : ''); };
function attachSkin(root, at) {
  let sim = null;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.nw || o.material === shadowMat || o._skin) return;
    const U = { segM: { value: Array.from({ length: 12 }, () => new THREE.Matrix4()) }, segOK: { value: new Array(12).fill(0) } };
    if (o.geometry.attributes.ck) { U.cD = { value: Array.from({ length: 56 }, () => new THREE.Vector3()) }; sim = sim || new ClothSim(root, at); }
    o._skin = { U, at, sim };
    const m = o.material.clone(); if (o.geometry.attributes.fab) m.side = THREE.DoubleSide; m.onBeforeCompile = sh => bodyPatches(sh, o); m.customProgramCacheKey = () => 'body' + bodyKey(o); o.material = m;
    o.onBeforeRender = skinUpdate;
  });
}
// lathe profile [radius, y] pairs, bottom to top
const latheG = (key, pts) => GC('la' + key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 14));
// tapered limb with rounded ends, from y=0 (top joint) down to y=-len
function limbG(len, rt, rm, rb) {
  return GC('lb' + len + '_' + rt + '_' + rm + '_' + rb, () => {
    const pts = [[0, -len - rb * 0.6]];
    for (let i = 1; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push([Math.sin(a) * rb, -len - rb * 0.6 * Math.cos(a) + 0.0]); }
    const N = 8;
    for (let i = 1; i < N; i++) { const t = i / N, r = t < 0.5 ? lerp(rb, rm, smooth(t / 0.5)) : lerp(rm, rt, smooth((t - 0.5) / 0.5)); pts.push([r, -len + t * len]); }
    for (let i = 0; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push([Math.cos(a) * rt, rt * 0.6 * Math.sin(a)]); }
    pts.push([0, rt * 0.6]);
    return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), 12);
  });
}
const HUM_DEFAULT = { skin: 0xc19275, shirt: 0x5f6349, pants: 0x565a44, vest: 0x86734f, vest2: 0x756445, pack: 0x4f5340, belt: 0x4a4232, boots: 0x3b3227, sole: 0x1c1915, helmet: 0x6a6250, glove: 0x2f2c26, pad: 0x3a372f, dark: 0x161616, hair: 0x2a1f18 };
const TORSO_PTS = [[0.0, 0.0], [0.145, 0.0], [0.15, 0.06], [0.148, 0.14], [0.158, 0.22], [0.178, 0.31], [0.19, 0.4], [0.192, 0.47], [0.175, 0.52], [0.13, 0.555], [0.07, 0.575], [0.0, 0.58]];
const PELVIS_PTS = [[0.0, -0.13], [0.09, -0.125], [0.15, -0.08], [0.165, -0.02], [0.158, 0.05], [0.148, 0.1], [0.0, 0.1]];
// merge each skeleton segment's meshes into one vertex-coloured mesh (one draw call per bone instead of dozens)
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
function mergeChildren(group, matl, pick) {
  const parts = group.children.filter(pick || (c => c.isMesh && !c.isInstancedMesh && !c.userData.armor && !c.userData.keep && !c.userData.organ && !c.userData.inner && !c.userData.under && !c.userData.tex));
  if (parts.length < 2) return parts[0] || null;
  const geos = []; let frame = null, hum = null;
  for (const m of parts) {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    const tn = g.attributes.tint ? g.attributes.tint.array : null;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'p2' && k !== 'nb' && k !== 'nw' && k !== 'hc' && k !== 'fab' && k !== 'ck' && k !== 'cr' && k !== 'ca') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const col = m.material.color || new THREE.Color(1, 1, 1), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r * (tn ? tn[i * 3] : 1); arr[i * 3 + 1] = col.g * (tn ? tn[i * 3 + 1] : 1); arr[i * 3 + 2] = col.b * (tn ? tn[i * 3 + 2] : 1); }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
    if (m.userData.frame) { frame = m.userData.frame; hum = m.userData.hum; }
    group.remove(m);
  }
  // skinned and plain parts merge together: plain parts get zero skin weight
  if (geos.some(g => g.attributes.nw)) for (const g of geos) if (!g.attributes.nw) { const n = g.attributes.position.count; g.setAttribute('p2', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('nb', new THREE.BufferAttribute(new Float32Array(n), 1)); g.setAttribute('nw', new THREE.BufferAttribute(new Float32Array(n), 1)); }
  if (geos.some(g => g.attributes.fab)) for (const g of geos) if (!g.attributes.fab) { const n = g.attributes.position.count; g.setAttribute('hc', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1)); g.setAttribute('fab', new THREE.BufferAttribute(new Float32Array(n), 1)); for (const k of ['ck', 'cr', 'ca']) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n), 1)); }
  const merged = new THREE.Mesh(mergeGeometries(geos), matl);
  merged.castShadow = true; merged.receiveShadow = matl !== shadowMat;
  if (frame) { merged.userData.frame = frame; merged.userData.hum = hum; }
  group.add(merged);
  return merged;
}
function mergeTree(root, matl) { const groups = []; root.traverse(o => { if (!o.isMesh && !o.isSprite) groups.push(o); }); for (const g of groups) { mergeChildren(g, matl); const un = mergeChildren(g, matl, c => c.isMesh && c.userData.under); if (un) { un.userData.under = true; un.visible = false; un.castShadow = false; un.receiveShadow = true; } const o = mergeChildren(g, matl, c => c.isMesh && c.userData.organ); if (o) { o.userData.organ = true; o.castShadow = false; o.visible = false; } } }
const capg = (r, l) => GC('cp' + r + '_' + l, () => new THREE.CapsuleGeometry(r, l, 2, 6));
const hemiBack = r => GC('hb' + r, () => new THREE.SphereGeometry(r, 12, 4, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.5, Math.PI * 0.2));
const plateGeo = () => { const g = new THREE.ExtrudeGeometry(polyShape([[-0.122, 0], [0.122, 0], [0.135, 0.02], [0.135, 0.2], [0.085, 0.31], [-0.085, 0.31], [-0.135, 0.2], [-0.135, 0.02]], 0.018), { depth: 0.026, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: 2, curveSegments: 4 }); return g; };
// Head: one smooth surface with the skull, cheek and jaw shape, deliberately featureless.
// brain: a rounded mass with folds pressed into it
const brainGeo = () => {
  const g = new THREE.SphereGeometry(1, 28, 20), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 - 0.07 * Math.abs(Math.sin(x * 9 + y * 4) * Math.sin(z * 8 - y * 6)) - (Math.abs(x) < 0.08 && y > 0 ? 0.08 : 0); p.setXYZ(i, x * k, y * k * (y < -0.3 ? 0.8 : 1), z * k); }
  g.computeVertexNormals(); return g;
};
const faceGeo = () => {
  const g = new THREE.SphereGeometry(1, 48, 36), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 0.078, y = pos.getY(i) * 0.115, z = pos.getZ(i) * 0.097;
    const jaw = smooth(clamp((-0.012 - y) / 0.1, 0, 1));
    x *= 1 - 0.3 * jaw;
    if (z > 0) z *= (1 + 0.07 * (1 - jaw)) * (1 - 0.42 * jaw);
    if (z < -0.074) z = -0.074 + (z + 0.074) * 0.5;
    // soft brow ridge and cheekbones so the face plane still reads under light
    const f = z < 0 ? Math.min(1, -z / 0.045) : 0, ax = Math.abs(x);
    z -= f * (0.004 * Math.exp(-((y - 0.02) ** 2) / 0.00008) * Math.exp(-(x * x) / 0.003) + 0.003 * Math.exp(-((ax - 0.04) ** 2 + (y + 0.02) ** 2) / 0.0003));
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
};
// FAST-style high-cut helmet, built once per colour scheme and baked to a single vertex-coloured mesh.
// Shell: a dome whose lower edge follows the high cut (low at the brow, cut up over the ears, dropping at the nape).
const HSH = { cx: 0, cy: 0.012, cz: 0.004, sx: 0.094, sy: 0.119, sz: 0.113 };
function helmetEdge(az) { const a = Math.abs(az); return 1.36 + 0.5 * smooth(clamp((a - 2.05) / 0.85, 0, 1)) - 0.19 * Math.exp(-(((a - 1.62) / 0.3) ** 2)); }
function shellPt(az, pol, k) { k = k || 1; return new V3(HSH.cx + HSH.sx * k * Math.sin(pol) * Math.sin(az), HSH.cy + HSH.sy * k * Math.cos(pol), HSH.cz - HSH.sz * k * Math.sin(pol) * Math.cos(az)); }
function shellN(az, pol) { const p = shellPt(az, pol); return new V3((p.x - HSH.cx) / (HSH.sx * HSH.sx), (p.y - HSH.cy) / (HSH.sy * HSH.sy), (p.z - HSH.cz) / (HSH.sz * HSH.sz)).normalize(); }
function shellGeo() {
  const A = 64, Pn = 18, pos = [], idx = [], ring = (k, flip) => {
    const base = pos.length / 3;
    for (let i = 0; i <= A; i++) { const az = -Math.PI + i / A * Math.PI * 2, e = helmetEdge(az); for (let j = 0; j <= Pn; j++) { const p = shellPt(az, e * j / Pn, k); pos.push(p.x, p.y, p.z); } }
    for (let i = 0; i < A; i++) for (let j = 0; j < Pn; j++) { const a = base + i * (Pn + 1) + j, b = a + Pn + 1; if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return base;
  };
  const o = ring(1, false), n = ring(0.93, true);
  // rolled rim joining outer and inner shell along the cut edge
  for (let i = 0; i < A; i++) { const a = o + i * (Pn + 1) + Pn, b = o + (i + 1) * (Pn + 1) + Pn, c = n + i * (Pn + 1) + Pn, d = n + (i + 1) * (Pn + 1) + Pn; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a piece of material lying on the shell: (u, v) in 0..1 mapped to (azimuth, polar angle), lifted off the surface by off
function shellBand(f, off, nu, nv) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const [az, pol] = f(i / nu, j / nv); const p = shellPt(az, pol).addScaledVector(shellN(az, pol), off); pos.push(p.x, p.y, p.z); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function helmetBaked(c) {
  return GC('helmet_' + c.helmet + '_' + c.dark + '_' + c.vest2, () => {
    const grp = new THREE.Group(), M = col => mat(col, 0.8, 0);
    const put = (geo, col, p, q) => { const m = new THREE.Mesh(geo, M(col)); m.position.copy(p); if (q) m.quaternion.copy(q); grp.add(m); return m; };
    const onShell = (az, pol, off) => { const n = shellN(az, pol), p = shellPt(az, pol).addScaledVector(n, off || 0); const t = new V3(Math.cos(az), 0, Math.sin(az)); const up = new V3().crossVectors(n, t).normalize(); const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, up, n)); return { p, q, n }; };
    put(shellGeo(), c.helmet, new V3());
    // ARC side rails: a band following the curve just above the cut, with slots
    for (const s of [-1, 1]) {
      const az0 = s < 0 ? -2.15 : 0.95, az1 = s < 0 ? -0.95 : 2.15;
      put(shellBand((u, v) => { const az = lerp(az0, az1, u); return [az, helmetEdge(az) - lerp(0.17, 0.08, v)]; }, 0.005, 16, 2), c.dark, new V3());
      put(shellBand((u, v) => { const az = lerp(az0, az1, u); return [az, helmetEdge(az) - lerp(0.17, 0.08, v)]; }, 0.002, 16, 1), c.dark, new V3());
      for (let i = 0; i < 6; i++) { const az = s * (1.08 + i * 0.19), r = onShell(az, helmetEdge(az) - 0.125, 0.0055); put(new THREE.BoxGeometry(0.009, 0.006, 0.002), 0x050505, r.p, r.q); }
    }
    // NVG shroud on the brow, with its slot
    { const r = onShell(0, 1.08, 0.005); put(new RoundedBoxGeometry(0.056, 0.036, 0.012, 1, 0.004), c.dark, r.p, r.q); put(new THREE.BoxGeometry(0.02, 0.012, 0.004), 0x050505, r.p.clone().addScaledVector(r.n, 0.006), r.q); }
    // hook-and-loop panels on the crown and the back
    put(shellBand((u, v) => [lerp(-0.6, 0.6, u), lerp(0.14, 0.46, v)], 0.0022, 8, 4), c.vest2, new V3());
    put(shellBand((u, v) => [lerp(Math.PI - 0.38, Math.PI + 0.38, u), lerp(0.95, 1.24, v)], 0.0022, 6, 3), c.vest2, new V3());
    // bungee cords from front to back along both sides
    for (const s of [-1, 1]) for (const pol0 of [0.75, 1.0]) {
      const pts = []; for (let i = 0; i <= 10; i++) { const az = s * lerp(0.55, 2.55, i / 10), pol = pol0 + 0.15 * Math.sin(i / 10 * Math.PI); pts.push(shellPt(az, pol).addScaledVector(shellN(az, pol), 0.004)); }
      put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.0018, 5), 0x1a1a1a, new V3());
    }
    // counterweight / battery pouch at the back, IR strobe on top
    { const r = onShell(Math.PI, 1.45, 0.014); put(new RoundedBoxGeometry(0.07, 0.042, 0.028, 1, 0.008), c.vest2, r.p, r.q); }
    { const r = onShell(Math.PI, 0.55, 0.008); put(new RoundedBoxGeometry(0.024, 0.014, 0.016, 1, 0.004), c.dark, r.p, r.q); }
    // retention harness: side straps from the rails down to a chin cup, rear strap with dial
    for (const s of [-1, 1]) {
      const top = shellPt(s * 1.62, helmetEdge(s * 1.62) - 0.02), chin = new V3(s * 0.028, -0.118, -0.05);
      const mid = top.clone().lerp(chin, 0.5), len = top.distanceTo(chin), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), top.clone().sub(chin).normalize());
      put(new THREE.BoxGeometry(0.012, len, 0.003), 0x1c1c1a, mid, q);
      const rear = shellPt(s * 2.3, helmetEdge(s * 2.3) - 0.02), mid2 = rear.clone().lerp(chin, 0.5), q2 = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), rear.clone().sub(chin).normalize());
      put(new THREE.BoxGeometry(0.01, rear.distanceTo(chin), 0.003), 0x1c1c1a, mid2, q2);
    }
    put(new RoundedBoxGeometry(0.046, 0.016, 0.026, 1, 0.006), 0x1c1c1a, new V3(0, -0.122, -0.056));
    { const r = onShell(Math.PI, helmetEdge(Math.PI) - 0.06, -0.012); put(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 14).rotateX(Math.PI / 2), 0x111111, r.p, r.q); }
    return bakeColored(grp);
  });
}

const noseGeo = () => { const g = new THREE.ConeGeometry(0.016, 0.046, 4, 1); g.rotateY(Math.PI / 4); g.scale(0.8, 1, 1.1); return g; };
class Body {
  constructor(pal, M, onHit) { this.c = pal; this.M = M; this.onHit = onHit; }
  add(geo, col, parent, x, y, z, frame, s, r, armor) {
    const m = new THREE.Mesh(geo, col && col.isMaterial ? (this.M(0) === shadowMat ? shadowMat : col) : this.M(col));
    // first-person body: the chest rig is drawn smaller and pulled in against the torso, so looking down it doesn't fill the view
    if (this.rk) { const k = this.rk.k; x *= k; z *= k * 0.9; y = this.rk.y0 + (y - this.rk.y0) * 0.94; s = s ? [s[0] * k, s[1] * k, s[2] * k] : [k, k, k]; }
    m.position.set(x, y, z); if (s) m.scale.set(s[0], s[1], s[2]); if (r) m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (armor) m.userData.armor = armor;
    if (frame && this.onHit) this.onHit(m, frame, armor);
    return m;
  }
  // an internal part: organs and bones stay solid (holes go around them), the skull gets cut like skin
  gut(geo, col, p, x, y, z, s, r, inner) {
    if (this.M(0) === shadowMat) return null;
    const m = this.add(geo, col, p, x, y, z, null, s, r); m.castShadow = false; m.visible = false;
    if (inner) { m.userData.inner = true; m.userData.hIn = inner; } else m.userData.organ = true;
    return m;
  }
  guts(kind, p, y, L) {
    const BONE = 0xe4d9c2, MAR = 0x9a3a2a;
    if (kind === 'chest') {
      // spine, ribs, lungs, heart, liver, stomach
      this.gut(cylg(0.016, 0.38, 8), BONE, p, 0, y + 0.26, 0.042);
      for (let i = 0; i < 7; i++) this.gut(rbox(0.03, 0.02, 0.022, 0.005), BONE, p, 0, y + 0.1 + i * 0.05, 0.048);
      for (let i = 0; i < 7; i++) { const yy = y + 0.2 + i * 0.038, rr = 0.11 + Math.min(i, 3) * 0.01 - Math.max(0, i - 4) * 0.012; this.gut(GC('rib' + i, () => new THREE.TorusGeometry(1, 0.06, 4, 20)), BONE, p, 0, yy, 0, [rr, rr * 0.6, 0.009 / 0.06 * 1], [Math.PI / 2, 0, 0]); }
      for (const sx of [-1, 1]) this.gut(sph(1), 0xc8838a, p, sx * 0.07, y + 0.37, 0.0, [0.058, 0.11, 0.06]);
      this.gut(sph(1), 0x6e1016, p, 0.025, y + 0.32, -0.025, [0.042, 0.05, 0.036]);
      this.gut(sph(1), 0x5a1a14, p, -0.035, y + 0.2, -0.005, [0.09, 0.045, 0.055]);
      this.gut(sph(1), 0xb87a74, p, 0.06, y + 0.2, -0.02, [0.05, 0.04, 0.04]);
      for (let i = 0; i < 6; i++) this.gut(GC('gut', () => new THREE.TorusGeometry(0.024, 0.011, 6, 12)), 0xc48a82, p, ((i % 3) - 1) * 0.045, y + 0.06 + Math.floor(i / 3) * 0.05, -0.01 + (i % 2) * 0.03, null, [Math.PI / 2 + i, i * 0.7, 0]);
    } else if (kind === 'pelvis') {
      this.gut(GC('pbone', () => new THREE.TorusGeometry(0.1, 0.022, 5, 14, Math.PI * 1.3)), BONE, p, 0, y - 0.03, 0, [0.85, 0.72, 0.7], [Math.PI / 2, 0, Math.PI * 0.85]);
      for (let i = 0; i < 6; i++) this.gut(GC('gut', () => new THREE.TorusGeometry(0.024, 0.011, 6, 12)), 0xc48a82, p, ((i % 3) - 1) * 0.045, y + 0.0 + Math.floor(i / 3) * 0.045, -0.02 + (i % 2) * 0.03, null, [Math.PI / 2 + i, i * 0.9, 0]);
    } else if (kind === 'head') {
      // skull shell (cut like skin, bone-coloured inside) and the brain
      // skull and brain fitted inside the head: at least ~1 cm under the scalp everywhere
      this.gut(GC('face', faceGeo), BONE, p, 0, y - 0.081, -0.063, [0.85, 0.925, 0.78], null, 0xc9b8a0);
      this.gut(GC('brain', brainGeo), 0xd4a3a3, p, 0, y - 0.06, -0.06, [0.058, 0.068, 0.072]);
    } else {
      // long bones down the middle of a limb segment (two in the forearm and shin)
      const two = kind === 'forearm' || kind === 'shin', r = kind === 'thigh' ? 0.017 : kind === 'upperArm' ? 0.013 : 0.009, len = L * 0.92;
      for (const ox of two ? [-0.012, 0.012] : [0]) this.gut(cylg(r, len, 8), BONE, p, ox, y - L / 2, 0);
      this.gut(cylg(r * 0.55, len * 0.96, 6), MAR, p, two ? 0.012 : 0, y - L / 2, 0);
    }
  }
  // a real human body segment (MakeHuman), painted: skin, shirt, pants, boots, sole, hair
  human(seg, p, y, f) {
    // everyone wears blue jeans: a few washes, picked by the outfit's own trouser colour so a body keeps its pair
    const DENIM = [0x2e3d57, 0x384a66, 0x29344a, 0x43546f];
    const c = this.c, col = [c.skin, c.shirt, DENIM[((c.pants >>> 0) * 2654435761 >>> 28) & 3], c.boots, c.sole, c.hair];
    (this.segAt = this.segAt || {})[seg] = [p, y];
    for (let r = 0; r < 6; r++) { const g = humGeo(seg, r); if (g) this.add(g, col[r], p, 0, y, 0, f); }
    // the skin under the clothes and hair: hidden (and free) until the clothes over it are shot open
    const hg = humGeo(seg, 7); if (hg) this.add(hg, c.hair, p, 0, y, 0, f);
    const sk = humGeo(seg, 8); if (sk) this.add(sk, 0x3a3936, p, 0, y, 0, f);   // socks
    for (const g of ['suit', 'shoes']) {
      const geo = garmGeo(g, seg); if (!geo) continue;
      const m = this.add(geo, GARM_MAT[g], p, 0, y, 0, f); m.userData.tex = true;
      if (g === 'suit') m.userData.tint = c.shirt;            // the shirt part is dyed the outfit's colour
    }
    const u = humGeo(seg, 6); if (u && this.M(0) !== shadowMat) { const m = this.add(u, c.skin, p, 0, y, 0, null); m.userData.under = true; m.visible = false; m.castShadow = false; }
  }
  pelvis(p, y, f) {
    f = f && 'hips';
    this.guts('pelvis', p, y);
    this.human('hips', p, y, f);
  }
  chest(p, y, f) {
    f = f && 'spine';
    this.guts('chest', p, y);
    this.human('spine', p, y, f);
  }
  head(p, cy, f) {
    f = f && 'head';
    // the head segment's origin is the head joint (cy below the old head centre)
    this.human('head', p, cy - 0.1, f);
    this.guts('head', p, cy);
    // eyes: white with a dark iris, set into the sockets
    for (const sx of [-1, 1]) { this.add(sph(0.0118), 0xe8e2d8, p, sx * 0.0312, cy - 0.0587, -0.1315); this.add(sph(0.0058), 0x2a2018, p, sx * 0.0318, cy - 0.0597, -0.1413); }
  }
  upperArm(p, top, L, side) {
    const f = side && 'sh' + side;
    this.guts('upperArm', p, top, L);
    this.human('sh' + side, p, top, f);
  }
  forearm(p, top, L, side) {
    const c = this.c, f = side && 'el' + side, sx = side === 'L' ? -1 : 1;
    this.guts('forearm', p, top, L);
    this.human('el' + side, p, top, f);
    // glove: cuff, back of the hand with knuckle guard, four curled fingers, thumb
    this.add(cylg(0.036, 0.04, 10, 0.034), c.glove, p, 0, top - L + 0.045, 0, f);
    this.add(rbox(0.074, 0.075, 0.03, 0.013), c.glove, p, 0, top - L - 0.002, 0, f);
    this.add(rbox(0.066, 0.02, 0.012, 0.005), c.dark, p, 0, top - L - 0.03, 0.014);
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.0175;
      this.add(capg(0.0085, 0.028), c.glove, p, fx, top - L - 0.055, -0.006, null, null, [0.45, 0, 0]);
      this.add(capg(0.0078, 0.022), c.glove, p, fx, top - L - 0.078, -0.027, null, null, [1.25, 0, 0]);
    }
    this.add(capg(0.01, 0.03), c.glove, p, -sx * 0.036, top - L - 0.012, -0.018, f, null, [0.7, 0, -sx * 0.5]);
    if (side === 'L') { this.add(rbox(0.05, 0.022, 0.05, 0.008), c.dark, p, 0, top - L + 0.078, 0.0); this.add(cylg(0.019, 0.008, 10), 0x1b2a22, p, 0, top - L + 0.078, 0.03, null, null, [Math.PI / 2, 0, 0]); }
  }
  thigh(p, top, L, side) {
    const f = side && 'lg' + side;
    this.guts('thigh', p, top, L);
    this.human('lg' + side, p, top, f);
  }
  shin(p, top, L, side) {
    const f = side && 'kn' + side;
    this.guts('shin', p, top, L);
    this.human('kn' + side, p, top, f);
  }
}

