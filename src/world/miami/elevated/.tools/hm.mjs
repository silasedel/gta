import { makeWorld } from './world.mjs';
import { P } from '../params.js';
const W = await makeWorld(); const { RAPIER, world, net, el, kind } = W; const cid = +process.argv[2];
const c = net.chains[cid]; const F = {}; let shown = 0; const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
for (let s = c.s0 + 0.3; s < c.s1 && shown < 8; s += 0.25) { net.framesAt(c, s, F); for (const L of net.laneOffsets(c, F.i)) { const o = L.o, x = F.x - F.tz * o, z = F.z + F.tx * o, yE = F.y + P.ROAD_Y + F.bank * o;
  ray.origin = { x, y: yE + 1.6, z }; const h = world.castRay(ray, 6, true); const hy = h ? yE + 1.6 - h.timeOfImpact : null; const hq = el.heightAt(x, z, yE);
  if (hy === null || hq === null || Math.abs(hq - hy) > 0.01) { shown++; console.log('s', s.toFixed(2), 'o', o.toFixed(2), 'yE', yE.toFixed(3), 'ray', hy?.toFixed(3), kind.get(h?.collider.handle), 'hq', hq?.toFixed(3), 'qchain', net.lastQuery.chain, 'i', net.lastQuery.i, 'x,z', x.toFixed(2), z.toFixed(2), 'tile', Math.floor(x/200), Math.floor(z/200)); } } }
