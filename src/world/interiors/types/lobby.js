// Store type: hotel lobby (OSM hotel; the legacy system drew these as restaurants). Built from the venue art kit:
// reception desk with a backlit name wall, lounge seating, palms with uplights, a chandelier cluster, elevator doors, luggage cart,
// polished stone floor with the reflection probe. Variants: Ocean Drive deco (pastel, terrazzo, neon), modern luxury (dark marble,
// brass, walnut), budget motel (carpet tiles, vending machine, brochure rack).
import { registerStoreType } from '../registry.js';
import { clamp } from '../kit/util.js';
import { neonSign } from '../kit/neon.js';
import { FIXTURES } from '../lighting.js';
import {
  venuePalette,
  venueMats,
  hostBar,
  sofa,
  armchair,
  cocktailTable,
  pottedPalm,
  venueSconce,
  pillar,
  artFrame,
  artPrint,
  pendantCluster,
} from '../fixtures/venue.js';
import { plantPot } from '../fixtures/dining.js';
import { mixHex } from './nightclub.js';

const VARIANTS = [
  {
    key: 'deco',
    names: ['The Seabreeze', 'Hotel Coralina', 'The Flamingo Arms', 'Hotel Marisol'],
    floor: [
      'terrazzo',
      {
        c: [232, 222, 206],
        chips: [
          [236, 150, 160],
          [120, 196, 200],
          [250, 246, 236],
          [200, 180, 150],
        ],
      },
    ],
    ceil: { type: 'gyp', c: [246, 236, 226] },
    wall: {
      surf: ['plaster', { c: [244, 214, 206] }],
      wainscot: { h: 1.0, surf: ['plaster', { c: [120, 196, 200] }] },
      base: '#5aa8b0',
    },
    pal: {
      accent: '#ff5aa8',
      under: '#5ad8e0',
      velvet: [90, 180, 186],
      wood: [200, 170, 130],
      marble: [
        [238, 232, 222],
        [200, 180, 170],
      ],
      dark: '#2a4a50',
      metal: [210, 196, 170],
    },
    neon: true,
    font: 'script',
    icon: 'palm',
    lamp: 'warm',
  },
  {
    key: 'lux',
    names: ['The Meridian', 'Hotel Aurelia', 'The Bayline', 'Casa Albarelli'],
    floor: ['stoneTile', { c: [36, 34, 36], c2: [140, 130, 120], probe: 1.3 }],
    ceil: { type: 'gyp', c: [40, 34, 30] },
    wall: { surf: ['walnut', { c: [58, 38, 26] }], base: '#0e0a08' },
    pal: {
      accent: '#ffc070',
      under: '#ffd8a0',
      velvet: [30, 40, 46],
      wood: [58, 38, 26],
      marble: [
        [30, 28, 30],
        [200, 190, 176],
      ],
      dark: '#0e0a08',
      metal: [190, 160, 110],
    },
    chandelier: true,
    lamp: 'amber',
    font: 'serif',
  },
  {
    key: 'motel',
    names: ['Sunrise Motor Inn', 'Palm Court Motel', 'Bayside Lodge', 'The Seagull Inn'],
    floor: ['carpet', { c: [70, 80, 96] }],
    ceil: { type: 'drop' },
    wall: { surf: ['paint', { c: [226, 214, 190] }], base: '#5a4a3a' },
    pal: {
      accent: '#ff7a2a',
      under: '#ffd080',
      velvet: [140, 96, 60],
      wood: [120, 84, 50],
      marble: [
        [200, 190, 170],
        [150, 140, 120],
      ],
      dark: '#3a2a1a',
      metal: [170, 170, 170],
    },
    neon: true,
    font: 'block',
    icon: 'star',
    lamp: 'neutral',
    budget: true,
  },
];

// ?noart in the URL keeps the legacy (v1) interiors for this category (before/after captures, safety valve)
if (!/[?&]noart\b/.test(globalThis.location?.search || ''))
  registerStoreType({
    type: 'lobby',
    label: 'Hotel lobby',
    kinds: [
      'hotel',
      'motel',
      'guest_house',
      'hostel',
      'office',
      'insurance',
      'estate_agent',
      'lawyer',
      'travel_agency',
      'company',
      'bank',
    ],
    minSize: { w: 5.2, d: 6 },
    variants: VARIANTS.length, // shops pass: office / agency / bank lobbies on the same kit (1588 'office' storefronts were legacy rooms) variants: VARIANTS.length,
    profile(base, { R, sf }) {
      const office = !/hotel|motel|guest|hostel/.test(sf?.kind || 'hotel'),
        v = office ? VARIANTS[base.variant % 2] : VARIANTS[base.variant],
        pal = venuePalette({ ...v.pal });
      const oname = office
        ? R.pick(
            /bank/.test(sf?.kind || '')
              ? [
                  'Biscayne Federal',
                  'Coral Savings Bank',
                  'First Tidewater Bank',
                  'Sunbelt Credit Union',
                ]
              : [
                  'Biscayne Realty Group',
                  'Palmetto Title Co.',
                  'Seaway Legal',
                  'Coral Gables Insurance',
                  'Brightwater Capital',
                  'Mangrove & Hale',
                  'Southline Properties',
                  'Bayfront Travel',
                ],
          )
        : null;
      return {
        office,
        ...(office ? { open24: false, hours: [8, 19] } : {}),
        venueWear: true,
        v,
        pal,
        name: oname || R.pick(v.names),
        tier: v.budget ? 'budget' : v.key === 'lux' ? 'luxury' : 'mid',
        wear: v.budget ? 0.45 : 0.08,
        open24: !office,
        hours: office ? [8, 19] : [0, 24],
        flip: R.chance(0.5),
        bounce: v.key === 'lux' ? 0.42 : 0.5,
        lamp: v.lamp,
        floor: v.floor,
        wall: v.wall,
        ceil: v.ceil,
        facade: { style: v.key === 'lux' ? 'bronze' : v.budget ? 'aluminum' : 'tile' },
        spillC: [1, 0.9, 0.7],
        lore: { story: `Open since ${base.since}.` },
      };
    },
    plan(P, ctx) {
      const p = ctx.profile;
      P.room('lobby', 'sales', P.lot, {
        h: Math.min(P.H - 0.22, 3.8),
        floor: p.floor,
        wall: p.wall,
        ceil: p.ceil,
      });
      P.storefront({
        style: p.facade.style,
        door: { kind: p.v.budget ? 'double' : 'auto', w: P.doorW, x: P.doorX },
        bulkhead: 0.4,
        awning:
          p.v.key === 'deco' && !p.office ? { c: '#5ab8c0', c2: '#fff4ec' } : { type: 'canopy' },
      });
    },
    *fixtures(ctx) {
      const { G, M, plan: P, R, profile: p } = ctx,
        v = p.v,
        pal = p.pal,
        S = P.get('lobby'),
        W = S.w,
        D = S.d,
        ch = S.ceilY,
        V = venueMats(ctx, pal),
        bs = p.flip ? 1 : -1;
      S.lit = true;
      // ---- reception: desk across the back third, backlit name wall behind it
      const dz = S.z0 + 1.6,
        dl = clamp(W * 0.42, 2.2, 3.4),
        dx = bs * (W / 2 - dl / 2 - 0.9);
      hostBar(ctx, dx, dz, 0, {
        l: dl,
        h: 1.1,
        pal,
        dj: false,
        glowC: v.key === 'lux' ? '#ffd8a0' : mixHex(pal.accent, '#ffffff', 0.55),
        k: v.key === 'lux' ? 0.55 : 0.7,
      });
      G.plane(
        v.key === 'lux'
          ? V.marble
          : M.surf('plaster', {
              c: mixHex(pal.accent, '#ffffff', 0.7)
                .match(/\w\w/g)
                .map((h) => parseInt(h, 16)),
            }),
        dx,
        1.7,
        S.z0 + 0.012,
        dl + 1.0,
        2.6,
        { step: 0.3 },
      );
      FIXTURES.led(
        ctx,
        [dx - dl / 2 - 0.4, 0.06, S.z0 + 0.08],
        [dx + dl / 2 + 0.4, 0.06, S.z0 + 0.08],
        { color: pal.under, k: 1.4, glow: 2.4, w: 0.012, d: [0, 1, 0.15], every: 0.6 },
      );
      if (v.neon)
        neonSign(ctx, dx, 2.35, S.z0 + 0.03, 0, {
          lines: [p.name.replace(/^The /, '')],
          icon: v.icon,
          font: v.font,
          color: pal.accent,
          h: 0.62,
          k: 1.5,
          light: 0.6,
        }); // r2-art (QA): k 2.8 bloomed into a pink blob
      else {
        const pl = ctx.prints.make(
          'lobbyname:' + p.name,
          512,
          96,
          (g, w, h) => {
            g.clearRect(0, 0, w, h);
            g.fillStyle = '#e8c890';
            g.font = '600 54px "Didot", "Bodoni 72", Georgia, serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(p.name.toUpperCase(), w / 2, h / 2);
          },
          { alpha: true, lit: 1.6 },
        );
        G.plane(pl.mat, dx, 2.35, S.z0 + 0.03, Math.min(dl + 0.6, 3), 0.56, { uvRect: pl.rect });
      }
      G.at(dx, dz, 0, () => {
        G.box(M.flat('#1a1b1e', { rough: 0.4 }), dl * 0.3, 1.18, -0.1, 0.4, 0.26, 0.02, {
          rx: -0.2,
        });
        G.box(M.glow('#cfe6ff', 0.7, 0), dl * 0.3, 1.18, -0.088, 0.36, 0.22, 0.004, { rx: -0.2 });
        G.cylB(V.brass, -dl * 0.3, 1.1, 0.1, 0.06, 0.012, { seg: 12 });
        G.sphere(V.brass, -dl * 0.3, 1.13, 0.1, 0.022, { seg: 8 });
        ctx.poi('host', 0, -0.6, 0, {});
      });
      yield;
      // ---- lounge: sofas and armchairs around low tables, palms, art
      const lx = -bs * (W / 2 - 1.8),
        lz = (S.z0 + S.z1) / 2 + 0.6;
      sofa(ctx, lx - bs * 0.9, lz, (bs * Math.PI) / 2, { pal, w: 1.9 });
      cocktailTable(ctx, lx + bs * 0.15, lz, {
        pal,
        r: 0.38,
        h: 0.42,
        top: v.key === 'lux' ? 'marble' : 'brass',
        lantern: v.key === 'lux',
        drinks: 1,
      });
      armchair(ctx, lx + bs * 1.15, lz - 0.6, (-bs * Math.PI) / 2 + bs * 0.4, { pal });
      armchair(ctx, lx + bs * 1.15, lz + 0.6, (-bs * Math.PI) / 2 - bs * 0.4, { pal });
      pottedPalm(ctx, S.x0 + 0.45, S.z1 - 1.0, {
        pal,
        h: 2.2,
        light: v.key === 'lux' ? '#ffb060' : pal.accent,
        k: 2.4,
        pot: v.key === 'lux' ? 'brass' : 'stone',
      });
      pottedPalm(ctx, S.x1 - 0.45, S.z1 - 1.0, {
        pal,
        h: 2.0,
        light: v.key === 'lux' ? '#ffb060' : pal.under,
        k: 2.2,
        pot: v.key === 'lux' ? 'brass' : 'stone',
      });
      const art = artPrint(
        ctx,
        500 + p.variant * 7,
        [
          mixHex(pal.accent, '#ffffff', 0.4),
          mixHex(pal.under, '#000000', 0.2),
          '#fff4e0',
          '#2a2a2a',
        ],
        { aspect: 0.66 },
      );
      artFrame(ctx, -bs * (W / 2 - 0.004), 1.8, lz, (bs * Math.PI) / 2, 1.6, 1.05, {
        page: art,
        frame: v.key === 'lux' ? 'gold' : 'black',
      });
      yield;
      // ---- elevators on the other side of the back wall, luggage cart, pillars, light
      const ex = -bs * (W / 2 - 1.2);
      for (const s of [-0.55, 0.55]) {
        G.at(ex + s, S.z0 + 0.012, 0, () => {
          G.box(V.brass, 0, 1.1, 0.02, 1.0, 2.2, 0.04);
          G.box(
            M.flat('#9aa0a6', { metal: 0.9, rough: 0.25, probe: 1 }),
            -0.22,
            1.05,
            0.045,
            0.43,
            2.05,
            0.01,
          );
          G.box(
            M.flat('#9aa0a6', { metal: 0.9, rough: 0.25, probe: 1 }),
            0.22,
            1.05,
            0.045,
            0.43,
            2.05,
            0.01,
          );
          G.box(M.glow('#ffd8a0', 1.2, 1), 0, 2.3, 0.03, 0.2, 0.06, 0.01);
        });
      }
      if (!p.office)
        G.at(ex + 0.9 * bs, S.z0 + 3.3, 0.4, () => {
          /* r2-art (QA): the luggage cart stood on the desk line (z0 + 1.6) and poked through the desk on narrow lobbies */ const br =
            V.brass;
          G.box(M.surf('carpet', { c: [120, 30, 30] }), 0, 0.2, 0, 1.0, 0.04, 0.55);
          for (const sx of [-1, 1]) G.cylB(br, sx * 0.48, 0.2, 0, 0.015, 1.5, { seg: 8 });
          G.cyl(br, 0, 1.7, 0, 0.015, 0.96, { rz: Math.PI / 2, seg: 8 });
          for (const sx of [-1, 1])
            for (const sz of [-1, 1])
              G.sphere(M.flat('#111', { rough: 0.5 }), sx * 0.42, 0.06, sz * 0.22, 0.05, {
                seg: 8,
              });
          G.boxB(M.flat('#2a3a5a', { rough: 0.6 }), -0.2, 0.22, 0, 0.45, 0.6, 0.25);
          G.boxB(M.flat('#7a2a20', { rough: 0.6 }), 0.25, 0.22, 0, 0.35, 0.45, 0.22);
          ctx.solid(-0.5, 0, -0.28, 0.5, 1.7, 0.28, { occ: false });
        });
      if (W > 7)
        for (const px of [-W / 4, W / 4])
          pillar(ctx, px, (S.z0 + S.z1) / 2 - 0.2, {
            pal,
            h: ch,
            w: 0.42,
            finish: v.key === 'lux' ? 'dark' : 'plaster',
            led: v.key === 'deco' ? pal.under : null,
            ledFaces: [
              [0, 1],
              [0, -1],
            ],
          });
      if (v.chandelier)
        pendantCluster(ctx, 0, ch, (S.z0 + S.z1) / 2 + 0.3, {
          n: 9,
          shade: 'globe',
          r: 0.08,
          drop: 1.1,
          lamp: 'amber',
          k: 0.9,
          c: '#c8a060',
        });
      for (let z = S.z0 + 1.0; z < S.z1 - 0.5; z += 2.0)
        for (const x of [-W / 3, 0, W / 3])
          FIXTURES.can(ctx, x, ch, z, {
            lamp: v.lamp,
            k: v.budget ? 4 : v.key === 'lux' ? 5.5 : 3.4,
            cone: 0.6,
          });
      for (const s of [-1, 1])
        for (let z = S.z0 + 2.6; z < S.z1 - 1.2; z += 2.2)
          venueSconce(ctx, s * (W / 2 - 0.004), 2.0, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, {
            pal,
            color: pal.warm,
            k: v.key === 'lux' ? 2.2 : 1.2,
            ch: 0,
          });
      if (v.key === 'lux')
        for (const s of [-1, 1])
          FIXTURES.led(
            ctx,
            [s * (W / 2 - 0.08), ch - 0.06, S.z0 + 0.3],
            [s * (W / 2 - 0.08), ch - 0.06, S.z1 - 0.5],
            { color: '#ffc880', k: 1.2, glow: 1.8, w: 0.012, d: [-s * 0.3, -1, 0], every: 0.9 },
          );
      if (v.budget) {
        G.at(bs * (W / 2 - 0.45), S.z1 - 2.2, bs < 0 ? Math.PI / 2 : -Math.PI / 2, () => {
          G.boxB(M.flat('#c0302a', { rough: 0.4 }), 0, 0, 0, 0.9, 1.8, 0.75);
          G.box(M.glow('#eaf4ff', 1.0, 0), 0, 1.15, 0.38, 0.6, 0.9, 0.01);
          ctx.solid(-0.45, 0, -0.38, 0.45, 1.8, 0.38);
        });
        plantPot(ctx, -bs * (W / 2 - 0.4), 0.02, S.z1 - 0.6, { s: 2 });
      }
      ctx.probe = {
        box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: ch },
        at: { x: 0, y: 1.5, z: (S.z0 + S.z1) / 2 },
        size: 128,
      };
      ctx.store.venue = { kind: 'lobby', pal, busy: [8, 23] };
    },
    staff() {
      return [{ role: 'host', post: 'host' }];
    },
  });
