# WAVE 4: real-scale Miami (read CONTRACT.md, CONTRACT2.md and CONTRACT3.md first)

Goal: rebuild Port Solana on **real Miami geography from OpenStreetMap**, at real scale, streamed so it holds **60 fps in the browser on a MacBook**. Then push every system (cars, guns, audio, NPCs, ragdolls, interiors, lighting, HUD) to a much higher level.

This wave has no clock. Work in solid increments, keep the build working at all times, and report when your track is done or blocked.

## Hard rules (unchanged)
- **Ports:** dev server is http://127.0.0.1:5180. NEVER touch 5173 (the user's frozen build).
- **Atomic edits only:** write to a temp copy, esbuild-check it, then `mv` it into place. esbuild cannot resolve Vite absolute imports like `/src/...`; that particular error is fine, any other error is not.
- **Original designs:** no names, logos, UI, fonts, characters or icons from any existing game. Use made-up vehicle brands, and don't replicate an exact real car model or its badges.
  - Real-world places are fine: Miami streets, neighbourhood names, the coastline and real building footprints.
- **Asset licences:** CC0 / CC-BY / ODbL only. Log every source and its licence in CREDITS.md. OpenStreetMap data is ODbL and needs the "© OpenStreetMap contributors" attribution (UI agent shows it in the pause map).
- **Shared browser:** be careful with the shared browser pane. Prefer headless checks or your own preview pages.

## World frame (all modules)
- Origin is lat0 = 25.7790, lon0 = -80.1650 (Biscayne Bay, between Downtown and South Beach).
- Projection: `x = (lon - lon0) * cos(lat0) * 111320` (east), `z = -(lat - lat0) * 110574`, so +X is east, -Z is north and +Z is south. Y is up, in metres.
  - Heading 0 faces +Z (south), matching the existing convention.
- Sea level is y = -0.12. The ocean plane covers the whole world; land and islands rise above it.

## NEW city API: both the old city and the Miami city must implement it
Remove every hard-coded geography assumption (x > 505 is ocean, x > 440 is beach, |x| < 150 is downtown, block grids). Use these calls instead.

```
city.bounds = { minX, maxX, minZ, maxZ }
city.seaLevel = -0.12
city.playerSpawn: Vector3, city.playerSpawnHeading
city.groundHeightAt(x, z)  -> walkable ground top, or seabed depth over water
city.isWater(x, z)         -> true where open water is the surface
city.surfaceAt(x, z)       -> 'asphalt'|'concrete'|'pavers'|'tile'|'sand'|'grass_short'|'grass_long'|'dirt'|'gravel'|'wood'|'metal'|'water'
city.zoneAt(x, z)          -> 'beach'|'nightlife'|'downtown'|'business'|'residential'|'commercial'|'park'|'port'|'causeway'|'industrial'|'water'
city.districtAt(x, z)      -> display name (real neighbourhoods are fine: 'South Beach', 'Brickell', 'Downtown', 'Port of Miami', 'Watson Island', ...)
city.streetNameAt(x, z)    -> nearest street name or null
city.roadGraph = {
  nodes: [{ id, x, z }],
  edges: [{ id, a, b, pts: [[x, z], ...], width, lanesFwd, lanesBack, oneway, speedKmh, name, kind, bridge: bool, y: [heights] }],
  nearestEdge(x, z) -> { edge, t, dist, point: {x, z}, dir: {x, z} },
  edgesAt(nodeId) -> edges
}
city.roads      // legacy [{x1, z1, x2, z2, width}] straight pieces (minimap fallback)
city.buildings  // legacy [{x, z, w, d, h}] (rough boxes)
city.mapLayers = { land, water, beach, park, buildingPolys, roadEdges }  // polygons as [[x, z], ...] for the HUD minimap and pause map
city.randomRoadPoint(near?, radius?)   -> { position, heading, edgeId, laneOffset }   // right-hand traffic lane centre
city.randomSidewalkPoint(near?, radius?, zone?) -> Vector3
city.shopLots / city.storefronts        // [{ x, z, y, w, d, facing, kind?, buildingId }]; facing = heading toward the street
city.benches, city.leanSpots            // [{ pos, heading }]
city.update(dt)                         // streaming; main calls it every frame via game.updaters (register it yourself)
```
`near`/`radius` let spawners pick points close to the player. That matters at real scale: never spawn things kilometres away.

## Streaming and performance budget
- Tile size about 200 m. Hysteresis: full detail within about 350 m of the camera, a low-LOD merged mesh from 350 to 1500 m, and a far silhouette layer beyond that.
- Rapier static colliders only exist for tiles within about 250 m of the player or any player-driven car. Add and remove them incrementally, a few per frame, so there are no hitches.
- Budget: under ~1,200 draw calls and ~4M visible triangles, and no frame spikes over 25 ms from streaming. Use InstancedMesh, merged geometry, texture atlases and KTX2/compressed textures if possible.
- Peds, traffic and pickups spawn near the player and despawn beyond about 300 m.

## Tracks and ownership
| Agent | Owns | Delivers |
|---|---|---|
| DATA (new) | `tools/osm/*`, `public/assets/miami/*`, `src/world/miami/data.js` | OSM fetch, projection, cleanup, tiles. `data.js` loader with spatial index and query functions. |
| CITY | `src/world/miami/*` (except data.js), `src/world/city.js`, `src/world/city/*` | Miami renderer, colliders, streaming, props and buildings. Adds the new API functions to the old city too (shims). |
| VEHICLES | `src/vehicles/*` | Many more models, higher detail, traffic AI on `roadGraph`, per-model physics. |
| AUDIO | `src/core/audio.js`, `public/assets/audio/*` | Real samples for everything, physical reverb, 3D audio, Doppler. |
| GAMEPLAY | `src/gameplay/*` | Realistic guns, per-limb hit detection, uses the new city API for all placement and police navigation. |
| CHARACTER | `src/player/*` (not `controller/`), `src/npc/*` | Diverse humans, realistic ragdolls, zone behaviours. |
| INTERIORS | `src/world/interiors.js`, `src/world/interiors/*` | Enterable storefronts streamed on demand, specific products. |
| GRAPHICS | `src/world/environment.js`, `src/world/env/*`, `src/render/*`, `src/fx/*` | Night lighting, shadow lift, global ocean, LOD-friendly post, performance. |
| UI | `src/ui/*` | Minimap and pause map for the real city: tiled rendering, street names, OSM attribution. |
| LEAD | `src/main.js`, `src/player/controller/*`, `src/core/input.js` | Map switch, integration, FPS overlay. |

## Map switch
- `main.js` loads the Miami city when `?map=miami` is in the URL, otherwise the old city.
- Once CITY reports Miami ready, the lead flips the default and `?map=old` becomes the fallback.
- Every module must work with both cities through the API above.
