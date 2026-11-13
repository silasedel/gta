// Port Solana city — geometry helpers (batched merges, world-UV walls, palms)
import * as THREE from 'three';

const _c = new THREE.Color();

// Accumulates non-indexed triangles with position/normal/uv/color -> one Mesh.
export class Batch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  vert(x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(col.r, col.g, col.b);
  }
  // add any BufferGeometry (cloned + transformed). uvScale optional [su, sv]
  addGeometry(geom, matrix, color = 0xffffff, uvScale = null, uvOff = null) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (matrix) g.applyMatrix4(matrix);
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv ? g.attributes.uv.array : null;
    const col = color.isColor ? color : _c.set(color);
    for (let i = 0, k = 0; i < P.length; i += 3, k += 2) {
      let u = U ? U[k] : 0, v = U ? U[k + 1] : 0;
      if (uvScale) { u *= uvScale[0]; v *= uvScale[1]; }
      if (uvOff) { u += uvOff[0]; v += uvOff[1]; }
      this.vert(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], u, v, col);
    }
    g.dispose();
  }
  // world-planar UV for a geometry (projects xz for up faces, else along wall) — used for slabs
  addGeometryWorldUV(geom, matrix, color, scale) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (matrix) g.applyMatrix4(matrix);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    const col = color.isColor ? color : _c.set(color);
    for (let i = 0; i < P.length; i += 3) {
      const nx = N[i], ny = N[i + 1], nz = N[i + 2];
      let u, v;
      if (Math.abs(ny) > 0.5) { u = P[i] * scale; v = P[i + 2] * scale; }
      else if (Math.abs(nx) > Math.abs(nz)) { u = P[i + 2] * scale; v = P[i + 1] * scale; }
      else { u = P[i] * scale; v = P[i + 1] * scale; }
      this.vert(P[i], P[i + 1], P[i + 2], nx, ny, nz, u, v, col);
    }
    g.dispose();
  }
  // horizontal quad (y up), world uv
  hquad(x0, z0, x1, z1, y, color, scale = 1) {
    const col = color.isColor ? color : _c.set(color);
    const s = scale;
    // two triangles, CCW from above => normal +y : (x0,z1),(x1,z1),(x1,z0) etc.
    this.vert(x0, y, z0, 0, 1, 0, x0 * s, z0 * s, col);
    this.vert(x0, y, z1, 0, 1, 0, x0 * s, z1 * s, col);
    this.vert(x1, y, z1, 0, 1, 0, x1 * s, z1 * s, col);
    this.vert(x0, y, z0, 0, 1, 0, x0 * s, z0 * s, col);
    this.vert(x1, y, z1, 0, 1, 0, x1 * s, z1 * s, col);
    this.vert(x1, y, z0, 0, 1, 0, x1 * s, z0 * s, col);
  }
  get empty() { return this.p.length === 0; }
  build(material, { cast = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, material);
    m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }
}

// Closed polygon [[x,z],...] oriented so (-dz,dx) of each edge points outward (negative signed area).
export function orient(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a > 0 ? pts.slice().reverse() : pts;
}

export function rectPts(cx, cz, w, d) {
  const hw = w / 2, hd = d / 2;
  return orient([[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]]);
}

export function roundRectPts(cx, cz, w, d, r, seg = 4) {
  const hw = w / 2, hd = d / 2; r = Math.min(r, hw - 0.1, hd - 0.1);
  const pts = [];
  const corners = [[cx + hw - r, cz + hd - r, 0], [cx - hw + r, cz + hd - r, Math.PI / 2], [cx - hw + r, cz - hd + r, Math.PI], [cx + hw - r, cz - hd + r, Math.PI * 1.5]];
  for (const [ox, oz, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * (Math.PI / 2); pts.push([ox + Math.cos(a) * r, oz + Math.sin(a) * r]);
  }
  return orient(pts);
}

// Walls around polygon from y0..y1. uv in tiles: u = perimeter/tileW + uOff, v = y/tileH + vOff
export function wallStrip(batch, pts, y0, y1, tileW, tileH, color, uOff = 0, vOff = 0) {
  const n = pts.length; const col = color.isColor ? color : new THREE.Color(color);
  const en = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]; const dx = q[0] - p[0], dz = q[1] - p[1]; const L = Math.hypot(dx, dz) || 1;
    en.push([-dz / L, dx / L, L]);
  }
  let u = uOff;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], e = en[i], prev = en[(i - 1 + n) % n], next = en[(i + 1) % n];
    const smooth = (a, b) => (a[0] * b[0] + a[1] * b[1] > 0.6 ? norm2(a[0] + b[0], a[1] + b[1]) : [a[0], a[1]]);
    const n0 = smooth(e, prev), n1 = smooth(e, next);
    const u0 = u, u1 = u + e[2] / tileW; u = u1;
    const v0 = y0 / tileH + vOff, v1 = y1 / tileH + vOff;
    // a(p,y0) b(q,y0) c(q,y1) d(p,y1)
    batch.vert(p[0], y0, p[1], n0[0], 0, n0[1], u0, v0, col);
    batch.vert(q[0], y0, q[1], n1[0], 0, n1[1], u1, v0, col);
    batch.vert(q[0], y1, q[1], n1[0], 0, n1[1], u1, v1, col);
    batch.vert(p[0], y0, p[1], n0[0], 0, n0[1], u0, v0, col);
    batch.vert(q[0], y1, q[1], n1[0], 0, n1[1], u1, v1, col);
    batch.vert(p[0], y1, p[1], n0[0], 0, n0[1], u0, v1, col);
  }
}
function norm2(x, z) { const L = Math.hypot(x, z) || 1; return [x / L, z / L]; }

// Flat cap (fan) at height y, world uv * scale
export function capPoly(batch, pts, y, color, scale = 0.125) {
  const col = color.isColor ? color : new THREE.Color(color);
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    batch.vert(cx, y, cz, 0, 1, 0, cx * scale, cz * scale, col);
    batch.vert(p[0], y, p[1], 0, 1, 0, p[0] * scale, p[1] * scale, col);
    batch.vert(q[0], y, q[1], 0, 1, 0, q[0] * scale, q[1] * scale, col);
  }
}

// Inset polygon (approximate for convex shapes) toward centroid by distance d
export function insetPts(pts, d) {
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
  return pts.map(([x, z]) => {
    const dx = x - cx, dz = z - cz; const sx = Math.sign(dx), sz = Math.sign(dz);
    return [x - sx * Math.min(d, Math.abs(dx)), z - sz * Math.min(d, Math.abs(dz))];
  });
}

// Parapet: thin wall ring (outer + inner faces + top) around roof
export function parapet(batch, pts, y, h, t, color) {
  const inner = orient(insetPts(pts, t));
  wallStrip(batch, pts, y, y + h, 4, 4, color);
  // inner faces: reverse orientation so normals point inward
  const rev = inner.slice().reverse();
  const n = rev.length; const col = color.isColor ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const p = rev[i], q = rev[(i + 1) % n]; const dx = q[0] - p[0], dz = q[1] - p[1]; const L = Math.hypot(dx, dz) || 1;
    const nx = dz / L, nz = -dx / L; // natural winding normal reversed for this order
    // winding with (a,c,b) so face normal = -(-dz,dx) = inward
    batch.vert(p[0], y, p[1], nx, 0, nz, 0, 0, col);
    batch.vert(p[0], y + h, p[1], nx, 0, nz, 0, 1, col);
    batch.vert(q[0], y + h, q[1], nx, 0, nz, 1, 1, col);
    batch.vert(p[0], y, p[1], nx, 0, nz, 0, 0, col);
    batch.vert(q[0], y + h, q[1], nx, 0, nz, 1, 1, col);
    batch.vert(q[0], y, q[1], nx, 0, nz, 1, 0, col);
  }
  // top ring
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = inner[i], d = inner[(i + 1) % pts.length];
    batch.vert(a[0], y + h, a[1], 0, 1, 0, 0, 0, col); batch.vert(c[0], y + h, c[1], 0, 1, 0, 0, 0, col); batch.vert(b[0], y + h, b[1], 0, 1, 0, 0, 0, col);
    batch.vert(b[0], y + h, b[1], 0, 1, 0, 0, 0, col); batch.vert(c[0], y + h, c[1], 0, 1, 0, 0, 0, col); batch.vert(d[0], y + h, d[1], 0, 1, 0, 0, 0, col);
  }
}

// ---------- Palm tree geometry (trunk tube + drooping fronds) ----------
export function palmGeometry(seed, height, lean, rnd, o = {}) {
  const bow = o.bow ?? 0, fMul = o.frondLen ?? 1, dMul = o.droop ?? 1;
  const segs = 12, rad = 7;
  const tp = [], tn = [], tu = [], ti = [];
  const curve = (t) => new THREE.Vector3(lean * height * t * t + bow * height * 0.06 * Math.sin(Math.PI * t), height * t, lean * 0.25 * height * t * t * Math.sin(seed) + bow * height * 0.035 * Math.sin(2 * Math.PI * t));
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; const c = curve(t);
    const c2 = curve(Math.min(1, t + 0.01)), c1 = curve(Math.max(0, t - 0.01));
    const tang = c2.sub(c1).normalize();
    const side = new THREE.Vector3(0, 0, 1).cross(tang).normalize(); const bi = tang.clone().cross(side).normalize();
    const r = 0.26 * (1 - 0.38 * t) + (t < 0.08 ? 0.18 * (1 - t / 0.08) : 0);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2; const nx = Math.cos(a), nz = Math.sin(a);
      const nv = side.clone().multiplyScalar(nx).add(bi.clone().multiplyScalar(nz));
      tp.push(c.x + nv.x * r, c.y + nv.y * r, c.z + nv.z * r); tn.push(nv.x, nv.y, nv.z); tu.push(j / rad, t * height * 0.5);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    ti.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  trunk.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
  trunk.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
  trunk.setIndex(ti);

  // crown
  const top = curve(1);
  const fp = [], fn = [], fu = [], fi = [];
  const nF = o.fronds ?? (11 + ((rnd() * 4) | 0));
  const fs = 9;
  for (let f = 0; f < nF; f++) {
    const ang = (f / nF) * Math.PI * 2 + rnd() * 0.4;
    const L = (3.6 + rnd() * 1.4) * fMul; const lift = 0.35 + rnd() * 0.5; const droop = (0.9 + rnd() * 0.5) * dMul;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)); const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = fp.length / 3;
    for (let s = 0; s <= fs; s++) {
      const t = s / fs;
      const hx = L * t * (1 - 0.15 * t);
      const y = L * (lift * t - droop * t * t * 0.9);
      const w = 0.75 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (1 - 0.2 * t);
      const c = top.clone().add(dir.clone().multiplyScalar(hx)); c.y += y;
      const fold = -0.22 * w;
      const pts = [c.clone().addScaledVector(side, -w).setY(c.y + fold), c.clone(), c.clone().addScaledVector(side, w).setY(c.y + fold)];
      pts.forEach((p, k) => { fp.push(p.x, p.y, p.z); fn.push(0, 1, 0); fu.push(k / 2, t); });
    }
    for (let s = 0; s < fs; s++) for (let k = 0; k < 2; k++) {
      const a = base + s * 3 + k, b = a + 3;
      fi.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const fronds = new THREE.BufferGeometry();
  fronds.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fronds.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
  fronds.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  fronds.setIndex(fi);
  fronds.computeVertexNormals();
  // bias normals upward for nicer foliage lighting
  const N = fronds.attributes.normal;
  for (let i = 0; i < N.count; i++) { const ny = N.getY(i); N.setXYZ(i, N.getX(i) * 0.5, Math.abs(ny) * 0.8 + 0.5, N.getZ(i) * 0.5); }
  N.needsUpdate = true; fronds.normalizeNormals();
  // coconuts
  const nuts = new THREE.SphereGeometry(0.14, 5, 3).toNonIndexed();
  return { trunk, fronds, top, nuts };
}
