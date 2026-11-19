// Parametric hull loft. One function describes every monohull in the fleet: deep-V, modified-V, flat-bottom (jon, skiff),
// round-bilge displacement (sailboat, trawler, tug) and narrow catamaran / pontoon sponsons.
//
//   const H = makeHull({ L: 7.9, B: 2.6, draft: 0.45, fbAft: 0.72, fbMid: 0.78, fbBow: 1.12, deadrise: 21, ... });
//   H.skin(K);                         // topsides + bottom + transom into the 'hull' bucket (livery UVs)
//   H.deck(K, 'nonskid', S.nonskid, 0.05, 0.6, 0.18, 0.12);     // cockpit sole from u 0.05..0.6 at y 0.18, 12 cm inside the skin
//   H.liner(K, 'gel', S.liner, 0.05, 0.6, 0.18);                // inner walls from the gunwale down to the sole
//   H.cap(K, 'gel', S.deck, 0, 1, 0.16);                        // gunwale cap
//   H.rubRail(K);                                               // rub rail along the sheer
//
// u runs 0 (transom) .. 1 (stem). Frame: +Z bow, +X port, y = 0 waterline.
import * as THREE from 'three';
import { S, clamp, lerp, smooth } from './kit.js';

const D2R = Math.PI / 180;

export function makeHull(h) {
  const P = Object.assign(
    {
      L: 7,
      B: 2.4,
      draft: 0.4,
      fbAft: 0.7,
      fbMid: 0.75,
      fbBow: 1.05, // sheer height above the waterline at the transom, amidships and the stem
      sheerFn: null, // optional (u) => y override
      transomW: 0.9, // sheer beam at the transom as a fraction of B
      maxU: 0.42,
      foreU: 0.52, // max beam is reached at maxU and held until foreU, then the bow narrows
      bowPow: 2.2,
      bowQ: 1.15, // bow plan fullness: hb ~ (1 - s^bowPow)^(1/bowQ). bowQ 1 = sharp, 2 = round
      bowW: 0, // > 0 for a square bow (jon, pram, barge): bow width as a fraction of B
      type: 'vee', // 'vee' (hard chine) | 'flat' (hard chine, almost no deadrise) | 'round' (round bilge)
      deadrise: 18, // degrees at the transom
      chineW: 0.93,
      chineWFwd: 0.5, // chine beam as a fraction of the sheer beam, aft and at the stem (smaller = more flare)
      chineBow: 0.5, // height of the chine at the stem as a fraction of the stem height
      chineRiseU: 0.45, // where the chine starts to rise
      chineFlat: 0.035, // width of the chine flat (0 = none)
      flarePow: 1.25, // topside curve: > 1 hollow flare, < 1 full / convex
      flarePowAft: null, // topside curve aft (defaults to 0.9: slightly convex)
      tumble: 0, // tumblehome aft, meters the sheer tucks in at the transom
      rocker: 0.25, // how much the keel rises (fraction of draft) from amidships to the forefoot
      stemU: 0.86,
      stemPow: 1.6, // the stem: where the keel starts to climb, and how plumb it is (higher = more plumb)
      stemTop: 1, // where the stem ends as a fraction of bow sheer height
      transomRake: 0, // meters the bottom of the transom sits forward of its top
      strakes: 2, // lifting strakes per side ('vee' only)
      roundA: 0.62,
      roundB: 1.6, // round bilge fullness
      N: 46,
      nb: 6,
      nt: 8,
      liveryV: null, // [yMin, yMax] mapped to the livery texture height (defaults from the hull)
    },
    h,
  );
  const { L, B, N } = P,
    hw = B / 2;
  const sheerY =
    P.sheerFn ||
    ((u) => {
      // parabola through the three sheer heights
      const a = 2 * P.fbAft - 4 * P.fbMid + 2 * P.fbBow,
        b = -3 * P.fbAft + 4 * P.fbMid - P.fbBow;
      return a * u * u + b * u + P.fbAft;
    });
  const halfBeam = (u) => {
    if (u <= P.maxU)
      return hw * lerp(P.transomW, 1, Math.sin((Math.PI / 2) * clamp(u / P.maxU, 0, 1)));
    if (u <= P.foreU) return hw;
    const s = clamp((u - P.foreU) / (1 - P.foreU), 0, 1);
    return (
      hw * (P.bowW + (1 - P.bowW) * Math.pow(Math.max(0, 1 - Math.pow(s, P.bowPow)), 1 / P.bowQ))
    );
  };
  const keelY = (u) => {
    const base = -P.draft * (1 - P.rocker * smooth(0.4, P.stemU, u));
    if (u <= P.stemU) return base;
    const t = (u - P.stemU) / (1 - P.stemU),
      top = sheerY(1) * P.stemTop;
    return lerp(base, top, Math.pow(t, P.stemPow));
  };
  const chineHB = (u) => halfBeam(u) * lerp(P.chineW, P.chineWFwd, smooth(0.3, 1, u));
  const chineY = (u) => {
    const yk = keelY(u),
      ys = sheerY(u);
    const dead = (P.type === 'flat' ? Math.min(P.deadrise, 6) : P.deadrise) * D2R;
    const aft = -P.draft * (1 - P.rocker * smooth(0.4, P.stemU, u)) + Math.tan(dead) * chineHB(u);
    const bow = sheerY(1) * P.chineBow;
    const y = lerp(aft, bow, Math.pow(smooth(P.chineRiseU, 1, u), 1.5));
    return clamp(y, yk + 0.012, ys - 0.04);
  };
  // half section (port side) from keel to sheer: [[x, y], ...]; fixed point count for every station
  const NB = P.type === 'round' ? 0 : P.nb + (P.type === 'vee' ? P.strakes * 2 : 0),
    NT = P.nt;
  const idxChine = P.type === 'round' ? -1 : NB; // index of the chine point in the half section
  const HALF = P.type === 'round' ? P.nb + P.nt + 1 : NB + (P.chineFlat > 0 ? 1 : 0) + NT + 1;
  function halfSection(u) {
    const hb = halfBeam(u),
      yk = keelY(u),
      ys = sheerY(u),
      out = [];
    const tum = P.tumble * (1 - smooth(0, 0.35, u));
    if (P.type === 'round') {
      const n = HALF - 1;
      for (let i = 0; i <= n; i++) {
        const th = ((i / n) * Math.PI) / 2;
        const x = hb * Math.pow(Math.sin(th), P.roundA),
          y = yk + (ys - yk) * (1 - Math.pow(Math.cos(th), P.roundB));
        out.push([x - tum * smooth(0.75, 1, i / n), y]);
      }
      out[0][0] = 0;
      return out;
    }
    const hc = Math.min(chineHB(u), hb - 0.004 * (hb > 0.02 ? 1 : 0)),
      yc = chineY(u);
    out.push([0, yk]);
    // bottom panel (keel -> chine) with lifting strakes that fade out forward
    const strakeAmt = P.type === 'vee' ? 0.022 * (1 - smooth(0.62, 0.8, u)) : 0;
    const nseg = NB;
    let k = 1;
    const bottomAt = (t) => [
      hc * t,
      yk + (yc - yk) * t - Math.sin(Math.PI * t) * 0.012 * (P.type === 'flat' ? 0 : 1),
    ];
    if (P.type === 'vee' && P.strakes > 0) {
      const marks = [];
      for (let s = 1; s <= P.strakes; s++) marks.push(s / (P.strakes + 1));
      const plain = P.nb - 1; // interior plain points
      const ts = [];
      for (let i = 1; i <= plain; i++) ts.push({ t: i / (plain + 1), s: 0 });
      for (const mk of marks) {
        ts.push({ t: mk - 0.012, s: 1 }, { t: mk + 0.012, s: 2 });
      }
      ts.sort((a, b) => a.t - b.t);
      for (const e of ts) {
        const p = bottomAt(e.t);
        if (e.s === 1) p[1] -= strakeAmt;
        if (e.s === 2) {
          p[1] -= strakeAmt * 0.15;
        }
        out.push(p);
        k++;
      }
    } else
      for (let i = 1; i < nseg; i++) {
        out.push(bottomAt(i / nseg));
        k++;
      }
    while (out.length < NB) out.push(bottomAt(out.length / NB));
    out.push([hc, yc]);
    let x0 = hc,
      y0 = yc;
    if (P.chineFlat > 0) {
      const cf = Math.min(P.chineFlat, Math.max(0, hb - hc) * 0.6) * (1 - smooth(0.7, 1, u));
      x0 = hc + cf;
      y0 = yc + cf * 0.12;
      out.push([x0, y0]);
    }
    const fpF = P.flarePow,
      fpA = P.flarePowAft ?? 0.9,
      fp = lerp(fpA, fpF, smooth(0.25, 0.8, u));
    for (let i = 1; i <= NT; i++) {
      const t = i / NT;
      out.push([x0 + (hb - x0) * Math.pow(t, fp) - tum * smooth(0.35, 1, t), y0 + (ys - y0) * t]);
    }
    return out;
  }
  const st = [];
  for (let i = 0; i <= N; i++) {
    // denser stations toward the bow where curvature is highest
    const lin = i / N,
      u = lerp(lin, 1 - Math.pow(1 - lin, 1.35), 0.55);
    st.push({
      u,
      z: -L / 2 + u * L,
      hb: halfBeam(u),
      yk: keelY(u),
      ys: sheerY(u),
      yc: P.type === 'round' ? null : chineY(u),
      half: halfSection(u),
    });
  }
  let yMin = Infinity,
    yMax = -Infinity;
  for (const s of st) {
    yMin = Math.min(yMin, s.yk);
    yMax = Math.max(yMax, s.ys);
  }
  const LV = P.liveryV || [yMin - 0.03, yMax + 0.05];
  const zOf = (u) => -L / 2 + u * L,
    uOf = (z) => clamp((z + L / 2) / L, 0, 1);
  const rakeZ = (u, y) => {
    if (!P.transomRake || u > 0.1) return 0;
    const s = st[0];
    return P.transomRake * clamp((s.ys - y) / Math.max(0.05, s.ys - s.yk), 0, 1) * (1 - u / 0.1);
  };
  // half beam of the outer skin at height y (interpolating the section)
  function half(u, y) {
    const sec = halfSection(u);
    if (y <= sec[0][1]) return 0;
    const last = sec[sec.length - 1];
    if (y >= last[1]) return last[0];
    for (let i = 0; i < sec.length - 1; i++) {
      const a = sec[i],
        b = sec[i + 1];
      if (y >= a[1] && y <= b[1] && b[1] > a[1])
        return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
    }
    return last[0];
  }
  const H = {
    P,
    L,
    B,
    st,
    LV,
    sheerY,
    halfBeam,
    keelY,
    chineY: P.type === 'round' ? () => null : chineY,
    half,
    zOf,
    uOf,
    halfSection,
    yMin,
    yMax,
    sheer(u, side = 1) {
      return [side * halfBeam(u), sheerY(u), zOf(u)];
    },
    // livery texture coordinates of a skin point (see livery.js): starboard = top half, port = bottom half
    liveryUV(x, y, z) {
      const ul = clamp((z + L / 2) / L, 0, 1),
        v = clamp((y - LV[0]) / (LV[1] - LV[0]), 0, 1);
      return x < 0 ? [ul, 0.5 + v * 0.5] : [1 - ul, v * 0.5];
    },
    // ---- outer skin: both sides, bottom and transom
    skin(K, o = {}) {
      const bucket = o.bucket || 'hull',
        slot = o.slot ?? S.hull;
      for (const side of [1, -1]) {
        const rings = st.map((s) => {
          const r = s.half.map(([x, y]) => [side * x, y, s.z + rakeZ(s.u, y)]);
          return side > 0 ? r : r.reverse();
        });
        // port: keel -> sheer (counter-clockwise from the bow); starboard: sheer -> keel
        const HN = HALF,
          cr = [];
        if (P.type !== 'round') {
          const ci = idxChine;
          cr.push(side > 0 ? ci : HN - 1 - ci);
          if (P.chineFlat > 0) cr.push(side > 0 ? ci + 1 : HN - 2 - ci);
        }
        K.loft(bucket, slot, rings, {
          crease: cr,
          uv: (ri, pi, p) => H.liveryUV(side * Math.max(1e-4, Math.abs(p[0])), p[1], p[2]),
        });
      }
      // transom (o.notch = { w, y }: an outboard cutout in the top center, lowered to height y)
      const s0 = st[0],
        ring = [
          ...s0.half.map(([x, y]) => [-x, y, s0.z + rakeZ(0, y)]).reverse(),
          ...s0.half.slice(1).map(([x, y]) => [x, y, s0.z + rakeZ(0, y)]),
        ];
      const tuv = (ri, pi, p) => {
        const v = clamp((p[1] - LV[0]) / (LV[1] - LV[0]), 0, 1);
        return [0.004, 0.5 + v * 0.5];
      };
      const notch = o.notch || P.notch;
      if (!notch) K.fan(bucket, slot, ring, true, { capClosed: true, uv: tuv });
      else {
        const hw2 = Math.min(notch.w / 2, s0.hb - 0.08),
          pts = [
            ...ring.map((p) => [p[0], p[1]]),
            [hw2, s0.ys],
            [hw2 - 0.03, notch.y + 0.03],
            [hw2 - 0.06, notch.y],
            [-hw2 + 0.06, notch.y],
            [-hw2 + 0.03, notch.y + 0.03],
            [-hw2, s0.ys],
          ];
        const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(-p[0], p[1]))),
          g = new THREE.ShapeGeometry(sh),
          gp = g.attributes.position,
          uvs = [];
        for (let i = 0; i < gp.count; i++) {
          const t = tuv(0, 0, [0, gp.getY(i), 0]);
          uvs.push(t[0], t[1]);
        }
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        const m = new THREE.Matrix4()
          .makeTranslation(0, 0, s0.z)
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        // ShapeGeometry winds by the outline direction; make sure it faces aft
        g.computeVertexNormals();
        if (g.attributes.normal.getZ(0) < 0) {
          const ix = g.index.array;
          for (let i = 0; i < ix.length; i += 3) {
            const t = ix[i + 1];
            ix[i + 1] = ix[i + 2];
            ix[i + 2] = t;
          }
          g.computeVertexNormals();
        }
        K.add(bucket, slot, g, m, { keepUV: true });
        H.notch = { w: hw2 * 2, y: notch.y, z: s0.z };
      }
      // square bow (jon / pram): close it
      if (P.bowW > 0) {
        const s1 = st[N],
          rb = [
            ...s1.half.map(([x, y]) => [-x, y, s1.z]).reverse(),
            ...s1.half.slice(1).map(([x, y]) => [x, y, s1.z]),
          ];
        K.fan(bucket, slot, rb, false, {
          capClosed: true,
          uv: (ri, pi, p) => {
            const v = clamp((p[1] - LV[0]) / (LV[1] - LV[0]), 0, 1);
            return [0.996, 0.5 + v * 0.5];
          },
        });
      }
      return H;
    },
    // ---- horizontal deck / sole between stations u0..u1. y: number or (u) => y. inset: meters inside the skin at that height
    // (or inside the sheer when o.fromSheer). o.maxHalf clamps the half width (for a centre walkway), o.minHalf cuts a hole edge.
    deck(K, bucket, slot, u0, u1, y, inset = 0.06, o = {}) {
      const yF = typeof y === 'function' ? y : () => y,
        rings = [],
        n = Math.max(2, Math.ceil((u1 - u0) * N * 1.2));
      for (let i = 0; i <= n; i++) {
        const u = lerp(u0, u1, i / n),
          yy = yF(u);
        let w = (o.fromSheer ? halfBeam(u) : half(u, Math.min(yy, sheerY(u) - 0.01))) - inset;
        if (o.maxHalf != null) w = Math.min(w, o.maxHalf);
        w = Math.max(0.001, w);
        const xi = o.minHalf || 0;
        if (xi > 0) {
          if (w <= xi) continue;
          rings.push({ z: zOf(u), y: yy, w, xi });
        } else rings.push({ z: zOf(u), y: yy, w, xi: 0 });
      }
      if (rings.length < 2) return H;
      if (o.minHalf) {
        for (const sd of [1, -1])
          K.loft(
            bucket,
            slot,
            rings.map((r) =>
              sd > 0
                ? [
                    [r.w, r.y, r.z],
                    [r.xi, r.y, r.z],
                  ]
                : [
                    [-r.xi, r.y, r.z],
                    [-r.w, r.y, r.z],
                  ],
            ),
          );
      } else
        K.loft(
          bucket,
          slot,
          rings.map((r) => [
            [r.w, r.y, r.z],
            [0, r.y + (o.camber || 0), r.z],
            [-r.w, r.y, r.z],
          ]),
        );
      if (o.edge) {
        // a vertical lip (thickness) at the inboard / end edges so raised decks read as solid
        const e = o.edge;
        const a = rings[0],
          b = rings[rings.length - 1];
        if (o.edgeAft !== false)
          K.loft(bucket, slot, [
            [
              [a.w, a.y - e, a.z],
              [-a.w, a.y - e, a.z],
            ],
            [
              [a.w, a.y, a.z],
              [-a.w, a.y, a.z],
            ],
          ]);
        if (o.edgeFwd !== false)
          K.loft(bucket, slot, [
            [
              [-b.w, b.y - e, b.z],
              [b.w, b.y - e, b.z],
            ],
            [
              [-b.w, b.y, b.z],
              [b.w, b.y, b.z],
            ],
          ]);
      }
      return H;
    },
    // ---- inner wall from the gunwale down to yBot between u0..u1 (faces inboard). inset = wall thickness at the top.
    // o.vertical: wall drops straight down from the top edge; default follows the skin (keeps a constant wall thickness)
    liner(K, bucket, slot, u0, u1, yBot, o = {}) {
      const inset = o.inset ?? 0.06,
        n = Math.max(2, Math.ceil((u1 - u0) * N * 1.2)),
        yB = typeof yBot === 'function' ? yBot : () => yBot;
      const yT =
        o.yTop == null ? (u) => sheerY(u) : typeof o.yTop === 'function' ? o.yTop : () => o.yTop;
      for (const side of [1, -1]) {
        const rings = [];
        for (let i = 0; i <= n; i++) {
          const u = lerp(u0, u1, i / n),
            yt = yT(u),
            yb = Math.min(yB(u), yt - 0.01),
            z = zOf(u);
          const xt = Math.max(0.001, half(u, yt - 0.005) - inset),
            xb = o.vertical ? xt : Math.max(0.001, Math.min(xt, half(u, yb) - inset));
          const xm = o.vertical
            ? xt
            : Math.max(0.001, Math.min(xt, half(u, (yt + yb) / 2) - inset));
          rings.push(
            side > 0
              ? [
                  [xt, yt, z],
                  [xm, (yt + yb) / 2, z],
                  [xb, yb, z],
                ]
              : [
                  [-xb, yb, z],
                  [-xm, (yt + yb) / 2, z],
                  [-xt, yt, z],
                ],
          );
        }
        K.loft(bucket, slot, rings);
      }
      return H;
    },
    // ---- gunwale cap: a flat strip on top of the sheer, `width` wide, with an inboard lip `lip` deep
    cap(K, bucket, slot, u0, u1, width = 0.14, o = {}) {
      const n = Math.max(2, Math.ceil((u1 - u0) * N * 1.2)),
        rise = o.rise ?? 0.012,
        lip = o.lip ?? 0.05,
        over = o.over ?? 0.012;
      for (const side of [1, -1]) {
        const rings = [];
        for (let i = 0; i <= n; i++) {
          const u = lerp(u0, u1, i / n),
            hb = halfBeam(u),
            y = sheerY(u),
            z = zOf(u),
            xo = hb + over,
            xi = Math.max(0, hb - (typeof width === 'function' ? width(u) : width));
          const r = [
            [xo, y - 0.015, z],
            [xo, y + rise, z],
            [xi, y + rise, z],
            [xi, y + rise - lip, z],
          ];
          rings.push(side > 0 ? r.map((p) => p) : r.map((p) => [-p[0], p[1], p[2]]).reverse());
        }
        K.loft(bucket, slot, rings, { crease: [1, 2] });
      }
      return H;
    },
    // ---- rub rail: tube along the sheer on both sides and across the transom
    rubRail(K, o = {}) {
      const bucket = o.bucket || 'matte',
        slot = o.slot ?? S.rubber,
        r = o.r ?? 0.022,
        u0 = o.u0 ?? 0,
        u1 = o.u1 ?? 1,
        drop = o.drop ?? 0.02;
      const pts = [];
      const n = 28;
      for (let i = 0; i <= n; i++) {
        const u = lerp(u1, u0, i / n);
        pts.push([halfBeam(u) + r * 0.5, sheerY(u) - drop, zOf(u)]);
      }
      const all = [
        ...pts.map((p) => [-p[0], p[1], p[2]]).reverse(),
        ...(P.bowW > 0 || u1 < 1 ? pts : pts.slice(1)),
      ];
      if (u1 >= 1 && P.bowW <= 0) {
        const a = pts.map((p) => [-p[0], p[1], p[2]]).reverse();
        a.pop();
        all.length = 0;
        all.push(...a, [0, sheerY(1) - drop, zOf(1) + r * 0.6], ...pts.slice(1));
      }
      K.tube(bucket, slot, all, r, { seg: 6, tension: 0.5, steps: all.length * 2 });
      if (o.transom !== false && u0 <= 0)
        K.rod(
          bucket,
          slot,
          [halfBeam(0) + r * 0.5, sheerY(0) - drop, zOf(0) - r * 0.3],
          [-halfBeam(0) - r * 0.5, sheerY(0) - drop, zOf(0) - r * 0.3],
          r,
          6,
        );
      if (o.insert) {
        // stainless insert strip on top of the rubber
        const ins = all.map((p) => [
          p[0] + Math.sign(p[0]) * r * 0.75,
          p[1],
          p[2] + (Math.abs(p[0]) < 0.01 ? r * 0.75 : 0),
        ]);
        K.tube('metal', S.steel, ins, r * 0.42, { seg: 5, tension: 0.5, steps: all.length * 2 });
      }
      return H;
    },
    // ---- spray rail / accent strake along the topsides at a fraction f of the way from chine to sheer
    sprayRail(K, f = 0.25, o = {}) {
      if (P.type === 'round') return H;
      const u0 = o.u0 ?? 0.02,
        u1 = o.u1 ?? 0.96,
        n = 26;
      for (const side of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const u = lerp(u0, u1, i / n),
            y = lerp(chineY(u), sheerY(u), f);
          if (y < keelY(u) + 0.05 || half(u, y) < 0.03) break;
          pts.push([side * (half(u, y) + 0.006), y, zOf(u)]);
        }
        if (pts.length < 3) continue;
        for (let i = 0; i <= 0; i++) {}
        K.tube(o.bucket || 'gel', o.slot ?? S.hull, pts, o.r ?? 0.016, {
          seg: 5,
          tension: 0.5,
          steps: n * 2,
        });
      }
      return H;
    },
    // points for the physics collider: a vertical-walled prism of the plan outline, so a hull can never ride up a dock or
    // another boat. Top is at least `minTop` above the waterline.
    colliderPoints(minTop = 0.95) {
      const pts = [],
        top = Math.max(minTop, yMax),
        bot = -P.draft * 0.92;
      for (let i = 0; i <= N; i += 3) {
        const s = st[Math.min(N, i)];
        const w = Math.max(s.hb, 0.02);
        for (const sx of [1, -1]) {
          pts.push(sx * w, top, s.z, sx * w, bot, s.z);
        }
      }
      const s1 = st[N];
      pts.push(0, top, s1.z, 0, bot, s1.z);
      return new Float32Array(pts);
    },
    // buoyancy sample points (local): 3 stations x 2 sides + bow + stern centerline
    floatPoints() {
      const out = [];
      for (const u of [0.1, 0.42, 0.72]) {
        const w = halfBeam(u) * 0.72;
        for (const sx of [1, -1]) out.push(new THREE.Vector3(sx * w, -P.draft * 0.55, zOf(u)));
      }
      out.push(
        new THREE.Vector3(0, -P.draft * 0.4, zOf(0.93)),
        new THREE.Vector3(0, -P.draft * 0.75, zOf(0.03)),
      );
      return out;
    },
    // plan outline [[x, z], ...] of the sheer inset by d, between u0..u1 (closed across the ends) for K.plate()
    outline(u0 = 0, u1 = 1, d = 0, n = 24, y = null) {
      const a = [],
        b = [];
      for (let i = 0; i <= n; i++) {
        const u = lerp(u0, u1, i / n),
          w = Math.max(0.001, (y == null ? halfBeam(u) : half(u, y)) - d);
        a.push([w, zOf(u)]);
        b.push([-w, zOf(u)]);
      }
      return [...a, ...b.reverse()];
    },
  };
  return H;
}
