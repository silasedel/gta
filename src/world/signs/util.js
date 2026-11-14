// KEYS-SIGN track: shared 2D helpers for every sign painter in this folder (no three.js import here).
// Seeded randomness, value noise, canvas creation, a Euclidean distance transform (for carved bevels),
// separable blur on float fields, and height-field -> normal-map conversion.

// ---------------------------------------------------------------- seeded random
export function hashStr(s) {
  let h = 2166136261 >>> 0; s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed >>> 0 : hashStr(seed)) || 1;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.gauss = () => (f() + f() + f() + f() - 2) / 2; // roughly -1..1, bell shaped
  return f;
}
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

// integer hash -> 0..1
export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// 2D value noise, 0..1
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, s = 0, gain = 0.5, lac = 2.03) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17); norm += a; a *= gain; f *= lac; }
  return sum / norm;
}

// ---------------------------------------------------------------- color
export function hexRgb(hex) {
  if (typeof hex === 'number') return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  let h = String(hex).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
export function rgba(c, a) { const [r, g, b] = hexRgb(c); return `rgba(${r},${g},${b},${a})`; }
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
export function toHsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function shift(hex, dh = 0, ds = 0, dl = 0) { const [h, s, l] = toHsl(hex); return hsl(h + dh, clamp(s + ds), clamp(l + dl)); }
// jitter a color a little (hue degrees, saturation, lightness) with a random source
export const jitter = (hex, R, dh = 4, ds = 0.05, dl = 0.05) => shift(hex, R.gauss() * dh, R.gauss() * ds, R.gauss() * dl);

// ---------------------------------------------------------------- canvas
export function makeCanvas(w, h = w) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('no canvas available');
}
export const ctx2d = (c, opts) => c.getContext('2d', opts || { willReadFrequently: false });

// ---------------------------------------------------------------- distance transform (Felzenszwalb & Huttenlocher)
// inside(i) -> true where the shape is. Returns Float32Array of the distance (pixels) from each inside pixel to the
// nearest outside pixel (0 outside). Border of the image counts as outside when edgeOutside is true.
export function distanceInside(mask, w, h, edgeOutside = true) {
  const INF = 1e20, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? INF : 0;
  if (edgeOutside) { for (let x = 0; x < w; x++) { g[x] = 0; g[(h - 1) * w + x] = 0; } for (let y = 0; y < h; y++) { g[y * w] = 0; g[y * w + w - 1] = 0; } }
  const edt1 = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      do { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); } while (s <= z[k] && --k >= 0);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1(h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) f[x] = g[o + x]; edt1(w); for (let x = 0; x < w; x++) g[o + x] = Math.sqrt(d[x]); }
  return g;
}
// alpha (or red) channel of a canvas as a Uint8 mask (1 where value > threshold)
export function maskFromCanvas(canvas, channel = 3, thr = 127) {
  const w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0, j = channel; i < w * h; i++, j += 4) m[i] = d[j] > thr ? 1 : 0;
  return m;
}
// one channel of a canvas as floats 0..1
export function channelFromCanvas(canvas, channel = 0) {
  const w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
  for (let i = 0, j = channel; i < w * h; i++, j += 4) m[i] = d[j] / 255;
  return m;
}

// separable box blur on a float field, `passes` times (3 passes is close to a Gaussian)
export function boxBlur(src, w, h, r, passes = 2) {
  r = Math.max(1, Math.round(r));
  let a = src, b = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { // horizontal
      const o = y * w; let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[o + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) { b[o + x] = acc * inv; acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
    }
    if (a === src) a = new Float32Array(w * h);
    for (let x = 0; x < w; x++) { // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = acc * inv; acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; }
    }
  }
  return a;
}

// height field (float, any range) -> normal map ImageData-style Uint8ClampedArray (RGBA), OpenGL convention (+Y up)
export function normalsFromHeight(hf, w, h, strength = 1, out = null, wrap = false) {
  const d = out || new Uint8ClampedArray(w * h * 4);
  const at = wrap
    ? (x, y) => hf[((y + h) % h) * w + ((x + w) % w)]
    : (x, y) => hf[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
    const il = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx * il * 0.5 + 0.5) * 255; d[i + 1] = (dy * il * 0.5 + 0.5) * 255; d[i + 2] = (il * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  return d;
}
// convenience: grayscale canvas -> normal-map canvas
export function normalCanvasFromHeightCanvas(hc, strength = 2, wrap = true) {
  const w = hc.width, h = hc.height, hf = channelFromCanvas(hc, 0);
  const out = makeCanvas(w, h), c = out.getContext('2d'), id = c.createImageData(w, h);
  normalsFromHeight(hf, w, h, strength, id.data, wrap); c.putImageData(id, 0, 0);
  return out;
}

// trace the outer contour of a mask at reduced resolution -> polygon [[x, y], ...] in mask pixel units (largest blob)
export function traceOutline(mask, w, h, step = 4) {
  const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2, g = new Uint8Array(gw * gh);
  for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) { const x = Math.min(w - 1, (i - 1) * step + (step >> 1)), y = Math.min(h - 1, (j - 1) * step + (step >> 1)); g[j * gw + i] = mask[y * w + x] ? 1 : 0; }
  // find start: first filled cell scanning rows
  let sx = -1, sy = -1;
  for (let j = 0; j < gh && sx < 0; j++) for (let i = 0; i < gw; i++) if (g[j * gw + i]) { sx = i; sy = j; break; }
  if (sx < 0) return [];
  // Moore-neighbor boundary following on cell corners (square tracing along edges between filled/empty cells)
  const filled = (i, j) => i >= 0 && j >= 0 && i < gw && j < gh && g[j * gw + i] === 1;
  const pts = []; let x = sx, y = sy, dir = 0; // corner coordinates; start at top-left corner of start cell heading east
  const x0 = x, y0 = y; let guard = 0;
  do {
    pts.push([(x - 1) * step, (y - 1) * step]);
    // cells around corner (x, y): NW (x-1,y-1) NE (x,y-1) SW (x-1,y) SE (x,y)
    const nw = filled(x - 1, y - 1), ne = filled(x, y - 1), sw = filled(x - 1, y), se = filled(x, y);
    // keep the filled region on the right-hand side while walking
    if (dir === 0) dir = ne ? 3 : se ? 0 : 1;          // east: prefer turn left (north) if NE filled
    else if (dir === 1) dir = se ? 0 : sw ? 1 : 2;     // south
    else if (dir === 2) dir = sw ? 1 : nw ? 2 : 3;     // west
    else dir = nw ? 2 : ne ? 3 : 0;                    // north
    if (dir === 0) x++; else if (dir === 1) y++; else if (dir === 2) x--; else y--;
  } while ((x !== x0 || y !== y0) && ++guard < 4e6);
  return simplifyPoly(pts, step * 0.75);
}
// Douglas-Peucker on a closed polygon
export function simplifyPoly(pts, eps) {
  if (pts.length < 8) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; const mid = pts.length >> 1; keep[mid] = 1;
  const rec = (a, b) => {
    let md = 0, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b % pts.length], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; rec(a, mi); rec(mi, b); }
  };
  rec(0, mid); rec(mid, pts.length);
  return pts.filter((_, i) => keep[i]);
}
