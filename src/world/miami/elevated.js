// ELEVATED agent: Miami's bridges, causeways, viaducts and ramps as one processed network.
// createElevated({ THREE, RAPIER, world, data, materials }) ->
//   network                      processed chains (one deck ribbon per carriageway) for audits / HUD
//   buildTile(tx, tz, bounds, opts?) -> { group, colliderDescs: [{desc, kind}], lamps: [{x, y, z, ry}] }  (tile-clipped, watertight seams)
//   buildTileSteps(...)          generator version (yields between chunks, returns the same result)
//   heightAt(x, z, y?)           deck top height (exact collider surface) or null; with y: nearest deck at/below y + 0.5
//   footprintAt(x, z)            false, or { y (lowest deck top), type (0 grade, 1 embankment, 2 viaduct) } under any deck
//   isGroundJunctionBlocked(id)  true where a ground junction would sit under / inside a deck (no fill, no crosswalks)
//   ownsEdge(edgeId)             true for the OSM edges this module renders (the city must skip them)
import { buildNetwork, buildNetworkSteps } from './elevated/network.js';
import { makeElevatedConcrete } from '../ground/concreteMaterial.js';
export { buildNetworkSteps };
import { createBuilder } from './elevated/build.js';
import { P } from './elevated/params.js';

export function createElevated({
  THREE,
  RAPIER,
  world = null,
  data,
  materials = null,
  net: prebuiltNet = null,
}) {
  const net = prebuiltNet || buildNetwork(data); // stage 1 boot pacing: the city may build it in slices (buildNetworkSteps)
  const builder = createBuilder(net);
  const M = materials || {};
  const mats = {
    asph:
      M.asphalt ||
      new THREE.MeshStandardMaterial({ color: 0x8e8e8e, roughness: 0.92, vertexColors: true }),
    // highways track: weathered grey cast concrete (world-space CC0 concrete detail), not the city's beige plaster trim
    conc: makeElevatedConcrete(THREE), // ground pass: world-space cast concrete from the user's Concrete 3 scan, formwork joints, grime, barrier scuff line + scuppers (ground/concreteMaterial.js); the old generic atlas detail was too faint to read
    mark:
      M.markings ||
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
  };
  const toMesh = (buf, mat, name, cast) => {
    if (!buf.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p.slice(0, buf.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.no.slice(0, buf.n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv.slice(0, buf.n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c.slice(0, buf.n * 3), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.userData.sharedMaterial = true;
    m.userData.ownedGeometry = true;
    return m;
  };
  function boundsOf(tx, tz, b) {
    const T = data.tileSize || 200;
    return b
      ? { x0: b.minX ?? b.x0, x1: b.maxX ?? b.x1, z0: b.minZ ?? b.z0, z1: b.maxZ ?? b.z1 }
      : { x0: tx * T, x1: (tx + 1) * T, z0: tz * T, z1: (tz + 1) * T };
  }
  function* buildTileSteps(tx, tz, tileBounds, opts = {}) {
    const B = boundsOf(tx, tz, tileBounds),
      visual = opts.visual !== false,
      colliders = opts.colliders !== false;
    const g = builder.gather(B);
    const group = new THREE.Group();
    group.name = `elevated_${tx}_${tz}`;
    const res = {
      group,
      colliderDescs: [],
      lamps: g.lampsT.map((l) => ({ x: l.x, y: l.y, z: l.z, ry: l.ry, elev: true })),
    };
    if (!g.segs.length && !g.piersT.length) return res;
    yield;
    if (visual) {
      // split the segment list into chunks so a single step stays short
      const CH = 10;
      // stage 1 perf: chunks are built separately (short steps) but merged into ONE mesh per material per tile
      // (each chunk used to be its own 3 meshes: ~80 extra draw calls in the Keys with its many small bridges)
      const acc = { asph: [], conc: [], mark: [] };
      for (let k = 0; k < g.segs.length || k === 0; k += CH) {
        const part = builder.buildVisual(
          B,
          g.segs.slice(k, k + CH),
          k === 0 ? g.piersT : [],
          k === 0 ? g.jointsT : [],
        );
        for (const key of ['asph', 'conc', 'mark'])
          if (part[key] && part[key].n) acc[key].push(part[key]);
        yield;
        if (k + CH >= g.segs.length) break;
      }
      for (const key of ['asph', 'conc', 'mark']) {
        const L = acc[key];
        if (!L.length) continue;
        let n = 0;
        for (const b of L) n += b.n;
        const m = {
          n,
          p: new Float32Array(n * 3),
          no: new Float32Array(n * 3),
          uv: new Float32Array(n * 2),
          c: new Float32Array(n * 3),
        };
        let o = 0;
        for (const b of L) {
          m.p.set(b.p.subarray(0, b.n * 3), o * 3);
          m.no.set(b.no.subarray(0, b.n * 3), o * 3);
          m.uv.set(b.uv.subarray(0, b.n * 2), o * 2);
          m.c.set(b.c.subarray(0, b.n * 3), o * 3);
          o += b.n;
        }
        const mesh = toMesh(m, mats[key], key, key === 'conc');
        if (mesh) group.add(mesh);
        if (mesh && key === 'asph' && globalThis.game?.groundMask?.register)
          globalThis.game.groundMask.register(mesh, 'asphalt'); // ground pass: ramps / decks join the ground mask (no crumbled road end where a ribbon meets a deck)
      }
      group.userData.elevated = true;
    }
    if (colliders && RAPIER) {
      if (visual) yield;
      res.colliderDescs = yield* builder.buildCollidersGen(RAPIER, B, g.segs, g.piersT, g.runsT);
    }
    if (false) res.colliderDescs = builder.buildColliders(RAPIER, B, g.segs, g.piersT, g.runsT);
    return res;
  }
  function buildTile(tx, tz, tileBounds, opts) {
    const it = buildTileSteps(tx, tz, tileBounds, opts);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  // low-LOD geometry for the city's mid / far rings: BufferGeometry (position, normal, color) or null; caller owns + disposes it
  function buildTileLod(tx, tz, tileBounds, step = 3) {
    const B = boundsOf(tx, tz, tileBounds),
      buf = builder.buildLod(B, step);
    if (!buf.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.p.slice(0, buf.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(buf.no.slice(0, buf.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(buf.c.slice(0, buf.n * 3), 3));
    g.computeBoundingSphere();
    return g;
  }
  function dispose(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }

  const api = {
    network: net,
    params: P,
    buildTile,
    buildTileSteps,
    buildTileLod,
    dispose,
    heightAt: (x, z, y) => net.heightAt(x, z, y === undefined ? null : y, 0),
    footprintAt: (x, z) => net.footprintAt(x, z),
    isGroundJunctionBlocked: (id) => net.blockedNodes.has(id),
    ownsEdge: (id) => !!net.own[id],
    materials: mats,
  };
  if (typeof window !== 'undefined') window.__elevated = api; // debug / test hook (drive + screenshot harnesses)
  return api;
}
export default createElevated;
