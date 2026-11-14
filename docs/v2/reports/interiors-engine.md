# interiors-engine: report (stopped early at the budget cut, Nov 13, 6 PM)

## What exists
- **New engine** in `src/world/interiors/` (v1 moved to `legacy/`, still used for every kind without a V2 type). Entry `index.js`
  -> `engine.js` (streaming, hours, doors, light levels, persistence hooks), `build.js` (sliced build + worker bake), `plan.js`,
  `shell.js`, `facade.js`, `doors.js`, `lighting.js`, `prints.js`, `nav.js`, `interact.js`, `variation.js`, `registry.js`,
  `kit/` (geometry builder, baked-light materials, procedural PBR surfaces, atlas, bake), `items/` (forms, labels, catalog, field, stock),
  `fixtures/` (retail, backroom), `types/gas_convenience.js`, `preview.html`, `README.md`.
- **Lighting:** no sun or scene ambient indoors. Per-vertex bake in a Worker: main lights, accent lights, daylight channel by hour; AO and
  per-room bounce; four pooled real-time lights for characters; additive spill on the sidewalk at night.
- **Items:** about 2,000 to 6,000 individual products per store as instances with painted labels (shared atlas) and shelf price tags.
- **In the game:** 219 convenience/fuel lots are claimed by V2 (legacy keeps about 3,400). Checked by teleporting into one
  ("El Rápido"): built, shown, `indoor` set, 54 colliders, 2,120 items, no console errors (`docs/v2/shots/interiors-engine/game_v2_store.png`).

## Verified by looking at screenshots
`before_v1_*.png` (v1), `v2_gas_v0_eye.png`, `v2_gas_v1_eye.png`, `v2_gas_v5_street_night.png`, `v2_gas_v3_street_day.png`, `game_v2_store.png`.
Not opened: `v2_gas_v5_eye.png`. Variant 3 eye shot failed once in the harness and was not retried.

## Built but never exercised
- `interact.js`: take with arm IK, carry, pocket, eat, pay, shoplifting and evidence events, recorder, lotto, switch. Parses and runs
  each frame without errors, but no key was ever pressed in a test. Expect bugs (hand attachment scale, IK axis).
- Colliders and nav grid: generated, no walker run. Door lock colliders untested. Save/load hooks untested.
- Wall clock hands, cooler door opening, POS/CCTV screens: code runs; not inspected up close.

## Known problems
- First build of a store type hitches: slices up to about 230 ms (surface textures, label painting, big fixture steps). Later builds
  are faster but `fixtures()` still needs more `yield`s; no frame-time run was done.
- About 0.5 to 0.9 M triangles per store (items are not LOD'd); `MAX_ACTIVE` was cut to 3 stores to stay in budget. Needs item LOD.
- Lighting is brighter and flatter than ref_20; daylight shadows on the floor are blocky (vertex bake). Not at the ref_20 bar yet.
- Brands and products are provisional data in `items/catalog.js` (design system had no data yet); `profile()` already asks
  `design.pickBrand` first. Products do not yet use `design.productParts`.
- The city shell still draws its own glass front on V2 lots (double glass).

## Not done
Staff and customers (nothing spawns in V2 stores), Cuban cafe, sneaker boutique, stairs/elevators, stuck-spot walker, openable
drawers/cabinets, venue music, contact sheet, playthrough test, frame-time numbers.

## Needs from the lead
- `city-look`: skip `glassFront` for lots with `sf.v2Facade === true`.
- New events: `interior`, `store-open`, `purchase`, `consume`, `crime {type:'shoplift'}`, `evidence {kind:'witness'|'camera'}`,
  `evidence-destroyed`, `suspicion`, `lottery`, `atm`, `safe`. Save hooks expected: `game.on('save'|'load')` with `d.interiors`.
- `P.script.pose` runs before `character.update`, so IK is applied from `game.interiors.update` instead; keep that call after the player update.

## Atmosphere and wear pass (6 PM, after user feedback on `v2_gas_v0_eye.png`)
Engine-level, so every store type gets it: `clutter.js` (`autoWear`, runs after each type's fixtures), contrast curve in the baked
materials, sparser rigs with mixed lamp colors, dead and flickering tubes, cooler LEDs that actually light the floor (they were
blocked inside the cooler body before), yellowed drop ceilings, shelf disorder in `shelfRun` (sold-out blocks, rotated, pushed-back,
tipped and misplaced items), price rails, and clerk clutter in `checkout()` (mug, phone on charge, radio, photo, paper drift,
lost-and-found box). After shot: `docs/v2/shots/interiors-engine/v2_gas_v0_eye_after.png`; label close-up: `v2_gas_v1_to_door_after.png`.
Seen in the after shot: contrast and light pools, darker corners, cooler glow, shelf gaps, floor stains, a replaced tile, a taped notice.
Written but not looked at: daylight shafts, door stickers, extension cord, delivery boxes, missing ceiling tiles, counter clutter, flicker.
Still short of ref_20: the ceiling reads too dark, daylight patches on the floor are blocky, no fog or color grade (post pipeline).
