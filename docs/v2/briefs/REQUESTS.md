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
