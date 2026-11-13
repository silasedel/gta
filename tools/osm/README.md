# Miami OSM pipeline (DATA agent)

Map data is © OpenStreetMap contributors and licensed under the ODbL. The in-game map must show that attribution (`data.attribution`).

## Rebuild

```
python3 -m venv --system-site-packages tools/osm/.venv && tools/osm/.venv/bin/pip install shapely   # once
tools/osm/.venv/bin/python tools/osm/fetch.py      # Overpass -> tools/osm/cache/*.json (cached; --force to refetch)
tools/osm/.venv/bin/python tools/osm/land.py       # coastline -> land polygons (cache/work/land.pkl)
tools/osm/.venv/bin/python tools/osm/build.py      # everything -> public/assets/miami/*, docs/showcase/map/*
tools/osm/.venv/bin/python tools/osm/output.py     # re-emit files only, from cache/work/v.pkl
```

The bounding box and world frame are set in `config.py`:
- bbox is lat 25.755..25.803, lon -80.202..-80.120, which is about 8.2 x 5.3 km.
- The origin and projection follow CONTRACT4.

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
