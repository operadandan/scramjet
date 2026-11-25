// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, camera, renderer, scene } from './00-setup.js';
import { TEX } from './01-world.js';
import { warmShaders } from './15-destruction.js';
import { S } from './17-dummies.js';
import { esc } from './18-player.js';
import { api, sleep } from './19-network.js';
import { settingsUI, startOnline } from './22-menu-loop.js';
import { warmFx } from './22b-warm.js';
import { loadoutUI, queueUp } from './28-match.js';
// ---- end module links ----
// ---------------------------------------------------------------- the main menu, the server browser, the server settings and
// the loading screen (everything that is between the menu and being in the world)
const TIPS = [
  'Rifle rounds go through one ordinary wall and stop in the next. Brick stops nearly everything but the .50.',
  'Window boards come off with a gun bash (V), two or three hits a window.',
  'A shotgun blast dents a metal door; two or three and it falls out of its frame. Wooden doors come off.',
  'Walls hold up what is above them. Blow out enough of them and the roof comes down.',
  'Some wounds can\'t be saved: if the down screen says so, you are out of the round.',
  'A gas mask makes smoke and tear gas harmless. Night vision shows every laser beam.',
  'Gunshots inside a room are loud and short; across the street they arrive late and echo.',
  'H turns your shoulder light on. It shows where you are as much as what is in front of you.',
  'The bombs move to a different pair of rooms every round.'
];
// the loading screen: what is loaded and compiled before you are put in the world, so the first seconds don't stutter
async function deploy(title, run) {
  const L = $('loading'); L.style.display = 'flex'; $('ltitle').textContent = title; $('ltip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const step = async (pct, txt) => { $('lbar').style.width = pct + '%'; $('lstep').textContent = txt; await new Promise(r => requestAnimationFrame(() => setTimeout(r, 40))); };
  try {
    await step(6, 'Loading textures');
    for (let k = 0; k < 60 && !Object.values(TEX).every(t => !t.image || t.image.complete !== false); k++) await sleep(50);
    await step(22, 'Building the world');
    await run();
    await step(55, 'Compiling materials');
    // (never more than a few seconds: a material that never reports ready must not hold the loading screen forever)
    try { if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, camera).catch(() => {}), sleep(4000)]); else renderer.compile(scene, camera); } catch (e) {}
    await step(75, 'Warming up effects');
    try { warmShaders(); } catch (e) {}
    try { warmFx(); } catch (e) {}
    await step(92, 'Placing operators');
    try { renderer.render(scene, camera); } catch (e) {}
    await step(100, 'Ready');
  } finally {
    await sleep(150); L.style.transition = 'opacity .35s'; L.style.opacity = '0'; await sleep(360); L.style.display = 'none'; L.style.opacity = '1'; L.style.transition = '';
  }
}
// the server settings from the create panel
function serverCfg(raid) {
  if (raid) return { name: (S.myName || 'Operator') + "'s raid", mode: 'raid', pub: +$('rd_pub').value, tod: +$('rd_tod').value, weather: 'rain', dayLen: 60, win: 5, max: 6 };
  return { name: ($('cf_name').value || '').replace(/[<>]/g, '').trim().slice(0, 32) || (playerNameSafe() + "'s server"), mode: $('cf_mode').value, pub: +$('cf_pub').value, tod: +$('cf_tod').value, weather: $('cf_weather').value, dayLen: +$('cf_day').value, win: +$('cf_win').value, max: +$('cf_max').value };
}
function playerNameSafe() { return (($('name') && $('name').value) || 'Operator').replace(/[<>]/g, '').slice(0, 16); }
// ---- the left-hand menu
let mPane = 'play';
function menuPane(p) {
  mPane = p;
  document.querySelectorAll('#mnav .mi').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  for (const k of ['play', 'raid', 'mis', 'train', 'opts']) $('mp_' + k).style.display = k === p ? 'flex' : 'none';
  if (p === 'opts') settingsUI(true);
  if (p === 'play') serverList();
}
document.querySelectorAll('#mnav .mi').forEach(b => b.onclick = () => menuPane(b.dataset.p));
// ---- the server browser: every public server, what it runs, how full, whether a match is on
let sBusy = false;
async function serverList() {
  if (sBusy) return; sBusy = true;
  const box = $('slist');
  try {
    const j = await api('/api/servers'), L = (j.servers || []);
    box.innerHTML = L.length ? L.map(s => '<div class="srv" data-c="' + s.code + '"><b>' + esc(s.name) + '</b><span class="md">' + (s.mode === 'raid' ? 'RAID' : 'SIEGE') + '</span><span>' + esc(s.map) + '</span><span class="ph' + (s.ph === 'lobby' ? '' : ' live') + '">' + (s.ph === 'lobby' ? 'LOBBY' : 'IN MATCH') + '</span><span class="n">' + s.n + ' / ' + s.max + '</span></div>').join('')
      : '<div class="sempty">No public servers right now. Quick match makes one, or create your own.</div>';
    box.querySelectorAll('.srv').forEach(r => r.onclick = () => { S.pub = true; S.cfg = null; const c = r.dataset.c; deploy('JOINING ' + c, () => startOnline(c, false)); });
  } catch (e) { box.innerHTML = '<div class="sempty">The server list is unavailable (multiplayer may not be set up on this deployment).</div>'; }
  sBusy = false;
}
$('srefresh').onclick = () => serverList();
setInterval(() => { if (!S.mode && mPane === 'play' && $('menu').style.display !== 'none') serverList(); }, 7000);
// ---- raid
$('raidq').onclick = () => queueUp('raid');
$('raidcreate').onclick = () => { S.cfg = serverCfg(true); S.pub = !!S.cfg.pub; let c = ''; for (let i = 0; i < 5; i++) c += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]; deploy('RAID', () => startOnline(c, true)); };
// ---- the pause menu's loadout button (the range any time; online only while loadouts are open)
$('openlo').onclick = () => { if (S.mode === 'test' || (S.R && S.R.ph === 'load')) { $('pause').style.display = 'none'; loadoutUI(true); } else $('lonote').textContent = 'The loadout opens before each round.'; };
$('mbuild').textContent = '2026.11';
setTimeout(() => serverList(), 600);

// ---- module exports: build.mjs strips this block ----
export { deploy, serverCfg };
// ---- end module exports ----
