// Poured concrete curb + gutter (roads pass, Nov 19; user: "curbs natural and smooth, like they're actually there and poured
// in cement"). One continuous extruded cross-section along a curb line instead of a flat vertical box face:
//   gutter pan  0.36 m of concrete over the asphalt edge (10 mm above the road, falling 2 mm to the flow line: no coplanar faces)
//   flow line   dark, dirty (baked ambient occlusion where the curb meets the street)
//   face        a slightly battered face rising to a rounded nose (three facets with smooth normals), the worn arris lighter
//   top         meets the slab at exactly the slab height and edge (no step, no overlap)
// Vertex colors carry the AO and the wear (stains, sun-bleached runs, chipped nose) so it costs nothing at run time: it goes
// into the same merged sidewalk batch as the slabs (one draw call per tile, no new material).
//   curbLine(batch, P, N, o)  P: [[x, z]] curb line (the slab's road edge), N: [[nx, nz]] unit normals toward the road per point,
//                             o: { h (curb top, default 0.15), y0 (road top, 0.05), gutter (m, 0.36), seed, col (THREE.Color) }
import * as THREE from 'three';

// cross-section: [outward offset from the curb line (m), height above the road top (m), AO / wear tone]
const PROFILE = [
  [0.425, 0.0105, 0.86], // gutter lip: feathered onto the asphalt (>= 8 mm over it: the asphalt has the stronger polygon offset)
  [0.075, 0.0085, 0.66], // flow line: grime
  [0.062, 0.015, 0.7], // face foot
  [0.044, 0.068, 0.92], // battered face
  [0.03, 0.088, 1.02],
  [0.016, 0.097, 1.1], // nose (worn, lighter)
  [0.0, 0.1, 1.04], // top edge = slab edge
];
const _c = new THREE.Color(),
  _base = new THREE.Color(0xd2cec6);
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function curbLine(batch, P, N, o = {}) {
  const n = P.length;
  if (n < 2) return;
  const y0 = o.y0 ?? 0.05,
    top = o.h ?? 0.15,
    sy = (top - y0) / 0.1,
    gut = o.gutter ?? 1,
    base = o.col || _base,
    seed = o.seed || 0;
  const prof = PROFILE.map(([d, y, k], i) => [
    i === 0 ? 0.075 + (d - 0.075) * gut : d,
    y0 + y * (i === 0 || i === 1 ? 1 : sy),
    k,
  ]);
  if (!(gut > 0)) prof.splice(0, 2);
  // 2D profile normals (smooth, averaged per vertex), pointing out of the concrete (toward road / up)
  const pn = prof.map((_, i) => {
    let nd = 0,
      ny = 0;
    for (const j of [i - 1, i]) {
      if (j < 0 || j + 1 >= prof.length) continue;
      const td = prof[j + 1][0] - prof[j][0],
        ty = prof[j + 1][1] - prof[j][1],
        l = Math.hypot(td, ty) || 1;
      nd += ty / l;
      ny += -td / l;
    }
    const l = Math.hypot(nd, ny) || 1;
    return [nd / l, ny / l];
  });
  const vAt = [];
  let acc = 0;
  for (let i = 0; i < prof.length; i++) {
    if (i) acc += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    vAt.push(acc * 2.5);
  }
  const gi = gut > 0 ? 2 : 0;
  let s = 0;
  const ring = (k) => {
    const p = P[k],
      nn = N[k],
      w = hash(Math.floor(s / 1.7) + seed * 0.37),
      st = hash(Math.floor(s / 0.9) * 3.1 + seed); // wear: 1.7 m pours, small stains
    return prof.map(([d, y, t], i) => {
      let tone = t * (0.93 + w * 0.1);
      if (i >= prof.length - 3 && st > 0.86) tone *= 0.82;
      if (i <= 1 && st < 0.18) tone *= 0.85;
      return {
        x: p[0] + nn[0] * d,
        y,
        z: p[1] + nn[1] * d,
        nx: nn[0] * pn[i][0],
        ny: pn[i][1],
        nz: nn[1] * pn[i][0],
        u: s * 0.4,
        v: i < gi ? 0.12 + d * 0.4 : (y - y0) * 0.4,
        tone,
      };
    });
  };
  let prev = ring(0);
  for (let k = 1; k < n; k++) {
    s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    const cur = ring(k);
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prev[i],
        b = cur[i],
        c = cur[i + 1],
        d = prev[i + 1];
      // wind so the face looks along its intended normal
      const ux = b.x - a.x,
        uy = b.y - a.y,
        uz = b.z - a.z,
        vx = c.x - a.x,
        vy = c.y - a.y,
        vz = c.z - a.z;
      const gx = uy * vz - uz * vy,
        gy = uz * vx - ux * vz,
        gz = ux * vy - uy * vx,
        flip = gx * (a.nx + c.nx) + gy * (a.ny + c.ny) + gz * (a.nz + c.nz) < 0;
      for (const q of flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]) {
        _c.copy(base).multiplyScalar(q.tone);
        batch.vert(q.x, q.y, q.z, q.nx, q.ny, q.nz, q.u, q.v, _c);
      }
    }
    prev = cur;
  }
}

// curb lines from a set of oriented slab edges [[p, q, road]] (road-facing ones only): chains edges that share end points so the
// profile runs continuously round curves (averaged normals at the joints, no wedge gaps). nOut(p, q) -> unit normal toward the road.
export function curbChains(batch, edges, nOut, o = {}) {
  const key = (p) => Math.round(p[0] * 200) + ',' + Math.round(p[1] * 200),
    byStart = new Map(),
    used = new Set();
  edges.forEach((e, i) => {
    byStart.set(key(e[0]), i);
  });
  const hasPrev = new Set(edges.map((e) => key(e[1])));
  const order = edges
    .map((_, i) => i)
    .sort(
      (a, b) => (hasPrev.has(key(edges[a][0])) ? 1 : 0) - (hasPrev.has(key(edges[b][0])) ? 1 : 0),
    ); // chain heads first
  for (const i0 of order) {
    if (used.has(i0)) continue;
    const P = [],
      N = [];
    let i = i0,
      guard = 0;
    while (i !== undefined && !used.has(i) && guard++ < 100000) {
      used.add(i);
      const [p, q] = edges[i],
        nn = nOut(p, q);
      if (!P.length) {
        P.push(p);
        N.push(nn);
      } else {
        const l = N[N.length - 1],
          ax = l[0] + nn[0],
          az = l[1] + nn[1],
          al = Math.hypot(ax, az) || 1,
          cs = Math.max(0.5, (ax / al) * nn[0] + (az / al) * nn[1]);
        N[N.length - 1] = [ax / al / cs, az / al / cs];
      }
      P.push(q);
      N.push(nn);
      i = byStart.get(key(q));
    }
    if (
      P.length > 2 &&
      Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.01
    ) {
      const a = N[0],
        b = N[N.length - 1],
        ax = a[0] + b[0],
        az = a[1] + b[1],
        al = Math.hypot(ax, az) || 1;
      N[0] = N[N.length - 1] = [ax / al, az / al];
    }
    curbLine(batch, P, N, { ...o, seed: (o.seed || 0) + i0 });
  }
}
