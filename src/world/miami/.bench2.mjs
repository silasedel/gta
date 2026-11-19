// headless benchmark of the DATA path (data.js + adapter + builders + streamer); CITY dev tool
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
const here = path.dirname(fileURLToPath(import.meta.url)),
  projRoot = path.resolve(here, '../../..');
const rd = (u) => {
  for (const p of [path.join(projRoot, 'public', u), path.join(projRoot, u)])
    if (fs.existsSync(p)) return fs.readFileSync(p);
  throw new Error('404 ' + u);
};
globalThis.fetch = async (u) => {
  const b = rd(u);
  return {
    ok: true,
    json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
};
globalThis.document ??= {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () =>
      new Proxy(
        {},
        {
          get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })),
          set: (o, k, v) => ((o[k] = v), true),
        },
      ),
  }),
};
await RAPIER.init();
const sfx = process.argv[3] === 'live' ? '' : '_next';
const { loadMiamiData } = await import('./data.js');
const { createDataProvider } = await import(sfx ? './.dataProvider_next.js' : './dataProvider.js');
const { createTileBuilder } = await import(sfx ? './.tilebuild_next.js' : './tilebuild.js');
const { createStreamer } = await import(sfx ? './.stream_next.js' : './stream.js');
const t0 = performance.now();
const data = await loadMiamiData(null);
const provider = createDataProvider(data);
console.log(
  'data load ms',
  (performance.now() - t0) | 0,
  'tiles',
  data.tileKeys.length,
  'edges',
  data.roadGraph.edges.length,
);
const M = new Proxy(
  {},
  {
    get: (o, k) =>
      (o[k] ??= k.toString().includes('Depth')
        ? new THREE.MeshDepthMaterial()
        : new THREE.MeshStandardMaterial()),
  },
);
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const nodeIdx = new Map();
for (const n of provider.nodes)
  nodeIdx.set(Math.round(n.x * 2) + ',' + Math.round(n.z * 2), {
    degree: n.deg,
    width: Math.max(0, ...n.edges.map((e) => e.width)),
  });
const _ne = {};
let elevated = null;
if (!process.env.NOELEV) {
  try {
    const { createElevated } = await import('./elevated.js');
    elevated = createElevated({ THREE, RAPIER, world, data, materials: M });
  } catch (e) {
    console.log('no elevated', String(e).slice(0, 120));
  }
}
const b = createTileBuilder({
  districtAt: data.districtAt,
  roadKindAt: (x, z) => data.roadGraph.nearestEdge(x, z, {}, 14)?.edge?.kind,
  elevated,
  M,
  provider,
  root: new THREE.Group(),
  world,
  RAPIER,
  zoneAt: data.zoneAt,
  nodeAt: (p) => nodeIdx.get(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)) || null,
  onSidewalk: (x, z) => Math.abs(data.groundHeightAt(x, z) - 0.15) < 0.02,
  groundAt: (x, z) => Math.max(0, data.groundHeightAt(x, z)),
  isWater: (x, z) => data.isWater(x, z),
  roadDist: (x, z) => {
    const r = data.roadGraph.nearestEdge(x, z, {}, 40);
    return r ? r.dist - r.edge.width / 2 : 99;
  },
  roadDirAt: (x, z) => {
    const r = data.roadGraph.nearestEdge(x, z, _ne, 60);
    return r ? Math.atan2(r.point.x - x, r.point.z - z) : 0;
  },
});
{
  const g = b.buildLandBase();
  for (let r = g.next(); !r.done; r = g.next());
}
const st = createStreamer({
  tileSize: provider.tileSize,
  origin: provider.origin,
  chunkTiles: 4,
  nearR: 350,
  midR: 1500,
  colR: 250,
  budgetMs: 3,
  bounds: provider.bounds,
  ...b,
});
const sp = data.playerSpawn;
const f = [
  { x: sp.x, z: sp.z },
  { x: sp.x, z: sp.z },
];
const tw = performance.now();
while (performance.now() - tw < 20000) {
  for (let k = 0; k < 20; k++) st.update(f);
  if (st.readyAround(sp.x, sp.z, 220)) break;
  await new Promise((r) => setTimeout(r, 0));
}
console.log(
  'warmup ms',
  (performance.now() - tw) | 0,
  'ready',
  st.readyAround(sp.x, sp.z, 220),
  'colliders',
  world.colliders.len(),
);
world.step();
const ray = (x, z) => {
  const h = world.castRay(new RAPIER.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 }), 400, true);
  return h ? +(200 - h.timeOfImpact).toFixed(2) : null;
};
console.log(
  'spawn',
  sp.x.toFixed(1),
  sp.z.toFixed(1),
  'ray',
  ray(sp.x, sp.z),
  'data ground',
  data.groundHeightAt(sp.x, sp.z),
  'surface',
  data.surfaceAt(sp.x, sp.z),
);
let agree = 0,
  n = 0,
  bad = [];
for (let k = 0; k < 300; k++) {
  const x = sp.x + (Math.random() - 0.5) * 300,
    z = sp.z + (Math.random() - 0.5) * 300;
  const g = data.groundHeightAt(x, z);
  if (data.isWater(x, z)) continue;
  const r = ray(x, z);
  n++;
  if (r !== null && (Math.abs(r - g) < 0.2 || r > g + 2)) agree++;
  else if (bad.length < 6)
    bad.push([x.toFixed(0), z.toFixed(0), r, g.toFixed(2), data.surfaceAt(x, z)]);
}
console.log(
  'land points with matching collider (or building above):',
  agree,
  '/',
  n,
  JSON.stringify(bad),
);
let removedTiles = 0,
  lastB = null;
if (st.onTileCollidersRemoving)
  st.onTileCollidersRemoving((b) => {
    removedTiles++;
    lastB = b;
  });
for (const k in st.stats.maxStep) st.stats.maxStep[k] = 0;
const A = [sp.x, sp.z],
  B =
    process.argv[4] === 'port'
      ? [1000, 1100]
      : process.argv[4] === 'brickell'
        ? [-2700, 1700]
        : [-2600, -600],
  N = 900;
let worst = 0,
  sum = 0,
  spikes = 0;
for (let i = 0; i <= N; i++) {
  const t = i / N;
  f[0].x = f[1].x = A[0] + (B[0] - A[0]) * t;
  f[0].z = f[1].z = A[1] + (B[1] - A[1]) * t;
  const t1 = performance.now();
  st.update(f);
  const dt = performance.now() - t1;
  worst = Math.max(worst, dt);
  sum += dt;
  if (dt > 6) spikes++;
  if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
}
console.log(
  'collider-removal callbacks',
  removedTiles,
  JSON.stringify(lastB),
  'readyAt spawn',
  st.collidersReadyAt?.(sp.x, sp.z),
);
let cont = 0,
  boats = 0,
  stacks = 0;
for (const t of st.tiles.values())
  if (t.props) {
    cont += t.props.container.length;
    boats += t.props.boat.length;
    stacks += t.props.stack.length;
  }
let huts = 0,
  cafes = 0,
  blobs = 0,
  palms = 0;
for (const t of st.tiles.values())
  if (t.props) {
    huts += t.props.hut?.length || 0;
    cafes += t.props.cafe?.length || 0;
    blobs += t.props.blob?.length || 0;
    palms += t.props.palm.length;
  }
console.log(
  'containers',
  cont,
  'stacks',
  stacks,
  'boats',
  boats,
  'huts',
  huts,
  'cafes',
  cafes,
  'hedge',
  blobs,
  'palms',
  palms,
);
{
  let portColliders = 0;
  world.forEachCollider((c) => {
    const t = c.translation();
    if (Math.hypot(t.x - 1000, t.z - 1100) < 300) portColliders++;
  });
  console.log('static colliders within 300 m of (1000,1100):', portColliders);
}
console.log(
  'flight frames',
  N,
  'avg',
  (sum / N).toFixed(2),
  'worst',
  worst.toFixed(1),
  'spikes>6',
  spikes,
  'maxStep',
  JSON.stringify(
    Object.fromEntries(Object.entries(st.stats.maxStep).map(([k, v]) => [k, +v.toFixed(1)])),
  ),
  'colliders',
  world.colliders.len(),
  'near',
  st.stats.near,
  'mid',
  st.stats.mid,
);
console.log('trimesh', JSON.stringify(b.colStats), 'placement', JSON.stringify(b.placeStats));
