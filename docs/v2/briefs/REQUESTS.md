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
