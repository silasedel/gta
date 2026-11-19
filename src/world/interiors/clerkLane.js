// Clerk lane rules shared by the V2 interiors engine and the v1 (legacy) layouts. Pure math (no three.js), store-local frame.
// Rule: behind every counter there is a clear lane at least LANE_MIN deep (counter back -> back shelf / wall) and the clerk stands
// in it, facing the customers, never inside furniture. Furniture = collider boxes [cx, cy, cz, hx, hy, hz, yaw?].
// - settleClerk(spot, boxes, o): checks a staff spot and, if a body there would overlap furniture, slides it along the lane to a free place.
// - auditClerk(spot, boxes, o): { hits, front, back, lane } for the check (game.interiors.auditClerks(), preview.html window.auditClerks()).
export const LANE_MIN = 0.9, LANE = 1.0, CLERK_R = 0.24;
export const STAFF_TAGS = new Set(['post', 'counter', 'bartend', 'host', 'dj', 'serve', 'door']);

// circle (x, z, r) against one box, only where the box crosses the body band y0..y1 (floor mats and high signs do not count)
export function boxHit(x, z, b, r, y0, y1) {
  const hy = b[4]; if (b[1] + hy <= y0 || b[1] - hy >= y1) return false;
  let dx = x - b[0], dz = z - b[2]; const yaw = b[6];
  if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw), t = dx * c - dz * s; dz = dx * s + dz * c; dx = t; }
  const ex = Math.max(Math.abs(dx) - b[3], 0), ez = Math.max(Math.abs(dz) - b[5], 0);
  return ex * ex + ez * ez < r * r;
}
const band = (o) => { const f = o.floor ?? 0; return [f + (o.y0 ?? 0.22), f + (o.y1 ?? 1.6)]; };
const inBounds = (x, z, r, bd) => !bd || (x - r >= bd.x0 && x + r <= bd.x1 && z - r >= bd.z0 && z + r <= bd.z1);
export function clerkHits(x, z, boxes, o = {}) {
  const [y0, y1] = band(o), r = o.r ?? CLERK_R, out = [];
  for (const b of boxes) if (boxHit(x, z, b, r, y0, y1)) out.push(b);
  if (!inBounds(x, z, r - 0.02, o.bounds)) out.push('wall');
  return out;
}
// distance from the spot to the first furniture along a direction (dx, dz), up to max
function reach(x, z, dx, dz, boxes, o, max = 3) {
  const [y0, y1] = band(o), bd = o.bounds;
  for (let t = 0.02; t <= max; t += 0.02) { const px = x + dx * t, pz = z + dz * t;
    if (bd && (px < bd.x0 || px > bd.x1 || pz < bd.z0 || pz > bd.z1)) return t;
    for (const b of boxes) if (boxHit(px, pz, b, 0.02, y0, y1)) return t; }
  return Infinity;
}
// the lane around a staff spot: front = distance to the counter (the way the clerk faces), back = distance to the shelf / wall behind
export function auditClerk(c, boxes, o = {}) {
  const ry = c.ry || 0, fx = Math.sin(ry), fz = Math.cos(ry);
  const hits = clerkHits(c.x, c.z, boxes, o), front = reach(c.x, c.z, fx, fz, boxes, o), back = reach(c.x, c.z, -fx, -fz, boxes, o);
  return { x: +c.x.toFixed(2), z: +c.z.toFixed(2), hits: hits.length, front: +front.toFixed(2), back: +back.toFixed(2), lane: +(front + back).toFixed(2) };
}
// Move a staff spot out of furniture. First to the middle of its lane (between the counter in front and whatever is behind), then,
// if that is still blocked, along the lane (sideways) and a little in depth. Mutates c.x / c.z. Returns 'ok' | 'moved' | 'stuck'.
export function settleClerk(c, boxes, o = {}) {
  const r = (o.r ?? CLERK_R) + 0.03, oo = { ...o, r }, free = (x, z) => clerkHits(x, z, boxes, oo).length === 0;
  if (free(c.x, c.z)) return 'ok';
  const ry = c.ry || 0, fx = Math.sin(ry), fz = Math.cos(ry), ax = Math.cos(ry), az = -Math.sin(ry);
  const tryAt = (x, z) => { if (!free(x, z)) return false; c.x = x; c.z = z; return true; };
  // a spot that is merely too close to one side: center it in the lane
  const f = reach(c.x, c.z, fx, fz, boxes, o), b = reach(c.x, c.z, -fx, -fz, boxes, o);
  if (f > 0.03 && b > 0.03 && f + b < 2.5 && f + b >= 2 * r) { const d = (f - b) / 2; if (tryAt(c.x + fx * d, c.z + fz * d)) return 'moved'; }
  const along = o.along ?? 3, cands = [];
  for (let t = 0; t <= along + 1e-6; t += 0.1) for (const s of t ? [1, -1] : [1]) for (const d of [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.45, 0.45]) cands.push([t * s, d, t + Math.abs(d) * 1.5]);
  cands.sort((p, q) => p[2] - q[2]);
  for (const [t, d] of cands) if (tryAt(c.x + ax * t + fx * d, c.z + az * t + fz * d)) return 'moved';
  return 'stuck';
}
