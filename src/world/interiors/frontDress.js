// Storefront dressing (shops pass, Nov 17): what a passer-by sees of a shop from the street, on top of facade.js.
//   scallopAwning(ctx, o)   3D striped canvas awning: fabric sags between the frame ribs, scalloped valance, side cheeks, rails
//   dressFront(ctx, def)    depth (projecting pilasters, sill ledge, cornice), the brand sign on the fascia, a blade sign,
//                           window lettering / posters / OPEN neon / stickers on the glass, a roll-down security shutter on some
//                           shops (housing + guides; the curtain is down while the store is closed)
// All of it goes into the interior's merged Geo (one draw per material), lit by the same bake as the rest of the store.
import * as THREE from 'three';
const isOpenAt = (h, hrs) => {
  const [o, c] = hrs;
  if (c - o >= 24) return true;
  return o < c ? h >= o && h < c : h >= o || h < c;
}; // same rule as engine.js (no import cycle)

// ---------------------------------------------------------------- 3D awning
// o: { x, w, y (top at the wall), out, drop, z (wall face), fab: print { mat, rect } | null, mat (fallback fabric), rail }
export function scallopAwning(ctx, o) {
  const { G, M } = ctx,
    aw = o.w,
    out = o.out,
    drop = o.drop,
    zl = o.z,
    ax = o.x,
    ay = o.y;
  const ribs = Math.max(2, Math.round(aw / 1.25)),
    nu = Math.max(24, Math.round(aw * 14)),
    nv = 8,
    sag = 0.045,
    scW = aw / Math.max(4, Math.round(aw / 0.42)),
    vh = 0.2,
    sc = 0.075;
  const mat = o.fab ? o.fab.mat : o.mat,
    rect = o.fab ? o.fab.rect : null;
  const pos = [],
    nor = [],
    uv = [],
    idx = [];
  const P = (u, t) => {
    const x = -aw / 2 + u * aw,
      rib = (u * ribs) % 1,
      s =
        sag * Math.sin(Math.PI * t) * (0.5 - 0.5 * Math.cos(2 * Math.PI * rib)) +
        0.012 * Math.sin(u * 37.0) * t;
    return [ax + x, ay - drop * t - s, zl + 0.03 + out * t - s * 0.25];
  };
  // slope
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu,
        t = j / nv,
        p = P(u, t);
      pos.push(...p);
      nor.push(0, out, drop);
      uv.push(u, 1 - t * 0.85);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i,
        b = a + 1,
        c = a + nu + 1,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // valance with a scalloped hem
  const v0 = pos.length / 3;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu,
      p = P(u, 1),
      x = p[0] - ax + aw / 2,
      f = (x / scW) % 1,
      hem = vh + sc * Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
    pos.push(p[0], p[1], p[2], p[0], p[1] - hem, p[2] + 0.004);
    nor.push(0, 0, 1, 0, 0, 1);
    uv.push(u, 0.14, u, 0.0);
  }
  for (let i = 0; i < nu; i++) {
    const a = v0 + i * 2,
      b = a + 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const back = geo.clone();
  const bi = back.index.array;
  for (let k = 0; k < bi.length; k += 3) {
    const t = bi[k + 1];
    bi[k + 1] = bi[k + 2];
    bi[k + 2] = t;
  }
  const bn = back.attributes.normal.array;
  for (let k = 0; k < bn.length; k++) bn[k] = -bn[k];
  G.add(mat, geo, null, rect ? { uvRect: rect } : null);
  G.add(mat, back, null, rect ? { uvRect: rect } : null);
  // side cheeks (triangles of the end stripe color)
  for (const s of [-1, 1]) {
    const x = ax + (s * aw) / 2,
      cg = new THREE.BufferGeometry(),
      a = [x, ay, zl + 0.03],
      b = [x, ay - drop, zl + 0.03 + out],
      c = [x, ay - drop - vh, zl + 0.034 + out],
      d = [x, ay - drop * 0.35 - 0.05, zl + 0.03];
    cg.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3),
    );
    cg.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([s, 0, 0]).flat(), 3));
    cg.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [0.02, 1, 0.02, 0.15, 0.02, 0, 0.02, 1, 0.02, 0, 0.02, 0.6],
        2,
      ),
    );
    const cb = cg.clone();
    cb.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...a, ...c, ...b, ...a, ...d, ...c], 3),
    );
    cb.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(Array(6).fill([-s, 0, 0]).flat(), 3),
    );
    G.add(mat, cg, null, rect ? { uvRect: rect } : null);
    G.add(mat, cb, null, rect ? { uvRect: rect } : null);
  }
  // frame: front bar, wall bar, ribs under the canvas, two drop arms to the wall
  const pm = o.rail || M.flat('#2a2c30', { rough: 0.45, metal: 0.7 }),
    len = Math.hypot(out, drop),
    ang = Math.atan2(drop, out);
  G.cyl(pm, ax, ay - drop - 0.02, zl + 0.03 + out - 0.02, 0.016, aw, { rz: Math.PI / 2, seg: 8 });
  G.cyl(pm, ax, ay - 0.03, zl + 0.05, 0.02, aw, { rz: Math.PI / 2, seg: 8 });
  for (let k = 0; k <= ribs; k++) {
    const x = ax - aw / 2 + (k * aw) / ribs;
    G.cyl(pm, x, ay - drop / 2 - 0.03, zl + 0.03 + out / 2, 0.011, len, {
      rx: ang - Math.PI / 2,
      seg: 6,
    });
  }
  for (const s of [-1, 1]) {
    const x = ax + s * (aw / 2 - 0.05);
    G.cyl(pm, x, ay - drop - 0.375, zl + 0.03 + out * 0.475, 0.012, Math.hypot(out * 0.95, 0.75), {
      rx: Math.atan2(out * 0.95, 0.75),
      seg: 6,
    });
  }
}

// ---------------------------------------------------------------- the rest of the street face
const NO_SIGN = new Set(['gas-convenience', 'nightclub']);
const PROMOS = {
  boutique: [
    ['NEW SEASON', 'SALE', 'UP TO 40% OFF'],
    ['RESORT', 'LINEN', 'JUST ARRIVED'],
    ['TODAY ONLY', '2 FOR 1', 'TEES + TANKS'],
  ],
  cafe: [
    ['TRY OUR', 'CAFECITO', 'ONLY $1.50'],
    ['FRESH', 'PASTELITOS', 'BAKED DAILY'],
    ['ICED', 'CAFE CON LECHE', 'ALL DAY'],
  ],
  restaurant: [
    ['LUNCH', 'SPECIAL', '11 AM - 3 PM'],
    ['FRESH CATCH', 'FRIDAY', 'MARKET PRICE'],
    ['NOW', 'DELIVERING', 'CALL AHEAD'],
  ],
  bar: [
    ['HAPPY HOUR', '4 - 7', '$3 DRAFTS'],
    ['LIVE', 'MUSIC', 'FRI + SAT'],
    ['GAME', 'NIGHT', 'ON 6 SCREENS'],
  ],
  lobby: [],
  'gas-convenience': [],
  nightclub: [],
};
const STICKERS = [
  ['#1a4fa0', 'VISA'],
  ['#e8a020', 'CARDS'],
  ['#2a8a4a', 'EBT'],
  ['#c83030', 'NO SMOKING'],
  ['#333', 'CCTV'],
];

export function dressFront(ctx, def) {
  const { G, M, plan, profile: p, R, prints } = ctx,
    F = plan.front,
    front = ctx.front;
  if (!F || !front) return;
  const W = plan.W,
    H = plan.H,
    zl = front.zl,
    gh = front.gh,
    fas = H - gh,
    pier = F.pier ?? 0.3,
    st = front.st || {},
    wear = p.wear || 0;
  const pierM = front.pierM,
    fasM = front.fasM || pierM,
    frM = front.frM,
    accent = p.accent || '#3a6';
  // ---- depth: pilasters standing proud of the piers, a sill ledge on the bulkhead, a molding under the sign band, a cornice
  if (pierM)
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - pier / 2);
      G.box(pierM, x, gh / 2, zl + 0.1, pier + 0.06, gh, 0.14);
      G.box(pierM, x, 0.22, zl + 0.13, pier + 0.12, 0.44, 0.2);
      ctx.colliders.push([x, gh / 2, zl + 0.1, (pier + 0.06) / 2, gh / 2, 0.07]);
    }
  if (fasM) {
    G.box(fasM, 0, gh + fas / 2, zl + 0.055, W - 0.02, fas, 0.04); // sign band face (the fascia box sits inside its own bake occluder and reads black)
    G.box(fasM, 0, gh + 0.05, zl + 0.1, W + 0.06, 0.1, 0.16);
    G.box(fasM, 0, H - 0.07, zl + 0.13, W + 0.2, 0.14, 0.22);
    G.box(fasM, 0, H - 0.18, zl + 0.08, W + 0.1, 0.08, 0.12);
  }
  if (frM)
    for (const b of front.glazed || [])
      G.box(frM, b.x, b.y0 - 0.01, zl + 0.02, b.w + 0.08, 0.035, 0.16); // sill under each bay
  // ---- brand sign on the fascia (types that paint their own sign skip this)
  if (!NO_SIGN.has(def.type) && fas > 0.42 && prints) {
    const lo = ctx.store?.sf?.shellAwning ? gh + 0.36 : gh + 0.1,
      sw = Math.min(W - 2 * pier - 0.4, 5.6),
      sh = Math.min((H - 0.12 - lo) * 0.88, sw / 3.2),
      style =
        p.v?.key === 'luxe'
          ? 'channel'
          : p.v?.key === 'street'
            ? 'box'
            : wear > 0.5
              ? 'painted'
              : R.pick(['box', 'channel', 'painted', 'box']);
    const sg = prints.storeSign({
        style,
        aspect: sw / sh,
        font: p.v?.font === 'script' ? 'script' : undefined,
        upper: style === 'channel' && p.v?.font !== 'script',
      }),
      sy = (lo + H - 0.12) / 2;
    if (style === 'box') {
      G.box(
        M.flat('#1c1d20', { rough: 0.4, metal: 0.6 }),
        0,
        sy,
        zl + 0.14,
        sw + 0.1,
        sh + 0.1,
        0.12,
      );
      G.plane(sg.mat, 0, sy, zl + 0.202, sw, sh, { uvRect: sg.rect });
    } else if (style === 'channel') {
      G.plane(sg.mat, 0, sy, zl + 0.1, sw, sh, { uvRect: sg.rect });
      G.plane(sg.mat, 0, sy - 0.006, zl + 0.094, sw, sh, { uvRect: sg.rect });
    } else {
      G.box(M.flat(accent, { rough: 0.7 }), 0, sy, zl + 0.09, sw + 0.16, sh + 0.12, 0.03);
      G.plane(sg.mat, 0, sy, zl + 0.107, sw, sh, { uvRect: sg.rect });
    }
    if (style !== 'box')
      for (const s of [-1, 1]) {
        const lx = s * sw * 0.32,
          lm = M.flat('#26282c', { rough: 0.4, metal: 0.7 }); // gooseneck lamps over unlit signs
        G.tube(
          lm,
          [
            [lx, gh + fas - 0.05, zl + 0.04],
            [lx, gh + fas + 0.12, zl + 0.2],
            [lx, gh + fas + 0.05, zl + 0.42],
          ],
          0.012,
          { segs: 8 },
        );
        G.cyl(lm, lx, gh + fas - 0.0, zl + 0.44, 0.09, 0.07, { r2: 0.03, seg: 10 });
        G.box(M.glow('#ffe2b0', 2.2, 1), lx, gh + fas - 0.04, zl + 0.44, 0.1, 0.004, 0.1);
        if (ctx.light?.glowPanel)
          ctx.light.glowPanel(ctx, lx, gh + fas - 0.1, zl + 0.4, {
            w: 0.5,
            h: 0.4,
            color: '#ffd9a0',
            k: 2.4,
            ry: Math.PI,
            ch: 1,
          });
      } // lamps wash the sign (accent circuit: lit at night)
    if (R.chance(0.45) && W > 4.5) {
      // blade sign on a bracket, read from down the sidewalk
      const bx = (R.chance(0.5) ? -1 : 1) * (W / 2 - pier / 2),
        by = gh - 0.35,
        bl = prints.make(
          'blade:' + ctx.store.key,
          200,
          200,
          (g, w, h) => {
            g.fillStyle = css(accent);
            g.fillRect(0, 0, w, h);
            g.strokeStyle = 'rgba(255,255,255,0.85)';
            g.lineWidth = 6;
            g.strokeRect(10, 10, w - 20, h - 20);
            g.fillStyle = '#fff';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            const words = String(ctx.store.name || '')
              .toUpperCase()
              .split(/\s+/)
              .slice(0, 3);
            const fs = Math.min(46, 260 / Math.max(...words.map((s) => s.length), 4));
            g.font = `700 ${fs}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
            words.forEach((wd, i) =>
              g.fillText(wd, w / 2, h / 2 + (i - (words.length - 1) / 2) * fs * 1.1),
            );
          },
          { lit: 0.6 },
        );
      const bm = M.flat('#222428', { rough: 0.4, metal: 0.7 });
      G.box(bm, bx, by + 0.36, zl + 0.45, 0.03, 0.03, 0.8);
      G.box(bm, bx, by + 0.2, zl + 0.08, 0.06, 0.4, 0.06);
      for (const s of [1, -1])
        G.plane(bl.mat, bx, by, zl + 0.5, 0.55, 0.55, { ry: (s * Math.PI) / 2, uvRect: bl.rect });
      G.box(M.flat(accent, { rough: 0.6 }), bx, by, zl + 0.5, 0.025, 0.57, 0.57);
    }
  }
  // ---- the glass: name lettering on one bay, posters / promos, OPEN neon, small stickers near the door
  const bays = (front.glazed || [])
      .slice()
      .sort((a, b) => Math.abs(b.x - F.door.x) - Math.abs(a.x - F.door.x)),
    zg = zl - 0.075;
  const promos = PROMOS[def.type] ?? PROMOS.boutique;
  let used = 0;
  bays.forEach((b, i) => {
    if (b.w < 0.6) return;
    const back = (x, y, w, h) =>
      G.plane(M.flat('#f2efe6', { rough: 0.9 }), x, y, zg - 0.002, w, h, { ry: Math.PI });
    if (i === 0 && prints && def.type !== 'gas-convenience') {
      // gold / white lettering across the widest far bay
      const lt = prints.make(
        'glassname:' + ctx.store.key,
        512,
        128,
        (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.fillStyle = wear > 0.4 ? 'rgba(255,255,255,0.92)' : '#e8c47a';
          g.strokeStyle = 'rgba(40,30,10,0.55)';
          g.lineWidth = 3;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const nm = String(ctx.store.name || '');
          g.font = `600 ${Math.min(70, 900 / Math.max(6, nm.length))}px Georgia, "Times New Roman", serif`;
          g.strokeText(nm, w / 2, h * 0.42);
          g.fillText(nm, w / 2, h * 0.42);
          g.font = '500 22px "Avenir Next", Arial, sans-serif';
          g.fillText(`EST. ${p.since || 1987}`, w / 2, h * 0.82);
        },
        { alpha: true, lit: 0.05 },
      );
      const lw = Math.min(b.w - 0.12, 1.9);
      G.plane(lt.mat, b.x, Math.min(b.y1 - 0.35, 1.75), zl - 0.055, lw, lw / 4, {
        uvRect: lt.rect,
      });
      return;
    }
    if (used < 2 && promos.length && prints && (i % 2 === 1 || b.w > 1.4) && R.chance(0.8)) {
      used++;
      const pr = R.pick(promos),
        q = prints.promo(pr[0], pr[1], pr[2], {
          bg: R.pick(['#ffd21f', '#ffffff', '#ff6f59', '#1fa3a3', '#f4efe2']),
          band: accent,
        });
      const pw = Math.min(0.62, b.w - 0.2),
        ph = pw * 0.69,
        px = b.x + R.jit(Math.max(0, (b.w - pw) / 2 - 0.08)),
        py = b.y0 + 0.35 + ph / 2;
      G.plane(q.mat, px, py, zg, pw, ph, { uvRect: q.rect });
      back(px, py, pw, ph);
    }
    if (i === bays.length - 1 && prints) {
      // nearest bay to the door: OPEN neon + payment stickers
      if (!p.noOpenSign) {
        const on = prints.neon('OPEN', { color: R.pick(['#ff3b5c', '#35c6f4', '#ff3b5c']) });
        G.plane(on.mat, b.x, Math.min(b.y1 - 0.4, 1.7), zg - 0.05, 0.62, 0.26, { uvRect: on.rect });
        if (ctx.light?.glowPanel)
          ctx.light.glowPanel(ctx, b.x, Math.min(b.y1 - 0.4, 1.7), zg - 0.07, {
            w: 0.55,
            h: 0.22,
            color: '#ff4060',
            k: 1.4,
            ry: Math.PI,
          });
      }
      const sx = F.door.x + Math.sign(b.x - F.door.x) * (F.door.w / 2 + 0.16);
      STICKERS.slice(0, 2 + ((R() * 3) | 0)).forEach(([c, t], k) => {
        const s = prints.make(
          'stk:' + t,
          96,
          64,
          (g, w, h) => {
            g.fillStyle = '#fff';
            g.fillRect(0, 0, w, h);
            g.fillStyle = c;
            g.fillRect(4, 4, w - 8, h - 8);
            g.fillStyle = '#fff';
            g.font = '700 20px Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(t, w / 2, h / 2, w - 12);
          },
          { global: true },
        );
        G.plane(s.mat, sx, 1.05 + k * 0.1, zl - 0.054, 0.12, 0.08, { uvRect: s.rect });
      });
    }
  });
  // ---- roll-down security shutter (budget / worn stores and a share of the rest): housing + guides; the curtain closes after hours
  if (
    front.zl &&
    !F.awning &&
    !ctx.store?.sf?.shellAwning &&
    (wear > 0.45 || R.chance(0.22)) &&
    !p.v?.chandelier
  ) {
    const x0 = -W / 2 + pier,
      x1 = W / 2 - pier,
      sw = x1 - x0,
      hm = M.flat(wear > 0.5 ? '#8a8b86' : '#5e6166', { rough: 0.55, metal: 0.6 });
    G.box(hm, 0, gh + 0.14, zl + 0.2, sw + 0.06, 0.32, 0.3);
    G.box(hm, 0, gh - 0.04, zl + 0.2, sw + 0.06, 0.04, 0.28);
    for (const s of [x0 + 0.04, x1 - 0.04]) G.box(hm, s, gh / 2, zl + 0.08, 0.07, gh, 0.08);
    const tex =
      prints &&
      prints.make(
        'shutter:' + ctx.store.key,
        256,
        256,
        (g, w, h) => {
          const r = mulberry(ctx.store.seed >>> 0);
          g.fillStyle = wear > 0.5 ? '#9a9c98' : '#b8bbbd';
          g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 8) {
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.fillRect(0, y, w, 2);
            g.fillStyle = 'rgba(0,0,0,0.28)';
            g.fillRect(0, y + 6, w, 2);
          }
          for (let k = 0; k < 40 * (0.3 + wear); k++) {
            g.fillStyle = `rgba(${(90 + r() * 60) | 0},${(60 + r() * 30) | 0},${(30 + r() * 20) | 0},${0.1 + r() * 0.25})`;
            g.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 4);
          }
          if (wear > 0.35 || r() < 0.4)
            for (let k = 0; k < 2 + ((r() * 3) | 0); k++) {
              g.strokeStyle = ['#e03070', '#30c0f0', '#f0e030', '#111', '#40e070'][(r() * 5) | 0];
              g.lineWidth = 3 + r() * 5;
              g.lineCap = 'round';
              g.beginPath();
              let x = 20 + r() * (w - 80),
                y = 60 + r() * (h - 100);
              g.moveTo(x, y);
              for (let s = 0; s < 6; s++) {
                x += 8 + r() * 22;
                y += (r() - 0.5) * 50;
                g.quadraticCurveTo(x - 10, y - 30 * r(), x, y);
              }
              g.stroke();
            }
        },
        { rough: 0.5 },
      );
    const T = shutterTex(),
      graf = wear > 0.5 || R.chance(0.35),
      ut = T ? (graf ? T.graffiti : T.plain) : null; // the user's Shutter 1 curtains (tools/v2/shops/shutter_tex.py)
    const smat = ut ? M.page(ut, { rough: 0.55 }) : tex?.mat,
      srect = ut
        ? graf
          ? [0, 0, 1, 1]
          : [0, 0, Math.max(1, Math.round((sw - 0.04) / 1.5)), 1]
        : tex?.rect;
    if (smat) {
      const sh = ctx.dyn(0, 0, 0, 0, (LG) => {
        LG.plane(smat, 0, gh / 2, zl + 0.085, sw - 0.04, gh - 0.04, { uvRect: srect });
        LG.box(hm, 0, 0.03, zl + 0.085, sw - 0.04, 0.06, 0.05);
      });
      sh.visible = false;
      ctx.anim.push((dt, t, store, hour) => {
        const closed = !(store.hours ? isOpenAt(hour, store.hours) : true);
        if (sh.visible !== closed) sh.visible = closed;
      });
    }
  }
}
let SHT = null;
function shutterTex() {
  if (SHT) return SHT.ok ? SHT : null;
  SHT = { ok: true };
  try {
    const L = new THREE.TextureLoader();
    for (const k of ['plain', 'graffiti']) {
      const t = L.load(
        `${(import.meta.env && import.meta.env.BASE_URL) || '/'}assets/models/shops/shutter_${k}.webp`,
      );
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (k === 'plain') t.wrapS = THREE.RepeatWrapping;
      SHT[k] = t;
    }
  } catch (e) {
    SHT.ok = false;
    return null;
  }
  return SHT;
}
function css(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return `rgb(${c[0]},${c[1]},${c[2]})`;
  return '#3a6';
}
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
