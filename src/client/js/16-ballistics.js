// ---------------------------------------------------------------- props: shells, mags, dropped guns
const props = [];
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.28 });
function lathe(pts, seg) { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 14); g.computeBoundingBox(); const c = g.boundingBox.getCenter(new V3()); g.translate(0, -c.y, 0); return g; }
// 5.56x45 bottleneck case and 9x19 straight case (radius, height in metres)
const SHELL_GEO = {
  '556': lathe([[0, 0], [0.0047, 0], [0.0047, 0.0012], [0.0040, 0.0016], [0.0040, 0.0022], [0.0048, 0.0028], [0.0046, 0.0362], [0.0032, 0.0392], [0.0032, 0.0447], [0.0028, 0.0447]]),
  '9mm': lathe([[0, 0], [0.0049, 0], [0.0049, 0.0013], [0.0043, 0.0017], [0.0043, 0.0023], [0.0049, 0.0027], [0.00482, 0.019], [0.0045, 0.019]]),
  '545': lathe([[0, 0], [0.005, 0], [0.005, 0.0012], [0.0043, 0.0016], [0.0043, 0.0022], [0.0051, 0.0028], [0.0048, 0.033], [0.0032, 0.0365], [0.0032, 0.0395], [0.0029, 0.0395]]),
  '50': lathe([[0, 0], [0.0102, 0], [0.0102, 0.003], [0.0088, 0.0038], [0.0088, 0.005], [0.0102, 0.0058], [0.0098, 0.078], [0.0072, 0.086], [0.0072, 0.099], [0.0067, 0.099]]),
  // fired 12 ga hull: brass head and rim (the red plastic body is added in ejectShell), crimp opened out
  '12g': lathe([[0, 0], [0.0112, 0], [0.0112, 0.0014], [0.0104, 0.0016], [0.0104, 0.015], [0.0101, 0.015], [0.0101, 0.0], [0, 0.0]])
};
const hullGeo = lathe([[0.0098, 0.0], [0.0101, 0.0], [0.0101, 0.052], [0.0108, 0.068], [0.0103, 0.068], [0.0096, 0.053], [0.0098, 0.0]]);
const hullMat = new THREE.MeshStandardMaterial({ color: 0xa8181a, roughness: 0.55, side: THREE.DoubleSide });
// projectiles: 5.56 spitzer and 9mm round nose
const BULLET_GEO = {
  '556': lathe([[0, 0.0125], [0.0009, 0.0115], [0.0019, 0.0088], [0.0026, 0.0052], [0.0028, 0.0025], [0.0028, -0.0045], [0.0025, -0.0065], [0, -0.0065]]),
  '9mm': lathe([[0, 0.0075], [0.0022, 0.0062], [0.0034, 0.004], [0.0045, 0.0005], [0.0045, -0.0075], [0, -0.0075]]),
  '545': lathe([[0, 0.014], [0.0008, 0.013], [0.0018, 0.0095], [0.0025, 0.0055], [0.0028, 0.0025], [0.0028, -0.006], [0.0024, -0.0085], [0, -0.0085]]),
  '50': lathe([[0, 0.033], [0.002, 0.03], [0.0045, 0.02], [0.0062, 0.01], [0.0065, 0.004], [0.0065, -0.012], [0.0055, -0.025], [0, -0.025]]),
  // 00 buck: 8.4 mm lead ball
  '12g': new THREE.SphereGeometry(0.0042, 8, 6)
};
const leadMat = new THREE.MeshStandardMaterial({ color: 0x6a6d70, metalness: 0.6, roughness: 0.5 });
function addProp(mesh, v, w, r, kind, maxLife) {
  mesh.castShadow = true; mesh.rotation.order = 'YXZ'; scene.add(mesh);
  props.push({ m: mesh, v, w, r, kind, rest: false, life: 0, max: maxLife || 15 });
  let shells = 0; for (const p of props) if (p.kind === 'shell') shells++;
  if (shells > 80) { const i = props.findIndex(p => p.kind === 'shell'); scene.remove(props[i].m); props.splice(i, 1); }
}
function ejectShell(pos, right, up, fwd, base, type) {
  const m = new THREE.Mesh(SHELL_GEO[type], brassMat); m.position.copy(pos);
  // a shotgun hull: brass head plus red plastic body, open end forward. Pumped out of the port with less snap than a rifle case
  if (type === '12g') { const h = new THREE.Mesh(hullGeo, hullMat); h.castShadow = true; m.add(h); const head = SHELL_GEO['12g']; head.computeBoundingBox(); h.position.y = head.boundingBox.max.y + 0.034 - 0.0006; }
  const v = right.clone().multiplyScalar(rnd(2.2, 3.4)).addScaledVector(up, rnd(1.2, 2)).addScaledVector(fwd, rnd(-0.6, 0.1)).add(base);
  addProp(m, type === '12g' ? v.multiplyScalar(0.7) : v, new V3(rnd(-25, 25), rnd(-10, 10), rnd(15, 35)), type === '12g' ? 0.011 : 0.005, 'shell', 25);
}
function updateProps(dt) {
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i]; p.life += dt;
    if (p.life > p.max) { scene.remove(p.m); props.splice(i, 1); continue; }
    if (p.rest) continue;
    const m = p.m, ox = m.position.x, oy = m.position.y, oz = m.position.z;
    p.v.y -= 9.8 * dt;
    m.position.addScaledVector(p.v, dt);
    m.rotation.x += p.w.x * dt; m.rotation.y += p.w.y * dt; m.rotation.z += p.w.z * dt;
    let floor = p.r;
    for (const c of colliders) if (m.position.x > c.min.x && m.position.x < c.max.x && m.position.z > c.min.z && m.position.z < c.max.z && oy >= c.max.y - 0.02) floor = Math.max(floor, c.max.y + p.r);
    if (m.position.y > floor && pointBlocked(m.position, 0)) { m.position.x = ox; m.position.z = oz; p.v.x *= -0.3; p.v.z *= -0.3; }
    if (m.position.y < floor) {
      m.position.y = floor;
      const sp = -p.v.y;
      if (sp > 0.5) {
        const dist = m.position.distanceTo(camera.position), vol = clamp(sp / 4, 0, 1) / (1 + dist * 0.5);
        if (p.kind === 'shell') blip(rnd(3800, 5600), 0.05, 0.03 * vol, 'sine');
        else noiseHit(p.kind === 'gun' ? 400 : 700, 0.08, 0.08 * vol);
      }
      p.v.y = sp * (p.kind === 'shell' ? 0.35 : 0.2); p.v.x *= 0.55; p.v.z *= 0.55; p.w.multiplyScalar(0.5);
      if (p.v.y < 0.35 && Math.hypot(p.v.x, p.v.z) < 0.3) {
        p.rest = true; const yaw = m.rotation.y;
        if (p.kind === 'shell') m.rotation.set(Math.PI / 2, rnd(0, 6.28), 0, 'YXZ');
        else m.rotation.set(0, yaw, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1));
      }
    }
  }
}

// ---------------------------------------------------------------- ballistics (simulated projectiles with drag + gravity)
const bullets = [];
const bray = new THREE.Raycaster();
const streakGeo = new THREE.CylinderGeometry(1, 0.35, 1, 6, 1, true);
const STREAK = {
  tracer: new THREE.MeshBasicMaterial({ color: 0xff5a28, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  faint: new THREE.MeshBasicMaterial({ color: 0xfff2e0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
};
const tracerGlowMat = new THREE.SpriteMaterial({ map: puffTex, color: 0xff4a1a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true });
const _bp = new V3(), _bd = new V3(), _bq = new THREE.Quaternion();
function spawnBullet(origin, dir, wi, tracer, local, ownerId, shot) {
  const w = WEAPONS[wi];
  const mesh = new THREE.Mesh(BULLET_GEO[w.shell], w.pellets ? leadMat : copperMat); mesh.position.copy(origin); scene.add(mesh);
  const streak = new THREE.Mesh(streakGeo, tracer ? STREAK.tracer : STREAK.faint); streak.visible = false; scene.add(streak);
  let glow = null; if (tracer) { glow = new THREE.Sprite(tracerGlowMat); glow.visible = false; scene.add(glow); }
  bullets.push({ pos: origin.clone(), vel: dir.clone().multiplyScalar(w.vel), w: wi, drag: w.drag, dist: 0, life: 0, tracer, local, ownerId, mesh, streak, glow, shot });
}
function removeBullet(i) { const b = bullets[i]; scene.remove(b.mesh); scene.remove(b.streak); if (b.glow) scene.remove(b.glow); bullets.splice(i, 1); }
function bulletTargets() {
  const arr = worldMeshes.slice();
  for (const rg of ragdolls) if (rg !== P.rag && rg.owner) rg.group.traverse(o => { if (o.isMesh && !o.userData.keep && !o.userData.organ && !o.userData.inner && !o.userData.tube && o.visible) arr.push(o); });
  for (const r of S.remotes.values()) if (r.alive && r.st && !r.rag) for (const m of r.hum.hitMeshes) if (m.visible) arr.push(m);
  for (const d of dummies) if (!d.dead && !d.rag) for (const m of d.hum.hitMeshes) if (m.visible) arr.push(m);
  return arr;
}
function updateBullets(dt) {
  if (!bullets.length) return;
  scene.updateMatrixWorld();
  const targets = bulletTargets();
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    _bp.copy(b.pos);
    const sp = b.vel.length();
    b.vel.multiplyScalar(Math.max(0, 1 - b.drag * sp * dt));
    b.vel.y -= 9.81 * dt;
    b.pos.addScaledVector(b.vel, dt);
    _bd.subVectors(b.pos, _bp); const len = _bd.length(); if (len > 0) _bd.multiplyScalar(1 / len);
    bray.set(_bp, _bd); bray.far = len;
    const hit = len > 0 ? bray.intersectObjects(targets, false)[0] : null;
    b.life += dt;
    if (!b.local && !b.whizz && S.mode && P.alive && len > 0) {
      const tc = clamp(_a.subVectors(camera.position, _bp).dot(_bd), 0, hit ? hit.distance : len), dd = _a.copy(_bp).addScaledVector(_bd, tc).distanceTo(camera.position);
      if (dd < 2.4 && b.dist + tc > 2 && !(hit && hit.object.userData.hum === localBody)) { b.whizz = true; suppress(1 - dd / 2.4, sp); }
    }
    if (hit) {
      // the round may carry on through what it hit, slower and slightly deflected
      const cont = onBulletHit(b, hit, _bd.clone(), b.dist + hit.distance);
      if (cont && cont.v > 45 && (cont.free || (b.pens = (b.pens || 0) + 1) < 8)) {
        b.dist += hit.distance + cont.point.distanceTo(hit.point);
        b.pos.copy(cont.point).addScaledVector(cont.dir, 0.006); b.vel.copy(cont.dir).multiplyScalar(cont.v);
        b.mesh.position.copy(b.pos); continue;
      }
      removeBullet(i); continue;
    }
    b.dist += len;
    if (b.life > 6 || b.dist > 2500 || b.pos.y < -5) { removeBullet(i); continue; }
    b.mesh.position.copy(b.pos); b.mesh.quaternion.setFromUnitVectors(_Y, _bd);
    const camD = b.pos.distanceTo(camera.position);
    const showStreak = b.dist > (b.tracer ? 6 : 2) && (!b.tracer || b.dist < 900) && len > 0.02;
    b.streak.visible = showStreak;
    if (showStreak) {
      const sl = Math.min(len * 0.9, b.tracer ? 14 : 6), wd = Math.max(0.0025, camD * (b.tracer ? 0.0011 : 0.0006));
      b.streak.scale.set(wd, sl, wd);
      b.streak.quaternion.setFromUnitVectors(_Y, _bd.clone().negate());
      b.streak.position.copy(b.pos).addScaledVector(_bd, -sl / 2);
    }
    if (b.glow) { b.glow.visible = showStreak; b.glow.position.copy(b.pos); b.glow.scale.setScalar(Math.max(0.12, camD * 0.009)); }
  }
}

// pellets of one shot that land together on one body: past the third, the load tears one big opening (organs show through
// it), throws out tissue and paints what is behind. Runs on every client that draws the shot, so everyone sees it.
// ---------------------------------------------------------------- bodies wear away like walls: holes from blasts and .50s that land
// near an earlier one widen it instead of making a new one, and once a hole is as wide as the limb the limb parts right there
const LIMB_R = { shL: 0.05, shR: 0.05, elL: 0.04, elR: 0.04, lgL: 0.075, lgR: 0.075, knL: 0.055, knR: 0.055 };
function erode(key, seg, frame, cl, r, info, dir) {
  if (!key || !frame) return;
  const E = key.erosion = key.erosion || [];
  let h = E.find(x => x.seg === seg && x.p.distanceTo(cl) < x.r + r + 0.02);
  if (h) { const a = h.r * h.r, b = r * r; h.p.lerp(cl, b / (a + b)); h.r = Math.min(0.16, Math.sqrt(a + b) * 1.05); h.n++; }
  else E.push(h = { seg, frame, p: cl.clone(), r, n: 1 });
  // a wider channel where it grew
  if (h.n > 1) { const dL = dir.clone().applyQuaternion(seg.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(); holeInGroup(seg, h.p.clone().addScaledVector(dL, -0.06), dL, 0.32, h.r, h.r * 1.3, null); spawnGore(seg.localToWorld(h.p.clone()), dir, 'flesh', 2 + h.n, 2.5, 0.4, 0.012); }
  const lr = LIMB_R[frame];
  if (lr && h.r >= lr * 0.75 && !h.cut) {
    h.cut = true;
    const region = regionOf(frame, info.e), lim = LIMB_OF[region]; if (!lim) return;
    const t = /hand|foot/.test(region) ? 0.93 : clamp(-info.e.y / (LSEG[frame] || 0.3), 0.1, 0.9);
    const own = key.owner || {}, an = key.dummy ? key.dummy.anat : own.dummy ? own.dummy.anat : own.anat || null;
    if (an) {
      an.sever(lim[0], lim[1], t);
      if (key.dummy) { const d = key.dummy; if (d.rag) { d.rag.applyLost(an.lostMask(), dir, an.cutArr()); d.hum.setLost(an.lostMask(), an.cutArr()); } else syncLost(d.hum, an.lostMask(), dir, an.cutArr()); }
      else if (key.applyLost) key.applyLost(an.lostMask(), dir, an.cutArr());
    }
  }
}
function blastVisual(shot, hit, dir, info, key, hum) {
  let g = shot.hits.get(key); if (!g) shot.hits.set(key, g = { n: 0, pts: [], seg: hit.object.parent, frame: info.frame, lastN: 0 });
  g.n++; if (hit.object.parent === g.seg) g.pts.push(hit.point.clone());
  if (g.pts.length < 3 || g.n < g.lastN + 2 && g.lastN) return;
  const c = new V3(); for (const p of g.pts) c.add(p); c.multiplyScalar(1 / g.pts.length); let sp = 0; for (const p of g.pts) sp = Math.max(sp, p.distanceTo(c));
  if (sp > 0.16) return;
  g.lastN = g.n;
  const seg = g.seg, cl = seg.worldToLocal(c.clone()), dL = dir.clone().applyQuaternion(seg.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  const r0 = clamp(0.022 + sp * 0.55, 0.025, 0.075), st = cl.clone().addScaledVector(dL, -0.05);
  holeInGroup(seg, st, dL, 0.3, r0, r0 * 1.6, [0.05, 0]);
  erode(key, seg, g.frame, cl, r0, info, dir);
  if (!hit.object.userData.armor) addWound(hum, g.frame, seg, cl, dL.clone().negate(), 'blast', r0 * 7.5);
  if (hum && g.frame) { hum.holes = hum.holes || []; hum.holes.push({ frame: g.frame, p: st, d: dL.clone(), len: 0.3, r0, r1: r0 * 1.6, sk: [0.05, 0] }); if (hum.holes.length > 10) hum.holes.shift(); }
  const f = g.frame, part = f === 'head' || f === 'neck' ? 'headwound' : f === 'spine' ? (info.e.y > 0.22 ? 'chest' : 'abdomen') : f === 'hips' ? 'pelvis' : 'limb';
  const k = clamp((g.n - 2) / 5, 0.3, 1) * (sp < 0.06 ? 1 : 0.6);
  if (part === 'headwound') { spawnGore(c, dir, 'flesh', 3, 2.5, 0.5, 0.014); spawnGore(c, dir, 'bone', 2, 3, 0.5, 0.01); spawnGore(c, dir, 'skull', 2, 3, 0.5, 0.025, hum && hum.pal && hum.pal.skin); }
  else goreBlast(part, c, dir, k);
  blowSpatter(c.clone().addScaledVector(dir, 0.1), dir, rnd(0.6, 0.95) * (0.6 + k * 0.5), true);
  noiseHit(320, 0.12, 0.1);
}
// what a round does when it reaches something. Returns where and how fast it carries on, or null if it stopped.
function onBulletHit(b, hit, dir, dist) {
  const ud = hit.object.userData, v = b.vel.length(), Eh = 0.5 * WEAPONS[b.w].mass * v * v, r4 = x => Math.round(x * 10000) / 10000;
  // velocity left after a plate or helmet that did not stop the round (mirrors the anatomy model)
  const afterArmor = (armor, d) => armor === 'plateF' && d.z > 0 ? v * (Eh > 8000 ? 0.85 : 0.55) : armor === 'helmet' ? v * (Eh > 8000 ? 0.9 : 0.55) : v;
  if (ud.armor === 'pack') return packHit(hit, dir, v);
  if (ud.rag) {
    // a body on the ground, alive or not: the round hits the part it actually struck
    const rag = ud.rag, own = rag.owner || {}, info = ragHitInfo(hit, dir);
    const an0 = own.dummy ? own.dummy.anat : own.anat, stopped = info.armor === 'plateF' && info.d.z > 0 && (!an0 || an0.armor.plateF > 0) && Eh < 2200 && b.w !== 2;
    let cont = null;
    if (stopped) { impactFx(hit.point, dir.clone().negate(), 'metal'); noiseHit(2600, 0.06, 0.06); markPlate(hit, dir, b.w); }
    else {
      const tg = hit.object.parent.children.filter(o => o.isMesh && !o.userData.keep && !o.userData.organ && !o.userData.inner && !o.userData.tube), ex = exitThrough(tg, hit.point, dir, 0.8);
      const pen = bodyPen(info.frame, info.e, info.d, ex ? ex.len : 0.3, afterArmor(info.armor, info.d), b.w);
      info.pd = pen.depth; bodyWound(hit, dir, b.w, pen, ex, null);
      bloodFx(hit.point, dir, false, pen.v > 0 && ex ? 1 : 0.4); if (pen.v > 0 && ex) { bloodFx(ex.point, dir, true); cont = { point: ex.point, dir, v: pen.v }; }
      if (b.shot) blastVisual(b.shot, hit, dir, info, rag, null);
      if (b.w === 2 && !b.shot) erode(rag, hit.object.parent, info.frame, hit.object.parent.worldToLocal(hit.point.clone()), 0.045, info, dir);
    }
    // neck: rounds and pellets tear it a little at a time until the head hangs on strands, then part the strands
    const nearStrands = rag.fibers && rag.fibers.some(f => rag.torso.localToWorld(f.a.clone()).lerp(rag.headG.localToWorld(f.b.clone()), 0.5).distanceTo(hit.point) < 0.07);
    if ((info.frame === 'neck' || nearStrands) && rag.headG.visible && !stopped) {
      if (!rag.neckTorn) { rag.neckHits = (rag.neckHits || 0) + (b.w === 2 ? 6 : b.shot ? 1.4 : 1); if (rag.neckHits >= 5.5) rag.tearNeck(dir); }
      else rag.cutFibers(hit.point, b.w === 2 ? 99 : b.shot ? 2 : 1);
      if (b.w === 2) cont = null;
    }
    else if (b.w === 2 && info.frame === 'head' && rag.headG.visible && b.local) { rag.gibHead(dir); cont = null; }
    else if (cont && (info.frame === 'head' || info.frame === 'neck')) wallSpatter(cont.point, dir, rnd(0.55, 0.8), true);
    let ni = 1, nd = 1e9; for (let i = 0; i < 16; i++) { const dd = rag.p[i].distanceToSquared(hit.point); if (dd < nd) { nd = dd; ni = i; } }
    rag.kick(dir, (0.35 + v / 1500) * (b.w === 2 ? 3 : 1) * (cont ? 0.5 : 1), ni);
    if (!b.local) return cont;
    if (own.dummy) { own.dummy.shot(info, v, b.w, dir, dist); if (own.dummy.anat.gibHead && rag.headG.visible) rag.gibHead(dir); }
    else if (own.remote) net.send({ t: 'hit', id: own.remote, f: info.frame, p: info.e.toArray().map(r4), d: info.d.toArray().map(r4), v: Math.round(v), w: b.w, ar: info.armor || '', wd: dir.toArray().map(r4), dist: Math.round(dist), pd: r4(info.pd === undefined ? 1 : info.pd) });
    else if (own.anat) {
      const res = own.anat.hit(info.frame, info.e, info.d, v, b.w, info.armor, info.pd);
      if (own.anat.gibHead && rag.headG.visible) rag.gibHead(dir);
      if (res.helmetOff) rag.group.traverse(o => { if (o.userData.armor === 'helmet') o.visible = false; });
      rag.applyLost(own.anat.lostMask(), dir, own.anat.cutArr());
    }
    return cont;
  }
  if (ud.hum) {
    const info = hitToFrame(ud.hum, hit.object, hit.point, dir);
    const plate = info.armor === 'plateF' && info.d.z > 0;
    const an0 = ud.hum.dummy ? ud.hum.dummy.anat : null, plateLeft = an0 ? an0.armor[info.armor] > 0 : true;
    const stopped = (plate && plateLeft && Eh < 2200 && b.w !== 2) || (info.armor === 'helmet' && Eh < 700);
    if (info.armor === 'helmet' && b.local && ud.hum.remote) setHelmet(ud.hum, false, dir);
    if (stopped || info.armor) { impactFx(hit.point, dir.clone().negate(), 'metal'); noiseHit(2600, 0.06, 0.06); }
    if (stopped) markPlate(hit, dir, b.w);
    let cont = null;
    if (!stopped) {
      // only this body segment counts as "the solid" here; whatever is behind it gets hit as the round carries on
      const tg = ud.hum.hitMeshes.filter(m => m.visible && m.userData.frame === hit.object.userData.frame), ex = exitThrough(tg, hit.point, dir, 0.8);
      const pen = bodyPen(info.frame, info.e, info.d, ex ? ex.len : 0.3, afterArmor(info.armor, info.d), b.w);
      info.pd = pen.depth; bodyWound(hit, dir, b.w, pen, ex, ud.hum);
      bloodFx(hit.point, dir, false, pen.v > 0 && ex ? 1 : 0.4);
      if (pen.v > 0 && ex) { bloodFx(ex.point, dir, true); cont = { point: ex.point, dir, v: pen.v }; if (info.frame === 'head' || info.frame === 'neck') wallSpatter(ex.point, dir, rnd(0.6, 0.9), true); }
      else if (info.frame === 'head' || info.frame === 'neck') { bloodFx(hit.point, dir, false, 2); blowSpatter(hit.point, dir, rnd(0.35, 0.55)); }
      if (b.shot) blastVisual(b.shot, hit, dir, info, ud.hum, ud.hum);
      if (b.w === 2 && !b.shot && b.local) erode(ud.hum, hit.object.parent, info.frame, hit.object.parent.worldToLocal(hit.point.clone()), 0.045, info, dir);
    }
    if (!b.local) return cont;
    if (ud.hum.remote) net.send({ t: 'hit', id: ud.hum.remote.id, f: info.frame, p: info.e.toArray().map(r4), d: info.d.toArray().map(r4), v: Math.round(v), w: b.w, ar: info.armor || '', wd: dir.toArray().map(r4), dist: Math.round(dist), pd: r4(info.pd === undefined ? 1 : info.pd) });
    else if (ud.hum.dummy) {
      const d0 = ud.hum.dummy; d0.shot(info, v, b.w, dir, dist);
      // a .50 or a close blast through the neck that kills: the head is left hanging
      if (info.frame === 'neck' && (b.w === 2 || b.shot) && d0.rag && !d0.rag.neckTorn && d0.rag.headG.visible) d0.rag.tearNeck(dir);
    }
    return cont;
  }
  if (hit.face) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const open = holePass(hit.object, hit.point, n, dir, v); if (open) return open;
    if (!DESTR_OF[ud.kind]) bulletHole(hit, n, b.w);
    return worldPen(b, hit, dir, n);
  }
  return null;
}
function showRange(t) { const e = $('range'); e.textContent = t; e.style.transition = 'none'; e.style.opacity = '1'; clearTimeout(showRange.t); showRange.t = setTimeout(() => { e.style.transition = 'opacity .6s'; e.style.opacity = '0'; }, 1300); }

