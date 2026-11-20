// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { $, V3, camera, clamp, lerp, rnd, scene } from './00-setup.js';
import { addBox, canvasTex, colliders, worldGroup, worldMeshes } from './01-world.js';
import { decoMat } from './01b-town.js';
import { laserBeam } from './09-attachments.js';
import { blip, noiseHit } from './10-audio.js';
import { P, S, mouse } from './17-dummies.js';
import { flashMsg, hurtFlash, selectEmpty } from './18-player.js';
import { DEF_TEAM, net } from './19-network.js';
import { boomL, boomLight, deafen, explSeq, explode, los, r3 } from './19b-explosives.js';
import { TV } from './19c-toolvm.js';
import { screenBlood } from './21b-screenfx.js';
import { sgDisposeMarker, sgMarker } from './23-siege.js';
import { matchFrozen } from './28-match.js';
// ---- end module links ----
// ---------------------------------------------------------------- gadgets
// Slot 3 holds a gadget, slot 4 a throwable, picked in the loadout from your side's list.
// Attackers: C4 (breach), a claymore (a tripwire laser; it throws its steel forward at whoever walks into it), smoke grenades
// (a thick cloud for 20 s), flashbangs (blinding and deafening if you see or are close to them).
// Defenders: bear traps (hidden-ish on the floor; they hold the leg of whoever steps in, and hurt), barbed wire (slow, noisy and
// painful to go through), a deployable steel shield (cover that stops rounds), proximity alarms (they shriek and mark whoever
// comes near, for the defenders), frags and flashbangs.
// A placed gadget goes out to everyone ('x' 'gd'); what sets one off is worked out by whoever walks into it ('x' 'gdx').
const GADGETS = {
  c4: { name: 'C4 (M112)', team: 'r', slot: 2, n: 2, desc: 'stick it, blow it: breaches walls and doors' },
  claymore: { name: 'Claymore', team: 'r', slot: 2, n: 1, desc: 'laser tripwire, blasts forward' },
  beartrap: { name: 'Bear trap', team: 'b', slot: 2, n: 3, desc: 'holds and hurts whoever steps in' },
  wire: { name: 'Barbed wire', team: 'b', slot: 2, n: 2, desc: 'slows, cuts and rattles' },
  shield: { name: 'Deployable shield', team: 'b', slot: 2, n: 1, desc: 'steel cover that stops rounds' },
  alarm: { name: 'Proximity alarm', team: 'b', slot: 2, n: 2, desc: 'shrieks and marks attackers nearby' },
  frag: { name: 'M67 frag', team: 'rb', slot: 3, n: 2, desc: 'fragmentation grenade' },
  smoke: { name: 'Smoke grenade', team: 'r', slot: 3, n: 2, desc: 'a thick cloud for 20 s' },
  flash: { name: 'Flashbang', team: 'rb', slot: 3, n: 2, desc: 'blinds and deafens' }
};
const GD = [], SMOKES = [];
const gdKey = (o, i) => o + ':' + i;
const _gdV = new V3(), _gdRay = new THREE.Raycaster();
const gdMat = c => decoMat(c);
// the models
function gdModel(k) {
  const g = new THREE.Group(), box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gdMat(c)); m.position.set(x || 0, (y || 0) + h / 2, z || 0); m.castShadow = true; g.add(m); return m; };
  if (k === 'beartrap') {
    const jawM = gdMat(0x5a5650), ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 20), jawM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.015; g.add(ring);
    g.userData.jaws = [];
    for (const s of [-1, 1]) { const j = new THREE.Group(); j.position.set(0, 0.015, 0); const a = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.01, 5, 14, Math.PI), jawM); a.rotation.x = Math.PI / 2; a.rotation.z = s < 0 ? 0 : Math.PI; j.add(a);
      for (let t = 0; t < 7; t++) { const an = (t + 0.5) / 7 * Math.PI * (s < 0 ? 1 : -1), c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 4), jawM); c.position.set(Math.cos(an) * 0.19, 0.02, Math.sin(an) * 0.19 * s * -1); j.add(c); }
      g.add(j); g.userData.jaws.push(j); }
    box(0.08, 0.02, 0.08, 0x3a3a36);
  } else if (k === 'wire') {
    const wm = gdMat(0x8a8a86);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.006, 4, 18), wm); c.position.set(-1.05 + i * 0.42, 0.28, 0); c.rotation.y = Math.PI / 2 + rnd(-0.2, 0.2); c.rotation.z = rnd(-0.2, 0.2); g.add(c); }
    for (const x of [-1.2, 0, 1.2]) box(0.03, 0.55, 0.03, 0x4a3a2a, x, 0, 0);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 2.4, 4), wm); line.rotation.z = Math.PI / 2; line.position.y = 0.45; g.add(line);
  } else if (k === 'alarm') {
    box(0.12, 0.07, 0.08, 0x2a2e2a); const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0x30ff60 })); led.position.set(0.035, 0.075, 0.03); g.add(led); g.userData.led = led;
  } else if (k === 'claymore') {
    const m = box(0.22, 0.12, 0.04, 0x4a5a32, 0, 0.08, 0); m.rotation.x = 0.1;
    for (const x of [-0.08, 0.08]) for (const z of [-0.03, 0.03]) { const l = box(0.008, 0.09, 0.008, 0x2a2a2a, x, 0, z); }
    const las = new THREE.Mesh(laserBeam.geometry, laserBeam.material); las.scale.set(1, 2.6, 1); las.rotation.x = -Math.PI / 2 + 0.06; las.position.set(0, 0.16, -1.3); g.add(las);
  }
  return g;
}
// one placed: kept in GD (and as a solid box, for the shield)
function gadgetAdd(owner, id, k, p, yaw, team) {
  if (!GADGETS[k] || GD.some(o => o.key === gdKey(owner, id))) return;
  const o = { key: gdKey(owner, id), owner, id, k, p: p.clone(), yaw, team, t: 0, sprung: false, cd: 0 };
  if (k === 'shield') {
    const f = new V3(-Math.sin(yaw), 0, -Math.cos(yaw)), along = Math.abs(f.z) > Math.abs(f.x);
    addBox(p.x, p.y, p.z, along ? 1.05 : 0.07, 1.05, along ? 0.07 : 1.05, 'metal', 0x4a5058); o.mesh = worldMeshes[worldMeshes.length - 1]; o.mesh.userData.gadget = o.key;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.3 : 0.075, 0.05, along ? 0.075 : 0.3), gdMat(0x111111)); slit.position.set(p.x, p.y + 0.85, p.z); worldGroup.add(slit); o.g = slit;
  } else { o.g = gdModel(k); o.g.position.copy(p); o.g.rotation.y = yaw; worldGroup.add(o.g); }
  GD.push(o); return o;
}
// a gadget's own geometry and materials go with it (the shared ones, the laser's and the deco colours, stay)
function gdDispose(g) {
  g.traverse(x => {
    if (x.geometry && !x.isSprite && x.geometry !== laserBeam.geometry) x.geometry.dispose();
    const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    for (const m of ms) if (m !== laserBeam.material && !(m.userData && m.userData.shared)) { if (m.map && m.map !== SMOKE_TEX) m.map.dispose(); m.dispose(); }
  });
}
function gadgetRemove(o) {
  const i = GD.indexOf(o); if (i >= 0) GD.splice(i, 1);
  if (o.g) { o.g.removeFromParent(); gdDispose(o.g); }
  if (o.mesh) { const j = worldMeshes.indexOf(o.mesh); if (j >= 0) worldMeshes.splice(j, 1); const c = colliders.indexOf(o.mesh.userData.box); if (c >= 0) colliders.splice(c, 1); o.mesh.removeFromParent(); gdDispose(o.mesh); }
  if (o.marker) sgDisposeMarker(o.marker);
}
function clearGadgets() { while (GD.length) gadgetRemove(GD[0]); for (const s of SMOKES) { s.g.removeFromParent(); gdDispose(s.g); } SMOKES.length = 0; P.trapped = null; gadgetGhostOff(); }
// a blast near one: it is wrecked (worked out the same everywhere)
function gadgetBlast(p, W) { if (W < 0.1) return; for (const o of GD.slice()) if (o.p.distanceTo(p) < 1.1 * Math.cbrt(W) + 0.4) gadgetRemove(o); }

// ---- placing one (slot 3, anything but C4): it goes where you look, on the floor (an alarm sticks to a wall as well)
let gdGhost = null;
function updateGadget(dt) {
  if (typeof TV !== 'undefined' && TV.c4) TV.c4.visible = false;
  const k = P.tool2, G = GADGETS[k]; if (!G) return;
  if (P.c4N <= 0) { selectEmpty(2); return; }
  const o = camera.getWorldPosition(new V3()), d = camera.getWorldDirection(new V3());
  _gdRay.set(o, d); _gdRay.far = 3; _gdRay.firstHitOnly = true; const h = _gdRay.intersectObjects(worldMeshes, false)[0]; _gdRay.firstHitOnly = false;
  let ok = false, at = null;
  if (h && h.face) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.y > 0.7 || (k === 'alarm' && Math.abs(n.y) < 0.3)) { ok = true; at = h.point.clone().addScaledVector(n, 0.005); } }
  if (!gdGhost) { gdGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.25, depthWrite: false })); scene.add(gdGhost); }
  const sz = { beartrap: [0.45, 0.05, 0.45], wire: [2.4, 0.5, 0.5], shield: [1.05, 1.05, 0.07], alarm: [0.12, 0.08, 0.1], claymore: [0.25, 0.2, 0.1] }[k] || [0.3, 0.3, 0.3];
  gdGhost.visible = ok && P.alive && !matchFrozen(); if (gdGhost.visible) { gdGhost.position.copy(at).setY(at.y + sz[1] / 2); gdGhost.rotation.y = P.yaw; gdGhost.scale.set(sz[0], sz[1], sz[2]); }
  if (ok && mouse.left && P.semiReady && P.switchT <= 0 && S.locked) {
    P.semiReady = false;
    const id = explSeq++, team = S.mode === 'online' ? S.team[S.myId] : 'b';
    gadgetAdd(S.myIdOr0(), id, k, at, P.yaw, team); P.c4N--; noiseHit(420, 0.08, 0.06);
    if (S.mode === 'online') net.send({ t: 'x', a: 'gd', k, i: id, p: at.toArray().map(r3), f: r3(P.yaw), c: team === 'r' ? 1 : 2 });
  }
}
function gadgetGhostOff() { if (gdGhost) gdGhost.visible = false; }

// ---- what the gadgets do (each player works out what happens to themselves)
function updateGadgets(dt) {
  const my = S.mode === 'online' ? S.team[S.myId] : null, now = performance.now();
  for (const o of GD.slice()) {
    o.t += dt; o.cd -= dt;
    if (o.k === 'alarm' && o.g.userData.led) o.g.userData.led.visible = (now / 500 | 0) % 2 === 0;
    if (o.marker) { o.mt -= dt; if (o.mt <= 0) { sgDisposeMarker(o.marker); o.marker = null; } }
    const enemy = P.alive && !P.downed && my && o.team && o.team !== my;
    if (!enemy || o.sprung) continue;
    const dx = P.pos.x - o.p.x, dz = P.pos.z - o.p.z, dy = P.pos.y - o.p.y;
    if (o.k === 'beartrap' && dx * dx + dz * dz < 0.16 && Math.abs(dy) < 0.5) {
      o.sprung = true; gdSnap(o); P.trapped = { p: o.p.clone(), t: 4.5 };
      const an = P.anat; an.pain = Math.min(100, (an.pain || 0) + 45); an.blood -= 220; hurtFlash(); screenBlood(0.8);
      flashMsg('CAUGHT IN A BEAR TRAP', 2000);
      net.send({ t: 'x', a: 'gdx', k: 'snap', i: o.id, tg: o.owner });
    } else if (o.k === 'wire') {
      // in the wire: an oriented 2.4 x 0.7 m strip
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw), u = dx * c - dz * s, v = dx * s + dz * c;
      if (Math.abs(u) < 1.25 && Math.abs(v) < 0.4 && Math.abs(dy) < 0.6) {
        P.inWire = true;
        if (o.cd <= 0) { o.cd = 0.6; noiseHit(3000, 0.15, 0.05); P.anat.pain = Math.min(100, (P.anat.pain || 0) + 3); P.anat.blood -= 12; net.send({ t: 'x', a: 'gdx', k: 'rustle', i: o.id, tg: o.owner }); }
      }
    } else if (o.k === 'alarm' && dx * dx + dz * dz + dy * dy < 16 && o.cd <= 0) {
      o.cd = 3; gdAlarm(o, P.pos); net.send({ t: 'x', a: 'gdx', k: 'alarm', i: o.id, tg: o.owner, p: P.pos.toArray().map(r3) });
    } else if (o.k === 'claymore' && o.t > 1.5) {
      // in front of it, close, in its line: it goes off (the one who set it off sends the blast)
      const f = _gdV.set(-Math.sin(o.yaw), 0, -Math.cos(o.yaw)), d = Math.hypot(dx, dz);
      if (d < 2.7 && Math.abs(dy) < 1.2 && (dx * f.x + dz * f.z) / Math.max(d, 1e-3) > 0.6) {
        o.sprung = true; const p = o.p.clone().setY(o.p.y + 0.15);
        net.send({ t: 'x', a: 'boom', k: 'claymore', i: o.id, tg: o.owner, p: p.toArray().map(r3) });
        gadgetRemove(o); explode(p, 'claymore', o.owner, true);
      }
    }
  }
  // held by a trap: you can't move off it till it lets go
  if (P.trapped) { P.trapped.t -= dt; P.pos.x = P.trapped.p.x; P.pos.z = P.trapped.p.z; P.vel.x = 0; P.vel.z = 0; if (P.trapped.t <= 0 || !P.alive) P.trapped = null; }
  // smoke clouds: grow, hang, thin out
  for (let i = SMOKES.length - 1; i >= 0; i--) {
    const s = SMOKES[i]; s.t += dt; const grow = clamp(s.t / 3, 0, 1), fade = clamp((22 - s.t) / 4, 0, 1);
    for (const p of s.parts) { p.s.position.addScaledVector(p.v, dt * (1 - grow * 0.8)); const sc = (0.8 + 3.2 * grow) * p.k; p.s.scale.set(sc, sc, 1); p.s.material.opacity = 0.82 * fade; }
    if (s.t > 22) { s.g.removeFromParent(); for (const p of s.parts) p.s.material.dispose(); SMOKES.splice(i, 1); }
  }
}
// the wire slows you through it (called after the move: most of it is taken back)
function wireDrag(prev) { if (!P.inWire) return; P.inWire = false; P.pos.x = lerp(P.pos.x, prev.x, 0.62); P.pos.z = lerp(P.pos.z, prev.z, 0.62); }
function gdSnap(o) { if (o.g && o.g.userData.jaws) o.g.userData.jaws.forEach((j, i) => { j.rotation.x = (i ? 1 : -1) * 1.35; }); noiseHit(900, 0.12, 0.25); }
function gdAlarm(o, at) {
  const d = camera.position.distanceTo(o.p); for (let k = 0; k < 4; k++) setTimeout(() => blip(2400, 0.12, 0.12 / (1 + d * 0.08), 'square'), k * 180);
  // the defenders see where it went off (and who set it off), for a few seconds
  if (S.team[S.myId] === DEF_TEAM && at) { if (o.marker) sgDisposeMarker(o.marker); o.marker = sgMarker('!', '#ff6a5a'); o.marker.position.copy(at).setY(at.y + 1.9); o.mt = 4; }
}
// what someone else did with theirs
function gadgetRx(m) {
  const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (m.a === 'gd' && ok(m.p) && GADGETS[m.k] && GADGETS[m.k].slot === 2 && m.k !== 'c4') gadgetAdd(m.id, m.i, m.k, new V3().fromArray(m.p), Number(m.f) || 0, m.c === 1 ? 'r' : 'b');
  else if (m.a === 'gdx') {
    const o = GD.find(x => x.key === gdKey(m.tg, m.i)); if (!o) return;
    if (m.k === 'snap') { o.sprung = true; gdSnap(o); }
    else if (m.k === 'alarm') gdAlarm(o, ok(m.p) ? new V3().fromArray(m.p) : o.p);
    else if (m.k === 'rustle') noiseHit(3000, 0.15, 0.05 / (1 + camera.position.distanceTo(o.p) * 0.2));
  }
}

// ---- smoke and flash
const SMOKE_TEX = canvasTex((g, s) => { const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(225,225,222,1)'); gr.addColorStop(0.5, 'rgba(210,210,208,0.7)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
function smokeCloud(p) {
  const g = new THREE.Group(); scene.add(g); const parts = [];
  for (let i = 0; i < 34; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE_TEX, color: 0xbfc0bd, transparent: true, opacity: 0, depthWrite: false }));
    s.position.copy(p).add(new V3(rnd(-0.3, 0.3), rnd(0.1, 0.6), rnd(-0.3, 0.3))); g.add(s);
    parts.push({ s, v: new V3(rnd(-1.1, 1.1), rnd(0.05, 0.5), rnd(-1.1, 1.1)), k: rnd(0.7, 1.3) });
  }
  SMOKES.push({ g, parts, t: 0 }); noiseHit(300, 0.8, 0.08);
}
function flashBang(p) {
  boomLight.position.copy(p); boomLight.intensity = 400; boomL = 1; noiseHit(180, 0.4, 0.5);
  if (!S.mode || !P.alive) return;
  const eye = camera.position, d = eye.distanceTo(p); if (d > 22) return;
  const seen = los(p, eye), look = camera.getWorldDirection(new V3()).dot(_gdV.copy(p).sub(eye).normalize());
  const k = clamp(1 - d / 22, 0, 1) * (seen ? (look > 0.3 ? 1 : 0.45) : 0.15);
  if (k <= 0.05) return;
  const el = $('flashw'); el.style.transition = 'none'; el.style.opacity = String(clamp(k * 1.4, 0, 1));
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'opacity ' + (1.2 + k * 4).toFixed(1) + 's ease-in'; el.style.opacity = '0'; }));
  deafen(k);
}

// ---- module exports: build.mjs strips this block ----
export { GADGETS, GD, clearGadgets, flashBang, gadgetAdd, gadgetBlast, gadgetGhostOff, gadgetRemove, gadgetRx, gdKey, smokeCloud, updateGadget, updateGadgets, wireDrag };
// ---- end module exports ----
