// ---------------------------------------------------------------- gore: pieces of a body that come away in a blast
// Skull plates (scalp outside, bone inside), brain, raw muscle with fat, bone shards, loops of gut, pieces of lung and liver.
// They fly, tumble and bleed as they go, and where one lands it leaves a smear and a little pool. Each kind has several shapes.
const GORE_MAX = 170, gore = [];
const goreWet = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMapIntensity: 0.3 });
// a little light wraps round to the shadow side (tissue lets light through), so meat does not go black where it faces away
goreWet.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.12;'); };
goreWet.customProgramCacheKey = () => 'goreWrap';
const goreDry = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
const boneIn = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.BackSide });
// a rough blob: an icosphere pushed in and out, the same amount at shared corners so it stays closed
function lumpy(det, amp, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, det), p = g.attributes.position, J = {};
  const ph = [rnd(0, 6), rnd(0, 6), rnd(0, 6)], f = rnd(2, 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.round(x * 1e3) + ',' + Math.round(y * 1e3) + ',' + Math.round(z * 1e3);
    const j = J[k] || (J[k] = 1 + amp * (Math.sin(x * f + ph[0]) * Math.sin(y * f + ph[1]) * Math.sin(z * f + ph[2]) * 1.6 + rnd(-0.5, 0.5)));
    p.setXYZ(i, x * j * sx, y * j * sy, z * j * sz);
  }
  // the icosphere comes unindexed (every face its own corners): weld it so the normals are smooth and the piece reads as
  // soft wet tissue, not a cut gem
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVertices(g); m.computeVertexNormals(); return m;
}
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const col = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const nz = (x, y, z, f, s) => Math.sin(x * f + s) * Math.sin(y * f * 1.3 + s * 2) * Math.sin(z * f * 0.8 + s * 3);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// colours as they look on screen (sRGB hex), converted to the renderer's linear space
const C_ = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const C_MEAT = C_(0x6e1512), C_RAW = C_(0x8c2a22), C_FAT = C_(0xa88a52), C_CLOT = C_(0x2a0606), C_BONE = C_(0xcfc2a4), C_BRAIN = C_(0x9c7470), C_SULC = C_(0x6a3e3e);
const C_LUNG = [C_(0xa0504e), C_(0x7a3432)], C_LIVER = C_(0x4a1410), C_GUT = [C_(0xa86a5e), C_(0x7a3a30)], C_MARROW = C_(0x6a1a14), C_SKULLB = C_(0x7a1a16);
const GORE_GEO = {
  // torn muscle: dark meat, rawer streaks, patches of yellow fat, clotted edges
  flesh: Array.from({ length: 6 }, () => { const s = rnd(0, 9); return paint(lumpy(1, 0.32, rnd(0.8, 1.3), rnd(0.6, 1), rnd(0.8, 1.2)), (x, y, z) => { const n = nz(x, y, z, 5, s); return n > 0.35 ? C_FAT : n < -0.3 ? C_CLOT : mixc(C_MEAT, C_RAW, 0.5 + 0.5 * Math.sin(y * 9 + s)); }); }),
  // brain: pinkish grey with the folds showing darker, streaked with blood
  brain: Array.from({ length: 4 }, () => { const s = rnd(0, 9); return paint(lumpy(2, 0.2, rnd(0.9, 1.2), rnd(0.7, 0.9), rnd(0.9, 1.1)), (x, y, z) => { const f = Math.abs(Math.sin(x * 11 + s) + Math.sin(z * 9 + y * 6 + s)); return nz(x, y, z, 4, s) > 0.45 ? C_MEAT : f < 0.35 ? C_SULC : C_BRAIN; }); }),
  // bone shard: a long splinter, ivory, red marrow at the broken end
  bone: Array.from({ length: 4 }, () => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(rnd(0.25, 0.4), 1, rnd(0.2, 0.35)); g.computeVertexNormals(); return paint(g, (x, y) => y < -0.7 ? C_MARROW : C_BONE); }),
  // a loop of gut: pink-tan tube, glossy
  gut: Array.from({ length: 3 }, () => { const g = new THREE.TorusGeometry(1, rnd(0.28, 0.38), 6, 12, rnd(1.6, 3.6)); return paint(g, (x, y, z) => nz(x, y, z, 6, 1) > 0.4 ? C_GUT[1] : C_GUT[0]); }),
  // liver (dark, smooth) and lung (pink, spongy) pieces
  liver: Array.from({ length: 2 }, () => paint(lumpy(1, 0.18, 1.3, 0.6, 1), (x, y, z) => nz(x, y, z, 7, 2) > 0.5 ? C_CLOT : C_LIVER)),
  lung: Array.from({ length: 2 }, () => paint(lumpy(1, 0.3, 1, 0.8, 1), (x, y, z) => nz(x, y, z, 9, 3) > 0.2 ? C_LUNG[1] : C_LUNG[0]))
};
// a curved plate of skull: scalp on the outside, bone on the inside, a bloody rim
function skullPiece(skin) {
  const ph = rnd(0.5, 1.1), th = rnd(0.45, 0.9), g = new THREE.SphereGeometry(1, 8, 6, rnd(0, 6), ph, rnd(0.2, 1.5), th);
  const sk = new THREE.Color(skin || 0xc19275);
  const out = new THREE.Mesh(paint(g, () => Math.random() < 0.25 ? C_SKULLB : [sk.r, sk.g, sk.b]), goreDry);
  const inn = new THREE.Mesh(paint(g.clone(), () => Math.random() < 0.35 ? C_SKULLB : C_BONE), boneIn); inn.scale.setScalar(0.94);
  const grp = new THREE.Group(); grp.add(out, inn); out.castShadow = true; return grp;
}
// kinds: flesh, brain, bone, gut, liver, lung, skull. size is the rough radius in metres
const _gcu = new V3(), _gcv = new V3();
function coneDir(dir, half) {
  const d = dir.clone().normalize(), u = _gcu.crossVectors(d, Math.abs(d.y) < 0.9 ? _Y : new V3(1, 0, 0)).normalize(), w = _gcv.crossVectors(d, u);
  const ct = 1 - Math.random() * (1 - Math.cos(half)), st = Math.sqrt(1 - ct * ct), ph = Math.random() * 6.283;
  return d.multiplyScalar(ct).addScaledVector(u, st * Math.cos(ph)).addScaledVector(w, st * Math.sin(ph));
}
function spawnGore(p, dir, kind, n, speed, spread, size, skin) {
  for (let i = 0; i < n; i++) {
    // sizes spread log-normally (lots of small crumbs, now and then a big piece), and no two the same shape
    let m; const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15, s = size * clamp(Math.exp(g * 0.6), 0.25, 2.8);
    if (kind === 'skull') m = skullPiece(skin);
    else { m = new THREE.Mesh(pick(GORE_GEO[kind]), kind === 'bone' ? goreDry : goreWet); m.castShadow = s > 0.01; }
    m.scale.set(s * rnd(0.6, 1.4), s * rnd(0.55, 1.35), s * rnd(0.6, 1.4)); if (kind === 'bone') m.scale.y *= rnd(1.5, 2.6);
    m.position.copy(p).add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.02)); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); scene.add(m);
    // thrown in a cone round dir (the half-angle grows with spread: about 25 degrees for an exit, 40 for a blast), cosine
    // weighted toward the middle, with a little lift and nothing more
    const v = coneDir(dir, clamp(spread * 0.75, 0.2, 0.9)).multiplyScalar(speed * rnd(0.55, 1.05)); v.y += 0.2 * speed * 0.3;
    // brain and gut stick and slump, bone and skull bounce a little
    const bounce = kind === 'bone' || kind === 'skull' ? 0.25 : 0.04;
    gore.push({ m, v, w: new V3(rnd(-18, 18), rnd(-18, 18), rnd(-18, 18)), r: s * (kind === 'skull' ? 0.35 : 0.6), life: rnd(50, 80), rest: false, bounce, landed: false, bleed: kind === 'bone' ? 0.3 : 1, drip: 0, kind });
  }
  while (gore.length > GORE_MAX) { const g = gore.shift(); scene.remove(g.m); }
}
const _gp = new V3();
function updateGore(dt) {
  for (let i = gore.length - 1; i >= 0; i--) {
    const g = gore[i]; g.life -= dt;
    if (g.life <= 0) { g.m.scale.multiplyScalar(Math.max(0, 1 - dt * 2)); if (g.life < -1.5) { scene.remove(g.m); gore.splice(i, 1); } continue; }
    if (g.rest) continue;
    g.v.y -= 9.8 * dt; g.v.multiplyScalar(1 - 0.25 * dt);
    _gp.copy(g.m.position); g.m.position.addScaledVector(g.v, dt);
    g.m.rotation.x += g.w.x * dt; g.m.rotation.y += g.w.y * dt; g.m.rotation.z += g.w.z * dt;
    // bleeding in flight: a thin trail of drops for the first moments
    // (at an uneven rate and scattered sideways: a steady drip from a piece flying straight left a ladder of evenly spaced dots)
    if (!g.landed && g.bleed > 0) { g.drip += dt * rnd(3, 8) * g.bleed; while (g.drip > 1) { g.drip -= rnd(0.6, 1.6); spawnDrop(g.m.position, g.v.clone().multiplyScalar(rnd(0.2, 0.6)).add(new V3(rnd(-0.5, 0.5), rnd(-0.3, 0.2), rnd(-0.5, 0.5))), spatR() * 1.3); } g.bleed -= dt * 1.5; }
    let floor = g.r;
    for (const c of colliders) {
      const q = g.m.position;
      if (q.x > c.min.x && q.x < c.max.x && q.z > c.min.z && q.z < c.max.z && q.y < c.max.y + g.r && q.y > c.min.y && !(c.mesh && gridOpenW(c.mesh, q))) {
        if (_gp.y >= c.max.y + g.r * 0.5) floor = Math.max(floor, c.max.y + g.r);
        else {
          // hit a wall: leave a mark where it struck and drop
          if (!g.wallHit && g.v.length() > 2) { g.wallHit = true; const n = new V3(); if (_gp.x <= c.min.x) n.x = -1; else if (_gp.x >= c.max.x) n.x = 1; else if (_gp.z <= c.min.z) n.z = -1; else n.z = 1; wallSplat(_gp.clone(), n, rnd(0.06, 0.14) * (g.kind === 'bone' ? 0.5 : 1), g.v.clone().normalize(), c.min.y); }
          q.x = _gp.x; q.z = _gp.z; g.v.x *= -0.2; g.v.z *= -0.2;
        }
      }
    }
    if (g.m.position.y < floor) {
      g.m.position.y = floor;
      if (!g.landed) {
        g.landed = true;
        // where it lands: a smear along the way it was moving, and the blood it carried
        const h = new V3(g.v.x, 0, g.v.z), sp = h.length();
        if (g.kind !== 'bone' && g.r > 0.012) {
          const mk = new THREE.Mesh(splatGeo, bmat(sp > 1.2 ? 'smear' : 'splat')); mk.rotation.set(-Math.PI / 2, 0, sp > 0.1 ? Math.atan2(h.x, h.z) + Math.PI : Math.random() * 6.28);
          const L = clamp(g.r * 4 * (1 + Math.min(1, sp * 0.15)), 0.03, 0.12);
          mk.position.set(g.m.position.x - (sp > 0.1 ? h.x / sp * L * 0.3 : 0), floor - g.r + 0.003 + Math.random() * 0.002, g.m.position.z - (sp > 0.1 ? h.z / sp * L * 0.3 : 0)); mk.scale.set(L * 0.6, L, 1);
          mk.receiveShadow = true; scene.add(mk); decals.push(mk); trimDecals();
          feedPool(g.m.position.x, floor - g.r, g.m.position.z, 0.2);
        }
      }
      if (g.v.y < -1.2) { g.v.y *= -g.bounce; g.v.x *= 0.45; g.v.z *= 0.45; g.w.multiplyScalar(0.4); }
      else { g.v.x *= Math.max(0, 1 - 9 * dt); g.v.z *= Math.max(0, 1 - 9 * dt); g.v.y = 0; g.w.multiplyScalar(Math.max(0, 1 - 9 * dt)); if (Math.hypot(g.v.x, g.v.z) < 0.05) g.rest = true; }
    }
  }
}
function brainSmears(p, fw, n) {
  const fy = floorAt(p.x, p.y, p.z), h = new V3(fw.x, 0, fw.z); if (h.lengthSq() < 1e-4) h.set(rnd(-1, 1), 0, rnd(-1, 1)); h.normalize();
  for (let i = 0; i < n; i++) {
    const L = rnd(0.3, 1.6), q = new V3(p.x, fy, p.z).addScaledVector(h, L).add(new V3(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25)));
    const mk = new THREE.Mesh(splatGeo, bmat('brain')); mk.rotation.set(-Math.PI / 2, 0, Math.atan2(h.x, h.z) + Math.PI + rnd(-0.4, 0.4));
    const sz = rnd(0.04, 0.09); mk.position.set(q.x, fy + 0.0035 + Math.random() * 0.002, q.z); mk.scale.set(sz * 0.6, sz, 1);
    mk.receiveShadow = true; scene.add(mk); decals.push(mk);
  }
  trimDecals();
}
function clearGore() { for (const g of gore) scene.remove(g.m); gore.length = 0; }
// ---------------------------------------------------------------- what a blast throws out, by body part
// head: the skull comes apart in plates, brain and scalp go with it; torso: muscle, rib splinters, gut or lung; limb: muscle and bone
function goreBlast(part, p, dir, k, skin) {
  dir = dir.clone().normalize(); k = k === undefined ? 1 : k;
  // the head is thin and comes apart forward; a torso swallows the load, so tissue blows back out of the entry; a limb both ways
  const fw = dir.clone().add(new V3(0, 0.25, 0)).normalize(), bk = dir.clone().negate().add(new V3(0, 0.45, 0)).normalize();
  if (part === 'head') {
    spawnGore(p, fw, 'skull', Math.round(7 + 5 * k), rnd(2.2, 4), 0.5, 0.05, skin);
    spawnGore(p, fw, 'brain', 3 + Math.round(2 * k * Math.random()), rnd(1.8, 3.2), 0.5, 0.024);
    // most brain at a wound is paste, not lumps: grey-pink smears on the floor along the way it went
    brainSmears(p, fw, 3 + Math.floor(Math.random() * 3));
    spawnGore(p, fw, 'flesh', Math.round(5 + 4 * k), rnd(1.6, 3.2), 0.55, 0.022);
    spawnGore(p, fw, 'bone', 4, rnd(2, 4), 0.55, 0.014);
    spawnGore(p, bk, 'flesh', 3, rnd(0.8, 1.6), 0.5, 0.016);
  } else if (part === 'chest' || part === 'abdomen' || part === 'pelvis') {
    spawnGore(p, bk, 'flesh', Math.round(5 + 5 * k), rnd(0.9, 2), 0.55, 0.024);
    if (part === 'chest') { spawnGore(p, bk, 'bone', Math.round(2 + 3 * k), rnd(1, 2.2), 0.5, 0.016); spawnGore(p, bk, 'lung', Math.round(1 + 2 * k), rnd(0.6, 1.4), 0.5, 0.032); }
    else { spawnGore(p, bk, 'gut', Math.round(2 + 3 * k), rnd(0.5, 1.3), 0.45, 0.034); spawnGore(p, bk, 'liver', Math.round(1 + k), rnd(0.5, 1.2), 0.45, 0.03); }
    spawnGore(p, fw, 'flesh', Math.round(2 * k), rnd(1.5, 3), 0.5, 0.02);
  } else {
    spawnGore(p, fw, 'flesh', Math.round(3 + 4 * k), rnd(1.5, 3), 0.55, 0.022);
    spawnGore(p, bk, 'flesh', Math.round(2 + 2 * k), rnd(0.8, 1.8), 0.5, 0.02);
    spawnGore(p, fw, 'bone', Math.round(2 + 3 * k), rnd(1.5, 3), 0.55, 0.016);
  }
  // a wet cloud and a heavy spray of drops with it
  for (let i = 0; i < 4; i++) mist(p.clone().addScaledVector(dir, 0.04 + i * 0.07), dir.clone().multiplyScalar(rnd(1.5, 4)).add(new V3(rnd(-0.5, 0.5), rnd(-0.2, 0.5), rnd(-0.5, 0.5))), 0.4 + i * 0.12 * k, 0.7, 0x5a0307, 0.5 - i * 0.07);
  for (let i = 0; i < Math.round(22 * k + 10); i++) spawnDrop(p, coneDir(dir, 0.7).multiplyScalar(rnd(3, 8)), spatR() * 1.4, 1, undefined, 0.3);
}
