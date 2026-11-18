// Cast of the street (PEOPLE helper): which of the user's people stands where.
// Roles drive places: police through the police model hook (createCop), cashiers / cooks / bartenders / maids for
// staged staff (spawnPosed), lifeguards and swimwear on the beach, fishermen and boat captains at docks and in the Keys,
// farmers in the countryside, suits downtown, tourists on Ocean Drive. Every person is unique: a person never appears
// twice within NEAR_DUP meters, and small per-spawn variation (height +-3 %, a slight warmth / value shift) keeps a
// returning face from looking stamped. People load lazily (places around the player first), at most one at a time in
// idle time, and are unloaded again when unused (LRU, CAP loaded at once).
import * as THREE from 'three';
import { loadPeopleIndex, loadPerson, getPerson, loadedPeople, isLoadingPerson, personMaterial, hiRes, unloadPerson } from './lib.js';
import { createNpc, LOD_CFG, SHADOW_PROXY } from '../arch/character.js';
import { FAR_IN_USE } from './farCrowd.js';

export const NEAR_DUP = 320;     // m: the same person never twice inside this radius (= the crowd despawn radius: no twins on screen)
const CAP = 48;                  // people loaded at once (crowd textures ~8 MB each; close-up sets stream separately)
// person place -> the legacy zone tag peds.js pools by
const TAG = { police: 'cop', police_swat: 'cop', business: 'business', beach: 'beach', swim: 'beach', lifeguard: 'beach', beach_walk: 'beach', nightlife: 'nightlife', bar: 'nightlife', work: 'port', port: 'port', industrial: 'port', dock: 'port', fishing: 'port', sport: 'sport', park: 'sport' };

/** ordered person places for a ped zone / activity / spot */
export function placesFor(zone, act, ctx = {}) {
  const keys = ctx.keys, rough = ctx.rough, night = ctx.night;
  if (zone === 'cop' || zone === 'police') return ctx.swat ? ['police_swat', 'police'] : ['police'];
  if (act === 'sunbathe' || act === 'swim' || act === 'wade' || act === 'volley' || act === 'frisbee') return ['beach', 'swim'];
  if (act === 'jog') return ['sport'];
  if (act === 'dog') return keys ? ['keys', 'residential'] : ['residential', 'street'];
  switch (zone) {
    case 'beach': case 'water': return night ? ['beach_walk', 'tourist', 'nightlife'] : ['beach_walk', 'beach', 'tourist'];
    case 'business': case 'downtown': return night ? ['business', 'nightlife', 'street'] : ['business', 'business', 'street'];
    case 'commercial': return keys ? ['keys', 'tourist', 'street'] : ['street', 'tourist', 'shop_guest', 'business'];
    case 'nightlife': case 'night': case 'club': return ['nightlife', 'tourist', 'street'];
    case 'port': case 'industrial': return ['work', 'port', 'industrial'];
    case 'rural': case 'wilderness': return keys ? ['keys', 'rural', 'dock'] : ['rural', 'farm', 'work'];
    case 'park': case 'causeway': return ['sport', 'park', 'street', 'tourist'];
    case 'airport': return ['tourist', 'business', 'street'];
    case 'dock': case 'fishing': return ['dock', 'fishing', 'keys'];
    // venue / interior roles (src/world/interiors/venuePeople.js passes the role as the outfit)
    case 'bartender': return ['bar'];
    case 'server': case 'barista': case 'host': return ['bar', 'shop_staff'];
    case 'cashier': case 'clerk': case 'shop': case 'shop_staff': return ['shop_staff'];
    case 'cook': case 'kitchen': case 'chef': return ['kitchen'];
    case 'bouncer': case 'security': return ['security'];
    case 'club': case 'guest': case 'dj': return ['nightlife', 'tourist'];
    case 'hotel': case 'maid': case 'bellhop': return ['hotel_staff'];
    case 'gang': return ['gang', 'rough'];
    case 'hospital': case 'nurse': case 'paramedic': return ['medic'];
    case 'fire_station': case 'firefighter': return ['fire'];
    case 'garage': case 'mechanic': return ['work', 'industrial'];
    case 'bank': return ['security', 'business'];
    case 'valet': return ['hotel_staff'];
    case 'casual': return keys ? ['keys', 'street', 'tourist'] : ['street', 'shop_guest', 'tourist', 'residential'];
    case 'residential': default:
      if (keys) return ['keys', 'residential', 'dock', 'tourist'];
      if (rough) return ['rough', 'street', 'residential'];
      return ['residential', 'street'];
  }
}

export async function createCast(game) {
  const idx = await loadPeopleIndex();
  const people = idx.people || [];
  if (!people.length) return null;
  const byId = new Map(people.map((p) => [p.id, p]));
  const live = new Set();                  // person characters alive (visible or pooled)
  const lastUse = new Map();               // id -> time last spawned
  const now = () => performance.now() / 1000;
  const hour = () => (((game.timeOfDay ?? 14) % 24) + 24) % 24;
  const districtAt = (x, z) => { try { return String(game.city?.districtAt?.(x, z) || ''); } catch (e) { return ''; } };
  const zoneAt = (x, z) => { try { return game.city?.zoneAt?.(x, z) || 'residential'; } catch (e) { return 'residential'; } };
  const ctxAt = (pos) => {
    if (!pos) return {};
    const d = districtAt(pos.x, pos.z);
    return { keys: /Key|Marathon|Islamorada|Tavernier/i.test(d) || pos.z > 4300, rough: /Overtown|Liberty/i.test(d), night: hour() > 20 || hour() < 5, swat: (game.wanted?.level || 0) >= 4 };
  };
  const has = (p, places) => p.places.some((x) => places.includes(x));
  const rank = (p, places) => { let best = 9; for (const x of p.places) { const i = places.indexOf(x); if (i >= 0 && i < best) best = i; } return best; };

  // ---------------------------------------------------------------- loading (one at a time, idle time)
  const queue = []; const queued = new Set(); let inflight = 0; let warmQ = [];
  // urgent wants (the place the player is in now) go to the front of the queue
  const want = (ids, urgent = false) => {
    for (const id of ids) {
      if (getPerson(id)) continue;
      if (queued.has(id)) { if (urgent) { const i = queue.indexOf(id); if (i > 0) { queue.splice(i, 1); queue.unshift(id); } } continue; }
      queued.add(id); if (urgent) queue.unshift(id); else queue.push(id);
    }
  };
  function wantPlaces(places, n = 8, urgent = false) {
    const c = people.filter((p) => has(p, places)).sort((a, b) => rank(a, places) - rank(b, places) || Math.random() - 0.5);
    want(c.slice(0, n).map((p) => p.id).reverse(), urgent);
  }
  const idle = (f) => (globalThis.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 60));
  function pump() {
    while (inflight < 2 && queue.length) {
      const id = queue.shift(); inflight++;
      loadPerson(id).then((b) => { warmQ.push(b); }).catch(() => null).finally(() => { inflight--; queued.delete(id); idle(() => { trim(); pump(); }); });
    }
  }
  // upload a fresh person's textures one per frame (no first-render hitch)
  game.updaters?.push?.(() => {
    const b = warmQ[0]; if (!b) return;
    const r = game.renderer; const t = [b.tex.a, b.tex.n, b.tex.o].find((x) => x && !x.userData.warm);
    if (!t) { warmQ.shift(); return; }
    try { r.initTexture(t); } catch (e) { /* */ } t.userData.warm = true;
  });
  // unload people nobody uses (keep CAP)
  function trim() {
    const L = loadedPeople(); if (L.length <= CAP) return;
    const inUse = new Set(FAR_IN_USE); for (const c of live) inUse.add(c.npcArch);
    // police stay resident (a wanted level must never fall back to old bodies while an officer reloads)
    const cands = L.filter((b) => !inUse.has(b.id) && !queued.has(b.id) && !(byId.get(b.id)?.places || []).some((x) => x === 'police' || x === 'police_swat')).sort((a, b) => (lastUse.get(a.id) || 0) - (lastUse.get(b.id) || 0));
    for (let i = 0; i < cands.length && loadedPeople().length > CAP; i++) unloadPerson(cands[i].id);
  }

  // ---------------------------------------------------------------- picking
  const _p = new THREE.Vector3(), _wp = new THREE.Vector3();
  // world position of a person (people seated in cars live in the car shell's space)
  const at = (c) => (c.inCar && c.root.parent ? c.root.getWorldPosition(_wp) : c.root.position);
  // user (Nov 17): every NPC must be one of the user's people, repeats are fine: when every fitting person already has a
  // copy close by, a repeat is allowed beyond REPEAT_MIN meters (never two copies of one person side by side)
  const REPEAT_MIN = 45;
  function pick(places, pos, opts = {}) {
    const b0 = pickStrict(places, pos, opts, NEAR_DUP);
    return b0 || pickStrict(places, pos, opts, REPEAT_MIN);
  }
  function pickStrict(places, pos, opts = {}, minDist = NEAR_DUP) {
    const g = opts.gender ? (String(opts.gender)[0] === 'f' ? 'f' : 'm') : null;
    let best = null, bs = -1;
    const t = now();
    for (const b of loadedPeople()) {
      const p = byId.get(b.id); if (!p || !has(p, places)) continue;
      if (g && p.g !== g) continue;
      if (opts.exclude?.has(b.id)) continue;
      let s = (1 / (1 + rank(p, places) * 0.6)) * (0.55 + Math.random() * 0.45);
      let near = 1e9, n = 0;
      for (const c of live) {
        if (c.npcArch !== b.id) continue;
        // a pooled (hidden) copy counts as right here: the pool reuses it instead of a second copy being made
        n++; near = !c.root.visible || !pos ? 0 : Math.min(near, Math.hypot(at(c).x - pos.x, at(c).z - pos.z));
      }
      if (n && (!pos || near < minDist)) continue;        // never the same person close by
      if (n) s *= 0.25 / n;                                  // far away twin: only when nothing else fits
      const lu = lastUse.get(b.id); if (lu && t - lu < 90) s *= 0.5 + 0.5 * (t - lu) / 90;  // strangers are rarely seen again
      if (s > bs) { bs = s; best = b; }
    }
    // ask for more people of these places (so the next spawn has fresh faces)
    const loadedN = people.filter((p) => has(p, places) && getPerson(p.id)).length;
    if (loadedN < 14) { wantPlaces(places, loadedN + 6, true); pump(); }
    return best;
  }
  function make(b, opts = {}) {
    const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    const sr = ((seed * 2654435761) >>> 0) / 4294967296;
    const c = createNpc(game, { base: b, seed, vary: 0.6, personMaterial, tint: opts.tint ?? (1 + (seed % 4)), scale: opts.scale ?? (0.97 + sr * 0.06), pose: opts.pose || null, personality: opts.personality });
    if (!c) return null;
    const p = byId.get(b.id);
    c.zoneTag = TAG[p.places[0]] || 'casual'; c.human.zone = c.zoneTag;
    c.personMeta = p;
    if (opts.pos) c.root.position.set(opts.pos.x, opts.pos.y || 0, opts.pos.z);   // so the next pick in this frame sees it here
    c._born = now();
    live.add(c); lastUse.set(b.id, now());
    const d = c.dispose; c.dispose = () => { live.delete(c); d(); };
    return c;
  }

  /** for peds.js: a person for this zone / activity at pos, or null (peds then uses the archetypes) */
  function createPed(opts = {}) {
    const pos = opts.pos || game.player?.position;
    const ctx = ctxAt(pos);
    const zone = opts.zone === 'cop' || opts.outfit === 'cop' ? 'cop' : (opts.outfit || opts.zone || zoneAt(pos?.x || 0, pos?.z || 0));
    const places = placesFor(zone, opts.act, ctx);
    let b = pick(places, pos, opts);
    // a person the game needs right now (a mission victim, a shop owner): the best loaded civilian when none of this
    // place is in yet (never police / lifeguards; never a twin within 60 m)
    if (!b && opts.force) b = anyCivilian(pos, opts);
    return b ? make(b, opts) : null;
  }
  /** police model hook: a uniformed officer (SWAT armor at 4+ stars), or null */
  function createCop(opts = {}) {
    const pos = opts.pos || game.player?.position;
    const swat = (game.wanted?.level || 0) >= 4;
    const places = swat ? ['police_swat', 'police'] : ['police'];
    // officers in one squad may share a uniform model, but never the same person right next to each other
    let b = pick(places, pos, opts);
    if (!b) { const L = loadedPeople().filter((x) => has(byId.get(x.id), places)); b = L.length ? L[(Math.random() * L.length) | 0] : null; }
    if (!b) { wantPlaces(['police', 'police_swat'], 6); pump(); return null; }
    const c = make(b, opts); if (c) { c.zoneTag = 'cop'; c.human.zone = 'cop'; }
    return c;
  }
  function anyCivilian(pos, opts = {}) {
    let best = null, bs = -1; const g = opts.gender ? (String(opts.gender)[0] === 'f' ? 'f' : 'm') : null;
    for (const x of loadedPeople()) {
      const p = byId.get(x.id); if (!p || NO_CAR(p) || p.age === 'kid' || opts.exclude?.has?.(x.id)) continue;   // mission / event stand-ins are never kids
      let near = 1e9; for (const c of live) if (c.npcArch === x.id) near = !c.root.visible || !pos ? 0 : Math.min(near, Math.hypot(at(c).x - pos.x, at(c).z - pos.z));
      if (near < 60) continue;
      const s = Math.min(near, 400) + Math.random() * 50 + (g && p.g === g ? 500 : 0); if (s > bs) { bs = s; best = x; }
    }
    return best;
  }
  /** a driver / passenger for a car at pos: a person of the area (never police, lifeguards or people in swimwear), or null
   *  while none is loaded. Seated people are only seen through glass, so a far twin is allowed before an empty car. */
  const NO_CAR = (p) => p.places.some((x) => x === 'police' || x === 'police_swat' || x === 'lifeguard' || x === 'swim');
  function createDriver(opts = {}) {
    const pos = opts.pos || game.player?.position;
    const ctx = ctxAt(pos);
    const zone = zoneAt(pos?.x || 0, pos?.z || 0);
    const pl = placesFor(zone === 'beach' || zone === 'water' ? 'casual' : zone, null, ctx).filter((x) => x !== 'swim' && x !== 'beach');
    const places = opts.role === 'passenger' ? pl.concat(['tourist', 'street']) : pl.concat(['business', 'work', 'street']);
    const ex = new Set(opts.exclude || []);
    const maxH = Number.isFinite(opts.maxHeight) ? opts.maxHeight : Infinity;
    for (const p of people) if ((p.height || 1.75) > maxH || NO_CAR(p) || (opts.role !== 'passenger' && (p.age === 'kid' || p.age === 'teen' || (p.years || 30) < 17))) ex.add(p.id);   // kids ride, never drive
    let b = pick(places, pos, { ...opts, exclude: ex });
    if (!b) {   // relaxed: any loaded civilian, a twin only when 60 m away or more
      let best = null, bs = -1;
      for (const x of loadedPeople()) {
        if (ex.has(x.id)) continue;
        let near = 1e9; for (const c of live) if (c.npcArch === x.id) near = !c.root.visible || !pos ? 0 : Math.min(near, Math.hypot(at(c).x - pos.x, at(c).z - pos.z));
        if (near < 60) continue;
        const s = Math.min(near, 400) + Math.random() * 50; if (s > bs) { bs = s; best = x; }
      }
      b = best;
    }
    if (!b) return null;
    const c = make(b, { ...opts, pos: null });
    if (c) c.inCar = true;
    return c;
  }
  /** staged person for a place (shop staff, kitchen, bar, hotel, lifeguard, dock ...), or null */
  function createFor(place, opts = {}) {
    const b = (opts.id && getPerson(opts.id)) || pick(Array.isArray(place) ? place : [place], opts.pos, opts) || (opts.force ? anyCivilian(opts.pos, opts) : null);
    return b ? make(b, opts) : null;
  }
  /** can a pooled person character be reused for this zone here? */
  function fits(c, zone, pos) {
    const p = c.personMeta; if (!p) return true;
    if (zone === 'cop') return p.places.includes('police');
    if (p.places.includes('police') || p.places.includes('police_swat')) return false;
    const places = placesFor(zone, null, ctxAt(pos));
    if (!has(p, places)) return false;
    if (pos) for (const o of live) if (o !== c && o.npcArch === c.npcArch && o.root.visible && o.root.parent && Math.hypot(at(o).x - pos.x, at(o).z - pos.z) < NEAR_DUP) return false;
    return true;
  }

  // ---------------------------------------------------------------- close-up textures (user: full resolution up close)
  // full-detail people (LOD0) get the 2K albedo; the three nearest within 9 m get the full 4K albedo + 2K normal
  const hiOn = new Map();   // id -> { lv, t }
  let hiT = 0;
  game.updaters?.push?.((dt) => {
    hiT -= dt; if (hiT > 0) return; hiT = 0.4;
    const t = now(); const cam = game.camera?.position; const lv = new Map(); const near = [];
    for (const c of live) {
      if (!c.root.visible || !c.root.parent || c.lodLevel !== 0) continue;
      lv.set(c.npcArch, Math.max(lv.get(c.npcArch) || 0, 1));
      if (cam) { const d = at(c).distanceTo(cam); if (d < 9) near.push([d, c.npcArch]); }
    }
    near.sort((x, y) => x[0] - y[0]); for (const [, id] of near.slice(0, 3)) lv.set(id, 2);
    for (const [id, l] of lv) { const cur = hiOn.get(id); if (!cur || cur.lv < l || (cur.lv > l && t - cur.t > 4)) { const b = getPerson(id); if (b) hiRes(b, l); hiOn.set(id, { lv: l, t }); } else if (cur.lv === l) cur.t = t; }
    for (const [id, cur] of hiOn) if (!lv.has(id) && t - cur.t > 6) { const b = getPerson(id); if (b) hiRes(b, 0); hiOn.delete(id); }
  });

  // ---------------------------------------------------------------- shadow proxies: shadow cameras also see the shadow-only layer
  // (full-detail people cast their shadow with LOD1; '?pshadow=0' turns it off for A/B)
  if (!(typeof location !== 'undefined' && /[?&]pshadow=0/.test(location.search))) {
    let lt = 0;
    // (only with the split sun: shadow casters are tested against the main camera's layers, which the split renderer
    // sets to the dynamic layer for the per-frame map; without it a layer-only proxy would never cast, so LOD0 casts itself)
    const enable = () => (game.__psSplit ? 1 : 0);
    if (enable()) SHADOW_PROXY.on = true;
    game.updaters?.push?.((dt) => { lt -= dt; if (lt > 0) return; lt = 5; if (enable()) SHADOW_PROXY.on = true; });
  }

  // ---------------------------------------------------------------- role posts: lifeguards on the sand by day, fishermen at the docks
  const posts = []; let postT = 2;
  const isWater = (x, z) => { try { return !!game.city?.isWater?.(x, z); } catch (e) { return false; } };
  const gy = (x, z) => { try { const g = game.city?.groundHeightAt?.(x, z, 2); return Number.isFinite(g) ? g : 0; } catch (e) { return 0; } };
  function addPost(kind, places, x, z, heading, pose) {
    const b = pick(places, { x, z }); if (!b) return false;
    const c = make(b, { pose }); if (!c) return false;
    c.root.position.set(x, gy(x, z), z); c.root.rotation.y = heading; game.scene.add(c.root);
    posts.push({ kind, c, x, z }); return true;
  }
  function waterDir(x, z) { let best = null; for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; for (const r of [8, 16, 30]) if (isWater(x + Math.sin(a) * r, z + Math.cos(a) * r)) { if (!best || r < best.r) best = { a, r }; break; } } return best; }
  game.updaters?.push?.((dt) => {
    for (const p of posts) p.c.update(dt, { speed: 0, grounded: true, lookAt: game.player?.position && p.c.root.position.distanceTo(game.player.position) < 7 ? game.player.position : null });
    postT -= dt; if (postT > 0) return; postT = 2;
    const pp = game.player?.position; if (!pp || game.interiors?.current) return;
    for (let i = posts.length - 1; i >= 0; i--) { const p = posts[i]; if (Math.hypot(p.x - pp.x, p.z - pp.z) > 220) { game.scene.remove(p.c.root); p.c.dispose(); posts.splice(i, 1); } }
    const h = hour(); const z0 = zoneAt(pp.x, pp.z); const nav = game.peds?._nav;
    // lifeguard: one per ~150 m of beach, 8:00-19:00, on the sand near the water, facing the sea
    if (nav && h > 8 && h < 19 && (z0 === 'beach' || z0 === 'water') && posts.filter((p) => p.kind === 'lifeguard').length < 2) {
      const s = nav.sandPoint?.(pp, 120, true);
      if (s && !posts.some((p) => p.kind === 'lifeguard' && Math.hypot(p.x - s.x, p.z - s.z) < 150) && Math.hypot(s.x - pp.x, s.z - pp.z) > 25) {
        const w = waterDir(s.x, s.z); if (w) addPost('lifeguard', ['lifeguard'], s.x, s.z, w.a, Math.random() < 0.5 ? 'cross_arms' : 'idle');
      }
    }
    // dock people: at a mooring, standing on the closest dry spot beside the boat, looking at the water
    if (h > 6 && h < 20 && posts.filter((p) => p.kind === 'dock').length < 3) {
      let ms = []; try { ms = game.city?.moorings?.(pp.x, pp.z, 160) || []; } catch (e) { ms = []; }
      for (const m of ms) {
        if (posts.some((p) => Math.hypot(p.x - m.x, p.z - m.z) < 40)) continue;
        if (Math.hypot(m.x - pp.x, m.z - pp.z) < 20) continue;
        let spot = null;
        for (let r = 3; r <= 12 && !spot; r += 1.5) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const x = m.x + Math.sin(a) * r, z = m.z + Math.cos(a) * r; if (!isWater(x, z) && !isWater(x + Math.sin(a) * 1.2, z + Math.cos(a) * 1.2)) { spot = { x, z, a: a + Math.PI }; break; } }
        if (spot && addPost('dock', ['fishing', 'dock'], spot.x, spot.z, spot.a, Math.random() < 0.4 ? 'cross_arms' : 'idle')) break;
      }
    }
  });

  // ---------------------------------------------------------------- warm the places around the player
  let zT = 0;
  game.updaters?.push?.((dt) => {
    zT -= dt; if (zT > 0) return; zT = 4;
    const pp = game.player?.position; if (!pp) return;
    const ctx = ctxAt(pp); const z = zoneAt(pp.x, pp.z);
    wantPlaces(placesFor(z, null, ctx), 14, true);
    if (z === 'beach') wantPlaces(['beach', 'swim'], 6);
    if (game.wanted?.level) wantPlaces(ctx.swat ? ['police_swat', 'police'] : ['police'], 4);
    pump();
  });
  { const pp = game.player?.position; const ctx = ctxAt(pp); wantPlaces(['police', 'police_swat'], 10); if (pp) wantPlaces(placesFor(zoneAt(pp.x, pp.z), null, ctx), 12); wantPlaces(['street', 'residential'], 6); pump(); }

  /** far crowd tier (src/npc/crowd.js): any of the user's people for this zone (needs no loading: index palette only) */
  const farPool = new Map();
  function farPerson(zone, pos, act = null) {
    const ctx = ctxAt(pos); const places = placesFor(zone, act, ctx);
    const key = places.join(',');
    let L = farPool.get(key);
    if (!L) { L = people.filter((p) => p.cols && has(p, places) && !p.places.includes('police') && !p.places.includes('police_swat')); farPool.set(key, L); }
    if (!L.length) return null;
    // the far tier draws the real person (src/npc/people/farCrowd.js): only people already loaded
    const LL = L.filter((p) => getPerson(p.id)); if (LL.length) L = LL;
    // first places weigh more
    for (let t = 0; t < 4; t++) { const p = L[(Math.random() * L.length) | 0]; if (Math.random() < 1 / (1 + rank(p, places) * 0.5)) return p; }
    return L[(Math.random() * L.length) | 0];
  }
  return {
    people, createPed, createCop, createDriver, createFor, fits, placesFor, farPerson, pick: (places, pos) => pick(places, pos),
    make, get: getPerson, want: (ids) => { want(ids); pump(); }, wantPlaces: (pl, n) => { wantPlaces(pl, n); pump(); },
    posts,
    stats: () => ({ posts: posts.map((p) => p.kind + ':' + p.c.npcArch), total: people.length, loaded: loadedPeople().length, queued: queue.length, live: live.size, visible: [...live].filter((c) => c.root.visible && c.root.parent).length, hi: hiOn.size, lodMax: LOD_CFG.maxFull }),
    live,
  };
}
