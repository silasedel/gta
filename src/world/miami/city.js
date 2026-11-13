// Miami city (CITY agent): real-scale OSM Miami, streamed tiles with near/mid/far LOD and incremental colliders.
// Data comes from ./data.js (DATA agent) when present; until then a dev provider reads the raw OSM caches.
import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createStreamer } from './stream.js';
import { createTileBuilder } from './tilebuild.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDataProvider } from './dataProvider.js';
import { buildPort } from './port.js';
import { createGrassField } from './grass.js';
import { createSeabed } from './seabed.js';

const SEA_LEVEL = -0.12;

// Coarse zone/district fallback (used only when data.js does not provide zoneAt/districtAt).
const REGIONS = [
  // [name, zone, x0, x1, z0, z1]  (world frame: +X east, +Z south)
  ['South Beach', 'beach', 3300, 4600, -2700, 2700],
  ['South Beach', 'nightlife', 2550, 3300, -2700, 2700],
  ['Port of Miami', 'port', -1050, 1350, -80, 820],
  ['Watson Island', 'park', -1300, -350, -1250, -500],
  ['MacArthur Causeway', 'causeway', -350, 2550, -1300, -450],
  ['Venetian Islands', 'residential', -1300, 2550, -2700, -1300],
  ['Downtown', 'downtown', -3700, -1100, -1400, 450],
  ['Brickell', 'business', -3700, -1500, 450, 2700],
  ['Biscayne Bay', 'water', -1500, 2550, 820, 2700],
];
function regionAt(x, z) { for (const r of REGIONS) if (x >= r[2] && x < r[3] && z >= r[4] && z < r[5]) return r; return null; }

export async function createMiamiCity(game, opts = {}) {
  const { scene, world, RAPIER, renderer } = game;
  const t0 = performance.now();
  // ---- data provider ----
  let data = null, provider = null;
  try {
    // static path so Vite bundles data.js into production builds (a @vite-ignore URL import 404s after build)
    const mod = await import('./data.js');
    data = await (mod.loadMiamiData || mod.createMiamiData || mod.default)?.(game);
  } catch (e) { console.info('[miami] data.js not available yet, using dev OSM cache provider', e?.message || e); }
  if (data && (data.getTile || data.loadTile)) provider = createDataProvider(data);
  else { const { loadDevProvider } = await import('./devProvider.js'); provider = await loadDevProvider(200); }
  const bounds = data?.bounds || provider.bounds;

  const { M, F, update: updateMats } = await createMaterials(renderer);
  const root = new THREE.Group(); root.name = 'miami-city'; scene.add(root);
  let grassField = null; try { if (data?.surfaceAt) grassField = createGrassField({ M, root, data, lawnTester: (a, b, c2, d) => { try { return builder.lawnTester(a, b, c2, d); } catch { return null; } } }); } catch (e) { console.warn('[miami] grass field', e); }

  // ---- queries (prefer data.js) ----
  const zoneAt = data?.zoneAt ? (x, z) => data.zoneAt(x, z) : (x, z) => regionAt(x, z)?.[1] || 'commercial';
  const nodeIndex = new Map();
  for (const n of provider.nodes || []) nodeIndex.set(Math.round(n.x * 2) + ',' + Math.round(n.z * 2), n);
  const tileNodes = new Map(); // full node records (with width/dirs) come from tiles
  const nodeAt = (p) => { const k = Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2); let n = tileNodes.get(k); if (n) return n; const raw = nodeIndex.get(k); if (!raw) return null; const w = Math.max(0, ...(raw.edges || []).map((e) => e.width)); n = { degree: raw.deg ?? raw.degree ?? 0, width: w }; tileNodes.set(k, n); return n; };

  // CC0 prop models (Poly Haven, decimated) -> instancing parts {geometry, material}; procedural fallback if missing
  const gl = new GLTFLoader();
  const loadParts = async (path, { scale = 1, autoFace = false } = {}) => {
    try {
      const sc = (await gl.loadAsync('/assets/city/models/' + path)).scene; sc.updateMatrixWorld(true);
      const meshes = []; sc.traverse((o) => { if (o.isMesh) meshes.push(o); });
      let flip = false;
      if (autoFace) { let sz = 0, n = 0; const v = new THREE.Vector3(); for (const m of meshes) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i += 2) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); if (v.y > 0.6) { sz += v.z; n++; } } } flip = n > 0 && sz / n > 0; }
      return meshes.map((m) => { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); if (flip) g.rotateY(Math.PI); g.scale(scale, scale, scale); return { geometry: g, material: m.material }; });
    } catch (e) { console.warn('[miami] model missing', path); return null; }
  };
  const [bench, hydrant, trash] = await Promise.all([loadParts('bench_wooden/painted_wooden_bench_1k.gltf', { scale: 1.3, autoFace: true }), loadParts('hydrant_lo/hydrant_lo.gltf'), loadParts('trash_can_lo/trash_can_lo.gltf', { scale: 1.05 })]);
  const models = { bench, hydrant, trash };
  // TRIAL (?plants=q): Quaternius CC0 low-poly shrubs instead of the leaf-card bushes, for an A/B look
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('plants') === 'q') {
    const fit = (parts, H) => { if (!parts) return null; const bb = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); bb.union(p.geometry.boundingBox); } const k = H / Math.max(1e-6, bb.max.y - bb.min.y); for (const p of parts) { p.geometry.translate(0, -bb.min.y, 0); p.geometry.scale(k, k, k); } return parts; };
    const [qb, qf] = await Promise.all([loadParts('quaternius/bush.glb'), loadParts('quaternius/bush_flowers.glb')]);
    models.bush = fit(qb, 1.25); models.flowerBush = fit(qf, 1.1);
  }
  // live furniture lists for peds (sit / lean); tiles add/remove entries as they stream
  const benches = [], leanSpots = [];
  const onProps = (t, props, added) => {
    if (added) { t._benches = props.bench.map((b) => ({ pos: new THREE.Vector3(b.x, b.y, b.z), heading: b.ry })); benches.push(...t._benches); t._lean = props.shelter.map((b) => ({ pos: new THREE.Vector3(b.x, b.y, b.z), heading: b.ry })); leanSpots.push(...t._lean); }
    else { for (const arr of [[benches, t._benches], [leanSpots, t._lean]]) for (const e of arr[1] || []) { const i = arr[0].indexOf(e); if (i >= 0) arr[0].splice(i, 1); } }
  };
  const CURB_H = data?.curbHeight ?? 0.15;
  const groundAt = data?.groundHeightAt ? (x, z) => Math.max(0, elevated ? data.groundHeightAt(x, z, -50) : data.groundHeightAt(x, z)) : () => 0; // ground under OSM bridges (ELEVATED owns every deck)
  const onSidewalk = data?.groundHeightAt ? (x, z) => Math.abs(data.groundHeightAt(x, z) - CURB_H) < 0.02 : null;
  const _ne = {};
  const roadDirAt = data?.roadGraph?.nearestEdge ? (x, z) => { const r = data.roadGraph.nearestEdge(x, z, _ne, 60); if (!r) return 0; const dx = r.point.x - x, dz = r.point.z - z; return Math.atan2(dx, dz); } : null;
  const isWaterQ = data?.isWater ? (x, z) => data.isWater(x, z) : null;
  const _nd = {};
  const roadDist = data?.roadGraph?.nearestEdge ? (x, z) => { const r = data.roadGraph.nearestEdge(x, z, _nd, 40); return r ? r.dist - r.edge.width / 2 : 99; } : null;
  // optional ELEVATED module (decks / ramps / barriers / piers); any failure falls back to the built-in deck code
  let elevated = null;
  try { const mods = import.meta.glob('./elevated.js'); /* vite rewrites this statically; under plain node it throws and we fall back */ if (mods['./elevated.js']) { const m = await mods['./elevated.js'](); elevated = m.createElevated ? m.createElevated({ THREE, RAPIER, world, data, materials: M }) : null; } } catch (e) { console.warn('[miami] elevated.js unavailable, using built-in decks', e); elevated = null; }
  const elevH = (x, z, y) => { if (!elevated) return null; try { const h = elevated.heightAt(x, z, y); return Number.isFinite(h) ? h : null; } catch (e) { return null; } };
  const builder = createTileBuilder({ districtAt: data?.districtAt, roadKindAt: data?.roadGraph?.nearestEdge ? (x, z) => data.roadGraph.nearestEdge(x, z, {}, 14)?.edge?.kind : null, storefrontList: data?.storefronts || null, elevated, M, provider, root, world, RAPIER, zoneAt, nodeAt, models, onProps, onSidewalk, groundAt, roadDirAt, isWater: isWaterQ, roadDist });
  // mid/far chunk meshes: discard fragments of tiles that currently have a near (full-detail) build
  const NM = 9, nearU = { uNearOrigin: { value: new THREE.Vector2(-1e6, -1e6) }, uNearMask: { value: new Float32Array(NM * NM) } };
  const nearCut = (sh) => {
    sh.uniforms.uNearOrigin = nearU.uNearOrigin; sh.uniforms.uNearMask = nearU.uNearMask;
    sh.vertexShader = 'attribute vec2 aTile;\nvarying vec2 vTile;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTile = aTile;').replace('#include <project_vertex>', `#include <project_vertex>
      // ground-stack depth bias for merged mid/far meshes (one material, so no per-layer polygonOffset): ~6 depth steps per cm of layer height
      gl_Position.z -= clamp(transformed.y, 0.0, 0.1) * 7.0e-5 * gl_Position.w;`);
    sh.fragmentShader = 'uniform vec2 uNearOrigin;\nuniform float uNearMask[' + NM * NM + '];\nvarying vec2 vTile;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec2 nt = floor(vTile + 0.5) - uNearOrigin;
      if (nt.x >= 0.0 && nt.y >= 0.0 && nt.x < ${NM}.0 && nt.y < ${NM}.0) { int k = int(nt.y) * ${NM} + int(nt.x); if (uNearMask[k] > 0.5) discard; }`);
  };
  M.far.onBeforeCompile = nearCut; if (M.farGlass) M.farGlass.onBeforeCompile = nearCut;
  const streamer = createStreamer({
    tileSize: provider.tileSize || 200, origin: provider.origin || { x: 0, z: 0 }, chunkTiles: 4, nearR: opts.nearR ?? 350, midR: opts.midR ?? 1500, colR: 200, budgetMs: opts.budgetMs ?? 3,
    bounds, buildNear: builder.buildNear, buildMid: builder.buildMid, buildFar: builder.buildFar,
    buildColliders: builder.buildColliders, removeColliders: builder.removeColliders, dispose: builder.dispose,
  });

  // ---- precompile every material variant (plain, instanced, shadow depth) so streaming never hits a shader-compile stall ----
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    const warm = new THREE.Group();
    const mats = Object.values(M).filter((m) => m && m.isMaterial && !m.isMeshDepthMaterial).concat(builder.extraMaterials, ...Object.values(models).filter(Boolean).flatMap((ps) => ps.map((p) => p.material)));
    for (const m of mats) {
      const a = new THREE.Mesh(g, m); a.castShadow = a.receiveShadow = true; a.frustumCulled = false; warm.add(a);
      const im = new THREE.InstancedMesh(g, m, 1); im.setMatrixAt(0, new THREE.Matrix4()); im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
      if (m === M.frond) im.customDepthMaterial = M.frondDepth; if (m === M.trunk || m === M.royalTrunk) im.customDepthMaterial = M.trunkDepth;
      warm.add(im);
      const ic = new THREE.InstancedMesh(g, m, 1); ic.setMatrixAt(0, new THREE.Matrix4()); ic.setColorAt(0, new THREE.Color(1, 1, 1)); ic.frustumCulled = false; warm.add(ic);
    }
    const cam = game.camera; warm.position.copy(cam.position).add(new THREE.Vector3(0, -1000, 0));
    scene.add(warm);
    const tc = performance.now();
    // pre-upload every city texture now (avoids 50-300 ms upload stalls the first time a tile shows a material)
    { const seen = new Set(); for (const m of mats.concat(Object.values(M).filter((x) => x && x.isMaterial))) for (const k of ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap', 'alphaMap', 'aoMap']) { const tx = m[k]; if (tx && tx.isTexture && !seen.has(tx)) { seen.add(tx); try { renderer.initTexture(tx); } catch (e) { /* older three */ } } } }
    try { renderer.compile(scene, cam); renderer.render(scene, cam); } catch (e) { console.warn('[miami] precompile', e); }
    scene.remove(warm); g.dispose();
    console.info(`[miami] precompiled ${mats.length} materials in ${(performance.now() - tc) | 0} ms`);
  }
  // ---- Port of Miami landmarks (always resident; permanent static colliders) ----
  let port = null;
  if (data?.getTile) { try { port = buildPort({ data, M, F, root, world, RAPIER }); } catch (e) { console.warn('[miami] port landmarks failed', e); } }
  // ---- road graph (contract) ----
  const edges = data?.roadGraph?.edges || provider.edges || [];
  const nodes = data?.roadGraph?.nodes || (provider.nodes || []).map((n) => ({ id: n.id, x: n.x, z: n.z }));
  const adj = new Map(); for (const e of edges) for (const n of [e.a, e.b]) { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(e); }
  // coarse grid index over edge segments for nearestEdge / spawns
  const GI = 100, grid = new Map();
  edges.forEach((e) => { for (let i = 1; i < e.pts.length; i++) { const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / GI)); for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * (k / n), z = az + (bz - az) * (k / n); const key = Math.floor(x / GI) + ',' + Math.floor(z / GI); let l = grid.get(key); if (!l) grid.set(key, (l = [])); if (l[l.length - 1] !== e) l.push(e); } } });
  function nearestEdge(x, z, maxR = 300) {
    let best = null, bd = Infinity;
    for (let r = 0; r <= Math.ceil(maxR / GI); r++) {
      const cx = Math.floor(x / GI), cz = Math.floor(z / GI);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        for (const e of grid.get(cx + i + ',' + (cz + j)) || []) for (let s = 1; s < e.pts.length; s++) {
          const [ax, az] = e.pts[s - 1], [bx, bz] = e.pts[s], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
          if (d < bd) { const L = Math.sqrt(L2); bd = d; best = { edge: e, seg: s, t, dist: d, point: { x: px, z: pz }, dir: { x: dx / L, z: dz / L } }; }
        }
      }
      if (best && bd < r * GI) break;
    }
    return best;
  }
  const roadGraph = data?.roadGraph?.nearestEdge ? data.roadGraph : { nodes, edges, nearestEdge, edgesAt: (id) => adj.get(id) || [] };

  // safety floor far below the seabed so nothing ever falls forever
  world.createCollider(RAPIER.ColliderDesc.cuboid(20000, 1, 20000).setTranslation(0, -9, 0));
  // spawn: data.js value, else the sidewalk of the nearest real street to Ocean Drive / 9th St
  let playerSpawn, playerSpawnHeading = 0;
  if (data?.playerSpawn) { playerSpawn = new THREE.Vector3().copy(data.playerSpawn); playerSpawnHeading = data.playerSpawnHeading ?? 0; }
  else {
    const r = nearestEdge(3440, -110, 400);
    if (r) { const e = r.edge, off = e.width / 2 + 1.5, rx = -r.dir.z, rz = r.dir.x; playerSpawn = new THREE.Vector3(r.point.x + rx * off, 0.35, r.point.z + rz * off); playerSpawnHeading = Math.atan2(r.dir.x, r.dir.z); }
    else playerSpawn = new THREE.Vector3(3440, 0.35, -110);
  }
  const city = {
    bounds, seaLevel: SEA_LEVEL, playerSpawn, playerSpawnHeading,
    roadGraph,
    roads: edges.flatMap((e) => e.pts.slice(1).map((p, i) => ({ x1: e.pts[i][0], z1: e.pts[i][1], x2: p[0], z2: p[1], width: e.width }))),
    buildings: data?.buildings || [],
    mapLayers: data?.mapLayers || { land: [], water: [], beach: [], park: [], buildingPolys: [], roadEdges: edges.map((e) => e.pts) },
    groundHeightAt: data?.groundHeightAt ? (x, z, y) => elevH(x, z, y) ?? (elevated ? data.groundHeightAt(x, z, -50) : data.groundHeightAt(x, z, y)) :  // decks only where ELEVATED has one (raw OSM deck heights are not surfaces)
    (x, z, y) => elevH(x, z, y) ?? 0,
    isWater: data?.isWater ? (x, z) => data.isWater(x, z) : (x, z) => zoneAt(x, z) === 'water',
    seabedDepthAt: data?.seabedDepthAt ? (x, z) => data.seabedDepthAt(x, z) : () => 3,
    surfaceAt: data?.surfaceAt ? (x, z, y) => (elevH(x, z, y) !== null && (y === undefined || Math.abs(elevH(x, z, y) - y) < 2) ? 'asphalt' : data.surfaceAt(x, z, y)) : (x, z) => { const r = nearestEdge(x, z, 30); if (r && r.dist < r.edge.width / 2) return 'asphalt'; if (r && r.dist < r.edge.width / 2 + 3) return 'concrete'; return zoneAt(x, z) === 'beach' ? 'sand' : 'grass_short'; },
    zoneAt, districtAt: data?.districtAt ? (x, z) => data.districtAt(x, z) : (x, z) => regionAt(x, z)?.[0] || 'Miami',
    streetNameAt: data?.streetNameAt ? (x, z) => data.streetNameAt(x, z) : (x, z) => { const r = nearestEdge(x, z, 40); return r && r.dist < r.edge.width / 2 + 6 ? r.edge.name || null : null; },
    randomRoadPoint(near = null, radius = 250, o) {
      if (data?.randomRoadPoint) return data.randomRoadPoint(near, radius, o);
      for (let attempt = 0; attempt < 40; attempt++) {
        const px = near ? near.x + (Math.random() * 2 - 1) * radius : bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const pz = near ? near.z + (Math.random() * 2 - 1) * radius : bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        const r = nearestEdge(px, pz, 200); if (!r) continue;
        const e = r.edge; if (/footway|path|service/.test(e.kind) && attempt < 30) continue;
        if (near && Math.hypot(r.point.x - near.x, r.point.z - near.z) > radius) continue;
        const fwd = e.oneway || Math.random() < 0.5; let dx = r.dir.x, dz = r.dir.z; if (!fwd) { dx = -dx; dz = -dz; }
        const lanes = fwd ? e.lanesFwd || 1 : e.lanesBack || 1, total = (e.lanesFwd || 1) + (e.lanesBack || 0), lw = e.width / Math.max(1, total);
        const lane = (Math.random() * lanes) | 0;
        const laneOffset = e.oneway ? -e.width / 2 + (lane + 0.5) * lw : (lane + 0.5) * lw;
        const y = e.y ? e.y[Math.min(e.y.length - 1, r.seg)] : 0;
        return { position: new THREE.Vector3(r.point.x - dz * laneOffset, y, r.point.z + dx * laneOffset), heading: Math.atan2(dx, dz), edgeId: e.id, laneOffset };
      }
      return null;
    },
    randomSidewalkPoint(near = null, radius = 250, zone = null) {
      if (data?.randomSidewalkPoint) return data.randomSidewalkPoint(near, radius, zone);
      for (let attempt = 0; attempt < 40; attempt++) {
        const p = city.randomRoadPoint(near, radius); if (!p) continue;
        const e = roadGraph.edges[p.edgeId]; if (!e || e.bridge || e.sidewalks === false) continue;
        const side = Math.random() < 0.5 ? -1 : 1, off = e.width / 2 + 1.5, h = p.heading, rx = -Math.cos(h), rz = Math.sin(h); // right of heading
        const q = new THREE.Vector3(p.position.x + rx * side * (off - Math.abs(p.laneOffset)) * 1, 0.15, p.position.z + rz * side * (off - Math.abs(p.laneOffset)));
        if (zone && zoneAt(q.x, q.z) !== zone && attempt < 35) continue;
        return q;
      }
      return playerSpawn.clone();
    },
    shopLots: data?.storefronts || [], storefronts: data?.storefronts || [],
    benches: data?.benches || benches, leanSpots: data?.leanSpots || leanSpots, benchesNear: data?.benchesNear, leanSpotsNear: data?.leanSpotsNear, storefrontsNear: (x, z, r, out = []) => { const a = data?.storefrontsNear ? data.storefrontsNear(x, z, r).slice() : []; builder.synthShopsNear(x, z, r, a); out.length = 0; for (const l of a) out.push(l); return out; }, // DATA lots + synthetic ground-floor shops,
    root, streamer, get grass() { return grassField; }, provider: provider.source || 'data.js',
    update(dt) {
      const h = game.timeOfDay ?? 12; updateMats(dt, h);
      focus[0].x = game.camera.position.x; focus[0].z = game.camera.position.z;
      const p = game.player?.position; if (p) { focus[1].x = p.x; focus[1].z = p.z; }
      const vb = game.player?.state?.vehicle?.body, v = vb?.translation?.(); if (v) { focus[2].x = v.x; focus[2].z = v.z; } else { focus[2].x = focus[1].x; focus[2].z = focus[1].z; }
      // look-ahead along the player car's velocity: colliders are built where the car will be in 3 s and 6 s
      let lvx = 0, lvz = 0; if (v && vb.linvel) { const lv = vb.linvel(); lvx = lv.x; lvz = lv.z; }
      const sp = Math.hypot(lvx, lvz), k6 = sp > 1 ? Math.min(6, 400 / sp) : 0;
      focus[3].x = focus[2].x + lvx * k6 * 0.5; focus[3].z = focus[2].z + lvz * k6 * 0.5; focus[4].x = focus[2].x + lvx * k6; focus[4].z = focus[2].z + lvz * k6;
      // registered anchors (cars, peds, pickups...): colliders stay loaded around each one
      focus.length = 5;
      // fast driving: build full-detail tiles ahead of the car (look-ahead about 4-6 s out) and give streaming a bit more time per frame
      focus.lookAhead = sp > 8 ? focus[4] : null; focus.budgetMs = sp > 25 ? 5 : sp > 12 ? 4 : 0;
      for (const a of anchors) { const q = anchorPos(a); if (q) { const f = anchorFocus.get(a); f.x = q.x; f.z = q.z; focus.push(f); } }
      streamer.update(focus);
      // a fast car must never outrun its colliders: spend extra budget while the path ahead is not ready yet
      if (sp > 8) for (let extra = 0; extra < 3; extra++) { let ok = true; for (const tt of [0, 0.75, 1.5, 3]) if (!streamer.collidersReadyAt(focus[2].x + lvx * tt, focus[2].z + lvz * tt)) { ok = false; break; } if (ok) break; streamer.update(focus); }
      if (grassField) grassField.update(game.camera);
      const o = streamer.nearMask(nearU.uNearMask.value, NM, focus[0].x, focus[0].z); nearU.uNearOrigin.value.set(o[0], o[1]);
    },
  };
  // focus[0] = camera (render LOD only, small collider radius), [1] = player (300 m colliders), [2] = player car, then anchors
  const focus = [{ x: playerSpawn.x, z: playerSpawn.z, r: 60 }, { x: playerSpawn.x, z: playerSpawn.z, r: 200 }, { x: playerSpawn.x, z: playerSpawn.z, r: 200 }, { x: playerSpawn.x, z: playerSpawn.z, r: 150 }, { x: playerSpawn.x, z: playerSpawn.z, r: 150 }];
  const anchors = new Set(), anchorFocus = new Map();
  const anchorPos = (a) => { const b = a.body && a.body.translation ? a.body.translation() : null; if (b) return b; const p = a.position || a.mesh?.position || a.root?.position || a.pos; return p && Number.isFinite(p.x) ? p : (Number.isFinite(a.x) ? a : null); };
  city.registerAnchor = (obj, radius = 100) => { if (!obj || anchors.has(obj)) return; anchors.add(obj); anchorFocus.set(obj, { x: 0, z: 0, r: radius }); };
  city.unregisterAnchor = (obj) => { anchors.delete(obj); anchorFocus.delete(obj); };
  city.collidersReadyAt = (x, z) => streamer.collidersReadyAt(x, z);
  city.bushAt = (x, z, pad) => (builder.bushAt ? builder.bushAt(x, z, pad) : 0); // 0..1 depth inside a (non-solid) bush
  city.colliderSourceAt = (x, z, r) => builder.colliderSourceAt ? builder.colliderSourceAt(x, z, r) : []; // which city generator placed static geometry near (x, z)
  city.deckSurfaceAt = (x, z, yHint) => builder.deckSurfaceAt(x, z, yHint);
  // moored boats (VEHICLES swaps one for a drivable boat): moorings near a point (default: the player), claim hides the static boat + its collider
  city.moorings = (x, z, r = 400) => { const p = game.player?.position; return builder.mooringsNear(x ?? p?.x ?? 0, z ?? p?.z ?? 0, r); };
  city.claimMooring = (id) => builder.claimMooring(id);
  city.releaseMooring = (id) => builder.releaseMooring(id); // rendered/collider deck height near yHint, or null off-deck
  city.onTileCollidersRemoving = (fn) => streamer.onTileCollidersRemoving(fn);
  game.updaters.push((dt) => city.update(dt));
  try { city.seabed = createSeabed(game, city); } catch (e) { console.warn('[miami] seabed unavailable', e); }
  // per-frame view culling of the global prop pools, run right before the main render (and its shadow pass) with the final camera
  if (builder.cullPools && scene) { const prevBR = scene.onBeforeRender; scene.onBeforeRender = function (r, sc, cam, ...rest) { if (cam === game.camera) builder.cullPools(cam); if (prevBR) prevBR.call(this, r, sc, cam, ...rest); }; city.cullStats = builder.cullStats; }
  // synchronous warm-up: colliders + near tiles around the spawn so the player never falls
  { const g = builder.buildLandBase(); for (let r = g.next(); !r.done; r = g.next()); }
  // warm-up: stream until the near tiles + colliders around the spawn are ready (tiles load asynchronously)
  if (opts.warmup !== false) {
    const tEnd = performance.now() + 15000;
    while (performance.now() < tEnd) {
      for (let k = 0; k < 20; k++) streamer.update(focus);
      if (streamer.readyAround(playerSpawn.x, playerSpawn.z, 220)) break;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  console.info(`[miami] city ready in ${(performance.now() - t0) | 0} ms (provider: ${city.provider})`);
  return city;
}
