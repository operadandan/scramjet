// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, V3, renderer, scene } from './00-setup.js';
import { addBox, addGround, clearWorld } from './01-world.js';
import { TOWN } from './01b-town.js';
import { limbBodies, ragdolls } from './04-ragdoll.js';
import { PRIMARIES, SECONDARIES, WEAPONS, freshGuns } from './06-weapons.js';
import { blip } from './10-audio.js';
import { decals, splatGeo } from './11-fx.js';
import { drops } from './12-blood.js';
import { clearGore } from './12b-gore.js';
import { clearPools, splatIM } from './14-wounds.js';
import { DEB_POOLS, debris } from './15-destruction.js';
import { bullets, props, removeBullet } from './16-ballistics.js';
import { P, S, keys, mouse } from './17-dummies.js';
import { api, net } from './19-network.js';
import { clearExplosives } from './19b-explosives.js';
import { clearItems, hlMesh } from './21-items-inventory.js';
import { CODE_CHARS, setLoadout, startOnline } from './22-menu-loop.js';
import { siegeClear } from './23-siege.js';
import { GADGETS, clearGadgets } from './27-gadgets.js';
// ---- end module links ----
// ---------------------------------------------------------------- the match, as each player sees it
// Between matches (and until there is someone on each team) everyone is on a bare baseplate with empty hands, voting for the
// map. Then each round opens with 15 s to pick a loadout, standing at your start; then 5 s more held still, counted down;
// then go. First team to 5 rounds wins the match, and it's back to the baseplate.
const LOBBY_SP = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; LOBBY_SP.push(new V3(Math.cos(a) * 6, 0, Math.sin(a) * 6)); }
function buildLobby() {
  clearWorld(); TOWN.windows = []; TOWN.sites = []; TOWN.lamps = [];
  addGround(180, 'ground');
  addBox(0, 0, 0, 40, 0.3, 40, 'concrete', 0x9aa0a6);
  for (const s of [-1, 1]) { addBox(0, 0.3, s * 20.2, 40.8, 1.1, 0.4, 'concrete', 0x6a7078); addBox(s * 20.2, 0.3, 0, 0.4, 1.1, 40, 'concrete', 0x6a7078); }
  for (let k = 0; k < LOBBY_SP.length; k++) LOBBY_SP[k].y = 0.3;
}
// the world each phase is played in
function goLobbyWorld() {
  for (const r of S.remotes.values()) { r.deadRag = null; r.rag = null; }
  while (ragdolls.length) ragdolls.pop().dispose(); P.rag = null;
  clearItems(); drops.length = 0; hlMesh.visible = false; clearGadgets(); for (const Q of DEB_POOLS) { Q.im.count = 0; Q.next = 0; Q.slot.fill(null); }
  for (const d of decals) { scene.remove(d); if (d.geometry !== splatGeo) d.geometry.dispose(); } decals.length = 0; clearPools(); clearGore(); debris.length = 0; clearExplosives();
  splatIM.count = 0; splatIM.userData.next = 0;
  for (const p of props) scene.remove(p.m); props.length = 0; for (const L of limbBodies) L.dispose(); limbBodies.length = 0;
  while (bullets.length) removeBullet(bullets.length - 1);
  buildLobby(); siegeClear(); S.world = 'lobby';
}
// on the baseplate: nothing in your hands
function lobbyStrip() { P.activeLo = [null, null]; P.slot = 4; P.emptySel = 0; P.c4N = 0; P.fragN = 0; P.medUses = 0; P.defOut = false; }
const matchFrozen = () => S.mode === 'online' && !!S.R && (S.R.ph === 'load' || (S.R.ph === 'live' && performance.now() < S.R.go));

// ---- the map vote (one map for now)
function lobbyUI() {
  const el = $('lobbyui'), R = S.R, on = S.mode === 'online' && R && R.ph === 'lobby';
  el.style.display = on ? 'block' : 'none'; if (!on) return;
  const left = Math.max(0, Math.ceil((R.end - performance.now()) / 1000)), voted = !!S.voted;
  const html = '<h3>INTERMISSION</h3><div class="ls">' + (R.end ? 'Match starts in ' + left + ' s' : 'Waiting for a player on each team') + '</div>' +
    '<div class="maps"><button class="mapc' + (voted ? ' on' : '') + '" onclick="voteMap(\'house\')"><b>Suburban House</b><small>Bomb · 2 sites · day/night, weather</small><i>' + (R.mv || 0) + ' vote' + ((R.mv || 0) === 1 ? '' : 's') + '</i></button></div>' +
    '<div class="ls">Teams: <span style="color:#ff6a5a">RED ' + teamCount('r') + '</span> · <span style="color:#6aa0ff">BLUE ' + teamCount('b') + '</span> · you are ' + (S.team[S.myId] === 'r' ? '<span style="color:#ff6a5a">RED (attack)</span>' : '<span style="color:#6aa0ff">BLUE (defend)</span>') + '</div>';
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
}
const teamCount = t => (S.team[S.myId] === t ? 1 : 0) + [...S.remotes.keys()].filter(id => S.team[id] === t).length;
function voteMap(map) { S.voted = map; net.send({ t: 'vote', map }); }
window.voteMap = voteMap;

// ---- the loadout: a primary, a sidearm, one gadget and one throwable from your side's lists
const LO_KEY = 'breach_lo2';
const LO = (() => { try { return Object.assign({ g2: { r: 'c4', b: 'beartrap' }, g3: { r: 'smoke', b: 'frag' } }, JSON.parse(localStorage.getItem(LO_KEY) || '{}')); } catch (e) { return { g2: { r: 'c4', b: 'beartrap' }, g3: { r: 'smoke', b: 'frag' } }; } })();
function loSave() { try { localStorage.setItem(LO_KEY, JSON.stringify({ g2: LO.g2, g3: LO.g3 })); } catch (e) {} }
// the gadget and throwable of your side, and how many of each you carry
function applyGadgets() {
  const t = S.mode === 'online' ? S.team[S.myId] : null;
  if (!t) { P.tool2 = 'c4'; P.tool3 = 'frag'; return; }
  P.tool2 = GADGETS[LO.g2[t]] && GADGETS[LO.g2[t]].slot === 2 && GADGETS[LO.g2[t]].team.includes(t) ? LO.g2[t] : (t === 'r' ? 'c4' : 'beartrap');
  P.tool3 = GADGETS[LO.g3[t]] && GADGETS[LO.g3[t]].slot === 3 && GADGETS[LO.g3[t]].team.includes(t) ? LO.g3[t] : 'frag';
  P.c4N = GADGETS[P.tool2].n; P.fragN = GADGETS[P.tool3].n;
}
function loadoutUI(open) {
  const el = $('loadout'); S.loOpen = !!open;
  if (!open) { el.style.display = 'none'; return; }
  const t = S.team[S.myId] || 'r', opt = (cls, id, name, on, sub) => '<button class="' + cls + (on ? ' on' : '') + '" data-v="' + id + '"><b>' + name + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  const list = slot => Object.entries(GADGETS).filter(([k, g]) => g.slot === slot && g.team.includes(t));
  el.innerHTML = '<h3>LOADOUT · ' + (t === 'r' ? '<span style="color:#ff6a5a">ATTACK</span>' : '<span style="color:#6aa0ff">DEFEND</span>') + '</h3><div id="lotime" class="ls"></div>' +
    '<h4>PRIMARY</h4><div class="lrow">' + PRIMARIES.map(i => opt('lp', i, WEAPONS[i].name, P.loadout[0] === i)).join('') + '</div>' +
    '<h4>SIDEARM</h4><div class="lrow">' + SECONDARIES.map(i => opt('ls2', i, WEAPONS[i].name, P.loadout[1] === i)).join('') + '</div>' +
    '<h4>GADGET (3)</h4><div class="lrow">' + list(2).map(([k, g]) => opt('lg2', k, g.name, LO.g2[t] === k, g.desc + ' · x' + g.n)).join('') + '</div>' +
    '<h4>THROWABLE (4)</h4><div class="lrow">' + list(3).map(([k, g]) => opt('lg3', k, g.name, LO.g3[t] === k, g.desc + ' · x' + g.n)).join('') + '</div>' +
    '<button id="loready">READY</button>';
  el.style.display = 'block';
  if (document.pointerLockElement) document.exitPointerLock();
  el.querySelectorAll('.lp').forEach(b => b.onclick = () => { setLoadout(+b.dataset.v, P.loadout[1]); loApply(); loadoutUI(true); });
  el.querySelectorAll('.ls2').forEach(b => b.onclick = () => { setLoadout(P.loadout[0], +b.dataset.v); loApply(); loadoutUI(true); });
  el.querySelectorAll('.lg2').forEach(b => b.onclick = () => { LO.g2[t] = b.dataset.v; loSave(); loApply(); loadoutUI(true); });
  el.querySelectorAll('.lg3').forEach(b => b.onclick = () => { LO.g3[t] = b.dataset.v; loSave(); loApply(); loadoutUI(true); });
  $('loready').onclick = () => { loadoutUI(false); renderer.domElement.requestPointerLock(); };
}
// changed during the loadout phase: in your hands straight away
function loApply() {
  if (!P.alive || S.R.ph !== 'load') return;
  P.activeLo = P.loadout.slice(); P.guns = freshGuns(P.activeLo); P.packGuns = []; P.loose = []; P.slot = 0; P.weapon = P.loadout[0]; P.switchT = 0.35; applyGadgets();
}
function matchHud() {
  lobbyUI();
  const R = S.R, cd = $('countdown');
  if (S.loOpen) { const l = R && R.ph === 'load' ? Math.max(0, Math.ceil((R.end - performance.now()) / 1000)) : 0; const e = $('lotime'); if (e) e.textContent = 'Round starts in ' + l + ' s'; if (!R || R.ph !== 'load') loadoutUI(false); }
  // held still at the start: the last seconds counted down, big
  const left = R && R.ph === 'live' ? (R.go - performance.now()) / 1000 : 0;
  if (S.mode === 'online' && left > 0) { cd.style.display = 'block'; const t = String(Math.ceil(left)); if (cd.textContent !== t) { cd.textContent = t; blip(660, 0.06, 0.05); } }
  else if (cd.style.display !== 'none') { if (cd.textContent && cd.textContent !== 'GO') { cd.textContent = 'GO'; blip(990, 0.12, 0.06); setTimeout(() => { cd.style.display = 'none'; cd.textContent = ''; }, 700); } else if (!cd.textContent) cd.style.display = 'none'; }
}
// held still: none of the keys that move you, fire or throw do anything (looking about still works)
const FREEZE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'KeyZ', 'KeyQ', 'KeyE', 'KeyR', 'KeyG'];
let _frz = null;
function freezeBegin() { if (!matchFrozen()) return; _frz = { k: FREEZE_KEYS.map(k => keys[k]), l: mouse.left, r: mouse.right }; for (const k of FREEZE_KEYS) keys[k] = false; mouse.left = mouse.right = false; }
function freezeEnd() { if (!_frz) return; FREEZE_KEYS.forEach((k, i) => { if (keys[k] === false) keys[k] = _frz.k[i]; }); if (!mouse.left) mouse.left = _frz.l; if (!mouse.right) mouse.right = _frz.r; _frz = null; if (matchFrozen()) { P.vel.x = 0; P.vel.z = 0; } }

// ---- queue up: into a public room still on its baseplate, or a new one
async function queueUp() {
  $('err').textContent = 'Looking for a match...';
  let j = null; try { j = await api('/api/queue'); } catch (e) {}
  if (j && j.room) { S.pub = true; startOnline(j.room, false); return; }
  let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  S.pub = true; startOnline(c, true);
}

// ---- module exports: build.mjs strips this block ----
export { LOBBY_SP, applyGadgets, freezeBegin, freezeEnd, goLobbyWorld, loadoutUI, lobbyStrip, matchFrozen, matchHud, queueUp };
// ---- end module exports ----
