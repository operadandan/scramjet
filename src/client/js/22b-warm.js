// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----
import * as THREE from 'three';
import { V3, camera, renderer, scene, scopeRT, sun, sunDir } from './00-setup.js';
import { worldMeshes } from './01-world.js';
import { chunkCopy, destroyChunks, headCrater } from './02b-chunks.js';
import { Humanoid } from './03-humanoid.js';
import { Ragdoll, limbBodies } from './04-ragdoll.js';
import { DECAL_MAT, DECAL_SIZE, FRAG_SCUFF, decals, fx, glowTex, heats, impactFx, placeDecal, splatGeo } from './11-fx.js';
import { bmat, drops } from './12-blood.js';
import { GORE_GEO, dropGore, gore, spawnGore } from './12b-gore.js';
import { PIERCE_MAT, addWound, bloodFx, blowSpatter, feedPool, goreBurst, holeInGroup, pools, seeds, spawnDrop } from './14-wounds.js';
import { addSoak } from './14b-soak.js';
import { DESTR, DESTR_OF, REBAR_GEO, REBAR_MAT, cutSlot, edgeClipMat, wallClipMat, wallGrid } from './15-destruction.js';
import { props } from './16-ballistics.js';
import { PALS, SKINS, dummies } from './17-dummies.js';
import { BOOM_FX, EXPL, boomVisual } from './19b-explosives.js';
// ---- end module links ----
// ---------------------------------------------------------------- warm-up: every effect's shaders built before they are needed
// The first time something is shown (a wound on a shirt, a crater, the cut faces of a blown-open trunk, a gore piece, a
// splat, a blast) the GPU has to compile and link its shader, and the game froze for that long, again for each new kind.
// When a match starts, this rehearses all of it once on two throwaway bodies and their ragdolls, far outside the map and
// never in view, lets the renderer build every shader in the background (compileAsync), then removes everything it made.
// Nothing it does is sent online or heard.
// A shader is thrown away when the last material using it is disposed, and several effects dispose theirs when they end
// (a blast's flash and smoke, a bullet hole's glow, a pool, a ragdoll): the next one would build it all over again. So the
// rehearsal's own copies are never disposed: they are kept here, out of the scene, and hold every shader for the session.
let WARMED = false, WARMING = false; const WARM_KEEP = [];
async function warmFx() {
  if (WARMED || WARMING) return; WARMING = true;
  const F = new V3(0, 0, -4000), dir = new V3(0, 0, 1);
  // what exists before, so only what the rehearsal made is taken away afterwards
  const had = { gore: new Set(gore), decals: new Set(decals), pools: new Set(pools), props: new Set(props), limbs: new Set(limbBodies), scene: new Set(scene.children) };
  const made = [], rags = [];
  // build the shaders for what is in the scene now, both ways the scene is drawn: straight to the screen, and into an image
  // (the scope's view, and the whole frame when the pixel look is on), which needs its own versions. Then draw the rehearsal
  // once each way from a camera looking at it (into one pixel of the screen, which the next frame draws over), so each
  // shader has also been used once: the first use is when the GPU is made to finish it and its settings are read.
  const cam = new THREE.PerspectiveCamera(110, 1, 0.1, 120); cam.position.copy(F).add(new V3(0, 6, -14)); cam.lookAt(F); cam.updateMatrixWorld(true);
  const step = async () => {
    const prev = renderer.getRenderTarget(), vp = renderer.getViewport(new THREE.Vector4()), sc = renderer.getScissor(new THREE.Vector4()), st = renderer.getScissorTest();
    try {
      for (const rt of [null, scopeRT]) { renderer.setRenderTarget(rt); renderer.compile(scene, camera); }
      // (the sun's shadow is moved onto the rehearsal for these, so the shadow shaders of everything in it are built too)
      const sp = sun.position.clone(), tp = sun.target.position.clone();
      sun.position.copy(F).addScaledVector(sunDir, 100); sun.target.position.copy(F); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
      renderer.setRenderTarget(scopeRT); renderer.render(scene, cam);
      renderer.setRenderTarget(null); renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1); renderer.setScissorTest(true); renderer.render(scene, cam);
      sun.position.copy(sp); sun.target.position.copy(tp); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    } catch (e) { console.warn('warm-up compile', e); }
    renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(st); renderer.setRenderTarget(prev);
    await new Promise(r => requestAnimationFrame(() => r()));
  };
  const at = H => H.root.userData.chunkAt;
  const front = (g, y) => g.localToWorld(new V3(0, y, -0.3));
  const hole = (g, y) => holeInGroup(g, new V3(0, y, -0.25), new V3(0, 0, 1), 0.5, 0.0045, 0.0075, [0.04, 0.5]);
  // a hole through every part of a body (each part's meshes get their own holed shader)
  const holesAll = A => { const seen = new Set(); for (const k in A) { const g = A[k] && A[k][0]; if (!g || !g.isObject3D || seen.has(g)) continue; seen.add(g); hole(g, k === 'head' ? 0.08 : k === 'spine' || k === 'hips' ? 0.1 : -0.08); } };
  const band = (root, a, b) => destroyChunks(root, c => c.y > a && c.y < b, dir, null);
  try {
    // the bounds trees for raycasts against the map and the bodies already in it, built now rather than on the first shot
    const bvh = m => { const g = m.geometry; if (g && !g.boundsTree && !g.userData.noBVH && g.attributes.position && (g.index ? g.index.count : g.attributes.position.count) > 450) try { g.computeBoundsTree({ indirect: true }); } catch (e) { g.userData.noBVH = true; } };
    for (const m of worldMeshes) bvh(m);
    for (const d of dummies) d.hum && d.hum.root.traverse(o => { if (o.isMesh) bvh(o); });
    // the two kinds of body in the game: a player's (shirt and jeans) and a soldier dummy's (vest and helmet)
    const kinds = [Object.assign({ skin: SKINS[0] }, PALS[0]), { shirt: 0xb8662a, vest: 0x5a5a56, vest2: 0x4e4e4a, helmet: 0x4a4a46, skin: SKINS[1] }];
    for (let k = 0; k < kinds.length; k++) {
      // standing bodies, damaged in two different orders (each state a body passes through has its own shader)
      for (let order = 0; order < 3; order++) {
        const H = new Humanoid(kinds[k]); H.root.position.copy(F).add(new V3(k * 6 + order * 3, 0, 0)); scene.add(H.root); H.root.updateMatrixWorld(true); made.push(H.root);
        const A = at(H); if (!A) continue; const head = () => H.headMark.getWorldPosition(new V3());
        await step();
        const soak = () => addSoak(H.root, 'spine', A.spine[0], new V3(0, 0.2, -0.12), 0.12, 10), crater = () => headCrater(H.root, head(), 0.045, dir, H.pal && H.pal.skin, true);
        if (order === 0) { soak(); await step(); holesAll(A); await step(); crater(); await step(); band(H.root, 0.3, 0.36); await step(); }
        else if (order === 1) { crater(); await step(); holesAll(A); await step(); soak(); await step(); }
        else { holesAll(A); await step(); soak(); await step(); crater(); await step(); }
        // and the ragdoll it would leave: clean, then shot, soaked, blown open, cut through
        const r = new Ragdoll(H.capture(), H.pal, new V3(), 1, dir, 3, { nh: false, w: H.wounds, h: H.holes }); rags.push(r);
        chunkCopy(H.root, r.group); r.group.updateMatrixWorld(true);
        // its bounds trees too: every ragdoll of this kind of body shares its merged geometry, and so its trees
        r.group.traverse(o => { if (o.isMesh) bvh(o); }); H.root.traverse(o => { if (o.isMesh) bvh(o); });
        H.root.visible = false; await step();
        const RA = r.group.userData.chunkAt || {};
        if (order === 0) { holesAll(RA); addWound(null, 'spine', r.torso, new V3(0, 0.15, -0.12), new V3(0, 0, -1), 'blast', 0.06); await step(); r.gibHead(dir); await step(); band(r.group, 0.08, 0.38); await step(); }
        else if (order === 1) { addSoak(r.group, 'spine', r.torso, new V3(0, 0.15, -0.12), 0.12, 10); await step(); holesAll(RA); await step(); headCrater(r.group, r.headG.localToWorld(new V3(0, 0, -0.02)), 0.045, dir, H.pal && H.pal.skin, true); await step(); }
        else { holesAll(RA); await step(); addSoak(r.group, 'spine', r.torso, new V3(0, 0.15, -0.12), 0.12, 10); r.tearNeck(dir); await step(); }
      }
    }
    // loose gore of every kind, blood in the air, on the floor and on a wall, and both kinds of blast
    const skin = PALS[0] && PALS[0].skin;
    for (const kind of [...Object.keys(GORE_GEO), 'skull']) spawnGore(F.clone().add(new V3(0, 1, 0)), dir, kind, 2, 1, 0.6, 0.02, skin);
    goreBurst(F.clone().add(new V3(0, 1.6, 0)), dir, skin); bloodFx(F.clone().add(new V3(0, 1.4, 0)), dir, true, 1);
    blowSpatter(F.clone().add(new V3(0, 1.2, 0)), dir, 0.05, true); blowSpatter(F.clone().add(new V3(1, 1.2, 0)), dir, 0.03, false);
    for (let i = 0; i < 6; i++) spawnDrop(F.clone().add(new V3(i * 0.1, 1, 0)), new V3(0, -1, 0), 0.003);
    feedPool(F.x, 0, F.z, 30);
    // a copy of every kind of breakable wall in the map, shot through: its holed shader, the tunnel through it, its shadow
    // with the holes in it, and blood on it cut round the holes
    { const seen = new Set(); let wx = -12;
      for (const src of worldMeshes) {
        const kind = src.userData.kind, D = DESTR_OF[kind] && DESTR[DESTR_OF[kind]]; if (!D || !src.isMesh) continue;
        const base = src.userData.baseMat || src.material, key = kind + ':' + (base.map ? 'm' : '') + (base.vertexColors ? 'v' : '') + base.type; if (seen.has(key)) continue; seen.add(key);
        const w = new THREE.Mesh(src.geometry, base.clone()); w.castShadow = w.receiveShadow = true;
        // (its own settings, the break grid included: those decide which version of the shader it gets; not its damage)
        if (src.userData.grid === undefined) wallGrid(src);   // (worked out on the real wall, as its first hit would)
        for (const k in src.userData) if (!['holeN', 'holeMax', 'baseMat', 'tubes', 'tubeMat', 'dmg', 'box'].includes(k)) w.userData[k] = src.userData[k];
        w.position.copy(F).add(new V3(wx, 1.5, 9)); wx += 4; scene.add(w); made.push(w); w.updateMatrixWorld(true);
        if (!src.geometry.boundingBox) src.geometry.computeBoundingBox(); const bb = src.geometry.boundingBox, c = bb.getCenter(new V3());
        cutSlot(w, 0, new V3(c.x, c.y, bb.min.z - 0.05), new V3(0, 0, 1), bb.max.z - bb.min.z + 0.1, 0.006, 0.009, D.inner, 0, 1, true);
        for (const k of ['spatter', 'gore', 'spray', 'cast', 'splat', 'drip', 'smear', 'tear']) { const q = new THREE.Mesh(splatGeo, wallClipMat(bmat(k), w, -1)); q.position.copy(w.position).add(new V3(0, 0.3, -0.3)); scene.add(q); made.push(q); }
      }
      // blood on a wall that does not break: cut at its edges only
      const pl = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.3), new THREE.MeshStandardMaterial()); pl.position.copy(F).add(new V3(wx, 1, 9)); scene.add(pl); made.push(pl); pl.updateMatrixWorld(true);
      for (const k of ['spatter', 'gore', 'spray', 'cast', 'splat', 'drip', 'smear', 'tear']) { const q = new THREE.Mesh(splatGeo, edgeClipMat(bmat(k), pl)); q.position.copy(pl.position).add(new V3(0, 0, -0.2)); scene.add(q); made.push(q); } }
    // bullet holes and grenade scuffs on every kind of surface, cold and still glowing, with their dust and sparks
    { const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.2), new THREE.MeshStandardMaterial()); wall.position.copy(F).add(new V3(0, 1.5, 3)); scene.add(wall); made.push(wall); wall.updateMatrixWorld(true);
      const mats = [...Object.values(DECAL_MAT), ...Object.values(PIERCE_MAT), FRAG_SCUFF]; let x = -1.2;
      for (const b of mats) { for (const hot of [false, true]) { const m = hot ? b.clone() : b; if (hot) { m.emissive = new THREE.Color(0xffb050); m.emissiveMap = glowTex; m.emissiveIntensity = 4; }
        const d = placeDecal(wall, wall.localToWorld(new V3(x, 0, -0.1)), new V3(0, 0, -1), 0.08, m); if (d) WARM_KEEP.push(d); x += 0.12; if (x > 1.2) x = -1.2; } }
      for (const surf of Object.keys(DECAL_SIZE)) impactFx(wall.localToWorld(new V3(0, 0.5, -0.1)), new V3(0, 0, -1), surf); }
    { const rb = new THREE.Mesh(REBAR_GEO, REBAR_MAT); rb.position.copy(F).add(new V3(0, 0.5, 6)); scene.add(rb); made.push(rb); }   // (the bars in broken concrete)
    boomVisual(F.clone().add(new V3(20, 0.1, 0)), new V3(0, 1, 0), EXPL.frag.W, 'frag');
    boomVisual(F.clone().add(new V3(-20, 0.1, 0)), new V3(0, 1, 0), EXPL.c4.W, 'c4');
    await step(); await step();
  } catch (e) { console.warn('warm-up', e); }
  // take away exactly what the rehearsal made (anything the player made meanwhile stays)
  try {
    // the rehearsal's flashes, smoke, dust, glows and pools would dispose their materials when they end: take them out of
    // their lists first, so they are only taken out of the scene and keep their shaders
    for (let i = BOOM_FX.length - 1; i >= 0; i--) if (BOOM_FX[i].o.position.z < -3000) { const f = BOOM_FX.splice(i, 1)[0]; scene.remove(f.o); WARM_KEEP.push(f.o); }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].o.position.z < -3000) { const f = fx.splice(i, 1)[0]; scene.remove(f.o); WARM_KEEP.push(f.o); }
    for (let i = heats.length - 1; i >= 0; i--) if (heats[i].d.position.z < -3000 || (heats[i].d.parent && heats[i].d.parent.position.z < -3000)) { const h = heats.splice(i, 1)[0]; WARM_KEEP.push(h.m); }
    // the ragdolls are taken out without disposing them (their materials keep their shaders)
    for (const r of rags) { if (r.fibers) for (const fb of r.fibers) fb.m.removeFromParent(); scene.remove(r.group); if (r.pool) scene.remove(r.pool); WARM_KEEP.push(r.group); }
    for (const o of made) scene.remove(o);
    const far = o => o && o.position && o.position.z < -3000;   // (all of the rehearsal happened out there)
    for (let i = gore.length - 1; i >= 0; i--) if (!had.gore.has(gore[i]) && far(gore[i].m)) dropGore(gore.splice(i, 1)[0]);
    for (let i = decals.length - 1; i >= 0; i--) if (!had.decals.has(decals[i]) && decals[i].position.z < -3000) { const d = decals.splice(i, 1)[0]; scene.remove(d); if (d.geometry !== splatGeo) d.geometry.dispose(); }
    for (let i = pools.length - 1; i >= 0; i--) if (!had.pools.has(pools[i]) && pools[i].lobes.length && far(pools[i].lobes[0].m)) { const p = pools.splice(i, 1)[0]; for (const l of p.lobes) { scene.remove(l.m); WARM_KEEP.push(l.m); } }
    for (let i = props.length - 1; i >= 0; i--) if (!had.props.has(props[i]) && props[i].m.position.z < -3000) scene.remove(props.splice(i, 1)[0].m);
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].p && drops[i].p.z < -3000) drops.splice(i, 1);
    for (let i = seeds.length - 1; i >= 0; i--) if (seeds[i].z < -3000) seeds.splice(i, 1);
    for (let i = limbBodies.length - 1; i >= 0; i--) if (!had.limbs.has(limbBodies[i]) && far(limbBodies[i].g)) limbBodies.splice(i, 1)[0].dispose();
    // loose pieces put straight in the scene (trunk fragments, helmets, fibres), still far out there
    for (const o of [...scene.children]) if (!had.scene.has(o) && o.position.z < -3000 && !o.isLight) { scene.remove(o); WARM_KEEP.push(o); }
  } catch (e) { console.warn('warm-up cleanup', e); }
  WARMING = false; WARMED = true;
}

// ---- module exports: build.mjs strips this block ----
export { WARMING, warmFx };
// ---- end module exports ----
