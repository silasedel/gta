#!/bin/zsh
# Library street furniture -> game GLBs (public/assets/models/street/). Blender 5.x, headless. Licenses: Models/catalog.csv
# (none of these rows is "personal use only"); sources listed in public/assets/models/street/SOURCES.txt.
#   ./tools/v2/street-models/build.sh [name-regex]
cd "$(dirname $0)/../../.."
M="$PWD/Models"; O="$PWD/public/assets/models/street"; C=tools/v2/street-models/convert.py
mkdir -p $O
only=${1:-.}
run() { [[ "$1" =~ $only ]] || return 0; blender -b --factory-startup -P $C -- "$2" 2>&1 | grep -E "CONVERTED|CONVERT-ERROR|Error|TEX " | sed "s|$PWD/||g" }
run hydrant_a  '{"src":"'$M'/Fire Hydrants/Fire Hydrant 1 - Worn Yellow Hydrant With Blue Top/Fire Hydrant 1.blend","out":"'$O'/hydrant_a.glb","height":0.78,"tris":1800,"maxtex":512}'
run hydrant_b  '{"src":"'$M'/Fire Hydrants/Fire Hydrant 3 - Dull Olive-Yellow Hydrant/Fire Hydrant 3.blend","out":"'$O'/hydrant_b.glb","height":0.8,"tris":2500,"maxtex":512}'
run bench_wood '{"src":"'$M'/Benches/Bench 3 - Classic Wooden Park Bench/Bench 3.blend","out":"'$O'/bench_wood.glb","height":0.86,"tris":3000,"maxtex":1024}'
run bench_iron '{"src":"'$M'/Benches/Bench 2 - Ornate Cast-Metal Slat Bench/Bench 2.blend","out":"'$O'/bench_iron.glb","height":0.9,"tris":4000,"maxtex":1024,"tex":{"color":"auto","rough":"auto"}}'
run bin_metal  '{"src":"'$M'/Bins/Trash Can 4 - Slatted Metal Street Bin/Trash Can 4.blend","out":"'$O'/bin_metal.glb","height":0.95,"tris":2500,"maxtex":1024,"tex":{"color":"auto","normal":"auto","rough":"auto","metal":"auto"}}'
run bin_wood   '{"src":"'$M'/Bins/Trash Can 3 - Round Wooden Slat Bin/Trash Can 3.blend","out":"'$O'/bin_wood.glb","height":0.9,"tris":1600,"maxtex":1024}'
run bin_wheel  '{"src":"'$M'/Bins/Trash Can 2 - Graffiti Wheeled Bin/Trash Can 2.blend","out":"'$O'/bin_wheel.glb","height":1.05,"tris":1800,"maxtex":1024}'
run bin_set    '{"src":"'$M'/Bins/Trash Can 1 - Wheeled Curbside Bin Set/Trash Can 1.blend","out":"'$O'/bin_set.glb","rotz":90,"height":1.05,"tris":3000,"maxtex":1024}'
run dumpster   '{"src":"'$M'/Bins/Dumpster 1 - Graffiti Front-Load Dumpsters/Dumpster 1.blend","out":"'$O'/dumpster.glb","height":1.55,"tris":4000,"maxtex":1024}'
run shelter_glass '{"src":"'$M'/Bus Shelters/Bus Shelter 3 - Modern Curved-Roof Bus Shelter/Bus Shelter 3.blend","out":"'$O'/shelter_glass.glb","rotz":90,"height":2.7,"tris":6000,"maxtex":1024,"jpeg":false}'
run shelter_long  '{"src":"'$M'/Bus Shelters/Bus Shelter 2 - Modern Long Glass Bus Shelter/Bus Shelter 2.blend","out":"'$O'/shelter_long.glb","rotz":90,"height":2.7,"tris":6000,"maxtex":1024,"jpeg":false}'
run shelter_black '{"src":"'$M'/Bus Shelters/Bus Shelter 4 - Modern Black-Roof Bus Stop/Bus Shelter 4.blend","out":"'$O'/shelter_black.glb","height":2.75,"tris":6000,"maxtex":1024,"jpeg":false}'
run shelter_old   '{"src":"'$M'/Bus Shelters/Bus Shelter 1 - Rundown Graffiti Bus Shelter/Bus Shelter 1.blend","out":"'$O'/shelter_old.glb","rotz":180,"height":2.6,"tris":5000,"maxtex":1024,"jpeg":false}'
run meter      '{"src":"'$M'/Parking Meters/Parking Meter 2 - Plain Grey Street Meter/Parking Meter 2.blend","out":"'$O'/meter.glb","height":1.45,"tris":1500,"maxtex":512,"tex":{"color":"auto","normal":"auto","rough":"auto","metal":"auto"}}'
run mailbox_post '{"src":"'$M'/Mailboxes/Mailbox 2 - Rusty Wooden Post Mailbox/Mailbox 2.blend","out":"'$O'/mailbox_post.glb","height":1.2,"tris":600,"maxtex":512}'
run mailbox_twin '{"src":"'$M'/Mailboxes/Mailbox 1 - Plain White Twin Mailboxes/Mailbox 1.blend","out":"'$O'/mailbox_twin.glb","height":1.2,"tris":1500,"maxtex":512,"tex":{"color":"auto","normal":"auto","rough":"auto","metal":"auto"}}'
run mailbox_drop '{"src":"'$M'/Mailboxes/Mailbox 3 - Grey Street Drop Mailbox/Mailbox 3.blend","out":"'$O'/mailbox_drop.glb","height":1.25,"tris":1500,"maxtex":512,"tex":{"color":"auto","normal":"auto","rough":"auto","metal":"auto"}}'
run transformer '{"src":"'$M'/Transformers/Transformer 1 - Green Pad-Mount Transformer/Transformer 1.blend","out":"'$O'/transformer.glb","height":1.25,"tris":800,"maxtex":1024}'
run cabinet    '{"src":"'$M'/Transformers/Transformer 2 - Old Rusty Utility Cabinet/Transformer 2.blend","out":"'$O'/cabinet.glb","height":1.55,"tris":1500,"maxtex":1024}'
run lantern_post '{"src":"'$M'/Street Lamps/Street Lamp 1 - Wooden Post With Hanging Lantern/Street Lamp 1.blend","out":"'$O'/lantern_post.glb","rotz":-90,"height":4.6,"tris":4000,"maxtex":1024}'
run flexpost   '{"src":"'$M'/Bollards/Bollard 3 - Orange Flexible Post Bollard/Bollard 3.blend","out":"'$O'/flexpost.glb","height":1.0,"tris":400,"maxtex":256}'
# Road 7 (lamp-lined road scene): its curved davit street lamp, as a twin-arm median lamp and a single-arm curb lamp
# (arm toward three.js +Z, pole axis at the origin), scaled to a 8.6 m US arterial mounting height
R7="$M/Roads/Road 7 - Lamp-Lined Two-Lane Road/Road 7.blend"
run lamp_twin   '{"src":"'$R7'","out":"'$O'/lamp_twin.glb","box":[39.5,-9.0,-1,40.3,-4.0,8],"dropmat":"^Material(20.*)?$","rotz":180,"pivot":[-40.065,6.59],"scale":1.35,"tris":3000,"maxtex":512}'
run lamp_single '{"src":"'$R7'","out":"'$O'/lamp_single.glb","box":[39.5,-9.0,-1,40.3,-4.0,8],"clip":{"axis":1,"min":-6.72},"dropmat":"^Material(20.*)?$","rotz":180,"pivot":[-40.065,6.59],"scale":1.35,"tris":2000,"maxtex":512}'
run upole_gear  '{"src":"'$R7'","out":"'$O'/upole_gear.glb","box":[45.5,6.0,-1,47.8,9.0,11],"pivot":[46.02,7.22],"tris":5000,"maxtex":512}'
# the davit arm + luminaire of the same lamp (source z > 4.9 m), to bolt onto a wooden utility pole on Keys / rural lanes
run lamp_arm    '{"src":"'$R7'","out":"'$O'/lamp_arm.glb","box":[39.5,-9.0,-1,40.3,-4.0,8],"dropmat":"^Material(20.*)?$","clip":{"axis":1,"min":-6.72},"rotz":180,"pivot":[-40.065,6.59],"center":"base","scale":1.0,"tris":1200,"maxtex":512,"clipz":4.9}'
