# Overnight status (each helper edits only its own section)

## lead
- 00:35 user update relayed to all helpers (looks first, ground+greenery everywhere, accurate physics/hitboxes); new helper "player": user main-character model, movement, hit zones, ragdoll fit.
- 00:05 test pages confirmed: no reload while helpers save files; frame rate at the house spot 60 fps. Found the house test spot pointing at old coordinates (open water): sent to keys.
- 23:55 team launched


## keys
- 01:20 Cars: the cars helper already parks Nico's pickup + classic (vehicles.js NICO_CARS), so my yard spots are documentation only and all yard props were moved clear of its 4 car spots; neighbors' cars go through `spawnParked(key, opts)`. Dock starts clear of the bay stair, has a light. Curb carts breakable. Keys lots get shell drives. Machine load 100-190: each shot run waits 10-20 min for a browser slot; reference set `k5` queued (tools/v2/keys/spots_refs.json -> `cmp_k5_*.png` sheets via tools/v2/keys/sheets.py).
- 01:05 Pass 1 in: (1) flicker: the "dotted wobbling" was the peeling-paint shader's 0.05-wide flake edge aliasing into crawling dots at distance (TAA jitter); now fwidth-aware (kit.js, applies to every generated house too). (2) Nico's yard by hand, `src/world/setpieces/nicoHouse/yard.data.js` + part 55: lattice planter with bougainvillea, curb bins (user's bin set), all-way STOP at the T, poles + sagging wires, red roll-off (user's Dumpster 3, textures wired), limestone rocks (user's Rock 2), pallets/drywall/lumber/chairs/cooler, ruts, leaf litter, puddles that grow after rain; car spots for `spawnParked` (the lifted pickup already shows up). (3) Dock = the user's modular pier kit (Dock 6) from the stair foot past the real waterline, posts extended to the sea bed, T-head with hoist frame, rowboat + skiff on lines; seawalls only where water really is. (4) 8 hand-placed neighbor cottages (`src/world/dressing/keysStreet.data.js`) + 5 bay-shore docks (mossy pier, clean pier, boathouse). Mangroves moved onto the shore fringe (no roots in the air). Shots: `docs/v2/shots/keys/k2_deck.png`, `k2_deck2.png`, `k3_dock.png`. Next: verify neighbors/docks, stray flat polygons near the east shore, flicker A/B, perf A/B (`?keys=0`).
- 00:20 House spot checked: the house, its anchors and the player spawn are all at the layout.json spot (-873.6, 4825.2, heading 1.057); probe `docs/v2/reports/keys-k0-probe.json`. The stale (-836, 5272) was only in test tools: fixed in furniture-audit, road-audit, veg-audit, veg-perf, roads/mkspots.mjs, roads/spots/ground.json (keys2 moved by the same offset to (-937.6, 4883.2)). The last two are untracked (roads helper's files), edited in place, not committed by me. Added `anchors.front` (yard, facing the house) so s1-tour `house` lands in the yard. STAGE1_AGENT_NOTES.md and CONVENTIONS.md still say (-836, 5272): lead please update. New tool: `node tools/v2/keys/shots.mjs --set X` (cameras in house-local coordinates, `tools/v2/keys/spots.json`).
- 00:20 Baseline shots: `docs/v2/shots/keys/k0_{deck,front,aerial,back,dock,top}.png` (deck view 22 ms, 675 draw calls).

## perf
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
  **keys / houses owner:** layer audit at Nico's street finds each spawn-street house three times at the same spot
  (`houses:near:*`, `houses:spawn:1:*`, `houses:spawn:2:*`, 40-120 coincident hits each) - z-fight / dithered shimmer on walls.
  Nico's yard details (`nh_detail` weeds 79, strap plants 276, grass 125, palmetto 13 instances) stood on the road carriageway:
  the ground mask now hides them on asphalt (auto-patched at runtime), but the placement itself should skip the road.
- 01:05 Committed 7bf6df8 (surface mask, terrain shoulders, crumbling open edges, decals from the road's own asphalt, 2K scans,
  shoreline). First Keys look `docs/v2/shots/stage1/gp3_keys_{side,aerial,keys2_side}.png`: shoulder too pale / greenish and
  crumbs too big -> retuned (Keys shoulders now the yard's own sand, 5-15 cm asphalt chunks + dust). City open land now uses the
  terrain recipes over the user's scans (`ground/groundMaterial.js patchRecipeGround`), lots / aprons use the user's Concrete 3.
  Test slots are scarce (3 Chromes for ~10 helpers): runs are batched; the probe now has per-step timeouts.
- 00:50 Layer audit (new `src/world/ground/layerAudit.js`, ray grid over the whole scene, `docs/v2/reports/stage1-la1.json`) at Nico's
  street: **for keys / houses owner:** every spawn-street house is drawn twice at the same spot, `houses:spawn:1:*` and
  `houses:spawn:2:*` (identical walls / wood / paint, same height, 30-60 hits each) = z-fight / "dotted, wobbling house" (brief item 8)
  unless one of them is fully discarded in its shader. The pale flat polygons on Keys lots were the world-dressing crushed-shell
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
- 01:05 Real finger joints found on the scan (separate fingers, the curl and fist check renders clean), so gun grips and relaxed hands deform now. Player capsule fitted to the body: radius 0.28 m, top at 1.80 m (was 0.32 x 1.74 m). Hit zones rewritten (src/gameplay/hitZones.js): radii fitted on this mesh, scaled per character from its own bones, an oval torso (two capsules), hands and feet covered, a head sphere that follows each rig's head joint, and a debug overlay `hitZoneDebug(game, chars)`. Foot IK: pelvis drops, the legs bend to the real ground, feet land on stair treads (not the ramp collider), planted feet tilt to slopes. Nico now sits visibly in the driver's seat of cars (he was hidden before). The camera follows the smoothed ground height (no jolt on curbs or steps). Before shots of the old Nico: `docs/v2/shots/player/before_side.png`, `before_face.png`. The walk test and the full shot set are queued (3 browser slots are shared by all helpers).
- 00:50 **Nico is now the user's own model** (Models/Main Character 1, Tripo; folder 2 is byte-identical geometry and textures, so folder 1 is used). Rigged onto the game skeleton (52 Mixamo-named joints, bone-heat weights, LOD 95k / 24k / 7k tris), 4K albedo + normal + matte roughness, 1.83 m. Every existing clip retargets onto it at load. `?nico=old` = pipeline Nico. Build: `tools/v2/player/build.sh`. Shots: `docs/v2/shots/player/t1_face.png`, `t1_side.png`, `t1_walk.png`. Next: clear test spot, hit zones, capsule, foot IK test.
