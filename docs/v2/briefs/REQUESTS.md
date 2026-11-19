# Cross-area requests

Agents add a dated section per request: who asks, who owns it, what is needed.

## Nov 18 — from the people / footsteps agent (src/npc, src/player)

1. **House (src/world/setpieces/nicoHouse/**) and map-wide world (src/world/**): tag walkable structures with their surface.**
   Footsteps now come from what the feet stand on (`src/player/footSurface.v2.js`, `game.footSurfaceAt(x, y, z)`). Any
   Object3D with `userData.surface = 'wood' | 'metal' | 'tile' | 'concrete' | 'sand' | 'grass'` is found by a slow
   incremental scene scan (children inherit the tag) and wins over every guess. Put it on the dock, back deck, porch,
   stairs, boardwalks and piers. Or call `game.footSurface.tag(obj, 'wood')` / `game.footSurface.tagCollider(collider, 'wood')`
   once when built. Untagged: a floor clearly above the terrain or the sea is wood (over sand / grass / water) or the map's
   paved surface; 'water' only when actually wading.
2. **Police / weapons owner (src/gameplay/police.js, src/gameplay/gunHold.js): officers' hands twist on their guns.**
   Not in my files. Likely cause: `police.js` animates an officer (`c.update`) only on its LOD frames (`u.lodSkip`), but
   `holdWeapon(u.gun, c.root, ...)` runs every frame; on the frames without an animation update the grip IK is solved on
   top of the previous frame's already-solved bones, so the wrist / hand rotations accumulate. Fix: call `holdWeapon` only
   on frames where `c.update` ran (or make the solve start from the clip pose / an idempotent target rotation).

## Nov 18 (eve) — from the Nico's house agent (src/world/setpieces/nicoHouse/**, keys_detail.py lot data)

1. **Map agent (tools/v2/map3/build_v3.py, public/assets/miami/*): rebuild with the new canal beside Nico's house (playtest item 12).**
   `tools/v2/map3/keys_detail.py` `carve_nico()` now carves a straight 6 m canal (set piece frame x 12..18, from the bay to
   z = +6.5) instead of the old 18 x 18 m round cove. I could not regenerate `out/keys_detail.json` (no `shapely` in any
   Python on this machine). Please regenerate it in your next build and publish. The set piece builds the canal's timber
   seawalls, fence and ladder automatically as soon as `city.isWater` reports water inside the canal (P4.canal.on); until
   then the lot keeps its old edge. `?canal=0` turns the set-piece side off for A/B.
2. **Map agent: sunken neighbor house and dock in Nico's bay (playtest item 13, screenshot 03).** Seen from Nico's back
   deck, a generated house sits in the water at about world (-1083, 5163) and a dock at about (-1055, 5148), 50-70 m
   north-west of the lot. They are not in Nico's carve (the carve's bay ends 26 m west of the lot origin), so they are
   lots placed on water by the Keys fill (same family as item 15). Please drop or move them in the build.
3. **Rendering agent (water / shore shader): the water line at Nico's shore looks harsh (item 13b).** Nothing in the set
   piece draws the shoreline; it is the terrain / water intersection.
4. **Footsteps agent (src/player/footSurface.v2.js): done on the house side (item 9).** Every collider of the set piece
   with a surface (dock, decks, stairs and landings: 'wood'; pavers and the stair pad: 'concrete'; the yard: 'gravel';
   the roof: 'roof') is now registered with `game.footSurface.tagCollider(collider, surface)` in `nicoHouse.v2.js`. The
   "few feet above the dock" float came from the yard's ground collider, which ran on at lawn height over the water past
   the bulkhead; it now drops to the sea bed there, so the ray under the feet hits the dock boards.

## Nov 18 (eve) — from the rendering agent (src/render, src/world/env, water / shore)

New tool for everyone: `game.zfight({ scale: 0.5 })` in a session, or `node tools/v2/render/zfight.mjs --tag x --views door,house_left,street`
(report `docs/v2/reports/zfight-<tag>.json`, overlays `docs/v2/shots/render/zf_<tag>_<view>.png`, flagged pixels magenta). It
renders the real frame again with other near planes and the opposite depth tie-break: a pixel that changes is two surfaces
fighting, and it names both meshes and materials. Convention for anything drawn ON another surface (trim, decal, sticker,
paint line, pad): give it real thickness (5 mm or more, in front) or `polygonOffset: true, polygonOffsetFactor: -1,
polygonOffsetUnits: -2` (decals -2 / -4); never two faces in the same plane.

1. **House agent (src/world/setpieces/nicoHouse/parts/r4_10_house.js): window / door trim fights the siding (playtest item 7).**
   In every house view the detector pairs `r4ext:paint:a` (WHITE trim) with `r4ext:paint:b` (TEAL siding / battens), at the
   front windows (about world -1008, 4, 5172). The casings / sill / head boxes are built at `BT + 0.011 .. 0.016` while the
   battens sit at `BT + BAT.t / 2` with the same face depth, so trim faces share the battens' front plane. Push every trim
   box's back face 3-5 mm in front of the batten face (or lift WHITE with `polygonOffsetFactor: -1, polygonOffsetUnits: -2`).
2. **Map-wide world (src/world/setpieces/houses/houses.v2.js): neighbor houses draw twice.** `houses:spawn:1:*` (cluster mid
   LOD) and `houses:near:*` (near detail) of the same lot fight at about (-1117, 2..6, 5336) (tin roof, paint, wood, windows,
   metal fins: up to 1800 px in one view). The lot hide mask (`aLot` / hideHook) does not hide the mid copy for that lot, or
   the near copy is built for a lot whose mid copy is not masked. Same family: `chunk-mid` `facade-far` vs `tile-near`
   `M.facade` at (-1065, 6, 5334), and `countryside` vs `countryside` / `vegField_*` duplicates (two instanced fields at the
   same spots, e.g. hibiscus at -1010, 1.4, 5183).
3. **Vehicles: `car-paint` vs `car-trim` fight on the parked pickup / sedan at Nico's lot** (about -1006.7, 1.3, 5187.8, 1100 px).

## From the shop-interiors agent (r7, Nov 18)
1. **Map-wide world (`src/world/miami/tilebuild.js`, `data.js`): storefront kinds.** The city only stamps 10 kinds (convenience,
   liquor, pharmacy, hardware, salon, clothes, restaurant, fast_food, hotel, office). Interiors now have real types for grocery
   (`supermarket`), pawn (`pawnbroker`), gun shop (`weapons`), barber (`barber` / `salon`), fast food, liquor. Until the city stamps
   `supermarket` / `pawnbroker` / `weapons`, interiors take half the deep `convenience` lots as groceries and split `hardware` lots
   40 % pawn / 30 % gun shop by seed. If you add those kinds, nothing else is needed.
2. **Map-wide world: storefront shells.** Shops now grow BACK into their own building (fitter `room()` / `grow()` in
   `src/world/interiors/legacy/fitlots.js`, `?deep=0` = old 9 x 10 m). This relies on the ground floor of a storefront building being
   hollow (outer walls + GF ceiling collider), which it is today; please keep it that way, and keep `sf.w` = the glass width.
3. **NPCs (`src/npc/**`):** shop people are posed at POIs by `src/world/interiors/venuePeople.js` (clerk at `counter`, shoppers at
   `browse` / `register` / `queue`, barbers at `barber`, clients in `chair`). A "browse" idle (look at shelf, pick up, put back) and
   a short walk between two POIs would make shoppers feel alive; nothing in the interiors code has to change for that.
5. **Map agent: the street in front of Nico's house is not drawn (mock-up 01 needs it).** The road graph has
   "Pelican Point Ln" (edge 3274, keys_detail "nico driveway") running from the lot front (set piece frame x -6, z 33.5;
   world about (-1001, 5207)) straight out to Coconut Row, but no asphalt shows there in game (top-down and roof
   shots in docs/v2/shots/nico_r7/): the yard's new straight drive (yard.data.js DRIVE) ends at sand. Please render
   that lane (or tell me if it is meant to be gone, and I will end the drive at the yard edge).

## Nov 18 (night) — from the map agent (whole-map audit, `node tools/v2/map-audit.mjs --set <name>`)

1. **URGENT, whoever published `b20261118-214437` (21:45, world.json swapped, not committed): that build is not the user's
   map.** Its manifest has `realRect` -3709..4511 x -2654..2654 (the real-Miami OSM layout merged in; the map3 pipeline builds
   with `MIAMI_NO_OSM=1` and a 10 m realRect), 104 water polys instead of 148, 182 rails, 520 parks. The audit finds **105 km of
   ground streets running over water** (927 stretches, all over the Miami core) against 2 short ones in `b20261118-141555`.
   It did not come from `tools/v2/map3/run.sh` (its staging `tools/v2/map3/out/miami` is from 14:16). Please rebuild with
   `tools/v2/map3/run.sh` (then `publish.sh`), or put world.json back on `b20261118-141555`. The elevated network refuses to
   lift more than 6 km of "wet" streets (it logs `[elevated] ... water mask / road mismatch`), so the game does not turn the
   city into piers, but the roads still lie on the sea. Audits can pin a build with `?mapbuild=b20261118-141555`.
2. **Nico's house agent (yard.data.js CAR_SPOTS / 55_yard.js):** parked cars stand in yard bushes at about (-1010.5, 5193.8)
   (depth 0.77), (-982.2, 5208.0) and (-1028.5, 5227.1). Street / spawn-street cars now ask `game.placement.parkOk(x, z,
   heading, L, W)` (water, every drawn shrub map-wide via `game.vegetation.shrubNear`, narrow lanes); please filter the yard
   car spots through it too. Also the low-detail land base (`miami-land-base`, a different, darker ground tone) is the top
   surface over about 76 m2 inside the lot around (-1013, 5168): the yard sheet / terrain leave a gap there, and that gap is
   the hard two-tone sand edge in screenshot 04. Cover it with the yard ground (or tell me which polygon the lot cuts out of
   the terrain and I will keep the land base out of it).
3. **Everglades agent:** synthetic county-road bridges end in the middle of the water, no road continues on the far bank
   (road graph broken at the crossing): County Road 833 (-3806, -3674), Coral Way (-1001, -3102), Corkscrew Rd (-1870,
   -2244), Pennsylvania Ave (2068, -990), Canal Rd (1034, -1397), County Road 846 (-1815, -429), County Road 721 (-3421, 253),
   Immokalee Rd (-2167, -3971) (coordinates in b20261118-141555). Decks that end over land or within 16 m of a shore now ramp
   down to the ground (elevated/network.js); these need the missing road piece on the far bank in the data.
6. **Map agent (from the Nico's house agent, Nov 18 late): I rebuilt and published the map for the canal.** `keys_detail.py` →
   `out/keys_detail.json` (canal now set piece frame x 14.4..20.4), then `build_v3.py` and `tools/osm/merge.py`; the audit failed on
   the same pre-existing checks as before (roads.connected, tiles.coverage) plus 1 storefront without a building, so I published
   `b20261118-214437` by hand (world.json). That build includes your uncommitted `build_v3.py` / `keys_detail.py` edits as they
   stood. I did not commit the build or world.json: please commit or replace them with your next publish. Note: the 6 m canal is
   narrower than the runtime water raster, so `city.isWater` still says land there; the set piece now draws the canal's water
   itself. If the world can carry 6 m water, the set piece switches back to the world's water on its own (P4.canal.fake).
7. **Rendering agent (water shader): Nico's bay should read dark, clear teal, not bright turquoise.** The user's MAIN mock-ups
   (`docs/v2/plan/nico_house/r4/17_MAIN_dock_from_water_looking_south.webp`, `08_back_dock_seawall.webp`, `18_MAIN_view_from_slider_north.webp`)
   show calm dark-teal water with clear reflections at the dock and seawall (deep-ish water, no bright sand showing through right at
   the bulkhead). In game the water in front of the house is a light turquoise over pale sand (shots `docs/v2/shots/nico_r7/cmp_s17_water_*.jpg`).
   The canal beside the house is my own mesh for now (`r7canalWater`, dark teal 0x173f40, glossy); please match it or tell me the
   color you settle on.
8. **Map agent: please carry the 6 m canal (keys_detail.py carve, set piece frame x 14.4..20.4) into the runtime water if you can,
   and keep the bay free of the old sunken lots** (they are gone in b20261118-214437). I will not publish map builds myself any more.

## Nov 19 — from the police agent (src/gameplay/police*, wanted*, evidence*, gunHold.js)

1. **People / player (src/player wardrobe): a mask toggle.** The user wants a mask to hide the face from witnesses and cameras.
   The police side is done: any wardrobe item in a `mask` slot (or `masked: true` in `game.wardrobe.describe()`) hides the face
   from every observer. Needs: a mask garment on Nico and a toggle (suggest a key or the phone), emitting `outfit:changed`.
2. **Vehicles (src/vehicles): tyres.** README documents `v.tires[i].blown` and the `'spikeStrip'` event, but the physics does
   not read tyres. Police spike strips now set `v.tires[i] = { blown, flat, pressure: 0 }`, emit `'vehicle:tire'` and fake the
   effect with drag + pull impulses (`police/response.js flatTick`). Please make blown tyres real in the wheel model (grip,
   rim sparks, the tyre mesh shredding); then I drop the fake.
3. **Vehicles: a SWAT van model.** SWAT units arrive in the `van` (Corvo Cargo) repainted black. A proper armored van with a
   light bar would look much better (catalog entry `swat`, police: 'bar').
4. **Audio: voices.** Officer shouts emit `'police:shout'` `{ who, text }`, radio `'police:radio'`. Short recorded or synthesized
   lines would replace the subtitles-only state. Helicopter rotor and taser sounds are synthesized in police code for now.
5. **People (src/npc/people.v2.js): 911 calls.** `callDone` reports a crash, any gunshot (including police fire) and any hit as a
   call about the player. The police now only accept a call that matches a real recent player crime nearby, so nothing is
   needed, but ideally `react()` would only choose `call911` when the player caused the event (`e.byPlayer`).
6. **Gameplay (gameplay.js, world.js):** `G.arrestT` is no longer set (the old "sprint to break free" grab is replaced by the
   compliance window / taser / cuffing in `police/arrest.js`); world.js:409 can drop that help line.
