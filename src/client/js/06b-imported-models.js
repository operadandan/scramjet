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
    g.computeBoundingSphere(); parts[p.name] = { geo: g, mat: p.mat, min: p.min, max: p.max };
  }
  return parts;
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
    .then(([parts, ...mats]) => { IMPORTED.g17 = { parts, mats }; }).catch(e => console.warn('imported G17 not loaded, using the built-in model', e))
]);
