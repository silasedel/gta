// (r2-veg, item 16) Nico's street outside his lot, after the front-deck mock-up (docs/v2/plan/nico_house/0_front_deck_mockup.webp):
// red poinciana canopies down the north leg past the STOP junction and across the east leg, tall palms behind the white cottage,
// the dense green mass right of the drive past the west lot line (sea grape / rubber fig / shade tree with ferns and palmettos at
// their feet), tropical foliage and palms along the left neighbor's frontage. Inside the lot (house-local x -24..11.4, z -14.2..27)
// the planting is r2-keys' (src/world/setpieces/nicoHouse/yard.data.js PLANTING).
// Coordinates are Nico's house-local frame (game.nicoHouse.toWorld): +z toward the east leg, the STOP junction J at (-20.9, 23.8).
// Every spot is checked with game.vegetation.clearAt (roads, buildings, decks, solids) and skipped when taken.
import * as THREE from 'three';
import { plantable } from './lotPlanting.js';

const J = [-20.9, 23.8], N = [-0.541, 0.841], P = [0.841, 0.541]; // north leg direction from J, its perpendicular (+ = left of the mock-up view)
const nl = (t, o) => [J[0] + N[0] * t + P[0] * o, J[1] + N[1] * t + P[1] * o];
// [model key, house-local x, z, scale]
export const NICO_STREET = [
  // red poinciana canopies down the north leg (mock-up: the red crowns over the far street, both sides)
  ['poinciana_c', ...nl(15, -9), 1.15], ['poinciana', ...nl(27, -10.5), 1.1], ['poinciana_b', ...nl(40, -9.5), 1.05],
  ['poinciana', ...nl(21, 9.5), 1.0], ['poinciana_c', ...nl(36, 10.5), 1.1], ['poinciana_c', ...nl(14, 8), 1.15], ['poinciana_b', ...nl(19, -8), 1.1],
  // across the east leg (z > 31): the red crown above the stop sign, a shade tree, palms behind the white cottage (-14.8, 44.2)
  ['poinciana_c', -7.5, 39.5, 1.1], ['shade_tree', 4.5, 41.0, 0.95], ['poinciana_b', 13.0, 38.5, 1.0],
  ['coconut_palm', -19.0, 51.0, 1.1], ['coconut_c', -11.5, 52.5, 1.05], ['coconut_palm', -6.0, 49.5, 0.95], ['sabal_palm', -23.5, 47.0, 1.0],
  ['green_shrub', -3.0, 34.8, 1.3], ['bougainvillea', -10.0, 34.6, 1.2], ['hibiscus', 8.0, 34.5, 1.1], ['green_shrub', 16.0, 34.8, 1.2],
  // the dense green mass right of the drive, past the west lot line and around the roll-off (-29.4, 19.6)
  ['rubber_fig', -33.5, 22.5, 1.25], ['shade_tree', -38.0, 14.0, 1.05], ['rubber_fig', -31.0, 9.5, 1.2], ['green_shrub', -27.5, 13.5, 1.5],
  ['green_shrub', -33.0, 17.0, 1.6], ['green_shrub', -36.5, 25.5, 1.5], ['bush_round', -30.5, 27.0, 1.6], ['tropical_bed', -28.0, 24.5, 1.2],
  ['fern_clump', -29.0, 11.5, 1.3], ['tropical_bed', -35.0, 8.0, 1.3], ['sabal_palm', -40.5, 21.0, 1.0], ['coconut_c', -42.0, 6.0, 1.05],
  ['poinciana', -44.0, 28.5, 1.05],
  // the left neighbor's frontage (mock-up left: tall tropical foliage and palms beside the deck)
  ['tropical_bed', 14.0, 22.5, 1.35], ['tropical_bed', 16.5, 17.0, 1.25], ['coconut_palm', 15.5, 12.0, 1.1], ['fan_palm', 19.0, 23.5, 0.95],
  ['bougainvillea', 13.5, 25.6, 1.25], ['green_shrub', 18.0, 8.0, 1.3], ['tropical_palm', 21.0, 15.5, 1.0],
  // r2-keys' deck-sheet density list (lead review): cottage hedge and canopy, far street edge, the tree wall past J, the mass behind the roll-off, the skyline
  ['green_shrub', -21.5, 36.6, 1.00], ['green_shrub', -19.8, 36.6, 1.00], ['green_shrub', -18.1, 36.6, 1.00], ['green_shrub', -16.4, 36.6, 1.00], ['green_shrub', -14.7, 36.6, 1.00], ['green_shrub', -13.0, 36.6, 1.00], ['green_shrub', -11.3, 36.6, 1.00], ['green_shrub', -9.6, 36.6, 1.00], ['green_shrub', -8.0, 36.6, 1.00], ['tropical_bed', -22.5, 38.0, 1.35], ['tropical_bed', -7.0, 38.2, 1.30], ['tropical_bed', -22.0, 49.5, 1.30], ['tropical_bed', -7.5, 49.0, 1.25], ['shade_tree', -19.5, 46.5, 1.10], ['shade_tree', -10.5, 47.5, 1.00], ['tropical_bed', -5.5, 35.6, 1.30], ['hibiscus', -3.0, 35.3, 1.20], ['tropical_bed', 1.0, 35.8, 1.30], ['hibiscus', 3.5, 35.4, 1.15], ['tropical_bed', 5.8, 36.2, 1.25], ['green_shrub', -2.0, 38.0, 1.70], ['rubber_fig', 0.5, 39.0, 1.25], ['shade_tree', -1.0, 41.5, 1.05], ['green_shrub', -27.0, 28.0, 1.60], ['rubber_fig', -28.5, 30.5, 1.35], ['green_shrub', -26.0, 33.0, 1.50], ['shade_tree', -30.0, 33.5, 1.10], ['green_shrub', -29.5, 27.0, 1.50], ['fern_clump', -25.5, 29.5, 1.40], ['rubber_fig', -33.5, 19.5, 1.35], ['green_shrub', -34.0, 22.5, 1.70], ['green_shrub', -33.0, 24.5, 1.50], ['shade_tree', -36.5, 21.0, 1.15], ['tropical_bed', -32.0, 17.5, 1.30], ['coconut_palm', 3.0, 37.5, 1.10], ['tropical_palm', -4.0, 38.5, 1.05], ['green_shrub', 0.5, 37.0, 1.50], ['tropical_bed', 3.5, 35.0, 1.30], ['shade_tree', -18.0, 58.0, 1.20], ['banyan_b', -12.0, 62.0, 1.00], ['coconut_palm', -15.0, 55.0, 1.15], ['poinciana_c', -20.0, 66.0, 1.15], ['coconut_c', -9.5, 58.5, 1.10],
];

// a static collider 0.6-25 m above the ground here (house, stilts, roof, fence, deck, roll-off)?
let _ray = null;
function occupied(game, x, z, r) {
  const W = game.world, R = game.RAPIER, C = game.city; if (!W || !R || !C) return false;
  _ray ||= new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const q = Math.min(r, 0.8); // the trunk's footprint (crowns may overhang a roof or fence, trunks may not stand in one)
  for (const [dx, dz] of [[0, 0], [q, 0], [-q, 0], [0, q], [0, -q]]) {
    const px = x + dx, pz = z + dz, g = C.groundHeightAt(px, pz) || 0; _ray.origin = { x: px, y: g + 25, z: pz };
    let hit = null; try { hit = W.castRay(_ray, 24.75, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS); } catch (e) { return false; }
    if (!hit) continue; const sh = hit.collider?.shape?.type; if (sh === R.ShapeType.Cylinder || sh === R.ShapeType.Capsule || sh === R.ShapeType.Ball) continue; // other trunks / poles
    if (g + 25 - (hit.timeOfImpact ?? hit.toi ?? 25) > g + 0.6) return true; // ground / lot pads (up to 0.6 m) do not count
  }
  return false;
}
// first call: blocks the pole corridor and plants every free spot; later calls (every ~2 s, up to 8 tries) retry the spots that were taken,
// since the street's tiles, colliders and road graph are still streaming in right after the camera arrives
export function plantNicoStreet(game, st = null) {
  const NH = game.nicoHouse, V = game.vegetation; if (!NH?.toWorld || !V?.place) return st;
  const v = new THREE.Vector3();
  if (!st) {
    st = { pending: NICO_STREET.slice(), placed: [], skipped: [], moved: 0, tries: 0 };
    // keep the deck's view to the corner pole with its lamp clear (mock-up): no tree or palm in the corridor x -10.5..-16, z 17..30 (r2-keys)
    for (const [cx, cz, r] of [[-13.2, 18.5, 3.2], [-13.2, 22.0, 3.2], [-13.3, 25.5, 3.2], [-13.3, 29.0, 3.2], [-18.5, 20.5, 2.6]]) { NH.toWorld(v.set(cx, 0, cz)); V.block(v.x, v.z, r); } // + the STOP corner
    for (let z = 33; z <= 60; z += 4.5) { const x = -8.39 - (z - 1.34) * Math.tan(11 / 57.3), r = 1.6 + (z - 33) * 0.06; NH.toWorld(v.set(x, 0, z)); V.block(v.x, v.z, r); } // the sight line on past the pole
  }
  // the deck eye's sight line to the corner pole and on past it (mock-up: the pole with its lamp reads against the far street, no
  // palm or tree behind it): bearing 6-16 deg right of house +z from the eye, 12-80 m out
  const EYE = [-8.39, 1.34], inWedge = (x, z) => { const dz = z - EYE[1], dx = EYE[0] - x, d = Math.hypot(dx, dz); if (d < 12 || d > 80 || dz <= 0) return false; const a = Math.atan2(dx, dz) * 57.3; return a > 6 && a < 16; };
  const left = [];
  for (const row of st.pending) {
    const [key, x, z, s] = row, big = !/palm|shrub|bush|fern|bed|bougain|hibiscus/.test(key), r = (big ? 2.2 : /palm/.test(key) ? 1.0 : 0.9) * s;
    let ok = null; // the spot, or the nearest free one within 4.5 m (keeps the mock-up composition, never inside a house / on a road)
    for (const d of [0, 1.5, 3, 4.5]) { for (let a = 0; a < (d ? 8 : 1); a++) { const lx = x + Math.cos(a * 0.785) * d, lz = z + Math.sin(a * 0.785) * d; NH.toWorld(v.set(lx, 0, lz));
      const isTree = !/shrub|bush|fern|bed|bougain|hibiscus/.test(key); if ((isTree && inWedge(lx, lz)) || !plantable(game, v.x, v.z, isTree)) continue; ok = [v.x, v.z]; if (d) st.moved++; break; } if (ok) break; }
    if (!ok) { left.push(row); continue; }
    const h = V.place(key, ok[0], ok[1], { model: key, s }); if (h.item) st.placed.push(h); else st.skipped.push([key, x, z, h.skipped]);
  }
  st.pending = left; st.tries++;
  if (st.tries >= 8) { for (const row of left) st.skipped.push([row[0], row[1], row[2]]); st.pending = []; }
  return st;
}
