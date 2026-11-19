// Southline V2 yachts: parametric hull loft.
// A hull is described by three longitudinal curves (plan, sheer, keel), a section-shape family (round bilge or hard
// chine with flare) and stem / transom profiles. Every yacht gives its own numbers, so no two hulls share a form.
// Local frame: +z bow, +x port, y up, y = 0 at the design waterline. u = 0 at the transom, u = 1 at the stem head.
import * as THREE from 'three';
import { clamp, lerp, smooth, curve } from './builder.js';

/**
 * @param {object} s
 *   L, B, draft                      meters (hull body length, max beam at the sheer, max draft)
 *   sheer: keys u -> y               top of the hull side (gunwale / bulwark top) above the waterline
 *   plan: keys u -> 0..1             half-breadth at the sheer as a fraction of B/2
 *   keel: keys u -> depth fraction   1 = full draft, 0 = at the waterline (must reach 0 at `forefoot`)
 *   forefoot: u where the keel meets the waterline (0.90 raked bow .. 0.99 plumb bow); stemExp shapes the stem above it
 *   fullness: keys u -> exponent     round-bilge section shape: 0.3 boxy U, 1 straight V, 1.4 hollow flare
 *   chine: { y: keys (chine height above WL), w: keys (chine half-breadth / sheer half-breadth), flare: keys (topside exponent), bottom: exponent }
 *   stem: { rake (m of overhang per m of height; negative = reverse bow), from (u where the shear starts), profile: keys h -> dz }
 *   transom: { rake (top leans forward per m of height; negative = classic aft-raked), from }
 *   bootTop: height of the boot stripe (default 0.09), bands: [{ y0, y1, mat }] extra color bands on the topsides
 *   windows: [{ z0, z1, y0, y1, side: 'both'|'port'|'stbd' }] flush hull glazing (real see-through cutouts)
 *   mod(u, t, y, x) -> x             optional custom section tweak (tumblehome, knuckles)
 *   stations (default 64), rowsBottom (10), rowsTop (12)
 */
export function makeHull(s) {
  const L = s.L,
    hb = s.B / 2,
    D = s.draft,
    z0 = -L / 2;
  const sheerF = curve(s.sheer),
    planF = curve(s.plan);
  const uFore = s.forefoot ?? 0.93,
    stemExp = s.stemExp ?? 1;
  const keelF = curve(
    s.keel ?? [
      [0, 0.55],
      [0.3, 1],
      [0.6, 1],
      [uFore, 0],
    ],
  );
  const fullF = curve(
    s.fullness ?? [
      [0, 0.36],
      [0.45, 0.3],
      [0.8, 0.8],
      [1, 1.25],
    ],
  );
  const ch = s.chine
    ? {
        y: curve(s.chine.y),
        w: curve(s.chine.w),
        flare: curve(s.chine.flare ?? 0.9),
        bottom: s.chine.bottom ?? 1,
      }
    : null;
  const stem = { rake: 0.4, from: 0.55, ...(s.stem || {}) },
    stemProf = stem.profile ? curve(stem.profile) : null;
  const tr = { rake: 0, from: 0.12, ...(s.transom || {}) };
  const Sb = sheerF(1);
  const K = (u) =>
    u <= uFore ? -D * keelF(u) : sheerF(u) * Math.pow((u - uFore) / (1 - uFore), stemExp);
  const S = (u) => sheerF(u);
  // section half-breadth fraction at height fraction t (0 keel .. 1 sheer)
  function sect(u, t) {
    t = clamp(t);
    if (ch) {
      const k = K(u),
        sh = S(u),
        tc = clamp((ch.y(u) - k) / (sh - k || 1e-6), 0.03, 0.92),
        wc = ch.w(u);
      if (t <= tc) return wc * Math.pow(t / tc, ch.bottom);
      return wc + (1 - wc) * Math.pow((t - tc) / (1 - tc), ch.flare(u));
    }
    return Math.pow(t, fullF(u));
  }
  const dzStem = (y) => (stemProf ? stemProf(y / Sb) : -stem.rake * (Sb - y));
  const zAt = (u, y) =>
    z0 + u * L + smooth(stem.from, 1, u) * dzStem(y) + (1 - smooth(0, tr.from, u)) * tr.rake * y;
  function xAt(u, y) {
    const k = K(u),
      sh = S(u);
    if (y < k - 1e-6) return 0;
    const t = (Math.min(y, sh) - k) / (sh - k || 1e-6);
    let x = hb * planF(u) * sect(u, t);
    if (s.mod) x = s.mod(u, t, y, x);
    return Math.max(0, x);
  }
  function uOf(z, y) {
    let a = 0,
      b = 1;
    for (let i = 0; i < 26; i++) {
      const m = (a + b) / 2;
      if (zAt(m, y) < z) a = m;
      else b = m;
    }
    return (a + b) / 2;
  }
  /** Hull half-breadth (outer skin) at fore-aft position z and height y. Above the sheer it continues vertically. */
  const halfBeam = (z, y) => xAt(uOf(z, y), y);
  /** Sheer height at z. */
  function sheerAt(z) {
    let u = clamp((z - z0) / L);
    for (let i = 0; i < 3; i++) u = uOf(z, S(u));
    return S(u);
  }
  /** Foremost z of the hull at height y (the stem line), and aftmost z (the transom). */
  function zBow(y) {
    if (y >= Sb) return zAt(1, Sb);
    let a = y >= 0 ? uFore : 0.4,
      b = 1;
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      if (K(m) < y) a = m;
      else b = m;
    }
    return zAt((a + b) / 2, y);
  }
  const zStern = (y) => zAt(0, y);

  // ---------------------------------------------------------------- mesh grid
  const forced = new Set();
  const wins = s.windows || [];
  for (const w of wins) {
    forced.add(clamp((w.z0 - z0) / L));
    forced.add(clamp((w.z1 - z0) / L));
  }
  for (const u of s.forceU || []) forced.add(u);
  const N = s.stations ?? 64;
  let U = [];
  for (let i = 0; i <= N; i++) {
    const q = i / N;
    U.push(q < 0.5 ? q : 0.5 + 0.5 * (1 - Math.pow(1 - (q - 0.5) * 2, 1.35)));
  }
  for (const f of forced) {
    if (!U.some((u) => Math.abs(u - f) < 0.004)) U.push(f);
    else {
      let bi = 0;
      U.forEach((u, i) => {
        if (Math.abs(u - f) < Math.abs(U[bi] - f)) bi = i;
      });
      if (bi > 0 && bi < U.length - 1) U[bi] = f;
    }
  }
  U.sort((a, b) => a - b);
  const nb = s.rowsBottom ?? 10,
    nt = s.rowsTop ?? 12,
    boot = s.bootTop ?? 0.09;
  const fixed = new Set([boot]);
  for (const w of wins) {
    fixed.add(w.y0);
    fixed.add(w.y1);
  }
  for (const b of s.bands || []) {
    fixed.add(b.y0);
    fixed.add(b.y1);
  }
  const F = [...fixed].filter((y) => y > 0).sort((a, b) => a - b);
  const rows = nb + 1 + F.length + nt; // row index: 0..nb bottom (nb = waterline), then fixed levels, then free rows to the sheer
  const W = U.length,
    pts = new Float32Array(W * rows * 3),
    Y = new Float32Array(W * rows);
  for (let i = 0; i < W; i++) {
    const u = U[i],
      k = K(u),
      sh = S(u),
      lastF = F.length ? F[F.length - 1] : 0;
    for (let j = 0; j < rows; j++) {
      let y;
      if (j <= nb) y = k < 0 ? k * (1 - Math.pow(j / nb, 0.85)) : k;
      else if (j <= nb + F.length) y = clamp(F[j - nb - 1], Math.max(k, 0), sh);
      else {
        const base = clamp(lastF, Math.max(k, 0), sh);
        y = lerp(base, sh, (j - nb - F.length) / nt);
      }
      const o = (j * W + i) * 3;
      pts[o] = xAt(u, y);
      pts[o + 1] = y;
      pts[o + 2] = zAt(u, y);
      Y[j * W + i] = y;
    }
  }
  const nrm = new Float32Array(W * rows * 3);
  {
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      n = new THREE.Vector3();
    const P = (i, j, out) => {
      const o = (clamp(j, 0, rows - 1) * W + clamp(i, 0, W - 1)) * 3;
      return out.set(pts[o], pts[o + 1], pts[o + 2]);
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < W; i++) {
        P(i + 1, j, a).sub(P(i - 1, j, n));
        P(i, j + 1, b).sub(P(i, j - 1, n));
        if (b.lengthSq() < 1e-10) {
          P(i, Math.min(rows - 1, j + 2), b).sub(P(i, Math.max(0, j - 2), n));
        }
        n.crossVectors(b, a);
        if (n.lengthSq() < 1e-12) n.set(1, 0, 0);
        n.normalize();
        const o = (j * W + i) * 3;
        nrm[o] = n.x;
        nrm[o + 1] = n.y;
        nrm[o + 2] = n.z;
      }
  }
  // which material a cell (i, j) belongs to
  function cellMat(i, j, side) {
    if (j < nb) return 'antifoul';
    const ya = Math.min(Y[j * W + i], Y[j * W + i + 1]),
      yb = Math.max(Y[(j + 1) * W + i], Y[(j + 1) * W + i + 1]);
    const ym = (ya + yb) / 2,
      zm = (pts[(j * W + i) * 3 + 2] + pts[(j * W + i + 1) * 3 + 2]) / 2;
    if (ym < boot) return 'boot';
    for (const w of wins)
      if (
        (w.side || 'both') !== (side > 0 ? 'stbd' : 'port') &&
        zm > w.z0 &&
        zm < w.z1 &&
        ym > w.y0 &&
        ym < w.y1
      )
        return w.mat || 'hullGlass';
    for (const b of s.bands || [])
      if (ym > b.y0 && ym < b.y1 && (b.z0 === undefined || (zm > b.z0 && zm < b.z1))) return b.mat;
    return 'hull';
  }

  /** Draw the hull shell into ctx (materials: hull, boot, antifoul, hullGlass + band mats). */
  function build(ctx) {
    const byMat = new Map();
    const bucket = (m) => {
      let b = byMat.get(m);
      if (!b) byMat.set(m, (b = { idxP: [], idxS: [] }));
      return b;
    };
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < W - 1; i++) {
        const a = j * W + i,
          b = a + 1,
          c = a + W,
          d = c + 1;
        // drop fully collapsed cells
        const o = a * 3,
          o2 = d * 3;
        if (
          Math.abs(pts[o + 1] - pts[o2 + 1]) < 1e-6 &&
          Math.abs(pts[o] - pts[o2]) < 1e-6 &&
          Math.abs(pts[c * 3 + 1] - pts[b * 3 + 1]) < 1e-6
        )
          continue;
        bucket(cellMat(i, j, 1)).idxP.push(a, c, b, b, c, d);
        bucket(cellMat(i, j, -1)).idxS.push(a, b, c, b, d, c);
      }
    const uvs = new Float32Array(W * rows * 2);
    for (let k = 0; k < W * rows; k++) {
      uvs[k * 2] = pts[k * 3 + 2] * 0.5;
      uvs[k * 2 + 1] = pts[k * 3 + 1] * 0.5;
    }
    const mk = (idx, mirror) => {
      const g = new THREE.BufferGeometry(),
        p = new Float32Array(pts),
        n = new Float32Array(nrm);
      if (mirror)
        for (let k = 0; k < p.length; k += 3) {
          p[k] = -p[k];
          n[k] = -n[k];
        }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
      g.setIndex(idx);
      return compact(g);
    };
    for (const [m, b] of byMat) {
      if (b.idxP.length) ctx.add(mk(b.idxP, false), m, { uv: 'keep' });
      if (b.idxS.length) ctx.add(mk(b.idxS, true), m, { uv: 'keep' });
    }
    // transom: horizontal strips between the port and starboard edges of station 0
    for (let j = 0; j < rows - 1; j++) {
      const a = j * W,
        c = (j + 1) * W,
        xa = pts[a * 3],
        xc = pts[c * 3],
        ya = pts[a * 3 + 1],
        yc = pts[c * 3 + 1];
      if (Math.abs(yc - ya) < 1e-5 || (xa < 1e-4 && xc < 1e-4)) continue;
      const m = j < nb ? 'antifoul' : (ya + yc) / 2 < boot ? 'boot' : s.transomMat || 'hull';
      ctx.quad(
        m,
        [xa, ya, pts[a * 3 + 2]],
        [-xa, ya, pts[a * 3 + 2]],
        [-xc, yc, pts[c * 3 + 2]],
        [xc, yc, pts[c * 3 + 2]],
      );
    }
    return api;
  }
  // drop unused vertices so each material chunk only carries what it draws
  function compact(g) {
    const idx = g.index.array,
      used = new Map(),
      pos = [],
      nor = [],
      uv = [],
      out = new Array(idx.length);
    const P = g.attributes.position.array,
      Nn = g.attributes.normal.array,
      T = g.attributes.uv.array;
    for (let k = 0; k < idx.length; k++) {
      let v = used.get(idx[k]);
      if (v === undefined) {
        v = pos.length / 3;
        used.set(idx[k], v);
        const o = idx[k] * 3;
        pos.push(P[o], P[o + 1], P[o + 2]);
        nor.push(Nn[o], Nn[o + 1], Nn[o + 2]);
        uv.push(T[idx[k] * 2], T[idx[k] * 2 + 1]);
      }
      out[k] = v;
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    r.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    r.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    r.setIndex(out);
    return r;
  }

  /**
   * Port-side outline [[x, z], ...] (aft -> fore) of the hull at height y, moved inboard by `inset`.
   * o: { z0, z1, n (samples, default 40), minW (stop when narrower than this, default 0.12) }
   */
  function outline(y, o = {}) {
    const inset = o.inset ?? 0,
      n = o.n ?? 40,
      minW = o.minW ?? 0.12;
    const za = Math.max(o.z0 ?? -1e9, zStern(y) + (o.aftInset ?? inset)),
      zb = Math.min(o.z1 ?? 1e9, zBow(y) - 0.02);
    const out = [];
    for (let i = 0; i <= n; i++) {
      // denser toward the bow where the plan curves
      const q = i / n,
        z = lerp(za, zb, 1 - Math.pow(1 - q, 1.6));
      const x = halfBeam(z, y) - inset;
      if (x < minW) {
        if (out.length && o.z1 === undefined) {
          // close the nose at the point where the inset deck runs out
          let a = out[out.length - 1][1],
            b = z;
          for (let k = 0; k < 18; k++) {
            const m = (a + b) / 2;
            if (halfBeam(m, y) - inset > minW) a = m;
            else b = m;
          }
          out.push([minW, a]);
        }
        break;
      }
      out.push([x, z]);
    }
    return out;
  }
  /** Closed polygon [[x, z], ...] of the deck at height y (port side aft -> fore, then starboard back aft). */
  function deckPoly(y, o = {}) {
    const p = outline(y, o);
    return p.concat(
      p
        .slice()
        .reverse()
        .map(([x, z]) => [-x, z]),
    );
  }

  /**
   * Bulwark: inner face from the deck up to the sheer, a cap rail on top, and a collider. Call inside ctx.lod(1) or lower.
   * o: { deckY (number | z -> y), z0, z1, t (thickness 0.07), capMat ('teakCap'), capW (0.16), capH (0.035), innerMat ('gel'), n, sides: 'both'|'port'|'stbd', solid (true), extra (collider height above the cap, default 0) }
   */
  function bulwark(ctx, o = {}) {
    const dY = typeof o.deckY === 'function' ? o.deckY : () => o.deckY,
      t = o.t ?? 0.07,
      n = o.n ?? 36;
    const za = Math.max(o.z0 ?? -1e9, zStern(dY(-1e9)) + 0.02),
      zb = Math.min(o.z1 ?? 1e9, bowEnd(dY(L / 2), t));
    const capW = o.capW ?? 0.16,
      capH = o.capH ?? 0.035;
    for (const sd of o.sides === 'port' ? [1] : o.sides === 'stbd' ? [-1] : [1, -1]) {
      const A = [],
        B = [],
        C0 = [],
        C1 = [],
        C2 = [],
        C3 = [];
      for (let i = 0; i <= n; i++) {
        const z = lerp(za, zb, 1 - Math.pow(1 - i / n, 1.4)),
          sh = sheerAt(z),
          dy = Math.min(dY(z), sh - 0.02);
        const xo = halfBeam(z, sh),
          xi = Math.max(0.03, halfBeam(z, dy) - t),
          xt = Math.max(0.03, xo - t);
        A.push([sd * xi, dy, z]);
        B.push([sd * xt, sh, z]);
        const c0 = xo + 0.02,
          c1 = Math.max(0.02, xo - capW + 0.02);
        C0.push([sd * c0, sh, z]);
        C1.push([sd * c0, sh + capH, z]);
        C2.push([sd * c1, sh + capH, z]);
        C3.push([sd * c1, sh, z]);
      }
      ctx.ruled(o.innerMat ?? 'gel', A, B, { flip: sd < 0 });
      if (o.capMat !== null) {
        const cm = o.capMat ?? 'teakCap';
        ctx.ruled(cm, C0, C1, { flip: sd > 0 });
        ctx.ruled(cm, C1, C2, { flip: sd > 0 });
        ctx.ruled(cm, C2, C3, { flip: sd > 0 });
      }
      if (o.solid !== false)
        for (let i = 0; i < n; i++) {
          const a = A[i],
            b = A[i + 1],
            ta = B[i],
            tb = B[i + 1];
          const x0 = (a[0] + b[0] + ta[0] + tb[0]) / 4,
            zc = (a[2] + b[2]) / 2,
            yb = Math.min(a[1], b[1]),
            yt = Math.max(ta[1], tb[1]) + capH + (o.extra ?? 0);
          const len = Math.hypot(b[0] - a[0], b[2] - a[2]),
            yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
          ctx.solidBox([t + 0.06, yt - yb, len + 0.02], [x0 + sd * 0.03, (yb + yt) / 2, zc], {
            rot: [0, yaw, 0],
            tag: 'rail',
          });
        }
    }
    return api;
  }
  // where an inset deck at height y runs out at the bow (the bulwark and the bow cap meet here)
  function bowEnd(y, inset = 0.08, minW = 0.12) {
    let a = L * 0.2,
      b = zBow(y);
    for (let k = 0; k < 24; k++) {
      const m = (a + b) / 2;
      if (halfBeam(m, y) - inset > minW) a = m;
      else b = m;
    }
    return a;
  }
  /** Solid cap over the stem head, from where the deck at height deckY ends to the stem tip (anchor platform). */
  function bowCap(ctx, o = {}) {
    const zs = bowEnd(o.deckY, o.inset ?? 0.08) - 0.02,
      ze = zBow(Sb) - 0.01,
      n = o.n ?? 8,
      A = [],
      Bq = [],
      A2 = [],
      B2 = [];
    for (let i = 0; i <= n; i++) {
      const z = lerp(zs, ze, i / n),
        sh = sheerAt(z),
        x = Math.max(0.005, halfBeam(z, sh) + 0.015);
      A.push([x, sh + 0.035, z]);
      Bq.push([-x, sh + 0.035, z]);
      A2.push([x, sh - 0.02, z]);
      B2.push([-x, sh - 0.02, z]);
    }
    ctx.ruled(o.mat ?? 'gel', A, Bq, { flip: true });
    ctx.ruled(o.mat ?? 'gel', A2, A);
    ctx.ruled(o.mat ?? 'gel', B2, Bq, { flip: true });
    // aft face down to the deck
    ctx.quad(
      o.mat ?? 'gel',
      [A[0][0], o.deckY, zs],
      [-A[0][0], o.deckY, zs],
      [-A[0][0], A[0][1], zs],
      [A[0][0], A[0][1], zs],
      { double: true },
    );
    if (o.solid !== false)
      ctx.solidBox(
        [A[0][0] * 2, A[0][1] - o.deckY + 0.3, ze - zs],
        [0, (A[0][1] + o.deckY) / 2, (zs + ze) / 2],
        { tag: 'rail' },
      );
    return api;
  }
  /** Rub rail / spray rail: a bar following the hull at height yFn(z) (number or function), on both sides. */
  function rail(ctx, mat, yFn, r, o = {}) {
    const f = typeof yFn === 'function' ? yFn : () => yFn,
      n = o.n ?? 40;
    const za = (o.z0 ?? zStern(f(z0))) + 0.01,
      zb = o.z1 ?? zBow(f(L / 2)) - 0.05;
    for (const sd of [1, -1]) {
      const P = [];
      for (let i = 0; i <= n; i++) {
        const z = lerp(za, zb, 1 - Math.pow(1 - i / n, 1.5)),
          y = f(z);
        P.push([sd * (halfBeam(z, y) + r * 0.5), y, z]);
      }
      ctx.tube(mat, P, r, { seg: o.seg ?? 6, div: n * 2, tension: 0.5 });
    }
    return api;
  }
  /** Point and outward normal on the hull skin at (z, y), port side (mirror x and nx for starboard). */
  function surface(z, y) {
    const x = halfBeam(z, y),
      e = 0.05;
    const dz = (halfBeam(z + e, y) - halfBeam(z - e, y)) / (2 * e),
      dy = (halfBeam(z, y + e) - halfBeam(z, y - e)) / (2 * e);
    const n = new THREE.Vector3(1, -dy, -dz).normalize();
    return { x, y, z, nx: n.x, ny: n.y, nz: n.z };
  }
  /** Convex pieces (point clouds, yacht-local) approximating the hull for the main physics world. */
  function convexPieces(nSeg = 6, topY = null) {
    const out = [];
    for (let sI = 0; sI < nSeg; sI++) {
      const pts2 = [];
      for (let q = 0; q <= 3; q++) {
        const u = (sI + q / 3) / nSeg,
          k = K(u),
          sh = topY ?? S(u);
        for (const y of [k, lerp(k, 0, 0.6), 0, lerp(0, sh, 0.5), sh]) {
          if (y < k) continue;
          const x = xAt(u, Math.min(y, S(u))),
            z = zAt(u, Math.min(y, S(u)));
          pts2.push(x, y, z, -x, y, z);
        }
      }
      out.push(new Float32Array(pts2));
    }
    return out;
  }
  const api = {
    spec: s,
    L,
    B: s.B,
    draft: D,
    build,
    halfBeam,
    sheerAt,
    zBow,
    zStern,
    outline,
    deckPoly,
    bulwark,
    bowCap,
    bowEnd,
    rail,
    surface,
    convexPieces,
    keelAt: (z) => K(uOf(z, 0)),
    uOf,
    xAt,
    zAt,
  };
  return api;
}
