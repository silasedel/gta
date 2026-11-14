# Environment track report (Nov 13)

## What changed
- `src/world/environment.js`: new sun-elevation ramps for sky zenith/horizon, hemisphere light, cloud ambient, cirrus, exposure and fog density. Day: deep blue sky, clear air (fog density 0.00011 to 0.00013 at high sun, was 0.0006). Sunset (sun elevation 0 to 0.2, about 5:30 to 7 PM): pink-violet palette, rose-lit clouds, more cloud cover, thicker haze. Creates `game.wind`.
- `src/world/env/skyShader.js`: less cloud cover, thinner and brighter cirrus (the old gray veil), brighter lit cloud tops.
- `src/world/env/ocean.js`: turquoise shallows (0 to 125 m from shore) to deep teal, choppier ripples and wider glitter at low sun, slightly dimmed sky mirror at low sun, ripples drift with the wind and get choppier with wind speed.
- `src/render/post.js`: contact AO pass (one full-screen pass from the depth buffer, 10 taps, fades out 55 to 130 m, no extra scene render); bloom threshold 1.0 by day; weaker god rays; stronger eye adaptation into the sun; grade tints (teal shadows by day, violet at sunset). Depth textures on both composer buffers.
- `src/render/gradeShader.js`: vignette 0.42 to 0.2, grain 0.035 to 0.012, clamped unsharp mask (`uSharp` 0.45).
- `src/world/env/wind.js` (new) and `src/fx/fx.js`: shared wind; smoke, dust and mist puffs are carried by it.

## Shared API: wind
`game.wind = { dir (THREE.Vector2 unit x,z, direction of travel), speed (m/s), gust (0..1 at camera), vx, vz, time, sample(x, z, t?, out?) -> {x, z} m/s, strength(x, z, t?) -> gust multiplier, uniforms { uWindDir, uWindSpeed, uWindGust, uWindTime }, set({ angle, speed } | null) }`. Event `wind:ready` (payload: wind) fires on the next tick after creation; `game.wind` already exists before any V2 module loads. Driven by time of day (onshore sea breeze by day, weak offshore at night) and `game.weather` (`.wind` number if present, else rain/storm kinds).

## Settings
- `game.settings.ao = false` turns contact AO off (also off on quality 'low'; 'ultra' uses GTAO instead).

## Measurements (headless test browser, 1280x720; machine load was 6 to 36 the whole session)
| View | Before | After |
|---|---|---|
| Street 10 AM | 753 calls, 21.3 ms (load 36, resolution scaled to 0.8) | 738 calls, 16.6 ms (load 6.6, full resolution) |
| Bay | 387 calls, 16.75 ms | 338 calls, 16.65 ms |
| Golden | 701 calls, 18.7 ms | 765 calls, 20.3 ms (load 15) |
| Night | 869 calls, 22.5 ms | not re-measured |
| Sunset | 330 calls, 17.25 ms | 369 calls, 16.75 ms |
Draw-call differences are traffic and streaming, not this work (the AO pass adds one full-screen draw). Frame times are vsync-capped and the load was high, so 60 fps is not confirmed.

## Known gaps
- Clouds are still streaky sheets, not the puffy cumulus of ref_38.
- AO is subtle and was not checked in a close-up; no shimmer test in motion.
- Shadows were not changed; no motion test for shimmer or peter-panning.
- Wind: nothing in my code handles litter; palm-frond shadows need the vegetation track to animate fronds (the static shadow map only refreshes every 0.75 to 12 s).
- The "before" street and bay shots were taken with dynamic resolution at 0.8; the other before shots at full resolution.
- An earlier revision of the AO pass rendered the game black on the shared dev server for about 3 minutes (depth texture shared by both composer buffers); fixed.

## Requests for other tracks
- Translucent yellow columns and floating beige dots are visible on Ocean Drive in daylight (see `street_after.png`); not from environment code.
- Far skyline buildings read as flat pale-blue boxes at midday; they need lit, warmer facade materials to match ref_38.

## Pass 2 (Nov 13, evening)
- Clouds (`skyShader.js`): the old sheet clouds are replaced by a 5-step march through a thin slab on a curved shell (cell noise for round clouds, narrower tops than bases, sun-side shading, darker thick bases, backlit rims and sun-lit undersides at low sun). Drift follows `game.wind` (`uCloudOff`). Cirrus kept as a thin layer whose amount varies by day number (`uCirrus`).
- Water (`ocean.js`): greener, darker deep color; sky light on the water body is mostly neutralized so it stops going blue; daytime fresnel mirror scaled to 0.55; two finer normal layers near the camera; wave-facet shading visible from the air; sand tint within 16 m of shore; wider shore foam edge. No boat wakes were added.
- Sunset: fog density raised at low sun (0.00058 to 0.0007); bloom threshold drops by 0.14 and strength rises at sunset so the glitter path blooms.
- Midday light: warmer sun (1.0, 0.93, 0.82), sun 3.9, hemisphere 0.48, contrast 0.37, saturation 1.25.
- AO close-up: `docs/v2/shots/environment/ao_on_left_off_right.png` shows darkening under the car and in the wheel arches. The AO-on frame measured 23 ms against 16.9 ms off in that one pair (1,055 draw calls, shared machine); other AO-on views held 16.6 to 16.8 ms. Not resolved.
- Vantage points: midday from Watson Island at 60 m looking at downtown (`target2`), sunset from the water 600 m off the downtown shore (`sunset2`).
- Seen: sunset (`sunset2_p2b.png`) with final clouds, haze layering, glitter bloom. Midday final clouds and water (`target2_p2b.png`), but in that frame the city did not build: `src/world/miami/tilebuild.js` threw `ReferenceError: LB is not defined` in `buildMid` (another track). `target2_p2_prev_clouds_with_skyline.png` is one cloud iteration older and has the skyline.
- Not seen: final clouds at street level, at night, or in motion; beach shallows and shore foam close up; cloud cost on a quiet machine.
