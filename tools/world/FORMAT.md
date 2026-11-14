# Synthetic world features: interchange format (v1, written by the lead)

`world-layout` writes `tools/world/out/features.json` (+ `heights.bin`). `world-osm` ingests it and merges it with the real-Miami OSM data into one tile set, road graph, grid and map layers. If either side needs the format changed, edit this file and note the change at the bottom; the other side reads it before each build.

All coordinates are world meters in the CONTRACT4 frame (x east, z south). Polygons: `outer` is a ring of `[x, z]` (open, not repeated), `holes` is a list of rings.

```
{
  "version": 1,
  "bounds":   { "minX", "maxX", "minZ", "maxZ" },          // whole world including ocean margin
  "realRect": { "minX": -3709, "maxX": 4511, "minZ": -2654, "maxZ": 2654 },  // OSM owns everything inside; synthetic land/areas/buildings are clipped out of it
  "land":  [ { "id", "name?", "outer", "holes" } ],        // every landmass and island outside realRect (may overlap its edge; the merge unions them with OSM land)
  "water": [ { "id", "kind": "lake|canal|river|pond|marsh_open", "name?", "outer", "holes" } ],
  "areas": [ { "id", "kind", "name?", "outer", "holes" } ],
      // kind: beach | sand | park | grass | scrub | forest | pine | sawgrass | wetland | mangrove | farmland | grove | dirt |
      //       parking | paved | apron | runway | taxiway | residential | commercial | industrial | campground | golf
  "roads": [ { "id", "pts": [[x,z],...], "kind": "motorway|motorway_link|trunk|primary|secondary|tertiary|residential|service|track",
               "lanesFwd", "lanesBack", "oneway", "speedKmh", "name", "ref?", "bridge": false, "y?": [per-point deck heights], "surface?": "asphalt|concrete|gravel|dirt|sand" } ],
  "paths": [ { "pts", "kind": "footway|boardwalk|trail|pier|dock", "width", "surface", "name?" } ],
  "buildings": [ { "id", "ring": [[x,z],...], "h", "levels", "kind", "style", "zone", "colour?", "roofColour?", "roof?", "name?", "poi?": { "type" } } ],
      // style: tower | midrise | lowrise | deco | house | stilt | canopy | garage | industrial | hangar | terminal | barn | cabin | strip
  "pois":  [ { "x", "z", "type", "name?" } ],               // shop/amenity types (same vocabulary as OSM shop=* / amenity=*)
  "props": [ { "x", "z", "type", "heading?" } ],            // lamps, signals, bus stops, signs, fences, power poles ...
  "trees": [ { "x", "z", "type": "palm|royal_palm|coconut|oak|pine|cypress|mangrove|citrus|gumbo|banyan|seagrape" } ],  // sparse hand-placed ones; dense vegetation comes from area kinds
  "places": [ { "name", "kind": "district|town|key|island|park|lake|airport|region|beach", "x", "z", "r" } ],
  "joins": [ { "x", "z", "roadId", "osm": "real road name or ref this continues (e.g. I-95, US-1, SW 8th St)", "note?" } ],
  "setpieces": [ { "id": "nico_house|keys_sign|...", "x", "z", "heading", "note?" } ],
  "heights": { "file": "heights.bin", "cell": 16, "minX", "minZ", "nx", "nz", "unit": 0.1 }   // Int16 little-endian, value*unit = meters above y=0; 0 everywhere except the park hills and gentle dunes
}
```

Rules:
- Roads that leave real Miami must meet a real OSM road at the `realRect` edge (list them in `joins`), so the merged road graph is one connected network.
- Nothing synthetic is placed inside `realRect` except road stubs up to the join points.
- Names must be original (see CONTRACT5 banned names). Real road numbers continue outside the real rect only where it is natural (I-95 north, US-1 south as the Overseas Highway); invented roads get invented county/state route numbers.
- Also write `public/assets/world/layout.json`: a small summary (`places`, region polygons, `setpieces`, `bounds`, `realRect`) that game modules can fetch.

## Change log
- v1 (lead): initial format.
- v2 (lead, Nov 13 5:30 PM): world halved. `realRect` is now the v1 Miami rectangle (x −3709…4511, z −2654…2654); world bounds about x −7000…5400, z −6000…6500. See the layout table in CONTRACT5.
- v2.1 (world-osm, Nov 13): how the ingest (`tools/osm/ingest.py`) reads the file; no field was removed or renamed.
  - `heights`: samples are node-registered: sample `(i, j)` (row-major, `j` rows of `nx`) is the height at `x = minX + i*cell`, `z = minZ + j*cell`. Heights inside `realRect` are ignored (flat).
  - Road `y` values are ABSOLUTE deck heights (above y = 0), one per point. A bridge without `y` gets a computed profile (8 to 12 m over water, 6.5 % ramps).
  - Road ends within 3 m of a clipped OSM road end on the `realRect` edge (32 m if the name or ref matches) are snapped onto it; the exact crossings are in `tools/osm/cache/edge_summary.json`. A road end within 1.5 m of another synthetic road gets a shared vertex there; at-grade crossings without a shared vertex get one (bridges are left alone).
  - Optional extras the ingest also understands: road `width`, `layer`, `sidewalk` (`yes`/`no`), `toll`, `lit`, `destination`, `access`; water `depth` (m); building `minH`, `material`, `heading`, `poi.sub`, `poi.tier`; poi `sub`, `tier`; places of kind `sea|bay|sound|gulf` name the open water around them; area kinds `dune`, `marsh`, `rock`, `gravel`, `plaza`, `pitch`, `marina`, `cemetery`, and `reef`/`seagrass` (passed to tiles as `underwater`). Unknown area kinds and prop types are passed through by name; unknown top-level keys are reported, not dropped silently.
- v2.1 (world-layout, Nov 13): what `tools/world/build.py` actually writes, beyond the v1 fields. All additions are optional for the ingest.
  - `version: 2`. **Road connectivity:** two roads are connected if and only if they share a vertex with identical coordinates (2 decimals). Every road is already split at its junctions, so each `roads[]` entry is one graph edge (end to end). A crossing without a shared vertex is a grade separation (one of the two has `bridge: true` and a higher `layer`).
  - `roads[]` also carry `width` (m, carriageway), `layer` (0 ground, 1 overpass/viaduct). `y` is given only where the deck is above the ground plane (bridges, their approach ramps); roads on the park hills have no `y` and follow `heights.bin`.
  - One-way roads run in point order. Motorways are two one-way carriageways.
  - `joins[]` entries also carry `osmWay` (the id from edge_summary). The join vertex is the exact (x, z) from `edge_summary.json`; each join road is a short stub from that point to our first road outside the rectangle.
  - `water[]` carry `depth` (m). Kinds used: lake, river, pond, marsh_open (airboat trails). Tidal water is simply the absence of land.
  - `buildings[]` carry `facing` (heading toward their street) and `region`; `pois[]` carry `building` (id) where the POI is a typed shop unit.
  - `props[]` types beyond v1: power_pole, lot_lamp, pylon_sign, price_sign, neon_sign, fuel_pump, mailbox, culdesac, pool, dumpster, picnic_table, playground, flagpole, rv_* and boat_* props, stop, signal, lamp and others (free vocabulary; unknown types can be ignored).
  - Extra top-level list `powerlines[]` ({name, kind, poles}).
  - `public/assets/world/layout.json` adds: `regions` (name → ring), `airport` (runways, tower, `approaches` and `departures` lines for the aircraft track), `airfield`, `routes.airboat`, `wildlife` (gator holes, hammocks), `underwater` (reef line, reefs, caves, wrecks, seagrass, channels with depths), `highways`, `peak`.
- v3 (world-layout, Nov 13, 6:30 PM): the world is now machine-traced from the user's official map image (`references/ref_40_map_user_official.webp`, local only, 1041 x 1500 px).
  - **Image transform (uniform scale + translation, no rotation):** `x = -15000 + 20 * px`, `z = -15700 + 20 * py` (20 m per pixel). `bounds` is exactly the image: x -15000 … 5820, z -15700 … 14300. The same numbers are in `features.json.imageTransform` and `layout.json.imageTransform`. The real Miami rectangle is image pixels x 564.6 … 975.5, y 652.3 … 917.7.
  - `version: 3`. New optional top-level list `shallows[]` (polygons of the image's turquoise shallow water, for the water and map tracks).
  - `water[]` are the image's inland waters (lake, rivers, ponds, swamp channels as `marsh_open`); `areas[]` carry the traced `beach` and `forest` polygons.
  - `setpieces[]` now carry `lot` (ring of the clear lot) or `verge_radius`.
  - `heights.bin` covers the new bounds (1301 x 1875 cells of 16 m); peak 260 m.
  - Everything in v2.1 about connectivity, joins and extra fields still holds.
- v3.1 (world-layout, Nov 13, 6:48 PM): heights are now slope-limited (30 %) and graded under roads; flat inside the real rectangle with a 400 m taper. The ring is two one-way `motorway` carriageways with `motorway_link` ramps; ramp junctions over the median are `bridge: true, layer: 1` pieces. Traced town outlines are also written as `areas` of kind `residential`. `layout.json` adds `routes.airboat` and `airfield.bearingDeg`. Set-piece coordinates are unchanged from v3.
- v4 (world-layout, Nov 13, 7:10 PM): **30 m per pixel, and the picture wins everywhere** (user decision).
  - **Image transform:** `x = -25450 + 30 * px`, `z = -24890 + 30 * py` (uniform, no rotation). `bounds` = the image: x -25450 … 5780, z -24890 … 20110 (31.2 x 45 km). The real rectangle is image pixels x 724.7 … 998.7, y 741.2 … 918.1. Fit: scale fixed; x0 by least squares over five control points, z0 from the barrier island's south tip on South Pointe. Residuals: ocean shore +42 / +24 / -36 m on three rows, beach bay shore +610 m, downtown bayfront -650 m (the image's barrier island and downtown are both wider than the real ones). Same numbers in `features.json.imageTransform` and `layout.json.imageTransform`.
  - `land[]` is now the image's land for the WHOLE world, including inside the real rectangle (it is no longer clipped there, and no longer blended into the OSM coast).
  - **`city_mask`** (new, for the follow-up merge change): `rect`; `land[]` and `water[]` (image land / image water polygons inside the rectangle); `newLand[]` (image land that real data lacks); `removeRealLand[]` (real land the image shows as water); `islands[]` (outlines of every image island within 1.2 km of the rectangle, with `id` and `areaM2`); `causeways[]` (`{island, pts, lengthM}`: shortest crossing from each island to the next larger land; generated, not digitized from the picture). Rule: inside the rectangle keep real streets and buildings only where they fall on `city_mask.land`; clip them on `city_mask.water`.
  - Synthetic streets and buildings now also exist inside the rectangle, but only on `newLand` (the generator's keep-out is real land that is also image land). Real edge joins are unchanged (135 stubs to the fringe collectors).
  - `palette` (new, top level and in layout.json): colors sampled from the image (`ocean`, `shallow`, `sand`, `urban`, `forest`, `land`, `water`). `areas[]` of kind `beach` and `shallows[]` carry `colour`.
  - `layout.json` adds `relief` (forest height statistics). Heights: 1951 x 2812 cells of 16 m.
- v4.1 (world-layout, Nov 13, pass 7; staged in `tools/world/out_pass7/` until the lead swaps it in):
  - **Bug fix that moves geometry:** the official image is 1041 x **1511** px, not 1500. Passes 4 to 6 squeezed the traced land north–south by 0.73 % (up to 330 m at the south end) relative to the transform. Fixed: `bounds.maxZ` is now 20440 and traced features sit exactly on `x = -25450 + 30 px`, `z = -24890 + 30 py`. Hand-digitized roads were always on the true transform.
  - The picture's bridges and causeway decks (thin pale strips over the sea) are now water, so roads there are `bridge: true`.
  - Inland waters keep their islands (polygons with holes); the ring island north of the city is `places: Corona Island`, with `Corona Loop` and two bridge roads.
  - New top-level `districts[]`: `{name, type, tint, roofTint, areaHa, outer}`; `type` is one of downtown, old_town, resort, industrial_port, suburb, rural_town, rural_florida; `tint` / `roofTint` are sampled from the picture inside the outline. Also in `layout.json.districts` (without outlines).
  - Roads may carry `racetrack: oval | road_course | pit_lane` (Solana Motor Speedway). `layout.json` adds `speedway`, `ringIsland`, `airport.measuredRunways` (pavement strips measured from pixels) and `airfield.runways[].measuredFromImage`.
  - Unpaved streets in Amaro Landing have `surface: dirt | gravel`.
