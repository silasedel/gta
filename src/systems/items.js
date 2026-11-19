// Core systems: item definitions and item instances. A definition says what a thing IS; an instance is one physical
// thing (or a stack of identical unopened things) that sits in a pocket, a hand, a stash or on the ground.
// Definitions come from the design-system product catalog (game.design.getProduct) and are normalized here; other
// tracks may define non-catalog things (keys, IDs, fish, mission objects) with items.define(). No brands are invented here.
import { clamp, num } from './util.js';

export const SIZE = { TINY: 1, SMALL: 2, MEDIUM: 3, LARGE: 4, HUGE: 5 };
export const SIZE_UNITS = [0, 0.25, 1, 2, 4, Infinity]; // pocket units per size class (huge = hands only)
const DEFAULT_STACK = [0, 10, 4, 2, 1, 1];
export const QUALITY_HEAL = { junk: 0.45, snack: 0.7, meal: 1.0, fresh: 1.15 }; // how much of the calories turn into healing

const CATEGORIES = new Set([
  'food',
  'drink',
  'alcohol',
  'medicine',
  'tobacco',
  'clothing',
  'footwear',
  'accessory',
  'electronics',
  'tool',
  'weapon',
  'ammo',
  'key',
  'document',
  'ticket',
  'valuable',
  'fish',
  'household',
  'misc',
]);
// design-system categories / subs / brand categories -> our categories
const CAT_MAP = {
  beverage: 'drink',
  drinks: 'drink',
  beer: 'alcohol',
  spirits: 'alcohol',
  wine: 'alcohol',
  cocktail: 'alcohol',
  snacks: 'food',
  snack: 'food',
  candy: 'food',
  frozen: 'food',
  pantry: 'food',
  dairy: 'food',
  bread: 'food',
  bakery: 'food',
  'fast-food': 'food',
  meal: 'food',
  produce: 'food',
  fruit: 'food',
  seafood: 'food',
  otc: 'medicine',
  health: 'medicine',
  'first-aid': 'medicine',
  vape: 'tobacco',
  cigar: 'tobacco',
  cigarettes: 'tobacco',
  fashion: 'clothing',
  apparel: 'clothing',
  sportswear: 'clothing',
  shoes: 'footwear',
  'shoe-store': 'footwear',
  sneakers: 'footwear',
  eyewear: 'accessory',
  jewelry: 'accessory',
  watches: 'accessory',
  bag: 'accessory',
  bags: 'accessory',
  hat: 'accessory',
  phone: 'electronics',
  games: 'electronics',
  tools: 'tool',
  hardware: 'tool',
  lottery: 'ticket',
  cosmetics: 'household',
  fragrance: 'household',
  'personal-care': 'household',
  pet: 'household',
  baby: 'household',
  tackle: 'tool',
  coffee: 'drink',
  juice: 'drink',
  water: 'drink',
  soda: 'drink',
  energy: 'drink',
};
const PERISH_BY_TAG = [
  // first match wins; hours at room temperature
  [/sushi|nigiri|sashimi|raw|ceviche|oyster/, 4],
  [/ice-?cream|frozen|popsicle|gelato|shaved-ice/, 0.6],
  [
    /hot|grill|fried|pizza|burger|hot-?dog|taco|sandwich|empanada|croqueta|prepared|deli|rotisserie/,
    8,
  ],
  [/coffee|cafecito|latte|cortadito|smoothie|shake|fresh-juice|batido|fountain/, 5],
  [/dairy|milk|yogurt|cream|egg/, 10],
  [/pastry|donut|bakery|bread|pastelito|churro/, 36],
  [/fruit|produce|vegetable|coconut|salad/, 48],
  [/fish|catch|shrimp|lobster|crab/, 6],
];

function sizeClass(p) {
  if (Number.isInteger(p.sizeClass)) return clamp(p.sizeClass, 1, 5);
  const s = p.size;
  if (typeof s === 'number') return clamp(Math.round(s), 1, 5);
  const w = num(s?.w, 0.08),
    h = num(s?.h, 0.08),
    d = num(s?.d, 0.08),
    weight = num(p.weight, 0.2);
  const maxDim = Math.max(w, h, d),
    liters = w * h * d * 1000;
  if (maxDim > 0.7 || weight > 12) return SIZE.HUGE;
  if (maxDim > 0.32 || liters > 4 || weight > 3) return SIZE.LARGE;
  if (maxDim > 0.19 || liters > 0.9) return SIZE.MEDIUM;
  if (maxDim > 0.06 || liters > 0.03) return SIZE.SMALL;
  return SIZE.TINY;
}

// Normalize a design-system product (or a hand-written definition) into the shape documented in README.md.
export function normalizeDef(p) {
  if (!p || typeof p.id !== 'string' || !p.id) throw new Error('item definition needs an id');
  const tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
  const tagText = [p.id, p.sub, p.model, p.shelf, ...tags].filter(Boolean).join(' ').toLowerCase();
  const n = p.nutrition || {};
  const nutrition = {
    kcal: num(n.kcal),
    protein: num(n.protein),
    carbs: num(n.carbs),
    sugar: num(n.sugar),
    fat: num(n.fat),
    fiber: num(n.fiber),
    sodiumMg: num(n.sodiumMg ?? n.sodium),
    waterMl: num(n.waterMl ?? n.water),
    caffeineMg: num(n.caffeineMg ?? n.caffeine),
    alcoholG: num(n.alcoholG ?? n.alcohol),
  };
  const hasBites = num(p.bites) > 0,
    hasSips = num(p.sips) > 0;
  let category = CATEGORIES.has(p.category)
    ? p.category
    : CAT_MAP[p.category] || CAT_MAP[p.sub] || null;
  if (!category || category === 'drink' || category === 'food') {
    if (nutrition.alcoholG > 0.5) category = 'alcohol';
    else if (!category)
      category = hasSips
        ? 'drink'
        : hasBites || nutrition.kcal > 0
          ? 'food'
          : p.wear
            ? p.wear === 'feet'
              ? 'footwear'
              : /wrist|neck|head|face|ear|finger|hand/.test(p.wear)
                ? 'accessory'
                : 'clothing'
            : 'misc';
  }
  const drinkable = category === 'drink' || category === 'alcohol' || (hasSips && !hasBites);
  // water in a drink: what is left of its volume after sugar and alcohol (design sizes are real-world)
  if (drinkable && !nutrition.waterMl) {
    const vol =
      p.volumeMl ??
      (p.size && typeof p.size === 'object'
        ? num(p.size.w, 0.066) * num(p.size.d, 0.066) * num(p.size.h, 0.12) * 0.62 * 1e6
        : num(p.sips, 6) * 45);
    nutrition.waterMl = clamp(Math.round(vol - nutrition.alcoholG / 0.789), 20, 1500);
  }
  let use = p.use !== undefined ? p.use : null;
  if (use === null) {
    if (category === 'medicine') use = 'medicine';
    else if (category === 'ticket' && /scratch|lottery/.test(tagText + ' ' + (p.category || '')))
      use = 'scratch';
    else if (drinkable) use = 'drink';
    else if (category === 'food' || hasBites) use = 'eat';
    else if (p.wear) use = 'wear';
  }
  let portions =
    use === 'eat'
      ? num(p.bites) || num(p.portions)
      : use === 'drink'
        ? num(p.sips) || num(p.portions)
        : num(p.portions);
  if (!portions && use === 'eat') portions = clamp(Math.round(nutrition.kcal / 70), 1, 12);
  if (!portions && use === 'drink') portions = clamp(Math.round(nutrition.waterMl / 45), 1, 14);
  if (!portions && use === 'medicine') portions = 1;
  let quality = p.quality || null;
  if (!quality) {
    if (p.junk === true) quality = 'junk';
    else if (/fresh|fruit|salad|produce|grilled-fish|coconut|smoothie/.test(tagText))
      quality = 'fresh';
    else if (
      /meal|plate|entree|dinner|combo|sandwich|bowl/.test(tagText) ||
      (nutrition.kcal >= 380 && nutrition.protein >= 14)
    )
      quality = 'meal';
    else quality = 'snack';
  }
  let perishHours = p.perishHours !== undefined ? p.perishHours : (p.shelfLifeHours ?? null);
  if (
    perishHours === null &&
    (use === 'eat' || use === 'drink') &&
    !/sealed|packaged|canned|bottled|shelf-stable/.test(tagText)
  ) {
    const packaged =
      (p.shelf === 'shelf' || p.shelf === 'rack' || p.shelf === 'cooler') &&
      !/hot-case|counter|menu/.test(String(p.shelf));
    if (!packaged || /fresh|deli|prepared/.test(tagText))
      for (const [re, hours] of PERISH_BY_TAG)
        if (re.test(tagText)) {
          perishHours = hours;
          break;
        }
    if (
      perishHours === null &&
      (p.shelf === 'hot-case' || p.shelf === 'menu' || p.shelf === 'counter') &&
      use === 'eat'
    )
      perishHours = 8;
  }
  const size = sizeClass(p);
  const explicit = {};
  for (const e of Array.isArray(p.effects) ? p.effects : [])
    if (e && e.type) explicit[e.type] = { amount: num(e.amount), seconds: num(e.seconds) };
  return {
    id: p.id,
    name: p.name || p.id,
    brand: p.brand || null,
    category,
    sub: p.sub || null,
    tier: p.tier || null,
    price: num(p.price),
    weight: num(p.weight, [0, 0.03, 0.2, 0.6, 2, 12][size]),
    size,
    stack: Number.isInteger(p.stack) ? p.stack : DEFAULT_STACK[size],
    use,
    portions: portions || 0,
    nutrition,
    quality,
    perishHours,
    leftover: p.leftover || null,
    hand: p.hand || (p.hold === 'two-hands' || size >= SIZE.HUGE ? 'two' : 'one'),
    hold: p.hold || null,
    throwable: p.throwable !== false,
    tags,
    effects: explicit,
    heal: num(p.heal),
    wear: p.wear || null,
    states: Array.isArray(p.states) ? p.states.slice() : null,
    soldAt: Array.isArray(p.soldAt) ? p.soldAt.slice() : null,
    lottery: p.lottery || null,
    fromCatalog: !!p.model || !!p.soldAt,
    data: p.data || null,
  };
}

export function createItems(sys) {
  const { host } = sys;
  const own = new Map(); // definitions registered through items.define
  const cache = new Map(); // normalized catalog products
  const uses = new Map(); // use kind -> handler

  const I = { SIZE, SIZE_UNITS, QUALITY_HEAL };
  I.define = (def) => {
    const d = normalizeDef(def);
    own.set(d.id, d);
    return d;
  };
  I.defineMany = (defs) => defs.map(I.define);
  I.def = (id) => {
    if (!id) return null;
    if (own.has(id)) return own.get(id);
    if (cache.has(id)) return cache.get(id);
    let p = null;
    try {
      p = (sys.catalog || host.design)?.getProduct?.(id) || null;
    } catch (e) {
      p = null;
    }
    if (!p) return null;
    try {
      const d = normalizeDef(p);
      cache.set(id, d);
      return d;
    } catch (e) {
      console.warn(`[items] catalog product '${id}' is malformed:`, e.message);
      return null;
    }
  };
  I.has = (id) => !!I.def(id);
  I.all = (filter) => {
    const out = [...own.values()];
    let cat = [];
    try {
      cat = (sys.catalog || host.design)?.products || [];
    } catch (e) {
      cat = [];
    }
    for (const p of cat)
      if (p?.id && !own.has(p.id)) {
        const d = I.def(p.id);
        if (d) out.push(d);
      }
    return typeof filter === 'function'
      ? out.filter(filter)
      : filter
        ? out.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v))
        : out;
  };
  I.invalidate = (id) => {
    if (id) cache.delete(id);
    else cache.clear();
  };

  I.create = (id, opts = {}) => {
    const def = I.def(id);
    if (!def) return null;
    const now = opts.now ?? sys.time?.now ?? 0;
    const state = { used: 0, bornAt: now, ...(opts.state || {}) };
    if (def.perishHours && state.spoilAt === undefined)
      state.spoilAt = now + def.perishHours * 60 * (opts.freshness ?? 1);
    return {
      uid: sys.uid('i'),
      id: def.id,
      qty: Math.max(1, Math.floor(opts.qty || 1)),
      stolen: !!opts.stolen,
      state,
      ...(opts.meta ? { meta: opts.meta } : {}),
    };
  };
  // Time an item has spent in a fridge counts for a quarter.
  I.spoilAt = (item, now = sys.time?.now ?? 0) => {
    const s = item?.state?.spoilAt;
    if (s === undefined || s === null) return Infinity;
    return item.state.cooledAt !== undefined ? s + (now - item.state.cooledAt) * 0.75 : s;
  };
  I.isSpoiled = (item, now = sys.time?.now ?? 0) => now >= I.spoilAt(item, now);
  I.freshness = (item, now = sys.time?.now ?? 0) => {
    const def = I.def(item?.id),
      end = I.spoilAt(item, now);
    if (!def?.perishHours || end === Infinity) return 1;
    return clamp((end - now) / (def.perishHours * 60));
  };
  I.setCooled = (item, cooled, now = sys.time?.now ?? 0) => {
    if (!item?.state || item.state.spoilAt === undefined || item.state.spoilAt === null) return;
    if (cooled && item.state.cooledAt === undefined) item.state.cooledAt = now;
    else if (!cooled && item.state.cooledAt !== undefined) {
      item.state.spoilAt += (now - item.state.cooledAt) * 0.75;
      delete item.state.cooledAt;
    }
  };
  // Two instances can share a stack only when they are indistinguishable.
  I.canStack = (a, b) => {
    if (!a || !b || a.id !== b.id || a.stolen !== b.stolen || a.meta || b.meta) return false;
    const sa = a.state || {},
      sb = b.state || {};
    if ((sa.used || 0) !== 0 || (sb.used || 0) !== 0 || sa.open || sb.open) return false;
    if ((sa.cooledAt === undefined) !== (sb.cooledAt === undefined)) return false;
    const pa = sa.spoilAt ?? null,
      pb = sb.spoilAt ?? null;
    if ((pa === null) !== (pb === null)) return false;
    if (pa !== null && Math.abs(pa - pb) > 30) return false; // made within half an hour of each other
    for (const k of Object.keys(sa))
      if (!['used', 'bornAt', 'spoilAt', 'cooledAt', 'open'].includes(k)) return false;
    for (const k of Object.keys(sb))
      if (!['used', 'bornAt', 'spoilAt', 'cooledAt', 'open'].includes(k)) return false;
    return true;
  };
  I.units = (item) => {
    const d = I.def(item?.id);
    return d ? SIZE_UNITS[d.size] * (item.qty || 1) : 0;
  };
  I.weight = (item) => {
    const d = I.def(item?.id);
    if (!d) return 0;
    const left = d.portions ? 1 - 0.85 * clamp((item.state?.used || 0) / d.portions) : 1;
    return d.weight * (item.qty || 1) * left;
  };
  I.label = (item) => {
    const d = I.def(item?.id);
    if (!d) return String(item?.id || 'item');
    const parts = [d.name];
    if ((item.qty || 1) > 1) parts.push(`x${item.qty}`);
    if (d.portions && item.state?.used)
      parts.push(`(${d.portions - item.state.used}/${d.portions} left)`);
    return parts.join(' ');
  };

  const KIND = {
    food: 'food',
    drink: 'drink',
    alcohol: 'drink',
    medicine: 'grocery',
    tobacco: 'grocery',
    household: 'grocery',
    clothing: 'retail',
    footwear: 'retail',
    accessory: 'retail',
    electronics: 'retail',
    tool: 'retail',
    ticket: 'fixed',
    valuable: 'luxury',
  };
  I.price = (id, opts = {}) => {
    const d = I.def(id);
    if (!d) return 0;
    const kind =
      d.tier === 'luxury'
        ? 'luxury'
        : d.soldAt?.some((s) => /supermarket|convenience|fuel|pharmacy|discount/.test(s)) &&
            (d.category === 'food' || d.category === 'drink')
          ? 'grocery'
          : KIND[d.category] || 'retail';
    return sys.economy
      ? sys.economy.price(d.price, { district: opts.district, kind, mul: opts.mul })
      : d.price;
  };
  // What a pawn shop or fence pays. Stolen goods only sell to a fence, for less.
  I.resaleValue = (item, { fence = false } = {}) => {
    const d = I.def(item?.id);
    if (!d) return 0;
    if (item.stolen && !fence) return 0;
    const used = d.portions ? 1 - clamp((item.state?.used || 0) / d.portions) : 1;
    const consumable = d.use === 'eat' || d.use === 'drink';
    const rate = consumable ? 0 : fence ? 0.22 : 0.4;
    return Math.round(d.price * rate * used * (item.qty || 1) * 100) / 100;
  };

  I.registerUse = (kind, handler) => {
    uses.set(kind, handler);
  };
  I.useHandler = (kind) => uses.get(kind) || null;
  return I;
}
