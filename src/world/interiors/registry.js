// Store type registry: the category API every store and building category builds on. See README.md for the full contract.
const TYPES = new Map();
// def = { type, label, kinds: [OSM shop/amenity kinds], match(sf, info) -> 0..1, minSize: { w, d }, variants: n,
//         profile(base, ctx), plan(P, ctx), fixtures(ctx) (function or generator), lighting(ctx), staff(ctx), behaviors, standouts }
export function registerStoreType(def) {
  if (!def || !def.type) throw new Error('registerStoreType: missing type');
  for (const k of ['plan', 'fixtures'])
    if (typeof def[k] !== 'function')
      throw new Error(`registerStoreType(${def.type}): ${k}() is required`);
  TYPES.set(def.type, {
    kinds: [],
    minSize: { w: 4.5, d: 5 },
    variants: 6,
    standouts: [],
    behaviors: {},
    ...def,
  });
  return def;
}
export const getStoreType = (t) => TYPES.get(t);
export const storeTypes = () => [...TYPES.values()];
// pick the type for a storefront lot: an explicit sf.storeType wins, then the best match() / kinds hit that fits the lot
export function typeFor(sf, W, D) {
  if (sf.storeType && TYPES.has(sf.storeType)) return TYPES.get(sf.storeType);
  let best = null,
    bs = 0;
  const kind = String(sf.kind || sf.shop || sf.amenity || '');
  for (const t of TYPES.values()) {
    if (W < t.minSize.w || D < t.minSize.d) continue;
    let s = 0;
    try {
      s = t.match ? t.match(sf, { kind, W, D }) : 0;
    } catch (e) {
      s = 0;
    }
    if (!s && t.kinds.includes(kind)) s = 0.5;
    if (s > bs) {
      bs = s;
      best = t;
    }
  }
  return best;
}
// hand-made standout for this lot, if the type defines one: standouts: [{ id, osmId, near: [x, z, r], name, apply(profile, ctx) }]
export function standoutFor(t, sf) {
  for (const s of t.standouts || []) {
    if (s.osmId != null && s.osmId === sf.id) return s;
    if (s.near && Math.hypot(sf.x - s.near[0], sf.z - s.near[1]) < (s.near[2] || 15)) return s;
    if (s.id && sf.standout === s.id) return s;
  }
  return null;
}
