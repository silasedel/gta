# World data pipeline (track `world-osm`): real Miami (OSM) + the synthetic world, one tile set

Map data inside the real rectangle is © OpenStreetMap contributors (ODbL). The in-game map must show `data.attribution`.

## The whole merge is ONE command (re-run it whenever `tools/world/out/features.json` changes)

```
tools/osm/.venv/bin/python tools/osm/merge.py
```
It builds the unified world from the cached OSM pull plus `tools/world/out/features.json` + `heights.bin` (world bounds are read
from features.json, nothing is hard-coded), audits it through the game's own loader (`tools/osm/audit.mjs`: road connectivity,
geometry, storefronts, tile coverage, heights, transit), and **only if every check passes** publishes it by atomically replacing
`public/assets/miami/world.json`. A failed build or audit leaves the live world untouched and prints where the staged build is.
Takes about 45 s. `--force` publishes despite a failed check, `--no-publish` only stages. Hard-reload the game afterwards.

## New in V2 (read this first; renderer and gameplay tracks)

**What changed**
- The world is now **real Miami (the V1 rectangle, x −3709…4511, z −2654…2654) merged with the synthetic regions** from
  `tools/world/out/features.json` + `heights.bin` (format: `tools/world/FORMAT.md`). `data.bounds` is the whole world,
  `data.realRect` the 1:1 OSM part, `data.inRealMiami(x, z)` tells them apart. Without a features file the world is just real Miami.
- **Files:** `public/assets/miami/world.json` is the manifest of the live build and points (`dir`) at `public/assets/miami/<build>/`.
  A build is written to a staging folder, renamed, and published by atomically replacing `world.json`. The previous build stays on
  disk for running games. The V1 files (`manifest.json`, `tiles/`, `tiles.bundle.json`, root `grid.bin` ...) are gone.
- **Tiles ship in region bundles** (`regions/{rx}_{rz}.json`, 4×4 tiles = 800 m, the streamer's chunk), loaded on demand.
  - `data.getTile(tx, tz)` returns the tile, `null` (empty: open water), or **`undefined` when its region is not in memory yet**.
  - `data.tileReady(tx, tz)` (tile + 8 neighbors in memory), `data.requestTile(tx, tz)`, `data.loadRegion(key)`, `data.regionStats`.
  - `dataProvider.js` now has `*waitTile(i, j)` (yields until ready), which `tilebuild.js` already uses, so builders never see a
    missing tile as an empty one. `data.update(focus)` (registered on `game.updaters`) keeps regions within 2.6 km of the camera
    and player loaded (plus look-ahead along the player's velocity) and frees regions beyond 4.8 km. The port's regions
    (`manifest.bootRegions`, cruise terminals for `port.js`) and the ones around the default spawn load during boot.
  - **Do not loop over `data.tileKeys` calling `loadTile`/`getTile` at boot** (it would pull the whole world). Use the global lists below.
- **Grids** (`grid.bin`, deflated per layer): `surface` 2 m, `cover` 4 m, `zone`/`district`/`wkind` 8 m are kept as run tables in
  memory (a few MB for the whole world) and read by binary search; `depth` 8 m and `height` 16 m are dense.

**New queries on `data`**
- `terrainHeightAt(x, z)`: ground height above y = 0 (bilinear, 16 m). Zero in real Miami; hills and dunes outside.
  `groundHeightAt` includes it (terrain + curb on sidewalks; decks as before). `data.heightField = { cell, minX, minZ, nx, nz, unit, data: Int16Array }`
  (node-registered: sample (i, j) is at `minX + i*cell`, `minZ + j*cell`), `data.hasRelief`.
- `coverAt(x, z)`: land cover class (list in `manifest.cover`): `none park grass wild pitch playground sand dirt parking plaza marina
  island pool scrub forest pine sawgrass wetland mangrove farmland grove paved apron runway taxiway campground golf rock gravel
  dune construction garden cemetery` (+ any new kind the world layout invents, appended).
- `waterKindAt(x, z)`: `'sea' | 'lake' | 'canal' | 'river' | 'pond' | 'marsh' | null`. Outside real Miami, canals, ponds and marsh
  keep their own shallow depth (`seabedDepthAt`); the 5 m swim floor applies to the sea and lakes.
- `zoneAt` can also return **`'airport' | 'rural' | 'wilderness'`** (appended to the V1 list; V1 ids unchanged).
- `places` (`{ name, kind, x, z, r, real? }`: real districts, islands and waters + the layout's towns, keys, parks, lakes, regions),
  `setpieces` (`{ id, x, z, heading }`, e.g. `nico_house`, `keys_sign`), `sites` (typed land-use sites and buildings:
  `{ use, x, z, r, kind?, sub?, tier?, b? }`), `controls` (`{ signals, stops, yields, crossings }` as `[x, z]` lists for the whole world),
  `transit` (below), `mapLayers.cover[cls]` (polygons for the pause map), `mapLayers.rails`, `mapLayers.realRect`.

**Road graph (`data.roadGraph`)**
- Edge: `ref` ('I-95', 'US-1;SR 970'), `controlA` / `controlB` (control faced when arriving at node a / b: `'signal' | 'stop' | 'yield' | null`),
  `turnLanes`, `turnLanesBack`, `toll`, `lit`, `speedPosted` (speed limit is from a real sign tag), `surface` ('asphalt', 'dirt', 'gravel' ...),
  `destination`, `destinationRef` (sign text on ramps), `bridgeName`, `roundabout`, `synthetic`, `private` (gated yard or drive),
  `component` (0 = main network), `mainNetwork` (in the main strongly connected part).
- **Heights:** `edge.y` is the ABSOLUTE road surface height. `edge.elevated` = a structure (bridge, overpass, ramp).
  **`edge.terrain` = the road only follows non-flat ground** (hills): not a deck. In tiles such a road piece has `y: null` (as a flat road)
  and **`terrainY: [...]`**; the renderer must drape it (and the ground mesh) on `terrainHeightAt`. `tile.relief = { min, max }` is set on
  tiles whose ground is not flat (null otherwise).
- Node: `signal`, `control`, `exit` (motorway exit number). `roadGraph.turns = { no, only, via }` and
  `roadGraph.turnAllowed(fromEdgeId, nodeId, toEdgeId)`, `roadGraph.controlAt(edge, dir)`.
- Connectivity is audited: one network, except Fisher Island (ferry only in reality). Real roads up to 800 m outside the rectangle are
  kept where they tie a clipped street back to the network; synthetic roads are snapped onto the clipped OSM ends at the rectangle edge,
  and the other carriageway of a divided road gets a short connector.

**Tiles (`data.getTile`, renderer format; all V1 fields unchanged)**
- `areas[]`: `kind` is still the ground bucket the renderer knows (`land beach park grass parking paved`); **`cls` is the precise class**
  (the `coverAt` list) and `surface` the walk surface. New classes arrive with a sensible bucket today (sawgrass, wetland, mangrove,
  forest, pine, scrub, farmland, grove → `grass`; runway, taxiway → `parking`; apron, paved → `paved`; dune → `beach`; golf, cemetery,
  garden, campground → `park`; dirt, construction, rock, gravel → `land`). **city-look: switch on `cls` to give each its own look.**
- `buildings[]`: + `use` (land use: fuel, hotel, school, worship, parking_garage, office, hospital, police, fire_station, supermarket,
  car_dealer, laundromat, gym, marina, bank, mall, museum ...), `poiKind`, `osm` ('shop=shoes'), `sub` (cuisine, sport, shoe store
  type ...), `tier` (luxury | premium | mid | budget), `address`, `material`, `roofMaterial`, `roofHeight`, `roofLevels`, `year`,
  `architecture`, `tenants` (types of places inside that have no street door), `synthetic`, `heading`, `sourceId`.
  New `style` values from the layout: `stilt hangar terminal barn cabin strip`. Names are never carried (types only).
- `trees[]` entries are `[x, z, species]` (`tree palm royal_palm coconut oak pine cypress mangrove citrus gumbo banyan seagrape`).
- `props[]` (`{ type, x, z, heading? }`): many more types (`manifest.props`): yield, bench, water_tap, bike_share, recycling, vending, atm,
  post_box, phone, ev_charger, shelter, toilets, beach_shower, garage_entrance, cctv, crane, mast, flagpole, buoy, bollard, gate, gate_arm,
  toll_gantry, power_pole, power_tower, rail_crossing, station_entrance, monument, picnic, boat_ramp, billboard, entrance, lifeguard ...
  plus whatever prop types the layout uses (passed through by name).
- New lists: `sites[]` (`{ use, kind, sub, tier, rings }`: school grounds, fuel forecourts, hospital campuses, marinas ...),
  `rails[]` (`{ kind: people_mover | metro | rail, pts, y, bridge }`), `barriers[]` (`{ kind: fence | wall | hedge | ..., pts, height, material }`),
  `underwater[]` (reef / seagrass polygons from the layout), `setpieces[]`, `roads[].ref/surface/lit/toll/synthetic/terrainY`,
  `nodes[].exit`, `pois[]` + `osm, sub, tier, buildingId, address, level`.
- Storefronts (`data.storefronts`): + `osm`, `sub`, `tier`, `addr`, `driveThrough`, `outdoorSeating`. `poi: true` means the kind is the real
  OSM type at that address (or the layout's). Every storefront has a kind, a facing and a street (audited).

**Transit (`data.transit`)**
- `stops[]` `{ id, x, z, name ('NW 7th Ave & NW 20th St', derived from the streets), kind: bus | trolley, edge, s, side, shelter, bench, routes }`
- `routes[]` `{ ref, kind, name ('Route 77'), stops: [stop id], edges: [[edgeId, dir]] (a continuous drivable path through every stop), loop, length }`
- `lines[]` `{ kind: people_mover | metro | rail, name ('Omni Loop', 'Orange Line', 'Commuter Rail'), pts, y (track height), stations, loop }`,
  `stations[]` `{ name, kind, x, z, y }`. Operator and company names are dropped or replaced.

## Rebuild

```
tools/osm/.venv/bin/python tools/osm/fetch.py            # Overpass -> tools/osm/cache/v2/*.json (cached; --force to refetch)
tools/osm/.venv/bin/python tools/osm/build.py            # OSM + tools/world/out/features.json -> public/assets/miami/<build>/, publishes world.json
tools/osm/.venv/bin/python tools/osm/output.py           # re-emit from cache/v2/work/v.pkl
tools/osm/.venv/bin/python tools/osm/preview_world.py    # docs/v2/shots/world-osm/world_preview.png  (--crop x0,z0,x1,z1 --mpp 1)
node tools/osm/audit.mjs --out docs/v2/reports/world-osm-audit.json   # connectivity, geometry, storefronts, coverage, heights, transit, speed
tools/osm/.venv/bin/python tools/osm/edge_summary.py     # tools/osm/cache/edge_summary.json for the world layout
```
Environment: `WORLD_FEATURES=<file>|none` (other features file / real Miami only), `MIAMI_OUT=<dir>` (build somewhere else),
`MIAMI_WORK=<dir>`, `MIAMI_NO_PUBLISH=1` (build the folder but leave `world.json` alone; publish later by copying
`<build>/manifest.json` over `world.json`).

Modules: `config.py` (rectangles), `fetch.py`, `land.py` (coast), `roads.py` (graph, stitching, controls, restrictions, rail),
`poi.py` (OSM tags → types, private brand → tier lookup), `districts.py`, `ingest.py` (features.json), `transit.py`, `build.py`,
`output.py` (files, regions, publish), `audit.mjs`, `preview_world.py`, `edge_summary.py`.

# V1 notes (still valid unless superseded above)

## Runtime API: `src/world/miami/data.js`

`const data = await loadMiamiData(game, { base?, bundle? = true })`. This loads about 13 MB in roughly 0.1 s in Node and also sets `game.miamiData`.

Every pure-data part of the CONTRACT4 city API:
- `bounds`, `seaLevel` (-0.12), `curbHeight` (0.15), `pierHeight` (1.2), `playerSpawn` (Vector3), `playerSpawnHeading`, `attribution`
- `groundHeightAt(x, z, y?)`
  - On a bridge or ramp it returns the deck height. If you pass `y` and it is more than 4 m below the deck, you get the ground or seabed under the bridge instead.
  - Sidewalk polygons return 0.15 and piers return 1.2. Other land returns 0.
  - Water returns `seaLevel - depth`. Depth is a shelf of 0.25 m + 3.5 % off beaches and about 2.2 m + 3 % off seawalls, capped at 5 or 6 m. Shipping channels go down to 12 m.
- `isWater(x, z)` reads a 2 m raster.
- `surfaceAt(x, z, y?)`: water over a bridge returns `'asphalt'`.
- `zoneAt(x, z)` and `districtAt(x, z)` read an 8 m raster. Districts have real names, for example South Beach, South of Fifth, Collins Park, Brickell, Brickell Key, Downtown, Arts & Entertainment District, Edgewater, Overtown, PortMiami, Watson Island, MacArthur Causeway, Venetian Causeway, Star, Palm and Hibiscus Islands, the Venetian islands, Sunset Islands and Fisher Island. Water areas include Biscayne Bay, Atlantic Ocean, Miami River, Government Cut and Main Channel.
- `streetNameAt(x, z, maxDist = 60)` returns the nearest named road, or a named promenade such as Lincoln Road if that is closer.
- `roadGraph = { nodes, edges, nearestEdge, edgesAt, otherNode, pointAt }`. It contains **drivable edges only**. Footpaths live in `data.paths` with kinds `sidewalk|crossing|footway|path|cycleway|steps|pedestrian|track`, so GPS cannot route on them.
  - edge: `{ id, a, b, pts:[[x,z]], pf:Float32Array, cum, length, width, lanesFwd, lanesBack, oneway, speedKmh, name, kind (OSM highway value, e.g. 'primary', 'motorway_link'), bridge, movable, layer, elevated, y:Float32Array (deck height per pts vertex; zeros if flat), sidewalk (width in m, 0 = none) }`
  - node: `{ id, x, z, y, edges:[edgeIds] }`
  - `nearestEdge(x, z, out?, maxDist = 500, filter?)` returns `{ edge, t (0..1), s (m), seg, u, dist, point{x,z}, dir{x,z}, y }`. It uses a 40 m segment hash and takes about 1.8 µs. Pass `out` to avoid allocating.
  - `pointAt(edge, s, out)` returns `{x, y, z, dx, dz}`.
  - Oneway edges always run a to b. `-1` ways were reversed during the build.
- `randomRoadPoint(near?, radius = 250, {filter?})` returns `{ position, heading, edgeId, laneOffset (+ = right of travel), dir (+1 a to b, -1 b to a), s, lane }`. Traffic drives on the right. Service roads and living streets are excluded by default.
- `randomSidewalkPoint(near?, radius = 150, zone?)` picks a point on the derived sidewalk centre-lines. `zone` can be a string or an array. If nothing matches, it falls back to OSM footpaths and then to wider radii.
- `storefronts` (alias `shopLots`): `{ id, x, z (shop box centre inside the building), y, w, d, facing (heading toward the street), fx, fz (door / facade midpoint), sx, sz (AABB), kind, poi (true if typed from a real OSM shop or amenity node; types only, no business names), buildingId, street, zone, district }`
- `benches` (OSM-mapped, facing the nearest road) and `leanSpots` (on building facades facing streets, heading facing outward). Both are lists of `{ pos: Vector3, heading }`.
- `storefrontsNear(x, z, r, out?)`, `benchesNear`, `leanSpotsNear`
- Legacy: `roads` (straight segments) and `buildings` (AABB boxes)
- `mapLayers`:
  - `land`, `water` (inland), `beach` and `park` are lists of `{outer:[[x,z]], holes}`.
  - `buildingPolys` is a list of `{outer, h}`.
  - `roadEdges` is the list of edges.
- `sidewalkLines` (`{edge, zone, pf, length}`), `paths` (`{kind, width, surface, bridge, name, pf}`), `names` (`{streets: {name: [edgeIds]}, districts: {name: {x, z}}}`)

### Tiles

The tile grid is 200 m, aligned to world multiples, so tile `(tx, tz)` covers `[tx*200, (tx+1)*200)`. Keys look like `"tx_tz"`, can be negative, and match the CITY streamer's `floor(x / tileSize)`. 756 tiles are non-empty.

Helpers: `tileSize`, `tileRange`, `tileKeys`, `tileKey`, `tileKeyAt`, `tileIJ`, `tileBounds`, `tilesAround(x, z, r)` (existing keys, nearest first) and `hasTile`.

- `getTile(tx, tz)` is synchronous and returns the CITY renderer's internal format (the same shape as `devProvider.js`):
  - `areas` with kind `land|beach|park|grass|parking|paved`, plus `cls` and `surface`. The `land` areas are the land polygons clipped to the tile, so you can build the ground mesh from them.
  - `roads`: the pieces of each edge whose segment midpoints fall in this tile, with `edgeId`, `y`, `sidewalks` and `sidewalkWidth`.
  - `nodes` with `degree`, `signal` (from OSM traffic signals), `width` and `dirs`.
  - `buildings` with `rings`, `h`, `minH`, `levels`, `kind`, `style` (`tower|midrise|lowrise|deco|house|canopy|garage|industrial`), `zone`, `roof`, `colour`, `roofColour`, `area`, `cx`, `cz` and `storefront`.
  - Point lists `trees` (includes `palms`), `signals`, `lamps`, `busStops`, `crossings` and `stops`, plus `props` for other types.
  - Extras: `sidewalkPolys`, `paths`, `piers` (deck `y`), `storefronts`, `benches`, `leanSpots` and `pois`.
  - Synchronous access needs `tiles.bundle.json`, which is preloaded by default (3.4 MB).
- `loadTile(key)` is a Promise with the generic decoded tile:
  - Rings are flat `Float32Array [x0,z0,x1,z1,...]`. Rings are open, and the outer ring is CCW in x/z maths orientation.
  - Fields: `buildings`, `land`, `sidewalks`, `landcover`, `paths`, `piers`, `roadEdges` (owned by midpoint), `roadEdgesTouching`, `storefronts`, `benches`, `leanSpots`, `props` and `pois`.
  - Use `unloadTile(key)` or `dropTileCache(key)` to free a tile.

### Elevation

Bridge and overpass decks are computed in `roads.py:elevate`:
- Peak targets:
  - 12 m over water for bridges longer than 150 m (MacArthur, Port Boulevard), otherwise 8 m.
  - 6 m for movable bridges (the Venetian drawbridges).
  - 6.8 m × layer over land (the I-95/I-395 stacks reach about 20 m).
- Ramps run at a 6.5 % grade along the graph. At-grade junctions are pinned to 0, and the deck height is the smaller of the peak field and the ground field.
- Edges with any elevation are densified to 12 m vertex spacing.
- Tunnels (the PortMiami Tunnel) are excluded from the graph.

## Files: `public/assets/miami/`

Coordinates are ints in decimetres (`q = 10`) unless stated otherwise.

| File | Contents |
|---|---|
| `manifest.json` | bounds, spawn, tile range and keys, enums (surfaces, zones, districts, props), grid metadata, file map, stats |
| `roadgraph.json` | `nodes` (flat), `edges[{a,b,p,w,lf,lb,o,s,n,k,br?,l?,y?(cm),sw?}]`, `names`, `kinds` |
| `peds.json` | derived sidewalk centre-lines `{e,p,zn}` and OSM paths `{k,w,p,s?,br?,n?}` |
| `spots.json` | storefronts, benches, leanSpots (metres) |
| `map.json` | minimap layers: land (3 m simplified), inland water, beach, park, buildings `{p,h}` (1 m) |
| `names.json` | street name to edge ids; district centroids |
| `grid.bin` | RLE rasters `(u8 value, u16le run)` per layer, offsets in `manifest.grids`. surface 2 m, depth 4 m (dm), zone 8 m, district 8 m |
| `tiles/{tx}_{tz}.json`, `tiles.bundle.json` | per-tile data (see `output.py`) |

Surface raster classes include `sidewalk` (reported as concrete, raised 0.15), `pier` (reported as wood, raised 1.2) and `building` (reported as concrete; tells you a point is inside a footprint).

## Known limits

- Building heights:
  - 3,832 come from the height tag (Miami-Dade import) and 425 from building:levels.
  - About 2,770 are estimates based on building type, zone and footprint, with deterministic jitter.
  - Building parts replace their outline when they cover at least 70 % of it.
- Sidewalks are derived for every non-elevated street except motorways, service roads and the port. They are the road buffer minus carriageways, buildings and water.
- The spawn is on the west (hotel) sidewalk of Ocean Drive near 10th Street, facing north (heading π), with the deco strip on the left and Lummus Park and the beach on the right.
