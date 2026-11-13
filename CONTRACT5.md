# V2 contract (read `BIG_UPDATE.md` in full first, then this; CONTRACT.md → CONTRACT4.md describe the v1 codebase)

V2 is the full overhaul in `BIG_UPDATE.md`. That file is the spec and the checklist. This file is how many agents build it at the same time without breaking each other. The lead owns this file; ask the lead (in your report) if you need it changed.

## The user's standard (their words, Nov 13)
No deadline, no budget limit, no shortcuts, no placeholders, no "good enough". What they care about most:
1. **Stores and shops:** across the whole map, not a single one falls short of real quality. Each has its own specific, recognizable, detailed items; its own staff and customer behavior; its own distinct style, heavily different from every other store; tons of detail inside and out. Every corner of the map, not just main streets.
2. **Nothing repeats:** no repeating boat (every yacht and boat distinct, at full quality), no repeating car, no repeating NPC.
3. **Everyone acts smart:** NPCs have real personalities and behave differently from each other. Traffic drivers too: careful, aggressive, distracted, lost, in a hurry.
4. **Every surface is textured:** smooth and shiny, or rough and bumpy, but real. No flat, untextured surfaces anywhere.

## Hard rules
- **Work only in this folder** (`.../GTA 6/V2`), branch `v2`. Never touch `../V1`, the `main` branch, port **5173** or **5180**, or the live site. Never push, merge or deploy. **Never run git commands that change state** (`add`, `commit`, `stash`, `checkout`, `reset`, `clean`): the lead commits. `git status`/`diff`/`log` are fine.
- **Originality:** no GTA/Rockstar names, characters, logos, signs, UI, map shapes or music. No real brands, no real car/boat model replicas or badges. Real Miami geography, street names, road numbers and architecture styles are fine. The main character is **Nico**.
  - The images in `references/` are another game's trailer frames and a fan map. Study them for *quality, layout arrangement, lighting and mood* only. **Never copy their names, signs, characters, logos, vehicles or exact shapes**, and never copy a reference image into `docs/`, `public/` or anywhere tracked by git. Side-by-side comparison images go in `docs/v2/compare/` (git-ignored).
  - Banned names (they belong to the other game or its fan map): Vice City, Leonida, Grassrivers, Kalaga, Port Gellhorn, Ambrosia, Watson Bay, Key Lento, Hamlet, Rusty Anchor, Wonder Whale, Dinka, Vapid, Schafter, and anything else you recognize from that series.
- **Assets:** CC0 or CC-BY only (Poly Haven, ambientCG, Kenney, Quaternius, Freesound CC0/CC-BY, Wikimedia with a clear license). Append every asset, its source URL and its license to `CREDITS.md` under a heading for your track. No Google Street View. No ripped game or video audio.
- **American spelling** in all code comments, UI text, docs and reports.
- **Atomic edits:** never leave a file half-written. For an existing file: write `<file>.tmp` → `npx esbuild <file>.tmp --loader:.tmp=js --format=esm --outfile=/dev/null` (or bundle check) → `mv`. New files: write then check. The shared dev server hot-reloads everyone's work, so a syntax error breaks every other agent.
- **Only edit files you own** (see the ownership table in `V2_PLAN.md` and your brief). `src/main.js`, `index.html`, `package.json`, `CONTRACT*.md`, `V2_PLAN.md`, `BIG_UPDATE.md`, `README.md`, `CHANGELOG.md` and `src/version.js` belong to the lead. If you need a change there, say exactly what in your report.
- **No placeholders.** No box stand-ins, no TODO stubs presented as done, no flat untextured materials. If something is not finished, list it as not finished.

## Testing rules (the user is filming v1 on this machine right now)
- A shared Vite dev server for V2 runs at **http://127.0.0.1:5200** (hot reload). Do not start another dev server. `?mute` mutes the game.
- **The only allowed browser is `tools/v2/browser.mjs`** (`withBrowser`) or its CLI `tools/v2/shot.mjs`. It launches an isolated, muted headless Chrome with a fresh temp profile, holds a machine-wide 2-slot semaphore, and always cleans up. Never launch Chrome any other way, never attach to ports 9222/9333, never use the user's browser or any MCP browser tool.
  - `node tools/v2/shot.mjs --url <url> --wait "<js truthy>" --out docs/v2/shots/<track>/<name>.png [--eval "<js>"] [--w 1280 --h 720]`
  - Full game: `--url "http://127.0.0.1:5200/?mute" --game` (waits for `game.ready`). Use `game.teleport(x, y|null, z, heading)` and set `game.timeOfDay` to stage shots.
  - Keep each browser run short (under 4 minutes; the watchdog kills it). Prefer small standalone preview pages (`src/<area>/preview_*.html` that import only your module) over loading the full game.
  - **Look at your own screenshots** (Read the PNG) and fix what looks wrong before you report. A screenshot you did not look at is not evidence.
- Before trusting any fps or timing number, run `uptime`; if the 1-minute load is above ~8, say the number is unreliable.
- Heavy jobs (Blender, texture baking, big builds) run with `nice -n 10`. Never leave a process running when you finish: check with `pgrep -fl "ps-v2-chrome|blender"`.
- Production check (lead and inspection agents): `npx vite build --outDir .v2-tmp/<name>` then `npx vite preview --outDir .v2-tmp/<name> --port <52xx>`; stop the preview when done.

## Done means verified (BIG_UPDATE 0a1c)
Each track keeps `docs/v2/progress/<track>.json` (the live tracker reads it):
```json
{ "track": "nico-house", "title": "Nico's Keys stilt house", "section": "Set pieces", "agent": "running|idle|done",
  "items": [ { "name": "Exterior shell, piles, deck, stairs", "state": "todo|building|built|verified", "evidence": "docs/v2/shots/nico-house/ext_front.png" } ] }
```
- `built` = code exists and runs. `verified` = you ran it, looked at the screenshot or test output, compared it with the bar (and the reference image where one exists), and it holds. Only `verified` counts toward the percentage.
- Update the file as you go (it is your progress bar). List every BIG_UPDATE item in your scope as an item, including the ones you did not get to.
- Your final report (under 300 words) to the lead: what is verified (with evidence paths), what is built but unverified, what is not done, and what you need from the lead (main.js wiring, contract changes). Put long notes in `docs/v2/reports/<track>.md`. **Report honestly.** An unverified claim costs more than an honest gap.

## How V2 code plugs in
- **V2 modules:** any file named `src/**/<name>.v2.js` that exports `async function initV2(game)` is loaded automatically by `main.js` after the HUD and gameplay exist (ascending `export const order`, default 100). Register your own `game.updaters.push(fn(dt))`, `game.fixedHooks.push(fn(fixedDt))`, events and `game.<yourApi>`. Wrap risky work in try/catch: a failed module must not take the game down. Loaded/failed module lists are in `game.v2`.
- **Event bus:** `game.on(name, fn)` / `game.emit(name, data)` (CONTRACT2). New V2 events are listed in `V2_PLAN.md` → "Shared APIs"; add yours to your report so the lead can list them.
- **Shared state lives on `game`**, never in module globals other modules must import. Guard every cross-module call (`game.foo?.bar?.()`), because modules load in different orders and may be missing.
- **Standalone-first:** models and set pieces are pure builder functions (`buildX(THREE, opts) → { group, colliders, interact, lights, update }`) with their own preview page, so they can be built and verified without the full game. A thin `.v2.js` places them in the world.

## World frame and layout (all modules)
Unchanged frame: origin lat0 = 25.7790, lon0 = -80.1650; `x` east, `z` south, `y` up, meters; heading 0 faces +Z; sea level `y = -0.12`.

The V2 world is a condensed Florida-style landmass with **real 1:1 Miami** on its east coast. Rough layout (the WORLD track owns the exact shapes; treat these as approximate until `public/assets/world/layout.json` exists):

| Region | Approx. extent (x, z in m) | Notes |
|---|---|---|
| **Real Miami (OSM, 1:1)** | x −5000 … 4600, z −4000 … 3400 | Miami Beach, bay islands, PortMiami, Downtown, Brickell, Little Havana, Overtown, Wynwood, Edgewater, Design District edge. Real street names and road numbers. |
| **Solana International Airport** | x −8400 … −5200, z −1700 … 900 | West of downtown. Two long runways, terminals, cargo, approach paths over the city. |
| **Central wetlands** | x −8600 … −5200, z 900 … 3300 | Marsh and canals between the airport and the south. |
| **South suburbs** | x −5000 … 1200, z 3400 … 4700 | Canal subdivisions and strip malls fading out of Brickell / Little Havana. |
| **Everglades (condensed)** | x −7600 … −600, z 4300 … 6100 | Sawgrass, mangrove channels, airboat routes, two-lane highway, fishing camp, ranger station. |
| **The Keys (condensed)** | chain from (300, 5700) curving SW to (−6200, 7600) | First large key **Key Paloma** (Nico's home, about (300, 6500)); small keys and long overseas bridges; island town and **Tern Key Airfield** at the far SW end. |
| **North suburbs and strip malls** | x −5000 … 3000, z −5000 … −4000 | Fade from the real city into the inland. |
| **Lake Amaro** | center (−1500, −5500), ~900 m radius | Big inland lake with a shore road, boat ramps, fish camps. |
| **Citrus Flats (farmland)** | x −8200 … −3600, z −5600 … −1900 | Groves, fields, farm roads, packing houses. |
| **Sawpalm Ridge State Park** | center (−3600, −6600) | The only real hills (peak ~110 m), trails, overlooks, campground. |
| **Port Cassia (north coastal town)** | around (2600, −6400) | Small second town, marina, main street. |
| **Barrier beach and islands** | east coast north of Miami Beach, west coast | Sand, dunes, small islands. |

- Total extent about 13 km from the park hills to the airfield island (BIG_UPDATE 1c). The landmass shape is **our own**, drawn from real Florida geography; it must not trace `ref_15`.
- Names above are ours. Do not rename them without the lead. New place names must be original (and not a real trademark).
- Everything outside real Miami is authored by `tools/world/` as OSM-like features and goes through the same tile pipeline, so the same renderer, streamer, road graph, traffic, peds and interiors work everywhere.

## Brand and design system (single source of truth)
`src/design/` (DESIGN-SYSTEM track) holds invented brand families, palettes, logos (drawn in code as canvas/SVG), sign styles, product definitions and shared PBR materials. **Never invent a one-off brand in your own module:** take one from `game.design.brands` / `src/design/brands.js`, or ask DESIGN-SYSTEM to add it. This is what makes a brand recognizable across billboards, shops, products, trucks and ads.

## Performance budget
60 fps on the user's Mac (M3 Max) at the default preset, no frame over 25 ms after loading. Under ~1,500 draw calls and ~5M visible triangles in view. Instancing, merged geometry, LODs and texture atlases are expected; they are how full detail stays fast, not a reason to cut detail. Dispose what you unload (GPU memory must level off).
