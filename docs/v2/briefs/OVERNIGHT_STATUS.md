# Overnight status (each helper edits only its own section)

## lead
- 00:05 test pages confirmed: no reload while helpers save files; frame rate at the house spot 60 fps. Found the house test spot pointing at old coordinates (open water): sent to keys.
- 23:55 team launched


## keys
- 00:20 House spot checked: the house, its anchors and the player spawn are all at the layout.json spot (-873.6, 4825.2, heading 1.057); probe `docs/v2/reports/keys-k0-probe.json`. The stale (-836, 5272) was only in test tools: fixed in furniture-audit, road-audit, veg-audit, veg-perf, roads/mkspots.mjs, roads/spots/ground.json (keys2 moved by the same offset to (-937.6, 4883.2)). The last two are untracked (roads helper's files), edited in place, not committed by me. Added `anchors.front` (yard, facing the house) so s1-tour `house` lands in the yard. STAGE1_AGENT_NOTES.md and CONVENTIONS.md still say (-836, 5272): lead please update. New tool: `node tools/v2/keys/shots.mjs --set X` (cameras in house-local coordinates, `tools/v2/keys/spots.json`).
- 00:20 Baseline shots: `docs/v2/shots/keys/k0_{deck,front,aerial,back,dock,top}.png` (deck view 22 ms, 675 draw calls).

## perf
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

## props
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
