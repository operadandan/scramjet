// ---------------------------------------------------------------- holes in walls: decals with a clear middle
const PIERCE_TEX = {
  concrete: decalCanvas2((g, s, c) => { irregular(g, c, c, s * 0.46, 22, 0.35, 'rgba(120,116,108,0.55)'); irregular(g, c, c, s * 0.34, 18, 0.4, 'rgba(80,77,71,0.9)'); irregular(g, c, c, s * 0.22, 14, 0.3, 'rgba(40,38,35,1)'); for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, d = rnd(0.24, 0.47) * s; g.fillStyle = 'rgba(' + (60 + Math.random() * 60 | 0) + ',' + (58 + Math.random() * 55 | 0) + ',52,0.8)'; g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, rnd(2, 6), rnd(2, 6)); } }),
  wood: decalCanvas2((g, s, c) => { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, L = rnd(0.3, 0.48) * s; g.strokeStyle = 'rgba(' + (190 + Math.random() * 40 | 0) + ',' + (150 + Math.random() * 30 | 0) + ',100,0.95)'; g.lineWidth = rnd(2, 5); g.beginPath(); g.moveTo(c + Math.cos(a) * s * 0.18, c + Math.sin(a) * s * 0.18); g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L); g.stroke(); } irregular(g, c, c, s * 0.25, 14, 0.3, 'rgba(70,45,22,1)'); }),
  metal: decalCanvas2((g, s, c) => { irregular(g, c, c, s * 0.42, 18, 0.1, 'rgba(60,60,62,0.6)'); g.strokeStyle = 'rgba(210,210,215,1)'; g.lineWidth = s * 0.06; g.beginPath(); g.arc(c, c, s * 0.27, 0, 7); g.stroke(); }),
  dirt: decalCanvas2((g, s, c) => { irregular(g, c, c, s * 0.42, 16, 0.4, 'rgba(50,40,28,0.8)'); })
};
function decalCanvas2(draw) {
  const t = canvasTex((g, s) => { g.clearRect(0, 0, s, s); const c = s / 2; draw(g, s, c); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(c, c, s * 0.175, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }, 256, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
const PIERCE_MAT = {}; for (const k in PIERCE_TEX) PIERCE_MAT[k] = new THREE.MeshStandardMaterial({ map: PIERCE_TEX[k], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9 });
// ---------------------------------------------------------------- support hand on a vertical grip (mirrored firing-hand build)
function buildVfgHand(W, under, elbow) {
  const vg = new THREE.Group(); vg.scale.x = -1; W.g.add(vg);
  buildGripHand(vg, [0, under[1] - 0.05, under[2] + 0.002], 0.06, [-elbow.x, elbow.y, elbow.z], { w: 0.0125, wrap: true });
  vg.visible = false; return vg;
}
function trimDecals() { while (decals.length > 220) { const d = decals.shift(); scene.remove(d); if (d.geometry !== splatGeo && d.geometry !== poolGeo) d.geometry.dispose(); const i = floorSplats.indexOf(d); if (i >= 0) floorSplats.splice(i, 1); } }
function spawnDrop(p, v, r, g, drag, ml) { if (drops.length >= BLOOD_MAX) drops.shift(); drops.push({ p: p.clone(), v, r, life: 5, g: g === undefined ? 1 : g, drag: drag === undefined ? 0.6 : drag, ml }); }
// ---------------------------------------------------------------- drop splats
// Every drop that lands leaves its own mark. 64 different splats are painted once into one atlas at load (each its own blob
// outline, crown of satellite droplets, wet sheen, thickness and colour), and every mark picks one, turned, scaled,
// stretched along the way it was flying and tinted a little differently: all of them in one instanced draw call.
const SPLAT_N = 2400, SPLAT_T = 8, SPLAT_ATLAS = (() => {
  const S = 2048, T = S / SPLAT_T, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  for (let ti = 0; ti < SPLAT_T * SPLAT_T; ti++) {
    const ox = (ti % SPLAT_T) * T, oy = Math.floor(ti / SPLAT_T) * T, c = T / 2, R = T * rnd(0.16, 0.24);
    g.save(); g.beginPath(); g.rect(ox, oy, T, T); g.clip(); g.translate(ox, oy);
    const dark = rnd(0.75, 1.15), col = (k, a) => 'rgba(' + Math.round(clamp(104 * k * dark, 0, 255)) + ',' + Math.round(clamp(6 * k, 0, 255)) + ',' + Math.round(clamp(12 * k, 0, 255)) + ',' + a + ')';
    // the main blob: a wobbly outline (a few harmonics with their own phases)
    const H = [rnd(0, 0.18), rnd(0, 0.12), rnd(0, 0.08), rnd(0, 0.05)], Ph = H.map(() => rnd(0, 6.28)), F = [2, 3, 5, 9].map(f => f + Math.floor(rnd(0, 2)));
    const blob = (r, cx, cy) => { g.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283; let k = 1; for (let h = 0; h < 4; h++) k += H[h] * Math.sin(F[h] * a + Ph[h]); const x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a) * r * k; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    const tail = rnd(0, 1) < 0.55 ? rnd(0.4, 1.4) : 0, ta = rnd(-0.3, 0.3);
    blob(R, c, c); g.fillStyle = col(1, 0.95); g.fill();
    // thicker middle, thin drying rim
    const gr = g.createRadialGradient(c, c, R * 0.1, c, c, R * 1.15); gr.addColorStop(0, col(0.7, 0.9)); gr.addColorStop(0.7, col(0.95, 0.0)); gr.addColorStop(0.92, col(1.25, 0.35)); gr.addColorStop(1, col(1.25, 0));
    blob(R, c, c); g.fillStyle = gr; g.fill();
    // fingers and a tail flung out the way it was going (+x in the tile)
    const nf = Math.floor(rnd(2, 9));
    for (let i = 0; i < nf; i++) { const a = (tail ? ta : 0) + rnd(-1, 1) * (tail ? 0.9 : 3.14), L = R * rnd(0.3, 1.0) * (tail ? 1.6 : 1), w = R * rnd(0.08, 0.22); g.beginPath(); g.moveTo(c + Math.cos(a + 1.57) * w, c + Math.sin(a + 1.57) * w); g.lineTo(c + Math.cos(a) * (R + L), c + Math.sin(a) * (R + L)); g.lineTo(c + Math.cos(a - 1.57) * w, c + Math.sin(a - 1.57) * w); g.fillStyle = col(1, 0.9); g.fill(); g.beginPath(); g.arc(c + Math.cos(a) * (R + L), c + Math.sin(a) * (R + L), w * rnd(0.5, 1.1), 0, 6.283); g.fill(); }
    if (tail) { g.beginPath(); g.ellipse(c + R * tail * 0.9, c + R * ta, R * (0.5 + tail * 0.6), R * rnd(0.25, 0.45), ta, 0, 6.283); g.fillStyle = col(1, 0.9); g.fill(); }
    // satellite droplets, more and further out on the side it was going
    const ns = Math.floor(rnd(3, 26));
    for (let i = 0; i < ns; i++) { const a = (tail && Math.random() < 0.7 ? ta + rnd(-0.6, 0.6) : rnd(0, 6.283)), d = R * rnd(1.15, tail ? 2.6 : 2.0), r = R * rnd(0.03, 0.14) * (1.6 - d / (R * 2.6)); g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, r * rnd(1, 1.8), r, a, 0, 6.283); g.fillStyle = col(rnd(0.9, 1.15), rnd(0.75, 0.95)); g.fill(); }
    // a glint of wet on top
    g.beginPath(); g.ellipse(c - R * rnd(0.1, 0.35), c - R * rnd(0.1, 0.35), R * rnd(0.12, 0.3), R * rnd(0.06, 0.15), rnd(0, 3), 0, 6.283); g.fillStyle = 'rgba(190,60,60,' + rnd(0.08, 0.2) + ')'; g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
})();
const splatIM = (() => {
  const m = new THREE.MeshStandardMaterial({ map: SPLAT_ATLAS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 0.22, metalness: 0.05, envMapIntensity: 0.6 });
  const geo = new THREE.PlaneGeometry(1, 1), tile = new THREE.InstancedBufferAttribute(new Float32Array(SPLAT_N * 2), 2); geo.setAttribute('tile', tile);
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 tile;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * ' + (1 / SPLAT_T).toFixed(4) + ' + tile;'); };
  m.customProgramCacheKey = () => 'splatAtlas';
  const im = new THREE.InstancedMesh(geo, m, SPLAT_N); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.userData.keep = true; im.userData.next = 0;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPLAT_N * 3), 3);
  scene.add(im); return im;
})();
const _sM = new THREE.Matrix4(), _sQ = new THREE.Quaternion(), _sQ2 = new THREE.Quaternion(), _sS = new V3(), _sP = new V3(), _sN = new V3(), _sC = new THREE.Color();
// p: where it hit, n: the surface's normal, r: the drop's radius, v: its velocity when it hit
function dropSplat(p, n, r, v) {
  const im = splatIM, i = im.userData.next; im.userData.next = (i + 1) % Math.max(50, Math.round(SPLAT_N * GFX.splats)); im.count = Math.max(im.count, i + 1);
  _sN.copy(n).normalize(); _sQ.setFromUnitVectors(_Z, _sN);
  // along the surface, the way it was going: the tile's +x (its tail) points that way, and it smears longer the faster it hit
  const vt = _sP.copy(v).addScaledVector(_sN, -v.dot(_sN)), sp = vt.length(), vn = Math.abs(v.dot(_sN));
  let ang = rnd(0, 6.283);
  if (sp > 0.3) { const lx = vt.clone().applyQuaternion(_sQ2.copy(_sQ).invert()); ang = Math.atan2(lx.y, lx.x); }
  _sQ.multiply(_sQ2.setFromAxisAngle(_Z, ang));
  const base = r * rnd(9, 14) * (0.8 + Math.min(1.2, vn * 0.12)), str = 1 + Math.min(2.2, sp * 0.22);
  _sS.set(base * str, base, 1);
  im.setMatrixAt(i, _sM.compose(_sP.copy(p).addScaledVector(_sN, 0.0015 + Math.random() * 0.002), _sQ, _sS));
  const ti = Math.floor(Math.random() * SPLAT_T * SPLAT_T); im.geometry.attributes.tile.setXY(i, (ti % SPLAT_T) / SPLAT_T, 1 - (Math.floor(ti / SPLAT_T) + 1) / SPLAT_T);
  const k = rnd(0.82, 1.12); im.setColorAt(i, _sC.setRGB(k, k * rnd(0.85, 1.1), k * rnd(0.85, 1.1)));
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.geometry.attributes.tile.needsUpdate = true;
}
const _sUp = new V3(0, 1, 0);
// ---------------------------------------------------------------- blood pools: what lands on the floor collects; scattered drops alone never show
const pools = [], seeds = [];
const dropMl = r => 0.5 * Math.pow(r / 0.01, 3);
function floorAt(x, y, z) { let f = 0; for (const c of colliders) if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z && c.max.y <= y + 0.05 && c.max.y > f) f = c.max.y; return f; }
function feedPool(x, y, z, ml) {
  let best = null, bd = 1e9;
  for (const p of pools) { if (Math.abs(p.y - y) > 0.03) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < p.r * 0.9 + 0.07 && d < bd) { bd = d; best = p; } }
  if (best) { best.vol = Math.min(4000, best.vol + ml); const k = Math.min(0.5, ml / best.vol); best.x += (x - best.x) * k * 0.4; best.z += (z - best.z) * k * 0.4; return; }
  let sd = null; for (const q of seeds) if (Math.abs(q.y - y) < 0.03 && Math.hypot(q.x - x, q.z - z) < 0.1) { sd = q; break; }
  if (!sd) { sd = { x, y, z, vol: 0 }; seeds.push(sd); if (seeds.length > 300) seeds.shift(); }
  sd.vol += ml; sd.x += (x - sd.x) * 0.2; sd.z += (z - sd.z) * 0.2;
  if (sd.vol >= 6) { seeds.splice(seeds.indexOf(sd), 1); makePool(sd.x, sd.y, sd.z, sd.vol); }
}
function makePool(x, y, z, vol) {
  const m = new THREE.Mesh(splatGeo, pick(POOL_MAT)); m.rotation.set(-Math.PI / 2, 0, rnd(0, 6.28)); m.userData.aspect = rnd(0.7, 1.3); m.position.set(x, y + 0.002 + pools.length % 7 * 0.0002, z); m.scale.setScalar(0.001); m.receiveShadow = true; scene.add(m);
  pools.push({ m, x, y, z, vol, r: 0.02, e: rnd(0.8, 1.25) });
  if (pools.length > 60) { const o = pools.shift(); scene.remove(o.m); }
}
function updatePools(dt) {
  for (const p of pools) {
    // ~2.5 mm deep on a flat floor: 1 ml covers 4 cm^2. Spreads quickly at first, then slows as it thins out
    const R = Math.sqrt(p.vol * 0.0004 / Math.PI);
    if (p.r < R) p.r = Math.min(R, p.r + Math.max(0.015, (R - p.r) * 2) * dt);
    const w = 2 * p.r / 0.72; p.m.scale.set(w * p.e, w / p.e, 1); p.m.position.x = p.x; p.m.position.z = p.z;
  }
}
function clearPools() { for (const p of pools) scene.remove(p.m); pools.length = 0; seeds.length = 0; }
// a burst of droplets thrown along dir (exit spray, arterial spurt), plus a fine mist
function bloodBurst(point, dir, speed, n, spread, size) {
  for (let i = 0; i < n; i++) {
    const v = dir.clone().multiplyScalar(speed * rnd(0.55, 1.1)).add(new V3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).multiplyScalar(spread));
    spawnDrop(point, v, (size || 0.012) * rnd(0.6, 1.3));
  }
}
// one big directional spray decal where the exit spray lands: on a wall or prop within reach, otherwise on the floor ahead
const sprayRay = new THREE.Raycaster();
function sprayDecal(point, dir, size) {
  sprayRay.set(point, dir); sprayRay.far = 3.5;
  let h = sprayRay.intersectObjects(worldMeshes, false)[0];
  if (!h) { sprayRay.set(point, _a.copy(dir).add(new V3(0, -0.2, 0)).normalize()); sprayRay.far = 2.6; h = sprayRay.intersectObjects(worldMeshes, false)[0]; }
  let p, n;
  if (h && h.face) { n = h.face.normal.clone().transformDirection(h.object.matrixWorld); p = h.point; size *= 0.8 + Math.max(0, 2.6 - h.distance) * 0.25; }
  else { n = new V3(0, 1, 0); p = new V3(point.x, 0, point.z).addScaledVector(new V3(dir.x, 0, dir.z).normalize(), rnd(0.5, 1.4)); }
  const t = dir.clone().addScaledVector(n, -dir.dot(n)); if (t.lengthSq() < 1e-4) t.set(1, 0, 0).addScaledVector(n, -n.x); t.normalize();
  const mt = bmat('spray'), m = new THREE.Mesh(splatGeo, h && h.face ? wallClipMat(mt, h.object, -1) : mt); m.quaternion.setFromUnitVectors(_Z, n);
  const vl = t.clone().applyQuaternion(m.quaternion.clone().invert()); m.rotateZ(-Math.atan2(vl.x, vl.y));
  m.position.copy(p).addScaledVector(t, size * 0.38).addScaledVector(n, 0.004 + Math.random() * 0.002); m.scale.setScalar(size);
  m.receiveShadow = true; scene.add(m); decals.push(m); trimDecals();
}
// a fine red mist that moves with the spray and hangs for a moment
function mist(p, v, size, life, col, op) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: col, transparent: true, depthWrite: false, opacity: op * 1.2 })); sp.material.rotation = Math.random() * 6.28;
  sp.position.copy(p); sp.scale.setScalar(size * 0.3); scene.add(sp);
  life *= 0.6; fx.push({ o: sp, life, max: life, fade: op, grow: size, rise: -0.05, dispose: true, sprite: true, sv: v });
}
// head shot / head burst: the wall behind gets a high-velocity spatter, cut away wherever that wall later gets shot open
function wallSpatter(point, dir, size, goreK) {
  sprayRay.set(point, dir); sprayRay.far = 4.5;
  const h = sprayRay.intersectObjects(worldMeshes, false)[0];
  if (!h || !h.face) return false;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
  const m = new THREE.Mesh(splatGeo, wallClipMat(bmat(goreK ? 'gore' : 'spatter'), h.object, -1)); m.quaternion.setFromUnitVectors(_Z, n); m.rotateZ(Math.random() * 6.28);
  // the further it flew, the wider and thinner it spreads; at a slant it stretches along the wall
  const k = size * (0.7 + h.distance * 0.35), slant = 1 / Math.max(0.35, Math.abs(n.dot(dir)));
  const t = dir.clone().addScaledVector(n, -dir.dot(n)); if (t.lengthSq() > 1e-4) { t.normalize(); const vl = t.applyQuaternion(m.quaternion.clone().invert()); m.rotation.set(m.rotation.x, m.rotation.y, 0); m.quaternion.setFromUnitVectors(_Z, n); m.rotateZ(-Math.atan2(vl.x, vl.y)); }
  m.scale.set(k, k * Math.min(2.2, slant), 1); m.position.copy(h.point).addScaledVector(n, 0.004 + Math.random() * 0.002);
  m.receiveShadow = true; scene.add(m); decals.push(m); trimDecals();
  return true;
}
// a head coming apart: skull pieces, brain, flesh, mist, and the spatter behind it
function goreBurst(p, dir, skin) {
  goreBlast('head', p, dir, 1, skin);
  blowSpatter(p, dir, rnd(0.9, 1.25), true);
  noiseHit(250, 0.3, 0.14);
}
// entry: a puff of back-spatter mist. exit (strong): a cone of mist and heavy droplets thrown forward, painting what is behind
function bloodFx(point, dir, strong, amt) {
  amt = amt === undefined ? 1 : amt;
  mist(point.clone().addScaledVector(dir, -0.02), dir.clone().multiplyScalar(-rnd(0.4, 0.9)), 0.22, 0.35, 0x8a0a0e, 0.55);
  for (let i = 0; i < Math.round(3 * amt); i++) spawnDrop(point, dir.clone().multiplyScalar(-rnd(0.6, 1.6)).add(new V3(rnd(-0.4, 0.4), rnd(-0.1, 0.5), rnd(-0.4, 0.4))), rnd(0.003, 0.006));
  if (!strong) return;
  for (let i = 0; i < 4; i++) mist(point.clone().addScaledVector(dir, 0.05 + i * 0.07), dir.clone().multiplyScalar(rnd(1.5, 4)).add(new V3(rnd(-0.4, 0.4), rnd(-0.2, 0.3), rnd(-0.4, 0.4))), 0.35 + i * 0.12, 0.7, 0x6a0408, 0.5 - i * 0.07);
  for (let i = 0; i < 16; i++) spawnDrop(point, dir.clone().multiplyScalar(rnd(3, 7.5)).add(new V3(rnd(-1, 1), rnd(-0.5, 0.8), rnd(-1, 1)).multiplyScalar(0.9)), rnd(0.004, 0.011), 1, 0.3);
  blowSpatter(point, dir, rnd(0.6, 0.95));
}
function floorSplat(x, y, z, size) { feedPool(x, y, z, size * 6); }
function floorSplatOld(x, y, z, size) {
  // droplets landing near an existing splat feed it instead: blood pools
  for (let i = floorSplats.length - 1; i >= Math.max(0, floorSplats.length - 60); i--) {
    const f = floorSplats[i], dx = f.position.x - x, dz = f.position.z - z;
    if (Math.abs(f.position.y - y) < 0.02 && dx * dx + dz * dz < f.scale.x * f.scale.x * 0.3) {
      f.userData.grow = Math.min(1.6, (f.userData.grow || f.scale.x) + size * 0.3);
      if (f.userData.grow > 0.5 && f.material !== BLOOD_MAT.pool) f.material = BLOOD_MAT.pool;
      return;
    }
  }
  const m = new THREE.Mesh(splatGeo, BLOOD_MAT.splat); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6); m.position.set(x, y + 0.003 + Math.random() * 0.002, z); m.scale.setScalar(size * 0.5); m.userData.grow = size;
  m.receiveShadow = true; scene.add(m); decals.push(m); floorSplats.push(m); trimDecals();
}
function groundSplat(p, size) { floorSplat(p.x, 0, p.z, size); }
const _wn = new V3(), _wq = new THREE.Quaternion(), _Z = new V3(0, 0, 1);
function wallSplat(p, n, size, vdir, bottom) {
  const cast = Math.random() < 0.45, m = new THREE.Mesh(splatGeo, bmat(cast ? 'cast' : 'splat'));
  m.position.copy(p).addScaledVector(n, 0.004 + Math.random() * 0.003); m.quaternion.setFromUnitVectors(_Z, n);
  if (cast && vdir) { const vl = vdir.clone().applyQuaternion(m.quaternion.clone().invert()); m.rotateZ(-Math.atan2(vl.x, vl.y)); } else m.rotateZ(Math.random() * 6); m.scale.setScalar(size); scene.add(m); decals.push(m);
  // the heavier splats run: a streak creeps down the wall and feeds a puddle at the bottom
  if (size > 0.1 && p.y - bottom > 0.12) {
    const k = Math.random() < 0.5 ? 2 : 1;
    for (let i = 0; i < k; i++) {
      const d = new THREE.Mesh(splatGeo, bmat('drip')), w = rnd(0.012, 0.024), ox = rnd(-0.3, 0.3) * size;
      const tan = new V3(-n.z, 0, n.x);
      d.position.copy(p).addScaledVector(tan, ox).addScaledVector(n, 0.006); d.position.y -= size * 0.1; d.quaternion.setFromUnitVectors(_Z, n);
      d.scale.set(w, 0.001, 1); scene.add(d); decals.push(d);
      drips.push({ m: d, top: d.position.y, len: 0, max: Math.min(p.y - bottom - size * 0.1, rnd(0.25, 1.4)), sp: rnd(0.12, 0.4), floor: bottom, pooled: false });
    }
  }
  trimDecals();
}
const _dm = new THREE.Object3D();
function updateBlood(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.life -= dt; d.v.y -= 9.8 * d.g * dt; d.v.multiplyScalar(1 - d.drag * dt);
    const px = d.p.x, py = d.p.y, pz = d.p.z; d.p.addScaledVector(d.v, dt);
    let hit = d.life <= 0;
    if (d.p.y <= 0.004) { dropSplat(_sP.set(d.p.x, 0, d.p.z).clone(), _sUp, d.r, d.v); feedPool(d.p.x, 0, d.p.z, d.ml || dropMl(d.r)); hit = true; }
    else for (const c of colliders) {
      if (d.p.x > c.min.x && d.p.x < c.max.x && d.p.y > c.min.y && d.p.y < c.max.y && d.p.z > c.min.z && d.p.z < c.max.z && !(c.mesh && gridOpenW(c.mesh, d.p))) {
        // which face did it come through? the one the previous position was outside of
        if (py >= c.max.y) { dropSplat(new V3(d.p.x, c.max.y, d.p.z), _sUp, d.r, d.v); feedPool(d.p.x, c.max.y, d.p.z, d.ml || dropMl(d.r)); }
        else {
          _wn.set(0, 0, 0);
          if (px <= c.min.x) _wn.x = -1; else if (px >= c.max.x) _wn.x = 1; else if (pz <= c.min.z) _wn.z = -1; else if (pz >= c.max.z) _wn.z = 1;
          if (_wn.lengthSq() > 0) {
            if (_wn.x) d.p.x = _wn.x < 0 ? c.min.x : c.max.x; else d.p.z = _wn.z < 0 ? c.min.z : c.max.z;
            dropSplat(d.p.clone(), _wn, d.r * 0.85, d.v);
          }
        }
        hit = true; break;
      }
    }
    if (hit) drops.splice(i, 1);
  }
  const n = Math.min(drops.length, BLOOD_MAX); dropIM.count = n;
  for (let i = 0; i < n; i++) {
    const d = drops[i], sp = d.v.length();
    _dm.position.copy(d.p); _dm.lookAt(_a.copy(d.p).add(d.v)); _dm.scale.set(d.r, d.r, d.r * (1 + Math.min(3, sp * 0.25))); _dm.updateMatrix(); dropIM.setMatrixAt(i, _dm.matrix);
  }
  dropIM.instanceMatrix.needsUpdate = true;
  for (let i = drips.length - 1; i >= 0; i--) {
    const r = drips[i]; if (!r.m.parent) { drips.splice(i, 1); continue; }
    r.len = Math.min(r.max, r.len + r.sp * dt * (1 - 0.6 * r.len / r.max)); r.m.scale.y = r.len; r.m.position.y = r.top - r.len / 2;
    if (r.len >= r.max - 0.01) { if (!r.pooled && r.top - r.max - r.floor < 0.03) { r.pooled = true; floorSplat(r.m.position.x + r.m.getWorldDirection(_wn).x * 0.03, r.floor, r.m.position.z + _wn.z * 0.03, 0.14); } drips.splice(i, 1); }
  }
  for (const f of floorSplats) if (f.userData.grow > f.scale.x) f.scale.setScalar(Math.min(f.userData.grow, f.scale.x + dt * (0.25 + f.userData.grow * 0.3)));
}
// ---------------------------------------------------------------- clipping a body segment where a limb was cut
// y: the cut height in the group's own coordinates (limbs run down -y). keepBelow false = keep the part attached to the body.
function clipGroup(g, y, keepBelow) {
  for (const c of g.children) {
    if (!c.isMesh || c.userData.keep || c.userData.tube) continue;
    if (y === null) { if (c.material.userData && c.material.userData.hCut) c.material.userData.hCut.value.set(0, 0, 0, 1e9); continue; }
    if (c.userData.organ || c.userData.inner) c.visible = true;
    holeify(c, c.userData.holeMax || 20, c.userData.hIn || (c.userData.armor === 'pack' ? FABRIC_IN : FLESH_IN));
    c.updateMatrix(); const inv = _hm.copy(c.matrix).invert();
    const pl = new V3(0, y, 0).applyMatrix4(inv), nl = new V3(0, keepBelow ? 1 : -1, 0).transformDirection(inv);
    c.material.userData.hCut.value.set(nl.x, nl.y, nl.z, pl.dot(nl));
  }
}
// a free copy of one segment (fresh materials, same holes), for the piece that comes away
function copySegment(g) {
  const n = new THREE.Group(); g.updateMatrixWorld(true); g.matrixWorld.decompose(n.position, n.quaternion, n.scale);
  for (const c of g.children) {
    if (!c.isMesh || c.userData.keep || c.userData.tube) continue;
    const m = new THREE.Mesh(c.geometry, c.userData.baseMat || c.material); m.position.copy(c.position); m.quaternion.copy(c.quaternion); m.scale.copy(c.scale); m.castShadow = true; n.add(m);
    // a piece on its own has nothing to bend with: its skin stays as cut
    if (c._skin) { const U = { segM: { value: Array.from({ length: 16 }, () => new THREE.Matrix4()) }, segOK: { value: new Array(16).fill(0) } }; m._skin = { U, at: {} }; const mm = m.material.clone(); if (m.geometry.attributes.fab) mm.side = THREE.DoubleSide; mm.onBeforeCompile = sh => bodyPatches(sh, m); mm.customProgramCacheKey = () => 'body' + bodyKey(m); m.material = mm; }
    if (c.userData.holeN !== undefined) { holeify(m, c.userData.holeMax, c.material.userData.hIn.value.getHex()); m.userData.holeN = c.userData.holeN; const a = c.material.userData, b = m.material.userData; for (let i = 0; i < a.hA.value.length; i++) { b.hA.value[i].copy(a.hA.value[i]); b.hB.value[i].copy(a.hB.value[i]); } }
  }
  return n;
}
// ---------------------------------------------------------------- see-through holes (bodies and walls), bone stumps
// A hole is a short cone along the bullet's path (start point, direction x length, radius at each end), cut out of a mesh in its shader.
// The mesh is drawn double-sided and its inside faces are coloured as the interior (flesh, concrete, wood), so a hole that stops
// inside shows a dark wound channel, and a hole that goes all the way through is open on both sides.
// the ragged edge of a hole: radius multiplier around the hole axis, seeded by the hole's slot so the tube builder can match it
const HOLE_JAG = 'float holeJag(int i, vec3 hp, vec3 ax) { vec3 hax = normalize(ax), e1 = normalize(cross(hax, abs(hax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), e2 = cross(hax, e1); float a = atan(dot(hp, e2), dot(hp, e1)), s = float(i) * 2.399 + 0.7; ' +
  'return 0.86 + 0.08 * sin(3.0 * a + s) + 0.06 * sin(5.0 * a + 2.1 * s) + 0.045 * sin(9.0 * a + 3.7 * s) + 0.03 * sin(16.0 * a + 5.3 * s) + 0.02 * sin(27.0 * a + 7.0 * s); }\n';
const holeJagJs = (i, a) => { const s = i * 2.399 + 0.7; return 0.86 + 0.08 * Math.sin(3 * a + s) + 0.06 * Math.sin(5 * a + 2.1 * s) + 0.045 * Math.sin(9 * a + 3.7 * s) + 0.03 * Math.sin(16 * a + 5.3 * s) + 0.02 * Math.sin(27 * a + 7 * s); };
// a solid-looking channel for a hole: the ragged tube between t0 and t1 along the cone, optional cap at t1 (craters)
function holeTube(slot, p, d, len, r0, r1, t0, t1, cap, colA, colB) {
  const ax = d.clone().normalize(), e1 = new V3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize(), e2 = new V3().crossVectors(ax, e1);
  const N = 40, R = 3, pos = [], col = [], idx = [], cA = new THREE.Color(colA), cB = new THREE.Color(colB || colA);
  for (let j = 0; j <= R; j++) {
    const t = lerp(t0, t1, j / R), c = p.clone().addScaledVector(d, len * t), r = lerp(r0, r1, t), cc = cA.clone().lerp(cB, j / R);
    for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2 - Math.PI, rr = r * holeJagJs(slot, a) * 1.002; const q = c.clone().addScaledVector(e1, Math.cos(a) * rr).addScaledVector(e2, Math.sin(a) * rr); pos.push(q.x, q.y, q.z); col.push(cc.r, cc.g, cc.b); }
  }
  for (let j = 0; j < R; j++) for (let k = 0; k < N; k++) { const a = j * N + k, b = j * N + (k + 1) % N, c2 = a + N, d2 = b + N; idx.push(a, b, c2, b, d2, c2); }
  if (cap) { const c = p.clone().addScaledVector(d, len * t1), ci = pos.length / 3; pos.push(c.x, c.y, c.z); col.push(cB.r * 0.7, cB.g * 0.7, cB.b * 0.7); for (let k = 0; k < N; k++) idx.push(ci, R * N + (k + 1) % N, R * N + k); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the wall of a hole as N straight lines along the cone, each clipped to the skin where it enters and leaves the segment
const _stR = new THREE.Raycaster(), _stM = new THREE.Matrix4();
function solidTube(group, skin, slot, p, d, len, r0, r1, t0, t1, stop) {
  group.updateMatrixWorld(true); const mw = group.matrixWorld, sc = mw.getMaxScaleOnAxis();
  const ax = d.clone().normalize(), e1 = new V3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize(), e2 = new V3().crossVectors(ax, e1);
  const N = 32, R = 4, A = [], B = [], ends = [];
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2 - Math.PI, j = holeJagJs(slot, a) * 0.995, o = e1.clone().multiplyScalar(Math.cos(a) * j).addScaledVector(e2, Math.sin(a) * j);
    const pa = p.clone().addScaledVector(o, r0), pb = p.clone().addScaledVector(d, len).addScaledVector(o, r1);   // the line at t=0 and t=1
    const wa = pa.clone().applyMatrix4(mw), wb = pb.clone().applyMatrix4(mw), wl = wb.clone().sub(wa), L = wl.length(); wl.multiplyScalar(1 / L);
    // forward from well before the start: first skin crossing; backward from well past the end: last crossing
    let ta = t0, tb = t1, hitEnd = false;
    _stR.set(wa.clone().addScaledVector(wl, -0.5 * L), wl); _stR.far = L * 2;
    const h0 = _stR.intersectObjects(skin, false)[0]; if (h0) ta = Math.max(t0, h0.distance / L - 0.5); else { A.push(pa); B.push(pb); ends.push([t0, t0, false]); continue; }   // misses the body: no wall
    _stR.set(wb.clone().addScaledVector(wl, 0.5 * L), wl.clone().negate()); _stR.far = L * 2;
    const h1 = _stR.intersectObjects(skin, false)[0]; if (h1) { const te = 1.5 - h1.distance / L; if (te < tb) { tb = te; hitEnd = true; } }
    if (tb < ta) tb = ta;
    A.push(pa); B.push(pb); ends.push([ta, tb, hitEnd]);
  }
  const pos = [], col = [], idx = [], cA = new THREE.Color(0x9c2a2a), cB = new THREE.Color(0x3a0204);
  for (let j = 0; j <= R; j++) for (let k = 0; k < N; k++) {
    const [ta, tb] = ends[k], t = lerp(ta, tb, j / R), q = A[k].clone().lerp(B[k], t), cc = cA.clone().lerp(cB, j / R);
    pos.push(q.x, q.y, q.z); col.push(cc.r, cc.g, cc.b);
  }
  for (let j = 0; j < R; j++) for (let k = 0; k < N; k++) { const a = j * N + k, b = j * N + (k + 1) % N; idx.push(a, b, a + N, b, b + N, a + N); }
  // a round that stopped inside: the bottom of the track is closed over
  if (stop) { const ci = pos.length / 3; let cx = 0, cy = 0, cz = 0; for (let k = 0; k < N; k++) { const i = (R * N + k) * 3; cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; }
    pos.push(cx / N, cy / N, cz / N); col.push(cB.r * 0.7, cB.g * 0.7, cB.b * 0.7); for (let k = 0; k < N; k++) idx.push(ci, R * N + (k + 1) % N, R * N + k); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// wound track walls: the same cut-flesh look as the body's inside (muscle bundles, fascia, fat, tendon), darkened deeper down
// the track by the tube's vertex colour, wet
const TUBE_FLESH = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.25, side: THREE.DoubleSide });
TUBE_FLESH.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTubePos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTubePos = position;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTubePos;\n' + FLESH_CUT)
    .replace('#include <color_fragment>', '#include <color_fragment>\n{ float dk = clamp(dot(diffuseColor.rgb, vec3(0.6, 0.3, 0.1)) / 0.45, 0.25, 1.0); diffuseColor.rgb = fleshCut(vTubePos) * dk * 0.6; }')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.1;');
};
TUBE_FLESH.customProgramCacheKey = () => 'tubeflesh';
// what solid flesh looks like cut through: dark red muscle in bundles of fibres, pale fascia (the sheaths round each muscle),
// a streak of tendon here and there and yellow fat marbled through, all fixed to the body (object space) so it doesn't swim
const FLESH_CUT = `
float fcH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fcN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fcH(i), fcH(i + vec3(1,0,0)), f.x), mix(fcH(i + vec3(0,1,0)), fcH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fcH(i + vec3(0,0,1)), fcH(i + vec3(1,0,1)), f.x), mix(fcH(i + vec3(0,1,1)), fcH(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 fleshCut(vec3 p) {
  vec3 q = p * 60.0;
  float bundle = fcN(q * vec3(0.6, 0.18, 0.6));                      // muscle bundles, long along the limb (y)
  float fib = fcN(q * vec3(5.0, 0.6, 5.0));                          // fibres inside them
  float sheath = smoothstep(0.47, 0.5, bundle) * (1.0 - smoothstep(0.5, 0.53, bundle));   // fascia between bundles
  float fat = smoothstep(0.66, 0.74, fcN(q * 0.45 + 7.0));
  float tendon = smoothstep(0.82, 0.86, fcN(q * vec3(1.6, 0.25, 1.6) + 3.0));
  vec3 muscle = mix(vec3(0.16, 0.008, 0.01), vec3(0.32, 0.025, 0.022), fib * 0.7 + bundle * 0.3);
  vec3 c = mix(muscle, vec3(0.42, 0.22, 0.17), sheath * 0.7);
  c = mix(c, vec3(0.55, 0.36, 0.12), fat * 0.55);
  c = mix(c, vec3(0.6, 0.52, 0.42), tendon * 0.6);
  return c;
}
`;
function holeify(mesh, max, inner) {
  if (mesh.userData.holeN !== undefined) return;
  mesh.userData.baseMat = mesh.material; const m = mesh.material.clone(); mesh.material = m; mesh.userData.holeN = 0; mesh.userData.holeMax = max;
  m.userData.hCut = { value: new THREE.Vector4(0, 0, 0, 1e9) };
  m.side = THREE.DoubleSide;
  m.userData.hA = { value: Array.from({ length: max }, () => new THREE.Vector4(0, 0, 0, 0)) };
  m.userData.hB = { value: Array.from({ length: max }, () => new THREE.Vector4(0, 1, 0, 0)) };
  m.userData.hIn = { value: new THREE.Color(inner) }; m.userData.hFl = { value: inner === FLESH_IN ? 1 : 0 };
  m.customProgramCacheKey = () => 'hole' + max + (mesh.userData.under ? 'u' : mesh.userData.inner || mesh.userData.organ ? 'i' : mesh.userData.tex ? 'g' : '') + (typeof bodyKey === 'function' ? bodyKey(mesh) : '');
  m.onBeforeCompile = sh => {
    bodyPatches(sh, mesh);
    sh.uniforms.hA = m.userData.hA; sh.uniforms.hB = m.userData.hB; sh.uniforms.hIn = m.userData.hIn; sh.uniforms.hFl = m.userData.hFl; sh.uniforms.hCut = m.userData.hCut;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHolePos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;\nuniform vec4 hA[' + max + '];\nuniform vec4 hB[' + max + '];\nuniform vec3 hIn;\nuniform float hFl;\nuniform vec4 hCut;\nfloat holeRim = 0.0;\nfloat holeNear = 0.0;\n' + HOLE_JAG + FLESH_CUT)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (dot(vHolePos, hCut.xyz) > hCut.w) discard;\n' +
        'for (int i = 0; i < ' + max + '; i++) { if (hA[i].w > 0.0) {\n' +
        '  vec3 hq = vHolePos - hA[i].xyz; float L2 = max(dot(hB[i].xyz, hB[i].xyz), 1e-8); float t = dot(hq, hB[i].xyz) / L2;\n' +
        '  if (t > -0.05 && t < 1.0) { vec3 hp = hq - hB[i].xyz * t; float ct = clamp(t, 0.0, 1.0);\n' +
        '    float rr = mix(hA[i].w, hB[i].w, ct) * holeJag(i, hp, hB[i].xyz);\n' +
        '    float dd = length(hp); if (dd < rr && t > 0.0' + (mesh.userData.tex ? ' && (t * sqrt(L2) < 0.09 || t * sqrt(L2) > sqrt(L2) - 0.09)' : '') + ') discard; holeRim = max(holeRim, 1.0 - smoothstep(rr, rr * 1.7, dd)); if (dd < rr * ' + (mesh.userData.under ? '2.5 + 0.03' : mesh.userData.tex ? '1.6 + 0.004' : '3.0 + 0.06') + ') holeNear = 1.0; } } }' +
        // the skin under the clothes, and the bones and organs inside, show only round a hole (seen through it), never
        // anywhere else: a shoulder blade or a rib near the surface must not poke out through the back of the shirt
        (mesh.userData.under || mesh.userData.inner || mesh.userData.organ ? '\nif (hCut.w < 1e8 && dot(vHolePos, hCut.xyz) > hCut.w - 0.08) holeNear = 1.0;\nif (holeNear < 0.5) discard;' : ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing' + (mesh.userData.tex ? ' && holeNear > 0.5' : '') + ') diffuseColor.rgb = hFl > 0.5 ? fleshCut(vHolePos) : hIn; else if (!gl_FrontFacing) {} else diffuseColor.rgb = mix(diffuseColor.rgb, hIn * 0.6, holeRim * 0.75);')
      // the inside never reads as an empty shell: it is lit as if it faced you, a little self-lit, so the far side of a body
      // seen through a hole looks like the cut face of solid meat rather than a dark cavity
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nif (!gl_FrontFacing) normal = normalize(vViewPosition);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (!gl_FrontFacing) totalEmissiveRadiance += diffuseColor.rgb * 0.15;');
  };
  m.customProgramCacheKey = () => 'holes' + max + bodyKey(mesh);
}
// cut a cone hole into one mesh. p, d in the mesh's own coordinates; d unit; len along d
function cutHole(mesh, p, d, len, r0, r1, inner) {
  holeify(mesh, mesh.userData.holeMax || 20, inner);
  // already inside a wider hole: nothing new to cut (and no slot used up, so older holes are not overwritten)
  for (const h of mesh.material.userData.hA.value) if (h.w >= r0 && _hp.set(h.x, h.y, h.z).distanceTo(p) < h.w * 0.7) return;
  const i = mesh.userData.holeN++ % mesh.material.userData.hA.value.length;
  mesh.material.userData.hA.value[i].set(p.x, p.y, p.z, r0); mesh.material.userData.hB.value[i].set(d.x * len, d.y * len, d.z * len, r1);
}
const FLESH_IN = 0x4a0306, FABRIC_IN = 0x22211b, _hm = new THREE.Matrix4(), _hp = new V3();
// a hole through every mesh of one body segment (segment-local coordinates)
const _tubeR = new THREE.Raycaster();
// blood drops sitting where a hole has since been cut away would hang in the air over it: drop them
function pruneLiquid(group) {
  group.updateMatrixWorld(true); const gone = [], w = new V3();
  const Z = new THREE.Matrix4().makeScale(0, 0, 0);
  group.traverse(o => {
    if (!o.userData.liqI) return; let ch = false;
    o.userData.liqI.forEach((e, i) => { if (!e.gone && e.on && inHole(e.on, w.copy(e.p).applyMatrix4(o.matrixWorld), 1.05, e.r * 0.9)) { e.gone = true; o.setMatrixAt(i, Z); ch = true; } });
    if (ch) o.instanceMatrix.needsUpdate = true;
  });
}
function holeInGroup(group, p, d, len, r0, r1, sk) {
  let slot = -1, slotF = false;
  for (const c of group.children) {
    if (!c.isMesh || c.userData.keep || c.userData.tube) continue;
    // organs and bones come into view with the hole, cut like the rest and drawn only round the opening
    if (c.userData.inner || c.userData.under || c.userData.organ) c.visible = true;
    c.updateMatrix(); _hm.copy(c.matrix).invert();
    const a = p.clone().applyMatrix4(_hm), dd = d.clone().transformDirection(_hm);
    if ((slot < 0 || c.userData.frame) && !c.userData.inner && !c.userData.under && !c.userData.organ && !(slot >= 0 && slotF)) { slotF = !!c.userData.frame; slot = (c.userData.holeN || 0) % (c.material.userData && c.material.userData.hA ? c.material.userData.hA.value.length : (c.userData.holeMax || 20)); }
    cutHole(c, a, dd, len, r0, r1, c.userData.inner ? c.userData.hIn : c.userData.armor === 'pack' ? FABRIC_IN : FLESH_IN);
  }
  pruneLiquid(group);
  // the channel through skin and muscle at each opening, so the wound has walls instead of a paper-thin edge
  if (slot >= 0 && sk) {
    // the whole wound track is walled with torn muscle (and closed off at the bottom when the round stopped inside), so looking
    // into a hole shows meat all the way down instead of the hollow inside of the body
    // the tube never leaves the body: its ends are clipped to where the track actually crosses this segment's skin (a track
    // running past the far side drew a red cylinder sticking out of the body)
    const skin = group.children.filter(c => c.isMesh && c.visible && !c.userData.keep && !c.userData.organ && !c.userData.tube && !c.userData.inner);
    // every line along the wall of the hole is clipped to the skin on its own: the wall starts exactly at the ragged edge cut
    // in the skin and ends where that line leaves the body (or at the bottom of the track), so there is no gap anywhere
    // between the cut edge and the meat to see into the hollow shell through
    if (skin.length) {
      const g = solidTube(group, skin, slot, p, d, len, r0, r1, sk[0] / len, sk[1] ? sk[1] / len : 0.97, !sk[1]);
      if (g) { const t = new THREE.Mesh(g, TUBE_FLESH); t.userData.tube = true; t.userData.keep = true; group.add(t); }
    }
  }
}
// wound size by calibre: entry and exit hole radius in metres. Rifle exits are wider (the round yaws), .50 BMG is huge.
const CAL = { 0: [0.0056, 0.013], 1: [0.006, 0.009], 2: [0.018, 0.045], 3: [0.0056, 0.012], 4: [0.006, 0.009], 5: [0.0048, 0.008] };
// severed end: a torn, uneven face of meat (not a clean cut), ragged skin and fat at the rim, strings of torn tissue hanging off,
// and the broken bone standing a little proud with a splintered end and marrow. Points along -y, radius r
const stumpGeo = r => GC('stump' + r, () => {
  let sd = Math.round(r * 1e4) * 7 + 3; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const g = new THREE.Group(), M = c => mat(c, 0.5);
  const put = (geo, c, x, y, z, s, rx, rz) => { const m = new THREE.Mesh(geo, M(c)); m.position.set(x, y, z); if (s) m.scale.set(s[0], s[1], s[2]); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; g.add(m); return m; };
  const rough = (geo, k) => { const P = geo.attributes.position, v = new V3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const f = 1 + (R() - 0.5) * k; P.setXYZ(i, v.x * f, v.y * (1 + (R() - 0.5) * k * 1.6), v.z * f); } geo.computeVertexNormals(); return geo; };
  // the torn face: a low uneven dome of muscle, with a few lumps standing out of it
  put(rough(new THREE.SphereGeometry(r * 0.97, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.28), 0x5c0a0c, 0, -r * 0.05, 0, [1, 0.32, 1]);
  for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = r * (0.25 + R() * 0.6); put(rough(new THREE.SphereGeometry(r * (0.16 + R() * 0.16), 7, 5), 0.4), [0x6e0d10, 0x4e0709, 0x7d1416][i % 3], Math.cos(a) * d, -r * (0.2 + R() * 0.12), Math.sin(a) * d, [1, 0.45 + R() * 0.4, 1]); }
  // fat and torn skin round the edge: a yellowish band and ragged flaps curling out and down
  put(rough(new THREE.TorusGeometry(r * 0.93, r * 0.07, 4, 18), 0.25), 0xb8925a, 0, -r * 0.08, 0, null, Math.PI / 2);
  for (let i = 0; i < 11; i++) { const a = i / 11 * 6.28 + R() * 0.4, L = r * (0.15 + R() * 0.35); const m = put(new THREE.ConeGeometry(r * (0.08 + R() * 0.07), L, 4), [0x6a2a20, 0x7a3426, 0x5a1c16][i % 3], Math.cos(a) * r * 0.98, -r * 0.05 - L * 0.35, Math.sin(a) * r * 0.98); m.rotation.set(Math.PI + (R() - 0.5) * 0.6, 0, 0); m.rotation.y = -a; m.rotateZ(0.5 + R() * 0.5); }
  // the bone: short, off centre, with a splintered end (a cylinder whose top ring is chopped unevenly) and the marrow
  const bg = new THREE.CylinderGeometry(r * 0.28, r * 0.31, r * 0.6, 9, 1), P = bg.attributes.position;
  for (let i = 0; i < P.count; i++) if (P.getY(i) < 0) P.setY(i, P.getY(i) - R() * r * 0.32);
  bg.computeVertexNormals();
  const bx = (R() - 0.5) * r * 0.25, bz = (R() - 0.5) * r * 0.25;
  put(bg, 0xd6c9a8, bx, -r * 0.42, bz);
  put(new THREE.CircleGeometry(r * 0.16, 8), 0x4a120d, bx, -r * 0.73, bz, null, Math.PI / 2);
  for (let i = 0; i < 3; i++) put(new THREE.ConeGeometry(r * 0.05, r * (0.15 + R() * 0.15), 3), 0xe0d4b6, bx + (R() - 0.5) * r * 0.4, -r * 0.78, bz + (R() - 0.5) * r * 0.4, null, Math.PI);
  // strings of torn tissue hanging off
  for (let i = 0; i < 3; i++) { const a = R() * 6.28, d = r * (0.3 + R() * 0.5), L = r * (0.5 + R() * 0.8); put(new THREE.CylinderGeometry(r * 0.05, r * 0.02, L, 5), 0x6a0a0c, Math.cos(a) * d, -r * 0.25 - L / 2, Math.sin(a) * d, null, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5); }
  const geo = bakeColored(g), C = geo.attributes.color;
  // mottled: no two bits of meat quite the same colour
  for (let i = 0; i < C.count; i++) { const k = 0.82 + R() * 0.3; C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k); }
  return geo;
});
function addStump(parent, pos, dir, r) {
  const m = new THREE.Mesh(stumpGeo(r), vcMat); m.position.copy(pos); m.quaternion.setFromUnitVectors(_a.set(0, -1, 0), dir.clone().normalize()); m.userData.keep = true; m.castShadow = true; parent.add(m); return m;
}
// wounds: an entry mark, a ragged exit, a stain that soaks outward, and for rifle rounds a real hole through the body
// ---------------------------------------------------------------- liquid blood on the body
// Not a flat picture: glossy beads of blood placed by casting rays onto the body's own surface around the wound, so they sit on
// whatever shape is there and move with it. A big wound gets a wide wet patch and runs heading downhill.
// is a world point inside one of the holes cut into this mesh (blood must never sit over empty space)
const _ihI = new THREE.Matrix4(), _ihP = new V3(), _ihA = new V3(), _ihB = new V3();
function inHole(mesh, wp, pad, ex) {
  const u = mesh.material && mesh.material.userData; if (!u || !u.hA) return false;
  _ihP.copy(wp).applyMatrix4(_ihI.copy(mesh.matrixWorld).invert());
  for (let i = 0; i < u.hA.value.length; i++) { const A = u.hA.value[i], B = u.hB.value[i]; if (!(A.w > 0)) continue;
    _ihA.set(_ihP.x - A.x, _ihP.y - A.y, _ihP.z - A.z); _ihB.set(B.x, B.y, B.z); const L2 = Math.max(_ihB.lengthSq(), 1e-8), t = _ihA.dot(_ihB) / L2;
    if (t < -0.1 || t > 1) continue; const ct = clamp(t, 0, 1), r = lerp(A.w, B.w, ct) * (pad || 1.15) + (ex || 0);
    if (_ihA.addScaledVector(_ihB, -ct).length() < r) return true; }
  return false;
}
const LIQ_GEO = new THREE.SphereGeometry(1, 10, 6);
// all the drops of one patch are one instanced mesh (one draw call), each drop its own shade of wet, dark red
const LIQ_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const LIQ_COL = [0x6a060b, 0x58040a, 0x480308, 0x7a0a0e].map(c => new THREE.Color(c));
const _lray = new THREE.Raycaster(), _lqL = new THREE.Quaternion(), _lqG = new THREE.Quaternion();
const _lqM = new THREE.Matrix4();
function liquidBlood(group, p, n, R, count, runs, hr) {
  hr = hr || 0;
  group.updateMatrixWorld(true);
  const targets = []; group.traverse(o => { if (o.isMesh && !o.userData.keep && !o.userData.organ && !o.userData.inner && !o.userData.tube && o.visible) targets.push(o); });
  if (!targets.length) return null;
  const out = new THREE.Group(); out.userData.keep = true; group.add(out); out.updateMatrixWorld(true);
  const wp = group.localToWorld(p.clone()), wn = n.clone().transformDirection(group.matrixWorld).normalize();
  const t1 = new V3().crossVectors(wn, Math.abs(wn.y) < 0.9 ? _Y : _Z).normalize(), t2 = new V3().crossVectors(wn, t1);
  const gq = group.getWorldQuaternion(_lqG).invert();
  // the triangles near the wound, gathered once in world space: every drop is then a ray test against a few dozen of them
  // instead of a full raycast through the whole body mesh (dozens of those per wound was the hitch when shooting bodies)
  const tris = [], tm = [], rr2 = Math.pow(R * 2.6 + 0.12, 2), _ta = new V3(), _tb = new V3(), _tc = new V3();
  for (const m of targets) {
    const P = m.geometry.attributes.position, I = m.geometry.index, mw = m.matrixWorld, nT = I ? I.count / 3 : P.count / 3;
    const ctr = _ta.copy(wp).applyMatrix4(_lqM.copy(mw).invert()); if (m.geometry.boundingSphere === null) m.geometry.computeBoundingSphere();
    const sc = mw.getMaxScaleOnAxis(); if (m.geometry.boundingSphere.distanceToPoint(ctr) > Math.sqrt(rr2) / sc) continue;
    for (let t = 0; t < nT; t++) {
      const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      _ta.fromBufferAttribute(P, i0).applyMatrix4(mw); if (_ta.distanceToSquared(wp) > rr2) { _tb.fromBufferAttribute(P, i1).applyMatrix4(mw); if (_tb.distanceToSquared(wp) > rr2) continue; }
      const a = _ta.clone(), b = new V3().fromBufferAttribute(P, i1).applyMatrix4(mw), c = new V3().fromBufferAttribute(P, i2).applyMatrix4(mw);
      tris.push(a, b, c); tm.push(m);
    }
  }
  const _hp2 = new V3(), _tn = new V3(), _e1 = new V3(), _e2 = new V3(); let b_mesh = null; const L = [];
  const drop = (o, r, stretch, along) => {
    _lray.ray.set(o.clone().addScaledVector(wn, 0.12), wn.clone().negate());
    let best = 0.26, hp = null, hn = null, hm = null;
    for (let t = 0; t < tris.length; t += 3) {
      const q = _lray.ray.intersectTriangle(tris[t], tris[t + 1], tris[t + 2], false, _hp2); if (!q) continue;
      const d = q.distanceTo(_lray.ray.origin); if (d < best) { best = d; hp = q.clone(); hm = tm[t / 3]; hn = _tn.crossVectors(_e1.subVectors(tris[t + 1], tris[t]), _e2.subVectors(tris[t + 2], tris[t])).normalize().clone(); }
    }
    // a drop is a disc of radius r (or longer, stretched): none of it may lie over the opening, or it hides the wound
    if (!hp || inHole(hm, hp, 1.15, r * Math.max(1, stretch) * 1.05)) return null; if (hn.dot(wn) < 0) hn.negate();
    b_mesh = hm;
    const h = { point: hp };
    _lqL.setFromUnitVectors(_Y, hn); if (along) { const a = along.clone().addScaledVector(hn, -along.dot(hn)).normalize(), x0 = new V3(0, 0, 1).applyQuaternion(_lqL); _lqL.premultiply(new THREE.Quaternion().setFromUnitVectors(x0, a)); } else _lqL.multiply(new THREE.Quaternion().setFromAxisAngle(_Y, Math.random() * 6.28));
    L.push({ q: gq.clone().multiply(_lqL), p: out.worldToLocal(h.point.clone().addScaledVector(hn, r * 0.08)), s: new V3(r, r * rnd(0.045, 0.075), r * stretch), on: b_mesh, r: r * Math.max(1, stretch) });
    return h.point;
  };
  const k = clamp(R / 0.05, 0.6, 1.8);
  // a wet patch: many flat, overlapping drops that run together, biggest in the middle
  for (let i = 0; i < count * 6; i++) {
    // many small drops that run together read as a wet stain (a few big ones read as polka dots): thickest at the rim
    const a = Math.random() * 6.28, st = rnd(1, 1.6); let d = hr + (R - hr) * Math.pow(Math.random(), 1.3) * (i < count * 2.5 ? 0.4 : 1) + hr * 0.15;
    const r = rnd(0.003, 0.0075) * k * (1 - 0.5 * Math.min(1, d / R));
    d = Math.max(d, hr * 1.15 + r * st * 1.1);   // a ring round the hole: even the drop's edge stays off the opening
    drop(wp.clone().addScaledVector(t1, Math.cos(a) * d).addScaledVector(t2, Math.sin(a) * d), r, st);
  }
  // runs: blood heading downhill across the surface from the wound
  const down = new V3(0, -1, 0).addScaledVector(wn, wn.y); if (runs && down.length() > 0.25) {
    down.normalize();
    for (let j = 0; j < runs; j++) { const side = t1.clone().multiplyScalar(rnd(-0.6, 0.6) * R); const w0 = rnd(0.0035, 0.006) * k, nS = 6 + Math.floor(Math.random() * 4); let o = wp.clone().add(side).addScaledVector(down, hr * 1.15 + w0 * 3.2), got = 0; for (let s = 0; s < nS; s++) { o = o.addScaledVector(down, w0 * rnd(1.6, 2.2)); if (drop(o, w0 * (1 - s / nS * 0.6), rnd(2.4, 3), down)) got++; else if (got || s > 2) break; } }
  }
  if (!L.length) { out.removeFromParent(); return null; }
  const im = new THREE.InstancedMesh(LIQ_GEO, LIQ_MAT, L.length), M4 = new THREE.Matrix4();
  L.forEach((e, i) => { im.setMatrixAt(i, M4.compose(e.p, e.q, e.s)); im.setColorAt(i, LIQ_COL[Math.floor(Math.random() * LIQ_COL.length)]); });
  im.frustumCulled = false; im.userData.keep = true; im.userData.liqI = L; out.add(im);
  return out;
}
// kept under the old name: the torn ring round a blast wound is now a wide patch of liquid blood
function tearMesh(group, p, n, size, hr) { return liquidBlood(group, p, n, clamp(size * 0.32, 0.04, 0.13) + (hr || 0), 26, 4, hr); }
// ---------------------------------------------------------------- spatter thrown out of a body
// For every gun: whatever flies out of an exit (or out of a head) paints the wall behind if there is one within reach,
// otherwise it comes down on the floor ahead, as a droplet field stretched along the line it flew with a little puddle in it.
function blowSpatter(point, dir, size, goreK) {
  if (wallSpatter(point, dir, size, goreK)) return;
  const fy = floorAt(point.x, point.y, point.z), hgt = Math.max(0.03, point.y - fy);
  const dh = new V3(dir.x, 0, dir.z); let hl = dh.length(); if (hl < 0.15) { dh.set(rnd(-1, 1), 0, rnd(-1, 1)); hl = 0.3; } dh.normalize();
  const v = rnd(3, 6), vy = dir.y * v + 0.6, vh = Math.max(0.6, hl * v), t = (vy + Math.sqrt(vy * vy + 2 * 9.8 * hgt)) / 9.8, land = clamp(vh * t * 0.75, 0.4, 4);
  const n = _Y, m = new THREE.Mesh(splatGeo, bmat(goreK ? 'gore' : 'spray')); m.quaternion.setFromUnitVectors(_Z, n);
  const vl = dh.clone().applyQuaternion(m.quaternion.clone().invert()); m.rotateZ(-Math.atan2(vl.x, vl.y));
  const sz = size * (1 + land * 0.35);
  m.position.set(point.x, fy + 0.004 + Math.random() * 0.002, point.z).addScaledVector(dh, land * 0.55 + sz * 0.3); m.scale.set(sz * 0.75, sz * 1.25, 1);
  m.receiveShadow = true; scene.add(m); decals.push(m); trimDecals();
  for (let i = 0; i < 3; i++) { const q = new V3(point.x, fy, point.z).addScaledVector(dh, land * rnd(0.6, 1.3)).add(new V3(rnd(-0.12, 0.12), 0, rnd(-0.12, 0.12))); feedPool(q.x, fy, q.z, size * rnd(2, 5)); }
}
function addWound(hum, frame, group, p, n, kind, size) {
  const mk = () => { const m = new THREE.Object3D(); m.position.copy(p).addScaledVector(n, 0.004); m.userData.keep = true; group.add(m); return m; };
  const hr = kind === 'blast' ? size / 7.5 : kind === 'rimX' ? size / 6.5 : size / 5.2;
  const m = mk(), st = soakMesh(group, p, n, kind === 'blast' ? 0.09 : 0.045, hr), tr = kind === 'blast' ? tearMesh(group, p, n, size, hr) : liquidBlood(group, p, n, clamp(size * 0.9, 0.012, 0.03), 5, 1, hr);
  const rg = !hum && group.parent && group.parent.userData.ragObj; if (rg) { rg.anchors.push({ m, n: n.clone() }); rg.soaks = rg.soaks || []; rg.soaks.push([st, clamp(size * 4, 0.12, 0.3)]); }
  if (!hum || !frame) return;
  hum.wounds = hum.wounds || [];
  hum.wounds.push({ frame, p: p.clone(), n: n.clone(), kind, m, st, size, grow: clamp(size * 4, 0.12, kind === 'blast' ? 0.45 : 0.3), tear: tr ? size : 0, tr });
  while (hum.wounds.length > 16) { const w = hum.wounds.shift(); w.m.removeFromParent(); w.st.removeFromParent(); if (w.tr) w.tr.removeFromParent(); if (w.more) for (const x of w.more) x.removeFromParent(); }
}
const wray = new THREE.Raycaster();
// blood soaking out through the clothes below a wound: starts small, spreads down over the next seconds
function soakMesh(group, p, n, size, hr) {
  // no flat decal any more (a plane can't follow the body's curve); the soak is built from liquid drops that sit on the surface
  const m = new THREE.Object3D(); m.userData.keep = true; group.add(m); return m;
}
// the soak hangs below the wound: its top edge starts at the hole's rim, so the hole stays open to see
function setSoak(m, size) { const u = m.userData.soak; m.scale.setScalar(size); m.position.copy(u.p).addScaledVector(u.n, 0.005).addScaledVector(u.dn, size * 0.42 + (u.hr || 0)); }
// a wound keeps bleeding: more blood wells up round it and runs down the body over the next seconds
function updateWounds(hum, dt) {
  if (!hum.wounds || !hum.root.visible) return;
  let budget = 1;
  for (const w of hum.wounds) {
    w.bt = (w.bt || 0) + dt; w.stage = w.stage || 0;
    if (budget > 0 && w.stage < 3 && w.bt > [1.2, 3.5, 7][w.stage] && w.m.parent) {
      const g = w.m.parent, hr = w.kind === 'blast' ? w.size / 7.5 : w.size / 5.2, tr = liquidBlood(g, w.p, w.n, clamp(w.size * (1.1 + w.stage * 0.5), 0.016, 0.07) + hr, 3, 2 + w.stage, hr);
      if (tr) { w.more = w.more || []; w.more.push(tr); } w.stage++; budget--;
    }
  }
}
function clearWounds(hum) {
  if (hum.wounds) for (const w of hum.wounds) { w.m.removeFromParent(); w.st.removeFromParent(); if (w.tr) w.tr.removeFromParent(); if (w.more) for (const x of w.more) x.removeFromParent(); } hum.wounds = []; hum.holes = [];
  const tubes = [];
  hum.root.traverse(o => { if (o.isMesh && o.userData.holeN) { for (const v of o.material.userData.hA.value) v.w = 0; o.userData.holeN = 0; } if (o.userData.tube) tubes.push(o); if (o.userData.organ || o.userData.inner || o.userData.under) o.visible = false; });
  for (const t of tubes) { t.removeFromParent(); t.geometry.dispose(); }
}
// ---------------------------------------------------------------- penetration
// Each round carries kinetic energy. Every material it passes through takes energy per metre (scaled by how the round behaves:
// soft pistol bullets flatten and lose a lot, a heavy .50 BMG keeps going). Bones cost a lump each. When the energy runs out the
// round stops where it is; anything left over carries on out the other side at the matching speed.
const PEN_CF = w => isPistol(w) ? 1.6 : w === 2 ? 0.55 : isShotgun(w) ? 0.85 : 1;
const FLESH_J = 2200;
function bodyPen(frame, e, d, len, v, w) {
  const m = WEAPONS[w].mass, cf = PEN_CF(w), FL = FLESH_J * cf * (frame === 'head' ? 0.4 : 1); let E = 0.5 * m * v * v, s = 0;
  const P1 = e.clone().addScaledVector(d, len), costs = [];
  for (const st of STRUCTS_BY_FRAME[frame] || []) {
    if (st.type !== 'bone' && st.type !== 'spine' && st.type !== 'joint') continue;
    if (st.shell) { if (st.minY === undefined || e.y > st.minY) costs.push([0.01, 45]); continue; }
    const [dist, t] = pathDist(e, P1, st); if (dist < st.r) costs.push([t * len, st.type === 'joint' ? 60 : 110]);
  }
  costs.sort((a, b) => a[0] - b[0]);
  for (const [at, c] of costs) {
    const need = (at - s) * FL; if (E <= need) return { depth: s + E / FL, v: 0 };
    E -= need; s = at; E -= c * cf; if (E <= 0) return { depth: s, v: 0 };
  }
  const need = (len - s) * FL; if (E <= need + 15) return { depth: s + Math.max(0, E) / FL, v: 0 };
  E -= need; return { depth: len, v: Math.sqrt(2 * E / m) };
}
// the far side of the solid that was just hit, found by casting back toward the entry point
function exitThrough(targets, point, dir, maxLen) {
  wray.set(_a.copy(point).addScaledVector(dir, maxLen), _b.copy(dir).negate()); wray.far = maxLen - 0.002;
  const ex = wray.intersectObjects(targets, false)[0];
  return ex ? { point: ex.point, len: maxLen - ex.distance, object: ex.object, face: ex.face } : null;
}
// the visible damage a round does to one body segment: hole cut as deep as it got, wound marks at each end
function bodyWound(hit, dir, w, pen, ex, hum) {
  const g = hit.object.parent, frame = hit.object.userData.frame, armor = hit.object.userData.armor;
  const cal = CAL[w] || CAL[0], qi = g.getWorldQuaternion(new THREE.Quaternion()).invert();
  const pL = g.worldToLocal(hit.point.clone()), dL = dir.clone().applyQuaternion(qi).normalize(), nL = dL.clone().negate();
  // through and through: the track ends where the round leaves this segment (pen.depth is how far it could have gone, which
  // drew the wound tube sticking out of the far side as a long red cylinder)
  // a round that stays in the body stops short of the far side: the track must not come out through the back of the shirt
  const through = pen.v > 0 && ex, depth = Math.max(0.02, through ? Math.min(pen.depth, ex.len || pen.depth) : ex && ex.len ? Math.min(pen.depth, ex.len - 0.035) : pen.depth), r1 = through ? cal[1] : lerp(cal[0], cal[1], 0.4);
  const start = pL.clone().addScaledVector(dL, -0.04), L = depth + 0.04 + (through ? 0.05 : 0), sk = [0.04, through ? 0.04 + depth : 0];
  const pellet = !!WEAPONS[w].pellets;
  if (!pellet) holeInGroup(g, start, dL, L, cal[0], r1, sk);
  if (hum && frame && !pellet) { hum.holes = hum.holes || []; hum.holes.push({ frame, p: start, d: dL.clone(), len: L, r0: cal[0], r1, sk }); if (hum.holes.length > 30) hum.holes.shift(); }
  if (!armor) addWound(hum, frame, g, pL, nL, 'rim', cal[0] * (pellet ? 3.5 : 5.2));
  if (!through || pellet) return;
  const g2 = ex.object.parent, p2 = g2.worldToLocal(ex.point.clone()), d2 = dir.clone().applyQuaternion(g2.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  if (g2 !== g) { holeInGroup(g2, p2.clone().addScaledVector(d2, -0.08), d2, 0.12, r1 * 0.8, r1, [0.0, 0.11]); const f2 = ex.object.userData.frame; if (hum && f2) { hum.holes.push({ frame: f2, p: p2.clone().addScaledVector(d2, -0.08), d: d2, len: 0.12, r0: r1 * 0.8, r1, sk: [0.0, 0.11] }); if (hum.holes.length > 30) hum.holes.shift(); } }
  if (!ex.object.userData.armor) addWound(hum, ex.object.userData.frame, g2, p2, d2, 'rimX', r1 * 6.5);
}
// walls and props. [energy per metre for a rifle round, hollow shell thickness or 0 for solid, colour of the inside]
const PEN_MAT = { concrete: [68000, 0, 0x2f2c28], wood: [6000, 0.022, 0x3a2614], metal: [600000, 0.003, 0x111111], drywall: [2600, 0.013, 0xb9b3a8], plywood: [6000, 0, 0x5a3e22] };
const KIND_PEN = { concrete: 'concrete', crate: 'wood', metal: 'metal', drywall: 'drywall', plywood: 'plywood' };
// ray against an axis-aligned box from a point on its surface: distance to the far side, and which face it leaves through
function boxExit(box, p, d) {
  let tMin = Infinity, ax = 0;
  for (let k = 0; k < 3; k++) {
    const dk = d.getComponent(k); if (Math.abs(dk) < 1e-6) continue;
    const t = ((dk > 0 ? box.max : box.min).getComponent(k) - p.getComponent(k)) / dk;
    if (t < tMin) { tMin = t; ax = k; }
  }
  const n = new V3(); n.setComponent(ax, Math.sign(d.getComponent(ax)));
  return { t: Math.max(0, tMin), n };
}
function worldPen(b, hit, dir, nIn) {
  const ud = hit.object.userData, pm = PEN_MAT[KIND_PEN[ud.kind]], w = b.w;
  if (!pm || !ud.box) return null;
  const m = WEAPONS[w].mass, v = b.vel.length(), cf = PEN_CF(w), cal = CAL[w] || CAL[0], R = pm[0] * cf;
  let E = 0.5 * m * v * v;
  const bx = boxExit(ud.box, hit.point, dir), cos = Math.max(0.2, Math.abs(nIn.dot(dir)));
  const thick = pm[1] ? Math.min(bx.t, 2 * pm[1] / cos) : bx.t;
  const loss = R * thick, kind = KIND_PEN[ud.kind], mesh = hit.object;
  const rIn = kind === 'concrete' ? Math.max(0.012, cal[0] * 3.4) : kind === 'metal' ? cal[0] * 1.3 : kind === 'drywall' ? cal[0] * 2.4 : cal[0] * 2;
  const rOut = kind === 'concrete' ? Math.max(0.03, cal[0] * 9) : kind === 'metal' ? cal[0] * 1.5 : kind === 'drywall' ? cal[0] * 5 : cal[0] * 4.2;
  const inner = pm[2], local = p => mesh.worldToLocal(p.clone()), dLoc = dir.clone().transformDirection(_hm.copy(mesh.matrixWorld).invert());
  if (mesh.userData.holeN === undefined) mesh.userData.holeMax = 24;
  if (DESTR_OF[ud.kind]) {
    const through = E > loss + 12, exitP = hit.point.clone().addScaledVector(dir, bx.t);
    wallDamage(mesh, hit.point, nIn, dir, E, w, 1, through);
    if (!through) return null;
    wallDamage(mesh, exitP, bx.n, dir, E - loss, w, 0, true);
    const nv = Math.sqrt(2 * (E - loss) / m), dev = (kind === 'concrete' ? 0.03 : 0.01) * (isPistol(w) ? 2 : 1);
    return { point: exitP, dir: dir.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(dev)).normalize(), v: nv };
  }
  if (E > loss + 12) {
    // through: holes at both faces (or the whole way through a solid wall), spall and splinters out the back
    const exitP = hit.point.clone().addScaledVector(dir, bx.t);
    if (pm[1]) { cutHole(mesh, local(hit.point.clone().addScaledVector(dir, -0.02)), dLoc, 0.04 + pm[1] * 2, rIn, rIn * 1.2, inner); cutHole(mesh, local(exitP.clone().addScaledVector(dir, -0.03)), dLoc, 0.06, rOut * 0.6, rOut, inner); }
    else cutHole(mesh, local(hit.point.clone().addScaledVector(dir, -0.02)), dLoc, bx.t + 0.05, rIn, rOut, inner);
    pierceMark(mesh, exitP, bx.n, ud.surf, rOut, true);
    impactFx(exitP, bx.n, ud.surf);
    if (kind === 'concrete' || w === 2) particles(exitP.clone().addScaledVector(bx.n, 0.03), 10, PMAT.chip, 3.5, 0.02, 0.9, 1, bx.n);
    const nv = Math.sqrt(2 * (E - loss) / m), dev = (kind === 'concrete' ? 0.03 : kind === 'metal' ? 0.02 : 0.01) * (isPistol(w) ? 2 : 1);
    const nd = dir.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(dev)).normalize();
    return { point: exitP, dir: nd, v: nv };
  }
  // stopped inside: a crater as deep as it got. Pistol rounds on concrete just splash.
  const depth = Math.max(0.004, E / R);
  cutHole(mesh, local(hit.point.clone().addScaledVector(dir, -0.02)), dLoc, Math.min(depth, bx.t * 0.98) + 0.02, rIn, rIn * 0.6, inner);
  if (kind === 'concrete' && isPistol(w)) particles(hit.point.clone().addScaledVector(nIn, 0.02), 8, PMAT.spark, 3, 0.004, 0.2, 0.2, nIn, 5);
  return null;
}
// a decal with a clear middle, so the hole under it stays visible
function pierceMark(mesh, point, normal, surf, r, exit) {
  const base = PIERCE_MAT[surf] || PIERCE_MAT.concrete, size = r * (exit ? 4 : 5) / 0.7;
  placeDecal(mesh, point, normal, Math.max(0.02, size), base);
}
