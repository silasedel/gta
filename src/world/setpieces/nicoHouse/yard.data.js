// Nico's front yard and street corner, hand placed (track: keys). Target: docs/v2/plan/nico_house/0_front_deck_mockup.webp
// (front deck view of the corner), 1_front_street.webp, 5_aerial_neighborhood.webp.
// HOUSE-LOCAL meters (same frame as plan.js): +X east of the plan, +Z toward the street, y = 0 at the yard grade.
// Street geometry here (layout.json nico_house at (-873.6, 4825.2), heading 1.057): Pelican Point Ln runs along the front
// from the T corner at (0, 31.7) west-south-west to the junction at (-24.7, 23.5); its north (yard-side) asphalt edge is about
// z = 28.5 + 0.332 (x - 1) for x < 1 and z = 28.3 for x = 1..10; the south leg leaves the corner toward (1.5, 41.9); the east leg
// (3210) heads east-north-east. Every item below is an explicit choice; nothing is scattered at random.
// Headings: 0 faces +Z (toward the street), PI faces the house. Sizes in meters.

// ---- parked cars: spots for the cars helper (game.vehicles.spawnParked, Nov 17). Until it exists, nothing spawns here. ----
export const CAR_SPOTS = [
  // the gray lifted pickup, nose in toward the deck, a little skewed (mock-up: right below the front deck)
  { id: 'nico_pickup', kind: 'pickup', look: 'gray_lifted', x: -3.6, z: 14.6, heading: Math.PI - 0.12, locked: false, owner: 'nico' },
  // the rusty two-tone classic sedan on the matted grass to the west, nose toward the house, angled
  { id: 'nico_classic', kind: 'classic_sedan', look: 'rusty_seafoam', x: -10.4, z: 15.4, heading: Math.PI + 0.3, locked: true, owner: 'nico' },
];

// ---- white lattice planter box on the street side (bougainvillea grows out of it, part 50) ----
// [ax, az, bx, bz] runs; height of the lattice, depth of the box
export const PLANTER = { runs: [[1.2, 25.0, 6.8, 25.0], [6.8, 25.0, 6.8, 22.3]], h: 0.78, depth: 0.85,
  plants: [ // bougainvillea in the box (x, z, size, hue: 'magenta' | 'coral')
    { x: 2.2, z: 25.0, s: 1.15, hue: 'magenta' }, { x: 4.3, z: 25.0, s: 1.3, hue: 'magenta' }, { x: 6.0, z: 24.9, s: 1.0, hue: 'coral' }, { x: 6.8, z: 23.2, s: 0.95, hue: 'magenta' }] };

// ---- bins at the curb, in pairs, lids shut or ajar: model piece of keys/bins.glb, heading (front to the street), tint ----
export const BINS = [
  { x: 0.15, z: 26.85, piece: 'trashcan_blue', h: 0.18, tint: [1.0, 1.0, 1.05] },
  { x: -0.62, z: 26.95, piece: 'trashcan_blue', h: -0.1, tint: [0.88, 0.92, 1.0] },
  { x: 0.95, z: 26.2, can: 'galv', h: 0 },                       // round galvanized can with a dented lid (own model)
  { x: -13.2, z: 22.4, piece: 'trashcan_blue', h: 0.42, tint: [0.95, 0.95, 1.0] },   // the neighbor-side pair by the classic car
  { x: -13.95, z: 22.15, piece: 'trashcan_grey', h: 0.3, tint: [1.0, 0.98, 0.95] },
];

// ---- STOP signs: all-way stop at the T in front of the house (Keys side streets). face: heading the plate faces ----
export const STOPS = [
  { x: -6.7, z: 34.4, face: -1.89, lean: 0.03 },   // south-west corner, for eastbound traffic along the front (seen from the deck)
  { x: 5.3, z: 35.9, face: 0.15, lean: -0.02 },    // south leg (northbound)
  { x: 5.6, z: 27.1, face: 1.57, lean: 0.015 },    // east leg (westbound), on Nico's side next to the planter
];

// ---- wooden utility poles on Nico's side and the drops (the house's own service pole is part 40, at (-21.5, 15.5)) ----
// poles [x, z, height, lean]; wires: [poleA, poleB] indices into POLES (or 'mast' = the house service mast), sag in m
export const POLES = [[-9.0, 26.0, 9.6, 0.012], [9.6, 27.0, 9.4, -0.02]];
export const WIRES = [{ a: 0, b: 1, n: 3, sag: 0.9 }, { a: 0, b: 'pole40', n: 3, sag: 0.8 }, { a: 1, b: 'east', n: 3, sag: 1.0 }];

// ---- red roll-off construction dumpster on the neighbor's side, with the tear-out spilling around it ----
export const DUMPSTER = { x: -18.2, z: 19.0, heading: 1.25, scale: 0.8, tint: [1.0, 1.0, 1.0] };

// ---- pale limestone / coral boulders along the frontage (ref 1: white rocks at the street edge) and by the drive ----
// [x, z, piece (1..6 of keys/rocks.glb), scale, heading, sink]
export const ROCKS = [
  [-22.6, 20.0, 2, 0.32, 0.4, 0.06], [-20.3, 20.9, 5, 0.28, 2.1, 0.05], [-16.1, 22.2, 1, 0.3, 1.2, 0.06], [-11.8, 23.6, 6, 0.26, 4.0, 0.05],
  [-9.9, 24.2, 3, 0.24, 2.6, 0.04], [-6.4, 25.3, 4, 0.3, 0.9, 0.06], [-4.9, 25.9, 2, 0.22, 5.1, 0.04], [7.8, 27.0, 5, 0.26, 3.3, 0.05],
  [9.0, 26.4, 1, 0.22, 0.2, 0.04], [10.6, 25.9, 6, 0.3, 1.7, 0.06], [-0.9, 18.5, 3, 0.16, 1.0, 0.03], [-6.2, 19.4, 4, 0.18, 2.2, 0.03],
  [3.4, 12.6, 6, 0.17, 0.5, 0.03], [-12.6, 9.8, 2, 0.2, 3.9, 0.04], [-15.2, 12.6, 5, 0.24, 1.4, 0.05],
];

// ---- clutter and debris (own models, part 55): kind, x, z, heading, extra ----
export const DEBRIS = [
  { k: 'pallet', x: -15.6, z: 17.8, h: 0.3, tilt: 0.05 }, { k: 'pallet', x: -15.2, z: 17.6, h: 0.42, y: 0.13 },
  { k: 'drywall', x: -20.6, z: 16.6, h: 1.1 }, { k: 'drywall', x: -21.4, z: 17.4, h: 0.6 }, { k: 'lumber', x: -16.8, z: 21.4, h: 1.3 },
  { k: 'bucket', x: -14.6, z: 19.3, h: 0 }, { k: 'tire', x: -19.6, z: 22.0, h: 0, flat: true }, { k: 'cinder', x: 7.6, z: 21.0, h: 0.4 },
  { k: 'cinder', x: 7.9, z: 20.7, h: 1.1 }, { k: 'cooler', x: 5.2, z: 12.6, h: 2.3 }, { k: 'chair', x: 4.4, z: 13.4, h: 3.6 },
  { k: 'chair', x: 5.9, z: 13.9, h: 2.4, tipped: true }, { k: 'husks', x: -8.8, z: 10.3, h: 0 }, { k: 'husks', x: 9.8, z: 15.6, h: 1 },
  { k: 'tarp', x: -19.0, z: 13.2, h: 0.4 }, { k: 'bucket', x: 2.4, z: 9.8, h: 0, color: 0xe25a1c },
];

// ---- yard surface: puddles (after rain they fill), tire tracks (pairs of ruts), leaf-litter and matted-grass patches ----
export const PUDDLES = [[-3.0, 21.6, 1.6, 0.55, 0.2], [-5.2, 24.9, 2.3, 0.8, -0.3], [-1.6, 17.2, 1.1, 0.4, 0.1], [-9.4, 19.6, 1.2, 0.5, 0.6], [2.1, 27.1, 1.8, 0.6, 0.0]];
export const TRACKS = [   // polylines of the left / right tire, width 0.3 (soft, darker, slightly sunk)
  { pts: [[-4.4, 26.6], [-4.6, 21.0], [-4.3, 16.6], [-3.9, 12.6]], gauge: 1.7 },
  { pts: [[-7.6, 25.8], [-9.0, 21.4], [-10.2, 17.6], [-10.8, 14.4]], gauge: 1.55 },
];
export const LITTER = [   // [x, z, radius, density 0..1, kind: 'leaves' | 'matted' | 'needles']
  [-14.5, 8.5, 4.5, 0.8, 'leaves'], [8.8, 17.0, 3.8, 0.9, 'leaves'], [-19.0, 4.0, 5.5, 0.7, 'leaves'], [-6.5, 21.0, 3.5, 0.5, 'matted'],
  [1.5, 20.5, 4.0, 0.6, 'matted'], [-13.0, 20.0, 3.0, 0.6, 'matted'], [-21.0, 12.0, 4.0, 0.7, 'matted'], [3.0, 26.0, 2.5, 0.8, 'leaves'],
];

// ---- planting through the vegetation helper (game.vegetation.place when it exists, else game.vegetation.field) ----
// [kind, x, z, opts]: poincianas (red flowering), hibiscus / bougainvillea bushes, sea grape, palms
export const PLANTING = [
  ['poinciana', -17.5, 5.5, { s: 1.05, seed: 3 }], ['poinciana', 10.4, 19.5, { s: 0.95, seed: 7 }],
  ['coconut', -23.0, 7.5, { s: 1.0, lean: [0.8, 0.3] }], ['coconut', 11.0, 11.5, { s: 0.92, lean: [-0.4, 0.6] }], ['sabal', -22.4, -3.0, { s: 0.9 }],
  ['hibiscus', -8.6, 23.6, { s: 1.0 }], ['hibiscus', -1.6, 25.2, { s: 0.85 }], ['bougainvillea', 9.2, 23.8, { s: 1.1 }], ['bougainvillea', -14.8, 21.8, { s: 0.9 }],
  ['seagrape', -22.5, 1.0, { s: 1.1 }], ['seagrape', 10.8, 4.0, { s: 1.0 }], ['croton', -12.0, 6.8, { s: 0.9 }], ['croton', 0.8, 9.6, { s: 0.8 }],
  ['hibiscus', -21.2, 15.6, { s: 1.15 }], ['seagrape', -23.2, 13.0, { s: 1.0 }], ['fern', 8.4, 9.0, { s: 1.0 }], ['sawpalmetto', -19.5, -6.5, { s: 1.0 }],
];
