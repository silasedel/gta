// Hand placements of the rare library cars: ONE of each on the whole map, at a fitting spot, never in random traffic.
// at = anchor (world x, z); the car parks at the nearest free curb spot within r meters once the player comes near.
export const RARE_PLACEMENTS = [
  {
    key: 'super5',
    at: [2112, -372],
    r: 70,
    color: 0x1d3f8f,
    note: 'Golden Palm Casino valet, Collins Ave (Miami Beach)',
  },
  { key: 'super6', at: [2398, 640], r: 90, color: 0xb3121b, note: 'Ocean Drive, South Beach' },
  { key: 'super3', at: [2392, 780], r: 90, color: 0xffc21a, note: 'Ocean Drive, south end' },
  { key: 'suv7', at: [60, 1800], r: 120, color: 0x301d08, note: 'Brickell tower forecourt' },
  { key: 'super4', at: [420, -120], r: 90, color: 0xa9aeb4, note: 'Downtown hotel valet' },
  {
    key: 'conv2',
    at: [2300, -900],
    r: 120,
    color: 0xeeeeea,
    note: 'Miami Beach, Collins Ave north',
  },
];

// Utility vehicles (user downloads, Nov 19): parked off the road where they belong, spawned by glb/spots.js once the player
// comes within 400 m (nothing exists or thinks before that). One of these per spot:
//   at:    [x, z] world anchor, or  house: [x, z] in Nico's house-local frame (+Z toward the street, nicoHouse.toWorld)
//   heading (world, or house-local with house), r = how far (m) the spot may slide to clear solids / other cars / roads
export const UTILITY_SPOTS = [
  // Nico's yard (Key Largo): the ATV on the sandy pad right of his pickup, the single-seat UTV farther out toward the street
  { key: 'atv1', house: [5.5, 8.0], heading: 0, r: 5, note: "Nico's yard, beside the pickup" },
  { key: 'utv2', house: [7.0, 14.0], heading: 0.2, r: 6, note: "Nico's yard, toward the street" },
  // Southline Air Station (Key West): the crew UTV "mule" inside the fence between the long hangar and the quonset hangars,
  // nose to the flight line (~70 m from the parked jets and taxiway A, ~100 m from the gate and its barrier chicane)
  {
    key: 'utv1',
    at: [-4512, 6160],
    heading: -1.331,
    r: 8,
    color: 0x4a5a3e,
    note: 'Air station, by the hangars',
  },
  // Miami International: an electric cart on the GA apron, in front of the quonset hangar (~130 m from the GA stands)
  {
    key: 'golf1',
    at: [-1305, 812],
    heading: 3.107,
    r: 10,
    color: 0xf2f2ef,
    note: 'MIA GA apron, quonset hangar',
  },
  // baggage carts in a row on the terminal apron, between gates G2 and G3, 14 m out from the terminal face (~70 m from the
  // taxilane), nose to tail along the face (5 m apart: the spot check keeps ~4.2 m to other cars)
  { key: 'bagcart1', at: [-1220.9, 1087.4], heading: 0.998, r: 4, note: 'MIA terminal apron' },
  { key: 'bagcart1', at: [-1216.7, 1090.1], heading: 0.998, r: 4, note: 'MIA terminal apron' },
  { key: 'bagcart1', at: [-1212.5, 1092.8], heading: 0.998, r: 4, note: 'MIA terminal apron' },
];
