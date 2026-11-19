// Gang definitions (v2.1). All names are original. `kit` is the clothing kit npc-life can use for members
// (see src/jobs/kit.js applyKit, and the hook described in docs/v2/reports/gangs-business.md).
export const GANGS = [
  {
    id: 'garzas',
    name: 'Las Garzas',
    short: 'Garzas',
    home: ['Little Havana', 'West End', 'Brickell'],
    homeName: 'Little Havana',
    color: '#25c4b4',
    color2: '#f2efe6',
    kit: {
      top: [0x1f9e92, 0x25c4b4, 0xf2efe6, 0x17756d],
      bottom: [0xf2efe6, 0xd9d2c0, 0x2b2b2b],
      shoes: [0xf2efe6, 0x1a1a1a],
      hats: ['fedora', 'cap'],
      chain: 0.6,
    },
    car: { type: 'tarpon_classic', color: 0x1f9e92 },
    style: 'disciplined',
    blurb:
      'Old-school crew in teal and white. Calm until you disrespect the block, then they come in numbers.',
    armed: 0.25,
    aggression: 0.4,
    rivals: ['lyric'],
  },
  {
    id: 'lyric',
    name: 'Lyric Boys',
    short: 'Lyric',
    home: ['Overtown', 'Downtown'],
    homeName: 'Overtown',
    color: '#e3b23c',
    color2: '#141414',
    kit: {
      top: [0x141414, 0xe3b23c, 0x1d1d1f, 0xc99a2e],
      bottom: [0x141414, 0x2a2a2a, 0x3b3b3b],
      shoes: [0x141414, 0xe3b23c],
      hats: ['capBack', 'beanie', 'cap'],
      chain: 0.8,
    },
    car: { type: 'cayo_grand', color: 0x141414 },
    style: 'aggressive',
    blurb: 'Black and gold. Quick to escalate, quick to shoot, and they never forget a slight.',
    armed: 0.45,
    aggression: 0.75,
    rivals: ['garzas', 'wolves'],
  },
  {
    id: 'wolves',
    name: 'Paint Wolves',
    short: 'Wolves',
    home: ['Wynwood', 'Edgewater', 'Arts & Entertainment District'],
    homeName: 'Wynwood',
    color: '#e23d9a',
    color2: '#202020',
    kit: {
      top: [0xe23d9a, 0x202020, 0x8a1f5c, 0x2d2d2d],
      bottom: [0x202020, 0x2b3a55, 0x3a3a3a],
      shoes: [0xe23d9a, 0xefefef, 0x202020],
      hats: ['beanie', 'bucket', 'headwrap'],
      chain: 0.3,
    },
    car: { type: 'pico_rs', color: 0xe23d9a },
    style: 'swarm',
    blurb: 'Magenta and black. They hit fast in a pack and scatter when the fight turns.',
    armed: 0.2,
    aggression: 0.55,
    rivals: ['lyric'],
  },
];
export const GANG = Object.fromEntries(GANGS.map((g) => [g.id, g]));
export const TURFS_PER_GANG = 3;
export const TURF_RADIUS = 60;
export const TURF_INCOME_PER_HOUR = [70, 120];
export const TURF_POT_CAP = 2400;
