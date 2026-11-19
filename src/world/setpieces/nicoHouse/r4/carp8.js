// r8 carpentry shared by the r8 parts (house, annex / lower deck, dock): level deck rails, stair flights with closed stringers, newels,
// handrails that die into the newels, balusters, one ramp collider per flight; white lattice panels. Everything in the frame Fr (H).
export function carpentry(ctx, Fr, Bt, r) {
  const { THREE, kit, mat } = ctx,
    M = kit.M,
    B = Bt,
    P = ctx.plan_r8 || {};
  const { hexa } = ctx.geo8;
  const C = ctx.colors8,
    RL = ctx.rail8,
    WOOD = mat.wood();
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0, Bb = B) =>
    Bb.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o });
  const gray = (k = 1) => kit.vary(kit.mul(C.deck, k), r, 0.08);
  const F = ctx.F8,
    rise = F / 20,
    run = 0.28;
  void P;
  const railRun = (ax, az, bx, bz, o = {}) => {
    const y0 = o.y ?? F,
      len = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / len,
      uz = (bz - az) / len,
      ry = Math.atan2(-uz, ux),
      n = Math.max(1, Math.round(len / 1.6)),
      top = y0 + RL.h;
    const at = (t) => [ax + ux * t, az + uz * t];
    for (let i = 0; i <= n; i++) {
      if ((i === 0 && o.noStart) || (i === n && o.noEnd)) continue;
      const [x, z] = at((len * i) / n);
      box(
        WOOD,
        RL.post,
        RL.h + 0.04,
        RL.post,
        x,
        y0 + (RL.h + 0.04) / 2 - 0.005,
        z,
        { grain: 1, color: gray(0.95), wear: 0.7, bevel: 0.008 },
        0,
        ry,
      );
    }
    for (let i = 0; i < n; i++) {
      const t0 = (len * i) / n + RL.post / 2 + 0.002,
        t1 = (len * (i + 1)) / n - RL.post / 2 - 0.002,
        l = t1 - t0,
        [x, z] = at((t0 + t1) / 2);
      box(WOOD, l, 0.09, 0.04, x, top - 0.1, z, { grain: 0, color: gray(0.92), wear: 0.6 }, 0, ry);
      box(WOOD, l, 0.04, 0.09, x, y0 + 0.1, z, { grain: 0, color: gray(0.9), wear: 0.6 }, 0, ry);
      const nb = Math.max(1, Math.floor(l / RL.oc)),
        sp = l / (nb + 1),
        bh = top - 0.145 - (y0 + 0.12);
      for (let k = 1; k <= nb; k++) {
        const [bxx, bzz] = at(t0 + sp * k);
        box(
          WOOD,
          RL.bal,
          bh,
          RL.bal,
          bxx,
          y0 + 0.12 + bh / 2 + 0.001,
          bzz,
          { grain: 1, color: gray(0.86 + r() * 0.2), wear: 0.55 + r() * 0.3, bevel: 0.005 },
          0,
          ry,
        );
      }
    }
    const nc = Math.max(1, Math.round(len / 3.6));
    for (let i = 0; i < nc; i++) {
      const [x, z] = at((len * (i + 0.5)) / nc);
      box(
        WOOD,
        len / nc - 0.004 + (i === nc - 1 ? 0.06 : 0),
        0.04,
        0.145,
        x,
        top + 0.02,
        z,
        { grain: 0, color: gray(0.96), wear: 0.65, bevel: 0.008 },
        0,
        ry,
      );
    }
    Fr.col.box((ax + bx) / 2, y0 + 0.6, (az + bz) / 2, len, 1.2, 0.12, { ry, tag: 'rail' });
  };
  // flight: n treads going down along dir from the head edge (x, z at the nosing line of the head, y0 = the head's surface); risers of
  // `rr`, treads of `rn`; closed 2x12 stringers both sides; a newel at the head (o.headNewels) and at the foot of each side, the
  // handrail (cap + sub rail) between the newels at 0.9 m over the nosing line, balusters from the stringer to the sub rail
  const flight = (o) => {
    const Y = o.y0,
      rr = o.rise ?? rise,
      rn = o.run ?? run,
      n = o.n,
      w = o.w,
      [dx, dz] = o.dir,
      px = -dz,
      pz = dx,
      ry = Math.atan2(-dz, dx);
    const total = n * rn,
      drop = (n + 1) * rr,
      yFoot = Y - drop,
      at = (t, y, s = 0) => [o.x + dx * t + px * s, y, o.z + dz * t + pz * s];
    Fr.flight({ x: o.x, z: o.z, y: Y, dir: o.dir, n, w, rise: rr, run: rn });
    const ST = 0.045,
      inner = w / 2 - ST; // treads sit between the stringers
    for (let i = 1; i <= n; i++) {
      const y = Y - rr * i,
        t0 = rn * (i - 1);
      for (const k of [0, 1]) {
        const p = at(t0 + 0.075 + k * 0.142, y - 0.018);
        box(
          WOOD,
          0.136,
          0.036,
          inner * 2 - 0.004,
          p[0],
          p[1],
          p[2],
          { grain: 2, color: gray(0.82 + r() * 0.26), wear: 0.5 + r() * 0.4, bevel: 0.006 },
          0,
          ry,
        );
      }
      const rp = at(t0 + rn - 0.03, y - rr / 2 - 0.02);
      if (o.risers !== false)
        box(
          WOOD,
          0.02,
          rr - 0.04,
          inner * 2 - 0.01,
          rp[0],
          rp[1],
          rp[2],
          { grain: 2, color: gray(0.7), wear: 0.5, bevel: 0.002 },
          0,
          ry,
        );
    }
    // closed stringers: sloped slab, top edge 5 cm over the nosing line, 0.29 deep, plumb cut at the head, level cut on the foot
    const slope = rr / rn,
      sl = Math.atan(slope);
    for (const sd of [-1, 1]) {
      const s = sd * (w / 2 - ST / 2),
        ta = 0.1,
        tb = total + rn * 0.35,
        yTop = (t) => Y + 0.04 - t * slope,
        Dp = 0.29 / Math.cos(sl);
      const a0 = at(ta, 0, s - ST / 2),
        a1 = at(ta, 0, s + ST / 2),
        b0 = at(tb, 0, s - ST / 2),
        b1 = at(tb, 0, s + ST / 2),
        yb = (t) => Math.max(yFoot, yTop(t) - Dp);
      hexa(
        B,
        WOOD,
        [
          [a0[0], yb(ta), a0[2]],
          [b0[0], yb(tb), b0[2]],
          [b1[0], yb(tb), b1[2]],
          [a1[0], yb(ta), a1[2]],
          [a0[0], yTop(ta), a0[2]],
          [b0[0], yTop(tb), b0[2]],
          [b1[0], yTop(tb), b1[2]],
          [a1[0], yTop(ta), a1[2]],
        ],
        { color: gray(0.84), wear: 0.7 },
      );
    }
    // one ramp collider through the nosings (the player's controller climbs 32 deg ramps; autostep would catch on the treads)
    const L = Math.hypot(total + rn, drop),
      mid = at((total + rn) / 2, Y - drop / 2 - 0.12 / Math.cos(sl));
    Fr.col.boxQ(
      mid,
      [L / 2, 0.12, w / 2 - 0.02],
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, ry, -Math.atan2(drop, total + rn), 'YXZ'),
      ),
      { tag: 'stair', surface: 'wood' },
    );
    // handrails
    const railTop = (t) => Y + 0.9 - t * slope,
      tHead = o.tHead ?? -0.06,
      tFoot = total + rn * 0.55;
    for (const sd of [-1, 1]) {
      if (o.skipSide === sd) continue;
      const s = sd * (w / 2 + 0.05);
      const newel = (t, yBase, h) => {
        const p = at(t, 0, s);
        box(
          WOOD,
          0.1,
          h,
          0.1,
          p[0],
          yBase + h / 2,
          p[2],
          { grain: 1, color: gray(0.92), wear: 0.7, bevel: 0.01 },
          0,
          ry,
        );
        box(
          WOOD,
          0.13,
          0.03,
          0.13,
          p[0],
          yBase + h + 0.015,
          p[2],
          { color: gray(0.96), wear: 0.6 },
          0,
          ry,
        );
        return p;
      };
      if (o.headNewels === true || (Array.isArray(o.headNewels) && o.headNewels.includes(sd)))
        newel(tHead, o.headBase ?? Y - 0.3, Y + 1.02 - (o.headBase ?? Y - 0.3));
      const fb = o.footBase ?? yFoot;
      newel(tFoot, fb, yFoot + 1.02 - fb);
      const ta = tHead + 0.06,
        tb = tFoot - 0.06;
      const c0 = at(ta, railTop(ta) + 0.02, s),
        c1 = at(tb, railTop(tb) + 0.02, s);
      B.strut(WOOD, c0, c1, 0.14, 0.04, { color: gray(0.96), wear: 0.6, bevel: 0.007, rand: r });
      const s0 = at(ta, railTop(ta) - 0.06, s),
        s1 = at(tb, railTop(tb) - 0.06, s);
      B.strut(WOOD, s0, s1, 0.045, 0.085, { color: gray(0.9), wear: 0.6, bevel: 0.005, rand: r });
      for (let t = ta + 0.09; t < tb - 0.05; t += 0.135) {
        const yb = Y + 0.04 - t * slope,
          yt = railTop(t) - 0.1;
        const p = at(t, 0, s);
        box(
          WOOD,
          RL.bal,
          yt - yb,
          RL.bal,
          p[0],
          (yt + yb) / 2,
          p[2],
          { grain: 1, color: gray(0.86 + r() * 0.2), wear: 0.6, bevel: 0.005 },
          0,
          ry,
        );
      }
      const m = at((ta + tb) / 2, (railTop(ta) + railTop(tb)) / 2 - 0.45, s);
      Fr.col.boxQ(
        m,
        [Math.hypot(tb - ta, railTop(ta) - railTop(tb)) / 2, 0.55, 0.05],
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, -sl, 'YXZ')),
        { tag: 'rail' },
      );
    }
    return { total, drop, yFoot, tFoot };
  };
  const LATW = mat.paint({ peel: 'a', fade: 0.6, gloss: 0.9 });
  const lattice = (x, z, dir, len, yA, yB, o = {}) => {
    const [dx, dz] = dir,
      ry = Math.atan2(-dz, dx),
      col = kit.vary(0xbdb6a5, r, 0.05),
      pL = 0.115,
      nx = -dz,
      nz = dx;
    for (const [layer, sgn] of [
      [0, 1],
      [1, -1],
    ])
      for (let k = -60; k < 90; k++) {
        const c0 = k * pL,
          pts = [];
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const u = t * len,
            yTop = yA + (yB - yA) * t,
            y = sgn > 0 ? u - c0 : c0 - u;
          if (y >= 0.08 && y <= yTop - 0.05) pts.push([u, y]);
        }
        if (pts.length < 2) continue;
        const [u0, y0] = pts[0],
          [u1, y1] = pts[pts.length - 1],
          L = Math.hypot(u1 - u0, y1 - y0);
        if (L < 0.08) continue;
        const um = (u0 + u1) / 2,
          off = layer ? 0.007 : -0.007;
        box(
          LATW,
          0.038,
          L,
          0.012,
          x + dx * um + nx * off,
          (y0 + y1) / 2,
          z + dz * um + nz * off,
          { color: col, wear: 0.5, bevel: 0.003 },
          0,
          ry,
          Math.atan2(u1 - u0, y1 - y0) * -1,
        );
      }
    box(
      LATW,
      len,
      0.07,
      0.05,
      x + (dx * len) / 2,
      0.07,
      z + (dz * len) / 2,
      { color: col, wear: 0.6 },
      0,
      ry,
    );
    for (const u of [0.025, len - 0.025])
      box(
        LATW,
        0.05,
        (u < 1 ? yA : yB) - 0.02,
        0.06,
        x + dx * u,
        ((u < 1 ? yA : yB) - 0.02) / 2,
        z + dz * u,
        { color: col, wear: 0.5 },
        0,
        ry,
      );
    if (o.col !== false)
      Fr.col.box(x + (dx * len) / 2, 0.7, z + (dz * len) / 2, len, 1.4, 0.08, {
        ry,
        tag: 'lattice',
      });
  };
  return { railRun, flight, lattice };
}
