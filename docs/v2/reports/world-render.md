# world-render report (Nov 13)

## What changed
- `src/world/terrain/terrain.js` (new): one ground material for all synthetic land. It uses a `sampler2DArray` of 16 Poly Haven sets that were already on disk (no new downloads), plus height-weighted barycentric blending between three cover layers per triangle, macro variation, standing water in marsh and sawgrass, and farm furrows. It builds a 4 m grid per near tile (skirts, shadows on relief tiles), 16 m mid and 32 m far chunk grids (near-cut), and the same vertices as a Rapier trimesh. It also creates the runway, taxiway and apron PBR materials. The Keys come from `data.places` (no hard-coded coordinates).
- `src/world/terrain/flora.js` (new): blade tufts (sawgrass, rush, palmetto, crop rows), leaf-card crowns on bark-PBR trunks for oak, gumbo, banyan, pine, cypress, citrus (+ fruit), mangrove (prop roots) and seagrape. It also scatters vegetation per tile from cover, zone and shore.
- `tilebuild.js`: natural synthetic areas are drawn by the terrain mesh, not flat buckets. On relief tiles, batches lift every vertex onto `terrainHeightAt` (buildings by a constant base, the same in colliders and mid LOD), terrain roads are densified to 4 m, and props are lifted. It adds airport marking generation from `mapLayers.cover`, layout tree species, tree trunk colliders, stilt piles, styles for stilt/cabin/strip/hangar/terminal/barn, and no lawn grass on aprons or runways. `city.js` wires it all (`city.terrain`, `city.flora`).

## Verified
- Sawpalm Ridge: 20 points, `groundHeightAt` vs Rapier ray vs rendered terrain, max 0.02 m; the player stands at 81.9 m. Shot: `sawpalm_ridge.png`.
- Airport: threshold bars, "9" designator, centerline, side stripes (`airport.png`). Citrus Flats: grove rows with fruit, crop rows (`citrus_flats.png`). Key Paloma: mangroves, palms, seagrape, beach (`key_paloma.png`).
- Bridges: the player stays at deck height on 4 Keys bridges (`bridges.png`).
- Frame times 16.5 to 25 ms at a load average above 8. That is not reliable.

## Not done / problems
- Everglades shot unusable (camera inside a tree-island canopy). Sawgrass only looks right in Key Paloma's background.
- Everything was checked on the OLD 12.4 x 14.4 km build. The new layout (20.8 x 30 km) is not re-verified.
- Far LOD risk: `stream.js` builds a far chunk for every chunk in the world. With about 1,000 chunks, the far terrain mesh per chunk can push draw calls past budget. Fix: merge far terrain into 4 x 4-chunk meshes or cap far builds by distance.
- Bridge barriers render nearly black (elevated.js, not owned). Leaf crowns use the v1 canvas leaf atlas (no real leaf scans); blades are vertex-colored geometry.
