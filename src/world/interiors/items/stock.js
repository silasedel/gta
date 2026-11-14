// Stocking helpers: fill shelves, pegs, stacks and trays with real items (every one its own slot), with shelf-edge price tags.
// All coordinates are in the current ctx.G frame; items face +z (toward the shopper).
import { getProduct, productSize } from './catalog.js';

// One shelf level. Front edge at z = zf, shelf surface at y, usable depth `depth`.
// o: { fill (0..1 stock level), rows (deep), block (m of facings per product), zone, host, tags (false = none), lay, tagY, jitter }
export function shelfRun(ctx, x0, x1, y, zf, depth, pids, o = {}) {
  if (!pids || !pids.length) return; const R = ctx.R, G = ctx.G, fill = o.fill ?? ctx.profile.stock, rowsMax = o.rows ?? 3; let x = x0 + 0.012, k = o.start ?? 0, guard = 0;
  while (x < x1 - 0.04 && guard++ < 200) {
    const pid = pids[k++ % pids.length], p = getProduct(pid); if (!p) continue; const sz = productSize(pid), w = sz.w + Math.max(0.006, sz.w * 0.06), n = Math.max(1, Math.min(6, Math.round((o.block ?? 0.3) / w))), bx = x; let placed = 0; const soldOut = R() > fill + 0.05 && R.chance(0.55);
    for (let f = 0; f < n && x + w <= x1 - 0.005; f++) { let front = null; const sold = R() > fill ? 1 + (R() < 0.3 ? 1 : 0) : 0; // shopped-down facings: the front item(s) are gone
      for (let r = 0; r < rowsMax; r++) { const z = zf - 0.012 - sz.d / 2 - r * (sz.d + 0.005); if (zf - z + sz.d / 2 > depth) break; if (r < sold || soldOut) continue; const messy = R.chance(0.1), tipped = r === 0 && R.chance(0.012) && sz.h > sz.w * 1.3, odd = r === 0 && R.chance(0.02) ? pids[(k + 1) % pids.length] : pid; const s = ctx.item(odd, x + w / 2 + R.jit(messy ? 0.012 : 0.003), y + (tipped ? sz.w / 2 : 0), z + R.jit(0.004) - (R.chance(0.14) ? R() * 0.05 : 0), tipped ? Math.PI / 2 + R.jit(0.4) : R.jit(messy ? 0.55 : (o.jitter ?? 0.07)), { rz: tipped ? Math.PI / 2 : 0, row: r, gain: 1 - Math.min(0.5, r * 0.2) - (o.shade || 0), zone: o.zone, host: o.host }); if (s) { s.front = front; front = s; } }
      x += w; placed++; }
    if (placed && o.tags !== false) { const t = ctx.prints.tag(pid); G.plane(t.mat, (bx + x) / 2 - 0.004, y + (o.tagY ?? -0.02), zf + 0.0035, 0.046, 0.029, { uvRect: t.rect }); }
    if (!placed) break;
  }
}
// hanging pegs on a back panel at z = zb (pouches, blister packs): cols x rows of hooks, each `deep` items
export function pegRun(ctx, x0, x1, y0, y1, zb, pids, o = {}) {
  const R = ctx.R, G = ctx.G, hook = ctx.M.flat('#c9ccd0', { metal: 0.8, rough: 0.35 }); let k = 0;
  for (let y = y1; y > y0 + 0.12;) { const rowP = pids[k % pids.length], h = productSize(rowP).h; y -= h + 0.045; if (y < y0) break; let x = x0 + 0.02;
    while (x < x1 - 0.05) { const pid = pids[k++ % pids.length], sz = productSize(pid), w = sz.w + 0.02; if (x + w > x1) break; G.cyl(hook, x + w / 2, y + sz.h - 0.012, zb + 0.07, 0.0025, 0.14, { rx: Math.PI / 2, seg: 5 });
      let front = null; const n = o.deep ?? 4, sold = R() > (o.fill ?? ctx.profile.stock) ? R.int(1, 2) : 0; for (let r = n - 1; r >= 0; r--) { if (n - 1 - r < 0) continue; const row = n - 1 - r; if (row < sold) continue; const s = ctx.item(pid, x + w / 2, y, zb + 0.13 - row * 0.026, R.jit(0.05), { row, gain: 1 - row * 0.12, rx: R.jit(0.04), zone: o.zone }); if (s) { s.front = front; front = s; } }
      const t = ctx.prints.tag(pid); G.plane(t.mat, x + w / 2, y + sz.h + 0.012, zb + 0.142, 0.04, 0.025, { uvRect: t.rect }); x += w; } }
}
// floor stack of cases or bags: nx x nz footprint, up to `high` layers, ragged top
export function stack(ctx, pid, x, y, z, nx, nz, high, o = {}) { const R = ctx.R, sz = productSize(pid); let below = [];
  for (let l = 0; l < high; l++) { const here = []; for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (l > 0 && !below[i * nz + j]) continue; if (l === high - 1 && R() > (o.fill ?? 0.6)) continue; const s = ctx.item(pid, x + (i - (nx - 1) / 2) * (sz.w + 0.008) + R.jit(0.006), y + l * (sz.h + 0.002), z + (j - (nz - 1) / 2) * (sz.d + 0.008) + R.jit(0.006), R.jit(0.03) + (o.ry || 0), { zone: o.zone, row: 0 }); here[i * nz + j] = s; if (s && below[i * nz + j]) { below[i * nz + j].row = 1; below[i * nz + j].front = s; } } below = here; } }
