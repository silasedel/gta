// Store type: pawn shop (r7). Takes 40 % of the city's 'hardware' storefronts by seed (the OSM data has no pawn shops; GTA streets
// need them) and grows them to 12-16 m. A line of lit glass cases across the room is the counter (jewelry, watches, phones, a
// pistol case) with the register on it; behind it the staff zone with a long-gun wall and a cage gate; guitars down one wall,
// shelves of TVs, tools and game consoles down the other; a freestanding watch case; WE BUY GOLD neon and bars on the glass.
import { registerStoreType } from '../registry.js';
import { cut, rw } from '../plan.js';
import { clamp, hashStr } from '../kit/util.js';
import {
  family,
  checkout,
  trashCan,
  cctvDome,
  convexMirror,
  exitSign,
  floorMat,
} from '../fixtures/retail.js';
import {
  stockRack,
  officeDesk,
  safe,
  dvr,
  restroom,
  lockers,
  wallClock,
  breakerPanel,
} from '../fixtures/backroom.js';
import { displayCase, cagePartition } from '../fixtures/aisles.js';
import { guitar, tv, powerTool, fillJewelry, pistol, longGunWall } from '../fixtures/specialty.js';

const VARIANTS = [
  {
    key: 'classic',
    names: ['Gold Coast Pawn', 'Cash King Pawn', 'Lucky 7 Pawn & Gold', 'Biscayne Pawn'],
    pal: ['#c9a24a', '#16181c', '#c8102e'],
    floor: ['vct', { c: [200, 196, 186], c2: [90, 90, 96] }],
    wall: [222, 216, 200],
    lamp: 'coolwhite',
    wear: 0.6,
  },
  {
    key: 'rough',
    names: ['EZ Cash Pawn', 'Quick Loan Pawn', 'Westside Pawn & Jewelry'],
    pal: ['#ffd21f', '#c8102e', '#16181c'],
    floor: ['concrete', { c: [150, 146, 140] }],
    wall: [214, 210, 196],
    lamp: 'greenish',
    wear: 0.85,
  },
  {
    key: 'jewel',
    names: ['Diamond Row Jewelry & Loan', 'Royal Loan & Jewelry', 'Golden Palm Exchange'],
    pal: ['#1b2a6b', '#c9a24a', '#ffffff'],
    floor: ['stoneTile', { c: [210, 206, 198], c2: [150, 146, 140] }],
    wall: [236, 232, 222],
    lamp: 'neutral',
    wear: 0.2,
  },
];
const GUIT = ['#7a2a14', '#16181c', '#c8102e', '#f2f0ea', '#1b4a8a', '#d9a23a', '#2a6a3a'];

registerStoreType({
  type: 'pawn',
  label: 'Pawn shop',
  kinds: ['pawnbroker', 'pawn', 'second_hand', 'money_lender'],
  minSize: { w: 6.5, d: 8.5 },
  variants: VARIANTS.length,
  match(sf, { kind }) {
    if (/pawn|second_hand|money_lender/.test(kind)) return 0.9;
    if (kind === 'hardware' && hashStr('pawn' + (sf.id ?? sf.x)) % 100 < 40) return 0.7;
    return 0;
  },
  depth(sf, { room, seed }) {
    return clamp(room, 12, 12 + (seed % 5));
  },
  profile(base, { R }) {
    const v = VARIANTS[base.variant % VARIANTS.length];
    return {
      v,
      name: R.pick(v.names),
      tier: v.key === 'jewel' ? 'mid' : 'budget',
      wear: clamp(v.wear + R.jit(0.1), 0, 1),
      accent: v.pal[0],
      lamp: v.lamp,
      hours: [9, 20],
      flip: R.chance(0.5),
      bounce: 0.5,
      floor: [v.floor[0], { ...v.floor[1], probe: 0.45 }],
      ceil: { type: 'drop' },
      wall: {
        surf: ['paint', { c: v.wall }],
        base: '#2a2c30',
        band: { y: 2.3, h: 0.12, c: v.pal[0] },
      },
      facade: { style: v.key === 'jewel' ? 'bronze' : 'block' },
      lore: {
        story: `${base.owner} has run the loan counter since ${base.since}. Half the guitars on the wall are never coming back for.`,
      },
    };
  },
  plan(P, ctx) {
    const p = ctx.profile,
      bd = clamp(P.D * 0.2, 2.6, 3.4),
      [back, sales] = cut(P.lot, 'back', bd),
      side = p.flip ? 'left' : 'right',
      other = p.flip ? 'right' : 'left';
    const [wc, rest] = cut(back, side, 1.75),
      [office, stock] = cut(rest, other, clamp(rw(rest) * 0.4, 2, 3));
    P.room('sales', 'sales', sales, { h: Math.min(3.05, P.H - 0.3) });
    P.room('stock', 'stock', stock, {
      h: 2.8,
      floor: ['concrete', { c: [120, 118, 112] }],
      wall: { surf: ['cmu', { c: [200, 198, 190] }], base: '#2a2c30' },
      ceil: { type: 'open', c: [60, 60, 62] },
    });
    P.room('office', 'office', office, {
      h: 2.6,
      floor: ['carpet', { c: [70, 60, 56] }],
      wall: { surf: ['paint', { c: [214, 208, 190] }], base: '#3a3d42' },
      ceil: { type: 'drop' },
    });
    P.room('wc', 'restroom', wc, {
      h: 2.6,
      floor: ['quarry', { c: [120, 112, 100] }],
      wall: {
        surf: ['paint', { c: [210, 214, 200] }],
        wainscot: { h: 1.25, surf: ['subway', { c: [226, 230, 224] }] },
      },
      ceil: { type: 'gyp' },
    });
    P.door('sales', 'stock', {
      kind: 'hinged',
      w: 1.0,
      at: p.flip ? 0.85 : 0.15,
      staff: true,
      locked: false,
    });
    P.door('stock', 'wc', { kind: 'hinged', w: 0.85 });
    P.door('stock', 'office', { kind: 'hinged', w: 0.9, staff: true });
    P.door('stock', 'outside:back', { kind: 'hinged', w: 0.95, locked: true, sign: false });
    P.storefront({
      style: p.facade.style,
      door: { kind: 'hinged', w: Math.min(P.doorW, 1.2), x: P.doorX },
      bulkhead: 0.9,
      awning: p.v.key === 'jewel' ? { c: p.v.pal[0], c2: '#e8d6a8' } : null,
      bars: true,
    });
  },
  *fixtures(ctx) {
    const { G, M, plan: P, R, profile: p, prints } = ctx,
      v = p.v,
      S = P.get('sales');
    family(ctx, 'black');
    const ch = S.ceilY,
      fl = p.flip ? -1 : 1,
      doorX = P.doorX;
    ctx.store.venue = { kind: 'shop', busy: [10, 19], guests: 2 };
    // ---- counter line of glass cases across the room; staff zone behind it
    const lz = S.z0 + clamp(S.d * 0.34, 2.6, 3.6),
      gap = 1.0,
      gx = fl * (S.w / 2 - gap / 2 - 0.05); // staff gap at the stock-door end
    const x0 = S.x0 + (fl < 0 ? gap + 0.1 : 0.15),
      x1 = S.x1 - (fl > 0 ? gap + 0.1 : 0.15),
      regL = 1.6,
      n = Math.max(1, Math.floor((x1 - x0 - regL) / 1.8)),
      cw = (x1 - x0 - regL) / n;
    const kinds = ['jewelry', 'watch', 'phone', 'gun', 'jewelry'],
      regX = fl > 0 ? x1 - regL / 2 : x0 + regL / 2;
    const co = checkout(ctx, regX, lz, 0, {
      l: regL,
      top: ['laminate', { c: [30, 30, 34] }],
      front: ['laminate', { c: [24, 24, 28] }],
      registerSide: -fl,
    });
    ctx.store.counterLocal = { x: regX, z: lz };
    ctx.poi('counter', co.clerk.x, co.clerk.z, co.clerk.ry, {});
    for (let i = 0; i < n; i++) {
      const cx = (fl > 0 ? x0 : x0 + regL) + (i + 0.5) * cw,
        k = kinds[(i + R.int(0, 1)) % kinds.length];
      displayCase(ctx, cx, lz, 0, {
        l: cw - 0.04,
        deckC: k === 'gun' ? [40, 60, 40] : [24, 24, 30],
        fill: (a, b, y) => {
          if (k === 'gun') {
            for (let u = a + 0.12; u < b - 0.1; u += 0.24)
              pistol(ctx, u, y, R.jit(0.05), R.pick([0.1, -0.1, Math.PI / 2]), {
                c: R.pick(['#16181c', '#2a2c30', '#3a3a32']),
                slide: R.pick(['#1e2024', '#b9bec3']),
              });
          } else fillJewelry(ctx, a, b, y, 0, k);
        },
      });
    }
    yield;
    // staff zone: long-gun wall (or guitars) on the back wall, a TV playing the news, cage gate at the gap, safe and DVR on the shelf
    for (const sp of P.spans(S, 'back', 1.4)) {
      const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0);
      if (R.chance(0.6) && sp.len > 2)
        longGunWall(ctx, at.x, at.z, at.ry, {
          l: Math.min(sp.len - 0.2, 4),
          h: Math.min(2.4, ch - 0.3),
        });
      else
        G.at(at.x, at.z, at.ry, () => {
          for (let u = -sp.len / 2 + 0.35, i = 0; u < sp.len / 2 - 0.3; u += 0.42, i++)
            guitar(ctx, u, 2.35, 0.02, 0, { c: GUIT[i % GUIT.length] });
        });
      P.take(sp.face, sp.a, sp.b);
    }
    cagePartition(ctx, gx - gap / 2, gx + gap / 2, lz, 2.1);
    dvr(ctx, -fl * (S.w / 2 - 0.4), 0.0, S.z0 + 0.3, 0);
    tv(ctx, -fl * (S.w / 2 - 0.6), 2.0, S.z0 + 0.15, 0, 0.7, { on: true, key: 'news' });
    yield;
    // ---- customer zone: guitars hung down one wall, shelves of TVs / tools / consoles down the other
    const zA = lz + 0.9,
      zB = S.z1 - 1.0;
    for (const side of ['left', 'right'])
      for (const sp of P.spans(S, side, 1.2)) {
        const a = Math.max(sp.a, zA),
          b = Math.min(sp.b, zB);
        if (b - a < 1.2) continue;
        const at = P.onFace(sp.face, (a + b) / 2, 0),
          L = b - a;
        if ((side === 'left') === fl > 0)
          G.at(at.x, at.z, at.ry, () => {
            for (let u = -L / 2 + 0.25, i = 0; u < L / 2 - 0.2; u += 0.4, i++)
              guitar(ctx, u, 2.4, 0.02, 0, {
                c: GUIT[(i * 3 + 1) % GUIT.length],
                bass: i % 4 === 3,
              });
            G.boxB(M.flat('#2a2c30', { rough: 0.5 }), 0, 0, 0.25, L, 0.45, 0.5);
            for (let u = -L / 2 + 0.4; u < L / 2 - 0.3; u += 0.7) {
              G.boxB(M.flat('#16181c', { rough: 0.6 }), u, 0.45, 0.25, 0.5, 0.42, 0.3);
              G.box(M.surf('fabric', { c: [40, 40, 44] }), u, 0.66, 0.4, 0.42, 0.32, 0.01);
            }
            ctx.solid(-L / 2, 0, 0, L / 2, 0.9, 0.55, { occ: false });
            ctx.poi('browse', 0, 1.0, Math.PI, {});
          });
        else
          G.at(at.x, at.z, at.ry, () => {
            const st = M.flat('#9aa0a6', { metal: 0.6, rough: 0.4 });
            for (const y of [0.05, 0.75, 1.45]) G.boxB(st, 0, y, 0.25, L, 0.03, 0.5);
            for (const u of [-L / 2 + 0.03, L / 2 - 0.03]) G.boxB(st, u, 0, 0.25, 0.04, 2.1, 0.5);
            for (let u = -L / 2 + 0.5; u < L / 2 - 0.4; u += 1.0) {
              tv(ctx, u, 1.48, 0.25, R.jit(0.1), R.range(0.55, 0.85), { on: R.chance(0.3) });
              tv(ctx, u + R.jit(0.1), 0.78, 0.25, R.jit(0.15), R.range(0.5, 0.7));
            }
            for (let u = -L / 2 + 0.3; u < L / 2 - 0.2; u += 0.32)
              powerTool(
                ctx,
                u,
                0.08,
                0.25 + R.jit(0.08),
                R() * 6,
                R.pick(['#e8b81e', '#c8102e', '#1f7a3d', '#1554c0']),
              );
            ctx.solid(-L / 2, 0, 0, L / 2, 2.1, 0.52);
            ctx.shadow(0, 0.25, L, 0.7);
            ctx.poi('browse', 0, 1.0, Math.PI, {});
          });
        yield;
      }
    // freestanding watch case in the middle, mats, cameras, notices
    if (zB - zA > 2.2 && S.w > 6.5)
      displayCase(ctx, -doorX * 0.3, (zA + zB) / 2, 0, {
        l: 1.4,
        fill: (a, b, y) => fillJewelry(ctx, a, b, y, 0, 'watch'),
      });
    floorMat(ctx, doorX, S.z1 - 0.9, 1.4, 0.9, [40, 36, 32]);
    trashCan(ctx, doorX + 1.3, S.z1 - 0.4);
    for (const [x, z] of [
      [0, lz - 0.6],
      [doorX, S.z1 - 0.7],
      [S.x0 + 1, zA + 1],
    ])
      cctvDome(ctx, x, ch, z);
    convexMirror(ctx, S.x1 - 0.25, ch - 0.4, lz + 0.6, -Math.PI / 4);
    exitSign(ctx, doorX, Math.min(ch - 0.12, ctx.front.gh + 0.25), S.z1 - 0.24, Math.PI);
    for (const [k, x] of [
      ['nocash', -1.2],
      ['camera', 0.2],
      ['wecard', 1.2],
    ]) {
      const nt = prints.notice(k);
      G.plane(nt.mat, x, 2.0, S.z0 + 0.006, 0.3, 0.23, { uvRect: nt.rect, rz: R.jit(0.03) });
    }
    const zg = S.z1 - 0.075,
      gl2 = ctx.front.glazed;
    for (const [i, t, c] of [
      [0, 'WE BUY GOLD', '#ffd21f'],
      [gl2.length - 1, 'PAWN', '#ff3b5c'],
    ]) {
      const b = gl2[i];
      if (!b || (i && gl2.length < 2)) continue;
      const op = prints.neon(t, { color: c });
      for (const s of [1, -1])
        G.plane(op.mat, b.x, 1.95, zg + s * 0.002, Math.min(1.1, b.w - 0.1), 0.3, {
          ry: s > 0 ? 0 : Math.PI,
          uvRect: op.rect,
        });
      ctx.light.glowPanel(ctx, b.x, 1.95, zg - 0.02, {
        w: 0.7,
        h: 0.3,
        color: c,
        k: 2.4,
        ry: Math.PI,
      });
    }
    const sg = prints.storeSign({
        style: 'box',
        sub: 'LOANS · GOLD · GUNS · MUSIC',
        font: v.key === 'jewel' ? 'serif' : 'impact',
      }),
      sw = Math.min(P.W - 1, 6.2),
      sy = ctx.front.gh + ctx.front.fascia / 2;
    G.box(M.flat(v.pal[1], { rough: 0.5 }), 0, sy, S.z1 + 0.06, sw + 0.12, sw / 5.2 + 0.1, 0.1);
    G.plane(sg.mat, 0, sy, S.z1 + 0.112, sw, sw / 5.2, { uvRect: sg.rect });
    const hrs = prints.hours();
    G.plane(hrs.mat, doorX + 0.75, 1.35, S.z1 - 0.02, 0.3, 0.36, { uvRect: hrs.rect });
    ctx.gridRig(S, { type: 'troffer', lamp: p.lamp, k: 8.5, sx: 2.4, sz: 2.4 });
    yield;
    // ---- back of house: racks of pawned goods (tagged boxes, TVs), safe, office
    const K = P.get('stock'),
      O = P.get('office'),
      WC = P.get('wc');
    for (const sp of P.spans(K, 'back', 1.4)) {
      const nn = Math.floor(sp.len / 1.6);
      for (let i = 0; i < nn; i++) {
        const at = P.onFace(sp.face, sp.a + ((i + 0.5) * sp.len) / nn, 0);
        stockRack(ctx, at.x, at.z, at.ry, { l: 1.45 });
      }
    }
    safe(ctx, K.x1 - 0.45, K.z1 - 0.45, Math.PI, { w: 0.8, h: 1.3 });
    lockers(ctx, K.x0 + 0.55, K.z0 + 0.02, 0, 2);
    breakerPanel(ctx, K.x0 + 0.02, 1.5, K.cz, Math.PI / 2);
    wallClock(ctx, K.cx, 2.3, K.z0 + 0.005, 0);
    {
      const sp = P.spans(O, 'back', 1.2)[0] || P.spans(O, null, 1.2)[0];
      if (sp) {
        const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0);
        officeDesk(ctx, at.x, at.z, at.ry, { w: Math.min(1.3, sp.len - 0.1) });
      }
    }
    {
      const sp = P.spans(WC, 'back', 1)[0];
      if (sp) {
        const at = P.onFace(sp.face, (sp.a + sp.b) / 2, 0);
        restroom(ctx, at.x, at.z, at.ry, { w: Math.min(1.6, sp.len) });
      }
    }
    ctx.probe = {
      box: { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: 0, y1: S.ceilY },
      at: { x: 0, y: 1.5, z: S.cz },
      size: 256,
    };
  },
  staff() {
    return [{ role: 'clerk', post: 'post', routine: ['ring', 'appraise'] }];
  },
  behaviors: { customers: ['browse', 'case', 'pay', 'leave'] },
});
