// Nico's house, round 4 (user mock-ups docs/v2/plan/nico_house/r4/01-10): the plan of the rebuilt stilt house, its lawn,
// bulkhead and dock. Single source of truth for every r4 dimension.
//
// FRAME: the STREET frame "S" of the lot (layout.json heading): +X east, +Z south toward the STOP corner and the street,
// -Z north toward the bay pocket. The set piece's group is still turned HOUSE_YAW (yard.data.js and every yard prop, plant
// and car stay in that "yard" frame G); r4 parts build in S and convert with toG / qG below. Yard grade y = 0.
//   G = R(-yaw) S, with R(a)(x, z) = (x cos a + z sin a, -x sin a + z cos a) (three.js rotation about +Y)
// ?nh=r3 = the round-3 house (old parts) for A/B.
export const R4 = typeof location === 'undefined' || !/[?&]nh=r3\b/.test(location.search);
// r8 (docs/v2/plan/nico_house/r8/SPEC.md): the diagonal house, the 6 m canal, the angled dock, the new interior (parts r8_*). ?nh8=0 = r7.
export const R8 = R4 && !(typeof location !== 'undefined' && /[?&]nh8=0\b/.test(location.search));
export const STREET_H = 0.4239;   // layout.json nico_house heading (nicoHouse.v2.js re-derives theta from the live layout)
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
  // r7 (playtest Nov 18 eve): square to the street and the bay again, as in the mock-ups 01 (roof view: the drive runs straight out
  // of the front to the STOP corner), 1 (front from the street), 08 and 2 (back from the water). ?nhrot=<deg> for A/B (45 = r4-r6).
  rot: { theta: (typeof location !== 'undefined' && /[?&]nhrot=(-?[\d.]+)/.exec(location.search)) ? +/[?&]nhrot=(-?[\d.]+)/.exec(location.search)[1] * Math.PI / 180 : 0, cx: 0, cz: -7 },
  F: 3.6,                  // floor / deck surface (tall stilts: a car drives under, 02 / 10)
  wallH: 2.6,              // floor to top plate
  wallT: 0.16,             // board-and-batten + studs + interior boards
  body: { x0: -6.5, x1: 6.5, z0: -10.4, z1: -3.6 },
  ridgeZ: -7.0, pitch: 0.42, eave: 0.55, rake: 0.42,
  // wraparound deck (N, E, S) at F; the west end is the house wall
  // r7d (MAIN mock-up 14): the west gable deck is the big one: it reaches 5 m past the west wall on its own posts
  W0: -11.5,
  // r7d (MAIN mock-up 18): only a short upper deck outside the slider (1.3 m), the lower deck right below it
  BZ0: -11.7,
  deckN: { x0: -11.5, x1: 8.5, z0: -11.7, z1: -10.4 },
  deckE: { x0: 6.5, x1: 8.5, z0: -11.7, z1: -1.6 },
  deckS: { x0: -11.5, x1: 8.5, z0: -3.6, z1: -1.6 },
  deckW: { x0: -11.5, x1: -6.5, z0: -11.7, z1: -1.6 },
  // posts (whitewashed 10x10 timbers) and beam lines
  postXs: [-11.5, -9.0, -6.5, -2.2, 2.2, 6.5, 8.5], postZs: [-11.7, -10.4, -7.0, -3.6, -1.6], post: 0.24,
  beam: { d: 0.29, t: 0.05 }, joist: { d: 0.235, t: 0.045, oc: 0.406 }, board: { w: 0.14, t: 0.035, gap: 0.01 },
  rail: { h: 1.0, post: 0.1, bal: 0.042, oc: 0.12 },
  rise: 0.18, run: 0.28,
  // stairs: west front stair (10: on the left, lattice under it), back stair to the lawn (08: top at the left, down to the right)
  stairW: { x: -7.2, z: -1.6, w: 1.2, n: 19, pad: { x0: -9.9, x1: -8.62, z0: -8.9, z1: -7.8 } },   // west side: head pad, then down +Z to the front corner
  stairE: { pad: { x0: 8.62, x1: 9.9, z0: -5.2, z1: -4.1 } },
  stairF: { pad: { x0: -8.62, x1: -7.4, z0: -1.5, z1: -0.2 } },   // front (hoop side), r6: head pad at the front corner, then ONE flight down +X along the front face to the hoop
                                       // east side: down -Z to the bay corner
  stairN: { x: 5.2, z: -13.45, w: 1.2, n: 19, land: { x0: -5.4, x1: -4.1, z0: -13.0, z1: -11.7 } },   // r7b: the short steps from the back deck down to the lower deck, left of the slider (18)   // runs -X from the landing
  // r7b (user's MAIN mock-up 11, from the driveway): the main stair from a head pad at the deck's front-east corner, two flights with a
  // landing, down to a step platform in front of the ANNEX, a lower teal room east of the house with the lower back-deck level on its roof
  mainStair: { pad: { x0: -11.67, x1: -10.3, z0: -1.55, z1: -0.35 }, annexStep: { z0: -8.5, z1: -7.3 } },   // r7b (mock-up 14): head pad at the front-WEST corner (the dish), two flights down +X along the front
  // r7b (mock-up 13): the annex runs from under the back half of the house out past its east edge; its door faces the pad under the
  // house; the part outside the main deck carries the lower deck level (11)
  // r7b (18 / 19 / 17): the lower back-deck level behind the house (0.85 m under the main deck: the short steps left of the slider), on
  // around over the annex along the canal; a stair from its west end down to the lawn
  lowerDeck: { x0: -5.0, x1: 12.06, z0: -18.1, z1: -11.76, stair: { z0: -17.9, z1: -16.7 } },
  annex: { x0: 2.2, x1: 12.0, z0: -10.4, z1: -3.6, h: 2.4, deckY: 2.75, deckX0: 8.62 },
  // ground-floor room under the east end (10: teal board-and-batten, white slider window, hose reel, vine)
  groundRoom: { x0: 2.2, x1: 12.0, z0: -10.4, z1: -3.6, h: 2.6 },   // r7b: = the annex footprint (pavers skip it)
  pavers: { x0: -12.6, x1: 8.6, z0: -12.6, z1: -0.3 },   // r7 (playtest item 3): the carport floor reaches out under the whole deck and both stairs
  court: { x0: -3.6, x1: 3.6, z0: -0.3, z1: 3.9 },     // r7: ... and flattens out past the front edge as the hoop court (10)
  // interior (clear spaces at floor level)
  hall: { x0: -0.7, x1: 0.7, z0: -5.6, z1: -3.6 },
  bath: { x0: 0.7, x1: 3.0, z0: -6.3, z1: -3.6 },
  living: { x0: -6.5, x1: -0.7, z0: -10.4, z1: -3.6 },
  kitchen: { x0: 0.7, x1: 4.1, z0: -10.4, z1: -6.3 },
  back: { x0: 4.1, x1: 6.5, z0: -10.4, z1: -3.6 },     // the unfinished stud-wall room (07): Nico's bedroom under renovation
  // lawn terrace, bulkhead, dock (08)
  wallZ: -27.2,            // outer face of the plank bulkhead
  wallX0: -22, wallX1: 15,
  lawnTop: 0.85,            // lawn at the wall: ~1.1 m over the water (08)
  terrace: { z0: -22.8, z1: -25.8, x0: -18, x1: 12, fall: 5 },   // lawn rises from grade at z0 to lawnTop by z1, flat to the wall
  dock: { y: 0.42, w: 1.5, x0: 9.5, x1: -1.0, z: -30.6, gangX: 9.5 },   // long walkway parallel to the wall (from the left in 08)
  plat: { x0: -6.8, x1: -0.6, z0: -33.4, z1: -27.8 },  // square platform in front of the center-right of the house (08)
  // r7 (playtest item 12): the seawalled canal along the house's +X side (replaces the round cove): 6 m of water between timber
  // bulkheads from the bay to just past the front of the house. `on` only where the world's water really is there (the terrain is
  // carved by tools/v2/map3/keys_detail.py carve_nico); otherwise the lot keeps its old edge.
  canal: { x0: 14.4, x1: 20.4, z1: 2.0, on: false },   // r7b: east of the annex (mock-up 11)
  colors: {
    teal: 0x4f978c, tealDeep: 0x3c7a72, white: 0xe7e3d6, door: 0x2c2f2e, shutter: 0x4d5552,
    deck: 0xa48f74, deckDark: 0x6f6253, post: 0xe2ddd0,   // r7 (playtest item 5): warm weathered boards as in the mock-ups (0, 02, 08), not chalk white
  },
};
// house frame H <-> lot frame S (rotation about the house center)
export const HtoS = (x, z) => { const R = P4.rot, c2 = Math.cos(R.theta), s2 = Math.sin(R.theta), dx = x - R.cx, dz = z - R.cz; return [R.cx + dx * c2 + dz * s2, R.cz - dx * s2 + dz * c2]; };
export const StoH = (x, z) => { const R = P4.rot, c2 = Math.cos(R.theta), s2 = Math.sin(R.theta), dx = x - R.cx, dz = z - R.cz; return [R.cx + dx * c2 - dz * s2, R.cz + dx * s2 + dz * c2]; };
export const inR = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
// Find the bay along -Z (lot frame) with the set piece's waterAt (G frame) and fit the house, lawn, bulkhead and dock to it.
// Called once by part 05 before anything is built. No water found: the defaults (bulkhead 27 m behind the lot origin).
function measureSite4(waterAt) {
  if (P4._measured) return; P4._measured = true; if (!waterAt) return;
  const raw = (x, z) => [x * c - z * s, x * s + z * c]; let zw = null;
  for (let z = -10; z > -60; z -= 0.25) { let n = 0; for (const x of [-6, -3, 0, 3, 6]) if (waterAt(...raw(x, z))) n++; if (n >= 3) { zw = z; break; } }
  if (zw === null) return;
  const oz = Math.max(-6, Math.min(7.5, zw + 21.3)), wall = zw + 0.35 - oz;
  P4.oz = oz; P4.wallZ = wall; P4.terrace.z0 = wall + 4.4; P4.terrace.z1 = wall + 1.4;
  P4.dock.z = wall - 3.4; P4.plat.z0 = wall - 6.2; P4.plat.z1 = wall - 0.6; P4.measured = { zw, oz, wall };
  const C = P4.canal, cx = (C.x0 + C.x1) / 2, inW = (x, z) => waterAt(...toG(x, z));
  // r7b: the 6 m canal is narrower than the world's water raster, so the world may still report land there; the set piece then draws
  // the canal's water itself (fake = true) and keeps people out of it with its walls and fences
  C.on = !(typeof location !== 'undefined' && /[?&]canal=0\b/.test(location.search));
  C.fake = !(inW(cx, wall + 6) && inW(cx, (wall + C.z1) / 2) && inW(cx, C.z1 - 2.5));
  if (C.on) P4.wallX1 = C.x0;   // the bay bulkhead turns into the canal's house-side wall
}
// r7: inside the canal's water (S frame), pad > 0 grows it
const inCanal4 = (sx, sz, pad = 0) => P4.canal.on && sx > P4.canal.x0 - pad && sx < P4.canal.x1 + pad && sz < P4.canal.z1 + pad && sz > P4.wallZ - 8;
// the lawn raise (S frame, m above grade): 0 at the house, lawnTop along the bulkhead
function terraceY4(x, z) {
  const T = P4.terrace; if (z > T.z0) return 0;
  const t = Math.min(1, (T.z0 - z) / (T.z0 - T.z1)), e = t * t * (3 - 2 * t);
  const dx = x < T.x0 ? T.x0 - x : x > T.x1 ? x - T.x1 : 0, lat = Math.max(0, 1 - dx / T.fall), l = lat * lat * (3 - 2 * lat);
  return P4.lawnTop * e * l;
}
// plants also keep out of the hoop side's apron (10: the secondary drive runs there) and the main drive in front of the corner
function plantClear4(sx, sz, pad = 0) { if (houseBlock4(sx, sz, pad) || inCanal4(sx, sz, pad + 0.6)) return true; const [x, z] = StoH(sx, sz); return inR({ x0: -8.5, x1: 11.5, z0: -1.6, z1: 10 }, x, z, pad) || inR({ x0: -12, x1: 1, z0: -14, z1: -1 }, x, z, pad)
  || inR({ x0: -19, x1: -4, z0: -3, z1: 9.5 }, x, z, pad); }   // r7d: the low north view from the drive (14) looks over open ground at the west deck
// true where the house, decks, stairs or the ground room stand (plants, weeds and yard props keep out). S frame.
function houseBlock4(sx, sz, pad = 0) {
  const P = P4, [x, z] = StoH(sx, sz);
  return inR({ x0: P.W0 - 0.1, x1: 8.6, z0: P.deckN.z0, z1: P.deckS.z1 }, x, z, pad)
    || inR({ x0: P.W0 - 0.3, x1: -2.6, z0: -1.7, z1: -0.1 }, x, z, pad)   // r7b: main stair along the front (two flights, landing, foot platform)
    || inR({ x0: 2.0, x1: 12.2, z0: -10.6, z1: -3.4 }, x, z, pad)          // r7b: the annex
    || inR({ x0: -9.4, x1: 12.2, z0: -18.3, z1: -11.6 }, x, z, pad);          // r7b: the lower deck and its stair to the lawn
}

// =============================== r8 plan (H frame; see the frames note at the top of the r8 block) ===============================
// H: S turned P4.rot.theta = pi/4 - h about (0, -7): -X = SOUTH-WEST (front: drive, front door, 1.2 m walkway), +X = NORTH-EAST (back:
// slider, back deck, canal), +Z = SOUTH-EAST (main stair; the backboard faces +Z), -Z = NORTH-WEST (the bay, the dock). Every r8 part
// builds in H through r4/frame.js (frame(ctx, 'house')). Body x -6.5..6.5 (ridge along X, gables at both ends), z -10.4..-3.6.
const _rq = typeof location !== 'undefined' ? /[?&]nhrot=(-?[\d.]+)/.exec(location.search) : null;
export const P8 = {
  // r8: pinned (it used to be measured from where the world's bay began; the r8 carve in tools/v2/map3/keys_detail.py uses the same value)
  oz: 4.5,
  rot: { theta: 0, cx: 0, cz: -7 },
  F: 3.6,                  // floor / deck surface (tall stilts: a car drives under)
  wallH: 2.6,              // floor to top plate
  wallT: 0.16,             // board-and-batten + studs + interior boards
  body: { x0: -6.5, x1: 6.5, z0: -10.4, z1: -3.6 },
  ridgeZ: -7.0, pitch: 0.42, eave: 0.55, rake: 0.42,
  // ---- decks (r8 SPEC: a 4 ft front walkway, a back deck about half the old size, nothing else) ----
  // front walkway along the SW gable, carried on round the south corner as the head pad of the main stair
  walk: { x0: -7.75, x1: -6.5, z0: -10.4, z1: -2.2 },
  // back: the upper strip along the NE gable at floor level (slider, chairs) and the LOWER gym deck beside it on the annex roof, flush
  // with the canal wall
  upper: { x0: 6.5, x1: 8.7, z0: -10.4, z1: -3.6 },
  lower: { x0: 8.7, x1: 12.45, z0: -11.2, z1: -2.8, y: 2.75 },
  // short steps from the upper strip down to the lower deck (NW end), and the stair from the lower deck's SE edge down to the yard,
  // running back toward the house (head pad beside the deck's SE edge, one flight going -X)
  stepsUL: { z0: -10.3, z1: -9.15 },
  lowerStair: { pad: { x0: 11.25, x1: 12.45, z0: -2.8, z1: -1.4 }, zc: -2.0, w: 1.1 },
  // ---- posts (whitewashed 10x10 timbers) and beam lines under the body; the walkway has its own outer posts ----
  postXs: [-6.5, -2.2, 2.2, 6.5], postZs: [-10.4, -7.0, -3.6], post: 0.24,
  beam: { d: 0.29, t: 0.05 }, joist: { d: 0.235, t: 0.045, oc: 0.406 }, board: { w: 0.14, t: 0.035, gap: 0.01 },
  rail: { h: 1.0, post: 0.1, bal: 0.042, oc: 0.12 },
  rise: 0.18, run: 0.28,
  // the main stair (B, D): from the head pad at the south corner down +X along the SE face, two flights of 9 treads and a 1.2 m landing,
  // 0.24 m clear of the SE post line; lattice under it
  mainStair: { zc: -2.8, w: 1.1, x0: -6.5 },
  // the annex (D, C): a lower teal room under the NE half of the house and on under the lower deck; door + window on its SW face
  // (toward the under-house passage), the lower deck on its roof
  annex: { x0: 2.45, x1: 12.0, z0: -10.4, z1: -3.6, h: 2.4, deckY: 2.75, door: -6.2, win: -4.5 },
  // under-house slab (C: cracked concrete pad) and the hoop on the middle beam, backboard facing SE (+Z), shot toward the bay (-Z)
  pad: { x0: -6.9, x1: 2.2, z0: -10.8, z1: -1.4 },
  hoop: { x: 0.0, z: -7.0 },
  // interior (clear spaces at floor level): front door in the middle of the SW gable -> short hall, bath LEFT (NW), bedroom RIGHT (SE),
  // then the open kitchen (SE wall) / living room (sofa on the NW wall, TV facing it, slider in the NE gable)
  hall: { x0: -6.5, x1: -2.6, z0: -7.75, z1: -6.25 },
  bath: { x0: -6.5, x1: -2.6, z0: -10.4, z1: -7.75 },
  bed: { x0: -6.5, x1: -2.6, z0: -6.25, z1: -3.6 },
  kitchen: { x0: -2.6, x1: 1.6, z0: -6.0, z1: -3.6 },
  living: { x0: 1.6, x1: 6.5, z0: -10.4, z1: -3.6 },
  // ---- the bay wall, the canal, the dock (H frame) ----
  wallZ: -16.5,            // water face of the bay bulkhead (NW of the house, parallel to its long side)
  wallX0: -27, wallX1: 12.6,
  lawnTop: 0.12,           // the lawn's rise to the bulkhead cap (flat lot)
  terrace: { z0: -13.0, z1: -16.2, x0: -26, x1: 12.4, fall: 4 },
  // r8: the canal, 6 m of water between timber bulkheads, from the bay (NW end) in toward the SE, straight
  // r9 (user, Nov 19): twice as wide: 12 m of water (was 6 m); Nico's wall stays where the lower deck is flush with it
  canal: { x0: 12.6, x1: 24.6, z1: 20.0, on: true, fake: true },
  // the dock (A): leaves the bay wall at an angle by the canal mouth, turns, runs straight to the big platform, parallel to the wall
  // r9 (user, Nov 19): ONE angled gangway straight from the wall to the platform (no knee), and a narrower platform (5.0 x 3.8 m, was 7.4 x 5.9)
  dock: { y: 0.42, w: 1.5, wallX: 10.6, kneeX: 7.0, z: -21.9, x1: 0.8 },
  plat: { x0: -4.2, x1: 0.8, z0: -24.2, z1: -20.4 },
  colors: {
    // r9 (B / D / C): faded sea-green siding, brown board shutters, cream trim, weathered gray-tan timber posts (not whitewash)
    teal: 0x6c9686, tealDeep: 0x557c6f, white: 0xddd6c4, door: 0x2c2f2e, shutter: 0x5a4838,
    deck: 0xa48f74, deckDark: 0x6f6253, post: 0xa99c88,
  },
};
P8.rot.theta = _rq ? +_rq[1] * Math.PI / 180 : Math.PI / 4 - STREET_H;
if (R8) { for (const k of Object.keys(P4)) if (!(k in P8)) delete P4[k]; Object.assign(P4, P8); }
export const HtoG = (x, z) => toG(...HtoS(x, z));
export const GtoH = (x, z) => StoH(...toS(x, z));
export const hdgHtoG = (h) => h + P4.rot.theta - YAW;   // a yard-frame heading (yard.data.js: 0 faces +Z_G) from an H-frame heading
// r8: the site is fixed (the map carve follows the plan, tools/v2/map3/keys_detail.py carve_nico); kept for the callers
function measureSite8(waterAt) {
  if (P4._measured) return; P4._measured = true;
  const C = P4.canal; C.on = !(typeof location !== 'undefined' && /[?&]canal=0\b/.test(location.search));
  // the set piece draws the canal water itself unless the world really has water down the middle of the channel
  const inW = waterAt ? (x, z) => waterAt(...HtoG(x, z)) : () => false, cx = (C.x0 + C.x1) / 2;
  C.fake = !(inW(cx, P4.wallZ + 6) && inW(cx, (P4.wallZ + C.z1) / 2) && inW(cx, C.z1 - 2.5));
  P4.measured = { oz: P4.oz, theta: P4.rot.theta, canalWorld: !C.fake };
}
// inside the canal's water (H frame), pad > 0 grows it; S-frame callers use inCanalS
export const inCanalH = (x, z, pad = 0) => P4.canal.on && x > P4.canal.x0 - pad && x < P4.canal.x1 + pad && z < P4.canal.z1 + pad && z > P4.wallZ - 8;
const inCanal8 = (sx, sz, pad = 0) => inCanalH(...StoH(sx, sz), pad);
// beyond the bay wall (H frame)
export const inBayH = (x, z, pad = 0) => z < P4.wallZ + pad && x > P4.wallX0 - 40 && x < P4.canal.x1 + 40;
// the lawn's rise to the bulkhead (S frame callers; m above grade)
function terraceY8(sx, sz) {
  const [x, z] = StoH(sx, sz), T = P4.terrace; if (z > T.z0) return 0;
  const t = Math.min(1, (T.z0 - z) / (T.z0 - T.z1)), e = t * t * (3 - 2 * t);
  const dx = x < T.x0 ? T.x0 - x : x > T.x1 ? x - T.x1 : 0, lat = Math.max(0, 1 - dx / T.fall), l = lat * lat * (3 - 2 * lat);
  return P4.lawnTop * e * l;
}
// plants also keep out of the hoop passage under the house, the drive in front and the canal / bay edge strip. S frame.
function plantClear8(sx, sz, pad = 0) {
  if (houseBlock8(sx, sz, pad)) return true; const [x, z] = StoH(sx, sz);
  return inCanalH(x, z, pad + 0.8) || z < P4.wallZ + 0.8 + pad || inR({ x0: -11, x1: 13, z0: -12.5, z1: 0.5 }, x, z, pad);
}
// true where the house, decks, stairs, annex or the under-house pad stand (plants, weeds and yard props keep out). S frame.
function houseBlock8(sx, sz, pad = 0) {
  const P = P4, [x, z] = StoH(sx, sz);
  return inR({ x0: P.walk.x0 - 0.2, x1: P.lower.x1 + 0.2, z0: P.lower.z0 - 0.2, z1: P.body.z1 + 0.3 }, x, z, pad)
    || inR({ x0: P.walk.x0 - 0.2, x1: 1.3, z0: -3.6, z1: -1.9 }, x, z, pad)          // the main stair along the SE face
    || inR({ x0: 6.9, x1: 12.6, z0: -2.9, z1: -1.3 }, x, z, pad)                     // the lower deck's stair
    || inR(P.pad, x, z, pad);
}

export const measureSite = (w) => (R8 ? measureSite8(w) : measureSite4(w));
export const inCanal = (sx, sz, pad = 0) => (R8 ? inCanal8(sx, sz, pad) : inCanal4(sx, sz, pad));
export const terraceY = (x, z) => (R8 ? terraceY8(x, z) : terraceY4(x, z));
export const plantClear = (sx, sz, pad = 0) => (R8 ? plantClear8(sx, sz, pad) : plantClear4(sx, sz, pad));
export const houseBlock = (sx, sz, pad = 0) => (R8 ? houseBlock8(sx, sz, pad) : houseBlock4(sx, sz, pad));
