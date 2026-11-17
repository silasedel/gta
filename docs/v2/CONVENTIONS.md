# Southline conventions (written by stage 1; every later stage keeps this current)

How the world and the systems connect. If something here is wrong, fix the code or this file in the same commit.

## 1. World frame and map
- Meters. **+X east, +Z south, Y up.** Heading 0 faces +Z; a direction from heading h is (sin h, cos h).
- The map is traced from the user's own images: roads `docs/v2/plan/map_roads_target.webp`, land/water/cover
  `docs/v2/plan/map_colour_target.webp`. **Road-image pixel (px, py) -> world x = (px - 700) * 11, z = (py - 800) * 11.**
- World bounds x -7700 .. 3883, z -8800 .. 7623 (the island is about 9.8 x 14.5 km). Sea level y = -0.12.
- Rebuild: `./tools/v2/map3/run.sh` (register + trace + build + runtime data, into `tools/v2/map3/out/`), then
  `./tools/v2/map3/publish.sh` (copies into `public/assets/miami/<build>/`, `public/assets/miami/world.json`,
  `public/assets/world/layout.json`). Builders: `tools/v2/map3/{register,trace,build_v3}.py`; runtime data:
  `tools/osm/merge.py` in no-OSM mode (`MIAMI_NO_OSM=1`, no real-Miami data). Overlay test: `tools/v2/map3/overlay_test.py`.
- Districts (name, center x/z, kind): see `ANCHORS` in `tools/v2/map3/build_v3.py`, also `layout.json` `places` and
  `districts`. Downtown (407, -110), Brickell (0, 1760), Edgewater (308, -1452), Little Havana (-660, -55),
  Miami Beach (2332, -660), South Beach (2398, 660), Dodge Island Port (1595, 792), Miami International Airport
  (-1210, 1045), Miami Gardens (715, -3080), Clewiston (-1540, -2805), Okeechobee (-2200, -6435), Fort Myers (-5335, -3960),
  Naples (-4730, -220), Homestead (-1320, 3190), Florida City (-330, 3520), Key Largo (-1155, 5500), Marathon (-2783, 6600),
  Key West (-4895, 5940). Regions: Everglades, Big Cypress, Lake Okeechobee. Waters: Biscayne Bay, Atlantic Ocean, Gulf of
  Mexico, Florida Bay.

## 2. Runtime world API (`game.city`)
- `groundHeightAt(x, z, y?)`, `isWater(x, z)`, `surfaceAt(x, z)`, `zoneAt(x, z)` (water, beach, nightlife, downtown,
  business, residential, commercial, park, port, causeway, industrial, airport, rural, wilderness), `districtAt(x, z)`,
  `streetNameAt(x, z)`, `bounds`, `seaLevel`, `playerSpawn`, `playerSpawnHeading`.
- **Road graph** `city.roadGraph`: `nodes[{id, x, z, y, edges, control}]`, `edges[{id, a, b, pts, cum, length, width,
  lanesFwd, lanesBack, oneway, speedKmh, name, ref, kind, bridge, elevated, surface, controlA, controlB}]`;
  `controlA/B` = control met when ARRIVING at node a / b: `'signal' | 'stop' | 'yield' | null`.
  Helpers: `nearestEdge(x, z, opts, maxDist, filter)`, `pointAt`, `edgesAt`, `turnAllowed`, `controlAt`.
  Navigation / GPS: `src/nav/*` builds on it (A* in a worker). Traffic: `src/vehicles/roadnet.js` (+ `signalState`).
- **Controls (stage 1):** rule based (US practice) in `tools/osm/roads.py controls()`: main x main = signal, main x minor
  = stop on the minor legs, minor 4-way = all-way stop, minor T = stop on the stem. Metro streets are `secondary`, so
  downtown corners are signalized.
- **Spawn points:** people: `city.randomSidewalkPoint(near, radius, zone)`, benches `city.benches`/`benchesNear`,
  lean spots `city.leanSpots`; cars: `city.randomRoadPoint(near, radius)` (on a lane of the graph). There is no separate
  parking-space table yet: park along curbs (right lane edge + 1.2 m) or in `plaza`/`paved` cover near storefronts.
- **Shop slots:** `city.storefronts` / `city.storefrontsNear(x, z, r)`: ground-floor shop lots with `{x, z, kind, street,
  facing, building}` (door on the street side, `facing` toward the street). Interiors attach to these (interior id =
  storefront id). Synthetic ground-floor shops (`synthShopsNear`) fill commercial streets.
- **Set pieces:** `layout.json` `setpieces`: `nico_house` (Key Largo, Pelican Point Ln, x -836, z 5272, heading 0.91,
  lot ring, spawnX/Z in the yard), `keys_sign` (start of the Overseas Highway), `keys_bar` (Key Largo strip).
- **School:** `layout.json` setpiece `school` (~(457, -1354), Edgewater, 179 m from the Edgewater police substation) for
  the user's mission `docs/v2/plan/MISSION_SCHOOL_ABANDONED_CLASSROOM.md` (stage 2 builds the school, stage 4 the mission).
- **Fire alarm distraction:** `docs/v2/plan/DISTRACTION_FIRE_ALARM.md` (pull stations in casino, hotels, school, offices).
- **Rough district:** Overtown and Liberty City (district kind `ghetto`), buildings tagged `condition: rundown|abandoned`.
  At runtime the condition is `hash(id + 6101) < 0.18 ? abandoned : rundown` (same rule in `bldmodels.js` and
  `src/world/city/families.js`): worn walls, grime, window AC units, security bars, roll-down shutters, boarded and dark
  windows when abandoned, rusty metal roofs, graffiti, chain-link fences (with colliders) around the vacant dirt lots.
- **Police stations:** `src/gameplay/police/stations.js` `STATION_SITES` (district centers, snapped to the nearest road at
  run time). HQ: Southline PD Headquarters, Downtown (407, -110).
- **Jail:** use Southline PD Headquarters (407, -110) until a jail interior exists (stage 4 adds the scene).
- **Cameras:** speed / red-light cameras: put them at signalized nodes of `primary`/`trunk` roads in downtown/business
  zones (none in rural zones), security cameras on storefronts (stage 2/3).
- **Airport and docks:** Miami International runways in `layout.json airport.runways`; Key West airfield
  `layout.json airfield`; moorings `city.moorings` / `claimMooring` (boats); the port is Dodge Island (1595, 792).
- **Casino (Golden Palm Casino):** the curved spiral casino tower (Models/Buildings "Building 15") stands on a Miami Beach
  superblock centered at **(2183, -370)**, footprint about 130 m (x) by 117 m (z), main entrance facing **west onto Collins
  Ave**; Meridian Ave runs behind it (east side, ~40 m): use that side for the loading dock / back lot. Constant
  `CASINO` in `src/world/miami/bldmodels.js`; generated lots under it are cleared.
- **Library building models:** `src/world/miami/bldmodels.js` places the user's models (converted GLBs in
  `public/assets/models/buildings/`, see SOURCES.txt; converter `tools/v2/buildings/convert_v2.sh` + `models.json`: meters,
  origin at the footprint center on the ground, front toward +Z, WebP textures, `<name>_lod1.glb` far LOD, `<name>_col.glb`
  collision mesh) on fitting generated lots. Classes: `tower` (h > 60), `mid` (11-62 m office/band/glass/deco), `shop`
  (strip / commercial low-rise, motel, gas station, diner), `house`, `ind` (factories, garage rows), `hangar` (airport hangar
  lots), `rlow` (rough-side walk-ups and corner stores). Picks are deterministic per building id (neighbors with a smaller id
  choose first, no two neighbors share a model). One InstancedMesh per (model, material, LOD, condition) per 900 m cell; per
  instance: tint (instanceColor), mirrored copies of text-free models, shader weathering and lit-window share keyed on the
  instance origin, far LOD past ~400 m (towers) / ~180 m (houses, shops). Colliders are each model's own collision mesh
  (`collide()`), plus a plinth where the lot falls away. Roof / wall clutter (`addClutter`): roof vents and tanks on procedural
  roofs, fire escapes on brick walk-ups, utility cabinets, squatter shacks. `?libmodels=0` turns it all off. New models: add a
  row to `tools/v2/buildings/models.json`, run `convert_v2.sh <name>`, add a `LIB` row.
- **Airport (Miami International):** `AIRPORT` in `bldmodels.js`: terminal footprints (synthetic lots, glass curtain wall, canopy
  roof) at x -1480..-1172, z 1010..1070, Control Tower 1 at (-1060, 1075), five jet bridges on the terminal's south face, parked
  airliners nose-in, runway edge / threshold / approach lights from the runway outlines. Hangar lots get the user's hangars.

- **Street furniture (stage 1 jobs 4-5):** the user's library models, converted to `public/assets/models/street/*.glb`
  (`tools/v2/street-models/build.sh`, `signals.py`, `signs.py`; sources in `SOURCES.txt`), loaded by
  `src/world/miami/streetkit.js` (`city.streetKit`) and instanced per tile by `tilebuild.js` (global pools: one draw
  call per part material). Traffic signals: `src/world/miami/signals.js` lays out each signalized job-4 junction (US
  far-side mast arm on the far-right corner behind the crosswalk, one head per approach lane, post-mounted heads at
  narrow junctions and T stems, pedestrian heads at every crosswalk end, a controller cabinet, street-name blades on the
  arms). The lenses light in the shader from per-instance data with the SAME fixed-time plan as the traffic AI
  (`roadnet.js fixedSignal`: 34 s cycle, phase by approach axis, offset per node; `streetkit.signalPhase/walkPhase`):
  if the AI signal plan changes, change `streetkit.js` with it. Lamps: `lamp.t` picks the model (`lamp_single` davit
  arm default, `lamp_twin`, `lantern_post`; small `s` = lantern); `group.userData.psLamps` puts the clustered lamp
  light at each model's luminaire. Keys / rural lanes: wooden utility poles with wires + a davit lamp on every second
  pole, carts and rural mailboxes (`keysLane`). Regulatory signs (`src/world/signs/regulatory.v2.js`) use the library
  STOP plate and a repainted library plate for SPEED LIMIT. Audit: `node tools/v2/furniture-audit.mjs`.

- **Cars (overnight Nov 17):** every road car is one of the user's models (`Models/Cars`, converted by `tools/v2/cars/`,
  runtime `src/vehicles/glb/`, see `src/vehicles/README.md` section 0). Park a specific car with
  `game.vehicles.spawnParked(key, { x, z, heading, color, wear })`; static covered car: `game.vehicles.placeStatic('covered1', ...)`.
  Nico's yard cars: `game.vehicles.nicoCars` (gray pickup with a black hood stripe, faded pale-blue classic).

- **Vegetation (overnight Nov 17):** every tree / palm / shrub is one of the user's library plants: converted by
  `tools/v2/vegetation/build.sh` (`species.json` -> `public/assets/models/vegetation/<key>.glb` + `_lod1.glb`), registered in
  `src/world/vegetation/species.js` (models + species GROUPS), loaded by `models.js` (impostor baked at load). Placement:
  countryside streamer (`countryside.js`, biomes), city tiles (`tilebuild.js` greenery: palms by zone, street trees, bushes,
  tree grates only on city sidewalks), set pieces via `game.vegetation.field(kind, items)` / `place(kind, x, z, opts)`.
  `game.vegetation.block(x, z, r)` keeps an area free; plants never stand where a static collider sits above the ground.
  `?veglib=0`: procedural plants only (A/B). Shader variation per instance: mirror, twist, bend, crown spread, frond droop, color jitter.

## 3. Rendering rules (stage 1)
- Locked 1080p-class internal resolution; TAA in every preset; no film grain. Any screen-space dither must use the
  per-frame offset `uFrameN` from `src/render/frameNoise.js` (TAA resolves it).
- Global shader patches (imported first in `main.js`): `src/render/specularAA.js` (specular anti-aliasing) and
  `src/render/wetSurfaces.js` (weather wetness; opt out with `material.defines.NO_WET`).
- `src/render/detailCull.v2.js`: objects under ~1.6 px are not drawn; small far objects skip shadows. Set
  `userData.noDetailCull = true` to opt out.
- Merge static meshes per material (`src/render/staticBatch.js` helper); instanced props; one mesh per material per tile.
- Dynamic shadow map updates every second frame (`game.dynShadowHalfRate = false` to disable).

## 4. Events (`game.emit` / `game.on`)
- `crime` `{ type, position|pos, severity?, by?: 'officer'|'witness'|'alarm'|'camera'|'self', witnesses? }` — types in
  `src/gameplay/wantedCore.js SEV` (assault, shoplift, vehicle_theft, carjack, trespass, vandalism, speeding, red_light,
  reckless, weapon_display, ...). Stars exist only once a crime is known to the police.
- `wantedChange` `{ level, before, reason }` — `game.wanted` (0..6 stars, `MAX_STARS = 6`, search radius per star
  `SEARCH_R`); the HUD reads it. The top-right corner (`src/ui/hud/corner.js`, matches
  `docs/v2/plan/hud_corner_target.webp`) shows `game.wanted.level` as charcoal stars and flashes them while
  `game.wanted.evading` (police lost sight); `game.hud.setWantedFlash(true|false|null)` forces the flash (null = auto),
  `game.hud.setKnown({ cameras, witnesses, outfit, face, weapon })` forces the five evidence badges (null = read
  `game.evidence`). Test: `node tools/v2/hud-shots.mjs`.
- `money` `{ account, amount, balance, entry }` (`src/systems/money.js`).
- `mission:start` `{ id, replay? }`; missions also emit progress through `game.story` (stage 4).
- `weather` `{ kind, prev }`, `lightning` `{ x, z, distance }` (`game.weather`, stage 1).
- Other common ones: `enterVehicle`, `crash`, `shot`, `hit`, `punch`, `arrest`, `witness`, `footstep`.

## 4b. People (the user's Tripo people, Nov 17)
- Assets: `public/assets/npc/people/<id>.glb` (p01..p95 = `Models/NPCs/NPC n`), textures `<id>_a.webp` (1K albedo),
  `_n.webp` (512 normal), `_o.webp` (ORM), close-up `_a2.webp` (2K), `_a4.webp` (4K) + `_n2.webp` (2K normal);
  `index.json` rows: `{ id, name, g, age, years, role, places, height, hipH, tris, cols }`. Cast list (heights, roles,
  places, hat height, logo boxes): `tools/v2/npcs/people.json`; rebuild `tools/v2/npcs/build.sh [ids]`.
- Skeleton: the 52 Mixamo-named joints of the archetypes (`mixamorig:Hips` ... fingers), canonical T-pose rest; the clip
  library `src/npc/arch/anim.js` drives everybody (`src/npc/people/lib.js` shares one bound clip set).
- Places (roles -> where they spawn, `src/npc/people/cast.js placesFor`): street, residential, keys, rural, farm, dock,
  fishing, port, work, industrial, business, nightlife, bar, tourist, beach, beach_walk, swim, sport, park, rough,
  shop_staff, shop_guest, kitchen, hotel_staff, security, medic, lifeguard, police, police_swat, police_detective.
- API: `game.npc.createPed({ zone, act, pos, gender })` (crowd; people first, archetypes as fallback, `?people=0` off),
  `game.npc.createCop({ pos })` (police model hook, SWAT armor at 4+ stars), `game.npc.spawnPosed({ place: 'cashier' |
  'kitchen' | 'bar' | 'hotel' | 'security' | 'lifeguard' | 'dock' | 'medic' | 'farm' | ..., pos, rot, pose })` (staff),
  `game.npc.cast` (people list, `stats()`, role posts: lifeguards on the sand by day, fishermen at moorings).
  A character with `c.human.person === true` is one of the user's people; `c.personMeta` is its index row.
- Rules: the same person never twice within 320 m (the crowd radius); per spawn height +-3 % and a slight tint; no added glasses/bags.

## 5. Notes for later stages
- Stage 1 status, open items and measured fps: `docs/v2/briefs/STATUS_stage1.md`.
- Model requests: `docs/v2/briefs/MODEL_REQUESTS_stage1.md`.
