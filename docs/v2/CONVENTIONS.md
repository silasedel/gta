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
- **Police stations:** `src/gameplay/police/stations.js` `STATION_SITES` (district centers, snapped to the nearest road at
  run time). HQ: Southline PD Headquarters, Downtown (407, -110).
- **Jail:** use Southline PD Headquarters (407, -110) until a jail interior exists (stage 4 adds the scene).
- **Cameras:** speed / red-light cameras: put them at signalized nodes of `primary`/`trunk` roads in downtown/business
  zones (none in rural zones), security cameras on storefronts (stage 2/3).
- **Airport and docks:** Miami International runways in `layout.json airport.runways`; Key West airfield
  `layout.json airfield`; moorings `city.moorings` / `claimMooring` (boats); the port is Dodge Island (1595, 792).
- **Casino:** the curved spiral casino tower (Models/Buildings "Building 15") — location recorded here by the buildings
  pass; its back lot and loading-dock road are the service road behind it (see section 5 when filled in).

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
  `SEARCH_R`); the HUD reads it.
- `money` `{ account, amount, balance, entry }` (`src/systems/money.js`).
- `mission:start` `{ id, replay? }`; missions also emit progress through `game.story` (stage 4).
- `weather` `{ kind, prev }`, `lightning` `{ x, z, distance }` (`game.weather`, stage 1).
- Other common ones: `enterVehicle`, `crash`, `shot`, `hit`, `punch`, `arrest`, `witness`, `footstep`.

## 5. Notes for later stages
- Stage 1 status, open items and measured fps: `docs/v2/briefs/STATUS_stage1.md`.
- Model requests: `docs/v2/briefs/MODEL_REQUESTS_stage1.md`.
