// Store type: clothing boutique / streetwear / shoe store (OSM clothes, boutique, fashion, shoes, bags). Built from the interior art kit
// (fixtures/fashion.js + venue.js): wall bays with face-out garments and folded stacks, floor racks, nesting tables, mannequins in the
// window, a cash wrap with a logo wall, curtained fitting rooms, track lighting on the merchandise. Variants with their own identity:
// resort wear (whitewashed wood, rattan, coral and teal), streetwear and sneakers (concrete, black, neon, sneaker wall), luxury
// (pale stone with the reflection probe, brass rails, few pieces, chandelier).
import { registerStoreType } from '../registry.js';
import { libModel, hasModel } from '../kit/models.js';
import { cut } from '../plan.js';
import { clamp } from '../kit/util.js';
import { neonSign } from '../kit/neon.js';
import { FIXTURES } from '../lighting.js';
import { venuePalette, venueMats, hostBar, pottedPalm, artFrame, pendantCluster } from '../fixtures/venue.js';
import { garmentRack, wallBay, foldTable, mannequin, fittingRooms, sneakerWall } from '../fixtures/fashion.js';
import { plantPot } from '../fixtures/dining.js';

const VARIANTS = [
  { key: 'resort', names: ['Linen & Lime', 'Coral Coast Outfitters', 'Palmetto Supply Co.', 'Sea Grape Resort Wear'], floor: ['wood', { c: [200, 180, 156] }], ceil: { type: 'gyp', c: [246, 244, 238] }, wall: { surf: ['paint', { c: [244, 238, 228] }], base: '#c8b8a0' },
    pal: { accent: '#ff7a5a', under: '#5ad0d0', wood: [196, 170, 136], velvet: [90, 160, 160], dark: '#2a2a2a', marble: [[236, 232, 224], [200, 190, 176]] }, colors: [[240, 120, 100], [80, 180, 180], [246, 240, 228], [250, 200, 120], [120, 160, 210], [230, 160, 180]], metal: 'brass', lamp: 'warm', font: 'script', icon: 'palm', sign: false },
  { key: 'street', names: ['Kickback Supply', 'Grid Lock', 'Overtown Threads', 'Heatcheck'], floor: ['concrete', { c: [96, 94, 92] }], ceil: { type: 'open', c: [20, 20, 22] }, wall: { surf: ['paint', { c: [28, 28, 32] }], base: '#0a0a0c' },
    pal: { accent: '#39ff88', under: '#39ff88', wood: [40, 40, 44], velvet: [30, 30, 34], dark: '#0a0a0c', marble: [[30, 30, 32], [80, 80, 86]] }, colors: [[20, 20, 22], [240, 240, 236], [60, 200, 120], [230, 60, 60], [110, 110, 116], [250, 210, 60]], metal: 'black', lamp: 'coolwhite', font: 'block', icon: 'star', sign: true, sneakers: true },
  { key: 'luxe', names: ['Maison Calloway', 'Atelier Brisa', 'Vela Couture', 'Casa Orsini'], floor: ['stoneTile', { c: [214, 208, 198], c2: [170, 160, 150], probe: 0.9 }], ceil: { type: 'gyp', c: [240, 236, 228] }, wall: { surf: ['plaster', { c: [232, 224, 212] }], base: '#b89a6a' },
    pal: { accent: '#e8c890', under: '#ffe0b0', wood: [120, 90, 64], velvet: [160, 140, 120], dark: '#2a2420', marble: [[232, 228, 220], [170, 160, 150]], metal: [200, 170, 110] }, colors: [[30, 30, 34], [236, 230, 218], [140, 30, 40], [190, 170, 140], [40, 50, 80]], metal: 'brass', lamp: 'warm', font: 'serif', icon: null, sign: false, sparse: 0.45, chandelier: true },
];

// ?noart in the URL keeps the legacy (v1) interiors for this category (before/after captures, safety valve)
if (!/[?&]noart\b/.test(globalThis.location?.search || '')) registerStoreType({
  type: 'boutique', label: 'Clothing store', kinds: ['clothes', 'clothing', 'boutique', 'fashion', 'shoes', 'fashion_accessories', 'bag', 'department_store'], minSize: { w: 4.6, d: 5.5 }, variants: VARIANTS.length,
  depth(sf, { room, seed }) { return Math.min(room, /shoes/.test(sf.kind || '') ? 11 + (seed % 3) : 13 + (seed % 6)); }, // r7: real clothing floors 13-18 m, shoe stores 11-13 m
  profile(base, { R, sf }) { const v = /shoes/.test(sf?.kind || '') ? VARIANTS[1] : VARIANTS[base.variant], pal = venuePalette({ ...v.pal });
    return { venueWear: true, v, pal, name: R.pick(v.names), tier: v.key === 'luxe' ? 'luxury' : 'mid', wear: v.key === 'street' ? 0.25 : 0.06, hours: [10, 22], flip: R.chance(0.5), bounce: v.key === 'street' ? 0.35 : 0.55, lamp: v.lamp, floor: v.floor, wall: v.wall, ceil: v.ceil, daylight: 1,
      facade: { style: v.key === 'street' ? 'black' : v.key === 'luxe' ? 'bronze' : 'wood' }, spillC: [1, 0.95, 0.85], lore: { story: `Open since ${base.since}.` } }; },
  plan(P, ctx) { const p = ctx.profile, deep = P.D >= 7.5, [back, front] = deep ? cut(P.lot, 'back', clamp(P.D * 0.18, 1.6, 2.2)) : [null, P.lot];
    P.room('shop', 'sales', front, { h: Math.min(P.H - 0.25, 3.4), floor: p.floor, wall: p.wall, ceil: p.ceil });
    if (back) { P.room('stock', 'stock', back, { h: 2.7, floor: ['concrete', { c: [120, 118, 112] }], wall: { surf: ['paint', { c: [200, 198, 190] }], base: '#3a3d42' }, ceil: { type: 'drop' } }); P.door('shop', 'stock', { kind: 'hinged', w: 0.95, at: p.flip ? 0.15 : 0.85, staff: true }); P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false }); }
    P.storefront({ style: p.facade.style, door: { kind: p.v.key === 'luxe' ? 'double' : 'hinged', w: Math.min(P.doorW, 1.6), x: P.doorX }, bulkhead: 0.35, awning: p.v.key === 'resort' ? { c: '#3aa0a0', c2: '#f6efe4' } : p.v.key === 'luxe' ? { type: 'canopy' } : null }); },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p } = ctx, v = p.v, pal = p.pal, S = P.get('shop'), W = S.w, D = S.d, ch = S.ceilY, V = venueMats(ctx, pal), bs = p.flip ? 1 : -1; S.lit = true;
    const cols = v.colors, panel = v.key === 'street' ? M.flat('#1a1a1e', { rough: 0.6 }) : v.key === 'luxe' ? M.surf('plaster', { c: [240, 234, 224] }) : M.surf('walnut', { c: pal.wood });
    // ---- side walls: bays (or a sneaker wall), track light aimed at them
    for (const s of [-1, 1]) { const wx = s * W / 2, ry = s < 0 ? Math.PI / 2 : -Math.PI / 2, z0 = S.z0 + 0.4, z1 = S.z1 - 1.3, n = Math.max(1, Math.floor((z1 - z0) / 1.9));
      for (let i = 0; i < n; i++) { const bz = z0 + (i + 0.5) * (z1 - z0) / n; if (v.sneakers && s === bs) sneakerWall(ctx, wx, bz, ry, { l: (z1 - z0) / n - 0.1, led: '#eafff2' }); else wallBay(ctx, wx, bz, ry, { pal, l: (z1 - z0) / n - 0.15, colors: cols, panel, metal: v.metal, led: v.key === 'street' ? pal.accent : null, kinds: v.key === 'luxe' ? ['jacket', 'dress'] : undefined }); }
      FIXTURES.track(ctx, s * (W / 2 - 1.1), ch, (z0 + z1) / 2, { ry: 0, l: z1 - z0, heads: Array.from({ length: Math.max(2, Math.round((z1 - z0) / 1.1)) }, (_, k, a) => ({ u: -(z1 - z0) / 2 + (k + 0.5) * (z1 - z0) / Math.max(2, Math.round((z1 - z0) / 1.1)), aim: [s * 1.0, -ch + 1.5, -(z1 - z0) / 2 + (k + 0.5) * (z1 - z0) / Math.max(2, Math.round((z1 - z0) / 1.1))] })), k: 3.2, lamp: v.lamp, c: v.key === 'street' ? '#16171a' : '#e8e6e0' }); }
    yield;
    // ---- floor: racks and nesting tables down the middle, mannequins by the window
    const mx = 0, zA = S.z0 + 1.6, zB = S.z1 - 2.0; let z = zA, k = 0;
    while (z < zB) { if (k % 4 === 2 && hasModel('clothing_rack') && hasModel('mannequin_m')) { // r7: the user's rolling rail with shirts + a full mannequin on a plinth
        libModel(ctx, 'clothing_rack', mx - 0.95, z, R.chance(0.5) ? 0 : Math.PI); G.at(mx - 0.95, z, 0, () => { ctx.solid(-0.34, 0, -0.9, 0.34, 1.6, 0.9, { occ: false }); ctx.shadow(0, 0, 0.8, 2.0); });
        G.cylB(M.flat(v.key === 'street' ? '#16171a' : '#e8e4dc', { rough: 0.4 }), mx + 0.95, 0, z, 0.38, 0.12, { seg: 24 }); G.at(mx + 0.95, z, 0, () => ctx.solid(-0.38, 0, -0.38, 0.38, 0.12, 0.38, { occ: false }));
        G.at(mx + 0.95, z, 0, () => {}, 0); libModel(ctx, 'mannequin_m', mx + 0.95, z, R.range(-0.6, 0.6) + Math.PI * (R.chance(0.5) ? 0 : 1), 0.12); G.at(mx + 0.95, z, 0, () => ctx.solid(-0.25, 0.12, -0.2, 0.25, 1.95, 0.2, { occ: false })); }
      else if (k % 2 === 0) foldTable(ctx, mx + R.jit(0.2), z, R.jit(0.1), { pal, colors: cols, top: v.key === 'luxe' ? V.marble : undefined }); else { garmentRack(ctx, mx - 1.1, z, Math.PI / 2, { pal, colors: cols, round: true, r: 0.45, metal: v.metal, sparse: v.sparse }); garmentRack(ctx, mx + 1.1, z, Math.PI / 2, { pal, colors: cols, l: 1.2, metal: v.metal, sparse: v.sparse }); } z += 1.9; k++; }
    for (const s of [-1, 1]) { const mxs = clamp(P.doorX + s * (P.doorW / 2 + 0.9), -W / 2 + 0.5, W / 2 - 0.5); mannequin(ctx, mxs, S.z1 - 0.75, Math.PI + R.jit(0.3), { top: R.pick(cols), bottom: R.pick(cols), lib: s > 0 ? 'mannequin_torso' : null }); }
    yield;
    // ---- back: cash wrap with a logo wall, fitting rooms on the other side, mirror, plants, light
    const cx = bs * (W / 2 - 1.6); hostBar(ctx, cx, S.z0 + 1.0, 0, { l: 1.8, h: 1.0, pal, dj: false, glowC: v.key === 'street' ? pal.accent : '#fff2e0', k: v.key === 'street' ? 0.5 : 0.35 });
    if (v.sign) neonSign(ctx, cx, 2.2, S.z0 + 0.03, 0, { lines: [p.name], icon: v.icon, font: v.font, color: pal.accent, h: 0.55, k: 2.6, light: 0.9 });
    else { const pl = ctx.prints.make('logo:' + p.name, 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = v.key === 'luxe' ? '#9a7a40' : '#2a2a2a'; g.font = `${v.key === 'luxe' ? '400' : '600'} 64px ${v.key === 'luxe' ? '"Didot", "Bodoni 72", Georgia, serif' : '"Snell Roundhand", "Segoe Script", cursive'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v.key === 'luxe' ? p.name.toUpperCase() : p.name, w / 2, h / 2); }, { alpha: true }); G.plane(pl.mat, cx, 2.2, S.z0 + 0.03, 1.9, 0.48, { uvRect: pl.rect }); }
    fittingRooms(ctx, -bs * (W / 2 - 1.15), S.z0 + 0.01, 0, { n: W > 7 ? 2 : 1, pal, curtain: v.key === 'street' ? [30, 30, 34] : v.key === 'luxe' ? [196, 180, 160] : [90, 160, 160], wallC: v.key === 'street' ? [40, 40, 44] : [236, 230, 220] });
    artFrame(ctx, 0, 1.25, S.z0 + 0.012, 0, 0.7, 1.9, { frame: v.key === 'luxe' ? 'gold' : 'black' });
    if (v.chandelier) pendantCluster(ctx, 0, ch, (S.z0 + S.z1) / 2, { n: 7, shade: 'globe', r: 0.07, drop: 0.9, lamp: 'amber', k: 0.8, c: '#c8a060' });
    if (v.key === 'resort') { pottedPalm(ctx, S.x0 + 0.45, S.z1 - 0.5, { pal, h: 1.8, light: null, pot: 'stone', potR: 0.22 }); for (let zz = S.z0 + 1.6; zz < S.z1 - 1.0; zz += 2.2) FIXTURES.pendant(ctx, 0, ch, zz, { drop: 1.0, shade: 'drum', r: 0.3, c: [210, 190, 150], lamp: 'warm', k: 2.4 }); }
    else for (let zz = S.z0 + 1.2; zz < S.z1 - 0.6; zz += 1.8) FIXTURES.can(ctx, 0, ch, zz, { lamp: v.lamp, k: v.key === 'street' ? 3.5 : 4.5, cone: 0.6 });
    plantPot(ctx, S.x1 - 0.35, 0.02, S.z1 - 0.4, { s: 2.2 });
    if (v.key === 'luxe') ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: ch }, at: { x: 0, y: 1.4, z: (S.z0 + S.z1) / 2 }, size: 256 };
    ctx.poi('counter', cx, S.z0 + 0.4, 0, {}); ctx.store.venue = { kind: 'shop', pal, busy: [11, 20] };
  },
  staff() { return [{ role: 'clerk', post: 'counter' }]; },
});
