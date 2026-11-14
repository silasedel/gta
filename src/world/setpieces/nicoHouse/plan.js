// Nico's house: the plan (single source of truth for every dimension). House-local meters:
// +X east, +Z south (street / driveway side), Y up, yard grade y = 0, water at y = seaY on the north (bay) and east (cove) sides.
// Our own design: a faded mango-yellow "gable and wing" Conch cottage on round marine piles. Main block A (living + kitchen)
// with its ridge east-west, a cross-gabled bedroom wing B on the east end stepping 1.6 m toward the street, a covered
// front porch in the inner corner, an open deck wrapping the west and bay sides, an L-shaped stair on the west side.
export const PLAN = {
  seaY: -1.0,
  F: 3.0,              // finished floor and deck surface
  wallH: 2.75,         // floor to top plate
  ceilH: 2.62,         // interior ceiling
  wallT: 0.15,         // exterior wall thickness (siding + studs + paneling)
  intT: 0.11,          // interior partition thickness
  A: { x0: -6.4, x1: 2.0, z0: -3.2, z1: 2.8 },
  B: { x0: 2.0, x1: 6.6, z0: -3.2, z1: 4.4 },
  porch: { x0: -6.4, x1: 2.0, z0: 2.8, z1: 5.2 },
  deckW: { x0: -8.6, x1: -6.4, z0: -6.4, z1: 5.2 },
  deckN: { x0: -8.6, x1: 6.6, z0: -6.4, z1: -3.2 },
  // structure
  pileR: 0.15, pileXs: [-8.42, -6.4, -3.6, -0.8, 2.0, 4.3, 6.42], pileZs: [-6.22, -3.2, -0.2, 2.8, 5.02],
  girder: { d: 0.286, t: 0.045 },            // doubled 2x12, one each side of the pile, on every Z pile line (running east-west)
  joist: { d: 0.235, t: 0.04, oc: 0.406 },   // 2x10 at 16 in., running north-south on top of the girders
  deckBoard: { w: 0.14, t: 0.038, gap: 0.006 },
  rail: { h: 1.07, post: 0.09, bal: 0.036, balOC: 0.118 },
  // roof
  shed: { x0: -7.05, x1: 3.3, z0: -3.65, z1: 3.55, y0: 6.56, pitch: 0.12 },
  ridgeA: { z: -0.2, y: 7.25 }, pitchA: 0.5, ridgeB: { x: 4.3, y: 7.25 }, pitchB: 1.5 / 2.3, eaveOv: 0.45, rakeOv: 0.35,
  porchRoof: { yWall: 5.66, pitch: 0.125, zOut: 5.62, x0: -6.75, x1: 2.0 },
  // stairs
  rise: 0.1875, run: 0.28,
  stairW: { landing: { x0: -11.8, x1: -10.6, z0: 3.0, z1: 4.2, y: 1.5 }, w: 1.2 },   // flight 1 runs west from the deck edge, flight 2 south to the yard
  stairN: { top: { x0: 4.7, x1: 5.9, z0: -7.6, z1: -6.4 }, w: 1.1 },                  // bay-side stair to the dock, runs west along the deck edge
  // site
  lot: { x0: -24, x1: 11.4, z0: -14.2, z1: 27 },   // seawall faces at x1 (east) and z0 (north); street at z1
  dock: { x0: 0.9, x1: 2.7, z0: -27.5, z1: -14.2, headX0: -1.6, headX1: 5.2, headZ0: -27.5, headZ1: -24.9, y: 0.12 },
  colors: {
    body: 0x3a9898,      // turquoise siding, peeled to bare gray-brown wood (ref 43)
    bodyDeep: 0xc9952e,  // the same paint where it has been shaded (under eaves, porch)
    trim: 0xcfc9b8,      // conch white
    accent: 0x8c7f6d,    // weathered lagoon blue-green (shutters, doors)
    porchCeil: 0xa9cfd6, // haint blue porch ceiling
    lattice: 0xe3ddcc,
    deck: 0x9a9388,      // silver-gray weathered lumber (vertex tint over the wood texture)
    deckDark: 0x6f675c,
    pile: 0x7d7467,
  },
  // rooms (interior clear spaces), y from F to F + ceilH
  rooms: {
    living: { x0: -6.25, x1: -1.9, z0: -3.05, z1: 2.65 },
    kitchen: { x0: -1.9, x1: 1.945, z0: -3.05, z1: 2.65 },
    hall: { x0: 2.055, x1: 3.945, z0: -3.05, z1: -0.055 },
    bath: { x0: 4.055, x1: 6.45, z0: -3.05, z1: -0.055 },
    bedroom: { x0: 2.055, x1: 6.45, z0: 0.055, z1: 4.25 },
  },
};

// Exterior walls. Each wall runs from a to b with the outside on its right-hand side (walking a -> b).
// u is measured along the wall from a. Openings: { u (center), w, sill (above floor), h, kind, id, ... }.
// kind: 'window' | 'door' | 'slider' | 'vent'. gable: the wall continues up to the roof line (ridge at u = gable.u).
export const WALLS = [
  { id: 'A_south', a: [-6.4, 2.8], b: [2.0, 2.8], porch: true, openings: [
    { id: 'W1', u: 1.75, w: 0.95, sill: 0.8, h: 1.45, kind: 'window', shutter: 'louver' },
    { id: 'W10', u: 4.4, w: 0.95, sill: 0.8, h: 1.45, kind: 'window', shutter: 'louver' },
    { id: 'W2', u: 7.05, w: 0.95, sill: 0.8, h: 1.45, kind: 'window', shutter: 'louver' } ] },
  { id: 'A_west', a: [-6.4, -3.2], b: [-6.4, 2.8], gable: { u: 3.0 }, openings: [
    { id: 'W3', u: 1.55, w: 0.95, sill: 0.8, h: 1.45, kind: 'window', shutter: 'bahama', ac: true },
    { id: 'W4', u: 4.3, w: 0.95, sill: 0.8, h: 1.45, kind: 'window', shutter: 'bahama' },
  ] },
  { id: 'A_north', a: [2.0, -3.2], b: [-6.4, -3.2], gable: { u: 0 }, openings: [
    { id: 'W5', u: 2.2, w: 1.05, sill: 1.08, h: 1.05, kind: 'window', shutter: 'bahama' },
    { id: 'D_deck', u: 6.3, w: 1.8, sill: 0, h: 2.08, kind: 'slider' } ] },
  { id: 'B_south', a: [2.0, 4.4], b: [6.6, 4.4], gable: { u: 2.3 }, openings: [
    { id: 'W6', u: 2.3, w: 1.6, sill: 0.05, h: 2.03, kind: 'window', shutter: 'none', mullion: true, french: true },
    { id: 'V_south', u: 2.3, w: 0.55, sill: 3.15, h: 0.65, kind: 'vent' } ] },
  { id: 'B_west', a: [2.0, 2.8], b: [2.0, 4.4], porch: true, openings: [] },
  { id: 'B_east', a: [6.6, 4.4], b: [6.6, -3.2], openings: [
    { id: 'W7', u: 2.1, w: 0.95, sill: 0.8, h: 1.45, kind: 'window', shutter: 'bahama' },
    { id: 'W8', u: 6.05, w: 0.6, sill: 1.5, h: 0.6, kind: 'window', shutter: 'none', frosted: true } ] },
  { id: 'B_north', a: [6.6, -3.2], b: [2.0, -3.2], gable: { u: 2.3 }, openings: [
    { id: 'W9', u: 1.25, w: 0.6, sill: 1.3, h: 0.9, kind: 'window', shutter: 'none', frosted: true },
    { id: 'D_back', u: 3.65, w: 0.86, sill: 0, h: 2.05, kind: 'door', glazed: true },
    { id: 'V_north', u: 2.3, w: 0.55, sill: 3.15, h: 0.65, kind: 'vent' } ] },
];

// Interior partitions (centerline a -> b), with door openings.
export const PARTITIONS = [
  { id: 'P_AB', a: [2.0, -3.05], b: [2.0, 2.65], openings: [{ id: 'D_hall', u: 1.25, w: 0.9, sill: 0, h: 2.05, kind: 'cased' }] },   // main block | wing (cased opening into the hall)
  { id: 'P_bed', a: [2.055, 0.0], b: [6.45, 0.0], openings: [{ id: 'D_bed', u: 1.0, w: 0.82, sill: 0, h: 2.03, kind: 'door' }] },     // hall + bath | bedroom
  { id: 'P_bath', a: [4.0, -3.05], b: [4.0, -0.055], openings: [{ id: 'D_bath', u: 1.75, w: 0.76, sill: 0, h: 2.03, kind: 'door' }] }, // hall | bath
];

// Roof surface height at a plan point (top of the structural deck, before the tin). Returns -Infinity outside the roofs.
export function roofY(x, z) {
  const P = PLAN; let y = -Infinity;
  if (x >= P.shed.x0 - 0.01 && x <= P.shed.x1 + 0.01 && z >= P.shed.z0 - 0.01 && z <= P.shed.z1 + 0.01) y = Math.max(y, P.shed.y0 - (z - P.shed.z0) * P.shed.pitch);   // low shed roof over the main block, falling toward the street
  if (x >= P.B.x0 - P.eaveOv - 0.01 && x <= P.B.x1 + P.eaveOv + 0.01 && z >= P.B.z0 - P.rakeOv - 0.01 && z <= P.B.z1 + P.rakeOv + 0.01) y = Math.max(y, P.ridgeB.y - Math.abs(x - P.ridgeB.x) * P.pitchB);
  return y;
}
// True when a plan point is on the raised platform (house floor or deck), i.e. where joists and decking exist.
export function onPlatform(x, z) {
  const P = PLAN, inR = (r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  return inR(P.A) || inR(P.B) || inR(P.porch) || inR(P.deckW) || inR(P.deckN);
}
export const inRect = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
