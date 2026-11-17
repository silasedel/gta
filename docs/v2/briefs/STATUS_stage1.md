# Stage 1 status (world foundation)

Branch `stage-1`. Test tools (all muted, headless, 1920x1080, real gameplay start via `startGame`):
- `node tools/v2/s1-tour.mjs --set <name> [--spots file.json]`: screenshots + frame timing per spot -> `docs/v2/shots/stage1/`, `docs/v2/reports/stage1-<name>.json`
- `node tools/v2/s1-prof.mjs`: CPU per system (EMA) via `game.perf.sysAvg`
- `node tools/v2/s1-ab.mjs --cases file.json`: A/B frame time of in-page toggles
- `python3 tools/v2/montage.py out.png a.png b.png ...`: review sheets
Test machine: Apple M3 Max (40-core GPU) under heavy background load (OBS, other apps), Chrome headless with Metal.

## Job 1: rendering and look — pipeline done; final verification after the map rebuild (job 3)
Done:
- Film grain removed from gameplay (`gradeShader.js` uGrain 0); a static +-0.5/255 dither stops sky banding (invisible).
- Every screen-space dither now changes each frame so TAA averages it (`src/render/frameNoise.js`): vegetation LOD
  cross-fades, crowd fades, Nico's hair. Shadow passes keep a static pattern (no crawling shadows).
- Nico's shell hair: strand LOD when strands are under ~2 px (was the "sand grain in hair").
- TAA on in every preset; sharpening lowered (0.6 -> 0.3) so edges are no longer crunchy.
- Locked 1080p-class internal resolution in every preset (Retina "native" rendered ~3x the pixels).
- Specular anti-aliasing for all standard/physical materials (`src/render/specularAA.js`, imported first in main.js).
- Night skyline: distant towers no longer glow solid white (window clusters capped, far average glow).
- Camera: on foot 2.85 m (was 3.8), shoulder offset 0.55, sprint 3.4; car 5.7 m (was 6.8). Character fills ~45% of
  frame height like GTA 6 footage.
- Detail culling (`src/render/detailCull.v2.js`): sub-1.6 px objects skipped; small/far objects skip the shadow pass.
- Profiling hooks: `game.perf.sysAvg`, `workAvg`, `gapAvg`; anonymous updaters labeled by index.

Measured (headless, loaded machine):
| Place | Before | Now | Notes |
|---|---|---|---|
| Spawn (Nico's yard) | 13-17 fps | 40-45 fps | CPU-bound: ~20 ms JS/frame (draw submission ~7-9 ms, city streaming ~4 ms, vehicles ~2-3 ms) |
| Downtown street | 34 fps | 57-60 fps | |
| Bay (aerial) | 6 fps | 60 fps | |
Half resolution did not help at spawn: the frame is CPU-bound, not GPU-bound. Main draw-call sources at spawn: city
tiles ~194, Nico's house set piece ~179, countryside ~72, a docked boat ~100, Nico 43.

Open (carried into job 3 where the world is rebuilt):
- 60 fps at spawn needs fewer draw calls: new map built instanced/merged from the start; set pieces stay as they are.
- Ground textures are high-contrast and read as grain at grazing light: replace with CC0 PBR textures (requested).
- Shoreline: new land mesh dips below sea level at every shore (no coplanar land/water).
- Coplanar road layers (road 0.05 / junction 0.055 / markings 0.065 m) cause far z-fighting: new road system uses
  merged junction meshes and polygon-offset decals. Reversed-Z was considered and deferred (shadow + 4 depth readers).

## Job 2: day/night and weather — DONE (test sheet: `docs/v2/shots/stage1/JOB2_weather_sheet.png`, fog `job2b_fog.png`)
- Fixed 48-minute day (GTA V length) in both clocks (`main.js` DAY_MINUTES, `systems/time.js` dayMinutes).
- `src/world/env/weather.v2.js` (game.weather): clear, partly, overcast, rain, storm (thunder + lightning), fog; weighted
  random by part of day (fog mornings, storms afternoons), 90 s transitions, few-hour durations; `set(kind,{instant})`,
  `hold()`, `next()`, `forecast`, `?weather=storm` URL override; events `weather`, `lightning`.
- Sky: overcast deck layer + lightning flash in `skyShader.js`; sun dims under cloud (shadows fade), gray soft fill,
  denser gray fog, exposure compensation; overcast nights glow orange with city light.
- Rain: 9000 camera-wrapped streaks in one draw call, wind-slanted; synthesized rain bed + delayed thunder on the
  ambience bus (`audio.ambienceBus`), muffled in cars and indoors.
- Wet surfaces for every standard/physical material (`src/render/wetSurfaces.js`): darker, glossier hard surfaces,
  puddles with rain ripples on flat ground; grass and leaves only darken. Opt out with `material.defines.NO_WET`.
- Wet-ground screen-space reflections (post pass, only while wet): lights and buildings mirror in wet streets.
- Wind: existing `game.wind` already strengthens with game.weather rain/storm (palms and grass sway more).
- fps at the test street: 58-60 in every weather.
## Job 3: map rebuild and trace — core DONE, polish in progress
- New map traced from `map_roads_target.webp` at 11 m/px (island ~9.8 x 14.5 km, about 7x smaller): `tools/v2/map3/`.
  442 km of roads (3381 edges), 337 bridges, 11k buildings, land/water/beach/forest/swamp from the colour map, real
  South Florida district names, Miami-style numbered streets downtown, named highways (Overseas Highway US-1 ...).
- Runtime data built by `tools/osm/merge.py` in a new no-OSM mode (`MIAMI_NO_OSM=1`): no real-Miami data any more.
- **Overlay test PASS:** recall 97.2 %, precision 98.4 % within 16 m (`docs/v2/shots/stage1/JOB3_overlay.png`).
- Nico's house on a waterfront lot in Key Largo (Pelican Point Ln); the player spawns in the yard.
- Title shots, intros, police stations moved to the new map; downtown/business/nightlife/port zones from districts.
- Open: the user is providing a detailed Key Largo image (highway + dirt roads, new house spot) -> retrace that area;
  5-minute drive test (`tools/v2/drive-test.mjs`) after the road / building passes land.

## Job 4: road system — in progress
- Rule-based controls: 1044 signalized junctions, 1109 stop approaches; AI traffic stops at reds (41 red approaches,
  0 runs in a 70 s downtown sample) and stop signs. STOP and SPEED LIMIT (mph) signs from the graph (instanced).
- Helper pass running: merged junction polygons, curb returns, crosswalks per approach, markings, textures.
- Next: traffic lights / lamps / signs from the user's models (after the road pass).

## Job 5: buildings and dressing — in progress (helper passes: buildings, greenery)
## Job 6: HUD — DONE
- Corner HUD rebuilt to match `docs/v2/plan/hud_corner_target.webp` (`src/ui/hud/corner.js/.css`): six stars in one row
  (earned charcoal), five evidence badges, "20 73" ammo, pistol art, cash/bank/clock. Reads `game.wanted.level` and
  flashes while `game.wanted.evading`; `game.hud.setWantedFlash()`, `game.hud.setKnown()`.
- Old "SOUTHLINE / CALORA / CLICK TO PLAY" card removed (`game.hud.startPlay()`); volleyball players removed.
- All leftover "Port Solana" / "Calora" names renamed to Southline.
- Test: `node tools/v2/hud-shots.mjs`; sheet `docs/v2/shots/stage1/hud_compare.png`.
## Job 7: CONVENTIONS.md — first version written (`docs/v2/CONVENTIONS.md`)

## Performance work so far
Merged bridge decks per tile (-170 draw calls in the Keys), unstuck check at 5 Hz (-2 ms), AI full-physics radius
95 m, dynamic shadow map at half rate, detail culling. Steady state (loaded M3 Max): spawn ~30 fps, Downtown ~47,
Clewiston ~41, Miami Beach ~52. Still CPU/draw-call bound at the Keys spawn (set pieces: Nico's house ~180 calls,
neighbor houses ~140, NPC characters are expensive: ~80 us per draw).

## Notes for the user / next stages
- This account is on the Ultra plan; weekly usage was 0% after the first hours.
- Model requests: `docs/v2/briefs/MODEL_REQUESTS_stage1.md` (P1: CC0 textures and ~30 buildings).
