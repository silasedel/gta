// Nico's house, part 12: the roofed front porch and wraparound sun deck on the east wing (the user's design): square
// white-weathered posts with knee braces, beams, joists, individually laid boards, brown balustrade, the gable infill
// with its louver vent, string lights and pendant, the market umbrella, wicker chairs and table, the striped towel.
import { roofY } from '../plan.js';
export const order = 12;

export function build(ctx) {
  const { THREE, kit, plan: P, mat, col } = ctx, B = ctx.ext, D = ctx.detail, M = kit.M, C = P.colors, F = P.F, r = kit.rng(1212);
  const PW = mat.paint({ peel: 'a', fade: 0.28 }), W = mat.wood(), ST = mat.steel(), db = P.deckBoard, X0 = 0.6, X1 = 8.1, Z0 = 4.4, Z1 = 7.95, XE = 6.6;
  const white = (wr) => ({ color: kit.vary(C.trim, r, 0.04), wear: wr ?? [1.0, 0.84 + r() * 0.12], bevel: 0.008, rand: r }), brown = (wr) => ({ color: kit.vary(0x7a5b3c, r, 0.08), wear: wr ?? 0.42 + r() * 0.3, bevel: 0.004, rand: r });
  const gray = () => kit.vary(0x9a9388, r, 0.1);
  // posts with knee braces
  const posts = [[0.75, 7.8], [2.6, 7.8], [5.1, 7.8], [7.95, 7.8], [7.95, 4.6], [7.95, 1.0], [7.95, -2.6], [7.95, -6.2]];
  for (const [x, z] of posts) {
    B.box(PW, 0.2, 3.1, 0.2, M(x, 1.2, z, (r() - 0.5) * 0.01, (r() - 0.5) * 0.05, 0), { grain: 1, ...white() }); B.box(mat.concrete(), 0.58, 0.5, 0.58, M(x, -0.08, z, 0, r() * 0.2, 0), { bevel: 0.025, color: kit.vary(0xcfc9ba, r, 0.08), wear: 0.8 });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const bx = x + dx * 0.85, bz = z + dz * 0.85; if (bx > X1 || bz > Z1 || (dz < 0 && z > 7 && false)) continue; if (dx && Math.abs(z - 7.8) > 0.1 && x > 7) continue; if (dz > 0 && z > 7) continue; if (dx < 0 && x < 2.5) continue;
      B.strut(PW, [x + dx * 0.09, 1.72, z + dz * 0.09], [bx, 2.5, bz], 0.09, 0.09, { ...white(0.9), extra: 0.1 }); }
    col.box(x, 1.3, z, 0.22, 2.6, 0.22, { tag: 'post' });
  }
  // beams (doubled, bolted), joists, rim
  const beam = (ax, az, bx, bz) => { const horiz = Math.abs(az - bz) < 0.01, len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az); for (const s of [-1, 1]) B.box(PW, horiz ? len : 0.045, 0.286, horiz ? 0.045 : len, M((ax + bx) / 2 + (horiz ? 0 : s * 0.125), 2.585, (az + bz) / 2 + (horiz ? s * 0.125 : 0)), { grain: horiz ? 0 : 2, ...white(0.92), bevel: 0.004 }); };
  beam(X0, 7.8, X1, 7.8); beam(7.95, -6.4, 7.95, 7.8);
  for (let x = X0 + 0.2; x < X1 - 0.05; x += 0.406) B.box(W, 0.04, 0.235, (x > XE ? Z1 + 6.4 : Z1 - Z0) - 0.09, M(x, 2.845, x > XE ? (Z1 - 3.2) / 2 : x < 2.0 ? (5.2 + Z1) / 2 + 0.9 : (Z0 + Z1) / 2), { grain: 2, color: kit.vary(0x6f675c, r, 0.1), wear: 0.4, bevel: 0.003, rand: r });
  const rim = (ax, az, bx, bz) => { const horiz = Math.abs(az - bz) < 0.01, len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az), n = Math.ceil(len / 3.6); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; B.box(PW, horiz ? len / n - 0.004 : 0.045, 0.27, horiz ? 0.045 : len / n - 0.004, M(ax + (bx - ax) * t, 2.862, az + (bz - az) * t), { grain: horiz ? 0 : 2, ...white([0.95, 0.85]), bevel: 0.005 }); } };
  rim(X0, Z1 - 0.022, X1, Z1 - 0.022); rim(X1 - 0.022, -6.4, X1 - 0.022, Z1); rim(X0 + 0.022, 5.2, X0 + 0.022, Z1); rim(XE, -6.4 + 0.022, X1, -6.4 + 0.022);
  // boards (east-west rows)
  const pitch = db.w + db.gap;
  for (let z = -6.4 + pitch / 2; z < Z1 - 0.05; z += pitch) { const a = z < Z0 + 0.02 ? XE + 0.03 : z < 5.2 ? 2.004 : X0 + 0.004, b = X1 - 0.004; let x = a; while (x < b - 0.01) { let xe = Math.min(b, x + 2.4 + r() * 2.2); if (b - xe < 0.7) xe = b; B.box(W, xe - x - 0.004, db.t, db.w, M((x + xe) / 2, F - db.t / 2 + (r() - 0.5) * 0.003, z, (r() - 0.5) * 0.012, 0, 0), { grain: 0, color: r() < 0.05 ? kit.vary(0xc9b48a, r, 0.06) : kit.mul(gray(), 0.86 + r() * 0.26), wear: 0.35 + r() * 0.5, bevel: 0.0045, rand: r }); x = xe; } }
  col.box((X0 + X1) / 2, F - 0.16, (Z0 + Z1) / 2, X1 - X0, 0.32, Z1 - Z0, { tag: 'deck', surface: 'wood' }); col.box((XE + X1) / 2, F - 0.16, (Z0 - 3.2) / 2, X1 - XE, 0.32, Z0 + 6.4, { tag: 'deck', surface: 'wood' });
  // brown balustrade
  const R = P.rail, rail = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(-uz, ux), n = Math.max(1, Math.round(len / 1.5)), at = (t) => [ax + ux * t, az + uz * t];
    for (let i = 0; i <= n; i++) { const p = at(len * i / n); B.box(PW, R.post, R.h + 0.06, R.post, M(p[0], F + (R.h + 0.06) / 2 - 0.02, p[1], 0, ry, (r() - 0.5) * 0.012), { grain: 1, ...brown() }); }
    for (let i = 0; i < n; i++) { const t0 = len * i / n + R.post / 2, t1 = len * (i + 1) / n - R.post / 2, pm = at((t0 + t1) / 2), l = t1 - t0; B.box(PW, l, 0.089, 0.038, M(pm[0], F + R.h - 0.065, pm[1], 0, ry, 0), { grain: 0, ...brown() }); B.box(PW, l, 0.038, 0.089, M(pm[0], F + 0.105, pm[1], 0, ry, 0), { grain: 0, ...brown(0.6) });
      const nb = Math.floor(l / R.balOC), sp = l / (nb + 1); for (let k = 1; k <= nb; k++) { if (r() < 0.012) continue; const p = at(t0 + sp * k), h = R.h - 0.235; B.box(PW, R.bal, h, R.bal, M(p[0], F + 0.124 + h / 2, p[1], (r() - 0.5) * 0.02, ry, (r() - 0.5) * 0.02), { grain: 1, ...brown(), bevel: 0.003 }); } }
    const pm = at(len / 2); B.box(PW, len + 0.1, 0.038, 0.14, M(pm[0], F + R.h, pm[1], 0, ry, 0), { grain: 0, ...brown(0.55), bevel: 0.006 }); col.box(pm[0], F + 0.56, pm[1], len, 1.12, 0.1, { ry, tag: 'rail' }); };
  const e = 0.07; rail(X0 + e, 5.3, X0 + e, Z1 - e); rail(X0 + e, Z1 - e, X1 - e, Z1 - e); rail(X1 - e, Z1 - e, X1 - e, -6.4 + e); rail(X1 - e, -6.4 + e, XE + 0.1, -6.4 + e);
  // ---------- porch roof carry: posts, beams, gable infill with vent ----------
  const rx0 = 1.72, rx1 = 6.88, zf = 7.8, by = 5.36;
  for (const x of [rx0, rx1]) { for (const z of [zf, 6.1]) { if (z < 7 && x > 3) continue; B.box(PW, 0.15, by - F, 0.15, M(x + (x < 3 ? 0.42 : -0.3), F + (by - F) / 2, z), { grain: 1, ...white([0.9, 0.7]), bevel: 0.01 }); col.box(x + (x < 3 ? 0.42 : -0.3), F + 1.1, z, 0.17, 2.2, 0.17, { tag: 'post' }); } B.box(PW, 0.09, 0.2, zf - Z0 + 0.3, M(x + (x < 3 ? 0.42 : -0.3), by + 0.1, (zf + Z0) / 2), { grain: 2, ...white(0.8), bevel: 0.005 }); }
  B.box(PW, rx1 - rx0 + 0.6, 0.2, 0.09, M((rx0 + rx1) / 2 + 0.06, by + 0.1, zf), { grain: 0, ...white(0.8), bevel: 0.005 });
  for (let x = rx0 + 0.5; x < rx1 - 0.2; x += 0.185) { const yt = roofY(x + 0.09, 4.0) - 0.13, y0 = by + 0.2; if (yt - y0 < 0.06) continue; if (Math.abs(x + 0.09 - 4.3) < 0.36 && yt > 6.2) { B.box(PW, 0.18, 6.18 - y0, 0.02, M(x + 0.09, (y0 + 6.18) / 2, zf + 0.01), { grain: 1, color: kit.vary(C.body, r, 0.06), wear: 0.5 + r() * 0.3, rand: r }); if (yt > 6.85) B.box(PW, 0.18, yt - 6.85, 0.02, M(x + 0.09, (yt + 6.85) / 2, zf + 0.01), { grain: 1, color: kit.vary(C.body, r, 0.06), wear: 0.5, rand: r }); continue; }
    B.box(PW, 0.18, yt - y0, 0.02, M(x + 0.09, (y0 + yt) / 2, zf + 0.01 + (Math.round(x * 7) % 2) * 0.004), { grain: 1, color: kit.vary(C.body, r, 0.06), wear: [0.5, 0.22 + r() * 0.15], rand: r, bevel: 0.003 }); }
  B.box(mat.matte(), 0.62, 0.62, 0.012, M(4.3, 6.51, zf + 0.004), { color: 0x14110f }); for (let y = 6.24; y < 6.82; y += 0.05) B.box(PW, 0.6, 0.008, 0.06, M(4.3, y, zf + 0.03, 0.7, 0, 0), { grain: 0, ...white(0.6), bevel: 0 });
  for (const s of [-1, 1]) B.box(PW, 0.07, 0.76, 0.03, M(4.3 + s * 0.34, 6.52, zf + 0.03), { grain: 1, ...white(0.6) }); for (const y of [6.16, 6.88]) B.box(PW, 0.76, 0.07, 0.032, M(4.3, y, zf + 0.032), { grain: 0, ...white(0.6) });
  // string lights along the porch beams + pendant; they come on at dusk
  const bulbs = [], strand = (a, b, n) => { const pts = []; for (let i = 0; i <= n * 3; i++) { const t = i / (n * 3), sag = Math.sin(t * Math.PI * n) ** 2 * 0.16; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t]); if (i % 1 === 0 && i % 3 !== 0 || n > 3) bulbs.push(M(pts[pts.length - 1][0], pts[pts.length - 1][1] - 0.045, pts[pts.length - 1][2])); } D.tube(mat.rubber(), pts, 0.006, { seg: 4, color: 0x1c1c1a, steps: n * 12 }); };
  strand([rx0 + 0.45, by - 0.02, zf - 0.08], [rx1 - 0.33, by - 0.02, zf - 0.08], 6); strand([rx1 - 0.36, by - 0.02, zf - 0.1], [rx1 - 0.36, by - 0.02, Z0 + 0.15], 4); strand([rx0 + 0.48, by - 0.02, zf - 0.1], [rx0 + 0.48, by - 0.02, Z0 + 0.6], 4);
  const bm = new THREE.MeshStandardMaterial({ color: 0x3a2c14, emissive: 0xffc878, emissiveIntensity: 0.15, roughness: 0.3 }); const bi = kit.instances(new THREE.SphereGeometry(0.022, 8, 6), bm, bulbs, null, { cast: false }); bi.name = 'stringLights'; ctx.groups.ext.add(bi);
  B.cyl(mat.rubber(), 0.004, 0.004, 0.75, M(4.3, 6.3, 6.0), { color: 0x1c1c1a, seg: 5 }); B.cyl(mat.metalPaint(), 0.05, 0.19, 0.17, M(4.3, 5.86, 6.0), { color: 0x2f3b38, seg: 16 }); B.geo(mat.emissive(0xffdca0, 2.2, 'pend'), new THREE.SphereGeometry(0.05, 10, 8), M(4.3, 5.8, 6.0), {});
  const l1 = ctx.addLight({ id: 'porch_pendant', pos: [4.3, 5.6, 6.0], color: 0xffd39a, intensity: 60, range: 9, on: false }), l2 = ctx.addLight({ id: 'porch_strings', pos: [4.3, 5.2, 7.5], color: 0xffc070, intensity: 35, range: 8, on: false });
  ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12, night = t < 6.3 || t > 18.3; l1.on = l2.on = night; bm.emissiveIntensity = night ? 3.2 : 0.15; });
  // ---------- deck furniture: cream market umbrella, wicker chairs and table, striped towel ----------
  { const ux = 3.6, uz = 6.4, CAN = mat.fabric('cotton_jersey', { rep: 0.4, side: THREE.DoubleSide });
    B.cyl(W, 0.022, 0.024, 2.55, M(ux, F + 1.275, uz), { seg: 10, color: 0x9a8468, wear: 0.3 }); B.cyl(mat.concrete(), 0.24, 0.27, 0.09, M(ux, F + 0.045, uz), { seg: 18, color: 0xd6d1c2 });
    const cg = new THREE.ConeGeometry(1.55, 0.5, 8, 3, true); const pa = cg.attributes.position; for (let i = 0; i < pa.count; i++) { const yy = pa.getY(i), t = (0.25 - yy) / 0.5; pa.setY(i, yy - Math.sin(t * Math.PI) * 0.06); } cg.computeVertexNormals();
    B.geo(CAN, cg, M(ux, F + 2.32, uz, 0, 0.2, 0), { color: 0xe9e2cc, uvMul: [6, 2] }); cg.dispose();
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + 0.2; B.rod(W, [ux, F + 2.52, uz], [ux + Math.cos(a) * 1.5, F + 2.06, uz + Math.sin(a) * 1.5], 0.008, { color: 0x9a8468, seg: 5 }); B.rod(W, [ux, F + 1.75, uz], [ux + Math.cos(a) * 0.75, F + 2.28, uz + Math.sin(a) * 0.75], 0.006, { color: 0x9a8468, seg: 5 }); }
    const WK = mat.pbr('tatami_mat', { rep: 0.22, gain: 1.5, tint: 0xc9a56a });
    B.cyl(WK, 0.5, 0.5, 0.04, M(ux, F + 0.72, uz), { seg: 22, color: 0xffffff }); B.cyl(WK, 0.2, 0.3, 0.7, M(ux, F + 0.35, uz), { seg: 14, color: 0xe8dcc0 });
    const chair = (x, z, ry) => { const L = (a, b, c2, rx = 0) => M(x, F, z, 0, ry, 0).multiply(M(a, b, c2, rx, 0, 0));
      B.box(WK, 0.56, 0.1, 0.54, L(0, 0.4, 0), { bevel: 0.03 }); B.box(WK, 0.56, 0.52, 0.08, L(0, 0.72, -0.26, -0.14), { bevel: 0.03 }); for (const s of [-1, 1]) { B.box(WK, 0.07, 0.24, 0.54, L(s * 0.29, 0.56, 0), { bevel: 0.03 }); for (const dz of [-0.23, 0.23]) B.cyl(WK, 0.022, 0.02, 0.36, L(s * 0.25, 0.18, dz), { seg: 8, color: 0xd9c9a4 }); }
      B.box(mat.fabric('waffle_pique_cotton', { rep: 0.2 }), 0.46, 0.06, 0.44, L(0, 0.47, 0.02), { color: 0xe6dfcf, bevel: 0.025 }); col.box(x, F + 0.45, z, 0.6, 0.9, 0.6, { ry, tag: 'prop' }); };
    chair(ux - 0.95, uz + 0.25, 1.3); chair(ux + 0.2, uz - 1.0, 0.1); chair(ux + 1.0, uz + 0.3, -1.4); col.cyl(ux, F + 0.4, uz, 0.5, 0.8, { tag: 'prop' });
    const TW = mat.art('towel', 128, 256, (g, w, h) => { for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#f1ece2' : '#c8473f'; g.fillRect(i * w / 12, 0, w / 12 + 1, h); } const q = kit.rng(8); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${q() > 0.5 ? 255 : 60},${q() > 0.5 ? 250 : 50},${q() > 0.5 ? 240 : 50},0.07)`; g.fillRect(q() * w, q() * h, 1, 2); } }, { rough: 0.95, side: THREE.DoubleSide });
    for (const s of [-1, 1]) { const g = new THREE.PlaneGeometry(0.62, 0.62, 8, 6), p2 = g.attributes.position; for (let i = 0; i < p2.count; i++) p2.setZ(i, Math.sin(p2.getX(i) * 14 + s) * 0.012 * (0.5 - p2.getY(i))); g.computeVertexNormals(); B.geo(TW, g, M(5.05, F + R.h - 0.3, Z1 - e + s * 0.085, s * 0.06, 0, 0), {}); g.dispose(); }
    B.box(TW, 0.62, 0.012, 0.17, M(5.05, F + R.h + 0.026, Z1 - e), {}); }
}
