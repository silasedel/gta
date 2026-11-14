# city-look: downtown street pass 3 (Nov 14, 6:20 to 6:30 AM, load 3 to 4)

Same camera throughout: East Flagler St, car height, 1 PM.
- Before (Nov 13): `before58/dt_street_13.png`
- Pass 2: `after58/dt_street_13.png`
- Pass 3: `after59c/dt_street_13.png`

## Verified in screenshots
- **Pass 2:** striped awnings in muted liveries, granite planters with topiary and flowers, cornices and string courses, reflective blue-grey upper glass, lintels and keystones. Shaded sides read grey under the new lighting.
- **Pass 3:**
  - A rusticated stone base: banded courses, V-joints and staggered head joints on the ground floor of masonry-type walls (facade.js).
  - Deeper window reveals (0.26 m on punched and arched windows) that now hold out to street distance instead of fading at about 5 m.
  - Street-facing shop bays get a pane of the towns track's interior-room glass (`createHouseKit().mat.shopGlass()`, our own instance). Each pane is a box room with walls, floor and ceiling, kinds 1 to 5, and is warm at night through the kit's `uNight`, which materials.js now drives.
  - Shader-drawn shop windows lost their pastel tint.
- Console is clean (only the favicon 404).

## Cost
- **Draw calls:** 502 to 509, unchanged.
- **Frame time:** 16.7 ms (60 fps) before the room glass, 23 to 28 ms after (36 to 43 fps), at load 4. The house room shader over about 10% of the screen costs roughly 6 ms. `?noshoprooms` turns it off. The lead should decide whether to keep it on.

## Honest score against ref_58 / ref_59
About 4.5/10, up from 3.5.
- The shop rooms read as empty, evenly lit boxes; the furniture in the house shader barely shows at 4 m pane width.
- Still no lit-interior richness, deep arched stone surrounds or real geometric rustication.
- The tile-textured blue building on the right still looks generated.
- Sidewalk pavers and granite curbs: not done. They are ground-track code (road and sidewalk functions in tilebuild.js), which I was told not to touch. The current sidewalk is a plain concrete-paver PBR set with a curb.

---

# city-look: near buildings vs ref_58 / ref_59 (Nov 13, 10:38 PM to 11:55 PM)

## Changes
- **Glass (facade.js):** curtain walls and punched windows are now tinted reflective glass: sky-mirror metalness 0.68 to 0.72 on a gTint x 0.4 albedo, where it used to be near-black albedo with weak reflection. Rooms behind daylight glass are desaturated and dimmed (day interior 0.2, was 0.6). Curtains use linen, cream and grey; the random rainbow palette is gone. Spandrels are dark glass or metal, not accent paint, which removes the blue bands on towers. Deco stripes and belt courses blend toward the wall color.
- **Window dressing (shader):** stone lintels over punched windows. Arched windows get a voussoir ring and a keystone.
- **Geometry (tilebuild.js, building code only):** `corniceBands` adds a projecting stone cornice at the roof line, with a second tier on stone-bank, brick-row and precast families, and a string course over the ground floor. Near and mid LOD only; far skips it. `shopFrontDress` adds a striped canvas awning in one of 7 muted liveries, side cheeks, and granite planters with clipped topiary and flowers. It runs on mapped shop lots and, through `streetShopDress`, on street-facing shop bays drawn by the shader. Shop interiors are warm, not candy-colored.
- **Incident (mine):** the new helper was first named `shopDress`, which collided with the existing `shopDress(tile, props)`. The city failed to load and errors looped for about 15 minutes, around 10:53 to 11:08 PM. It is renamed to `shopFrontDress`. The 11:30 PM downtown run had a clean console (the only entry was the favicon 404).

## Evidence (same camera: East Flagler St, car height, 1 PM)
- Before: `docs/v2/shots/city-look/before58/dt_street_13.png`. After pass 1: `docs/v2/shots/city-look/after58/dt_street_13.png`, 446 calls and 3.22M tris, load 70.
- Pass 1 (glass, lintels, keystones, muted bands) is seen. The upper-floor pink and purple panes are gone and the glass reads dark blue-grey. The arched windows have a voussoir ring and keystone.
- Pass 2 is built but not seen. It holds the warm shop interiors and the awnings and planters on street bays; this street has no mapped shop lots, so the pass-1 shot shows none. Three runs were killed by the watchdog at load 64 to 79.

## Honest score against ref_58 / ref_59 (0 to 10)
Pass 1 is about 3.5 out of 10, up from about 2.
- Still missing: the rusticated limestone base, deep window reveals at street distance, lit interiors at the right exposure, and the overall lighting and grading, which belong to the render track.
- Shop windows still read pastel in the pass-1 shot; pass 2 targets that.
- Sidewalk pavers, granite curbs, bins and the yellow patches belong to the ground agent.

---

# city-look report: skyline pass (Nov 13, 7:03 to 8:05 PM)

## What changed
- **One builder for every distance.** Mid (to 1.5 km) and far (whole map) chunks no longer draw buildings as tinted boxes with the v1 office atlas. `buildMid`/`buildFar` now call the near `buildBuilding` for every building (far skips buildings under 12 m and 1,500 m2), writing into one `FBatch` per chunk drawn with `M.facadeFar`. That is the near facade material plus the near-tile cut (`city.js`). Same family recipe, tint, wall set, window type, glass, roof layer and crown as the near build, so nothing pops at the LOD switch. `chunkMesh` copies the facade attributes in slices. Draw calls per chunk are unchanged (the glass batch is now empty and skipped).
- **Tower silhouettes (`towerShape`/`buildTower`, shared by near and LOD).** Corners are sharp, chamfered or rounded (rounded corners read as one curved run). Towers get 0 to 2 setbacks with terrace railings. Crowns: plant-room screen with penthouse, a stepped lit glass crown with light bands, a penthouse with a spire, an angled metal roof, or a parapet roof with a helipad or plant room plus an antenna lattice. About 8% of towers over 120 m are topping out, with bare slabs, a column frame and a lattice tower crane. Balconies wrap all faces on slender residential towers. Everything is keyed to the building id.
- **Landmarks:** towers of 140 m or more on one footprint get one of 8 invented designs, chosen by building id: Halcyon Crown, Marisol Residences, Coralline Tower, Bayline One, Solana Center (topping out), Stanton Plaza, Tidewater Point, Las Brisas Condominium. They are data-driven (`LANDMARKS` in tilebuild.js), not placed by coordinates.
- **Palette:** family tints keep their hue but lose 40 to 60% of their saturation. Condo towers use warm whites and beiges, and glass tints are muted. 40% of tall buildings are glass, down from 60%.
- **Night at distance (facade.js):** windows smaller than a pixel light in random power-of-two clusters, with extra glow, instead of averaging to a flat dim tone.
- **Port:** container colors come from 12 weathered liveries (Nordhaven Line navy from `src/design`), with one dominant line and one stack height per block row and a per-box fade. Mid-LOD stacks use corrugated metal; they had been showing the office window atlas. Gantry cranes get X-bracing, sill beams, boom ties and muted paint.
- **Ocean Drive beige dots:** these were the string-light bulbs (`palmDress`), hanging with no cable and tinted beige by day. Cables are now drawn, and bulbs are dull glass by day.
- **Blank ground floors:** the ground floor around shop fronts used a plain wall layer on every side. It now carries the building's own window grid on every side, with the shop openings cut out.

## Verified (shots in docs/v2/shots/city-look/)
- Noon skyline from an elevated vantage across the bay, with port and causeway: `close_before_13.png` vs `close_a3_13.png` (same camera). Far view at about 4 km: `bay_a4_13.png`.
- Sunset glints: `close_a5_18h9.png`. Port: the container yard at left in `close_before_13.png` vs `close_a3_13.png`, plus `port_a2_13.png` (my port 'before' frame caught the title card and was deleted). Night street canyon downtown: `canyon_a8_21h5.png` (lit windows in random patterns, tower crowns). Night skyline: `close_a7_21h5.png` (lit clusters on the distant towers; the glow was raised after this frame).
- Numbers (same camera, game stats, 120 frames): before 565 calls, 2.84M tris, 16.8 ms. After: 590 to 609 calls, 3.07 to 3.11M tris, 16.66 ms. Port view: 428 calls, 3.06M tris. Load was 7 to 9 for these runs and later reached 64, so frame times are vsync-capped and unreliable.

## Honest comparison with the reference (ref38 top half)
Better: distinct tower shapes, window and floor grids, setbacks, crowns, spires and cranes, a muted mix of glass and concrete, a port that no longer looks like confetti. Still short of it: the haze and sky are cooler than the reference's warm noon. The foreground (parking lots, flat roofs, uniform palms) still looks generated. There is no Ferris wheel, arena or twin pair. Mid-distance low-rise is still simple boxes with textured walls. The reference's warm sunlit beige towers come out greyer here.

## Built, not looked at
- The final glow strength for the night skyline (raised after `close_a7_21h5.png`).
- Landmark designs, helipads and antenna masts close up. Crane bracing. String-light cables. Storefront ground-floor windows. A noon street canyon shot.

## Not done
- Container logos (needs more invented shipping lines from DESIGN-SYSTEM), reefer stacks, light masts, warehouse roller-door detail beyond what the family recipes give.
- Ferris wheel, arena and twin towers.
- Filling empty lots and plazas with landscaping, parking or courtyards (user playtest note 1). Only the blank ground floors are fixed.
- Pushing facade detail toward the house bar (note 3): trim geometry, cornices and pipes.

## Shadow flicker (playtest note 2): not my file
`src/render/stage/environment.js:203-224` already snaps the shadow frustum in light space. Two things still move it every frame. The sun direction is re-aimed every frame as the time of day advances, which rotates the shadow map, and `normalBias`/`bias` are recomputed from sun elevation every frame. Suggestion for the render owner: step the sun direction in discrete increments (for example every 0.05 degrees or every few seconds), and change biases only on those steps.

## Tools
`src/world/miami/.skyline.mjs` takes fixed bay, close, port and canyon cameras and prints calls, triangles and frame times.

---

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
