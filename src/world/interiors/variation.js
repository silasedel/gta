// Variation: a seeded profile per store so no two stores match (layout variant, fixture family, palette, signage, stock mix, wear,
// clutter, staff, lore). Store types refine the base profile in profile(base, ctx); standouts override it by hand.
import { rng, hsl, mixc, shade } from './kit/util.js';

const FIRST = [
  'Yolanda',
  'Rafael',
  'Marisol',
  'Hector',
  'Odalys',
  'Ernesto',
  'Dayana',
  'Tomás',
  'Caridad',
  'Lázaro',
  'Ines',
  'Wilfredo',
  'Nadia',
  'Samir',
  'Priya',
  'Desmond',
  'Keisha',
  'Andre',
  'Mei',
  'Viktor',
  'Rosa',
  'Bao',
  'Fatima',
  'Jean-Luc',
  'Marguerite',
  'Darnell',
  'Lucía',
  'Osvaldo',
  'Tamara',
  'Gus',
];
const LAST = [
  'Ruiz',
  'Delgado',
  'Fonseca',
  'Quintana',
  'Morales',
  'Abreu',
  'Patel',
  'Haddad',
  'Nguyen',
  'Baptiste',
  'Okafor',
  'Castellanos',
  'Pierre',
  'Santana',
  'Varela',
  'Kowalski',
  'Mendoza',
  'Trujillo',
  'Louis',
  'Acosta',
  'Ferrer',
  'Cabrera',
  'Singh',
  'Reyes',
  'Dumas',
  'Peralta',
];
export const personName = (R) => `${R.pick(FIRST)} ${R.pick(LAST)}`;
const NEUTRALS = [
  [236, 232, 222],
  [228, 226, 220],
  [240, 234, 216],
  [222, 228, 226],
  [234, 226, 214],
  [226, 222, 230],
];

// tier: 'budget' | 'mid' | 'luxury' (from the district / brand); returns the base profile every type starts from
export function baseProfile(seed, sf = {}, type = {}) {
  const R = rng(seed, 'profile'),
    variant = (sf.variant ?? R.int(0, (type.variants || 6) - 1)) % (type.variants || 6),
    tier =
      sf.tier ||
      R.weighted([
        ['budget', 3],
        ['mid', 5],
        ['luxury', 1],
      ]);
  const hue = R() * 360,
    accent = hsl(hue, R.range(0.55, 0.85), R.range(0.38, 0.52)),
    secondary = hsl(hue + R.pick([150, 180, 210, 30]), R.range(0.4, 0.8), R.range(0.45, 0.62)),
    neutral = R.pick(NEUTRALS);
  const wear =
      tier === 'luxury'
        ? R.range(0, 0.15)
        : tier === 'mid'
          ? R.range(0.1, 0.5)
          : R.range(0.35, 0.95),
    since = 2026 - Math.round(R.range(1, 6) ** 2.1);
  return {
    seed,
    variant,
    tier,
    wear,
    clutter: R.range(0.35, 1),
    stock: R.range(0.72, 0.98),
    priceK:
      tier === 'luxury'
        ? R.range(1.15, 1.4)
        : tier === 'budget'
          ? R.range(0.92, 1.05)
          : R.range(1, 1.15),
    accent,
    secondary,
    neutral,
    trim: mixc(neutral, [60, 60, 60], 0.15),
    doorC: mixc(neutral, [120, 100, 80], 0.2),
    doorFrame: null,
    lamp: R.weighted([
      ['coolwhite', 4],
      ['neutral', 3],
      ['daylight', 1],
      ['warm', 2],
    ]),
    floor: ['vct', { c: shade(neutral, -0.02) }],
    wall: { surf: ['paint', { c: neutral }], base: mixc(neutral, [40, 40, 40], 0.5) },
    ceil: { type: 'drop' },
    facade: { style: R.pick(['aluminum', 'bronze', 'black', 'tile', 'aluminum']), awning: null },
    hours: [7, 22],
    open24: false,
    owner: personName(R),
    since,
    music: { genre: 'pop', volume: 0.5 },
    name: sf.name || null,
    brand: null,
    lore: {
      owner: null,
      since,
      story: '',
      regulars: [personName(R), personName(R), personName(R)],
    },
    R,
  };
}
