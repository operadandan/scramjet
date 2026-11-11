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
function shotSound(wi, dist, sup) {
  const snd = (WEAPONS[wi] || WEAPONS[0]).snd;
  const P_ = [[3600, 0.65, 0.28, 150, 0.5], [2800, 0.5, 0.2, 150, 0.45], [1700, 0.95, 0.9, 80, 0.9], [3100, 0.65, 0.3, 130, 0.5], [2100, 0.95, 0.55, 90, 0.95]][snd].slice();
  if (sup) { P_[0] *= 0.4; P_[1] *= 0.32; P_[2] *= 0.55; P_[4] *= 0.3; dist *= 2.2; }
  const a = audio(), t = a.currentTime, att = 1 / (1 + dist * (snd === 2 ? 0.03 : 0.07));
  const src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = P_[0] * clamp(1 - dist / (snd === 2 ? 600 : 140), 0.12, 1);
  const g = a.createGain(); g.gain.setValueAtTime(P_[1] * att, t); g.gain.exponentialRampToValueAtTime(0.0008, t + P_[2]);
  src.connect(f).connect(g).connect(aMaster); src.start(t, Math.random() * 0.1, P_[2] + 0.1);
  const o = a.createOscillator(); o.frequency.setValueAtTime(P_[3], t); o.frequency.exponentialRampToValueAtTime(30, t + P_[2] * 0.5);
  const og = a.createGain(); og.gain.setValueAtTime(P_[4] * att, t); og.gain.exponentialRampToValueAtTime(0.001, t + P_[2] * 0.55);
  o.connect(og).connect(aMaster); o.start(t); o.stop(t + P_[2]);
}
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
  P.pitch = clamp(P.pitch + rnd(-0.02, 0.035) * (0.5 + k), -1.5, 1.5); P.yaw += rnd(-0.03, 0.03) * (0.5 + k); P.kick += 0.4 * k;
}
function noiseHit(freq, dur, vol) {
  if (vol < 0.002) return;
  const a = audio(), t = a.currentTime, src = a.createBufferSource(); src.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(aMaster); src.start(t, Math.random() * 0.5, dur + 0.05);
}

