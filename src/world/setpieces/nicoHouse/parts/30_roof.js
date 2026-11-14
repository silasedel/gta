// Nico's house, part 30: the roof (user's design). A low shed roof over the main block falling toward the street, with a
// deep overhang on exposed rafter tails, and the taller gable over the east wing that runs out over the front porch.
// Real corrugated sheets, individually lapped, rusty and patched; ridge cap, rake boards, eave boards, gutter, downspout.
export const order = 30;

export function build(ctx) {
  const { THREE, kit, plan: P, mat } = ctx, B = ctx.ext, M = kit.M, C = P.colors, F = P.F;
  const r = kit.rng(404), TIN = mat.tin(), PAINT = mat.paint({ peel: 'a', fade: 0.28 }), W = mat.wood(), STEEL = mat.steel();
  const S = P.shed, rB = P.ridgeB, pB = P.pitchB, xBw = P.B.x0 - P.eaveOv, xBe = P.B.x1 + P.eaveOv, zBs = P.B.z1 + 3.75, zBn = P.B.z0 - P.rakeOv;
  const planes = [
    { id: 'A_south', o: [0, S.z0], d: [0, 1], a: [1, 0], y0: S.y0, pitch: S.pitch, poly: [[S.x0, S.z0], [S.x1, S.z0], [S.x1, S.z1], [S.x0, S.z1]], age: 0.82 },
    { id: 'B_west', o: [rB.x, 0], d: [-1, 0], a: [0, 1], y0: rB.y, pitch: pB, poly: [[rB.x, zBn], [xBw, zBn], [xBw, zBs], [rB.x, zBs]], age: 0.78 },
    { id: 'B_east', o: [rB.x, 0], d: [1, 0], a: [0, 1], y0: rB.y, pitch: pB, poly: [[rB.x, zBn], [xBe, zBn], [xBe, zBs], [rB.x, zBs]], age: 0.85 },
  ];
  ctx.roofPlanes = planes;
  const WAVE = 0.0762, AMP = 0.0095, LIFT = 0.016, screws = [];
  const clip = (pl, p) => {
    const px = pl.o[0] + pl.a[0] * p, pz = pl.o[1] + pl.a[1] * p; let s0 = -1e9, s1 = 1e9; const n = pl.poly.length;
    let cx = 0, cz = 0; for (const v of pl.poly) { cx += v[0] / n; cz += v[1] / n; }
    for (let i = 0; i < n; i++) {
      const A = pl.poly[i], Bv = pl.poly[(i + 1) % n]; let ex = -(Bv[1] - A[1]), ez = Bv[0] - A[0];
      if (ex * (cx - A[0]) + ez * (cz - A[1]) < 0) { ex = -ex; ez = -ez; }
      const num = ex * (px - A[0]) + ez * (pz - A[1]), den = ex * pl.d[0] + ez * pl.d[1];
      if (Math.abs(den) < 1e-9) { if (num < -1e-6) return null; continue; }
      const t = -num / den; if (den > 0) s0 = Math.max(s0, t); else s1 = Math.min(s1, t);
    }
    return s1 - s0 > 0.02 ? [s0, s1] : null;
  };
  const pos3 = (pl, p, s, up = 0) => { const k = 1 / Math.hypot(1, pl.pitch); return [pl.o[0] + pl.a[0] * p + pl.d[0] * s + pl.d[0] * pl.pitch * k * up, pl.y0 - s * pl.pitch + k * up, pl.o[1] + pl.a[1] * p + pl.d[1] * s + pl.d[1] * pl.pitch * k * up]; };
  ctx.roofPoint = (id, p, s, up = 0) => pos3(planes.find((q) => q.id === id) || planes[0], p, s, up + LIFT);
  const PATCH = [[0.62, 0.36, 0.28], [0.5, 0.56, 0.6], [0.72, 0.7, 0.6], [0.42, 0.5, 0.44]];   // sheets salvaged from other roofs: oxide red, blue-gray, tan, green
  for (const pl of planes) {
    const ps = pl.poly.map((v) => (v[0] - pl.o[0]) * pl.a[0] + (v[1] - pl.o[1]) * pl.a[1]), pMin = Math.min(...ps), pMax = Math.max(...ps);
    const k = 1 / Math.hypot(1, pl.pitch), N = [pl.d[0] * pl.pitch * k, k, pl.d[1] * pl.pitch * k], cover = WAVE * 10, sub = 8; let sheetI = 0;
    for (let p0 = pMin - r() * 0.3; p0 < pMax; p0 += cover, sheetI++) {
      const pa = Math.max(pMin, p0), pb = Math.min(pMax, p0 + cover + WAVE * 0.75); if (pb - pa < 0.03) continue;
      const full = clip(pl, (pa + pb) / 2); if (!full) continue;
      const nLong = (full[1] - full[0]) / k > 3.3 ? 2 : 1;
      for (let li = 0; li < nLong; li++) {
        const f0 = li / nLong, f1 = (li + 1) / nLong, q = r(), age = Math.min(1, Math.max(0.3, pl.age + (r() - 0.5) * 0.5));
        const tone = q < 0.06 ? [1.05, 1.07, 1.1] : q < 0.2 ? kit.vary(PATCH[Math.floor(r() * 4)], r, 0.08) : kit.vary([0.8, 0.8, 0.78], r, 0.1), uOff = r() * 9, lift = LIFT + (li === 0 && nLong > 1 ? 0.006 : 0) + (sheetI % 2) * 0.0025;
        const cols = Math.max(2, Math.round((pb - pa) / WAVE * sub)), pp = [], nn = [], uu = [], idx = []; let vi = 0;
        for (let j = 0; j <= cols; j++) {
          const p = pa + (pb - pa) * j / cols, s0 = full[0] + (full[1] - full[0]) * f0 - (li > 0 ? 0.11 : 0), s1 = full[0] + (full[1] - full[0]) * f1 + (li === nLong - 1 ? 0.04 + (sheetI % 3) * 0.012 : 0);
          const ph = (p / WAVE) * Math.PI * 2, h = Math.cos(ph) * AMP, dh = -Math.sin(ph) * AMP * Math.PI * 2 / WAVE;
          let nx = N[0] - pl.a[0] * dh, ny = N[1], nz = N[2] - pl.a[1] * dh; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const rows = [s0, (s0 + s1) / 2, s1];
          for (let w = 0; w < 3; w++) { const v = pos3(pl, p, rows[w], lift + h); pp.push(v[0], v[1], v[2]); nn.push(nx, ny, nz); uu.push(p + uOff, w / 2); }
          if (j > 0) for (let w = 0; w < 2; w++) { const a = vi - 3 + w, b = vi + w; idx.push(a, a + 1, b, b, a + 1, b + 1); }
          vi += 3;
          if (j % (sub * 3) === Math.floor(sub / 2) && Math.cos(ph) > 0.3) for (let sy = s0 + 0.12; sy < s1 - 0.05; sy += 0.62) if (r() > 0.05) { const v = pos3(pl, p, sy, lift + AMP + 0.002); screws.push(M(v[0], v[1], v[2], Math.atan(pl.pitch) * pl.d[1], 0, -Math.atan(pl.pitch) * pl.d[0])); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2)); g.setIndex(idx);
        { const i0 = idx[0] * 3, i1 = idx[1] * 3, i2 = idx[2] * 3, ax = pp[i1] - pp[i0], ay = pp[i1 + 1] - pp[i0 + 1], az = pp[i1 + 2] - pp[i0 + 2], bx = pp[i2] - pp[i0], by = pp[i2 + 1] - pp[i0 + 1], bz = pp[i2 + 2] - pp[i0 + 2];
          if ((ay * bz - az * by) * N[0] + (az * bx - ax * bz) * N[1] + (ax * by - ay * bx) * N[2] < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } } }
        B.geo(TIN, g, null, { color: tone, wear: q < 0.06 ? 0.05 : age }); g.dispose();
      }
    }
  }
  { const g = new THREE.CylinderGeometry(0.0085, 0.011, 0.007, 6), m = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.75, metalness: 0.5 }); const im = kit.instances(g, m, screws, null, { cast: false }); im.name = 'roofScrews'; ctx.groups.detail.add(im); }
  // ridge cap on the gable
  const top = LIFT + AMP + 0.012;
  for (const s of [-1, 1]) for (let i = 0, n = 5; i < n; i++) { const z0 = zBn - 0.02 + (zBs - zBn + 0.04) * i / n - (i ? 0.04 : 0), z1 = zBn - 0.02 + (zBs - zBn + 0.04) * (i + 1) / n, g = new THREE.BufferGeometry(), y = rB.y + top + 0.004 * i, dx = s * 0.17, dy = 0.17 * pB + 0.01;
    g.setAttribute('position', new THREE.Float32BufferAttribute([rB.x, y, z0, rB.x, y, z1, rB.x + dx, y - dy, z1, rB.x + dx, y - dy, z0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 2, 0.4, 0, 0.4], 2)); g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    B.geo(TIN, g, null, { color: kit.vary([0.8, 0.8, 0.78], r, 0.08), wear: 0.5 + r() * 0.4 }); g.dispose(); }
  // ---------- eaves: exposed rafter tails and eave boards; rakes; porch ceiling boards ----------
  const tr = (wear) => ({ color: kit.vary(C.trim, r, 0.04), wear: wear + (r() - 0.5) * 0.15, bevel: 0.003, rand: r });
  const eave = (pl, pA0, pB0, sWall, sEdge, o = {}) => {
    const ang = Math.atan(pl.pitch), len = pB0 - pA0, isX = pl.a[0] !== 0, k = 1 / Math.hypot(1, pl.pitch), rot = () => (isX ? [pl.d[1] * ang, 0, 0] : [0, 0, -pl.d[0] * ang]);
    for (let p = pA0 + 0.12; p < pB0 - 0.05; p += 0.61) { const v = pos3(pl, p, (sWall + sEdge) / 2 - 0.03 + (o.tail || 0) / 2, -0.085), l = (sEdge - sWall) / k + 0.1 + (o.tail || 0), rt = rot();
      B.box(W, isX ? 0.045 : l, 0.14, isX ? l : 0.045, M(v[0], v[1], v[2], rt[0], 0, rt[2]), { grain: isX ? 2 : 0, color: kit.vary(0x8f8676, r, 0.12), wear: 0.8, bevel: 0.006, rand: r, shade: [0.8, 1] }); }
    const nb = Math.max(3, Math.round((sEdge - sWall) / k / 0.15));
    for (let q = 0; q < nb; q++) { const sm = sWall + (sEdge - sWall) * (q + 0.5) / nb, n = Math.max(1, Math.round(len / 3.3));
      for (let i = 0; i < n; i++) { const v = pos3(pl, pA0 + len * (i + 0.5) / n, sm, -0.008), rt = rot(), bw = (sEdge - sWall) / nb / k - 0.008; B.box(PAINT, isX ? len / n - 0.004 : bw, 0.018, isX ? bw : len / n - 0.004, M(v[0], v[1], v[2], rt[0], 0, rt[2]), { grain: isX ? 0 : 2, ...tr(o.wear ?? 0.78) }); } }
    if (o.fascia) { const n = Math.max(1, Math.round(len / 3.4)); for (let i = 0; i < n; i++) { const v = pos3(pl, pA0 + len * (i + 0.5) / n, sEdge + 0.004, -0.085); B.box(PAINT, isX ? len / n - 0.003 : 0.022, 0.16, isX ? 0.022 : len / n - 0.003, M(v[0], v[1], v[2]), { grain: isX ? 0 : 2, ...tr(0.75) }); } }
  };
  const PL = Object.fromEntries(planes.map((q) => [q.id, q])), sLen = S.z1 - S.z0;
  eave(PL.A_south, S.x0, P.B.x0 - 0.1, P.A.z1 - S.z0, sLen, { tail: 0.12 });                 // street eave: deep overhang on bare rafter tails
  eave(PL.A_south, S.x0, P.B.x0, 0, P.A.z0 - S.z0, { fascia: false });                        // high edge at the back
  eave(PL.B_east, zBn, zBs, 2.3, 2.75, { fascia: true }); eave(PL.B_west, S.z1 + 0.05, zBs, 2.3, 2.75, { fascia: true });
  eave(PL.B_west, P.B.z1 + 0.1, zBs - 0.4, 0.05, 2.3, { wear: 0.5 }); eave(PL.B_east, P.B.z1 + 0.1, zBs - 0.4, 0.05, 2.3, { wear: 0.5 });   // boarded underside of the porch roof
  const rake = (a, b) => { const { m, len } = kit.span(a, b); B.box(PAINT, 0.024, len + 0.06, 0.16, m.clone().multiply(M(0, 0, -0.09)), { grain: 1, ...tr(0.72) }); B.box(PAINT, 0.04, len + 0.06, 0.045, m.clone().multiply(M(0, 0, -0.025)), { grain: 1, ...tr(0.8) }); };
  const eY = (pl, s) => pl.y0 - s * pl.pitch + LIFT - 0.004;
  rake([S.x0, eY(PL.A_south, sLen), S.z1], [S.x0, S.y0 + LIFT, S.z0]);
  for (const z of [zBs, zBn]) { rake([xBw, eY(PL.B_west, rB.x - xBw), z], [rB.x, rB.y + LIFT, z]); rake([xBe, eY(PL.B_east, xBe - rB.x), z], [rB.x, rB.y + LIFT, z]); }
  { const n = 4; for (let i = 0; i < n; i++) B.box(PAINT, (P.B.x0 - S.x0) / n - 0.004, 0.2, 0.024, M(S.x0 + (P.B.x0 - S.x0) * (i + 0.5) / n, S.y0 - 0.085, S.z0 - 0.004), { grain: 0, ...tr(0.7) }); }   // fascia on the high edge
  for (let q = 0; q < 4; q++) { const v = pos3(PL.A_south, P.A.x0 - (P.A.x0 - S.x0) * (q + 0.5) / 4, sLen / 2, -0.008); B.box(PAINT, (P.A.x0 - S.x0) / 4 - 0.008, 0.018, sLen / Math.cos(Math.atan(S.pitch)), M(v[0], v[1], v[2], Math.atan(S.pitch), 0, 0), { grain: 2, ...tr(0.78) }); }   // west rake soffit
  // ---------- gutter along the street eave, downspout at the west corner ----------
  const GUT = mat.metalPaint(), gutC = () => kit.vary(0xb9b5a6, r, 0.06);
  { const y = eY(PL.A_south, sLen) - 0.03, z = S.z1 + 0.05, x0 = P.B.x0 - 0.3, x1 = S.x0 + 0.05, len = x0 - x1, n = 4;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, -0.095); sh.lineTo(0.07, -0.1); sh.lineTo(0.105, -0.045); sh.lineTo(0.11, 0); sh.lineTo(0.1, 0.004); sh.lineTo(0.096, -0.04); sh.lineTo(0.066, -0.09); sh.lineTo(0.008, -0.087); sh.lineTo(0.008, 0); sh.closePath();
    for (let i = 0; i < n; i++) { const g = new THREE.ExtrudeGeometry(sh, { depth: len / n + 0.01, bevelEnabled: false, steps: 1 }); g.rotateY(Math.PI / 2); B.geo(GUT, g, M(x0 - len * i / n, y - len * i / n / 110 - (i === 2 ? 0.025 : 0), z - 0.055, 0, Math.PI, i === 2 ? 0.012 : 0), { color: gutC(), uvMul: [2, 2] }); g.dispose(); }
    for (let x = x1 + 0.3; x < x0; x += 0.8) B.box(STEEL, 0.02, 0.012, 0.115, M(x, y - 0.006, z), { color: 0x8d8f8a });
    const dx = S.x0 + 0.25, pts = [[dx, y - 0.14, z], [dx, y - 0.34, z], [P.A.x0 - 0.075, 5.25, P.A.z1 + 0.09], [P.A.x0 - 0.075, 0.38, P.A.z1 + 0.09], [P.A.x0 - 0.3, 0.16, P.A.z1 + 0.4]];
    for (let i = 0; i < pts.length - 1; i++) { const { m, len: l } = kit.span(pts[i], pts[i + 1]); B.box(GUT, 0.075, l + 0.03, 0.055, m, { color: gutC(), bevel: 0.008, grain: 1 }); }
    for (const yy of [1.2, 2.6, 4.2]) B.box(STEEL, 0.095, 0.02, 0.07, M(P.A.x0 - 0.075, yy, P.A.z1 + 0.09), { color: 0x8d8f8a }); }
}
