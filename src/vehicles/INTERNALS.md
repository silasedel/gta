# vehicles-core internals: who owns what, and the interfaces between the pieces

The `vehicles-core` track is built by one integrator (owner of `vehicles.js`) and several sub-agents. Each sub-agent owns only the files listed for it and plugs into `vehicles.js` through the interfaces in this file. Public (cross-track) hooks are in `README.md`. Rules from `CONTRACT5.md` apply to everyone (atomic edits, the only allowed test browser, originality, American spelling, honest reporting).

Conventions: meters; `y` up; a vehicle faces `+Z`; `+X` is the vehicle's LEFT; "shell space" = ground at `y = 0`, `z = 0` at mid-wheelbase, `x = 0` centerline. Wheel order everywhere: FL, FR, RL, RR. All randomness that affects a car's look or a driver's personality comes from a seeded PRNG (never `Math.random()`), so a `(model, seed)` pair always rebuilds the same car.

Shared helper: `src/vehicles/model/materials.js` (paint with procedural wear, glass tints, chrome, plastics, rims, lamps). Use it for every vehicle surface. Owner: `bodies` sub-agent (API is frozen; improve the implementation only).

Seeded PRNG everyone uses: `src/vehicles/model/rng.js` → `rng(seed)` returns `r()` in [0,1) with helpers `r.int(n)`, `r.pick(arr)`, `r.range(a, b)`, `r.chance(p)`, `r.fork(label)` (independent sub-stream).

## Sub-tracks and files

| Sub-track | Owns | Interface |
|---|---|---|
| integrator | `vehicles.js`, `registry.js`, `skids.js`, `drive.html`, `README.md`, `INTERNALS.md`, `tests/*` | everything below is called from `vehicles.js` |
| `bodies` | `carModel.js`, `bodyLoft.js`, `catalog.js`, `model/shell*.js`, `model/materials.js`, `model/lights.js`, `preview.html` | A |
| `heavies` | `model/heavy/*` (bus, school bus, garbage truck, tow trucks, fire engine, ambulance, box trucks, step van, SWAT van, semi tractor) | A2 (same output shape as A, registered as `{ entry, builder }`) |
| `parts` | `model/parts/*` (wheels, cockpit, accessories, plates, stickers, occupants, trailers), `model/preview_parts.html` | B |
| `bikes` | `bikes/*`, `bikes.v2.js` (motorcycles, dirt bike, moped, mobility scooter, e-scooters) | public `registerKind('bike', ...)` |
| `traffic` | `traffic/*`, `roadnet.js` | C |
| `condition` | `damage.js`, `condition/*` (visual + mechanical damage, fire, ejection) | D |
| `systems` | `systems/*` (fuel, tires, wet grip, wipers and auto headlights, breakdowns, customization, insurance) | E |

## A. Model build (`carModel.js`, `catalog.js`)

```js
// catalog.js
export const CAR_TYPES   // key -> spec (shape + physics; fields as today plus new ones)
export const MODELS      // key -> { key, brand, name, class, engine, maxRpm, idleRpm, gears, final, sound, tier, year, price }
export const CLASSES     // class -> [keys]   (random pools; hero/rare models are not in them)
export const ALL_KEYS
export function rollLook(key, seed, env = {}) -> look     // deterministic from (key, seed); env = { income: 0..1, zone, salt: bool, rainRecently: bool }
export function lookSignature(look) -> string             // canonical string; two cars are "the same car" iff signatures match
export function rollVariant(key, rnd)                     // legacy, keep working

// look (plain JSON, serializable for garages and saves)
{ key, seed, color, color2, finish, twoTone: null | { color, y } | { roof: color }, kit, trim,
  wheel: { style, rimColor, finish, size }, tint: 0..3,
  wear: { dirt, dirtColor, rust, fade, age: 0..1, patch: null | { panel, color } },
  dents: [ { x, y, z, depth, radius } ],          // pre-existing dents, shell space
  missing: [ 'hubcapFL', 'bumperR', 'mirrorR', ... ],
  lightsOut: [ 'headL', 'tailR', ... ],           // dead bulbs on beaters
  stickers: [ { id, where, u, v, rot, scale } ], accessories: [ { id, ...params } ], dash: [ ids ], mirrorCharm: id | null,
  aftermarket: [ ids ], plate: { text, style }, occupants: 0..n, trailer: null | { type, seed }, neon: null | color,
  signature }

// carModel.js
export function buildCar(key, lookOrColor, opts = {}) -> car      // opts: { kit, wheel, blackRoof } legacy; { quality }
export function prebuild(key, kit), isBuilt(key, kit), wheelBuilt(key, spokes), releaseCar(car), evictIdleModels(), noteOwnGeoFreed(), modelGpuStats(), brokenGlassMat()
```

`car` (what `vehicles.js` consumes; keep every existing field, add the new ones):

```js
{ root,            // Group in physics-body frame (origin = body origin)
  shell,           // Group under root; vehicles.js sets shell.position.y = -groundOff so shell space ground = 0; body roll/pitch is applied to it
  lod,             // THREE.LOD (3 levels) or { levels: [] }
  wheels: [ { steer, spin, side: 1|-1, front, x, z, r, detail: [meshes], lo: mesh|null, tireMesh, rimMeshes, hubcap } ],   // steer is a child of root (not shell)
  lightMats: { head, drl, lens, fog, tail, tailLed, reverse, amber, blinkL, blinkR, sign, red, blue, interior, plate, neon },  // per car; emissiveIntensity driven by vehicles.js
  lamps: { headL, headR, tailL, tailR, ... },   // per-lamp { mats: [...], meshes: [...], pos: Vector3 (shell) } so one lamp can be broken or dead
  spec, info,      // CAR_TYPES[key], MODELS[key]
  look,            // the look it was built from (with signature)
  paint,           // primary per-car paint material (model/materials.js carPaint)
  paintMats: [],   // every per-car material that takes the body color / wear (paint, roof, bumpers...)
  slots: { paint: [meshes], roof: [meshes], glass: [meshes] },
  glassPanes: { windshield, rear, left: [..], right: [..] },   // meshes per pane (break one pane)
  deformable: [meshes],      // LOD0 meshes whose vertices get dented; geometry is shared per model and cloned per car on first dent
  parts: { paint, roof },    // legacy aliases of the main deformable meshes
  panels: { hood, trunk, bumperF, bumperR, doorFL, doorFR, doorRL, doorRR, fenderFL, ... },
                   // each { node: Object3D (own pivot at the hinge / mount), hinge: { axis, max }, bounds: Box3 (shell), detachable: bool }
                   // a panel node can be rotated (open / ajar after a crash) or removed and handed to physics as debris
  steeringWheel, wipers: [nodes rotating about local Z], seats: [ { x, y, z, yaw } ], cockpit, occupants: Group,
  hull,            // Float32Array xyz (shell space) for the convex collision hull, bumper-height floor respected
  colliders: [ { type: 'box', hx, hy, hz, x, y, z } ],   // optional extra shapes (truck bodies, beds) in shell space
  plate: { text },
  dispose(),       // free per-car GPU resources (per-car materials, cloned geometry)
  _res }
```

Every model must also provide, on its spec: `seats` count, `doors` count, `fuelCap` (liters), `tankPos`, `enginePos` (`'front'|'mid'|'rear'`), `radiatorPos`, `exhaustPos: [[x, y, z], ...]`, `tier` (1 beater … 5 exotic), `year`.

### A2. Heavy vehicles (`model/heavy/index.js`)

`export const HEAVY_MODELS = [ { entry, builder } ]` using the public `registerModel` entry format (README section 1) plus `entry.spec` physics. `builder(THREE, { color, seed, look, quality })` returns the README builder shape (group, wheels, lights, paint, glass, deformable, detachable, doors, seats, hull, update, dispose) plus optional `colliders`, `axles` (for 6-wheel trucks: extra visual wheels that follow the rear suspension) and `equipment` (e.g. garbage-truck hopper, tow boom, bus doors: `{ name, set(t) }`). `vehicles.js` registers them at startup.

## B. Parts (`model/parts/index.js`)

```js
export const WHEEL_STYLES     // [ { id, label, tags: ['sport'|'lux'|'truck'|'steel'|'classic'|'cheap'|...], lug: 4|5|6|8 } ]  (at least 14 distinct designs)
export function buildWheel({ r, tw, style, rimColor, rimFinish, caliperColor, tire: 'road'|'sport'|'allterrain'|'mud'|'whitewall'|'truck', dually, hubcap, seed, lod })
  -> { group /* spins about local X, outer face toward +X, origin = wheel center */, detail: [meshes], lo: mesh, tireMesh, flatGeo /* squashed tire for a flat */, dispose() }
export function buildCockpit({ spec, cls, seed, trim: 'cloth'|'leather'|'vinyl'|'sport', color, layout /* seats: 2|4|5|7 */, rhd: false, lod })
  -> { group /* shell space */, steeringWheel, seats: [ { x, y, z, yaw } ], screens: [materials], dashAnchors: [ { x, y, z } ], mirrorAnchor, dispose() }
export function buildDashItems({ spec, seed, items, anchors }) -> Group       // tissue box, air freshener, phone mount, dash cam, permit, cup, cap, sunshade...
export function buildAccessories({ spec, cls, seed, list }) -> { group, colliders, names }   // roof racks, ladders, pipes, light bars, bull bars, toolboxes, bed cargo, kayaks, surfboards, bike racks, tow hitches, spoilers, antenna toppers, flags
export const ACCESSORIES      // id -> { label, fits: (spec) => bool, tags }
export function makePlate({ text, style, seed }) -> { material, text }        // original state plate design (several plate styles), canvas texture
export function plateText(seed) -> string
export const STICKERS         // atlas entries (original art, no real brands)
export function buildStickers({ spec, seed, list, surface }) -> Group         // decal quads on bumper / glass / tailgate
export function buildOccupant({ seed, seat, driver: bool, lod }) -> { group, dispose() }   // low-cost seated figure for mid / far range
export const TRAILERS         // id -> spec { L, W, mass, hitchZ, axleZ, r }
export function buildTrailer({ type: 'boat'|'jetski'|'utility'|'landscape'|'enclosed', seed, look }) -> { group, wheels: [...], lights: {...}, spec, hull, dispose() }
```

## C. Traffic (`traffic/index.js`)

```js
export function createTraffic(game, ctx) -> traffic
```

`ctx` (from `vehicles.js`):

```js
{ THREE, RAPIER, world, city, net,                // net = roadnet.js buildRoadNet(city)
  list,                                           // live cars (array owned by vehicles.js; do not splice it yourself)
  CAR_TYPES, MODELS, CLASSES,
  createVehicle(key, look|null, pos, heading, opts) -> v,      // opts: { ai: true, seed, owner, parked, locked }
  removeVehicle(v), placeVehicle(v, pos, heading),
  spotFree(pos, heading, spec, ignoreBody) -> bool, groundY(x, z, hintY) -> y,
  spawnVisible(pos) -> bool, inView(pos) -> bool,
  toGhost(v), fromGhost(v, force), freeze(v), thaw(v, force), setGhostPose(v, x, y, z, heading),
  playerCar() -> v|null, horn(v, { angry, duration }), flashHighBeams(v),
  SIM_R, PHYS_R, tick() -> int }
```

`traffic` (called by `vehicles.js`):

```js
{ makeBrain(v, opts) -> brain,       // stored as v.ai; opts: { personality?, role?: 'civil'|'taxi'|'bus'|'delivery'|'garbage'|'tow'|'police'|'ems' }
  drive(v, dt),                      // fixed tick, full-physics AI car: write v.ctrl { throttle, steer, brake, handbrake }, v.indicator, v.hazards, v.highBeams
  ghost(v, dt),                      // fixed tick, far kinematic car: advance along the lane, call ctx.setGhostPose
  chase(v, dt),                      // fixed tick when v.chaseTarget is set (police pursuit driving)
  manage(dt),                        // per frame: spawn / despawn / recycle, parked cars, service vehicles, density
  onCrash(v, info), onRemoved(v), onPlayerHorn(v),
  api }                              // published by vehicles.js as game.traffic
```

`v.ai` must keep these fields that other code reads: `edge`, `dir`, `d`, `lane`, `next`, `stuckT`, `waitT`, `fleeT`, `personality`, `state`.

## D. Condition (`damage.js`)

```js
export function createCondition(game, ctx) -> cond
// ctx: { THREE, RAPIER, world, scene, list, fx: { smoke, fire, shards, sparks }, removeDriver(v), spawnDebris(mesh, worldPos, worldQuat, linvel, angvel, size) -> debris }
cond.attach(v)                       // create v.damage, v.dmgMods
cond.impact(v, { dv, localPoint, localDir, other, speedKmh, byPlayer })   // called by vehicles.js on every detected impact
cond.hit(v, { localPoint, dir, amount, kind: 'bullet'|'melee'|'explosion'|'fire' })
cond.hitPart(v, part, amount, cause)
cond.tick(v, dt)                     // fixed tick: update v.dmgMods from v.damage (leaks, overheating, fire spread)
cond.frame(v, dt, near)              // per frame visuals (smoke, steam, fire, fluid drips, dangling panels)
cond.repair(v, full), cond.dispose(v)
```

`v.dmgMods` (read by the physics tick; neutral defaults): `{ power: 1, steerBias: 0, steerPlay: 0, grip: [1, 1, 1, 1], drag: [0, 0, 0, 0] /* extra rolling drag per wheel, 0..1 */, brake: 1, stall: false, camber: [0, 0, 0, 0] }`.

## E. Systems (`systems/index.js`)

```js
export function createSystems(game, ctx) -> sys
sys.attach(v), sys.tick(v, dt), sys.frame(v, dt, near), sys.dispose(v)
sys.weather() -> { wet: 0..1, rain: 0..1, puddles: 0..1, night: bool, fog: 0..1 }     // from game.env.weather, guarded
sys.custom, sys.insurance            // published as game.vehicles.custom / .insurance (README section 6)
```

`v.sysMods`: `{ power: 1, grip: [1, 1, 1, 1], drag: [0, 0, 0, 0], brake: 1, stall: false, hydro: 0 }`. `systems` owns `v.fuel`, `v.fuelCap`, `v.tires[]`, `v.wipers`, `v.autoLights`, `v.odometer`, `v.custom`, `v.insured`.

## Testing

- Pure logic (catalog rolls, signatures, traffic decisions, damage math) should have Node tests in `src/vehicles/tests/*.mjs` or next to the module: `three` imports fine in Node; guard `document` use.
- Browser checks only through `tools/v2/shot.mjs` / `tools/v2/browser.mjs`, short runs, own preview pages. Shots go to `docs/v2/shots/vehicles-core/<sub-track>/`. Look at every shot you cite.
- Never leave a broken import: `vehicles.js` loads every sub-module with a guarded dynamic import and keeps working without it.

## Working rules for vehicles-core sub-agents (in addition to CONTRACT5.md)

1. Read first: `BIG_UPDATE.md` (sections 0, 0a, 0b items 23, 25, 26, 0d, 0e, 4, 4b, 9), `CONTRACT5.md` in full, `src/vehicles/README.md`, this file. Look at `references/ref_16.webp`, `ref_17.webp`, `ref_22.webp`, `ref_29.webp`, `ref_35.webp` (convert with `sips -s format png -Z 1100 <in> --out <scratch>.png`, never copy them into the repo). They set the quality bar (dense traffic, worn dirty cars, stickers, trailers, a believable cockpit). Never copy any vehicle, badge or sign from them.
2. Edit only the files your sub-track owns (table above). Never edit `vehicles.js`, `registry.js`, `README.md`, `INTERNALS.md`, `src/main.js` or another sub-track's files. Need a change there? Append a dated note to `docs/v2/reports/vehicles-core-requests.md` (who, what, why, exact signature); the integrator polls that file. Keep working around the gap meanwhile.
3. The shared dev server at http://127.0.0.1:5200 hot-reloads every file for every agent. Never leave a file in a broken state: write `<file>.tmp`, run `npx esbuild <file>.tmp --loader:.tmp=js --format=esm --outfile=/dev/null`, then `mv`. Modules that `vehicles.js` already imports statically (`carModel.js`, `catalog.js`, `damage.js`, `roadnet.js`, `skids.js`, `bodyLoft.js`) must keep every current export working at all times.
4. Browser: only `node tools/v2/shot.mjs ...` or `tools/v2/browser.mjs` (`withBrowser`). Runs under 4 minutes. Three machine-wide slots are shared by about 30 agents, so batch your checks, prefer Node tests for logic, and use small standalone preview pages (import only your module) instead of the full game. Run `uptime` before trusting any timing number.
5. No git commands that change state. No dev servers. No processes left running (`pgrep -fl "ps-v2-chrome"`). Never touch ports 5173 / 5180 or `../V1`.
6. Originality: invented brands only (take them from `src/design/brands.js` / `game.design.brands` when that exists; the vehicle marques in `catalog.js` are ours). No real car, truck or motorcycle design copied panel for panel, no real badges, no real logos, no names from the banned list in CONTRACT5.
7. No placeholders: no box stand-ins, no flat untextured surfaces, no TODO stubs presented as done. If something is not finished, say so plainly.
8. Performance: 60 fps with about 40 live cars. Per car: LOD0 (closer than about 35 m) at most about 45k triangles and 16 draw calls including wheels and cockpit; LOD1 (to about 110 m) about 6k triangles and 6 draw calls; LOD2 about 900 triangles and 3 draw calls. Share geometry per model and materials where they do not need to be per car. Dispose per-car resources in `dispose()`. GPU memory must level off while traffic recycles.
9. Finish by writing `docs/v2/reports/vehicles-core-<sub-track>.md` (what was built, how it was verified, evidence paths, known gaps, what you need from the integrator) and reply with a report under 300 words: verified (with evidence paths) / built but unverified / not done / needs. Do not edit `docs/v2/progress/vehicles-core.json` (the integrator owns it). Report honestly; an unverified claim costs more than an honest gap.
