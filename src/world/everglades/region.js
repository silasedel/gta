// Everglades r7: shared helpers for the glades module (district test, water / bank probes, deterministic hashes).
// The glades = the map districts 'Everglades', 'Everglades City' and 'Big Cypress' (same rule as env/gladesWater.js).
const GL = /^(Everglades|Everglades City|Big Cypress)$/;

export function createRegion(game) {
  const city = game.city, SEA = city.seaLevel ?? -0.12;
  const LK = city.terrain?.LAYERS?.map((l) => l.key) || [];
  const dCache = new Map();
  // district test on a 32 m lattice (districtAt is a polygon lookup)
  function inGlades(x, z) {
    const k = Math.round(x / 32) * 100003 + Math.round(z / 32); let v = dCache.get(k);
    if (v === undefined) { v = GL.test(city.districtAt(Math.round(x / 32) * 32, Math.round(z / 32) * 32) || ''); if (dCache.size > 200000) dCache.clear(); dCache.set(k, v); }
    return v;
  }
  // within r m of the glades (8 probes + the point)
  function nearGlades(x, z, r = 400) {
    if (inGlades(x, z)) return true;
    for (let a = 0; a < 8; a++) if (inGlades(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r)) return true;
    return false;
  }
  const isWater = (x, z) => city.isWater(x, z);
  const ground = (x, z) => city.groundHeightAt(x, z, 3);
  const layer = (x, z) => (city.terrain?.layerAt ? LK[city.terrain.layerAt(x, z)] : null);
  const wetLayer = (x, z) => { const k = layer(x, z); return k === 'sawgrass' || k === 'marsh' || k === 'damp'; };
  // the water surface the player sees at (x, z): open water = sea level, the prairie sheet = gladesWater.levelAt, else null
  function waterLevel(x, z) {
    if (isWater(x, z)) return SEA;
    const g = game.gladesWater; if (g?.levelAt) { const v = g.levelAt(x, z); if (v != null && v > ground(x, z) + 0.02) return v; }
    return null;
  }
  // count of water samples on a ring (0..n)
  function waterRing(x, z, r, n = 8) { let w = 0; for (let a = 0; a < n; a++) { const an = (a / n) * Math.PI * 2; if (isWater(x + Math.cos(an) * r, z + Math.sin(an) * r)) w++; } return w; }
  // direction toward the nearest open water from (x, z) within r (unit [dx, dz]) or null
  function towardWater(x, z, r = 14) {
    let sx = 0, sz = 0, n = 0;
    for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an); for (const d of [r * 0.4, r]) if (isWater(x + c * d, z + s * d)) { sx += c; sz += s; n++; } }
    if (!n) return null; const l = Math.hypot(sx, sz) || 1; return [sx / l, sz / l];
  }
  const roadDist = (x, z, max = 80) => { const ne = city.roadGraph?.nearestEdge?.(x, z, {}, max); return ne ? ne.dist - (ne.edge?.width || 7) / 2 : max; };
  return { SEA, GL, inGlades, nearGlades, isWater, ground, layer, wetLayer, waterLevel, waterRing, towardWater, roadDist };
}

// deterministic hash in [0, 1) of two ints and a salt
export function hash2(i, j, s = 0) { const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
// smooth value noise in [0, 1)
export function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}
