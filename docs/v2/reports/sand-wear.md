# sand-wear: fine sand, footprints, bar wear pass

## Files
- `src/world/ground/sandMaterial.js`: `makeSandMaterial(THREE, opts)` and `sandAtlas()`. World-space, needs no UVs.
- `src/world/ground/sand.v2.js` (order 60): `game.sand = { makeMaterial(opts), addArea(a), query(x, z), isSand(x, z), areas }`.
- `src/fx/footprints.v2.js` (order 110): `createFootprints(THREE, opts)` and `game.footprints` (`add`, `stats()`).
- Bar wear in `src/world/setpieces/keysBar/keysBar.js` and `art.js`; `keysBar.v2.js` registers the lot with `game.sand.addArea` and passes `game.vegetation`.

## Sand material
Real `coast_sand_01` albedo and normal sampled at two scales and rotations and mixed by noise (no visible tiling), normalized so
`tint` sets the color. Adds grain sparkle and micro normal (fades with distance), wind ripples in patches, damp patches (darker,
smoother), and per-cell stamps from a code-drawn 16-sprite atlas: scallop, cockle, coquina, whelk, mussel, shell hash, pebble, coral
chunk, seaweed, two bottle caps, twig and butt, plus large faint marks (old footprints, drag marks, bird tracks, scuffs).
Options: `tint, tile, shells, litter, damp, ripples, marks, bump, vertexColors`. Tire tracks on the bar lot stay a separate overlay.

### Where to wire it for beaches (lead)
- `src/world/terrain/terrain.js` line 16 (layer table: `sand` = coast_sand_01, line 23 `damp`, line 24 `base`; `shell` is chosen at line 118).
- `src/world/miami/materials.js` line 44 (`M.sand = pbr(sand, ...)`), line 67 (its color boost) and line 200 (`M.dune`).
Replace with `game.sand.makeMaterial({ tint, shells: 0.6, litter: 0.15, damp: 0.4, ripples: 0.6, vertexColors: true })`, or import
`makeSandMaterial` directly where `game` is not available. Wet shoreline: raise `damp`. Not wired by me (not my files).

## Footprints
Instanced decals (one draw call, 640 prints, 210 s life). A shoe height map (sole, heel and ball deeper, arch shallower, tread bars,
pushed-up rim, toe-off mound) is lit against `game.env.sunDir` and blended 2x-multiply, so it reads as relief on any sand color.
Player: one print per `footstep` event (real foot plants), alternating feet, yaw from travel, deeper when `run`; `game.fx.dust` puff.
Peds: one print per stride for peds within 45 m. Sand = `game.sand.query` (registered lots, with their own height and an exclusion
box for the porch) or surface `sand|dune|beach|damp|shell`. Everything is guarded.

## Seen
`docs/v2/shots/sand-wear/`: `hero_before.png` / `hero_after.png` (same camera), `table.png`, `flag.png`, `prints_preview.png`,
`sand_closeup.png`, `game_walk.png` (Mid-Beach, 7 prints in 10.7 m), `game_lot_test.png` (temporary registered lot on grass: 8 prints
in 12.2 m at lot height + 1.4 cm). Preview: 106k triangles, 54 meshes.

## Not done / not verified
- **No walk across the real bar lot in game.** After the re-trace, `setpieces.keys_bar` (-2996.6, 10449.8) is open water in the
  loaded world (ground -5.1 m, no road within 200 m), so the bar is correctly not placed; it appears once the new tiles exist.
- Ped prints: no walking ped was on sand near the test spot, so not seen.
- Player prints are about 1.5 m apart at the default jog (that is how often `footstep` fires). No in-game close-up (no free camera).
- Porch scuff overlay and the vegetation hook not inspected (no `game.vegetation` yet; kind names `coconut_palm`, `croton`,
  `hibiscus`, `sea_grape` are my guess at its API).
- Sand has no parallax or real displacement; stamps are flat with baked soft shadows.
- Seen during tests, not mine: `src/npc/people.v2.js` failed to import once (`src/npc/look.js` returned 500).
