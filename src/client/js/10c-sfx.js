// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { camera, clamp, rnd } from './00-setup.js';
import { S_ } from './05-anatomy.js';
import { aMaster, actx, audio, inside, spatial } from './10-audio.js';
import { SFX_CLIPS } from './10b-sfx-data.js';
import { S } from './17-dummies.js';
// ---- end module links ----
// ---------------------------------------------------------------- recorded sounds
// The gunshots, the reloads, cases and shells hitting the floor, people dying, the street: recordings cut into clips
// (tools/sfx-build.py) and packed a file per group in public/sfx. Every clip knows where its first strong transient is
// (its "hit"), so a reload's click is started that much early and lands on the frame the hand seats the magazine.
// Until a file has loaded (or if it never does) the built-in synthesised sounds play instead.
const SND = { buf: {}, shift: {}, loading: false, choke: new Map(), amb: null };
function sfxLoad() {
  if (SND.loading) return; SND.loading = true; const a = actx;
  for (const g of ['m4', 'g17', 'm107', 'sg', 'drop', 'death', 'voice']) fetch('/sfx/' + g + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(b => a.decodeAudioData(b)).then(buf => {
    // (an mp3 decoder may start a few ms late: find where the first sound really is and shift every clip by the difference)
    const d = buf.getChannelData(0); let i = 0; while (i < d.length && Math.abs(d[i]) <= 0.004) i++;
    const sh = i / buf.sampleRate - SFX_CLIPS['_' + g]; SND.shift[g] = Math.abs(sh) < 0.08 ? sh : 0; SND.buf[g] = buf;
  }).catch(() => {});
}
const sfxHas = name => { const c = SFX_CLIPS[name]; return !!(c && SND.buf[c[0]]); };
// a clip's hit, in seconds from its start (0 if it is not loaded)
const sfxHit = (name, i) => { const c = SFX_CLIPS[name]; return c ? c[1][(i | 0) % c[1].length][2] : 0; };
// play one: o.i which variant (random by default), o.vol, o.rate, o.at when its hit should land (context time; now by default),
// o.pos / o.dist where it is (placed in the world through the same distance, wall and reverb chain the gunshots use), o.dry a
// sound at the listener's own hands (no placement, a little of the room), o.out an extra node to go through first
function sfxPlay(name, o) {
  const c = SFX_CLIPS[name]; if (!c || !SND.buf[c[0]]) return null; o = o || {};
  const a = audio(), L = c[1], i = o.i !== undefined ? o.i % L.length : Math.floor(Math.random() * L.length), [off, dur, hit] = L[i], rate = o.rate || 1;
  const now = a.currentTime, want = o.at !== undefined ? o.at - hit / rate : now;   // (lined up on its hit only when told when that should land)
  const S_ = o.dry ? spatial(a, now, null, 0, 'step') : spatial(a, now, o.pos || null, o.dist || 0, o.kind || 'shot');
  const start = Math.max(now, want + (S_.start - now)), skip = Math.max(0, now - want) * rate;
  if (skip >= dur - 0.02) return null;
  const src = a.createBufferSource(); src.buffer = SND.buf[c[0]]; src.playbackRate.value = rate;
  const g = a.createGain(); g.gain.value = o.vol === undefined ? 1 : o.vol;
  src.connect(g); (o.out ? (g.connect(o.out), o.out) : g).connect(S_.input);
  src.start(start, off + SND.shift[c[0]] + skip, dur - skip); return { src, g, end: start + (dur - skip) / rate };
}
// gunshots: a clip for each gun family. A new shot from the same gun cuts the last one's tail short (fast), so full auto is a
// run of reports with the one long tail after the last, not a pile of tails
const SHOT_CLIP = { m4: ['m4_fire', 1], ak74: ['m4_fire', 0.9], g17: ['g17_fire', 1], m9: ['g17_fire', 1.06], m107: ['m107_fire', 1], m870: ['sg_fire', 1] };
function sfxShot(W, dist, sup, pos, att) {
  const sc = SHOT_CLIP[W.id]; if (!sc || !sfxHas(sc[0])) return false;
  const a = audio(), key = W.id + (!dist ? 'me' : pos ? Math.round(pos.x) + ',' + Math.round(pos.y) + ',' + Math.round(pos.z) : ''), prev = SND.choke.get(key);
  if (prev && prev.end > a.currentTime) { const t = a.currentTime; prev.g.gain.cancelScheduledValues(t); prev.g.gain.setValueAtTime(prev.g.gain.value, t); prev.g.gain.linearRampToValueAtTime(0, t + 0.09); prev.src.stop(t + 0.1); }
  // suppressed: the report loses its top and most of its level
  let out; if (sup) { out = a.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 1700; }
  const v = sfxPlay(sc[0], { pos, dist, vol: att * (sup ? 0.4 : 0.95) * (W.id === 'm870' ? 1.05 : 1), rate: sc[1] * rnd(0.97, 1.03), out });
  if (v) { SND.choke.set(key, v); if (SND.choke.size > 40) SND.choke.delete(SND.choke.keys().next().value); }
  return !!v;
}
// ---- reloads and working the action: a list of cues for the move in hand, [when (s into the move), clip, volume], each fired
// its hit early so it lands on its frame
const RL_FAM = { m4: 'm4', ak74: 'm4', g17: 'g17', m9: 'g17', m107: 'm107' };
function reloadCues(W, seq, dur) {
  const f = RL_FAM[W.id]; if (!f || !sfxHas(f + '_out')) return null;
  const C = [], at = (r, n, v) => { if (sfxHas(n)) C.push({ t: r * dur, n, v: v || 1, i: Math.floor(Math.random() * SFX_CLIPS[n][1].length) }); };
  if (f === 'm4') at(0.075, 'm4_press', 0.8);
  at(0.14, f + '_out', 0.9);
  if (seq.fum < 1) at(seq.fum, f === 'm107' ? 'm107_in' : f + '_in', 0.45);
  if (f !== 'm107') at(seq.seat - 0.035, f + '_in', 0.8);
  at(seq.seat, f === 'm107' ? 'm107_in' : f + '_seat', 1);
  if (seq.keys.some(k => k[0] === 0.83)) at(0.83, f === 'm107' ? 'm107_in' : f + '_seat', 0.35);
  return C;
}
function rackCues(W, R) {
  const f = RL_FAM[W.id]; if (!f) return null; const C = [], at = (r, n, v) => { if (sfxHas(n)) C.push({ t: r * R.dur, n, v: v || 1, i: Math.floor(Math.random() * SFX_CLIPS[n][1].length) }); };
  if (f === 'm4') { if (R.type === 'back') at(R.ev, 'm4_chb'); else at(R.ev, 'm4_chf'); }
  else if (f === 'g17') at(R.ev, 'g17_seat', R.type === 'back' ? 0.6 : 0.9);
  else if (R.type === 'tug') { at(0.47, 'm107_back'); at(R.ev, 'm107_fwd'); }
  else if (R.type === 'back') at(R.ev, 'm107_back'); else at(R.ev, 'm107_fwd');
  return C.length ? C : null;
}
// fire the cues whose (start = moment - hit) has come; a cue a frame late is started part way in, so it still lands on time
function runCues(C, t) {
  if (!C) return; const a = actx; if (!a) return;
  for (const c of C) if (!c.done && t >= c.t - sfxHit(c.n, c.i) - 0.02) { c.done = true; sfxPlay(c.n, { dry: true, vol: c.v, i: c.i, at: a.currentTime + (c.t - t) }); }
}
// ---- a spent case or shell's first knock on the floor (the clip carries its bounces)
function sfxDrop(type, p, speed) {
  const n = type === '12g' ? 'hull' : 'brass'; if (!sfxHas(n)) return false;
  const d = p.distanceTo(camera.position); if (d > 30) return true;
  sfxPlay(n, { pos: p, dist: d, kind: 'step', vol: clamp(speed / 3, 0.25, 1) * (type === '50' ? 1.2 : 0.9), rate: type === '9mm' ? 1.12 : type === '50' ? 0.78 : rnd(0.96, 1.04) });
  return true;
}
// ---- dying: each body has one voice (of the two recorded) and gets one of its cries
function sfxDeath(hum, p) {
  if (!hum || !p) return; const v = hum.voice || (hum.voice = Math.random() < 0.5 ? 'die1' : 'die2'); if (!sfxHas(v)) return;
  if (hum.cried && performance.now() - hum.cried < 4000) return; hum.cried = performance.now();
  const d = p.distanceTo(camera.position); if (d > 70) return;
  sfxPlay(v, { pos: p, dist: d, kind: 'shot', vol: 0.85, rate: rnd(0.95, 1.05) });
}
// ---- the street: a loop under everything in town; through the walls (inside the house) it is quieter and duller
function sfxAmbience(dt) {
  const a = actx; if (!a) return;
  if (!SND.amb && !SND.ambLoading) { SND.ambLoading = true; fetch('/sfx/amb.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(b => a.decodeAudioData(b)).then(buf => {
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000; const g = a.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(aMaster); src.start(); SND.amb = { src, f, g, k: 0 }; }).catch(() => {}); }
  const A = SND.amb; if (!A) return;
  const on = S.world !== 'lobby', inH = inside(camera.position), want = on ? (inH ? 0.11 : 0.3) : 0;
  A.k += (want - A.k) * Math.min(1, dt * 1.5); A.g.gain.setTargetAtTime(A.k, a.currentTime, 0.05);
  A.f.frequency.setTargetAtTime(inH ? 900 : 16000, a.currentTime, 0.3);
}

// ---- module exports: build.mjs strips this block ----
export { rackCues, reloadCues, runCues, sfxAmbience, sfxDeath, sfxDrop, sfxHas, sfxLoad, sfxPlay, sfxShot };
// ---- end module exports ----
