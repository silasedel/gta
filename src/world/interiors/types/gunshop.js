// Store type: gun shop / sporting goods counter (r7, the GTA ammo shop). Takes 30 % of the 'hardware' storefronts by seed and grows
// them to 14-20 m. An L of lit glass counters (pistols) runs down one side and across the back with the register; the long-gun wall
// behind it; gondolas of ammo boxes and gear (targets, ear and eye protection, cleaning kits, cases) on the floor; a locked range
// door at the back. Weapons are display pieces; purchases go through the counter (game.emit('purchase')).
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp, hashStr } from '../kit/util.js';
import { family, gondola, gondolaGen, checkout, trashCan, cctvDome, exitSign, floorMat } from '../fixtures/retail.js';
import { stockRack, officeDesk, safe, dvr, restroom, lockers, wallClock, breakerPanel } from '../fixtures/backroom.js';
import { displayCase, tallWall } from '../fixtures/aisles.js';
import { pistol, longGunWall } from '../fixtures/specialty.js';
import { DEPT as D } from '../items/range.js';

const VARIANTS = [
  { key: 'range', names: ['Ironpine Guns & Range', 'Southline Shooting Sports', 'Redhawk Arms & Range'], pal: ['#2f3a2a', '#e8b81e', '#ffffff'], fam: 'black', floor: ['concrete', { c: [130, 128, 122] }], wall: [70, 74, 66], ceil: { type: 'open', c: [36, 38, 36] }, lamp: 'neutral', wear: 0.3, wood: true },
  { key: 'counter', names: ['Ammu-Depot', 'Bayside Arms', 'Hialeah Gun & Pawn', 'Tactix Supply'], pal: ['#c8102e', '#16181c', '#ffffff'], fam: 'gray', floor: ['vct', { c: [190, 186, 178], c2: [60, 60, 64] }], wall: [214, 210, 200], ceil: { type: 'drop' }, lamp: 'coolwhite', wear: 0.55 },
  { key: 'outfitter', names: ['Glades Outfitters', 'Gator Creek Sporting', 'Cypress Hunting Supply'], pal: ['#5a3a1a', '#e8d6a8', '#2f5a2a'], fam: 'wood', floor: ['wood', { c: [120, 84, 52] }], wall: [180, 160, 130], ceil: { type: 'open', c: [40, 32, 26] }, lamp: 'warm', wear: 0.25, wood: true },
];

registerStoreType({
  type: 'gunshop', label: 'Gun shop', kinds: ['weapons', 'guns', 'hunting', 'outdoor'], minSize: { w: 7, d: 9 }, variants: VARIANTS.length,
  match(sf, { kind }) { if (/weapons|guns|hunting/.test(kind)) return 0.9; if (kind === 'hardware') { const h = hashStr('pawn' + (sf.id ?? sf.x)) % 100; if (h >= 40 && h < 70) return 0.7; } return 0; },
  depth(sf, { room, seed }) { return clamp(room, 14, 14 + (seed % 7)); },
  profile(base, { R }) { const v = VARIANTS[base.variant % VARIANTS.length];
    return { v, name: R.pick(v.names), tier: 'mid', wear: clamp(v.wear + R.jit(0.1), 0, 1), accent: v.pal[0], lamp: v.lamp, hours: [9, 21], flip: R.chance(0.5), bounce: 0.45, floor: [v.floor[0], { ...v.floor[1], probe: 0.4 }], ceil: v.ceil,
      wall: { surf: [v.wood ? 'woodPanel' : 'paint', { c: v.wall }], base: '#1a1b1e', band: { y: 2.4, h: 0.12, c: v.pal[0] } }, facade: { style: v.key === 'outfitter' ? 'wood' : 'block' }, lore: { story: `${base.owner} opened the counter in ${base.since}. Range lanes in back, by appointment.` } }; },
  plan(P, ctx) {
    const p = ctx.profile, bd = clamp(P.D * 0.2, 2.8, 3.8), [back, sales] = cut(P.lot, 'back', bd), side = p.flip ? 'left' : 'right', other = p.flip ? 'right' : 'left';
    const [wc, rest] = cut(back, side, 1.75), [office, range] = cut(rest, other, clamp(rw(rest) * 0.35, 2, 2.8));
    P.room('sales', 'sales', sales, { h: Math.min(3.4, P.H - 0.3) });
    P.room('range', 'stock', range, { h: 2.8, floor: ['concrete', { c: [110, 108, 104] }], wall: { surf: ['cmu', { c: [150, 150, 146] }], base: '#2a2c30' }, ceil: { type: 'open', c: [40, 40, 42] } });
    P.room('office', 'office', office, { h: 2.6, floor: ['carpet', { c: [60, 64, 56] }], wall: { surf: ['paint', { c: [200, 196, 180] }], base: '#3a3d42' }, ceil: { type: 'drop' } });
    P.room('wc', 'restroom', wc, { h: 2.6, floor: ['quarry', { c: [120, 112, 100] }], wall: { surf: ['paint', { c: [210, 214, 200] }], wainscot: { h: 1.25, surf: ['subway', { c: [226, 230, 224] }] } }, ceil: { type: 'gyp' } });
    P.door('sales', 'range', { kind: 'hinged', w: 1.0, at: 0.5, staff: true, locked: true, vision: 'slot' }); P.door('sales', 'wc', { kind: 'hinged', w: 0.9 }); P.door('range', 'office', { kind: 'hinged', w: 0.9, staff: true }); P.door('range', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false });
    P.storefront({ style: p.facade.style, door: { kind: 'double', w: P.doorW, x: P.doorX }, bulkhead: 0.9, awning: p.v.key === 'outfitter' ? { c: p.v.pal[0], c2: '#e8d6a8' } : null, bars: true });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx, v = p.v, S = P.get('sales'); family(ctx, v.fam); const ch = S.ceilY, doorX = P.doorX, cs = doorX > 0 ? -1 : 1; // counter side: away from the door
    ctx.store.venue = { kind: 'shop', busy: [10, 20], guests: 2 };
    // ---- L counter: cases down the side wall (1.6 m off it) and across the back (1.6 m off it); register at the corner
    const off = 1.7, sx = cs * (S.w / 2 - off), bz = S.z0 + off, sideL = Math.max(1.8, (S.z1 - 2.4) - (bz + 0.6)), nSide = Math.max(1, Math.floor(sideL / 1.8));
    for (let i = 0; i < nSide; i++) { const cz = bz + 0.6 + (i + 0.5) * sideL / nSide; displayCase(ctx, sx, cz, -cs * Math.PI / 2, { l: sideL / nSide - 0.04, deckC: [30, 34, 30], led: '#fff6e8', fill: (a, b, y) => { for (let u = a + 0.12; u < b - 0.1; u += 0.22) pistol(ctx, u, y, R.jit(0.06), R.pick([0.15, -0.15, 0.4]), { c: R.pick(['#16181c', '#2a2c30', '#3a3a32', '#4a4636']), slide: R.pick(['#1e2024', '#1e2024', '#b9bec3']) }); } }); }
    const backL = S.w - off - 1.2 - 0.6, regL = 1.6, nBack = Math.max(0, Math.floor((backL - regL) / 1.8)), bx0 = cs > 0 ? S.x0 + 1.2 : S.x1 - 1.2;
    const regX = sx - cs * (0.3 + regL / 2); const co = checkout(ctx, regX, bz, 0, { l: regL, top: ['laminate', { c: [30, 30, 34] }], front: ['laminate', { c: [40, 44, 40] }], registerSide: cs }); ctx.store.counterLocal = { x: regX, z: bz }; ctx.poi('counter', co.clerk.x, co.clerk.z, co.clerk.ry, {});
    for (let i = 0; i < nBack; i++) { const cl = (backL - regL) / nBack, cx = bx0 - cs * 0 + (cs > 0 ? 1 : -1) * ((i + 0.5) * cl) * 1; if (Math.abs(cx - regX) < regL / 2 + cl / 2 - 0.05) continue; displayCase(ctx, cx, bz, 0, { l: cl - 0.04, deckC: [30, 34, 30], fill: (a, b, y) => { for (let u = a + 0.12; u < b - 0.1; u += 0.24) pistol(ctx, u, y, R.jit(0.06), R.pick([0.1, -0.1]), {}); } }); }
    yield;
    // long-gun walls behind both counter legs
    for (const sp of P.spans(S, 'back', 1.4)) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); longGunWall(ctx, at.x, at.z, at.ry, { l: Math.min(sp.len - 0.2, 6), h: Math.min(2.6, ch - 0.3) }); P.take(sp.face, sp.a, sp.b); }
    for (const sp of P.spans(S, cs > 0 ? 'right' : 'left', 1.4)) { const a = Math.max(sp.a, bz + 0.4), b = Math.min(sp.b, S.z1 - 2.2); if (b - a < 1.4) continue; const at = P.onFace(sp.face, (a + b) / 2, 0); longGunWall(ctx, at.x, at.z, at.ry, { l: Math.min(b - a - 0.1, 6), h: Math.min(2.6, ch - 0.3) }); }
    yield;
    // ---- floor: ammo gondolas and gear; ammo wall on the open side
    const fx0 = cs > 0 ? S.x0 + 1.7 : sx + 1.4, fx1 = cs > 0 ? sx - 1.4 : S.x1 - 1.7, fz0 = bz + 1.6, fz1 = S.z1 - 2.4, gl = fz1 - fz0, ng = gl > 1.6 ? clamp(Math.floor((fx1 - fx0 + 1.2) / 2.2), 1, 3) : 0;
    for (let i = 0; i < ng; i++) { const gx = ng === 1 ? (fx0 + fx1) / 2 : fx0 + i * (fx1 - fx0) / (ng - 1), A = D.ammo, sg = prints.promo(R.pick(['RANGE DAY', 'IN STOCK', 'BULK']), R.pick(['$19.99', '2 FOR $35', '10% OFF']), R.pick(['9mm FMJ 50 rd', 'Paper targets 25 pk', 'Ear protection']), { bg: '#e8b81e', band: v.pal[0] });
      yield* gondolaGen(ctx, gx, (fz0 + fz1) / 2, Math.PI / 2, { l: gl, h: 1.5, levels: 4, d: 0.36, rows: 2, block: 0.24, sides: [[A.slice(3), A.slice(0, 3), A, A.slice(1, 4)], [A.slice(2), A, A.slice(0, 2), A.slice(4)]], ends: [{ pegs: D.gear.slice(0, 4), sign: sg }, { pegs: D.gear.slice(1, 4) }] }); yield; }
    for (const sp of P.spans(S, cs > 0 ? 'left' : 'right', 1.4)) { const a = Math.max(sp.a, bz + 0.8), b = Math.min(sp.b, S.z1 - 1.2); if (b - a < 1.4) continue; const at = P.onFace(sp.face, (a + b) / 2, 0); tallWall(ctx, at.x, at.z, at.ry, { l: b - a - 0.1, h: 2.1, levels: 6, d: 0.3, rows: 2, block: 0.3, plan: [['case-0'], D.ammo.slice(4), D.ammo.slice(0, 3), D.ammo.slice(2, 5), D.ammo, D.ammo.slice(3)], header: prints.make('ammohdr', 420, 80, (g, w, h) => { g.fillStyle = v.pal[0]; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = '900 52px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AMMUNITION', w / 2, h / 2 + 3, w - 20); }, { global: true, lit: 1.1, ch: 1 }) }); }
    yield;
    // ---- dressing: range rules, safety notices, flags of the made-up range league, cameras, sign, window bars
    const rules = prints.make('rangerules', 300, 400, (g, w, h) => { g.fillStyle = '#f7f4ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, 60); g.fillStyle = '#fff'; g.font = '900 30px Arial Black, Arial'; g.textAlign = 'center'; g.fillText('RANGE RULES', w / 2, 42); g.fillStyle = '#16181c'; g.font = '600 17px Arial'; g.textAlign = 'left'; ['1. Treat every firearm as loaded.', '2. Muzzle downrange at all times.', '3. Finger off the trigger.', '4. Eyes and ears required.', '5. Cease fire means CEASE FIRE.', '6. No one past the line.', '7. Waiver at the counter.'].forEach((t, i) => g.fillText(t, 16, 100 + i * 40, w - 30)); }, { global: true });
    { const d = P.doors.find((q) => q.a === 'sales' && q.b === 'range'); if (d) G.plane(rules.mat, d.x + 1.0, 1.6, S.z0 + 0.008, 0.45, 0.6, { uvRect: rules.rect }); }
    for (const [k, x] of [['wecard', -0.8], ['camera', 0.8]]) { const nt = prints.notice(k); G.plane(nt.mat, x, 2.1, S.z1 - 0.12, 0.26, 0.2, { ry: Math.PI, uvRect: nt.rect }); }
    floorMat(ctx, doorX, S.z1 - 0.9, 1.6, 0.9, [40, 36, 32]); trashCan(ctx, doorX - cs * 1.4, S.z1 - 0.4); for (const [x, z] of [[sx, bz + 1], [0, S.cz], [doorX, S.z1 - 0.7]]) cctvDome(ctx, x, ch, z); exitSign(ctx, doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI);
    const sg = prints.storeSign({ style: 'box', sub: v.key === 'outfitter' ? 'HUNTING · FISHING · AMMO' : 'GUNS · AMMO · RANGE', font: 'impact' }), sw = Math.min(P.W - 1, 6.2), sy = ctx.front.gh + ctx.front.fascia / 2; G.box(M.flat(v.pal[0], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1); G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    const hrs = prints.hours(); G.plane(hrs.mat, doorX + P.doorW / 4, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    ctx.gridRig(S, v.ceil.type === 'open' ? { type: 'strip', lamp: p.lamp, k: 7, hang: Math.max(0.3, P.H - 3.4), sx: 2.3, sz: 2.6, l: 2.4 } : { type: 'troffer', lamp: p.lamp, k: 8.5, sx: 2.4, sz: 2.4 });
    yield;
    // ---- back: range room behind the locked door (shooting booths, target carriers), office, restroom
    const K = P.get('range'), O = P.get('office'), WC = P.get('wc');
    G.at(K.cx, K.z1 - 0.9, 0, () => { const n = Math.max(1, Math.floor((K.w - 0.4) / 1.2)); for (let i = 0; i < n; i++) { const x = -K.w / 2 + 0.2 + (i + 0.5) * (K.w - 0.4) / n; for (const s of [-1, 1]) G.boxB(M.flat('#5a5e62', { rough: 0.6 }), x + s * 0.55, 0, 0, 0.04, 1.9, 1.0); G.boxB(M.flat('#3a3d42', {}), x, 0.95, -0.45, 1.05, 0.04, 0.3); ctx.solid(x + 0.53, 0, -0.5, x + 0.57, 1.9, 0.5); } });
    { const tg = prints.make('target', 128, 160, (g, w, h) => { g.fillStyle = '#f7f4ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181c'; g.beginPath(); g.ellipse(w / 2, h * 0.32, 22, 26, 0, 0, 7); g.fill(); g.fillRect(w / 2 - 44, h * 0.5, 88, h * 0.5); g.strokeStyle = '#c8102e'; g.lineWidth = 3; for (const r of [10, 22, 34]) { g.beginPath(); g.arc(w / 2, h * 0.62, r, 0, 7); g.stroke(); } }, { global: true }); for (let i = 0; i < 3; i++) G.plane(tg.mat, K.x0 + 0.6 + i * (K.w - 1.2) / 2, 1.5, K.z0 + 0.02, 0.45, 0.58, { uvRect: tg.rect }); }
    lockers(ctx, K.x1 - 0.5, K.z1 - 0.02, Math.PI, 2); breakerPanel(ctx, K.x0 + 0.02, 1.5, K.cz, Math.PI / 2); wallClock(ctx, K.cx, 2.4, K.z1 - 0.005, Math.PI);
    { const sp = P.spans(O, 'back', 1.2)[0] || P.spans(O, null, 1.2)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); officeDesk(ctx, at.x, at.z, at.ry, { w: Math.min(1.3, sp.len - 0.1) }); } safe(ctx, O.x1 - 0.45, O.z1 - 0.45, Math.PI, { w: 0.8, h: 1.5 }); dvr(ctx, O.x0 + 0.35, 0.75, O.cz, Math.PI / 2); }
    { const sp = P.spans(WC, 'back', 1)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) }); } }
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: S.ceilY }, at: { x: 0, y: 1.5, z: S.cz }, size: 256 };
    void stockRack;
  },
  staff() { return [{ role: 'clerk', post: 'post', routine: ['ring', 'show-case'] }]; },
  behaviors: { customers: ['browse', 'case', 'pay', 'leave'] },
});
