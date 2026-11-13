// Lofted car body surfaces: smooth, continuously curved panels instead of extruded slabs.
// A 2D side profile (THREE.Shape, x = car z, y = height) gives the top/bottom bounds per station;
// cross-sections sweep around the body (side up -> crowned top -> other side down) using the same
// width function S(y, z) that positions small details, so trims and handles sit on the surface.
import * as THREE from 'three';

// vertical bounds of a closed polygon at abscissa z -> [ymin, ymax] or null
export function boundsFn(points) {
  const n = points.length;
  return (z) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      if ((a.x - z) * (b.x - z) > 0 || a.x === b.x) {
        if (a.x === b.x && Math.abs(a.x - z) < 1e-6) { lo = Math.min(lo, a.y, b.y); hi = Math.max(hi, a.y, b.y); }
        continue;
      }
      const t = (z - a.x) / (b.x - a.x);
      const y = a.y + (b.y - a.y) * t;
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return hi > lo ? [lo, hi] : null;
  };
}

function stations(z0, z1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const u = i / n; out.push(z0 + (z1 - z0) * (0.5 - 0.5 * Math.cos(Math.PI * u))); }
  return out;
}

/**
 * Build a lofted shell.
 * opts: { shape, halfW(y,z) -> half width, zs: [z0, z1], n: stations, side: rows, top: cols, classify(zMid, part, i, j) -> key, capEnds }
 * Returns { key: BufferGeometry (non-indexed, smooth normals) }
 */
export function loft(opts) {
  const pts = opts.shape.getPoints(opts.curveSeg || 24);
  const bounds = boundsFn(pts);
  const [z0, z1] = opts.zs;
  const Z = stations(z0 + 0.002, z1 - 0.002, opts.n).filter((z) => bounds(z));
  const NS = opts.side, NT = opts.top;
  const ringN = 2 * NS + NT + 1; // left side (NS+1 incl. corner) + top interior (NT-1) + right side (NS+1)
  const verts = [], ring = [];
  for (const z of Z) {
    const [yb, yt] = bounds(z);
    const r = [];
    // left side bottom -> top
    for (let i = 0; i <= NS; i++) {
      const y = yb + (yt - yb) * (i / NS);
      r.push([+opts.halfW(y, z, i / NS), y, z, 'side', i]);
    }
    // top across (left -> right), excluding corners
    const xt = opts.halfW(yt, z, 1);
    for (let j = 1; j < NT; j++) {
      const u = j / NT;
      r.push([xt * (1 - 2 * u), yt, z, 'top', j]);
    }
    // right side top -> bottom
    for (let i = NS; i >= 0; i--) {
      const y = yb + (yt - yb) * (i / NS);
      r.push([-opts.halfW(y, z, i / NS), y, z, 'side', i]);
    }
    ring.push(r);
  }
  // indexed grid
  const P = [];
  for (const r of ring) for (const v of r) P.push(v[0], v[1], v[2]);
  const M = ring[0].length;
  const tris = []; // [a,b,c,key]
  for (let s = 0; s < ring.length - 1; s++) {
    for (let k = 0; k < M - 1; k++) {
      const a = s * M + k, b = s * M + k + 1, c = (s + 1) * M + k, d = (s + 1) * M + k + 1;
      const zMid = (ring[s][k][2] + ring[s + 1][k][2]) / 2;
      const va = ring[s][k], vb = ring[s][k + 1];
      const part = va[3] === 'top' || vb[3] === 'top' ? 'top' : 'side';
      // position along the cross-section: 0 = bottom of side, NS = corner
      const key = opts.classify ? opts.classify(zMid, part, va[4], vb[4], k, M) : 'paint';
      if (!key) continue;
      tris.push([a, b, c, key], [b, d, c, key]);
    }
  }
  // end caps (fan from the bottom-centre of the ring)
  const capTris = [];
  if (opts.capEnds !== false) {
    for (const [s, flip] of [[0, true], [ring.length - 1, false]]) {
      const r = ring[s];
      const cy = r[0][1], cz = r[0][2];
      const ci = P.length / 3;
      P.push(0, cy, cz);
      for (let k = 0; k < M - 1; k++) {
        const a = s * M + k, b = s * M + k + 1;
        capTris.push(flip ? [ci, b, a, opts.capKey || 'paint'] : [ci, a, b, opts.capKey || 'paint']);
      }
    }
  }
  // smooth normals from the grid (caps excluded so the ends keep a crisp edge)
  const nrm = new Float32Array(P.length);
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let s = 0; s < ring.length - 1; s++) {
    for (let k = 0; k < M - 1; k++) {
      const a = s * M + k, b = s * M + k + 1, c = (s + 1) * M + k, d = (s + 1) * M + k + 1;
      for (const [i0, i1, i2] of [[a, b, c], [b, d, c]]) {
        vA.fromArray(P, i0 * 3); vB.fromArray(P, i1 * 3); vC.fromArray(P, i2 * 3);
        e1.subVectors(vB, vA); e2.subVectors(vC, vA); e1.cross(e2);
        for (const i of [i0, i1, i2]) { nrm[i * 3] += e1.x; nrm[i * 3 + 1] += e1.y; nrm[i * 3 + 2] += e1.z; }
      }
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  // split by material key into non-indexed geometries
  const groups = {};
  const push = (key, idx, flatN) => {
    const g = (groups[key] ||= { p: [], n: [], uv: [] });
    for (const i of idx) {
      g.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (flatN) g.n.push(flatN.x, flatN.y, flatN.z); else g.n.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      g.uv.push(P[i * 3 + 2] * 0.5, P[i * 3 + 1] * 0.5);
    }
  };
  for (const [a, b, c, key] of tris) push(key, [a, b, c]);
  for (const [a, b, c, key] of capTris) {
    vA.fromArray(P, a * 3); vB.fromArray(P, b * 3); vC.fromArray(P, c * 3);
    e1.subVectors(vB, vA); e2.subVectors(vC, vA); e1.cross(e2).normalize();
    push(key, [a, b, c], e1.clone());
  }
  const out = {};
  for (const k in groups) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(groups[k].p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(groups[k].n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(groups[k].uv, 2));
    out[k] = geo;
  }
  return out;
}
