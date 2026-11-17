# Vehicles: plug-in contract (vehicles-core)

`game.vehicles` is created by `src/vehicles/vehicles.js` (`createVehicles(game)`). Other tracks never edit that file; they plug in through the hooks below. Always guard calls (`game.vehicles?.registerModel?.(...)`) because modules load in different orders.

Coordinates everywhere: meters, `y` up, a vehicle faces `+Z` at heading 0, `+X` is the vehicle's **left**, ground is `y = 0` in model ("shell") space, `z = 0` is the middle of the wheelbase.


## 0. Library fleet (the user's car models; `src/vehicles/glb/`)

Every road car is one of the user's models (`Models/Cars`, converted by `tools/v2/cars/`). At boot `initFleet` registers them
into `CAR_TYPES` / `MODELS` / `CLASSES` (class pools: library models replace the procedural ones; `rare` and `beater` pools are
never picked at random) and streams the GLBs in (common classes first). Procedural keys alias to library models
(`spawn('police')` -> police1, `'taxi'` -> taxi1, `'ambulance'` -> van3/van4, ...). `?libcars=0` = procedural cars only.

- `game.vehicles.spawnParked(key, { x, z, heading, color, wear 0..1, stripe?: { w, color }, locked? })` -> Promise<vehicle>:
  a parked car the traffic manager never recycles (driveways, set pieces). `wear` = dirt, faded paint, rust.
- `game.vehicles.placeStatic('covered1', { x, z, heading })` -> Promise<Object3D>: a static prop (car under a cover), box collider.
- Rare cars (hypercar, supercars, ultra-luxury SUV, classic wedge): one each, `glb/placements.js`, parked when the player comes near.
- Paint: US color mix for everyday cars (`glb/fleet.js US_MIX`), per-car wear/dirt/finish from `catalog.rollLook`.

## 1. `game.vehicles.registerModel(entry, builder)` (cars built by another track)

Used by `hero-cars` (and anyone adding a four-wheeled road vehicle). Physics, damage, traffic, lights, audio fields and enter/exit all come from vehicles-core; you deliver the model.

```js
game.vehicles.registerModel({
  key: 'hero_green_suv',            // unique id, also the spawn type
  brand: 'Vireo', name: 'Colosso',  // invented names only
  class: 'suv',                     // 'compact'|'sedan'|'suv'|'muscle'|'sports'|'super'|'van'|'taxi'|'police'|'pickup'|'truck'|'bus'
  hero: true,                       // true: kept out of random traffic pools (class pool 'hero'); spawn it yourself or via entry.spawn
  pool: 'hero',                     // optional override of the random pool name (default: 'hero' if hero, else the class)
  tier: 'hyper',                    // free text: 'hyper'|'super'|'mid'|'everyday'
  palette: [0x1f8f3a],              // allowed paint colors (hex ints)
  engine: 'v8tt',                   // 'i4'|'v6'|'v8'|'v8tt'|'v10'|'v12'|'w16'|'diesel'|'electric', or an object
                                    // { engine, cylinders, aspiration, exhaust, maxRpm, idleRpm, gears: [...], final }
  sound: { /* extra hints for the audio track, merged into vehicle.model.sound */ },
  price: 240000,
  spawn: { zones: ['business', 'beach'], weight: 0.2, valet: true },   // hints for the spawner (optional)
  spec: {                           // every field optional; class defaults fill the rest
    L: 5.1, W: 2.02, wb: 3.0,       // length, width, wheelbase (m)
    r: 0.38, tw: 0.31,              // wheel radius, tire width
    yb: 0.3, belt: 1.1, noseY: 0.95, tailY: 1.1, roofY: 1.64,   // heights: underbody, beltline, nose, tail, roof
    zA: 1.0, zB: 0.4, zC: -1.9, zD: -2.2,                       // windshield base, roof front, roof rear, rear glass base (z)
    cabInset: 0.14,
    mass: 2200, engine: 14500 /* peak drive force, N */, vmaxKmh: 305,
    steer: 0.55 /* max steer angle, rad */, grip: 2.7, drive: 'awd'|'rwd'|'fwd',
    susp: [0.4, 30] /* rest length m, stiffness */, rollK: 1.2, downforce: 1.2, powerSlide: 0.2, boost: 0.6,
  },
}, builder);
```

`builder(THREE, opts)` is called once per spawned car. `opts = { color, seed, variant, quality: 'high', custom }`. It returns:

```js
{
  group,            // REQUIRED. Object3D in shell space (ground y=0, faces +Z, z=0 mid-wheelbase). Do NOT include the wheels in it
                    // unless you also list them in `wheels` (they are re-parented to the suspension).
  wheels: [         // optional (else no visible wheels are attached). Order free; matched by side/front.
    { node,         // Object3D whose origin is the wheel center; it must spin about its local X axis
      side: 1|-1,   // +1 = left (+X), -1 = right
      front: true|false, x, z,      // wheel center in shell space (defaults: track and wheelbase from spec)
      lodDetail: [meshes hidden when far], lo: lowDetailMesh }
  ],
  lights: {         // materials (or arrays of materials) whose emissiveIntensity vehicles-core drives every frame.
    head, drl, lens, fog, tail, brake /* or tailLed */, reverse, blinkL, blinkR, amber, interior, sign, red, blue
  },                // set material.userData.gain to scale a material relative to the others
  paint: [materials],        // repaintable body materials (garage / customization / burnt state)
  paintMeshes: [meshes],     // meshes that use the body paint (swapped to the charred material when the car burns)
  glass: [meshes],           // swapped to the shattered-glass material when the glass breaks
  deformable: [meshes],      // meshes whose vertices may be dented (geometry is cloned per car on first dent)
  detachable: { hood, trunk, bumperF, bumperR, doorFL, doorFR, doorRL, doorRR, wing },   // Object3Ds that can come off
  doors: [ { node, side, front, open(t /*0..1*/) } ],
  steeringWheel,             // Object3D rotated about local Z with the steering angle
  seats: [ { x, y, z } ],    // shell-space seat points, driver first (hip point)
  hull: Float32Array,        // optional xyz point cloud (shell space) for the convex collision hull; default = body box from spec
  update(dt, state),         // optional per-frame hook: state = { vehicle, speed, rpm, steer, throttle, brake, lightsOn, night, doors }
  dispose(),                 // optional: free per-car resources when the car despawns
}
```

`src/vehicles/hero/index.js` is picked up automatically if it exists and exports either `register(vehicles)` (call `vehicles.registerModel` yourself) or `models = [{ entry, builder }, ...]`. A `*.v2.js` module can also call `game.vehicles.registerModel` in `initV2`.

Spawn one: `game.vehicles.spawn('hero_green_suv', pos, heading, { color, snap: false, locked: true })`.

## 2. `game.vehicles.registerKind(kind, impl)` (boats, yachts, aircraft, scooters, anything that is not a car)

You own physics, models and updates; vehicles-core routes the shared API to you so the player, police, missions and HUD see one vehicle system.

```js
game.vehicles.registerKind('aircraft', {
  types: ['heli', 'seaplane'],                 // optional: bare type names routed to you (array or (type) => bool)
  list: [],                                    // your live vehicles (same array you mutate)
  spawn(type, pos, heading, opts) { return vehicle; },   // game.vehicles.spawn('aircraft:heli', ...) or spawn('heli', ...)
  remove(vehicle) {},
  nearest(pos, maxDist) { return vehicle | null; },      // for "Press F to enter"
  distance(vehicle, pos) { return meters; },   // optional: distance to the hull outline (long vehicles), default = center distance
  update(dt) {},                               // optional, every render frame after physics
  fixed(dt) {},                                // optional, every fixed physics tick before world.step()
});
```

Every vehicle object you return must provide the **minimal Vehicle interface** used by `main.js`, police, HUD and missions:

| Field | Meaning |
|---|---|
| `kind` | your kind string (`'boat'`, `'aircraft'`, ...). Cars are `'car'`, two-wheelers `'bike'`. |
| `name`, `model: { key, brand, name, class, engine, maxRpm, idleRpm, gears, sound }` | display name and audio hints |
| `body` (Rapier rigid body) or `position` (Vector3) and `mesh` (Object3D) | where it is |
| `setControls({ throttle: -1..1, steer: -1..1, brake: 0..1, handbrake: bool, ...yourExtras })` | called every frame while the player drives |
| `speedKmh`, `speed` (m/s, signed), `velocity` (Vector3), `rpm`, `gear`, `throttle`, `load` | read by HUD and audio |
| `playerDriven` (bool, set by main.js), `exitPosition() → Vector3`, `seatPosition() → Vector3` | enter / exit |
| `health` (1000 = new), `disabled`, `locked`, `horn()` | shared conventions |

`game.vehicles.all()` returns cars + every registered kind. `game.vehicles.kind('boat')` returns an impl. If a kind named `'boat'` is registered, the legacy `boats.js` system inside vehicles.js is no longer updated or queried (the new one replaces it).

## 3. Per-vehicle fields (cars; vehicles-core keeps them current)

Identity
- `id` (int), `uid` (string, stable for the car's life), `kind: 'car'`, `typeKey`, `name`, `spec` (physics/shape), `model` (see above), `variant` (seeded look: color, trim, wheels, wear...), `signature` (string; unique among live cars), `plate` (string, e.g. `"KJR 4T7"`), `seed` (int).
- `owner`: `null | 'player' | 'npc' | 'police' | 'service'`; `insured` (bool); `custom` (customization state, see section 6).

Motion (every frame)
- `speed`, `speedKmh`, `velocity`, `heading`, `position`, `rpm`, `gear`, `throttle`, `load`, `steerCur`, `braking`, `reversing`, `grounded` (wheels on ground 0..4), `slip` (0..1 worst tire slip), `airborne` (seconds).

State
- `playerDriven`, `parked`, `ai` (traffic brain or `null`), `driver`, `passengers[]`, `locked`, `engineOn`, `lightsOn`, `highBeams`, `hazards`, `indicator` (`-1` right, `0`, `1` left), `wipers` (0 off, 1 slow, 2 fast), `sirenOn`, `sirenActive`, `police`, `submerged`, `inWater`, `flooded`.

Condition
- `health` (0..1000, legacy total), `disabled` (cannot drive), `onFire`, `burnT`.
- `damage`: `{ engine: 0..1, radiator: 0..1, steering: -1..1 (pull), fuelTank: 0..1 (leak rate), body: { front, rear, left, right, roof: 0..1 }, glass: { windshield, rear, left, right: 0 intact | 1 cracked | 2 gone }, lights: { headL, headR, tailL, tailR: bool broken }, detached: Set<string> }`.
- `tires[4]`: `{ wear: 0..1, pressure: 0..1, flat: bool, blown: bool }` (FL, FR, RL, RR).
- `engineTemp` (°C, normal about 90, overheats above 118), `fuel` (liters), `fuelCap`, `stalled` (seconds remaining), `odometer` (m).

Driver (traffic)
- `ai.personality`: `{ type: 'careful'|'aggressive'|'distracted'|'lost'|'hurried'|'elderly'|'tourist'|'showoff'|'normal'|'professional'|'drunk', speedK, gapS, reactS, laneChange, signalP, redRun, hornP, rage, ... }`.
- `ai.state`: `'cruise'|'follow'|'stop_signal'|'stop_sign'|'yield'|'yield_ped'|'lane_change'|'pull_over'|'parking'|'pulling_out'|'service_stop'|'accident'|'flee'|'rage'`.

Methods
- `setControls(c)`, `exitPosition()`, `seatPosition(i = 0)`, `horn(seconds?)`, `siren(on?)`, `setChaseTarget(target|null)`, `ejectDriver()`, `damage(amount, localPoint, kind?)`, `hitPart(part, amount)` (`'engine'|'radiator'|'tire0..3'|'fuelTank'|'glass'|...`), `repair(full = true)`, `refuel(liters)`, `flip()`, `setIndicator(-1|0|1)`, `setHazards(bool)`, `openDoor(i, t)`.

Fields are added to the car object as the systems land; read them defensively (`v.damage?.engine ?? 0`).

## 4. Events (on the game bus: `game.on(name, fn)`)

| Event | Payload | When |
|---|---|---|
| `'crash'` | `{ vehicle, other?: vehicle\|null, impulse, dv /* m/s velocity change */, speedKmh, point: Vector3, normal?: Vector3, byPlayer: bool }` | every hard impact (dv above about 4.5 m/s) |
| `'vehicle:damage'` | `{ vehicle, amount, health, part?: string, kind: 'impact'\|'bullet'\|'fire'\|'wear'\|'water', localPoint?, state?: vehicle.damage }` | whenever a car takes damage |
| `'vehicle:destroyed'` | `{ vehicle, position, cause: 'damage'\|'fire'\|'explosion'\|'water' }` | car is disabled for good |
| `'vehicle:spawned'` / `'vehicle:removed'` | `{ vehicle }` | car created / despawned |
| `'vehicle:eject'` | `{ vehicle, occupant: 'player'\|ped, position, velocity: Vector3, through: 'windshield' }` | a big frontal crash throws an unbelted occupant out. `main`/`npc-ai` turn this into a ragdoll. Return `false` to veto. |
| `'vehicle:tire'` | `{ vehicle, index, cause: 'shot'\|'wear'\|'spike'\|'impact' }` | a tire goes flat or blows |
| `'vehicle:stall'`, `'vehicle:overheat'`, `'vehicle:fire'`, `'vehicle:fuelLeak'`, `'vehicle:outOfFuel'`, `'vehicle:breakdown'` | `{ vehicle, ... }` | mechanical states |
| `'traffic:offense'` | `{ vehicle, byPlayer: bool, type: 'red_light'\|'speeding'\|'stop_sign'\|'wrong_way'\|'reckless'\|'hit_and_run'\|'sidewalk'\|'no_lights', position, speedKmh, limitKmh?, nodeId?, edgeId? }` | player or NPC breaks a traffic rule (police / traffic cameras listen) |
| `'traffic:accident'` | `{ vehicles: [a, b], position, severity: 1..3 }` | two cars collided and stopped; aftermath runs (hazards, drivers out, later a tow) |
| `'horn'` | `{ vehicle, position, byPlayer: bool, angry: bool, duration }` | any horn. Peds within earshot react (honk reactions). |
| `'siren'` | `{ vehicle, on }` | siren toggled |
| `'engineStart'` / `'engineStop'` | `{ vehicle }` | (unchanged from v1) |
| `'vehicle:modelRegistered'`, `'vehicle:kindRegistered'` | `{ key, model, spec }` / `{ kind, impl }` | registry changes |

Events vehicles-core listens to: `'shot'` (traffic panics; bullets damage parts via `'hit'` with `target: 'vehicle'`), `'hit'` `{ target: 'vehicle', object: vehicle, point, damage, kind }`, `'enterVehicle'`, `'spikeStrip'` `{ position, heading, width }`.

## 5. Queries other tracks can use

- `game.vehicles.list` (cars), `game.vehicles.all()`, `game.vehicles.nearest(pos, maxDist)`.
- `game.vehicles.spawn(type, pos, heading, opts)`; `type` = model key, class name, or `kind:type`. `opts = { ai, police, color, seed, variant, snap, locked, owner, personality, custom }`.
- `game.vehicles.remove(vehicle)`.
- `game.vehicles.models`, `.types`, `.classes`, `.modelKeys()`.
- `game.traffic` (when the traffic module is loaded): `signalAt(nodeId, edgeId) → 'green'|'yellow'|'red'|null`, `density(x, z) → 0..2`, `congestion(edgeId) → 0..1` (for `nav-gps` live traffic), `routes`, `stops`, `pullOverFor(vehicle)`, `accidents[]`.

## 6. Customization and garage API (`game.vehicles.custom`)

`vehicle.custom = { paint: { color, finish: 'gloss'|'metallic'|'matte'|'pearl'|'chrome', secondary }, wheels: { style, size, color }, tint: 0..3, kit: 'base'|'sport'|'lux'|..., spoiler, engineTune: 0..3, turbo: bool, brakes: 0..2, suspension: 0..2, neon: { color, on }, plate: 'TEXT', horn }`.

- `game.vehicles.custom.options(vehicle) → { paint: [...], wheels: [...], ... with prices }`
- `game.vehicles.custom.apply(vehicle, patch) → vehicle.custom` (rebuilds what changed, returns the new state)
- `game.vehicles.custom.price(vehicle, patch) → number`
- `game.vehicles.custom.serialize(vehicle) → plain JSON` / `game.vehicles.spawn(key, pos, heading, { custom: json })` (garages and saves)
- `game.vehicles.insurance = { insure(vehicle), isInsured(vehicle), claim(uid) → { key, custom } | null, quote(vehicle) }`

## Files

| File | Role |
|---|---|
| `vehicles.js` | `createVehicles(game)`: car factory, raycast-vehicle physics, per-frame visuals, public API |
| `registry.js` | `registerModel` / `registerKind` adapters |
| `catalog.js` | every stock model: proportions, physics, engines, palettes, spawn tiers |
| `carModel.js`, `bodyLoft.js` | procedural bodies, wheels, lights, cockpits |
| `damage.js` | deformation, detachable parts, mechanical damage model |
| `skids.js` | skid marks, tire smoke, shards |
| `roadnet.js` | road-graph adapter (lanes, turns, signals) |
| `traffic/*` | driver personalities, traffic rules, routes, spawning |
| `preview.html`, `drive.html` | standalone model viewer and physics sandbox (tests run here) |
