# Library cars (the user's Models/Cars) -> game

- `cars.json`: one entry per car: source file (under `Models/Cars/`), real length `L` (m) and per-car fixes:
  `fwd` (source forward axis, when the auto guess is wrong), `slots` ({material regex: 'paint' | 'trim' | 'trim:chrome' |
  'trim:rubber' | 'glass' | 'lens' | 'lamp:tail' | 'drop' | 'trim#rrggbb'}), `dropMat` / `dropObj` (regex), `textured` (keep
  the source textures: low-poly trucks/vans), `texSlots` + `texOverride` (keep / replace a texture, e.g. the Southline police
  livery in `liveries/`), `cropToPaint` (cut roof racks and pipes), `keepEngine`, `police` (roof lamps -> red/blue strobes),
  `static` (a prop without wheels, e.g. the covered car).  The four "personal use only" rows of Models/catalog.csv are not here.
- `convert_all.sh [key-regex] [jobs]` -> `public/assets/vehicles/cars/<key>.glb` + `<key>.json` + `index.json`; logs in `logs/`.
- `convert.py` (Blender 5.2, scripts off): join, orient (+Z forward, +X left, y up), scale, wheels by geometry (hub pivots,
  calipers static), material slots (albedo / roughness / metal sampled into vertex data), badges removed, LOD 80k / 10k / 2.2k
  (paint shell decimated gently, source normals transferred), Draco GLB, manifest (dims, wheel positions and radius, arch gap,
  body width, glass-derived proportions, hull points).
- Checks: `node tools/v2/cars/sheet.mjs <dir> key,key` (studio front / rear views, `src/vehicles/glb/preview.html`),
  `node tools/v2/cars/game.mjs --set X --spots tools/v2/cars/spots/basic.json` (in game: fleet stats, wheel-to-ground error,
  frame time, shots in `docs/v2/shots/cars/`).
- Runtime: `src/vehicles/glb/` (glbCar.js builder, fleet.js names/classes/physics/colors, index.js registration + streaming,
  placements.js rare cars).
