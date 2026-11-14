// Ground claims (track: ground-continuity). Pure module (no THREE): the ground footprints that set pieces draw themselves
// (Nico's yard sheet, set-piece lots), known before any tile is built, so the city builder can end roads cleanly at
// their edge (asphalt -> concrete apron -> the set piece's own drive) instead of running a road ribbon under / over them.
//
//   import { groundClaims } from '.../ground/claims.js'
//   const gc = groundClaims(data.setpieces)
//   gc.at(x, z, pad = 0) -> claim containing (x, z) (within pad metres) or null      claim = { id, ring: [[x, z]...], bb }
//   gc.list
import { PLAN } from '../setpieces/nicoHouse/plan.js';

const pip = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let u = L2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / L2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u; return Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z); };

// house-local rectangle -> world ring (three.js rotation.y = heading: local (x, z) -> (x cos + z sin, -x sin + z cos))
function rectRing(sp, x0, x1, z0, z1) {
  const c = Math.cos(sp.heading || 0), s = Math.sin(sp.heading || 0);
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => [sp.x + lx * c + lz * s, sp.z - lx * s + lz * c]);
}

export function groundClaims(setpieces = []) {
  const list = [];
  for (const sp of setpieces || []) {
    if (!sp || !Number.isFinite(sp.x) || !Number.isFinite(sp.z)) continue;
    let ring = null;
    if (sp.id === 'nico_house') { const L = PLAN.lot; ring = rectRing(sp, L.x0 - 22, L.x1, L.z0, L.z1 + 22); } // the yard sheet drawn by parts/05_site.js
    else if (Array.isArray(sp.lot) && sp.lot.length >= 3) ring = sp.lot.map((p) => [p[0], p[1]]);
    if (!ring) continue;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
    list.push({ id: sp.id, ring, bb: [a, b, c, d] });
  }
  return {
    list,
    at(x, z, pad = 0) {
      for (const cl of list) {
        const [a, b, c, d] = cl.bb; if (x < a - pad || x > c + pad || z < b - pad || z > d + pad) continue;
        if (pip(cl.ring, x, z)) return cl;
        if (pad > 0) for (let i = 0; i < cl.ring.length; i++) if (segD(x, z, cl.ring[i], cl.ring[(i + 1) % cl.ring.length]) <= pad) return cl;
      }
      return null;
    },
  };
}
