// ELEVATED agent: 1-D smoothing solvers used for vertical profiles and banking.
// minimise  sum w_i (y_i - t_i)^2 + lambda * sum (y_{i-1} - 2 y_i + y_{i+1})^2   (cubic-spline-like vertical curves)
// subject to equality pins and lo/hi bounds (active-set: violated bounds are pinned and the system is re-solved).

const BIG = 1e7, PIN_W = 3e3; // bound pins are stiff but not absolute: the spline rounds a bound's corner (cm) instead of kinking

// symmetric positive-definite pentadiagonal solve (banded Cholesky, bandwidth 2). d0 = diagonal, d1/d2 = 1st/2nd super-diagonals.
function solvePenta(n, d0, d1, d2, b, out) {
  // L L^T with L lower-triangular band 2: l0 (diag), l1 (sub 1), l2 (sub 2)
  const l0 = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a2 = i >= 2 ? d2[i - 2] : 0, a1 = i >= 1 ? d1[i - 1] : 0;
    const x2 = i >= 2 ? a2 / l0[i - 2] : 0; // L[i][i-2]
    const x1 = i >= 1 ? (a1 - (i >= 2 ? x2 * l1[i - 1] : 0)) / l0[i - 1] : 0; // L[i][i-1]
    let dd = d0[i] - x2 * x2 - x1 * x1; if (dd < 1e-12) dd = 1e-12;
    l2[i] = x2; l1[i] = x1; l0[i] = Math.sqrt(dd);
  }
  // forward: L z = b
  const z = out;
  for (let i = 0; i < n; i++) { let v = b[i]; if (i >= 1) v -= l1[i] * z[i - 1]; if (i >= 2) v -= l2[i] * z[i - 2]; z[i] = v / l0[i]; }
  // backward: L^T y = z
  for (let i = n - 1; i >= 0; i--) { let v = z[i]; if (i + 1 < n) v -= l1[i + 1] * z[i + 1]; if (i + 2 < n) v -= l2[i + 2] * z[i + 2]; z[i] = v / l0[i]; }
  return z;
}

// t: targets, w: base fidelity weights (Float64Array), eq: Float64Array (NaN = free), lo/hi: Float64Array (+-Infinity = none)
export function smoothConstrained(t, w, eq, lo, hi, lambda, maxIter = 24, tension = 0) {
  const n = t.length, y = new Float64Array(n);
  if (n === 1) { y[0] = Number.isNaN(eq[0]) ? Math.min(hi[0], Math.max(lo[0], t[0])) : eq[0]; return y; }
  if (n === 2) { for (let i = 0; i < 2; i++) y[i] = Number.isNaN(eq[i]) ? Math.min(hi[i], Math.max(lo[i], t[i])) : eq[i]; return y; }
  const d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n), b = new Float64Array(n);
  const pin = new Float64Array(n).fill(NaN); // active bound pins
  for (let it = 0; it < maxIter; it++) {
    d0.fill(0); d1.fill(0); d2.fill(0);
    for (let i = 0; i + 2 < n; i++) { // lambda * D^T D, row (i, i+1, i+2) coefficients (1, -2, 1)
      d0[i] += lambda; d0[i + 1] += 4 * lambda; d0[i + 2] += lambda;
      d1[i] += -2 * lambda; d1[i + 1] += -2 * lambda; d2[i] += lambda;
    }
    if (tension) for (let i = 0; i + 1 < n; i++) { d0[i] += tension; d0[i + 1] += tension; d1[i] -= tension; } // first-difference (tension) term: no spline overshoot
    for (let i = 0; i < n; i++) {
      let wi = w[i], ti = t[i];
      if (!Number.isNaN(eq[i])) { wi = BIG; ti = eq[i]; } else if (!Number.isNaN(pin[i])) { wi = PIN_W; ti = pin[i]; }
      d0[i] += wi; b[i] = wi * ti;
    }
    solvePenta(n, d0, d1, d2, b, y);
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(eq[i]) || !Number.isNaN(pin[i])) continue;
      if (y[i] < lo[i] - 0.02) { pin[i] = lo[i] + 0.02; changed = true; } else if (y[i] > hi[i] + 0.02) { pin[i] = hi[i] - 0.02; changed = true; }
    }
    if (!changed) break;
  }
  return y;
}

// box filter (clamped ends), radius r samples, applied `passes` times
export function boxSmooth(a, r, passes = 2) {
  const n = a.length; let src = Float64Array.from(a), dst = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) { s += src[k]; c++; } dst[i] = s / c; }
    const t = src; src = dst; dst = t;
  }
  return src;
}
