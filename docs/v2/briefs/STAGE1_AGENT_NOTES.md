# Stage 1 helper notes (read this first)

Project: `/Users/silasedel/Downloads/Apps_Games/GTA 6/Southline` (Vite + three.js 0.170 + Rapier). Git branch `stage-1`.
Read `READ_ME_FIRST.md` ("The goal", "Standards") and `docs/v2/briefs/STATUS_stage1.md` (what stage 1 already did).

## The bar
The user's bar is GTA 5 / GTA 6 quality, polished by hand: every crosswalk, curb, sign, lamp and building must look right
up close. "It basically works" is not done. Take screenshots, look at them, fix what looks wrong, repeat.
American spelling. Made-up brands only. Only free-for-games assets (never the 4 rows marked "personal use only" in
`Models/catalog.csv`). Never push, never touch `main` / `v2`, never delete anything in `Models/` or `references/`.

## Rules for working alongside other helpers
- Several helpers edit the code at the same time. Only edit the files your brief gives you. Re-read a file right
  before editing it (another helper may have changed another part). Keep edits local to the functions you own.
- Commit only your own files: `git add <your files>` then `git commit -m "..."` (never `git add -A`). End commit messages
  with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- The dev server is already running at http://127.0.0.1:5200 (do not start or stop it). Saving a file hot-reloads the
  page; if a test run fails strangely, run it again.
- Do not change performance-critical settings (quality presets, post.js, shadows) unless your brief says so. Measure
  draw calls / frame time before and after your change and report both; do not make the game slower.

## Test tools (all headless, muted, 1920x1080, starting real gameplay)
- `node tools/v2/s1-tour.mjs --set <name> --spots spots.json [--stream 60]` -> `docs/v2/shots/stage1/<name>_<id>.png` and
  timing. A spot: `{"id": {"eye":[x,y,z],"look":[x,y,z],"tod":12}}` (fixed camera) or `{"player":[x,z,heading],"tod":12}`
  (gameplay camera), optional `"eval":"js run in the page"`.
- `node tools/v2/s1-prof.mjs --secs 30 [--at "x,undefined,z"] --after "js expression"` -> CPU per system + an eval.
- `python3 tools/v2/montage.py out.png a.png b.png ...` review sheets. Read images with the Read tool to look at them.
- In the page: `game.city` (roadGraph with nodes/edges, groundHeightAt, isWater, districtAt, zoneAt), `game.scene`,
  `game.renderer`, `game.teleport(x, y, z, heading)`, `game.cameraOverride = (dt, cam) => { ...; return true; }`.

## The map (new, stage 1)
World frame: x east, z south, meters. Traced from `docs/v2/plan/map_roads_target.webp` at 11 m/px:
x = (px - 700) * 11, z = (py - 800) * 11. Districts and anchors: `tools/v2/map3/build_v3.py` (ANCHORS).
Rebuild the world data: `./tools/v2/map3/run.sh` (trace + build + runtime data into staging) then
`./tools/v2/map3/publish.sh` (into `public/assets/`). Only the lead edits `tools/v2/map3/*` unless your brief says so.
Runtime city build: `src/world/miami/city.js`, `stream.js`, `tilebuild.js` (roads, junctions, sidewalks, buildings,
props per 200 m tile), `elevated.js` (bridges), `materials.js`; facades `src/world/city/facade.js`.
Useful places: Downtown (407, -110), Brickell (0, 1760), Miami Beach (2332, -660), Clewiston town (-1540, -2805),
Key Largo / Nico's house (-836, 5272), Homestead (-1320, 3190).
Model library: `Models/` (`Models/README.txt`, `Models/catalog.csv`): GLB/FBX per folder (Buildings, Street Lamps,
Traffic Lights, Signs, Roads, Benches, Bins, Bus Shelters, Fire Hydrants, Parking Meters, Trees, Plants, ...).
Vite serves the project root, so `/Models/<folder>/<file>.glb` is fetchable in the browser during development; for
shipping, copy the used files into `public/assets/models/<category>/` (keep the license/catalog info).
