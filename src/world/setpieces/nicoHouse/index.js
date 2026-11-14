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

  // ---- importance LOD (perf pass, track: houses) ----
  // Every mesh of the interior, detail and dynamic groups gets its own cull distance from its size and its triangle density:
  // a lone small object fades at ~70x its radius, a batch of fine detail (nails, screws, weeds, shells) at ~2500x its mean
  // triangle edge, clamped to [14, 200] m. Interior meshes and small detail never cast sun shadows (the walls and roof do).
  // GLTF props arrive late, so new meshes are measured as they appear.
  const lodK = { r: opts.lodRadiusK ?? 70, e: opts.lodEdgeK ?? 2500, min: opts.lodMin ?? 14, max: opts.lodMax ?? 200 };
  const lodList = [], _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _c = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  const lodStats = { meshes: 0, shadowOff: 0, culled: 0 };
  const measure = (o, grp) => {
    const g = o.geometry; if (!g?.attributes?.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    let bs = g.boundingSphere; if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); bs = o.boundingSphere; }
    const p = g.attributes.position, ix = g.index, nT = (ix ? ix.count : p.count) / 3, step = Math.max(1, Math.floor(nT / 4000));
    let area = 0, n = 0;
    for (let t = 0; t < nT; t += step) { const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(p, i0); _b.fromBufferAttribute(p, i1); _d.fromBufferAttribute(p, i2); area += _b.sub(_a).cross(_d.sub(_a)).length() / 2; n++; }
    o.updateWorldMatrix(true, false); _m.multiplyMatrices(_inv, o.matrixWorld);
    const sc = Math.cbrt(Math.abs(_m.determinant())) || 1, edge = Math.sqrt((2 * area / Math.max(1, n))) * sc, rad = bs.radius * sc;
    const d = Math.max(lodK.min, Math.min(lodK.max, Math.min(rad * lodK.r, edge * lodK.e)));
    const c = bs.center.clone().applyMatrix4(_m);
    o.userData.nhLod = { d, c };
    if (grp === 'int' || (grp !== 'ext' && d < 32)) { if (o.castShadow) lodStats.shadowOff++; o.castShadow = false; }
    lodList.push(o); lodStats.meshes++;
  };
  const scanLod = () => {
    ctx.group.updateWorldMatrix(true, false); _inv.copy(ctx.group.matrixWorld).invert();
    for (const k of ['int', 'detail', 'dyn']) ctx.groups[k].traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !o.userData.nhLod) measure(o, k); });
    // exterior: only the plant and weed batches (the shell batches stay up to the far cutoff), never closer than 60 m
    ctx.groups.ext.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !o.userData.nhLod && /plants|weed|grass/.test(o.name)) { measure(o, 'ext'); o.userData.nhLod.d = Math.max(60, o.userData.nhLod.d); } });
  };
  let lodT = 0, lodScanT = 0;
  const env0 = { timeOfDay: ctx.time, camera: null, game: null };
  const house = {
    group: ctx.group, colliders: ctx.colliders, interact: ctx.interact, lights: ctx.lights, anchors: ctx.anchors, plan, stats: ctx.stats, kit, lodStats,
    // resolves when every texture and model has arrived (the house is already usable before that)
    loaded: Promise.all([...kit.pending, ...ctx.async]).then(() => true),
    update(dt, env = env0) {
      ctx.time = env.timeOfDay ?? ctx.time;
      // distance LOD: interior and small clutter are hidden when the camera is far away
      if (env.camera) {
        const d = Math.hypot(env.camera.x, env.camera.z - 2);
        ctx.groups.int.visible = d < (opts.intDist ?? 70); ctx.groups.detail.visible = d < (opts.detailDist ?? 110); ctx.groups.dyn.visible = d < (opts.detailDist ?? 110);
        if (opts.lod !== false && (lodScanT -= dt) <= 0) { lodScanT = 2; scanLod(); }
        if (opts.lod !== false && (lodT -= dt) <= 0 && d < (opts.detailDist ?? 110) + 10) {
          lodT = 0.2; let cul = 0; const cy = env.camera.y ?? 1.7;
          for (const o of lodList) { const L = o.userData.nhLod, v = Math.hypot(env.camera.x - L.c.x, cy - L.c.y, env.camera.z - L.c.z) < L.d; if (o.visible !== v) o.visible = v; if (!v) cul++; }
          lodStats.culled = cul;
        }
      }
      for (const u of ctx.updaters) { try { u(dt, env, ctx); } catch (e) { if (!u._err) { u._err = true; console.error('[nicoHouse] updater failed', e); } } }
    },
    dispose() { ctx.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const m of kit.materials.values()) { for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap', 'emissiveMap']) m[k]?.dispose?.(); m.dispose(); } },
  };
  return house;
}
export { PLAN };
