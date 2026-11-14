# Yachts track: handoff (paused Nov 13, about 17:45 MST)

**Exists (all in `src/vehicles/yachts/`, all pass the esbuild check, nothing is loaded by the game: there is no `.v2.js` yet):**
- `kit/builder.js`: build context (merged geometry by lod / zone / material, colliders, nav graph, spots, interactables, areas, lights, ladders, movable parts).
- `kit/hull.js`: parametric hull loft (plan / sheer / keel keyframes, chine or round bilge, stem and transom rake, flush hull windows, bulwark, bow cap, deck outlines, convex pieces).
- `kit/structure.js`: deck, house (leaning walls, window bands, door openings), wall, room, door, stairs (ramp collider), ladder, rail, coaming, windscreen, hardtop.
- `kit/tex.js`, `kit/mats.js`: procedural PBR textures (teak, veneer, leather, weave, carpet, marble, nonskid...) and per-yacht palette materials, label atlas, live screen atlas.
- `kit/furnish.js`: sofa, sunpad, lounger, table, chairs, dining set, edible food, helm (wheel, throttles, live screen), galley, fridge, bar, bed, head, engine, genset, hot tub, tender, jet ski, cooler, ground tackle, nav lights, mast gear, nameplate, flag, stereo, swim platform.
- `buildYacht.js` (assembler, LOD switch), `preview.html` + `preview.js` (standalone viewer), `tests/pv.mjs` (multi-shot runner), `fleet/_kitcheck.js` (test hull, not a fleet yacht).

**Verified (screenshots looked at):** hull, teak decks, bulwark, house glazing, stairs, rails, hardtop on the test hull: `docs/v2/shots/yachts/_kitcheck_{a,b,c,d,e}.png`.
**Built, never run:** all of `kit/furnish.js` (written just before the pause; parses, not rendered once).
**Not done:** every fleet yacht (0 of 6), interiors, runtime (ship motion, doors, lights), walking aboard (planned: yacht-local Rapier world + `game.player.script` + `game.cameraOverride`), boarding, helm, crew and the three scenarios, mooring / anchoring / routes, music, game integration (`yachts.v2.js`, `registerKind('yacht')`), contact sheet, walk tests, ref_34 comparison, audio notes.

**Next steps:** 1) render a showcase of `furnish.js` and fix it; 2) write six yacht defs in `fleet/` (40 express, 55 sport, 62 sportfish, 75 flybridge, 90 explorer, 125 tri-deck) following the spec; 3) `runtime.js` + `onboard.js`; 4) crew scenarios; 5) `yachts.v2.js`.
The full design spec (frames, ctx API, material keys, `ctx.meta` contract, runtime interfaces) is in the session scratchpad as `YACHTS_SPEC.md`; copy it into the repo if the scratchpad is gone (the kit files carry the same API in their doc comments).
Needs from the lead: nothing yet. No helper agents were started (the concurrency limit refused them).
