# nico-house: report (Nov 13, hard stop 7:30 PM MST)

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
