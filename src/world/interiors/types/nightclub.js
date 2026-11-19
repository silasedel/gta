// Store type: nightclub / cocktail lounge (OSM nightclub). Built from the venue art kit (fixtures/venue.js, kit/neon.js, kit/fx.js,
// kit/bottles.js, kit/probe.js): long back bar with lit glass shelves and bottles, marble bar with an under-glow, stools, a coffered
// ceiling with cove lighting and downlights, a mirror ball throwing moving spots, a fluted feature wall with uplights behind a glowing
// host / DJ stand and the club's neon sign, a velvet-rope lounge with tufted banquettes, candle-lit tables, palms with uplights,
// entry portal and pillars, a polished stone floor reflecting it all (reflection probe), haze in the light shafts.
// Standout: Velvet Undertow (the club you can buy, business id biz_club, storefront 39 on Española Way).
import { registerStoreType } from '../registry.js';
import { clamp } from '../kit/util.js';
import { neonSign } from '../kit/neon.js';
import { discoBall, hazeCone } from '../kit/fx.js';
import {
  venuePalette,
  venueMats,
  barCounter,
  backBar,
  banquette,
  armchair,
  cocktailTable,
  stanchions,
  pottedPalm,
  venueSconce,
  pillar,
  flutedWall,
  hostBar,
  cofferedCeiling,
  entryPortal,
  speakerStack,
  artFrame,
  artPrint,
  BottleField,
} from '../fixtures/venue.js';
import { exitSign } from '../fixtures/retail.js';

const VARIANTS = [
  {
    key: 'velvet',
    names: ['Velvet Room', 'Undertow', 'Plum Lounge'],
    icon: 'palm',
    font: 'script',
    pal: {
      accent: '#ff3fd2',
      under: '#16e0d2',
      velvet: [70, 18, 62],
      wall: [24, 21, 27],
      cove: '#ff2bd0',
      recess: [46, 30, 50],
      beam: [22, 20, 25],
      flute: '#221d27',
      stone: [
        [40, 38, 43],
        [104, 98, 110],
      ],
      marble: [
        [20, 18, 22],
        [176, 164, 186],
      ],
      rope: [150, 12, 34],
      palmLight: ['#ff3fd2', '#8a5bff'],
    },
  },
  {
    key: 'prism',
    names: ['Prism Room', 'Ultraviolet', 'Lumen'],
    icon: 'star',
    font: 'deco',
    pal: {
      accent: '#38d8ff',
      under: '#8a5bff',
      velvet: [22, 36, 82],
      wall: [16, 22, 34],
      cove: '#4a6bff',
      recess: [26, 34, 70],
      beam: [16, 20, 32],
      flute: '#18203a',
      stone: [
        [30, 32, 40],
        [90, 96, 120],
      ],
      marble: [
        [226, 226, 232],
        [120, 120, 140],
      ],
      rope: [20, 30, 90],
      palmLight: ['#38d8ff', '#8a5bff'],
      metal: [200, 204, 210],
    },
  },
  {
    key: 'afterglow',
    names: ['Afterglow', 'Ember Club', 'Nocturno'],
    icon: 'moon',
    font: 'casual',
    pal: {
      accent: '#ff7a2a',
      under: '#ff2f5a',
      velvet: [96, 28, 20],
      wall: [34, 22, 18],
      cove: '#ff5a1a',
      recess: [70, 34, 22],
      beam: [34, 22, 18],
      flute: '#3a2018',
      stone: [
        [48, 40, 36],
        [120, 100, 86],
      ],
      marble: [
        [24, 20, 18],
        [190, 160, 120],
      ],
      rope: [120, 20, 12],
      palmLight: ['#ff7a2a', '#ffb040'],
    },
  },
  {
    key: 'tropic',
    names: ['Tropic Room', 'Neon Heron', 'Jungle Club'],
    icon: 'palm',
    font: 'script',
    pal: {
      accent: '#3dffa8',
      under: '#ff4fa0',
      velvet: [14, 62, 52],
      wall: [16, 30, 28],
      cove: '#21e8a0',
      recess: [18, 52, 46],
      beam: [14, 28, 26],
      flute: '#132a26',
      stone: [
        [34, 40, 40],
        [90, 110, 106],
      ],
      marble: [
        [22, 26, 26],
        [150, 190, 176],
      ],
      rope: [180, 30, 90],
      palmLight: ['#3dffa8', '#ff4fa0'],
    },
  },
];

// ?noart in the URL keeps the legacy (v1) interiors for this category (before/after captures, safety valve)
if (!/[?&]noart\b/.test(globalThis.location?.search || ''))
  registerStoreType({
    type: 'nightclub',
    label: 'Nightclub',
    kinds: ['nightclub'],
    minSize: { w: 6, d: 7 },
    variants: VARIANTS.length,
    profile(base, { R }) {
      const v = VARIANTS[base.variant],
        pal = venuePalette({ ...v.pal, metal: v.pal.metal || [196, 152, 84] });
      return {
        venueWear: true,
        v,
        pal,
        name: R.pick(v.names),
        tier: 'luxury',
        wear: 0.04,
        open24: true,
        hours: [0, 24],
        busy: [21, 5],
        flip: R.chance(0.5),
        bounce: 0.24,
        lamp: 'warm',
        neon: { lines: null, icon: v.icon, font: v.font },
        floor: ['stoneTile', { c: pal.stone[0], c2: pal.stone[1], probe: 1.5 }],
        wall: { surf: ['plaster', { c: pal.wall }], base: '#0b090d' },
        ceil: { type: 'none' },
        spillC: [1, 0.4, 0.9],
        daylight: 0.15,
        facade: { style: 'black' },
        lore: {
          story: `A members-feel lounge with a door policy and a back bar that glows. Since ${base.since}.`,
        },
      };
    },
    standouts: [
      {
        id: 'velvet-undertow',
        osmId: 39,
        near: [3270.77, -852.02, 6],
        apply(p) {
          Object.assign(p, {
            name: 'Velvet Undertow',
            v: VARIANTS[0],
            pal: venuePalette({ ...VARIANTS[0].pal }),
            flip: false,
            neon: { lines: ['Velvet', 'Undertow'], icon: 'palm', font: 'script' },
          });
          p.floor = ['stoneTile', { c: p.pal.stone[0], c2: p.pal.stone[1], probe: 1.5 }];
          p.wall = { surf: ['plaster', { c: p.pal.wall }], base: '#0b090d' };
        },
      },
    ],
    plan(P, ctx) {
      const p = ctx.profile;
      P.room('club', 'club', P.lot, {
        h: Math.min(P.H - 0.22, 4.0),
        floor: p.floor,
        wall: p.wall,
        ceil: { type: 'none' },
      });
      P.door('club', 'outside:back', {
        kind: 'hinged',
        w: 0.95,
        atX: (p.flip ? -1 : 1) * (P.W / 2 - 0.7),
        locked: true,
        sign: false,
      });
      const dx = P.doorX,
        dw = P.doorW,
        W = P.W;
      P.storefront({
        style: 'black',
        door: { kind: 'double', w: dw, x: dx },
        bulkhead: 0.4,
        solid: [
          [-W / 2, dx - dw / 2 - 0.08],
          [dx + dw / 2 + 0.08, W / 2],
        ],
        awning: { type: 'canopy', w: Math.min(W - 0.6, dw + 2.6), x: dx, c: '#0d0c10' },
        tintGlass: '#120a14',
        frameC: '#0d0c10',
      });
    },
    *fixtures(ctx) {
      const { G, M, plan: P, R, profile: p } = ctx,
        pal = p.pal,
        V = venueMats(ctx, pal),
        S = P.get('club'),
        W = S.w,
        D = S.d,
        bs = p.flip ? 1 : -1,
        ch = S.ceilY;
      S.lit = true;
      const B = new BottleField(ctx);
      ctx.bottles = B;
      // ---- ceiling first (other fixtures dodge its beams): coffers + coves + downlights
      const cof = cofferedCeiling(ctx, S, {
        pal,
        cove: pal.cove,
        recessC: pal.recess,
        beamC: pal.beam,
        size: clamp(Math.min(W, D) / 3, 1.9, 2.6),
        downK: 4.2,
        cone: 0.84,
        coveK: 1.05,
        coveGlow: 1.7,
      });
      const yb = cof.yb;
      yield;
      // ---- bar side: back bar on the side wall, marble bar with under-glow, stools
      const wx = (bs * W) / 2,
        ryW = bs < 0 ? Math.PI / 2 : -Math.PI / 2,
        zA = -D / 2 + 1.25,
        zB = D / 2 - 2.25,
        Lb = zB - zA;
      backBar(ctx, wx, (zA + zB) / 2, ryW, {
        l: Lb,
        h: Math.min(3.2, yb - 0.1),
        shelves: 4,
        pal,
        bottles: B,
      });
      const cxBar = bs * (W / 2 - 1.95),
        Lc = Lb - 0.95;
      barCounter(ctx, cxBar, zB - Lc / 2, ryW, { l: Lc, pal, bottles: B, stools: 0.64 });
      yield;
      // ---- back wall feature: fluted panels + uplights, neon sign, glowing host / DJ stand, palms
      const freeL = bs < 0 ? -W / 2 + 1.3 : -W / 2 + 0.5,
        freeR = bs < 0 ? W / 2 - 0.5 : W / 2 - 1.3,
        xc = (freeL + freeR) / 2,
        fw = Math.min(freeR - freeL - 0.6, 5.4),
        zw = -D / 2;
      flutedWall(ctx, xc - fw / 2, xc + fw / 2, 0.02, yb - 0.06, zw, {
        pal,
        c: pal.flute,
        light: pal.accent,
        k: 2.4,
      });
      const lines =
        p.neon.lines ||
        [p.name.split(' ').slice(0, -1).join(' ') || p.name, p.name.split(' ').slice(-1)[0]].filter(
          Boolean,
        );
      const nh = clamp(fw * 0.19, 0.75, 1.05),
        ny = Math.min(yb - 0.25 - nh / 2, 2.95);
      neonSign(ctx, xc, ny, zw + 0.16, 0, {
        lines: lines.length > 1 && lines[0] !== lines[1] ? lines : [p.name],
        icon: p.neon.icon,
        font: p.neon.font,
        color: pal.accent,
        h: nh,
        k: 3.4,
        light: 1.4,
      });
      const hl = Math.min(3.0, fw - 1.6);
      hostBar(ctx, xc, zw + 1.18, 0, {
        l: hl,
        pal,
        glowC: mixHex(pal.accent, '#ffffff', 0.3),
        k: 1.1,
      });
      for (const s of [-1, 1])
        pottedPalm(ctx, xc + s * (hl / 2 + 0.7), zw + 0.55, {
          pal,
          h: 2.3,
          light: pal.palmLight[s < 0 ? 0 : 1],
          k: 3.4,
          pot: 'black',
        });
      pottedPalm(ctx, wx - bs * 0.45, -D / 2 + 0.5, {
        pal,
        h: 2.0,
        light: pal.palmLight[1],
        k: 2.6,
        potR: 0.22,
      });
      yield;
      // ---- lounge on the other side: velvet banquette, tables with lanterns, armchairs, rope line
      const lx = (-bs * W) / 2,
        ryL = -ryW,
        z0 = -D / 2 + 1.55,
        z1 = D / 2 - 2.35,
        Ll = z1 - z0;
      if (Ll > 1.5) {
        banquette(ctx, lx, (z0 + z1) / 2, ryL, {
          l: Ll,
          pal,
          back: 1.2,
          ledC: pal.accent,
          wash: pal.accent,
          washK: 1.2,
        });
        const nT = Math.max(1, Math.floor(Ll / 1.85));
        for (let i = 0; i < nT; i++) {
          const tz = z0 + ((i + 0.5) * Ll) / nT,
            tx = lx + bs * 0.98;
          cocktailTable(ctx, tx, tz, { pal, r: 0.3, bottles: B, bucket: true });
          if (W > 7.2) armchair(ctx, tx + bs * 0.85, tz + R.jit(0.1), -ryL, { pal });
        }
        const rx = lx + bs * (W > 7.2 ? 2.45 : 1.6),
          pts = [];
        const nP = Math.max(2, Math.round(Ll / 1.4) + 1);
        for (let i = 0; i < nP; i++) pts.push([rx, z0 - 0.2 + (i * (Ll + 0.2)) / (nP - 1)]);
        stanchions(ctx, pts, {
          pal,
          rope: pal.rope,
          gaps: nP > 3 ? [Math.floor((nP - 1) / 2)] : [],
        });
        for (let i = 0; i <= nT; i++) {
          const sz = z0 + (i * Ll) / nT;
          if (i > 0 && i < nT)
            venueSconce(ctx, lx - bs * 0.004, 2.05, sz, ryL, { pal, color: pal.warm, k: 1.3 });
        }
        venueSconce(ctx, lx - bs * 0.004, 2.05, z0 - 0.35, ryL, { pal, color: pal.warm, k: 1.2 });
        venueSconce(ctx, lx - bs * 0.004, 2.05, z1 + 0.35, ryL, { pal, color: pal.warm, k: 1.2 });
        const art = artPrint(ctx, 31 + p.variant, [
          '#2a0f2e',
          '#0c1030',
          mixHex(pal.accent, '#ffffff', 0.2),
          '#ffd0a0',
        ]);
        artFrame(ctx, lx - bs * 0.004, 2.45 + 0.35, (z0 + z1) / 2, ryL, 1.1, 0.75, { page: art });
      }
      yield;
      // ---- entry: dark portal around the door, pillars framing the room, a speaker pair, exit sign
      const zf = D / 2 - 0.22,
        dX = P.doorX,
        dW = P.doorW;
      entryPortal(ctx, dX, zf, dW + 0.1, { pal, h: 2.55, d: 0.45 });
      const pz = D / 2 - 1.75,
        pL = Math.min(-1.55, dX - dW / 2 - 0.9),
        pR = Math.max(1.75, dX + dW / 2 + 0.9);
      for (const px of [pL, pR])
        if (Math.abs(px) < W / 2 - 0.5)
          pillar(ctx, px, pz, { pal, h: ch, w: 0.44, led: pal.accent, ledFaces: [[0, -1]] });
      for (const s of [-1, 1]) {
        const sx = xc + s * (fw / 2 + 0.05);
        if (Math.abs(sx) < W / 2 - 0.4) speakerStack(ctx, sx, zw + 0.35, 0, { h: 1.2 });
      }
      {
        const ex = (p.flip ? -1 : 1) * (W / 2 - 0.7);
        exitSign(ctx, ex, 2.4, -D / 2 + 0.005, 0);
      }
      venueSconce(ctx, freeL - 0.15 + (bs < 0 ? 0 : 0), 2.1, -D / 2 + 0.004, 0, {
        pal,
        color: pal.accent,
        k: 0.9,
      });
      yield;
      // ---- atmosphere: mirror ball + moving spots, haze in the downlights, a few cones of colored light
      const ballX = xc * 0.55 + bs * 0.2,
        ballZ = -0.35,
        ballY = yb - 0.55,
        sf = [...cof.surfaces];
      sf.push({ x: xc, y: 2.0, z: zw + 0.18, w: fw, h: yb - 0.2, rx: 0 });
      sf.push({ x: lx - bs * 0.012, y: 2.4, z: 0, w: D, h: yb - 0.9, ry: (-bs * Math.PI) / 2 });
      sf.push({ x: 0, y: 2.4, z: D / 2 - 0.24, w: W, h: yb - 0.9, ry: Math.PI });
      sf.push({ x: 0, y: 0.03, z: 0, w: W, h: D, rx: -Math.PI / 2 });
      discoBall(ctx, ballX, ballY, ballZ, {
        r: 0.23,
        ceil: ch,
        k: 1.1,
        size: 0.011,
        floor: 0.12,
        surfaces: sf,
        speed: 0.28,
      });
      hazeCone(ctx, ballX, yb - 0.02, ballZ, {
        len: 0.5,
        r1: 0.04,
        r2: 0.22,
        color: '#ffffff',
        k: 0.08,
      });
      for (const c of cof.cans) {
        if (Math.abs(c.x - cxBar) < 0.8 || (c.z > zA && c.z < zB && Math.abs(c.x - wx) < 1.2))
          continue;
        if (R.chance(0.55))
          hazeCone(ctx, c.x, yb - 0.02, c.z, { r2: 0.75, color: '#ffd8b0', k: 0.03, ch: 0 });
      }
      for (const s of [-1, 1])
        hazeCone(ctx, xc + s * (hl / 2 + 0.7) + 0.1, 0.64, zw + 0.55, {
          up: true,
          len: 1.7,
          r1: 0.06,
          r2: 0.55,
          color: pal.palmLight[s < 0 ? 0 : 1],
          k: 0.025,
        });
      // ---- bottles become instanced meshes; reflection probe in the middle of the room at eye height
      B.build();
      ctx.probe = {
        box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: ch },
        at: { x: 0, y: 1.5, z: 0.2 },
        size: 256,
      };
      // ---- people spots (bartenders, DJ, door, dancers in the open floor)
      for (let i = 0; i < 6; i++) ctx.poi('dance', xc + R.jit(1.2), -0.3 + R.jit(1.2), R() * 6.28);
      ctx.poi('door', dX + 0.9, zf - 0.8, Math.PI);
      ctx.poi('lean', pR - 0.35, pz - 0.1, -Math.PI / 2);
      ctx.poi('lean', pL + 0.35, pz - 0.1, Math.PI / 2);
      ctx.store.venue = {
        kind: 'nightclub',
        pal,
        bar: { x: cxBar, z0: zB - Lc, z1: zB },
        stage: { x: xc, z: zw + 1.18 },
        ball: { x: ballX, y: ballY, z: ballZ },
      };
    },
    // surfaces the kit will ask for (venueMats + coffers + bar front), generated in idle time before the build
    prewarm(p) {
      const pal = p.pal;
      return [
        ['marble', { c: pal.marble[0], c2: pal.marble[1] }],
        ['walnut', { c: pal.wood }],
        ['velvet', { c: pal.velvet }],
        ['tufted', { c: pal.velvet }],
        ['brass', { c: pal.metal }],
        ['plaster', { c: pal.recess }],
        ['plaster', { c: pal.beam }],
        ['fluted', { c: [26, 22, 30] }],
        ['leather', { c: [30, 20, 28] }],
      ];
    },
    lighting() {
      /* every light comes from the fixtures (coffers, back bar, neon, sconces, palms, under-glow, candles) */
    },
    staff() {
      return [
        { role: 'bartender', post: 'bartend' },
        { role: 'bartender', post: 'bartend' },
        { role: 'dj', post: 'dj' },
        { role: 'bouncer', post: 'door' },
      ];
    },
  });

function mixHex(a, b, t) {
  const p = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const A = p(a),
    B = p(b);
  return (
    '#' +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    ).join('')
  );
}
export { mixHex };
