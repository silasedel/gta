// Shared footprint / occupancy index for static world placement (track: clipping sweep).
// Every static placer (city tile props, world-dressing, set pieces) registers its solid props here and asks before placing,
// so poles, palms, lamps, signs, benches, bins and hydrants never stand inside each other.
//   import { occupancy } from '../ground/occupancy.js';
//   const h = occupancy.add({ x, z, r, y, h, kind, src, owner });       // r: footprint radius (m), y: base, h: height
//   occupancy.blocked(x, z, r, { y, h, gap, crown, pole, soft, spacing: { kinds: Set, d } })            // -> the first conflicting item or null
//   occupancy.free(x, z, r, opts, tries)                                 // -> [x, z] nudged to the nearest free spot or null
//   occupancy.removeOwner(owner)                                         // a streamed tile leaves: drop its items
// Items with crown: { r, y0 } (palms / trees) also block tall poles from standing inside the canopy.
const CELL = 4;
const grid = new Map();
const byOwner = new Map();
const key = (i, j) => i * 100003 + j;
let count = 0;

function cellsOf(it) {
  const R = Math.max(it.r, it.crown ? it.crown.r : 0) + 0.5, out = [];
  for (let i = Math.floor((it.x - R) / CELL); i <= Math.floor((it.x + R) / CELL); i++) for (let j = Math.floor((it.z - R) / CELL); j <= Math.floor((it.z + R) / CELL); j++) out.push(key(i, j));
  return out;
}

export const occupancy = {
  add(it) {
    if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.z)) return null;
    it.y = it.y ?? 0; it.h = it.h ?? 2; it.r = it.r ?? 0.3;
    it._cells = cellsOf(it);
    for (const k of it._cells) { let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(it); }
    if (it.owner !== undefined) { let s = byOwner.get(it.owner); if (!s) byOwner.set(it.owner, (s = [])); s.push(it); }
    count++;
    return it;
  },
  remove(it) {
    if (!it || !it._cells) return;
    for (const k of it._cells) { const a = grid.get(k); if (!a) continue; const i = a.indexOf(it); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) grid.delete(k); }
    it._cells = null; count--;
  },
  removeOwner(owner) {
    const s = byOwner.get(owner); if (!s) return;
    for (const it of s) occupancy.remove(it);
    byOwner.delete(owner);
  },
  // first item whose footprint (plus gap) overlaps the circle (x, z, r) at overlapping heights; tall props (pole: true) also
  // conflict with crowns, and a crowned item conflicts with registered poles under its canopy
  blocked(x, z, r, o = {}) {
    const y = o.y ?? 0, h = o.h ?? 2, gap = o.gap ?? 0.1;
    const R = r + 6, i0 = Math.floor((x - R) / CELL), i1 = Math.floor((x + R) / CELL), j0 = Math.floor((z - R) / CELL), j1 = Math.floor((z + R) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = grid.get(key(i, j)); if (!a) continue;
      for (const it of a) {
        if (it === o.ignore || (o.owner !== undefined && it.owner === o.owner && o.sameOwnerOk)) continue;
        if (o.soft && it.soft) continue;
        const d = Math.hypot(it.x - x, it.z - z);
        if (d < it.r + r + gap && !(it.y + it.h < y || y + h < it.y)) return it;
        if (o.spacing && o.spacing.kinds.has(it.kind) && d < o.spacing.d) return it; // no two lamp / utility poles side by side
        if (o.pole && it.crown && y + h > it.crown.y0 && d < it.crown.r) return it;
        if (o.crown && it.pole && it.y + it.h > o.crown.y0 && d < o.crown.r) return it;
      }
    }
    return null;
  },
  // nearest free spot on a small spiral (0.5 m steps up to maxShift), optional accept(x, z) filter (road / building / water)
  free(x, z, r, o = {}, maxShift = 1.5, accept = null) {
    if ((!accept || accept(x, z)) && !occupancy.blocked(x, z, r, o)) return [x, z];
    const dir = o.dir; // preferred axis [dx, dz] (along the curb): try along it first
    for (let s = 0.5; s <= maxShift + 1e-6; s += 0.5) {
      const tries = dir ? [[dir[0], dir[1]], [-dir[0], -dir[1]]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
      for (const [dx, dz] of tries) { const nx = x + dx * s, nz = z + dz * s; if (accept && !accept(nx, nz)) continue; if (!occupancy.blocked(nx, nz, r, o)) return [nx, nz]; }
    }
    return null;
  },
  items() { const out = new Set(); for (const a of grid.values()) for (const it of a) out.add(it); return [...out]; },
  stats() { return { items: count, cells: grid.size, owners: byOwner.size }; },
};
if (typeof globalThis !== 'undefined') globalThis.__southlineOccupancy = occupancy;
