// r2-perf for r2-ground (ocean.js buildShore): the "every cell the water mask calls land" fill, same result, much less
// main-thread work. The old loop called city.isWater for each of ~2.4 M shore-grid cells, and every open-water cell ran
// the full sliver / pocket rules (dozens of grid probes each).
// A raw-water cell can only turn into land through those rules when raw land lies within 72 m (pocket: land in all 8
// directions within 72 m; sliver: land on both sides within 30 m). So: one cheap raw lookup per cell, a chamfer distance
// to raw land, and the full isWater only for cells that are raw land or within REACH of it. Every other cell is open
// water by the same rules (only a raw-land speck smaller than one shore cell could be missed, and a single speck can
// never make a pocket or a sliver, which need land on two or more sides).
// Usage inside buildShore (replaces the isWater loop; yields like the old one):
//   yield* fillLandFromWater(land, W, H, minX, minZ, cell, city.isWater, game.miamiData?.isWaterRaw);
// Without isWaterRaw it falls back to the old per-cell loop.
const REACH = 72 + 30; // pocket reach + sliver reach, metres (generous: either rule alone needs at most 72 m)

export function* fillLandFromWater(land, W, H, minX, minZ, cell, isWater, isWaterRaw, stats = null) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let calls = 0;
  if (typeof isWaterRaw !== 'function') {
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) { const k = j * W + i; if (!land[k]) { calls++; if (!isWater(minX + (i + 0.5) * cell, minZ + (j + 0.5) * cell)) land[k] = 1; } }
      if (j % 2 === 1) yield;
    }
    if (stats) { stats.calls = calls; stats.ms = performance.now() - t0; stats.fast = false; }
    return;
  }
  // 1. raw land at the cell centre (cheap grid lookup) -> chamfer distance in cells (two passes)
  const INF = 65000, d = new Uint16Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = minZ + (j + 0.5) * cell;
    for (let i = 0; i < W; i++) d[j * W + i] = isWaterRaw(minX + (i + 0.5) * cell, z) ? INF : 0;
    if (j % 8 === 7) yield;
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i; let v = d[k]; if (v === 0) continue;
      if (i > 0 && d[k - 1] + 1 < v) v = d[k - 1] + 1;
      if (j > 0) { if (d[k - W] + 1 < v) v = d[k - W] + 1; if (i > 0 && d[k - W - 1] + 1 < v) v = d[k - W - 1] + 1; if (i < W - 1 && d[k - W + 1] + 1 < v) v = d[k - W + 1] + 1; }
      d[k] = v;
    }
  }
  yield;
  for (let j = H - 1; j >= 0; j--) {
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i; let v = d[k]; if (v === 0) continue;
      if (i < W - 1 && d[k + 1] + 1 < v) v = d[k + 1] + 1;
      if (j < H - 1) { if (d[k + W] + 1 < v) v = d[k + W] + 1; if (i < W - 1 && d[k + W + 1] + 1 < v) v = d[k + W + 1] + 1; if (i > 0 && d[k + W - 1] + 1 < v) v = d[k + W - 1] + 1; }
      d[k] = v;
    }
  }
  yield;
  // chessboard distance in cells under-estimates nothing: a cell farther than REACH in metres is farther in cells too
  const lim = Math.ceil(REACH / cell) + 2;
  // 2. full rule only where it can matter
  for (let j = 0; j < H; j++) {
    const z = minZ + (j + 0.5) * cell;
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (land[k] || d[k] > lim) continue;
      calls++;
      if (!isWater(minX + (i + 0.5) * cell, z)) land[k] = 1;
    }
    if (j % 4 === 3) yield;
  }
  if (stats) { stats.calls = calls; stats.ms = performance.now() - t0; stats.fast = true; stats.cells = W * H; }
}
