// Store type: liquor / package store (r7). Claims liquor and alcohol lots (was a banner on the convenience type) and grows them to
// a real 12-18 m. Floor-to-ceiling spirits walls down both sides with lit category headers, wine gondolas in the middle with beer
// case stacks on the end caps, a beer cave of cooler doors across the back, and a counter by the door: minis, cigarettes and the
// locked top-shelf cabinet behind the clerk (bullet-resistant glass in the rough variants). Back room, office, restroom.
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp } from '../kit/util.js';
import { family, gondola, gondolaGen, coolerBank, coolerBankGen, checkout, trashCan, floorSign, mopBucket, cctvDome, convexMirror, exitSign, floorMat } from '../fixtures/retail.js';
import { stockRack, handTruck, officeDesk, safe, dvr, restroom, lockers, wallClock, lightSwitch, breakerPanel } from '../fixtures/backroom.js';
import { tallWall, pallet, cagePartition } from '../fixtures/aisles.js';
import { shelfRun, stack } from '../items/stock.js';
import { DEPT as D } from '../items/range.js';
import { libModel } from '../kit/models.js';

const VARIANTS = [
  { key: 'package', names: ['Tarpon Liquors', 'Last Call Package', 'Corner Pocket Liquors', 'Dixie Package Store'], pal: ['#c8102e', '#ffd21f', '#ffffff'], fam: 'almond', floor: ['vct', { c: [214, 206, 186], c2: [120, 40, 40] }], ceil: { type: 'drop' }, lamp: 'coolwhite', facade: 'block', wear: 0.75, glass: true, bars: true },
  { key: 'spirits', names: ['Cayo Wine & Spirits', 'Harbor Spirits', 'Bayfront Bottle Shop', 'Coral Cellars'], pal: ['#1b2a6b', '#c9a24a', '#ffffff'], fam: 'black', floor: ['stoneTile', { c: [70, 66, 62], c2: [120, 112, 100] }], ceil: { type: 'drop' }, lamp: 'neutral', facade: 'bronze', wear: 0.25 },
  { key: 'cellar', names: ['The Vine Room', 'Old Mangrove Cellar', 'Brisa Wine Merchants'], pal: ['#4a1420', '#e8d6a8', '#c9a24a'], fam: 'wood', floor: ['wood', { c: [110, 74, 46] }], ceil: { type: 'open', c: [30, 26, 24] }, lamp: 'warm', facade: 'wood', wear: 0.1 },
  { key: 'discount', names: ['Liquor Barn', 'Booze Depot', 'Discount Spirits'], pal: ['#ff8a1f', '#16181c', '#ffffff'], fam: 'gray', floor: ['concrete', { c: [150, 148, 142] }], ceil: { type: 'open', c: [70, 72, 76] }, lamp: 'coolwhite', facade: 'aluminum', wear: 0.5 },
];
const SP = D.spirits, CAT = [['RUM', [SP[0], SP[1], SP[9], SP[11]]], ['VODKA', [SP[2], SP[3]]], ['WHISKEY', [SP[4], SP[5], SP[10]]], ['TEQUILA', [SP[6], SP[7]]], ['GIN', [SP[8], SP[2]]]];

registerStoreType({
  type: 'liquor', label: 'Liquor store', kinds: ['liquor', 'alcohol', 'wine', 'beverages'], minSize: { w: 6.5, d: 8 }, variants: VARIANTS.length,
  match(sf, { kind }) { return /liquor|alcohol|wine|beverages/.test(kind) ? 0.8 : 0; },
  depth(sf, { room, seed }) { return clamp(room, 12, 12 + (seed % 7)); },
  profile(base, { R }) { const v = VARIANTS[base.variant % VARIANTS.length];
    return { v, name: R.pick(v.names), tier: v.key === 'cellar' ? 'luxury' : v.key === 'package' ? 'budget' : 'mid', wear: clamp(v.wear + R.jit(0.12), 0, 1), accent: v.pal[0], lamp: v.lamp, hours: [9, 24], flip: R.chance(0.5), bounce: 0.45, floor: [v.floor[0], { ...v.floor[1], probe: 0.55 }], ceil: v.ceil,
      wall: { surf: ['paint', { c: v.key === 'cellar' ? [120, 84, 60] : v.key === 'spirits' ? [44, 48, 58] : [232, 226, 210] }], base: '#2a2c30', band: v.key === 'package' ? { y: 2.35, h: 0.14, c: v.pal[0] } : null }, facade: { style: v.facade }, lore: { story: `${base.owner} has sold the neighborhood its Friday nights since ${base.since}.` } }; },
  plan(P, ctx) {
    const p = ctx.profile, v = p.v, bd = clamp(P.D * 0.2, 2.6, 3.6), [back, sales] = cut(P.lot, 'back', bd), side = p.flip ? 'left' : 'right', other = p.flip ? 'right' : 'left';
    const [wc, rest] = cut(back, side, 1.75), [office, stock] = cut(rest, other, clamp(rw(rest) * 0.36, 2, 2.8));
    P.room('sales', 'sales', sales, { h: Math.min(3.1, P.H - 0.3) });
    P.room('stock', 'stock', stock, { h: 2.8, floor: ['concrete', { c: [120, 118, 112] }], wall: { surf: ['frp', {}], base: '#2a2c30' }, ceil: { type: 'open', c: [60, 60, 62] } });
    P.room('office', 'office', office, { h: 2.6, floor: ['carpet', { c: [70, 60, 56] }], wall: { surf: ['paint', { c: [214, 208, 190] }], base: '#3a3d42' }, ceil: { type: 'drop' } });
    P.room('wc', 'restroom', wc, { h: 2.6, floor: ['quarry', { c: [120, 112, 100] }], wall: { surf: ['paint', { c: [210, 214, 200] }], wainscot: { h: 1.25, surf: ['subway', { c: [226, 230, 224] }] } }, ceil: { type: 'gyp' } });
    P.door('sales', 'stock', { kind: 'swing', w: 1.3, at: p.flip ? 0.8 : 0.2, staff: true }); P.door('sales', 'wc', { kind: 'hinged', w: 0.9, staff: v.key === 'package' }); P.door('stock', 'office', { kind: 'hinged', w: 0.9, staff: true }); P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false });
    P.storefront({ style: p.facade.style, door: { kind: v.key === 'discount' ? 'auto' : 'double', w: P.doorW, x: P.doorX }, bulkhead: v.key === 'package' ? 0.9 : 0.5, awning: v.key === 'cellar' ? { c: v.pal[0], c2: '#e8d6a8' } : null, bars: !!v.bars });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx, v = p.v, S = P.get('sales'), F = family(ctx, v.fam), ch = S.ceilY, fl = p.flip ? -1 : 1, doorX = P.doorX;
    ctx.store.venue = { kind: 'shop', busy: [16, 24], guests: 3 };
    const header = (t) => prints.make(`lhdr:${t}:${v.pal[0]}`, 420, 80, (g, w, h) => { g.fillStyle = v.key === 'cellar' ? '#2a1a10' : v.pal[0]; g.fillRect(0, 0, w, h); g.fillStyle = v.key === 'cellar' ? '#e8d6a8' : '#ffffff'; g.font = (v.key === 'cellar' ? '700 50px Georgia, serif' : '900 52px Arial Black, Arial'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h / 2 + 3, w - 20); }, { global: true, lit: 1.1, ch: 1 });
    // ---- counter on the side away from the door, close to the front; back bar behind the clerk
    const cs = doorX > 0 ? -1 : 1, cl = clamp(S.w * 0.36, 2.2, 3.2), cx = cs * (S.w / 2 - 1.35), cz = S.z1 - 1.2 - cl / 2, cry = -cs * Math.PI / 2;
    const co = checkout(ctx, cx, cz, cry, { l: cl, top: ['laminate', { c: [40, 40, 44] }], front: ['laminate', { c: v.key === 'cellar' ? [90, 60, 36] : [70, 72, 78] }], glass: !!v.glass, impulse: D.minis.slice(0, 6), registerSide: cs, lotto: v.key === 'package' ? ['scratch-flamingo', 'scratch-gator', 'scratch-hurricane'] : null });
    ctx.store.counterLocal = { x: cx, z: cz }; ctx.poi('counter', co.clerk.x, co.clerk.z, co.clerk.ry, {});
    G.at(cs * S.w / 2, cz, cry, () => { // back bar: minis on stepped shelves, cigarettes above, locked top-shelf cabinet
      G.boxB(F.dark, 0, 0, 0.22, cl - 0.1, 0.9, 0.44); G.box(M.flat('#2a2c30', {}), 0, 0.915, 0.23, cl - 0.06, 0.03, 0.48); ctx.solid(-cl / 2, 0, 0, cl / 2, 0.93, 0.46, { occ: false });
      for (let k = 0; k < 3; k++) { G.box(F.shelf, 0, 1.05 + k * 0.14, 0.12 + k * 0.0, cl - 0.24, 0.01, 0.18); shelfRun(ctx, -cl / 2 + 0.14, cl / 2 - 0.14, 1.055 + k * 0.14, 0.21, 0.16, D.minis.slice(k * 2).concat(D.minis), { block: 0.14, rows: 2, zone: 'backbar', tags: k === 0 }); }
      G.boxB(F.dark, 0, 1.5, 0.12, cl - 0.2, 0.5, 0.24); for (let k = 0; k < 2; k++) { G.box(F.shelf, 0, 1.55 + k * 0.2, 0.17, cl - 0.24, 0.01, 0.18, { rx: 0.2 }); shelfRun(ctx, -cl / 2 + 0.14, cl / 2 - 0.14, 1.555 + k * 0.2, 0.26, 0.16, k ? ['caiman-blue', 'caiman-red'] : ['caiman-red', 'caiman-blue'], { block: 0.34, rows: 3, zone: 'backbar', tags: false }); }
      const cab = M.surf('walnut', { c: [70, 44, 28] }); G.boxB(cab, 0, 2.05, 0.18, cl - 0.2, Math.min(0.75, ch - 2.15), 0.36); G.box(M.glass({ opacity: 0.2, tint: '#e8f0f0' }), 0, 2.05 + Math.min(0.75, ch - 2.15) / 2, 0.365, cl - 0.3, Math.min(0.75, ch - 2.15) - 0.06, 0.01);
      shelfRun(ctx, -cl / 2 + 0.2, cl / 2 - 0.2, 2.1, 0.34, 0.3, [SP[11], SP[4], SP[7], SP[10]], { block: 0.2, rows: 1, zone: 'locked', tags: false, fill: 1 });
      ctx.light.led(ctx, [-cl / 2 + 0.15, Math.min(2.78, ch - 0.12), 0.3], [cl / 2 - 0.15, Math.min(2.78, ch - 0.12), 0.3], { color: '#ffe2b0', k: 0.6, every: 0.9, d: [0, -1, 0] });
      dvr(ctx, cs * (cl / 2 - 0.5), 0.95, 0.06, 0); lightSwitch(ctx, -cs * (cl / 2 - 0.02), 1.25, 0.005, 0);
      for (const [k, u] of [['wecard', -0.6], ['camera', 0.6]]) { const n = prints.notice(k); G.plane(n.mat, u, 2.0, 0.006, 0.26, 0.2, { uvRect: n.rect, rz: R.jit(0.03) }); } });
    void cagePartition;
    yield;
    // ---- beer cave: cooler doors across the back wall
    for (const sp of P.spans(S, 'back', 1.6)) { const n = Math.min(8, Math.floor((sp.len - 0.2) / 0.76)); if (n < 2) continue; const mid = (sp.a + sp.b) / 2, at = P.onFace(sp.face, mid, 0);
      yield* coolerBankGen(ctx, at.x, at.z, at.ry, { doors: n, plans: [[['lobo-12', 'cayo-12'], ['lobo-lager'], ['cayo-light', 'cayo-tall'], D.beer, ['lobo-lager', 'malta-faro']], [['cayo-12'], ['cayo-tall'], D.beer, ['cayo-light'], D.wine.slice(2, 4)], [['lobo-12'], D.wine.slice(2), D.wine.slice(4), ['aguamar', 'zumbo-cola-20'], ['tiki-orange-20', 'limonazo-20']]], header: prints.make('lcool', 600, 90, (g, w, h) => { g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = '#35c6f4'; g.font = '900 56px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ICE COLD BEER · WINE', w / 2, h / 2 + 3, w - 30); }, { lit: 1.3, ch: 1 }), headerC: '#9fd8ff' });
      P.take(sp.face, mid - n * 0.38 - 0.1, mid + n * 0.38 + 0.1); }
    yield;
    // ---- spirits walls down both sides (category runs with lit headers); the counter side stops short of the counter
    let ci = R.int(0, CAT.length - 1);
    for (const side of ['left', 'right']) for (const sp of P.spans(S, side, 1.3)) { const counterSide = (side === 'right') === (cs > 0), a = Math.max(sp.a, S.z0 + 0.9), b = Math.min(sp.b, counterSide ? cz - cl / 2 - 0.6 : S.z1 - 0.9); if (b - a < 1.3) continue;
      const runs = Math.max(1, Math.round((b - a) / 2.4)), rl = (b - a) / runs;
      for (let r = 0; r < runs; r++) { const [name, pids] = CAT[ci++ % CAT.length], at = P.onFace(sp.face, a + (r + 0.5) * rl, 0), lv = 6;
        tallWall(ctx, at.x, at.z, at.ry, { l: rl - 0.06, h: Math.min(2.35, ch - 0.45), levels: lv, d: 0.3, rows: 2, block: 0.24, plan: Array.from({ length: lv }, (_, k) => (k === 0 ? pids.slice().reverse() : k === lv - 1 ? D.minis.slice(0, 2).concat(pids) : pids)), header: header(name), led: v.key === 'package' ? null : '#fff1d8' }); }
      yield; }
    // ---- wine gondolas in the middle, beer case stacks at the ends
    const gx0 = S.x0 + 0.4 + 1.5, gx1 = S.x1 - 0.4 - 1.5, gz0 = S.z0 + 0.84 + 1.7, gz1 = Math.min(S.z1 - 2.6, cz - cl / 2 - 0.3), gl = gz1 - gz0, ng = gl > 1.6 ? clamp(Math.floor((gx1 - gx0 + 1.2) / 2.1), 1, 4) : 0;
    for (let i = 0; i < ng; i++) { const gx = ng === 1 ? (gx0 + gx1) / 2 : gx0 + i * (gx1 - gx0) / (ng - 1); if (Math.abs(gx - cx) < 1.5 && gz1 > cz - cl / 2 - 0.4) continue;
      const W = D.wine.concat(['mp-wine']), sg = prints.promo(R.pick(['WINE SALE', 'STAFF PICK', 'NEW']), R.pick(['2 FOR $20', '$9.99', '15% OFF 6']), R.pick(['Marisol reds', 'Brisa whites', 'Any 750 ml wine']), { bg: '#f6efe0', band: v.pal[0] });
      yield* gondolaGen(ctx, gx, (gz0 + gz1) / 2, Math.PI / 2, { l: gl, h: 1.65, levels: 4, d: 0.36, rows: 2, block: 0.2, sides: [[W.slice(0, 2), W.slice(2, 4), W.slice(4), W], [W.slice(3), W.slice(0, 3), SP.slice(0, 4), SP.slice(4, 8)]], ends: [{ pegs: ['chispa-lighter', 'nutty-peanuts', 'gatorbite-original'], sign: sg }, [D.beer, ['lobo-lager'], SP.slice(8), D.minis]] });
      stack(ctx, R.pick(['lobo-12', 'cayo-12']), gx, ctx.FLOOR_Y, gz1 + 0.75, 2, 1, R.int(3, 5)); ctx.G.at(gx, gz1 + 0.75, 0, () => ctx.solid(-0.42, 0, -0.15, 0.42, 0.65, 0.15, { occ: false })); yield; }
    // r7: oak barrels (the user's Barrel 2) by the window in the cellar variant, wine on the heads
    if (v.key === 'cellar' || R.chance(0.3)) for (const s of [-1, 1]) { const bx = -cs * (S.w / 2 - 0.65) + s * 0.0, bz = S.z1 - 1.3 - (s > 0 ? 0.85 : 0); if (Math.abs(bx - doorX) < 1.6) continue; if (libModel(ctx, 'barrel', bx, bz, R() * 6)) { ctx.G.at(bx, bz, 0, () => { ctx.solid(-0.36, 0, -0.36, 0.36, 0.95, 0.36, { occ: false }); ctx.shadow(0, 0, 0.8, 0.8); }); for (let k = 0; k < 3; k++) ctx.item(D.wine[(k + (s > 0 ? 2 : 0)) % D.wine.length], bx - 0.12 + k * 0.12, ctx.FLOOR_Y + 0.948, bz + R.jit(0.05), R.jit(0.5), { zone: 'barrel' }); } }
    // ---- front: floor display of spirits, trash, mats, cameras, mirror, neon in the window
    floorMat(ctx, doorX, S.z1 - 1.0, 1.6, 0.9, [40, 36, 32]); trashCan(ctx, doorX - cs * 1.4, S.z1 - 0.4); if (p.wear > 0.4) floorSign(ctx, R.range(-1, 1), S.cz + R.range(-1, 1), R() * 3);
    cctvDome(ctx, cx - cs * 0.4, ch, cz); cctvDome(ctx, 0, ch, S.z0 + 1.4); cctvDome(ctx, doorX, ch, S.z1 - 0.7); convexMirror(ctx, -cs * (S.w / 2 - 0.25), ch - 0.4, S.z0 + 0.95, cs * Math.PI / 4); exitSign(ctx, doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI);
    const zg = S.z1 - 0.075, gl2 = ctx.front.glazed; if (gl2.length) { for (const [i, txt, col] of [[0, 'LIQUOR', '#ff3b5c'], [gl2.length - 1, v.key === 'cellar' ? 'WINE' : 'COLD BEER', '#35c6f4']]) { const b = gl2[i]; if (!b) continue; const op = prints.neon(txt, { color: col }); for (const s of [1, -1]) G.plane(op.mat, b.x, 1.9, zg + s * 0.002, Math.min(0.9, b.w - 0.1), 0.3, { ry: s > 0 ? 0 : Math.PI, uvRect: op.rect }); ctx.light.glowPanel(ctx, b.x, 1.9, zg - 0.02, { w: 0.6, h: 0.3, color: col, k: 2.6, ry: Math.PI }); if (gl2.length < 2) break; } }
    const sg = prints.storeSign({ style: v.key === 'package' ? 'box' : v.key === 'cellar' ? 'painted' : 'box', sub: v.key === 'cellar' ? 'FINE WINE · SPIRITS' : 'BEER · WINE · LIQUOR', font: v.key === 'cellar' ? 'serif' : 'impact' }), sw = Math.min(P.W - 1, 6.2), sy = ctx.front.gh + ctx.front.fascia / 2; G.box(M.flat(v.pal[0], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1); G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    const hrs = prints.hours(); G.plane(hrs.mat, doorX + P.doorW / 4, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    if (v.key === 'cellar') ctx.gridRig(S, { type: 'can', lamp: 'warm', k: 6, sx: 1.6, sz: 1.8, margin: 0.8 }); else ctx.gridRig(S, v.ceil.type === 'open' ? { type: 'strip', lamp: p.lamp, k: 6.5, hang: 0.5, sx: 2.2, sz: 2.6, l: 2.4 } : { type: 'troffer', lamp: p.lamp, k: 8.5, sx: 2.6, sz: 2.6 });
    yield;
    // ---- back of house
    const K = P.get('stock'), O = P.get('office'), WC = P.get('wc');
    for (const sp of P.spans(K, 'back', 1.4)) { const n = Math.floor(sp.len / 1.6); for (let i = 0; i < n; i++) { const at = P.onFace(sp.face, sp.a + (i + 0.5) * sp.len / n, 0); stockRack(ctx, at.x, at.z, at.ry, { l: 1.45 }); } }
    if (K.w > 2.6 && K.d > 2.4) pallet(ctx, K.cx, K.z1 - 0.8, R.jit(0.2), { layers: 0, pid: 'cayo-12', wrap: false }); handTruck(ctx, K.x0 + 0.5, K.z1 - 0.5, R() * 3); mopBucket(ctx, K.x1 - 0.45, K.z1 - 0.45, R() * 3); lockers(ctx, K.x1 - 0.55, K.z0 + 0.02, 0, 2); breakerPanel(ctx, K.x0 + 0.02, 1.5, K.cz, Math.PI / 2); wallClock(ctx, K.cx, 2.3, K.z0 + 0.005, 0);
    { const sp = P.spans(O, 'back', 1.2)[0] || P.spans(O, null, 1.2)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); officeDesk(ctx, at.x, at.z, at.ry, { w: Math.min(1.3, sp.len - 0.1) }); } safe(ctx, O.x1 - 0.4, O.z1 - 0.4, Math.PI); }
    { const sp = P.spans(WC, 'back', 1)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) }); } }
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: S.ceilY }, at: { x: 0, y: 1.5, z: S.cz }, size: 256 };
    void fl;
  },
  staff() { return [{ role: 'clerk', post: 'post', routine: ['ring', 'card-check', 'restock-cooler'] }]; },
  behaviors: { customers: ['browse', 'cooler', 'queue', 'pay', 'leave'] },
});
