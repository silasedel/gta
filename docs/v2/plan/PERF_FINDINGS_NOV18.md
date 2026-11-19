# Lag and freeze findings (Nov 18 evening, lead)

## Tool
`node tools/v2/freeze-probe.mjs --secs 90 --still 30 [--heap 1 | --heapalloc 1]` (serve the built game with `python3 -m http.server 5200 -d desktop/dist/web --bind 127.0.0.1`, or run `npm run dev`). It stands still, then drives; it records every frame gap over 60 ms, long tasks, long animation frames with the scripts that ran, and JS heap every 3 s -> `docs/v2/reports/freeze-probe.json`. `PROBE_ARGS="--js-flags=..."` passes browser flags. `--heapalloc 1` samples ALL allocations for the whole run (the garbage ranking below); use the dev server to get readable source names.

## Measured (headless, loaded machine; the real app felt like about 10 fps)
| | before | after (HUD blur off, minimap 30 Hz, audio per-frame error fixed) |
|---|---|---|
| spawn frame time | 516 ms (10 fps), render 179 ms, hud 37 ms | 22 ms (41 fps), render 13 ms, hud not in the top list |
| frame gaps over 60 ms in 2 min | 675 | 385 |
| gaps over 120 ms | 344 | 75 |
| worst gap | 783 ms | 567 ms (boot) |
| fps at the end of a drive | 13 | 61 |
The two runs were not under identical machine load (the app was open during the first), so part of the gain is a quieter machine. Premiere Pro and Creative Cloud were running during play and take a lot of CPU/GPU.

## Causes found
1. **HUD**: `backdrop-filter` on 14 HUD panels blurred the live WebGL canvas every frame, and the minimap redrew every frame. Fixed (`src/ui/hud/polish.css`, `src/ui/hud.js`). Hiding the whole HUD in an A/B cut frame time by about two thirds.
2. **Audio**: `src/core/audio.js` read `game.menuMusic.duckLP` while `menuMusic` was null (every frame during the loading screens, an exception plus a log line each time). Fixed.
3. **Garbage**: the game allocates about 150 MB/s (7.4 GB in 50 s), so the JS heap sits near 3 GB and the browser stalls to clean it. Live data is only about 300 MB (sampled), so this is mostly short-lived garbage. Top sources in 50 s (dev build names): `nicoHouse/kit.js box` 1320 MB (house geometry built with plain arrays; one-time at load or repeated: check), `String.replace` 665 MB (per-frame string building: find with a CPU profile), three.js `setValueV3f` 400 MB and `toArray` 365 MB (uniform arrays or `Vector3.toArray` called per frame), iterator `next` 285 MB (`for...of` over Map/Set per frame), `Math.hypot` 171 MB (call with 2-3 args allocates; use `Math.sqrt(x*x+z*z)`), `getParameters` 160 MB, `miami/stream.js update` 159 MB, `vegetation/countryside.js work` 111 MB, `core/audio.js updateMusic` 92 MB, `vegetation/lawn.js stepJob` 86 MB, `miami/data.js sliverLand` 71 MB.
4. **A smaller V8 heap limit did not help** (`--max-old-space-size=1536`: 368 gaps over 60 ms, 138 over 120): do not pursue.

## Next, in order
1. Reduce the garbage sources above (typed arrays, reused vectors, no per-frame string/array/iterator creation). Re-run `--heapalloc 1`; the goal is under 20 MB/s and zero gaps over 100 ms in the still phase.
2. Draw cost at spawn is about 13 ms at 2K with MSAA 2 and TAA; if still under 60 fps on the user's real laptop, test dropping MSAA to 0 with TAA on, and fewer draw calls (Nico's house about 180, countryside about 70).
3. Physics: `world.step` and vehicle fixed hooks were 25-30 ms under load; check again on a quiet machine.
