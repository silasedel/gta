// Nico's house r7b: the ANNEX of the user's MAIN mock-up (r4/11, the view from the driveway; night: r4/12). A lower teal board-and-batten
// room east of the house at ground level: white panel door with a purple neon strip light over it, a hose reel and potted plants
// beside it, a shuttered window to its right, a wooden barrel; on its flat roof the LOWER back-deck level (railing, a yellow patio
// umbrella, a chair), reached by a few steps from the main deck (part r4_10). Also from 11: the fluorescent tube light in the carport
// and the boat on its trailer by the canal. House frame of r4/plan4.js (built through r4/frame.js).
import { R4, P4 } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { loadKeysModels } from '../models.js';
import { glb } from '../r4/glb.js';
export const order = 12;

export function build(ctx) {
  if (!R4) return;
  const { THREE, kit, mat } = ctx,
    Fr = frame(ctx, 'house'),
    B = kit.batch('r7annex'),
    D = kit.batch('r7annexD'),
    M = kit.M,
    P = P4,
    A = P.annex,
    C = P.colors,
    r = kit.rng(1212);
  const { lathe, subtract } = makeGeo(THREE, kit);
  const WOOD = mat.wood(),
    WHITE = mat.paint({ peel: 'a', fade: 0.55, gloss: 0.93 }),
    TEAL = mat.paint({ peel: 'b', fade: 0.45, gloss: 0.92, scale: 1.2 }),
    DOORP = mat.paint({ peel: 'a', fade: 0.2, gloss: 0.8, scale: 0.6 });
  const CONC = mat.concrete(),
    STEEL = mat.steel(),
    GLASS = mat.glass(),
    PL = mat.plastic(),
    MPt = () => mat.metalPaint();
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0, Bt = B) =>
    Bt.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o });
  const gray = (k = 1) => kit.vary(kit.mul(C.deck, k), r, 0.08);
  const H = A.h,
    BT = 0.022,
    T = 0.12,
    dY = A.deckY;
  // ---------- slab ----------
  box(CONC, A.x1 - A.x0 + 0.3, 0.1, A.z1 - A.z0 + 0.3, (A.x0 + A.x1) / 2, 0.03, (A.z0 + A.z1) / 2, {
    color: 0xb3b0a8,
    wear: 0.9,
    bevel: 0.02,
  });
  // ---------- walls: core (closed solid, cut at the openings) + vertical boards + battens ----------
  // r7b (mock-ups 13 / 14): the door and its window face the carport pad under the house (the annex's west wall), a second window on
  // its street side
  const door = { u: -7.4 - A.z0, w: 0.86, y0: 0.08, y1: 2.1 },
    win = { u: -5.0 - A.z0, w: 0.8, y0: 0.95, y1: 1.9 },
    win2 = { u: 6.6 - A.x0, w: 1.0, y0: 0.95, y1: 1.9 };
  const wall = (ax, az, bx, bz, ops) => {
    const L = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / L,
      uz = (bz - az) / L,
      nx = -uz,
      nz = ux,
      ry = Math.atan2(-uz, ux),
      pt = (u, w) => [ax + ux * u + nx * w, az + uz * u + nz * w];
    const edges = [...new Set([0, L, ...ops.flatMap((o) => [o.u - o.w / 2, o.u + o.w / 2])])].sort(
      (p, q) => p - q,
    );
    for (let i = 0; i < edges.length - 1; i++) {
      const u0 = edges[i],
        u1 = edges[i + 1],
        um = (u0 + u1) / 2,
        cuts = ops.filter((o) => Math.abs(um - o.u) < o.w / 2).map((o) => [o.y0, o.y1]);
      for (const [y0, y1] of subtract(0.08, H, cuts)) {
        const [x, z] = pt(um, -T / 2);
        box(
          TEAL,
          u1 - u0,
          y1 - y0,
          T,
          x,
          (y0 + y1) / 2,
          z,
          { color: kit.mul(C.tealDeep, 0.8), wear: 0.2 },
          0,
          ry,
        );
      }
    }
    const nB = Math.ceil(L / 0.3);
    for (let i = 0; i < nB; i++) {
      const u0 = (i * L) / nB,
        u1 = ((i + 1) * L) / nB;
      for (const [s0, s1] of subtract(
        u0,
        u1,
        ops.map((o) => [o.u - o.w / 2 - 0.004, o.u + o.w / 2 + 0.004]),
        0.004,
      )) {
        const cut = ops
          .filter((o) => Math.abs((s0 + s1) / 2 - o.u) < o.w / 2 + 0.01)
          .map((o) => [o.y0, o.y1]);
        for (const [y0, y1] of subtract(0.08, H, cut)) {
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
          .filter((o) => Math.abs(u0 - o.u) < o.w / 2 + 0.16)
          .map((o) => [o.y0 - 0.14, o.y1 + 0.14]);
        for (const [y0, y1] of subtract(0.1, H - 0.02, cuts)) {
          const [x, z] = pt(u0, BT + 0.01);
          box(
            TEAL,
            0.065,
            y1 - y0,
            0.02,
            x,
            (y0 + y1) / 2,
            z,
            { grain: 1, color: kit.vary(C.teal, r, 0.07), wear: 0.3 },
            0,
            ry,
          );
        }
      }
    }
    const [cx, cz] = pt(L / 2, -T / 2);
    Fr.col.box(cx, H / 2, cz, L, H, T + 0.05, { ry, tag: 'wall' });
    return { pt, ry, L };
  };
  // walls a -> b with the outside on the left of the run seen from above (n = (-uz, ux))
  wall(A.x0, A.z1, A.x1, A.z1, [win2]);
  wall(A.x1, A.z1, A.x1, A.z0, []);
  wall(A.x1, A.z0, A.x0, A.z0, []);
  const front = wall(A.x0, A.z0, A.x0, A.z1, [door, win]);
  for (const [x, z] of [
    [A.x0, A.z0],
    [A.x1, A.z0],
    [A.x0, A.z1],
    [A.x1, A.z1],
  ])
    box(TEAL, 0.14, H - 0.06, 0.14, x, H / 2 + 0.02, z, {
      grain: 1,
      color: kit.vary(C.tealDeep, r, 0.05),
      wear: 0.5,
    }); // corner boards
  // casings (white), the door (white 4-panel, closed), the window (white sash, dim room behind, dark board shutters)
  {
    const { pt, ry } = front,
      cas = (o, isDoor) => {
        for (const s of [-1, 1]) {
          const [x, z] = pt(o.u + s * (o.w / 2 + 0.05), BT + 0.014);
          box(
            WHITE,
            0.1,
            o.y1 - o.y0 + (isDoor ? 0.05 : 0.16),
            0.028,
            x,
            (o.y0 + o.y1) / 2 + (isDoor ? 0.025 : 0),
            z,
            { grain: 1, color: kit.vary(C.white, r, 0.04), wear: 0.5 },
            0,
            ry,
          );
        }
        const [hx, hz] = pt(o.u, BT + 0.016);
        box(
          WHITE,
          o.w + 0.3,
          0.12,
          0.032,
          hx,
          o.y1 + 0.09,
          hz,
          { color: kit.vary(C.white, r, 0.04), wear: 0.5 },
          0,
          ry,
        );
      };
    cas(door, true);
    cas(win, false);
    {
      const [x, z] = pt(door.u, -0.03);
      box(
        DOORP,
        door.w - 0.02,
        door.y1 - door.y0 - 0.01,
        0.045,
        x,
        (door.y0 + door.y1) / 2,
        z,
        { color: 0xe4e1d8, wear: 0.35 },
        0,
        ry,
      );
      for (const [du, dy] of [
        [-0.19, 0.5],
        [0.19, 0.5],
        [-0.19, 1.45],
        [0.19, 1.45],
      ]) {
        const [px, pz] = pt(door.u + du, -0.004);
        box(
          DOORP,
          0.3,
          dy < 1 ? 0.7 : 0.9,
          0.012,
          px,
          door.y0 + dy,
          pz,
          { color: 0xd8d4ca, wear: 0.3 },
          0,
          ry,
        );
      }
      const [kx, kz] = pt(door.u + door.w / 2 - 0.09, 0.0);
      lathe(
        D,
        mat.chrome(),
        [
          [0.001, 0],
          [0.026, 0.004],
          [0.03, 0.02],
          [0.026, 0.036],
          [0.001, 0.04],
        ],
        M(kx, 0.98, kz, -Math.PI / 2, ry, 0),
        { color: 0xb8b4aa, seg: 16 },
      );
      const [cx, cz] = pt(door.u, -0.03);
      Fr.col.box(cx, (door.y0 + door.y1) / 2, cz, door.w, door.y1 - door.y0, 0.06, {
        ry,
        tag: 'door',
      });
    }
    {
      const [x, z] = pt(win.u, -0.05);
      for (const yy of [win.y0 + 0.025, (win.y0 + win.y1) / 2, win.y1 - 0.025])
        box(PL, win.w, 0.05, 0.05, x, yy, z, { color: 0xe9e6dc }, 0, ry);
      for (const s of [-1, 1]) {
        const [sx, sz] = pt(win.u + s * (win.w / 2 - 0.025), -0.05);
        box(
          PL,
          0.05,
          win.y1 - win.y0,
          0.05,
          sx,
          (win.y0 + win.y1) / 2,
          sz,
          { color: 0xe9e6dc },
          0,
          ry,
        );
      }
      box(
        GLASS,
        win.w - 0.06,
        win.y1 - win.y0 - 0.06,
        0.006,
        x,
        (win.y0 + win.y1) / 2,
        z,
        { color: 0xffffff, bevel: 0 },
        0,
        ry,
      );
      const [rx, rz] = pt(win.u, -0.4);
      box(
        mat.matte(),
        win.w + 0.2,
        win.y1 - win.y0 + 0.2,
        0.03,
        rx,
        (win.y0 + win.y1) / 2,
        rz,
        { color: 0x2a2420 },
        0,
        ry,
      );
      for (const s of [-1, 1])
        for (let k = 0; k < 3; k++) {
          const sw = win.w / 2 + 0.04,
            [bx, bz] = pt(
              win.u + s * (win.w / 2 + 0.16 + sw / 2) - (s * sw) / 2 + (s * sw * (k + 0.5)) / 3,
              BT + 0.04,
            );
          box(
            DOORP,
            sw / 3 - 0.004,
            win.y1 - win.y0 + 0.1,
            0.022,
            bx,
            (win.y0 + win.y1) / 2,
            bz,
            { grain: 1, color: kit.vary(C.shutter, r, 0.06), wear: 0.4 },
            0,
            ry,
          );
        }
    }
    // the purple neon strip over the door (11 / 12): a glowing tube in a small white channel, a lamp in the lamp system at night
    {
      const [x, z] = pt(door.u, BT + 0.06),
        NEON = mat.emissive(0x9a5cff, 3.2, 'r7neon');
      const [nx2, nz2] = pt(door.u, BT + 0.09);
      box(PL, 0.5, 0.3, 0.1, nx2, H + 0.3, nz2, { color: 0x2a2a30, bevel: 0.01 }, 0, ry); // r7d (13): a neon box on the lattice above the door
      for (const dy of [-0.07, 0, 0.07]) {
        const [tx2, tz2] = pt(door.u, BT + 0.145);
        D.cyl(NEON, 0.013, 0.013, 0.4, M(tx2, H + 0.3 + dy, tz2, 0, ry, Math.PI / 2), { seg: 10 });
      }
      const [lx, lz] = pt(door.u, 0.6);
      const nl = Fr.light({
        id: 'r7_neon',
        pos: [lx, H + 0.2, lz],
        color: 0x8a52ff,
        intensity: 34,
        range: 6.5,
        on: false,
      });
      ctx.updaters.push((dt, env) => {
        const t = env?.timeOfDay ?? 12;
        nl.on = t < 6.4 || t > 18.2;
        NEON.emissiveIntensity = nl.on ? 3.2 : 0.6;
      });
    }
    // hose reel left of the door, the barrel right of the window, terracotta pots by the stair foot / door
    ctx.async.push(
      kit.model('garden_hose_wall_mounted_01').then((m) => {
        if (!m) return;
        const [x, z] = pt(door.u - 0.95, BT + 0.05);
        m.position.set(x, 0.85, z);
        m.rotation.y = ry;
        Fr.groups.ext.add(m);
      }),
    );
    {
      const [x, z] = pt(win.u + 0.85, 0.42),
        BAR = mat.wood({ dark: true });
      lathe(
        B,
        BAR,
        [
          [0.001, 0],
          [0.25, 0],
          [0.29, 0.2],
          [0.31, 0.42],
          [0.29, 0.64],
          [0.25, 0.84],
          [0.001, 0.84],
        ],
        M(x, 0.08, z),
        { color: 0x6e4a2c, seg: 20, wear: 0.6 },
      );
      for (const yy of [0.15, 0.7])
        D.geo(
          STEEL,
          new THREE.TorusGeometry(0.28, 0.012, 4, 28),
          M(x, 0.08 + yy, z, Math.PI / 2, 0, 0),
          { color: 0x2c2a26 },
        );
      Fr.col.cyl(x, 0.5, z, 0.3, 0.84, { tag: 'prop' });
    }
    const POT = mat.paint({ peel: 'a', fade: 0.1, gloss: 0.6, scale: 0.5 }),
      LEAF = mat.plastic();
    const pot = (u, w, s) => {
      const [x, z] = pt(u, w);
      lathe(
        B,
        POT,
        [
          [0.001, 0],
          [0.12 * s, 0],
          [0.17 * s, 0.26 * s],
          [0.19 * s, 0.3 * s],
          [0.17 * s, 0.31 * s],
          [0.001, 0.29 * s],
        ],
        M(x, 0.08, z),
        { color: 0xb5603a, seg: 18, wear: 0.4 },
      );
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4 + u,
          l = (0.35 + (k % 3) * 0.12) * s;
        B.strut(
          LEAF,
          [x, 0.08 + 0.27 * s, z],
          [x + Math.cos(a) * l * 0.55, 0.08 + 0.27 * s + l, z + Math.sin(a) * l * 0.55],
          0.06 * s,
          0.006,
          { color: kit.vary(0x3f7a34, r, 0.15), rand: r },
        );
      }
      Fr.col.cyl(x, 0.25, z, 0.18 * s, 0.4, { tag: 'prop' });
    };
    pot(door.u - 0.55, 0.35, 1.0);
    pot(door.u - 1.45, 0.3, 1.25);
    pot(door.u + 1.0, 0.75, 0.9);
  }
  // ---------- the lower deck on the annex roof: joists, rim, boards, railing (open toward the steps from the main deck), umbrella ----------
  {
    const db = P.board,
      pitch = db.w + db.gap,
      x0 = A.deckX0,
      x1 = A.x1 + 0.06,
      z0 = A.z0 - 0.06,
      z1 = A.z1 + 0.06,
      jb = dY - db.t;
    void z0;
    box(
      TEAL,
      A.x1 - A.x0,
      jb - 0.3 - H,
      A.z1 - A.z0,
      (A.x0 + A.x1) / 2,
      (H + jb - 0.3) / 2,
      (A.z0 + A.z1) / 2,
      { color: kit.mul(C.tealDeep, 0.8), wear: 0.3 },
    ); // roof structure under the deck
    // r7b (MAIN mock-ups 18 / 19 / 11 / 17): the lower level is an L: behind the house under the slider (LA, the gym) and on over the
    // annex roof along the canal (LB); posts with concrete footings where nothing is under it
    const LA = P.lowerDeck,
      LBr = { x0, x1, z0: LA.z1, z1 };
    for (const R of [LA, LBr]) {
      for (const [ax, az, bx, bz] of [
        [R.x0, R.z0, R.x1, R.z0],
        [R.x0, R.z1, R.x1, R.z1],
        [R.x0, R.z0, R.x0, R.z1],
        [R.x1, R.z0, R.x1, R.z1],
      ]) {
        const hz = Math.abs(bz - az) < 0.01,
          len = hz ? bx - ax : bz - az;
        box(
          WOOD,
          hz ? len + 0.04 : 0.04,
          0.24,
          hz ? 0.04 : len,
          (ax + bx) / 2,
          jb - 0.12,
          (az + bz) / 2,
          { grain: hz ? 0 : 2, color: gray(0.8), wear: 0.6 },
        );
      }
      for (let z = R.z0 + pitch / 2; z < R.z1 - 0.02; z += pitch)
        box(WOOD, R.x1 - R.x0, db.t, db.w, (R.x0 + R.x1) / 2, dY - db.t / 2, z, {
          grain: 0,
          color: r() < 0.06 ? kit.vary(0xb59a72, r, 0.06) : gray(0.62 + r() * 0.2),
          wear: 0.6 + r() * 0.4,
          bevel: 0.005,
        });
      for (let x = R.x0 + 0.2; x < R.x1; x += 0.61)
        box(
          WOOD,
          0.045,
          0.2,
          R.z1 - R.z0 - 0.1,
          x,
          jb - 0.12,
          (R.z0 + R.z1) / 2,
          { grain: 2, color: gray(0.6), wear: 0.5 },
          0,
          0,
          0,
          D,
        );
      Fr.col.box((R.x0 + R.x1) / 2, dY - 0.15, (R.z0 + R.z1) / 2, R.x1 - R.x0, 0.3, R.z1 - R.z0, {
        tag: 'deck',
        surface: 'wood',
      });
    }
    // posts under the open parts (not over the annex): outer edges every ~2.4 m
    {
      const WHITE2 = mat.paint({ peel: 'a', fade: 0.55, gloss: 0.93 }),
        post = (x, z) => {
          box(WHITE2, 0.2, jb - 0.24, 0.2, x, (jb - 0.24) / 2, z, {
            grain: 1,
            color: kit.vary(C.post, r, 0.04),
            wear: [0.95, 0.6],
            bevel: 0.01,
          });
          box(CONC, 0.32, 0.1, 0.32, x, 0.05, z, { color: 0xb9b5aa, wear: 0.8, bevel: 0.015 });
          Fr.col.box(x, (jb - 0.24) / 2, z, 0.22, jb - 0.24, 0.22, { tag: 'pile' });
        };
      for (let x = LA.x0 + 0.1; x <= LA.x1 - 0.05; x += (LA.x1 - LA.x0 - 0.2) / 7)
        post(x, LA.z0 + 0.1);
      post(LA.x0 + 0.1, LA.z1 - 0.15);
      post(LBr.x1 - 0.1, (LBr.z0 + A.z0) / 2);
    }
    const RL = P.rail,
      run = (ax, az, bx, bz) => {
        const len = Math.hypot(bx - ax, bz - az),
          ry = Math.atan2(-(bz - az), bx - ax),
          n = Math.max(1, Math.round(len / 1.6));
        for (let i = 0; i <= n; i++)
          box(
            WOOD,
            RL.post,
            RL.h + 0.04,
            RL.post,
            ax + ((bx - ax) * i) / n,
            dY + RL.h / 2,
            az + ((bz - az) * i) / n,
            { grain: 1, color: gray(0.95), wear: 0.7, bevel: 0.008 },
            0,
            ry,
          );
        const cx = (ax + bx) / 2,
          cz = (az + bz) / 2;
        box(
          WOOD,
          len,
          0.09,
          0.04,
          cx,
          dY + RL.h - 0.1,
          cz,
          { grain: 0, color: gray(0.92), wear: 0.6 },
          0,
          ry,
        );
        box(
          WOOD,
          len + 0.04,
          0.04,
          0.145,
          cx,
          dY + RL.h + 0.02,
          cz,
          { grain: 0, color: gray(0.96), wear: 0.65 },
          0,
          ry,
        );
        box(
          WOOD,
          len,
          0.04,
          0.09,
          cx,
          dY + 0.1,
          cz,
          { grain: 0, color: gray(0.9), wear: 0.6 },
          0,
          ry,
        );
        for (let t = 0.12; t < len - 0.06; t += RL.oc)
          box(
            WOOD,
            RL.bal,
            RL.h - 0.27,
            RL.bal,
            ax + ((bx - ax) * t) / len,
            dY + 0.12 + (RL.h - 0.27) / 2,
            az + ((bz - az) * t) / len,
            { grain: 1, color: gray(0.86 + r() * 0.2), wear: 0.6 },
            0,
            ry,
          );
        Fr.col.box(cx, dY + 0.55, cz, len, 1.1, 0.1, { ry, tag: 'rail' });
      };
    const S2 = P.mainStair.annexStep,
      e = 0.03;
    void S2;
    const LS = P.lowerDeck.stair;
    run(x0 + 0.1, z1 - e, x1 - e, z1 - e);
    run(x1 - e, z1 - e, x1 - e, LA.z0 + e); // annex part: street side, canal side
    run(x1 - e, LA.z0 + e, LA.x0 + e, LA.z0 + e); // back (bay) side
    run(LA.x0 + e, LA.z0 + e, LA.x0 + e, LS.z0);
    run(LA.x0 + e, LS.z1, LA.x0 + e, LA.z1 - e); // west end, open at the stair to the lawn
    // the stair from the lower deck's west end down to the lawn (going -X)
    {
      const LS2 = P.lowerDeck.stair,
        n = 14,
        rr = dY / (n + 1),
        w = LS2.z1 - LS2.z0 - 0.1,
        zc = (LS2.z0 + LS2.z1) / 2,
        run = 0.28,
        xs = LA.x0;
      for (let i = 1; i <= n; i++)
        box(WOOD, 0.27, 0.035, w, xs - (i - 0.5) * run, dY - rr * i - 0.018, zc, {
          grain: 2,
          color: gray(0.8 + r() * 0.2),
          wear: 0.55,
          bevel: 0.005,
        });
      for (const sd of [-1, 1])
        B.strut(
          WOOD,
          [xs, dY - 0.05, zc + sd * (w / 2 + 0.02)],
          [xs - n * run - 0.1, 0.02, zc + sd * (w / 2 + 0.02)],
          0.045,
          0.24,
          { color: gray(0.75), wear: 0.7, bevel: 0.006, rand: r },
        );
      for (const sd of [-1, 1])
        B.strut(
          WOOD,
          [xs - 0.05, dY + 0.95, zc + sd * (w / 2 + 0.05)],
          [xs - n * run, rr + 0.9, zc + sd * (w / 2 + 0.05)],
          0.06,
          0.06,
          { color: gray(0.9), wear: 0.6, rand: r },
        );
      const sl = Math.atan2(dY, n * run),
        len = Math.hypot(dY, n * run);
      Fr.col.boxQ(
        [xs - (n * run) / 2, dY / 2 - 0.1, zc],
        [len / 2 + 0.05, 0.1, w / 2],
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sl, 'YXZ')),
        { tag: 'stair', surface: 'wood' },
      );
      Fr.flight({ x: xs, z: zc, y: dY, dir: [-1, 0], n, w, rise: rr, run });
    }
    // r7b (MAIN mock-ups 18 / 19): the lower deck is Nico's outdoor gym and grill spot: a gray patio table with four woven chairs under
    // a gray / yellow umbrella, a flat bench with a rack and a loaded bar, a loose bar on a black rubber mat, a plate tree, a plywood
    // lifting platform, the green mat with kettlebells, a black gas grill, a red / white cooler, a rope coil, the zig-zag towel on the rail
    {
      const IRON = mat.metalPaint(),
        RUBM = mat.rubber(),
        PLY = mat.pbr('plywood', { rep: 1.0, grunge: true }),
        BLK = 0x1b1b1c,
        y0 = dY;
      // r7e (the user's downloads, adapted): real iron plates (weight-lifting-plates: the 45 lb plate, scaled per size), the user's weight
      // bench with its rack (frame repainted black, pad black vinyl), the gas grill (bbq-grills, the cart grill only, aged), the gray
      // plastic patio set (dirty-plastic-chairs-tables: the table stretched to 1.4 m, four chairs, sun-faded gray), the yoga mats
      // (yoga-mats-psx: one teal by the weights, one gray flat), the cooler, the rope coil
      const DG = Fr.groups.detail,
        aging =
          (k = 0.85) =>
          (m) => {
            m.color?.multiplyScalar(k);
            m.roughness = Math.max(0.55, m.roughness ?? 0.6);
          };
      const plate = (x, y, z, r2, ry = 0, rz = Math.PI / 2) => {
        const s = r2 / 0.225;
        glb(kit, 'plate_45.glb', {
          parent: DG,
          pos: [x, y, z],
          scale: [s, 1.2, s],
          mat: (m) => {
            m.color.setRGB(0.16, 0.16, 0.17);
            m.metalness = 0.6;
            m.roughness = 0.55;
          },
        }).then((g) => {
          if (!g) return;
          g.rotation.set(0, ry, rz, 'YXZ');
          g.position.y -= 0;
        });
      };
      const bar = (x, y, z, len, ry, plates) => {
        D.cyl(STEEL, 0.014, 0.014, len, M(x, y, z, 0, ry, Math.PI / 2), {
          color: 0xb8b8b4,
          seg: 10,
        });
        const ux = Math.cos(ry),
          uz = -Math.sin(ry);
        for (const sd of [-1, 1])
          for (let k = 0; k < plates; k++)
            plate(
              x + ux * sd * (len / 2 - 0.14 - k * 0.045),
              y,
              z + uz * sd * (len / 2 - 0.14 - k * 0.045),
              0.225 - k * 0.03,
              ry,
            );
      };
      // patio table + umbrella + chairs (19)
      {
        const tx = 10.3,
          tz = -15.9,
          GRAY = (m) => {
            m.color.setRGB(0.6, 0.61, 0.6);
            m.roughness = 0.75;
            m.metalness = 0;
            m.map = null;
            m.needsUpdate = true;
          };
        glb(kit, 'plastic_table.glb', {
          parent: DG,
          pos: [tx, y0, tz],
          scale: [1.5, 1, 1.0],
          mat: GRAY,
        });
        box(
          mat.paint({ peel: 'a', fade: 0, gloss: 0.5 }),
          0.21,
          0.004,
          0.28,
          tx + 0.15,
          y0 + 0.725,
          tz - 0.1,
          { color: 0xc94b3a, bevel: 0 },
          0,
          0.4,
          0,
          D,
        ); // magazine
        D.cyl(STEEL, 0.02, 0.02, 2.3, M(tx, y0 + 1.15, tz), { color: 0xcfccc4, seg: 10 });
        lathe(
          B,
          mat.fabric('cotton_jersey', { rep: 0.4 }),
          [
            [0.001, 0.42],
            [0.5, 0.3],
            [1.05, 0.08],
            [1.12, 0.0],
            [1.1, -0.06],
            [1.02, 0.05],
            [0.45, 0.24],
            [0.001, 0.36],
          ],
          M(tx, y0 + 2.0, tz),
          { color: 0x9c9d98, seg: 8, wear: 0.3 },
        );
        lathe(
          B,
          mat.fabric('cotton_jersey', { rep: 0.4 }),
          [
            [1.1, -0.065],
            [1.13, -0.06],
            [1.13, -0.16],
            [1.11, -0.16],
          ],
          M(tx, y0 + 2.0, tz),
          { color: 0xe3b62a, seg: 8 },
        ); // yellow valance
        for (const [dx, dz, ry] of [
          [-0.95, -0.15, Math.PI / 2],
          [0.95, 0.1, -Math.PI / 2],
          [-0.3, 0.75, Math.PI + 0.1],
          [0.35, -0.75, 0.05],
        ])
          glb(kit, 'plastic_chair.glb', { parent: DG, pos: [tx + dx, y0, tz + dz], ry, mat: GRAY });
        Fr.col.box(tx, y0 + 0.4, tz, 1.4, 0.8, 0.9, { tag: 'furniture' });
      }
      // plywood platform with a loose bar on its black mat, the user's bench with its loaded rack, the plate tree, mats, kettlebells
      box(PLY, 2.2, 0.04, 1.2, 6.4, y0 + 0.02, -16.3, { color: 0xc9a77a, wear: 0.6, bevel: 0.006 });
      box(RUBM, 1.0, 0.02, 1.1, 6.4, y0 + 0.05, -16.3, { color: 0x151515, bevel: 0.004 });
      bar(6.4, y0 + 0.285, -16.3, 2.1, 0, 2);
      {
        const bx = 4.4,
          bz = -17.0;
        glb(kit, 'weight_bench.glb', {
          parent: DG,
          pos: [bx, y0, bz],
          ry: Math.PI,
          mat: (m, n) => {
            const c = m.color,
              l = (c.r + c.g + c.b) / 3;
            m.map = null;
            if (l > 0.55) {
              c.setRGB(0.2, 0.2, 0.21);
              m.metalness = 0.6;
              m.roughness = 0.45;
            } else {
              c.setRGB(0.05, 0.05, 0.055);
              m.metalness = 0;
              m.roughness = 0.6;
            }
            m.needsUpdate = true;
            void n;
          },
        });
        Fr.col.box(bx, y0 + 0.5, bz, 1.6, 1.0, 1.2, { tag: 'furniture' });
      }
      {
        const px = 8.1,
          pz = -17.3;
        D.cyl(IRON, 0.02, 0.02, 0.9, M(px, y0 + 0.45, pz), { color: BLK, seg: 8 });
        box(IRON, 0.5, 0.03, 0.5, px, y0 + 0.015, pz, { color: BLK });
        for (let k = 0; k < 5; k++)
          plate(
            px + (k % 2 ? 0.06 : -0.06),
            y0 + 0.25 + k * 0.13,
            pz,
            0.12 + (k % 3) * 0.04,
            Math.PI / 2,
            Math.PI / 2,
          );
        Fr.col.cyl(px, y0 + 0.45, pz, 0.25, 0.9, { tag: 'prop' });
      }
      glb(kit, 'yoga_mat.glb', {
        parent: DG,
        pos: [2.2, y0 + 0.004, -15.6],
        ry: Math.PI / 2,
        mat: (m) => {
          m.color.setRGB(0.12, 0.5, 0.46);
          m.roughness = 0.85;
          m.map = null;
          m.needsUpdate = true;
        },
      }); // teal, by the weights (19)
      glb(kit, 'yoga_mat.glb', {
        parent: DG,
        pos: [0.3, y0 + 0.004, -16.9],
        ry: 0.15,
        mat: (m) => {
          m.color.setRGB(0.42, 0.44, 0.45);
          m.roughness = 0.85;
          m.map = null;
          m.needsUpdate = true;
        },
      }); // one more lying flat
      for (const [kx, kz, ks] of [
        [2.5, -15.4, 1],
        [2.8, -15.7, 0.8],
      ]) {
        lathe(
          D,
          IRON,
          [
            [0.001, 0],
            [0.09 * ks, 0.01],
            [0.11 * ks, 0.1 * ks],
            [0.08 * ks, 0.18 * ks],
            [0.001, 0.19 * ks],
          ],
          M(kx, y0 + 0.012, kz),
          { color: BLK, seg: 14 },
        );
        D.geo(
          IRON,
          new THREE.TorusGeometry(0.06 * ks, 0.014, 6, 16, Math.PI),
          M(kx, y0 + 0.012 + 0.19 * ks, kz),
          { color: BLK },
        );
      }
      // the gas grill (aged), red / white cooler, rope coil
      {
        const gx = -3.9,
          gz = -17.2;
        glb(kit, 'gas_grill.glb', { parent: DG, pos: [gx, y0, gz], ry: 0, mat: aging(0.8) });
        Fr.col.box(gx, y0 + 0.5, gz, 1.05, 1.0, 0.62, { tag: 'prop' });
      }
      box(PL, 0.42, 0.36, 0.62, -2.9, y0 + 0.18, -17.4, { color: 0xb5332a, bevel: 0.03 });
      box(PL, 0.44, 0.06, 0.64, -2.9, y0 + 0.39, -17.4, { color: 0xeeeeea, bevel: 0.02 });
      {
        const pts = [];
        for (let k = 0; k < 90; k++) {
          const t = k / 90,
            a = t * 6.283 * 5,
            rr = 0.06 + t * 0.16;
          pts.push([
            -1.8 + Math.cos(a) * rr,
            y0 + 0.015 + (k % 18) * 0.0008,
            -17.2 + Math.sin(a) * rr,
          ]);
        }
        D.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.012, {
          seg: 6,
          color: 0xd9d2b8,
          steps: 150,
        });
      }
      // the yellow / blue zig-zag beach towel draped over the back rail (18 / 19): a real cloth sheet over the cap rail, down both sides,
      // folds along its length, a fringe edge, terry relief (the towel download's normal map), my zig-zag print
      {
        const ZZ = mat.art(
          'r7towel',
          256,
          512,
          (g, w, h) => {
            g.fillStyle = '#f2c233';
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#2e5fae';
            for (let y = 0; y < h; y += 64) {
              g.beginPath();
              for (let x = 0; x <= w; x += 32) g.lineTo(x, y + ((x / 32) % 2 ? 26 : 0));
              for (let x = w; x >= 0; x -= 32) g.lineTo(x, y + 18 + ((x / 32) % 2 ? 26 : 0));
              g.fill();
            }
            g.fillStyle = 'rgba(255,255,255,0.9)';
            g.fillRect(0, 0, w, 10);
            g.fillRect(0, h - 10, w, 10);
          },
          { rough: 0.98 },
        );
        const TM = new THREE.MeshStandardMaterial({
          map: ZZ.map,
          roughness: 1,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        TM.name = 'r7towel:cloth';
        new THREE.TextureLoader().load(
          (import.meta.env?.BASE_URL ?? '/') + 'assets/models/keys/tex/towel_terry_normal.jpg',
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(2, 4);
            TM.normalMap = t;
            TM.normalScale.set(1.2, 1.2);
            TM.needsUpdate = true;
          },
        );
        const W2 = 0.72,
          Lt = 1.5,
          nu = 18,
          nv = 48,
          g = new THREE.PlaneGeometry(W2, Lt, nu, nv),
          pa = g.attributes.position,
          rz = P.lowerDeck.z0 + 0.03,
          yTop = dY + 1.06,
          R2 = 0.08;
        for (let i = 0; i < pa.count; i++) {
          const u = pa.getX(i),
            v = pa.getY(i) + Lt / 2,
            a = (v - 0.62) / R2; // v: 0 .. Lt along the towel; 0.62 hangs on the water side, the rest on the deck side
          let y, z;
          if (a < 0) {
            y = yTop - (0.62 - v);
            z = rz - R2;
          } else if (a < Math.PI) {
            y = yTop + Math.sin(a) * R2 * 0.6;
            z = rz - Math.cos(a) * R2;
          } else {
            y = yTop - (v - 0.62 - Math.PI * R2);
            z = rz + R2;
          }
          const fold =
              Math.sin(u * 17 + v * 2.1) * 0.012 * Math.min(1, Math.abs(yTop - y) * 2) +
              Math.sin(u * 7.3) * 0.006,
            flare = Math.max(0, yTop - y - 0.35) * 0.05 * Math.sign(z - rz);
          pa.setXYZ(
            i,
            0.6 + u * (1 + Math.max(0, yTop - y - 0.3) * 0.04),
            y,
            z + fold * Math.sign(z - rz || 1) + flare,
          );
        }
        g.computeVertexNormals();
        const tw = new THREE.Mesh(g, TM);
        tw.name = 'r7_towel';
        tw.castShadow = true;
        tw.receiveShadow = true;
        tw.raycast = () => {};
        Fr.groups.detail.add(tw);
      }
    }
  }
  // ---------- the fluorescent tube light in the carport under the house (11) ----------
  {
    const tx = -4.3,
      tz = -6.2,
      ty = ctx.r4 ? ctx.r4.beamBot - 0.08 : 2.95,
      TUBE = mat.emissive(0xeaf4ff, 2.6, 'r7tube');
    box(PL, 1.3, 0.06, 0.12, tx, ty + 0.03, tz, { color: 0xd6d4cc, bevel: 0.01 }, 0, 0, 0, D);
    D.cyl(TUBE, 0.016, 0.016, 1.22, M(tx, ty - 0.02, tz, 0, 0, Math.PI / 2), { seg: 10 });
    const tl = Fr.light({
      id: 'r7_carport_tube',
      pos: [tx, ty - 0.2, tz],
      color: 0xdfeeff,
      intensity: 30,
      range: 8,
      on: false,
    });
    ctx.updaters.push((dt, env) => {
      const t = env?.timeOfDay ?? 12;
      tl.on = t < 6.3 || t > 18.4;
      TUBE.emissiveIntensity = tl.on ? 2.6 : 0.25;
    });
  }
  // ---------- the boat on its trailer at the canal's end (11: "a boat on a trailer parked at the water's edge") ----------
  {
    const bx = (P.canal.x0 + P.canal.x1) / 2,
      bz = P.canal.z1 + 4.2,
      MPt = mat.metalPaint(),
      RUB = mat.rubber();
    for (const s of [-1, 1])
      B.strut(MPt, [bx + s * 0.75, 0.42, bz - 2.6], [bx + s * 0.75, 0.42, bz + 2.0], 0.08, 0.1, {
        color: 0x9a9c9c,
        rand: r,
      });
    B.strut(MPt, [bx, 0.4, bz + 1.9], [bx, 0.38, bz + 3.4], 0.1, 0.1, { color: 0x9a9c9c, rand: r });
    for (const s of [-1, 1])
      B.strut(MPt, [bx + s * 0.72, 0.4, bz + 1.9], [bx, 0.38, bz + 3.2], 0.06, 0.06, {
        color: 0x9a9c9c,
        rand: r,
      });
    for (const s of [-1, 1]) {
      D.cyl(RUB, 0.3, 0.3, 0.2, M(bx + s * 0.95, 0.3, bz - 0.4, 0, 0, Math.PI / 2), {
        color: 0x1a1a1a,
        seg: 18,
      });
      D.cyl(STEEL, 0.14, 0.14, 0.21, M(bx + s * 0.95, 0.3, bz - 0.4, 0, 0, Math.PI / 2), {
        color: 0xbfc0bc,
        seg: 14,
      });
    }
    Fr.col.box(bx, 0.8, bz, 2.1, 1.6, 6.0, { tag: 'vehicle' });
    const lib = loadKeysModels(THREE, ['skiff']);
    ctx.async.push(
      lib.ready
        .then(() => {
          const nm = lib.names('skiff'),
            p = nm.length ? lib.piece('skiff', nm[0]) : null;
          if (!p) return;
          const g = new THREE.Group(),
            ext = new THREE.Vector3();
          p.box.getSize(ext);
          const inner = new THREE.Group();
          if (ext.x > ext.z) inner.rotation.y = Math.PI / 2;
          g.add(inner);
          for (const q of p.parts) {
            const m = new THREE.Mesh(q.geometry, q.material);
            m.castShadow = true;
            m.raycast = () => {};
            inner.add(m);
          }
          inner.updateMatrixWorld(true);
          const wb = new THREE.Box3().setFromObject(inner);
          const k = Math.min(1, 5.2 / Math.max(0.1, wb.max.z - wb.min.z));
          g.scale.setScalar(k);
          g.position.set(
            bx - ((wb.min.x + wb.max.x) / 2) * k,
            0.55 - wb.min.y * k,
            bz - 0.3 - ((wb.min.z + wb.max.z) / 2) * k,
          );
          Fr.groups.detail.add(g);
        })
        .catch(() => {}),
    );
  }
  // ---------- r7d (MAIN mock-up 13): the life under the house: lattice over the annex door, a wall lamp, the meter box and conduit,
  // a green steel drum and a small propane tank left of the door, a small table and pots right of it, string lights along the back
  // beam, a white downpipe on the near front post, vines up the posts ----------
  {
    const xw = A.x0 - 0.03,
      dz0 = A.z0 + door.u,
      LTW = mat.paint({ peel: 'a', fade: 0.6, gloss: 0.9 }),
      yb = (ctx.r4?.beamBot ?? 3.04) - 0.02;
    for (const [sg] of [[1], [-1]])
      for (let k = -8; k < 16; k++) {
        const c0 = dz0 - 0.9 + k * 0.12,
          a0 = [c0, H],
          a1 = [c0 + sg * (yb - H), yb];
        const zA = Math.max(dz0 - 0.9, Math.min(dz0 + 0.9, a0[0])),
          zB = Math.max(dz0 - 0.9, Math.min(dz0 + 0.9, a1[0]));
        if (Math.abs(zB - zA) < 0.05) continue;
        const yA = H + Math.abs(zA - a0[0]),
          yB = yb - Math.abs(zB - a1[0]);
        B.strut(
          LTW,
          [xw - (sg > 0 ? 0.01 : 0.025), yA, zA],
          [xw - (sg > 0 ? 0.01 : 0.025), yB, zB],
          0.035,
          0.012,
          { color: 0xe2ddd0, rand: r },
        );
      }
    box(LTW, 0.05, 0.06, 1.9, xw - 0.02, H + 0.03, dz0, { color: 0xe2ddd0 });
    box(LTW, 0.05, 0.06, 1.9, xw - 0.02, yb - 0.03, dz0, { color: 0xe2ddd0 });
    // wall lamp, meter box, conduit
    lathe(
      D,
      mat.metalPaint(),
      [
        [0.001, 0],
        [0.05, 0],
        [0.06, 0.1],
        [0.04, 0.16],
        [0.001, 0.17],
      ],
      M(xw - 0.08, 1.95, dz0 + 0.62),
      { color: 0xcfccc4, seg: 14 },
    );
    // r7e: the user's meter download (electric-meter-with-fuse-boxes), cut down to its size here, on the wall left of the door, conduit up to the beam
    glb(kit, 'meter_boxes.glb', {
      parent: Fr.groups.detail,
      pos: [xw - 0.07, 0.75, dz0 - 1.3],
      ry: -Math.PI / 2,
      scale: 0.8,
      mat: (m) => {
        m.roughness = Math.max(0.6, m.roughness ?? 0.6);
        m.color.multiplyScalar(0.85);
      },
    });
    D.cyl(STEEL, 0.014, 0.014, yb - 1.55, M(xw - 0.04, (yb + 1.55) / 2, dz0 - 1.15), {
      color: 0x9a9890,
      seg: 8,
    });
    D.cyl(STEEL, 0.012, 0.012, 1.6, M(xw - 0.04, 1.6, dz0 - 1.35, Math.PI / 2, 0, 0), {
      color: 0x9a9890,
      seg: 8,
    });
    // green steel drum and a small silver propane tank (left of the door), a small table with pots (right of it)
    {
      const gx = xw - 0.45,
        gz = dz0 - 0.85; // r7e: the user's steel drum painted green (worn), their small propane tank
      glb(kit, 'steel_drum.glb', {
        parent: Fr.groups.detail,
        pos: [gx, 0.06, gz],
        mat: (m) => {
          m.color.setRGB(0.22, 0.4, 0.25);
          m.metalness = 0.5;
          m.roughness = 0.6;
        },
      });
      Fr.col.cyl(gx, 0.5, gz, 0.27, 0.9, { tag: 'prop' });
      const tx2 = xw - 0.35,
        tz2 = dz0 - 1.45;
      glb(kit, 'propane_small.glb', {
        parent: Fr.groups.detail,
        pos: [tx2, 0.06, tz2],
        mat: (m) => {
          m.metalness = 0.4;
          m.roughness = 0.5;
        },
      });
      Fr.col.cyl(tx2, 0.3, tz2, 0.18, 0.55, { tag: 'prop' });
      const sx2 = xw - 0.35,
        sz2 = dz0 + 0.95;
      box(mat.wood(), 0.4, 0.03, 0.4, sx2, 0.62, sz2, { grain: 0, color: 0x8a6a48, wear: 0.6 });
      for (const [dx, dzz] of [
        [-0.16, -0.16],
        [0.16, -0.16],
        [-0.16, 0.16],
        [0.16, 0.16],
      ])
        box(mat.wood(), 0.03, 0.6, 0.03, sx2 + dx, 0.31, sz2 + dzz, { grain: 1, color: 0x7a5c3e });
      Fr.col.box(sx2, 0.32, sz2, 0.42, 0.64, 0.42, { tag: 'furniture' });
    }
    // string lights along the back beam under the house (warm bulbs, glowing at night)
    {
      // r7e: proper string lights: black cord sagging between cup hooks on the beam, a socket and a clear glass bulb with a warm glowing
      // filament every 0.5 m (glass: transparent, the filament glows strongly at night, faintly by day)
      const FIL = mat.emissive(0xffc477, 0.3, 'r7filament'),
        GL2 = new THREE.MeshPhysicalMaterial({
          color: 0xfff6e8,
          roughness: 0.05,
          metalness: 0,
          transmission: 0.0,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        });
      GL2.name = 'r7bulbGlass';
      const ys = yb - 0.04,
        zS = (P.BZ0 ?? -11.7) + 0.15,
        x0s = -8.8,
        x1s = 1.8,
        hooks = 6,
        pts = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80,
          x = x0s + t * (x1s - x0s),
          seg = t * hooks,
          f = seg - Math.floor(seg);
        pts.push([x, ys - 0.22 * 4 * f * (1 - f), zS]);
      }
      D.tube(mat.rubber(), pts, 0.004, { seg: 4, color: 0x111111, steps: 160 });
      for (let h = 0; h <= hooks; h++) {
        const x = x0s + (h / hooks) * (x1s - x0s);
        D.tube(
          STEEL,
          [
            [x, ys + 0.035, zS],
            [x, ys - 0.005, zS],
            [x + 0.02, ys - 0.02, zS],
          ],
          0.003,
          { seg: 4, color: 0x8a8a86, steps: 6 },
        );
      }
      const glassG = new THREE.SphereGeometry(0.028, 12, 9),
        bulbs = [];
      for (let i = 3; i < 80; i += 4) {
        const p = pts[i];
        D.cyl(mat.plastic(), 0.011, 0.011, 0.035, M(p[0], p[1] - 0.02, p[2]), {
          color: 0x151515,
          seg: 8,
        });
        D.cyl(FIL, 0.003, 0.003, 0.025, M(p[0], p[1] - 0.065, p[2]), { seg: 4 });
        bulbs.push([p[0], p[1] - 0.065, p[2]]);
      }
      const gm = new THREE.InstancedMesh(glassG, GL2, bulbs.length);
      bulbs.forEach((b, k) => gm.setMatrixAt(k, M(b[0], b[1], b[2])));
      gm.name = 'r7_string_glass';
      gm.raycast = () => {};
      gm.renderOrder = 8;
      Fr.groups.detail.add(gm);
      const sl = Fr.light({
        id: 'r7_string',
        pos: [(x0s + x1s) / 2, ys - 0.25, zS + 0.3],
        color: 0xffc98a,
        intensity: 18,
        range: 9,
        on: false,
      });
      ctx.updaters.push((dt, env) => {
        const t = env?.timeOfDay ?? 12,
          on = t < 6.6 || t > 18.3;
        FIL.emissiveIntensity = on ? 9.0 : 0.3;
        sl.on = on;
      });
    }
    // white downpipe on the near front post (2.2, -1.6) and vines up three posts
    {
      const WP = mat.plastic(),
        px = 2.2 - 0.17,
        pz = -1.6 + 0.1;
      D.cyl(WP, 0.04, 0.04, yb - 0.4, M(px, (yb + 0.4) / 2, pz), { color: 0xeeeeea, seg: 12 });
      D.tube(
        WP,
        [
          [px, 0.42, pz],
          [px, 0.3, pz],
          [px - 0.1, 0.16, pz],
          [px - 0.35, 0.12, pz],
        ],
        0.04,
        { seg: 10, color: 0xeeeeea, steps: 16 },
      );
    }
    {
      const VINE = mat.plastic();
      for (const [vx, vz] of [
        [2.2, -1.6],
        [-2.2, -1.6],
        [2.2, -3.6],
      ]) {
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40,
            a = t * 9 + vx;
          pts.push([vx + Math.cos(a) * 0.15, 0.05 + t * (yb - 0.1), vz + Math.sin(a) * 0.15]);
        }
        D.tube(VINE, pts, 0.008, { seg: 4, color: 0x4a5a2a, steps: 90 });
        for (let i = 2; i < 40; i += 2) {
          const p = pts[i];
          B.strut(
            VINE,
            p,
            [p[0] + Math.cos(i) * 0.12, p[1] + 0.08, p[2] + Math.sin(i) * 0.12],
            0.07,
            0.004,
            { color: kit.vary(0x4f7a32, r, 0.15), rand: r },
          );
        }
      }
    }
  }
  // r7e (MAIN mock-up 14): the tall bunch-grass clump with purple flowers on the grassy island in the drive's curve
  {
    const gx = -10.6,
      gz = 2.9,
      gy = ctx.yardY ? ctx.yardY(...Fr.toG(gx, gz)) : 0,
      GR = mat.plastic(),
      FL = mat.plastic(),
      q = kit.rng(1414);
    for (let k = 0; k < 70; k++) {
      const a = q() * 6.283,
        d = Math.sqrt(q()) * 0.35,
        h = 0.6 + q() * 0.7,
        lean = 0.15 + q() * 0.35,
        bx = gx + Math.cos(a) * d,
        bz = gz + Math.sin(a) * d;
      B.strut(
        GR,
        [bx, gy, bz],
        [bx + Math.cos(a) * lean * h, gy + h, bz + Math.sin(a) * lean * h],
        0.018,
        0.003,
        { color: kit.vary(k % 5 ? 0x6f8a3a : 0x9a9a52, q, 0.12), rand: q },
      );
      if (k % 4 === 0)
        D.geo(
          FL,
          new THREE.SphereGeometry(0.03, 6, 5),
          M(bx + Math.cos(a) * lean * h, gy + h + 0.02, bz + Math.sin(a) * lean * h),
          { color: kit.vary(0x8e4fb5, q, 0.1) },
        );
    }
  }
  Fr.anchor('annexDoor', 11.9, 0, A.z1 + 0.8, 0);
  B.build(Fr.groups.ext);
  D.build(Fr.groups.detail);
  for (const g of [Fr.groups.ext, Fr.groups.detail])
    g.traverse((o) => {
      const m = o.material;
      if (!m || m.userData?.r4matte || m.transparent) return;
      m.userData.r4matte = true;
      m.envMapIntensity = Math.min(m.envMapIntensity ?? 1, m.metalness > 0.5 ? 0.6 : 0.35);
    });
}
