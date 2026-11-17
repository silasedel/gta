// Nico's house, part 22: everything that fills the wall openings. Double-hung windows built stick by stick (jambs, sashes,
// muntins, glass, screens, sills, casings inside and out), mini-blinds and curtains, Bahama and board-and-batten storm
// shutters, gable louver vents, and the working doors: front door + hooked-back screen door, the sliding deck door,
// the half-glazed back door and the two interior doors. Doors are hinged objects with interactions and colliders.
export const order = 22;

export function build(ctx) {
  // mini-blind panel material (r2-keys): 16 slats per texture repeat, each a soft cylinder-shaded strip with a thin dark gap; mipmaps
  // average it to the blind's mean tone at distance (no sub-pixel slat lines)
  let blindM = null; const blindMat = () => blindM || (blindM = (() => { const T3 = ctx.THREE, t = ctx.kit.canvasTex(32, 256, (g, w, h) => { const p = h / 16;
      for (let k = 0; k < 16; k++) { const y = k * p, lg = g.createLinearGradient(0, y, 0, y + p); lg.addColorStop(0, '#f4f1e8'); lg.addColorStop(0.45, '#e6e1d4'); lg.addColorStop(0.82, '#bdb7a8'); lg.addColorStop(0.9, '#5c574e'); lg.addColorStop(1, '#3a3631');
        g.fillStyle = lg; g.fillRect(0, y, w, p); } }, { srgb: true });
    t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
    const m = new T3.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.42, metalness: 0, side: T3.DoubleSide }); m.name = 'nh:miniblind'; m.userData.uvScale = 0; return ctx.kit.setIndirect(m); })());
  const { THREE, kit, plan: P, mat, col } = ctx, B = ctx.ext, I = ctx.int, M = kit.M, C = P.colors, F = P.F, T = P.wallT, imat = ctx.imat;
  const r = kit.rng(303), PAINT = mat.paint({ peel: 'a', fade: 0.28 }), PEEL = mat.paint({ peel: 'b', fade: 0.5, scale: 0.8 }), IPAINT = imat.paint({ peel: 'a', fade: 0.1 });
  const GLASS = mat.glass(), STEEL = mat.steel(), ISTEEL = imat.steel(), W = mat.wood();
  // insect screen (r2-keys, item 10, r2-look finding): the 4 px wire grid went sub-pixel past a few meters and alphaTest cut its mips
  // into a crawling dot field; a real screen reads as an even dark veil from more than 2 m, so it is one flat dark tint
  const SCREEN = (() => { const m = new THREE.MeshStandardMaterial({ color: 0x15191b, transparent: true, opacity: 0.4, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }); m.userData.uvScale = 0; m.name = 'screen'; return m; })();
  const FROST = (() => { const m = new THREE.MeshPhysicalMaterial({ color: 0xdfe9e6, transparent: true, opacity: 0.88, roughness: 0.55, metalness: 0, bumpMap: kit.microTex(), bumpScale: 1.5, side: THREE.DoubleSide }); m.userData.uvScale = 0.12; m.name = 'frost'; return m; })();
  const trimC = (k = 0.03) => kit.vary(C.trim, r, k), accC = (k = 0.05) => kit.vary(C.accent, r, k);
  const tr = (wear, o = {}) => ({ color: trimC(), wear, bevel: 0.003, rand: r, ...o });

  // ---------- windows ----------
  const STYLE = { W10: { blind: 0.45 }, W1: { blind: 0.35 }, W2: { cafe: 0xd8c8a0, open: 0.22 }, W3: { blind: 0.55 }, W4: { blind: 0.2, open: 0.3 }, W5: { valance: 0xc8553a, open: 0.18 }, W6: { curtain: 0x7c93a6 }, W7: { blind: 0.7 }, W8: {}, W9: {} };
  const sash = (bt, m, wm, u0, u1, y0, y1, o, vert, glassM, wear) => { // one sash: stiles, rails, muntin(s), glass
    const s = 0.048, t = 0.032, uc = (u0 + u1) / 2, yc = (y0 + y1) / 2;
    for (const u of [u0 + s / 2, u1 - s / 2]) bt.box(m, s, y1 - y0, t, wm(u, yc, o), { grain: 1, ...tr(wear) });
    for (const y of [y0 + s / 2, y1 - s / 2]) bt.box(m, u1 - u0 - 2 * s, s, t, wm(uc, y, o), { grain: 0, ...tr(wear) });
    for (let i = 1; i <= vert; i++) bt.box(m, 0.02, y1 - y0 - 2 * s, t * 0.8, wm(u0 + (u1 - u0) * i / (vert + 1), yc, o), { grain: 1, ...tr(wear) });
    bt.box(glassM, u1 - u0 - 2 * s + 0.01, y1 - y0 - 2 * s + 0.01, 0.004, wm(uc, yc, o), { uvS: 0 });
  };
  for (const o of Object.values(ctx.openings)) {
    if (o.kind !== 'window') continue;
    const w = o.wall, wm = w.wm, wear = Math.min(0.85, w.wear + 0.12), st = STYLE[o.id] || {}, { u0, u1, y0, y1 } = o, uc = o.u, h = o.h, wd = o.w;
    const depth = T + 0.03, oc = -T / 2 + 0.008;
    // jamb liner
    for (const u of [u0 + 0.011, u1 - 0.011]) B.box(PAINT, 0.022, h, depth, wm(u, (y0 + y1) / 2, oc), { grain: 1, ...tr(wear) });
    B.box(PAINT, wd, 0.022, depth, wm(uc, y1 - 0.011, oc), { grain: 0, ...tr(wear * 0.6) }); B.box(PAINT, wd, 0.022, depth, wm(uc, y0 + 0.011, oc), { grain: 0, ...tr(Math.min(1, wear + 0.25)) });
    // exterior casing, drip cap, sloped sill with horns, apron
    for (const s of [-1, 1]) B.box(PAINT, 0.09, h + 0.02, 0.024, wm(uc + s * (wd / 2 + 0.035), (y0 + y1) / 2, 0.03), { grain: 1, ...tr([Math.min(1, wear + 0.3), wear]) });
    B.box(PAINT, wd + 0.2, 0.11, 0.024, wm(uc, y1 + 0.045, 0.03), { grain: 0, ...tr(wear * 0.7) });
    B.box(PAINT, wd + 0.25, 0.022, 0.06, wm(uc, y1 + 0.108, 0.04, 0.22, 0, 0), { grain: 0, ...tr(Math.min(1, wear + 0.2)) });
    B.box(PAINT, wd + 0.24, 0.042, 0.11, wm(uc, y0 - 0.012, 0.04, 0.16, 0, 0), { grain: 0, ...tr(Math.min(1, wear + 0.35)), bevel: 0.006 });
    B.box(PAINT, wd + 0.16, 0.075, 0.02, wm(uc, y0 - 0.075, 0.028), { grain: 0, ...tr(Math.min(1, wear + 0.3)) });
    // interior casing, stool and apron
    for (const s of [-1, 1]) I.box(IPAINT, 0.085, h + 0.02, 0.02, wm(uc + s * (wd / 2 + 0.032), (y0 + y1) / 2, -T - 0.01), { grain: 1, color: trimC(0.02), wear: 0.05, bevel: 0.003, rand: r });
    I.box(IPAINT, wd + 0.19, 0.1, 0.02, wm(uc, y1 + 0.04, -T - 0.01), { grain: 0, color: trimC(0.02), wear: 0.04, bevel: 0.003, rand: r });
    I.box(IPAINT, wd + 0.22, 0.028, 0.1, wm(uc, y0 - 0.004, -T - 0.035), { grain: 0, color: trimC(0.02), wear: 0.12, bevel: 0.006, rand: r });
    I.box(IPAINT, wd + 0.15, 0.07, 0.018, wm(uc, y0 - 0.055, -T - 0.009), { grain: 0, color: trimC(0.02), wear: 0.06, bevel: 0.003, rand: r });
    o.stool = (du = 0) => w.pt(uc + du, y0 + 0.011, -T - 0.045);       // where things can sit on the inside sill
    // sashes
    const gm = o.frosted ? FROST : GLASS, units = o.mullion ? [[u0 + 0.022, uc - 0.035], [uc + 0.035, u1 - 0.022]] : [[u0 + 0.022, u1 - 0.022]];
    if (o.mullion) B.box(PAINT, 0.07, h - 0.04, depth, wm(uc, (y0 + y1) / 2, oc), { grain: 1, ...tr(wear) });
    for (const [a, b] of units) {
      if (h < 1.0) { sash(B, PAINT, wm, a, b, y0 + 0.022, y1 - 0.022, -0.05, o.w > 0.8 ? 1 : 0, gm, wear); continue; }   // small fixed / awning windows
      const mid = (y0 + y1) / 2, up = (st.open || 0) * (units.length > 1 && a > uc ? 0 : 1);
      sash(B, PAINT, wm, a, b, mid - 0.024, y1 - 0.022, -0.04, 1, gm, wear);
      sash(B, PAINT, wm, a, b, y0 + 0.022 + up, mid + 0.024 + up, -0.078, 1, gm, wear);
      if (up > 0 || o.id === 'W6' || o.id === 'W7') { // insect screen over the lower half, aluminum frame
        const s0 = y0 + 0.03, s1 = mid + 0.01;
        B.box(SCREEN, b - a - 0.01, s1 - s0, 0.002, wm((a + b) / 2, (s0 + s1) / 2, -0.012), {});
        for (const u of [a + 0.008, b - 0.008]) B.box(STEEL, 0.016, s1 - s0, 0.012, wm(u, (s0 + s1) / 2, -0.012), { color: 0xa9adab });
        for (const y of [s0, s1]) B.box(STEEL, b - a, 0.016, 0.012, wm((a + b) / 2, y, -0.012), { color: 0xa9adab });
      }
    }
    // inside: mini-blinds, cafe curtains, valance or curtains
    if (st.blind != null) {
      const drop = h * (1 - st.blind * 0.75), n = Math.floor(drop / 0.021), IP = imat.plasticGloss();
      I.box(ISTEEL, wd - 0.03, 0.035, 0.04, wm(uc, y1 - 0.02, -T + 0.03), { color: 0xe6e2d6 });
      // r2-keys (user review item 10): the slats were 1.2 mm boxes every 21 mm, far thinner than a pixel past a few meters, so the
      // blinds read as dotted, crawling lines; now one panel with a mipmapped slat texture (shaded curved slats, dark gaps),
      // solid at every distance. Same r() sequence as the old per-slat loop.
      for (let i = 0; i < n; i++) { r(); r(); r(); r(); r(); }
      { const bh = n * 0.021, g = new THREE.PlaneGeometry(wd - 0.05, bh); I.geo(blindMat(), g, wm(uc, y1 - 0.045 - bh / 2 + 0.0105, -T + 0.03), { color: 0xe9e4d6, uvMul: [1, n / 16] }); g.dispose(); }
      I.box(ISTEEL, wd - 0.04, 0.018, 0.026, wm(uc, y1 - 0.05 - n * 0.021, -T + 0.03), { color: 0xe6e2d6 });
      I.cyl(IP, 0.004, 0.004, drop * 0.7, wm(u0 + 0.06, y1 - 0.05 - drop * 0.35, -T - 0.005), { color: 0xf0ede4, seg: 5 });
      // stack of raised slats under the head rail
      I.box(IP, wd - 0.05, st.blind * 0.05 + 0.005, 0.024, wm(uc, y1 - 0.04 - (st.blind * 0.05) / 2, -T + 0.031), { color: 0xe4dfd0 });
    }
    const drape = (ua, ub, ya, yb, hex, folds, o2) => { // gathered fabric panel with real folds
      const FAB = imat.fabric('cotton_jersey', { rep: 0.3, side: THREE.DoubleSide }), seg = folds * 6, g = new THREE.PlaneGeometry(ub - ua, yb - ya, seg, 6), pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), t = (y / (yb - ya) + 0.5); pa.setZ(i, Math.sin((x / (ub - ua) + 0.5) * folds * 6.283 + 1) * 0.022 * (0.45 + 0.55 * (1 - t)) + Math.sin(x * 9 + y * 3) * 0.004); }
      g.computeVertexNormals();
      I.geo(FAB, g, wm((ua + ub) / 2, (ya + yb) / 2, o2), { color: hex, uvMul: [(ub - ua) / 0.3 * 1.4, (yb - ya) / 0.3] });
    };
    const rod = (y, o2 = -T - 0.05) => { I.cyl(ISTEEL, 0.008, 0.008, wd + 0.24, wm(uc, y, o2, 0, 0, Math.PI / 2), { color: 0x6d5a3c, seg: 8 }); for (const s of [-1, 1]) I.box(ISTEEL, 0.012, 0.03, 0.055, wm(uc + s * (wd / 2 + 0.1), y, o2 + 0.025), { color: 0x6d5a3c }); };
    if (st.cafe) { rod((y0 + y1) / 2 + 0.02); drape(u0 - 0.03, uc - 0.02, y0 + 0.02, (y0 + y1) / 2 + 0.02, st.cafe, 5, -T - 0.05); drape(uc + 0.06, u1 + 0.03, y0 + 0.02, (y0 + y1) / 2 + 0.02, kit.mul(st.cafe, 0.96), 4, -T - 0.05); }
    if (st.valance) { rod(y1 + 0.03); drape(u0 - 0.06, u1 + 0.06, y1 - 0.26, y1 + 0.035, st.valance, 9, -T - 0.05); }
    if (st.curtain) { rod(y1 + 0.1, -T - 0.07); drape(u0 - 0.16, u0 + 0.34, y0 - 0.25, y1 + 0.1, st.curtain, 5, -T - 0.07); drape(u1 - 0.52, u1 + 0.16, y0 - 0.25, y1 + 0.1, kit.mul(st.curtain, 0.94), 6, -T - 0.07); }

    // ---- storm shutters ----
    if (o.shutter === 'bahama') {
      const pw = wd + 0.2, ph = h + 0.14, ang = 0.52 + (r() - 0.5) * 0.12, hingeY = y1 + 0.095, hm = wm(uc, hingeY, 0.075, -ang, 0, 0), L = (x, y, z, rx = 0) => hm.clone().multiply(M(x, y, z, rx, 0, 0));
      const sw = Math.min(0.95, w.wear + 0.3), c0 = accC(0.06), pc = (wr) => ({ color: kit.vary(c0, r, 0.04), wear: wr ?? sw + (r() - 0.5) * 0.2, bevel: 0.003, rand: r });
      for (const s of [-1, 1]) B.box(PEEL, 0.058, ph, 0.03, L(s * (pw / 2 - 0.029), -ph / 2, 0), { grain: 1, ...pc() });
      for (const y of [-0.03, -ph / 2, -ph + 0.03]) B.box(PEEL, pw - 0.116, 0.06, 0.03, L(0, y, 0), { grain: 0, ...pc() });
      for (let y = -0.085; y > -ph + 0.07; y -= 0.043) { if (Math.abs(y + ph / 2) < 0.05) continue; if (r() < 0.02) continue; B.box(PEEL, pw - 0.118, 0.012, 0.05, L(0, y, 0, -0.62 + (r() - 0.5) * 0.06), { grain: 0, ...pc(), wear: sw, bevel: 0.002 }); }   // r2-keys: 12 mm blades, one paint coat per leaf (7 mm blades with per-blade peel read dotted)
      B.box(STEEL, pw + 0.04, 0.02, 0.012, wm(uc, hingeY + 0.012, 0.062), { color: 0x8c8f8d });                                     // continuous hinge
      for (const s of [-1, 1]) { const a = w.pt(uc + s * (wd / 2 + 0.07), y0 + 0.25, 0.045), pb = new THREE.Vector3(s * (pw / 2 - 0.03), -ph + 0.08, -0.015).applyMatrix4(hm); B.rod(STEEL, [a.x, a.y, a.z], [pb.x, pb.y, pb.z], 0.006, { color: 0x77706a, seg: 5 }); }
    }
    if (o.shutter === 'side') {
      for (const s of [-1, 1]) { // board-and-batten leaves folded back flat against the siding
        const sw = wd / 2 - 0.01, sag = s > 0 ? -0.022 : 0.006, hm = wm(uc + s * (wd / 2 + 0.105 + sw / 2), (y0 + y1) / 2 - (s > 0 ? 0.012 : 0), 0.058, 0, 0, sag), L = (x, y, z, rz = 0) => hm.clone().multiply(M(x, y, z, 0, 0, rz));
        const wr = Math.min(0.95, w.wear + 0.25), c0 = accC(0.06), pc = () => ({ color: kit.vary(c0, r, 0.05), wear: wr + (r() - 0.5) * 0.25, bevel: 0.003, rand: r });
        const nb = 5, bw = sw / nb;
        for (let i = 0; i < nb; i++) B.box(PEEL, bw - 0.004, h - 0.01 - (r() < 0.2 ? 0.012 : 0), 0.02, L(-sw / 2 + bw * (i + 0.5), 0, 0), { grain: 1, ...pc() });
        for (const y of [h / 2 - 0.2, -h / 2 + 0.2]) B.box(PEEL, sw - 0.03, 0.09, 0.02, L(0, y, 0.02), { grain: 0, ...pc() });
        B.box(PEEL, Math.hypot(sw - 0.06, h - 0.58), 0.085, 0.02, L(0, 0, 0.02, s * Math.atan2(h - 0.58, sw - 0.06)), { grain: 0, ...pc() });
        for (const y of [h / 2 - 0.2, -h / 2 + 0.2]) { B.box(mat.rust(), 0.26, 0.03, 0.006, L(-s * (sw / 2 - 0.11), y, 0.033), { color: 0x9a8a80 }); B.cyl(mat.rust(), 0.011, 0.011, 0.07, L(-s * (sw / 2 + 0.005), y, 0.02), { color: 0x9a8a80, seg: 6 }); }
        B.box(mat.rust(), 0.03, 0.09, 0.008, wm(uc + s * (wd / 2 + 0.105 + sw - 0.05), y0 - 0.02, 0.07, 0, 0, 0.5), { color: 0x9a8a80 });   // shutter dog
      }
    }
    if (o.shutter === 'louver') {
      for (const s of [-1, 1]) { // louvered leaves folded back against the siding, each slat its own piece
        const sw = Math.min(0.46, wd / 2 - 0.01), sag = s > 0 ? -0.012 : 0.004, hm = wm(uc + s * (wd / 2 + 0.1 + sw / 2), (y0 + y1) / 2 - (s > 0 ? 0.01 : 0), 0.062, 0, 0, sag), L = (x, y, z, rx = 0) => hm.clone().multiply(M(x, y, z, rx, 0, 0));
        const wr = 0.55, c0 = accC(0.07), pc = () => ({ color: kit.vary(c0, r, 0.06), wear: wr + (r() - 0.5) * 0.3, bevel: 0.003, rand: r });
        for (const x of [-sw / 2 + 0.028, sw / 2 - 0.028]) B.box(PEEL, 0.056, h, 0.03, L(x, 0, 0), { grain: 1, ...pc() });
        for (const y of [h / 2 - 0.035, 0, -h / 2 + 0.035]) B.box(PEEL, sw - 0.11, 0.07, 0.03, L(0, y, 0), { grain: 0, ...pc() });
        for (let y = -h / 2 + 0.09; y < h / 2 - 0.08; y += 0.04) { if (Math.abs(y) < 0.05 || r() < 0.03) continue; B.box(PEEL, sw - 0.112, 0.012, 0.044, L(0, y, 0, -0.6 + (r() - 0.5) * 0.08), { grain: 0, ...pc(), wear: wr, bevel: 0.002 }); }
        for (const y of [h / 2 - 0.2, -h / 2 + 0.2]) B.box(mat.rust(), 0.05, 0.08, 0.008, L(-s * (sw / 2 - 0.02), y, 0.018), { color: 0x9a8a80 });
      }
    }
    if (o.ac) ctx.acWindow = o;
  }

  // ---------- gable louver vents ----------
  for (const o of Object.values(ctx.openings)) {
    if (o.kind !== 'vent') continue;
    const wm = o.wall.wm, { u0, u1, y0, y1 } = o, uc = o.u, wear = Math.min(0.9, o.wall.wear + 0.2);
    B.box(mat.matte(), o.w, o.h, 0.01, wm(uc, (y0 + y1) / 2, 0.004), { color: 0x14110f });
    for (const s of [-1, 1]) B.box(PAINT, 0.07, o.h + 0.14, 0.03, wm(uc + s * (o.w / 2 + 0.03), (y0 + y1) / 2, 0.032), { grain: 1, ...tr(wear) });
    for (const y of [y0 - 0.035, y1 + 0.035]) B.box(PAINT, o.w + 0.16, 0.07, 0.034, wm(uc, y, 0.034), { grain: 0, ...tr(wear) });
    for (let y = y0 + 0.03; y < y1 - 0.01; y += 0.05) B.box(PAINT, o.w, 0.008, 0.06, wm(uc, y, 0.03, 0.7, 0, 0), { grain: 0, ...tr(wear + (r() - 0.5) * 0.2), bevel: 0 });
  }

  // ---------- doors ----------
  const doors = ctx.doors = {};
  const frame = (o, ext) => { // jamb liner, casings, threshold
    const w = o.wall, wm = w.wm, { u0, u1, y0, y1 } = o, uc = o.u, t = o.partition ? P.intT : T, oc = o.partition ? 0 : -T / 2 + 0.008, depth = t + 0.03, wear = ext ? Math.min(0.7, w.wear + 0.1) : 0.05;
    const bt = ext ? B : I, pm = ext ? PAINT : IPAINT;
    for (const u of [u0 + 0.012, u1 - 0.012]) bt.box(pm, 0.024, o.h, depth, wm(u, (y0 + y1) / 2, oc), { grain: 1, ...tr(wear) });
    bt.box(pm, o.w, 0.024, depth, wm(uc, y1 - 0.012, oc), { grain: 0, ...tr(wear) });
    const sides = o.partition ? [[t / 2 + 0.01, I, IPAINT, 0.05], [-t / 2 - 0.01, I, IPAINT, 0.05]] : [[0.03, B, PAINT, wear], [-T - 0.01, I, IPAINT, 0.05]];
    for (const [oo, b2, m2, wr] of sides) {
      for (const s of [-1, 1]) b2.box(m2, 0.09, o.h + 0.03, 0.022, wm(uc + s * (o.w / 2 + 0.034), y0 + (o.h + 0.03) / 2, oo), { grain: 1, ...tr(Array.isArray(wr) ? wr : [Math.min(1, wr * 2.2), wr]) });
      b2.box(m2, o.w + 0.2, 0.11, 0.022, wm(uc, y1 + 0.05, oo), { grain: 0, ...tr(wr) });
      if (b2 === B) b2.box(m2, o.w + 0.26, 0.022, 0.06, wm(uc, y1 + 0.113, oo + 0.012, 0.22, 0, 0), { grain: 0, ...tr(wr) });
    }
    if (!o.partition) { B.box(W, o.w + 0.1, 0.035, T + 0.11, wm(uc, y0 + 0.012, -T / 2 + 0.03), { grain: 0, color: kit.vary(0xa39a8a, r, 0.06), wear: 0.7, bevel: 0.008, rand: r }); B.box(STEEL, o.w - 0.05, 0.008, 0.07, wm(uc, y0 + 0.033, -0.04), { color: 0xb5b7b3, bevel: 0.003 }); }
  };
  // A hinged leaf. def: { id, o: opening, hinge: 'u0'|'u1', swing: 'in'|'out', max: radians, thick, draw(bt, L, w, h, dir) }
  const hinged = (def) => {
    const o = def.o, w = o.wall, lw = o.w - 0.052, lh = o.h - 0.034, dir = def.hinge === 'u0' ? 1 : -1, off = def.off ?? (o.partition ? 0 : -0.055);
    const pivot = new THREE.Group(); pivot.name = 'door:' + def.id;
    const hp = w.pt(def.hinge === 'u0' ? o.u0 + 0.026 : o.u1 - 0.026, F, off); pivot.position.copy(hp); pivot.rotation.y = Math.atan2(w.ux, w.uz) - Math.PI / 2;
    const bt = kit.batch('door_' + def.id), L = (x, y, z, rx = 0, ry = 0, rz = 0) => M(dir * x, y, z, rx, ry, rz);
    def.draw(bt, L, lw, lh, dir); bt.build(pivot); ctx.groups.dyn.add(pivot);
    const sign = (def.hinge === 'u0' ? 1 : -1) * (def.swing === 'in' ? 1 : -1) * (o.partition && def.swing === 'in' ? 1 : 1);
    const c = w.pt(o.u, 0, o.partition ? 0 : -T / 2), collider = col.box(c.x, F + o.h / 2, c.z, o.w, o.h, 0.09, { ry: Math.atan2(-w.uz, w.ux), tag: 'door', id: 'door_' + def.id });
    const d = doors[def.id] = { ...def, pivot, open: !!def.startOpen, a: def.startOpen ? (def.max ?? 1.7) : 0, collider, center: w.pt(o.u, F + 1.05, off) };
    pivot.rotation.y += sign * d.a; d.base = pivot.rotation.y - sign * d.a; d.sign = sign; collider.enabled = !d.open;
    ctx.addInteract({ id: 'door_' + def.id, kind: 'door', label: () => (d.open ? 'Close ' : 'Open ') + (def.name || 'door'), pos: d.center, radius: 1.6,
      use: (env) => { d.open = !d.open; if (d.open) collider.enabled = false; env?.game?.audio?.play?.('door', { position: env.game.player?.position, volume: 0.6 }); return d.open; } });
    ctx.updaters.push((dt, env) => {
      const tgt = d.open ? (def.max ?? 1.7) : 0; if (Math.abs(d.a - tgt) < 1e-4) return;
      d.a += (tgt - d.a) * Math.min(1, dt * 5.5); if (Math.abs(d.a - tgt) < 0.004) d.a = tgt;
      pivot.rotation.y = d.base + sign * d.a;
      if (!d.open && d.a < 0.06 && !collider.enabled) { const p = env?.player; if (p && Math.hypot(p.x - c.x, p.z - c.z) < 0.55 && Math.abs(p.y - F) < 1.5) d.open = true; else collider.enabled = true; }   // never close on someone standing in the doorway
    });
    return d;
  };
  const knob = (bt, L, x, y, z0, z1, hex = 0xb89b55) => { for (const z of [z0, z1]) { const s = Math.sign(z); bt.cyl(mat.chrome(), 0.027, 0.03, 0.01, L(x, y, z, Math.PI / 2), { color: hex, seg: 12 }); bt.cyl(mat.chrome(), 0.009, 0.009, 0.04, L(x, y, z + s * 0.02, Math.PI / 2), { color: hex, seg: 8 }); bt.geo(mat.chrome(), new THREE.SphereGeometry(0.027, 12, 8), L(x, y, z + s * 0.05, 0, 0, 0), { color: hex }); } };
  const panelDoor = (bt, L, lw, lh, o) => { // stile-and-rail door: o: { m, color, wear, thick, glassTop: fraction, lites: [cols, rows], cross }
    const s = 0.11, t = o.thick ?? 0.042, pc = () => ({ color: kit.vary(o.color, r, 0.03), wear: o.wear + (r() - 0.5) * 0.12, bevel: 0.004, rand: r });
    for (const x of [s / 2, lw - s / 2]) bt.box(o.m, s, lh, t, L(x, lh / 2, 0), { grain: 1, ...pc() });
    const split = o.glassTop ? lh * (1 - o.glassTop) : lh * 0.5, rails = [[0.11, 0.22], [split, 0.13], [lh - 0.065, 0.13]];
    for (const [y, hh] of rails) bt.box(o.m, lw - 2 * s, hh, t, L(lw / 2, y, 0), { grain: 0, ...pc() });
    const y0 = 0.22, y1 = split - 0.065, y2 = split + 0.065, y3 = lh - 0.13, iw = lw - 2 * s;
    if (o.cross) { for (const sg of [-1, 1]) bt.box(o.m, Math.hypot(iw, y1 - y0), 0.085, t * 0.8, L(lw / 2, (y0 + y1) / 2, 0, 0, 0, sg * Math.atan2(y1 - y0, iw)), { grain: 0, ...pc() }); bt.box(o.m, iw, y1 - y0, t * 0.45, L(lw / 2, (y0 + y1) / 2, 0), { grain: 1, ...pc() }); }
    else { for (const k of [0, 1]) { const px = s + iw * (k + 0.5) / 2; bt.box(o.m, iw / 2 - 0.05, y1 - y0 - 0.06, t * 0.62, L(px, (y0 + y1) / 2, 0), { grain: 1, ...pc(), bevel: 0.01 }); bt.box(o.m, iw / 2 + 0.002, y1 - y0, t * 0.4, L(px, (y0 + y1) / 2, 0), { grain: 1, ...pc() }); } bt.box(o.m, 0.1, y1 - y0, t, L(lw / 2, (y0 + y1) / 2, 0), { grain: 1, ...pc() }); }
    if (o.glassTop) {
      const [nc, nr] = o.lites || [2, 2];
      bt.box(o.glass || GLASS, iw, y3 - y2, 0.005, L(lw / 2, (y2 + y3) / 2, 0), { uvS: 0 });
      for (let i = 1; i < nc; i++) bt.box(o.m, 0.022, y3 - y2, t * 0.7, L(s + iw * i / nc, (y2 + y3) / 2, 0), { grain: 1, ...pc() });
      for (let j = 1; j < nr; j++) bt.box(o.m, iw, 0.022, t * 0.7, L(lw / 2, y2 + (y3 - y2) * j / nr, 0), { grain: 0, ...pc() });
    } else { for (const k of [0, 1]) { const px = s + iw * (k + 0.5) / 2; bt.box(o.m, iw / 2 - 0.05, y3 - y2 - 0.06, t * 0.62, L(px, (y2 + y3) / 2, 0), { grain: 1, ...pc(), bevel: 0.01 }); bt.box(o.m, iw / 2 + 0.002, y3 - y2, t * 0.4, L(px, (y2 + y3) / 2, 0), { grain: 1, ...pc() }); } bt.box(o.m, 0.1, y3 - y2, t, L(lw / 2, (y2 + y3) / 2, 0), { grain: 1, ...pc() }); }
    for (const y of [0.25, lh / 2, lh - 0.25]) bt.box(mat.chrome(), 0.012, 0.09, t + 0.012, L(-0.004, y, 0), { color: 0x8f7a4a });   // butt hinges
  };
  const O = ctx.openings;
  frame(O.D_back, true); frame(O.D_bed, false); frame(O.D_bath, false);
  // cased opening into the hall: liner + casings only
  { const o = O.D_hall, w = o.wall, wm = w.wm, t = P.intT; for (const u of [o.u0 + 0.012, o.u1 - 0.012]) I.box(IPAINT, 0.024, o.h, t + 0.03, wm(u, F + o.h / 2, 0), { grain: 1, ...tr(0.06) }); I.box(IPAINT, o.w, 0.024, t + 0.03, wm(o.u, F + o.h - 0.012, 0), { grain: 0, ...tr(0.05) });
    for (const oo of [t / 2 + 0.01, -t / 2 - 0.01]) { for (const s of [-1, 1]) I.box(IPAINT, 0.09, o.h + 0.03, 0.022, wm(o.u + s * (o.w / 2 + 0.034), F + (o.h + 0.03) / 2, oo), { grain: 1, ...tr(0.06) }); I.box(IPAINT, o.w + 0.2, 0.11, 0.022, wm(o.u, F + o.h + 0.05, oo), { grain: 0, ...tr(0.05) }); } }

  // back door (hall to the bay deck): white, half glazed with nine lites
  hinged({ id: 'back', name: 'back door', o: O.D_back, hinge: 'u1', swing: 'in', max: 1.62, draw(bt, L, lw, lh) {
    panelDoor(bt, L, lw, lh, { m: PAINT, color: C.trim, wear: 0.3, glassTop: 0.5, lites: [3, 3] }); knob(bt, L, lw - 0.07, 0.98, 0.026, -0.026, 0x9a9a98);
  } });
  for (const [id, name, hinge, swing, max] of [['bed', 'bedroom door', 'u0', 'out', 1.72], ['bath', 'bathroom door', 'u1', 'in', 1.75]]) {
    hinged({ id, name, o: O['D_' + id], hinge, swing, max, off: 0, draw(bt, L, lw, lh) { panelDoor(bt, L, lw, lh, { m: IPAINT, color: 0xece7d9, wear: 0.08, thick: 0.036 }); knob(bt, L, lw - 0.065, 0.98, 0.022, -0.022, 0x9a8f78); } });
  }
  // sliding deck door: aluminum frame, fixed panel + sliding panel
  { const o = O.D_deck, w = o.wall, wm = w.wm, { u0, u1, y0, y1 } = o, AL = 0xb9bbb6, half = o.w / 2;
    for (const u of [u0 + 0.02, u1 - 0.02]) B.box(STEEL, 0.04, o.h, T + 0.02, wm(u, (y0 + y1) / 2, -T / 2 + 0.01), { color: AL, bevel: 0.003 });
    B.box(STEEL, o.w, 0.04, T + 0.02, wm(o.u, y1 - 0.02, -T / 2 + 0.01), { color: AL, bevel: 0.003 }); B.box(STEEL, o.w, 0.022, T + 0.04, wm(o.u, y0 + 0.011, -T / 2 + 0.01), { color: 0x9c9e99, bevel: 0.003 });
    for (const [oo, b2, m2] of [[0.03, B, PAINT], [-T - 0.01, I, IPAINT]]) { for (const s of [-1, 1]) b2.box(m2, 0.09, o.h + 0.03, 0.022, wm(o.u + s * (o.w / 2 + 0.034), y0 + (o.h + 0.03) / 2, oo), { grain: 1, ...tr(b2 === B ? 0.45 : 0.05) }); b2.box(m2, o.w + 0.2, 0.11, 0.022, wm(o.u, y1 + 0.05, oo), { grain: 0, ...tr(b2 === B ? 0.35 : 0.05) }); }
    // playtest H1: seal the frame to the cut siding. Wide outside casing lapping over the board ends on both jambs and the head,
    // jamb / head liners filling the reveal between the aluminum frame and the rough opening, and a sill plate on the deck
    for (const s of [-1, 1]) {
      B.box(PAINT, 0.2, o.h + 0.24, 0.03, wm(o.u + s * (o.w / 2 + 0.07), y0 + (o.h + 0.24) / 2 - 0.02, 0.045), { grain: 1, ...tr(0.45) });
      B.box(PAINT, 0.03, o.h, T + 0.06, wm(o.u + s * (o.w / 2 + 0.005), (y0 + y1) / 2, -T / 2 + 0.02), { grain: 1, ...tr(0.3) });
    }
    B.box(PAINT, o.w + 0.44, 0.24, 0.035, wm(o.u, y1 + 0.1, 0.047), { grain: 0, ...tr(0.4) });
    B.box(PAINT, o.w + 0.5, 0.03, 0.08, wm(o.u, y1 + 0.235, 0.07, 0.15, 0, 0), { grain: 0, ...tr(0.5) });          // drip cap
    B.box(PAINT, o.w, 0.06, T + 0.06, wm(o.u, y1 + 0.01, -T / 2 + 0.02), { grain: 0, ...tr(0.3) });
    B.box(PAINT, o.w + 0.4, 0.035, 0.14, wm(o.u, y0 + 0.015, 0.06), { grain: 0, ...tr(0.6), bevel: 0.006 });
    const panel = (bt, L) => { const pw = half + 0.02, ph = o.h - 0.07; for (const x of [0.022, pw - 0.022]) bt.box(STEEL, 0.044, ph, 0.03, L(x, ph / 2, 0), { color: AL, bevel: 0.003 }); for (const y of [0.03, ph - 0.022]) bt.box(STEEL, pw - 0.088, y < 0.1 ? 0.06 : 0.044, 0.03, L(pw / 2, y, 0), { color: AL, bevel: 0.003 }); bt.box(GLASS, pw - 0.08, ph - 0.09, 0.005, L(pw / 2, ph / 2 + 0.008, 0), { uvS: 0 }); return pw; };
    panel(B, (x, y, z) => wm(u0 + 0.04 + x, y0 + 0.024 + y, -0.045 + z));                                                             // fixed (east) panel
    const slide = new THREE.Group(); slide.position.copy(w.pt(o.u - 0.02, F + 0.024, -0.085)); slide.rotation.y = Math.atan2(w.ux, w.uz) - Math.PI / 2;
    const bt = kit.batch('slider'); const pw = panel(bt, (x, y, z) => M(x, y, z)); bt.box(mat.plastic(), 0.022, 0.2, 0.05, M(pw - 0.05, 1.0, 0), { color: 0x2a2a2a, bevel: 0.006 }); bt.build(slide); ctx.groups.dyn.add(slide);
    const c = w.pt(o.u + half / 2, 0, -T / 2), collider = col.box(c.x, F + o.h / 2, c.z, half, o.h, 0.09, { ry: Math.atan2(-w.uz, w.ux), tag: 'door', id: 'door_deck' });
    const cf = w.pt(o.u - half / 2, 0, -T / 2); col.box(cf.x, F + o.h / 2, cf.z, half, o.h, 0.09, { ry: Math.atan2(-w.uz, w.ux), tag: 'wall' });
    const p0 = slide.position.clone(), dirv = new THREE.Vector3(w.ux, 0, w.uz), d = doors.deck = { open: false, a: 0, collider, slide };
    ctx.addInteract({ id: 'door_deck', kind: 'door', label: () => (d.open ? 'Close' : 'Open') + ' sliding door', pos: w.pt(o.u + half / 2, F + 1.05, -0.05), radius: 1.6, use: (env) => { d.open = !d.open; if (d.open) collider.enabled = false; env?.game?.audio?.play?.('door', { position: env.game.player?.position, volume: 0.5 }); return d.open; } });
    ctx.updaters.push((dt, env) => { const tgt = d.open ? 1 : 0; if (Math.abs(d.a - tgt) < 1e-4) return; d.a += (tgt - d.a) * Math.min(1, dt * 4.5); if (Math.abs(d.a - tgt) < 0.004) d.a = tgt; slide.position.copy(p0).addScaledVector(dirv, -(half - 0.06) * d.a);
      if (!d.open && d.a < 0.06 && !collider.enabled) { const p = env?.player; if (p && Math.hypot(p.x - c.x, p.z - c.z) < 0.55 && Math.abs(p.y - F) < 1.5) d.open = true; else collider.enabled = true; } });
  }
}
