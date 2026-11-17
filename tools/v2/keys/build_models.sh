#!/bin/bash
# Key Largo models (track: keys): the user's dock / prop models -> public/assets/models/{docks,keys}/*.glb
# Uses only our converter script (tools/v2/keys/blender/convert_dock.py); Blender runs with auto-run scripts OFF (-Y).
cd "$(dirname "$0")/../../.."
B=/opt/homebrew/bin/blender; S=tools/v2/keys/blender/convert_dock.py; M=Models
c() { "$B" -b -Y "$M/$1" --python-exit-code 1 --python $S -- "$2" "${@:3}" 2>&1 | grep -E "CONV|WIRED|Error|rror:" | head -20; }
# docks: args out SCALE MAXTEX PIECES DROP MAXTRIS ORIGIN
c "Docks/Dock 6 - Modular Weathered Wooden Pier Kit With Posts And Bollards/Dock 6.blend" public/assets/models/docks/pier_kit.glb 1 2048 split "" 6000 deck
c "Docks/Dock 2 - Weathered Mossy Pier/Dock 2.blend" public/assets/models/docks/mossy_pier.glb 60 1024 join "" 0 deck
c "Docks/Dock 3 - Clean Wooden Pier/Dock 3.blend" public/assets/models/docks/clean_pier.glb 45 1024 join "Circle" 0 deck
c "Docks/Dock 4 - Loose Wooden Dock Platforms/Dock 4.blend" public/assets/models/docks/loose_platforms.glb 1 1024 split "" 0 deck
c "Docks/Dock 5 - Wooden Boardwalk Pier Segments/Dock 5.blend" public/assets/models/docks/boardwalk.glb 1 1024 split "" 0 deck "$M/Docks/Dock 5 - Wooden Boardwalk Pier Segments/textures"
c "Docks/Dock 1 - Rustic Boathouse Dock/Dock 1.blend" public/assets/models/docks/boathouse.glb 1 1024 join "" 24000 deck
# props
mkdir -p tools/v2/keys/tex/dumpster3; cp "$M/Bins/Dumpster 3 - Large Open Roll-Off Container/textures/"*.png tools/v2/keys/tex/dumpster3/
python3 tools/v2/keys/tex/repaint_dumpster.py "$M/Bins/Dumpster 3 - Large Open Roll-Off Container/textures/Color 4.png" "tools/v2/keys/tex/dumpster3/Color 4.png"   # invented lettering
c "Bins/Dumpster 3 - Large Open Roll-Off Container/Dumpster 3.blend" public/assets/models/keys/rolloff.glb 1 1024 join "" 0 base "tools/v2/keys/tex/dumpster3"
c "Fences/Fence 4 - Dark Rustic Wooden Fence/Fence 4.blend" public/assets/models/keys/fence_rustic.glb 1 1024 join "" 0 base
c "Fences/Fence 5 - Low Wooden Picket Fence/Fence 5.blend" public/assets/models/keys/fence_picket.glb 1 1024 join "" 0 base
c "Boats/Boat 14 - Worn White Rowboat With Red Interior/Boat 14.blend" public/assets/models/keys/rowboat.glb 0.01 1024 join "" 0 base
c "Boats/Boat 3 - Small Fishing Boat/Boat 3.blend" public/assets/models/keys/skiff.glb 1 1024 join "" 0 base
c "Lifebuoys/Lifebuoy 3 - Weathered Red Ring With Gray Bands And Rope/Lifebuoy 3.blend" public/assets/models/keys/lifebuoy.glb 1 512 join "" 1500 base
c "Bins/Trash Can 1 - Wheeled Curbside Bin Set/Trash Can 1.blend" public/assets/models/keys/bins.glb 1 1024 splitc "" 0 base
c "Rocks/Rock 2 - Seven Mossy Brown Rocks/Rock 2.blend" public/assets/models/keys/rocks.glb 1 1024 splitc "" 900 base
c "Crates/Crate 1 - Plain Wooden Crate/Crate 1.blend" public/assets/models/keys/crate.glb 0.3 1024 join "" 0 base "$M/Crates/Crate 1 - Plain Wooden Crate/textures"
