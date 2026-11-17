// Nico's front yard and street corner, hand placed (track: keys, r2-keys). Target: docs/v2/plan/nico_house/0_front_deck_mockup.webp,
// seen from the west deck (MOCKUP_CAM below). HOUSE-LOCAL meters (same frame as plan.js): +X east of the plan, +Z toward the street,
// y = 0 at the yard grade. The house is turned 0.72 rad in its lot (nicoHouse.v2.js HOUSE_YAW), so the lot is a corner lot:
// Pelican Point Ln (east leg, edge 3210) runs along the front at z ~ 30 (asphalt edge z ~ 27.3 at x = -10, 28.4 at x = 0..8) into the
// STOP corner J at (-20.9, 23.8); the west leg (3215) leaves J along (-0.51, -0.86) down the lot's west side (asphalt edge x ~ -22.2
// at z = 15, -28 at z = 5); the north leg leaves J toward (-26.5, 32.5). Positions of the cars, bins, planter, poles, STOP, puddle
// and roll-off were unprojected from the mock-up through the fitted camera, then nudged off the asphalt. Every item is an explicit
// choice; nothing is scattered at random. Headings: 0 faces +Z, PI faces the house. Sizes in meters.

// the mock-up camera (fitted to the deck rail corner and the STOP corner; tools/v2/keys/spots_refs.json r0b_deck)
export const MOCKUP_CAM = { eye: [-8.33, 4.65, 1.25], look: [-16.75, -2.32, 18.0], fov: 51 };
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
export const DRIVE = { main: [[-19.0, 21.6], [-17.4, 18.4], [-16.2, 14.0], [-15.0, 9.8], [-12.4, 6.2]], branch: [[-12.4, 6.2], [-8.5, 4.9], [-4.5, 4.4]], halfWidth: 2.3 };

// ---- white lattice planter box between the deck and the drive (bougainvillea grows out of it, part 50) ----
// [ax, az, bx, bz] runs; height of the lattice, depth of the box
export const PLANTER = { runs: [[-12.1, 12.35, -9.55, 12.35]], h: 0.78, depth: 0.85,
  plants: [ // bougainvillea in the box (x, z, size, hue: 'magenta' | 'coral')
    { x: -11.6, z: 12.35, s: 0.75, hue: 'magenta' }, { x: -10.75, z: 12.35, s: 1.1, hue: 'magenta' }, { x: -9.95, z: 12.3, s: 1.25, hue: 'magenta' }] };   // fuller toward the deck end, the bins stay in view

// ---- bins: model piece of keys/bins.glb, heading (front: 0 = +Z), tint ----
export const BINS = [
  { x: -12.85, z: 12.75, piece: 'trashcan_blue', h: 2.7, tint: [1.0, 1.0, 1.05] },   // by the planter (mock-up: two blue carts, a galvanized can in front)
  { x: -12.95, z: 13.5, piece: 'trashcan_blue', h: 2.45, tint: [0.88, 0.92, 1.0] },
  { x: -12.25, z: 11.75, can: 'galv', h: 0 },
  { x: -18.05, z: 9.45, piece: 'trashcan_blue', h: 2.3, tint: [0.95, 0.95, 1.0] },   // the pair beyond the classic's hood
  { x: -18.5, z: 8.85, piece: 'trashcan_blue', h: 2.6, tint: [0.9, 0.93, 1.02] },
];

// ---- STOP signs: all-way stop at J. face: heading the plate faces ----
export const STOPS = [
  { x: -17.6, z: 20.8, face: 2.2, lean: 0.03 },     // near corner (east leg / west leg), the one framed from the deck
  { x: -25.4, z: 23.7, face: -2.6, lean: -0.02 },   // west leg, northbound
  { x: -20.25, z: 28.3, face: -0.57, lean: 0.015 }, // north leg, southbound
];

// ---- wooden utility poles: [x, z, height, lean, crossarm yaw (square to the wires)]; wires: [poleA, poleB | WIRE_ENDS key], sag in m.
// Pole 0 is the corner pole of the mock-up (transformer, street lamp) and carries the house's service drop (part 40) ----
export const POLES = [[-13.3, 25.5, 9.6, 0.012, 1.4], [3.0, 27.6, 9.4, -0.02, 1.57], [-31.5, 13.3, 9.4, 0.015, 1.05]];
export const WIRE_ENDS = { east: [[24, 9.4, 27.2], [24.2, 9.4, 28.1], [24.4, 9.4, 29.0]], west: [[-40, 9.4, -2.5], [-40.8, 9.4, -2.1], [-41.6, 9.4, -1.7]], north: [[-33, 9.4, 44], [-33.8, 9.4, 43.6], [-34.6, 9.4, 43.2]] };
export const WIRES = [{ a: 0, b: 1, n: 3, sag: 0.9 }, { a: 0, b: 2, n: 3, sag: 0.8 }, { a: 1, b: 'east', n: 3, sag: 1.0 }, { a: 2, b: 'west', n: 3, sag: 1.1 }, { a: 2, b: 'north', n: 2, sag: 1.0 }];
export const SERVICE_POLE = 0;   // index into POLES: the service drop from the house mast lands here

// ---- the mailbox at the drive mouth (part 45), facing the west leg ----
export const MAILBOX = { x: -19.4, z: 18.2, h: -1.03 };

// ---- red roll-off on the far verge of the west leg (the neighbor's tear-out), long side to the deck, right of the STOP (mock-up) ----
export const DUMPSTER = { x: -29.4, z: 19.6, heading: 0.54, scale: 0.8, tint: [1.0, 1.0, 1.0] };

// ---- pale limestone / coral boulders: [x, z, piece (1..6 of keys/rocks.glb), scale, heading, sink] ----
export const ROCKS = [
  [-17.9, 13.6, 2, 0.22, 0.4, 0.04], [-18.15, 12.7, 5, 0.18, 2.1, 0.03], [-19.6, 14.0, 1, 0.2, 1.2, 0.04], [-17.5, 8.0, 6, 0.2, 4.0, 0.04],   // drive edge (mock-up)
  [-9.8, 26.6, 3, 0.26, 2.6, 0.05], [-6.0, 27.2, 4, 0.3, 0.9, 0.06], [-3.0, 27.6, 2, 0.24, 5.1, 0.04], [1.0, 27.6, 5, 0.26, 3.3, 0.05], [5.5, 27.6, 1, 0.22, 0.2, 0.04], [8.5, 27.3, 6, 0.28, 1.7, 0.05],   // frontage on the east leg
  [-25.2, 3.5, 3, 0.25, 1.0, 0.05], [-25.0, 8.6, 4, 0.22, 2.0, 0.04],   // west verge
  [-6.5, 15.0, 3, 0.16, 1.0, 0.03], [-3.0, 19.5, 6, 0.17, 0.5, 0.03], [-15.0, 2.0, 2, 0.2, 3.9, 0.04],
];

// ---- clutter and debris (own models, part 55): kind, x, z, heading, extra ----
export const DEBRIS = [
  { k: 'pallet', x: -19.9, z: 16.0, h: 0.5, tilt: 0.05 }, { k: 'pallet', x: -19.75, z: 15.85, h: 0.62, y: 0.13 }, { k: 'drywall', x: -31.4, z: 15.2, h: 1.0 },
  { k: 'lumber', x: -21.0, z: 1.5, h: 1.3 }, { k: 'bucket', x: -19.6, z: 12.4, h: 0 }, { k: 'tire', x: -27.0, z: 24.4, h: 0, flat: true }, { k: 'cinder', x: -9.4, z: 7.1, h: 0.4 },
  { k: 'cinder', x: -9.1, z: 7.5, h: 1.1 }, { k: 'cooler', x: 2.9, z: 10.6, h: 2.3 }, { k: 'chair', x: 2.1, z: 11.5, h: 3.6 },
  { k: 'chair', x: 3.7, z: 11.2, h: 2.4, tipped: true }, { k: 'husks', x: -5.6, z: 14.2, h: 0 }, { k: 'husks', x: -2.0, z: 19.8, h: 1 },
  { k: 'tarp', x: -21.5, z: -6.0, h: 0.4 }, { k: 'bucket', x: 2.4, z: 9.8, h: 0, color: 0xe25a1c },
];

// ---- yard surface: puddles (fill with the weather's puddle level), tire tracks, leaf-litter / shell / matted-grass patches ----
// the drive-end puddle (user review): in the low spot where the drive meets the STOP corner; it fills after rain and dries out
export const CORNER_PUDDLE = null;
// small sticks, twigs, palm-frond bits and bark scraps: [x, z, radius, count]
export const STICKS = [[-14.5, 12.5, 3.0, 24], [-19.5, 13.5, 2.5, 20], [-11.0, 7.5, 2.5, 16], [-20.5, 4.5, 3.0, 20], [-6.0, 18.0, 2.5, 14], [2.0, 16.0, 2.5, 14], [-21.0, -4.0, 3.0, 18]];
// [x, z, half length, half width, yaw]: small rut puddles (decals). The drive-end puddle is r2-ground's patchPuddles on the yard sheet
// itself over the sheet's low spot (DRIVE_PUDDLE; nicoHouse.v2.js): fills while it rains, shrinks back as the weather dries
export const DRIVE_PUDDLE = { x: -16.4, z: 17.6, r: 2.1 };
export const PUDDLES = [[-14.4, 10.6, 1.0, 0.35, 0.35], [-12.9, 6.1, 0.8, 0.3, -0.2], [-16.7, 15.2, 1.1, 0.4, 0.3], [-9.0, 9.5, 1.2, 0.4, 0.6]];
export const TRACKS = [   // polylines of the left / right tire, width 0.3 (soft, darker, slightly sunk)
  { pts: [[-18.8, 21.2], [-17.4, 18.4], [-16.2, 14.0], [-15.0, 9.8], [-12.6, 6.6]], gauge: 1.7 },
  { pts: [[-14.0, 8.0], [-16.5, 7.4], [-18.0, 6.2]], gauge: 1.55 },
];
export const LITTER = [   // [x, z, radius, density 0..1, kind: 'shell' (crushed shell / marl dust) | 'matted' | 'leaves']
  // pale crushed-shell ground where the cars park and turn, from the house to the drive mouth (mock-up)
  [-13.5, 8.5, 6.0, 1.0, 'shell'], [-16.5, 15.0, 4.5, 0.95, 'shell'], [-18.5, 5.0, 4.5, 0.85, 'shell'], [-9.0, 6.0, 4.0, 0.85, 'shell'], [-5.0, 9.0, 4.0, 0.8, 'shell'], [-18.2, 19.6, 2.6, 0.8, 'shell'],
  // the worn shell path from the bay stair's foot toward the dock landing
  [2.5, -9.5, 2.2, 0.9, 'shell'], [5.5, -12.5, 2.0, 0.85, 'shell'], [8.5, -15.5, 2.1, 0.85, 'shell'], [11.5, -18.5, 2.2, 0.8, 'shell'],
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
];

// ---- planting through the vegetation helper (game.vegetation.place when it exists, else game.vegetation.field) ----
// [kind, x, z, opts]: poincianas (red flowering), hibiscus / bougainvillea bushes, sea grape, palms, gumbo limbo. Seven kinds
// only: every kind is its own instanced vegetation field (LOD meshes + shadows), so new kinds cost draw calls
export const PLANTING = [   // inside the lot only (r2-veg plants the verges and the neighbors' yards from its own module)
  ['poinciana', -20.9, 7.4, { s: 1.1, seed: 7, model: 'poinciana_c' }],                        // red crown over the classic (mock-up, right edge; the roll-off stays clear)
  ['seagrape', -20.6, 14.4, { s: 0.85, model: 'green_shrub' }], ['hibiscus', -23.4, 2.0, { s: 0.9 }],   // the green mass beyond the bins, toward the west leg
  ['coconut', -4.8, 13.5, { s: 1.0, lean: [0.5, 0.3], model: 'coconut_palm' }], ['coconut', -2.4, 19.0, { s: 1.1, lean: [-0.3, 0.5], model: 'coconut_palm' }],   // tall palms left of the deck view
  ['seagrape', 0.5, 23.5, { s: 1.0 }], ['hibiscus', -7.0, 21.0, { s: 1.0 }], ['seagrape', -10.5, 21.5, { s: 0.9, model: 'green_shrub' }],
  ['gumbo', -22.5, -9.5, { s: 1.05, seed: 3 }], ['coconut', -21.5, -2.0, { s: 1.0, lean: [0.8, 0.3] }], ['sabal', -22.0, -6.0, { s: 0.9 }],
  ['seagrape', 9.0, 4.0, { s: 1.0 }], ['coconut', 9.5, -4.0, { s: 0.95, lean: [-0.4, 0.6] }], ['hibiscus', -12.6, 1.2, { s: 0.8 }],
];

// ---- weed clumps (part 05 weeds): [x, z, radius, count, size] where weeds really grow: around rocks, posts, bins, the planter
// foot, the drive's middle strip between the ruts, and the lot edges (the rest of the yard is trodden bare)
export const WEEDS = [
  [-12.6, 12.4, 1.0, 40, 1.1], [-18.2, 9.2, 0.9, 34, 1.1], [-10.8, 12.9, 1.6, 50, 1.1], [-10.8, 11.8, 1.4, 40, 1.0],   // bins, planter foot
  [-13.3, 25.5, 0.6, 28, 1.2], [3.0, 27.6, 0.6, 26, 1.2], [-31.5, 13.3, 0.6, 22, 1.1], [-19.4, 18.2, 0.5, 20, 1.1],   // pole and mailbox feet
  [-17.6, 20.8, 0.5, 18, 1.0], [-25.4, 23.7, 0.5, 16, 1.0], [-20.25, 28.3, 0.5, 16, 1.0],   // STOP feet
  [-15.6, 12.0, 0.35, 22, 1.0], [-16.8, 16.2, 0.3, 18, 1.0], [-13.6, 8.0, 0.3, 16, 0.9],   // between the ruts
  [-21.5, 15.8, 1.8, 60, 1.2], [-14.5, 3.5, 2.0, 55, 1.2], [-11.5, 4.8, 1.2, 30, 1.0], [-22.0, 3.0, 2.5, 60, 1.3], [-6.0, 25.5, 2.5, 60, 1.2],
  [2.0, 26.0, 2.5, 55, 1.2], [8.5, 20.0, 2.5, 55, 1.3], [-22.0, -4.0, 2.5, 50, 1.3], [9.5, -2.0, 2.5, 50, 1.3],   // verges, lot edges
  [-29.4, 19.6, 2.4, 60, 1.2], [-31.0, 16.0, 1.2, 30, 1.2],   // roll-off skirt
  [-17.9, 13.6, 0.8, 20, 1.0], [-19.6, 14.0, 0.8, 20, 1.1], [-17.5, 8.0, 0.8, 18, 1.0], [-9.8, 26.6, 0.9, 22, 1.1], [-6.0, 27.2, 0.9, 22, 1.1], [1.0, 27.6, 0.8, 20, 1.0], [8.5, 27.3, 0.9, 22, 1.1], [-25.0, 8.6, 0.9, 22, 1.1],   // rocks
];
