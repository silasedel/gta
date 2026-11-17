# Overnight status (each helper edits only its own section)

## lead
- 00:35 user update relayed to all helpers (looks first, ground+greenery everywhere, accurate physics/hitboxes); new helper "player": user main-character model, movement, hit zones, ragdoll fit.
- 00:05 test pages confirmed: no reload while helpers save files; frame rate at the house spot 60 fps. Found the house test spot pointing at old coordinates (open water): sent to keys.
- 23:55 team launched


## keys
- 01:05 Pass 1 in: (1) flicker: the "dotted wobbling" was the peeling-paint shader's 0.05-wide flake edge aliasing into crawling dots at distance (TAA jitter); now fwidth-aware (kit.js, applies to every generated house too). (2) Nico's yard by hand, `src/world/setpieces/nicoHouse/yard.data.js` + part 55: lattice planter with bougainvillea, curb bins (user's bin set), all-way STOP at the T, poles + sagging wires, red roll-off (user's Dumpster 3, textures wired), limestone rocks (user's Rock 2), pallets/drywall/lumber/chairs/cooler, ruts, leaf litter, puddles that grow after rain; car spots for `spawnParked` (the lifted pickup already shows up). (3) Dock = the user's modular pier kit (Dock 6) from the stair foot past the real waterline, posts extended to the sea bed, T-head with hoist frame, rowboat + skiff on lines; seawalls only where water really is. (4) 8 hand-placed neighbor cottages (`src/world/dressing/keysStreet.data.js`) + 5 bay-shore docks (mossy pier, clean pier, boathouse). Mangroves moved onto the shore fringe (no roots in the air). Shots: `docs/v2/shots/keys/k2_deck.png`, `k2_deck2.png`, `k3_dock.png`. Next: verify neighbors/docks, stray flat polygons near the east shore, flicker A/B, perf A/B (`?keys=0`).
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

## cars
- 00:45 Pipeline running: `tools/v2/cars/convert.py` (Blender, scripts off) turns each library car into one Draco GLB
  (`public/assets/vehicles/cars/<key>.glb` + manifest): real length per class, wheels found by geometry and split (hub pivots,
  calipers do not spin), materials sorted into paint / trim / glass / lamp slots (albedo, roughness, metal sampled from the
  source textures into vertex data), brand badges removed, LOD0 60k / LOD1 10k / LOD2 2.2k with the source shading transferred.
  37 of 48 converted so far (personal-use rows never touched). Runtime: `src/vehicles/glb/*` builds the same car object the
  procedural builder did (physics, damage, lights, traffic unchanged), 4 body draw calls + 1 instanced wheel set per car.
  Review sheets in progress; not yet verified in game.

## props
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
- 01:10 Baseline (before) shots, noon street + aerial + night aerial at 8 places: `docs/v2/shots/stage1/B0_{dt,brick,sobe,havana,overtown,liberty,airport,clew}_{st,air,airn}.png` (review spots: `node tools/v2/buildings/spots.mjs`). Seen: storefront glass reads as flat white panels; aerials are white boxes with orange roofs, Overtown cloned boxes; airport has no buildings at all. (Not mine, for the lead: Little Havana and Clewiston aerials show sea water over the land at 150 m altitude: `B0_havana_air.png`, `B0_clew_air.png`.)
- 01:10 Converting 45 of the user's models (batch 1-3: Office Buildings 1/4/5/6/7/9/10/11, Buildings 2/17-19/21-28, Hotel 1, Motels 1-2, Storefronts 1/2/5/6 + Shutter, Diner 3, Gas Stations 1-2, Factories 1-2, Hangars 1-4, Control Towers 1-2, Jet Bridge, roof/wall clutter) with a new spec-driven converter (`tools/v2/buildings/models.json`, `convert_v2.sh`: WebP textures, meters, ground at 0, far LOD file).

## ground
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
- 00:50 **Nico is now the user's own model** (Models/Main Character 1, Tripo; folder 2 is byte-identical geometry and textures, so folder 1 is used). Rigged onto the game skeleton (52 Mixamo-named joints, bone-heat weights, LOD 95k / 24k / 7k tris), 4K albedo + normal + matte roughness, 1.83 m. Every existing clip retargets onto it at load. `?nico=old` = pipeline Nico. Build: `tools/v2/player/build.sh`. Shots: `docs/v2/shots/player/t1_face.png`, `t1_side.png`, `t1_walk.png`. Next: clear test spot, hit zones, capsule, foot IK test.
