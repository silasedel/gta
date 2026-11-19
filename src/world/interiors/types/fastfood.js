// Store type: fast-food restaurant (r7; the 253 fast_food lots were sit-down diners before). Grown to 14-20 m: dining room up front
// (booths on the walls, two-tops and four-tops in the middle, molded seats), a self-serve drink station and tray return, the order
// counter across the room with three registers under backlit menu screens, the open kitchen right behind it (fryers, flat grill,
// heat lamp chute, shake machine), walk-in stock behind that, two restrooms off the dining room. Banners are made up.
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp } from '../kit/util.js';
import { venuePalette } from '../fixtures/venue.js';
import { diningTable, boothPair } from '../fixtures/dining.js';
import { family, checkout, trashCan, cctvDome, exitSign, floorMat } from '../fixtures/retail.js';
import { stockRack, restroom, lockers, breakerPanel, wallClock, officeDesk } from '../fixtures/backroom.js';
import { pallet } from '../fixtures/aisles.js';

const VARIANTS = [
  { key: 'burger', names: ['Burger Bayou', 'Flip Shack', 'Big Gator Burgers', 'Patty Wagon'], pal: ['#d81e2c', '#ffd21f', '#ffffff'], floor: ['quarry', { c: [150, 70, 50] }], wall: [244, 236, 220], seat: [216, 30, 44], menu: '#16181c', food: ['BURGERS', 'FRIES', 'SHAKES'] },
  { key: 'chicken', names: ['Cluck Royale', 'Coop & Crisp', 'Hot Wing Hut', 'Mama Pollo'], pal: ['#ff8a1f', '#7a2a14', '#ffffff'], floor: ['ceramic', { c: [200, 180, 150] }], wall: [250, 236, 214], seat: [122, 42, 20], menu: '#2a1a10', food: ['CHICKEN', 'SIDES', 'DRINKS'] },
  { key: 'taco', names: ['Taco Tormenta', 'El Chapulín Tacos', 'Salsa Shack'], pal: ['#1f7a3d', '#ffd21f', '#d81e2c'], floor: ['cubanTile', {}], wall: [255, 226, 160], seat: [31, 122, 61], menu: '#1a2a1a', food: ['TACOS', 'BURRITOS', 'NACHOS'] },
  { key: 'pizza', names: ['Slice Island', 'Nonna Rita Pizza', 'Pie Hole Pizza'], pal: ['#c8102e', '#1f7a3d', '#f6efe0'], floor: ['vct', { c: [236, 232, 224], c2: [200, 30, 40] }], wall: [240, 232, 214], seat: [180, 20, 30], menu: '#16181c', food: ['PIZZA', 'WINGS', 'SALADS'] },
];

registerStoreType({
  type: 'fastfood', label: 'Fast food', kinds: ['fast_food', 'food_court'], minSize: { w: 6.5, d: 9 }, variants: VARIANTS.length,
  match(sf, { kind }) { return /fast_food|food_court/.test(kind) ? 0.8 : 0; },
  depth(sf, { room, seed }) { return clamp(room, 14, 14 + (seed % 7)); },
  profile(base, { R }) { const v = VARIANTS[base.variant % VARIANTS.length];
    return { v, pal: venuePalette({ accent: v.pal[0], warm: '#fff0d0', velvet: v.seat, wood: [160, 120, 80], marble: [[236, 236, 232], [200, 200, 196]], dark: '#2a2a2e' }), name: R.pick(v.names), tier: 'budget', wear: R.range(0.2, 0.6), accent: v.pal[0], lamp: 'neutral', hours: [10, 24], busy: [11, 22], flip: R.chance(0.5), bounce: 0.55,
      floor: [v.floor[0], { ...(v.floor[1] || {}), probe: 0.5 }], ceil: { type: 'drop' }, wall: { surf: ['paint', { c: v.wall }], wainscot: { h: 1.1, surf: ['subway', { c: [240, 238, 232] }] }, base: '#2a2c30', band: { y: 1.12, h: 0.06, c: v.pal[0] } }, facade: { style: 'aluminum' },
      lore: { story: `Franchise number ${100 + (base.seed % 800)}, opened ${base.since}.` } }; },
  plan(P, ctx) {
    const p = ctx.profile, kd = clamp(P.D * 0.36, 4.4, 6.5), [back, dining] = cut(P.lot, 'back', kd), [row, kitchen] = cut(back, 'back', clamp(kd * 0.38, 2.0, 2.5)), side = p.flip ? 'left' : 'right', [wcs, stock] = cut(row, side, 3.4), [wcA, wcB] = cut(wcs, side, 1.7);
    P.room('dining', 'sales', dining, { h: Math.min(3.2, P.H - 0.3) });
    P.room('kitchen', 'kitchen', kitchen, { h: 2.9, floor: ['quarry', { c: [130, 60, 44] }], wall: { surf: ['frp', {}], base: '#3a3a3a' }, ceil: { type: 'drop' } });
    P.room('stock', 'stock', stock, { h: 2.8, floor: ['concrete', { c: [120, 118, 112] }], wall: { surf: ['frp', {}], base: '#2a2c30' }, ceil: { type: 'open', c: [60, 60, 62] } });
    for (const [id, r] of [['wcA', wcA], ['wcB', wcB]]) P.room(id, 'restroom', r, { h: 2.6, floor: ['ceramic', { c: [200, 200, 196] }], wall: { surf: ['paint', { c: [220, 214, 200] }], wainscot: { h: 1.25, surf: ['subway', { c: [236, 236, 230] }] } }, ceil: { type: 'gyp' } });
    P.open('dining', 'kitchen'); P.door('kitchen', 'stock', { kind: 'swing', w: 1.2, staff: true }); P.door('kitchen', 'wcA', { kind: 'hinged', w: 0.85 }); P.door('kitchen', 'wcB', { kind: 'hinged', w: 0.85 }); P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false });
    P.storefront({ style: 'aluminum', door: { kind: 'double', w: P.doorW, x: P.doorX }, bulkhead: 0.45, awning: { c: p.v.pal[0], c2: p.v.pal[1] } });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx, v = p.v, S = P.get('dining'), K = P.get('kitchen'), pal = p.pal; family(ctx, 'white'); const ch = S.ceilY, steel = M.flat('#c9ccd0', { metal: 0.85, rough: 0.3 }), dk = M.flat('#16181c', { rough: 0.5 });
    ctx.store.venue = { kind: 'restaurant', pal, busy: p.busy };
    // ---- order counter on the kitchen line (open to the dining room), registers, menu screens above
    const cz = K.z1 + 0.5, cl = Math.min(K.w - 1.4, 5.2), cx = (K.x0 + K.x1) / 2 + (p.flip ? 0.5 : -0.5);
    G.at(cx, cz, 0, () => { const front = M.surf('laminate', { c: hexRgb(v.pal[0]) }), top = M.surf('laminate', { c: [60, 62, 66] }); G.boxB(front, 0, 0.1, 0.0, cl, 0.86, 0.06); G.boxB(dk, 0, 0, -0.02, cl, 0.1, 0.04); G.boxB(top, 0, 0.96, -0.3, cl + 0.06, 0.04, 0.72); G.boxB(M.flat('#b9bec3', { metal: 0.8, rough: 0.3 }), 0, 0, -0.3, cl, 0.96, 0.6); ctx.solid(-cl / 2, 0, -0.66, cl / 2, 1.0, 0.04);
      const n = clamp(Math.floor(cl / 1.4), 2, 3); for (let i = 0; i < n; i++) { const rx = -cl / 2 + (i + 0.5) * cl / n; G.boxB(dk, rx, 1.0, -0.25, 0.36, 0.08, 0.3); G.box(dk, rx, 1.3, -0.3, 0.32, 0.22, 0.03, { rx: 0.3 }); const sc = prints.screen('ffpos', 120, 80, (g, w, h) => { g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#19c37d'; g.fillRect(0, h - 18, w, 18); }); G.plane(sc.mat, rx, 1.31, -0.28, 0.28, 0.18, { rx: -0.3, uvRect: sc.rect });
        const u = ctx.use(rx, 1.15, 0.2, { kind: 'register', r: 1.5, drawer: { cash: R.int(80, 400), open: 0 } }); ctx.poi('post', rx, -0.95, 0, { role: 'clerk', register: u }); ctx.poi('counter', rx, -0.95, 0, {}); ctx.poi('register', rx, 0.6, Math.PI, { use: u }); for (let q = 1; q <= 3; q++) ctx.poi('queue', rx, 0.6 + q * 0.8, Math.PI, { n: q }); }
      for (let k = 0; k < 6; k++) G.boxB(M.flat('#e8d8b8', { rough: 0.8 }), cl / 2 - 0.35, 1.0 + k * 0.012, -0.2, 0.36, 0.01, 0.28); // tray stack
      G.boxB(M.flat('#d81e2c', {}), -cl / 2 + 0.3, 1.0, -0.15, 0.2, 0.25, 0.15); G.boxB(M.flat('#f2f0ea', {}), -cl / 2 + 0.55, 1.0, -0.15, 0.12, 0.2, 0.12); // napkin box, straws
      // menu screens hung above the counter: three backlit boards with food shots and prices
      const mw = Math.min(1.5, (cl - 0.2) / 3); for (let i = 0; i < 3; i++) { const mx = (i - 1) * (mw + 0.06), title = v.food[i], m = prints.make(`ffmenu:${v.key}:${i}`, 360, 220, (g, w, h) => { g.fillStyle = v.menu; g.fillRect(0, 0, w, h); g.fillStyle = v.pal[0]; g.fillRect(0, 0, w, 40); g.fillStyle = '#fff'; g.font = '900 28px Arial Black, Arial'; g.textAlign = 'center'; g.fillText(title, w / 2, 30);
          for (let k = 0; k < 3; k++) { const fx = 60 + k * 120; g.fillStyle = ['#c98b4a', '#e8b23a', '#7a3b1d'][k]; g.beginPath(); g.ellipse(fx, 95, 42, 26, 0, 0, 7); g.fill(); g.fillStyle = ['#3a8a3a', '#d81e2c', '#ffd21f'][k]; g.fillRect(fx - 36, 92, 72, 6); g.fillStyle = '#fff'; g.font = '700 15px Arial'; g.fillText(['#' + (k + 1) + ' Combo', 'Classic', 'Deluxe'][k], fx, 145); g.fillStyle = '#ffd21f'; g.font = '900 22px Arial'; g.fillText('$' + (5.99 + k * 2 + i).toFixed(2), fx, 172); }
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '600 12px Arial'; g.fillText('Make it a meal +$2.49 · Large +$0.80', w / 2, 205); }, { lit: 1.25, ch: 1 });
        G.box(dk, mx, Math.min(ch - 0.45, 2.55), -0.6, mw + 0.04, mw * 0.62 + 0.04, 0.05); G.plane(m.mat, mx, Math.min(ch - 0.45, 2.55), -0.572, mw, mw * 0.61, { uvRect: m.rect }); ctx.light.glowPanel(ctx, mx, Math.min(ch - 0.45, 2.55), -0.55, { w: mw, h: mw * 0.6, color: '#fff4e0', k: 0.8 }); } });
    yield;
    // ---- kitchen line behind: fryers, flat grill, heat-lamp chute, shake machine, prep table, sink, hood
    G.at(K.cx, K.z0 + 0.02, 0, () => { const L = K.w - 0.4; G.boxB(steel, 0, 0, 0.4, L, 0.9, 0.75); G.boxB(M.flat('#9aa0a6', { metal: 0.7, rough: 0.4 }), 0, 1.9, 0.5, L, 0.55, 1.0); ctx.solid(-L / 2, 0, 0, L / 2, 0.92, 0.78);
      let u = -L / 2 + 0.3; for (let i = 0; i < 2; i++, u += 0.45) { G.boxB(dk, u, 0.9, 0.4, 0.4, 0.06, 0.6); G.boxB(M.flat('#c9a040', { rough: 0.2 }), u, 0.91, 0.4, 0.34, 0.04, 0.5); for (const s of [-0.08, 0.08]) G.boxB(steel, u + s, 1.0, 0.45, 0.14, 0.08, 0.28); }
      G.boxB(dk, u + 0.5, 0.9, 0.4, 0.9, 0.04, 0.65); for (let k = 0; k < 6; k++) G.cylB(M.flat('#5a2e14', { rough: 0.6 }), u + 0.2 + (k % 3) * 0.22, 0.94, 0.3 + Math.floor(k / 3) * 0.2, 0.05, 0.015, { seg: 10 }); u += 1.1;
      if (u < L / 2 - 0.5) { G.boxB(steel, u + 0.3, 0.9, 0.5, 0.7, 0.45, 0.4); ctx.light.led(ctx, [u, 1.32, 0.55], [u + 0.6, 1.32, 0.55], { color: '#ff7a30', k: 1.4, every: 0.6, d: [0, -1, 0] }); for (let k = 0; k < 5; k++) G.boxB(M.flat(k % 2 ? '#f2c81e' : '#e8e0d0', { rough: 0.7 }), u + 0.05 + k * 0.12, 0.93, 0.55, 0.1, 0.05, 0.08); u += 0.9; }
      if (u < L / 2 - 0.4) { G.boxB(steel, u + 0.2, 0.9, 0.3, 0.4, 0.6, 0.45); G.cylB(M.flat('#f4f0ea', {}), u + 0.12, 1.0, 0.55, 0.04, 0.16, { seg: 8 }); } });
    // drink station and tray return on the dining side
    const ds = P.spans(S, p.flip ? 'left' : 'right', 1.6)[0]; if (ds) { const a = Math.max(ds.a, S.z0 + 1.0), at = P.onFace(ds.face, a + 0.8, 0); G.at(at.x, at.z, at.ry, () => { G.boxB(M.surf('laminate', { c: hexRgb(v.pal[0]) }), 0, 0, 0.3, 1.4, 0.9, 0.6); G.boxB(M.flat('#3a3d42', {}), 0, 0.9, 0.3, 1.44, 0.03, 0.64); G.boxB(dk, -0.15, 0.93, 0.25, 0.9, 0.62, 0.45);
        const fp = prints.make('ffount', 300, 80, (g, w, h) => { const cs = ['#c8102e', '#16181c', '#ff7a1a', '#1f9d4b', '#f2c81e', '#1554c0']; for (let i = 0; i < 6; i++) { g.fillStyle = cs[i]; g.fillRect(i * w / 6, 0, w / 6 - 2, h); } }, { global: true, lit: 1.1, ch: 1 }); G.plane(fp.mat, -0.15, 1.42, 0.48, 0.84, 0.2, { uvRect: fp.rect }); for (let k = 0; k < 4; k++) G.cylB(M.flat('#f4f0ea', {}), 0.45 + (k % 2) * 0.1, 0.93, 0.15 + Math.floor(k / 2) * 0.12, 0.045, 0.3, { seg: 8 });
        ctx.use(-0.15, 1.2, 0.6, { kind: 'pour', r: 1.3, gives: 'fountain-32', label: 'Fill a drink' }); ctx.solid(-0.72, 0, 0, 0.72, 1.55, 0.62, { occ: false }); });
      const tr = P.onFace(ds.face, a + 2.2, 0); if (tr.z < S.z1 - 1) G.at(tr.x, tr.z, tr.ry, () => { G.boxB(M.surf('laminate', { c: [90, 60, 40] }), 0, 0, 0.3, 0.7, 1.05, 0.6); G.box(dk, 0, 0.7, 0.605, 0.3, 0.2, 0.01); const t = prints.make('thanks', 200, 60, (g, w, h) => { g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 26px Arial'; g.textAlign = 'center'; g.fillText('THANK YOU', w / 2, 40); }, { global: true }); G.plane(t.mat, 0, 0.95, 0.606, 0.5, 0.15, { uvRect: t.rect }); for (let k = 0; k < 4; k++) G.boxB(M.flat('#e8d8b8', {}), 0, 1.05 + k * 0.012, 0.3, 0.36, 0.01, 0.28); ctx.solid(-0.35, 0, 0, 0.35, 1.1, 0.62, { occ: false }); }); }
    yield;
    // ---- dining: booths on the window wall side, tables in the middle
    const z0 = cz + 2.2, z1 = S.z1 - 1.5, bx = S.x0 + (p.flip ? S.w - 1.0 : 1.0) * 1; let n = 0;
    for (let z = z0 + 1.2; z < z1 - 1.0; z += 2.6) { boothPair(ctx, p.flip ? S.x1 - 0.05 : S.x0 + 0.05, z, p.flip ? -Math.PI / 2 : Math.PI / 2, { pal, l: 1.6, top: 'zinc', setting: 'cafe' }); if (++n % 2 === 0) yield; }
    const tx0 = (p.flip ? S.x0 + 1.3 : S.x0 + 2.4), tx1 = (p.flip ? S.x1 - 2.4 : S.x1 - 1.3);
    for (let z = z0 + 0.6; z < z1 - 0.4; z += 1.9) for (let x = tx0 + 0.5; x < tx1 - 0.3; x += 1.9) { if (Math.abs(x - P.doorX) < 1.3 && z > z1 - 1.5) continue; diningTable(ctx, x, z, 0, { pal, shape: R.chance(0.5) ? 'square' : 'rect', w: 0.75, top: 'zinc', chair: 'metal', setting: 'cafe', seats: 2 }); }
    yield; void bx;
    floorMat(ctx, P.doorX, S.z1 - 0.9, 1.6, 0.9, [40, 36, 32]); trashCan(ctx, P.doorX + 1.4, S.z1 - 0.45, { c: v.pal[0] }); cctvDome(ctx, cx, ch, cz + 0.8); exitSign(ctx, P.doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI); wallClock(ctx, cx, Math.min(ch - 0.3, 2.9), K.z0 + 0.005, 0);
    const sg = prints.storeSign({ style: 'box', sub: v.food.join(' · '), font: 'impact' }), sw = Math.min(P.W - 1, 6.2), sy = ctx.front.gh + ctx.front.fascia / 2; G.box(M.flat(v.pal[0], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1); G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    const zg = S.z1 - 0.075, gl2 = ctx.front.glazed; if (gl2.length) { const b = gl2[0], op = prints.neon('OPEN', { color: '#ff3b5c' }); for (const s of [1, -1]) G.plane(op.mat, b.x, 1.9, zg + s * 0.002, 0.62, 0.3, { ry: s > 0 ? 0 : Math.PI, uvRect: op.rect }); ctx.light.glowPanel(ctx, b.x, 1.9, zg - 0.02, { w: 0.6, h: 0.3, color: '#ff5c7a', k: 2.6, ry: Math.PI }); }
    const hrs = prints.hours(); G.plane(hrs.mat, P.doorX + P.doorW / 4, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    ctx.gridRig(S, { type: 'troffer', lamp: 'neutral', k: 8.5, sx: 2.4, sz: 2.4 }); ctx.gridRig(K, { type: 'troffer', lamp: 'coolwhite', k: 9, sx: 2.2, sz: 2.2, margin: 0.6 });
    yield;
    const ST = P.get('stock'); for (const sp of P.spans(ST, 'back', 1.4)) { const nn = Math.floor(sp.len / 1.6); for (let i = 0; i < nn; i++) { const at = P.onFace(sp.face, sp.a + (i + 0.5) * sp.len / nn, 0); stockRack(ctx, at.x, at.z, at.ry, { l: 1.45 }); } }
    if (ST.w > 3) pallet(ctx, ST.x1 - 0.8, ST.cz + 0.1, Math.PI / 2, { layers: 2 }); lockers(ctx, ST.x0 + 0.5, ST.z1 - 0.02, Math.PI, 2); breakerPanel(ctx, ST.x0 + 0.02, 1.5, ST.cz, Math.PI / 2); if (ST.w > 5) officeDesk(ctx, ST.cx, ST.z1 - 0.45, Math.PI, { w: 1.1 });
    for (const id of ['wcA', 'wcB']) { const WC = P.get(id), sp = P.spans(WC, null, 1)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) }); } }
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: K.z0, z1: S.z1, y0: 0, y1: S.ceilY }, at: { x: 0, y: 1.6, z: S.cz }, size: 256 };
    void checkout;
  },
  staff() { return [{ role: 'clerk', post: 'post', routine: ['ring', 'bag'] }, { role: 'cook', routine: ['grill', 'fry'] }]; },
  behaviors: { customers: ['queue', 'pay', 'sit', 'leave'] },
});
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
