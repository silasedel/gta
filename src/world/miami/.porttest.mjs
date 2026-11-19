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
await RAPIER.init();
const { loadMiamiData } = await import('./data.js');
const { buildPort } = await import('./port.js');
const d = await loadMiamiData(null);
const M = new Proxy({}, { get: (o, k) => (o[k] ??= new THREE.MeshStandardMaterial()) });
const t0 = performance.now();
const r = buildPort({
  data: d,
  M,
  F: { deco: { tileW: 16, tileH: 13.6 } },
  root: new THREE.Group(),
  world: new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
  RAPIER,
});
console.log(
  'port build ms',
  (performance.now() - t0) | 0,
  'ships',
  JSON.stringify(r.ships.map((s) => [s.x | 0, s.z | 0, +s.yaw.toFixed(2)])),
  'cranes',
  r.cranes.length,
  JSON.stringify(r.cranes.slice(0, 6).map((c) => [c.x | 0, c.z | 0])),
  'terminals',
  JSON.stringify(r.terminals.map((t) => [t.x | 0, t.z | 0])),
);
