// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, camera, clamp, renderer, rnd } from './00-setup.js';
import { P, S } from './17-dummies.js';
// ---- end module links ----
// ---------------------------------------------------------------- what being hurt, bleeding out and dying look like from inside
// Hit: blood spatters on the screen on the side it came from and runs down it, then dries off. Losing blood: the edges close in
// and pulse with the heart, faster as the blood goes (the colour draining and the blur are in the HUD code). Downed: worse. Dying: the colour goes, the view swims and darkens to black. Dead in a round: after a few seconds
// you watch a living teammate (click to switch).
const SFX = { cv: null, g: null, drips: [], deadT: 0, filt: '', spec: 0, specIdx: 0 };
function sfxInit() {
  const c = document.createElement('canvas'); c.id = 'bfx'; c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';
  const tn = document.createElement('div'); tn.id = 'tunnel'; tn.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 38%,rgba(20,0,0,.55) 70%,rgba(0,0,0,.96) 100%)';
  document.body.appendChild(c); document.body.appendChild(tn);
  SFX.cv = c; SFX.g = c.getContext('2d'); SFX.tn = tn; sfxSize(); addEventListener('resize', sfxSize);
}
function sfxSize() { const c = SFX.cv; c.width = Math.round(innerWidth / 2); c.height = Math.round(innerHeight / 2); }
// blood thrown on the screen: k about 1 for a hit, more for a bad one; it lands on the side the hit came from
function screenBlood(k, dirW) {
  if (!SFX.g) sfxInit();
  const g = SFX.g, W = SFX.cv.width, H = SFX.cv.height;
  // which side: the hit direction seen from the camera (blood comes back out toward the side it went in)
  let sx = rnd(-0.6, 0.6), sy = rnd(-0.4, 0.4);
  if (dirW) { const d = dirW.clone().negate().applyQuaternion(camera.quaternion.clone().invert()); sx = clamp(d.x * 1.4, -0.9, 0.9) + rnd(-0.2, 0.2); sy = clamp(-d.y, -0.6, 0.6) + rnd(-0.2, 0.2); }
  const n = Math.round(2 + k * 4);
  for (let i = 0; i < n; i++) {
    const x = W / 2 + (sx + rnd(-0.35, 0.35)) * W / 2, y = H / 2 + (sy + rnd(-0.35, 0.35)) * H / 2, r = rnd(10, 34) * (0.6 + k * 0.4);
    g.fillStyle = 'rgba(' + Math.round(rnd(80, 130)) + ',0,0,' + rnd(0.55, 0.85) + ')';
    g.beginPath(); for (let a = 0; a < 18; a++) { const t = a / 18 * Math.PI * 2, rr = r * (0.65 + Math.random() * 0.5); g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.85); } g.fill();
    for (let j = 0; j < 6; j++) { const t = Math.random() * Math.PI * 2, d = r * rnd(1.1, 2.4); g.beginPath(); g.arc(x + Math.cos(t) * d, y + Math.sin(t) * d, rnd(1.5, 5), 0, 7); g.fill(); }
    // some of it runs down
    if (Math.random() < 0.7 && SFX.drips.length < 30) SFX.drips.push({ x: x + rnd(-r, r) * 0.5, y: y + r * 0.5, v: rnd(8, 22), r: rnd(1.5, 3.2), life: rnd(1, 3) });
  }
}
function sfxClear() { if (SFX.g) SFX.g.clearRect(0, 0, SFX.cv.width, SFX.cv.height); SFX.drips.length = 0; }
function sfxFilter(f) { if (f !== SFX.filt) { SFX.filt = f; renderer.domElement.style.filter = f; } }
// the teammates still alive, to watch while dead
function specList() { const my = S.team[S.myId]; return [...S.remotes.values()].filter(r => r.alive && !r.rag && S.team[r.id] === my); }
function screenFx(dt) {
  if (!SFX.g) sfxInit();
  const g = SFX.g, W = SFX.cv.width, H = SFX.cv.height;
  // the blood on the screen thins and dries off over several seconds; the runs crawl down, slowing
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,' + Math.min(1, dt * 0.16) + ')'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
  for (let i = SFX.drips.length - 1; i >= 0; i--) {
    const d = SFX.drips[i]; d.life -= dt; d.v *= Math.exp(-dt * 0.6); const y0 = d.y; d.y += d.v * dt; d.x += rnd(-0.3, 0.3);
    g.strokeStyle = 'rgba(110,0,0,0.75)'; g.lineWidth = d.r; g.beginPath(); g.moveTo(d.x, y0); g.lineTo(d.x, d.y); g.stroke();
    if (d.life <= 0 || d.y > H) SFX.drips.splice(i, 1);
  }
  if (!S.mode) { SFX.tn.style.opacity = '0'; sfxFilter(''); return; }
  const an = P.anat;
  if (P.alive) {
    if (SFX.deadT > 0) { SFX.deadT = 0; SFX.spec = 0; sfxClear(); S.filt = null; SFX.filt = ''; }
    // (the colour draining, the blur and the heartbeat while bleeding are the HUD's; this adds the edges closing in, in time with the heart)
    const lost = clamp((4300 - an.blood) / 2000, 0, 1), dn = P.downed ? 1 : 0, w = clamp(lost + dn * 0.35, 0, 1);
    const bpm = 70 + lost * 75 + dn * 25, beat = Math.pow(Math.max(0, Math.sin(performance.now() / 60000 * bpm * Math.PI * 2)), 6);
    SFX.tn.style.opacity = String(clamp(w * 0.7 + beat * 0.25 * w, 0, 1));
    return;
  }
  // dead: the last seconds go grey, swim and darken; then (in a round) the view goes to a teammate
  if (SFX.deadT === 0) screenBlood(1.5, an.lastDir);
  SFX.deadT += dt; const t = SFX.deadT;
  const sp = S.mode === 'online' && t > 4 ? specList() : [];
  if (sp.length) {
    SFX.spec = sp[SFX.specIdx % sp.length].id; $('black').style.transition = 'none'; $('black').style.opacity = '0'; $('dmgv').style.opacity = '0';
    SFX.tn.style.opacity = '0.25'; sfxFilter('grayscale(0.35)'); return;
  }
  SFX.spec = 0;
  SFX.tn.style.opacity = String(clamp(0.7 + t * 0.2, 0, 1));
  sfxFilter('grayscale(1) blur(' + Math.min(6, 1.5 + t * 1.2).toFixed(1) + 'px) brightness(' + Math.max(0.12, 0.8 - t * 0.22).toFixed(2) + ')');
}
// click while dead: the next teammate
function specNext() { if (!P.alive && SFX.spec) SFX.specIdx++; }

// ---- module exports: build.mjs strips this block ----
export { SFX, screenBlood, screenFx, sfxClear, specNext };
// ---- end module exports ----
