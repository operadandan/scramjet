// ---------------------------------------------------------------- backpack: rounds tear straight through the fabric and carry on
// a round stopped by the plate still tears the carrier: a ragged hole in the fabric with the plate showing through
function markPlate(hit, dir, w) {
  const mesh = hit.object; if (!mesh.isMesh) return;
  if (mesh.userData.holeN === undefined) mesh.userData.holeMax = 16;
  const inv = _hm.copy(mesh.matrixWorld).invert(), a = hit.point.clone().addScaledVector(dir, -0.01).applyMatrix4(inv), dd = dir.clone().transformDirection(inv);
  const r = (CAL[w] || CAL[0])[0] * 1.5; cutHole(mesh, a, dd, 0.022, r, r * 0.7, 0x26282a);
  particles(hit.point.clone().addScaledVector(dir, -0.02), 6, debMat(0x3c3f33), 1.5, 0.005, 0.8, 0.3, dir.clone().negate());
}
function packHit(hit, dir, v) {
  const mesh = hit.object, ex = exitThrough([mesh], hit.point, dir, 0.45);
  const L = ex ? ex.len : 0.12, inv = _hm.copy(mesh.matrixWorld).invert();
  const a = hit.point.clone().addScaledVector(dir, -0.02).applyMatrix4(inv), dd = dir.clone().transformDirection(inv);
  if (mesh.userData.holeN === undefined) mesh.userData.holeMax = 12; const r0 = rnd(0.011, 0.015), r1 = r0 * rnd(1.2, 1.6);
  cutHole(mesh, a, dd, L + 0.04, r0, r1, FABRIC_IN);
  const hum = mesh.userData.hum, g = mesh.parent;
  if (hum && g && mesh.userData.frame) { const ig = _hm.copy(g.matrixWorld).invert(); hum.holes = hum.holes || []; hum.holes.push({ frame: mesh.userData.frame, p: hit.point.clone().addScaledVector(dir, -0.02).applyMatrix4(ig), d: dir.clone().transformDirection(ig), len: L + 0.04, r0, r1, pack: true }); if (hum.holes.length > 14) hum.holes.shift(); }
  particles(hit.point.clone().addScaledVector(dir, -0.02), 5, debMat(0x4f5340), 1.2, 0.006, 0.8, 0.3, dir.clone().negate());
  puff(hit.point.clone().addScaledVector(dir, -0.03), 0x55534a, 0.18, 0.5, 0.05, 0.35);
  noiseHit(700, 0.05, 0.05);
  return { point: (ex ? ex.point : hit.point.clone().addScaledVector(dir, L)).addScaledVector(dir, 0.003), dir, v: v * 0.95 };
}

// ---------------------------------------------------------------- wall destruction
// Every round chips the face it hits: a crater, a shallow pit in thick walls, chunks and dust. Damage adds up in patches about
// 10 cm across. When a patch has taken enough it breaks open into a ragged hole, and every round landing around it after that
// tears the hole wider. Plaster and plywood give way after a few rounds; concrete takes rifle fire for a long time or a couple of .50s.
const DESTR = {
  plywood:  { hp: 1100, grow: 0.09, rmax: 0.8, col: 0xc89c66, inner: 0x6a4a28, pit: 0x6a4a28, deb: 'wood', dust: 0xb48c5c, snd: [900, 0.07] },
  wood:     { hp: 2600, grow: 0.07, rmax: 0.5, col: 0xa0784a, inner: 0x3a2614, pit: 0x3a2614, deb: 'wood', dust: 0x8a6a45, snd: [800, 0.07] },
  drywall:  { hp: 800, grow: 0.11, rmax: 0.9, col: 0xe8e4dc, inner: 0x8f8a80, pit: 0xb9b3a8, deb: 'plaster', dust: 0xeeeae4, snd: [1100, 0.06] },
  concrete: { hp: 24000, grow: 0.09, rmax: 0.55, col: 0x9d988f, inner: 0x6e6a62, pit: 0x7c776e, deb: 'rock', dust: 0xb8b2a6, snd: [1400, 0.07] }
};
const DESTR_OF = { plywood: 'plywood', crate: 'wood', drywall: 'drywall', concrete: 'concrete' };
const BRK = 32, PIT0 = 32, SLOTS = 48;

// ---------------------------------------------------------------- what is left of a wall
// A grid of 5 cm cells over the wall face records what is open: inside a hole that goes all the way through, or broken away.
// After every break, any solid part no longer joined to something that holds it up (the floor, a wall or roof it touches)
// falls out as chunks, so nothing hangs in the air. The same grid lets players, bodies, blood and rounds through the openings.
const GRID_CS = 0.05;
function wallGrid(mesh) {
  const ud = mesh.userData; if (ud.grid !== undefined) return ud.grid;
  const gp = mesh.geometry.parameters; if (!gp || gp.width === undefined || !ud.box) return ud.grid = null;
  const dims = [gp.width, gp.height, gp.depth]; let ax = 0; for (let k = 1; k < 3; k++) if (dims[k] < dims[ax]) ax = k;
  if (ax === 1 || dims[ax] > 0.4) return ud.grid = null;
  const a1 = ax === 0 ? 2 : 0, a2 = 1, n1 = Math.max(2, Math.round(dims[a1] / GRID_CS)), n2 = Math.max(2, Math.round(dims[a2] / GRID_CS));
  const tex = new THREE.DataTexture(new Uint8Array(n1 * n2), n1, n2, THREE.RedFormat, THREE.UnsignedByteType); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const G = { ax, a1, a2, n1, n2, cs1: dims[a1] / n1, cs2: dims[a2] / n2, min1: -dims[a1] / 2, min2: -dims[a2] / 2, cell: new Uint8Array(n1 * n2), tex, any: false };
  // what holds it up: the floor under it, and any other solid it touches at the sides or on top
  const b = ud.box, touch = (x, y, z) => b.min.y <= 0.02 && y < 0.01 ? true : colliders.some(c => c !== b && x > c.min.x - 0.01 && x < c.max.x + 0.01 && y > c.min.y - 0.01 && y < c.max.y + 0.01 && z > c.min.z - 0.01 && z < c.max.z + 0.01);
  const ctr = mesh.position, hs = (k, s) => ctr.getComponent(k) + s * (dims[k] / 2 + 0.02), side = s => [0.2, 0.5, 0.8].some(f => { const p = ctr.clone(); p.setComponent(a1, hs(a1, s)); p.y = b.min.y + dims[1] * f; return touch(p.x, p.y, p.z); });
  G.hold = { bottom: b.min.y <= 0.02 || touch(ctr.x, b.min.y - 0.02, ctr.z), top: touch(ctr.x, b.max.y + 0.02, ctr.z), s0: side(-1), s1: side(1) };
  return ud.grid = G;
}
// local wall coordinates of a world point (walls are never rotated)
const gridIdx = (G, mesh, x, y, z) => { const l1 = (G.a1 === 0 ? x : z) - mesh.position.getComponent(G.a1), l2 = y - mesh.position.y, i = Math.floor((l1 - G.min1) / G.cs1), j = Math.floor((l2 - G.min2) / G.cs2); return i < 0 || j < 0 || i >= G.n1 || j >= G.n2 ? -1 : j * G.n1 + i; };
function gridOpenW(mesh, p) { const G = mesh.userData.grid; if (!G || !G.any) return false; const k = gridIdx(G, mesh, p.x, p.y, p.z); return k >= 0 && G.cell[k] > 0; }
// can something of this half-width and height stand where pos is and pass through the wall's openings
function gridPass(c, pos, h, r) {
  const mesh = c.mesh, G = mesh && mesh.userData.grid; if (!G || !G.any) return false;
  const along = G.a1 === 0 ? 'x' : 'z';
  // a low sill left at the bottom of an opening is stepped over
  for (let y = pos.y + 0.26; y <= pos.y + h - 0.02 + 1e-6; y += 0.1) for (const s of [-1, -0.5, 0, 0.5, 1]) {
    const q = { x: pos.x, y, z: pos.z }; q[along] += s * r * 0.8;
    const k = gridIdx(G, mesh, q.x, q.y, q.z); if (k >= 0 && !G.cell[k]) return false;
  }
  return true;
}
function updateWallGrid(mesh, D, dir) {
  const G = wallGrid(mesh); if (!G) return;
  const ud = mesh.userData, { n1, n2, cs1, cs2, min1, min2, cell } = G, q = new V3();
  const holes = ud.dmg.filter(c => c.through && c.r > 0 && c.ax === G.ax).map(c => { q.set(0, 0, 0); q.setComponent((c.ax + 1) % 3, c.u); q.setComponent((c.ax + 2) % 3, c.v); return [q.getComponent(G.a1), q.getComponent(G.a2), c.r * 1.0]; });
  if (!holes.length) return;
  for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) {
    const k = j * n1 + i; if (cell[k]) continue; const u = min1 + (i + 0.5) * cs1, v = min2 + (j + 0.5) * cs2;
    for (const [hu, hv, r] of holes) if ((u - hu) * (u - hu) + (v - hv) * (v - hv) < r * r) { cell[k] = 1; G.any = true; G.tex.image.data[k] = 255; G.dirty = true; break; }
  }
  // flood fill the solid part from whatever holds it up; the rest breaks away
  const seen = new Uint8Array(n1 * n2), st = [], push = k => { if (!cell[k] && !seen[k]) { seen[k] = 1; st.push(k); } };
  if (G.hold.bottom) for (let i = 0; i < n1; i++) push(i);
  if (G.hold.top) for (let i = 0; i < n1; i++) push((n2 - 1) * n1 + i);
  if (G.hold.s0) for (let j = 0; j < n2; j++) push(j * n1);
  if (G.hold.s1) for (let j = 0; j < n2; j++) push(j * n1 + n1 - 1);
  while (st.length) { const k = st.pop(), i = k % n1, j = (k - i) / n1; if (i > 0) push(k - 1); if (i < n1 - 1) push(k + 1); if (j > 0) push(k - n1); if (j < n2 - 1) push(k + n1); }
  const fall = []; for (let k = 0; k < n1 * n2; k++) if (!cell[k] && !seen[k]) { cell[k] = 2; fall.push(k); }
  if (G.dirty) { G.tex.needsUpdate = true; G.dirty = false; }
  if (!fall.length) return;
  for (const k of fall) G.tex.image.data[k] = 255; G.tex.needsUpdate = true;
  // the loose piece comes down as chunks, roughly one per 10 x 10 cm, capped so a big slab does not flood the scene
  const thick = [mesh.geometry.parameters.width, mesh.geometry.parameters.height, mesh.geometry.parameters.depth][G.ax], step = Math.max(1, Math.round(Math.sqrt(fall.length / 70)));
  for (let n = 0; n < fall.length; n += step * 2) {
    const k = fall[n], i = k % n1, j = (k - i) / n1; q.set(0, 0, 0); q.setComponent(G.a1, min1 + (i + 0.5) * cs1); q.setComponent(G.a2, min2 + (j + 0.5) * cs2); q.setComponent(G.ax, rnd(-0.4, 0.4) * thick);
    const wp = mesh.localToWorld(q.clone()), out = new V3().setComponent(G.ax, Math.random() < 0.5 ? 1 : -1);
    spawnDebris(wp, 1, (dir ? dir.clone().lerp(out, 0.5) : out).normalize(), 0.35, rnd(0.4, 1.6), D, Math.min(0.06, Math.max(cs1, cs2) * step * 0.9 + thick * 0.3));
  }
  const mid = fall[fall.length >> 1], mi = mid % n1, mj = (mid - mi) / n1; q.set(0, 0, 0); q.setComponent(G.a1, min1 + (mi + 0.5) * cs1); q.setComponent(G.a2, min2 + (mj + 0.5) * cs2);
  dust(mesh.localToWorld(q.clone()), new V3(0, -1, 0), D.dust, 0.8 + Math.sqrt(fall.length) * 0.05, 0.65, 2.6); noiseHit(D.deb === 'rock' ? 300 : 520, 0.3, 0.14);
  // craters that sat on the piece that fell go with it
  for (const c of ud.dmg) c.chips = c.chips.filter(ch => { q.set(0, 0, 0); q.setComponent((c.ax + 1) % 3, ch.u); q.setComponent((c.ax + 2) % 3, ch.v); const w = mesh.localToWorld(q.clone()); if (gridOpenW(mesh, w)) { dropDecal(ch.m); return false; } return true; });
}
// the wall shader also drops whatever the grid marks as broken away (with a slightly ragged edge)
const MASK_GLSL = p => '{ vec2 muv = vec2((dot(' + p + ', hS1) - hMP.x) / hMP.z, (dot(' + p + ', hS2) - hMP.y) / hMP.w); float jt = fract(sin(dot(floor(' + p + ' * 70.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);' +
  ' if (muv.x >= 0.0 && muv.x <= 1.0 && muv.y >= 0.0 && muv.y <= 1.0 && texture2D(hMask, muv).r > 0.3 + 0.35 * jt) discard; }\n';
function maskUniforms(G) {
  const s1 = new V3().setComponent(G.a1, 1), s2 = new V3().setComponent(G.a2, 1);
  return { hMask: { value: G.tex }, hMP: { value: new THREE.Vector4(G.min1, G.min2, G.n1 * G.cs1, G.n2 * G.cs2) }, hS1: { value: s1 }, hS2: { value: s2 } };
}
// a wall with no grid still gets the same shader, with an empty mask
const NO_MASK = { hMask: { value: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType) }, hMP: { value: new THREE.Vector4(0, 0, 1, 1) }, hS1: { value: new V3(1, 0, 0) }, hS2: { value: new V3(0, 1, 0) } };
NO_MASK.hMask.value.needsUpdate = true;
const MASK_DECL = '\nuniform sampler2D hMask; uniform vec4 hMP; uniform vec3 hS1; uniform vec3 hS2;\n';
function wallMask(mesh) {
  const G = wallGrid(mesh), m = mesh.material; if (!G || m.userData.hMask) return;
  const U = maskUniforms(G); Object.assign(m.userData, U); const prev = m.onBeforeCompile;
  m.onBeforeCompile = sh => { prev(sh); Object.assign(sh.uniforms, U); sh.fragmentShader = sh.fragmentShader.replace('uniform vec4 hCut;', 'uniform vec4 hCut;' + MASK_DECL).replace('if (dot(vHolePos, hCut.xyz) > hCut.w) discard;', 'if (dot(vHolePos, hCut.xyz) > hCut.w) discard;\n' + MASK_GLSL('vHolePos')); };
  m.customProgramCacheKey = () => 'holesmask' + SLOTS; m.needsUpdate = true;
  // the wall's shadow gets the same openings
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { hA: m.userData.hA, hB: m.userData.hB });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHolePos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;' + MASK_DECL + 'uniform vec4 hA[' + SLOTS + '];\nuniform vec4 hB[' + SLOTS + '];\n' + HOLE_JAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + MASK_GLSL('vHolePos') + 'for (int i = 0; i < ' + BRK + '; i++) { if (hA[i].w > 0.0) { vec3 hq = vHolePos - hA[i].xyz; float L2 = max(dot(hB[i].xyz, hB[i].xyz), 1e-8); float t = dot(hq, hB[i].xyz) / L2; if (t > 0.0 && t < 1.0) { vec3 hp = hq - hB[i].xyz * t; if (length(hp) < mix(hA[i].w, hB[i].w, t) * holeJag(i, hp, hB[i].xyz)) discard; } } }');
  };
  dm.customProgramCacheKey = () => 'wallshadow'; mesh.customDepthMaterial = dm;
}
function warmShaders() {
  try {
    const ws = new THREE.Scene(), L = new THREE.DirectionalLight(0xffffff, 1); L.castShadow = true; ws.add(L, new THREE.AmbientLight(0xffffff, 0.3));
    const mk = (kind, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0x999999)); m.userData.kind = kind; m.userData.box = { min: new V3(-w / 2, 0, -d / 2), max: new V3(w / 2, h, d / 2), mesh: m }; m.position.set(0, h / 2, -3); m.updateMatrixWorld(true); m.userData.grid = undefined; ws.add(m); return m; };
    const w = mk('plywood', 1.2, 2, 0.02), w2 = mk('metal', 1, 1, 1);
    holeify(w, SLOTS, DESTR.plywood.inner); w.userData.holeMax = SLOTS; wallMask(w);
    const add = mt => { const q = new THREE.Mesh(splatGeo, mt); q.position.set(0, 1, -2.9); ws.add(q); };
    for (const k of ['spatter', 'gore', 'spray', 'cast', 'splat', 'drip', 'smear']) { add(wallClipMat(bmat(k), w, -1)); add(bmat(k)); add(edgeClipMat(bmat(k), w2)); }
    add(wallClipMat(tubeMat(w), w, 0)); add(bmat('tear')); add(goreWet); add(goreDry); add(boneIn);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 10); renderer.compile(ws, cam);
    ws.traverse(o => { if (o.isMesh && o.customDepthMaterial) renderer.compile(o, cam); });
  } catch (e) { console.warn('shader warm-up skipped', e); }
}
function cutSlot(mesh, i, p, d, len, r0, r1, inner, t0, t1, cap) {
  holeify(mesh, SLOTS, inner); mesh.userData.holeMax = SLOTS; wallMask(mesh);
  const u = mesh.material.userData; u.hA.value[i].set(p.x, p.y, p.z, r0); u.hB.value[i].set(d.x * len, d.y * len, d.z * len, r1);
  const T = mesh.userData.tubes = mesh.userData.tubes || {};
  if (T[i]) { T[i].removeFromParent(); T[i].geometry.dispose(); }
  const D = DESTR[DESTR_OF[mesh.userData.kind]];
  const tm = new THREE.Mesh(holeTube(i, p, d, len, r0, r1, t0, t1, cap, shade(D.pit, 1.15), shade(D.inner, 0.8)), wallClipMat(tubeMat(mesh), mesh, i));
  tm.userData.tube = true; tm.receiveShadow = true; mesh.add(tm); T[i] = tm;
}
// inside of a wall: the wall's own texture, darker, lit from both sides
function tubeMat(mesh) {
  if (mesh.userData.tubeMat) return mesh.userData.tubeMat;
  const b = mesh.userData.baseMat || mesh.material;
  return mesh.userData.tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
}
// a material that is cut away wherever the given wall has an opening (blood on the wall, the wall's own tunnels). skip: own slot
// decals (skip = -1) are also cut off wherever they hang past the wall's own edges
const _wallBox = wall => { const g = wall.geometry; if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; };
function edgeClipMat(base, wall) {
  const bb = _wallBox(wall), m = base.clone(), hW = { value: wall.matrixWorld.clone().invert() }, bMin = { value: bb.min.clone() }, bMax = { value: bb.max.clone() };
  m.onBeforeCompile = sh => {
    sh.uniforms.hW = hW; sh.uniforms.bMin = bMin; sh.uniforms.bMax = bMax;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 hW;\nvarying vec3 vWallPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallPos = (hW * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWallPos;\nuniform vec3 bMin; uniform vec3 bMax;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + EDGE_CLIP);
  };
  m.customProgramCacheKey = () => 'eclip';
  return m;
}
const EDGE_CLIP = 'if (any(lessThan(vWallPos, bMin - vec3(0.012))) || any(greaterThan(vWallPos, bMax + vec3(0.012)))) discard;';
function wallClipMat(base, wall, skip) {
  if (!DESTR_OF[wall.userData.kind]) return skip === -1 && wall.geometry ? edgeClipMat(base, wall) : base;
  if (wall.userData.holeN === undefined) holeify(wall, SLOTS, DESTR[DESTR_OF[wall.userData.kind]].inner);
  wall.userData.holeMax = SLOTS;
  // one shader for every decal and tunnel on a wall: which slot to leave out is a uniform, not baked into the code, so a new hole
  // never has to compile a new program (that stall was the lag when shooting walls). Everything is also cut at the wall's edges.
  const m = base.clone(), U = wall.material.userData, hW = { value: wall.matrixWorld.clone().invert() }, bb = _wallBox(wall), bMin = { value: bb.min.clone() }, bMax = { value: bb.max.clone() }, G = wallGrid(wall), MU = G ? maskUniforms(G) : NO_MASK, hSkip = { value: skip };
  m.onBeforeCompile = sh => {
    sh.uniforms.hA = U.hA; sh.uniforms.hB = U.hB; sh.uniforms.hW = hW; sh.uniforms.bMin = bMin; sh.uniforms.bMax = bMax; sh.uniforms.hSkip = hSkip; Object.assign(sh.uniforms, MU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 hW;\nvarying vec3 vWallPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallPos = (hW * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWallPos;\nuniform vec3 bMin; uniform vec3 bMax; uniform int hSkip;' + MASK_DECL + '\nuniform vec4 hA[' + SLOTS + '];\nuniform vec4 hB[' + SLOTS + '];\n' + HOLE_JAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + EDGE_CLIP + MASK_GLSL('vWallPos') + '\nfor (int i = 0; i < ' + SLOTS + '; i++) { if (i != hSkip && hA[i].w > 0.0) { vec3 hq = vWallPos - hA[i].xyz; float L2 = max(dot(hB[i].xyz, hB[i].xyz), 1e-8); float t = dot(hq, hB[i].xyz) / L2; if (t > 0.0 && t < 1.0) { vec3 hp = hq - hB[i].xyz * t; if (length(hp) < mix(hA[i].w, hB[i].w, t) * holeJag(i, hp, hB[i].xyz)) discard; } } }');
  };
  m.customProgramCacheKey = () => 'wclipU';
  return m;
}
function placeDecalD(mesh, point, normal, size, material, depth) {
  decalHelper.position.copy(point); decalHelper.lookAt(_a.copy(point).add(normal)); decalHelper.rotateZ(Math.random() * Math.PI * 2);
  let geo; try { geo = new DecalGeometry(mesh, point, decalHelper.rotation, new V3(size, size, depth)); } catch (e) { return null; }
  if (!geo.attributes.position || !geo.attributes.position.count) { geo.dispose(); return null; }
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; scene.add(m); decals.push(m); trimDecals(); return m;
}
const dropDecal = m => { if (!m) return; scene.remove(m); const i = decals.indexOf(m); if (i >= 0) decals.splice(i, 1); m.geometry.dispose(); };
// chip craters (opaque) and the torn edge round an opened hole (clear in the middle so the hole shows)
function chipCanvas(draw, clear) {
  const t = canvasTex((g, s) => { g.clearRect(0, 0, s, s); const c = s / 2; draw(g, s, c); if (clear) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.283, r = s * clear * (1 + (Math.random() < 0.3 ? rnd(0, 0.06) : 0)); i ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.fill(); g.globalCompositeOperation = 'source-over'; } }, 256, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; return t;
}
const cracks = (g, c, r0, r1, n, col, lw) => { g.strokeStyle = col; g.lineCap = 'round'; for (let i = 0; i < n; i++) { let a = Math.random() * 6.283, x = c + Math.cos(a) * r0, y = c + Math.sin(a) * r0; g.lineWidth = lw * rnd(0.6, 1.3); g.beginPath(); g.moveTo(x, y); const st = 5, L = rnd(0.6, 1) * (r1 - r0) / st; for (let k = 0; k < st; k++) { a += rnd(-0.45, 0.45); x += Math.cos(a) * L; y += Math.sin(a) * L; g.lineTo(x, y); if (Math.random() < 0.25) { g.stroke(); g.lineWidth *= 0.6; g.beginPath(); g.moveTo(x, y); } } g.stroke(); } };
const speck = (g, c, r0, r1, n, cols, a0, a1) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = rnd(r0, r1), sz = rnd(a0, a1); g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, sz, sz * rnd(0.5, 1), Math.random() * 3, 0, 7); g.fill(); } };
const CHIP_TEX = {
  rock: [0, 1, 2].map(() => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.18, c, c, s * 0.5); du.addColorStop(0, 'rgba(205,200,190,0.55)'); du.addColorStop(1, 'rgba(205,200,190,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * 0.33, 13, 0.3, 'rgba(196,190,178,1)');
    irregular(g, c, c, s * 0.26, 11, 0.32, 'rgba(160,154,143,1)');
    speck(g, c, 0, s * 0.27, 26, ['rgba(120,114,104,1)', 'rgba(215,210,200,1)', 'rgba(95,90,82,1)'], 1.5, 4.5);
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.16); h.addColorStop(0, 'rgba(48,45,40,1)'); h.addColorStop(0.6, 'rgba(85,80,72,0.95)'); h.addColorStop(1, 'rgba(120,114,104,0)'); g.fillStyle = h; g.beginPath(); g.arc(c, c, s * 0.16, 0, 7); g.fill();
    cracks(g, c, s * 0.2, s * 0.48, 6, 'rgba(55,52,47,0.85)', 1.6);
  })),
  wood: [0, 1, 2].map(() => chipCanvas((g, s, c) => {
    g.save(); g.translate(c, c); g.scale(0.6, 1.25); irregular(g, 0, 0, s * 0.28, 16, 0.4, 'rgba(222,190,138,1)'); g.restore();
    g.strokeStyle = 'rgba(240,214,166,1)'; for (let i = 0; i < 26; i++) { const x = c + rnd(-0.16, 0.16) * s, y0 = c + rnd(-0.2, 0.2) * s; g.lineWidth = rnd(1, 3); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + rnd(-4, 4), y0 + rnd(-0.22, 0.22) * s); g.stroke(); }
    g.strokeStyle = 'rgba(150,110,62,0.9)'; for (let i = 0; i < 8; i++) { const x = c + rnd(-0.12, 0.12) * s; g.lineWidth = 1; g.beginPath(); g.moveTo(x, c - s * 0.3); g.lineTo(x + rnd(-2, 2), c + s * 0.3); g.stroke(); }
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.12); h.addColorStop(0, 'rgba(40,24,10,1)'); h.addColorStop(0.7, 'rgba(90,60,30,0.9)'); h.addColorStop(1, 'rgba(120,85,45,0)'); g.fillStyle = h; g.beginPath(); g.ellipse(c, c, s * 0.08, s * 0.13, 0, 0, 7); g.fill();
  })),
  plaster: [0, 1, 2].map(() => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.2, c, c, s * 0.5); du.addColorStop(0, 'rgba(150,146,138,0.35)'); du.addColorStop(1, 'rgba(150,146,138,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * 0.34, 18, 0.25, 'rgba(178,172,162,1)');
    irregular(g, c, c, s * 0.31, 18, 0.22, 'rgba(250,248,244,1)');
    speck(g, c, s * 0.05, s * 0.3, 30, ['rgba(232,228,220,1)', 'rgba(205,200,192,1)'], 1.5, 4);
    const h = g.createRadialGradient(c, c, 0, c, c, s * 0.15); h.addColorStop(0, 'rgba(70,68,64,1)'); h.addColorStop(0.5, 'rgba(150,146,138,1)'); h.addColorStop(1, 'rgba(225,221,214,0)'); g.fillStyle = h; g.beginPath(); g.arc(c, c, s * 0.15, 0, 7); g.fill();
  }))
};
const BREAK_TEX = {
  rock: [0, 1].map(() => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5); du.addColorStop(0, 'rgba(200,195,185,0.6)'); du.addColorStop(1, 'rgba(200,195,185,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * 0.41, 22, 0.12, 'rgba(178,172,160,1)'); irregular(g, c, c, s * 0.36, 22, 0.08, 'rgba(140,134,124,1)');
    speck(g, c, s * 0.3, s * 0.4, 50, ['rgba(110,105,96,1)', 'rgba(210,205,195,1)', 'rgba(80,76,70,1)'], 1.5, 5);
    cracks(g, c, s * 0.38, s * 0.5, 9, 'rgba(55,52,47,0.85)', 1.8);
  }, 0.3)),
  wood: [0, 1].map(() => chipCanvas((g, s, c) => {
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, L = s * (0.32 + Math.pow(Math.random(), 3) * 0.17), w = rnd(0.015, 0.05); g.fillStyle = ['rgba(214,180,130,0.95)', 'rgba(180,140,92,0.95)', 'rgba(120,86,50,0.9)'][i % 3]; g.beginPath(); g.moveTo(c + Math.cos(a - w) * s * 0.28, c + Math.sin(a - w) * s * 0.28); g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L); g.lineTo(c + Math.cos(a + w) * s * 0.28, c + Math.sin(a + w) * s * 0.28); g.fill(); }
    irregular(g, c, c, s * 0.335, 30, 0.05, 'rgba(196,160,110,1)'); irregular(g, c, c, s * 0.315, 30, 0.04, 'rgba(110,78,44,1)');
  }, 0.3)),
  plaster: [0, 1].map(() => chipCanvas((g, s, c) => {
    const du = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5); du.addColorStop(0, 'rgba(160,156,148,0.45)'); du.addColorStop(1, 'rgba(160,156,148,0)'); g.fillStyle = du; g.fillRect(0, 0, s, s);
    irregular(g, c, c, s * 0.4, 30, 0.1, 'rgba(170,165,156,0.9)'); irregular(g, c, c, s * 0.37, 30, 0.08, 'rgba(236,233,226,1)'); irregular(g, c, c, s * 0.33, 30, 0.05, 'rgba(160,155,146,1)');
    speck(g, c, s * 0.3, s * 0.38, 40, ['rgba(226,222,214,1)', 'rgba(200,196,188,1)'], 1.5, 3.5);
  }, 0.3))
};
const decalMatOf = t => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.95 });
const CHIP_MAT = {}, BREAK_MAT = {};
for (const k in CHIP_TEX) { CHIP_MAT[k] = CHIP_TEX[k].map(decalMatOf); BREAK_MAT[k] = BREAK_TEX[k].map(decalMatOf); }
const pick = a => a[Math.floor(Math.random() * a.length)];

// debris: rough rock chunks, wood splinters, plaster flakes. They tumble, bounce and settle, and stay on the floor for a while
const DEB_GEO = [0, 1, 2, 3].map(() => {
  const g = new THREE.DodecahedronGeometry(1, 0), p = g.attributes.position, J = {};
  for (let i = 0; i < p.count; i++) { const k = Math.round(p.getX(i) * 100) + ',' + Math.round(p.getY(i) * 100) + ',' + Math.round(p.getZ(i) * 100); const j = J[k] || (J[k] = rnd(0.55, 1.15)); p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.8, p.getZ(i) * j); }
  g.computeVertexNormals(); return g;
});
const debris = [], DEB_MAT = {};
const debMat = col => DEB_MAT[col] || (DEB_MAT[col] = new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
const shade = (col, k) => { const c = new THREE.Color(col).multiplyScalar(k); return c.getHex(); };
function spawnDebris(p, n, dir, spread, speed, D, sz) {
  for (let i = 0; i < n; i++) {
    const s = sz * rnd(0.3, 1.25); let geo, sc;
    if (D.deb === 'wood') { geo = fxBox; sc = [s * rnd(0.2, 0.45), s * rnd(0.12, 0.3), s * rnd(1.5, 4.5)]; }
    else if (D.deb === 'plaster') { geo = pick(DEB_GEO); sc = [s, s * 0.22, s * rnd(0.7, 1.1)]; }
    else { geo = pick(DEB_GEO); sc = [s, s * rnd(0.6, 1), s * rnd(0.7, 1.1)]; }
    const col = D.deb === 'wood' ? (Math.random() < 0.5 ? 0xe0c08c : 0xb48a58) : shade(Math.random() < 0.35 ? D.pit : D.col, Math.round(rnd(8, 11)) / 10);
    const m = new THREE.Mesh(geo, debMat(col)); m.scale.set(sc[0], sc[1], sc[2]);
    m.position.copy(p).add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.012)); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    m.castShadow = s > 0.012; scene.add(m);
    const v = dir.clone().multiplyScalar(speed * rnd(0.35, 1.1)).add(new V3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).multiplyScalar(spread * speed));
    debris.push({ m, v, w: new V3(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25)), r: Math.min(sc[0], sc[1], sc[2]) * 0.5, life: rnd(20, 35), rest: false, flake: D.deb === 'plaster' });
  }
  while (debris.length > 450) { const d = debris.shift(); scene.remove(d.m); }
}
const _dprev = new V3();
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life -= dt;
    if (d.life <= 0) { d.m.scale.multiplyScalar(Math.max(0, 1 - dt * 3)); if (d.life < -1) { scene.remove(d.m); debris.splice(i, 1); } continue; }
    if (d.rest) continue;
    if (d.flake) { d.v.multiplyScalar(1 - 2.5 * dt); d.v.y -= 4 * dt; } else d.v.y -= 9.8 * dt;
    _dprev.copy(d.m.position); d.m.position.addScaledVector(d.v, dt);
    d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
    let floor = d.r;
    for (const c of colliders) {
      const p = d.m.position;
      if (p.x > c.min.x && p.x < c.max.x && p.z > c.min.z && p.z < c.max.z && p.y < c.max.y + d.r && p.y > c.min.y && !(c.mesh && gridOpenW(c.mesh, p))) {
        if (_dprev.y >= c.max.y + d.r * 0.5) floor = Math.max(floor, c.max.y + d.r);
        else { d.m.position.x = _dprev.x; d.m.position.z = _dprev.z; if (_dprev.x <= c.min.x || _dprev.x >= c.max.x) d.v.x *= -0.3; else d.v.z *= -0.3; }
      }
    }
    if (d.m.position.y < floor) {
      d.m.position.y = floor;
      if (d.v.y < -0.9) { d.v.y *= -0.28; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5); }
      else { d.rest = true; d.m.rotation.x = Math.round(d.m.rotation.x / Math.PI) * Math.PI; d.m.rotation.z = Math.round(d.m.rotation.z / Math.PI) * Math.PI; }
    }
  }
}
function dust(p, n, col, size, op, life) {
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: col, transparent: true, depthWrite: false, opacity: op }));
    s.position.copy(p); s.scale.setScalar(size * 0.3); scene.add(s);
    const v = n.clone().multiplyScalar(rnd(0.6, 2.2)).add(new V3(rnd(-0.5, 0.5), rnd(-0.2, 0.5), rnd(-0.5, 0.5)));
    fx.push({ o: s, life: life * rnd(0.7, 1.2), max: life, fade: op, grow: size * rnd(0.8, 1.4), rise: 0.06, dispose: true, sprite: true, sv: v });
  }
}
// an open hole that a round goes straight through without touching anything
function holePass(mesh, point, n, dir, v) {
  const ud = mesh.userData; if (!ud.dmg || !ud.box) return null;
  const fresh = performance.now() - (ud.brokeT || 0) < 40;
  if (!fresh && gridOpenW(mesh, point.clone().addScaledVector(dir, 0.01))) { const bx = boxExit(ud.box, point, dir); return { point: point.clone().addScaledVector(dir, bx.t + 0.01), dir, v, free: true }; }
  const ax = Math.abs(n.x) > 0.7 ? 0 : Math.abs(n.y) > 0.7 ? 1 : 2, pl = mesh.worldToLocal(point.clone());
  for (const c of ud.dmg) {
    if (c.r <= 0 || !c.through || c.ax !== ax || fresh) continue;
    if (Math.hypot(pl.getComponent((ax + 1) % 3) - c.u, pl.getComponent((ax + 2) % 3) - c.v) < c.r * 0.92) {
      const bx = boxExit(ud.box, point, dir); return { point: point.clone().addScaledVector(dir, bx.t + 0.01), dir, v, free: true };
    }
  }
  return null;
}
// one round's worth of damage to one face. side 1 = the face it went in through, 0 = the far face it came out of
function wallDamage(mesh, point, n, dir, E, w, side, through) {
  const D = DESTR[DESTR_OF[mesh.userData.kind]]; if (!D) return;
  const ud = mesh.userData, gp = mesh.geometry.parameters, dims = [gp.width, gp.height, gp.depth];
  const ax = Math.abs(n.x) > 0.7 ? 0 : Math.abs(n.y) > 0.7 ? 1 : 2, sgn = Math.sign(n.getComponent(ax)) || 1, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
  const thick = dims[ax], pl = mesh.worldToLocal(point.clone()), u = pl.getComponent(a1), v = pl.getComponent(a2);
  const cal = (CAL[w] || CAL[0])[0], pistol = isPistol(w), rock = D.deb === 'rock';
  ud.dmg = ud.dmg || [];
  let c = null, bd = 1e9;
  for (const k of ud.dmg) { if (k.ax !== ax) continue; const dd = Math.hypot(k.u - u, k.v - v); if (dd < Math.max(0.09, k.r + 0.12) && dd < bd) { bd = dd; c = k; } }
  if (!c) { c = { ax, u, v, d: 0, r: 0, slot: -1, chips: [], rings: [], through: false }; ud.dmg.push(c); }
  // a pistol round flattens and bursts on concrete: lots of dust and a scar, very little real damage
  c.d += E * (side ? 1 : 0.5) * (rock && pistol ? 0.2 : 1) * (isShotgun(w) ? (rock ? 1.4 : 3.2) : 1);
  const out = n.clone(), pOut = point.clone().addScaledVector(out, 0.012);
  const refl = dir.clone().addScaledVector(out, -2 * dir.dot(out)).normalize();
  const eject = side ? refl.lerp(out, 0.5).normalize() : dir.clone().lerp(out, 0.4).normalize();
  const bits = clamp(Math.round((side ? 4 : 6) + E / (rock ? 700 : 500)), 3, 22);
  spawnDebris(pOut, bits, eject, 0.45, rock ? rnd(2.5, 4.5) : rnd(1.8, 3.2), D, (rock ? 0.006 : 0.008) + cal * (rock ? 0.6 : 0.8) + Math.min(0.02, E / 900000));
  dust(pOut, eject, D.dust, 0.35 + Math.min(0.9, E / 9000) + (side ? 0 : 0.2), D.deb === 'plaster' ? 0.75 : 0.6, rock ? 1.6 : 1.2);
  if (rock && side) particles(pOut, pistol ? 6 : 3, PMAT.spark, 3.5, 0.004, 0.14, 0.3, out, 5);
  if (side) noiseHit(D.snd[0], D.snd[1], 0.05);
  if (c.r <= 0 && c.d < D.hp) {
    // still holding: a crater on this face, cut a little way in on anything thicker than a sheet
    const size = (rock ? 0.06 + cal * 4.5 : D.deb === 'wood' ? 0.045 + cal * 3.2 : 0.055 + cal * 3.5) * (side ? 1 : 1.35) * rnd(0.85, 1.2) + Math.min(0.08, E / 250000);
    const m = placeDecalD(mesh, point, n, size, pick(CHIP_MAT[D.deb]), Math.min(0.03, thick * 0.45));
    if (m) c.chips.push({ m, u, v });
    if (thick > 0.05) {
      const i = PIT0 + ((ud.pitN = (ud.pitN || 0) + 1) % (SLOTS - PIT0)), nl = new V3(); nl.setComponent(ax, sgn);
      const depth = Math.min(thick * 0.35, 0.006 + E / D.hp * 0.05);
      cutSlot(mesh, i, pl.clone().addScaledVector(nl, 0.02), nl.clone().negate(), 0.02 + depth, size * 0.14, size * 0.07, D.pit, 0.02 / (0.02 + depth), 1, true);
    }
    return;
  }
  const nr = Math.min(D.rmax, 0.03 + cal * 1.5 + D.grow * Math.sqrt(Math.max(0, c.d / D.hp - 1) + 0.04));
  if (nr > c.r + 0.004) breakOpen(mesh, c, nr, D, dims, dir, sgn);
}
function breakOpen(mesh, c, nr, D, dims, dir, sgn) {
  const ud = mesh.userData, ax = c.ax, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, thick = dims[ax], old = c.r;
  if (c.slot < 0) {
    const used = ud.dmg.filter(o => o.slot >= 0);
    if (used.length >= BRK) {
      let best = used[0], bd = 1e9; for (const o of used) { if (o.ax !== ax) continue; const dd = Math.hypot(o.u - c.u, o.v - c.v) - o.r; if (dd < bd) { bd = dd; best = o; } }
      best.d += c.d; c.d = 0; for (const ch of c.chips) dropDecal(ch.m); c.chips = [];
      const r2 = Math.min(D.rmax, best.r + 0.03); if (r2 > best.r) { const i = ud.dmg.indexOf(c); if (i >= 0) ud.dmg.splice(i, 1); return breakOpen(mesh, best, r2, D, dims, dir, sgn); }
      return;
    }
    c.slot = used.length;
  }
  // the hole goes all the way through anything wall-thick; a big solid block only gets a deep crater
  const full = thick <= 0.4, p0 = new V3(), d = new V3();
  p0.setComponent(a1, c.u); p0.setComponent(a2, c.v);
  if (full) { p0.setComponent(ax, -(thick / 2 + 0.05)); d.setComponent(ax, 1); }
  else { p0.setComponent(ax, sgn * (thick / 2 + 0.05)); d.setComponent(ax, -sgn); }
  const ln = full ? thick + 0.1 : 0.3; cutSlot(mesh, c.slot, p0, d, ln, nr, nr * (D.deb === 'rock' ? 1.12 : 1.04), D.inner, 0.05 / ln, full ? (thick + 0.05) / ln : 1, !full);
  c.r = nr; c.through = full; ud.brokeT = performance.now();
  // craters that are now inside the hole would float in the air: take them away
  for (const o of ud.dmg) if (o.ax === ax) o.chips = o.chips.filter(ch => { if (Math.hypot(ch.u - c.u, ch.v - c.v) < nr * 1.05) { dropDecal(ch.m); return false; } return true; });
  for (const r of c.rings) dropDecal(r); c.rings = [];
  // what used to fill the hole comes off as chunks, most of it out the far side
  const area = Math.PI * (nr * nr - old * old), n = clamp(Math.round(area * 2600), 8, 45), fw = new V3().setComponent(ax, -sgn), bk = fw.clone().negate();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(rnd(old * old, nr * nr) / (nr * nr)) * nr, q = new V3();
    q.setComponent(a1, c.u + Math.cos(a) * rr); q.setComponent(a2, c.v + Math.sin(a) * rr);
    const fwd = Math.random() < 0.72; q.setComponent(ax, (fwd ? -sgn : sgn) * (thick / 2 + 0.015));
    spawnDebris(mesh.localToWorld(q), 1, (fwd ? dir.clone().lerp(fw, 0.4) : bk).normalize(), 0.5, rnd(1.5, 4.2), D, D.deb === 'rock' ? 0.022 : D.deb === 'wood' ? 0.03 : 0.028);
  }
  const cw = mesh.localToWorld(p0.clone().setComponent(ax, -sgn * thick / 2));
  dust(cw, fw, D.dust, 0.9 + nr * 3, 0.7, 2.4);
  dust(mesh.localToWorld(p0.clone().setComponent(ax, sgn * thick / 2)), bk, D.dust, 0.6 + nr * 2, 0.55, 2);
  noiseHit(D.deb === 'rock' ? 400 : 650, 0.18, 0.12);
  if (full) updateWallGrid(mesh, D, dir);
}
// a hit on a ragdoll piece, expressed in the skeleton frame that piece stands for, so the anatomy sees the right body part
function ragHitInfo(hit, dir) {
  const g = hit.object.parent, rf = g.userData.rf, lp = g.worldToLocal(hit.point.clone());
  const d = dir.clone().applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  let frame = 'spine', armor = hit.object.userData.armor;
  if (rf === 'torso') { if (lp.y + 0.24 >= -0.02) lp.y += 0.24; else { frame = 'hips'; lp.y += 0.31; } }
  else if (rf === 'head') { if (lp.y >= -0.085) { frame = 'head'; lp.y += 0.1; } else { frame = 'neck'; lp.y += 0.16; } }
  else if (rf) { frame = ['shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR'][rf.seg]; lp.y += rf.dy; }
  if (!armor && frame === 'spine' && Math.abs(lp.x) < 0.14 && lp.y > 0.19 && lp.y < 0.5 && lp.z < 0) armor = 'plateF';
  return { frame, e: lp, d, armor };
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    if (f.v) {
      if (f.grav) f.v.y -= 9.8 * dt;
      f.o.position.addScaledVector(f.v, dt);
      if (f.spin) { f.o.rotation.x += dt * 9; f.o.rotation.y += dt * 7; }
      if (f.align) f.o.lookAt(_a.copy(f.o.position).add(f.v));
      if (f.o.position.y < 0.005) {
        if (f.drop) { groundSplat(new V3(f.o.position.x, 0.003 + Math.random() * 0.002, f.o.position.z), rnd(0.07, 0.18)); f.life = 0; }
        else { f.o.position.y = 0.005; f.v.y *= -0.25; f.v.x *= 0.5; f.v.z *= 0.5; }
      } else if (f.drop && pointBlocked(f.o.position, 0)) f.life = 0;
    }
    if (f.sv) { f.o.position.addScaledVector(f.sv, dt); f.sv.multiplyScalar(Math.max(0, 1 - 3 * dt)); }
    if (f.sprite) { const k = 1 - f.life / f.max; f.o.scale.setScalar(f.grow * (0.4 + k * 0.9)); f.o.position.y += f.rise * dt; }
    if (f.fade !== undefined) f.o.material.opacity = f.fade * Math.max(0, f.life / f.max);
    if (f.life <= 0) { scene.remove(f.o); if (f.dispose) f.o.material.dispose(); fx.splice(i, 1); }
  }
}

