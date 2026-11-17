# Southline performance plan (r2-perf, Nov 17)

Goal (user): "30 on mid computers, 60 on good", "a steady 60 fps at 1080p". Order: the graphics overhaul finishes first,
then efficiency. Rule for this round: High / Ultra must look like today or better. Low / Medium may trade quality.

## How this was measured

- Tool: `node tools/v2/perf/r2-prof.mjs` (page side `tools/v2/perf/r2-prof.page.js`). It runs one muted 1920x1080 session
  with the High preset pinned and visits Nico's spawn, the Keys street (Key Largo), downtown street level, the beach,
  the Everglades and night at the spawn.
- Per place it records:
  - frame times
  - CPU per system (`game.perf.sysAvg`)
  - a CPU split of the render call
  - GPU ms per pass
  - draw calls and triangles
  - a resource census: programs, texture and geometry MB, physics bodies, peds and vehicles, JS heap
  - per-group submit cost
  - a CPU sampling profile
  - a 30 s street drive
- Raw data: `docs/v2/reports/r2-perf-base.json` (baseline) and `r2-perf-ab1.json` (A/B toggles).
- **The machine is shared and was loaded** (load average 14-17 during the runs, about 11 helpers working). Absolute ms are
  inflated, probably by 1.5-2x on the CPU side. The shares, counts and same-session A/B deltas are what to trust.
- **GPU timer queries are unusable on this Mac.** EXT_disjoint_timer_query_webgl2 under ANGLE-Metal reported
  250 ms for the bloom pass and 450 ms per frame while frames took 69 ms. gl.finish() does not wait for the GPU either.
  GPU time per pass is therefore measured on a serialized frame: a 1-pixel readPixels before and after each pass forces
  the wait. For full-screen passes that wall time is the GPU time. For the scene pass it is an upper bound (it includes
  the CPU issue time) and wall minus CPU is a lower bound. Resolution A/B (internal scale 0.75 vs 1.0) gives the
  fill-bound share. On Windows / D3D11 the timer queries are fine, and the dynamic resolution uses them when they pass a
  sanity check.

## Baseline (High preset, 1920x1080, M3 Max under load)

| place | frame med (ms) | CPU work (ms) | render CPU | physics step | draws | triangles | programs | est. texture MB | JS heap MB |
|---|---|---|---|---|---|---|---|---|---|
| Nico's spawn 11:00 | 59-69 | 59 | 24.5 | 7.5 + KCC 8.9 | 938 | 9.28 M | 839 | 3,500 | 3,050 |
| Keys street | 23-24 | 23 | 14.4 | 2.7 | 389 | 3.12 M | 1,064 | 3,490 | 2,700 |
| Downtown street | 41-52 | 46 | 23.1 | 7.8 | 706 | 9.45 M | 1,215 | 4,720 | 4,570 |
| Beach (South Beach) | 53 | 75 | 20.8 | 8.3 (+ 31 ms updater #2) | 653 | 8.90 M | 1,224 | 4,590 | 4,210 |
| Everglades | 36 | 40 | 27.2 | 4.1 | 507 | 6.45 M | 1,225 | 4,190 | 2,900 |
| Night at spawn 22:00 | 35-43 | 40 | 19.5 | 4.7 + KCC 6.4 | 735 | 8.05 M | 1,226 | 4,450 | 2,880 |
| Street drive Keys, 14 m/s | med 37.6, p95 62, p99 91 | | 25.7 | 4.4 | ~700 | | | | |

During the drive, 474 of 764 frames were over 33 ms and 109 over 50 ms. Spike causes: render (23 spikes, 605 ms in
total), world.step (23 spikes, 115 ms), updater #20 (27 ms). No new shader programs compiled during the drive and no
long tasks, so the stage 1 compile-hitch fixes hold.

**The frame is CPU-bound on this machine.** CPU work is close to the whole frame everywhere. The render call alone is
12-27 ms, and three.js's per-draw work dominates it. The CPU sampling profile at the Keys street, by inclusive share:
- WebGLRenderer.render: 60 %
- renderBufferDirect: 36 %
- setProgram (uniform upload on every program switch): 25 %
- uniform upload: 17 %
- scene.updateMatrixWorld: 10.6 %
- projectObject (culling): 8.8 %
- Rapier step: 9.6 %

Downtown, the Rapier step alone is **33.5 %** of all CPU samples.

### GPU (serialized frame, readPixels before / after each pass; `r2-perf-ab1.json`)

| pass | spawn (ms) | downtown (ms) |
|---|---|---|
| shadow maps (wall, includes 0.7-0.9 ms CPU) | 1.3-2.0 | 2.1-3.0 |
| contact AO | 0.5 | 0.8 |
| SSR (wet only) | - | 0.3 |
| TAA resolve | 0.2 | 0.4 |
| bloom (UnrealBloom, 5 mips) | 1.6 | 2.2 |
| output + grade | 0.4 | 0.6 |
| **post total** | **4.3** | **6.8** |
| scene pass | hidden under its 17.6 ms CPU issue time (GPU keeps up) | hidden under 24.7 ms |

Same-session A/B at the spawn (2 rounds each; frame times swing with the machine load, so draws, triangles and GPU are
the solid columns):

| toggle | draws | triangles | GPU post+shadow (ms) | note |
|---|---|---|---|---|
| render scale 0.75 vs 1.0 (dynres hook) | 906 -> 891 | same | 5.1 -> 4.5 | CPU-bound: fewer pixels barely matter here |
| hide countryside + vegField | 598 -> 317 | 6.9 M -> 3.5 M | 9.2 -> 8.3 | vegetation is about half the draws and triangles at the spawn |
| bloom off | - | - | 7.1 -> 4.4 | bloom is about 1.6-2.7 ms GPU |
| contact AO off | - | - | 4.7 -> 4.6 | cheap at 1080p on this GPU |
| MSAA 0 vs 2 | - | - | inconclusive | toggling recreates the MSAA target (a compile spike polluted the window) |

Reading: on the M3 Max the GPU has headroom. A mid GPU (6-8x slower: M1 / M2 base, RTX 3050 laptop, Iris Xe) pays about
30-50 ms for the same post chain plus the 7-9 M triangles. That's where the dynamic resolution, half-res bloom / AO and
the LOD bias pay off. On good machines the CPU items decide whether we reach 60.

## Top costs, ranked, with the method for each

Saving estimates are for this machine at High and come from the measured shares. "Risk" is the visual risk.

| # | cost (measured) | where | method | est. saving | visual risk | owner |
|---|---|---|---|---|---|---|
| 1 | **three.js draw submission: 12-27 ms CPU per frame** (40-60 % of the frame). 650-940 draws, 840-1,226 programs, 2,000-2,900 materials. setProgram re-uploads light and material uniforms on every program switch. | everywhere; worst downtown, spawn, glades | (a) **program / material variant reduction**: one shared material per (shader, texture set), not per instance (2,900 materials for about 1,200 programs). (b) **merge or instance repeated props per tile**: city `[inst]` groups are 247-283 draws of mostly tiny instanced meshes. (c) **HLOD per tile** beyond about 300 m, so one draw replaces dozens. (d) static matrices (below). | 6-12 ms | none for (a), (b) and (d); HLOD needs pop tests | r2-art (materials), lead (tilebuild), r2-perf (HLOD tool) |
| 2 | **Rapier world.step: 2.7-8.3 ms**, 33.5 % of CPU samples downtown. 1,400-2,300 colliders, 380-716 fixed bodies at the beach and downtown, 20-37 active dynamic bodies, 47-55 vehicles. `updateSceneQueries` runs every substep (2.9 %). | downtown, beach, spawn | Sleep parked cars (they read as active). Disable bodies of cars more than 150 m away and outside view (kinematic ghosts). Merge tile static colliders into one compound per tile (fewer broad-phase proxies). Run updateSceneQueries once per frame, not per substep, when nothing streamed. Fixed 60 Hz step with render interpolation on a 30 fps target (two steps per frame cost twice). | 3-5 ms | none | r2-physics |
| 3 | **Player character controller at Nico's yard: 6.4-8.9 ms** (computeColliderMovement, 12 % of CPU samples at spawn). Elsewhere it is 0.35-0.65 ms. | spawn, night at spawn | A heavy collider under or around the yard (dense trimesh: micro-relief ground, deck or house mesh). Swap in boxes / a heightfield, or exclude far parts with a query filter. | 6-8 ms at spawn | none | r2-physics, r2-keys / r2-ground (yard collider) |
| 4 | **city.update (tile streaming and building) at the beach: 31 ms per frame** (EMA, updater #2) while tiles were still building; 0.3 ms when settled. The per-frame budget is 3 ms, but single generator steps run far past it (stats.maxStep). This is the "tile-build spike while driving". | beach, any fast drive | (a) Cap and split the long generator steps (log `streamer.stats.maxStep` per job kind and cut the worst into yields). (b) Move pure-data stages (mesh arrays, collider vertex lists, decals) into a **Worker pool**: the tile builder only uploads finished typed arrays. (c) A per-frame upload budget for GPU buffers and textures. | removes 30-100 ms spikes; frees 3+ ms per frame while streaming | none | lead (tilebuild), r2-perf (worker harness) |
| 5 | **Triangles: 6.5-9.5 M per frame.** Countryside vegetation 2.8-3.9 M; city library buildings 2.2-2.5 M non-instanced plus 0.9-1.6 M instanced (beach / downtown); fire escapes 0.7 M at the beach; nicoHouse 0.7 M; ground grass 0.4-0.56 M. | spawn, glades, downtown, beach | Adaptive distance LOD (below): meshopt LOD chains with a 1 px error budget, LOD bias tied to the preset and the render scale; impostors / HLOD for far trees and blocks; shadow casters from simplified proxies. | GPU: see the A/B; mid GPUs mostly pay here | low with pop tests | r2-perf (tools), r2-veg, r2-art |
| 6 | **scene.updateMatrixWorld: 2.1-3.4 ms** (8,800-11,400 objects, all re-composed every frame) | everywhere | `matrixAutoUpdate = false` on static tile content (tilebuild positions it once). | 2-3 ms | none (pixel-identical) | lead (tilebuild), r2-perf A/B |
| 7 | **Culling (projectObject) 1.5-2.5 ms**: three.js visits every object for the main view and again for each shadow light | everywhere | Hierarchical culling: tile groups with bounds; skip a whole tile outside the view (the light-extruded view for the shadow pass). Occlusion culling downtown (hi-Z from last frame's depth, CPU test on tile and building bounds). | 1-2 ms CPU, plus GPU downtown | none / low | r2-perf |
| 8 | **Texture memory: about 3.5-4.7 GB estimated in scene textures** (uncompressed RGBA8 plus mips); JS heap 2.7-4.6 GB | everywhere | KTX2 / Basis (UASTC for normals, ETC1S for albedo / ORM): 4-8x less GPU memory. Per-preset size cap (Medium 2k, Low 1k). Free CPU-side vertex arrays after upload for meshes nobody reads back. | 2.5-3.5 GB GPU; mid machines need it to run at all | none at the same resolution (UASTC); ETC1S is slightly soft on albedo | r2-web (pipeline), r2-perf |
| 9 | **Auto-exposure readback stall**: getBufferSubData 2.4-3.1 % of CPU samples (every 6th frame) | everywhere | Read back every 20-30 frames instead of 6 (the exposure eases at 0.9-1.8 per second anyway). | about 1 ms average, removes a periodic hitch | temporal only, same steady state | r2-look |
| 10 | **Ocean shore field build: 6 % of CPU for a long time after boot** (2.4 M isWater / sliverLand calls on the main thread) | after boot, spawn | Move buildShore to a Worker (the grids are plain arrays), or cache the result in IndexedDB per data version. | 3-4 ms for the first minutes | none | r2-perf (worker), water owner |


## Methods evaluated

Each method is listed with what already exists, then what to do, its saving and the visual risk. Savings are rough
estimates from the shares above.

**Already in the game**
- Static shadow-cascade caching. The static city map redraws only on a 24 m move or a sun change; only the dynamic map
  near the player redraws every frame (src/world/env/shadows.js).
- Screen-size detail culling (detailCull.v2.js).
- Program-sorted draw order (drawOrder.v2.js).
- A constant light count, so lights entering or leaving never recompile shaders.
- Parallel shader compile for streamed tiles.
- Distance LOD for:
  - humans: three levels plus a triangle budget
  - cars: LOD0 80 k, LOD1 10 k, LOD2 triangles
  - library buildings: an lod1 file plus per-cell instancing
  - vegetation: LOD0, LOD1, a baked 8-view impostor and dithered bands
- A render-scale governor in post.js, locked to 1.0 at 1080p.

1. **Instancing / merging repeated props.** The city `[inst]` groups are 247-283 draws at 41 k-1.6 M triangles.
   Most draws are small instanced meshes with only a few instances each. Merge per tile those that share a material
   (static geometry, one draw), and keep instancing for types repeated across tiles.
   - Saving: 100-200 draws, 2-4 ms CPU.
   - Risk: none.
2. **HLOD / impostors for far buildings and trees.** Beyond about 300 m, one merged mesh per tile with a baked atlas
   (albedo plus normal, so it relights with the time of day), cast from a simplified proxy. Trees: octahedral impostors
   (normal plus albedo) replace the 8-view albedo impostor. r2-render owns the cross-fade; it must be dither-free.
   - Saving: about 30-50 % of draws in wide views, 1-3 M triangles.
   - Risk: low, needs the pop test (below).
3. **Occlusion culling downtown.** Hi-Z from the previous frame's depth (a 1/8-res mip chain, async readback), then a
   CPU test of tile and building bounds. Portal-style "street canyon" culling is not needed.
   - Saving: 20-40 % of downtown draws at street level.
   - Risk: none (one frame of latency is hidden by a conservative bound).
4. **Shadow-cascade caching.** Done for static geometry (see above). Remaining work: the dynamic map draws every
   caster within 42 m every frame. Only moving casters should go there, plus a small radius for peds.
   - Saving: 0.5-1 ms.
   - Risk: none.
5. **Half-res AO / SSR / volumetrics with a bilateral upsample.** Measured GPU (serialized): contact AO 0.5 ms, bloom
   1.6 ms, TAA 0.2 ms, grade 0.2 ms, output 0.2 ms at 1080p on the M3 Max. SSR and shafts run only in rain or at low sun.
   On a mid GPU (about 6-8x slower) bloom and AO become 10-15 ms, so they go half-res on Medium and Low: bloom at 1/2
   for its first mip, AO half-res with a bilateral upsample.
   - Saving: about 50 % of those passes on mid GPUs.
   - Risk: none on High / Ultra (unchanged).
6. **Shader variant reduction.** 840-1,226 live programs and 2,000-2,900 materials. Find duplicate materials, per-tile
   clones and onBeforeCompile variants, then share them and key them properly (r2-probe census).
   - Saving: part of the 25 % setProgram share, 3-6 ms CPU.
   - Risk: none.
7. **Texture streaming and KTX2 / Basis.** Scene textures:
   - 419 x 1k (1.9 GB est.)
   - 48 x 2k (0.8 GB)
   - 6 x 4k+ (0.46 GB)
   - 380 x 512
   Compress in the Pages build (r2-web pipeline) with toktx / basisu, UASTC plus RDO for normals and ORM, ETC1S for
   albedo. Load through KTX2Loader (transcodes to BC7 / ASTC / ETC2). Plus a mip bias / size cap per preset, and only
   the near tiles load full-res textures.
   - Saving: 3-4.7 GB down to about 0.7-1.2 GB.
   - Risk: none at UASTC; ETC1S albedo is slightly soft, so use UASTC on hero assets.
8. **Skinned-mesh LOD and animation rate by distance.** The human LOD exists. Add: animation update at full rate
   within 15 m, 1/2 rate to 35 m, 1/4 beyond, and no skinning for the crowd impostors (`npc-crowd [inst]` is already
   instanced at 235 k triangles).
   - Saving: peds 0.5-2.3 ms.
   - Risk: none at those distances.
9. **Physics.**
   - Sleep parked cars.
   - Turn far, unseen cars into kinematic ghosts.
   - Compound static colliders per tile.
   - Run updateSceneQueries once per frame.
   - Fixed 60 Hz step with interpolation (already sub-stepped at 1/60).
   - Saving: 3-5 ms.
   - Risk: none.
10. **Tile building in Web Workers.** Mesh and collider arrays are built in a worker pool; the main thread only
    uploads, under a per-frame upload budget.
    - Saving: removes the 30-100 ms streaming spikes (city.update measured 31 ms average while catching up at the
      beach).
    - Risk: none.
11. **Fewer render targets.** Measured post RT memory is about 127 MB at 1080p. Bloom's mip chain and SMAA's
    edge / weight targets are allocated even when TAA is on, so SMAA RTs are freed while TAA owns AA.
    - Saving: memory only (about 20 MB), no ms.
    - Risk: none.
12. **Frustum-sorted draw order.** Already sorted by program and then front to back within the program
    (drawOrder.v2.js).
    - Saving: little more to gain; leave it.
13. **Dynamic resolution with TAA upscaling.** Built (`src/render/dynres.v2.js`, off). It targets 33.3 ms on mid
    machines and 16.7 ms on good ones within per-preset bounds, and quantizes to 0.05 steps with hysteresis and an
    anti-pump block. On this machine it does not help: the frame is CPU-bound and the scene GPU time hides under the
    CPU issue time. On mid GPUs (fill-bound) it is the biggest lever: 0.75 scale = 56 % of the pixels. The output-res
    TAAU (history at output resolution, the jittered input reconstructed with Catmull-Rom history and jitter-aware
    weights) is designed on r2-render's renderR2 resolve. It needs the composer split into an internal-res part (scene,
    AO, TAA input) and an output-res part (TAAU output, bloom, output, grade). It goes in after r2-render's resolve is
    verified and on.


## Tiers: preset to settings

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| frame target | 30 | 30 | 60 | 60 |
| render scale (dynres) | 0.6-0.9 | 0.7-1.0 | 0.85-1.0, only below target | 0.85-1.0, only below target |
| AA | TAA | TAA | TAA + MSAA 2x | TAA + MSAA 4x |
| shadows (static / dynamic map, radius m) | 2048 / 1024, 100 / 30 | 3072 / 1536, 120 / 36 | 4096 / 2048, 150 / 42 | 4096 / 2048, 150 / 42 |
| contact AO | off | half-res (to build) | full | full |
| bloom | half-res first mip (to build) | half-res first mip (to build) | full | full |
| SSR (wet), shafts | off | half-res (to build) | full | full |
| draw distance (camera far) | 3500 | 5000 | 8000 | 8000 |
| crowd target / ped scale | 110 / 0.6 | 170 / 0.8 | 240 / 1 | 240 / 1 |
| LOD bias (lodBias.v2.js) | 1.6 | 1.3 | 1.0 (today) | 0.85 |
| vegetation band scale (game.vegLodScale, r2-veg) | 0.6 | 0.8 | 1 | 1.15 |
| textures (after KTX2) | max 1k | max 2k | full | full |

Auto-detect (tiers.v2.js): a 3.5 s full-screen GPU benchmark behind the loading screen (16 dependent taps plus ALU per
pixel at 1920x1080, half float, readPixels-synced), compared with the M3 Max reference (REF_MS = 0.45 ms per pass,
still to calibrate on this machine). Ratio up to 1.25 -> Ultra, up to 2.6 -> High, up to 9 -> Medium, else Low. The
renderer string only breaks ties and can never lift a slow benchmark. A manual preset always wins.

## Status of what is built (all OFF by default, nothing changes the look)

- `src/render/perfHud.v2.js`: debug overlay, `?perf=1` or Shift+F3. Frame-time graph (bars colored at 17.5 / 33.4 ms,
  CPU line, GPU line where the timer works), fps / p95, CPU / render / GPU ms, preset, render scale, dynres state, fps
  cap, draws, triangles, programs, textures, geometries, bodies, top 5 systems. Inert when hidden.
- `src/render/dynres.v2.js`: the dynamic resolution controller, `?dynres=1`.
- The 2-hunk hook in `src/render/post.js` (governor / scaleFloor). r2-render carries it in their TAA commit.
- `src/render/tiers.v2.js` (`?tiers=1`, `?tier=low|mid|good|top`) and the guard in `quality.v2.js`.
- `src/render/lodBias.v2.js`: `?lodbias=1`.
- `src/render/tileCull.js`: hierarchical tile culling. Parked outside the auto-loader: rename it to `tileCull.v2.js`
  after a boot check and an A/B. The A/B is written: `node tools/v2/perf/r2-probe.mjs --tilecull`.
- Frame-rate limit option 30 (settings).
- `src/world/env/shoreFill.js`: a drop-in for ocean.js's shore land fill (r2-ground merges it). The equivalence test
  is `r2-probe.mjs --shoretest`.
- `src/render/lod/lodChain.js` + `tools/v2/perf/lodgen.mjs`: meshoptimizer index-only LOD sidecars with a hash check.
  `tools/v2/perf/lodpop.mjs` + `lodpop.html` is the pop test (LOD0 vs level at 0.5x / 1x / 2x of the switch distance,
  99.9th-percentile pixel difference, crop strips).
- `tools/v2/perf/cardprune.mjs`: leaf-card pruning with a coverage solve. Not needed now: r2-veg's LOD1s are already
  6.5-11 k triangles.
- `src/render/taau.js`: draft output-resolution TAAU for r2-render (not wired).
- Tools: `r2-prof.mjs` (profile), `r2-probe.mjs` (collider / program / movers / freeze / tile-cull / AE / body
  census), `r2-boot.mjs` (flags-on boot check), `places.mjs`, `glbio.mjs`.

## Next steps (in order; resume here)

1. **Run the queued probe** (blocked on browser slots when the budget stop came):
   `node tools/v2/perf/r2-probe.mjs --set probe1 --places spawn,beach --freeze --ae --shoretest --tilecull`.
   It gives:
   - the colliders around the player at Nico's yard (the 6-9 ms character-controller cost)
   - the program / material census with duplicate sets
   - the static-matrix A/B
   - city.update maxStep per job kind
   - the active-body census
   - instancing histograms
   - the shoreFill equivalence
   - the tile-cull A/B with an image-noise floor
   - the AE readback A/B (r2-look moved it to every 24th frame)
2. **CPU first** (the lead's order):
   - the yard collider fix (r2-physics / r2-keys)
   - material sharing and program keys (r2-art and owners, from the census)
   - static matrices outside tile batches
   - Rapier: sleep or ghost far parked cars, compound tile colliders, one updateSceneQueries per frame (r2-physics)
   - tile-build steps capped or moved to workers (lead)
   - shoreFill merged (r2-ground)
3. **Boot check with flags on**: `node tools/v2/perf/r2-boot.mjs` (and `--tier mid`). Then calibrate `REF_MS` in
   tiers.v2.js with `game.tiers.bench()` on this machine. Then switch on, in this order: perfHud (already inert), tiers,
   dynres, lodBias.
4. **GPU for mid machines**: half-res bloom first mip and AO on Medium / Low, KTX2 / Basis in the Pages build (r2-web),
   per-preset texture cap.
5. **TAAU**: after r2-render's renderR2 resolve is verified, split the composer (internal-res before TAA, output-res
   after) and wire `src/render/taau.js`. Then widen High / Ultra dynres to 0.85.
6. **LOD**:
   - lodgen sidecars where the triangles are (docks, keys props, nicoHouse parts), each passing `lodpop.mjs`
   - HLOD per far tile with baked albedo + normal
   - octahedral tree impostors with r2-render's dither-free fade
   - shadow casters from proxies
