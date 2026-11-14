# world-dressing report (Nov 13, evening; cut short by the usage budget)

## Audit (`src/world/dressing/tools/audit_empty.mjs`)
Loads the live build (`b20261113-195853`) with the game's own `data.js` (files read from `public/` on disk), rasterizes all
13,837 tiles at 20 m and flags land cells with no building, no road, no mapped tree / prop / path and a flat ground kind.
Output: `docs/v2/reports/world-dressing-empty.json` (ranked top 60, per-cause totals), heatmaps
`docs/v2/shots/world-dressing/heatmap.png` (whole world), `heatmap_real.png` (real-Miami rectangle), `heatmap_spawn.png`
(2.4 km around Nico's house). Colors: blue water, dark roads, brown buildings, green dressed, red flat empty, orange bare lawn.
`probe.mjs x z r` prints what the data holds around a point.

Numbers (before): 447 km2 of land; 207 km2 flagged flat-empty, 9.0 km2 of it inside the real-Miami rectangle; 12 km2 bare lawn.
Caveat: outside real Miami, "plain land" is drawn by the terrain mesh (meadow / scrub / lawn textures, with flora scatter in
rural and wilderness zones), so most of the 196 km2 there is textured, not gray. It is bare only where the terrain picks
`lawn` (synthetic towns, airport infield): flora.js skips lawn outside the Keys.

## Causes found
1. **The gray ground is city-look's `M.land`** (`src/world/miami/materials.js:47`, `land: pbr(conc, ...)`): every real-Miami
   `land` polygon (the whole landmass under the blocks) is drawn with the concrete set, so any open land reads as a parking lot.
   Pass 7 of world-osm added 7.98 km2 of picture land inside the rectangle with no land use at all (the red islands and the
   bay-side strip of Miami Beach in `heatmap_real.png`), which made it much worse.
   **Fixed at runtime** from `dressing.v2.js`: the material is found by its unique polygon offset and re-skinned as a world-space
   blend of leafy grass, sparse grass and dirt (Poly Haven sets already on disk) with dry patches. Permanent fix for city-look:
   make `M.land` that blend in `materials.js` (the shader is in `patchLand()` in `dressing.v2.js`, copy it as is).
2. **The global land base** (`buildLandBase` in `tilebuild.js`, color `0x7e7c76`) is what you see while tiles stream in and at
   mid range (mid chunks skip `land`). Recolored at runtime to a muted green-brown. Permanent fix: change the color in
   `tilebuild.js:1962`.
3. **The p4_front_dry frame was taken 3.5 s after `game.teleport(3528, -150)`**: no near/mid tile had streamed yet, so the
   whole frame was the land base (the spot is real sand on Lummus beach with 12 buildings and 25 trees within 150 m).
   Lead / city-look: `game.teleport` should hold a fade until `game.city.streamer.readyAround(x, z, 220)` (or raise
   `focus.budgetMs` for a second), and test scripts should wait on that instead of fixed sleeps.
4. Synthetic towns: `flora.js` scatter skips `lawn` outside the Keys (line 132). Not changed (world-render owns it).

## What was built (`src/world/dressing/`)
- `dressing.v2.js` (order 70; `?nodress` turns it off for before shots). `game.dressing.stats()`.
  - Land re-skin and land-base recolor (causes 1 and 2 above).
  - Real-Miami plain land planting: sampled once at load (7 m grid, about 0.1 to 0.25 s) where cover is `none`, the surface is
    concrete / grass / dirt / gravel, and nothing within 5 m is a building, road, sidewalk, pier, sand or water. Clustered by
    noise into groves plus a thin sprinkle: 17,851 plants (coconut, sabal, sea grape, hibiscus, croton, live oak) through
    `game.vegetation.field` (3 LODs with impostors), one field per species shared with the spawn street.
  - Spawn street at Nico's house: walks the Overseas Highway 450 m each way from the house and fills lots on both sides that
    are fully on land, clear of the house, the welcome sign and other roads. In game: 22 lots, 1 bait shop, 11 power poles,
    106 mangroves, 6 parked cars spawned. Each lot has a unique procedural Keys house (stilt or ground floor, siding color,
    shutters, porch, stairs, metal roof), a crushed-shell driveway, a mailbox, bins, a service drop from the nearest pole, and
    by seed a boat on a trailer, side fences (chain-link or weathered picket), crab traps, kayak, propane tank, picnic table,
    buoys, coral-rock edging, palms and shrubs. The bait shop has a painted sign ("LIVE BAIT · ICE · TACKLE"), a roadside
    "BAIT / OPEN 5 AM" board, ice chest, bait tank, dumpster and two parking spots. Parked cars are real traffic models through
    `game.vehicles.spawn(type, pos, heading, { snap: false })`.
  - Cost: all static spawn-street parts are one merged mesh (86.7k triangles, 1 draw call plus shadow) on city-look's shared
    triplanar PBR prop material (`propmat.js`); 62 static colliders; plants go through the vegetation fields.
- `kit.js`: the props and houses (all `mergeProp` parts with real PBR layers, per-part tints and per-seed wear). Also has a
  wheel stop, double-head lot light pole, pay station, dumpster and utility pole for the parking-lot pass that was not done.
- `tools/audit_empty.mjs`, `tools/probe.mjs`.

## Seen working in game (`docs/v2/shots/world-dressing/`)
- Spawn overview at 9 AM, same camera: `before_spawn_overview_9am.png` (empty brown land, Nico's lot alone by the highway) vs
  `after_spawn_overview_9am.png` (neighbor houses, driveways, parked cars, palms, power poles along the highway).
- Spawn player camera at 9 AM: `before_/after_spawn_player_9am.png`. The default camera faces Nico's house, so the street is
  mostly out of frame; only the service drop wire and a palm differ. A street-facing player shot was not taken.
- p4 spot (3528, -150) at 11 AM, waited for tiles: `before_/after_p4_spot.png`. With tiles loaded it is Lummus Park lawn with
  the Ocean Drive buildings behind it; the gray frame in the user's screenshot was the land base before streaming (cause 3).
- Flagged areas (after): `after_area_sobe_west.png` (picture-added land west of South Beach: re-skinned grass/dirt instead of
  concrete, sparse planting), `after_area_causeway.png` (a dense palm grove on the MacArthur Causeway fill; it reads as a
  plantation, too regular and too dense), `after_area_bayshore.png` (not looked at). No valid before frames for these: the before run was hit by a dev-server reload (it captured the loading screen) and the frames were deleted.
- `game.v2.failed` contained no dressing errors in these runs.

## Built, not checked
- Night: lot light lenses use the prop emissive, not looked at. The re-skinned land at mid range and from the air.
- Colliders (houses, poles, trailers): created, not walked into. Whether the vehicle manager later moves the 6 parked cars.
- Frame times: not measured (machine load 15 to 26 the whole time). Load-time cost: `msInit` 240 to 635 ms.

## Not done
- Real parking lots (stalls, wheel stops, islands, poles, pay stations, signs, lot cars), general street dressing outside the
  spawn street, beach gear, marinas, Keys dressing outside Key Paloma's upper end, far LOD for the spawn street (one mesh, it
  is always drawn), per-region time-sliced streaming (the spawn street and planting are built once at load).
- Synthetic towns (bare `lawn` terrain) are untouched.
- The coordinator's later requests: the ref_51 causeway quality bar (balustrades, bike lanes and delineators, lamp posts,
  pylons, signs, yellow curbs) and the tag-based benchmark scenes from `docs/v2/VFX_NOTES.md` item 11 (promenade, bar street,
  port district, waterfront villas). Not started.
- Planting density on the causeway fill needs tuning down and more species mixing.

## For the lead
- `src/world/miami/materials.js:47` and `tilebuild.js:1962` (city-look): make the runtime fixes permanent (see causes).
- `game.teleport`: wait or fade until the streamer is ready around the target.
- `flora.js:132` (world-render): scatter on `lawn` in synthetic towns too.
- New API: `game.dressing` (`stats()`, `spawnArea`, `landPatched`).
