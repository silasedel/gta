import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
const here = path.dirname(fileURLToPath(import.meta.url)),
  projRoot = path.resolve(here, '../../..');
globalThis.fetch = async (u) => ({
  json: async () => JSON.parse(fs.readFileSync(path.join(projRoot, u), 'utf8')),
});
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
const { loadDevProvider } = await import('./devProvider.js');
const { createTileBuilder } = await import('./tilebuild.js');
const { createStreamer } = await import('./stream.js');
const provider = await loadDevProvider(200);
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
const b = createTileBuilder({
  M,
  provider,
  root: new THREE.Group(),
  world,
  RAPIER,
  zoneAt: () => 'beach',
  nodeAt: (p) => nodeIdx.get(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)) || null,
});
// same spawn rule as city.js
let best = null,
  bd = Infinity;
for (const e of provider.edges)
  for (let s = 1; s < e.pts.length; s++) {
    const [ax, az] = e.pts[s - 1],
      [bx, bz] = e.pts[s],
      dx = bx - ax,
      dz = bz - az,
      L2 = dx * dx + dz * dz || 1,
      t = Math.max(0, Math.min(1, ((3440 - ax) * dx + (-110 - az) * dz) / L2)),
      px = ax + dx * t,
      pz = az + dz * t,
      d = Math.hypot(3440 - px, -110 - pz);
    if (d < bd) {
      bd = d;
      const L = Math.sqrt(L2);
      best = { e, px, pz, dx: dx / L, dz: dz / L };
    }
  }
const off = best.e.width / 2 + 1.5,
  sp = { x: best.px - best.dz * off, z: best.pz + best.dx * off };
const st = createStreamer({
  tileSize: 200,
  chunkTiles: 4,
  nearR: 350,
  midR: 1500,
  colR: 250,
  budgetMs: 3,
  bounds: provider.bounds,
  ...b,
});
const f = [sp, sp];
for (let i = 0; i < 300; i++) st.update(f);
world.step();
const ray = (x, z) => {
  const h = world.castRay(new RAPIER.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 }), 400, true);
  return h ? +(200 - h.timeOfImpact).toFixed(2) : null;
};
console.log(
  'spawn',
  sp.x.toFixed(1),
  sp.z.toFixed(1),
  'street',
  best.e.name,
  best.e.kind,
  'width',
  best.e.width,
  'ground',
  ray(sp.x, sp.z),
  'road centre',
  ray(best.px, best.pz),
  'colliders',
  world.colliders.len(),
);
let hits = 0,
  n = 0;
for (let k = 0; k < 400; k++) {
  const e = provider.edges[(Math.random() * provider.edges.length) | 0];
  const p = e.pts[(e.pts.length / 2) | 0];
  if (Math.hypot(p[0] - sp.x, p[1] - sp.z) > 200) continue;
  n++;
  if (ray(p[0], p[1]) !== null && ray(p[0], p[1]) > -1) hits++;
}
console.log('road midpoints within 200m with ground:', hits, '/', n);
