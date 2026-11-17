// Brand registry (DESIGN-SYSTEM track): every invented brand in Southline. Data lives in ./data/*.js.
import { CATEGORIES, categories } from './categories.js';
import { rng } from '../util.js';
import core from './data/core.js';
import main from './data/main.js';
import fuel_grocery from './data/fuel_grocery.js';
import fastfood from './data/fastfood.js';
import cuban_local_food from './data/cuban_local_food.js';
import restaurants from './data/restaurants.js';
import nightlife_hotels from './data/nightlife_hotels.js';
import fashion from './data/fashion.js';
import luxury_beauty from './data/luxury_beauty.js';
import drinks from './data/drinks.js';
import spirits from './data/spirits.js';
import snacks_tobacco from './data/snacks_tobacco.js';
import pantry_household from './data/pantry_household.js';
import tech_media from './data/tech_media.js';
import finance_services from './data/finance_services.js';
import civic_travel from './data/civic_travel.js';
import leisure_transport from './data/leisure_transport.js';
import auto from './data/auto.js';
import marine_air from './data/marine_air.js';
import makers_building from './data/makers_building.js';
import makers_street from './data/makers_street.js';
import retail_misc from './data/retail_misc.js';
const SOURCES = { core, main, fuel_grocery, fastfood, cuban_local_food, restaurants, nightlife_hotels, fashion, luxury_beauty, drinks, spirits, snacks_tobacco, pantry_household, tech_media, finance_services, civic_travel, leisure_transport, auto, marine_air, makers_building, makers_street, retail_misc };

export const brands = [];
const byId = new Map();
export const brandErrors = [];
for (const [file, list] of Object.entries(SOURCES)) {
  for (const b of list || []) {
    if (!b || !b.id) { brandErrors.push(`${file}: brand without id`); continue; }
    if (byId.has(b.id)) { brandErrors.push(`${file}: duplicate brand id ${b.id} (also in ${byId.get(b.id).file})`); continue; }
    if (!CATEGORIES[b.category]) brandErrors.push(`${file}: ${b.id} has unknown category "${b.category}"`);
    b.file = file; byId.set(b.id, b); brands.push(b);
  }
}
if (brandErrors.length && typeof console !== 'undefined') console.warn('[design] brand data problems:\n' + brandErrors.join('\n'));

export { CATEGORIES, categories };
export function getBrand(id) { return byId.get(id) || null; }

const asList = (v) => (v == null ? null : Array.isArray(v) ? v : [v]);
function matches(b, q) {
  const cat = asList(q.category), sub = asList(q.sub), tier = asList(q.tier), pres = asList(q.presence), tag = asList(q.tag), group = asList(q.group);
  if (cat && !cat.includes(b.category)) return false;
  if (group && !group.includes(CATEGORIES[b.category]?.group)) return false;
  if (sub && !sub.includes(b.sub)) return false;
  if (tier && !tier.includes(b.tier)) return false;
  if (pres && !pres.includes(b.presence)) return false;
  if (tag && !tag.some((t) => b.tags.includes(t))) return false;
  if (q.district && !(b.districts.includes('*') || b.districts.includes(q.district))) return false;
  if (q.district && b.avoid && b.avoid.includes(q.district)) return false;
  if (q.storefront != null && !!b.storefront !== !!q.storefront) return false;
  if (typeof q.filter === 'function' && !q.filter(b)) return false;
  return true;
}
// Every brand matching the query. query: { category, sub, tier, district, presence, tag, group, storefront, filter } (each may be a list).
export function brandsFor(query = {}) { return brands.filter((b) => matches(b, query)); }

// Deterministic weighted pick: the same seed and query always give the same brand. Brands named for the district
// get a boost, so local independents show up at home. opts.exclude = ids already used nearby (no identical neighbors).
export function pickBrand(seed, query = {}, opts = {}) {
  let list = brandsFor(query);
  if (!list.length && query.tier) list = brandsFor({ ...query, tier: undefined });
  if (!list.length && query.district) list = brandsFor({ ...query, district: undefined, tier: undefined });
  if (!list.length) return null;
  const ex = opts.exclude ? new Set(opts.exclude) : null;
  if (ex) { const l2 = list.filter((b) => !ex.has(b.id)); if (l2.length) list = l2; }
  const r = rng(seed);
  const w = list.map((b) => (b.weight || 1) * (query.district && b.districts.includes(query.district) ? 3 : 1));
  let t = r() * w.reduce((a, c) => a + c, 0);
  for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; }
  return list[list.length - 1];
}
