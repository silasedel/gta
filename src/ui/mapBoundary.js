// PORT SOLANA — hand-made playable-area boundary for the real-scale Miami map (world metres, +X east, +Z south).
// Traced ~18 m outside real street centrelines so the boundary street itself stays on the map:
//   north (mainland): NW/NE 20th Street      west: NW 2nd Avenue -> SW 2nd Avenue
//   south (mainland): SW/SE 13th Street       bay: open water north of the Venetian Islands
//   Miami Beach north: Dade Boulevard + 23rd Street, east: Atlantic, south: water below Fisher Island.
// Corners are rounded with Chaikin smoothing. Returned ring is clockwise on screen.

const RAW = [
  // NW corner, then east along NW/NE 20th Street
  [-3420, -1836], [-3003, -1848], [-2737, -1865], [-2585, -1871], [-2480, -1833], [-2409, -1838],
  // across the bay north of the Venetian Islands to Dade Boulevard
  [-2300, -1842], [900, -1842], [1700, -1522], [2040, -1432],
  // Dade Boulevard (outer side) then 23rd Street to the beach
  [2143, -1470], [2459, -1663], [2980, -1975], [3421, -2241], [3478, -2275], [3540, -2223], [3700, -2160], [3786, -2130],
  // Atlantic
  [4420, -2130], [4420, 2600],
  // water south of Fisher Island / Brickell Key back to the mainland shore at SE 13th Street
  [-1950, 2600], [-2380, 2150], [-2480, 2047],
  // SE / SW 13th Street (south side)
  [-2552, 2034], [-2628, 2016], [-2702, 1936], [-2774, 1940], [-2834, 1944], [-2944, 1947], [-3127, 1953], [-3232, 1958],
  // SW 2nd Avenue (west side) north to Flagler, then NW 2nd Avenue
  [-3268, 1950], [-3266, 1463], [-3271, 1323], [-3276, 1201], [-3284, 1037], [-3288, 815], [-3297, 549],
  [-3299, 490], [-3305, 336], [-3311, 122], [-3317, -90], [-3325, -301], [-3338, -622], [-3384, -662], [-3392, -889],
  [-3401, -1134], [-3406, -1326], [-3411, -1670],
];

function chaikin(ring, iters = 2) {
  let r = ring;
  for (let k = 0; k < iters; k++) {
    const out = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    r = out;
  }
  return r;
}
export const MIAMI_BOUNDARY = chaikin(RAW, 2);

export function boundaryFor(city) {
  if (!city) return null;
  if (Array.isArray(city.mapBoundary) && city.mapBoundary.length > 2) return city.mapBoundary;
  const b = city.bounds, att = String(city.mapLayers?.attribution || city.attribution || '');
  const miami = city.source === 'osm-miami' || /openstreetmap/i.test(att) || (b && b.maxX - b.minX > 6000 && b.minX < -3000);
  return miami ? MIAMI_BOUNDARY : null;
}

export function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function ringBounds(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  return { minX, maxX, minZ, maxZ };
}
