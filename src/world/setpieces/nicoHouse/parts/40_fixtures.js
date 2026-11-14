// Nico's house, part 40: exterior fixtures and the lower level. White lattice panels, the storage-room wall with its dark
// door, surfboard, breaker panel, hose on a hook; meter, service mast, weatherhead, service drop to the power pole;
// satellite dish, turbine roof vent, AC condenser on a raised stand, propane tank, outdoor shower, wind chime.
export const order = 40;

export function build(ctx) {
  const { THREE, kit, plan: P, mat, col } = ctx, B = ctx.ext, D = ctx.detail, M = kit.M, C = P.colors, F = P.F, r = kit.rng(4040);
  const PAINT = mat.paint({ peel: 'a', fade: 0.28 }), PEEL = mat.paint({ peel: 'b', fade: 0.5, scale: 0.8 }), W = mat.wood(), ST = mat.steel(), MP = mat.metalPaint(), RUB = mat.rubber(), girBot = 2.44;
  const white = (wr) => ({ color: kit.vary(C.lattice, r, 0.04), wear: wr ?? 0.5 + r() * 0.35, bevel: 0.002, rand: r });
  // ---------- lattice panel between two points (diagonal strips, two layers, framed) ----------
  const lattice = (ax, az, bx, bz, y0 = 0.12, y1 = girBot - 0.02, o = {}) => {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), h = y1 - y0, base = M(ax, y0, az, 0, ry, 0), L = (x, y, z, rz = 0) => base.clone().multiply(M(x, y, z, 0, 0, rz));
    const sp = 0.115 * Math.SQRT2;
    for (const s of [-1, 1]) for (let c = -h; c < len; c += sp) { // strip from (c,0) rising at 45 deg (s=1) or from (c+h,0) falling (s=-1), clipped to the frame
      let xa = s > 0 ? c : c + h, ya = 0, xb = s > 0 ? c + h : c, yb = h;
      if (xa < 0) { ya += (0 - xa) * 1; xa = 0; } if (xa > len) { ya += (xa - len); xa = len; } if (xb > len) { yb -= (xb - len); xb = len; } if (xb < 0) { yb -= (0 - xb); xb = 0; }
      const l = Math.hypot(xb - xa, yb - ya); if (l < 0.08 || r() < (o.missing ?? 0.02)) continue;
      B.box(PEEL, l, 0.038, 0.007, L((xa + xb) / 2, (ya + yb) / 2, s * 0.004, Math.atan2(yb - ya, xb - xa)), { grain: 0, ...white(), bevel: 0 });
    }
    for (const x of [0.02, len - 0.02]) B.box(PEEL, 0.04, h, 0.03, L(x, h / 2, 0), { grain: 1, ...white() }); for (const y of [0.02, h - 0.02]) B.box(PEEL, len, 0.04, 0.03, L(len / 2, y, 0), { grain: 0, ...white() });
    col.box((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, len, h, 0.08, { ry, tag: 'lattice' });
  };
  lattice(-6.25, 2.8, -3.75, 2.8); lattice(-8.3, 2.8, -6.55, 2.8, 0.12, girBot - 0.02, { missing: 0.06 });
  // ---------- storage-room wall under the main block (middle bay front), dark door, light, breaker panel, hose, surfboard ----------
  { const z = 2.8, xa = -3.5, xb = -0.95, y0 = 0.06, y1 = girBot;
    for (let x = xa; x < xb - 0.02; x += 0.185) { if (x > -2.62 && x < -1.72) { B.box(PAINT, 0.18, y1 - 2.16, 0.02, M(x + 0.09, (y1 + 2.16) / 2, z), { grain: 1, color: kit.vary(C.body, r, 0.06), wear: 0.5, rand: r }); continue; }
      B.box(PAINT, 0.18, y1 - y0, 0.02, M(x + 0.09, (y0 + y1) / 2, z + (Math.round(x * 9) % 2) * 0.004, 0, 0, (r() - 0.5) * 0.003), { grain: 1, color: kit.vary(C.body, r, 0.06), wear: [0.7, 0.25 + r() * 0.2], rand: r, bevel: 0.003 }); }
    const dx = -2.17; // door: dark brown plank door with strap hinges and a hasp
    for (let k = 0; k < 5; k++) B.box(PEEL, 0.166, 2.04, 0.03, M(dx - 0.34 + k * 0.17, 1.1, z + 0.02), { grain: 1, color: kit.vary(0x3b2c22, r, 0.1), wear: 0.3 + r() * 0.3, bevel: 0.004, rand: r });
    for (const y of [0.4, 1.8]) { B.box(PEEL, 0.8, 0.1, 0.022, M(dx, y, z + 0.045), { grain: 0, color: 0x34271e, wear: 0.4, bevel: 0.004 }); B.box(mat.rust(), 0.5, 0.035, 0.006, M(dx - 0.15, y, z + 0.06), { color: 0x9a8a80 }); }
    B.box(PEEL, Math.hypot(0.8, 1.3), 0.09, 0.022, M(dx, 1.1, z + 0.045, 0, 0, Math.atan2(1.3, 0.8)), { grain: 0, color: 0x34271e, wear: 0.4, bevel: 0.004 });
    for (const s of [-1, 1]) B.box(PAINT, 0.09, 2.18, 0.03, M(dx + s * 0.475, 1.12, z + 0.02), { grain: 1, color: kit.vary(C.trim, r, 0.03), wear: 0.7, bevel: 0.004, rand: r }); B.box(PAINT, 1.06, 0.1, 0.03, M(dx, 2.22, z + 0.02), { grain: 0, color: C.trim, wear: 0.6, bevel: 0.004 });
    B.box(mat.chrome(), 0.03, 0.1, 0.03, M(dx + 0.33, 1.05, z + 0.05), { color: 0x6a655c }); B.box(mat.rust(), 0.09, 0.04, 0.01, M(dx + 0.37, 1.2, z + 0.045), { color: 0x9a8a80 });
    // breaker panel + meter + conduit
    B.box(MP, 0.36, 0.52, 0.11, M(-3.15, 1.45, z + 0.065), { color: 0x8f9492, bevel: 0.008 }); B.box(MP, 0.3, 0.44, 0.012, M(-3.15, 1.45, z + 0.125), { color: 0x9a9f9c, bevel: 0.004 });
    B.box(mat.art('panelLabel', 128, 64, (g, w, h) => { g.fillStyle = '#d9d6c9'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = kit.font(11); g.fillText('MAIN  100A  120/240V', 6, 16); g.font = kit.font(8, 400); g.fillText('DANGER: DISCONNECT POWER', 6, 32); g.fillText('BEFORE SERVICING', 6, 44); g.fillStyle = '#b3261e'; g.fillRect(6, 50, 116, 6); }), 0.16, 0.08, 0.002, M(-3.15, 1.55, z + 0.133), {});
    B.cyl(MP, 0.085, 0.085, 0.1, M(-3.15, 2.0, z + 0.07, Math.PI / 2), { color: 0x8f9492, seg: 16 }); B.cyl(mat.glass(), 0.075, 0.075, 0.05, M(-3.15, 2.0, z + 0.13, Math.PI / 2), { seg: 16 });
    B.cyl(ST, 0.02, 0.02, 0.9, M(-3.15, 0.75, z + 0.05), { color: 0x9a9c98, seg: 8 }); B.cyl(ST, 0.02, 0.02, 0.35, M(-3.15, 2.26, z + 0.05), { color: 0x9a9c98, seg: 8 });
    // jelly-jar light by the door
    B.box(MP, 0.11, 0.11, 0.05, M(dx + 0.72, 1.95, z + 0.04), { color: 0x2c2c2a, bevel: 0.006 }); B.cyl(mat.glass(), 0.05, 0.045, 0.13, M(dx + 0.72, 1.86, z + 0.1), { seg: 10 }); B.geo(mat.emissive(0xffd9a0, 2, 'jar'), new THREE.SphereGeometry(0.03, 8, 6), M(dx + 0.72, 1.87, z + 0.1), {});
    const lt = ctx.addLight({ id: 'carport_door', pos: [dx + 0.72, 1.85, z + 0.35], color: 0xffd39a, intensity: 45, range: 9, on: false }); ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12; lt.on = t < 6.3 || t > 18.3; });
    // garden hose on a hook
    B.box(ST, 0.03, 0.03, 0.14, M(dx + 0.75, 1.25, z + 0.08), { color: 0x777a76 }); for (let k = 0; k < 5; k++) D.geo(RUB, new THREE.TorusGeometry(0.17 + k * 0.004, 0.011, 6, 22), M(dx + 0.75 + (r() - 0.5) * 0.01, 1.07, z + 0.06 + k * 0.022, 0.06 * (r() - 0.5), 0, 0, 1, 1.25, 1), { color: kit.vary(0x2f6b3c, r, 0.08) });
    // cream surfboard with a stripe, leaning by the door
    { const sh = new THREE.Shape(), n = 40; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2, c = Math.cos(t), s2 = Math.sin(t), wdt = 0.265 * Math.sign(c) * Math.abs(c) ** 0.75, y = 1.03 * s2 * (s2 > 0 ? 1 : 0.94); i ? sh.lineTo(wdt, y) : sh.moveTo(wdt, y); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 3, curveSegments: 20 });
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.56 + 0.5, uv.getY(i) / 2.1 + 0.5);
      const SB = mat.art('surfboard', 128, 512, (g2, w, h) => { g2.fillStyle = '#e8dfc4'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#b5523a'; g2.fillRect(w / 2 - 7, 0, 5, h); g2.fillStyle = '#3f7f86'; g2.fillRect(w / 2 + 3, 0, 4, h); const q = kit.rng(6); for (let i = 0; i < 500; i++) { g2.fillStyle = `rgba(110,95,70,${q() * 0.12})`; g2.beginPath(); g2.arc(q() * w, q() * h, 1 + q() * 5, 0, 7); g2.fill(); } g2.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 40; i++) g2.fillRect(q() * w, h * 0.3 + q() * h * 0.4, 6 + q() * 14, 2); }, { rough: 0.35 });
      B.geo(SB, g, M(-3.72, 1.1, z + 0.2, -0.16, 0.1, 0.03), {}); g.dispose(); col.box(-3.72, 1.0, z + 0.2, 0.6, 2.0, 0.35, { tag: 'prop' }); }
    col.box((xa + xb) / 2, 1.25, z - 0.03, xb - xa, 2.4, 0.12, { tag: 'wall' });
  }
  // ---------- power: service mast through the eave, weatherhead, service drop to the pole on the street side ----------
  { const mx = -6.05, mz = P.A.z1 + 0.06; B.cyl(ST, 0.03, 0.03, 4.4, M(mx, 4.6, mz), { color: 0x9a9c98, seg: 10 }); B.cyl(ST, 0.045, 0.03, 0.12, M(mx, 6.85, mz), { color: 0x8a8c88, seg: 10 }); B.geo(ST, new THREE.SphereGeometry(0.055, 10, 6, 0, 6.3, 0, 1.6), M(mx, 6.9, mz + 0.02, 0.5, 0, 0), { color: 0x8a8c88 });
    for (const y of [3.4, 4.6, 5.5]) B.box(ST, 0.1, 0.025, 0.02, M(mx, y, mz - 0.03), { color: 0x8a8c88 });
    const px = -21.5, pz = 15.5, PT = mat.wood(); B.cyl(PT, 0.11, 0.15, 9.6, M(px, 4.3, pz, 0.012, 0, -0.02), { seg: 12, hseg: 4, color: 0x6d5c48, wear: 0.9 }); B.box(PT, 2.2, 0.1, 0.12, M(px, 8.3, pz, 0, 0.5, 0), { grain: 0, color: 0x6d5c48, wear: 0.8, bevel: 0.006 });
    for (const s of [-0.95, -0.35, 0.35, 0.95]) B.cyl(mat.ceramic(), 0.03, 0.045, 0.1, M(px + Math.cos(0.5) * s, 8.4, pz - Math.sin(0.5) * s), { color: 0x6b7f8a, seg: 10 });
    B.cyl(MP, 0.2, 0.2, 0.62, M(px + 0.34, 7.3, pz + 0.1), { color: 0x7f8587, seg: 16 }); B.cyl(mat.ceramic(), 0.03, 0.04, 0.16, M(px + 0.34, 7.7, pz + 0.1), { color: 0x8a6a4a, seg: 8 }); col.cyl(px, 2, pz, 0.17, 4, { tag: 'pole' });
    const cat = (a, b, sag, rr = 0.009) => { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]); } B.tube(RUB, pts, rr, { seg: 5, color: 0x1a1a19, steps: 28 }); };
    cat([mx, 6.82, mz + 0.05], [px + 0.2, 7.9, pz], 0.75, 0.012); for (const [s, far] of [[-0.95, [-70, 8.4, 30]], [0.95, [-70, 8.4, 32]], [0.35, [20, 8.4, 60]], [-0.35, [20, 8.4, 58.5]]]) cat([px + Math.cos(0.5) * s, 8.45, pz - Math.sin(0.5) * s], far, 1.6, 0.007); }
  // ---------- roof: satellite dish, turbine vent, plumbing vent stack ----------
  { const p = ctx.roofPoint?.('A_south', -5.2, 1.2, 0.02) || [-5.2, 6.7, 1.0]; B.cyl(ST, 0.02, 0.02, 0.5, M(p[0], p[1] + 0.25, p[2]), { color: 0x9a9c98, seg: 8 }); B.box(ST, 0.16, 0.012, 0.16, M(p[0], p[1] + 0.01, p[2], 0.46, 0, 0), { color: 0x8a8c88 });
    const dg = new THREE.SphereGeometry(0.62, 22, 8, 0, 6.283, 0, 0.52); B.geo(mat.metalPaint(), dg, M(p[0], p[1] + 0.52, p[2] + 0.5, -1.15, 0.5, 0), { color: 0xcfcfc8 }); dg.dispose();
    B.rod(ST, [p[0], p[1] + 0.45, p[2]], [p[0] - 0.28, p[1] + 0.62, p[2] + 0.5], 0.01, { color: 0x8a8c88 }); B.box(mat.plastic(), 0.05, 0.05, 0.09, M(p[0] - 0.3, p[1] + 0.64, p[2] + 0.52), { color: 0xd8d8d0, bevel: 0.008 });
    const tv = [4.3, P.ridgeB.y + 0.04, 5.6]; B.cyl(ST, 0.15, 0.17, 0.22, M(tv[0], tv[1] + 0.11, tv[2]), { color: 0xa9aca8, seg: 16 }); const tg = new THREE.SphereGeometry(0.2, 20, 10); const tp = tg.attributes.position; for (let i = 0; i < tp.count; i++) { const a = Math.atan2(tp.getZ(i), tp.getX(i)), k = 1 + 0.07 * Math.sin(a * 20 + tp.getY(i) * 9); tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); } tg.computeVertexNormals();
    const turb = new THREE.Mesh(tg, ST); turb.position.set(tv[0], tv[1] + 0.36, tv[2]); turb.castShadow = true; tg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(tp.count * 3).fill(0.72), 3)); ctx.groups.dyn.add(turb); ctx.updaters.push((dt) => { turb.rotation.y += dt * 2.2; });
    const vp = ctx.roofPoint?.('A_north', 0.6, 1.4, 0) || [0.6, 6.5, -1.6]; B.cyl(mat.plastic(), 0.04, 0.04, 0.5, M(vp[0], vp[1] + 0.2, vp[2]), { color: 0xd9d6cc, seg: 10 }); }
  // ---------- east side: AC condenser on a raised stand, propane tank; outdoor shower under the bay deck ----------
  { const ax = 9.1, az = -1.2, ay = 1.45; for (const [dx, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) B.box(W, 0.09, ay, 0.09, M(ax + dx, ay / 2, az + dz), { grain: 1, color: kit.vary(P.colors.pile, r, 0.1), wear: 0.7, bevel: 0.006, rand: r });
    for (let k = 0; k < 6; k++) B.box(W, 1.0, 0.036, 0.14, M(ax, ay + 0.018, az - 0.38 + k * 0.152), { grain: 0, color: kit.vary(P.colors.deck, r, 0.1), wear: 0.6, bevel: 0.004, rand: r });
    B.box(MP, 0.82, 0.74, 0.82, M(ax, ay + 0.41, az), { color: 0xb9b6a8, bevel: 0.03 }); const FIN = mat.art('acfins', 256, 256, (g, w, h) => { g.fillStyle = '#5d605c'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 4) { g.fillStyle = x % 8 ? '#3c3f3c' : '#8a8d88'; g.fillRect(x, 0, 2, h); } g.fillStyle = 'rgba(120,70,40,0.35)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, h * 0.6 + Math.random() * h * 0.4, 3, 20); }, { rough: 0.6 });
    for (const [dx, dz, ry] of [[0, 0.412, 0], [0.412, 0, Math.PI / 2], [0, -0.412, Math.PI], [-0.412, 0, -Math.PI / 2]]) B.box(FIN, 0.7, 0.56, 0.004, M(ax + dx, ay + 0.42, az + dz, 0, ry, 0), {});
    B.cyl(MP, 0.3, 0.3, 0.02, M(ax, ay + 0.79, az), { color: 0x4c4f4b, seg: 20 }); B.cyl(RUB, 0.012, 0.012, 1.9, M(ax - 1.3, ay + 0.3, az, 0, 0, Math.PI / 2), { color: 0x222, seg: 6 }); col.box(ax, 1.1, az, 1.0, 2.2, 1.0, { tag: 'prop' });
    const tx = 8.9, tz = 3.2; B.cyl(MP, 0.3, 0.3, 1.0, M(tx, 0.62, tz, 0, 0, Math.PI / 2), { color: 0xe4e2d8, seg: 20 }); for (const s of [-1, 1]) B.geo(MP, new THREE.SphereGeometry(0.3, 18, 10), M(tx + s * 0.5, 0.62, tz, 0, 0, 0, 0.55, 1, 1), { color: 0xe0ded4 });
    B.cyl(MP, 0.11, 0.11, 0.1, M(tx, 0.96, tz), { color: 0xcfcdc2, seg: 12 }); for (const s of [-0.35, 0.35]) B.box(mat.concrete(), 0.16, 0.3, 0.5, M(tx + s, 0.15, tz), { bevel: 0.01, color: 0xc9c3b4 }); col.box(tx, 0.5, tz, 1.5, 1.0, 0.7, { tag: 'prop' });
    const sx = 5.9, sz = -5.9; B.cyl(ST, 0.012, 0.012, 2.1, M(sx, 1.1, sz), { color: 0xb08a5a, seg: 8 }); B.rod(ST, [sx, 2.12, sz], [sx - 0.3, 2.2, sz], 0.012, { color: 0xb08a5a }); B.cyl(mat.chrome(), 0.02, 0.07, 0.07, M(sx - 0.34, 2.17, sz, 0, 0, -1.2), { color: 0xc8c8c4, seg: 14 });
    for (const y of [1.1, 1.22]) B.cyl(mat.chrome(), 0.03, 0.03, 0.05, M(sx - 0.03, y, sz, 0, 0, Math.PI / 2), { color: y > 1.2 ? 0xb3261e : 0x2a5fa8, seg: 8 }); for (let k = 0; k < 6; k++) B.box(W, 0.9, 0.03, 0.12, M(sx - 0.45, 0.06, sz - 0.33 + k * 0.135), { grain: 0, color: kit.vary(P.colors.deck, r, 0.1), wear: 0.8, bevel: 0.004, rand: r });
    lattice(4.5, -6.22, 6.3, -6.22, 0.12, 2.2); B.box(mat.fabric('terry_cloth', { rep: 0.3 }), 0.5, 0.75, 0.02, M(5.3, 1.75, -6.16, 0.05, 0, 0), { color: 0xe8d9a0 }); }
  // wind chime under the porch roof (sways)
  { const g = new THREE.Group(); g.position.set(2.9, 5.3, 7.55); const bt = kit.batch('chime'); bt.cyl(W, 0.06, 0.06, 0.012, M(0, -0.12, 0), { seg: 12, color: 0x9a7a52 }); bt.cyl(RUB, 0.002, 0.002, 0.12, M(0, -0.06, 0), { seg: 4, color: 0x222222 });
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283, l = 0.22 + k * 0.035; bt.cyl(ST, 0.007, 0.007, l, M(Math.cos(a) * 0.045, -0.16 - l / 2, Math.sin(a) * 0.045), { seg: 6, color: 0xc9c9c2 }); } bt.cyl(W, 0.025, 0.025, 0.008, M(0, -0.3, 0), { seg: 10, color: 0x9a7a52 }); bt.box(W, 0.05, 0.09, 0.004, M(0, -0.5, 0), { color: 0x9a7a52 });
    bt.build(g); ctx.groups.dyn.add(g); ctx.updaters.push(() => { const t = performance.now() / 1000; g.rotation.x = Math.sin(t * 1.3) * 0.06; g.rotation.z = Math.sin(t * 0.9 + 1) * 0.07; }); }
}
