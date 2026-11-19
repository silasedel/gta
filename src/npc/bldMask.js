// Building footprints for people on foot (smart-peds pass, Nov 19; user: "they walk through buildings").
// The surface raster and the wall rays only see some buildings (the rays need loaded colliders, so the far crowd was
// blind), and footpaths / lot lines of the road graph run straight through the library building models. Here every
// map building ring of a data tile is rasterized once into a 1 m bitmap, so "is this spot inside a building?" is one
// array read anywhere on the map, for both tiers.
//   const mask = createBuildingMask(game);
//   mask.inside(x, z)                    -> true on a building footprint (unknown tiles count as free)
//   mask.segmentFree(x0, z0, x1, z1)     -> the straight line never enters a footprint
//   mask.lastFree(x0, z0, x1, z1)        -> how far (0..1) one can walk along the line before the first footprint

const RES = 1; // m per mask cell
const RAISED = 2.5; // building parts that start higher than this (canopies, sky bridges) leave the ground free

/** Fill the cells of one ring (even-odd scanline at cell centers) into a tile mask. */
function fillRing(mask, n, x0, z0, ring) {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of ring) {
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const j0 = Math.max(0, Math.floor((minZ - z0) / RES));
  const j1 = Math.min(n - 1, Math.floor((maxZ - z0) / RES));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = z0 + (j + 0.5) * RES;
    xs.length = 0;
    for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
      const a = ring[i];
      const b = ring[k];
      if (a[1] > z !== b[1] > z) {
        xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / RES - 0.5));
      const i1 = Math.min(n - 1, Math.floor((xs[q + 1] - x0) / RES - 0.5));
      for (let i = i0; i <= i1; i++) {
        mask[j * n + i] = 1;
      }
    }
  }
}

export function createBuildingMask(game) {
  const tiles = new Map(); // tile key -> Uint8Array, or null for a tile without buildings
  const tileSize = () => game.miamiData?.tileSize || game.city?.streamer?.tileSize || 200;

  // the mask of one data tile; undefined while the tile's data is not in memory yet
  function tileMask(tx, tz) {
    const key = tx * 65536 + tz;
    const hit = tiles.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const D = game.miamiData;
    if (!D?.getTile) {
      return undefined;
    }
    let tile;
    try {
      tile = D.getTile(tx, tz);
    } catch (e) {
      return undefined;
    }
    if (tile === undefined) {
      return undefined;
    }
    if (!tile?.buildings?.length) {
      tiles.set(key, null);
      return null;
    }
    const TS = tileSize();
    const n = Math.ceil(TS / RES);
    const mask = new Uint8Array(n * n);
    for (const b of tile.buildings) {
      const ring = b.rings?.[0];
      if (!ring || ring.length < 3 || (b.minH || 0) > RAISED) {
        continue;
      }
      fillRing(mask, n, tx * TS, tz * TS, ring);
    }
    tiles.set(key, mask);
    return mask;
  }

  function inside(x, z) {
    const TS = tileSize();
    const tx = Math.floor(x / TS);
    const tz = Math.floor(z / TS);
    const m = tileMask(tx, tz);
    if (!m) {
      return false;
    }
    const n = Math.ceil(TS / RES);
    const i = Math.floor((x - tx * TS) / RES);
    const j = Math.floor((z - tz * TS) / RES);
    if (i < 0 || j < 0 || i >= n || j >= n) {
      return false;
    }
    return m[j * n + i] === 1;
  }

  /** fraction (0..1) of the segment that can be walked before it first enters a footprint */
  function lastFree(x0, z0, x1, z1, step = 0.6) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(d / step));
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      if (inside(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k)) {
        return (s - 1) / steps;
      }
    }
    return 1;
  }

  function segmentFree(x0, z0, x1, z1, step = 0.6) {
    return lastFree(x0, z0, x1, z1, step) >= 1;
  }

  // a stream of new tiles would otherwise keep every mask forever (40 KB each)
  function trim(cx, cz, keep = 6) {
    if (tiles.size < 160) {
      return;
    }
    const TS = tileSize();
    const ci = Math.floor(cx / TS);
    const cj = Math.floor(cz / TS);
    for (const key of tiles.keys()) {
      const tx = Math.round(key / 65536);
      const tz = key - tx * 65536;
      if (Math.abs(tx - ci) > keep || Math.abs(tz - cj) > keep) {
        tiles.delete(key);
      }
    }
  }

  return { inside, lastFree, segmentFree, trim };
}
