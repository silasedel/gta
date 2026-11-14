// PORT SOLANA V2 navigation: destination search by place name and by category ("nearest gas station").
// Sources: storefronts (typed from real map data; names are never real brands), streets and intersections, districts,
// world places (layout.json), and anything other tracks register at run time (safehouses, jobs, branded shops).

export const CATEGORIES = {
  gas: { label: 'Gas station', kinds: ['fuel', 'gas', 'gas_station'], words: ['gas', 'gas station', 'fuel', 'petrol'] },
  atm: { label: 'ATM / bank', kinds: ['bank', 'atm', 'bureau_de_change', 'money_lender'], words: ['atm', 'bank', 'cash'] },
  clothing: { label: 'Clothing store', kinds: ['clothes', 'boutique', 'fashion', 'tailor'], words: ['clothes', 'clothing', 'clothing store', 'fashion', 'outfit'] },
  shoes: { label: 'Shoe store', kinds: ['shoes'], words: ['shoes', 'shoe store', 'sneakers'] },
  food: { label: 'Restaurant', kinds: ['restaurant', 'fast_food', 'food_court'], words: ['food', 'restaurant', 'eat', 'dinner', 'lunch'] },
  fastfood: { label: 'Fast food', kinds: ['fast_food'], words: ['fast food', 'burger', 'drive thru', 'drive-thru'] },
  coffee: { label: 'Coffee', kinds: ['cafe', 'coffee'], words: ['coffee', 'cafe', 'cafecito'] },
  bar: { label: 'Bar', kinds: ['bar', 'pub'], words: ['bar', 'drink', 'pub'] },
  club: { label: 'Nightclub', kinds: ['nightclub'], words: ['club', 'nightclub'] },
  store: { label: 'Convenience store', kinds: ['convenience', 'general', 'kiosk'], words: ['convenience', 'store', 'corner store', 'snacks'] },
  grocery: { label: 'Supermarket', kinds: ['supermarket', 'greengrocer'], words: ['supermarket', 'grocery', 'groceries'] },
  pharmacy: { label: 'Pharmacy', kinds: ['pharmacy', 'chemist'], words: ['pharmacy', 'drugstore', 'medicine'] },
  hospital: { label: 'Hospital / clinic', kinds: ['hospital', 'clinic', 'doctors'], words: ['hospital', 'clinic', 'doctor', 'er'] },
  police: { label: 'Police station', kinds: ['police'], words: ['police', 'police station'] },
  hotel: { label: 'Hotel', kinds: ['hotel', 'motel', 'hostel'], words: ['hotel', 'motel', 'room'] },
  liquor: { label: 'Liquor store', kinds: ['liquor', 'alcohol', 'wine'], words: ['liquor', 'liquor store', 'alcohol'] },
  electronics: { label: 'Electronics', kinds: ['electronics', 'mobile_phone', 'computer'], words: ['electronics', 'phone', 'phone store'] },
  jewelry: { label: 'Jewelry', kinds: ['jewelry', 'watches'], words: ['jewelry', 'jeweler', 'watches'] },
  barber: { label: 'Barber / salon', kinds: ['salon', 'hairdresser', 'barber', 'beauty'], words: ['barber', 'salon', 'haircut'] },
  tattoo: { label: 'Tattoo', kinds: ['tattoo'], words: ['tattoo'] },
  gym: { label: 'Gym', kinds: ['gym', 'fitness_centre', 'fitness'], words: ['gym', 'workout'] },
  garage: { label: 'Car repair', kinds: ['car_repair', 'car_parts', 'tyres'], words: ['mechanic', 'repair', 'garage', 'car repair'] },
  dealer: { label: 'Car dealer', kinds: ['car', 'car_rental', 'motorcycle'], words: ['dealer', 'car dealer', 'rental'] },
  carwash: { label: 'Car wash', kinds: ['car_wash'], words: ['car wash', 'wash'] },
  guns: { label: 'Gun store', kinds: ['weapons', 'gun', 'guns'], words: ['gun', 'guns', 'gun store', 'ammo'] },
  hardware: { label: 'Hardware', kinds: ['hardware', 'doityourself'], words: ['hardware', 'tools'] },
  laundry: { label: 'Laundry', kinds: ['laundry', 'dry_cleaning'], words: ['laundry', 'laundromat'] },
  marina: { label: 'Marina', kinds: ['marina', 'boat_rental', 'dock'], words: ['marina', 'boat', 'dock'] },
  airport: { label: 'Airport', kinds: ['airport', 'airfield', 'aerodrome'], words: ['airport', 'airfield', 'flights'] },
  home: { label: 'Home', kinds: ['home', 'safehouse'], words: ['home', 'safehouse', 'house'] },
};
const KIND_CAT = {}; for (const [c, d] of Object.entries(CATEGORIES)) for (const k of d.kinds) if (!KIND_CAT[k]) KIND_CAT[k] = c;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').replace(/\b(northeast)\b/g, 'ne').replace(/\b(northwest)\b/g, 'nw').replace(/\b(southeast)\b/g, 'se').replace(/\b(southwest)\b/g, 'sw')
  .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd').replace(/\bdrive\b/g, 'dr').replace(/\broad\b/g, 'rd').replace(/\bcauseway\b/g, 'cswy').replace(/\s+/g, ' ').trim();
const pretty = (k) => String(k || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function createPlaces(game, G) {
  const list = []; // { id, name, category, kind, x, z, sub?, n (normalized name), source }
  const byId = new Map();
  let nextId = 1;
  const add = (p) => { const e = { id: p.id ?? `p${nextId++}`, name: p.name, category: p.category || KIND_CAT[p.kind] || null, kind: p.kind || null, x: p.x, z: p.z, sub: p.sub || null, source: p.source || 'custom', n: norm(p.name), door: p.door || null }; if (byId.has(e.id)) { const i = list.indexOf(byId.get(e.id)); if (i >= 0) list.splice(i, 1); } list.push(e); byId.set(e.id, e); return e.id; };
  function index(city) {
    for (const s of city?.storefronts || []) {
      const cat = KIND_CAT[s.kind] || null;
      // storefront names come from the design system when it has branded this lot (s.name / s.brand); otherwise the type and street
      const nm = s.name || s.brand?.name || `${cat ? CATEGORIES[cat].label : pretty(s.kind)}${s.street ? ` on ${s.street}` : ''}`;
      add({ id: `sf${s.id}`, name: nm, kind: s.kind, category: cat, x: s.fx ?? s.x, z: s.fz ?? s.z, sub: s.district || s.street || null, source: 'store' });
    }
    const names = city?.names || game?.miamiData?.names;
    for (const [d, c] of Object.entries(names?.districts || {})) add({ id: `d:${d}`, name: d, kind: 'district', category: null, x: c.x, z: c.z, source: 'district' });
    // streets: the middle of the named road
    if (G) {
      const acc = new Map();
      for (let k = 0; k < G.nE; k++) { const ni = G.eName[k]; if (ni < 0) continue; let a = acc.get(ni); if (!a) acc.set(ni, (a = { len: 0, best: -1, bestLen: 0, x: 0, z: 0 })); a.len += G.eLen[k]; a.x += (G.nx[G.eA[k]] + G.nx[G.eB[k]]) / 2 * G.eLen[k]; a.z += (G.nz[G.eA[k]] + G.nz[G.eB[k]]) / 2 * G.eLen[k]; }
      for (const [ni, a] of acc) { // the point on the street nearest its centroid
        const cx = a.x / a.len, cz = a.z / a.len; let bx = cx, bz = cz, bd = Infinity;
        for (let k = 0; k < G.nE; k++) if (G.eName[k] === ni) { const mx = (G.nx[G.eA[k]] + G.nx[G.eB[k]]) / 2, mz = (G.nz[G.eA[k]] + G.nz[G.eB[k]]) / 2, d = (mx - cx) ** 2 + (mz - cz) ** 2; if (d < bd) { bd = d; bx = mx; bz = mz; } }
        add({ id: `st:${ni}`, name: G.strings[ni].split(';')[0], kind: 'street', category: null, x: bx, z: bz, source: 'street' });
      }
    }
  }
  // "5th St & Ocean Dr": a node where both streets meet
  function intersection(q) {
    const parts = q.split(/\s*(?:&| and | at |\/)\s*/).map(norm).filter(Boolean);
    if (parts.length !== 2 || !G) return null;
    const match = (k, p) => { const ni = G.eName[k]; return ni >= 0 && norm(G.strings[ni]).includes(p); };
    const nodesA = new Map();
    for (let k = 0; k < G.nE; k++) if (match(k, parts[0])) { nodesA.set(G.eA[k], k); nodesA.set(G.eB[k], k); }
    for (let k = 0; k < G.nE; k++) if (match(k, parts[1])) for (const v of [G.eA[k], G.eB[k]]) if (nodesA.has(v)) {
      const a = G.strings[G.eName[nodesA.get(v)]].split(';')[0], b = G.strings[G.eName[k]].split(';')[0];
      if (a === b) continue;
      return { id: `x:${v}`, name: `${a} & ${b}`, kind: 'intersection', category: null, x: G.nx[v], z: G.nz[v], source: 'intersection', score: 1 };
    }
    return null;
  }
  const categoryOf = (q) => { const n = norm(q).replace(/^(nearest|closest|find|a|an|the)\s+/g, '').replace(/\s+(near me|nearby)$/, ''); for (const [c, d] of Object.entries(CATEGORIES)) if (d.words.includes(n) || norm(d.label) === n || c === n) return c; return null; };
  /** Text search. opts: { near:{x,z}, limit = 8 }. Returns places sorted by match quality then distance; a category word returns the nearest of that category. */
  function search(q, opts = {}) {
    const limit = opts.limit ?? 8, near = opts.near || null;
    const dist = (p) => (near ? Math.hypot(p.x - near.x, p.z - near.z) : 0);
    const cat = categoryOf(q);
    if (cat) return nearest(cat, near || { x: 0, z: 0 }, { limit });
    const out = [];
    const x = intersection(q); if (x) out.push(x);
    const n = norm(q); if (!n) return out;
    const toks = n.split(' ');
    for (const p of list) {
      let score = 0;
      if (p.n === n) score = 1; else if (p.n.startsWith(n)) score = 0.85; else if (p.n.includes(n)) score = 0.7;
      else { let hit = 0; for (const t of toks) if (t.length > 1 && (` ${p.n}`).includes(` ${t}`)) hit++; if (hit === toks.length) score = 0.6; else if (hit && toks.length > 1 && hit >= toks.length - 1) score = 0.35; }
      if (!score) continue;
      if (p.source === 'street' || p.source === 'district' || p.source === 'world') score += 0.05;
      out.push({ ...p, score, distance: dist(p) });
    }
    out.sort((a, b) => (b.score - a.score) || ((a.distance || 0) - (b.distance || 0)));
    return out.slice(0, limit);
  }
  /** Nearest places of a category by straight-line distance. Use nav.nearest() for drive-time ranking. */
  function nearest(category, from, opts = {}) {
    const limit = opts.limit ?? 6, out = [];
    const kinds = CATEGORIES[category]?.kinds;
    for (const p of list) if (p.category === category || (kinds && kinds.includes(p.kind)) || p.kind === category) out.push({ ...p, score: 1, distance: Math.hypot(p.x - from.x, p.z - from.z) });
    out.sort((a, b) => a.distance - b.distance);
    return out.slice(0, limit);
  }
  return { index, search, nearest, categoryOf, register: add, remove: (id) => { const e = byId.get(id); if (!e) return false; byId.delete(id); list.splice(list.indexOf(e), 1); return true; }, get: (id) => byId.get(id) || null,
    categories: CATEGORIES, get count() { return list.length; }, all: () => list };
}
