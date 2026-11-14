// Nico's house: a weathered Keys stilt house on the water (track: nico-house). Top-priority set piece of V2.
//
//   const house = await buildNicoHouse(THREE, opts)
//   house = { group, colliders, interact, lights, update(dt, env), anchors, loaded, stats, plan, setTime(h) }
//
// Pure builder: needs only THREE (and three/addons). House-local meters, +X east, +Z south (street side), yard grade y = 0,
// water at y = opts.seaY (default -1.0) on the north and east sides. Place `group` in the world; colliders, interaction
// points, lights and anchors are all in the same house-local frame (use group.matrixWorld to convert).
//   colliders: [{ shape:'box'|'cyl', p:[x,y,z], h:[hx,hy,hz] | r,hh, q:[x,y,z,w], tag, id?, enabled }]   (enabled may change: doors)
//   interact:  [{ id, kind, label | label(), pos: Vector3, radius, use(env) }]   env = { game?, emit(name, data), notify(text) }
//   lights:    [{ id, pos:[x,y,z], color, intensity, range, on: bool }]          (on changes with switches and time of day)
//   anchors:   { spawn, bed, wardrobe, dock, carport, truck, bike, kayak, skiff, ... } each { pos: Vector3, heading }
//   update(dt, env): env = { timeOfDay, camera?: Vector3 in house-local space, game? }
// Parts live in ./parts/*.js; each exports `order` and `build(ctx)` and is picked up automatically.
import { createKit, createContext } from './kit.js';
import { PLAN, WALLS, PARTITIONS } from './plan.js';

const partMods = import.meta.glob('./parts/*.js', { eager: true });

export async function buildNicoHouse(THREE, opts = {}) {
  const plan = { ...PLAN, seaY: opts.seaY ?? PLAN.seaY, WALLS, PARTITIONS };
  const kit = createKit(THREE, { ...opts, seaY: plan.seaY });
  opts = { ...opts, residentName: opts.residentName ?? 'N. Marrero' };
  const ctx = createContext(THREE, kit, plan, opts);
  ctx.time = opts.timeOfDay ?? 9;
  const parts = Object.entries(partMods).map(([k, m]) => ({ name: k.replace(/^.*\/|\.js$/g, ''), order: m.order ?? 100, build: m.build })).filter((p) => typeof p.build === 'function')
    .filter((p) => !opts.only || opts.only.includes(p.name)).filter((p) => !opts.skip || !opts.skip.includes(p.name))
    .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : 1));
  const t0 = performance.now(), partMs = {};
  for (const p of parts) {
    const t1 = performance.now();
    try { await p.build(ctx); } catch (e) { console.error(`[nicoHouse] part "${p.name}" failed`, e); (ctx.stats.failed ||= []).push(p.name); }
    partMs[p.name] = Math.round(performance.now() - t1);
  }
  const count = { ext: ctx.ext.count(), int: ctx.int.count(), detail: ctx.detail.count() };
  ctx.ext.build(ctx.groups.ext); ctx.int.build(ctx.groups.int); ctx.detail.build(ctx.groups.detail);
  ctx.stats.parts = partMs; ctx.stats.buildMs = Math.round(performance.now() - t0); ctx.stats.batched = count;

  const env0 = { timeOfDay: ctx.time, camera: null, game: null };
  const house = {
    group: ctx.group, colliders: ctx.colliders, interact: ctx.interact, lights: ctx.lights, anchors: ctx.anchors, plan, stats: ctx.stats, kit,
    // resolves when every texture and model has arrived (the house is already usable before that)
    loaded: Promise.all([...kit.pending, ...ctx.async]).then(() => true),
    update(dt, env = env0) {
      ctx.time = env.timeOfDay ?? ctx.time;
      // distance LOD: interior and small clutter are hidden when the camera is far away
      if (env.camera) {
        const d = Math.hypot(env.camera.x, env.camera.z - 2);
        ctx.groups.int.visible = d < (opts.intDist ?? 70); ctx.groups.detail.visible = d < (opts.detailDist ?? 110); ctx.groups.dyn.visible = d < (opts.detailDist ?? 110);
      }
      for (const u of ctx.updaters) { try { u(dt, env, ctx); } catch (e) { if (!u._err) { u._err = true; console.error('[nicoHouse] updater failed', e); } } }
    },
    dispose() { ctx.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const m of kit.materials.values()) { for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap', 'emissiveMap']) m[k]?.dispose?.(); m.dispose(); } },
  };
  return house;
}
export { PLAN };
