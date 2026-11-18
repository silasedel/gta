#!/bin/bash
# r4-house (Nov 18): the user's library models for Nico's rebuilt house, dock and interior -> public/assets/models/keys/*.glb
# Same converter as tools/v2/keys/build_models.sh (Blender with auto-run scripts OFF, -Y; only our scripts run).
cd "$(dirname "$0")/../../../.."
B=/opt/homebrew/bin/blender; S=tools/v2/keys/blender/convert_dock.py; M=Models; O=public/assets/models/keys
c() { "$B" -b -Y "$M/$1" --python-exit-code 1 --python $S -- "$2" "${@:3}" 2>&1 | grep -E "CONV|Error|rror:" | head -5; }
c "Beach Stuff/Pool Chairs 1 - Pool Lounge Chair Set/Pool Chairs 1.blend" $O/lawn_chair.glb 1 1024 join '^(?!Cube\.019$)' 6000 base   # the white resin chair of the set (08 platform)
c "Kitchens/Stove 1 - Four-Burner Gas Stove/Stove 1.blend" $O/stove_white.glb 1 1024 join "" 9000 base                                # white gas range (05 / 07)
c "Bathrooms/Bathroom 1 - Toilet And Cleaning Props Set/Bathroom 1.blend" $O/bath_set.glb 1 1024 split "" 0 base                        # toilet, towel bar, paper holder
c "Ladders/Ladder 1 - Yellow Step Ladder/Ladder 1.blend" $O/step_ladder.glb 1 1024 join "" 6000 base                                     # renovation room (07)
c "Boats/Boat 8 - Low Offshore Speedboat/Boat 8.blend" $O/skiff_cc.glb 13.2 1024 join "" 30000 base                                      # white open boat with outboards (08 skiff)
c "Shelves/Shelf 4 - Clothing Rack With Shirts/Shelf 4.blend" $O/clothes_rack.glb 1 1024 join "" 12000 base                              # Nico's wardrobe in the back room
