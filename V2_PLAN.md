# Port Solana V2: build plan

`BIG_UPDATE.md` is the spec and the checklist. `CONTRACT5.md` is the rulebook every agent follows. This file is the phasing: who builds what, in which wave, and how it gets verified.

- **Branch:** `v2` only. v1 (`main`, the live site, port 5173, `../V1`) is never touched.
- **Dev server:** http://127.0.0.1:5200 (V2 only). **Live tracker:** http://127.0.0.1:5200/docs/v2/tracker.html
- **Version:** `2.0.0-dev` until every gate below passes, then `2.0.0`.
- **Rule:** nothing is called done until it is verified with screenshots and automated tests, and compared with the references (BIG_UPDATE 0a1c). Progress percentages count verified items only.

## Schedule and budget (user, Nov 13, 5:45 PM; replaces the earlier schedule)
- **Deadline:** 11:00 AM MST on Nov 14.
- **Usage is the real limit.** Weekly usage was 49% (all models) and 42% (Fable) at 5:34 PM, and 20 Fable agents were burning roughly a point every one to two minutes. The user is not buying more. Target: stop at about 82%.
- **So v2.0.0 is sized to the budget.** Detail, graphics and texture quality never drop; the amount of content does.

| Phase | Tracks | Model |
|---|---|---|
| Now, until 6:30 PM | world-osm (merge), world-layout (the map), city-look (textures, facades), design-system (brands, logos, products), interiors-engine, nico-house, keys-sign, hero-cars, boats, character | Fable 5.2 (the work that needs it most) |
| Next, from partial work and handoff notes | vehicles-core (no repeating car, driver personalities), npc-ai (no repeating person, personalities), police (evidence HUD), ui-frontend (map, menu), core-systems (save, clock), nav-gps, wildlife (gators, pelicans, dolphins), world render of the new regions, a first set of store types, then integration, inspection and release | Opus 5.5, few agents at a time, usage checked between batches |
| After the weekly reset (Nov 18, 7 PM MST) → v2.1 | aircraft, yachts, combat overhaul, story campaign and jobs, audio overhaul, weather and water overhaul, multiplayer, desktop app, WebGPU renderer, per-district passes, heists/businesses/events | to be decided with the user |

Paused tracks left handoff notes in `docs/v2/reports/<track>.md` and code that parses but is mostly not wired into the game.

## How the work is split
Every track is one agent with its own files, its own preview pages, its own progress file (`docs/v2/progress/<track>.json`) and its own report (`docs/v2/reports/<track>.md`). The lead owns `src/main.js`, wiring, commits and releases. New systems plug in as `*.v2.js` modules, so tracks do not collide.

## Wave 1: foundations (all in parallel)
| Track | Owns | Delivers (BIG_UPDATE sections) |
|---|---|---|
| `world-osm` | `tools/osm/*`, `public/assets/miami/*`, `src/world/miami/data.js`, `dataProvider.js` | Fresh OSM pull for the bigger real Miami (west, north, south), real shop/amenity types at real addresses, merge of the synthetic regions into one tile set, road graph and map layers (1b, 1c, 2) |
| `world-layout` | `tools/world/*`, `public/assets/world/*` | Our own condensed-Florida landmass: coast, lake, park hills, wetlands, Everglades, Keys chain, airport, towns, suburbs, highway loop, place names. Top-priority set piece #1: the map (1c) |
| `city-look` | `src/world/miami/{tilebuild,materials,facades,geom,grass,port,seabed,city,stream}.js`, `src/world/city/*`, `public/assets/city/*` | Every surface PBR-textured, no two neighboring buildings alike, district-true facades, street furniture retextured; later renders the new region kinds (1, 7, standard 4) |
| `design-system` | `src/design/*`, `public/assets/design/*` | Invented brand families with logos, palettes, packaging and signage; shared PBR material library; product catalog with models, prices and nutrition (0, 0a) |
| `interiors-engine` | `src/world/interiors/*`, `src/world/interiors.js` | New interior engine: real floor plans, lighting, working clocks, openable storage, physical items you grab and steal with hand IK, staff and customer behavior framework (0a, 0a1b, 1) |
| `nico-house` | `src/world/setpieces/nicoHouse/*` | Top-priority set piece #2: the weathered Keys stilt house, exterior and lived-in interior, dock, skiff, yard (1c) |
| `keys-sign` | `src/world/setpieces/keysSign/*`, `src/world/signs/*` | Top-priority set piece #3: the hand-painted Keys welcome sign; plus the US-style green highway sign system with real Miami road names (1c) |
| `hero-cars` | `src/vehicles/hero/*` | The four hero cars and the orange supercar: original premium designs, cockpits, doors, lights (4b) |
| `vehicles-core` | `src/vehicles/{vehicles,carModel,catalog,damage,skids,roadnet,bodyLoft}.js`, `src/vehicles/traffic/*` | No repeating car, mechanical damage, fuel/tires/upkeep, wet driving, driver personalities, traffic lights and rules, service routes (4, 0d, standard 2 and 3) |
| `boats` | `src/vehicles/boats.js`, `src/vehicles/boats/*`, `src/world/miami/boats.js` | Every boat distinct and rebuilt, steering and hull physics, boarding animations, jet skis, police boats (4, 4b) |
| `yachts` | `src/vehicles/yachts/*` | Boardable multi-deck yachts (40 to 120 ft), every one distinct, helm, hot tub, scenario reactions (4b) |
| `aircraft` | `src/vehicles/air/*` | Flyable helicopter, small plane and seaplane, airliner traffic on approach paths, blimp (0b 24, 1c) |
| `character` | `src/player/*` (not `controller/`) | Nico: face, hair, body, skin and cloth shading, animations, the signature tropical shirt, full wardrobe system (8, 8a) |
| `npc-ai` | `src/npc/*` | No repeating NPC, personalities, daily routines, reactions, talking and dialogue wheel, memory, named locals (3, 0c, 0d, standard 2 and 3) |
| `police` | `src/gameplay/{police,evidence*,wanted*}.js`, `src/ui/evidenceHud.*` | Six-star wanted rebuilt on a knowledge model, evidence HUD, escalating response, traffic stops, bribes, bounty hunters (0a2, 0b 9–11, 5, 0e) |
| `combat` | `src/gameplay/{weapons,gunModels,gunfx,hitbox,cover*,melee*}.js` | Cover system, aiming, weapon upgrades, melee combos and takedowns, destructible props, ragdoll reactions (0b 27–30) |
| `nav-gps` | `src/nav/*`, `src/ui/gps.js` | Real fastest-route GPS with turn costs, rules, live traffic, walking mode, turn-by-turn (2) |
| `ui-frontend` | `src/ui/*` (except `gps.js`, `evidenceHud.*`) | Cinematic main menu, rebuilt pause map, settings, phone, HUD polish (8a, 2, 0b 22) |
| `core-systems` | `src/systems/*` | Save and resume, clock (9 AM start, day-length option), items, food and nutrition, needs, body change, cash vs. bank, property (0a, 0b, 0d, 7, 8) |
| `audio` | `src/core/audio.js`, `src/audio/*`, `public/assets/audio/*` | Per-model engine sounds, boat audio, deep layered crashes, district ambience, original radio with DJs and ads (4b, 7, 0b 31) |
| `environment` | `src/world/environment.js`, `src/world/env/*`, `src/world/water/*`, `src/render/*`, `src/fx/*` | Weather, storms, fog, tides and waves, moon and stars, underwater, hurricane, lighting and post (6, 7, 8b) |
| `wildlife` | `src/world/wildlife/*` | Pelicans, gulls, iguanas, gators, manatees, dolphins, turtles, rays, fish schools, the rare shark, the pet dog (3, 6, 0d, 0e) |
| `story-jobs` | `src/story/*`, `src/jobs/*` | Mission framework, 15–25 story missions with cutscenes, side jobs, races, random events (0b 1–5) |
| `multiplayer` | `server/*`, `src/net/*` | Authoritative Node server, client prediction and interpolation, interest management, multi-client tests (8c) |
| `desktop` | `desktop/*` | Electron app for Mac and Windows with the high-performance GPU (8b) |

## Wave 2: content at the detail standard (starts as wave 1 tracks land)
- **World render:** `city-look` renders the merged world: wetlands, farmland, forest and hills (heightfield terrain), runways, long overseas bridges, far LOD with no pop-in.
- **Store and building category agents** (each builds a variation generator plus 5–10 hand-made standouts, on the interiors engine and design system): gas stations, convenience stores, supermarkets, pharmacies, restaurants (several cuisines), cafes and walk-up windows, bars, nightclubs, hotels (lobby, rooms, rooftop pools), apartments (luxury / mid / run-down, Tier D homes), offices, banks, shoe stores (sneaker boutique, mall athletic, luxury salon, family discount), fashion boutiques, phone and electronics, barbers, tattoo, gyms, clothing, gun stores, laundromats, churches, schools, hospitals, police and fire stations, warehouses, marinas and docks, car dealers, garages and car washes, airport terminals.
- **Area agents** (one per district or island): South Beach, Mid-Beach, the bay islands, PortMiami, Downtown, Brickell, Little Havana, Overtown, Wynwood, Edgewater, the airport, south suburbs, the Everglades, Key Paloma, the middle Keys, Tern Key, north suburbs, Lake Amaro, Citrus Flats, Sawpalm Ridge, Port Cassia. Placement, Tier D street life, lore, named locals.
- **Systems, second pass:** heists (scouting, crews, disguises, alarms, vaults, getaways), businesses you run, stocks and betting, gangs and territories, events, hurricane, mini-games, transit (people-mover, buses, trolleys), rideshare, valet, drive-thrus, e-scooters, parkour, security checkpoints, news and social media.
- **Renderer:** WebGPU path with WebGL2 fallback, cascaded shadows, SSR, volumetrics, quality presets, worker tile building (8b, 9).

## Wave 3: inspection and fixes (repeat until clean)
- Inspection agents walk into every building type and every district, screenshot it, and score it against the bar; failures go back to the owning track.
- Automated playthroughs of every mission and job; hitbox, door, stair and stuck-spot sweeps; multi-client multiplayer tests with latency.
- Reference comparisons: matching in-game shots next to each image in `references/` (kept in `docs/v2/compare/`, not published).

## Wave 4: release gates for v2.0.0
1. Every BIG_UPDATE item is at its stated level and marked verified, or is listed plainly as short of the bar.
2. Production build: 60 fps, no frame over 25 ms after loading, no console errors, GPU memory levels off.
3. All v1 tests re-run: soak, drive, ram, road audit, swim/boat, click, sub-path.
4. `CHANGELOG.md` entry, version `2.0.0`, push to `origin v2` only. No merge to `main` and no deploy until the user says so.

## Needs the user (cannot be done by Claude)
- **Multiplayer hosting:** the user creates and owns the hosting account (Fly.io, Render or Railway). Until then multiplayer runs and is tested locally.
- **Desktop app signing/notarization** for a downloadable Mac build, and publishing GitHub Releases.
- **Merging `v2` into `main` and deploying** to the live site.

## Shared APIs added in V2 (lead keeps this list current)
- `game.ready`, `game.v2 = { loaded, failed }`, `game.teleport(x, y|null, z, heading)`
- More are added here as tracks report them.
- **Scripted player control:** set `game.player.script = { lock: true, fixed(dt) {…}, pose(dt, character) {…}, anim: {…} }` to take over the player (sitting, climbing, boarding, cutscenes); move with `game.movePlayerTo(x, yFeet, z)` and set `game.player.heading`. Set it back to `null` to return control. While set, main.js skips its own locomotion; `anim` replaces the animation state passed to `character.update`.
- `game.cameraOverride = (dt, camera) => true` takes over the camera for that frame (menus, cutscenes, interiors). Set to `null` to release.
- `game.playerCharacter` (read), `game.setPlayerCharacter(c)` swaps the player's visual model.
- **Clock:** a new game starts at 9 AM. `game.settings.dayMinutes` (default 144) sets the day length. A clock module may set `game.timeExternal = true` and drive `game.timeOfDay` itself (day counter, sleeping, time skips).
