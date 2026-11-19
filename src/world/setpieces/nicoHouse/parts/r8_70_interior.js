// Nico's house r8: the interior (SPEC r8; references r4/15 living room looking north, r4/16 kitchen looking south, r4/05, 07, 09). House
// frame H (r4/plan4.js): the FRONT DOOR in the middle of the SW gable opens into a short hall (plants, the beach painting); the bathroom
// (bead-curtain doorway, orchids) on the LEFT, the bedroom (wood-and-glass sliding doors) on the RIGHT; straight on, the open room: the
// kitchen along the SE wall (green cabinets, speckled laminate, the user's sink under the window, the old top-freezer fridge at 1.7 m,
// the user's microwave, toaster, kettle, coffee maker, pots, pans and utensils, a peninsula with stools under the big cone pendant, the
// terrarium with the corn snake at its end) and the living room at the back: the rattan sofa on the NW wall under the bamboo blind,
// the wicker armchair and the side table with the brass lamp at its left, the user's TV on the user's TV table facing it, the slider
// to the back deck, the console under the back window, the ceiling fan. Warm honey plank floor, olive board walls, a white board
// ceiling with dark beams (colliders, so the camera stops at them). Every doorway is open and walkable.
import { R8, P4 } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { loadKeysModels } from '../models.js';
import { glb } from '../r4/glb.js';
export const order = 70;

export function build(ctx) {
  if (!R8) return;
  const { THREE, kit } = ctx, im = kit.imat, Fr = frame(ctx, 'house'), I = Fr.int, M = kit.M, P = P4, r = kit.rng(870), F = P.F, T = P.wallT, yT = F + P.wallH, PI = Math.PI;
  const { hexa, subtract, lathe } = makeGeo(THREE, kit);
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0) => I.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.004, rand: r, ...o });
  const OLIVE = im.pbr('white_planks_clean', { rep: 1.2 }), WHITEP = im.paint({ peel: 'a', fade: 0.08, gloss: 0.6, scale: 0.6 });
  const FLOOR = im.pbr('white_planks_clean', { rep: 1.6, rough: 0.55 }), PLAST = im.plastic(), GLOSS = im.plasticGloss(), STEEL = im.steel(), CHROME = im.chrome();
  kit.uIndirect.value = Math.max(kit.uIndirect.value, 1.0);
  const Bd = P.body, x0 = Bd.x0 + T, x1 = Bd.x1 - T, z0 = Bd.z0 + T, z1 = Bd.z1 - T;
  const roofTop = (z) => P.yRidge - Math.abs(z - P.ridgeZ) * P.pitch, ceilY = (z) => roofTop(z) - 0.2;
  const HA = P.hall, BA = P.bath, BE = P.bed, KT = P.kitchen, xP = HA.x1;   // xP: the NE walls of the bath and the bedroom (the hall's mouth)
  const KTF = { x0: xP + 0.06, x1: 1.65, z0: -5.4, z1 };   // the kitchen's tiled floor
  const GLB = (f, o = {}) => glb(kit, f, { interior: true, cast: false, ...o });
  // fit a loaded model to a size: o.h (height) or o.w (largest horizontal), keeps its base at y = 0
  const fit = (g, o) => { const b = new THREE.Box3().setFromObject(g), s = new THREE.Vector3(); b.getSize(s); const k = o.h ? o.h / s.y : o.w / Math.max(s.x, s.z); g.scale.multiplyScalar(k); return k; };

  // ================= floors: honey planks, gray square tile in the kitchen (09), white tile in the bath =================
  const tileMat = im.art('r8tile', 512, 512, (g, w, h) => { g.fillStyle = '#7d817c'; g.fillRect(0, 0, w, h); const q = kit.rng(3), n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 150 + q() * 30 | 0; g.fillStyle = `rgb(${v - 6},${v},${v - 4})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(80,80,70,${q() * 0.15})`; g.fillRect(i * s + q() * s, j * s + q() * s, 2, 2); } } }, { rough: 0.45 });
  tileMat.userData.uvScale = 2.4;
  const holes = (zm) => [KTF, BA].filter((R) => zm > R.z0 && zm < R.z1).map((R) => [R.x0 - (R === BA ? 1 : 0), R.x1 + (R === BA ? 0.03 : 0)]);
  for (let z = z0; z < z1 - 0.01; z += 0.142) { const zm = z + 0.071; let x = x0;
    while (x < x1 - 0.01) { const xe = Math.min(x1, x + 1.2 + r() * 2.2);
      for (const [a, b] of subtract(x, xe, holes(zm))) box(FLOOR, b - a - 0.003, 0.02, 0.138, (a + b) / 2, F + 0.01, zm, { grain: 0, color: kit.vary(0xe8b571, r, 0.08), wear: 0.25, bevel: 0.002, uv: [r() * 7, r() * 7] });
      x = xe; } }
  box(tileMat, KTF.x1 - KTF.x0, 0.02, KTF.z1 - KTF.z0, (KTF.x0 + KTF.x1) / 2, F + 0.011, (KTF.z0 + KTF.z1) / 2, { color: 0xffffff, bevel: 0.002, uvS: 2.4 });
  box(im.pbr('long_white_tiles', { rep: 0.9 }), xP - x0 - 0.06, 0.02, BA.z1 - z0 - 0.06, (x0 + xP) / 2, F + 0.011, (z0 + BA.z1) / 2, { color: 0xc8ccc8, bevel: 0.002 });
  box(im.wood(), 0.06, 0.012, 1.5, KTF.x0 - 0.02, F + 0.016, (HA.z0 + HA.z1) / 2, { color: 0x8a6a48 });   // threshold strip at the hall's mouth

  // ================= wall lining: olive vertical boards (gray-white in the kitchen), cut at the openings; bamboo roll-up blinds =================
  let bambooM = null; const BAMBOO = () => (bambooM ||= (() => { const m = im.art('r8bamboo', 256, 512, (g, w, h) => { const q = kit.rng(17); for (let y = 0; y < h; y += 8) { const v = 150 + q() * 50 | 0; g.fillStyle = `rgb(${v + 30},${v},${v - 60})`; g.fillRect(0, y, w, 7); g.fillStyle = 'rgba(60,40,10,0.45)'; g.fillRect(0, y + 7, w, 1); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(90,60,20,0.35)'; g.fillRect(q() * w, y, 3, 7); } }
    for (const xx of [w * 0.25, w * 0.75]) { g.fillStyle = 'rgba(70,45,15,0.8)'; g.fillRect(xx - 2, 0, 4, h); } }, { rough: 0.85 }); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.userData.uvScale = 1; return m; })());
  const kitchenWall = (x, z) => x > xP && x < 1.7 && z > -4.2;
  for (const W of ctx.r4walls || []) {
    const ops = (ctx.r4openings || []).filter((o) => o.wall === W && o.kind !== 'vent' && o.kind !== 'hatch'), L = W.L;
    const top = (u) => (W.gable ? ceilY(W.pt(u, 0)[1]) + 0.05 : yT + 0.12);
    const nB = Math.ceil((L - 2 * T) / 0.15);
    for (let i = 0; i < nB; i++) { const u0 = T + i * (L - 2 * T) / nB, u1 = T + (i + 1) * (L - 2 * T) / nB, [bxw, bzw] = W.pt((u0 + u1) / 2, -T), tone = kitchenWall(bxw, bzw) ? kit.vary(0xcfccc2, r, 0.03) : kit.vary(0xa29b6a, r, 0.07);
      for (const [s0, s1] of subtract(u0, u1, ops.map((o) => [o.u0 - 0.03, o.u1 + 0.03]), 0.004)) { const y0 = F + 0.02, t0 = top(s0), t1 = top(s1), a0 = W.pt(s0 + 0.001, -T), a1 = W.pt(s1 - 0.001, -T), b0 = W.pt(s1 - 0.001, -T + 0.018), b1 = W.pt(s0 + 0.001, -T + 0.018);
        hexa(I, OLIVE, [[a0[0], y0, a0[1]], [a1[0], y0, a1[1]], [b0[0], y0, b0[1]], [b1[0], y0, b1[1]], [a0[0], t0, a0[1]], [a1[0], t1, a1[1]], [b0[0], t1, b0[1]], [b1[0], t0, b1[1]]], { color: tone, wear: 0.15 }); }
      const um = (u0 + u1) / 2;
      for (const o of ops.filter((q) => q.u0 - 0.03 < um && q.u1 + 0.03 > um)) for (const [y0, y1] of subtract(F + 0.02, top(um), [[o.y0 - 0.03, o.y1 + 0.03]])) { const a0 = W.pt(u0 + 0.001, -T), b1 = W.pt(u1 - 0.001, -T + 0.018), cx = (a0[0] + b1[0]) / 2, cz = (a0[1] + b1[1]) / 2, yt = Math.min(y1, top(um) - 0.02); box(OLIVE, u1 - u0 - 0.002, yt - y0, 0.018, cx, (y0 + yt) / 2, cz, { grain: 1, color: tone, wear: 0.15 }, 0, W.ry); } }
    for (const [u0, u1] of subtract(T, L - T, ops.filter((o) => o.sill < 0.1).map((o) => [o.u0 - 0.05, o.u1 + 0.05]))) { const [x, z] = W.pt((u0 + u1) / 2, -T - 0.012); box(WHITEP, u1 - u0, 0.1, 0.018, x, F + 0.07, z, { color: 0x6b6440, wear: 0.3 }, 0, W.ry); }
    for (const o of ops.filter((q) => q.kind === 'window')) { const [x, z] = W.pt(o.u, -T - 0.046); box(WHITEP, o.w + 0.14, 0.03, 0.08, x, o.y0 - 0.011, z, { color: 0xd8d2c0, wear: 0.4 }, 0, W.ry);
      if (o.frosted || /bed/.test(o.id)) continue; const down = o.h * (0.42 + r() * 0.25), [bx, bz] = W.pt(o.u, -T - 0.05);
      box(BAMBOO(), o.w + 0.1, down, 0.008, bx, o.y1 + 0.02 - down / 2, bz, { color: 0xffffff, bevel: 0.002, uvS: 1 }, 0, W.ry);
      I.cyl(im.pbr('tatami_mat', { rep: 0.3 }), 0.035, 0.035, o.w + 0.1, M(bx, o.y1 + 0.06, bz, 0, W.ry, PI / 2), { color: 0xb08850, seg: 14 }); }
  }
  // ================= vaulted board ceiling and exposed beams (with colliders: the camera's sphere cast stops at them) =================
  { const CB = im.paint({ peel: 'a', fade: 0.05, gloss: 0.8, scale: 0.5 }), a = Math.atan(P.pitch);
    for (const side of [1, -1]) { const zr = P.ridgeZ, ze = side > 0 ? z1 : z0, run = Math.abs(ze - zr), sl = Math.hypot(run, run * P.pitch), n = Math.ceil((x1 - x0) / 0.15);
      for (let i = 0; i < n; i++) { const xa = x0 + i * (x1 - x0) / n, xb = x0 + (i + 1) * (x1 - x0) / n, zc = (zr + ze) / 2, yc = (ceilY(zr) + ceilY(ze)) / 2 + 0.01;
        box(CB, xb - xa - 0.002, 0.016, sl + 0.02, (xa + xb) / 2, yc, zc, { grain: 2, color: kit.vary(0xd3ccb8, r, 0.05), wear: 0.1, bevel: 0.002 }, side * a); } }
    const BEAM = im.wood({ dark: true });
    for (let x = x0 + 0.9; x < x1 - 0.5; x += 1.6) { if (x < xP + 0.2) continue; box(BEAM, 0.11, 0.22, z1 - z0 - 0.01, x, yT + 0.15, (z0 + z1) / 2, { grain: 2, color: 0x4a3a2a, wear: 0.3, bevel: 0.008 }); Fr.col.box(x, yT + 0.15, (z0 + z1) / 2, 0.2, 0.3, z1 - z0, { tag: 'beam' }); }
    box(BEAM, x1 - x0, 0.26, 0.14, (x0 + x1) / 2, ceilY(P.ridgeZ) - 0.12, P.ridgeZ, { grain: 0, color: 0x46372a, wear: 0.3, bevel: 0.008 }); Fr.col.box((x0 + x1) / 2, ceilY(P.ridgeZ) - 0.12, P.ridgeZ, x1 - x0, 0.3, 0.22, { tag: 'beam' });
    for (const z of [z0 + 0.06, z1 - 0.06]) box(BEAM, x1 - x0, 0.14, 0.1, (x0 + x1) / 2, yT + 0.08, z, { grain: 0, color: 0x46372a, wear: 0.3 });
    // flat ceiling over the hall, bath and bedroom (they have their own low ceilings at the plate height)
    box(CB, xP - x0, 0.03, z1 - z0, (x0 + xP) / 2, yT + 0.03, (z0 + z1) / 2, { color: 0xd3ccb8, wear: 0.1 }); }
  // ================= partitions (board walls 0.11 thick) with real doorways =================
  const hH = P.wallH + 0.02;
  const part = (ax, az, bx, bz, doors = [], o = {}) => { const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ry = Math.atan2(-uz, ux);
    for (const [u0, u1] of subtract(0, L, doors.map((d) => [d.u - d.w / 2, d.u + d.w / 2]))) { const um = (u0 + u1) / 2; box(OLIVE, u1 - u0, hH, 0.11, ax + ux * um, F + 0.02 + hH / 2, az + uz * um, { grain: 1, color: o.color || 0x6a5f3e, wear: 0.12 }, 0, ry); Fr.col.box(ax + ux * um, F + hH / 2, az + uz * um, u1 - u0, hH, 0.14, { ry, tag: 'wall' }); }
    for (const d of doors) { box(OLIVE, d.w, hH - 2.1, 0.11, ax + ux * d.u, F + 2.1 + (hH - 2.1) / 2, az + uz * d.u, { color: o.color || 0x6a5f3e, wear: 0.12 }, 0, ry);
      for (const s of [-1, 1]) box(im.wood(), 0.07, 2.12, 0.15, ax + ux * (d.u + s * (d.w / 2 + 0.035)), F + 1.06, az + uz * (d.u + s * (d.w / 2 + 0.035)), { grain: 1, color: d.frame || 0xc9c2ac, wear: 0.4 }, 0, ry);
      box(im.wood(), d.w + 0.14, 0.07, 0.15, ax + ux * d.u, F + 2.135, az + uz * d.u, { grain: 0, color: d.frame || 0xc9c2ac, wear: 0.4 }, 0, ry); }
    return { ux, uz, ry, L }; };
  const bathDoor = { u: 4.75 - 0.0 - (x0 - x0), w: 0.8 }, bedDoor = { u: 2.55, w: 1.1, frame: 0x7a5636 };
  part(x0, HA.z0, xP, HA.z0, [{ ...bathDoor, u: -4.6 - x0 }]);                                   // hall | bath (the bead-curtain doorway)
  part(x0, HA.z1, xP, HA.z1, [{ ...bedDoor, u: -4.05 - x0 }]);                                   // hall | bedroom (wood-framed sliders)
  part(xP, z0, xP, HA.z0 - 0.055, []);                                                           // bath | living room
  part(xP, HA.z1 + 0.055, xP, z1, [], { color: 0xcfccc2 });                                      // bedroom | kitchen (the fridge stands against it)
  // the bead curtain in the bath doorway (16), orchids beside it
  { const BEAD = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 }); BEAD.name = 'r8beads';
    const bg = new THREE.SphereGeometry(0.009, 6, 4), xs = [], cols = [0x8a5a2c, 0xc79a52, 0x3f6e6a, 0xb5432e, 0xe8dcc0], dx = -4.6;
    for (let x = dx - 0.38; x <= dx + 0.38; x += 0.045) for (let y = F + 2.06; y > F + 0.12; y -= 0.042) xs.push([x + Math.sin(y * 9 + x * 40) * 0.004, y, HA.z0 + Math.sin(x * 30) * 0.01]);
    const bm = new THREE.InstancedMesh(bg, BEAD, xs.length), col = new THREE.Color(); xs.forEach((p, k) => { bm.setMatrixAt(k, M(p[0], p[1], p[2])); bm.setColorAt(k, col.set(cols[(k * 7 + (k / 45 | 0)) % cols.length])); });
    bm.name = 'r8_bead_curtain'; bm.raycast = () => {}; Fr.groups.int.add(bm);
    box(im.wood(), 0.95, 0.04, 0.05, dx, F + 2.08, HA.z0, { grain: 0, color: 0x6a4a2e }); }
  // the bedroom's wood-and-glass sliding doors (16 / 07), one pushed open
  { const FRW = im.wood(), dzz = HA.z1, cx0 = -4.05, dw = bedDoor.w / 2 + 0.05;
    const leaf = (cx, dz) => { for (const ddx of [-dw / 2 + 0.035, dw / 2 - 0.035]) box(FRW, 0.07, 2.06, 0.04, cx + ddx, F + 1.05, dzz + dz, { grain: 1, color: 0x8c6743 });
      for (const yy of [F + 0.06, F + 0.95, F + 2.06]) box(FRW, dw, yy === F + 0.95 ? 0.06 : 0.1, 0.04, cx, yy, dzz + dz, { grain: 0, color: 0x8c6743 });
      for (const [y0, y1] of [[F + 0.11, F + 0.92], [F + 0.98, F + 2.01]]) box(im.glass({ tint: 1 }), dw - 0.12, y1 - y0, 0.006, cx, (y0 + y1) / 2, dzz + dz, { color: 0xffffff, bevel: 0 }); };
    leaf(cx0 - bedDoor.w / 2 - dw / 2 + 0.06, 0.08); leaf(cx0 - bedDoor.w / 2 - dw / 2 + 0.12, -0.08);   // both leaves stacked beside the opening (it stays open)
  }
  // ================= the hall: plants, the beach painting, a doormat =================
  const POT = im.paint({ peel: 'a', fade: 0.1, gloss: 0.6, scale: 0.5 }), LEAF = im.plastic();
  const plant = (x, z, s2, flowers) => { lathe(I, POT, [[0.001, 0], [0.1 * s2, 0], [0.14 * s2, 0.24 * s2], [0.001, 0.22 * s2]], M(x, F, z), { color: 0xb5603a, seg: 16 });
    for (let k = 0; k < 10; k++) { const a2 = k * 2.4, l = (0.35 + (k % 3) * 0.15) * s2; I.strut(LEAF, [x, F + 0.22 * s2, z], [x + Math.cos(a2) * l * 0.5, F + 0.22 * s2 + l, z + Math.sin(a2) * l * 0.5], 0.07 * s2, 0.005, { color: kit.vary(0x3f7a34, r, 0.15) }); }
    if (flowers) for (let k = 0; k < 7; k++) I.geo(im.plastic(), new THREE.SphereGeometry(0.03, 8, 6), M(x + Math.cos(k) * 0.08, F + 0.55 * s2 + k * 0.035, z + Math.sin(k) * 0.08), { color: 0xd97cc0 });
    Fr.col.cyl(x, F + 0.3, z, 0.15 * s2, 0.6, { tag: 'prop' }); };
  plant(-5.25, HA.z0 + 0.2, 0.9, true); plant(-3.1, HA.z0 + 0.22, 1.15, false); plant(-6.1, HA.z1 - 0.2, 0.9, false);
  { const ART = im.art('r8beachart', 256, 192, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc9e0'); gr.addColorStop(0.55, '#2f8fa0'); gr.addColorStop(0.62, '#e8d8b0'); gr.addColorStop(1, '#d8c08a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a5a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(190, 150); g.quadraticCurveTo(200, 80, 220, 40); g.stroke(); }, { rough: 0.8 });
    box(im.wood(), 0.66, 0.5, 0.03, -3.3, F + 1.5, HA.z1 - 0.07, { color: 0x6a4a2e }); box(ART, 0.58, 0.42, 0.006, -3.3, F + 1.5, HA.z1 - 0.087, { color: 0xffffff, bevel: 0 }); }
  box(im.fabric('wool_boucle', { rep: 0.3 }), 0.5, 0.012, 0.8, x0 + 0.4, F + 0.026, -7.0, { color: 0x6a5a44, bevel: 0.004 });

  // ================= kitchen (SE wall), 16 / 05 / 07 / 09 =================
  const GREEN = im.paint({ peel: 'a', fade: 0.15, gloss: 0.55, scale: 0.5 }), green = () => kit.vary(0x5f8a52, r, 0.04);
  const LAM = im.art('r8lam', 512, 512, (g, w, h) => { g.fillStyle = '#d9d4c6'; g.fillRect(0, 0, w, h); const q = kit.rng(8); for (let i = 0; i < 9000; i++) { const c = q(); g.fillStyle = c < 0.5 ? `rgba(90,85,75,${0.3 + q() * 0.4})` : c < 0.8 ? 'rgba(160,150,130,0.5)' : 'rgba(250,250,245,0.7)'; g.fillRect(q() * w, q() * h, 1.5 + q() * 2, 1.5 + q() * 2); } }, { rough: 0.35 });
  LAM.userData.uvScale = 0.6;
  const knob = (x, y, z, ry) => lathe(I, CHROME, [[0.001, 0], [0.013, 0.002], [0.016, 0.014], [0.012, 0.024], [0.001, 0.026]], M(x, y, z, -PI / 2, ry, 0), { color: 0xc6c2b8, seg: 14 });
  const zB = z1, d = 0.6, zF = zB - d;   // the run's back (the SE wall) and front
  const fridge = { x0: xP + 0.06, x1: xP + 0.06 + 0.82 }, stoveX = fridge.x1 + 0.08 + 0.33, sinkX = -0.1, runX1 = 1.55;
  // base cabinets: from the stove to the peninsula corner, the sink bay under the window
  const baseRun = (xa, xb, o = {}) => { const n = Math.max(1, Math.round((xb - xa) / 0.5));
    box(GREEN, xb - xa, 0.84, d - 0.03, (xa + xb) / 2, F + 0.02 + 0.42, zB - d / 2 + 0.015, { color: kit.mul(green(), 0.8), wear: 0.2 });
    box(GREEN, xb - xa - 0.02, 0.1, 0.02, (xa + xb) / 2, F + 0.07, zF + 0.08, { color: 0x2a2a24, wear: 0.1 });
    for (let i = 0; i < n; i++) { const xm = xa + (xb - xa) * (i + 0.5) / n, w = (xb - xa) / n - 0.012;
      if (o.sinkAt != null && Math.abs(xm - o.sinkAt) < 0.5) box(GREEN, w, 0.62, 0.02, xm, F + 0.42, zF - 0.005, { color: green(), wear: 0.25 });
      else { box(GREEN, w, 0.16, 0.02, xm, F + 0.74, zF - 0.005, { color: green(), wear: 0.25 }); knob(xm, F + 0.74, zF - 0.016, 0); box(GREEN, w, 0.5, 0.02, xm, F + 0.38, zF - 0.005, { color: green(), wear: 0.25 }); }
      knob(xm + w * 0.35, F + 0.55, zF - 0.016, 0); }
    Fr.col.box((xa + xb) / 2, F + 0.45, zB - d / 2, xb - xa, 0.9, d, { tag: 'furniture' }); };
  baseRun(stoveX + 0.34, runX1, { sinkAt: sinkX });
  // countertop: speckled laminate with a cut-out for the sink (two slabs and two strips around it)
  { const cy = F + 0.88, sw = 1.05, sd = 0.47, sx0 = sinkX - sw / 2, sx1 = sinkX + sw / 2, zc = zB - d / 2;
    for (const [a, b] of [[stoveX + 0.33, sx0], [sx1, runX1 + 0.03]]) box(LAM, b - a, 0.035, d + 0.03, (a + b) / 2, cy, zc - 0.015, { color: 0xffffff, bevel: 0.006 });
    box(LAM, sw, 0.035, (d + 0.03 - sd) / 2, sinkX, cy, zB - 0.015 - (d + 0.03 - sd) / 4 + 0.015, { color: 0xffffff, bevel: 0.004 }); box(LAM, sw, 0.035, (d + 0.03 - sd) / 2, sinkX, cy, zF - 0.015 + (d + 0.03 - sd) / 4, { color: 0xffffff, bevel: 0.004 });
    box(LAM, runX1 - stoveX, 0.1, 0.012, (stoveX + runX1) / 2, cy + 0.068, zB - 0.006, { color: 0xffffff, bevel: 0.002 });   // backsplash
    // the user's sink (kitchen-appliances download, double basin with drainboard and faucet): cut to the bay, aged (duller steel, scale)
    GLB('kitchen/sink.glb', { parent: Fr.groups.int, pos: [sinkX, cy - 0.185, zc], scale: [0.72, 1.0, 0.78], mat: (m) => { m.roughness = Math.max(0.45, m.roughness ?? 0.5); m.color.multiplyScalar(0.92); } }); }
  // the stove (the user's white range) under the hood, the fridge (the user's, resized to a real 1.7 m top-freezer and aged)
  const lib = loadKeysModels(THREE, ['stove_white', 'bath_set']);
  { const HD = im.metalPaint(); box(HD, 0.76, 0.16, 0.5, stoveX, F + 1.62, zB - 0.25, { color: 0xdedbd2, bevel: 0.01 }); hexa(I, HD, [[stoveX - 0.38, F + 1.7, zB], [stoveX + 0.38, F + 1.7, zB], [stoveX + 0.38, F + 1.7, zB - 0.5], [stoveX - 0.38, F + 1.7, zB - 0.5], [stoveX - 0.15, F + 2.1, zB], [stoveX + 0.15, F + 2.1, zB], [stoveX + 0.15, F + 2.1, zB - 0.22], [stoveX - 0.15, F + 2.1, zB - 0.22]], { color: 0xdedbd2 });
    box(HD, 0.3, yT - F - 2.1, 0.22, stoveX, (F + 2.1 + yT) / 2, zB - 0.11, { color: 0xdedbd2 }); Fr.col.box(stoveX, F + 0.45, zB - 0.33, 0.76, 0.9, 0.66, { tag: 'furniture' }); }
  { const fx = (fridge.x0 + fridge.x1) / 2, fz = zB - 0.38;
    GLB('fridge_old.glb', { pos: [fx, F + 0.02, fz], ry: PI, cast: true, mat: (m) => { const c = m.color, l = (c.r + c.g + c.b) / 3; if (l > 0.6) { c.setRGB(0.88, 0.83, 0.7); m.roughness = 0.55; m.metalness = 0; } } })
      .then((g) => { if (!g) return; fit(g, { h: 1.7 }); const b = new THREE.Box3().setFromObject(g); g.position.x += fx - (b.min.x + b.max.x) / 2; g.position.z += fz - (b.min.z + b.max.z) / 2; g.position.y += F + 0.02 - b.min.y; Fr.groups.int.add(g); });
    Fr.col.box(fx, F + 0.85, fz, 0.82, 1.7, 0.74, { tag: 'furniture' }); }
  // green upper cabinets along the SE wall, left and right of the window and over the fridge
  for (const [xa, xb, yb] of [[stoveX + 0.42, sinkX - 0.72, F + 1.5], [sinkX + 0.72, runX1, F + 1.5], [fridge.x0 + 0.02, fridge.x1 - 0.02, F + 1.86]]) { if (xb - xa < 0.2) continue; const n = Math.max(1, Math.round((xb - xa) / 0.45)), hh = yT - 0.08 - yb;
    box(GREEN, xb - xa, hh, 0.32, (xa + xb) / 2, yb + hh / 2, zB - 0.16, { color: kit.mul(green(), 0.8), wear: 0.2 });
    for (let i = 0; i < n; i++) { const xm = xa + (xb - xa) * (i + 0.5) / n; box(GREEN, (xb - xa) / n - 0.012, hh - 0.04, 0.02, xm, yb + hh / 2, zB - 0.33, { color: green(), wear: 0.25 }); knob(xm + ((i % 2) ? -1 : 1) * ((xb - xa) / n * 0.35), yb + 0.12, zB - 0.344, 0); } }
  // the peninsula from the run's end into the room (07), stools on the living side, the big cone pendant over it
  const penX = 1.3, penZ0 = zF, penZ1 = -6.25;
  { box(GREEN, 0.6, 0.86, penZ0 - penZ1, penX, F + 0.45, (penZ0 + penZ1) / 2, { color: kit.mul(green(), 0.85), wear: 0.25 });
    box(LAM, 0.92, 0.035, penZ0 - penZ1 + 0.05, penX + 0.12, F + 0.9, (penZ0 + penZ1) / 2, { color: 0xffffff, bevel: 0.006 });
    for (let z = penZ1 + 0.3; z < penZ0 - 0.2; z += 0.55) { box(GREEN, 0.02, 0.6, 0.5, penX - 0.31, F + 0.42, z, { color: green(), wear: 0.25 }); knob(penX - 0.325, F + 0.62, z + 0.18, -PI / 2); }
    Fr.col.box(penX, F + 0.45, (penZ0 + penZ1) / 2, 0.6, 0.9, penZ0 - penZ1, { tag: 'furniture' });
    const STO = im.wood({ dark: true }), SEAT = im.pbr('tatami_mat', { rep: 0.2 });
    for (const z of [penZ1 + 0.55, penZ1 + 1.3]) { const sx = penX + 0.75; box(SEAT, 0.36, 0.05, 0.36, sx, F + 0.7, z, { color: 0x9c7a4c, bevel: 0.015 });
      for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) I.strut(STO, [sx + dx * 1.15, F + 0.02, z + dz * 1.15], [sx + dx, F + 0.68, z + dz], 0.035, 0.035, { color: 0x2e241c, bevel: 0.004 });
      for (const s of [-1, 1]) { box(STO, 0.32, 0.025, 0.025, sx, F + 0.25, z + s * 0.16, { color: 0x2e241c }); box(STO, 0.025, 0.025, 0.32, sx + s * 0.16, F + 0.3, z, { color: 0x2e241c }); }
      Fr.col.box(sx, F + 0.35, z, 0.4, 0.7, 0.4, { tag: 'furniture' }); }
    const px = penX + 0.05, pz = (penZ0 + penZ1) / 2, py = F + 1.62, R = 0.48, GALV = im.metalPaint();
    lathe(I, GALV, [[0.04, 0.42], [0.07, 0.38], [R * 0.4, 0.22], [R, 0], [R - 0.012, -0.006], [R * 0.4 - 0.012, 0.214], [0.06, 0.37], [0.035, 0.41]], M(px, py, pz), { color: 0x7d7a70, seg: 36, wear: 0.9 });
    I.cyl(STEEL, 0.005, 0.005, ceilY(pz) - py - 0.42, M(px, (ceilY(pz) + py + 0.42) / 2, pz), { color: 0x2a2a2a, seg: 6 }); I.geo(im.emissive(0xfff0d0, 1.6, 'r8bulb'), new THREE.SphereGeometry(0.06, 12, 8), M(px, py + 0.12, pz), {});
    const kl = Fr.light({ id: 'r4_kitchen', pos: [px, F + 1.7, pz], color: 0xffd9a8, intensity: 28, range: 6, on: false }), ll = Fr.light({ id: 'r4_living', pos: [3.9, F + 1.9, -8.3], color: 0xffd6a0, intensity: 26, range: 7, on: false });
    const sw = { manual: null }; ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12, auto = t < 7 || t > 18.3; kl.on = ll.on = sw.manual ?? auto; });
    Fr.interact({ id: 'switch_kitchen', kind: 'switch', label: () => (kl.on ? 'Lights off' : 'Lights on'), pos: [xP + 0.1, F + 1.3, HA.z1 + 0.4], radius: 1.1, use: () => { sw.manual = !kl.on; } }); }
  // the user's appliances and utensils on the counters (kitchen-appliances / kitchen-utensils / wooden-kitchen downloads), adapted
  { const cy = F + 0.9, DI = Fr.groups.int, aged = (k = 0.9, rough = 0.5) => (m) => { m.color.multiplyScalar(k); m.roughness = Math.max(rough, m.roughness ?? rough); };
    GLB('kitchen/microwave.glb', { parent: DI, pos: [runX1 - 0.32, cy, zB - 0.3], ry: PI, mat: (m) => { m.map = null; m.color.setRGB(0.82, 0.8, 0.74); m.roughness = 0.45; m.metalness = 0.1; m.needsUpdate = true; } });
    // its dark door glass (the download's window was a single plane): a dark glass card on the door
    box(im.glass({ tint: 1 }), 0.28, 0.16, 0.004, runX1 - 0.36, cy + 0.12, zB - 0.3 - 0.255, { color: 0x202224, bevel: 0 });
    GLB('kitchen/toaster.glb', { parent: DI, pos: [sinkX + 0.85, cy, zB - 0.2], ry: PI + 0.1, mat: (m) => { m.color.lerp(new THREE.Color(0xd9d2bf), 0.55); m.roughness = Math.max(0.4, m.roughness ?? 0.4); } });
    GLB('kitchen/kettle.glb', { parent: DI, pos: [stoveX + 0.62, cy, zB - 0.22], ry: PI - 0.4, mat: (m) => { m.color.lerp(new THREE.Color(0xe8e4da), 0.75); m.roughness = 0.35; } });   // white kettle (05 / 07)
    GLB('kitchen/coffeemaker.glb', { parent: DI, pos: [penX + 0.1, F + 0.917, penZ0 - 0.3], ry: -PI / 2, scale: 0.85, mat: aged(0.85, 0.45) });
    GLB('kitchen/pot.glb', { parent: DI, pos: [stoveX - 0.15, F + 0.92, zB - 0.45], ry: 0.4, mat: aged(0.85) });
    GLB('kitchen/pan.glb', { parent: DI, pos: [stoveX + 0.12, F + 0.92, zB - 0.25], ry: 2.6, mat: aged(0.85) });
    GLB('kitchen/board.glb', { parent: DI, pos: [sinkX + 0.95, cy + 0.002, zB - 0.38], ry: 0.15, scale: 0.85 });
    GLB('kitchen/knife.glb', { parent: DI, pos: [sinkX + 0.95, cy + 0.04, zB - 0.38], ry: 0.4 });
    GLB('kitchen/detergent.glb', { parent: DI, pos: [sinkX - 0.62, cy, zB - 0.12], ry: PI + 0.3, scale: 0.9 });
    GLB('kitchen/soap.glb', { parent: DI, pos: [sinkX - 0.5, cy, zB - 0.1], ry: PI - 0.2, scale: 0.9 });
    GLB('kitchen/oil.glb', { parent: DI, pos: [stoveX + 0.5, cy, zB - 0.12], ry: 0.5, scale: 0.8 });
    GLB('kitchen/cup.glb', { parent: DI, pos: [penX + 0.2, F + 0.917, penZ1 + 0.55], ry: 1.2 });
    GLB('kitchen/bowl.glb', { parent: DI, pos: [penX + 0.05, F + 0.917, penZ1 + 1.1], ry: 0.3 });
    GLB('kitchen/hooks.glb', { parent: DI, pos: [stoveX + 0.75, F + 1.42, zB - 0.02], ry: PI, scale: [0.7, 1, 1] });
    GLB('kitchen/ladle.glb', { parent: DI, pos: [stoveX + 0.6, F + 1.2, zB - 0.06], ry: PI, rx: -PI / 2 });
    GLB('kitchen/spatula.glb', { parent: DI, pos: [stoveX + 0.85, F + 1.18, zB - 0.06], ry: PI, rx: -PI / 2 });
    GLB('kitchen/knife_rail.glb', { parent: DI, pos: [sinkX + 0.95, F + 1.32, zB - 0.02], ry: PI });
    GLB('kitchen/towel.glb', { parent: DI, pos: [stoveX - 0.15, F + 0.38, zF - 0.06], ry: PI, scale: 0.55, mat: (m) => { m.color.lerp(new THREE.Color(0xc9b48a), 0.3); } });
    lathe(I, PLAST, [[0.001, 0], [0.04, 0], [0.042, 0.13], [0.02, 0.17], [0.015, 0.2], [0.001, 0.2]], M(sinkX - 0.75, cy, zB - 0.15), { color: 0xf0f0ea, seg: 16 }); }
  ctx.async.push(lib.ready.then(() => { const L = lib.instancer('r8int');
    const sp = lib.piece('stove_white', 'dock'); if (sp) { const ext = new THREE.Vector3(); sp.box.getSize(ext); L.add('stove_white', 'dock', M(stoveX, F + 0.02, zB - 0.33, 0, ext.x > ext.z ? PI : -PI / 2, 0)); }
    for (const n of lib.names('bath_set')) { if (/klozet/.test(n)) L.add('bath_set', n, M(-3.25, F + 0.02, z0 + 0.38, 0, 0, 0)); if (/paspas/.test(n)) L.add('bath_set', n, M(-4.5, F + 0.025, -8.9, 0, PI / 2, 0)); if (/kova/.test(n)) L.add('bath_set', n, M(-2.95, F + 0.02, -7.98, 0, 0, 0)); if (/havluluk/.test(n)) L.add('bath_set', n, M(-5.9, F + 0.02, -7.95, 0, PI, 0)); }
    const out = L.build(Fr.groups.int, { cast: false }); for (const m of out) m.raycast = () => {}; }));
  Fr.col.box(-3.25, F + 0.4, z0 + 0.38, 0.45, 0.8, 0.7, { tag: 'furniture' });
  // bathroom: a small white pedestal sink with a mirror on the NW wall, the shower stall in the west corner
  { const sxB = -3.95, szB = z0 + 0.25; lathe(I, im.ceramic(), [[0.001, 0], [0.11, 0], [0.08, 0.3], [0.07, 0.7], [0.24, 0.78], [0.25, 0.86], [0.001, 0.84]], M(sxB, F, szB + 0.05), { color: 0xeeeeea, seg: 24 });
    I.tube(CHROME, [[sxB, F + 0.86, szB - 0.12], [sxB, F + 1.0, szB - 0.1], [sxB, F + 1.02, szB - 0.02], [sxB, F + 0.96, szB + 0.04]], 0.01, { seg: 8, color: 0xc8c6c0, steps: 12 });
    box(im.glass({ tint: 1 }), 0.5, 0.62, 0.008, sxB, F + 1.55, z0 + 0.012, { color: 0xb8c4c4, bevel: 0 }); box(im.wood(), 0.56, 0.68, 0.02, sxB, F + 1.55, z0 + 0.005, { color: 0x6a4a2e });
    Fr.col.box(sxB, F + 0.45, szB, 0.5, 0.9, 0.45, { tag: 'furniture' });
    const SH = im.pbr('long_white_tiles', { rep: 0.6 }); box(SH, 0.9, 2.1, 0.03, x0 + 0.45, F + 1.05, z0 + 0.015, { color: 0xd8ddd8 }); box(SH, 0.03, 2.1, 0.9, x0 + 0.015, F + 1.05, z0 + 0.45, { color: 0xd8ddd8 });
    box(STEEL, 0.9, 0.06, 0.9, x0 + 0.45, F + 0.05, z0 + 0.45, { color: 0xdddddd }); I.tube(CHROME, [[x0 + 0.05, F + 1.95, z0 + 0.95], [x0 + 0.95, F + 1.95, z0 + 0.95], [x0 + 0.95, F + 1.95, z0 + 0.05]], 0.01, { seg: 6, color: 0xbbbbbb, steps: 10 });
    const SHC = im.fabric('cotton_jersey', { rep: 0.3 }); for (let k = 0; k < 9; k++) box(SHC, 0.11, 1.6, 0.02, x0 + 0.1 + k * 0.1, F + 1.12, z0 + 0.95 + (k % 2) * 0.03, { color: 0x6f9aa8, bevel: 0.005 });
    Fr.light({ id: 'r8_bath', pos: [-4.4, F + 2.1, -9.0], color: 0xfff0e0, intensity: 18, range: 4.5, on: true }); }

  // ================= the terrarium with the corn snake at the peninsula's end (16 / 09) =================
  { const tx = penX + 0.02, tz = penZ1 - 0.6, TW = 0.48, TL = 0.92, TH = 0.46, baseY = F + 0.78, WDK = im.wood({ dark: true }), BLK = im.metalPaint();
    box(WDK, TW + 0.1, 0.16, TL + 0.1, tx, baseY - 0.08, tz, { grain: 2, color: 0x3a2618, wear: 0.4, bevel: 0.012 });
    for (const dz of [-0.2, 0.2]) knob(tx + TW / 2 + 0.05, baseY - 0.08, tz + dz, PI / 2);
    lathe(I, WDK, [[0.001, 0], [0.05, 0], [0.06, 0.05], [0.04, 0.15], [0.055, 0.3], [0.035, 0.45], [0.06, 0.56], [0.08, 0.6], [0.001, 0.6]], M(tx, F + 0.12, tz), { color: 0x2f1f14, seg: 20 });
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4, fx2 = tx + Math.cos(a) * 0.32, fz2 = tz + Math.sin(a) * 0.32; I.tube(WDK, [[tx, F + 0.2, tz], [tx + Math.cos(a) * 0.18, F + 0.12, tz + Math.sin(a) * 0.18], [fx2, F + 0.07, fz2]], 0.022, { seg: 8, color: 0x2f1f14, steps: 12 });
      I.cyl(BLK, 0.025, 0.025, 0.02, M(fx2, F + 0.045, fz2, PI / 2, a, 0), { color: 0x6a5a40, seg: 12 }); }
    const yb = baseY + 0.002, yt = yb + TH;
    for (const [sx, sy, sz, x, y, z] of [[TW, 0.025, 0.025, tx, yb + 0.012, tz - TL / 2], [TW, 0.025, 0.025, tx, yb + 0.012, tz + TL / 2], [0.025, 0.025, TL, tx - TW / 2, yb + 0.012, tz], [0.025, 0.025, TL, tx + TW / 2, yb + 0.012, tz],
      [TW, 0.025, 0.025, tx, yt, tz - TL / 2], [TW, 0.025, 0.025, tx, yt, tz + TL / 2], [0.025, 0.025, TL, tx - TW / 2, yt, tz], [0.025, 0.025, TL, tx + TW / 2, yt, tz], [TW, 0.02, 0.02, tx, yt, tz],
      [0.025, TH, 0.025, tx - TW / 2, (yb + yt) / 2, tz - TL / 2], [0.025, TH, 0.025, tx + TW / 2, (yb + yt) / 2, tz - TL / 2], [0.025, TH, 0.025, tx - TW / 2, (yb + yt) / 2, tz + TL / 2], [0.025, TH, 0.025, tx + TW / 2, (yb + yt) / 2, tz + TL / 2]])
      box(BLK, sx, sy, sz, x, y, z, { color: 0x141414, bevel: 0.003 });
    const GL = im.glass({ dirt: 1 });
    for (const [sx, sz, x, z] of [[TW - 0.02, 0.005, tx, tz - TL / 2], [TW - 0.02, 0.005, tx, tz + TL / 2], [0.005, TL - 0.02, tx - TW / 2, tz], [0.005, TL - 0.02, tx + TW / 2, tz]]) box(GL, sx, TH - 0.03, sz, x, (yb + yt) / 2, z, { bevel: 0 });
    const MESH = im.art('r8mesh', 256, 256, (g, w, h) => { g.fillStyle = '#3d4040'; g.fillRect(0, 0, w, h); g.fillStyle = '#121313'; for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } }, { rough: 0.7 }); MESH.userData.uvScale = 0.25;
    for (const s of [-1, 1]) box(MESH, TW - 0.03, 0.006, TL / 2 - 0.03, tx, yt + 0.006, tz + s * TL / 4, { bevel: 0.001 });
    const BARK = im.art('r8bark', 256, 256, (g, w, h) => { g.fillStyle = '#3a2717'; g.fillRect(0, 0, w, h); const q = kit.rng(5); for (let i = 0; i < 1400; i++) { const v = 40 + q() * 60 | 0; g.fillStyle = `rgb(${v + 25},${v},${v - 15})`; g.fillRect(q() * w, q() * h, 2 + q() * 6, 1 + q() * 3); } }, { rough: 0.95 }); BARK.userData.uvScale = 0.25;
    box(BARK, TW - 0.03, 0.06, TL - 0.03, tx, yb + 0.03, tz, { bevel: 0.004 });
    const sub = yb + 0.06;
    I.tube(im.pbr('bark_brown_02', { rep: 0.3 }), [[tx - 0.15, sub + 0.02, tz - 0.38], [tx - 0.02, sub + 0.1, tz - 0.12], [tx + 0.1, sub + 0.14, tz + 0.15], [tx + 0.16, sub + 0.08, tz + 0.36]], 0.025, { seg: 10, color: 0xbfae94, steps: 24 });
    I.geo(im.concrete(), new THREE.SphereGeometry(0.1, 16, 10), M(tx - 0.08, sub + 0.015, tz - 0.25, 0, 0.5, 0, 1, 0.28, 0.75), { color: 0x9a9a94 });
    box(GLOSS, 0.2, 0.08, 0.15, tx + 0.08, sub + 0.04, tz - 0.3, { color: 0x1fb4b0, bevel: 0.012 }); box(GLOSS, 0.21, 0.012, 0.16, tx + 0.08, sub + 0.085, tz - 0.3, { color: 0x22c2bd, bevel: 0.004 });
    for (let k = 0; k < 22; k++) { const a = r() * 6.28, base = [tx - 0.17 + (k % 2) * 0.3, sub, tz + (k < 11 ? -0.4 : 0.38)], l = 0.12 + r() * 0.1, tip = [base[0] + Math.cos(a) * l * 0.7, sub + l, base[2] + Math.sin(a) * l * 0.5];
      I.tube(im.matte(), [base, [(base[0] + tip[0]) / 2, sub + l * 0.8, (base[2] + tip[2]) / 2], tip], 0.006, { seg: 4, color: 0x3f7a2c, steps: 6 }); }
    { const SN = im.art('r8snake', 1024, 64, (g, w, h) => { g.fillStyle = '#f3ece0'; g.fillRect(0, 0, w, h); const q = kit.rng(12);
        for (let x = 10; x < w; x += 34 + q() * 8) { const sw2 = 18 + q() * 6; g.fillStyle = '#7a2412'; g.fillRect(x - 1.5, 6, sw2 + 3, h - 12); g.fillStyle = '#e8562a'; g.fillRect(x, 8, sw2, h - 16); g.fillStyle = '#f07a3c'; g.fillRect(x + 3, 14, sw2 - 6, h - 28); }
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, h * 0.45, w, 2); }, { rough: 0.38 });
      SN.map.wrapS = THREE.RepeatWrapping;
      const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * 6.283 * 1.45 + 0.4, rr = 0.07 + 0.11 * t; pts.push(new THREE.Vector3(tx + Math.cos(a) * rr * 0.9 + (t > 0.85 ? (t - 0.85) * 0.6 : 0), sub + 0.022 + (t < 0.08 ? (0.08 - t) * 0.6 : 0) + (t > 0.55 && t < 0.7 ? 0.03 : 0), tz + 0.05 + Math.sin(a) * rr * 1.4)); }
      const curve = new THREE.CatmullRomCurve3(pts), tg = new THREE.TubeGeometry(curve, 160, 1, 10, false), pa = tg.attributes.position, uv = tg.attributes.uv, fr = curve.computeFrenetFrames(160, false);
      for (let i = 0; i <= 160; i++) { const t = i / 160, c = curve.getPointAt(t), rad = 0.019 * (t < 0.05 ? 0.75 + t * 5 : 1) * (t > 0.7 ? Math.max(0.12, 1 - (t - 0.7) / 0.3 * 0.9) : 1) * (t < 0.03 ? 1.15 : 1);
        for (let j = 0; j <= 10; j++) { const k = i * 11 + j, n = fr.normals[i], b = fr.binormals[i], an = j / 10 * 6.283; pa.setXYZ(k, c.x + (Math.cos(an) * n.x + Math.sin(an) * b.x) * rad, c.y + (Math.cos(an) * n.y + Math.sin(an) * b.y) * rad * 0.8, c.z + (Math.cos(an) * n.z + Math.sin(an) * b.z) * rad); uv.setXY(k, t, j / 10); } }
      tg.computeVertexNormals(); I.geo(SN, tg, null, {}); tg.dispose();
      const head = pts[0]; I.geo(SN, new THREE.SphereGeometry(0.022, 14, 10), M(head.x, head.y + 0.002, head.z, 0, 0, 0, 1.05, 0.7, 1.5), {}); }
    { const SP = im.art('r8spray', 128, 128, (g, w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#3c8a3a'; const q = kit.rng(2); for (let i = 0; i < 14; i++) { const x = q() * w, y = q() * h; g.beginPath(); for (let k = 0; k < 4; k++) { const a = k * 1.57; g.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 2.5, a, 0, 6.3); } g.fill(); } }, { rough: 0.4 });
      lathe(I, SP, [[0.001, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.17], [0.03, 0.22], [0.018, 0.24], [0.001, 0.24]], M(tx - 0.1, yt + 0.01, tz + 0.32), { seg: 18 });
      box(PLAST, 0.025, 0.06, 0.07, tx - 0.1, yt + 0.28, tz + 0.3, { color: 0x3c8a3a, bevel: 0.006 }); }
    Fr.col.box(tx, F + 0.6, tz, TW + 0.12, 1.25, TL + 0.12, { tag: 'furniture' });
    Fr.interact({ id: 'terrarium', kind: 'look', label: 'Look at the corn snake', pos: [tx, baseY + 0.3, tz], radius: 1.2, use: (env) => { env?.notify?.('Noodle is coiled up on the bark. She looks fine.'); return true; } }); }

  // ================= living room (15): sofa on the NW wall facing SE, armchair + side table + lamp at its left, TV facing it =================
  { const LI = kit.batch('r8living'), LG = new THREE.Group(); LG.name = 'r8_living'; Fr.groups.int.add(LG);
    const sx = 3.9, sz = z0 + 0.42, CANE = im.pbr('tatami_mat', { rep: 0.2 });
    const CUSH = im.art('r8cush', 512, 512, (g, w, h) => { g.fillStyle = '#d9d2b6'; g.fillRect(0, 0, w, h); const q = kit.rng(21);
      for (let i = 0; i < 46; i++) { const x = q() * w, y = q() * h, a = q() * 6.28, L = 60 + q() * 90, c = ['#2f5a32', '#3f7340', '#56874a', '#264a2a'][i % 4];
        g.save(); g.translate(x, y); g.rotate(a); g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke();
        for (let k = 1; k < 14; k++) { const t = k / 14 * L, l = Math.sin(k / 14 * Math.PI) * (22 + q() * 10); g.lineWidth = 4 + q() * 2; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(t, 0); g.quadraticCurveTo(t + 6, s * l * 0.5, t + 12, s * l); g.stroke(); } } g.restore(); } }, { rough: 0.95 });
    CUSH.userData.uvScale = 0.6;
    // THE sofa: the user's woven rattan sofa (rattan darkened to old honey-brown, its white cushions re-covered with the palm-leaf print)
    GLB('rattan_sofa.glb', { parent: LG, pos: [sx, F, sz], ry: 0, mat: (m, n) => { const nm = (m.name || '') + (n.name || '');
      if (/fabric/i.test(nm)) { m.map = CUSH.map; m.color.setRGB(1, 1, 1); m.roughness = 0.95; m.needsUpdate = true; }
      else if (/wood|rattan/i.test(nm)) { m.color.setRGB(0.55, 0.42, 0.3); m.roughness = Math.max(0.6, m.roughness ?? 0.6); }
      else if (/metal/i.test(nm)) m.color.setRGB(0.3, 0.27, 0.22); } });
    { const STR = im.art('r8stripe', 128, 128, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#d8cfb4' : '#7c8a6a'; g.fillRect(x, 0, 16, h); } }, { rough: 0.95 });
      LI.box(STR, 0.44, 0.4, 0.14, M(sx + 0.75, F + 0.7, sz - 0.1, -0.25, 0.2, 0), { color: 0xffffff, bevel: 0.06 }); }
    Fr.col.box(sx, F + 0.42, sz, 2.0, 0.84, 0.75, { tag: 'furniture' });
    ctx.anchors.sofa = { pos: Fr.v(sx, F, sz + 0.1), heading: 0 + Fr.th - 0.72 };
    // the coffee table (the user's, height cut to 55 %) with the ashtray, long side along the sofa
    const tx = sx + 0.05, tz = sz + 1.05;
    GLB('coffee_table.glb', { parent: LG, pos: [tx, F, tz], ry: 0, mat: (m) => { m.roughness = Math.max(0.55, m.roughness ?? 0.7); } }).then(() => { const LA = kit.batch('r8ash'); lathe(LA, im.glass({ tint: 1 }), [[0.001, 0], [0.06, 0], [0.065, 0.025], [0.05, 0.03], [0.001, 0.02]], M(tx + 0.1, F + 0.311, tz), { seg: 20 });
      lathe(LA, GLOSS, [[0.001, 0], [0.07, 0], [0.072, 0.02], [0.06, 0.02], [0.001, 0.015]], M(tx + 0.1, F + 0.311, tz), { color: 0x2c8c7e, seg: 20 }); LA.build(LG, { cast: false }); });
    Fr.col.box(tx, F + 0.16, tz, 1.2, 0.32, 0.5, { tag: 'furniture' });
    // the user's TV table (ps2-soviet-tv-table) and 46" flat screen on it, facing the sofa
    const vx = sx, vz = tz + 1.75;
    GLB('tv_table.glb', { parent: LG, pos: [vx, F, vz], ry: PI / 2, mat: (m) => { m.color.multiplyScalar(0.8); m.roughness = Math.max(0.6, m.roughness ?? 0.6); } });
    GLB('tv_46.glb', { parent: LG, pos: [vx, F + 0.49, vz], ry: PI });
    const tvM = im.emissive(0x0b0d10, 0, 'r8tv'); tvM.color.set(0x050506); tvM.roughness = 0.25;
    I.box(tvM, 1.0, 0.58, 0.003, M(vx, F + 0.49 + 0.345, vz - 0.05), {});
    Fr.col.box(vx, F + 0.5, vz, 1.24, 1.0, 0.45, { tag: 'furniture' });
    const tv = { on: false }; Fr.interact({ id: 'tv', kind: 'tv', label: () => (tv.on ? 'Turn off TV' : 'Watch TV'), pos: [vx, F + 1.0, vz - 0.3], radius: 1.8, use: (env) => { tv.on = !tv.on; tvM.emissive.set(0x5a7088); tvM.emissiveIntensity = tv.on ? 0.9 : 0; env?.emit?.('tv:toggle', { on: tv.on }); return tv.on; } });
    // the armchair (the user's wicker chair, cushions in the same print) and the side table with the lamp between it and the sofa (15)
    const ax = sx - 1.85, az = sz + 0.15;
    GLB('wicker_chair.glb', { parent: LG, pos: [ax, F, az], ry: 0.35, mat: (m) => { if (/wicker/i.test(m.name || '')) { m.color.multiplyScalar(0.75); m.roughness = 0.8; } else { m.color.setRGB(0.25, 0.2, 0.14); } } });
    LI.box(CUSH, 0.52, 0.09, 0.5, M(ax, F + 0.42, az + 0.02, 0, 0.35, 0), { color: 0xffffff, bevel: 0.04 });
    Fr.col.box(ax, F + 0.4, az, 0.75, 0.8, 0.7, { ry: 0.35, tag: 'furniture' });
    const stx = sx - 1.22, stz = sz + 0.02, TT = im.pbr('wood_table_worn', { rep: 0.6 }), top = F + 0.58;
    LI.box(TT, 0.42, 0.03, 0.42, M(stx, top - 0.015, stz), { grain: 0, color: 0xb08a5e, wear: 0.5, bevel: 0.006 });
    for (const s2 of [-1, 1]) { LI.strut(TT, [stx - 0.17, F, stz + s2 * 0.17], [stx + 0.17, top - 0.04, stz - s2 * 0.17], 0.03, 0.02, { color: 0x9a7650 }); LI.strut(TT, [stx + 0.17, F, stz + s2 * 0.17], [stx - 0.17, top - 0.04, stz - s2 * 0.17 * -1], 0.03, 0.02, { color: 0x9a7650 }); }
    Fr.col.box(stx, (top + F) / 2, stz, 0.42, top - F, 0.42, { tag: 'furniture' });
    // the lamp: base from the user's lamp-table download RECOLORED warm brass (its texture replaced by a brass finish), shade from their
    // white modern lamp
    const lampShades = [];
    GLB('lamp_base.glb', { parent: LG, pos: [stx, top, stz], mat: (m) => { m.map = null; m.color.setRGB(0.78, 0.56, 0.24); m.metalness = 0.85; m.roughness = 0.32; m.envMapIntensity = 0.9; m.needsUpdate = true; } })
      .then(() => GLB('lamp_shade.glb', { parent: LG, pos: [stx, top + 0.27, stz], mat: (m) => { m.color.set(0xf0e6cf); m.metalness = 0; m.roughness = 0.9; m.emissive = new THREE.Color(0xffc98a); m.emissiveIntensity = 0; m.side = THREE.DoubleSide; lampShades.push(m); } }));
    const lampL = Fr.light({ id: 'r7_side_lamp', pos: [stx, top + 0.42, stz], color: 0xffcf96, intensity: 22, range: 5, on: false });
    ctx.updaters.push((dt, env) => { const t = env?.timeOfDay ?? 12, on = t < 7 || t > 17.5; lampL.on = on; for (const m of lampShades) m.emissiveIntensity = on ? 0.9 : 0; });
    // the console under the back window (16): drawers, baskets, books, shells; the woven floor lamp, a potted plant, the yellow boogie board
    { const cx = x1 - 0.22, cz = -5.5, CW2 = im.wood(), BSK = im.pbr('tatami_mat', { rep: 0.3 });
      LI.box(CW2, 0.42, 0.05, 1.5, M(cx, F + 0.78, cz), { grain: 2, color: 0xa07a4e, wear: 0.4, bevel: 0.008 }); LI.box(CW2, 0.38, 0.3, 1.44, M(cx, F + 0.6, cz), { grain: 2, color: 0x8f6c45, wear: 0.4, bevel: 0.006 });
      for (const dz of [-0.55, 0, 0.55]) { LI.box(CW2, 0.01, 0.22, 0.4, M(cx - 0.195, F + 0.6, cz + dz), { grain: 2, color: 0x9c7850, wear: 0.4 }); }
      LI.box(CW2, 0.38, 0.03, 1.44, M(cx, F + 0.12, cz), { grain: 2, color: 0x8f6c45 }); for (const dz of [-0.75, 0.75]) LI.box(CW2, 0.42, 0.78, 0.05, M(cx, F + 0.39, cz + dz), { grain: 1, color: 0x8a6842 });
      for (const dz of [-0.45, 0.05, 0.5]) LI.box(BSK, 0.32, 0.26, 0.4, M(cx, F + 0.27, cz + dz), { color: 0xb89a66, bevel: 0.03 });
      for (let k = 0; k < 5; k++) LI.box(im.matte(), 0.16, 0.22, 0.04, M(cx, F + 0.92, cz - 0.5 + k * 0.045), { color: [0x8a2f2a, 0x2f4a6a, 0xd8cfb4, 0x3f6a45, 0x6a5a3a][k], bevel: 0.004 });
      for (const [dz, sc] of [[0.2, 1], [0.38, 0.8]]) lathe(LI, im.plasticGloss(), [[0.001, 0], [0.05 * sc, 0.01], [0.06 * sc, 0.04], [0.02 * sc, 0.07], [0.001, 0.08]], M(cx, F + 0.805, cz + dz), { color: 0xe8dccb, seg: 10 });
      Fr.col.box(cx, F + 0.4, cz, 0.45, 0.8, 1.55, { tag: 'furniture' });
      const lz = cz - 1.05; LI.cyl(im.metalPaint(), 0.012, 0.012, 1.5, M(cx - 0.05, F + 0.75, lz), { color: 0x2a2622, seg: 8 }); LI.cyl(im.metalPaint(), 0.14, 0.15, 0.02, M(cx - 0.05, F + 0.01, lz), { color: 0x2a2622, seg: 16 });
      lathe(LI, BSK, [[0.12, 0], [0.2, 0.0], [0.17, 0.3], [0.1, 0.3]], M(cx - 0.05, F + 1.4, lz), { color: 0xcaa874, seg: 18 }); Fr.col.cyl(cx - 0.05, F + 0.75, lz, 0.18, 1.5, { tag: 'prop' });
      lathe(LI, POT, [[0.001, 0], [0.12, 0], [0.16, 0.28], [0.001, 0.26]], M(cx - 0.05, F, cz + 1.05), { color: 0xb5603a, seg: 16 });
      for (let k = 0; k < 9; k++) { const a = k * 2.4; LI.strut(im.plastic(), [cx - 0.05, F + 0.26, cz + 1.05], [cx - 0.05 + Math.cos(a) * 0.3, F + 0.75 + (k % 3) * 0.15, cz + 1.05 + Math.sin(a) * 0.3], 0.08, 0.006, { color: 0x3f7a34 }); }
      Fr.col.cyl(cx - 0.05, F + 0.4, cz + 1.05, 0.2, 0.8, { tag: 'prop' });
      LI.box(im.plasticGloss(), 0.06, 1.0, 0.52, M(cx + 0.02, F + 0.5, cz + 1.4, 0, 0, 0.12), { color: 0xe8c22a, bevel: 0.08 }); }
    // the north corner (15): stacked cardboard boxes, a fishing rod leaning, a small black chest (no loose boards)
    { const CB = im.matte(); LI.box(CB, 0.45, 0.32, 0.4, M(x1 - 0.3, F + 0.16, z0 + 0.3), { color: 0xa07f56, bevel: 0.01 }); LI.box(CB, 0.4, 0.26, 0.35, M(x1 - 0.32, F + 0.45, z0 + 0.32, 0, 0.2, 0), { color: 0xb18d61, bevel: 0.01 });
      LI.box(im.wood({ dark: true }), 0.55, 0.35, 0.38, M(x1 - 0.95, F + 0.175, z0 + 0.25), { color: 0x1e1a16, bevel: 0.01 });
      LI.rod(im.plasticGloss(), [x1 - 0.1, F + 0.02, z0 + 0.62], [x1 - 0.05, F + 2.2, z0 + 0.5], 0.008, { color: 0x1f1f1f });
      Fr.col.box(x1 - 0.5, F + 0.3, z0 + 0.3, 1.1, 0.6, 0.5, { tag: 'prop' }); }
    // the white cone pendant over the living room, the big dark ceiling fan turning slowly
    { const px = 3.9, pz = -8.3, py = F + 1.95, R = 0.22; lathe(LI, im.plastic(), [[0.03, 0.3], [0.05, 0.26], [R * 0.45, 0.12], [R, 0], [R - 0.008, -0.004], [R * 0.45 - 0.01, 0.116], [0.045, 0.255], [0.027, 0.29]], M(px, py, pz), { color: 0xeeebe2, seg: 32 });
      LI.cyl(STEEL, 0.004, 0.004, ceilY(pz) - py - 0.3, M(px, (ceilY(pz) + py + 0.3) / 2, pz), { color: 0x333333, seg: 6 }); LI.geo(im.emissive(0xfff0d0, 1.6, 'r8bulb2'), new THREE.SphereGeometry(0.05, 12, 8), M(px, py + 0.08, pz), {}); }
    { const fx = 3.35, fz = -7.0, fy = ceilY(fz) - 0.55, FB = kit.batch('r8fan'), FG = new THREE.Group(); FG.position.set(fx, fy, fz); FG.name = 'r8_fan';
      LI.cyl(STEEL, 0.012, 0.012, ceilY(fz) - fy, M(fx, (ceilY(fz) + fy) / 2, fz), { color: 0x1c1b1a, seg: 8 });
      lathe(FB, im.metalPaint(), [[0.001, -0.12], [0.1, -0.1], [0.13, -0.04], [0.12, 0.02], [0.05, 0.06], [0.001, 0.07]], null, { color: 0x1f1d1b, seg: 24 });
      for (let k = 0; k < 5; k++) { const a = k / 5 * PI * 2; FB.box(im.wood({ dark: true }), 0.62, 0.012, 0.14, M(Math.cos(a) * 0.45, -0.06, -Math.sin(a) * 0.45, 0, a, 0.08), { grain: 0, color: 0x4a3423, bevel: 0.004 }); FB.box(STEEL, 0.16, 0.02, 0.03, M(Math.cos(a) * 0.16, -0.06, -Math.sin(a) * 0.16, 0, a, 0), { color: 0x1c1c1c }); }
      FB.build(FG, { cast: false }); Fr.groups.int.add(FG); ctx.updaters.push((dt) => { FG.rotation.y += dt * 1.6; }); }
    // a woven rug under the coffee table
    { const RUG = im.art('r8rug', 256, 256, (g, w, h) => { g.fillStyle = '#a88c5e'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 6) { g.fillStyle = (y / 6) % 4 < 2 ? 'rgba(80,60,35,0.35)' : 'rgba(220,200,150,0.25)'; g.fillRect(0, y, w, 3); } g.strokeStyle = '#6a5030'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); }, { rough: 0.98 });
      LI.box(RUG, 2.4, 0.008, 1.7, M(sx, F + 0.026, tz + 0.1), { color: 0xffffff, bevel: 0.002 }); LI.box(RUG, 1.6, 0.008, 1.0, M(-0.4, F + 0.026, -5.0), { color: 0xffffff, bevel: 0.002 }); }
    LI.build(LG, { cast: false });
  }
  // ================= the bedroom: bed (sleep), wicker chest, sisal rug, crate nightstand with the journal (save), clothes rack (wardrobe), fan =================
  { const bx = x0 + 1.05, bz = (BE.z0 + z1) / 2 + 0.05, PAL = im.wood();
    box(PAL, 2.04, 0.22, 1.56, bx, F + 0.11, bz, { grain: 0, color: 0x7c5a3a, wear: 0.4, bevel: 0.01 }); box(PAL, 0.06, 0.9, 1.6, x0 + 0.04, F + 0.45, bz, { grain: 2, color: 0x6e4f33, wear: 0.4, bevel: 0.01 });
    { const SIS = im.art('r8sisal', 256, 256, (g, w, h) => { g.fillStyle = '#b89c6c'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 8) { g.fillStyle = ((x + y) / 4) % 2 ? 'rgba(90,70,40,0.25)' : 'rgba(230,210,160,0.2)'; g.fillRect(x + ((y / 4) % 2) * 4, y, 6, 3); } }, { rough: 0.98 });
      box(SIS, 2.3, 0.008, 1.9, bx + 0.3, F + 0.004, bz, { color: 0xffffff, bevel: 0.002 }); }
    box(im.fabric('waffle_pique_cotton', { rep: 0.3 }), 1.95, 0.2, 1.4, bx, F + 0.32, bz, { color: 0xe7e2d6, bevel: 0.06 }); box(im.fabric('cotton_jersey', { rep: 0.3 }), 1.2, 0.06, 1.42, bx + 0.35, F + 0.43, bz, { color: 0x6c7f8c, bevel: 0.03 }, 0, 0, 0.02);
    box(im.fabric('cotton_jersey', { rep: 0.2 }), 0.38, 0.12, 0.6, x0 + 0.32, F + 0.48, bz - 0.2, { color: 0xf0ede4, bevel: 0.05 });
    Fr.col.box(bx, F + 0.2, bz, 2.0, 0.4, 1.5, { tag: 'furniture' });
    Fr.interact({ id: 'bed', kind: 'sleep', label: 'Sleep (8 hours)', radius: 1.6, pos: [bx, F + 0.6, bz], use: (env) => { env?.emit?.('sleep', { hours: 8, anchor: 'bed', source: 'nico_house' }); return true; } });
    Fr.anchor('bed', bx + 1.3, F, bz, -PI / 2); Fr.anchor('spawn', bx + 1.6, F, bz - 0.4, -PI / 2);
    { const WK = im.pbr('tatami_mat', { rep: 0.25 }); box(WK, 0.42, 0.45, 0.85, bx + 1.35, F + 0.23, bz + 0.2, { color: 0x9c7a4c, bevel: 0.04 }); box(WK, 0.45, 0.05, 0.88, bx + 1.35, F + 0.47, bz + 0.2, { color: 0x8a6a40, bevel: 0.02 }); Fr.col.box(bx + 1.35, F + 0.25, bz + 0.2, 0.45, 0.5, 0.88, { tag: 'furniture' }); }
    const cx = x0 + 0.25, cz = z1 - 0.22; box(im.wood(), 0.35, 0.4, 0.45, cx, F + 0.22, cz, { grain: 0, color: 0xa58b62, wear: 0.5 }); box(im.fabric('fabric_leather_01', { rep: 0.2 }), 0.21, 0.025, 0.15, cx, F + 0.435, cz, { color: 0x6b4a2e, bevel: 0.006 }, 0, 0.3);
    Fr.col.box(cx, F + 0.22, cz, 0.37, 0.44, 0.47, { tag: 'furniture' });
    Fr.interact({ id: 'save', kind: 'save', label: 'Write in journal (save game)', radius: 1.3, pos: [cx, F + 0.5, cz], use: (env) => { env?.emit?.('save:request', { source: 'nico_house' }); env?.notify?.('Game saved'); return true; } });
    // the clothes rack (the user's download, resized), the wardrobe; against the bedroom's NE wall
    { const rx = xP - 0.35, rz = z1 - 0.9; GLB('clothes_rack.glb', { pos: [rx, F, rz], ry: PI / 2, cast: true }).then((g) => { if (!g) return; fit(g, { h: 1.65 }); const b = new THREE.Box3().setFromObject(g); g.position.x += rx - (b.min.x + b.max.x) / 2; g.position.z += rz - (b.min.z + b.max.z) / 2; g.position.y += F - b.min.y; Fr.groups.int.add(g); });
      const ward = { open: false }; Fr.interact({ id: 'wardrobe', kind: 'wardrobe', radius: 1.5, pos: [rx, F + 1.1, rz], label: () => 'Change clothes', use: (env) => { ward.open = !ward.open; if (ward.open) env?.emit?.('wardrobe:open', { source: 'nico_house' }); return ward.open; } });
      Fr.anchor('wardrobe', rx - 0.9, F, rz, -PI / 2); Fr.col.box(rx, F + 0.8, rz, 0.5, 1.6, 1.2, { tag: 'furniture' }); }
    { const fx = x1 - 0, BL = im.metalPaint(), fxx = xP - 0.4, fzz = BE.z0 + 0.35; void fx; lathe(I, BL, [[0.001, 0], [0.18, 0], [0.18, 0.03], [0.03, 0.05], [0.001, 0.05]], M(fxx, F, fzz), { color: 0x1c1c1c, seg: 24 });
      I.cyl(BL, 0.015, 0.015, 1.15, M(fxx, F + 0.6, fzz), { color: 0x1c1c1c, seg: 10 }); const hy = F + 1.25;
      for (let k = 0; k < 16; k++) { const a = k / 16 * PI; I.geo(BL, new THREE.TorusGeometry(0.22, 0.003, 4, 32, PI), M(fxx - 0.06, hy, fzz, 0, PI / 2 + 2.2, a), { color: 0x222222 }); }
      I.geo(BL, new THREE.TorusGeometry(0.22, 0.006, 6, 40), M(fxx - 0.06, hy, fzz, 0, PI / 2 + 2.2, 0), { color: 0x222222 }); Fr.col.cyl(fxx, F + 0.6, fzz, 0.2, 1.2, { tag: 'prop' }); }
    // tropical-print curtains on the bedroom windows (07)
    const CUR = im.art('r8tropic', 512, 512, (g, w, h) => { g.fillStyle = '#e9efe2'; g.fillRect(0, 0, w, h); const q = kit.rng(31); for (let i = 0; i < 70; i++) { const x = q() * w, y = q() * h, a = q() * 6.28, l = 40 + q() * 60; g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = ['#2f6b3a', '#4f8f4a', '#1f4f2e', '#6aa35a'][i % 4]; g.beginPath(); g.ellipse(0, 0, l, l * 0.35, 0, 0, 6.3); g.fill(); g.restore(); } }, { rough: 0.9 });
    CUR.userData.uvScale = 1.2;
    for (const o of (ctx.r4openings || []).filter((q) => /W_bed/.test(q.id))) { const W = o.wall; for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const du = s * (o.w / 2 + 0.05 - k * 0.07), [cx2, cz2] = W.pt(o.u + du, -T - 0.1 - (k % 2) * 0.03); box(CUR, 0.075, o.h + 0.4, 0.02, cx2, (o.y0 + o.y1) / 2 + 0.05, cz2, { color: 0xffffff, bevel: 0.006, uv: [k * 0.07, 0] }, 0, W.ry); } }
  }
  // ================= the lived-in extras (15 / 16): plants, pictures, baskets, a shelf over the hall mouth, kitchen odds and ends =================
  // potted plants: the vegetation library's real plants (instanced, volume-shaded), placed in world space once the house is placed
  const vegIn = []; { let done = false; ctx.updaters.push(() => { if (done) return; done = true; const V = ctx.opts.game?.vegetation; if (!V?.place || !vegIn.length) return; ctx.group.updateMatrixWorld(true);
    for (const [x, y, z, k, sc] of vegIn) { const p = Fr.v(x, y, z).applyMatrix4(ctx.group.matrixWorld); try { V.place(k, p.x, p.z, { model: k, y: p.y, keepY: true, s: sc, owner: 'nicoHouse' }); } catch (e) { /* no plant */ } } }); }
  { const X = kit.batch('r8extras'), PICT = (seed, w, h) => im.art('r8pic' + seed, 256, 192, (g, W, H) => { const q = kit.rng(seed); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, ['#a9d3e6', '#f2c48a', '#cfe3d0'][seed % 3]); gr.addColorStop(0.6, ['#3d8fa3', '#d9774a', '#5e8f62'][seed % 3]); gr.addColorStop(1, '#e8d8b0'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(30,60,40,${0.3 + q() * 0.4})`; g.beginPath(); g.ellipse(q() * W, H * 0.62 + q() * 30, 20 + q() * 30, 6 + q() * 8, 0, 0, 6.3); g.fill(); } }, { rough: 0.8 });
    const frame = (x, y, z, ry, w, h, seed) => { X.box(im.wood(), w + 0.06, h + 0.06, 0.03, M(x, y, z, 0, ry, 0), { color: 0x6a4a2e, bevel: 0.004 }); X.box(PICT(seed, w, h), w, h, 0.006, M(x + Math.sin(ry) * 0.018, y, z + Math.cos(ry) * 0.018, 0, ry, 0), { color: 0xffffff, bevel: 0 }); };
    frame(2.3, F + 1.6, z1 - 0.02, PI, 0.6, 0.45, 1); frame(x1 - 0.02, F + 1.65, -7.2, -PI / 2, 0.5, 0.38, 2); frame(xP + 0.07, F + 1.55, -8.9, PI / 2, 0.45, 0.6, 3);
    const potPlant = (x, z, s2, tall) => { lathe(X, POT, [[0.001, 0], [0.13 * s2, 0], [0.17 * s2, 0.3 * s2], [0.001, 0.28 * s2]], M(x, F, z), { color: 0xa55a36, seg: 16 });
      vegIn.push([x, F + 0.26 * s2, z, tall ? 'tropical_bed' : 'tropical_leaf', (tall ? 0.95 : 0.6) * s2]);   // the vegetation library's real plant in the pot
      Fr.col.cyl(x, F + 0.4, z, 0.2 * s2, 0.8, { tag: 'prop' }); };
    potPlant(5.2, -6.75, 0.85, false); potPlant(1.95, z0 + 0.35, 0.8, true); potPlant(-2.3, -6.0, 0.7, false);
    // a basket by the armchair, magazines on the coffee table
    const BSK = im.pbr('tatami_mat', { rep: 0.3 }); lathe(X, BSK, [[0.001, 0], [0.2, 0], [0.24, 0.32], [0.23, 0.33], [0.001, 0.3]], M(1.6, F, z0 + 0.3), { color: 0xb08a58, seg: 18 });
    X.box(im.paint({ peel: 'a', fade: 0, gloss: 0.5 }), 0.22, 0.012, 0.3, M(3.75, F + 0.32, z0 + 1.45, 0, 0.3, 0), { color: 0x3a6a8a, bevel: 0 }); X.box(im.paint({ peel: 'a', fade: 0, gloss: 0.5 }), 0.21, 0.01, 0.28, M(3.78, F + 0.333, z0 + 1.43, 0, 0.6, 0), { color: 0xc94b3a, bevel: 0 });
    // the shelf over the hall mouth with a basket and a box (16), a wall clock, a paper towel roll, a dish rack and a fruit bowl
    X.box(im.wood(), 0.3, 0.035, 1.3, M(xP + 0.2, F + 2.25, (HA.z0 + HA.z1) / 2), { grain: 2, color: 0x7a5636, bevel: 0.004 }); for (const dz of [-0.5, 0.5]) X.box(im.wood(), 0.2, 0.15, 0.03, M(xP + 0.15, F + 2.16, (HA.z0 + HA.z1) / 2 + dz), { color: 0x6a4a2e });
    X.box(BSK, 0.28, 0.2, 0.38, M(xP + 0.2, F + 2.37, (HA.z0 + HA.z1) / 2 - 0.25), { color: 0xb89a66, bevel: 0.02 }); X.box(im.matte(), 0.22, 0.16, 0.3, M(xP + 0.2, F + 2.35, (HA.z0 + HA.z1) / 2 + 0.3), { color: 0xa07f56, bevel: 0.01 });
    lathe(X, PLAST, [[0.001, 0], [0.16, 0], [0.16, 0.04], [0.001, 0.04]], M(0.6, F + 2.0, z1 - 0.01, PI / 2, 0, 0), { color: 0xeeeae0, seg: 24 });
    X.box(STEEL, 0.008, 0.11, 0.008, M(0.6, F + 2.03, z1 - 0.055, 0, 0, 0.6), { color: 0x222222 }); X.box(STEEL, 0.008, 0.08, 0.008, M(0.6, F + 2.01, z1 - 0.055, 0, 0, -0.9), { color: 0x222222 });
    X.cyl(im.fabric('cotton_jersey', { rep: 0.2 }), 0.06, 0.06, 0.27, M(1.15, F + 1.42, zB - 0.06, 0, 0, PI / 2), { color: 0xf2efe6, seg: 14 });
    for (let k = 0; k < 6; k++) X.box(im.plasticGloss(), 0.01, 0.2, 0.18, M(sinkX + 0.72 + k * 0.035, F + 1.0, zB - 0.25, 0, 0, 0.15), { color: [0xe8e4da, 0x3c6a8a, 0xe8e4da, 0xc4482e, 0xe8e4da, 0x6a8a4a][k], bevel: 0.004 });
    lathe(X, im.plasticGloss(), [[0.001, 0], [0.09, 0.0], [0.15, 0.08], [0.14, 0.085], [0.001, 0.02]], M(penX + 0.1, F + 0.917, penZ1 + 0.85), { color: 0x2e7f8a, seg: 20 });
    for (const [dx, dz, c] of [[0.05, 0.02, 0xe8a12a], [-0.04, -0.03, 0xd94a2a], [0.0, 0.06, 0x9ac23a], [0.06, -0.05, 0xe8a12a]]) X.geo(im.plastic(), new THREE.SphereGeometry(0.04, 10, 8), M(penX + 0.1 + dx, F + 0.96, penZ1 + 0.85 + dz), { color: c });
    X.build(Fr.groups.int, { cast: false }); }
  // ================= daylight: fill lights at the windows and the slider, a warm fill under the ridge by day =================
  for (const o of (ctx.r4openings || []).filter((q) => q.kind === 'window' && !q.frosted)) { const [x, z] = o.wall.pt(o.u, -T - 0.8); Fr.light({ id: 'r4_win_' + o.id, pos: [x, (o.y0 + o.y1) / 2, z], color: 0xffe2b8, intensity: 60, range: 8, on: true }); }
  for (const o of (ctx.r4openings || []).filter((q) => q.kind === 'slider' || q.kind === 'door')) { const [x, z] = o.wall.pt(o.u, -T - 1.2); Fr.light({ id: 'r7_day_' + o.id, pos: [x, F + 1.3, z], color: 0xffe6c4, intensity: 55, range: 8, on: true }); }
  { const fills = [[3.9, -7.0], [0.0, -5.6], [-4.4, -7.0]].map(([x, z], i) => Fr.light({ id: 'r7_fill_' + i, pos: [x, F + 2.3, z], color: 0xffe3bd, intensity: 95, range: 9.5, on: true }));
    ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12, day = t > 6.8 && t < 18.6; for (const l of fills) l.on = day; }); }
  Fr.build();
}
