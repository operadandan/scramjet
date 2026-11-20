// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, camera, clamp, damp, renderer, rnd } from './00-setup.js';
import { noiseHit } from './10-audio.js';
import { P, S, dummies } from './17-dummies.js';
import { PITCH_MIN } from './18-player.js';
import { deafen } from './19b-explosives.js';
import { smokeAt } from './27-gadgets.js';
import { matchFrozen } from './28-match.js';
// ---- end module links ----
// ---------------------------------------------------------------- what the eyes see: blinking, flashbangs, smoke and gas,
// passing out, film grain, night vision and the gas mask
// Blinking: every 8-10 s, a quick close and open (~120 ms), nearly unnoticed.
// Flashbang: the view goes completely white and the ears ring; as the white thins, what you were looking at when it went off
// stays burned in, a still frame over the live view, which fades back into the real world over a few seconds.
// Smoke without a mask: coughing, watering eyes (blur), the view sways. CS gas is far worse: the eyes stream and burn (red,
// blurred, nearly shut), choking coughs, aim shakes. A gas mask stops both.
// Downed: the eyes close as you black out (black, the sound goes dull); conscious but down, they stay open with slow heavy
// blinks; coming round, they flutter open.
// A faint grain over everything; night vision is green, bright and much grainier, and shows laser beams.
var EYE = { blinkT: rnd(8, 10), blink: 0, lid: 0, flashK: 0, stillK: 0, grabbed: false, grabReq: false, gasK: 0, smokeK: 0, cough: 0, outK: 0, wasOut: false, grainT: 0, filt: '' };
var eyeEls = null;
function eyeInit() {
  const mk = (id, css) => { const d = document.createElement(id === 'still' || id === 'grain' ? 'canvas' : 'div'); d.id = 'eye_' + id; d.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;' + css; document.body.appendChild(d); return d; };
  eyeEls = {
    still: mk('still', 'z-index:8;opacity:0'),
    lidT: mk('lidT', 'z-index:4;background:#000;height:0;bottom:auto;border-radius:0 0 50% 50% / 0 0 30% 30%'),
    lidB: mk('lidB', 'z-index:4;background:#000;height:0;top:auto;border-radius:50% 50% 0 0 / 30% 30% 0 0'),
    gas: mk('gas', 'z-index:3;opacity:0;background:radial-gradient(ellipse at center,rgba(255,120,90,0) 30%,rgba(190,40,30,.55) 75%,rgba(110,10,10,.9) 100%)'),
    mask: mk('still', 'z-index:4;display:none'),
    grain: mk('grain', 'z-index:4;opacity:0.04;mix-blend-mode:overlay'),
    nvgTube: mk('nvg', 'z-index:4;display:none;background:radial-gradient(circle closest-side at 50% 50%,rgba(0,0,0,0) 90%,rgba(0,0,0,.97) 100%)')
  };
  eyeEls.mask.id = 'eye_mask'; drawMask(); addEventListener('resize', drawMask);
  const g = eyeEls.grain; g.width = 256; g.height = 256; EYE.gctx = g.getContext('2d'); EYE.gimg = EYE.gctx.createImageData(256, 256);
  const st = eyeEls.still; st.width = 640; st.height = 360; EYE.sctx = st.getContext('2d');
}
// the M50's view from inside: two big lenses, the rubber and frame round and between them, a little light on the rims,
// the voicemitter's shadow low in the middle
function drawMask() {
  const c = eyeEls.mask, W = c.width = Math.round(innerWidth / 2), H = c.height = Math.round(innerHeight / 2), g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(7,9,9,0.97)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  for (const s of [-1, 1]) {
    const cx = W / 2 + s * W * 0.205, cy = H * 0.46, rx = W * 0.25, ry = H * 0.4;
    g.save(); g.translate(cx, cy); g.scale(rx, ry); const r = g.createRadialGradient(0, 0, 0.82, 0, 0, 1); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  for (const s of [-1, 1]) { g.strokeStyle = 'rgba(160,170,170,0.18)'; g.lineWidth = Math.max(1, W * 0.004); g.beginPath(); g.ellipse(W / 2 + s * W * 0.205, H * 0.46, W * 0.235, H * 0.385, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke(); }
  const v = g.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, H * 0.35); v.addColorStop(0, 'rgba(0,0,0,0.9)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
// right after the frame is drawn (the loop calls this): keep a copy of it for the flash's burned-in image
function eyeAfterRender() {
  if (!EYE.grabReq || !eyeEls) return;
  EYE.grabReq = false;
  try { EYE.sctx.drawImage(renderer.domElement, 0, 0, 640, 360); EYE.grabbed = true; } catch (e) { EYE.grabbed = false; }
}
// a flashbang reached the eyes: k is how hard (looking at it, close), ears how close for the hearing
function flashHit(k, ears) {
  EYE.flashK = Math.max(EYE.flashK, clamp(k * 1.6, 0, 1) * (1.2 + k * 2.6)); EYE.stillK = Math.max(EYE.stillK, k > 0.25 ? 1 : 0.5); EYE.grabReq = true;
  P.flashBlind = Math.max(P.flashBlind || 0, k * 4);
  deafen(Math.max(ears || 0, k * 0.8));
}
function eyeReset() { EYE.flashK = 0; EYE.stillK = 0; EYE.gasK = 0; EYE.smokeK = 0; EYE.outK = 0; P.flashBlind = 0; P.nvgOn = false; if (eyeEls) setLid(0); }
function toggleNvg() { P.nvgOn = !P.nvgOn; noiseHit(P.nvgOn ? 4200 : 2600, 0.03, 0.04); }
function setLid(k) { const h = (k * 51) + '%'; eyeEls.lidT.style.height = h; eyeEls.lidB.style.height = h; }
function updateEyes(dt) {
  if (!eyeEls) eyeInit();
  const on = S.mode && P.alive, an = P.anat;
  // ---- the flash: white (seconds), then the still frame burned in, fading into the live view
  if (EYE.flashK > 0) EYE.flashK = Math.max(0, EYE.flashK - dt);
  const white = clamp(EYE.flashK, 0, 1);
  $('flashw').style.transition = 'none'; $('flashw').style.opacity = String(white);
  if (white < 1 && EYE.stillK > 0) EYE.stillK = Math.max(0, EYE.stillK - dt * 0.28);
  eyeEls.still.style.opacity = EYE.grabbed ? String(clamp(EYE.stillK * 1.15, 0, 0.95) * (1 - white * 0.3)) : '0';
  if (P.flashBlind > 0) P.flashBlind = Math.max(0, P.flashBlind - dt);
  // ---- smoke and gas where your head is (a gas mask keeps all of it out)
  const masked = P.head === 'gasmask';
  const sK = on && !masked ? smokeAt(camera.position, false) : 0, gK = on && !masked ? smokeAt(camera.position, true) : 0;
  EYE.smokeK = damp(EYE.smokeK, sK, sK > EYE.smokeK ? 2 : 0.4, dt); EYE.gasK = damp(EYE.gasK, gK, gK > EYE.gasK ? 3 : 0.15, dt);
  const choke = Math.max(EYE.smokeK * 0.45, EYE.gasK);
  if (choke > 0.15 && on && !P.downed && !matchFrozen()) {
    EYE.cough -= dt; if (EYE.cough <= 0) { EYE.cough = rnd(0.7, 2) / (0.4 + choke); noiseHit(rnd(180, 320), 0.18, 0.12 * choke); noiseHit(rnd(600, 900), 0.08, 0.05 * choke); P.recShake = Math.min(0.08, (P.recShake || 0) + 0.03 * choke); }
    // the view swims, the aim wanders
    P.pitch = clamp(P.pitch + Math.sin(performance.now() / 310) * 0.0009 * choke, PITCH_MIN, 1.5); P.yaw += Math.sin(performance.now() / 430) * 0.0012 * choke;
  }
  eyeEls.gas.style.opacity = String(clamp(EYE.gasK * 0.9, 0, 0.9));
  P.gasK = EYE.gasK; P.smokeK = EYE.smokeK;
  // ---- the eyelids: blinking, watering eyes in gas, blacking out when downed
  const out = on && P.downed && (an.koT > 0 || an.painDown || an.o2 < 0.35 || (an.blood || 5000) < 1800);
  EYE.outK = damp(EYE.outK, out ? 1 : 0, out ? 1.4 : 2.2, dt);
  // (unconscious, the hearing goes too: the HUD's muffle follows this; down but awake, you still hear)
  S.eyeOut = out && EYE.outK > 0.6; EYE.wasOut = out;
  EYE.blinkT -= dt;
  const heavy = on && P.downed && !out, gasBlink = EYE.gasK > 0.3;
  if (EYE.blinkT <= 0 && on) { EYE.blink = heavy ? 0.9 : gasBlink ? 0.35 : 0.13; EYE.blinkT = heavy ? rnd(2.5, 4.5) : gasBlink ? rnd(0.6, 1.5) : rnd(8, 10); }
  let bl = 0;
  if (EYE.blink > 0) { const tot = heavy ? 0.9 : gasBlink ? 0.35 : 0.13; EYE.blink = Math.max(0, EYE.blink - dt); const u = 1 - EYE.blink / tot; bl = Math.sin(u * Math.PI); }
  const squint = EYE.gasK * 0.55 + (P.flashBlind > 0 ? 0.15 : 0);
  setLid(on ? clamp(Math.max(bl, squint, EYE.outK), 0, 1) : 0);
  // ---- a CSS filter over the game view: smoke and gas blur, night vision green and bright
  const nvg = on && P.head === 'nvg' && P.nvgOn;
  let f = '';
  if (nvg) f += 'grayscale(1) sepia(1) hue-rotate(68deg) saturate(3.2) brightness(' + (1.6 + Math.max(0, 0.6 - (P.envDay || 0.5)) * 3).toFixed(2) + ') contrast(1.25) ';
  const blur = EYE.smokeK * 1.2 + EYE.gasK * 3.5;
  if (blur > 0.05) f += 'blur(' + blur.toFixed(2) + 'px) ';
  if (EYE.gasK > 0.05) f += 'saturate(' + (1 - EYE.gasK * 0.5).toFixed(2) + ') ';
  S.eyeFilt = f.trim();
  eyeEls.nvgTube.style.display = nvg ? 'block' : 'none';
  eyeEls.mask.style.display = on && masked ? 'block' : 'none';
  // ---- grain: always faint; night vision much heavier (not overwhelming)
  EYE.grainT -= dt;
  if (EYE.grainT <= 0) {
    EYE.grainT = 1 / 24; const d = EYE.gimg.data, amp = nvg ? 120 : 70;
    for (let i = 0; i < d.length; i += 4) { const v = 128 + (Math.random() - 0.5) * amp; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
    EYE.gctx.putImageData(EYE.gimg, 0, 0);
  }
  eyeEls.grain.style.opacity = S.mode ? (nvg ? '0.3' : '0.045') : '0';
  // ---- AI bodies and dummies: smoke and gas get to them too (they can't see through it, gas makes them cough and stagger)
  for (const dm of dummies) {
    if (dm.dead || !dm.hum) continue;
    if (dm.flashT > 0) dm.flashT -= dt; if (dm.deafT > 0) dm.deafT -= dt;
    const hp = dm.hum.root.position; EYE._h = EYE._h || camera.position.clone(); EYE._h.set(hp.x, hp.y + 1.6, hp.z);
    dm.smokeK = dm.gasMask ? 0 : smokeAt(EYE._h, false); dm.gasK = dm.gasMask ? 0 : smokeAt(EYE._h, true);
    if (dm.gasK > 0.3 && Math.random() < dt * 0.8) { dm.coughT = 0.6; if (dm.hum.flinch && dm.hum.root.visible) dm.hum.flinch('chest', camera.position.clone().set(0, 0, 1), 0.5 * dm.gasK); }
  }
}

// ---- module exports: build.mjs strips this block ----
export { eyeAfterRender, eyeReset, flashHit, toggleNvg, updateEyes };
// ---- end module exports ----
