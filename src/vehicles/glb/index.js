// Library fleet runtime: registers the converted models (public/assets/vehicles/cars/index.json) into the vehicle
// catalog, streams their GLBs in, and decides which model a spawn gets.  vehicles.js calls:
//   const fleet = await initFleet({ CAR_TYPES, MODELS, CLASSES, ALL_KEYS })   (before the first spawn)
//   fleet.resolve(key)        -> key to actually build (procedural keys alias to library models: 'police' -> police1 ...)
//   fleet.pick(cls, rnd)      -> a loaded library model of that class (null if none loaded)
//   fleet.look(key, look, r)  -> adjust a rolled look (US color mix, no lower two-tone, model palettes)
//   fleet.build(key, look)    -> car object (glbCar.buildGlbCar) or null when not loaded
import { loadCarModel, isCarLoaded, buildGlbCar, glbStats } from './glbCar.js';
import { FLEET, FLEET_BY_KEY, specFor, modelFor, zoneMix, fileKey, pickUsColor, pickUsPaint, PAINT_BIAS } from './fleet.js';
import { rng, hashSeed } from '../model/rng.js';
import { LAZY, afterReady } from '../../core/loadMode.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/vehicles/cars/';
// engine profiles (same numbers as catalog.js E)
const E = {
  i3: { engine: 'i4', cylinders: 3, aspiration: 'turbo', exhaust: 'quiet', maxRpm: 6500, idleRpm: 850, gears: [3.6, 2.0, 1.3, 0.97, 0.78], final: 4.2 },
  i4: { engine: 'i4', cylinders: 4, aspiration: 'na', exhaust: 'quiet', maxRpm: 6500, idleRpm: 750, gears: [3.6, 2.1, 1.4, 1.0, 0.8], final: 3.9 },
  i4t: { engine: 'i4', cylinders: 4, aspiration: 'turbo', exhaust: 'sporty', maxRpm: 7000, idleRpm: 850, gears: [3.5, 2.1, 1.45, 1.1, 0.88, 0.74], final: 4.0 },
  v6: { engine: 'v6', cylinders: 6, aspiration: 'na', exhaust: 'sporty', maxRpm: 7000, idleRpm: 750, gears: [4.0, 2.4, 1.6, 1.2, 0.95, 0.78], final: 3.6 },
  v6t: { engine: 'v6', cylinders: 6, aspiration: 'twin-turbo', exhaust: 'sporty', maxRpm: 7800, idleRpm: 900, gears: [3.4, 2.3, 1.7, 1.32, 1.06, 0.86], final: 3.7 },
  v8: { engine: 'v8', cylinders: 8, aspiration: 'na', exhaust: 'loud', maxRpm: 6600, idleRpm: 650, gears: [2.7, 1.8, 1.3, 1.0, 0.75], final: 3.4 },
  v8s: { engine: 'v8', cylinders: 8, aspiration: 'supercharged', exhaust: 'loud', maxRpm: 6800, idleRpm: 700, gears: [2.9, 1.95, 1.4, 1.1, 0.88, 0.7], final: 3.3 },
  v8l: { engine: 'v8', cylinders: 8, aspiration: 'twin-turbo', exhaust: 'quiet', maxRpm: 6600, idleRpm: 600, gears: [4.7, 3.1, 2.1, 1.67, 1.29, 1.0, 0.84, 0.67], final: 2.9 },
  v10: { engine: 'v10', cylinders: 10, aspiration: 'na', exhaust: 'race', maxRpm: 8800, idleRpm: 1000, gears: [3.1, 2.2, 1.65, 1.3, 1.07, 0.9, 0.76], final: 3.6 },
  v12: { engine: 'v12', cylinders: 12, aspiration: 'na', exhaust: 'race', maxRpm: 9000, idleRpm: 1000, gears: [3.1, 2.2, 1.65, 1.3, 1.07, 0.9, 0.76], final: 3.6 },
  w16: { engine: 'v12', cylinders: 16, aspiration: 'quad-turbo', exhaust: 'race', maxRpm: 7400, idleRpm: 900, gears: [3.2, 2.3, 1.75, 1.4, 1.15, 0.95, 0.8], final: 3.4 },
  dsl: { engine: 'diesel', cylinders: 6, aspiration: 'turbo', exhaust: 'diesel', maxRpm: 4500, idleRpm: 650, gears: [4.0, 2.4, 1.6, 1.15, 0.85, 0.68], final: 3.4 },
  dslH: { engine: 'diesel', cylinders: 6, aspiration: 'turbo', exhaust: 'diesel', maxRpm: 2800, idleRpm: 600, gears: [6.0, 3.6, 2.3, 1.5, 1.0, 0.75], final: 4.6 },
  ev: { engine: 'electric', cylinders: 0, aspiration: 'electric', exhaust: 'none', maxRpm: 14000, idleRpm: 0, gears: [9.0], final: 1.0 },
};
// procedural catalog keys -> library equivalents (so code that spawns 'police', 'taxi', 'ambulance'... gets real models)
const ALIAS = { police: 'police1', police_suv: 'police1', unmarked: 'police1', taxi: 'taxi1', taxi_xl: 'taxi1', ambulance: ['van3', 'van4'], firetruck: 'truck6',
  atlas_box: ['truck7', 'truck3', 'truck4'], atlas_step: ['truck3', 'truck7'], van: ['van1', 'van5'], corvo_shuttle: 'van5', corvo_minibus: 'van1',
  pickup: ['suv14', 'suv12'], ridgeback_mid: ['suv14', 'suv12'], ridgeback_3500: 'truck2', ridgeback_scout: ['suv14', 'suv12'], ridgeback_dune: 'suv2' };
const CLASS_FALLBACK = { roadster: 'sports', hero: null, bus: null };

export async function initFleet(cat, opts = {}) {
  const { CAR_TYPES, MODELS, CLASSES, ALL_KEYS } = cat;
  let index = {};
  try { index = await (await fetch(BASE + 'index.json', { cache: 'no-cache' })).json(); } catch (e) { console.warn('[cars] no library index', e); }
  const keys = [];
  for (const e of FLEET) {
    const man = index[fileKey(e.key)];
    if (!man) continue;
    const spec = specFor(e, man), m = modelFor(e), eng = E[m.engineProfile] || E.i4;
    CAR_TYPES[e.key] = spec;
    MODELS[e.key] = { key: e.key, brand: e.brand, name: e.name, class: e.cls, engine: eng.engine, maxRpm: eng.maxRpm, idleRpm: eng.idleRpm, gears: eng.gears, final: eng.final,
      sound: { engine: eng.engine, cylinders: eng.cylinders, aspiration: eng.aspiration, exhaust: eng.exhaust }, tier: e.tier, year: e.year,
      price: Math.round(9000 * Math.pow(2.6, e.tier - 1) / 100) * 100, rare: !!e.rare, library: true };
    if (!ALL_KEYS.includes(e.key)) ALL_KEYS.push(e.key);
    keys.push(e.key);
  }
  // class pools: library models replace the procedural ones in every class that has at least one library model
  const pools = {};
  for (const k of keys) {
    const e = FLEET_BY_KEY[k];
    const pool = e.rare ? 'rare' : e.parkedOnly ? 'beater' : e.cls;
    (pools[pool] ||= []).push(k);
  }
  const procPools = {};
  for (const cls in pools) { procPools[cls] = CLASSES[cls] ? CLASSES[cls].slice() : []; CLASSES[cls] = pools[cls].slice(); }
  const loadedIn = (k) => isCarLoaded(fileKey(k));
  // stream: boot set first (common classes), then everything else, a few at a time
  const order = keys.slice().sort((a, b) => prio(a) - prio(b));
  function prio(k) { const e = FLEET_BY_KEY[k]; return e.rare ? 3 : e.parkedOnly || e.service ? 2 : ['sedan', 'suv', 'compact', 'police', 'taxi'].includes(e.cls) ? 0 : 1; }
  const queue = [...new Set(order.map(fileKey))];
  let active = 0;
  // web (loadMode.LAZY): only a small boot set before play; the rest streams after READY, two at a time (the app / ?preload=all: today's burst)
  const CONC = LAZY ? 2 : (opts.concurrency || 3);
  const done = new Promise((res) => {
    const next = () => {
      if (!queue.length) { if (!active) res(); return; }
      while (active < CONC && queue.length) {
        const fk = queue.shift(); active++;
        loadCarModel(fk).finally(() => { active--; next(); });
      }
    };
    if (LAZY) afterReady(next, 3000); else next();
  });
  const bootSet = [];
  for (const cls of ['sedan', 'suv', 'compact', 'pickup', 'van', 'police', 'taxi', 'truck', 'sports', 'muscle', 'sedan', 'suv']) {
    const k = keys.find((x) => FLEET_BY_KEY[x].cls === cls && !FLEET_BY_KEY[x].rare && !bootSet.includes(fileKey(x)) && !FLEET_BY_KEY[x].service);
    if (k && bootSet.length < (opts.bootCount ?? (LAZY ? 4 : 12))) bootSet.push(fileKey(k));
  }
  const t0 = performance.now();
  await Promise.race([Promise.all(bootSet.map(loadCarModel)), new Promise((r) => setTimeout(r, opts.bootTimeout ?? 15000))]);
  console.info(`[cars] library fleet: ${keys.length} models registered, ${glbStats.loaded} loaded in ${Math.round(performance.now() - t0)} ms`);

  function pick(cls, rnd = Math.random) {
    const ks = (pools[cls] || []).filter(loadedIn);
    if (!ks.length) return null;
    return ks[(rnd() * ks.length) | 0];
  }
  // a class with no loaded model yet (streaming): the nearest class that has one, never a procedural car
  const NEAR = { compact: ['sedan', 'suv'], pickup: ['suv', 'sedan'], van: ['truck', 'suv'], truck: ['van', 'pickup', 'suv'], sports: ['muscle', 'sedan'], muscle: ['sports', 'sedan'],
    suv: ['sedan', 'compact'], sedan: ['suv', 'compact'], taxi: ['sedan'], police: ['sedan'], ambulance: ['van'], firetruck: ['truck'], super: ['sports'], roadster: ['sports'] };
  function pickNear(cls, rnd) {
    let k = pick(cls, rnd); if (k) return k;
    for (const c of NEAR[cls] || []) if ((k = pick(c, rnd))) return k;
    for (const c of ['sedan', 'suv', 'compact']) if ((k = pick(c, rnd))) return k;
    return null;
  }
  function resolve(key, rnd = Math.random) {
    if (FLEET_BY_KEY[key] && CAR_TYPES[key]?.glb) return loadedIn(key) ? key : (pickNear(FLEET_BY_KEY[key].cls, rnd) || key);
    const a = ALIAS[key];
    if (a) { const list = (Array.isArray(a) ? a : [a]).filter((k) => CAR_TYPES[k]?.glb && loadedIn(k)); if (list.length) return list[(rnd() * list.length) | 0]; }
    const cls = CAR_TYPES[key]?.cls;
    if (cls === 'bus' || cls === 'hero') return key;
    if (cls) return pickNear(cls, rnd) || key;
    return key;
  }
  function look(key, L) {
    const t = CAR_TYPES[key], e = FLEET_BY_KEY[key];
    if (!t?.glb || !L) return L;
    const r = rng(hashSeed(key, (L.seed >>> 0) ^ 0x51a7));
    // every everyday model rolls the US paint table (models with a 'pal' only shift its weights); fixed-livery / rare models
    // keep their own palette.  Loud colors stay ~2 %, never a model's factory default.
    if (e.palette) L.color = t.palette[(r() * t.palette.length) | 0];
    else { const p = pickUsPaint(r, PAINT_BIAS[e.pal] || null); L.color = p.color; if (!L.finish || !e.rare) L.finish = p.finish; }
    // no lower-body two-tone on library models; black roofs on a few modern cars only
    if (L.twoTone && (L.twoTone.y != null || t.classic || t.convertible || e.service || e.police || r() < 0.6)) L.twoTone = null;
    if (e.livery === 'police') L.twoTone = null;
    // pre-existing dents clone the 80k-triangle paint shell per car: beaters only, at most one
    L.dents = (L.wear?.age ?? 0) > 0.62 ? (L.dents || []).slice(0, 1) : [];
    if (e.service || e.police || e.taxi) { L.finish = 'gloss'; L.wear.dirt = Math.min(L.wear.dirt, 0.12); L.wear.rust = 0; }
    if (e.rare) { L.wear.dirt = Math.min(L.wear.dirt, 0.03); L.wear.rust = 0; L.wear.fade = 0; L.finish = r() < 0.5 ? 'metallic' : 'gloss'; }
    return L;
  }
  function build(key, L) {
    const t = CAR_TYPES[key];
    if (!t?.glb || !loadedIn(key)) return null;
    return buildGlbCar(fileKey(key), L, t, MODELS[key]);
  }
  return { keys, pools, procPools, pick, resolve, look, build, done, zoneMix, isGlb: (k) => !!CAR_TYPES[k]?.glb, loaded: (k) => loadedIn(k), stats: glbStats, FLEET_BY_KEY };
}
