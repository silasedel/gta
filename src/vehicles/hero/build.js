// Assembles a complete hero car from its parts.  buildHeroCar(THREE, key, opts) -> see index.js for the contract.
import * as THREE from 'three';
import { getMats } from './kit/mats.js';
import { buildBody, bodyHull } from './kit/body.js';
import { PACK } from './packages.js';
import { DEFS } from './cars/index.js';
import { buildWheel, wellLiner } from './wheels.js';
import { buildDetails, buildCabin, makeLights } from './details.js';

/** Materials for the body-skin material tags of one car instance. */
function skinMats(M, pk, opts) {
  const paintHex = opts.color ?? pk.paint.hex;
  const paint = M.paint(paintHex, { type: pk.paint.type, fresh: true });
  const two = pk.paint.two ? M.paint(pk.paint.two.hex, { type: pk.paint.two.type, fresh: true }) : M.paint(0x0a0a0c, { type: 'metallic' });
  return {
    paint, paint2: two, carbon: M.carbon(), glass: M.glass({ opacity: 0.5 }), glassW: M.glass({ opacity: 0.3, tint: 0x0b1012 }), frit: M.plastic(0x040405, 'piano'),
    lens: M.lens(), lensRed: M.lens({ tint: 0xb00a10, opacity: 0.5 }), gap: M.shadow(), shadow: M.shadow(), hexmesh: M.hexMesh(0x0c0c0e, 1.5), housing: M.metal('steel'),
    duct: M.plastic(0x08090a, 'satin'), liner: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.DoubleSide }), archLip: M.plastic(0x0a0a0b), trim: M.plastic(0x0b0b0c, 'satin'), chrome: M.metal('chrome'), alu: M.metal('alu'),
  };
}

export function buildHeroCar(_THREE, key, opts = {}) {
  const pk = PACK[key], def = DEFS[key];
  if (!pk || !def) throw new Error('unknown hero car ' + key);
  const M = getMats();
  const mats = skinMats(M, pk, opts);
  const group = new THREE.Group(); group.name = key;
  const lod = new THREE.LOD(); lod.name = 'bodyLOD';
  const parts = {}, paintMeshes = [], glass = [];
  const levels = opts.lods || [0, 1, 2], dist = [0, 28, 85];
  let tris = [];
  for (const L of levels) {
    const body = buildBody(def, L);
    const g = new THREE.Group(); g.name = 'lod' + L;
    for (const pn in body.parts) {
      const pg = new THREE.Group(); pg.name = pn;
      for (const mn in body.parts[pn]) {
        const mat = mn === 'glass' && pn === 'body' ? mats.glass : mats[mn] || mats.trim;
        const mesh = new THREE.Mesh(body.parts[pn][mn], mat); mesh.name = pn + ':' + mn;
        mesh.castShadow = L < 2 && mn !== 'glass' && mn !== 'lens' && mn !== 'gap'; mesh.receiveShadow = L === 0 && (mn === 'paint' || mn === 'paint2' || mn === 'carbon');
        if (mn === 'glass' || mn === 'lens' || mn === 'lensRed') mesh.renderOrder = 2;
        if (mn === 'paint' || mn === 'paint2') paintMeshes.push(mesh);
        if (mn === 'glass') glass.push(mesh);
        pg.add(mesh);
      }
      g.add(pg);
      if (L === levels[0]) parts[pn] = pg;
    }
    tris.push(body.tris);
    lod.addLevel(g, dist[L]);
  }
  group.add(lod);
  // exterior details + cabin (near levels only; a second LOD drops them far away)
  const lights = makeLights(M);
  const near = new THREE.LOD(); near.name = 'detailLOD';
  const dg = new THREE.Group();
  const b0 = buildBody(def, 0);
  let cabin = null, plate = null;
  if (def.p.det) { const det = buildDetails(def, pk, b0.hm, M, mats, lights, opts.seed || 1); dg.add(det); plate = det.userData.plate; }
  try { cabin = buildCabin(pk, M); dg.add(cabin.group); } catch (e) { console.error('[hero] cabin failed', e); }
  near.addLevel(dg, 0); near.addLevel(new THREE.Group(), 70);
  group.add(near);
  // wheels + wheel-well liners
  const wheels = [], calipers = [];
  const linerG = [];
  for (const axle of ['front', 'rear']) for (const side of [1, -1]) {
    const w = buildWheel(key, axle, { side }), a = pk.wheels[axle];
    w.node.position.set(a.x * side, a.r, a.z);
    const hold = new THREE.Group(); hold.add(w.caliper); w.node.add(hold); w.calHold = hold;
    group.add(w.node); wheels.push({ node: w.node, side, front: axle === 'front', x: a.x * side, z: a.z, r: a.r, calHold: hold });
    const arch = (def.p.arches || []).find((q) => (q.z > 0) === (axle === 'front'));
    if (arch) { const lg = wellLiner(a.z, a.r, a.r + 0.004, Math.max(arch.xin, a.x - a.tw / 2 - 0.06), a.x + a.tw / 2 - 0.05); if (side < 0) lg.scale(-1, 1, 1); linerG.push(lg); }
  }
  for (const lg of linerG) { const lm = new THREE.Mesh(lg, mats.liner); lm.material = mats.liner; group.add(lm); }
  return { group, parts, lod, wheels, lights, cabin, plate, steeringWheel: cabin ? cabin.steeringWheel : null, paint: [mats.paint, mats.paint2], paintMeshes, glass, hull: bodyHull(def), tris, def, pack: pk, mats };
}
