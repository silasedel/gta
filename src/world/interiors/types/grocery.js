// Store type: neighborhood grocery / supermarket (r7). Claims supermarket and grocery lots, and the deepest convenience lots (half
// of them by seed), growing back into the host building to a real 18-32 m. Layout like a real store: entrance and produce up front,
// checkout lanes on the other side of the front, long numbered aisles front to back (split by a cross aisle when deep), dairy and
// meat coolers across the back wall, freezer doors down one side, pantry wall shelving down the other, back room with pallets,
// racks, office and two restrooms. Variants: bright chain market, Latin mercado, discount box (open deck, pallets on the floor),
// organic market (wood, warm light).
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp, hashStr } from '../kit/util.js';
import { family, wallShelf, coolerBank, trashCan, floorSign, mopBucket, cctvDome, convexMirror, exitSign, floorMat, atm } from '../fixtures/retail.js';
import { stockRack, handTruck, officeDesk, safe, dvr, restroom, lockers, wallClock, breakerPanel } from '../fixtures/backroom.js';
import { aisleBlock, checkoutLane, produceTable, magRack, chestFreezer, cartCorral, basketStack, pallet, lightRows } from '../fixtures/aisles.js';
import { DEPT as D } from '../items/range.js';

const VARIANTS = [
  { key: 'chain', names: ['FreshWay Market', 'Bayside Foods', 'Harbor Market', 'Sunrise Grocers'], pal: ['#1f7a3d', '#ffffff', '#f2b01e'], fam: 'white', floor: ['vct', { c: [228, 228, 222], c2: [150, 160, 150] }], ceil: { type: 'drop' }, lamp: 'coolwhite', facade: 'aluminum', wear: 0.2, sign: '#1f7a3d', aisleC: '#1f7a3d' },
  { key: 'mercado', names: ['Mercado La Fe', 'Supermercado El Bohío', 'Mercado Caribe', 'La Bodeguita Market'], pal: ['#d81e2c', '#ffd21f', '#1f7a3d'], fam: 'almond', floor: ['ceramic', { c: [214, 200, 170] }], ceil: { type: 'drop' }, lamp: 'neutral', facade: 'tile', wear: 0.55, sign: '#d81e2c', aisleC: '#d81e2c', painted: true },
  { key: 'discount', names: ['Save-A-Lot Plus', 'Penny Pantry', 'Value Basket', 'Budget Box Foods'], pal: ['#1554c0', '#ffd21f', '#e23b3b'], fam: 'gray', floor: ['concrete', { c: [160, 158, 152] }], ceil: { type: 'open', c: [70, 72, 76] }, lamp: 'coolwhite', facade: 'block', wear: 0.6, sign: '#1554c0', aisleC: '#1554c0', pallets: true },
  { key: 'organic', names: ['Green Coast Market', 'Mango Tree Organics', 'Wild Palm Grocer', 'Coastal Harvest'], pal: ['#3f6b3a', '#f1e9d6', '#c9772b'], fam: 'wood', floor: ['wood', { c: [150, 112, 76] }], ceil: { type: 'open', c: [36, 36, 38] }, lamp: 'warm', facade: 'black', wear: 0.1, sign: '#3f6b3a', aisleC: '#3f6b3a', wain: ['woodPanel', { c: [150, 108, 70] }] },
];
const SODA2L = ['zumbo-cola-2l'], CHIPS = ['crunchero-classic', 'crunchero-limon', 'crunchero-bbq', 'quesitos', 'donpepe-mariquitas'];
// aisle themes: [name list for the sign, levels bottom -> top]
const AISLES = [
  [['Cereal', 'Breakfast', 'Coffee'], [D.baking.slice(3), D.cereal.slice(0, 4), D.cereal.slice(4), D.cookies.slice(0, 3), D.cereal]],
  [['Pasta', 'Rice', 'Sauces'], [D.pasta.slice(4), D.sauce.slice(6), D.pasta.slice(0, 4), D.sauce.slice(0, 6), D.pasta]],
  [['Canned', 'Soup', 'Beans'], [D.canned.slice(0, 4), D.canned.slice(4), D.canned, ['abuela-beans', 'abuela-soup', 'sopa-ya-chicken', 'sopa-ya-shrimp'], D.canned.slice(2, 6)]],
  [['Snacks', 'Soda', 'Cookies'], [SODA2L, CHIPS.slice(0, 3), CHIPS.slice(2), D.cookies, ['dona-pastelito', 'dona-cake', 'nutty-peanuts', 'gummi-gator']]],
  [['Cleaning', 'Laundry', 'Paper'], [D.household.slice(0, 3), D.household.slice(3), D.paper.slice(1), D.paper.slice(0, 1), D.household.slice(3)]],
  [['Health', 'Beauty', 'Pharmacy'], [D.beauty.slice(1), D.health.slice(0, 3), D.health.slice(3), D.beauty, D.health]],
  [['Pet Food', 'Baking', 'Oil'], [D.pet, D.baking.slice(0, 3), D.sauce.slice(6), D.baking, D.cookies.slice(3)]],
];
const pickV = (sf, base) => (/mercado|latin/.test(sf?.name || '') ? 1 : base.variant);

registerStoreType({
  type: 'grocery', label: 'Grocery store', kinds: ['supermarket', 'grocery', 'greengrocer'], minSize: { w: 8.5, d: 15 }, variants: VARIANTS.length,
  match(sf, { kind, W, D: Dp }) { if (/supermarket|grocery|greengrocer/.test(kind)) return 0.9; if (kind === 'convenience' && W >= 8.5 && Dp >= 17 && (hashStr('groc' + (sf.id ?? sf.x)) % 100) < 50) return 0.6; return 0; },
  depth(sf, { room }) { return clamp(room, 18, 32); },
  profile(base, { R, sf }) { const v = VARIANTS[pickV(sf, base) % VARIANTS.length];
    return { v, name: R.pick(v.names), tier: v.key === 'organic' ? 'luxury' : v.key === 'discount' ? 'budget' : 'mid', wear: clamp(v.wear + R.jit(0.1), 0, 1), accent: v.pal[0], secondary: v.pal[2], lamp: v.lamp, hours: v.key === 'chain' ? [6, 24] : [7, 22], flip: R.chance(0.5), bounce: 0.5, stock: R.range(0.8, 0.97),
      floor: [v.floor[0], { ...v.floor[1], probe: v.floor[0] === 'concrete' ? 0.3 : 0.55 }], ceil: v.ceil, wall: { surf: ['paint', { c: v.key === 'organic' ? [226, 220, 206] : [236, 234, 226] }], wainscot: v.wain ? { h: 1.1, surf: v.wain } : null, base: '#3a3d42', band: { y: 2.6, h: 0.18, c: v.sign } },
      facade: { style: v.facade }, lore: { story: `${base.owner} took over the market in ${base.since}; the Saturday line still goes past the produce.` } }; },
  prewarm(p) { return [['pegboard', { c: [236, 236, 232] }], ['rubber', { c: [22, 22, 24] }], ['wood', { c: [120, 84, 52], wear: 0.4 }]]; },
  plan(P, ctx) {
    const p = ctx.profile, bd = clamp(P.D * 0.13, 3.4, 4.6), [back, sales] = cut(P.lot, 'back', bd), side = p.flip ? 'left' : 'right', other = p.flip ? 'right' : 'left';
    const [wcs, rest] = cut(back, side, 3.4), [wcA, wcB] = cut(wcs, side, 1.7), [office, stock] = cut(rest, other, clamp(rw(rest) * 0.3, 2.4, 3.2));
    P.room('sales', 'sales', sales, { h: Math.min(P.H - 0.25, p.v.ceil.type === 'open' ? 4.0 : 3.2) });
    P.room('stock', 'stock', stock, { h: Math.min(P.H - 0.25, 3.6), floor: ['concrete', { c: [118, 116, 110] }], wall: { surf: ['cmu', { c: [200, 198, 190] }], base: '#2a2c30' }, ceil: { type: 'open', c: [60, 60, 62] } });
    P.room('office', 'office', office, { h: 2.6, floor: ['carpet', { c: [70, 74, 86] }], wall: { surf: ['paint', { c: [214, 208, 190] }], base: '#3a3d42' }, ceil: { type: 'drop' } });
    for (const [id, r, c] of [['wcA', wcA, [210, 214, 222]], ['wcB', wcB, [222, 210, 214]]]) P.room(id, 'restroom', r, { h: 2.6, floor: ['quarry', { c: [120, 112, 100] }], wall: { surf: ['paint', { c }], wainscot: { h: 1.25, surf: ['subway', { c: [226, 230, 224] }] } }, ceil: { type: 'gyp' } });
    P.door('sales', 'stock', { kind: 'swing', w: 1.6, at: p.flip ? 0.75 : 0.25, staff: true }); P.door('sales', 'wcA', { kind: 'hinged', w: 0.9 }); P.door('sales', 'wcB', { kind: 'hinged', w: 0.9 }); P.door('stock', 'office', { kind: 'hinged', w: 0.9, vision: 'slot', staff: true }); P.door('stock', 'outside:back', { kind: 'hinged', w: 1.0, at: 0.5, locked: true, sign: false });
    P.storefront({ style: p.facade.style, door: { kind: 'auto', w: P.doorW, x: P.doorX }, bulkhead: 0.45, awning: p.v.painted ? { c: p.v.pal[0], c2: '#f6efe0' } : null, bars: p.wear > 0.75 });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx, v = p.v, S = P.get('sales'), F = family(ctx, v.fam), y0 = ctx.FLOOR_Y, ch = S.ceilY, fl = p.flip ? -1 : 1;
    ctx.store.venue = { kind: 'grocery', busy: [9, 20] };
    const bigSign = (txt, x, y, z, ry, w = 2.4) => { const s = prints.make(`dept:${txt}:${v.sign}`, 480, 110, (g, W, H) => { g.fillStyle = v.sign; g.fillRect(0, 0, W, H); g.fillStyle = '#ffffff'; g.font = '900 72px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W / 2, H / 2 + 4, W - 24); }, { global: true }); G.plane(s.mat, x, y, z, w, w * 110 / 480, { ry, uvRect: s.rect }); };
    // ---- zones
    const front = 5.2, za = S.z0 + 0.84 + 2.1, zb = S.z1 - front, xl = S.x0 + 0.84 + 1.75, xr = S.x1 - 0.47 - 1.55; // aisle field
    // ---- back wall: dairy and meat coolers (several banks), department signs above
    for (const sp of P.spans(S, 'back', 1.6)) { const n = Math.min(8, Math.floor((sp.len - 0.2) / 0.76)); if (n < 2) continue; const mid = (sp.a + sp.b) / 2, at = P.onFace(sp.face, mid, 0), dairy = R.chance(0.6);
      const plans = dairy ? [[['vaca-milk'], ['bayleaf-gallon'], D.dairy.slice(0, 4), D.dairy.slice(4, 7), ['eggs']], [['vaca-milk', 'vaca-choc'], D.dairy.slice(4, 7), D.dairy.slice(0, 2), D.dairy.slice(2, 4), ['eggs', 'egg-sandwich']]] : [[['lobo-12', 'cayo-12'], ['cayo-light', 'lobo-lager'], ['cayo-tall'], ['malta-faro', 'cayo-tall'], ['lobo-lager']], [['zumbo-cola-2l'], ['zumbo-cola', 'zumbo-cherry'], ['tiki-orange', 'limonazo'], ['aguamar', 'bayleaf-tea'], ['voltra', 'voltra-mango']]];
      coolerBank(ctx, at.x, at.z, at.ry, { doors: n, plans, header: prints.make('ghdr' + (dairy ? 'd' : 'b'), 600, 90, (g, w, h) => { g.fillStyle = v.sign; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 56px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(dairy ? 'DAIRY · EGGS · JUICE' : 'BEER · SODA · WATER', w / 2, h / 2 + 3, w - 30); }, { lit: 1.2, ch: 1 }), headerC: '#dff2ff' });
      P.take(sp.face, mid - n * 0.38 - 0.1, mid + n * 0.38 + 0.1); yield; }
    // ---- freezer side (left wall from the aisle field to the front zone): freezer doors with frozen boxes
    const fside = fl > 0 ? 'left' : 'right', sside = fl > 0 ? 'right' : 'left';
    for (const sp of P.spans(S, fside, 2)) { const a = Math.max(sp.a, S.z0 + 0.9), b = Math.min(sp.b, zb - 0.4); if (b - a < 2) continue; const n = Math.min(10, Math.floor((b - a - 0.2) / 0.76)), mid = (a + b) / 2, at = P.onFace(sp.face, mid, 0);
      coolerBank(ctx, at.x, at.z, at.ry, { doors: n, plans: [[D.frozen.slice(0, 2), D.frozen.slice(0, 2), D.frozen.slice(2, 3), D.frozen.slice(3, 5), D.frozen.slice(5)], [D.frozen.slice(3, 5), D.frozen.slice(3, 5), D.frozen.slice(2), D.frozen.slice(0, 2), ['polar-ice']]], led: '#e8f6ff', header: prints.make('ghdrf', 600, 90, (g, w, h) => { g.fillStyle = '#1554c0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 56px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FROZEN FOODS', w / 2, h / 2 + 3, w - 30); }, { lit: 1.2, ch: 1 }), headerC: '#cfe6ff' });
      P.take(sp.face, mid - n * 0.38 - 0.1, mid + n * 0.38 + 0.1); yield; }
    // ---- pantry wall on the other side, produce wall toward the front of it
    for (const sp of P.spans(S, sside, 1.6)) { const a = Math.max(sp.a, S.z0 + 0.9), b = Math.min(sp.b, S.z1 - 0.6); if (b - a < 1.6) continue; const split = Math.max(a, b - Math.min(6, (b - a) * 0.4));
      if (split - a > 1.5) { const at = P.onFace(sp.face, (a + split) / 2, 0); wallShelf(ctx, at.x, at.z, at.ry, { l: split - a - 0.1, h: 2.1, levels: 5, plan: [D.pet, D.household.slice(0, 3), D.paper, D.household.slice(3), D.paper.slice(0, 1)] }); bigSign('HOUSEHOLD', at.x + sp.face.nx * 0.02, 2.75, at.z + sp.face.nz * 0.02, at.ry, 2.2); yield; }
      if (b - split > 1.5) { const at = P.onFace(sp.face, (split + b) / 2, 0), l = b - split - 0.1; G.at(at.x, at.z, at.ry, () => { // produce wall: misted angled bins under a lit canopy
          const wood = M.surf('wood', { c: [120, 84, 52], wear: 0.4 }); G.boxB(wood, 0, 0, 0.45, l, 0.7, 0.9); G.boxB(M.flat('#1a1b1e', {}), 0, 0, 0.45, l - 0.1, 0.1, 0.86); G.boxB(M.surf('fabric', { c: [40, 110, 50] }), 0, 1.75, 0.2, l, 0.3, 0.4); ctx.light.led(ctx, [-l / 2 + 0.1, 1.73, 0.4], [l / 2 - 0.1, 1.73, 0.4], { color: '#fff1d6', k: 1.4, every: 0.8, d: [0, -0.8, 0.6] });
          const pids = D.produce; let k = 0; for (let u = -l / 2 + 0.3; u < l / 2 - 0.25; u += 0.5, k++) { const pid = pids[k % pids.length]; G.box(wood, u + 0.24, 0.8, 0.45, 0.02, 0.18, 0.88); for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { if (R.chance(0.1)) continue; ctx.item(pid, u - 0.18 + c * 0.09 + (r % 2) * 0.03, 0.72 + r * 0.1, 0.82 - r * 0.18, R() * 6.3, { zone: 'produce', row: r, rx: R.jit(0.4) }); } const t = prints.tag(pid); G.plane(t.mat, u, 0.62, 0.905, 0.1, 0.065, { uvRect: t.rect }); }
          ctx.solid(-l / 2, 0, 0, l / 2, 1.0, 0.92, { occ: false }); ctx.shadow(0, 0.45, l + 0.2, 1.1); ctx.poi('browse', 0, 1.5, Math.PI, { zone: 'produce' }); });
        bigSign('PRODUCE', at.x + sp.face.nx * 0.02, 2.75, at.z + sp.face.nz * 0.02, at.ry, 2.2); yield; } }
    // ---- aisles: gondolas front to back, cross aisle when deep
    const nG = Math.max(1, Math.floor((xr - xl + 1.4) / 2.3)), xs = []; for (let i = 0; i < nG; i++) xs.push(nG === 1 ? (xl + xr) / 2 : xl + i * (xr - xl) / (nG - 1));
    const L = zb - za, blocks = L > 13 ? [[za, za + (L - 2.2) / 2], [za + (L + 2.2) / 2, zb]] : [[za, zb]], themes = R.shuffle(AISLES.slice()), signs = []; for (let k = 0; k <= nG; k++) signs.push(themes[k % themes.length][0]);
    let ai = 0; for (const [z0, z1] of blocks) { if (z1 - z0 < 2) continue; yield* aisleBlock(ctx, xs, z0, z1, { h: 1.85, levels: 5, rows: (k) => (k === 1 || k === 2 ? 2 : 1), signs: z0 === blocks[0][0] ? signs : null, yCeil: ch, signC: v.aisleC, gap: 1.15, inRoom: (x) => x > S.x0 + 1 && x < S.x1 - 1,
      plans: (i) => { const A = themes[(i + ai) % themes.length][1], B = themes[(i + ai + 1) % themes.length][1], sg = prints.promo(R.pick(['WEEKLY DEAL', 'OFERTA', 'MANAGER SPECIAL', 'SAVE']), R.pick(['2 FOR $5', '$1.99', 'BOGO', '3 X $10']), R.pick(['Mesa pasta, all shapes', 'Sunmill cereals 12 oz', 'Abuela beans 15 oz', 'Brightwave 100 oz']), { bg: '#ffd21f', band: v.sign });
        return { sides: [A, B], ends: [[SODA2L, CHIPS.slice(0, 2), CHIPS.slice(2), ['nutty-peanuts', 'gummi-gator']], { pegs: ['gatorbite-original', 'gatorbite-teriyaki', 'gummi-gator', 'nutty-peanuts'], sign: sg }].map((e, j) => (j === 0 && R.chance(0.4) ? [D.pasta, D.sauce.slice(0, 3), D.cookies, D.cereal.slice(0, 2)] : e)) }; } }); ai += 3; }
    // ---- front zone: checkout lanes away from the door, produce tables by the entrance, carts, baskets, magazines, ATM
    const doorX = P.doorX, cside = doorX > 0 ? -1 : 1, lanes = Math.max(1, Math.min(4, Math.floor((S.w / 2 - 0.6 + Math.abs(doorX) * 0.5) / 2.1))), lz = S.z1 - front / 2 - 0.2;
    for (let i = 0; i < lanes; i++) { const lx = cside * (S.w / 2 - 1.2 - i * 2.1); if (Math.abs(lx - doorX) < 1.9) break; const co = checkoutLane(ctx, lx, lz, cside > 0 ? -Math.PI / 2 : Math.PI / 2, { num: i + 1, l: 2.7, top: ['laminate', { c: [70, 72, 76] }], front: ['laminate', { c: v.pal[0] === '#ffffff' ? [60, 60, 64] : hexRgb(v.pal[0]) }], impulse: ['nubo-milk', 'nubo-caramel', 'chicle-pop', 'polar-mints', 'nubo-almond', 'chispa-lighter'], poleC: v.sign });
      if (i === 0) { ctx.store.counterLocal = { x: lx, z: lz }; } ctx.poi('counter', co.clerk.x, co.clerk.z, co.clerk.ry, {}); if (i % 2 === 0) yield; }
    magRack(ctx, cside * (S.w / 2 - 0.35), S.z1 - 0.9, -cside * Math.PI / 2, { pids: D.mags, paper: 'ledger-paper' });
    { const px = doorX - cside * 2.6; if (Math.abs(px) < S.w / 2 - 1.4) produceTable(ctx, px, S.z1 - front + 1.3, 0, { l: 2.4, pids: D.produce.slice(R.int(0, 4)) }); }
    cartCorral(ctx, doorX + cside * 1.6, S.z1 - 0.95, Math.PI, 4); basketStack(ctx, doorX - cside * 1.3, S.z1 - 0.55, { c: v.pal[0] }); floorMat(ctx, doorX, S.z1 - 1.3, 1.9, 1.4, [40, 36, 32]);
    if (R.chance(0.6)) atm(ctx, -cside * (S.w / 2 - 0.4), S.z1 - 1.6, cside * Math.PI / 2); trashCan(ctx, doorX - cside * 1.9, S.z1 - 0.4);
    if (v.pallets || R.chance(0.4)) { pallet(ctx, (xs[0] + xs[xs.length - 1]) / 2 + R.jit(1), zb + 1.1, R.jit(0.2), { layers: 0, pid: R.pick(['cayo-12', 'lobo-12']), wrap: false }); }
    if (R.chance(0.5)) chestFreezer(ctx, -cside * 1.2 + doorX * 0.2, zb + 1.2, 0, { l: 1.8, pids: [...D.frozen.slice(3, 5), 'polar-ice'] });
    if (p.wear > 0.3) floorSign(ctx, R.range(xl, xr), R.range(za, zb), R() * 3);
    yield;
    // ---- ceiling: long fluorescent rows over the aisles, cameras, mirrors, exit, hanging promos
    const rowsX = [S.x0 + 1.2]; for (let i = 0; i < xs.length - 1; i++) rowsX.push((xs[i] + xs[i + 1]) / 2); rowsX.push(S.x1 - 1.0);
    lightRows(ctx, S, rowsX, { seg: 3.6, k: v.key === 'organic' ? 5.5 : 6.6, hang: v.ceil.type === 'open' ? 0.7 : 0, lamp: p.lamp }); S.lit = true;
    for (const z of [S.z0 + 1.5, S.cz, S.z1 - 2]) cctvDome(ctx, R.range(S.x0 + 1, S.x1 - 1), ch, z); convexMirror(ctx, S.x0 + 0.25, ch - 0.4, S.z0 + 0.95, Math.PI / 4); convexMirror(ctx, S.x1 - 0.25, ch - 0.4, S.z0 + 0.95, -Math.PI / 4); exitSign(ctx, doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI);
    const zg = S.z1 - 0.075; for (const b of ctx.front.glazed) { if (R.chance(0.45)) continue; const q = prints.promo(R.pick(['THIS WEEK', 'FRESH', 'OFERTAS']), R.pick(['$0.99 lb', '2/$5', '50% OFF', '$1.49']), R.pick(['Mangoes', 'Mesa pasta', 'Vaca Feliz milk', 'Chicken thighs']), { bg: R.pick(['#ffd21f', '#ffffff', '#ff5a3a']), band: v.sign }); G.plane(q.mat, b.x + R.jit(0.15), b.y0 + 0.5, zg + 0.004, Math.min(0.62, b.w - 0.1), Math.min(0.42, (b.w - 0.1) * 0.68), { uvRect: q.rect }); }
    const sg = prints.storeSign({ style: v.painted ? 'painted' : 'box', sub: v.key === 'mercado' ? 'CARNICERÍA · FRUTAS · BODEGA' : 'FRESH FOOD · PHARMACY · BAKERY', font: v.key === 'organic' ? 'serif' : 'block' }), sw = Math.min(P.W - 1, 8), sy = ctx.front.gh + ctx.front.fascia / 2; G.box(M.flat(v.pal[0], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1); G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    const hrs = prints.hours(); G.plane(hrs.mat, doorX + P.doorW / 2 + 0.3, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    yield;
    // ---- back of house
    const K = P.get('stock'), O = P.get('office');
    for (const sp of P.spans(K, 'back', 1.4)) { const n = Math.floor(sp.len / 1.6); for (let i = 0; i < n; i++) { const at = P.onFace(sp.face, sp.a + (i + 0.5) * sp.len / n, 0); stockRack(ctx, at.x, at.z, at.ry, { l: 1.45, h: 2.4 }); } }
    pallet(ctx, K.cx + R.jit(0.6), K.z1 - 1.0, R.jit(0.3), { layers: R.int(2, 4) }); if (K.w > 4) pallet(ctx, K.cx + (K.w / 4) * (R.chance(0.5) ? 1 : -1), K.z1 - 1.0, R.jit(0.3), { layers: R.int(1, 3) });
    handTruck(ctx, K.x0 + 0.6, K.z1 - 0.5, R() * 3); mopBucket(ctx, K.x1 - 0.5, K.z1 - 0.45, R() * 3); lockers(ctx, K.x1 - 0.55, K.z0 + 0.02, 0, 3); breakerPanel(ctx, K.x0 + 0.02, 1.5, K.cz, Math.PI / 2); wallClock(ctx, K.cx, 2.4, K.z0 + 0.005, 0);
    { const sp = P.spans(O, 'back', 1.2)[0] || P.spans(O, null, 1.2)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); officeDesk(ctx, at.x, at.z, at.ry, { w: Math.min(1.3, sp.len - 0.1) }); } safe(ctx, O.x1 - 0.4, O.z1 - 0.4, Math.PI); dvr(ctx, O.x0 + 0.35, 0.75, O.cz, Math.PI / 2); }
    for (const id of ['wcA', 'wcB']) { const WC = P.get(id), sp = P.spans(WC, 'back', 1)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) }); } }
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: S.ceilY }, at: { x: 0, y: 1.6, z: S.cz }, size: 256 };
    void y0; void mopBucket;
  },
  staff() { return [{ role: 'clerk', post: 'post', routine: ['ring', 'bag', 'break'] }, { role: 'stocker', routine: ['restock', 'face', 'mop'] }]; },
  behaviors: { customers: ['cart', 'browse', 'cooler', 'produce', 'queue', 'pay', 'leave'] },
});
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
