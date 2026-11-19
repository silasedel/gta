import { makeWorld } from './world.mjs';
const W = await makeWorld();
const { RAPIER, world, kind } = W;
const [x, z, r = 12] = process.argv.slice(2).map(Number);
const ball = new RAPIER.Cuboid(r, 30, r);
world.intersectionsWithShape({ x, y: 10, z }, { x: 0, y: 0, z: 0, w: 1 }, ball, (c) => {
  const k = kind.get(c.handle);
  if (k === 'deck' || k === 'street' || k === 'ground') return true;
  const t = c.translation();
  let info = '';
  if (c.shape.type === 'ConvexPolyhedron' || c.shape.vertices) {
    const v = c.shape.vertices;
    let mx = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
    for (let i = 0; i < v.length; i += 3) {
      mx[0] = Math.min(mx[0], v[i] + t.x);
      mx[1] = Math.max(mx[1], v[i] + t.x);
      mx[2] = Math.min(mx[2], v[i + 1] + t.y);
      mx[3] = Math.max(mx[3], v[i + 1] + t.y);
      mx[4] = Math.min(mx[4], v[i + 2] + t.z);
      mx[5] = Math.max(mx[5], v[i + 2] + t.z);
    }
    info = mx.map((a) => a.toFixed(1)).join(',');
  }
  console.log(k, t.x.toFixed(1), t.y.toFixed(1), t.z.toFixed(1), info);
  return true;
});
