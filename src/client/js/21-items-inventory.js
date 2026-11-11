// ---------------------------------------------------------------- ground items, pickup (F), backpack
const items = new Map(); let itemSeq = 1;
const PACK_COLS = 6, PACK_ROWS = 5;
const itemSize = it => it.kind === 'gun' ? (WEAPONS[it.w].kind === 'pistol' ? [2, 1] : WEAPONS[it.w].kind === 'sniper' ? [6, 2] : [4, 2]) : it.kind === 'medkit' ? [2, 1] : it.kind === 'plate' ? [2, 2] : isPistol(it.w) ? [1, 1] : [1, 2];
const itemName = it => it.kind === 'gun' ? WEAPONS[it.w].name : it.kind === 'mag' ? WEAPONS[it.w].name + ' magazine' : it.kind === 'medkit' ? 'IFAK medkit' : 'Armor plate';
const outlineMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, transparent: true,
  vertexShader: 'void main(){ vec4 mv = modelViewMatrix * vec4(position + normal * 0.0028, 1.0); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(1.0, 0.82, 0.2, 0.9); }' });
const hlMesh = new THREE.Mesh(new THREE.BufferGeometry(), outlineMat); hlMesh.matrixAutoUpdate = false; hlMesh.visible = false; hlMesh.frustumCulled = false; scene.add(hlMesh);
let medItemGeo = null;
function itemMesh(it) {
  if (it.kind === 'gun') return gunItemMesh(WEAPONS[it.w].id, false);
  if (it.kind === 'mag') return gunItemMesh(WEAPONS[it.w].id, true);
  if (it.kind === 'plate') { const m = new THREE.Mesh(GC('plate', plateGeo), mat(0x55553f, 0.95)); m.castShadow = true; return m; }
  if (!medItemGeo) { const g = new THREE.Group(); buildMedPouch(TP_KIT, g); medItemGeo = bakeColored(g); }
  const m = new THREE.Mesh(medItemGeo, vcMat); m.castShadow = true; return m;
}
function spawnItem(it, pos, vel, fromNet, life) {
  if (!it.id) it.id = (S.myId || 0) * 100000 + itemSeq++;
  if (items.has(it.id)) return;
  const m = itemMesh(it); m.position.copy(pos); m.rotation.order = 'YXZ'; m.rotation.set(rnd(-1, 1), rnd(0, 6), rnd(-1, 1)); scene.add(m);
  const prop = { m, v: vel.clone(), w: new V3(rnd(-5, 5), rnd(-5, 5), rnd(-5, 5)), r: it.kind === 'gun' ? 0.035 : 0.02, kind: 'gun', rest: false, life: 0, max: life || 600, item: it };
  props.push(prop); items.set(it.id, { it, m, prop });
  if (!fromNet && S.mode === 'online' && net.ready()) { const r3 = v => Math.round(v * 100) / 100; net.send({ t: 'idrop', it, p: pos.toArray().map(r3), v: vel.toArray().map(r3) }); }
}
function removeItem(id) { const e = items.get(id); if (!e) return; items.delete(id); scene.remove(e.m); const i = props.indexOf(e.prop); if (i >= 0) props.splice(i, 1); if (S.pick === e) S.pick = null; }
function clearItems() { for (const id of [...items.keys()]) removeItem(id); }
// everything carried that takes backpack space, and a first-fit layout on the 6 x 5 grid
// backpack contents with a stable key each, so every item keeps the cell and rotation the player gave it
function packItems() {
  const out = [], lo = P.activeLo || [];
  (P.packGuns || []).forEach((g, i) => { if (!g.uid) g.uid = ++itemSeq; out.push({ kind: 'gun', w: g.w, ref: i, key: 'g' + g.uid }); });
  for (let i = 0; i < P.platesInv; i++) out.push({ kind: 'plate', key: 'pl' + i });
  for (let i = 0; i < P.medUses; i++) out.push({ kind: 'medkit', key: 'md' + i });
  for (const wi of lo) if (wi != null && P.guns[wi]) P.guns[wi].pouch.forEach((n, k) => out.push({ kind: 'mag', w: wi, n, k, key: 'm' + wi + '_' + k }));
  (P.loose || []).forEach((m, i) => out.push({ kind: 'mag', w: m.w, n: m.n, loose: i, key: 'l' + i }));
  return out;
}
function gridFree(grid, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > PACK_COLS || y + h > PACK_ROWS) return false;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (grid[(y + yy) * PACK_COLS + x + xx]) return false;
  return true;
}
function gridMark(grid, x, y, w, h) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) grid[(y + yy) * PACK_COLS + x + xx] = true; }
// items keep their stored cell; anything new goes in the first gap it fits, turned on its side if that is the only way
function packLayout(list, skipKey) {
  const grid = Array(PACK_COLS * PACK_ROWS).fill(false), pos = P.packPos || (P.packPos = {}); let ok = true, used = 0; const todo = [];
  for (const it of list) {
    const [bw, bh] = itemSize(it), s = pos[it.key]; it.pos = null; used += bw * bh;
    if (it.key === skipKey) continue;
    if (s) { const w = s[2] ? bh : bw, h = s[2] ? bw : bh; if (gridFree(grid, s[0], s[1], w, h)) { gridMark(grid, s[0], s[1], w, h); it.pos = [s[0], s[1]]; it.r = s[2]; it.cw = w; it.ch = h; continue; } }
    todo.push(it);
  }
  for (const it of todo) {
    const [bw, bh] = itemSize(it);
    for (const r of [0, 1]) { const w = r ? bh : bw, h = r ? bw : bh;
      for (let y = 0; y <= PACK_ROWS - h && !it.pos; y++) for (let x = 0; x <= PACK_COLS - w && !it.pos; x++) if (gridFree(grid, x, y, w, h)) { gridMark(grid, x, y, w, h); it.pos = [x, y]; it.r = r; it.cw = w; it.ch = h; pos[it.key] = [x, y, r]; }
      if (it.pos) break; }
    if (!it.pos) ok = false;
  }
  return { ok, used, list, grid };
}
function packFits(extra) { if (!extra) return true; const e = Object.assign({}, extra, { key: '__new' }); delete P.packPos.__new; const ok = packLayout(packItems().concat([e])).ok; delete P.packPos.__new; return ok; }
function looseFor(w) { const out = []; P.loose = (P.loose || []).filter(m => m.w === w ? (out.push(m.n), false) : true); return out; }
// ---- item icons (drawn lying flat, 64 px per cell)
const ICO = {
  m4: '<path d="M6 52h30l6-8h20v-6h46v-8h8v8h90v6h22v6h24v6h-24v4h-40l-4 6h-30l-10 34h-22l8-34h-18l-4 24h-18l2-24h-30l-10 22H10l8-26z"/><rect x="150" y="28" width="26" height="14" rx="2"/>',
  ak74: '<path d="M6 56l44-8h40v-8h60v-8h10v8h54v6h26v6h-26v6h-52l-2 6h-22l-22 42h-22l14-42h-22l-4 26h-18l2-26H50L14 76z"/><rect x="232" y="44" width="16" height="12" rx="2"/>',
  m107: '<path d="M4 52h52v-6h150v6h120v-6h30v20h-30v-6H206v10h-70v36h-36V70H86l-8 30H58l4-30H4z"/><rect x="96" y="18" width="110" height="18" rx="9"/><rect x="118" y="34" width="8" height="12"/><rect x="176" y="34" width="8" height="12"/><path d="M230 66l40 34h-8l-38-34z"/>',
  g17: '<path d="M10 14h100v18H70l-4 8H48l8 22H30l-8-26H10z"/>',
  m9: '<path d="M8 16h104v8h-8v8H72l-4 8H50l8 22H32l-8-28H8z"/><rect x="100" y="12" width="14" height="8" rx="2"/>',
  magr: '<path d="M18 8h30v50q0 34-12 58H10q12-28 8-58z"/>',
  magp: '<path d="M20 8h22l4 44H14z"/><rect x="12" y="50" width="38" height="8" rx="2"/>',
  medkit: '<rect x="14" y="10" width="100" height="46" rx="8"/><rect x="20" y="4" width="88" height="10" rx="4"/><path d="M56 22h16v8h8v10h-8v8H56v-8h-8V30h8z" fill="#b01c1c"/>',
  plate: '<path d="M30 12h68l18 26v62q0 10-10 10H22q-10 0-10-10V38z"/><rect x="40" y="56" width="48" height="26" rx="3" fill="#3a444e"/>'
};
function itemIcon(it) { return it.kind === 'gun' ? ICO[WEAPONS[it.w].id] : it.kind === 'mag' ? (isPistol(it.w) ? ICO.magp : ICO.magr) : ICO[it.kind]; }
const itemDesc = it => it.kind === 'gun' ? (attSummary2(it.att) || 'No attachments') + '. Drag onto a weapon slot to equip.' : it.kind === 'mag' ? magEstimate(it.n, WEAPONS[it.w].cap) + '. Click to load it on the next reload.' : it.kind === 'medkit' ? 'Stops bleeding, splints fractures, dulls pain.' : 'Level IV ceramic plate. Drag onto the plate carrier to swap it in.';
// icon box for an item of base size bw x bh cells, optionally turned 90 degrees
function iconHtml(it, r, cs) {
  const [bw, bh] = itemSize(it), W = bw * cs, H = bh * cs;
  const svg = '<svg viewBox="0 0 ' + bw * 64 + ' ' + bh * 64 + '" width="' + W + '" height="' + H + '" fill="#b9c2cb">' + itemIcon(it) + '</svg>';
  return r ? '<div style="position:absolute;left:' + H + 'px;top:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0;transform:rotate(90deg)">' + svg + '</div>' : svg;
}
const CS = 64;
let invTimer = 0, invKey = '', drag = null;
const DOLL_SVG = '<svg viewBox="0 0 160 300" class="dollsvg"><g fill="#2a3036" stroke="#4a545e" stroke-width="1.2">' +
  '<ellipse cx="80" cy="30" rx="19" ry="23"/><rect x="70" y="50" width="20" height="12" rx="4"/><path d="M46 62 Q80 54 114 62 L118 132 Q80 140 42 132 Z"/>' +
  '<path d="M44 132 Q80 142 116 132 L114 162 Q80 172 46 162 Z"/><rect x="24" y="64" width="18" height="62" rx="8"/><rect x="118" y="64" width="18" height="62" rx="8"/>' +
  '<rect x="20" y="124" width="16" height="56" rx="7"/><rect x="124" y="124" width="16" height="56" rx="7"/><rect x="50" y="162" width="25" height="70" rx="10"/><rect x="85" y="162" width="25" height="70" rx="10"/>' +
  '<rect x="52" y="230" width="21" height="58" rx="8"/><rect x="87" y="230" width="21" height="58" rx="8"/></g></svg>';
function condBar(v) { v = clamp(v, 0, 100); return '<i class="cb"><b style="width:' + v + '%;background:' + (v <= 0 ? '#ff3b30' : v < 40 ? '#ffb020' : '#6fcf6a') + '"></b></i>'; }
const tipAttr = (name, desc) => ' data-tn="' + name.replace(/"/g, '') + '" data-td="' + desc.replace(/"/g, '') + '"';
function renderInv() {
  if (!S.inv || drag) return;
  const an = P.anat, A = an.armor, lo = P.activeLo, L = packLayout(packItems());
  const key = JSON.stringify([lo, L.list.map(i => [i.key, i.w, i.n, i.pos, i.r]), A, an.helmetOn, P.tools, P.invPlate && Math.round(P.invPlate.t * 10), lo.map(w => w != null && P.guns[w] ? [P.guns[w].next, attSummary(w)] : 0)]);
  if (key === invKey) return; invKey = key;
  const prog = P.invPlate ? '<span class="prog">installing ' + Math.round(P.invPlate.t / 2 * 100) + '%</span>' : '';
  const slot = (id, label, body, tip, extra) => '<div class="eq" id="eq_' + id + '" data-slot="' + id + '"' + (tip || '') + (extra || '') + '><label>' + label + '</label>' + body + '</div>';
  const mini = (it, w) => '<div class="mini">' + iconHtml(it, 0, w / itemSize(it)[0]) + '</div>';
  const gunSlot = (i) => {
    const wi = lo[i], id = i ? 'sec' : 'pri', label = i ? 'SECONDARY' : 'PRIMARY';
    if (wi == null) return slot(id, label, '', tipAttr('Empty ' + label.toLowerCase() + ' slot', 'Drag a ' + (i ? 'pistol' : 'rifle') + ' here.'));
    const it = { kind: 'gun', w: wi, att: attOf(wi) };
    return slot(id, label, mini(it, i ? 90 : 170) + '<button class="attb" data-wi="' + wi + '">Attachments</button>', tipAttr(WEAPONS[wi].name, (attSummary2(it.att) || 'No attachments') + '. Drag into the backpack to stow, or onto the ground.'), ' data-drag="1" data-kind="eqgun" data-s="' + id + '" data-w="' + wi + '"');
  };
  const tool = (i) => { const t = P.tools[i]; return slot('t' + i, 'TOOL ' + (i + 3), t ? mini({ kind: t }, 70) + '<b class="cnt">x' + toolCount(t) + '</b>' : '', tipAttr(t ? TOOL_NAME[t] : 'Empty tool slot', t ? 'Key ' + (i + 3) + ' uses this. Drag another tool here to change it.' : 'Drag a medkit or plate here.')); };
  $('invL').innerHTML = '<div class="doll">' + DOLL_SVG +
    slot('plateF', 'FRONT PLATE', mini({ kind: 'plate' }, 44) + condBar(A.plateF) + prog, tipAttr('Plate carrier', (A.plateF <= 0 ? 'Plate broken.' : 'Plate at ' + Math.round(A.plateF) + '%.') + ' Protects the front only. Drag a spare plate here to replace it.')) +
    slot('pack', 'BACKPACK', '<div class="nm">' + L.used + ' / 30</div>' + condBar(100 - L.used / 30 * 100), tipAttr('Assault pack', '30 slots. Bigger items take more cells. Press R while dragging to turn an item.')) +
    gunSlot(0) + gunSlot(1) + tool(0) + tool(1) + '</div>';
  const cards = L.list.filter(it => it.pos).map(it => {
    const G = P.guns[it.w], nx = it.kind === 'mag' && it.k !== undefined && G && G.next === it.k;
    let data = 'data-drag="1" data-key="' + it.key + '" data-kind="' + it.kind + '" data-r="' + (it.r || 0) + '"';
    if (it.w !== undefined) data += ' data-w="' + it.w + '"';
    if (it.kind === 'mag') data += it.k !== undefined ? ' data-wi="' + it.w + '" data-k="' + it.k + '"' : ' data-loose="' + it.loose + '"';
    if (it.kind === 'gun') data += ' data-ref="' + it.ref + '"';
    const full = it.kind === 'gun' ? Object.assign({ att: P.packGuns[it.ref].att }, it) : it;
    return '<div class="pit ' + it.kind + (nx ? ' next' : '') + '" ' + data + tipAttr(itemName(it) + (nx ? ' (loads next)' : ''), itemDesc(full)) + ' style="left:' + it.pos[0] * CS + 'px;top:' + it.pos[1] * CS + 'px;width:' + it.cw * CS + 'px;height:' + it.ch * CS + 'px">' + iconHtml(it, it.r, CS) + '</div>';
  }).join('');
  $('invR').innerHTML = '<div class="ih">BACKPACK ' + L.used + ' / 30 <small>Drag items to arrange them. R turns the item you are dragging. Hover for details.</small></div>' +
    '<div class="pack" data-slot="packgrid" style="width:' + PACK_COLS * CS + 'px;height:' + PACK_ROWS * CS + 'px">' + cards + '<div id="pghost"></div></div><div class="eq gdrop" data-slot="ground">DROP ON THE GROUND</div>';
  $('inv').querySelectorAll('.attb').forEach(b => { b.addEventListener('mousedown', e => e.stopPropagation()); b.addEventListener('click', () => openAttMenu(+b.dataset.wi)); });
}
function setNextMag(wi, k) { const G = P.guns[wi]; if (!G) return; G.next = G.next === k ? null : k; blip(900, 0.03, 0.04); invKey = ''; renderInv(); }
// ---- dragging: custom (not the browser's own drag and drop) so R can turn the item mid-drag
function dragCell(e) {
  const pk = document.querySelector('#invR .pack'); if (!pk) return null; const rc = pk.getBoundingClientRect();
  const w = drag.r ? drag.bh : drag.bw, h = drag.r ? drag.bw : drag.bh;
  if (e.clientX < rc.left - 20 || e.clientX > rc.right + 20 || e.clientY < rc.top - 20 || e.clientY > rc.bottom + 20) return null;
  return { x: clamp(Math.round((e.clientX - rc.left) / CS - w / 2), 0, PACK_COLS - w), y: clamp(Math.round((e.clientY - rc.top) / CS - h / 2), 0, PACK_ROWS - h), w, h };
}
function dragUpdate(e) {
  if (!drag) return; drag.e = e;
  const w = drag.r ? drag.bh : drag.bw, h = drag.r ? drag.bw : drag.bh, gh = $('dragghost');
  gh.style.display = 'block'; gh.style.width = w * CS + 'px'; gh.style.height = h * CS + 'px'; gh.style.left = (e.clientX - w * CS / 2) + 'px'; gh.style.top = (e.clientY - h * CS / 2) + 'px';
  if (drag.dirty) { gh.innerHTML = iconHtml(drag.it, drag.r, CS); drag.dirty = false; }
  const c = dragCell(e), pg = $('pghost');
  if (pg) { if (c) { const free = gridFree(packLayout(packItems(), drag.d.key).grid, c.x, c.y, c.w, c.h); pg.style.display = 'block'; pg.style.left = c.x * CS + 'px'; pg.style.top = c.y * CS + 'px'; pg.style.width = c.w * CS + 'px'; pg.style.height = c.h * CS + 'px'; pg.className = free ? 'ok' : 'no'; drag.cell = free ? c : null; drag.over = true; } else { pg.style.display = 'none'; drag.cell = null; drag.over = false; } }
}
function dragEnd(e) {
  const d = drag; if (!d) return; drag = null; $('dragghost').style.display = 'none'; if (d.el) d.el.classList.remove('drag');
  if (!d.moved) { if (d.d.kind === 'mag' && d.d.k !== undefined) setNextMag(+d.d.wi, +d.d.k); invKey = ''; renderInv(); return; }
  const el = document.elementFromPoint(e.clientX, e.clientY), tgt = el && el.closest('[data-slot]'), slot = tgt ? tgt.dataset.slot : null;
  if (d.over) {
    if (!d.cell) flashMsg('NO ROOM THERE', 900);
    else if (d.d.kind === 'eqgun') { const si = d.d.s === 'pri' ? 0 : 1, old = unequipGun(si); if (old) { old.uid = ++itemSeq; P.packPos['g' + old.uid] = [d.cell.x, d.cell.y, d.r]; P.packGuns.push(old); noiseHit(500, 0.1, 0.07); } }
    else { P.packPos[d.d.key] = [d.cell.x, d.cell.y, d.r]; blip(600, 0.02, 0.03); }
  } else if (slot) invDrop(slot, d.d);
  invKey = ''; renderInv();
}
$('inv').addEventListener('mousedown', e => {
  if (e.button !== 0) return; const el = e.target.closest('[data-drag]'); if (!el) return; e.preventDefault();
  const ds = Object.assign({}, el.dataset), it = ds.kind === 'eqgun' ? { kind: 'gun', w: +ds.w } : { kind: ds.kind, w: ds.w === undefined ? undefined : +ds.w };
  const [bw, bh] = itemSize(it);
  drag = { d: ds, it, bw, bh, r: +(ds.r || 0), el, sx: e.clientX, sy: e.clientY, moved: false, dirty: true }; $('tip').style.display = 'none';
});
addEventListener('mousemove', e => {
  if (drag) { if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.moved = true; drag.el.classList.add('drag'); } if (drag.moved) dragUpdate(e); return; }
  const tp = $('tip'); if (!S.inv) { if (tp.style.display !== 'none') tp.style.display = 'none'; return; }
  const el = e.target.closest && e.target.closest('[data-tn]');
  if (!el) { tp.style.display = 'none'; return; }
  tp.innerHTML = '<b>' + el.dataset.tn + '</b>' + el.dataset.td; tp.style.display = 'block'; tp.style.left = Math.min(innerWidth - 250, e.clientX + 16) + 'px'; tp.style.top = (e.clientY + 18) + 'px';
});
addEventListener('mouseup', e => { if (drag) dragEnd(e); });
function dragRotate() { if (!drag || drag.bw === drag.bh) return; drag.r ^= 1; drag.dirty = true; blip(800, 0.02, 0.03); if (drag.e) dragUpdate(drag.e); }
function invDrop(slot, d) {
  const toGround = it => { const [p, v] = throwPos(); spawnItem(it, p, v); };
  if (slot === 'ground') {
    if (d.kind === 'mag' && d.k !== undefined) { const G = P.guns[+d.wi]; if (G && G.pouch[+d.k] !== undefined) { toGround({ kind: 'mag', w: +d.wi, n: G.pouch.splice(+d.k, 1)[0] }); G.next = null; } }
    else if (d.kind === 'mag' && d.loose !== undefined) { const m = P.loose.splice(+d.loose, 1)[0]; if (m) toGround({ kind: 'mag', w: m.w, n: m.n }); }
    else if (d.kind === 'medkit' && P.medUses > 0) { P.medUses--; toGround({ kind: 'medkit' }); }
    else if (d.kind === 'plate' && P.platesInv > 0) { P.platesInv--; toGround({ kind: 'plate' }); }
    else if (d.kind === 'gun') { const g = P.packGuns.splice(+d.ref, 1)[0]; if (g) toGround(Object.assign({ kind: 'gun' }, g, { uid: undefined })); }
    else if (d.kind === 'eqgun') dropWeapon(d.s === 'pri' ? 0 : 1);
  } else if (d.kind === 'plate' && slot === 'plateF') {
    if (!P.invPlate && !P.downed) { P.invPlate = { which: 'plateF', t: 0 }; noiseHit(600, 0.15, 0.06); }
  } else if ((d.kind === 'medkit' || d.kind === 'plate') && (slot === 't0' || slot === 't1')) {
    const i = +slot[1], o = 1 - i;
    if (P.tools[o] === d.kind) P.tools[o] = P.tools[i];
    P.tools[i] = d.kind; blip(700, 0.04, 0.04);
  } else if (d.kind === 'mag' && d.k !== undefined && (slot === 'pri' || slot === 'sec')) {
    if (P.activeLo[slot === 'pri' ? 0 : 1] === +d.wi) setNextMag(+d.wi, +d.k);
  } else if (d.kind === 'gun' && (slot === 'pri' || slot === 'sec')) {
    const g = P.packGuns[+d.ref], si = slot === 'pri' ? 0 : 1;
    if (g && gunSlotOf(g.w) === si) {
      P.packGuns.splice(+d.ref, 1);
      const old = unequipGun(si);
      equipGun(g, si);
      if (old) { if (packFits(old)) P.packGuns.push(old); else { toGround(old); flashMsg('NO ROOM: OLD WEAPON DROPPED', 1500); } }
      noiseHit(500, 0.1, 0.07);
    } else flashMsg(si ? 'ONLY PISTOLS GO IN THE SECONDARY SLOT' : 'ONLY RIFLES GO IN THE PRIMARY SLOT', 1500);
  } else if (d.kind === 'eqgun' && slot === 'pack') {
    const si = d.s === 'pri' ? 0 : 1, w = P.activeLo[si];
    if (w != null) { if (packFits({ kind: 'gun', w })) { const old = unequipGun(si); P.packGuns.push(old); noiseHit(500, 0.1, 0.07); } else flashMsg('NO ROOM IN THE BACKPACK', 1500); }
  }
  invKey = '';
}
// B: drop whatever is in your hands
function dropHeld() {
  if (!P.alive || P.downed) return;
  if (P.slot < 2) { if (dropWeapon()) noiseHit(500, 0.08, 0.06); return; }
  const [p, v] = throwPos();
  if (P.slot === 2 && P.medUses > 0 && !P.healing) { P.medUses--; spawnItem({ kind: 'medkit' }, p, v); }
  else if (P.slot === 3 && P.platesInv > 0 && !P.plating) { P.platesInv--; spawnItem({ kind: 'plate' }, p, v); }
}
const gunSlotOf = w => isPistol(w) ? 1 : 0;
function equipGun(g, slot) {
  P.activeLo[slot] = g.w; P.guns[g.w] = { mag: g.mag, chamber: g.chamber, pouch: looseFor(g.w) };
  if (g.att) { ATTS[WEAPONS[g.w].id] = Object.assign({}, ATT_DEFAULT[WEAPONS[g.w].id], g.att); applyAttachments(g.w); }
  if (P.slot === 4) { P.slot = slot; P.weapon = g.w; P.switchT = 0.45; }
}
function unequipGun(slot) {
  const w = P.activeLo[slot], G = P.guns[w]; if (w == null || !G) return null;
  for (const n of G.pouch) P.loose.push({ w, n });
  delete P.guns[w]; P.activeLo[slot] = null; P.reloading = false; P.inspecting = false; P.adsOn = false;
  if (P.slot === slot) { const o = P.activeLo[1 - slot]; if (o != null) { P.slot = 1 - slot; P.weapon = o; P.switchT = 0.5; } else P.slot = 4; }
  return { kind: 'gun', w, mag: G.mag, chamber: G.chamber, att: Object.assign({}, attOf(w)) };
}
function throwPos() { const f = new V3(); camera.getWorldDirection(f); return [camera.position.clone().addScaledVector(f, 0.45).add(new V3(0, -0.25, 0)), f.multiplyScalar(1.6).add(new V3(rnd(-0.4, 0.4), 1.2, rnd(-0.4, 0.4))).add(P.vel)]; }
function dropWeapon(slot) {
  if (slot === undefined) { if (P.slot >= 2) return false; slot = P.slot; }
  const it = unequipGun(slot); if (!it) return false;
  const [p, v] = throwPos(); spawnItem(it, p, v); return true;
}
function updatePickup() {
  let best = null, bd = 1e9; hlMesh.visible = false;
  if (S.mode && P.alive && !P.downed && !S.inv) {
    const f = _a; camera.getWorldDirection(f);
    for (const e of items.values()) {
      const to = _b.subVectors(e.m.position, camera.position), d = to.length(); if (d > 2.6) continue;
      const dot = to.dot(f) / (d || 1); if (dot < 0.8 && d > 0.9) continue;
      const sc = d * (1.6 - dot); if (sc < bd) { bd = sc; best = e; }
    }
  }
  S.pick = best; const el = $('pickup');
  if (!best) { el.style.display = 'none'; return; }
  hlMesh.geometry = best.m.geometry; best.m.updateMatrixWorld(); hlMesh.matrix.copy(best.m.matrixWorld); hlMesh.matrixWorld.copy(best.m.matrixWorld); hlMesh.visible = true;
  const it = best.it; el.style.display = 'block';
  el.innerHTML = '<b>F</b> Pick up ' + itemName(it) + (it.kind === 'gun' ? '<small>' + (attSummary2(it.att) || 'no attachments') + '</small>' : '');
}
function attSummary2(A) { if (!A) return ''; const o = []; if (A.optic && A.optic !== 'irons') o.push(ATT.optic[A.optic]); if (A.muzzle === 'supp') o.push('Suppressor'); if (A.under && A.under !== 'none') o.push(ATT.under[A.under]); if (A.side && A.side !== 'none') o.push(ATT.side[A.side]); return o.join(', '); }
function pickUp() {
  const e = S.pick; if (!e || !P.alive || P.downed) return;
  const it = e.it; let msg = '';
  if (it.kind === 'gun') {
    const slot = gunSlotOf(it.w);
    if (P.activeLo[slot] == null) { equipGun(it, slot); msg = 'EQUIPPED ' + WEAPONS[it.w].name.toUpperCase(); }
    else if (packFits(it)) { P.packGuns.push({ w: it.w, mag: it.mag, chamber: it.chamber, att: it.att }); msg = WEAPONS[it.w].name.toUpperCase() + ' STOWED IN BACKPACK'; }
    else { flashMsg('NO ROOM<small>A ' + WEAPONS[it.w].name + ' needs ' + itemSize(it)[0] * itemSize(it)[1] + ' backpack slots</small>', 1500); return; }
  } else {
    if (!packFits(it)) { flashMsg('BACKPACK FULL', 1200); return; }
    if (it.kind === 'mag') { const G = P.guns[it.w]; if (G && P.activeLo.includes(it.w)) G.pouch.push(it.n); else P.loose.push({ w: it.w, n: it.n }); }
    else if (it.kind === 'medkit') P.medUses++; else P.platesInv++;
    msg = 'PICKED UP ' + itemName(it).toUpperCase();
  }
  removeItem(it.id); if (S.mode === 'online' && net.ready()) net.send({ t: 'itake', iid: it.id });
  flashMsg(msg, 1300); noiseHit(700, 0.08, 0.07); blip(520, 0.04, 0.04);
}
// ---------------------------------------------------------------- toolbar + inventory (G)
const TOOL_NAME = { medkit: 'IFAK medkit', plate: 'Armor plate' };
function toolSlotIndex(i) { const t = P.tools[i]; return t === 'medkit' ? 2 : t === 'plate' ? 3 : -1; }
function toolCount(t) { return t === 'medkit' ? P.medUses : t === 'plate' ? P.platesInv : 0; }
let tbKey = '';
function updateToolbar() {
  const tb = $('toolbar');
  if (!S.mode || !P.alive || P.downed) { tb.style.display = 'none'; tbKey = ''; return; }
  tb.style.display = 'flex';
  const lo = P.activeLo, gr = i => lo[i] == null ? [i + 1, 'Empty', '', false] : [i + 1, WEAPONS[lo[i]].name, attSummary(lo[i]), P.slot === i];
  const rows = [gr(0), gr(1),
    [3, P.tools[0] ? TOOL_NAME[P.tools[0]] : 'Empty', P.tools[0] ? 'x' + toolCount(P.tools[0]) : '', P.slot === toolSlotIndex(0)],
    [4, P.tools[1] ? TOOL_NAME[P.tools[1]] : 'Empty', P.tools[1] ? 'x' + toolCount(P.tools[1]) : '', P.slot === toolSlotIndex(1)]];
  const key = JSON.stringify(rows);
  if (key === tbKey) return; tbKey = key;
  tb.innerHTML = rows.map(r => '<div class="tb' + (r[3] ? ' on' : '') + (r[1] === 'Empty' ? ' empty' : '') + '"><b>' + r[0] + '</b><div><span>' + r[1] + '</span><small>' + r[2] + '</small></div></div>').join('');
}
function attSummary(wi) {
  const A = attOf(wi), out = [];
  if (A.optic && A.optic !== 'irons') out.push({ holo: 'Holo', reddot: 'RDS', acog: '4x' }[A.optic]);
  if (A.muzzle === 'supp') out.push('Supp');
  if (A.under && A.under !== 'none') out.push({ vert: 'VFG', angled: 'AFG' }[A.under]);
  if (A.side && A.side !== 'none') out.push({ laser: 'Laser', light: 'Light' }[A.side]);
  return out.join(' / ');
}
S.inv = false;
function openInv() {
  if (!S.mode || !P.alive) return;
  S.inv = true; $('inv').style.display = 'flex'; invKey = ''; renderInv();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeInv() {
  S.inv = false; drag = null; $('dragghost').style.display = 'none'; $('tip').style.display = 'none'; $('inv').style.display = 'none'; $('attm').style.display = 'none';
  if (S.mode) renderer.domElement.requestPointerLock();
}
function updateInv(dt) {
  if (P.invPlate) {
    if (!P.alive || P.downed) P.invPlate = null;
    else { P.invPlate.t += dt; if (P.invPlate.t >= 2) { installPlate(P.invPlate.which); P.invPlate = null; } }
  }
  if (!S.inv) return;
  if (!P.alive) { closeInv(); return; }
  invTimer += dt; if (invTimer > 0.2) { invTimer = 0; if (!document.querySelector('#inv .drag')) renderInv(); }
}
// attachments picker (also reachable from the menus)
let attWi = 0;
function openAttMenu(wi) {
  attWi = wi; const id = WEAPONS[wi].id, A = ATTS[id];
  let h = '<div class="ah"><b>' + WEAPONS[wi].name + '</b> attachments<button id="attx">Close</button></div>';
  for (const slot of ATT_SLOTS[id]) {
    h += '<div class="arow"><label>' + ATT_SLOT_NAME[slot] + '</label><div class="aopts">';
    for (const k in ATT[slot]) h += '<button class="aopt' + (A[slot] === k ? ' on' : '') + '" data-s="' + slot + '" data-k="' + k + '">' + ATT[slot][k] + '<small>' + ATT_DESC[slot][k] + '</small></button>';
    h += '</div></div>';
  }
  $('attm').innerHTML = h; $('attm').style.display = 'block';
  $('attx').onclick = () => { $('attm').style.display = 'none'; };
  $('attm').querySelectorAll('.aopt').forEach(b => b.onclick = () => { ATTS[id][b.dataset.s] = b.dataset.k; saveAtt(); applyAttachments(wi); blip(1000, 0.03, 0.04); openAttMenu(wi); invKey = ''; renderInv(); });
}
const ATT_DESC = {
  optic: { irons: 'Flip-up BUIS, widest view', holo: 'EXPS3-style, 1x, 68 MOA ring', reddot: 'Micro dot on a riser, 1x', acog: 'Fixed 4x, chevron reticle' },
  muzzle: { std: 'Flash hider / bare muzzle', supp: 'Quieter, no flash, -10% recoil' },
  under: { none: 'Bare handguard', vert: 'Vertical grip, -18% recoil', angled: 'Angled grip, faster aim' },
  side: { none: 'Nothing mounted', laser: 'Visible laser (T toggles)', light: 'Weapon light (T toggles)' }
};

