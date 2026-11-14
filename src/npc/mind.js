// How a person thinks (NPC-AI track): identity traits -> behavior parameters, reactions to incidents, daily schedule,
// and the population mix by district and hour. Pure functions (no scene access) so they can be tested in node.
import { rng, hashInts, clamp } from './rand.js';
import { makeIdentity, JOBS, districtKey } from './identity.js';

// jobs of the merged world outside the city (Everglades, farms, Keys)
const EXTRA_JOBS = {
  ranger: { t: 'park ranger', kind: 'street', shift: [7, 17], outfit: 'guide', income: 1, ages: [24, 62] },
  farmhand: { t: 'farm worker', kind: 'street', shift: [5.5, 14.5], outfit: 'trade', income: 0, ages: [18, 66] },
  airboat: { t: 'airboat captain', kind: 'street', shift: [8, 17], outfit: 'trade', income: 1, ages: [22, 68] },
  baitshop: { t: 'bait shop owner', kind: 'service', shift: [5, 15], outfit: 'casual', income: 1, ages: [30, 74] },
};
for (const k in EXTRA_JOBS) if (!JOBS[k]) JOBS[k] = EXTRA_JOBS[k];

const W = (o, r) => { let t = 0; for (const k in o) t += o[k]; let x = r() * t; for (const k in o) { x -= o[k]; if (x <= 0) return k; } return Object.keys(o)[0]; };

// ---------------------------------------------------------------- traits -> behavior
/** Per-person animation/behavior parameters in the shape of v1 PERSONAS, shifted by this person's traits and mood. */
export function personParams(id, base, mood = 0.6) {
  const T = id.traits, P = { ...base };
  P.look = 2.5 + T.curiosity * 9;
  P.lookHold = 0.4 + T.curiosity * 3 + T.sociability * 0.8;
  P.greet = clamp(T.sociability * T.kindness * 0.85 * (0.5 + mood) - (id.voice === 'pro' ? 0.2 : 0));
  P.shove = T.courage > 0.72 && T.temper > 0.6 ? 'shove' : T.temper > 0.62 ? 'argue' : T.courage < 0.25 ? 'flee' : T.kindness > 0.5 ? 'apologise' : 'ignore';
  P.fight = clamp((T.courage - 0.55) * 1.6 * (0.4 + T.temper));
  P.film = clamp(T.curiosity * 0.55 * (0.4 + id.phoneAddict) * (1 - T.kindness * 0.3));
  P.cower = clamp((1 - T.courage) * 0.5 - T.nerve * 0.15);
  P.panic = 0.55 + (1 - T.courage) * 1.1;
  P.call = clamp(id.phoneAddict * 0.45);
  // new knobs read by peds.js
  P.pauseEvery = 70 - T.curiosity * 45 + (id.voice === 'pro' ? 40 : 0);   // seconds between stops to look at things
  P.patience = T.patience;                                                  // waiting at crossings
  P.jaywalk = clamp((1 - T.patience) * 0.7 + T.courage * 0.3 - (id.ageGroup === 'senior' ? 0.3 : 0));
  P.sit = clamp((id.ageGroup === 'senior' ? 0.6 : 0.15) + (1 - T.energy) * 0.4);
  const idles = [];
  if (id.phoneAddict > 0.45) idles.push('phone', 'phone');
  if (T.sociability > 0.55) idles.push('talk');
  if (T.energy < 0.4 || id.ageGroup === 'senior') idles.push('lean');
  if (T.vanity > 0.7 && id.ageGroup !== 'senior') idles.push('dance');
  idles.push(null);
  P.idles = idles;
  return P;
}

// ---------------------------------------------------------------- reactions
/** What this person does about an incident. ctx: { src: 'shot'|'crash'|'hit'|'knockdown'|'weapon'|'honk', d, phone } */
export function chooseReaction(id, ctx, rnd = Math.random) {
  const T = id.traits, d = ctx.d ?? 10, near = clamp(1 - d / 40);
  const phone = ctx.phone !== false;
  let w;
  if (ctx.src === 'crash') {
    w = { help: T.kindness * T.courage * 1.4 * (d < 25 ? 1 : 0.2), crowd: T.curiosity * 0.9, film: phone ? T.curiosity * id.phoneAddict * 1.1 : 0,
      call911: phone ? T.honesty * 0.55 : 0, flee: (1 - T.courage) * 0.25, ignore: id.voice === 'pro' ? 0.8 : (1 - T.curiosity) * 0.35 };
  } else if (ctx.src === 'weapon') {
    w = { flee: (1 - T.courage) * 1.2, freeze: T.nerve < 0.35 ? (1 - T.courage) * 0.7 : 0.05, call911: phone ? T.honesty * 0.6 : 0, ignore: T.courage * 0.5, fight: T.courage > 0.85 && T.temper > 0.6 ? 0.25 : 0 };
  } else { // shot, hit, knockdown, explosion
    w = { flee: 0.45 + (1 - T.courage) * 1.1, freeze: (T.nerve < 0.4 ? 0.55 : 0.12) * (1 - T.courage) * (0.5 + near),
      cower: (1 - T.courage) * (1 - T.courage) * 1.1 * near, film: phone && d > 8 ? T.curiosity * T.courage * (1 - T.honesty * 0.4) * 1.1 : 0,
      call911: phone ? T.honesty * (0.25 + T.courage * 0.6) : 0, fight: T.courage > 0.8 && T.temper > 0.45 && d < 16 ? (T.courage - 0.8) * 4 : 0 };
  }
  return W(w, rnd);
}

/** A witness report about the player: description quality depends on the witness. */
export function witnessReport(id, what, where, d, seen = {}) {
  const T = id.traits;
  const drunk = id.voice === 'drunk' ? 0.3 : 0;
  const reliability = clamp(0.2 + T.honesty * 0.3 + T.curiosity * 0.15 + T.courage * 0.1 + clamp(1 - d / 60) * 0.3 - drunk, 0.05, 0.98);
  const bits = [];
  if (reliability > 0.35) bits.push(seen.gender === 'f' ? 'a woman' : 'a man');
  if (reliability > 0.5 && seen.vehicle) bits.push('in a ' + (seen.vehicleColor ? seen.vehicleColor + ' ' : '') + seen.vehicle);
  if (reliability > 0.6 && seen.weapon) bits.push('with a ' + seen.weapon);
  if (reliability > 0.7 && seen.heading) bits.push('heading ' + seen.heading);
  const description = bits.length ? bits.join(', ') : 'someone, I could not see well';
  return { what, where, description, reliability: Math.round(reliability * 100) / 100, witness: id.name, witnessId: id.id };
}

// ---------------------------------------------------------------- schedules
const inShift = (s, h) => s && s[1] > s[0] && ((h >= s[0] && h < s[1]) || (s[1] > 24 && h + 24 < s[1]));
/** What a person is doing at hour h. Returns { act, out } where out = on the street / in public right now. */
export function activityAt(id, h, dk = id.districtKey, day = 0) {
  const s = id.jobDef?.shift; const r = rng(hashInts(id.seed, day, Math.floor(h * 2), 0xac7));
  const weekend = day % 7 >= 5;
  if (!weekend && inShift(s, h)) {
    if (id.jobDef.kind !== 'street' && h >= 12 && h < 13.5) return { act: 'lunch', out: r() < 0.6 };   // office lunch break
    return { act: id.jobDef.kind === 'street' ? 'work_street' : 'work', out: id.jobDef.kind === 'street' };
  }
  if (s && !weekend && s[1] > s[0] && (Math.abs(h - s[0] + 0.75) < 0.75 || Math.abs(h - (s[1] % 24)) < 0.75)) return { act: 'commute', out: true };
  const young = id.age >= 18 && id.age < 40;
  if (h >= 22 || h < 4) {
    if (young && id.drinker > 0.45 && r() < (dk === 'beach' || dk === 'wynwood' ? 0.5 : 0.2) + id.traits.sociability * 0.4) return { act: 'nightlife', out: true };
    if (id.jobKey === 'tourist' && r() < (dk === 'beach' ? 0.35 : 0.12)) return { act: 'nightlife', out: true };
    return { act: 'home', out: r() < 0.03 };
  }
  if (h >= 4 && h < 6.5) return id.fit > 0.6 && r() < 0.25 ? { act: 'exercise', out: true } : { act: 'home', out: false };
  if ((h < 9 || (h >= 17 && h < 20)) && id.fit > 0.55 && r() < 0.35) return { act: 'exercise', out: true };
  if (h >= 10 && h < 18 && (dk === 'beach' || dk === 'keys') && (id.jobKey === 'tourist' || id.likes?.includes?.('beach') || r() < 0.3)) return { act: 'beach', out: true };
  if (h >= 11.5 && h < 14) return { act: 'lunch', out: r() < 0.75 };
  if (id.ageGroup === 'senior' && h >= 7 && h < 18) return { act: r() < 0.5 ? 'errands' : 'socialize', out: r() < 0.7 };
  if (h >= 18 && h < 22) return { act: r() < 0.5 ? 'dinner' : 'stroll', out: r() < 0.55 + id.traits.sociability * 0.3 };
  return { act: r() < 0.5 ? 'errands' : 'stroll', out: r() < 0.45 + id.traits.energy * 0.3 };
}

// who is around: role mix by district flavor and hour
export function roleMix(dk, zone, h) {
  const night = h >= 22 || h < 5, rush = (h >= 7 && h < 9.5) || (h >= 16.5 && h < 19);
  if (dk === 'beach' || zone === 'beach') return { resident: 3, worker: night ? 2 : 3, visitor: h >= 10 && h < 18 ? 7 : night ? 4 : 3 };
  if (dk === 'downtown' || dk === 'brickell' || zone === 'business') return { resident: 2, worker: rush ? 9 : h >= 9 && h < 18 ? 6 : 2, visitor: 2 };
  if (zone === 'nightlife') return { resident: 2, worker: 2, visitor: night ? 7 : 3 };
  if (dk === 'keys') return { resident: 6, worker: 3, visitor: 4 };
  if (dk === 'rural') return { resident: 4, worker: 6, visitor: 1.5 };
  if (dk === 'port') return { resident: 1, worker: 8, visitor: 1 };
  return { resident: 6, worker: 3, visitor: 1.5 };
}
// forced jobs for the merged world (Everglades fishermen and rangers, farm workers, Keys locals)
function regionJob(dk, district, role, r) {
  const d = (district || '').toLowerCase();
  if (dk === 'rural') {
    if (/glades|marsh|wetland/.test(d)) return role === 'visitor' ? 'tourist' : W({ fisher: 4, ranger: 2, airboat: 3, baitshop: 1 }, r);
    if (/citrus|farm|grove/.test(d)) return role === 'visitor' ? undefined : W({ farmhand: 6, landscaper: 1, delivery: 1 }, r);
    if (/sawpalm|park|amaro|lake/.test(d)) return role === 'visitor' ? undefined : W({ ranger: 3, fisher: 3, baitshop: 1 }, r);
  }
  if (dk === 'keys' && role === 'worker') return W({ fisher: 3, yachtcrew: 2, bartender: 2, server: 2, baitshop: 1, chairs: 1, guide: 1 }, r);
  return undefined;
}

let seedBase = (Date.now() >>> 0) % 1000003;
/** A person who would plausibly be out here right now (tries several seeds; returns the identity and their activity). */
export function personForPlace(ctx) {
  const { zone, district = '', hour = 12, day = 0 } = ctx;
  const dk = districtKey(zone, district);
  let last = null;
  for (let k = 0; k < 10; k++) {
    const seed = (seedBase = (seedBase + 7919) >>> 0);
    const r = rng(hashInts(seed, 0x9e1));
    const role = W(roleMix(dk, zone, hour), r);
    const job = regionJob(dk, district, role, r);
    const id = makeIdentity(seed, { zone, district, role, job, gender: ctx.gender });
    const a = activityAt(id, hour, dk, day);
    last = { id, act: a };
    if (a.out) return last;
  }
  return last;
}

/** Street density 0..1 for a place and hour, from sampling who would be out (cached). */
const densCache = new Map();
export function streetDensity(zone, district, hour) {
  const dk = districtKey(zone, district); const hk = Math.floor(hour);
  const key = dk + '|' + zone + '|' + hk;
  let v = densCache.get(key); if (v !== undefined) return v;
  let out = 0; const N = 120;
  for (let i = 0; i < N; i++) {
    const seed = hashInts(i, hk, dk.length * 31 + zone.length, 0x5d);
    const r = rng(seed); const role = W(roleMix(dk, zone, hk + 0.5), r);
    const id = makeIdentity(seed, { zone, district, role, job: regionJob(dk, district, role, r) });
    if (activityAt(id, hk + 0.5, dk).out) out++;
  }
  v = out / N; densCache.set(key, v);
  return v;
}

/** Schedule sample for the report: who is out in a district at an hour (pure, deterministic). */
export function sampleSchedule(zone, district, hour, n = 200) {
  const dk = districtKey(zone, district); const acts = {}, jobs = {}, roles = {}; let out = 0;
  for (let i = 0; i < n; i++) {
    const seed = hashInts(i, 0x3c, dk.length);
    const r = rng(seed); const role = W(roleMix(dk, zone, hour), r);
    const id = makeIdentity(seed + 1e6, { zone, district, role, job: regionJob(dk, district, role, r) });
    const a = activityAt(id, hour, dk);
    if (!a.out) continue;
    out++; acts[a.act] = (acts[a.act] || 0) + 1; jobs[id.jobKey] = (jobs[id.jobKey] || 0) + 1; roles[role] = (roles[role] || 0) + 1;
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ':' + v).join(' ');
  return { zone, district, hour, sampled: n, out, density: Math.round(out / n * 100) / 100, acts: top(acts), jobs: top(jobs), roles: top(roles) };
}
