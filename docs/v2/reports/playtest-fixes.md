# playtest-fixes report (Nov 13, about 20:25 MST)

## Read this first: caveat on the numbers
All measurements come from our isolated headless Chrome. The machine was heavily loaded the whole time: the 1-minute load average was 15 to 77, with other agents, an Electron install and an OSM merge running. Frame-rate numbers are therefore **not reliable** as absolute values (CONTRACT5). The memory curves, the program counts and the before/after comparisons, which were run under the same kind of load, are reliable.

## 1. Tab crash and freezes: causes found and fixed

| Cause | Evidence | Fix | Where |
|---|---|---|---|
| **Far LOD for the whole world.** A far mesh was built and kept for every 800 m chunk of the 31 x 45 km world (about 2,200 chunks), starting at load. While standing still, about 20 new geometries per second were added; `miami-city` went from 158 to 1,880 geometries in 90 s. | geoleak probe | Far LOD only within 9 km of the camera (the far plane is 8 km). Chunks beyond 10.5 km are disposed. | **Patch for city-look / lead:** `playtest-fixes-patches/stream-far-radius.patch` (src/world/miami/stream.js) |
| **Shader recompile storms.** three.js bakes the light count into every shader. Lights came and went: point lights went 16, then 11, then 12, through store, police, muzzle and fire lights. Each change recompiled every material in view, in bursts of 60 to 70 programs, which caused the 0.5 to 2 s freezes. There were 250 new programs after load. | progs probe | `src/render/perfGuards.v2.js` gives the renderer exactly 16 point and 4 spot lights. Zero-intensity spares fill the gaps; any extra lights (the farthest and dimmest) sit out that frame. After the fix there were 57 new programs after load. All 57 are genuinely new materials, and the light tuple stays fixed at `2,16,4`. | mine |
| **Minimap rebuilt all shop icons every frame.** `game.interiors.list` was a getter that returned a new array on every read, so `hud.js` `shops()` never hit its cache. That churned 390 MB per 20 s. | heap sampling | perfGuards caches the list until a source list changes. | mine (runtime). interiors-engine should fix it natively in `src/world/interiors/index.js` |
| **Facade batches** stored 16 floats per vertex in growing JS double arrays, which churned 830 MB per 20 s. | heap sampling | perfGuards switches FBatch to a growing Float32Array. | mine (runtime). city-look should adopt it in `src/world/city/facade.js` |
| **Elevated joints re-sampled per tile build.** `framesAt` allocated per joint for every joint in the network on each gather, which churned 1 GB per 20 s. | heap sampling | Cache each joint's frame, since joints never move. | **Patch:** `playtest-fixes-patches/elevated-joint-cache.patch` |
| **Shader error checks** stalled on `getProgramParameter` after every new program. | | `renderer.debug.checkShaderErrors = false` in production builds only | mine |
| **Context loss** left a dead page. | | `src/render/contextGuard.v2.js` pauses the game, shows a message, forces a restore after 3 s, and offers reload after 15 s. | mine (built, not tested with a real loss) |

### Memory curve, 7-minute walk and drive soak
- **Before** (the stable build on 5210): the heap after GC grew from 1,213 MB to 1,728 MB. Geometries went from 692 to 2,331 and shader programs from 576 to 929, still climbing. The peaks reached 2.86 GB, about every 60 s.
- **After** (my build plus the 3 patches): the heap after GC held flat at about 1,710 to 1,760 MB from minute 1.5 to minute 7. Geometries settled at about 1,900 to 2,300 and programs at 857 to 865. Peaks were still 2.4 to 2.5 GB, because tile building still allocates heavily (see below).
- Raw data: scratchpad `soak_before.json` and `soak_after.json`.

### Frame-time trace: 150 s, 1920x1080, walk then drive (load 15 to 26)
| | before (5223) | after, mine only (5224) | after, mine plus patches (5225) |
|---|---|---|---|
| pixel ratio | 0.8 (adaptive scaler) | 1.0 native | 1.0 native |
| avg | 156 ms (6.4 fps) | 38 ms (26 fps) | 35.8 ms (27.9 fps) |
| p99 | 400 ms | 100 ms | 66.7 ms |
| 1% low | 0.1 fps | 1.9 fps | 5.4 fps |
| worst | 73,497 ms | 5,067 ms | 1,883 ms |
| frames > 100 ms | 32 | 34 | 18 |
| new programs during the run | 200 | 27 | 11 |

Remaining long frames after the fixes:
- **Physics:** `world.step` takes 25 to 37 ms per frame while driving (Rapier, about 800 colliders). This is the top item in every remaining spike above 50 ms.
- **Render:** about 14 to 16 ms.
- **Car entry:** one 1.9 s frame when entering a car.
- **Tile building:** still allocates about 10 MB/s. Moving it to a worker is a city-look job.

The 60 fps target with no frame over 25 ms is **not verified**. This machine cannot show it under this load, and the physics and tile-building work above still has to move off the main thread.

## 2. Resolution and crop
- **Cause:** the FPS-adaptive scaler in `src/render/post.js` dropped the pixel ratio to 0.8 within seconds. That left a 1536x864 buffer in a 1920x1080 window, which matches the user's "1574x885, 82%".
- **Fix:** the scaler is removed. The resolution is native and fixed at `min(devicePixelRatio, 2)`. The canvas CSS is always 100vw x 100vh, and a ResizeObserver plus the fullscreen event keep the buffer matched to the window.
- **Measured after the fix:**

| window | DPR | buffer |
|---|---|---|
| 1200x700 | 1 | 1200x700 |
| 1920x1080 | 1 | 1920x1080 |
| 1920x1080 | 2 | 3840x2160 |
| 2560x1440 | 2 | 5120x2880 |

  The buffer was still 5120x2880 after 15 s. The viewport equals the buffer and the bounding rect equals the window.
- **Lead:** `main.js:48` still sets 1.5 at boot. `post.js` overrides it, but please change it to 2 for consistency.

## 3. People
- **Gait (crowd tier, `crowd.js`, `people.v2.js`):** cadence now comes from speed, stride, leg swing and height, so feet plant without sliding. Each person also gets their own leg-swing variation.
- **Near people (`peds.js`):** in view, they now animate every frame up to 60 m, then every other frame. Before, it was every 2nd frame from 20 m, every 4th from 45 m and every 5th from 70 m, which looked choppy and "stubbly".
- **Pop-in:**
  - The crowd fades with a dithered alpha (Bayer 4x4) over 0.5 s, in and out.
  - The far edge (167 to 185 m) fades by distance.
  - Close spawns are placed behind or beside the camera; in-view spawns happen only beyond 110 m.
  - A drop in fps trims the crowd by only 20% (it used to cut it by 70% at once, which read as mass pop-out).
- **Density:** the crowd target went from 170 to 240 (pool of 380), and the near cap from 32 to 40. On the same Downtown spot, before vs after: near 13 vs 16, crowd 26 vs 83, in view 16 vs 31.
- **Not verified visually:** close-up shots of the gait and the fade were not taken.

## 4. Shadow flicker (`src/world/environment.js`, `src/world/env/shadows.js`)
- The static map keeps the exact light direction it was rendered with. A re-center after a move reuses it, so edges land on the same texels.
- The bias and normalBias come from that same direction, so they no longer change under a map that was not redrawn.
- The dynamic map uses the same direction too.
- The static map is centered 52 m ahead of the camera and re-centers at most every 0.4 s.
- Both maps fade out smoothly over their outer 18%, instead of ending in a hard line that jumps.
- **Built only:** I have no video evidence of the flicker before or after.
- `src/render/stage/environment.js` is a staging copy and is not loaded; the live file is `src/world/environment.js`.

## 5. Street signs
- **Cause:** the `tilebuild.js` corner blades, which are a second sign system next to keys-sign's.
  - `cleanProps` moves the pole off the walkway but not its signs, so they float.
  - Each blade is one double-sided plane, so it reads mirrored from behind.
- **Fix:** the patch `tilebuild-drop-corner-blades.patch` removes them. keys-sign already places blades centered on their own posts, with a correct face on each side.
- **Before:** `sign_before_front.jpg` and `sign_before_back_mirrored.jpg`.
- **After:** `sign_after_front.jpg` and `sign_after_back.jpg`.

## 6. Fire (`src/fx/fire.js`, `src/fx/fire.v2.js`, preview `src/fx/preview_fire.html`)
- **What it looked like before:**
  - Burning wrecks were drawn by `vehicles.js` as an additive Points cloud of flat orange discs (`skids.js createSmoke({fire:true})`).
  - Explosions were orange sprite bursts from `gunfx.explosion`.
  - Every disabled traffic car burned for 25 s, so fires showed up all the time.
- **Flames:** noise-driven sheets. Each one is turbulent fbm with a teardrop envelope that tears into tongues and a black-body color ramp. The blend is premultiplied and partly occluding, so flames stay orange against a bright sky.
- **Explosions:** a fireball that billows and burns down into black smoke, plus embers that rise and drift with the wind, and one fixed warm light that flickers.
- **Old sprites:** hidden at run time.
- **Explosions in game:** `gfx.explosion` and `gfx.flame` are replaced at run time. Debris, sparks, scorch and shockwave are kept.
- **Car fires are now rare:** they happen after explosions and the player's crashes. An ordinary traffic wreck burns about 1 time in 8; otherwise it only smokes.
- **Heat haze:** not done.
- **Verified in the preview** (`fire_car_day.png`, `fire_car_night.png`, `fire_explode_ball.png`, `fire_explode_burn.png`), **not inside the running game.**
- **Pickup beams** (the coordinator's note): they now show only within 45 m, and are shorter and fainter by day. The starter stash keeps a 160 m beam for its first 4 minutes.

## Not done
- **Quality presets with auto-pick:** the schema exists in `src/ui/settings`, but its store is not wired into the game. AO stays as before: contact AO on, except on 'low'; GTAO only on 'ultra'.
- **Moving work into workers:** tile building and physics prep.
- **Precompiling** the remaining first-sight materials.
- **Physics step cost while driving.**
- **In-game checks** of the fire, the gait and the shadows.

## For the lead
1. Apply the three patches in `docs/v2/reports/playtest-fixes-patches/`:
   - Each patch includes its file path. Example: `patch -p1 < docs/v2/reports/playtest-fixes-patches/stream-far-radius.patch` from the repo root.
   - All three were tested together in a copy of the repo.
2. Change `main.js:48` to `Math.min(devicePixelRatio, 2)`.
3. Change the spike threshold at `main.js:895` from 40 ms to 25 ms.
4. New APIs:
   - `game.fireFx { burn(key, pos, size), explode(pos, radius) }`
   - `game.lightBudget` (stats)
   - `game.perfGuards`
   - `game.contextGuard`
   - Event `gpu:restored`
   - `game.post.fitWindow()`
5. New files:
   - `src/render/perfGuards.v2.js`
   - `src/render/contextGuard.v2.js`
   - `src/fx/fire.js`
   - `src/fx/fire.v2.js`
   - `src/fx/preview_fire.html`
6. Edited:
   - `src/render/post.js`
   - `src/world/environment.js`
   - `src/world/env/shadows.js`
   - `src/npc/crowd.js`
   - `src/npc/people.v2.js`
   - `src/npc/peds.js`
   - `src/gameplay/pickups.js`
