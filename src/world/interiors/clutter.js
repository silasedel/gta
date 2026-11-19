// Automatic wear, dirt, atmosphere and lived-in clutter, applied to EVERY interior after the store type's own fixtures:
// floor stains, traffic paths and mop streaks, grime at wall bases and corners, stained or missing ceiling tiles, mismatched
// replacement floor tiles, daylight shafts with dust, an extension cord, delivery boxes, crooked handwritten notices with tape,
// door stickers, and a product or two knocked onto the floor. Seeded per store, scaled by profile.wear and profile.clutter.
// profile.venueWear (clubs, bars, restaurants, cafes): floor and wall wear only, no shop clutter (cords, cartons, notices, stickers).
// Everything is merged static geometry or decals (no per-frame cost).
import * as THREE from 'three';

let SHAFT = null;
function shaftTex() {
  if (SHAFT) return SHAFT;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d'),
    img = g.createImageData(128, 256);
  let s = 7;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 128; x++) {
      const u = Math.abs(x / 127 - 0.5) * 2,
        v = y / 255;
      s = (s * 1664525 + 1013904223) >>> 0;
      const dust = s >>> 24 > 250 ? 0.5 : 0,
        streak = 0.75 + 0.25 * Math.sin(x * 0.55) * Math.sin(x * 0.17 + 1);
      const a = Math.max(0, 1 - u * u) * Math.pow(1 - v, 1.3) * streak + dust * (1 - v) * (1 - u);
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, 255 * a);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  SHAFT = new THREE.CanvasTexture(c);
  return SHAFT;
}

export function autoWear(ctx) {
  const { G, M, plan: P, R, profile: p, prints } = ctx,
    wear = p.wear,
    cl = p.clutter ?? 0.6,
    FY = ctx.FLOOR_Y;
  const dirt = M.grime('#2a2118', Math.round((0.12 + wear * 0.4) * 20) / 20),
    dark = M.grime('#0e0c0a', Math.round((0.14 + wear * 0.45) * 20) / 20),
    pale = M.grime('#f4f1e8', 0.16),
    BL = [0.01, 0.01, 0.49, 0.99],
    BAND = [0.51, 0.0, 0.99, 1];
  const stain = (m, x, z, w, d, ry = R() * 6.3, y = FY + 0.004) =>
    G.plane(m, x, y, z, w, d, { rx: -Math.PI / 2, ry, uvRect: BL });
  for (const r of P.rooms) {
    const pub = !r.staffOnly,
      k = wear * (pub ? 1 : 1.3) + 0.15;
    // random stains and scuffs, denser with wear
    for (let i = 0, n = Math.round(((3 + k * 22) * r.w * r.d) / 60); i < n; i++)
      stain(
        R.chance(0.3) ? dark : dirt,
        R.range(r.x0 + 0.3, r.x1 - 0.3),
        R.range(r.z0 + 0.3, r.z1 - 0.3),
        R.range(0.25, 1.1),
        R.range(0.2, 0.8),
      );
    // corners collect dirt
    for (const [cx, cz] of [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x0, r.z1],
      [r.x1, r.z1],
    ])
      stain(
        dark,
        cx + (cx < r.cx ? 0.25 : -0.25),
        cz + (cz < r.cz ? 0.25 : -0.25),
        0.9 + k,
        0.9 + k,
      );
    // grime creeping up the wall bases, heavier in corners and behind doors
    for (const f of r.faces) {
      if (f.front) continue;
      for (let u = f.a + 0.4; u < f.b - 0.2; u += R.range(0.7, 1.5)) {
        if (f.openings.some((o) => u > o.a - 0.3 && u < o.b + 0.3)) continue;
        const q = P.onFace(f, u, 0.006),
          h = R.range(0.18, 0.4 + k * 0.5);
        G.plane(R.chance(0.5) ? dirt : dark, q.x, r.y0 + FY + h / 2, q.z, R.range(0.8, 1.7), h, {
          ry: q.ry,
          uvRect: BAND,
        });
      }
      if (wear > 0.4 && R.chance(wear * 0.6)) {
        const u = R.range(f.a + 0.4, f.b - 0.4),
          q = P.onFace(f, u, 0.007),
          h = R.range(0.5, 1.4);
        G.plane(dirt, q.x, r.ceilY - h / 2, q.z, R.range(0.25, 0.6), h, {
          ry: q.ry,
          rz: Math.PI,
          uvRect: BAND,
        });
      }
    } // water streak from the ceiling
    // ceiling: stains, and in drop ceilings a missing or sagging tile
    // r7: water-stained and discolored drop tiles (yellowed squares on the grid), more of them in worn stores
    if (r.ceilType === 'drop')
      for (let i = 0, n = Math.round(((0.5 + k * 3.5) * r.w * r.d) / 25); i < n; i++) {
        const tx = r.x0 + (R.int(0, Math.max(0, Math.floor(r.w / 0.6096) - 1)) + 0.5) * 0.6096,
          tz = r.z0 + (R.int(0, Math.max(0, Math.floor(r.d / 0.6096) - 1)) + 0.5) * 0.6096;
        if (tx > r.x1 - 0.3 || tz > r.z1 - 0.3) continue;
        G.plane(
          M.grime(R.pick(['#8a6a2c', '#6a4a1c', '#9a8a5a']), R.pick([0.25, 0.35, 0.5])),
          tx + R.jit(0.08),
          r.ceilY - 0.0035,
          tz + R.jit(0.08),
          R.range(0.35, 0.6),
          R.range(0.35, 0.6),
          { rx: Math.PI / 2, ry: R() * 6, uvRect: BL },
        );
      }
    for (let i = 0, n = Math.round((k * 4 * r.w * r.d) / 50); i < n; i++)
      G.plane(
        M.grime('#6a4a1c', 0.45),
        R.range(r.x0 + 0.5, r.x1 - 0.5),
        r.ceilY - 0.004,
        R.range(r.z0 + 0.5, r.z1 - 0.5),
        R.range(0.4, 1),
        R.range(0.4, 0.9),
        { rx: Math.PI / 2, ry: R() * 6, uvRect: BL },
      );
    if (r.ceilType === 'drop' && wear > 0.3)
      for (let i = 0, n = R.int(0, 1 + Math.round(wear * 2)); i < n; i++) {
        const tx = r.x0 + (R.int(1, Math.max(1, Math.floor(r.w / 0.61) - 2)) + 0.5) * 0.6096,
          tz = r.z0 + (R.int(1, Math.max(1, Math.floor(r.d / 0.61) - 2)) + 0.5) * 0.6096;
        G.plane(M.flat('#0b0b0c', { rough: 1 }), tx, r.ceilY - 0.003, tz, 0.57, 0.57, {
          rx: Math.PI / 2,
        });
        if (R.chance(0.5))
          G.box(M.surf('dropTile', { wear: 1 }), tx + 0.1, r.ceilY - 0.09, tz, 0.58, 0.012, 0.58, {
            rz: 0.3,
            uvw: 1.2,
          });
        G.tube(
          M.flat('#1a1a1c', {}),
          [
            [tx - 0.1, r.ceilY, tz + 0.1],
            [tx - 0.05, r.ceilY - 0.2, tz + 0.12],
            [tx + 0.05, r.ceilY - 0.34, tz + 0.05],
          ],
          0.006,
          { seg: 4 },
        );
      }
  }
  const S = P.front?.room || P.rooms[0];
  // traffic path from the door into the store (worn, darker), mop streaks (paler), mismatched replacement tiles
  {
    const dx = P.front?.door?.x ?? 0;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      stain(
        dirt,
        dx + (S.cx - dx) * t * 0.6 + R.jit(0.4),
        S.z1 - 0.8 - t * (S.d - 2.2),
        R.range(1.1, 1.8),
        R.range(1.2, 2.2),
        R.jit(0.4),
      );
    }
    stain(dark, dx, S.z1 - 0.9, 2.2, 1.6, 0);
    for (let i = 0, n = 2 + Math.round(wear * 3); i < n; i++)
      stain(
        pale,
        R.range(S.x0 + 1, S.x1 - 1),
        R.range(S.z0 + 1, S.z1 - 1),
        R.range(1.6, 3),
        R.range(0.35, 0.7),
        R() * 3,
        FY + 0.005,
      );
    const fs = S.floor || p.floor,
      tile = fs[0] === 'vct' ? 0.3048 : fs[0] === 'ceramic' ? 0.45 : 0;
    if (tile) {
      const m2 = M.surf(fs[0], {
        ...(fs[1] || {}),
        wear: 1,
        tint: R.pick(['#d9d2c0', '#c9cdd0', '#e6dcc0']),
      });
      for (let i = 0, n = 2 + Math.round(wear * 7); i < n; i++)
        G.plane(
          m2,
          S.x0 + (R.int(2, Math.floor(S.w / tile) - 3) + 0.5) * tile,
          FY + 0.0025,
          S.z0 + (R.int(2, Math.floor(S.d / tile) - 3) + 0.5) * tile,
          tile - 0.006,
          tile - 0.006,
          { rx: -Math.PI / 2 },
        );
    }
  }
  // daylight shafts through the glazing, with dust (color driven by the time of day in engine.js)
  if (ctx.front?.glazed?.length) {
    const sm = new THREE.MeshBasicMaterial({
      map: shaftTex(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0x000000,
      toneMapped: false,
    });
    sm.userData.order = 4;
    ctx.shaftMat = sm;
    ctx.disposables.push(sm);
    for (const b of ctx.front.glazed) {
      if (R.chance(0.25)) continue;
      const top = b.y1,
        run = R.range(2.2, 3.4),
        len = Math.hypot(top, run),
        ang = Math.atan2(run, top);
      G.plane(sm, b.x + R.jit(0.1), top / 2 + FY, S.z1 - 0.12 - run / 2, b.w, len, { rx: ang });
    }
  }
  // extension cord along a wall base to a power strip
  if (!p.venueWear) {
    const f = S.faces.find((q) => !q.front && q.len > 3);
    if (f) {
      const om = M.flat(R.pick(['#e8641e', '#e8c21e', '#1a1a1c']), { rough: 0.6 }),
        a = P.onFace(f, f.a + 0.6, 0.05),
        b = P.onFace(f, f.a + 0.6 + Math.min(f.len - 1.2, R.range(1.5, 4)), 0.09),
        pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([
          a.x + (b.x - a.x) * t + R.jit(0.03),
          FY + 0.008,
          a.z + (b.z - a.z) * t + R.jit(0.03),
        ]);
      }
      pts.unshift([a.x - f.nx * 0.04, 0.32, a.z - f.nz * 0.04]);
      G.tube(om, pts, 0.006, { seg: 5 });
      G.box(
        M.flat('#ecebe6', { rough: 0.4 }),
        a.x - f.nx * 0.045,
        0.34,
        a.z - f.nz * 0.045,
        0.075,
        0.115,
        0.012,
        { ry: a.ry },
      );
      G.box(M.flat('#f0efe8', { rough: 0.5 }), b.x, FY + 0.02, b.z, 0.26, 0.035, 0.05, {
        ry: a.ry + R.jit(0.4),
      });
    }
  }
  // delivery that has not been put away: a short stack of cartons with a packing slip, and flattened boxes leaning on a wall
  if (cl > 0.3 && !p.venueWear) {
    const d = ctx.pois.find((q) => q.tag === 'restock') || null,
      f = S.faces.find((q) => !q.front && P.spans(S, q.side, 1.2).length),
      sp = f ? P.spans(S, f.side, 1.2).find((s) => s.face === f) : null;
    if (sp) {
      const at = P.onFace(sp.face, R.range(sp.a + 0.5, sp.b - 0.5), 0.34),
        cb = M.surf('cardboard', { wear: 0.6 }),
        cb2 = M.surf('cardboard', { c: [156, 118, 80] });
      let y = FY;
      G.at(at.x, at.z, at.ry + R.jit(0.2), () => {
        for (let i = 0, n = R.int(2, 4); i < n; i++) {
          const w = R.range(0.36, 0.5),
            h = R.range(0.22, 0.34),
            dd = R.range(0.3, 0.42);
          G.boxB(i % 2 ? cb2 : cb, R.jit(0.04), y, R.jit(0.04), w, h, dd, { ry: R.jit(0.25) });
          G.box(M.flat('#d9c9a0', { rough: 0.8 }), 0, y + h + 0.001, 0, 0.05, 0.002, dd);
          y += h + 0.002;
        }
        G.plane(M.flat('#fbfaf2', { rough: 0.9 }), 0.05, y + 0.003, 0.03, 0.14, 0.2, {
          rx: -Math.PI / 2,
          ry: 0.3,
        });
        ctx.solid(-0.28, 0, -0.24, 0.28, y, 0.24, { occ: false });
        ctx.shadow(0, 0, 0.8, 0.7);
        for (let i = 0; i < 3; i++)
          G.box(cb, 0.55 + i * 0.03, 0.45, -0.22 + i * 0.012, 0.7, 0.9, 0.012, {
            rx: -0.12,
            ry: R.jit(0.06),
          });
      });
      P.take(
        sp.face,
        at.ry === 0 || Math.abs(at.ry) > 3 ? at.x - 0.5 : at.z - 0.5,
        (at.ry === 0 || Math.abs(at.ry) > 3 ? at.x : at.z) + 1,
      );
    }
    void d;
  }
  // crooked handwritten notices taped to the walls, sun-faded, with tape at the corners
  if (!p.venueWear) {
    const tape = M.flat('#e9dfb8', { rough: 0.4 });
    const kinds = R.shuffle(['help', 'bills', 'restroom', 'shirt', 'camera', 'nocash']);
    let n = 0;
    for (const f of S.faces) {
      if (f.front || n >= 1 + Math.round(cl * 2)) continue;
      const u = R.range(f.a + 0.5, f.b - 0.5);
      if (f.openings.some((o) => u > o.a - 0.4 && u < o.b + 0.4)) continue;
      const q = P.onFace(f, u, 0.012),
        pr = prints.notice(kinds[n++], { hand: true }),
        rz = R.jit(0.14),
        y = R.range(1.5, 1.85);
      G.plane(pr.mat, q.x, y, q.z, 0.28, 0.215, { ry: q.ry, rz, uvRect: pr.rect });
      for (const [a, b] of [
        [-0.13, 0.1],
        [0.13, 0.1],
      ]) {
        const c = Math.cos(rz),
          s = Math.sin(rz),
          ox = a * c - b * s,
          oy = a * s + b * c;
        G.box(
          tape,
          q.x + Math.cos(q.ry) * ox + f.nx * 0.002,
          y + oy,
          q.z - Math.sin(q.ry) * ox + f.nz * 0.002,
          0.05,
          0.018,
          0.002,
          { ry: q.ry, rz: rz + R.jit(0.5) },
        );
      }
    }
  }
  // r7: product and promo posters high on the shop walls (above the fixtures), a little crooked, some sun-faded
  if (!p.venueWear && ctx.store.type !== 'gas-convenience' && S.ceilY > 2.95) {
    const pids = [...new Set(ctx.items.slots.filter((q) => q.row === 0).map((q) => q.pid))];
    let n = 0;
    for (const f of S.faces) {
      if (f.front || !pids.length) continue;
      for (let u = f.a + 1.2; u < f.b - 0.8 && n < 4 + Math.round(cl * 6); u += R.range(2.2, 4.5)) {
        if (f.openings.some((o) => u > o.a - 0.6 && u < o.b + 0.6)) continue;
        const q = P.onFace(f, u, 0.012),
          pr = prints.poster(R.pick(pids)),
          w = 0.42,
          y = Math.min(S.ceilY - 0.36, 2.72);
        G.plane(pr.mat, q.x, y, q.z, w, w * 1.4, { ry: q.ry, rz: R.jit(0.04), uvRect: pr.rect });
        n++;
      }
    }
  }
  // stickers on the glass beside the door
  if (ctx.front?.glazed?.length && P.front?.door && !p.venueWear) {
    const dx = P.front.door.x,
      near = ctx.front.glazed.slice().sort((a, b) => Math.abs(a.x - dx) - Math.abs(b.x - dx))[0];
    ['camera', 'shirt', 'wecard'].forEach((k, i) => {
      if (!R.chance(0.75)) return;
      const pr = prints.notice(k, { hand: false });
      G.plane(
        pr.mat,
        near.x + R.jit(near.w * 0.25),
        near.y0 + 0.75 + i * 0.2,
        S.z1 - 0.045,
        0.16,
        0.12,
        { rz: R.jit(0.1), uvRect: pr.rect },
      );
      G.plane(
        M.flat('#f1efe6', { rough: 0.8 }),
        near.x,
        near.y0 + 0.75 + i * 0.2,
        S.z1 - 0.047,
        0.16,
        0.12,
        { ry: Math.PI },
      );
    });
  }
  // a product or two knocked onto the floor in front of its shelf
  {
    const cand = ctx.items.slots.filter(
      (s) =>
        s.row === 0 &&
        !s.host &&
        s.y < 1.2 &&
        s.zone &&
        !/lotto|impulse|coffee|roller|fountain|backbar/.test(s.zone),
    );
    for (let i = 0, n = cand.length ? R.int(1, 1 + Math.round(cl * 2)) : 0; i < n; i++) {
      const s = R.pick(cand),
        d = R.range(0.3, 0.6);
      ctx.items.add(
        s.pid,
        s.x + Math.sin(s.ry) * d + R.jit(0.15),
        FY + 0.03,
        s.z + Math.cos(s.ry) * d + R.jit(0.15),
        R() * 6.3,
        { rx: Math.PI / 2, zone: 'floor' },
      );
    }
  }
}
