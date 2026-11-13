import { makeWorld } from './world.mjs';
const W = await makeWorld(); const { RAPIER, world, kind, el } = W; const [x0, z0, x1, z1, step = 0.5] = process.argv.slice(2).map(Number);
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }); const L = Math.hypot(x1 - x0, z1 - z0); let prev = null; const out = [];
for (let s = 0; s <= L; s += step) { const x = x0 + (x1 - x0) * s / L, z = z0 + (z1 - z0) * s / L; ray.origin = { x, y: 40, z }; const h = world.castRay(ray, 60, true); const y = h ? 40 - h.timeOfImpact : null; const hq = el.heightAt(x, z, 30);
  out.push([+x.toFixed(1), y === null ? null : +y.toFixed(3), kind.get(h?.collider.handle), hq === null ? null : +hq.toFixed(3), prev !== null && y !== null ? +(y - prev).toFixed(3) : null]); prev = y; }
console.log(out.map((o) => o.join(' ')).join('\n'));
