// Cast of the street (PEOPLE helper): which of the user's people stands where.
// Roles drive places: police through the police model hook (createCop), cashiers / cooks / bartenders / maids for
// staged staff (spawnPosed), lifeguards and swimwear on the beach, fishermen and boat captains at docks and in the Keys,
// farmers in the countryside, suits downtown, tourists on Ocean Drive. Every person is unique: a person never appears
// twice within NEAR_DUP meters, and small per-spawn variation (height +-3 %, a slight warmth / value shift) keeps a
// returning face from looking stamped. People load lazily (places around the player first), at most one at a time in
// idle time, and are unloaded again when unused (LRU, CAP loaded at once).
import * as THREE from 'three';
import { loadPeopleIndex, loadPerson, getPerson, loadedPeople, isLoadingPerson, personMaterial, hiRes, unloadPerson } from './lib.js';
import { createNpc, LOD_CFG } from '../arch/character.js';

export const NEAR_DUP = 140;     // m: the same person never twice inside this radius
const CAP = 34;                  // people loaded at once (GPU textures ~8 MB each)
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
  const want = (ids) => { for (const id of ids) if (!queued.has(id) && !getPerson(id)) { queued.add(id); queue.push(id); } };
  function wantPlaces(places, n = 8) {
    const c = people.filter((p) => has(p, places)).sort((a, b) => rank(a, places) - rank(b, places) || Math.random() - 0.5);
    want(c.slice(0, n).map((p) => p.id));
  }
  const idle = (f) => (globalThis.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 60));
  function pump() {
    while (inflight < 1 && queue.length) {
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
    const inUse = new Set(); for (const c of live) inUse.add(c.npcArch);
    const cands = L.filter((b) => !inUse.has(b.id) && !queued.has(b.id)).sort((a, b) => (lastUse.get(a.id) || 0) - (lastUse.get(b.id) || 0));
    for (let i = 0; i < cands.length && loadedPeople().length > CAP; i++) unloadPerson(cands[i].id);
  }

  // ---------------------------------------------------------------- picking
  const _p = new THREE.Vector3();
  function pick(places, pos, opts = {}) {
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
        if (c.npcArch !== b.id || !c.root.parent || !c.root.visible) continue;
        n++; if (pos) near = Math.min(near, Math.hypot(c.root.position.x - pos.x, c.root.position.z - pos.z));
      }
      if (n && (!pos || near < NEAR_DUP)) continue;        // never the same person close by
      if (n) s *= 0.25 / n;                                  // far away twin: only when nothing else fits
      const lu = lastUse.get(b.id); if (lu && t - lu < 90) s *= 0.5 + 0.5 * (t - lu) / 90;  // strangers are rarely seen again
      if (s > bs) { bs = s; best = b; }
    }
    // ask for more people of these places (so the next spawn has fresh faces)
    const loadedN = people.filter((p) => has(p, places) && getPerson(p.id)).length;
    if (loadedN < 10) { wantPlaces(places, loadedN + 4); pump(); }
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
    const b = pick(places, pos, opts);
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
  /** staged person for a place (shop staff, kitchen, bar, hotel, lifeguard, dock ...), or null */
  function createFor(place, opts = {}) {
    const b = (opts.id && getPerson(opts.id)) || pick(Array.isArray(place) ? place : [place], opts.pos, opts);
    return b ? make(b, opts) : null;
  }
  /** can a pooled person character be reused for this zone here? */
  function fits(c, zone, pos) {
    const p = c.personMeta; if (!p) return true;
    if (zone === 'cop') return p.places.includes('police');
    if (p.places.includes('police') || p.places.includes('police_swat')) return false;
    const places = placesFor(zone, null, ctxAt(pos));
    if (!has(p, places)) return false;
    if (pos) for (const o of live) if (o !== c && o.npcArch === c.npcArch && o.root.visible && o.root.parent && Math.hypot(o.root.position.x - pos.x, o.root.position.z - pos.z) < NEAR_DUP) return false;
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
      if (cam) { const d = c.root.position.distanceTo(cam); if (d < 9) near.push([d, c.npcArch]); }
    }
    near.sort((x, y) => x[0] - y[0]); for (const [, id] of near.slice(0, 3)) lv.set(id, 2);
    for (const [id, l] of lv) { const cur = hiOn.get(id); if (!cur || cur.lv < l || (cur.lv > l && t - cur.t > 4)) { const b = getPerson(id); if (b) hiRes(b, l); hiOn.set(id, { lv: l, t }); } else if (cur.lv === l) cur.t = t; }
    for (const [id, cur] of hiOn) if (!lv.has(id) && t - cur.t > 6) { const b = getPerson(id); if (b) hiRes(b, 0); hiOn.delete(id); }
  });

  // ---------------------------------------------------------------- warm the places around the player
  let zT = 0;
  game.updaters?.push?.((dt) => {
    zT -= dt; if (zT > 0) return; zT = 4;
    const pp = game.player?.position; if (!pp) return;
    const ctx = ctxAt(pp); const z = zoneAt(pp.x, pp.z);
    wantPlaces(placesFor(z, null, ctx), 10);
    if (z === 'beach') wantPlaces(['beach', 'swim'], 6);
    if (game.wanted?.level) wantPlaces(ctx.swat ? ['police_swat', 'police'] : ['police'], 4);
    pump();
  });
  { const pp = game.player?.position; const ctx = ctxAt(pp); wantPlaces(['police'], 2); if (pp) wantPlaces(placesFor(zoneAt(pp.x, pp.z), null, ctx), 12); wantPlaces(['street', 'residential'], 6); pump(); }

  /** far crowd tier (src/npc/crowd.js): any of the user's people for this zone (needs no loading: index palette only) */
  const farPool = new Map();
  function farPerson(zone, pos) {
    const ctx = ctxAt(pos); const places = placesFor(zone, null, ctx);
    const key = places.join(',');
    let L = farPool.get(key);
    if (!L) { L = people.filter((p) => p.cols && has(p, places) && !p.places.includes('police') && !p.places.includes('police_swat')); farPool.set(key, L); }
    if (!L.length) return null;
    // first places weigh more
    for (let t = 0; t < 4; t++) { const p = L[(Math.random() * L.length) | 0]; if (Math.random() < 1 / (1 + rank(p, places) * 0.5)) return p; }
    return L[(Math.random() * L.length) | 0];
  }
  return {
    people, createPed, createCop, createFor, fits, placesFor, farPerson, pick: (places, pos) => pick(places, pos),
    make, want: (ids) => { want(ids); pump(); }, wantPlaces: (pl, n) => { wantPlaces(pl, n); pump(); },
    stats: () => ({ total: people.length, loaded: loadedPeople().length, queued: queue.length, live: live.size, visible: [...live].filter((c) => c.root.visible && c.root.parent).length, hi: hiOn.size, lodMax: LOD_CFG.maxFull }),
    live,
  };
}
