// game.placement: ONE shared rule for "may something stand here?" (user, Nov 18: houses, rocks, plants and props kept landing
// in roads; fix the system, not each spot). Every placer (vegetation fields, house lots, yard dressing, parked cars, props)
// asks the same questions, so a new map layout cannot put things in the street again.
//   onRoad(x, z, r = 0)   -> true when a disk of radius r touches a drivable carriageway (driveways, dirt, service and
//                            footpaths excepted: things may border those)
//   inWater(x, z)          -> true over sea / lakes / canals
//   blocked(x, z, r, opts) -> onRoad || inWater (opts.water === false skips the water test, for mangroves and docks)
//   footprintOnRoad(x, z, ry, w, d) -> any corner / edge midpoint / center of a w x d box (heading ry) on a carriageway
// Turn off with ?placement=0 (A/B).
export const order = 5;   // before the world dressers and the vegetation fields
const SOFT = /service|track|path|driveway|footway|dirt|cycleway|steps|pedestrian/;
export async function initV2(game) {
  const OFF = typeof location !== 'undefined' && /[?&]placement=0\b/.test(location.search);
  const RG = () => game.miamiData?.roadGraph || game.city?.roadGraph || null, _o = {};
  function onRoad(x, z, r = 0) {
    if (OFF || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    const G = RG(); if (!G?.nearestEdge) return false;
    try { const e = G.nearestEdge(x, z, _o, 25); if (!e || !e.edge) return false;
      if (SOFT.test(String(e.edge.kind || ''))) return false;
      return e.dist < (e.edge.width || 6) / 2 + r - 0.15;
    } catch (e) { return false; }
  }
  function inWater(x, z) { if (OFF) return false; try { return !!game.city?.isWater?.(x, z); } catch (e) { return false; } }
  function blocked(x, z, r = 0, opts = {}) { return onRoad(x, z, r) || (opts.water !== false && inWater(x, z)); }
  function footprintOnRoad(x, z, ry, w, d) {
    const c = Math.cos(ry || 0), s = Math.sin(ry || 0);
    for (const [uu, vv] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0], [0, 0]]) {
      const u = uu * w, v = vv * d; if (onRoad(x + c * u + s * v, z - s * u + c * v)) return true;
    }
    return false;
  }
  game.placement = { onRoad, inWater, blocked, footprintOnRoad, off: OFF };
}
