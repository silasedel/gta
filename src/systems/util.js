// Core systems: shared helpers. Engine-free (no three.js, no DOM), so everything in src/systems runs in Node too.

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
// 0 below lo, 1 above hi, linear between
export const ramp = (v, lo, hi) => clamp((v - lo) / (hi - lo));
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------- money (integer cents inside, dollars outside)
export const toCents = (dollars) => Math.round(num(dollars) * 100);
export const toDollars = (cents) => Math.round(cents) / 100;
export const money2 = (dollars) => Math.round(num(dollars) * 100) / 100;
export function fmtMoney(dollars, { cents = 'auto' } = {}) {
  const v = num(dollars), neg = v < 0, a = Math.abs(v);
  const showCents = cents === true || (cents === 'auto' && Math.abs(a - Math.round(a)) > 0.004);
  const s = a.toLocaleString('en-US', { minimumFractionDigits: showCents ? 2 : 0, maximumFractionDigits: showCents ? 2 : 0 });
  return (neg ? '-$' : '$') + s;
}

// ---------------------------------------------------------------- hashing and checksums
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    c = CRC_TABLE[(c ^ (code & 0xff)) & 0xff] ^ (c >>> 8);
    c = CRC_TABLE[(c ^ (code >>> 8)) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
const hex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');
// Two independent 32-bit hashes plus the length: a corrupted or truncated payload cannot pass by accident.
export const checksum = (str) => `${hex8(crc32(str))}${hex8(fnv1a(str))}:${str.length}`;

// Stateless deterministic hash of any mix of numbers and strings -> uint32 (for noise that must not depend on call order).
export function hash32(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    if (typeof p === 'number') {
      const lo = (p | 0) >>> 0, hi = (Math.floor(p / 4294967296) | 0) >>> 0, fr = Math.floor((p - Math.floor(p)) * 4294967296) >>> 0;
      for (const w of [lo, hi, fr]) { h ^= w; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 16)) >>> 0; }
    } else {
      const s = String(p);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = (h ^ (h >>> 12)) >>> 0;
    }
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
export const hash01 = (...parts) => hash32(...parts) / 4294967296;
// Standard normal from two stateless uniforms (Box-Muller).
export function hashGauss(...parts) {
  const u = Math.max(1e-12, hash01(...parts, 'u')), v = hash01(...parts, 'v');
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------- seeded random with a serializable state
// mulberry32. `rng.state` is one uint32, so a save can store it and resume the exact same sequence.
export function makeRng(seed = 1) {
  const r = {
    state: (typeof seed === 'number' ? seed : fnv1a(String(seed))) >>> 0 || 1,
    next() { r.state = (r.state + 0x6d2b79f5) >>> 0; let t = r.state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    range: (lo, hi) => lo + (hi - lo) * r.next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * r.next()),
    chance: (p) => r.next() < p,
    pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(r.next() * arr.length))],
    gauss() { const u = Math.max(1e-12, r.next()), v = r.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    // pick an index by weights
    weighted(weights) { let s = 0; for (const w of weights) s += w; let x = r.next() * s; for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; } return weights.length - 1; },
  };
  return r;
}

// ---------------------------------------------------------------- JSON
// Deterministic JSON: object keys sorted, so the same state always serializes to the same text (checksums, round-trip tests).
export function stableStringify(value) {
  const seen = new Set();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'number' && !Number.isFinite(v)) return 'null';
      return JSON.stringify(v);
    }
    if (typeof v.toJSON === 'function') return walk(v.toJSON());
    if (seen.has(v)) throw new Error('stableStringify: circular structure');
    seen.add(v);
    let out;
    if (Array.isArray(v)) out = '[' + v.map((x) => walk(x === undefined || typeof x === 'function' ? null : x)).join(',') + ']';
    else {
      const keys = Object.keys(v).sort(), parts = [];
      for (const k of keys) { const x = v[k]; if (x === undefined || typeof x === 'function') continue; parts.push(JSON.stringify(k) + ':' + walk(x)); }
      out = '{' + parts.join(',') + '}';
    }
    seen.delete(v);
    return out;
  };
  return walk(value);
}
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------- small event bus (used when the host has none, e.g. Node tests)
export function makeBus() {
  const ev = {};
  return {
    on(n, f) { (ev[n] ||= []).push(f); return f; },
    off(n, f) { const a = ev[n]; if (!a) return; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    emit(n, d) { let veto = false; for (const f of (ev[n] || []).slice()) { try { if (f(d) === false) veto = true; } catch (e) { console.error(`[systems] listener for '${n}' threw`, e); } } return !veto; },
  };
}

// ---------------------------------------------------------------- text
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; }
// Fill "{name}" slots in a template.
export const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));

// distance helpers on plain {x, z} or [x, y, z]
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const vec3arr = (p) => (Array.isArray(p) ? [num(p[0]), num(p[1]), num(p[2])] : [num(p?.x), num(p?.y), num(p?.z)]);
