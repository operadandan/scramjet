// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { renderer } from './00-setup.js';
// ---- end module links ----
// ---------------------------------------------------------------- models made in Roblox Studio
// Studio's Export Selection gives an OBJ, an MTL and texture maps. assets/models/<name>/conv.py turns them into public/models/<name>/:
// one binary holding every named part already in the game's frame (metres, barrel toward -Z, ejection port on +X) and colour,
// normal and ORM maps. They load before the guns are built; if anything fails, the hand-built model is used instead.
const IMPORTED = {};
async function loadModelBin(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const b = await r.arrayBuffer(), n = new DataView(b).getUint32(0, true), H = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 4, n))), o = 4 + n, parts = {};
  for (const p of H.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b, o + p.p, p.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b, o + p.nr, p.n * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b, o + p.uv, p.n * 2), 2));
    g.setIndex(new THREE.BufferAttribute(p.i32 ? new Uint32Array(b, o + p.ix, p.ni) : new Uint16Array(b, o + p.ix, p.ni), 1));
    g.computeBoundingSphere(); parts[p.name] = { geo: g, mat: p.mat, col: p.col || null, min: p.min, max: p.max };
  }
  parts._sets = H.sets || null; return parts;
}
async function loadTexSet(base) {
  const L = new THREE.TextureLoader(), an = renderer.capabilities.getMaxAnisotropy();
  const [c, n, orm] = await Promise.all(['_col.jpg', '_nrm.png', '_orm.png'].map(s => L.loadAsync(base + s)));
  c.colorSpace = THREE.SRGBColorSpace; for (const t of [c, n, orm]) t.anisotropy = Math.min(8, an);
  // ORM: green is roughness, blue is metalness (Studio's spec map had metalness in red, roughness in green)
  return new THREE.MeshStandardMaterial({ map: c, normalMap: n, roughnessMap: orm, metalnessMap: orm });
}
// each model loads on its own, so one missing file only costs that gun its new model
await Promise.all([
  Promise.all([loadModelBin('/models/m4/m4.bin'), loadTexSet('/models/m4/m4'), loadTexSet('/models/m4/cart')])
    .then(([parts, body, cart]) => { IMPORTED.m4 = { parts, mats: [body, cart] }; }).catch(e => console.warn('imported M4 not loaded, using the built-in model', e)),
  // G17: frame, slide, magazine and barrel each have their own maps (brightened to the M4's tone); sights and the top round are painted in code
  Promise.all([loadModelBin('/models/g17/g17.bin'), ...['frame', 'slide', 'mag', 'barrel'].map(t => loadTexSet('/models/g17/' + t))])
    .then(([parts, ...mats]) => { IMPORTED.g17 = { parts, mats }; }).catch(e => console.warn('imported G17 not loaded, using the built-in model', e)),
  // the second batch from Studio (assets/models/build_new.py): the M82A1, the M870 and the attachments. Each bin names its
  // texture sets; a part carries a tint (col) that brings it to the M4's finish, or is glass (-1) or brass (-2)
  ...['m82', 'm870', 'mro', 'eotech', 'vfg'].map(k => loadModelBin('/models/' + k + '/' + k + '.bin')
    .then(parts => Promise.all(parts._sets.map(t => loadTexSet('/models/' + k + '/' + t))).then(mats => { IMPORTED[k] = { parts, mats, tinted: new Map() }; }))
    .catch(e => console.warn('imported ' + k + ' not loaded, using the built-in model', e)))
]);
// the material for one part of a tinted model: its texture set with the part's tint (one per set and tint), glass or brass
const IMP_GLASS = new THREE.MeshPhysicalMaterial({ color: 0x1a2a30, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
function impMat(I, p, brass) {
  if (p.mat === -1) return IMP_GLASS; if (p.mat === -2) return brass;
  const k = p.mat + ':' + (p.col ? p.col.join(',') : ''); let m = I.tinted.get(k);
  if (!m) { m = I.mats[p.mat].clone(); if (p.col) m.color.setRGB(p.col[0], p.col[1], p.col[2], THREE.SRGBColorSpace); I.tinted.set(k, m); }
  return m;
}

// ---- module exports: build.mjs strips this block ----
export { IMPORTED, impMat };
// ---- end module exports ----
