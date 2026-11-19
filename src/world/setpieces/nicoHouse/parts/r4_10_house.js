// Nico's house, round 4 (user mock-ups docs/v2/plan/nico_house/r4/01-10): the raised Keys stilt house itself.
// Whitewashed 10x10 posts with knee braces on a square-paver slab, doubled beams and joists, a wraparound deck (N, E, S)
// with real balusters, the west front stair (10, lattice under it) and the back stair to the lawn (08), weathered teal
// board-and-batten walls with real boards and battens, white casings, board shutters, the centered nine-lite dark front
// door (03), the living-room slider to the back deck (06), a low gable roof: patched asphalt shingles on the front slope
// (01, repair in progress) and standing-seam metal on the back slope (08), exposed rafter tails, the yellow extension ladder,
// the satellite dish, the service drop, the enclosed ground-floor room under the east end (10) and the basketball hoop.
// Every piece is a closed, beveled solid; faces that would touch are cut or offset (no coplanar faces).
// Street frame (r4/plan4.js), built through r4/frame.js.
import { R4, P4, inR } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { glb } from '../r4/glb.js';
import { POLES, SERVICE_POLE } from '../yard.data.js';
import { toS, StoH } from '../r4/plan4.js';
export const order = 10;

export function build(ctx) {
  if (!R4) return;
  const { THREE, kit, mat } = ctx,
    Fr = frame(ctx, 'house'),
    Lot = frame(ctx),
    B = Fr.ext,
    D = Fr.detail,
    M = kit.M,
    P = P4,
    C = P.colors,
    r = kit.rng(404);
  const { hexa, subtract, lathe } = makeGeo(THREE, kit);
  const F = P.F,
    db = P.board,
    J = P.joist,
    BM = P.beam,
    joistTop = F - db.t,
    joistBot = joistTop - J.d,
    beamTop = joistBot,
    beamBot = beamTop - BM.d,
    yT = F + P.wallH;
  ctx.r4 = { F, yT, beamBot };
  const WOOD = mat.wood(),
    WHITE = mat.paint({ peel: 'a', fade: 0.55, gloss: 0.93 }),
    TEAL = mat.paint({ peel: 'b', fade: 0.45, gloss: 0.92, scale: 1.2 }),
    DOORP = mat.paint({ peel: 'a', fade: 0.15, gloss: 0.72, scale: 0.6 });
  const GLASS = mat.glass(),
    PLAST = mat.plastic(),
    STEEL = mat.steel(),
    CONC = mat.concrete(),
    RUB = mat.rubber(),
    MP = mat.metalPaint();
  const gray = (k = 1) => kit.vary(kit.mul(C.deck, k), r, 0.08),
    dark = () => kit.vary(C.deckDark, r, 0.09);
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0, Bt = B) =>
    Bt.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o });
  const hc = (x) => +x.toFixed(4);

  // ================= posts, footings, beams, joists, rims =================
  const posts = [];
  for (const x of P.postXs)
    for (const z of P.postZs) {
      if (x === -2.2 && z === -7.0) continue; // open drive-through bay (10)
      posts.push([x, z]);
    }
  const ps = P.post;
  for (const [x, z] of posts) {
    const h = beamBot + 0.002 - 0.05,
      lean = (r() - 0.5) * 0.008;
    box(
      WHITE,
      ps,
      h,
      ps,
      x,
      0.05 + h / 2,
      z,
      { grain: 1, color: kit.vary(C.post, r, 0.04), wear: [0.95, 0.55 + r() * 0.2], bevel: 0.012 },
      lean,
      (r() - 0.5) * 0.02,
      lean * 0.6,
    );
    // galvanized post base plate on its little concrete pier (stands on the pavers)
    box(CONC, ps + 0.12, 0.1, ps + 0.12, x, 0.05, z, {
      color: kit.vary(0xc9c4b6, r, 0.05),
      wear: 0.8,
      bevel: 0.02,
    });
    Fr.col.box(x, 1.6, z, ps + 0.02, 3.2, ps + 0.02, { tag: 'pile' });
  }
  // beams along X on every Z line: 3-ply 2x12, top flush with the joist bottoms, ends cut 2 cm past the outer posts
  const W0 = P.W0,
    BZ0 = P.BZ0,
    beamLines = [BZ0, -10.4, -7.0, -3.6, -1.6].map((z) => ({ z, x0: W0, x1: 8.5 }));
  for (const L of beamLines) {
    const x0 = L.x0 - ps / 2 - 0.02,
      x1 = L.x1 + ps / 2 + 0.02,
      n = Math.ceil((x1 - x0) / 5.2);
    for (let i = 0; i < n; i++) {
      const a = x0 + ((x1 - x0) * i) / n,
        b = x0 + ((x1 - x0) * (i + 1)) / n - 0.004;
      box(WOOD, b - a, BM.d, 0.16, (a + b) / 2, beamBot + BM.d / 2, L.z, {
        grain: 0,
        color: dark(),
        wear: 0.55,
        bevel: 0.006,
        shade: [0.82, 1],
      });
    }
  }
  // knee braces (4x4) from the posts up to the beams, both ways on the perimeter posts (02 / 08)
  const knee = (px, pz, dx, dz) => {
    const a = [px + dx * (ps / 2), beamBot - 0.7, pz + dz * (ps / 2)],
      b = [px + dx * 0.72, beamBot - 0.01, pz + dz * 0.72];
    B.strut(WHITE, a, b, 0.09, 0.09, {
      color: kit.vary(C.post, r, 0.05),
      wear: 0.75,
      bevel: 0.008,
      rand: r,
    });
  };
  for (const [x, z] of posts) {
    const onX = beamLines.find((L) => Math.abs(L.z - z) < 0.01);
    if (onX) {
      if (x > onX.x0 + 0.1) knee(x, z, -1, 0);
      if (x < onX.x1 - 0.1) knee(x, z, 1, 0);
    }
    if (x === W0 || x === 8.5) {
      if (z > BZ0 + 0.1) knee(x, z, 0, -1);
      if (z < -1.7) knee(x, z, 0, 1);
    }
  }
  // joists along Z (on the beams), the platform outline per x
  const zSpan = () => [BZ0 - 0.08, -1.6 + 0.08];
  const jx = [];
  for (let x = W0 - ps / 2 + 0.03; x < 8.5 + ps / 2 - 0.02; x += J.oc) jx.push(x);
  for (const x of jx) {
    const [z0, z1] = zSpan(x);
    box(WOOD, J.t, J.d, z1 - z0 - 0.004, x, joistBot + J.d / 2, (z0 + z1) / 2, {
      grain: 2,
      color: kit.vary(kit.mul(C.deckDark, 0.95), r, 0.1),
      wear: 0.4,
      bevel: 0.003,
      shade: [0.8, 1],
    });
  }
  // rim boards around the platform (the visible deck edge band), proud of the joist ends
  const rim = (x0, z0, x1, z1) => {
    const hz = Math.abs(z1 - z0) < 0.01,
      len = hz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    box(
      WOOD,
      hz ? len : 0.045,
      J.d + 0.02,
      hz ? 0.045 : len,
      (x0 + x1) / 2,
      joistBot + J.d / 2 + 0.005,
      (z0 + z1) / 2,
      { grain: hz ? 0 : 2, color: gray(0.9), wear: 0.7, bevel: 0.006, shade: [0.85, 1] },
    );
  };
  const ex = 0.0225,
    E0 = BZ0 - 0.08 - ex,
    E1 = -1.6 + 0.08 + ex;
  const RX0 = W0 - ps / 2 - 0.05,
    RX1 = 8.5 + ps / 2 + 0.05;
  rim(RX0, E0, RX1 + 0.02, E0);
  rim(RX0, E1, RX1 + 0.02, E1);
  rim(RX1, E0 + ex, RX1, E1 - ex);
  rim(RX0 + ex, E0 + ex, RX0 + ex, E1 - ex);
  // plywood subfloor under the rooms (seen from below), joints between sheets
  const PLY = mat.pbr('plywood', { rep: 1.2, grunge: true }),
    Bd = P.body;
  for (let x = Bd.x0; x < Bd.x1 - 0.01; x += 2.44)
    for (let z = Bd.z0; z < Bd.z1 - 0.01; z += 1.22) {
      const sx = Math.min(2.44, Bd.x1 - x),
        sz = Math.min(1.22, Bd.z1 - z);
      box(PLY, sx - 0.006, 0.019, sz - 0.006, x + sx / 2, joistTop + 0.0095 - 0.0005, z + sz / 2, {
        color: kit.vary(0x8f7d62, r, 0.12),
        wear: 0.8,
        bevel: 0,
      });
    }

  // ================= deck boards (along X), screws =================
  const pitch = db.w + db.gap,
    snap = (x) => jx.reduce((b, j) => (Math.abs(j - x) < Math.abs(b - x) ? j : b), jx[0]);
  const screws = [];
  const deckRow = (z, x0, x1) => {
    let x = x0;
    while (x < x1 - 0.01) {
      let xe = x + [2.44, 3.05, 3.66, 4.27, 4.88][Math.floor(r() * 5)];
      xe = xe > x1 - 0.8 ? x1 : Math.min(x1, snap(xe));
      if (xe - x < 0.3) xe = x1;
      const fresh = r() < 0.04,
        tone = fresh ? kit.vary(0xc9b48a, r, 0.06) : gray(0.86 + r() * 0.24),
        len = xe - x - 0.005;
      box(
        WOOD,
        len,
        db.t,
        db.w,
        (x + xe) / 2,
        F - db.t / 2 + (r() - 0.5) * 0.002,
        z,
        { grain: 0, color: tone, wear: fresh ? 0.1 : 0.35 + r() * 0.5, bevel: 0.005 },
        (r() - 0.5) * 0.008,
      );
      for (const j of jx)
        if (j > x + 0.03 && j < xe - 0.03)
          for (const dz of [-0.04, 0.04]) screws.push(M(j, F + 0.0006, z + dz));
      x = xe;
    }
  };
  for (let z = BZ0 - 0.08 + pitch / 2; z < -1.6 + 0.08 - db.w / 2 + 0.01; z += pitch) {
    if (z < -10.4 - db.w / 2 || z > -3.6 + db.w / 2) deckRow(z, RX0 + 0.02, RX1 + 0.04);
    else {
      deckRow(z, RX0 + 0.02, -6.5 - 0.17);
      deckRow(z, 6.5 + 0.17, RX1 + 0.04);
    }
  }
  {
    const g = new THREE.CylinderGeometry(0.004, 0.004, 0.002, 6);
    const sm = kit.instances(g, mat.steel(), screws, null);
    sm.name = 'r4screws';
    Fr.groups.detail.add(sm);
  }
  // deck / floor colliders (one per region; the room floors too)
  for (const R of [P.deckN, P.deckE, P.deckS, P.deckW, Bd])
    Fr.col.box(
      (R.x0 + R.x1) / 2,
      F - 0.16,
      (R.z0 + R.z1) / 2,
      R.x1 - R.x0 + 0.12,
      0.32,
      R.z1 - R.z0 + 0.12,
      { tag: R === Bd ? 'floor' : 'deck', surface: 'wood' },
    );

  // ================= rails =================
  const RL = P.rail,
    railY = F + RL.h;
  const railRun = (ax, az, bx, bz, o = {}) => {
    const len = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / len,
      uz = (bz - az) / len,
      ry = Math.atan2(-uz, ux),
      n = Math.max(1, Math.round(len / 1.6));
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
        F + (RL.h + 0.04) / 2 - 0.005,
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
      box(
        WOOD,
        l,
        0.09,
        0.04,
        x,
        railY - 0.1,
        z,
        { grain: 0, color: gray(0.92), wear: 0.6 },
        0,
        ry,
      ); // top rail under the cap
      box(WOOD, l, 0.04, 0.09, x, F + 0.1, z, { grain: 0, color: gray(0.9), wear: 0.6 }, 0, ry); // bottom rail
      const nb = Math.max(1, Math.floor(l / RL.oc)),
        sp = l / (nb + 1),
        bh = railY - 0.145 - (F + 0.12);
      for (let k = 1; k <= nb; k++) {
        const [bxx, bzz] = at(t0 + sp * k);
        box(
          WOOD,
          RL.bal,
          bh,
          RL.bal,
          bxx,
          F + 0.12 + bh / 2 + 0.001,
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
        len / nc - 0.004 + (o.capX || 0),
        0.04,
        0.145,
        x,
        railY + 0.02,
        z,
        { grain: 0, color: gray(0.96), wear: 0.65, bevel: 0.008 },
        0,
        ry,
      );
    }
    Fr.col.box((ax + bx) / 2, F + 0.55, (az + bz) / 2, len, 1.1, 0.12, { ry, tag: 'rail' });
  };
  // ================= rails: the deck wraps the whole house, tight (user review), open only at the two stair heads =================
  const e = 0.06,
    RE = { x0: RX0 + e, x1: RX1 - e, z0: E0 + e, z1: E1 - e },
    SWs = P.stairW,
    SEs = P.stairE;
  // r7 (playtest item 2, mock-ups 08 / 10): the back stair runs down ALONG the back face from a head pad off the back deck's east part
  // (08: top at the left seen from the water, foot on the lawn toward the middle); the back rail opens only at that pad
  const BKL = P.stairN.land;
  railRun(RE.x0, RE.z0, BKL.x0, RE.z0, {});
  railRun(BKL.x1, RE.z0, RE.x1, RE.z0, {}); // back (bay) side, open at the stair head
  // r7b (user's MAIN mock-up 11, from the driveway): the main stair leaves a head pad at the deck's FRONT-EAST corner (the dish is on
  // its post) and runs down to the east in two flights with a landing to a step platform in front of the ANNEX; the east rail
  // opens for the few steps down to the annex's roof deck (the lower back-deck level)
  const MS = P.mainStair,
    NP = MS.pad,
    pzo = NP.z1;
  railRun(RE.x1, RE.z0, RE.x1, MS.annexStep.z0, { noStart: true }); // east side, open at the annex steps
  railRun(RE.x1, MS.annexStep.z1, RE.x1, RE.z1, {}); // (ends in the front-east corner post)
  const FP = P.stairF.pad;
  void FP;
  railRun(RE.x1, RE.z1, NP.x1, RE.z1, { noStart: true }); // front, from the east corner to the stair-head pad
  railRun(RE.x0, RE.z0, RE.x0, pzo, { noStart: true }); // west side, on along the pad's west edge

  // ================= stairs: two short flights with a 1.2 m landing, running down ALONG the side of the house (02, 08, 10) =================
  const rise = F / 20,
    run = P.run;
  const flight = (o) => {
    const Y = o.y0 ?? F;
    Fr.flight({ x: o.x, z: o.z, y: Y, dir: o.dir, n: o.n, w: o.w, rise, run });
    const [dx, dz] = o.dir,
      px = -dz,
      pz = dx,
      n = o.n,
      ry = Math.atan2(-dz, dx),
      total = n * run,
      drop = (n + 1) * rise;
    const at = (t, y, s = 0) => [o.x + dx * t + px * s, y, o.z + dz * t + pz * s];
    for (let i = 1; i <= n; i++) {
      const y = Y - rise * i;
      for (const k of [0, 1]) {
        const p = at(run * (i - 1) + 0.075 + k * 0.142, y - 0.018);
        box(
          WOOD,
          0.136,
          0.036,
          o.w - 0.1,
          p[0],
          p[1],
          p[2],
          { grain: 2, color: gray(0.82 + r() * 0.26), wear: 0.5 + r() * 0.4, bevel: 0.006 },
          0,
          ry,
        );
      }
    }
    // 2x12 stringers as solid slabs following the flight
    for (const s of [-1, 1]) {
      const a = at(-0.05, Y - 0.06, s * (o.w / 2 - 0.025)),
        b = at(total + 0.12, Y - drop + 0.12, s * (o.w / 2 - 0.025));
      B.strut(WOOD, a, b, 0.045, 0.29, { color: gray(0.85), wear: 0.7, bevel: 0.006, rand: r });
    }
    const slope = Math.atan2(drop, total + run),
      sl = Math.hypot(drop, total + run),
      mid = at((total + run) / 2 - 0.1 * Math.sin(slope), Y - drop / 2 - 0.1 * Math.cos(slope));
    Fr.col.boxQ(
      mid,
      [sl / 2 + 0.05, 0.1, o.w / 2],
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, -slope, 'YXZ')),
      { tag: 'stair', surface: 'wood' },
    );
    // sloped rails: posts at the foot and the head, cap + sub rail, balusters
    for (const s of [-1, 1]) {
      if (o.skipSide === s) continue;
      const off = s * (o.w / 2 + 0.03),
        top = at(0.05, Y + RL.h, off),
        bot = at(total + run - 0.08, Y - drop + RL.h - 0.05, off);
      B.strut(WOOD, top, bot, 0.14, 0.04, {
        color: gray(0.95),
        wear: 0.6,
        bevel: 0.007,
        rand: r,
        roll: Math.PI / 2,
      });
      const tl = [top[0], top[1] - 0.12, top[2]],
        bl = [bot[0], bot[1] - 0.12, bot[2]];
      B.strut(WOOD, tl, bl, 0.04, 0.09, { color: gray(0.9), wear: 0.6, bevel: 0.005, rand: r });
      const bp = at(total + run - 0.08, 0, off);
      box(
        WOOD,
        0.1,
        Y - drop + RL.h + 0.05,
        0.1,
        bp[0],
        (Y - drop + RL.h + 0.05) / 2,
        bp[2],
        { grain: 1, color: gray(0.9), wear: 0.7, bevel: 0.008 },
        0,
        ry,
      );
      for (let t = 0.22; t < total; t += 0.14) {
        const yb = Y - (t / run + 0.6) * rise,
          p = at(t, 0, off),
          ytop = Y + RL.h - 0.12 - (t - 0.05) * Math.tan(slope) - 0.03,
          ybot = yb + 0.03;
        if (ytop - ybot < 0.3) continue;
        box(
          WOOD,
          RL.bal,
          ytop - ybot,
          RL.bal,
          p[0],
          (ytop + ybot) / 2,
          p[2],
          { grain: 1, color: gray(0.86 + r() * 0.2), wear: 0.6, bevel: 0.005 },
          0,
          ry,
        );
      }
      Fr.col.boxQ(
        at((total + run) / 2, Y - drop / 2 + 0.55, off),
        [sl / 2, 0.55, 0.05],
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, -slope, 'YXZ')),
        { tag: 'rail' },
      );
    }
    return { total, drop };
  };
  // lattice skirt under the west stair (10): real diagonal strips in a frame, two layers, no cards
  const lattice = (x, z0, z1, yTop0, yTop1, o = {}) => {
    const LW = mat.paint({ peel: 'a', fade: 0.6, gloss: 0.9 }),
      col = kit.vary(C.white, r, 0.04),
      len = z1 - z0,
      pitchL = 0.115;
    for (const [layer, sgn] of [
      [0, 1],
      [1, -1],
    ]) {
      for (let k = -40; k < 80; k++) {
        const c0 = k * pitchL; // strip along u - sgn * y = c0 (45 deg)
        const pts = [];
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const u = t * len,
            yTop = yTop0 + (yTop1 - yTop0) * t,
            y = sgn > 0 ? u - c0 : c0 - u + 0;
          if (y >= 0.08 && y <= yTop - 0.05) pts.push([u, y]);
        }
        if (pts.length < 2) continue;
        const [u0, y0] = pts[0],
          [u1, y1] = pts[pts.length - 1],
          L = Math.hypot(u1 - u0, y1 - y0);
        if (L < 0.08) continue;
        box(
          LW,
          0.012,
          L,
          0.038,
          x + (layer ? 0.007 : -0.007),
          (y0 + y1) / 2,
          z0 + (u0 + u1) / 2,
          { color: col, wear: 0.5, bevel: 0.003 },
          -Math.atan2(u1 - u0, y1 - y0),
        );
      }
    }
    for (const [zz] of [[z0], [z1]])
      box(LW, 0.05, Math.max(yTop0, yTop1), 0.07, x, Math.max(yTop0, yTop1) / 2, zz, {
        color: col,
        wear: 0.5,
      });
    box(LW, 0.05, 0.07, len, x, 0.07, (z0 + z1) / 2, { color: col, wear: 0.6 });
    if (o.col) Fr.col.box(x, 0.8, (z0 + z1) / 2, 0.1, 1.6, len, { tag: 'lattice' });
  };
  const latticeTo = (LB, x, z0, z1, yTop0, yTop1) => {
    const LW = mat.paint({ peel: 'a', fade: 0.6, gloss: 0.93 }),
      col = kit.vary(C.white, r, 0.04),
      len = z1 - z0,
      pitchL = 0.115;
    for (const [layer, sgn] of [
      [0, 1],
      [1, -1],
    ])
      for (let k = -40; k < 80; k++) {
        const c0 = k * pitchL,
          pts = [];
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const u = t * len,
            yTop = yTop0 + (yTop1 - yTop0) * t,
            y = sgn > 0 ? u - c0 : c0 - u;
          if (y >= 0.08 && y <= yTop - 0.05) pts.push([u, y]);
        }
        if (pts.length < 2) continue;
        const [u0, y0] = pts[0],
          [u1, y1] = pts[pts.length - 1],
          L = Math.hypot(u1 - u0, y1 - y0);
        if (L < 0.08) continue;
        LB.box(
          LW,
          0.012,
          L,
          0.038,
          M(
            x + (layer ? 0.007 : -0.007),
            (y0 + y1) / 2,
            z0 + (u0 + u1) / 2,
            -Math.atan2(u1 - u0, y1 - y0),
          ),
          { color: col, wear: 0.5, bevel: 0.003 },
        );
      }
    LB.box(LW, 0.05, 0.07, len, M(x, 0.07, (z0 + z1) / 2), { color: col, wear: 0.6 });
  };
  const sideStair = (S2, sgnX) => {
    // sgnX: -1 west side (runs +Z toward the front corner), +1 east side (runs -Z toward the bay corner)
    const pd = S2.pad,
      xc = (pd.x0 + pd.x1) / 2,
      dirZ = sgnX < 0 ? 1 : -1,
      yL = F - 10 * rise;
    // head pad at deck level outside the deck edge: joists, boards, two posts
    for (let z = pd.z0 + pitch / 2; z < pd.z1 - 0.02; z += pitch)
      box(WOOD, pd.x1 - pd.x0, db.t, db.w, xc, F - db.t / 2, z, {
        grain: 0,
        color: gray(0.9 + r() * 0.2),
        wear: 0.5,
        bevel: 0.005,
      });
    for (const zz of [pd.z0 + 0.06, pd.z1 - 0.06])
      box(WOOD, pd.x1 - pd.x0, J.d, J.t, xc, joistBot + J.d / 2, zz, {
        grain: 0,
        color: dark(),
        wear: 0.4,
      });
    const xo = sgnX < 0 ? pd.x0 + 0.06 : pd.x1 - 0.06,
      zBack = dirZ > 0 ? pd.z0 + 0.06 : pd.z1 - 0.06;
    for (const zz of [pd.z0 + 0.06, pd.z1 - 0.06]) {
      box(WHITE, 0.14, beamTop - 0.05, 0.14, xo, 0.05 + (beamTop - 0.05) / 2, zz, {
        grain: 1,
        color: kit.vary(C.post, r, 0.04),
        wear: [0.95, 0.6],
        bevel: 0.01,
      });
      Fr.col.box(xo, 1.6, zz, 0.16, 3.2, 0.16, { tag: 'pile' });
    }
    Fr.col.box(xc, F - 0.16, (pd.z0 + pd.z1) / 2, pd.x1 - pd.x0 + 0.1, 0.32, pd.z1 - pd.z0, {
      tag: 'deck',
      surface: 'wood',
    });
    railRun(xo, zBack, xo, dirZ > 0 ? pd.z1 : pd.z0, { noEnd: true });
    railRun(sgnX < 0 ? RE.x0 : RE.x1, zBack, xo, zBack, { noStart: true });
    // flight 1 (10 risers) from the pad, the landing, flight 2 (10 risers) to the ground
    const z1 = dirZ > 0 ? pd.z1 : pd.z0,
      f1 = flight({
        x: xc,
        z: z1,
        y0: F,
        dir: [0, dirZ],
        n: 9,
        w: pd.x1 - pd.x0 - 0.1,
        skipSide: -1,
      });
    const lz0 = z1 + dirZ * (f1.total + run),
      lz1 = lz0 + dirZ * 1.2,
      la = Math.min(lz0, lz1),
      lb = Math.max(lz0, lz1);
    for (let z = la + pitch / 2; z < lb - 0.02; z += pitch)
      box(WOOD, pd.x1 - pd.x0, db.t, db.w, xc, yL - db.t / 2, z, {
        grain: 0,
        color: gray(0.9 + r() * 0.2),
        wear: 0.5,
        bevel: 0.005,
      });
    for (const x of [pd.x0 + 0.06, pd.x1 - 0.06])
      box(WOOD, J.t, 0.2, lb - la, x, yL - db.t - 0.1, (la + lb) / 2, {
        grain: 2,
        color: dark(),
        wear: 0.4,
      });
    for (const x of [pd.x0 + 0.06, pd.x1 - 0.06])
      for (const z of [la + 0.06, lb - 0.06]) {
        box(WHITE, 0.12, yL + RL.h, 0.12, x, (yL + RL.h) / 2, z, {
          grain: 1,
          color: kit.vary(C.post, r, 0.04),
          wear: [0.95, 0.6],
          bevel: 0.01,
        });
        Fr.col.box(x, (yL + RL.h) / 2, z, 0.14, yL + RL.h, 0.14, { tag: 'pile' });
      }
    Fr.col.box(xc, yL - 0.1, (la + lb) / 2, pd.x1 - pd.x0, 0.2, lb - la, {
      tag: 'deck',
      surface: 'wood',
    });
    {
      const xr = sgnX < 0 ? pd.x0 + 0.03 : pd.x1 - 0.03;
      box(WOOD, 0.045, 0.09, lb - la, xr, yL + RL.h - 0.1, (la + lb) / 2, {
        grain: 2,
        color: gray(0.92),
        wear: 0.6,
      });
      box(WOOD, 0.145, 0.04, lb - la + 0.1, xr, yL + RL.h + 0.02, (la + lb) / 2, {
        grain: 2,
        color: gray(0.96),
        wear: 0.65,
      });
      for (let z = la + 0.15; z < lb - 0.1; z += RL.oc)
        box(WOOD, RL.bal, RL.h - 0.26, RL.bal, xr, yL + 0.12 + (RL.h - 0.26) / 2, z, {
          grain: 1,
          color: gray(0.9),
          wear: 0.6,
        });
      Fr.col.box(xr, yL + 0.55, (la + lb) / 2, 0.1, 1.1, lb - la, { tag: 'rail' });
    }
    const f2 = flight({
      x: xc,
      z: dirZ > 0 ? lb : la,
      y0: yL,
      dir: [0, dirZ],
      n: 9,
      w: pd.x1 - pd.x0 - 0.1,
    });
    // lattice skirt under the lower flight (10), outer side
    const za = dirZ > 0 ? lb + 0.3 : la - 0.3,
      zb = za + dirZ * (f2.total - 0.3);
    lattice(
      sgnX < 0 ? pd.x0 + 0.02 : pd.x1 - 0.02,
      Math.min(za, zb),
      Math.max(za, zb),
      dirZ > 0 ? yL - 0.45 : 0.35,
      dirZ > 0 ? 0.35 : yL - 0.45,
      { col: false },
    );
  };
  void sideStair;
  // r7b (mock-up 18): short steps (5 risers, ~0.85 m) from the back deck down to the lower deck level, left of the slider
  {
    const L = BKL,
      w = L.x1 - L.x0 - 0.1,
      xc = (L.x0 + L.x1) / 2,
      dY = P.annex.deckY,
      n = 5,
      rr = (F - dY) / n,
      run2 = 0.28;
    for (let i = 1; i < n; i++)
      box(WOOD, w, 0.035, 0.27, xc, F - rr * i - 0.018, RE.z0 - (i - 0.5) * run2, {
        grain: 0,
        color: gray(0.86 + r() * 0.2),
        wear: 0.55,
        bevel: 0.005,
      });
    for (const sd of [-1, 1])
      B.strut(
        WOOD,
        [xc + sd * (w / 2 + 0.02), F - 0.05, RE.z0],
        [xc + sd * (w / 2 + 0.02), dY - 0.02, RE.z0 - n * run2],
        0.045,
        0.22,
        { color: gray(0.85), wear: 0.7, bevel: 0.006, rand: r, roll: Math.PI / 2 },
      );
    for (const sd of [-1, 1])
      B.strut(
        WOOD,
        [xc + sd * (w / 2 + 0.05), F + RL.h, RE.z0],
        [xc + sd * (w / 2 + 0.05), dY + RL.h, RE.z0 - n * run2],
        0.06,
        0.06,
        { color: gray(0.95), wear: 0.6, rand: r },
      );
    const sl = Math.atan2(F - dY, n * run2),
      len = Math.hypot(F - dY, n * run2);
    Fr.col.boxQ(
      [xc, (F + dY) / 2 - 0.1, RE.z0 - (n * run2) / 2],
      [w / 2, 0.1, len / 2 + 0.05],
      new THREE.Quaternion().setFromEuler(new THREE.Euler(sl, 0, 0, 'YXZ')),
      { tag: 'stair', surface: 'wood' },
    );
    Fr.flight({ x: xc, z: RE.z0, y: F, dir: [0, -1], n: n - 1, w, rise: rr, run: run2 });
  }
  // r7b: the main stair (mock-up 11): head pad off the front edge at the east corner, flight 1 (9 risers) down +X, a 1.2 m landing,
  // flight 2 (9 risers) down -Z to a small wooden step platform in front of the annex door
  {
    const pw = NP.x1 - NP.x0,
      xc = (NP.x0 + NP.x1) / 2,
      w = 1.1,
      zc = (RE.z1 + pzo) / 2,
      yL = F - 10 * rise;
    for (let z = RE.z1 + pitch / 2; z < pzo + 0.02; z += pitch)
      box(WOOD, pw, db.t, db.w, xc, F - db.t / 2, z, {
        grain: 0,
        color: gray(0.9 + r() * 0.2),
        wear: 0.5,
        bevel: 0.005,
      });
    for (const xx of [NP.x0 + 0.03, xc, NP.x1 - 0.03])
      box(WOOD, J.t, J.d, pzo - RE.z1 + 0.07, xx, joistBot + J.d / 2, (RE.z1 + pzo) / 2, {
        grain: 2,
        color: dark(),
        wear: 0.4,
      });
    box(WOOD, pw + 0.04, J.d + db.t, 0.04, xc, joistBot + (J.d + db.t) / 2, pzo + 0.04, {
      grain: 0,
      color: gray(0.88),
      wear: 0.6,
    });
    for (const xx of [NP.x0, NP.x1]) {
      box(WHITE, 0.14, beamTop - 0.05, 0.14, xx, 0.05 + (beamTop - 0.05) / 2, pzo, {
        grain: 1,
        color: kit.vary(C.post, r, 0.04),
        wear: [0.95, 0.6],
        bevel: 0.01,
      });
      box(CONC, 0.36, 0.12, 0.36, xx, 0.05, pzo, { color: 0xb9b5aa, wear: 0.8, bevel: 0.015 });
      Fr.col.box(xx, 1.6, pzo, 0.16, 3.2, 0.16, { tag: 'pile' });
    }
    Fr.col.box(xc, F - 0.16, (RE.z1 + pzo) / 2, pw + 0.06, 0.32, pzo - RE.z1 + 0.1, {
      tag: 'deck',
      surface: 'wood',
    });
    railRun(RE.x0, pzo, NP.x1, pzo, { noStart: true }); // pad front, ends in the flight's outer newel

    box(WOOD, RL.post, RL.h + 0.04, RL.post, NP.x1, F + (RL.h + 0.04) / 2 - 0.005, RE.z1 + 0.02, {
      grain: 1,
      color: gray(0.95),
      wear: 0.7,
      bevel: 0.008,
    }); // inner newel at the deck corner
    const f1 = flight({ x: NP.x1, z: zc, y0: F, dir: [1, 0], n: 9, w });
    // landing (posts, joists, boards, rails on its open sides)
    const la = NP.x1 + f1.total + run,
      lb = la + 1.2,
      lz0 = RE.z1,
      lz1 = pzo;
    MS.landing = { x0: la, x1: lb, z0: lz0, z1: lz1 };
    for (let x = la + pitch / 2; x < lb - 0.02; x += pitch)
      box(WOOD, db.w, db.t, lz1 - lz0, x, yL - db.t / 2, (lz0 + lz1) / 2, {
        grain: 2,
        color: gray(0.9 + r() * 0.2),
        wear: 0.5,
        bevel: 0.005,
      });
    for (const zz of [lz0 + 0.05, lz1 - 0.05])
      box(WOOD, lb - la, 0.2, J.t, (la + lb) / 2, yL - db.t - 0.1, zz, {
        grain: 0,
        color: dark(),
        wear: 0.4,
      });
    for (const x of [la + 0.06, lb - 0.06])
      for (const z of [lz0 + 0.06, lz1 - 0.06]) {
        box(WHITE, 0.12, yL + RL.h, 0.12, x, (yL + RL.h) / 2, z, {
          grain: 1,
          color: kit.vary(C.post, r, 0.04),
          wear: [0.95, 0.6],
          bevel: 0.01,
        });
        Fr.col.box(x, (yL + RL.h) / 2, z, 0.14, yL + RL.h, 0.14, { tag: 'pile' });
      }
    Fr.col.box((la + lb) / 2, yL - 0.1, (lz0 + lz1) / 2, lb - la, 0.2, lz1 - lz0, {
      tag: 'deck',
      surface: 'wood',
    });
    const lrail = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az),
        ry = Math.atan2(-(bz - az), bx - ax),
        cx = (ax + bx) / 2,
        cz = (az + bz) / 2;
      box(
        WOOD,
        len,
        0.09,
        0.045,
        cx,
        yL + RL.h - 0.1,
        cz,
        { grain: 0, color: gray(0.92), wear: 0.6 },
        0,
        ry,
      );
      box(
        WOOD,
        len + 0.05,
        0.04,
        0.145,
        cx,
        yL + RL.h + 0.02,
        cz,
        { grain: 0, color: gray(0.96), wear: 0.65 },
        0,
        ry,
      );
      for (let t = 0.12; t < len - 0.08; t += RL.oc)
        box(
          WOOD,
          RL.bal,
          RL.h - 0.26,
          RL.bal,
          ax + ((bx - ax) * t) / len,
          yL + 0.12 + (RL.h - 0.26) / 2,
          az + ((bz - az) * t) / len,
          { grain: 1, color: gray(0.9), wear: 0.6 },
          0,
          ry,
        );
      Fr.col.box(cx, yL + 0.55, cz, len, 1.1, 0.1, { ry, tag: 'rail' });
    };
    lrail(la, lz1 - 0.03, lb, lz1 - 0.03);
    lrail(la, lz0 + 0.03, lb, lz0 + 0.03);
    const f2 = flight({ x: lb, z: (lz0 + lz1) / 2, y0: yL, dir: [1, 0], n: 9, w });
    // the step platform at its foot, in front of the annex door
    const px0 = lb + f2.total + 0.02,
      px1 = px0 + 0.62,
      zcc = (lz0 + lz1) / 2;
    MS.foot = { x: (px0 + px1) / 2, z: zcc };
    box(WOOD, px1 - px0, 0.06, w + 0.3, (px0 + px1) / 2, 0.13, zcc, {
      grain: 2,
      color: gray(0.86),
      wear: 0.6,
      bevel: 0.01,
    });
    for (const sz of [-1, 1])
      box(WOOD, px1 - px0, 0.12, 0.08, (px0 + px1) / 2, 0.05, zcc + sz * (w / 2 + 0.08), {
        grain: 0,
        color: dark(),
        wear: 0.5,
      });
    Fr.col.box((px0 + px1) / 2, 0.08, zcc, px1 - px0, 0.16, w + 0.3, {
      tag: 'deck',
      surface: 'wood',
    });
    // lattice panels between the posts behind the stair (11)
    {
      const LB = kit.batch('r7lat'),
        lg = new THREE.Group();
      lg.rotation.y = Math.PI / 2;
      lg.position.set(0, 0, pzo - 0.02);
      latticeTo(LB, 0, NP.x1 + 0.3, la - 0.15, F - 0.75, yL - 0.4);
      latticeTo(LB, 0, lb + 0.2, lb + f2.total - 0.45, yL - 0.45, 0.32);
      LB.build(lg);
      Fr.groups.ext.add(lg);
    }
    // steps from the east deck down to the annex roof deck (the lower back-deck level)
    {
      const S2 = MS.annexStep,
        n = 5,
        rr = (F - P.annex.deckY) / n,
        zc2 = (S2.z0 + S2.z1) / 2,
        ww = S2.z1 - S2.z0 - 0.1;
      for (let i = 1; i <= n; i++)
        box(WOOD, 0.28, 0.035, ww, RE.x1 + 0.02 + (i - 0.5) * 0.226, F - rr * i - 0.018, zc2, {
          grain: 2,
          color: gray(0.86 + r() * 0.2),
          wear: 0.55,
          bevel: 0.005,
        });
      for (const sd of [-1, 1])
        B.strut(
          WOOD,
          [RE.x1, F - 0.05, zc2 + sd * (ww / 2 + 0.02)],
          [P.annex.deckX0 + 1.15, P.annex.deckY - 0.1, zc2 + sd * (ww / 2 + 0.02)],
          0.045,
          0.22,
          { color: gray(0.85), wear: 0.7, bevel: 0.006, rand: r },
        );
      const sl = Math.atan2(F - P.annex.deckY, 1.15),
        len = Math.hypot(F - P.annex.deckY, 1.15);
      Fr.col.boxQ(
        [RE.x1 + 0.575, (F + P.annex.deckY) / 2 - 0.1, zc2],
        [len / 2 + 0.05, 0.1, ww / 2],
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -sl, 'YXZ')),
        { tag: 'stair', surface: 'wood' },
      );
    }
  }
  // ================= pavers under the house (10: square concrete pavers) =================
  for (const Pv of [P.pavers, P.court]) {
    const PV = mat.concrete(),
      s = 0.6;
    for (let x = Pv.x0; x < Pv.x1 - 0.05; x += s)
      for (let z = Pv.z0; z < Pv.z1 - 0.05; z += s) {
        if (inR(P.groundRoom, x + s / 2, z + s / 2, -0.05)) continue;
        const crack = r() < 0.05,
          t = kit.vary(0xb3b1ab, r, 0.05); // r7: gray poured-concrete court (10), not beige
        box(
          PV,
          s - 0.008,
          0.07,
          s - 0.008,
          x + s / 2,
          0.025 + (r() - 0.5) * 0.006,
          z + s / 2,
          { color: crack ? kit.mul(t, 0.9) : t, wear: 0.7 + r() * 0.3, bevel: 0.008 },
          (r() - 0.5) * 0.006,
          0,
          (r() - 0.5) * 0.006,
          ctx.site ? Fr.ext : B,
        );
      }
    Fr.col.box((Pv.x0 + Pv.x1) / 2, 0.03, (Pv.z0 + Pv.z1) / 2, Pv.x1 - Pv.x0, 0.06, Pv.z1 - Pv.z0, {
      tag: 'ground',
      surface: 'concrete',
    });
  }

  // ================= walls: board-and-batten =================
  const T = P.wallT,
    BW = 0.3,
    BT = 0.022,
    BAT = { w: 0.065, t: 0.02 };
  const roofTop = (z) => P.yRidge - Math.abs(z - P.ridgeZ) * P.pitch; // top of the roof deck
  P.yRidge = yT + 0.2 + (P.ridgeZ - P.body.z0) * P.pitch; // = 7.83 (rafter heel over the plate)
  const roofUnder = (z) => roofTop(z) - 0.175; // underside of the rafters
  const openings = (ctx.r4openings = []);
  // wall list: a -> b with the outside on the right; deck: wall stands on a deck (siding stops at the floor)
  const WALLS = [
    {
      id: 'S',
      a: [-6.5, -3.6],
      b: [6.5, -3.6],
      deck: true,
      ops: [
        { id: 'W_liv_s', u: 3.0, w: 1.0, sill: 0.85, h: 1.3, kind: 'window', shutter: true },
        { id: 'D_front', u: 6.5, w: 0.92, sill: 0, h: 2.06, kind: 'door' },
        { id: 'W_bath', u: 8.3, w: 0.6, sill: 1.35, h: 0.7, kind: 'window', frosted: true },
        { id: 'W_back_s', u: 11.55, w: 1.0, sill: 0.85, h: 1.3, kind: 'window', shutter: true },
      ],
    },
    {
      id: 'N',
      a: [6.5, -10.4],
      b: [-6.5, -10.4],
      deck: true,
      ops: [
        { id: 'W_back_n', u: 1.3, w: 1.0, sill: 0.85, h: 1.3, kind: 'window', shutter: true },
        { id: 'W_kit', u: 4.4, w: 1.25, sill: 1.0, h: 1.05, kind: 'window', shutter: true },
        { id: 'D_slide', u: 9.6, w: 1.9, sill: 0, h: 2.08, kind: 'slider' },
      ],
    },
    {
      id: 'E',
      a: [6.5, -3.6],
      b: [6.5, -10.4],
      deck: true,
      gable: true,
      ops: [
        { id: 'W_back_e', u: 3.4, w: 1.0, sill: 0.85, h: 1.3, kind: 'window', shutter: true },
        { id: 'V_e', u: 3.4, w: 0.5, sill: 3.05, h: 0.5, kind: 'vent' },
      ],
    },
    {
      id: 'W',
      a: [-6.5, -10.4],
      b: [-6.5, -3.6],
      deck: false,
      gable: true,
      ops: [
        { id: 'W_liv_w1', u: 1.9, w: 1.0, sill: 0.85, h: 1.3, kind: 'window', shutter: true },
        { id: 'W_liv_w2', u: 4.9, w: 1.0, sill: 0.85, h: 1.3, kind: 'window', shutter: true },
        { id: 'V_w', u: 3.4, w: 0.5, sill: 3.05, h: 0.5, kind: 'vent' },
      ],
    },
  ];
  for (const W of WALLS) {
    const [ax, az] = W.a,
      [bx, bz] = W.b,
      L = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / L,
      uz = (bz - az) / L,
      nx = -uz,
      nz = ux,
      ry = Math.atan2(-uz, ux);
    const pt = (u, w) => [ax + ux * u + nx * w, az + uz * u + nz * w];
    W.pt = pt;
    W.ry = ry;
    W.L = L;
    W.n = [nx, nz];
    W.u = [ux, uz];
    const yBot = W.deck ? F + 0.004 : F - 0.33,
      topAt = (u) => (W.gable ? roofUnder(pt(u, 0)[1]) - 0.004 : yT + 0.02);
    const ops = W.ops.map((o) => ({
      ...o,
      wall: W,
      y0: F + o.sill,
      y1: F + o.sill + o.h,
      u0: o.u - o.w / 2,
      u1: o.u + o.w / 2,
    }));
    openings.push(...ops);
    // the core (studs + sheathing), w in [-T + 0.02, 0]: strips between opening edges, sloped top on the gables
    const edges = [...new Set([0, L, ...ops.flatMap((o) => [o.u0, o.u1])])].sort((a, b) => a - b);
    for (let i = 0; i < edges.length - 1; i++) {
      const u0 = edges[i],
        u1 = edges[i + 1];
      if (u1 - u0 < 0.005) continue;
      const um = (u0 + u1) / 2;
      const cuts = ops.filter((o) => o.u0 < um && o.u1 > um).map((o) => [o.y0, o.y1]);
      for (const [y0, y1] of subtract(yBot, Math.max(topAt(u0), topAt(u1)), cuts)) {
        const top0 = Math.min(y1, topAt(u0)),
          top1 = Math.min(y1, topAt(u1)),
          a0 = pt(u0, -T + 0.02),
          a1 = pt(u1, -T + 0.02),
          b0 = pt(u1, -0.001),
          b1 = pt(u0, -0.001);
        hexa(
          B,
          TEAL,
          [
            [a0[0], y0, a0[1]],
            [a1[0], y0, a1[1]],
            [b0[0], y0, b0[1]],
            [b1[0], y0, b1[1]],
            [a0[0], top0, a0[1]],
            [a1[0], top1, a1[1]],
            [b0[0], top1, b0[1]],
            [b1[0], top0, b1[1]],
          ],
          { color: kit.mul(C.tealDeep, 0.8), wear: 0.2 },
        );
      }
    }
    // siding boards (vertical, BW wide) cut around the openings; battens over every seam, cut around casings and shutters
    const nB = Math.ceil(L / BW);
    for (let i = 0; i < nB; i++) {
      const u0 = (i * L) / nB,
        u1 = ((i + 1) * L) / nB,
        tone = kit.vary(C.teal, r, 0.07),
        wr = 0.06 + r() * 0.26;
      for (const [s0, s1] of subtract(
        u0,
        u1,
        ops.filter((o) => o.kind !== 'vent').map((o) => [o.u0, o.u1]),
        0.004,
      ).concat([])) {
        const cutsY = ops
          .filter((o) => o.kind !== 'vent' && o.u0 < (s0 + s1) / 2 && o.u1 > (s0 + s1) / 2)
          .map((o) => [o.y0, o.y1]);
        for (const [y0, y1] of subtract(yBot, 99, cutsY)) {
          const t0 = Math.min(y1, topAt(s0)),
            t1 = Math.min(y1, topAt(s1));
          if (Math.max(t0, t1) - y0 < 0.02) continue;
          const a0 = pt(s0 + 0.001, 0),
            a1 = pt(s1 - 0.001, 0),
            b0 = pt(s1 - 0.001, BT),
            b1 = pt(s0 + 0.001, BT);
          hexa(
            B,
            TEAL,
            [
              [a0[0], y0, a0[1]],
              [a1[0], y0, a1[1]],
              [b0[0], y0, b0[1]],
              [b1[0], y0, b1[1]],
              [a0[0], t0, a0[1]],
              [a1[0], t1, a1[1]],
              [b0[0], t1, b0[1]],
              [b1[0], t0, b1[1]],
            ],
            { color: tone, wear: wr },
          );
        }
      }
      // full-width seams (under the openings' bands too): unique casing / shutter cut zones
      // also the full-width boards over the opening span (vent: board stays, louver sits in front)
      if (i === 0) continue;
      const u = u0,
        cutsY = ops
          .filter(
            (o) =>
              o.kind !== 'vent' &&
              o.u0 - 0.1 - (o.shutter ? o.w / 2 + 0.05 : 0) < u &&
              o.u1 + 0.1 + (o.shutter ? o.w / 2 + 0.05 : 0) > u,
          )
          .map((o) => [o.y0 - 0.12, o.y1 + 0.12]);
      const vc = ops
        .filter((o) => o.kind === 'vent' && o.u0 - 0.06 < u && o.u1 + 0.06 > u)
        .map((o) => [o.y0 - 0.06, o.y1 + 0.06]);
      for (const [y0, y1] of subtract(yBot + 0.004, topAt(u) - 0.01, [...cutsY, ...vc])) {
        const [x, z] = pt(u, BT + BAT.t / 2);
        box(
          TEAL,
          BAT.w,
          y1 - y0,
          BAT.t,
          x,
          (y0 + y1) / 2,
          z,
          {
            grain: 1,
            color: kit.vary(C.teal, r, 0.07),
            wear: 0.08 + r() * 0.25,
            bevel: 0.004,
            skip: 'nz',
          },
          0,
          ry,
        );
      }
    }
    // corner boards (both ends), a skirt board on the west (no deck) and a frieze under the eaves
    for (const u of [0.05, L - 0.05]) {
      const [x, z] = pt(u, BT + 0.012);
      box(
        TEAL,
        0.12,
        topAt(u) - yBot - 0.02,
        0.024,
        x,
        (topAt(u) + yBot) / 2,
        z,
        { grain: 1, color: kit.vary(C.tealDeep, r, 0.05), wear: 0.5 },
        0,
        ry,
      );
    }
    // openings: jamb liners, casing, sill, sash / door / slider, shutters, louvered vent
    for (const o of ops) buildOpening(o, W);
  }
  function buildOpening(o, W) {
    const {
        pt,
        ry,
        n: [nx, nz],
      } = W,
      u = o.u,
      yc = (o.y0 + o.y1) / 2,
      h = o.y1 - o.y0,
      cas = 0.09,
      CW = kit.vary(C.white, r, 0.04);
    const atU = (du, w) => pt(u + du, w);
    if (o.kind === 'vent') {
      // louvered gable vent: frame + 5 slats, closed solids
      for (const [du, dy, sx, sy] of [
        [0, h / 2 + 0.03, o.w + 0.12, 0.06],
        [0, -h / 2 - 0.03, o.w + 0.12, 0.06],
        [-o.w / 2 - 0.03, 0, 0.06, h],
        [o.w / 2 + 0.03, 0, 0.06, h],
      ]) {
        const [x, z] = atU(du, BT + BAT.t + 0.02);
        box(WHITE, sx, sy, 0.04, x, yc + dy, z, { color: CW, wear: 0.4 }, 0, ry);
      }
      for (let k = 0; k < 5; k++) {
        const [x, z] = atU(0, BT + BAT.t + 0.02);
        box(
          WHITE,
          o.w,
          0.02,
          0.07,
          x,
          o.y0 + 0.05 + (k * (h - 0.1)) / 4,
          z,
          { color: CW, wear: 0.4 },
          0.6,
          ry,
        );
      }
      return;
    }
    // jamb liners through the wall depth (the reveal)
    const dep = T + BT + 0.005,
      wc = BT + 0.005 - dep / 2; // r7: 5 mm proud of the siding face too (the liners' fronts shared the boards' face plane: teal sawtooth in the white reveal)
    // r7 (playtest item 7, flicker): the liners stand 4 mm proud into the opening so their reveal faces never share a plane with
    // the cut ends of the siding boards and the wall core (they did: the inner frame shimmered)
    {
      const [x, z] = atU(0, wc);
      box(WHITE, o.w, 0.034, dep, x, o.y1 + 0.013, z, { color: CW, wear: 0.3 }, 0, ry);
      if (o.kind !== 'door' && o.kind !== 'slider')
        box(WHITE, o.w, 0.034, dep, x, o.y0 - 0.013, z, { color: CW, wear: 0.3 }, 0, ry);
    }
    for (const s of [-1, 1]) {
      const [x, z] = atU(s * (o.w / 2 + 0.013), wc);
      box(WHITE, 0.034, h + 0.06, dep, x, yc, z, { color: CW, wear: 0.3 }, 0, ry);
    }
    // casing (sits on the siding: battens are cut there), head with a drip cap, sill nose
    for (const s of [-1, 1]) {
      const [x, z] = atU(s * (o.w / 2 + 0.03 + cas / 2), BT + 0.013);
      box(
        WHITE,
        cas,
        h + (o.kind === 'door' || o.kind === 'slider' ? 0.03 : 0.16) + 0.06,
        0.026,
        x,
        yc + (o.kind === 'door' || o.kind === 'slider' ? 0.03 : 0),
        z,
        { grain: 1, color: o.kind === 'door' ? kit.vary(C.tealDeep, r, 0.05) : CW, wear: 0.55 },
        0,
        ry,
      );
    }
    {
      const [x, z] = atU(0, BT + 0.016);
      box(
        WHITE,
        o.w + 0.06 + cas * 2 + 0.04,
        0.12,
        0.032,
        x,
        o.y1 + 0.03 + 0.06,
        z,
        { color: o.kind === 'door' ? kit.vary(C.tealDeep, r, 0.05) : CW, wear: 0.55 },
        0,
        ry,
      );
      const [x2, z2] = atU(0, BT + 0.045);
      box(
        WHITE,
        o.w + 0.06 + cas * 2 + 0.07,
        0.025,
        0.05,
        x2,
        o.y1 + 0.03 + 0.135,
        z2,
        { color: CW, wear: 0.6 },
        0,
        ry,
      );
    }
    if (o.kind === 'window') {
      const [x, z] = atU(0, BT + 0.03);
      box(
        WHITE,
        o.w + 0.06 + cas * 2 + 0.05,
        0.04,
        0.08,
        x,
        o.y0 - 0.05,
        z,
        { color: CW, wear: 0.65 },
        0,
        ry,
      );
      const [x3, z3] = atU(0, BT + 0.011);
      box(
        WHITE,
        o.w + 0.06 + cas * 2,
        0.08,
        0.022,
        x3,
        o.y0 - 0.11,
        z3,
        { color: CW, wear: 0.55 },
        0,
        ry,
      );
    } // r7: behind the side casings' face (was coplanar)
    if (o.kind === 'window') {
      // double-hung sash: two frames, meeting rail, glass panes (closed thin solids), set at mid depth
      const wS = -T / 2 + 0.01,
        fr = 0.05;
      for (const [y0, y1, k] of [
        [o.y0, yc + 0.02, 0],
        [yc - 0.02, o.y1, 1],
      ]) {
        const ym = (y0 + y1) / 2,
          hh = y1 - y0,
          wk = wS + (k ? 0.03 : -0.01);
        for (const s of [-1, 1]) {
          const [x, z] = atU(s * (o.w / 2 - fr / 2), wk);
          box(PLAST, fr, hh, 0.04, x, ym, z, { color: 0xe9e6dc }, 0, ry);
        }
        for (const yy of [y0 + fr / 2, y1 - fr / 2]) {
          const [x, z] = atU(0, wk);
          box(PLAST, o.w - 2 * fr, fr, 0.04, x, yy, z, { color: 0xe9e6dc }, 0, ry);
        }
        const [gx, gz] = atU(0, wk);
        box(
          GLASS,
          o.w - 2 * fr,
          hh - 2 * fr,
          0.006,
          gx,
          ym,
          gz,
          { color: o.frosted ? 0xdfe6e4 : 0xffffff, bevel: 0 },
          0,
          ry,
        );
      }
      if (o.shutter)
        for (const s of [-1, 1]) {
          // board-and-batten shutters, open flat beside the casing, dark gray-green
          const sw = o.w / 2 + 0.04,
            du = s * (o.w / 2 + 0.03 + cas + 0.02 + sw / 2),
            tone = kit.vary(C.shutter, r, 0.06),
            wsh = BT + 0.035;
          for (let k = 0; k < 3; k++) {
            const [x, z] = atU(du - sw / 2 + (sw * (k + 0.5)) / 3, wsh);
            box(
              DOORP,
              sw / 3 - 0.004,
              h + 0.1,
              0.022,
              x,
              yc,
              z,
              { grain: 1, color: tone, wear: 0.35 + r() * 0.3 },
              0,
              ry,
            );
          }
          for (const yy of [o.y0 + 0.18, o.y1 - 0.18]) {
            const [x, z] = atU(du, wsh + 0.02);
            box(
              DOORP,
              sw - 0.06,
              0.09,
              0.018,
              x,
              yy,
              z,
              { grain: 0, color: tone, wear: 0.4 },
              0,
              ry,
            );
          }
          for (const yy of [o.y0 + 0.2, o.y1 - 0.2]) {
            const [x, z] = atU(s * (o.w / 2 + 0.03 + cas + 0.01), wsh + 0.01);
            box(STEEL, 0.05, 0.025, 0.012, x, yy, z, { color: 0x3a3a38 }, 0, ry);
          }
        }
    }
    if (o.kind === 'door') buildDoor(o, W);
    if (o.kind === 'slider') buildSlider(o, W);
  }
  // ---- the front door (03): dark painted wood, nine lites in the upper half, two round knobs, hinged left, opens inward ----
  function buildDoor(o, W) {
    const g = new THREE.Group();
    g.name = 'r4_frontdoor';
    const hingeU = o.u0 + 0.01,
      [hx, hz] = W.pt(hingeU, -T / 2 + 0.02);
    g.position.set(hx, o.y0, hz);
    g.rotation.y = W.ry;
    Fr.groups.ext.add(g);
    const DB = kit.batch('r4door'),
      w = o.w - 0.02,
      h = o.h - 0.01,
      t = 0.045,
      dk = kit.vary(C.door, r, 0.04),
      bx = (sx, sy, sz, x, y, z, m = DOORP, c = dk) =>
        DB.box(m, sx, sy, sz, M(x, y, z), { color: c, wear: 0.18, bevel: 0.005 });
    bx(0.12, h, t, 0.06, h / 2, 0);
    bx(0.12, h, t, w - 0.06, h / 2, 0);
    bx(w - 0.24, 0.2, t, w / 2, 0.1, 0);
    bx(w - 0.24, 0.14, t, w / 2, h * 0.47, 0);
    bx(w - 0.24, 0.12, t, w / 2, h - 0.06, 0);
    bx(w - 0.24, h * 0.47 - 0.27, t * 0.6, w / 2, (0.2 + h * 0.47 - 0.07) / 2, 0); // lower panel (recessed, thinner)
    const gy0 = h * 0.47 + 0.07,
      gy1 = h - 0.12,
      gw = w - 0.24,
      gh = gy1 - gy0;
    for (let k = 1; k < 3; k++) {
      bx(0.03, gh, t * 0.8, 0.12 + (gw * k) / 3, (gy0 + gy1) / 2, 0);
      bx(gw, 0.03, t * 0.8, w / 2, gy0 + (gh * k) / 3, 0);
    }
    DB.box(GLASS, gw, gh, 0.006, M(w / 2, (gy0 + gy1) / 2, 0), { color: 0xd8dcdc, bevel: 0 });
    for (const s of [1, -1]) {
      const kz = s * (t / 2 + 0.03);
      lathe(
        DB,
        mat.chrome(),
        [
          [0.001, 0],
          [0.026, 0.004],
          [0.03, 0.02],
          [0.026, 0.036],
          [0.001, 0.04],
        ],
        M(w - 0.07, 0.92 + 0, kz - s * 0.02, (s * Math.PI) / 2, 0, 0),
        { color: 0xb8b4aa, seg: 20 },
      );
      lathe(
        DB,
        mat.chrome(),
        [
          [0.001, 0],
          [0.024, 0.004],
          [0.028, 0.019],
          [0.024, 0.034],
          [0.001, 0.038],
        ],
        M(w - 0.07, 1.12, kz - s * 0.02, (s * Math.PI) / 2, 0, 0),
        { color: 0xb8b4aa, seg: 20 },
      );
    }
    DB.build(g);
    const cl = Fr.col.box(
      ...[(...a) => a][0](W.pt(o.u, -T / 2)[0], o.y0 + h / 2, W.pt(o.u, -T / 2)[1]),
      o.w,
      h,
      0.08,
      { ry: W.ry, tag: 'door', id: 'door_front' },
    );
    const d = { open: false, a: 0 };
    Fr.interact({
      id: 'door_front',
      kind: 'door',
      label: () => (d.open ? 'Close' : 'Open') + ' front door',
      pos: [W.pt(o.u, 0)[0], F + 1.1, W.pt(o.u, 0)[1]],
      radius: 1.6,
      use: () => {
        d.open = !d.open;
      },
    });
    ctx.updaters.push((dt) => {
      const tgt = d.open ? 1.55 : 0;
      if (Math.abs(d.a - tgt) < 1e-3) return;
      d.a += Math.sign(tgt - d.a) * Math.min(Math.abs(tgt - d.a), dt * 2.4);
      g.rotation.y = W.ry + d.a;
      cl.enabled = d.a < 0.2;
    });
    // porch light beside the door (on at dusk)
    const [lx, lz] = W.pt(o.u1 + 0.3, BT + 0.08);
    lathe(
      D,
      MP,
      [
        [0.001, 0],
        [0.06, 0.0],
        [0.07, 0.12],
        [0.04, 0.2],
        [0.001, 0.21],
      ],
      M(lx, F + 1.95, lz),
      { color: 0x2a2a28, seg: 16 },
    );
    D.geo(
      mat.emissive(0xffe0b0, 2.2, 'r4porch'),
      new THREE.SphereGeometry(0.035, 12, 8),
      M(lx, F + 1.99, lz),
      {},
    );
    const pl = Fr.light({
      id: 'r4_porch',
      pos: [lx, F + 1.9, lz + 0.3],
      color: 0xffd9a8,
      intensity: 30,
      range: 7,
      on: false,
    });
    ctx.updaters.push((dt, env) => {
      const t2 = env.timeOfDay ?? 12;
      pl.on = t2 < 6.2 || t2 > 18.6;
    });
  }
  // ---- sliding glass doors from the living room to the back deck (06): white aluminum frame, one leaf slides ----
  function buildSlider(o, W) {
    const g = new THREE.Group();
    g.name = 'r4_slider';
    Fr.groups.ext.add(g);
    const half = o.w / 2,
      wF = -T / 2 + 0.01,
      AL = PLAST,
      aw = 0xe8e6e0;
    const fixed = kit.batch('r4slideF'),
      mov = kit.batch('r4slideM');
    const leaf = (Bt, du, wo) => {
      const [x, z] = W.pt(o.u + du, wF + wo),
        m = (sx, sy, sz, ddu, y, mm = AL, c = aw) => {
          const [xx, zz] = W.pt(o.u + du + ddu, wF + wo);
          Bt.box(mm, sx, sy, sz, M(xx, y, zz, 0, W.ry, 0), { color: c, bevel: 0.004 });
        };
      m(0.06, o.h, 0.05, -half / 2 + 0.03, o.y0 + o.h / 2);
      m(0.06, o.h, 0.05, half / 2 - 0.03, o.y0 + o.h / 2);
      m(half - 0.12, 0.1, 0.05, 0, o.y0 + 0.05);
      m(half - 0.12, 0.06, 0.05, 0, o.y1 - 0.03);
      m(half - 0.12, o.h - 0.16, 0.008, 0, o.y0 + 0.1 + (o.h - 0.16) / 2, GLASS, 0xffffff);
      m(0.03, 0.12, 0.03, half / 2 - 0.08, o.y0 + 1.0, PLAST, 0x55534e);
      void x;
      void z;
    };
    leaf(fixed, half / 2, -0.03);
    leaf(mov, -half / 2, 0.03);
    {
      const [x, z] = W.pt(o.u, wF);
      fixed.box(AL, o.w, 0.03, T - 0.01, M(x, o.y0 + 0.015, z, 0, W.ry, 0), { color: 0xc9c6bd });
    }
    fixed.build(g);
    const gm = new THREE.Group();
    mov.build(gm);
    g.add(gm);
    const cl = Fr.col.box(
      W.pt(o.u - half / 2, wF)[0],
      o.y0 + o.h / 2,
      W.pt(o.u - half / 2, wF)[1],
      half,
      o.h,
      0.08,
      { ry: W.ry, tag: 'door', id: 'door_slider' },
    );
    Fr.col.box(
      W.pt(o.u + half / 2, wF)[0],
      o.y0 + o.h / 2,
      W.pt(o.u + half / 2, wF)[1],
      half,
      o.h,
      0.08,
      { ry: W.ry, tag: 'window' },
    );
    const d = { open: false, a: 0 },
      [ux, uz] = W.u;
    Fr.interact({
      id: 'door_slider',
      kind: 'door',
      label: () => (d.open ? 'Close' : 'Open') + ' sliding door',
      pos: [W.pt(o.u - half / 2, 0)[0], F + 1.1, W.pt(o.u - half / 2, 0)[1]],
      radius: 1.7,
      use: () => {
        d.open = !d.open;
      },
    });
    ctx.updaters.push((dt) => {
      const tgt = d.open ? half - 0.08 : 0;
      if (Math.abs(d.a - tgt) < 1e-3) return;
      d.a += Math.sign(tgt - d.a) * Math.min(Math.abs(tgt - d.a), dt * 1.6);
      gm.position.set(ux * d.a, 0, uz * d.a);
      cl.enabled = d.a < 0.3;
    });
  }
  // wall colliders (with the door gaps)
  for (const W of WALLS) {
    const L = W.L,
      gaps = openings
        .filter((o) => o.wall === W && (o.kind === 'door' || o.kind === 'slider'))
        .map((o) => [o.u0, o.u1]);
    for (const [u0, u1] of subtract(0, L, gaps)) {
      const [x, z] = W.pt((u0 + u1) / 2, -T / 2);
      Fr.col.box(x, F + 1.4, z, u1 - u0, 2.8, T, { ry: W.ry, tag: 'wall' });
    }
    for (const o of openings.filter(
      (q) => q.wall === W && (q.kind === 'door' || q.kind === 'slider'),
    )) {
      const [x, z] = W.pt(o.u, -T / 2);
      Fr.col.box(x, (o.y1 + yT + 0.2) / 2, z, o.w, yT + 0.2 - o.y1, T, { ry: W.ry, tag: 'wall' });
    }
  }
  ctx.r4walls = WALLS;

  // ================= roof =================
  const a = Math.atan(P.pitch),
    ca = Math.cos(a),
    sa = Math.sin(a),
    x0r = P.body.x0 - P.rake,
    x1r = P.body.x1 + P.rake,
    Lr = x1r - x0r;
  const zE = { S: P.body.z1 + P.eave, N: P.body.z0 - P.eave },
    slopeLen = (P.ridgeZ - zE.N) / ca;
  // slope frame: v from the eave up the slope (m along the surface), h above the deck top; side S (front) or N (back)
  const sp = (side, x, v, hh = 0) => {
    const s = side === 'S' ? 1 : -1,
      z = zE[side] - s * v * ca + s * hh * sa * 0,
      y = roofTop(zE[side]) + v * sa;
    return [x, y + hh * ca, z + s * hh * sa];
  };
  const slopeRX = (side) => (side === 'S' ? a : -a);
  // rafters 2x6 at 0.61 oc, exposed tails at the eaves; ridge board; sheathing 3/4" per slope
  for (const side of ['S', 'N']) {
    for (let x = P.body.x0 + 0.04; x <= P.body.x1 - 0.03; x += 0.61) {
      const s = side === 'S' ? 1 : -1,
        zr = P.ridgeZ,
        zEv = zE[side] + s * 0.02,
        yA = roofTop(zr) - 0.02 - 0.07 / ca,
        yB = roofTop(zEv) - 0.02 - 0.07 / ca;
      B.strut(WOOD, [x, yA, zr - s * 0.03], [x, yB, zEv], 0.045, 0.14, {
        color: kit.vary(0x9a9284, r, 0.08),
        wear: 0.5,
        bevel: 0.004,
        rand: r,
        roll: 0,
      });
    }
    // sheathing slabs (the deck under the roofing), 1.22 m sheets with joints
    for (let x = x0r; x < x1r - 0.01; x += 2.44) {
      const sx = Math.min(2.44, x1r - x);
      const [cx, cy, cz] = sp(side, x + sx / 2, slopeLen / 2, -0.012);
      box(
        PLY,
        sx - 0.006,
        0.019,
        slopeLen - 0.004,
        cx,
        cy,
        cz,
        { color: kit.vary(0x8c7a60, r, 0.1), wear: 0.7, bevel: 0 },
        slopeRX(side),
      );
    }
    // fascia along the eave and the barge boards along the rakes
    {
      const s = side === 'S' ? 1 : -1,
        [fx, fy, fz] = sp(side, (x0r + x1r) / 2, 0, -0.08);
      box(WHITE, Lr + 0.05, 0.19, 0.035, fx, fy - 0.02, fz + s * 0.02, {
        grain: 0,
        color: kit.vary(C.white, r, 0.04),
        wear: 0.6,
      });
    }
    for (const xx of [x0r - 0.018, x1r + 0.018]) {
      const [cx, cy, cz] = sp(side, xx, slopeLen / 2, -0.06);
      box(
        WHITE,
        0.035,
        0.2,
        slopeLen + 0.03,
        cx,
        cy,
        cz,
        { grain: 2, color: kit.vary(C.white, r, 0.04), wear: 0.6 },
        slopeRX(side),
      );
    }
  }
  box(WOOD, Lr, 0.24, 0.045, 0, roofTop(P.ridgeZ) - 0.14, P.ridgeZ, {
    grain: 0,
    color: dark(),
    wear: 0.4,
  }); // ridge board
  // front slope: 3-tab asphalt shingles, courses lapped like the real thing (each tab tilted so its butt stands proud), a repair
  // patch near the east end with bare felt, loose and lifted tabs, a bundle of new shingles and Nico's tool tote (01)
  const SH = mat.pbr('scuffed_cement', {
      rep: 0.45,
      gain: 2.6,
      tint: 0xbfc3c8,
      grunge: true,
      nscale: 1.4,
      rlift: 0.35,
    }),
    FELT = mat.matte();
  const patch = (x, v) => x > 2.0 && x < 4.4 && v > 0.9 && v < 2.6 && !(x > 3.9 && v > 2.1); // stripped area (01)
  {
    const exp = 0.143,
      D0 = 0.19,
      T0 = 0.0085,
      tilt = Math.atan(T0 / D0),
      tabW = 0.333,
      nC = Math.ceil((slopeLen + 0.05) / exp);
    for (let k = 0; k < nC; k++) {
      const v0 = k * exp - 0.02,
        off = ((k % 2) * tabW) / 2,
        toneRow = 0.92 + 0.12 * kit.hash(k, 3);
      for (let x = x0r - off; x < x1r - 0.01; x += tabW) {
        const xa = Math.max(x0r, x),
          xb = Math.min(x1r, x + tabW);
        if (xb - xa < 0.04) continue;
        const xm = (xa + xb) / 2,
          vm = v0 + Math.min(D0, slopeLen - v0) / 2;
        if (patch(xm, vm)) continue;
        const dv = Math.min(D0, slopeLen + 0.02 - v0);
        if (dv < 0.05) continue;
        const loose = r() < 0.012,
          lift = loose ? 0.02 + r() * 0.03 : 0,
          [cx, cy, cz] = sp('S', xm, v0 + dv / 2, T0 + lift * 0.5);
        const tone = kit.mul(
          kit.vary(0x6e7174, r, 0.1),
          toneRow * (r() < 0.06 ? 0.82 : 1) * (r() < 0.04 ? 1.15 : 1),
        );
        box(
          SH,
          xb - xa - 0.005,
          T0,
          dv,
          cx,
          cy,
          cz,
          { color: tone, wear: 0.6 + r() * 0.4, bevel: 0.0025, uv: [r() * 5, r() * 5] },
          a - tilt + (loose ? 0.12 : 0),
          loose ? (r() - 0.5) * 0.2 : 0,
          0,
        );
      }
    }
    // bare felt + sheathing in the stripped patch, nail heads, new bundles and the tote
    {
      const [cx, cy, cz] = sp('S', 3.2, 1.75, 0.0015);
      box(FELT, 2.4, 0.003, 1.7, cx, cy, cz, { color: 0x2a2b2c, wear: 0.9, bevel: 0 }, a);
    }
    for (const [x, v, rot] of [
      [2.6, 1.3, 0.1],
      [3.4, 1.9, -0.2],
    ]) {
      const [cx, cy, cz] = sp('S', x, v, 0.06);
      box(SH, 1.0, 0.11, 0.34, cx, cy, cz, { color: 0x5f6266, wear: 0.3 }, a, rot);
    }
    {
      const [cx, cy, cz] = sp('S', 4.0, 1.5, 0.12);
      const tb = kit.batch('r4tote');
      void tb;
      box(mat.wood(), 0.5, 0.16, 0.22, cx, cy, cz, { grain: 0, color: 0xa08a6a, wear: 0.4 }, a);
      const [hx2, hy2, hz2] = sp('S', 4.0, 1.5, 0.32);
      box(mat.wood(), 0.5, 0.18, 0.02, hx2, hy2, hz2, { grain: 0, color: 0xa08a6a, wear: 0.4 }, a);
    }
  }
  // back slope: standing-seam metal, panels butted with a seam rib over every joint (08)
  {
    const TIN = mat.tin(),
      pw = 0.5,
      n = Math.ceil(Lr / pw);
    for (let i = 0; i < n; i++) {
      const xa = x0r + (i * Lr) / n,
        xb = x0r + ((i + 1) * Lr) / n,
        [cx, cy, cz] = sp('N', (xa + xb) / 2, slopeLen / 2 + 0.01, 0.006);
      box(
        TIN,
        xb - xa - 0.003,
        0.008,
        slopeLen + 0.03,
        cx,
        cy,
        cz,
        {
          color: kit.vary(0xd2d4d4, r, 0.04),
          wear: 0.08 + r() * 0.12,
          bevel: 0.002,
          uv: [i * 0.37, 0],
        },
        slopeRX('N'),
      );
      if (i) {
        const [rx2, ry2, rz2] = sp('N', xa, slopeLen / 2 + 0.01, 0.024);
        box(
          TIN,
          0.02,
          0.032,
          slopeLen + 0.03,
          rx2,
          ry2,
          rz2,
          { color: 0xd8dad9, wear: 0.1, bevel: 0.004 },
          slopeRX('N'),
        );
      }
    }
  }
  // ridge cap over both slopes (bent galvanized cap, two closed strips)
  {
    const TIN = mat.tin();
    for (const side of ['S', 'N']) {
      const [cx, cy, cz] = sp(side, 0, slopeLen - 0.11, 0.035);
      box(
        TIN,
        Lr + 0.04,
        0.008,
        0.26,
        cx,
        cy,
        cz,
        { color: 0xc8cbcb, wear: 0.25, bevel: 0.002 },
        slopeRX(side),
      );
    }
  }
  // roof colliders (Nico walks the front slope in 01)
  for (const side of ['S', 'N']) {
    const [cx, cy, cz] = sp(side, 0, slopeLen / 2, -0.08);
    Fr.col.box(cx, cy, cz, Lr, 0.16, slopeLen, { rx: slopeRX(side), tag: 'roof', surface: 'roof' });
  }
  // ceiling joists / collar ties are interior (part r4_70); here only the gable soffit board under the rakes
  // ================= yellow aluminum extension ladder on the front deck, leaning on the eave by the patch (01 / 02) =================
  {
    const YL = mat.metalPaint(),
      base = [4.6, F + 0.01, -1.95],
      top = [4.6, roofTop(zE.S) + 0.25, zE.S - 0.15],
      up = new THREE.Vector3(...top).sub(new THREE.Vector3(...base)),
      len = up.length(),
      w = 0.44;
    for (const s of [-1, 1]) {
      B.strut(
        YL,
        [base[0] + (s * w) / 2, base[1], base[2]],
        [top[0] + (s * w) / 2, top[1], top[2]],
        0.025,
        0.075,
        { color: 0xd9b12a, wear: 0.25, bevel: 0.004, rand: r },
      );
      B.strut(
        YL,
        [base[0] + s * (w / 2 - 0.05), base[1] + up.y * 0.25, base[2] + up.z * 0.25 - 0.06],
        [top[0] + s * (w / 2 - 0.05), top[1] + 0.02, top[2] - 0.06],
        0.022,
        0.07,
        { color: 0xd4ab26, wear: 0.25, bevel: 0.004, rand: r },
      ); // fly section
      box(RUB, 0.05, 0.03, 0.1, base[0] + (s * w) / 2, base[1] + 0.015, base[2], {
        color: 0x1c1c1c,
      });
    }
    for (let t = 0.3; t < len - 0.2; t += 0.3) {
      const p = new THREE.Vector3(...base).addScaledVector(up, t / len);
      D.cyl(mat.steel(), 0.016, 0.016, w, M(p.x, p.y, p.z, 0, 0, Math.PI / 2), {
        color: 0xc9c9c4,
        seg: 10,
      });
    }
    Fr.col.box(base[0], (base[1] + top[1]) / 2, (base[2] + top[2]) / 2, w + 0.06, len, 0.1, {
      rx: -Math.atan2(top[2] - base[2], top[1] - base[1]),
      tag: 'prop',
    });
  }
  // ================= satellite dish (02): on a galvanized J-mast clamped to the stair-head pad's corner post at the front corner,
  // an old offset dish looking over the drive: sun-chalked reflector with rust at the rim bolts, back bracket, feed arm with two stays,
  // LNB, and the coax run down the mast and under the deck (r6, user: "make the stairs and dish stuff better"; nothing floating) =================
  {
    const zo = P.mainStair.pad.z1,
      px = P.mainStair.pad.x0 - 0.1,
      pz = zo + 0.1,
      y0 = F - 0.22,
      y1 = F + 1.72,
      DS = mat.metalPaint(),
      V3 = THREE.Vector3,
      GALV = 0x9a9890;
    D.cyl(STEEL, 0.027, 0.027, y1 - y0, M(px, (y0 + y1) / 2, pz), {
      color: GALV,
      seg: 12,
      wear: 0.5,
    }); // the mast
    for (const yy of [F - 0.12, F + 0.42, F + 0.92]) {
      box(
        STEEL,
        0.2,
        0.035,
        0.2,
        P.mainStair.pad.x0 - 0.035,
        yy,
        zo + 0.035,
        { color: 0x86847c, bevel: 0.004 },
        0,
        0,
        0,
      ); // U-bolt saddles around the post and the mast
      for (const [dx, dz] of [
        [-0.11, 0.02],
        [0.02, -0.11],
      ])
        D.cyl(STEEL, 0.008, 0.008, 0.05, M(px + dx + 0.06, yy + 0.03, pz + dz - 0.04), {
          color: 0x6f6d66,
          seg: 6,
        });
    }
    D.cyl(STEEL, 0.031, 0.031, 0.02, M(px, y1 + 0.01, pz), { color: 0x7d7b74, seg: 12 }); // mast cap
    // the dish, in its own little frame: +Y looks out along `aim`, -Z is the low side where the feed arm leaves the rim
    const aim = new V3(-0.62, 0.52, 0.59).normalize(),
      zL = new V3(0, 1, 0).addScaledVector(aim, -aim.y).normalize(),
      xL = new V3().crossVectors(aim, zL);
    const dish = new THREE.Group();
    dish.matrix
      .makeBasis(xL, aim, zL)
      .setPosition(new V3(px, y1 - 0.2, pz).addScaledVector(aim, 0.16));
    dish.matrixAutoUpdate = false;
    dish.name = 'r4_dish';
    const Db = kit.batch('r4dish'),
      Rd = 0.46,
      prof = [];
    for (let k = 0; k <= 9; k++) {
      const rr = (Rd * k) / 9;
      prof.push([Math.max(rr, 0.001), (rr * rr) / 1.5 - 0.036]);
    } // back skin, out to the rolled rim, front skin back in (closed)
    prof.push([Rd + 0.012, (Rd * Rd) / 1.5 - 0.03], [Rd + 0.012, (Rd * Rd) / 1.5 - 0.012]);
    for (let k = 9; k >= 0; k--) {
      const rr = (Rd * k) / 9;
      prof.push([Math.max(rr, 0.001), (rr * rr) / 1.5 - 0.02]);
    }
    lathe(Db, DS, prof, null, { color: 0xcfccc0, seg: 36, wear: 0.75 });
    for (let k = 0; k < 8; k++) {
      const a2 = (k / 8) * 6.283 + 0.2;
      Db.cyl(
        STEEL,
        0.012,
        0.012,
        0.012,
        M(Math.cos(a2) * 0.2, (0.2 * 0.2) / 1.5 - 0.016, Math.sin(a2) * 0.2),
        { color: k % 3 ? 0x8a7a66 : 0x7a4e30, seg: 6 },
      );
    } // bracket bolts, a few rusted
    Db.box(STEEL, 0.2, 0.05, 0.2, M(0, -0.06, 0), { color: 0x7f7d76, bevel: 0.008 });
    Db.box(STEEL, 0.07, 0.16, 0.09, M(0, -0.12, 0), { color: 0x86847c, bevel: 0.008 }); // back plate + elevation bracket (reaches the mast)
    const lnb = [0, 0.5, -0.16];
    Db.strut(
      STEEL,
      [0, (Rd * Rd) / 1.5 - 0.03, -Rd - 0.005],
      [lnb[0], lnb[1] - 0.03, lnb[2] - 0.02],
      0.026,
      0.02,
      { color: 0xb2b0a8 },
    ); // feed arm from the low rim
    for (const sd of [-1, 1])
      Db.strut(
        STEEL,
        [sd * Rd * 0.72, (Rd * Rd * 0.52) / 1.5 - 0.02, -Rd * 0.69],
        [lnb[0] + sd * 0.02, lnb[1] - 0.05, lnb[2]],
        0.01,
        0.01,
        { color: 0xb2b0a8 },
      ); // two stays
    Db.box(PLAST, 0.075, 0.1, 0.075, M(lnb[0], lnb[1], lnb[2]), { color: 0x2b2b2b, bevel: 0.012 });
    Db.cyl(PLAST, 0.032, 0.026, 0.07, M(lnb[0], lnb[1] - 0.07, lnb[2] + 0.02, 0.3, 0, 0), {
      color: 0xd9d6cc,
      seg: 12,
    }); // LNB body + feed horn
    Db.build(dish);
    Fr.groups.ext.add(dish);
    // r7e: the user's satellite dish download (home-tv-satellite-dish, decimated, sun-chalked), on the mast's top in place of the code dish
    glb(kit, 'sat_dish.glb', {
      pos: [px + 0.05, y1 - 0.62, pz],
      ry: Math.atan2(aim.x, aim.z) - Math.PI / 2,
      mat: (m) => {
        m.color.lerp(new THREE.Color(0xcfccc0), 0.5);
        m.roughness = Math.max(0.6, m.roughness ?? 0.6);
      },
    }).then((g) => {
      if (!g) return;
      Fr.groups.ext.add(g);
      dish.visible = false;
    });
    {
      const lw = new V3(...lnb).applyMatrix4(dish.matrix),
        bk = new V3(0, -0.14, 0).applyMatrix4(dish.matrix); // coax: LNB -> back of the dish -> down the mast -> under the deck
      D.tube(
        RUB,
        [
          [lw.x, lw.y, lw.z],
          [(lw.x + bk.x) / 2, Math.min(lw.y, bk.y) - 0.16, (lw.z + bk.z) / 2],
          [bk.x, bk.y - 0.03, bk.z],
          [px + 0.03, y1 - 0.45, pz + 0.01],
          [px + 0.032, F + 0.1, pz + 0.012],
          [px + 0.035, y0 + 0.02, pz + 0.01],
          [px + 0.2, y0 - 0.03, pz - 0.15],
        ],
        0.006,
        { seg: 5, color: 0x151515, steps: 60 },
      );
    }
    Fr.col.box(px, F + 0.8, pz, 0.1, 1.9, 0.1, { tag: 'pole' });
  }
  // ================= service mast on the west gable and the drop to the street pole =================
  {
    const mx = P.body.x0 - 0.12,
      mz = -4.4,
      my0 = F + 1.2,
      my1 = roofTop(mz) + 1.1;
    D.cyl(mat.steel(), 0.032, 0.032, my1 - my0, M(mx, (my0 + my1) / 2, mz), {
      color: 0x9c9a93,
      seg: 10,
    });
    lathe(
      D,
      mat.metalPaint(),
      [
        [0.001, 0],
        [0.06, 0.02],
        [0.07, 0.08],
        [0.001, 0.1],
      ],
      M(mx, my1, mz, Math.PI, 0, 0),
      { color: 0x333331, seg: 12 },
    );
    box(MP, 0.28, 0.42, 0.14, mx - 0.02, my0 - 0.25, mz, { color: 0x8e918c, bevel: 0.01 }); // meter base
    const pl = POLES[SERVICE_POLE];
    if (pl) {
      const [px, pz] = StoH(...toS(pl[0], pl[1])),
        top = [px, (pl[2] ?? 9.4) - 0.6, pz],
        st = [mx, my1 - 0.05, mz],
        pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push([
          st[0] + (top[0] - st[0]) * t,
          st[1] + (top[1] - st[1]) * t - Math.sin(Math.PI * t) * 1.1,
          st[2] + (top[2] - st[2]) * t,
        ]);
      }
      D.tube(mat.rubber(), pts, 0.011, { seg: 5, color: 0x161616, steps: 80 });
    }
  }

  // ================= the ground-floor room under the east end (10): teal board-and-batten, white slider window, hose reel =================
  if (!P.annex) {
    const G = P.groundRoom,
      hG = beamBot - 0.01; // r7b: replaced by the annex (part r4_12)
    const gw = (ax, az, bx, bz, ops) => {
      const L = Math.hypot(bx - ax, bz - az),
        ux = (bx - ax) / L,
        uz = (bz - az) / L,
        nx = -uz,
        nz = ux,
        ry = Math.atan2(-uz, ux),
        pt = (u, w) => [ax + ux * u + nx * w, az + uz * u + nz * w];
      const nB = Math.ceil(L / BW);
      for (let i = 0; i < nB; i++) {
        const u0 = (i * L) / nB,
          u1 = ((i + 1) * L) / nB;
        for (const [s0, s1] of subtract(
          u0,
          u1,
          ops.map((o) => [o.u - o.w / 2, o.u + o.w / 2]),
          0.004,
        )) {
          const cut = ops
            .filter((o) => Math.abs((s0 + s1) / 2 - o.u) < o.w / 2)
            .map((o) => [o.y0, o.y1]);
          for (const [y0, y1] of subtract(0.07, hG, cut)) {
            const [x, z] = pt((s0 + s1) / 2, BT / 2);
            box(
              TEAL,
              s1 - s0 - 0.002,
              y1 - y0,
              BT,
              x,
              (y0 + y1) / 2,
              z,
              { grain: 1, color: kit.vary(C.teal, r, 0.07), wear: 0.1 + r() * 0.3, bevel: 0.003 },
              0,
              ry,
            );
          }
        }
        if (i) {
          const cuts = ops
            .filter((o) => Math.abs(u0 - o.u) < o.w / 2 + 0.12)
            .map((o) => [o.y0 - 0.1, o.y1 + 0.1]);
          for (const [y0, y1] of subtract(0.08, hG - 0.01, cuts)) {
            const [x, z] = pt(u0, BT + BAT.t / 2);
            box(
              TEAL,
              BAT.w,
              y1 - y0,
              BAT.t,
              x,
              (y0 + y1) / 2,
              z,
              { grain: 1, color: kit.vary(C.teal, r, 0.07), wear: 0.4, skip: 'nz' },
              0,
              ry,
            );
          }
        }
      }
      {
        const [x, z] = pt(L / 2, -0.07);
        box(
          TEAL,
          L - 0.02,
          hG - 0.07,
          0.12,
          x,
          (hG + 0.07) / 2,
          z,
          { color: kit.mul(C.tealDeep, 0.7), wear: 0.2 },
          0,
          ry,
        );
      } // studs + sheathing core (closed solid)
      Fr.col.box(...[pt(L / 2, -0.04)].flatMap(([x, z]) => [x, 1.4, z]), L, 2.8, 0.18, {
        ry,
        tag: 'wall',
      });
      return { pt, ry, L };
    };
    const win = { u: 2.15, w: 1.15, y0: 1.05, y1: 1.95 },
      door = { u: 3.5, w: 0.86, y0: 0.07, y1: 2.1 };
    const fw = gw(G.x0, G.z1, G.x1, G.z1, [win]);
    gw(G.x1, G.z1, G.x1, G.z0, []);
    gw(G.x1, G.z0, G.x0, G.z0, []);
    const ww = gw(G.x0, G.z0, G.x0, G.z1, [door]);
    // old white aluminum slider window with one sash ajar (10)
    {
      const { pt, ry } = fw,
        AL = PLAST,
        aw = 0xe6e4dc,
        wm = (sx, sy, sz, u, y, w, m = AL, c = aw) => {
          const [x, z] = pt(u, w);
          box(m, sx, sy, sz, x, y, z, { color: c, bevel: 0.004 }, 0, ry);
        };
      wm(win.w + 0.1, 0.06, 0.12, win.u, win.y0 - 0.03, 0.02);
      wm(win.w + 0.1, 0.06, 0.12, win.u, win.y1 + 0.03, 0.02);
      wm(0.06, win.y1 - win.y0, 0.12, win.u - win.w / 2 - 0.02, (win.y0 + win.y1) / 2, 0.02);
      wm(0.06, win.y1 - win.y0, 0.12, win.u + win.w / 2 + 0.02, (win.y0 + win.y1) / 2, 0.02);
      for (const [du, dw] of [
        [-win.w / 4, 0.0],
        [win.w / 4 - 0.12, 0.035],
      ]) {
        wm(
          0.04,
          win.y1 - win.y0 - 0.02,
          0.03,
          win.u + du - win.w / 4 + 0.02,
          (win.y0 + win.y1) / 2,
          dw,
        );
        wm(
          0.04,
          win.y1 - win.y0 - 0.02,
          0.03,
          win.u + du + win.w / 4 - 0.02,
          (win.y0 + win.y1) / 2,
          dw,
        );
        wm(
          win.w / 2 - 0.06,
          win.y1 - win.y0 - 0.08,
          0.006,
          win.u + du,
          (win.y0 + win.y1) / 2,
          dw,
          GLASS,
          0xffffff,
        );
      }
      const [cx, cz] = pt(win.u, -0.6);
      box(
        kit.imat.matte(),
        win.w + 0.3,
        win.y1 - win.y0 + 0.2,
        0.04,
        cx,
        (win.y0 + win.y1) / 2,
        cz,
        { color: 0x2c2722 },
        0,
        ry,
      );
    } // dim room behind the glass
    // plain white panel door on the carport side, closed
    {
      const { pt, ry } = ww,
        [x, z] = pt(door.u, 0.02);
      box(
        WHITE,
        door.w,
        door.y1 - door.y0,
        0.045,
        x,
        (door.y0 + door.y1) / 2,
        z,
        { color: 0xdcd8cc, wear: 0.5 },
        0,
        ry,
      );
      lathe(
        D,
        mat.chrome(),
        [
          [0.001, 0],
          [0.025, 0.005],
          [0.028, 0.02],
          [0.001, 0.04],
        ],
        M(
          ...[pt(door.u + door.w / 2 - 0.08, 0.06)].flatMap(([a2, b2]) => [a2, 1.0, b2]),
          Math.PI / 2,
          ry + Math.PI / 2,
          0,
        ),
        { color: 0xb0aca2, seg: 16 },
      );
    }
    // hose reel (Poly Haven garden hose, wall mounted) left of the window (10)
    ctx.async.push(
      kit.model('garden_hose_wall_mounted_01').then((m) => {
        if (!m) return;
        const [x, z] = fw.pt(0.9, BT + 0.05);
        m.position.set(x, 0.95, z);
        m.rotation.y = ryG0(fw.ry);
        m.scale.setScalar(1.0);
        Fr.groups.ext.add(m);
      }),
    );
    Fr.col.box((G.x0 + G.x1) / 2, hG + 0.02, (G.z0 + G.z1) / 2, G.x1 - G.x0, 0.04, G.z1 - G.z0, {
      tag: 'ceiling',
    });
  }
  function ryG0(ry) {
    return ry + Math.PI / 2 - Math.PI / 2;
  }

  // ================= basketball hoop hanging under the front beam (10, 13: backboard toward the street side, a shot goes under the house toward the water) =================
  {
    const bxh = 0.0,
      bz = -1.6 + 0.12,
      yTop = beamBot - 0.01,
      BBm = mat.paint({ peel: 'a', fade: 0.5, gloss: 0.6, scale: 0.5 });
    box(BBm, 1.2, 0.8, 0.035, bxh, yTop - 0.4, bz, { color: 0xe8e5dc, wear: 0.45 });
    for (const [dx, dy, sx, sy] of [
      [0, -0.1, 0.6, 0.05],
      [0, -0.33, 0.6, 0.05],
      [-0.28, -0.215, 0.05, 0.28],
      [0.28, -0.215, 0.05, 0.28],
    ])
      box(mat.plastic(), sx, sy, 0.006, bxh + dx, yTop - 0.4 + dy + 0.05, bz + 0.021, {
        color: 0xc4522e,
        bevel: 0.001,
      });
    for (const s of [-1, 1])
      box(STEEL, 0.04, 0.3, 0.12, bxh + s * 0.4, yTop - 0.05, bz - 0.06, { color: 0x6c6a64 });
    const rimY = yTop - 0.4 - 0.33,
      rimZ = bz + 0.25;
    D.geo(
      mat.metalPaint(),
      new THREE.TorusGeometry(0.23, 0.009, 8, 32),
      M(bxh, rimY, rimZ, Math.PI / 2, 0, 0),
      { color: 0xd2531f },
    );
    box(MP, 0.12, 0.1, 0.03, bxh, rimY - 0.03, bz + 0.03, { color: 0xd2531f });
    for (let k = 0; k < 12; k++) {
      const a1 = (k / 12) * 6.283,
        a2 = a1 + 0.5,
        pts = [
          [bxh + Math.cos(a1) * 0.22, rimY, rimZ + Math.sin(a1) * 0.22],
          [bxh + Math.cos(a2) * 0.17, rimY - 0.2, rimZ + Math.sin(a2) * 0.17],
          [bxh + Math.cos(a1 + 1.0) * 0.13, rimY - 0.4, rimZ + Math.sin(a1 + 1.0) * 0.13],
        ];
      D.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.004, {
        seg: 4,
        color: 0xe5e2da,
        steps: 10,
      });
    }
    Fr.anchor('hoop', bxh, 0, bz + 4.2, 0);
    Fr.anchor('hoopRim', bxh, rimY, rimZ, 0);
  }

  // ================= yard bits from 10 / 08: lumber on a blue tarp, the bulk bag, the travel trailer behind the bushes =================
  {
    const B = Lot.ext,
      D = Lot.detail,
      box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0) =>
        B.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o }),
      Fr = Lot;
    const TARP = mat.fabric('denim_fabric', { rep: 0.4 });
    box(TARP, 2.6, 0.01, 1.3, 6.6, 0.05, 3.6, { color: 0x2f62b8, bevel: 0.003 }, 0, 0.08);
    const LW = mat.wood();
    for (let k = 0; k < 4; k++)
      for (let j = 0; j < 6 - (k % 2); j++)
        box(
          LW,
          2.4,
          0.04,
          0.14,
          6.6 + (r() - 0.5) * 0.06,
          0.08 + k * 0.042,
          3.2 + j * 0.145 + (k % 2) * 0.07,
          { grain: 0, color: kit.vary(0xc8ab7c, r, 0.08), wear: 0.3, bevel: 0.004 },
          0,
          0.08 + (r() - 0.5) * 0.03,
        );
    Fr.col.box(6.6, 0.15, 3.6, 2.5, 0.25, 1.0, { ry: 0.08, tag: 'prop' });
    const BAG = mat.fabric('waffle_pique_cotton', { rep: 0.3 });
    box(BAG, 0.95, 0.85, 0.95, 10.4, 0.47, -15.2, { color: 0xe4e1d8, bevel: 0.12 }, 0, 0.3);
    for (const s of [-1, 1])
      box(
        mat.plastic(),
        0.05,
        0.3,
        0.02,
        10.4 + s * 0.3,
        1.0,
        -15.2 + 0.44,
        { color: 0x6a3fb0 },
        0,
        0.3,
      );
    Fr.col.box(10.4, 0.45, -15.2, 0.95, 0.9, 0.95, { ry: 0.3, tag: 'prop' });
    // travel trailer: rounded aluminum-and-white body on two wheels, stripe, windows, A-frame tongue (procedural; see MISSING_MODELS.md)
    const RVX = -18.5,
      RVZ = -9.5,
      RVm = mat.plasticGloss();
    box(RVm, 2.35, 2.4, 6.6, RVX, 1.75, RVZ, { color: 0xe9e8e2, bevel: 0.28 });
    box(mat.plastic(), 2.37, 0.12, 6.4, RVX, 1.55, RVZ, { color: 0x4a4f57, bevel: 0.03 });
    for (const dz of [-1.6, 0.6, 2.2])
      box(GLASS, 2.37, 0.5, 0.8, RVX, 2.2, RVZ + dz, { color: 0x2a3036, bevel: 0.02 });
    for (const s of [-1, 1])
      D.cyl(RUB, 0.36, 0.36, 0.22, M(RVX + s * 1.1, 0.36, RVZ + 0.3, 0, 0, Math.PI / 2), {
        color: 0x1a1a1a,
        seg: 20,
      });
    B.strut(mat.metalPaint(), [RVX, 0.5, RVZ + 3.3], [RVX, 0.45, RVZ + 4.6], 0.12, 0.1, {
      color: 0x2a2a2a,
    });
    Fr.col.box(RVX, 1.5, RVZ, 2.4, 3.0, 6.8, { tag: 'vehicle' });
  }

  // ================= anchors, interior visibility, camera occluder =================
  Lot.anchor('truckR4', -4.1, 0, 7.6, 0); // r7: on the straight drive   // Nico's pickup in the drive under the front eave, facing the street (01)
  Fr.anchor('carport', -0.5, 0.06, -6.5, Math.PI);
  Fr.anchor('front', 0, 0, 6.0, Math.PI);
  ctx.anchors.spawnYard = { pos: new THREE.Vector3(-6.0, 0, 11.0), heading: Math.PI }; // user: spawn in the middle of the driveway (was beside the truck), facing the house   // r2-keys: Nico's spot in the yard by the pickup (yard frame)
  const camS = new THREE.Vector3();
  ctx.lookIn = (cx, cy, cz) => {
    const [sx, sz] = StoH(...toS(cx, cz));
    camS.set(sx, cy, sz);
    return (
      (inR(P.body, sx, sz, 1.4) && cy > F - 1.4) ||
      (inR({ x0: P.deckS.x0, x1: P.deckE.x1, z0: P.deckN.z0, z1: P.deckS.z1 }, sx, sz, 2.0) &&
        cy > F - 1.0)
    );
  };
  ctx.facing = (dir, cx, cz) => {
    if (!dir) return true;
    const [sx, sz] = StoH(...toS(cx, cz));
    if (inR(P.body, sx, sz, 0.2)) return true;
    const [d0, d1] = StoH(...toS(0, 0)),
      [d2, d3] = StoH(...toS(dir.x, dir.z)),
      dx = d2 - d0,
      dz = d3 - d1,
      hx = 0 - sx,
      hz = -7 - sz;
    return dx * hx + dz * hz > -0.35 * Math.hypot(hx, hz);
  };
  ctx.buildOccluder = () => {
    const ob = kit.batch('r4occ'),
      m = new THREE.MeshBasicMaterial({ visible: false });
    m.name = 'nh:occluder';
    m.userData.uvScale = 1;
    ob.box(
      m,
      P.body.x1 - P.body.x0,
      yT - F,
      P.body.z1 - P.body.z0,
      M(0, (F + yT) / 2, (P.body.z0 + P.body.z1) / 2),
      {},
    );
    for (const R of [P.deckN, P.deckE, P.deckS])
      ob.box(
        m,
        R.x1 - R.x0,
        0.3,
        R.z1 - R.z0,
        M((R.x0 + R.x1) / 2, F - 0.15, (R.z0 + R.z1) / 2),
        {},
      );
    for (const side of ['S', 'N']) {
      const [cx, cy, cz] = sp(side, 0, slopeLen / 2, -0.05);
      ob.box(m, Lr, 0.12, slopeLen, M(cx, cy, cz, slopeRX(side)), {});
    }
    const out = ob.build(Fr.groups.ext, { cast: false, receive: false })[0];
    if (out) {
      out.name = 'nh_occluder';
      out.frustumCulled = false;
    }
    return out;
  };
  void hc;
  void hexa;
  Fr.build();
}
