// ELEVATED-2: hand-authored per-cluster overrides, applied on top of the global rules (network.js hooks).
// Where OSM data contradicts itself (ramp merge nodes at heights the parent deck cannot have, ramps drawn through
// another deck while still climbing, layer-tag bridges that dive under a motorway) no global rule can win everywhere,
// so these few knots get explicit, real-world-plausible geometry. Global rules are untouched.
//
// Each entry: { id, edge (an OSM edge id the chain contains), near: [x, z, R] (sanity check: chain passes within R),
//   reroute?: { parentEdge, from: [x, z], blend, hold, merge, endOffset, gap }   plan: run beside the parent deck, then merge
//   profile?: { pts: [[x, z, y], ...], round, w, drop }                           vertical: control points (projected on the chain)
// }
// Plan re-routes move a chain off its OSM centre-line, and the city's AI traffic and drive harness follow OSM lines, so
// every cluster below is solved vertically only (no entry uses `reroute` at the moment; the mechanism stays available).
// reroute: from `from` (a point on the chain) the chain blends over `blend` m (measured along the parent) from its own
// line to a line `gap` m outside the parent's deck edge (side = the side the chain approaches from), runs there for
// `hold` m, then converges over `merge` m to `endOffset` (signed lateral offset from the parent centre, + = right of the
// parent's travel direction) where the chain ends inside the parent's lanes.
// profile: piecewise-linear target through the control points, corners rounded with a box filter of radius `round` m
// (parabolic vertical curves), followed with weight `w`; `drop` lists solver pins removed inside the range
// ('merge' coplanar pins, 'gap' gap fills, 'lo' clearance floors to lower decks, 'hi' ceilings).
import { P } from './params.js';
import { boxSmooth } from './solve.js';

export const OVERRIDES = [
  // ---------------- cluster A: I-95 / I-395 / SW 1st St knot (Downtown, around (-3440, 645))
  // US 1 / Downtown Distributor ramp to I-95 SB (chain with edge 1480): OSM merges it at 13.75 m into I-95 SB, ~70 m after it
  // has to clear I-95 NB at 19.7 m (~19 % grade), while the solver had flattened I-95 SB to ~11.5 m there. Real-world fix
  // that keeps every OSM centre-line on a deck (city drive + AI traffic follow them): I-95 NB stays low (~9.5 m) under the
  // ramp crossing and climbs to its 13.4 m crest only where it has to clear the I-395 links; I-95 SB rises towards its OSM
  // height (13 m at the merge node) and the ramp descends at ~5.5 % to meet it where OSM merges them.
  {
    id: 'A-96-i95nb-low',
    edge: 1292,
    near: [-3370, 760, 30],
    profile: {
      pts: [
        [-3398.6, 858.1, 9.71],
        [-3388.2, 827.4, 9.5],
        [-3371.7, 765.6, 9.45],
        [-3366.7, 694.3, 13.45],
        [-3369.4, 662.6, 13.45],
      ],
      round: 14,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    id: 'A-95-i95sb-merge',
    edge: 5290,
    near: [-3410, 760, 30],
    profile: {
      pts: [
        [-3412.5, 669.9, 6.84],
        [-3408.5, 705.5, 6.95],
        [-3415.0, 812.9, 13.3],
        [-3433.6, 870.7, 13.3],
        [-3452.7, 921.0, 12.5],
        [-3467.5, 960.2, 11.85],
      ],
      round: 16,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    id: 'A-128-us1-to-i95sb',
    edge: 1480,
    near: [-3400, 800, 60],
    profile: {
      pts: [
        [-3330.5, 701.3, 19.92],
        [-3344.7, 712.2, 19.85],
        [-3380.8, 759.5, 16.6],
        [-3401.5, 809.3, 13.2],
      ],
      round: 16,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    // SW 1st Street: OSM layer tags fly it at 12 m over the Miami River and then dive it 2-3 m under the I-95 decks (6.8 m).
    // It must also cross both River Drives (no shared node, 70 m and 20 m from the river banks) and the map edge is 70 m
    // west: a low bascule-style river bridge (1.4 m deck) with the River Drives crossing at grade, and at grade under I-95.
    id: 'A-154-sw1st',
    edge: 1404,
    near: [-3450, 646, 30],
    profile: {
      pts: [
        [-3703, 673, 0],
        [-3622, 667, 0],
        [-3598, 663, 1.4],
        [-3546, 655, 1.4],
        [-3521, 652, 0],
        [-3290, 641, 0],
      ],
      round: 10,
      w: 400,
      drop: ['merge', 'gap', 'lo'],
    },
  },
  {
    // I-95 NB -> NW 3rd Ct exit: OSM descent steepens to 8.3 % in its last 100 m; spread it (W Flagler clearance kept by the solver)
    id: 'A-1-i95nb-exit',
    edge: 1261,
    near: [-3440, 390, 30],
    profile: {
      pts: [
        [-3371.9, 588.7, 11.91],
        [-3411.3, 459.4, 7.1],
        [-3447.5, 362.9, 0.0],
      ],
      round: 20,
      w: 300,
      drop: ['gap'],
    },
  },
  {
    // West Flagler St over the Miami River to the map edge: OSM climbs 6.8 m in 100 m right after the junction; even climb
    id: 'A-118-flagler',
    edge: 5826,
    near: [-3680, 538, 30],
    profile: {
      pts: [
        [-3564.9, 524.1, 0.0],
        [-3706.9, 540.5, 6.37],
      ],
      round: 20,
      w: 300,
      drop: ['gap'],
    },
  },
  // ---------------- cluster B: MacArthur Causeway at the Terminal Island junction (Watson Island east end, (1548, 792))
  {
    // OSM leaves the westbound carriageway 1-3 m up (a hump the smoother kept) where the Terminal Island ramps (349 on,
    // 350 off), the eastbound carriageway (174 -> 227) and the 443 / 259 links all meet it at grade: real-world signalised
    // at-grade junction. The causeway is at grade on Watson Island and climbs to the 12 m main-channel bridge only east of
    // the 259 link (5.7 %, both carriageways on one slab).
    id: 'B-245-macarthur-wb',
    edge: 5363,
    near: [1540, 775, 30],
    profile: {
      pts: [
        [1850, 682, 12.0],
        [1660, 766, 0.25],
        [1645, 770, 0.0],
        [1330, 732, 0.0],
      ],
      round: 18,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    // MacArthur eastbound on Watson Island (443 link merges into it at grade at x 1461): at grade up to the junction
    id: 'B-174-macarthur-eb',
    edge: 2070,
    near: [1500, 788, 30],
    profile: {
      pts: [
        [1330, 750, 0.0],
        [1545, 792, 0.0],
      ],
      round: 0,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    id: 'B-259-link',
    edge: 3053,
    near: [1622, 795, 20],
    profile: {
      pts: [
        [1620.7, 808.4, 0.0],
        [1624.3, 783.7, 0.0],
      ],
      round: 0,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    id: 'B-443-link',
    edge: 6787,
    near: [1455, 790, 20],
    profile: {
      pts: [
        [1449.2, 801.7, 0.0],
        [1460.5, 784.1, 0.0],
      ],
      round: 0,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  // ---------------- cluster C: US 1 / Downtown Distributor ramps and the Miami River bascule bridges (Brickell, S Miami Ave, SW 2nd Ave)
  {
    // Downtown Distributor on-ramp: OSM climbs at 8 % from the junction, so the 92 on-ramp (merging 60 m later) needs 11 %.
    // Gentler first 150 m (the ramp still has 400 m to reach its 20 m flyover) - the 92 merge pins follow it.
    id: 'C-13-distributor',
    edge: 42,
    near: [-2900, 698, 30],
    profile: {
      pts: [
        [-2872, 687, 0.0],
        [-2923, 699, 2.4],
        [-2999, 703, 6.6],
        [-3312, 690, 20.2],
      ],
      round: 16,
      w: 300,
      drop: ['gap'],
    },
  },
  {
    // 97 leaves the (now gentler) Distributor ramp at node 625: it starts coplanar with 13 and stays at the ~7 m deck level
    // its street crossings need (OSM's 13.6 m hump crosses nothing), joining link 11 at 6.8 m
    id: 'C-97-link',
    edge: 1295,
    near: [-3100, 680, 30],
    profile: {
      pts: [
        [-2995.9, 703.1, 6.57],
        [-3013.7, 700.1, 7.0],
        [-3045, 695, 7.0],
        [-3271, 659, 6.8],
      ],
      round: 12,
      w: 300,
      drop: ['gap'],
    },
  },
  {
    id: 'C-92-onramp',
    edge: 1256,
    near: [-2900, 708, 20], // merges into the gentler 13: its data targets follow 13
    profile: {
      pts: [
        [-2873, 713, 0.0],
        [-2919.4, 704.9, 2.27],
        [-2939.2, 702.4, 3.27],
      ],
      round: 10,
      w: 300,
      drop: ['gap'],
    },
  },
  {
    // exit 12 -> street: the 90 link leaves it 22 m before the junction while it is still 1.6 m up; descend earlier
    id: 'C-12-exit',
    edge: 1264,
    near: [-2760, 838, 30],
    profile: {
      pts: [
        [-2845, 822, 6.75],
        [-2742, 837, 0.0],
        [-2700, 822, 0.0],
      ],
      round: 10,
      w: 400,
      drop: ['gap'],
    },
  },
  {
    id: 'C-90-link',
    edge: 1253,
    near: [-2725, 842, 15],
    profile: {
      pts: [
        [-2730.6, 836.3, 0.0],
        [-2722.9, 842.4, 0.0],
      ],
      round: 0,
      w: 300,
      drop: ['gap'],
    },
  },
  {
    id: 'C-123-link',
    edge: 1454,
    near: [-2883, 800, 15],
    profile: {
      pts: [
        [-2885.4, 792.0, 0.31],
        [-2883.4, 795.0, 0.23],
        [-2881.5, 806.8, 0.0],
      ],
      round: 4,
      w: 300,
      drop: ['gap', 'hi'],
    },
  }, // under link 2 (6.8 m): soffit clearance stays > 5.1 m
  // Miami River bascule bridges: OSM layer heights give 6.5-8 m humps whose approaches (8-19 %) collide with the streets
  // that pass under / meet them. Both carriageways of each bridge get the same low bascule profile (plateau over the water).
  {
    id: 'C-112-se2nd-brickell-nb',
    edge: 1350,
    near: [-2520, 1010, 30],
    profile: {
      pts: [
        [-2520, 910, 0.0],
        [-2520, 985, 4.0],
        [-2520, 1030, 4.0],
        [-2520, 1148, 0.0],
      ],
      round: 14,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    id: 'C-113-brickell-sb',
    edge: 1351,
    near: [-2504, 1010, 30],
    profile: {
      pts: [
        [-2508, 1148, 0.0],
        [-2503, 1030, 4.0],
        [-2504, 985, 4.0],
        [-2506, 910, 0.0],
      ],
      round: 14,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    // S Miami Ave SB: OSM keeps it 6.7 m up over SW Miami Ave Rd and the SE 6th St junction and then drops 19 % to grade.
    // The bridge lands before SW Miami Ave Rd (at-grade crossing) - low bascule deck over the river.
    id: 'C-120-smiami-sb',
    edge: 1418,
    near: [-2866, 1040, 30],
    profile: {
      pts: [
        [-2868, 918, 0.0],
        [-2867, 1005, 2.4],
        [-2865, 1060, 2.4],
        [-2863, 1102, 0.0],
        [-2916, 1218, 0.0],
      ],
      round: 16,
      w: 400,
      drop: ['merge', 'gap', 'lo'],
    },
  },
  {
    id: 'C-119-smiami-nb',
    edge: 1417,
    near: [-2851, 1040, 30],
    profile: {
      pts: [
        [-2849, 1102, 0.0],
        [-2851, 1060, 2.4],
        [-2853, 1005, 2.4],
        [-2855, 918, 0.0],
      ],
      round: 16,
      w: 400,
      drop: ['merge', 'gap'],
    },
  },
  {
    // SW 2nd Ave bridge (both one-ways): 6 m deck, south approach passes a service alley (z 1192) with 2.5 m soffit clearance
    id: 'C-368-sw2nd-sb',
    edge: 5771,
    near: [-3268, 1110, 30],
    profile: {
      pts: [
        [-3273, 978, 0.0],
        [-3273, 990, 0.0],
        [-3272, 1025, 1.1],
        [-3270, 1095, 6.0],
        [-3268, 1160, 6.0],
        [-3263, 1240, 0.7],
        [-3262, 1262, 0.0],
      ],
      round: 24,
      w: 400,
      drop: ['merge', 'gap', 'lo'],
    },
  },
  {
    id: 'C-367-sw2nd-nb',
    edge: 5773,
    near: [-3260, 1110, 30],
    profile: {
      pts: [
        [-3258, 1262, 0.0],
        [-3259, 1240, 0.7],
        [-3262, 1160, 6.0],
        [-3264, 1095, 6.0],
        [-3265, 1025, 1.1],
        [-3266, 990, 0.0],
        [-3266, 978, 0.0],
      ],
      round: 24,
      w: 400,
      drop: ['merge', 'gap', 'lo'],
    },
  },
];

// ---------------------------------------------------------------- helpers
const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function chainArc(x, z) {
  const n = x.length,
    s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  return s;
}
// nearest-segment projection of (px,pz) on a polyline: { s, d (signed, + = right of travel), i, u }
function project(x, z, s, px, pz) {
  let best = null;
  for (let i = 0; i < x.length - 1; i++) {
    const dx = x[i + 1] - x[i],
      dz = z[i + 1] - z[i],
      L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) continue;
    let u = ((px - x[i]) * dx + (pz - z[i]) * dz) / L2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = x[i] + dx * u,
      qz = z[i] + dz * u,
      d2 = (px - qx) ** 2 + (pz - qz) ** 2;
    if (!best || d2 < best.d2) {
      const L = Math.sqrt(L2);
      best = { d2, i, u, s: s[i] + L * u, d: (((px - qx) * -dz + (pz - qz) * dx) / L) * -1 };
    }
  }
  // right normal of travel (tx, tz) is (-tz, tx): d = (p - q) . (-tz, tx)
  if (best) {
    const i = best.i,
      dx = x[i + 1] - x[i],
      dz = z[i + 1] - z[i],
      L = Math.hypot(dx, dz),
      qx = x[i] + dx * best.u,
      qz = z[i] + dz * best.u;
    best.d = ((px - qx) * -dz + (pz - qz) * dx) / L;
  }
  return best;
}
// point + right normal at arc length sp on a polyline
function pointAt(x, z, s, sp) {
  const n = x.length;
  let i = 0;
  if (sp <= 0) i = 0;
  else if (sp >= s[n - 1]) i = n - 2;
  else {
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= sp) lo = m;
      else hi = m;
    }
    i = lo;
  }
  const L = s[i + 1] - s[i] || 1,
    u = (sp - s[i]) / L,
    tx = (x[i + 1] - x[i]) / L,
    tz = (z[i + 1] - z[i]) / L;
  return {
    x: x[i] + (x[i + 1] - x[i]) * u,
    z: z[i] + (z[i + 1] - z[i]) * u,
    nx: -tz,
    nz: tx,
    i,
    u,
  };
}

// attach overrides to their chains (c.ov). Returns the list of applied override ids (diagnostics).
export function resolveOverrides(chains, list = OVERRIDES) {
  const applied = [];
  for (const ov of list) {
    const c = chains.find((k) => k.edges.includes(ov.edge));
    if (!c) continue;
    if (ov.near) {
      const [nx, nz, R] = ov.near;
      let ok = false;
      for (let i = 0; i < c.n && !ok; i++) if (Math.hypot(c.x[i] - nx, c.z[i] - nz) < R) ok = true;
      if (!ok) continue;
    }
    if (ov.reroute) {
      const p = chains.find((k) => k.edges.includes(ov.reroute.parentEdge));
      if (!p || p === c) continue;
      ov._parent = p;
    }
    (c.ovs ||= []).push(ov);
    applied.push(ov.id + '@' + c.id);
  }
  return applied;
}

// plan re-routes: rebuild the chain's per-sample arrays (runs before frames / relations)
export function applyPlans(chains) {
  for (const c of chains)
    for (const ov of c.ovs || []) {
      if (!ov.reroute) continue;
      const R = ov.reroute,
        p = ov._parent,
        ps = chainArc(p.x, p.z),
        cs = chainArc(c.x, c.z);
      // start sample
      let i0 = 0,
        bd = Infinity;
      for (let i = 0; i < c.n; i++) {
        const d = Math.hypot(c.x[i] - R.from[0], c.z[i] - R.from[1]);
        if (d < bd) {
          bd = d;
          i0 = i;
        }
      }
      const pr0 = project(p.x, p.z, ps, c.x[i0], c.z[i0]);
      if (!pr0) continue;
      const side = Math.sign(pr0.d) || -1,
        spA = pr0.s;
      // original lateral offset as a function of the parent's arc length (for the blend)
      const orig = [];
      for (let i = i0; i < c.n; i++) {
        const q = project(p.x, p.z, ps, c.x[i], c.z[i]);
        if (q) orig.push([q.s, q.d]);
      }
      const dOrig = (sp) => {
        if (sp <= orig[0][0]) return orig[0][1];
        for (let k = 1; k < orig.length; k++)
          if (orig[k][0] >= sp) {
            const a = orig[k - 1],
              b = orig[k],
              t = (sp - a[0]) / (b[0] - a[0] || 1);
            return a[1] + (b[1] - a[1]) * t;
          }
        const a = orig[orig.length - 2] || orig[0],
          b = orig[orig.length - 1];
        return b[1] + ((b[1] - a[1]) / (b[0] - a[0] || 1)) * (sp - b[0]);
      };
      const edgeW = P.SHOULDER + P.BAR_BASE; // HL before squeezes (relations are not built yet)
      const HLp = (sp) => {
        const f = pointAt(p.x, p.z, ps, sp),
          i = f.i;
        return p.hw[i] + (p.hw[i + 1] - p.hw[i]) * f.u + edgeW;
      };
      const HLc = c.hw[c.n - 1] + edgeW;
      const L = R.blend + R.hold + R.merge,
        ns = Math.max(2, Math.round(L / P.SAMPLE));
      const nx = [],
        nz = [];
      for (let k = 1; k <= ns; k++) {
        const sp = spA + (L * k) / ns,
          rel = sp - spA,
          adj = side * (HLp(sp) + HLc + R.gap);
        let D;
        if (rel <= R.blend) {
          const w = smoothstep(rel / R.blend);
          D = (1 - w) * dOrig(sp) + w * adj;
        } else if (rel <= R.blend + R.hold) D = adj;
        else D = adj + (R.endOffset - adj) * smoothstep((rel - R.blend - R.hold) / R.merge);
        const f = pointAt(p.x, p.z, ps, sp);
        nx.push(f.x + f.nx * D);
        nz.push(f.z + f.nz * D);
      }
      // resample the joined polyline (head kept, tail replaced) at ~SAMPLE spacing for the new part
      const keep = i0 + 1,
        n2 = keep + nx.length;
      const grow = (a, T, fill) => {
        const o = new T(n2);
        o.set(a.subarray(0, keep));
        for (let i = keep; i < n2; i++) o[i] = fill(i);
        return o;
      };
      const last = keep - 1;
      c.x = grow(c.x, Float64Array, (i) => nx[i - keep]);
      c.z = grow(c.z, Float64Array, (i) => nz[i - keep]);
      c.yT = grow(c.yT, Float64Array, () => c.yT[last]);
      c.edge = grow(c.edge, Int32Array, () => c.edge[last]);
      c.pin = grow(c.pin, Uint8Array, () => 0);
      c.hw = grow(c.hw, Float64Array, () => c.hw[last]);
      c.sw = grow(c.sw, Float64Array, () => 0);
      c.lanesF = grow(c.lanesF, Int8Array, () => c.lanesF[last]);
      c.lanesB = grow(c.lanesB, Int8Array, () => c.lanesB[last]);
      c.oneway = grow(c.oneway, Int8Array, () => c.oneway[last]);
      c.n = n2;
      c.rerouted = { i0: keep, parent: p.id };
      void cs;
    }
}

// profile overrides also rewrite the data targets (yT) over their range: every relation test (above / below / level with a
// neighbour, banking) then agrees with the authored profile instead of the contradicting OSM heights
export function applyTargets(chains) {
  for (const c of chains)
    for (const ov of c.ovs || []) {
      const pf = ov.profile;
      if (!pf) continue;
      const s = chainArc(c.x, c.z),
        n = c.n;
      const ctl = pf.pts
        .map(([x, z, y]) => {
          let bi = 0,
            bd = Infinity;
          for (let i = 0; i < n; i++) {
            const d = Math.hypot(c.x[i] - x, c.z[i] - z);
            if (d < bd) {
              bd = d;
              bi = i;
            }
          }
          return [s[bi], y, bi];
        })
        .sort((p, q) => p[0] - q[0]);
      for (let i = ctl[0][2]; i <= ctl[ctl.length - 1][2]; i++)
        for (let k = 1; k < ctl.length; k++)
          if (s[i] <= ctl[k][0] || k === ctl.length - 1) {
            const p0 = ctl[k - 1],
              p1 = ctl[k],
              t = Math.min(1, Math.max(0, (s[i] - p0[0]) / (p1[0] - p0[0] || 1)));
            c.yT[i] = p0[1] + (p1[1] - p0[1]) * t;
            break;
          }
    }
}

// vertical overrides, two phases inside solveChain. a = { yt, w, eq, lo, hi, cons, beq }
// phase 1 (before the grade cones / banking): targets, weights, dropped pins.  phase 2 (right before the profile solve): bounds.
export function applyProfile(c, a, phase) {
  for (const ov of c.ovs || []) {
    const pf = ov.profile;
    if (!pf) continue;
    const n = c.n,
      s = c.s;
    if (!ov._T || ov._T.length !== n || ov._c !== c) {
      const ctl = pf.pts
        .map(([x, z, y]) => {
          let bi = 0,
            bd = Infinity;
          for (let i = 0; i < n; i++) {
            const d = Math.hypot(c.x[i] - x, c.z[i] - z);
            if (d < bd) {
              bd = d;
              bi = i;
            }
          }
          return [s[bi], y, bi];
        })
        .sort((p, q) => p[0] - q[0]);
      const T = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const si = s[i];
        let y;
        if (si <= ctl[0][0]) y = ctl[0][1];
        else if (si >= ctl[ctl.length - 1][0]) y = ctl[ctl.length - 1][1];
        else
          for (let k = 1; k < ctl.length; k++)
            if (si <= ctl[k][0]) {
              const p0 = ctl[k - 1],
                p1 = ctl[k],
                t = (si - p0[0]) / (p1[0] - p0[0] || 1);
              y = p0[1] + (p1[1] - p0[1]) * t;
              break;
            }
        T[i] = y;
      }
      ov._T = pf.round ? boxSmooth(T, Math.max(1, Math.round(pf.round / P.SAMPLE)), 2) : T;
      ov._i0 = ctl[0][2];
      ov._i1 = ctl[ctl.length - 1][2];
      ov._c = c;
    }
    const Ts = ov._T,
      i0 = ov._i0,
      i1 = ov._i1,
      drop = new Set(pf.drop || []),
      W = pf.w || 300,
      taper = 6;
    if (!a.ovr) a.ovr = new Uint8Array(n);
    for (let i = i0; i <= i1; i++) {
      if (phase === 1) {
        const f = Math.min(1, (i - i0 + 1) / taper, (i1 - i + 1) / taper);
        a.yt[i] = Ts[i];
        a.w[i] = Math.max(a.w[i], 1 + (W - 1) * f * f);
        if ((a.cons[i] === 3 || a.cons[i] === 2) && drop.has('merge')) {
          a.eq[i] = NaN;
          a.beq[i] = NaN;
          a.cons[i] = 0;
        }
        if (Ts[i] < 0.05) a.beq[i] = 0; // at-grade stretches: no banking
        a.ovr[i] = drop.has('gap') ? 2 : 1;
      } else {
        if (drop.has('lo') && Number.isNaN(a.eq[i]))
          a.lo[i] = Math.min(a.lo[i], Math.max(0, Ts[i] - 0.05));
        if (drop.has('hi') && Number.isNaN(a.eq[i])) a.hi[i] = Math.max(a.hi[i], Ts[i] + 0.05);
      }
    }
  }
}
