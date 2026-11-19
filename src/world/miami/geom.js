// Miami city — polyline / polygon geometry helpers writing into Batch (src/world/city/geo.js).
import * as THREE from 'three';

const _c = new THREE.Color();
const C = (c) => (c && c.isColor ? c : _c.set(c));

// Per-vertex miter offsets for a polyline. Returns [{x,z,nx,nz,s}] where (nx,nz) is the RIGHT normal scaled by the miter factor
// and s is the arc length at that vertex.
export function polyFrame(pts) {
  const n = pts.length,
    out = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n - 1, i + 1)];
    let d0x = 0,
      d0z = 0,
      d1x = 0,
      d1z = 0;
    if (i > 0) {
      d0x = p[0] - a[0];
      d0z = p[1] - a[1];
      const l = Math.hypot(d0x, d0z) || 1;
      d0x /= l;
      d0z /= l;
    }
    if (i < n - 1) {
      d1x = b[0] - p[0];
      d1z = b[1] - p[1];
      const l = Math.hypot(d1x, d1z) || 1;
      d1x /= l;
      d1z /= l;
    }
    if (i === 0) {
      d0x = d1x;
      d0z = d1z;
    }
    if (i === n - 1) {
      d1x = d0x;
      d1z = d0z;
    }
    // right-hand normal of travel direction (dx,dz) is (-dz, dx) (heading 0 = +Z, right = -X)
    let nx = -(d0z + d1z),
      nz = d0x + d1x;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    const cosH = Math.max(0.35, nx * -d1z + nz * d1x); // dot with segment normal
    out[i] = { x: p[0], z: p[1], nx: nx / cosH, nz: nz / cosH, s };
  }
  return out;
}

// Ribbon between lateral offsets o0..o1 (o>0 = right of travel direction), from arc length sA to sB. ys: per-vertex heights or a number.
// uvScale: world-space uv (x,z)*uvScale. Normal up. Winding chosen so faces point +Y.
export function ribbon(batch, frame, ys, o0, o1, yOff, color, uvScale, sA = 0, sB = Infinity) {
  const col = C(color).clone();
  const n = frame.length;
  const yAt = (i) => (typeof ys === 'number' ? ys : ys ? ys[i] : 0) + yOff;
  for (let i = 0; i < n - 1; i++) {
    const A = frame[i],
      B = frame[i + 1];
    let t0 = 0,
      t1 = 1;
    const L = B.s - A.s;
    if (L <= 1e-6) continue;
    if (B.s <= sA || A.s >= sB) continue;
    if (A.s < sA) t0 = (sA - A.s) / L;
    if (B.s > sB) t1 = (sB - A.s) / L;
    const lerp = (k, t) => A[k] + (B[k] - A[k]) * t;
    const pa = [
      lerp('x', t0),
      lerp('z', t0),
      lerp('nx', t0),
      lerp('nz', t0),
      yAt(i) + (yAt(i + 1) - yAt(i)) * t0,
    ];
    const pb = [
      lerp('x', t1),
      lerp('z', t1),
      lerp('nx', t1),
      lerp('nz', t1),
      yAt(i) + (yAt(i + 1) - yAt(i)) * t1,
    ];
    const v = (p, o) => [p[0] + p[2] * o, p[4], p[1] + p[3] * o];
    const a0 = v(pa, o0),
      a1 = v(pa, o1),
      b0 = v(pb, o0),
      b1 = v(pb, o1);
    quadUp(batch, a0, a1, b1, b0, col, uvScale);
  }
}

// Upward quad from 4 corners; picks winding so the face normal points +Y.
export function quadUp(batch, a, b, c, d, col, uvScale) {
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const P = ny >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  void nx;
  for (const p of P) batch.vert(p[0], p[1], p[2], 0, 1, 0, p[0] * uvScale, p[2] * uvScale, col);
}

// Vertical face along a polyline at lateral offset o, from y0 to y0+h (curb faces). Faces the side given by sign (+1 left).
export function sideWall(batch, frame, ys, o, h, yOff, color, facing, sA = 0, sB = Infinity) {
  const col = C(color).clone();
  const n = frame.length;
  const yAt = (i) => (typeof ys === 'number' ? ys : ys ? ys[i] : 0) + yOff;
  for (let i = 0; i < n - 1; i++) {
    const A = frame[i],
      B = frame[i + 1];
    const L = B.s - A.s;
    if (L <= 1e-6 || B.s <= sA || A.s >= sB) continue;
    const t0 = A.s < sA ? (sA - A.s) / L : 0,
      t1 = B.s > sB ? (sB - A.s) / L : 1;
    const ax = A.x + (B.x - A.x) * t0 + (A.nx + (B.nx - A.nx) * t0) * o,
      az = A.z + (B.z - A.z) * t0 + (A.nz + (B.nz - A.nz) * t0) * o;
    const bx = A.x + (B.x - A.x) * t1 + (A.nx + (B.nx - A.nx) * t1) * o,
      bz = A.z + (B.z - A.z) * t1 + (A.nz + (B.nz - A.nz) * t1) * o;
    const ya = yAt(i) + (yAt(i + 1) - yAt(i)) * t0,
      yb = yAt(i) + (yAt(i + 1) - yAt(i)) * t1;
    let nx = -(bz - az),
      nz = bx - ax;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    // (nx,nz) = right of travel; facing>0 keeps it, facing<0 flips
    if (facing < 0) {
      nx = -nx;
      nz = -nz;
    }
    const q = [
      [ax, ya, az],
      [bx, yb, bz],
      [bx, yb + h, bz],
      [ax, ya + h, az],
    ];
    // winding: CCW seen from the facing side
    const cr = (q[1][0] - q[0][0]) * nz - (q[1][2] - q[0][2]) * nx; // >0 when going "right" seen from outside
    const order = cr > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order)
      batch.vert(
        q[k][0],
        q[k][1],
        q[k][2],
        nx,
        0,
        nz,
        (k === 1 || k === 2 ? L * (t1 - t0) : 0) * 0.3,
        (k >= 2 ? h : 0) * 0.3,
        col,
      );
  }
}

// Filled polygon (with holes) at height y, normal up. rings in [x,z]. Uses earcut via ShapeUtils.
export function fillPoly(batch, rings, y, color, uvScale) {
  const col = C(color).clone();
  const contour = rings[0].map((p) => new THREE.Vector2(p[0], p[1]));
  const holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  } catch (e) {
    return;
  }
  const all = contour.concat(...holes);
  for (const t of tris) {
    const a = all[t[0]],
      b = all[t[1]],
      c = all[t[2]];
    quadTri(batch, [a.x, y, a.y], [b.x, y, b.y], [c.x, y, c.y], col, uvScale);
  }
}
function quadTri(batch, a, b, c, col, uvScale) {
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const P = ny >= 0 ? [a, b, c] : [a, c, b];
  for (const p of P) batch.vert(p[0], p[1], p[2], 0, 1, 0, p[0] * uvScale, p[2] * uvScale, col);
}

export function polyArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i],
      q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Collect a Batch's raw triangles as a Rapier trimesh (vertices + indices).
export function batchToTrimesh(batch) {
  const v = new Float32Array(batch.p),
    idx = new Uint32Array(v.length / 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  return { v, idx };
}

// Walls around an oriented ring (outward = (-dz,dx) per edge, see city/geo.js orient) from y0..y1 with door gaps.
// gaps: [{x, z, w, h}] door centre on the facade; a gap applies to the edge it lies on (within 1.2 m).
// UVs match wallStrip: u = perimeter/tileW + uOff, v = y/tileH + vOff.
export function wallGaps(batch, pts, y0, y1, tileW, tileH, color, uOff, vOff, gaps) {
  const col = color && color.isColor ? color : new THREE.Color(color);
  let u = uOff;
  const quad = (ax, az, bx, bz, ya, yb, ua, ub, nx, nz) => {
    const va = ya / tileH + vOff,
      vb = yb / tileH + vOff;
    batch.vert(ax, ya, az, nx, 0, nz, ua, va, col);
    batch.vert(bx, ya, bz, nx, 0, nz, ub, va, col);
    batch.vert(bx, yb, bz, nx, 0, nz, ub, vb, col);
    batch.vert(ax, ya, az, nx, 0, nz, ua, va, col);
    batch.vert(bx, yb, bz, nx, 0, nz, ub, vb, col);
    batch.vert(ax, yb, az, nx, 0, nz, ua, vb, col);
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length],
      dx = q[0] - p[0],
      dz = q[1] - p[1],
      L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    const tx = dx / L,
      tz = dz / L,
      nx = -tz,
      nz = tx;
    const cuts = [];
    for (const g of gaps || []) {
      const s = (g.x - p[0]) * tx + (g.z - p[1]) * tz,
        d = Math.abs((g.x - p[0]) * nx + (g.z - p[1]) * nz);
      if (d < 1.2 && s > g.w / 2 && s < L - g.w / 2)
        cuts.push([s - g.w / 2, s + g.w / 2, Math.min(g.h, y1)]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let s0 = 0;
    const P = (s) => [p[0] + tx * s, p[1] + tz * s];
    for (const [c0, c1, ch] of cuts) {
      if (c0 > s0) {
        const A = P(s0),
          Bq = P(c0);
        quad(A[0], A[1], Bq[0], Bq[1], y0, y1, u + s0 / tileW, u + c0 / tileW, nx, nz);
      }
      const A = P(c0),
        Bq = P(c1);
      if (ch < y1) quad(A[0], A[1], Bq[0], Bq[1], ch, y1, u + c0 / tileW, u + c1 / tileW, nx, nz);
      s0 = c1;
    }
    if (s0 < L) {
      const A = P(s0),
        Bq = P(L);
      quad(A[0], A[1], Bq[0], Bq[1], y0, y1, u + s0 / tileW, u + L / tileW, nx, nz);
    }
    u += L / tileW;
  }
}

// Downward-facing filled polygon (ceilings seen from inside).
export function fillPolyDown(batch, rings, y, color) {
  const col = color && color.isColor ? color : new THREE.Color(color);
  const contour = rings[0].map((p) => new THREE.Vector2(p[0], p[1])),
    holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  } catch (e) {
    return;
  }
  const all = contour.concat(...holes);
  for (const t of tris) {
    const a = all[t[0]],
      b = all[t[1]],
      c = all[t[2]];
    const ny = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
    const P = ny <= 0 ? [a, b, c] : [a, c, b];
    for (const v of P) batch.vert(v.x, y, v.y, 0, -1, 0, 0, 0, col);
  }
}
