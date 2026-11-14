// Seeded randomness for people (NPC-AI track). Everything about a person derives from one integer seed, so the
// same person is the same person every day and in every session.
export function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function hashInts(a, b = 0, c = 0, d = 0) {
  let h = 0x9e3779b9 ^ Math.imul(a | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(b | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) ^ Math.imul(d | 0, 0xc2b2ae3d);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed >>> 0 : hashStr(seed ?? 'x')) || 1;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  // normal-ish (sum of 3 uniforms), mean m, spread s (about 1 sigma)
  f.norm = (m = 0, s = 1) => m + ((f() + f() + f()) / 1.5 - 1) * s * 1.7;
  // weighted pick from { key: weight } or [[key, weight], ...]
  f.weighted = (w) => {
    const ent = Array.isArray(w) ? w : Object.entries(w);
    let tot = 0; for (const e of ent) tot += e[1];
    let r = f() * tot;
    for (const e of ent) { r -= e[1]; if (r <= 0) return e[0]; }
    return ent[ent.length - 1][0];
  };
  f.shuffle = (arr) => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  return f;
}
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const approachAngle = (a, b, k) => a + wrapAngle(b - a) * Math.min(1, k);
// pack an sRGB hex color into one float (exact below 2^24) for instanced attributes
export const packHex = (hex) => hex & 0xffffff;
export function hexToRgb01(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
export function rgb01ToHex(r, g, b) { return (Math.round(clamp(r) * 255) << 16) | (Math.round(clamp(g) * 255) << 8) | Math.round(clamp(b) * 255); }
export function mixHex(a, b, t) { const A = hexToRgb01(a), B = hexToRgb01(b); return rgb01ToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
export function hslHex(h, s, l) { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return rgb01ToHex(r + m, g + m, b + m); }
