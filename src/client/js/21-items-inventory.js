// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { $, V3, renderer, rnd, scene } from './00-setup.js';
import { mat } from './01-world.js';
import { GC, plateGeo, vcMat } from './02-body-parts.js';
import { WEAPONS, isPistol, isShotgun } from './06-weapons.js';
import { bakeColored } from './07-gun-models.js';
import { TP_KIT, gunItemMesh } from './08-hands.js';
import { ATT, ATTS, ATT_DEFAULT, ATT_SLOTS, ATT_SLOT_NAME, applyAttachments, attOf, buildMedPouch, saveAtt } from './09-attachments.js';
import { blip } from './10-audio.js';
import { props } from './16-ballistics.js';
import { P, S } from './17-dummies.js';
import { magEstimate, selectEmpty, switchWeapon } from './18-player.js';
import { net } from './19-network.js';
import { c4Mine, nadeAbandon, nadeReset, r3 } from './19b-explosives.js';
import { SG } from './23-siege.js';
import { GADGETS, gadgetGhostOff } from './27-gadgets.js';
// ---- end module links ----
// ---------------------------------------------------------------- ground items, pickup (F), backpack
const items = new Map(); let itemSeq = 1;
const PACK_COLS = 6, PACK_ROWS = 5;
const itemSize = it => it.kind === 'mag' && isShotgun(it.w) ? [2, 1] : it.kind === 'gun' ? (WEAPONS[it.w].kind === 'pistol' ? [2, 1] : WEAPONS[it.w].kind === 'sniper' ? [6, 2] : [4, 2]) : it.kind === 'medkit' ? [2, 1] : it.kind === 'plate' ? [2, 2] : isPistol(it.w) ? [1, 1] : [1, 2];
const itemName = it => it.kind === 'gun' ? WEAPONS[it.w].name : it.kind === 'mag' && isShotgun(it.w) ? '12 ga shell carrier' : it.kind === 'mag' ? WEAPONS[it.w].name + ' magazine' : it.kind === 'medkit' ? 'IFAK medkit' : 'Armor plate';
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
  m870: '<rect x="6" y="40" width="150" height="7" rx="2"/><rect x="5" y="36" width="4" height="4" rx="2"/><rect x="20" y="49" width="136" height="8" rx="3"/><rect x="62" y="44" width="52" height="21" rx="7"/><path d="M150 36h44l6 8v22h-50z"/><path d="M168 66h24l-5 13h-13z" fill="none" stroke="#b9c2cb" stroke-width="3"/><path d="M196 38l54 10v54h-7l-37-24-10-8v-22z"/>',
  shells: '<rect x="6" y="30" width="116" height="26" rx="4" fill="#3a444e"/><rect x="13" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="13" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="26" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="26" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="40" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="40" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="53" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="53" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="67" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="67" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="80" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="80" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="94" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="94" y="38" width="11" height="9" rx="1" fill="#c9a040"/><rect x="107" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="107" y="38" width="11" height="9" rx="1" fill="#c9a040"/>',
  magp: '<path d="M20 8h22l4 44H14z"/><rect x="12" y="50" width="38" height="8" rx="2"/>',
  medkit: '<rect x="14" y="10" width="100" height="46" rx="8"/><rect x="20" y="4" width="88" height="10" rx="4"/><path d="M56 22h16v8h8v10h-8v8H56v-8h-8V30h8z" fill="#b01c1c"/>',
  plate: '<path d="M30 12h68l18 26v62q0 10-10 10H22q-10 0-10-10V38z"/><rect x="40" y="56" width="48" height="26" rx="3" fill="#3a444e"/>'
};
// a shell carrier drawn with as many shells as it still holds
function shellIcon(n) { let o = '<rect x="6" y="30" width="116" height="26" rx="4" fill="#3a444e"/>'; for (let i = 0; i < 8; i++) { const x = 13 + i * 13.5; o += i < n ? '<rect x="' + x + '" y="10" width="11" height="30" rx="2" fill="#a83a32"/><rect x="' + x + '" y="38" width="11" height="9" rx="1" fill="#c9a040"/>' : '<rect x="' + (x + 3) + '" y="36" width="5" height="6" rx="1" fill="#252c33"/>'; } return o; }
function itemIcon(it) { return it.kind === 'gun' ? ICO[WEAPONS[it.w].id] : it.kind === 'mag' ? (isShotgun(it.w) ? shellIcon(it.n) : isPistol(it.w) ? ICO.magp : ICO.magr) : ICO[it.kind]; }
const itemDesc = it => it.kind === 'gun' ? (attSummary2(it.att) || 'No attachments') + '. Drag onto a weapon slot to equip.' : it.kind === 'mag' && isShotgun(it.w) ? it.n + ' of 8 shells of 00 buckshot. Shells are fed from here one at a time.' : it.kind === 'mag' ? magEstimate(it.n, WEAPONS[it.w].cap) + '. Click to load it on the next reload.' : it.kind === 'medkit' ? 'Stops bleeding, splints fractures, dulls pain.' : 'Level IV ceramic plate. Drag onto the plate carrier to swap it in.';
// ---- item pictures: each item's own 3D model, rendered from the side into a small picture (cached), and spun live as a 3D
// model in place of the picture while the mouse is over it
// Both are drawn by the game's own renderer into an offscreen target and copied into a plain 2D canvas (two extra WebGL
// contexts just for item pictures cost memory and start-up time). Drawn at twice the size and scaled down: smooth edges.
const ICON_RT = { rt: null, buf: null, c: document.createElement('canvas') };
const _icc = new THREE.Color();
function iconDraw(W, H, out) {
  const w = W * 2, h = H * 2;
  if (!ICON_RT.rt || ICON_RT.rt.width !== w || ICON_RT.rt.height !== h) {
    if (ICON_RT.rt) ICON_RT.rt.dispose();
    ICON_RT.rt = new THREE.WebGLRenderTarget(w, h); ICON_RT.rt.texture.colorSpace = THREE.SRGBColorSpace; ICON_RT.buf = new Uint8Array(w * h * 4);
  }
  const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(_icc).getHex(), ca = renderer.getClearAlpha();
  renderer.setRenderTarget(ICON_RT.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(ICON_S, ICON_C);
  renderer.readRenderTargetPixels(ICON_RT.rt, 0, 0, w, h, ICON_RT.buf);
  renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  const t = ICON_RT.c; t.width = w; t.height = h; const tx = t.getContext('2d'), im = tx.createImageData(w, h), b = ICON_RT.buf;
  for (let y = 0; y < h; y++) im.data.set(b.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);   // GL rows run bottom up
  tx.putImageData(im, 0, 0);
  const k = Math.min(2, devicePixelRatio || 1); out.width = Math.round(W * k); out.height = Math.round(H * k);
  const ox = out.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.clearRect(0, 0, out.width, out.height); ox.drawImage(t, 0, 0, out.width, out.height);
}
const SPIN_C = document.createElement('canvas');
SPIN_C.style.cssText = 'position:fixed;pointer-events:none;z-index:40;display:none';
document.body.appendChild(SPIN_C);
const ICON_OUT = document.createElement('canvas');
const ICON_S = new THREE.Scene();
ICON_S.add(new THREE.HemisphereLight(0xe8eef5, 0x2a2f36, 1.25));
{ const k = new THREE.DirectionalLight(0xffffff, 1.6); k.position.set(2, 3, 2.5); ICON_S.add(k); const r = new THREE.DirectionalLight(0x9fb4c8, 0.7); r.position.set(-2, 1, -3); ICON_S.add(r); }
const ICON_C = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
const iconMeshes = new Map(), iconPics = new Map();
const iconKey = it => it.kind + ':' + (it.w === undefined ? '' : it.w) + (it.kind === 'mag' && isShotgun(it.w) ? ':' + it.n : '');
function iconMesh(it) {
  const k = iconKey(it); let g = iconMeshes.get(k);
  if (!g) {
    g = new THREE.Group(); const m = itemMesh(it); g.add(m);
    // stand the model so its long axis runs left-right in the picture and it sits centred on its own bounds
    const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new V3());
    if (sz.z >= sz.x) m.rotation.y = -Math.PI / 2;                    // guns and mags are built along -z: muzzle to the right
    m.updateMatrixWorld(true); const c = new THREE.Box3().setFromObject(m).getCenter(new V3()); m.position.sub(c);
    g.userData.r = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere()).radius;
    iconMeshes.set(k, g);
  }
  return g;
}
// frame the model in an orthographic side view (tight to its outline), or (spin) a frame that fits it at any turn
function frameIcon(g, W, H, spin) {
  g.updateMatrixWorld(true);
  let hw, hh;
  if (spin) { const r = g.userData.r * 1.04; hw = Math.max(r, r * W / H); hh = hw * H / W; if (hh < r * 0.62) { hh = r * 0.62; hw = hh * W / H; } }
  else { const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new V3()); hw = sz.x / 2 * 1.08; hh = sz.y / 2 * 1.08; if (hw / hh > W / H) hh = hw * H / W; else hw = hh * W / H; }
  ICON_C.left = -hw; ICON_C.right = hw; ICON_C.top = hh; ICON_C.bottom = -hh; ICON_C.position.set(0, 0, 5); ICON_C.lookAt(0, 0, 0); ICON_C.updateProjectionMatrix();
}
function iconPic(it, W, H) {
  W = Math.max(8, Math.round(W)); H = Math.max(8, Math.round(H));
  const k = iconKey(it) + '@' + W + 'x' + H; let u = iconPics.get(k);
  if (!u) {
    const g = iconMesh(it); g.rotation.set(0, 0, 0); ICON_S.add(g); frameIcon(g, W, H, false);
    iconDraw(W, H, ICON_OUT); u = ICON_OUT.toDataURL('image/png'); ICON_S.remove(g);
    iconPics.set(k, u);
  }
  return u;
}
// picture box for an item of base size bw x bh cells (cs px per cell), optionally turned 90 degrees
const iconItems = new Map(); let iconSeq = 0;
function iconHtml(it, r, cs) {
  const [bw, bh] = itemSize(it), W = bw * cs, H = bh * cs, id = 'ic' + (++iconSeq % 100000); iconItems.set(id, it);
  if (iconItems.size > 400) iconItems.delete(iconItems.keys().next().value);
  const img = '<img class="icimg" data-ic="' + id + '" src="' + iconPic(it, W, H) + '" width="' + W + '" height="' + H + '" draggable="false">';
  return r ? '<div style="position:absolute;left:' + H + 'px;top:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0;transform:rotate(90deg)">' + img + '</div>' : img;
}
// hover: the picture is replaced by the model turning on the spot
let spinIt = null, spinEl = null, spinYaw = 0;
function spinUpdate(dt) {
  const c = SPIN_C;
  if (!S.inv || drag || !spinEl || !spinEl.isConnected) { c.style.display = 'none'; spinIt = null; spinEl = null; return; }
  const rc = spinEl.getBoundingClientRect(), box = spinEl.closest('.pit, .mini') || spinEl, rb = box.getBoundingClientRect();
  const W = Math.round(rb.width), H = Math.round(rb.height); if (W < 4 || H < 4) return;
  c.style.display = 'block'; c.style.left = rb.left + 'px'; c.style.top = rb.top + 'px'; c.style.width = W + 'px'; c.style.height = H + 'px';
  spinYaw += dt * 1.8;
  const g = iconMesh(spinIt); ICON_S.add(g); g.rotation.set(0.18 * Math.sin(spinYaw * 0.7), spinYaw, 0); frameIcon(g, W, H, true);
  iconDraw(W, H, SPIN_C); ICON_S.remove(g); g.rotation.set(0, 0, 0);
}
document.addEventListener('mouseover', e => {
  const im = e.target.closest && (e.target.closest('.pit, .mini') || null);
  const pic = im ? im.querySelector('.icimg') : null;
  if (pic && iconItems.has(pic.dataset.ic)) { if (spinEl !== pic) { spinEl = pic; spinIt = iconItems.get(pic.dataset.ic); spinYaw = 0; } pic.style.visibility = 'hidden'; }
  else if (spinEl) { spinEl.style.visibility = ''; spinEl = null; spinIt = null; SPIN_C.style.display = 'none'; }
});
const gunSlotOf = w => isPistol(w) ? 1 : 0;
function equipGun(g, slot) {
  P.activeLo[slot] = g.w; P.guns[g.w] = { mag: g.mag, chamber: g.chamber, pouch: looseFor(g.w) };
  if (g.att) { ATTS[WEAPONS[g.w].id] = Object.assign({}, ATT_DEFAULT[WEAPONS[g.w].id], g.att); applyAttachments(g.w); }
  // a gun picked up into the empty slot you are holding goes straight to your hands
  if (P.slot === 4 && P.emptySel === slot) { P.slot = slot; P.emptySel = -1; P.weapon = g.w; P.switchT = 0.45; }
}
function unequipGun(slot) {
  const w = P.activeLo[slot], G = P.guns[w]; if (w == null || !G) return null;
  for (const n of G.pouch) P.loose.push({ w, n });
  delete P.guns[w]; P.activeLo[slot] = null; P.reloading = false; P.inspecting = false; P.adsOn = false;
  // dropping what you hold leaves that slot selected, now empty: your hands stay empty until you pick another
  if (P.slot === slot) { P.slot = 4; P.emptySel = slot; }
  return { kind: 'gun', w, mag: G.mag, chamber: G.chamber, att: Object.assign({}, attOf(w)) };
}
function attSummary2(A) { if (!A) return ''; const o = []; if (A.optic && A.optic !== 'irons') o.push(ATT.optic[A.optic]); if (A.muzzle === 'supp') o.push('Suppressor'); if (A.under && A.under !== 'none') o.push(ATT.under[A.under]); if (A.side && A.side !== 'none') o.push(ATT.side[A.side]); return o.join(', '); }
// ---------------------------------------------------------------- toolbar
const TOOL_NAME = { medkit: 'IFAK medkit', plate: 'Armor plate' };
// number keys and the wheel pick a slot (0-3) whether or not anything is in it
// the key of what is already in hand puts it away (empty hands); pressed again it comes back out
// keys 1-2 the guns, 3-4 the two equipment slots, 5 the defuser (for whoever carries it). Each piece of equipment is held
// in the hand-slot its kind uses (2 a gadget, 3 a throwable, 5 a breaching tool); what is left of it is kept in P.eq.
const eqCat = k => !GADGETS[k] ? -1 : GADGETS[k].slot === 3 ? 3 : GADGETS[k].slot === 'b' ? 5 : 2;
function eqHas(e) { if (!e) return false; if (e.k === 'sledge') return true; if (e.k === 'c4') return P.c4N > 0 || c4Mine().length > 0; return e.n > 0 || (eqCat(e.k) === 3 && P.nade && P.nade.ph !== 'idle' && P.tool3 === e.k); }
function eqSync() { const e = P.eq && P.eqSel >= 0 ? P.eq[P.eqSel] : null; if (!e) return; const c = eqCat(e.k); if (e.k === 'c4') e.n = P.c4N; else if (c === 2 && P.tool2 === e.k) e.n = P.gN; else if (c === 3 && P.tool3 === e.k) e.n = P.fragN; }
function eqLoad(i) { const e = P.eq[i], c = eqCat(e.k); P.eqSel = i; if (c === 2) { P.tool2 = e.k; P.gN = e.n; } else if (c === 3) { P.tool3 = e.k; P.fragN = e.n; } else P.toolB = e.k; }
function backToGun() { if (P.activeLo[0] != null) switchWeapon(0); else if (P.activeLo[1] != null) switchWeapon(1); else selectEmpty(0); }
function pressSlot(n) {
  if (n === 4) { if (S.mode === 'online' && SG.carrier === S.myId) { const was = P.defOut; selectEmpty(0); P.defOut = !was; } return; }
  P.defOut = false; eqSync();
  if (n < 2) { if (P.slot === n) return selectEmpty(n); return switchWeapon(n); }
  const i = n - 2, e = P.eq ? P.eq[i] : null, held = P.eqSel === i && e && P.slot === eqCat(e.k);
  // the same key again puts it away: back to the gun
  if (held || (P.slot === 4 && P.emptySel === n)) { if (P.nade && P.nade.ph !== 'idle' && P.nade.ph !== 'throw') nadeAbandon(); gadgetGhostOff(); return backToGun(); }
  if (!eqHas(e)) return selectEmpty(n);
  if (P.nade && P.nade.ph !== 'idle' && P.slot === 3) nadeAbandon();
  eqLoad(i); const c = eqCat(e.k);
  if (P.slot === c) { P.switchT = 0.35; if (c === 3) nadeReset(); blip(320, 0.05, 0.05); } else switchWeapon(c);
}
const curSlot = () => P.slot === 4 ? Math.max(0, P.emptySel) : P.slot < 2 ? P.slot : P.eqSel >= 0 ? 2 + P.eqSel : 0;
// hotbar 3 is C4 (and its firing device while charges are out), hotbar 4 the M67
function breachHas() { return !!P.toolB && (P.toolB === 'sledge' || (P.toolB === 'c4' ? P.c4N > 0 || c4Mine().length : P.bcN > 0)); }
function toolSlotIndex(i) { return eqHas(P.eq ? P.eq[i] : null) ? eqCat(P.eq[i].k) : -1; }
function toolCount(t) { return t === 'medkit' ? P.medUses : t === 'plate' ? P.platesInv : 0; }
let tbKey = '';
function updateToolbar() {
  const tb = $('toolbar');
  if (!S.mode || !P.alive || P.downed) { tb.style.display = 'none'; tbKey = ''; return; }
  tb.style.display = 'flex';
  const lo = P.activeLo, es = n => P.slot === 4 && P.emptySel === n, gr = i => lo[i] == null ? [i + 1, 'Empty', '', es(i)] : [i + 1, WEAPONS[lo[i]].name, attSummary(lo[i]), P.slot === i];
  eqSync();
  const rows = [gr(0), gr(1)];
  for (let i = 0; i < 2; i++) {
    const e = P.eq ? P.eq[i] : null, has = eqHas(e), on = has && P.eqSel === i && P.slot === eqCat(e.k);
    const sub = !e ? '' : e.k === 'sledge' ? 'LMB swing' : e.k === 'c4' ? 'x' + P.c4N + (c4Mine().length ? ', ' + c4Mine().length + ' set' : '') : 'x' + e.n;
    rows.push([i + 3, has ? GADGETS[e.k].name : 'Empty', has ? sub : '', has ? on : es(i + 2)]);
  }
  // the defuser, for whoever carries it (5)
  if (S.mode === 'online' && SG.carrier === S.myId) rows.push([5, 'Defuser', 'plant on a bomb (hold F)', !!P.defOut]);
  const key = JSON.stringify(rows);
  if (key === tbKey) return; tbKey = key;
  tb.innerHTML = rows.map(r => '<div class="tb' + (r[3] ? ' on' : '') + (r[1] === 'Empty' ? ' empty' : '') + '"><b>' + r[0] + '</b><div><span>' + (r[1] === 'Empty' && r[3] ? 'Fists' : r[1]) + '</span><small>' + r[2] + '</small></div></div>').join('');
}
function attSummary(wi) {
  const A = attOf(wi), out = [];
  if (A.optic && A.optic !== 'irons') out.push({ holo: 'EOTech', reddot: 'MRO' }[A.optic]);
  if (A.muzzle === 'supp') out.push('Supp');
  if (A.under && A.under !== 'none') out.push({ vert: 'VFG', angled: 'AFG' }[A.under]);
  if (A.side && A.side !== 'none') out.push({ laser: 'Laser', light: 'Light' }[A.side]);
  return out.join(' / ');
}
S.inv = false;
// attachments picker (also reachable from the menus)
let attWi = 0;
function openAttMenu(wi) {
  attWi = wi; const id = WEAPONS[wi].id, A = ATTS[id];
  let h = '<div class="ah"><b>' + WEAPONS[wi].name + '</b> attachments<button id="attx">Close</button></div>';
  if (!ATT_SLOTS[id].length) h += '<div class="ls">No attachments for this weapon.</div>';
  for (const slot of ATT_SLOTS[id]) {
    h += '<div class="arow"><label>' + ATT_SLOT_NAME[slot] + '</label><div class="aopts">';
    for (const k in ATT[slot]) h += '<button class="aopt' + (A[slot] === k ? ' on' : '') + '" data-s="' + slot + '" data-k="' + k + '">' + ATT[slot][k] + '<small>' + ATT_DESC[slot][k] + '</small></button>';
    h += '</div></div>';
  }
  $('attm').innerHTML = h; $('attm').style.display = 'block';
  $('attx').onclick = () => { $('attm').style.display = 'none'; };
  $('attm').querySelectorAll('.aopt').forEach(b => b.onclick = () => { ATTS[id][b.dataset.s] = b.dataset.k; saveAtt(); applyAttachments(wi); blip(1000, 0.03, 0.04); openAttMenu(wi); });
}
const ATT_DESC = {
  optic: { irons: 'Flip-up BUIS, widest view', holo: '1x, 68 MOA ring and 1 MOA dot', reddot: '1x, 2 MOA dot, wide objective' },
  muzzle: { std: 'Flash hider / bare muzzle', supp: 'Quieter, no flash, -10% recoil' },
  under: { none: 'Bare handguard', vert: 'Vertical grip, -18% recoil' },
  side: { none: 'Nothing mounted', laser: 'Visible laser (T toggles)', light: 'Weapon light (T toggles)' }
};

// ---- module exports: build.mjs strips this block ----
export { breachHas, clearItems, curSlot, eqCat, eqLoad, eqSync, hlMesh, items, openAttMenu, pressSlot, removeItem, spawnItem, toolSlotIndex, updateToolbar };
// ---- end module exports ----
