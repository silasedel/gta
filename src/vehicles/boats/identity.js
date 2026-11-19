// Per-boat identity: everything that makes one boat different from the next one of the same model.
// makeIdentity(def, seed) is deterministic: the same mooring always gets the same boat back.
import { S, rng, hashStr } from './kit.js';
import { BUILDERS, OUTBOARDS, ELECTRONICS } from './brands.js';
import { uniqueName, uniqueReg, hailingPort } from './names.js';

export const HULL_COLORS = {
  white: [0xf6f5f0, 0xf3f1e8, 0xeef1f3, 0xf7f7f4],
  cream: [0xece4cf, 0xe6dcc4],
  ice: [0xbfdcea, 0xa9cfe0, 0xcfe6ee],
  seafoam: [0x9fd8c8, 0xa8dccf, 0x8ccfc0],
  navy: [0x14284a, 0x0f2140, 0x1a2f55],
  blue: [0x1d3f8f, 0x215aa8, 0x2a6fbf],
  teal: [0x0e6e78, 0x128a8c, 0x1a7f86],
  aqua: [0x3fb7c4, 0x58c5cc],
  gray: [0x8d949b, 0xa3a9af, 0xbfc5ca],
  gunmetal: [0x4b5258, 0x3d4349, 0x5a6067],
  black: [0x121417, 0x181a1e],
  red: [0xa8161d, 0xb3121b, 0xc9342a],
  yellow: [0xf2c230, 0xf0b61e],
  orange: [0xf06a1e, 0xe8591a],
  green: [0x1f4a3a, 0x24553f],
  sage: [0x8fb89a, 0x9ac0a2],
  sand: [0xd8cdb0, 0xcfc3a2],
  lime: [0x9be22d, 0x8ad11a],
  purple: [0x5a2f8a, 0x6a3aa0],
  pink: [0xe86a9a],
  olive: [0x565a3c, 0x4b5136],
  alu: [0xb9bec4, 0xaeb4ba, 0xc4c9ce],
};
const W_PLEASURE = {
  white: 46,
  cream: 5,
  ice: 8,
  seafoam: 6,
  navy: 9,
  blue: 5,
  teal: 4,
  aqua: 3,
  gray: 5,
  gunmetal: 3,
  black: 3,
  red: 2,
  yellow: 1,
  sand: 2,
  sage: 1,
};
const CANVAS = [
  0x14233f, 0x101214, 0xf1efe6, 0xb89b6e, 0x1f4a3a, 0x6b1a22, 0x0e6e78, 0x6f757b, 0x1d3f8f,
  0xc9a227,
];
const UPHOLSTERY = [
  [0xf4f1e8, 0xd9d2c0],
  [0xefe9dc, 0x9aa0a6],
  [0xf2efe6, 0x14284a],
  [0xe2d6bc, 0x7a5a3a],
  [0xd9dde0, 0x3d4349],
  [0xf4f1e8, 0x0e6e78],
  [0xf0ebe0, 0xa8161d],
  [0xcfc7b4, 0x4b3a2a],
  [0x2a2d31, 0x8d949b],
  [0xf4f1e8, 0x9fd8c8],
  [0xf2efe6, 0xc9a227],
  [0xb9b2a0, 0x2f3a2f],
];
const DECKS = [
  [0xf4f3ee, 0xe6e2d6],
  [0xf0eee6, 0xd9d4c4],
  [0xe9ecef, 0xd3d8dc],
  [0xefe9dc, 0xd6ccb4],
  [0xf4f3ee, 0xc9d6d8],
  [0xe8e6e0, 0xbfc5ca],
];
const BOTTOMS = [0x7a1f1c, 0x14284a, 0x101214, 0x1c4a6a, 0x23583a, 0x8a2a24];
function weighted(r, table) {
  let t = 0;
  for (const k in table) t += table[k];
  let x = r() * t;
  for (const k in table) {
    x -= table[k];
    if (x <= 0) return k;
  }
  return Object.keys(table)[0];
}
const shade = (hex, k) => {
  const R = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * k))),
    G = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * k))),
    B = Math.max(0, Math.min(255, Math.round((hex & 255) * k)));
  return (R << 16) | (G << 8) | B;
};
const mix = (a, b, t) => {
  const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};
const lum = (hex) =>
  (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255;
export const colorUtil = {
  shade,
  mix,
  lum,
  css: (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0').slice(-6),
};

// def = model definition (catalog). def.look is optional and tunes the roll:
//   look.hull: { family: weight }   look.graphics: [styles]   look.named / look.registered: bool   look.nameKind: 'pleasure'|'work'
//   look.wear: [lo, hi]   look.bottomPaint: probability   look.fixed: { hull, hull2, boot, deck, ... } (police, fire, taxi)
export function makeIdentity(def, seed, opts = {}) {
  const r = rng((seed ^ hashStr(def.key)) >>> 0),
    look = def.look || {};
  const famKey = opts.hullFamily || weighted(r, look.hull || W_PLEASURE);
  const hull = opts.hullColor ?? r.pick(HULL_COLORS[famKey] || HULL_COLORS.white);
  const dark = lum(hull) < 0.45;
  const deckPair = r.pick(DECKS),
    up = r.pick(UPHOLSTERY);
  // accent: a color that reads against the hull
  const accentFam = dark
    ? r.pick(['white', 'ice', 'seafoam', 'yellow', 'gray', 'red'])
    : r.pick(['navy', 'blue', 'teal', 'red', 'black', 'gunmetal', 'aqua', 'green', 'orange']);
  const accent = r.pick(HULL_COLORS[accentFam]);
  const hull2 = r.chance(0.5)
    ? accent
    : r.pick(
        HULL_COLORS[
          r.pick(
            dark
              ? ['white', 'gray', 'ice']
              : ['navy', 'gunmetal', 'ice', 'seafoam', 'gray', 'black'],
          )
        ],
      );
  const graphics =
    opts.graphics ||
    r.pick(
      look.graphics || ['plain', 'plain', 'sheer', 'sheer', 'band', 'swoosh', 'twotone', 'fade'],
    );
  const canvas = r.chance(0.35) ? (dark ? hull : accent) : r.pick(CANVAS);
  const wearR = look.wear || [0.02, 0.55],
    wear = opts.wear ?? wearR[0] + (wearR[1] - wearR[0]) * Math.pow(r(), 1.6);
  const bottomPaint = opts.bottomPaint ?? r.chance(look.bottomPaint ?? 0.6);
  const ob = OUTBOARDS[opts.engineBrand || r.pick(look.engineBrands || Object.keys(OUTBOARDS))];
  const cowlWhite = ob.cowl.findIndex((c) => lum(c) > 0.7);
  const cowl =
    r.chance(0.25) && cowlWhite >= 0 && !dark
      ? ob.cowl[cowlWhite]
      : r.chance(0.12)
        ? hull
        : r.pick(ob.cowl);
  const builder = BUILDERS[def.builder] || {
    name: def.builder || '',
    full: def.builder || '',
    style: 'sans',
    color: '#222222',
  };
  const colors = {
    [S.hull]: hull,
    [S.hull2]: hull2,
    [S.boot]: r.chance(0.5)
      ? accent
      : dark
        ? 0xf4f4f0
        : r.pick([0x14284a, 0x101214, 0xa8161d, 0x0e6e78, 0xc9a227]),
    [S.bottom]: bottomPaint ? r.pick(BOTTOMS) : hull,
    [S.deck]: deckPair[0],
    [S.liner]: r.chance(0.7) ? deckPair[0] : mix(deckPair[0], 0xbfc5ca, 0.25),
    [S.nonskid]: deckPair[1],
    [S.upA]: up[0],
    [S.upB]: r.chance(0.4) ? mix(up[1], accent, 0.6) : up[1],
    [S.canvas]: canvas,
    [S.cowl]: cowl,
    [S.cowl2]: ob.accent,
    [S.accent]: accent,
    [S.console]: r.chance(0.8) ? deckPair[0] : hull,
    [S.top]: r.chance(0.6) ? deckPair[0] : canvas,
    [S.gear]: r.pick([0xf4f4f0, 0xd8cdb0, 0x8fb89a, 0xa9cfe0, 0xf06a1e, 0x6f757b, 0xc9342a]),
    ...(look.fixed || {}),
    ...(opts.colors || {}),
  };
  const id = {
    seed,
    key: def.key,
    r,
    builder,
    builderKey: def.builder,
    modelName: def.name,
    category: def.category,
    colors,
    graphics,
    wear,
    dirt: wear * r.range(0.4, 1),
    sunFade: r() * wear,
    bottomPaint,
    hullFamily: famKey,
    dark,
    outboard: ob,
    electronics: ELECTRONICS[r.pick(Object.keys(ELECTRONICS))],
    named: opts.named ?? look.named ?? true,
    registered: look.registered ?? true,
    name: null,
    port: null,
    reg: null,
    unit: opts.unit ?? null,
    nameFont: r.int(0, 5),
    nameColor: null,
    sailColor: r.pick([0xffffff, 0xffffff, 0xf4efe0, 0xf4efe0, 0xa5502a, 0xe8e2d0]),
    gfx: { a: r(), b: r(), c: r(), d: r(), n: r.int(1, 99) }, // free parameters for the livery painter
  };
  if (id.named) {
    id.name = opts.name || uniqueName(r, look.nameKind || 'pleasure');
    id.port = opts.port || hailingPort(r, opts.portBias);
  }
  if (id.registered) id.reg = opts.reg || uniqueReg(r);
  id.nameColor = dark
    ? r.pick([0xf4f4f0, 0xd9b44a, 0xbfdcea])
    : r.pick([0x14284a, 0x101214, 0xa8161d, 0x0e6e78, 0x4b3a2a, 0xb08a2a]);
  // a compact signature for the uniqueness audit
  id.signature = [
    def.key,
    hull.toString(16),
    colors[S.boot].toString(16),
    colors[S.upA].toString(16),
    colors[S.canvas].toString(16),
    graphics,
    id.name || '',
    id.reg || '',
    ob.name,
  ].join('|');
  return id;
}
