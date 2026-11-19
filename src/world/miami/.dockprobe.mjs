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
const { loadMiamiData } = await import('./data.js');
const { createDataProvider } = await import('./dataProvider.js');
const { createTileBuilder } = await import(
  process.argv[2] === 'live' ? './tilebuild.js' : './tilebuild.js'
);

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
const b = createTileBuilder({
  auditTags: true,
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

const T = provider.tileSize;
const built = new Set();
const pts = [
  [2309, 825],
  [2501, 1111],
  [2383, 971],
  [2320, 830],
  [2400, 1000],
];
for (const [x, z] of pts) {
  const tx = Math.floor((x - (provider.origin?.x || 0)) / T),
    tz = Math.floor((z - (provider.origin?.z || 0)) / T);
  const t = {
    tx,
    tz,
    k: tx + ',' + tz,
    x0: tx * T,
    z0: tz * T,
    cx: (tx + 0.5) * T,
    cz: (tz + 0.5) * T,
  };
  if (built.has(t.k)) continue;
  built.add(t.k);
  const g = b.buildColliders(t);
  let r = g.next();
  while (!r.done) r = g.next();
}
world.step();
for (const [x, z] of pts) {
  const hits = [];
  world.intersectionsWithRay(
    new RAPIER.Ray({ x, y: 8, z }, { x: 0, y: -1, z: 0 }),
    12,
    true,
    (h) => {
      hits.push({ y: +(8 - h.timeOfImpact).toFixed(2), tag: b.colTags.get(h.collider.handle) });
      return true;
    },
  );
  console.log(x, z, 'water', data.isWater(x, z), JSON.stringify(hits));
}
