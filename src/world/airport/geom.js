// Airport geometry helpers (pure, no THREE): runway frames, polygon tests, polyline sampling.
// World: +x east, +z south, heading 0 faces +z (direction (sin h, cos h)).
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// frame along a -> b: P(s, q) = a + s u + q n with n = (u.z, -u.x) (same convention as tools/v2/airport/design.py)
export function frame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz), ux = dx / L, uz = dz / L, nx = uz, nz = -ux;
  return {
    a, b, L, ux, uz, nx, nz, heading: Math.atan2(ux, uz),
    P: (s, q) => [a[0] + s * ux + q * nx, a[1] + s * uz + q * nz],
    s: (x, z) => (x - a[0]) * ux + (z - a[1]) * uz,
    q: (x, z) => (x - a[0]) * nx + (z - a[1]) * nz,
  };
}

export function pip(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; t = clamp(t, 0, 1);
  const ex = ax + dx * t - x, ez = az + dz * t - z; return Math.sqrt(ex * ex + ez * ez);
}
export function ringDist(ring, x, z, closed = true) {
  let d = Infinity; const n = ring.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) { const p = ring[i], q = ring[(i + 1) % n]; d = Math.min(d, segDist(x, z, p[0], p[1], q[0], q[1])); }
  return d;
}
export function bbox(ring) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a, b, c, d]; }
export function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
// point + tangent at distance d along a polyline
export function along(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], dx = pts[i][0] - ax, dz = pts[i][1] - az, l = Math.sqrt(dx * dx + dz * dz);
    if (d <= l || i === pts.length - 1) { const t = l ? clamp(d / l, 0, 1) : 0; return { x: ax + dx * t, z: az + dz * t, tx: dx / (l || 1), tz: dz / (l || 1) }; }
    d -= l;
  }
  return { x: pts[0][0], z: pts[0][1], tx: 1, tz: 0 };
}
export const hash = (n) => { let x = Math.imul(n | 0, 2654435761) ^ (n >>> 13); x = Math.imul(x ^ (x >>> 16), 2246822507); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
