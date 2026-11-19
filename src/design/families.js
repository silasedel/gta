// Manufacturer families: the invented makers of fixtures, elevators, docks, lamps, benches, pumps, coolers and so on.
// They are ordinary brands (so they have logos and nameplates) with a `family` block describing their look.
import { brands } from './brands/index.js';
import { rng } from './util.js';

export const families = brands.filter((b) => b.family && Array.isArray(b.family.makes));
export function getFamily(id) {
  return families.find((b) => b.id === id) || null;
}
export function familiesFor(kind, query = {}) {
  return families.filter(
    (b) =>
      b.family.makes.includes(kind) &&
      (!query.tier || b.tier === query.tier) &&
      (!query.district || b.districts.includes('*') || b.districts.includes(query.district)),
  );
}
export const familyKinds = [...new Set(families.flatMap((b) => b.family.makes))].sort();
// Deterministic pick: use the building, block or dock seed so neighbors differ but a building stays consistent.
export function pickFamily(seed, kind, query = {}, opts = {}) {
  let list = familiesFor(kind, query);
  if (!list.length) list = familiesFor(kind);
  if (!list.length) return null;
  if (opts.exclude) {
    const ex = new Set(opts.exclude);
    const l2 = list.filter((b) => !ex.has(b.id));
    if (l2.length) list = l2;
  }
  const r = rng(seed);
  const w = list.map((b) => b.weight || 1);
  let t = r() * w.reduce((a, c) => a + c, 0);
  for (let i = 0; i < list.length; i++) {
    t -= w[i];
    if (t <= 0) return list[i];
  }
  return list[list.length - 1];
}
