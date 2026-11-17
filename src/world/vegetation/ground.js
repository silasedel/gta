// (r2-veg) The ground exactly as it is drawn. The near terrain is a 4 m grid of terrain.heightAt samples (tiles start on multiples
// of 200 m, so the lattice is global), split into triangles along alternating diagonals (terrain.js gridGen: (i + j) odd -> a-c,
// even -> b-d). Placing a trunk on the analytic heightAt between the vertices floats it over every hollow and sinks it under
// every crest; this interpolates the same triangles the renderer and the terrain collider use.
//   meshGround(terrain) -> (x, z) => height of the rendered terrain triangle (a small lattice cache; flush() after a terrain change)
//   triAt(Hij, x, z, cell = 4) -> the same interpolation over any lattice sampler Hij(i, j)
export const MESH_GND = typeof location === 'undefined' || !/[?&]veggnd=0\b/.test(location.search);
export const CELL = 4;

export function triAt(Hij, x, z, cell = CELL) {
  const gx = x / cell, gz = z / cell, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const a = Hij(i, j), b = Hij(i + 1, j), c = Hij(i + 1, j + 1), d = Hij(i, j + 1);
  if ((i + j) & 1) return fz >= fx ? a + (c - d) * fx + (d - a) * fz : a + (b - a) * fx + (c - b) * fz; // diagonal a-c
  return fx + fz <= 1 ? a + (b - a) * fx + (d - a) * fz : c + (d - c) * (1 - fx) + (b - c) * (1 - fz); // diagonal b-d
}

const _byTerrain = new WeakMap();
export function meshGround(terrain) {
  if (!terrain || !terrain.heightAt) return (x, z) => 0;
  let f = _byTerrain.get(terrain); if (f) return f;
  const cache = new Map();
  const Hij = (i, j) => { const k = i * 100003 + j; let h = cache.get(k); if (h === undefined) { if (cache.size > 60000) cache.clear(); h = terrain.heightAt(i * CELL, j * CELL); cache.set(k, h); } return h; };
  f = MESH_GND ? (x, z) => triAt(Hij, x, z) : (x, z) => terrain.heightAt(x, z);
  f.flush = () => cache.clear();
  f.raw = (x, z) => triAt((i, j) => terrain.heightAt(i * CELL, j * CELL), x, z); // uncached (change detection)
  _byTerrain.set(terrain, f); return f;
}
