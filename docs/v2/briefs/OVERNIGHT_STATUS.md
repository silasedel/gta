# Overnight status (each helper edits only its own section)

## lead
- 03:50 Reviewed: Nico = user's model (matches Preview), weapons (cop aim pose sent back), props (variation/physics done), ground (potholes 3D, shoulders, water, grass mask), vegetation far squares fixed. Usage 27 % weekly: added helpers look (lighting/sky/post), surfaces (asphalt/markings/sidewalks), shops (storefronts + street-visible interiors). Git: pathspec-only commit rule after stale-index reverts; street props verified intact.
- 02:40 Lead review of keys k7 sheets: yard too orange/flat vs pale shell mock-up, dock lying on sand + white beam on the beach, hard water edge, uniform teal water, sparse mid-layer greenery, DARK SQUARE CARDS on far shores in the aerial (vegetation/buildings asked to find). Sent to keys, ground, vegetation, buildings. People: stale Ocean Drive spot + arrest overlay in shots, sent back. Perf: interiors cull, background precompile (25 m no-holdback), console checks.
- 00:35 user update relayed to all helpers (looks first, ground+greenery everywhere, accurate physics/hitboxes); new helper "player": user main-character model, movement, hit zones, ragdoll fit.
- 00:05 test pages confirmed: no reload while helpers save files; frame rate at the house spot 60 fps. Found the house test spot pointing at old coordinates (open water): sent to keys.
- 23:55 team launched


## look
- 05:15 **look3 is ON by default** (lead OK; rollback `?look3=0` installs none of it). Before/after sheets (left old, right look3): `docs/v2/shots/look/sheet_r3_nico_deck.png` (11:00, 18:30, 22:00, after rain 11:00 and 18:30), `sheet_r3_beach.png` (11, 18:30, 22, after rain), `sheet_r3_downtown.png` (11 old was still streaming, 18:30, 22). Frame A/B per part at spawn, same session, after the tap trim: all of look3 39.8 -> 41.5 ms GPU (+1.7 ms); soft shadows, AO ring and auto exposure each inside the noise (machine load 200+, medians 60-85 ms either way). Console: 0 shader errors with and without `?look3`; a re-check of the new default is running.
- 04:55 Console clean on both paths (default and `?look3`: 0 shader errors). Before/after sheet, Nico's deck, rows 11:00 / 18:30 / 22:00 / after rain 11:00 / after rain 18:30, left = old, right = look3: `docs/v2/shots/look/sheet_r3_nico_deck.png`. First frame A/B (s1-perf, same session, spawn): 59.2 -> 67.9 ms median (GPU 34.7 -> 42.7 ms; the machine is very loaded, p95 noisy). I cut the soft-shadow taps (search 8 -> 6, filter 12 -> 10, umbra early-out) and am re-measuring per part (soft shadows / AO ring / auto exposure) before switching it on by default. Beach + downtown sheets running.
- 04:35 **look3 is opt-in (`?look3`) after the lead's report**: the fog chunk read `uLookV` in materials that never got its declaration (shader error on other helpers' pages). Fixed (`#ifdef PS_LOOKU`), and no look3 shader patch is installed without `?look3`, so the default path is the old, stable one. A console check (both paths: shader errors, max frame) is queued. Default-on only after a clean console + frame-time A/B.
- 04:25 Round 2 A/B at Nico's (in-session, `game.look3` false/true): `docs/v2/shots/look/r2_nico_deck_11_old.png` vs `r2_nico_deck_11_neu.png`; dusk `r2_nico_deck_18h5_*`, night `r2_nico_deck_22_*`. look3 = soft PCSS shadows, shade/sun ratio about 2x deeper (sand in the pickup's shade 73 -> 40 at the same sunlit level), PBR Neutral tone map (deep skies, no neon reds from ACES), sat 0.93, auto exposure (night opens up about +1 stop, not pitch black). Parked cars had no sun shadow: the cars helper fixed the shadow tagging.
- 04:10 Started (lighting, sky, post). Pass 1 in code behind a runtime switch `game.look3` (true by default, `?look3off`, A/B in one session without reload): soft sun shadows (PCSS-style blocker search + rotated disk, TAA-resolved, `src/render/look3.js`), contact AO kernel now rotates per frame (was a fixed dot pattern) + a wider 3 m ground-contact ring, tone map switch (`game.lookTM` aces/agx/neutral). Shot tool `tools/v2/look/look-shots.mjs` (fixed cameras, A/B variants). First A/B run queued for a browser slot.

## keys
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
