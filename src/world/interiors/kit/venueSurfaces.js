// Interior art kit: premium surfaces for venues (clubs, bars, restaurants, lounges). Registered into the shared SURFACES table so
// every MatSet.surf(name, opts) call can use them: stoneTile, marble, velvet, tufted, fluted, plaster, walnut, brass.
// All procedural (canvas), drawn once per color set and cached. opts.size picks the canvas resolution (default per surface).
import { SURFACES } from './surfaces.js';
import { shade, clamp } from './util.js';

// ---- small value-noise / fBm on a wrapping lattice (tileable)
function makeNoise(R, P = 64) {
  const g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = R();
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  // fbm over [0,1)^2 with `base` lattice cells per tile (must divide P to wrap)
  return (u, v, base = 4, oct = 5) => { let s = 0, amp = 0.5, f = base, t = 0; for (let o = 0; o < oct; o++) { s += amp * n(u * f, v * f); t += amp; amp *= 0.5; f *= 2; } return s / t; };
}
const img = (c, S) => c.createImageData(S, S);

function drawStone(A, H, G, S, R, o) { // large-format polished stone, running bond (tiles o.tw x o.th meters inside an m x m repeat)
  const m = o.m || 2.4, tw = o.tw || 1.2, th = o.th || 0.6, nx = Math.round(m / tw), ny = Math.round(m / th), base = o.c || [38, 34, 40], vein = o.c2 || [92, 84, 96];
  const fb = makeNoise(R), fb2 = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S), grout = Math.max(2, Math.round(S * 0.004 / m * 2.4));
  const tiles = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tiles.push({ k: R.jit(0.09), r: 0.07 + R() * 0.08, hue: R.jit(0.05) });
  // low-frequency fields on a coarse grid (bilinear upsampled): the expensive part runs on 1/16 of the pixels
  const C = 256, F1 = new Float32Array(C * C), F2 = new Float32Array(C * C), F3 = new Float32Array(C * C);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const u = x / C, v = y / C, a = fb(u, v, 4, 5); F1[y * C + x] = a; F2[y * C + x] = fb2(u + a * 0.4, v * 0.6, 2, 4); F3[y * C + x] = fb2(u * 1.7 + 0.3, v * 1.7, 3, 4); }
  const bil = (F, u, v) => { const X = u * C - 0.5, Y = v * C - 0.5, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, xa = (x0 + C) % C, xb = (x0 + 1) % C, ya = ((y0 + C) % C) * C, yb = ((y0 + 1) % C) * C;
    return (F[ya + xa] * (1 - fx) + F[ya + xb] * fx) * (1 - fy) + (F[yb + xa] * (1 - fx) + F[yb + xb] * fx) * fy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, j = Math.floor(v * ny), off = (j % 2) * 0.5, iu = u * nx + off, i = Math.floor(iu) % nx, T = tiles[j * nx + i];
    const fu = iu - Math.floor(iu), fv = v * ny - j, gx = Math.min(fu, 1 - fu) * S / nx, gy = Math.min(fv, 1 - fv) * S / ny, inG = gx < grout / 2 || gy < grout / 2;
    const n1 = bil(F1, u, v), n2 = bil(F2, u, v), cloud = n1 * 0.7 + n2 * 0.3;
    const vn = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 1.4 + n2 * 2.6 + i * 0.37) * Math.PI)), 26) * (0.35 + 0.65 * n1); // faint mineral veins
    let r = base[0], g = base[1], b = base[2]; const k = 1 + T.k + (cloud - 0.5) * 0.5;
    r = r * k * (1 + T.hue) + (vein[0] - r) * vn * 0.28; g = g * k + (vein[1] - g) * vn * 0.28; b = b * k * (1 - T.hue) + (vein[2] - b) * vn * 0.28;
    const p = (y * S + x) * 4;
    if (inG) { a.data[p] = 16; a.data[p + 1] = 14; a.data[p + 2] = 16; h.data[p] = h.data[p + 1] = h.data[p + 2] = 70; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = 235; }
    else { a.data[p] = clamp(r, 0, 255); a.data[p + 1] = clamp(g, 0, 255); a.data[p + 2] = clamp(b, 0, 255);
      h.data[p] = h.data[p + 1] = h.data[p + 2] = Math.min(gx, gy) < grout ? 112 : 128;
      const smudge = bil(F3, u, v), rr = (T.r + Math.max(0, smudge - 0.55) * 0.7 + vn * 0.04 + (o.wear || 0) * Math.max(0, n2 - 0.6)) * 255; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = clamp(rr, 10, 255); }
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawMarble(A, H, G, S, R, o) { // veined marble: o.c ground, o.c2 vein color, o.c3 secondary cloud
  const base = o.c || [24, 22, 26], vein = o.c2 || [196, 188, 200], cl = o.c3 || shade(base, 0.12), fb = makeNoise(R), fb2 = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, w = fb(u, v, 4, 6), w2 = fb2(u, v, 2, 5);
    const t = (u * 2 + v + w * 3.2 + w2 * 1.5) * Math.PI, main = Math.pow(1 - Math.abs(Math.sin(t)), 34) * 0.55, thin = Math.pow(1 - Math.abs(Math.sin(t * 3.3 + w2 * 6)), 90) * 0.35;
    const vv = clamp(main * (0.4 + 0.8 * w2) + thin * w), cloud = clamp((w2 - 0.35) * 1.6);
    const p = (y * S + x) * 4; for (let c = 0; c < 3; c++) a.data[p + c] = clamp(base[c] + (cl[c] - base[c]) * cloud * 0.8 + (vein[c] - base[c]) * vv, 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = 128 - vv * 6; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = clamp((0.12 + vv * 0.1 + Math.max(0, w - 0.6) * 0.3) * 255, 0, 255);
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawVelvet(A, H, G, S, R, o) { // channel-tufted velvet: vertical channels (o.n per repeat) with sheen falloff into the seams
  const base = o.c || [70, 20, 60], n = o.n || 6, fb = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, f = (u * n) % 1, pr = Math.sin(f * Math.PI), seam = pr < 0.12, nap = fb(u, v * 0.25, 8, 4);
    const k = (0.55 + 0.45 * Math.pow(pr, 0.6)) * (0.92 + nap * 0.16), p = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) a.data[p + c] = clamp(base[c] * (seam ? 0.45 : k), 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = 40 + 200 * Math.pow(pr, 0.5); gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = 200 + nap * 40;
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawTufted(A, H, G, S, R, o) { // diamond (capitonné) tufting with buttons: o.n diamonds across the repeat
  const base = o.c || [60, 18, 52], n = o.n || 4, fb = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * n, v = y / S * n, du = u - Math.round(u), dv = v - Math.round(v), d1 = Math.abs(du) + Math.abs(dv); // distance to the nearest button (diamond metric)
    const cu = u - Math.floor(u) - 0.5, cv = v - Math.floor(v) - 0.5, dc = Math.abs(cu) + Math.abs(cv), pillow = clamp(Math.min(d1, 1 - dc) * 2.2), fold = Math.min(Math.abs(Math.abs(du) - Math.abs(dv)) < 0.03 ? 1 : 0, 1) * clamp(1 - d1 * 3);
    const button = d1 < 0.055, nap = fb(x / S, y / S, 8, 4), p = (y * S + x) * 4, k = (0.5 + 0.5 * Math.pow(pillow, 0.7)) * (0.92 + nap * 0.16) * (1 - fold * 0.4);
    for (let c = 0; c < 3; c++) a.data[p + c] = clamp(button ? base[c] * 0.6 + 12 : base[c] * k, 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = button ? 150 : 30 + 210 * Math.pow(pillow, 0.6) - fold * 40; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = button ? 90 : 205 + nap * 40;
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawFluted(A, H, G, S, R, o) { // vertical fluted (reeded) panel: o.n flutes per repeat, satin lacquer
  const base = o.c || [40, 30, 44], n = o.n || 12, fb = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, f = (u * n) % 1, pr = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)), groove = pr < 0.25, nn = fb(u, y / S, 4, 3), p = (y * S + x) * 4, k = (0.62 + 0.38 * pr) * (0.96 + nn * 0.08);
    for (let c = 0; c < 3; c++) a.data[p + c] = clamp(base[c] * (groove ? 0.5 : k), 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = 255 * pr; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = (o.gloss ? 70 : 120) + nn * 30;
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawPlaster(A, H, G, S, R, o) { // smooth troweled plaster / venetian finish
  const base = o.c || [36, 28, 40], fb = makeNoise(R), fb2 = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, n1 = fb(u, v, 2, 5), n2 = fb2(u * 1.3, v, 8, 3), k = 0.88 + n1 * 0.22 + (n2 - 0.5) * 0.06, p = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) a.data[p + c] = clamp(base[c] * k, 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = 120 + n2 * 16; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = (o.gloss ? 110 : 190) + (n1 - 0.5) * 70;
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawWalnut(A, H, G, S, R, o) { // quarter-sawn walnut veneer (grain runs along v)
  const base = o.c || [70, 44, 30], fb = makeNoise(R), fb2 = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, w = fb(u * 0.5, v, 4, 4), ring = 0.5 + 0.5 * Math.sin((u * 46 + w * 2.5 + fb2(u, v * 0.2, 4, 3) * 1.5) * Math.PI), fleck = Math.pow(fb2(u * 4, v * 0.5, 8, 2), 6) * 1.5;
    const k = 0.86 + ring * 0.16 + fleck * 0.12, p = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) a.data[p + c] = clamp(base[c] * k, 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = 120 + ring * 14; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = (o.gloss ? 70 : 140) + ring * 30;
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

function drawBrass(A, H, G, S, R, o) { // brushed metal (brass / bronze / chrome via o.c)
  const base = o.c || [200, 160, 90], fb = makeNoise(R), a = img(A, S), h = img(H, S), gr = img(G, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, br = fb(u * 0.05, v, 64, 2), k = 0.9 + br * 0.2, p = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) a.data[p + c] = clamp(base[c] * k, 0, 255);
    h.data[p] = h.data[p + 1] = h.data[p + 2] = 120 + br * 20; gr.data[p] = gr.data[p + 1] = gr.data[p + 2] = 60 + br * 60 + (o.wear || 0) * 40;
    a.data[p + 3] = h.data[p + 3] = gr.data[p + 3] = 255;
  }
  A.putImageData(a, 0, 0); H.putImageData(h, 0, 0); G.putImageData(gr, 0, 0);
}

// canvas size per surface (square): big repeats get more pixels. opts.size overrides.
Object.assign(SURFACES, {
  stoneTile: { m: 2.4, rough: 1, bump: 1.2, size: 1024, draw: drawStone },
  marble: { m: 1.6, rough: 1, bump: 1, size: 512, draw: drawMarble },
  velvet: { m: 0.9, rough: 1, bump: 4, size: 256, draw: drawVelvet },
  tufted: { m: 0.8, rough: 1, bump: 5, size: 512, draw: drawTufted },
  fluted: { m: 0.6, rough: 1, bump: 5, size: 256, draw: drawFluted },
  plaster: { m: 2.5, rough: 1, bump: 1.2, size: 512, draw: drawPlaster },
  walnut: { m: 1.2, rough: 1, bump: 1, size: 512, draw: drawWalnut },
  brass: { m: 0.8, rough: 1, metal: 1, bump: 0.6, size: 256, draw: drawBrass },
});
export const VENUE_SURFACES = ['stoneTile', 'marble', 'velvet', 'tufted', 'fluted', 'plaster', 'walnut', 'brass'];
