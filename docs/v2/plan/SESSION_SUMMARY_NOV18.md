# Session summary (lead, Nov 17-18)

The lead (helper 1) coordinated about 60 helper agents across rounds 2-4, plus the fixes listed below. Every item is committed on `stage-1`. The full to-do is `docs/v2/plan/NEXT_AFTER_RESET.md`. Helper reports are in `docs/v2/briefs/OVERNIGHT_STATUS.md`.

## Completed
- **Stability:**
  - **Freeze fixed (memory leak):** the ocean shore proxies held unloaded tiles; instVao held meshes; wrecks were never swept. Memory growth -60 %.
  - **Keys physics freeze fixed:** code kept touching freed car bodies. Removed cars now get a safe stand-in body. `?rapierguard=1` traces any Rapier error.
- **Map and roads:**
  - Intersections fixed in the generator (crossings with no junction 108 -> 6, humps 205 -> 0, walls in streets 24 -> 0).
  - The new Keys layout follows the user's map: divided 4-lane highway, street grid, 39 businesses, Nico's lot at the user's dot.
  - The GPS routes by travel time.
  - `game.placement`, one shared rule that keeps things out of roads, is wired into all vegetation. Houses, yard rocks and the stray yard STOP signs no longer land on roads or sand.
- **Cars:**
  - The fleet re-converted (no layered glass or paint); rubber tires and single-layer glass.
  - Paint normals rebuilt and wear placed realistically.
  - Wheel wobble fixed fleet-wide (steered source wheels).
  - Florida plates; rare-car colors.
  - Electric cars: no start sound and instant torque.
  - Driver-door-only entry; a closer chase camera.
  - Cars hit people from walking pace.
- **People:**
  - Arms fixed (71 models); nearest-first full detail; no single-file lines; no spawning in view; district casting.
  - The beach empties in the rain; no twins; the lifeguard at the tower.
  - Nico is never used as an NPC.
  - Ragdolls stay on the ground (CCD and a floor guard).
  - Real step-out-of-the-car animation; kneeling pose.
- **World look:**
  - Rain wetness (patchy, sand absorbs, mirrors only in puddles).
  - Inland water as one even body with a soft bank.
  - Mangroves rooted; tar-seal road cracks; concrete retaining walls and jersey barriers.
  - A firmer final sharpen.
- **Library models in:** Doberman dogs, ATMs, clock, plants, umbrellas, caps, picnic tables, barrier, gas-station bin, the Soft Button UI sound.
- **Planes:** prop plane, floatplane and jet (enter with F/E), wing trails and prop smoke, the airport chain-link fence.
- **HUD and UI:** health top-left, a frosted minimap, a vehicle card; recognition icons always shown; dev mode in Settings; the Extra High preset label.
- **Nico's house r4:** reoriented; deck wraps the house; side stairs with landings; hoop between the posts; dock with chairs; interior layout, walls, TV, terrarium and back room. Still far from the mock-ups.
- **Delivery:**
  - Mac app (`desktop/dist`, full preload).
  - Website at silasedel.github.io/gta6 (streams cars and trees, WebP textures, about 988 MB).
  - The High preset adapts resolution under load (scale down to 0.65, MSAA 2x).

## Still left (detail in NEXT_AFTER_RESET.md)
- **House:** match mock-ups 01-10 in detail and atmosphere; the stairs from the corner toward the hoop; the back side per 08; the interior look.
- **Keys bridge:** continuous elevated bridges per the render (r5-bridge was on it at the end; check its report and commit).
- **60 fps in the app:** the game is CPU-bound in busy areas (tile building, GC, people skinning). That needs typed-array tile batches, worker offload and fewer draw calls.
- **Systems:** a ground-snap service (floating palms, feet in the sand); migrating every placer onto `game.placement`; fence break physics; bush squash physics; the carjack sequence; swept car-vs-people hits; ragdoll joint limits.
- **Cars:** stray triangles on suv1 (G-wagon); some SUV tires; avoiding duplicate models nearby.
- **World:** texture crispness; grainy shadows; plants that look low-res; road and sand edges; the wanted-star animation; police AI (chase starts, gun grip); hands on the wheel; the stop signs on street poles.
