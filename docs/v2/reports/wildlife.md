# Wildlife track: handoff (paused Nov 13, about 17:50 MST)

All code is in `src/world/wildlife/`. Nothing is loaded by the game yet (the module is parked as `wildlife.v2.js.off`).

- **Works, verified in previews:** the creature kit `kit/` (`tex.js` skin painter with albedo/normal/roughness, `loft.js` lofted bodies, `rig.js` skeleton/skinning/IK/gaits, `mat.js` instanced swim/flap/sway shaders, `brain.js` movement and threat helpers, `stage.js` preview stage with a fake world; contract in the header of `kit/index.js`), `registry.js`, `preview_species.html`, `preview_habitat.html`.
- **Green iguana** (`species/land/green_iguana.js`, the reference species): model, 3 color morphs, 7 states, behavior (bask, head-bob, flee to water, road crossing with car avoidance, cold-morning drop). Checked in previews only (`docs/v2/shots/wildlife/_wip_iguana_*.png`); not seen in the full game.
- **Half-done, parses, never run:** `species/birds/_bird.js` (parametric bird + flock/wire/plunge-dive brain; no species file uses it yet) and `wildlife.v2.js.off` (world adapter over the city API, habitat classification, budgeted spawner, fixed reef cells, `game.wildlife.perchLine/addPerch/spawn/signal`).
- **Not started:** every other animal, fish schools, the rare shark, reef dressing, caves/wrecks/finds, fishing, the pet dog, audio notes, reference comparisons, frame times.

Next, in the lead's order:
1. Add `species/birds/brown_pelican.js`, `laughing_gull.js`, `wire_birds.js` on `makeBird` + `flockActor`; fix what the first sheet screenshot shows (wing fold and leg angles are untested guesses).
2. Rename `wildlife.v2.js.off` back to `.v2.js`, boot the game, confirm iguanas and birds spawn (`game.wildlife.stats`), then alligator (copy the iguana structure), dolphin, manatee, sea turtle, shark, fish schools (`M.swimMaterial` + InstancedMesh).
3. Reef patch as a species def with `fixed(habitat, depth, district) -> chance` (the spawner already handles it), then dog (`dog/dog.js` exporting `createDog`) and fishing (`fishing/fishing.js` exporting `createFishing`); both are auto-loaded by the v2 module when present.

Notes: no layout.json existed yet, so regions outside real Miami are hard-coded rectangles in `REGIONS`. Sub-agents could not be launched (concurrency limit); the shared brief is in the scratchpad as `wildlife_brief.txt`. Player damage goes through `game.emit('hit', { target: 'player', ... })`.
