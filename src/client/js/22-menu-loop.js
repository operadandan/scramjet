// ---------------------------------------------------------------- scoreboard
S.score = {};
function scoreOf(id) { return S.score[id] || (S.score[id] = { k: 0, d: 0 }); }
function renderScore() {
  const rows = [];
  if (S.mode === 'online') {
    rows.push({ me: true, name: S.myName || 'You', st: !P.alive ? 'Dead' : P.downed ? 'Downed' : 'Alive', ...scoreOf(S.myId) });
    for (const r of S.remotes.values()) rows.push({ name: r.name, st: !r.alive ? 'Dead' : r.rag ? 'Downed' : 'Alive', ...scoreOf(r.id) });
    $('scoretitle').textContent = 'ROOM ' + S.room + (net.mode === 'host' ? '  (you are hosting)' : '');
  } else {
    rows.push({ me: true, name: S.myName || playerName(), st: !P.alive ? 'Dead' : P.downed ? 'Downed' : 'Alive', k: S.testKills || 0, d: S.testDeaths || 0 });
    $('scoretitle').textContent = 'TESTING MODE';
  }
  rows.sort((a, b) => b.k - a.k || a.d - b.d);
  $('scorebody').innerHTML = rows.map(r => '<tr' + (r.me ? ' class="me"' : '') + '><td>' + esc(r.name) + '</td><td>' + r.st + '</td><td class="n">' + r.k + '</td><td class="n">' + r.d + '</td></tr>').join('');
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
  $('help').innerHTML = mode === 'test' ? 'K test headshot death, J test body death, H take a test rifle hit<br>Shooting range on your right: 25 m to 750 m. Spare mags refill here.' : '';
  $('pauseinfo').innerHTML = mode === 'online' ? 'Room code: <b style="color:#fff;letter-spacing:3px">' + S.room + '</b><br>Share it so friends can join.' : 'Testing mode';
  renderer.domElement.requestPointerLock();
  audio();
}
async function startOnline(code, create) {
  $('err').textContent = 'Checking server...';
  let h;
  try { h = await api('/health'); } catch (e) { $('err').textContent = 'Could not reach the server: ' + e.message; return; }
  if (!h.rooms && !h.rtc) {
    $('err').innerHTML = 'Multiplayer is not set up yet. In the Cloudflare dashboard: <b>Storage &amp; Databases &rarr; D1 &rarr; Create</b> a database, then on this Worker go to <b>Settings &rarr; Bindings &rarr; Add &rarr; D1 database</b> and name the variable <b>DB</b>.';
    return;
  }
  S.room = code; S.names = {}; S.score = {}; S.welcomed = false; S.closeReason = ''; S.myName = playerName();
  buildArena(); P.alive = false; P.rag = null;
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
  buildTest(); spawnDummies(); enterGame('test'); respawnLocal(spawns[0]);
}
function leave() {
  net.close();
  for (const r of S.remotes.values()) r.dispose(); S.remotes.clear();
  for (const d of dummies) d.dispose(); dummies.length = 0;
  while (ragdolls.length) ragdolls.pop().dispose();
  clearItems(); drops.length = 0; hlMesh.visible = false; $('pickup').style.display = 'none';
  for (const d of decals) { scene.remove(d); if (d.geometry !== splatGeo) d.geometry.dispose(); } decals.length = 0; clearPools(); clearGore(); for (const d of debris) scene.remove(d.m); debris.length = 0;
  for (const p of props) scene.remove(p.m); props.length = 0;
  while (bullets.length) removeBullet(bullets.length - 1);
  S.slow = false; S.ts = 1; S.target = null; S.testKills = 0; S.testDeaths = 0; P.downed = false; $('scope').style.display = 'none'; $('score').style.display = 'none'; S.filt = ''; renderer.domElement.style.filter = ''; $('slowmo').style.display = 'none';
  $('vig').style.display = $('vigads').style.display = 'none';
  S.mode = null; P.alive = false; P.rag = null; localBody.root.visible = false;
  $('hud').style.display = 'none'; $('pause').style.display = 'none'; $('menu').style.display = 'flex';
  $('black').style.opacity = '0'; $('deathmsg').style.display = 'none'; $('dmgv').style.opacity = '0';
  if (document.pointerLockElement) document.exitPointerLock();
  buildArena(); setTimeout(warmShaders, 50);
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
$('create').onclick = () => { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; startOnline(c, true); };
$('join').onclick = () => { const c = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 4) { $('err').textContent = 'Enter a valid room code'; return; } startOnline(c, false); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
$('test').onclick = () => startTest();
$('resume').onclick = () => renderer.domElement.requestPointerLock();
try { S.showTarget = localStorage.getItem('breach_target_panel') === '1'; } catch (e) { S.showTarget = false; }
$('opt_target').checked = !!S.showTarget;
setPixelation(50);   // the retro look is part of the game: fixed, no setting
$('opt_target').onchange = () => { S.showTarget = $('opt_target').checked; try { localStorage.setItem('breach_target_panel', S.showTarget ? '1' : '0'); } catch (e) {} };
document.querySelectorAll('.attm1').forEach(b => b.onclick = () => openAttMenu(P.loadout[+b.dataset.i]));
$('leave').onclick = () => leave();

// ---------------------------------------------------------------- main loop
buildArena(); setTimeout(warmShaders, 300);
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
    updatePlayer(dt); updateWeapons(dt);
    for (const r of S.remotes.values()) r.update(dt);
    // far bodies are stepped less often (every 2nd frame past 40 m, every 3rd past 80 m) with the time they missed: nobody
    // can see a 20 Hz animation at that range, and the AI and animation of a range full of targets was a big part of each frame
    frameN++;
    for (let i = 0; i < dummies.length; i++) {
      const d = dummies[i], r = d.hum && d.hum.root, far = r ? r.position.distanceToSquared(camera.position) : 0, k = far > 6400 ? 3 : far > 1600 ? 2 : 1;
      d._acc = (d._acc || 0) + wdt;
      if (k === 1 || (frameN + i) % k === 0) { d.update(Math.min(d._acc, 0.12)); d._acc = 0; }
    }
    netSend(dt); updateHUD(); updateToolbar(); updateInv(dt); updatePickup();
  }
  updateBullets(wdt);
  for (const r of ragdolls) r.update(wdt);
  updateFx(wdt); updateDebris(wdt); updateGore(wdt); updateBlood(wdt); updatePools(wdt); updateProps(wdt); updateHeats(wdt);
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
  renderer.clear();
  renderScope();
  const rt = retroTarget();
  if (rt) { renderer.setRenderTarget(rt); renderer.clear(); }
  renderer.render(scene, camera);
  if (S.mode && P.alive && !P.downed && !S.tp) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
  if (rt) { renderer.setRenderTarget(null); renderer.render(RETRO.scene, RETRO.cam); }
}
schedule();
