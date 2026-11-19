// Nico's house r7b: the ANNEX of the user's MAIN mock-up (r4/11, the view from the driveway; night: r4/12). A lower teal board-and-batten
// room east of the house at ground level: white panel door with a purple neon strip light over it, a hose reel and potted plants
// beside it, a shuttered window to its right, a wooden barrel; on its flat roof the LOWER back-deck level (railing, a yellow patio
// umbrella, a chair), reached by a few steps from the main deck (part r4_10). Also from 11: the fluorescent tube light in the carport
// and the boat on its trailer by the canal. House frame of r4/plan4.js (built through r4/frame.js).
import { R4, P4 } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { loadKeysModels } from '../models.js';
export const order = 12;

export function build(ctx) {
  if (!R4) return;
  const { THREE, kit, mat } = ctx, Fr = frame(ctx, 'house'), B = kit.batch('r7annex'), D = kit.batch('r7annexD'), M = kit.M, P = P4, A = P.annex, C = P.colors, r = kit.rng(1212);
  const { lathe, subtract } = makeGeo(THREE, kit);
  const WOOD = mat.wood(), WHITE = mat.paint({ peel: 'a', fade: 0.55, gloss: 0.93 }), TEAL = mat.paint({ peel: 'b', fade: 0.45, gloss: 0.92, scale: 1.2 }), DOORP = mat.paint({ peel: 'a', fade: 0.2, gloss: 0.8, scale: 0.6 });
  const CONC = mat.concrete(), STEEL = mat.steel(), GLASS = mat.glass(), PL = mat.plastic();
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0, Bt = B) => Bt.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o });
  const gray = (k = 1) => kit.vary(kit.mul(C.deck, k), r, 0.08);
  const H = A.h, BT = 0.022, T = 0.12, dY = A.deckY;
  // ---------- slab ----------
  box(CONC, A.x1 - A.x0 + 0.3, 0.1, A.z1 - A.z0 + 0.3, (A.x0 + A.x1) / 2, 0.03, (A.z0 + A.z1) / 2, { color: 0xb3b0a8, wear: 0.9, bevel: 0.02 });
  // ---------- walls: core (closed solid, cut at the openings) + vertical boards + battens ----------
  // r7b (mock-ups 13 / 14): the door and its window face the carport pad under the house (the annex's west wall), a second window on
  // its street side
  const door = { u: -7.4 - A.z0, w: 0.86, y0: 0.08, y1: 2.1 }, win = { u: -5.0 - A.z0, w: 0.8, y0: 0.95, y1: 1.9 }, win2 = { u: 6.6 - A.x0, w: 1.0, y0: 0.95, y1: 1.9 };
  const wall = (ax, az, bx, bz, ops) => { const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux, ry = Math.atan2(-uz, ux), pt = (u, w) => [ax + ux * u + nx * w, az + uz * u + nz * w];
    const edges = [...new Set([0, L, ...ops.flatMap((o) => [o.u - o.w / 2, o.u + o.w / 2])])].sort((p, q) => p - q);
    for (let i = 0; i < edges.length - 1; i++) { const u0 = edges[i], u1 = edges[i + 1], um = (u0 + u1) / 2, cuts = ops.filter((o) => Math.abs(um - o.u) < o.w / 2).map((o) => [o.y0, o.y1]);
      for (const [y0, y1] of subtract(0.08, H, cuts)) { const [x, z] = pt(um, -T / 2); box(TEAL, u1 - u0, y1 - y0, T, x, (y0 + y1) / 2, z, { color: kit.mul(C.tealDeep, 0.8), wear: 0.2 }, 0, ry); } }
    const nB = Math.ceil(L / 0.3);
    for (let i = 0; i < nB; i++) { const u0 = i * L / nB, u1 = (i + 1) * L / nB;
      for (const [s0, s1] of subtract(u0, u1, ops.map((o) => [o.u - o.w / 2 - 0.004, o.u + o.w / 2 + 0.004]), 0.004)) { const cut = ops.filter((o) => Math.abs((s0 + s1) / 2 - o.u) < o.w / 2 + 0.01).map((o) => [o.y0, o.y1]);
        for (const [y0, y1] of subtract(0.08, H, cut)) { const [x, z] = pt((s0 + s1) / 2, BT / 2); box(TEAL, s1 - s0 - 0.002, y1 - y0, BT, x, (y0 + y1) / 2, z, { grain: 1, color: kit.vary(C.teal, r, 0.07), wear: 0.1 + r() * 0.3, bevel: 0.003 }, 0, ry); } }
      if (i) { const cuts = ops.filter((o) => Math.abs(u0 - o.u) < o.w / 2 + 0.16).map((o) => [o.y0 - 0.14, o.y1 + 0.14]);
        for (const [y0, y1] of subtract(0.1, H - 0.02, cuts)) { const [x, z] = pt(u0, BT + 0.01); box(TEAL, 0.065, y1 - y0, 0.02, x, (y0 + y1) / 2, z, { grain: 1, color: kit.vary(C.teal, r, 0.07), wear: 0.3 }, 0, ry); } } }
    const [cx, cz] = pt(L / 2, -T / 2); Fr.col.box(cx, H / 2, cz, L, H, T + 0.05, { ry, tag: 'wall' });
    return { pt, ry, L }; };
  // walls a -> b with the outside on the left of the run seen from above (n = (-uz, ux))
  wall(A.x0, A.z1, A.x1, A.z1, [win2]); wall(A.x1, A.z1, A.x1, A.z0, []); wall(A.x1, A.z0, A.x0, A.z0, []); const front = wall(A.x0, A.z0, A.x0, A.z1, [door, win]);
  for (const [x, z] of [[A.x0, A.z0], [A.x1, A.z0], [A.x0, A.z1], [A.x1, A.z1]]) box(TEAL, 0.14, H - 0.06, 0.14, x, H / 2 + 0.02, z, { grain: 1, color: kit.vary(C.tealDeep, r, 0.05), wear: 0.5 });   // corner boards
  // casings (white), the door (white 4-panel, closed), the window (white sash, dim room behind, dark board shutters)
  { const { pt, ry } = front, cas = (o, isDoor) => { for (const s of [-1, 1]) { const [x, z] = pt(o.u + s * (o.w / 2 + 0.05), BT + 0.014); box(WHITE, 0.1, o.y1 - o.y0 + (isDoor ? 0.05 : 0.16), 0.028, x, (o.y0 + o.y1) / 2 + (isDoor ? 0.025 : 0), z, { grain: 1, color: kit.vary(C.white, r, 0.04), wear: 0.5 }, 0, ry); }
      const [hx, hz] = pt(o.u, BT + 0.016); box(WHITE, o.w + 0.3, 0.12, 0.032, hx, o.y1 + 0.09, hz, { color: kit.vary(C.white, r, 0.04), wear: 0.5 }, 0, ry); };
    cas(door, true); cas(win, false);
    { const [x, z] = pt(door.u, -0.03); box(DOORP, door.w - 0.02, door.y1 - door.y0 - 0.01, 0.045, x, (door.y0 + door.y1) / 2, z, { color: 0xe4e1d8, wear: 0.35 }, 0, ry);
      for (const [du, dy] of [[-0.19, 0.5], [0.19, 0.5], [-0.19, 1.45], [0.19, 1.45]]) { const [px, pz] = pt(door.u + du, -0.004); box(DOORP, 0.3, dy < 1 ? 0.7 : 0.9, 0.012, px, door.y0 + dy, pz, { color: 0xd8d4ca, wear: 0.3 }, 0, ry); }
      const [kx, kz] = pt(door.u + door.w / 2 - 0.09, 0.0); lathe(D, mat.chrome(), [[0.001, 0], [0.026, 0.004], [0.03, 0.02], [0.026, 0.036], [0.001, 0.04]], M(kx, 0.98, kz, -Math.PI / 2, ry, 0), { color: 0xb8b4aa, seg: 16 });
      const [cx, cz] = pt(door.u, -0.03); Fr.col.box(cx, (door.y0 + door.y1) / 2, cz, door.w, door.y1 - door.y0, 0.06, { ry, tag: 'door' }); }
    { const [x, z] = pt(win.u, -0.05); for (const yy of [win.y0 + 0.025, (win.y0 + win.y1) / 2, win.y1 - 0.025]) box(PL, win.w, 0.05, 0.05, x, yy, z, { color: 0xe9e6dc }, 0, ry);
      for (const s of [-1, 1]) { const [sx, sz] = pt(win.u + s * (win.w / 2 - 0.025), -0.05); box(PL, 0.05, win.y1 - win.y0, 0.05, sx, (win.y0 + win.y1) / 2, sz, { color: 0xe9e6dc }, 0, ry); }
      box(GLASS, win.w - 0.06, win.y1 - win.y0 - 0.06, 0.006, x, (win.y0 + win.y1) / 2, z, { color: 0xffffff, bevel: 0 }, 0, ry);
      const [rx, rz] = pt(win.u, -0.4); box(mat.matte(), win.w + 0.2, win.y1 - win.y0 + 0.2, 0.03, rx, (win.y0 + win.y1) / 2, rz, { color: 0x2a2420 }, 0, ry);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const sw = win.w / 2 + 0.04, [bx, bz] = pt(win.u + s * (win.w / 2 + 0.16 + sw / 2) - s * sw / 2 + s * sw * (k + 0.5) / 3, BT + 0.04); box(DOORP, sw / 3 - 0.004, win.y1 - win.y0 + 0.1, 0.022, bx, (win.y0 + win.y1) / 2, bz, { grain: 1, color: kit.vary(C.shutter, r, 0.06), wear: 0.4 }, 0, ry); } }
    // the purple neon strip over the door (11 / 12): a glowing tube in a small white channel, a lamp in the lamp system at night
    { const [x, z] = pt(door.u, BT + 0.06), NEON = mat.emissive(0x9a5cff, 3.2, 'r7neon');
      box(PL, 0.62, 0.05, 0.05, x, door.y1 + 0.27, z, { color: 0xdedbd2 }, 0, ry);
      D.cyl(NEON, 0.012, 0.012, 0.56, M(x, door.y1 + 0.25, z + 0.02, 0, ry, Math.PI / 2), { seg: 10 });
      const [lx, lz] = pt(door.u, 0.6); const nl = Fr.light({ id: 'r7_neon', pos: [lx, door.y1 + 0.3, lz], color: 0x8a52ff, intensity: 34, range: 6.5, on: false });
      ctx.updaters.push((dt, env) => { const t = env?.timeOfDay ?? 12; nl.on = t < 6.4 || t > 18.2; NEON.emissiveIntensity = nl.on ? 3.2 : 0.6; }); }
    // hose reel left of the door, the barrel right of the window, terracotta pots by the stair foot / door
    ctx.async.push(kit.model('garden_hose_wall_mounted_01').then((m) => { if (!m) return; const [x, z] = pt(door.u - 0.95, BT + 0.05); m.position.set(x, 0.85, z); m.rotation.y = ry; Fr.groups.ext.add(m); }));
    { const [x, z] = pt(win.u + 0.85, 0.42), BAR = mat.wood({ dark: true }); lathe(B, BAR, [[0.001, 0], [0.25, 0], [0.29, 0.2], [0.31, 0.42], [0.29, 0.64], [0.25, 0.84], [0.001, 0.84]], M(x, 0.08, z), { color: 0x6e4a2c, seg: 20, wear: 0.6 });
      for (const yy of [0.15, 0.7]) D.geo(STEEL, new THREE.TorusGeometry(0.28, 0.012, 4, 28), M(x, 0.08 + yy, z, Math.PI / 2, 0, 0), { color: 0x2c2a26 }); Fr.col.cyl(x, 0.5, z, 0.3, 0.84, { tag: 'prop' }); }
    const POT = mat.paint({ peel: 'a', fade: 0.1, gloss: 0.6, scale: 0.5 }), LEAF = mat.plastic();
    const pot = (u, w, s) => { const [x, z] = pt(u, w); lathe(B, POT, [[0.001, 0], [0.12 * s, 0], [0.17 * s, 0.26 * s], [0.19 * s, 0.3 * s], [0.17 * s, 0.31 * s], [0.001, 0.29 * s]], M(x, 0.08, z), { color: 0xb5603a, seg: 18, wear: 0.4 });
      for (let k = 0; k < 9; k++) { const a = k * 2.4 + u, l = (0.35 + (k % 3) * 0.12) * s; B.strut(LEAF, [x, 0.08 + 0.27 * s, z], [x + Math.cos(a) * l * 0.55, 0.08 + 0.27 * s + l, z + Math.sin(a) * l * 0.55], 0.06 * s, 0.006, { color: kit.vary(0x3f7a34, r, 0.15), rand: r }); }
      Fr.col.cyl(x, 0.25, z, 0.18 * s, 0.4, { tag: 'prop' }); };
    pot(door.u - 0.55, 0.35, 1.0); pot(door.u - 1.45, 0.3, 1.25); pot(door.u + 1.0, 0.75, 0.9); }
  // ---------- the lower deck on the annex roof: joists, rim, boards, railing (open toward the steps from the main deck), umbrella ----------
  { const db = P.board, pitch = db.w + db.gap, x0 = A.deckX0, x1 = A.x1 + 0.06, z0 = A.z0 - 0.06, z1 = A.z1 + 0.06, jb = dY - db.t;
    box(TEAL, A.x1 - A.x0, jb - 0.24 - H, A.z1 - A.z0, (A.x0 + A.x1) / 2, (H + jb - 0.24) / 2, (A.z0 + A.z1) / 2, { color: kit.mul(C.tealDeep, 0.8), wear: 0.3 });   // roof structure under the deck
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) { const hz = Math.abs(bz - az) < 0.01, len = hz ? bx - ax : bz - az;
      box(WOOD, hz ? len + 0.04 : 0.04, 0.24, hz ? 0.04 : len, (ax + bx) / 2, jb - 0.12, (az + bz) / 2, { grain: hz ? 0 : 2, color: gray(0.88), wear: 0.6 }); }
    for (let z = z0 + pitch / 2; z < z1 - 0.02; z += pitch) box(WOOD, x1 - x0, db.t, db.w, (x0 + x1) / 2, dY - db.t / 2, z, { grain: 0, color: gray(0.86 + r() * 0.24), wear: 0.4 + r() * 0.4, bevel: 0.005 });
    Fr.col.box((x0 + x1) / 2, (H + dY) / 2, (z0 + z1) / 2, x1 - x0, dY - H + 0.02, z1 - z0, { tag: 'deck', surface: 'wood' });
    const RL = P.rail, run = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), n = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) box(WOOD, RL.post, RL.h + 0.04, RL.post, ax + (bx - ax) * i / n, dY + RL.h / 2, az + (bz - az) * i / n, { grain: 1, color: gray(0.95), wear: 0.7, bevel: 0.008 }, 0, ry);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2; box(WOOD, len, 0.09, 0.04, cx, dY + RL.h - 0.1, cz, { grain: 0, color: gray(0.92), wear: 0.6 }, 0, ry); box(WOOD, len + 0.04, 0.04, 0.145, cx, dY + RL.h + 0.02, cz, { grain: 0, color: gray(0.96), wear: 0.65 }, 0, ry);
      box(WOOD, len, 0.04, 0.09, cx, dY + 0.1, cz, { grain: 0, color: gray(0.9), wear: 0.6 }, 0, ry);
      for (let t = 0.12; t < len - 0.06; t += RL.oc) box(WOOD, RL.bal, RL.h - 0.27, RL.bal, ax + (bx - ax) * t / len, dY + 0.12 + (RL.h - 0.27) / 2, az + (bz - az) * t / len, { grain: 1, color: gray(0.86 + r() * 0.2), wear: 0.6 }, 0, ry);
      Fr.col.box(cx, dY + 0.55, cz, len, 1.1, 0.1, { ry, tag: 'rail' }); };
    const S2 = P.mainStair.annexStep, e = 0.03;
    run(x0 + 0.1, z1 - e, x1 - e, z1 - e); run(x1 - e, z1 - e, x1 - e, z0 + e); run(x1 - e, z0 + e, x0 + 0.1, z0 + e); void S2;   // the west side is under the main deck's edge (steps come down there)
    // the yellow patio umbrella and a chair (11)
    { const ux = (A.x0 + A.x1) / 2 + 0.4, uz = (A.z0 + A.z1) / 2 + 0.6, YEL = mat.fabric('cotton_jersey', { rep: 0.4 });
      D.cyl(STEEL, 0.022, 0.022, 2.35, M(ux, dY + 1.17, uz), { color: 0xdedbd2, seg: 10 }); lathe(D, CONC, [[0.001, 0], [0.24, 0], [0.24, 0.06], [0.05, 0.1], [0.001, 0.1]], M(ux, dY, uz), { color: 0x9a978f, seg: 18 });
      lathe(B, YEL, [[0.001, 0.42], [0.5, 0.3], [1.05, 0.08], [1.12, 0.0], [1.1, -0.06], [1.02, 0.05], [0.45, 0.24], [0.001, 0.36]], M(ux, dY + 2.0, uz), { color: 0xe9bf2f, seg: 8, wear: 0.3 });
      Fr.col.cyl(ux, dY + 1.0, uz, 0.06, 2.0, { tag: 'pole' });
      ctx.async.push(kit.model('plastic_monobloc_chair_01').then((m) => { if (!m) return; m.position.set(ux - 0.8, dY, uz + 0.5); m.rotation.y = 2.3; Fr.groups.detail.add(m); })); }
  }
  // ---------- the fluorescent tube light in the carport under the house (11) ----------
  { const tx = -4.3, tz = -6.2, ty = ctx.r4 ? ctx.r4.beamBot - 0.08 : 2.95, TUBE = mat.emissive(0xeaf4ff, 2.6, 'r7tube');
    box(PL, 1.3, 0.06, 0.12, tx, ty + 0.03, tz, { color: 0xd6d4cc, bevel: 0.01 }, 0, 0, 0, D); D.cyl(TUBE, 0.016, 0.016, 1.22, M(tx, ty - 0.02, tz, 0, 0, Math.PI / 2), { seg: 10 });
    const tl = Fr.light({ id: 'r7_carport_tube', pos: [tx, ty - 0.2, tz], color: 0xdfeeff, intensity: 30, range: 8, on: false });
    ctx.updaters.push((dt, env) => { const t = env?.timeOfDay ?? 12; tl.on = t < 6.3 || t > 18.4; TUBE.emissiveIntensity = tl.on ? 2.6 : 0.25; }); }
  // ---------- the boat on its trailer at the canal's end (11: "a boat on a trailer parked at the water's edge") ----------
  { const bx = (P.canal.x0 + P.canal.x1) / 2, bz = P.canal.z1 + 4.2, MPt = mat.metalPaint(), RUB = mat.rubber();
    for (const s of [-1, 1]) B.strut(MPt, [bx + s * 0.75, 0.42, bz - 2.6], [bx + s * 0.75, 0.42, bz + 2.0], 0.08, 0.1, { color: 0x9a9c9c, rand: r });
    B.strut(MPt, [bx, 0.4, bz + 1.9], [bx, 0.38, bz + 3.4], 0.1, 0.1, { color: 0x9a9c9c, rand: r }); for (const s of [-1, 1]) B.strut(MPt, [bx + s * 0.72, 0.4, bz + 1.9], [bx, 0.38, bz + 3.2], 0.06, 0.06, { color: 0x9a9c9c, rand: r });
    for (const s of [-1, 1]) { D.cyl(RUB, 0.3, 0.3, 0.2, M(bx + s * 0.95, 0.3, bz - 0.4, 0, 0, Math.PI / 2), { color: 0x1a1a1a, seg: 18 }); D.cyl(STEEL, 0.14, 0.14, 0.21, M(bx + s * 0.95, 0.3, bz - 0.4, 0, 0, Math.PI / 2), { color: 0xbfc0bc, seg: 14 }); }
    Fr.col.box(bx, 0.8, bz, 2.1, 1.6, 6.0, { tag: 'vehicle' });
    const lib = loadKeysModels(THREE, ['skiff']);
    ctx.async.push(lib.ready.then(() => { const nm = lib.names('skiff'), p = nm.length ? lib.piece('skiff', nm[0]) : null; if (!p) return;
      const g = new THREE.Group(), ext = new THREE.Vector3(); p.box.getSize(ext); const inner = new THREE.Group(); if (ext.x > ext.z) inner.rotation.y = Math.PI / 2; g.add(inner);
      for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.castShadow = true; m.raycast = () => {}; inner.add(m); }
      inner.updateMatrixWorld(true); const wb = new THREE.Box3().setFromObject(inner); const k = Math.min(1, 5.2 / Math.max(0.1, wb.max.z - wb.min.z)); g.scale.setScalar(k);
      g.position.set(bx - (wb.min.x + wb.max.x) / 2 * k, 0.55 - wb.min.y * k, bz - 0.3 - (wb.min.z + wb.max.z) / 2 * k); Fr.groups.detail.add(g); }).catch(() => {}));
  }
  Fr.anchor('annexDoor', 11.9, 0, A.z1 + 0.8, 0);
  B.build(Fr.groups.ext); D.build(Fr.groups.detail);
  for (const g of [Fr.groups.ext, Fr.groups.detail]) g.traverse((o) => { const m = o.material; if (!m || m.userData?.r4matte || m.transparent) return; m.userData.r4matte = true; m.envMapIntensity = Math.min(m.envMapIntensity ?? 1, m.metalness > 0.5 ? 0.6 : 0.35); });
}
