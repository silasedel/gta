// Nico's house, round 4: the back from the water (user mock-up 08, the user's favorite). A weathered vertical-plank timber
// bulkhead ~1.1 m over the water with a cap and whaler, a white two-rail fence along its top on both sides of the dock gap,
// a metal ladder down the wall at the right, the long dock running parallel to the wall from the left and widening into
// the square platform in front of the center-right of the house: pilings at the corners, two white resin lawn chairs (the
// user's Pool Chairs 1 set), the fishing rod on a tripod holder and the tackle box (Fishing Gear 2), coiled rope, a blue
// cooler, the metal swim ladder, the sign pole with its blue marker and the "KEEP OFF MY JETTY" sign, and the white open
// boat with outboards moored along the platform (Boat 8, the closest library boat to a center-console skiff; stripe made
// black, invented "MARLO" outboard cowls). Street frame (r4/plan4.js).
import { R4, P4, terraceY } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { loadKeysModels } from '../models.js';
export const order = 6;

export function build(ctx) {
  if (!R4) return;
  const { THREE, kit, mat } = ctx, Fr = frame(ctx), B = Fr.ext, D = Fr.detail, M = kit.M, P = P4, r = kit.rng(608), sea = ctx.plan.seaY;
  const { lathe } = makeGeo(THREE, kit);
  const W = mat.wood({ marine: true }), WD = mat.wood(), WHITE = mat.paint({ peel: 'a', fade: 0.55, gloss: 0.85 }), ST = mat.steel(), PL = mat.plastic();
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0, Bt = B) => Bt.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.006, rand: r, ...o });
  const gray = (k = 1) => kit.vary(kit.mul(0xa49e92, k), r, 0.1);
  const zw = P.wallZ, bed = sea - 3.2, lawn = (x) => terraceY(x, zw + 0.3) + 0.02;
  // ---------- bulkhead: vertical 2x10 planks side by side (outer face at zw), whaler + cap on top, tie-back posts ----------
  { const pw = 0.235;
    for (let x = P.wallX0; x < P.wallX1 - 0.01; x += pw) { const xm = x + pw / 2, top = lawn(xm) + 0.06 + (r() - 0.5) * 0.03, h = top - bed, tone = gray(0.78 + r() * 0.3);
      box(W, pw - 0.006, h, 0.06, xm, bed + h / 2, zw + 0.03, { grain: 1, color: tone, wear: 0.9, bevel: 0.008 }, (r() - 0.5) * 0.01, 0, (r() - 0.5) * 0.008); }
    for (let x = P.wallX0; x < P.wallX1 - 0.1; x += 2.4) { const x1 = Math.min(P.wallX1, x + 2.4), xm = (x + x1) / 2;
      box(W, x1 - x - 0.01, 0.2, 0.1, xm, lawn(xm) - 0.16, zw - 0.05, { grain: 0, color: gray(0.7), wear: 0.9 });                       // whaler on the water face
      box(WD, x1 - x - 0.01, 0.06, 0.3, xm, lawn(xm) + 0.06 + 0.03, zw + 0.12, { grain: 0, color: gray(0.95), wear: 0.7, bevel: 0.01 }); // cap
      box(W, 0.2, lawn(xm) + 0.08 - bed, 0.2, x, (lawn(xm) + 0.08 + bed) / 2, zw - 0.2, { grain: 1, color: gray(0.68), wear: 1, bevel: 0.02 }); }   // king piles
    Fr.col.box((P.wallX0 + P.wallX1) / 2, (lawn(0) + bed) / 2, zw + 0.12, P.wallX1 - P.wallX0, lawn(0) - bed + 0.2, 0.3, { tag: 'seawall' });
    // dark clear water at the wall: a sandy bed so it doesn't read bottomless
    const g = new THREE.PlaneGeometry(60, 30, 1, 1); g.rotateX(-Math.PI / 2); B.geo(mat.pbr('sand_01', { rep: 5, gain: 1.2, grunge: true }), g, M(-3, bed + 0.02, zw - 15), { color: [0.55, 0.6, 0.52], uvMul: [12, 6] }); g.dispose(); }
  // ---------- white two-rail fence on the wall top, both sides of the dock gap (08) ----------
  { const fz = zw + 0.45, gap = [P.dock.gangX - 0.9, P.dock.gangX + 0.9];
    const run = (x0, x1) => { const n = Math.max(1, Math.round((x1 - x0) / 2.0));
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y0 = lawn(x); box(WHITE, 0.1, 1.02, 0.1, x, y0 + 0.47, fz, { grain: 1, color: kit.vary(0xe9e6dc, r, 0.03), wear: 0.45, bevel: 0.01 }); box(WHITE, 0.13, 0.03, 0.13, x, y0 + 0.995, fz, { color: 0xeeebe2, wear: 0.4 }); }
      for (let i = 0; i < n; i++) { const xa = x0 + (x1 - x0) * i / n + 0.05, xb = x0 + (x1 - x0) * (i + 1) / n - 0.05, xm = (xa + xb) / 2, y0 = lawn(xm);
        for (const y of [0.88, 0.45]) box(WHITE, xb - xa, 0.09, 0.04, xm, y0 + y, fz - 0.07, { grain: 0, color: kit.vary(0xe9e6dc, r, 0.03), wear: 0.45 }); }
      Fr.col.box((x0 + x1) / 2, lawn(0) + 0.5, fz, x1 - x0, 1.0, 0.12, { tag: 'fence' }); };
    run(P.wallX0 + 0.3, gap[0]); run(gap[1], P.wallX1 - 0.3); }
  // ---------- metal ladder down the wall at the right (08) ----------
  { const lx = -13.5, top = lawn(lx) + 0.1;
    for (const s of [-1, 1]) { D.tube(ST, [[lx + s * 0.22, sea - 1.0, zw - 0.1], [lx + s * 0.22, top, zw - 0.1], [lx + s * 0.22, top + 0.35, zw + 0.05], [lx + s * 0.22, top + 0.35, zw + 0.3], [lx + s * 0.22, top, zw + 0.45]], 0.022, { seg: 10, color: 0xb9bab6, steps: 40, tension: 0.2 }); }
    for (let y = sea - 0.8; y < top; y += 0.3) D.cyl(ST, 0.016, 0.016, 0.44, M(lx, y, zw - 0.1, 0, 0, Math.PI / 2), { color: 0xb9bab6, seg: 10 }); }
  // ---------- the dock: gangway off the wall (left), long walk parallel to the wall, the square platform ----------
  const dk = P.dock, y = dk.y, pl = P.plat, pilesAt = [];
  const planks = (x0, x1, z0, z1, along) => { // boards across the walking direction; along = 'x' (walk runs along x) or 'z'
    const len = along === 'x' ? x1 - x0 : z1 - z0, wid = along === 'x' ? z1 - z0 : x1 - x0, pitch = 0.152;
    for (let t = pitch / 2; t < len - 0.03; t += pitch) { const tone = r() < 0.05 ? kit.vary(0xbfa77e, r, 0.06) : gray(0.85 + r() * 0.3), sag = (r() - 0.5) * 0.006;
      if (along === 'x') box(WD, 0.142, 0.045, wid - (r() - 0.5) * 0.03, x0 + t, y - 0.022 + sag, (z0 + z1) / 2, { grain: 2, color: tone, wear: 0.5 + r() * 0.5, bevel: 0.007 }, 0, (r() - 0.5) * 0.01);
      else box(WD, wid - (r() - 0.5) * 0.03, 0.045, 0.142, (x0 + x1) / 2, y - 0.022 + sag, z0 + t, { grain: 0, color: tone, wear: 0.5 + r() * 0.5, bevel: 0.007 }, 0, (r() - 0.5) * 0.01); }
    // stringers under the boards and the colliders
    const nS = Math.max(2, Math.round(wid / 0.6) + 1);
    for (let i = 0; i < nS; i++) { const o = -wid / 2 + 0.05 + (wid - 0.1) * i / (nS - 1);
      if (along === 'x') box(W, len, 0.2, 0.06, (x0 + x1) / 2, y - 0.145, (z0 + z1) / 2 + o, { grain: 0, color: gray(0.6), wear: 0.9 });
      else box(W, 0.06, 0.2, len, (x0 + x1) / 2 + o, y - 0.145, (z0 + z1) / 2, { grain: 2, color: gray(0.6), wear: 0.9 }); }
    Fr.col.box((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { tag: 'dock', surface: 'wood' }); };
  const pile = (x, z, top) => { const rr = 0.12 + r() * 0.03, h = top - bed, lean = (r() - 0.5) * 0.03;
    B.cyl(W, rr * 0.92, rr, h, M(x, top - h / 2, z, lean, r() * 6, lean * 0.7), { seg: 14, hseg: 6, color: kit.vary(0x847a6c, r, 0.12), wear: 1 });
    lathe(B, W, [[0.001, 0], [rr * 0.92, 0], [rr * 0.85, 0.03], [rr * 0.5, 0.07], [0.001, 0.08]], M(x, top, z), { color: kit.vary(0x9a9083, r, 0.1), seg: 14 });
    Fr.col.cyl(x, (top + bed) / 2, z, rr + 0.02, top - bed, { tag: 'pile' }); pilesAt.push([x, z, top]); };
  const zA = dk.z - dk.w / 2, zB = dk.z + dk.w / 2, gx0 = dk.gangX - 0.75, gx1 = dk.gangX + 0.75;
  planks(gx0, gx1, zB, zw - 0.02, 'z');                                         // short gangway from the wall top down to the walk (sloped by the step below)
  planks(pl.x1, gx1, zA, zB, 'x');                                              // the long walk
  planks(pl.x0, pl.x1, pl.z0, pl.z1, 'z');                                      // platform: boards run toward the house (08)
  for (let x = pl.x1 + 1.9; x < gx1; x += 2.2) { pile(x, zA - 0.12, y + (r() < 0.4 ? 0.5 : 0.08)); pile(x, zB + 0.12, y + 0.08); }
  for (const [x, z] of [[pl.x0 - 0.1, pl.z0 - 0.1], [pl.x1 + 0.1, pl.z0 - 0.1], [pl.x0 - 0.1, pl.z1 + 0.1], [pl.x1 + 0.1, pl.z1 + 0.1], [(pl.x0 + pl.x1) / 2, pl.z0 - 0.1]]) pile(x, z, y + 0.85);
  for (const x of [gx0 - 0.1, gx1 + 0.1]) pile(x, zw - 0.25, y + 1.0);
  // step block where the gangway meets the cap (the wall top stands ~0.6 m over the dock): two treads
  { const top = lawn(dk.gangX); for (let k = 1; k <= 2; k++) box(WD, 1.5, 0.05, 0.3, dk.gangX, y + (top - y) * k / 3, zw + 0.05 - 0.3 * (3 - k), { grain: 0, color: gray(0.95), wear: 0.6 });
    Fr.col.boxQ([dk.gangX, (top + y) / 2, zw - 0.35], [0.75, 0.08, 0.6], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan2(top - y, 1.2)), { tag: 'stair', surface: 'wood' }); }
  // metal swim ladder at the platform's front (08), cleats, coiled rope
  { const lx = -2.3, lz = pl.z0 - 0.02;
    for (const s of [-1, 1]) D.tube(ST, [[lx + s * 0.2, sea - 1.1, lz - 0.05], [lx + s * 0.2, y + 0.02, lz - 0.05], [lx + s * 0.2, y + 0.55, lz + 0.1], [lx + s * 0.2, y + 0.02, lz + 0.35]], 0.02, { seg: 10, color: 0xc2c3bf, steps: 36, tension: 0.15 });
    for (let yy = sea - 0.9; yy < y - 0.1; yy += 0.3) box(ST, 0.4, 0.03, 0.06, lx, yy, lz - 0.05, { color: 0xb8b9b5 }); }
  const cleat = (x, z, ry) => { box(ST, 0.26, 0.025, 0.045, x, y + 0.07, z, { color: 0xa9a69c, bevel: 0.01 }, 0, ry); for (const s of [-1, 1]) D.cyl(ST, 0.015, 0.02, 0.05, M(x + Math.cos(ry) * s * 0.06, y + 0.03, z - Math.sin(ry) * s * 0.06), { color: 0xa9a69c, seg: 10 }); };
  cleat(pl.x0 + 1.2, pl.z0 + 0.12, 0); cleat(pl.x0 + 4.6, pl.z0 + 0.12, 0); cleat(pl.x1 + 2.6, zA + 0.12, 0);
  const ROPE = mat.fabric('wool_boucle', { rep: 0.05 });
  const coil = (x, z, col) => { const pts = []; for (let i = 0; i < 120; i++) { const t = i / 120, a2 = t * 6.283 * 6, rr = 0.08 + t * 0.2; pts.push([x + Math.cos(a2) * rr, y + 0.02 + (i % 20) * 0.0006, z + Math.sin(a2) * rr]); } D.tube(ROPE, pts, 0.013, { seg: 6, color: col, steps: 200 }); };
  coil(pl.x0 + 0.8, pl.z1 - 0.8, 0xd9d2b8); coil(pl.x0 + 1.4, pl.z1 - 1.25, 0x4f86a6);
  // ---------- the sign pole (08): galvanized pole on the platform's back corner, blue marker board up top, the jetty sign ----------
  { const sx = pl.x0 + 0.9, sz = pl.z1 - 0.35, top = y + 4.6;
    D.cyl(ST, 0.05, 0.055, top - (y - 0.2), M(sx, (top + y - 0.2) / 2, sz), { color: 0xb4b5b1, seg: 14 }); lathe(D, ST, [[0.001, 0], [0.18, 0], [0.18, 0.04], [0.06, 0.1], [0.001, 0.1]], M(sx, y, sz), { color: 0xa5a6a2, seg: 16 });
    box(mat.metalPaint(), 0.36, 0.9, 0.04, sx, top - 0.55, sz - 0.06, { color: 0x1f4fa8, wear: 0.3 });
    const SIGN = mat.art('r4jetty', 512, 256, (g, w, h) => { g.fillStyle = '#f1efe8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a2a2a'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); g.fillStyle = '#1e1e1e'; g.font = kit.font(84, 800, 'Arial Black, Helvetica, sans-serif'); g.textAlign = 'center'; g.fillText('KEEP OFF', w / 2, 112); g.fillText('MY JETTY', w / 2, 206);
      const q = kit.rng(9); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,100,70,${q() * 0.12})`; g.fillRect(q() * w, q() * h, 2 + q() * 6, 1 + q() * 3); } }, { rough: 0.6 });
    const sgm = M(sx, y + 1.75, sz - 0.07); B.box(SIGN, 0.62, 0.31, 0.012, sgm, { bevel: 0.002 }); box(mat.metalPaint(), 0.64, 0.33, 0.01, sx, y + 1.75, sz - 0.055, { color: 0xdedbd2 });
    for (const yy of [y + 1.65, y + 1.85]) box(ST, 0.12, 0.02, 0.04, sx, yy, sz - 0.04, { color: 0x9a9a96 });
    Fr.col.cyl(sx, y + 2, sz, 0.08, 4, { tag: 'pole' }); }
  Fr.anchor('dock', (pl.x0 + pl.x1) / 2, y, (pl.z0 + pl.z1) / 2, Math.PI); Fr.anchor('dockHead', (pl.x0 + pl.x1) / 2, y, pl.z0 + 0.6, Math.PI);
  // ---------- library pieces: lawn chairs, fishing gear, cooler, the boat ----------
  const lib = loadKeysModels(THREE, ['lawn_chair', 'fishing_gear', 'coolers', 'skiff_cc']);
  const boat = { x: -3.6, z: pl.z0 - 1.25, h: Math.PI / 2 + 0.03 };
  Fr.anchor('skiff', boat.x, sea, boat.z, boat.h);
  ctx.async.push(lib.ready.then(() => {
    const I = lib.instancer('r4dock');
    for (const [x, z, a] of [[-3.2, -29.0, 2.6], [-1.9, -28.8, 3.4]]) { I.add('lawn_chair', 'dock', M(x, y, z, 0, a, 0)); Fr.col.box(x, y + 0.45, z, 0.62, 0.9, 0.62, { tag: 'prop' }); }
    ctx.anchors.dockChair = { pos: Fr.v(-3.2, y, -29.0), heading: 2.6 - 0.72 };
    for (const [n, x, z, a] of [['tackle_box', -4.8, -29.4, 0.3], ['plastic_bucket_full', -5.2, -29.0, 1.0]]) I.add('fishing_gear', n, M(x, y, z, 0, a, 0));
    const cn = lib.names('coolers'); if (cn.length) I.add('coolers', cn[0], M(-0.95, y, -28.35, 0, 0.4, 0), { tint: [0.55, 0.75, 1.15] });   // the blue cooler at the walk junction
    const meshes = I.build(Fr.groups.detail); for (const m of meshes) m.raycast = () => {};
    // rod in a tripod holder at the platform edge, line out to the water
    { const T = kit.batch('r4rod'), tx = -4.4, tz = pl.z0 + 0.5, apex = [tx, y + 0.95, tz];
      for (let k = 0; k < 3; k++) { const a2 = k * 2.094 + 0.3; T.rod(ST, [tx + Math.cos(a2) * 0.32, y, tz + Math.sin(a2) * 0.32], apex, 0.012, { color: 0x2d2d2d }); }
      const p = lib.piece('fishing_gear', 'fishing_pole'); if (p) { const g = new THREE.Group(); g.position.set(tx, y + 0.95, tz); g.rotation.set(-0.95, 0.15, 0); for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.castShadow = true; m.raycast = () => {}; g.add(m); } Fr.groups.detail.add(g); }
      T.tube(mat.plastic(), [[tx, y + 2.4, tz - 1.3], [tx - 0.2, y + 1.2, tz - 3.0], [tx - 0.3, sea, tz - 4.2]], 0.0015, { seg: 3, color: 0xe8e8e0, steps: 20 }); T.build(Fr.groups.detail); }
    // the boat (bobs), stripe repainted black, outboard cowls lettered with an invented brand
    const p = lib.piece('skiff_cc', 'dock'); if (p) {
      const g = new THREE.Group(); g.name = 'r4skiff'; const ext = new THREE.Vector3(); p.box.getSize(ext); const long = ext.x > ext.z ? 'x' : 'z';
      const inner = new THREE.Group(); if (long === 'z') inner.rotation.y = Math.PI / 2; g.add(inner);
      for (const q of p.parts) { let mm = q.material; if (/blue/i.test(mm.name || '')) { mm = mm.clone(); mm.color.setRGB(0.02, 0.02, 0.022); mm.name += ':r4black'; }
        if (/red/i.test(mm.name || '')) { mm = mm.clone(); mm.color.setRGB(0.12, 0.12, 0.12); } const m = new THREE.Mesh(q.geometry, mm); m.castShadow = false; m.receiveShadow = true; m.raycast = () => {}; inner.add(m); }
      g.position.set(boat.x, sea - 0.28, boat.z); g.rotation.y = boat.h - Math.PI / 2; Fr.groups.dyn.add(g);
      const ph = r() * 6.28; ctx.updaters.push(() => { const t = performance.now() / 1000; g.position.y = sea - 0.28 + Math.sin(t * 0.9 + ph) * 0.03; g.rotation.z = Math.sin(t * 0.7 + ph) * 0.02; });
      // bow and stern lines to the platform cleats
      const tb = kit.batch('r4lines'); for (const [cx, cz, dx] of [[pl.x0 + 1.2, pl.z0 + 0.12, -2.4], [pl.x0 + 4.6, pl.z0 + 0.12, 2.2]]) { const a2 = [cx, y + 0.08, cz], b2 = [boat.x + dx, sea + 0.55, boat.z + 0.35], pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t - 0.25 * 4 * t * (1 - t), a2[2] + (b2[2] - a2[2]) * t]); } tb.tube(ROPE, pts, 0.011, { seg: 5, color: 0xd6cfb4 }); }
      tb.build(Fr.groups.detail, { cast: false }); }
  }));
  Fr.build();
}
