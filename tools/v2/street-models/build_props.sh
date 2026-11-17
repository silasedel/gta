#!/bin/zsh
# Overnight props pass (Nov 17): more library street props -> public/assets/models/street/*.glb (same converter as build.sh).
#   ./tools/v2/street-models/build_props.sh [name-regex]
# Texture variants for the instanced props: tools/v2/street-models/variants.py (writes public/assets/models/street/var/).
cd "$(dirname $0)/../../.."
M="$PWD/Models"; O="$PWD/public/assets/models/street"; C=tools/v2/street-models/convert.py
only=${1:-.}
run() { [[ "$1" =~ $only ]] || return 0; blender -b --factory-startup -Y -P $C -- "$2" 2>&1 | grep -E "CONVERTED|CONVERT-ERROR|Error|TEX" | sed "s|$PWD/||g" }
TC1="$M/Bins/Trash Can 1 - Wheeled Curbside Bin Set/Trash Can 1.blend"
# one curbside cart of the 4-color set (the other colors become texture-array layers)
run cart '{"src":"'$TC1'","out":"'$O'/cart.glb","keep":"^TrashCan_Grey$","rotz":90,"height":1.07,"tris":980,"maxtex":512,"texmat":{".":{"normal":"Trash Can Normal.png","rough":"Trash Can Roughness.png"}}}'
CS="$M/Traffic Cones/Traffic Cone Set 1 - Cones And Barrier Posts Set/Traffic Cone Set 1.blend"
CT='{".":{"color":"Traffic Cones 1 1 Color.png","normal":"Traffic Cones 1 1 Normal.png"}}'
run cone   '{"src":"'$CS'","out":"'$O'/cone.glb","keep":"^Traffic_Cone_2_2\\.002$","height":0.71,"tris":752,"maxtex":512,"texmat":'$CT'}'
run drum   '{"src":"'$CS'","out":"'$O'/channelizer.glb","keep":"^Vertical_Panel_1\\.001$","height":1.15,"tris":400,"maxtex":512,"texmat":'$CT'}'
run tcbollard '{"src":"'$CS'","out":"'$O'/tc_bollard.glb","keep":"^Bollard_1\\.001$","height":1.1,"tris":434,"maxtex":512,"texmat":'$CT'}'
run barricade2 '{"src":"'$M'/Signs/Sign Set 8 - Striped Barricade Sign Post/Sign Set 8.blend","out":"'$O'/barricade2.glb","height":1.5,"tris":3000,"flatten":true,"rough":0.55,"metal":0.05}'
run jersey '{"src":"'$M'/Fences/Fence 1 - Striped Concrete Barrier/Fence 1.glb","out":"'$O'/jersey.glb","rotz":90,"height":0.81,"tris":442,"maxtex":1024}'
D3="$M/Bins/Dumpster 3 - Large Open Roll-Off Container/Dumpster 3.blend"
run rolloff '{"src":"'$D3'","out":"'$O'/rolloff.glb","rotz":90,"height":1.85,"tris":6000,"maxtex":1024,"texmat":{"01":{"color":"Color.png","normal":"Normal.png","rough":"Roughness.png","metal":"Metallic.png"},"02":{"color":"Color 2.png","normal":"Normal 2.png","rough":"Roughness 2.png","metal":"Metallic 2.png"},"03":{"color":"Color 3.png","normal":"Normal 3.png","rough":"Roughness 3.png","metal":"Metallic 3.png"},"04":{"color":"'$PWD'/tools/v2/street-models/fixed/rolloff_color4.png","normal":"Normal 4.png","rough":"Roughness 4.png","metal":"Metallic 4.png"}}}'
TAC="$M/Furniture/Table And Chairs 1 - Red Plastic Patio Table And Chairs/Table And Chairs 1.blend"
run chair '{"src":"'$TAC'","out":"'$O'/chair.glb","keep":"^Plastic_Table_2$","height":0.86,"tris":1500,"maxtex":512}'
run ptable '{"src":"'$TAC'","out":"'$O'/patio_table.glb","keep":"^Plastic_Table$","height":0.72,"tris":1500,"maxtex":512}'
P1="$M/Prop Packs/Street Props Pack 1 - Bus Stop Benches Bins Mailbox Dumpster And Manholes/Street Props Pack 1.blend"
run trashcom '{"src":"'$P1'","out":"'$O'/bin_commercial.glb","keep":"^TrashCommercial$","height":1.02,"tris":1500,"maxtex":512}'
run tarpcrates '{"src":"'$P1'","out":"'$O'/tarp_crates.glb","keep":"^(Tarp|TarpCrate[1-4])$","height":1.02,"tris":2400,"maxtex":512}'
CO="$M/Construction/Construction Set 1 - Construction Site Machinery And Cabin Set/Construction Set 1.blend"
run cabin '{"src":"'$CO'","out":"'$O'/site_cabin.glb","keep":"^Portable_Cabin","height":2.9,"tris":2000,"maxtex":1024}'

# not used: Sign Set 7 (stripes lost in conversion), Crate 2 (maker name embossed), pack PostBox (real postal logo), pack Utility (broken split)
