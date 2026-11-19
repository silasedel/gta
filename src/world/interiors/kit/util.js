// Interiors engine kit: seeded random, small math and color helpers. No three.js import (also used by the bake worker).

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export const toSeed = (seed) =>
  typeof seed === 'number' ? Math.floor(seed) >>> 0 || 1 : hashStr(seed ?? 'x') || 1;

// mulberry32 with helpers. rng(seed, 'salt') gives an independent stream for the same store seed.
export function rng(seed, salt) {
  let a = toSeed(salt == null ? seed : toSeed(seed) ^ hashStr(salt));
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.jit = (v) => (f() - 0.5) * 2 * v;
  f.shuffle = (arr) => {
    const b = arr.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  // weighted pick: [[item, weight], ...]
  f.weighted = (pairs) => {
    let t = 0;
    for (const p of pairs) t += p[1];
    let r = f() * t;
    for (const p of pairs) {
      r -= p[1];
      if (r <= 0) return p[0];
    }
    return pairs[pairs.length - 1][0];
  };
  return f;
}

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const snap = (v, g = 0.05) => Math.round(v / g) * g;
export const TAU = Math.PI * 2;
export const angDiff = (a, b) => {
  let d = a - b;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d;
};

// ---- color (hex strings or numbers) ----
export function rgbOf(hex) {
  if (Array.isArray(hex)) return hex;
  if (typeof hex === 'number') return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  let h = String(hex).replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const css = (c, a = 1) => {
  const [r, g, b] = rgbOf(c);
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
};
export const hexNum = (c) => {
  const [r, g, b] = rgbOf(c);
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
};
export const mixc = (a, b, t) => {
  const A = rgbOf(a),
    B = rgbOf(b);
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
};
export const shade = (c, k) => (k >= 0 ? mixc(c, [255, 255, 255], k) : mixc(c, [0, 0, 0], -k));
export const lum = (c) => {
  const [r, g, b] = rgbOf(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
export const inkOn = (bg) => (lum(bg) > 0.55 ? '#15161a' : '#ffffff');
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
// sRGB 0..255 triple -> linear 0..1 triple (for baked light colors)
export const lin = (c) =>
  rgbOf(c).map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
// black-body-ish light color from a color temperature in kelvin (linear rgb, normalized so max = 1)
export function kelvin(k) {
  const t = k / 100;
  let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = lin([clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)]);
  const m = Math.max(c[0], c[1], c[2]) || 1;
  return [c[0] / m, c[1] / m, c[2] / m];
}
export const money = (v) => '$' + (Math.round(v * 100) / 100).toFixed(2);
// 12-hour clock text from a 0..24 hour float
export function clockText(h, withMin = true) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h),
    mm = Math.floor((h - hh) * 60);
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return withMin ? `${h12}:${String(mm).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}
