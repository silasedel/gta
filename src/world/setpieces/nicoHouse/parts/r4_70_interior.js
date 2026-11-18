// Nico's house, round 4: the interior (user mock-ups 04-07, 09). The front door opens into a short hall with the bathroom
// door on the right; the hall opens into one room: kitchen on the RIGHT (east), living room on the LEFT (west). Warm honey
// plank floor, dark olive painted board walls, a vaulted board ceiling with exposed dark beams, woven bamboo roll-up blinds,
// dim window light. Kitchen: green cabinets with round knobs, speckled laminate, the old white fridge with magnets and notes,
// the white gas range (the user's Stove 1) under a hood, coffee maker, blender, kettle, microwave, spray bottle, a peninsula
// with two dark bar stools and a big conical pendant. The terrarium (09) at the kitchen / living boundary: black-framed tank
// with a mesh lid on a dark wood base, pedestal and casters; bark, driftwood, rock, ferns, a half-log hide, a turquoise water
// tub, the corn snake. Living room (06): rattan sofa with camo-floral cushions, weathered coffee table and ashtray, flat TV on
// a black box stand, clutter in the corner. Back room (07): bare stud walls, drywall sheets, blue tape, a standing fan,
// tropical-print curtains, Nico's mattress (sleep), the journal (save) and the clothes rack (wardrobe).
import { R4, P4 } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { loadKeysModels } from '../models.js';
export const order = 70;

export function build(ctx) {
  if (!R4) return;
  const { THREE, kit } = ctx, im = kit.imat, Fr = frame(ctx), I = Fr.int, M = kit.M, P = P4, r = kit.rng(707), F = P.F, T = P.wallT, yT = F + P.wallH, PI = Math.PI;
  const { hexa, subtract, lathe } = makeGeo(THREE, kit);
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0) => I.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o });
  const OLIVE = im.paint({ peel: 'b', fade: 0.12, gloss: 0.7, scale: 0.7 }), WHITEP = im.paint({ peel: 'a', fade: 0.08, gloss: 0.6, scale: 0.6 });
  const FLOOR = im.pbr('wood_floor_worn', { rep: 1.4, rough: 0.5 }), PLAST = im.plastic(), GLOSS = im.plasticGloss(), STEEL = im.steel(), CER = im.ceramic(), MATTE = im.matte(), CHROME = im.chrome();
  let bambooM = null;
  const Bd = P.body, x0 = Bd.x0 + T, x1 = Bd.x1 - T, z0 = Bd.z0 + T, z1 = Bd.z1 - T;
  const roofTop = (z) => P.yRidge - Math.abs(z - P.ridgeZ) * P.pitch, ceilY = (z) => roofTop(z) - 0.2;
  // ================= floor: honey planks (living, hall, back room), gray square tile in the kitchen (09), tile in the bath =================
  const KT = P.kitchen, BA = P.bath;
  const tileMat = im.art('r4tile', 512, 512, (g, w, h) => { g.fillStyle = '#7d817c'; g.fillRect(0, 0, w, h); const q = kit.rng(3), n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 150 + q() * 30 | 0; g.fillStyle = `rgb(${v - 6},${v},${v - 4})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(80,80,70,${q() * 0.15})`; g.fillRect(i * s + q() * s, j * s + q() * s, 2, 2); } } }, { rough: 0.45 });
  tileMat.map.repeat.set(1, 1); tileMat.userData.uvScale = 2.4;
  for (let z = z0; z < z1 - 0.01; z += 0.142) { const zm = z + 0.071; let x = x0;
    while (x < x1 - 0.01) { let xe = Math.min(x1, x + 1.2 + r() * 2.2);
      const inK = (xx) => zm > KT.z0 && zm < KT.z1 && xx > KT.x0 && xx < KT.x1, inB = (xx) => zm > BA.z0 && zm < BA.z1 && xx > BA.x0 && xx < BA.x1;
      for (const [a, b] of subtract(x, xe, [[KT.x0, KT.x1].map((v, i) => (zm > KT.z0 && zm < KT.z1 ? v : i ? -1e3 : -1e3 - 1)), [BA.x0, BA.x1].map((v, i) => (zm > BA.z0 && zm < BA.z1 ? v : i ? -1e3 : -1e3 - 1))]))
        box(FLOOR, b - a - 0.003, 0.02, 0.138, (a + b) / 2, F + 0.01, zm, { grain: 0, color: kit.vary(0xd9a35f, r, 0.1), wear: 0.3, bevel: 0.002, uv: [r() * 7, r() * 7] });
      void inK; void inB; x = xe; } }
  box(tileMat, KT.x1 - KT.x0, 0.02, KT.z1 - KT.z0 + 0.0, (KT.x0 + KT.x1) / 2, F + 0.011, (KT.z0 + KT.z1) / 2 - T / 2 + 0.0, { color: 0xffffff, bevel: 0.002, uvS: 2.4 });
  box(im.pbr('long_white_tiles', { rep: 0.9 }), BA.x1 - BA.x0 - 0.06, 0.02, BA.z1 - BA.z0 - T, (BA.x0 + BA.x1) / 2, F + 0.011, (BA.z0 + BA.z1) / 2 - T / 2, { color: 0xc8ccc8, bevel: 0.002 });
  // ================= wall lining: dark olive vertical boards on the inside of the exterior walls, cut at the openings =================
  for (const W of ctx.r4walls || []) {
    const ops = (ctx.r4openings || []).filter((o) => o.wall === W && o.kind !== 'vent'), L = W.L;
    const top = (u) => (W.gable ? ceilY(W.pt(u, 0)[1]) + 0.05 : yT + 0.12);
    const nB = Math.ceil((L - 2 * T) / 0.15);
    for (let i = 0; i < nB; i++) { const u0 = T + i * (L - 2 * T) / nB, u1 = T + (i + 1) * (L - 2 * T) / nB, tone = kit.vary(0x4e4b2f, r, 0.08);
      for (const [s0, s1] of subtract(u0, u1, ops.map((o) => [o.u0 - 0.03, o.u1 + 0.03]), 0.004)) for (const [y0, y1] of [[F + 0.02, 99]]) { const t0 = top(s0), t1 = top(s1), a0 = W.pt(s0 + 0.001, -T), a1 = W.pt(s1 - 0.001, -T), b0 = W.pt(s1 - 0.001, -T + 0.018), b1 = W.pt(s0 + 0.001, -T + 0.018);
        hexa(I, OLIVE, [[a0[0], y0, a0[1]], [a1[0], y0, a1[1]], [b0[0], y0, b0[1]], [b1[0], y0, b1[1]], [a0[0], t0, a0[1]], [a1[0], t1, a1[1]], [b0[0], t1, b0[1]], [b1[0], t0, b1[1]]], { color: tone, wear: 0.15 }); void y1; }
      const um = (u0 + u1) / 2;
      for (const o of ops.filter((q) => q.u0 - 0.03 < um && q.u1 + 0.03 > um)) for (const [y0, y1] of subtract(F + 0.02, top(um), [[o.y0 - 0.03, o.y1 + 0.03]])) { const a0 = W.pt(u0 + 0.001, -T), b1 = W.pt(u1 - 0.001, -T + 0.018), cx = (a0[0] + b1[0]) / 2, cz = (a0[1] + b1[1]) / 2; box(OLIVE, u1 - u0 - 0.002, Math.min(y1, top(um) - 0.02) - y0, 0.018, cx, (y0 + Math.min(y1, top(um) - 0.02)) / 2, cz, { grain: 1, color: tone, wear: 0.15 }, 0, W.ry); }
    }
    // baseboard and window stools / aprons (white), bamboo roll-up blinds half down
    for (const [u0, u1] of subtract(T, L - T, ops.filter((o) => o.sill < 0.1).map((o) => [o.u0 - 0.05, o.u1 + 0.05]))) { const [x, z] = W.pt((u0 + u1) / 2, -T - 0.012); box(WHITEP, u1 - u0, 0.1, 0.018, x, F + 0.07, z, { color: 0x6b6440, wear: 0.3 }, 0, W.ry); }
    for (const o of ops.filter((q) => q.kind === 'window')) { const [x, z] = W.pt(o.u, -T - 0.03); box(WHITEP, o.w + 0.14, 0.03, 0.08, x, o.y0 - 0.015, z, { color: 0xd8d2c0, wear: 0.4 }, 0, W.ry);
      if (o.frosted) continue; const down = o.h * (0.42 + r() * 0.25), [bx, bz] = W.pt(o.u, -T - 0.05);
      box(BAMBOO(), o.w + 0.1, down, 0.008, bx, o.y1 + 0.02 - down / 2, bz, { color: 0xffffff, bevel: 0.002, uvS: 1 }, 0, W.ry);
      I.cyl(im.pbr('tatami_mat', { rep: 0.3 }), 0.035, 0.035, o.w + 0.1, M(bx, o.y1 + 0.06, bz, 0, W.ry, PI / 2), { color: 0xb08850, seg: 14 });
      for (const s of [-1, 1]) { const [cx, cz] = W.pt(o.u + s * (o.w / 2 - 0.05), -T - 0.06); I.tube(im.fabric('wool_boucle', { rep: 0.05 }), [[cx, o.y1 + 0.06, cz], [cx, o.y1 + 0.02 - down - 0.06, cz]], 0.003, { seg: 4, color: 0xd8cca8, steps: 4 }); } }
  }
  function BAMBOO() { return (bambooM ||= (() => { const m = im.art('r4bamboo', 256, 512, (g, w, h) => { const q = kit.rng(17); for (let y = 0; y < h; y += 8) { const v = 150 + q() * 50 | 0; g.fillStyle = `rgb(${v + 30},${v},${v - 60})`; g.fillRect(0, y, w, 7); g.fillStyle = 'rgba(60,40,10,0.45)'; g.fillRect(0, y + 7, w, 1); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(90,60,20,0.35)'; g.fillRect(q() * w, y, 3, 7); } }
      for (const xx of [w * 0.25, w * 0.75]) { g.fillStyle = 'rgba(70,45,15,0.8)'; g.fillRect(xx - 2, 0, 4, h); } }, { rough: 0.85 }); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.userData.uvScale = 1; return m; })()); }
  // ================= vaulted board ceiling and exposed beams =================
  { const CB = im.paint({ peel: 'a', fade: 0.05, gloss: 0.8, scale: 0.5 }), a = Math.atan(P.pitch);
    for (const side of [1, -1]) { const zr = P.ridgeZ, ze = side > 0 ? z1 : z0, run = Math.abs(ze - zr), sl = Math.hypot(run, run * P.pitch), n = Math.ceil((x1 - x0) / 0.15);
      for (let i = 0; i < n; i++) { const xa = x0 + i * (x1 - x0) / n, xb = x0 + (i + 1) * (x1 - x0) / n, zc = (zr + ze) / 2, yc = (ceilY(zr) + ceilY(ze)) / 2 + 0.01;
        box(CB, xb - xa - 0.002, 0.016, sl + 0.02, (xa + xb) / 2, yc, zc, { grain: 2, color: kit.vary(0x5a4a34, r, 0.08), wear: 0.1, bevel: 0.002 }, side * a); } }
    const BEAM = im.wood({ dark: true });
    for (let x = x0 + 0.9; x < x1 - 0.5; x += 1.6) box(BEAM, 0.11, 0.22, z1 - z0 - 0.01, x, yT + 0.15, (z0 + z1) / 2, { grain: 2, color: 0x4a3a2a, wear: 0.3, bevel: 0.008 });   // tie beams across the room
    box(BEAM, x1 - x0, 0.26, 0.14, (x0 + x1) / 2, ceilY(P.ridgeZ) - 0.12, P.ridgeZ, { grain: 0, color: 0x46372a, wear: 0.3, bevel: 0.008 });                      // ridge beam
    for (const z of [z0 + 0.06, z1 - 0.06]) box(BEAM, x1 - x0, 0.14, 0.1, (x0 + x1) / 2, yT + 0.08, z, { grain: 0, color: 0x46372a, wear: 0.3 }); }
  // ================= partitions =================
  const part = (ax, az, bx, bz, h, doors = [], o = {}) => { const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ry = Math.atan2(-uz, ux);
    for (const [u0, u1] of subtract(0, L, doors.map((d) => [d.u - d.w / 2, d.u + d.w / 2]))) { const um = (u0 + u1) / 2; box(o.m || OLIVE, u1 - u0, h, 0.11, ax + ux * um, F + 0.02 + h / 2, az + uz * um, { grain: 1, color: o.color || 0x55512f, wear: 0.12 }, 0, ry); Fr.col.box(ax + ux * um, F + h / 2, az + uz * um, u1 - u0, h, 0.12, { ry, tag: 'wall' }); }
    for (const d of doors) { box(o.m || OLIVE, d.w, h - 2.06, 0.11, ax + ux * d.u, F + 2.06 + (h - 2.06) / 2, az + uz * d.u, { color: o.color || 0x55512f, wear: 0.12 }, 0, ry);
      for (const s of [-1, 1]) box(WHITEP, 0.07, 2.1, 0.13, ax + ux * (d.u + s * (d.w / 2 + 0.035)), F + 1.05, az + uz * (d.u + s * (d.w / 2 + 0.035)), { color: 0xc9c2ac, wear: 0.4 }, 0, ry);
      box(WHITEP, d.w + 0.14, 0.07, 0.13, ax + ux * d.u, F + 2.095, az + uz * d.u, { color: 0xc9c2ac, wear: 0.4 }, 0, ry); }
    return { ux, uz, ry, L }; };
  const hH = 2.55;
  part(-0.7, z1, -0.7, -5.6, hH);                                                          // hall left wall
  part(0.7, z1, 0.7, BA.z0, hH, [{ u: 1.05, w: 0.78 }], { color: 0x5b5733 });              // hall right wall with the bathroom door (04)
  part(0.7, BA.z0, BA.x1, BA.z0, hH, [], { color: 0x5b5733 });                             // bath | kitchen
  part(BA.x1, z1, BA.x1, BA.z0, hH, []);                                                   // bath | back room
  part(0.7, BA.z0, 0.7, -7.35, 2.0, [], { m: WHITEP, color: 0xd9d6cc });                   // the white fridge-height partition at the kitchen / living boundary (05 / 09)
  // bathroom door (ajar), the toilet and a small vanity
  { const g = new THREE.Group(), DB = kit.batch('r4bathdoor'); DB.box(WHITEP, 0.76, 2.03, 0.04, M(0.38, 1.015, 0), { color: 0xcfc8b4, wear: 0.4, bevel: 0.006 }); lathe(DB, CHROME, [[0.001, 0], [0.025, 0.005], [0.028, 0.02], [0.001, 0.04]], M(0.68, 0.95, 0.03, PI / 2, 0, 0), { color: 0xb5b0a4, seg: 16 }); DB.build(g);
    const hz = z1 - 1.05 + 0.39; g.position.set(0.7 + 0.03, F + 0.01, hz); g.rotation.y = PI / 2 + 0.9; Fr.groups.int.add(g); }
  // ================= kitchen =================
  const GREEN = im.paint({ peel: 'a', fade: 0.15, gloss: 0.55, scale: 0.5 }), green = () => kit.vary(0x5f8a52, r, 0.04);
  const LAM = im.art('r4lam', 512, 512, (g, w, h) => { g.fillStyle = '#d9d4c6'; g.fillRect(0, 0, w, h); const q = kit.rng(8); for (let i = 0; i < 9000; i++) { const c = q(); g.fillStyle = c < 0.5 ? `rgba(90,85,75,${0.3 + q() * 0.4})` : c < 0.8 ? `rgba(160,150,130,0.5)` : 'rgba(250,250,245,0.7)'; g.fillRect(q() * w, q() * h, 1.5 + q() * 2, 1.5 + q() * 2); } }, { rough: 0.35 });
  LAM.userData.uvScale = 0.6;
  const knob = (x, y, z, ry) => lathe(I, CHROME, [[0.001, 0], [0.013, 0.002], [0.016, 0.014], [0.012, 0.024], [0.001, 0.026]], M(x, y, z, PI / 2, ry, 0), { color: 0xc6c2b8, seg: 14 });
  // base run along x at the back wall (z = z0), facing +z; tall uppers above
  const baseRun = (xa, xb, zBack, face, o = {}) => { const d = 0.6, zc = zBack + face * d / 2, n = Math.max(1, Math.round((xb - xa) / 0.5));
    box(GREEN, xb - xa, 0.84, d - 0.03, (xa + xb) / 2, F + 0.02 + 0.42, zc - face * 0.015, { color: kit.mul(green(), 0.8), wear: 0.2 });
    box(GREEN, xb - xa - 0.02, 0.1, 0.02, (xa + xb) / 2, F + 0.07, zBack + face * (d - 0.08), { color: 0x2a2a24, wear: 0.1 });   // toe kick shadow
    for (let i = 0; i < n; i++) { const xm = xa + (xb - xa) * (i + 0.5) / n, w = (xb - xa) / n - 0.012;
      if (o.sinkAt && Math.abs(xm - o.sinkAt) < 0.45) { box(GREEN, w, 0.62, 0.02, xm, F + 0.42, zBack + face * (d + 0.005), { color: green(), wear: 0.25 }); }
      else { box(GREEN, w, 0.16, 0.02, xm, F + 0.74, zBack + face * (d + 0.005), { color: green(), wear: 0.25 }); knob(xm, F + 0.74, zBack + face * (d + 0.016), face > 0 ? 0 : PI); box(GREEN, w, 0.5, 0.02, xm, F + 0.38, zBack + face * (d + 0.005), { color: green(), wear: 0.25 }); }
      knob(xm + w * 0.35, F + 0.55, zBack + face * (d + 0.016), face > 0 ? 0 : PI); }
    box(LAM, xb - xa + 0.03, 0.035, d + 0.03, (xa + xb) / 2, F + 0.88, zBack + face * (d / 2 + 0.01), { color: 0xffffff, bevel: 0.006 });
    Fr.col.box((xa + xb) / 2, F + 0.45, zc, xb - xa, 0.9, d, { tag: 'furniture' }); };
  const sinkX = 6.5 - 4.4;   // under the kitchen window
  baseRun(KT.x0 + 0.05, 3.0, z0, 1, { sinkAt: sinkX });
  // sink basin (steel, real thickness) + faucet
  { box(STEEL, 0.6, 0.02, 0.42, sinkX, F + 0.9, z0 + 0.33, { color: 0xb8b8b2 }); box(im.matte(), 0.54, 0.02, 0.36, sinkX, F + 0.75, z0 + 0.33, { color: 0x6a6a66 });
    I.tube(CHROME, [[sinkX, F + 0.9, z0 + 0.06], [sinkX, F + 1.18, z0 + 0.08], [sinkX, F + 1.2, z0 + 0.22], [sinkX, F + 1.08, z0 + 0.3]], 0.011, { seg: 10, color: 0xc8c6c0, steps: 20 }); }
  // the user's gas range (Stove 1) at x 3.35 against the back wall + the hood
  const stoveX = 3.4;
  { const HD = im.metalPaint(); box(HD, 0.76, 0.16, 0.5, stoveX, F + 1.62, z0 + 0.25, { color: 0xdedbd2, bevel: 0.01 }); hexa(I, HD, [[stoveX - 0.38, F + 1.7, z0], [stoveX + 0.38, F + 1.7, z0], [stoveX + 0.38, F + 1.7, z0 + 0.5], [stoveX - 0.38, F + 1.7, z0 + 0.5], [stoveX - 0.15, F + 2.1, z0], [stoveX + 0.15, F + 2.1, z0], [stoveX + 0.15, F + 2.1, z0 + 0.22], [stoveX - 0.15, F + 2.1, z0 + 0.22]], { color: 0xdedbd2 });
    box(HD, 0.3, yT - F - 2.1, 0.22, stoveX, (F + 2.1 + yT) / 2, z0 + 0.11, { color: 0xdedbd2 });
    Fr.col.box(stoveX, F + 0.45, z0 + 0.33, 0.76, 0.9, 0.66, { tag: 'furniture' }); }
  // green uppers along the back wall (left of the window and between window and hood)
  for (const [xa, xb] of [[KT.x0 + 0.05, sinkX - 0.75], [sinkX + 0.75, stoveX - 0.42]]) { if (xb - xa < 0.2) continue; const n = Math.max(1, Math.round((xb - xa) / 0.45));
    box(GREEN, xb - xa, 0.72, 0.32, (xa + xb) / 2, F + 1.86, z0 + 0.16, { color: kit.mul(green(), 0.8), wear: 0.2 });
    for (let i = 0; i < n; i++) { const xm = xa + (xb - xa) * (i + 0.5) / n; box(GREEN, (xb - xa) / n - 0.012, 0.68, 0.02, xm, F + 1.86, z0 + 0.33, { color: green(), wear: 0.25 }); knob(xm + ((i % 2) ? -1 : 1) * ((xb - xa) / n * 0.35), F + 1.62, z0 + 0.344, 0); } }
  // old white fridge (top freezer), against the back room wall, facing west into the kitchen (07)
  { const fx = KT.x1 - 0.42, fz = z0 + 0.5, FR = im.plasticGloss(), H = 1.68, Wd = 0.76, Dd = 0.7, fc = 0xe8e4d6;
    box(FR, Dd, H, Wd, fx, F + 0.02 + H / 2, fz, { color: kit.mul(fc, 0.96), bevel: 0.035 });
    box(FR, 0.04, H * 0.3 - 0.02, Wd - 0.03, fx - Dd / 2 - 0.02, F + H - H * 0.15 + 0.01, fz, { color: fc, bevel: 0.015 }); box(FR, 0.04, H * 0.68 - 0.02, Wd - 0.03, fx - Dd / 2 - 0.02, F + 0.03 + H * 0.34, fz, { color: fc, bevel: 0.015 });
    for (const [y0, y1] of [[F + H * 0.75, F + H * 0.95], [F + H * 0.42, F + H * 0.66]]) box(CHROME, 0.04, y1 - y0, 0.03, fx - Dd / 2 - 0.06, (y0 + y1) / 2, fz + Wd / 2 - 0.08, { color: 0xbab6ac, bevel: 0.01 });
    const MAG = im.plastic(); for (let k = 0; k < 9; k++) { const yy = F + 0.9 + r() * 0.75, zz = fz - 0.3 + r() * 0.5, c = [0xc23b2e, 0x2f6fb0, 0xe5c13a, 0x2c8a4a, 0xf2f0ea][k % 5];
      if (k < 4) box(im.matte(), 0.004, 0.1 + r() * 0.06, 0.08 + r() * 0.04, fx - Dd / 2 - 0.045, yy, zz, { color: 0xf3efe0, bevel: 0 }, 0, 0, (r() - 0.5) * 0.2);
      box(MAG, 0.012, 0.03, 0.04, fx - Dd / 2 - 0.05, yy + 0.05, zz, { color: c, bevel: 0.004 }); }
    Fr.col.box(fx, F + H / 2, fz, Dd, H, Wd, { tag: 'furniture' }); }
  // peninsula from the back wall at x = KT.x0 + 0.35, stools on the living side, conical pendant (07)
  const penX = KT.x0 + 0.3, penZ0 = z0 + 0.62, penZ1 = -7.55;
  { box(GREEN, 0.6, 0.86, penZ1 - penZ0, penX, F + 0.45, (penZ0 + penZ1) / 2, { color: kit.mul(green(), 0.85), wear: 0.25 });
    box(LAM, 0.9, 0.035, penZ1 - penZ0 + 0.05, penX - 0.12, F + 0.9, (penZ0 + penZ1) / 2, { color: 0xffffff, bevel: 0.006 });
    for (let z = penZ0 + 0.3; z < penZ1 - 0.2; z += 0.55) { box(GREEN, 0.02, 0.6, 0.5, penX + 0.31, F + 0.42, z, { color: green(), wear: 0.25 }); knob(penX + 0.325, F + 0.62, z + 0.18, PI / 2); }
    Fr.col.box(penX, F + 0.45, (penZ0 + penZ1) / 2, 0.6, 0.9, penZ1 - penZ0, { tag: 'furniture' });
    const STO = im.wood({ dark: true });
    for (const z of [penZ0 + 0.6, penZ0 + 1.35]) { const sx = penX - 0.75; box(STO, 0.36, 0.04, 0.36, sx, F + 0.7, z, { color: 0x2e241c, bevel: 0.01 });
      for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) I.strut(STO, [sx + dx * 1.15, F + 0.02, z + dz * 1.15], [sx + dx, F + 0.68, z + dz], 0.035, 0.035, { color: 0x2e241c, bevel: 0.004 });
      for (const y of [F + 0.25]) for (const s of [-1, 1]) { box(STO, 0.32, 0.025, 0.025, sx, y, z + s * 0.16, { color: 0x2e241c }); box(STO, 0.025, 0.025, 0.32, sx + s * 0.16, y + 0.05, z, { color: 0x2e241c }); }
      Fr.col.box(sx, F + 0.35, z, 0.4, 0.7, 0.4, { tag: 'furniture' }); }
    // counter things: coffee maker, blender, kettle, microwave, spray bottle (05 / 07 / 09)
    const cy = F + 0.918, ap = (x, z) => [x, z];
    { const [x, z] = ap(penX - 0.1, penZ0 + 0.25); box(PLAST, 0.2, 0.32, 0.24, x, cy + 0.16, z, { color: 0x1d1d1d, bevel: 0.02 }); box(CHROME, 0.21, 0.05, 0.25, x, cy + 0.34, z, { color: 0xa8a6a0, bevel: 0.01 }); lathe(I, im.glass(), [[0.001, 0], [0.07, 0.0], [0.075, 0.1], [0.065, 0.14], [0.001, 0.14]], M(x + 0.02, cy + 0.02, z - 0.05), { seg: 20 }); }
    { const [x, z] = ap(penX - 0.15, penZ0 + 0.75); box(PLAST, 0.17, 0.12, 0.17, x, cy + 0.06, z, { color: 0x2a2a2a, bevel: 0.02 }); lathe(I, im.glass(), [[0.05, 0], [0.075, 0.15], [0.08, 0.27], [0.001, 0.28]], M(x, cy + 0.12, z), { seg: 18 }); box(PLAST, 0.09, 0.03, 0.09, x, cy + 0.41, z, { color: 0x1d1d1d }); }
    { lathe(I, STEEL, [[0.001, 0], [0.085, 0], [0.09, 0.05], [0.075, 0.17], [0.03, 0.2], [0.001, 0.205]], M(stoveX - 0.15, F + 0.86, z0 + 0.45), { color: 0xc8c6c0, seg: 22 }); }
    { box(GLOSS, 0.48, 0.28, 0.36, KT.x0 + 0.35, cy + 0.14, z0 + 0.25, { color: 0xe3e0d8, bevel: 0.02 }); box(im.glass(), 0.003, 0.18, 0.28, KT.x0 + 0.35 + 0.0, cy + 0.15, z0 + 0.25 + 0.181, { bevel: 0 }, 0, PI / 2); }
    lathe(I, PLAST, [[0.001, 0], [0.04, 0], [0.042, 0.13], [0.02, 0.17], [0.015, 0.2], [0.001, 0.2]], M(sinkX + 0.45, cy, z0 + 0.18), { color: 0xf0f0ea, seg: 16 });
    // big conical pendant over the peninsula, one over the living room (06)
    const pend = (x, z, y, R) => { lathe(I, im.plastic(), [[0.03, 0.3], [0.05, 0.26], [R * 0.45, 0.12], [R, 0], [R - 0.008, -0.004], [R * 0.45 - 0.01, 0.116], [0.045, 0.255], [0.027, 0.29]], M(x, y, z), { color: 0xeeebe2, seg: 32 });
      I.cyl(STEEL, 0.004, 0.004, ceilY(z) - y - 0.3, M(x, (ceilY(z) + y + 0.3) / 2, z), { color: 0x333333, seg: 6 }); I.geo(im.emissive(0xfff0d0, 1.6, 'r4bulb'), new THREE.SphereGeometry(0.05, 12, 8), M(x, y + 0.08, z), {}); };
    pend(penX - 0.1, (penZ0 + penZ1) / 2, F + 1.75, 0.3); pend(-3.6, -7.2, F + 1.95, 0.22);
    const kl = Fr.light({ id: 'r4_kitchen', pos: [penX - 0.1, F + 1.7, (penZ0 + penZ1) / 2], color: 0xffd9a8, intensity: 28, range: 6, on: false }), ll = Fr.light({ id: 'r4_living', pos: [-3.6, F + 1.9, -7.2], color: 0xffd6a0, intensity: 26, range: 7, on: false });
    const sw = { manual: null }; ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12, auto = t < 7 || t > 18.3; kl.on = ll.on = sw.manual ?? auto; });
    Fr.interact({ id: 'switch_kitchen', kind: 'switch', label: () => (kl.on ? 'Lights off' : 'Lights on'), pos: [0.65, F + 1.3, -5.0], radius: 1.1, use: () => { sw.manual = !kl.on; } });
  }
  // ================= the terrarium (09), at the kitchen / living boundary against the white partition =================
  { const tx = 0.25, tz = -6.85, TW = 0.48, TL = 0.92, TH = 0.46, baseY = F + 0.78, WDK = im.wood({ dark: true }), BLK = im.metalPaint();
    // dark wood base with a drawer, pedestal, three splayed feet on casters
    box(WDK, TW + 0.1, 0.16, TL + 0.1, tx, baseY - 0.08, tz, { grain: 2, color: 0x3a2618, wear: 0.4, bevel: 0.012 });
    for (const dz of [-0.2, 0.2]) knob(tx + TW / 2 + 0.05, baseY - 0.08, tz + dz, PI / 2);
    lathe(I, WDK, [[0.001, 0], [0.05, 0], [0.06, 0.05], [0.04, 0.15], [0.055, 0.3], [0.035, 0.45], [0.06, 0.56], [0.08, 0.6], [0.001, 0.6]], M(tx, F + 0.12, tz), { color: 0x2f1f14, seg: 20 });
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4, fx2 = tx + Math.cos(a) * 0.32, fz2 = tz + Math.sin(a) * 0.32; I.tube(WDK, [[tx, F + 0.2, tz], [tx + Math.cos(a) * 0.18, F + 0.12, tz + Math.sin(a) * 0.18], [fx2, F + 0.07, fz2]], 0.022, { seg: 8, color: 0x2f1f14, steps: 12 });
      I.cyl(BLK, 0.025, 0.025, 0.02, M(fx2, F + 0.045, fz2, PI / 2, a, 0), { color: 0x6a5a40, seg: 12 }); lathe(I, CHROME, [[0.001, 0], [0.012, 0.003], [0.012, 0.03], [0.001, 0.035]], M(fx2, F + 0.05, fz2), { color: 0x9a8a60, seg: 8 }); }
    // tank: black frame (closed bars), glass panes, mesh lid in two halves
    const yb = baseY + 0.002, yt = yb + TH;
    for (const [sx, sy, sz, x, y, z] of [[TW, 0.025, 0.025, tx, yb + 0.012, tz - TL / 2], [TW, 0.025, 0.025, tx, yb + 0.012, tz + TL / 2], [0.025, 0.025, TL, tx - TW / 2, yb + 0.012, tz], [0.025, 0.025, TL, tx + TW / 2, yb + 0.012, tz],
      [TW, 0.025, 0.025, tx, yt, tz - TL / 2], [TW, 0.025, 0.025, tx, yt, tz + TL / 2], [0.025, 0.025, TL, tx - TW / 2, yt, tz], [0.025, 0.025, TL, tx + TW / 2, yt, tz], [TW, 0.02, 0.02, tx, yt, tz],
      [0.025, TH, 0.025, tx - TW / 2, (yb + yt) / 2, tz - TL / 2], [0.025, TH, 0.025, tx + TW / 2, (yb + yt) / 2, tz - TL / 2], [0.025, TH, 0.025, tx - TW / 2, (yb + yt) / 2, tz + TL / 2], [0.025, TH, 0.025, tx + TW / 2, (yb + yt) / 2, tz + TL / 2]])
      box(BLK, sx, sy, sz, x, y, z, { color: 0x141414, bevel: 0.003 });
    const GL = im.glass({ dirt: 1 });
    for (const [sx, sz, x, z] of [[TW - 0.02, 0.005, tx, tz - TL / 2], [TW - 0.02, 0.005, tx, tz + TL / 2], [0.005, TL - 0.02, tx - TW / 2, tz], [0.005, TL - 0.02, tx + TW / 2, tz]]) box(GL, sx, TH - 0.03, sz, x, (yb + yt) / 2, z, { bevel: 0 });
    const MESH = im.art('r4mesh', 256, 256, (g, w, h) => { g.fillStyle = '#3d4040'; g.fillRect(0, 0, w, h); g.fillStyle = '#121313'; for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } }, { rough: 0.7 }); MESH.userData.uvScale = 0.25;
    for (const s of [-1, 1]) box(MESH, TW - 0.03, 0.006, TL / 2 - 0.03, tx, yt + 0.006, tz + s * TL / 4, { bevel: 0.001 });
    // inside: bark substrate, driftwood, flat rock, ferns, half-log hide, turquoise water tub
    const BARK = im.art('r4bark', 256, 256, (g, w, h) => { g.fillStyle = '#3a2717'; g.fillRect(0, 0, w, h); const q = kit.rng(5); for (let i = 0; i < 1400; i++) { const v = 40 + q() * 60 | 0; g.fillStyle = `rgb(${v + 25},${v},${v - 15})`; g.fillRect(q() * w, q() * h, 2 + q() * 6, 1 + q() * 3); } }, { rough: 0.95 }); BARK.userData.uvScale = 0.25;
    box(BARK, TW - 0.03, 0.06, TL - 0.03, tx, yb + 0.03, tz, { bevel: 0.004 });
    const sub = yb + 0.06;
    I.tube(im.pbr('bark_brown_02', { rep: 0.3 }), [[tx - 0.15, sub + 0.02, tz - 0.38], [tx - 0.02, sub + 0.1, tz - 0.12], [tx + 0.1, sub + 0.14, tz + 0.15], [tx + 0.16, sub + 0.08, tz + 0.36]], 0.025, { seg: 10, color: 0xbfae94, steps: 24 });
    I.geo(im.concrete(), new THREE.SphereGeometry(0.1, 16, 10), M(tx - 0.08, sub + 0.015, tz - 0.25, 0, 0.5, 0, 1, 0.28, 0.75), { color: 0x9a9a94 });
    { const g = new THREE.CylinderGeometry(0.08, 0.08, 0.26, 16, 1, true, 0, PI); I.geo(im.pbr('bark_brown_02', { rep: 0.3 }), g, M(tx + 0.1, sub, tz + 0.28, 0, 0, PI / 2), { color: 0xa89275 }); g.dispose();
      const g2 = new THREE.CylinderGeometry(0.068, 0.068, 0.262, 16, 1, true, 0, PI); I.geo(im.pbr('bark_brown_02', { rep: 0.3 }), g2, M(tx + 0.1, sub, tz + 0.28, 0, 0, PI / 2), { color: 0x5a4532 }); g2.dispose(); }
    box(GLOSS, 0.2, 0.08, 0.15, tx + 0.08, sub + 0.04, tz - 0.3, { color: 0x1fb4b0, bevel: 0.012 }); box(GLOSS, 0.21, 0.012, 0.16, tx + 0.08, sub + 0.085, tz - 0.3, { color: 0x22c2bd, bevel: 0.004 });
    for (let k = 0; k < 22; k++) { const a = r() * 6.28, base = [tx - 0.17 + (k % 2) * 0.3, sub, tz + (k < 11 ? -0.4 : 0.38)], l = 0.12 + r() * 0.1, tip = [base[0] + Math.cos(a) * l * 0.7, sub + l, base[2] + Math.sin(a) * l * 0.5];
      I.tube(im.matte(), [base, [(base[0] + tip[0]) / 2, sub + l * 0.8, (base[2] + tip[2]) / 2], tip], 0.006, { seg: 4, color: 0x3f7a2c, steps: 6 }); }
    // the corn snake: a smooth tapered tube on a coil, orange saddles with dark borders on white-cream (09)
    { const SN = im.art('r4snake', 1024, 64, (g, w, h) => { g.fillStyle = '#f3ece0'; g.fillRect(0, 0, w, h); const q = kit.rng(12);
        for (let x = 10; x < w; x += 34 + q() * 8) { const sw = 18 + q() * 6; g.fillStyle = '#7a2412'; g.fillRect(x - 1.5, 6, sw + 3, h - 12); g.fillStyle = '#e8562a'; g.fillRect(x, 8, sw, h - 16); g.fillStyle = '#f07a3c'; g.fillRect(x + 3, 14, sw - 6, h - 28); }
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, h * 0.45, w, 2); }, { rough: 0.38 });
      SN.map.wrapS = THREE.RepeatWrapping;
      const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * 6.283 * 1.45 + 0.4, rr = 0.07 + 0.11 * t; pts.push(new THREE.Vector3(tx + Math.cos(a) * rr * 0.9 + (t > 0.85 ? (t - 0.85) * 0.6 : 0), sub + 0.022 + (t < 0.08 ? (0.08 - t) * 0.6 : 0) + (t > 0.55 && t < 0.7 ? 0.03 : 0), tz + 0.05 + Math.sin(a) * rr * 1.4)); }
      const curve = new THREE.CatmullRomCurve3(pts), tg = new THREE.TubeGeometry(curve, 160, 1, 10, false), pa = tg.attributes.position, uv = tg.attributes.uv;
      const fr = curve.computeFrenetFrames(160, false);
      for (let i = 0; i <= 160; i++) { const t = i / 160, c = curve.getPointAt(t), rad = 0.019 * (t < 0.05 ? 0.75 + t * 5 : 1) * (t > 0.7 ? Math.max(0.12, 1 - (t - 0.7) / 0.3 * 0.9) : 1) * (t < 0.03 ? 1.15 : 1);
        for (let j = 0; j <= 10; j++) { const k = i * 11 + j, n = fr.normals[i], b = fr.binormals[i], an = j / 10 * 6.283; pa.setXYZ(k, c.x + (Math.cos(an) * n.x + Math.sin(an) * b.x) * rad, c.y + (Math.cos(an) * n.y + Math.sin(an) * b.y) * rad * 0.8, c.z + (Math.cos(an) * n.z + Math.sin(an) * b.z) * rad); uv.setXY(k, t * 1.0, j / 10); } }
      tg.computeVertexNormals(); I.geo(SN, tg, null, {}); tg.dispose();
      const head = pts[0]; I.geo(SN, new THREE.SphereGeometry(0.022, 14, 10), M(head.x, head.y + 0.002, head.z, 0, 0, 0, 1.05, 0.7, 1.5), {}); }
    // spray bottle on the lid (white, green leaf print)
    { const SP = im.art('r4spray', 128, 128, (g, w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#3c8a3a'; const q = kit.rng(2); for (let i = 0; i < 14; i++) { const x = q() * w, y = q() * h; g.beginPath(); for (let k = 0; k < 4; k++) { const a = k * 1.57; g.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 2.5, a, 0, 6.3); } g.fill(); } }, { rough: 0.4 });
      lathe(I, SP, [[0.001, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.17], [0.03, 0.22], [0.018, 0.24], [0.001, 0.24]], M(tx + 0.1, yt + 0.01, tz + 0.32), { seg: 18 });
      box(PLAST, 0.025, 0.06, 0.07, tx + 0.1, yt + 0.28, tz + 0.3, { color: 0x3c8a3a, bevel: 0.006 }); box(PLAST, 0.02, 0.05, 0.015, tx + 0.1, yt + 0.24, tz + 0.27, { color: 0x3c8a3a }); }
    Fr.col.box(tx, F + 0.6, tz, TW + 0.12, 1.25, TL + 0.12, { tag: 'furniture' });
    Fr.interact({ id: 'terrarium', kind: 'look', label: 'Look at the corn snake', pos: [tx, baseY + 0.3, tz], radius: 1.2, use: (env) => { env?.notify?.('Noodle is coiled up on the bark. She looks fine.'); return true; } });
  }
  // ================= living room (06) =================
  { // rattan sofa against the west wall, facing east: cane frame (smooth tubes), camo-floral cushions
    const sx = x0 + 0.48, szc = -6.6, SL = 2.0, CANE = im.pbr('tatami_mat', { rep: 0.2 }), cane = 0x9a7046;
    const CUSH = im.art('r4cush', 512, 512, (g, w, h) => { g.fillStyle = '#6f7660'; g.fillRect(0, 0, w, h); const q = kit.rng(21);
      for (let i = 0; i < 160; i++) { const c = ['#4f5a44', '#8b8f78', '#3e4536', '#a3a48c', '#5d6b57'][i % 5]; g.fillStyle = c; g.beginPath(); g.ellipse(q() * w, q() * h, 10 + q() * 40, 6 + q() * 26, q() * 3, 0, 6.3); g.fill(); }
      for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(200,200,180,0.35)'; g.lineWidth = 2; const x = q() * w, y = q() * h; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.256; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); } g.stroke(); } }, { rough: 0.95 });
    CUSH.userData.uvScale = 0.6;
    for (const dz of [-SL / 2, SL / 2]) { I.tube(CANE, [[sx + 0.4, F, szc + dz], [sx + 0.42, F + 0.55, szc + dz], [sx + 0.1, F + 0.62, szc + dz], [sx - 0.3, F + 0.6, szc + dz], [sx - 0.34, F + 0.9, szc + dz]], 0.028, { seg: 10, color: cane, steps: 30 });
      I.tube(CANE, [[sx - 0.35, F, szc + dz], [sx - 0.36, F + 0.85, szc + dz]], 0.025, { seg: 10, color: cane, steps: 8 }); }
    for (const [ya, xa] of [[F + 0.32, 0.41], [F + 0.12, 0.41]]) I.tube(CANE, [[sx + xa, ya, szc - SL / 2], [sx + xa, ya, szc + SL / 2]], 0.02, { seg: 8, color: cane, steps: 6 });
    I.tube(CANE, [[sx - 0.35, F + 0.86, szc - SL / 2], [sx - 0.35, F + 0.86, szc + SL / 2]], 0.022, { seg: 8, color: cane, steps: 6 });
    box(CANE, 0.75, 0.04, SL - 0.06, sx + 0.03, F + 0.34, szc, { color: cane, bevel: 0.01 });
    for (const dz of [-SL / 4, SL / 4]) { box(CUSH, 0.7, 0.13, SL / 2 - 0.03, sx + 0.05, F + 0.43, szc + dz, { color: 0xffffff, bevel: 0.045 }); box(CUSH, 0.16, 0.5, SL / 2 - 0.05, sx - 0.24, F + 0.72, szc + dz, { color: 0xf0f0f0, bevel: 0.05 }, 0, 0, 0.12); }
    box(im.fabric('cotton_jersey', { rep: 0.2 }), 0.12, 0.38, 0.42, sx - 0.12, F + 0.68, szc + SL / 2 - 0.35, { color: 0xb8ad8e, bevel: 0.05 }, 0, 0.2, 0.25);
    Fr.col.box(sx, F + 0.42, szc, 0.85, 0.84, SL, { tag: 'furniture' });
    ctx.anchors.sofa = { pos: Fr.v(sx + 0.1, F, szc), heading: PI / 2 - 0.72 };
    // weathered low coffee table with a lower slat shelf, an ashtray
    const tx = sx + 1.35, tzc = szc + 0.1, TB = im.pbr('wood_table_worn', { rep: 0.8 });
    box(TB, 0.6, 0.05, 1.05, tx, F + 0.42, tzc, { grain: 2, color: 0xcfc4ae, wear: 0.6, bevel: 0.01 });
    for (const [dx, dz] of [[-0.27, -0.48], [0.27, -0.48], [-0.27, 0.48], [0.27, 0.48]]) box(TB, 0.05, 0.4, 0.05, tx + dx, F + 0.2, tzc + dz, { grain: 1, color: 0xbdb29a, wear: 0.6 });
    for (let k = 0; k < 4; k++) box(TB, 0.11, 0.02, 0.98, tx - 0.2 + k * 0.135, F + 0.12, tzc, { grain: 2, color: 0xb4a88e, wear: 0.6 });
    lathe(I, im.glass({ tint: 1 }), [[0.001, 0], [0.06, 0], [0.065, 0.025], [0.05, 0.03], [0.001, 0.02]], M(tx + 0.05, F + 0.445, tzc + 0.12), { seg: 20 });
    lathe(I, GLOSS, [[0.001, 0], [0.07, 0], [0.072, 0.02], [0.06, 0.02], [0.001, 0.015]], M(tx + 0.05, F + 0.445, tzc + 0.12), { color: 0x2c8c7e, seg: 20 });
    Fr.col.box(tx, F + 0.22, tzc, 0.6, 0.45, 1.05, { tag: 'furniture' });
    // flat TV on a black box stand, facing the sofa (06)
    const vx = tx + 1.35, vz = tzc + 0.15;
    box(im.matte(), 0.45, 0.42, 1.1, vx, F + 0.22, vz, { color: 0x1a1a1a, bevel: 0.012 });
    const tvM = im.emissive(0x0b0d10, 0, 'r4tv'); tvM.color.set(0x050506); tvM.roughness = 0.25;
    box(GLOSS, 0.05, 0.72, 1.24, vx + 0.02, F + 0.86, vz, { color: 0x111111, bevel: 0.01 }); I.box(tvM, 0.004, 0.68, 1.19, M(vx - 0.007, F + 0.86, vz), {});
    box(GLOSS, 0.2, 0.02, 0.32, vx + 0.02, F + 0.45, vz, { color: 0x151515 }); box(GLOSS, 0.03, 0.08, 0.06, vx + 0.02, F + 0.49, vz, { color: 0x151515 });
    Fr.col.box(vx, F + 0.5, vz, 0.45, 1.0, 1.24, { tag: 'furniture' });
    const tv = { on: false }; Fr.interact({ id: 'tv', kind: 'tv', label: () => (tv.on ? 'Turn off TV' : 'Watch TV'), pos: [vx - 0.3, F + 1.0, vz], radius: 1.8, use: (env) => { tv.on = !tv.on; tvM.emissive.set(0x5a7088); tvM.emissiveIntensity = tv.on ? 0.9 : 0; env?.emit?.('tv:toggle', { on: tv.on }); return tv.on; } });
    // clutter in the corner (06): fishing rod leaning, cardboard boxes, a framed picture leaning on the wall
    const CB = im.matte(); box(CB, 0.45, 0.32, 0.4, x0 + 0.3, F + 0.16, -4.5, { color: 0xa07f56, bevel: 0.01 }); box(CB, 0.4, 0.26, 0.35, x0 + 0.32, F + 0.45, -4.55, { color: 0xb18d61, bevel: 0.01 }, 0, 0.2);
    I.rod(im.plasticGloss(), [x0 + 0.12, F + 0.02, -4.0], [x0 + 0.05, F + 2.2, -4.15], 0.008, { color: 0x1f1f1f }); I.cyl(CHROME, 0.03, 0.03, 0.05, M(x0 + 0.11, F + 0.5, -4.02, 0, 0, PI / 2), { color: 0x9c9c98, seg: 12 });
    box(im.wood({ dark: true }), 0.04, 0.6, 0.8, x0 + 0.06, F + 0.32, -8.9, { color: 0x3a2a1c }, 0, 0, -0.1);
  }
  // ================= back room under renovation (07): stud walls, drywall, tape, fan, curtains, mattress =================
  { const BR = P.back, STUD = im.wood(), studC = 0xd2b98e, xw = BR.x0;
    // the stud wall along x = 4.1 (bare 2x4s at 16 in., plates, a header over the opening), drywall sheets half hung
    const open = [-8.2, -7.1];
    box(STUD, 0.09, 0.04, z1 - z0, xw, F + 0.04, (z0 + z1) / 2 - 0.0, { grain: 2, color: studC, wear: 0.15 }); box(STUD, 0.09, 0.08, z1 - z0, xw, F + 2.5, (z0 + z1) / 2, { grain: 2, color: studC, wear: 0.15 });
    for (let z = z0 + 0.04; z < z1 - 0.02; z += 0.406) { if (z > open[0] && z < open[1]) continue; box(STUD, 0.09, 2.42, 0.04, xw, F + 1.27, z, { grain: 1, color: kit.vary(studC, r, 0.06), wear: 0.15 }); }
    box(STUD, 0.09, 0.2, open[1] - open[0] + 0.1, xw, F + 2.1, (open[0] + open[1]) / 2, { grain: 2, color: studC, wear: 0.15 });
    const DW = im.paint({ peel: 'a', fade: 0, gloss: 0.9, scale: 0.4 });
    box(DW, 0.013, 2.4, 1.22, xw - 0.052, F + 1.24, z1 - 0.62, { color: 0xe6e3dc, wear: 0 }); box(DW, 0.013, 1.2, 1.22, xw - 0.052, F + 1.84, z0 + 0.66, { color: 0xe6e3dc, wear: 0 });
    for (const z of [z1 - 2.0, z1 - 2.05]) box(DW, 0.013, 2.4, 1.2, xw + 0.35 + (z - z1 + 2) * 2, F + 1.21, z, { color: 0xe9e6df, wear: 0 }, 0, 0, -0.12);
    Fr.col.box(xw, F + 1.3, (z0 + open[0]) / 2, 0.12, 2.6, open[0] - z0, { tag: 'wall' }); Fr.col.box(xw, F + 1.3, (open[1] + z1) / 2, 0.12, 2.6, z1 - open[1], { tag: 'wall' });
    // blue painter's tape on the floor along the stud line and around the opening (07)
    for (const [sx, sz, x, z] of [[0.05, z1 - z0 - 0.2, xw - 0.18, (z0 + z1) / 2], [0.9, 0.05, xw - 0.6, open[0] - 0.05], [0.9, 0.05, xw - 0.6, open[1] + 0.05]]) box(im.matte(), sx, 0.002, sz, x, F + 0.021, z, { color: 0x2f52b8, bevel: 0 });
    // standing fan (pedestal, cage, blades)
    { const fx = x1 - 0.45, fz = z0 + 0.7, BL = im.metalPaint(); lathe(I, BL, [[0.001, 0], [0.18, 0], [0.18, 0.03], [0.03, 0.05], [0.001, 0.05]], M(fx, F, fz), { color: 0x1c1c1c, seg: 24 });
      I.cyl(BL, 0.015, 0.015, 1.15, M(fx, F + 0.6, fz), { color: 0x1c1c1c, seg: 10 }); const hy = F + 1.25;
      for (let k = 0; k < 16; k++) { const a = k / 16 * PI; I.geo(BL, new THREE.TorusGeometry(0.22, 0.003, 4, 32, PI), M(fx - 0.06, hy, fz, 0, PI / 2 + 0.6, a), { color: 0x222222 }); }
      I.geo(BL, new THREE.TorusGeometry(0.22, 0.006, 6, 40), M(fx - 0.06, hy, fz, 0, PI / 2 + 0.6, 0), { color: 0x222222 }); box(BL, 0.12, 0.12, 0.14, fx + 0.02, hy, fz, { color: 0x1c1c1c, bevel: 0.03 }); }
    // Nico's mattress on a low pallet platform, sheets and a pillow (sleep), crate nightstand with the journal (save)
    { const bx = x1 - 1.0, bz = z1 - 1.25, PAL = im.wood(); for (let k = 0; k < 7; k++) box(PAL, 1.5, 0.02, 0.1, bx, F + 0.14, bz - 0.95 + k * 0.31, { grain: 0, color: 0xb59b74, wear: 0.4 });
      for (const dz of [-0.95, 0, 0.95]) box(PAL, 1.5, 0.1, 0.09, bx, F + 0.07, bz + dz, { grain: 0, color: 0xa88e68, wear: 0.4 });
      box(im.fabric('waffle_pique_cotton', { rep: 0.3 }), 1.4, 0.2, 1.95, bx, F + 0.26, bz, { color: 0xe7e2d6, bevel: 0.06 }); box(im.fabric('cotton_jersey', { rep: 0.3 }), 1.42, 0.06, 1.2, bx, F + 0.37, bz + 0.35, { color: 0x6c7f8c, bevel: 0.03 }, 0.02);
      box(im.fabric('cotton_jersey', { rep: 0.2 }), 0.6, 0.12, 0.38, bx + 0.25, F + 0.42, bz - 0.7, { color: 0xf0ede4, bevel: 0.05 });
      Fr.col.box(bx, F + 0.2, bz, 1.5, 0.4, 2.0, { tag: 'furniture' });
      Fr.interact({ id: 'bed', kind: 'sleep', label: 'Sleep (8 hours)', radius: 1.6, pos: [bx, F + 0.6, bz], use: (env) => { env?.emit?.('sleep', { hours: 8, anchor: 'bed', source: 'nico_house' }); return true; } });
      Fr.anchor('bed', bx, F, bz - 1.3, PI); Fr.anchor('spawn', bx - 1.2, F, bz - 1.5, PI / 2);
      const cx = bx - 0.95, cz = bz - 0.85; box(im.wood(), 0.45, 0.4, 0.35, cx, F + 0.22, cz, { grain: 0, color: 0xa58b62, wear: 0.5 }); box(im.fabric('fabric_leather_01', { rep: 0.2 }), 0.15, 0.025, 0.21, cx, F + 0.435, cz, { color: 0x6b4a2e, bevel: 0.006 }, 0, 0.3);
      Fr.interact({ id: 'save', kind: 'save', label: 'Write in journal (save game)', radius: 1.3, pos: [cx, F + 0.5, cz], use: (env) => { env?.emit?.('save:request', { source: 'nico_house' }); env?.notify?.('Game saved'); return true; } }); }
    // clothes rack (pipe frame, hanging shirts): the wardrobe
    { const rx = xw + 0.6, rz = z0 + 0.35, PIPE = im.steel(); for (const s of [-0.55, 0.55]) I.tube(PIPE, [[rx + s, F, rz], [rx + s, F + 1.6, rz]], 0.014, { seg: 8, color: 0x9c9a94, steps: 4 }); I.tube(PIPE, [[rx - 0.55, F + 1.6, rz], [rx + 0.55, F + 1.6, rz]], 0.014, { seg: 8, color: 0x9c9a94, steps: 4 });
      for (let k = 0; k < 7; k++) box(im.fabric('cotton_jersey', { rep: 0.2 }), 0.06, 0.75, 0.48, rx - 0.45 + k * 0.15, F + 1.18, rz, { color: [0xe8e3d4, 0x6b7f5a, 0x30485e, 0xb4523a, 0xd9c9a3, 0x4a4a4a, 0x7a9cb0][k], bevel: 0.02 }, 0, PI / 2);
      const ward = { open: false }; Fr.interact({ id: 'wardrobe', kind: 'wardrobe', radius: 1.5, pos: [rx, F + 1.1, rz + 0.2], label: () => 'Change clothes', use: (env) => { ward.open = !ward.open; if (ward.open) env?.emit?.('wardrobe:open', { source: 'nico_house' }); return ward.open; } });
      Fr.anchor('wardrobe', rx, F, rz + 0.9, PI); Fr.col.box(rx, F + 0.8, rz, 1.2, 1.6, 0.5, { tag: 'furniture' }); }
    // tropical-print curtains on the back room windows (07)
    const CUR = im.art('r4tropic', 512, 512, (g, w, h) => { g.fillStyle = '#e9efe2'; g.fillRect(0, 0, w, h); const q = kit.rng(31); for (let i = 0; i < 70; i++) { const x = q() * w, y = q() * h, a = q() * 6.28, l = 40 + q() * 60; g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = ['#2f6b3a', '#4f8f4a', '#1f4f2e', '#6aa35a'][i % 4]; g.beginPath(); g.ellipse(0, 0, l, l * 0.35, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(230,240,220,0.6)'; g.lineWidth = 2; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(k * l / 4, -l * 0.3); g.stroke(); } g.restore(); } }, { rough: 0.9 });
    CUR.userData.uvScale = 1.2;
    for (const o of (ctx.r4openings || []).filter((q) => /W_back/.test(q.id))) { const W = o.wall; for (const s of [-1, 1]) { const n = 6; for (let k = 0; k < n; k++) { const du = s * (o.w / 2 + 0.05 - k * 0.07), [cx, cz] = W.pt(o.u + du, -T - 0.1 - (k % 2) * 0.03); box(CUR, 0.075, o.h + 0.4, 0.02, cx, (o.y0 + o.y1) / 2 + 0.05, cz, { color: 0xffffff, bevel: 0.006, uv: [k * 0.07, 0] }, 0, W.ry); } } }
    // the user's yellow step ladder in the room (07 renovation)
    const lib = loadKeysModels(THREE, ['step_ladder', 'stove_white', 'bath_set']);
    ctx.async.push(lib.ready.then(() => { const L = lib.instancer('r4int');
      L.add('step_ladder', 'dock', M(xw + 0.8, F + 0.02, -6.0, 0, 0.6, 0)); Fr.col.box(xw + 0.8, F + 0.7, -6.0, 0.7, 1.4, 0.8, { tag: 'furniture' });
      // the white gas range sits under the hood (front faces +z = into the kitchen)
      const sp = lib.piece('stove_white', 'dock'); if (sp) { const ext = new THREE.Vector3(); sp.box.getSize(ext); L.add('stove_white', 'dock', M(stoveX, F + 0.02, z0 + 0.33, 0, ext.x > ext.z ? 0 : PI / 2, 0)); }
      for (const n of lib.names('bath_set')) if (/klozet/.test(n)) L.add('bath_set', n, M(BA.x1 - 0.45, F + 0.02, BA.z0 + 0.45, 0, PI, 0));
      const out = L.build(Fr.groups.int, { cast: false }); for (const m of out) m.raycast = () => {};
    }));
  }
  // interior sun shafts: soft dusty light cones from the back windows (cheap additive cards are avoided: a faint volumetric
  // box per window with view-angle fade would be a card; here only the warm fill lights near the windows)
  for (const o of (ctx.r4openings || []).filter((q) => q.kind === 'window' && !q.frosted)) { const [x, z] = o.wall.pt(o.u, -T - 0.8); Fr.light({ id: 'r4_win_' + o.id, pos: [x, (o.y0 + o.y1) / 2, z], color: 0xffe2b8, intensity: 6, range: 3.2, on: true }); }
  Fr.build();
}
