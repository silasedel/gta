# Synthetic world features: interchange format (v1, written by the lead)

`world-layout` writes `tools/world/out/features.json` (+ `heights.bin`). `world-osm` ingests it and merges it with the real-Miami OSM data into one tile set, road graph, grid and map layers. If either side needs the format changed, edit this file and note the change at the bottom; the other side reads it before each build.

All coordinates are world meters in the CONTRACT4 frame (x east, z south). Polygons: `outer` is a ring of `[x, z]` (open, not repeated), `holes` is a list of rings.

```
{
  "version": 1,
  "bounds":   { "minX", "maxX", "minZ", "maxZ" },          // whole world including ocean margin
  "realRect": { "minX": -5000, "maxX": 4600, "minZ": -4000, "maxZ": 3400 },  // OSM owns everything inside; synthetic land/areas/buildings are clipped out of it
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
