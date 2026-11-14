# npc-life report (Nov 13, about 20:40 MST)

## Built (code runs; booted once in game with `game.people.life` present and no failed V2 modules)
- `src/npc/streetlife.js` (new): walk signals, crowd spots, frame-budget governor.
  - Walk signals use the same fixed-time plan, edge order and node offset as `src/vehicles/roadnet.js`. They call `game.traffic.signalAt` first if a module ever provides it.
  - Crowd spots: bench seats, cafe chairs at the tables `tilebuild.js` places, groups in front of shops, and shop doors.
  - The governor scales the crowd between 0.35 and 1.0 from `game.perf.frameMs`. It shrinks quickly when frames run long and grows back slowly.
- `src/npc/people.v2.js` (crowd tier):
  - Target raised to 300, scaled by street density, district weight and the governor.
  - Routines come from each person's schedule activity (`mind.js activityAt`): diners at lunch and dinner, bench sitters, talking groups (dancing at night), people walking out of and into shops, and joggers.
  - Signal waits at corners.
  - Gunfire on the `shot` event: run away along the sidewalk, cower, or call.
  - Avoidance uses a fixed-array spatial grid.
  - Rain: no new sitters or groups, and walkers hurry.
  - API: `game.people.life` with `stats()`, `governor()`, `panic(x, z, r)` and `walkState(node, dx, dz)`.
- `src/npc/peds.js` (near tier):
  - `navStep` records the corner node when a crossing starts.
  - Walkers wait for the walk phase there; bold jaywalkers sometimes go anyway.
  - This replaces nothing from playtest-fixes: their gait, fade and density edits are kept.

## Not verified
The game stopped booting on the shared server (`SyntaxError: Unexpected token 'else'` at `src/render/post.js:267`, edited 20:33 by another track). Because of that, no shots, frame times or 1% lows exist yet. The test is ready: `node src/npc/tests/life_game.mjs`. It covers 5 places by day and night, behavior counters, a 3-frame panic sequence and 300-frame timing, and writes `docs/v2/shots/npc-life/life_results.json`. Machine load was 11-39 during this session, so any fps number from today would be unreliable anyway.

## Not done
- Crowd-tier props (bikes, skateboards, umbrellas, dogs), near-miss jump back, bus boarding and vendors.
- The ref_51 quality pass (skin, hair, cloth), car occupants and bridge cyclists.
- CC0 mocap: near-tier clips still come from Mixamo via `src/player/characterModel.js`, which is not this track's file. Mixamo is not CC0 or CC-BY.
