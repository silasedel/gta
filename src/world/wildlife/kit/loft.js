// Wildlife kit: geometry. Smooth lofted bodies, tubes, parametric sheets, flat cut-out shapes, merging.
// Model frame for every creature: +Z forward (nose), +Y up, +X the animal's LEFT. Meters, real-world sizes.
// UV rects are [x0, y0, x1, y1] in 0..1 canvas coordinates (y DOWN), matching tex.js regions.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
const hermite01 = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));

// Loft a body through stations (nose -> tail, or root -> tip for limbs).
// station: { p: [x, y, z] ring center, w: half-width, h: half-height or [up, down], n: superellipse exponent (2 = ellipse,
//            3-4 = boxy, 1.4 = diamond/keeled), u: optional explicit texture position along the body 0..1 }
// The ring is perpendicular to the spine. Stations are joined with Catmull-Rom splines (`subdiv` rings per span).
// UVs: x along the body, y around it with the dorsal line at the top of `uv` and the ventral line at the bottom; both
// flanks share the texture (mirrored), so there is no seam. A station with w = 0 closes the end to a point; other ends
// get a flat cap unless capStart/capEnd is false.
// Adds a float attribute `along` (0..1) and geometry.userData.path (ring centers) used by rig.bindChain.
export function loft(THREE, stations, { around = 20, subdiv = 4, uv = [0, 0, 1, 1], up = [0, 1, 0], capStart = true, capEnd = true, flip = false } = {}) {
  const S = stations.map((s) => ({ p: s.p, w: s.w ?? 0, hu: Array.isArray(s.h) ? s.h[0] : (s.h ?? s.w ?? 0), hd: Array.isArray(s.h) ? s.h[1] : (s.h ?? s.w ?? 0), n: s.n ?? 2, u: s.u }));
  const N = S.length, rings = [];
  const g = (i) => S[Math.max(0, Math.min(N - 1, i))];
  for (let i = 0; i < N - 1; i++) {
    const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2), steps = i === N - 2 ? subdiv + 1 : subdiv;
    for (let s = 0; s < steps; s++) {
      const t = s / subdiv;
      rings.push({
        p: [cr(a.p[0], b.p[0], c.p[0], d.p[0], t), cr(a.p[1], b.p[1], c.p[1], d.p[1], t), cr(a.p[2], b.p[2], c.p[2], d.p[2], t)],
        w: Math.max(0, cr(a.w, b.w, c.w, d.w, t)), hu: Math.max(0, cr(a.hu, b.hu, c.hu, d.hu, t)), hd: Math.max(0, cr(a.hd, b.hd, c.hd, d.hd, t)),
        n: hermite01(b.n, c.n, t), uX: b.u !== undefined && c.u !== undefined ? b.u + (c.u - b.u) * t : undefined,
      });
    }
  }
  // exact end values (splines can overshoot a closing point)
  Object.assign(rings[0], { w: S[0].w, hu: S[0].hu, hd: S[0].hd }); Object.assign(rings[rings.length - 1], { w: S[N - 1].w, hu: S[N - 1].hu, hd: S[N - 1].hd });
  const M = rings.length, V = new THREE.Vector3(), T = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), UP = new THREE.Vector3(...up);
  // arc length -> along
  let len = 0; rings[0].s = 0;
  for (let i = 1; i < M; i++) { len += Math.hypot(rings[i].p[0] - rings[i - 1].p[0], rings[i].p[1] - rings[i - 1].p[1], rings[i].p[2] - rings[i - 1].p[2]); rings[i].s = len; }
  for (const r of rings) r.along = r.uX !== undefined ? r.uX : r.s / (len || 1);
  const pos = [], uvs = [], along = [], idx = [];
  const [u0, v0, u1, v1] = uv;
  for (let i = 0; i < M; i++) {
    const r = rings[i], a = rings[Math.max(0, i - 1)].p, b = rings[Math.min(M - 1, i + 1)].p;
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    if (i === 0) { R.crossVectors(UP, T); if (R.lengthSq() < 1e-6) R.set(1, 0, 0); R.normalize(); }
    else { R.addScaledVector(T, -R.dot(T)).normalize(); } // parallel transport
    U.crossVectors(T, R).normalize();
    r.T = T.clone(); r.R = R.clone(); r.U = U.clone();
    const e = 2 / r.n;
    for (let j = 0; j < around; j++) {
      const th = j / around * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const sx = Math.sign(s) * Math.pow(Math.abs(s), e) * r.w, sy = Math.sign(c) * Math.pow(Math.abs(c), e) * (c >= 0 ? r.hu : r.hd);
      V.set(r.p[0], r.p[1], r.p[2]).addScaledVector(R, sx).addScaledVector(U, sy);
      pos.push(V.x, V.y, V.z);
      const va = th <= Math.PI ? th / Math.PI : (2 * Math.PI - th) / Math.PI;
      uvs.push(u0 + (u1 - u0) * r.along, 1 - (v0 + (v1 - v0) * va)); along.push(r.along);
    }
  }
  for (let i = 0; i < M - 1; i++) for (let j = 0; j < around; j++) {
    const a = i * around + j, b = i * around + (j + 1) % around, c = a + around, d = b + around;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const cap = (ringI, fwd) => {
    const r = rings[ringI]; if (r.w < 1e-5 && r.hu + r.hd < 1e-5) return;
    const ci = pos.length / 3; pos.push(r.p[0], r.p[1], r.p[2]); uvs.push(u0 + (u1 - u0) * r.along, 1 - (v0 + v1) / 2); along.push(r.along);
    for (let j = 0; j < around; j++) { const a = ringI * around + j, b = ringI * around + (j + 1) % around; if (fwd !== flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
  };
  if (capStart) cap(0, true); if (capEnd) cap(M - 1, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  geo.userData.path = rings.map((r) => ({ p: r.p, along: r.along, T: r.T, R: r.R, U: r.U, w: r.w, hu: r.hu, hd: r.hd }));
  return geo;
}

// Round tube through points with per-point radii (limbs, toes, stems, antennae). radii: number | number[]
export function tube(THREE, pts, radii, opts = {}) {
  return loft(THREE, pts.map((p, i) => { const r = Array.isArray(radii) ? radii[Math.min(i, radii.length - 1)] : radii; return { p, w: r, h: r }; }), { around: 8, subdiv: 2, ...opts });
}

// Parametric sheet: fn(u, v) -> [x, y, z] for u, v in 0..1. Wings, fins, ears, frills, leaves, seagrass blades.
// UV: u -> x of the rect, v -> y of the rect (v = 0 is the TOP of the rect). Render with a DoubleSide material.
export function sheet(THREE, fn, nu = 8, nv = 4, uv = [0, 0, 1, 1]) {
  const pos = [], uvs = [], idx = [], along = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, p = fn(u, v); pos.push(p[0], p[1], p[2]);
    uvs.push(uv[0] + (uv[2] - uv[0]) * u, 1 - (uv[1] + (uv[3] - uv[1]) * v)); along.push(u);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

// Flat polygon from a 2D outline [[a, b], ...] placed in a plane: 'yz' (side view: a -> z, b -> y, at x = offset),
// 'xz' (top view: a -> x, b -> z, at y = offset), 'xy' (front view). UVs = outline bounding box mapped into `uv`.
export function flat(THREE, outline, uv = [0, 0, 1, 1], { plane = 'yz', offset = 0 } = {}) {
  const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1]))), g = new THREE.ShapeGeometry(sh, 6);
  const P = g.attributes.position, n = P.count, pos = new Float32Array(n * 3), uvs = new Float32Array(n * 2), along = new Float32Array(n);
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (let i = 0; i < n; i++) { const a = P.getX(i), b = P.getY(i); a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  for (let i = 0; i < n; i++) {
    const a = P.getX(i), b = P.getY(i);
    if (plane === 'yz') pos.set([offset, b, a], i * 3); else if (plane === 'xz') pos.set([a, offset, b], i * 3); else pos.set([a, b, offset], i * 3);
    const fu = (a - a0) / (a1 - a0 || 1), fv = (b - b0) / (b1 - b0 || 1);
    uvs.set([uv[0] + (uv[2] - uv[0]) * fu, 1 - (uv[3] - (uv[3] - uv[1]) * fv)], i * 2); along[i] = fu;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('along', new THREE.BufferAttribute(along, 1)); geo.setIndex(g.index); geo.computeVertexNormals(); g.dispose(); return geo;
}

// Ellipsoid (eyes, knuckles, berries, eggs). r: number | [rx, ry, rz]. UVs span the whole rect, the +X pole... see `face`.
// face: direction the middle of the UV rect looks toward ('x+' for a left eye, 'x-' right eye, 'z+' front).
export function ball(THREE, r, center = [0, 0, 0], uv = [0, 0, 1, 1], { seg = 10, face = 'x+' } = {}) {
  const rr = Array.isArray(r) ? r : [r, r, r], g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2));
  if (face === 'x+') g.rotateY(0); else if (face === 'x-') g.rotateY(Math.PI); else if (face === 'z+') g.rotateY(-Math.PI / 2); else if (face === 'y+') g.rotateZ(Math.PI / 2);
  // planar UVs seen from the facing direction so a painted eye tile lands on the visible hemisphere
  const P = g.attributes.position, uvs = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    let a, b; const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (face === 'x+') { a = -z; b = y; } else if (face === 'x-') { a = z; b = y; } else if (face === 'z+') { a = x; b = y; } else { a = x; b = -z; }
    uvs.setXY(i, uv[0] + (uv[2] - uv[0]) * (a * 0.5 + 0.5), 1 - (uv[1] + (uv[3] - uv[1]) * (0.5 - b * 0.5)));
  }
  g.scale(rr[0], rr[1], rr[2]); g.translate(center[0], center[1], center[2]);
  g.setAttribute('along', new THREE.BufferAttribute(new Float32Array(P.count), 1));
  return g;
}

// remap a geometry's existing 0..1 UVs (three.js primitives) into an atlas rect
export function uvRect(THREE, geo, uv) {
  const a = geo.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + (uv[2] - uv[0]) * a.getX(i), 1 - (uv[1] + (uv[3] - uv[1]) * (1 - a.getY(i))));
  if (!geo.attributes.along) geo.setAttribute('along', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
  return geo;
}

// move/rotate/scale a geometry in place. rot is Euler XYZ in radians.
export function xform(THREE, geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  if (geo.userData.path) { const v = new THREE.Vector3(); for (const r of geo.userData.path) { v.set(...r.p).applyMatrix4(m); r.p = [v.x, v.y, v.z]; } }
  return geo;
}

// mirrored copy across the YZ plane (left limb -> right limb); winding is fixed.
export function mirrorX(THREE, geo) {
  const g = geo.clone(); g.userData = { ...geo.userData, path: geo.userData.path?.map((r) => ({ ...r, p: [-r.p[0], r.p[1], r.p[2]] })) };
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals(); return g;
}

// merge parts into one geometry (one draw call). Missing skin attributes are filled with "bone 0, weight 1".
export function merge(THREE, geos) {
  const anySkin = geos.some((g) => g.attributes.skinIndex);
  const out = geos.map((g0) => {
    const g = g0.index ? g0 : g0.clone(); const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.along || g.attributes.along.count !== n) g.setAttribute('along', new THREE.BufferAttribute(new Float32Array(n), 1));
    if (anySkin && !g.attributes.skinIndex) { g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(n * 4), 4)); const w = new Float32Array(n * 4); for (let i = 0; i < n; i++) w[i * 4] = 1; g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4)); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'along', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    if (!g.index) { const ix = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); }
    return g;
  });
  const m = mergeGeometries(out, false);
  if (!m) throw new Error('wildlife kit: merge failed (attribute mismatch)');
  m.computeBoundingSphere(); m.computeBoundingBox(); return m;
}

// A sheet standing on the dorsal (or ventral) line of a lofted body: crests, dorsal/anal fins, tail scute ridges,
// manes, combs, dewlaps. It follows the body's path between along = from..to and copies the body's `along` values, so
// rig.bindChain binds it to the same spine bones as the body.
// height(k, along) -> height in meters at k = 0..1 across the sheet; lean = tailward shear of the top edge (meters or fn(k)).
// UV: k -> x of the rect, base at the BOTTOM of the rect, free edge at the TOP. sink pushes the base into the body.
export function crest(THREE, body, { from = 0, to = 1, height = () => 0.02, lean = 0, uv = [0, 0, 1, 1], side = 'dorsal', sink = 0.003, rows = 2 } = {}) {
  const path = body.userData.path.filter((r) => r.along >= from - 1e-6 && r.along <= to + 1e-6);
  if (path.length < 2) throw new Error('crest: range does not cover two body rings');
  const sgn = side === 'dorsal' ? 1 : -1, pos = [], uvs = [], along = [], idx = [], n = path.length;
  for (let j = 0; j <= rows; j++) for (let i = 0; i < n; i++) {
    const r = path[i], k = (r.along - from) / (to - from || 1), q = j / rows;
    const h = height(k, r.along), ln = typeof lean === 'function' ? lean(k) : lean, off = (sgn > 0 ? r.hu : r.hd) - sink + h * q;
    pos.push(r.p[0] + r.U.x * off * sgn + r.T.x * ln * q, r.p[1] + r.U.y * off * sgn + r.T.y * ln * q, r.p[2] + r.U.z * off * sgn + r.T.z * ln * q);
    uvs.push(uv[0] + (uv[2] - uv[0]) * k, 1 - (uv[3] - (uv[3] - uv[1]) * q)); along.push(r.along);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); geo.setIndex(idx); geo.computeVertexNormals();
  geo.userData.path = body.userData.path; return geo;
}

// point on a lofted body's surface: along 0..1, angle 0 = dorsal, PI/2 = flank (+X side when side = 1), PI = ventral.
// Returns { p: [x, y, z], n: [nx, ny, nz] } to place eyes, ears, fins, nostrils, limbs exactly on the skin.
export function surfacePoint(body, alongV, angle, side = 1) {
  const path = body.userData.path; let i = 0; while (i < path.length - 2 && path[i + 1].along < alongV) i++;
  const a = path[i], b = path[i + 1], t = Math.min(1, Math.max(0, (alongV - a.along) / (b.along - a.along || 1)));
  const mix = (x, y) => x + (y - x) * t, c = Math.cos(angle), s = Math.sin(angle);
  const w = mix(a.w, b.w), h = c >= 0 ? mix(a.hu, b.hu) : mix(a.hd, b.hd);
  // +X side: R may point to -X depending on the path direction, so pick the sign from the actual vector
  const Rx = mix(a.R.x, b.R.x), sg = (Rx >= 0 ? 1 : -1) * side;
  const R = [mix(a.R.x, b.R.x) * sg, mix(a.R.y, b.R.y) * sg, mix(a.R.z, b.R.z) * sg], U = [mix(a.U.x, b.U.x), mix(a.U.y, b.U.y), mix(a.U.z, b.U.z)];
  const p = [mix(a.p[0], b.p[0]) + R[0] * w * s + U[0] * h * c, mix(a.p[1], b.p[1]) + R[1] * w * s + U[1] * h * c, mix(a.p[2], b.p[2]) + R[2] * w * s + U[2] * h * c];
  const nx = R[0] * s * h + U[0] * c * w, ny = R[1] * s * h + U[1] * c * w, nz = R[2] * s * h + U[2] * c * w, l = Math.hypot(nx, ny, nz) || 1;
  return { p, n: [nx / l, ny / l, nz / l] };
}
