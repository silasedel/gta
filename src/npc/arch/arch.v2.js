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

export const order = 110;
const LEGACY_TAG = { beach: 'beach', tourist: 'casual', street: 'casual', sport: 'sport', nightlife: 'nightlife', bar: 'bar', security: 'security', kitchen: 'kitchen', work: 'port', port: 'port', business: 'business', police: 'cop' };

export async function initV2(game) {
  if (typeof location !== 'undefined' && /[?&]npc=legacy/.test(location.search)) return;   // A/B: old library people
  const idx = await loadIndex();
  if (!idx.archetypes?.length) { console.warn('[npc] no archetypes installed'); return; }
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
    const zone = opts.zone === 'cop' || opts.outfit === 'cop' ? 'cop' : (opts.outfit || opts.zone || 'residential');
    recount();
    const id = pick(zone, opts.gender, opts.seed ?? seedN);
    if (!id) return null;
    const c = createNpc(game, { archetype: id, seed: opts.seed ?? (seedN++ * 7919), vary: 0.8 });
    if (!c) return null;
    c.zoneTag = LEGACY_TAG[(c.archetype.place || [])[0]] || 'casual'; c.human.zone = c.zoneTag;
    return track(c);
  }
  function spawnPosed(o = {}) {
    const id = o.archetype && getBase(o.archetype) ? o.archetype : pick(o.place || 'nightlife', o.gender, o.seed ?? seedN);
    if (!id) return null;
    const c = createNpc(game, { archetype: id, seed: o.seed ?? (seedN++ * 7919), vary: o.vary ?? 0.6, pose: o.pose || null });
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
  game.npc = {
    createPed, spawnPosed,
    /** like spawnPosed, but loads the archetype first (resolves to the handle, or null) */
    spawnPosedAsync: async (o = {}) => { if (o.archetype) await loadArchetype(o.archetype).catch(() => null); else if (o.place) await Promise.all(archetypesForSync(o.place, idx).slice(0, 4).map((a) => loadArchetype(a.id).catch(() => null))); return spawnPosed(o); },
    load: (id) => loadArchetype(id),
    loadPlace: (place) => Promise.all(archetypesForSync(place, idx).map((a) => loadArchetype(a.id).catch(() => null))),
    archetypes: (place) => (place ? archetypesForSync(place, idx) : idx.archetypes).map((a) => ({ id: a.id, gender: a.gender, years: a.years, place: a.place, poses: a.poses, loaded: !!getBase(a.id) })),
    poses: () => { const b = loadedBases()[0]; return b ? Object.keys(b.clips) : []; },
    places: () => Object.keys(PLACE_TAGS),
    stats: () => ({ total: idx.archetypes.length, loaded: loadedBases().length, queued: queue.length, staged: staged.size, active: Object.fromEntries(active) }),
  };
}
