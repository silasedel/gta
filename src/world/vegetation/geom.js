// Small geometry builder for plants: positions, normals, uvs, vertex colors and the aWind attribute
// (attachment height m, flutter 0..1, phase), plus tubes along a spine with parallel-transport frames.
import * as THREE from 'three';

export const rng = (seed) => {
  let s = (Math.floor(Math.abs(seed) * 9973) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const V3 = THREE.Vector3;
export const UP = new V3(0, 1, 0);

export class GB {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.w = [];
    this.idx = [];
  }
  get count() {
    return this.p.length / 3;
  }
  vert(p, n, u, v, col = [1, 1, 1], wind = [0, 0, 0]) {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.c.push(col[0], col[1], col[2]);
    this.w.push(wind[0], wind[1], wind[2]);
    return this.count - 1;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.idx.push(a, b, d, b, c, d);
  }
  get tris() {
    return this.idx.length / 3;
  }
  // grid of (rows+1) x (cols+1) vertices already pushed starting at base, row-major
  grid(base, rows, cols) {
    const W = cols + 1;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = base + i * W + j;
        this.quad(a, a + 1, a + W + 1, a + W);
      }
  }
  // merge another builder, transformed by matrix m4 (normals by its rotation)
  append(o, m4) {
    const base = this.count,
      nm = m4 ? new THREE.Matrix3().getNormalMatrix(m4) : null,
      v = new V3(),
      n = new V3();
    for (let i = 0; i < o.count; i++) {
      v.set(o.p[i * 3], o.p[i * 3 + 1], o.p[i * 3 + 2]);
      n.set(o.n[i * 3], o.n[i * 3 + 1], o.n[i * 3 + 2]);
      if (m4) {
        v.applyMatrix4(m4);
        n.applyMatrix3(nm).normalize();
      }
      this.p.push(v.x, v.y, v.z);
      this.n.push(n.x, n.y, n.z);
    }
    this.uv.push(...o.uv);
    this.c.push(...o.c);
    this.w.push(...o.w);
    for (const i of o.idx) this.idx.push(base + i);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 3));
    g.setIndex(
      this.count > 65535
        ? new THREE.Uint32BufferAttribute(this.idx, 1)
        : new THREE.Uint16BufferAttribute(this.idx, 1),
    );
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// frames along a polyline (parallel transport)
export function frames(pts) {
  const T = [],
    N = [],
    B = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  let n0 = Math.abs(T[0].y) < 0.9 ? new V3().crossVectors(T[0], UP).normalize() : new V3(1, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const ax = new V3().crossVectors(T[i - 1], T[i]);
      const l = ax.length();
      if (l > 1e-6) {
        ax.divideScalar(l);
        n0 = n0.clone().applyAxisAngle(ax, Math.asin(Math.min(1, l)));
      }
    }
    N.push(n0.clone());
    B.push(new V3().crossVectors(T[i], n0).normalize());
  }
  return { T, N, B };
}

// tube: pts (V3[]), radius(i, angle) -> r, uvFn(i, j) -> [u, v], colFn(i, j) -> rgb, windFn(i) -> [h, fl, ph]
export function tube(gb, pts, radial, radius, uvFn, colFn, windFn, cap = false) {
  const { N, B } = frames(pts),
    base = gb.count,
    p = new V3(),
    n = new V3();
  for (let i = 0; i < pts.length; i++)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2,
        ca = Math.cos(a),
        sa = Math.sin(a),
        r = radius(i, a);
      n.copy(N[i]).multiplyScalar(ca).addScaledVector(B[i], sa);
      p.copy(pts[i]).addScaledVector(n, r);
      const [u, v] = uvFn(i, j);
      gb.vert(p, n, u, v, colFn ? colFn(i, j) : [1, 1, 1], windFn ? windFn(i) : [0, 0, 0]);
    }
  gb.grid(base, pts.length - 1, radial);
  if (cap) {
    const last = pts.length - 1,
      c = gb.vert(
        pts[last],
        new V3().subVectors(pts[last], pts[last - 1]).normalize(),
        ...uvFn(last, 0),
        colFn ? colFn(last, 0) : [1, 1, 1],
        windFn ? windFn(last) : [0, 0, 0],
      );
    for (let j = 0; j < radial; j++)
      gb.tri(base + last * (radial + 1) + j, base + last * (radial + 1) + j + 1, c);
  }
}

// cheap low-poly blob (octahedron subdivided once) for fruit / berries
const _ico = new THREE.IcosahedronGeometry(1, 0);
export function blob(gb, c, rx, ry, rz, uv, col, wind) {
  const P = _ico.attributes.position,
    base = gb.count,
    p = new V3(),
    n = new V3();
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(P, i).normalize();
    p.set(c.x + n.x * rx, c.y + n.y * ry, c.z + n.z * rz);
    gb.vert(
      p,
      n,
      uv[0] + (n.x * 0.5 + 0.5) * (uv[2] - uv[0]),
      uv[1] + (n.y * 0.5 + 0.5) * (uv[3] - uv[1]),
      col,
      wind,
    );
  }
  for (let i = 0; i < P.count; i += 3) gb.tri(base + i, base + i + 1, base + i + 2);
}

// a camera-independent "cross card" cluster: k quads through a center, rotated, uv rect [u0,v0,u1,v1]; normals bent outward from `ctr`
export function cards(gb, c, size, k, rot, uvr, col, wind, ctr, tilt = 0.3, rnd = Math.random) {
  for (let q = 0; q < k; q++) {
    const a = rot + (q / k) * Math.PI + (rnd() - 0.5) * 0.4,
      tx = (rnd() - 0.5) * tilt * 2,
      ca = Math.cos(a),
      sa = Math.sin(a);
    const ax = new V3(ca, 0, sa),
      ay = new V3(-sa * Math.sin(tx), Math.cos(tx), ca * Math.sin(tx));
    const hw = (size * (0.85 + rnd() * 0.3)) / 2,
      hh = hw * (uvr.aspect || 1),
      base = gb.count;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = c
        .clone()
        .addScaledVector(ax, sx * hw)
        .addScaledVector(ay, sy * hh + hh * (uvr.lift ?? 0));
      const n = p
        .clone()
        .sub(ctr)
        .normalize()
        .multiplyScalar(0.7)
        .add(new V3(0, 0.45, 0))
        .normalize();
      gb.vert(
        p,
        n,
        sx < 0 ? uvr[0] : uvr[2],
        sy < 0 ? uvr[1] : uvr[3],
        col,
        typeof wind === 'function' ? wind(sy) : wind,
      );
    }
    gb.quad(base, base + 1, base + 2, base + 3);
  }
}
