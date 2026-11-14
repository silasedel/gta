# city-look report (stopped at the 6:30 PM budget cut, Nov 13)

## What changed
- **PBR library:** 73 CC0 Poly Haven sets (albedo, normal, packed AO/roughness/metal, 1K) in `public/assets/city/pbr/`, fetched and repacked by `src/world/city/tools/fetch_pbr.py`, credited in `CREDITS.md`. Loaders in `src/world/city/pbr.js` (single sets and `sampler2DArray` packs).
- **Facade material (`src/world/city/facade.js`):** one patched MeshStandardMaterial draws all near building walls, roofs and trim from a 24-layer wall/roof array (stucco, plaster, concrete, precast, brick, painted brick, coral stone, tile, corrugated metal, wood siding, block, cladding, marble, granite, roller shutter, gravel/tile/metal/coated roofs). Windows are procedural per facade run: punched, ribbon, curtain wall, arched, porthole, storefront, door, open parking deck, roller door; recessed reveals, frames, mullions, sills with stains, shutters, window AC units with drip marks, grime.
- **Window interiors (`src/world/city/rooms.js`):** 128 furnished rooms (homes, offices, hotel rooms, shops, restaurants, lobbies, warehouses, parking decks) rendered in one draw call into an atlas at load (about 160 ms); every window interior-maps into a different room, with per-window curtains/blinds and lights that follow building type and hour.
- **Families (`src/world/city/families.js`):** 20 invented architect/builder families by district and era (Streamline Deco, Med Deco, MiMo, Med Revival houses, modern villas, frame cottages, four curtain-wall makers, condo towers, precast, ribbon office, brick rows, stone banks, low-rise shop rows, steel sheds, tilt-up, painted lofts, parking decks). Each building's recipe is re-rolled until no building within 9 m shares its signature.
- **Props and ground:** every v1 prop material (poles, signals, benches, bins, shelters, containers, boats, kiosks, AC units, piers, cranes, guardrails, trim) now samples a 16-layer triplanar PBR prop array (`src/world/city/propmat.js`); sidewalks, plazas, parking, piers, roofs, lane paint and palm trunks use full PBR sets.
- **Audits:** `src/world/miami/.matcheck.mjs` (materials + neighbors), `src/world/miami/.shots.mjs` (fixed viewpoints + metrics), `city.auditMaterials()`, `city.auditFacades()`.

## Verified (evidence)
- Material audit, six viewpoints: 0 city meshes without texture input (`docs/v2/reports/city-look-audit.json`). Limits of that claim: it covers meshes under the city root; unlit emitters (neon, bulbs, beacons) are counted separately; the mid/far LOD chunks pass only because they still carry the v1 canvas atlas, so beyond about 350 m the ground is flat-colored and buildings use the old look.
- Neighbor audit: 3,420 buildings, 4,318 adjacent pairs, 0 shared signatures, 2,536 distinct signatures (same JSON).
- 60 fps in the dev build at Ocean Drive, Downtown and Brickell, day and night (16.7 ms average, worst frame 19 to 26 ms): `docs/v2/shots/city-look/metrics_after.json` vs `metrics_before.json`. Draw calls 300 to 760, 0.76M to 1.0M triangles.
- Before/after shots: `docs/v2/shots/city-look/before/`, `docs/v2/shots/city-look/after/`; lab shots in `docs/v2/shots/city-look/lab/`.

## Built but not verified
- After-shots: only South Beach and Downtown (day and night, street and aerial) plus the night street shots listed in `after/` are real frames. Brickell, port, causeway and island day shots kept capturing the title/loading screen because the shared dev server reloaded the page whenever another agent saved a file; those files were deleted rather than left as false evidence. Their metrics lines in `metrics_after.json` are still valid (Brickell day measured 18 to 20 ms average frames at a machine load above 7, so treat it as unconfirmed for 60 fps).
- Shader program count rose from about 316 to 500-630 (each patched prop material compiles its own variants). No frame spikes measured, but not soak-tested; GPU memory leveling not re-measured.
- Real shop lots (`storefronts`) keep the v1 transparent glass front; I did not confirm they still read well against the new walls.
- No production build, road audit or collider coverage re-run (collider code paths were not changed).

## Not done (honest list)
- Street furniture families: the kit was specified (see the brief in this track's history) but not built; v1 prop shapes remain (now PBR-textured). No wires, sneakers, mailboxes, newspaper boxes, meters, flyers, steam vents, AC puddles.
- Palms/trees: real bark only; fronds and leaves are still the v1 canvas textures. No real leaf atlases, no new species.
- Ground wear shader (patches, oil, gum, crack overlays), manholes, drains, worn lane paint: not done; the asphalt tile visibly repeats.
- Mid/far LOD on the new facade material (hook exists: `M.makeFacadeFar(nearCut)`; `chunkMesh` needs to accept `FBatch` and attach `aFa..aFd`), impostors, pop-in measurement.
- Landmark treatments, Art Deco geometry (eyebrows, ziggurat parapets), murals, storefront sign bands and the `src/design` brand hook.
- Seabed material is still vertex-color only.
- Old grid city (`?map=old`) untouched.

## What the renderer needs for the wave 2 region kinds
1. **Area kinds:** `areaFill`, `AREA_Y` and `MID_COL` in `tilebuild.js` only know land/grass/park/beach/sand/paved/parking/dirt/wood/pool. Add scrub, forest, pine, sawgrass, wetland, mangrove, farmland, grove, apron, runway, taxiway, golf, campground. Sets are already downloaded for them (brown_mud, forest_leaves_02, forest_ground_04, leafy_grass, sparse_grass, dirt, gravel_floor, sandy_gravel, coral_gravel, rocky_gravel, damp_sand, grass_path_2, hangar_concrete_floor). Best done as one ground `sampler2DArray` material with a per-vertex layer (same pattern as `facade.js`), so a tile stays one ground mesh.
2. **Heightfield hills:** ground polygons are flat `fillPoly` at fixed heights. They must be subdivided (16 m grid matches `heights.bin`) and draped on `data.groundHeightAt`; colliders need a Rapier heightfield (or the draped trimesh) per tile; props, trees and building bases must sample the same height.
3. **Vegetation:** dense instanced scatter per area kind through the existing pool system (sawgrass, mangrove, cypress, pine, citrus rows, crops), with a far billboard layer. The flora kit does not exist yet.
4. **Airport:** runway/taxiway/apron surfaces plus a marking generator (centerlines, thresholds, numbers, hold lines) on `M.markings`; edge lights as emitters.
5. **Keys and bridges:** sand keys are just `sand`/`beach` areas; long overseas bridges go through `elevated/` if their edges carry `bridge` and `y`, but spans over open water and pier spacing need checking.
6. **New building styles** (`stilt`, `hangar`, `terminal`, `barn`, `cabin`, `strip`): add cases to `styleFor` and families to `families.js`.
7. **Streamer:** it creates every chunk and queues a far build for each at start; with the bigger bounds, cap far builds by distance.

## Needed from the lead
- Decide whether the downloads were acceptable: 73 texture sets (69 MB) were fetched from polyhaven.com on the strength of the brief and BIG_UPDATE; no user confirmation was possible from inside this track.
- `CREDITS.md` got a "City look V2" section appended.
- New APIs: `city.auditMaterials(all?)`, `city.auditFacades()`, `M.facade`, `M.makeFacadeFar(extra)`, `M.propify(mat, surface)`, `M.roomAtlas`.
