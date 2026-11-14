// Shared helpers for the design system (DESIGN-SYSTEM track). No three.js import here: data and 2D drawing only,
// so the brand and product data can also be checked in Node.

// ---------------------------------------------------------------- seeded random
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function toSeed(seed) { return typeof seed === 'number' ? (seed >>> 0) || 1 : hashStr(seed ?? 'x') || 1; }
// mulberry32: small, fast, good enough for layout and variation
export function rng(seed) {
  let a = toSeed(seed);
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.shuffle = (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return f;
}

// ---------------------------------------------------------------- color
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function hexToRgb(hex) {
  if (typeof hex === 'number') return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const hexNum = (hex) => { const [r, g, b] = hexToRgb(hex); return (r << 16) | (g << 8) | b; };
export function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export function rgba(c, a) { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${a})`; }
export function luminance(c) { const [r, g, b] = hexToRgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
// the more readable of two inks on a background
export const inkOn = (bg, light = '#ffffff', dark = '#111111') => (contrast(bg, light) >= contrast(bg, dark) ? light : dark);
export function hsl(h, s, l) { // h 0..360, s/l 0..1 -> hex
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
export function toHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function shiftHsl(hex, dh = 0, ds = 0, dl = 0) { const [h, s, l] = toHsl(hex); return hsl(h + dh, clamp(s + ds), clamp(l + dl)); }

// ---------------------------------------------------------------- canvas
export const hasDOM = typeof document !== 'undefined';
export function makeCanvas(w, h = w) {
  if (!hasDOM) throw new Error('design: canvas drawing needs a browser');
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c;
}
export function ctx2d(c, opts) { const g = c.getContext('2d', opts); g.imageSmoothingQuality = 'high'; return g; }

// Fit text into a width by shrinking the font; returns the px size used. `font` is a function px -> css font string.
export function fitText(g, text, maxW, px, font, minPx = 6) {
  let p = px; g.font = font(p);
  let w = g.measureText(text).width;
  if (w > maxW) { p = Math.max(minPx, Math.floor(p * maxW / w)); g.font = font(p); w = g.measureText(text).width; while (w > maxW && p > minPx) { p -= 1; g.font = font(p); w = g.measureText(text).width; } }
  return p;
}
// Text with letter spacing (em units), honoring textAlign left/center/right. Returns the drawn width.
export function measureSpaced(g, text, tracking = 0) {
  if (!tracking) return g.measureText(text).width;
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1] || 16);
  let w = 0; for (const ch of text) w += g.measureText(ch).width + tracking * px; return w - tracking * px;
}
export function drawSpaced(g, text, x, y, tracking = 0, stroke = false) {
  if (!tracking) { stroke ? g.strokeText(text, x, y) : g.fillText(text, x, y); return g.measureText(text).width; }
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1] || 16);
  const total = measureSpaced(g, text, tracking); const align = g.textAlign;
  let cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  g.textAlign = 'left';
  for (const ch of text) { stroke ? g.strokeText(ch, cx, y) : g.fillText(ch, cx, y); cx += g.measureText(ch).width + tracking * px; }
  g.textAlign = align; return total;
}
// Word-wrap into lines no wider than maxW.
export function wrapText(g, text, maxW) {
  const out = []; for (const para of String(text).split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); }
  return out;
}
export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
export function polygon(g, cx, cy, r, n, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; i ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); }
export function star(g, cx, cy, r, n = 5, inner = 0.45, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r * inner : r; i ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); }
// Film-grain style speckle over a region (print texture, wear).
export function speckle(g, x, y, w, h, count, seed, alpha = 0.06, light = false) {
  const r = rng(seed); for (let i = 0; i < count; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${r() * alpha})`; g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
}
// A deterministic EAN-13 style barcode (not a real registered code: prefix 999 is never issued).
export function barcode(g, x, y, w, h, seed, ink = '#111', paper = '#fff') {
  const r = rng(seed); g.fillStyle = paper; g.fillRect(x, y, w, h);
  const digits = '999' + Array.from({ length: 9 }, () => r.int(0, 9)).join('');
  const quiet = w * 0.08, bw = (w - quiet * 2) / 95; let cx = x + quiet; g.fillStyle = ink;
  const bars = []; bars.push(1, 0, 1); for (let i = 0; i < 42; i++) bars.push(r() < 0.5 ? 1 : 0); bars.push(0, 1, 0, 1, 0); for (let i = 0; i < 42; i++) bars.push(r() < 0.5 ? 1 : 0); bars.push(1, 0, 1);
  for (let i = 0; i < bars.length; i++) { const guard = i < 3 || (i >= 45 && i < 50) || i >= 92; if (bars[i]) g.fillRect(cx, y + h * 0.06, bw + 0.3, h * (guard ? 0.86 : 0.74)); cx += bw; }
  g.font = `${Math.max(5, Math.round(h * 0.16))}px "Menlo","Courier New",monospace`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(digits.slice(0, 1) + ' ' + digits.slice(1, 7) + ' ' + digits.slice(7), x + w / 2, y + h * 0.99);
  return digits;
}
export const money = (v) => (v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : '$' + (Math.round(v * 100) / 100).toFixed(2));
export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
