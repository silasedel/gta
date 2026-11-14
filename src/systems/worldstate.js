// Core systems: world state services. Stats and achievements, the news bus (phone, TVs, radio), persistent world
// deltas (items taken from shelves, destroyed recorders), and the NPC memory store.
import { num, hash32, fill, cap, clone } from './util.js';
import { DAY } from './time.js';

// ---------------------------------------------------------------------------------------------------------------------
export function createStats(sys) {
  const { host } = sys;
  let v = {}, journal = [], unlocked = {};
  const watchers = new Map();
  const defs = [];
  const St = {};
  const touch = (key) => { const w = watchers.get(key); if (w) for (const f of w) { try { f(v[key], key); } catch (e) { console.error(e); } } dirty = true; };
  let dirty = false, checkT = 0;
  St.add = (key, n = 1) => { v[key] = num(v[key]) + num(n); touch(key); return v[key]; };
  St.set = (key, val) => { v[key] = val; touch(key); return val; };
  St.max = (key, val) => { if (!(num(v[key], -Infinity) >= val)) { v[key] = val; touch(key); } return v[key]; };
  St.get = (key) => num(v[key]);
  St.all = () => ({ ...v });
  St.watch = (key, fn) => { if (!watchers.has(key)) watchers.set(key, []); watchers.get(key).push(fn); };
  St.log = (text, opts = {}) => {
    const t = sys.time?.now ?? 0;
    const e = { t: Math.round(t), day: Math.floor(t / DAY) + 1, text, kind: opts.kind || 'note' };
    if (opts.data) e.data = opts.data;
    journal.push(e); if (journal.length > 300) journal.splice(0, journal.length - 300);
    return e;
  };
  Object.defineProperty(St, 'journal', { get: () => journal });
  St.defineAchievement = (a) => { if (!defs.some((d) => d.id === a.id)) defs.push(a); };
  Object.defineProperty(St, 'achievements', { get: () => defs.map((d) => ({ id: d.id, name: d.name, description: d.description, unlocked: !!unlocked[d.id], at: unlocked[d.id] || null })) });
  St.check = () => {
    for (const d of defs) {
      if (unlocked[d.id]) continue;
      let ok = false; try { ok = !!d.test(v, sys); } catch (e) { ok = false; }
      if (ok) { unlocked[d.id] = Math.round(sys.time?.now ?? 0) || 1; St.log(`Achievement: ${d.name}`, { kind: 'achievement' }); try { host.emit?.('achievement', { id: d.id, name: d.name, description: d.description }); } catch (e) { /* */ } }
    }
  };
  St.update = (realDt) => { checkT -= realDt; if (checkT <= 0 && dirty) { checkT = 2; dirty = false; St.check(); } };
  St.reset = () => { v = {}; journal = []; unlocked = {}; };
  St.toSave = () => ({ v, journal, unlocked });
  St.fromSave = (d) => { St.reset(); if (d) { v = clone(d.v || {}); journal = clone(d.journal || []); unlocked = clone(d.unlocked || {}); } };

  const A = (id, name, description, test) => St.defineAchievement({ id, name, description, test });
  A('first_night', 'Home Sweet Stilts', 'Sleep in your own bed.', (s) => s.timesSlept >= 1);
  A('week_one', 'One Week In', 'Reach Day 8.', (s) => s.day >= 8);
  A('honest_work', 'Honest Work', 'Earn $5,000 from jobs.', (s) => s.jobEarnings >= 5000);
  A('six_figures', 'Six Figures', 'Hold a net worth of $100,000.', (s) => s.netWorthPeak >= 100000);
  A('millionaire', 'Seven Figures', 'Hold a net worth of $1,000,000.', (s) => s.netWorthPeak >= 1000000);
  A('landlord_free', 'Keys to the Place', 'Buy a property.', (s) => s.propertiesBought >= 1);
  A('boss', 'Open for Business', 'Buy a business.', (s) => s.businessesBought >= 1);
  A('investor', 'Ticker Watcher', 'Make $10,000 in realized stock profit.', (s) => s.stockProfit >= 10000);
  A('scratch_big', 'Scratch That Itch', 'Win $1,000 or more on one scratch-off.', (s) => s.lotteryBest >= 1000);
  A('long_shot', 'Long Shot', 'Win a bet at odds of 10 to 1 or longer.', (s) => s.longestOddsWon >= 11);
  A('marathon', 'Marathon Man', 'Cover 42.2 km on foot.', (s) => s.distanceOnFoot >= 42195);
  A('channel', 'Bay Crossing', 'Swim 2 km.', (s) => s.distanceSwum >= 2000);
  A('road_trip', 'Road Trip', 'Drive 100 km.', (s) => s.distanceDriven >= 100000);
  A('foodie', 'Regular Customer', 'Eat 50 things.', (s) => s.foodsEaten >= 50);
  A('rough_night', 'Rough Night', 'Wake up after passing out.', (s) => s.timesPassedOut >= 1);
  A('clean_slate', 'Clean Slate', 'Pay off $2,000 in fines.', (s) => s.finesPaid >= 2000);
  A('collector', 'Three in the Garage', 'Own three vehicles at once.', (s, y) => (y.garage?.records.length || 0) >= 3);
  return St;
}

// ---------------------------------------------------------------------------------------------------------------------
// News. Any module posts stories; the phone, TVs and radio read the feed. Player crimes become reports after a delay,
// written from what witnesses could actually know.
const CRIME_HEAD = {
  robbery: ['Armed robbery at {place}', 'Robber hits {place}; police searching {district}', '{place} held up at gunpoint'],
  shoplift: ['Shoplifter slips out of {place}', 'Store owners in {district} report a rise in thefts'],
  shooting: ['Shots fired in {district}', 'Gunfire sends people running in {district}', 'Police respond to shooting in {district}'],
  murder: ['One dead after violence in {district}', 'Homicide detectives called to {district}'],
  cop_murder: ['Officer killed in {district}; manhunt under way', 'Port Solana mourns officer shot in {district}'],
  cop_assault: ['Officer assaulted in {district}'], cop_shot: ['Officer wounded by gunfire in {district}'],
  carjack: ['Driver pulled from car in {district} carjacking', 'Carjacking reported in {district}'],
  vehicle_theft: ['Car thefts on the rise in {district}', 'Vehicle stolen in {district}'],
  hit_pedestrian: ['Pedestrian struck in {district}; driver fled', 'Hit-and-run in {district} under investigation'],
  assault: ['Street fight reported in {district}', 'Man assaulted in {district}'],
  heist: ['Crew hits {place} in daring heist', 'Millions feared lost in {place} heist'],
};
const CRIME_BODY = [
  'Police describe the suspect as {desc}. Anyone with information is asked to call the Port Solana Police tip line.',
  'Witnesses told officers the suspect was {desc}. No arrests have been made.',
  'Investigators are reviewing camera footage. The suspect was described as {desc}.',
];
export function createNews(sys) {
  const { host } = sys;
  let stories = [], seq = 0, pendingCrimes = [];
  const subs = [];
  const N = {};
  const now = () => sys.time?.now ?? 0;
  N.post = (s = {}) => {
    if (!s.headline) return null;
    const story = { id: 'N' + (++seq), t: Math.round(now() * 10) / 10, day: Math.floor(now() / DAY) + 1, headline: String(s.headline), body: s.body || '', kind: s.kind || 'local', about: s.about || null, place: s.place || null,
      district: s.district || null, priority: Math.max(0, Math.min(3, num(s.priority, 1))), ttl: num(s.ttlHours, 24) * 60, channels: s.channels || ['tv', 'radio', 'phone', 'social'], source: s.source || N.outlet(s.kind), data: s.data || null };
    stories.push(story);
    if (stories.length > 120) stories.splice(0, stories.length - 120);
    for (const f of subs.slice()) { try { f(story); } catch (e) { console.error(e); } }
    try { host.emit?.('news', { story }); } catch (e) { /* */ }
    return story;
  };
  // which outlet carries it: a media brand from the design system when there is one
  N.outlet = (kind) => { try { const list = host.design?.brandsFor?.({ category: 'media' }) || []; if (!list.length) return null; return list[hash32('outlet', kind || 'x') % list.length].name; } catch (e) { return null; } };
  N.feed = (o = {}) => {
    const t = now();
    let a = stories.filter((s) => t - s.t <= s.ttl);
    if (o.channel) a = a.filter((s) => s.channels.includes(o.channel));
    if (o.kind) a = a.filter((s) => s.kind === o.kind);
    if (o.about) a = a.filter((s) => s.about === o.about);
    if (o.sinceMinutes) a = a.filter((s) => t - s.t <= o.sinceMinutes);
    return a.slice().sort((x, y) => y.t - x.t || y.priority - x.priority).slice(0, o.limit || 20);
  };
  N.latest = (channel) => N.feed({ channel, limit: 1 })[0] || null;
  Object.defineProperty(N, 'breaking', { get: () => N.feed({ sinceMinutes: 60 }).find((s) => s.priority >= 3) || null });
  N.subscribe = (fn) => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  // Text for a TV ticker or a radio newsreader: the top stories as one line each.
  N.ticker = (channel = 'tv', limit = 6) => N.feed({ channel, limit }).map((s) => s.headline);

  const describe = (d = {}) => {
    const parts = [];
    parts.push(d.sex || 'a man'); if (d.build) parts.push(d.build);
    if (d.shirt) parts.push(`wearing ${d.shirt}`); else if (d.outfit) parts.push(`wearing ${d.outfit}`);
    if (d.hat) parts.push(`and ${d.hat}`);
    if (d.weapon) parts.push(`armed with ${d.weapon}`);
    if (d.vehicle) parts.push(`last seen in ${d.vehicle}`);
    if (d.masked) parts.push('with his face covered');
    return parts.join(', ').replace(', wearing', ' wearing').replace(', and', ' and');
  };
  // What witnesses and cameras said: becomes a story about the player.
  N.playerReport = (r = {}) => {
    const crime = r.crime || 'robbery';
    const heads = CRIME_HEAD[crime] || ['Police called to {district}'];
    const k = hash32('news', crime, Math.floor(now()), seq);
    const vars = { place: r.place || (r.district ? `a ${r.district} business` : 'a local business'), district: r.district || 'Port Solana' };
    const body = fill(CRIME_BODY[k % CRIME_BODY.length], { desc: describe(r.description) });
    return N.post({ kind: 'crime', about: 'player', headline: cap(fill(heads[k % heads.length], vars)), body, place: r.place || null, district: r.district || null, priority: Math.max(1, Math.min(3, Math.round(num(r.severity, 2) / 1.7))), ttlHours: 30, data: { crime, description: r.description || null } });
  };
  // crimes heard on the event bus are reported 20-50 game minutes later, one story per burst
  N.noteCrime = (c = {}) => {
    const t = now(), sev = num(c.severity, 1);
    if (sev < 2 && !['robbery', 'heist', 'carjack'].includes(c.type)) return;
    const district = (() => { try { return c.position ? sys.economy?.district(c.position.x, c.position.z).name : null; } catch (e) { return null; } })();
    const last = pendingCrimes[pendingCrimes.length - 1];
    if (last && last.district === district && t - last.t0 < 30) { if (sev > last.sev) { last.sev = sev; last.type = c.type; } last.count++; return; }
    pendingCrimes.push({ t0: t, at: t + 20 + (hash32('nd', Math.floor(t)) % 30), type: c.type, sev, district, place: c.shop?.name || c.place || null, count: 1 });
  };
  N.tick = () => {
    const t = now();
    for (let i = 0; i < pendingCrimes.length; i++) {
      const p = pendingCrimes[i]; if (p.at > t) continue;
      pendingCrimes.splice(i--, 1);
      let description = null; try { description = host.police?.describePlayer?.() || host.evidence?.description?.() || null; } catch (e) { description = null; }
      N.playerReport({ crime: p.type, place: p.place, district: p.district, severity: p.sev + Math.min(2, p.count / 3), description: description || {} });
    }
  };
  N.reset = () => { stories = []; seq = 0; pendingCrimes = []; };
  N.toSave = () => ({ stories, seq, pendingCrimes });
  N.fromSave = (d) => { N.reset(); if (d) { stories = clone(d.stories || []); seq = num(d.seq); pendingCrimes = clone(d.pendingCrimes || []); } };
  return N;
}

// ---------------------------------------------------------------------------------------------------------------------
// World deltas: small persistent differences from the generated world, keyed by scope and id.
export function createDeltas(sys) {
  let data = {}, expiries = [];
  const D = {};
  D.set = (scope, id, value = true) => { (data[scope] ||= {})[id] = value; return value; };
  D.get = (scope, id) => data[scope]?.[id];
  D.has = (scope, id) => data[scope] !== undefined && id in data[scope];
  D.all = (scope) => data[scope] || {};
  D.scopes = (prefix = '') => Object.keys(data).filter((s) => s.startsWith(prefix));
  D.clear = (scope, id) => { if (id === undefined) delete data[scope]; else if (data[scope]) { delete data[scope][id]; if (!Object.keys(data[scope]).length) delete data[scope]; } };
  D.expire = (scope, id, gameMinutes) => { expiries.push({ scope, id, at: (sys.time?.now ?? 0) + num(gameMinutes) }); };
  D.count = () => Object.values(data).reduce((s, o) => s + Object.keys(o).length, 0);
  D.tick = () => {
    const t = sys.time?.now ?? 0;
    for (let i = expiries.length - 1; i >= 0; i--) if (expiries[i].at <= t) { const e = expiries[i]; expiries.splice(i, 1); D.clear(e.scope, e.id); try { sys.host.emit?.('deltaExpired', { scope: e.scope, id: e.id }); } catch (err) { /* */ } }
  };
  D.reset = () => { data = {}; expiries = []; };
  D.toSave = () => ({ data, expiries });
  D.fromSave = (d) => { D.reset(); if (d) { data = clone(d.data || {}); expiries = clone(d.expiries || []); } };
  return D;
}

// NPC memory: a persisted object per NPC id. The npc-ai track decides what goes in it.
export function createMemory(sys) {
  let mem = {};
  const M = {};
  M.get = (npcId) => (mem[npcId] ||= {});
  M.peek = (npcId) => mem[npcId] || null;
  M.note = (npcId, fact, value = true) => { const m = M.get(npcId); m[fact] = value; m._t = Math.round(sys.time?.now ?? 0); return m; };
  M.bump = (npcId, fact, n = 1) => { const m = M.get(npcId); m[fact] = num(m[fact]) + n; m._t = Math.round(sys.time?.now ?? 0); return m[fact]; };
  M.forget = (npcId) => { delete mem[npcId]; };
  M.all = () => mem;
  M.reset = () => { mem = {}; };
  M.toSave = () => mem;
  M.fromSave = (d) => { mem = d ? clone(d) : {}; };
  return M;
}
