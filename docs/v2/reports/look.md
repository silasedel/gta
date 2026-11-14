# look track report (Nov 13, evening)

Goal: a cinematic, crisp daytime look (ref_49 top frames, ref_51 causeway bar) without leaving the 60 fps budget.
Each change is gated by `?lookoff` in the URL, so the before and after shots come from the same build, at the same spot and time, on the same machine.

## What changed
- **Atmosphere (`src/world/env/fogChunks.js`, `skyShader.js`)**
  - One shared haze-color function, `psHazeColor`, is used by the fog chunk and by the sky horizon, so geometry fades into the matching sky.
  - Away from the sun, the fog color is pulled toward a pale blue-gray (it was saturated blue at noon). Toward the sun, a broad warm forward-scatter lobe adds glow even at noon.
  - The Mie in-scatter is now clamped. At full strength it painted a white-pink veil over the far skyline.
  - Daytime haze floor: +0.00016 extinction while the sun is up.
  - Per-channel Rayleigh extinction (blue fades first).
  - Total extinction is capped at 0.00019 below a density of 0.002, so buildings 3–5 km away keep their contrast and shadow sides. The old 0.0007 at sunset and night meant 94% fog at 4 km. Underwater and weather fog above 0.002 are unchanged.
  - The sky haze band is taller by day: it blends up to 13 degrees, up from 3.5.
- **Light balance (`src/render/post.js`)**
  - `environment.js` sets these every frame. Right before the render, with the sun high, the hemisphere fill is scaled by 0.62, the PMREM environment intensity by 0.78, and the sun by 1.14.
  - Tunables are on `game.look`. Values are re-read every frame and never compound.
  - The effect fades out below a sun elevation of 0.12–0.4, so backlit foliage keeps its sky fill at golden hour (the "black trees" note).
- **Grade (`post.js`, `gradeShader.js`)**
  - Restrained, near-neutral day grade, per ref_51: light warm highlights, faint teal shadows, a black point (`uToe`, 0.012 by day), contrast 0.45 by day, saturation 1.10 (up to 1.2 at golden hour), vignette 0.27.
  - The sharpen strength comes from the preset; the clamp is widened from ±0.07 to ±0.10. The clamp change also applies under `?lookoff`.
- **Ground wear (`src/world/miami/materials.js`)**
  - World-space macro tone patches (30 m and 9 m), 1 m mottling, and roughness tied to the same noise.
  - Asphalt (road, junction, parking) also gets glossy oil stains and tar patches, hairline cracks with derivative-based anti-aliasing, and a 1.55x tone lift (the gray asphalt of ref_51, not near-black).
  - The same treatment, with different weights, on sidewalks, panels, promenade, land and roofs, plus worn paint on road markings.
  - Sand: macro variation, and a roughness floor of 0.93 that removes the mirror-like sun hot spot.
  - No new textures; two noise functions per fragment.
- **Render scale and TAA (VFX_NOTES #4, `post.js`)**
  - Only the composer targets scale; the canvas never changes size. Range per preset: ultra 0.85–1, high 0.8–1, medium 0.75–0.9, low 0.75–0.85.
  - The governor drops 0.05 after 2 s of GPU-bound frames over 17.5 ms and raises after 6 s near the cap. A raise followed by a drop within 10 s blocks raising for 60 s.
  - "GPU-bound" means `perf.cpuMs` (rAF start to end of render) is at least 3 ms under the frame time. CPU-bound frames never lower the resolution.
  - TAA: Halton jitter, depth reprojection plus a same-UV tap for camera-attached objects, YCoCg variance clip over a 5-tap cross, Catmull-Rom history, luma-weighted blend.
  - Mode `'auto'`: TAA runs only while the scale is below 1; at full scale SMAA is used. Without motion vectors, TAA visibly softened swaying palms in a same-frame A/B (`ab_sb_taaOn.png` vs `ab_sb_taaOff.png`).
- **Quality (`src/render/quality.v2.js`)**
  - GTAO is off in every preset (handover from playtest-fixes: 21 ms, a second full scene render). `post.js` follows `preset.gtao` instead of the 'ultra' name.
  - The auto-pick starts on 'high'.
  - New `look` block per preset: sharpen, taa, taaSharpen, scaleMin, scaleMax.

## Playtest round (Nico's street notes), same evening
- **Edges:** MSAA per preset (ultra and high 4x, medium 2x, low off with SMAA). Only the scene pass renders multisampled, into its own target, and is resolved once into the composer. A first version put MSAA on the composer buffers, so every full-screen pass paid a resolve; that frame measured 70 ms and was replaced. Foliage materials already set `alphaToCoverage`, which works now that the scene is multisampled. TAA stays on 'auto' (only below scale 1).
- **Resolution floor:** the internal picture never has fewer pixels than 1920x1080. `scaleFloor()` in `post.js` caps the governor and `setSize`. High now renders at native DPR (Retina). Read in game: see "Drawing buffer" below.
- **Anisotropy:** max anisotropic filtering on every ground texture set (`materials.js`).
- **Sun glare:** glare core 0.10/0.25 to 0.04/0.14, streak 0.18 to 0.07, ghosts halved, god rays more than halved. The HDR is capped at 10 before bloom, so wet-sand and water sparkles stay sparkles.
- **Not done (other owners or out of budget):** pop-in cross-fades and LOD hysteresis (streamer, tilebuild, vegetation), puddle decals on sand (sand-wear), wet SSR, probe GI, haze lit by local lights.

## Cost (1920x1080, headless Chrome, shared machine with load 9–15)
- Post chain only, timed by rendering it 20x between hard syncs (`src/render/.lookab.mjs`, South Beach): see the numbers in the progress JSON (`postCost`).
- Frame times in this headless browser are 20–30 ms and CPU-bound by world work (`metrics_*.json`). Before and after differ within noise. 60 fps on the user's Mac is **not** confirmed by me.
- The `EXT_disjoint_timer_query` numbers in `metrics_*.json` are not usable: on this ANGLE/Metal path they include the scene pass (8–21 ms, both before and after).

## Shots (`docs/v2/shots/look/`)
`pair_<spot>.jpg` = before | after | reference crop. Raw frames: `before_<spot>.png`, `after_<spot>.png`.

## Tools
- `src/render/.lookshots.mjs`: fixed spots, frozen clock (`game.time.paused`), metrics.
- `src/render/.lookab.mjs`: same-frame TAA A/B and post cost.
- `src/render/.looktune.mjs`: live `game.look` variants.
- `src/render/.lookpair.py`: annotated triptychs.

## Drawing buffer (read in game, default preset, Retina emulation 1512x982 at DPR 2, headless)
- Preset: high. Canvas: 3024x1964. Internal (composer) render: 2873x1866, scale 0.95. That is above the 1920x1080 floor, so TAA is in auto mode.
- MSAA 4x on the scene pass. Frame screenshot: `docs/v2/shots/look/retina_default.png`.
- That headless run measured 10 fps with 83 ms of CPU per frame: load average 17–33, and `tilebuild.js shopDress` was throwing in a loop (another track). This says nothing about the Mac's frame rate.

## Requests for other tracks (from the coordinator's later notes, not done here)
- Pop-in: dithered LOD cross-fades and switch hysteresis (streamer, tilebuild, vegetation).
- Puddle decals on sand need sky reflection or removal in dry weather (sand-wear).
- Far-LOD towers render as flat pale boxes at dusk and read as a "white veil" (city-look `makeFacadeFar`).
- Black trees: vegetation translucency and wrap lighting (vegetation). My part: the sky fill is no longer cut at low sun.
- Z-fighting: reversed depth or near/far per mode, plus polygonOffset on coplanar layers (`main.js`, `cinema.js`, tilebuild). Not started.
- Shadow reach at road level for dappled palm and tree shadows (`environment.js`, `shadows.js`). Car clear coat, tail-light emissive and store-window interiors belong to vehicles and city.
- Ground textures: the coordinator assigned them to the ground agent after I added `groundWear` in `materials.js`. To drop it, remove the five `groundWear(...)` calls. It is off under `?lookoff`.

## Pass 3 (Nov 14): z-fighting, MSAA cost, interior bloom
- **Ground agent:** the ground wear is kept. It is `groundWear(mat, amp, stain, key, crack, tone, minRough)` near the end of `src/world/miami/materials.js`, five calls (asphalt, paving, sand, land and roofs, markings). Tune the numbers there; `?lookoff` disables it.
- **Z-fighting:**
  - `src/ui/menu/cinema.js`: the near plane now follows the shot's focus distance, `clamp(focus * 0.02, 0.2, 1.5)`. Wide skyline shots run at near 1.5 instead of 0.2: about 7x the depth precision at range. Close-ups keep 0.2. Disabled under `?lookoff`.
  - `post.js`: gameplay cameras get near = `clamp(height above ground * 0.012, 0.25, 1.2)`. Street level is unchanged; aircraft and rooftop views gain precision.
  - Reversed depth was not used: the AO, TAA, cinema DOF and ocean shaders all assume standard depth.
  - Existing polygonOffset on ground layers and markings is unchanged.
- **Cinema DOF fix:** `cinema.js` read `rb.depthTexture`, which MSAA leaves stale. It now reads `post.sceneDepth`.
- **Two-frame diffs** (`docs/v2/shots/look/zfight_before_after.jpg`, `z_*_diff.png`, frozen cinema camera, 3 rAF ticks apart):
  - Venetian sunset wide shot. Before (near 0.2): whole roofs and ground surfaces change between frames. After (near 1.5): building surfaces are stable; only palms (wind) and a few far pixels change. This points to the fix working, but exposure adaptation could also explain part of the before diff, so it is not proof.
  - The before skyline frame caught the loading screen, so there is no valid pair. In the after skyline diff, the changing far buildings come from LOD tiles swapping between frames (pop-in), not depth fighting.
- **MSAA cost** (full frame, 10 renders between hard syncs, 1600x900): 4x vs off = 17.4 vs 15.0 ms in one run, 41.6 vs 33.0 ms in another under heavy load. High now uses 2x, ultra 4x, medium 2x.
- **Interior bloom:** the bloom night term is `max(night, env.indoor)`, so venues glow by day.
- **Not done this pass:** edges and shimmer in motion from a frame sequence; tree and road-shadow after-shots; car paint, tail-light and window comparisons with ref_57/ref_59.

## Pass 4 (Nov 14): navy shade fix (`post.js`, `game.look`)
- By day (fading out below sun elevation 0.05–0.25):
  - hemisphere sky colour pulled 75% toward its own grey (`skyDesat`);
  - warm sun bounce added to the hemisphere ground colour (`bounce` 0.6: sun colour x 0.36/0.31/0.24);
  - PMREM environment intensity x0.4 (`envDay`, was 0.78), because its blue diffuse was the main source of navy shade;
  - hemisphere x1.65 (`hemiDay`, was 0.62) to keep shade brightness;
  - teal shadow push in the grade cut to 25% (`shadeTint`).
  The sunlit side is unchanged. Colours are re-captured every time `environment.js` writes them, so nothing compounds.
- Same camera, same page, old and new values toggled live: `docs/v2/shots/look/neutral_shade_before_after.jpg` (Downtown at 15:30 on top, Julia Tuttle Causeway at 15:30 below).
- Result:
  - Downtown: the shaded street and walls are clearly less blue, but somewhat darker.
  - Julia Tuttle: the shaded inner barrier went from navy to a darker blue-grey. Better, but not the neutral grey of ref_57/58/59; a blue grazing sky reflection remains.
- **Next step, not done:** sky occlusion on vertical faces, or a desaturated environment map for the diffuse term only (needs `environment.js`).
- Not shot: under the US-1 ramp; car paint, tail lights and windows vs ref_57/59 (out of budget).

## Pass 5: navy asphalt on East Flagler at 1 PM
- **Diagnosis** (in-page toggles, same camera; mean road colour in the bottom-centre crop):
  - Removing the grade lift and shadow tint: 19.0 to 17.0 blue.
  - Fully grey hemisphere: almost no change.
  - Environment intensity set to 0: road (1.8, 2.3, 2.2), near black and neutral.
  - So the sky environment map (PMREM) supplies about 8x the hemisphere light in shade, and it is blue.
  - The road material is the plain `M.asphalt` (roughness 1, no own envMap). A per-material `envMapIntensity` has no effect with `scene.environment` in three r170; I tried it and removed it.
- **Fix** (`fogChunks.js`, global chunk patch): the IBL irradiance (diffuse only) is pulled 65% toward its own luminance, slightly warm. Specular sky reflections keep their colour; off under `?lookoff`. `game.look.envDay` raised back to 0.6 to keep shade brightness.
- **Result** (`docs/v2/shots/look/navy_road_before_after.jpg`): shaded asphalt moves from (5.8, 10.3, 19.0), navy, to (10.4, 14.1, 21.2), a dark slate grey. Walls in shade are more neutral too.
  - Still slightly cool: what remains comes from the grade's blue lift (`uLift` 0.012), the 35% kept IBL colour and the grazing sky specular.
  - Not rechecked at night or sunset; the desaturation applies at all times of day.
