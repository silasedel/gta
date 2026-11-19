// Seeded PRNG shared by every vehicle module (looks, plates, wear, driver personalities).
// rng(seed) -> r() in [0, 1) with helpers.  Same seed, same sequence, on every machine.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function hashSeed(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'string' ? hashStr(p) : Math.floor(Number(p) || 0) >>> 0;
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h >>>= 0;
  }
  return h >>> 0;
}
export function rng(seed = 1) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x6d2b79f5;
  const r = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (n) => Math.floor(r() * n);
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  // gaussian-ish (sum of 3 uniforms), mean 0, about +-1
  r.normal = () => (r() + r() + r() - 1.5) / 0.75;
  // weighted pick: { key: weight } or [[item, weight], ...]
  r.weighted = (w) => {
    const ent = Array.isArray(w) ? w : Object.entries(w);
    let tot = 0;
    for (const e of ent) tot += e[1];
    let x = r() * tot;
    for (const e of ent) {
      x -= e[1];
      if (x <= 0) return e[0];
    }
    return ent[ent.length - 1][0];
  };
  r.fork = (label) => rng(hashSeed(a, label));
  r.seed = seed;
  return r;
}
