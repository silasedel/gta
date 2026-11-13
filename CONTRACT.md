# PORT SOLANA — module contract (READ FULLY)

Original open-world third-person game (genre: modern open-world crime/driving) set in an ORIGINAL fictional
tropical coastal city "Port Solana" in the fictional state of "Calora". Sunset/golden-hour + neon vibe,
palm trees, art-deco beachfront, high-rises, ocean on the EAST side.
DO NOT use any Rockstar/GTA names, logos, characters, fonts, or traced UI. Everything original.

Stack: Vite + three@0.170 (import * as THREE from 'three'; addons from 'three/addons/...') +
@dimforge/rapier3d-compat 0.14 (already initialised; use game.RAPIER and game.world).
Units: meters, Y up, ground plane y=0. Character/vehicle models face +Z at heading 0.
Dev server is run by the lead at http://127.0.0.1:5173 — DO NOT start another dev server.
To syntax-check: `npx esbuild src/<yourfile>.js --bundle --format=esm --outfile=/dev/null --external:three --external:@dimforge/rapier3d-compat` (or similar).
Assets: put downloaded files in public/assets/<yourarea>/ and load with URLs like '/assets/<yourarea>/x.jpg'.
Only CC0 / permissive assets (Poly Haven, ambientCG, Kenney, Quaternius, three.js examples). Log every asset+license in CREDITS.md (append).
Keep performance sane: target 60fps on a MacBook. Use InstancedMesh / merged geometry for repeated stuff.
Only edit YOUR files. Never edit src/main.js or other agents' files (tell the lead if you need a contract change).

## Shared `game` object (built in src/main.js)
game = {
  THREE, RAPIER, renderer, scene, camera, world /* RAPIER.World, gravity -9.81 */,
  input,      // input.down('KeyW') held; input.pressed('KeyF') true only on the frame pressed; input.mouseDX/mouseDY
  clock: { elapsed, dt },
  timeOfDay,  // hours float 0..24, starts 18.0 (golden hour), advances 1 game hour per 2 real min. Env reads it.
  fixedHooks: [],   // push fn(fixedDt) -> called each fixed physics tick (1/60) BEFORE world.step()
  updaters: [],     // push fn(dt) -> called each render frame AFTER physics
  player: {
    position: THREE.Vector3 (feet), heading (radians, 0 = facing +Z), velocity: Vector3,
    state: { speed, grounded, sprint, jumping, inVehicle, vehicle },
    health: 0..100, armor: 0..100, money: int, wanted: 0..5, weapon: 'fist'
  },
  cameraYaw, cameraPitch,   // orbit camera angles
  city, env, vehicles, peds, hud, post   // filled with module return values (in that order)
}
Init order in main: createEnvironment -> createCity -> preloadCharacters -> createPlayer(main) -> createVehicles -> createPeds -> createHUD -> createPost.

## Modules
### src/world/environment.js  (GRAPHICS agent)
export async function createEnvironment(game) -> { sun: DirectionalLight, update(dt) }
Sky (physical sky / gradient w/ sun), time-of-day lighting driven by game.timeOfDay, fog, PMREM env map,
shadows (sun shadow camera follows game.player.position, 2048+ map), ocean (water shader) for x > 520,
distant skyline silhouettes. Also street-light / neon glow at night is fine.

### src/render/post.js  (GRAPHICS agent)
export function createPost(game) -> { render(dt), setSize(w,h) }
EffectComposer: RenderPass, (optional GTAO/SAO cheap), UnrealBloom, color grade (warm teal/orange, saturated
sunset), vignette, subtle grain, chromatic aberration light, SMAA/FXAA, OutputPass. Main calls post.render(dt) instead of renderer.render.

### src/world/city.js  (CITY agent)
export async function createCity(game) -> city object:
{
  half: 500,                          // city spans x,z in [-500,500]; ocean beyond x>520 (beach 440..520)
  grid: { block: number, roadWidth: number, xs: [road center x...], zs: [road center z...] },
  roads: [{ x1, z1, x2, z2, width }],  // axis-aligned centerline segments (for minimap & traffic)
  buildings: [{ x, z, w, d, h }],       // footprints (for minimap)
  playerSpawn: THREE.Vector3,           // on a sidewalk
  randomRoadPoint(): { position: Vector3, heading },   // lane center, heading along road (right-hand traffic)
  randomSidewalkPoint(): Vector3,
}
Must create ALL static Rapier colliders: ground (big cuboid top at y=0), every building (cuboid), sea wall/edges,
props that should block (lamp posts, palm trunks, hydrants as thin cylinders/cuboids). Sidewalks are raised curbs 0.15m
(give them colliders so cars bump them). High-detail textured buildings (PBR textures from ambientCG/Poly Haven),
lit windows emissive at night, art-deco low-rises near beach, glass towers downtown, palm trees, street lamps,
traffic lights, road markings, crosswalks, beach + boardwalk.

### src/player/characterModel.js  (CHARACTER agent)
export async function preloadCharacters(game)            // load GLB(s) once
export function createCharacter(game, opts = { variant: 'player' | 'ped', seed: 0 })
  -> { root: THREE.Object3D (feet at origin, faces +Z), update(dt, anim) , setVisible(bool) }
  anim = { speed /*m/s horizontal*/, grounded, jumping, sprint, driving, punch /*bool trigger*/ , dead }
Realistic rigged human with idle/walk/run/sprint/jump/fall/punch anims, crossfades, speed-matched playback.
Player variant: original protagonist (e.g. man, late 20s, short dark hair, open patterned tropical shirt over white tee, jeans, sneakers).
Peds: varied tint/clothing per seed. castShadow on meshes.

### src/vehicles/vehicles.js  (VEHICLES agent)
export async function createVehicles(game) -> {
  list: Vehicle[], nearest(pos: Vector3, maxDist): Vehicle|null, update(dt)
}
Vehicle = { body: RAPIER.RigidBody, mesh: Object3D, setControls({throttle:-1..1, steer:-1..1, brake:0..1, handbrake:bool}),
            speedKmh, playerDriven:boolean, exitPosition(): Vector3, seatPosition(): Vector3, name }
Use world.createVehicleController (DynamicRayCastVehicleController) with a convex-hull/compound chassis collider,
proper suspension, friction, mass ~1300kg, low COM; GTA-like arcade-but-weighty handling, skids, crash with
buildings must be solid (CCD on). Register physics in game.fixedHooks. ~25 cars: some parked, ~12 AI traffic
following city.roads lanes, stopping when blocked; AI disabled when playerDriven. Good-looking procedural car
models (sports car, sedan, SUV, taxi, police) with PBR paint (MeshPhysicalMaterial clearcoat), glass, chrome, headlights
(emissive + spot at night), tail lights, brake lights, wheels spinning/steering.

### src/npc/peds.js  (CHARACTER agent)
export async function createPeds(game) -> { update(dt), list }
~30 pedestrians wandering sidewalks (game.city.randomSidewalkPoint), each uses createCharacter(game,{variant:'ped',seed}),
kinematic capsule collider (RAPIER kinematicPositionBased) so player/cars can't pass through; flee when player sprints at
them / car fast nearby; if hit by vehicle > 20 km/h fall down (dead anim), respawn later.

### src/ui/hud.js + src/ui/hud.css  (UI agent)
export function createHUD(game) -> { update(dt), notify(text, ms), help(text|null), setMission(text) }
DOM overlay. ORIGINAL design language (clean, modern, slightly translucent, bold condensed sans like 'Oswald'/'Barlow Condensed' via Google Fonts or system fallback):
minimap bottom-left (rounded rect, canvas, rotates with camera, roads/buildings/water from game.city, player arrow,
vehicle dots, north marker, health/armor bars under it), top-right: money, wanted stars, clock (game.timeOfDay),
weapon icon; speedometer when game.player.state.inVehicle (vehicle.speedKmh); help prompt top-left;
location/street name toast when area changes; phone (toggle ArrowUp) with original apps; pause menu (Escape or P)
with full map view + settings; title/loading screen with "PORT SOLANA" and "Click to play" (main.js waits on
hud.ready() promise? NO: main shows its own #loading div; you may restyle #loading via CSS).
