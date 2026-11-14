# Boats track report (stopped early at the 6:30 PM budget stop, Nov 13)

## What is in the game now
- `src/vehicles/boats.js` is still the v1 system (moorings, nav grid, police chase, dock guard), with three changes:
  1. **Steering rebuilt** as a yaw-rate servo: tight pivot at docking speed, lateral-g limit at speed (speed-sensitive),
     fast response, banked lean into the turn. Measured in `src/vehicles/boats/sim.html` (same harness before and after).
  2. The v1 types `console`, `skiff`, `cruiser`, `racer` now get a **rebuilt, seeded center console** (26, 21, 34, 42 ft),
     built a few ms per frame and swapped in. The v1 jet ski and police boat are unchanged.
  3. New wake ribbons, spray, telltale and bilge streams (`boats/wakefx.js`), and audio fields.
- Steering, center console (v1 `console` -> cc26), full rudder; yaw rate deg/s (turn radius m), before -> after:

| Entry speed | Before | After |
|---|---|---|
| docking (35% throttle from rest), circle | 58 m, 90 deg in 6.4 s | 16 m, 90 deg in 2.5 s |
| 15% of top speed | 8.8 (23 m) | 26.6 (3.8 m) |
| 60% of top speed | 18.2 (28 m) | 41.6 (7 m, speed scrubs to 19 km/h) |
| top speed | 18.3 (52 m), bank 1.9 deg | 30.4 (28 m), bank 14 deg |

  Jet ski: docking circle 37 -> 12 m, bank 13 -> 30 deg. Full tables: `docs/v2/shots/boats/steering_before.json`, `steering_after.json`.

## The kit (src/vehicles/boats/)
`kit.js` (buckets, 32-slot per-boat palette, primitives, lofts, movable parts, time-sliced flush), `hull.js` (parametric hull:
V, flat, round bilge; skin, decks, liners, caps, rub rail, transom notch), `parts.js` (outboard with cowl graphics, console
with chartplotter and gauges, wheel, throttles, seats, T-top, bimini, rails, cleats, rods, coolers, fenders, lights ...),
`materials.js` (procedural non-skid, vinyl grain, weave, gelcoat, teak, brushed metal), `identity.js` + `names.js` + `brands.js`
(seeded colors, wear, unique names, hailing ports, registrations, invented builders and engine makers), `livery.js` (hull
livery, decal atlas with logo emblem, capacity plate, warning labels, cowl graphics; screen atlas), `catalog.js` (model
contract, `buildBoat`), `models/cc.js`. Preview: `src/vehicles/boats/preview.html?keys=cc26&view=sternq`.
`MODEL_BRIEF.txt` is a ready brief for agents building the remaining categories on this kit.

## Notes for the audio track
Each boat (`game.vehicles.boats[i]`) exposes, every frame: `rpm` (0..model.maxRpm), `throttle`, `load` (0..1), `planing` (0..1),
`slam` (0..1, set on a hard re-entry, decays in ~0.4 s), `speedKmh`, `engineOn`, `lean`, and `model.sound = { engine, cylinders,
count }` (`count` = number of outboards: layer one voice per engine, slightly detuned). Event: `boatSlam { vehicle, strength }`.
Suggested voices: four-stroke outboard (idle burble with telltale splash, hollow mid-range, hard intake roar on plane; prop
ventilation whine when `load` is high and speed is low), jet ski (high two-tone whine, pitch drops when the pump unloads in the
air: `planing` 1 and `slam` about to fire), hull: slap at rest, hiss proportional to `planing`, thud scaled by `slam`.

## Not done / known problems
- Fleet: only the four center consoles are rebuilt. Skiff, jon, bay, bowrider, deck, pontoon, offshore, cabin, sport-fisher,
  sailboats, work boats, police, fireboat, tug, airboat, jet skis, kayaks, paddleboards and dinghies are not started. The v1
  `skiff`, `cruiser` and `racer` types are now center consoles, so the v1 speedboat no longer appears.
- Water shows inside the cockpit when the boat planes or banks (the ocean draws first and the sole is only 12 cm above the
  waterline). Fix: a stencil mask over each cockpit that the ocean material respects (needs the environment track).
- Hard turns scrub a lot of speed; not tuned further. Stuck test against docks and parked boats was not re-run after the
  steering change (dock guard code is unchanged). Per-type physics, sinking, boarding animations (`game.player.script`),
  passengers, AI traffic, placement, static marina variants and the ref_23 comparison are not started.
- Triangles: 46k to 66k per boat (budget was 45k); first build of a model costs ~170 ms spread over frames, later ones ~30 ms.
- Brand names are invented but not trademark-checked; they live in `boats/brands.js` until the design system takes them.
