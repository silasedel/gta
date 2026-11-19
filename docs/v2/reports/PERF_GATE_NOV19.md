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

## Still open (measured, not fixed tonight)
1. V8 full mark-compact GCs: 47-77 a minute, 100-300 ms atomic pauses (`--trace-gc`), even standing still; 60% are
   "external memory pressure". V8 heap flags (semi-space, initial old space, growing factor, pretenuring, memory reducer)
   gave no consistent gain. Needed: far less per-frame and per-tile garbage (typed-array staging pools for city
   batches, no JS-array geometry building, fewer per-draw uniform uploads).
2. City tile building steps of 100-1000 ms (`buildNear` / `buildMid` / facade build): needs the tile builder in a Web
   Worker with transferable typed arrays, or much finer yields inside `buildBuilding`.
3. Rapier `world.step` spikes while streamed colliders are added (airport trimeshes built in-frame: see REQUESTS).

## Results
(see the table below; filled in after the quiet-machine run)
