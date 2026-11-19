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
import { occupancy } from './ground/occupancy.js';
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
  // parkOk(x, z, heading, L, W, edge?) -> may a car be parked here? (user: parked cars inside bushes, one in the middle of a narrow
  // Keys lane). False when the box touches water, a drawn bush / hedge (the city's bush index, the shrub zones near the player and
  // every drawn library shrub instance), or when the street it stands on is too narrow to keep a travel lane free beside it
  // (two-way < 7.4 m, one-way < 5.6 m: a curb spot there blocks the lane, the car parks elsewhere)
  function narrow(edge) { if (!edge) return false; const w = edge.width || 6; return edge.oneway ? w < 5.6 : w < 7.4; }
  function bushAt(x, z, pad) {
    let b = 0; try { b = game.city?.bushAt?.(x, z, pad) || 0; } catch (e) { /* */ }
    if (b <= 0) { try { b = game.vegetation?.shrubNear?.(x, z, pad) || 0; } catch (e) { /* */ } }
    return b;
  }
  const MF_OFF = (typeof location !== 'undefined' && /[?&]mapfix=0\b/.test(location.search)); // ?mapfix=0 = old (audit before / after)
  function parkOk(x, z, heading = 0, L = 4.8, W = 2.0, edge = null) {
    if (OFF || MF_OFF) return true;
    if (edge && narrow(edge)) return false;
    const c = Math.cos(heading), s = Math.sin(heading);
    for (const [a, b] of [[0, 0], [W / 2, L / 2], [-W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2], [W / 2, 0], [-W / 2, 0], [0, L / 2], [0, -L / 2]]) {
      const px = x + a * c + b * s, pz = z - a * s + b * c;
      if (inWater(px, pz) || bushAt(px, pz, 0.6) > 0) return false;
    }
    return true;
  }
  // spotOk(x, z, heading, L, W, opts) -> parkOk + no registered solid (occupancy index: house walls / decks / stairs / piles,
  // utility and lamp poles, palms and trees, mailboxes and carts) inside the car box (r8, user: a van parked on a utility pole,
  // cars boxed in by bins, a mailbox through the stairs). opts.y = ground height (default terrain), opts.ignoreOwner.
  // clearSpot(x, z, heading, L, W, maxShift = 6) -> [x, z] of the nearest OK spot (along the car first, then sideways) or null
  function spotOk(x, z, heading = 0, L = 4.8, W = 2.0, o = {}) {
    if (OFF) return true;
    if (!parkOk(x, z, heading, L, W, o.edge || null)) return false;
    const c = Math.cos(heading), s = Math.sin(heading), r = W / 2 * 0.95, n = Math.max(1, Math.ceil((L - W) / (r * 1.2)) + 1);
    let y = o.y; if (!Number.isFinite(y)) { try { y = game.city?.terrain?.heightAt?.(x, z) ?? 0; } catch (e) { y = 0; } }
    for (let i = 0; i < n; i++) { const b = n > 1 ? -(L - W) / 2 + (L - W) * i / (n - 1) : 0, px = x + b * s, pz = z + b * c;
      const it = occupancy.blocked(px, pz, r, { y: y + 0.1, h: 1.5, gap: 0.15, owner: o.ignoreOwner, sameOwnerOk: o.ignoreOwner !== undefined });
      if (it && !(it.soft && o.soft !== false)) return false; }
    return true;
  }
  function clearSpot(x, z, heading = 0, L = 4.8, W = 2.0, maxShift = 6, o = {}) {
    if (spotOk(x, z, heading, L, W, o)) return [x, z];
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    for (let d = 0.75; d <= maxShift + 1e-6; d += 0.75) for (const [ax, az] of [[fx, fz], [-fx, -fz], [rx, rz], [-rx, -rz]]) {
      const px = x + ax * d, pz = z + az * d; if (onRoad(px, pz, W / 2) && !o.road) continue; if (spotOk(px, pz, heading, L, W, o)) return [px, pz]; }
    return null;
  }
  game.placement = { onRoad, inWater, blocked, footprintOnRoad, parkOk, spotOk, clearSpot, narrow, occupancy, off: OFF };
}
