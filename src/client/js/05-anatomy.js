// ---------------------------------------------------------------- anatomy: bones, joints, organs, arteries, blood
// Structures live in the coordinate frame of a skeleton group. a/b = segment ends (b omitted for spheres), r = radius (m).
// rate = bleed ml/s when severed/destroyed. Damage comes only from bullet velocity, mass and what the path passes through.
const STRUCTS = [];
function S_(id, name, type, frame, region, a, b, r, opt) { STRUCTS.push(Object.assign({ id, name, type, frame, region, a: new V3().fromArray(a), b: b ? new V3().fromArray(b) : null, r }, opt || {})); }
S_('brain', 'Brain', 'organ', 'head', 'head', [0, 0.12, 0.0], null, 0.062, { lethal: 20 });
S_('skull', 'Skull', 'bone', 'head', 'head', [0, 0.1, 0], null, 0.1, { shell: 1 });
S_('jaw', 'Jaw', 'bone', 'head', 'head', [0, 0.05, -0.035], null, 0.035);
S_('cspine', 'Cervical spine', 'spine', 'neck', 'neck', [0, -0.01, 0.022], [0, 0.07, 0.022], 0.018, { cervical: 1 });
S_('carotidL', 'Left carotid artery', 'artery', 'neck', 'neck', [-0.026, -0.01, -0.012], [-0.026, 0.07, -0.014], 0.011, { rate: 60 });
S_('carotidR', 'Right carotid artery', 'artery', 'neck', 'neck', [0.026, -0.01, -0.012], [0.026, 0.07, -0.014], 0.011, { rate: 60 });
S_('trachea', 'Trachea', 'organ', 'neck', 'neck', [0, -0.01, -0.03], [0, 0.07, -0.032], 0.012, { breath: 0.5, rate: 3 });
S_('heart', 'Heart', 'organ', 'spine', 'chest', [-0.03, 0.31, -0.035], null, 0.05, { heart: 1, rate: 90 });
S_('lungL', 'Left lung', 'organ', 'spine', 'chest', [-0.085, 0.34, 0.0], null, 0.07, { breath: 0.4, rate: 14 });
S_('lungR', 'Right lung', 'organ', 'spine', 'chest', [0.085, 0.34, 0.0], null, 0.07, { breath: 0.4, rate: 14 });
S_('aorta', 'Aorta', 'artery', 'spine', 'chest', [-0.01, 0.43, 0.01], [-0.005, 0.06, 0.06], 0.014, { rate: 130 });
S_('subclL', 'Left subclavian artery', 'artery', 'spine', 'chest', [-0.05, 0.47, -0.03], [-0.17, 0.48, -0.02], 0.01, { rate: 40 });
S_('subclR', 'Right subclavian artery', 'artery', 'spine', 'chest', [0.05, 0.47, -0.03], [0.17, 0.48, -0.02], 0.01, { rate: 40 });
S_('tspine', 'Thoracic spine', 'spine', 'spine', 'chest', [0, 0.22, 0.095], [0, 0.52, 0.09], 0.02);
S_('lspine', 'Lumbar spine', 'spine', 'spine', 'abdomen', [0, -0.02, 0.085], [0, 0.22, 0.095], 0.022);
S_('ribs', 'Ribs', 'bone', 'spine', 'chest', [0, 0.34, 0], null, 0.2, { shell: 1, minY: 0.2 });
S_('sternum', 'Sternum', 'bone', 'spine', 'chest', [0, 0.24, -0.1], [0, 0.43, -0.1], 0.02);
S_('clavL', 'Left clavicle', 'bone', 'spine', 'chest', [-0.03, 0.5, -0.06], [-0.17, 0.52, -0.03], 0.012);
S_('clavR', 'Right clavicle', 'bone', 'spine', 'chest', [0.03, 0.5, -0.06], [0.17, 0.52, -0.03], 0.012);
S_('scapL', 'Left scapula', 'bone', 'spine', 'chest', [-0.1, 0.38, 0.095], null, 0.045);
S_('scapR', 'Right scapula', 'bone', 'spine', 'chest', [0.1, 0.38, 0.095], null, 0.045);
S_('liver', 'Liver', 'organ', 'spine', 'abdomen', [0.06, 0.15, -0.02], null, 0.065, { rate: 38 });
S_('stomach', 'Stomach', 'organ', 'spine', 'abdomen', [-0.06, 0.16, -0.035], null, 0.05, { rate: 9 });
S_('spleen', 'Spleen', 'organ', 'spine', 'abdomen', [-0.1, 0.16, 0.04], null, 0.03, { rate: 26 });
S_('kidneyL', 'Left kidney', 'organ', 'spine', 'abdomen', [-0.065, 0.08, 0.06], null, 0.03, { rate: 16 });
S_('kidneyR', 'Right kidney', 'organ', 'spine', 'abdomen', [0.065, 0.08, 0.06], null, 0.03, { rate: 16 });
S_('bowel', 'Intestines', 'organ', 'spine', 'abdomen', [0, 0.04, -0.04], null, 0.075, { rate: 3 });
S_('pelvisB', 'Pelvis', 'bone', 'hips', 'pelvis', [0, -0.02, 0], null, 0.15, { shell: 1, legs: 1 });
S_('iliacL', 'Left iliac artery', 'artery', 'hips', 'pelvis', [-0.03, 0.06, -0.02], [-0.085, -0.08, -0.04], 0.012, { rate: 45 });
S_('iliacR', 'Right iliac artery', 'artery', 'hips', 'pelvis', [0.03, 0.06, -0.02], [0.085, -0.08, -0.04], 0.012, { rate: 45 });
S_('bladder', 'Bladder', 'organ', 'hips', 'pelvis', [0, -0.03, -0.05], null, 0.04, { rate: 3 });
for (const [s, sn, inner] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
  S_('shoulder' + s, sn + ' shoulder joint', 'joint', 'sh' + s, 'uarm' + s, [0, 0, 0], null, 0.045, { arm: s });
  S_('humerus' + s, sn + ' humerus', 'bone', 'sh' + s, 'uarm' + s, [0, -0.03, 0], [0, -0.28, 0], 0.014, { arm: s });
  S_('brachial' + s, sn + ' brachial artery', 'artery', 'sh' + s, 'uarm' + s, [inner * 0.026, -0.05, -0.005], [inner * 0.02, -0.29, -0.012], 0.007, { rate: 15 });
  S_('elbow' + s, sn + ' elbow joint', 'joint', 'sh' + s, 'uarm' + s, [0, -0.3, 0], null, 0.034, { arm: s });
  S_('forearm' + s, sn + ' radius/ulna', 'bone', 'el' + s, 'farm' + s, [0, -0.02, 0], [0, -0.25, 0], 0.016, { arm: s });
  S_('radial' + s, sn + ' radial artery', 'artery', 'el' + s, 'farm' + s, [inner * 0.012, -0.05, -0.02], [inner * 0.015, -0.25, -0.02], 0.005, { rate: 6 });
  S_('wrist' + s, sn + ' wrist', 'joint', 'el' + s, 'farm' + s, [0, -0.265, 0], null, 0.024, { arm: s });
  S_('hand' + s, sn + ' hand bones', 'bone', 'el' + s, 'hand' + s, [0, -0.32, -0.01], null, 0.042, { hand: s });
  S_('hip' + s, sn + ' hip joint', 'joint', 'lg' + s, 'thigh' + s, [0, 0, 0], null, 0.05, { leg: s });
  S_('femur' + s, sn + ' femur', 'bone', 'lg' + s, 'thigh' + s, [0, -0.03, 0], [0, -0.41, 0], 0.017, { leg: s });
  S_('femoral' + s, sn + ' femoral artery', 'artery', 'lg' + s, 'thigh' + s, [inner * 0.035, -0.02, -0.035], [inner * 0.02, -0.38, 0.0], 0.009, { rate: 40 });
  S_('knee' + s, sn + ' knee (ligaments)', 'joint', 'lg' + s, 'thigh' + s, [0, -0.44, 0], null, 0.045, { leg: s });
  S_('tibia' + s, sn + ' tibia/fibula', 'bone', 'kn' + s, 'shin' + s, [0, -0.03, 0], [0, -0.4, 0], 0.019, { leg: s });
  S_('popliteal' + s, sn + ' popliteal artery', 'artery', 'kn' + s, 'shin' + s, [0, 0.01, 0.035], [0, -0.1, 0.03], 0.008, { rate: 20 });
  S_('ankle' + s, sn + ' ankle', 'joint', 'kn' + s, 'shin' + s, [0, -0.41, 0], null, 0.034, { leg: s });
  S_('foot' + s, sn + ' foot bones', 'bone', 'kn' + s, 'foot' + s, [0, -0.445, -0.05], null, 0.05, { leg: s, minor: 1 });
}
const STRUCTS_BY_FRAME = {}, STRUCTS_BY_REGION = {};
for (const st of STRUCTS) { (STRUCTS_BY_FRAME[st.frame] = STRUCTS_BY_FRAME[st.frame] || []).push(st); (STRUCTS_BY_REGION[st.region] = STRUCTS_BY_REGION[st.region] || []).push(st); }
const REGIONS = ['head', 'neck', 'chest', 'abdomen', 'pelvis', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const REGION_NAME = { head: 'Head', neck: 'Neck', chest: 'Chest', abdomen: 'Abdomen', pelvis: 'Pelvis', uarmL: 'Left upper arm', farmL: 'Left forearm', handL: 'Left hand', uarmR: 'Right upper arm', farmR: 'Right forearm', handR: 'Right hand', thighL: 'Left thigh', shinL: 'Left shin', footL: 'Left foot', thighR: 'Right thigh', shinR: 'Right shin', footR: 'Right foot' };
const PART_OF_REGION = r => r === 'head' || r === 'neck' ? 'head' : /arm|hand/.test(r) ? 'arm' : /thigh|shin|foot/.test(r) ? 'leg' : 'torso';
const LSEG = { shL: 0.3, elL: 0.3, shR: 0.3, elR: 0.3, lgL: 0.44, knL: 0.44, lgR: 0.44, knR: 0.44 };
function regionOf(frame, p) {
  switch (frame) {
    case 'head': return 'head'; case 'neck': return 'neck'; case 'hips': return 'pelvis';
    case 'spine': return p.y > 0.22 ? 'chest' : 'abdomen';
    case 'shL': return 'uarmL'; case 'shR': return 'uarmR';
    case 'elL': return p.y < -0.275 ? 'handL' : 'farmL'; case 'elR': return p.y < -0.275 ? 'handR' : 'farmR';
    case 'lgL': return 'thighL'; case 'lgR': return 'thighR';
    case 'knL': return p.y < -0.41 ? 'footL' : 'shinL'; case 'knR': return p.y < -0.41 ? 'footR' : 'shinR';
  }
  return 'chest';
}
// closest approach between path segment P0->P1 and structure (sphere or capsule); returns [distance, t along path]
const _sd = new V3(), _se = new V3(), _sr = new V3();
function pathDist(P0, P1, st) {
  if (!st.b) {
    _sd.subVectors(P1, P0); const L2 = _sd.lengthSq();
    const t = L2 ? clamp(_se.subVectors(st.a, P0).dot(_sd) / L2, 0, 1) : 0;
    return [_sr.copy(P0).addScaledVector(_sd, t).distanceTo(st.a), t];
  }
  const d1 = _sd.subVectors(P1, P0), d2 = _se.subVectors(st.b, st.a), r = _sr.subVectors(P0, st.a);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const p = P0.clone().addScaledVector(d1, s), q = st.a.clone().addScaledVector(d2, t);
  return [p.distanceTo(q), s];
}
const LIMB_OF = { uarmL: ['armL', 1], farmL: ['armL', 2], handL: ['armL', 2], uarmR: ['armR', 1], farmR: ['armR', 2], handR: ['armR', 2],
  thighL: ['legL', 1], shinL: ['legL', 2], footL: ['legL', 2], thighR: ['legR', 1], shinR: ['legR', 2], footR: ['legR', 2] };
const LIMB_NAME = { armL: 'Left arm', armR: 'Right arm', legL: 'Left leg', legR: 'Right leg' };
const LIMB_REGIONS = { armL: [['uarmL', 'farmL', 'handL'], ['farmL', 'handL']], armR: [['uarmR', 'farmR', 'handR'], ['farmR', 'handR']], legL: [['thighL', 'shinL', 'footL'], ['shinL', 'footL']], legR: [['thighR', 'shinR', 'footR'], ['shinR', 'footR']] };
class Anatomy {
  constructor() {
    this.s = {}; for (const st of STRUCTS) this.s[st.id] = { hp: 100, broken: false, severed: false, treated: false };
    this.flesh = {}; for (const r of REGIONS) this.flesh[r] = 100;
    this.wounds = []; this.blood = 5000; this.dead = false; this.cause = ''; this.paralyzed = false;
    this.o2 = 1; this.lost = {}; this.cut = {}; this.breath = 1; this.pain = 0; this.concussion = 0; this.lastBy = 0; this.lastDir = new V3(0, 0, -1); this.lastRegion = 'chest'; this.lastDist = 0;
    this.version = 0;
    this.armor = { helmet: 0, plateF: 100 }; this.helmetOn = false; this.shock = 0; this.morphine = 0; this.painDown = false; this.painLvl = 0;
  }
  // frame: skeleton group name, e/d: entry point and direction in that frame, v: impact velocity (m/s), w: weapon index, armor: 'plate'|'helmet'|undefined
  hit(frame, e, d, v, w, armor, pd) {
    this.version++;
    const m = (WEAPONS[w] || WEAPONS[0]).mass;
    const region = regionOf(frame, e);
    this.lastRegion = region; this.lastW = w;
    const limb = LIMB_OF[region];
    if (limb && this.lost[limb[0]] && this.lost[limb[0]] <= limb[1]) return { region, missing: true };
    let vel = v;
    // armor: plates are rated by energy and wear down with every hit, any helmet hit knocks the helmet off
    const Ein = 0.5 * m * vel * vel;
    let helmetOff = false, armorHit = '';
    if (armor === 'plate' || armor === 'plateB') armor = e.z > 0 ? '' : 'plateF';
    if (armor === 'plateF' && d.z < 0) armor = '';
    if (armor === 'plateF' && this.armor[armor] > 0) {
      const hp = this.armor[armor], cap = 2200 * Math.min(1, 0.4 + hp / 60);
      armorHit = armor;
      if (Ein < cap && w !== 2) {
        this.armor[armor] = Math.max(0, hp - (3 + Ein / 150)); this.version++;
        this.shock += 10 + Ein / 300; this.damage(this.s.ribs, STRUCTS.find(s => s.id === 'ribs'), Ein / 600 * 14, region); this.flesh.chest = Math.max(0, this.flesh.chest - 3);
        return { stopped: 'plate', region, plate: armor, plateHp: this.armor[armor] };
      }
      this.armor[armor] = w === 2 ? 0 : Math.max(0, hp - 35); this.version++;
      vel *= Ein > 8000 ? 0.85 : 0.55;
    }
    if (armor === 'helmet' && this.helmetOn) {
      this.helmetOn = false; this.armor.helmet = 0; helmetOff = true; this.version++;
      if (Ein < 700) { this.concussion = 1.5; this.shock += 25; this.flesh.head -= 6; return { stopped: 'helmet', region, helmetOff }; }
      vel *= Ein > 8000 ? 0.9 : 0.55;
    }
    const E1 = 0.5 * m * vel * vel;
    const cavity = clamp((E1 - 250) / 1300, 0, 3) * ((w === 0 || w === 3) && vel > 760 ? 1.35 : 1);
    const woundR = 0.004 + 0.012 * Math.min(cavity, 2.5);
    const decay = 0.24 * Math.sqrt(m / 0.004) * (isPistol(w) ? 1.4 : 1);
    const wasGone = this.flesh[region] <= 0;
    const P0 = e.clone(), P1 = e.clone().addScaledVector(d, 0.5);
    const hits = [];
    for (const st of STRUCTS_BY_FRAME[frame] || []) {
      if (st.shell) { if (st.minY === undefined || e.y > st.minY) hits.push([st, 0]); continue; }
      const [dist, t] = pathDist(P0, P1, st);
      // a round that stopped inside never reaches what lies beyond where it stopped
      if (pd !== undefined && pd !== null && t * 0.5 > pd + 0.015) continue;
      if (dist < st.r + woundR) hits.push([st, t]);
    }
    hits.sort((x, y) => x[1] - y[1]);
    const E0 = 0.5 * m * vel * vel;
    const out = { region, structures: [] };
    for (const [st, t] of hits) {
      const vAt = vel * Math.exp(-t * 0.5 / decay);
      if (vAt < 70) break;
      const E = 0.5 * m * vAt * vAt;
      const dmg = 100 * E / 600 * (1 + 0.5 * cavity) * (st.type === 'bone' ? 0.8 : 1) * (st.shell ? 0.6 : 1);
      this.damage(this.s[st.id], st, dmg, region);
      out.structures.push(st.name);
      if (st.type === 'bone' || st.type === 'spine') vel *= st.shell ? 0.9 : 0.78;
    }
    this.flesh[region] = Math.max(0, this.flesh[region] - (limb ? clamp(9 * E0 / 600 * (1 + cavity), 3, E0 > 6000 ? 55 : 28) : clamp(22 * E0 / 600 * (1 + cavity), 5, E0 > 6000 ? 100 : 70)));
    // a limb only comes off once its tissue is shredded and the bone is broken, or a .50 smashes the bone of a thin or
    // already torn-up section. It parts where the round went in, so a limb can be lost at any length.
    if (limb) {
      const bones = (STRUCTS_BY_FRAME[frame] || []).filter(st => st.type === 'bone'), anyBroken = bones.some(st => this.s[st.id].broken);
      const boneNow = hits.some(([st]) => st.type === 'bone' && this.s[st.id].broken);
      if ((wasGone && anyBroken) || (E0 > 6500 && boneNow && (limb[1] === 2 || this.flesh[region] < 45))) {
        const t = /hand|foot/.test(region) ? 0.93 : clamp(-e.y / (LSEG[frame] || 0.3), 0.1, 0.9);
        this.sever(limb[0], limb[1], t); out.severed = limb[0];
      }
    }
    this.wounds.push({ region, name: 'Gunshot wound, ' + REGION_NAME[region].toLowerCase(), rate: 0.9 + 2.8 * cavity * Math.min(2, E0 / 600), treated: false });
    this.shock += 15 + E0 / 200;
    out.dead = this.dead; out.cause = this.cause; out.helmetOff = helmetOff; out.plate = armorHit;
    return out;
  }
  sever(limb, lvl, t) {
    const cur = this.lost[limb]; t = t === undefined ? (lvl === 1 ? 0.12 : 0.08) : t;
    if (cur && (cur < lvl || (cur === lvl && (this.cut[limb] || 0) <= t))) return;
    this.cut[limb] = t; this.version++;
    if (cur === lvl) return;
    this.lost[limb] = lvl;
    const legs = limb.startsWith('leg');
    this.wounds = this.wounds.filter(w => !(w.region && LIMB_REGIONS[limb][lvl - 1].includes(w.region) && !w.amp));
    this.wounds.push({ region: LIMB_REGIONS[limb][lvl - 1][0], name: LIMB_NAME[limb] + ' amputated', rate: (legs ? 55 : 30) * (lvl === 1 ? 1 : 0.6), treated: false, amp: 1 });
    for (const r of LIMB_REGIONS[limb][lvl - 1]) this.flesh[r] = 0;
    this.shock += 60;
  }
  cutArr() { return ['armL', 'armR', 'legL', 'legR'].map(k => this.lost[k] ? Math.round((this.cut[k] || 0.1) * 100) / 100 : 0); }
  lostMask() { const L = this.lost; return (L.armL === 1 ? 1 : L.armL === 2 ? 2 : 0) | (L.armR === 1 ? 4 : L.armR === 2 ? 8 : 0) | (L.legL === 1 ? 16 : L.legL === 2 ? 32 : 0) | (L.legR === 1 ? 64 : L.legR === 2 ? 128 : 0); }
  brokenMask() { const b = id => this.s[id].broken ? 1 : 0; return b('humerusL') | b('forearmL') << 1 | b('humerusR') << 2 | b('forearmR') << 3 | b('femurL') << 4 | b('tibiaL') << 5 | b('femurR') << 6 | b('tibiaR') << 7; }
  armHangMask() { return (this.armBroken('L') ? 1 : 0) | (this.armBroken('R') ? 2 : 0); }
  regionLost(r) { for (const limb in this.lost) if (LIMB_REGIONS[limb][this.lost[limb] - 1].includes(r)) return true; return false; }
  damage(s, st, dmg, region) {
    s.hp = Math.max(0, s.hp - dmg);
    if (st.type === 'bone') { if (dmg >= 28 || s.hp <= 0) { s.broken = true; s.treated = false; } }
    else if (st.type === 'joint') { if (dmg >= 32 || s.hp <= 0) { s.broken = true; s.treated = false; } }
    else if (st.type === 'artery') {
      const sev = dmg >= 12;
      if (sev) s.severed = true;
      this.addWound(st, region, st.name + (sev ? ' severed' : ' nicked'), st.rate * (sev ? 1 : 0.18), true);
    } else if (st.type === 'organ') {
      if (st.rate) this.addWound(st, region, st.name + ' bleeding', st.rate * Math.min(1, dmg / 100), false);
      if (st.breath) this.breath = Math.max(0.15, this.breath - st.breath * Math.min(1, dmg / 70));
      if (st.lethal && 100 - s.hp >= st.lethal) this.kill('brain');
    } else if (st.type === 'spine') {
      if (dmg >= 30) {
        if (st.cervical) this.kill('spinal');
        else if (!this.paralyzed) { this.paralyzed = true; this.wounds.push({ region, name: 'Spinal cord trauma', rate: 12, treated: false, spinal: 1 }); }
        s.broken = true;
      }
    }
  }
  // one wound per structure: repeat hits make it worse (up to the structure's maximum), they don't stack forever
  addWound(st, region, name, rate, artery) {
    const w = this.wounds.find(x => x.sid === st.id);
    if (w) { w.rate = Math.min(st.rate, artery ? Math.max(w.rate, rate) : w.rate + rate); w.name = name; w.treated = false; return; }
    this.wounds.push({ sid: st.id, region, name, rate: Math.min(st.rate, rate), treated: false, artery: artery ? 1 : 0 });
  }
  kill(cause) { if (!this.dead) { this.dead = true; this.cause = cause; } }
  bleedRate() { let r = 0; for (const w of this.wounds) if (!w.treated) r += w.rate; return r; }
  update(dt) {
    if (this.dead) return;
    const rate = this.bleedRate();
    this.blood -= rate * dt;
    if (rate === 0 && this.blood < 5000) this.blood = Math.min(5000, this.blood + 1.2 * dt);
    // oxygen delivery: heart pumps, lungs/trachea breathe, blood carries it. Wreck any of them and the body fails fast.
    const S = this.s, heart = S.heart.hp / 100, lungs = (S.lungL.hp + S.lungR.hp) / 200, trach = S.trachea.hp / 100;
    this.circ = heart < 0.3 ? 0 : heart;
    this.breath = (trach < 0.25 ? 0 : Math.min(1, trach * 1.2)) * Math.min(1, lungs * 1.25);
    const bloodK = clamp((this.blood - 2300) / 2200, 0, 1);
    const supply = this.circ * this.breath * bloodK;
    if (supply < 0.45) this.o2 -= (0.45 - supply) / 0.45 * 0.3 * dt; else this.o2 = Math.min(1, this.o2 + 0.05 * dt);
    this.shock = Math.max(0, this.shock - dt * 6); this.morphine = Math.max(0, this.morphine - dt * 0.25);
    this.painLvl = this.painLevel(); this.pain = clamp(this.painLvl / 100, 0, 1);
    if (this.painLvl >= 100) this.painDown = true; else if (this.painDown && this.painLvl < 70) this.painDown = false;
    this.concussion = Math.max(0, this.concussion - dt);
    if (this.o2 <= 0) this.kill(this.circ < 0.3 ? 'cardiac' : this.breath < 0.3 ? 'asphyx' : 'bleed');
    if (this.blood < 2300) this.kill('bleed');
  }
  armBroken(s) { if (this.lost['arm' + s]) return true; for (const st of STRUCTS) if (st.arm === s && this.s[st.id].broken) return true; return false; }
  handBroken(s) { return !!this.lost['arm' + s] || this.s['hand' + s].broken; }
  legBroken(s) { if (this.lost['leg' + s]) return true; for (const st of STRUCTS) if (st.leg === s && !st.minor && this.s[st.id].broken) return true; return this.s.pelvisB.broken; }
  // pain: destroyed and damaged organs, untreated fractures, spine, amputations, open wounds and fresh shock from hits
  painLevel() {
    let p = this.shock;
    for (const st of STRUCTS) {
      const s = this.s[st.id];
      if (st.type === 'organ' && s.hp < 100) p += s.hp <= 0 ? 28 : (100 - s.hp) * 0.15;
      else if ((st.type === 'bone' || st.type === 'joint') && s.broken) p += (st.minor ? 6 : st.type === 'joint' ? 14 : 12);
      else if (st.type === 'spine' && s.broken) p += 30;
    }
    p += Object.keys(this.lost).length * 30;
    for (const w of this.wounds) if (!w.treated) p += w.artery ? 6 : 3;
    return Math.max(0, p - this.morphine);
  }
  isDowned() { return this.paralyzed || this.painDown || this.bothLegs(); }
  bothLegs() { return !!this.lost.legL || !!this.lost.legR || (this.legBroken('L') && this.legBroken('R')); }
  anyArm() { return this.armBroken('L') || this.armBroken('R'); }
  treat() {
    let n = 0;
    for (const w of this.wounds) if (!w.treated) { w.treated = true; n++; }
    for (const st of STRUCTS) { const s = this.s[st.id]; if ((st.type === 'bone' || st.type === 'joint') && s.broken) { s.broken = false; s.treated = true; s.hp = Math.max(s.hp, 45); n++; } if (s.severed) { s.treated = true; } }
    this.morphine = 45; this.shock *= 0.3;
    this.version++;
    return n;
  }
  regionHealth(r) {
    let h = this.flesh[r];
    for (const st of STRUCTS_BY_REGION[r] || []) {
      const s = this.s[st.id];
      if (s.broken) h = Math.min(h, 40);
      if (st.type === 'artery' && s.severed && !s.treated) h = Math.min(h, 25);
      if (st.type === 'organ' && s.hp < 60) h = Math.min(h, s.hp * 0.5);
      if (st.type === 'spine' && s.broken) h = Math.min(h, 10);
    }
    return Math.max(0, h);
  }
  regionBleed(r) { let x = 0; for (const w of this.wounds) if (!w.treated && w.region === r) x += w.rate; return x; }
  injuries() {
    const list = [];
    if (this.o2 < 0.98) list.push([100, 'Oxygen ' + Math.round(this.o2 * 100) + '%' + (this.circ < 0.3 ? ': heart failing' : this.breath < 0.45 ? ': suffocating' : ''), '#ff3b30']);
    for (const limb in this.lost) list.push([96, LIMB_NAME[limb] + ' lost' + (this.lost[limb] === 1 ? (limb.startsWith('arm') ? ' at shoulder' : ' at hip') : (limb.startsWith('arm') ? ' at elbow' : ' at knee')), '#ff3b30']);
    if (this.paralyzed) list.push([95, 'Spinal cord injury: paralyzed', '#ff3b30']);
    if (this.painDown) list.push([94, 'Unconscious from pain', '#ff3b30']);
    for (const st of STRUCTS) {
      const s = this.s[st.id];
      if (st.type === 'artery' && s.severed) list.push([s.treated ? 30 : 90, st.name + (s.treated ? ' (clamped)' : ' severed'), s.treated ? '#9aa4ad' : '#ff3b30']);
      else if ((st.type === 'bone' || st.type === 'joint') && s.broken) list.push([70, st.name + (st.type === 'joint' ? ' destroyed' : ' fractured'), '#ffb020']);
      else if ((st.type === 'bone' || st.type === 'joint') && s.treated) list.push([20, st.name + ' splinted', '#9aa4ad']);
      else if (st.type === 'organ' && s.hp < 100) list.push([40 + (100 - s.hp) * 0.4, st.name + (s.hp <= 0 ? ' destroyed' : s.hp < 50 ? ' badly damaged' : ' damaged'), s.hp < 50 ? '#ff6a40' : '#ffd166']);
    }
    let flesh = 0; for (const w of this.wounds) if (!w.treated && !w.artery && /Gunshot/.test(w.name)) flesh++;
    if (flesh) list.push([35, flesh + ' open gunshot wound' + (flesh > 1 ? 's' : ''), '#ffd166']);
    if (this.concussion > 0) list.push([25, 'Concussion', '#ffd166']);
    return list.sort((a, b) => b[0] - a[0]);
  }
}
const DEATH_TEXT = { gaveup: 'gave up', brain: 'head wound', spinal: 'severed spinal cord', cardiac: 'cardiac arrest', bleed: 'blood loss', asphyx: 'suffocation' };
// local-frame conversion of a world hit, for anatomy and for the network
function hitToFrame(hum, mesh, point, dir) {
  const frame = mesh.userData.frame, F = hum.frames[frame];
  F.updateWorldMatrix(true, false);
  const e = F.worldToLocal(point.clone());
  const q = F.getWorldQuaternion(new THREE.Quaternion()).invert();
  let armor = mesh.userData.armor;
  // plate coverage: anything inside the plate's outline counts as hitting the plate, even through the torso mesh
  if (!armor && frame === 'spine' && Math.abs(e.x) < 0.14 && e.y > 0.19 && e.y < 0.5 && e.z < 0) armor = 'plateF';
  if (armor === 'helmet' && hum.helmetOff) armor = undefined;
  return { frame, e, d: dir.clone().applyQuaternion(q).normalize(), armor };
}

// ---------------------------------------------------------------- 2D body panel
const SVGNS = 'http://www.w3.org/2000/svg';
const BODY_SHAPES = {
  head: ['ellipse', { cx: 60, cy: 16, rx: 10, ry: 12 }], neck: ['rect', { x: 55, y: 28, width: 10, height: 7, rx: 2 }],
  chest: ['rect', { x: 41, y: 35, width: 38, height: 36, rx: 8 }], abdomen: ['rect', { x: 44, y: 71, width: 32, height: 22, rx: 4 }], pelvis: ['rect', { x: 43, y: 93, width: 34, height: 16, rx: 6 }],
  uarmL: ['rect', { x: 81, y: 37, width: 10, height: 32, rx: 5 }], farmL: ['rect', { x: 83, y: 70, width: 9, height: 30, rx: 4 }], handL: ['rect', { x: 84, y: 101, width: 9, height: 11, rx: 4 }],
  uarmR: ['rect', { x: 29, y: 37, width: 10, height: 32, rx: 5 }], farmR: ['rect', { x: 28, y: 70, width: 9, height: 30, rx: 4 }], handR: ['rect', { x: 27, y: 101, width: 9, height: 11, rx: 4 }],
  thighL: ['rect', { x: 61, y: 110, width: 15, height: 46, rx: 6 }], shinL: ['rect', { x: 62, y: 157, width: 13, height: 44, rx: 5 }], footL: ['rect', { x: 61, y: 202, width: 16, height: 9, rx: 3 }],
  thighR: ['rect', { x: 44, y: 110, width: 15, height: 46, rx: 6 }], shinR: ['rect', { x: 45, y: 157, width: 13, height: 44, rx: 5 }], footR: ['rect', { x: 43, y: 202, width: 16, height: 9, rx: 3 }]
};
function armPct(v) { v = Math.round(v); return '<span style="color:' + (v <= 0 ? '#ff3b30' : v < 40 ? '#ffb020' : '#e8e8e8') + '">' + (v <= 0 ? 'broken' : v + '%') + '</span>'; }
function makeBodyPanel(container, title) {
  container.innerHTML = '<div class="bp-title">' + title + '</div>';
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 120 216'); svg.setAttribute('class', 'bp-svg');
  const els = {}, marks = {};
  for (const r of REGIONS) {
    const [tag, at] = BODY_SHAPES[r];
    const el = document.createElementNS(SVGNS, tag); for (const k in at) el.setAttribute(k, at[k]);
    el.setAttribute('class', 'bp-reg'); svg.appendChild(el); els[r] = el;
    const bb = tag === 'ellipse' ? { x: at.cx - at.rx, y: at.cy - at.ry, w: at.rx * 2, h: at.ry * 2 } : { x: at.x, y: at.y, w: at.width, h: at.height };
    const zig = document.createElementNS(SVGNS, 'polyline');
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, hw = Math.min(bb.w, 14) / 2;
    zig.setAttribute('points', (cx - hw) + ',' + (cy - 2) + ' ' + (cx - hw / 3) + ',' + (cy + 2) + ' ' + (cx + hw / 3) + ',' + (cy - 2) + ' ' + (cx + hw) + ',' + (cy + 2));
    zig.setAttribute('class', 'bp-frac'); svg.appendChild(zig);
    const drop = document.createElementNS(SVGNS, 'circle'); drop.setAttribute('cx', bb.x + bb.w - 1); drop.setAttribute('cy', bb.y + 2); drop.setAttribute('r', 2.6); drop.setAttribute('class', 'bp-drop'); svg.appendChild(drop);
    marks[r] = { zig, drop };
  }
  const lt = document.createElementNS(SVGNS, 'text'); lt.setAttribute('x', 104); lt.setAttribute('y', 30); lt.setAttribute('class', 'bp-lr'); lt.textContent = 'L'; svg.appendChild(lt);
  const rt = document.createElementNS(SVGNS, 'text'); rt.setAttribute('x', 12); rt.setAttribute('y', 30); rt.setAttribute('class', 'bp-lr'); rt.textContent = 'R'; svg.appendChild(rt);
  const row = document.createElement('div'); row.className = 'bp-row'; container.appendChild(row); row.appendChild(svg);
  const col = document.createElement('div'); col.className = 'bp-col'; row.appendChild(col);
  const stats = document.createElement('div'); stats.className = 'bp-stats'; col.appendChild(stats);
  const list = document.createElement('div'); list.className = 'bp-list'; col.appendChild(list);
  let lastKey = '';
  return {
    update(an, extra) {
      if (!an) { container.style.display = 'none'; return; }
      container.style.display = 'block';
      const rate = an.bleedRate();
      const key = an.version + '|' + Math.round(an.blood / 25) + '|' + Math.round(rate * 10) + '|' + Math.round(an.o2 * 50) + '|' + an.dead + '|' + Math.round(an.painLvl / 2) + '|' + (extra || '');
      if (key === lastKey) return; lastKey = key;
      for (const r of REGIONS) {
        const gone = an.regionLost(r);
        els[r].style.opacity = gone ? '0.15' : '1';
        const h = an.dead || gone ? 0 : an.regionHealth(r), bl = an.regionBleed(r);
        els[r].style.fill = h <= 0 ? '#1a1a1a' : 'hsl(' + Math.round(h * 1.15) + ',62%,' + (30 + h * 0.12) + '%)';
        els[r].classList.toggle('bp-bleed', bl > 0);
        let broken = false; for (const st of STRUCTS_BY_REGION[r] || []) if (an.s[st.id].broken) broken = true;
        marks[r].zig.style.display = broken ? 'block' : 'none';
        marks[r].drop.style.display = bl > 0 ? 'block' : 'none';
        marks[r].drop.setAttribute('r', clamp(1.8 + bl * 0.06, 1.8, 5));
      }
      const pct = Math.max(0, Math.round(an.blood / 50));
      stats.innerHTML = '<span style="color:' + (pct < 70 ? '#ff6a40' : '#e8e8e8') + '">Blood ' + pct + '%</span>' +
        (rate > 0 ? ' &nbsp;<span style="color:#ff4a3a">bleeding ' + rate.toFixed(1) + ' ml/s</span>' : '') + (extra ? '<br>' + extra : '') +
        '<div class="bp-pain"><span>PAIN</span><i><b style="width:' + clamp(an.painLvl, 0, 100) + '%;background:' + (an.painLvl > 70 ? '#ff3b30' : an.painLvl > 40 ? '#ffb020' : '#e8d26a') + '"></b></i></div>' +
        '<div class="bp-arm">Front plate ' + armPct(an.armor.plateF) + '</div>';
      list.innerHTML = an.injuries().slice(0, 7).map(i => '<div style="color:' + i[2] + '">' + i[1] + '</div>').join('');
    }
  };
}

// ---------------------------------------------------------------- labels
function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 28px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(8, 12, 240, 40);
  g.fillStyle = color || '#fff'; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(1.2, 0.3, 1); s.position.y = 2.15;
  return s;
}

