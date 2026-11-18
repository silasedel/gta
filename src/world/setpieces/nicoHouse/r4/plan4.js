// Nico's house, round 4 (user mock-ups docs/v2/plan/nico_house/r4/01-10): the plan of the rebuilt stilt house, its lawn,
// bulkhead and dock. Single source of truth for every r4 dimension.
//
// FRAME: the STREET frame "S" of the lot (layout.json heading): +X east, +Z south toward the STOP corner and the street,
// -Z north toward the bay pocket. The set piece's group is still turned HOUSE_YAW (yard.data.js and every yard prop, plant
// and car stay in that "yard" frame G); r4 parts build in S and convert with toG / qG below. Yard grade y = 0.
//   G = R(-yaw) S, with R(a)(x, z) = (x cos a + z sin a, -x sin a + z cos a) (three.js rotation about +Y)
// ?nh=r3 = the round-3 house (old parts) for A/B.
export const R4 = typeof location === 'undefined' || !/[?&]nh=r3\b/.test(location.search);
export const YAW = 0.72;   // must match nicoHouse.v2.js HOUSE_YAW
const c = Math.cos(YAW), s = Math.sin(YAW);
// the house sits P4.oz meters along +Z of the lot origin (measureSite: the lawn between the back deck and the bulkhead is ~8.5 m
// wherever the bay really starts); every r4 coordinate is relative to that shifted origin
export const toG = (x, z) => { const zz = z + P4.oz; return [x * c - zz * s, x * s + zz * c]; };          // S -> G
export const toS = (x, z) => [x * c + z * s, -x * s + z * c - P4.oz];                                    // G -> S
export const ryG = (ry) => ry - YAW;                                   // a rotation about Y in S -> in G

export const P4 = {
  oz: 0,
  // the house itself (parts r4_10 / r4_70, frame 'house') is turned 45 deg in the lot about its center: from the main drive you see
  // its front corner with the stair and the wraparound deck, the hoop side faces the +X cove side, the back stair stands at the
  // opposite (bay) corner (user review Nov 18). The lawn, bulkhead and dock stay square to the bay.
  rot: { theta: Math.PI / 4, cx: 0, cz: -7 },
  F: 3.6,                  // floor / deck surface (tall stilts: a car drives under, 02 / 10)
  wallH: 2.6,              // floor to top plate
  wallT: 0.16,             // board-and-batten + studs + interior boards
  body: { x0: -6.5, x1: 6.5, z0: -10.4, z1: -3.6 },
  ridgeZ: -7.0, pitch: 0.42, eave: 0.55, rake: 0.42,
  // wraparound deck (N, E, S) at F; the west end is the house wall
  deckN: { x0: -6.5, x1: 10.6, z0: -12.8, z1: -10.4 },
  deckE: { x0: 6.5, x1: 10.6, z0: -12.8, z1: -1.6 },
  deckS: { x0: -7.8, x1: 10.6, z0: -3.6, z1: -1.6 },
  // posts (whitewashed 10x10 timbers) and beam lines
  postXs: [-6.5, -2.2, 2.2, 6.5, 10.6], postZs: [-12.8, -10.4, -7.0, -3.6, -1.6], post: 0.24,
  beam: { d: 0.29, t: 0.05 }, joist: { d: 0.235, t: 0.045, oc: 0.406 }, board: { w: 0.14, t: 0.035, gap: 0.006 },
  rail: { h: 1.0, post: 0.1, bal: 0.042, oc: 0.12 },
  rise: 0.18, run: 0.28,
  // stairs: west front stair (10: on the left, lattice under it), back stair to the lawn (08: top at the left, down to the right)
  stairW: { x: -7.2, z: -1.6, w: 1.2, n: 19 },        // top nosing center, runs +Z
  stairN: { x: 5.2, z: -13.45, w: 1.2, n: 19, land: { x0: 5.2, x1: 6.6, z0: -14.05, z1: -12.8 } },   // runs -X from the landing
  // ground-floor room under the east end (10: teal board-and-batten, white slider window, hose reel, vine)
  groundRoom: { x0: 2.2, x1: 6.5, z0: -10.4, z1: -3.6, h: 2.85 },
  pavers: { x0: -7.0, x1: 6.6, z0: -11.6, z1: -1.2 },
  // interior (clear spaces at floor level)
  hall: { x0: -0.7, x1: 0.7, z0: -5.6, z1: -3.6 },
  bath: { x0: 0.7, x1: 3.0, z0: -6.3, z1: -3.6 },
  living: { x0: -6.5, x1: -0.7, z0: -10.4, z1: -3.6 },
  kitchen: { x0: 0.7, x1: 4.1, z0: -10.4, z1: -6.3 },
  back: { x0: 4.1, x1: 6.5, z0: -10.4, z1: -3.6 },     // the unfinished stud-wall room (07): Nico's bedroom under renovation
  // lawn terrace, bulkhead, dock (08)
  wallZ: -27.2,            // outer face of the plank bulkhead
  wallX0: -22, wallX1: 15,
  lawnTop: 1.0,            // lawn at the wall: ~1.1 m over the water (08)
  terrace: { z0: -15.5, z1: -23.5, x0: -18, x1: 12, fall: 5 },   // lawn rises from grade at z0 to lawnTop by z1, flat to the wall
  dock: { y: 0.42, w: 1.5, x0: 9.5, x1: -1.0, z: -30.6, gangX: 9.5 },   // long walkway parallel to the wall (from the left in 08)
  plat: { x0: -6.8, x1: -0.6, z0: -33.4, z1: -27.8 },  // square platform in front of the center-right of the house (08)
  colors: {
    teal: 0x4f978c, tealDeep: 0x3c7a72, white: 0xe7e3d6, door: 0x2c2f2e, shutter: 0x4d5552,
    deck: 0xb9b4a9, deckDark: 0x8a857b, post: 0xe2ddd0,
  },
};
// house frame H <-> lot frame S (rotation about the house center)
export const HtoS = (x, z) => { const R = P4.rot, c2 = Math.cos(R.theta), s2 = Math.sin(R.theta), dx = x - R.cx, dz = z - R.cz; return [R.cx + dx * c2 + dz * s2, R.cz - dx * s2 + dz * c2]; };
export const StoH = (x, z) => { const R = P4.rot, c2 = Math.cos(R.theta), s2 = Math.sin(R.theta), dx = x - R.cx, dz = z - R.cz; return [R.cx + dx * c2 - dz * s2, R.cz + dx * s2 + dz * c2]; };
export const inR = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
// Find the bay along -Z (lot frame) with the set piece's waterAt (G frame) and fit the house, lawn, bulkhead and dock to it.
// Called once by part 05 before anything is built. No water found: the defaults (bulkhead 27 m behind the lot origin).
export function measureSite(waterAt) {
  if (P4._measured) return; P4._measured = true; if (!waterAt) return;
  const raw = (x, z) => [x * c - z * s, x * s + z * c]; let zw = null;
  for (let z = -10; z > -60; z -= 0.25) { let n = 0; for (const x of [-6, -3, 0, 3, 6]) if (waterAt(...raw(x, z))) n++; if (n >= 3) { zw = z; break; } }
  if (zw === null) return;
  const oz = Math.max(-6, Math.min(7.5, zw + 21.3)), wall = zw + 0.35 - oz;
  P4.oz = oz; P4.wallZ = wall; P4.terrace.z0 = Math.min(-13.0, wall + 11.7); P4.terrace.z1 = wall + 3.7;
  P4.dock.z = wall - 3.4; P4.plat.z0 = wall - 6.2; P4.plat.z1 = wall - 0.6; P4.measured = { zw, oz, wall };
}
// the lawn raise (S frame, m above grade): 0 at the house, lawnTop along the bulkhead
export function terraceY(x, z) {
  const T = P4.terrace; if (z > T.z0) return 0;
  const t = Math.min(1, (T.z0 - z) / (T.z0 - T.z1)), e = t * t * (3 - 2 * t);
  const dx = x < T.x0 ? T.x0 - x : x > T.x1 ? x - T.x1 : 0, lat = Math.max(0, 1 - dx / T.fall), l = lat * lat * (3 - 2 * lat);
  return P4.lawnTop * e * l;
}
// plants also keep out of the hoop side's apron (10: the secondary drive runs there) and the main drive in front of the corner
export function plantClear(sx, sz, pad = 0) { if (houseBlock(sx, sz, pad)) return true; const [x, z] = StoH(sx, sz); return inR({ x0: -8.5, x1: 11.5, z0: -1.6, z1: 10 }, x, z, pad) || inR({ x0: -9, x1: 1, z0: -14, z1: -1 }, x, z, pad); }
// true where the house, decks, stairs or the ground room stand (plants, weeds and yard props keep out). S frame.
export function houseBlock(sx, sz, pad = 0) {
  const P = P4, [x, z] = StoH(sx, sz);
  return inR({ x0: P.deckS.x0, x1: P.deckE.x1, z0: P.deckN.z0, z1: P.deckS.z1 }, x, z, pad)
    || inR({ x0: -7.9, x1: -6.5, z0: -1.6, z1: 3.9 }, x, z, pad)            // west stair run
    || inR({ x0: -0.4, x1: 6.7, z0: -14.2, z1: -12.8 }, x, z, pad);         // back stair + landing
}
