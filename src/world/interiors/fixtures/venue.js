// Interior art kit: venue fixtures (nightclubs, bars, lounges, restaurants, cafes). Each fixture builds in its own frame
// (G.at(x, z, ry): local +z faces the room / the guest), adds its colliders, contact shadows, baked lights and people spots.
// Palette `pal` (see venuePalette): { accent, under, warm, velvet, wood, metal, marble: [ground, vein], stone: [base, vein], dark }.
//   barCounter backBar stool banquette sofa armchair cocktailTable candleLantern stanchions pottedPalm venueSconce pillar
//   flutedWall hostBar cofferedCeiling entryPortal speakerStack djBooth glassware pendantCluster artFrame wallPanels
import * as THREE from 'three';
import { FIXTURES, addLight, lampC } from '../lighting.js';
import { lin, clamp } from '../kit/util.js';
import { BottleField } from '../kit/bottles.js';
import { hazeCone, flame } from '../kit/fx.js';
import '../kit/venueSurfaces.js';

const DS = THREE.DoubleSide;
export function venuePalette(o = {}) {
  return { accent: '#ff3fd2', under: '#16e0d2', warm: '#ffc98a', velvet: [74, 18, 66], wood: [60, 36, 26], metal: [158, 136, 104], marble: [[22, 20, 24], [176, 168, 186]], stone: [[42, 37, 46], [104, 92, 112]], dark: '#0e0c11', wall: [36, 24, 40], ...o };
}
// shared materials for a palette (cached by the MatSet)
export function venueMats(ctx, pal) {
  const M = ctx.M;
  return {
    marble: M.surf('marble', { c: pal.marble[0], c2: pal.marble[1], probe: 0.9 }),
    walnut: M.surf('walnut', { c: pal.wood, probe: 0.25 }),
    velvet: M.surf('velvet', { c: pal.velvet }), tufted: M.surf('tufted', { c: pal.velvet }),
    brass: M.surf('brass', { c: pal.metal, probe: 1.3 }), chrome: M.flat('#c9ccd1', { metal: 1, rough: 0.14, probe: 1.3 }),
    black: M.flat(pal.dark, { rough: 0.32, probe: 0.35 }), matte: M.flat('#121014', { rough: 0.8 }), steel: M.surf('steel', { wear: 0.15 }),
    glass: M.glass({ tint: '#dfe8ee', opacity: 0.12 }), mirror: M.flat('#2a2230', { metal: 0.95, rough: 0.05, probe: 1.4 }),
    leather: M.surf('leather', { c: [24, 18, 16] }), soil: M.flat('#2a2018', { rough: 1 }),
  };
}

// ---------------------------------------------------------------- bar counter (patron side +z). o: { l, h, pal, bottles (BottleField), stools }
export function barCounter(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), L = o.l || 4, H = o.h || 1.08, front = M.surf('fluted', { c: o.frontC || [26, 22, 30], probe: 0.3 }), under = pal.under;
  G.at(x, z, ry, () => {
    // die wall: fluted front (tessellated so the under-glow gradient bakes), kick recess, sides
    G.boxB(V.matte, 0, 0, 0.06, L, H - 0.05, 0.36);
    G.plane(front, 0, 0.12 + (H - 0.17) / 2, 0.245, L, H - 0.17, { step: 0.1 });
    G.boxB(V.black, 0, 0, 0.15, L - 0.02, 0.12, 0.2);
    for (const sx of [-1, 1]) G.plane(front, sx * L / 2, 0.12 + (H - 0.17) / 2, 0.06, 0.38, H - 0.17, { ry: sx * Math.PI / 2, step: 0.1 });
    // marble top with a bullnose and a dark drip edge
    G.box(V.marble, 0, H - 0.025, 0.04, L + 0.12, 0.05, 0.66); G.cyl(V.marble, 0, H - 0.025, 0.37, 0.026, L + 0.12, { rz: Math.PI / 2, seg: 10 });
    for (const sx of [-1, 1]) G.sphere(V.marble, sx * (L / 2 + 0.06), H - 0.025, 0.37, 0.026, { seg: 8 });
    // under-glow: LED in the kick (down and out onto the floor) + LED under the top lip washing the fluted front
    FIXTURES.led(ctx, [-L / 2 + 0.05, 0.115, 0.255], [L / 2 - 0.05, 0.115, 0.255], { color: under, k: o.kUnder ?? 2.2, glow: 3.2, w: 0.014, d: [0, -0.55, 0.84], every: 0.6 });
    FIXTURES.led(ctx, [-L / 2 + 0.05, H - 0.07, 0.3], [L / 2 - 0.05, H - 0.07, 0.3], { color: under, k: o.kTop ?? 2.6, glow: 3.0, w: 0.012, d: [0, -0.97, 0.25], every: 0.6 });
    // brass foot rail on brackets
    G.cyl(V.brass, 0, 0.2, 0.36, 0.024, L - 0.1, { rz: Math.PI / 2, seg: 12 }); for (let u = -L / 2 + 0.3; u <= L / 2 - 0.2; u += 1.1) G.box(V.brass, u, 0.17, 0.3, 0.03, 0.06, 0.12);
    // bartender side: stainless underbar, speed rail with bottles, ice well, glass racks, workboard lights
    G.boxB(V.steel, 0, 0, -0.27, L - 0.1, 0.86, 0.3); G.box(V.steel, 0, 0.88, -0.24, L - 0.1, 0.03, 0.36);
    G.box(M.flat('#cfd6dc', { rough: 0.2, metal: 0.4 }), -L * 0.18, 0.86, -0.24, 0.6, 0.02, 0.28); // ice well
    G.box(V.steel, 0, 0.6, -0.46, L - 0.3, 0.012, 0.1); if (o.bottles) o.bottles.row(-L / 2 + 0.25, L / 2 - 0.25, 0.6, -0.46, { glow: 0.25, gap: 0.03, sparse: 0.2 });
    for (let u = -L / 2 + 0.6; u < L / 2 - 0.4; u += 1.3) { G.box(M.flat('#2a2d33', { rough: 0.7 }), u + 0.6, 0.93, -0.26, 0.5, 0.06, 0.32); for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) glassware(ctx, u + 0.42 + i * 0.12, 0.96, -0.33 + j * 0.13, 'rocks'); }
    FIXTURES.led(ctx, [-L / 2 + 0.1, H - 0.1, -0.05], [L / 2 - 0.1, H - 0.1, -0.05], { color: pal.warm, k: 0.6, glow: 1.6, w: 0.01, d: [0, -1, -0.3], every: 1.2 });
    // a few things on the top
    const R = ctx.R; for (let u = -L / 2 + 0.5; u < L / 2 - 0.3; u += R.range(0.7, 1.2)) { const k = R(); if (k < 0.45) glassware(ctx, u, H, 0.15 + R.jit(0.08), R.pick(['coupe', 'highball', 'rocks', 'martini'])); else if (k < 0.6) { G.cylB(V.black, u, H, 0.12, 0.05, 0.1, { seg: 10 }); } }
    ctx.solid(-L / 2 - 0.06, 0, -0.42, L / 2 + 0.06, H, 0.4); ctx.shadow(0, 0.3, L, 0.4);
    for (let u = -L / 2 + 0.6; u <= L / 2 - 0.5; u += 1.2) ctx.poi('bartend', u, -0.7, Math.PI, { counter: true });
    if (o.stools) for (let u = -L / 2 + 0.35; u <= L / 2 - 0.3; u += o.stools) { stool(ctx, u, 0.72, Math.PI, { pal }); ctx.poi('stool', u, 0.72, Math.PI, { seatY: 0.78 }); }
  });
}

// ---------------------------------------------------------------- back bar against a wall (local z = 0 is the wall). o: { l, h (top), shelves, pal, bottles }
export function backBar(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), L = o.l || 4, top = o.h || 3, n = o.shelves || 4, B = o.bottles;
  G.at(x, z, ry, () => {
    // base cabinet: walnut doors, marble top, plinth
    G.boxB(V.matte, 0, 0, 0.28, L, 0.08, 0.5); G.boxB(V.walnut, 0, 0.08, 0.29, L, 0.86, 0.54); G.box(V.marble, 0, 0.965, 0.3, L + 0.02, 0.04, 0.6);
    for (let u = -L / 2 + 0.45; u < L / 2 - 0.3; u += 0.9) { G.box(V.brass, u + 0.2, 0.62, 0.565, 0.012, 0.18, 0.012); G.box(M.flat('#1a110c', { rough: 0.6 }), u, 0.5, 0.562, 0.004, 0.8, 0.004); }
    // tall unit: smoked-mirror back, walnut cheeks, brass uprights, glass shelves with a lit front edge, soffit with downlights
    const y0 = 1.0, y1 = top - 0.32; G.plane(V.mirror, 0, (y0 + y1) / 2, 0.012, L, y1 - y0, { step: 0.3 });
    for (const sx of [-1, 1]) G.boxB(V.walnut, sx * (L / 2 - 0.04), y0, 0.18, 0.08, top - y0, 0.36);
    const bays = Math.max(1, Math.round(L / 1.15)), bw = L / bays;
    for (let i = 1; i < bays; i++) G.boxB(V.brass, -L / 2 + i * bw, y0, 0.16, 0.035, y1 - y0, 0.3);
    G.boxB(V.walnut, 0, y1, 0.2, L, top - y1, 0.42); G.box(V.brass, 0, y1 + 0.01, 0.415, L, 0.02, 0.01);
    for (let i = 0; i < bays; i++) FIXTURES.can(ctx, -L / 2 + (i + 0.5) * bw, y1, 0.22, { lamp: 'warm', k: 2.2, cone: 0.7 });
    const glassShelf = M.glass({ tint: '#e8f4f8', opacity: 0.35 }), edge = M.glow(pal.shelf || '#ffc27a', 1.7, 1);
    for (let k = 0; k < n; k++) { const y = y0 + 0.12 + k * ((y1 - y0 - 0.25) / n);
      G.box(glassShelf, 0, y, 0.17, L - 0.1, 0.018, 0.3); G.box(edge, 0, y - 0.004, 0.322, L - 0.1, 0.012, 0.008); G.box(V.brass, 0, y - 0.016, 0.325, L - 0.1, 0.008, 0.012);
      // the shelf lights the row above it (from beneath) and the mirror
      for (let u = -L / 2 + 0.4; u < L / 2; u += 0.8) addLight(ctx, { p: [u, y + 0.03, 0.26], c: lampC('amber', 0.32), ch: 1, type: 'area', d: [0, 0.85, 0.5], soft: 0.12, wrap: 0.3, amb: 0.5, noPool: u > -L / 2 + 0.5 });
      if (B) B.row(-L / 2 + 0.1, L / 2 - 0.1, y + 0.01, 0.15, { glow: 1, jitter: 0.03, sparse: k === n - 1 ? 0.25 : 0.05, fams: k === 0 ? ['whisky', 'decanter', 'rum', 'tequila', 'flask'] : k === n - 1 ? ['wine', 'decanter', 'flask', 'gin'] : undefined });
    }
    // countertop mise en place
    if (B) for (let u = -L / 2 + 0.3; u < L / 2 - 0.2; u += ctx.R.range(0.5, 1.1)) B.add(u, 0.985, 0.3 + ctx.R.jit(0.08), ctx.R.jit(0.4), { glow: 0.2 });
    ctx.solid(-L / 2, 0, 0, L / 2, top, 0.58); ctx.shadow(0, 0.4, L, 0.4);
  });
}

// ---------------------------------------------------------------- bar stool (padded round seat on a pedestal)
export function stool(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), h = o.h || 0.76, seat = o.seat === 'velvet' ? V.velvet : M.surf('leather', { c: o.seatC || [30, 20, 28] }), frame = o.frame === 'chrome' ? V.chrome : V.black;
  G.at(x, z, ry, () => {
    G.cylB(frame, 0, 0, 0, 0.21, 0.02, { seg: 20 }); G.cylB(frame, 0, 0.02, 0, 0.06, 0.03, { seg: 14, r2: 0.03 }); G.cylB(V.chrome, 0, 0.05, 0, 0.026, h - 0.12, { seg: 10 });
    G.add(V.brass, new THREE.TorusGeometry(0.17, 0.011, 6, 22), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.3, 0));
    for (let k = 0; k < 3; k++) G.box(V.brass, Math.cos(k * 2.09) * 0.09, 0.3, Math.sin(k * 2.09) * 0.09, 0.16, 0.012, 0.012, { ry: -k * 2.09 });
    G.cylB(frame, 0, h - 0.08, 0, 0.17, 0.03, { seg: 18 });
    G.cylB(seat, 0, h - 0.05, 0, 0.2, 0.06, { seg: 22 }); G.add(seat, new THREE.TorusGeometry(0.19, 0.03, 8, 24), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, h + 0.005, 0)); G.cyl(seat, 0, h + 0.03, 0, 0.19, 0.012, { seg: 22 });
    ctx.solid(-0.18, 0, -0.18, 0.18, h, 0.18, { occ: false }); ctx.shadow(0, 0, 0.42, 0.42);
  });
}

// ---------------------------------------------------------------- banquette against a wall (local z = 0 is the wall). o: { l, pal, back (m), led }
export function banquette(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), L = o.l || 3, sh = 0.46, sd = 0.56, bh = o.back ?? 1.15;
  G.at(x, z, ry, () => {
    G.boxB(V.black, 0, 0, 0.3, L, 0.12, 0.52);
    if (o.led !== false) FIXTURES.led(ctx, [-L / 2 + 0.05, 0.03, 0.565], [L / 2 - 0.05, 0.03, 0.565], { color: o.ledC || pal.accent, k: 0.7, glow: 2.4, w: 0.01, d: [0, -0.6, 0.8], every: 0.9 });
    // seat cushion with a rolled front edge
    G.box(V.velvet, 0, sh - 0.08, 0.3 + 0.02, L, 0.16, sd - 0.06); G.cyl(V.velvet, 0, sh - 0.08, sd - 0.005, 0.08, L, { rz: Math.PI / 2, seg: 12 });
    // tufted back, slightly reclined, with a top roll, made of plane facets (bakes smoothly)
    G.push(new THREE.Matrix4().makeTranslation(0, sh, 0.12).multiply(new THREE.Matrix4().makeRotationX(-0.12)));
    G.plane(V.tufted, 0, (bh - sh) / 2, 0.06, L, bh - sh, { step: 0.2 }); G.box(V.velvet, 0, (bh - sh) / 2, 0.0, L, bh - sh, 0.11);
    G.cyl(V.velvet, 0, bh - sh, 0.02, 0.07, L, { rz: Math.PI / 2, seg: 12 }); G.pop();
    if (o.wash) FIXTURES.led(ctx, [-L / 2 + 0.1, bh + 0.02, 0.06], [L / 2 - 0.1, bh + 0.02, 0.06], { color: o.wash, k: o.washK ?? 1.1, glow: 2.2, w: 0.01, d: [0, 1, -0.25], every: 0.7 }); // wall wash above the back
    for (const sx of [-1, 1]) if (o.ends !== false) { G.boxB(V.velvet, sx * (L / 2 - 0.06), 0, 0.32, 0.12, 0.66, sd + 0.02); G.cyl(V.velvet, sx * (L / 2 - 0.06), 0.66, 0.32, 0.06, sd + 0.02, { rx: Math.PI / 2, seg: 10 }); }
    ctx.solid(-L / 2, 0, 0, L / 2, sh, sd, { occ: false }); ctx.solid(-L / 2, 0, 0, L / 2, bh, 0.22, { occ: false }); ctx.shadow(0, 0.35, L, 0.6);
    for (let u = -L / 2 + 0.4; u < L / 2 - 0.2; u += 0.7) ctx.poi('sit', u, 0.45, 0, { seatY: sh });
  });
}

// ---------------------------------------------------------------- lounge sofa / armchair (freestanding, back at local -z). o: { w, pal, seats }
export function sofa(ctx, x, z, ry, o = {}) {
  const { G } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), W = o.w || 1.9, D = 0.85, sh = 0.42;
  G.at(x, z, ry, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.cylB(V.brass, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.018, 0.1, { seg: 8, r2: 0.012 });
    G.boxB(V.velvet, 0, 0.1, 0, W, sh - 0.14, D); G.box(V.velvet, 0, sh - 0.02, 0.06, W - 0.3, 0.1, D - 0.2);
    G.plane(V.tufted, 0, sh + 0.3, -D / 2 + 0.19, W - 0.3, 0.55, { step: 0.2, rx: -0.1 }); G.box(V.velvet, 0, sh + 0.25, -D / 2 + 0.1, W, 0.55, 0.18);
    for (const sx of [-1, 1]) { G.boxB(V.velvet, sx * (W / 2 - 0.08), 0.1, 0, 0.16, 0.42, D); G.cyl(V.velvet, sx * (W / 2 - 0.08), 0.52, 0, 0.09, D, { rx: Math.PI / 2, seg: 12 }); }
    ctx.solid(-W / 2, 0, -D / 2, W / 2, sh + 0.35, D / 2, { occ: false }); ctx.shadow(0, 0, W, D);
    const seats = Math.max(1, Math.round((W - 0.3) / 0.6)); for (let i = 0; i < seats; i++) ctx.poi('sit', (i - (seats - 1) / 2) * 0.6, 0.12, 0, { seatY: sh });
  });
}
export const armchair = (ctx, x, z, ry, o = {}) => sofa(ctx, x, z, ry, { ...o, w: o.w || 0.95 });

// ---------------------------------------------------------------- tables
export function cocktailTable(ctx, x, z, o = {}) {
  const { G } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), r = o.r || 0.32, h = o.h || 0.56, topM = o.top === 'brass' ? V.brass : V.marble;
  G.cylB(V.brass, x, 0, z, 0.2, 0.025, { seg: 20 }); G.cylB(V.brass, x, 0.025, z, 0.03, h - 0.06, { seg: 10 });
  G.cylB(topM, x, h - 0.035, z, r, 0.035, { seg: 28 }); G.add(V.brass, new THREE.TorusGeometry(r, 0.008, 5, 32), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, h - 0.018, z));
  ctx.solid(x - r, 0, z - r, x + r, h, z + r, { occ: false }); ctx.shadow(x, z, r * 2, r * 2);
  if (o.lantern !== false) candleLantern(ctx, x + (o.lx ?? 0.05), h, z + (o.lz ?? -0.05), { pal });
  const R = ctx.R; if (o.drinks !== false) for (let i = 0; i < (o.drinks ?? R.int(1, 3)); i++) { const a = R() * 6.28; glassware(ctx, x + Math.cos(a) * r * 0.6, h, z + Math.sin(a) * r * 0.6, R.pick(['coupe', 'highball', 'rocks', 'martini', 'flute'])); }
  if (o.bucket && R.chance(0.6)) { G.lathe(V.chrome, [[0.06, 0], [0.09, 0.02], [0.1, 0.2], [0.105, 0.21]], x - r * 0.4, h, z + r * 0.3, { seg: 16 }); if (o.bottles) o.bottles.add(x - r * 0.4, h + 0.08, z + r * 0.3, 0, { shape: 'wine', glow: 0.1 }); }
}
// candle in a glass lantern (warm glow, flickering flame, baked light)
export function candleLantern(ctx, x, y, z, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), r = o.r || 0.042, h = o.h || 0.13;
  G.cylB(V.brass, x, y, z, r + 0.006, 0.012, { seg: 14 }); G.cylB(M.flat('#f2e6cf', { rough: 0.8 }), x, y + 0.012, z, r * 0.62, 0.05, { seg: 12 });
  G.cylB(M.glow(o.glassC || '#ffb070', o.glassK ?? 0.75, 1), x, y + 0.012, z, r, h, { seg: 16, open: true }); G.cylB(V.brass, x, y + h + 0.012, z, r + 0.004, 0.008, { seg: 14 });
  flame(ctx, x, y + 0.062, z, { k: o.k ?? 0.28 });
}
// glassware: 'rocks' | 'highball' | 'coupe' | 'martini' | 'flute' | 'wine' with an optional drink
export function glassware(ctx, x, y, z, kind = 'rocks', o = {}) {
  const { G, M } = ctx, gl = M.glass({ tint: '#eef6fa', opacity: 0.22, rough: 0.02 }), drink = o.drink || ctx.R.pick(['#c8741e', '#e8c28a', '#d0204a', '#f2f0d8', '#7ad0e8', '#ffb43a']), dm = M.glow(drink, 0.35, 1);
  if (kind === 'rocks') { G.cylB(gl, x, y, z, 0.038, 0.085, { seg: 12 }); if (o.full !== false) G.cylB(dm, x, y + 0.006, z, 0.033, 0.045, { seg: 10 }); }
  else if (kind === 'highball') { G.cylB(gl, x, y, z, 0.032, 0.14, { seg: 12 }); if (o.full !== false) G.cylB(dm, x, y + 0.006, z, 0.028, 0.1, { seg: 10 }); }
  else if (kind === 'coupe' || kind === 'martini' || kind === 'flute' || kind === 'wine') {
    const bowl = kind === 'coupe' ? [[0.003, 0], [0.045, 0.012], [0.055, 0.04]] : kind === 'martini' ? [[0.003, 0], [0.06, 0.06]] : kind === 'flute' ? [[0.003, 0], [0.025, 0.04], [0.028, 0.12]] : [[0.003, 0], [0.04, 0.03], [0.042, 0.07], [0.036, 0.1]];
    const st = kind === 'flute' ? 0.09 : 0.1; G.cylB(gl, x, y, z, 0.03, 0.004, { seg: 10 }); G.cylB(gl, x, y + 0.004, z, 0.0035, st, { seg: 6 }); G.lathe(gl, bowl.map(([r, h]) => [r, h]), x, y + st, z, { seg: 12 });
    if (o.full !== false) { const top = bowl[bowl.length - 1], k = 0.7; G.lathe(dm, bowl.filter((q) => q[1] <= top[1] * k).concat([[top[0] * 0.92, top[1] * k]]).map(([r, h]) => [r * 0.94, h]), x, y + st + 0.001, z, { seg: 10 }); }
  }
}

// ---------------------------------------------------------------- velvet rope stanchions along a polyline [[x, z], ...] (current frame)
export function stanchions(ctx, pts, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), rope = M.surf('velvet', { c: o.rope || [150, 12, 34], n: 2 }), h = 0.95;
  for (const [x, z] of pts) { G.cylB(V.brass, x, 0, z, 0.16, 0.025, { seg: 18 }); G.lathe(V.brass, [[0.16, 0], [0.12, 0.03], [0.04, 0.06], [0.025, 0.08]], x, 0.02, z, { seg: 16 }); G.cylB(V.brass, x, 0.08, z, 0.022, h - 0.1, { seg: 10 }); G.sphere(V.brass, x, h + 0.02, z, 0.042, { seg: 12 }); ctx.solid(x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1, { occ: false }); ctx.shadow(x, z, 0.3, 0.3); }
  for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; if (o.gaps?.includes(i)) continue; const sag = 0.24, y = h - 0.06, n = 8, P = [];
    for (let k = 0; k <= n; k++) { const t = k / n; P.push([ax + (bx - ax) * t, y - sag * 4 * t * (1 - t), az + (bz - az) * t]); }
    G.tube(rope, P, 0.016, { segs: 20, seg: 7 }); ctx.solid(Math.min(ax, bx), 0.4, Math.min(az, bz) - 0.03, Math.max(ax, bx), h, Math.max(az, bz) + 0.03, { occ: false, soft: false }); }
}

// ---------------------------------------------------------------- potted palm with a colored uplight. o: { h, potH, potR, pot: 'black'|'brass'|'stone', light (color), k }
let FROND = null;
function frondTex() {
  if (FROND) return FROND; const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = '#4f6a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 64); g.lineTo(512, 64); g.stroke();
  for (let i = 0; i < 64; i++) { const t = i / 64, x = 8 + t * 498, L = 60 * Math.sin(Math.min(1, t * 1.1 + 0.1) * Math.PI) ** 0.5 + 6;
    for (const sg of [-1, 1]) { const a = sg * (0.95 - t * 0.35) + (r() - 0.5) * 0.12, ex = x + Math.cos(a * 0.6) * L * 0.75, ey = 64 + Math.sin(a) * L; const gr = g.createLinearGradient(x, 64, ex, ey); const l = 40 + r() * 14;
      gr.addColorStop(0, `hsl(${92 + r() * 14},48%,${l}%)`); gr.addColorStop(1, `hsl(${84 + r() * 16},52%,${l + 10}%)`); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 3, 64); g.quadraticCurveTo((x + ex) / 2 + 9, (64 + ey) / 2 - sg * 6, ex, ey); g.quadraticCurveTo((x + ex) / 2 - 2, (64 + ey) / 2 + sg * 7, x + 9, 64); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; FROND = t; return t;
}
function frondGeo(len, w, arch, droop, twist) { // ribbon along an arching curve: u along the frond, v across (0..1), slight V fold
  const N = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N, y = Math.sin(t * Math.PI * 0.55) * arch - t * t * droop, xx = t * len, ww = w * Math.sin(Math.min(1, t * 1.15 + 0.08) * Math.PI) ** 0.4;
    for (let j = 0; j <= 2; j++) { const v = j / 2, side = (v - 0.5) * 2, fold = Math.abs(side) * 0.18 * ww; pos.push(xx, y + fold * (1 - t * 0.5) + side * twist * t, side * ww * 0.5); uv.push(t, v); } }
  for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // leaves are double sided and lit from below (pot uplight): bake them with normals that face down and out along the frond
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { let nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i); if (ny > 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx + 0.5, ny - 0.15, nz) || 1; n.setXYZ(i, (nx + 0.5) / l, (ny - 0.15) / l, nz / l); } return g;
}
export function pottedPalm(ctx, x, z, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), R = ctx.R, pr = o.potR || 0.26, ph = o.potH || 0.62, H = o.h || 2.1;
  const pot = o.pot === 'brass' ? V.brass : o.pot === 'stone' ? M.surf('concrete', { c: [70, 66, 64] }) : M.flat('#0b0a0c', { rough: 0.18, probe: 0.6 });
  G.lathe(pot, [[pr * 0.78, 0], [pr, ph * 0.12], [pr * 1.02, ph * 0.9], [pr * 1.06, ph], [pr * 0.96, ph]], x, 0, z, { seg: 24 }); G.cylB(V.soil, x, ph - 0.05, z, pr * 0.95, 0.02, { seg: 18 });
  const leaf = M.page(frondTex(), { alpha: true, side: DS, rough: 0.6 }), stem = M.flat('#5b6b34', { rough: 0.7 }), nS = o.stems || R.int(11, 14);
  for (let i = 0; i < nS; i++) { const az = (i / nS) * 6.283 + R.jit(0.3), lean = 0.18 + R() * 0.35, sl = H * R.range(0.45, 0.75), bx = x + Math.cos(az) * 0.05, bz = z + Math.sin(az) * 0.05, tx = bx + Math.cos(az) * sl * lean, tz = bz + Math.sin(az) * sl * lean, ty = ph + sl * Math.cos(lean * 0.8);
    G.tube(stem, [[bx, ph - 0.02, bz], [(bx + tx) / 2, (ph + ty) / 2 + 0.05, (bz + tz) / 2], [tx, ty, tz]], 0.009, { segs: 8, seg: 5 });
    const fl = H * R.range(0.45, 0.65), geo = frondGeo(fl, R.range(0.55, 0.7), R.range(0.12, 0.3), R.range(0.35, 0.75), R.jit(0.06)), m = new THREE.Matrix4().makeTranslation(tx, ty, tz).multiply(new THREE.Matrix4().makeRotationY(-az)).multiply(new THREE.Matrix4().makeRotationZ(R.range(0.35, 0.8)));
    G.add(leaf, geo, m); geo.dispose(); }
  // uplight in the pot rim: colored spot up through the fronds (and onto the wall behind)
  const lc = o.light || pal.accent; if (lc) { G.cyl(M.glow(lc, 2.6, 1), x + pr * 0.55, ph - 0.03, z, 0.035, 0.01, { seg: 10 }); const c = lin(lc), k = o.k ?? 3.2;
    addLight(ctx, { p: [x + pr * 0.55, ph + 0.02, z], c: [c[0] * k, c[1] * k, c[2] * k], ch: 1, type: 'spot', d: [0.05, 1, 0], cone: 0.3, soft: 0.25, amb: 0.6, wrap: 0.5 });
    addLight(ctx, { p: [x, ph + H * 0.42, z], c: [c[0] * k * 0.35, c[1] * k * 0.35, c[2] * k * 0.35], ch: 1, type: 'omni', soft: 0.5, wrap: 0.6, amb: 0.3, noPool: true }); }
  ctx.solid(x - pr, 0, z - pr, x + pr, ph, z + pr, { occ: false }); ctx.shadow(x, z, pr * 2.4, pr * 2.4);
}

// ---------------------------------------------------------------- wall sconce: brass back plate, frosted shade, up + down wash. (x, z) on the wall, ry into the room
export function venueSconce(ctx, x, y, z, ry, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), c = o.color || pal.warm, cl = lin(c), k = o.k ?? 1.6;
  G.at(x, z, ry, () => { G.box(V.brass, 0, 0, 0.01, 0.1, 0.34, 0.02); G.cyl(V.brass, 0, 0, 0.05, 0.012, 0.08, { rx: Math.PI / 2, seg: 8 });
    G.cyl(M.glow(c, 1.4, o.ch ?? 1), 0, 0, 0.1, 0.055, 0.22, { seg: 14 }); G.cyl(V.brass, 0, 0.115, 0.1, 0.058, 0.012, { seg: 14 }); G.cyl(V.brass, 0, -0.115, 0.1, 0.058, 0.012, { seg: 14 });
    for (const s of [1, -1]) addLight(ctx, { p: [0, s * 0.14, 0.1], c: [cl[0] * k, cl[1] * k, cl[2] * k], ch: o.ch ?? 1, type: 'spot', d: [0, s, -0.12], cone: 0.55, soft: 0.12, amb: 0.6, noPool: s < 0 });
  }, y);
}

// ---------------------------------------------------------------- square pillar floor to ceiling. o: { w, h, finish: 'dark'|'mirror'|'plaster', led (color) }
export function pillar(ctx, x, z, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), w = o.w || 0.46, h = o.h || 4;
  const fin = o.finish === 'mirror' ? V.mirror : o.finish === 'plaster' ? M.surf('plaster', { c: pal.wall }) : M.flat(o.c || '#141117', { rough: 0.4, probe: 0.4 });
  for (const [sx, sz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) G.plane(fin, x + sx * w / 2, h / 2, z + sz * w / 2, w, h, { ry, step: 0.35 });
  G.boxB(V.brass, x, 0, z, w + 0.02, 0.12, w + 0.02); G.boxB(V.matte, x, 0.12, z, w + 0.01, 0.01, w + 0.01);
  if (o.led) for (const [sx, sz] of o.ledFaces || [[0, 1]]) FIXTURES.led(ctx, [x + sx * (w / 2 + 0.004), 0.3, z + sz * (w / 2 + 0.004)], [x + sx * (w / 2 + 0.004), h - 0.3, z + sz * (w / 2 + 0.004)], { color: o.led, k: 0.6, glow: 2.6, w: 0.012, every: 1.2 });
  ctx.solid(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2);
}

// ---------------------------------------------------------------- fluted feature wall from x0 to x1 on a wall at local z (facing +z), uplights at its foot
const FLUTE = new Map();
function flutedGeo(w, h, pitch, rows) {
  const key = `${w.toFixed(2)}:${h.toFixed(2)}:${pitch}:${rows}`; let g = FLUTE.get(key); if (g) return g;
  const n = Math.max(1, Math.round(w / pitch)), p = w / n, A = 6, pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) for (let r = 0; r <= rows; r++) for (let a = 0; a <= A; a++) { const t = a / A, ang = Math.PI * (1 - t), xx = -w / 2 + (i + 0.5) * p + Math.cos(ang) * p * 0.48, zz = Math.sin(ang) * p * 0.32, yy = (r / rows) * h; pos.push(xx, yy, zz); nor.push(Math.cos(ang), 0, Math.sin(ang) * 0.9 + 0.1); uv.push(xx / 0.6, yy / 0.6); }
  const per = (rows + 1) * (A + 1); for (let i = 0; i < n; i++) for (let r = 0; r < rows; r++) for (let a = 0; a < A; a++) { const b = i * per + r * (A + 1) + a; idx.push(b, b + 1, b + A + 1, b + 1, b + A + 2, b + A + 1); }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.userData.shared = true; FLUTE.set(key, g); return g;
}
export function flutedWall(ctx, x0, x1, y0, y1, z, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), w = x1 - x0, h = y1 - y0, mat = M.flat(o.c || '#2a1d30', { rough: 0.38, probe: 0.3 }), lc = o.light || pal.accent, cl = lin(lc), k = o.k ?? 2.2;
  G.add(mat, flutedGeo(w, h, o.pitch || 0.075, Math.max(6, Math.round(h / 0.22))), new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y0, z));
  G.boxB(M.flat(pal.dark, { rough: 0.5 }), (x0 + x1) / 2, y0 - 0.001, z + 0.08, w + 0.06, 0.06, 0.16); G.box(M.flat(pal.dark, { rough: 0.5 }), (x0 + x1) / 2, y1 + 0.03, z + 0.06, w + 0.06, 0.06, 0.12);
  const n = Math.max(2, Math.round(w / (o.every || 0.85)));
  for (let i = 0; i < n; i++) { const xx = x0 + (i + 0.5) * w / n; G.box(M.glow(lc, 2.8, 1), xx, y0 + 0.062, z + 0.1, 0.16, 0.006, 0.05);
    addLight(ctx, { p: [xx, y0 + 0.08, z + 0.14], c: [cl[0] * k, cl[1] * k, cl[2] * k], ch: 1, type: 'spot', d: [0, 1, -0.22], cone: 0.82, soft: 0.1, amb: 0.5, noPool: i % 2 === 1 }); }
  if (o.top !== false) FIXTURES.led(ctx, [x0 + 0.05, y1 - 0.02, z + 0.1], [x1 - 0.05, y1 - 0.02, z + 0.1], { color: lc, k: 0.6, glow: 2.2, w: 0.01, d: [0, -1, 0.1], every: 1.1 });
}

// ---------------------------------------------------------------- host / DJ stand with a glowing frosted-glass front (front +z). o: { l, h, pal, dj }
export function hostBar(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), L = o.l || 2.6, H = o.h || 1.08, D = 0.62, gc = o.glowC || '#ffd0f6', c = lin(o.lightC || pal.accent);
  G.at(x, z, ry, () => {
    G.boxB(V.matte, 0, 0, -0.02, L, H - 0.06, D - 0.1);
    const frost = frostGlow(ctx, gc, o.k ?? 0.9), fr = { uvRect: frost.userData.frostRect }; G.plane(frost, 0, (0.08 + H - 0.06) / 2, D / 2 - 0.02, L - 0.04, H - 0.14, fr);
    if (!INT_ART_OFF) G.plane(M.glass({ tint: '#ffffff', opacity: 0.08, rough: 0.05, env: 1.6 }), 0, (0.08 + H - 0.06) / 2, D / 2 - 0.006, L - 0.04, H - 0.14); // r2-art: the glass face in front of the backlit reeds: a real sheen / reflection layer
    for (const sx of [-1, 1]) G.plane(frost, sx * (L / 2 - 0.005), (0.08 + H - 0.06) / 2, 0, D - 0.06, H - 0.14, { ry: sx * Math.PI / 2, ...fr });
    const mul = Math.round(L / 0.42); for (let i = 0; i <= mul; i++) G.box(V.black, -L / 2 + 0.02 + i * (L - 0.04) / mul, (0.08 + H) / 2 - 0.03, D / 2 - 0.01, 0.018, H - 0.14, 0.012);
    G.boxB(V.black, 0, 0, D / 2 - 0.06, L, 0.08, 0.1); G.box(V.marble, 0, H - 0.03, 0, L + 0.08, 0.06, D + 0.04);
    for (let i = 0; i < 3; i++) addLight(ctx, { p: [(i - 1) * L / 3, H * 0.45, D / 2 + 0.1], c: [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6], ch: 1, type: 'area', d: [0, -0.3, 1], soft: 0.4, wrap: 0.3, amb: 0.7, noPool: i !== 1 });
    if (o.dj !== false) { // decks + mixer + laptop facing the back (the DJ stands behind)
      const body = M.flat('#18191c', { rough: 0.5 }), scr = M.glow('#5ad0ff', 1.2, 1);
      for (const sx of [-1, 1]) { G.box(body, sx * 0.48, H + 0.04, -0.05, 0.34, 0.06, 0.42); G.cyl(M.flat('#2a2c30', { rough: 0.35, metal: 0.5 }), sx * 0.48, H + 0.075, -0.0, 0.11, 0.01, { seg: 20 }); G.box(scr, sx * 0.48, H + 0.074, -0.2, 0.12, 0.004, 0.06); }
      G.box(body, 0, H + 0.045, -0.05, 0.3, 0.07, 0.38); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) G.cyl(M.flat('#d9dce0', { rough: 0.4 }), -0.09 + i * 0.06, H + 0.088, -0.17 + j * 0.07, 0.01, 0.014, { seg: 6 });
      G.box(M.flat('#9ca2a8', { rough: 0.3, metal: 0.8 }), L / 2 - 0.35, H + 0.012, -0.1, 0.34, 0.012, 0.24); G.box(M.glow('#c6e6ff', 0.9, 1), L / 2 - 0.35, H + 0.12, -0.21, 0.32, 0.2, 0.004, { rx: 0.25 }); }
    else { G.box(M.flat('#0c0c0e', { rough: 0.3 }), L * 0.25, H + 0.05, -0.05, 0.3, 0.2, 0.012, { rx: -0.2 }); candleLantern(ctx, -L * 0.3, H, 0.05, { pal }); }
    ctx.solid(-L / 2, 0, -D / 2, L / 2, H, D / 2); ctx.shadow(0, 0, L, D);
    ctx.poi(o.dj !== false ? 'dj' : 'host', 0, -0.7, 0, {});
  });
}

// frosted glass panel glow: brighter at the bottom (the lamps sit in the base), soft vertical banding
const INT_ART_OFF = typeof location !== 'undefined' && /[?&]intart=0\b/.test(location.search);
// r2-art: reeded (fluted) backlit glass: 8 px rounded flutes with a bright core and darker valleys, frosted grain, lamps in the base
function frostGlow(ctx, color, k) { if (!INT_ART_OFF) { const p2 = ctx.prints.make('frost2:' + color, 256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#585858'); gr.addColorStop(0.6, '#9c9c9c'); gr.addColorStop(1, '#f4f4f4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { const fl = g.createLinearGradient(x, 0, x + 8, 0); fl.addColorStop(0, 'rgba(0,0,0,0.22)'); fl.addColorStop(0.45, 'rgba(255,255,255,0.16)'); fl.addColorStop(0.6, 'rgba(255,255,255,0.10)'); fl.addColorStop(1, 'rgba(0,0,0,0.22)'); g.fillStyle = fl; g.fillRect(x, 0, 8, h); }
    let s = 7; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(rnd() * w, rnd() * h, 1, 1); } });
    const tex2 = p2.cell.tex, M2 = ctx.M; return M2._keep('frostg2:' + color + k, () => { const m = new THREE.MeshBasicMaterial({ map: tex2, color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }); m.userData.frostRect = p2.rect; M2.glows.push({ m, base: new THREE.Color(color).multiplyScalar(k), ch: 1 }); return m; }); }
  const p = ctx.prints.make('frost:' + color, 128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.55, '#9a9a9a'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) { g.fillStyle = `rgba(255,255,255,${0.04 + 0.05 * Math.sin(x * 0.7)})`; g.fillRect(x, 0, 2, h); } });
  const tex = p.cell.tex, M = ctx.M; return M._keep('frostg:' + color + k, () => { const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }); m.userData.frostRect = p.rect; M.glows.push({ m, base: new THREE.Color(color).multiplyScalar(k), ch: 1 }); return m; }); }
// ---------------------------------------------------------------- coffered ceiling with magenta coves and downlights over a room
// Draws the recessed plane at room.ceilY (set the room's ceil to { type: 'none' }), the beam grid, coves (accent circuit),
// recessed downlights on the beams (main circuit). Returns { coffers: [{ x0, x1, z0, z1 }], drop, surfaces } (surfaces: planes for disco spots).
export function cofferedCeiling(ctx, room, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), top = room.ceilY, drop = o.drop ?? 0.36, edge = o.edge ?? 0.5, bw = o.beam ?? 0.36, cove = o.cove || pal.accent, cc = lin(cove), ck = o.coveK ?? 1.25;
  const recess = M.surf('plaster', { c: o.recessC || [52, 34, 58], rough: 0.9 }), beam = M.surf('plaster', { c: o.beamC || [30, 22, 34] }), inner = { x0: room.x0 + edge, x1: room.x1 - edge, z0: room.z0 + edge, z1: room.z1 - edge };
  const nx = Math.max(1, Math.round((inner.x1 - inner.x0) / (o.size || 2.3))), nz = Math.max(1, Math.round((inner.z1 - inner.z0) / (o.size || 2.3))), cw = (inner.x1 - inner.x0) / nx, cd = (inner.z1 - inner.z0) / nz, yb = top - drop;
  G.plane(recess, room.cx, top, room.cz, room.w, room.d, { rx: Math.PI / 2, step: 0.22 });
  // perimeter soffit (bottom + inner faces), beam grid (bottom + sides tessellated so the cove gradient bakes)
  const sof = (x0, x1, z0, z1) => { G.plane(beam, (x0 + x1) / 2, yb, (z0 + z1) / 2, x1 - x0, z1 - z0, { rx: Math.PI / 2, step: 0.3 }); ctx.solid(x0, yb, z0, x1, top, z1, { soft: true, occ: true }); };
  sof(room.x0, room.x1, room.z0, inner.z0); sof(room.x0, room.x1, inner.z1, room.z1); sof(room.x0, inner.x0, inner.z0, inner.z1); sof(inner.x1, room.x1, inner.z0, inner.z1);
  const side = (x, z, w, ry) => G.plane(beam, x, yb + drop / 2, z, w, drop, { ry, step: 0.12 });
  side(room.cx, inner.z0, inner.x1 - inner.x0, 0); side(room.cx, inner.z1, inner.x1 - inner.x0, Math.PI); side(inner.x0, room.cz, inner.z1 - inner.z0, Math.PI / 2); side(inner.x1, room.cz, inner.z1 - inner.z0, -Math.PI / 2);
  for (let i = 1; i < nx; i++) { const x = inner.x0 + i * cw; G.plane(beam, x, yb, room.cz, bw, inner.z1 - inner.z0, { rx: Math.PI / 2, step: 0.3 }); for (const s of [-1, 1]) side(x + s * bw / 2, room.cz, inner.z1 - inner.z0, s * Math.PI / 2); ctx.solid(x - bw / 2, yb, inner.z0, x + bw / 2, top, inner.z1, { soft: true, occ: true }); }
  for (let j = 1; j < nz; j++) { const z = inner.z0 + j * cd; G.plane(beam, room.cx, yb, z, inner.x1 - inner.x0, bw, { rx: Math.PI / 2, step: 0.3 }); for (const s of [-1, 1]) side(room.cx, z + s * bw / 2, inner.x1 - inner.x0, s > 0 ? 0 : Math.PI); ctx.solid(inner.x0, yb, z - bw / 2, inner.x1, top, z + bw / 2, { soft: true, occ: true }); }
  // coves: a lit strip on top of each coffer edge, lighting up into the recess (accent circuit)
  const coffers = [], cg = M.glow(cove, o.coveGlow ?? 2.0, 1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = inner.x0 + i * cw + (i ? bw / 2 : 0), x1 = inner.x0 + (i + 1) * cw - (i < nx - 1 ? bw / 2 : 0), z0 = inner.z0 + j * cd + (j ? bw / 2 : 0), z1 = inner.z0 + (j + 1) * cd - (j < nz - 1 ? bw / 2 : 0); coffers.push({ x0, x1, z0, z1 });
    const y = yb + 0.03, ins = 0.05;
    for (const [a, b, d] of [[[x0 + ins, y, z0 + ins], [x1 - ins, y, z0 + ins], [0, 0.9, 0.42]], [[x0 + ins, y, z1 - ins], [x1 - ins, y, z1 - ins], [0, 0.9, -0.42]], [[x0 + ins, y, z0 + ins], [x0 + ins, y, z1 - ins], [0.42, 0.9, 0]], [[x1 - ins, y, z0 + ins], [x1 - ins, y, z1 - ins], [-0.42, 0.9, 0]]]) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(len / 0.75)); G.box(cg, (a[0] + b[0]) / 2, y - 0.012, (a[2] + b[2]) / 2, Math.abs(b[0] - a[0]) + 0.014, 0.012, Math.abs(b[2] - a[2]) + 0.014);
      G.box(M.flat(pal.dark, { rough: 0.6 }), (a[0] + b[0]) / 2 - d[0] * 0.03, y - 0.04, (a[2] + b[2]) / 2 - d[2] * 0.03, Math.abs(b[0] - a[0]) + (d[0] ? 0.012 : 0.02), 0.06, Math.abs(b[2] - a[2]) + (d[2] ? 0.012 : 0.02));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; addLight(ctx, { p: [a[0] + (b[0] - a[0]) * t + d[0] * 0.04, y + 0.02, a[2] + (b[2] - a[2]) * t + d[2] * 0.04], c: [cc[0] * ck * len / n, cc[1] * ck * len / n, cc[2] * ck * len / n], ch: 1, type: 'area', d, soft: 0.1, wrap: 0.35, amb: 0.45, noPool: true }); }
    }
  }
  // recessed downlights: on the beams at the coffer corners and the soffit (main circuit)
  const cans = [], lamp = o.lamp || 'warm', dk = o.downK ?? 5.5, add = (x, z) => { FIXTURES.can(ctx, x, yb, z, { lamp, k: dk, cone: o.cone ?? 0.8 }); cans.push({ x, z }); };
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { if ((i === 0 || i === nx) && (j === 0 || j === nz)) continue; const x = i === 0 ? room.x0 + edge * 0.5 : i === nx ? room.x1 - edge * 0.5 : inner.x0 + i * cw, z = j === 0 ? room.z0 + edge * 0.5 : j === nz ? room.z1 - edge * 0.5 : inner.z0 + j * cd; if (o.skipCan?.(x, z)) continue; add(x, z); }
  const surfaces = coffers.map((c) => ({ x: (c.x0 + c.x1) / 2, y: top - 0.004, z: (c.z0 + c.z1) / 2, w: c.x1 - c.x0, h: c.z1 - c.z0, rx: Math.PI / 2 }));
  surfaces.push({ x: room.cx, y: yb - 0.004, z: room.cz, w: room.w, h: room.d, rx: Math.PI / 2 });
  return { coffers, drop, yb, cans, surfaces };
}

// ---------------------------------------------------------------- dark entry portal around the front door (inside), LED in the header
export function entryPortal(ctx, x, zf, w, o = {}) {
  const { G, M } = ctx, pal = o.pal || venuePalette(), V = venueMats(ctx, pal), h = o.h || 2.7, d = o.d || 0.5, t = 0.22, fin = M.flat(o.c || '#0c0b0e', { rough: 0.35, probe: 0.3 });
  for (const sx of [-1, 1]) { G.boxB(fin, x + sx * (w / 2 + t / 2), 0, zf - d / 2, t, h, d); ctx.solid(x + sx * (w / 2 + t / 2) - t / 2, 0, zf - d, x + sx * (w / 2 + t / 2) + t / 2, h, zf); G.boxB(V.brass, x + sx * (w / 2 + t / 2), 0, zf - d / 2, t + 0.01, 0.1, d + 0.01); }
  G.box(fin, x, h + 0.15, zf - d / 2, w + 2 * t, 0.3, d); ctx.solid(x - w / 2 - t, h, zf - d, x + w / 2 + t, h + 0.3, zf, { occ: true });
  FIXTURES.led(ctx, [x - w / 2, h - 0.004, zf - d + 0.06], [x + w / 2, h - 0.004, zf - d + 0.06], { color: o.led || pal.accent, k: 0.8, glow: 3, w: 0.012, d: [0, -1, 0], every: 0.8 });
}

// ---------------------------------------------------------------- speaker stack (pro-audio cabinets) and a pendant cluster
export function speakerStack(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, cab = M.flat('#121214', { rough: 0.85 }), grille = M.surf('fabric', { c: [20, 20, 22] }), h = o.h || 1.4;
  G.at(x, z, ry, () => { G.boxB(cab, 0, 0, 0, 0.62, h, 0.55); G.plane(grille, 0, h / 2, 0.276, 0.56, h - 0.08, { step: 0.4 }); for (const y of [h * 0.28, h * 0.72]) G.cyl(M.flat('#0a0a0b', { rough: 0.5 }), 0, y, 0.28, 0.2, 0.01, { rx: Math.PI / 2, seg: 20 }); ctx.solid(-0.31, 0, -0.275, 0.31, h, 0.275); ctx.shadow(0, 0, 0.7, 0.6); });
}
export function pendantCluster(ctx, x, yCeil, z, o = {}) {
  const R = ctx.R, n = o.n || 5; for (let i = 0; i < n; i++) { const a = i * 2.39, r = 0.18 + 0.12 * Math.sqrt(i); FIXTURES.pendant(ctx, x + Math.cos(a) * r, yCeil, z + Math.sin(a) * r, { drop: (o.drop || 1.1) + R.jit(0.3), shade: o.shade || 'globe', r: o.r || 0.09, lamp: o.lamp || 'amber', k: o.k ?? 1.2, c: o.c }); }
}

// ---------------------------------------------------------------- framed art / mirror on a wall (x, z on the wall, ry into the room)
export function artFrame(ctx, x, y, z, ry, w, h, o = {}) {
  const { G, M } = ctx, frame = o.frame === 'black' ? M.flat('#0d0d10', { rough: 0.4 }) : M.surf('brass', { c: o.frameC || [180, 140, 76], probe: 1 });
  G.at(x, z, ry, () => { G.box(frame, 0, 0, 0.015, w + 0.06, h + 0.06, 0.03); const art = o.page ? o.page : null; if (art) G.plane(art.mat, 0, 0, 0.032, w, h, { uvRect: art.rect }); else G.plane(M.flat('#2b2230', { metal: 0.95, rough: 0.05, probe: 1.4 }), 0, 0, 0.032, w, h); }, y);
}

// ---------------------------------------------------------------- abstract art print (drawn once per seed): color fields, arcs, a palm silhouette
export function artPrint(ctx, seed, colors, o = {}) {
  return ctx.prints.make('art:' + seed + ':' + colors.join(), 256, Math.round(256 * (o.aspect || 1.3)), (g, w, h) => { let s = seed; const r = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, colors[0]); bg.addColorStop(1, colors[1]); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = colors[2]; g.beginPath(); g.arc(w * (0.3 + r() * 0.4), h * (0.3 + r() * 0.2), w * (0.18 + r() * 0.12), 0, 7); g.fill();
    g.strokeStyle = colors[3] || '#fff'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w / 2, h * 1.1, w * (0.4 + i * 0.12), Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.moveTo(w * 0.62, h); g.quadraticCurveTo(w * 0.66, h * 0.7, w * 0.6, h * 0.45); g.lineTo(w * 0.62, h * 0.45); g.quadraticCurveTo(w * 0.69, h * 0.7, w * 0.66, h); g.fill();
    for (let k = 0; k < 7; k++) { const a = -Math.PI + k * 0.5 + r() * 0.2; g.beginPath(); g.moveTo(w * 0.61, h * 0.45); g.quadraticCurveTo(w * 0.61 + Math.cos(a) * w * 0.15, h * 0.45 + Math.sin(a) * w * 0.12 - 10, w * 0.61 + Math.cos(a) * w * 0.28, h * 0.45 + Math.sin(a) * w * 0.1 + 18); g.lineTo(w * 0.61 + Math.cos(a) * w * 0.26, h * 0.45 + Math.sin(a) * w * 0.1 + 22); g.quadraticCurveTo(w * 0.61 + Math.cos(a) * w * 0.12, h * 0.45 + Math.sin(a) * w * 0.1 - 2, w * 0.61, h * 0.46); g.fill(); }
  }, o);
}
export { BottleField, hazeCone, clamp };
