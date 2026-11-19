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

# ---- r7b: the user's Nov 18 downloads (Models/_Inbox/*.zip, unpacked into a scratch dir $X: each zip into its own folder,
# nested source zips into <name>/x). Aged / recolored maps are written to $A by tools/v2/everglades/age_tex.py first.
#   X=<scratch>/inbox A=<scratch>/aged ./tools/v2/everglades/build_models.sh
if [ -n "$X" ] && [ -n "$A" ]; then
  BA="$B -b -Y --factory-startup --python-exit-code 1 --python tools/v2/everglades/blender/convert_alpha.py --"
  TINT="needles=0.82,0.98,0.72" $BA "$X/bald-cypress/source/cypres_chauve.fbx" "$X/bald-cypress/textures" $O/bald_cypress.glb 1 1024
  TINT="needles=0.82,0.98,0.72" $BA "$X/bald-cypress/source/cypres_chauve.fbx" "$X/bald-cypress/textures" $O/bald_cypress_lod1.glb 1 256 0.35
  # moss_clump.png: CypresChauve_mousse_D.png cropped to the clump, 256 x 512, grayed toward Spanish moss (python/PIL, see git log)
  for n in body door roof pipe; do python3 tools/v2/everglades/age_tex.py $X/rv-travel/textures/rv__${n}_BaseColor.png $A/rv/rv__${n}_BaseColor.png 0.45 0.7 0.45 0.95,0.92,0.82; done
  python3 tools/v2/everglades/age_tex.py "$X/oil-drum-game-model/textures/DefaultMaterial_Base_Color.tga.png" "$A/drum_rust/DefaultMaterial_Base_Color.tga.png" 0.3 0.6 0.9 0.8,0.55,0.4 3
  python3 tools/v2/everglades/age_tex.py "$X/oil-drum-game-model/textures/DefaultMaterial_Base_Color.tga.png" "$A/drum_blue/DefaultMaterial_Base_Color.tga.png" 0.4 0.6 0.6 0.5,0.62,0.8 4
  python3 tools/v2/everglades/age_tex.py $X/flatbed-trailer/textures/flatbedtrailer_TrailerFlatBed_BaseColor.jpeg $A/flatbed/flatbedtrailer_TrailerFlatBed_BaseColor.png 0.3 0.6 0.8 0.85,0.78,0.7 5
  f() { FBX="$1" TEX="$2" $B -b -Y --factory-startup --python-exit-code 1 --python tools/v2/everglades/blender/import_any.py -- "$3" "$4" 1024 join "" "$5" base 2>&1 | grep -E "^CONV|rror"; }
  f "$X/rv-travel/x/rv .obj" $A/rv $O/rv_trailer.glb 0.36 14000
  f "$X/oil-drum-game-model/source/oildrum_mesh.fbx" $A/drum_rust $O/drum_rust.glb 1.04 0
  f "$X/oil-drum-game-model/source/oildrum_mesh.fbx" $A/drum_blue $O/drum_blue.glb 1.04 0
  f "$X/abandoned-junk-car/source/SM_JUNKCAR1_DEFORMED2.fbx" $A/junkcar $O/junk_car.glb 1 12000      # maps renamed junkcar_BaseColor / _Normal
  f "$X/flatbed-trailer/source/flatbedtrailer.fbx" $A/flatbed $O/flatbed.glb 0.45 0
  f "$X/great-blue-heron/x/Pbr/base.obj" "$X/great-blue-heron/x/Pbr" $O/heron_blue.glb 0.62 4500
  f "$X/stone-with-moss__1_/x/kivi.obj" "$X/stone-with-moss__1_/textures" $O/mossy_stone.glb 0.45 1500
fi
