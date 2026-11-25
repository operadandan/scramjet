// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import { $, V3, renderer, scene } from './00-setup.js';
import { addBox, clearWorld } from './01-world.js';
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
import { api, net, sleep } from './19-network.js';
import { clearExplosives } from './19b-explosives.js';
import { clearItems, hlMesh } from './21-items-inventory.js';
import { CODE_CHARS, setLoadout, startOnline } from './22-menu-loop.js';
import { siegeClear } from './23-siege.js';
import { GADGETS, HEADGEAR, clearGadgets } from './27-gadgets.js';
import { eyeReset } from './29-eyes.js';
import { deploy } from './31-menu.js';
// ---- end module links ----
// ---------------------------------------------------------------- the match, as each player sees it
// Between matches (and until there is someone on each team) everyone is on a bare baseplate with empty hands, voting for the
// map. Then each round opens with 15 s to pick a loadout, standing at your start; then 5 s more held still, counted down;
// then go. First team to 5 rounds wins the match, and it's back to the baseplate.
const LOBBY_SP = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; LOBBY_SP.push(new V3(Math.cos(a) * 6, 0, Math.sin(a) * 6)); }
function buildLobby() {
  clearWorld(); TOWN.windows = []; TOWN.sites = []; TOWN.lamps = []; TOWN.lampAll = [];
  // just a baseplate: one big flat slab, nothing on it
  addBox(0, 0, 0, 120, 0.3, 120, 'concrete', 0x8e959c, 'grid');
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
function lobbyStrip() { P.activeLo = [null, null]; P.slot = 4; P.emptySel = 0; P.c4N = 0; P.gN = 0; P.bcN = 0; P.toolB = null; P.head = 'none'; eyeReset(); P.fragN = 0; P.medUses = 0; P.defOut = false; }
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

// ---- the loadout: primary, sidearm, a gadget, a throwable, headgear, and for attackers a breaching tool. In the testing
// range everything is on the lists (both sides' gadgets, every breaching tool), opened with L.
const LO_KEY = 'breach_lo5';
const LO_DEF = { g2: { r: 'claymore', b: 'beartrap', t: 'shield' }, g3: { r: 'smoke', b: 'frag', t: 'frag' }, gb: { r: 'c4', t: 'c4' }, hg: { r: 'none', b: 'none', t: 'none' },
  // the two equipment slots (keys 3 and 4): gadgets, breaching tools and throwables alike
  eq: { r: ['c4', 'flash'], b: ['beartrap', 'frag'], t: ['c4', 'frag'] } };
const LO = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem(LO_KEY) || '{}') || {}; } catch (e) {} const r = {}; for (const k in LO_DEF) r[k] = Object.assign({}, LO_DEF[k], o[k] || {}); return r; })();
function loSave() { try { localStorage.setItem(LO_KEY, JSON.stringify(LO)); } catch (e) {} }
const loSide = () => S.mode === 'online' ? (S.team[S.myId] || 'r') : 't';
const loOK = (k, slot, t) => GADGETS[k] && GADGETS[k].slot === slot && (t === 't' || GADGETS[k].team.includes(t));
// the gadget, throwable, breaching tool and headgear of your side, and how many of each you carry
const eqOK = (k, t) => !!GADGETS[k] && k !== 'bcharge' && k !== 'claymore' && (t === 't' || GADGETS[k].team.includes(t));
function applyGadgets() {
  const t = loSide(), eq = (LO.eq[t] || []).slice(0, 2);
  P.eq = [0, 1].map(i => { const k = eq[i]; return eqOK(k, t) && eq.indexOf(k) === i ? { k, n: GADGETS[k].n } : null; });
  P.head = HEADGEAR[LO.hg[t]] ? LO.hg[t] : 'none'; P.nvgOn = false;
  P.eqSel = -1; P.tool2 = null; P.tool3 = null; P.toolB = null; P.gN = 0; P.fragN = 0; P.bcN = 0;
  const c4 = P.eq.find(e => e && e.k === 'c4'); P.c4N = c4 ? c4.n : 0;
}
function loadoutUI(open) {
  const el = $('loadout'); S.loOpen = !!open;
  if (!open) { const was = el.style.display === 'block'; el.style.display = 'none'; if (was && S.mode && !S.locked && !S.inv) $('pause').style.display = 'flex'; return; }
  const t = loSide(), opt = (cls, id, name, on, sub) => '<button class="' + cls + (on ? ' on' : '') + '" data-v="' + id + '"><b>' + name + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  const list = slot => Object.entries(GADGETS).filter(([k]) => loOK(k, slot, t));
  const side = t === 'r' ? '<span style="color:#ff6a5a">ATTACK</span>' : t === 'b' ? '<span style="color:#6aa0ff">DEFEND</span>' : '<span style="color:#ff9a6a">TESTING RANGE</span>';
  el.innerHTML = '<h3>LOADOUT · ' + side + '</h3><div id="lotime" class="ls"></div>' +
    '<h4>PRIMARY (1)</h4><div class="lrow">' + PRIMARIES.map(i => opt('lp', i, WEAPONS[i].name, P.loadout[0] === i)).join('') + '</div>' +
    '<h4>SIDEARM (2)</h4><div class="lrow">' + SECONDARIES.map(i => opt('ls2', i, WEAPONS[i].name, P.loadout[1] === i)).join('') + '</div>' +
    [0, 1].map(i => '<h4>EQUIPMENT ' + (i + 1) + ' (' + (i + 3) + ')</h4><div class="lrow eqrow">' + opt('leq', i + ':', 'Nothing', !(LO.eq[t] || [])[i], '') +
      Object.entries(GADGETS).filter(([k]) => eqOK(k, t)).map(([k, g]) => opt('leq', i + ':' + k, g.name, (LO.eq[t] || [])[i] === k, g.n ? 'x' + g.n : '').replace('<button', '<button title="' + g.desc + '"')).join('') + '</div>').join('') +
    '<h4>HEADGEAR</h4><div class="lrow">' + Object.entries(HEADGEAR).map(([k, g]) => opt('lhg', k, g.name, LO.hg[t] === k, g.desc)).join('') + '</div>' +
    '<button id="loready">' + (t === 't' ? 'DONE' : 'READY') + '</button>';
  el.style.display = 'block';
  if (document.pointerLockElement) document.exitPointerLock();
  const set = (key, v) => { LO[key][t] = v; loSave(); loApply(); loadoutUI(true); };
  el.querySelectorAll('.lp').forEach(b => b.onclick = () => { setLoadout(+b.dataset.v, P.loadout[1]); loApply(); loadoutUI(true); });
  el.querySelectorAll('.ls2').forEach(b => b.onclick = () => { setLoadout(P.loadout[0], +b.dataset.v); loApply(); loadoutUI(true); });
  // (picking something another slot already has swaps the two)
  el.querySelectorAll('.leq').forEach(b => b.onclick = () => { const [i, k] = b.dataset.v.split(':'), a = (LO.eq[t] || []).slice(0, 2); while (a.length < 2) a.push(null); const j = k ? a.indexOf(k) : -1; if (j >= 0) a[j] = a[+i]; a[+i] = k || null; LO.eq[t] = a; loSave(); loApply(); loadoutUI(true); });
  el.querySelectorAll('.lhg').forEach(b => b.onclick = () => set('hg', b.dataset.v));
  $('loready').onclick = () => { loadoutUI(false); renderer.domElement.requestPointerLock(); };
}
// changed during the loadout phase: in your hands straight away
function loApply() {
  if (!P.alive || P.downed || (S.mode === 'online' && S.R.ph !== 'load')) return;
  P.activeLo = P.loadout.slice(); P.guns = freshGuns(P.activeLo); P.packGuns = []; P.loose = []; P.slot = 0; P.weapon = P.loadout[0]; P.switchT = 0.35; applyGadgets();
}
function matchHud() {
  lobbyUI();
  const R = S.R, cd = $('countdown');
  if (S.loOpen) { const l = R && R.ph === 'load' ? Math.max(0, Math.ceil((R.end - performance.now()) / 1000)) : 0; const e = $('lotime'); if (e) e.textContent = S.mode === 'online' ? 'Round starts in ' + l + ' s' : 'Changes apply now'; if (S.mode === 'online' && (!R || R.ph !== 'load')) loadoutUI(false); }
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
// quick match: the room holds you a place in the fullest public lobby of that mode; with none, it hands you a code to start
// one, already listed so whoever queues next lands with you
async function queueUp(mode) {
  $('err').textContent = mode === 'raid' ? 'Looking for a raid...' : 'Looking for a match...';
  let j = null; try { j = await api('/api/queue', { mode: mode || 'siege' }); } catch (e) {}
  S.cfg = { name: mode === 'raid' ? 'Raid lobby' : 'Public match', mode: mode || 'siege', pub: 1, tod: 6.4, weather: 'random', dayLen: 60, win: 5, max: 12 }; S.pub = true;
  if (j && j.room) {
    // (a lobby just made by someone else queueing may take a second to come up)
    for (let k = 0; k < 8; k++) { try { await api('/api/room?room=' + j.room); break; } catch (e) { await sleep(800); } }
    deploy(mode === 'raid' ? 'RAID' : 'QUICK MATCH', () => startOnline(j.room, false)); return;
  }
  let c = j && j.make; if (!c) { c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; }
  deploy(mode === 'raid' ? 'RAID' : 'QUICK MATCH', () => startOnline(c, true));
}

// ---- module exports: build.mjs strips this block ----
export { LOBBY_SP, applyGadgets, freezeBegin, freezeEnd, goLobbyWorld, loadoutUI, lobbyStrip, matchFrozen, matchHud, queueUp };
// ---- end module exports ----
