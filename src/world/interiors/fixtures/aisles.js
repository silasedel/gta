// r7 big-store fixtures: aisle blocks of long gondolas with end caps and hanging aisle markers, checkout lanes with belts, produce
// tables, magazine racks, tall liquor walls, chest freezers, shopping carts and baskets, pallets and shrink-wrapped stock, glass
// display counters (pawn / gun / jewelry). Same conventions as retail.js: build into ctx.G in the fixture's own frame, add colliders,
// shadows, POIs and items through the stock helpers. Big stores call these per group and `yield` between them.
import * as THREE from 'three';
import { gondola, gondolaGen, checkout } from './retail.js';
import { shelfRun, stack } from '../items/stock.js';
import { FIXTURES as LIGHT } from '../lighting.js';
import { productSize } from '../items/catalog.js';
import { libModel } from '../kit/models.js';

// aisle marker hung from the ceiling: double-sided printed board with the aisle number and its departments
export function aisleSign(ctx, x, z, yCeil, num, cats, o = {}) {
  const { G, M } = ctx, col = o.c || '#1554c0', p = ctx.prints.make(`aisle:${num}:${cats.join('|')}:${col}`, 360, 260, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 86); g.fillStyle = col; g.font = '900 70px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), w / 2, 46);
    g.fillStyle = '#ffffff'; g.font = '700 30px Arial'; cats.slice(0, 4).forEach((c, i) => g.fillText(c.toUpperCase(), w / 2, 118 + i * 38, w - 20)); }, { global: true });
  const y = yCeil - (o.drop ?? 0.75);
  G.at(x, z, o.ry || 0, () => { for (const s of [1, -1]) G.plane(p.mat, 0, y, s * 0.012, 0.9, 0.65, { ry: s > 0 ? 0 : Math.PI, uvRect: p.rect }); G.box(M.flat('#d9dcdf', { metal: 0.6, rough: 0.35 }), 0, y + 0.335, 0, 0.94, 0.03, 0.03); for (const s of [-0.4, 0.4]) G.cyl(M.flat('#c9ccd0', { metal: 0.8 }), s, y + 0.35 + (yCeil - y - 0.35) / 2, 0, 0.002, yCeil - y - 0.35, { seg: 4 }); });
}

// a block of gondolas running along z between z0 and z1 (store frame), centers at xs. plans(i) -> { sides: [a, b], ends: [a, b] }
export function* aisleBlock(ctx, xs, z0, z1, o = {}) {
  const l = z1 - z0, cz = (z0 + z1) / 2; let i = 0;
  for (const x of xs) { const pl = o.plans(i); yield* gondolaGen(ctx, x, cz, Math.PI / 2, { l, h: o.h || 1.65, levels: o.levels || 5, d: o.d || 0.42, sides: pl.sides, ends: pl.ends, rows: o.rows, block: o.block }); i++; yield; }
  if (o.signs) for (let k = 0; k <= xs.length; k++) { if (!o.signs[k]) continue; const ax = k === 0 ? xs[0] - (o.gap ?? 1.0) : k === xs.length ? xs[xs.length - 1] + (o.gap ?? 1.0) : (xs[k - 1] + xs[k]) / 2; if (o.inRoom && !o.inRoom(ax)) continue; aisleSign(ctx, ax, cz, o.yCeil, k + 1, o.signs[k], { c: o.signC, ry: Math.PI / 2 }); }
}

// checkout lane: counter with a rubber belt, divider bars, scanner, bagging well, lane light pole (number), impulse rack on the customer side
export function checkoutLane(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, n = o.num || 1, belt = M.surf('rubber', { c: [22, 22, 24] }), steel = M.flat('#b9bec3', { rough: 0.3, metal: 0.8 }), l = o.l || 2.8, co = checkout(ctx, x, z, ry, { l, top: o.top, front: o.front, impulse: o.impulse, registerSide: 1 });
  G.at(x, z, ry, () => {
    G.box(belt, -l * 0.18, 0.955, 0.04, l * 0.52, 0.012, 0.42); for (const s of [-1, 1]) G.box(steel, -l * 0.18, 0.97, 0.04 + s * 0.22, l * 0.52, 0.03, 0.02);
    G.box(M.flat(o.barC || '#2a6bd8', { rough: 0.4 }), -l * 0.3, 0.98, 0.04, 0.32, 0.03, 0.03, { ry: Math.PI / 2 }); G.box(M.glass({ opacity: 0.4, tint: '#9fd8ff' }), l * 0.12, 0.952, 0.05, 0.28, 0.006, 0.2);
    // lane pole with a lit number
    const ln = ctx.prints.make('lane' + n, 120, 120, (g, w, h) => { g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = o.poleC || '#2ec4ff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 72px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 4); }, { global: true, lit: 1.3, ch: 1 });
    G.cylB(steel, -l / 2 + 0.06, 0.94, -0.28, 0.025, 1.25, { seg: 8 }); for (const s of [1, -1]) G.plane(ln.mat, -l / 2 + 0.06, 2.3, -0.28 + s * 0.03, 0.24, 0.24, { ry: s > 0 ? 0 : Math.PI, uvRect: ln.rect }); G.box(M.flat('#16181c', {}), -l / 2 + 0.06, 2.3, -0.28, 0.26, 0.26, 0.05);
    // bagging carousel at the far end
    G.cylB(steel, l / 2 - 0.25, 0.94, -0.05, 0.02, 0.5, { seg: 6 }); for (let k = 0; k < 3; k++) { const a = k * 2.1; G.box(M.flat('#f2f0ea', { rough: 0.8 }), l / 2 - 0.25 + Math.cos(a) * 0.16, 1.2, -0.05 + Math.sin(a) * 0.16, 0.2, 0.3, 0.004, { ry: a }); }
  });
  return co;
}

// produce table: three-tier angled bins of loose produce (pyramids), price cards on stakes
export function produceTable(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx, l = o.l || 2.4, d = o.d || 1.2, wood = M.surf('wood', { c: o.wood || [120, 84, 52], wear: 0.4 }), pids = o.pids || [];
  G.at(x, z, ry, () => {
    G.boxB(wood, 0, 0, 0, l, 0.62, d); G.boxB(M.flat('#1a1b1e', {}), 0, 0, 0, l - 0.1, 0.08, d - 0.1);
    const bins = Math.max(2, Math.round(l / 0.6)), bw = l / bins; let k = 0;
    for (const s of [1, -1]) { G.push(new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI));
      for (let b = 0; b < bins; b++, k++) { const pid = pids[k % pids.length]; if (!pid) continue; const bx = -l / 2 + (b + 0.5) * bw, sz = productSize(pid), r = sz.w / 2 + 0.002; G.box(wood, bx, 0.62, d / 4, bw - 0.02, 0.02, d / 2 - 0.02, { rx: -0.22 }); G.box(wood, bx - bw / 2 + 0.01, 0.68, d / 4, 0.02, 0.12, d / 2);
        for (let row = 0; row < 3; row++) for (let c = 0; c < Math.floor((bw - 0.04) / (2 * r)); c++) for (let lay = 0; lay < (row === 0 ? 2 : 1); lay++) { if (R.chance(0.08)) continue; const zz = d / 2 - 0.06 - row * 2 * r * 1.05, yy = 0.63 + (d / 2 - zz) * Math.tan(0.22) * 0.9 + lay * r * 1.5; ctx.item(pid, bx - bw / 2 + 0.03 + r + c * 2 * r + (lay ? r : 0), yy, zz, R() * 6.3, { rx: R.jit(0.4), zone: 'produce', row: row + lay }); }
        const t = ctx.prints.tag(pid); G.cyl(M.flat('#16181c', {}), bx, 0.85, d / 2 - 0.02, 0.003, 0.2, { seg: 4 }); G.plane(t.mat, bx, 0.98, d / 2 - 0.018, 0.1, 0.065, { uvRect: t.rect }); }
      ctx.poi('browse', 0, d / 2 + 0.6, Math.PI, { zone: 'produce' }); G.pop(); }
    ctx.solid(-l / 2, 0, -d / 2, l / 2, 0.95, d / 2, { occ: false }); ctx.shadow(0, 0, l + 0.2, d + 0.2);
  });
}

// magazine and paper rack: stepped wire rack with magazines standing on a lip, papers flat at the bottom
export function magRack(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx, l = o.l || 1.2, wire = M.flat('#2a2c30', { rough: 0.4, metal: 0.6 }), pids = o.pids || [];
  G.at(x, z, ry, () => { G.boxB(wire, 0, 0, 0.02, l, 1.5, 0.03);
    for (let k = 0; k < 4; k++) { const y = 0.45 + k * 0.3, zz = 0.12 + (3 - k) * 0.06; G.box(wire, 0, y, zz, l, 0.012, 0.1); G.box(wire, 0, y + 0.04, zz + 0.05, l, 0.06, 0.006);
      for (let u = -l / 2 + 0.12, j = 0; u < l / 2 - 0.1; u += 0.235, j++) { const pid = pids[(k * 5 + j) % pids.length]; for (let n = 0; n < 3; n++) ctx.item(pid, u + R.jit(0.01), y + 0.008, zz + 0.02 - n * 0.012, R.jit(0.04), { rx: -0.2, zone: 'mags', row: n }); } }
    if (o.paper) for (let n = 0; n < 6; n++) ctx.item(o.paper, -l / 4, 0.06 + n * 0.012, 0.25, R.jit(0.1), { rx: -Math.PI / 2, zone: 'mags', row: 5 - n });
    G.boxB(wire, 0, 0, 0.25, l, 0.05, 0.45); ctx.solid(-l / 2, 0, 0, l / 2, 1.5, 0.45, { occ: false }); ctx.shadow(0, 0.2, l + 0.1, 0.6); ctx.poi('browse', 0, 0.9, Math.PI, { zone: 'mags' }); });
}

// tall wall shelving (liquor walls, beauty walls): many levels with a lit header and shelf-edge LED
export function tallWall(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, F = ctx.fam, l = o.l || 3, h = o.h || 2.3, levels = o.levels || 7, d = o.d || 0.32, zone = 'tall' + ctx.pois.length, plan = o.plan || [];
  G.at(x, z, ry, () => { G.boxB(o.back || F.back, 0, 0, 0.015, l, h, 0.03); G.boxB(F.kick, 0, 0, d / 2 + 0.03, l, 0.12, d + 0.02); for (let u = -l / 2; u <= l / 2 + 0.01; u += l / Math.max(1, Math.round(l / 0.92))) G.boxB(F.upright, u, 0, d / 2 + 0.02, 0.03, h, d);
    for (let k = 0; k < levels; k++) { const y = 0.12 + k * (h - 0.35) / levels + (k ? 0.03 : 0); G.box(o.shelf || F.shelf, 0, y - 0.01, 0.035 + d / 2, l - 0.01, 0.02, d); G.box(F.edge, 0, y - 0.016, 0.035 + d + 0.004, l - 0.01, 0.03, 0.008);
      if (plan[k]) shelfRun(ctx, -l / 2 + 0.03, l / 2 - 0.03, y, 0.035 + d, d - 0.02, plan[k], { zone, start: k * 3, rows: o.rows ?? 2, block: o.block ?? 0.3, shade: 0.03 * Math.abs(k - 3), jitter: 0.04 });
      if (o.led && k > 0) LIGHT.led(ctx, [-l / 2 + 0.05, y - 0.03, 0.035 + d - 0.01], [l / 2 - 0.05, y - 0.03, 0.035 + d - 0.01], { color: o.led, k: 0.35, every: 1.2, d: [0, 0.3, 0.95], amb: 0.4 }); }
    if (o.header) { G.plane(o.header.mat, 0, h + 0.17, 0.05, l - 0.1, 0.3, { uvRect: o.header.rect }); }
    ctx.solid(-l / 2, 0, 0, l / 2, h, d + 0.05); ctx.shadow(0, d / 2, l + 0.2, d + 0.4); for (let u = -l / 2 + 0.6; u < l / 2 - 0.3; u += 1.4) ctx.poi('browse', u, d + 0.6, Math.PI, { zone }); });
}

// chest freezer / open bunker with sliding glass lids, frozen boxes inside, LED under the lid rail
export function chestFreezer(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx, l = o.l || 2, d = 0.9, h = 0.86, body = M.flat(o.c || '#f2f2ee', { rough: 0.35 }), pids = o.pids || [];
  G.at(x, z, ry, () => { G.boxB(body, 0, 0.1, 0, l, h - 0.1, d); G.boxB(M.flat('#2a2c30', {}), 0, 0, 0, l - 0.06, 0.1, d - 0.06); G.box(M.flat('#9fb4c4', { rough: 0.5 }), 0, h - 0.18, 0, l - 0.1, 0.01, d - 0.1);
    for (const s of [-1, 1]) G.box(M.glass({ opacity: 0.18, tint: '#dff2ff' }), s * l / 4, h + 0.012, s * 0.01, l / 2 - 0.04, 0.008, d - 0.08); G.box(M.flat('#b9bec3', { metal: 0.8, rough: 0.3 }), 0, h, 0, l, 0.02, 0.02);
    let k = 0; for (let u = -l / 2 + 0.16; u < l / 2 - 0.12; u += 0.3) for (let v = -d / 2 + 0.15; v < d / 2 - 0.1; v += 0.3, k++) { const pid = pids[k % pids.length]; if (!pid || R.chance(0.12)) continue; for (let n = 0; n < 2; n++) ctx.item(pid, u + R.jit(0.02), h - 0.17 + n * (productSize(pid).h + 0.004), v + R.jit(0.02), R.jit(0.3), { zone: 'freezer', row: 1 - n, gain: 0.85 }); }
    LIGHT.led(ctx, [-l / 2 + 0.1, h - 0.02, 0], [l / 2 - 0.1, h - 0.02, 0], { color: '#dff2ff', k: 0.8, every: 1, d: [0, -1, 0] });
    ctx.solid(-l / 2, 0, -d / 2, l / 2, h + 0.03, d / 2, { occ: false }); ctx.shadow(0, 0, l + 0.2, d + 0.2); for (const s of [1, -1]) ctx.poi('browse', 0, s * (d / 2 + 0.55), s > 0 ? Math.PI : 0, { zone: 'freezer' }); });
}

// shopping cart (code-built wire basket on a frame) and a hand basket stack
export function cart(ctx, x, z, ry, o = {}) {
  if (libModel(ctx, 'cart', x, z, ry)) { ctx.G.at(x, z, ry, () => { if (!o.noCol) ctx.solid(-0.31, 0, -0.37, 0.31, 1.0, 0.37, { occ: false }); ctx.shadow(0, 0, 0.66, 0.8); }); return; } // r7: the user's Trolley 2
  const { G, M } = ctx, w = M.flat('#c9ccd0', { metal: 0.85, rough: 0.35 }), red = M.flat(o.c || '#c8102e', { rough: 0.45 }), blk = M.flat('#16181c', {});
  G.at(x, z, ry, () => { const L = 0.85, W = 0.52, y0 = 0.42, H = 0.42;
    for (const s of [-1, 1]) { G.box(w, s * W / 2, y0 + H / 2, 0, 0.012, H, L); G.box(w, s * W / 2 * 0.85, 0.2, -0.02, 0.016, 0.016, L - 0.1); G.cyl(w, s * W / 2 * 0.85, y0 / 2 + 0.03, L / 2 - 0.08, 0.009, y0, { seg: 5 }); G.cyl(w, s * W / 2 * 0.85, y0 / 2 + 0.03, -L / 2 + 0.06, 0.009, y0, { seg: 5 }); }
    for (let k = 0; k < 6; k++) G.box(w, 0, y0 + 0.04 + k * 0.07, L / 2, W, 0.006, 0.006); for (let k = 0; k < 7; k++) G.box(w, -W / 2 + k * W / 6, y0 + H / 2, L / 2, 0.006, H, 0.006); for (let k = 0; k < 6; k++) G.box(w, -W / 2 + k * W / 5, y0 + H / 2, -L / 2, 0.006, H, 0.006, { rx: 0.18 });
    for (let k = 0; k < 8; k++) G.box(w, 0, y0, -L / 2 + k * L / 7, W, 0.006, 0.008); for (let k = 0; k < 6; k++) G.box(w, 0, y0 + H / 2, -L / 2 + k * L / 5, W, 0.006, 0.006, { rx: Math.PI / 2 });
    G.box(red, 0, y0 + H + 0.08, -L / 2 - 0.08, W + 0.04, 0.035, 0.035); G.box(red, 0, y0 + H - 0.02, -L / 2 - 0.02, W, 0.16, 0.012, { rx: 0.3 });
    for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { G.cyl(blk, a * W / 2 * 0.85, 0.06, b * (L / 2 - 0.08), 0.06, 0.03, { rz: Math.PI / 2, seg: 10 }); }
    if (!o.noCol) ctx.solid(-W / 2, 0, -L / 2, W / 2, 0.95, L / 2, { occ: false }); ctx.shadow(0, 0, W + 0.1, L + 0.1); });
}
export function cartCorral(ctx, x, z, ry, n = 4) { for (let i = 0; i < n; i++) cart(ctx, x + Math.sin(ry) * i * 0.3, z + Math.cos(ry) * i * 0.3, ry, { noCol: true }); ctx.G.at(x, z, ry, () => ctx.solid(-0.32, 0, -0.45, 0.32, 1.0, 0.45 + (n - 1) * 0.3)); }
export function basketStack(ctx, x, z, o = {}) { const { G, M } = ctx, c = M.flat(o.c || '#c8102e', { rough: 0.5 }); G.at(x, z, o.ry || 0, () => { for (let k = 0; k < (o.n || 7); k++) { const y = k * 0.045; G.box(c, 0, y + 0.12, 0, 0.44, 0.012, 0.3); for (const s of [-1, 1]) { G.box(c, s * 0.22, y + 0.06, 0, 0.012, 0.12, 0.3, { rz: s * 0.1 }); G.box(c, 0, y + 0.06, s * 0.15, 0.44, 0.12, 0.012, { rx: -s * 0.1 }); } } G.box(M.flat('#16181c', {}), 0, (o.n || 7) * 0.045 + 0.2, 0, 0.012, 0.012, 0.3); ctx.solid(-0.23, 0, -0.16, 0.23, 0.5, 0.16, { occ: false }); ctx.shadow(0, 0, 0.5, 0.36); }); }

// pallet with shrink-wrapped cases (back rooms, floor displays): optional product cases on top
export function pallet(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx, wood = M.surf('wood', { c: [170, 140, 100], wear: 0.7 }), cb = M.surf('cardboard', { wear: 0.5 });
  G.at(x, z, ry, () => { for (let k = 0; k < 5; k++) G.boxB(wood, -0.5 + k * 0.25, 0.1, 0, 0.1, 0.022, 1.2); for (const s of [-0.5, 0, 0.5]) G.boxB(wood, 0, 0, s, 1.0, 0.1, 0.1);
    const lay = o.layers ?? R.int(1, 4); for (let l = 0; l < lay; l++) for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) { if (l === lay - 1 && R.chance(0.3)) continue; G.boxB(cb, -0.25 + i * 0.5 + R.jit(0.01), 0.122 + l * 0.3, -0.4 + j * 0.4 + R.jit(0.01), 0.48, 0.29, 0.38, { ry: R.jit(0.04) }); }
    if (lay && o.wrap !== false) G.boxB(M.glass({ opacity: 0.22, tint: '#e8eef2', rough: 0.25 }), 0, 0.12, 0, 1.01, lay * 0.3 - 0.02, 1.21);
    if (o.pid) stack(ctx, o.pid, 0, 0.122 + lay * 0.3, 0, 2, 3, 3, { zone: 'pallet' });
    ctx.solid(-0.5, 0, -0.6, 0.5, 0.12 + Math.max(lay, o.pid ? 1 : 0) * 0.3, 0.6, { occ: false }); ctx.shadow(0, 0, 1.2, 1.4); });
}

// glass display counter (pawn jewelry, watches, phones; gun counter pistols): lit inside, sliding doors on the staff side.
// o: { l, fill(G, M, x0, x1, yDeck, zMid) to place the displayed goods, top: material, base: material }
export function displayCase(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, l = o.l || 1.8, d = 0.6, h = 0.98, base = o.base || M.flat('#16181c', { rough: 0.5 }), glass = M.glass({ opacity: 0.12, tint: '#e8f4f8', rough: 0.03 }), deck = o.deck || M.surf('velvet', { c: o.deckC || [30, 30, 34] });
  G.at(x, z, ry, () => { G.boxB(base, 0, 0, 0, l, 0.5, d); G.box(M.flat('#0b0b0c', {}), 0, 0.04, d / 2 - 0.02, l - 0.04, 0.08, 0.01); G.boxB(deck, 0, 0.5, 0, l - 0.04, 0.02, d - 0.04);
    G.box(glass, 0, 0.5 + (h - 0.5) / 2, d / 2 - 0.01, l, h - 0.5, 0.01); G.box(glass, 0, h, 0, l, 0.012, d); for (const s of [-1, 1]) G.box(glass, s * (l / 2 - 0.005), 0.5 + (h - 0.5) / 2, 0, 0.01, h - 0.5, d);
    const fr = M.flat(o.frame || '#b9bec3', { metal: 0.8, rough: 0.3 }); for (const s of [-1, 1]) { G.box(fr, s * l / 2, h / 2 + 0.25, d / 2, 0.02, h - 0.5, 0.02); G.box(fr, s * l / 2, h / 2 + 0.25, -d / 2, 0.02, h - 0.5, 0.02); } G.box(fr, 0, h, d / 2, l, 0.02, 0.02); G.box(fr, 0, h, -d / 2, l, 0.02, 0.02);
    G.box(M.glass({ opacity: 0.25, tint: '#d8e4e8' }), 0, 0.5 + (h - 0.5) / 2, -d / 2 + 0.01, l, h - 0.5, 0.01);
    LIGHT.led(ctx, [-l / 2 + 0.05, h - 0.03, 0.15], [l / 2 - 0.05, h - 0.03, 0.15], { color: o.led || '#fff4e0', k: 0.9, every: 0.9, d: [0, -1, 0], amb: 0.5 });
    if (o.fill) o.fill(-l / 2 + 0.08, l / 2 - 0.08, 0.52, 0);
    ctx.solid(-l / 2, 0, -d / 2, l / 2, h, d / 2, { occ: false }); ctx.shadow(0, 0, l + 0.2, d + 0.3); ctx.poi('browse', 0, d / 2 + 0.6, Math.PI, { zone: 'case' }); });
}

// security bars / wire mesh partition behind a counter (pawn, liquor, gun counters)
export function cagePartition(ctx, x0, x1, z, h, o = {}) { const { G, M } = ctx, st = M.flat(o.c || '#3a3d42', { metal: 0.6, rough: 0.45 }); for (let x = x0; x <= x1 + 0.001; x += 0.12) G.box(st, x, h / 2, z, 0.012, h, 0.012); for (const y of [0.05, h / 2, h - 0.02]) G.box(st, (x0 + x1) / 2, y, z, x1 - x0, 0.03, 0.03); }

// hanging fluorescent fixtures in long continuous rows (big-box look), aligned over aisles. Returns the light count.
export function lightRows(ctx, room, xs, o = {}) { const y = room.ceilY, len = room.d - (o.margin ?? 1.0), seg = o.seg || 2.44, n = Math.max(1, Math.floor(len / seg)), R = ctx.R; let c = 0;
  for (const x of xs) for (let i = 0; i < n; i++) { const z = room.cz - len / 2 + (i + 0.5) * len / n, dead = R.chance(0.02 + ctx.profile.wear * 0.12) ? 1 : 0; LIGHT.strip(ctx, x, y, z, { lamp: o.lamp || ctx.profile.lamp, k: (o.k ?? 6.2) * R.range(0.92, 1.06), l: seg - 0.02, hang: o.hang ?? 0, dead, bare: false }); c++; } return c; }
