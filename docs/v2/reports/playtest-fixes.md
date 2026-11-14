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

## Update (about 20:55): quality presets, frame pacing, shader warm-up, measured runs
- **Quality presets** (`src/render/quality.v2.js`; the look agent owns this file now):
  - Four presets: Ultra, High, Medium and Low.
  - Each preset sets shadow map size and radius (through `env.setShadowQuality`), draw distance (camera far), crowd target, near-ped scale and character LOD budget.
  - Each preset also sets the pixel ratio: native (up to 2), mid, or the minimum that still renders a 1920x1080-class picture. It never goes lower.
  - Auto-pick: the game measures 10 s windows and steps down while the slowest 2% of frames exceed 18.5 ms or the average exceeds 16.9 ms. The result is stored per GPU. A manual choice, through `settings:changed` `gfxPreset` or `game.quality.set(name, { manual: true })`, always wins.
- **GTAO regression (my mistake, now fixed):** my first preset table enabled GTAO on 'ultra'. That rendered the whole scene twice: RenderPass 21 ms plus GTAOPass 21 ms on M3 Max at 1512x949, DPR 2. The look agent has turned GTAO off in every preset, and auto-pick now starts on 'high'.
- **Even frame pacing** (`perfGuards.v2.js`): on displays at 90 Hz or above, `requestAnimationFrame` callbacks run on every second refresh, an even 16.7 ms. This replaces the 60/40 judder the desktop agent measured on the 120 Hz panel. Status is in `game.framePacing`.
- **Shader warm-up for streamed tiles** (`perfGuards.v2.js`): new city tiles stay hidden from the main camera until `compileAsync` finishes, and are never held back more than 1.5 s. Status is in `game.shaderWarm`.
- **Physics:** with nothing stuck, `world.step` takes 1 ms; putting far cars to sleep only brings it to 0.5 ms. The 25 to 37 ms steps happened while the test car was stuck against geometry, which points to a contact problem in vehicles-core. Calling `enterVehicle` itself takes 0.1 ms; I could not reproduce the 1.9 s car-entry frame.

### Measured runs: 150 s each, walk then drive speed, 1512x949 at DPR 2 (MacBook Pro size), M3 Max, headless Chrome
| Build | Place | Load | Avg fps | 1% low | p99 | Worst | Frames > 33 ms | Auto preset / buffer |
|---|---|---|---|---|---|---|---|---|
| perf fixes + GTAO off | South Beach | 12-15 | 55.7 | 13.1 | 33.4 ms | 533 ms | 53 | medium / 1814x1138 |
| perf fixes + GTAO off | Nico's house | 12-15 | 57.9 | 15.1 | 33.3 ms | 633 ms | 15 | high / 2419x1518 |
| + pacing + warm-up | South Beach | 58-138 | (21.2) | (1.1) | - | - | - | invalid, machine overloaded |
| + pacing + warm-up | Nico's house | 58-138 | (11.5) | (0.2) | - | - | - | invalid, machine overloaded |

- The last two runs are invalid: the machine load rose to 122 while they ran.
- The packaged-app run (desktop agent's `measure.mjs app`) needs an app rebuilt from current src. Their latest app numbers come from a 19:34 build that has none of these fixes; I sent them the details.
- **Not met yet:** 60 fps with no frame over 25 ms. The headless runs at normal load came close on average (56-58 fps), but the 1% lows are still 13-15 fps.
- **Remaining spikes:** render CPU of 10-17 ms with about 800 draw calls, and the occasional 0.5 s frame.
- **Next steps:**
  - Fewer draw calls through merged and instanced city geometry (city-look).
  - Moving tile building into a worker (city-look).
  - Re-measuring in the app at low load.

## Swimming camera (about 21:05)
- **Cause:** the camera's height follows its pitch. When diving with the camera pitched down, it ended up above the water surface and looked down through it. It could not see the diver, only the water plane and a bright, unfogged seabed. That matches the user's split view with only the feet showing.
- **Fix** (`src/main.js`, `updateCamera`):
  - While swimming, the camera stays on the same side of the surface as Nico's head. At the surface it stays at least 0.45 m above the water. Diving, it stays below sea level minus 0.4 m and above the sea floor plus 0.4 m. So the near plane never cuts the water mid-frame, and going under switches cleanly in one frame.
  - The swim pitch eases back to at most 0.8 rad at the surface and 0.95 rad underwater, instead of looking straight down.
- **Verified in game in Biscayne Bay** (-1800, -680; 5 m deep):
  - At the surface the camera was at 1.34 m, with Nico's head above the water.
  - Diving and looking down, the camera was at -0.52 m and Nico at -4.5 m, with the underwater fog and tint active. Before the fix the camera was at +1.06 m, looking at the surface from above.
- **Shots:** `swim_before_dive_lookdown.jpg`, `swim_after_surface.jpg`, `swim_after_surface_lookdown.jpg`, `swim_after_dive.jpg`, `swim_after_dive_lookdown.jpg`, `swim_after_wade.jpg`.
- **Caustics:** not added.
- **World data bug, for world-layout / city-look:** at South Beach (3594-3610, 300), `city.isWater` reports water, but sand terrain is drawn over it. On screen it is a rectangular pool cut into the sand next to a sidewalk, and Nico walks across it (`swim_after_wade.jpg`). Swimming in such a spot puts him under a sand slab, which is the other half of the user's report.
- **NPC glitching through each other, walls and the player:** not investigated. Peds only collide (Rapier KCC) within 25 m, every 3rd frame. Beyond that they follow the ground without collisions. Peds have no separation from each other.
- **Shader warm-up fix:** `game.shaderWarm` could finish a tile twice (the 1.5 s timeout and then the compile promise). That made `pending` negative and inflated `maxWaitMs`. Each tile now finishes once.

## People clipping (about 21:10, `src/npc/peds.js`)
- **Personal space:** within 30 m of the player, people on foot keep at least 0.62 m apart. A 2 m spatial hash finds neighbors.
  - People standing in groups give way less than people walking.
  - People stay at least 0.72 m from the player when the player is on foot.
  - The push happens before the wall check, so walls still win.
  - People who are seated, sunbathing, swimming, talking or ragdolled are left alone.
- **Wall checks:** the KCC now runs every frame within 10 m of the player, every third frame from 10 to 25 m, and not at all beyond 25 m.
- **Check at South Beach** (a cluster of about 5 people, 32 active, 20 s at 10 Hz):
  - 4,649 people pairs within 30 m were sampled.
  - The closest pair was 0.58 m apart.
  - 0 pairs were under 0.45 m, and 0 people were inside the player.
- **Cost:** `peds.update` averaged 2.1 ms at the cluster and 1.1 ms at an empty spot. The two runs are not comparable (people near the player do more work), and the separation pass on its own was not timed.
