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
python3 tools/v2/keys/tex/repaint_dumpster2.py "$M/Bins/Dumpster 3 - Large Open Roll-Off Container/textures/Color 4.png" "tools/v2/keys/tex/dumpster3/Color 4.png"   # chipped faded red enamel over rust, small faded invented name (r2-keys)
c "Bins/Dumpster 3 - Large Open Roll-Off Container/Dumpster 3.blend" public/assets/models/keys/rolloff.glb 1 1024 join "" 0 base "tools/v2/keys/tex/dumpster3"
c "Fences/Fence 4 - Dark Rustic Wooden Fence/Fence 4.blend" public/assets/models/keys/fence_rustic.glb 1 1024 join "" 0 base
c "Fences/Fence 5 - Low Wooden Picket Fence/Fence 5.blend" public/assets/models/keys/fence_picket.glb 1 1024 join "" 0 base
c "Boats/Boat 14 - Worn White Rowboat With Red Interior/Boat 14.blend" public/assets/models/keys/rowboat.glb 0.01 1024 join "" 0 base
c "Boats/Boat 3 - Small Fishing Boat/Boat 3.blend" public/assets/models/keys/skiff.glb 1 1024 join "" 0 base
c "Lifebuoys/Lifebuoy 3 - Weathered Red Ring With Gray Bands And Rope/Lifebuoy 3.blend" public/assets/models/keys/lifebuoy.glb 1 512 join "" 1500 base
c "Bins/Trash Can 1 - Wheeled Curbside Bin Set/Trash Can 1.blend" public/assets/models/keys/bins.glb 1 1024 splitc "" 0 base
c "Rocks/Rock 2 - Seven Mossy Brown Rocks/Rock 2.blend" public/assets/models/keys/rocks.glb 1 1024 splitc "" 900 base
c "Crates/Crate 1 - Plain Wooden Crate/Crate 1.blend" public/assets/models/keys/crate.glb 0.3 1024 join "" 0 base "$M/Crates/Crate 1 - Plain Wooden Crate/textures"
# utility pole (r2-keys, Nov 17 pm): FBX + loose maps -> import_fbx.py wires them, then convert_dock.py
P="$M/Utility Poles/Utility Pole 1 - Utility Pole With Crossarms (2K textures)"
FBX="$P/source/Utility Pole.fbx" TEX="$P/textures" "$B" -b -Y --factory-startup --python-exit-code 1 --python tools/v2/keys/blender/import_fbx.py -- public/assets/models/keys/utility_pole.glb 1 1024 join "" 0 base 2>&1 | grep -E "CONV|rror" | head
# yard props from the Nov 17 pm intake (r2-keys): FBX / OBJ + loose maps through import_fbx.py; archives are unpacked with unar into a scratch dir first
fx() { FBX="$1" TEX="$2" "$B" -b -Y --factory-startup --python-exit-code 1 --python tools/v2/keys/blender/import_fbx.py -- "$3" "$4" 1024 join "" 0 base 2>&1 | grep -E "CONV|rror" | head -4; }
X=$(mktemp -d); mkdir -p "$X/ac" "$X/can" "$X/mb6"
unar -q -o "$X/ac" "$M/Ventilators/Window AC 1 - Window Air Conditioner Unit/source/window Ac.rar"; unar -q -o "$X/can" "$M/Bins/Trash Can 7 - Galvanized Steel Trash Can With Lid/source/Trash_01.rar"; unar -q -o "$X/mb6" "$M/Mailboxes/Mailbox 6 - Blue Mailbox On A Wooden Post/source/MailBox_upl.7z"
P="$M/Beach Stuff/Cooler 1 - Hard Beach Coolers Set"; fx "$P/source/Coolers.fbx" "$P/textures" public/assets/models/keys/coolers.glb 0.75
P="$M/Chairs/Patio Chair 1 - Outdoor Patio Chair"; fx "$P/source/PatioChair1.fbx" "$P/textures" public/assets/models/keys/patio_chair.glb 1
fx "$X/ac/window Ac/window Ac.fbx" "$X/ac/window Ac/Textures" public/assets/models/keys/window_ac.glb 5.5
DROPBIG=5000 fx "$X/can/Trash_01/wee2_trash_01_geo.obj" "$M/Bins/Trash Can 7 - Galvanized Steel Trash Can With Lid/textures" public/assets/models/keys/galv_can.glb 0.01   # drops the 2 m ground plane in the mesh
fx "$X/mb6/MailBox_upl/MailBox_J_low.fbx" "$X/mb6/MailBox_upl/Mailbox_UE_4K" public/assets/models/keys/mailbox_post.glb 0.37
rm -rf "$X"
# deck and dock (r2-keys, last pass): wicker chair (FBX, decimated to 9k) and the fishing supplies set (.blend, one piece per object)
P="$M/Chairs/Wicker Chair 1 - Low-Poly Wicker Chair"; FBX="$P/source/wicker chair.fbx" TEX="$P/textures" "$B" -b -Y --factory-startup --python-exit-code 1 --python tools/v2/keys/blender/import_fbx.py -- public/assets/models/keys/wicker_chair.glb 1 1024 join "" 9000 base 2>&1 | grep -E "CONV|rror"
c "Fishing Gear/Fishing Gear 2 - Fishing Supplies Set/source/inner_FishingSupplies/FishingSupplies.blend" public/assets/models/keys/fishing_gear.glb 0.012 1024 splitc "Empty" 0 base
