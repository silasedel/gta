// Wildlife kit entry point. See the header of each file for the conventions:
//   tex.js  Skin painter (albedo + height->normal + roughness on aligned canvases), noise, colors
//   loft.js loft / tube / sheet / flat / ball / xform / mirrorX / merge  (model frame: +Z nose, +Y up, +X animal's left)
//   rig.js  makeRig / bindSpine / bindChain / bindRigid / skinMesh / ikLeg / gaitFoot / GAITS / Spring / damp
//   mat.js  skinMaterial / swimMaterial / flapMaterial / swayMaterial
//   brain.js Mover (ground/surface movement), threatCheck, carDanger, pickPoint, farSideOfRoad
//   stage.js preview stage + fake world (preview pages only)
//
// SPECIES MODULE CONTRACT (one file per species under species/<group>/<id>.js, default export; files starting with
// "_" are helpers and are not loaded as species):
//   export default {
//     id: 'green_iguana', name: 'Green iguana', kind: 'reptile' | 'bird' | 'mammal' | 'fish' | 'invert' | 'insect',
//     length: 1.4,                       // real nose-to-tail (or wingspan for fliers) in meters, for framing
//     habitats: { park: 1, canal_bank: 2 },   // weights by habitat tag (see HABITATS below)
//     when(world) -> 0..1,               // optional activity factor by hour / weather / temperature
//     group: [min, max],                 // individuals per spawn
//     variant(rand) -> {...},            // small JSON object: what makes this individual unique (size, hue, sex, age)
//     skinKey(variant) -> string,        // optional: variants that share a painted skin share this key
//     paint(T, variant) -> Skin,         // PURE canvas painting, no three.js, no DOM (may run in a worker)
//     build(THREE, tex, variant) -> creature,
//     spawn(THREE, world, site, make) -> actor,   // make(variant?) -> creature (textures handled for you)
//     sounds: { call: 'short description for the audio track', ... },
//   }
//   creature = { group: Object3D (origin at the feet on the ground, or body center for swimmers/fliers; faces +Z),
//                states: ['idle', 'walk', ...], update(dt, anim), dispose(), radius, ...species extras }
//       anim = { state, speed (m/s), turn (rad/s), t (seconds), ...extras } -> poses the rig only; never moves `group`
//   actor    = { root: Object3D (added to the scene by the spawner), pos: Vector3, radius, update(dt, world), dispose(),
//                dead?: true when it should be removed, onEvent?(evt) }
//       The actor owns its creatures and their brains: it moves creature.group inside the world and picks anim states.
//
// WORLD (given to spawn/update; the stage provides a fake one, wildlife.v2.js the real one):
//   world.time, world.dt, world.hour (0..24), world.seaLevel, world.tide (-1..1)
//   world.isWater(x, z), world.groundY(x, z) (ground top, or seabed under water), world.waterDepth(x, z) (0 on land)
//   world.surface(x, z), world.zone(x, z), world.onRoad(x, z) (true on a carriageway)
//   world.player = { pos, vel, speed, inVehicle, swimming, underwater }, world.cam (Vector3)
//   world.threats = [{ pos, vel, radius, kind: 'player'|'ped'|'car'|'boat'|'dog'|'gunshot'|'explosion', loud }]
//   world.threatNear(pos, maxDist) -> { t, dist } | null     (nearest threat, cars weighted by their speed)
//   world.weather = { rain 0..1, wind 0..1, windDir [x, z], storm, tempC }
//   world.perches(pos, radius) -> [{ pos, kind: 'pile'|'roof'|'wire'|'rail'|'lamp'|'boat'|'branch'|'rock'|'ground', taken }]
//   world.fx.splash(pos, strength), world.fx.ripple(pos), world.fx.dust(pos)
//   world.sound(name, pos, { volume, pitch })      // audio hook; names are listed in each species' `sounds`
//   world.hurtPlayer(damage, kind, fromPos), world.rand()
//   world.signal(kind, pos, ttlSeconds, data?) / world.signalsNear(kind, pos, radius) -> [{ kind, pos, data, until }]
//       cross-species cues: 'baitball' (bait fish pushed to the surface: pelicans, terns, dolphins, tarpon come),
//       'food' (scraps: gulls, pigeons, raccoons, cats), 'carcass' (vultures), 'fish_landed' (an angler's catch:
//       pelicans and herons beg), 'predator' (a shark/barracuda/dolphin/gator hunting: prey scatters), 'alarm'
//       (an alarm call: nearby birds flush).
//
// HABITATS (site.habitat): 'ocean' open water, 'bay', 'canal', 'marina', 'reef', 'seagrass', 'beach', 'shallows'
//   (wadeable water edge), 'dock', 'marsh', 'mangrove', 'lake', 'park', 'lawn', 'street', 'roof', 'wire', 'alley',
//   'wall', 'palm', 'sky', 'keys_scrub', 'farm'. site = { x, y, z, habitat, radius, depth (water), district, count? }
//   extra site fields by habitat: wall -> { normal: [nx, 0, nz], w, h } (a vertical patch with its base center at
//   x, y, z); wire -> { wire: { a: Vector3, b: Vector3, sag, n } }; palm -> { height } (crown height above y).
export * as T from './tex.js';
export * as L from './loft.js';
export * as R from './rig.js';
export * as M from './mat.js';
export * as B from './brain.js';
import * as T from './tex.js';

// Build one individual of a species with cached textures. variant defaults to def.variant(rand).
export function makeCreature(THREE, def, variant = null, rand = Math.random) {
  const v = variant || (def.variant ? def.variant(rand) : {});
  const key = def.id + '|' + (def.skinKey ? def.skinKey(v) : JSON.stringify(v));
  const tex = T.skinTextures(THREE, key, () => def.paint(T, v), def.texOpts || {});
  const c = def.build(THREE, tex, v);
  c.def = def;
  c.variant = v;
  c.skinKey = key;
  const disp = c.dispose?.bind(c);
  c.dispose = () => {
    disp?.();
    c.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) o.material.dispose?.();
    });
    T.releaseSkin(key);
  };
  return c;
}

// distance-based animation throttle: returns true when this creature should update its skeleton this frame
export function lodTick(c, dist, frame) {
  const n = dist < 25 ? 1 : dist < 60 ? 2 : dist < 120 ? 4 : 8;
  return (frame + (c._lodSeed ??= (Math.random() * 8) | 0)) % n === 0 ? n : 0;
}
