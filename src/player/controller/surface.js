// Surface + water queries for the player controller / audio.
// game.surfaceAt(x, z) -> 'concrete'|'asphalt'|'sand'|'grass'|'wood'|'tile'|'metal'|'water'
// Prefers game.city.surfaceAt (CITY agent); falls back to a layout heuristic.

export const SEA_X = 505;

export function seaLevel(game) {
  const c = game.city,
    e = game.env;
  const v = c?.seaLevel ?? c?.waterLine ?? e?.seaLevel;
  return typeof v === 'number' ? v : -0.12;
}

// pier deck (city.js): x 452..640, z 120 ± 5
const onPier = (x, z) => x > 450 && x < 642 && Math.abs(z - 120) < 5.2;

export function createSurfaceAt(game) {
  return function surfaceAt(x, z) {
    const c = game.city;
    if (c?.isWater) {
      if (c.isWater(x, z)) return 'water';
    } // real-map cities: ask the city
    else if (x > SEA_X + 1.5 && !onPier(x, z)) return 'water'; // old grid city fallback only
    let s = null;
    try {
      s = game.city?.surfaceAt?.(x, z);
    } catch (e) {
      s = null;
    }
    if (s) return s;
    try {
      for (const shop of game.interiors?.list || []) {
        if (
          shop.center &&
          Math.abs(shop.center.x - x) < 25 &&
          Math.abs(shop.center.z - z) < 25 &&
          shop.isInside?.({ x, y: 0.5, z })
        )
          return 'tile';
      }
    } catch (e) {
      /* ignore */
    }
    if (onPier(x, z)) return 'wood';
    if (x >= 446 && x <= 452) return 'wood'; // boardwalk
    if (x >= 440) return 'sand';
    const g = game.city?.grid;
    if (g) {
      const hw = (g.roadWidth || 14) / 2;
      for (const rx of g.xs || []) if (Math.abs(x - rx) < hw) return 'asphalt';
      for (const rz of g.zs || []) if (Math.abs(z - rz) < hw) return 'asphalt';
    }
    return 'concrete';
  };
}
