// Store type: cafe / coffee shop (OSM cafe, coffee). Built from the venue + dining art kit. Variants:
// Cuban ventanita (walk-up window to the sidewalk, cuban tile, colada counter, pastelitos), modern roaster (pale oak, white walls,
// concrete, cone pendants, plants), cozy reading cafe (brick, armchairs, bookshelves, warm globes).
// Plan: one room with the counter along the back, a small back room.
import { registerStoreType } from '../registry.js';
import { cut } from '../plan.js';
import { clamp } from '../kit/util.js';
import { neonSign } from '../kit/neon.js';
import { FIXTURES } from '../lighting.js';
import { venuePalette, venueMats, armchair, cocktailTable, stool, artFrame, artPrint, flutedWall, banquette, pottedPalm } from '../fixtures/venue.js';
import { diningTable, espressoMachine, pastryCase, menuBoard, wallShelf, hangingBulbs, plantPot, ceilingFan } from '../fixtures/dining.js';
import { mixHex } from './nightclub.js';

const VARIANTS = [
  { key: 'ventanita', names: ['La Ventanita de Mima', 'Café Colada', 'El Cafecito', 'Ventanita Azul'], floor: ['cubanTile', { c: [226, 214, 190], c2: [40, 90, 120] }], ceil: { type: 'gyp', c: [240, 236, 226] }, wall: { surf: ['paint', { c: [120, 196, 210] }], wainscot: { h: 1.1, surf: ['subway', { c: [238, 236, 228] }] }, base: '#1d3a4a' },
    pal: { accent: '#ff5a3a', warm: '#ffe0b0', wood: [120, 80, 50], marble: [[232, 228, 216], [160, 150, 130]], dark: '#1d3a4a' }, chair: 'metal', walkup: true, pend: 'schoolhouse', lamp: 'warm', icon: 'cocktail', font: 'casual', menu: 'chalk' },
  { key: 'roaster', names: ['Pale Oak Coffee', 'Grind & Tide', 'Bayline Roasters', 'Second Shot'], floor: ['concrete', { c: [168, 164, 156] }], ceil: { type: 'gyp', c: [246, 246, 242] }, wall: { surf: ['paint', { c: [240, 238, 232] }], base: '#c8b8a0' },
    pal: { accent: '#ffffff', warm: '#ffe6c0', wood: [196, 160, 120], marble: [[236, 236, 232], [180, 180, 176]], dark: '#2a2a2c', velvet: [120, 110, 96] }, chair: 'metal', pend: 'cone', lamp: 'neutral', icon: null, font: 'deco', menu: 'letter' },
  { key: 'cozy', names: ['The Reading Room', 'Bookend Café', 'Morning Ledger', 'Copper Kettle'], floor: ['wood', { c: [110, 72, 44] }], ceil: { type: 'gyp', c: [70, 52, 40] }, wall: { surf: ['brick', { c: [140, 80, 60] }], base: '#2a1a10' },
    pal: { accent: '#ffb347', warm: '#ffcf8a', wood: [80, 52, 32], velvet: [96, 46, 30], marble: [[60, 44, 32], [140, 110, 80]], dark: '#1a120c' }, chair: 'bistro', pend: 'globe', lamp: 'amber', armchairs: true, books: true, icon: null, font: 'serif', menu: 'chalk' },
];

// ?noart in the URL keeps the legacy (v1) interiors for this category (before/after captures, safety valve)
if (!/[?&]noart\b/.test(globalThis.location?.search || '')) registerStoreType({
  type: 'cafe', label: 'Cafe', kinds: ['cafe', 'coffee', 'bakery', 'pastry'], minSize: { w: 4.5, d: 5.5 }, variants: VARIANTS.length,
  depth(sf, { room, seed }) { return Math.min(room, 10 + (seed % 3)); },
  profile(base, { R }) { const v = VARIANTS[base.variant], pal = venuePalette({ ...v.pal });
    return { venueWear: true, v, pal, name: R.pick(v.names), tier: 'mid', wear: v.key === 'ventanita' ? 0.35 : 0.1, hours: [6, 20], busy: [7, 17], flip: R.chance(0.5), bounce: 0.55, lamp: v.lamp, floor: v.floor, wall: v.wall, ceil: v.ceil, daylight: 1.1,
      facade: { style: v.key === 'ventanita' ? 'tile' : v.key === 'roaster' ? 'black' : 'wood' }, spillC: [1, 0.9, 0.7], lore: { story: `Coffee since ${base.since}.` } }; },
  plan(P, ctx) {
    const p = ctx.profile, deep = P.D >= 7.5, [back, front] = deep ? cut(P.lot, 'back', clamp(P.D * 0.22, 1.8, 2.4)) : [null, P.lot];
    P.room('cafe', 'sales', front, { h: Math.min(P.H - 0.2, 3.3), floor: p.floor, wall: p.wall, ceil: p.ceil });
    if (back) { P.room('back', 'stock', back, { h: 2.7, floor: ['quarry', { c: [130, 70, 50] }], wall: { surf: ['frp', {}], base: '#2a2c30' }, ceil: { type: 'drop' } }); P.door('cafe', 'back', { kind: 'swing', w: 0.95, at: p.flip ? 0.85 : 0.15, staff: true }); P.door('back', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false }); }
    const W = P.W, dx = P.doorX, wu = p.v.walkup ? { x: clamp(dx + (dx > 0 ? -1 : 1) * (P.doorW / 2 + 1.0), -W / 2 + 0.9, W / 2 - 0.9), w: 1.2, sill: 1.05, h: 1.0, counter: ['terrazzo', { c: [220, 210, 190] }] } : null;
    P.storefront({ style: p.facade.style, door: { kind: p.v.key === 'roaster' ? 'hinged' : 'double', w: Math.min(P.doorW, 1.4), x: dx }, bulkhead: 0.5, walkup: wu, awning: p.v.key === 'ventanita' ? { c: '#1d6a8a', c2: '#f4ead2' } : p.v.key === 'cozy' ? { c: '#5a2a1a', c2: '#e8d8b8' } : null });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p } = ctx, v = p.v, pal = p.pal, S = P.get('cafe'), W = S.w, ch = S.ceilY, V = venueMats(ctx, pal); S.lit = true;
    // ---- counter across the back with the machine, the pastry case and the menu above
    const cz = S.z0 + 1.55, cl = Math.min(W - 1.4, 3.6), cx = (p.flip ? 1 : -1) * (W / 2 - cl / 2 - 0.5);
    G.at(cx, cz, 0, () => { G.boxB(v.key === 'roaster' ? V.walnut : M.surf(v.key === 'ventanita' ? 'subway' : 'woodPanel', { c: v.key === 'ventanita' ? [238, 236, 228] : pal.wood }), 0, 0, 0, cl, 1.0, 0.62); G.box(V.marble, 0, 1.02, 0, cl + 0.06, 0.04, 0.68); ctx.solid(-cl / 2, 0, -0.31, cl / 2, 1.04, 0.34);
      espressoMachine(ctx, -cl / 2 + 0.55, 1.04, -0.05, Math.PI, { accent: v.key === 'ventanita' ? '#1d6a8a' : '#2a2a2c', c: v.key === 'roaster' ? '#d8d6d0' : '#b8bcc2' }); pastryCase(ctx, cl / 2 - 0.65, 1.04, 0.0, 0, { w: 1.0 });
      G.boxB(M.flat('#1a1b1e', { rough: 0.4 }), 0, 1.04, 0.1, 0.28, 0.08, 0.22); G.box(M.glow('#9fe0ff', 0.8, 0), 0, 1.2, 0.12, 0.24, 0.16, 0.01, { rx: -0.3 });
      ctx.poi('counter', 0, -0.7, 0, {}); for (let k = 0; k < 3; k++) ctx.poi('queue', 0.3 + k * 0.1, 0.8 + k * 0.7, Math.PI, {}); });
    menuBoard(ctx, cx, 2.15, S.z0 + 0.01, 0, Math.min(cl, 2.4), 0.8, { style: v.menu, lines: v.key === 'ventanita' ? undefined : [['Coffee', ['Espresso 3.00', 'Cortado 4.25', 'Flat white 4.75', 'Pour over 5.50']], ['Bakery', ['Croissant 3.75', 'Guava roll 3.50', 'Banana bread 4.00']]] });
    G.boxB(M.surf('walnut', { c: pal.wood }), cx, 0, S.z0 + 0.3, cl, 0.9, 0.55); ctx.solid(cx - cl / 2, 0, S.z0, cx + cl / 2, 0.9, S.z0 + 0.6); wallShelf(ctx, cx, 1.55, S.z0 + 0.01, 0, Math.min(cl, 2.2), { c: pal.wood });
    hangingBulbs(ctx, [cx - cl / 2 + 0.4, cz], [cx + cl / 2 - 0.4, cz], ch, { shade: v.pend, drop: ch - 2.05, r: 0.13, lamp: v.lamp, k: 2.6, n: Math.max(2, Math.round(cl / 1.1)), c: v.key === 'roaster' ? '#f2f2ee' : '#1d1d20' });
    yield;
    // ---- seating: window bar stools facing the street, small tables, armchairs
    const fz = S.z1 - 0.55, wu = P.front?.walkup?.built; G.boxB(V.walnut, 0, 1.0, fz + 0.18, W - 1.0, 0.04, 0.32); ctx.solid(-W / 2 + 0.5, 0.95, fz + 0.02, W / 2 - 0.5, 1.04, fz + 0.34);
    for (let x = -W / 2 + 0.8; x < W / 2 - 0.6; x += 0.7) { if (Math.abs(x - P.doorX) < P.doorW / 2 + 0.35 || (wu && Math.abs(x - wu.x) < wu.w / 2 + 0.3)) continue; stool(ctx, x, fz - 0.2, 0, { pal, h: 0.74, seat: 'leather', seatC: pal.wood }); ctx.poi('sit', x, fz - 0.2, 0, { seatY: 0.74, stool: true }); }
    const tz0 = cz + 1.4, tz1 = fz - 1.2, bx0 = v.key === 'roaster' && !p.flip ? -W / 2 + 1.0 : -W / 2 + (v.key === 'roaster' ? 1.6 : 1.0), bx1 = v.key === 'roaster' && !p.flip ? W / 2 - 1.4 : W / 2 - 0.8; for (let z = tz0; z <= tz1; z += 1.5) for (let x = bx0; x < bx1; x += 1.6) { if (v.armchairs && x < -W / 2 + 1.5 && z > tz0) { cocktailTable(ctx, x, z, { pal, r: 0.28, h: 0.5, top: 'brass', lantern: false, drinks: 1 }); armchair(ctx, x + 0.75, z, -Math.PI / 2, { pal }); continue; } diningTable(ctx, x, z, 0, { pal, shape: 'round', w: 0.62, top: v.key === 'roaster' ? 'marble' : 'wood', chair: v.chair, seats: 2, setting: 'cafe', vase: R.chance(0.4) }); }
    yield;
    // ---- decor, light, plants, sign
    if (v.key === 'roaster') { flutedWall(ctx, cx - cl / 2 - 0.25, cx + cl / 2 + 0.25, 0.92, ch - 0.04, S.z0 + 0.012, { pal, c: '#a8835c', light: '#ffe2b8', k: 0.9, top: false, pitch: 0.06 });
      const sideX = p.flip ? S.x0 : S.x1, sry = p.flip ? Math.PI / 2 : -Math.PI / 2; banquette(ctx, sideX, (cz + 1.2 + fz - 0.9) / 2, sry, { pal: { ...pal, velvet: [150, 110, 76] }, l: Math.max(1.2, fz - 0.9 - cz - 1.2), back: 1.0, led: false });
      pottedPalm(ctx, p.flip ? S.x1 - 0.4 : S.x0 + 0.4, cz + 0.4, { pal, h: 1.9, light: null, pot: 'stone', potR: 0.24 }); plantPot(ctx, sideX + (p.flip ? 0.3 : -0.3), 0.02, fz - 0.4, { s: 2.4, potC: '#e8e2d4' }); }
    if (v.key === 'ventanita') { ceilingFan(ctx, 0, ch, (cz + S.z1) / 2 + 0.3, { c: [150, 100, 60], metalC: '#d8d0c0', light: false }); const mural = artPrint(ctx, 911, ['#ffb36a', '#1d6a8a', '#ff5a3a', '#fff3d8'], { aspect: 0.62 }); artFrame(ctx, S.x0 + 0.004, 1.85, (S.z0 + S.z1) / 2 + 0.5, Math.PI / 2, 2.0, 1.24, { page: mural, frame: 'black' }); for (let k = 0; k < 2; k++) wallShelf(ctx, S.x1 - 0.01, 1.45 + k * 0.5, cz + 2.2, -Math.PI / 2, 1.1, { c: [150, 100, 60] }); }
    if (v.books) for (let k = 0; k < 3; k++) wallShelf(ctx, S.x0 + 0.01, 1.2 + k * 0.42, (S.z0 + S.z1) / 2 + 0.4, Math.PI / 2, 1.6, { c: pal.wood });
    for (let z = cz + 1.6; z < S.z1 - 0.6; z += 2.0) FIXTURES.can(ctx, 0, ch, z, { lamp: v.lamp, k: 4.5, cone: 0.55 });
    plantPot(ctx, S.x1 - 0.3, 0.02, cz + 0.9, { s: 2.6 }); plantPot(ctx, S.x0 + 0.3, 0.02, S.z1 - 0.9, { s: 2.2 });
    const art = artPrint(ctx, 300 + p.variant, [mixHex(pal.accent, '#ffffff', 0.6), '#f2ece0', pal.accent === '#ffffff' ? '#c8a070' : pal.accent, '#2a2a2c'], { aspect: 1.3 }); artFrame(ctx, S.x1 - 0.004, 1.9, (S.z0 + S.z1) / 2, -Math.PI / 2, 0.7, 0.9, { page: art, frame: v.key === 'roaster' ? 'black' : 'gold' });
    if (v.icon) neonSign(ctx, -cx * 0.3, ch - 0.36, S.z0 + 0.02, 0, { lines: ['Café'], icon: v.icon, font: v.font, color: pal.accent, h: 0.45, k: 2.4, light: 0.6 });
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: ch }, at: { x: 0, y: 1.4, z: (S.z0 + S.z1) / 2 }, size: 128 };
    ctx.store.venue = { kind: 'cafe', pal, busy: p.busy };
  },
  staff() { return [{ role: 'barista', post: 'counter' }]; },
});
