// Car definition factory: turns a compact parameter sheet (master-curve keys, silhouettes, tape-drawn features)
// into the `def` object kit/body.js consumes.  Each car file is then mostly numbers and its own styling features.
import { C, sd, sstep, mix, clamp01 } from './surf.js';
import { RS } from './trim.js';
import { stdSection, stations } from './body.js';

const P2 = (pts, r) => sd.rpoly(pts, r || 0);

/**
 * p = {
 *   key, zs: [zTailStation, zNoseStation, step, extra[]], curves: { yb, wS, W, yW, wSh, ySh, wB, yB, wR, yR, yC } (key lists), k (section coefficients),
 *   nose: { sil, n, p, gamma }, tail: { ... }, deform: [fn],
 *   carbonRing: number | (z) => number     rings below this are exposed carbon (splitter, sills, diffuser)
 *   glass: [ { id, view, pts, r, frit, mask, mat } ]
 *   paint2: [ { id, view, pts | shape, r, mask, mat } ]      second paint / black areas
 *   arches: [ { id, z, y, R, xin, lip } ]
 *   holes:  [ { id, view, pts | shape, r, mask, dir, depth, taper, mesh, meshAt, lod1mat } ]
 *   lenses: [ { id, view, pts | shape, r, mask, mat, dir, depth, taper } ]
 *   panels: [ { id, view, pts | shape, r, mask, ringMax, ringMin, gap, sided } ]
 * }
 */
export function makeDef(p) {
  const c = {};
  for (const k in p.curves) c[k] = C(p.curves[k]);
  const zs = stations(p.zs[0], p.zs[1], p.zs[2] || 0.1, p.zs[3] || []);
  const shapeOf = (o) => o.shape || P2(o.pts, o.r);
  const def = {
    key: p.key,
    p,
    c,
    zs,
    K: 15,
    section: p.section || ((z) => stdSection(c, z, p.k)),
    nose: p.nose,
    tail: p.tail,
    deform: p.deform || [],
    density: p.density,
    hullMinY: p.hullMinY,
    sided: (p.panels || []).filter((q) => q.sided).map((q) => q.id),
    regions(ctx) {
      const { skin, lod } = ctx,
        R = [];
      if (p.carbonRing != null) {
        const rc = typeof p.carbonRing === 'function' ? p.carbonRing : () => p.carbonRing;
        R.push({
          id: 'lowerCarbon',
          kind: 'mat',
          mat: 'carbon',
          view: (x, y, z, u) => (skin.ringOf(u) - rc(z, x, y)) * RS,
        });
      }
      for (const q of p.paint2 || [])
        R.push({
          id: q.id,
          kind: 'mat',
          mat: q.mat || 'paint2',
          view: q.view,
          shape: shapeOf(q),
          mask: q.mask,
          over: q.over,
          border: q.border,
        });
      for (const q of p.glass || [])
        R.push({
          id: q.id,
          kind: 'mat',
          mat: q.mat || 'glass',
          view: q.view,
          shape: shapeOf(q),
          mask: q.mask,
          border: lod < 2 && q.frit ? { w: q.frit, mat: 'frit' } : null,
          rim: lod === 0,
        });
      for (const q of p.lenses || [])
        R.push({
          id: q.id,
          kind: 'mat',
          mat: q.mat || 'lens',
          view: q.view,
          shape: shapeOf(q),
          mask: q.mask,
          rim: lod === 0,
          border: q.border,
        });
      for (const a of p.arches || []) {
        const circ = sd.circle(a.z, a.y, a.R);
        const rMax = a.ringMax ?? 6.9; // side and floor only: never cut the hood or deck above the fender crest
        R.push({
          id: a.id,
          kind: 'hole',
          view: (x, y, z, u) => Math.max(circ(z, y), a.xin - x, (skin.ringOf(u) - rMax) * RS),
        });
      }
      for (const q of p.holes || []) {
        if (lod === 0 && !q.flat)
          R.push({
            id: q.id,
            kind: 'hole',
            view: q.view,
            shape: shapeOf(q),
            mask: q.mask,
            over: q.over,
          });
        else
          R.push({
            id: q.id,
            kind: 'mat',
            mat: q.lod1mat || 'shadow',
            view: q.view,
            shape: shapeOf(q),
            mask: q.mask,
            over: q.over,
          });
      }
      if (lod < 2)
        for (const q of p.panels || []) {
          const s = shapeOf(q);
          let view = q.view;
          if (q.ringMax != null || q.ringMin != null) {
            const base =
              q.view === 'side'
                ? (x, y, z) => s(z, y)
                : q.view === 'top'
                  ? (x, y, z) => s(x, z)
                  : q.view === 'front'
                    ? (x, y, z) => s(x, y)
                    : (x, y, z, u) => s(skin.ringOf(u) * RS, z);
            view = (x, y, z, u, v) => {
              let f = base(x, y, z, u, v);
              const rk = skin.ringOf(u);
              if (q.ringMax != null) f = Math.max(f, (rk - q.ringMax) * RS);
              if (q.ringMin != null) f = Math.max(f, (q.ringMin - rk) * RS);
              return f;
            };
          }
          R.push({
            id: q.id,
            kind: 'panel',
            view,
            shape: s,
            mask: q.mask,
            gap: q.gap,
            depth: q.depth,
            from: q.from,
          });
        }
      if (p.regions) R.push(...p.regions(ctx));
      return R;
    },
    after(ctx) {
      const { mesh, lod } = ctx;
      if (lod === 0) {
        for (const a of p.arches || [])
          mesh.walls(a.id, {
            dir: [-1, 0, 0],
            depth: a.lip ?? 0.035,
            mat: 'archLip',
            part: 'body',
          });
        for (const q of p.holes || []) {
          if (q.flat) continue;
          const dir = q.dir || 'normal';
          if (q.mesh !== false)
            mesh.walls(q.id, {
              dir,
              depth: q.meshAt ?? 0.03,
              mat: q.wallMat || 'duct',
              cap: { mat: q.meshMat || 'hexmesh' },
              part: q.part || 'body',
            });
          mesh.walls(q.id, {
            dir,
            depth: q.depth ?? 0.22,
            taper: q.taper ?? 0.3,
            mat: q.wallMat || 'duct',
            cap: { mat: 'shadow' },
            part: q.part || 'body',
          });
        }
        for (const q of p.lenses || [])
          mesh.walls(q.id, {
            dir: q.dir || 'normal',
            depth: q.depth ?? 0.07,
            taper: q.taper ?? 0.22,
            mat: 'housing',
            cap: { mat: 'housing' },
            part: q.part || 'body',
          });
      }
      if (p.after) p.after(ctx);
    },
  };
  return def;
}
export { C, sd, sstep, mix, clamp01, RS };

// ---------------------------------------------------------------- sculpting deformers (applied on top of the spline skin)
const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
export const sculpt = {
  /** Side scallop that deepens toward the rear and ends in an intake mouth: z from zF (shallow) back to zM (deepest), then returns by zR. */
  scallop(o) {
    return (p, ctx) => {
      const z = p[2],
        y = p[1];
      if (z > o.zF || z < o.zR || p[0] < (o.xMin ?? 0.5)) return;
      const wz = Math.pow(sstep(o.zF, o.zM, z), o.pow || 1.4) * (1 - sstep(o.zM - 0.02, o.zR, z));
      let wy;
      if (o.r0 != null)
        wy = bump(o.r0, o.r0 + (o.rs0 ?? 0.8), o.r1 - (o.rs1 ?? 0.5), o.r1, ctx.ring);
      else {
        const top = typeof o.yTop === 'function' ? o.yTop(z) : o.y1,
          bot = typeof o.yBot === 'function' ? o.yBot(z) : o.y0;
        wy = bump(bot, bot + (o.soft0 ?? 0.1), top - (o.soft1 ?? 0.06), top, y);
      }
      p[0] -= o.depth * wz * wy;
    };
  },
  /** Wheel-arch flare: a soft raised ring around the arch opening. */
  flare(o) {
    return (p) => {
      if (p[0] < (o.xMin ?? 0.55)) return;
      const d = Math.hypot(p[2] - o.z, p[1] - o.y) - o.R;
      if (d < -0.05 || d > o.w * 2.5) return;
      p[0] += o.amt * Math.exp(-((d / o.w) ** 2));
    };
  },
  /** Raised or sunk crease along a side-view polyline [[z, y], ...]: amt > 0 pushes out. width = half-width of the ridge. */
  creaseSide(o) {
    const f = sd.stroke(o.pts, 0);
    return (p) => {
      if (p[0] < (o.xMin ?? 0.5)) return;
      const d = f(p[2], p[1]);
      if (d > o.width) return;
      const t = 1 - d / o.width;
      p[0] += o.amt * (o.sharp ? t : t * t * (3 - 2 * t));
    };
  },
  /** Vertical push over a top-view shape (hood bulge, vent pocket): amt > 0 raises.  shape = sd function of (x, z), soft = falloff distance. */
  top(o) {
    return (p) => {
      if (p[1] < (o.yMin ?? 0.4)) return;
      const d = o.shape(p[0], p[2]);
      if (d > 0) return;
      p[1] += o.amt * sstep(0, o.soft || 0.05, -d);
    };
  },
  /** Sideways push over a side-view shape. amt > 0 pushes out. */
  side(o) {
    return (p) => {
      if (p[0] < (o.xMin ?? 0.5)) return;
      const d = o.shape(p[2], p[1]);
      if (d > 0) return;
      p[0] += o.amt * sstep(0, o.soft || 0.05, -d);
    };
  },
  /** Longitudinal push over a front/rear-view shape (recess in a bumper face). zSide: +1 nose, -1 tail; amt > 0 pushes outward. */
  face(o) {
    return (p) => {
      if (o.zSide > 0 ? p[2] < o.zMin : p[2] > o.zMax) return;
      const d = o.shape(p[0], p[1]);
      if (d > 0) return;
      p[2] += o.zSide * o.amt * sstep(0, o.soft || 0.04, -d);
    };
  },
};
