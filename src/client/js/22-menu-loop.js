// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { $, ENABLE_TEST_MODE, GFX, GFX_PRESETS, V3, camera, damp, lerp, renderScope, renderer, scene, sun, sunDir, vmCamera, vmScene } from './00-setup.js';
import { buildTest, spawns } from './01-world.js';
import { buildTown } from './01b-town.js';
import { updateCloth } from './02-body-parts.js';
import { limbBodies, ragdolls, updateLimbs } from './04-ragdoll.js';
import { freshGuns } from './06-weapons.js';
import { updateDevices } from './09-attachments.js';
import { audio, inside } from './10-audio.js';
import { sfxAmbience } from './10c-sfx.js';
import { decals, splatGeo, updateHeats } from './11-fx.js';
import { drops } from './12-blood.js';
import { clearGore, updateGore } from './12b-gore.js';
import { tpCamera, updateTPBody } from './13-third-person.js';
import { clearPools, splatIM, updateBlood, updatePools } from './14-wounds.js';
import { DEB_POOLS, debris, updateDebris, updateFx, warmShaders } from './15-destruction.js';
import { doors, updateDoors } from './15b-doors.js';
import { bullets, props, removeBullet, updateBullets, updateProps } from './16-ballistics.js';
import { P, S, dummies, localBody, spawnDummies } from './17-dummies.js';
import { esc, respawnLocal, updatePlayer, updateWeapons } from './18-player.js';
import { api, joinPeer, net, netSend, onNet, roundHud, startHosting } from './19-network.js';
import { clearExplosives, updateExplosives } from './19b-explosives.js';
import { updateBash } from './19c-toolvm.js';
import { setPixelation, updateCamera, updateHUD, updateViewmodel } from './20-camera-hud-input.js';
import { clearItems, hlMesh, openAttMenu, updateInv, updatePickup, updateToolbar } from './21-items-inventory.js';
import { screenFx } from './21b-screenfx.js';
import { warmFx } from './22b-warm.js';
import { SG, siegeClear, siegeUpdate } from './23-siege.js';
import { updateEnv } from './24-env.js';
import { updateConsole } from './25-console.js';
import { updateLights } from './26-lights.js';
import { gadgetGhostOff, updateGadgets, wireDrag } from './27-gadgets.js';
import { freezeBegin, freezeEnd, loadoutUI, matchHud, queueUp } from './28-match.js';
import { eyeAfterRender, updateEyes } from './29-eyes.js';
import { updateStructure } from './30-structure.js';
import { deploy, serverCfg } from './31-menu.js';
import { CQC, cqcReset, navClear, updateAI } from './32-ai.js';
// ---- end module links ----
// ---------------------------------------------------------------- scoreboard
S.score = {};
function scoreOf(id) { return S.score[id] || (S.score[id] = { k: 0, d: 0 }); }
function renderScore() {
  const rows = [];
  if (S.mode === 'online') {
    rows.push({ me: true, id: S.myId, dfz: typeof SG !== 'undefined' && SG.carrier === S.myId, name: S.myName || 'You', st: !P.alive ? 'Dead' : P.downed ? 'Downed' : 'Alive', ...scoreOf(S.myId) });
    for (const r of S.remotes.values()) rows.push({ id: r.id, dfz: typeof SG !== 'undefined' && SG.carrier === r.id && S.team[r.id] === S.team[S.myId], name: r.name, st: !r.alive ? 'Dead' : r.rag ? 'Downed' : 'Alive', ...scoreOf(r.id) });
    $('scoretitle').textContent = 'ROOM ' + S.room + (net.mode === 'host' ? '  (you are hosting)' : '');
  } else {
    rows.push({ me: true, name: S.myName || playerName(), st: !P.alive ? 'Dead' : P.downed ? 'Downed' : 'Alive', k: S.testKills || 0, d: S.testDeaths || 0 });
    $('scoretitle').textContent = 'TESTING MODE';
  }
  rows.sort((a, b) => b.k - a.k || a.d - b.d);
  const table = L => '<table><thead><tr><th>PLAYER</th><th>STATUS</th><th class="n">K</th><th class="n">D</th></tr></thead><tbody>' + L.map(r => '<tr' + (r.me ? ' class="me"' : '') + '><td>' + esc(r.name) + (r.dfz ? ' <span style="color:#ffd166">[DEFUSER]</span>' : '') + '</td><td' + (r.st === 'Dead' ? ' class="dead"' : '') + '>' + r.st + '</td><td class="n">' + r.k + '</td><td class="n">' + r.d + '</td></tr>').join('') + '</tbody></table>';
  // online: the attackers (red) on the left, the defenders (blue) on the right, each with their round wins
  if (S.mode === 'online') {
    const sc = (S.R && S.R.sc) || { r: 0, b: 0 }, of = t => rows.filter(r => S.team[r.id] === t);
    $('scorebody').innerHTML = '<div class="teams"><div><h4 style="color:#ff6a5a">RED · ATTACK · ' + sc.r + '</h4>' + table(of('r')) + '</div><div><h4 style="color:#6aa0ff">BLUE · DEFEND · ' + sc.b + '</h4>' + table(of('b')) + '</div></div>' + (rows.some(r => !S.team[r.id]) ? table(rows.filter(r => !S.team[r.id])) : '');
  } else $('scorebody').innerHTML = table(rows);
}
// loadout
function syncLoadoutUI() { for (const [p, s2] of [['lo_p2', 'lo_s2']]) { $(p).value = String(P.loadout[0]); $(s2).value = String(P.loadout[1]); } }
function setLoadout(pri, sec) {
  P.loadout = [pri, sec]; try { localStorage.setItem('breach_loadout', JSON.stringify(P.loadout)); } catch (e) {}
  syncLoadoutUI();
  if (S.mode === 'test' && P.alive && !P.downed) { P.activeLo = P.loadout.slice(); P.guns = freshGuns(P.loadout); P.packGuns = []; P.loose = []; P.reloading = false; P.inspecting = false; P.slot = 0; P.weapon = P.loadout[0]; P.switchT = 0.35; $('lonote').textContent = 'Loadout applied.'; }
  else if (S.mode === 'online') $('lonote').textContent = 'New loadout applies when you next spawn.';
}
for (const [p, s2] of [['lo_p2', 'lo_s2']]) { $(p).onchange = $(s2).onchange = () => setLoadout(+$(p).value, +$(s2).value); }
syncLoadoutUI();

// ---------------------------------------------------------------- menu flow
$('name').value = localStorage.getItem('breach_name') || '';
if (!ENABLE_TEST_MODE) $('test').style.display = 'none';
function playerName() { const n = $('name').value.trim().slice(0, 16) || ('Op' + Math.floor(Math.random() * 900 + 100)); try { localStorage.setItem('breach_name', n); } catch (e) {} return n; }
function enterGame(mode) {
  S.mode = mode; $('menu').style.display = 'none'; $('hud').style.display = 'block'; $('err').textContent = '';
  $('vig').style.display = $('vigads').style.display = 'block';
  $('help').innerHTML = mode === 'test' ? 'TESTING RANGE · L loadout · ` console (give, spawn, explode, hurt, sites, lights...)<br>K test headshot death, J test body death, Y take a test rifle hit, U be suppressed<br>Shooting range on your right: 25 m to 750 m · the close-quarters course with AI defenders is behind you' : '';
  $('pauseinfo').innerHTML = mode === 'online' ? 'Room code: <b style="color:#fff;letter-spacing:3px">' + S.room + '</b><br>Share it so friends can join.' : 'Testing mode';
  renderer.domElement.requestPointerLock();
  audio();
  // every effect's shader built now, in the background, rather than the first time it happens (see 22b-warm.js)
  setTimeout(() => warmFx(), 200);
}
async function startOnline(code, create) {
  $('err').textContent = 'Checking server...';
  let h;
  try { h = await api('/health'); } catch (e) { $('err').textContent = 'Could not reach the server: ' + e.message; return; }
  if (!h.rooms && !h.rtc) {
    $('err').innerHTML = 'Multiplayer is not set up yet. In the Cloudflare dashboard: <b>Storage &amp; Databases &rarr; D1 &rarr; Create</b> a database, then on this Worker go to <b>Settings &rarr; Bindings &rarr; Add &rarr; D1 database</b> and name the variable <b>DB</b>.';
    return;
  }
  S.room = code; S.names = {}; S.score = {}; S.team = {}; S.R = null; S.welcomed = false; S.closeReason = ''; S.myName = playerName();
  buildTown(); S.world = 'town'; P.alive = false; P.rag = null;
  enterGame('online');
  $('deathmsg').style.display = 'block'; $('deathmsg').textContent = (create ? 'CREATING ROOM ' : 'CONNECTING TO ') + code;
  if (h.rooms) {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?room=' + encodeURIComponent(code));
    net.mode = 'ws'; net.ws = ws;
    ws.onopen = () => net.send({ t: 'hello', name: S.myName });
    ws.onmessage = e => { try { onNet(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = ev => {
      if (net.ws === ws && S.mode === 'online') {
        const why = S.closeReason || (S.welcomed ? 'Connection lost' : 'Server refused the connection') + ' (code ' + ev.code + ')';
        leave(); $('err').textContent = why + ' - room ' + code;
      }
    };
    return;
  }
  try {
    if (create) await startHosting(code); else await joinPeer(code);
    $('pauseinfo').innerHTML = 'Room code: <b style="color:#fff;letter-spacing:3px">' + code + '</b><br>' + (net.mode === 'host' ? 'You are hosting. If you leave, the room closes for everyone.' : 'Share it so friends can join.');
  } catch (e) {
    if (S.mode === 'online') { leave(); $('err').textContent = e.status === 409 ? 'That room code is taken, try again.' : (e.message || String(e)); }
  }
}
function startTest() {
  buildTest(); spawnDummies(); cqcReset(); enterGame('test'); respawnLocal(spawns[0]);
  // the loadout comes up first thing (L brings it back any time)
  setTimeout(() => { if (S.mode === 'test') loadoutUI(true); }, 250);
}
function leave() {
  S.migrating = false; net.close();
  for (const r of S.remotes.values()) r.dispose(); S.remotes.clear();
  for (const d of dummies) d.dispose(); dummies.length = 0; CQC.bots = []; navClear();
  while (ragdolls.length) ragdolls.pop().dispose();
  clearItems(); drops.length = 0; hlMesh.visible = false; $('pickup').style.display = 'none';
  for (const d of decals) { scene.remove(d); if (d.geometry !== splatGeo) d.geometry.dispose(); } decals.length = 0; clearPools(); clearGore(); debris.length = 0; clearExplosives(); for (const P of DEB_POOLS) { P.im.count = 0; P.next = 0; P.slot.fill(null); } splatIM.count = 0; splatIM.userData.next = 0;
  for (const p of props) scene.remove(p.m); props.length = 0; for (const L of limbBodies) L.dispose(); limbBodies.length = 0;
  while (bullets.length) removeBullet(bullets.length - 1);
  S.slow = false; S.ts = 1; S.target = null; S.testKills = 0; S.testDeaths = 0; P.downed = false; $('scope').style.display = 'none'; $('score').style.display = 'none'; S.filt = ''; renderer.domElement.style.filter = ''; $('slowmo').style.display = 'none';
  $('vig').style.display = $('vigads').style.display = 'none';
  loadoutUI(false); S.loOpen = false; S.mode = null; P.alive = false; P.rag = null; localBody.root.visible = false; S.R = null; siegeClear(); $('teamleft').style.opacity = '0'; $('rbanner').style.opacity = '0';
  $('hud').style.display = 'none'; $('pause').style.display = 'none'; $('menu').style.display = 'flex';
  $('black').style.opacity = '0'; $('deathmsg').style.display = 'none'; $('dmgv').style.opacity = '0';
  if (document.pointerLockElement) document.exitPointerLock();
  buildTown(); setTimeout(warmShaders, 50);
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
$('queue').onclick = () => queueUp('siege');
$('create').onclick = () => { S.cfg = serverCfg(); S.pub = !!S.cfg.pub; let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; deploy('CREATING SERVER', () => startOnline(c, true)); };
$('join').onclick = () => { S.pub = false; S.cfg = null; const c = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 4) { $('err').textContent = 'Enter a valid room code'; return; } deploy('JOINING ' + c, () => startOnline(c, false)); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
$('test').onclick = () => deploy('TESTING RANGE', () => startTest());
$('resume').onclick = () => renderer.domElement.requestPointerLock();
try { S.showTarget = localStorage.getItem('breach_target_panel') === '1'; } catch (e) { S.showTarget = false; }
$('opt_target').checked = !!S.showTarget;
setPixelation(50);   // the retro look is part of the game: fixed, no setting
$('opt_target').onchange = () => { S.showTarget = $('opt_target').checked; try { localStorage.setItem('breach_target_panel', S.showTarget ? '1' : '0'); } catch (e) {} };
document.querySelectorAll('.attm1').forEach(b => b.onclick = () => openAttMenu(P.loadout[+b.dataset.i]));
$('leave').onclick = () => leave();

// ---------------------------------------------------------------- main loop
buildTown(); setTimeout(warmShaders, 300);
let last = performance.now(), frameN = 0;
const focus = new V3();
// ---------------------------------------------------------------- retro pixelation: the frame is drawn at a fixed number of lines and
// blown up with hard pixel edges, so every pixel is the same size on screen whatever the distance, window size or display
const RETRO = { rt: null, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
RETRO.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false })); RETRO.scene.add(RETRO.quad);
function retroTarget() {
  if (!(S.pixel > 0)) return null;
  // 0..100 on the slider: from 720 lines down to 120
  const h = Math.max(96, Math.round(lerp(720, 120, Math.pow(S.pixel / 100, 0.75)))), w = Math.max(1, Math.round(h * innerWidth / innerHeight));
  if (!RETRO.rt || RETRO.rt.width !== w || RETRO.rt.height !== h) {
    if (RETRO.rt) RETRO.rt.dispose();
    RETRO.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
    RETRO.quad.material.map = RETRO.rt.texture; RETRO.quad.material.needsUpdate = true;
  }
  return RETRO.rt;
}
// The game keeps running when its tab is in the background: browsers stop animation frames there (and slow timers to once a
// second), so a worker, which is not throttled, ticks the simulation and the network about 20 times a second instead. Without
// it a player whose tab was not focused froze for everyone else (hits, reactions, falls all waited for the tab to come back).
let rafPending = false;
// Only the nearest bodies throw a sun shadow (each body is ~40k vertices drawn again into the shadow map; a full range
// of them doubled the cost of every frame). Re-sorted a few times a second.
let _shT = 0;
function updateShadowCasters(dt) {
  if ((_shT -= dt) > 0) return; _shT = 0.3;
  // (a door's knobs and hinges are a dozen small meshes each; from more than 12 m off they are a few pixels and a draw each,
  // so they are not drawn from there; they still stop rounds)
  if (typeof doors !== 'undefined') { const cp = camera.position;
    for (const d of doors) { if (!d.g) continue; const on = d.g.position.distanceToSquared(cp) < 144;
      if (d.partsOn === on) continue; d.partsOn = on; if (d.knob) d.knob.visible = on; for (const h of d.hinges) h.visible = on; } }
  const L = [];
  for (const d of dummies) if (d.hum && d.hum.root.visible) L.push(d.rag ? d.rag.group : d.hum.root);
  for (const r of S.remotes.values()) if (r.hum) L.push(r.rag ? r.rag.group : r.hum.root);
  for (const rg of ragdolls) if (!L.includes(rg.group)) L.push(rg.group);
  const cp = camera.position, dist = o => { o.getWorldPosition(_shV); return _shV.distanceToSquared(cp); };
  const ds = L.map(o => [o, dist(o)]).sort((a, b) => a[1] - b[1]);
  ds.forEach(([o, d2], i) => {
    // (and none indoors: under the house's roof the sun's shadow of a body can never be seen, and each is ~40k vertices)
    o.getWorldPosition(_shV); const on = i < GFX.shadowBodies && d2 < 30 * 30 && !(typeof inside === 'function' && inside(_shV));
    if (o.userData.shOn === on) return; o.userData.shOn = on;
    o.traverse(m => { if (!m.isMesh) return; if (m.userData.cs0 === undefined) m.userData.cs0 = m.castShadow; m.castShadow = on && m.userData.cs0; });
  });
}
const _shV = new V3(); let _shF = 0;
// Resolution follows the frame time: under load the canvas renders at fewer pixels (down to 60%) and climbs back when
// there's room; never above 1.5x the CSS pixels (a 2x Retina screen was four times the pixels of a 1x one).
// (it goes by the frame time over the last couple of seconds and changes at most every 3 s: resizing the canvas is itself a
// hitch, and following every spike from a blast down and straight back up was a stutter on top of the spike)
let _drT = 0, _drE = 1 / 60, _drR = Math.min(devicePixelRatio, 1.5);
function dynRes(dt) {
  _drE += (Math.min(dt, 0.1) - _drE) * 0.02; if ((_drT -= dt) > 0) return; _drT = 0.5;
  if (GFX.res !== 'auto') { const r = +GFX.res; if (Math.abs(r - renderer.getPixelRatio()) > 0.01) { _drR = r; renderer.setPixelRatio(r); renderer.setSize(innerWidth, innerHeight, false); } return; }
  const mx = Math.min(devicePixelRatio, 1.5), mn = Math.min(mx, 0.6);
  let r = _drR; if (_drE > 1 / 50) r = Math.max(mn, r * 0.88); else if (_drE < 1 / 75) r = Math.min(mx, r * 1.06);
  if (Math.abs(r - renderer.getPixelRatio()) / r > 0.03) { _drR = r; renderer.setPixelRatio(r); renderer.setSize(innerWidth, innerHeight, false); _drT = 3; }
}
// ---------------------------------------------------------------- settings
function applyGfx() {
  const sh = GFX.shadows, want = sh !== 'off';
  if (renderer.shadowMap.enabled !== want || (want && renderer.shadowMap.type !== (sh === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap))) {
    renderer.shadowMap.enabled = want; renderer.shadowMap.type = sh === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  const ms = sh === 'ultra' ? 4096 : sh === 'low' ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  for (const o of [...ragdolls.map(r => r.group), ...dummies.map(d => d.hum && d.hum.root)]) if (o) o.userData.shOn = undefined;
  _shT = 0; _drT = 0;
  try { localStorage.setItem('breach_gfx', JSON.stringify(GFX)); } catch (e) {}
}
function settingsUI(inMenu) {
  const box = $(inMenu ? 'msetv' : 'setv'); if (!box) return;
  const row = (label, html) => '<div class="srow"><span>' + label + '</span>' + html + '</div>';
  const sel = (k, opts) => '<select data-k="' + k + '">' + opts.map(([v, t]) => '<option value="' + v + '"' + (String(GFX[k]) === String(v) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
  const rng = (k, a, b, st, fmt) => '<input type="range" data-k="' + k + '" min="' + a + '" max="' + b + '" step="' + st + '" value="' + GFX[k] + '"><b>' + fmt(GFX[k]) + '</b>';
  box.innerHTML = '<h3>GRAPHICS</h3>' +
    row('Quality preset', sel('preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']])) +
    row('Resolution', sel('res', [['auto', 'Auto'], [0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%'], [2, '200%']])) +
    row('Shadows', sel('shadows', [['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']])) +
    row('Bodies casting shadows', rng('shadowBodies', 0, 24, 1, v => v)) +
    row('Debris amount', rng('debris', 0.1, 1, 0.05, v => Math.round(v * 100) + '%')) +
    row('Blood splats', rng('splats', 0.1, 1, 0.05, v => Math.round(v * 100) + '%')) +
    '<h3>VIEW AND CONTROLS</h3>' +
    row('Field of view', rng('fov', 60, 100, 1, v => v + '&deg;')) +
    row('Mouse sensitivity', rng('sens', 0.2, 3, 0.05, v => (+v).toFixed(2) + 'x')) +
    (inMenu ? '' : '<button id="setback">Back</button>');
  box.querySelectorAll('[data-k]').forEach(el => {
    const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput';
    el[ev] = () => {
      const k = el.dataset.k, v = el.value;
      if (k === 'preset') { GFX.preset = v; if (GFX_PRESETS[v]) Object.assign(GFX, GFX_PRESETS[v]); applyGfx(); settingsUI(inMenu); return; }
      GFX[k] = el.type === 'range' ? +v : (k === 'res' && v !== 'auto' ? +v : v);
      if (!['fov', 'sens'].includes(k)) GFX.preset = 'custom';
      if (el.type === 'range') el.nextElementSibling.innerHTML = { debris: 1, splats: 1 }[k] ? Math.round(v * 100) + '%' : k === 'fov' ? v + '&deg;' : k === 'sens' ? (+v).toFixed(2) + 'x' : v;
      applyGfx(); if (k !== 'fov' && k !== 'sens' && el.tagName === 'SELECT') settingsUI(inMenu);
    };
  });
  if (!inMenu) $('setback').onclick = () => { $('setv').style.display = 'none'; $('pmain').style.display = 'flex'; };
}
$('opensettings').onclick = () => { $('pmain').style.display = 'none'; $('setv').style.display = 'block'; settingsUI(); };
applyGfx();
function schedule() { if (!rafPending) { rafPending = true; requestAnimationFrame(loop); } }
function loop(now) { rafPending = false; schedule(); frame(now, false); }
try {
  const tk = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })));
  tk.onmessage = () => { if (document.hidden) frame(performance.now(), true); };
} catch (e) {}
function frame(now, hidden) {
  const dt = Math.min(0.05, Math.max(0, now - last) / 1000); last = now;
  S.ts = damp(S.ts === undefined ? 1 : S.ts, S.slow && S.mode ? 0.08 : 1, 6, dt);
  const wdt = dt * S.ts;
  if (S.mode) {
    const pp0 = P.pos.clone(); freezeBegin(); updatePlayer(dt); updateWeapons(dt); freezeEnd(); updateExplosives(dt); updateGadgets(dt); updateBash(dt); if (!(P.slot === 2 || (P.slot === 5 && P.toolB === 'bcharge')) || !P.alive || P.downed) gadgetGhostOff(); wireDrag(pp0);
    for (const r of S.remotes.values()) r.update(dt);
    // far bodies are stepped less often (every 2nd frame past 40 m, every 3rd past 80 m) with the time they missed: nobody
    // can see a 20 Hz animation at that range, and the AI and animation of a range full of targets was a big part of each frame
    frameN++;
    for (let i = 0; i < dummies.length; i++) {
      const d = dummies[i], r = d.hum && d.hum.root, far = r ? r.position.distanceToSquared(camera.position) : 0, k = far > 6400 ? 3 : far > 1600 ? 2 : 1;
      d._acc = (d._acc || 0) + wdt;
      if (k === 1 || (frameN + i) % k === 0) { d.update(Math.min(d._acc, 0.12)); d._acc = 0; }
    }
    updateAI(); netSend(dt); updateHUD(); updateToolbar(); updateInv(dt); updatePickup();
  }
  updateBullets(wdt);
  for (const r of ragdolls) r.update(wdt);
  updateFx(wdt); updateDebris(wdt); updateStructure(wdt); updateGore(wdt); updateBlood(wdt); updatePools(wdt); updateProps(wdt); updateDoors(wdt); siegeUpdate(wdt); roundHud(); matchHud(); screenFx(wdt); updateEyes(wdt); updateConsole(dt); updateEnv(dt); updateLights(dt); updateLimbs(wdt); updateHeats(wdt); sfxAmbience(dt);
  updateCamera(dt); if (S.mode && P.alive && !P.downed) tpCamera();
  if (S.mode) { updateViewmodel(dt); vmCamera.updateMatrixWorld(true); updateDevices(); } else updateDevices();
  updateTPBody(dt);
  updateCloth(wdt);
  if (S.tp) { $('scope').style.display = 'none'; $('acog').style.display = 'none'; $('vigads').style.opacity = '0'; }
  $('tpdot').style.display = S.tp && S.mode && P.alive && !P.downed && !S.inv ? 'block' : 'none';
  focus.copy(S.mode && P.alive ? P.pos : (P.rag ? P.rag.p[2] : new V3()));
  focus.x = Math.round(focus.x * 4) / 4; focus.z = Math.round(focus.z * 4) / 4; focus.y = 0;
  sun.position.copy(focus).addScaledVector(sunDir, 100); sun.target.position.copy(focus);
  if (hidden) return;   // nobody is looking: simulate, don't draw
  updateShadowCasters(dt); dynRes(dt);
  // (the sun's shadow map is drawn again every other frame, not every frame: it is the whole scene drawn a second time, and
  // the shadows moving at 30 a second instead of 60 can't be told apart)
  renderer.shadowMap.autoUpdate = false; if ((_shF = (_shF + 1) % 2) === 0) renderer.shadowMap.needsUpdate = true;
  renderer.clear();
  renderScope();
  const rt = retroTarget();
  if (rt) { renderer.setRenderTarget(rt); renderer.clear(); }
  renderer.render(scene, camera);
  if (S.mode && P.alive && !P.downed && !S.tp) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
  if (rt) { renderer.setRenderTarget(null); renderer.render(RETRO.scene, RETRO.cam); }
  eyeAfterRender();
}
schedule();

// ---- module exports: build.mjs strips this block ----
export { CODE_CHARS, applyGfx, frame, last, leave, renderScore, scoreOf, setLoadout, settingsUI, startOnline };
// ---- end module exports ----
