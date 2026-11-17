// Nico's neighbors on Pelican Point Ln, hand placed (track: keys). Small single-story Keys cottages (pastel siding, metal
// roofs) and a couple of stilt houses, each with its own yard so the street never repeats. Built by the house generator
// (src/world/setpieces/houses) from these explicit choices; the extras (boats on trailers, chairs, kayaks, docks, fences
// from the user's models) are placed by keysLots.js. Auto-placed street lots stay out of HAND_R around the house.
// Coordinates: Nico's HOUSE-LOCAL frame (src/world/setpieces/nicoHouse/plan.js: +X east of the plan, +Z toward his street).
//   x, z: house center; face: local heading of the lot's street side (0 = +Z, PI = toward the bay); w, d: house size;
//   gap: house front -> road edge; side / back: yard beyond the house; style, stilt, base: generator inputs;
//   over: generator overrides (colors, fence: 'wood'|'picket'|'chain'|'iron'|'none', frontHedge, hedge, carport, car, bins,
//         palms, shrubs, flamingos, porchStuff, dish, solar, windowAC, shutter, lattice, storage);
//   extras: [{ k, u, v, h, ... }] in the lot frame (u across the front, +u = lot's local +X; v toward the street; h = yaw):
//     k: 'boatTrailer' | 'chairs' | 'kayaks' | 'crabTraps' | 'buoys' | 'propane' | 'picnic' | 'fence' (library rustic fence run
//        from (u, v) to (u2, v2)) | 'rocks' | 'grill';
//   car: spot for the cars helper (game.vehicles.spawnParked) in the lot frame;
//   dock: { model: 'pier_kit' | 'mossy_pier' | 'clean_pier' | 'boathouse', x, z, face, len?, boats: [...] } house-local, face
//         = direction from the shore out over the water.
export const HAND_R = 115;   // auto lots (dressing.v2.js spawn street) stay this far from Nico's house

export const KEYS_LOTS = [
  { // A: the white cottage across the street (mock-up: white siding, board fence and a clipped hedge along the front)
    id: 'pp_white', x: -13.5, z: 41.6, face: 2.82, w: 9.2, d: 7.6, style: 'keys', stilt: false, base: 0.6, gap: 6.2, side: 3.2, back: 6,
    over: { colors: { body: 0xf1ede2, trim: 0xfbfaf6, accent: 0x2f7d82, roof: 0xc3c6c8 }, fence: 'wood', frontHedge: true, hedge: false, car: false, bins: true, palms: 1, shrubs: 4, flamingos: 0, porchStuff: 2, shutter: 'bahama', windowAC: true, dish: false },
    extras: [{ k: 'chairs', u: -2.6, v: 4.6, h: 0.3 }, { k: 'grill', u: 5.6, v: -2.0, h: 1.2 }],
    car: { kind: 'sedan', look: 'faded', u: 6.4, v: 6.0, h: Math.PI },
  },
  { // B: yellow stilt house across the corner, chain-link, a center console on its trailer in the side yard
    id: 'pp_yellow', x: 18.0, z: 43.0, face: -2.61, w: 8.6, d: 7.8, style: 'keys', stilt: true, base: 2.9, gap: 7.0, side: 4.5, back: 5,
    over: { colors: { body: 0xf0d890, trim: 0xf2f0ea, accent: 0x4a6a7a, roof: 0x9aa0a8 }, fence: 'chain', frontHedge: false, hedge: true, car: false, bins: true, palms: 2, shrubs: 3, lattice: true, storage: true, dish: true },
    extras: [{ k: 'boatTrailer', u: -7.2, v: 0.5, h: 0.05, seed: 3 }, { k: 'crabTraps', u: 5.8, v: -3.5, h: 0.4 }, { k: 'buoys', u: 6.4, v: -2.4 }],
    car: { kind: 'pickup', look: 'work', u: 4.2, v: 6.5, h: Math.PI + 0.1 },
  },
  { // C: pink cottage west of Nico's lot (the roll-off is for its tear-out), carport, picket fence, lawn flamingos
    id: 'pp_pink', x: -34.0, z: 0.5, face: -0.68, w: 9.0, d: 7.8, style: 'keys', stilt: false, base: 0.55, gap: 5.6, side: 3.0, back: 6,
    over: { colors: { body: 0xe8b8a8, trim: 0xf6f3ec, accent: 0x6a2a3a, roof: 0x8e9a8e }, fence: 'picket', frontHedge: false, hedge: false, carport: true, car: false, bins: true, palms: 1, shrubs: 5, flamingos: 2, porchStuff: 3 },
    extras: [{ k: 'chairs', u: 2.5, v: 4.2, h: -0.4 }, { k: 'propane', u: -5.6, v: -2.2, h: 0 }, { k: 'kayaks', u: -5.4, v: 1.5, h: 1.5 }],
    car: { kind: 'compact', look: 'sun_faded', u: -6.0, v: 5.0, h: Math.PI },
  },
  { // D: mint cottage on the bend, no fence, a hedge on the quiet side, picnic table under the tree
    id: 'pp_mint', x: -33.0, z: 41.0, face: -2.57, w: 8.4, d: 7.4, style: 'keys', stilt: false, base: 0.7, gap: 5.2, side: 3.5, back: 7,
    over: { colors: { body: 0xc8d8a0, trim: 0xf2f0ea, accent: 0x2a4a6a, roof: 0xb8bcc0 }, fence: 'none', frontHedge: false, hedge: true, car: false, bins: true, palms: 2, shrubs: 3, porchStuff: 1, windowAC: true },
    extras: [{ k: 'picnic', u: -5.0, v: -3.0, h: 0.6 }, { k: 'rocks', u: 0, v: 5.0 }],
    car: { kind: 'van', look: 'old', u: 5.6, v: 5.4, h: Math.PI - 0.1 },
  },
  { // E: blue stilt house east of Nico, storage below, board fence on the side to Nico's
    id: 'pp_blue', x: 22.5, z: 5.0, face: 0.785, w: 8.8, d: 8.0, style: 'keys', stilt: true, base: 3.0, gap: 5.6, side: 3.5, back: 6,
    over: { colors: { body: 0x9ab8d0, trim: 0xf2f0ea, accent: 0x2a4a6a, roof: 0x9aa0a8 }, fence: 'none', frontHedge: false, hedge: false, car: false, bins: true, palms: 1, shrubs: 2, lattice: true, storage: true },
    extras: [{ k: 'fence', u: -7.5, v: 6.0, u2: -7.5, v2: -8.0 }, { k: 'kayaks', u: 6.0, v: -2.0, h: 1.4 }, { k: 'chairs', u: 0.5, v: -6.5, h: 3.0 }],
    car: { kind: 'suv', look: 'faded', u: 6.5, v: 6.0, h: Math.PI },
  },
  { // F: peach cottage inside the loop, facing the south leg, iron fence and a boat on blocks
    id: 'pp_peach', x: -11.5, z: 64.0, face: 1.57, w: 8.0, d: 7.6, style: 'keys', stilt: false, base: 0.5, gap: 4.0, side: 3.0, back: 8,
    over: { colors: { body: 0xe8b8a0, trim: 0xf4efe2, accent: 0x2a6a8a, roof: 0x9aa0a8 }, fence: 'picket', frontHedge: true, hedge: false, car: false, bins: true, palms: 1, shrubs: 3, flamingos: 0 },
    extras: [{ k: 'boatTrailer', u: 5.6, v: -4.0, h: 0.0, seed: 8 }, { k: 'grill', u: -3.0, v: -5.5, h: 0.4 }],
    car: { kind: 'sedan', look: 'old', u: -6.0, v: 4.4, h: Math.PI },
  },
  { // G: sea-green cottage on the loop's west side, screened porch, a boat on blocks behind
    id: 'pp_sea', x: -45.0, z: 62.0, face: -2.06, w: 8.8, d: 7.6, style: 'keys', stilt: false, base: 0.6, gap: 8.4, side: 3.2, back: 7,
    over: { colors: { body: 0x7fb5b0, trim: 0xf2f0ea, accent: 0x2a4a6a, roof: 0x9aa0a8 }, fence: 'chain', frontHedge: false, hedge: true, car: false, bins: true, palms: 2, shrubs: 3, porchStuff: 2 },
    extras: [{ k: 'boatTrailer', u: -6.4, v: -3.0, h: 0.2, seed: 5 }, { k: 'buoys', u: 5.0, v: -4.0 }], car: { kind: 'pickup', look: 'old', u: 6.2, v: 5.0, h: Math.PI },
  },
  { // H: cream cottage at the south end of the loop, picket fence, flamingos
    id: 'pp_cream', x: -25.0, z: 80.0, face: -0.38, w: 9.0, d: 7.4, style: 'keys', stilt: false, base: 0.5, gap: 5.6, side: 3.0, back: 6,
    over: { colors: { body: 0xf0ece0, trim: 0xffffff, accent: 0xa0524a, roof: 0xb8bcc0 }, fence: 'picket', frontHedge: false, hedge: false, car: false, bins: true, palms: 1, shrubs: 5, flamingos: 2 },
    extras: [{ k: 'chairs', u: 3.0, v: 4.0, h: -0.2 }], car: { kind: 'compact', look: 'faded', u: -6.0, v: 5.0, h: Math.PI },
  },
  { // I: orange stilt house on the far side of the south leg, kayaks under it
    id: 'pp_orange', x: 14.0, z: 58.0, face: 0.85, w: 8.4, d: 7.8, style: 'keys', stilt: true, base: 2.8, gap: 5.8, side: 3.5, back: 6,
    over: { colors: { body: 0xe8b8a0, trim: 0xf2f0ea, accent: 0x3a5a4a, roof: 0x8e9a8e }, fence: 'none', frontHedge: false, hedge: false, car: false, bins: true, palms: 2, shrubs: 2, lattice: true, storage: false },
    extras: [{ k: 'kayaks', u: -1.0, v: 0.0, h: 1.57 }, { k: 'crabTraps', u: 5.5, v: -2.5, h: 0.3 }], car: { kind: 'suv', look: 'old', u: -6.2, v: 5.0, h: Math.PI },
  },
  { // K: lime cottage on the corner between the two lanes, iron fence
    id: 'pp_lime', x: -50.0, z: 22.0, face: 2.46, w: 8.2, d: 7.4, style: 'keys', stilt: false, base: 0.55, gap: 7.4, side: 3.0, back: 6,
    over: { colors: { body: 0xc8d8a0, trim: 0xf6f3ec, accent: 0x6a5a4a, roof: 0x9aa0a8 }, fence: 'picket', frontHedge: true, hedge: false, car: false, bins: true, palms: 1, shrubs: 3 },
    extras: [{ k: 'grill', u: -4.0, v: -4.5, h: 0.4 }, { k: 'propane', u: 5.0, v: -2.0, h: 0 }], car: { kind: 'sedan', look: 'sun_faded', u: 6.0, v: 5.0, h: Math.PI },
  },
];

// Waterfront lots on the bay shore north-west of Nico's (the shore runs at about z = -55 there) and the docks along that shore
// (keys_detail.webp shows a dock behind nearly every bay-side house). Lots: same fields as above.
export const KEYS_SHORE_LOTS = [
  { // W1: gray-green stilt house on the cul-de-sac, mossy pier out back
    id: 'pp_w1', x: -63.0, z: -42.0, face: 0.0, w: 8.6, d: 8.0, style: 'keys', stilt: true, base: 2.8, gap: 6.0, side: 3.5, back: 8,
    over: { colors: { body: 0xb0c8c0, trim: 0xf2f0ea, accent: 0x3a5a4a, roof: 0x8e9a8e }, fence: 'none', hedge: true, car: false, bins: true, palms: 2, shrubs: 2, lattice: false, storage: true },
    extras: [{ k: 'crabTraps', u: -5.5, v: -5.0, h: 0.2 }, { k: 'kayaks', u: 5.6, v: -4.5, h: 1.6 }],
    car: { kind: 'pickup', look: 'rusty', u: 6.3, v: 5.0, h: Math.PI },
  },
  { // W2: lavender cottage, the boathouse at the water
    id: 'pp_w2', x: -88.0, z: -43.0, face: 0.35, w: 9.4, d: 7.6, style: 'keys', stilt: false, base: 0.7, gap: 13.5, side: 4.0, back: 8,
    over: { colors: { body: 0xd9c1e0, trim: 0xf6f3ec, accent: 0x2a4a6a, roof: 0xb8bcc0 }, fence: 'picket', frontHedge: false, hedge: false, car: false, bins: true, palms: 2, shrubs: 4, flamingos: 2 },
    extras: [{ k: 'boatTrailer', u: -7.0, v: 1.0, h: 0.0, seed: 12 }, { k: 'chairs', u: 2.0, v: -6.5, h: 3.1 }],   // W2
    car: { kind: 'sedan', look: 'old', u: 6.5, v: 6.0, h: Math.PI },
  },
];
// docks: x, z = a point on land behind the shore, face = heading out over the water (PI = toward the bay, -Z); the builder
// walks out to the first water, puts the land end on the sand just before it and stands the model on piles to the sea bed.
// boats: [{ k: 'rowboat' | 'skiff', side: -1 | 1, along: 0..1 }]
export const KEYS_DOCKS = [
  { id: 'dk_w1', model: 'mossy_pier', x: -63.0, z: -50.0, face: Math.PI + 0.05, boats: [{ k: 'rowboat', side: 1, along: 0.7 }] },
  { id: 'dk_w2', model: 'clean_pier', x: -90.0, z: -50.0, face: Math.PI + 0.3, boats: [{ k: 'rowboat', side: 1, along: 0.55 }] },   // (the boathouse model has 29 materials: ~150 draw calls with shadows)
  { id: 'dk_nw', model: 'clean_pier', x: -34.0, z: -40.0, face: Math.PI - 0.55, boats: [{ k: 'skiff', side: -1, along: 0.65 }] },
  { id: 'dk_ne', model: 'mossy_pier', x: 33.0, z: -32.0, face: -1.75, boats: [{ k: 'rowboat', side: -1, along: 0.6 }] },   // behind the stilt house on the notch's east side
  { id: 'dk_w3', model: 'mossy_pier', x: -118.0, z: -48.0, face: Math.PI - 0.15, boats: [{ k: 'rowboat', side: 1, along: 0.5 }] },
];
