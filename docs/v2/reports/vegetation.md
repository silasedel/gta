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
