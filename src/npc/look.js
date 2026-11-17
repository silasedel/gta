// What a person looks like (NPC-AI track). identity + situation -> a `look`: which library body, height and build,
// hair, an outfit fitted to district / income / job / weather / time, accessories and what they carry or push.
// The same look drives the full-detail character (palette, bone shaping, attached props) and the instanced crowd
// body, so a person keeps their appearance across detail levels. Every look gets a signature; the registry
// guarantees no two people spawned in a session share one, and no two people in view share a body mesh.
import * as THREE from 'three';
import { rng, hashInts, clamp, mixHex } from './rand.js';
import { HERITAGE } from './identity.js';
import * as PR from './props.js';

const C = { white: 0xf0ede6, cream: 0xe9e1cf, sand: 0xd6c4a0, navy: 0x2a3442, olive: 0x5a6450, charcoal: 0x3a3a3c, khaki: 0xb5a385, rust: 0xa95d3d, black: 0x1f1f21, heather: 0x8e9094, coral: 0xe07f68, teal: 0x2f8a86, pink: 0xe6b3b5, mint: 0xa6d3bf, sky: 0x9cc1de, lemon: 0xe8d78a, lavender: 0xb8a8d2, aqua: 0x5fb3b8, salmon: 0xe89a85, red: 0xb5443e, mustard: 0xc9a043, blue: 0x2a6fb5, magenta: 0xd95f9a, green: 0x58a55c, orange: 0xf08a2c, denimL: 0x5d7598, denimD: 0x1f2a3c, wine: 0x5a1f2e, plum: 0x3b2a4a, hivis: 0xc8f020, brown: 0x6e4f33 };
const BRIGHT = [C.coral, C.teal, C.pink, C.mint, C.sky, C.lemon, C.lavender, C.aqua, C.salmon, C.red, C.mustard, C.blue, C.magenta, C.green, C.orange];
const NEUTRAL = [C.white, C.cream, C.sand, C.navy, C.olive, C.charcoal, C.khaki, C.black, C.heather, C.rust];
// outfit class -> { zones: preferred library zones, top / bottom palettes, acc: accessory tendencies }
const OUTFITS = {
  beach_swim: { zones: ['beach'], top: BRIGHT.concat([C.white, C.black, C.navy]), bottom: BRIGHT.concat([C.navy, C.black, C.white]), match: 0.5 },
  beach_casual: { zones: ['beach', 'casual', 'sport'], top: BRIGHT.concat([C.white, C.white, C.cream]), bottom: [C.khaki, C.denimL, C.white, C.navy, C.sand, C.coral, C.teal, C.olive] },
  casual: { zones: ['casual', 'sport'], top: BRIGHT.concat(NEUTRAL), bottom: [C.khaki, C.denimL, C.denimD, C.olive, C.navy, C.black, C.sand, C.white, C.heather] },
  resort: { zones: ['casual', 'beach'], top: [C.white, C.cream, C.sky, C.pink, C.mint, C.sand, C.lemon, C.lavender], bottom: [C.white, C.cream, C.sand, C.khaki, C.navy, C.salmon] },
  retiree: { zones: ['casual'], top: [C.white, C.cream, C.sky, C.mint, C.lemon, C.sand, C.pink, C.aqua, C.coral], bottom: [C.khaki, C.sand, C.white, C.navy, C.heather, C.cream, C.lavender] },
  tourist: { zones: ['casual', 'beach'], top: BRIGHT.concat([C.white, C.white]), bottom: [C.khaki, C.khaki, C.denimL, C.sand, C.navy, C.olive, C.white] },
  business: { zones: ['business'], top: [C.navy, C.charcoal, C.black], bottom: [C.navy, C.charcoal, C.black] },
  smart: { zones: ['casual', 'business'], top: [C.white, C.sky, C.navy, C.cream, C.pink, C.charcoal, C.mint, C.heather], bottom: [C.navy, C.khaki, C.charcoal, C.black, C.sand] },
  night: { zones: ['nightlife'], top: [C.black, C.charcoal, C.wine, C.navy, C.white, C.coral, C.teal, C.plum, C.magenta, C.red], bottom: [C.black, C.charcoal, C.denimD, C.white, C.navy, C.wine] },
  bouncer: { zones: ['nightlife', 'business'], top: [C.black], bottom: [C.black] },
  sport: { zones: ['sport'], top: [C.black, C.charcoal, C.heather, C.teal, C.coral, C.navy, C.magenta, C.hivis, C.sky, C.white], bottom: [C.black, C.charcoal, C.navy, C.heather, C.plum, C.teal] },
  construction: { zones: ['port'], top: [C.hivis, C.orange], bottom: [C.navy, C.charcoal, C.denimD] },
  trade: { zones: ['casual', 'port'], top: [C.navy, C.heather, C.charcoal, C.olive, C.rust, C.denimL], bottom: [C.khaki, C.denimD, C.navy, C.olive, C.charcoal] },
  delivery: { zones: ['casual'], top: [C.brown, C.navy, C.blue, C.red], bottom: [C.brown, C.navy, C.black, C.khaki] },
  mail: { zones: ['casual'], top: [C.sky], bottom: [C.navy] },
  guard: { zones: ['casual', 'business'], top: [C.white, C.heather, C.black], bottom: [C.black, C.navy] },
  valet: { zones: ['casual'], top: [C.white, C.red, C.black], bottom: [C.black, C.khaki] },
  service: { zones: ['casual'], top: [C.black, C.white, C.charcoal, C.rust, C.teal], bottom: [C.black, C.khaki, C.charcoal, C.denimD] },
  kitchen: { zones: ['casual'], top: [C.white, C.black, C.heather], bottom: [C.black, C.charcoal, C.heather] },
  vendor: { zones: ['casual', 'beach'], top: BRIGHT.concat([C.white]), bottom: [C.khaki, C.denimL, C.olive, C.navy] },
  scrubs: { zones: ['casual', 'sport'], top: [C.teal, C.sky, C.navy, C.wine, C.aqua, C.lavender, C.green], bottom: null },   // bottom = top
  medic: { zones: ['casual'], top: [C.navy], bottom: [C.navy] },
  lifeguard: { zones: ['beach'], top: [C.white, C.lemon], bottom: [C.red, C.orange] },
  beachstaff: { zones: ['beach', 'casual'], top: [C.white, C.aqua, C.coral], bottom: [C.khaki, C.navy, C.white] },
  crew: { zones: ['casual'], top: [C.white, C.navy], bottom: [C.khaki, C.navy, C.white] },
  fishing: { zones: ['casual', 'beach'], top: [C.sky, C.aqua, C.sand, C.white, C.mint, C.heather], bottom: [C.khaki, C.olive, C.sand, C.heather] },
  guide: { zones: ['casual'], top: [C.orange, C.lemon, C.aqua, C.red], bottom: [C.khaki, C.sand] },
  artsy: { zones: ['casual', 'nightlife'], top: [C.black, C.mustard, C.rust, C.olive, C.plum, C.cream, C.magenta, C.teal], bottom: [C.black, C.denimD, C.olive, C.rust, C.cream] },
  influencer: { zones: ['sport', 'nightlife', 'beach', 'casual'], top: [C.white, C.pink, C.lavender, C.black, C.magenta, C.mint, C.sky, C.cream], bottom: [C.white, C.black, C.denimL, C.pink, C.cream, C.lavender] },
};
const SKIN = { white: [0xf1d3bd, 0xeccab0, 0xe6bd9d, 0xf4dccb], latino: [0xd9ad88, 0xd2a27c, 0xc99670, 0xe0b995], latino2: [0xb98360, 0xad7754, 0xc08e6a], black: [0x6b452e, 0x5c3b27, 0x7a5136, 0x4e3120, 0x8a5f42], asian: [0xe8c9a6, 0xe0bd96, 0xedd2b3], mixed: [0xa9764f, 0x9a6a48, 0xb98862, 0xc49670] };
const HAIRC = { dark: [0x120d0a, 0x1d140e, 0x2a1d14, 0x0c0a09], brown: [0x3d2a1a, 0x4f3622, 0x5a4029], fair: [0x8a6a3e, 0xa88a58, 0x7a5a36, 0x9b5a2e, 0xc9a86a], grey: [0x8f8a80, 0xb5b0a6, 0x6e6a64, 0xd8d4cc], dyed: [0xb5443e, 0xd95f9a, 0x5fb3b8, 0xc9c0e0, 0xe8d78a] };
const TOPK = new Set(['tank', 'tee', 'polo', 'shirt', 'buttonup', 'bikini_top', 'vest']);
// cut of a body's clothes for the crowd body: [sleeve, leg, fixedTop, fixedBottom]
function cutOf(e) {
  const sh = e.shells || [], cl = (e.clothes || []).join(' ');
  let sleeve = -1, leg = 0.12, fixTop = null, fixBot = null;
  if (/elegantsuit/.test(cl)) { sleeve = 1; leg = 1; fixTop = e.gender === 'f' ? 0x2b2e38 : 0x24272f; fixBot = fixTop; }
  else if (/casualsuit/.test(cl)) { sleeve = 1; leg = 1; fixTop = 0x7f8690; fixBot = 0x2f3a4a; }
  else if (/worksuit/.test(cl)) { sleeve = 1; leg = 1; fixTop = null; fixBot = 0x3b4a5c; }
  else if (/sportsuit/.test(cl)) { sleeve = 0; leg = 0.88; fixTop = 0x2a2a2e; fixBot = 0x2a2a2e; }
  if (sh.includes('tank')) sleeve = 0; if (sh.includes('tee') || sh.includes('polo')) sleeve = 0.3; if (sh.includes('shirt') || sh.includes('buttonup')) sleeve = 0.36; if (sh.includes('vest')) sleeve = Math.max(sleeve, 0);
  if (sh.includes('briefs')) leg = 0.13; if (sh.includes('trunks')) leg = 0.22; if (sh.includes('boardshorts')) leg = 0.42; if (sh.includes('shorts')) leg = 0.36; if (sh.includes('sarong')) leg = 0.62; if (sh.includes('trousers')) leg = 1;
  return { sleeve, leg, fixTop, fixBot };
}
const hairStyleOf = (e) => (!e.hair ? 0 : /^short/.test(e.hair) ? 1 : /^bob/.test(e.hair) ? 2 : /^long/.test(e.hair) ? 3 : /ponytail|braid/.test(e.hair) ? 4 : /afro/.test(e.hair) ? 5 : 1);

// ---------------------------------------------------------------- registry (uniqueness)
const sigSeen = new Map();        // signature -> person id (everyone ever spawned this session)
const audit = { looks: 0, rerolls: 0, dupSignatures: 0, bodyClashAvoided: 0 };
export function lookAudit() { return { ...audit, distinct: sigSeen.size }; }
export function resetLookAudit() { sigSeen.clear(); audit.looks = audit.rerolls = audit.dupSignatures = audit.bodyClashAvoided = 0; }

/** Which outfit class fits this person right now. ctx: { zone, hour, weather, activity, onShift } */
export function outfitClassFor(id, ctx = {}) {
  const h = ctx.hour ?? 12, zone = ctx.zone || id.zone, act = ctx.activity || '';
  if (ctx.onShift && id.jobDef?.outfit && id.jobDef.outfit !== 'casual') return id.jobDef.outfit;
  if (/jog|workout|yoga|train/.test(act)) return 'sport';
  if (/sunbathe|swim|wade|volley|beach_sit/.test(act)) return 'beach_swim';
  if (id.jobKey === 'tourist') return zone === 'beach' && h > 8 && h < 19 ? (id.traits.vanity > 0.5 ? 'beach_swim' : 'beach_casual') : 'tourist';
  if ((h >= 21 || h < 4) && (zone === 'nightlife' || /club|dance|bar/.test(act))) return 'night';
  if (zone === 'beach' && h > 8 && h < 19) return id.traits.vanity > 0.62 ? 'beach_swim' : 'beach_casual';
  if (id.ageGroup === 'senior') return 'retiree';
  if (id.jobKey === 'influencer') return 'influencer';
  if (id.voice === 'artsy') return 'artsy';
  if (id.income === 2) return id.jobDef?.kind === 'office' && h > 7 && h < 20 && ctx.weekday !== false && id.traits.energy < 0.7 ? 'smart' : 'resort';
  return 'casual';
}

/**
 * Build a look. bodies: manifest entries that can be instantiated. inUse: Set of body ids currently shown as
 * full-detail characters (to avoid the same mesh twice in view). salt: bump to re-roll.
 */
export function makeLook(id, ctx, bodies, inUse = null, salt = 0) {
  const cls = ctx.outfit || outfitClassFor(id, ctx);
  const O = OUTFITS[cls] || OUTFITS.casual;
  let look = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const r = rng(hashInts(id.seed, 0x100c, salt + attempt * 131, cls.length));
    // ---- body
    const races = HERITAGE[id.heritage]?.race || HERITAGE.mixed.race;
    const targetAge = clamp(id.age, 18, 73);
    let best = null, bs = -1e9;
    for (const e of bodies) {
      if (e.gender !== id.gender) continue;
      let s = (races[e.race] || 0.15) * 2.2 - Math.abs((e.years || 30) - targetAge) * 0.09 + r() * 2.4;
      const zi = O.zones.indexOf(e.zone); s += zi < 0 ? -9 : 3 - zi * 1.1;
      if (cls === 'beach_swim' && !/bikini|trunks|boardshorts/.test((e.shells || []).join())) s -= 5;
      if (cls === 'beach_swim' && id.gender === 'm' && (e.shells || []).includes('tank')) s -= 2;
      if ((cls === 'scrubs' || cls === 'medic' || cls === 'smart' || cls === 'mail' || cls === 'guard' || cls === 'service' || cls === 'kitchen' || cls === 'trade' || cls === 'delivery') && (e.shells || []).includes('trousers')) s += 2.5;
      if ((cls === 'smart' || cls === 'valet' || cls === 'mail' || cls === 'crew' || cls === 'guide') && (e.shells || []).includes('polo')) s += 2;
      if (cls !== 'bouncer' && cls !== 'business' && cls !== 'night' && cls !== 'smart' && /elegantsuit/.test((e.clothes || []).join())) s -= 6;
      if (id.ageGroup === 'kid' || id.ageGroup === 'teen') s += (0.5 - (e.hmacro ?? 0.5)) * 3 - (e.years || 30) * 0.05;
      if (inUse && inUse.has(e.id)) s -= 40;
      if (s > bs) { bs = s; best = e; }
    }
    if (!best) return null;
    const cut = cutOf(best);
    // ---- colors
    let top = cut.fixTop ?? r.pick(O.top), bottom = cut.fixBot ?? (O.bottom ? r.pick(O.bottom) : top);
    if (O.match && r.chance(O.match)) bottom = top;
    if (id.income === 0 && r.chance(0.35)) top = mixHex(top, 0x8a8478, 0.22);          // sun-faded
    if (id.income === 2 && cls === 'casual' && r.chance(0.5)) top = r.pick([C.white, C.cream, C.sky, C.navy]);
    if (/worksuit/.test((best.clothes || []).join())) top = cls === 'construction' ? r.pick(O.top) : C.hivis;
    const shoes = r.pick(cls === 'business' || cls === 'bouncer' ? [0x1a1a1a, 0x3a2618] : cls.startsWith('beach') ? [0x3a2a1e, 0x222222, C.teal, C.coral, 0xe9e7e2] : [0xe9e7e2, 0xe9e7e2, 0x222222, 0x6c6c6a, 0x4a3426, C.navy, C.red]);
    // ---- hair
    const age = id.age; let hs = age > 62 ? (r.chance(0.8) ? 'grey' : 'dark') : age > 48 && r.chance(0.35) ? 'grey' : (best.race === 'white' && r.chance(0.5)) ? (r.chance(0.55) ? 'fair' : 'brown') : r.chance(0.72) ? 'dark' : 'brown';
    if (age < 34 && (id.voice === 'artsy' || id.voice === 'influencer') && r.chance(0.3)) hs = 'dyed';
    const hair = r.pick(HAIRC[hs]);
    let hairStyle = hairStyleOf(best);
    // ---- size and build
    let height = id.gender === 'f' ? r.norm(1.62, 0.065) : r.norm(1.755, 0.07);
    if (id.ageGroup === 'kid') height = 1.12 + (id.age - 6) * 0.055 + r.range(-0.04, 0.04);
    else if (id.ageGroup === 'teen') height = (id.gender === 'f' ? 1.52 : 1.56) + (id.age - 13) * (id.gender === 'f' ? 0.02 : 0.04) + r.range(-0.04, 0.05);
    else if (id.ageGroup === 'senior') height -= 0.03;
    height = clamp(height, 1.08, 2.02);
    const heavy = clamp(r.norm(0.5, 0.3) + (id.fit < 0.3 ? 0.25 : 0) - (id.fit > 0.7 ? 0.2 : 0) + (age > 45 ? 0.1 : 0), 0, 1);
    const girth = id.ageGroup === 'kid' ? r.range(0.86, 1.0) : 0.86 + heavy * 0.5;
    const shoulders = id.gender === 'f' ? r.range(0.86, 0.98) : r.range(0.96, 1.12) + (id.fit > 0.7 ? 0.05 : 0);
    const hips = id.gender === 'f' ? r.range(1.0, 1.2) : r.range(0.92, 1.05);
    // ---- accessories (short-haired bodies can wear hats; everyone can wear eyewear and carry things)
    const acc = []; const sunny = (ctx.hour ?? 12) > 8 && (ctx.hour ?? 12) < 18.5 && ctx.weather !== 'rain' && ctx.weather !== 'storm';
    const shortHair = hairStyle <= 1;
    let hatKind = 0;
    const wantHat = cls === 'construction' ? 'hardhat' : cls === 'lifeguard' ? (r.chance(0.5) ? 'visor' : 'cap') : cls === 'mail' || cls === 'delivery' || cls === 'valet' ? (r.chance(0.6) ? 'cap' : null)
      : cls === 'retiree' || cls === 'tourist' || cls === 'fishing' || cls === 'guide' ? (r.chance(sunny ? 0.6 : 0.2) ? r.pick(['straw', 'bucket', 'cap', 'fedora', 'visor']) : null)
      : cls.startsWith('beach') ? (r.chance(sunny ? 0.4 : 0.1) ? r.pick(['straw', 'cap', 'bucket', 'capBack', 'visor']) : null)
      : cls === 'vendor' || cls === 'trade' ? (r.chance(0.55) ? r.pick(['cap', 'straw', 'bucket']) : null)
      : cls === 'artsy' ? (r.chance(0.35) ? r.pick(['beanie', 'fedora', 'bucket']) : null)
      : cls === 'business' || cls === 'bouncer' || cls === 'scrubs' || cls === 'smart' || cls === 'night' ? null : (r.chance(0.24) ? r.pick(['cap', 'cap', 'capBack', 'bucket', 'beanie', 'headwrap']) : null);
    if (wantHat && (shortHair || wantHat === 'visor' || wantHat === 'headwrap' || wantHat === 'hardhat')) { acc.push({ slot: 'head', kind: 'hat', arg: wantHat, seed: r.int(1, 1e6) }); hatKind = wantHat === 'straw' || wantHat === 'fedora' || wantHat === 'bucket' ? 2 : wantHat === 'hardhat' ? 3 : wantHat === 'beanie' || wantHat === 'headwrap' ? 4 : 1; }
    if (r.chance(cls === 'bouncer' ? 0.5 : sunny ? (cls.startsWith('beach') || cls === 'tourist' || cls === 'resort' ? 0.5 : 0.28) : 0.03)) acc.push({ slot: 'eyes', kind: 'sunglasses', seed: r.int(1, 1e6) });
    else if (r.chance(age > 50 ? 0.4 : 0.14)) acc.push({ slot: 'eyes', kind: 'glasses', seed: r.int(1, 1e6) });
    if (!hatKind && age < 40 && r.chance(0.1 + id.phoneAddict * 0.08)) acc.push({ slot: 'head', kind: 'headphones', seed: r.int(1, 1e6) });
    if (cls === 'scrubs' && r.chance(0.6)) acc.push({ slot: 'neck', kind: r.chance(0.5) ? 'stethoscope' : 'lanyard', seed: r.int(1, 1e6) });
    else if ((cls === 'business' || cls === 'smart' || cls === 'guard' || cls === 'guide') && r.chance(0.3)) acc.push({ slot: 'neck', kind: 'lanyard', seed: r.int(1, 1e6) });
    else if (cls === 'tourist' && r.chance(0.3)) acc.push({ slot: 'neck', kind: 'camera', seed: r.int(1, 1e6) });
    else if (id.traits.vanity > 0.6 && r.chance(0.4)) acc.push({ slot: 'neck', kind: 'chain', seed: r.int(1, 1e6) });
    if (cls === 'vendor' || cls === 'kitchen' || (cls === 'service' && r.chance(0.6))) acc.push({ slot: 'chest', kind: 'apron', seed: r.int(1, 1e6) });
    if (cls === 'construction' && r.chance(0.5) || cls === 'trade' && r.chance(0.4)) acc.push({ slot: 'waist', kind: 'toolBelt', seed: 1 });
    // bag / hand item (the right hand stays free for the phone; bags go to the left hand or back)
    const bag = cls === 'business' ? r.weighted({ briefcase: 5, none: 4, tote: 1 }) : cls === 'tourist' ? r.weighted({ backpack: 4, shoppingBags: 3, tote: 2, none: 3 }) : cls.startsWith('beach') ? r.weighted({ tote: 3, backpack: 1, none: 7 })
      : cls === 'sport' ? r.weighted({ duffel: 1, yogaMat: id.gender === 'f' ? 2 : 0.3, none: 8 }) : cls === 'construction' || cls === 'lifeguard' || cls === 'bouncer' || cls === 'vendor' ? 'none'
      : id.ageGroup === 'kid' || id.ageGroup === 'teen' || id.jobKey === 'college' ? r.weighted({ backpack: 6, none: 4 }) : r.weighted({ none: 9, tote: id.gender === 'f' ? 2.5 : 0.8, purse: id.gender === 'f' ? 3 : 0, backpack: 1.6, shoppingBags: ctx.zone === 'commercial' || id.income === 2 ? 2 : 0.7 });
    if (bag !== 'none') acc.push({ slot: bag === 'backpack' ? 'back' : 'handL', kind: bag, seed: r.int(1, 1e6) });
    // ---- what they push / ride / lead (mobility needs first, then life stage)
    let carry = ctx.carry || 'none';
    if (carry === 'none' && !ctx.noCarry) {
      if (id.mobility === 'scooter') carry = 'mobilityScooter'; else if (id.mobility === 'walker') carry = 'walker'; else if (id.mobility === 'cane') carry = 'cane';
      else if (id.jobKey === 'parent' && r.chance(0.6)) carry = r.chance(0.8) ? 'stroller' : 'babyCarrier';
      else if (id.ageGroup === 'adult' && id.gender === 'f' && r.chance(0.035)) carry = 'stroller';
      else if (id.jobKey === 'tourist' && r.chance(0.07)) carry = 'rollerLuggage';
      else if ((id.ageGroup === 'teen' || id.ageGroup === 'young') && r.chance(0.05)) carry = 'skateboard';
      else if (id.dogOwner && r.chance(0.35)) carry = 'dog';
    }
    const gait = { speed: clamp(1.32 * (0.82 + id.traits.energy * 0.32) * (id.voice === 'pro' ? 1.14 : 1) * (id.ageGroup === 'senior' ? 0.72 : id.ageGroup === 'kid' ? 0.9 : 1) * (heavy > 0.8 ? 0.9 : 1), 0.55, 1.95), stoop: id.ageGroup === 'senior' ? r.range(0.04, 0.2) : id.phoneAddict > 0.8 ? 0.06 : 0, sway: heavy > 0.7 ? 0.05 : 0, bounce: id.traits.energy > 0.75 ? 1.15 : 1 };
    if (carry === 'mobilityScooter') gait.speed = r.range(1.5, 2.1); if (carry === 'walker') gait.speed = r.range(0.5, 0.7); if (carry === 'cane') gait.speed *= 0.8; if (carry === 'stroller') gait.speed *= 0.9;
    const skin = r.pick(SKIN[best.race] || SKIN.mixed);
    const sig = [best.id, Math.round(height * 100), Math.round(girth * 20), top.toString(16), bottom.toString(16), hair.toString(16), shoes.toString(16), acc.map((a) => a.kind + (a.arg || '') + (a.seed % 97)).join('+'), carry].join('|');
    look = { cls, body: best.id, bodyZone: best.zone, gender: best.gender, race: best.race, height, girth, shoulders, hips, bust: best.gender === 'f' ? r.range(0.5, 1.15) : 0, skin, hair, hairStyle, hatKind, top, bottom, shoes, sleeve: cut.sleeve, leg: cut.leg, slots: best.garments || [], acc, carry, gait, sig, headScale: id.ageGroup === 'kid' ? 1.0 + (1.5 - height) * 0.55 : 1 };
    const owner = sigSeen.get(sig);
    if (owner === undefined || owner === id.id) { sigSeen.set(sig, id.id); break; }
    audit.rerolls++; look = null;
  }
  if (!look) { audit.dupSignatures++; return null; }
  audit.looks++;
  if (inUse && inUse.has(look.body)) audit.bodyClashAvoided++;
  return look;
}
export const crowdLook = (L) => ({ skin: L.skin, top: L.sleeve < 0 && L.bust > 0 ? L.top : L.top, bottom: L.bottom, hair: L.hair, shoes: L.shoes, hat: L.acc.find((a) => a.kind === 'hat') ? [0x1f1f21, 0xf0ede6, 0xd9c08a, 0xf0d020, 0x2a3442, 0xb5443e][L.acc.find((a) => a.kind === 'hat').seed % 6] : 0x222222, sleeve: L.sleeve, leg: L.leg, hairStyle: L.hairStyle, hatKind: L.hatKind, girth: L.girth, shoulders: L.shoulders, hips: L.hips, bust: L.bust });

// ---------------------------------------------------------------- applying a look to a full-detail character
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _box = new THREE.Box3(), _v = new THREE.Vector3();
function attachAt(bone, obj, wx, wy, wz) { // obj keeps world-upright orientation at this (rest) pose
  bone.updateWorldMatrix(true, false); _mi.copy(bone.matrixWorld).invert(); _m.makeTranslation(wx, wy, wz).premultiply(_mi);
  const holder = new THREE.Group(); _m.decompose(holder.position, holder.quaternion, holder.scale); holder.add(obj); bone.add(holder); holder.userData.npcAcc = true; return holder;
}
/** char: result of createCharacter (root at the origin, unrotated). Returns { height, props: [Object3D], sig } describing what was really applied. */
export function applyLook(char, L) {
  const out = { props: [], accKinds: [] };
  const root = char.root; root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
  if (char.npcArch) return applyArchLook(char, L, out);
  // palette: garment slots and hair of the atlas material
  let pal = null; char.model.traverse((m) => { if (m.isMesh && m.material?.name === 'atlasC' && m.material.userData?.pal) pal = m.material.userData.pal.value; });
  if (pal) { pal[2].setHex(L.hair); for (const g of L.slots) { if (g.kind === 'vest') { pal[g.slot].setHex(0xc8f020); continue; } pal[g.slot].setHex(TOPK.has(g.kind) ? L.top : L.bottom); } }
  // the character track's own random hats / glasses: ours replace them
  const head = char.getBone('Head'), handL = char.getBone('LeftHand'), handR = char.getBone('RightHand'), spine = char.getBone('Spine2'), hips = char.getBone('Hips'), neck = char.getBone('Neck');
  if (head) for (const c of head.children) if (!c.isBone && !c.userData.npcAcc) c.visible = false;
  if (handR) for (const c of handR.children) if (!c.isBone && !c.userData.npcAcc && c.children[0] && !c.children[0].isMesh) c.visible = false; // briefcase holder (the phone is a mesh child)
  // build: torso and limb thickness through bone scale (animation tracks never touch scale)
  const g = clamp(L.girth, 0.85, 1.32), sp = char.getBone('Spine'), sh = [char.getBone('LeftShoulder'), char.getBone('RightShoulder')];
  if (sp && neck && sh[0] && sh[1]) { const gx = 0.94 + (g - 0.86) * 0.5, gz = 0.92 + (g - 0.86) * 0.85; sp.scale.set(gx, 1, gz); for (const b of [neck, ...sh]) b.scale.set(1 / gx, 1, 1 / gz); }
  const limb = 0.93 + (g - 0.86) * 0.38;
  for (const [a, b] of [['LeftUpLeg', 'LeftFoot'], ['RightUpLeg', 'RightFoot'], ['LeftArm', 'LeftHand'], ['RightArm', 'RightHand']]) { const A = char.getBone(a), B = char.getBone(b); if (A && B) { A.scale.set(limb, 1, limb); B.scale.set(1 / limb, 1, 1 / limb); } }
  if (head && L.headScale !== 1) head.scale.setScalar(L.headScale);
  root.updateMatrixWorld(true);
  // measure the standing height, then scale to the person's height
  let top = 1.7; char.model.traverse((m) => { if (m.isSkinnedMesh && m.visible) { try { m.computeBoundingBox(); _box.copy(m.boundingBox).applyMatrix4(m.matrixWorld); top = Math.max(top === 1.7 ? 0 : top, _box.max.y); } catch (e) { /* */ } } });
  const k = L.height / Math.max(1.2, top);
  const hp = head ? head.getWorldPosition(_v).clone() : new THREE.Vector3(0, top - 0.2, 0);
  const add = (bone, mesh, x, y, z, kind) => { if (!bone || !mesh) return; attachAt(bone, mesh, x, y, z); out.props.push(mesh); out.accKinds.push(kind); };
  for (const a of L.acc) {
    try {
      if (a.kind === 'hat') add(head, PR.hat(a.seed, a.arg), hp.x, top + 0.004, hp.z + 0.012, 'hat:' + a.arg);
      else if (a.kind === 'sunglasses' || a.kind === 'glasses') {
        // eye line from the head bone (the mesh top includes hair, which put glasses on the forehead)
        const eyeY = Math.min(top - 0.13 * L.headScale, hp.y + 0.088 * L.headScale);
        add(head, PR.sunglasses(a.seed, a.kind === 'glasses'), hp.x, eyeY, hp.z + 0.098 * L.headScale, a.kind);
      }
      else if (a.kind === 'headphones') add(head, PR.headphones(a.seed), hp.x, top + 0.01, hp.z + 0.005, a.kind);
      else if (a.slot === 'neck' && neck) { const np = neck.getWorldPosition(new THREE.Vector3()); add(spine || neck, PR[a.kind](a.seed), np.x, np.y - 0.02, np.z + 0.02, a.kind); }
      else if (a.slot === 'chest' && spine) { const s2 = spine.getWorldPosition(new THREE.Vector3()); add(spine, PR.apron(a.seed), s2.x, s2.y + 0.12, s2.z + 0.02 * g, a.kind); }
      else if (a.slot === 'waist' && hips) { const h2 = hips.getWorldPosition(new THREE.Vector3()); add(hips, PR.toolBelt(a.seed), h2.x, h2.y + 0.04, h2.z, a.kind); }
      else if (a.slot === 'back' && spine) { const s2 = spine.getWorldPosition(new THREE.Vector3()); add(spine, PR.backpack(a.seed), s2.x, s2.y + 0.02, s2.z - 0.06 * g, a.kind); }
      else if (a.slot === 'handL' && handL) { const h2 = handL.getWorldPosition(new THREE.Vector3()); const m = PR[a.kind](a.seed); add(handL, m, h2.x + 0.065, h2.y - 0.05, h2.z + 0.03, a.kind); m.userData.hang = true; } // bag hangs clear of the hip and thigh
    } catch (e) { /* a failed accessory never blocks a person */ }
  }
  if (L.carry === 'babyCarrier' && spine) { const s2 = spine.getWorldPosition(new THREE.Vector3()); add(spine, PR.babyCarrier(hashInts(L.sig.length, 7)), s2.x, s2.y + 0.1, s2.z + 0.02, 'babyCarrier'); }
  if (L.carry === 'cane' && handR) { const h2 = handR.getWorldPosition(new THREE.Vector3()); const m = PR.cane(L.sig.length); add(handR, m, h2.x, h2.y - 0.04, h2.z + 0.04, 'cane'); m.userData.hang = true; }
  root.scale.setScalar(k);
  out.height = L.height; out.scale = k; out.body = char.human?.id || null; out.pal = pal;
  return out;
}
// keep hanging items (bags, canes) vertical whatever the arm does
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
export function settleHanging(applied, root) {
  for (const m of applied.props) { if (!m.userData.hang || !m.parent) continue; m.parent.parent.getWorldQuaternion(_q); root.getWorldQuaternion(_q2); m.parent.quaternion.copy(_q.invert().multiply(_q2)); }
}
/** Signature read back from the realized character (the audit compares these, not the plan). */
export function realizedSignature(char, applied, L) {
  const p = applied.pal; const cols = p ? L.slots.map((g) => p[g.slot].getHexString()).join(',') + ',' + p[2].getHexString() : 'nopal';
  return [char.human?.id, Math.round((applied.scale || 1) * 1000), cols, applied.accKinds.join('+'), L.carry, Math.round(L.girth * 20)].join('|');
}

// archetype people (src/npc/arch): the outfit, hair and build are modelled; the look only picks garment color variants,
// the height and a few small accessories (no hats over modelled hair, no bone reshaping)
function applyArchLook(char, L, out) {
  const r = char.applyLook(L) || {};
  const head = char.getBone('Head'), neck = char.getBone('Neck'), spine = char.getBone('Spine2'), handL = char.getBone('LeftHand');
  char.root.updateMatrixWorld(true);
  const hp = head ? head.getWorldPosition(new THREE.Vector3()) : null;
  const add = (bone, mesh, x, y, z, kind) => { if (!bone || !mesh) return; attachAt(bone, mesh, x, y, z); out.props.push(mesh); out.accKinds.push(kind); };
  // the user's people (src/npc/people) are complete scans: no added glasses, necklaces or bags (they float on them)
  for (const a of (char.human?.person ? [] : L.acc || [])) {
    try {
      if ((a.kind === 'sunglasses' || a.kind === 'glasses') && hp && !char.archetype?.noGlasses) add(head, PR.sunglasses(a.seed, a.kind === 'glasses'), hp.x, hp.y + 0.085, hp.z + 0.095, a.kind);
      else if (a.slot === 'neck' && neck && spine) { const np = neck.getWorldPosition(new THREE.Vector3()); add(spine, PR[a.kind](a.seed), np.x, np.y - 0.02, np.z + 0.02, a.kind); }
      else if (a.slot === 'handL' && handL) { const h2 = handL.getWorldPosition(new THREE.Vector3()); const m = PR[a.kind](a.seed); add(handL, m, h2.x + 0.065, h2.y - 0.05, h2.z + 0.03, a.kind); m.userData.hang = true; }
    } catch (e) { /* a failed accessory never blocks a person */ }
  }
  out.height = r.height || L.height; out.scale = r.scale || 1; out.body = char.npcArch; out.pal = null;
  return out;
}
