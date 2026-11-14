// Aircraft kit, core: seeded random, lofted skins with window / door regions, lifting surfaces with control cutouts,
// procedural riveted-skin textures, PBR materials, static-geometry merging. Browser side (canvas textures).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

// ---------------------------------------------------------------------------------------------- monotone cubic interpolation
export function pchip(xs, ys) {
  const n = xs.length, d = new Array(n).fill(0), h = [], s = [];
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; s[i] = (ys[i + 1] - ys[i]) / (h[i] || 1e-9); }
  if (n === 2) d[0] = d[1] = s[0];
  else if (n > 2) {
    for (let i = 1; i < n - 1; i++) if (s[i - 1] * s[i] > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / s[i - 1] + w2 / s[i]); }
    d[0] = s[0]; d[n - 1] = s[n - 2];
  }
  return (x) => {
    if (n === 1) return ys[0];
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * d[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * d[i + 1];
  };
}

// ---------------------------------------------------------------------------------------------- LOFT
// sections: [{ z, w (half width), top, bot (heights above / below the section center), y (center), e (side exponent), et, eb }]
// Angles are degrees from the top (0), positive toward the LEFT (+X): 90 = left side, 180 = bottom.
// opt: { ring = 36, stations = 28, zCuts, aCuts, regions: [{ name, kind:'glass'|'door'|'hole', z0, z1, a0, a1, mirror }],
//        inset (m, shrink along normals), flip (inward facing), clip: [z0, z1], capA, capB (close open ends), frameW }
export function sec(z, w, top, bot = top, y = 0, e = 2, et = e, eb = e) { return { z, w, top, bot, y, e, et, eb }; }
function profile(s, aDeg, out) {
  const a = aDeg * DEG, sn = Math.sin(a), cs = Math.cos(a);
  out[0] = s.w * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / s.e);
  out[1] = s.y + (cs >= 0 ? s.top * Math.pow(cs, 2 / s.et) : -s.bot * Math.pow(-cs, 2 / s.eb));
  return out;
}
export function loft(sections, opt = {}) {
  const S = sections.slice().sort((a, b) => a.z - b.z).map((s) => ({ e: 2, y: 0, ...s, bot: s.bot ?? s.top, et: s.et ?? s.e ?? 2, eb: s.eb ?? s.e ?? 2 }));
  const zs0 = S.map((s) => s.z), F = {};
  for (const k of ['w', 'top', 'bot', 'y', 'e', 'et', 'eb']) F[k] = pchip(zs0, S.map((s) => s[k]));
  const secAt = (z) => ({ z, w: Math.max(0, F.w(z)), top: Math.max(0, F.top(z)), bot: Math.max(0, F.bot(z)), y: F.y(z), e: F.e(z), et: F.et(z), eb: F.eb(z) });
  const zMin = opt.clip ? opt.clip[0] : zs0[0], zMax = opt.clip ? opt.clip[1] : zs0[zs0.length - 1];
  const regions = opt.regions || [];
  // station and ring lists (cut lines land exactly on grid lines)
  const uniq = (arr, eps) => { arr.sort((a, b) => a - b); const o = []; for (const v of arr) if (!o.length || v - o[o.length - 1] > eps) o.push(v); return o; };
  let zs = [];
  const nS = opt.stations ?? 28;
  for (let i = 0; i <= nS; i++) zs.push(lerp(zMin, zMax, i / nS));
  for (const z of zs0) zs.push(z);
  for (const z of opt.zCuts || []) zs.push(z);
  for (const r of regions) zs.push(r.z0, r.z1);
  zs = uniq(zs.filter((z) => z >= zMin - 1e-6 && z <= zMax + 1e-6), 0.012);
  let as = [];
  const nR = opt.ring ?? 36;
  for (let j = 0; j <= nR; j++) as.push(-180 + 360 * j / nR);
  for (const a of opt.aCuts || []) as.push(a, -a);
  for (const r of regions) { as.push(r.a0, r.a1); if (r.mirror) as.push(-r.a0, -r.a1); }
  as = uniq(as.filter((a) => a >= -180 && a <= 180), 0.6);
  as[0] = -180; as[as.length - 1] = 180;
  const nz = zs.length, na = as.length, P = new Float32Array(nz * na * 3), Nn = new Float32Array(nz * na * 3), UV = new Float32Array(nz * na * 2), UV1 = new Float32Array(nz * na * 2);
  const tmp = [0, 0];
  for (let i = 0; i < nz; i++) {
    const s = secAt(zs[i]);
    for (let j = 0; j < na; j++) { profile(s, as[j], tmp); const k = (i * na + j) * 3; P[k] = tmp[0]; P[k + 1] = tmp[1]; P[k + 2] = zs[i]; }
  }
  // normals from grid differences (the ring wraps at the bottom seam)
  const pv = (i, j, o) => { const k = (i * na + j) * 3; return o.set(P[k], P[k + 1], P[k + 2]); };
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vd = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let i = 0; i < nz; i++) for (let j = 0; j < na; j++) {
    const jm = j === 0 ? na - 2 : j - 1, jp = j === na - 1 ? 1 : j + 1;
    pv(i, jp, va).sub(pv(i, jm, vb));
    pv(Math.min(nz - 1, i + 1), j, vc).sub(pv(Math.max(0, i - 1), j, vd));
    vn.crossVectors(va, vc);
    if (vn.lengthSq() < 1e-12) vn.set(0, 0, i < nz / 2 ? -1 : 1); else vn.normalize();
    // degenerate ring (a point): face along the axis
    const s = secAt(zs[i]); if (s.w < 1e-4 && s.top + s.bot < 1e-4) vn.set(0, 0, i < nz / 2 ? -1 : 1);
    const k = (i * na + j) * 3; Nn[k] = vn.x; Nn[k + 1] = vn.y; Nn[k + 2] = vn.z;
  }
  // orientation check: normals must point away from the axis
  { const i = Math.floor(nz / 2), j = Math.floor(na * 0.75), k = (i * na + j) * 3; if (Nn[k] * P[k] + Nn[k + 1] * (P[k + 1] - secAt(zs[i]).y) < 0) for (let q = 0; q < Nn.length; q++) Nn[q] = -Nn[q]; }
  const inset = opt.inset || 0;
  if (inset) for (let q = 0; q < P.length; q++) P[q] -= Nn[q] * inset;
  // uv0: (along 0..1, arc fraction around 0..1, 0.5 = top); uv1: meters (z, signed arc from the top)
  const zLen = (zs0[zs0.length - 1] - zs0[0]) || 1;
  for (let i = 0; i < nz; i++) {
    let tot = 0; const cum = [0];
    for (let j = 1; j < na; j++) { tot += pv(i, j, va).distanceTo(pv(i, j - 1, vb)); cum.push(tot); }
    for (let j = 0; j < na; j++) {
      const k = (i * na + j) * 2;
      UV[k] = (zs[i] - zs0[0]) / zLen; UV[k + 1] = tot > 1e-6 ? cum[j] / tot : j / (na - 1);
      UV1[k] = zs[i]; UV1[k + 1] = cum[j] - tot / 2;
    }
  }
  const flip = !!opt.flip;
  if (flip) for (let q = 0; q < Nn.length; q++) Nn[q] = -Nn[q];
  // classify quads
  const buckets = {}, glassQ = new Uint8Array(nz * na), panelQ = new Array(nz * na).fill(null);
  const push = (key, a, b, c, d) => { const B = (buckets[key] ||= []); if (flip) B.push(a, c, b, b, c, d); else B.push(a, b, c, b, d, c); };
  for (let i = 0; i < nz - 1; i++) for (let j = 0; j < na - 1; j++) {
    const zc = (zs[i] + zs[i + 1]) / 2, ac = (as[j] + as[j + 1]) / 2;
    let panel = 'main', glass = false, hole = false;
    for (const r of regions) {
      if (zc < r.z0 || zc > r.z1) continue;
      const inA = (ac > r.a0 && ac < r.a1) || (r.mirror && ac > -r.a1 && ac < -r.a0);
      if (!inA) continue;
      if (r.kind === 'door') panel = r.name; else if (r.kind === 'hole') hole = true; else glass = true;
    }
    if (hole) continue;
    if (glass && opt.glassAsHole) continue;
    glassQ[i * na + j] = glass ? 1 : 0; panelQ[i * na + j] = panel;
    const a = i * na + j, b = a + 1, c = a + na, d = c + 1;
    push(panel + (glass ? ':glass' : ''), a, c, b, d);
  }
  // window frames: a thin raised ribbon along every glass / skin border
  const fw = opt.frameW ?? 0.028, frames = {};
  if (fw > 0 && !flip) {
    const ribbon = (key, i0, j0, i1, j1) => {
      const R = (frames[key] ||= { p: [], n: [] });
      pv(i0, j0, va); pv(i1, j1, vb);
      const k0 = (i0 * na + j0) * 3, k1 = (i1 * na + j1) * 3;
      vn.set(Nn[k0] + Nn[k1], Nn[k0 + 1] + Nn[k1 + 1], Nn[k0 + 2] + Nn[k1 + 2]).normalize();
      vc.subVectors(vb, va); const ext = fw * 0.5; vd.copy(vc).normalize().multiplyScalar(ext);
      va.sub(vd); vb.add(vd);                               // overlap at the corners
      vc.crossVectors(vn, vc).normalize().multiplyScalar(fw / 2);
      const h = 0.004, q = [];
      for (const [pt, sg] of [[va, -1], [va, 1], [vb, -1], [vb, 1]]) q.push(pt.x + vc.x * sg + vn.x * h, pt.y + vc.y * sg + vn.y * h, pt.z + vc.z * sg + vn.z * h);
      const idx = [0, 1, 2, 1, 3, 2, 0, 2, 1, 1, 2, 3];
      for (const t of idx) { R.p.push(q[t * 3], q[t * 3 + 1], q[t * 3 + 2]); R.n.push(vn.x, vn.y, vn.z); }
    };
    const G = (i, j) => (i < 0 || j < 0 || i >= nz - 1 || j >= na - 1 ? 0 : glassQ[i * na + j]);
    for (let i = 0; i < nz - 1; i++) for (let j = 0; j < na - 1; j++) {
      if (!glassQ[i * na + j]) continue;
      const key = panelQ[i * na + j] + ':frame';
      if (!G(i - 1, j)) ribbon(key, i, j, i, j + 1);
      if (!G(i + 1, j)) ribbon(key, i + 1, j, i + 1, j + 1);
      if (!G(i, j - 1)) ribbon(key, i, j, i + 1, j);
      if (!G(i, j + 1)) ribbon(key, i, j + 1, i + 1, j + 1);
    }
  }
  const geos = {};
  for (const key in buckets) {
    const idx = buckets[key], map = new Map(), pos = [], nor = [], uv = [], uv1 = [], ind = [];
    for (const v of idx) {
      let m = map.get(v);
      if (m === undefined) { m = pos.length / 3; map.set(v, m); pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]); uv.push(UV[v * 2], UV[v * 2 + 1]); uv1.push(UV1[v * 2], UV1[v * 2 + 1]); }
      ind.push(m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2)); g.setIndex(ind);
    geos[key] = g;
  }
  for (const key in frames) {
    const g = new THREE.BufferGeometry(), n = frames[key].p.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(frames[key].p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(frames[key].n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    geos[key] = g;
  }
  // end caps (flat fans) for open ends
  const cap = (i, front) => {
    const s = secAt(zs[i]); if (s.w < 0.01) return null;
    const pos = [0, s.y + (s.top - s.bot) / 2, zs[i]], nor = [0, 0, front ? 1 : -1], uv = [0.5, 0.5], uv1 = [0, 0], ind = [];
    for (let j = 0; j < na; j++) { const k = (i * na + j) * 3; pos.push(P[k], P[k + 1], P[k + 2]); nor.push(0, 0, front ? 1 : -1); uv.push(0.5 + P[k] * 0.2, 0.5 + P[k + 1] * 0.2); uv1.push(P[k], P[k + 1]); }
    for (let j = 1; j < na; j++) { if (front !== flip) ind.push(0, j + 1, j); else ind.push(0, j, j + 1); }
    if (flip) for (let q = 0; q < nor.length; q++) nor[q] = -nor[q];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2)); g.setIndex(ind);
    return g;
  };
  if (opt.capA) { const g = cap(0, false); if (g) geos.capA = g; }
  if (opt.capB) { const g = cap(nz - 1, true); if (g) geos.capB = g; }
  const out = new THREE.Vector3();
  const L = {
    geos, zMin: zs0[0], zMax: zs0[zs0.length - 1], len: zLen, sec: secAt,
    at(z, aDeg, o = out) { profile(secAt(z), aDeg, tmp); return o.set(tmp[0], tmp[1], z); },
    normal(z, aDeg, o = new THREE.Vector3()) {
      const p0 = L.at(z, aDeg - 2, new THREE.Vector3()), p1 = L.at(z, aDeg + 2, new THREE.Vector3()), q0 = L.at(z - 0.02, aDeg, new THREE.Vector3()), q1 = L.at(z + 0.02, aDeg, new THREE.Vector3());
      o.crossVectors(p1.sub(p0), q1.sub(q0)).normalize(); const c = L.at(z, aDeg, new THREE.Vector3()); c.y -= secAt(z).y; c.z = 0; if (o.dot(c) < 0) o.negate(); return o;
    },
    // angle (deg, on the given side: +1 left, -1 right) at which the section at z reaches height y
    yToA(z, y, side = 1) { const s = secAt(z); let lo = 0, hi = 180; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; profile(s, m, tmp); if (tmp[1] > y) lo = m; else hi = m; } return side * (lo + hi) / 2; },
    widthAt(z, y) { profile(secAt(z), L.yToA(z, y, 1), tmp); return tmp[0]; },
    // arc fraction v (0..1) for an angle at station z (matches uv0.y)
    aToV(z, aDeg) { const s = secAt(z); let tot = 0, at = 0, px = 0, py = 0; for (let k = 0; k <= 180; k++) { const a = -180 + k * 2; profile(s, a, tmp); if (k) { const d = Math.hypot(tmp[0] - px, tmp[1] - py); tot += d; if (a <= aDeg + 1e-6) at = tot; } px = tmp[0]; py = tmp[1]; } return tot > 0 ? at / tot : 0.5; },
    zToU(z) { return (z - zs0[0]) / zLen; },
  };
  return L;
}

// A door (or any cut panel) hinged along one edge of its loft region. Returns { node, open(t) }.
export function hingedPanel(L, region, mats, { hinge = 'front', angle = 80 * DEG } = {}) {
  const g = new THREE.Group(), r = region;
  const a = hinge === 'front' ? L.at(r.z1, r.a0, new THREE.Vector3()) : hinge === 'rear' ? L.at(r.z0, r.a0, new THREE.Vector3()) : hinge === 'top' ? L.at(r.z0, Math.abs(r.a0) < Math.abs(r.a1) ? r.a0 : r.a1, new THREE.Vector3()) : L.at(r.z0, Math.abs(r.a0) > Math.abs(r.a1) ? r.a0 : r.a1, new THREE.Vector3());
  const b = hinge === 'front' ? L.at(r.z1, r.a1, new THREE.Vector3()) : hinge === 'rear' ? L.at(r.z0, r.a1, new THREE.Vector3()) : hinge === 'top' ? L.at(r.z1, Math.abs(r.a0) < Math.abs(r.a1) ? r.a0 : r.a1, new THREE.Vector3()) : L.at(r.z1, Math.abs(r.a0) > Math.abs(r.a1) ? r.a0 : r.a1, new THREE.Vector3());
  const pivot = a.clone().add(b).multiplyScalar(0.5), axis = b.clone().sub(a).normalize();
  for (const [suffix, mat] of [['', mats.skin], [':glass', mats.glass], [':frame', mats.frame]]) {
    const geo = L.geos[r.name + suffix]; if (!geo || !mat) continue;
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(geo, mat); m.castShadow = suffix !== ':glass'; g.add(m);
  }
  g.position.copy(pivot);
  // choose the sign that swings the panel outward
  const c = L.at((r.z0 + r.z1) / 2, (r.a0 + r.a1) / 2, new THREE.Vector3()), n = L.normal((r.z0 + r.z1) / 2, (r.a0 + r.a1) / 2);
  const test = c.clone().sub(pivot).applyAxisAngle(axis, 0.2).add(pivot).sub(c);
  const sign = test.dot(n) > 0 ? 1 : -1;
  return { node: g, pivot, axis, open(t) { g.quaternion.setFromAxisAngle(axis, sign * angle * clamp(t, 0, 1)); } };
}

// ---------------------------------------------------------------------------------------------- AIRFOIL SURFACES
function foilY(x, t, m, p) { // NACA 4-digit: returns [upper, lower, slopeUpper, slopeLower]
  const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  const yc = m ? (x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) * (1 - p)) * (1 - 2 * p + 2 * p * x - x * x)) : 0;
  return [yc + yt, yc - yt];
}
// Lifting surface (wing half, stabilizer half, fin, blade). Local frame: root leading edge at the origin, span along
// +X * side (dihedral lifts the tip), chord toward -Z. controls: [{ name, s0, s1, chord }] are cut out and returned
// as separate hinged parts. o.vertical = true builds a fin (span along +Y).
export function liftSurface(o) {
  const { span, c0, c1 = c0, sweep = 0, t0 = 0.12, t1 = t0, camber = 0.02, twist = 0, dihedral = 0, side = 1, nSpan = 8, nChord = 10, tip = 'round', controls = [], vertical = false, cranks = [] } = o;
  const xs = []; for (let i = 0; i <= nChord; i++) xs.push(0.5 - 0.5 * Math.cos(Math.PI * i / nChord));
  for (const c of controls) xs.push(1 - c.chord);
  xs.sort((a, b) => a - b); for (let i = xs.length - 1; i > 0; i--) if (xs[i] - xs[i - 1] < 0.004) xs.splice(i, 1);
  let ss = []; for (let i = 0; i <= nSpan; i++) ss.push(i / nSpan);
  for (const c of controls) ss.push(c.s0, c.s1);
  for (const c of cranks) ss.push(c);
  ss.sort((a, b) => a - b); for (let i = ss.length - 1; i > 0; i--) if (ss[i] - ss[i - 1] < 0.003) ss.splice(i, 1);
  const tipN = tip === 'round' ? 4 : 0, cd = Math.cos(dihedral * DEG), sd = Math.sin(dihedral * DEG);
  const chordAt = o.chordFn || ((s) => lerp(c0, c1, s)), sweepAt = o.sweepFn || ((s) => sweep * s);
  // frame(s, x, surf: 1 top / -1 bottom) -> position + normal
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  function frame(s, x, surf, extra = null) {
    const sc = Math.min(1, s), c = chordAt(sc) * (extra ? extra.cs : 1), t = lerp(t0, t1, sc) * (extra ? extra.ts : 1);
    const [yu, yl] = foilY(x, t, camber, 0.4), yy = (surf > 0 ? yu : yl) * c;
    const e = 0.004, [yu2, yl2] = foilY(clamp(x + (x > 0.5 ? -e : e), 0, 1), t, camber, 0.4);
    let slope = ((surf > 0 ? yu2 : yl2) * c - yy) / ((x > 0.5 ? -e : e) * c);
    const tw = twist * DEG * sc, S = (extra ? extra.S : s * span);
    let zl = -x * c - (extra ? extra.zo : 0), yl0 = yy;
    // twist about the quarter chord
    const zq = -0.25 * c, dz = zl - zq; zl = zq + dz * Math.cos(tw) + yl0 * Math.sin(tw); yl0 = yl0 * Math.cos(tw) - dz * Math.sin(tw);
    zl -= sweepAt(sc);
    let ny = surf, nz = surf > 0 ? slope : -slope;          // normal in the section plane: (slope, 1) for the top surface
    if (x < 0.002) { ny = 0; nz = 1; }
    const nl = Math.hypot(ny, nz) || 1; ny /= nl; nz /= nl;
    if (vertical) { P.set(-yl0 * side, S, zl); N.set(-ny * side, 0, nz); }
    else { P.set(side * (S * cd - yl0 * sd), S * sd + yl0 * cd, zl); N.set(side * (-ny * sd), ny * cd, nz); }
    return P;
  }
  const mk = () => ({ p: [], n: [], uv: [], uv1: [], idx: [] });
  const fixed = mk(), parts = {};
  const vert = (B, s, x, surf, extra) => {
    frame(s, x, surf, extra); B.p.push(P.x, P.y, P.z); B.n.push(N.x, N.y, N.z);
    B.uv.push(surf > 0 ? 0.5 * x : 1 - 0.5 * x, Math.min(1, s)); B.uv1.push(x * chordAt(Math.min(1, s)) * (surf > 0 ? 1 : -1), s * span);
    return B.p.length / 3 - 1;
  };
  const wind = side > 0;
  const quad = (B, a, b, c, d, flipQ = false) => { if (wind !== flipQ) B.idx.push(a, b, c, b, d, c); else B.idx.push(a, c, b, b, c, d); };
  const ctrlOf = (sm) => controls.find((c) => sm > c.s0 && sm < c.s1);
  for (let i = 0; i < ss.length - 1; i++) {
    const sa = ss[i], sb = ss[i + 1], ctl = ctrlOf((sa + sb) / 2), xh = ctl ? 1 - ctl.chord : 2;
    for (const surf of [1, -1]) for (let k = 0; k < xs.length - 1; k++) {
      const xa = xs[k], xb = xs[k + 1], B = xb <= xh + 1e-6 ? fixed : (parts[ctl.name] ||= { ...mk(), ctl });
      const a = vert(B, sa, xa, surf), b = vert(B, sa, xb, surf), c = vert(B, sb, xa, surf), d = vert(B, sb, xb, surf);
      quad(B, a, c, b, d, surf < 0);
    }
    if (ctl) { // spar wall closing the fixed part, and the nose wall of the control surface
      for (const [B, fl] of [[fixed, false], [parts[ctl.name], true]]) {
        const n0 = B.p.length / 3; frame(sa, xh, 1); const A = P.clone(); frame(sa, xh, -1); const Bq = P.clone(); frame(sb, xh, 1); const C = P.clone(); frame(sb, xh, -1); const D = P.clone();
        for (const q of [A, Bq, C, D]) { B.p.push(q.x, q.y, q.z); B.n.push(0, 0, fl ? 1 : -1); B.uv.push(0.5, 0.5); B.uv1.push(0, 0); }
        quad(B, n0, n0 + 2, n0 + 1, n0 + 3, fl);
      }
    }
  }
  // tip: rounded (shrinking sections) or flat, then a closing fan
  { const B = fixed; let prev = { cs: 1, ts: 1, S: span, zo: 0 };
    for (let q = 1; q <= tipN; q++) {
      const th = (q / tipN) * 80 * DEG, r = lerp(t0, t1, 1) * chordAt(1) * 1.6, cur = { cs: Math.cos(th) * 0.55 + 0.45, ts: Math.cos(th), S: span + r * Math.sin(th), zo: chordAt(1) * (1 - (Math.cos(th) * 0.55 + 0.45)) * 0.45 };
      for (const surf of [1, -1]) for (let k = 0; k < xs.length - 1; k++) {
        const a = vert(B, 1, xs[k], surf, prev), b = vert(B, 1, xs[k + 1], surf, prev), c = vert(B, 1, xs[k], surf, cur), d = vert(B, 1, xs[k + 1], surf, cur);
        quad(B, a, c, b, d, surf < 0);
      }
      prev = cur;
    }
    for (let k = 0; k < xs.length - 1; k++) { // close the end with a strip between top and bottom
      const a = vert(B, 1, xs[k], 1, prev), b = vert(B, 1, xs[k + 1], 1, prev), c = vert(B, 1, xs[k], -1, prev), d = vert(B, 1, xs[k + 1], -1, prev);
      quad(B, a, c, b, d, false);
    }
  }
  const toGeo = (B) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(B.uv1, 2)); g.setIndex(B.idx); return g; };
  const res = { fixed: toGeo(fixed), parts: {}, chordAt, frame: (s, x, surf = 1) => frame(s, x, surf).clone() };
  for (const name in parts) {
    const B = parts[name], c = B.ctl, xh = 1 - c.chord;
    const h0 = frame(c.s0, xh, 1).clone().add(frame(c.s0, xh, -1)).multiplyScalar(0.5), h1 = frame(c.s1, xh, 1).clone().add(frame(c.s1, xh, -1)).multiplyScalar(0.5);
    const g = toGeo(B); g.translate(-h0.x, -h0.y, -h0.z);
    res.parts[name] = { geo: g, pos: h0, axis: h1.clone().sub(h0).normalize() };
  }
  return res;
}
// Mount a control surface: returns a Group at the hinge with set(angle) (positive = right-hand rotation about the outboard axis).
export function hingeNode(part, mat) {
  const g = new THREE.Group(); g.position.copy(part.pos);
  const m = new THREE.Mesh(part.geo, mat); m.castShadow = true; g.add(m);
  g.userData.axis = part.axis; g.userData.set = (ang) => g.quaternion.setFromAxisAngle(part.axis, ang);
  return g;
}

// ---------------------------------------------------------------------------------------------- SKIN TEXTURES
// Tiling normal + ORM (R = ambient occlusion / grime, G = roughness, B = metalness) maps drawn in code.
const SKINS = {
  rivet:     { tile: 1.2, px: 1024, frames: 2, rows: 6, rivetPitch: 0.03, rivetR: 2.6, rivetH: 0.55, groove: 0.9, pillow: 0.55, rough: 0.36, grime: 0.5 },
  rivetFine: { tile: 1.6, px: 1024, frames: 2, rows: 8, rivetPitch: 0.032, rivetR: 1.9, rivetH: 0.45, groove: 0.8, pillow: 0.4, rough: 0.34, grime: 0.4 },
  airliner:  { tile: 3.0, px: 1024, frames: 2, rows: 5, rivetPitch: 0.06, rivetR: 1.2, rivetH: 0.22, groove: 0.6, pillow: 0.18, rough: 0.3, grime: 0.35 },
  composite: { tile: 2.0, px: 1024, frames: 1, rows: 1, rivetPitch: 0.09, rivetR: 1.3, rivetH: 0.2, groove: 0.5, pillow: 0.0, rough: 0.26, grime: 0.25, peel: 0.5 },
  fabric:    { tile: 1.0, px: 1024, frames: 3, rows: 0, rivetPitch: 0.045, rivetR: 1.6, rivetH: 0.3, groove: 0.0, pillow: -0.9, rough: 0.5, grime: 0.4, tape: 0.035, weave: 0.6 },
  envelope:  { tile: 4.0, px: 1024, frames: 2, rows: 0, rivetPitch: 0.0, rivetR: 0, rivetH: 0, groove: 0.0, pillow: -0.5, rough: 0.55, grime: 0.3, tape: 0.12, weave: 0.35 },
  bare:      { tile: 1.2, px: 1024, frames: 2, rows: 6, rivetPitch: 0.03, rivetR: 2.6, rivetH: 0.55, groove: 0.9, pillow: 0.6, rough: 0.3, grime: 0.6, metal: 1 },
};
const skinCache = new Map();
export function skinMaps(type = 'rivet') {
  if (skinCache.has(type)) return skinCache.get(type);
  const K = SKINS[type] || SKINS.rivet, N = K.px, ppm = N / K.tile, R = rng(type.length * 7919 + 13);
  const hc = document.createElement('canvas'); hc.width = hc.height = N; const h = hc.getContext('2d');
  const oc = document.createElement('canvas'); oc.width = oc.height = N; const o = oc.getContext('2d');
  h.fillStyle = '#808080'; h.fillRect(0, 0, N, N);
  o.fillStyle = `rgb(255,${Math.round(K.rough * 255)},${K.metal ? 255 : 0})`; o.fillRect(0, 0, N, N);
  // roughness / grime noise (wrapped blobs and vertical streaks; uv1.y runs around the body, so streaks run "down")
  for (let i = 0; i < 260; i++) {
    const x = R() * N, y = R() * N, r = 20 + R() * 90, dark = R() < 0.5;
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      const g = o.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const a = 0.05 + R() * 0.07 * K.grime;
      g.addColorStop(0, dark ? `rgba(150,${Math.round(K.rough * 255 + 50)},${K.metal ? 255 : 0},${a})` : `rgba(255,${Math.round(K.rough * 255 - 40)},${K.metal ? 255 : 0},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
    }
  }
  for (let i = 0; i < 46 * K.grime; i++) { // streaks
    const x = R() * N, y = R() * N, len = 60 + R() * 260, w = 2 + R() * 9;
    for (const oy of [0, N, -N]) { const g = o.createLinearGradient(0, y + oy, 0, y + oy + len); g.addColorStop(0, `rgba(110,${Math.round(K.rough * 255 + 60)},0,${0.16 * K.grime})`); g.addColorStop(1, 'rgba(110,160,0,0)'); o.fillStyle = g; o.fillRect(x, y + oy, w, len); }
  }
  const fx = [], fy = [];
  for (let i = 0; i < K.frames; i++) fx.push(Math.round(i * N / K.frames));
  for (let i = 0; i < K.rows; i++) fy.push(Math.round(i * N / K.rows));
  const line = (c, x0, y0, x1, y1, w, style) => { c.strokeStyle = style; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  if (K.tape) { // fabric: raised tapes over ribs / gore seams
    const tw = K.tape * ppm;
    for (const x of fx) for (const ox of [0, N]) { h.fillStyle = '#9a9a9a'; h.fillRect(x + ox - tw / 2, 0, tw, N); h.fillStyle = '#8c8c8c'; h.fillRect(x + ox - tw / 2, 0, 1.5, N); h.fillRect(x + ox + tw / 2 - 1.5, 0, 1.5, N); o.fillStyle = 'rgba(205,150,0,0.25)'; o.fillRect(x + ox - tw / 2 - 2, 0, tw + 4, N); }
  }
  if (K.groove) { // panel joints: one lap joint per frame line, a butt joint every other stringer row
    for (const x of fx) for (const ox of [0, N]) { line(h, x + ox + 0.5, 0, x + ox + 0.5, N, 2.2, `rgba(0,0,0,${K.groove})`); line(o, x + ox + 0.5, 0, x + ox + 0.5, N, 3.5, 'rgba(70,200,0,0.55)'); }
    for (let i = 0; i < fy.length; i += 2) for (const oy of [0, N]) { line(h, 0, fy[i] + oy + 0.5, N, fy[i] + oy + 0.5, 2.2, `rgba(0,0,0,${K.groove})`); line(o, 0, fy[i] + oy + 0.5, N, fy[i] + oy + 0.5, 3.5, 'rgba(70,200,0,0.55)'); }
  }
  if (K.rivetR) { // rivet rows: double row at frames, single row along stringers
    const pitch = K.rivetPitch * ppm, dome = (x, y) => {
      const r = K.rivetR; const g = h.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,255,${K.rivetH})`); g.addColorStop(0.7, `rgba(255,255,255,${K.rivetH * 0.6})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      h.fillStyle = g; h.fillRect(x - r, y - r, 2 * r, 2 * r);
      o.fillStyle = 'rgba(120,90,0,0.5)'; o.beginPath(); o.arc(x, y, r * 1.25, 0, 7); o.fill(); o.fillStyle = `rgba(255,${Math.round(K.rough * 200)},${K.metal ? 255 : 0},0.9)`; o.beginPath(); o.arc(x, y, r * 0.8, 0, 7); o.fill();
    };
    const nP = Math.max(1, Math.round(N / pitch)), stepP = N / nP;
    for (const x of fx) for (const off of (K.tape ? [0] : [-6, 6])) for (let k = 0; k < nP; k++) dome(((x + off + N) % N), k * stepP + stepP / 2);
    for (const y of fy) for (let k = 0; k < nP; k++) dome(k * stepP + stepP / 2, (y + (K.groove ? 5 : 0)) % N);
    if (type === 'composite' || type === 'airliner') for (let i = 0; i < 5; i++) { // access panels with fastener rings
      const cx = R() * N, cy = R() * N, w = 40 + R() * 60, hh = 30 + R() * 40;
      h.strokeStyle = `rgba(0,0,0,${K.groove})`; h.lineWidth = 1.6; h.strokeRect(cx, cy, w, hh); o.strokeStyle = 'rgba(80,200,0,0.5)'; o.lineWidth = 2.5; o.strokeRect(cx, cy, w, hh);
      for (let q = 0; q <= 4; q++) { dome(cx + w * q / 4, cy + 4); dome(cx + w * q / 4, cy + hh - 4); }
    }
  }
  // height -> normal (Sobel) plus analytic pillowing between frames / stringers and optional fine weave / orange peel
  const src = h.getImageData(0, 0, N, N).data, out = h.createImageData(N, N), D = out.data;
  const H = (x, y) => src[(((y + N) % N) * N + ((x + N) % N)) * 4];
  const bw = N / Math.max(1, K.frames), bh = N / Math.max(1, K.rows || 1), str = 2.2;
  const noise = new Float32Array(N * N); if (K.weave || K.peel) for (let i = 0; i < N * N; i++) noise[i] = R() - 0.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) / 255 * str;
    let dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) / 255 * str;
    if (K.pillow) { const u = (x % bw) / bw, v = (y % bh) / bh; dx += K.pillow * 0.11 * Math.cos(Math.PI * u) * (K.rows ? Math.sin(Math.PI * v) : 1); if (K.rows) dy += K.pillow * 0.11 * Math.sin(Math.PI * u) * Math.cos(Math.PI * v); }
    if (K.weave) { dx += Math.sin(x * 1.9) * 0.1 * K.weave + noise[y * N + x] * 0.12 * K.weave; dy += Math.sin(y * 1.9) * 0.1 * K.weave; }
    if (K.peel) { dx += noise[y * N + x] * 0.07 * K.peel; dy += noise[(y * N + x + 7919) % (N * N)] * 0.07 * K.peel; }
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    D[i] = (-dx / l * 0.5 + 0.5) * 255; D[i + 1] = (dy / l * 0.5 + 0.5) * 255; D[i + 2] = (1 / l * 0.5 + 0.5) * 255; D[i + 3] = 255;
  }
  h.putImageData(out, 0, 0);
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / K.tile, 1 / K.tile); t.channel = 1; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  const res = { normalMap: mk(hc, false), ormMap: mk(oc, false), tile: K.tile, metal: !!K.metal, rough: K.rough };
  skinCache.set(type, res); return res;
}

// Small tiling detail maps for interiors and parts (leather, fabric, carpet, rubber, plastic, brushed metal).
const detailCache = new Map();
export function detailMaps(kind = 'leather', repeat = 6) {
  const key = kind + repeat; if (detailCache.has(key)) return detailCache.get(key);
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), R = rng(kind.length * 31 + 5);
  const hgt = new Float32Array(N * N);
  const blob = (n, r0, r1, amp) => { for (let i = 0; i < n; i++) { const cx = R() * N, cy = R() * N, r = r0 + R() * (r1 - r0), a = (R() - 0.5) * 2 * amp; for (let yy = -r | 0; yy <= r; yy++) for (let xx = -r | 0; xx <= r; xx++) { const d = Math.hypot(xx, yy) / r; if (d < 1) hgt[(((cy + yy) | 0) + N) % N * N + ((((cx + xx) | 0) + N) % N)] += a * (1 - d * d); } } };
  if (kind === 'leather') { blob(900, 2, 7, 0.5); blob(60, 10, 30, 0.25); }
  else if (kind === 'fabric') { for (let i = 0; i < N * N; i++) hgt[i] = Math.sin((i % N) * 1.57) * 0.35 + Math.sin(((i / N) | 0) * 1.57) * 0.35 + (R() - 0.5) * 0.3; }
  else if (kind === 'carpet') { for (let i = 0; i < N * N; i++) hgt[i] = (R() - 0.5) * 1.4; blob(80, 6, 16, 0.3); }
  else if (kind === 'rubber') { for (let i = 0; i < N * N; i++) hgt[i] = (R() - 0.5) * 0.25 + (((i % N) % 32) < 3 ? -0.8 : 0); }
  else if (kind === 'brushed') { for (let y = 0; y < N; y++) { let v = 0; for (let xx = 0; xx < N; xx++) { v = v * 0.92 + (R() - 0.5) * 0.3; hgt[y * N + xx] = v; } } }
  else if (kind === 'diamond') { for (let i = 0; i < N * N; i++) { const px = i % N, py = (i / N) | 0, u = ((px + py) % 32) / 32, v = ((px - py + N) % 32) / 32; hgt[i] = (Math.abs(u - 0.5) < 0.12 && Math.abs(v - 0.5) < 0.38) || (Math.abs(v - 0.5) < 0.12 && Math.abs(u - 0.5) < 0.38) ? 0.9 : 0; } }
  else { for (let i = 0; i < N * N; i++) hgt[i] = (R() - 0.5) * 0.5; blob(300, 1.5, 4, 0.25); }   // plastic stipple
  const img = x.createImageData(N, N), D = img.data, Hh = (px, py) => hgt[((py + N) % N) * N + ((px + N) % N)];
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) { const dx = (Hh(px + 1, py) - Hh(px - 1, py)) * 0.9, dy = (Hh(px, py + 1) - Hh(px, py - 1)) * 0.9, l = Math.hypot(dx, dy, 1), i = (py * N + px) * 4; D[i] = (-dx / l * 0.5 + 0.5) * 255; D[i + 1] = (dy / l * 0.5 + 0.5) * 255; D[i + 2] = (1 / l * 0.5 + 0.5) * 255; D[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  detailCache.set(key, t); return t;
}

// ---------------------------------------------------------------------------------------------- MATERIALS
// Painted (or bare-metal) aircraft skin: livery canvas on uv0, riveted skin detail on uv1. Panel lines also darken the albedo.
export function paintMat({ map = null, color = 0xffffff, skin = 'rivet', clearcoat = 0.55, rough = null, emissiveMap = null, side = THREE.FrontSide, normalScale = 1 } = {}) {
  const K = skinMaps(skin);
  const m = new THREE.MeshPhysicalMaterial({ map, color, normalMap: K.normalMap, aoMap: K.ormMap, roughnessMap: K.ormMap, metalnessMap: K.ormMap, roughness: rough != null ? rough / K.rough : 1, metalness: 1, clearcoat: K.metal ? 0 : clearcoat, clearcoatRoughness: 0.12, side, envMapIntensity: 1.0 });
  m.normalScale.set(normalScale, normalScale);
  if (emissiveMap) { m.emissiveMap = emissiveMap; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0; }
  m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n#ifdef USE_AOMAP\n{ float pl = texture2D( aoMap, vAoMapUv ).r; reflectedLight.directDiffuse *= mix( 1.0, pl, 0.8 ); reflectedLight.indirectDiffuse *= mix( 1.0, pl, 0.35 ); }\n#endif'); };
  m.customProgramCacheKey = () => 'airSkin';
  return m;
}
const matCache = new Map();
const cached = (key, fn) => { if (!matCache.has(key)) matCache.set(key, fn()); return matCache.get(key); };
export const MAT = {
  glass: (tint = 0x9fb4bd, op = 0.3) => cached('glass' + tint + op, () => new THREE.MeshPhysicalMaterial({ color: tint, transparent: true, opacity: op, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 })),
  rubber: () => cached('rubber', () => new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.92, normalMap: detailMaps('rubber', 3), metalness: 0 })),
  tire: () => cached('tire', () => new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.88, normalMap: detailMaps('rubber', 8), metalness: 0 })),
  metal: (color = 0xb9bcc0, rough = 0.35) => cached('metal' + color + rough, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 1, normalMap: detailMaps('brushed', 4), normalScale: new THREE.Vector2(0.35, 0.35) })),
  chrome: () => cached('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.08, metalness: 1 })),
  dark: () => cached('dark', () => new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.7, metalness: 0.2, normalMap: detailMaps('plastic', 6), normalScale: new THREE.Vector2(0.4, 0.4) })),
  plastic: (color = 0x2a2c30, rough = 0.6) => cached('plastic' + color, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, normalMap: detailMaps('plastic', 8), normalScale: new THREE.Vector2(0.5, 0.5) })),
  leather: (color = 0x6b4a32) => cached('leather' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, normalMap: detailMaps('leather', 5) })),
  fabric: (color = 0x4a4f58) => cached('fabric' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, normalMap: detailMaps('fabric', 14) })),
  carpet: (color = 0x3a3d42) => cached('carpet' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, normalMap: detailMaps('carpet', 10) })),
  tread: () => cached('tread', () => new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.5, metalness: 1, normalMap: detailMaps('diamond', 10) })),
  paintPlain: (color, rough = 0.4, skin = 'composite') => cached('pp' + color + rough + skin, () => { const K = skinMaps(skin); const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.15 }); return m; }),
  emissive: (color, intensity = 0) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.3 }),
  lens: (color) => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.75, roughness: 0.1, emissive: color, emissiveIntensity: 0.05, clearcoat: 1 }),
};

// ---------------------------------------------------------------------------------------------- STATIC MERGE
// Collects static geometry per (parent, material) and merges it at the end: an airframe ends up with one draw per material.
export class Builder {
  constructor() { this.root = new THREE.Group(); this.buckets = new Map(); this.nodes = {}; this._m = new THREE.Matrix4(); }
  // add static geometry (optionally transformed) under `parent` (default root)
  add(geo, mat, tf = null, parent = this.root) {
    if (!geo) return;
    let g = geo;
    if (tf) { g = geo.clone(); g.applyMatrix4(tf.isMatrix4 ? tf : this.mat(tf)); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.uv1) g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'uv1'].includes(k)) g.deleteAttribute(k);
    if (!g.index) { const n = g.attributes.position.count, idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(idx); }
    let pm = this.buckets.get(parent); if (!pm) this.buckets.set(parent, (pm = new Map()));
    let arr = pm.get(mat); if (!arr) pm.set(mat, (arr = [])); arr.push(g);
  }
  mat({ p = [0, 0, 0], r = [0, 0, 0], s = 1, q = null }) {
    const e = new THREE.Euler(r[0], r[1], r[2], 'YXZ'), qq = q || new THREE.Quaternion().setFromEuler(e), sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
    return new THREE.Matrix4().compose(new THREE.Vector3(...p), qq, sc);
  }
  node(name, parent = this.root, p = null) { const g = new THREE.Group(); g.name = name; if (p) g.position.set(...p); parent.add(g); this.nodes[name] = g; return g; }
  finish({ shadows = true } = {}) {
    for (const [parent, pm] of this.buckets) for (const [mat, arr] of pm) {
      const geo = arr.length === 1 ? arr[0] : mergeGeometries(arr, false); if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = shadows && !mat.transparent; mesh.receiveShadow = !mat.transparent; if (mat.transparent) mesh.renderOrder = 2;
      parent.add(mesh);
    }
    this.buckets.clear(); return this.root;
  }
}
// tube between two points with an optional streamlined (elliptical) section; `chord` runs along `chordDir` (default +Z)
export function tubeBetween(a, b, r = 0.02, chord = 0, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  if (chord) g.scale(1, 1, chord / (2 * r));
  // orient: cylinder +Y -> d, keeping local Z as close to world Z as possible (streamline along the airflow)
  const y = d.clone().normalize(); let z = new THREE.Vector3(0, 0, 1); z.addScaledVector(y, -z.dot(y)); if (z.lengthSq() < 1e-6) z.set(1, 0, 0); z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(A.clone().add(B).multiplyScalar(0.5)));
  return g;
}
export { THREE, mergeGeometries };
