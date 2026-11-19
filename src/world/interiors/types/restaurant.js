// Store type: sit-down restaurant (OSM restaurant). Built from the venue + dining art kit. Variants with their own identity:
// Cuban comedor (cuban tile floor, ceiling fans, warm yellow walls, pastry case and coffee at the counter), trattoria (wood floor,
// white tablecloths, brick, wine shelves, globe pendants), steakhouse (dark walnut, tufted leather booths, brass, candle light),
// seafood house (white planks, blue banquettes, rope and lanterns), noodle house (red lanterns, dark wood, paper glow).
// Plan: dining room in front, kitchen behind a pass-through, restroom.
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp } from '../kit/util.js';
import { neonSign } from '../kit/neon.js';
import { FIXTURES } from '../lighting.js';
import {
  venuePalette,
  venueMats,
  banquette,
  pottedPalm,
  venueSconce,
  artFrame,
  artPrint,
  hostBar,
  BottleField,
  backBar,
  barCounter,
} from '../fixtures/venue.js';
import {
  diningTable,
  espressoMachine,
  pastryCase,
  menuBoard,
  ceilingFan,
  wallShelf,
  woodBeams,
  hangingBulbs,
  kitchenPass,
  plantPot,
  boothPair,
} from '../fixtures/dining.js';
import { mixHex } from './nightclub.js';

const VARIANTS = [
  {
    key: 'cuban',
    names: ['Fonda Marisol', 'La Palma Criolla', 'Casa Ceiba', 'El Rincón de Tula'],
    floor: ['cubanTile', {}],
    ceil: { type: 'gyp', c: [236, 228, 210] },
    wall: {
      surf: ['paint', { c: [238, 206, 128] }],
      wainscot: { h: 1.0, surf: ['woodPanel', { c: [110, 66, 36] }] },
      base: '#3a2414',
    },
    pal: {
      accent: '#ff5a3a',
      warm: '#ffd9a0',
      velvet: [140, 40, 30],
      wood: [110, 66, 36],
      marble: [
        [230, 226, 214],
        [150, 140, 120],
      ],
      dark: '#2a1a10',
    },
    chair: 'metal',
    top: 'wood',
    setting: 'dinner',
    fans: true,
    counter: true,
    lamp: 'warm',
    light: 'bright',
    icon: 'palm',
    font: 'casual',
  },
  {
    key: 'trattoria',
    names: ['Osteria del Ponte', 'Trattoria Nonna Pia', 'Vicolo Verde', 'La Lanterna'],
    floor: ['wood', { c: [120, 80, 50] }],
    ceil: { type: 'gyp', c: [60, 40, 30] },
    wall: { surf: ['brick', { c: [150, 84, 60] }], base: '#2a1a10' },
    pal: {
      accent: '#ffb347',
      warm: '#ffcf8a',
      velvet: [110, 30, 30],
      wood: [90, 56, 32],
      marble: [
        [238, 236, 228],
        [170, 160, 150],
      ],
      dark: '#1a120c',
    },
    chair: 'bistro',
    top: 'cloth',
    setting: 'dinner',
    pendants: 'globe',
    wine: true,
    lamp: 'amber',
    icon: null,
    font: 'serif',
  },
  {
    key: 'steak',
    names: ['Embers & Oak', 'The Iron Fork', 'Prime Ledger', 'Cattle Baron Room'],
    floor: ['carpet', { c: [70, 26, 24] }],
    ceil: { type: 'gyp', c: [30, 22, 18] },
    wall: { surf: ['walnut', { c: [60, 38, 24] }], base: '#140c08' },
    pal: {
      accent: '#ffb347',
      warm: '#ffc070',
      velvet: [40, 22, 16],
      wood: [60, 38, 24],
      marble: [
        [30, 26, 24],
        [150, 130, 110],
      ],
      dark: '#140c08',
    },
    chair: 'upholstered',
    top: 'cloth',
    setting: 'dinner',
    booths: true,
    lamp: 'amber',
    light: 'dim',
    icon: null,
    font: 'serif',
  },
  {
    key: 'seafood',
    names: ['Pelican Pier Fish House', 'Mangrove Fish Co.', 'Stone Crab Corner', 'The Salt Line'],
    floor: ['wood', { c: [190, 170, 140] }],
    ceil: { type: 'gyp', c: [230, 236, 236] },
    wall: { surf: ['woodPanel', { c: [226, 232, 230] }], base: '#2a4a6a' },
    pal: {
      accent: '#2ec4ff',
      warm: '#fff0d0',
      velvet: [30, 70, 120],
      wood: [160, 130, 96],
      marble: [
        [226, 230, 230],
        [150, 170, 180],
      ],
      dark: '#1a2a3a',
    },
    chair: 'bistro',
    top: 'wood',
    setting: 'dinner',
    fans: true,
    lamp: 'neutral',
    light: 'bright',
    icon: 'wave',
    font: 'casual',
  },
  {
    key: 'noodle',
    names: ['Red Lantern Noodle House', 'Jade Harbor', 'Golden Wok Room', 'Lucky Koi Kitchen'],
    floor: ['stoneTile', { c: [40, 34, 32], c2: [90, 70, 64] }],
    ceil: { type: 'gyp', c: [26, 16, 14] },
    wall: {
      surf: ['plaster', { c: [120, 22, 22] }],
      wainscot: { h: 1.0, surf: ['walnut', { c: [36, 22, 16] }] },
      base: '#100806',
    },
    pal: {
      accent: '#ff3030',
      warm: '#ffb060',
      velvet: [120, 20, 20],
      wood: [40, 24, 16],
      marble: [
        [24, 20, 18],
        [110, 90, 80],
      ],
      dark: '#100806',
    },
    chair: 'bistro',
    top: 'wood',
    setting: 'dinner',
    lanterns: true,
    lamp: 'amber',
    icon: 'star',
    font: 'block',
  },
  {
    key: 'diner',
    names: [
      'Sunny Side Diner',
      'The Blue Plate',
      'Chrome & Cherry',
      'Dixie Spoon',
      'Burger Bayou',
      'Flip Shack',
    ],
    floor: ['vct', { c: [236, 232, 224], c2: [30, 30, 34] }],
    ceil: { type: 'drop' },
    wall: {
      surf: ['subway', { c: [240, 238, 232] }],
      base: '#b01e24',
      band: { y: 1.05, h: 0.08, c: '#b01e24' },
    },
    pal: {
      accent: '#ff2a3a',
      under: '#2ec4ff',
      warm: '#fff0d0',
      velvet: [170, 24, 32],
      wood: [180, 180, 186],
      marble: [
        [236, 236, 232],
        [200, 200, 196],
      ],
      dark: '#2a2a2e',
      metal: [200, 204, 210],
    },
    chair: 'metal',
    top: 'zinc',
    setting: 'cafe',
    diner: true,
    lamp: 'coolwhite',
    light: 'bright',
    icon: 'star',
    font: 'casual',
  },
];

// ?noart in the URL keeps the legacy (v1) interiors for this category (before/after captures, safety valve)
if (!/[?&]noart\b/.test(globalThis.location?.search || ''))
  registerStoreType({
    type: 'restaurant',
    label: 'Restaurant',
    kinds: ['restaurant', 'fast_food', 'food_court'],
    minSize: { w: 6, d: 7 },
    variants: VARIANTS.length,
    depth(sf, { room, seed }) {
      return Math.min(room, 13 + (seed % 6));
    }, // r7: dining room + kitchen at real depth
    profile(base, { R, sf }) {
      const v = /fast_food|food_court/.test(sf?.kind || '') ? VARIANTS[5] : VARIANTS[base.variant],
        pal = venuePalette({ ...v.pal });
      return {
        venueWear: true,
        v,
        pal,
        name: R.pick(v.names),
        tier: v.key === 'steak' ? 'luxury' : 'mid',
        wear: v.key === 'cuban' ? 0.25 : 0.1,
        hours: [11, 23],
        busy: [12, 22],
        flip: R.chance(0.5),
        bounce: v.light === 'bright' ? 0.55 : 0.4,
        lamp: v.lamp,
        floor: v.floor,
        wall: v.wall,
        ceil: v.ceil,
        facade: {
          style:
            v.key === 'cuban' || v.key === 'seafood'
              ? 'wood'
              : v.key === 'steak'
                ? 'bronze'
                : 'black',
        },
        spillC: [1, 0.85, 0.6],
        lore: { story: `Family-run since ${base.since}.` },
      };
    },
    plan(P, ctx) {
      const p = ctx.profile,
        kd = clamp(P.D * 0.28, 2.4, 3.4),
        [back, front] = cut(P.lot, 'back', kd),
        side = p.flip ? 'left' : 'right',
        [wc, kitchen] = cut(back, side, clamp(rw(back) * 0.3, 1.6, 2.2));
      P.room('dining', 'sales', front, {
        h: Math.min(P.H - 0.2, 3.4),
        floor: p.floor,
        wall: p.wall,
        ceil: p.ceil,
      });
      P.room('kitchen', 'kitchen', kitchen, {
        h: 2.9,
        floor: ['quarry', { c: [130, 60, 44] }],
        wall: { surf: ['subway', { c: [236, 236, 230] }], base: '#3a3a3a' },
        ceil: { type: 'drop' },
      });
      P.room('wc', 'restroom', wc, {
        h: 2.6,
        floor: ['ceramic', { c: [200, 200, 196] }],
        wall: {
          surf: ['paint', { c: [220, 214, 200] }],
          wainscot: { h: 1.2, surf: ['subway', { c: [236, 236, 230] }] },
        },
        ceil: { type: 'gyp' },
      });
      P.door('dining', 'kitchen', { kind: 'swing', w: 1.0, at: p.flip ? 0.85 : 0.15, staff: true });
      P.door('dining', 'kitchen', { kind: 'pass', w: 1.6, at: 0.55, sill: 1.05, h: 0.75 });
      P.door('dining', 'wc', { kind: 'hinged', w: 0.85 });
      P.door('kitchen', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false });
      P.storefront({
        style: p.facade.style,
        door: { kind: 'double', w: P.doorW, x: P.doorX },
        bulkhead: 0.55,
        awning:
          p.v.key === 'cuban'
            ? { c: '#b8322a', c2: '#f4ead2' }
            : p.v.key === 'seafood'
              ? { c: '#1f5a8a', c2: '#f4f4f0' }
              : { type: 'canopy' },
      });
    },
    *fixtures(ctx) {
      const { G, M, plan: P, R, profile: p } = ctx,
        v = p.v,
        pal = p.pal,
        S = P.get('dining'),
        K = P.get('kitchen'),
        W = S.w,
        ch = S.ceilY,
        bs = p.flip ? 1 : -1;
      S.lit = true;
      // ---- banquette along one side wall with two-tops, tables in the middle, host stand by the door
      const ox = (-bs * W) / 2,
        ryO = bs < 0 ? -Math.PI / 2 : Math.PI / 2,
        z0 = S.z0 + 0.6,
        z1 = S.z1 - 1.6,
        Lb = z1 - z0;
      if (v.diner) {
        const nB = Math.max(1, Math.floor((S.d - 1.6) / 2.1));
        for (let i = 0; i < nB; i++)
          boothPair(ctx, ox, S.z0 + 0.4 + i * 2.1 + 1.0, ryO, {
            pal,
            l: 1.5,
            setting: 'cafe',
            top: 'zinc',
          });
        const wx0 = (bs * W) / 2,
          ryW0 = bs < 0 ? Math.PI / 2 : -Math.PI / 2,
          Lc = Math.min(S.d - 2.4, 5);
        barCounter(ctx, bs * (W / 2 - 1.5), S.z0 + 0.5 + Lc / 2, ryW0, {
          l: Lc,
          pal: { ...pal, under: '#ff2a3a' },
          stools: 0.62,
          kUnder: 0.6,
          kTop: 0.5,
          frontC: [176, 24, 32],
        });
        G.at(wx0, S.z0 + 0.5 + Lc / 2, ryW0, () => {
          G.boxB(M.surf('steel', { wear: 0.2 }), 0, 0, 0.3, Lc, 0.9, 0.6);
          ctx.solid(-Lc / 2, 0, 0, Lc / 2, 0.9, 0.6);
          espressoMachine(ctx, -Lc / 2 + 0.6, 0.92, 0.3, 0, { accent: '#b01e24', groups: 1 });
          pastryCase(ctx, Lc / 2 - 0.7, 0.92, 0.3, 0, { w: 0.9 });
        });
        menuBoard(ctx, wx0 - bs * 0.01, 2.2, S.z0 + 0.5 + Lc / 2, ryW0, Math.min(Lc, 2.6), 0.75, {
          style: 'letter',
          lines: [
            ['Burgers', ['Classic 8.95', 'Bayou smash 10.50', 'Mushroom swiss 10.95']],
            ['Diner', ['Two eggs any style 7.50', 'Cuban sandwich 9.75', 'Shake 5.95']],
          ],
        });
      } else if (Lb > 1.5) {
        banquette(ctx, ox, (z0 + z1) / 2, ryO, {
          pal,
          l: Lb,
          back: v.booths ? 1.3 : 1.05,
          led: false,
        });
        const n = Math.max(1, Math.floor(Lb / 1.35));
        for (let i = 0; i < n; i++) {
          const tz = z0 + ((i + 0.5) * Lb) / n;
          diningTable(ctx, ox + bs * 0.98, tz, (bs * Math.PI) / 2, {
            pal,
            shape: 'square',
            w: 0.68,
            d: 0.68,
            top: v.top,
            chair: v.chair,
            seats: 1,
            lantern: v.light === 'dim',
            vase: v.light !== 'dim',
          });
        }
      }
      yield;
      const cm = v.counter ? 1.5 : 0.9,
        midL = bs < 0 ? -W / 2 + cm : -W / 2 + 1.75,
        midR = bs < 0 ? W / 2 - 1.75 : W / 2 - cm,
        nx = Math.max(1, Math.floor((midR - midL) / 1.8)),
        nz = Math.max(1, Math.floor((S.z1 - S.z0 - 2.4) / 1.9));
      if (!v.diner)
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < nz; j++) {
            const tx = midL + ((i + 0.5) * (midR - midL)) / nx,
              tz = S.z0 + 0.9 + ((j + 0.5) * (S.z1 - S.z0 - 2.4)) / nz;
            diningTable(ctx, tx, tz, R.chance(0.3) ? Math.PI / 2 : 0, {
              pal,
              shape:
                v.key === 'trattoria' || v.key === 'noodle'
                  ? R.chance(0.5)
                    ? 'round'
                    : 'square'
                  : 'square',
              w: 0.8,
              d: 0.8,
              top: v.top,
              chair: v.chair,
              seats: 4,
              lantern: v.light === 'dim',
              vase: v.light !== 'dim' && R.chance(0.6),
            });
          }
      yield;
      // ---- host stand by the door, counter with coffee + pastries (cuban), wine shelves (trattoria)
      const dX = P.doorX;
      if (!v.diner)
        hostBar(ctx, clamp(dX + bs * 1.35, -W / 2 + 0.8, W / 2 - 0.8), S.z1 - 0.75, 0, {
          l: 0.9,
          h: 1.1,
          pal,
          dj: false,
          glowC: v.light === 'dim' ? '#ffb070' : '#ffe6c0',
          k: 0.45,
        });
      const wx = (bs * W) / 2,
        ryW = bs < 0 ? Math.PI / 2 : -Math.PI / 2;
      if (v.counter && !v.diner) {
        G.at(wx + -bs * 0.0, S.z0 + 1.6, ryW, () => {
          G.boxB(M.surf('woodPanel', { c: pal.wood }), 0, 0, 0.35, 2.2, 1.0, 0.6);
          G.box(venueMats(ctx, pal).marble, 0, 1.02, 0.35, 2.3, 0.04, 0.66);
          ctx.solid(-1.1, 0, 0.05, 1.1, 1.0, 0.65);
        });
        G.at(wx, S.z0 + 1.6, ryW, () => {
          espressoMachine(ctx, -0.55, 1.04, 0.35, 0, { accent: '#b8322a' });
          pastryCase(ctx, 0.5, 1.04, 0.35, 0, { w: 1.0 });
        });
        menuBoard(ctx, wx - bs * 0.01, 2.35, S.z0 + 1.6, ryW, 1.6, 0.8, { light: true });
      }
      if (v.wine) {
        const B = new BottleField(ctx);
        for (const y of [1.45, 1.9, 2.35]) {
          wallShelf(ctx, wx - bs * 0.01, y, S.z0 + 1.2, ryW, 1.6, { c: pal.wood, bare: true });
          G.at(wx - bs * 0.01, S.z0 + 1.2, ryW, () =>
            B.row(-0.75, 0.75, y + 0.015, 0.12, { fams: ['wine'], glow: 0.15, gap: 0.01 }),
          );
        }
        B.build();
      }
      yield;
      // ---- lighting and decor per identity
      if (v.fans)
        for (let z = S.z0 + 1.6; z < S.z1 - 0.8; z += 2.6)
          ceilingFan(ctx, (midL + midR) / 2, ch, z, { c: pal.wood, metalC: '#c8c0b0' });
      if (v.pendants)
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < nz; j++) {
            const tx = midL + ((i + 0.5) * (midR - midL)) / nx,
              tz = S.z0 + 0.9 + ((j + 0.5) * (S.z1 - S.z0 - 2.4)) / nz;
            FIXTURES.pendant(ctx, tx, ch, tz, {
              drop: ch - 1.75,
              shade: v.pendants,
              r: 0.12,
              lamp: v.lamp,
              k: 1.3,
              glow: 0.9,
              c: '#b08a4a',
            });
          }
      if (v.lanterns)
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < nz; j++) {
            const tx = midL + ((i + 0.5) * (midR - midL)) / nx,
              tz = S.z0 + 0.9 + ((j + 0.5) * (S.z1 - S.z0 - 2.4)) / nz;
            FIXTURES.pendant(ctx, tx, ch, tz, {
              drop: ch - 1.9,
              shade: 'globe',
              r: 0.2,
              lamp: 'amber',
              k: 1.4,
              glow: 0.8,
              c: '#c02020',
            });
            const lan = M.flat('#c8201a', { rough: 0.9 });
            G.sphere(lan, tx, 1.9 + 0.12, tz, 0.215, { seg: 14, sy: 0.85 });
            for (const dy of [-0.16, 0.16])
              G.cyl(M.flat('#1a1210', { rough: 0.6 }), tx, 2.02 + dy, tz, 0.11, 0.025, { seg: 12 });
            for (let k = 0; k < 6; k++)
              G.cyl(
                M.flat('#7a1410', { rough: 0.8 }),
                tx + Math.cos(k * 1.05) * 0.2,
                2.02,
                tz + Math.sin(k * 1.05) * 0.2,
                0.004,
                0.3,
                { seg: 4 },
              );
          }
      if (v.light === 'dim' || v.key === 'steak') {
        for (let z = S.z0 + 1.1; z < S.z1 - 0.5; z += 1.6)
          venueSconce(ctx, ox - bs * 0.004, 1.85, z, ryO, { pal, color: '#ffc070', k: 1.2, ch: 0 });
      }
      if (!v.pendants && !v.lanterns)
        for (let i = 0; i <= nx; i++)
          for (let z = S.z0 + 1.2; z < S.z1 - 0.6; z += 2.0)
            FIXTURES.can(ctx, midL + (i * (midR - midL)) / Math.max(1, nx), ch, z, {
              lamp: v.lamp,
              k: v.light === 'bright' ? 3.6 : 2.2,
              cone: 0.6,
            });
      if (v.diner)
        for (let z = S.z0 + 1.0; z < S.z1 - 0.5; z += 1.8)
          FIXTURES.pendant(ctx, ox + bs * 0.95, ch, z, {
            drop: 0.9,
            shade: 'schoolhouse',
            r: 0.12,
            lamp: 'warm',
            k: 1.4,
            glow: 1.0,
          });
      for (let k = 0; k < (v.diner ? 0 : 2); k++) {
        const art = artPrint(
          ctx,
          200 + p.variant * 3 + k,
          [
            mixHex(pal.accent, '#ffffff', 0.5),
            mixHex(pal.accent, '#000000', 0.4),
            '#f2e6c8',
            '#3a2414',
          ],
          { aspect: 1.25 },
        );
        artFrame(ctx, ox - bs * 0.004, 2.15, z0 + ((k + 0.5) * Lb) / 2, ryO, 0.6, 0.75, {
          page: art,
          frame: v.key === 'seafood' ? 'black' : 'gold',
        });
      }
      if (v.icon !== null)
        neonSign(ctx, 0, ch - 0.55, S.z0 + 0.03, 0, {
          lines: [p.name.length > 18 ? p.name.split(' ').slice(0, 2).join(' ') : p.name],
          icon: v.icon || undefined,
          font: v.font,
          color: pal.accent,
          h: 0.5,
          k: 2.6,
          light: 0.8,
        });
      plantPot(ctx, S.x0 + 0.35, 0.02, S.z1 - 0.4, { s: 2.2 });
      if (!v.counter)
        pottedPalm(ctx, wx - bs * 0.45, S.z0 + 0.45, {
          pal,
          h: 1.7,
          light: null,
          potR: 0.2,
          pot: 'stone',
        });
      // ---- kitchen: line along the back wall, pass dressing
      G.boxB(M.surf('steel', { wear: 0.4 }), K.cx, 0, K.z0 + 0.4, K.w - 0.4, 0.9, 0.7);
      G.box(M.flat('#202022', { rough: 0.6 }), K.cx, 2.0, K.z0 + 0.45, K.w - 0.3, 0.5, 0.8);
      ctx.solid(K.x0 + 0.2, 0, K.z0, K.x1 - 0.2, 0.9, K.z0 + 0.75);
      const pass = P.doors.find((d) => d.kind === 'pass');
      if (pass?.op) kitchenPass(ctx, pass.x, 1.05, pass.z, 0, Math.min(1.5, pass.op.b - pass.op.a));
      ctx.probe = {
        box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: ch },
        at: { x: 0, y: 1.4, z: (S.z0 + S.z1) / 2 },
        size: 128,
      };
      ctx.store.venue = { kind: 'restaurant', pal, busy: p.busy };
    },
    staff() {
      return [
        { role: 'server', post: 'serve' },
        { role: 'host', post: 'host' },
      ];
    },
  });
