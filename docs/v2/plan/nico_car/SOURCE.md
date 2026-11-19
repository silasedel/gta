# Nico's car (ute1): source

- Body shape (silhouette and proportions only) comes from a Sketchfab model named **"lowpoly el camino no textures"**
  (`~/Downloads/lowpoly-el-camino-no-textures.zip`: `source/sketchfab-elcamino.fbx` plus one AO jpeg, which is not used).
- **License: not included in the zip. The user needs to confirm it** (Sketchfab page / author) before any public release.
- Everything else was rebuilt in `tools/v2/cars/ute1/build_ute1.py`: subdivided shell with recessed shut lines, chrome
  bumpers / trim / mirrors / exhaust tips, glass, lamps, plate recesses, ribbed bed, the whole cabin, new wheels and tires.
  The source's maker badge and logo faces are deleted. No brand text or badges anywhere.
- No third-party textures are used (the game bakes color, roughness and metalness into vertex data; see `tools/v2/cars/README.md`).
- Local copy of the source (gitignored): `Models/Cars/Trucks/Ute 1 - 1970 Coupe Utility/sketchfab-elcamino.fbx`.
- Rebuild everything: `tools/v2/cars/ute1/make_ute1.sh`. Blender look check: `tools/v2/cars/ute1/render_ute1.py`.
  In game: `TAG=u1a node tools/v2/cars/r2.mjs tools/v2/cars/ute1/shots.mjs`.
