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
