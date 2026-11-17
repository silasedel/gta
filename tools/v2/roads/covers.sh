#!/bin/zsh
# Round 2 (r2-roads, item 13): utility covers from the user's library -> public/assets/models/roads/*.glb (street-models converter).
#   ./tools/v2/roads/covers.sh [name-regex]
# Placed flush in the asphalt by src/world/surfaces/covers.js (sanitary manholes on the centerline every ~100 m and at junctions,
# curb-inlet grates at curb returns and low points, water valve boxes near junctions).
cd "$(dirname $0)/../../.."
M="$PWD/Models"; O="$PWD/public/assets/models/roads"; C=tools/v2/street-models/convert.py
only=${1:-.}
run() { [[ "$1" =~ $only ]] || return 0; blender -b --factory-startup -Y -P $C -- "$2" 2>&1 | grep -E "CONVERTED|CONVERT-ERROR|Error" | sed "s|$PWD/||g" }
SG="$M/Sewer Grates"
M4="$SG/Manhole 4 - Embossed Water-Utility Round Cover/Manhole 4.blend"
M4T='{".":{"color":"Water Manhole Cover Color.jpg","normal":"Water Manhole Cover Normal.exr","rough":"Water Manhole Cover Roughness.exr","metal":"Water Manhole Cover Metallic.exr"}}'
# sanitary sewer manhole: Manhole 4 frame + cover, scaled from 0.69 m to a 0.80 m frame (24 in cover in its ring)
run mh_sewer '{"src":"'$M4'","out":"'$O'/mh_sewer.glb","scale":1.16,"tris":1400,"maxtex":1024,"texmat":'$M4T'}'
# water valve box: the same casting at 0.30 m (8 in valve lid in a small ring)
run valve '{"src":"'$M4'","out":"'$O'/valve.glb","scale":0.44,"tris":500,"maxtex":256,"texmat":'$M4T'}'
# storm / water manhole with its patched concrete collar (the utility-cut settlement ring): Manhole 2, 0.62 m cover
M2="$SG/Manhole 2 - Rusty Round Cover In Patched Asphalt/Manhole 2.blend"
run mh_storm '{"src":"'$M2'","out":"'$O'/mh_storm.glb","scale":1.25,"tris":1800,"maxtex":1024,"rough":0.8,"metal":0.1}'
# curb inlet grate (gutter): Street Props Pack 1 'Drain', 1.3 x 1.1 m -> ~0.95 x 0.62 m (rotz: bars across the gutter flow)
P1="$M/Prop Packs/Street Props Pack 1 - Bus Stop Benches Bins Mailbox Dumpster And Manholes/Street Props Pack 1.blend"
run inlet '{"src":"'$P1'","out":"'$O'/inlet.glb","keep":"^Drain$","scale":0.6,"tris":1200,"maxtex":512,"rough":0.55,"metal":0.6,"texmat":{".":{"color":"Drain Drain Shader Color.png","normal":"Drain Drain Shader Normal.png"}}}'
# second sewer cover variant: pack 'Manhole' (simple ring cover, 1 m -> 0.78 m)
run mh_pack '{"src":"'$P1'","out":"'$O'/mh_pack.glb","keep":"^Manhole$","scale":0.78,"tris":400,"maxtex":512,"rough":0.6,"metal":0.5,"texmat":{".":{"color":"Manhole Manhole Shader Color.png","normal":"Manhole Manhole Shader Normal.png"}}}'
