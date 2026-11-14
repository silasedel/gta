# hero-cars: report (stopped early at the lead's 6:30 PM budget stop, Nov 13)

## What exists
One of the five cars is built to exterior quality: **Vireo Fulmine V10** (`hero_red_v10`, the red V10-style supercar). The other four are **not built** (their package data, names, handling and engine data exist; they have no body).

### The pipeline (reusable for the other four; this is where most of the time went)
- `src/vehicles/hero/kit/surf.js`: bodies are C2-continuous bicubic B-spline skins made from designer-style master curves (plan outline, shoulder line, beltline, roof rail, centerline profile), closed at nose and tail without poles. Normals come from the surface itself, so highlights are clean at any tessellation.
- `kit/trim.js`: the skin is cut along curves drawn in side / top / front views or along its own feature lines. Cuts are solved on the true surface. Panels get real V-groove shut lines (no decals, no z-fighting); openings return their rim, from which ducts, wheel-arch lips and lamp buckets are extruded.
- `kit/cardef.js` + `kit/body.js`: a car is a parameter sheet (`cars/fulmine.js`, about 70 lines of numbers).
- `kit/mats.js`: clearcoat paint with flake (candy, pearl, satin, metallic), 2x2 twill carbon, tinted glass, leather, alcantara, metals, honeycomb mesh; all textures generated in code.
- `wheels.js`: five rim designs, tires with grooves and raised sidewall lettering (GARRANO, our tire brand), drilled carbon-ceramic discs, calipers with marque lettering, three LODs. Only the Fulmine set was looked at.
- `details.js`: projector lamps, DRL blades, LED tail cells, indicators, reverse lamp, side markers, emblem and wordmark decals, Calora plate (seeded), wipers, mirrors, exhaust tips, diffuser fins, lip spoiler, door handles, and a simple cabin (seats, dash, wheel, console) seen through the glass.
- `preview.html` (studio / sky / night, views, lights toggle), `tools/shots.mjs` (batch screenshots in one browser session).

### Fulmine numbers
| | Fulmine | Typical class figure (V10 mid-engine supercar) |
|---|---|---|
| Length / width / height | 4.53 / 1.94 (body 1.95) / 1.165 m | about 4.52 / 1.93 / 1.165 m |
| Wheelbase, ratio | 2.62 m, 0.578 | about 2.62 m, 0.58 |
| Overhang front / rear | 1.07 / 0.84 m | about 1.05 / 0.85 m |
| Tires | 245/30 R20, 305/30 R20 | same class |
| Windshield rake | about 28 degrees | 24 to 28 degrees |
Measured bounding box from the page: x ±1.002 (mirrors), y 0 to 1.164, z −2.162 to 2.379.

Triangles (body skin only): LOD0 84,602, LOD1 15,540, LOD2 3,468. Wheels (from the code, not measured per LOD in this session). Whole car in the studio: 138 draw calls at LOD0 (too many; the per-panel/per-material split needs merging for traffic use). First build 370 ms (cached afterwards); it should be prebuilt during loading.

## Evidence
Looked at, in `docs/v2/shots/hero-cars/`: `kit_materials.png`, `r1_fulmine_*`, `r3_fulmine_front34.jpg`, `r3_fulmine_rear34.jpg`, `fulmine_side.jpg`, `fulmine_night_rear34.jpg`, `final_fulmine_front34.jpg`, `final3_fulmine_cam0.jpg` (last state, close front 3/4 in daylight).
Taken but not looked at: `fulmine_top.jpg`, `fulmine_night_front34.jpg`, `final3_fulmine_rear34.jpg`, `final3_fulmine_side.jpg`.
In the real game (dev server, `tools/v2/shot.mjs --game`): the game reached `game.ready` with `game.v2.failed` empty, `hero_red_v10` was registered through `vehicles.js`, `game.vehicles.spawn('hero_red_v10', ...)` returned an external-model car with 4 wheel nodes and a hull, and under full throttle it moved 15.3 m and reached 56 km/h in 2.5 s. **Not seen in the game**: the screenshot (`game_spawn.jpg`) is covered by a Vite error overlay from another track (`src/design/products/index.js` cannot resolve `./data.js`), so the in-game look, lights and wheel placement on the suspension are unverified.

Defects still visible in the last studio shot: the headlamp lens has a ragged lower outer edge; two tiny dark notches where the hood shut line meets the fender line; the front intake mesh is sparse; the nose is rounder than a true wedge.

## Honest gaps on the Fulmine
- Doors, hood and engine cover are separate panels with shut lines but have **no pivots or opening animation**; no door jambs or panel thickness.
- **No engine bay, no frunk.** The engine cover is glass with only the cabin bulkhead behind it.
- Cabin is a simple one (sculpted seats, dash, binnacle, screens as black glass, wheel, console). **No live cluster**, no pedals, no door cards beyond a slab, no stitching detail. Not first-person ready.
- Nose is still a little soft and tall for a wedge; headlamp internals are basic; front intakes show mesh but no radiators; taillights are thin.
- LOD1/LOD2 were never viewed. Damage: panels and glass are separate meshes and a convex hull is provided, but nothing was tested with vehicles-core's damage code.
- Design-system: marques Vireo / Vauclair / Merrow and tire brand Garrano are defined locally in `packages.js`; they should be adopted into `src/design/brands`.

## Registration
`src/vehicles/hero/index.js` exports `heroCatalog` (all five, with `built: true|false`), `buildHeroCar(THREE, key, opts)` and `models = [{ entry, builder }]` (built cars only: the Fulmine). `vehicles.js` already imports `./hero/index.js` and registers `models`; `hero.v2.js` does the same as a fallback and exposes `game.heroCars`. Spawn: `game.vehicles.spawn('hero_red_v10', pos, heading, { snap: false })`.
The brake calipers are returned as `wheels[i].caliper` (a child of the wheel node that `update()` counter-rotates); cleaner would be for vehicles-core to parent `caliper` to the steer group.

## Engine character notes for the audio track (all five, in `heroCatalog[key].sound.character`)
- Colosso: twin-turbo hot-V V8, deep burble, turbo whoosh, heavy bass.
- Fulmine V10: naturally aspirated 5.2 V10, metallic bark rising to a shriek at 8,700 rpm, crackles on overrun.
- Saetta V12 Ombra: naturally aspirated 6.5 V12 howl to 8,900 rpm, loud pops, a kick on each shift.
- Minuit: quad-turbo sixteen-cylinder, low thunder with sub-bass, four-turbo whoosh and whine.
- Peregrine: flat-plane twin-turbo V8, hard buzzy note, spool and flutter, 8,500 rpm.

## To finish the track
Four more parameter sheets (SUV, V12, GT hypercar, British mid-engine), each needing several look-and-fix rounds; door pivots and jambs; engine bays; real cockpits with live clusters; draw-call merging; LOD checks; a look at every wheel design.
