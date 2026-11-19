// ELEVATED agent: growable vertex buffers with exact tile clipping (watertight seams: both neighbours cut the same
// triangle edge with the same canonical arithmetic, so border vertices are bit-identical).
export class GeoBuf {
  constructor(cap = 4096) {
    this.n = 0;
    this.cap = cap;
    this.p = new Float32Array(cap * 3);
    this.no = new Float32Array(cap * 3);
    this.uv = new Float32Array(cap * 2);
    this.c = new Float32Array(cap * 3);
  }
  grow(k) {
    if (this.n + k <= this.cap) return;
    let cap = this.cap * 2;
    while (cap < this.n + k) cap *= 2;
    for (const [key, m] of [
      ['p', 3],
      ['no', 3],
      ['uv', 2],
      ['c', 3],
    ]) {
      const a = new this[key].constructor(cap * m);
      a.set(this[key]);
      this[key] = a;
    }
    this.cap = cap;
  }
  // v = [x,y,z,nx,ny,nz,u,v,r,g,b]
  push(v) {
    if (this.n >= this.cap) this.grow(1);
    const i = this.n++;
    this.p[i * 3] = v[0];
    this.p[i * 3 + 1] = v[1];
    this.p[i * 3 + 2] = v[2];
    this.no[i * 3] = v[3];
    this.no[i * 3 + 1] = v[4];
    this.no[i * 3 + 2] = v[5];
    this.uv[i * 2] = v[6];
    this.uv[i * 2 + 1] = v[7];
    this.c[i * 3] = v[8];
    this.c[i * 3 + 1] = v[9];
    this.c[i * 3 + 2] = v[10];
  }
}

// collider position-only buffer
export class PosBuf {
  constructor(cap = 4096) {
    this.n = 0;
    this.p = new Float32Array(cap * 3);
  }
  push(v) {
    if ((this.n + 1) * 3 > this.p.length) {
      const a = new Float32Array(this.p.length * 2);
      a.set(this.p);
      this.p = a;
    }
    const i = this.n++;
    this.p[i * 3] = v[0];
    this.p[i * 3 + 1] = v[1];
    this.p[i * 3 + 2] = v[2];
  }
}

const VS = 11;
const poly0 = [],
  poly1 = []; // scratch polygons (arrays of Float64Array(11))
const pool = [];
let poolI = 0;
const take = () => {
  if (poolI >= pool.length) pool.push(new Float64Array(VS));
  return pool[poolI++];
};
// canonical intersection of edge (a,b) with axis plane (axis 0 = x, 2 = z) at value X
function cut(a, b, axis, X) {
  let p = a,
    q = b;
  if (q[axis] < p[axis] || (q[axis] === p[axis] && q[0] + q[2] < p[0] + p[2])) {
    p = b;
    q = a;
  }
  const t = (X - p[axis]) / (q[axis] - p[axis]),
    o = take();
  for (let k = 0; k < VS; k++) o[k] = p[k] + (q[k] - p[k]) * t;
  o[axis] = X;
  return o;
}
function clipPlane(src, dst, axis, X, keepGreater) {
  dst.length = 0;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const a = src[i],
      b = src[(i + 1) % n],
      ia = keepGreater ? a[axis] >= X : a[axis] <= X,
      ib = keepGreater ? b[axis] >= X : b[axis] <= X;
    if (ia) dst.push(a);
    if (ia !== ib) dst.push(cut(a, b, axis, X));
  }
}
// emit triangle (a,b,c) into buf clipped to the box [x0,x1]x[z0,z1]
export function triClip(buf, a, b, c, B) {
  const inside = (v) => v[0] >= B.x0 && v[0] <= B.x1 && v[2] >= B.z0 && v[2] <= B.z1;
  if (inside(a) && inside(b) && inside(c)) {
    buf.push(a);
    buf.push(b);
    buf.push(c);
    return;
  }
  const mnx = Math.min(a[0], b[0], c[0]),
    mxx = Math.max(a[0], b[0], c[0]),
    mnz = Math.min(a[2], b[2], c[2]),
    mxz = Math.max(a[2], b[2], c[2]);
  if (mxx < B.x0 || mnx > B.x1 || mxz < B.z0 || mnz > B.z1) return;
  poolI = 0;
  poly0.length = 0;
  poly0.push(a, b, c);
  clipPlane(poly0, poly1, 0, B.x0, true);
  if (poly1.length < 3) return;
  clipPlane(poly1, poly0, 0, B.x1, false);
  if (poly0.length < 3) return;
  clipPlane(poly0, poly1, 2, B.z0, true);
  if (poly1.length < 3) return;
  clipPlane(poly1, poly0, 2, B.z1, false);
  if (poly0.length < 3) return;
  for (let i = 1; i + 1 < poly0.length; i++) {
    buf.push(poly0[0]);
    buf.push(poly0[i]);
    buf.push(poly0[i + 1]);
  }
}
