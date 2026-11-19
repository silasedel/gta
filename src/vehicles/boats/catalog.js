// The fleet catalog: collects every model module in ./models and assembles a finished, unique boat from a model key + seed.
//
// MODEL MODULE CONTRACT (src/vehicles/boats/models/<file>.js): `export const MODELS = [def, ...]` (or `export default def`).
//   def = {
//     key: 'cc26',                       unique id
//     name: 'Bayrunner 26',              model name (ours, invented)
//     builder: 'tidewright',             key into brands.js BUILDERS
//     category: 'center_console',        see CATEGORIES below
//     dims: { L, B, draft, height },     overall length, beam, draft, air draft above the waterline (meters)
//     berth: 'slip' | 'mooring' | 'beach' | 'trailer' | 'rack' | 'commercial',   where it normally lives
//     phys: { type, mass, vmaxKmh, ... } see physics.js PHYS_DEFAULTS (only override what differs)
//     sound: { engine, cylinders, count, hull }   notes for the audio track
//     look: { hull: {family: weight}, graphics: [...], named, registered, nameKind, wear: [lo, hi], bottomPaint, fixed }
//     roll(r, id) -> opt                 seeded options (engine count / hp, tops, layout, gear); pure data
//     build({ K, id, opt, r, decals, S }) -> { H, ... }   draws the boat into Kit K; returns the main hull (for livery,
//                                                          collider and float points) plus anything else worth keeping
//   }
import * as THREE from 'three';
import { Kit, S, rng } from './kit.js';
import { makeIdentity } from './identity.js';
import { paintLivery, paintDecals, screenAtlas } from './livery.js';
import { makeBoatMaterials } from './materials.js';

export const CATEGORIES = [
  'skiff',
  'jon',
  'center_console',
  'bay',
  'bowrider',
  'deck',
  'pontoon',
  'offshore',
  'cabin',
  'sportfish',
  'sail',
  'catamaran',
  'shrimp',
  'lobster',
  'dive',
  'taxi',
  'police',
  'fire',
  'tug',
  'airboat',
  'pwc',
  'kayak',
  'sup',
  'dinghy',
];
export const MODELS = {};
// Model modules load one by one, so a broken model file is skipped (and logged) instead of taking the fleet down.
const mods = import.meta.glob('./models/*.js');
export const failedModels = [];
let readyP = null;
export function loadModels() {
  return (
    readyP ||
    (readyP = Promise.all(
      Object.keys(mods).map((p) =>
        mods[p]()
          .then((m) => {
            for (const d of [...(m.MODELS || []), ...(m.default ? [m.default] : [])])
              if (d && d.key) MODELS[d.key] = d;
          })
          .catch((e) => {
            failedModels.push(p);
            console.error('[boats] model file failed to load: ' + p, e);
          }),
      ),
    ).then(() => MODELS))
  );
}
export const modelKeys = () => Object.keys(MODELS);
export const byCategory = (cat) => Object.values(MODELS).filter((d) => d.category === cat);

// Assemble one boat. Returns { root, id, def, opt, mats, anchors, parts, H, hullPts, floats, tris, dispose() }.
export function buildBoat(key, seed = 1, opts = {}) {
  const g = buildBoatSteps(key, seed, opts);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
}
// Same, as a generator that yields between slices of work (drive it with a per-frame time budget: see boats.js).
export function* buildBoatSteps(key, seed = 1, opts = {}, sliceMs = Infinity) {
  const def = MODELS[key];
  if (!def) throw new Error('unknown boat model ' + key);
  const id = makeIdentity(def, seed, opts.identity || {});
  const r = rng((seed * 2654435761) >>> 0);
  const opt = Object.assign({}, def.roll ? def.roll(r, id) : {}, opts.opt || {});
  id.capacity = def.capacity || Math.round((def.dims.L * def.dims.B) / 2.2);
  const dec = paintDecals(id, {
    hp: opt.hp,
    engines: opt.engines,
    big: opt.bigText ?? def.bigText,
    big2: opt.bigText2 ?? def.bigText2,
    bigColor: opt.bigColor ?? def.bigColor,
    big2Color: opt.big2Color ?? def.big2Color,
  });
  yield;
  const K = new Kit(key);
  const out = def.build({ K, id, opt, r, decals: dec.rects, S, def }) || {};
  const H = out.H || null;
  yield;
  while (!K.flush(sliceMs)) yield;
  yield;
  const livery =
    H && def.livery !== false
      ? paintLivery(H, id, { ...(def.livery || {}), ...(out.livery || {}) })
      : null;
  const mats = makeBoatMaterials({
    palette: id.colors,
    liveryTex: livery,
    decalTex: dec.texture,
    screenTex: screenAtlas(),
    wear: id.wear,
    teakGray: !!opt.teakGray,
    clearGlass: !!opt.clearGlass,
    hullMetal: !!(def.hullMetal || opt.hullMetal),
  });
  if (id.sailColor != null && mats.sail) mats.sail.color.setHex(opt.sailColor ?? id.sailColor);
  yield;
  const root = K.toObject3D(mats, opts.shadows !== false);
  root.userData.boat = { key, seed };
  const dims = def.dims;
  const hullPts =
    out.hullPts ||
    (H ? H.colliderPoints(Math.max(0.95, Math.min(1.6, (dims.height || 1) * 0.5))) : boxPts(dims));
  const floats = out.floats || (H ? H.floatPoints() : boxFloats(dims));
  return {
    root,
    id,
    def,
    opt,
    mats,
    anchors: K.anchors,
    parts: root.userData.parts,
    H,
    hullPts,
    floats,
    tris: K.countTris(),
    extra: out,
    dispose() {
      root.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      mats.dispose();
    },
  };
}
function boxPts(d) {
  const hw = d.B / 2,
    hl = d.L / 2,
    pts = [];
  for (const x of [hw, -hw])
    for (const y of [1, -d.draft]) for (const z of [hl, -hl]) pts.push(x * (z > 0 ? 0.5 : 1), y, z);
  return new Float32Array(pts);
}
function boxFloats(d) {
  const out = [];
  for (const zf of [-0.4, 0, 0.3])
    for (const sx of [1, -1])
      out.push(new THREE.Vector3(sx * d.B * 0.33, -d.draft * 0.55, zf * d.L));
  out.push(
    new THREE.Vector3(0, -d.draft * 0.4, d.L * 0.43),
    new THREE.Vector3(0, -d.draft * 0.75, -d.L * 0.47),
  );
  return out;
}
