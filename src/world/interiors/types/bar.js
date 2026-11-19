// Store type: bar (OSM bar / pub / biergarten). Built from the venue art kit like the nightclub, each variant with its own identity:
// cocktail lounge (emerald velvet, brass, globe pendants), dive bar (wood panelling, tin ceiling, pool table, beer neons),
// sports bar (brick, open ceiling, screens, taps, high-tops), tiki bar (timber beams, palms, lanterns, warm amber).
// Shared bones: a back bar with lit shelves and bottles, a bar with stools, booths on the other wall, a neon sign, a back hall
// with a restroom and a stock room.
import { registerStoreType } from '../registry.js';
import { libModel, hasModel } from '../kit/models.js';
import { cut, rw } from '../plan.js';
import { clamp } from '../kit/util.js';
import { neonSign } from '../kit/neon.js';
import { hazeCone } from '../kit/fx.js';
import { FIXTURES } from '../lighting.js';
import { venuePalette, venueMats, barCounter, backBar, cocktailTable, stool, pottedPalm, venueSconce, artFrame, artPrint, BottleField } from '../fixtures/venue.js';
import { boothPair, beerTaps, tvScreen, ceilingFan, wallShelf, woodBeams, hangingBulbs, poolTable } from '../fixtures/dining.js';
import { exitSign } from '../fixtures/retail.js';
import { mixHex } from './nightclub.js';

const VARIANTS = [
  { key: 'lounge', names: ['The Emerald Room', 'Gilded Heron', 'Bitters & Brine', 'The Night Ledger'], icon: 'cocktail', font: 'script', floor: ['wood', { c: [92, 58, 36] }], ceil: { type: 'gyp', c: [24, 34, 30] }, wall: { surf: ['plaster', { c: [22, 44, 36] }], wainscot: { h: 1.1, surf: ['walnut', { c: [58, 36, 24] }] }, base: '#120c08' },
    pal: { accent: '#ffb347', under: '#ffcf80', velvet: [16, 64, 50], wood: [58, 36, 24], marble: [[214, 212, 206], [120, 130, 120]], dark: '#0c100e', wall: [22, 44, 36] }, pendant: 'globe', lamp: 'amber', facade: 'bronze', taps: false, tv: false },
  { key: 'dive', names: ['Low Tide Tavern', 'The Barnacle Room', 'Bilge & Bait', "Dolores' Last Call"], icon: 'star', font: 'block', floor: ['vct', { c: [150, 30, 34], c2: [24, 22, 22] }], ceil: { type: 'tin', c: [70, 60, 50] }, wall: { surf: ['brick', { c: [110, 60, 46] }], wainscot: { h: 1.2, surf: ['woodPanel', { c: [70, 44, 28] }] }, base: '#1a120c' },
    pal: { accent: '#ff3a3a', under: '#ff7a2a', velvet: [90, 24, 20], wood: [70, 44, 28], marble: [[40, 30, 24], [90, 70, 54]], dark: '#140e0a', wall: [110, 60, 46], metal: [150, 150, 150] }, pendant: 'cone', lamp: 'warm', facade: 'wood', taps: true, tv: 1, pool: true, wear: 0.6 },
  { key: 'sports', names: ['Overtime Grill', 'Fourth Quarter', 'The Penalty Spot', 'Box Score Tavern'], icon: 'star', font: 'deco', floor: ['concrete', { c: [110, 106, 100] }], ceil: { type: 'open', c: [26, 26, 28] }, wall: { surf: ['brick', { c: [130, 70, 52] }], base: '#202022' },
    pal: { accent: '#2ec4ff', under: '#2ec4ff', velvet: [30, 30, 34], wood: [80, 52, 32], marble: [[30, 30, 32], [80, 80, 86]], dark: '#141416', wall: [130, 70, 52], metal: [190, 194, 200] }, pendant: 'cage', lamp: 'neutral', facade: 'black', taps: true, tv: 4, wear: 0.3 },
  { key: 'tiki', names: ['Mai Tide', 'Lava Lagoon', 'Palm & Puffer', 'The Volcano Room'], icon: 'palm', font: 'casual', floor: ['wood', { c: [120, 82, 50] }], ceil: { type: 'gyp', c: [40, 26, 18] }, wall: { surf: ['woodPanel', { c: [96, 64, 36] }], base: '#1a0f08' },
    pal: { accent: '#ff7a2a', under: '#ff9a40', velvet: [120, 60, 30], wood: [110, 72, 40], marble: [[60, 40, 24], [120, 90, 60]], dark: '#1a0f08', wall: [96, 64, 36] }, pendant: 'globe', lamp: 'amber', facade: 'wood', beams: true, palms: true, taps: false, tv: false },
];

// ?noart in the URL keeps the legacy (v1) interiors for this category (before/after captures, safety valve)
if (!/[?&]noart\b/.test(globalThis.location?.search || '')) registerStoreType({
  type: 'bar', label: 'Bar', kinds: ['bar', 'pub', 'biergarten'], minSize: { w: 5.5, d: 6.5 }, variants: VARIANTS.length,
  depth(sf, { room, seed }) { return Math.min(room, 12 + (seed % 5)); }, // r7: real bars run 12-16 m deep
  profile(base, { R }) { const v = VARIANTS[base.variant], pal = venuePalette({ ...v.pal });
    return { venueWear: true, v, pal, name: R.pick(v.names), tier: v.key === 'lounge' ? 'luxury' : 'mid', wear: v.wear ?? 0.15, hours: [11, 2], busy: [17, 2], flip: R.chance(0.5), bounce: 0.38, lamp: v.lamp, floor: v.floor, wall: v.wall, ceil: v.ceil, facade: { style: v.facade }, spillC: [1, 0.7, 0.4],
      lore: { story: `${v.names[0]}-style neighborhood bar. Regulars since ${base.since}.` } }; },
  plan(P, ctx) {
    const p = ctx.profile, deep = P.D >= 8.5, bd = deep ? 2.1 : 0; let main = P.lot;
    if (deep) { const [back, front] = cut(P.lot, 'back', bd), side = p.flip ? 'left' : 'right', [wc, stock] = cut(back, side, clamp(rw(back) * 0.35, 1.7, 2.4)); main = front;
      P.room('stock', 'stock', stock, { h: 2.8, floor: ['concrete', { c: [110, 108, 104] }], wall: { surf: ['cmu', { c: [180, 176, 168] }], base: '#2a2c30' }, ceil: { type: 'open', c: [50, 50, 52] } });
      P.room('wc', 'restroom', wc, { h: 2.6, floor: ['ceramic', { c: [40, 40, 44] }], wall: { surf: ['paint', { c: [60, 40, 40] }], wainscot: { h: 1.2, surf: ['subway', { c: [30, 30, 34] }] } }, ceil: { type: 'gyp', c: [30, 30, 30] } }); }
    P.room('bar', 'sales', main, { h: Math.min(P.H - 0.22, 3.6), floor: p.floor, wall: p.wall, ceil: p.ceil });
    if (deep) { P.door('bar', 'stock', { kind: 'swing', w: 1.0, at: p.flip ? 0.85 : 0.15, staff: true }); P.door('bar', 'wc', { kind: 'hinged', w: 0.85 }); P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false }); }
    P.storefront({ style: p.facade.style, door: { kind: 'double', w: P.doorW, x: P.doorX }, bulkhead: 0.6, awning: p.v.key === 'tiki' ? { c: '#2a6a3a', c2: '#e8d8a8' } : p.v.key === 'dive' ? null : { type: 'canopy' }, tintGlass: p.v.key === 'dive' ? '#2a1a10' : null });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p } = ctx, v = p.v, pal = p.pal, S = P.get('bar'), W = S.w, D = S.d, bs = p.flip ? 1 : -1, ch = S.ceilY, B = new BottleField(ctx); S.lit = true; ctx.bottles = B;
    // ---- bar along the side wall
    const wx = bs * W / 2, ryW = bs < 0 ? Math.PI / 2 : -Math.PI / 2, zA = S.z0 + 0.25, zB = S.z1 - 1.7, Lb = zB - zA;
    // r7: the user's bar room set (Interior 20, relabeled with our brands): its 4.3 m back-bar wall with mirror and bottles at the
    // back end of the bar when the room is deep enough; the code-built back bar fills the rest
    let zLib = zA; if (Lb > 7.2 && ch > 2.8 && hasModel('backbar_set')) { libModel(ctx, 'backbar_set', wx - bs * 0.31, zA + 2.15, ryW); G.at(wx, zA + 2.15, ryW, () => { ctx.solid(-2.13, 0, 0, 2.13, 2.7, 0.62); ctx.shadow(0, 0.3, 4.3, 0.8); }); zLib = zA + 4.35; }
    backBar(ctx, wx, (zLib + zB) / 2, ryW, { l: zB - zLib, h: Math.min(2.9, ch - 0.15), shelves: 3, pal: { ...pal, shelf: v.key === 'sports' ? '#dff1ff' : '#ffc27a' }, bottles: B });
    const cxBar = bs * (W / 2 - 1.95), Lc = Lb - 0.95; barCounter(ctx, cxBar, zB - Lc / 2, ryW, { l: Lc, pal, bottles: B, stools: 0.64, kUnder: v.key === 'lounge' ? 0.8 : 1.4, kTop: 0.8, frontC: v.key === 'dive' || v.key === 'tiki' ? [70, 44, 28] : [30, 34, 32] });
    if (v.taps) G.at(cxBar, zB - Lc * 0.3, ryW, () => beerTaps(ctx, 0, 1.08, 0.0, 0, { n: 6 }));
    hangingBulbs(ctx, [cxBar, zB - Lc + 0.4], [cxBar, zB - 0.3], ch, { shade: v.pendant, drop: ch - 2.1, r: v.pendant === 'globe' ? 0.12 : 0.16, lamp: v.lamp, k: 2.6, n: Math.max(2, Math.round(Lc / 1.2)), c: v.key === 'lounge' ? '#b08a4a' : '#1a1a1c' });
    yield;
    // ---- booths along the other wall, high-tops in the middle
    const ox = -bs * W / 2, ryO = -ryW, nB = Math.max(1, Math.floor((S.d - 2.2) / 2.15));
    for (let i = 0; i < nB; i++) { const bz = S.z0 + 0.5 + i * 2.15 + 1.0; if (bz > S.z1 - 2) break; boothPair(ctx, ox, bz, ryO, { pal, l: 1.55, setting: 'bar', lantern: v.key !== 'sports' }); venueSconce(ctx, ox - bs * 0.004, 1.9, bz + 1.07 - 1.0, ryO, { pal, color: pal.warm, k: 1.1 }); }
    const midX = (cxBar - bs * 1.6 + ox + bs * 2.0) / 2; const pool = v.pool && W > 6.5 && D > 7.5; if (Math.abs((ox + bs * 1.9) - (cxBar - bs * 1.4)) > 1.6) for (let z = S.z0 + (pool ? 3.6 : 1.6); z < S.z1 - 2.2; z += 2.2) { cocktailTable(ctx, midX, z, { pal, r: 0.34, h: 1.05, top: v.key === 'lounge' ? 'marble' : 'brass', lantern: v.key !== 'sports', drinks: 2 }); for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; stool(ctx, midX + Math.cos(a) * 0.62, z + Math.sin(a) * 0.62, -a - Math.PI / 2, { pal, h: 0.74 }); } }
    if (pool) poolTable(ctx, midX, S.z0 + 1.7, 0, { pal, ceil: ch });
    yield;
    // ---- back wall: neon sign, art / TVs, shelf; ceiling: fans, beams, cans
    const backZ = S.z0, xc = (cxBar - bs * 0.6 + ox) / 2; neonSign(ctx, xc, Math.min(2.35, ch - 0.7), backZ + 0.04, 0, { lines: p.name.length > 16 ? p.name.split(' ').reduce((a, w) => { const l = a[a.length - 1]; if (l && (l + ' ' + w).length < 12) a[a.length - 1] = l + ' ' + w; else a.push(w); return a; }, []).slice(0, 2) : [p.name], icon: v.icon, font: v.font, color: pal.accent, h: 0.95, k: 3, light: 1.3 });
    if (v.tv) { const n = v.tv; for (let i = 0; i < n; i++) { const tz = n === 1 ? S.z0 + 1.0 : S.z0 + 1.2 + i * (S.d - 2.8) / Math.max(1, n - 1); tvScreen(ctx, ox - bs * 0.02, 2.45, tz, ryO, n === 1 ? 1.1 : 0.95, { kind: 'game' }); } }
    else { const art = artPrint(ctx, 70 + p.variant, [mixHex(pal.accent, '#000000', 0.6), '#101418', pal.accent, '#f2e6c8']); artFrame(ctx, ox - bs * 0.004, 2.0, S.z1 - 1.2, ryO, 0.7, 0.9, { page: art }); }
    if (v.beams) woodBeams(ctx, S, { c: pal.wood, every: 1.1 }); if (v.key === 'dive' || v.key === 'tiki') { ceilingFan(ctx, (xc + ox) / 2, ch, (S.z0 + S.z1) / 2, { c: pal.wood }); }
    for (let z = S.z0 + 1.2; z < S.z1 - 0.6; z += 2.2) { FIXTURES.can(ctx, (xc + ox) / 2 + bs * 0.4, ch, z, { lamp: v.lamp, k: 3.2, cone: 0.7 }); FIXTURES.can(ctx, ox + bs * 1.0, ch, z + 0.6, { lamp: v.lamp, k: 2.6, cone: 0.6 }); }
    if (v.palms) { pottedPalm(ctx, ox + bs * 0.4, S.z1 - 0.6, { pal, h: 1.8, light: '#ff9a40', k: 2 }); pottedPalm(ctx, wx - bs * 0.45, S.z0 + 0.4, { pal, h: 1.6, light: '#ffb060', k: 1.8, potR: 0.2 }); }
    wallShelf(ctx, ox - bs * 0.01, 2.45, S.z1 - 2.6, ryO, 1.2, { c: pal.wood });
    exitSign(ctx, P.doorX, 2.42, S.z1 - 0.235, Math.PI);
    hazeCone(ctx, cxBar, ch - 0.1, (zA + zB) / 2, { r1: 0.3, r2: 1.2, len: ch - 0.6, color: '#ffd8a8', k: 0.012, ch: 0 });
    B.build(); ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: ch }, at: { x: 0, y: 1.5, z: (S.z0 + S.z1) / 2 }, size: 160 };
    ctx.store.venue = { kind: 'bar', pal, busy: p.busy };
  },
  staff() { return [{ role: 'bartender', post: 'bartend' }]; },
});
