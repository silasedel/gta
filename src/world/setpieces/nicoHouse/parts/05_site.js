// Nico's house, part 05: the lot. Crushed-shell and sand yard with damp patches and puddles, the carport slab, concrete
// seawalls on the two water sides, the sandy bottom beyond them, and the weathered dock with its piles, cleats, rope,
// fish-cleaning station, ladder and light.
import { makeGroundMaterial } from '../../../ground/groundMaterial.js';
import { WEEDS } from '../yard.data.js';
export const order = 5;
// ground pass: the yard sheet uses the terrain's Keys-yard ground (user's sand / grassy-sand scans, hex-tiled) so it matches the
// lots around it; ?ground2=0 keeps the old shell-floor texture
const GROUND2 = typeof location === 'undefined' || !/[?&]ground2=0\b/.test(location.search);
let yardMat = null;

export function build(ctx) {
  const { THREE, kit, plan: P, mat, col } = ctx, B = ctx.site ?? ctx.ext, D = ctx.detail, M = kit.M, r = kit.rng(55), L = P.lot, sea = P.seaY;
  // ---------- yard: one subdivided sheet, vertex colors blend shell drive, pale sand, damp shade and grassy edges ----------
  // keys pass (Nov 17): the bay is ~15 m beyond the old seawall line in the retraced map; a seawall stands only where the water
  // really meets the lot (opts.waterAt), elsewhere the yard runs on and sinks under the beach sand along a wobbly line
  const waterAt = ctx.opts.waterAt, wallN = !waterAt || [-20, -10, 0, 8].some((x) => waterAt(x, L.z0 - 2)), wallE = !waterAt || [-10, 0, 10, 20].some((z) => waterAt(L.x1 + 2, z));
  const OPEN_N = !wallN, OPEN_E = !wallE;
  const SHELL = mat.pbr('shell_floor_01', { rep: 2.6, gain: 1.5, grunge: true }), x0 = L.x0 - 22, x1 = L.x1 + (OPEN_E ? 10 : -0.2), z0 = L.z0 + (OPEN_N ? -3 : 0.2), z1 = L.z1 + 22;
  { const nx = 90, nz = 110, g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pa = g.attributes.position, cols = new Float32Array(pa.count * 3), n2 = (x, z) => Math.sin(x * 0.37 + Math.sin(z * 0.23) * 2) * Math.cos(z * 0.31 + Math.sin(x * 0.19) * 2);
    // the sheet's height at a plan point (also ctx.yardY: decals, puddles and props of part 55 follow the same surface)
    const yardY = (x, z) => { const drive = Math.max(0, 1 - Math.abs(x + 2 + Math.sin(z * 0.2) * 1.2) / (5.5 + Math.max(0, z - 14) * 0.5)) * (z > 3 ? 1 : 0.3), under = (x > -8.6 && x < 8 && z > -6.4 && z < 8) ? 1 : 0;
      const dEdge = Math.min(x - x0, z1 - z, OPEN_E ? x1 - x : 99, OPEN_N ? z - z0 : 99) - 0.4 - (n2(x * 0.11, z * 0.13) * 0.5 + 0.5) * 7 - (n2(x * 0.5, z * 0.45) * 0.5 + 0.5) * 1.5, keep = Math.min(1, Math.max(0, dEdge / 2));
      const core = Math.max(0, Math.min(1, (7 - Math.abs(x + 2 + Math.sin(z * 0.2) * 1.2)) / 2.5)), sink = (1 - keep) * (1 - core);
      return (n2(x * 2.3, z * 2.1) * 0.012 + n2(x * 0.6, z * 0.7) * 0.025) * (1 - under) * (1 - drive * 0.5) * keep - 0.14 * sink; };
    ctx.yardY = yardY;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), drive = Math.max(0, 1 - Math.abs(x + 2 + Math.sin(z * 0.2) * 1.2) / (5.5 + Math.max(0, z - 14) * 0.5)) * (z > 3 ? 1 : 0.3);
      const under = (x > -8.6 && x < 8 && z > -6.4 && z < 8) ? 1 : 0, n = n2(x, z) * 0.5 + 0.5, edge = Math.min(1, Math.max(0, (Math.hypot(x + 2, z - 4) - 20) / 14));
      const nB = n2(x * 0.17 + 3.1, z * 0.21 - 1.7) * 0.5 + 0.5, nC = n2(x * 0.71 - 2.3, z * 0.63 + 0.9) * 0.5 + 0.5;   // macro + mid breakup
      let c = [0.86, 0.85, 0.82]; c = c.map((v) => v * (0.84 + 0.22 * n) * (0.9 + 0.16 * nC) * (1 - 0.24 * under) * (1 + 0.05 * drive));
      const damp = Math.max(0, nB - 0.62) * 2.2 * (1 - drive * 0.6); c = c.map((v, k) => v * (1 - 0.32 * damp * [1, 1.02, 1.08][k]));      // dark damp hollows
      const grass = Math.min(1, edge * 0.85 + (1 - drive) * 0.7 * Math.max(0, n - 0.3) + 0.45 * Math.max(0, nC - 0.5));
      c = [c[0] * (1 - 0.42 * grass), c[1] * (1 - 0.28 * grass), c[2] * (1 - 0.5 * grass)];   // matted gray-green grass
      if (z > 5.5) { const rut = Math.max(Math.exp(-((x + 2.85 + Math.sin(z * 0.2) * 1.2) ** 2) / 0.12), Math.exp(-((x + 1.15 + Math.sin(z * 0.2) * 1.2) ** 2) / 0.12)); c = c.map((v) => v * (1 - 0.2 * rut)); }   // tire ruts
      { // toward the open edges (beach / neighbors) the shell yard takes on the terrain's sand tone, so where the sheet dips under
        // the terrain there is no pale-on-tan cut line
        const dE = Math.min(x - x0, z1 - z, OPEN_E ? x1 - x : 99, OPEN_N ? z - z0 : 99) - (n2(x * 0.11, z * 0.13) * 0.5 + 0.5) * 7, f = Math.max(0, Math.min(1, 1 - (dE - 0.5) / 5));
        const SAND = [0.97, 0.84, 0.64]; for (let k = 0; k < 3; k++) c[k] = c[k] + (SAND[k] - c[k]) * f * 0.85; }
      cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
      // ground-continuity: on the open (west, street) sides the sheet sinks under the surrounding ground along a wobbly line,
      // so the yard fades into the terrain instead of ending in a straight raised edge (the drive keeps its level up to the road apron)
      const dEdge = Math.min(x - x0, z1 - z, OPEN_E ? x1 - x : 99, OPEN_N ? z - z0 : 99) - 0.4 - (n2(x * 0.11, z * 0.13) * 0.5 + 0.5) * 7 - (n2(x * 0.5, z * 0.45) * 0.5 + 0.5) * 1.5, keep = Math.min(1, Math.max(0, dEdge / 2));
      const core = Math.max(0, Math.min(1, (7 - Math.abs(x + 2 + Math.sin(z * 0.2) * 1.2)) / 2.5)), sink = (1 - keep) * (1 - core);
      pa.setY(i, yardY(x, z));
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    // keys pass (lead review, Nov 17): the mock-up yard is PALE crushed shell and limestone dust, not the terrain's tan sand; the
    // shell scan carries it, vertex colors add gray-green matted grass, damp dark patches and the ruts. ?keysyard=terrain = old look
    const TERRAIN_YARD = GROUND2 && typeof location !== 'undefined' && /[?&]keysyard=terrain\b/.test(location.search);
    B.geo(TERRAIN_YARD ? (yardMat ||= makeGroundMaterial(globalThis.game?.renderer || null)) : SHELL, g, null, { keepColor: true, uvMul: [(x1 - x0) / 2.6, (z1 - z0) / 2.6], wear: 0.5 }); g.dispose();
    { const cx0 = x0, cx1 = Math.min(x1, L.x1), cz0 = Math.max(z0, L.z0), cz1 = z1; col.box((cx0 + cx1) / 2, -1.5, (cz0 + cz1) / 2, cx1 - cx0, 3, cz1 - cz0, { tag: 'ground', surface: 'gravel' }); }   // not over the open beach edges (the terrain carries those)
  }
  // puddles in the wheel ruts of the drive (the sky and the house mirror in them)
  { const PUD = new THREE.MeshPhysicalMaterial({ color: 0x2b2820, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.5, envMapIntensity: 0.55, clearcoat: 0.4 }); // ground-continuity: muddy rut water, not bright sky-blue decals PUD.userData.uvScale = 1; PUD.name = 'puddle';
    for (const [x, z, a, b, rot] of [[-3.5, 10.2, 1.5, 0.3, 0.12], [1.6, 11.3, 1.9, 0.36, -0.08], [-7.6, 11.4, 1.0, 0.24, 0.3], [5.5, 10.0, 1.1, 0.22, 0.2]]) {
      const sh = new THREE.Shape(), n = 22; for (let i = 0; i <= n; i++) { const t = i / n * 6.283, k = 1 + 0.22 * Math.sin(t * 3 + x) + 0.12 * Math.sin(t * 5 + z); const px = Math.cos(t) * a * k, py = Math.sin(t) * b * k; i ? sh.lineTo(px, py) : sh.moveTo(px, py); }
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); B.geo(PUD, g, M(x, 0.022, z, 0, rot, 0), {}); g.dispose();
      const g2 = new THREE.ShapeGeometry(sh); g2.rotateX(-Math.PI / 2); B.geo(SHELL, g2, M(x, 0.018, z, 0, rot, 0, 1.12, 1, 1.35), { color: [0.56, 0.53, 0.47], uvMul: [0.3, 0.3] }); g2.dispose();   // dark wet rim
    } }
  // carport slab: old broom-finished concrete with a crack line and oil stains
  const SLAB = mat.pbr('scuffed_cement', { rep: 2.2, gain: 2.0, grunge: true });
  for (const [cx, cz, sx, sz] of [[0.6, 0.6, 2.75, 7.4], [3.4, 0.6, 2.75, 7.4], [6.15, 0.6, 2.7, 7.4], [3.4, 6.15, 8.3, 3.6]]) B.box(SLAB, sx - 0.02, 0.1, sz - 0.02, M(cx, 0.0, cz), { color: kit.vary(0xbdb8aa, r, 0.05), wear: 0.9, bevel: 0.012, rand: r });
  // ---------- seawalls ----------
  const SW = mat.concrete({ marine: true });
  const wall = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 4.9), ry = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      B.box(SW, len / n - 0.015, 3.4, 0.3, M(x, 0.1 - 1.7, z, 0, ry, 0), { color: kit.vary(0xc4bfb0, r, 0.06), wear: 1, bevel: 0.01, rand: r });
      if (!(Math.abs(z - P.lot.z0) < 0.5 && x + len / n / 2 > P.dock.x0 - 0.3 && x - len / n / 2 < P.dock.x1 + 0.3)) B.box(SW, len / n - 0.01, 0.16, 0.5, M(x, 0.16, z, 0, ry, 0), { color: kit.vary(0xd0cabb, r, 0.05), wear: 0.8, bevel: 0.02, rand: r }); } // no cap poking up under the dock
    col.box((ax + bx) / 2, -1.2, (az + bz) / 2, len, 2.9, 0.5, { ry, tag: 'seawall' }); };
  if (wallN) wall(L.x0 - 22, L.z0, L.x1 + 0.15, L.z0); if (wallE) wall(L.x1, L.z0 - 0.15, L.x1, L.z1 + 22);
  if (wallN || wallE) { const g = new THREE.PlaneGeometry(400, 400, 1, 1); g.rotateX(-Math.PI / 2); B.geo(mat.pbr('sand_01', { rep: 5, gain: 1.6, grunge: true }), g, M(L.x1 - 60, sea - 1.5, L.z0 + 40), { color: [0.75, 0.82, 0.7], uvMul: [80, 80] }); g.dispose(); }
  // ---------- dock (old plank dock: only when part 06 has no measured waterline) ----------
  if (!P.dock.kit) {
  const Dk = P.dock, W = mat.wood({ marine: true }), WD = mat.wood(), ST = mat.steel(), y = Dk.y;
  const board = (cx, cz, lx) => B.box(WD, lx, 0.04, 0.14, M(cx, y - 0.02 + (r() - 0.5) * 0.004, cz, 0, (r() - 0.5) * 0.004, (r() - 0.5) * 0.008), { grain: 0, color: kit.vary(r() < 0.06 ? 0xb49a70 : 0x8f887c, r, 0.12), wear: 0.4 + r() * 0.5, bevel: 0.005, rand: r });
  for (let z = Dk.z0 + 0.08; z < Dk.z1 - 0.02; z += 0.147) { if (z < Dk.headZ1) board((Dk.headX0 + Dk.headX1) / 2, z, Dk.headX1 - Dk.headX0); else board((Dk.x0 + Dk.x1) / 2, z, Dk.x1 - Dk.x0 + (r() - 0.5) * 0.03); }
  for (const x of [Dk.x0 + 0.1, (Dk.x0 + Dk.x1) / 2, Dk.x1 - 0.1]) B.box(W, 0.07, 0.24, Dk.z1 - Dk.z0, M(x, y - 0.16, (Dk.z0 + Dk.z1) / 2), { grain: 2, color: 0x6f675c, wear: 0.8, bevel: 0.006 });
  for (const z of [Dk.headZ0 + 0.1, Dk.headZ1 - 0.1]) B.box(W, Dk.headX1 - Dk.headX0, 0.24, 0.07, M((Dk.headX0 + Dk.headX1) / 2, y - 0.16, z), { grain: 0, color: 0x6f675c, wear: 0.8, bevel: 0.006 });
  const pile = (x, z, top) => { const rr = 0.13 + r() * 0.03, h = top - (sea - 2.4), lean = (r() - 0.5) * 0.04;
    B.cyl(W, rr * 0.88, rr, h, M(x, top - h / 2, z, lean, r() * 6, lean * 0.6), { seg: 12, hseg: 4, color: kit.vary(0x7d7467, r, 0.12), wear: 1 });
    if (top > y + 0.3) { B.cyl(ST, rr * 0.9 + 0.012, rr * 0.9 + 0.012, 0.012, M(x, top + 0.004, z), { seg: 12, color: 0x9a8f80 }); for (let k = 0; k < 4; k++) B.geo(mat.fabric('wool_boucle', { rep: 0.05 }), new THREE.TorusGeometry(rr + 0.012, 0.014, 6, 16), M(x, top - 0.16 - k * 0.03, z, Math.PI / 2, 0, 0), { color: 0xcdbf9a }); }
    col.cyl(x, y, z, rr + 0.02, top - y + 2.4, { tag: 'pile' }); };
  for (let z = Dk.z1 - 0.5; z > Dk.headZ1; z -= 2.9) { pile(Dk.x0 - 0.1, z, y + (r() > 0.5 ? 0.95 : 0.1)); pile(Dk.x1 + 0.1, z, y + (r() > 0.4 ? 1.0 : 0.1)); }
  for (const x of [Dk.headX0 - 0.1, Dk.headX1 + 0.1]) for (const z of [Dk.headZ0 - 0.1, Dk.headZ1 + 0.1]) pile(x, z, y + 1.05);
  col.box((Dk.x0 + Dk.x1) / 2, y - 0.15, (Dk.z0 + Dk.z1) / 2, Dk.x1 - Dk.x0, 0.3, Dk.z1 - Dk.z0, { tag: 'dock', surface: 'wood' }); col.box((Dk.headX0 + Dk.headX1) / 2, y - 0.15, (Dk.headZ0 + Dk.headZ1) / 2, Dk.headX1 - Dk.headX0, 0.3, Dk.headZ1 - Dk.headZ0, { tag: 'dock', surface: 'wood' });
  // cleats, coiled lines, ladder, light, fish-cleaning station
  const cleat = (x, z, ry) => { B.box(ST, 0.24, 0.022, 0.04, M(x, y + 0.062, z, 0, ry, 0), { color: 0xb5b2a8, bevel: 0.01 }); for (const s of [-1, 1]) B.cyl(ST, 0.014, 0.018, 0.05, M(x + Math.cos(ry) * s * 0.05, y + 0.028, z - Math.sin(ry) * s * 0.05), { color: 0xb5b2a8, seg: 8 }); };
  const coil = (x, z, hex) => { const pts = []; for (let i = 0; i < 90; i++) { const t = i / 90, a = t * 6.283 * 5, rr = 0.07 + t * 0.2; pts.push([x + Math.cos(a) * rr, y + 0.02 + (i % 18) * 0.0004, z + Math.sin(a) * rr]); } pts.push([x + 0.5, y + 0.02, z + 0.2], [x + 0.9, y + 0.03, z + 0.05]); D.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.011, { seg: 5, color: hex, steps: 150 }); };
  for (const z of [-17, -21.5]) { cleat(Dk.x1 - 0.14, z, Math.PI / 2); cleat(Dk.x0 + 0.14, z, Math.PI / 2); } cleat(Dk.headX1 - 0.2, Dk.headZ1 - 0.15, 0); cleat(Dk.headX0 + 0.3, Dk.headZ0 + 0.15, 0);
  coil(Dk.x0 + 0.5, -16.2, 0xd8cfae); coil(Dk.headX0 + 1.0, Dk.headZ0 + 0.8, 0x4f7f8a);
  for (const s of [-1, 1]) B.box(ST, 0.04, 2.3, 0.04, M(Dk.headX1 + 0.03, y - 0.75, Dk.headZ0 + 1.3 + s * 0.2), { color: 0xa9a59a, bevel: 0.008 }); for (let k = 0; k < 6; k++) B.cyl(ST, 0.015, 0.015, 0.4, M(Dk.headX1 + 0.03, y - 0.15 - k * 0.3, Dk.headZ0 + 1.3, Math.PI / 2, 0, 0), { color: 0xa9a59a, seg: 8 });
  { const tx = Dk.headX0 + 0.9, tz = Dk.headZ0 + 0.45; // fish-cleaning table: HDPE top with knife scars, plywood shelf, hose bib
    for (const [dx, dz] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) B.box(WD, 0.085, 0.92, 0.085, M(tx + dx, y + 0.46, tz + dz), { grain: 1, color: kit.vary(0x8f887c, r, 0.1), wear: 0.7, bevel: 0.006, rand: r });
    B.box(mat.plastic(), 1.3, 0.035, 0.7, M(tx, y + 0.94, tz), { color: 0xe9e6dc, bevel: 0.008 }); B.box(WD, 1.2, 0.02, 0.6, M(tx, y + 0.3, tz), { color: 0x8f887c, wear: 0.8, bevel: 0.004 });
    B.box(mat.art('fishtop', 256, 128, (g, w, h) => { g.fillStyle = '#ebe7dc'; g.fillRect(0, 0, w, h); const q = kit.rng(4); for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(120,110,95,${0.15 + q() * 0.3})`; g.lineWidth = 0.6; const x = q() * w, yy = q() * h, a = q() * 3; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + Math.cos(a) * 30 * q(), yy + Math.sin(a) * 30 * q()); g.stroke(); } g.fillStyle = 'rgba(150,60,50,0.18)'; g.beginPath(); g.ellipse(90, 60, 40, 22, 0.3, 0, 7); g.fill(); }), 1.28, 0.004, 0.68, M(tx, y + 0.96, tz), {});
    B.box(mat.plastic(), 0.28, 0.25, 0.28, M(tx + 0.35, y + 0.43, tz), { color: 0xd8d4c8, bevel: 0.02 }); B.cyl(ST, 0.012, 0.012, 0.3, M(tx - 0.5, y + 1.1, tz - 0.3), { color: 0x8f9a8f, seg: 8 }); B.box(mat.steel(), 0.02, 0.004, 0.17, M(tx - 0.1, y + 0.965, tz + 0.1, 0, 0.4, 0), { color: 0xc8c8c4 });
    col.box(tx, y + 0.48, tz, 1.3, 0.96, 0.7, { tag: 'prop' }); }
  { const lx = Dk.x0 - 0.1, lz = Dk.headZ1 + 0.2; B.cyl(WD, 0.05, 0.06, 2.6, M(lx, y + 1.3, lz), { seg: 10, color: 0x7d7467, wear: 0.8 }); B.box(ST, 0.5, 0.03, 0.03, M(lx + 0.24, y + 2.5, lz), { color: 0x8c8a82 });
    B.cyl(mat.metalPaint(), 0.16, 0.05, 0.14, M(lx + 0.46, y + 2.44, lz), { color: 0x3f6f5f, seg: 14 }); B.geo(mat.emissive(0xffe2ae, 2.5, 'dock'), new THREE.SphereGeometry(0.045, 10, 8), M(lx + 0.46, y + 2.38, lz), {});
    const lt = ctx.addLight({ id: 'dock_light', pos: [lx + 0.46, y + 2.3, lz], color: 0xffd9a0, intensity: 55, range: 14, on: false }); ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12; lt.on = t < 6.3 || t > 18.4; }); }
  }
  // ---------- weeds and grass tufts along every edge: footings, lattice base, slab, drive margins, seawall ----------
  { const blades = [], bc = [], q = kit.rng(77); for (let k = 0; k < 9; k++) { const a = q() * 6.283, l = 0.06 + q() * 0.13, w = 0.006 + q() * 0.006, bx = Math.cos(a), bz = Math.sin(a), lean = 0.3 + q() * 0.7, ox = (q() - 0.5) * 0.1, oz = (q() - 0.5) * 0.1;
      blades.push(ox - bz * w, 0, oz + bx * w, ox + bz * w, 0, oz - bx * w, ox + bx * l * lean * 0.5, l * 0.6, oz + bz * l * lean * 0.5, ox - bz * w * 0.6, 0.02, oz + bx * w * 0.6, ox + bx * l * lean * 0.5, l * 0.6, oz + bz * l * lean * 0.5, ox + bx * l * lean, l, oz + bz * l * lean);
      const g0 = 0.16 + q() * 0.1; for (let v = 0; v < 6; v++) { const tip = v === 2 || v >= 4 ? 1.5 : 0.8; bc.push(0.13 * tip * (0.8 + q() * 0.5), g0 * 0.95 * tip, 0.05 * tip); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); g.computeVertexNormals();
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, bumpMap: kit.microTex(), bumpScale: 0.4 }), ms = [], cs = [];
    const put = (x, z, s = 1) => { ms.push(M(x, 0.01, z, 0, q() * 6.283, 0, s * (0.7 + q() * 0.9))); const d = q(); cs.push([0.75 + d * 0.5, 0.8 + d * 0.35, 0.6 + d * 0.5]); };
    const line = (ax, az, bx, bz, n, spread = 0.25, s = 1) => { for (let i = 0; i < n; i++) { const t = q(); put(ax + (bx - ax) * t + (q() - 0.5) * spread, az + (bz - az) * t + (q() - 0.5) * spread, s); } };
    for (const x of P.pileXs) for (const z of P.pileZs) for (let i = 0; i < 7; i++) { const a = q() * 6.283; put(x + Math.cos(a) * (0.36 + q() * 0.2), z + Math.sin(a) * (0.36 + q() * 0.2), 0.9); }
    line(-8.4, 2.95, -3.6, 2.95, 110, 0.3, 1.3); line(-3.5, 3.0, -1.0, 3.0, 40, 0.25); line(-0.8, 8.05, 8.0, 8.05, 120, 0.5, 1.2); line(8.1, 8, 8.1, -3.3, 90, 0.5, 1.1); line(-8.9, 5.4, -8.9, -6.5, 70, 0.5);
    for (const sgn of [-1, 1]) for (let z = 6; z < L.z1 + 15; z += 0.22) { const hw = 5.6 + Math.max(0, z - 14) * 0.5 + Math.sin(z * 0.4) * 0.6; put(-2 + sgn * (hw + 1.2 + q() * q() * 6), z + q() * 0.3, 0.8 + q() * 0.9); }
    line(L.x0 - 20, L.z0 + 0.7, L.x1 - 0.5, L.z0 + 0.7, 260, 0.8, 1.2); line(L.x1 - 0.7, L.z0, L.x1 - 0.7, L.z1 + 15, 300, 0.8, 1.2); line(-13.5, 6.6, -9.5, 6.9, 40, 0.5); line(-12.2, 2.8, -12.2, 4.4, 20, 0.3);
    for (const [wx, wz, wr, wn, ws] of WEEDS) for (let i = 0; i < wn; i++) { const a = q() * 6.283, d = Math.sqrt(q()) * wr; put(wx + Math.cos(a) * d, wz + Math.sin(a) * d, ws * (0.8 + q() * 0.6)); }   // keys pass: hand-placed clumps (yard.data.js WEEDS)
    const im = kit.instances(g, gm, ms, cs, { cast: false }); im.name = 'weeds'; ctx.groups.detail.add(im); }
  if (!P.dock.kit) { ctx.anchors.dock = { pos: new THREE.Vector3((P.dock.x0 + P.dock.x1) / 2, P.dock.y, -22), heading: Math.PI }; ctx.anchors.skiff = { pos: new THREE.Vector3(3.75, sea, -19.5), heading: Math.PI }; }
  ctx.anchors.truck = { pos: new THREE.Vector3(-17, 0, 9.5), heading: 2.7 }; ctx.anchors.bike = { pos: new THREE.Vector3(-13.5, 0, -2.5), heading: 1.2 }; ctx.anchors.kayak = { pos: new THREE.Vector3(-10.5, 0, -11), heading: 0.3 };
}
