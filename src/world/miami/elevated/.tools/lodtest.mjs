import { loadData } from './env.mjs';
import * as THREE from 'three';
import { createElevated } from '../../elevated.js';
const data = await loadData();
const el = createElevated({ THREE, RAPIER: null, data });
let tri = 0,
  t = performance.now(),
  worst = 0;
for (const k of data.tileKeys) {
  const [tx, tz] = String(k).split(/[,_:]/).map(Number);
  const a = performance.now();
  const g = el.buildTileLod(tx, tz);
  worst = Math.max(worst, performance.now() - a);
  if (g) tri += g.attributes.position.count / 3;
}
console.log('lod tris', tri, 'ms', (performance.now() - t).toFixed(0), 'worst', worst.toFixed(1));
