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
const _a = new V3(), _b = new V3(), _c = new V3(), _m4 = new THREE.Matrix4(), _Y = new V3(0, 1, 0);
const _rf = new V3(), _ru = new V3(), _rs = new V3(), _rt = new V3(), _rd = new V3();
class Ragdoll {
  constructor(pts, pal, vel, hitIdx, dir, power, masks) {
    masks = masks || {}; this.anchors = [];
    const broken = masks.bb || 0, lost = masks.ls || 0;
    this.p = pts.map(v => v.clone()); this.q = pts.map(v => v.clone());
    this.rad = RAG_RAD.slice();
    this.c = []; this.life = 0; this.acc = 0; this.pool = null; this.keep = !!masks.keep;
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
      if (i === hitIdx) v.addScaledVector(dir, power); else if (near.has(i)) v.addScaledVector(dir, power * 0.4);
      v.x += (Math.random() - 0.5) * 0.3; v.z += (Math.random() - 0.5) * 0.3;
      this.q[i].addScaledVector(v, -h);
    }
    const pl = Object.assign({}, HUM_DEFAULT, pal);
    const B = new Body(pl, (c, r, m) => mat(c, r, m));
    this.group = new THREE.Group(); this.group.userData.ragObj = this; scene.add(this.group);
    this.torso = new THREE.Group(); this.group.add(this.torso); this.torso.userData.rf = 'torso';
    B.pelvis(this.torso, -0.31); B.chest(this.torso, -0.24);
    this.headG = new THREE.Group(); this.group.add(this.headG); this.headG.userData.rf = 'head';
    B.head(this.headG, 0); B.add(cylg(0.046, 0.1, 14, 0.052), pl.skin, this.headG, 0, -0.13, 0);
    const limbCol = { upperArm: pl.shirt, forearm: pl.shirt, thigh: pl.pants, shin: pl.pants };
    this.limbs = [];
    for (const sg of this.segs) {
      if (sg.hidden) continue;
      if (sg.mid < 0) { const g = new THREE.Group(); this.group.add(g); sg.g = g; g.userData.rf = { seg: sg.si, dy: -sg.L / 2 }; B[sg.fn](g, sg.L / 2, sg.L); this.limbs.push({ g, a: sg.a, b: sg.b, seg: sg.si, top: sg.L / 2, bot: -sg.L / 2, first: true }); }
      else {
        const r = sg.fn === 'thigh' ? 0.075 : sg.fn === 'shin' ? 0.055 : 0.048, hL = sg.L / 2;
        for (const [x, y, end] of [[sg.a, sg.mid, false], [sg.mid, sg.b, true]]) {
          const g = new THREE.Group(); this.group.add(g);
          B.add(limbG(hL, r, r * 0.95, r * 0.9), limbCol[sg.fn], g, 0, hL / 2, 0);
          if (end && sg.fn === 'forearm') B.add(rbox(0.07, 0.085, 0.034, 0.014), pl.glove, g, 0, -hL / 2 - 0.03, 0);
          if (end && sg.fn === 'shin') B.add(rbox(0.11, 0.12, 0.25, 0.04), pl.boots, g, 0, -hL / 2 - 0.02, -0.04);
          B.add(sph(r * 0.9), 0x7a0a0a, g, 0, end ? hL / 2 : -hL / 2, 0);
          g.userData.rf = { seg: sg.si, dy: end ? -hL * 1.5 : -hL / 2 };
          this.limbs.push({ g, a: x, b: y, seg: sg.si, top: hL / 2, bot: -hL / 2, first: !end });
        }
      }
    }
    if (masks.w) for (const w of masks.w) {
      const [g, dy] = this.frameGroup(w.frame); if (!g) continue;
      const m = new THREE.Object3D(); m.position.copy(w.p).addScaledVector(w.n, 0.004); m.position.y += dy; m.userData.keep = true; g.add(m);
      this.anchors.push({ m, n: w.n.clone() });
      if (w.st && w.st.isMesh) { const sk = soakMesh(g, w.p.clone().setY(w.p.y + dy), w.n, w.st.scale.x); this.soaks = this.soaks || []; this.soaks.push([sk, w.grow]); }
    }
    if (masks.gib) B.add(sph(0.052), 0x6a0505, this.torso, 0, 0.315, 0, null, [1, 0.6, 1]);
    if (masks.nh) this.group.traverse(o => { if (o.userData.armor === 'helmet') o.visible = false; });
    mergeTree(this.group, vcMat);
    this.group.traverse(o => { if (o.isMesh) o.userData.rag = this; });
    if (masks.gib) this.headG.visible = false;
    if (masks.h) for (const h of masks.h) { const [g, dy] = this.frameGroup(h.frame); if (g) holeInGroup(g, h.p.clone().setY(h.p.y + dy), h.d, h.len, h.r0, h.r1, h.sk); }
    this.lostMask = lost; this.sync(); this.group.updateMatrixWorld(true);
    for (const i of hidden) if ((i % 2 === 0 || !hidden.has(i - 1)) && !cutSeg[i - (i % 2)] && !(i % 2 && cutSeg[i - 1])) this.stump(i);
    for (const i in cutSeg) this.cutAt(+i, cutSeg[i]);
    if (masks.gib) { addStump(this.torso, new V3(0, 0.33, 0), new V3(0, 1, 0), 0.05); }
    this.sync();
  }
  // which piece of the ragdoll stands for a skeleton frame, and the y offset from frame coordinates to that piece
  frameGroup(fr) {
    if (fr === 'spine') return [this.torso, -0.24]; if (fr === 'hips') return [this.torso, -0.31]; if (fr === 'head') return [this.headG, -0.1]; if (fr === 'neck') return [this.headG, -0.16];
    const sg = this.segs[RAG_FRAME_SEG[fr]]; return sg && sg.g && !sg.hidden ? [sg.g, sg.L / 2] : [null, 0];
  }
  // bone-and-flesh stump on whatever segment si was attached to
  stump(si) {
    const r = si < 4 ? (si % 2 ? 0.04 : 0.05) : (si % 2 ? 0.055 : 0.075);
    if (si % 2 === 0) { const lp = this.torso.worldToLocal(this.p[RAG_LIMBS[si][0]].clone()); addStump(this.torso, lp, si < 4 ? new V3(Math.sign(lp.x), -0.4, 0) : new V3(0, -1, 0), r); }
    else { let par = null; for (const l of this.limbs) if (l.seg === si - 1) par = l; if (par) addStump(par.g, new V3(0, par.bot, 0), new V3(0, -1, 0), r); }
  }
  gibHead(dir) {
    const hp = this.headG.getWorldPosition(new V3()); this.headG.visible = false; this.headG.traverse(o => { o.visible = false; });
    addStump(this.torso, new V3(0, 0.33, 0), new V3(0, 1, 0), 0.05);
    for (const a of this.anchors) if (a.m.parent === this.headG) this.anchors.splice(this.anchors.indexOf(a), 1);
    const st = new THREE.Object3D(); st.position.set(0, 0.34, 0); this.torso.add(st); this.anchors.push({ m: st, n: new V3(0, 1, 0) });
    goreBurst(hp, dir.clone().normalize());
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
        scene.add(piece); addProp(piece, dir.clone().multiplyScalar(rnd(1.5, 3.5)).add(new V3(rnd(-1, 1), rnd(1.5, 3), rnd(-1, 1))), new V3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), segs[0] < 4 ? 0.05 : 0.07, 'limb', 60);
        const at = c.l.g.localToWorld(new V3(0, c.y, 0));
        for (let i = this.limbs.length - 1; i >= 0; i--) { const l = this.limbs[i]; if (!segs.slice(1).includes(l.seg)) continue; this.limbs.splice(i, 1); scene.attach(l.g); l.g.traverse(o => { if (o.isMesh) o.userData.rag = null; }); addProp(l.g, dir.clone().multiplyScalar(rnd(1.5, 3.5)).add(new V3(rnd(-1, 1), rnd(1.5, 3), rnd(-1, 1))), new V3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), l.seg < 4 ? 0.05 : 0.07, 'limb', 60); }
        for (let i = 0; i < 3; i++) bloodFx(at.clone().add(new V3(rnd(-0.03, 0.03), rnd(-0.03, 0.03), rnd(-0.03, 0.03))), dir.clone().add(new V3(rnd(-0.5, 0.5), rnd(0, 0.4), rnd(-0.5, 0.5))).normalize(), true);
        noiseHit(300, 0.25, 0.12);
        continue;
      }
      this.stump(segs[0]);
      const at = this.p[RAG_LIMBS[segs[0]][0]].clone();
      for (let i = this.limbs.length - 1; i >= 0; i--) {
        const l = this.limbs[i]; if (!segs.includes(l.seg)) continue;
        this.limbs.splice(i, 1); scene.attach(l.g);
        if (l.seg === segs[0] && l.first) addStump(l.g, new V3(0, l.top, 0), new V3(0, 1, 0), l.seg < 4 ? 0.045 : 0.065);
        l.g.traverse(o => { if (o.isMesh) { o.userData.rag = null; } });
        addProp(l.g, dir.clone().multiplyScalar(rnd(1.5, 3.5)).add(new V3(rnd(-1, 1), rnd(1.5, 3), rnd(-1, 1))), new V3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), l.seg < 4 ? 0.05 : 0.07, 'limb', 60);
      }
      for (let i = 0; i < 3; i++) bloodFx(at.clone().add(new V3(rnd(-0.05, 0.05), rnd(-0.05, 0.05), rnd(-0.05, 0.05))), dir.clone().add(new V3(rnd(-0.5, 0.5), rnd(0, 0.6), rnd(-0.5, 0.5))).normalize(), true);
      noiseHit(300, 0.25, 0.12);
    }
  }
  limits() {
    // anatomical joint limits relative to the torso frame
    const p = this.p;
    _ru.subVectors(p[1], p[2]).normalize();
    _rs.subVectors(p[6], p[3]); _rs.addScaledVector(_ru, -_rs.dot(_ru)).normalize();
    _rf.crossVectors(_ru, _rs);
    // every correction is shared by the two joints involved, so limits never push the whole body around
    const knee = (H, K, F) => {
      _rt.subVectors(p[K], p[H]).normalize(); _rd.subVectors(p[F], p[K]);
      const perp = _rd.clone().addScaledVector(_rt, -_rd.dot(_rt));
      const fw = perp.dot(_rf); if (fw > 0.005) { p[F].addScaledVector(_rf, -fw * 0.5); p[K].addScaledVector(_rf, fw * 0.5); }   // knees only bend backwards
    };
    const hip = (H, K) => {
      _rt.subVectors(p[K], p[H]); const L = _rt.length(); _rt.multiplyScalar(1 / L);
      const back = _rt.dot(_rf); if (back < -0.5) { const k = (-0.5 - back) * L * 0.5; p[K].addScaledVector(_rf, k); p[H].addScaledVector(_rf, -k); }
      const up = _rt.dot(_ru); if (up > 0.45) { const k = (up - 0.45) * L * 0.5; p[K].addScaledVector(_ru, -k); p[H].addScaledVector(_ru, k); }
    };
    const elbow = (S, E, Hn) => {
      _rt.subVectors(p[E], p[S]).normalize(); _rd.subVectors(p[Hn], p[E]);
      const perp = _rd.clone().addScaledVector(_rt, -_rd.dot(_rt));
      const bk = perp.dot(_rf); if (bk < -0.01 && _rt.dot(_ru) < 0.3) { p[Hn].addScaledVector(_rf, -bk * 0.5); p[E].addScaledVector(_rf, bk * 0.5); }
    };
    knee(9, 10, 11); knee(12, 13, 14); hip(9, 10); hip(12, 13); elbow(3, 4, 5); elbow(6, 7, 8);
    // neck: head stays on the shoulders' side of the torso axis
    _rt.subVectors(p[0], p[1]); const hu = _rt.dot(_ru); if (hu < 0.06) { p[0].addScaledVector(_ru, (0.06 - hu) * 0.5); p[1].addScaledVector(_ru, -(0.06 - hu) * 0.5); }
  }
  step(h) {
    const p = this.p, q = this.q, g = 9.8 * h * h, dmp = this.life < 1.2 ? 0.988 : 0.975, vmax = 0.1;
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
    if (this.still > 50) { this.asleep = true; for (let i = 0; i < p.length; i++) q[i].copy(p[i]); return; }
    for (let it = 0; it < 10; it++) {
      const tone = this.tone0 * Math.exp(-this.life / this.toneT), im = this.im;
      for (const [a, b, rest, mode] of this.c) {
        const A = p[a], B = p[b];
        _a.subVectors(B, A); const d = _a.length() || 1e-6;
        if (mode === 1 && d >= rest) continue;
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
      if (P.y < r) { P.y = r; Q.y = Math.max(Q.y, r); Q.x = P.x - (P.x - Q.x) * 0.45; Q.z = P.z - (P.z - Q.z) * 0.45; }
      for (const c of colliders) {
        if (P.x > c.min.x - r && P.x < c.max.x + r && P.y > c.min.y - r && P.y < c.max.y + r && P.z > c.min.z - r && P.z < c.max.z + r) {
          const d = [P.x - (c.min.x - r), (c.max.x + r) - P.x, P.y - (c.min.y - r), (c.max.y + r) - P.y, P.z - (c.min.z - r), (c.max.z + r) - P.z];
          let k = 0; for (let j = 1; j < 6; j++) if (d[j] < d[k]) k = j;
          if (k === 0) P.x = c.min.x - r; else if (k === 1) P.x = c.max.x + r;
          else if (k === 2) P.y = c.min.y - r; else if (k === 3) { P.y = c.max.y + r; Q.x = P.x - (P.x - Q.x) * 0.5; Q.z = P.z - (P.z - Q.z) * 0.5; }
          else if (k === 4) P.z = c.min.z - r; else P.z = c.max.z + r;
        }
      }
    }
  }
  kick(dir, power, idx) { const h = 1 / 120; const i = idx === undefined ? 1 : idx; this.q[i].addScaledVector(dir, -power * h); this.q[2].addScaledVector(dir, -power * 0.3 * h); this.life = Math.min(this.life, 4); this.asleep = false; this.still = 0; }
  update(dt) {
    this.life += dt;
    // the body settles and then lies still (a new hit wakes it), so a first-person view from its head does not drift
    if (this.life < 9 && !this.asleep) {
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
    for (const l of this.limbs) {
      const A = p[l.a], B = p[l.b];
      l.g.position.addVectors(A, B).multiplyScalar(0.5);
      _a.subVectors(A, B).normalize();
      l.g.quaternion.setFromUnitVectors(_Y, _a);
    }
  }
  tag(key, val) { this.group.traverse(o => { if (o.isMesh) o.userData[key] = val; }); }
  dispose() { scene.remove(this.group); if (this.pool) scene.remove(this.pool); this.group.traverse(o => { if (o.isMesh && o.userData.holeN) o.material.dispose(); if (o.isMesh && o.material === vcMat) o.geometry.dispose(); }); }
}
function spawnRagdoll(hum, vel, dir, part, head, masks) {
  masks = Object.assign({ nh: !!hum.helmetOff, w: hum.wounds, h: hum.holes }, masks);
  if (masks.gib && hum.root.visible) {
    goreBurst(hum.headMark.getWorldPosition(new V3()), dir.clone().normalize());
  }
  const r = new Ragdoll(hum.capture(), hum.pal, vel || new V3(), part === 'arm' ? (Math.random() < 0.5 ? 4 : 7) : part === 'leg' ? (Math.random() < 0.5 ? 10 : 13) : PART_IDX[part] || 1, dir, masks.soft ? 0.25 : head ? 5.5 : 3, masks);
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
  if (arm) { if (upper) { B.upperArm(g, 0, 0.3); if (!lowerGone) { const e = new THREE.Group(); e.position.copy(hum['el' + side].position); e.quaternion.copy(hum['el' + side].quaternion); g.add(e); B.forearm(e, 0, 0.3); } } else B.forearm(g, 0, 0.3); }
  else { if (upper) { B.thigh(g, 0, 0.44); if (!lowerGone) { const k = new THREE.Group(); k.position.copy(hum['kn' + side].position); k.quaternion.copy(hum['kn' + side].quaternion); g.add(k); B.shin(k, 0, 0.44); } } else B.shin(g, 0, 0.44); }
  mergeTree(g, vcMat);
  const cy = t ? -t * (arm ? 0.3 : 0.44) : 0;
  if (t) clipGroup(g, cy, true);
  addStump(g, new V3(0, cy, 0), new V3(0, 1, 0), arm ? 0.042 : 0.065);
  root.matrixWorld.decompose(g.position, g.quaternion, g.scale);
  const at = g.position.clone();
  addProp(g, dir.clone().multiplyScalar(rnd(2.5, 4.5)).add(new V3(rnd(-1, 1), rnd(1.5, 3), rnd(-1, 1))), new V3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)), arm ? 0.05 : 0.07, 'limb', 40);
  for (let i = 0; i < 3; i++) bloodFx(at.clone().add(new V3(rnd(-0.05, 0.05), rnd(-0.05, 0.05), rnd(-0.05, 0.05))), dir.clone().add(new V3(rnd(-0.5, 0.5), rnd(0, 0.6), rnd(-0.5, 0.5))).normalize());
  puff(at, 0x7a0000, 0.9, 0.8, 0.05, 0.9);
  noiseHit(300, 0.25, 0.12);
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

