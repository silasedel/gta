#!/bin/bash
# Everglades r7: the user's animals / junk / boat models -> public/assets/models/everglades/*.glb
# Reuses the keys converter (tools/v2/keys/blender/convert_dock.py: out SCALE MAXTEX PIECES DROP MAXTRIS ORIGIN [TEXDIR]); Blender runs with
# auto-run scripts OFF (-Y). Front / long axis is sorted out at run time (src/world/everglades/models.js reads the bbox).
cd "$(dirname "$0")/../../.."
B=/opt/homebrew/bin/blender; S=tools/v2/keys/blender/convert_dock.py; M=Models; O=public/assets/models/everglades
mkdir -p $O
c() { "$B" -b -Y "$M/$1" --python-exit-code 1 --python $S -- "$2" "${@:3}" 2>&1 | grep -E "CONV|WIRED|Error|rror:" | head -20; }
c "Animals/Alligator 1 - Detailed Dark Alligator/Alligator 1.blend" $O/gator_a.glb 4.6 1024 join "" 5000 base
c "Animals/Alligator 2 - Smooth Dark Alligator/Alligator 2.blend" $O/gator_b.glb 0.85 1024 join "" 5000 base
c "Animals/Alligator 3 - Scanned Orange-Brown Alligator/Alligator 3.blend" $O/gator_c.glb 0.0031 1024 join "" 6000 base
c "Boats/Boat 9 - Classic Fan Airboat/Boat 9.blend" $O/airboat_classic.glb 0.029 1024 join "" 0 base
c "Tanks/Tank 2 - Horizontal Steel Fuel Tank On Skid Frame/Tank 2.blend" $O/fuel_tank.glb 0.6 1024 join "" 3000 base
c "Gas Cans/Gas Can 1 - Worn Red Plastic Fuel Can/Gas Can 1.blend" $O/gas_can.glb 1 512 join "" 1200 base
c "Clotheslines/Clothesline 1 - Three Lines Of Hanging Laundry/Clothesline 1.blend" $O/clothesline.glb 1 1024 join "" 4000 base
c "Fences/Fence 2 - Corrugated Metal Fence/Fence 2.blend" $O/fence_tin.glb 1 1024 join "" 0 base
