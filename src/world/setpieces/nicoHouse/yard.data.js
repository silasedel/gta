// Nico's front yard and street corner, hand placed (track: keys, r2-keys). Target: docs/v2/plan/nico_house/0_front_deck_mockup.webp,
// seen from the west deck (MOCKUP_CAM below). HOUSE-LOCAL meters (same frame as plan.js): +X east of the plan, +Z toward the street,
// y = 0 at the yard grade. The house is turned 0.72 rad in its lot (nicoHouse.v2.js HOUSE_YAW), so the lot is a corner lot:
// Pelican Point Ln (east leg, edge 3210) runs along the front at z ~ 30 (asphalt edge z ~ 27.3 at x = -10, 28.4 at x = 0..8) into the
// STOP corner J at (-20.9, 23.8); the west leg (3215) leaves J along (-0.51, -0.86) down the lot's west side (asphalt edge x ~ -22.2
// at z = 15, -28 at z = 5); the north leg leaves J toward (-26.5, 32.5). Positions of the cars, bins, planter, poles, STOP, puddle
// and roll-off were unprojected from the mock-up through the fitted camera, then nudged off the asphalt. Every item is an explicit
// choice; nothing is scattered at random. Headings: 0 faces +Z, PI faces the house. Sizes in meters.

// the mock-up camera (fitted to the deck rail corner and the STOP corner; tools/v2/keys/spots_refs.json r0b_deck)
export const MOCKUP_CAM = { eye: [-8.39, 4.65, 1.34], look: [-16.29, -2.64, 18.21], fov: 56 };   // refit with the cars and the STOP corner as landmarks
export const JUNCTION = [-20.9, 23.8];

// ---- parked cars: the cars helper places them (src/vehicles/vehicles.js NICO_CARS); these spots document the mock-up and every
// prop below stays clear of them ----
export const CAR_SPOTS = [
  // the gray lifted pickup, nose in toward the deck camera, turned a little to camera-left (front bumper at about (-10.3, 6.4))
  { id: 'nico_pickup', kind: 'pickup', look: 'gray_lifted', x: -12.4, z: 8.4, heading: 2.35, locked: false, owner: 'nico' },
  // the pale rusty classic side-on to its right, nose to camera-left (front bumper at about (-16.4, 7.0))
  { id: 'nico_classic', kind: 'classic_sedan', look: 'rusty_seafoam', x: -18.8, z: 5.5, heading: 1.03, locked: true, owner: 'nico' },
];

// ---- the driveway: from the drive mouth at the STOP corner past the pickup, with a branch to the carport bay under the house ----
// r7 (playtest Nov 18 eve, item 6; mock-up r4/01 roof view): the house is square to the street again, so the drive runs STRAIGHT out of
// the front of the house to the STOP corner (lot frame S: x ~ -5.8 .. -4.1 from the end of Pelican Point Ln at z ~ 28 to the pickup at z ~ 7.5),
// then bends under the front deck to the carport. Same yard frame G as everything here (converted from S with r4/plan4.js toG).
export const DRIVE = { main: [[-25.56, 20.35], [-19.44, 14.28], [-15.03, 10.16], [-11.03, 6.36]], branch: [[-11.03, 6.36], [-7.78, 4.02], [-4.03, 2.78]], halfWidth: 2.2,
  // r7e (MAIN mock-up 14): a second track curves off by the pickup, round a grassy island and in under the big west deck
  loop: [[-11.52, 6.92], [-13.50, 6.74], [-15.47, 2.62], [-14.30, -1.14], [-11.92, -3.76], [-9.43, -4.41]], island: { x: -11.84, z: 1.82, r: 2.1 } };

// ---- white lattice planter box between the deck and the drive (bougainvillea grows out of it, part 50) ----
// [ax, az, bx, bz] runs; height of the lattice, depth of the box
export const PLANTER = { library: true, runs: [[-12.1, 12.35, -9.55, 12.35]], h: 0.78, depth: 0.85,
  plants: [ // bougainvillea in the box (x, z, size, hue: 'magenta' | 'coral')
    { x: -11.6, z: 12.35, s: 0.75, hue: 'magenta' }, { x: -10.75, z: 12.35, s: 1.1, hue: 'magenta' }, { x: -9.95, z: 12.3, s: 1.25, hue: 'magenta' }] };   // fuller toward the deck end, the bins stay in view

// ---- bins: model piece of keys/bins.glb, heading (front: 0 = +Z), tint ----
export const BINS = [
  { x: -12.85, z: 12.75, piece: 'trashcan_blue', h: 2.7, tint: [1.0, 1.0, 1.05] },   // by the planter (mock-up: two blue carts, a galvanized can in front)
  { x: -12.95, z: 13.5, piece: 'trashcan_blue', h: 2.45, tint: [0.88, 0.92, 1.0] },
  { x: -12.25, z: 11.75, can: 'galv', h: 0 },
  { x: -10.49, z: 1.80, can: 'galv', h: 0 },   // r7e: the silver can on the island's edge (14)
  { x: -18.05, z: 9.45, piece: 'trashcan_blue', h: 2.3, tint: [0.95, 0.95, 1.0] },   // the pair beyond the classic's hood
  { x: -18.5, z: 8.85, piece: 'trashcan_blue', h: 2.6, tint: [0.9, 0.93, 1.02] },
];

// ---- STOP signs (user review shot_25): one per approach of J, each at its stop bar on the RIGHT of the approaching lane, 0.9 m off the
// pavement edge, plate facing the oncoming traffic. Computed from the road graph legs at J (house frame): east leg out of J along
// (0.763, 0.645), west leg (-0.508, -0.862), north leg (-0.541, 0.841); pos = J + leg * setback + right-of-travel * (3.25 + 0.9),
// face = leg direction. The street kit's regulatory STOPs (regulatory.v2.js) have none at this corner (no 'stop' control on 3210 / 3215).
// r7: Pelican Point Ln ends at the front of the lot (lot frame S x -6, z 28.9; there is no corner here any more): one STOP at the right
// of the drive mouth, its face toward the house, as in the roof-view mock-up (01)
export const STOPS = [
  { x: -28.8, z: 17.37, face: 2.42, lean: 0.02 },
];

// ---- wooden utility poles: [x, z, height, lean, crossarm yaw (square to the wires)]; wires: [poleA, poleB | WIRE_ENDS key], sag in m.
// Pole 0 is the corner pole of the mock-up (transformer, street lamp) and carries the house's service drop (part 40) ----
// every span ends at a pole (user review: no wire may end in mid-air); the outer poles (3-5) are dead-end poles on the street edges
export const POLES = [[-13.3, 25.5, 9.6, 0.012, 1.4], [3.0, 27.6, 9.4, -0.02, 1.57], [-33.5, 10.5, 9.4, 0.015, 1.05],
  [24.0, 25.4, 9.3, -0.015, 1.75], [-39.0, -2.3, 9.2, 0.01, 0.4], [-31.6, 43.4, 9.4, 0.02, 2.4]];
export const WIRE_ENDS = {};
export const WIRES = [{ a: 0, b: 1, n: 3, sag: 0.9 }, { a: 0, b: 2, n: 3, sag: 0.8 }, { a: 1, b: 3, n: 3, sag: 1.0 }, { a: 2, b: 4, n: 3, sag: 0.7 }, { a: 0, b: 5, n: 2, sag: 1.1 }];
export const SERVICE_POLE = 0;   // index into POLES: the service drop from the house mast lands here

// ---- the mailbox at the drive mouth (part 45), facing the west leg ----
export const MAILBOX = { x: -26.95, z: 16.47, h: -0.72 };   // r7: at the right of the straight drive's mouth (it stood in the new drive)

// ---- red roll-off at the street edge of the yard, along the west leg, behind the right-hand bins (mock-up: mid-frame right): a long,
// LOW 20-yard box (sy), rust-darkened ----
// r4-keys (user, Nov 18: "move it more to the side so there's room to drive out"; r4 ref 01_roof_view_yard_dumpster: off to the RIGHT of
// the drive against the bushes by the street, drive clear): slid 13 m down the west leg's verge toward the bay, past the classic. The pickup
// backs out along (-0.71, +0.70) into the drive mouth; the old spot (-22.0, 12.55) stood 1.3 m off the drive edge in that swing.
export const DUMPSTER = { x: -25.1, z: 10.0, heading: 0.85, scale: 0.82, sy: 1, tint: [0.96, 0.93, 0.9] };   // full height (squashed ribs looked wrong up close)

// ---- pale limestone / coral boulders: [x, z, piece (1..6 of keys/rocks.glb), scale, heading, sink] ----
export const ROCKS = [
  // r7: the stones lining the drive's right edge from the pickup to the street (01), a few on its left
  [-13.86, 3.21, 2, 0.22, 0.4, 0.04], [-15.25, 5.18, 5, 0.18, 2.1, 0.03], [-17.07, 6.78, 1, 0.2, 1.2, 0.04], [-18.78, 8.47, 6, 0.2, 4.0, 0.04],
  [-20.09, 10.51, 3, 0.19, 0.9, 0.04], [-21.62, 12.36, 4, 0.21, 2.8, 0.04], [-23.48, 13.92, 2, 0.18, 5.0, 0.03], [-25.05, 15.74, 5, 0.22, 1.6, 0.04],
  [-10.35, 10.28, 6, 0.16, 0.3, 0.03], [-12.34, 12.78, 3, 0.17, 2.2, 0.03],
  [-10.52, 3.64, 2, 0.2, 0.5, 0.04], [-12.26, 3.56, 5, 0.17, 1.9, 0.03], [-13.76, 1.96, 1, 0.21, 3.1, 0.04], [-13.71, 0.49, 6, 0.18, 4.4, 0.04], [-12.12, -0.14, 3, 0.2, 5.2, 0.04], [-10.04, 1.40, 4, 0.16, 0.9, 0.03],   // r7e: round the grassy island (14)
  [-9.8, 26.6, 3, 0.26, 2.6, 0.05], [-6.0, 27.2, 4, 0.3, 0.9, 0.06], [-3.0, 27.6, 2, 0.24, 5.1, 0.04], [1.0, 27.6, 5, 0.26, 3.3, 0.05], [5.5, 27.6, 1, 0.22, 0.2, 0.04], [8.5, 27.3, 6, 0.28, 1.7, 0.05],   // frontage on the east leg
  [-25.2, 3.5, 3, 0.25, 1.0, 0.05], [-25.0, 8.6, 4, 0.22, 2.0, 0.04],   // west verge
  [-6.5, 15.0, 3, 0.16, 1.0, 0.03], [-3.0, 19.5, 6, 0.17, 0.5, 0.03], [-15.0, 2.0, 2, 0.2, 3.9, 0.04],
];

// ---- clutter and debris (own models, part 55): kind, x, z, heading, extra ----
export const DEBRIS = [
  { k: 'pallet', x: -19.3, z: 11.1, h: 0.5, tilt: 0.05 }, { k: 'pallet', x: -19.15, z: 10.95, h: 0.62, y: 0.13 }, { k: 'drywall', x: -24.6, z: 8.6, h: 1.0 },
  { k: 'lumber', x: -21.0, z: 1.5, h: 1.3 }, { k: 'bucket', x: -19.6, z: 12.4, h: 0 }, { k: 'tire', x: -27.0, z: 24.4, h: 0, flat: true }, { k: 'cinder', x: -11.55, z: 2.57, h: 0.4 },
  { k: 'cinder', x: -11.25, z: 2.97, h: 1.1 }, { k: 'cooler', x: 2.9, z: 10.6, h: 2.3 }, { k: 'chair', x: 2.1, z: 11.5, h: 3.6 },
  { k: 'chair', x: 3.7, z: 11.2, h: 2.4, tipped: true }, { k: 'husks', x: -5.6, z: 14.2, h: 0 }, { k: 'husks', x: -2.0, z: 19.8, h: 1 },
  { k: 'tarp', x: -21.5, z: -6.0, h: 0.4 }, { k: 'bucket', x: 2.4, z: 9.8, h: 0, color: 0xe25a1c },
];

// ---- yard surface: puddles (fill with the weather's puddle level), tire tracks, leaf-litter / shell / matted-grass patches ----
// the drive-end puddle (user review): in the low spot where the drive meets the STOP corner; it fills after rain and dries out
export const CORNER_PUDDLE = { x: -24.58, z: 18.01, a: 1.3, b: 0.55, rot: 0.85 };   // lead review: a small standing puddle at the drive mouth even in dry weather
// small sticks, twigs, palm-frond bits and bark scraps: [x, z, radius, count]
export const STICKS = [[-14.5, 12.5, 3.0, 24], [-19.5, 13.5, 2.5, 20], [-11.0, 7.5, 2.5, 16], [-20.5, 4.5, 3.0, 20], [-6.0, 18.0, 2.5, 14], [2.0, 16.0, 2.5, 14], [-21.0, -4.0, 3.0, 18]];
// [x, z, half length, half width, yaw]: small rut puddles (decals). The drive-end puddle is r2-ground's patchPuddles on the yard sheet
// itself over the sheet's low spot (DRIVE_PUDDLE; nicoHouse.v2.js): fills while it rains, shrinks back as the weather dries
export const DRIVE_PUDDLE = { x: -21.9, z: 16.8, r: 2.1 };
export const PUDDLES = [[-16.4, 11.6, 1.0, 0.35, 0.8], [-12.2, 7.4, 0.8, 0.3, 0.85], [-20.6, 15.6, 1.1, 0.4, 0.8], [-8.6, 4.6, 0.9, 0.35, 0.6]];   // r7: on the straight drive
export const TRACKS = [   // polylines of the left / right tire, width 0.3 (soft, darker, slightly sunk)
  { pts: [[-25.16, 19.9], [-19.44, 14.28], [-15.03, 10.16], [-11.23, 6.58]], gauge: 1.7 },
  { pts: [[-11.23, 6.58], [-7.78, 4.02], [-4.6, 2.9]], gauge: 1.6 },
];
export const LITTER = [   // [x, z, radius, density 0..1, kind: 'shell' (crushed shell / marl dust) | 'matted' | 'leaves']
  [-11.84, 1.82, 2.0, 1.0, 'matted'], [-12.51, 2.67, 1.4, 0.95, 'matted'], [-11.11, 0.97, 1.3, 0.95, 'matted'],   // r7e: the grassy island (14)
  // (no 'shell' patches: the yard sheet itself is the pale shell floor; decal rims on it read as patch edges, user review shot_27)
  // matted, sun-dried grass: the verge by the roll-off, under the classic, the strip between the drive and the deck, the front
  [-21.0, 15.5, 3.0, 0.8, 'matted'], [-15.0, 3.5, 3.2, 0.75, 'matted'], [-11.0, 4.0, 2.4, 0.7, 'matted'], [-14.0, 11.2, 1.6, 0.7, 'matted'], [-8.5, 13.0, 2.6, 0.6, 'matted'],
  [-5.0, 22.0, 3.5, 0.7, 'matted'], [-10.0, 24.0, 3.0, 0.75, 'matted'], [0.0, 20.0, 4.0, 0.7, 'matted'], [5.0, 15.0, 3.5, 0.7, 'matted'], [-22.0, 2.0, 3.5, 0.8, 'matted'],
  [-20.0, -6.0, 4.0, 0.8, 'matted'], [7.0, -4.0, 3.5, 0.7, 'matted'], [-12.0, -8.0, 3.5, 0.6, 'matted'], [6.5, 23.5, 3.0, 0.75, 'matted'], [-23.5, 9.0, 2.6, 0.7, 'matted'],
  // dead leaves: under the poinciana and the sea grape, across the open yard, thin
  [-18.0, 11.0, 2.8, 0.6, 'leaves'], [-21.0, 6.5, 3.8, 0.8, 'leaves'], [-12.0, 9.0, 2.5, 0.45, 'leaves'], [-16.5, 19.5, 2.0, 0.5, 'leaves'], [-6.0, 16.0, 2.6, 0.45, 'leaves'], [2.0, 12.0, 2.4, 0.45, 'leaves'], [-3.0, 24.0, 3.0, 0.5, 'leaves'],
  [-21.5, -2.0, 4.0, 0.7, 'leaves'], [8.5, 8.0, 3.0, 0.6, 'leaves'],
  // the deck-view foreground (mock-up: green-gray matted grass between the ruts, around the tires and along the drive edges)
  [-12.5, 4.5, 2.6, 0.95, 'matted'], [-15.8, 6.6, 2.0, 0.9, 'matted'], [-17.2, 11.6, 2.2, 0.9, 'matted'], [-13.2, 16.6, 2.5, 0.85, 'matted'], [-9.6, 9.2, 2.0, 0.8, 'matted'],
  [-11.2, 19.2, 2.4, 0.85, 'matted'], [-19.5, 17.0, 1.8, 0.85, 'matted'], [-14.0, 14.0, 2.0, 0.6, 'leaves'], [-10.6, 6.2, 1.6, 0.55, 'leaves'],
  // lead review k23: big low green mats around the truck and in the right foreground (mock-up)
  [-16.2, 4.6, 2.6, 0.95, 'matted'], [-13.6, 2.8, 2.2, 0.9, 'matted'], [-19.0, 8.6, 1.8, 0.85, 'matted'], [-9.8, 3.4, 2.0, 0.9, 'matted'], [-12.2, 10.6, 1.6, 0.8, 'matted'],
];

// ---- planting through the vegetation helper (game.vegetation.place when it exists, else game.vegetation.field) ----
// [kind, x, z, opts]: poincianas (red flowering), hibiscus / bougainvillea bushes, sea grape, palms, gumbo limbo. Seven kinds
// only: every kind is its own instanced vegetation field (LOD meshes + shadows), so new kinds cost draw calls
// r7b: the low north view from the drive (MAIN mock-up 14) sees the west deck over an open grassy island: the palm, bed and hibiscus
// that stood in that line are gone or moved
export const PLANTING = [   // inside the lot only (r2-veg plants the verges and the neighbors' yards from its own module)
  // the planter's bougainvillea (library, volume shaded), rooted in the box soil: yOff = the box's soil height
  // a big loose cascading mound (lead review): three overlapping plants at different scales / turns, two hanging over the box's street and
  // deck-side edges (lower yOff: they spill down the lattice), green tropical foliage at the base
  ['bougainvillea_hd', -10.4, 12.35, { s: 1.25, ry: 0.4, yOff: 0.62 }], ['bougainvillea_hd', -11.6, 12.55, { s: 1.05, ry: 2.3, yOff: 0.62 }],
  ['bougainvillea_hd', -9.4, 11.75, { s: 0.9, ry: 4.4, yOff: 0.3 }], ['bougainvillea_hd', -10.85, 11.7, { s: 0.75, ry: 5.6, yOff: 0.25 }],
  ['tropical_bed', -10.9, 13.1, { s: 0.55 }], ['fern_clump', -9.2, 12.9, { s: 1.0 }],
  // palmetto-like clumps (volume-shaded library beds / ferns in place of the card palmettos of part 50)
  ['tropical_bed', -22.4, -9.2, { s: 0.75 }], ['fern_clump', -20.9, -5.4, { s: 1.3 }], ['fern_clump', -20.6, 3.6, { s: 1.3 }],
  ['tropical_bed', -18.9, 12.9, { s: 0.75 }], ['fern_clump', -19.3, 11.0, { s: 1.3 }], ['tropical_bed', -13.6, 18.2, { s: 0.7 }], ['tropical_bed', -11.0, 23.5, { s: 0.7 }],
  ['fern_clump', -19.2, -11.4, { s: 1.2 }], ['fern_clump', -11.6, 16.0, { s: 1.2 }],
  ['poinciana', -27.5, -6.5, { s: 1.0, seed: 7, model: 'poinciana_hd1' }],   // QA first-minutes #5 / #6: back from the classic (its limbs ran through the car, the trunk capsules stopped it)                          // red crown over the classic, right edge of the deck view (mock-up)
  // the big dense dark-green mass right of center, behind the right-hand bins, hiding the roll-off's far end (mock-up)
  ['green_shrub', -20.2, 7.9, { s: 2.0 }], ['tropical_leaf', -23.6, 6.4, { s: 2.0 }], ['rubber_fig', -25.2, 4.0, { s: 0.9 }], ['hibiscus', -27.4, 4.0, { s: 0.9, model: 'hibiscus_hd' }],
  // lush left side of the deck view (mock-up: palms and dense shrubs behind the planter, left of the truck)
  ['coconut', -6.6, 16.5, { s: 1.1, lean: [0.3, 0.4], model: 'coconut_palm' }], ['green_shrub', -6.0, 12.6, { s: 1.6 }], ['tropical_leaf', -7.2, 19.8, { s: 1.8 }],
  ['tropical_bed', -8.2, 14.6, { s: 1.2 }], ['tropical_palm', -5.6, 22.2, { s: 1.0 }], ['tropical_leaf', -3.6, 15.8, { s: 1.6 }],
  ['coconut', -4.8, 13.5, { s: 1.0, lean: [0.5, 0.3], model: 'coconut_palm' }], ['coconut', -2.4, 19.0, { s: 1.1, lean: [-0.3, 0.5], model: 'coconut_palm' }],   // tall palms left of the deck view
  ['seagrape', 0.5, 23.5, { s: 1.0 }], ['hibiscus', -7.0, 21.0, { s: 1.0, model: 'hibiscus_hd' }], ['tropical_leaf', -10.5, 21.5, { s: 1.4 }],
  ['gumbo', -22.5, -9.5, { s: 1.05, seed: 3 }], ['sabal', -22.0, -6.0, { s: 0.9 }],
  ['seagrape', 9.0, 4.0, { s: 1.0 }], ['coconut', 9.5, -4.0, { s: 0.95, lean: [-0.4, 0.6] }], ['fern_clump', -12.6, 1.2, { s: 0.8 }],
  // r8 (SPEC F): the neighbor's strip across the canal: a big sea grape and a gumbo limbo over the canal, palms and low green beyond
  ['seagrape', 23.07, 0.81, { s: 1.5 }], ['gumbo', 24.36, 8.77, { s: 1.15, seed: 5 }], ['tropical_leaf', 18.74, 15.2, { s: 1.4 }],
  ['coconut', 20.62, 24.45, { s: 1.05, lean: [0.2, 0.4], model: 'coconut_palm' }], ['green_shrub', 13.36, 28.14, { s: 1.3 }], ['seagrape', 30.79, 5.84, { s: 1.3 }],
];

// ---- weed clumps (part 05 weeds): [x, z, radius, count, size] where weeds really grow: around rocks, posts, bins, the planter
// foot, the drive's middle strip between the ruts, and the lot edges (the rest of the yard is trodden bare)
export const WEEDS = [
  [-12.6, 12.4, 1.0, 40, 1.1], [-18.2, 9.2, 0.9, 34, 1.1], [-10.8, 12.9, 1.6, 50, 1.1], [-10.8, 11.8, 1.4, 40, 1.0],   // bins, planter foot
  [-13.3, 25.5, 0.6, 28, 1.2], [3.0, 27.6, 0.6, 26, 1.2], [-33.5, 10.5, 0.6, 22, 1.1], [-26.95, 16.47, 0.5, 20, 1.1],   // pole and mailbox feet
  [-14.55, 23.73, 0.5, 18, 1.0], [-27.3, 21.2, 0.5, 16, 1.0], [-20.4, 30.7, 0.5, 16, 1.0],   // STOP feet
  [-15.6, 12.0, 0.35, 22, 1.0], [-16.8, 16.2, 0.3, 18, 1.0], [-13.6, 8.0, 0.3, 16, 0.9],   // between the ruts
  [-21.5, 15.8, 1.8, 60, 1.2], [-14.5, 3.5, 2.0, 55, 1.2], [-11.5, 4.8, 1.2, 30, 1.0], [-22.0, 3.0, 2.5, 60, 1.3], [-6.0, 25.5, 2.5, 60, 1.2],
  [2.0, 26.0, 2.5, 55, 1.2], [8.5, 20.0, 2.5, 55, 1.3], [-22.0, -4.0, 2.5, 50, 1.3], [9.5, -2.0, 2.5, 50, 1.3],   // verges, lot edges
  [-26.0, 0.0, 2.4, 60, 1.2], [-23.6, 3.4, 1.2, 30, 1.2],   // roll-off skirt (r4-keys: follows the roll-off)
  [-17.9, 13.6, 0.8, 20, 1.0], [-18.6, 14.4, 0.8, 20, 1.1], [-17.5, 8.0, 0.8, 18, 1.0], [-9.8, 26.6, 0.9, 22, 1.1], [-6.0, 27.2, 0.9, 22, 1.1], [1.0, 27.6, 0.8, 20, 1.0], [8.5, 27.3, 0.9, 22, 1.1], [-25.0, 8.6, 0.9, 22, 1.1],   // rocks
];
