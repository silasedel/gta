// ground-continuity: beach moisture field. Builds, a few milliseconds per frame, the distance from every real-Miami land
// cell (4 m) to the nearest water (0..40 m) and binds it to the city sand material (city.materials.sand, see
// sandMaterial.js): dry pale sand up the beach, a damp darker band and a wet, glossy swash line that breathes with time.
// API: game.beach = { ready, stats }
import * as THREE from 'three';
export const order = 62;

export async function initV2(game) {
  const city = game.city, d = game.miamiData;
  // G4: the surface under the player's feet. Footstep FX, prints and sounds ask game.surfaceAt(x, z) at the player's
  // position; when the feet are clearly above the ground there (a deck, dock, porch, slab) the answer is that structure
  // (wood unless the map says paved), not the sand or dirt below it.
  if (typeof game.surfaceAt === 'function' && !game.surfaceAt._gc) {
    const base = game.surfaceAt;
    const wrapped = (x, z, y) => {
      const s = base(x, z), P = game.player?.position;
      const py = Number.isFinite(y) ? y : P && Math.abs(P.x - x) < 0.6 && Math.abs(P.z - z) < 0.6 ? P.y : null;
      if (py === null || s === 'water') return s;
      let g = null; try { g = city?.groundHeightAt?.(x, z); } catch (e) { g = null; }
      if (!Number.isFinite(g) || py < g + 0.18) return s;
      return s === 'asphalt' || s === 'concrete' || s === 'metal' || s === 'tile' ? s : 'wood';
    };
    wrapped._gc = true; game.surfaceAt = wrapped;
  }
  const sand = city?.materials?.sand?.userData?.sand;
  if (!city || !d || !sand) return;
  const R = d.realRect, CELL = 4, MAXD = 40;
  const x0 = R.minX, z0 = R.minZ, W = Math.ceil((R.maxX - R.minX) / CELL), H = Math.ceil((R.maxZ - R.minZ) / CELL);
  const stats = { W, H, ms: 0, done: false };
  game.beach = { ready: false, stats };
  function* build() {
    const INF = 1e6, dist = new Float32Array(W * H);
    for (let j = 0; j < H; j++) { const z = z0 + (j + 0.5) * CELL; for (let i = 0; i < W; i++) dist[j * W + i] = d.isWater(x0 + (i + 0.5) * CELL, z) ? 0 : INF; if ((j & 7) === 7) yield; }
    const A = CELL, B = CELL * Math.SQRT2;
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) { const i = y * W + x; let v = dist[i]; if (v === 0) continue;
      if (x > 0) v = Math.min(v, dist[i - 1] + A); if (y > 0) { v = Math.min(v, dist[i - W] + A); if (x > 0) v = Math.min(v, dist[i - W - 1] + B); if (x < W - 1) v = Math.min(v, dist[i - W + 1] + B); } dist[i] = v; }
      if ((y & 31) === 31) yield; }
    for (let y = H - 1; y >= 0; y--) { for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let v = dist[i]; if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, dist[i + 1] + A); if (y < H - 1) { v = Math.min(v, dist[i + W] + A); if (x < W - 1) v = Math.min(v, dist[i + W + 1] + B); if (x > 0) v = Math.min(v, dist[i + W - 1] + B); } dist[i] = v; }
      if ((y & 31) === 31) yield; }
    // the waterline sits half a cell into the water: shift so a land cell touching water reads ~2 m
    const out = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) out[i] = Math.min(255, Math.round(Math.max(0, dist[i] - CELL * 0.5) / MAXD * 255));
    const tex = new THREE.DataTexture(out, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    sand.sandShore.value = tex; sand.sandShoreRect.value.set(x0, z0, 1 / (W * CELL), 1 / (H * CELL)); sand.sandShoreOn.value = 1;
    stats.done = true; game.beach.ready = true;
  }
  const job = build();
  let t = 0;
  game.updaters.push((dt) => {
    t += dt; sand.sandTime.value = t;
    if (stats.done) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 4) { if (job.next().done) break; }
    stats.ms += performance.now() - t0;
  });
}
