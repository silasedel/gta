// Shell: floors, wall finishes, ceilings and their colliders, generated from a finalized Plan.
// ctx = { G (Geo), M (MatSet), plan, R (rng), profile, colliders: [], occ: [] (bake occluders) }
// Surface specs are [surfaceName, opts] pairs (see kit/surfaces.js), e.g. ['vct', { c: [226, 222, 212], c2: [60, 110, 150] }].
const FLOOR_Y = 0.02;
const S = (M, spec, extra) => M.surf(spec[0], { ...(spec[1] || {}), ...(extra || {}) });

export function buildShell(ctx) {
  const { G, M, plan, profile } = ctx, wear = profile.wear;
  const col = (x, y, z, hx, hy, hz) => ctx.colliders.push([x, y, z, hx, hy, hz]);
  const occ = (x0, y0, z0, x1, y1, z1) => ctx.occ.push(x0, y0, z0, x1, y1, z1);
  const trim = M.flat(profile.trim, { rough: 0.6 }), steel = M.surf('steel', { wear });
  // ---------------- floors and ceilings
  for (const r of plan.rooms) {
    const fl = S(M, r.floor || profile.floor, { wear }), y = r.y0 + FLOOR_Y;
    G.plane(fl, r.cx, y, r.cz, r.w, r.d, { rx: -Math.PI / 2, step: 0.25 });
    const ct = r.ceil?.type || profile.ceil.type, ch = r.y0 + (ct === 'open' ? plan.H : r.h);
    const cs = r.ceil?.surf || (ct === 'drop' ? ['dropTile', { c: [228 - Math.round(wear * 4) * 4, 224 - Math.round(wear * 4) * 6, 214 - Math.round(wear * 4) * 11] }] : ct === 'tin' ? ['tin', { c: profile.ceil.c }] : ct === 'open' ? ['deck', { c: profile.ceil.c || [28, 28, 30] }] : ['paint', { c: profile.ceil.c || [232, 230, 224] }]);
    G.plane(S(M, cs, { wear }), r.cx, ch, r.cz, r.w, r.d, { rx: Math.PI / 2, step: 0.6 });
    r.ceilY = ch; r.ceilType = ct;
    if (ct === 'open') { // exposed structure: bar joists, a spiral duct run with diffusers, conduit
      const dark = M.flat(profile.ceil.c || [30, 30, 32], { rough: 0.8, metal: 0.3 });
      for (let z = r.z0 + 1.2; z < r.z1 - 0.6; z += 1.8) { G.box(dark, r.cx, ch - 0.06, z, r.w, 0.05, 0.1); G.box(dark, r.cx, ch - 0.42, z, r.w, 0.05, 0.1); for (let x = r.x0 + 0.3; x < r.x1 - 0.3; x += 0.6) G.box(dark, x, ch - 0.24, z, 0.025, 0.42, 0.025, { rz: ((Math.round(x / 0.6) & 1) ? 1 : -1) * 0.62 }); }
      if (r.w > 3 && r.d > 4) { const dx = r.x0 + r.w * (ctx.R.chance(0.5) ? 0.3 : 0.7), duct = M.surf('steel', { wear, tint: profile.ceil.duct || '#9aa0a6' }); G.cyl(duct, dx, ch - 0.72, r.cz, 0.2, r.d - 0.8, { rx: Math.PI / 2, seg: 14 }); for (let z = r.z0 + 1; z < r.z1 - 0.8; z += 1.2) G.cyl(steel, dx, ch - 0.72, z, 0.205, 0.03, { rx: Math.PI / 2, seg: 14 }); for (let z = r.z0 + 1.6; z < r.z1 - 1; z += 2.6) { G.cyl(duct, dx + 0.22, ch - 0.74, z, 0.09, 0.14, { rz: Math.PI / 2, seg: 10 }); G.box(dark, dx + 0.3, ch - 0.74, z, 0.02, 0.22, 0.22); } }
      G.cyl(steel, r.x0 + 0.5, ch - 0.1, r.cz, 0.012, r.d - 0.4, { rx: Math.PI / 2, seg: 6 }); G.cyl(steel, r.x0 + 0.56, ch - 0.1, r.cz, 0.012, r.d - 0.4, { rx: Math.PI / 2, seg: 6 });
    }
    if (r.level > 0) { col(r.cx, r.y0 - 0.14, r.cz, r.w / 2, 0.15, r.d / 2); occ(r.x0, r.y0 - 0.3, r.z0, r.x1, r.y0, r.z1); }
  }
  col(0, FLOOR_Y - 0.25, 0, plan.W / 2, 0.25, plan.D / 2); // ground slab (top at the finished floor)
  col(0, plan.levels * (plan.H + 0.3) + 0.1, 0, plan.W / 2 + 0.25, 0.15, plan.D / 2 + 0.25); // lid: nothing leaves through the roof
  // ---------------- wall finishes, per room face
  for (const r of plan.rooms) {
    const W = r.wall || profile.wall, top = r.ceilY, base = r.y0 + FLOOR_Y;
    const upper = S(M, W.surf, { wear }), wains = W.wainscot ? S(M, W.wainscot.surf, { wear }) : null, wh = W.wainscot ? W.wainscot.h : 0;
    const baseM = W.base === false ? null : M.flat(W.base || profile.trim, { rough: 0.7 }), band = W.band ? M.flat(W.band.c, { rough: 0.6 }) : null;
    const face = (f, a, b, y0, y1) => { if (b - a < 0.01 || y1 - y0 < 0.01) return; const p = plan.onFace(f, (a + b) / 2, 0.001);
      if (wains && y0 < base + wh - 0.01) { const ym = Math.min(y1, base + wh); G.plane(wains, p.x, (y0 + ym) / 2, p.z, b - a, ym - y0, { ry: p.ry, step: 0.45 }); if (y1 > ym) G.plane(upper, p.x, (ym + y1) / 2, p.z, b - a, y1 - ym, { ry: p.ry, step: 0.45 }); if (W.wainscot.cap !== false && y1 > ym) { const q = plan.onFace(f, (a + b) / 2, 0.012); G.box(baseM || trim, q.x, base + wh, q.z, b - a, 0.035, 0.024, { ry: q.ry }); } }
      else G.plane(upper, p.x, (y0 + y1) / 2, p.z, b - a, y1 - y0, { ry: p.ry, step: 0.45 });
      if (baseM && y0 <= base + 0.001) { const q = plan.onFace(f, (a + b) / 2, 0.008); G.box(baseM, q.x, base + 0.05, q.z, b - a, 0.1, 0.016, { ry: q.ry }); }
      if (band && y0 < base + W.band.y && y1 > base + W.band.y + W.band.h) { const q = plan.onFace(f, (a + b) / 2, 0.004); G.box(band, q.x, base + W.band.y + W.band.h / 2, q.z, b - a, W.band.h, 0.006, { ry: q.ry }); } };
    for (const f of r.faces) {
      if (f.front) continue; // the storefront draws its own inside face
      let a = f.a; for (const o of f.openings) { if (o.b <= f.a || o.a >= f.b) continue; face(f, a, o.a, base, top); if (o.y0 > 0.01) face(f, o.a, o.b, base, base + o.y0); face(f, o.a, o.b, base + o.y1, top); a = o.b; } face(f, a, f.b, base, top);
    }
  }
  // ---------------- wall solids: colliders + bake occluders (+ jamb faces inside openings)
  for (const s of plan.walls) {
    if (s.front) continue;
    const t = s.t, c = s.ext ? s.c + (s.pos ? -t / 2 : t / 2) : s.c, y0 = s.y0, H = plan.H;
    const solid = (a, b, ya, yb) => { if (b - a < 0.01 || yb - ya < 0.01) return; const m = (a + b) / 2, hl = (b - a) / 2; if (s.axis === 'x') { col(c, (ya + yb) / 2, m, t / 2, (yb - ya) / 2, hl); occ(c - t / 2, ya, a, c + t / 2, yb, b); } else { col(m, (ya + yb) / 2, c, hl, (yb - ya) / 2, t / 2); occ(a, ya, c - t / 2, b, yb, c + t / 2); } };
    let a = s.a - (s.ext ? 0.25 : 0); const end = s.b + (s.ext ? 0.25 : 0);
    for (const o of s.openings) { solid(a, o.a, y0, y0 + H); if (o.y0 > 0.01) solid(o.a, o.b, y0, y0 + o.y0); solid(o.a, o.b, y0 + o.y1, y0 + H); a = o.b; }
    solid(a, end, y0, y0 + H);
  }
  return { FLOOR_Y };
}
export { FLOOR_Y };
