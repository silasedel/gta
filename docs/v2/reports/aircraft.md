# Aircraft track: handoff (paused Nov 13, about 17:50 MST)

Nothing is wired into the game: there is no `air.v2.js` yet, so the track cannot affect boot. Nothing has been rendered or screenshotted; all code below is syntax-checked only (esbuild), never run in a browser.

## What exists (all under `src/vehicles/air/`)
- `contract.js`: axes, STATE object (`makeState()`), key bindings, events. `fleet.js`: 17 original types with dimensions, hard points, perf targets (airport numbers predate the smaller world).
- `kit/core.js`: lofted skins with window / door regions and frames, lifting surfaces with hinged control cutouts, procedural rivet / panel normal + ORM maps, paint materials, static merge `Builder`.
- `kit/parts.js`: wheels, gear legs, propeller and rotors with blur discs, skids, float hulls, light fixtures with flares, fittings, crew figure.
- `kit/livery.js`: invented operators and airlines, logos, registrations, fuselage / wing / fin painters, wear.
- `kit/cockpit.js`: panels with working gauges or glass PFD/MFD, controls, seats.
- `models/common.js`, `models/plane.js`: `buildLightPlane('plane_trainer' | 'seaplane', { seed, operator })`.

## Half-done / not started
- No helicopter or airliner builder, no `models/index.js`, no preview page.
- No flight model (`flight/` is empty), no tests, no game integration, no traffic, no police helicopter API, no screenshots.

## Next steps, in the lead's order
1. `preview.html` turntable; render `plane_trainer`, fix what looks wrong (expect winding / UV / proportion fixes in kit code that has never been drawn).
2. `models/heli.js` (kit already has rotors and skids), then `flight/sim.js` (plane + helicopter, assisted mode first) with Node tests.
3. `air.v2.js` via `game.vehicles.registerKind('aircraft', ...)` (see `src/vehicles/README.md`), cameras through `game.cameraOverride`.
4. Airliner builder + approach traffic read from `public/assets/world/layout.json`; `game.air.spawnPoliceHeli(target)`; seaplane floats physics.
- Operators in `kit/livery.js` should be adopted by the design system (`useDesignBrands`).
