// Residential lot API (track: houses). Shared by the house generator and any system that needs to know where houses
// and their yards are: dressing, ground, traffic, peds. Pure module (no THREE), safe to import from the city builder.
//
//   import { lots } from '.../setpieces/houses/lots.js'      (also published as game.lots once the houses module runs)
//   lots.claims(b)             -> true when a map building footprint is drawn by the house generator instead of the city
//                                 builder (pure: depends only on the building record, so tiles built before the houses module
//                                 starts agree with it). The city builder skips claimed footprints in its near build and colliders.
//   lots.add(lot) / lots.remove(id)
//   lots.near(x, z, r, out?)   -> lots whose rectangle comes within r of (x, z)
//   lots.at(x, z)              -> the lot containing (x, z) or null
//   lots.isFree(x, z, r = 0)   -> true when no lot rectangle comes within r of (x, z)   (use before placing your own houses / props)
//   lots.list                  -> Map id -> lot
// lot = { id, x, z, y, heading (yaw of the lot's +Z = street side), w (across), d (deep), front (distance from the lot
//         centre to the front line), roadGap (front line -> road edge), style, source: 'street' | 'map', buildingId?, seed }
// Lot rectangles are flush with the terrain (no raised pads). The driveway and walk run from the house to the road edge.

const CELL = 64;
const grid = new Map();
const key = (i, j) => i * 100003 + j;

function rectCorners(l) {
  const c = Math.cos(l.heading), s = Math.sin(l.heading), hw = l.w / 2, hd = l.d / 2;
  // local +X = (cos h, -sin h), local +Z = (sin h, cos h)
  return [[-hw, -hd], [hw, -hd], [hw, hd + (l.roadGap || 0)], [-hw, hd + (l.roadGap || 0)]].map(([u, v]) => [l.x + c * u + s * v, l.z - s * u + c * v]);
}
function cellsOf(l) {
  const cs = rectCorners(l); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of cs) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  l._bb = [x0, x1, z0, z1];
  const out = [];
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) out.push(key(i, j));
  return out;
}
// distance from (x, z) to the lot rectangle (0 inside); the strip to the road (driveway apron) counts as part of the lot
function distTo(l, x, z) {
  const dx = x - l.x, dz = z - l.z, c = Math.cos(l.heading), s = Math.sin(l.heading);
  const u = dx * c - dz * s, v = dx * s + dz * c, hw = l.w / 2, hd = l.d / 2;
  const v0 = -hd, v1 = hd + (l.roadGap || 0);
  const du = Math.max(0, Math.abs(u) - hw), dv = v < v0 ? v0 - v : v > v1 ? v - v1 : 0;
  return Math.hypot(du, dv);
}

// ?nohouses in the page URL turns the generator off (A/B measurements): the city and world-dressing draw their own boxes again
const OFF = typeof location !== 'undefined' && /[?&]nohouses\b/.test(location.search || '');
export const lots = {
  enabled: !OFF,
  list: new Map(),
  // ---- map footprints the generator draws (city builder skips them) ----
  claims(b) {
    if (!lots.enabled || !b || b.part || !b.rings || b.rings.length !== 1) return false;
    if (b._houseClaim !== undefined) return b._houseClaim;
    const r = b.rings[0], st = b.style, a = b.area || 0;
    const ok = (st === 'house' || st === 'stilt') && (!b.zone || b.zone === 'residential') && r.length >= 4 && r.length <= 16 &&
      a >= 45 && a <= 420 && (b.h || 0) <= 11.5 && !(b.storefronts && b.storefronts.length) && !b.storefront && !(b.minH > 3.2);
    b._houseClaim = ok;
    return ok;
  },
  add(l) {
    if (lots.list.has(l.id)) lots.remove(l.id);
    l._cells = cellsOf(l); lots.list.set(l.id, l);
    for (const k of l._cells) { let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(l); }
    return l;
  },
  remove(id) {
    const l = lots.list.get(id); if (!l) return;
    for (const k of l._cells || []) { const a = grid.get(k); if (!a) continue; const i = a.indexOf(l); if (i >= 0) a.splice(i, 1); if (!a.length) grid.delete(k); }
    lots.list.delete(id);
  },
  near(x, z, r, out = []) {
    out.length = 0; const seen = new Set();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const a = grid.get(key(i, j)); if (!a) continue;
      for (const l of a) { if (seen.has(l)) continue; seen.add(l); if (distTo(l, x, z) <= r) out.push(l); }
    }
    return out;
  },
  at(x, z) { const a = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (a) for (const l of a) if (distTo(l, x, z) === 0) return l; return null; },
  isFree(x, z, r = 0) { return lots.near(x, z, r, []).length === 0; },
  corners: rectCorners,
  distTo,
};
