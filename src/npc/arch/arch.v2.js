// NPC archetypes in the game (PEOPLE-LOOK track). Loads the archetype library behind play (lazily, near the player's
// places first), gives peds.js archetype people through game.npc.createPed(), and exposes an API for staged people:
//   game.npc.spawnPosed({ archetype, pose, pos: {x,y,z}, rot, seed, vary }) -> handle { root, character, setPose(p), remove() }
//   game.npc.spawnPosedAsync(same) -> Promise<handle> (loads the archetype first); place: 'bar' | 'nightlife' | 'security' ... picks one
//   game.npc.archetypes(place?) -> [{ id, gender, years, place, poses }]   game.npc.load(id) -> Promise
//   game.npc.poses() -> clip names usable as `pose`   game.npc.stats()
// Poses: idle, idle_f, idle_old, cross_arms, lean_cross, lean_wall, phone_text, talk_g, drink, photo, dance, dance_arms,
// dance_sway, bartend, shake, pour, cook, carry_tray, sit, sit_stool, sitBench, sitGround, lie, kneel (+ "_m" mirrors).
// Events: 'npc:ready' { loaded } when the first archetype set is in.
import * as THREE from 'three';
import { loadIndex, loadArchetype, getBase, loadedBases, archetypesForSync, PLACE_TAGS } from './lib.js';
import { createNpc } from './character.js';
import { createCast } from '../people/cast.js';

export const order = 110;
const LEGACY_TAG = { beach: 'beach', tourist: 'casual', street: 'casual', sport: 'sport', nightlife: 'nightlife', bar: 'bar', security: 'security', kitchen: 'kitchen', work: 'port', port: 'port', business: 'business', police: 'cop' };

export async function initV2(game) {
  if (typeof location !== 'undefined' && /[?&]npc=legacy/.test(location.search)) return;   // A/B: old library people
  const idx = await loadIndex();
  if (!idx.archetypes?.length) { console.warn('[npc] no archetypes installed'); return; }
  // the user's people (src/npc/people) come first; archetypes are the fallback while a person loads ('?people=0' = off)
  let cast = null;
  if (!(typeof location !== 'undefined' && /[?&]people=0/.test(location.search))) {
    try { cast = await createCast(game); } catch (e) { console.warn('[npc] people cast unavailable', e); cast = null; }
  }
  const active = new Map();            // archetype id -> people using it now
  const staged = new Set();
  let seedN = 1;
  const zoneOf = (x, z) => { try { return game.city?.zoneAt?.(x, z) || 'residential'; } catch (e) { return 'residential'; } };

  // ---- background loading: places around the player first, then everything, two at a time
  const queue = []; const queued = new Set();
  const want = (ids) => { for (const id of ids) if (!queued.has(id)) { queued.add(id); queue.push(id); } };
  let inflight = 0;
  function pump() {
    while (inflight < 1 && queue.length) {
      const id = queue.shift(); inflight++;
      loadArchetype(id).catch(() => null).finally(() => { inflight--; (globalThis.requestIdleCallback || ((f) => setTimeout(f, 120)))(() => pump(), { timeout: 600 }); if (loadedBases().length === 8) { try { game.emit?.('npc:ready', { loaded: 8 }); } catch (e) { /* */ } } });
    }
  }
  const P = game.player?.position;
  const z0 = P ? zoneOf(P.x, P.z) : 'residential';
  want(archetypesForSync(z0, idx).map((a) => a.id));
  want(archetypesForSync('cop', idx).map((a) => a.id));
  pump();
  // later places: whatever the player walks into (and night life after dark), one archetype at a time, never all at once
  let zT = 0;
  game.updaters?.push?.((dt) => {
    zT -= dt; if (zT > 0) return; zT = 4;
    const pp = game.player?.position; if (!pp) return;
    const h = (((game.timeOfDay ?? 14) % 24) + 24) % 24;
    want(archetypesForSync(zoneOf(pp.x, pp.z), idx).map((a) => a.id));
    if (h > 19 || h < 4) want(archetypesForSync('nightlife', idx).map((a) => a.id));
    if (game.interiors?.current || game.interiorsV2?.current) { want(archetypesForSync('nightlife', idx).map((a) => a.id)); want(archetypesForSync('bar', idx).map((a) => a.id)); want(archetypesForSync('security', idx).map((a) => a.id)); }
    pump();
  });

  function pick(zone, gender, seed) {
    let cands = archetypesForSync(zone, idx).filter((a) => getBase(a.id));
    if (gender) { const g = String(gender)[0] === 'f' ? 'f' : 'm'; const gc = cands.filter((a) => a.gender === g); if (gc.length) cands = gc; }
    if (!cands.length) return null;
    // fewest people already wearing it, ties broken by the seed
    let best = null, bs = 1e9;
    for (const a of cands) { const s = (active.get(a.id) || 0) * 10 + ((seed * 2654435761 + a.id.length * 97 + a.id.charCodeAt(2) * 13) >>> 0) % 10; if (s < bs) { bs = s; best = a; } }
    return best.id;
  }
  // people using each archetype right now (pooled characters that are hidden do not count)
  const live = new Set();
  function track(c) { live.add(c); const d = c.dispose; c.dispose = () => { live.delete(c); d(); }; return c; }
  function recount() { active.clear(); for (const c of live) if (c.root.visible && c.root.parent) active.set(c.npcArch, (active.get(c.npcArch) || 0) + 1); }
  /** for peds.js: an archetype person for a zone, or null (peds then falls back to the legacy library body) */
  function createPed(opts = {}) {
    if (cast) { try { const pc = cast.createPed(opts); if (pc) return pc; } catch (e) { console.warn('[npc] person', e); } }
    const zone = opts.zone === 'cop' || opts.outfit === 'cop' ? 'cop' : (opts.outfit || opts.zone || 'residential');
    recount();
    const id = pick(zone, opts.gender, opts.seed ?? seedN);
    if (!id) return null;
    const c = createNpc(game, { archetype: id, seed: opts.seed ?? (seedN++ * 7919), vary: 0.8 });
    if (!c) return null;
    c.zoneTag = LEGACY_TAG[(c.archetype.place || [])[0]] || 'casual'; c.human.zone = c.zoneTag;
    return track(c);
  }
  // staged people: a person whose role fits the place when one is loaded (cashier, cook, bartender, maid, lifeguard ...)
  const STAGE_PLACES = { cashier: ['shop_staff'], shop: ['shop_staff'], clerk: ['shop_staff'], shop_staff: ['shop_staff'], kitchen: ['kitchen'], cook: ['kitchen'], bar: ['bar'], bartender: ['bar'], server: ['bar', 'shop_staff'],
    hotel: ['hotel_staff'], hotel_staff: ['hotel_staff'], maid: ['hotel_staff'], bellhop: ['hotel_staff'], security: ['security'], bouncer: ['security'], lifeguard: ['lifeguard'], dock: ['dock', 'fishing'], fisherman: ['fishing', 'dock'],
    police: ['police'], cop: ['police'], medic: ['medic'], paramedic: ['medic'], farm: ['farm', 'rural'], nightlife: ['nightlife'], guest: ['nightlife', 'tourist'], shopper: ['shop_guest', 'street'] };
  function spawnPosed(o = {}) {
    let c = null;
    if (cast && !o.archetype && o.people !== false) { try { const pl = o.person ? null : (STAGE_PLACES[o.place] || (o.place ? [o.place] : null)); if (o.person || pl) c = cast.createFor(pl || [], { id: o.person, pos: o.pos, seed: o.seed, pose: o.pose || null, gender: o.gender }); } catch (e) { c = null; } }
    const id = c ? c.npcArch : (o.archetype && getBase(o.archetype) ? o.archetype : pick(o.place || 'nightlife', o.gender, o.seed ?? seedN));
    if (!id) return null;
    if (!c) c = createNpc(game, { archetype: id, seed: o.seed ?? (seedN++ * 7919), vary: o.vary ?? 0.6, pose: o.pose || null });
    if (!c) return null;
    track(c);
    const p = o.pos || { x: 0, y: 0, z: 0 };
    c.root.position.set(p.x, p.y ?? 0, p.z); c.root.rotation.y = o.rot ?? o.heading ?? 0;
    game.scene.add(c.root);
    const h = { id, root: c.root, character: c, setPose: (n) => c.setPose(n), remove() { staged.delete(h); game.scene.remove(c.root); c.dispose(); }, speed: 0, lookAt: null };
    staged.add(h);
    return h;
  }
  game.updaters?.push?.((dt) => {
    for (const h of staged) { try { h.character.update(dt, { speed: h.speed || 0, grounded: true, lookAt: h.lookAt }); } catch (e) { console.warn('[npc] staged', e); staged.delete(h); } }
  });
  // ---- promenade strollers: Ocean Drive's beach-side walk is busy from morning to night (couples, joggers, tourists)
  // Archetype people walking the promenade both ways at their own pace, spawned only while the player is near.
  const strollers = []; let promPath = null, promT = 0;
  function buildPromenade() {   // both sidewalks of Ocean Drive (beach side and hotel side)
    const nav = game.peds?._nav; if (!nav?.sidewalkNear) return null;
    const paths = [];
    for (const x0 of [3448, 3418]) {
      const pts = [];
      for (let z = -700; z <= 380; z += 16) { const q = nav.sidewalkNear({ x: x0, z }, 10); if (q && Math.abs(q.x - x0) < 14 && (!pts.length || Math.hypot(q.x - pts[pts.length - 1].x, q.z - pts[pts.length - 1].z) > 6)) pts.push({ x: q.x, z: q.z }); }
      if (pts.length > 10) paths.push(pts);
    }
    return paths.length ? paths : null;
  }
  const nearIndex = (P, pp, lo, hi) => { const c = []; P.forEach((q, i) => { const d = Math.hypot(q.x - pp.x, q.z - pp.z); if (d > lo && d < hi && i < P.length - 1) c.push(i); }); return c.length ? c[(Math.random() * c.length) | 0] : -1; };
  function promUpdate(dt) {
    promT -= dt;
    const pp = game.player?.position; if (!pp) return;
    const h = (((game.timeOfDay ?? 14) % 24) + 24) % 24;
    const near = pp.x > 3250 && pp.x < 3650 && pp.z > -800 && pp.z < 480 && !game.interiors?.current;
    const want = near && h > 7.5 && h < 23.5 ? Math.round(30 * (h > 16 && h < 21 ? 1 : 0.6)) : 0;
    if (promT <= 0) {
      promT = 1.2;
      if (want && !promPath) promPath = buildPromenade();
      if (promPath && strollers.length < want) {
        const ids = archetypesForSync('beach', idx).concat(archetypesForSync('tourist', idx), archetypesForSync('street', idx)).filter((a) => getBase(a.id));
        let pc = null; try { pc = cast ? cast.createFor(['beach_walk', 'tourist', 'beach', 'sport'], { pos: pp }) : null; } catch (e) { pc = null; }
        if (pc || ids.length) {
          const a = ids[(Math.random() * ids.length) | 0];
          const c = pc || createNpc(game, { archetype: a.id, seed: (seedN++) * 7919, vary: 0.9 });
          if (c) {
            // start at a path point not too close to the player, out of the way of the camera
            const P = promPath[(Math.random() * promPath.length) | 0];
            let i = nearIndex(P, pp, 10, 95); if (i < 0) i = (Math.random() * (P.length - 1)) | 0;
            const s = { c, P, i, f: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, lat: (Math.random() - 0.5) * 3.2, v: 0.95 + Math.random() * 0.5, gy: 0 };
            game.scene.add(c.root); track(c); strollers.push(s);
          }
        }
      }
      while (strollers.length > want) { const s = strollers.pop(); game.scene.remove(s.c.root); s.c.dispose(); }
    }
    for (const s of strollers) {
      const P = s.P;
      // people who walked far off come back around near the player (the stretch on screen stays busy)
      if (Math.hypot(P[s.i].x - pp.x, P[s.i].z - pp.z) > 140) { const j = nearIndex(P, pp, 60, 110); if (j >= 0) { s.i = j; s.f = 0; } }
      let a = P[s.i], b = P[s.i + s.dir];
      if (!b) { s.dir = -s.dir; s.lat = -s.lat; b = P[s.i + s.dir]; if (!b) continue; }
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      s.f += (s.v * dt) / L;
      if (s.f >= 1) { s.f -= 1; s.i += s.dir; a = P[s.i]; b = P[s.i + s.dir]; if (!b) { s.dir = -s.dir; s.lat = -s.lat; b = P[s.i + s.dir]; } if (!b) continue; }
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      const x = a.x + (b.x - a.x) * s.f - dz * s.lat, z = a.z + (b.z - a.z) * s.f + dx * s.lat;
      if (!s.gyT || (s.gyT -= dt) <= 0) { s.gyT = 0.5; try { s.gy = game.city?.groundHeightAt?.(x, z) ?? s.gy; } catch (e) { /* */ } }
      s.c.root.position.set(x, s.gy, z);
      const hd = Math.atan2(dx, dz); s.c.root.rotation.y += Math.atan2(Math.sin(hd - s.c.root.rotation.y), Math.cos(hd - s.c.root.rotation.y)) * Math.min(1, dt * 6);
      s.c.update(dt, { speed: s.v, grounded: true, lookAt: Math.hypot(x - pp.x, z - pp.z) < 8 ? pp : null });
    }
  }
  game.updaters?.push?.((dt) => { try { promUpdate(Math.min(dt, 0.1)); } catch (e) { console.warn('[npc] promenade', e); } });

  game.npc = {
    createPed, spawnPosed, cast,
    /** police model hook (src/gameplay/police.js): a uniformed officer from the user's people, or null */
    createCop: (o = {}) => { try { return cast ? cast.createCop(o) : null; } catch (e) { return null; } },
    /** can this pooled character be reused for `zone` at pos (role / uniqueness rules of the cast)? */
    fitsPlace: (c, zone, pos) => (cast && c?.personMeta ? cast.fits(c, zone, pos) : true),
    /** like spawnPosed, but loads the archetype first (resolves to the handle, or null) */
    spawnPosedAsync: async (o = {}) => { if (o.archetype) await loadArchetype(o.archetype).catch(() => null); else if (o.place) await Promise.all(archetypesForSync(o.place, idx).slice(0, 4).map((a) => loadArchetype(a.id).catch(() => null))); return spawnPosed(o); },
    load: (id) => loadArchetype(id),
    loadPlace: (place) => Promise.all(archetypesForSync(place, idx).map((a) => loadArchetype(a.id).catch(() => null))),
    archetypes: (place) => (place ? archetypesForSync(place, idx) : idx.archetypes).map((a) => ({ id: a.id, gender: a.gender, years: a.years, place: a.place, poses: a.poses, loaded: !!getBase(a.id) })),
    poses: () => { const b = loadedBases()[0]; return b ? Object.keys(b.clips) : []; },
    places: () => Object.keys(PLACE_TAGS),
    peopleStats: () => cast?.stats?.() || null,
    stats: () => ({ total: idx.archetypes.length, loaded: loadedBases().length, queued: queue.length, staged: staged.size, strollers: strollers.length, active: Object.fromEntries(active) }),
  };
}
