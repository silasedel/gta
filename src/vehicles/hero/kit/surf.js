// Hero-car surfacing: bodies are C2-continuous bicubic B-spline skins built from designer-style master curves
// (plan outline, shoulder line, beltline, roof line, centerline profile), so highlights flow cleanly and nothing is faceted.
// One half (x >= 0) is modeled; trim.js cuts it into panels, glass, lamps and openings and mirrors it.
//
// Topology: a 4-sided patch whose whole boundary lies in the symmetry plane.
//   u: 0 = keel (bottom centerline) -> 1 = top centerline, across K "rings" (keel, floor, sill, waist, crest, belt, rail, ..., center)
//   v: 0 = tail centerline silhouette -> 1 = nose centerline silhouette, across the rows (tail cap, stations, nose cap)
import * as THREE from 'three';

// ---------------------------------------------------------------- 1D curves
/** Shape-preserving cubic through keys [[x, y], ...] (no overshoot; flat stays flat). Clamped outside the range. */
export function pchip(keys) {
  const n = keys.length,
    xs = keys.map((k) => k[0]),
    ys = keys.map((k) => k[1]);
  if (n === 1) return () => ys[0];
  const h = [],
    d = [],
    m = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    d[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1],
        w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i],
      t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}
/** Curve from keys, or pass a number for a constant, or a function through unchanged. */
export const C = (k) => (typeof k === 'function' ? k : typeof k === 'number' ? () => k : pchip(k));
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- clamped uniform cubic B-spline basis
function knotVec(n) {
  const t = [0, 0, 0];
  for (let i = 0; i <= n - 3; i++) t.push(i);
  t.push(n - 3, n - 3, n - 3);
  return t;
}
const _ndu = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  _l = [0, 0, 0, 0],
  _r = [0, 0, 0, 0];
/** Basis (N) and first derivative (D) of the 4 non-zero cubic functions at x in [0, n-3]. Returns the span index (last control index). */
function bfun(T, n, x, N, D) {
  const p = 3;
  let span = Math.floor(x) + p;
  if (span > n - 1) span = n - 1;
  if (span < p) span = p;
  _ndu[0][0] = 1;
  for (let j = 1; j <= p; j++) {
    _l[j] = x - T[span + 1 - j];
    _r[j] = T[span + j] - x;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      _ndu[j][r] = _r[r + 1] + _l[j - r];
      const temp = _ndu[r][j - 1] / _ndu[j][r];
      _ndu[r][j] = saved + _r[r + 1] * temp;
      saved = _l[j - r] * temp;
    }
    _ndu[j][j] = saved;
  }
  for (let r = 0; r <= p; r++) {
    N[r] = _ndu[r][p];
    let dd = 0;
    if (r >= 1) dd += _ndu[r - 1][p - 1] / _ndu[p][r - 1];
    if (r <= p - 1) dd -= _ndu[r][p - 1] / _ndu[p][r];
    D[r] = p * dd;
  }
  return span;
}

// ---------------------------------------------------------------- the skin
/**
 * makeSkin(spec) -> skin
 * spec = {
 *   zs: [z...]                 station positions tail -> nose (ascending); each gives one full section
 *   section(z) -> [[x, y], ...K]   ring points keel -> top center (x >= 0; first and last must have x = 0)
 *   tail: { sil: [[z, y], ...K], n = 6, p = 2.6 | [per ring], gamma = 1 | [per ring] }   centerline silhouette each ring ends on
 *   nose: { sil, n, p, gamma }
 *   deform: [ (p /* [x,y,z] in place *\/, ctx /* { u, v, ring } *\/) => void, ... ]   sculpting applied on top of the spline
 * }
 */
export function makeSkin(spec) {
  const zs = spec.zs,
    S0 = spec.section(zs[0]),
    K = S0.length;
  const rows = [];
  const capRows = (zS, sec, cap, rev) => {
    const n = cap.n || 6,
      out = [];
    const pOf = (k) => (Array.isArray(cap.p) ? cap.p[k] : cap.p || 2.6),
      gOf = (k) => (Array.isArray(cap.gamma) ? cap.gamma[k] : cap.gamma || 1);
    const row = (th, xs) =>
      sec.map(([x, y], k) => {
        const e = 2 / pOf(k),
          c = Math.pow(Math.cos(th), e),
          s = Math.pow(Math.sin(th), e),
          [sz, sy] = cap.sil[k];
        const pr = Math.pow(s, gOf(k));
        return [x * c * xs, y + (sy - y) * pr, zS + (sz - zS) * s];
      });
    for (let i = 1; i < n; i++) out.push(row((Math.PI / 2) * (i / n), 1));
    // tangency rows: same silhouette z / y, small x, then the centerline row itself
    const last = out[out.length - 1];
    out.push(sec.map((_, k) => [last[k][0] * 0.45, cap.sil[k][1], cap.sil[k][0]]));
    out.push(sec.map((_, k) => [0, cap.sil[k][1], cap.sil[k][0]]));
    return rev ? out.reverse() : out;
  };
  const secs = zs.map((z) => spec.section(z).map(([x, y]) => [x, y, z]));
  rows.push(...capRows(zs[0], spec.section(zs[0]), spec.tail, true));
  rows.push(...secs);
  rows.push(...capRows(zs[zs.length - 1], spec.section(zs[zs.length - 1]), spec.nose, false));
  const R = rows.length;
  const Tu = knotVec(K),
    Tv = knotVec(R),
    su = K - 3,
    sv = R - 3;
  const net = new Float64Array(R * K * 3);
  for (let j = 0; j < R; j++)
    for (let k = 0; k < K; k++) {
      const p = rows[j][k];
      net[(j * K + k) * 3] = p[0];
      net[(j * K + k) * 3 + 1] = p[1];
      net[(j * K + k) * 3 + 2] = p[2];
    }
  const Nu = [0, 0, 0, 0],
    Du = [0, 0, 0, 0],
    Nv = [0, 0, 0, 0],
    Dv = [0, 0, 0, 0];
  const deform = spec.deform || [];
  const grev = [];
  for (let k = 0; k < K; k++) grev.push((Tu[k + 1] + Tu[k + 2] + Tu[k + 3]) / 3 / su);
  const grevV = [];
  for (let j = 0; j < R; j++) grevV.push((Tv[j + 1] + Tv[j + 2] + Tv[j + 3]) / 3 / sv);
  const ctx = { u: 0, v: 0, ring: 0 };
  /** ring coordinate (0..K-1, continuous) of a normalized u */
  const ringOf = (u) => {
    let k = 0;
    while (k < K - 2 && u > grev[k + 1]) k++;
    return k + clamp01((u - grev[k]) / (grev[k + 1] - grev[k] || 1));
  };
  const uOfRing = (rk) => {
    const k = Math.max(0, Math.min(K - 2, Math.floor(rk)));
    return mix(grev[k], grev[k + 1], rk - k);
  };

  /** Raw spline point (no deformers). out = [x, y, z] */
  function base(u, v, out) {
    const iu = bfun(Tu, K, clamp01(u) * su, Nu, Du),
      iv = bfun(Tv, R, clamp01(v) * sv, Nv, Dv);
    let x = 0,
      y = 0,
      z = 0;
    for (let b = 0; b < 4; b++) {
      const rowI = (iv - 3 + b) * K,
        wv = Nv[b];
      for (let a = 0; a < 4; a++) {
        const w = wv * Nu[a],
          q = (rowI + iu - 3 + a) * 3;
        x += w * net[q];
        y += w * net[q + 1];
        z += w * net[q + 2];
      }
    }
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  }
  /** Final surface point (spline + deformers). */
  function point(u, v, out) {
    base(u, v, out);
    if (deform.length) {
      ctx.u = u;
      ctx.v = v;
      ctx.ring = ringOf(u);
      for (const f of deform) f(out, ctx);
    }
    if (out[0] < 0) out[0] = 0;
    return out;
  }
  const _a = [0, 0, 0],
    _b = [0, 0, 0],
    _c = [0, 0, 0],
    _d = [0, 0, 0];
  const EU = 0.0035 / su,
    EV = 0.0035 / sv;
  /** Unit normal by central differences of the deformed surface (outward). */
  function normal(u, v, out) {
    const u0 = Math.max(0, u - EU),
      u1 = Math.min(1, u + EU),
      v0 = Math.max(0, v - EV),
      v1 = Math.min(1, v + EV);
    point(u0, v, _a);
    point(u1, v, _b);
    point(u, v0, _c);
    point(u, v1, _d);
    const ax = _b[0] - _a[0],
      ay = _b[1] - _a[1],
      az = _b[2] - _a[2],
      bx = _d[0] - _c[0],
      by = _d[1] - _c[1],
      bz = _d[2] - _c[2];
    // u runs keel -> side -> top, v runs tail -> nose: outward = Su x Sv
    let nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) {
      // degenerate corner: step inside and retry once
      const uu = clamp01(u + (u > 0.5 ? -0.01 : 0.01)),
        vv = clamp01(v + (v > 0.5 ? -0.01 : 0.01));
      if (uu !== u || vv !== v) return normal(uu, vv, out);
      nx = 0;
      ny = 1;
      nz = 0;
      l = 1;
    }
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
    return out;
  }

  /**
   * Tessellate the half skin. nu / nv = samples per spline span (may be fractional).
   * Returns { nU, nV, P, N, UV (normalized u,v), M (metric uv, meters) } on a regular (nV+1) x (nU+1) grid, row-major by v.
   */
  function grid(nu = 6, nv = 3) {
    const nU = Math.max(4, Math.round(su * nu)),
      nV = Math.max(4, Math.round(sv * nv));
    const cnt = (nU + 1) * (nV + 1);
    const P = new Float32Array(cnt * 3),
      N = new Float32Array(cnt * 3),
      UV = new Float32Array(cnt * 2),
      M = new Float32Array(cnt * 2);
    const p = [0, 0, 0],
      n = [0, 0, 0];
    for (let j = 0; j <= nV; j++)
      for (let i = 0; i <= nU; i++) {
        const u = i / nU,
          v = j / nV,
          q = j * (nU + 1) + i;
        point(u, v, p);
        normal(u, v, n);
        if (i === 0 || i === nU || j === 0 || j === nV) {
          p[0] = 0;
          n[0] = 0;
          const l = Math.hypot(n[1], n[2]) || 1;
          n[1] /= l;
          n[2] /= l;
        }
        P.set(p, q * 3);
        N.set(n, q * 3);
        UV[q * 2] = u;
        UV[q * 2 + 1] = v;
      }
    // metric texture coordinates: distance along the section (from the keel) and along the body (from the tail, at each column)
    for (let j = 0; j <= nV; j++) {
      let acc = 0;
      for (let i = 0; i <= nU; i++) {
        const q = j * (nU + 1) + i;
        if (i)
          acc += Math.hypot(
            P[q * 3] - P[q * 3 - 3],
            P[q * 3 + 1] - P[q * 3 - 2],
            P[q * 3 + 2] - P[q * 3 - 1],
          );
        M[q * 2 + 1] = acc;
      }
    }
    for (let i = 0; i <= nU; i++) {
      let acc = 0;
      for (let j = 0; j <= nV; j++) {
        const q = j * (nU + 1) + i,
          q0 = q - (nU + 1);
        if (j)
          acc += Math.hypot(
            P[q * 3] - P[q0 * 3],
            P[q * 3 + 1] - P[q0 * 3 + 1],
            P[q * 3 + 2] - P[q0 * 3 + 2],
          );
        M[q * 2] = acc;
      }
    }
    return { nU, nV, P, N, UV, M };
  }
  return { K, R, rows, zs, point, base, normal, grid, ringOf, uOfRing, grev, grevV, deform, spec };
}

// ---------------------------------------------------------------- 2D signed-distance shapes (negative inside)
function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[(i + 1) % n];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}
/** Offset a simple polygon inward by r (edge-offset intersection; fine for convex and mildly concave shapes). */
export function insetPoly(pts, r) {
  const n = pts.length,
    s = polyArea(pts) > 0 ? 1 : -1,
    out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n],
      b = pts[i],
      c = pts[(i + 1) % n];
    let e1x = b[0] - a[0],
      e1y = b[1] - a[1],
      e2x = c[0] - b[0],
      e2y = c[1] - b[1];
    const l1 = Math.hypot(e1x, e1y) || 1,
      l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1;
    e1y /= l1;
    e2x /= l2;
    e2y /= l2;
    // inward normals (left of the edge for CCW)
    const n1x = -e1y * s,
      n1y = e1x * s,
      n2x = -e2y * s,
      n2y = e2x * s;
    const bx = n1x + n2x,
      by = n1y + n2y,
      k = r / Math.max(0.25, 1 + n1x * n2x + n1y * n2y);
    out.push([b[0] + bx * k, b[1] + by * k]);
  }
  return out;
}
/** Closed Catmull-Rom resample of a control polygon (organic outlines). */
export function smoothPoly(pts, per = 6) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], 0)),
    true,
    'centripetal',
  );
  return curve
    .getPoints(pts.length * per)
    .slice(0, -1)
    .map((v) => [v.x, v.y]);
}
export const sd = {
  poly(pts) {
    const n = pts.length;
    return (px, py) => {
      let d = (px - pts[0][0]) ** 2 + (py - pts[0][1]) ** 2,
        s = 1;
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const vi = pts[i],
          vj = pts[j],
          ex = vj[0] - vi[0],
          ey = vj[1] - vi[1],
          wx = px - vi[0],
          wy = py - vi[1];
        const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey || 1)),
          bx = wx - ex * t,
          by = wy - ey * t;
        d = Math.min(d, bx * bx + by * by);
        const c1 = py >= vi[1],
          c2 = py < vj[1],
          c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * Math.sqrt(d);
    };
  },
  /** polygon with rounded (convex) corners of radius r; the outline still touches the original edges */
  rpoly(pts, r) {
    if (!(r > 0)) return sd.poly(pts);
    const f = sd.poly(insetPoly(pts, r));
    return (x, y) => f(x, y) - r;
  },
  circle(cx, cy, r) {
    return (x, y) => Math.hypot(x - cx, y - cy) - r;
  },
  ellipse(cx, cy, rx, ry) {
    return (x, y) => {
      const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
      return (k - 1) * Math.min(rx, ry);
    };
  },
  box(cx, cy, hx, hy, r = 0) {
    return (x, y) => {
      const dx = Math.abs(x - cx) - hx + r,
        dy = Math.abs(y - cy) - hy + r;
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
    };
  },
  /** capsule from (x0,y0) to (x1,y1) with radius r */
  seg(x0, y0, x1, y1, r) {
    const ex = x1 - x0,
      ey = y1 - y0,
      l2 = ex * ex + ey * ey || 1;
    return (x, y) => {
      const t = clamp01(((x - x0) * ex + (y - y0) * ey) / l2);
      return Math.hypot(x - x0 - ex * t, y - y0 - ey * t) - r;
    };
  },
  /** half-plane: negative on the left of the directed line (x0,y0) -> (x1,y1) */
  half(x0, y0, x1, y1) {
    const ex = x1 - x0,
      ey = y1 - y0,
      l = Math.hypot(ex, ey) || 1;
    return (x, y) => -((x - x0) * -ey + (y - y0) * ex) / l;
  },
  union:
    (...f) =>
    (x, y) => {
      let d = Infinity;
      for (const g of f) d = Math.min(d, g(x, y));
      return d;
    },
  inter:
    (...f) =>
    (x, y) => {
      let d = -Infinity;
      for (const g of f) d = Math.max(d, g(x, y));
      return d;
    },
  sub: (f, g) => (x, y) => Math.max(f(x, y), -g(x, y)),
  grow: (f, r) => (x, y) => f(x, y) - r,
  /** open polyline as a stroke of half-width r */
  stroke(pts, r) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++)
      segs.push(sd.seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r));
    return sd.union(...segs);
  },
};

// ---------------------------------------------------------------- orthographic height maps of the finished skin
/**
 * Rasterize a tessellated half skin into view grids so details can be placed on the surface:
 *   hm.side(z, y) -> x (outer surface, x >= 0) ; hm.top(x, z) -> y ; hm.front(x, y) -> z (nose side) ; hm.rear(x, y) -> z (tail side)
 * Each also has .n(a, b) -> [nx, ny, nz].  Returns NaN where the view misses the body.
 */
export function heightMaps(g, res = 0.01) {
  const { nU, nV, P, N } = g;
  let minX = 0,
    maxX = 0,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    maxX = Math.max(maxX, P[i]);
    minY = Math.min(minY, P[i + 1]);
    maxY = Math.max(maxY, P[i + 1]);
    minZ = Math.min(minZ, P[i + 2]);
    maxZ = Math.max(maxZ, P[i + 2]);
  }
  const mk = (a0, a1, b0, b1, ia, ib, ic, sign) => {
    const W = Math.ceil((a1 - a0) / res) + 3,
      H = Math.ceil((b1 - b0) / res) + 3;
    const D = new Float32Array(W * H).fill(NaN),
      NN = new Float32Array(W * H * 3);
    const tri = (q0, q1, q2) => {
      const A0 = P[q0 * 3 + ia],
        B0 = P[q0 * 3 + ib],
        A1 = P[q1 * 3 + ia],
        B1 = P[q1 * 3 + ib],
        A2 = P[q2 * 3 + ia],
        B2 = P[q2 * 3 + ib];
      const den = (B1 - B2) * (A0 - A2) + (A2 - A1) * (B0 - B2);
      if (Math.abs(den) < 1e-12) return;
      const x0 = Math.max(0, Math.floor((Math.min(A0, A1, A2) - a0) / res)),
        x1 = Math.min(W - 1, Math.ceil((Math.max(A0, A1, A2) - a0) / res));
      const y0 = Math.max(0, Math.floor((Math.min(B0, B1, B2) - b0) / res)),
        y1 = Math.min(H - 1, Math.ceil((Math.max(B0, B1, B2) - b0) / res));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const a = a0 + x * res,
            b = b0 + y * res;
          const w0 = ((B1 - B2) * (a - A2) + (A2 - A1) * (b - B2)) / den,
            w1 = ((B2 - B0) * (a - A2) + (A0 - A2) * (b - B2)) / den,
            w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const c = w0 * P[q0 * 3 + ic] + w1 * P[q1 * 3 + ic] + w2 * P[q2 * 3 + ic],
            k = y * W + x;
          if (Number.isNaN(D[k]) || c * sign > D[k] * sign) {
            D[k] = c;
            for (let m = 0; m < 3; m++)
              NN[k * 3 + m] = w0 * N[q0 * 3 + m] + w1 * N[q1 * 3 + m] + w2 * N[q2 * 3 + m];
          }
        }
    };
    for (let j = 0; j < nV; j++)
      for (let i = 0; i < nU; i++) {
        const q = j * (nU + 1) + i;
        tri(q, q + 1, q + nU + 1);
        tri(q + 1, q + nU + 2, q + nU + 1);
      }
    const idx = (a, b) => {
      const x = Math.round((a - a0) / res),
        y = Math.round((b - b0) / res);
      return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
    };
    const f = (a, b) => {
      const fx = (a - a0) / res,
        fy = (b - b0) / res,
        x = Math.floor(fx),
        y = Math.floor(fy);
      if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return NaN;
      const tx = fx - x,
        ty = fy - y,
        k = y * W + x,
        d00 = D[k],
        d10 = D[k + 1],
        d01 = D[k + W],
        d11 = D[k + W + 1];
      if (Number.isNaN(d00) || Number.isNaN(d10) || Number.isNaN(d01) || Number.isNaN(d11)) {
        const kk = idx(a, b);
        return kk < 0 ? NaN : D[kk];
      }
      return (d00 * (1 - tx) + d10 * tx) * (1 - ty) + (d01 * (1 - tx) + d11 * tx) * ty;
    };
    f.n = (a, b) => {
      const k = idx(a, b);
      if (k < 0 || Number.isNaN(D[k])) return [0, 1, 0];
      const l = Math.hypot(NN[k * 3], NN[k * 3 + 1], NN[k * 3 + 2]) || 1;
      return [NN[k * 3] / l, NN[k * 3 + 1] / l, NN[k * 3 + 2] / l];
    };
    return f;
  };
  // mirror x for views that see both halves is the caller's business: top/front/rear take |x|
  const sideF = mk(minZ - res, maxZ + res, minY - res, maxY + res, 2, 1, 0, 1);
  const topF = mk(-res, maxX + res, minZ - res, maxZ + res, 0, 2, 1, 1);
  const frontF = mk(-res, maxX + res, minY - res, maxY + res, 0, 1, 2, 1);
  const rearF = mk(-res, maxX + res, minY - res, maxY + res, 0, 1, 2, -1);
  const sgn = (f) => {
    const h = (a, b) => f(Math.abs(a), b);
    h.n = (a, b) => {
      const n = f.n(Math.abs(a), b);
      return a < 0 ? [-n[0], n[1], n[2]] : n;
    };
    return h;
  };
  return {
    side: sideF,
    top: sgn(topF),
    front: sgn(frontF),
    rear: sgn(rearF),
    bounds: { maxX, minY, maxY, minZ, maxZ },
  };
}
