// Floor plans. A plan is a set of rectangular rooms that tile the lot (store-local frame: x across the frontage, z along the depth,
// street side at z = +D/2, y up), the doors between them, the storefront, and stairs/elevators between levels.
// finalize() derives every wall segment with its openings, per-room wall faces (for mounting fixtures), and colliders.
import { clamp } from './kit/util.js';

const EPS = 0.02;
export const rect = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
// cut(rect, side, amount) -> [piece, rest]. side: 'back' (-z), 'front' (+z), 'left' (-x), 'right' (+x)
export function cut(r, side, d) {
  if (side === 'back') return [rect(r.x0, r.z0, r.x1, r.z0 + d), rect(r.x0, r.z0 + d, r.x1, r.z1)];
  if (side === 'front') return [rect(r.x0, r.z1 - d, r.x1, r.z1), rect(r.x0, r.z0, r.x1, r.z1 - d)];
  if (side === 'left') return [rect(r.x0, r.z0, r.x0 + d, r.z1), rect(r.x0 + d, r.z0, r.x1, r.z1)];
  return [rect(r.x1 - d, r.z0, r.x1, r.z1), rect(r.x0, r.z0, r.x1 - d, r.z1)];
}
export const rw = (r) => r.x1 - r.x0, rd = (r) => r.z1 - r.z0, rcx = (r) => (r.x0 + r.x1) / 2, rcz = (r) => (r.z0 + r.z1) / 2;

export class Plan {
  constructor(lot) { // lot: { W, D, H (clear height per level), levels, doorX, doorW }
    Object.assign(this, { W: lot.W, D: lot.D, H: lot.H, levels: lot.levels || 1, doorX: lot.doorX || 0, doorW: lot.doorW || 1.8 });
    this.lot = rect(-this.W / 2, -this.D / 2, this.W / 2, this.D / 2); this.rooms = []; this.doors = []; this.opens = []; this.walls = []; this.stairs = []; this.lifts = []; this.front = null; this.colliders = []; this.T = 0.12;
  }
  // kind: 'sales' | 'stock' | 'office' | 'restroom' | 'kitchen' | 'cooler' | 'fitting' | 'hall' | 'service' | 'dining' | ... (free text; staff-only kinds are listed in STAFF_ONLY)
  // o: { level, h (ceiling height), floor, wall, ceil: { type: 'drop'|'gyp'|'open'|'tin', surf }, rig (lighting rig name), staffOnly, name }
  room(id, kind, r, o = {}) { const rm = { id, kind, ...rect(r.x0, r.z0, r.x1, r.z1), level: o.level || 0, h: Math.min(o.h || 3, this.H - 0.05), staffOnly: o.staffOnly ?? STAFF_ONLY.has(kind), ...o, faces: [] }; rm.y0 = rm.level * (this.H + 0.3); rm.w = rm.x1 - rm.x0; rm.d = rm.z1 - rm.z0; rm.cx = (rm.x0 + rm.x1) / 2; rm.cz = (rm.z0 + rm.z1) / 2; this.rooms.push(rm); return rm; }
  get(id) { return this.rooms.find((r) => r.id === id); }
  // doorway between two adjacent rooms. o: { at (0..1 along the shared edge, default 0.5), w, h, kind: 'hinged'|'double'|'swing'|'open'|'curtain'|'pass', sill (pass-through), glass, staff, locked, auto }
  door(a, b, o = {}) { const d = { a: a.id || a, b: b.id || b, w: 0.92, h: 2.06, kind: 'hinged', at: 0.5, ...o }; this.doors.push(d); return d; }
  // no wall between two adjacent rooms (zones of one open space)
  open(a, b) { this.opens.push([a.id || a, b.id || b]); }
  // storefront. o: { style, door: { kind: 'auto'|'double'|'hinged', w, x }, bulkhead (m), transom (m), glazing: 0..1 share of the frontage, walkup: { x, w, sill, h } (ventanita), recess (m), solid: [[x0, x1]...] }
  storefront(o = {}) { this.front = { style: 'aluminum', bulkhead: 0.45, transom: 0.5, glazing: 1, ...o, door: { kind: 'double', w: this.doorW, x: this.doorX, h: 2.15, ...(o.door || {}) } }; return this.front; }
  // straight stair from level `from` up to `from + 1`. (x, z) = foot center of the first riser, ry = direction of travel going up
  stair(o) { this.stairs.push({ w: 1.1, from: 0, ...o }); }
  lift(o) { this.lifts.push({ w: 1.5, d: 1.5, from: 0, to: 1, ...o }); }

  roomAt(x, z, level = 0) { for (const r of this.rooms) if (r.level === level && x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS) return r; return null; }

  finalize() {
    const T = this.T, H = this.H, walls = this.walls; walls.length = 0;
    const isOpen = (a, b) => this.opens.some(([p, q]) => (p === a.id && q === b.id) || (p === b.id && q === a.id));
    const doorsOf = (a, b) => this.doors.filter((d) => (d.a === a.id && d.b === b.id) || (d.a === b.id && d.b === a.id));
    // ---- interior partitions between adjacent rooms on the same level
    for (let i = 0; i < this.rooms.length; i++) for (let j = i + 1; j < this.rooms.length; j++) {
      const A = this.rooms[i], B = this.rooms[j]; if (A.level !== B.level) continue;
      let seg = null;
      if (Math.abs(A.x1 - B.x0) < EPS || Math.abs(B.x1 - A.x0) < EPS) { const c = Math.abs(A.x1 - B.x0) < EPS ? A.x1 : A.x0, a = Math.max(A.z0, B.z0), b = Math.min(A.z1, B.z1); if (b - a > 0.3) seg = { axis: 'x', c, a, b, neg: Math.abs(A.x1 - B.x0) < EPS ? A : B, pos: Math.abs(A.x1 - B.x0) < EPS ? B : A }; }
      else if (Math.abs(A.z1 - B.z0) < EPS || Math.abs(B.z1 - A.z0) < EPS) { const c = Math.abs(A.z1 - B.z0) < EPS ? A.z1 : A.z0, a = Math.max(A.x0, B.x0), b = Math.min(A.x1, B.x1); if (b - a > 0.3) seg = { axis: 'z', c, a, b, neg: Math.abs(A.z1 - B.z0) < EPS ? A : B, pos: Math.abs(A.z1 - B.z0) < EPS ? B : A }; }
      if (!seg || isOpen(A, B)) continue;
      seg.t = T; seg.y0 = A.y0; seg.y1 = A.y0 + H; seg.openings = [];
      for (const d of doorsOf(A, B)) { const L = seg.b - seg.a, w = Math.min(d.w, L - 0.3), m = seg.a + clamp(d.at <= 1 ? d.at * L : d.at - seg.a, w / 2 + 0.15, L - w / 2 - 0.15); const op = { a: m - w / 2, b: m + w / 2, y0: d.kind === 'pass' ? (d.sill ?? 1.0) : 0, y1: d.kind === 'pass' ? (d.sill ?? 1.0) + (d.h < 1.9 ? d.h : 1.0) : d.h, door: d, mid: m }; seg.openings.push(op); d.seg = seg; d.op = op; d.x = seg.axis === 'x' ? seg.c : m; d.z = seg.axis === 'x' ? m : seg.c; d.level = A.level; }
      seg.openings.sort((p, q) => p.a - q.a); walls.push(seg);
    }
    // ---- perimeter: party walls (left, right, back) and the storefront line (front)
    for (const R of this.rooms) {
      const per = [];
      if (Math.abs(R.x0 - this.lot.x0) < EPS) per.push({ axis: 'x', c: R.x0, a: R.z0, b: R.z1, pos: R, neg: null });
      if (Math.abs(R.x1 - this.lot.x1) < EPS) per.push({ axis: 'x', c: R.x1, a: R.z0, b: R.z1, neg: R, pos: null });
      if (Math.abs(R.z0 - this.lot.z0) < EPS) per.push({ axis: 'z', c: R.z0, a: R.x0, b: R.x1, pos: R, neg: null });
      if (Math.abs(R.z1 - this.lot.z1) < EPS) per.push({ axis: 'z', c: R.z1, a: R.x0, b: R.x1, neg: R, pos: null, front: R.level === 0 });
      for (const s of per) { s.t = 0.25; s.ext = true; s.y0 = R.y0; s.y1 = R.y0 + H; s.openings = []; walls.push(s); }
    }
    // back / side service doors declared against the outside: door(room, 'outside:back' | 'outside:left' | 'outside:right', o)
    for (const d of this.doors) { if (typeof d.b !== 'string' || !d.b.startsWith('outside')) continue; const R = this.get(d.a), side = d.b.split(':')[1] || 'back';
      const s = side === 'front' ? walls.find((w) => w.front && w.neg === R) : walls.find((w) => w.ext && !w.front && (w.pos === R || w.neg === R) && (side === 'back' ? w.axis === 'z' && Math.abs(w.c - this.lot.z0) < EPS : w.axis === 'x' && Math.abs(w.c - (side === 'left' ? this.lot.x0 : this.lot.x1)) < EPS)); if (!s) continue;
      const L = s.b - s.a, m = d.atX != null ? d.atX : s.a + clamp(d.at * L, d.w / 2 + 0.2, L - d.w / 2 - 0.2); const op = { a: m - d.w / 2, b: m + d.w / 2, y0: 0, y1: d.h, door: d, mid: m }; s.openings.push(op); d.seg = s; d.op = op; d.exterior = true; d.x = s.axis === 'x' ? s.c : m; d.z = s.axis === 'x' ? m : s.c; d.level = R.level; }
    // ---- per-room wall faces: { axis, c, a, b, nx, nz (into the room), len, openings, seg, room, used: [[a, b]...] }
    for (const R of this.rooms) R.faces.length = 0;
    for (const s of walls) for (const [R, sign] of [[s.neg, -1], [s.pos, 1]]) { if (!R) continue; const f = { seg: s, room: R, axis: s.axis, c: s.c + sign * (s.ext ? 0 : s.t / 2), a: Math.max(s.a, s.axis === 'x' ? R.z0 : R.x0), b: Math.min(s.b, s.axis === 'x' ? R.z1 : R.x1), nx: s.axis === 'x' ? sign : 0, nz: s.axis === 'z' ? sign : 0, openings: s.openings, used: [], front: !!s.front }; f.len = f.b - f.a; f.side = s.axis === 'x' ? (sign > 0 ? 'left' : 'right') : (sign > 0 ? 'back' : 'front'); R.faces.push(f); }
    return this;
  }
  // free spans of a room's wall on one side ('left' | 'right' | 'back' | 'front'), longest first: [{ face, a, b, len }]
  spans(room, side, minLen = 0.5) {
    const out = [];
    for (const f of room.faces) { if (side && f.side !== side) continue; if (f.front) continue; const blocks = [...f.openings.map((o) => [o.a - 0.12, o.b + 0.12]), ...f.used].filter((b) => b[1] > f.a && b[0] < f.b).sort((p, q) => p[0] - q[0]); let a = f.a;
      for (const [b0, b1] of blocks) { if (b0 - a >= minLen) out.push({ face: f, a, b: b0, len: b0 - a }); a = Math.max(a, b1); } if (f.b - a >= minLen) out.push({ face: f, a, b: f.b, len: f.b - a }); }
    return out.sort((p, q) => q.len - p.len);
  }
  // reserve [a, b] on a face so nothing else is mounted there
  take(face, a, b) { face.used.push([Math.min(a, b), Math.max(a, b)]); }
  // store-local point and yaw (facing into the room) for a position `u` along a face, `off` meters off the wall
  onFace(face, u, off = 0) { const c = face.c + (face.axis === 'x' ? face.nx : face.nz) * off; return face.axis === 'x' ? { x: c, z: u, ry: face.nx > 0 ? Math.PI / 2 : -Math.PI / 2 } : { x: u, z: c, ry: face.nz > 0 ? 0 : Math.PI }; }
}
export const STAFF_ONLY = new Set(['stock', 'office', 'kitchen', 'cooler', 'service', 'breakroom', 'prep', 'vault', 'backbar', 'mechanical']);
