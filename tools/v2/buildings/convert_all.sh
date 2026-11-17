S="$(cd "$(dirname "$0")" && pwd)"
M="/Users/silasedel/Downloads/Apps_Games/GTA 6/Southline/Models/Buildings"
O="$(cd "$(dirname "$0")/../../.." && pwd)/public/assets/models/buildings"
c() { blender -b --python $S/convert_models.py -- "$M/$1" "$O/$2.glb" $3 $4 "$5" "$6" 2>&1 | grep -E "CONV|Error|error" | head -3; }
c "Building 9 - Tall Podium Skyscraper/Building 9.fbx" podium_tower 0 1024
c "Building 10 - Slim Residential High-Rise/Building 10.fbx" slim_residential 0 1024
c "Building 14 - Tall Dark Office Tower With Red Top Band/Building 14.glb" red_band_tower 0 1024
c "Building 13 - Slim Curved Glass Skyscraper/Building 13.fbx" curved_glass_tower 40000 1024 "Interior|Furniture|Blinds|Sidewalk|Flare|Color_Pallete|Curtains|Lobby_Floor"
c "Building 1 - Brick Suburban Cottage/Building 1.glb" brick_cottage 0 1024
c "Building 16 - Blue Two-Story Suburban House With Garage/Building 16.glb" blue_house 0 1024
c "Building 3 - Two-Story Brick Duplex/Building 3.glb" brick_duplex 14000 1024
c "Building 4 - Flat-Roof Graffiti Shop/Building 4.glb" graffiti_shop 0 1024 "" "Asphalt"
c "Building 5 - Rundown Stilt House With Rusty Roof/Building 5.glb" stilt_shack 16000 1024
c "Building 2 - Long Mossy Warehouse Row/Building 2.glb" garage_row 8000 1024
c "Building 15 - Curved Spiral Casino Tower On Plaza/Building 15.fbx" casino_tower 120000 1024 "PEN_MATERIAL"
