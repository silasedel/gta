# nico-house: report (Nov 13; pass 3 finished about 7:55 PM MST)

## Pass 3 (street front from ref_43, siding, shared palms)
Seen working in shots (preview, noon):
- New part `parts/47_frontbay.js`: the street front under the main block is now an open carport bay (pile at (-3.6, 2.8) left out, lattice and the old storage wall removed). Cracked concrete slab panels with oil, rust and tire stains; heavy whitewashed piers at x -6.4 / 2.0 (lighter one at -0.8) with ivy; white PVC drain along the joists dropping down the left pier, a second drain, conduit, loose sagging wires and a bare bulb; weathered backboard with a faded box, bent orange rim and a torn, frayed net on the front beam (collider on the board; ball on the slab); box AC on a 2x6 bracket and the electrical panel on the corner pier; an enclosed storage room (turquoise boards, white panel door, window with one sash hanging open, lattice infill above, ivy) with a green bin and a rusty drum by the door; three terracotta pots with plants on the front deck rail; the old dark-teal pickup (shared `carModel2.js` ridgeback body, rusty, wheels placed by hand) parked in the left bay. The view runs through the bay to the water. Evidence: `docs/v2/compare/nico_house_front_vs_ref43.jpg`, `shots/nico-house/front_ref43_noon.png`, `front_ref43_close.png`.
- Siding: body color is now turquoise, wear raised on every wall, per-board tone spread wider, wider board gaps, bare wood a little browner (kit paint shader). Seen in both shots.
- Palms: `50_plants.js` builds its six grown coconut palms with `opts.vegetation.build('coconut', { seed, height, lean })` when the vegetation system is passed in (own trunk and crown skipped; colliders, litter and the hammock trunk curve stay). The young palm is still ours. `nicoHouse.v2.js` now loads at order 65 (after vegetation, 60) and waits up to 4 s for `vegetation:ready`. The preview loads the vegetation module itself (`?veg=0` turns it off). Plants dropped from 420k to 266k triangles. Evidence: `ext_hero_noon.png`, `compare/nico_house_vs_ref36.jpg`.
- Clutter moved so the bay reads like the image: outboard stand, tire, bucket and gas cans now stand along the storage-room side wall; ring buoy on that wall (it was floating at a removed pile); crate moved off the new wall; the porch-rim hoop is gone (the hoop interaction `hoop` now sits under the new backboard and emits `activity:hoops { rim }`; `anchors.hoopRim` added).
- Walk test after all changes, all clean: west stair -> west deck -> bay deck -> east wrap -> front deck; sliding door -> living -> kitchen -> hall -> bedroom -> bath -> back door -> bay deck -> bay stair -> yard -> dock end (doors opened with their interactions); drive -> carport bay -> hoop. Walking through the bay to the back yard is blocked by the pickup and the middle pile (only 0.45 m gap): the bay is a dead end on foot.
- Spawn (coordinator note): the lot still comes only from `layout.json` `setpieces.nico_house` (x, z, heading); new `anchors.spawnYard` (drive in front of the carport, facing the house). If the lot is real (not the fallback spot), `nicoHouse.v2.js` sets `game.city.playerSpawn` / `playerSpawnHeading` to it and teleports the player there once during load (skip with `game.v2NoHouseSpawn = true`). Full-game boot at 7:52 PM: `game.v2.failed = []`, the house sits at the new lot (-6420.26, 12416.02, heading 1.2411) already, 6 vegetation palms, the player starts at (-6411, 0.88, 12421) on the drive. The capture only showed the title screen, so the house was not looked at in the game.

Built but not looked at: wind on the net and hanging wires (`game.wind` dir/speed/gust, falls back to a slow cycle); the rail pot plants and the vines use the plants part's sway shader, not `game.wind`; laundry unchanged. In-game picture not taken (latest lot is (-6420.26, 12416.02), heading 1.2411, with no water on the +X side: the house still brings its own east seawall and water strip there, which world-layout should look at).

Not done: far LOD under 150k (now about 1.25M: ext 452k, int 238k, detail 509k incl. the pickup, dyn 48k); `game.sand.makeMaterial` for the yard; compact block proportions, hinged French doors, bougainvillea on the front lattice, wet reflections, dense planting behind (ref_36). Still unlike ref_43: our camera framing is wider, no dappled palm shadows on the slab, the back stair and dark middle post in the image are not in that line of sight, the bay ceiling reads lighter.

## Pass 2 (kept for history)

## Pass 2 (lead's list, 40 minutes, no sub-agents)
Done and looked at in `docs/v2/compare/nico_house_vs_ref36.jpg` (hero camera, 10:30 AM light):
- Massing: the main block now has a low shed roof falling toward the street with a deep overhang on exposed rafter tails (the bright gable and its valleys are gone); the gable stays only over the right-hand wing and runs out over the covered porch. The front deck was cut back to the right end (it now starts after the third window), wraps the front-right corner and continues down the east side to the bay deck; the west deck and stair sit alone at the left end. The long wall shows three shuttered windows over the lattice / storage wall in the same plane, as in the image. The porch has tall glazed double units in place of the bedroom window (not real hinged French doors).
- Surface: muted sea-green boards (0x5f8573), paint worn to grey wood at the bottoms, dark run-off below every sill, rust-brown runs in the paint shader, posts / beams / rims now grey weathered wood with paint remnants and algae-green feet, roof sheets older with salvaged patch sheets (oxide red, blue-gray, tan, green).
- Ground: stray tufts on open sand removed (mine and most of the plants part's), tire ruts in the drive, hoop moved to the front deck rim over the slab, pots / fern / orchids moved off the removed porch.
- Mail name default is now "N. Marrero" (`opts.residentName`).
- Walk test re-run after the changes, both routes clean: west stair -> west deck -> bay deck -> east wrap -> front porch -> porch stub; sliding door -> every room -> back door -> bay stair -> dock.
- Game boot re-run at the end of pass 2: `game.ready`, house on the lot, no failed parts; 1,271 draw calls and 2.7M triangles at the hero spot for the whole scene (other tracks have added content since the 710-call reading).

Not done in pass 2: old sedan, LOD (still about 1.3M triangles), second wheelie bin, bougainvillea on the front lattice (it is on the west stair landing), wet reflections, a real French door. Still unlike the image: the block is longer and lower in proportion, the wing behind the porch is an enclosed bedroom, the west stair and deck are bigger than the image's low side deck, planting behind the house is palms only.
Sections below are from pass 1; where they disagree with this section, this section is current (front door became a window in pass 1; the gable-roof and full-length-deck remarks are obsolete).

## What exists
- `src/world/setpieces/nicoHouse/`: `index.js` (`await buildNicoHouse(THREE, opts)` -> `{ group, colliders, interact, lights, update(dt, env), anchors, loaded, stats, plan }`), `kit.js` (batching, wear shaders, materials), `plan.js` (all dimensions), `parts/*.js` (auto-loaded), `preview.html`, `nicoHouse.v2.js`, `tools/` (texture fetch and mask scripts).
- Preview: http://127.0.0.1:5200/src/world/setpieces/nicoHouse/preview.html (`?view=hero|front|west|bay|dock|living|kitchen|bedroom|bath|hall...&t=<hour>`, Tab = walk mode, E = interact, `?col=1` shows colliders).
- In the game: `nicoHouse.v2.js` reads `setpieces.nico_house` (x, z, heading) from `public/assets/world/layout.json` at load (array or object form), builds the house there as one self-contained group with its own yard, seawalls, dock and ground collider, creates the Rapier colliders, maps its lights to `game.env.lamps`, runs the E interactions. Nothing is hard-coded; with no layout entry it falls back to a spot 60 m from the player spawn and sets `game.nicoHouse.temporary`.
- House-local frame: +Z = street side, water on -Z (bay, dock) and +X. The lot is flat at sea level + 1.0 m.

## Design
The user's own design (`references/ref_36_nico_house_user_design.webp`) arrived at 6:15 PM and replaced the earlier "our own yellow house" direction. Matched: seafoam vertical board siding with peeling paint and run-off staining, white weathered trim and square posts with knee braces, three windows with gray-brown louvered shutters on the long block, the roofed gable porch on the right with louver vent, string lights and pendant, brown balustrade, cream umbrella with wicker chairs and table, striped towel, potted plants, turbine vent, palms, white lattice with bougainvillea, green wheeled bin, breaker panel and meter, cream striped surfboard by a dark door, hose on a hook, workbench in the open bay, power pole with service drop, shell drive with puddles and weeds, sea on the horizon.
Still different from the image (side by side: `docs/v2/compare/nico_house_vs_ref36.jpg`):
1. Massing: the left block has a gable roof, not the low shed roof; the front deck runs the whole front, in the image it starts at the third window; the west stair is visible on the left where the image has a low side deck.
2. No French doors on the porch (a double window is there); the right block is an enclosed bedroom wing, not an open porch bay.
3. The teal sedan is missing, and so are the pickup, dirt bike, kayak and skiff (the vehicles sub-task never started: sub-agent limit).
4. The basketball hoop sits on the porch rim inside the view.
5. Paint reads whiter and flatter than the image; no wet-ground reflections of the house, no clouds (the game sky is not this track's).

## Verified
- Full game boot with the module (shots `docs/v2/shots/nico-house/ingame_hero_noon.png`, `ingame_hero_golden.png`; the noon one was looked at: Nico stands on the lot in front of the house): `game.v2.failed = []`, house at the layout anchor (-2543.73, 9262.68, heading 1.0895), no failed parts, player stands on the lot at y 0.88. 710 draw calls and 1.65-1.9M triangles at the hero spot. The 18 fps reading is not reliable (headless Chrome, 1-minute load 12-15).
- Walk test in the preview (same capsule and controller settings as the game), both routes with no stuck spot:
  west stair -> landing -> west deck -> porch -> front porch deck -> east wrap deck;
  sliding door -> living room -> kitchen -> hall -> bedroom -> bathroom -> back door -> bay deck -> bay stair -> yard -> dock end.
  One real bug found and fixed on the way: a stair guard collider poked over the landing.
- Looked at by the track lead: the hero angle at noon and golden hour, the side-by-side, the living room. Sub-agents looked at their own shots (plants, carport, all rooms).

## Built but not reviewed
- `ext_front, ext_west, ext_northwest, ext_bay, ext_northeast, ext_east, ext_southeast, ext_under, ext_dock, ext_aerial, ext_hero_night, int_kitchen, int_bedroom, int_bath, int_hall` were generated but not opened after the redesign.
- Dock, AC stand, propane tank, outdoor shower, satellite dish: built quickly, not seen up close.
- Interior (from the sub-agent reports): fan spin, clock hands, alarm clock digits, running water, toilet animation never checked; dresser has two interactions instead of six; shower steam weak; mirror is plain chrome; open cabinet doors have no colliders; living-room light switch and shoes sit where the front door used to be (it is now a window; the house is entered through the sliding door and the back door).
- Carport: conch shells, wheelbarrow, mailbox body and outboard cowl are below the bar.

## Not done
- Display vehicles and skiff (anchors `truck`, `bike`, `kayak`, `skiff` exist; `truck`, `bike`, `kayak` are parked out of the hero view).
- Performance pass: 1.33M triangles and 229 meshes for the whole set piece (plants 420k, carport 300k, rooms 260k). The interior and small clutter hide beyond 70 / 110 m, but up close this is over the per-view budget share.
- Night look in the game: lights go through the lamp system, which only shines at night; not looked at.

## For the lead
- Events emitted: `sleep { hours, anchor, source }`, `wardrobe:open`, `save:request`, `shower`, `activity:hoops`, `tv:toggle`, `stove:burner`, `laptop:page`, `sink:water`, `nicoHouse:ready`.
- `game.nicoHouse = { house, group, anchors (world space), spot, temporary, toWorld }`; `ctx.tv.setNews({ headline, sub })` is reachable as `game.nicoHouse.house` internals only: say if you want it exposed.
- Spawn: point `city.playerSpawn` at `game.nicoHouse.anchors.spawn` (bedroom) in `main.js`.
- world-layout: keep the lot flat at sea level + 1.0 m, water on the house's -Z and +X sides, lane from +Z.
- Nico's surname is not defined anywhere: mail is addressed to "NICO" (`opts.residentName`).
- Brands: only the beer brand comes from `src/design`; other labels are generic text.
