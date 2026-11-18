# Overnight status (each helper edits only its own section)

## lead
- 03:50 Reviewed: Nico = user's model (matches Preview), weapons (cop aim pose sent back), props (variation/physics done), ground (potholes 3D, shoulders, water, grass mask), vegetation far squares fixed. Usage 27 % weekly: added helpers look (lighting/sky/post), surfaces (asphalt/markings/sidewalks), shops (storefronts + street-visible interiors). Git: pathspec-only commit rule after stale-index reverts; street props verified intact.
- 02:40 Lead review of keys k7 sheets: yard too orange/flat vs pale shell mock-up, dock lying on sand + white beam on the beach, hard water edge, uniform teal water, sparse mid-layer greenery, DARK SQUARE CARDS on far shores in the aerial (vegetation/buildings asked to find). Sent to keys, ground, vegetation, buildings. People: stale Ocean Drive spot + arrest overlay in shots, sent back. Perf: interiors cull, background precompile (25 m no-holdback), console checks.
- 00:35 user update relayed to all helpers (looks first, ground+greenery everywhere, accurate physics/hitboxes); new helper "player": user main-character model, movement, hit zones, ragdoll fit.
- 00:05 test pages confirmed: no reload while helpers save files; frame rate at the house spot 60 fps. Found the house test spot pointing at old coordinates (open water): sent to keys.
- 23:55 team launched


## look
**Morning summary (look):** (1) The new lighting and post look "look3" is ON by default. It brings soft PCSS sun shadows, a deeper sun-to-shade ratio, the PBR Neutral tone map with a calmer grade (sat 0.93), partial auto exposure (dusk and night readable, noon open-up capped at about 0.4 stop), a contact-AO ring, an env map with a lit floor, a Florida sky by sun elevation (gold low sun, no lavender dusk) and wet-street sky reflections. Rollback: `?look3=0`.
(2) Final sheets, left = old, right = look3 (JPG q90): `docs/v2/shots/look/sheet_final_nico_deck.jpg` and `docs/v2/shots/look/sheet_final_downtown.jpg` (11:00, 18:30, 22:00, after rain 11:00), plus `sheet_r3_beach.jpg`. The downtown noon/wet "new" frames were shot before the 06:08 noon auto-exposure cap, so they show +0.9 stop; the game now lifts at most about 0.4.
(3) Cost: about +1.7 ms GPU at the spawn (in-session A/B, inside the noise at load 200+). 0 shader errors on both paths. Still-camera frame difference is lower than before (Nico deck noon: mean 9.9 -> 4.8, p99 85 -> 43; what remains is wind). Left for later: warm window-light spill on the ground at night, cloud shadows on the ground, a GPU histogram auto exposure, and wet asphalt material response (surfaces helper, commit about 06:15).

- 06:00 Lead review fixed: sky ramps (noon deep blue + white clouds with gray bases; low sun gold-orange near the sun, pale yellow, blue overhead, gold-lit clouds with gray-blue shade, pink only right at sunset; bluer moonlit night), the green sunset white-balance shift mostly off with look3, wet SSR sheen 0.22 -> 0.42 and puddles 0.95 with sky reflection where rays miss (surfaces helper does the wet asphalt material: 0.5-0.6x albedo, roughness 0.35 / wheel paths 0.11 / puddles 0.04). Sheets are now JPG q90.
- 05:15 **look3 is ON by default** (lead OK; rollback `?look3=0` installs none of it). Before/after sheets (left old, right look3): `docs/v2/shots/look/sheet_r3_nico_deck.png` (11:00, 18:30, 22:00, after rain 11:00 and 18:30), `sheet_r3_beach.png` (11, 18:30, 22, after rain), `sheet_r3_downtown.png` (11 old was still streaming, 18:30, 22). Frame A/B per part at spawn, same session, after the tap trim: all of look3 39.8 -> 41.5 ms GPU (+1.7 ms); soft shadows, AO ring and auto exposure each inside the noise (machine load 200+, medians 60-85 ms either way). Console: 0 shader errors with and without `?look3`; a re-check of the new default is running.
- 04:55 Console clean on both paths (default and `?look3`: 0 shader errors). Before/after sheet, Nico's deck, rows 11:00 / 18:30 / 22:00 / after rain 11:00 / after rain 18:30, left = old, right = look3: `docs/v2/shots/look/sheet_r3_nico_deck.png`. First frame A/B (s1-perf, same session, spawn): 59.2 -> 67.9 ms median (GPU 34.7 -> 42.7 ms; the machine is very loaded, p95 noisy). I cut the soft-shadow taps (search 8 -> 6, filter 12 -> 10, umbra early-out) and am re-measuring per part (soft shadows / AO ring / auto exposure) before switching it on by default. Beach + downtown sheets running.
- 04:35 **look3 is opt-in (`?look3`) after the lead's report**: the fog chunk read `uLookV` in materials that never got its declaration (shader error on other helpers' pages). Fixed (`#ifdef PS_LOOKU`), and no look3 shader patch is installed without `?look3`, so the default path is the old, stable one. A console check (both paths: shader errors, max frame) is queued. Default-on only after a clean console + frame-time A/B.
- 04:25 Round 2 A/B at Nico's (in-session, `game.look3` false/true): `docs/v2/shots/look/r2_nico_deck_11_old.png` vs `r2_nico_deck_11_neu.png`; dusk `r2_nico_deck_18h5_*`, night `r2_nico_deck_22_*`. look3 = soft PCSS shadows, shade/sun ratio about 2x deeper (sand in the pickup's shade 73 -> 40 at the same sunlit level), PBR Neutral tone map (deep skies, no neon reds from ACES), sat 0.93, auto exposure (night opens up about +1 stop, not pitch black). Parked cars had no sun shadow: the cars helper fixed the shadow tagging.
- 04:10 Started (lighting, sky, post). Pass 1 in code behind a runtime switch `game.look3` (true by default, `?look3off`, A/B in one session without reload): soft sun shadows (PCSS-style blocker search + rotated disk, TAA-resolved, `src/render/look3.js`), contact AO kernel now rotates per frame (was a fixed dot pattern) + a wider 3 m ground-contact ring, tone map switch (`game.lookTM` aces/agx/neutral). Shot tool `tools/v2/look/look-shots.mjs` (fixed cameras, A/B variants). First A/B run queued for a browser slot.

## keys
**Morning summary (keys):** Nico's yard, street corner, dock and neighbors are now hand-built to the front-deck mock-up: pale shell yard with matted grass, puddles and debris, lattice planter, curb bins, all-way STOP, red roll-off, the gray striped pickup + rusty classic (cars helper), the white cottage with board fence across the street, 12 hand-placed cottages, the dock at the waterline on a seawall with riprap, and 5 bay docks from the user's models (`docs/v2/shots/keys/cmp_k21_r0b_deck.png`, `k20_lane_dusk.png`).
The house flicker was the peeling-paint shader's sub-pixel flake edge (fixed in the shared kit, so generated houses too); no plants grow in the lanes or through slabs; colliders follow the dock, steps, fences and props.
Left: about +100-250 draw calls vs `?keys=0` (frame time unchanged within noise), poinciana color is the vegetation helper's, and the mainland house palettes/drive stains switched to muted Florida tones: before/after in `docs/v2/shots/keys/houses_before_after.png` (pairs: `_ab` = before; lime/pink-striped deco -> beige/sage with soft trims). Not done: per-house detail upgrades beyond palette/drive (window/blind/gutter details already exist in the generator, not re-checked tonight).
- 06:10 Final polish (lead): grayer shell yard, darker damp hollows, dense matted grass at bins / planter / frontage, sticks and frond bits, an always-wet corner puddle with a mud rim, deck-corner pot removed, yard in one batch with 4 fewer single-use materials (deck view 994 -> 756 calls in k21). Houses: muted Florida palettes (`?housepal=old` = before), neutral driveway concrete, soft oil stains instead of three dark boxes per drive.
- 05:00 Lane check re-shot at dusk and day: `docs/v2/shots/keys/k20_lane_dusk.png`, `k20_lane_day.png` (no plants in the lane, bleached street, curb bins, board fence, poles). Roll-off lettering verified on both long sides (Blender render of both sides + `k20_dump_s.png`): upright, left-to-right, invented "KEYS ROLL-OFF". Mock-up camera: `k20_r0b_deck.png`. LEFT for later: draw calls are still +100..250 over `?keys=0` (12 neighbor houses, ~20 single-use yard materials, 8 planting fields; frame time unchanged within noise), the house's own interior/exterior batches dominate at the deck (~670 calls, other track), the 2_back_dock reference (house right on the water) cannot match the land shape (the bay is 22 m from the house; seawall + riprap + dock at the waterline instead).
- 04:10 Lane weeds (lead, gpF_keys_close_dusk): Nico's weeds / tufts / straps / palmettos / periwinkle are now rejected at the source inside every road ribbon (road graph, half width + 0.4 m; palmettos 1.2 m) via opts.roadClear; `tools/v2/vegetation/onroad.mjs 70` no longer lists nh_detail/weeds, plants:straps, plants:grass or palmetto. Still in the lane, not mine: miami-city M.pool x6 (around world -840, 4821), an unnamed InstancedMesh x66 at world (-846.2, 4802.3) on Pelican Point Ln east (identifying it), lot-props TrashCan(Grey) x2 at (-804.9, 4846.8). Also done: game.nicoHouse.stairs for the player's foot IK, roll-off heap of tear-out, side fences end at the bay, neighbor houses checked for flicker (walls stable; only wind/peds move). Final sheets: `docs/v2/shots/keys/cmp_k17_*.png` (11 cameras incl. dusk and after rain).
- 03:50 Perf A/B, same Chrome, keys pass on vs `?keys=0` (k14; machine load 70-100 so ms are noisy): mock-up deck camera 39.9 vs 38.7 ms / 994 vs 748 calls; front deck 47.6 vs (130, noise) ms / 906 vs 736; street 861 vs 774 calls; aerial 1005 vs 905; dock 460 vs 440. Frame time unchanged where the run was quiet; the extra calls are the 12 neighbor houses, yard materials and planting fields. The brown untextured box in fx4 is the pickups starter-stash crate (src/gameplay/pickups.js:167); I converted the user's crate (public/assets/models/keys/crate.glb) and told the lead. Gray striped pickup + rusty classic now match the mock-up (cars helper). `k14_ab_r0b.png` is the best mock-up match so far.
- 03:35 (times above were off by an hour; these are real) Roll-off: repainted lettering panels again, the GLB's texture shows only "KEYS ROLL-OFF" (checked by extracting it). Commits now `git commit -- <my files>` only; told the lead which earlier keys commits had swept in others' staged files (bc887bf, 8a245bc, e17ffd2). Draw calls: measured per group at the deck (base 1262): keysLots 369 (boathouse model has 29 materials; boats as meshes with shadows), houses 452, Nico exterior 396, interior 273 even though the deck views look away from the house. Fixed: no boathouse (clean pier), boats instanced + no sun shadows, lines merged, piles no shadows, neighbor layer hidden past 450 m, interior only while the camera faces the house. Slab joints closed, nothing grows through the slabs, landing sand bank in the yard's scan. Ground helper removed the white seawall copings + land-base band on Nico's beach. Sheets: `cmp_k12_*.png` (all reference cameras); final A/B `k14` running.
- 03:40 Lead review fixes: yard is now pale crushed shell/limestone dust (shell scan + gray-green matted grass, damp patches, 31 hand-placed weed clumps, more matted decals); Nico's dock starts AT the waterline on a short seawall landing with timber steps (nothing on the sand), limestone riprap along his shore, chain-link fences down both lot lines to the water, mangroves at the riprap ends, shell path from the bay stair; all walkway sections from the kit piece that renders (two kit pieces dropped out of the draw); planter bougainvillea now cascades over the lattice; blob shrubs by the planter removed; corner rail pot removed. Cars helper fixed Nico's gray striped pickup + moved the classic beside it; the van moved off pp_blue's front yard. Ground helper added a shelf + bleached Keys asphalt; the remaining white line on the beach (-18,-24.8)->(0.5,-19.4) is not a mesh of mine or the tiles: sent to ground. Sheets: `cmp_k9_r7_dock_close.png`, `cmp_k9_r0b_deck.png`, `cmp_k9_r2_back.png`; re-shoot `k10` running.
- 02:45 Reference sheets (reference | game): `docs/v2/shots/keys/cmp_k5_r0b_deck.png` (mock-up camera), `cmp_k5_r0_deck_dusk.png` (18:30), `cmp_k5_r0_deck_rain.png`, `cmp_k5_r1_front.png`, `cmp_k5_r2_back.png`, `cmp_k5_r5_aerial.png`. Flicker: house siding no longer crawls (temporal std of a still camera, front view: mean 2.84 -> 1.79, p99 23.8 -> 15.4; what remains is wind in palms/plants and their shadows). Perf A/B same run (`k6`, keys on vs `?keys=0`): deck 28.1 vs 29.6 ms, aerial 39.1 vs 41.2 ms, street 35.3 vs 29.1 ms (load avg 200-400, noisy); draw calls +157 deck / +95 street (STOP signs now instanced, rocks 3 shapes). Added: pale crushed-shell + matted-grass ground in Nico's yard, 4 more cottages (12 hand lots), shade trees/palms for density, invented hauler name on the roll-off (the scan had a company + phone number). Next: k7 sheets, rain puddle check, dock close-ups, trim draw calls.
- 01:20 Cars: the cars helper already parks Nico's pickup + classic (vehicles.js NICO_CARS), so my yard spots are documentation only and all yard props were moved clear of its 4 car spots; neighbors' cars go through `spawnParked(key, opts)`. Dock starts clear of the bay stair, has a light. Curb carts breakable. Keys lots get shell drives. Machine load 100-190: each shot run waits 10-20 min for a browser slot; reference set `k5` queued (tools/v2/keys/spots_refs.json -> `cmp_k5_*.png` sheets via tools/v2/keys/sheets.py).
- 01:05 Pass 1 in: (1) flicker: the "dotted wobbling" was the peeling-paint shader's 0.05-wide flake edge aliasing into crawling dots at distance (TAA jitter); now fwidth-aware (kit.js, applies to every generated house too). (2) Nico's yard by hand, `src/world/setpieces/nicoHouse/yard.data.js` + part 55: lattice planter with bougainvillea, curb bins (user's bin set), all-way STOP at the T, poles + sagging wires, red roll-off (user's Dumpster 3, textures wired), limestone rocks (user's Rock 2), pallets/drywall/lumber/chairs/cooler, ruts, leaf litter, puddles that grow after rain; car spots for `spawnParked` (the lifted pickup already shows up). (3) Dock = the user's modular pier kit (Dock 6) from the stair foot past the real waterline, posts extended to the sea bed, T-head with hoist frame, rowboat + skiff on lines; seawalls only where water really is. (4) 8 hand-placed neighbor cottages (`src/world/dressing/keysStreet.data.js`) + 5 bay-shore docks (mossy pier, clean pier, boathouse). Mangroves moved onto the shore fringe (no roots in the air). Shots: `docs/v2/shots/keys/k2_deck.png`, `k2_deck2.png`, `k3_dock.png`. Next: verify neighbors/docks, stray flat polygons near the east shore, flicker A/B, perf A/B (`?keys=0`).
- 00:20 House spot checked: the house, its anchors and the player spawn are all at the layout.json spot (-873.6, 4825.2, heading 1.057); probe `docs/v2/reports/keys-k0-probe.json`. The stale (-836, 5272) was only in test tools: fixed in furniture-audit, road-audit, veg-audit, veg-perf, roads/mkspots.mjs, roads/spots/ground.json (keys2 moved by the same offset to (-937.6, 4883.2)). The last two are untracked (roads helper's files), edited in place, not committed by me. Added `anchors.front` (yard, facing the house) so s1-tour `house` lands in the yard. STAGE1_AGENT_NOTES.md and CONVENTIONS.md still say (-836, 5272): lead please update. New tool: `node tools/v2/keys/shots.mjs --set X` (cameras in house-local coordinates, `tools/v2/keys/spots.json`).
- 00:20 Baseline shots: `docs/v2/shots/keys/k0_{deck,front,aerial,back,dock,top}.png` (deck view 22 ms, 675 draw calls).

## perf
- **06:25 FINAL (perf guard)**
  - **Shader / page errors:** none. Console sweep at spawn, downtown, Key Largo and the airport, default page and `?look3`:
    0 shader compile errors, 0 page errors. 'uLookV undeclared' is fixed (a272f78e), the report was a stale run.
    roadDecals 'mapTransform' was sent to ground earlier; regulatory `baseOf` (street props) is gone.
  - **Tonight's runtime changes ON vs OFF, one session** (draw order, parked-car sleep, interior cull, show-when-ready; the
    light guard and precompile stay on in both; `docs/v2/reports/stage1-perf-c0500_on.json`; machine load avg 50-90):
    | spot | frame median ON / OFF | p95 ON / OFF | draw calls ON / OFF | shader switches ON / OFF |
    |---|---|---|---|---|
    | spawn | 62.2 / 76.1 ms | 126 / 147 | 918 / 916 | 260 / 676 |
    | downtown | 70.6 / 78.7 ms | 236 / 465 | 676 / 950 | 248 / 616 |
    | Key Largo | 33.2 / 35.5 ms | 42 / 53 | 379 / 379 | 168 / 423 |
    Earlier A/B for the light guard (needs a recompile): spawn GPU 54-132 -> 18-39 ms per frame.
  - **Boot:** READY 42 s -> 18-27 s, longest task 3.6-11 s -> 0.6-1.3 s (s1-boot, earlier tonight; not re-run at 06:00, no slot).
  - **Streaming after load (lead's exception, commit 8974960a):** tiles within 300 m of the spawn still unbuilt at READY:
    6 of 7 -> 0. Queued streamer jobs at READY / 10 / 20 / 35 s: **453 / 434 / 367 / 312 -> 275 / 223 / 144 / 0**.
    Cause: the in-game budget is 3 ms per frame, and the boot warm-up only waited for 220 m. Fixed with 10 ms steps and
    300 m behind the loading screen, the player's area kept while a title camera is away, idle-time streaming (useful
    while loading; in game the main thread has almost no idle time), and 6 ms per frame for a standing player while > 40
    jobs are queued.
  - **Drive (45 s at 30 m/s):** too load-bound for absolute numbers (median 56-142 ms depending on the run). Stall
    attribution from the spike log: (1) `world.step` 170-340 ms for ~1 s, with many new dynamic bodies awake. Probable owner:
    **street props** (pushable props as dynamic bodies); earlier runs without them had 0 physics spikes. (2) City
    streaming steps 115-305 ms in one frame (`upd:anon#2` = city.update): single tile-build steps got long with the new
    content (**buildings / ground / street props** sections of tilebuild). (3) `groundMaskTick` up to 85 ms
    (**ground**, src/world/ground/surfaceMask.js). (4) Render 350-970 ms with 9-35 new geometries / textures in one frame
    (tile uploads of the new models). Shaders compiled inside a frame during the drive: 27-28.
  - **Costs the most tonight:** street props (physics spikes) and the tile-build step length (shared tilebuild content).
    The library buildings' +7 ms downtown: they are already instanced per model / material / cell with far-LOD shadow
    limits and use the shared precompile. No further lossless win found tonight without merging their materials.
- 05:40 **Console sweep** (spawn, downtown, Key Largo (-836, 5272), airport (-1210, 1045)), default page and `?look3`:
  **0 shader compile errors, 0 page errors** in both (`docs/v2/reports/stage1-perf-sweep*.json`). The
  "PortSolanaOcean: 'uLookV' undeclared" report was a stale run: since a272f78e the fog chunk reads uLookV only under
  `#ifdef PS_LOOKU`, and neither page logs it. The earlier `regulatory.v2.js baseOf` error is gone too.
  Note: browser slots are the bottleneck now (my runs waited 20-30 min for a slot); streaming had not settled at most spots
  (pending 340-575 jobs), so frame times from the sweep are not comparable.
- 02:20 Hold-back never applies within 25 m of the camera or the player (lead decision): those objects draw at once and
  wait for their shader as before. Drive check (downtown + 45 s at 30 m/s): 41 shaders compiled inside a frame (was 127
  without the precompiler, 32 with the hold-back everywhere). The near ones left are street-kit parts (parking meters,
  signal lenses, hydrant), plants:* and house:shingle. Error check on that run: page error
  `ReferenceError: baseOf is not defined` at `src/world/signs/regulatory.v2.js:126` (tick), from the uncommitted
  regulatory-sign edit: **street props** helper. No shader compile errors in that run (roadDecals was sent to ground).
- 01:30 (guard role) Lead decisions applied: MSAA stays on; nothing visual lowered.
  - **Shop interiors** (commit 1f35aff): each interior is ~210 meshes with ~186 distinct materials, so a merge cannot reduce
    draws without changing materials. Instead an interior seen from behind its back wall (below the roof line) leaves
    the main view; shadows unchanged. Downtown spot in one run: 1137 -> 592 draw calls, render CPU 27.8 -> 19.6 ms,
    frame 54.4 -> 43.6 ms. Frozen-frame on/off diff is below the TAA noise floor (`docs/v2/shots/stage1/perf_interiorcull_downtown_on/off.png`).
  - **Precompile** (commit 1fe378d6, `src/render/precompile.v2.js`): every GLB loaded during play plus the street-kit and
    house-kit material registries are compiled in the background (plain / instanced / instanced+color, small batches),
    with textures uploaded one per tick. Anything added during play whose shader was never built for that object type is
    compiled before the frame and kept out of view until the GPU has linked it (<= 1.5 s, usually a few frames) instead of
    freezing the frame. Downtown + 45 s drive: shaders compiled inside a frame 127 -> 32. Rerun later tonight as helpers
    add models: `node tools/v2/s1-perf.mjs --places downtown --drive 45` (prints "compiled inside a frame").
  - **dressing.v2.js** endless city search: backs off and stops after 8 tries (commit 3787fb6).
  - **Street furniture**: already instanced. Every kit part is one city-wide pool (tilebuild `kitParts`/`kitVar`), so one
    draw call per material. The extra downtown draws were the shop interiors (fixed above), not furniture. tilebuild not touched.
  - **Drive benchmark** (5 spots + 45 s at 30 m/s, one run, `docs/v2/reports/stage1-perf-full_0300.json`, before precompile):
    spawn 30.0 ms median (p95 36.4, 801 draws), downtown 35.8 (660), Clewiston 33.7 (788), Beach 40.4 (602), Key West 31.5
    (332); drive median 31.0 ms, p95 39.6, p99 50.7, worst 394 ms (house:shopGlass first compile + 6 texture uploads +
    82 tile geometries in one frame). Physics: no world.step spikes in that run; one later run had 130-216 ms steps for
    ~0.5 s (collider streaming), not reproduced yet. Machine load average is 55-90 now, so absolute ms swing 2x between runs.
  - Bug for the roads/tilebuild owner: shader compile error `roadDecals: 'mapTransform' undeclared` (MeshStandardMaterial
    with an onBeforeCompile that uses mapTransform without a map / USE_MAP mismatch).
  - Spawn guard: spawn is at 30-41 ms (24-33 fps) in recent runs. The machine is overloaded, so no single helper's change stands out yet.

- 01:30 **Loading no longer freezes the page** (user's "Page unresponsive"). Boot profiler: `node tools/v2/s1-boot.mjs --set X [--prof]`
  (stage timeline `window.__boot.stages`, every long task from the first script, long-animation-frame attribution, loading-bar
  gaps, CPU profile, long paced slices). Before -> after on the loaded machine (other helpers running):
  READY 41.9 s -> 18-27 s; longest main-thread task 3.6-5.7 s (11 s in one run) -> 0.6-1.3 s; tasks over 200 ms 26-29 -> 17-25;
  loading bar worst freeze 4.3-6.4 s -> 0.6 s. Stages: city 11.7 s -> 5.8 s, shaders+warm-up 15.4 s -> 7.9 s, vehicles
  6.9 s -> 5.4 s, characters 1.9 s -> 1.0 s, interiors 0.9 s -> 0.3 s.
  Main fix: every shader was compiled twice (precompiles targeted the canvas and a different light count than the frame
  draws with; the real program then compiled synchronously on first draw). Precompiles now target the HDR composer target
  with the scene's light set, in slices, waiting on KHR_parallel_shader_compile without blocking (`src/core/pace.js`).
  Plus time slicing (same results): city boot steps, Miami data decode, elevated network (phase generator), texture
  uploads (img.decode off-thread first), NPC cloth atlas and bark atlas (built in steps), vehicle spawn/warm-up, warm-up frames.
  Commits c21840e, fcb40ea, 007d30b. No visual change (same programs, same data).
- Still over 200 ms (send to owners): car texture uploads in the vehicle warm-up 200-460 ms each (huge textures; cars),
  `buildNicoHouse` 0.5-0.8 s in one task (74_bedroom, 50_plants; keys/house), `createPickups` ~0.5 s (gameplay),
  countryside `work` single cell steps 150-270 ms in warm-up frames (vegetation), keysBar JSON 0.3 s, interiors import 0.35 s,
  first gameplay frames after READY 0.5-1.3 s (programs/textures first used there).
- Frame rate work (earlier tonight): light-loop guard (zero-color lights skipped in every shader: GPU ~40-60 % less at the
  spawn in A/B, picture identical - frozen-frame diff = TAA noise), draw order by program (~30 % fewer program switches),
  parked cars sleep, streamer tile loop. Proof sheet `docs/v2/shots/stage1/PERF_proof_sheet.png`. Bench:
  `node tools/v2/s1-perf.mjs` (pinned preset, ABAB in one session).

## cars
- MORNING SUMMARY (06:20): (1) All road cars are the user's models (47 driving + 2 static props, 33 MB), with wheels, lights, class physics and the US paint mix; cost is the same as the procedural fleet (132 vs 128 draw calls).
  (2) Brand marks: emblems are now filled in with the color of the paint or grille around them (no black blocks), 3D grille badges are deleted, and wheel center caps are plain chrome. Re-checked in close-ups: sedan3, sedan6, hatch1, conv1, coupe3, police1, suv12. All 47 driving cars are reconverted with these rules. The other cars have not had a close-up review yet (`tools/v2/cars/render_review.py`).
  06:30 logo pass: all 40 unreviewed cars got front and rear close-ups (render_review.py). Every car now has automatic small-badge removal at the grille and trunk center (trim islands only). Hand-placed boxes on 15 cars cut out badges fused into the grille or repaint them as body.
  Now clean: suv1, suv4, suv6, suv8, suv9, suv10, suv11, suv15, sedan3 (star), sedan5, conv1, hatch1, suv12, truck2 (front). STILL A MARK (not cleaned): suv3 grille crest (faint), sedan1 / suv14 / suv13 grille ovals, suv13 rear lettering, truck2 tailgate bowtie and suv5 rear roundel (repainted, but the relief still reads), sedan3 small badge on the right grille bar, suv7 hood emblem. White shards left by the earlier emblem fill: hatch2 hood and tail, coupe2 grille. super5 is held at its 06:19 build (the new build drew a big "1r" in the horseshoe grille). Trucks, vans and supercars were not re-checked after the 06:24 rebuild.
  (3) Roll-overs: 0 in the 06:13 60 s downtown run (worst tilt 3.3 deg; `docs/v2/reports/cars-stability.json`). Fixes: COM height and anti-roll per class, suspension travel of at least 0.2 m, and a car that leaves ghost mode is set back down on the road surface. Parked cars stay 2 m clear of curbside carts.
- 05:20 SUMMARY (cars): every road car is a user model. 46 of the Models/Cars entries converted (not the 4 personal-use
  rows), plus Covered Car 1 and the broken Van 2 as static props = 49 GLBs, 33 MB, `public/assets/vehicles/cars/`.
  Pipeline `tools/v2/cars/` (convert.py + cars.json per-car fixes), runtime `src/vehicles/glb/`. Wheels split by
  geometry with hub pivots (static calipers), spin / steer / per-wheel suspension, capped at the measured arch gap;
  hull, track, wheelbase, radius from the model; class physics. Paint = US mix (`glb/fleet.js US_MIX`) with per-car
  finish / dirt / wear; Southline police, taxi, ambulance, fire liveries; emblems blanked. Rare: one each, placed mid-block
  near the casino valet, Ocean Drive, Brickell, downtown, Collins Ave (`glb/placements.js`). Zone fleets (`zoneMix`).
  Nico: gray lifted pickup with a satin black hood stripe + faded pale-blue classic (`game.vehicles.nicoCars`).
  Cost: same draw calls as the procedural fleet (132 vs 128 for ~54 cars), frame-time difference in the noise.
- 04:50 Second orientation sweep (offline Blender renders of every GLB from the front-left): sedan4, suv13, the hypercar and
  the fire engine were driving backward too; fixed (all 47 models now checked front-left and pinned). Hypercar maker
  lettering on the tail blanked. Car meshes are tagged as dynamic sun-shadow casters at creation (look helper: parked cars
  in Nico's yard had no shadow). Final stability (60 s downtown): 3 roll-overs library vs 4 procedural.
- 04:10 Night close-ups of 12 different traffic models with head / tail lamps lit: `docs/v2/shots/cars/cun_<key>_night.png`
  (van1, truck2, sedan8, suv10, conv1, coupe3, sedan7, hatch1, suv2, sedan5, hatch2, police1 with strobes). Rare cars park
  themselves once each when the player comes near: hypercar at the casino valet (`rare_casino_super5.png`), classic wedge on
  Ocean Drive (`rare_ocean_super6.png`); now placed mid-block (one had landed on a corner). Parked cars:
  `res_res_row1..3.png`. Wheel-to-ground check against the physics colliders: worst 0.001-0.004 m at rest (`cars-rare.json`,
  `cars-res.json`). sedan8 was driving backward (orientation guessed from one-sided cues): fixed, every model's orientation now
  pinned in cars.json after the visual review. Note for lead: docs/v2/CONVENTIONS.md has a 4-line cars note (uncommitted, your file).
- 03:45 Lead review items done: Nico's classic is pale blue with soft rust and faded paint, standing beside the pickup
  (`docs/v2/shots/keys/cars_nico2_deck.png`, `cars_nico2_street.png`, night `cars_nico2_deck_night.png`); the pickup is a
  darker gray with the black hood stripe (`stripe` = paint patch) and a 7 cm lift (studio check of the stripe:
  tools/v2/cars/shots.mjs 'cars=truck2&stripe'). No finned classic exists in Models/Cars (Convertible 1 = '65 drop-top is the
  closest); a finned sedan is in MODEL_REQUESTS_stage1.md (P1).
  Maker emblems built into grilles / trunk lids are now blanked; Southline ambulance + fire rescue lettering; all models
  have head + tail lamps except the fire engine / semi rear (low-poly, lamp boxes approximate).
  Cost A/B inside one session (cars shown vs hidden, ABAB, downtown, `docs/v2/reports/cars-cost-{lib,proc}.json`):
  library fleet 132 draw calls for 55 cars, procedural fleet 128 for 53 cars (same); frame-time deltas are within the
  machine's noise (load average ~300 tonight): +5.3 ms median (library) vs +9.9 ms (procedural).
- 03:00 In game (g1): every traffic and parked car downtown / Brickell / Little Havana is a library model (glbShare 1.0);
  at Nico's the neighbors' `spawnParked('sedan'...)` calls now resolve to library models too. Night: head lamps and red tail
  lamps light (`docs/v2/shots/cars/g1_night_traffic.png`, `g1_night_rear.png`), traffic `g1_dt_traffic.png`, parked
  `g1_res_parked.png`, `g1_nico.png`. Stability probe (`node tools/v2/cars/stability.mjs`, 60 s downtown, every car sampled
  2x/s): first library run had 9 roll-overs (procedural fleet on the same spot: 4); cause = shorter physics bump travel ->
  hull on the road. Fixed (travel >= 0.2 m, hull floor 0.24 m) -> 3; plus a righting torque for AI traffic past 30 deg lean.
  Nico's pickup is gray now (wear no longer fades it white) and the classic stands beside it as in the mock-up (keys helper).
- 02:00 First in-game close-ups (Brickell curb, 11:30, 14 models parked with spawnParked): `docs/v2/shots/cars/cu1_<key>_f.png`
  / `_r.png` (e.g. cu1_police1_f, cu1_taxi1_f, cu1_truck2_f, cu1_suv12_f). Paint, glass, wheels on the ground, Southline police
  and taxi liveries all read right. Fixed after looking: real maker emblems still on some grilles (stronger emblem removal,
  reconverting now), a dark contact-shadow slab poking out at the curb (smaller), one car spawned before the ground streamed in
  and landed hard (parked cars now wait for ground colliders).
- 01:40 Boot with the library fleet verified headless: READY 37 s, 48 models registered, all 49 GLBs streamed in, no console
  errors (`node tools/v2/cars/boot.mjs`). Boot set now covers every class (no procedural stand-ins while streaming). Lamps:
  every car audited (`tools/v2/cars/lamps_audit.py`): reflectors behind lens glass and lamps painted in atlas textures now light
  up (head, tail/brake, reverse, blinkers); police roof bar = red/blue strobes. In-game shots queued (browser slots are full).
- 01:20 46 road models + 2 static props converted (all Models/Cars except the 4 personal-use rows): 47 GLBs, 32 MB total
  (Draco). Studio review of every car front + rear (blue paint test) done twice; fixed orientation (sedan1, truck2, 5 trucks),
  paint detection (9 cars by hand in `tools/v2/cars/cars.json`), white tires, inner door skins poking through, roof racks,
  open ambulance doors. Police car now wears a Southline PD livery (own textures, `tools/v2/cars/liveries/`).
  Physics from the models: wheel radius / track / wheelbase measured, collision hull = body shape without mirrors,
  suspension travel limited to the measured arch gap, class mass / springs (pickup soft and tall, supercar stiff and low).
  Nico's yard: gray pickup with black hood stripe + faded pale-blue classic (`spawnParked`), a covered car next door.
  Waiting on a browser slot for the first in-game run (traffic, Nico's yard, frame time A/B). Nothing verified in game yet.
- 00:45 Pipeline running: `tools/v2/cars/convert.py` (Blender, scripts off) turns each library car into one Draco GLB
  (`public/assets/vehicles/cars/<key>.glb` + manifest): real length per class, wheels found by geometry and split (hub pivots,
  calipers do not spin), materials sorted into paint / trim / glass / lamp slots (albedo, roughness, metal sampled from the
  source textures into vertex data), brand badges removed, LOD0 60k / LOD1 10k / LOD2 2.2k with the source shading transferred.
  37 of 48 converted so far (personal-use rows never touched). Runtime: `src/vehicles/glb/*` builds the same car object the
  procedural builder did (physics, damage, lights, traffic unchanged), 4 body draw calls + 1 instanced wheel set per car.
  Review sheets in progress; not yet verified in game.

## props
**SUMMARY (06:00):** every street prop is now a user library model (32 converted, brand text painted out), with 3-10 texture versions per repeated prop (no two neighbors alike), one mailbox + a curbside cart pair per house, hydrants / benches / meters / work zones placed by real-world rules, nothing in a lane.
Light props are real Rapier objects: carts, cones, barricades and chairs are pushed by the player and thrown by cars; mailbox posts and sign posts snap; hydrants gush when sheared; nothing settles or pops after loading; every collider is checked against its mesh (docs/v2/shots/props/colliders/*.jpg).
Review: docs/v2/shots/props/review/FINAL_sheet.jpg, t5_* (car / walk push), t9_* (cafes, spray); cost about +4 draw calls, no measurable frame time change. Open: one parked car on a cart pair at Keys (asked the cars helper); tilebuild bike-rack clearance hunk waiting for the lead (props).
- 05:45 second pass DONE. Collider audit (docs/v2/shots/props/colliders/*.jpg, 16 types x up to 20): carts (box), mailbox posts (thin post + head box, fixed in 5cc7a87), street bins (cylinder), meters, hydrants, parking-sign posts (post + plate), STOP posts, utility poles, signal poles, lamps, benches, jersey barriers, cafe tables + chairs, staple bike racks all wrap their mesh; bus shelters get back + end panels. Fixed on the way: hydrants a car sheared left an invisible collider after a tile collider rebuild (tilebuild line pending for the lead), traffic AI no longer shears hydrants / snaps posts (ce7bec5), carts always at the curb (19e8582: the side-of-house spot landed under stilt decks / in shrubs). Open, not mine: a parked car sits on top of one curb cart pair at Keys (cart.jpg row 1) - the car parker should keep 2 m off lot cart spots (game.lotProps.owners holds them).
- 05:20 onroad.mjs re-run after 6c20452: Pelican Point Ln (r 70) and downtown 407,-110 / 470,-100 (r 90) show NO props-helper item in a lane except M.pool = the lamp light-pool decal (additive glow on the asphalt, meant to be there; please whitelist). Remaining hits are not mine: "lamp-pools / ShaderMaterial" (env lamps), npc-crowd, and an unnamed MeshStandardMaterial instanced mesh with no parent / mesh name (x68 Keys, x44 downtown, e.g. -907.7,4874.8 and 391.7,-137.7): all my instanced meshes are named (lot-props:<mat>, reg-*, kit materials).
- 04:35 LEAD answers: (a) the navy #2a3550 MeshStandardMaterial is not mine: the only use of 0x2a3550 in src is src/gameplay/pickups.js:58 (a 0.42 x 0.5 x 0.14 pickup case box); none of my props has an untextured navy material. (b) "M.pool" = the street-lamp LIGHT POOL decal (tilebuild lamp loops, additive radial glow on the asphalt under each lamp, opacity 0 by day): it is meant to lie on the lane, not an object; please whitelist it in onroad.mjs. (c) the 2 carts in Pelican Point Ln: fixed in 6c20452 (every lot spot is pushed out of the road ribbon: half width + 0.55 m + item radius). Work-zone cones / channelizers / renovation roll-offs stand on the road on purpose (closed curb strip / parking lane), they will show in onroad.mjs downtown.
- 04:20 LEAD: tilebuild ready: props - one line in buildColliders' hydrant loop (`if (p.broken) continue;`: a sheared hydrant leaves no invisible collider after a tile collider rebuild); the vegetation helper's 2 lines (TREE_LIB seagrape -> rubber_fig, BUSH_LIB bush_leafy -> green_shrub) are also waiting there. (SendMessage to 'lead' isn't reachable from here.) Second pass done: dormant push props (0 spawn wakes), traffic never snaps posts / shears hydrants (ce7bec5), staple bike racks + can/cup litter from the library, off-day carts only on open ground (2f9fa1c), post colliders span the whole post (59cea41), collider audit sheets docs/v2/shots/props/colliders/*.jpg (16 types, up to 20 each), site gate shot docs/v2/shots/props/site3_gate_b.png.
- 05:10 second pass (36f433d, committed with `git commit -m ... -- <my files>` as asked): (1) push props now START AS FIXED bodies at their resting pose and only turn dynamic when the player (within reach) or a vehicle reaches them, then go back to fixed once at rest: wake log over 30 s at spawn + downtown shows 0 spawn wakes (was 26-58), every wake has a cause (car / player); fewer live bodies (5-10 instead of ~80). Lane-following traffic no longer snaps sign posts (it did 3x per minute at Keys corners). (2) bike rack = hoops kitbashed from the Street Props Pack 2 pipe railing (tools/v2/street-models/bikerack.py); litter = the soda can (6 repainted labels: the source cans carried real cola brands) + paper cup (coffee-chain logo removed). The tilebuild.js hunks that switch litter / bike racks to these models are NOT committed yet: tilebuild.js holds another helper's uncommitted facade work, so a `-- tilebuild.js` pathspec commit would sweep it in; I'll commit once it is in. (3)/(4) running: clear-view site shots, collider wireframe audit (docs/v2/shots/props/colliders/<type>.jpg, up to 20 instances per type).
- 04:35 FINAL PASS committed (2084a0c, 8c62bdc). Review sheet: docs/v2/shots/props/review/FINAL_sheet.jpg (Nico's deck view, 3 Nico street lots, downtown blocks, bus stop, tower site, Keys residential lots). Push sequence: review/t5_lab.jpg -> t5_c.jpg -> t5_d.jpg (car hits a cart pair), review/t5_walk_go.jpg / t5_walk_end.jpg (player shoves carts). Cafes review/t9_cafe1.jpg, t9_cafe2.jpg; hydrant review/t9_spray.jpg. commit_mine.sh now also resets my paths in the shared index after each commit (ab3fb52 airport was the 4th commit that reverted my files from a stale shared index).
- 04:05 LEAD (repeat): tilebuild.js commits from other helpers keep dropping my furniture hunks in HEAD because their index holds an older staged tilebuild.js: 765e12c (buildings), d3a7601 (vegetation), 6a4afb8 (ground pass) all have no workZones/propJitter/setPropMatrix; I re-add them each commit (4a6a721 has them). Working tree is fine. Fix for everyone: before committing tilebuild.js, `git reset -q -- src/world/miami/tilebuild.js` then stage only your hunks (tools/v2/street-models/stage_hunks.py <file> <regex> does that in 0.5 s), or use commit_mine.sh's compare-and-swap pattern. 04:08: I reset the stale staged tilebuild.js in the shared index to HEAD (working tree untouched), which was the source.
- 03:55 cafes now the user's models (0373e59): patio table + 2-4 plastic chairs per table (one color per cafe, 6 colors), striped cafe umbrellas (6 colors) - docs/v2/shots/props/t9_cafe1.png, t9_cafe2.png; hydrant water column - t9_spray.png; sidewalk planters with shrubs downtown; kiosk spots -> library hot dog cart ("Crunch" wordmark painted out). Not used for brand reasons: pack-2 bins (BFI / WM logos), pack-1 post box (postal logo), Crate 2 (maker name).
- 03:25 LEAD: Keys commit bc887bf reverted my committed tilebuild.js hunks (187 lines: variants, jitter, moved poses, work zones, construction sites, prop colliders) and hydrantSpray.v2.js in HEAD (the working tree was never affected); I re-committed them. Same stale-index pattern as my 606790d mistake: tools/v2/street-models/commit_mine.sh shows a compare-and-swap way to commit (read HEAD, private index from it, commit-tree -p HEAD, update-ref HEAD new old).
- 03:10 Nico's street from the front deck (docs/v2/shots/props/t8_deck11.png) reads like the mock-up: cart pairs at the curb per house, post mailboxes at the driveways, poles + wires. NOTE for the Keys helper / lead: public/assets/models/keys/rolloff.glb still carries the source's "Waste recycling company +0098240725" print (visible in t8_deck11.png); public/assets/models/street/rolloff.glb is the same Dumpster 3 with that text + phone painted out and replaced ("SUNCOAST ROLL-OFF 305-555-0142", readable on both sides) - please switch to it or reuse tools/v2/street-models/fixed/rolloff_color4.png.
- 02:55 pass 2 committed (606790d). INCIDENT: my private-index commit was built from a HEAD that moved during the (slow) commit, so it reverted 11 files of other helpers; vegetation restored theirs (f57d201), I restored the other 8 (8c0b3ac: weapons r5_blue/manifest, pickups, precompile, s1-perf, this file). commit_mine.sh is now compare-and-swap (commit-tree with the base HEAD as parent + update-ref HEAD new old; retries if HEAD moved). regulatory.v2.js baseOf error was fixed before that commit. Perf A/B in one session (s1-perf --ab, lotProps draw on/off, dynProps update on/off): +4 draw calls, render 25.1 -> 25.3 ms at spawn, downtown no change (57.5 vs 57.3 ms median, machine under load 40+).
- 02:10 verified in game + committed (37822e5c): per-house library mailboxes/carts with texture variants at Nico's street (docs/v2/shots/props/dbg_close1.png, dbg_close2.png, t2_lot2.png); car sends a cart pair flying (t5_a..t5_d.png), player pushes carts (t5_walk_go.png, t5_walk_end.png). 6 more variant sets (plastic chairs 6 colors, cones, jersey stripes/tags, commercial bins, twin mailboxes). Hydrant hit hard -> water column + droplets (hydrantSpray.v2.js). Now: downtown / bus stop / work-zone / hydrant shots, perf A/B.
- 01:00 built (not yet verified in game): 12 new library props converted (tools/v2/street-models/build_props.sh: curbside cart, cone, channelizer, flex bollard, ROAD CLOSED barricade, jersey barrier, roll-off dumpster [company name + phone repainted], site cabin, tarp crates, plastic chair/table, commercial bin); texture-array variants for 8 repeated props (variants.py -> public/assets/models/street/var/, 4-10 layers each: recolors, graffiti removed/moved/new tags, stickers, house numbers, rust, fade); src/world/props/{variants,dynamicProps,propShapes,lotProps}.v2.js; per-house mailbox + carts (lotProps) replace the code-built ones; keysLane no longer sprinkles mailboxes; hydrants only on curbed streets, one side, 90-150 m; benches only at stops / parks / beach; work zones + tower construction sites. NOTE for lead: 3 small guarded hooks outside my files (houses/generator.js yard curb spots, houses/houses.v2.js lotProps add/remove, dressing/dressing.v2.js spawn-street mailbox/bins -> lotProps; rng sequence kept, ?lotprops=0 restores the old boxes).
- 00:20 started: read briefs + user shots; inventory of street GLBs/textures; plan = texture-array variants per prop (per-instance variant/brightness/fade in instanceColor), per-house mailbox/bin placement, Rapier push/knock props (src/world/props/), construction sites with library cones/barriers.

## intake
- Models batch 3 (93 zips, details in `Models/INTAKE_2026-11-16.md`, rows in `Models/catalog.csv`, all license-free per the user). Nothing existing was moved or renamed; only new folders were added. Added per folder:
  - Banks: Bank Teller 1, Bank Vault 1
  - Barriers: Barrier 2
  - Beach Stuff: Beach Kit 1
  - Billboards: Billboard Set 1
  - Buildings: Building 23, Building 24, Building 25, Building 26, Building 27, Building 28, Building 29
  - Buoys: Buoy 1
  - Cars/Other: Covered Car 1
  - Cars/Trucks: Truck 8
  - Cars/Vans: Van 5
  - Desks: Desk 2
  - Diners: Diner 1, Diner 2, Diner 3, Diner Booth 1, Diner Booth 2
  - Docks: Dock 6
  - Factories: Factory 1, Factory 2
  - Furniture: Picnic Table 1
  - Hangars: Hangar 1, Hangar 2, Hangar 3, Hangar 4, Hangar 5
  - Hotels: Hotel 1, Hotel Lobby 1
  - Interiors: Interior 16, Interior 17
  - Ladders: Ladder 2
  - Lifebuoys: Lifebuoy 3
  - Modular Kits: Modular Kit 3, Modular Kit 4, Modular Kit 5
  - Motels: Motel 1, Motel 2
  - Office Buildings: Office Building 1, Office Building 2, Office Building 3, Office Building 4, Office Building 5, Office Building 6, Office Building 7, Office Building 8, Office Building 9, Office Building 10, Office Building 11, Office Building 12
  - Plants: Fern 1, Grass Clump 1, Moss 1
  - Prop Packs: Industrial Props Pack 1, Street Props Pack 2
  - Reception Desks: Reception Desk 1, Reception Desk 2, Reception Desk 3
  - Rocks: Rock 1, Rock 2
  - Safety: Fire Alarm Pull Station 1
  - Schools: School 1, Classroom 1, Classroom 2
  - Sewer Grates: Manhole 4
  - Storefronts: Storefront 1, Storefront 2, Storefront 3, Storefront 4, Storefront 5, Storefront 6, Shutter 1
  - Textures: Roof 1, Roof 2, Roof 3, Concrete 1, Concrete 2, Brick 1, Gravel 1, Brick 2, Plaster 1, Plaster 2, Concrete 3
  - Tools: Bolt Cutters 1, Handsaw 1, Flashlight 1, Knife 1
  - Wall Clocks: Wall Clock 1
  - Weapons: Machete 1
- School / classroom: Schools/School 1 (campus exterior, 2.6M tris), Schools/Classroom 1 (normal), Schools/Classroom 2 (abandoned, mission). Heist: Safety/Fire Alarm Pull Station 1, Banks/*, Cars/Trucks/Truck 8 (armored), Tools/Bolt Cutters 1.
- Heavy: School 1 2.6M, Gravel 1 799k, Storefront 5 754k, Building 29 641k, Office Building 8 645k, Brick 1 500k, Classroom 2 454k (decimate before runtime). Many ground floors are low-res (see intake md).
- 02:10 In-session ABAB (one run, 3 rounds each, loaded machine; `docs/v2/reports/stage1-perf-ab_final.json`), draw order +
  parked-car sleep OFF -> ON: program switches/frame spawn 337->222, downtown 521->306, Clewiston 267->179, Beach 441->263,
  Key West 169->135; render CPU -0.3..-2.5 ms; vehicles fixed step spawn 3.05->2.12 ms; frame medians within noise
  (spawn 44.6->41.0 ms, p95 79.6->54.7). Light guard (needs a recompile, so cross-session/recompile A/B): spawn GPU
  54-132 -> 18-39 ms per frame, frame median 54-62 -> 38-40 ms. Frames are now mostly CPU bound under this load.
- Draw-call findings for owners (no edits from me): downtown shop interiors are ~570 unmerged draw calls (3 interiors of
  ~250 meshes each, visible from the street) -> `staticBatch(group)` (src/render/staticBatch.js, door/interactive meshes
  marked `userData.noBatch`) after the build, and hide an interior when the camera is outside and behind its facade;
  street furniture added ~+450 draw calls downtown (instance it); furniture/house materials ('Bus Stop Material',
  'MARBLE', 'Surface 8/16', 'house:shopGlass', npcEye/npcLash/npcShoe) are not in the city precompile list and compile
  while driving (hitches); `src/world/dressing/dressing.v2.js` re-traverses the whole city every 1.5 s forever when
  'miami-land-base' is missing (stop after a few tries).
- Decision for the lead/user: High preset runs MSAA 2x on top of TAA. MSAA off measured GPU 39 -> 18 ms (spawn), 45 -> 39
  (downtown), frame -2.5..-3.6 ms; slightly more edge shimmer in motion. Not changed.

## buildings
**Morning summary (buildings):** (1) Changed: 44 of the user's building/airport models placed city-wide with their own colliders, far LODs and per-instance variation; procedural facades now use the user's Plaster 1/2 + Brick 2 scans at real scale, with real sills, pilasters, window AC units, downspouts; the rough district (Overtown/Liberty City) is rundown with boarded/barred windows, rusty roofs, graffiti, chain-link lots and shacks; MIA has a terminal, tower, jet bridges, parked jets and runway lights.
(2) Best before/after sheets: `docs/v2/shots/stage1/CMP_B0_vs_after_overtown.png` (street + aerial) and `docs/v2/shots/stage1/CMP_B0_vs_R1_dt_overtown.png`; full tour `BLD_*.png`.
(3) Left: dark/empty interiors behind library glass; downtown street ~+7 ms with the library on (towers within 250 m at full detail); Office Buildings 4/5/6/9 street level medium-res; initial city streaming after a page load is slow for everyone (500+ tiles pending after 35 s with the library on AND off; library adds a little), first review shot after load often empty.
- 05:50 Initial-streaming check (`tools/v2/buildings/havprobe.js`, Little Havana right after load): library OFF 505 tiles pending / 7 near tiles after 35 s, ON 522 / 2 (separate page loads, loaded machine): the backlog exists either way; the library may add a little per-tile cost (neighbor-aware picks), worth a profile. Overtown close-up after this round: `R3_overtown_close.png`.
- 05:00 Lead's street-level facade round. Note: the green/orange "flat box" in `BLD_havana_st.png` was a LIBRARY model (Building 23, 275-1024 px stucco, windows modeled as black slabs), not a procedural facade: it is no longer placed (`off: 1`), same for the torn Storefront 2 the shops helper found at Fort Myers. Procedural facades: wall layers now use the user's scans (Plaster 1 hand-troweled stucco at 1.8 m, Plaster 2 sand-finish stucco at 1.4 m, Brick 2 at ~8 cm courses; `public/assets/city/pbr/user_*`), plain wall layers get an anti-tiling second sample, window AC units are real geometry (box + grille, sticking out of the lower sash) instead of painted, downspouts at two corners, an electric meter + conduit on a side wall, ~7 % of residential windows left open; existing: recessed reveals, frames, mullions, sky-reflecting glass, per-window parallax rooms with blinds/curtains, per-window night lighting, sill water stains, base grime, cornices; plus this night's projecting sills/lintels and storefront pilasters. Split agreed with the shops helper (they own storefront lots, glassFront/shopFrontDress, interiors; I keep streetShopDress relief + upper floors). Side by side: `docs/v2/shots/stage1/CMP_B0_vs_R1_dt_overtown.png`; Havana re-shoot running.
- 04:25 Found and fixed a 6.6-7 s frame stall the first time far LODs / new library variants appeared (synchronous shader compile on first draw): library programs now compile off-frame with the game's HDR target and light set (`src/core/pace.js compileForGame` + `programsReady`) before their instances show; glow moved to a uniform (fewer programs). Re-check: Brickell aerial 6936 ms -> 91 ms (loaded machine). Far-LOD towers cast shadows only within 700 m. Lobbies behind library glass lit at night.
- For the lead (not mine): `PortSolanaOcean` ShaderMaterial fails to compile (`'uLookV' : undeclared identifier`, src/render/look3.js / src/world/env/fogChunks.js) in every run since ~03:00.
- Left: the street-level lobby/shop interiors behind the user's model glass are dark boxes (no interior mapping on library models); downtown street views still cost ~+7 ms with the library on (towers at full detail within 250 m); some model ground floors stay medium-res (Office Buildings 4/5/6/9) beyond the shader re-grain; Airport 1 terminal pieces unused (racing-game quality); Office Buildings 2/3/8/12, Buildings 12/19/20/21/29, Storefronts 3/4, Diner 2, Gas Station 2, Motel 1, Hangar 3/5, Parking Deck 1 not placed (too heavy, broken after cleanup, or no fitting use).
- 03:42 Final A/B (one session, library OFF -> ON, median ms / draw calls / triangles; `docs/v2/reports/buildings-ab3.json`; machine heavily loaded, OFF downtown-air sample spiked): downtown street 57.5 -> 65.0 / 910 -> 1093 / 5.4M -> 8.7M; Brickell air 40.2 -> 41.9 / 406 -> 589; Overtown air 43.0 -> 42.2 / 430 -> 594; airport air 31.3 -> 32.2 / 294 -> 407; Clewiston street 64.4 -> 56.3 / 675 -> 732. Frame time within noise except downtown street level (+7 ms: many full-detail towers in view); triangles roughly double in tower views.
- 03:30 Lead FINAL_sheet follow-up: (a) downtown/procedural street faces now have real depth: stone pilasters between storefront bays, granite kick plates, sign boards, a projecting ledge (with colliders), projecting window sills on every street-facing punched/arched window up to 6 floors (+ lintels on masonry families), stronger base grime, no camo peeling paint on ordinary rows. Shots `docs/v2/shots/stage1/GF2_gf_{havana,havana2,overtown,edge}.png` (several downtown street shots get hijacked by gameplay: turf-fight mission camera, arrests, cutscene letterbox). (b) Keys navy rectangles: not mine. Probe at (-930, 4930) (`tools/v2/buildings/nearprobe.js`, `navyprobe.js`): 0 library instances / fences / clutter within 250 m; the only navy flat-colored meshes there are cars (LOD groups, #1d3f8f / #1c2528) and one `MeshStandardMaterial #2a3550` under Group < Group (owner unknown, below my size filter) - keys / props helper please check. (c) construction-site ground: ground pass / props.
- Rough district verified at street level: chain-link fences with posts around vacant lots and a blue tarp squatter shack inside (`GF2_gf_overtown.png`).
- Casino far LOD 70k tris (was 329k at every distance).
- 03:15 Final review tour done: `docs/v2/shots/stage1/BLD_{dt,brick,sobe,havana,overtown,liberty,clew}_{st,air,stn,airn}.png` + `BLD_apt_{gate,air,hangar,airn}.png` (noon 12:00 / night 21:30, clear weather). Fixed from it: glittering night panes (library glass was a perfect mirror of the starry sky), low-res stucco on library walls (re-grained), fire station out of the core, runway lights too small to see.
- Lead commit rule noted (pathspec commits only, `git show --stat HEAD` checked). My ab3fb52 / 765e12c had swept in other helpers' staged index (street-props deletions, a tilebuild block move); the props helper re-committed their files in 8c62bdc; nothing of mine is pending in other files.
- Lead FINAL_sheet items: (a) downtown ground floors: stone pilasters between bays, granite kick plates, sign boards and a projecting ledge over storefront ground floors (real geometry, in tilebuild `streetShopDress`), stronger base grime; verifying now. (b) Keys navy rectangles near (-930, 4930): NOT library objects (probe: 0 library instances / fences within 250 m); a dark-navy `MeshStandardMaterial #2a3550` mesh under a Group < Group is there, identifying its owner now. (c) construction-site tile: the flat orange ground is the `construction` land area (ground pass) and the site props (props helper); not in my files.
- 03:20 For the lead / vegetation helper: trees and flat impostor cards are now planted all over the MIA apron and taxiways, right in front of the terminal gates (`docs/v2/shots/stage1/BLD_apt_gate.png`, `BLD_apt_air.png`): the apron (features.json area a5, kind 'apron') and runways need to be a no-plant zone. Also: street-level review shots at the downtown core get taken over by gameplay (turf-fight mission camera, then an arrest: `BLD_dt_st.png`).
- 02:55 Lead's question (dark rectangles in `keys/k7_r5_aerial.png`): NOT library buildings. Pick probe at the Keys aerial camera (`tools/v2/buildings/keysprobe.js`, 672 rays, distance > 120 m): 0 hits on `lib-*` meshes; far hits are miami-land-base, near tiles, the house generator, `vegField_*` and `countryside`. The same flat dark square cards stand on empty lawns at South Beach (`BLD_sobe_air.png`) and Liberty City (`T2_liberty_air.png`) where no building exists: vegetation impostors. Broken far LODs I found myself were removed at 02:40 (grid tower, blue glass tower, casino, long hangar, stilt shack, brick cottage; the first two rebuilt cleanly).
- 02:30 Perf after the draw-call work (A/B one session, `docs/v2/reports/buildings-ab2.json`, OFF -> ON, median ms / calls): downtown air 34 -> 48 / 338 -> 518, Brickell air 30 -> 46 / 367 -> 588, Overtown air (OFF sample spiked) -> 42 / 337 -> 587, airport air 28 -> 23 / 244 -> 386, Clewiston street 56 -> 46 / 603 -> 619. Draw calls down ~35 % vs the first pass; remaining cost is triangles at tower close range (towers now switch to far LOD at 300 m).
- 01:50 Verified in game (shots `docs/v2/shots/stage1/T2_{overtown,liberty,dt}_{st,air}.png`, `T2_apt_{gate,air}.png`, `T3_apt_top.png`): Overtown now reads as a rough mixed block (gun shop, gabled houses, rusty roofs, shutters), downtown aerial much more varied, terminal + tower + jet bridges + parked airliners (neutral livery) at MIA. A/B in one session (`node tools/v2/buildings/ab.mjs`, `docs/v2/reports/buildings-ab.json`, library models OFF vs ON, median ms / draw calls): downtown street 229->71 (first sample warm-up) / 531->1312, downtown air 31->40 / 426->766, Brickell air 32->45 / 348->871, Overtown air 27->37 / 317->944, airport air 23->28 / 222->784, Clewiston street 49->55 / 605->605. Too many draws: fixing now (no mirror variants, 1.5 km cells, no shadow draws for far LOD of low buildings, far LOD baked to ONE material atlas per model).
- 01:05 Committed 9afa612 (fences, roof vents/tanks, utility cabinets, wall detail, load-order-independent picks); next: squatter shacks / booth ruins on vacant lots, fire escapes on brick walk-ups. Lead: my verification tour waited 25 min for a browser slot and timed out (`no free browser slot`), retrying; the 12-minute stale-slot rule also lets long runs lose their slot.
- 00:50 Committed 3623851: 41 more of the user's models converted (`tools/v2/buildings/models.json` + `convert_v2.sh`: meters, ground at 0, front +Z, WebP 1-2K, `_lod1` far LOD, `_col` collision mesh) and placed by `src/world/miami/bldmodels.js`: towers (Hotel 1, Office Buildings 1/11, Buildings 17/18/22/24), mid-rise (Office Buildings 4/5/6/7/9/10, Buildings 23/25/28), shops/roadside (Storefronts 1/2/5/6, Diner 3, Motel 2, Gas Station 1), houses (Buildings 26/27), industry (Factories 1/2, Building 2), hangars (1/2/4), airport (Control Tower 1, Jet Bridge 1). Dropped after checking: Building 21 (interior-only after cleanup), Motel 1 (walls lost), Hangar 3 (broken texture), Gas Station 2 (617k tris, decimation destroys it), Building 19 (scene export, walls tagged as shop stalls), Building 12/20/29 (0.6-1.9M tris), Airport 1 terminal cut (5.7k-tri racing-game blob with a real city name).
- Colliders (lead 00:30): library lots now use each model's own collision mesh (walls, steps, porches, overhangs), not a box; plinth colliders where the lot falls away.
- Per-instance variation: facade shade per instance (instanceColor), mirrored copies of text-free models, shader weathering keyed on the instance (rain streaks, splash-zone dirt, blotches; rust on the rough side), per-building lit-window share/color at night; close-up wall detail from the user's Concrete 3 / Plaster 1 scans on library walls (strongest in the lowest 5 m).
- Rough district (Overtown / Liberty City): rundown/abandoned rule (same hash in bldmodels + families): worn plaster/peeling paint/block walls, grime, window AC units, security bars, roll-down shutters, plywood boarded windows on abandoned buildings (dark at night), rusty metal roofs, graffiti on 75 % of walls, rusty utility cabinets, chain-link fences around vacant lots (instanced, colliders, cut-open panels), library picks favor the gun shop, graffiti shop, fire station, old brick towers, garage rows, factories.
- Airport: synthetic terminal lots (glass curtain wall, deep canopy roof on columns) at x -1480..-1172, z 1010..1070, Control Tower 1 at (-1060, 1075), five jet bridges on the apron face, hangar lots get the user's hangars, runway edge/threshold/approach lights.
- Aerial: house roofs get faded/weathered tile shades; procedural flat roofs get the user's roof vent covers and LPG tanks.
- Waiting for a browser slot to verify (all 3 slots busy with other helpers).
- 00:20 Baseline (before) shots, noon street + aerial + night aerial at 8 places: `docs/v2/shots/stage1/B0_{dt,brick,sobe,havana,overtown,liberty,airport,clew}_{st,air,airn}.png` (review spots: `node tools/v2/buildings/spots.mjs`). Seen: storefront glass reads as flat white panels; aerials are white boxes with orange roofs, Overtown cloned boxes; airport has no buildings at all. (Not mine, for the lead: Little Havana and Clewiston aerials show sea water over the land at 150 m altitude: `B0_havana_air.png`, `B0_clew_air.png`.) First pass shots: `T1_*.png`.

## ground
- **Morning summary.** Changed: the whole map's ground is one blended surface (a hard-surface mask in src/world/ground/
  drives ragged road edges, matched shoulders, mown verges, tree lawns, soft potholes and patches, no plants on paving or under cars;
  Keys lanes are bleached and sandy; turquoise shallows and wet shores; Everglades sawgrass; no sea water inside city blocks; cast-concrete bridges).
  Best before/after sheet: `docs/v2/shots/stage1/GROUNDPASS_keys_ab.png` (also cmp_ground_*.png vs the references). Frame cost: none measured (mask on/off 83.5 / 80.7 ms, loaded machine).
  Curb weeds now register downtown too (267 at 407,-110, was 0; close-up `docs/v2/shots/stage1/GROUNDPASS_curb_weed_downtown.png`).
  Left: the asphalt look belongs to the surfaces helper, tall verge grass cards to vegetation, and the black driveway boxes to the houses helper (see 05:45).
- 05:45 **to lead, re black rectangle in docs/v2/shots/cars/res_res_row1.png: not mine.** It is the driveway "stain" in
  src/world/setpieces/houses/generator.js line ~660 (yard(), houses helper): `if (L0) for (let k = 0; k < 3; k++) box(CONC, 0.4..0.9,
  0.002, 0.3..0.9, ..., { color: 0x4a4640 }, r() * 3)` - three hard-edged flat dark boxes 3 cm above every L0 driveway. Fix for the
  owner: delete that line (keep one `r()` call per removed draw if the rng sequence must stay), or replace it with a soft stain in the
  driveway material. The ground pass's oil decals are road-only (soft, broken, alpha by noise) and never land on driveways.
- 05:35 **tilebuild ready: ground** - one hunk in buildNear's sidewalk loop: `curWeeds` is set right before each synchronous
  sidewalkPoly call and cleared right after (it was set once before the yielding loop, so interleaved tile builds nulled it and
  no curb weeds appeared). No new imports. Tag: "curb-crack weeds collected while this slab is built". (I no longer commit tilebuild.js.)
- 05:00 Elevated / bridges (now mine): the barriers already had a jersey profile; the "flat wall" was the material - a faint
  generic atlas detail on 0.21 vertex albedo. New `src/world/ground/concreteMaterial.js` for every elevated concrete part:
  the user's Concrete 3 scan triplanar (fine pitting + soft tone drift + its normal / roughness), formwork joints every 6 m,
  panel tones, rain-streak grime, tyre spray on the lower barrier, a rubber scuff line 6-25 cm above the deck and drain scuppers
  (barrier faces now carry a height channel from elevated/build.js); undersides / piers / girders at concrete albedo. First
  result `gp16_naples_graze.png` (texture was too coarse -> refined). Reference sheets (target | game):
  `docs/v2/shots/stage1/cmp_ground_{rural,cityblock,downtown,nico_front}.png` - fixed from them: mainland shoulders now a narrow
  crisp gravel strip, then a mown green verge band (ref_57). Remaining gaps vs the refs are lighting / asphalt material (look,
  surfaces helpers) and taller yellow grass cards at rural verges (vegetation). Curb weeds now along every slab curb.
- 04:45 Sea water inside city blocks (lead / buildings): not from the ocean changes (the BLD_dt_air shot at 02:47 predates them) -
  the traced map has small enclosed water specks inside land; they read as open sea (and got a moored boat). `data.js surfCode`:
  water pockets < ~90 m across with land within 72 m in all 8 directions are now land (grass); canals / rivers / lakes stay
  water (they continue in some direction). Verified from 150 m: `docs/v2/shots/stage1/GROUNDPASS_water_pockets.png` (downtown,
  Little Havana with the river, Clewiston). Also in progress: elevated concrete rebuilt (Concrete 3 scan, formwork joints,
  grime, barrier scuff line, scuppers; `src/world/ground/concreteMaterial.js`), curb weeds close-up, reference sheets.
- 04:20 Naples bridge barrier after the albedo change: `gp15_naples_graze.png` - lighter, but still a flat, untextured shaded face
  (the elevated-concrete triplanar detail does not show on it): **for the highways / elevated owner** - check that M.detail is
  applied to `elevated-concrete` and consider a jersey-barrier profile; it is not a seawall. Everything else in my list is done
  and verified (summary below); left: weed tufts verified only in code (no close shot yet), far road field verified from 120 m.
- 03:55 Lead's items: dark oval "splats" on dirt verges = countryside shoulder pebbles / loose rocks with a near-black albedo
  (0.13 x tint 0.6): now pale limestone, smaller, fewer and half buried (`gp13_keys2_side.png`, `gp13_keys2_close.png`); Keys
  shoulders are crushed shell + sand in patches and the dark Keys soil is lifted to limestone gray-beige. (2) beyond 320 m: a
  third, road-graph field (2 km) gives a cheap dusty shoulder on near and LOD terrain. (3) Everglades / Big Cypress districts:
  lawn / scrub cover becomes sawgrass prairie with marsh sloughs, more standing water. (4) sparse weed tufts in curb gutters
  (photographed weed / clump cards). Told "surfaces" how decals and edges sample the asphalt (contract in my message).
  (1) Naples "wall" = the Hibiscus St bridge deck barrier (elevated module, screen pick: `elevated-concrete`), not a seawall:
  its vertex albedo was 0.21 linear, so the shaded face read as flat navy; barriers / walls / fascia now at cast-concrete albedo
  (elevated/build.js COL). Far views with the new glades / far shoulders: `gp14_glades_far.png`, `gp14_glades_low.png`
  (sloughs), `gp14_keys_far.png` (Keys from 120 m: turquoise flats, pale islands).
- 03:40 Final tour with all fixes: `docs/v2/shots/stage1/GROUNDPASS_terrain_aerials.png` and `GROUNDPASS_terrain_grazing.png`
  (aerial + grazing for city lots, park, beach, dunes, Everglades, Big Cypress, farmland, Okeechobee, Naples, Fort Myers, highway,
  causeway, airport, Homestead, Key West, Marathon, Key Largo; Keys at 18:30 and in rain), single shots `gpF_<place>_*.png`.
  No shader errors on any test page. Since then: open-edge break slightly shallower, grainier Keys sand film.
**Summary (03:40, keeps being updated below):** done - (1) road edges crumble into the shoulder (noise-cut asphalt, granular dust,
asphalt crumbs, edge puddles in rain; curbed tree-lawn streets get a granite curb), (2) shoulders / verges / beaches blend
(terrain shoulders tone-matched, dirt band, patchy grass regrowth, city verge lawn + soil lip + mulch rings, wandering land-cover
borders, smooth waterline, foam lace, see-through shallows), (3) potholes = parallax dips with broken rims and rain water,
patches = irregular, color-matched from the road's own asphalt, oil faint, (4) no plants on asphalt / pavement / slabs / drives /
under cars (GPU surface mask), (5) layering: land base cut / depth-biased, seawall coping and straight sand slabs off natural
coasts, terrain lowering removed, dressing driveways drawn into the ground, (6) Keys lanes: no curbs / sidewalks, pale bleached
sandy asphalt with patches and puddles, (7) every terrain type toured (`gp6_*`, `gp10_*`, `gp11_*`, `gp12_*`), plus water
(turquoise shallows) and 2K ground scans / Concrete 3. Perf: mask A/B in one session = no measurable cost.
Key sheets: `docs/v2/shots/stage1/GROUNDPASS_keys_ab.png`, `GROUNDPASS_treelawn_sr1042.png`, `GROUNDPASS_keys_water_aerial.png`.
- 03:20 Water + Nico's shore done: `docs/v2/shots/stage1/GROUNDPASS_keys_water_aerial.png` (turquoise shallows, sand flats and
  seagrass, deep blue offshore; the ocean's shore field now also comes from the water mask, so the Keys / Gulf coasts get
  shallows), `docs/v2/shots/keys/gw4_{dock,docktop}.png` (white beams = tilebuild seawall coping along the cover polygon: gone on
  natural terrain coasts; pale band = land base: cut under full-detail tiles). Lead's bus-shelter dark oval = oil stain decal:
  oil is now faint, broken and half as frequent; potholes / patches all go through the new 3D color-matched decal shader (there is
  no other pothole path left: lane patches were moved to it at 00:40). Commits now `git commit -- <files>` per the new rule.
- 03:00 Keys follow-ups (keys helper + lead): seabed shelf along shores (no 5 m cliff), Keys asphalt bleached pale with sand film
  and lingering low-spot puddles (`docs/v2/shots/keys/gw2_aerial.png`, `gw2_front.png`), Keys grade softened (yards were blown
  out), the pale band + line along Nico's shore = global land base rising above the shore slope: now cut per pixel under
  full-detail tiles; flat set-piece slabs / pads / low decks auto-join the ground mask (lead's fin2: no grass through the slab
  under the stilt house; the black line there is not a road decal - passed to keys). Verifying in `docs/v2/shots/keys/gw3_*.png`.
- 02:40 Lead's Key Largo notes: (4) **confirmed: the roadDecals 'mapTransform' compile error is fixed** (since 00:20; no shader
  errors in any of my test pages since, decals render: `gp7_pothole.png`, `gp8_pothole_rain.png`). (1) shoreline: the straight
  sand slabs + sloped skirts along terrain coasts (tilebuild exitVisuals beach bands, M.sand, orange) are no longer drawn on
  synthetic tiles (colliders kept); the terrain beach does it: irregular waterline (class borders now wander), damp / wet band,
  foam lace at the swash; the ocean's last ~5 m are see-through with a wavering edge. (2) water: nobody owns `src/world/env/ocean.js`
  tonight, so I did it: deep water blue, shallows turquoise / cyan, sand flats and dark seagrass beds showing through the first
  ~70 m, caustic shimmer over sand. (3) Keys ground graded toward pale coral / limestone (off-white, gray-beige, gray-green)
  in the terrain, Nico's yard ground and city land. Verification shots running (`docs/v2/shots/keys/gw1_*.png`).
- 02:30 Perf A/B in one session (s1-perf ABAB, machine heavily loaded by other helpers' runs), ground mask off -> on:
  downtown frame median 83.5 -> 80.7 ms, GPU 47.8 -> 45.1 ms, render CPU 30.1 -> 29.7 ms, draw calls 751 -> 768;
  spawn 139.6 -> 147.9 ms with GPU 42.7 -> 26.5 ms (physics step 65 -> 108 ms dominates there = noise). No measurable cost;
  report `docs/v2/reports/stage1-perf-groundpass-ab.json`.
- 02:20 Lead's tree lawn (State Road 1042, downtown): `docs/v2/shots/stage1/GROUNDPASS_treelawn_sr1042.png` - granite curb at the
  asphalt, trimmed lawn, worn soil along the curb, mulch ring at the palm, no dark stones; soil lip at the paving widened after
  this shot. Rain: `gp8_pothole_rain.png` (water in the pothole, wet road), open rural edge after tuning `gp8_resid_close.png`.
- 02:05 Shots after the fixes: Keys A/B sheet `docs/v2/shots/stage1/GROUNDPASS_keys_ab.png` (left: mask off = old shoulder strips,
  right: on); pothole `gp7_pothole.png` (parallax dip, broken rim, base-course gravel), sealed patch `gp5_patch.png` (color-matched,
  barely-there seam), Keys street `gp7_keys2_side.png` / aerial `gp7_keys_aerial.png`, downtown `gp7_downtown_{close,graze}.png`,
  open rural edge `gp7_resid_close.png` (edge drift was a smooth pale film -> now granular dust, narrower mainland shoulders).
- 01:50 Lead's notes: (1) `roadDecals` 'mapTransform' compile error: that was the first decal shader at ~00:15, fixed at 00:20
  (uv offset via a uniform; mapTransform only in the vertex shader under USE_MAP); every test page since then has no shader
  errors, and decals render: `docs/v2/shots/stage1/gp5_{pothole,pothole_low,patch}.png` (a page loaded before 00:20 would still
  show it - reload). (2) Downtown tree-lawn: the dark blobs are the countryside's loose rocks / shoulder pebbles (flattened dark
  stones scattered at road edges), not decals: hidden near pavement now (mask), pebbles thin out at every road edge. Tree-lawn
  streets get a real granite curb at the asphalt edge (and curb returns at open corners) when the sidewalk is set back; the verge
  between curb and sidewalk is drawn as trimmed lawn (St. Augustine tone) with worn soil patches near the curb, a thin soil lip at
  the paving edge, mulch rings under street / park trees; no rural sand shoulder there. Shots in the next entry.
- 01:35 Terrain tour (aerial + grazing per terrain type, before these fixes): `docs/v2/shots/stage1/gp6_<place>_{aerial,graze}.png`
  for cityLots, park, beach, dunes, everglades, cypress, farm, okeechobee, naples, fortMyers, highway, causeway, airport, homestead,
  keyWest, marathon. Fixed from it: pale saw-tooth triangles along roads (my terrain lowering exposed the land base: removed),
  rust-orange dry grass / soil (straw and soil tints neutralized, scrub / meadow greener), airport edges crumbling next to the
  runways (airfield pavement joins the mask and uses the road asphalt / concrete scans instead of the flat black sets), ramp / deck
  seams (elevated deck asphalt joins the mask), land base 3 cm under the terrain z-fighting far away (depth-biased).
  (Retracted: the "houses drawn 3x" audit finding was a false positive - my ray audit ignored hidden LOD parent groups; the
  keys helper confirmed mid / far / near are exclusive per lot. The audit now skips meshes under hidden groups.)
  Nico's yard details (`nh_detail` weeds 79, strap plants 276, grass 125, palmetto 13 instances) stood on the road carriageway:
  the ground mask now hides them on asphalt (auto-patched at runtime), but the placement itself should skip the road.
- 01:05 Committed 7bf6df8 (surface mask, terrain shoulders, crumbling open edges, decals from the road's own asphalt, 2K scans,
  shoreline). First Keys look `docs/v2/shots/stage1/gp3_keys_{side,aerial,keys2_side}.png`: shoulder too pale / greenish and
  crumbs too big -> retuned (Keys shoulders now the yard's own sand, 5-15 cm asphalt chunks + dust). City open land now uses the
  terrain recipes over the user's scans (`ground/groundMaterial.js patchRecipeGround`), lots / aprons use the user's Concrete 3.
  Test slots are scarce (3 Chromes for ~10 helpers): runs are batched; the probe now has per-step timeouts.
- 00:50 Layer audit (new `src/world/ground/layerAudit.js`, ray grid over the whole scene, `docs/v2/reports/stage1-la1.json`) at Nico's
  street (house duplicate finding later retracted, see 01:35). The pale flat polygons on Keys lots were the world-dressing crushed-shell
  driveway boxes (plaster slab at road height, z-fighting with the asphalt where they touch): now drawn into the ground by the
  terrain shader (surface-mask drive channel, ragged shell edges, a few weeds) - one-line hook in dressing.v2.js, box kept as fallback.
- 00:25 Baseline shots `docs/v2/shots/stage1/gp0_*.png` (Keys close/graze/side/aerial, downtown). Found: lane sealed patches = dark
  rectangles, shoulder = uniform sand strip with a ruled outer edge, beach sand ends in a stair-step triangle edge against the water,
  triangle-shaped class borders, pale flat polygons on Keys lots (being traced with a new layer audit).
- 00:40 In progress (not committed yet): ground surface mask `src/world/ground/surfaceMask.js` (top-down raster of asphalt /
  pavement / cars around the camera, 2 cascades, blurred field) driving terrain shoulders + asphalt crumbs (`ground/groundEdge.js`),
  crumbling open asphalt edges with sand drifts and edge puddles after rain, no plants on hard surfaces or under cars (countryside
  ground cover / shrubs, lawn blades); decals drawn from the road's own asphalt (`ground/decalMaterial.js`): parallax potholes with
  broken rims and rain water, irregular color-matched patches; 2K ground scans + Gravel 1 pebble layer (prep running).

## people
- 04:10 Fixes from the shot review: (1) twins downtown came from copies of a person made while another copy sat
  hidden in the ped pool; the cast now allows exactly one copy of each person (pooled copies count), people for the
  place the player is in load first (2 at a time), archetypes fill in while they load. (2) spikes from a few hands
  (fingertip islands weighted to a foot bone) found by `tools/v2/npcs/weight_audit.py` on all 95 and fixed in the rigger.
  (3) weighted finger joints at the real knuckles (hand frame from the scan, 4 finger lanes + thumb) so cops curl
  their fingers around guns (weapons helper's gunHold.js) and idle hands relax; re-rig of all 95 running.
  (4) shot tool: South Beach on a checked sidewalk, police shot last, wanted cleared before close-ups.
  Shots: 15 people in daylight `docs/v2/shots/people/closeups_0..2.png` (4K close-up textures), mid-stride sheet
  `closeups_3.png`, Key Largo street/close-ups/police `g3_keys_*.png`, downtown sidewalk with 60 people
  `perf_a2_people.png`. Characters 1-2 (lifeguards) are posed scans (hand on hip): not riggable to the T-pose
  skeleton without a manual pass; left out.
- 03:05 **All 95 NPC people rigged and in the crowd** (Models/NPCs 1-95; Character 3 left out because it wears Nico's
  teal palm shirt + cargo pants; Characters 1-2 lifeguards are arms-down scans, need an A-pose pass, open). Re-rig pass
  running (nearest-weight fix for fingertip spikes, skull-base head joint per the player helper, far-crowd palettes,
  brand swooshes erased on p37/p90).
  **Perf, 60 walkers on a downtown sidewalk, ABAB in one session** (`node tools/v2/npcs/crowd-perf.mjs`, report
  `docs/v2/reports/people-perf-a2.json`; machine heavily loaded by other helpers, so absolute ms are high): user's
  people 74.3 ms median frame vs old archetypes 78.2 ms (empty street 60.9); render CPU 24.5 vs 29.8 ms; shadow pass
  1.25 vs 2.52 ms; draw calls 1220 vs 1272. People are as cheap or cheaper (shared clip set, LOD1 5k / LOD2 1.2k, anim
  every 2nd/3rd frame far). Shot: `docs/v2/shots/people/perf_a2_people.png`.
  Also: full-detail people now cast shadows with their 5k LOD1 mesh on a shadow-only layer (A/B `?pshadow=0`);
  venue roles (bartender, server, cashier/clerk, cook, bouncer, maid) map to staff people; lifeguard posts on the sand
  by day and fishermen at moorings; ragdoll takes per-character radii (`character.ragdollRadii`, for Nico).
- 00:45 **Pipeline works end to end**; batch over all 98 people is running (95 Models/NPCs + 3 Models/Characters).
  First person (p07, young man in white tee) on the game's own clips, no hand fixes: idle, walk, run, jog, sit, lean,
  phone, cower all deform cleanly (`src/npc/people/preview.html?ids=p07&pose=walk,run,sitBench,idle&seat=0.45`).
  User update applied: LOD0 = full Tripo mesh (~48k tris, no decimation), LOD1 5k, LOD2 1.2k; full 4K albedo + 2K normal
  streamed in for the 3 people nearest the camera, 2K albedo for the other full-detail people, 1K / 512 crowd set;
  skin/hair/cloth matte (roughness clamped >= 0.62 in the shader, metal only for buckles).
  - **Rig pipeline (shared with the "player" helper):** `tools/v2/npcs/rig_person.py`
    (`blender -b --python-exit-code 1 -P tools/v2/npcs/rig_person.py -- --in <fbx|glb> --id <id> --height <m> [--hat <m>] --out <dir> [--blend 1] [--lods 0,5000,1200]`).
    Landmarks from the T-pose mesh -> 52 joints named like `public/assets/npc/arch/*.glb` (`mixamorig:Hips, Spine, Spine1,
    Spine2, Neck, Head, Left/Right Shoulder|Arm|ForeArm|Hand|Hand{Index,Middle,Ring,Pinky,Thumb}1-3|UpLeg|Leg|Foot|ToeBase`;
    fingers do not deform) -> bone heat on a voxel proxy (10x scale, retries) -> smoothed, max 4 influences, transferred to
    each LOD -> re-posed to the exact canonical T-pose and applied as rest -> GLB (Draco, no images) + meta json.
    Runtime `src/npc/people/lib.js` canonicalize(): identity joint rotations -> ONE clip set (src/npc/arch/anim.js) shared by
    all people (hips translation scaled by hip height): no per-person animation binding cost.
    Batch: `tools/v2/npcs/build.sh [ids]` (cast list with heights/roles `tools/v2/npcs/people.json`), textures
    `tools/v2/npcs/textures.py`, joint plot `tools/v2/npcs/plot_joints.py`, preview shots `node tools/v2/npcs/shots.mjs`.
  - Crowd integration: `src/npc/people/cast.js` (roles -> places, lazy loading, uniqueness: the same person never within
    140 m, height +-3 %, slight tint), hooked into `game.npc.createPed` (archetypes stay as fallback, `?people=0` = off),
    `game.npc.createCop` used by `src/gameplay/police.js` (foot cops + cop drivers), `game.npc.spawnPosed({ place: 'cashier'|
    'kitchen'|'bar'|'hotel'|'lifeguard'|'dock'|... })` gives staff from the user's people.

## weapons
**Summary (06:00):** all 24 user weapon models + the machete are in the game (`public/assets/weapons`, 13 new weapons),
held by Nico with curled fingers, shouldered rifles, two-handed pistols, low ready; GTA-style pickups (real model, rim glow,
glint, no beams); stash/cache crates, first-aid, ammo and armor pickups use the user's models. Cops (re-rigged people with
fingers) aim two-handed with the pistol in the palm, head up on the sights: `docs/v2/shots/weapons/cpE_cop2_aim_side.png`,
`cpE_cop2_aim_front.png` (Nico regression: `cpE_pistol_close.png`, `cpE_rifle_close.png`, `cpE_bat_close.png`).
- 05:55 Lead round 2: user's wooden crate (0.6 m, grounded, fixed collider) for the starter stash and weapon caches
  (`cp5_stash_crate.png`), first-aid + ammo pickups converted from Models/First Aid and Models/Ammo
  (`public/assets/models/pickups`), armor pickup = small user crate (the navy box is gone); cash bills stay code-built (no
  model). Hands: palm normal from handedness, body / head forward from the skinned feet / head geometry, mirrored-name rigs,
  bent elbows, head up along the sights. Cop shots: `cpC_cop2_idle_side.png`, `cpC_cop2_aim_side.png`, `cpC_cop2_aim_front.png`.
- 03:40 Lead's open items done:
  - Cop aiming his service pistol in a two-handed stance: `docs/v2/shots/weapons/fx4_cop_aim.png`.
    Cop holding it at his side: `fx2_cop_idle.png`.
  - Attachments on the real models (suppressor / compensator, red dot / holo, laser beam, light):
    `fx_sheet_attachments.png`.
  - Third-person shots from the street: `fx_sheet_street_tp.png`.
  - Daytime pickups: a small glint every ~2.2 s that grows with distance, plus a slightly larger bob. They read at
    10-15 m and stay subtle up close: `fx4_pickups_12m_3.png`, `fx2_pickups_day.png`.
  - Finger weights: the people helper is adding weighted finger joints to all people rigs, cops included (ETA ~1-1.5 h).
    gunHold.js picks them up automatically: once a rig's finger joints sit more than 4 cm from the wrist, the fingers
    curl around the grip.
  - Commit hygiene: my commit 1d5bdcc4 accidentally swept in the props helper's staged files (street props). They had
    already restored them all in 8c62bdc2 (checked file by file). From now on I commit with `git commit -- <files>`.
- 02:45 **Verified in game, every weapon** (`docs/v2/shots/weapons/fin_sheet_handguns_aim.png`, `fin_sheet_long_aim.png`,
  `fin_sheet_tp.png`, `fin_sheet_melee.png`, `fin_sheet_pickups_cop.png`; studio renders `lib_renders_handguns.png`,
  `lib_renders_rifles.png`, `lib_renders_melee.png`). Pickups: the real model turning ~30 cm above the surface with a
  faint halo and a rim glow that only reads at grazing angles / at night; no beams (fixed: models were offset by their
  world position). Draw calls: a held weapon is 1-8 (procedural ones were 8-20); a pickup is its model + rim shells within
  40 m + halo (the beam is gone). Assets 18.5 MB total, loaded per weapon on demand (pistol + bat preloaded).
  Cop holding his service pistol at his side: `docs/v2/shots/weapons/fin3_cop_idle.png`. Open: cop aim pose is coded
  (same IK as Nico) but not caught on camera yet (the AI stays in 'check' mode in the test); the cop / NPC rigs have no finger weights,
  so their hands stay open on the grip; sniper close-up is the scope view by design.
- 01:55 Hands verified on the new Nico (his rig has finger joints): fingers curl round grips and handguards, rifles at the
  shoulder with the left hand on the handguard, GTA low ready when not aiming, two-handed pistol grip, pistol low at the
  thigh at idle. Asset fixes from Blender studio renders (`tools/v2/weapons/render_sheet.py`): materials had collapsed onto
  one on multi-material guns (LMG was gold, tactical rifle flat), SMG 2 was backwards, more H&K / Desert Eagle engravings
  painted out, baked finishes now land on the right faces (blue stock). Shots: `docs/v2/shots/weapons/t5_rifle_close.png`,
  `t5_rifle_idleclose.png`, `t6_pistol_front.png`, `t6_lmg_idleclose.png`.
- 01:10 **Wired in and running in the game** (commit 8440517): every gun / bat / crowbar key loads the user's model
  (on demand, procedural stand-in for a few frames), 13 new weapons with stats + slots + pickup pools, attachments built
  on the real muzzle / rail points, baked worn finishes for untextured parts (grey pistol, modern rifle body, nails).
  Hands: `src/gameplay/gunHold.js` (2-bone arm IK, hand axes from the skinned hand mesh because the runtime skeleton has
  no finger bones, shouldered long guns, low ready, two-handed pistol grip, support hand on the handguard). Tuning now.
  Shots: `docs/v2/shots/weapons/t4_rifle_idleclose.png`, `t4_rifle_close.png`, `t4_pistol_front.png`.
  **Note for the player helper:** the runtime player / cop skeletons have no finger joints (or fingers carry no weights),
  so fingers cannot curl around a grip; the open hand is laid flat against the grip side. If finger weights can be added,
  gunHold.js curls them automatically (Index/Middle/Ring/Pinky/Thumb 1-3).
- 00:20 **All 24 weapon models (+ the new Machete 1) converted** from Models/Weapons with Blender (`tools/v2/weapons/build.sh`,
  config `weapons.json`, converter `convert.py`, scripts OFF): real scale (pistols 18-27 cm, rifles 88-118 cm, bats 84 cm),
  +Z barrel, origin at the grip, muzzle / eject / sight / left-hand points, slide + magazine nodes (service + heavy pistol),
  1K WebP PBR (base, normal, packed AO/rough/metal), 2-16k tris; brand / serial engravings painted out (USP, Desert Eagle /
  Magnum Research, MK2 / serial, BW-01). `public/assets/weapons/*.glb` + `manifest.json` (13 MB total, loaded on demand).
  Review sheets: `docs/v2/shots/weapons/lib_lab_pistols.png`, `lib_lab_rifles.png`, `lib_lab_melee.png`
  (viewer `src/gameplay/gunLibSheet.html`).
- 00:30 In progress: wiring (gunModels.js LIB table: every gun / bat / crowbar key is a library model; new keys compactpistol,
  slimpistol, chromepistol, snspistol, tacpistol, heavypistol, assaultrifle, specialrifle, tacrifle, battlerifle, lmg, nailbat,
  machete), new hand holding `src/gameplay/gunHold.js` (2-bone arm IK, hand frame from finger bones, finger curl, rifles
  shouldered, low ready, two-handed pistol grip), GTA-style pickups (real model turning above the ground, rim glow, no beams).
  Tiny shared edit: `src/gameplay/police.js` visualUnit calls holdWeapon (3 lines, not committed by me: that file has other
  helpers' changes in it).

## vegetation
**Morning summary.** (1) Every tree and plant is now one of the user's library models (62 conversions, incl. Palm 10 Washingtonia,
Mangrove 2 with stilt roots, Oak 2, Flower 1), with per-tree variation and zone-correct species. Far trees are true tree impostors
(no squares, no crawl). The Keys have a mid layer of hedges, sea grape and broadleaf; airport, lanes and docks stay clear.
(2) Best before/after sheets: `docs/v2/shots/vegetation/overnight/t14_aerial_before_after.png` (far squares -> trees) and
`docs/v2/shots/vegetation/overnight/t14_deck_before_after.png` (poinciana blobs -> scarlet clusters with green leaflets).
(3) Left: city foundation hedges (ref_58) and planters belong to props / buildings; the countryside's longest generation step
(73 ms in one overloaded run, load average ~440) needs a re-measure on an idle machine; the greenery lines in tilebuild.js go in
with the lead's commit.
- 06:05 Poincianas (lead, `k20_r0b_deck.png`): red flower clusters now cover about 60 % of each blooming card, with green leaflets
  between them. The red is a deeper scarlet (0.80, 0.13, 0.08). Bloom cards are 58-68 % of the crown. A quarter of the trees are
  only partly in bloom (45-80 % of their clusters, decided per tree in the shader, world-fixed so it doesn't flicker under TAA).
- 05:35 Mangroves only on salt shores (the Keys, the Everglades coast, Florida Bay). Before this, 4 stood floating on a
  freshwater lake at Clewiston. t13 shots: `t13_mangrove_close.png` (Mangrove Tree 2 stilt roots in the shallows),
  `t13_mangrove_air.png`, `t13_rural_air.png`. The "rural_road" spot landed in Clewiston town (`t13_rural_road.png`).
  Audits: 0 floating, 0 on a road, 0 in a solid after the fix. Note: the countryside's longest single generation step rose to
  73 ms in this run (was 12-25). A spawn probe is running to check whether it is the post-teleport fill or a real hitch.
- 05:10 **Airport cleared**: no plants on apron, runway, taxiway, parking, paved or plaza cover anywhere (cover class from
  `data.coverAt`). Inside the airport zone, nothing grows within 320 m of a runway centerline (layout.json runways), and the rest
  is limited to landscaping strips 3-18 m off the terminal roads. Shots: `t12_airport_air.png`, `t12_airport_front.png`
  (19 trees, all by the terminal roads). Tilebuild street trees, shrubs and palms are now rejected in road lanes too
  (`roadDist`; the lead commits tilebuild.js). Lane scan afterwards: none at Pelican Point Ln, downtown or the airport.
- 05:10 **Unused library models in.** Palm Tree 10 (Washingtonia): its 8 unlinked "Palm Part" materials were matched to the
  texture sets from the part geometry (`tools/v2/vegetation/matparts.py`): trunk, petioles 1-3, fan leaves, fiber skirt, dry
  petiole bases. It joins the residential / nightlife / midtown palm mixes, the Keys and parks. Mangrove Tree 2 keeps its stilt
  roots at a 36k bark budget (the earlier break came from decimation) and is 1 in 3 shore mangroves. Oak Tree 2: rural roadside
  rows. Flower 1 (wild geranium): yard beds and wildflowers at tree bases. Rural roads (ref_57): denser, sunnier broadleaf
  lines (roadside rows 0.4 -> 0.55, density 0.24 -> 0.32, warmer brighter crown tint).
- 04:30 Heads-up (not vegetation): the t11 / t11b runs hit 24-40 s single frames at the Keys yard / street, plus a shader
  validate error `'uLookV' : undeclared identifier` from the uncommitted `src/render/look3.js` / `src/world/env/fogChunks.js`
  work. Vegetation's own work in the same runs stays small: countryside gen avg 0.6 ms, max 25 ms. Two tilebuild lines of mine
  are still uncommitted because the file holds other helpers' shops / surfaces work in progress: TREE_LIB seagrape -> rubber
  fig, and BUSH_LIB blob bush_leafy -> green_shrub. The next committer of the file should include them (props has the
  `if (p.broken) continue;` hydrant guard pending there too).
- 04:10 **Plants in lanes, by owner** (`tools/v2/vegetation/onroad.mjs r x,z ...`: every instanced mesh with instances inside
  a road ribbon). Pelican Point Ln (Nico's): **keys / nicoHouse** `nh_detail/weeds` x108, `plants:straps` x276,
  `plants:grass` x125, `plants:palmetto` (already ground-mask patched; the lane is likely missing from the mask there).
  **Vegetation**: 1 coconut and 1 hibiscus from `game.vegetation.place()`, fixed: place() now refuses a point inside a lane
  (`onRoad: true` forces it; skips are listed in `game.vegetation.placeSkipped`). Downtown (407,-110), Little Havana,
  Homestead, the Everglades road and the Key Largo highway: no vegetation layer in a lane. The only hits there are
  non-plant meshes (lamp pools, npc crowd, unnamed parentless MeshStandardMaterial meshes).
- 04:10 Blocky bush: the library's Shrub 6 "low-poly leafy bush" (334 tris) is out of the hedges, the mid layer and the
  city sea grape. Mid layer / tall sea grape: rubber fig (12k tris) at 2.3-3.8 m. Hedges: the round shrub plus
  `green_shrub`, a new conversion of Flower 2 with the flowers dropped (15k tris). Shots: `t11_keys_yard.png`,
  `t11_keys_street.png`, `t11_keys_air.png`.
- 03:35 **Far squares fixed (lead's k7_r5_aerial).** They were my impostors: hiding them at that camera removed every
  square, and forcing no-mip filtering turned them back into trees. Two causes. (1) The bake is one short, wide strip
  (2048 x ~150-600), so the box-filtered mips averaged a whole view column into one half-alpha texel. (2) The per-pixel
  dither between two views jumped the uv between views, so the GPU picked the coarsest mip. Now (`models.js`
  `impostorMips`, `materials.js`): views go in a 4 x 2 atlas of power-of-two tiles (128 px trees, 64 px shrubs), the mip
  chain is built by hand and stops at 2 texels per tile (views never bleed), alpha is scaled per tile and level so the
  0.5-test coverage matches level 0, transparent texels are push-pull filled with the nearest color (no dark rims), and
  sampling uses `textureGrad` from the continuous uv. Mip build: 8-50 ms per model once warm. Pan test
  (`tools/v2/vegetation/pan.mjs` + `pan_metric.py`, slow yaw over the far shore, sparkle = frame-to-frame Laplacian
  change after alignment): new impostors 10.0, no-mip impostors 11.8, impostors hidden 12.4 (the game clock and the water
  moved on between the three passes, so only the order means much). Crops: no rectangles, steady silhouettes.
  Shots: `t10_keys_air.png`, `t10_homestead_air.png` (mainland suburb: distant forest reads as trees).
- 03:35 **Keys mid layer.** Hedge, sea grape and flowering-shrub runs along the side and back lot lines (0.7-1.1 m inside the
  fences, broken into runs). Taller sea grape clumps (2.5-3 m) stand in the runs. Lots get up to 5 trees, mostly sea
  grape, gumbo limbo and buttonwood. The Keys biome and the sandy lots are evenly wooded (no longer only in grove
  patches). Poincianas went from about 1 in 5 trees to about 1 in 30. Audit: Keys 324 trees in view (was 221), 0
  floating, on road or in solids. Shots: `t9_keys_yard.png`, `t10_keys_air.png`.
- 03:35 Street palms in paving (sidewalks, plazas): the root flare is pulled into the trunk with only a slight collar
  bulge, the base sinks less, and a cast-iron grate goes under every palm in paving (also plaza palms that are not
  curbside). Root flares stay in soil, lawn and sand. Shot: `t10_downtown.png`, `t10_havana.png`.
- 02:15 Commits 54ec63e + 810d62f: city parks / big lawns now get shade-tree and palm groves (the South Beach park lawn was
  empty in `t6_southbeach.png`), contact darkening at trunk bases (the royal palm root flare read as white hair in
  `t6_grate_close.png`, the new cast-iron tree grate is visible there), darker royal trunks. t7 re-shoot queued.
  Note: HEAD tilebuild.js briefly did not parse after 3d15af2 (props); fixed by the next props commit.
- 02:02 t6 tour (fixed code): Keys yard `docs/v2/shots/vegetation/overnight/t6_keys_yard.png`, Keys street `t6_keys_street.png`,
  shore aerial with mangroves `t6_mangrove_air.png`, `place()` test (poinciana, bougainvillea x2, hibiscus, bent coconut, agave,
  potted ficus placed by the API) `t6_place_test.png`. Audit at the Keys spots: 159-221 countryside trees within 220 m,
  0 on roads, 0 in docks/decks, 1 mangrove 0.11 m high (fixed in 5647345). Countryside: ~200 draw calls, cell generation
  0.47 ms avg / 8 ms max, rebucket 1.0 ms.
- 01:59 Lead: the long test-page stalls are not JS: a native sample of a stalled renderer's main thread (my t5 page) shows it
  waiting in `mach_msg` on the GPU process (synchronous GL call while MTLCompilerService is pegged by ~10 headless Chromes
  compiling shaders). Same pattern in keys k5. Not something one helper can fix; fewer parallel browsers would help.
- 01:52 Bug found by the new placement audit and fixed (00ff760): the dock / deck ray check took the tiles' trunk collider
  prisms (4-5 m) for docks, so countryside trees near the player vanished once their colliders streamed in (since ~00:50).
  Now only 0.3-2.6 m high surfaces block. Audit at the Keys house before the fix: 66 trees, 0 floating, 0 on roads.
- 01:48 Lead / props: commit 606790d (street props pass 2) reverted my f919942 changes in `src/world/vegetation/countryside.js`,
  `tools/v2/vegetation/hangtest.mjs`, `tools/v2/vegetation/shots.mjs` (stale entries in the shared git index). Restored in
  f57d201. I now commit through a private index (`GIT_INDEX_FILE`, `commit-tree`, `update-ref` with the old value) and
  re-sync the shared index for my paths afterwards; suggest the same for everyone.
- 01:47 Same run, `?veglib=0` (procedural plants) for comparison: 10-19 fps, page answers 0.07-3.6 s after teleports; with the
  library: 10-23 fps, 0.14-0.65 s. On this loaded machine the library costs nothing measurable.
- 01:45 Commit f919942: stall finder with the library plants on (`tools/v2/vegetation/hangtest.mjs`): the page answers in
  0.14-0.65 s after each teleport (Keys house, Overseas Hwy, downtown), the countryside ring is complete ~12 s after a jump
  (1281 pending cells -> 0; streaming budget 6 ms/frame while > 150 cells are pending), 10-23 fps on the loaded machine.
- 01:36 Browser queue: 24 test scripts waiting for 3 slots; my stall finder and the t5 tour (grate close-up, park, beach,
  mangroves, place() test, audit) are queued. Done so far (all committed): 1 conversion of every usable library plant (51 models,
  LOD0/LOD1, impostors, palette), 2 per-instance variation in the shader, 3 grounding (footprint min, sink, mangroves in the
  shallow fringe, no docks), 4 placement by zone (royal boulevards, coconut/bent palms on beaches + Keys, mangroves + sea grape
  on shores, live oak / banyan in old neighborhoods, pines + cypress inland, understory, yard trees, flowering shrubs by
  houses, grates only on city sidewalks), 5 perf (instanced per model + LOD band, impostors far, paced load, ray checks
  near the camera only), 6 shots (t3 set + sheets). API `game.vegetation.place / block / audit`.
- 01:31 Lead: test pages teleported to the Keys house stop answering (main thread busy for minutes): seen in my tours and right
  now in keys `shots.mjs --set k5` (port 61524, `Runtime.evaluate` times out). Spawn without teleport is fine (CPU profile above).
  Vegetation side checked: placeTrees + yard trees run in node on 100 cells / 400 lots in 210 ms (terminates, ~2 ms/cell);
  `tools/v2/vegetation/hangtest.mjs` (A/B library vs `?veglib=0`, teleports with response times) is queued for a slot.
- 01:20 CPU profile after the perf fix (8 s at the spawn, `tools/v2/vegetation/cpuprof.mjs`): vegetation streamer `rebucket`
  100 ms + `work` 81 ms of 9254 ms sampled (~2 %); physics wasm, three.js culling / matrices and `sliverLand` (data.js)
  dominate. Spawn frame 49.5 ms / 753 draws on the loaded machine (load avg ~30-56).
- 01:17 Lead / all: if your test runs stalled after READY between ~00:45 and 01:14 (teleports / title cuts taking very long), the
  vegetation streamer's new collider ray checks + 4 s synchronous fill were a likely cause; fixed in 3d77633. Palette proof:
  `docs/v2/shots/vegetation/overnight/lib_leaf_palette.png` (every converted leaf texture after grading).
- 01:15 Commit 3d77633 (perf): after READY the page could stall for minutes in tests. Cause candidates on my side: the new
  collider ray checks ran for every tree / shrub of every generated cell, and a camera jump (teleport, title cinematic cuts)
  filled all cells to 1.3 km synchronously for up to 4 s. Now: ray checks only within 260 m of the camera, base tufts skip
  them, lots planted once per cell, a jump fills only the near 360 m at once (<= 1.5 s), the rest streams in. Verifying
  with a CPU profile (`tools/v2/vegetation/cpuprof.mjs`, queued for a browser slot).
- 01:10 Commit 2f23cb6: paced model load verified in a boot probe (53 models + impostor bakes in 821 ms after the prefetched
  GLBs, READY 34 s on a machine with load average 56). Per-instance variation proof `lib_variation_rows.png` (5 of the same
  model in a row: different lean, twist, crown spread, frond droop, color). Frame-time tests are queued behind other helpers'
  browser runs (3 shared slots, machine load avg ~56): numbers so far are noisy.
- 01:06 Boot cost found (loaded machine, separate runs): READY 40.5 s / worst task 3.0 s with the library vs 22.2 s / 0.66 s
  with `?veglib=0` (miami stage 10.5 vs 5.0 s, shaders+warm-up 13.1 vs 6.6 s). Fixing now: model processing paced one model
  per task (merge, texture upload via initTexturesSliced, impostor bake), impostor MSAA buffers freed after the bake (~32 MB
  each, ~1.5 GB for 50 models), source GLTF geometry released, GLBs prefetched at module load. Also: yard trees in house lots
  (back corners / side yards, 1.3 m in from the lot line: poinciana, gumbo, palms, rubber fig in the Keys; live oak / shade
  mainland), added to existing cells when lots are planned later (no regeneration blink).
- 01:00 Commit 6748108 (pass 2): all placed trees now library models incl. bald cypress (library pines regraded) and three
  poinciana variants; Mangrove Tree 2 dropped (roots broke in decimation, white trunk), mangroves = Mangrove Tree 1 in clumps of
  3-5 on the shallow shore fringe only (roots into water + mud, never in deep water or on docks: ray check against static
  colliders). Palette after grading: every leaf texture within hue 75-93 deg / sat 0.42-0.55 / value 0.34-0.46 (report.json
  'after'); dry palms / dry grass / agave deliberately outside. Frame time A/B in one run (library vs `?veglib=0`, machine
  loaded by other helpers, noisy): Keys aerial 44.5 vs 41.3 ms (943 vs 828 draws), Keys street 39.0 vs 33.0 ms (784 vs 698),
  shore 39.4 vs 41.4 ms (709 vs 619). Boot READY 40.5 s with the library (loaded machine); `?veglib=0` run queued. GLBs now
  prefetched at module load to overlap terrain boot.
- 00:50 **In game (commit 3b69955):** Keys street with red poincianas, bougainvillea, coconut / weathered palms
  `docs/v2/shots/vegetation/overnight/t3_keys_street.png`, yard `t3_keys_yard.png`, aerial `t3_keys_air.png`, hammock
  understory `t3_everglades.png`, prairie aerial `t3_everglades_air.png`, downtown royal palms `t3_downtown.png`.
  Library sheets: `lib_palms.png`, `lib_trees.png`, `lib_plants.png`. Frame time at the Keys yard 17 ms / 415 draws, Keys street
  16.6 ms (shared machine). Since then: mangrove clumps in the shallows (stilt-root model in front, dense crowns behind),
  flowering shrubs only near houses (were scattered on empty highway verges), moss mounds + grass tufts at trunk bases in
  hammocks / swamps, sea oats from the library dry grass, residential street shade trees (live oak / banyan in old
  neighborhoods, gumbo / poinciana elsewhere), radial crown normals (no black inward-facing leaf cards).
- **API for keys / set pieces:** `game.vegetation.place(kind, x, z, { ry, s, y, model, keepY })` -> `{ remove() }`. kind = species
  group (`royal, coconut, coconut_bent, date, queen, sabal, palm_mix, banyan, liveoak, oak, buttonwood, shade, gumbo, poinciana,
  mangrove, pine, hedge, shrub, seagrape, bougainvillea, hibiscus, oleander, flowers, fern, agave, red_grass, tropical_bed, potted,
  grass_tuft`) or a model key from `src/world/vegetation/species.js` (e.g. `poinciana`, `bent_c`, `potted_ficus`). Placed plants are
  grounded (lowest ground under the footprint, base sunk a little; give `keepY: true` + `y` for planters / decks), batched into one
  instanced field per model. `game.vegetation.block(x, z, r)` or `block({ x0, z0, x1, z1 })`: nothing grows there (docks, pads);
  plants also never stand where a static collider sits above the ground (docks, decks, piers), checked by a ray per tree / shrub.
- 00:40 **All trees / plants now come from the user's Models/Trees + Models/Plants.** New pipeline `tools/v2/vegetation/`
  (`build.sh`, `convert.py`, `species.json`; Blender 5.2 headless, `--factory-startup --disable-autoexec`, scripts in the .blend
  never run): 49 models -> `public/assets/models/vegetation/<key>.glb` (LOD0, WebP textures) + `<key>_lod1.glb`, meters, base
  at the origin, multi-tree files split into variants (oak trio, coconut trio, 5 bent palms, 2 weathered palms, 3 pines,
  2 pale oaks, 3 ferns, 2 flower bushes), leaf cards thinned (whole cards dropped, kept cards grown), bark decimated / twigs
  pruned, alpha bled into transparent texels (no halos), every texture HSV-graded toward one palette (green texels only:
  bark, flowers, fruit keep their colors). Recolors: poinciana (red bloom on 70 % of the gnarled oak's leaf cards),
  bougainvillea (magenta) and hibiscus (red) blooms on the library bushes. Report: `tools/v2/vegetation/report.json`.
  Sheets: `docs/v2/shots/vegetation/overnight/lib_*.png` (coming). Shader (`materials.js`): per-instance mirror, trunk twist,
  S-bend, crown spread, frond droop, hue / saturation / brightness jitter, impostors mirrored to match.
- Not usable / left out: Palm Tree 10 (textures not linked in the file), Oak Tree 2 (flat-card low quality), Rubber Fig
  (leaves render black, kept in the registry hidden), Red Mangrove 2's stilt roots (break when decimated: its crown is used
  as buttonwood; the mangroves are Mangrove Tree 1 with stilt roots), Flower 1 (single stem), the Tree Pack background cards.
  Cypress has no library model: still procedural. Grass Clump 1 is used as tufts around tree bases; Moss 1 not yet.

## player
**Morning summary (06:00):**
1. **Nico is now the user's own model** (Models/Main Character 1), rigged with real finger joints. Feet sit within about 2 mm of the ground on stairs, curbs, the deck, the dock and slopes. Planted feet barely slide (walk 0.03 m/s, sprint 0.09 m/s). Hit zones are fitted to each body. GTA-style ragdoll on car hits, death, long falls and blasts, then a get-up; vault over low walls and fences; sprint stamina; camera that avoids cars and low beams. `?nico=old` rolls back.
2. **Car-hood launch**: I could not reproduce it by standing on, walking across, dropping off or sprinting into parked cars (`node tools/v2/player/cartest.mjs`: no hits, top player speed 1.85 m/s, no launches). Its likely cause was the vault: the collider was off for the hop and it went through a parked car, possibly an asleep one whose collider is off. Fixes: vaults never go through cars; jump climbs onto awake cars only; a car counts as hitting Nico only if it really travels toward him (never when he stands on it); and cars he pushes only budge (sprinting into a coupe had shoved it at 2.9 m/s).
3. Open, not verified: (a) sprint stamina now reads the needs system's `P.stamina` (0-100, which drains only while actually sprinting above 4.5 m/s). My first version had overwritten it. The 06:00 probe got blocked by a wall after 5 s, so the winded cut-off was never reached. (b) The tall-pickup seat: the head-under-roof lowering is capped at 25 cm. The outside-window shot (`t5_car_truck.png`) does not show him through the tinted glass. (c) The re-run of the car test after the 06:00 push cap timed out on the busy machine. Fixes up to 05:45 were verified by `player-cartest-c3.json`: no hits, no launches.
- 05:00 Third pass.
  - **Jog** house course: 14 of 14 waypoints, foot error median 2.3 mm (95th percentile 1.9 cm), stuck 0.07 s.
  - **Explosion** (a real blast through the weapons module, 2.6 m away): ragdoll, get-up 2.6 s later, back in control at 5.3 s.
  - **Death**: lethal ragdoll, stays down under the game's death screen; the respawn hands control back (health 100, `ui.dead` false). Shots `r5_death_1_down.jpg`, `r5_blast_*`.
  - **Pivot at speed** (W then S at run speed): heading turns 150 degrees in about 0.45 s while speed drops from 4.2 to 1.2 m/s, then he accelerates out (the controller's existing plant-and-pivot plus turn-in-place). The planted feet hold through it.
  - **Sprint stamina**: about 14 s of sprint; when empty he drops to a run until 25 % is back (about 6 s standing, 9 s moving).
  - **Vault** (`src/player/vault.v2.js`): jump while moving at a wall, fence, rail or ledge 0.5 - 1.2 m high -> a scripted hop over it with a landing check, or a climb onto it when there is no room behind.
  - **Car seat**: a tall driver is lowered until his head clears the roof. Shots `docs/v2/shots/player/SHEET_feel.png` (car window and chase cam, vault, pivot, blast, death).
- 04:30 **Second pass done.** (1) **Player ragdoll** (`src/player/ragdoll.v2.js`). It uses the active ragdoll fitted to Nico, in these cases: a car hit above 15 km/h, death, a fall over 4 m (with fall damage), and an explosion inside 80 % of its radius. While ragdolled, the capsule follows the pelvis and the camera follows. Alive, once the body lies still he blends into the get-up clip (face up or face down) and control returns about 2.5 s later; dead, he stays down until the respawn. Test `node tools/v2/player/ragtest.mjs` (`docs/v2/reports/player-rag-r4.json`, `player-rag-r3.json`). Car at 32 km/h: thrown over the hood, get-up 2.8 s later, back in control at 5.4 s. 7 m fall beside the deck: 30 damage, get-up 2.2 s later, back in control at 4.8 s. Sheet `docs/v2/shots/player/SHEET_ragdoll.png`. (2) `gameplay.js` teleport now uses `game.player.capsule`. (3) Keys exported `game.nicoHouse.stairs`, and the IK uses it. (4) **Foot slide**: stance foot locking in the IK (sole vertices touching the ground keep their world spot; this also covers turning in place), and the gait cycle advances by the real ground speed with stride measured per clip on Nico's rig. Median planted-sole slide: walk 0.14 -> 0.03 m/s, jog / sprint 1.0 -> 0.09 m/s (`docs/v2/reports/player-walk-w12.json`). Foot error is unchanged (median 2.0 mm on the house course).
- 04:00 Polish pass. **Gait speed** is now measured on Nico's own rig: walk 1.50 m/s, run 3.09, sprint 3.75 (the retarget estimate was 1.36 / 3.09 / 3.90). Planted-sole slide at walk, measured on sole vertices that touch the ground and including the corners of the course, dropped from 0.16 to 0.14 m/s. **Wall test**: walking into a wide wall stops dead, with no pass-through and 0.5 mm of jitter while pushing (`docs/v2/reports/player-walk-w11.json`). Final review sheets: `docs/v2/shots/player/SHEET_final_a.png`, `SHEET_final_b.png`, `compare_preview.png`. Commits from now on use `git commit -- <files>` (my c16cbd80 had swept other helpers' staged files; the props helper had already restored them, and the lead knows).
- 03:35 **Status: Job 1 and Job 2 done, polish pass running.** Review sheets: `docs/v2/shots/player/SHEET_final_a.png` (front, side, back, face, walk, run, sprint, jump, landing) and `SHEET_final_b.png` (aim, car seat, ragdoll, hit-zone overlay front and side, disguise recolor, camera with a car close by, camera under the stilt house). The user's Preview next to the game: `compare_preview.png`. Old Nico (before): `before_side.png`, `before_face.png`.
  - Walk test (`docs/v2/reports/player-walk-w8.json`), feet measured on the skinned shoe soles. House course (yard, both stair flights, deck, bay stair, dock head, 14 of 14 waypoints): median 2.6 mm, 95th percentile 4.2 cm, stuck 0.07 s. Curb 0.15 m: median 1.8 mm, max 3.3 cm. Beach slope: median 9.6 mm, max 1.8 cm. Jog: house median 2.7 mm, curb median 1.2 mm.
  - Camera (lead's request): cars between the camera and Nico pull it in, then it eases out. Under the house's low beams it drops and levels. The shoulder offset shrinks next to walls and piles.
  - Wardrobe on the new body: every piece is tracked as before (saved outfits, police description, disguises, `outfit:changed` events). The signature pieces show the baked clothes. Other tops, bottoms and shoes recolor the baked shirt, pants and shoes through a region mask, so the color and the disguise read correctly but the cut stays: shorts show as recolored pants. Watch and chain are logical only. Nothing can throw.
  - Rollback: `?nico=old` loads the pipeline Nico.
  - Coordination: the people helper added `character.ragdollRadii` to ragdoll.js (Nico sets it) and lowered the crowd head joint after my note. `src/main.js` edits (player section only): capsule constants, car seat, camera. `src/player/nico.v2.js` had replaced `game.player.body` (the rigid body) with a fat/muscle object, which broke `.translation()` callers such as the interiors and ragdolls. Fixed.
- 03:05 **Hit zones fitted per character**: each body's zones are measured once on its own skinned mesh (limb radii, a torso oval centered on the flesh rather than the spine line, the head sphere on the head). Accuracy check `node tools/v2/player/hitcheck.mjs` (a ray grid compared with the visible mesh): rays aimed at Nico's body hit a zone 99.4 % front and 97.6 % side; NPCs 95-99 %. Debug overlay shots: `docs/v2/shots/player/w7_hitzones_side.png`, `w6_hitzones.png`. **Camera** (lead's request): cars between the camera and Nico now pull the camera in (sphere cast against vehicle hulls, then it eases out); under-house shots are running. Wardrobe recolor mask fixed (it was V-flipped), disguise shot `w7_disguise.png`. Car seat `w7_car.png`, ragdoll `w7_ragdoll.png`, aim `w7_aim_q.png`.
- 02:15 **Walk test** (`node tools/v2/player/walktest.mjs`, report `docs/v2/reports/player-walk-w5.json`). Course: yard, up both flights of the west stair, along the deck, down the bay stair, out the dock to its head; all 14 waypoints reached. Foot-to-ground error is measured on the skinned shoe soles (planted feet): mean 6.5 mm, median 2.6 mm, 95th percentile 3.0 cm, max 12.8 cm (on a stair edge). Stuck time 0.07 s, no fall-through. Jog: median 2.5 mm, 95th percentile 4.4 cm. Curb (0.15 m) jog: median 2.5 mm, max 1.4 cm. Shots: `docs/v2/shots/player/w5_house_walk_0.png` (stairs), `w5_house_walk_2.png` (deck), `w5_house_walk_4.png` (dock), `w5_front.png`. Two bugs fixed on the way: the IK target vector was overwritten inside the solver (one leg swung out), and on a still pose the mixer skips bones, so post layers stacked frame after frame (legs folding). Now every bone goes back to its animated value before the layers run.
- 01:05 Real finger joints found on the scan (separate fingers, the curl and fist check renders clean), so gun grips and relaxed hands deform now. Player capsule fitted to the body: radius 0.28 m, top at 1.80 m (was 0.32 x 1.74 m). Hit zones rewritten (src/gameplay/hitZones.js): radii fitted on this mesh, scaled per character from its own bones, an oval torso (two capsules), hands and feet covered, a head sphere that follows each rig's head joint, and a debug overlay `hitZoneDebug(game, chars)`. Foot IK: pelvis drops, the legs bend to the real ground, feet land on stair treads (not the ramp collider), planted feet tilt to slopes. Nico now sits visibly in the driver's seat of cars (he was hidden before). The camera follows the smoothed ground height (no jolt on curbs or steps). Before shots of the old Nico: `docs/v2/shots/player/before_side.png`, `before_face.png`. The walk test and the full shot set are queued (3 browser slots are shared by all helpers).
- 00:50 **Nico is now the user's own model** (Models/Main Character 1, Tripo; folder 2 is byte-identical geometry and textures, so folder 1 is used). Rigged onto the game skeleton (52 Mixamo-named joints, bone-heat weights, LOD 95k / 24k / 7k tris), 4K albedo + normal + matte roughness, 1.83 m. Every existing clip retargets onto it at load. `?nico=old` = pipeline Nico. Build: `tools/v2/player/build.sh`. Shots: `docs/v2/shots/player/t1_face.png`, `t1_side.png`, `t1_walk.png`. Next: clear test spot, hit zones, capsule, foot IK test.

## surfaces
**Morning summary (surfaces):** every paved road now has visible aggregate up close, tar crack-sealer, sealed paving joints, tire tracks and oil drip lines in the lanes, and per-street / per-section age (bleached old pavement vs dark overlays). Curbed streets get a concrete gutter pan. Rain puddles collect in ruts and gutters.
Paint is chipped and worn in the wheel paths. Sidewalks get per-slab tone, stains, gum and cracked or lifted slabs. Curbs have grime, scuffs and red / yellow runs. Crosswalks are ladder downtown, continental bars on business / beach streets, two lines elsewhere. A/B in one session: `window.__surfaces.set(false)`; `?surfaces=0`.
Best sheets: `docs/v2/shots/surfaces/SURF_closeups.png` (before | after), `SURF_grazing_11_1830_rain.png`, `SURF_t4_misc.png`; no shader errors, no measurable fps cost in same-session A/B.
- 06:15 Final report. Commits: 20647bb9 (modules + materials.js hook + tools), wet-response / tuning commit after it; tilebuild hunks
  (channel attach, setRoad, M.roadLane, crosswalk style by zone, all behind `?surfaces=0`) went in with the lead's tilebuild commits.
  New sheets: `docs/v2/shots/surfaces/SURF_crosswalks_keys.png` (residential continental bars with chipped / wheel-worn paint, Homestead
  two-line crosswalks, Keys lane), `SURF_t4_misc.png` (rural town street with gutter pan, Homestead sidewalk slabs + curb, rain, downtown).
  Wet (look helper's request): asphalt ~0.35 roughness when wet, wheel paths / tar ~0.11, puddles 0.04 in ruts / gutters / low edges.
  Checks: no shader errors in any run (only favicon 404); still-camera diffs on pavement-only views 0.07-0.7 % pixels > 12 levels
  (larger values = moving cars / NPCs / cloud shadows, checked in diff images); same-session A/B frame time within noise.
  Open / not done: driveway aprons (house generator owns them), per-paver variation on downtown plazas beyond stains / gum, one
  downtown signalized junction (node 1163) shows no crosswalk (L.cw null there: not urban-zoned or clipped by cwFree; not from this pass),
  first-spot load hitches seen in runs (9-38 s single frames right after teleport while tiles stream: not attributed to this pass, but
  the bigger asphalt shader adds compile time: worth a precompile check). The 06:20 run was stopped before the Keys / highway aerials
  (slot queue); the earlier Keys aerial A/B is in `t3_keys_aerial_{off,on}.png`.
- 05:40 Committed the modules (`Surfaces: asphalt / paint / sidewalk shader pass`); tilebuild hunks handed to the lead ("tilebuild ready:
  surfaces"). Sheets: `docs/v2/shots/surfaces/SURF_grazing_11_1830_rain.png` (downtown 11:00 / 18:30 / rain + Keys rain, before | after),
  `SURF_closeups.png` (standing-height close-ups downtown / residential / Keys / rain). Tuning since: tar sealant satin (was a bright sky line
  at grazing), Keys lanes lighter tire tracks that fade in and out along the street, no lane-joint seam on narrow lanes, fewer / subtler gum
  spots. Aerials (new framing, 70 m) + crosswalk junction views running.
- 04:50 First A/B in one session (`window.__surfaces.set(false/true)`): `docs/v2/shots/surfaces/t2_<spot>_{off,on}.png` (downtown stand / close /
  walk / graze / aerial, residential, Keys, rural). Asphalt now: two-layer stochastic scan sampling (no 3.2 m repeat), limestone aggregate at
  close range (faded by pixel size), tar crack-sealer snakes + sealed lane-joint seams + transverse / longitudinal cracks, alligator
  cracking in old wheel paths, tire-track darkening + polish, oil drip line, per-street / per-section age (bleached old vs dark overlays,
  construction seams), concrete gutter pan (user's Concrete 3) on curbed streets, rain puddles steered into ruts / gutters / low edges.
  Paint: chipped (asphalt shows), worn in wheel paths, dirt-darkened, thermoplastic rim. Sidewalks: per-slab tone on the scan's own joints,
  stains, gum, cracked / lifted slabs; curb faces: grime, scuffs, red / yellow runs; tactile domes on ramp pads. Crosswalks by area:
  ladder downtown, continental on business / beach streets, two lines elsewhere. Perf A/B same session: no measurable cost (e.g. downtown
  stand 61.9 -> 54.8 ms, walk 40.2 -> 38.5 ms; machine loaded). Console: no shader errors. Still-camera diff (`tools/v2/surfaces/still_diff.py`):
  pavement-only spots 0.07-0.6 % pixels > 12 levels (moving cars / cloud shadows explain the rest). Tuning round 2 + dusk / rain / aerial set running.
- 04:10 Started (paved surfaces map-wide: asphalt, paint, sidewalks / curbs). New module `src/world/surfaces/` (roadChannel.js = per-vertex
  lane frame for road ribbons / paint / decals; surfaceShaders.js = asphalt / paint / sidewalk shader patches chained after the ground
  pass's groundWear + groundEdge), 3 small hooks in tilebuild (channel attach, setRoad per road, M.roadLane on the ribbon mesh) and one
  in materials.js. A/B in one session: `window.__surfaces.set(false)`; `?surfaces=0` = off. Shots: `tools/v2/surfaces/shots.mjs` ->
  `docs/v2/shots/surfaces/`. First A/B run in progress.

## shops
**Morning summary (shops):** every shop now faces its street over paving (forecourt or walk + striped parking with wheel stops; 608 lawn-front lots fixed),
storefronts have depth, 3D scalloped awnings, lit brand / blade signs, posters, OPEN neon, shutters, and the toy legacy interiors are replaced by the V2 kit
for clothing, pharmacy, liquor and the 1588 office / bank lots (draped garments, sneakers, painted rooms behind far windows). Best sheet: `docs/v2/shots/shops/sheet_ftm_clothes.png`.
- 05:45 Pass 2: office / agency / bank storefronts (1588 of the 4527 lots were `office`, all legacy rooms) now use the V2 lobby kit
  with their own names + office hours (`A5_preview_office_street.png`); sneaker walls show side-on sneakers; tile-shell awnings on shop
  lots hang just over the glass so the V2 sign band reads above them (`sheet_final_night.png`); forecourts of neighboring shops join
  (but back off side streets). Final sheets: `docs/v2/shots/shops/sheet_final_night.png`, `sheet_final_close.png`,
  `sheet_final_downtown.png`. Console: no errors from shops code in 4 game runs. Last check tour done (`sheet_final_office_pharm_aerial.png`): no console errors; Big Cypress aerial
  shows the forecourt + parking strip; the office and second pharmacy cameras landed inside walls (spot framing, not the shops), so the
  office lobby is verified in the preview only. Open items: downtown legacy kinds (salon, hardware, electronics, outdoor) still use the
  v1 interiors; the towns-track room glass reads as a flat bright panel at night on facade-shader bays (pre-existing, not shop lots).
- 04:55 Pass 1 verified in game (2 tours, console clean except the since-fixed PortSolanaOcean water shader). Sheets (before | after,
  11:00 / 21:00): `docs/v2/shots/shops/sheet_ftm_clothes.png` (the gpF clothing shop: lawn -> forecourt, toy legacy -> V2 streetwear),
  `sheet_hia_clothes.png`, `sheet_cyp_clothes.png` (parking strip with stalls + wheel stops), `sheet_ftm_rest.png`, `sheet_clew_salon.png`,
  `sheet_ftm_wide_close.png` (aerial of Main St + close-up through the glass), `sheet_downtown.png`. Interior close-up:
  `A3_preview_boutique_eye.png` (draped garments, folded stacks; verts 43k -> 55k, bake 2.7 -> 2.9 s). Committed da3f358 + follow-up
  (modules); my tilebuild hunks are with the lead. Since then: neighboring shop forecourts join into one paved front, synthetic lots only
  get kinds the V2 interiors build (no legacy toy rooms on synthetic lots), sign lamps light painted / channel signs at night.
  Perf: frame time in these runs is dominated by machine load (load avg 200+); draw calls at the shops 780-980 both before and after.
- 04:10 Started 03:40. Found: 608 of 4527 mapped storefronts face a lawn (no sidewalk), mostly the mainland towns (Fort Myers Main St,
  Hialeah Gardens, Big Cypress, Port Charlotte, Clewiston). The toy-like clothing interior in gpF_causeway_graze was the legacy (v1)
  engine: kind `clothing` / small lots never reached the V2 boutique. Changes in progress (A/B `?aprons=0&shops=0`):
  (1) `src/world/shops/frontage.js` + one hook in tilebuild buildNear: flush concrete forecourt from the facade to the road edge, or
  a 2.4 m walk + asphalt parking strip with painted stalls and wheel stops when the road is far; joins the ground mask as paved and
  the lawn index (no grass through it). (2) `clothing` -> V2 boutique (minSize 4.6 x 5.5), liquor / variety / deli -> V2 convenience;
  synthetic lots 6.5 m wide, >= 6.5 m deep (V2 fits). (3) 3D scalloped awnings with sag + ribs (tile shells and V2 fronts; the V2
  front skips its own awning where the shell already hangs one: no double awnings). (4) `src/world/interiors/frontDress.js`: sign band
  face (the fascia baked black), brand sign (box / channel / painted with gooseneck lamps), blade sign, pilasters, sill ledges, cornice,
  window posters / OPEN neon / payment stickers / gold name lettering, roll-down security shutter (down after hours) on worn shops.
  Preview: `docs/v2/shots/shops/B0_preview_boutique_street.png` (before) vs `A1_preview_boutique_street.png`. In-game tour running.

## r2-look
**In progress (round 2, items 1 / 3 / 10, render side).** Everything below is live on 5200 and uncommitted until the A/B pass is verified.
In-session A/B switch: `game.lookR2 = false` brings back the overnight look3. Tools: `tools/v2/look/r2-ab.mjs` (A/B stills, cruise frame grabs, perf), `r2-run.mjs`, `albedo-view.page.js` (albedo debug view and histogram), `probes.page.js` (calibration spheres), `r2-sheet.py`.
- **Shadow length flickering every other frame (item 3), root cause found and fixed.** The dynamic shadow map (cars, people) redrew only every second frame. On the other frames a moving car's shadow was drawn where the car had been one frame earlier (0.4 m behind at 90 km/h), and TAA blended the two positions into the dotted smear in shot_09. Now (`src/world/env/shadows.js`) the map redraws every frame whenever a car near the player moves or the player moves fast; walkers only keep the half rate. Cost of the full rate at the spawn: +0.7 ms CPU, GPU inside the noise.
- **Dotted grain (items 3 and 10).** The contact AO multiplied a per-pixel, per-frame rotated 10-tap result straight into the image, and TAA left a fixed grain on every surface near the ground (calibration spheres, car bodies, walls). It now runs as AO plus a bilateral 4x4 resolve with an interleaved kernel (smooth in one frame). The PCSS rotation steps by the golden ratio per frame, with 12 taps. TAA now uses a 3x3 neighborhood with a gamma-1.25 variance box blended 25% toward min/max, so thin leaf edges, wires and blinds keep their history, and while driving the new-frame weight is capped at 0.25.
- **Light response (item 1).** AO now only darkens the ambient share of each pixel (lit materials write it to alpha in the scene pass), so sunlit ground next to cars and walls has no dark halo. The env map has a surroundings ring (tree crowns and houses up to 4-10 degrees, sunlit on the sun side), so paint and glass reflect a dark horizon band instead of empty haze. The noon sun is closer to white, with a neutral day white balance (sand and white paint had turned cream-yellow) and slightly cool shade instead of teal. A near static shadow cascade (2 cm texels within 40 m, blended into the 7 cm city map) gives crisp deck-rail, house and tree shadows.
- Albedo audit, screen coverage at Nico's lot (albedo view): mean 0.22-0.24, only 0.4-0.7% of pixels above 0.8. The global albedo is calibrated, so the pale look came from individual materials: the convertible paint was luminance 0.57 with metalness 0.35 and a mirror clear coat. Reported to r2-cars, who fixed it (solid finish, metalness 0). Targets agreed with r2-art (ART_STYLE.md).
- **Committed:** 88d5b6cc (shadow flicker, grain, TAA, near cascade, env ring, neutral day light) and the shaded-ambient commit (deep shade under trees, decks and cars; faces turned away from the sun keep their sky light).
- **Second pass (GTA 6 targets, user request).** Ordered by visible gain per ms:
  1. Ground cloud shadows that drift with the wind, from the same cumulus field as the sky. The cloud field is now anchored to the world, so clouds pass overhead while you drive. A 512 x 512 coverage map over 4 km costs about 0.1 ms. The shadows darken only the direct-sun share of each pixel. A/B: `game.lookCloudShadows`.
  2. Sky cumulus: the shapes are domain-warped (irregular outlines instead of round cotton balls), with crisper cauliflower edges and darker flat bases.
  3. Volumetric sun shafts: ray-marched through the real near and city shadow maps, for beams through palm crowns and porch gaps toward a low sun. Being tuned now; off until verified (`game.lookShafts = true`).
  - Next: reflections of the actual scene in car paint and glass (current state: sky plus the horizon ring env), then wet roads at night.
- Testing is slow: machine load is 225-257 and every helper is queuing for the 3 browser slots, so each page load takes 10-20 min. Sheet for user shots 01/03/04/09 with the same framings: `docs/v2/shots/r2look/sheet_ab2_user.jpg`. That row's scene was mid-change (keys moved the yard); being re-shot as ab3.
- **Mock-up camera (lead / outside critique: "brighter and harsher, less natural shading"):** 3-way sheet `docs/v2/shots/r2look/sheet_ab6_mock.jpg` (mock-up | before | after, same session).
  - Exposure -0.15 stop. Softer sun vs sky fill: sun 1.22 -> 1.04, hemisphere 0.95 -> 1.2, env 0.42 -> 0.52.
  - Bounce into cast shadows plus a sky-occlusion cut: deep shade that is not navy-black (r2-art review). Neutral sky fill.
  - AO 1.9, applied to ambient only. Grazing-glare cut on very rough non-metals (up to 28%).
  - Day haze x1.3, softer toe, warm highlights.
  - The remaining gaps at that camera are content: the ground is beige instead of crushed white shell, and the truck rendered black from a car-paint shader error (r2-cars fixed it at 10:51).
- **Second pass committed:**
  - Ground cloud shadows, world-anchored clouds, irregular cumulus with crisp billows and dark bases: `sheet_ab3_clouds.jpg`.
  - Volumetric sun shafts at low sun.
  - User-shot framings: `sheet_ab3_user.jpg`.
- Running now: drive + perf A/B (ab7) and golden hour at the mock-up camera (ab8).
- **Afternoon (user: "too dark, doesn't look real and cinematic"), committed:**
  - Brighter, readable round-2 lighting: exposure +0.3 stop vs the morning; auto exposure never darkens below -0.1 stop; sky fill and bounce into shade; contact AO 1.4, contact only; overnight toe (no gray cast); haze x1.3.
  - Matched-grade LUT (Oklab, from the mock-up camera's statistics; `tools/v2/look/lut-match.py`); high-chroma roll-off.
  - Cloud shadows 0.45 on the cloud cores only. A full cloud over the yard had erased the cast shadows at 12:30.
  - AE readback every 24th frame (r2-perf stall).
  - Sheets: `sheet_g2_truck.jpg` (9:05 / 12:30 / 16 / 18:36), `sheet_g1_spawn.jpg`, `sheet_g3_street.jpg` (11 / 16 / 18:36 / 22), `sheet_f5_mock.jpg` (mock-up camera at its best sun hour, 12:30), `sheet_f3_mock15.jpg`.
- **Sun hour at r0b_deck:** computed over every quarter hour. With the real road layout the sun is never in front of the deck camera; the best match is 12:30, now the reference tod set by r2-keys. The mock-up's lower-left rail stripes are geometrically impossible there.
- **Asked of others:** r2-veg for backlit leaf transmission and brighter, less saturated shade foliage; r2-cars fixed the car-paint shader error (black truck).
- **12:30 cast shadows, fixed and committed.** The 1.5 / 0.66 sky fill washed out sun shadows; it was not the cloud shadows (`sheet_g4_truck.jpg` toggles them). Sun / hemisphere / env are now 1.22 / 1.2 / 0.5, the shade sky cut 0.25, bounce 0.17. Brightness comes from exposure x1.12 and the bounce. Result: `sheet_g5_truck.jpg`, black point p1 0.014, median 0.29 (before 0.23).
- **Left:** night is very dark on side streets (lamps / windows are other helpers'); reflections of the actual scene in car paint (only the sky + env ring today).

## r2-keys
**Round 2, item 16 (Nico's house and yard vs the front-deck mock-up) and the house side of item 10 (blinds, shutters).** Live on 5200.
- **House turned in its lot (item 16).** I fitted the mock-up camera to the deck's corner rail and the STOP corner. It stands on the west deck at the rail: house-local eye (-8.33, 4.65, 1.25), look (-16.75, -2.32, 18.0), fov 51 (`tools/v2/keys/spots_refs.json` r0b_deck). The view only matches with the STOP junction 27 deg right of the deck edge, so the house is turned +0.72 rad (`nicoHouse.v2.js` HOUSE_YAW; `?nhyaw=0` = the old house).
  - Layout: the lot is now a corner lot, with the east leg of Pelican Point Ln along its front and the west leg down its west side. layout.json is untouched; its heading stays the street frame (`spot.streetHeading`).
  - The neighbors (keysStreet.data.js / keysLots.js) and the dock line keep that frame, so they did not move in the world. The dock part builds in the street frame inside a group turned -yaw, with colliders, lights and anchors converted.
  - The west stair moved 8 m back along the deck (plan.js stairW.dz), so the front-deck corner rail is unbroken like the mock-up. The flight, landing, rails, foot-IK export (`game.nicoHouse.stairs`), colliders and the dressing at its foot all follow.
- **Yard re-laid from the mock-up (yard.data.js).** Positions were unprojected from the mock-up through the fitted camera, then nudged off the asphalt.
  - Cars and drive: truck2 (-13.7, 8.2) h 2.05 and conv1 (-18.8, 5.5) h 1.03. r2-cars moved them in vehicles.js NICO_CARS. The drive runs from the STOP corner past the pickup.
  - Props: the lattice planter with its bougainvillea mound, and two bin groups (blue carts + galvanized can, blue pair past the classic's hood). The all-way STOP faces the deck. The corner pole carries a transformer, a cobra-head lamp, wires along both legs and the house's service drop (the old house pole stood in the road).
  - Mailbox at the drive mouth; red roll-off on the far verge of the west leg, right of the STOP.
  - Neighbors: the white cottage with its board fence swapped lots with the yellow stilt house, so it sits across the east leg where the mock-up has it.
  - Planting: in-lot only (poinciana over the classic, green mass by the bins, palms left); r2-veg plants the verges and neighbors.
- **Ground.** The yard sheet now has gentle swells (about ±0.15 m, flat around the house and along the drive) and a low spot at the drive end, where the after-rain puddle (with a damp rim) fills from the weather.
  - The sheet sinks under the asphalt along both legs (the old sheet ran across the road).
  - A heightfield collider follows the swells. Plants (part 50 and the vegetation placements) and every prop stand on the sheet surface.
  - Shell, matted-grass and leaf patches were re-laid for the new frame and are denser in the deck-view foreground.
  - Found and fixed: the ground mask (surfaceMask autoVeg) had registered the yard sheet as paved, which deleted every leaf instance of the house's plants (bare bougainvilleas). Material renamed 'ground:'; told r2-ground.
- **Item 10, house side.**
  - Nico's mini-blinds were 1.2 mm slats every 21 mm, which crawl into dotted lines. They are now one panel with a mipmapped slat texture.
  - Shutter blades: 7 mm became 12 mm, with one paint coat per leaf instead of per-blade peel.
  - Generated houses: the louvered and Bahama shutters were a solid panel with 8 mm slats floating on and through its face. They are now real frames (stiles, rails, blades inside the frame depth) up close and one solid leaf at mid range.
  - Also fixed: the Bahama leaf tilt was mirrored on some walls (hidden by the symmetric panel).
- Shots: `docs/v2/shots/keys/cmp_r2k16_r0b_deck.png` and `cmp_r2k15_r0b_deck.png` (mock-up camera, cars in place), `r2k15_spawnview.png` (spawn), `r2k14_planter.png`, `r2k14_hWhite.png` / `r2k14_shutterL.png` (cottage shutters), `r2k13_nicoBlinds.png`, `r2k16_dockpath.png`, `r2k14_top.png`. Before: `cmp_k21_r0b_deck.png`.
- Verified on a clean boot (r2k14-r2k16, no console errors):
  - The heightfield matches the drawn sheet to the centimeter.
  - `game.nicoHouse.stairs` = 3 flights (the moved west stair is 2 of them).
  - The spawn (-12.6, 5.4) stands clear of the pickup.
  - Commits: 4573da0e, fcf045aa.
- Open:
  - The drive-end puddle now uses r2-ground's patchPuddles on the yard sheet; standing water isn't visible in my after-rain shots yet, so r2-ground is checking the uWeather hookup.
  - The global after-rain wetness turns the whole yard and deck into a mirror (wet-surfaces side, not mine).
  - Nico's own shutter blades are still real geometry at mid range (r2-look suggested a baked slat panel past ~15 m).

- **Afternoon passes (lead and user reviews), latest 3-way: `docs/v2/shots/keys/three_r2k23_deck.jpg` (mock-up | overnight | now).** Commits f540c118, 07f83d67, 17b901c2, 44f984f8, 6e31c66e, a86e4c23, b59c88f1.
  - STOP signs re-anchored to the street (user shot_25): one per approach at the stop bar, right side, 0.9 m off the edge, facing traffic. There's no regulatory STOP at that corner.
  - Yard floor:
    - calibrated to r2-art and r2-look (shell L ~0.46, near neutral);
    - the terrain no longer pokes through the dips (it showed as straight-edged patches, user shot_27);
    - shell decal rims removed, damp mottling along the drive;
    - out of the global wet sheen;
    - a small always-wet puddle at the drive mouth plus the after-rain patchPuddles water;
    - wet gutter strips with 4 puddles along both street legs;
    - r2-ground's matted grass clumps, denser and greener.
  - Roll-off: in the yard at the street edge behind the right-hand bins, low and rust-darkened. Its load is real-size torn drywall, 2x4s, a bent roofing sheet, a tarp and bags under the rim.
  - Deck: sun-bleached silver-gray boards, bare-wood rails (they were brown paint), a real rail-mounted satellite dish at the left edge.
  - Power lines: every span ends at a pole. The city generators (tilebuild, dressing) never leave dangling spans.
  - Shared kit, r2-art calibration: weathered wood roughness, galvanized tin, dielectric rust, neutral concrete and slab, leaf litter, interior wood and leather; library wood roughness in keysLots.
  - Mock-up camera refit at fov 56 (spots_refs r0b_deck).
  - Seams from r2-roads' audit fixed: a neighbor's stair in the lane, coplanar shell drives, the yard edge band at the corner.
  - Open:
    - sun hour for the mock-up's long rail shadows (r2-look scanning);
    - street and left-side density (r2-veg);
    - the user's new truck model (r2-cars).
- **Nov 17 pm: user library models in the yard** (commits d52bba0e, f1db1d97; shots `docs/v2/shots/keys/r2k33_r0b_deck.png`, `r2k39_*.png`, `r2k40_*.png`, 0 console errors):
  - The utility poles are now Utility Pole 1 (crossarm, three insulators; Pole 2 is a concrete-stub style and doesn't fit). Wires hang from the insulators, and the STOP-corner pole keeps its transformer and lamp.
  - New props: Window AC 1 in Nico's W3 sash; a galvanized can with lid at the planter (Trash Can 7); a faded blue mailbox on a wooden post at the drive mouth (Mailbox 6); the cooler pair and a weathered wood patio chair in the side yard. All are grounded and have colliders.
  - The new tool `tools/v2/keys/blender/import_fbx.py` takes FBX / OBJ / GLB files and wires loose maps per material. It zeroes Arnold transmission: the can arrived as glass, which broke the shader link and blacked out the whole frame. `models.js` also strips transmission from any physical material.
  - Not done yet: Window AC on the generated houses (they build their AC in generator.js; this needs instancing in houses.v2.js), the fishing rod (rigged, nested zip), pallets / cinder blocks / buckets by the roll-off, and a cooler or chairs on the deck (the mock-up's wicker set is still code-built).
- **QA fixes** (d8e66ba0):
  - Sea oats and vines no longer float on the open north edge.
  - Generated houses take their colliders from the LOD 0 build (QA-035).
  - HD poinciana and HD hibiscus (r2-veg) are in the lot; the bougainvillea mound is now a big, loose cascade (9d6133c8).
- **Last pass** (3c08d4f7, 9429b416; shots `r2k41_r0b_deck.png`, `r2k42_r0b_deck.png`, `r2k42_wicker.png`, 0 console errors):
  - HD plants at their intended sizes (r2-veg's per-model base scale).
  - The user's wicker chairs replace the box-built set on the deck.
  - The user's fishing supplies (rod, tackle box, buckets, net) sit on the dock's T-head. They are placed and boot clean but have not been shot close up.
  - Skipped:
    - Wicker Chair 2 (600k-poly scan at the wrong scale).
    - Boat Trailer 1 and Boat 16, which carry real brand marks (BoatUS logos and a Louisiana plate on the trailer; Nitro / Mercury lettering across the boat's photo texture). They need a texture cleanup pass before use.
  - Not started: Fences 6-9 on the lot lines, the rigged fishing rod, gear under the house, and the generated houses' window AC.
- **STOPPED** on the lead's instruction.

## r2-art
- 09:50 **Started (art director, one style).**
  - Style guide: `docs/v2/briefs/ART_STYLE.md`. Material class ranges are grounded in real PBR values and agreed with r2-look on the locked exposure: 80% white = sRGB 228 in noon sun. It also covers the GTA 6 trailer bar (Fresnel, deep but never black shade, warm haze).
  - Machine ranges: `src/world/art/ranges.json`.
  - Audit tool: `node tools/v2/art/audit.mjs`. It runs a material-ID pass plus r2-look's albedo view at fixed cameras, measures coverage, on-screen albedo, roughness, metalness, normal strength, texel density and source, then ranks outliers by screen coverage. Output: `docs/v2/reports/art-audit.md`.
  - Runtime calibration of library models: `src/world/art/calibrate.js`, applied to every library building (`bldmodels.js`) and street-furniture GLB (`streetkit.js`).
    - It moves only out-of-range values back to the nearest edge of their class.
    - Typical fixes: exporter-default metalness 1 on stucco / marble (casino, towers, bins), 98% white, mirror "glass" at roughness 1.
    - In-session A/B: `__artCal(false/true)`. Kill switch: `?artcal=0`.
  - Library walls stretched below 110 px/m get the stronger street-level grain and detail normal.
  - Sign posts are galvanized (metal 1) and sign backs dielectric. House chain-link is galvanized.
  - Found and reported: the miamiData TDZ (r2-ground, fixed) and the psSunVis shader error (r2-look, fixed).

## r2-mapui
**Round 2, items 9 (map water outline) and 7 (mission / race / job markers).** Item 9 is committed (f706e11d, da64e72a). Item 7 is committed (0988577a).
- **Map water (item 9).** The minimap, pause map, phone map and GPS route all draw tiles through `src/ui/mapRender.js`, so they share one style.
  - Removed: the two hard turquoise stroke bands around every coast (110 m solid, 300 m at 55%) and the lake outlines.
  - New: one world-wide shore field. The land mask (lakes and canals cut out) is rasterized at 16 m/px and blurred three times: turquoise shallows at the sand (45 m, thresholded), a teal band (140 m) that keeps channels and bays deeper in the middle, and a broad shelf (320 m) fading into deep navy.
  - A world-anchored reef / sandbank noise breaks up the shelf. Lakes and canals get deeper water with a soft rim.
  - No seams: there is one global field, so every tile and zoom level samples the same values.
  - Cost: the field is built once (~40 ms), in steps inside the tile budget. After that a tile only samples it (~1-2 ms per tile).
  - Lead review notes are done: the minimap channel keeps its depth gradient, and the OSM credit is removed. The runtime map has no OSM data: map3 builds with MIAMI_NO_OSM=1, and the only direct cache read, the causeway, bails out.
  - Still stale, not my file: the `source` / `attribution` strings that `tools/osm/output.py` writes into `world.json`.
  - Sheet: `docs/v2/shots/r2-mapui/sheet_map_water.jpg` (user's shot_10, before, after, map_colour_target; Biscayne; whole map; Gulf coast; minimap).
  - Tools: `tools/v2/mapui/map-shots.mjs` (light page `tools/v2/mapui/mapshot.html`; `src/ui/mapshot.html` is broken by a moved interiors import), `map-perf.mjs` and `sheet.py`.
- **Markers (item 7).** One shared module, `src/gameplay/markers.js`, now drives every marker type. `activities.js` uses it for taxi, delivery, race start, checkpoints, finish, hit list, armored car and bounty. `jobs/kit.js makeMarker` uses it for jobs, business sites, supply runs and gang turf.
  - Removed: the 30-40 m additive beams (the white beam was the street-race start flag) and the 5 m race arches.
  - New: a soft translucent ground ring with a faint inner ring, and a knee-high glow. The glow is a shader that fades upward and toward the silhouette, so it never reads as a glass slab.
  - New: a small floating chevron that turns slowly and bobs, with painted shading. It grows a little with distance (up to 2.8x at 90 m) so it reads at mid range. It is unlit (toneMapped off), so it glows by itself at night, and uses normal blending so it reads on bright sand by day.
  - Race start: a car-sized cyan ring with a checkered card. Checkpoints: a road-wide ring with a screen-facing double chevron that points along the course. Finish: a checkered card.
  - Kept: the old API, including `userData.ring.material.color`. business.v2's clone-and-recolor still recolors the whole marker; tested in game, and other markers of the same color stay untouched.
  - Sheet: `docs/v2/shots/r2-mapui/sheet_markers.jpg`, old vs new on the same street, day and night, near and 70 m back. Tool: `tools/v2/mapui/marker-shots.mjs` (A/B in one session).

## r2-roads
Items 8 (surveyed curves), 11 (curb / junction seams), 13 (utility covers, US markings). In progress; updated below.
- 08:05 **Item 8 done, map republished (b20261117-080220, commit "Map: surveyed road alignments").** The S-wiggles on State Road 916
  (shot_08) were the trace's pixel steps: the skeleton of the 11 m/px drawing steps one pixel sideways every few hundred meters and
  RDP + Chaikin turned each step into a small S. New `tools/v2/map3/survey.py` (called from build_v3 after buildings are placed) moves
  each eligible road sideways inside a tube (<= 9 m, ~0.8 px) to the shape of least bending (curvature^2 + curvature change, weak pull
  to the drawn line): long tangents, arcs, spiral-like transitions, no wiggles. Through-roads are solved together across nodes;
  junction nodes, bridges, city grids, the Keys detail region (Pelican Point Ln untouched, r2-keys asked), small separate networks
  and every line within 45 m of a building stay exactly put. tools/osm keeps fitted arcs round (0.12 m simplify for surveyed roads).
  Verified against the live build: graph nodes, names, controls, buildings, storefronts / lean spots (spots.json), layout.json and
  the spawn are byte-identical; audit failures are the same pre-existing ones. Turns > 6 deg on changed roads 3560 -> 1640.
  Shots: top-down `docs/v2/shots/roads/r2_sr916_topdown.png`, in game `docs/v2/shots/roads/r2a_sr916_{chase_a,chase_b,chase_c,high,south}.jpg`.
- 11:40 **Item 11 (curb triangle, shot_12):** the triangle was the concrete gutter pan. The asphalt shader paints the pan from each road
  ribbon's lane frame, so it stopped square at every junction mouth while the curb ran on around the return: a dark asphalt wedge
  between the pan's end and the curb return at every curbed corner. tilebuild `curbGutters()` now lays a 0.5 m strip from each leg's
  mouth along its curb line, around the return and out to the next mouth, written with its own road frame so the same shader paints
  the same pan, joints and grime (A/B: `?seams=old`). Tree-lawn granite curb strips / returns sit 4 mm under the slab top, so where a
  slab reaches the curb it wins (was a `M.panels | M.sidewalk` z-fight band). Audit tool: `node tools/v2/roads/seams.mjs --set X`
  (22 junction / road-end types picked from the graph, cached picks; probe `src/world/surfaces/seamProbe.js`: raised / notch / z-fight /
  step / gutter coverage along every curb return and leg curb line; 3 views per type). Sheets: `docs/v2/shots/roads/before_seams_sheet.jpg`,
  `after_seams_sheet.jpg`. Found for others (sent): a Keys neighbor stair in a lane and shell drives coplanar with the terrain (r2-keys fixed).
- 11:40 **Item 13:** library utility covers (`src/world/surfaces/covers.js`, models `public/assets/models/roads/*.glb` by
  `tools/v2/roads/covers.sh`): sanitary manholes on the centerline every ~110 m and near the middle of each curbed junction (in a
  utility-cut patch), curb-inlet grates just past the curb returns / stop bars (~45 % of corners), a storm manhole now and then,
  valve boxes behind the stop bars; only on curbed streets in town / city zones (rural roads, Keys lanes, decks: none); the old decal
  manholes in random lanes, meter boxes in the gutter and grates every 45 m are gone (`?covers=0` = old). Markings: lane-use arrows
  only in turn lanes (T-stem approaches with no through movement, exclusive left lanes of 3+ lane signalized approaches), never mid-block
  (approaches with arrows 1418 -> ~60); local residential streets have no center line (US practice). `?arrows=old` = old markings.
  Model requests added to MODEL_REQUESTS_r2.md (US curb inlet, sanitary / storm covers, valve / meter boxes, precast curb kit).
- 11:40 **First audit + fixes.**
  - Audit: before calibration 1258 materials / 278 outliers / 13 high-visibility; with it 1235 / 263 / 17. Same places, new cameras. The extra high-visibility rows are other helpers' rows that the new views now see: kit wood / tin / slab and keys leaves (r2-keys), liveoak bark (r2-veg), car glass env 2.6 (r2-cars).
  - Report: `docs/v2/reports/art-audit.md` (before: `art-audit-before.md`). Views: `docs/v2/shots/art/audit/`.
  - Owner lists sent:
    - done: r2-keys (kit rows, f540c118), r2-cars (glass env 1.35, paint ≤ 0.72, trim), r2-ground (grass blades, sand neutral, elevated concrete), r2-roads (sidewalk slabs, tree grate)
    - in progress: r2-veg (bark sat, leaf_1_c)
    - r2-look: shade was navy-black. Fixed with a ground bounce into cast shadows, sky fill toward neutral, and the F90 cut capped at 28%.
  - Mine:
    - library buildings: exporter metalness 1 at roughness ≥ 0.6 made dielectric (casino, grid_block, stepped_midrise); a 'building' fallback class caps saturation at 0.5; anisotropic filtering 8 on every library map
    - facade albedo capped at 0.78
    - signal / sign / guard metals made 0 or 1
    - town and house pavers neutral, house stucco and stone matte
  - Sheets (in-session A/B of the calibration): `docs/v2/shots/art/sheet_r1_*.jpg`.
  - Model requests (`MODEL_REQUESTS_r2.md`): hangar, motel, gas station, deco / brick mid-rises (6-30 px/m).
- 12:05 **Architectural depth (lead's request).** Split agreed with r2-keys: they do the generated houses' kit, I do the procedural city buildings.
  - Procedural OSM houses had a pyramid over the world-axis bounding box. They now have a real hip roof with a ridge on the footprint's own axis, 0.55 m eaves, fascia, soffit, K-style gutters, downspouts with kick-outs, a condenser on a pad with its line set, and an antenna mast or satellite dish on about 40%. Before/after: `?hiproof=0`.
  - Style guide §5: geometry-depth rules (eaves, gutters, reveals, parapets, roof breakers).
  - City buildings, more:
    - punched-window sills and lintels now run on mid-rises up to 62 m and 8 floors (was 40 m and 6)
    - warehouses get a low parapet with coping, plus roof vents
    - town shops (`towns/shops.js`): the blank side walls now have a window every ~3.4 m on every floor, the floor band and cornice wrap the corner, downspouts with kick-outs, and a meter box with conduit
  - Opaque library glass is lifted to L 0.12. At 0.05 it read as flat black panels.
  - Before/after for the city geometry: `?artgeo=0`.
  - **tilebuild ready: r2-art** (hip roofs + house services, `hipRoofGeo`, warehouse parapet / vents, window depth to 62 m).
  - Machine load is 330-430, so test runs often hit the watchdog. Sheets are pending a quieter slot.
- 12:40 **Second pass.**
  - Committed 0bd...: town-shop side walls, raw brick color, glass lift.
  - Re-audit (nico, downtown, rural): 761 materials, 113 outliers, **3 high-visibility** (was 13): `docs/v2/reports/art-audit.md`.
  - Found: calibrate() skipped every material with an emissive map. That's most library towers (night windows), whose exporter roughness / metalness stayed as imported. Textured surfaces with emissive maps are now calibrated; only map-less light sources are skipped. A glass tower's 'Building Facade' atlas is treated as curtain wall (building class), not stucco.
  - Reported to owners:
    - r2-cars: the 'noPark' TDZ, now fixed
    - r2-keys: generated-house 'wood' roughness 0.51 (their kit fix doesn't reach the houses kit), and the 05_site.js 500
- 13:20 Item 8 follow-up: the Keys-detail Overseas Highway / Card Sound Road pieces also get the fit (tube 3 m, nodes pinned, r2-keys
  ok'd; worst kink 23.8 -> 11.3 deg at (-1256, 5518)); build b20261117-130138 published. Pelican Point Ln edges, graph nodes, names,
  buildings, storefronts and layout byte-identical. Item 11 follow-ups (tilebuild): curb-return strips per segment (a slab wrapping
  only part of a return left the rest without a curb); promenade railings only on real seawalls, between grounded posts on dry
  paved-level ground. r2-ground's "guardrail lying in the Keys shallows" at (-1016, 4965) was the handrail pair of a seawall stair
  flight generated on a natural sand shore (treads buried, rails sloping into the water): seawall stairs now only on non-sand shores
  in port / downtown / business / commercial zones; roadside water guardrails only where their own posts stand on dry ground (they
  were already clipped to the road piece). Audit: `railAudit()` in `src/world/surfaces/seamProbe.js` (wet / sunk / flat rail
  triangles). Seam probe totals over the 22 types, old code -> new: raised 11 -> 1, z-fight 150 -> 2 (incl. r2-keys' fixes), gutter-pan
  coverage on curbed returns 0 -> 0.98; the remaining "notch" flags are tree-lawn corners (curb strip, then lawn: checked in the shots).
  Sheets: `docs/v2/shots/roads/R2_item8_sr916_before_after.jpg`, `R2_item11_curb_returns_before_after.jpg`, `R2_item13_covers_markings.jpg`.
- 14:45 Round walk corners (user's shot_12 follow-up, committed in 63e5b196): where the walk runs along the curb on both legs and the
  block behind isn't paved, the slab inside each curb return's sector is redrawn as a constant-width band concentric with the curb
  (vertex every <= 0.4 m, radiating joints, curb face, back-edge chamfer so the lawn follows the arc); paved-through blocks keep a square
  corner plaza. Sheet with zooms: `docs/v2/shots/roads/R2_item11_round_walk_corners.jpg` (SR 916 corners incl. the shot_12 area).
  Pier-end flights -> galvanized dock ladders at Keys / residential / natural piers (concrete steps only at urban quays). publish.sh:
  temp-folder + atomic renames, old builds kept 2 h. Known leftover: where my corner gutter strip meets the straight road gutter at a
  junction mouth there can be a small slanted end (seen at one all-way stop corner); the curb face along the new corner band reads as
  a dark line in shade, same as the straight curbs.

## r2-physics
- 12:10 In progress. Everything new sits behind `?carphys=2` (off by default) until it has passed an in-game boot.
  - **Suspension and tires** (`src/vehicles/physics/suspension.js`): a drop-in for Rapier's ray-cast controller.
    - Contact: a tire-profile ray fan along the suspension axis (rays from the tire's lower arc and across its width). A step between rays is solved exactly as the tire circle on the corner, so the wheel climbs a curb along the true arc.
    - Why not a shape cast: Rapier castShape's time of impact was off by up to 9 cm on flat ground (measured in Node), and the wheels chattered.
    - Vertical: two-mass quarter car (unsprung mass, tire spring). Coil at the class ride frequency, preloaded so ride height is unchanged. Bump and rebound damping, progressive bump stop, hard stop at the arch gap + 4.5 cm tuck, droop limit, anti-roll bars.
    - Tires: brush-style slip-angle curve with relaxation lag, load-sensitive mu, friction ellipse. Per-wheel surface grip / rolling resistance / roughness, and wet roads.
  - Offline harness `node tools/v2/physics/sim.mjs --test curb|pothole|rock|bump|brake|corner` (sedan):
    - curb 15 cm at 20 km/h: full bump, pitch +5.9 / -5.0 deg, speed 20 -> 17.9 km/h
    - brake from 60 km/h: 1.09 g, dive 2.2 deg, 13.9 m stop
    - skidpad: 1.0 g at 3.0 deg roll (SUV 3.7 deg)
    - pothole 6.5 cm: right-front wheel drops 4.8 cm
    - rock 12 cm: left-front wheel up 7.4 cm, 2 deg roll
  - **Potholes**: tilebuild's decal() reports every pothole / patch / cover to `relief.js`, which ports the decal shader's bowl depth, so the tires feel the dip that is drawn.
  - **Rocks**: the countryside ground-cover rocks get convex-hull colliders from their own mesh (`rocks.js`, r2-veg added `rocksNear`).
  - **Parked cars** (shot_25): `game.physics.clearForCar / findCarSpot / watchParked`. r2-cars calls them in spawnParked and the parked-slot spawner.
  - **Collider overlay**: F9 or `?colliders=1`. Ray audit tool: `tools/v2/physics/colaudit.mjs`.
  - **Lot props** stand on the real ground at their own spot (r2-ground found Keys beach bins and rural mailboxes buried 0.15-0.6 m).
  - **tilebuild ready: r2-physics**: one line in `decal()` (pothole / patch / cover relief registry, buffered until the module loads).
- **HUD top-right corner (new item from the user, commit 479cbe58).** It keeps hud_corner_target's geometry: chunky stars with thick black outlines (charcoal when earned, near-white when open), five deep-red evidence badges, and the heavy squared ammo digits (clip white, reserve gray).
  - Scale: the corner is 25% larger (six stars = 238 px at 1080p). It is vector art, so it stays sharp on Retina (DPR 2 checked).
  - Weapon icons: all 28 weapons are baked from the game's own models (the user's GLBs, code-built ones for the rest). Each is a flat side view, cel-shaded in the target's slate palette, with a painted top highlight and the target's 12-unit black outline. The baker is `tools/v2/hudcorner/bake.html` (`node tools/v2/hudcorner/bake-icons.mjs`). Output is `public/assets/ui/weapons/<id>.png` and `index.json`; boxes are per class. The pistol keeps the hand-drawn target art.
  - Money (ref_46): bank with the purple house badge, then cash with the green wallet badge, under the evidence badges when no weapon is out. With a weapon out, the money shows for 5 s after a change.
  - Clock: a small last row.
  - Sheets: `docs/v2/shots/hudcorner/sheet_corner.jpg` (on white, next to both references), `sheet_weapon_icons.jpg`, and `sheet_corner_ingame.jpg` (in game, before / after, day / night, Retina).
- 16:40 Commits f6568e7e (suspension behind ?carphys=2, relief, rocks, clearance, overlay, lot props on real ground, noPark boot-crash fix) and the next one (solidCars, trunks, impacts behind ?impacts=1).
  - **People never move cars** (`solidCars.js`). Walk / sprint 5 s into a parked car, head-on and at 35 deg; car displacement:
    - sedan3: 0.01 / 0.21 / 0.00 / 0.24 mm
    - suv12: 0.21 / 1.27 / 0.00 / 0.74 mm
    - truck9: 0.00 / 0.00 / 2.83 / 0.66 mm
    - The over-1 mm cases look like settle drift (cars spawned 2.5 s before the walk). A re-run with a 6 s settle and an idle control is queued. Report: `docs/v2/reports/physics-push.json`.
  - **Trunk colliders** (`trunks.js`): 2-4 capsules along each drawn trunk (lean / S-bend), from r2-veg's `trunksNear` (afce3e49), plus mangrove prop roots. The tilebuild vertical cylinders are off while these are on; `?trunks=0` brings them back. The walk-into audit (`tools/v2/physics/walkaudit.mjs`: palms, trees, props, 4 directions) is queued.
  - **Prop impacts** (`impacts.js`, `?impacts=1`, off):
    - Momentum = object mass x closing speed x (1+e) + snap impulse, applied at the contact point.
    - Break, slowdown and damage wait until the body reaches the object.
    - Damage lands at the contact: dents on LOD0 + LOD1, scratch decal, smashed lamp, bumper sag, buckled hood, cracked windshield.
    - First sign run, speed loss at the hit: 11 % at 19 km/h, 6.3 % at 50, 4 % at 64. That run predates the contact-deferral fix, so the damage landed at the wrong spot. Re-run queued (sign at 20 / 50 / 90 km/h, chase frames + close-ups in `docs/v2/shots/r2-physics/hits/`).
  - **carphys 2 in-game lab** (sedan3, `docs/v2/reports/physics-lab-2.json`, strips and chase frames in `docs/v2/shots/r2-physics/lab/`):
    - curb 20 km/h: pitch +5.9 / -4.8 deg, travel to the 8.3 cm bump stop, speed out 20.2
    - curb 40 km/h: pitch +5.9 / -2.9 deg, no speed loss after
    - pothole: a wheel drops 3-4 cm
    - rock 12 cm: +8 cm travel, 3.1 deg roll
    - Matches the offline harness.
  - Browser slots are the bottleneck: runs wait 20-60 min.
- 17:10 Done and committed:
  - **People never move cars.** `solidCars.js` + reseat. Walk / sprint 5 s into sedan3 / suv12 / truck9, head-on and at 35 deg: 0-0.77 mm on 10 of 12 runs, idle drift 0. The 1.27 and 1.33 mm runs came before the reseat fix, which now puts a person-only-touched parked car back exactly. QA's own run: 0-0.1 mm.
  - **Trunk colliders** follow the drawn trunks (r2-veg's `trunksNear`, plus a countryside fallback). Walk-into audit at Nico's: 12 palms, 2 trees, 5 lamps, 7 poles and 4 mailboxes are solid at the bark. QA's "walk-through countryside trees" (-826.2,4822.7 / -833.2,4856.4 / -742.4,4894.0) are bush_round shrubs, which are soft by design.
  - **Sign posts (signs.v2 street-name blades)** have breakable colliders (QA-002/005).
  - **Prop impacts are ON by default** (`?impacts=0` to turn off). Sign post at 18 km/h: -11.5 %. At 50 km/h: -6.5 %, with a crumpled grille / bumper corner, scratches and the headlight on that side smashed. Shots: `docs/v2/shots/r2-physics/hits/sign50_damage_a.jpg` and the chase frames `sign20_chase_*`. Wall / car crashes put damage at the contact, through `damageAt`; that hunk sits in vehicles.js and r2-cars will ship it.
  - **QA-035 houses:** root cause handed to r2-keys (LOD-seeded RNG, colliders taken from LOD1); they fixed it in d8e66ba0.
- Open:
  - Committed by the lead in e9e041b3 (buildColliders): building parts get colliders (QA-045); no fallback land floor where the terrain is drawn under water (QA-030/037); that floor sits at the land base's -0.05 (QA-007/036). Not yet re-probed in game.
  - Tower 7940 at 499,-156 (h 155.9 m) still has no roof collider in a probe from above. Next step: its library collision mesh (bldmodels collide uses the model's col mesh when present).
  - QA-030 dock -895,4806: the -0.31 floor is r2-ground's seabed heightfield (the drawn shelf), not tilebuild.
  - truck9 wheels sink 15 cm (QA-024/031): handed to r2-cars (wheel radius vs model).
  - carphys 2 (suspension) is still off by default: the lab is verified (curb / pothole / rock / hump), but the traffic A/B (roll-overs, fps) never got a browser slot.
- 18:30 Facade / tower item (r2-perf badNames). Probed in game with `tools/v2/physics/drawnprobe.mjs` (what is drawn at x,z vs the physics under it).
  - **What is drawn at 410,-157 / 449,-176:** stacked balcony slabs every 3.4 m (21.3 / 17.9 / 14.5 / 11.1 m). They hang outside any building footprint, so the collider build never made them: these are not walk-through buildings.
  - 410,-167 (building 7935): the collider roof matches at 24.2 m; the extra 3.5 m drawn is rooftop parapet.
  - 499,-156: nothing is drawn above the ground there now (tower 7940's footprint, no tower mesh), so there is no mismatch.
  - **tilebuild ready: r2-physics** (not verified):
    - balcony colliders (slab + rail wall) in buildTower's balcony stacks and a collider twin of the r2-art mid-rise balcony block (same bays / floors).
    - A re-probe at 410,-157 still showed no physics under the drawn slab, so that collider-pass condition does not trigger for this building yet. Still to work out: the collider pass differs from the near pass there (probably FS / storefront state).
  - **`bldmodels.js` (uncommitted, needs a boot check before commit):** LIBM.collide stretches a library collision mesh that is shorter than the drawn model up to the drawn height (grid_tower roof 112 m vs collider box 101 m).

## r2-veg
**Summary (items 10, 12, 16 trees, the floating trees, the Keys density).**
- **Volume, not paper (item 10):**
  - Crowns and bushes shade as one volume. Per-vertex crown occlusion gives a dark core, a lit shell and a darker underside, and goes into
    the lighting: ambient fully, the sun partly.
  - Leaf normals bend toward the crown's ellipsoid. Translucency comes only through the shell.
  - The sparse library trees are densified x3; the poinciana was the gnarled oak's 512 cards. The poinciana bloom sits on the outer shell only.
  - Leaf normal maps are at 0.7, and leaf roughness varies per texel and per plant (r2-art).
  - Leaf flutter is slower and smaller, because TAA has no vertex motion vectors and fast flutter turned into shimmer.
  - The impostor view blend is a cross-blend with no dither. The mip alpha uses the real map size. A2C stays: the hard-cut A/B
    (`?vegaa=1`) stair-steps under motion.
- **One palette, palms where they fit (item 12):**
  - Every library texture is graded into shared hue / saturation / value bands by per-material gains: tools/v2/vegetation/grade.py ->
    src/world/vegetation/grade.json.
  - The brown weathered palm and the clean gray royal palm now sit in one band. The near-white tropical palm trunk is fixed. Dry-frond
    palms are about 17 % of the inland mix.
  - Placement: royal palms only in avenue rows (curbside, medians, causeways), coconut only near open water, sabal inland, tropical / fan
    palms in yards. The same rule applies in tilebuild (lead committed), the countryside, and set-piece fields (houses, towns).
  - The paper-card models (flat-card oak, date palm, yellow palm) are no longer placed.
- **Grounding (lead / user, urgent):**
  - Every plant stands on the ground exactly as it's drawn: src/world/vegetation/ground.js uses the terrain's own 4 m triangles and
    diagonals, the city ground on real Miami, and raised curbs / sidewalks.
  - The trunk's footprint minimum decides. Sinks are 5-12 cm.
  - Mangrove prop roots go 0.4 m under the sea line in the shallows.
  - Cells near the camera re-sample when the terrain under them changes.
  - A soil / leaf-litter collar decal sits under every near trunk (collar.js), on top of the contact AO and base tufts.
  - Audit API: game.vegetation.audit2(x, z, r).
- **Keys density (lead / user):** clumped noise plus attraction to street edges and lot lines replaces the even spacing. Up to 7 yard
  trees per Keys lot, long hedge runs, and fern / palmetto / sea grape understory under every Keys tree.
- **Nico's street (item 16, with r2-keys):** src/world/vegetation/nicoStreet.js plants the mock-up's off-lot masses: poinciana canopies down
  the north leg and across the east leg, the cottage hedge and canopy, the tree wall behind the roll-off, and the skyline trees. The deck-to-pole
  corridor and the STOP corner are kept clear.
- **A/B flags:** `?vegr2=0` (overnight look), `?vegaa=1`, `?veggnd=0`, `?vegcollar=0`, `?nicostreet=0`.
- **Floating audit** (game.vegetation.audit2 over every drawn library plant, within 150 m;
  docs/v2/reports/veg-r2-c3-audit-after.json):
  | place | plants | countryside floating |
  |---|---|---|
  | Keys shore | 824 | 0 (9 mangroves with their roots under water) |
  | Nico's | 1519 | 0 |
  | city park | 12111 | 0 |
  | beach | 1643 | 0 |
  | rural road | 982 | 0 |
  - Remaining hits were tile palms that stood at curb height (0.08 m) on bare terrain with no sidewalk: Nico's 4, rural 17, the
    worst at 10 cm. Fixed in tilebuild.js (the palm loop grounds non-paved palms on the drawn terrain), waiting for the lead's commit.
  - City park: 13 tile blob bushes report y 0.62 over ground 0. They look like planter tops, not floating plants. Not mine to move
    without the planter owner.
  - r2-ground's independent ray audit agrees: 0 countryside floats > 3 cm.
- **Sheets:**
  - item 10 close-ups (bush 2 m, poinciana 4 m, shade tree 4 m): `docs/v2/shots/vegetation/r2/sheet_item10_closeups.jpg`
  - SR 916 next to user shot_11: `docs/v2/shots/vegetation/r2/sheet_item10_street.jpg`
  - palms next to user shot_13: `docs/v2/shots/vegetation/r2/sheet_item12_palms.jpg`
  - mock-up vs game at the deck camera, and the north leg: `docs/v2/shots/vegetation/r2/sheet_item16_nico_deck.jpg`
  - 10 trunk bases close up: `docs/v2/shots/vegetation/r2/sheet_trunk_bases.jpg`
  - raw shots: `docs/v2/shots/vegetation/r2/*.png`, made with `tools/v2/vegetation/r2shots.mjs` (one-boot A/B, moving camera, post-settle hooks)
- **Perf:** same session, same camera, current vs `?vegr2=0&veggnd=0&nicostreet=0&vegcollar=0`. Draw calls and triangles:
  - nico deck: 702 / 7.9M vs 683 / 7.2M
  - north leg: 725 / 8.7M vs 723 / 8.0M
  - Keys aerial: 762 / 7.0M vs 761 / 6.8M
  - Frame times were not comparable: load average ~380 while the runs went.
- **Open / next:**
  - **Mock-up density (biggest gap):** the deck view still lacks the far red canopy and the dark tree wall at the top right. The street
    spots now plant reliably, but the sheet was shot while nicoHouse.v2.js failed to load in other runs.
  - **Poinciana bloom:** still red leaf cards from a recolored oak. A real poinciana model is requested in MODEL_REQUESTS_r2.md,
    together with sea grape, gumbo limbo, sabal with boots, bougainvillea, hibiscus / croton / ixora, saw palmetto / sea oats /
    sawgrass, buttonwood and red mangrove.
  - **r2-art leaf_1_c rows:** gray leaves at South Beach under miami-city, and a vegField_coconut at L 0.455. Not yet traced to a model.
- **13:10 (after the crash): denser and clumpier everywhere, live oaks no longer sunk** (commit "r2-veg: clumpy dense parks...").
  - Park and rural roadside biomes now use the Keys clump distribution, with an understory under park trees.
  - Trunk footprint is now the trunk itself, sink 4-10 cm. The 13:00 audit (docs/v2/reports/veg-r2-d1-audit-after.json) found live oaks /
    shade trees at 15-18 cm (r2-ground's report too): 28 sunk at Nico's, 32 in the park, 84 rural. Re-audit: docs/v2/reports/veg-r2-d2-probe.json.
  - Density at the same 120 m audits: Nico's 204 trees / 436 shrubs, park 164 / 581, rural road 292 / 508.
    Shots: `docs/v2/shots/vegetation/r2/d1_park_eye.png`, `d1_rural_eye.png`, `d1_nico_deck.png`.
- **14:40, lead's vegetation-mass review at the deck camera** (commit "r2-veg: lush Keys yards...").
  - New src/world/vegetation/lotPlanting.js plants every Keys house lot within 150 m of the camera:
    - foundation shrub clusters hugging the house
    - 1-2 canopy trees on thin lots
    - understory / ground cover under every lot tree and palm
    First run: 27 lots and 484 plants around Nico's (?vegyards=0 for A/B).
  - Pole sight line kept clear for r2-keys, plus tall planting on the deck view's left.
  - Lot trees on real-Miami ground no longer sit 15-18 cm deep.
  - r2-look's leaf light: wider yellow-green back-light, always-on transmission, desaturated crown core.
  - 3-way (mock-up | before | after) at r0b_deck plus street level: `docs/v2/shots/vegetation/r2/three_r2veg_deck.jpg`.
  - Honest read: at the deck camera the change is still small. The mock-up's far red canopy, the dense street-edge hedges and the
    tree wall behind the roll-off are not there yet, because 48 of 81 street spots were skipped as occupied / not clear in that run.
    Next: diagnose the skips per spot (audit of clearAt / collider hits) and move the masses onto free ground.
  - Perf: deck 915 draws / 8.5 M tris vs 805 / 8.3 M before. Frame 42.9 vs 43.2 ms, same session.
- **16:xx: bolder Keys pass + foliage look + trunk colliders.** Commits: "r2-veg: bolder Keys yards and street edges..." and afce3e49.
  - Street spots: a looser plantable() test (only water, roads, paving, a structure overhead or a low deck block a plant). Every Keys
    lot gets hedge runs on all four property lines, bougainvillea on some fences, up to 20 foundation shrubs, and a canopy tree that
    overhangs the street. 26 lots / 1411 plants around Nico's.
    3-way: `docs/v2/shots/vegetation/r2/three_r2veg_deck2.jpg`. The street level now clearly differs; the deck view is still close
    to the old one (mostly Nico's own lot).
  - Foliage look (lead / user "layered, splotchy"):
    - per leaf-cluster color variation, a few dead leaves, darker undersides
    - palm fronds folded along the rib
    - flowering shrubs and bushes 3x denser with 30 % smaller cards
    - foliageVolume() so set-piece card plants share the look. r2-keys switched the planter bougainvillea to the library model.
    - Close-up: `docs/v2/shots/vegetation/r2/h1_u_planter_12h5.png` (A/B and 16:00 in `h1*`).
  - game.vegetation.trunksNear() for r2-physics' trunk colliders. Sin-free instance hash with a CPU twin, so collider and drawn trunk
    match. Includes r2-render's dither / A2C / near-fade hunks.
  - Open: the deck-view mass (far red canopy, tree wall behind the roll-off), 40 street spots still rejected, r2-perf's vegLodScale.
- **Evening (commits afce3e49, 134439d8, 1888f202, 02e48150):**
  - **Foliage look:** per leaf-cluster color, dead leaves, darker undersides, folded palm fronds, 3x denser 30 % smaller shrub cards,
    a -0.7 leaf mip bias with 62-65 % volume normals (crisp leaves at 3-5 m), and foliageVolume() for set-piece plants.
    Sheets: `sheet_foliage_look_ab.jpg`. Map-wide census: every library species is on the volume material.
  - **trunksNear():** for r2-physics' trunk colliders, with a sin-free instance hash and its CPU twin.
  - **Ground:** Keys weeds in clusters (weedPatch mask shared with r2-ground); yard planting avoids parked cars; only real paving lifts
    a plant over the drawn terrain.
  - **The user's HD models:** royal poinciana x3 (now the poinciana everywhere), HD hibiscus, and the HD red mangrove as the only
    mangrove. Per-model base scale. The crotons converted without textures and are not placed.
  - **Draw calls (r2-perf round 3 a):** per-model atlas merge of leaf / bark parts. 94 parts merged; visible vegetation meshes
    471 -> 382 at the spawn; total draws -5 to -10 % at the spawn, Keys street and planter. Same look (`sheet_merge_ab.jpg`).
  - **Incidents (each fixed within minutes):** at 13:30 a `//` comment broke the city boot; during the merge work a GLSL `#endif`
    broke every vegetation shader for ~25 min. Edits now go through a temp-file node check, and runs are checked for "Shader Error".
  - **Open:** the deck view's tree wall behind the roll-off; 40 rejected street spots; game.vegLodScale for r2-perf; textured crotons.

## r2-web
- **PAUSED 13:05** on the lead's order (no upload until the graphics update and an efficiency pass are done). No browser runs started after the pause.
- **Measured before** (`tools/v2/web/netboot.mjs`, 06:30 dist on 5201, 50 Mbps / 20 ms, cache off; `docs/v2/reports/web-boot-base5201.json`):
  - The loading-screen art paints at 2.9 s. The title only appears after READY: **1,979 requests / 398.7 MiB before the title**, which takes at least 67 s at 50 Mbps for the transfer alone.
  - Before control: 3,129 requests / 508.8 MiB, at least 85 s of transfer. The machine was at load average 150-390, so the measured times (READY at 532 s) are CPU-bound and not comparable.
  - Biggest items before READY: nicoHouse textures 61 MiB, vegetation 42, city/pbr 38, ground textures 36.5, road textures 33, the whole car fleet 31, street kit 25, humans 17, all guns 16, legacy characters (Michelle / Xbot / Soldier) 10. Radio music also streams during the warm-up's car sit.
- **Done, committed, flag OFF by default:** the quick title (`src/ui/menu/quickTitle.js`, turn on with `?quick=1`). It has the same look as the real title and is up in **0.9 s** on dev, with 14 requests / 0.9 MiB.
  - The menu works while the world loads and shows "Loading the world N%". New Game / Continue go straight to the loading screen, which shows real boot progress. At READY it hands over to the real front end in the same state through `fe.quick` (frontend.v2.js).
  - Booted end to end on dev (title, menu, loading, Key Largo, control) with no errors from these files. Shots: `docs/v2/shots/r2web/devquick_first_{title,afterpress,ready,control}.jpg`.
  - To switch it on: set `QUICK_DEFAULT = true` after one more boot on a Pages build.
- **Done, committed, inert outside the Pages build:**
  - the offline cache (`src/web/offline.v2.js` + `tools/v2/web/sw.template.js`). It's versioned per build: each cached file keeps its content hash, and a new build drops only the files that changed. The page is network-first, music is never cached, and the files the first visit loaded are copied in from the HTTP cache.
  - the key-art preload, the resource-timing buffer and the `data:` favicon in index.html.
- **Tools (committed):**
  - `tools/v2/web/build-pages.mjs`: Pages build with PAGES_BASE=/gta6/; public is hard-linked, not copied. It drops every `originals/` folder (67 MiB of duplicate club songs) and stale Miami builds, minifies JSON, Draco-compresses the uncompressed GLBs (16-bit positions, skinned and morph models skipped), and writes sw.js + sw-manifest.json + .nojekyll. `--app <checkout>` builds from a clean worktree.
  - `pages-serve.mjs`: case-sensitive server under /gta6/ with Pages MIME types and gzip.
  - `check-pages.mjs`: MIME spot check, then boots like a player. It fails on any 404, case mismatch or console error.
  - Static case scan of the URL literals in src and the references in public JSON / glTF: **0 case mismatches**. The first check run (before the crash) logged only /favicon.ico, now fixed.
- **Last build** `../pages-gta6`: 3,564 files, **893.0 MiB** (Draco saved 97.4 MiB; without it 990.3 MiB). **Not yet booted in a browser.**
- **Left for the upload step** (in this order):
  1. Wire `src/web/entry.js` into index.html (`<script src="./src/web/entry.js">`). It's a small first chunk, so the title paints before the 5 MB engine chunk. It was tested on dev via a copy of index.html.
  2. Boot-check `src/web/gltfDecoders.js`. It gives every GLTFLoader a Draco / meshopt decoder and is required for the Draco build. Not booted yet.
  3. Run `node tools/v2/web/check-pages.mjs --dir ../pages-gta6 --repeat --q "&quick=1"`, then compare spawn shots of the Draco and `--no-draco` builds.
  4. Turn on `QUICK_DEFAULT`.
  5. Re-apply the bandwidth gate `src/web/netGate.js` (committed, unused): the fleet's background queue in glb/index.js and the non-start guns in warmup.v2.js should wait until control. These edits were reverted, not booted.
  6. Progressive textures: low-res first, full detail streams in after control. This is the big remaining lever, about 150 MiB of loose textures before READY.
  7. Then deploy, and re-measure against https://silasedel.github.io/gta6/ (first visit, control, repeat visit through the service worker).

## r2-ground
- **Summary (13:05).** Two commits (`git log --grep r2-ground`): item 6 (car outline) + puddles, then items 5 / 16 / 17.
  Sheets (JPG q90, before | after): `docs/v2/shots/ground/R2GROUND_waterline_ab.jpg` (row 1 = the user's shot_05),
  `docs/v2/shots/ground/R2GROUND_car_outline_ab.jpg` (row 1 = the user's shot_06). Single shots `docs/v2/shots/ground/{c2,g2,g4}_*.png`.
- **Item 6, outline around cars on grass / sand: fixed.** Cause: cars were rasterized as boxes into the ground mask's B
  channel, which also carries the mulch rings at street trees (half value); the bilinear edge of a car box crossed the mulch
  band, so every car got a jittered dark mulch outline, and grass was cut in a lagging box. Now cars are analytic per-frame
  rounded footprints (`gmCarPress` in surfaceMask.js): grass, ground cover, my grass clumps and lawn blades are pressed flat
  and splay away from the body with a soft 0.7 m car-shaped falloff, no lag while driving. Verified parked and driving on grass and sand.
- **Item 5, waterline: done.** The white band in shot_05 was the ocean's shore-foam term on a ~20 m distance field (blocky)
  plus a dark damp band. Now: the ocean reads a true per-pixel depth from a top-down height cascade of terrain / seabed /
  beach sand near the camera -> see-through shallows (absorption by depth, aqua over sand, teal deeper), reflection that thins
  out at the edge, soft breathing edge, thin broken foam lap line, tiny wavelets running in. Terrain side, per pixel from the
  height above the still water: a swash sheet rushing up and draining back (foam at its front, bubble line at the top of the run),
  dark glossy wet sand in the swash zone, damp sand fading up the beach, wet sand with cellular caustics under the water (terrain
  and seabed). Smooth waterline contour (no raster sawtooth), seabed shelf runs out ~40 m (no step), sand neutral per ART_STYLE.
  Water looks right from the beach, the Keys shores, a car on the road and the air (`g4_beach_air.png`).
- **Item 17, grass and terrain.** Near grass from the user's Grass Clump 1 (green / dry) in `src/world/ground/grass.v2.js`
  (scrub, meadow, verges, Keys sand patches; r2-veg's grade + ART_STYLE luminance; r2-veg removed its open-ground tufts so
  there is no double layer). Micro-relief system in `src/world/terrain/relief.js` (swells, mounds, drainage lows, roadside swales,
  flat at roads / buildings / claims / shores), folded into `data.terrainHeightAt` so mesh, colliders and placers agree; it is
  **OFF by default** (`?relief=1`) after the user's floating-tree report, until every placement is verified on it. Drainage-low
  and verge puddles fill after rain. Keys yards / lots: soft-bordered dirt / shell / sand mosaic and leaf litter.
- **Item 16, Nico's yard ground** (with r2-keys, who owns the sheet): puddle API `src/world/ground/puddles.js` (fills with rain,
  shrinks as it dries, ripples) used at the drive end; `game.groundGrass.patches` dense green-gray mats on r2-keys' 22 matted
  patches; shell terrain ring around the lot (no seam at the sheet's sunk edge); yard swells are in r2-keys' sheet.
- **Grounding audit** (`tools/v2/ground/grounding.mjs`, `docs/v2/reports/ground-grounding-r1.json`, relief off): no tree / palm /
  countryside base floats > 3 cm at Nico's, the mangrove shore, the beach or a rural road; the '?' floaters were car wheels
  (origin at the axle, not a bug). Routed: live oaks sunk >= 15 cm (r2-veg, fixing), lot-props bins at y = 0 on raised ground (r2-physics).
- **Also:** LOD terrain polygon offset (no z-fight with the near terrain, r2-cars' sand report), elevated concrete neutral with
  formed soffit panels (r2-art), city sand neutral and brighter (r2-art).
- **tilebuild note for the lead (not committed by me):** land-base material: after `lbMat = M.far.clone()` (~line 3364) add
  `lbMat.metalness = 0; lbMat.roughness = 0.92;` (r2-art row: metalness 0.1 -> 0).
- **Left / honest gaps:** relief stays off until verified with every placer; ocean far-field (beyond 256 m) still uses the
  coarse shore field; the shore field takes ~30-60 s after load to build; light triangle patches near docks in the shallows
  (underwater terrain strip vs seabed) are faint but visible from the air.
- **Second pass (14:xx), committed:** physically shaded water: two passes over one surface (multiply = per-channel
  Beer-Lambert transmission of the drawn seabed over the refracted view + sun path, sigma (0.42, 0.072, 0.034) /m; additive =
  in-scatter, Schlick Fresnel sky reflection, glitter, foam). No painted teal ramp; clear in the first 0.5 m, aqua at 1-3 m,
  blue past 6-10 m. Seabed: gentle flats (0.7 m at 20 m, 1.6 m at 40 m, 5 m at ~90 m), carbonate sand + seagrass, and it is a
  Rapier heightfield at the drawn height (user bug: truck fell through 30 cm of water). Probe `tools/v2/ground/probe_shallow.js`:
  200 shallow points at two Keys shores, 0 missing colliders. Remaining 'off' points = flat 0.00 tile collider over water
  (QA-030, tilebuild). Dark sticks in the shallows = tilebuild guardrail (routed). Keys sand grass now in clumped patches.
  Shots: `docs/v2/shots/ground/w2_*.png` (physical water), `d3_*.png` (depth / data debug). Relief stays OFF (?relief=1).

## r2-cars
- **Item 2, seats (shot_02, the woman through the hood):** cause = drivers were placed from a glass-derived "windshield base"
  that is wrong on many models (sedan3's sits inside the hood). All library models now carry measured seat anchors (driver,
  front passenger, rear row: hip / H-point, heel, steering wheel center + radius + tilt, headliner, inner door) from
  `tools/v2/cars/seats.py` (template match on each interior section; 26 hand-corrected via cars.json `seatFix`). Manifests +
  index.json carry `seats` / `wheel`; runtime `v.seatAnchor(i)`, `game.vehicles.seatAnchor / seatWorld / addDriver / removeDriver`
  (README "Seats"). AI drivers sit on the hip; r2-people owns the pose (src/npc/seat.js seatCharacter, picked up automatically)
  and Nico's seat (src/player/seat.js). Sheets: `docs/v2/shots/cars/r2/seats_a.jpg`, report `docs/v2/reports/cars-seats.json`.
- **Item 3 + 16, Nico's cars (user's new models):** pickup = `truck9` (Models/Cars/Trucks/Truck 9 - Off-Road Performance
  Pickup, catalog row added): silver metallic 0x8f949b, satin-black stripe = two boxes measured on the model (whole hood +
  cab roof) on PAINT only (glass is its own slot), black fender flares (paint split by wheel-arch band), black grille surround
  and rims, grille / tailgate lettering flattened + darkened, light sand dust. Second car = `coupe4` (the 1970 muscle hardtop):
  own paint slot only, sun-faded powder blue 0x7a9198 solid enamel (no flake), fade 0.6 / rust 0.32 / salt crust, 'old' look
  (flat milky chrome, chalky rubber, dusty hazy glass, faded interior, whitewalls). Spots from r2-keys (truck9 [-12.4, 8.4]
  h 2.35, coupe4 [-18.8, 5.5] h 1.03). The old convertible conv1 got its real PBR atlas (tan interior, chrome, glass windshield)
  and stays in the fleet; Coupe 5 (1965 pony coupe) joined the fleet as `coupe5`.
- **Item 4, sand:** soft ground (sand 1, mud 0.8, dirt 0.45, grass 0.3 via game.sand + surfaceAt): -20 % engine, -30 % grip,
  -22 % side stiffness, rolling resistance 1.1 + 0.045 v m/s2, 3.5 cm visual dig-in. "Tires show through" = two terrain layers
  drawn 5-7 mm apart under the car (terrain + terrain-lod); r2-ground fixed it with a LOD polygon offset.
  `docs/v2/shots/cars/r2/s2_sheet.jpg`, `docs/v2/reports/cars-r2-sand.json`.
- **Item 14 + shot_26 (paint painted over everything):** paint only lands on paint now. Converter: texture paint masks for
  atlas-painted models (`paintTex`: body-color texels -> paint, windows -> glass, chrome / lamps / grille / mirrors keep their
  texture), conv1 / truck2 windows split out; truck2 (atlas mixes body, livery and windows) retired to parked work truck.
  Root cause of the big black patches on one front + the opposite rear corner (sedan1 / 2 / 8 / 10 and other sideways-authored
  models): stale face normals after the converter's rotation deleted panels as "inner skins"; fixed, flipped outer panels are
  flipped back, black under-shells hidden behind the paint removed. Maker marks: flush lettering on painted panels deleted, other
  badges filled from the dominant surrounding slot, plus boxes for the stubborn ones (~10 models). Still faint: suv5 rear roundel,
  suv4 grille emblem relief, suv12 grille lettering relief. Studio checks in 3 paint colors: truck2 / conv1 / coupe2 / suv2 /
  van1 / truck7 / sedan1.
- **One style (user's 09:40 bar + r2-art audit):** trim pulled into class ranges at load (chrome neutral 0.55-0.8 / rough
  0.08-0.5, dark "metal" -> dielectric, plastics 0.025-0.62 / rough >= 0.32), paint albedo cap 0.72, env 1.0, metallic 0.6 / 0.36,
  'solid' enamel finish for classics, chalky fade, pitted rust with bloom + halo, +-4 % tone drift, clear-coat orange-peel
  breakup near the camera, glass env 2.6 -> 1.35. Materials named car-paint / car-glass / car-trim / car-wheel.
- **Also:** parked cars only on clear spots (r2-physics clearance.js: findCarSpot / watchParked), no curb parking 15 m around
  Nico's STOP corner and his drive mouth (`game.vehicles.addNoParkZone`), visual wheel cap hook for carphys 2.
  Model requests (minivan, school / city bus, garbage truck, motorcycle, scooter) in MODEL_REQUESTS_r2.md.
- **Lamps (user: "the lights don't look like normal lights"):** the shared lamp shader now builds a real lamp on every car:
  clear polycarbonate lens (clear coat 1 @ 0.035: sharp sun / sky reflection), faceted chrome reflector bowls behind head / fog /
  reverse / DRL, deep tinted tail / brake / blinker lenses (color darkens at grazing angles, optics ridges), lit lamps glow from a
  hot core through the facets (no flat emissive slab). Studio A/B with `?lampv1`, close-up views `lampF` / `lampR`.
- **Paint colors (user: "way too many pink and orange cars"):** US / Miami table: white 25, black 22, gray 19, silver 11,
  blue 9, red 8, earth 4, loud 2 %, with finishes per bucket (whites solid / pearl, silver / gray / blue mostly metallic). Cause of
  the loud cars: models with a 'sport' palette (orange + yellow + light blue = 1/3 of their rolls) and palette models keeping the
  catalog's own color; every everyday model now rolls the table (a 'pal' only shifts its weights); rare cars keep one factory color.
- **Sheets:** Nico's yard at the deck camera `docs/v2/shots/cars/r2/nico_deck_3way.jpg` (mock-up / this morning / now);
  lamps before / after, day + night `docs/v2/shots/cars/r2/lamps_ab.jpg`; Nico's cars studio + seats `docs/v2/shots/cars/r2/seats_a.jpg`.
- **Passengers:** 0-2 per AI car (~30 % one, ~8 % two) on the measured seats via r2-people's createDriver + seatCharacter;
  front-row anchors slid 6 cm toward the wheel (occupied seat), coupe2 hip lowered; side glass no longer an opaque mirror.
- **Lettering audit (lead lamps review item 1):** new converter tools: `patchBoxes` (delete a lettered area, close it with one
  flat panel 2 mm behind the skin; `fit` follows a raked panel; `mat: trim` + `oval` = a blank dark badge), `cloneBoxes`
  (copy the grille mesh from the next row over raised letters), `lampkill` cut mode (letters modeled in the lamp slot),
  `paintBoxes`, fitted `flattenBoxes`. Clean now: suv10 / suv14 / truck9 tailgates, truck9 grille (plain honeycomb), suv5 rear
  roundel, suv4 grille (blank oval badge) + rear badge hole. super5's horseshoe keeps faint grille marks (a fix broke its hood
  spine; reverted to HEAD).
- **Truck9 (lead truck review + user screenshots):** window glass no longer goes through the LOD0 collapse (planar dissolve
  instead; the collapse had folded the side windows into a few long triangles = the white triangles in the cab and the
  "missing" driver window), black B-pillar applique, molded black flares drawn per pixel by the paint shader (no sawtooth),
  grille-surround teeth on the hood edge gone, light warm silver 0xc9c7c1 metallic, graphite stripe panels (~0.13 linear,
  satin under a soft clear coat) with a lighter 2 cm pinstripe edge, roof band 0.78 m with silver both sides. Scale checked
  against the class (L 5.89, wheelbase 3.62, tire 0.89 m: correct); the game model's cab is low (cushion 0.93, headliner
  1.86 m), so the seats are dropped 14 cm front / 10 cm rear in the converter (`seatDrop`) and the anchors re-derived.
- **Paint audit (measured in game, 61 cars at 4 spots, binned by the US table bucket each car rolled):** table cars: white
  13, black 8, blue 7, gray 6, silver 5, red 2, loud 2, earth 1; 17 rare / hero cars keep factory colors (7 earth-toned, 5
  white, 2 red, 1 blue, taxi orange). No pink; the only orange is the taxi livery. (The first run's "34 % earth" was the old
  classifier reading the shaded material: wear and tone drift tint near-black paint.)
- **Names:** real model names removed from the fleet and the procedural catalog (Raptor -> Ridgeback Sandhawk TR; Vesta,
  Meridian, Sovereign, Scirocco, Uno, Volt, Grandeur, Corsa, Breeze, Terra, Scout, Interceptor, Traveller, Elan, Brisa, Testa
  renamed).
- **Distance LODs (user: "from a distance the paint jobs get screwed up"):** the converter's LOD1 / LOD2 were one collapse over
  the whole body (lamp / trim / glass triangles across the paint, torn panels, spikes meters long). Now per-slot decimation, glass
  kept or planar-dissolved, spike faces dropped, angle normals, budgets 20k / 5k, LOD2 from 160 m; whole fleet re-converted
  (super5 excepted). Grime speckle fades with distance. Sheet: `docs/v2/shots/cars/r2/lod_distance_sheet.jpg` (10-150 m).
  Left: police1 LOD1 door gap, van6 LOD2 (now only past 160 m).
- **Truck9 final:** stripe graphite 0x515458 under an ~8 % satin coat, flares plastic black, interior charcoal, body 0x9a9ea3,
  tires 14k tris. Sheet `docs/v2/shots/cars/r2/truck9_3way.jpg`.
- **Minivans (user models):** van6 Halcyon Harbor 8, van7 Marlin Tidewater LX; class `minivan` in every zone mix.
- **Headroom:** `tools/v2/cars/headroom.mjs` (tall NPC + Nico in every seat); hand-checked anchors are `fixed` (r2-people's
  probe keeps them), van3 / super4 lowered, truck9 seats dropped 14 / 10 cm.
- **Final pass:** LOD2 out of the chain (per-slot LOD1 to the culling distance, all 54 LOD1s audited whole); truck9 fender cap
  never sinks a tire more than 3 cm under the physics contact; drivers / passengers picked to fit the seat (r2-people's fit filter;
  run 4 still shows 49 passenger seats < 6 cm, list sent to r2-people); 13 driver H-points lowered after headroom run 3.
- **Service trucks:** truck10 Atlas Hookline 90 tow truck (traffic + parked), truck13 Atlas Southline Sanitation FL refuse truck
  (residential traffic); sheet `docs/v2/shots/cars/r2/service_trucks.jpg`. Not done: an invented sanitation livery texture (the
  model's blue livery stays, logos dropped; faint maker text on the front bumper), daytime-only garbage runs, truck12 (no wheels
  found), truck11 (cab-chassis, converted but unused), city bus.

## r2-people
- 19:00 **Final.** All 76 new user people (NPC 96-171) in the game (173 people total), named from previews (folders +
  Models/catalog.csv, on disk), rigged with the user's quality notes (shirt-print relief flattened, white hair-edge fringe
  recolored, stray bits dropped, fixed thumb lanes) and cast by role: 7 gang members only in gang crews (kit.js 'gang'),
  9 police (preloaded, kept resident: squads are all user officers), 6 lifeguards at posts, beachgoers to beaches, Keys
  fishermen / captain / airboat guide at docks, workers at their venues, elderly residential / park, kids park /
  residential only (never drive or stand in for missions; not yet paired with an adult). None too broken to use.
  In game: `docs/v2/shots/people/r2_new_people_sheet.jpg`. Brand marks erased on p110, p144, p147, p148, p169; p167's
  script is no longer red but a faint ghost remains. Open: melted-finger geometry is not rebuilt (the hand rig bends it).
- 18:30 **Far crowd of the user's people ON by default**, cost verified by r2-perf (in-session ABAB x3 downtown,
  `docs/v2/reports/r2-perf-probe2.json`): the on / off difference is inside the noise, under the 2 ms target (half-rate
  far walkers, no re-upload for still people, bake waiting list, incremental bakes). Every NPC path uses the user's people
  (repeats allowed beyond 45 m); no archetype library loads anymore. Seat probes cached per car model + seat. People are
  picked per seat by its real headroom (0.56 x stature + 8 cm); the passenger headroom report needs one re-run
  (`tools/v2/cars/headroom.mjs`). Boats: Nico at the airboat seat / helm (`docs/v2/shots/people/r2_boats_sheet.jpg`).
- 16:10 **Final state.** All committed (pathspec). (1) **Seat solver never trusts a stale anchor** (lead: Nico's head
  through the re-converted truck9): per car model + seat it raycasts the car's own meshes down onto the cushion (hip =
  cushion + 10 cm when the anchor is off) and up to the headliner (roof = min(anchor, probed)); head-room ladder: arm-reach
  lean off -> sink up to 8 cm -> recline +14 -> chin tuck -> sink 12 cm -> recline +26. truck9: Nico's crown 3 cm under
  the real roof; truck2's hip raised 6 cm onto its cushion (`docs/v2/shots/people/r2seat/n3_nico_truck*`).
  `probeSeat()` is exported for r2-cars' fleet headroom test (`tools/v2/cars/headroom.mjs`). Seated people beyond 45 m hold
  their pose (no mixer / solve). (2) **Far crowd of the user's people: built, visually verified (120 far people, 0 errors),
  NOT switched on.** The frame-time A/B (`node tools/v2/npcs/crowd-ab.mjs`, report
  `docs/v2/reports/r2-people-crowd-ab.json`) could not finish on the loaded machine (one pair: old 78 ms vs people 189 ms
  median, both noisy; the watchdog killed the second pair). Bakes are now incremental (one clip per frame). To turn it on:
  rerun the A/B on a quiet machine and flip `FAR_PEOPLE` in `src/npc/people.v2.js` to default on if there is no loss.
  (3) Open: 2-3 scans have a separate thumb-tip island that tears a little when flexed (flexion kept low).
- 14:45 **Nico's posture** (user: "shoulders too low, like he's pulling them down"): the relaxed-stance layer
  (`src/player/nico/pose.js`) dropped the clavicles 7 deg and pulled the arms in. Now chest up, clavicles up a touch
  and back, arms hanging clear of the lats; also under the phone / talk / aim stand poses and lighter while walking.
  Sheet `docs/v2/shots/player/r2_nico_posture_sheet.jpg` (before / after, back, 3/4, side); walk / run / stop
  `docs/v2/shots/player/r2_n2_new_*.png`. A/B in-session: `globalThis.__nicoPoseOld = true`.
- 14:20 **Nico in the driver's seat, 8 cars** (`src/player/seat.js` now uses the shared solver + a 0.55 s slide from the
  door): `docs/v2/shots/people/r2seat/n1_nico_<car>_win|chase.png` (conv1, truck9, sedan3, suv2, hatch1, coupe2, van1,
  super4; glass hidden for the window views). Hands on the wheel, hips on the cushion, head under the roof (the head
  now wins over arm reach in low cars).
- 14:10 **Hands, all 97 people re-weighted** (`tools/v2/npcs/hand_pass.py` / `hand_pass.sh`, rig-only, from the rigged
  .blend files): the rigger's lane split put the thumb in the "Index" lane for most people (every finger one lane off,
  Thumb bones empty and floating in front of the hand = the stub-thumb / claw look). Now the thumb is found as its own
  lane along its own axis with joints inside it, fingers sit on their real lanes, joint blends are soft. Poses
  (`src/npc/arch/anim.js`): fingers bend together with natural joint ratios, thumb rests along the index, fists / grips
  on the action clips, fingers follow the gait swing and breathe at idle. 12 people at rest:
  `docs/v2/shots/people/r2_hands_12.jpg`. Remaining: on 2-3 scans the thumb tip is a separate island that tears a little
  when it flexes (flexion kept low for that reason).
- 13:25 **Seating (item 2) and non-user people (item 15)**, committed:
  - **Shared seat solver `src/npc/seat.js`** on r2-cars' measured seat anchors: hips on the H-point, torso reclined, head
    kept under `roofY` (recline, cushion sink, chin tuck; convertibles skip it), legs IK to the footwell (right foot on the
    pedal), driver's hands on the rim at ten-to-two following `v.steerCur`, passengers' hands on the thighs, elbows kept
    inside the door, seat slides up to 8 cm toward the wheel. Used by AI drivers + passengers (vehicles.js), cop drivers
    (police.js) and Nico. 8 cars x driver + passenger from both windows and the chase cam:
    `docs/v2/shots/people/r2seat/t2_*` (glass on), `t3_*` (glass hidden); numbers `docs/v2/reports/r2-people-t2.json`.
    The shot_02 "woman through the hood" class is gone.
  - **Non-user people removed:** `game.npc.createDriver` (traffic uses the user's people; kids / teens never drive; no
    police, lifeguards or swimwear in civilian cars); no archetype / old-library stand-ins while the cast is on (peds,
    staged people, promenade strollers, legacy interior staff and guests, activity NPCs; mission spawns take the best
    loaded civilian); police people preloaded at boot.
  - **Far crowd tier** (30-185 m, was the procedural mannequin body) rebuilt from the user's people
    (`src/npc/people/farCrowd.js`: each person's own LOD2 mesh + albedo, GPU-skinned from a bone texture baked from the
    game's clips, one instanced draw per person in view). 120 far people from 50 people downtown, 0 errors:
    `docs/v2/shots/people/r2crowd/f1_*.png`. Flag `?farcrowd=people` (A/B frame time running, then default on).
  - **Lifeguards** c01 / c02 (Models/Characters 1-2): manual T-pose pass (`tools/v2/npcs/apose_lifeguard.py`), rigged,
    lifeguard posts on the sand only. Shots `docs/v2/shots/people/r2_lifeguard_*.png`.
  - Model requests (kids, elderly, swimwear, work uniforms, cyclists) in `docs/v2/briefs/MODEL_REQUESTS_r2.md`.
- **Bug fix: all-blue minimap and "MIAMI" at the Key Largo spawn (play server).** The map renderer was not the cause. Both symptoms appear exactly when `loadMiamiData()` fails once, after which `city.js` builds the city with no map data (no land, `districtAt` -> 'Miami'). One failed fetch is enough, for example during a map republish or a network hiccup.
  - Fix: `createMiamiCity` retries the data load up to 3 more times before falling back.
  - Repro tool: `tools/v2/mapui/spawn-map-check.mjs <tag> <n>` fails the first n world.json fetches. Before (4 failures): blue minimap and pause map, "MIAMI". After (1 failure, retried): full minimap, Pelican Point Ln, Key Largo.
  - Sheet: `docs/v2/shots/r2-mapui/sheet_spawn_minimap.jpg`.
  - The play server on 5202 runs without a file watcher, so it serves the old city.js until it is restarted.
- 13:55 **Verification sheets** (`?artgeo=0` vs default, eye level plus 2x center crops): `docs/v2/shots/art/sheet_geo2_edgewater_*.jpg`, `sheet_geo2_mbres_*.jpg`.
  - Edgewater: the giant pyramid over a two-story box is now a hip roof with eaves and fascia. No z-fighting and no floating parts in the crops.
  - Both loads boot with a clean console.
  - Follow-up (tilebuild): the hip pitch is now ~28° (0.21 read as a flat lid), and the roofs are weathered asphalt shingle or barrel tile instead of the pale roof-slab tint.
  - Debug counters `__artGeo` (balc / eyebrow / fins / hip) confirm in game which buildings got each detail.

## r2-perf
- **14:00 Summary:** frame rate at 1080p is CPU-bound everywhere on the M3 Max. Draw submission is 12-27 ms per
  frame, physics 3-8 ms, and Nico's yard adds 6-9 ms of character-controller cost. A ranked plan with a method, a
  saving and a visual risk for each cost is in `docs/v2/reports/PERF_PLAN.md`. The tiers, dynamic resolution, perf
  overlay, LOD bias and tile culling are built, all OFF by default. No look changes so far.
- **Profile** (`node tools/v2/perf/r2-prof.mjs`; data `docs/v2/reports/r2-perf-base.json`):
  - places: Nico's spawn, Keys street, downtown, beach, Everglades, night, plus a 30 s street drive
  - per place: frames, CPU per system, render CPU split, GPU per pass, draws, triangles, programs, texture / geometry
    MB, physics bodies, JS heap, per-group submit cost, CPU sampling profile
  - GPU timer queries are unusable under ANGLE-Metal (bloom read 250 ms), so GPU is measured on a readPixels-serialized
    frame. Post passes total 4.3-6.8 ms GPU (bloom 1.6-2.2, AO 0.5-0.8, TAA, grade and output 0.2-0.4 each). The scene
    GPU time hides under its 17-25 ms CPU issue time.
- **Built, flags off.** perfHud, dynres, tiers and lodBias booted inert in another helper's 13:49 boot (no errors from
  them). The flags-on boot check (`tools/v2/perf/r2-boot.mjs`) is still to do.
  - `src/render/perfHud.v2.js`: `?perf=1` or Shift+F3 overlay. Frame-time graph with 16.7 / 33.3 lines, CPU work,
    GPU (where the timer is sane), render scale, preset, draws, triangles, programs, top 5 systems.
  - `src/render/dynres.v2.js`: `?dynres=1`. Holds the preset's target frame time with the internal render scale,
    within per-preset bounds, in 0.05 steps with hysteresis and an anti-pump block. It never scales down when the frame
    is CPU-bound.
  - Hook in `post.js` governor() / scaleFloor() (2 hunks). r2-render carries it in their TAA commit.
  - `src/render/tiers.v2.js`: `?tiers=1`. 3.5 s GPU benchmark plus a renderer-string class pick a preset and a target:
    good -> High at 60, top -> Ultra at 60, mid -> Medium at 30, weak -> Low at 30. `?tier=mid` forces a tier.
  - Guard in `quality.v2.js`: a tier pick is never stepped down by the old 60 fps auto-pick.
  - `src/render/lodBias.v2.js`: `?lodbias=1`. One LOD bias (preset bias / render scale) over THREE.LOD (cars, props),
    the human LOD manager and the detail cull. Bias 1 = today's behavior exactly.
  - `src/render/tileCull.js`: hierarchical view culling of whole city.root children for the main view only (shown
    again around the shadow pass). Parked outside the auto-loader until it is booted and A/B'd.
  - Frame-rate limit option 30 (`src/ui/settings/schema.js`).
  - `src/world/env/shoreFill.js`: a faster drop-in for ocean.js's shore land fill, for r2-ground to merge.
  - `src/render/lod/lodChain.js` + `tools/v2/perf/lodgen.mjs`: meshoptimizer index-only LOD sidecars (`<model>.lod.bin`)
    that keep UV seams, normals and skin, with a hash check. `tools/v2/perf/lodpop.mjs` is the pop test.
  - `tools/v2/perf/cardprune.mjs`: leaf-card pruning with a coverage solve. Not needed: r2-veg's LOD1s are already light.
  - `src/render/taau.js`: draft output-resolution TAAU for r2-render (not wired).
- 14:40 **Facade kit step (lead review of sheet_geo2_mbres_0).** Before/after for all of these is `?artgeo=0`.
  - Magenta bar fixed: it was the Ocean Drive deco sign fins' unlit neon tubes, which drew at full strength by day (MeshBasic, not tone-mapped). They're now dark glass by day and light up at dusk. The fix is in `materials.js` (one line, in the shared working copy).
  - Facade shader:
    - wall tints fade toward Florida sun-bleached paint (linear saturation ≤ 0.5, painted walls lum ≥ 0.16, so no navy / teal cartoon walls)
    - trim and shutter paint saturation ≤ 0.6
    - very low-frequency repaint / mildew patchiness on big walls
    - a 0.45 m darker base course at grade
  - Silhouette: rooftop package units on curbs (sized to clear the parapet), plus a mast or a satellite dish on ~40%, for every procedural block 3.5-46 m.
  - Library share for mid-rises and shops up 0.42 / 0.40 → 0.50 (calibrated library models carry more modeled detail). The 7 px/m motel is retired.
  - Audit `art-audit-rm1.md` (nico + beach, roughness / metalness measured on screen): library vs code-built agree on foliage (0.01 stop) and bark (-0.16 stop).
- **14:20 Stopped on the lead's budget order.**
  - GPU at 1080p (serialized frame): post 4.3-6.8 ms (bloom 1.6-2.2). The scene GPU time hides under its CPU issue time.
  - Hiding the vegetation at the spawn halves the draws (598 -> 317) and the triangles (6.9 -> 3.5 M).
  - The 31 ms beach updater was `city.update` doing teleport catch-up.
  - The queued probe (yard colliders, material census, static-matrix / tile-cull / AE A/Bs, shoreFill equivalence)
    never got a browser slot. The command is in PERF_PLAN.md "Next steps".
  - Committed: my tools and flag-off modules (see the commit).
  - The post.js hunks travel with r2-render's commit.
- **17:00 Resumed** ("2 fps at times, make it ~30 on an M3 Max"). Committed, each A/B'd, on by default with an off switch:
  - streaming readiness fix (QA-045): ?streamfix=0
  - physics sub-step cap: ?physcap=0
  - no interior builds while passing at speed: ?intfast=1
  - Nico's yard collider as a trimesh: ?hftri=0. Spawn character controller 2.49 -> 0.14 ms per call.
  - tile culling: ?tilecull=0
- **Now** (load about 8):
  - spawn 46.9 ms (was about 89)
  - Keys 16.6 ms (60 fps)
  - downtown 26.6 ms (38 fps)
  - Keys drive median 26 ms, p99 49 ms (was 37.6 / 91)
  - fast 50 m/s drive: 6.6 -> 8.9 fps average, frames over 250 ms 75 -> 43
- Details, the drop list and the next steps (spawn draw count, long tile-build steps, collider gaps): PERF_PLAN.md
  "Round 3".
- **17:20** More committed, on by default with an off switch:
  - **Shader precompile with the render-time light set** (?compilelights=0). Every precompile compiled for 1 point / 0
    spot lights, so the real programs compiled at first draw. Fast drive: 17 -> 46 fps, frames over 100 ms 178 -> 12.
  - **One VAO per InstancedMesh** (?instvao=0). vertexAttribPointer per frame: spawn 3533 -> 132.
  - TAA cost checked with r2-render: 0.6-0.8 ms GPU after their cuts.
- **Whole afternoon, same 50 m/s drive:** 6.4 -> 46 fps average, frames over 100 ms 432 -> 12.
- **Standing still** (load 8-10): spawn 39-47 ms, Keys 16.6 ms, downtown 26.6 ms.
- **Left:** spawn render submit (about 1,000 draws, 340 programs; countryside 325 draws), long tile-build steps,
  collider gaps (all in PERF_PLAN.md round 3).
- **17:55 (b) long tile-build steps.**
  - Time-based yields in the building loops (tilebuild, ?tbyield=0; tilebuild ready sent): near steps over 100 ms
    18 -> 8 per drive, frame rate unchanged.
  - Committed: a stream step histogram (streamer.stats.longSteps).
  - Remaining cost:
    - colliders, 54 % of tile-build CPU, a third of it ensureProps re-running buildRoads
    - shop-front dressing, about 30 %: per-vertex JS
  - Neither is a safe single-file fix.
- **Programs and light uniforms:** 207 programs in view (83 custom onBeforeCompile keys x 23 feature sets). The
  shadow-only directional lights can't be dropped without rewriting the split-shadow sampling. The fix is shared
  onBeforeCompile keys per material family, which is owner work.
- **18:40 Collider props pass:** buildRoads writes into sink batches for the collider job (?propsink=0 = old; in
  f2a74e25).
  - Props identical on 16 tiles.
  - Collider job time 34.6 -> 28.2 ms per job.
  - Pending your commit: the async window.__tbDebugProps fix in tilebuild.
  - Paused until FREEZE. Then one clean final measurement.

## r2-phone
The phone now runs on its own OS, "Kestrel OS" (src/ui/phone/). It replaces the old HUD phone.
- **Opening it:** P opens and closes the phone. Arrow Up and pad Up still work, and Esc alone pauses.
  - Settings > Controls shows "Phone: P / ↑" (bindings.js: `bind: ['KeyP','ArrowUp']`; the canonical key is still ArrowUp).
  - While the phone is up, the bindings layer runs in 'phone' mode: arrows, Enter, Backspace, Esc and digits drive the phone, and WASD still walks.
  - The mouse cursor is freed, so you can click apps and scroll.
- **Look:**
  - Rounded device frame in the bottom-right, scaled to about 68% of the window height.
  - Status bar with game time, signal and battery, plus an activity island that shows the active job, wanted stars or a transfer in progress.
  - Home screen: weather and bank widgets, a map widget, two pages with dots, and a glass dock.
  - App open zooms from the icon. Pages push and pop; swipe up on the home bar or drag from the left edge to go back.
  - Light and dark follow the sun (Settings can force either).
- **Bank** (the brand the core money system picks, e.g. Banco Almendares):
  - face-unlock animation
  - balance hero with a 7/14/30-day chart
  - checking, savings and cash on hand
  - activity grouped by day; deposits and withdrawals show as one row
  - transaction detail
  - Send money: contact or account number (ABA-checked), keypad, memo, review, slide or hold to send, success, receipt
  - transfer between accounts; ATM deposit and withdraw (real ATMs; mobile cash deposit with a 2% fee elsewhere)
  - tickets (pays game.fines)
  - card: freeze, daily limits
- **Money rules:** money only moves through game.wallet / game.bank.
  - Instant send: $5k per transfer, $10k per day.
  - Wires: $15 fee, $50k per transfer, $100k per day.
  - Hooks: the Hush Line lowers one wanted star, paying Tiny clears his garage tab, staff bonuses raise morale, and family replies by text.
  - The HUD bank row now flies +/- like cash. Street ATMs (E) open the bank's ATM page.
- **Other apps** (built and screenshotted in the preview only, not checked in the game): Messages (money bubbles, ticket links, quick replies), Phone (contacts, recents, keypad, calls), Maps (HUD map renderer, place search, waypoint), Camera (see-through viewfinder, frame grab), Weather, Work (side jobs, businesses), Wavvy, Settings.
- **Saves:** a new 'phone' save slice (threads, wire limits, payees, credits) registers as soon as game.save exists.
- **Test:** `node tools/v2/phone/wire-test.mjs` runs on the real core systems in Node and passes.
  - A wire changes the balance and lands in the ledger.
  - It survives save → load.
  - An over-balance send fails cleanly, with no money moved.
  - The fee and limit checks hold.
- **Shots:** docs/v2/shots/phone/phone_sheet.jpg (1600x900 at DPR 2, preview page src/ui/phone/preview.html with the real core systems).
- **Lead:** src/main.js lines 205 and 532 (walk and drive with the phone up; honors the 'phoneWalk' setting) are in the working tree, uncommitted, because main.js also holds r2-web's work.
- **Not done:** an in-game run of the full flow; the boot check ran on the HUD test page only. I stopped on the budget call.
- **14:20 Loading bar weighted by measured time** (commit `Loading bar weighted by measured time`, booted on 5200, 0 console errors). Plot: `docs/v2/shots/r2web/loadbar_before_after.jpg`; frame strips: `loadbar_before_*.jpg` / `loadbar_after3_*.jpg`.
  - **Before:** 50 % at 10 % of the boot time, then parked at 99 % ("COMPILING SHADERS") for 26 s.
  - **After:** 8 / 17 / 50 / 78 / 91 % at 10 / 25 / 50 / 75 / 90 % of the time. It never goes backward; the longest stall is 2.0 s. The one 3.4 s stall is during a 3.2 s main-thread block in the first warm-up frame, when nothing can repaint.
  - **How:** `src/core/loadProgress.js` + `loadWeights.json` (each browser keeps a running average in localStorage); phase labels under the bar; `?lp=0` = old milestones; `node tools/v2/web/loadbar.mjs --boots 2` traces it.
  - Stopped here on the budget order.

## r2-water
**Summary (r2-water, Nov 17 afternoon):** boats now float on real per-point hydrostatics, carve, plane, pitch and drop their bow, and beach on their bottoms. There is a drivable airboat (fan boat) built from the user's Boat 10, with stands along the Everglades roads and sheet water over the sawgrass. Cars wade through shallows and sink believably in deep water. Sheets (JPG q90, left = before, right = after):
- `docs/v2/shots/water/sheet_airboat_glades.jpg`: sawgrass glide, chase cam, close-up
- `docs/v2/shots/water/sheet_speedboat_waves.jpg`: racer in the swell
- `docs/v2/shots/water/sheet_beaching.jpg`: center console run onto sand at 60 km/h
- `docs/v2/shots/water/sheet_car_sinks.jpg`: sedan off a seawall

Report JSONs: `docs/v2/reports/water-drive-{before,after}.json` (same spots both runs: `tools/v2/water/spots.json`). Test: `node tools/v2/water/drive.mjs --scene airboat,speedboat,beach,car,wade,stand`.
- **Boat physics v2** (`src/vehicles/boats/hydro.js`, used by `boatTick2` in `boats.js`; **on by default**, `?boatphys=1` = old):
  - **Buoyancy:** ~21 hull sample points per boat (keel line + both chines, stem to transom). Each point lifts by its own submerged depth against the shared swell plus other boats' wakes, pushes along the wave normal, and is damped on its own velocity (v + w x r). Pitch, roll and heave come out of it.
  - **Drag:** lateral grip is per point and stronger aft (the boat carves). It loosens as the hull planes. Forward drag and air drag are separate.
  - **Planing:** planing lift fades as the hull climbs out.
  - **Weight transfer:** a PD trim gives squat in the hump, 4-7 deg running trim (was a 15-23 deg wheelie with the hull 1.2 m out of the water), and a bow-drop on a throttle chop.
  - **Ground contact:** a spring + Coulomb friction on the slope normal with sand / mud plowing. A beached hull grinds up the sand on its bottom.
  - **Colliders:** the hull collider floor is lifted 7-14 cm, so the convex hull no longer catches terrain triangle edges. Hopping is gone.
  - **dockGuard:** no longer mistakes a sloping beach for a pier deck (was sliding beached boats back at 9 km/h).
- **Shared waves** (`src/world/env/waves.js`): one Gerstner sum for the shader, buoyancy, the player swimmer (`main.js`) and NPC swimmers (`peds.js`). Calm (exactly 0) within 12 m of the shore, full from 60 m, read from r2-ground's shore field. Agreed with r2-ground: one `// r2-water` block in `ocean.js` after their two-pass commit. Until then `?waves=2` patches both ocean passes at runtime. Waves are off by default, and the physics uses a 16 % chop so no hull bobs against a flat plane.
- **Airboat** (`src/vehicles/boats/airboat.js`, `public/assets/vehicles/boats/airboat.glb`, 3.2 MB):
  - **Model:** the user's Boat 10, converted by `tools/v2/water/airboat_tex.py` + `airboat_convert.py` (our script only, autoexec off). Changes:
    - engine maker name and logo replaced by the invented VANTRO
    - Maryland registration and sticker replaced by an invented FL number
    - toy speckle softened, grime added, light grays knee-compressed
    - scale 1.2x (4.3 m)
    - wire cage alpha-tested
  - **Rig:** 3-blade prop on its hub with a blur disc at speed, and both rudders turning with steering.
  - **Handling:**
    - thrust is applied at the fan hub
    - air rudders steer at a standstill with throttle and lose bite off it
    - the flat bottom slides into drifts
    - hydroplaning friction on wet sawgrass
    - slows over dry land (sawgrass 0.14, asphalt 0.55) without stopping dead
  - **Sound:** the engine voice plus a positional fan layer (blade-pass buzz + air roar), muted with the game.
  - **Stands:** along trunk / primary / secondary roads in Everglades / Big Cypress, two airboats beside the user's mossy pier, deck collider included. Max speed 66-71 km/h.
  - **Boat 9 is not used:** the lead decided it's another game's asset.
- **Everglades sheet water** (`src/world/env/gladesWater.js`, **on**, `?glades=0` off): over the sawgrass / marsh layers, ~5 cm deep (deeper sloughs, dry tussock patches), tea-dark with Fresnel sky reflection, fading at its edges, streamed in 48 m chunks within 300 m. `levelAt()` is the surface the airboat glides on.
- **Cars in water** (`src/vehicles/water/carWater.js` via a one-line hook in `vehicles.js waterTick`, **on**, `?carwater=1` = old):
  - **Wading:** below the intake (0.5 m cars, 0.8 m trucks / SUVs) the car keeps driving, with depth drag, wheel spray and a wake.
  - **Deeper:** the engine stalls, 8-point buoyancy, per-zone flooding (engine bay first), a nose-first sink with bubbles, and it settles on the bottom. Before: nose-up, gone in 3 s.
  - **Seabed:** bed depth uses r2-ground's new seabed heightfield (`city.seabed.heightAt`).
- **Cost:**
  - Boat physics: 0.13-0.17 ms per fixed step for 2-3 boats with v2, vs 0.06-0.09 ms for v1, measured in-session.
  - Glades water: within the frame-time noise at load 10-15 (frame-time samples on 19.5 / 5.9 ms vs off 12.6 / 16.7 ms).
  - Drive-test fps: after 49.7, before 47.7 (same spots, different scenes, so a sanity check, not an A/B).
  - Console errors: 0 in the after run.
- **Not good enough yet:**
  1. The driver isn't drawn on the airboat (`player/seat.js` skips boats, owned by r2-people).
  2. The swell is not drawn by default until the `ocean.js` hook lands (r2-ground's two-pass commit).
  3. The airboat's interior benches still read light in noon sun.
  4. Glades sheet water uses its own noise, not the ground shader's puddle pattern.
  5. There is no scrape or slam audio (`boatScrape` / `boatSlam` events are emitted, but the audio system doesn't use them).
  6. NPC airboat tours (AI driving) are not done.
- **Commits:** `eb73dee1` (all of it, flags off), `8016af5b` (only my hunks in `vehicles.js` + `main.js`, via a temporary index; other helpers' work left as is), and then the defaults-on commit. Default-flag boot (`--scene stand,airboat --q ""`, `docs/v2/reports/water-drive-default.json`): 0 console errors. A stand on State Road 951 spawned 2 airboats + the pier (`docs/v2/shots/water/stand_default_0.jpg`); entered one, drove 56 km/h through the sawgrass, exited. Only one stand qualifies across the glades (strict all-sawgrass test), so more stands are a TODO. Wading on the new seabed is not verified yet: the test spot finder picked a mis-flagged water cell on a road; fixed, not re-run.
- 15:00 **Facade kit step 1 committed**, with sheets `docs/v2/shots/art/sheet_geo5_{mbres,brickell}_*.jpg`.
  - Pending with the lead: the materials.js neon line (shared working copy) and the tilebuild hunk (rooftop units, fin grooves, balcony eligibility, hip pitch / colors, counters).
  - Honest status: visible but incremental. The remaining "cartoon" read comes from the 768 px wall-layer array with loud tiling patterns and from the bright source palettes. That needs a dedicated facade pass: a 2K neutral scan array, re-tuned palettes, and geometry reveals on near street faces.
- 15:40 **Facade pass committed** (e66ae338), sheets `docs/v2/shots/art/sheet_geo6_{mbres,brickell}_*.jpg`:
  - sun-faded Miami palettes (families.js + tilebuild PASTELS)
  - the loud facade-tile scan retired from offices
  - rooms visible behind daylight glass, so windows read with depth
  - the wall array at native 1024
  - wall roughness breakup
  Left: geometry window reveals on the near LOD, and 2K neutral wall scans (needs new sources). The materials.js neon line goes in with r2-render's commit.
- **Final round (QA + stands), commit `r2-water: QA-011 ...`:** check script `tools/v2/water/qa_check.mjs` (default flags, 0 console errors).
  - **Stands:** loosened (tertiary roads too, 6 of 8 prairie samples, about 1 per 900 m of glades road). Before the 2.1 km spacing, the check found 10 sites. With the spacing about 5 remain. The 5 is estimated from those 10 and not re-booted.
  - **QA-011:** `probeWater` in `main.js` now treats "below a pier / dock deck and near sea level" as water, with the depth from the data seabed.
    - At QA's spot (-895, 4806) the map already says water, but the physics floor sits at -0.31 while the data says 5 m deep. The player stands at 0.19 m depth on that floor.
    - That's r2-ground's seabed heightfield vs the data depth (QA sent the same "physics floor 0 vs drawn seabed -0.35" finding to r2-ground), not the swim code.
  - **QA-051:** a false positive. QA's selector (and mine) took the BREATH bar itself as "the label" and read the opacity of its parent `<body>`. The bar now also sets `visibility: hidden` once faded, so it's fully gone at 100 % above water.
  - **`ocean.js`:** r2-ground's two-pass commit has landed. My `// r2-water` block isn't added (the lead stopped me on budget). `?waves=2` patches both passes at runtime and is ready to become the block.

## r2-render
**Image-stability overhaul (the user's "dotty, fringy, layered").** On by default (`game.renderR2`, page `?render2=0` = old pipeline).
Commits: bd916811 (TAA, dithers, A2C, shadows, aniso, near fade, tools), f5d7a851 (shop-window rooms + r2-art neon), afce3e49
(r2-veg carried the vegetation hunks); the 15:30 follow-up (binary foliage coverage, MSAA / DPR, auto-pick) is in the commit after them.
- **Inventory** (runtime walk of every visible material + its compiled shader; `tools/v2/render/stab.mjs --only inv`,
  `invtable.mjs`, raw data `docs/v2/reports/render-ab3-inventory.json`):
  | source | technique (before) | where | now |
  |---|---|---|---|
  | vegetation LOD cross-fades | temporal IGN, pixel offset per frame (left a fixed per-pixel bias) | every tree / palm / shrub band | IGN stepped by the golden ratio per frame (converges under TAA) |
  | crowd + far crowd fades, Nico hair shells | same | NPC tiers, Nico's hair LOD | same fix |
  | shop-window rooms 55-70 m | FIXED screen hash (a dot pattern that never moved) | every storefront | stepped IGN |
  | foliage / hair cards | alpha-to-coverage, fractional coverage | all leaves, hair | binary coverage + TAA jitter (fractional A2C became an ordered dot hatch at 2x MSAA) |
  | Nico's card plants, chain-link, breeze blocks | hard alpha test | Nico's yard, houses | unchanged (alpha test + TAA supersampling) |
  | PCSS sun shadows | 12 point taps rotated per pixel and frame | every lit surface | narrow penumbrae: 4 bilinear taps on a fixed grid (no dotted edges); wide: as before |
  | contact AO, sun shafts | interleaved / IGN + golden ratio (r2-look) | | unchanged (already resolved) |
  | TAA itself | stale view matrix, no motion vectors, history resampled at the jitter offset | everything | see below |
- **TAA** (`src/render/post.js`, SouthlineTAA3): the jitter used the previous frame's camera matrix (every camera move and
  even still shots kept semi-transparent ghost copies: the "layered" rails, slats, truck edges and tires); a velocity pass for
  moving vehicles / people (per-object previous matrix, only roots that moved: +~40 draws while traffic moves, 0 when still);
  unjittered reprojection (a still pixel reads its history at its own texel); YCoCg variance clip toward the box center, the
  box opening slightly toward min / max at rest (0.2: wider kept wind-moved leaves as a smudge); an output sharpen exists but is
  OFF by default (`game.renderSharp`, it doubled the shimmer; grade sharpen 0.08). Depth disocclusion
  rejection exists (`game.renderDisocc = true`) but is off: it tripled the noise on textured ground at rest.
- **Resolution / AA:** MSAA 4x on High and Ultra (was 2x on High); render DPR High = 1.5x, Ultra = native (were 1080p-class,
  upscaled by the browser); anisotropic 8x on every mipmapped texture; the auto-pick only steps down on GPU-bound windows
  (CPU-bound M3 Max frames were stepping the user to Medium / Low) and old stored auto results are dropped.
- **Camera-proximity foliage fade:** leaves within 1.3 m of the camera or between the camera and the player fade out (per-frame
  stepped threshold, TAA-averaged) instead of filling the screen.
- **Measured** (still camera, wind frozen, 8 consecutive frames, old vs the final default in one session at 1280x720,
  `docs/v2/reports/render-jag.json`): frame-to-frame noise deck 2.39 -> 0.82, SR 916 corner (shot_12) 1.42 -> 0.42,
  street (shot_11 side) 1.52 -> 0.48 luma/255, at the same image detail; no ghost doubles. Perf (1600x900, load 40-60 on this machine, 3 alternating reps):
  frame 30.6 vs 29.6 ms, render CPU 19.7 vs 19.7 ms: inside the noise.
- **Sheets:** `docs/v2/shots/render/sheet_ab3_zoom2x.jpg` (2x crops, old | new), `sheet_ab3_stills.jpg`, `sheet_ab3_noise.jpg`
  (temporal diff x8), `sheet_ab3_drive.jpg` (moving convertible); final default (old | new | new without sharpen):
  `sheet_jag_zoom2x.jpg`, `sheet_jag_noise.jpg`, `sheet_jag_stills.jpg`.
- **Perf, MSAA 4x + new TAA vs this morning's High** (1512x945, same session, 3 alternating reps, `tools/v2/render/perfab.mjs`,
  `docs/v2/reports/render-perf-p1.json`): spawn frame 107 -> 98 ms, render CPU 32.9 -> 33.0 ms; downtown 81 -> 75 ms, render CPU
  27.5 -> 28.6 ms. The machine was at load ~90, so only the CPU column means much: about +0-1 ms. Headless Chrome ignored
  --force-device-scale-factor, so the Retina DPR 1.5 / 2.0 cost is NOT measured here. Check fps on the user's Mac; if High drops
  under 30, set High's dpr back to 'min' (quality.v2.js) and keep MSAA 4x.
- **TAA GPU cost** (r2-perf, serialized-frame GPU at 1080p High, M3 Max, `docs/v2/reports/r2-perf-ab6.json`): first version
  2.9-4.4 ms; after 6fb4973c (1-tap output copy, velocity pass only for movers within 60 m / 30 m on Low, 5-tap cross on
  Medium / Low) 0.6-0.8 ms: the resolve is +0.3-0.5 ms over the old one, the velocity pass about 0.8 ms while cars or people
  move nearby.
- **Still not right:** far palm frond tips can show a fine moire where the leaflet comb is about a pixel wide (the frond mip
  chain, r2-veg); the Bayline 65 folded top speckles (fabric normal, r2-cars); wind-animated foliage has no motion vectors
  (flutter was slowed by r2-veg instead); grass.v2 cards still use three's own A2C.
- 16:20 **Magenta bar fixed at the source.** Dimming wasn't enough: the unlit neon tube still drew its gas color. M.neon now renders as pale gray glass by day (desaturated in the shader through `uNeonDay`) and shows its color only from dusk. Verified at the Miami Beach corner, console clean: `docs/v2/shots/art/after_neonfix_mbres_0.jpg`. The deco fin now reads as a pale fin with gray tube edges and speed-line grooves. Stopping at facade step (3), as agreed.
- **HUD stars (user bug, commit 74fcd8f4).** Empty stars are semi-transparent gray (45 %) with a faint outline, which is the default at 0 wanted. Earned stars are solid white with the heavy black outline, earned from the right like GTA and the target. The evade flash blinks earned stars back to empty.
  - Sheet: `docs/v2/shots/hudcorner/sheet_stars.jpg` (0 / 1 / 3 / 6 stars and the flash, next to ref_46 and the target).
- **Dev mode (new feature, commit ca4e0372, `src/ui/dev/devMode.v2.js`).**
  - Unlock: pause menu → CODES, code 6969 (keypad or keys). A wrong code shakes the field. The setting is stored in localStorage.
  - DEV badge at the top left.
  - Map teleport: a TELEPORT [T] button beside the waypoint pin. A black "Loading area" veil shows while the player is held kinematic (the car without gravity) until the tiles are in and a physics ray hits the collider under the exact landing point. On foot he lands on the closest sidewalk or open ground, and swims at the surface in deep water. A car lands on the nearest lane, heading along it.
  - Police lock beside the stars (click, `;`, or L in the panel): crimes are filtered at the source, so there is never a star.
  - Dev keys: `[` `]` time, `\` weather, `'` spawns the last car.
  - Fixes QA-032 and QA-009/010/011. Shots and sheet: `docs/v2/shots/r2-mapui/dev/sheet_dev_mode.jpg`.
- **Map blips hook for r2-metro:** `game.mapBlips` is drawn on the minimap and the pause map (`hud.js mapIcons`). It was committed with r2-phone's 3a72c80a.

## r2-metro
**Summary (r2-metro):** The SOUTHLINE subway is in and ON by default (`?metro=0` disables). It's one line with 4 stations: **Airport** (Terminal Dr) - **Little Havana** (NW 10th Ave) - **Downtown** (NE 1st St) - **South Beach** (8th St, park side). Sheet: `docs/v2/shots/metro/sheet_metro.jpg`; single shots are in `docs/v2/shots/metro/`. The full flow (street -> station -> train -> ride -> arrival -> street) was verified with 0 console errors.
- 23:05 Models: the user's "Subway 3" platform strip is the shared station kit, and the user's "Train 2" car is mirrored into 24 m cars, 3 coupled, with SOUTHLINE livery stripes and a name decal. The street stair head is from "Street Props Pack 2": the real-world line bullets and the "Subway" words are painted out of its textures and replaced with SOUTHLINE and the invented sunset roundel. Tools: `tools/v2/metro/{convert.py,textures.py,shots.mjs,site.mjs}`.
- Street: the stair head sits beside the nearest road. The stairwell shows through a depth portal, so there's no terrain carving. A totem carries the roundel and station name, and the minimap and pause map show roundel blips through r2-mapui's `game.mapBlips`.
- Station: a separate space 1.4 km above the entrance with a vertex-light bake, so sun and time of day don't reach it. It has station-name signs, a line map, an EXIT sign, benches and 6 waiting people from `game.peds`. Outdoor haze is off while you're below.
- Train: it arrives from the tunnel with a rumble, a chime and its headlight glow, stops, and the doors open.
- Ride: board with E. You get a destination list (keys 1-4 or click) with ride time and a $2.75 fare (cash or card through `game.wallet`). You ride inside the car; C switches to an outside front view.
- Ride speed: real distance at 80 km/h with 1.2 m/s² acceleration and braking. The long middle is cut by two short fades, but the visible motion is always at real speed. Holding E skips to the arrival. The space is turned to the real bearing between the stations, so the minimap follows the ride.
- Exit: press E at the EXIT sign. The game fades and waits for the streamer (`collidersReadyAt` + `readyAround`), then puts you out at the destination's stair head.
- Wanted 2+ stars: no entry and no boarding.
- Not finished: no walk-down stair animation (E + fade instead); door leaves slide rather than split; the train interior keeps the model's graffiti; no ambient trains in other stations.
