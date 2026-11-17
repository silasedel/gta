// Vegetation textures, all procedural (canvas), built once per page and cached.
//   barkAtlas(): 2048 x 1024, 8 columns (256 px each, seamless around the trunk, tiling along it):
//     0 coconut (irregular ring scars + fine vertical fissures), 1 royal (smooth pale gray, faint rings),
//     2 sabal boot-jack (crisscross leaf bases), 3 date (diamond leaf-base scars), 4 queen (close rings, lichen),
//     5 royal crownshaft (glossy green), 6 fiber (frond stubs, petioles, dead rachis), 7 tree bark (furrows, plates).
//     Albedo + normal + roughness, all derived from one height field per column.
//   leafAtlas(): 2048 x 3072, 4 x 6 cells of 512 px, alpha-cut (see CELL below for the layout).
import * as THREE from 'three';

export const BARK = { coconut: 0, royal: 1, sabal: 2, date: 3, queen: 4, shaft: 5, fiber: 6, tree: 7, COLS: 8 };
export const CELL = { coconut: 0, plume: 1, date: 2, dead: 3, fan: 4, seagrape: 5, hibiscus: 6, croton: 7, bougainvillea: 8, ixora: 9, hedge: 10, grass: 11, pine: 12, oak: 13, moss: 14, mangrove: 15, litter: 16, cypress: 17, fern: 18, deadfan: 19, poinciana: 20, COLS: 4, ROWS: 6 };
// opaque swatches painted in the corners of the fan cell (fan disc is round, corners are free): [u0, v0, u1, v1] in cell units
export const SWATCH = { husk: [0.01, 0.89, 0.1, 0.99], fruit: [0.9, 0.89, 0.99, 0.99], petiole: [0.01, 0.01, 0.1, 0.11], dates: [0.9, 0.01, 0.99, 0.11] };

let _bark = null, _leaf = null;
const mkRng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

// periodic value noise (period px, py in lattice units) + fbm
function hash2(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function pnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a, p) => ((a % p) + p) % p, x0 = m(xi, px), x1 = m(xi + 1, px), y0 = m(yi, py), y1 = m(yi + 1, py);
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, px, py, s, oct = 4) { let t = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { t += a * pnoise(x * f, y * f, px * f, py * f, s + o * 17); a *= 0.5; f *= 2; } return t / (1 - Math.pow(0.5, oct)); }
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x), smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// one bark column: returns { h (0..1 height), c [r,g,b] 0..1, r (roughness 0..1) } at u,v in [0,1)
function barkSample(col, u, v) {
  const s = col * 101 + 7;
  if (col === 0) { // coconut: uneven ring scars every ~9 cm, fine vertical fissures, gray weathering
    const n = fbm(u * 8, v * 12, 8, 12, s), fis = fbm(u * 48, v * 3, 48, 3, s + 3, 3);
    const rings = 13, ry = v * rings + Math.sin(u * 6.283 * 2 + Math.floor(v * rings) * 1.7) * 0.18 + Math.sin(u * 6.283 + Math.floor(v * rings) * 2.9) * 0.1 + (n - 0.5) * 0.5, f = ry - Math.floor(ry);
    const groove = smooth(0.0, 0.08, f) * (1 - smooth(0.82, 1.0, f)), lip = smooth(0.06, 0.16, f) * (1 - smooth(0.16, 0.3, f));
    const h = 0.25 + 0.55 * groove + 0.12 * lip - 0.22 * smooth(0.55, 0.8, fis) + 0.1 * n;
    const gray = smooth(0.45, 0.75, fbm(u * 3, v * 2, 3, 2, s + 9)), base = [0.47, 0.41, 0.34], g2 = [0.6, 0.58, 0.54], lich = smooth(0.68, 0.78, fbm(u * 7, v * 9, 7, 9, s + 21)) * smooth(0.3, 0.6, n);
    const k = 0.75 + 0.35 * h + 0.08 * (n - 0.5);
    const c = [mix(base[0], g2[0], gray) * k, mix(base[1], g2[1], gray) * k, mix(base[2], g2[2], gray) * k];
    if (lich > 0) { c[0] = mix(c[0], 0.66, lich * 0.7); c[1] = mix(c[1], 0.68, lich * 0.7); c[2] = mix(c[2], 0.55, lich * 0.7); } // pale lichen crusts
    if (groove < 0.5) { const dk = 0.72 + 0.12 * fis; c[0] *= dk; c[1] *= dk * 0.96; c[2] *= dk * 0.93; }
    return { h, c, r: 0.82 + 0.15 * (1 - h) };
  }
  if (col === 1) { // royal: smooth concrete-gray, faint rings, dark rain streaks
    const n = fbm(u * 6, v * 10, 6, 10, s), streak = fbm(u * 24, v * 1, 24, 1, s + 4, 3);
    const ry = v * 7 + (n - 0.5) * 0.2, f = ry - Math.floor(ry), ring = smooth(0.0, 0.03, f) * (1 - smooth(0.97, 1.0, f));
    const h = 0.6 + 0.1 * n - 0.07 * (1 - ring) + 0.05 * fbm(u * 64, v * 64, 64, 64, s + 2, 2);
    const k = 0.92 + 0.12 * n - 0.18 * smooth(0.6, 0.85, streak) - 0.05 * (1 - ring);
    return { h, c: [0.72 * k, 0.7 * k, 0.66 * k], r: 0.62 + 0.2 * n };
  }
  if (col === 2) { // sabal boot-jack: diagonal lattice of split leaf bases (the "boots")
    const a = u * 6 + v * 5, b = u * 6 - v * 5, ia = Math.floor(a), ib = Math.floor(b), fa = a - ia, fb = b - ib;
    const cell = hash2(((ia % 6) + 6) % 6, ((ib % 6) + 6) % 6, s), n = fbm(u * 40, v * 8, 40, 8, s + 5, 3);
    const edge = Math.min(fa, 1 - fa, fb, 1 - fb), split = Math.abs(fa - fb) < 0.06 && fa + fb > 1.0 ? 1 : 0;
    const raise = smooth(0.0, 0.12, edge) * (1 - split * 0.8);
    const h = 0.15 + 0.7 * raise * (0.75 + 0.25 * cell) + 0.12 * n * raise;
    const k = (0.55 + 0.45 * raise) * (0.85 + 0.3 * cell) * (0.9 + 0.2 * n);
    return { h, c: [0.44 * k, 0.37 * k, 0.29 * k], r: 0.9 };
  }
  if (col === 3) { // date: rhombic leaf-base scars, fibrous
    const a = u * 7 + v * 9, b = u * 7 - v * 9, fa = a - Math.floor(a), fb = b - Math.floor(b);
    const cell = hash2(((Math.floor(a) % 7) + 7) % 7, ((Math.floor(b) % 7) + 7) % 7, s), n = fbm(u * 50, v * 12, 50, 12, s + 2, 3);
    const edge = Math.min(fa, 1 - fa, fb, 1 - fb), raise = smooth(0.02, 0.16, edge), dome = 1 - Math.hypot(fa - 0.5, fb - 0.5) * 1.2;
    const h = 0.12 + 0.55 * raise + 0.25 * dome * raise + 0.1 * n;
    const k = (0.5 + 0.5 * raise) * (0.85 + 0.3 * cell) * (0.88 + 0.24 * n);
    return { h, c: [0.5 * k, 0.38 * k, 0.26 * k], r: 0.88 };
  }
  if (col === 4) { // queen: close rings, gray with green lichen
    const n = fbm(u * 6, v * 16, 6, 16, s), li = smooth(0.62, 0.8, fbm(u * 10, v * 10, 10, 10, s + 8));
    const ry = v * 18 + (n - 0.5) * 0.4, f = ry - Math.floor(ry), ring = smooth(0.0, 0.1, f) * (1 - smooth(0.85, 1.0, f));
    const h = 0.45 + 0.25 * ring + 0.12 * n;
    const k = 0.86 + 0.16 * ring + 0.1 * (n - 0.5);
    return { h, c: [mix(0.6, 0.55, li) * k, mix(0.58, 0.62, li) * k, mix(0.54, 0.45, li) * k], r: 0.78 };
  }
  if (col === 5) { // crownshaft: muted green-grey, faint vertical striations, waxy bloom patches
    const n = fbm(u * 60, v * 2, 60, 2, s, 3), bl = smooth(0.55, 0.8, fbm(u * 4, v * 3, 4, 3, s + 1));
    const h = 0.5 + 0.08 * n, k = 0.85 + 0.2 * n;
    return { h, c: [mix(0.4, 0.5, bl) * k, mix(0.46, 0.53, bl) * k, mix(0.37, 0.45, bl) * k], r: 0.5 + 0.2 * bl }; // muted green-grey with a waxy bloom
  }
  if (col === 6) { // fiber: brown frond bases, coarse vertical fibers with mesh
    const n = fbm(u * 90, v * 4, 90, 4, s, 3), m = fbm(u * 20, v * 20, 20, 20, s + 3, 3);
    const h = 0.3 + 0.5 * n + 0.2 * m, k = 0.6 + 0.6 * n;
    return { h, c: [0.5 * k, 0.38 * k, 0.24 * k], r: 0.95 };
  }
  // 7 tree bark: deep vertical furrows, broken into plates (tinted per species by vertex color)
  const w = fbm(u * 4, v * 3, 4, 3, s + 11, 2), x = u * 9 + (w - 0.5) * 1.2, fx = x - Math.floor(x);
  const ridge = 1 - Math.abs(fx - 0.5) * 2, cross = fbm(u * 9, v * 14, 9, 14, s + 2, 3), n = fbm(u * 70, v * 70, 70, 70, s + 4, 2);
  const plate = smooth(0.15, 0.5, ridge) * (0.7 + 0.3 * smooth(0.35, 0.6, cross));
  const h = 0.1 + 0.75 * plate + 0.12 * n, k = 0.55 + 0.55 * plate + 0.1 * n;
  return { h, c: [0.48 * k, 0.43 * k, 0.38 * k], r: 0.92 };
}

export function barkAtlas() {
  if (_bark) return _bark;
  const W = 2048, H = 1024, CW = W / BARK.COLS;
  const hgt = new Float32Array(W * H), cc = document.createElement('canvas'); cc.width = W; cc.height = H;
  const cx = cc.getContext('2d'), cid = cx.createImageData(W, H), rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  const rx = rc.getContext('2d'), rid = rx.createImageData(W, H);
  for (let col = 0; col < BARK.COLS; col++) for (let y = 0; y < H; y++) for (let xx = 0; xx < CW; xx++) {
    const S = barkSample(col, xx / CW, y / H), i = y * W + col * CW + xx;
    hgt[i] = S.h; const o = i * 4;
    cid.data[o] = Math.min(255, S.c[0] * 255); cid.data[o + 1] = Math.min(255, S.c[1] * 255); cid.data[o + 2] = Math.min(255, S.c[2] * 255); cid.data[o + 3] = 255;
    rid.data[o] = 0; rid.data[o + 1] = S.r * 255; rid.data[o + 2] = 0; rid.data[o + 3] = 255;
  }
  cx.putImageData(cid, 0, 0); rx.putImageData(rid, 0, 0);
  // normal map from the height field (wraps inside each column horizontally, along the whole height vertically)
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H; const nx = nc.getContext('2d'), nid = nx.createImageData(W, H);
  for (let col = 0; col < BARK.COLS; col++) for (let y = 0; y < H; y++) for (let xx = 0; xx < CW; xx++) {
    const at = (dx, dy) => hgt[((y + dy + H) % H) * W + col * CW + ((xx + dx + CW) % CW)];
    const gx = (at(1, 0) - at(-1, 0)) * 6, gy = (at(0, 1) - at(0, -1)) * 6, l = Math.hypot(gx, gy, 1), o = (y * W + col * CW + xx) * 4;
    nid.data[o] = (-gx / l * 0.5 + 0.5) * 255; nid.data[o + 1] = (gy / l * 0.5 + 0.5) * 255; nid.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; nid.data[o + 3] = 255;
  }
  nx.putImageData(nid, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  _bark = { map: tex(cc, true), normalMap: tex(nc, false), roughnessMap: tex(rc, false), canvas: cc };
  return _bark;
}

// ---------------- leaf atlas ----------------
function leafCells(x, r) {
  const S = 512;
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // a lanceolate leaflet from (x0,y0) at angle a, length L, half-width w, with midrib and optional torn tip
  const leaflet = (x0, y0, a, L, w, col, rib, curl = 0, torn = 0) => {
    x.save(); x.translate(x0, y0); x.rotate(a);
    const L2 = L * (1 - torn);
    const g = x.createLinearGradient(0, 0, L2, 0); g.addColorStop(0, col[0]); g.addColorStop(0.6, col[1]); g.addColorStop(1, col[2]);
    x.fillStyle = g; x.beginPath(); x.moveTo(0, -w * 0.3);
    x.quadraticCurveTo(L2 * 0.45, -w * 1.15 + curl, L2, curl * 1.6 + (torn ? -w * 0.4 : 0));
    if (torn) x.lineTo(L2 * 0.97, curl * 1.6 + w * 0.3);
    x.quadraticCurveTo(L2 * 0.45, w * 1.0 + curl, 0, w * 0.3); x.closePath(); x.fill();
    if (rib) { x.strokeStyle = rib; x.lineWidth = Math.max(1, w * 0.18); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L2 * 0.45, curl * 0.9, L2 * 0.92, curl * 1.5); x.stroke(); }
    x.restore();
  };
  // a broad leaf (ovate) centered stem at (x0,y0), pointing a
  const broad = (x0, y0, a, L, w, fill, vein, opts = {}) => {
    x.save(); x.translate(x0, y0); x.rotate(a);
    x.fillStyle = fill; x.beginPath(); x.moveTo(0, 0);
    if (opts.round) { x.ellipse(L * 0.5, 0, L * 0.5, w, 0, Math.PI, -Math.PI); }
    else { x.bezierCurveTo(L * 0.25, -w * 1.3, L * 0.8, -w * 0.9, L, 0); x.bezierCurveTo(L * 0.8, w * 0.9, L * 0.25, w * 1.3, 0, 0); }
    x.fill();
    if (opts.serrate) { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1; x.stroke(); }
    if (opts.shine) { const g = x.createLinearGradient(0, -w, 0, w); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fill(); }
    if (vein) { x.strokeStyle = vein; x.lineWidth = Math.max(1, w * 0.08); x.beginPath(); x.moveTo(0, 0); x.lineTo(L * 0.95, 0); x.stroke();
      x.lineWidth = Math.max(0.6, w * 0.04); for (let k = 1; k < 6; k++) { const t = k / 6.5; for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(L * t, 0); x.quadraticCurveTo(L * (t + 0.06), sg * w * 0.5, L * (t + 0.12), sg * w * 0.8 * Math.sin(Math.PI * Math.min(1, t + 0.1))); x.stroke(); } } }
    if (opts.spots) for (let k = 0; k < opts.spots; k++) { x.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 30},20,${0.5 + r() * 0.4})`; x.beginPath(); x.arc(L * (0.2 + r() * 0.7), (r() - 0.5) * w, 1.5 + r() * w * 0.12, 0, 7); x.fill(); }
    if (opts.hole && r() < opts.hole) { x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(L * (0.3 + r() * 0.5), (r() - 0.5) * w, w * (0.1 + r() * 0.2), 0, 7); x.fill(); x.globalCompositeOperation = 'source-over'; }
    x.restore();
  };
  const twig = (x0, y0, x1, y1, w, col = '#5a4630') => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 30, (y0 + y1) / 2 + (r() - 0.5) * 30, x1, y1); x.stroke(); };
  const cellOrigin = (i) => [(i % 4) * S, Math.floor(i / 4) * S];

  // pinnate frond half-strips: x = distance from rachis (0..512), y = along the rachis (0 base .. 512 tip)
  const pinnate = (cell, o) => {
    const [ox, oy] = cellOrigin(cell); x.save(); x.beginPath(); x.rect(ox, oy, S, S); x.clip(); x.translate(ox, oy);
    for (let i = 0; i < o.n; i++) {
      const v = 0.03 + (i + r() * 0.6) / o.n * 0.95, prof = Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + v * 0.86)), 0.8) * (1 - 0.35 * v);
      const L = (o.len * prof * (0.72 + r() * 0.36)) * S, a = o.ang + (r() - 0.5) * o.jit, light = o.l + (r() - 0.5) * 8 + (v > 0.85 ? 4 : 0);
      const tipHue = r() < o.brown ? 38 : o.h - 6, torn = r() < o.torn ? 0.15 + r() * 0.4 : 0;
      leaflet(6, v * S, a, L, o.w * (0.8 + r() * 0.4) * (1 - v * 0.4), [hsl(o.h + 4, o.s, light - 6), hsl(o.h, o.s, light), hsl(tipHue, o.s - 6, light + 2)], hsl(o.h - 10, o.s - 15, light + 14, 0.7), (r() - 0.5) * o.curl, torn);
      if (o.double && r() < 0.8) leaflet(6, v * S + 3, a + 0.35 + r() * 0.2, L * 0.85, o.w * 0.8, [hsl(o.h + 4, o.s, light - 10), hsl(o.h, o.s, light - 4), hsl(o.h - 4, o.s, light + 2)], null, (r() - 0.5) * o.curl, 0);
    }
    x.fillStyle = o.rachis; x.fillRect(0, 0, 9, S); x.fillStyle = 'rgba(255,255,230,0.25)'; x.fillRect(2, 0, 2, S);
    x.restore();
  };
  pinnate(CELL.coconut, { n: 80, len: 0.95, ang: 0.42, jit: 0.14, w: 12, h: 84, s: 40, l: 29, brown: 0.18, torn: 0.18, curl: 26, rachis: '#a9a45a' });
  pinnate(CELL.plume, { n: 96, len: 0.95, ang: 0.5, jit: 0.4, w: 8.5, h: 96, s: 40, l: 25, brown: 0.08, torn: 0.08, curl: 40, rachis: '#8d9b52', double: true });
  pinnate(CELL.date, { n: 60, len: 0.85, ang: 0.6, jit: 0.15, w: 9, h: 130, s: 22, l: 40, brown: 0.12, torn: 0.05, curl: 6, rachis: '#a4a476' });
  pinnate(CELL.dead, { n: 46, len: 0.75, ang: 0.3, jit: 0.5, w: 9, h: 34, s: 42, l: 46, brown: 1, torn: 0.55, curl: 50, rachis: '#8a6a42' });
  { // dead frond: darken irregularly, holes
    const [ox, oy] = cellOrigin(CELL.dead); x.save(); x.translate(ox, oy); x.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${50 + r() * 40},${35 + r() * 25},20,${0.15 + r() * 0.3})`; x.beginPath(); x.ellipse(r() * S, r() * S, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7); x.fill(); }
    x.globalCompositeOperation = 'source-over'; x.restore();
  }
  // fan leaf (costapalmate) disc + swatches in the corners
  const fan = (cell, o) => {
    const [ox, oy] = cellOrigin(cell); x.save(); x.translate(ox + S / 2, oy + S / 2);
    const N = o.n, R0 = 236;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, da = Math.PI * 2 / N, split = 0.45 + r() * 0.25, Rk = R0 * (0.9 + r() * 0.1);
      const l = o.l + (r() - 0.5) * 8 + (i % 2 ? 3 : -3);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, Rk); g.addColorStop(0, hsl(o.h + 5, o.s, l - 8)); g.addColorStop(0.7, hsl(o.h, o.s, l)); g.addColorStop(1, hsl(r() < o.brown ? 36 : o.h - 8, o.s - 8, l + 8));
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 0);
      x.lineTo(Math.cos(a - da * 0.5) * Rk * split, Math.sin(a - da * 0.5) * Rk * split);
      x.lineTo(Math.cos(a - da * 0.12) * Rk, Math.sin(a - da * 0.12) * Rk); x.lineTo(Math.cos(a) * Rk * (split + 0.06), Math.sin(a) * Rk * (split + 0.06));
      x.lineTo(Math.cos(a + da * 0.12) * Rk * 0.97, Math.sin(a + da * 0.12) * Rk * 0.97); x.lineTo(Math.cos(a + da * 0.5) * Rk * split, Math.sin(a + da * 0.5) * Rk * split); x.closePath(); x.fill();
      x.strokeStyle = hsl(o.h, o.s - 10, l + 12, 0.5); x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * Rk * 0.95, Math.sin(a) * Rk * 0.95); x.stroke();
      if (o.threads && r() < 0.6) { x.strokeStyle = hsl(40, 25, 70, 0.8); x.lineWidth = 1; x.beginPath(); const sx = Math.cos(a + da * 0.5) * Rk * split, sy = Math.sin(a + da * 0.5) * Rk * split; x.moveTo(sx, sy); x.quadraticCurveTo(sx * 1.2 + (r() - 0.5) * 20, sy * 1.2 + (r() - 0.5) * 20, sx * 1.4, sy * 1.4); x.stroke(); }
    }
    x.fillStyle = hsl(o.h - 20, 30, 40); x.beginPath(); x.arc(0, 0, 12, 0, 7); x.fill(); // hastula
    x.restore();
  };
  fan(CELL.fan, { n: 44, h: 95, s: 40, l: 32, brown: 0.12, threads: true });
  fan(CELL.deadfan, { n: 40, h: 34, s: 38, l: 42, brown: 1, threads: true });
  { const [ox, oy] = cellOrigin(CELL.deadfan); x.save(); x.translate(ox, oy); x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 30; i++) { x.beginPath(); x.ellipse(256 + (r() - 0.5) * 420, 256 + (r() - 0.5) * 420, 6 + r() * 30, 3 + r() * 10, r() * 3, 0, 7); x.fill(); } x.restore(); }
  { // swatches: coconut husk, orange fruit, petiole, date clusters (opaque)
    const [ox, oy] = cellOrigin(CELL.fan), sw = (k, paint) => { const q = SWATCH[k], X = ox + q[0] * S, Y = oy + q[1] * S, w = (q[2] - q[0]) * S, h = (q[3] - q[1]) * S; x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip(); paint(X, Y, w, h); x.restore(); };
    sw('husk', (X, Y, w, h) => { const g = x.createLinearGradient(X, Y, X + w, Y + h); g.addColorStop(0, '#6e8a2c'); g.addColorStop(0.5, '#8c8a34'); g.addColorStop(1, '#6a5028'); x.fillStyle = g; x.fillRect(X, Y, w, h); for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(${60 + r() * 60},${50 + r() * 40},20,0.4)`; x.fillRect(X + r() * w, Y + r() * h, 1 + r() * 3, 1 + r() * 2); } });
    sw('fruit', (X, Y, w, h) => { x.fillStyle = '#d07a1a'; x.fillRect(X, Y, w, h); for (let i = 0; i < 60; i++) { x.fillStyle = `hsla(${25 + r() * 20},85%,${40 + r() * 25}%,0.6)`; x.beginPath(); x.arc(X + r() * w, Y + r() * h, 2 + r() * 4, 0, 7); x.fill(); } });
    sw('petiole', (X, Y, w, h) => { const g = x.createLinearGradient(X, Y, X + w, Y); g.addColorStop(0, '#6f7a3a'); g.addColorStop(0.5, '#a8a660'); g.addColorStop(1, '#6a7038'); x.fillStyle = g; x.fillRect(X, Y, w, h); x.fillStyle = 'rgba(80,60,30,0.35)'; for (let i = 0; i < 12; i++) x.fillRect(X + r() * w, Y, 1, h); });
    sw('dates', (X, Y, w, h) => { x.fillStyle = '#a8561c'; x.fillRect(X, Y, w, h); for (let i = 0; i < 50; i++) { x.fillStyle = `hsla(${18 + r() * 25},80%,${30 + r() * 25}%,0.8)`; x.beginPath(); x.ellipse(X + r() * w, Y + r() * h, 2, 3, r() * 3, 0, 7); x.fill(); } });
  }
  // shrub cluster cards: leaves radiate from a twig hub, filling the cell with an uneven dome silhouette
  const cluster = (cell, o) => {
    const [ox, oy] = cellOrigin(cell); x.save(); x.beginPath(); x.rect(ox, oy, S, S); x.clip(); x.translate(ox, oy);
    for (let k = 0; k < (o.twigs ?? 6); k++) twig(256 + (r() - 0.5) * 40, 512, 60 + r() * 392, 80 + r() * 300, 2 + r() * 4, o.twigCol);
    for (let i = 0; i < o.n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.9, cx = o.fill ? 6 + r() * 500 : 256 + Math.cos(a) * d * 230, cy = o.fill ? 6 + r() * 500 : 270 + Math.sin(a) * d * 210;
      if (o.envelope && Math.hypot((cx - 256) / 240, (cy - 270) / 220) > 1) continue;
      const depth = 0.5 + 0.5 * (1 - d), lit = (cy < 220 ? 6 : 0) + depth * 10;
      o.leaf(cx, cy, r() * 6.28, depth, lit);
    }
    if (o.after) o.after();
    x.restore();
  };
  cluster(CELL.seagrape, { n: 70, twigCol: '#7a3a2a', leaf: (cx, cy, a, d, lit) => broad(cx, cy, a, 60 + r() * 40, 34 + r() * 18, hsl(90 + r() * 25, 40 + r() * 15, 22 + lit + r() * 8), r() < 0.6 ? 'rgba(170,40,40,0.55)' : 'rgba(220,220,160,0.4)', { round: true, spots: (r() * 4) | 0, hole: 0.2, shine: true }) });
  cluster(CELL.hibiscus, { n: 150, twigCol: '#4e3f2a', leaf: (cx, cy, a, d, lit) => broad(cx, cy, a, 44 + r() * 20, 18 + r() * 6, hsl(105 + r() * 15, 55, 16 + lit + r() * 6), 'rgba(160,200,120,0.4)', { serrate: true, shine: true, spots: r() < 0.2 ? 2 : 0 }),
    after: () => { for (let i = 0; i < 9; i++) { const cx = 70 + r() * 372, cy = 70 + r() * 340, hue = [355, 5, 340, 20, 350][(r() * 5) | 0], R = 22 + r() * 12; for (let p = 0; p < 5; p++) { const a = p * 1.2566 + r() * 0.2; x.fillStyle = hsl(hue, 85, 46 + r() * 10); x.beginPath(); x.ellipse(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, R * 0.62, R * 0.45, a, 0, 7); x.fill(); x.strokeStyle = hsl(hue, 80, 32, 0.6); x.lineWidth = 1; x.stroke(); } x.fillStyle = hsl(hue, 80, 22); x.beginPath(); x.arc(cx, cy, R * 0.22, 0, 7); x.fill(); x.strokeStyle = '#f2d24a'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + R * 0.7, cy - R * 0.5); x.stroke(); } } });
  cluster(CELL.croton, { n: 95, twigCol: '#5a4a30', leaf: (cx, cy, a, d, lit) => { const base = [[95, 50, 22], [50, 85, 45], [12, 75, 38], [30, 85, 42], [355, 60, 28]][(r() * 5) | 0]; broad(cx, cy, a, 55 + r() * 30, 14 + r() * 10, hsl(base[0], base[1], base[2] + lit * 0.6), r() < 0.7 ? 'rgba(250,210,60,0.85)' : 'rgba(230,60,30,0.7)', { shine: true }); if (r() < 0.5) { x.fillStyle = hsl(50, 90, 55, 0.7); for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(cx + (r() - 0.5) * 40, cy + (r() - 0.5) * 40, 2 + r() * 3, 0, 7); x.fill(); } } } });
  cluster(CELL.bougainvillea, { n: 240, twigCol: '#4a3a28', leaf: (cx, cy, a, d, lit) => { if (r() < 0.45) broad(cx, cy, a, 22 + r() * 10, 10 + r() * 4, hsl(100 + r() * 15, 45, 20 + lit + r() * 6), 'rgba(170,200,110,0.4)'); else { const hue = r() < 0.75 ? 318 + r() * 14 : 345; for (let p = 0; p < 3; p++) { const aa = a + p * 2.09; x.fillStyle = hsl(hue, 78 + r() * 12, 44 + r() * 14 + lit * 0.3); x.beginPath(); x.ellipse(cx + Math.cos(aa) * 7, cy + Math.sin(aa) * 7, 9, 6.5, aa, 0, 7); x.fill(); x.strokeStyle = hsl(hue, 60, 30, 0.4); x.lineWidth = 0.8; x.stroke(); } x.fillStyle = '#f6f0d8'; x.fillRect(cx - 1, cy - 1, 2, 2); } } });
  cluster(CELL.ixora, { n: 170, twigCol: '#4a3a28', leaf: (cx, cy, a, d, lit) => broad(cx, cy, a, 40 + r() * 14, 11 + r() * 4, hsl(115 + r() * 15, 50, 14 + lit + r() * 5), 'rgba(140,190,110,0.4)', { shine: true }),
    after: () => { for (let i = 0; i < 13; i++) { const cx = 60 + r() * 392, cy = 60 + r() * 340, hue = r() < 0.7 ? 6 + r() * 10 : 28, R = 26 + r() * 10; for (let k = 0; k < 34; k++) { const a = r() * 6.28, d2 = Math.sqrt(r()) * R, fx = cx + Math.cos(a) * d2, fy = cy + Math.sin(a) * d2 * 0.8; x.fillStyle = hsl(hue, 90, 42 + r() * 16); for (let p = 0; p < 4; p++) { x.beginPath(); x.ellipse(fx + Math.cos(p * 1.57) * 3, fy + Math.sin(p * 1.57) * 3, 3.2, 1.8, p * 1.57, 0, 7); x.fill(); } } } } });
  cluster(CELL.hedge, { n: 1500, twigs: 0, fill: true, twigCol: '#3a3020', leaf: (cx, cy, a, d, lit) => broad(cx, cy, a, 14 + r() * 8, 5 + r() * 3, hsl(95 + r() * 25, 45 + r() * 15, 18 + lit * 0.9 + r() * 8), null), after: () => { /* sparse brown leaves */ for (let i = 0; i < 60; i++) broad(40 + r() * 432, 40 + r() * 432, r() * 6.28, 14, 6, hsl(38, 45, 38), null); } });
  { // grass: left half ornamental fountain grass with plumes, right half sawgrass (stiff, serrated, tan tips)
    const [ox, oy] = cellOrigin(CELL.grass); x.save(); x.translate(ox, oy);
    for (let i = 0; i < 110; i++) { const bx = 128 + (r() - 0.5) * 60, lean = (r() - 0.5) * 300, top = 30 + r() * 200, g = x.createLinearGradient(0, 512, 0, top); g.addColorStop(0, hsl(85, 35, 18)); g.addColorStop(0.6, hsl(78 + r() * 15, 40, 36)); g.addColorStop(1, hsl(55, 40, 58)); x.strokeStyle = g; x.lineWidth = 1.5 + r() * 2.5; x.beginPath(); x.moveTo(bx, 512); x.quadraticCurveTo(bx + lean * 0.2, (512 + top) / 2, Math.max(4, Math.min(252, bx + lean * 0.55)), top); x.stroke(); }
    for (let i = 0; i < 14; i++) { const bx = 128 + (r() - 0.5) * 140, top = 20 + r() * 80, lean = (r() - 0.5) * 100; for (let k = 0; k < 40; k++) { x.fillStyle = hsl(20 + r() * 20, 30 + r() * 20, 62 + r() * 15, 0.85); x.beginPath(); x.ellipse(Math.max(6, Math.min(250, bx + lean * (0.3 + k / 60))) + (r() - 0.5) * 10, top + k * 3.2, 2, 6, 0.4 + lean * 0.003, 0, 7); x.fill(); } }
    for (let i = 0; i < 70; i++) { const bx = 384 + (r() - 0.5) * 80, lean = (r() - 0.5) * 200, top = 10 + r() * 140, g = x.createLinearGradient(0, 512, 0, top); g.addColorStop(0, hsl(80, 30, 22)); g.addColorStop(0.5, hsl(72, 38, 38)); g.addColorStop(1, hsl(45, 45, 56)); x.fillStyle = g; const tx2 = Math.max(260, Math.min(508, bx + lean * 0.6)), w = 3 + r() * 3; x.beginPath(); x.moveTo(bx - w, 512); x.quadraticCurveTo(bx + lean * 0.25, 300, tx2, top); x.quadraticCurveTo(bx + lean * 0.25 + w, 300, bx + w, 512); x.fill(); }
    x.restore();
  }
  cluster(CELL.pine, { n: 46, twigCol: '#6a4a30', twigs: 7, leaf: (cx, cy, a, d, lit) => { for (let k = 0; k < 26; k++) { const aa = a + (r() - 0.5) * 1.6, L = 50 + r() * 50; x.strokeStyle = hsl(95 + r() * 20, 40, 20 + lit + r() * 10); x.lineWidth = 1.3; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(aa) * L * 0.5, cy + Math.sin(aa) * L * 0.5 - 6, cx + Math.cos(aa) * L, cy + Math.sin(aa) * L); x.stroke(); } if (r() < 0.06) { x.fillStyle = '#7a5530'; x.beginPath(); x.ellipse(cx, cy + 8, 9, 15, 0, 0, 7); x.fill(); } } });
  cluster(CELL.oak, { n: 420, twigCol: '#3e3428', twigs: 9, envelope: true, leaf: (cx, cy, a, d, lit) => broad(cx, cy, a, 16 + r() * 8, 6 + r() * 2.5, hsl(85 + r() * 25, 30 + r() * 15, 14 + lit + r() * 8), 'rgba(160,170,110,0.35)', { shine: r() < 0.3 }) });
  { // spanish moss: gray-green hanging curly strands
    const [ox, oy] = cellOrigin(CELL.moss); x.save(); x.translate(ox, oy);
    for (let i = 0; i < 120; i++) { let px = 30 + r() * 452, py = r() * 30; const L = 150 + r() * 330 * (1 - Math.abs(px - 256) / 300); x.strokeStyle = hsl(80 + r() * 30, 10 + r() * 10, 50 + r() * 18, 0.85); x.lineWidth = 1 + r() * 1.8; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 16; k++) { px += (r() - 0.5) * 12; py += L / 16; x.lineTo(px, py); } x.stroke(); }
    x.restore();
  }
  cluster(CELL.mangrove, { n: 130, twigCol: '#6a4a3a', leaf: (cx, cy, a, d, lit) => broad(cx, cy, a, 36 + r() * 16, 14 + r() * 5, hsl(85 + r() * 18, 50, 22 + lit + r() * 6), 'rgba(200,210,120,0.45)', { shine: true }) });
  cluster(CELL.litter, { n: 160, twigs: 10, twigCol: '#5a4430', leaf: (cx, cy, a, d, lit) => { const k = r(); if (k < 0.35) broad(cx, cy, a, 30 + r() * 26, 14 + r() * 8, hsl(30 + r() * 15, 40 + r() * 20, 30 + r() * 20), 'rgba(80,50,20,0.4)', { round: r() < 0.5 }); else if (k < 0.55) broad(cx, cy, a, 16, 6, hsl(45, 30, 40), null); else if (k < 0.62) leaflet(cx, cy, a, 80, 4, [hsl(35, 40, 40), hsl(38, 40, 50), hsl(40, 40, 58)], null, 10); } });
  cluster(CELL.cypress, { n: 60, twigCol: '#6a4a38', leaf: (cx, cy, a, d, lit) => { const L = 60 + r() * 40, ca = Math.cos(a), sa = Math.sin(a); x.strokeStyle = '#6a5a3a'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + ca * L, cy + sa * L); x.stroke(); for (let k = 0; k < 22; k++) { const t = k / 22, px = cx + ca * L * t, py = cy + sa * L * t; for (const sg of [-1, 1]) { x.strokeStyle = hsl(90 + r() * 15, 40, 26 + lit + r() * 8); x.lineWidth = 1.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px - sa * sg * 9 + ca * 3, py + ca * sg * 9 + sa * 3); x.stroke(); } } } });
  // royal poinciana (flamboyant): feathery bipinnate leaves under clusters of scarlet-orange spoon-petal flowers
  cluster(CELL.poinciana, { n: 300, twigCol: '#4a3a2a', twigs: 8, leaf: (cx, cy, a, d, lit) => {
    if (r() < 0.32) { const L = 50 + r() * 40, ca = Math.cos(a), sa = Math.sin(a); x.fillStyle = hsl(92 + r() * 22, 50, 22 + lit + r() * 8);
      for (let k = 0; k < 14; k++) { const t = k / 14, px = cx + ca * L * t, py = cy + sa * L * t; for (const sg of [-1, 1]) { x.beginPath(); x.ellipse(px - sa * sg * 5, py + ca * sg * 5, 4, 1.8, a + sg * 1.2, 0, 7); x.fill(); } } }
    else { const hue = r() < 0.8 ? 356 + r() * 10 : 12 + r() * 8, R = 7 + r() * 5; for (let p = 0; p < 5; p++) { const aa = a + p * 1.2566; x.fillStyle = hsl(hue % 360, 88 + r() * 10, 42 + r() * 12 + lit * 0.3); x.beginPath(); x.ellipse(cx + Math.cos(aa) * R * 0.7, cy + Math.sin(aa) * R * 0.7, R * 0.75, R * 0.5, aa, 0, 7); x.fill(); }
      if (r() < 0.3) { x.fillStyle = hsl(48, 70, 82); x.fillRect(cx - 1.5, cy - 1.5, 3, 3); } } } });
  { // fern / bromeliad fill (used for understory and palm skirts)
    cluster(CELL.fern, { n: 18, twigs: 0, leaf: (cx, cy, a, d, lit) => { const L = 120 + r() * 90, ca = Math.cos(a), sa = Math.sin(a); for (let k = 0; k < 26; k++) { const t = k / 26, px = 256 + ca * L * t, py = 300 + sa * L * t; for (const sg of [-1, 1]) leaflet(px, py, a + sg * 1.2, 26 * (1 - t * 0.7), 4, [hsl(100, 50, 20 + lit), hsl(95, 50, 28 + lit), hsl(90, 45, 34 + lit)], null, 3); } } });
  }
}

export function leafAtlas() {
  if (_leaf) return _leaf;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512 * CELL.ROWS; const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height); leafCells(x, mkRng(2468));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  _leaf = { map: t, canvas: c };
  return _leaf;
}

// atlas UV helpers (flipY: canvas top = v 1)
export function leafUV(cell, u, v) { const cx = cell % CELL.COLS, cy = Math.floor(cell / CELL.COLS); return [(cx + u) / CELL.COLS, 1 - (cy + v) / CELL.ROWS]; }
export function barkU(col, u) { return (col + 0.004 + u * 0.992) / BARK.COLS; }
