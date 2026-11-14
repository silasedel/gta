// Store type: gas-station convenience store. The worked example for registerStoreType (see ../README.md).
// Six seeded variants (banner, palette, floor, ceiling, lamps, fixture family, facade, wear, layout flip). Banners are provisional
// until the design system publishes its fuel brands (profile() asks game.design first).
import { registerStoreType } from '../registry.js';
import { cut, rw, rd } from '../plan.js';
import { clamp } from '../kit/util.js';
import { family, gondola, wallShelf, coolerBank, checkout, trashCan, floorSign, mopBucket, cctvDome, convexMirror, exitSign, wallFan, floorMat, atm } from '../fixtures/retail.js';
import { stockRack, handTruck, officeDesk, safe, dvr, restroom, lockers, wallClock, lightSwitch, breakerPanel } from '../fixtures/backroom.js';
import { stack, shelfRun } from '../items/stock.js';

const VARIANTS = [
  { name: 'Marlin Mart', sub: 'FOOD · FUEL · 24 HR', tier: 'mid', pal: ['#0f5fb4', '#ffffff', '#ff8a1f'], fam: 'white', floor: ['vct', { c: [232, 232, 228], c2: [70, 120, 180] }], ceil: { type: 'drop' }, lamp: 'coolwhite', facade: 'aluminum', door: 'auto', wear: 0.2, open24: true, counter: [[40, 70, 120], [240, 240, 236]], band: '#0f5fb4', cooler: 'COLD DRINKS', signFont: 'deco' },
  { name: 'Pronto Stop', sub: 'BEER · LOTTO · ATM', tier: 'budget', pal: ['#d81e2c', '#ffd21f', '#ffffff'], fam: 'almond', floor: ['ceramic', { c: [206, 190, 160] }], ceil: { type: 'drop' }, lamp: 'greenish', facade: 'block', door: 'double', wear: 0.85, open24: true, counter: [[90, 30, 30], [210, 190, 150]], band: '#d81e2c', cooler: 'CERVEZA FRÍA', glass: true, signFont: 'impact' },
  { name: 'Tidewell Market', sub: 'FRESH · LOCAL · FUEL', tier: 'luxury', pal: ['#1f4d3a', '#f1e9d6', '#c9a24a'], fam: 'black', floor: ['concrete', { c: [150, 148, 142] }], ceil: { type: 'open', c: [22, 22, 24] }, lamp: 'warm', facade: 'black', door: 'auto', wear: 0.05, hours: [5, 24], counter: [[150, 104, 66], [40, 44, 48]], band: null, cooler: 'CHILLED', signFont: 'serif', wain: ['woodPanel', { c: [150, 108, 70] }] },
  { name: 'El Rápido', sub: 'CAFÉ · LOTTO · CERVEZA', tier: 'budget', pal: ['#f2b01e', '#1f7a3d', '#d81e2c'], fam: 'wood', floor: ['terrazzo', { c: [206, 196, 170] }], ceil: { type: 'drop' }, lamp: 'warm', facade: 'tile', door: 'double', wear: 0.6, hours: [6, 23], counter: [[30, 110, 70], [226, 200, 150]], band: '#1f7a3d', cooler: 'BEBIDAS FRÍAS', signFont: 'slab', painted: true },
  { name: 'Conch Stop', sub: 'BAIT · ICE · COLD BEER', tier: 'mid', pal: ['#1fa3a3', '#fff3d6', '#ff6f59'], fam: 'gray', floor: ['wood', { c: [170, 130, 90] }], ceil: { type: 'open', c: [226, 226, 216] }, lamp: 'neutral', facade: 'wood', door: 'double', wear: 0.5, hours: [5, 22], counter: [[170, 130, 90], [255, 243, 214]], band: '#1fa3a3', cooler: 'ICE · BAIT · BEER', signFont: 'round', wain: ['woodPanel', { c: [226, 236, 230] }], painted: true },
  { name: 'NightOwl', sub: 'OPEN ALL NIGHT', tier: 'mid', pal: ['#5a2ca0', '#ffd21f', '#35c6f4'], fam: 'gray', floor: ['terrazzo', { c: [70, 66, 80], chips: [[150, 120, 200], [240, 220, 120], [40, 40, 50]] }], ceil: { type: 'drop' }, lamp: 'daylight', facade: 'bronze', door: 'auto', wear: 0.35, open24: true, counter: [[60, 40, 100], [30, 30, 36]], band: '#ffd21f', cooler: 'ICY DRINKS', signFont: 'block', glass: true, led: '#c9a8ff' },
];
const SODA = ['zumbo-cola', 'zumbo-cherry', 'zumbo-zero', 'tiki-orange', 'tiki-pina', 'limonazo'], SODA20 = ['zumbo-cola-20', 'tiki-orange-20', 'limonazo-20', 'rally-orange', 'rally-blue'], ENERGY = ['voltra', 'voltra-riptide', 'voltra-mango', 'tocororo-cold'], WATER = ['aguamar', 'aguamar-1l', 'bayleaf-tea', 'vaca-choc'], BEER = ['lobo-lager', 'cayo-light', 'cayo-tall', 'malta-faro'], DAIRY = ['vaca-milk', 'bayleaf-gallon', 'egg-sandwich', 'tuna-sandwich'];
const CHIPS = ['crunchero-classic', 'crunchero-limon', 'crunchero-bbq', 'quesitos'], SNACK = ['crunchero-jalapeno', 'donpepe-mariquitas', 'dona-pastelito', 'dona-cake'], PANTRY = ['sopa-ya-chicken', 'sopa-ya-shrimp', 'abuela-beans', 'abuela-soup'], PEGS = ['gatorbite-original', 'gatorbite-teriyaki', 'gummi-gator', 'nutty-peanuts', 'ampd-cable'], MISC = ['torque-oil', 'alivio', 'zumbo-cola-2l'], BARS = ['nubo-milk', 'nubo-caramel', 'nubo-almond', 'chicle-pop', 'polar-mints', 'chispa-lighter'], LOTTO = ['scratch-flamingo', 'scratch-gator', 'scratch-hurricane', 'scratch-mango'];

registerStoreType({
  type: 'gas-convenience', label: 'Convenience store', kinds: ['convenience', 'fuel', 'gas', 'kiosk'], minSize: { w: 6.5, d: 7 }, variants: VARIANTS.length,
  profile(base, { design, R }) {
    const v = VARIANTS[base.variant]; let brand = null; try { brand = design?.pickBrand?.(base.seed, { category: 'fuel', storefront: true }) || null; } catch (e) { brand = null; }
    return { v, name: brand?.name || v.name, brand, tier: v.tier, wear: clamp(v.wear + R.jit(0.1), 0, 1), accent: v.pal[0], secondary: v.pal[2], lamp: v.lamp, floor: [v.floor[0], { ...(v.floor[1] || {}), probe: v.floor[0] === 'concrete' ? 0.35 : v.floor[0] === 'wood' ? 0.4 : 0.6 }], ceil: v.ceil, open24: !!v.open24, hours: v.hours || [0, 24], flip: R.chance(0.5), bounce: v.tier === 'luxury' ? 0.38 : 0.5,
      wall: { surf: ['paint', { c: v.tier === 'luxury' ? [226, 220, 206] : [232, 226, 210] }], wainscot: v.wain ? { h: 1.0, surf: v.wain } : null, base: '#3a3d42', band: v.band ? { y: 2.25, h: 0.14, c: v.band } : null },
      facade: { style: v.facade }, lore: { story: `${v.name} has been on this corner since ${base.since}. ${base.owner} runs the day shift and knows every regular's lottery numbers.` } };
  },
  plan(P, ctx) {
    const p = ctx.profile, v = p.v, bd = clamp(P.D * 0.27, 2.3, 3.3), [back, sales] = cut(P.lot, 'back', bd), side = p.flip ? 'left' : 'right', other = p.flip ? 'right' : 'left';
    const [wc, rest] = cut(back, side, 1.75), [office, stock] = cut(rest, other, clamp(rw(rest) * 0.36, 2, 2.8));
    const S = P.room('sales', 'sales', sales, { h: Math.min(3.05, P.H - 0.4) }), bw = { surf: ['frp', {}], base: '#2a2c30' };
    P.room('stock', 'stock', stock, { h: 2.8, floor: ['concrete', { c: [120, 118, 112] }], wall: bw, ceil: { type: 'open', c: [60, 60, 62] } });
    P.room('office', 'office', office, { h: 2.6, floor: ['carpet', { c: [70, 74, 86] }], wall: { surf: ['paint', { c: [214, 208, 190] }], base: '#3a3d42' }, ceil: { type: 'drop' } });
    P.room('wc', 'restroom', wc, { h: 2.6, floor: ['quarry', { c: [120, 112, 100] }], wall: { surf: ['paint', { c: [210, 214, 200] }], wainscot: { h: 1.25, surf: ['subway', { c: [226, 230, 224] }] } }, ceil: { type: 'gyp' } });
    P.door('sales', 'stock', { kind: 'swing', w: 1.3, at: p.flip ? 0.8 : 0.2, staff: true }); P.door('sales', 'wc', { kind: 'hinged', w: 0.9 }); P.door('stock', 'office', { kind: 'hinged', w: 0.9, vision: 'slot', staff: true }); P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, at: 0.5, locked: true, sign: false });
    P.storefront({ style: p.facade.style, door: { kind: v.door, w: P.doorW, x: P.doorX }, bulkhead: v.facade === 'block' ? 0.9 : 0.5, awning: v.painted ? { c: v.pal[0], c2: '#f6efe0' } : v.tier === 'luxury' ? { type: 'canopy' } : null, extC: v.painted ? v.pal[1] : null, bars: v.wear > 0.7 });
    void S; void rd;
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx, v = p.v, S = P.get('sales'), fl = p.flip ? -1 : 1, F = family(ctx, v.fam), y0 = ctx.FLOOR_Y, ch = S.ceilY;
    const poster = (pid, x, y, z, ry, w = 0.5, o) => { const q = prints.poster(pid, o); G.plane(q.mat, x, y, z, w, w * 1.4, { ry, uvRect: q.rect, rz: R.jit(0.02) }); };
    // ---- checkout on the door side wall, back bar behind the clerk
    const cl = clamp(S.d * 0.34, 2.2, 3.2), cx = fl * (S.w / 2 - 1.3), cz = S.z1 - 1.0 - cl / 2, cry = -fl * Math.PI / 2;
    const co = checkout(ctx, cx, cz, cry, { l: cl, top: ['laminate', { c: v.counter[1] }], front: ['laminate', { c: v.counter[0] }], glass: v.glass, lotto: LOTTO, impulse: BARS, registerSide: -fl }); ctx.store.counterLocal = { x: cx, z: cz };
    const wx = fl * (S.w / 2); // side wall behind the clerk
    G.at(wx, cz, cry, () => { const z = -0.02; // frame: wall at local z = -0, facing the room (+z)
      G.push(new (Object.getPrototypeOf(G.cur).constructor)().makeTranslation(0, 0, 0)); void z;
      // cigarette rack (overhead), tobacco shelves, lottery terminal, monitor shelf, clock, notices
      G.boxB(F.dark, 0, 1.45, 0.14, cl - 0.2, 0.62, 0.26); for (let k = 0; k < 3; k++) { G.box(F.shelf, 0, 1.5 + k * 0.19, 0.2, cl - 0.24, 0.01, 0.2, { rx: 0.2 }); shelfRun(ctx, -cl / 2 + 0.14, cl / 2 - 0.14, 1.505 + k * 0.19, 0.3, 0.16, k % 2 ? ['caiman-blue', 'caiman-red'] : ['caiman-red', 'caiman-blue'], { block: 0.34, rows: 3, zone: 'backbar', tags: k === 0, tagY: -0.03, jitter: 0.02 }); }
      G.boxB(M.surf('laminate', { c: v.counter[1] }), 0, 0, 0.22, cl - 0.2, 0.9, 0.44); G.box(M.surf('laminate', { c: [60, 62, 66] }), 0, 0.915, 0.23, cl - 0.16, 0.03, 0.48); ctx.solid(-cl / 2 + 0.1, 0, 0, cl / 2 - 0.1, 0.93, 0.46, { occ: false });
      const lt = prints.screen('lotterm', 150, 110, (g, w, h) => { g.fillStyle = '#0c3a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd21f'; g.font = '900 15px Arial'; g.textAlign = 'center'; g.fillText('SOLANA LOTTERY', w / 2, 20); g.fillStyle = '#fff'; g.font = '700 24px Arial'; g.fillText('$' + (40 + Math.floor(R() * 260)) + ' MILLION', w / 2, 58); g.font = '11px Arial'; g.fillText('Next draw: Saturday 11 PM', w / 2, 84); });
      G.boxB(M.flat('#2b3440', { rough: 0.5 }), fl * 0.7, 0.93, 0.24, 0.3, 0.26, 0.26); G.plane(lt.mat, fl * 0.7, 1.09, 0.372, 0.24, 0.17, { uvRect: lt.rect });
      dvr(ctx, -fl * (cl / 2 - 0.55), 0.95, 0.06, 0); wallClock(ctx, 0, 2.42, 0.005, 0, { rim: v.pal[0] }); lightSwitch(ctx, fl * (cl / 2 - 0.02), 1.25, 0.005, 0);
      for (const [k, u] of [['wecard', -0.7], ['camera', 0.7], [v.wear > 0.5 ? 'bills' : 'license', 0.25]]) { const n = prints.notice(k); G.plane(n.mat, u, 2.3, 0.006, 0.26, 0.2, { uvRect: n.rect, rz: R.jit(0.03) }); }
      G.pop(); });
    yield;
    // ---- cooler bank on the back wall of the sales floor (stocked from the stock room side)
    const bs = P.spans(S, 'back', 1.6)[0]; let coolers = null;
    if (bs) { const n = Math.max(2, Math.min(8, Math.floor((bs.len - 0.15) / 0.76))), mid = (bs.a + bs.b) / 2, at = P.onFace(bs.face, mid, 0), hdr = prints.make('coolhdr', 600, 90, (g, w, h) => { g.fillStyle = v.pal[0]; g.fillRect(0, 0, w, h); g.fillStyle = v.pal[1]; g.font = '900 58px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v.cooler, w / 2, h / 2 + 3, w - 30); }, { lit: 1.25, ch: 1 });
      const plans = [[BEER, ['lobo-lager', 'cayo-light'], ['cayo-tall', 'cayo-light'], ['lobo-lager'], ['malta-faro', 'cayo-tall']], [SODA, SODA.slice(2), SODA20, SODA20.slice(2), ['zumbo-cola-20', 'tiki-orange-20']], [ENERGY, ['voltra', 'voltra-riptide'], ['voltra-mango', 'tocororo-cold'], ['rally-orange', 'rally-blue'], ENERGY], [WATER, ['aguamar'], ['aguamar-1l', 'bayleaf-tea'], ['vaca-choc', 'bayleaf-tea'], ['aguamar']], [DAIRY, ['egg-sandwich', 'tuna-sandwich'], ['vaca-choc', 'tocororo-cold'], ['vaca-milk'], ['bayleaf-gallon']]];
      coolers = coolerBank(ctx, at.x, at.z, at.ry, { doors: n, plans: R.shuffle(plans), header: hdr, headerC: v.pal[0], led: v.led }); P.take(bs.face, mid - n * 0.38 - 0.1, mid + n * 0.38 + 0.1); }
    yield;
    // ---- food service wall opposite the checkout: coffee, roller grill, fountain; then wall shelving to the back
    const ox = -fl * (S.w / 2), ory = fl * Math.PI / 2, fz0 = S.z1 - 0.9, fsl = clamp(S.d * 0.42, 2.6, 4.2);
    G.at(ox, fz0 - fsl / 2, ory, () => { const top = M.surf('laminate', { c: v.counter[1], wear: p.wear }), st = F.steel, bk = M.flat('#17181b', { rough: 0.5 });
      G.boxB(M.surf('laminate', { c: v.counter[0] }), 0, 0.1, 0.33, fsl, 0.78, 0.62); G.boxB(F.kick, 0, 0, 0.3, fsl, 0.1, 0.56); G.box(top, 0, 0.9, 0.34, fsl + 0.02, 0.04, 0.68); G.plane(M.surf('subway', { c: [236, 236, 230], wear: p.wear }), 0, 1.5, 0.004, fsl, 1.15, { step: 0.4 }); ctx.solid(-fsl / 2, 0, 0, fsl / 2, 0.92, 0.66, { occ: false }); ctx.shadow(0, 0.33, fsl + 0.2, 0.9);
      // coffee: two brewers with glass pots, three airpots, cup towers, lids, creamer and sugar caddy
      let u = -fsl / 2 + 0.35; for (let i = 0; i < 2; i++, u += 0.3) { G.boxB(st, u, 0.92, 0.26, 0.22, 0.42, 0.36); G.boxB(bk, u, 0.92, 0.42, 0.2, 0.03, 0.14); G.lathe(M.glass({ opacity: 0.45, tint: i ? '#3a1c0c' : '#5a2e12' }), [[0.06, 0], [0.075, 0.05], [0.065, 0.11], [0.05, 0.13]], u, 0.95, 0.42, { seg: 10 }); G.box(M.glow('#ff8a1f', 1.4, 2), u + 0.07, 1.3, 0.441, 0.012, 0.012, 0.002); }
      for (let i = 0; i < 3; i++, u += 0.2) { G.cylB(st, u, 0.92, 0.3, 0.075, 0.36, { seg: 12 }); G.cylB(bk, u, 1.28, 0.3, 0.06, 0.06, { seg: 10 }); G.box(bk, u, 1.05, 0.39, 0.02, 0.02, 0.06); const tg = prints.make('air' + i, 90, 50, (g, w, h) => { g.fillStyle = ['#7b1e22', '#1f4d3a', '#16181c'][i]; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 15px Arial'; g.textAlign = 'center'; g.fillText(['CUBAN ROAST', 'DECAF', 'HOUSE BLEND'][i], w / 2, 30, w - 6); }, { global: true }); G.plane(tg.mat, u, 1.14, 0.377, 0.1, 0.055, { uvRect: tg.rect }); }
      for (const pid of ['coffee-small', 'coffee-large']) { for (let k = 0; k < 9; k++) ctx.item(pid, u, 0.92 + k * 0.012, 0.3, 0, { zone: 'coffee', row: 8 - k, s: 1 }); u += 0.14; }
      ctx.use(-fsl / 2 + 0.6, 1.1, 0.5, { kind: 'pour', r: 1.3, gives: 'coffee-small', label: 'Pour a coffee' }); ctx.poi('coffee', -fsl / 2 + 0.7, 1.15, Math.PI);
      // roller grill under a sneeze guard, with bun drawer and condiment pumps
      u += 0.35; G.boxB(st, u, 0.92, 0.32, 0.62, 0.12, 0.46); for (let k = 0; k < 9; k++) G.cyl(M.flat('#d9dcdf', { metal: 0.9, rough: 0.2 }), u, 1.06, 0.14 + k * 0.045, 0.012, 0.58, { rz: Math.PI / 2, seg: 8 });
      const dogs = []; for (let k = 0; k < 8; k++) { if (R.chance(0.22)) continue; const s1 = ctx.item(k < 5 ? 'roller-dog' : 'roller-taquito', u - 0.14 + (k % 2) * 0.28, 1.066, 0.16 + k * 0.045, 0, { zone: 'roller' }); if (s1) dogs.push(s1); }
      G.box(M.glass({ opacity: 0.18 }), u, 1.3, 0.5, 0.64, 0.3, 0.008, { rx: 0.5 }); G.box(st, u, 1.43, 0.34, 0.66, 0.012, 0.2); ctx.light.led(ctx, [u - 0.28, 1.41, 0.34], [u + 0.28, 1.41, 0.34], { color: '#ffb46a', k: 1.4, d: [0, -1, 0] });
      for (let k = 0; k < 3; k++) { G.cylB(M.flat(['#e8b81e', '#c8102e', '#f4f4ee'][k], { rough: 0.4 }), u + 0.45 + k * 0.1, 0.92, 0.4, 0.04, 0.16, { seg: 10 }); G.cylB(bk, u + 0.45 + k * 0.1, 1.08, 0.4, 0.008, 0.07, { seg: 5 }); }
      ctx.poi('hotfood', u, 1.15, Math.PI); const hm = prints.menu('hot', [{ title: 'Hot & Ready', items: [['Roller Hot Dog', ctx.store.priceOf('roller-dog')], ['Chicken Taquito', ctx.store.priceOf('roller-taquito')], ['2 Dogs + Fountain', 4.99]] }, { title: 'Coffee', items: [['12 oz', ctx.store.priceOf('coffee-small')], ['20 oz', ctx.store.priceOf('coffee-large')], ['Refill', 0.99]] }], { title: p.name + ' Kitchen', lit: 1.1, bg: '#17181b' }); G.plane(hm.mat, 0.2, 2.2, 0.03, 1.5, 0.86, { uvRect: hm.rect }); G.box(bk, 0.2, 2.2, 0.012, 1.56, 0.92, 0.03);
      // fountain: eight-valve dispenser with ice chute, cup tubes, lids, straws
      u += 1.0; if (u < fsl / 2 - 0.5) { G.boxB(bk, u, 0.92, 0.3, 0.7, 0.62, 0.5); G.boxB(st, u, 0.92, 0.56, 0.7, 0.03, 0.14); const fp = prints.make('fount', 300, 80, (g, w, h) => { const cs = ['#c8102e', '#7a0f2a', '#16181c', '#ff7a1a', '#f2c81e', '#1f9d4b', '#1554c0', '#7a3b1d']; for (let i = 0; i < 8; i++) { g.fillStyle = cs[i]; g.fillRect(i * w / 8, 0, w / 8 - 2, h); g.fillStyle = '#fff'; g.font = '700 10px Arial'; g.textAlign = 'center'; g.fillText(['COLA', 'CHERRY', 'ZERO', 'ORANGE', 'PIÑA', 'LIMÓN', 'RALLY', 'TEA'][i], (i + 0.5) * w / 8, h / 2 + 3); } }, { global: true, lit: 1.1, ch: 1 }); G.plane(fp.mat, u, 1.42, 0.552, 0.66, 0.17, { uvRect: fp.rect }); for (let k = 0; k < 8; k++) G.box(st, u - 0.29 + k * 0.083, 1.27, 0.57, 0.03, 0.08, 0.05);
        for (let k = 0; k < 6; k++) ctx.item('fountain-32', u + 0.52, 0.92 + k * 0.014, 0.3, 0, { zone: 'fountain', row: 5 - k }); ctx.use(u, 1.2, 0.6, { kind: 'pour', r: 1.3, gives: 'fountain-32', label: 'Fill a fountain drink' }); }
    });
    yield;
    // side walls: shelving in whatever wall length is left
    for (const side of ['left', 'right']) for (const sp of P.spans(S, side, 1.3)) { const food = (side === 'left') === (fl > 0), a = Math.max(sp.a, S.z0 + 0.1), b = Math.min(sp.b, food ? fz0 - fsl - 0.15 : cz - cl / 2 - 0.5); if (b - a < 1.3) continue; const at = P.onFace(sp.face, (a + b) / 2, 0);
      wallShelf(ctx, at.x, at.z, at.ry, { l: b - a - 0.1, h: 2.05, plan: [MISC, PANTRY, SNACK, CHIPS, ['zumbo-cola-2l', 'alivio']], pegs: PEGS, pegsFrom: 4 }); for (let u = a + 0.6; u < b - 0.3; u += 1.3) poster(R.pick(['voltra', 'zumbo-cola', 'crunchero-bbq', 'cayo-light', 'tiki-pina', 'lobo-lager']), at.x + sp.face.nx * 0.012, 2.6, u, at.ry, 0.44); }
    yield;
    // ---- gondolas in the middle, running front to back
    const gx0 = Math.min(cx, -cx) + 1.3 + (fl < 0 ? 0.9 : 0.9), gx1 = Math.max(cx, -cx) - 1.5, gz1 = S.z1 - 2.6, gz0 = S.z0 + 0.82 + 1.5, gl = Math.max(0, Math.min(5.4, gz1 - gz0)), ng = gl > 1.6 ? Math.max(1, Math.floor((gx1 - gx0 + 1.25) / 2.15)) : 0;
    const plansA = [[PANTRY, MISC, SNACK, CHIPS], [CHIPS, SNACK, ['donpepe-mariquitas', 'quesitos'], CHIPS.slice(1)], [['zumbo-cola-2l', 'torque-oil'], PANTRY, ['dona-pastelito', 'dona-cake'], SNACK]];
    for (let i = 0; i < ng; i++) { const gx = ng === 1 ? (gx0 + gx1) / 2 : gx0 + 0.45 + i * (gx1 - gx0 - 0.9) / (ng - 1); const sg = prints.promo(R.pick(['SNACK DEAL', 'OFERTA', 'MIX & MATCH']), R.pick(['2 FOR $6', '3 X $5', '2 FOR $4']), R.pick(['Any Crunchero 8 oz', 'Tiki Tang 12 oz cans', 'VOLTRA 16 oz']), { bg: v.pal[1] === '#ffffff' ? '#ffd21f' : v.pal[1], band: v.pal[0] });
      gondola(ctx, gx, (gz0 + gz1) / 2, Math.PI / 2, { l: gl, h: v.tier === 'luxury' ? 1.3 : 1.45, sides: [plansA[i % 3], plansA[(i + 1) % 3]], ends: [{ pegs: PEGS, sign: sg }, i % 2 ? { pegs: PEGS.slice(2) } : [BARS, SNACK, CHIPS, ['aguamar']]] }); if (i % 2 === 0) yield; }
    // ---- front of store: beer stacks, ATM, trash, mats, wet floor sign, ice
    const fx = -fl * (S.w / 2 - 1.1); stack(ctx, 'cayo-12', fx * 0.45, y0, S.z1 - 0.75, 2, 1, 4); stack(ctx, 'lobo-12', fx * 0.45 + 0.95 * -fl, y0, S.z1 - 0.75, 2, 1, 3); ctx.G.at(fx * 0.45, S.z1 - 0.75, 0, () => ctx.solid(-1.4, 0, -0.2, 0.5, 0.5, 0.2, { occ: false }));
    atm(ctx, fl * (S.w / 2 - 0.4), S.z1 - 0.45, -fl * Math.PI / 2 + (fl > 0 ? 0 : 0)); trashCan(ctx, P.doorX + fl * -1.5, S.z1 - 0.4); floorMat(ctx, P.doorX, S.z1 - 2.2, 1.6, 0.9, [40, 36, 32]);
    if (p.wear > 0.3) { floorSign(ctx, R.range(-1, 1), S.cz + R.range(-1, 1), R() * 3); }
    // ---- ceiling and wall dressing
    cctvDome(ctx, cx - fl * 0.4, ch, cz); cctvDome(ctx, -fl * (S.w / 2 - 0.8), ch, S.z0 + 1.2); cctvDome(ctx, P.doorX, ch, S.z1 - 0.7); convexMirror(ctx, -fl * (S.w / 2 - 0.25), ch - 0.4, S.z0 + 0.95, fl * Math.PI / 4); exitSign(ctx, P.doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI); if (v.tier !== 'luxury') wallFan(ctx, fl * (S.w / 2 - 0.01), ch - 0.5, S.z0 + 1.6, -fl * Math.PI / 2);
    // pennant string across the store and hanging aisle promos
    { const n = 14, pm = [M.flat(v.pal[0], { rough: 0.7, side: 2 }), M.flat(v.pal[1], { rough: 0.7, side: 2 }), M.flat(v.pal[2], { rough: 0.7, side: 2 })], za = S.z1 - 1.6; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = -S.w / 2 + 0.3 + t * (S.w - 0.6), y = ch - 0.12 - Math.sin(t * Math.PI) * 0.28; G.box(pm[i % 3], x, y - 0.11, za, 0.2, 0.22, 0.002, { rz: R.jit(0.12) }); } G.cyl(M.flat('#e8e8e0', {}), 0, ch - 0.2, za, 0.003, S.w - 0.5, { rz: Math.PI / 2, seg: 4 }); }
    const hs = prints.promo('COLD BEER', '12 PK $14.99', 'Cayo Light cans', { bg: '#ffd21f', band: v.pal[0] }); G.at(0, S.cz - 0.5, 0, () => { for (const s of [1, -1]) G.plane(hs.mat, 0, ch - 0.42, s * 0.004, 1.0, 0.62, { ry: s > 0 ? 0 : Math.PI, uvRect: hs.rect }); for (const s of [-0.45, 0.45]) G.cyl(M.flat('#c9ccd0', {}), s, ch - 0.06, 0, 0.002, 0.12, { seg: 4 }); });
    // window dressing: neon OPEN, lottery and beer neons, posters taped to the glass, hours on the door
    const zg = S.z1 - 0.075, gl2 = ctx.front.glazed; if (gl2.length) { const op = prints.neon('OPEN', { color: '#ff3b5c', color2: '#35c6f4' }), b0 = gl2[0], b1 = gl2[gl2.length - 1]; for (const s of [1, -1]) G.plane(op.mat, b0.x, 1.9, zg + s * 0.002, 0.62, 0.3, { ry: s > 0 ? 0 : Math.PI, uvRect: op.rect }); ctx.light.glowPanel(ctx, b0.x, 1.9, zg - 0.02, { w: 0.6, h: 0.3, color: '#ff5c7a', k: 3, ry: Math.PI });
      if (gl2.length > 1) { const bn = prints.neon(v.wear > 0.5 ? 'CERVEZA' : 'LOTTO', { color: '#35ff7a', border: false }); for (const s of [1, -1]) G.plane(bn.mat, b1.x, 1.85, zg + s * 0.002, 0.7, 0.26, { ry: s > 0 ? 0 : Math.PI, uvRect: bn.rect }); ctx.light.glowPanel(ctx, b1.x, 1.85, zg - 0.02, { w: 0.6, h: 0.25, color: '#35ff7a', k: 2.4, ry: Math.PI }); }
      gl2.forEach((b, i) => { if (i % 2 === 0 || p.clutter > 0.6) { const q = prints.poster(R.pick(['zumbo-cola-20', 'voltra-riptide', 'scratch-flamingo', 'roller-dog', 'cayo-12', 'crunchero-limon']), {}); G.plane(q.mat, b.x + R.jit(0.1), b.y0 + 0.45, zg + 0.004, Math.min(0.55, b.w - 0.1), Math.min(0.77, (b.w - 0.1) * 1.4), { uvRect: q.rect }); G.plane(M.flat('#f4f1e6', { rough: 0.9 }), b.x, b.y0 + 0.45, zg + 0.002, Math.min(0.55, b.w - 0.1), Math.min(0.77, (b.w - 0.1) * 1.4), { ry: Math.PI }); } }); }
    const hrs = prints.hours(); G.plane(hrs.mat, P.doorX + P.doorW / 4, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    // exterior sign on the fascia + gooseneck lamps
    const sg = prints.storeSign({ style: v.painted ? 'painted' : 'box', sub: v.sub, font: v.signFont }), sw = Math.min(P.W - 1, 6.2), sy = ctx.front.gh + ctx.front.fascia / 2; G.box(M.flat(v.pal[0], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1); G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    yield;
    // ---- back of house
    const K = P.get('stock'), O = P.get('office'), WC = P.get('wc');
    for (const sp of P.spans(K, 'back', 1.4)) { const n = Math.floor(sp.len / 1.6); for (let i = 0; i < n; i++) { const at = P.onFace(sp.face, sp.a + (i + 0.5) * sp.len / n, 0); stockRack(ctx, at.x, at.z, at.ry, { l: 1.45 }); } }
    handTruck(ctx, K.cx + R.jit(0.5), K.z1 - 0.5, R() * 3); mopBucket(ctx, K.x0 + 0.5, K.z1 - 0.45, R() * 3); lockers(ctx, K.x1 - 0.55, K.z0 + 0.02, 0, 2); breakerPanel(ctx, K.x0 + 0.02, 1.5, K.cz, Math.PI / 2); stack(ctx, 'cayo-12', K.cx, y0, K.cz + 0.2, 2, 2, 5, { fill: 0.5 });
    { const sp = P.spans(O, 'back', 1.2)[0] || P.spans(O, null, 1.2)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); officeDesk(ctx, at.x, at.z, at.ry, { w: Math.min(1.3, sp.len - 0.1) }); } safe(ctx, O.x1 - 0.4, O.z1 - 0.4, Math.PI); const n = prints.notice('nocash'); G.plane(n.mat, O.cx, 1.6, O.z1 - 0.07, 0.26, 0.2, { ry: Math.PI, uvRect: n.rect }); }
    { const sp = P.spans(WC, 'back', 1)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) }); } }
    // waxed floor: the sales floor reflects its own lights and coolers (interior art kit, kit/probe.js)
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: S.ceilY }, at: { x: 0, y: 1.5, z: S.cz }, size: 256 };
  },
  staff(ctx) { return [{ role: 'clerk', post: 'post', routine: ['ring', 'restock-cooler', 'sweep', 'break'] }, { role: 'stocker', routine: ['restock', 'restock-cooler', 'mop'], chance: 0.6 }]; },
  behaviors: { customers: ['browse', 'cooler', 'coffee', 'hotfood', 'lotto', 'queue', 'pay', 'leave'], regulars: ['lotto'] },
});
