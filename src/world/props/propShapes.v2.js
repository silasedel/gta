// Collider shapes + physics class for the library street props, measured from the model meshes themselves (overnight
// props pass): the collider matches what you see (cylinder bins, box mailbox head on a thin post, cone on a flat base).
//   physOf(name, parts) -> { cls: 'push'|'knock'|'static', mass, friction, shapes: [...] } | null   (dynamicProps.v2.js shapes,
//                          model frame: origin = base center, +Y up, unscaled)
//   boundsOf(parts)     -> THREE.Box3 of all part geometries (cached)
import * as THREE from 'three';

const cache = new Map();
export function boundsOf(parts) {
  if (!parts || !parts.length) return null;
  let b = cache.get(parts);
  if (b) return b;
  b = new THREE.Box3();
  for (const q of parts) {
    q.geometry.computeBoundingBox();
    b.union(q.geometry.boundingBox);
  }
  cache.set(parts, b);
  return b;
}
// bounds of the vertices inside a height band [y0, y1) (posts vs heads)
function band(parts, y0, y1) {
  const b = new THREE.Box3(),
    v = new THREE.Vector3();
  for (const q of parts) {
    const P = q.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      if (y >= y0 && y < y1) b.expandByPoint(v.fromBufferAttribute(P, i));
    }
  }
  return b.isEmpty() ? null : b;
}
const boxOf = (b, shrink = 1) => ({
  t: 'box',
  hx: ((b.max.x - b.min.x) / 2) * shrink,
  hy: (b.max.y - b.min.y) / 2,
  hz: ((b.max.z - b.min.z) / 2) * shrink,
  x: (b.max.x + b.min.x) / 2,
  y: (b.max.y + b.min.y) / 2,
  z: (b.max.z + b.min.z) / 2,
});
const cylOf = (b, shrink = 1) => ({
  t: 'cyl',
  r: (Math.min(b.max.x - b.min.x, b.max.z - b.min.z) / 2) * shrink,
  hh: (b.max.y - b.min.y) / 2,
  x: (b.max.x + b.min.x) / 2,
  y: (b.max.y + b.min.y) / 2,
  z: (b.max.z + b.min.z) / 2,
});

// name -> how it behaves (mass kg: empty-ish carts tip when walked into; posts snap under a car)
const SPEC = {
  cart: { cls: 'push', mass: 14, kind: 'box', shrink: 0.94 },
  bin_wheel: { cls: 'push', mass: 14, kind: 'box', shrink: 0.94 },
  bin_set: { cls: 'static', kind: 'box' },
  bin_metal: { cls: 'push', mass: 32, kind: 'cyl', shrink: 0.97 },
  bin_wood: { cls: 'push', mass: 28, kind: 'cyl', shrink: 0.97 },
  bin_commercial: { cls: 'push', mass: 30, kind: 'box', shrink: 0.97 },
  mailbox_post: { cls: 'knock', mass: 9, kind: 'post' },
  mailbox_twin: { cls: 'knock', mass: 14, kind: 'post' },
  mailbox_drop: { cls: 'static', kind: 'box' },
  newsbox: { cls: 'push', mass: 35, kind: 'box' },
  cone: { cls: 'push', mass: 3.2, kind: 'cone', friction: 0.85 },
  channelizer: { cls: 'push', mass: 7, kind: 'post' },
  tc_bollard: { cls: 'push', mass: 5, kind: 'post' },
  barricade2: { cls: 'push', mass: 11, kind: 'post' },
  chair: { cls: 'push', mass: 2.4, kind: 'box', shrink: 0.92 },
  patio_table: { cls: 'push', mass: 5, kind: 'box', shrink: 0.95 },
  tarp_crates: { cls: 'static', kind: 'box' },
  jersey: { cls: 'static', kind: 'box' },
  food_cart: { cls: 'static', kind: 'post' },
};

export function physOf(name, parts) {
  const sp = SPEC[name];
  if (!sp || !parts) return null;
  const key = parts;
  let r = cache.get('p:' + name);
  if (r) return r;
  const b = boundsOf(parts);
  if (!b) return null;
  const H = b.max.y - b.min.y;
  let shapes;
  if (sp.kind === 'cyl') shapes = [cylOf(b, sp.shrink)];
  else if (sp.kind === 'cone') {
    // flat square foot + the cone itself
    const foot = band(parts, b.min.y, b.min.y + 0.045) || b,
      top = band(parts, b.min.y + 0.05, b.max.y + 1) || b;
    const fb = boxOf(foot);
    fb.hy = Math.max(0.012, fb.hy);
    const tr = Math.min(top.max.x - top.min.x, top.max.z - top.min.z) / 2;
    shapes = [
      fb,
      {
        t: 'cone',
        r: tr,
        hh: (top.max.y - top.min.y) / 2,
        x: (top.max.x + top.min.x) / 2,
        y: (top.max.y + top.min.y) / 2,
        z: (top.max.z + top.min.z) / 2,
      },
    ];
  } else if (sp.kind === 'post') {
    // thin post(s) / feet below, the box / panel above (split at the widest change)
    // split height: the HIGHEST cut that still separates a thin lower part from a wide upper part (a long post box only has
    // its foot vertices low down, so every low cut looks equally good; taking the highest keeps the wide box to the head)
    let split = b.min.y + H * 0.5;
    const ds = [];
    for (let f = 0.15; f <= 0.851; f += 0.05) {
      const lo = band(parts, b.min.y, b.min.y + H * f),
        hi = band(parts, b.min.y + H * f, b.max.y + 1);
      if (!lo || !hi) continue;
      const wl = (lo.max.x - lo.min.x) * (lo.max.z - lo.min.z),
        wh = (hi.max.x - hi.min.x) * (hi.max.z - hi.min.z);
      ds.push([f, Math.abs(wh - wl) / Math.max(wh, wl, 1e-6)]);
    }
    const dmax = Math.max(0, ...ds.map((q) => q[1]));
    for (const [f, d] of ds) if (d >= dmax * 0.9) split = b.min.y + H * f;
    const lo = band(parts, b.min.y, split),
      hi = band(parts, split, b.max.y + 1);
    // the bands come from VERTICES: a post modelled as one long box only has its foot below the split, so each band's
    // footprint is taken from its vertices but its height always spans the band (foot -> split, split -> top)
    if (lo) {
      lo.min.y = b.min.y;
      lo.max.y = split;
    }
    if (hi) {
      hi.min.y = Math.min(hi.min.y, split);
      hi.max.y = b.max.y;
    }
    shapes = [lo && boxOf(lo), hi && boxOf(hi)].filter(Boolean);
  } else shapes = [boxOf(b, sp.shrink || 1)];
  r = { cls: sp.cls, mass: sp.mass || 20, friction: sp.friction, shapes, height: H, bounds: b };
  cache.set('p:' + name, r);
  return r;
}
