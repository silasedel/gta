// Nico's house, part 10: the raised platform. Round marine piles on concrete footings, bolted cross-bracing and knee
// braces, doubled girders, joists with blocking and hurricane ties, plywood subfloor under the rooms, individually laid
// deck boards with screws, painted railings with individual balusters, the L-shaped west stair and the bay-side stair.
import { onPlatform, inRect } from '../plan.js';
export const order = 10;

export function build(ctx) {
  const { THREE, kit, plan: P, mat, col } = ctx, B = ctx.ext, M = kit.M, C = P.colors;
  const r = kit.rng(101), W = mat.wood(), PW = mat.paint({ peel: 'a', fade: 0.28 }), CONC = mat.concrete(), STEEL = mat.steel(), RUST = mat.rust();
  const F = P.F, db = P.deckBoard, joistTop = F - db.t, joistBot = joistTop - P.joist.d, girTop = joistBot, girBot = girTop - P.girder.d;
  ctx.levels = { joistTop, joistBot, girTop, girBot };
  const gray = (k = 1) => kit.vary(kit.mul(C.deck, k), r, 0.09), dark = () => kit.vary(C.deckDark, r, 0.1);
  const bolts = [], washers = [], screws = [], straps = [];
  const boltAt = (x, y, z, axis, len = 0.03) => { // axis 0 = along X, 2 = along Z
    const rot = axis === 0 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    bolts.push(M(x, y, z, rot[0], 0, rot[2], 1, len / 0.03, 1)); washers.push(M(x, y, z, rot[0], 0, rot[2]));
  };

  // ---------- piles and footings ----------
  const piles = [];
  for (const x of P.pileXs) for (const z of P.pileZs) { if ((x > 2.01 && z > 5) || (z > 5 && x > -6.3 && x < -0.9)) continue; piles.push([x, z]); }
  piles.push([4.3, 4.25], [6.42, 4.25]);
  ctx.piles = piles;
  for (const [x, z] of piles) {
    const lean = (r() - 0.5) * 0.012, yaw = r() * 6.28, top = girTop + 0.02, bot = -0.5, h = top - bot, rr = P.pileR * (0.94 + r() * 0.12);
    const tone = kit.vary(C.pile, r, 0.12);
    B.box(PW, 0.2, h, 0.2, M(x, bot + h / 2, z, lean, (r() - 0.5) * 0.06, lean * 0.5), { grain: 1, color: kit.vary(0xc9c2b0, r, 0.05), wear: [1.0, 0.84 + r() * 0.12], bevel: 0.012, rand: r });
    B.box(W, 0.212, 0.62, 0.212, M(x, 0.36, z, lean, 0, 0), { grain: 1, color: kit.vary(0x4c5438, r, 0.12), wear: 1, bevel: 0.012, rand: r, shade: [0.7, 1.15] });   // damp, algae-green foot
    // weathering checks at the base: darker, damp collar
    const fs = 0.56 + r() * 0.12, fh = 0.2 + r() * 0.08;
    B.box(CONC, fs, fh + 0.3, fs, M(x + (r() - 0.5) * 0.03, fh / 2 - 0.15, z + (r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.12, 0), { bevel: 0.025, color: kit.vary(0xcfc9ba, r, 0.08), wear: 0.8, shade: [0.72, 1] });
    col.cyl(x, 1.2, z, rr + 0.02, 2.5, { tag: 'pile' }); col.box(x, fh / 2, z, fs, fh, fs, { tag: 'footing' });
  }

  // ---------- girders: doubled 2x12 sandwiching each pile line, through-bolted ----------
  const gir = P.girder, lines = [...P.pileZs.map((z) => ({ z, x0: -8.6, x1: z > 5 ? 2.0 : 6.6 })), { z: 4.25, x0: 2.0, x1: 6.6 }];
  lines.splice(lines.findIndex((l) => l.z > 5), 1, { z: 5.02, x0: -8.6, x1: -6.3 }, { z: 5.02, x0: -0.9, x1: 2.0 });
  for (const L of lines) {
    for (const side of [-1, 1]) {
      const z = L.z + side * (P.pileR * 0.82 + gir.t / 2);
      let x = L.x0; const cuts = P.pileXs.filter((px) => px > L.x0 + 0.5 && px < L.x1 - 0.5);
      const joints = cuts.filter((_, i) => (i + (side > 0 ? 1 : 0)) % 2 === 0);
      for (const xe of [...joints, L.x1]) {
        const len = xe - x; if (len > 0.05) B.box(W, len - 0.004, gir.d, gir.t, M(x + len / 2, girBot + gir.d / 2, z), { grain: 0, color: dark(), wear: 0.55, bevel: 0.004, rand: r, shade: [0.8, 1] });
        x = xe;
      }
    }
    for (const [px, pz] of piles) if (Math.abs(pz - L.z) < 0.01 && px >= L.x0 - 0.3 && px <= L.x1 + 0.3) for (const dy of [0.075, 0.21]) for (const s of [-1, 1]) boltAt(px + (dy > 0.1 ? 0.035 : -0.035), girBot + dy, L.z + s * (P.pileR * 0.82 + gir.t + 0.006), 2);
  }
  // header at x = 2.0 carrying the wing's front girder
  for (const s of [-1, 1]) B.box(W, gir.t, gir.d, 2.22, M(2.0 + s * (P.pileR * 0.82 + gir.t / 2), girBot + gir.d / 2, 3.91), { grain: 2, color: dark(), wear: 0.5, bevel: 0.004, rand: r });

  // ---------- joists (north-south, lapped over the girders), blocking, rim boards, hurricane ties ----------
  const J = P.joist, zCuts = [-6.4, -3.2, -0.2, 2.8, 5.2];
  const jx = []; for (let x = -8.6 + J.t / 2 + 0.045; x < 6.6 - 0.05; x += J.oc) jx.push(x);
  for (let i = 0; i < jx.length; i++) {
    const x = jx[i], gone = x > -6.38 && x < -0.82, zEnd = x > 2.0 ? 4.4 : gone ? 2.8 : 5.2;
    for (let s = 0; s < zCuts.length - 1; s++) {
      let z0 = zCuts[s], z1 = Math.min(zCuts[s + 1], zEnd); if (z1 - z0 < 0.2) continue;
      const lap = 0.16, a = s === 0 ? z0 + 0.045 : z0 - lap, b = z1 >= zEnd - 0.01 ? z1 - 0.045 : z1 + lap, off = (s % 2 ? 1 : -1) * (J.t / 2 + 0.001);
      B.box(W, J.t, J.d, b - a, M(x + off, joistBot + J.d / 2, (a + b) / 2), { grain: 2, color: kit.vary(kit.mul(C.deckDark, 0.92), r, 0.1), wear: 0.4, bevel: 0.003, rand: r, shade: [0.78, 1] });
    }
    for (const L of lines) if (x >= L.x0 && x <= L.x1) straps.push(M(x - J.t / 2 - 0.002 + (r() > 0.5 ? J.t + 0.004 : 0), girTop + 0.03, L.z + (r() > 0.5 ? 0.11 : -0.11), 0, 0, 0));
    if (i > 0) for (const [bz, k] of [[-4.75, 0], [-1.7, 1], [1.25, 0], [3.95, 1]]) {
      const xm = (jx[i - 1] + x) / 2; if ((xm > 2.0 && bz > 4.3) || (xm > -6.4 && xm < -0.8 && bz > 2.8)) continue;
      B.box(W, J.oc - J.t - 0.006, J.d - 0.02, J.t, M(xm, joistBot + J.d / 2 + 0.008, bz + ((i + k) % 2 ? 0.03 : -0.03)), { grain: 0, color: kit.vary(C.deckDark, r, 0.12), wear: 0.3, bevel: 0.003, rand: r });
    }
  }
  // rim / band boards around the whole platform (the visible deck edge), in pieces with butt joints
  const rimRun = (x0, z0, x1, z1) => {
    const horiz = Math.abs(z1 - z0) < 0.01, len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.max(1, Math.round(len / 3.6));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = z0 + (z1 - z0) * (t0 + t1) / 2, l = len / n - 0.004;
      B.box(W, horiz ? l : 0.045, J.d + db.t - 0.004, horiz ? 0.045 : l, M(cx, joistBot + (J.d + db.t) / 2 - 0.004, cz), { grain: horiz ? 0 : 2, color: gray(0.92), wear: 0.7, bevel: 0.005, rand: r, shade: [0.85, 1] });
    }
  };
  rimRun(-8.6, -6.4 + 0.0225, 6.6, -6.4 + 0.0225); rimRun(6.6 - 0.0225, -6.4, 6.6 - 0.0225, -3.2); rimRun(-8.6 + 0.0225, -6.4, -8.6 + 0.0225, 5.2);
  rimRun(-8.6, 5.2 - 0.0225, -6.4, 5.2 - 0.0225); rimRun(-0.8, 5.2 - 0.0225, 2.0, 5.2 - 0.0225); rimRun(-6.4 - 0.0225, 2.8, -6.4 - 0.0225, 5.2); rimRun(-0.8 + 0.0225, 2.8, -0.8 + 0.0225, 5.2); rimRun(2.0 - 0.0225, 4.4, 2.0 - 0.0225, 5.2); rimRun(2.0, 4.4 - 0.0225, 6.6, 4.4 - 0.0225); rimRun(6.6 - 0.0225, -3.2, 6.6 - 0.0225, 4.4);

  // ---------- plywood subfloor seen from below, under the rooms ----------
  const PLY = mat.pbr('plywood', { rep: 1.2, grunge: true });
  for (const R of [P.A, P.B]) for (let x = R.x0; x < R.x1 - 0.01; x += 1.22) for (let z = R.z0; z < R.z1 - 0.01; z += 2.44) {
    const sx = Math.min(1.22, R.x1 - x), sz = Math.min(2.44, R.z1 - z);
    B.box(PLY, sx - 0.004, 0.019, sz - 0.004, M(x + sx / 2, joistTop + 0.0095, z + sz / 2), { color: kit.vary(0x8f7d62, r, 0.14), wear: 0.9, skip: 'py', rand: r });
  }

  // ---------- deck boards (east-west), screws at every joist ----------
  const pitch = db.w + db.gap, snap = (x) => -8.6 + 0.045 + J.t / 2 + Math.round((x + 8.6 - 0.045 - J.t / 2) / J.oc) * J.oc;
  const deckRow = (z, x0, x1) => {
    let x = x0;
    while (x < x1 - 0.01) {
      let xe = x + [2.44, 3.05, 3.66, 4.27, 4.88][Math.floor(r() * 5)]; xe = xe > x1 - 0.9 ? x1 : Math.min(x1, snap(xe)); if (xe - x < 0.3) xe = x1;
      const fresh = r() < 0.045, tone = fresh ? kit.vary(0xc9b48a, r, 0.06) : gray(0.86 + r() * 0.26), len = xe - x - 0.004;
      B.box(W, len, db.t, db.w, M((x + xe) / 2, F - db.t / 2 + (r() - 0.5) * 0.003, z, (r() - 0.5) * 0.012, (r() - 0.5) * 0.0015, 0), { grain: 0, color: tone, wear: fresh ? 0.1 : 0.35 + r() * 0.5, bevel: 0.0045, rand: r });
      for (const xj of jx) if (xj > x + 0.03 && xj < xe - 0.03 && r() > 0.02) for (const dz of [-0.04, 0.04]) screws.push(M(xj + (r() - 0.5) * 0.012, F + 0.0008, z + dz + (r() - 0.5) * 0.008));
      x = xe;
    }
  };
  for (let z = -6.4 + pitch / 2 + 0.002; z < 5.2 - db.w / 2; z += pitch) {
    if (z < -3.2 - db.w / 2 + 0.02) deckRow(z, -8.6 + 0.002, 6.6 - 0.002);
    else if (z > -3.2 - db.w / 2 && z < 2.8 + db.w / 2 - 0.02) deckRow(z, -8.6 + 0.002, -6.4 - 0.002);
    else if (z >= 2.8 + db.w / 2 - 0.02) { deckRow(z, -8.6 + 0.002, -6.4 - 0.002); deckRow(z, -0.8 + 0.002, 2.0 - 0.002); }
  }
  // platform colliders (deck and floor slab), surface tags for footsteps
  col.box(-1.0, F - 0.16, -4.8, 15.2, 0.32, 3.2, { tag: 'deck', surface: 'wood' }); col.box(-7.5, F - 0.16, 1.0, 2.2, 0.32, 8.4, { tag: 'deck', surface: 'wood' });
  col.box(0.6, F - 0.16, 4.0, 2.8, 0.32, 2.4, { tag: 'deck', surface: 'wood' }); col.box(-2.2, F - 0.16, -0.2, 8.4, 0.32, 6.0, { tag: 'floor', surface: 'wood' });
  col.box(4.3, F - 0.16, 0.6, 4.6, 0.32, 7.6, { tag: 'floor', surface: 'wood' });

  // ---------- cross-bracing (2x8 X-braces bolted to the pile faces) and knee braces ----------
  const xbrace = (x0, z0, x1, z1) => {
    const alongX = Math.abs(z1 - z0) < 0.01, off = P.pileR + 0.022;
    for (const s of [-1, 1]) {
      const a = [x0 + (alongX ? 0 : s * off), s > 0 ? 0.42 : girBot - 0.12, z0 + (alongX ? s * off : 0)], b = [x1 + (alongX ? 0 : s * off), s > 0 ? girBot - 0.12 : 0.42, z1 + (alongX ? s * off : 0)];
      B.strut(W, a, b, 0.04, 0.184, { color: kit.vary(kit.mul(C.pile, 1.12), r, 0.1), wear: 0.8, bevel: 0.004, extra: 0.3, rand: r });
      boltAt(a[0], a[1], a[2] + (alongX ? s * 0.024 : 0), alongX ? 2 : 0); boltAt(b[0], b[1], b[2] + (alongX ? s * 0.024 : 0), alongX ? 2 : 0);
      if (!alongX) { bolts[bolts.length - 1].elements[12] += s * 0.024; bolts[bolts.length - 2].elements[12] += s * 0.024; washers[washers.length - 1].elements[12] += s * 0.024; washers[washers.length - 2].elements[12] += s * 0.024; }
    }
    col.box((x0 + x1) / 2, 1.35, (z0 + z1) / 2, alongX ? Math.abs(x1 - x0) - 0.3 : 0.12, 2.1, alongX ? 0.12 : Math.abs(z1 - z0) - 0.3, { tag: 'brace' });
  };
  ctx.braced = [];
  const brace = (x0, z0, x1, z1) => { xbrace(x0, z0, x1, z1); ctx.braced.push([x0, z0, x1, z1]); };
  brace(-8.42, -6.22, -8.42, -3.2); brace(-8.42, -0.2, -8.42, 2.8);                    // west line
  brace(-6.4, -6.22, -3.6, -6.22); brace(-0.8, -6.22, 2.0, -6.22);                      // bay line
  brace(-6.4, -3.2, -6.4, -0.2); brace(2.0, -0.2, 2.0, 2.8);                            // carport side walls
  brace(-3.6, -3.2, -0.8, -3.2);                                                        // back of the middle carport bay
  const knee = (px, pz, dx, dz) => { // 4x4 knee brace from the pile up to the girder / joists
    const a = [px + dx * (P.pileR - 0.01), girBot - 0.78, pz + dz * (P.pileR - 0.01)], b = [px + dx * 0.86, girBot + 0.02, pz + dz * 0.86];
    B.strut(W, a, b, 0.088, 0.088, { color: kit.vary(kit.mul(C.pile, 1.05), r, 0.1), wear: 0.6, bevel: 0.005, extra: 0.1, rand: r });
  };
  knee(-6.4, 5.02, -1, 0); knee(-0.8, 5.02, 1, 0); knee(2.0, 5.02, -1, 0); for (const x of [-6.4, -3.6, -0.8]) { knee(x, 2.8, 0, -1); }
  for (const z of [-3.2, -0.2, 2.8]) { knee(-8.42, z, 1, 0); }
  for (const x of [-3.6, -0.8]) { knee(x, 2.8, 1, 0); knee(x, 2.8, -1, 0); knee(x, -0.2, 1, 0); knee(x, -0.2, -1, 0); }

  // ---------- railings ----------
  const R = P.rail, railY = F + R.h;
  const PAINT_W = { fade: 0.5 };
  const trim = (w) => ({ color: kit.vary(0x7a5b3c, r, 0.08), wear: w ?? (0.42 + r() * 0.3), bevel: 0.004, rand: r });
  // straight level run from a to b (plan points). posts at both ends unless told otherwise.
  const railRun = (ax, az, bx, bz, o = {}) => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(-uz, ux), n = Math.max(1, Math.round(len / 1.55));
    const at = (t, y, o2 = 0) => [ax + ux * t - uz * o2, y, az + uz * t + ux * o2];
    for (let i = 0; i <= n; i++) {
      if ((i === 0 && o.noStart) || (i === n && o.noEnd)) continue;
      const p = at(len * i / n, 0);
      B.box(PW, R.post, R.h + 0.06, R.post, M(p[0], F + (R.h + 0.06) / 2 - 0.02, p[2], 0, ry + (r() - 0.5) * 0.02, (r() - 0.5) * 0.012), { grain: 1, ...trim() });
      B.box(PW, R.post + 0.03, 0.02, R.post + 0.03, M(p[0], F + R.h + 0.05, p[2], 0, ry, 0), { ...trim(0.6) });            // little post cap
    }
    for (let i = 0; i < n; i++) {
      const t0 = len * i / n + R.post / 2, t1 = len * (i + 1) / n - R.post / 2, tm = (t0 + t1) / 2, l = t1 - t0, sag = (r() - 0.5) * 0.006;
      const pm = at(tm, 0);
      B.box(PW, l, 0.089, 0.038, M(pm[0], railY - 0.065 + sag, pm[2], 0, ry, 0), { grain: 0, ...trim() });                  // sub-rail
      B.box(PW, l, 0.038, 0.089, M(pm[0], F + 0.105, pm[2], 0, ry, 0), { grain: 0, ...trim(0.55 + r() * 0.3) });          // bottom rail
      const nb = Math.max(1, Math.floor(l / R.balOC)), sp = l / (nb + 1);
      for (let k = 1; k <= nb; k++) {
        if (r() < 0.012) continue;                                                                                          // a missing baluster here and there
        const p = at(t0 + sp * k, 0), swap = r() < 0.03, h = railY - 0.11 - (F + 0.124);
        B.box(swap ? W : PW, R.bal, h, R.bal, M(p[0], F + 0.124 + h / 2, p[2], (r() - 0.5) * 0.02, ry, (r() - 0.5) * 0.02), swap ? { grain: 1, color: kit.vary(0xc9b48a, r, 0.06), wear: 0.15, bevel: 0.003, rand: r } : { grain: 1, ...trim(), bevel: 0.003 });
      }
    }
    // cap rail, continuous over the posts in long boards
    const nc = Math.max(1, Math.round(len / 3.4));
    for (let i = 0; i < nc; i++) { const pm = at(len * (i + 0.5) / nc, 0), l = len / nc - 0.003 + (i === 0 && o.capStart ? o.capStart : 0); B.box(PW, l + (o.capExtra || 0), 0.038, 0.14, M(pm[0], railY, pm[2], 0, ry, 0), { grain: 0, ...trim(0.5 + r() * 0.3), bevel: 0.006 }); }
    col.box((ax + bx) / 2, F + 0.56, (az + bz) / 2, len, 1.12, 0.1, { ry, tag: 'rail' });
  };
  const e = 0.07; // rail centerline inset from the deck edge
  railRun(-8.6 + e, -6.4 + e, 4.7, -6.4 + e); railRun(5.9, -6.4 + e, 6.6 - e, -6.4 + e);
  railRun(-8.6 + e, -6.4 + e, -8.6 + e, 3.0, { noStart: true }); railRun(-8.6 + e, 4.2, -8.6 + e, 5.05);
  // porch front: rails between the porch posts (posts are built below), then the short return to the wing wall
  const porchPosts = [-8.6 + e, -6.4, -3.6, -0.8, 2.0 - e];
  railRun(-8.6 + e, 5.05, -6.47, 5.05, { noStart: true }); railRun(-6.47, 5.05, -6.47, 2.92, { noStart: true }); railRun(-0.73, 2.92, -0.73, 5.05); railRun(-0.73, 5.05, 0.53, 5.05, { noStart: true });

  ctx.porch = { beamTop: 5.2, beamD: 0.19, posts: [] };
  // ---------- stairs ----------
  const rise = P.rise, run = P.run, TR = { grain: 0, bevel: 0.006 };
  // one straight flight. o: { x, z, y: top nosing position (center of the flight width), dir: [dx, dz] downhill, n: treads, w: width, rails: 'both'|'left'|'right' }
  const flight = (o) => {
    const [dx, dz] = o.dir, px = -dz, pz = dx, n = o.n, ry = Math.atan2(-dz, dx), total = n * run, drop = (n + 1) * rise;
    const at = (t, y, s = 0) => [o.x + dx * t + px * s, y, o.z + dz * t + pz * s];
    for (let i = 1; i <= n; i++) {
      const y = o.y - rise * i;
      for (const k of [0, 1]) { const p = at(run * (i - 1) + 0.045 + k * 0.146 + 0.01, y - 0.019); B.box(W, 0.14, 0.038, o.w - 0.1, M(p[0], p[1] + (r() - 0.5) * 0.003, p[2], 0, ry, (r() - 0.5) * 0.01), { grain: 2, color: gray(0.8 + r() * 0.3), wear: 0.5 + r() * 0.4, bevel: 0.006, rand: r }); }
      for (const s of [-1, 1]) { const p = at(run * (i - 1) + 0.13, y - 0.038 - 0.035, s * (o.w / 2 - 0.075)); B.box(W, 0.24, 0.07, 0.038, M(p[0], p[1], p[2], 0, ry, 0), { grain: 0, color: dark(), wear: 0.4, bevel: 0.003, rand: r }); }   // tread cleats
    }
    const slope = Math.atan2(drop, total + run), sl = Math.hypot(drop, total + run);
    for (const s of [-1, 1]) { // solid 2x12 stringers
      const a = at(-0.12, o.y - 0.12, s * (o.w / 2 - 0.022)), b = at(total + 0.1, o.y - drop + 0.16, s * (o.w / 2 - 0.022));
      B.strut(W, a, b, 0.045, 0.286, { color: gray(0.85), wear: 0.7, bevel: 0.005, rand: r });
    }
    // walking ramp through the tread nosings + side guards
    const mid = at((total + run) / 2 - 0.1 * Math.sin(slope), o.y - drop / 2 - 0.1 * Math.cos(slope));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, -slope, 'YXZ'));
    ctx.colliders.push({ shape: 'box', p: mid, h: [sl / 2 + 0.05, 0.1, o.w / 2], q: [q.x, q.y, q.z, q.w], tag: 'stair', surface: 'wood', enabled: true });
    // sloped rails with vertical balusters
    for (const s of [-1, 1]) {
      if ((o.rails === 'left' && s > 0) || (o.rails === 'right' && s < 0)) continue;
      const off = s * (o.w / 2 + 0.03), top = at(o.t0 ?? 0.02, o.y + R.h, off), bot = at(total + run - 0.06, o.y - drop + R.h, off);
      B.strut(PW, top, bot, 0.14, 0.038, { ...trim(0.5), bevel: 0.006, extra: 0.06 });
      B.strut(PW, [top[0], top[1] - 0.07, top[2]], [bot[0], bot[1] - 0.07, bot[2]], 0.038, 0.089, { ...trim() });
      B.strut(PW, [top[0], top[1] - R.h + 0.19, top[2]], [bot[0], bot[1] - R.h + 0.19, bot[2]], 0.038, 0.089, { ...trim(0.6) });
      const nb = Math.floor((total + run - 0.1) / R.balOC);
      for (let k = 1; k < nb; k++) { const t = (o.t0 ?? 0.02) + k * R.balOC, yy = o.y - (t / (total + run)) * drop, p = at(t, yy + 0.24 + (R.h - 0.36) / 2, off); if (r() < 0.012) continue; B.box(PW, R.bal, R.h - 0.36, R.bal, M(p[0], p[1], p[2], 0, ry, (r() - 0.5) * 0.02), { grain: 1, ...trim(), bevel: 0.003 }); }
      const pb = at(total + run - 0.03, 0, off); if (o.footPost !== false) { B.box(PW, R.post, R.h + 0.1 + rise, R.post, M(pb[0], o.y - drop + (R.h + 0.1) / 2 , pb[2], 0, ry, 0), { grain: 1, ...trim(0.7) }); }
      const tc = (total + run) / 2 - 0.42, gm = at(tc, o.y - drop * (tc / (total + run)) + 0.6, off), gq = q;   // stops short of the foot so it never pokes over a landing
      ctx.colliders.push({ shape: 'box', p: gm, h: [sl / 2 - 0.42 / Math.cos(slope), 0.62, 0.05], q: [gq.x, gq.y, gq.z, gq.w], tag: 'rail', enabled: true });
    }
  };
  // landing platform on posts. posts continue up as rail posts where asked.
  const landing = (L, y, o = {}) => {
    const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2, sx = L.x1 - L.x0, sz = L.z1 - L.z0;
    for (let z = L.z0 + pitch / 2; z < L.z1 - 0.05; z += pitch) B.box(W, sx - 0.004, db.t, db.w, M(cx, y - db.t / 2, z), { grain: 0, color: gray(0.8 + r() * 0.3), wear: 0.5 + r() * 0.4, bevel: 0.0045, rand: r });
    for (const z of [L.z0 + 0.022, L.z1 - 0.022]) B.box(W, sx, 0.184, 0.04, M(cx, y - db.t - 0.092, z), { grain: 0, color: gray(0.85), wear: 0.6, bevel: 0.004, rand: r });
    for (const x of [L.x0 + 0.022, cx, L.x1 - 0.022]) B.box(W, 0.04, 0.184, sz - 0.09, M(x, y - db.t - 0.092, cz), { grain: 2, color: dark(), wear: 0.5, bevel: 0.004, rand: r });
    for (const [x, z, up] of (o.posts || [])) {
      const top = up ? y + R.h + 0.04 : y - db.t, h = top + 0.4;
      B.box(up ? PW : W, 0.14, h, 0.14, M(x, top - h / 2, z), up ? { grain: 1, color: kit.vary(C.trim, r, 0.03), wear: [0.9, 0.45], bevel: 0.008, rand: r } : { grain: 1, color: kit.vary(C.pile, r, 0.1), wear: 0.7, bevel: 0.008, rand: r });
      B.box(CONC, 0.4, 0.34, 0.4, M(x, 0.02, z, 0, r() * 0.2, 0), { bevel: 0.02, color: kit.vary(0xcfc9ba, r, 0.08), wear: 0.8 });
      col.box(x, top / 2, z, 0.16, top, 0.16, { tag: 'post' });
    }
    col.box(cx, y - 0.12, cz, sx, 0.24, sz, { tag: 'deck', surface: 'wood' });
  };
  // west stair: flight 1 west from the deck edge, landing, flight 2 south to the yard
  const SW = P.stairW, Lw = SW.landing;
  flight({ x: -8.6, z: 3.6, y: F, dir: [-1, 0], n: 7, w: SW.w, footPost: false });
  landing(Lw, Lw.y, { posts: [[Lw.x0 + 0.07, Lw.z0 + 0.07, true], [Lw.x1 - 0.07, Lw.z0 + 0.07, true], [Lw.x0 + 0.07, Lw.z1 - 0.07, true], [Lw.x1 - 0.07, Lw.z1 - 0.07, true]] });
  flight({ x: (Lw.x0 + Lw.x1) / 2, z: Lw.z1, y: Lw.y, dir: [0, 1], n: 7, w: SW.w });
  // landing rails (west and north sides) + X brace under the landing
  const lr = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    B.box(PW, len, 0.038, 0.14, M(mx, Lw.y + R.h, mz, 0, ry, 0), { grain: 0, ...trim(0.55), bevel: 0.006 }); B.box(PW, len - 0.14, 0.089, 0.038, M(mx, Lw.y + R.h - 0.065, mz, 0, ry, 0), { grain: 0, ...trim() }); B.box(PW, len - 0.14, 0.038, 0.089, M(mx, Lw.y + 0.105, mz, 0, ry, 0), { grain: 0, ...trim(0.6) });
    const nb = Math.floor((len - 0.14) / R.balOC); for (let k = 1; k <= nb; k++) { const t = (k / (nb + 1) - 0.5) * (len - 0.14); B.box(PW, R.bal, R.h - 0.235, R.bal, M(mx + Math.cos(ry) * t, Lw.y + 0.124 + (R.h - 0.235) / 2, mz - Math.sin(ry) * t, 0, ry, (r() - 0.5) * 0.02), { grain: 1, ...trim(), bevel: 0.003 }); }
    col.box(mx, Lw.y + 0.56, mz, len, 1.12, 0.1, { ry, tag: 'rail' }); };
  lr(Lw.x0 + 0.07, Lw.z0 + 0.07, Lw.x0 + 0.07, Lw.z1 - 0.07); lr(Lw.x0 + 0.07, Lw.z0 + 0.07, Lw.x1 - 0.07, Lw.z0 + 0.07);
  B.strut(W, [Lw.x0 + 0.07, 0.3, Lw.z0 - 0.0], [Lw.x1 - 0.07, Lw.y - 0.35, Lw.z0 - 0.0], 0.038, 0.14, { color: gray(0.8), wear: 0.7, bevel: 0.004 });
  B.strut(W, [Lw.x0 - 0.0, 0.3, Lw.z1 - 0.07], [Lw.x0 - 0.0, Lw.y - 0.35, Lw.z0 + 0.07], 0.038, 0.14, { color: gray(0.8), wear: 0.7, bevel: 0.004 });
  // concrete pad at the foot of the west stair
  B.box(CONC, 1.5, 0.12, 0.9, M((Lw.x0 + Lw.x1) / 2, 0.0, Lw.z1 + 8 * run + 0.25, 0, 0.02, 0), { bevel: 0.02, color: 0xc9c3b4, wear: 0.9 });
  // bay-side stair: platform outside the deck edge, one flight running west down to the yard
  const SN = P.stairN, T = SN.top;
  landing(T, F, { posts: [[T.x1 - 0.07, T.z0 + 0.07, true], [T.x0 + 0.07, T.z0 + 0.07, true]] });
  flight({ x: T.x0, z: (T.z0 + T.z1) / 2 - 0.03, y: F, dir: [-1, 0], n: 15, w: SN.w });
  { const y0 = F; // platform rails: north and east sides
    const seg = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      B.box(PW, len, 0.038, 0.14, M(mx, y0 + R.h, mz, 0, ry, 0), { grain: 0, ...trim(0.55), bevel: 0.006 }); B.box(PW, len - 0.14, 0.089, 0.038, M(mx, y0 + R.h - 0.065, mz, 0, ry, 0), { grain: 0, ...trim() }); B.box(PW, len - 0.14, 0.038, 0.089, M(mx, y0 + 0.105, mz, 0, ry, 0), { grain: 0, ...trim(0.6) });
      const nb = Math.floor((len - 0.14) / R.balOC); for (let k = 1; k <= nb; k++) { const t = (k / (nb + 1) - 0.5) * (len - 0.14); B.box(PW, R.bal, R.h - 0.235, R.bal, M(mx + Math.cos(ry) * t, y0 + 0.124 + (R.h - 0.235) / 2, mz - Math.sin(ry) * t, 0, ry, 0), { grain: 1, ...trim(), bevel: 0.003 }); }
      col.box(mx, y0 + 0.56, mz, len, 1.12, 0.1, { ry, tag: 'rail' }); };
    seg(T.x0 + 0.07, T.z0 + 0.07, T.x1 - 0.07, T.z0 + 0.07); seg(T.x1 - 0.07, T.z0 + 0.07, T.x1 - 0.07, T.z1 - 0.02);
    for (const [x, z] of [[T.x0 + 0.5, T.z0 + 0.07]]) { B.strut(W, [T.x0 + 0.07, 0.4, z], [T.x1 - 0.07, F - 0.4, z], 0.038, 0.14, { color: gray(0.8), wear: 0.7, bevel: 0.004 }); }
  }
  B.box(CONC, 0.9, 0.12, 1.4, M(T.x0 - 16 * run - 0.2, 0.0, (T.z0 + T.z1) / 2 + 0.05, 0, -0.03, 0), { bevel: 0.02, color: 0xc9c3b4, wear: 0.9 });

  // ---------- hardware instances: bolts + washers, deck screws, hurricane ties ----------
  const boltG = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6), washG = new THREE.CylinderGeometry(0.024, 0.024, 0.004, 10), screwG = new THREE.CircleGeometry(0.0042, 6); screwG.rotateX(-Math.PI / 2);
  const hw = new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.85, metalness: 0.5, map: kit.tex('rusty_metal_04_diff.jpg', { srgb: true }) });
  ctx.groups.ext.add(kit.instances(boltG, hw, bolts, null, { cast: false }), kit.instances(washG, hw, washers, null, { cast: false }));
  const sm = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.7, metalness: 0.6 });
  const si = kit.instances(screwG, sm, screws, null, { cast: false }); si.name = 'deckScrews'; ctx.groups.detail.add(si);
  const strapG = new THREE.BoxGeometry(0.003, 0.11, 0.034); const st = kit.instances(strapG, STEEL, straps, straps.map(() => kit.vary(0xb9bdbd, r, 0.1)), { cast: false }); ctx.groups.ext.add(st);
  ctx.stats.structure = { piles: piles.length, bolts: bolts.length, screws: screws.length, straps: straps.length };
}
