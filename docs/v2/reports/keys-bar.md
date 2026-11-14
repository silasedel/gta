# keys-bar: Low Tide Lola's (Key Paloma)

An original open-air Keys roadside bar: cream lap-sided conch house on block piers, coral trim, sea-blue shutters, galvanized
standing-seam tin roof with rust, louvered cupola with a heron weathervane, deep wraparound porch. Name, sign, palette, layout,
festival ("Key Paloma Coconut Regatta") and band ("The Mangrove Snappers") are our own. Tagline: "The tide's out. So are we."

## Files
- `src/world/setpieces/keysBar/keysBar.js`: `buildKeysBar(THREE, opts) -> { group, colliders, interact, lights, update(dt, ctx), anchors, ready, stats(), dispose() }`
- `src/world/setpieces/keysBar/art.js`: every painted surface drawn in code (name board, chalkboard, banner, sandwich board, flag, neon, tin, paint, gravel, foliage)
- `src/world/setpieces/keysBar/preview.html`: `?view=hero|front|porch|night|top|back|yard|bar&t=15&ui=0&anchors=1&col=1&design=0`
- `src/world/setpieces/keysBar/keysBar.v2.js`: `initV2`, order 72. Sets `game.keysBar`, emits `keysBar:ready`.

## Numbers (preview, `window.stats()`)
98,796 triangles, 46 meshes (48 renderer draw calls with preview ground), 57 colliders, 36 patron anchors, 5 staff anchors, 16 light descriptors.
Everything is merged per material with per-piece vertex color; only the art panels, three fan rotors and the flag are separate meshes.

## Brands
Taken from `src/design/`: `tern-key-brewing` (beer neon, cooler header, chalkboard draft), Ron Marinero (rum neon, menu), Zafra (menu).
The venue itself ("Low Tide Lola's") is not in the design system yet: please ask DESIGN-SYSTEM to register it (palette in `art.js` `PAL`).
No new downloaded assets. Reused `public/assets/city/pbr`: coral_gravel (normal), coral_stone_wall, concrete_block_wall, palm_tree_bark, rusty_painted_metal, corrugated_iron (normal).

## Seen working
- Preview: `docs/v2/shots/keys-bar/hero.png`, `front.png`, `porch.png`, `night.png`, `bar_dusk_anchors.png` (capsules = anchors).
- Game: `game.png` (day), `game_dusk.png` (lights on, earlier position). Placed from `layout.setpieces.keys_bar`, no failed modules.

## Layout problem found (for the lead / WORLD track)
`setpieces.keys_bar` is (218, 5486), lot_radius 20, but Schooner Drive runs 9.8 m from that center (through the yard) and a
building sits about 30 m to the other side. `keysBar.v2.js` now slides the bar along its own axes to the nearest clear spot
(currently 12 m left, 8 m back: world 205.2, 5492.7) and reports it in `game.keysBar.moved`. Better fix: give the lot a clear 40 x 32 m.

## Honest comparison with ref_30
Same kind of place and a similar count of object types, but it reads as a clean, stylized model, not a photo. Gaps:
painted-canvas wood and paint instead of photoreal PBR; card foliage, much sparser and flatter than the reference; little ground
litter or grass blending; no posed patrons (only generic ambient peds from `game.peds.spawnAt`); bar room only, no kitchen or restrooms.
My estimate: roughly half the reference's detail density, less on material realism.

## Not done / not verified
- No walk test of the colliders in game (steps, porch, door gap). Interactions are descriptors only.
- Neon signs, golf cart, cruisers, mailbox, hose reel not inspected close-up.
- `game.env.lamps.add` call copied from the keys-sign pattern; porch is lit at dusk in game, full night not checked.
- The ambient peds spawned at 7 standing anchors wander off; seated and staff anchors are empty.

## Anchor (lead's note, 6:16 PM: the map is being redrawn)
No world coordinates are hard-coded. `keysBar.v2.js` reads `setpieces.keys_bar` (position and heading) from
`public/assets/world/layout.json` at load; it accepts the array form (`[{ id, x, z, heading }]`) and an object keyed by id,
with `x/z`, `position` or `pos`. The bar and its whole lot are one group in local coordinates (front = +Z, about 38 x 31 m,
centered 3 m in front of the origin), so it follows the anchor when the map moves. The only offset applied is the automatic
slide (up to 18 m along the bar's own axes) when a road, building or water sits inside the lot; with a clear lot it is zero
(`game.keysBar.moved === null`). The world coordinates quoted above are from the old map and will change.
