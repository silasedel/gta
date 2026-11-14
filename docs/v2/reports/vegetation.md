# Vegetation track report

## What exists (`src/world/vegetation/`)
- `textures.js`: procedural bark atlas 2048x1024 (8 seamless columns; albedo, normal and roughness from one height field) and a 2048x2560 leaf atlas (20 cells: coconut, plumose and date leaflet strips, dead frond, fan leaf, dead fan, sea grape, hibiscus, croton, bougainvillea, ixora, hedge, grasses, pine, oak, Spanish moss, mangrove, litter, cypress, fern; fruit and petiole swatches).
- `materials.js`: one bark and one leaf material family (MeshStandardMaterial plus onBeforeCompile). Adds wind (aWind attribute: attachment height, flutter, phase), per-instance hash variation (lean, tint, yellowing and brown tips, bark stain), backlit translucency, LOD dither fade, mip-aware alpha and alpha-to-coverage.
- `palms.js` (coconut, royal, sabal, date, queen, palmetto), `shrubs.js` (sea grape, hibiscus, croton, bougainvillea, ixora, hedge, saw palmetto, fountain grass, sawgrass), `trees.js` (live oak, slash pine, bald cypress, red mangrove), `plantkit.js`, `geom.js`.
- `field.js`: instanced LOD fields. LOD0 full, LOD1 mid, LOD2 baked impostor (two crossed cards, rendered at startup from the LOD0 mesh). Overlapping distance bands with a screen-space dither cross-fade, so nothing pops. Default distances: palms 45/160/900 m, trees 55/190/1100 m, shrubs 28/90/260 m.
- `vegetation.v2.js`: `game.vegetation = { build(kind, opts), buildGeometry, kinds, types, palms, field(kind, items, opts), stats(), materials }`. It also drives the sun direction for leaf translucency and emits `vegetation:ready`.
- `preview.html`: `?kinds=..&seed=..&lod=..`, `?sheet=crown|trunk|whole`, `?field=coconut:500,...`.

## Triangles per plant (LOD0 / LOD1 / LOD2)
- Palms: coconut 3.7-4.9k / 0.53-0.73k / 4; royal 3.9-4.8k / 0.38-0.43k; sabal 5.3-6.2k / 1.3-1.6k; date 5.5-7.9k / 0.9-1.5k; queen 3.5-6.3k / 0.31-0.7k; palmetto 1.9-2.7k / 0.53k.
- Shrubs: 0.43-1.2k / 0.26-0.41k (saw palmetto 2-3k); grasses 88-136.
- Trees: live oak 9.8-15k / 3.3-5k; slash pine 2.6-3.2k / 0.9k; cypress 6.2-7.5k / 2.1k; mangrove 3.2k / 1.0k. Every LOD2 is 4 triangles.
- Field test: 1,380 plants of 7 kinds over 600 x 700 m drew in 92 calls and 102k triangles (`field_lod.png`). Each field costs at most variants x 5 draw calls.

## Integration (old call sites keep their signatures)
- `city/geo.js palmGeometry()` now builds real species. It picks among 12 street-palm variants by seed (coconut-heavy, plus royal, sabal, queen and date), royal for seeds 40-69 and palmetto for 70 and up, and folds the height into each species' range.
- `miami/tilebuild.js` now has 12 palm variants instead of 6, and street bushes and flower beds now use 7 + 4 real shrub variants on the shared materials. The old card bush remains as a fallback.
- `miami/materials.js`: M.trunk, M.frond and their depth materials now point at the vegetation materials, and the wind clock is shared. `city.js` (fallback city) uses the same materials. `miami/grass.js`: the lawn cards are smaller, so the blades look finer.

## Not done / caveats
- Keys bar full-game shot: at (22, 5288) the live world is open ocean. Key Paloma is not built yet.
- The hedge looks curtain-like up close and needs another pass. The royal crown is thinner than a real royal palm.
- tilebuild palm pools have no mid LOD or impostor (they still use draw-distance culling). Only `game.vegetation.field` has the 3-LOD path.
- Wind was checked in code only (all shots are static). The fps numbers were taken at load 11-14, so they are unreliable (Ocean Drive: 840 calls, 1.65M tris for the whole frame).

## Requests for the lead
1. The `terrain/flora.js` owner should switch oak, gumbo, cypress, pine and seagrape trees, palmetto and sawgrass to `game.vegetation.field()` or `buildGeometry()`. The Lummus Park shade trees are still the old flora blobs.
2. Set pieces (`keysBar.js palm()`, `nicoHouse/parts/50_plants.js`): use `game.vegetation.build('coconut', { seed })` and the other kinds.
3. Add the `vegetation:ready` event and `game.vegetation` to V2_PLAN shared APIs.

## Pass 2 (Nov 13 evening)
- Lawn rebuilt from scratch (`src/world/vegetation/lawn.js`; `miami/grass.js` now delegates). It draws GPU-instanced blades (5 triangles each) placed in the vertex shader from gl_InstanceID with world-stable hashes. Clumps, height, width, lean, hue and dryness vary per blade. There are 3 rings: 0-9 m, 9-20 m and 20-40 m (about 351k blade slots, at most 1.76M triangles), in 3 draw calls with no shadow pass. Blades only render where the field says grass.
- A 256x256 field over 128 m (rebuilt over several frames as the camera moves) stores height, dryness, weeds, bare/worn patches and mow-stripe parity. Short lawns regrow 1.1 cm per game day after mowing, up to 13 cm. Long grass is 22-52 cm with seed heads. The lawn ground material gets soil and thatch within 42 m, plus stripes, dryness and bare soil across the whole field.
- `game.grass`: heightAt(x, z), mow({x,z,r} | {x0,z0,x1,z1,heading}), lastMowed(x, z) in game days, mower { start(area), stop(), active }, days, stats(), refresh(). In daytime the mower looks for an overgrown lawn near the camera every 90 s.
- Wind: vegetation and grass copy game.wind (dir, speed, time) and evaluate the same travelling gust bands in the shader.
- flora.js: trees now use the vegetation tree variants (live oak, gumbo limbo, slash pine, cypress, mangrove, sea grape). Palmetto and sawgrass use the vegetation sawpalmetto/sawgrass. Citrus is unchanged.
- tilebuild: street palms have 3 LOD pools with min/max distance bands (pool minD added to cullPools) and dithered fades. The impostor is baked with game.renderer when it is available.
- Keys bar: keysBar.js already calls opts.vegetation.build('coconut_palm' | 'sea_grape' | 'croton' | 'hibiscus', {radius, height, lean:[dx,dz]}). game.vegetation.build now understands those aliases and options, so no keysBar edit was needed. Not checked in a shot (Key Paloma is not in the live world).
- Note for nico-house: the plants in `nicoHouse/parts/50_plants.js` can use `game.vegetation.build('coconut' | 'sabal' | 'seagrape' | 'hibiscus' | ..., { seed, height, lean })`. I did not touch that file.
- Not verified: palm LOD transitions in the city (no motion capture), trampling (no walking capture), and the long-grass verge (the search landed on a lawn polygon without blades). Leaves look pale in the miami preview lighting; I reduced roughness and env reflections, but this still needs a check in-game at several times of day.
