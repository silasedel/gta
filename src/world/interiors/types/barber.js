// Store type: barbershop / salon (r7). Claims the city's 'salon' storefronts (269, legacy rooms before) and grows them to 9-13 m.
// A row of mirror stations with hydraulic chairs down one wall (barbers behind the chairs, a client in one), waiting chairs and a
// TV on the other wall, a reception counter with the product shelf by the door, shampoo sinks at the back, the striped pole outside,
// hair on the floor around the chairs. Variants: classic barber (checker floor, red leather), fade shop (black, LED), barbería
// (Latin, mint and wood), beauty salon (white and blush).
import * as THREE from 'three';
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp } from '../kit/util.js';
import { checkout, trashCan, cctvDome, exitSign, floorMat, wallFan } from '../fixtures/retail.js';
import { officeDesk, restroom, lockers, wallClock, breakerPanel, stockRack } from '../fixtures/backroom.js';
import { barberChair, barberStation, waitingChairs, barberPole, tv } from '../fixtures/specialty.js';
import { tallWall } from '../fixtures/aisles.js';
import { family } from '../fixtures/retail.js';
import { DEPT as D } from '../items/range.js';

const VARIANTS = [
  { key: 'classic', names: ["Sal's Barber Shop", 'Corner Cuts', 'Gentleman Jack Barbers', 'Clean Line Barbers'], floor: ['vct', { c: [236, 232, 224], c2: [24, 24, 28] }], wall: [236, 230, 214], wain: ['woodPanel', { c: [110, 70, 40] }], chair: [130, 20, 24], lamp: 'neutral', pole: true, font: 'script', pal: ['#c8102e', '#1554c0', '#ffffff'] },
  { key: 'fade', names: ['Fade Factory', 'Sharp Lines Studio', 'Blendz', 'The Cut Lab'], floor: ['stoneTile', { c: [40, 40, 44], c2: [70, 70, 74] }], wall: [30, 30, 34], chair: [20, 20, 22], lamp: 'coolwhite', neon: '#35c6f4', font: 'impact', pal: ['#16181c', '#35c6f4', '#ffffff'] },
  { key: 'barberia', names: ['Barbería El Tumbao', 'Barbería La Esquina', 'Los Primos Barbería'], floor: ['cubanTile', {}], wall: [168, 220, 200], wain: ['woodPanel', { c: [150, 108, 70] }], chair: [30, 60, 50], lamp: 'warm', pole: true, font: 'casual', pal: ['#1f7a3d', '#ffd21f', '#c8102e'] },
  { key: 'salon', names: ['Blush Hair Studio', 'Salon Marisol', 'Glow Beauty Bar', 'Shear Bliss'], floor: ['wood', { c: [200, 180, 160] }], wall: [244, 232, 228], chair: [236, 232, 226], lamp: 'warm', font: 'script', pal: ['#ff8fae', '#16181c', '#ffffff'], salon: true },
];

registerStoreType({
  type: 'barber', label: 'Barbershop', kinds: ['salon', 'hairdresser', 'barber', 'beauty'], minSize: { w: 5.5, d: 7 }, variants: VARIANTS.length,
  match(sf, { kind }) { return /salon|hairdresser|barber|beauty/.test(kind) ? 0.8 : 0; },
  depth(sf, { room, seed }) { return clamp(room, 9.5, 9.5 + (seed % 4)); },
  profile(base, { R, sf }) { const v = VARIANTS[/beauty/.test(sf?.kind || '') ? 3 : base.variant % VARIANTS.length];
    return { v, name: R.pick(v.names), tier: v.key === 'fade' || v.key === 'salon' ? 'mid' : 'budget', wear: v.key === 'classic' || v.key === 'barberia' ? R.range(0.3, 0.6) : R.range(0.05, 0.25), accent: v.pal[0], lamp: v.lamp, hours: [9, 20], flip: R.chance(0.5), bounce: 0.5, floor: [v.floor[0], { ...v.floor[1], probe: 0.55 }], ceil: { type: v.key === 'fade' ? 'open' : 'drop', c: [24, 24, 26] },
      wall: { surf: ['paint', { c: v.wall }], wainscot: v.wain ? { h: 1.1, surf: v.wain } : null, base: '#1a1b1e' }, facade: { style: v.key === 'fade' ? 'black' : v.key === 'salon' ? 'aluminum' : 'wood' }, lore: { story: `${base.owner} has been cutting on this block since ${base.since}. Walk-ins welcome, Saturdays are a wait.` } }; },
  plan(P, ctx) {
    const p = ctx.profile, bd = clamp(P.D * 0.2, 2.2, 2.8), [back, sales] = cut(P.lot, 'back', bd), side = p.flip ? 'left' : 'right', [wc, stock] = cut(back, side, 1.7);
    P.room('sales', 'sales', sales, { h: Math.min(3.1, P.H - 0.3) });
    P.room('stock', 'stock', stock, { h: 2.7, floor: ['concrete', { c: [120, 118, 112] }], wall: { surf: ['paint', { c: [200, 198, 190] }], base: '#2a2c30' }, ceil: { type: 'drop' } });
    P.room('wc', 'restroom', wc, { h: 2.6, floor: ['ceramic', { c: [200, 200, 196] }], wall: { surf: ['paint', { c: [220, 214, 200] }], wainscot: { h: 1.2, surf: ['subway', { c: [236, 236, 230] }] } }, ceil: { type: 'gyp' } });
    P.door('sales', 'stock', { kind: 'hinged', w: 0.9, at: p.flip ? 0.8 : 0.2, staff: true }); P.door('sales', 'wc', { kind: 'hinged', w: 0.85 }); P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false });
    P.storefront({ style: p.facade.style, door: { kind: 'hinged', w: Math.min(P.doorW, 1.1), x: P.doorX }, bulkhead: 0.5, awning: p.v.pole ? { c: p.v.pal[0], c2: '#ffffff' } : null });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx, v = p.v, S = P.get('sales'); family(ctx, v.key === 'fade' ? 'black' : 'wood'); const ch = S.ceilY, doorX = P.doorX, st = doorX > 0 ? -1 : 1; // station wall: away from the door
    ctx.store.venue = { kind: 'barber', busy: [10, 19], barbers: 2 };
    // ---- stations down one wall: mirror + counter, chair 0.95 m out facing the mirror, barber standing beside it
    const face = P.spans(S, st < 0 ? 'left' : 'right', 2)[0], z0 = S.z0 + 1.6, z1 = S.z1 - 1.4; let nSt = 0;
    if (face) { const a = Math.max(face.a, z0), b = Math.min(face.b, z1), n = clamp(Math.floor((b - a) / 1.55), 1, 6), pitch = (b - a) / n;
      for (let i = 0; i < n; i++) { const u = a + (i + 0.5) * pitch, at = P.onFace(face.face, u, 0); barberStation(ctx, at.x, at.z, at.ry, { w: Math.min(1.45, pitch - 0.08), top: ['laminate', { c: v.key === 'fade' ? [20, 20, 22] : [240, 240, 236] }], cab: v.key === 'salon' ? ['laminate', { c: [244, 240, 236] }] : ['walnut', { c: [60, 40, 26] }], cape: v.key === 'salon' ? [230, 200, 200] : [20, 20, 24] });
        const c = P.onFace(face.face, u, 1.25); barberChair(ctx, c.x, c.z, c.ry + Math.PI, { c: v.chair }); ctx.poi('chair', c.x, c.z, c.ry + Math.PI, {}); const bb = P.onFace(face.face, u + pitch * 0.32, 1.35); ctx.poi('barber', bb.x, bb.z, c.ry + Math.PI / 2 * (face.face.nx || -face.face.nz), {});
        // hair clippings on the floor around the chair
        const hm = M.flat(R.pick(['#1a1210', '#2a1a10', '#3a2a1a']), { rough: 0.9 }); for (let k = 0; k < 40; k++) { const r = R.range(0.2, 0.75), an = R() * 6.3; G.box(hm, c.x + Math.cos(an) * r, ctx.FLOOR_Y + 0.003, c.z + Math.sin(an) * r, R.range(0.01, 0.03), 0.002, 0.003, { ry: R() * 3 }); }
        if (v.neon) ctx.light.led(ctx, [at.x + face.face.nx * 0.03, 1.02, at.z + face.face.nz * 0.03], [at.x + face.face.nx * 0.03, 2.2, at.z + face.face.nz * 0.03], { color: v.neon, k: 0.5, every: 1.2 });
        nSt++; if (i % 2) yield; }
      P.take(face.face, a, b); }
    yield;
    // ---- other wall: waiting chairs, TV, product shelf, framed haircut chart
    const wf = P.spans(S, st < 0 ? 'right' : 'left', 1.6)[0]; if (wf) { const a = Math.max(wf.a, S.z0 + 1.6), b = Math.min(wf.b, S.z1 - 1.6), L = b - a; if (L > 1.4) { const at = P.onFace(wf.face, a + Math.min(L, 2.6) / 2, 0); waitingChairs(ctx, at.x, at.z, at.ry, clamp(Math.floor(Math.min(L, 2.6) / 0.55), 2, 5), { c: v.key === 'salon' ? [236, 200, 196] : [24, 24, 28] }); const t = P.onFace(wf.face, a + Math.min(L, 2.6) / 2, 0.03); tv(ctx, t.x, 1.75, t.z, t.ry, 1.0, { on: true, key: 'game' });
      if (L > 3.4) { const s = P.onFace(wf.face, b - (L - 2.8) / 2, 0); tallWall(ctx, s.x, s.z, s.ry, { l: Math.min(L - 2.9, 1.8), h: 1.9, levels: 5, d: 0.25, rows: 2, block: 0.2, plan: [null, D.barber.slice(4), D.barber.slice(0, 4), D.barber.slice(4), D.barber.slice(0, 4)] }); }
      const ch2 = prints.make('cutchart', 300, 400, (g, w, h) => { g.fillStyle = '#f2ead6'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181c'; g.font = '700 28px Georgia, serif'; g.textAlign = 'center'; g.fillText('STYLES', w / 2, 40); const names = ['High Fade', 'Taper', 'Buzz', 'Pompadour', 'Caesar', 'Mohawk']; for (let i = 0; i < 6; i++) { const x = 60 + (i % 3) * 90, y = 90 + Math.floor(i / 3) * 150; g.fillStyle = '#6a4630'; g.beginPath(); g.ellipse(x, y + 30, 28, 34, 0, 0, 7); g.fill(); g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(x, y + 10 - (i === 3 ? 8 : 0), 30, 18 + (i === 3 ? 10 : 0), 0, Math.PI, 0); g.fill(); g.font = '600 15px Arial'; g.fillText(names[i], x, y + 90); } }, { global: true });
      const ca = P.onFace(wf.face, a + Math.min(L, 2.6) / 2 + 1.3, 0.012); if (ca.z < S.z1 - 0.5) G.plane(ch2.mat, ca.x, 1.75, ca.z, 0.45, 0.6, { ry: ca.ry, uvRect: ch2.rect }); } }
    // ---- reception counter by the door, price board, pole inside the window
    const rx = st * (S.w / 2 - 1.2), rz = S.z1 - 1.3, co = checkout(ctx, rx, rz, st > 0 ? -Math.PI / 2 : Math.PI / 2, { l: 1.4, top: ['laminate', { c: v.key === 'fade' ? [20, 20, 22] : [236, 232, 224] }], front: ['laminate', { c: v.key === 'salon' ? [255, 200, 214] : [60, 40, 26] }], registerSide: 1 });
    ctx.store.counterLocal = { x: rx, z: rz }; void co;
    const price = prints.menu('barberprices', [{ title: 'Cuts', items: [['Haircut', 25], ['Fade', 30], ['Kids', 18], ['Line Up', 12]] }, { title: 'Shave', items: [['Hot Towel Shave', 30], ['Beard Trim', 15], ['Eyebrows', 8]] }], { title: p.name, lit: 0, bg: v.key === 'fade' ? '#16181c' : '#f2ead6', ink: v.key === 'fade' ? '#f4efe2' : '#16181c' });
    { const bw = P.spans(S, 'back', 1.5)[0]; if (bw) { const at = P.onFace(bw.face, (bw.a + bw.b) / 2, 0.012); G.plane(price.mat, at.x, 1.7, at.z, 1.1, 0.64, { ry: at.ry, uvRect: price.rect });
      // shampoo sinks along the back wall
      const sinkM = M.flat(v.key === 'salon' ? '#f4f2ee' : '#16181c', { rough: 0.2 }); for (let k = -1; k <= 1; k += 2) { const s = P.onFace(bw.face, (bw.a + bw.b) / 2 + k * 1.1, 0); if (Math.abs(s.x) > S.w / 2 - 0.6) continue; G.at(s.x, s.z, s.ry, () => { G.boxB(M.flat('#2a2c30', {}), 0, 0, 0.25, 0.6, 0.8, 0.5); G.lathe(sinkM, [[0.04, 0], [0.22, 0.05], [0.26, 0.18], [0.27, 0.2]], 0, 0.8, 0.3, { seg: 16 }); G.cyl(M.flat('#d9dcdf', { metal: 0.9 }), 0, 1.1, 0.12, 0.012, 0.3, { seg: 6 }); ctx.solid(-0.3, 0, 0, 0.3, 1.0, 0.55, { occ: false }); });
        const c2 = P.onFace(bw.face, (bw.a + bw.b) / 2 + k * 1.1, 0.95); barberChair(ctx, c2.x, c2.z, c2.ry, { c: v.chair }); } } }
    if (!v.pole) barberPole(ctx, doorX + st * 1.0, 1.4, S.z1 - 0.2, Math.PI, {}); floorMat(ctx, doorX, S.z1 - 0.8, 1.2, 0.8, [40, 36, 32]); trashCan(ctx, doorX - st * 1.0, S.z1 - 0.4);
    // broom and dustpan, a towel cart, a wall fan in the older shops
    G.at(S.x0 + 0.3, S.z0 + 0.4, 0.3, () => { G.cyl(M.surf('wood', { c: [190, 160, 110] }), 0, 0.7, 0, 0.012, 1.3, { rz: 0.12, seg: 6 }); G.box(M.flat('#c8102e', {}), 0.08, 0.06, 0, 0.3, 0.1, 0.05); });
    if (v.key === 'classic' || v.key === 'barberia') wallFan(ctx, -st * (S.w / 2 - 0.01), ch - 0.5, S.z0 + 1.0, st * Math.PI / 2);
    cctvDome(ctx, 0, ch, S.cz); exitSign(ctx, doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI);
    const zg = S.z1 - 0.075, gl2 = ctx.front.glazed; if (gl2.length) { const b = gl2[gl2.length - 1], op = prints.neon(v.salon ? 'HAIR · NAILS' : 'BARBER', { color: v.neon || '#ff3b5c' }); for (const s of [1, -1]) G.plane(op.mat, b.x, 1.9, zg + s * 0.002, Math.min(1.0, b.w - 0.1), 0.3, { ry: s > 0 ? 0 : Math.PI, uvRect: op.rect }); ctx.light.glowPanel(ctx, b.x, 1.9, zg - 0.02, { w: 0.7, h: 0.3, color: v.neon || '#ff3b5c', k: 2.4, ry: Math.PI }); }
    const sg = prints.storeSign({ style: v.key === 'fade' ? 'channel' : 'painted', sub: v.salon ? 'HAIR · COLOR · NAILS' : 'CUTS · FADES · SHAVES', font: v.font }), sw = Math.min(P.W - 1, 5.6), sy = ctx.front.gh + ctx.front.fascia / 2; G.box(M.flat(v.pal[0], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1); G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    if (v.pole) barberPole(ctx, P.doorX + (P.doorX > 0 ? -1 : 1) * 1.4, 1.6, S.z1 + 0.14, 0, { h: 0.8 }); // outside, on the facade
    const hrs = prints.hours(); G.plane(hrs.mat, doorX + 0.7, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    ctx.gridRig(S, v.key === 'fade' ? { type: 'strip', lamp: 'coolwhite', k: 6, hang: 0.4, sx: 2.0, sz: 2.4, l: 2.4 } : { type: 'troffer', lamp: p.lamp, k: 8, sx: 2.2, sz: 2.4 });
    yield;
    // ---- back: stock (towels, supplies), restroom
    const K = P.get('stock'), WC = P.get('wc');
    { const sp = P.spans(K, 'back', 1.4)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); stockRack(ctx, at.x, at.z, at.ry, { l: Math.min(1.5, sp.len - 0.1) }); } }
    if (K.w > 2.4) { const at = { x: K.x1 - 0.7, z: K.z1 - 0.5 }; officeDesk(ctx, at.x, at.z, Math.PI, { w: 1.0 }); } lockers(ctx, K.x0 + 0.5, K.z1 - 0.02, Math.PI, 2); breakerPanel(ctx, K.x0 + 0.02, 1.5, K.cz, Math.PI / 2); wallClock(ctx, 0, 2.35, S.z0 + 0.006, 0);
    { const sp = P.spans(WC, 'back', 1)[0]; if (sp) { const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0); restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) }); } }
    ctx.probe = { box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: S.ceilY }, at: { x: 0, y: 1.5, z: S.cz }, size: 256 };
    void THREE; void rw; void nSt;
  },
  staff() { return [{ role: 'barber', post: 'barber', routine: ['cut', 'sweep'] }]; },
  behaviors: { customers: ['wait', 'chair', 'pay', 'leave'] },
});
