// Port Solana V2 yachts: structural kit (decks, superstructure houses, interior rooms, doors, stairs, ladders, rails,
// coamings, hardtops). Everything draws into a Builder ("ctx") and registers its own colliders and gameplay data,
// so the model and the collision can never drift apart.
import * as THREE from 'three';
import { clamp, lerp, smooth } from './builder.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 2D helpers
/** Offset a closed polygon [[x, z], ...] inward by d (outward when d < 0). Good for smooth outlines. */
export function insetPoly(poly, d) {
  const n = poly.length, out = [];
  let area = 0; for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = poly[(i + n - 1) % n], c = poly[i], q = poly[(i + 1) % n];
    let ax = c[0] - p[0], az = c[1] - p[1], bx = q[0] - c[0], bz = q[1] - c[1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; ax /= la; az /= la; bx /= lb; bz /= lb;
    // inward normal of a counterclockwise polygon is (-dz, dx)
    let nx = -(az + bz) * sg, nz = (ax + bx) * sg; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const k = 1 / Math.max(0.35, Math.sqrt((1 + ax * bx + az * bz) / 2));
    out.push([c[0] + nx * d * k, c[1] + nz * d * k]);
  }
  return out;
}
/**
 * Port-half plan [[x, z], ...] from the aft centerline to the fore centerline, for house() and deck outlines.
 * o: { zAft, zFore, w (half width, number or z -> half width), aftR (corner radius), foreR, fore: 'round'|'vee'|'flat', foreLen (length of the nose taper), n }
 */
export function planHalf(o) {
  const W = typeof o.w === 'function' ? o.w : () => o.w, n = o.n ?? 8, out = [];
  const aR = Math.min(o.aftR ?? 0.25, W(o.zAft) - 0.01), fl = o.foreLen ?? (o.fore === 'flat' ? 0 : W(o.zFore) * 0.9);
  out.push([0, o.zAft]);
  if (aR > 0.01) { out.push([W(o.zAft) - aR, o.zAft]); for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; out.push([W(o.zAft) - aR + Math.sin(a) * aR, o.zAft + aR - Math.cos(a) * aR]); } }
  else out.push([W(o.zAft), o.zAft]);
  const zs = o.zAft + aR, ze = o.zFore - fl, m = o.sideN ?? 10;
  for (let i = 1; i <= m; i++) { const z = lerp(zs, ze, i / m); out.push([W(z), z]); }
  if (fl > 0.01) {
    const w = W(ze), k = o.fore === 'vee' ? 1 : 2, nn = o.foreN ?? 12;
    for (let i = 1; i <= nn; i++) {
      const t = i / nn;
      if (o.fore === 'vee') out.push([w * (1 - t) + (o.noseW ?? 0.25) * t * (1 - t) * 0, lerp(ze, o.zFore, Math.pow(t, 0.8))]);
      else out.push([w * Math.cos((t * Math.PI) / 2), ze + fl * Math.sin((t * Math.PI) / 2)]); // quarter ellipse
      void k;
    }
  } else { const fR = Math.min(o.foreR ?? 0.25, W(o.zFore) - 0.01); if (fR > 0.01) { const last = out[out.length - 1]; last[1] = o.zFore - fR; for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; out.push([W(o.zFore) - fR + Math.cos(a) * fR, o.zFore - fR + Math.sin(a) * fR]); } } else out.push([W(o.zFore), o.zFore]); out.push([0, o.zFore]); }
  if (out[out.length - 1][0] > 1e-4) out.push([0, o.zFore]);
  return out;
}
/** Close a port-half plan into a full polygon [[x, z], ...]. */
export function fullPoly(half) {
  const a = half.filter((p, i) => !(i > 0 && Math.abs(p[0] - half[i - 1][0]) < 1e-5 && Math.abs(p[1] - half[i - 1][1]) < 1e-5));
  const st = a.slice().reverse().filter((p) => p[0] > 1e-4).map(([x, z]) => [-x, z]);
  return a.concat(st);
}
export const rectPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// ---------------------------------------------------------------- decks
/**
 * A deck plate with collider. o: { id, y (top surface), poly [[x, z], ...], holes: [poly, ...] (stair wells, hatches), t (0.09),
 *   top ('teak'), bottom ('ceiling'), edge ('gel'), margin: { w, mat } (margin boards along the edge), solid (true), name, lodEdge }
 */
export function deck(ctx, o) {
  const t = o.t ?? 0.09;
  ctx.plate(o.top ?? 'teak', o.poly, o.y, t, { holes: o.holes, bottomMat: o.bottom ?? 'ceiling', edgeMat: o.edge ?? 'gel', solid: o.solid !== false, tag: 'floor', uvJitter: false });
  if (o.margin) {
    const w = o.margin.w ?? 0.14, inner = insetPoly(o.poly, w), n = o.poly.length;
    const A = [], B = [];
    for (let i = 0; i <= n; i++) { const p = o.poly[i % n], q = inner[i % n]; A.push([p[0], o.y + 0.004, p[1]]); B.push([q[0], o.y + 0.004, q[1]]); }
    let area = 0; for (let i = 0; i < n; i++) { const a = o.poly[i], b = o.poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    ctx.ruled(o.margin.mat ?? 'teakMargin', A, B, { flip: area < 0 });
  }
  ctx.root.decks.push({ id: o.id || 'deck' + ctx.root.decks.length, name: o.name || o.id || 'Deck', y: o.y });
  return o;
}

// ---------------------------------------------------------------- houses (superstructure blocks with glazing)
/**
 * A superstructure block: leaning walls with window bands, door openings, inner lining and colliders.
 * o: {
 *   plan: port half [[x, z], ...] from the aft centerline to the fore centerline (see planHalf),
 *   y0, y1, tumble (side walls lean in, m per m of height, default 0.05), rakeF (front leans aft, default 0.45), rakeA (aft wall leans forward, default 0),
 *   t (wall thickness 0.06), mat ('gel'), inner ('wallPanel'), glass ('glass'), frame (reveal material, default mat),
 *   windows: [{ face: 'side'|'front'|'aft', a, b, y0, y1, panes, mullion, only: 'port'|'stbd', mat }]   a..b = z range on sides, |x| range on front / aft; heights above o.y0
 *   doors:   [{ face, a, b, h, only }]   openings from the floor up to h (put a door() in them, or leave open)
 *   open: ['aft'] faces left out completely (open-backed houses, hardtop supports),
 *   solid (true), capMat (top edge strip between the skins, default mat)
 * }
 * Returns { top: full polygon of the top ring (for the roof plate), topHalf, inner: full polygon of the inside floor, lean(x, z, h) }.
 */
export function house(ctx, o) {
  const P = o.plan, n = P.length - 1, y0 = o.y0, y1 = o.y1, H = y1 - y0, t = o.t ?? 0.06;
  const tum = o.tumble ?? 0.05, rF = o.rakeF ?? 0.45, rA = o.rakeA ?? 0;
  const mat = o.mat ?? 'gel', inner = o.inner ?? 'wallPanel', glass = o.glass ?? 'glass', frame = o.frame ?? mat;
  const segN = [], face = [];
  for (let k = 0; k < n; k++) { const dx = P[k + 1][0] - P[k][0], dz = P[k + 1][1] - P[k][1], l = Math.hypot(dx, dz) || 1; const nx = dz / l, nz = -dx / l; segN.push([nx, nz, l]); face.push(Math.abs(nz) > 0.75 ? (nz < 0 ? 'aft' : 'front') : 'side'); }
  const vN = [];
  for (let k = 0; k <= n; k++) { const a = segN[Math.max(0, k - 1)], b = segN[Math.min(n - 1, k)]; let nx = a[0] + b[0], nz = a[1] + b[1]; const l = Math.hypot(nx, nz) || 1; vN.push([nx / l, nz / l]); }
  // top ring: every wall leans against its own outward normal
  const leanOf = (nx, nz, h) => [-nx * tum * h, -nz * (nz > 0 ? rF : rA) * h];
  const T = P.map((p, k) => { const [ox, oz] = leanOf(vN[k][0], vN[k][1], H); return [Math.max(0, p[0] + ox), p[1] + oz]; });
  const inB = P.map((p, k) => [Math.max(0, p[0] - vN[k][0] * t), p[1] - vN[k][1] * t]);
  const inT = T.map((p, k) => [Math.max(0, p[0] - vN[k][0] * t), p[1] - vN[k][1] * t]);
  const openFaces = new Set(o.open || []);
  for (const sd of [1, -1]) {
    const sideName = sd > 0 ? 'port' : 'stbd';
    for (let k = 0; k < n; k++) {
      const f = face[k]; if (openFaces.has(f) || openFaces.has(f + ':' + sideName)) continue;
      if (segN[k][2] < 1e-4) continue;
      const b0 = P[k], b1 = P[k + 1], t0 = T[k], t1 = T[k + 1], ib0 = inB[k], ib1 = inB[k + 1], it0 = inT[k], it1 = inT[k + 1];
      // parameter along the segment for an opening range [a, b]
      const coord = f === 'side' ? [b0[1], b1[1]] : [b0[0], b1[0]];
      const cuts = [0, 1], ops = [];
      for (const w of [...(o.windows || []).map((w) => ({ ...w, kind: 'win' })), ...(o.doors || []).map((d) => ({ ...d, kind: 'door' }))]) {
        if (w.face !== f || (w.only && w.only !== sideName)) continue;
        const den = coord[1] - coord[0]; if (Math.abs(den) < 1e-6) continue;
        let s0 = (w.a - coord[0]) / den, s1 = (w.b - coord[0]) / den; if (s0 > s1) { const q = s0; s0 = s1; s1 = q; }
        const endA = s0 >= -1e-6, endB = s1 <= 1 + 1e-6; // does the opening really start / stop inside this segment?
        s0 = clamp(s0); s1 = clamp(s1); if (s1 - s0 < 1e-4) continue;
        cuts.push(s0, s1); ops.push({ s0, s1, w, endA, endB });
      }
      cuts.sort((a, b) => a - b);
      const pt = (A, B, C, D, s, v) => { const bx = lerp(A[0], B[0], s), bz = lerp(A[1], B[1], s), tx = lerp(C[0], D[0], s), tz = lerp(C[1], D[1], s); return [sd * lerp(bx, tx, v), y0 + v * H, lerp(bz, tz, v)]; };
      const outer = (s, v) => pt(b0, b1, t0, t1, s, v), inn = (s, v) => pt(ib0, ib1, it0, it1, s, v);
      const quadO = (m, s0, s1, v0, v1) => { const a = outer(s0, v0), b = outer(s1, v0), c = outer(s1, v1), d = outer(s0, v1); if (sd > 0) ctx.quad(m, b, a, d, c); else ctx.quad(m, a, b, c, d); };
      const quadI = (m, s0, s1, v0, v1) => { const a = inn(s0, v0), b = inn(s1, v0), c = inn(s1, v1), d = inn(s0, v1); if (sd > 0) ctx.quad(m, a, b, c, d); else ctx.quad(m, b, a, d, c); };
      const reveal = (s0, s1, v0, v1, op) => { // faces joining the skins around an opening (jambs only at its true ends)
        const O = [outer(s0, v0), outer(s1, v0), outer(s1, v1), outer(s0, v1)], I = [inn(s0, v0), inn(s1, v0), inn(s1, v1), inn(s0, v1)];
        const atCenter = (sv) => f !== 'side' && Math.abs(lerp(coord[0], coord[1], sv)) < 1e-4; // an opening that runs to the centerline continues on the other half
        const want = [v0 > 0.001, op.endB && Math.abs(s1 - op.s1) < 1e-6 && !atCenter(s1), true, op.endA && Math.abs(s0 - op.s0) < 1e-6 && !atCenter(s0)];
        for (let e = 0; e < 4; e++) { if (!want[e]) continue; const e2 = (e + 1) % 4; ctx.quad(frame, O[e], O[e2], I[e2], I[e], { double: true }); }
      };
      const solidSpan = (s0, s1, v0, v1, tag) => {
        if (o.solid === false || s1 - s0 < 1e-4 || v1 - v0 < 1e-4) return;
        const a = outer(s0, (v0 + v1) / 2), b = outer(s1, (v0 + v1) / 2), ia = inn(s0, (v0 + v1) / 2), ib = inn(s1, (v0 + v1) / 2);
        const cx = (a[0] + b[0] + ia[0] + ib[0]) / 4, cz = (a[2] + b[2] + ia[2] + ib[2]) / 4, len = Math.hypot(b[0] - a[0], b[2] - a[2]);
        ctx.solidBox([t + 0.03, (v1 - v0) * H, len + 0.01], [cx, y0 + ((v0 + v1) / 2) * H, cz], { rot: [0, Math.atan2(b[0] - a[0], b[2] - a[2]), 0], tag });
      };
      for (let c = 0; c < cuts.length - 1; c++) {
        const s0 = cuts[c], s1 = cuts[c + 1]; if (s1 - s0 < 1e-4) continue;
        const sm = (s0 + s1) / 2, op = ops.find((q) => sm > q.s0 && sm < q.s1);
        if (!op) { quadO(mat, s0, s1, 0, 1); quadI(inner, s0, s1, 0, 1); solidSpan(s0, s1, 0, 1, 'wall'); continue; }
        if (op.w.kind === 'win') {
          const v0 = clamp(op.w.y0 / H), v1 = clamp(op.w.y1 / H);
          if (v0 > 0.001) { quadO(mat, s0, s1, 0, v0); quadI(inner, s0, s1, 0, v0); }
          if (v1 < 0.999) { quadO(mat, s0, s1, v1, 1); quadI(inner, s0, s1, v1, 1); }
          // glass at mid thickness
          const g = (s, v) => { const a = outer(s, v), b = inn(s, v); return [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2]; };
          ctx.quad(op.w.mat ?? glass, g(s0, v0), g(s1, v0), g(s1, v1), g(s0, v1), { double: true });
          reveal(s0, s1, v0, v1, op);
          const panes = op.w.panes ?? 1, mw = op.w.mullion ?? 0.05, den = coord[1] - coord[0];
          for (let m = 1; m < panes; m++) { // mullions sit at even spacing over the whole window, whatever segments it crosses
            const sc = (lerp(op.w.a, op.w.b, m / panes) - coord[0]) / den, hw = mw / 2 / Math.abs(den);
            const a0 = Math.max(s0, sc - hw), a1 = Math.min(s1, sc + hw); if (a1 - a0 < 1e-5) continue;
            quadO(frame, a0, a1, v0, v1); quadI(frame, a0, a1, v0, v1);
          }
          solidSpan(s0, s1, 0, 1, 'glass');
        } else {
          const v1 = clamp(op.w.h / H);
          if (v1 < 0.999) { quadO(mat, s0, s1, v1, 1); quadI(inner, s0, s1, v1, 1); solidSpan(s0, s1, v1, 1, 'wall'); }
          reveal(s0, s1, 0, v1, op);
        }
      }
      // top edge strip between the skins
      if (o.capMat !== null) { const a = outer(0, 1), b = outer(1, 1), c = inn(1, 1), d = inn(0, 1); ctx.quad(o.capMat ?? mat, a, b, c, d, { double: true }); }
    }
  }
  // one coarse box for the main physics world (boats and bullets hit the house; the fine walls live in the walk world)
  if (o.coarse !== false) { let xm = 0, za = 1e9, zb = -1e9; for (const p of P) { xm = Math.max(xm, p[0]); za = Math.min(za, p[1]); zb = Math.max(zb, p[1]); } ctx.collide({ type: 'box', h: [xm, H / 2, (zb - za) / 2 - rF * H * 0.25], m: new THREE.Matrix4().makeTranslation(0, y0 + H / 2, (za + zb) / 2 - rF * H * 0.25), coarse: true, tag: 'wall' }); }
  return { top: fullPoly(T), topHalf: T, inner: fullPoly(inB), innerHalf: inB, lean: leanOf };
}

// ---------------------------------------------------------------- interior partitions and rooms
/**
 * Partition wall from a to b ([x, z]) with doorways. o: { y0, h, t (0.05), mat, mat2 (far side), openings: [{ s0, s1 (meters from a), h }], solid, cap }
 */
export function wall(ctx, a, b, o) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 1e-3) return;
  const yaw = Math.atan2(dx, dz), t = o.t ?? 0.05, h = o.h, m1 = o.mat ?? 'wallPanel', m2 = o.mat2 ?? m1;
  const ops = (o.openings || []).slice().sort((p, q) => p.s0 - q.s0);
  ctx.at([a[0], o.y0, a[1]], yaw, (c) => {
    let s = 0;
    const piece = (s0, s1, y0, y1) => {
      if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
      const zc = (s0 + s1) / 2, yc = (y0 + y1) / 2, L2 = s1 - s0, hh = y1 - y0;
      // two skins + edges, so each side can carry its own finish
      c.quad(m1, [t / 2, y0, s0], [t / 2, y0, s1], [t / 2, y1, s1], [t / 2, y1, s0]);
      c.quad(m2, [-t / 2, y0, s1], [-t / 2, y0, s0], [-t / 2, y1, s0], [-t / 2, y1, s1]);
      c.quad(o.edge ?? m1, [t / 2, y0, s0], [t / 2, y1, s0], [-t / 2, y1, s0], [-t / 2, y0, s0]);
      c.quad(o.edge ?? m1, [t / 2, y0, s1], [-t / 2, y0, s1], [-t / 2, y1, s1], [t / 2, y1, s1]);
      c.quad(o.edge ?? m1, [t / 2, y0, s0], [-t / 2, y0, s0], [-t / 2, y0, s1], [t / 2, y0, s1]);
      if (o.solid !== false) c.solidBox([t + 0.02, hh, L2], [0, yc, zc], { tag: 'wall' });
    };
    for (const op of ops) { piece(s, op.s0, 0, h); piece(op.s0, op.s1, op.h ?? 2.0, h); s = op.s1; }
    piece(s, len, 0, h);
  });
}
/**
 * A rectangular interior room: sole, ceiling, four lined walls with doorways, area, nav node (same id as the room).
 * o: { id, name, x0, x1, z0, z1, y (floor), h (headroom, default 2.05), floor ('carpet'), walls ('wallPanel'), ceil ('ceiling'),
 *   privacy, deck, doors: { aft|fore|port|stbd: [{ at (center along that wall: x for aft/fore, z for port/stbd), w, h }] },
 *   skip: ['port', ...] walls provided by something else, wallT, outside: material for the far side of the walls, base: baseboard material | null }
 */
export function room(ctx, o) {
  const { x0, x1, z0, z1, y } = o, h = o.h ?? 2.05, t = o.wallT ?? 0.05, skip = new Set(o.skip || []);
  const fl = o.floor ?? 'carpet', wm = o.walls ?? 'wallPanel', cm = o.ceil ?? 'ceiling';
  if (fl) ctx.box(fl, [x1 - x0, 0.02, z1 - z0], [(x0 + x1) / 2, y + 0.01, (z0 + z1) / 2], { uvJitter: false });
  if (cm) ctx.box(cm, [x1 - x0, 0.02, z1 - z0], [(x0 + x1) / 2, y + h + 0.01, (z0 + z1) / 2], { uvJitter: false });
  if (o.floorSolid) ctx.solidBox([x1 - x0, 0.1, z1 - z0], [(x0 + x1) / 2, y - 0.05, (z0 + z1) / 2], { tag: 'floor' });
  const D = o.doors || {};
  // walls are placed with their finished face on the room side (mat), the other side gets o.outside
  const mk = (name, a, b, along0) => {
    if (skip.has(name)) return;
    const ops = (D[name] || []).map((d) => ({ s0: Math.abs(d.at - along0) - d.w / 2, s1: Math.abs(d.at - along0) + d.w / 2, h: d.h ?? 1.98 }));
    wall(ctx, a, b, { y0: y, h, t, mat: wm, mat2: o.outside ?? wm, openings: ops });
  };
  // wall(a -> b): its +x local side (mat) is to the right of travel when seen from above with +z up... keep the room side on `mat`
  mk('aft', [x1, z0], [x0, z0], x1); mk('fore', [x0, z1], [x1, z1], x0);
  mk('port', [x1, z1], [x1, z0], z1); mk('stbd', [x0, z0], [x0, z1], z0);
  ctx.area(o.id, o.name || o.id, [x0, z0, x1, z1], y, y + h, { privacy: o.privacy || 'guest', deck: o.deck, interior: true });
  ctx.node(o.id, [(x0 + x1) / 2, y + 0.02, (z0 + z1) / 2], { deck: o.deck, area: o.id });
  return o;
}
/**
 * A door in an opening. pos = center of the threshold, heading = the way the closed door faces (normal of the wall).
 * o: { id, w, h, kind: 'hinge' | 'slide' | 'glass' (sliding glass, salon doors) | 'pocket' | 'hatch', mat ('woodA'), swing (+1 opens toward +z local, -1 away), hingeSide (+1 | -1),
 *   auto (opens when someone walks up, default true), locked, label, handle ('ss') }
 * The runtime animates part 'door:<id>' and toggles collider id 'door:<id>'.
 */
export function door(ctx, pos, heading, o) {
  const w = o.w ?? 0.72, h = o.h ?? 1.95, kind = o.kind ?? 'hinge', id = 'door:' + o.id, th = kind === 'glass' ? 0.03 : 0.04;
  const hs = o.hingeSide ?? 1;
  ctx.at(pos, heading, (c) => {
    const pivot = kind === 'hinge' ? [hs * w / 2, 0, 0] : [0, 0, 0];
    c.part(id, pivot, 0, (p) => {
      const cx = kind === 'hinge' ? -hs * w / 2 : 0;
      if (kind === 'glass') {
        p.box(o.frame ?? 'ss', [w, 0.07, th + 0.02], [cx, 0.035, 0]); p.box(o.frame ?? 'ss', [w, 0.07, th + 0.02], [cx, h - 0.035, 0]);
        p.box(o.frame ?? 'ss', [0.06, h, th + 0.02], [cx - w / 2 + 0.03, h / 2, 0]); p.box(o.frame ?? 'ss', [0.06, h, th + 0.02], [cx + w / 2 - 0.03, h / 2, 0]);
        p.box(o.glassMat ?? 'glass', [w - 0.12, h - 0.14, 0.012], [cx, h / 2, 0]);
        p.box('ss', [0.03, 0.4, 0.07], [cx + w / 2 - 0.1, 1.05, 0]);
      } else {
        p.rbox(o.mat ?? 'woodA', [w, h, th], [cx, h / 2, 0], { r: 0.008, seg: 1 });
        if (o.panel !== false) { p.box(o.inlay ?? 'woodB', [w - 0.22, h - 0.3, th + 0.006], [cx, h / 2, 0]); }
        // lever handles both sides
        for (const s of [1, -1]) { const hx = cx - hs * (w / 2 - 0.07) * (kind === 'hinge' ? 1 : -1); p.cyl(o.handle ?? 'ss', 0.022, 0.022, 0.012, [hx, 1.0, s * (th / 2 + 0.006)], { rot: [Math.PI / 2, 0, 0], seg: 10 }); p.rbox(o.handle ?? 'ss', [0.11, 0.018, 0.018], [hx + hs * 0.045 * (kind === 'hinge' ? 1 : -1), 1.0, s * (th / 2 + 0.03)], { r: 0.007, seg: 1 }); }
      }
    }, { data: { kind, w, h, swing: o.swing ?? 1, hingeSide: hs, auto: o.auto !== false, locked: !!o.locked, open: 0 } });
    c.collide({ type: 'box', h: [w / 2, h / 2, 0.05], m: new THREE.Matrix4().makeTranslation(0, h / 2, 0), tag: 'door', id });
    c.interact('door', [0, 1.0, 0], { id, r: 1.25, label: o.label || 'Door', data: { door: id } });
  });
  ctx.root.doors.push({ id, x: ctx.P(pos).x, y: ctx.P(pos).y, z: ctx.P(pos).z, heading: ctx.H(heading), w, h, kind, auto: o.auto !== false, locked: !!o.locked, privacy: o.privacy || null });
  return id;
}

// ---------------------------------------------------------------- stairs and ladders
/**
 * A straight stair flight you walk (smooth ramp collider under real treads).
 * o: { from [x, y, z] (bottom, center of the first riser), to [x, y, z] (top, where the top tread meets the upper deck), w (0.75),
 *   tread ('teak'), riser ('gel' | null for open treads), stringer ('gel' | 'ss' | null), rail: 'both' | 'left' | 'right' | 'none' (seen while climbing), railH (0.92), railMat ('ss'),
 *   nodeA, nodeB (nav ids to link), sideWalls (true: you cannot step off the side), nosing (0.025), light (true: LED strip under each nosing) }
 */
export function stairs(ctx, o) {
  const A = new THREE.Vector3(...o.from), B = new THREE.Vector3(...o.to), d = B.clone().sub(A);
  const run = Math.hypot(d.x, d.z), rise = d.y, yaw = Math.atan2(d.x, d.z), w = o.w ?? 0.75;
  const n = Math.max(2, Math.round(rise / (o.riseH ?? 0.19))), rh = rise / n, rd = run / n, nose = o.nosing ?? 0.025;
  const tm = o.tread ?? 'teak', rm = o.riser === undefined ? 'gel' : o.riser, sm = o.stringer === undefined ? 'gel' : o.stringer;
  ctx.at(o.from, yaw, (c) => {
    for (let i = 1; i <= n; i++) {
      const y = i * rh, zc = (i - 0.5) * rd;
      c.rbox(tm, [w, 0.04, rd + nose], [0, y - 0.02, zc - nose / 2], { r: 0.012, seg: 1 });
      if (rm) c.box(rm, [w, rh - 0.04, 0.02], [0, y - rh / 2 - 0.02, (i - 1) * rd + 0.01]);
      if (o.light !== false && c._lod <= c.maxLod) c.light('courtesy', [0, y - 0.05, (i - 1) * rd - nose + 0.004], { shape: 'bar', len: w * 0.7, size: 0.012, color: 0xffe2b8, intensity: 0.6, range: 1.2, real: false });
    }
    if (sm) for (const sx of [1, -1]) {
      // stringer: a band parallel to the pitch line, from the lower floor to the upper deck edge
      const x0 = sx * (w / 2), x1 = sx * (w / 2 + 0.035), dep = 0.26, k = rise / run;
      c.prism(sm, [[0, 0], [0, rh + 0.03], [run, rise + 0.03], [run, rise - dep], [dep / k * 0.6, 0]], 'x', Math.min(x0, x1), Math.max(x0, x1));
    }
    const sides = o.rail === 'none' ? [] : o.rail === 'left' ? [1] : o.rail === 'right' ? [-1] : [1, -1];
    const railH = o.railH ?? 0.92, rmat = o.railMat ?? 'ss';
    for (const sx of sides) {
      const x = sx * (w / 2 - 0.03);
      c.rod(rmat, [x, railH + rh, 0], [x, rise + railH, run], 0.019, { seg: 8 });
      const posts = Math.max(2, Math.round(run / 0.9) + 1);
      for (let k = 0; k < posts; k++) { const q = k / (posts - 1), z = q * run, yb = Math.max(rh, q * rise); c.rod(rmat, [x, yb - rh * (k === 0 ? 1 : 0.5), z], [x, lerp(railH + rh, rise + railH, q), z], 0.014, { seg: 6 }); }
    }
    c.ramp([0, rh * 0.5, 0], [0, rise, run - rd * 0.5], w + 0.02, { tag: 'stair' });
    c.solidBox([w, 0.06, rd * 0.5], [0, rise - 0.03, run - rd * 0.25], { tag: 'stair' });
    if (o.sideWalls !== false) for (const sx of [1, -1]) {
      const len = Math.hypot(run, rise), pitch = -Math.atan2(rise, run);
      c.solidBox([0.04, (sides.includes(sx) ? railH : 0.25) + 0.3, len], [sx * (w / 2 + 0.02), rise / 2 + (sides.includes(sx) ? railH : 0.25) / 2, run / 2], { rot: [pitch, 0, 0], tag: 'rail' });
    }
  });
  if (o.nodeA && o.nodeB) ctx.link(o.nodeA, o.nodeB, { type: 'stairs' });
  return { n, rise: rh, run: rd, yaw };
}
/**
 * A vertical or leaning ladder you climb (the walk controller attaches at the ladder volume).
 * o: { bottom [x, y, z], top [x, y, z], w (0.4), facing (heading the climber faces), mat ('ss'), rungMat ('teak' | 'ss'), nodeA, nodeB, hoops }
 */
export function ladder(ctx, o) {
  const A = new THREE.Vector3(...o.bottom), B = new THREE.Vector3(...o.top), w = o.w ?? 0.4, mat = o.mat ?? 'ss';
  const len = A.distanceTo(B), n = Math.max(2, Math.round(len / 0.28));
  const fx = Math.cos(o.facing || 0), fz = -Math.sin(o.facing || 0); // lateral axis
  for (const s of [1, -1]) ctx.rod(mat, [A.x + fx * s * w / 2, A.y, A.z + fz * s * w / 2], [B.x + fx * s * w / 2, B.y + 0.9, B.z + fz * s * w / 2], 0.018, { seg: 8 });
  for (let i = 1; i <= n; i++) { const p = A.clone().lerp(B, i / (n + 0.2)); if (o.rungMat === 'teak') ctx.box('teak', [w, 0.025, 0.07], [p.x, p.y, p.z], { rot: [0, o.facing || 0, 0] }); else ctx.rod(mat, [p.x - fx * w / 2, p.y, p.z - fz * w / 2], [p.x + fx * w / 2, p.y, p.z + fz * w / 2], 0.013, { seg: 6 }); }
  ctx.ladder(o.bottom, o.top, { facing: o.facing, navA: o.nodeA, navB: o.nodeB, id: o.id });
}

// ---------------------------------------------------------------- rails, coamings, screens
function resample(pts, step) {
  const out = [pts[0].slice()]; let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); let dcur = step - acc;
    while (dcur <= l) { const t = dcur / l; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]); dcur += step; }
    acc = (acc + l) % step;
  }
  const e = pts[pts.length - 1], q = out[out.length - 1];
  if (Math.hypot(e[0] - q[0], e[1] - q[1], e[2] - q[2]) > step * 0.35) out.push(e.slice()); else out[out.length - 1] = e.slice();
  return out;
}
/**
 * Guard rail along base points [[x, y, z], ...]. o: { h (0.95), post (spacing 1.25), mid (number of intermediate rails, default 2), mat ('ss'),
 *   top ('ss' | 'teakCap'), r (0.019), glass (frameless glass panels instead of mid rails), wire (thin mid wires), solid (true), smoothTop (true) }
 */
export function rail(ctx, pts, o = {}) {
  const h = o.h ?? 0.95, mat = o.mat ?? 'ss', r = o.r ?? 0.019, mid = o.glass ? 0 : (o.mid ?? 2);
  const posts = resample(pts, o.post ?? 1.25);
  const top = pts.map((p) => [p[0], p[1] + h, p[2]]);
  if (o.top === 'teakCap') { for (let i = 0; i < top.length - 1; i++) { const a = top[i], b = top[i + 1], l = Math.hypot(b[0] - a[0], b[2] - a[2]); ctx.rbox('teakCap', [0.085, 0.032, l + 0.01], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { rot: [-Math.atan2(b[1] - a[1], l), Math.atan2(b[0] - a[0], b[2] - a[2]), 0], r: 0.012, seg: 1 }); } }
  else if (o.smoothTop === false || top.length < 3) for (let i = 0; i < top.length - 1; i++) ctx.rod(mat, top[i], top[i + 1], r, { seg: 8 });
  else ctx.tube(mat, top, r, { seg: 8, div: Math.max(12, top.length * 4), tension: 0.5 });
  for (const p of posts) { ctx.rod(mat, p, [p[0], p[1] + h, p[2]], r * 0.85, { seg: 8 }); ctx.cyl(mat, r * 2.2, r * 2.4, 0.012, [p[0], p[1] + 0.006, p[2]], { seg: 10 }); }
  for (let m = 1; m <= mid; m++) { const f = m / (mid + 1); for (let i = 0; i < posts.length - 1; i++) { const a = posts[i], b = posts[i + 1]; ctx.rod(mat, [a[0], a[1] + h * f, a[2]], [b[0], b[1] + h * f, b[2]], o.wire ? 0.004 : r * 0.55, { seg: 6 }); } }
  if (o.glass) for (let i = 0; i < posts.length - 1; i++) { const a = posts[i], b = posts[i + 1]; ctx.quad(o.glassMat ?? 'glassClear', [a[0], a[1] + 0.06, a[2]], [b[0], b[1] + 0.06, b[2]], [b[0], b[1] + h - 0.03, b[2]], [a[0], a[1] + h - 0.03, a[2]], { double: true }); }
  if (o.solid !== false) for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[2] - a[2]); if (l < 1e-3) continue;
    ctx.solidBox([0.05, h + 0.08, l + 0.03], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (h + 0.08) / 2, (a[2] + b[2]) / 2], { rot: [0, Math.atan2(b[0] - a[0], b[2] - a[2]), 0], tag: 'rail' });
  }
}
/**
 * A molded low wall (flybridge coaming, cockpit side, seat back shell) along a centerline path [[x, z], ...].
 * o: { y0, h (number | i/n -> number), t (0.09), mat ('gel'), inner (material of the inboard face), cap ('teakCap' | 'ss' | null), closed, solid (true), lean (top moves by this much toward the left of travel) }
 */
export function coaming(ctx, pts, o = {}) {
  const n = pts.length, t = o.t ?? 0.09, hF = typeof o.h === 'function' ? o.h : () => o.h, mat = o.mat ?? 'gel';
  const L = [], R = [], LT = [], RT = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx, h = hF(i / (n - 1)), ln = o.lean ?? 0; // left normal
    L.push([p[0] + nx * t / 2, o.y0, p[1] + nz * t / 2]); R.push([p[0] - nx * t / 2, o.y0, p[1] - nz * t / 2]);
    LT.push([p[0] + nx * (t / 2 + ln), o.y0 + h, p[1] + nz * (t / 2 + ln)]); RT.push([p[0] - nx * (t / 2 - ln), o.y0 + h, p[1] - nz * (t / 2 - ln)]);
  }
  ctx.ruled(o.inner ?? mat, L, LT, { flip: true }); ctx.ruled(mat, R, RT); ctx.ruled(o.cap ?? mat, LT, RT, { flip: true });
  ctx.quad(mat, L[0], R[0], RT[0], LT[0], { double: true }); ctx.quad(mat, L[n - 1], R[n - 1], RT[n - 1], LT[n - 1], { double: true });
  if (o.solid !== false) for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), h = Math.max(hF(i / (n - 1)), hF((i + 1) / (n - 1)));
    ctx.solidBox([t + 0.02, h, l + 0.02], [(a[0] + b[0]) / 2, o.y0 + h / 2, (a[1] + b[1]) / 2], { rot: [0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0], tag: 'rail' });
  }
}
/**
 * A raked windscreen on a coaming: base points [[x, y, z], ...], each pane leans by `rake` (m) along `dir` at the top.
 * o: { h, rake, dir [dx, dz] (default [0, -1] = leans aft), glass ('glassClear'), frame ('ss'), solid (true) }
 */
export function windscreen(ctx, pts, o = {}) {
  const h = o.h ?? 0.45, rk = o.rake ?? 0.2, dir = o.dir ?? [0, -1], top = pts.map((p) => [p[0] + dir[0] * rk, p[1] + h, p[2] + dir[1] * rk]);
  for (let i = 0; i < pts.length - 1; i++) ctx.quad(o.glass ?? 'glassClear', pts[i], pts[i + 1], top[i + 1], top[i], { double: true });
  if (o.frame !== null) { ctx.tube(o.frame ?? 'ss', top, 0.012, { seg: 6, tension: 0.5 }); for (let i = 0; i < pts.length; i += Math.max(1, o.postEvery ?? 3)) ctx.rod(o.frame ?? 'ss', pts[i], top[i], 0.009, { seg: 6 }); }
  if (o.solid !== false) for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[2] - a[2]); ctx.solidBox([0.04, h, l], [(a[0] + b[0]) / 2 + dir[0] * rk / 2, a[1] + h / 2, (a[2] + b[2]) / 2 + dir[1] * rk / 2], { rot: [0, Math.atan2(b[0] - a[0], b[2] - a[2]), 0], tag: 'glass' }); }
}
/**
 * Hardtop / roof slab with a chamfered rim. o: { poly, y (top), t (0.12), mat ('gel'), under ('ceiling'), rim (0.07 chamfer), solid (true: you can stand on it) }
 */
export function hardtop(ctx, o) {
  const t = o.t ?? 0.12, rim = o.rim ?? 0.07, inner = insetPoly(o.poly, rim);
  ctx.plate(o.mat ?? 'gel', inner, o.y, t * 0.45, { bottomMat: null, solid: false });
  ctx.plate(o.mat ?? 'gel', o.poly, o.y - t * 0.45, t * 0.55, { bottomMat: o.under ?? 'ceiling', solid: false });
  // chamfer between the two tiers
  const n = o.poly.length, A = [], B = [];
  for (let i = 0; i <= n; i++) { const p = o.poly[i % n], q = inner[i % n]; A.push([p[0], o.y - t * 0.45, p[1]]); B.push([q[0], o.y, q[1]]); }
  let area = 0; for (let i = 0; i < n; i++) { const a = o.poly[i], b = o.poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  ctx.ruled(o.mat ?? 'gel', A, B, { flip: area < 0 });
  if (o.solid !== false) ctx.prism(null, o.poly, 'y', o.y - t, o.y, { solid: true, tag: 'floor', capMat: null, capMat2: null, sideMat: null });
}
/** Mirrored side-profile plates: profile [[z, y], ...] at |x| from xOuter - t to xOuter (arch legs, fins, wing supports). */
export function sidePlates(ctx, mat, profile, xOuter, t, o = {}) {
  for (const sd of o.only === 'port' ? [1] : o.only === 'stbd' ? [-1] : [1, -1]) ctx.prism(mat, profile, 'x', sd > 0 ? xOuter - t : -xOuter, sd > 0 ? xOuter : -xOuter + t, o);
}
export { TAU, smooth };
