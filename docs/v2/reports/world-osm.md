# world-osm report (Nov 13)

Scope after the lead's changes: the real rectangle stays the V1 one; the job is the merge of real Miami (OSM) with the
synthetic world (`tools/world/out/features.json` + `heights.bin`) into one data set, with region bundles and an atomic swap.

## One command
`tools/osm/.venv/bin/python tools/osm/merge.py` builds, audits and (only if every check passes) publishes. World bounds are
read from features.json. Re-run it when world-layout rewrites the file. Details: `tools/osm/README.md` (top).

## What is live
- `public/assets/miami/world.json` → build folder `b<date>-<time>/` (manifest, roadgraph, peds, spots, map, names, places,
  transit, grid.bin, `regions/*.json`). The V1 root files (`manifest.json`, `tiles/`, `tiles.bundle.json`, `grid.bin`, `map.json`,
  `names.json`, `peds.json`, `roadgraph.json`) were deleted; `spots.json` at the root is a compatibility copy for
  `src/world/interiors/legacy/preview.html`.
- `src/world/miami/data.js` (new loader) and `dataProvider.js` (`waitTile` for lazy regions). `devProvider.js` untouched.

## Verified (evidence)
- Merge of the revised world-layout file (longer Keys, world 12.4 × 14.4 km, build `b20261113-175503`): 69.6 km² land, 12,595 buildings, 747 km of road in ONE network (Fisher Island,
  ferry-only in reality, is the single separate piece), all 135 OSM road ends on the rectangle edge joined by synthetic roads
  (0 dead ends), 4,041 storefronts each with a type, a facing and a street (2,909 typed from OSM or the layout), tile coverage
  with no holes, terrain to 92.9 m with roads following it, no road steeper than 11.5 %.
  `docs/v2/reports/world-osm-audit.json` (ALL CHECKS PASSED), `docs/v2/shots/world-osm/world_preview.png`.
- Real Miami alone, same pipeline: `docs/v2/reports/world-osm-audit-real.json`, `docs/v2/shots/world-osm/real_only_preview.png`,
  `real_downtown_detail.png`.
- Ingest tested on my own fixture before the real file existed: `docs/v2/shots/world-osm/fixture_merge_preview.png`.
- Game boots on the merged data and renders the synthetic regions through the existing renderer:
  `docs/v2/shots/world-osm/game_port_cassia.png` (Port Cassia; data load 113 ms in the browser, 59 regions streamed, 0 failed),
  `game_airport.png` (airport infield and runway, real skyline behind). Both were taken on the build before the Keys revision.
- Game boots on the FINAL build `b20261113-175503` (revised Keys): `docs/v2/shots/world-osm/game_key_paloma.png`
  (Key Paloma, Sienna Drive; data load 90 ms, 0 failed regions, no failed V2 modules).

## Numbers (Node, same loader; load average about 5)
| | V1 data | merged world |
|---|---|---|
| World | 8.2 × 5.3 km | 12.4 × 14.4 km (numbers below from the 12.4 × 12.6 km build) |
| Fetched at boot | 9.8 MB (everything) | 8.0 MB (globals + boot regions); tiles are 6.7 MB in 200 region files, on demand |
| `loadMiamiData` | 110 ms | 247 ms (113 ms in the browser run) |
| Grid memory | 21.7 MB dense | 7.2 MB (surface 3.0 MB as run tables) |
| Region file | n/a | median parse 0.08 ms, max 1.5 ms (3 ms in the browser), largest 190 KB |
| Queries | | isWater 29 ns, groundHeightAt 163 ns, nearestEdge 1.4 µs |

## How the merge works (short)
- Real land ∪ synthetic land (clipped out of the rectangle) − synthetic inland water; one 2 m surface raster, 4 m land cover,
  8 m zone / district / water kind / depth, 16 m terrain.
- Roads: synthetic road ends are snapped onto the clipped OSM ends (exact crossings in `tools/osm/cache/edge_summary.json`);
  real roads up to 800 m outside the rectangle are kept where they tie a clipped street back to the network; scraps under 600 m
  are dropped; real viaduct heights at the edge are carried into the synthetic roads at 6.5 %; steps in authored deck profiles
  become 8 % ramps (14 edges in the current file).
- Town zones come from the zone each synthetic building was authored with (spread 30 m), so towns get sidewalks and pedestrians.
- Places on water name the water around them; places on land name districts.

## Built but not verified
- Hills in game: the data is there (`terrainHeightAt`, `edge.terrain`, `tile.relief`, road `terrainY`) but the renderer still draws
  flat ground; city-look has to drape ground and roads (README "New in V2").
- New land cover classes render through the old buckets (sawgrass as grass, runway as asphalt lot); they need their own look.
- Turn restrictions, signals/stop signs, bus routes and people-mover data pass the audit but no game system uses them yet.
- **Park hills are inconsistent in game until the renderer builds terrain:** `groundHeightAt` returns up to 93 m there while the
  drawn ground and its colliders are flat at 0, so anything placed with `groundHeightAt` in Sawpalm Ridge floats and falls.
- The in-game shot of Sawpalm Ridge (`game_sawpalm_ridge.png`) was taken but not reviewed.
- Rollback, if ever needed: copy `public/assets/miami/b20261113-174840/manifest.json` over `world.json` (previous build, shorter Keys).

## Not done
- No bigger real Miami (dropped by the lead). No procedural infill of blocks where OSM has no buildings.
- Player spawn is still Ocean Drive (`manifest.playerSpawn`); Nico's house is in `data.setpieces` (`nico_house`, x 205, z 4543).
- The Fisher Island road network is not reachable by road (true to life); a ferry would connect it.

## Needs from the lead / other tracks
- **Re-run `merge.py`** when world-layout delivers the revised Keys (bounds to z ≈ 8300 are picked up automatically).
- **nav-gps:** `src/nav/controls.js` walks every tile with `loadTile`; that now pulls every region. Use `data.controls`,
  `node.signal` / `node.control`, `edge.controlA/B`, `roadGraph.turnAllowed` instead.
- **city-look:** `port.js` still works (port regions load at boot). Never treat `getTile() === undefined` as empty; use `waitTile`.
- **lead:** decide the spawn (Nico's house) in `main.js`; list the new `data.*` APIs in V2_PLAN (README has them).
- world-layout: `features.json` has top-level `powerlines` (not in FORMAT.md); passed through as `data.layoutExtras.powerlines`.
  Two interchange failures logged by their generator ("no crossing" for two diamonds) are theirs.
