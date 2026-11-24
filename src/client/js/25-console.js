// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { $, GFX, GFX_PRESETS, V3, camera, renderer, scene } from './00-setup.js';
import { worldMeshes } from './01-world.js';
import { SITE_PAIRS, TOWN, buildTown } from './01b-town.js';
import { SECONDARIES, WEAPONS } from './06-weapons.js';
import { GUN_SOUNDS, loadGunSound } from './10-audio.js';
import { decals } from './11-fx.js';
import { clearGore } from './12b-gore.js';
import { clearPools } from './14-wounds.js';
import { Dummy, P, S, dummies, keys, mouse } from './17-dummies.js';
import { esc, feed, hurtFlash, localDeath } from './18-player.js';
import { net, teamName } from './19-network.js';
import { EXPL, explode } from './19b-explosives.js';
import { applyGfx, leave, setLoadout } from './22-menu-loop.js';
import { siegeReset } from './23-siege.js';
import { ENV, envClock, envCur, envSet, envShare, lampBreak } from './24-env.js';
import { GADGETS, HEADGEAR } from './27-gadgets.js';
import { loadoutUI } from './28-match.js';
import { demolish } from './30-structure.js';
// ---- end module links ----
// ---------------------------------------------------------------- the command bar
// ` (or /) opens it; Enter runs what is typed, Esc closes it, Up/Down go through what was typed before. "help" lists the
// commands. Online, the time and the weather belong to the host (anyone else asking is told so); the testing-only commands
// (god, heal, tp, dummies) work only in testing mode.
const CON = { open: false, hist: [], hi: -1, el: null, inp: null, log: null, fps: false, fpsEl: null, fpsN: 0, fpsT: 0, god: false };
function conInit() {
  const el = document.createElement('div'); el.id = 'con';
  el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:30;display:none;font:13px ui-monospace,Menlo,Consolas,monospace;color:#dfe6ec';
  el.innerHTML = '<div id="conlog" style="max-height:38vh;overflow:auto;background:rgba(8,10,13,.82);border:1px solid #2c343d;border-bottom:none;border-radius:6px 6px 0 0;padding:8px 10px;white-space:pre-wrap"></div><input id="coninp" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;background:rgba(8,10,13,.95);border:1px solid #2c343d;border-radius:0 0 6px 6px;color:#fff;padding:8px 10px;font:inherit;outline:none" placeholder="type a command (help for the list)">';
  document.body.appendChild(el); CON.el = el; CON.inp = el.querySelector('#coninp'); CON.log = el.querySelector('#conlog');
  CON.inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = CON.inp.value.trim(); CON.inp.value = ''; if (v) { CON.hist.unshift(v); CON.hist.length = Math.min(CON.hist.length, 40); CON.hi = -1; conRun(v); } }
    else if (e.key === 'Escape' || e.code === 'Backquote') { e.preventDefault(); conClose(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); CON.hi = Math.min(CON.hist.length - 1, CON.hi + 1); if (CON.hist[CON.hi]) CON.inp.value = CON.hist[CON.hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); CON.hi = Math.max(-1, CON.hi - 1); CON.inp.value = CON.hi >= 0 ? CON.hist[CON.hi] : ''; }
  });
  CON.inp.addEventListener('keyup', e => e.stopPropagation());
  const f = document.createElement('div'); f.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:9;font:12px ui-monospace,monospace;color:#9fe39f;text-shadow:0 1px 2px #000;display:none'; document.body.appendChild(f); CON.fpsEl = f;
  conPrint('BREACH command bar. Type help for the list of commands.');
}
function conPrint(s, c) { if (!CON.el) conInit(); const d = document.createElement('div'); d.textContent = s; if (c) d.style.color = c; CON.log.appendChild(d); while (CON.log.childNodes.length > 120) CON.log.firstChild.remove(); CON.log.scrollTop = 1e9; }
function conOpen(slash) {
  if (!CON.el) conInit(); CON.open = true; CON.el.style.display = 'block';
  for (const k in keys) keys[k] = false; mouse.left = false;
  if (document.pointerLockElement) document.exitPointerLock();
  CON.inp.value = slash ? '/' : ''; setTimeout(() => CON.inp.focus(), 0);
}
function conClose(locked) {
  CON.open = false; if (CON.el) CON.el.style.display = 'none'; CON.inp && CON.inp.blur();
  // back to the game; if the browser won't give the mouse back without a click, the pause menu is there to click
  if (S.mode && !locked) { renderer.domElement.requestPointerLock(); if (!S.locked) $('pause').style.display = 'flex'; }
}
// the host's say over the time and the weather, online
const conCanEnv = () => S.mode !== 'online' || net.mode === 'host';
const conTest = () => S.mode === 'test';
const CMDS = {
  help: ['help [command]  list the commands, or how one is used', a => { if (a[0] && CMDS[a[0]]) return conPrint(CMDS[a[0]][0]); for (const [k, v] of Object.entries(CMDS)) conPrint(k.padEnd(10) + v[0]); }],
  time: ['time <0-24 | dawn | day | dusk | night>  set the time of day', a => {
    if (!a[0]) return conPrint('It is ' + envClock() + '.');
    if (!conCanEnv()) return conPrint('Only the host can change the time.', '#ff8a7a');
    const named = { dawn: 6.2, morning: 9, day: 13, noon: 12, dusk: 19.3, evening: 20, night: 23, midnight: 0 }, h = named[a[0]] !== undefined ? named[a[0]] : parseFloat(a[0]);
    if (!Number.isFinite(h)) return conPrint('time: give an hour (0-24) or dawn/day/dusk/night', '#ff8a7a');
    ENV.tod = ((h % 24) + 24) % 24; envShare(); conPrint('Time set to ' + envClock() + '.');
  }],
  timescale: ['timescale <x>  how fast the day goes (1 = an hour a day, 0 stops the clock)', a => {
    if (!conCanEnv()) return conPrint('Only the host can change that.', '#ff8a7a');
    const x = parseFloat(a[0]); if (!Number.isFinite(x) || x < 0 || x > 60) return conPrint('timescale: 0 to 60', '#ff8a7a');
    ENV.rate = x / 150; envShare(); conPrint('A day now takes ' + (x ? Math.round(60 / x) + ' minutes' : 'forever (the clock is stopped)') + '.');
  }],
  weather: ['weather <clear | cloudy | rain | storm | fog>  change the weather', a => {
    if (!a[0]) return conPrint('The weather is ' + envCur() + '.');
    if (!conCanEnv()) return conPrint('Only the host can change the weather.', '#ff8a7a');
    if (!envSet(a[0], a[1] === 'now')) return conPrint('weather: clear, cloudy, rain, storm or fog (add "now" to skip the change-over)', '#ff8a7a');
    envShare(); conPrint('The weather is turning ' + a[0] + '.');
  }],
  fov: ['fov <60-110>  field of view', a => { const v = parseFloat(a[0]); if (!(v >= 60 && v <= 110)) return conPrint('fov: 60 to 110', '#ff8a7a'); GFX.fov = v; applyGfx(); conPrint('FOV ' + v + '.'); }],
  sens: ['sens <0.2-3>  mouse sensitivity', a => { const v = parseFloat(a[0]); if (!(v >= 0.2 && v <= 3)) return conPrint('sens: 0.2 to 3', '#ff8a7a'); GFX.sens = v; applyGfx(); conPrint('Sensitivity ' + v + '.'); }],
  gfx: ['gfx <low | medium | high | ultra>  graphics preset', a => { const k = Object.keys(GFX_PRESETS).find(p => p.startsWith(a[0] || '?')); if (!k) return conPrint('gfx: ' + Object.keys(GFX_PRESETS).join(', '), '#ff8a7a'); Object.assign(GFX, GFX_PRESETS[k], { preset: k }); applyGfx(); conPrint('Graphics: ' + k + '.'); }],
  fps: ['fps  show or hide the frame rate', () => { CON.fps = !CON.fps; CON.fpsEl.style.display = CON.fps ? 'block' : 'none'; conPrint('Frame rate ' + (CON.fps ? 'shown' : 'hidden') + '.'); }],
  say: ['say <message>  chat to everyone in the room', a => { const t = a.join(' ').slice(0, 120); if (!t) return; if (S.mode !== 'online') return conPrint('Not in a room.', '#ff8a7a'); net.send({ t: 'chat', s: t }); feed(teamName(S.myId) + ': ' + esc(t)); }],
  team: ['team  which side you are on', () => { const t = S.team && S.team[S.myId]; conPrint(S.mode !== 'online' ? 'No teams in testing mode.' : t ? (t === 'r' ? 'Red, attacking.' : 'Blue, defending.') : 'No team yet.'); }],
  players: ['players  who is in the room', () => { if (S.mode !== 'online') return conPrint('Not in a room.'); conPrint((S.myName || 'You') + ' (you)' + (S.team[S.myId] ? ' [' + S.team[S.myId] + ']' : '')); for (const r of S.remotes.values()) conPrint(r.name + (S.team[r.id] ? ' [' + S.team[r.id] + ']' : '') + (r.alive ? '' : ' (dead)')); }],
  kill: ['kill  die on the spot', () => { if (!S.mode || !P.alive) return; P.anat.kill('bleed'); localDeath(); conClose(); }],
  clear: ['clear  wipe this log', () => { CON.log.innerHTML = ''; }],
  clean: ['clean  clear away blood, bodies and debris (testing mode)', () => { if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a'); clearPools(); clearGore(); for (const d of decals) scene.remove(d); decals.length = 0; conPrint('Cleaned up.'); }],
  god: ['god  can not be hurt (testing mode)', () => { if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a'); CON.god = !CON.god; conPrint('God mode ' + (CON.god ? 'on' : 'off') + '.'); }],
  heal: ['heal  patched up and full of blood (testing mode)', () => { if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a'); P.anat.treat(); P.anat.blood = 5000; P.anat.pain = 0; conPrint('Healed.'); }],
  tp: ['tp <x> <y> <z>  move there (testing mode)', a => { if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a'); const v = a.map(parseFloat); if (v.length !== 3 || !v.every(Number.isFinite)) return conPrint('tp x y z', '#ff8a7a'); P.pos.set(v[0], v[1], v[2]); P.vel.set(0, 0, 0); conPrint('Moved.'); }],
  pos: ['pos  where you are', () => conPrint(P.pos.toArray().map(v => v.toFixed(2)).join(' ') + '  (facing ' + Math.round(THREE.MathUtils.radToDeg(P.yaw)) + ' deg)')],
  leave: ['leave  back to the menu', () => { conClose(); if (S.mode) leave(); }],
  // ---- with parameters (testing range unless noted)
  give: ['give <item> [count]  items: c4, sledge, claymore, beartrap, wire, shield, alarm, frag, smoke, flash, teargas, gasmask, nvg, ammo, or a gun: m4, m107, m870, g17', a => {
    if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a');
    const it = (a[0] || '').toLowerCase(), n = Math.max(1, Math.min(99, parseInt(a[1]) || 0)), G = GADGETS[it];
    if (G) {
      if (G.slot === 2) { P.tool2 = it; P.gN = parseInt(a[1]) ? n : G.n; }
      else if (G.slot === 3) { P.tool3 = it; P.fragN = parseInt(a[1]) ? n : G.n; }
      else { P.toolB = it; if (it === 'c4') P.c4N = parseInt(a[1]) ? n : G.n; if (it === 'bcharge') P.bcN = parseInt(a[1]) ? n : G.n; }
      return conPrint('Given: ' + G.name + (G.n || parseInt(a[1]) ? ' x' + (parseInt(a[1]) ? n : G.n) : '') + '  (slot ' + (G.slot === 2 ? 3 : G.slot === 3 ? 4 : 6) + ')');
    }
    if (HEADGEAR[it]) { P.head = it; P.nvgOn = false; return conPrint('Wearing: ' + HEADGEAR[it].name); }
    if (it === 'ammo') { for (const g of P.guns || []) if (g) { g.mags = (g.mags || []).map(() => WEAPONS[g.w] ? WEAPONS[g.w].mag : 30); } return conPrint('Magazines refilled.'); }
    const gi = WEAPONS.findIndex(w => w.id === it);
    if (gi >= 0) { if (SECONDARIES.includes(gi)) setLoadout(P.loadout[0], gi); else setLoadout(gi, P.loadout[1]); return conPrint('Given: ' + WEAPONS[gi].name); }
    conPrint('No such item: ' + it, '#ff8a7a');
  }],
  spawn: ['spawn <dummy | ai> [count] [metres]  put dummies or AI defenders in front of you', a => {
    if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a');
    const kind = (a[0] || 'dummy').toLowerCase(), n = Math.max(1, Math.min(12, parseInt(a[1]) || 1)), d = Math.max(2, Math.min(60, parseFloat(a[2]) || 6));
    const fw = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    for (let i = 0; i < n; i++) { const p = P.pos.clone().addScaledVector(fw, d).add(new V3((i - (n - 1) / 2) * 1.4, 0, 0));
      if (kind === 'ai' && typeof spawnAI === 'function') spawnAI(p, 'b'); else dummies.push(new Dummy(p.x, p.z, 'idle', 'Dummy')); }
    conPrint('Spawned ' + n + ' ' + (kind === 'ai' ? 'AI defender' : 'dumm') + (n > 1 ? (kind === 'ai' ? 's' : 'ies') : (kind === 'ai' ? '' : 'y')) + '.');
  }],
  explode: ['explode <c4 | frag | claymore | flash | smoke | teargas> [metres]  set one off where you look', a => {
    if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a');
    const k = (a[0] || 'frag').toLowerCase(); if (!EXPL[k]) return conPrint('Kinds: ' + Object.keys(EXPL).join(', '), '#ff8a7a');
    const d = camera.getWorldDirection(new V3()), r = new THREE.Raycaster(camera.position.clone(), d, 0, parseFloat(a[1]) || 40), h = r.intersectObjects(worldMeshes, false)[0];
    const p = h ? h.point.clone().addScaledVector(d, -0.2) : camera.position.clone().addScaledVector(d, parseFloat(a[1]) || 10);
    explode(p, k, S.myIdOr0(), true); conPrint('Boom: ' + k);
  }],
  hurt: ['hurt <region> [amount]  hit yourself (regions: head chest abdomen thighL shinL uarmR ...)', a => {
    if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a');
    const reg = a[0] || 'chest', amt = Math.max(1, Math.min(300, parseFloat(a[1]) || 40)), fr = { head: 'head', neck: 'neck', chest: 'spine', abdomen: 'spine', pelvis: 'hips', thighL: 'lgL', thighR: 'lgR', shinL: 'knL', shinR: 'knR', uarmL: 'shL', uarmR: 'shR', farmL: 'elL', farmR: 'elR' }[reg];
    if (!fr) return conPrint('Unknown region', '#ff8a7a');
    P.anat.blunt(fr, new V3(0, -0.1, 0), amt / 60); hurtFlash(); conPrint('Hit ' + reg + ' for ' + amt);
  }],
  sites: ['sites <0-3>  move the bombs to another pair of rooms (rebuilds the house)', a => {
    if (S.mode === 'online') return conPrint('Only the room can do that online.', '#ff8a7a');
    const i = Math.max(0, Math.min(3, parseInt(a[0]) || 0)); if (S.world === 'town' || S.mode === 'test') { buildTown(i); siegeReset && siegeReset(); conPrint('Bombs: ' + SITE_PAIRS[i].map(s => s.name).join(' / ')); }
  }],
  lights: ['lights <on | off>  the house lights (all of them)', a => {
    const off = (a[0] || '').toLowerCase() === 'off'; for (const L of TOWN.lampAll || []) { if (off) lampBreak(TOWN.lampAll.indexOf(L), L.p, new V3(0, -1, 0)); }
    conPrint(off ? 'Lights out.' : 'Lights come back when the house is rebuilt (sites or a new round).');
  }],
  loadout: ['loadout  open the loadout (testing mode; online while the round loads)', () => { conClose(); if (S.mode === 'test' || (S.R && S.R.ph === 'load')) loadoutUI(true); else conPrint('Not now.', '#ff8a7a'); }],
  slowmo: ['slowmo <0.05-1>  game speed (testing mode)', a => { if (!conTest()) return conPrint('Testing mode only.', '#ff8a7a'); const v = parseFloat(a[0]); if (!(v >= 0.05 && v <= 1)) return conPrint('0.05 to 1', '#ff8a7a'); S.ts = v; S.slow = v < 1; conPrint('Speed ' + v); }],
  sound: ['sound <gun> <url>  play your own recording for a gun (m4, ak74, g17, m9, m870, m107)', a => {
    const id = (a[0] || '').toLowerCase(), url = a[1]; if (!(id in GUN_SOUNDS) || !url) return conPrint('sound <gun> <url>', '#ff8a7a');
    loadGunSound(id, url).then(ok => conPrint(ok ? 'Loaded the ' + id + ' sound.' : 'Could not load that file.', ok ? undefined : '#ff8a7a'));
  }],
  demolish: ['demolish  take out the house\'s supports and watch it come down (host or testing range)', () => {
    if (S.mode === 'test') { conPrint('Bringing it down: ' + demolish() + ' supports gone.'); return; }
    if (net.mode !== 'host' || !net.host) return conPrint('Only the host can do that.', '#ff8a7a');
    if (net.host.R) net.host.R.demo = true; net.host.broadcast({ t: 'demo' }); conPrint('Bringing it down for everyone.');
  }],
  server: ['server [name <text> | time <0-24> | weather <kind> | win <n> | public <on|off>]  your server\'s settings (host only)', a => {
    if (net.mode !== 'host' || !net.host) return conPrint('Only the host can change the server.', '#ff8a7a');
    const c = net.host.cfg, k = (a[0] || '').toLowerCase(), v = a.slice(1).join(' ');
    if (!k) return conPrint(Object.entries(c).map(([x, y]) => x + ': ' + y).join('  '));
    if (k === 'name') c.name = v.replace(/[<>]/g, '').slice(0, 32) || c.name;
    else if (k === 'time') { const t = parseFloat(v); if (t >= 0 && t <= 24) { c.tod = t; ENV.tod = t; envShare(); } }
    else if (k === 'weather') { if (envSet(v, true)) { c.weather = v; envShare(); } }
    else if (k === 'win') c.win = Math.max(1, Math.min(10, parseInt(v) || 5));
    else if (k === 'public') { c.pub = v === 'on' ? 1 : 0; S.pub = !!c.pub; }
    else return conPrint('Settings: name, time, weather, win, public', '#ff8a7a');
    conPrint('Server: ' + k + ' set.');
  }]
};
function conRun(line) {
  conPrint('> ' + line, '#9aa4ad');
  const a = line.replace(/^\//, '').split(/\s+/), c = (a.shift() || '').toLowerCase(), cmd = CMDS[c];
  if (!cmd) return conPrint('No such command: ' + c + ' (help for the list)', '#ff8a7a');
  try { cmd[1](a.map(x => x.toLowerCase() === x ? x : x)); } catch (e) { conPrint('That went wrong: ' + e.message, '#ff8a7a'); }
}
addEventListener('keydown', e => {
  if (CON.open || e.repeat) return;
  if (e.code === 'Backquote' || (e.code === 'Slash' && S.mode)) { e.preventDefault(); e.stopImmediatePropagation(); conOpen(e.code === 'Slash'); }
}, true);
function updateConsole(dt) {
  if (!CON.fps) return; CON.fpsN++; CON.fpsT += dt;
  if (CON.fpsT >= 0.5) { CON.fpsEl.textContent = Math.round(CON.fpsN / CON.fpsT) + ' FPS'; CON.fpsN = 0; CON.fpsT = 0; }
}

// ---- module exports: build.mjs strips this block ----
export { CON, conClose, updateConsole };
// ---- end module exports ----
