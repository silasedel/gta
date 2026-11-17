import * as THREE from 'three';
globalThis.fetch = async () => { throw new Error('offline'); };
const { createBuildingModels, LIB } = await import('../../../../src/world/miami/bldmodels.js');
const root = new THREE.Group();
const api = createBuildingModels({ root, districtAt: (x, z) => (x < 0 ? 'Overtown' : 'Downtown'), ground: () => 0.3, roadDist: () => 5, near: () => [], argsOf: () => null });
const mk = (id, cx, cz, w, d, h, style, kind) => ({ id, cx, cz, h, style, kind, area: w * d, rings: [[[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]] });
let n = 0, names = {};
for (let i = 0; i < 400; i++) {
  const t = i % 4; const b = t === 0 ? mk(1000 + i, 100, 100, 45, 50, 120, 'tower', 'office') : t === 1 ? mk(1000 + i, 100, 100, 32, 30, 25, 'midrise', 'office') : t === 2 ? mk(1000 + i, -100, 100, 11, 14, 6, 'lowrise', 'apartments') : mk(1000 + i, 100, 100, 12, 15, 5, 'strip', 'retail');
  const style = t === 0 ? 'glass' : t === 1 ? 'office' : t === 2 ? 'house' : 'deco', zone = t === 2 ? 'residential' : 'downtown';
  const L = api.pick(b, style, zone); if (L) { n++; names[L.name] = (names[L.name] || 0) + 1; api.register(b, L, 0); const coll = { n: 0, vert() { this.n++; } }; api.collide(coll, L, 0); if (coll.n % 3) throw new Error('bad tri count'); }
}
console.log('picked', n, names);
const tile = { x0: -200, z0: 0, size: 200, areas: [{ cls: 'dirt', rings: [[[-150, 50], [-120, 50], [-120, 80], [-150, 80]]] }] };
console.log('fences', api.lotFences(tile)?.length);
const coll = { n: 0, vert() { this.n++; } }; api.fenceCollide(coll, tile, false); console.log('fence coll verts', coll.n);
api.addClutter('x', 'roof_vents', 0, 0, 0, 0, 1);
console.log(api.stats());
process.exit(0);
