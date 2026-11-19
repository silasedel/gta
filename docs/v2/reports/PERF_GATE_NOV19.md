# 60 fps gate: in-app benchmark, fixes, results (perf lead, Nov 19)

## Tool
- `node tools/v2/bench.mjs --label <x> --app desktop/dist/mac-arm64/Southline.app --preset high` (or `--web <vite build>`
  to run unpackaged Electron on a build folder). The Mac app runs `src/perf/bench.v2.js` (`--ps-bench=<label>`, own test
  profile, fullscreen): spawn yard (stand 12 s), walk 12 s, drive the Keys 35 s, drive downtown 35 s, beach walk 15 s,
  downtown at night 30 s. Teleport settles (streaming a new place, a load screen in a real game) are recorded apart and
  are not in the gate.
- Report `docs/v2/reports/bench-<label>.json`: per frame gap -> p50/p95/p99, frames over 16.7/25/33/50/100 ms; per segment
  the per-system CPU (main.js timers), draw calls, triangles, GC count (heap drops), shader programs; the 25 worst frames
  with what ran; console errors; streaming long steps; updater sources. Summary lines go to the test profile's app log
  (`~/Library/Application Support/Port Solana Test/logs/app.log`).
- `node tools/v2/bench-prof.mjs --web <unminified build> --segs downtown,night [--heap 1 [--promoted 1]]`: CPU profile and
  allocation sampling of the same route over DevTools, with the long main-thread stretches and what ran in them.
- `--jsflags "--trace-gc" --gclog <file>` records every V8 GC of a run.

## Measured causes and fixes (all committed; each has a ?flag for A/B)
| cause (CPU profile of the in-app run) | cost measured | fix |
|---|---|---|
| People seat probes: `scene.traverse` + Raycaster against every InstancedMesh and merged tile batch | 200-680 ms/s on the beach, single stalls 0.4-4.6 s | only small meshes / instances near the seat, 1 probe per frame (`src/npc/furnitureSeat.js`) |
| Auto exposure read pixels back (`getBufferSubData`), a sync GPU round trip | 25-45 ms/s, a dropped frame per reading | auto exposure fully on the GPU (`post.js`, `?aeread=cpu` = old) |
| Interior surface normal maps: `getImageData` on a GPU canvas + `Math.hypot` | 87-115 ms/s downtown | CPU-backed canvas, sqrt (`interiors/kit/surfaces.js`) |
| New shader programs linked on first draw (`getProgramParameter`) | 120 ms/s downtown | `src/perf/shaderGate.v2.js`: skip the draw until the program links in parallel |
| Transparent double-sided materials flipped side + needsUpdate twice a frame | ~15 program re-evaluations a frame + garbage | one-pass (`forceSinglePass`), `?singlepass=0` |
| One shared shadow depth material rewritten per caster | several program re-evaluations a frame | one depth material per caster class, `?shadowdepth=0` |
| `world.updateSceneQueries()` called by several systems: full query-tree rebuild each time | several per frame, 200+ ms while streaming | only after the collider set changed (`src/perf/physicsGuard.v2.js`, `?sqguard=0`), 90% skipped |
| Fast driving ran up to 4 full streamer passes a frame | up to ~20 ms a frame | extra passes only for colliders missing within 0.75 s (`miami/city.js`) |
| Traffic respawn: 40 Rapier shape queries x several cars in one frame | 115-640 ms stalls | 2 ms/frame query budget (`vehicles.js`, uncommitted inside the vehicles agent's work: see REQUESTS) |
| 4K people close-up texture uploads | 230 ms frame | 2K albedo (`npc/people/lib.js`, `?people4k=1`) |
| Saved Low preset / 0.85 scale (from the laggy days) | quality | reset once to High (`ui/settings/store.js`, `quality.v2.js`) |
| Traffic special-car spawn search on every manager tick in the first 90 s | 25% of the main thread at spawn | every 1.5 s (`vehicles.js`, uncommitted inside the vehicles agent's work) |
| Bounding spheres of merged city chunks / batches computed with 3 passes | 50-90 ms streaming steps | sphere from the box (`tilebuild.js`, `city/geo.js`) |
| Frame pacing off by default (Unlimited) and the 120 Hz panel misread as 60 Hz at boot | judder 120 / 60 / 40 fps | 60 fps cap default, refresh re-estimated live (`settings/schema.js`, `perfGuards.v2.js`) |

## Still open (measured, not fixed tonight)
1. V8 full mark-compact GCs: 47-77 a minute, 100-300 ms atomic pauses (`--trace-gc`), even standing still; 60% are
   "external memory pressure". V8 heap flags (semi-space, initial old space, growing factor, pretenuring, memory reducer)
   gave no consistent gain. Needed: far less per-frame and per-tile garbage (typed-array staging pools for city
   batches, no JS-array geometry building, fewer per-draw uniform uploads).
2. City tile building steps of 100-1000 ms (`buildNear` / `buildMid` / facade build): needs the tile builder in a Web
   Worker with transferable typed arrays, or much finer yields inside `buildBuilding`.
3. Rapier `world.step` spikes while streamed colliders are added (airport trimeshes built in-frame: see REQUESTS).

| High preset internal resolution: native Retina 3024x1898 | GPU ~40 ms a frame at downtown | ~1440p internal (0.75, governor floor 0.67), TAA + upscale: 27 ms, now CPU-bound (`quality.v2.js`) |
| Physics: 3 sub-steps in a slow frame | ~4 ms per extra step, kept the next frame slow | at most 2 (`main.js`, `game.physMaxSteps`) |

## Results (built Mac app, High preset, 3024x1898 fullscreen, full route)
| run | machine load | p50 | p95 | p99 | max | frames > 33 ms | > 100 ms | frames |
|---|---|---|---|---|---|---|---|---|
| before (`bench-base`, 00:00) | 24-33 | 75 ms | 318 ms | 1417 ms | 4575 ms | 759 (70%) | 328 | 1086 |
| after, loaded (`bench-fixE`, 04:00) | 37-51 | 99 ms | 350 ms | 450 ms | 726 ms | | 481 | 1006 |
| after, quiet-ish (`bench-quiet2-high`, 05:00) | 6-7 | 33 ms | 102 ms | 135 ms | 275 ms | 1793 (51%) | 205 | 3490 |
| **gate High** (`bench-gate-high`, 05:15, built app) | 5-7 | 40 ms | 108 ms | 142 ms | 206 ms | 1991 (60%) | 194 | 3304 |
| gate Medium (`bench-gate-medium`, 05:20, built app) | 6-9 | 39 ms | 108 ms | 134 ms | 2856 ms (1 gap outside the frame) | 1886 (59%) | 213 | 3208 |

Medium is no faster than High: the frame is CPU-bound (cpu p50 25-43 ms per segment) once High renders at ~1440p
internal. Zero console errors in both runs.

The before run had a heavier load than the quiet run, so the improvement is overstated in p50 but not in the spikes
(the multi-second freezes are gone at any load). Where the time goes now (quiet, per frame): render submission ~14-16 ms
of CPU (three.js scene traversal and ~600-1000 draws; not shadows, not draw distance: measured), Rapier 6-13 ms (2-3
sub-steps at 30 fps), the rest 5-8 ms; GC pauses and streaming steps make the p95 / p99 tail.

**The 60 fps gate does not pass.** p99 < 16.7 ms needs the CPU frame cut by about half. That is engineering work for
the next days, not tonight: (1) a render-side spatial partition so three.js does not traverse / update the whole scene
graph every frame (static subtrees with `matrixWorldAutoUpdate = false`, per-tile visibility lists), plus instancing /
merging of repeated props; (2) the city tile builder in a Web Worker (typed arrays, transferables) so streaming steps
never land in a frame; (3) GC: no JS-array geometry staging (Batch), pooled typed arrays; (4) physics: fewer awake
bodies, simpler colliders for far cars.
