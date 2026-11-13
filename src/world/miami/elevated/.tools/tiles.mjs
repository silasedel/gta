import { loadData } from './env.mjs';
import * as THREE from 'three'; import RAPIER from '@dimforge/rapier3d-compat';
import { createElevated } from '../../elevated.js';
await RAPIER.init();
const data = await loadData();
let t = performance.now(); const el = createElevated({ THREE, RAPIER, data }); console.log('create ms', (performance.now() - t).toFixed(0));
const keys = data.tileKeys.map((k) => String(k).split(/[,_:]/).map(Number));
let worst = 0, wk = null, tot = 0, tris = 0, cols = 0, nonEmpty = 0; const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
for (const [tx, tz] of keys) {
  const it = el.buildTileSteps(tx, tz); let r, stepMax = 0, k = 0, worstK = 0;
  while (true) { const t0 = performance.now(); r = it.next(); const dt = performance.now() - t0; (globalThis.H ||= []).push(dt); if (dt > stepMax) { stepMax = dt; worstK = r.done ? 'last' : k; } k++; if (r.done) break; }
  const t0 = performance.now(); const res = r.value; tot += 0;
  if (stepMax > worst) { worst = stepMax; wk = [tx, tz, worstK, k]; }
  if (res.group.children.length) nonEmpty++;
  res.group.traverse((o) => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  for (const c of res.colliderDescs) { world.createCollider(c.desc); cols++; }
}
console.log('tiles', keys.length, 'nonEmpty', nonEmpty, 'worst step ms', worst.toFixed(1), wk, 'tris', tris, 'colliders', cols);

const H = globalThis.H.sort((a,b)=>a-b); console.log('steps', H.length, 'p50', H[H.length>>1].toFixed(2), 'p99', H[Math.floor(H.length*0.99)].toFixed(2), 'p999', H[Math.floor(H.length*0.999)].toFixed(2), '>5ms', H.filter(v=>v>5).length);
