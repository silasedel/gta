// Nico's house, part 20: the shell. Exterior walls clad in individual lap-siding boards (each with its own fade, peel and
// nail heads), corner boards, frieze, skirt and water table, interior board paneling, partitions, floors, baseboards,
// ceilings, and the wall colliders. Openings themselves (windows, doors, shutters) are built by part 22.
import { roofY } from '../plan.js';
export const order = 20;

export function build(ctx) {
  const { THREE, kit, plan: P, mat, col } = ctx, B = ctx.ext, I = ctx.int, M = kit.M, C = P.colors, F = P.F;
  const r = kit.rng(202), PAINT = mat.paint({ peel: 'a', fade: 0.28 }), W = mat.wood(), imat = ctx.imat, IPAINT = imat.paint({ peel: 'a', fade: 0.1 });
  const plateY = F + P.wallH, ceilY = F + P.ceilH, T = P.wallT;
  const nails = [];

  // exposure of each wall: [paint wear, sun fade tint, base y of the siding]
  const EXPO = { A_south: [0.3, 0.1, F - 0.3], B_west: [0.24, 0.05, F + 0.012], A_west: [0.34, 0.12, F + 0.012], A_north: [0.28, 0.05, F + 0.012], B_south: [0.28, 0.08, F + 0.012], B_east: [0.3, 0.08, F - 0.3], B_north: [0.28, 0.05, F + 0.012] };
  ctx.walls = {}; ctx.openings = {};
  for (const w of P.WALLS) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const Mw = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz)).setPosition(w.a[0], 0, w.a[1]);
    const wm = (u, y, o, rx = 0, ry = 0, rz = 0) => Mw.clone().multiply(M(u, y, o, rx, ry, rz));
    const pt = (u, y, o) => new THREE.Vector3(w.a[0] + ux * u + nx * o, y, w.a[1] + uz * u + nz * o);
    const [wear0, fade0, yBase] = EXPO[w.id];
    const info = ctx.walls[w.id] = { ...w, len, ux, uz, nx, nz, Mw, wm, pt, wear: wear0, fade: fade0, yBase, heading: Math.atan2(nx, nz) };
    for (const o of w.openings) ctx.openings[o.id] = { ...o, wall: info, y0: F + o.sill, y1: F + o.sill + o.h, u0: o.u - o.w / 2, u1: o.u + o.w / 2 };

    // ----- vertical board siding: every board its own piece, peeled hardest at the bottom, dark run-off stains -----
    const bw = 0.185, bt = 0.02, cb = 0.094;
    const topAt = (u) => (w.gable ? Math.max(plateY, roofY(w.a[0] + ux * u, w.a[1] + uz * u) - 0.14) : plateY - 0.15);
    const blocks = w.openings.map((o) => ({ u0: o.u - o.w / 2 - 0.1, u1: o.u + o.w / 2 + 0.1, y0: F + o.sill - (o.kind === 'window' ? 0.13 : o.kind === 'vent' ? 0.1 : 0.02), y1: F + o.sill + o.h + 0.125 }));
    const startCB = w.id !== 'B_west' && w.id !== 'A_north', uA = w.id === 'B_west' ? 0.03 : startCB ? cb : 0.002, uB = len - ((w.id === 'A_south') ? 0.03 : cb);
    let bi = 0;
    for (let u = uA; u < uB - 0.02; u += bw, bi++) {
      const u1 = Math.min(uB, u + bw - 0.005), uc = (u + u1) / 2, yTop = Math.min(topAt(u), topAt(u1));
      let free = [[yBase, yTop]];
      for (const k of blocks) if (u1 > k.u0 && u < k.u1) free = free.flatMap(([a, b]) => (k.y1 <= a || k.y0 >= b) ? [[a, b]] : [[a, Math.min(b, k.y0)], [Math.max(a, k.y1), b]].filter(([p, q]) => q - p > 0.03));
      const fresh = r() < 0.02, wr = wear0 + (r() - 0.5) * 0.34;
      let tone = kit.mix(kit.vary(C.body, r, 0.07), 0xb9c4b4, fade0 + r() * 0.14);
      if (w.id.endsWith('north')) tone = kit.mix(tone, 0x6f8a5c, 0.12);
      if (fresh) tone = kit.rgb(r() > 0.5 ? 0xe3dfd0 : 0x9fd0b4);
      for (const [a, b] of free) {
        const under = blocks.some((k) => Math.abs(b - k.y0) < 0.02 && k.y0 > yBase + 0.5), tn = under ? kit.mul(tone, 0.74) : tone;   // dark run-off below every sill
        B.box(PAINT, u1 - u, b - a, bt, wm(uc, (a + b) / 2, 0.011 + (bi % 2) * 0.005 + (r() - 0.5) * 0.002, 0, 0, (r() - 0.5) * 0.003), { grain: 1, color: tn, wear: fresh ? 0.03 : [Math.min(1, wr + (under ? 0.3 : 0.5)), Math.max(0.05, wr - (under ? -0.12 : 0.1))], rand: r, bevel: 0.003 });
        for (let y = a + 0.12; y < b - 0.05; y += 0.61) for (const du of [-0.05, 0.05]) if (r() > 0.05) nails.push(wm(uc + du, y + (r() - 0.5) * 0.02, 0.028, Math.PI / 2, 0, 0));
      }
    }
    // ----- corner boards, frieze, skirt / water table -----
    const tr = (wr) => ({ color: kit.vary(C.trim, r, 0.03), wear: wr ?? Math.min(0.9, wear0 + 0.1 + r() * 0.2), bevel: 0.003, rand: r });
    const cbTop = plateY - 0.15;
    if (startCB) B.box(PAINT, cb, cbTop - yBase + 0.01, 0.024, wm(cb / 2 - 0.024, (cbTop + yBase) / 2, 0.012), { grain: 1, ...tr(), wear: [Math.min(1, wear0 + 0.4), wear0] });
    if (w.id !== 'A_south') B.box(PAINT, cb, cbTop - yBase + 0.01, 0.024, wm(len - cb / 2 + 0.024, (cbTop + yBase) / 2, 0.012), { grain: 1, ...tr(), wear: [Math.min(1, wear0 + 0.4), wear0] });
    if (w.id === 'A_south') B.box(PAINT, 0.03, cbTop - yBase, 0.03, wm(len - 0.015, (cbTop + yBase) / 2, 0.015), { grain: 1, ...tr() });   // inside corner bead at the wing
    if (!w.gable) for (let u = 0, n = Math.ceil(len / 3.6); u < n; u++) B.box(PAINT, len / n - 0.003, 0.15, 0.022, wm(len * (u + 0.5) / n, plateY - 0.075, 0.016), { grain: 0, ...tr(wear0 * 0.6) });   // frieze under the eave
    if (yBase < F - 0.1) { // walls with no deck in front: skirt board over the rim, with a sloped water table on top
      for (let u = 0, n = Math.ceil(len / 3.4); u < n; u++) {
        B.box(PAINT, len / n - 0.003, 0.2, 0.022, wm(len * (u + 0.5) / n, yBase - 0.1, 0.014), { grain: 0, ...tr(Math.min(1, wear0 + 0.3)) });
        B.box(PAINT, len / n - 0.003, 0.03, 0.05, wm(len * (u + 0.5) / n, yBase + 0.008, 0.028, 0.3, 0, 0), { grain: 0, ...tr(Math.min(1, wear0 + 0.35)) });
      }
    } else B.box(mat.steel(), len, 0.05, 0.004, wm(len / 2, yBase + 0.012, 0.004, -0.2, 0, 0), { color: 0x9aa0a0, wear: 0.8 });   // galvanized flashing where the wall meets the deck

    // ----- interior face: painted board paneling in rectangles around the openings, per room tint -----
    const panelRects = (L, y0, y1, ops) => { // -> [u0, u1, y0, y1] rectangles covering the face minus openings
      const out = []; let u = 0;
      for (const o of [...ops].sort((p, q) => p.u - q.u)) {
        const a = o.u - o.w / 2, b = o.u + o.w / 2, s = F + o.sill, t = Math.min(y1, s + o.h);
        if (s >= y1) continue;
        if (a > u) out.push([u, a, y0, y1]);
        if (s > y0 + 0.001) out.push([a, b, y0, s]);
        if (t < y1 - 0.001) out.push([a, b, t, y1]);
        u = b;
      }
      if (u < L) out.push([u, L, y0, y1]); return out;
    };
    info.panelRects = panelRects;
    const PAN = panelMat(ctx);
    for (const [u0, u1, y0, y1] of panelRects(len, F, ceilY, w.openings)) {
      // split by room so each room gets its own wall color
      for (const [a, b, tint] of roomSplit(ctx, w, u0, u1)) I.box(PAN, b - a, y1 - y0, 0.012, wm((a + b) / 2, (y0 + y1) / 2, -T + 0.006, 0, 0, 0), { grain: 1, color: tint, skip: 'pz', uv: [(a + b) / 2 / 0.9, (y0 + y1) / 2 / 0.9], wear: 0.3 });
    }
    // ----- colliders: solid wall with gaps at the doors -----
    const doors = w.openings.filter((o) => o.kind === 'door' || o.kind === 'slider').sort((p, q) => p.u - q.u);
    let u = 0; const seg = (a, b, y0, y1) => { if (b - a > 0.02) { const c = pt((a + b) / 2, 0, -T / 2); col.box(c.x, (y0 + y1) / 2, c.z, b - a, y1 - y0, T + 0.02, { ry: Math.atan2(-uz, ux), tag: 'wall' }); } };
    for (const o of doors) { seg(u, o.u - o.w / 2, F - 0.3, plateY); seg(o.u - o.w / 2, o.u + o.w / 2, F + o.h, plateY); u = o.u + o.w / 2; }
    seg(u, len, F - 0.3, plateY);
    if (w.gable) { const c = pt(len / 2, 0, -T / 2); col.box(c.x, plateY + 0.7, c.z, len * 0.6, 1.4, T, { ry: Math.atan2(-uz, ux), tag: 'wall' }); }
  }

  // ---------- interior partitions ----------
  ctx.partitions = {};
  for (const p of P.PARTITIONS) {
    const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux, t = P.intT;
    const Mw = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz)).setPosition(p.a[0], 0, p.a[1]);
    const wm = (u, y, o, rx = 0, ry = 0, rz = 0) => Mw.clone().multiply(M(u, y, o, rx, ry, rz));
    const pt = (u, y, o) => new THREE.Vector3(p.a[0] + ux * u + nx * o, y, p.a[1] + uz * u + nz * o);
    const info = ctx.partitions[p.id] = { ...p, len, ux, uz, nx, nz, Mw, wm, pt, heading: Math.atan2(nx, nz) };
    for (const o of p.openings) ctx.openings[o.id] = { ...o, wall: info, partition: true, y0: F, y1: F + o.h, u0: o.u - o.w / 2, u1: o.u + o.w / 2 };
    const PAN = panelMat(ctx);
    for (const side of [1, -1]) for (const [u0, u1, y0, y1] of ctx.walls.A_south.panelRects(len, F, ceilY, p.openings)) {
      const c = pt((u0 + u1) / 2, 0, side * 0.3), tint = roomTint(ctx, c.x, c.z);
      I.box(PAN, u1 - u0, y1 - y0, 0.012, wm((u0 + u1) / 2, (y0 + y1) / 2, side * (t / 2 - 0.006)), { grain: 1, color: tint, skip: side > 0 ? 'nz' : 'pz', uv: [(u0 + u1) / 2 / 0.9 + 0.31 * side, (y0 + y1) / 2 / 0.9], wear: 0.3 });
    }
    // top plate strip above cased / door openings keeps light from leaking through the partition
    let u = 0; const seg = (a, b, y0, y1) => { if (b - a > 0.02) { const c = pt((a + b) / 2, 0, 0); col.box(c.x, (y0 + y1) / 2, c.z, b - a, y1 - y0, t, { ry: Math.atan2(-uz, ux), tag: 'wall' }); } };
    for (const o of [...p.openings].sort((a, b) => a.u - b.u)) { seg(u, o.u - o.w / 2, F, ceilY); seg(o.u - o.w / 2, o.u + o.w / 2, F + o.h, ceilY); u = o.u + o.w / 2; }
    seg(u, len, F, ceilY);
  }

  // ---------- floors ----------
  const PINE = imat.pbr('wood_floor_worn', { rep: 1.5, gain: 1.6, tint: 0xd9c7a8 }), LINO = imat.pbr('old_linoleum_flooring_01', { rep: 1.1, gain: 1.25, tint: 0xe8e2d0, rough: 0.9 });
  const R = P.rooms, floor = (m, x0, x1, z0, z1, o = {}) => I.box(m, x1 - x0, 0.02, z1 - z0, M((x0 + x1) / 2, F - 0.01 + (o.dy || 0), (z0 + z1) / 2), { grain: 2, color: o.color ?? 0xffffff, skip: 'ny', uv: [(x0 + x1) / 2 / (m.userData.uvScale || 1), (z0 + z1) / 2 / (m.userData.uvScale || 1)] });
  floor(PINE, P.A.x0 + T, -1.9, P.A.z0 + T, P.A.z1 - T);                                   // living room: old pine boards
  floor(LINO, -1.9, 2.0 - 0.055, P.A.z0 + T, P.A.z1 - T, { dy: 0.003 });                   // kitchen: sheet linoleum laid over the pine
  floor(PINE, 2.0 - 0.055, 4.0, P.B.z0 + T, 0.0, { color: 0xf2ece0 });                     // hall
  floor(LINO, 4.0, P.B.x1 - T, P.B.z0 + T, 0.0, { dy: 0.003 });                             // bath
  floor(PINE, 2.0 - 0.055, P.B.x1 - T, 0.0, P.B.z1 - T, { color: 0xfff6e8 });               // bedroom
  I.box(imat.steel(), 0.035, 0.006, P.A.z1 - P.A.z0 - 2 * T, M(-1.9, F + 0.005, P.ridgeA.z), { color: 0xb9b3a0, bevel: 0.002 });   // aluminum transition strip, living | kitchen
  I.box(imat.steel(), 0.035, 0.006, 0.78, M(4.0, F + 0.005, -1.3), { color: 0xb9b3a0, bevel: 0.002 });

  // ---------- ceilings (painted boards), with the attic hatch in the hall ----------
  const CEIL = imat.pbr('white_planks_clean', { rep: 0.9, gain: 2.05, tint: 0xf4f1e6 });
  const ceil = (x0, x1, z0, z1) => I.box(CEIL, x1 - x0, 0.02, z1 - z0, M((x0 + x1) / 2, ceilY + 0.01, (z0 + z1) / 2), { grain: 2, color: 0xffffff, skip: 'py', uv: [(x0 + x1) / 2 / 0.9, (z0 + z1) / 2 / 0.9] });
  ceil(P.A.x0 + T, P.A.x1, P.A.z0 + T, P.A.z1 - T); ceil(P.B.x0, P.B.x1 - T, P.B.z0 + T, P.B.z1 - T);
  I.box(IPAINT, 0.74, 0.02, 0.62, M(3.0, ceilY - 0.008, -2.2), { color: C.trim, wear: 0.05, bevel: 0.004 });        // attic hatch
  for (const [sx, sz, dx2, dz2] of [[0.8, 0.045, 0, -0.33], [0.8, 0.045, 0, 0.33], [0.045, 0.7, -0.39, 0], [0.045, 0.7, 0.39, 0]]) I.box(IPAINT, sx, 0.016, sz, M(3.0 + dx2, ceilY - 0.006, -2.2 + dz2), { color: C.trim, wear: 0.05, bevel: 0.003 });
  // black-out lid above the ceiling so no sky shows through gaps, and it shades the rooms from the sun
  I.box(imat.matte(), P.A.x1 - P.A.x0 - 0.1, 0.03, P.A.z1 - P.A.z0 - 0.1, M((P.A.x0 + P.A.x1) / 2, ceilY + 0.06, (P.A.z0 + P.A.z1) / 2), { color: 0x1c1a17 });
  I.box(imat.matte(), P.B.x1 - P.B.x0 - 0.1, 0.03, P.B.z1 - P.B.z0 - 0.1, M((P.B.x0 + P.B.x1) / 2, ceilY + 0.06, (P.B.z0 + P.B.z1) / 2), { color: 0x1c1a17 });
  col.box((P.A.x0 + P.A.x1) / 2, ceilY + 0.1, (P.A.z0 + P.A.z1) / 2, P.A.x1 - P.A.x0, 0.16, P.A.z1 - P.A.z0, { tag: 'ceiling' });
  col.box((P.B.x0 + P.B.x1) / 2, ceilY + 0.1, (P.B.z0 + P.B.z1) / 2, P.B.x1 - P.B.x0, 0.16, P.B.z1 - P.B.z0, { tag: 'ceiling' });

  // ---------- baseboards and crown strips, room by room (skipping door openings) ----------
  const doorsAt = Object.values(ctx.openings).filter((o) => ['door', 'slider', 'cased'].includes(o.kind)).map((o) => { const a = o.wall.pt(o.u0 - 0.09, 0, 0), b = o.wall.pt(o.u1 + 0.09, 0, 0); return { x0: Math.min(a.x, b.x) - 0.2, x1: Math.max(a.x, b.x) + 0.2, z0: Math.min(a.z, b.z) - 0.2, z1: Math.max(a.z, b.z) + 0.2 }; });
  const base = (x0, z0, x1, z1, nx, nz) => { // run along a wall face from (x0,z0) to (x1,z1); n points into the room
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, ry = Math.atan2(-uz, ux); let t = 0;
    while (t < len - 0.01) {
      let te = Math.min(len, t + 0.25);
      const blocked = (tt) => doorsAt.some((d) => { const x = x0 + ux * tt, z = z0 + uz * tt; return x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && Math.hypot(x - (d.x0 + d.x1) / 2, z - (d.z0 + d.z1) / 2) < Math.max(d.x1 - d.x0, d.z1 - d.z0) / 2 - 0.19; });
      if (blocked(t + 0.01)) { t += 0.05; continue; }
      while (te < len - 0.001 && !blocked(te + 0.04)) te = Math.min(len, te + 0.05);
      const l = te - t, cx = x0 + ux * (t + te) / 2 + nx * 0.008, cz = z0 + uz * (t + te) / 2 + nz * 0.008;
      if (l > 0.06) { I.box(IPAINT, l, 0.11, 0.016, M(cx, F + 0.055, cz, 0, ry, 0), { grain: 0, color: kit.vary(C.trim, r, 0.02), wear: 0.06 + r() * 0.08, bevel: 0.003, rand: r });
        I.box(IPAINT, l, 0.018, 0.018, M(cx + nx * 0.013, F + 0.009, cz + nz * 0.013, 0, ry, 0), { grain: 0, color: kit.vary(C.trim, r, 0.02), wear: 0.1, bevel: 0.006, rand: r });
        I.box(IPAINT, l, 0.045, 0.014, M(cx - nx * 0.001, ceilY - 0.0225, cz - nz * 0.001, 0, ry, 0), { grain: 0, color: kit.vary(C.trim, r, 0.02), wear: 0.03, bevel: 0.003, rand: r }); }
      t = te;
    }
  };
  for (const k of ['living+kitchen', 'hall', 'bath', 'bedroom']) {
    const q = k === 'living+kitchen' ? { x0: R.living.x0, x1: R.kitchen.x1, z0: R.living.z0, z1: R.living.z1 } : R[k];
    base(q.x0, q.z0, q.x1, q.z0, 0, 1); base(q.x1, q.z0, q.x1, q.z1, -1, 0); base(q.x1, q.z1, q.x0, q.z1, 0, -1); base(q.x0, q.z1, q.x0, q.z0, 1, 0);
  }

  // nail heads on the siding (rusty), one instanced mesh
  const ng = new THREE.CylinderGeometry(0.0038, 0.0038, 0.004, 6);
  const nm = new THREE.MeshStandardMaterial({ color: 0x5a3d2b, roughness: 0.8, metalness: 0.4 });
  const ni = kit.instances(ng, nm, nails, null, { cast: false, receive: false }); ni.name = 'sidingNails'; ctx.groups.detail.add(ni);
  ctx.stats.shell = { nails: nails.length };
}

// Interior wall paneling material: painted tongue-and-groove boards (vertex color = room paint color).
function panelMat(ctx) { return ctx.imat.pbr('white_planks_clean', { rep: 0.9, gain: 2.05 }); }
const ROOM_TINT = { living: 0xf1ead8, kitchen: 0xe9ecd9, hall: 0xefe9da, bath: 0xd9ebe6, bedroom: 0xdde7ea };
function roomTint(ctx, x, z) { for (const [k, q] of Object.entries(ctx.plan.rooms)) if (x >= q.x0 - 0.2 && x <= q.x1 + 0.2 && z >= q.z0 - 0.2 && z <= q.z1 + 0.2) return ROOM_TINT[k]; return ROOM_TINT.living; }
// Split an exterior-wall panel [u0,u1] where the room behind it changes; returns [[a, b, tint], ...]
function roomSplit(ctx, w, u0, u1) {
  const out = []; let a = u0, cur = null; const step = 0.05;
  for (let u = u0; u <= u1 + 1e-6; u += step) {
    const uu = Math.min(u1, u + step / 2), p = { x: w.a[0] + (w.b[0] - w.a[0]) / Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * uu, z: w.a[1] + (w.b[1] - w.a[1]) / Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * uu };
    const nx = -(w.b[1] - w.a[1]) / Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), nz = (w.b[0] - w.a[0]) / Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const t = roomTint(ctx, p.x - nx * 0.5, p.z - nz * 0.5);
    if (cur === null) cur = t; else if (t !== cur) { out.push([a, u, cur]); a = u; cur = t; }
  }
  out.push([a, u1, cur ?? ROOM_TINT.living]); return out.filter(([p, q]) => q - p > 0.005);
}
