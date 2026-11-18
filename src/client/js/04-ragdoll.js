// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, clamp, rnd, scene } from './00-setup.js';
import { colliders, mat } from './01-world.js';
import { Body, HUM_DEFAULT, attachSkin, mergeTree, sph, vcMat } from './02-body-parts.js';
import { chunkCopy, chunkIslands, headCrater } from './02b-chunks.js';
import { WEAPONS } from './06-weapons.js';
import { ATT_DEFAULT } from './09-attachments.js';
import { noiseHit } from './10-audio.js';
import { decals, puff, splatGeo } from './11-fx.js';
import { bmat } from './12-blood.js';
import { addStump, bloodFx, clipGroup, copySegment, feedPool, floorAt, goreBurst, holeInGroup, liquidBlood, setSoak, soakMesh, spawnDrop, tearMesh, trimDecals } from './14-wounds.js';
import { gridOpenW, pick } from './15-destruction.js';
import { addProp } from './16-ballistics.js';
import { P, S, dummies } from './17-dummies.js';
import { spawnItem } from './21-items-inventory.js';
// ---- end module links ----
// ---------------------------------------------------------------- ragdoll (verlet with anatomical joint limits)
const RAG_BONES = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14]];
const RAG_TORSO = [[3, 6], [9, 12], [1, 3], [1, 6], [2, 9], [2, 12], [3, 2], [6, 2], [1, 9], [1, 12], [3, 9], [6, 12], [3, 12], [6, 9],
  [15, 1], [15, 2], [15, 3], [15, 6], [15, 9], [15, 12]];
// rough segment masses (kg): heavy trunk, light hands and feet, so limbs swing around the body instead of dragging it
const RAG_MASS = [5, 16, 12, 3, 2, 0.7, 3, 2, 0.7, 9, 4, 1.3, 9, 4, 1.3, 10];
const RAG_RAD = [0.11, 0.1, 0.1, 0.08, 0.06, 0.05, 0.08, 0.06, 0.05, 0.08, 0.07, 0.06, 0.08, 0.07, 0.06, 0.1];
// limb segments in order; bit i of the broken/lost masks refers to segment i
const RAG_LIMBS = [[3, 4, 'upperArm'], [4, 5, 'forearm'], [6, 7, 'upperArm'], [7, 8, 'forearm'], [9, 10, 'thigh'], [10, 11, 'shin'], [12, 13, 'thigh'], [13, 14, 'shin']];
const LIMB_IDX = { 1: 0, 2: 0, 4: 1, 8: 1, 16: 2, 32: 2, 64: 3, 128: 3 };
const LOST_SEGS = { 1: [0, 1], 2: [1], 4: [2, 3], 8: [3], 16: [4, 5], 32: [5], 64: [6, 7], 128: [7] };
const PART_IDX = { head: 0, torso: 1, arm: 7, leg: 10 };
const RAG_FRAME_SEG = { shL: 0, elL: 1, shR: 2, elR: 3, lgL: 4, knL: 5, lgR: 6, knR: 7 };
const ragdolls = [];
const _a = new V3(), _b = new V3(), _c = new V3(), _m4 = new THREE.Matrix4(), _Y = new V3(0, 1, 0), _rq = new THREE.Quaternion(), _fa = new V3(), _fb = new V3(), _fc = new V3();
const fiberMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.45, side: THREE.DoubleSide }), fiberMat2 = new THREE.MeshStandardMaterial({ color: 0x7a3a38, roughness: 0.6, side: THREE.DoubleSide });
const _rf = new V3(), _ru = new V3(), _rs = new V3(), _rt = new V3(), _rd = new V3();
class Ragdoll {
  constructor(pts, pal, vel, hitIdx, dir, power, masks) {
    masks = masks || {}; this.anchors = [];
    const broken = masks.bb || 0, lost = masks.ls || 0;
    this.p = pts.map(v => v.clone()); this.q = pts.map(v => v.clone());
    this.rad = RAG_RAD.slice();
    this.c = []; this.life = 0; this.acc = 0; this.pool = null; this.keep = !!masks.keep;
    // bleeding that carries on after death (ml/s at the start), and whether the body twitches for a few seconds as it dies
    this.bleedR = masks.bleed !== undefined ? masks.bleed : (masks.w && masks.w.length ? 12 + 7 * masks.w.length : 0); this.bledV = 0;
    this.twitch = masks.twitch || 0; this.actT = 0; this.actSeed = Math.random() * 50;
    const p = this.p, C = this.c;
    // a limb cut part-way keeps its first segment, clipped at the cut; everything past it is gone
    const hidden = new Set(), cutSeg = {}, lc = masks.lc || [];
    for (const bit in LOST_SEGS) if (lost & bit) LOST_SEGS[bit].forEach((i, k) => { const t = lc[LIMB_IDX[bit]]; if (k === 0 && t && !((broken >> i) & 1)) cutSeg[i] = t; else hidden.add(i); });
    this.cutSeg = cutSeg;
    // a fractured long bone gets an extra particle at the break so the limb folds there
    this.segs = RAG_LIMBS.map(([a, b, fn], i) => {
      const L = p[a].distanceTo(p[b]);
      if ((broken >> i) & 1) {
        const m = p.length; p.push(p[a].clone().lerp(p[b], 0.5)); this.q.push(p[m].clone()); this.rad.push(0.06);
        return { a, b, fn, L, mid: m, hidden: hidden.has(i), si: i };
      }
      return { a, b, fn, L, mid: -1, hidden: hidden.has(i), si: i };
    });
    const bones = [[0, 1], [1, 2]];
    for (const sg of this.segs) {
      if (sg.mid >= 0) { bones.push([sg.a, sg.mid], [sg.mid, sg.b]); C.push([sg.a, sg.b, sg.L * 0.45, 1]); }
      else bones.push([sg.a, sg.b]);
    }
    for (const [a, b] of bones.concat(RAG_TORSO)) C.push([a, b, p[a].distanceTo(p[b]), 0]);
    C.push([3, 5, 0.22, 1], [6, 8, 0.22, 1], [9, 11, 0.38, 1], [12, 14, 0.38, 1]);
    C.push([0, 2, p[0].distanceTo(p[2]) * 0.92, 1], [0, 3, p[0].distanceTo(p[3]) * 0.8, 1], [0, 6, p[0].distanceTo(p[6]) * 0.8, 1]);
    // muscle tone: soft springs that hold the pose the body went down in, fading as it goes limp. Someone collapsing alive keeps
    // tone for a couple of seconds and folds; someone killed outright is limp almost at once.
    for (const [a, b] of [[2, 11], [2, 14], [9, 11], [12, 14], [1, 5], [1, 8], [3, 5], [6, 8], [0, 2], [0, 3], [0, 6], [1, 10], [1, 13], [5, 8], [11, 14]]) if (p[a] && p[b]) C.push([a, b, p[a].distanceTo(p[b]), 2]);
    this.tone0 = masks.soft ? 0.018 : masks.keep ? 0.01 : 0.003; this.toneT = masks.soft ? 2.6 : masks.keep ? 1.6 : 0.5;
    this.im = p.map((_, i) => 1 / (RAG_MASS[i] || 2));
    const h = 1 / 120;
    const near = new Set([hitIdx]);
    for (const [a, b] of bones.concat(RAG_TORSO)) { if (a === hitIdx) near.add(b); if (b === hitIdx) near.add(a); }
    for (let i = 0; i < p.length; i++) {
      const v = vel.clone().addScaledVector(dir, power * 0.12);
      // a blast or a fall in mid-stride: the upper body and the legs start out moving differently
      if (masks.vTop && (i <= 8 || i === 15)) v.add(masks.vTop); if (masks.vLeg && i >= 9 && i <= 14) v.add(masks.vLeg);
      if (i === hitIdx) v.addScaledVector(dir, power); else if (near.has(i)) v.addScaledVector(dir, power * 0.4);
      v.x += (Math.random() - 0.5) * 0.3; v.z += (Math.random() - 0.5) * 0.3;
      this.q[i].addScaledVector(v, -h);
    }
    const pl = Object.assign({}, HUM_DEFAULT, pal); this.skin = pl.skin;
    const B = new Body(pl, (c, r, m) => mat(c, r, m));
    this.group = new THREE.Group(); this.group.userData.ragObj = this; scene.add(this.group);
    this.torso = new THREE.Group(); this.group.add(this.torso); this.torso.userData.rf = 'torso';
    B.pelvis(this.torso, -0.31); B.chest(this.torso, -0.24);
    this.headG = new THREE.Group(); this.group.add(this.headG); this.headG.userData.rf = 'head';
    B.head(this.headG, 0); B.human('neck', this.headG, -0.16);
    const limbCol = { upperArm: pl.shirt, forearm: pl.shirt, thigh: pl.pants, shin: pl.pants };
    this.limbs = [];
    for (const sg of this.segs) {
      if (sg.hidden) continue;
      if (sg.mid < 0) { const g = new THREE.Group(); this.group.add(g); sg.g = g; g.userData.rf = { seg: sg.si, dy: -sg.L / 2 }; B[sg.fn](g, sg.L / 2, sg.L, sg.si % 4 < 2 ? 'L' : 'R'); this.limbs.push({ g, a: sg.a, b: sg.b, seg: sg.si, top: sg.L / 2, bot: -sg.L / 2, first: true }); }
      else {
        // a broken bone: the same body segment (skin, clothes) built in each half and cut off at the break, the bone ends showing
        const r = sg.fn === 'thigh' ? 0.075 : sg.fn === 'shin' ? 0.055 : 0.048, hL = sg.L / 2, side = sg.si % 4 < 2 ? 'L' : 'R';
        const segName = { upperArm: 'sh', forearm: 'el', thigh: 'lg', shin: 'kn' }[sg.fn] + side;
        const halves = [];
        for (const [x, y, end] of [[sg.a, sg.mid, false], [sg.mid, sg.b, true]]) {
          const g = new THREE.Group(); this.group.add(g);
          const top = end ? hL / 2 + hL : hL / 2;
          B[sg.fn](g, top, sg.L, side);
          halves.push(B.segAt[segName]);
          (this.breakClip = this.breakClip || []).push([g, end ? hL / 2 : -hL / 2, end]);
          B.add(sph(r * 0.55), 0xd8cdb4, g, 0, end ? hL / 2 : -hL / 2, 0);   // the broken bone end
          B.add(sph(r * 0.8), 0x5a0606, g, 0, end ? hL / 2 - 0.005 : -hL / 2 + 0.005, 0, null, [1, 0.35, 1]);
          g.userData.rf = { seg: sg.si, dy: end ? -hL * 1.5 : -hL / 2 };
          this.limbs.push({ g, a: x, b: y, seg: sg.si, top: hL / 2, bot: -hL / 2, first: !end });
        }
        // what joins on above blends with the upper half, what joins on below with the lower half
        B.segAt[segName] = halves[0]; (this.lowerAt = this.lowerAt || {})[segName] = halves[1];
      }
    }
    if (masks.w) for (const w of masks.w) {
      const [g, dy] = this.frameGroup(w.frame, w.p.y); if (!g) continue;
      const m = new THREE.Object3D(); m.position.copy(w.p).addScaledVector(w.n, 0.004); m.position.y += dy; m.userData.keep = true; g.add(m);
      this.anchors.push({ m, n: w.n.clone() });
      if (w.st && w.st.isMesh) { const sk = soakMesh(g, w.p.clone().setY(w.p.y + dy), w.n, w.st.scale.x); this.soaks = this.soaks || []; this.soaks.push([sk, w.grow]); }
      (this.liq = this.liq || []).push([w.frame, w.p.clone().setY(w.p.y + dy), w.n.clone(), w.tear, w.p.y]);
    }
    if (masks.nh) this.group.traverse(o => { if (o.userData.armor === 'helmet') o.visible = false; });
    mergeTree(this.group, vcMat); attachSkin(this.group, B.segAt);
    if (this.lowerAt) for (const l of this.limbs) {
      // the next segment down a broken limb follows the lower half
      const nm = { 0: 'shL', 2: 'shR', 4: 'lgL', 6: 'lgR' }[l.seg - 1];
      if (nm && this.lowerAt[nm]) { const at = Object.assign({}, B.segAt, { [nm]: this.lowerAt[nm] }); l.g.traverse(o => { if (o._skin) o._skin.at = at; }); }
    }
    if (this.breakClip) for (const [g, y, below] of this.breakClip) clipGroup(g, y, below);
    this.group.traverse(o => { if (o.isMesh) o.userData.rag = this; });
    if (masks.h && masks.h.length) this.group.userData.wounded = true;   // (its clothes stay put over the blood: see ClothSim)
    if (masks.h) for (const h of masks.h) { const [g, dy] = this.frameGroup(h.frame, h.p.y + h.d.y * h.len * 0.5); if (g) holeInGroup(g, h.p.clone().setY(h.p.y + dy), h.d, h.len, h.r0, h.r1, h.sk); }
    this.lostMask = lost; this.sync(); this.group.updateMatrixWorld(true);
    for (const i of hidden) if ((i % 2 === 0 || !hidden.has(i - 1)) && !cutSeg[i - (i % 2)] && !(i % 2 && cutSeg[i - 1])) this.stump(i);
    for (const i in cutSeg) this.cutAt(+i, cutSeg[i]);
    // the wet patch round each wound now; the runs only once the body has come to rest, so they run the way it lies
    if (this.liq) { this.group.updateMatrixWorld(true); this.runsTodo = []; for (const [fr, lp, n, tear, fy] of this.liq) { const [g] = this.frameGroup(fr, fy); if (g) { if (tear) tearMesh(g, lp, n, tear, 0, 0); else liquidBlood(g, lp, n, 0.022, 5, 0); this.runsTodo.push([g, lp, n, tear ? clamp(tear * 0.32, 0.04, 0.13) : 0.022, tear ? 2 : 1]); } } this.liq = null; }
    if (masks.tear && !masks.gib) { this.sync(); this.group.updateMatrixWorld(true); this.tearNeck(dir || new V3(0, 0, 1)); }
    this.sync();
  }
  // which piece of the ragdoll stands for a skeleton frame, and the y offset from frame coordinates to that piece
  frameGroup(fr, y) {
    if (fr === 'spine') return [this.torso, -0.24]; if (fr === 'hips') return [this.torso, -0.31]; if (fr === 'head') return [this.headG, -0.1]; if (fr === 'neck') return [this.headG, -0.16];
    const sg = this.segs[RAG_FRAME_SEG[fr]]; if (!sg || sg.hidden) return [null, 0]; if (sg.g) return [sg.g, sg.L / 2];
    // a limb drawn as two pieces: pick the half the point falls in (frame y runs from 0 at the joint down to -L)
    const hL = sg.L / 2, end = y !== undefined && y < -hL, l = this.limbs.find(l => l.seg === sg.si && l.first === !end);
    return l ? [l.g, end ? hL * 1.5 : hL / 2] : [null, 0];
  }
  // bone-and-flesh stump on whatever segment si was attached to
  stump(si) {
    const r = si < 4 ? (si % 2 ? 0.04 : 0.05) : (si % 2 ? 0.055 : 0.075);
    if (si % 2 === 0) { const lp = this.torso.worldToLocal(this.p[RAG_LIMBS[si][0]].clone()), n = si < 4 ? new V3(Math.sign(lp.x), -0.4, 0).normalize() : new V3(0, -1, 0); addStump(this.torso, lp, n, r); const a = new THREE.Object3D(); a.position.copy(lp); this.torso.add(a); this.anchors.push({ m: a, n }); this.bleedR += 25; }
    else { let par = null; for (const l of this.limbs) if (l.seg === si - 1) par = l; if (par) { addStump(par.g, new V3(0, par.bot, 0), new V3(0, -1, 0), r); const a = new THREE.Object3D(); a.position.set(0, par.bot, 0); par.g.add(a); this.anchors.push({ m: a, n: new V3(0, -1, 0) }); this.bleedR += 15; } }
  }
  // the head blown apart: the vault of the skull goes (out the far side where the load left, and over the top), the face and
  // jaw stay on the neck, and what is left open is the solid crater wound. A helmet on it is thrown clear. quiet: the burst of
  // gore was already thrown by whoever called (a body that died this way)
  gibHead(dir, quiet) {
    if (this.headBlown || this.headGone || !this.headG.visible) return;
    this.headBlown = true; dir = (dir || new V3(0, 0, 1)).clone().normalize();
    this.group.updateMatrixWorld(true);
    const hg = this.headG, c = hg.localToWorld(new V3(0, 0, -0.02)), up = hg.localToWorld(new V3(0, 1, 0)).sub(hg.getWorldPosition(new V3())).normalize();
    const side = dir.clone().addScaledVector(up, -dir.dot(up)); if (side.lengthSq() < 0.01) side.copy(dir); side.normalize();
    throwHelmet(this.group, hg, dir);
    this.group.userData.chunkHold = true;
    headCrater(this.group, c.clone().addScaledVector(side, 0.06).addScaledVector(up, 0.035), 0.1, dir, this.skin, true);
    headCrater(this.group, c.clone().addScaledVector(up, 0.085).addScaledVector(side, -0.015), 0.095, dir, this.skin, true);
    this.group.userData.chunkHold = false; chunkIslands(this.group, dir);
    const st = new THREE.Object3D(); st.position.set(0, 0.03, -0.02); hg.add(st); this.anchors.push({ m: st, n: up.clone().transformDirection(new THREE.Matrix4().copy(hg.matrixWorld).invert()) });
    this.bleedR += 70; this.twitch = Math.max(this.twitch, 3); this.asleep = false;
    if (!quiet) goreBurst(c, dir, this.skin);
  }
  // ---------------------------------------------------------------- neck torn through: the head hangs on by strands of muscle and skin
  tearNeck(dir) {
    if (this.neckTorn || this.headGone || this.headBlown || !this.headG.visible) return;
    this.neckTorn = true; this.neckTw = rnd(-0.6, 0.6);
    // the skin and clothes stop pulling across the tear: what is on the trunk (the collar) lets go of the neck and head, what
    // is on the head and neck lets go of the trunk, so nothing stretches out into a long cone after the swinging head
    this.group.traverse(o => { if (!o._skin) return; let onHead = false; for (let q = o.parent; q && q !== this.group; q = q.parent) if (q === this.headG) onHead = true;
      o._skin.cut = onHead ? { 0: 1, 1: 1, 4: 1, 6: 1, 12: 1, 13: 1, 14: 1, 15: 1 } : { 2: 1, 3: 1 }; });
    const hp = this.headG.getWorldPosition(new V3());
    // the neck no longer holds the head up: the head-to-chest link becomes a slack rope, the other head links go
    // (keeping the links that only stop the head sinking into the shoulders)
    this.c = this.c.filter(([a, b, rest, mode]) => !(a === 0 || b === 0) || mode === 1 || (mode === 0 && (a + b === 1)));
    for (const c of this.c) if (c[3] === 0 && ((c[0] === 0 && c[1] === 1) || (c[0] === 1 && c[1] === 0))) { this.c.push([0, 1, c[2] * 0.95, 1]); c[2] *= 1.5; c[3] = 3; break; }
    addStump(this.torso, new V3(0, 0.3, 0), new V3(0, 1, 0), 0.046, 'neck'); addStump(this.headG, new V3(0, -0.17, 0), new V3(0, -1, 0), 0.042, 'neck');
    const st = new THREE.Object3D(); st.position.set(0, 0.31, 0); this.torso.add(st); this.anchors.push({ m: st, n: new V3(0, 1, 0) });
    const sh = new THREE.Object3D(); sh.position.set(0, -0.18, 0); this.headG.add(sh); this.anchors.push({ m: sh, n: new V3(0, -1, 0) });
    this.bleedR += 60; this.twitch = Math.max(this.twitch, 2.5); this.asleep = false;
    // a few strands: front of the neck (skin and the strap muscles hold longest), and the sides
    this.fibers = [];
    const geo = new THREE.CylinderGeometry(1, 0.8, 1, 5, 1, true);
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + rnd(-0.3, 0.3), r = rnd(0.012, 0.03), front = Math.cos(ang) < 0 ? 1 : 0;
      const a = new V3(Math.sin(ang) * r, 0.3, Math.cos(ang) * r), b = new V3(Math.sin(ang) * r * 0.9, -0.17, Math.cos(ang) * r * 0.9);
      const m = new THREE.Mesh(geo, i % 3 ? fiberMat : fiberMat2); m.userData.keep = true; m.userData.rag = this; scene.add(m);
      this.fibers.push({ m, a, b, w: rnd(0.0025, 0.0055) * (front ? 1.3 : 1), hp: front ? 2 : 1 });
    }
    for (let i = 0; i < 2; i++) bloodFx(hp.clone().add(new V3(rnd(-0.03, 0.03), -0.12, rnd(-0.03, 0.03))), dir.clone().normalize(), true);
    noiseHit(260, 0.22, 0.1);
    this.syncFibers();
  }
  syncFibers() {
    if (!this.fibers) return;
    for (const f of this.fibers) {
      const A = this.torso.localToWorld(_fa.copy(f.a)), Bw = this.headG.localToWorld(_fb.copy(f.b)), L = A.distanceTo(Bw) || 1e-3;
      f.m.position.addVectors(A, Bw).multiplyScalar(0.5); f.m.quaternion.setFromUnitVectors(_Y, _fc.subVectors(A, Bw).multiplyScalar(1 / L));
      // stretched strands thin out
      const th = f.w * clamp(0.22 / L, 0.35, 1.2); f.m.scale.set(th, L, th);
    }
  }
  // a hit near the strands parts some of them; when too few are left the head drops free
  cutFibers(point, n) {
    if (!this.fibers || this.headGone) return;
    const byD = this.fibers.map(f => [f, this.torso.localToWorld(f.a.clone()).lerp(this.headG.localToWorld(f.b.clone()), 0.5).distanceTo(point)]).sort((x, y) => x[1] - y[1]);
    for (const [f] of byD.slice(0, n)) { f.hp--; if (f.hp <= 0) { f.m.removeFromParent(); f.dead = true; } }
    this.fibers = this.fibers.filter(f => !f.dead);
    if (this.fibers.length <= 1) this.dropHead(point);
  }
  dropHead(point) {
    if (this.headGone) return;
    this.headGone = true;
    for (const f of this.fibers || []) f.m.removeFromParent(); this.fibers = null;
    this.anchors = this.anchors.filter(a => a.m.parent !== this.headG);
    this.c = this.c.filter(([a, b]) => a !== 0 && b !== 0);
    const h = this.headG; scene.attach(h); h.traverse(o => { if (o.isMesh) o.userData.rag = null; });
    const v = new V3().subVectors(this.p[0], this.q[0]).multiplyScalar(120);
    addProp(h, v.add(new V3(rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4))), new V3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), 0.1, 'head', 90);
    this.headG = new THREE.Group(); this.headG.visible = false; this.group.add(this.headG);
    for (let i = 0; i < 2; i++) bloodFx((point || this.torso.localToWorld(new V3(0, 0.33, 0))).clone(), new V3(rnd(-0.5, 0.5), rnd(0.2, 1), rnd(-0.5, 0.5)).normalize(), true);
    this.bleedR += 40; this.asleep = false; noiseHit(300, 0.2, 0.08);
  }
  // clip segment si at fraction t from its top, with a stump on the end that stays; returns the cut height
  cutAt(si, t) {
    const l = this.limbs.find(x => x.seg === si && x.first); if (!l) return null;
    const y = l.top - t * (l.top - l.bot);
    clipGroup(l.g, y);
    if (l.stumpM) l.stumpM.removeFromParent();
    l.stumpM = addStump(l.g, new V3(0, y, 0), new V3(0, -1, 0), si < 4 ? (si % 2 ? 0.036 : 0.044) : (si % 2 ? 0.05 : 0.064));
    return { l, y };
  }
  // limbs shot off after the body is already down: the pieces come away as their own objects
  applyLost(mask, dir, cuts) {
    const neu = mask & ~this.lostMask; if (!neu) return; this.lostMask |= mask; dir = dir || new V3(0, 0, 1);
    for (const bit in LOST_SEGS) if (neu & bit) {
      const segs = LOST_SEGS[bit]; if (!this.limbs.some(l => l.seg === segs[0])) continue;
      const t = cuts ? cuts[LIMB_IDX[bit]] : 0, l0 = this.limbs.find(x => x.seg === segs[0]);
      if (t && l0 && l0.first && !this.limbs.some(x => x.seg === segs[0] && !x.first)) {
        // part-way: the near end stays on, a copy of the far end flies off
        const c = this.cutAt(segs[0], t), piece = copySegment(c.l.g);
        clipGroup(piece, c.y, true); addStump(piece, new V3(0, c.y, 0), new V3(0, 1, 0), segs[0] < 4 ? 0.04 : 0.06);
        scene.add(piece); addProp(piece, dir.clone().multiplyScalar(rnd(0.6, 1.6)).add(new V3(rnd(-0.6, 0.6), rnd(0.4, 1.2), rnd(-0.6, 0.6))), new V3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), segs[0] < 4 ? 0.05 : 0.07, 'limb', 60);
        const at = c.l.g.localToWorld(new V3(0, c.y, 0));
        for (let i = this.limbs.length - 1; i >= 0; i--) { const l = this.limbs[i]; if (!segs.slice(1).includes(l.seg)) continue; this.limbs.splice(i, 1); scene.attach(l.g); detachSkin(l.g); l.g.traverse(o => { if (o.isMesh) o.userData.rag = null; }); addProp(l.g, dir.clone().multiplyScalar(rnd(0.6, 1.6)).add(new V3(rnd(-0.6, 0.6), rnd(0.4, 1.2), rnd(-0.6, 0.6))), new V3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), l.seg < 4 ? 0.05 : 0.07, 'limb', 60); }
        for (let i = 0; i < 3; i++) bloodFx(at.clone().add(new V3(rnd(-0.03, 0.03), rnd(-0.03, 0.03), rnd(-0.03, 0.03))), dir.clone().add(new V3(rnd(-0.5, 0.5), rnd(0, 0.4), rnd(-0.5, 0.5))).normalize(), true);
        noiseHit(300, 0.25, 0.12);
        continue;
      }
      this.stump(segs[0]);
      const at = this.p[RAG_LIMBS[segs[0]][0]].clone();
      for (let i = this.limbs.length - 1; i >= 0; i--) {
        const l = this.limbs[i]; if (!segs.includes(l.seg)) continue;
        this.limbs.splice(i, 1); scene.attach(l.g); detachSkin(l.g);
        if (l.seg === segs[0] && l.first) addStump(l.g, new V3(0, l.top, 0), new V3(0, 1, 0), l.seg < 4 ? 0.045 : 0.065);
        l.g.traverse(o => { if (o.isMesh) { o.userData.rag = null; } });
        addProp(l.g, dir.clone().multiplyScalar(rnd(0.6, 1.6)).add(new V3(rnd(-0.6, 0.6), rnd(0.4, 1.2), rnd(-0.6, 0.6))), new V3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), l.seg < 4 ? 0.05 : 0.07, 'limb', 60);
      }
      for (let i = 0; i < 3; i++) bloodFx(at.clone().add(new V3(rnd(-0.05, 0.05), rnd(-0.05, 0.05), rnd(-0.05, 0.05))), dir.clone().add(new V3(rnd(-0.5, 0.5), rnd(0, 0.6), rnd(-0.5, 0.5))).normalize(), true);
      noiseHit(300, 0.25, 0.12);
    }
  }
  limits() {
    // anatomical joint limits relative to the torso frame; every correction is shared by the two joints involved, so limits
    // never push the whole body around
    const p = this.p;
    _ru.subVectors(p[1], p[2]).normalize();
    _rs.subVectors(p[6], p[3]); _rs.addScaledVector(_ru, -_rs.dot(_ru)).normalize();
    _rf.crossVectors(_ru, _rs);
    if (!(_ru.lengthSq() > 0.5) || !(_rs.lengthSq() > 0.5)) return;   // torso frame degenerate (a body folded flat): no limits this step
    // each correction is capped: a limit only ever eases a joint back, a big snap would turn into speed and fling the body
    const push = (A, B, dir, k) => { k = clamp(k, -0.012, 0.012); p[B].addScaledVector(dir, k * 0.5); p[A].addScaledVector(dir, -k * 0.5); };
    // knee: a hinge. The shin swings only behind the thigh, about the hips' side-to-side axis, and barely sideways
    const knee = (H, K, F) => {
      _rt.subVectors(p[K], p[H]).normalize(); _rd.subVectors(p[F], p[K]);
      const ax = _rs.clone().addScaledVector(_rt, -_rs.dot(_rt)).normalize(), fw = _rf.clone().addScaledVector(_rt, -_rf.dot(_rt)).normalize();
      const L = _rd.length(), perp = _rd.clone().addScaledVector(_rt, -_rd.dot(_rt));
      const f = perp.dot(fw); if (f > 0.004) push(K, F, fw, -f);
      const sd = perp.dot(ax), lim = 0.12 * L; if (Math.abs(sd) > lim) push(K, F, ax, -(sd - Math.sign(sd) * lim));
    };
    // hip: about 30 degrees back, about 120 forward, about 45 out to the side, a little across the other leg
    const hip = (H, K, side) => {
      _rt.subVectors(p[K], p[H]); const L = _rt.length(); _rt.multiplyScalar(1 / L);
      const back = _rt.dot(_rf); if (back < -0.5) push(H, K, _rf, (-0.5 - back) * L);
      const up = _rt.dot(_ru); if (up > 0.45) push(H, K, _ru, -(up - 0.45) * L);
      const out = _rt.dot(_rs) * side; if (out > 0.72) push(H, K, _rs, -(out - 0.72) * L * side); if (out < -0.3) push(H, K, _rs, (-0.3 - out) * L * side);
    };
    // elbow: never bends backwards past straight, and folds toward the front of the upper arm
    const elbow = (S, E, Hn) => {
      _rt.subVectors(p[E], p[S]).normalize(); _rd.subVectors(p[Hn], p[E]);
      const perp = _rd.clone().addScaledVector(_rt, -_rd.dot(_rt));
      const bk = perp.dot(_rf); if (bk < -0.01 && _rt.dot(_ru) < 0.3) push(E, Hn, _rf, -bk);
    };
    // shoulder: the upper arm cannot go through the chest, or far behind the back
    const shoulder = (S, E, side) => {
      _rt.subVectors(p[E], p[S]); const L = _rt.length(); _rt.multiplyScalar(1 / L);
      const inn = -_rt.dot(_rs) * side, fwd = _rt.dot(_rf);
      if (inn > 0.35 && fwd < 0.35) push(S, E, _rs, (inn - 0.35) * L * side);
      if (fwd < -0.75) push(S, E, _rf, (-0.75 - fwd) * L);
    };
    knee(9, 10, 11); knee(12, 13, 14); hip(9, 10, -1); hip(12, 13, 1); elbow(3, 4, 5); elbow(6, 7, 8); shoulder(3, 4, -1); shoulder(6, 7, 1);
    // neck: the head stays above the shoulders' side of the torso axis and tips at most about 70 degrees any way
    _rt.subVectors(p[0], p[1]); const hl = _rt.length(), hu = _rt.dot(_ru) / (hl || 1);
    if (hu < 0.34 && !this.neckTorn) { const k = Math.min(0.012, (0.34 - hu) * hl); p[0].addScaledVector(_ru, k * 0.6); p[1].addScaledVector(_ru, -k * 0.4); }
  }
  step(h) {
    // speed cap: 12 m/s just after a hit (a shove from a round can be violent), otherwise 6 m/s, which a falling body never needs to beat
    const p = this.p, q = this.q, g = 9.8 * h * h, dmp = this.life < 1.2 ? 0.988 : 0.975, vmax = this.life < 0.25 || this.life - (this.kT || -9) < 0.2 ? 0.1 : 0.05;
    let mv = 0;
    for (let i = 0; i < p.length; i++) {
      const pi = p[i], qi = q[i];
      let dx = (pi.x - qi.x) * dmp, dy = (pi.y - qi.y) * dmp - g, dz = (pi.z - qi.z) * dmp;
      const dl = Math.hypot(dx, dy, dz); if (dl > vmax) { const k = vmax / dl; dx *= k; dy *= k; dz *= k; }   // nothing moves faster than 12 m/s
      if (dl > mv) mv = dl;
      qi.copy(pi); pi.set(pi.x + dx, pi.y + dy, pi.z + dz);
    }
    // lying still: go to sleep until something hits the body again
    this.still = mv < 0.0016 && this.life > 0.8 ? (this.still || 0) + 1 : 0;
    if (this.still > 50) { this.asleep = true; for (let i = 0; i < p.length; i++) q[i].copy(p[i]); if (this.runsTodo) { this.sync(); this.group.updateMatrixWorld(true); for (const [g, lp, n, R, k] of this.runsTodo) if (g.parent) liquidBlood(g, lp, n, R, 0, k); this.runsTodo = null; } return; }
    for (let it = 0; it < 10; it++) {
      const tone = this.tone0 * Math.exp(-this.life / this.toneT), im = this.im;
      for (const [a, b, rest, mode] of this.c) {
        const A = p[a], B = p[b];
        _a.subVectors(B, A); const d = _a.length() || 1e-6;
        if (mode === 1 && d >= rest) continue;
        if (mode === 3 && d <= rest) continue;   // a rope: only pulls when stretched
        let k = (d - rest) / d; if (mode === 2) { if (tone < 0.0004) continue; k *= tone; }
        const wa = im[a] / (im[a] + im[b]);
        A.addScaledVector(_a, k * wa); B.addScaledVector(_a, -k * (1 - wa));
      }
      if (it % 3 === 2) this.limits();
      if (it === 4 || it === 9) this.collide();
    }
  }
  collide() {
    const p = this.p, q = this.q;
    for (let i = 0; i < p.length; i++) {
      const r = this.rad[i], P = p[i], Q = q[i];
      if (P.y < r) { P.y = r; Q.y = r;   // landing kills the downward speed (the old max() kept it, and it piled up)
        const fk = this.fric || 0.45; Q.x = P.x - (P.x - Q.x) * fk; Q.z = P.z - (P.z - Q.z) * fk; }
      for (const c of colliders) {
        if (P.x > c.min.x - r && P.x < c.max.x + r && P.y > c.min.y - r && P.y < c.max.y + r && P.z > c.min.z - r && P.z < c.max.z + r && !(c.mesh && gridOpenW(c.mesh, P))) {
          const d = [P.x - (c.min.x - r), (c.max.x + r) - P.x, P.y - (c.min.y - r), (c.max.y + r) - P.y, P.z - (c.min.z - r), (c.max.z + r) - P.z];
          let k = 0; for (let j = 1; j < 6; j++) if (d[j] < d[k]) k = j;
          // pushed out along the shallowest side, and the speed along that side is zeroed: being pulled out of a wall or crate
          // must not turn into speed (that was the fling when a body fell against or into something)
          if (k === 0) P.x = c.min.x - r; else if (k === 1) P.x = c.max.x + r;
          else if (k === 2) P.y = c.min.y - r; else if (k === 3) { P.y = c.max.y + r; Q.x = P.x - (P.x - Q.x) * 0.5; Q.z = P.z - (P.z - Q.z) * 0.5; }
          else if (k === 4) P.z = c.min.z - r; else P.z = c.max.z + r;
          if (k < 2) Q.x = P.x; else if (k < 4) Q.y = P.y; else Q.z = P.z;   // and no speed is left into the surface
        }
      }
    }
  }
  kick(dir, power, idx) { const h = 1 / 120; const i = idx === undefined ? 1 : idx; this.q[i].addScaledVector(dir, -power * h); this.q[2].addScaledVector(dir, -power * 0.3 * h); this.life = Math.min(this.life, 4); this.kT = this.life; this.asleep = false; this.still = 0; }
  // ---------------------------------------------------------------- the body moving on its own
  // Writhing: someone down but awake rolls side to side, draws the knees up and holds the wound, weaker as the blood runs out.
  // Twitching: in the first seconds after a sudden death (brain, spine, a destroyed head) the limbs jerk at random.
  act(dt) {
    const own = this.owner, d = own && own.dummy, an = d && !d.dead && d.rag === this ? d.anat : null;
    // conscious and down: rolls around for a long while; knocked down by pain: thrashes for a few seconds, then passes out
    const writhe = an && an.blood > 2200 ? clamp((an.blood - 2200) / 2000, 0.25, 1) * (an.painDown ? Math.exp(-this.actT / 5) : Math.exp(-this.actT / 40)) : 0;
    const tw = this.twitch > 0 && this.life < this.twitch * 1.6 + 1 ? Math.exp(-this.life / Math.max(1, this.twitch * 1.1)) : 0;
    this.fric = writhe > 0.02 ? 0.82 : 0.45;   // a writhing body grips and slides less than a dead weight
    if (writhe <= 0.02 && tw <= 0.02) return false;
    this.actT += dt; const p = this.p, q = this.q, h = 1 / 120, t = this.actT + this.actSeed, push = (i, v) => { if (p[i]) q[i].addScaledVector(v, -h * dt * 14); };   // a steady push: about 14 x v per second of speed gained
    if (writhe > 0) {
      const up = _a.subVectors(p[1], p[2]).normalize(), side = _b.subVectors(p[6], p[3]).normalize(), roll = Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1);
      // rolling: shoulders and hips pushed the same way across the floor, the shoulder leading
      const rv = side.clone().multiplyScalar(roll * 0.9 * writhe).add(new V3(0, 0.25 * writhe * Math.max(0, roll), 0));
      push(3, rv); push(6, rv); push(1, rv.clone().multiplyScalar(0.6));
      if (!an.paralyzed && !an.bothLegs()) {
        // knees drawn up toward the belly, one then the other, and a slow kick out again
        for (const [k, f, s] of [[10, 11, 1], [13, 14, -1]]) { const pull = Math.max(0, Math.sin(t * 0.9 + s)) * writhe; const to = _c.subVectors(p[2], p[k]).normalize().multiplyScalar(pull * 0.8); push(k, to); push(f, to.clone().multiplyScalar(0.6)); }
      }
      // a hand goes to the newest wound and presses on it
      const a = this.anchors[this.anchors.length - 1];
      if (a && a.m.parent) { const w = a.m.getWorldPosition(new V3()); for (const hi of [5, 8]) { const dv = w.clone().sub(p[hi]); const L = dv.length(); if (L > 0.05) push(hi, dv.multiplyScalar(Math.min(1.4, L * 3) / L * writhe * (hi === 5 ? 1 : 0.6))); } }
      // the head lifts and drops
      push(0, up.clone().multiplyScalar(Math.sin(t * 2.1) * 0.35 * writhe));
    }
    if (tw > 0) {
      this.twN = (this.twN || 0) - dt;
      if (this.twN <= 0) {
        this.twN = rnd(0.06, 0.35) / (0.4 + tw);
        const i = pick([0, 4, 5, 7, 8, 10, 11, 13, 14]), v = new V3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).multiplyScalar(rnd(0.8, 2.2) * tw);
        if (p[i]) q[i].addScaledVector(v, -h);   // one jerk: the limb is suddenly moving at v
      }
    }
    this.asleep = false; this.still = 0; return true;
  }
  // a bleeding body shoved or dragged along the floor leaves a smear behind it
  dragTrail() {
    const t = this.p[1]; if (t.y > 0.35 || !(this.bledV > 1 || this.bleedR > 2)) { this.dragFrom = null; return; }
    if (!this.dragFrom) { this.dragFrom = t.clone(); return; }
    const d = Math.hypot(t.x - this.dragFrom.x, t.z - this.dragFrom.z); if (d < 0.3) return;
    const fy = floorAt(t.x, t.y, t.z), mk = new THREE.Mesh(splatGeo, bmat('smear'));
    mk.rotation.set(-Math.PI / 2, 0, Math.atan2(t.x - this.dragFrom.x, t.z - this.dragFrom.z) + Math.PI);
    mk.position.set((t.x + this.dragFrom.x) / 2, fy + 0.0035, (t.z + this.dragFrom.z) / 2); mk.scale.set(0.22, Math.min(1.2, d * 1.1), 1);
    mk.receiveShadow = true; scene.add(mk); decals.push(mk); trimDecals(); this.dragFrom.copy(t);
  }
  // blood that keeps coming after death: under each wound and stump, slowing over about half a minute, into pools
  bleed(dt) {
    const own = this.owner, alive = own && own.dummy && !own.dummy.dead && own.dummy.rag === this;
    if (alive || this.bleedR < 0.3 || !this.anchors.length || this.bledV > 4000) return;
    const r = this.bleedR; this.bleedR *= Math.exp(-dt / 60); this.bledV += r * dt;
    // the wounds keep spreading on the body for as long as it bleeds: a cut artery for a minute, a graze hardly at all
    this.wt = (this.wt || 0) + dt; this.wst = this.wst || 0;
    if (this.wst < 3 && this.wt > [4, 11, 24][this.wst] && r > 4) {
      for (const a of this.anchors.slice(-4)) if (a.m.parent && a.m.parent !== this.torso || a.m.parent && a.n.y < 0.9) liquidBlood(a.m.parent, a.m.position, a.n, clamp(0.02 + r * 0.0012 * (1 + this.wst), 0.02, 0.08), 3, 0, 0.004);
      this.wst++;
    }
    const per = r * dt / this.anchors.length, w = new V3(), n = new V3();
    for (const a of this.anchors) {
      if (!a.m.parent) continue; a.m.getWorldPosition(w); n.copy(a.n).transformDirection(a.m.parent.matrixWorld);
      const fy = floorAt(w.x, w.y, w.z);
      if (w.y - fy < 0.5) feedPool(w.x + n.x * 0.07, fy, w.z + n.z * 0.07, per);
      else { a.drip = (a.drip || 0) + dt * Math.min(6, 0.5 + r * 0.05); while (a.drip > 1) { a.drip--; spawnDrop(w, new V3(rnd(-0.05, 0.05), -0.1, rnd(-0.05, 0.05)), rnd(0.005, 0.008), 1, 0.6, per * 4); } }
    }
  }
  update(dt) {
    this.life += dt;
    const acting = this.act(dt);
    this.bleed(dt);
    this.dragTrail();
    // the body settles and then lies still (a new hit wakes it), so a first-person view from its head does not drift
    if ((this.life < 9 || acting) && !this.asleep) {
      this.acc += dt; let n = 0;
      while (this.acc >= 1 / 120 && n < 5) { this.step(1 / 120); this.acc -= 1 / 120; n++; }
      if (this.acc > 1 / 120) this.acc = 0;
      this.sync();
    }
    if (this.soaks) for (const s of this.soaks) if (s[0].scale.x < s[1]) setSoak(s[0], Math.min(s[1], s[0].scale.x + dt * 0.03));
  }
  sync() {
    const p = this.p;
    const up = _a.subVectors(p[1], p[2]).normalize();
    const side = _b.subVectors(p[6], p[3]); side.addScaledVector(up, -side.dot(up)).normalize();
    const back = _c.crossVectors(side, up);
    _m4.makeBasis(side, up, back);
    this.torso.quaternion.setFromRotationMatrix(_m4);
    this.torso.position.addVectors(p[1], p[2]).multiplyScalar(0.5);
    this.headG.position.copy(p[0]); this.headG.quaternion.copy(this.torso.quaternion);
    if (this.neckTorn && !this.headGone) {
      // a hanging head turns so the torn neck points back at the body
      const at = this.torso.localToWorld(_c.set(0, 0.3, 0)), d = _a.subVectors(p[0], at).normalize();
      this.headG.quaternion.setFromUnitVectors(_Y, d).multiply(_rq.setFromAxisAngle(_Y, this.neckTw || 0));
      this.syncFibers();
    }
    // each limb swings off the bone above it (torso for an upper arm or thigh) by the least rotation, so it keeps that bone's
    // twist: the skin and clothes blend between neighbouring bones and tear apart if their twists don't agree
    for (const l of this.limbs) {
      const A = p[l.a], B = p[l.b];
      l.g.position.addVectors(A, B).multiplyScalar(0.5);
      _a.subVectors(A, B).normalize();
      // it starts with the living body's own bone turn (twist included), then each step only swings it to where the bone points now
      if (l.q0) { l.g.quaternion.copy(l.q0); l.q0 = null; l.inc = true; }
      if (l.inc) { _b.copy(_Y).applyQuaternion(l.g.quaternion); l.g.quaternion.premultiply(_rq.setFromUnitVectors(_b, _a)); continue; }
      if (l.par === undefined) l.par = this.limbs.find(m => m.b === l.a && m !== l) || null;
      const pq = l.par ? l.par.g.quaternion : this.torso.quaternion;
      _b.copy(_Y).applyQuaternion(pq);
      l.g.quaternion.setFromUnitVectors(_b, _a).multiply(pq);
    }
  }
  tag(key, val) { this.group.traverse(o => { if (o.isMesh) o.userData[key] = val; }); }
  dispose() { if (this.fibers) for (const f of this.fibers) f.m.removeFromParent(); scene.remove(this.group); if (this.pool) scene.remove(this.pool); this.group.traverse(o => { if (o.isMesh && o.userData.holeN) o.material.dispose(); if (o.isMesh && o.material === vcMat) o.geometry.dispose(); }); }
}
function spawnRagdoll(hum, vel, dir, part, head, masks) {
  masks = Object.assign({ nh: !!hum.helmetOff, w: hum.wounds, h: hum.holes }, masks);
  if (masks.gib && hum.root.visible) {
    goreBurst(hum.headMark.getWorldPosition(new V3()), dir.clone().normalize(), hum.pal && hum.pal.skin);
  }
  const r = new Ragdoll(hum.capture(), hum.pal, vel || new V3(), part === 'arm' ? (Math.random() < 0.5 ? 4 : 7) : part === 'leg' ? (Math.random() < 0.5 ? 10 : 13) : PART_IDX[part] || 1, dir, masks.soft ? 0.25 : head ? 5.5 : 3, masks);
  { const BN = ['shL', 'elL', 'shR', 'elR', 'lgL', 'knL', 'lgR', 'knR']; for (const l of r.limbs) { const b = hum[BN[l.seg]]; if (b) l.q0 = b.getWorldQuaternion(new THREE.Quaternion()); } r.sync(); }
  chunkCopy(hum.root, r.group);
  if (masks.gib) r.gibHead(dir, true);
  chunkIslands(r.group, dir);
  ragdolls.push(r);
  while (ragdolls.length > 14) { const i = ragdolls.findIndex(x => !x.keep); if (i < 0) break; ragdolls.splice(i, 1)[0].dispose(); }
  // a dummy that goes down lets go of its weapon, which becomes an item on the ground
  const dm = hum.dummy;
  if (dm && !dm.unarmed && hum.root.visible && WEAPONS[hum.anim.weapon]) {
    dm.unarmed = true; const gp = hum.activeGun().g.getWorldPosition(new V3()), wi = hum.anim.weapon;
    spawnItem({ kind: 'gun', w: wi, mag: Math.floor(rnd(3, WEAPONS[wi].cap)), chamber: 1, att: Object.assign({}, ATT_DEFAULT[WEAPONS[wi].id]) }, gp, (vel || new V3()).clone().addScaledVector(dir, 1.2).add(new V3(rnd(-0.5, 0.5), 0.5, rnd(-0.5, 0.5))), true, 60);
  }
  return r;
}
function freeRag(r) { if (!r) return; const i = ragdolls.indexOf(r); if (i >= 0) ragdolls.splice(i, 1); r.dispose(); }
// a ragdoll's helmet thrown clear of a head that came apart under it
function throwHelmet(root, F, dir) {
  const ms = []; root.traverse(o => { if (o.userData.armor === 'helmet' && o.visible) ms.push(o); }); if (!ms.length) return;
  root.updateMatrixWorld(true); const g = new THREE.Group(); F.matrixWorld.decompose(g.position, g.quaternion, g.scale);
  const inv = F.matrixWorld.clone().invert();
  for (const m of ms) { const c = new THREE.Mesh(m.geometry, m.material); new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).decompose(c.position, c.quaternion, c.scale); c.castShadow = true; g.add(c); m.visible = false; }
  scene.add(g); addProp(g, dir.clone().multiplyScalar(rnd(2, 3.5)).add(new V3(rnd(-0.8, 0.8), rnd(1.8, 3), rnd(-0.8, 0.8))), new V3(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14)), 0.11, 'helmet', 45);
}
// helmet comes off: hide it on the body and throw a copy as a prop
function setHelmet(hum, on, dir) {
  if (!!hum.helmetOff === !on) return; hum.helmetOff = !on;
  const ms = []; hum.root.traverse(o => { if (o.userData.armor === 'helmet') ms.push(o); });
  if (!ms.length) return;
  if (!on && dir && hum.root.visible && !hum.shadowOnly) {
    const F = hum.frames.head; hum.root.updateMatrixWorld(true);
    const g = new THREE.Group(); F.matrixWorld.decompose(g.position, g.quaternion, g.scale);
    const inv = F.matrixWorld.clone().invert();
    for (const m of ms) { const c = new THREE.Mesh(m.geometry, m.material); new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).decompose(c.position, c.quaternion, c.scale); c.castShadow = true; g.add(c); }
    addProp(g, dir.clone().setY(0).normalize().multiplyScalar(rnd(2.5, 4)).add(new V3(rnd(-0.8, 0.8), rnd(2.2, 3.4), rnd(-0.8, 0.8))), new V3(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14)), 0.11, 'helmet', 45);
    noiseHit(900, 0.08, 0.1);
  }
  for (const m of ms) m.visible = on;
}
// a severed limb flies off as its own physics object
function spawnLimb(hum, bit, dir, t, lowerGone) {
  const pal = Object.assign({}, HUM_DEFAULT, hum.pal), B = new Body(pal, (c) => mat(c));
  const arm = bit < 16, side = (bit === 1 || bit === 2 || bit === 16 || bit === 32) ? 'L' : 'R', upper = bit === 1 || bit === 4 || bit === 16 || bit === 64;
  const root = arm ? (upper ? hum['sh' + side] : hum['el' + side]) : (upper ? hum['lg' + side] : hum['kn' + side]);
  root.updateMatrixWorld(true);
  const g = new THREE.Group();
  if (arm) { if (upper) { B.upperArm(g, 0, 0.3, side); if (!lowerGone) { const e = new THREE.Group(); e.position.copy(hum['el' + side].position); e.quaternion.copy(hum['el' + side].quaternion); g.add(e); B.forearm(e, 0, 0.3, side); } } else B.forearm(g, 0, 0.3, side); }
  else { if (upper) { B.thigh(g, 0, 0.44, side); if (!lowerGone) { const k = new THREE.Group(); k.position.copy(hum['kn' + side].position); k.quaternion.copy(hum['kn' + side].quaternion); g.add(k); B.shin(k, 0, 0.44, side); } } else B.shin(g, 0, 0.44, side); }
  mergeTree(g, vcMat); attachSkin(g, B.segAt);
  const cy = t ? -t * (arm ? 0.3 : 0.44) : 0;
  if (t) clipGroup(g, cy, true);
  addStump(g, new V3(0, cy, 0), new V3(0, 1, 0), arm ? 0.042 : 0.065);
  root.matrixWorld.decompose(g.position, g.quaternion, g.scale);
  const at = g.position.clone();
  new LimbBody(g, cy, arm ? 0.042 : 0.062, dir.clone().multiplyScalar(rnd(0.8, 2)).add(new V3(rnd(-0.6, 0.6), rnd(0.5, 1.4), rnd(-0.6, 0.6))), rnd(-6, 6));
  for (let i = 0; i < 3; i++) bloodFx(at.clone().add(new V3(rnd(-0.05, 0.05), rnd(-0.05, 0.05), rnd(-0.05, 0.05))), dir.clone().add(new V3(rnd(-0.5, 0.5), rnd(0, 0.6), rnd(-0.5, 0.5))).normalize());
  puff(at, 0x7a0000, 0.9, 0.8, 0.05, 0.9);
  noiseHit(300, 0.25, 0.12);
}
// A limb that came off is a stick of two particles (the cut end and the far end) held at its length, each a ball of the
// limb's thickness, plus a check at the middle. They fall and tumble, land and slide on the floor and on top of things,
// can't go into walls, crates or bodies (standing people are capsules, lying bodies the balls of their ragdoll), and the
// limb is turned to lie along the stick, keeping its own roll. It settles and then lies still until it's cleared.
const limbBodies = [];
const _lA = new V3(), _lB = new V3(), _lC = new V3(), _lQ = new THREE.Quaternion();
function limbBoxPush(P, Q, r) {
  let hit = false;
  if (P.y < r) { P.y = r; Q.y = Math.max(Q.y, r); hit = true; }
  for (const c of colliders) {
    if (P.x > c.min.x - r && P.x < c.max.x + r && P.y > c.min.y - r && P.y < c.max.y + r && P.z > c.min.z - r && P.z < c.max.z + r && !(c.mesh && gridOpenW(c.mesh, P))) {
      const d = [P.x - (c.min.x - r), (c.max.x + r) - P.x, P.y - (c.min.y - r), (c.max.y + r) - P.y, P.z - (c.min.z - r), (c.max.z + r) - P.z];
      let k = 0; for (let j = 1; j < 6; j++) if (d[j] < d[k]) k = j;
      if (k === 0) P.x = c.min.x - r; else if (k === 1) P.x = c.max.x + r; else if (k === 2) P.y = c.min.y - r; else if (k === 3) P.y = c.max.y + r; else if (k === 4) P.z = c.min.z - r; else P.z = c.max.z + r;
      if (k < 2) Q.x = P.x; else if (k < 4) Q.y = P.y; else Q.z = P.z;
      hit = true;
    }
  }
  return hit;
}
// standing people as capsules (feet to head), lying people as their ragdoll's balls: returns how far to push p out
function limbBodyPush(p, r, out) {
  out.set(0, 0, 0); let hit = false;
  const cap = (root) => {
    const y0 = root.position.y + 0.2, y1 = root.position.y + 1.62, R = 0.2 + r;
    const y = clamp(p.y, y0, y1), dx = p.x - root.position.x, dz = p.z - root.position.z, dy = p.y - y, L = Math.hypot(dx, dy, dz);
    if (L < R && L > 1e-5) { out.x += dx / L * (R - L); out.y += dy / L * (R - L); out.z += dz / L * (R - L); hit = true; }
  };
  for (const d of dummies) if (d.hum.root.visible && !d.rag) cap(d.hum.root);
  if (S.remotes) for (const rm of S.remotes.values()) if (rm.hum && rm.hum.root.visible && !rm.rag) cap(rm.hum.root);
  if (P.alive && !P.rag && !P.downed) { const ft = { position: new V3(P.pos.x, P.pos.y, P.pos.z) }; cap(ft); }
  for (const rg of ragdolls) {
    if (!rg.group.visible) continue;
    for (let i = 0; i < rg.p.length; i++) {
      const R = (rg.rad[i] || 0.06) + r; _lC.subVectors(p, rg.p[i]); const L = _lC.length();
      if (L < R && L > 1e-5) { out.addScaledVector(_lC, (R - L) / L); hit = true; }
    }
  }
  return hit;
}
class LimbBody {
  constructor(g, cy, r, v, spin) {
    scene.add(g); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.updateMatrixWorld(true);
    // the stick: from the cut end to the far end of what's left (the far corner of its box, through the box's middle)
    const bx = new THREE.Box3(), inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    g.traverse(o => { if (o.isMesh && o.visible && o.geometry) { o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
    const c = bx.getCenter(new V3()); this.al = new V3(0, Math.min(cy, bx.max.y), 0);
    this.bl = new V3(c.x, bx.min.y + r, c.z);   // far end: the bottom of what's left (the cut is drawn by the shader, the box is the whole part)
    this.len = Math.max(0.12, this.al.distanceTo(this.bl) - r * 1.2); this.r = r;
    this.ax = this.bl.clone().sub(this.al).normalize();
    this.p = [g.localToWorld(this.al.clone()), g.localToWorld(this.bl.clone())];
    const h = 1 / 120, w = new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 9));
    this.q = this.p.map((x, i) => x.clone().sub(v.clone().add(w.clone().multiplyScalar(i ? 0.5 : -0.5)).multiplyScalar(h)));
    // the two ends must start outside walls, crates and bodies
    for (let i = 0; i < 2; i++) { limbBoxPush(this.p[i], this.q[i], r); }
    this.g = g; this.spin = spin || 0; this.life = 0; this.still = 0; this.rest = false; this.acc = 0;
    this.d0 = this.p[1].clone().sub(this.p[0]).normalize();
    limbBodies.push(this);
    if (limbBodies.length > 24) limbBodies.shift().dispose();
  }
  dispose() { scene.remove(this.g); }
  step() {
    const h = 1 / 120, p = this.p, q = this.q;
    for (let i = 0; i < 2; i++) { const P = p[i], Q = q[i]; _lA.subVectors(P, Q).multiplyScalar(0.995); Q.copy(P); P.add(_lA); P.y -= 9.8 * h * h; }
    const gr = [false, false];
    for (let it = 0; it < 4; it++) {
      _lA.subVectors(p[1], p[0]); const d = _lA.length() || 1e-6, k = (d - this.len) / d * 0.5;
      p[0].addScaledVector(_lA, k); p[1].addScaledVector(_lA, -k);
      for (let i = 0; i < 2; i++) {
        if (limbBoxPush(p[i], q[i], this.r)) gr[i] = true;
        if (limbBodyPush(p[i], this.r, _lB)) p[i].add(_lB);
      }
      // the middle too: a long thigh can't straddle a crate edge or a body with both ends clear
      _lC.addVectors(p[0], p[1]).multiplyScalar(0.5); const m0 = _lC.clone(), mq = _lC.clone();
      let moved = limbBoxPush(_lC, mq, this.r);
      if (limbBodyPush(_lC, this.r, _lB)) { _lC.add(_lB); moved = true; }
      if (moved) { _lC.sub(m0); p[0].add(_lC); p[1].add(_lC); }
    }
    // whatever touches the floor or a top drags
    for (let i = 0; i < 2; i++) if (gr[i]) { const P = p[i], Q = q[i]; Q.x = P.x - (P.x - Q.x) * 0.8; Q.z = P.z - (P.z - Q.z) * 0.8; }
    const ground = gr[0] || gr[1];
    this.spin *= ground ? 0.85 : 0.995;
    const sp = p[0].distanceTo(q[0]) + p[1].distanceTo(q[1]);
    this.still = sp < 0.0006 ? this.still + h : 0;
    if (this.still > 0.6) this.rest = true;
  }
  place() {
    const d = _lA.subVectors(this.p[1], this.p[0]).normalize();
    _lQ.setFromUnitVectors(this.d0, d); this.g.quaternion.premultiply(_lQ); this.d0.copy(d);
    if (this.spin) this.g.quaternion.premultiply(_lQ.setFromAxisAngle(d, this.spin * this.dt));
    this.g.position.copy(this.p[0]).sub(this.al.clone().applyQuaternion(this.g.quaternion));
  }
  update(dt) {
    this.life += dt; if (this.rest) return;
    this.acc = Math.min(this.acc + dt, 0.05);
    while (this.acc >= 1 / 120) { this.step(); this.acc -= 1 / 120; }
    this.dt = dt; this.place();
  }
}
function updateLimbs(dt) {
  for (let i = limbBodies.length - 1; i >= 0; i--) { const L = limbBodies[i]; L.update(dt); if (L.life > 60) { L.dispose(); limbBodies.splice(i, 1); } }
}
function syncLost(hum, mask, dir, cuts) {
  const prev = hum.lostMask || 0;
  const key = mask + ':' + (cuts ? cuts.join(',') : '');
  if (key === hum.lostKey) return;
  [[1, 2], [4, 8], [16, 32], [64, 128]].forEach(([up, low], i) => {
    if (!hum.root.visible) return;
    const t = cuts ? cuts[i] || 0 : 0;
    if ((mask & up) && !(prev & up)) spawnLimb(hum, up, dir || new V3(0, 0, 1), t, !!(prev & low));
    else if ((mask & low) && !(prev & low) && !(mask & up)) spawnLimb(hum, low, dir || new V3(0, 0, 1), t);
  });
  hum.setLost(mask, cuts);
}


// a limb that has come off: its skin stops blending with the body's bones, and the body's skin stops blending with it
// (otherwise the skin between them stretches across the ground as the piece flies off)
function detachSkin(g) {
  g.userData.gone = true;
  g.traverse(o => {
    if (!o._skin) return; const at = o._skin.at, keep = {};
    for (const k in at) { let inside = false; for (let q = at[k][0]; q; q = q.parent) if (q === g) { inside = true; break; } if (inside) keep[k] = at[k]; }
    o._skin.at = keep;
  });
}

// ---- module exports: build.mjs strips this block ----
export { RAG_LIMBS, RAG_MASS, _Y, _a, _b, _rt, freeRag, limbBodies, ragdolls, setHelmet, spawnRagdoll, syncLost, updateLimbs };
// ---- end module exports ----
