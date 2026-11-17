// Nico's neighbors (track: keys): the hand-placed Keys lots of keysStreet.data.js. Registers each lot with the house
// generator (game.lots, source 'street', with its explicit style / colors / yard choices), places the yard extras (boats on
// trailers, chairs, kayaks, crab traps, buoys, grills, picnic tables, board fences from the user's model, rock edging), the
// docks of the waterfront lots (the user's dock models standing on piles to the sea bed, boats moored on lines), and asks the
// cars helper for each lot's parked car (game.vehicles.spawnParked, when it exists).
//   buildKeysLots(game, api) -> { lots, docks }   api: { THREE, spot, place, placeBreak, boxCol, cylCol, groundY, isWater, houseLots, K }
import { KEYS_LOTS, KEYS_SHORE_LOTS, KEYS_DOCKS } from './keysStreet.data.js';
import { loadKeysModels } from '../setpieces/nicoHouse/models.js';

export function buildKeysLots(game, api) {
  const { THREE, spot, place, placeBreak, boxCol, cylCol, groundY, isWater, houseLots, K } = api;
  const H = spot.heading || 0, cH = Math.cos(H), sH = Math.sin(H);
  const toW = (lx, lz) => [spot.x + lx * cH + lz * sH, spot.z - lx * sH + lz * cH];
  const out = { lots: [], docks: 0, extras: 0 };
  const lib = loadKeysModels(THREE, ['fence_rustic', 'pier_kit', 'mossy_pier', 'clean_pier', 'boathouse', 'rowboat', 'skiff']);
  const libJobs = [];   // run once the models are in
  for (const L of [...KEYS_LOTS, ...KEYS_SHORE_LOTS]) {
    const [x, z] = toW(L.x, L.z), ry = L.face + H, y = groundY(x, z), seed = (Math.abs(Math.round(L.x * 31 + L.z * 17)) % 99991) + 7;
    const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry), at = (u, v) => [x + rx * u + fx * v, z + rz * u + fz * v];
    const drvSide = L.car ? Math.sign(L.car.u || 1) : 1;
    if (houseLots?.enabled) houseLots.add({ id: 'keys:' + L.id, x, z, y, heading: ry, w: L.w + 2 * L.side + 2, d: L.d + L.back + 2, front: L.d / 2 + 2, roadGap: Math.max(0, L.gap - 2), source: 'street', seed, style: L.style,
      house: { w: L.w, d: L.d, stilt: L.stilt, base: L.base, roadV: L.d / 2 + L.gap, drvU: drvSide * (L.w / 2 + 2.2), front: Math.min(3.2, L.gap - 1), style: L.style, yard: { gap: L.gap, back: L.back, side: L.side }, over: L.over } });
    out.lots.push(L.id);
    const r = K.rng(seed);
    for (const e of L.extras || []) {
      const [ex, ez] = at(e.u, e.v), ey = groundY(ex, ez), eh = ry + (e.h || 0); if (isWater(ex, ez)) continue; out.extras++;
      if (e.k === 'boatTrailer') { const B = K.boatOnTrailer(K.rng(seed + (e.seed || 1))); place(B.geo, ex, ey, ez, eh); boxCol(ex, ey + 1, ez, B.W / 2, 1, B.L / 2, eh); }
      else if (e.k === 'chairs') { for (const [du, dv, a] of [[-0.6, 0, 0.3], [0.6, 0.1, -0.2]]) { const [cx, cz] = at(e.u + du, e.v + dv); placeBreak(chair(K, r), cx, groundY(cx, cz), cz, eh + a, [0.3, 0.45, 0.3], 'fence'); } }
      else if (e.k === 'kayaks') { for (let i = 0; i < 2; i++) { const [cx, cz] = at(e.u + i * 0.75, e.v); place(K.kayak([0xe85a2a, 0x2a8ab8, 0xe8c82a, 0x3aa86a][(seed + i) % 4]), cx, groundY(cx, cz), cz, eh); } }
      else if (e.k === 'crabTraps') place(K.crabTrapStack(r), ex, ey, ez, eh);
      else if (e.k === 'buoys') place(K.buoyPile(r), ex, ey, ez, eh);
      else if (e.k === 'propane') { place(K.propaneTank(), ex, ey, ez, eh); boxCol(ex, ey + 0.5, ez, 0.4, 0.5, 0.9, eh); }
      else if (e.k === 'picnic') { place(K.picnicTable(), ex, ey, ez, eh); boxCol(ex, ey + 0.4, ez, 0.9, 0.4, 0.8, eh); }
      else if (e.k === 'grill') { place(grill(K), ex, ey, ez, eh); cylCol(ex, ey + 0.45, ez, 0.45, 0.32); }
      else if (e.k === 'rocks') { for (let i = -3; i <= 3; i++) { const [cx, cz] = at(e.u + i * 1.2 + (r() - 0.5) * 0.3, e.v + (r() - 0.5) * 0.4); place(K.coralRock(r), cx, groundY(cx, cz) - 0.05, cz, r() * 6.28, 0.45 + r() * 0.3); } }
      else if (e.k === 'fence') { const A = at(e.u, e.v), B2 = at(e.u2, e.v2), len = Math.hypot(B2[0] - A[0], B2[1] - A[1]); boxCol((A[0] + B2[0]) / 2, groundY(A[0], A[1]) + 0.8, (A[1] + B2[1]) / 2, 0.05, 0.8, len / 2, Math.atan2(B2[0] - A[0], B2[1] - A[1])); libJobs.push(() => fenceRun(A, B2)); }
    }
    if (L.car) { const [cx, cz] = at(L.car.u, L.car.v); (out.cars ||= []).push({ ...L.car, id: L.id, x: cx, y: groundY(cx, cz), z: cz, heading: ry + (L.car.h || 0) }); }
  }
  // ---- library-model work (fences, docks) once the models arrive ----
  const group = new THREE.Group(); group.name = 'keysLots'; game.scene.add(group);
  const I = lib.instancer('keysLots');
  function fenceRun([ax, az], [bx, bz]) {   // the user's rustic board fence (16.9 m model, scaled to 1.6 m high), segment by segment
    const len = Math.hypot(bx - ax, bz - az), s = 0.185, seg = 16.88 * s, n = Math.max(1, Math.round(len / seg)), h = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t; const m = new THREE.Matrix4().compose(new THREE.Vector3(px, groundY(px, pz) - 0.06, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h), new THREE.Vector3(s, s * 0.95, (len / n) / 16.88)); I.add('fence_rustic', 'dock', m, { tint: [1.25, 1.2, 1.12] }); }
  }
  // ---- docks along the bay shore: land end on the sand just before the water, deck 0.55 m over the sea, piles to the bed ----
  const sea = game.city?.seaLevel ?? -0.12, deckY = sea + 0.62, groundAt = (x, z) => { const h = game.city?.groundHeightAt?.(x, z); return Number.isFinite(h) ? h : sea - 5; };
  const pileMat = new THREE.MeshStandardMaterial({ color: 0x564f44, roughness: 0.95, metalness: 0 }); pileMat.name = 'keys:dockPile';
  const pileGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1); pileGeo.translate(0, -0.5, 0);
  const piles = [], boats = [];
  // sizes of the dock models (tools/v2/keys/build_models.sh output: width x length, origin at the deck center) so the shore
  // work and the walkable colliders happen now; visuals, leg piles and their colliders follow when the models are in
  const DIMS = { mossy_pier: [2.89, 9.22], clean_pier: [3.52, 11.6], boathouse: [13.35, 14.45], pier_kit: [2.5, 3.39] };
  const RAP = game.RAPIER, W = game.world, rapCyl = (x, y, z, h, r2) => { try { W.createCollider(RAP.ColliderDesc.cylinder(h / 2, r2).setTranslation(x, y, z)); } catch (e) { /* */ } };
  for (const Dk of KEYS_DOCKS) {
    const [x0, z0] = toW(Dk.x, Dk.z), h = Dk.face + H, dx = Math.sin(h), dz = Math.cos(h), dim = DIMS[Dk.model]; if (!dim) continue;
    let t = 0; for (; t < 40; t += 0.5) if (isWater(x0 + dx * t, z0 + dz * t)) break; if (t >= 40) continue;
    const L = dim[1], land = t - 1.6, cx = x0 + dx * (land + L / 2), cz = z0 + dz * (land + L / 2);
    boxCol(cx, deckY - 0.1, cz, dim[0] / 2 - 0.15, 0.1, L / 2, h);
    { const [lx, lz] = [x0 + dx * (land - 0.3), z0 + dz * (land - 0.3)]; place(K.coralRock(K.rng(Math.abs(Dk.x | 0) + 3)), lx, groundY(lx, lz) - 0.3, lz, h, 1.5);   // a sand-and-rock bank meets the boards
      for (const s2 of [-1, 1]) { const ox = Math.cos(h) * s2 * (dim[0] / 2 + 0.4), oz = -Math.sin(h) * s2 * (dim[0] / 2 + 0.4); place(K.coralRock(K.rng(Math.abs(Dk.z | 0) + s2 + 9)), lx + ox, groundY(lx + ox, lz + oz) - 0.2, lz + oz, h + s2, 0.9); } }
    out.docks++;
    libJobs.push(() => {
      const p = lib.piece(Dk.model, 'dock'); if (!p) return;
      I.add(Dk.model, 'dock', new THREE.Matrix4().compose(new THREE.Vector3(cx, deckY, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h), new THREE.Vector3(1, 1, 1)), { tint: [1, 1, 1] });
      for (const lg of lib.legs(Dk.model, 'dock', { band: 0.6 })) {   // every leg foot carries on down to the sea bed
        const wx = cx + Math.cos(h) * lg.x + Math.sin(h) * lg.z, wz = cz - Math.sin(h) * lg.x + Math.cos(h) * lg.z, top = deckY + lg.y + 0.1, bed = groundAt(wx, wz) - 0.3;
        if (top - bed > 0.2 && isWater(wx, wz)) { piles.push([wx, top, wz, top - bed, Math.max(0.08, lg.r)]); rapCyl(wx, (top + bed) / 2, wz, top - bed, Math.max(0.1, lg.r)); }
      }
      for (const b of Dk.boats || []) { const a = land + L * b.along, off = (dim[0] / 2 + 1.1) * b.side; boats.push({ k: b.k, x: x0 + dx * a + Math.cos(h) * off, z: z0 + dz * a - Math.sin(h) * off, h: h + (b.side > 0 ? 0.05 : Math.PI - 0.05), ph: (Dk.x * 0.37) % 6.28, cleat: [x0 + dx * a + Math.cos(h) * (off * 0.5), z0 + dz * a - Math.sin(h) * (off * 0.5)] }); }
    });
  }
  lib.ready.then(() => {
    for (const j of libJobs) try { j(); } catch (e) { console.warn('[keysLots]', e); }
    for (const m of I.build(group)) m.raycast = () => {};
    if (piles.length) { const im = new THREE.InstancedMesh(pileGeo, pileMat, piles.length); im.name = 'keysLots:piles'; const q = new THREE.Quaternion();
      piles.forEach(([x, y, z, len, r2], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r2, len, r2)))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; im.raycast = () => {}; group.add(im); }
    for (const b of boats) { const p = lib.piece(b.k, 'dock'); if (!p) continue; const g = new THREE.Group(); g.position.set(b.x, sea - (b.k === 'skiff' ? 0.3 : 0.12), b.z); g.rotation.y = b.h;
      for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; g.add(m); } group.add(g); b.g = g;
      const bow = new THREE.Vector3(0, 0.45, p.box.max.z - 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.h).add(g.position), a = new THREE.Vector3(b.cleat[0], deckY + 0.05, b.cleat[1]);
      const pts = []; for (let i = 0; i <= 10; i++) { const t2 = i / 10; pts.push(new THREE.Vector3().lerpVectors(a, bow, t2).add(new THREE.Vector3(0, -0.3 * 4 * t2 * (1 - t2), 0))); }
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 4), new THREE.MeshStandardMaterial({ color: 0xcfc4a2, roughness: 0.9 })); line.raycast = () => {}; group.add(line); }
    if (boats.length) game.updaters?.push(() => { const tt = performance.now() / 1000; for (const b of boats) if (b.g) { b.g.position.y = sea - (b.k === 'skiff' ? 0.3 : 0.12) + Math.sin(tt * 0.9 + b.ph) * 0.035; b.g.rotation.z = Math.sin(tt * 0.7 + b.ph) * 0.025; } });
  });
  // ---- parked cars (cars helper) ----
  const spawnCars = () => { const V = game.vehicles; if (!V?.spawnParked) return false; for (const c of out.cars || []) { try { V.spawnParked({ ...c, pos: new THREE.Vector3(c.x, c.y, c.z), owner: 'keys:' + c.id }); } catch (e) { /* */ } } return true; };
  if (!spawnCars()) { let n = 0; const iv = setInterval(() => { if (spawnCars() || ++n > 120) clearInterval(iv); }, 1000); }
  game.keysLots = out;
  return out;
}

// white resin patio chair (merged K.Parts geometry)
function chair(K, r) {
  const p = new K.Parts(), c = 0xeeeae0, S = K.SURF.plastic;
  p.box(0, 0.42, 0, 0.46, 0.03, 0.44, S, c); p.box(0, 0.7, -0.21, 0.46, 0.5, 0.03, S, c);
  for (const [x, z] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.2], [0.21, 0.2]]) p.box(x, 0.21, z, 0.04, 0.42, 0.04, S, c);
  for (const s of [-1, 1]) p.box(s * 0.24, 0.62, 0, 0.04, 0.03, 0.44, S, c);
  return p.build();
}
// kettle grill on its legs
function grill(K) {
  const p = new K.Parts(), S = K.SURF;
  p.cyl(0, 0.78, 0, 0.3, 0.32, S.rustPaint, 0x1d1d1d); p.cyl(0, 0.97, 0, 0.27, 0.08, S.rustPaint, 0x1d1d1d);
  for (const a of [0, 2.09, 4.19]) p.box(Math.cos(a) * 0.2, 0.33, Math.sin(a) * 0.2, 0.03, 0.66, 0.03, S.galv, 0x8a8a8a);
  return p.build();
}
