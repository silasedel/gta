#!/bin/zsh
# Overnight props pass (Nov 17): more library street props -> public/assets/models/street/*.glb (same converter as build.sh).
#   ./tools/v2/street-models/build_props.sh [name-regex]
# Texture variants for the instanced props: tools/v2/street-models/variants.py (writes public/assets/models/street/var/).
cd "$(dirname $0)/../../.."
M="$PWD/Models"; O="$PWD/public/assets/models/street"; C=tools/v2/street-models/convert.py
only=${1:-.}
run() { [[ "$1" =~ $only ]] || return 0; blender -b --factory-startup --disable-autoexec -P $C -- "$2" 2>&1 | grep -E "CONVERTED|CONVERT-ERROR|Error|TEX" | sed "s|$PWD/||g" }
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
# cafe patio umbrella (stands in the patio table) and Street Props Pack 2 pieces for downtown sidewalks
run umbrella '{"src":"'$M'/Beach Stuff/Umbrella 3 - Cafe Patio Umbrella/Umbrella 3.blend","out":"'$O'/umbrella_cafe.glb","height":2.45,"tris":4000,"maxtex":1024}'
P2="$M/Prop Packs/Street Props Pack 2 - Town Square Signs Subway Entrance Parking Valet And Kiosks/Street Props Pack 2.blend"
run p2pot '{"src":"'$P2'","out":"'$O'/planter_pot.glb","keep":"^planter_pot$","height":0.6,"tris":1520,"maxtex":1024}'
run p2planter '{"src":"'$P2'","out":"'$O'/planter_box.glb","keep":"^planter$","height":0.76,"tris":162,"maxtex":1024}'

# not used: pack 2 trash / trash_bin0 / trash_bin1 (real waste-company logos BFI / WM in the textures)
# food cart for plaza / beach kiosk spots
run foodcart '{"src":"'$M'/Food Carts/Food Cart 1 - Red-Yellow Hot Dog Cart/Food Cart 1.blend","out":"'$O'/food_cart.glb","rotz":90,"height":2.03,"tris":6042,"maxtex":1024,"texmat":{"Hot-dog":{"color":"'$PWD'/tools/v2/street-models/fixed/foodcart_color.png"}}}'
# litter: one soda can (6 repainted labels as texture-array layers, variants.py 'can') and a paper coffee cup (sleeve repainted)
SC="$M/Bottles/Soda Can Set 1 - Six Plain Colored Soda Cans/Soda Can Set 1.blend"
run can '{"src":"'$SC'","out":"'$O'/can.glb","keep":"^Can Red Cola\\.001$","height":0.122,"tris":360,"maxtex":512,"texmat":{".":{"color":"'$PWD'/tools/v2/street-models/fixed/can_reef_cola.png"}}}'
CU="$M/Cups/Coffee Cup 1 - Red-Band Paper Cup With Lid/Coffee Cup 1.blend"
run cup '{"src":"'$CU'","out":"'$O'/cup.glb","height":0.15,"tris":700,"maxtex":256,"texmat":{"Sleeve":{"color":"'$PWD'/tools/v2/street-models/fixed/cup_sleeve.png"}}}'
# bike rack: kitbashed by tools/v2/street-models/bikerack.py from Street Props Pack 2 rail_short (see that script)
[[ "bikerack" =~ $only ]] && blender -b --factory-startup --disable-autoexec -P tools/v2/street-models/bikerack.py -- "$P2" "$O/bike_rack.glb" 2>&1 | grep CONVERTED

# r3-props (Nov 17): the user's ATM 1 (replaces the code-built kiosk in the stores). Base color texture was unlinked in the .blend, so it is named here; fixed/atm_color.png = Color.png with the real card-scheme logos painted out.
run atm '{"src":"'$M'/ATMs/ATM 1 - Plain Grey Bank ATM/ATM 1.blend","out":"'$O'/atm.glb","height":1.75,"tris":6000,"maxtex":1024,"texmat":{".":{"color":"'$PWD'/tools/v2/street-models/fixed/atm_color.png","normal":"ATM Normal.png","rough":"ATM Roughness.png","metal":"ATM Metallic.png"}}}'
