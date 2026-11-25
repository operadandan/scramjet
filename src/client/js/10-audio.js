// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, clamp, rnd } from './00-setup.js';
import { HOUSE } from './01b-town.js';
import { S_ } from './05-anatomy.js';
import { WEAPONS } from './06-weapons.js';
import { wmFor } from './16-ballistics.js';
import { P, S } from './17-dummies.js';
import { PITCH_MIN } from './18-player.js';
import { aiClear } from './32-ai.js';
// ---- end module links ----
// ---------------------------------------------------------------- audio
let actx = null, noiseBuf = null, aMaster = null;
function audio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    aMaster = actx.createBiquadFilter(); aMaster.type = 'lowpass'; aMaster.frequency.value = 20000; aMaster.connect(actx.destination);
  }
  return actx;
}
// ---- where a sound is heard from. Gunshots and footsteps are placed in the world: they come from their side (stereo), arrive
// late with distance (sound covers 343 m a second: a rifle 600 m off is heard nearly two seconds after the flash), lose their
// top end with distance (air takes the high frequencies first), and ring the way the place they are in rings: a room is a
// short, loud, boomy slap off every wall; outside, a long thin tail off houses and trees; a shot inside heard from outside
// (or the other way) comes through the walls dull and heavy.
let REV = null;
function makeIR(a, secs, decay, bright, early) {
  const n = Math.round(a.sampleRate * secs), b = a.createBuffer(2, n, a.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / a.sampleRate, w = Math.random() * 2 - 1; lp = lp + (w - lp) * bright; d[i] = lp * Math.pow(1 - i / n, decay) * (early && t < 0.08 ? 1.6 : 1); }
    // a few discrete reflections off near walls/buildings
    for (let k = 0; k < (early ? 8 : 4); k++) { const at = Math.floor(rnd(early ? 0.004 : 0.06, early ? 0.05 : 0.5) * a.sampleRate); if (at < n) d[at] += rnd(0.3, 0.7) * (c ? -1 : 1); }
  }
  return b;
}
function reverbs() {
  if (REV) return REV;
  const a = audio(), mk = (ir, g) => { const c = a.createConvolver(); c.buffer = ir; const gn = a.createGain(); gn.gain.value = g; c.connect(gn).connect(aMaster); return c; };
  REV = { room: mk(makeIR(a, 0.9, 3.2, 0.55, true), 0.9), out: mk(makeIR(a, 3.2, 2.2, 0.18, false), 0.55) };
  return REV;
}
// inside a building? (the house is the only one with an inside)
function inside(p) { if (!p || S.world === 'lobby' || typeof HOUSE === 'undefined') return false; return p.x > HOUSE.x0 && p.x < HOUSE.x1 && p.z > HOUSE.z0 && p.z < HOUSE.z1 && p.y < HOUSE.f1 + HOUSE.H + 0.5; }
// the chain a placed sound goes through: delay (distance), air and wall filtering, pan, dry level, reverb send
function spatial(a, t, pos, dist, kind) {
  const lis = camera.position, inL = inside(lis), inS = pos ? inside(pos) : inL, through = inL !== inS;
  const delay = pos ? dist / 343 : 0, start = t + delay;
  const air = a.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = clamp(18000 / (1 + dist / 60), 700, 18000) * (through ? 0.12 : 1);
  const pan = a.createStereoPanner();
  if (pos && dist > 0.5) { const d = pos.clone().sub(lis).normalize(), r = new V3(1, 0, 0).applyQuaternion(camera.quaternion); pan.pan.value = clamp(d.dot(r), -1, 1) * 0.85; }
  const dry = a.createGain();
  // nearer than about 10 m it is all the shot itself; past that more and more of what is heard is the echo
  const wet = clamp(dist / 90, 0.08, 0.85);
  dry.gain.value = through ? 0.55 : 1 - wet * 0.55;
  air.connect(pan).connect(dry).connect(aMaster);
  const R = reverbs(), send = a.createGain(); send.gain.value = (inS ? 0.85 : 0.35 + wet * 0.6) * (kind === 'step' ? 0.35 : 1);
  pan.connect(send).connect(inS ? R.room : R.out);
  return { input: air, start };
}
// custom gun sounds: drop an audio file's URL in for a weapon id and it plays instead of the built-in one, through the same
// placement, distance and reverb (empty until real recordings are added)
const GUN_SOUNDS = { m4: null, g17: null, m107: null, ak74: null, m9: null, m870: null };
const GUN_BUF = {};
function loadGunSound(id, url) { const a = audio(); return fetch(url).then(r => r.arrayBuffer()).then(b => a.decodeAudioData(b)).then(buf => { GUN_BUF[id] = buf; return true; }).catch(() => false); }
for (const id in GUN_SOUNDS) if (GUN_SOUNDS[id]) loadGunSound(id, GUN_SOUNDS[id]);
function shotSound(wi, dist, sup, pos) {
  const W = WEAPONS[wi] || WEAPONS[0], snd = W.snd;
  const P_ = [[3600, 0.65, 0.28, 150, 0.5], [2800, 0.5, 0.2, 150, 0.45], [1700, 0.95, 0.9, 80, 0.9], [3100, 0.65, 0.3, 130, 0.5], [2100, 0.95, 0.55, 90, 0.95]][snd].slice();
  if (sup) { P_[0] *= 0.4; P_[1] *= 0.32; P_[2] *= 0.55; P_[4] *= 0.3; dist *= 2.2; }
  const a = audio(), t = a.currentTime, att = 1 / (1 + dist * (snd === 2 ? 0.02 : 0.045));
  const S_ = spatial(a, t, pos, dist, 'shot'), at = S_.start;
  // indoors a gunshot is far louder and boomier (the room holds it)
  const room = inside(pos || camera.position) ? 1.35 : 1;
  if (GUN_BUF[W.id]) {
    const b = a.createBufferSource(); b.buffer = GUN_BUF[W.id]; const g = a.createGain(); g.gain.value = att * room * (sup ? 0.35 : 1); b.connect(g).connect(S_.input); b.start(at); return;
  }
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = P_[0];
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(P_[1] * att * room, at); g.gain.exponentialRampToValueAtTime(0.0008, at + P_[2]);
  src.connect(f).connect(g).connect(S_.input); src.start(at, Math.random() * 0.1, P_[2] + 0.1);
  // the low thump (the blast wave)
  const o = a.createOscillator(); o.frequency.setValueAtTime(P_[3], at); o.frequency.exponentialRampToValueAtTime(30, at + P_[2] * 0.5);
  const og = a.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.setValueAtTime(P_[4] * att * room, at); og.gain.exponentialRampToValueAtTime(0.001, at + P_[2] * 0.55);
  o.connect(og).connect(S_.input); o.start(at); o.stop(at + P_[2]);
  // far off: the supersonic crack arrives first if it is coming this way, then the duller report (and the echo off the town)
  if (dist > 120 && !sup) { const s2 = a.createBufferSource(); s2.buffer = noiseBuf; const f2 = a.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 0.7; const g2 = a.createGain(); const e = at + rnd(0.25, 0.6); g2.gain.setValueAtTime(0.0001, t); g2.gain.setValueAtTime(0.35 * att, e); g2.gain.exponentialRampToValueAtTime(0.0008, e + 0.9); s2.connect(f2).connect(g2).connect(S_.input); s2.start(e, Math.random() * 0.2, 1); }
}
// a footstep: what it sounds like depends on what is underfoot and how hard the foot comes down (walk, run, sprint, crouch)
const STEP = { concrete: [1900, 0.05, 0.9], wood: [700, 0.07, 1.1], metal: [2600, 0.08, 0.8], dirt: [420, 0.06, 0.8], glass: [3800, 0.05, 0.6] };
function footSound(pos, surf, k, dist) {
  if (k < 0.02) return;
  // (someone else's steps with a wall between: much quieter, and lost altogether past a few metres)
  if (dist > 0.8 && typeof aiClear === 'function' && !aiClear(camera.position, new V3(pos.x, pos.y + 0.4, pos.z))) { if (dist > 7) return; k *= 0.28; }
  const a = audio(), t = a.currentTime, S_ = spatial(a, t, pos, dist || 0, 'step'), st = STEP[surf] || STEP.concrete, att = 1 / (1 + (dist || 0) * 0.25);
  const src = a.createBufferSource(); src.buffer = noiseBuf; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = st[0] * rnd(0.85, 1.15); f.Q.value = st[2];
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(0.22 * k * att, S_.start); g.gain.exponentialRampToValueAtTime(0.0006, S_.start + st[1] * (1 + k * 0.4));
  src.connect(f).connect(g).connect(S_.input); src.start(S_.start, Math.random() * 0.5, st[1] * 2);
  // the heel's thud under it
  const o = a.createOscillator(); o.frequency.setValueAtTime(surf === 'wood' ? 95 : 70, S_.start); o.frequency.exponentialRampToValueAtTime(40, S_.start + 0.06);
  const og = a.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.setValueAtTime((surf === 'wood' ? 0.25 : 0.12) * k * att, S_.start); og.gain.exponentialRampToValueAtTime(0.0005, S_.start + 0.08);
  o.connect(og).connect(S_.input); o.start(S_.start); o.stop(S_.start + 0.1);
  if (surf === 'dirt' && Math.random() < 0.5) noiseHit(5200, 0.04, 0.02 * k * att);   // grass and grit
}
const _fsR = new THREE.Raycaster(), _fsD = new V3(0, -1, 0);
function surfaceAt(p) { _fsR.set(_fsD.clone().set(p.x, p.y + 0.4, p.z), _fsD); _fsR.far = 0.9; _fsR.firstHitOnly = true; const h = _fsR.intersectObjects(wmFor(_fsR), false)[0]; _fsR.firstHitOnly = false; return h ? (h.object.userData.surf || 'concrete') : 'dirt'; }
function blip(freq, dur, vol, type) {
  if (vol < 0.002) return;
  const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(aMaster); o.start(t); o.stop(t + dur + 0.02);
}
// a round passing close: the supersonic crack, then the whizz falling away. Suppression builds with every near miss.
function suppress(k, speed) {
  if (!P.alive) return;
  P.supp = Math.min(1, (P.supp || 0) + 0.16 + 0.34 * k);
  const a = audio(), t = a.currentTime;
  if (speed > 343) { noiseHit(5200, 0.035, 0.25 + 0.5 * k); noiseHit(1800, 0.06, 0.15 + 0.25 * k); }
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; f.frequency.setValueAtTime(3400, t + 0.01); f.frequency.exponentialRampToValueAtTime(520, t + 0.3);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 + 0.5 * k, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
  src.connect(f).connect(g).connect(aMaster); src.start(t, Math.random() * 0.5, 0.4);
  // flinch
  P.pitch = clamp(P.pitch + rnd(-0.02, 0.035) * (0.5 + k), PITCH_MIN, 1.5); P.yaw += rnd(-0.03, 0.03) * (0.5 + k); P.kick += 0.4 * k;
}
// (at most a dozen of these start in any 40 ms: a grenade's fragments all hitting at once are heard as one roar of hits
// anyway, and a hundred sets of audio nodes made in one frame was a hitch on every blast)
const NH = { t: 0, n: 0 };
function noiseHit(freq, dur, vol) {
  if (vol < 0.002) return;
  const nw = performance.now(); if (nw - NH.t > 40) { NH.t = nw; NH.n = 0; } if (++NH.n > 12) return;
  const a = audio(), t = a.currentTime, src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(aMaster); src.start(t, Math.random() * 0.5, dur + 0.05);
}

// ---- module exports: build.mjs strips this block ----
export { GUN_SOUNDS, aMaster, actx, audio, blip, footSound, inside, loadGunSound, noiseBuf, noiseHit, shotSound, suppress, surfaceAt };
// ---- end module exports ----
