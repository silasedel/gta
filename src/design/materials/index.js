// Shared PBR material library (DESIGN-SYSTEM track). See ../README.md "Materials".
// Every material is a full set (albedo, normal, roughness, AO) generated procedurally at first use and cached, so no
// surface in the game needs a flat color. opts.wear (0..1) bakes grime, scuffs and roughness break-up into the set.
import { makeCanvas, ctx2d, rng, hexToRgb, hexNum, mix, darken, lighten, rgba } from '../util.js';

const DEFS = new Map();
export function defineMaterial(name, def) {
  DEFS.set(name, {
    name,
    tile: 1,
    rough: 0.6,
    metal: 0,
    source: 'procedural',
    license: 'original',
    tags: [],
    ...def,
  });
}
const blobs = (g, r, n, s, colors, a0, a1, S) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rgba(r.pick(colors), r.range(a0, a1));
    const x = r() * S,
      y = r() * S,
      w = r.range(s * 0.3, s),
      h = r.range(s * 0.3, s);
    for (const dx of [0, -S, S])
      for (const dy of [0, -S, S]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, w, h, r() * 3, 0, 7);
        g.fill();
      }
  }
};
const PAINT = {
  wood(g, h, S, o, r) {
    const n = o.planks || 5,
      ph = S / n;
    for (let i = 0; i < n; i++) {
      const c = mix(o.color, r() < 0.5 ? '#000000' : '#ffffff', r() * 0.12);
      g.fillStyle = c;
      g.fillRect(0, i * ph, S, ph);
      const off = r() * S;
      for (let k = 0; k < 60; k++) {
        const y = i * ph + r() * ph;
        g.strokeStyle = rgba(r() < 0.6 ? '#000000' : '#ffffff', r.range(0.03, 0.12));
        g.lineWidth = r.range(0.5, 2);
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(S * 0.3, y + r.range(-4, 4), S * 0.6, y + r.range(-4, 4), S, y);
        g.stroke();
        h.strokeStyle = rgba('#000000', 0.08);
        h.lineWidth = 1;
        h.beginPath();
        h.moveTo(0, y);
        h.lineTo(S, y);
        h.stroke();
      }
      h.fillStyle = '#000';
      h.fillRect(0, i * ph, S, Math.max(2, S * 0.006));
      h.fillRect(off % S, i * ph, Math.max(2, S * 0.005), ph);
      g.fillStyle = rgba('#000000', 0.5);
      g.fillRect(0, i * ph, S, Math.max(1.5, S * 0.004));
      g.fillRect(off % S, i * ph, Math.max(1.5, S * 0.004), ph);
    }
    if (o.paint) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = rgba(o.paint, o.chipped ? 0.82 : 0.94);
      g.fillRect(0, 0, S, S);
      if (o.chipped) {
        g.globalCompositeOperation = 'destination-out';
        blobs(g, r, 90, S * 0.03, ['#000000'], 0.5, 1, S);
        g.globalCompositeOperation = 'destination-over';
        g.fillStyle = darken(o.color, 0.2);
        g.fillRect(0, 0, S, S);
      }
      g.globalCompositeOperation = 'source-over';
    }
  },
  brushed(g, h, S, o, r) {
    g.fillStyle = o.color;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 2.5; i++) {
      const y = r() * S;
      g.strokeStyle = rgba(r() < 0.5 ? '#ffffff' : '#000000', r.range(0.02, 0.09));
      g.lineWidth = r.range(0.4, 1.4);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y);
      g.stroke();
      h.strokeStyle = rgba(r() < 0.5 ? '#ffffff' : '#000000', 0.12);
      h.beginPath();
      h.moveTo(0, y);
      h.lineTo(S, y);
      h.stroke();
    }
  },
  grainy(g, h, S, o, r) {
    g.fillStyle = o.color;
    g.fillRect(0, 0, S, S);
    blobs(g, r, o.n || 500, S * (o.s || 0.012), ['#000000', '#ffffff'], 0.02, o.a || 0.08, S);
    blobs(h, r, o.n || 500, S * (o.s || 0.012), ['#000000', '#ffffff'], 0.05, o.ha || 0.25, S);
    blobs(g, r, 14, S * 0.2, ['#000000', '#ffffff'], 0.01, 0.05, S);
  },
  terrazzo(g, h, S, o, r) {
    g.fillStyle = o.color;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < (o.n || 520); i++) {
      const x = r() * S,
        y = r() * S,
        s = r.range(S * 0.004, S * (o.s || 0.022)),
        a = r() * 3;
      g.fillStyle = r.pick(o.chips);
      for (const dx of [0, -S, S])
        for (const dy of [0, -S, S]) {
          g.beginPath();
          for (let k = 0; k < 5; k++) {
            const an = a + k * 1.256,
              rr = s * r.range(0.6, 1);
            g.lineTo(x + dx + Math.cos(an) * rr, y + dy + Math.sin(an) * rr);
          }
          g.fill();
        }
    }
    blobs(h, r, 200, S * 0.01, ['#000000', '#ffffff'], 0.02, 0.06, S);
  },
  tile(g, h, S, o, r) {
    const nx = o.nx || 4,
      ny = o.ny || nx,
      tw = S / nx,
      th = S / ny,
      gw = Math.max(2, S * (o.grout ?? 0.012));
    g.fillStyle = o.groutColor || '#8d8778';
    g.fillRect(0, 0, S, S);
    h.fillStyle = '#222';
    h.fillRect(0, 0, S, S);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const ox = o.offset && j % 2 ? tw / 2 : 0;
        for (const wrap of [0, -S]) {
          const x = i * tw + ox + wrap,
            y = j * th;
          const c = o.checker
            ? (i + j) % 2
              ? o.color2
              : o.color
            : mix(o.color, r() < 0.5 ? '#000000' : '#ffffff', r() * (o.vary ?? 0.06));
          g.fillStyle = c;
          g.beginPath();
          g.roundRect(x + gw / 2, y + gw / 2, tw - gw, th - gw, gw * 0.6);
          g.fill();
          if (o.motif) {
            g.save();
            g.translate(x + tw / 2, y + th / 2);
            for (let k = 0; k < 4; k++) {
              g.rotate(Math.PI / 2);
              g.fillStyle = o.color2;
              g.beginPath();
              g.moveTo(0, 0);
              g.quadraticCurveTo(tw * 0.18, -th * 0.2, 0, -th * 0.42);
              g.quadraticCurveTo(-tw * 0.18, -th * 0.2, 0, 0);
              g.fill();
              g.fillStyle = o.color3 || o.color2;
              g.beginPath();
              g.moveTo(tw * 0.46, th * 0.46);
              g.lineTo(tw * 0.2, th * 0.46);
              g.lineTo(tw * 0.46, th * 0.2);
              g.fill();
            }
            g.fillStyle = o.color3 || o.color2;
            g.beginPath();
            g.arc(0, 0, tw * 0.07, 0, 7);
            g.fill();
            g.restore();
          }
          h.fillStyle = '#ddd';
          h.beginPath();
          h.roundRect(x + gw / 2, y + gw / 2, tw - gw, th - gw, gw * 0.6);
          h.fill();
        }
      }
    blobs(g, r, 60, S * 0.05, ['#000000', '#ffffff'], 0.01, 0.04, S);
  },
  brick(g, h, S, o, r) {
    PAINT.tile(
      g,
      h,
      S,
      {
        nx: 4,
        ny: 8,
        offset: true,
        grout: 0.014,
        groutColor: o.mortar || '#b9b2a3',
        color: o.color,
        vary: 0.22,
      },
      r,
    );
    blobs(g, r, 700, S * 0.008, ['#000000', '#ffffff'], 0.03, 0.12, S);
    blobs(h, r, 700, S * 0.008, ['#000000'], 0.05, 0.2, S);
    if (o.paint) {
      g.fillStyle = rgba(o.paint, 0.9);
      g.fillRect(0, 0, S, S);
    }
  },
  weave(g, h, S, o, r) {
    g.fillStyle = o.color;
    g.fillRect(0, 0, S, S);
    const n = o.n || 64,
      c = S / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const up = (i + j) % 2;
        g.fillStyle = rgba(up ? '#ffffff' : '#000000', 0.05 + r() * 0.06);
        g.fillRect(i * c, j * c, c, c);
        h.fillStyle = up ? '#bbb' : '#555';
        h.fillRect(i * c, j * c, c, c);
      }
    if (o.stripe) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = rgba(o.stripe, 0.85);
        g.fillRect((i * S) / 8, 0, S / 16, S);
      }
    }
  },
  pebble(g, h, S, o, r) {
    g.fillStyle = o.color;
    g.fillRect(0, 0, S, S);
    h.fillStyle = '#333';
    h.fillRect(0, 0, S, S);
    for (let i = 0; i < (o.n || 2600); i++) {
      const x = r() * S,
        y = r() * S,
        s = r.range(S * 0.006, S * 0.014);
      h.fillStyle = rgba('#ffffff', 0.5);
      h.beginPath();
      h.arc(x, y, s, 0, 7);
      h.fill();
      g.fillStyle = rgba(r() < 0.5 ? '#ffffff' : '#000000', 0.035);
      g.beginPath();
      g.arc(x, y, s, 0, 7);
      g.fill();
    }
  },
};
const W = '#ffffff';
const D = (name, category, paint, o, x = {}) => defineMaterial(name, { category, paint, o, ...x });
// ---- woods
D(
  'wood_oak',
  'wood',
  'wood',
  { color: '#b98a55' },
  { tile: 1.2, rough: 0.55, tags: ['floor', 'furniture'] },
);
D(
  'wood_walnut',
  'wood',
  'wood',
  { color: '#5a3a22' },
  { tile: 1.2, rough: 0.5, tags: ['furniture', 'luxury'] },
);
D(
  'wood_pine_bleached',
  'wood',
  'wood',
  { color: '#d9c4a0', planks: 6 },
  { tile: 1.2, rough: 0.7, tags: ['floor', 'keys'] },
);
D(
  'wood_dark_floor',
  'wood',
  'wood',
  { color: '#3a2618', planks: 7 },
  { tile: 1.4, rough: 0.4, tags: ['floor', 'bar'] },
);
D(
  'wood_dock_weathered',
  'wood',
  'wood',
  { color: '#8d8778', planks: 6 },
  { tile: 1.5, rough: 0.9, tags: ['dock', 'exterior'] },
);
D(
  'wood_painted_teal',
  'wood',
  'wood',
  { color: '#8a6a48', paint: '#2a9d8f', chipped: true },
  { tile: 1.2, rough: 0.7, tags: ['keys', 'siding', 'sign'] },
);
D(
  'wood_painted_white',
  'wood',
  'wood',
  { color: '#8a6a48', paint: '#f4f1e8', chipped: true },
  { tile: 1.2, rough: 0.7, tags: ['siding', 'trim'] },
);
D(
  'wood_painted_yellow',
  'wood',
  'wood',
  { color: '#8a6a48', paint: '#f2c14e', chipped: true },
  { tile: 1.2, rough: 0.7, tags: ['keys', 'siding'] },
);
D(
  'wood_painted_coral',
  'wood',
  'wood',
  { color: '#8a6a48', paint: '#f28482', chipped: true },
  { tile: 1.2, rough: 0.7, tags: ['keys', 'siding'] },
);
// ---- metals
D(
  'metal_brushed_steel',
  'metal',
  'brushed',
  { color: '#b9bdc2' },
  { rough: 0.35, metal: 1, tags: ['kitchen', 'elevator'] },
);
D(
  'metal_brass',
  'metal',
  'brushed',
  { color: '#b08d57' },
  { rough: 0.3, metal: 1, tags: ['luxury', 'sign'] },
);
D(
  'metal_chrome',
  'metal',
  'grainy',
  { color: '#e3e6ea', n: 120, a: 0.02, ha: 0.04 },
  { rough: 0.06, metal: 1, tags: ['diner', 'trim'] },
);
D(
  'metal_black_powder',
  'metal',
  'grainy',
  { color: '#1c1d20', n: 900, s: 0.006 },
  { rough: 0.6, metal: 0.6, tags: ['fixture', 'frame'] },
);
D(
  'metal_galvanized',
  'metal',
  'grainy',
  { color: '#a9afb3', n: 260, s: 0.05, a: 0.1, ha: 0.08 },
  { rough: 0.45, metal: 0.9, tags: ['exterior', 'duct'] },
);
D(
  'metal_rusted',
  'metal',
  'grainy',
  { color: '#7a4a2a', n: 900, s: 0.03, a: 0.2, ha: 0.5 },
  { rough: 0.95, metal: 0.3, tags: ['wear', 'port'] },
);
D(
  'metal_copper_verdigris',
  'metal',
  'grainy',
  { color: '#4f8f7f', n: 700, s: 0.03, a: 0.15, ha: 0.3 },
  { rough: 0.8, metal: 0.4, tags: ['roof', 'deco'] },
);
D(
  'metal_gold',
  'metal',
  'brushed',
  { color: '#d4af37' },
  { rough: 0.22, metal: 1, tags: ['luxury', 'jewelry'] },
);
// ---- plastics, rubber, paper
for (const [n, c] of [
  ['white', '#f1f1ee'],
  ['black', '#17181a'],
  ['red', '#c1272d'],
  ['blue', '#1f5fae'],
  ['yellow', '#f2c200'],
  ['beige', '#d8cdb0'],
])
  D(
    'plastic_' + n,
    'plastic',
    'grainy',
    { color: c, n: 700, s: 0.004, a: 0.04, ha: 0.14 },
    { rough: 0.45, tags: ['fixture', 'product'] },
  );
D('rubber_black', 'rubber', 'pebble', { color: '#1a1a1a' }, { rough: 0.95, tags: ['mat', 'tire'] });
D(
  'paper_kraft',
  'paper',
  'grainy',
  { color: '#b98f5f', n: 1400, s: 0.006, a: 0.1 },
  { rough: 0.95, tags: ['bag', 'box'] },
);
D('cardboard', 'paper', 'weave', { color: '#b08a5e', n: 96 }, { rough: 0.95, tags: ['box'] });
// ---- floors and walls
D(
  'terrazzo_cream',
  'terrazzo',
  'terrazzo',
  { color: '#e9e1d0', chips: ['#b9a58a', '#6b5d4f', '#d9b08c', '#8f9a8a', W] },
  { tile: 1.5, rough: 0.28, tags: ['floor', 'deco', 'lobby'] },
);
D(
  'terrazzo_pink',
  'terrazzo',
  'terrazzo',
  { color: '#f0c9c0', chips: ['#c9736b', '#f6efe6', '#7a8f8a', '#e0a08a'] },
  { tile: 1.5, rough: 0.28, tags: ['floor', 'deco', 'south-beach'] },
);
D(
  'terrazzo_gray',
  'terrazzo',
  'terrazzo',
  { color: '#9c9c98', chips: ['#3a3a3a', '#d9d9d4', '#6d6d6a', W] },
  { tile: 1.5, rough: 0.3, tags: ['floor', 'store'] },
);
D(
  'terrazzo_green',
  'terrazzo',
  'terrazzo',
  { color: '#2f5d50', chips: ['#e9e1d0', '#b08d57', '#1c3a32', '#8fb8a5'] },
  { tile: 1.5, rough: 0.26, tags: ['floor', 'luxury'] },
);
D(
  'tile_white_subway',
  'tile',
  'tile',
  { nx: 4, ny: 8, offset: true, color: '#f4f3ee', groutColor: '#c9c5ba' },
  { tile: 0.6, rough: 0.18, tags: ['wall', 'kitchen', 'bath'] },
);
D(
  'tile_checker_bw',
  'tile',
  'tile',
  { nx: 4, checker: true, color: '#f1efe8', color2: '#1c1c1e', groutColor: '#555' },
  { tile: 1.2, rough: 0.25, tags: ['floor', 'diner'] },
);
D(
  'tile_checker_red',
  'tile',
  'tile',
  { nx: 4, checker: true, color: '#f1efe8', color2: '#a4161a', groutColor: '#777' },
  { tile: 1.2, rough: 0.25, tags: ['floor', 'pizzeria'] },
);
D(
  'tile_vct_beige',
  'tile',
  'tile',
  { nx: 3, color: '#d9d0b8', groutColor: '#b9b09a', grout: 0.004, vary: 0.1 },
  { tile: 0.9, rough: 0.4, tags: ['floor', 'convenience', 'budget'] },
);
D(
  'tile_quarry_red',
  'tile',
  'tile',
  { nx: 4, color: '#8a3b2a', groutColor: '#4a3a30', vary: 0.14 },
  { tile: 0.8, rough: 0.6, tags: ['floor', 'kitchen'] },
);
D(
  'tile_cuban_blue',
  'tile',
  'tile',
  {
    nx: 4,
    motif: true,
    color: '#f1ead8',
    color2: '#1f5f8b',
    color3: '#e0a526',
    groutColor: '#b9b09a',
    grout: 0.006,
  },
  { tile: 0.8, rough: 0.5, tags: ['floor', 'little-havana', 'cuban-cafe'] },
);
D(
  'tile_cuban_green',
  'tile',
  'tile',
  {
    nx: 4,
    motif: true,
    color: '#f4e9c9',
    color2: '#1d6a4f',
    color3: '#c8102e',
    groutColor: '#b9b09a',
    grout: 0.006,
  },
  { tile: 0.8, rough: 0.5, tags: ['floor', 'little-havana'] },
);
D(
  'tile_marble_white',
  'stone',
  'grainy',
  { color: '#efede8', n: 40, s: 0.3, a: 0.06, ha: 0.03 },
  { tile: 1.2, rough: 0.12, tags: ['floor', 'luxury', 'bank'] },
);
D(
  'stone_granite_black',
  'stone',
  'grainy',
  { color: '#1d1e22', n: 2600, s: 0.004, a: 0.25, ha: 0.05 },
  { rough: 0.15, tags: ['counter', 'luxury'] },
);
D(
  'stone_coral_keystone',
  'stone',
  'grainy',
  { color: '#d9cdb4', n: 900, s: 0.02, a: 0.14, ha: 0.5 },
  { rough: 0.85, tags: ['wall', 'deco', 'miami'] },
);
D(
  'concrete_smooth',
  'concrete',
  'grainy',
  { color: '#a8a7a2', n: 900, s: 0.02, a: 0.06, ha: 0.15 },
  { tile: 2, rough: 0.8, tags: ['floor', 'wall', 'industrial'] },
);
D(
  'concrete_stained',
  'concrete',
  'grainy',
  { color: '#8d8b84', n: 500, s: 0.08, a: 0.14, ha: 0.2 },
  { tile: 2, rough: 0.9, tags: ['floor', 'garage', 'wear'] },
);
for (const [n, c] of [
  ['white', '#f1ede2'],
  ['pink', '#f2b6b0'],
  ['yellow', '#f4d98a'],
  ['teal', '#7cc7c0'],
  ['peach', '#f6c9a0'],
  ['mint', '#bfe3cf'],
  ['sky', '#a9d3ea'],
  ['ochre', '#d9a441'],
])
  D(
    'stucco_' + n,
    'stucco',
    'grainy',
    { color: c, n: 2200, s: 0.01, a: 0.06, ha: 0.45 },
    { tile: 1.5, rough: 0.92, tags: ['wall', 'exterior', 'miami'] },
  );
D(
  'brick_red',
  'brick',
  'brick',
  { color: '#8f4a36' },
  { tile: 1, rough: 0.9, tags: ['wall', 'wynwood'] },
);
D(
  'brick_painted_white',
  'brick',
  'brick',
  { color: '#8f4a36', paint: '#efece4' },
  { tile: 1, rough: 0.85, tags: ['wall', 'cafe'] },
);
// ---- soft goods
D(
  'carpet_gray',
  'carpet',
  'pebble',
  { color: '#6d7078', n: 5200 },
  { tile: 1, rough: 1, tags: ['floor', 'office'] },
);
D(
  'carpet_red',
  'carpet',
  'pebble',
  { color: '#7a1420', n: 5200 },
  { tile: 1, rough: 1, tags: ['floor', 'hotel', 'cinema'] },
);
D(
  'carpet_teal',
  'carpet',
  'pebble',
  { color: '#1f5d5a', n: 5200 },
  { tile: 1, rough: 1, tags: ['floor', 'hotel'] },
);
D(
  'fabric_linen',
  'fabric',
  'weave',
  { color: '#d9d0bc' },
  { tile: 0.3, rough: 0.95, tags: ['upholstery', 'curtain'] },
);
D(
  'fabric_denim',
  'fabric',
  'weave',
  { color: '#2f4a73', n: 96 },
  { tile: 0.25, rough: 0.9, tags: ['clothing'] },
);
D(
  'fabric_velvet_green',
  'fabric',
  'pebble',
  { color: '#1d4a3a', n: 6000 },
  { tile: 0.4, rough: 1, tags: ['upholstery', 'luxury'] },
);
D(
  'fabric_awning_stripe',
  'fabric',
  'weave',
  { color: '#f1ede2', stripe: '#c1272d', n: 96 },
  { tile: 1, rough: 0.9, tags: ['awning'] },
);
D(
  'leather_tan',
  'leather',
  'pebble',
  { color: '#a8703a' },
  { tile: 0.4, rough: 0.55, tags: ['seat', 'bag'] },
);
D(
  'leather_black',
  'leather',
  'pebble',
  { color: '#1b1b1d' },
  { tile: 0.4, rough: 0.5, tags: ['seat', 'luxury'] },
);
D(
  'vinyl_red',
  'leather',
  'pebble',
  { color: '#b3121b', n: 1200 },
  { tile: 0.4, rough: 0.35, tags: ['diner', 'booth'] },
);
D(
  'vinyl_turquoise',
  'leather',
  'pebble',
  { color: '#2fb7a0', n: 1200 },
  { tile: 0.4, rough: 0.35, tags: ['diner', 'booth'] },
);
D(
  'laminate_white',
  'laminate',
  'grainy',
  { color: '#eeece6', n: 300, s: 0.004, a: 0.03, ha: 0.05 },
  { rough: 0.3, tags: ['counter', 'shelf'] },
);
D(
  'laminate_woodgrain',
  'laminate',
  'wood',
  { color: '#a87b4f', planks: 1 },
  { rough: 0.35, tags: ['counter', 'budget'] },
);
D(
  'ceramic_white',
  'ceramic',
  'grainy',
  { color: '#f6f5f1', n: 80, a: 0.02, ha: 0.03 },
  { rough: 0.1, tags: ['plate', 'fixture'] },
);
// ---- glass, light
D(
  'glass_clear',
  'glass',
  'grainy',
  { color: '#e8f1f2', n: 30, a: 0.01, ha: 0.02 },
  { rough: 0.03, glass: { opacity: 0.18 }, tags: ['window', 'cooler'] },
);
D(
  'glass_tinted_green',
  'glass',
  'grainy',
  { color: '#7fae9c', n: 30, a: 0.01, ha: 0.02 },
  { rough: 0.03, glass: { opacity: 0.4 }, tags: ['storefront', 'tower'] },
);
D(
  'glass_frosted',
  'glass',
  'grainy',
  { color: '#e9eeee', n: 3000, s: 0.004, a: 0.03, ha: 0.3 },
  { rough: 0.55, glass: { opacity: 0.6 }, tags: ['partition', 'bath'] },
);
D(
  'mirror',
  'glass',
  'grainy',
  { color: '#dfe5e8', n: 20, a: 0.01, ha: 0.01 },
  { rough: 0.02, metal: 1, tags: ['mirror'] },
);
for (const [n, c] of [
  ['pink', '#ff3fa4'],
  ['cyan', '#3fe0ff'],
  ['yellow', '#ffd23f'],
  ['green', '#4dff88'],
  ['red', '#ff3b30'],
  ['white', '#fff4e0'],
  ['purple', '#b06bff'],
  ['orange', '#ff8a2a'],
])
  D(
    'neon_' + n,
    'neon',
    'grainy',
    { color: c, n: 10, a: 0.01, ha: 0.01 },
    { rough: 0.3, emissive: c, emissiveIntensity: 2.4, tags: ['sign', 'tube'] },
  );
D(
  'screen_off',
  'screen',
  'grainy',
  { color: '#0c0d10', n: 40, a: 0.03, ha: 0.01 },
  { rough: 0.08, tags: ['tv', 'monitor'] },
);

const texCache = new Map(),
  matCache = new Map();
function buildSet(THREE, d, size, wear) {
  const key = d.name + '|' + size + '|' + wear;
  if (texCache.has(key)) return texCache.get(key);
  const S = size,
    c = makeCanvas(S),
    g = ctx2d(c, { willReadFrequently: true }),
    hc = makeCanvas(S),
    h = ctx2d(hc, { willReadFrequently: true });
  h.fillStyle = '#808080';
  h.fillRect(0, 0, S, S);
  const r = rng(d.name);
  PAINT[d.paint](g, h, S, { color: '#888888', ...d.o }, r);
  if (wear > 0) {
    blobs(g, r, Math.round(60 * wear), S * 0.12, ['#2a2218', '#000000'], 0.03, 0.14 * wear, S);
    blobs(g, r, Math.round(900 * wear), S * 0.006, ['#000000', '#3a2f20'], 0.1, 0.4, S);
    blobs(h, r, Math.round(500 * wear), S * 0.008, ['#000000'], 0.2, 0.6, S);
    for (let i = 0; i < 40 * wear; i++) {
      g.strokeStyle = rgba('#ffffff', 0.12);
      g.lineWidth = r.range(0.5, 1.5);
      const x = r() * S,
        y = r() * S;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + r.range(-S * 0.1, S * 0.1), y + r.range(-S * 0.1, S * 0.1));
      g.stroke();
    }
  }
  const hd = h.getImageData(0, 0, S, S).data,
    nc = makeCanvas(S),
    ng = ctx2d(nc),
    nd = ng.createImageData(S, S),
    rc = makeCanvas(S),
    rg = ctx2d(rc),
    rd = rg.createImageData(S, S);
  const H = (x, y) => hd[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  const str = d.bump ?? (d.category === 'metal' || d.category === 'glass' ? 1.2 : 3.2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4,
        dx = (H(x - 1, y) - H(x + 1, y)) * str,
        dy = (H(x, y - 1) - H(x, y + 1)) * str,
        l = 1 / Math.hypot(dx, dy, 1);
      nd.data[i] = (dx * l * 0.5 + 0.5) * 255;
      nd.data[i + 1] = (-dy * l * 0.5 + 0.5) * 255;
      nd.data[i + 2] = (l * 0.5 + 0.5) * 255;
      nd.data[i + 3] = 255;
      const hv = H(x, y),
        ro = Math.min(1, Math.max(0.02, d.rough + (0.5 - hv) * 0.5 + wear * 0.15));
      rd.data[i] = Math.min(255, 150 + hv * 190);
      rd.data[i + 1] = ro * 255;
      rd.data[i + 2] = d.metal * 255 * (wear ? Math.min(1, 0.6 + hv) : 1);
      rd.data[i + 3] = 255;
    }
  ng.putImageData(nd, 0, 0);
  rg.putImageData(rd, 0, 0);
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const set = { map: mk(c, true), normalMap: mk(nc), arm: mk(rc) };
  texCache.set(key, set);
  return set;
}
export const materials = {
  names() {
    return [...DEFS.keys()];
  },
  list(q = {}) {
    return [...DEFS.values()].filter(
      (d) => (!q.category || d.category === q.category) && (!q.tag || d.tags.includes(q.tag)),
    );
  },
  info(name) {
    return DEFS.get(name) || null;
  },
  has(name) {
    return DEFS.has(name);
  },
  categories() {
    return [...new Set([...DEFS.values()].map((d) => d.category))];
  },
  repeatFor(name, w, h) {
    const t = DEFS.get(name)?.tile || 1;
    return [w / t, h / t];
  },
  // PBR material from the library. opts: repeat, tint, wear, size (texture px, default 512), side, transparent, opacity, emissive, emissiveIntensity, envMapIntensity
  get(THREE, name, opts = {}) {
    let d = DEFS.get(name);
    if (!d) {
      console.warn('[design] unknown material', name);
      d = DEFS.get('concrete_smooth');
    }
    const wear = Math.round((opts.wear || 0) * 4) / 4,
      rep = Array.isArray(opts.repeat) ? opts.repeat : [opts.repeat || 1, opts.repeat || 1];
    const key = [
      d.name,
      wear,
      rep.join('x'),
      opts.tint || '',
      opts.size || 512,
      opts.side ?? '',
      opts.opacity ?? '',
      opts.emissiveIntensity ?? '',
      opts.envMapIntensity ?? '',
    ].join('|');
    if (matCache.has(key)) return matCache.get(key);
    const base = buildSet(THREE, d, opts.size || 512, wear);
    const t = {};
    for (const k of ['map', 'normalMap', 'arm']) {
      t[k] = rep[0] === 1 && rep[1] === 1 ? base[k] : base[k].clone();
      t[k].repeat.set(rep[0], rep[1]);
      t[k].needsUpdate = true;
    }
    const common = {
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.arm,
      metalnessMap: t.arm,
      aoMap: t.arm,
      roughness: 1,
      metalness: d.metal ? 1 : 0,
      color: opts.tint ? hexNum(opts.tint) : 0xffffff,
      side: opts.side ?? THREE.FrontSide,
      envMapIntensity: opts.envMapIntensity ?? 1,
    };
    let m;
    if (d.glass)
      m = new THREE.MeshPhysicalMaterial({
        ...common,
        transparent: true,
        opacity: opts.opacity ?? d.glass.opacity,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      });
    else
      m = new THREE.MeshStandardMaterial({
        ...common,
        transparent: !!opts.transparent,
        opacity: opts.opacity ?? 1,
      });
    if (d.emissive || opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive || d.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? d.emissiveIntensity ?? 1;
    }
    m.name = 'design:' + d.name;
    m.userData.design = { name: d.name, wear };
    matCache.set(key, m);
    return m;
  },
  preload(THREE, names, opts = {}) {
    return new Promise((res) => {
      const list = names.slice();
      const step = () => {
        const n = list.shift();
        if (!n) return res();
        materials.get(THREE, n, opts);
        setTimeout(step, 0);
      };
      step();
    });
  },
  setBase() {},
  dispose() {
    for (const s of texCache.values()) for (const t of Object.values(s)) t.dispose();
    for (const m of matCache.values()) m.dispose();
    texCache.clear();
    matCache.clear();
  },
};
void hexToRgb;
void lighten;
