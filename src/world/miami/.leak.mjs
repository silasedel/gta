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
const ROOT = new THREE.Group();
const _dispose = THREE.BufferGeometry.prototype.dispose;
const DISPOSED = new WeakSet();
THREE.BufferGeometry.prototype.dispose = function () {
  DISPOSED.add(this);
  globalThis.NDISP = (globalThis.NDISP || 0) + 1;
  return _dispose.call(this);
};
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
  root: ROOT,
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
const seen = new Set();
const scan = () => {
  const inRoot = new Set();
  ROOT.traverse((o) => {
    if (o.geometry) {
      inRoot.add(o.geometry);
      seen.add(o.geometry);
    }
  });
  let leaked = 0,
    live = 0;
  for (const g of seen) {
    if (DISPOSED.has(g)) {
      seen.delete(g);
      continue;
    }
    live++;
    if (!inRoot.has(g)) leaked++;
  }
  return { inRoot: inRoot.size, live, leakedOffRoot: leaked };
};
const loop = [
  [3430, -110],
  [2400, 500],
  [1000, 700],
  [-1400, 100],
  [-2700, -650],
  [-2900, 1150],
  [-1400, 100],
  [1000, 700],
  [3430, -110],
];
for (let lap = 1; lap <= 3; lap++) {
  for (let k = 0; k < loop.length - 1; k++) {
    const [a, c] = [loop[k], loop[k + 1]];
    const N = 140;
    for (let i = 0; i <= N; i++) {
      const x = a[0] + ((c[0] - a[0]) * i) / N,
        z = a[1] + ((c[1] - a[1]) * i) / N;
      f[0].x = f[1].x = x;
      f[0].z = f[1].z = z;
      for (let q = 0; q < 6; q++) st.update(f);
      if (i % 20 === 0) scan();
    }
  }
  console.log(
    'lap',
    lap,
    JSON.stringify(scan()),
    'disposed',
    globalThis.NDISP || 0,
    'near',
    st.stats.near,
    'mid',
    st.stats.mid,
  );
}
