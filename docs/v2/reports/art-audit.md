# Art audit: 2026-11-17T17:16:05.875Z

Tool: `node tools/v2/art/audit.mjs` (ranges: `src/world/art/ranges.json`, guide: `docs/v2/briefs/ART_STYLE.md`).
Materials on screen: 1235. Outliers (severity >= 0.35): 263. High-visibility outliers (>= 1% of the screen in some view): **17**.

Rank = sqrt(max screen % in any view) x severity. Severity sums the distance outside each class range (albedo in stops x1.4-1.8, roughness per 0.15, metalness per 0.3, saturation per 0.15, texel density in stops x0.8).

## Outliers by owner

| owner | outliers | high visibility |
|---|---|---|
| r2-keys | 65 | 9 |
| r2-art | 62 | 5 |
| r2-veg | 78 | 2 |
| r2-roads | 3 | 1 |
| r2-cars | 7 | 0 |
| r2-cars? | 18 | 0 |
| r2-ground | 8 | 0 |
| r2-people | 21 | 0 |
| unknown | 1 | 0 |

## Ranked outliers (top 80)

| # | rank | owner | class | material | source (object chain) | albedo L / sat | rough / metal | texel px/m (map) | issues | where |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 18.23 | r2-keys | rawWood | pbr:white_planks_clean:0.9:0:0:0:::2.05: | int:pbr:white_planks_clean:0.9:0:0:0:::2.05:0/int < nh_int < | 0.675 / 0.22 | 0.525 / 0 | 1137.8 (1024x1024) | albedo 0.675 > 0.32; roughness 0.525 < 0.68 | nico:drive0 37.7%, nico:eye1 0.0%, nico:eye0 0.0% |
| 2 | 13.04 | r2-keys | rawWood | pbr:wood_table_worn:0.9:0:0:0:::1.7:0/in | int:pbr:wood_table_worn:0.9:0:0:0:::1.7:0/int < nh_int < nic | 0.026 / 0.91 | 0.724 / 0 | 4323.9 (1024x1024) | albedo 0.026 < 0.08; saturation 0.91 > 0.45 | nico:drive0 5.9%, nico:eye3 0.0%, nico:eye0 0.0% |
| 3 | 7.55 | r2-keys | generic | (unnamed) | tv_screen < nh_dyn < nicoHouse | 0.005 / 0.17 | 0.22 / 0 | 1156.8 (1024x576) | albedo 0.005 < 0.015 | nico:drive0 10.7%, nico:eye0 0.0%, nico:eye3 0.0% |
| 4 | 7.43 | r2-keys | cloth | nh:miniblind | int:nh:miniblind < nh_int < nicoHouse | 0.48 / 0.15 | 0.42 / 0 | 164.6 (32x256) | roughness 0.42 < 0.68; texel 165 px/m < 256 (map 32x256) | nico:drive0 11.0%, nico:eye3 0.0%, nico:eye1 0.0% |
| 5 | 4.52 | r2-art | concrete | pbr:scuffed_cement:1.6:0:0:0:::1.9:1 | town:Key Largo:far:pbr:scuffed_cement:1.6:0:0:0:::1.9:1 < to | 0.202 / 0.4 | 0.752 / 0 | 640 (1024x1024) | saturation 0.40 > 0.14 | rural:drive0 6.9%, rural:eye0 5.3%, rural:eye3 2.3% |
| 6 | 3.56 | r2-art | galvanized | Surface 13 | lib-casino_tower < library-buildings < miami-city | 0.109 / 0.01 | 0.902 / 1 | - (-) | albedo 0.109 < 0.4; roughness 0.902 > 0.68 | downtown:aerial 0.8%, rural:drive0 0.0% |
| 7 | 3.53 | r2-keys | cloth | pbr:fabric_leather_01:0.55:0:0:0:::1.45: | int:pbr:fabric_leather_01:0.55:0:0:0:::1.45:0/int < nh_int < | 0.042 / 0.81 | 0.644 / 0 | 3559.6 (1024x1024) | saturation 0.81 > 0.68; roughness 0.644 < 0.68 | nico:drive0 10.5%, nico:eye2 0.1%, nico:eye3 0.1% |
| 8 | 3.29 | r2-keys | rawWood | pbr:wood_floor_worn:1.5:0:0:0:14272424:: | int:pbr:wood_floor_worn:1.5:0:0:0:14272424::1.6:0/int < nh_i | 0.13 / 0.74 | 0.471 / 0 | 682.7 (1024x1024) | saturation 0.74 > 0.45; roughness 0.471 < 0.68 | nico:drive0 1.0%, nico:street 0.0%, nico:eye3 0.0% |
| 9 | 3.26 | r2-roads | galvanized | M.guardrail | tile-near--5,24{tile} | 0.017 / 0.07 | 0.4 / 0.7 | - (-) | albedo 0.017 < 0.4 | rural:drive0 0.3%, rural:eye1 0.1%, nico:eye1 0.0% |
| 10 | 3.24 | r2-art | rawWood | wood | houses:spawn:1:wood < houses | 0.247 / 0.15 | 0.511 / 0 | 2624.9 (2048x2048) | roughness 0.511 < 0.68 | nico:street 8.2%, nico:eye2 0.5%, nico:deck 0.5% |
| 11 | 2.89 | r2-veg | bark | (unnamed) | vegField_liveoak [glTF] | 0.123 / 0.46 | 0.9 / 0 | 1217.8 (256x1024) | saturation 0.46 > 0.38 | nico:drive1 26.7%, nico:eye1 0.9%, nico:eye0 0.4% |
| 12 | 2.8 | r2-keys | foliage | keys:leaves | site:keys:leaves < nh_site < nicoHouse | 0.266 / 0.21 | 0.95 / 0 | 320 (512x512) | albedo 0.266 > 0.19; roughness 0.95 > 0.82 | nico:eye1 2.6%, nico:eye2 1.8%, nico:eye0 1.2% |
| 13 | 2.68 | r2-art | building | Towers | lib-old_brick_towers [glTF] | 0.059 / 0.11 | 0.696 / 0 | 9.1 (256x256) | texel 9 px/m < 64 (map 256x256) | downtown:drive0 1.4%, airport:eye1 0.0%, airport:drive0 0.0% |
| 14 | 2.5 | r2-art | stucco | pbr:concrete_wall_008:1.4:0:0:0:::2.25:1 | houses:tile:-5_24:1:pbr:concrete_wall_008:1.4:0:0:0:::2.25:1 | 0.431 / 0.29 | 0.737 / 0 | 731.4 (1024x1024) | roughness 0.737 < 0.78; normalScale 1 > 0.8 | rural:eye2 16.2%, rural:eye1 14.5%, rural:drive1 14.2% |
| 15 | 2.39 | r2-art | building | Material | lib-deco_tower < library-buildings < miami-city [glTF] | 0.139 / 0.05 | 0.431 / 0 | 6.1 (256x64) | texel 6 px/m < 64 (map 256x64) | downtown:drive1 0.8%, downtown:eye3 0.3%, airport:eye1 0.1% |
| 16 | 2.27 | r2-art | galvanized | AIT01W2W3 | lib-grid_block < library-buildings < miami-city [glTF] | 0.15 / 0.04 | 0.859 / 1 | 39.7 (512x1024) | albedo 0.150 < 0.4; roughness 0.859 > 0.68; texel 40 px/m < 200 (map 512x1024) | downtown:eye2 0.2%, downtown:drive1 0.0%, airport:eye0 0.0% |
| 17 | 2.23 | r2-keys | rawWood | wood | ext:wood < nh_ext < nicoHouse | 0.164 / 0.19 | 0.511 / 0 | 8943.3 (2048x2048) | roughness 0.511 < 0.68 | nico:eye2 3.9%, nico:eye0 3.4%, nico:eye1 1.7% |
| 18 | 1.98 | r2-art | galvanized | tin | houses:spawn:1:tin < houses | 0.14 / 0.05 | 0.709 / 1 | 750.3 (1024x1024) | albedo 0.140 < 0.4; roughness 0.709 > 0.68 | nico:eye0 0.7%, nico:deck 0.6%, nico:eye1 0.5% |
| 19 | 1.93 | r2-keys | galvanized | (unnamed) | nh_ext < nicoHouse | 0.067 / 0.41 | 0.85 / 0.5 | 30398.9 (1024x1024) | albedo 0.067 < 0.4; saturation 0.41 > 0.08; roughness 0.85 > 0.68; metalness 0.5 < 0.75 | nico:eye0 0.1%, nico:eye1 0.0%, nico:eye2 0.0% |
| 20 | 1.91 | r2-cars | generic | (unnamed) |  | 0.218 / 0.18 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:eye3 0.9%, nico:eye0 0.4%, nico:eye2 0.2% |
| 21 | 1.59 | r2-keys | galvanized | tin | ext:tin < nh_ext < nicoHouse | 0.165 / 0.31 | 0.709 / 1 | 514.3 (1024x1024) | albedo 0.165 < 0.4; saturation 0.31 > 0.08; roughness 0.709 > 0.68 | nico:drive1 0.2%, nico:eye2 0.2%, nico:street 0.1% |
| 22 | 1.53 | r2-art | building | Main Body | lib-old_brick_towers [glTF] | 0.178 / 0.03 | 0.886 / 0 | 16.7 (256x256) | texel 17 px/m < 64 (map 256x256) | downtown:drive0 1.0%, airport:eye1 0.0%, airport:drive0 0.0% |
| 23 | 1.48 | r2-art | stucco | pbr:coral_stone_wall:1.2:0:0:0:::1.6:1 | town:Key Largo:far:pbr:coral_stone_wall:1.2:0:0:0:::1.6:1 <  | 0.321 / 0.28 | 0.734 / 0 | 853.3 (1024x1024) | roughness 0.734 < 0.78; normalScale 1 > 0.8 | rural:eye2 5.4%, rural:drive1 4.7%, rural:eye3 2.4% |
| 24 | 1.46 | r2-art | building | OldHangar M | lib-hangar_arch < library-buildings < miami-city [glTF] | 0.064 / 0.13 | 0.571 / 0.033 | 7.2 (256x256) | texel 7 px/m < 64 (map 256x256) | airport:eye1 0.3%, airport:drive0 0.2% |
| 25 | 1.45 | r2-art | building | Gltfnode111Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.418 / 0.02 | 0.2 / 0 | 29.4 (1024x1024) | roughness 0.2 < 0.3; texel 29 px/m < 64 (map 1024x1024) | airport:apron 0.9%, airport:eye1 0.7%, airport:eye0 0.6% |
| 26 | 1.39 | r2-roads | concrete | M.sidewalk | tile-near--5,24{tile} | 0.146 / 0.13 | 0.816 / 0 | 662.2 (2048x2048) | albedo 0.146 < 0.2 | rural:drive0 4.9%, rural:eye3 4.2%, rural:eye1 4.2% |
| 27 | 1.14 | r2-art | galvanized | B Hotr04 W2W7 T2 L1 | lib-stepped_midrise < library-buildings < miami-city [glTF] | 0.204 / 0.13 | 0.859 / 1 | 28 (512x1024) | albedo 0.204 < 0.4; saturation 0.13 > 0.08; roughness 0.859 > 0.68; texel 28 px/m < 200 (map 512x1024) | airport:eye0 0.0%, beach:drive1 0.0%, beach:eye3 0.0% |
| 28 | 1.13 | r2-keys | galvanized | boombox | carport:boombox < nh_detail < nicoHouse [glTF] | 0.209 / 0.39 | 0.479 / 0.934 | 483.8 (512x512) | albedo 0.209 < 0.4; saturation 0.39 > 0.08; normalScale 1 > 0.6 | nico:eye2 0.1%, nico:eye1 0.0%, nico:eye0 0.0% |
| 29 | 1.1 | r2-cars | generic | (unnamed) |  | 0.253 / 0.17 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:eye2 0.3%, downtown:drive0 0.1%, nico:eye0 0.0% |
| 30 | 1.09 | r2-art | brick | house:brick | town:Key Largo:far:house:brick < town:Key Largo:far < towns | 0.421 / 0.17 | 0.88 / 0 | 320 (512x512) | albedo 0.421 > 0.26 | rural:eye2 0.8%, rural:eye1 0.4%, rural:drive1 0.2% |
| 31 | 0.98 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.232 / 0.26 | 0.72 / 0 | 418.6 (1024x1011) | albedo 0.232 > 0.19 | beach:drive1 3.5%, beach:drive0 2.9%, beach:ocean 0.3% |
| 32 | 0.98 | r2-keys | galvanized | adjustable_wrench | carport:adjustable_wrench < nh_detail < nicoHouse [glTF] | 0.248 / 0.39 | 0.433 / 0.766 | 1014.9 (256x256) | albedo 0.248 < 0.4; saturation 0.39 > 0.08; normalScale 1 > 0.6 | nico:eye1 0.1%, nico:eye0 0.0%, nico:eye2 0.0% |
| 33 | 0.95 | r2-keys | rubber | fin:rubber/int | int:fin:rubber/int < nh_int < nicoHouse | 0.147 / 0.37 | 0.667 / 0 | - (-) | albedo 0.147 > 0.06; saturation 0.37 > 0.2; roughness 0.667 < 0.72 | nico:drive0 0.1%, nico:eye1 0.0%, nico:eye2 0.0% |
| 34 | 0.93 | r2-keys | plastic | fin:plasticGloss/int | int:fin:plasticGloss/int < nh_int < nicoHouse | 0.129 / 0.19 | 0.225 / 0 | - (-) | roughness 0.225 < 0.28 | nico:drive0 6.3%, nico:eye1 0.0%, nico:street 0.0% |
| 35 | 0.9 | r2-keys | concrete | pbr:scuffed_cement:2.2:0:0:0:::2:1 | site:pbr:scuffed_cement:2.2:0:0:0:::2:1 < nh_site < nicoHous | 0.134 / 0.45 | 0.752 / 0 | 878 (1024x1024) | albedo 0.134 < 0.2; saturation 0.45 > 0.14 | nico:eye2 0.1%, nico:drive1 0.0%, nico:street 0.0% |
| 36 | 0.86 | r2-keys | galvanized | (unnamed) | roofScrews < nh_detail < nicoHouse | 0.229 / 0.36 | 0.75 / 0.5 | - (-) | albedo 0.229 < 0.4; saturation 0.36 > 0.08; roughness 0.75 > 0.68; metalness 0.5 < 0.75 | nico:eye1 0.0%, nico:eye3 0.0%, nico:eye2 0.0% |
| 37 | 0.82 | r2-roads | foliage | tree-grate |  | 0.087 / 0.13 | 0.62 / 0.55 | - (-) | metalness 0.55 > 0.02 | downtown:eye0 0.2%, downtown:drive0 0.2%, downtown:eye3 0.1% |
| 38 | 0.78 | r2-art | building | Jetway | lib-jet_bridge < library-buildings < miami-city [glTF] | 0.229 / 0.04 | 0.37 / 0.145 | 30.7 (1024x1024) | texel 31 px/m < 64 (map 1024x1024) | airport:apron 0.8%, airport:eye3 0.2% |
| 39 | 0.77 | r2-cars? | galvanized | (unnamed) |  | 0.239 / 0.45 | 0.28 / 1 | - (-) | albedo 0.239 < 0.4; saturation 0.45 > 0.08; roughness 0.28 < 0.32 | nico:eye3 0.0%, nico:eye0 0.0%, nico:street 0.0% |
| 40 | 0.76 | r2-keys | sand | lambis_shell | carport:lambis_shell < nh_detail < nicoHouse [glTF] | 0.238 / 0.37 | 0.407 / 0.163 | 1057.7 (256x256) | saturation 0.37 > 0.18; roughness 0.407 < 0.85; metalness 0.163 > 0.02 | nico:eye2 0.0%, nico:street 0.0%, nico:eye0 0.0% |
| 41 | 0.75 | r2-art | building | Material | lib-deco_tower < library-buildings < miami-city [glTF] | 0.13 / 0.04 | 0.431 / 0 | 27.4 (1024x256) | texel 27 px/m < 64 (map 1024x256) | downtown:eye1 0.6%, downtown:drive0 0.0%, downtown:eye2 0.0% |
| 42 | 0.75 | r2-art | building | AirTower01MAT | lib-control_tower < library-buildings < miami-city [glTF] | 0.172 / 0.07 | 0.673 / 0.062 | 22.7 (2048x2048) | texel 23 px/m < 64 (map 2048x2048) | airport:eye1 0.4%, airport:drive0 0.3% |
| 43 | 0.74 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.145 / 0.08 | 0.9 / 0 | 93 (64x1024) | texel 93 px/m < 200 (map 64x1024) | downtown:eye3 0.7%, downtown:drive1 0.5%, downtown:eye1 0.5% |
| 44 | 0.71 | r2-keys | stone | pbr:long_white_tiles:0.55:0:0:0:::1.05:0 | int:pbr:long_white_tiles:0.55:0:0:0:::1.05:0/int < nh_int <  | 0.271 / 0.18 | 0.243 / 0 | 1861.8 (1024x1024) | roughness 0.243 < 0.7 | nico:eye3 0.1%, nico:eye1 0.0%, nico:eye0 0.0% |
| 45 | 0.7 | r2-keys | stucco | pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 | ext:pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 < nh_ext < nicoH | 0.271 / 0.27 | 0.737 / 0 | 1281.5 (1024x1024) | albedo 0.271 < 0.28; roughness 0.737 < 0.78; normalScale 1 > 0.8 | nico:eye1 1.0%, nico:eye2 0.7%, nico:eye0 0.0% |
| 46 | 0.67 | r2-cars | rubber | old_tyre | carport:old_tyre < nh_detail < nicoHouse [glTF] | 0.249 / 0.27 | 0.814 / 0 | 415.1 (512x512) | albedo 0.249 > 0.06; saturation 0.27 > 0.2 | nico:eye1 0.0%, nico:eye2 0.0%, nico:eye0 0.0% |
| 47 | 0.67 | r2-art | galvanized | Gltfnode521Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.465 / 0.04 | 0.3 / 0.813 | 34.8 (512x512) | roughness 0.3 < 0.32; texel 35 px/m < 200 (map 512x512) | airport:apron 0.1%, airport:eye0 0.1% |
| 48 | 0.61 | r2-keys | hair | plants:bark_brown_02 | plants:limbs < nh_ext < nicoHouse | 0.134 / 0.34 | 0.935 / 0 | 5254.4 (1024x1024) | roughness 0.935 > 0.75 | nico:eye3 0.2%, nico:eye1 0.2%, nico:eye0 0.1% |
| 49 | 0.6 | r2-keys | concrete | keys:dockPile | keysLots:piles < keysLots | 0.227 / 0.3 | 0.95 / 0 | - (-) | saturation 0.30 > 0.14 | nico:eye2 0.3%, nico:street 0.3%, nico:drive1 0.2% |
| 50 | 0.58 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.289 / 0.03 | 0.72 / 0 | 616.5 (1024x1024) | albedo 0.289 > 0.19 | beach:eye1 0.3%, beach:eye2 0.2% |
| 51 | 0.56 | r2-art | stucco | pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 | houses:spawn:1:pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 < hou | 0.302 / 0.27 | 0.737 / 0 | 709.4 (1024x1024) | roughness 0.737 < 0.78; normalScale 1 > 0.8 | rural:eye1 0.8%, rural:eye2 0.7%, rural:eye0 0.6% |
| 52 | 0.51 | r2-art | galvanized | Gltfnode01Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.192 / 0.06 | 1 / 1 | 113.4 (1024x1024) | albedo 0.192 < 0.4; roughness 1 > 0.68; texel 113 px/m < 200 (map 1024x1024) | airport:eye0 0.0%, airport:apron 0.0%, airport:eye2 0.0% |
| 53 | 0.5 | r2-keys | rustyMetal | pbr:rusty_metal_02:0.8:0:0.7:0::::0 | detail:pbr:rusty_metal_02:0.8:0:0.7:0::::0 < nh_detail < nic | 0.257 / 0.29 | 0.423 / 0.7 | 3070.6 (1024x1024) | albedo 0.257 > 0.2; roughness 0.423 < 0.72; metalness 0.7 > 0.35 | nico:eye2 0.0%, nico:eye1 0.0%, nico:eye3 0.0% |
| 54 | 0.5 | r2-veg | foliage | (unnamed) | vegField_coconut [glTF] | 0.455 / 0.31 | 0.72 / 0 | 310.4 (595x1024) | albedo 0.455 > 0.19 | nico:street 0.0%, airport:apron 0.0% |
| 55 | 0.5 | r2-art | glass | Windows | lib-old_brick_towers [glTF] | 0.26 / 0.03 | 0.1 / 0 | 34.1 (256x256) | albedo 0.260 > 0.1; texel 34 px/m < 64 (map 256x256) | airport:eye1 0.0%, beach:drive1 0.0%, downtown:drive0 0.0% |
| 56 | 0.48 | r2-cars? | glass | sig-lens-lens_a |  | 0.123 / 0.73 | 0.18 / 0 | - (-) | albedo 0.123 > 0.1; saturation 0.73 > 0.3; roughness 0.18 > 0.16 | nico:eye2 0.0%, nico:drive1 0.0%, nico:street 0.0% |
| 57 | 0.48 | r2-keys | stucco | pbr:concrete_wall_008:2.4:0:0:0:::2.3:1 | ext:pbr:concrete_wall_008:2.4:0:0:0:::2.3:1 < nh_ext < nicoH | 0.35 / 0.23 | 0.737 / 0 | 808.9 (1024x1024) | roughness 0.737 < 0.78; normalScale 1 > 0.8 | nico:eye2 0.6%, nico:street 0.0% |
| 58 | 0.47 | r2-ground | grass | groundGrass:green | groundGrass:green < groundGrass | 0.393 / 0.15 | 0.88 / 0 | - (-) | albedo 0.393 > 0.2 | rural:eye0 0.1%, rural:eye1 0.1%, rural:drive1 0.1% |
| 59 | 0.45 | r2-keys | galvanized | boombox_speakers | carport:boombox_speakers < nh_detail < nicoHouse [glTF] | 0.267 / 0.3 | 0.254 / 0.515 | 1775.6 (512x512) | albedo 0.267 < 0.4; saturation 0.30 > 0.08; roughness 0.254 < 0.32; metalness 0.515 < 0.75 | nico:eye1 0.0%, nico:eye3 0.0%, nico:eye0 0.0% |
| 60 | 0.45 | r2-art | galvanized | crow3_black_Crowbar | body < lib-crow3_black < weapon-crowbar{weapon,lib,libInfo}  [glTF] | 0.092 / 0.28 | 0.385 / 0.502 | 2186.4 (1024x1024) | albedo 0.092 < 0.4; saturation 0.28 > 0.08; metalness 0.502 < 0.75; normalScale 1 > 0.6 | rural:eye0 0.0%, rural:drive0 0.0%, beach:ocean 0.0% |
| 61 | 0.44 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.311 / 0.02 | 0.72 / 0 | 436.2 (1024x1011) | albedo 0.311 > 0.19 | beach:eye2 0.1% |
| 62 | 0.42 | r2-keys | chrome | fin:chrome/int | int:fin:chrome/int < nh_int < nicoHouse | 0.236 / 0.33 | 0.098 / 1 | - (-) | albedo 0.236 < 0.5; saturation 0.33 > 0.08 | nico:eye1 0.0%, nico:eye0 0.0%, nico:eye2 0.0% |
| 63 | 0.42 | r2-art | glass | Translucent Glass Gray | lib-graffiti_shop < library-buildings < miami-city | 0.283 / 0.17 | 0.1 / 0 | - (-) | albedo 0.283 > 0.1 | beach:drive1 0.0%, beach:eye3 0.0%, airport:eye1 0.0% |
| 64 | 0.42 | r2-art | galvanized | Gltfnode121Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.127 / 0.02 | 0.3 / 1 | 121 (128x128) | albedo 0.127 < 0.4; roughness 0.3 < 0.32; texel 121 px/m < 200 (map 128x128) | airport:apron 0.0%, airport:eye0 0.0% |
| 65 | 0.41 | r2-art | galvanized | r3_slim_Material0 | body < lib-r3_slim < weapon-carbine{weapon,lib,libInfo} < {w [glTF] | 0.233 / 0.43 | 0.445 / 0.995 | 1575.7 (1024x1024) | albedo 0.233 < 0.4; saturation 0.43 > 0.08; normalScale 1 > 0.6 | nico:eye1 0.0%, nico:street 0.0%, nico:eye2 0.0% |
| 66 | 0.4 | r2-ground | foliage | groundGrass:green | groundGrass:green < groundGrass [glTF] | 0.298 / 0.15 | 0.88 / 0 | 3002.9 (1024x1024) | albedo 0.298 > 0.19; roughness 0.88 > 0.82 | rural:eye3 0.1%, rural:eye0 0.1%, rural:eye1 0.0% |
| 67 | 0.4 | r2-ground | grass | groundGrass:dry | groundGrass:dry < groundGrass | 0.313 / 0.05 | 0.88 / 0 | - (-) | albedo 0.313 > 0.2 | rural:drive1 0.1%, rural:eye3 0.1%, rural:eye2 0.1% |
| 68 | 0.39 | r2-cars | generic | (unnamed) |  | 0.224 / 0.05 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:eye1 0.0%, nico:deck 0.0%, nico:eye2 0.0% |
| 69 | 0.39 | r2-people | galvanized | (unnamed) | metal < cc21 | 0.215 / 0.35 | 0.25 / 1 | - (32x1) | albedo 0.215 < 0.4; saturation 0.35 > 0.08; roughness 0.25 < 0.32 | nico:eye2 0.0%, nico:street 0.0% |
| 70 | 0.39 | r2-cars? | galvanized | (unnamed) |  | 0.17 / 0.38 | 0.141 / 0.7 | - (-) | albedo 0.170 < 0.4; saturation 0.38 > 0.08; roughness 0.141 < 0.32; metalness 0.7 < 0.75 | rural:eye3 0.0%, rural:eye0 0.0%, beach:eye1 0.0% |
| 71 | 0.38 | r2-cars? | generic | (unnamed) |  | 0.96 / 0.05 | 0.35 / 0 | - (512x128) | albedo 0.960 > 0.82 | nico:eye0 0.9%, nico:eye1 0.1%, nico:eye2 0.0% |
| 72 | 0.37 | r2-keys | galvanized | (unnamed) | deckScrews < nh_detail < nicoHouse | 0.217 / 0.42 | 0.7 / 0.6 | - (-) | albedo 0.217 < 0.4; saturation 0.42 > 0.08; roughness 0.7 > 0.68; metalness 0.6 < 0.75 | nico:eye1 0.0%, nico:eye2 0.0%, nico:eye0 0.0% |
| 73 | 0.36 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.286 / 0.24 | 0.72 / 0 | 561 (1024x1024) | albedo 0.286 > 0.19 | rural:eye3 0.1%, rural:eye0 0.0%, beach:eye0 0.0% |
| 74 | 0.36 | r2-art | galvanized | Surface 5 | lib-casino_tower < library-buildings < miami-city [glTF] | 0.167 / 0.52 | 0.956 / 1 | 232.1 (64x128) | albedo 0.167 < 0.4; saturation 0.52 > 0.08; roughness 0.956 > 0.68 | rural:eye2 0.0%, rural:drive1 0.0%, rural:drive0 0.0% |
| 75 | 0.35 | r2-cars | generic | (unnamed) |  | 0.283 / 0.17 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:deck 0.0%, nico:eye1 0.0%, airport:eye2 0.0% |
| 76 | 0.35 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.132 / 0.56 | 0.9 / 0 | 197.7 (128x1024) | saturation 0.56 > 0.38 | downtown:eye3 0.1%, downtown:drive1 0.1%, downtown:eye2 0.1% |
| 77 | 0.34 | r2-art | paintedWood | Door Details | miami-city [glTF] | 0.121 / 0.73 | 0.745 / 0.006 | 5587.9 (1024x1024) | albedo 0.121 < 0.22; saturation 0.73 > 0.45 | nico:eye2 0.0%, nico:drive1 0.0%, downtown:eye1 0.0% |
| 78 | 0.34 | r2-keys | plastic | Plastic | keysDockBoats < nh_dockFrame < nh_site < nicoHouse [glTF] | 0.048 / 0.31 | 0.439 / 0 | 122.3 (1024x1024) | normalScale 1 > 0.6; texel 122 px/m < 128 (map 1024x1024) | nico:eye1 0.2%, nico:eye3 0.0% |
| 79 | 0.34 | r2-ground | foliage | groundGrass:dry | groundGrass:dry < groundGrass [glTF] | 0.28 / 0.1 | 0.88 / 0 | 3085.4 (1024x1024) | albedo 0.280 > 0.19; roughness 0.88 > 0.82 | rural:eye0 0.1%, rural:drive1 0.1%, rural:eye3 0.0% |
| 80 | 0.34 | r2-art | galvanized | Part | lib-casino_tower < library-buildings < miami-city [glTF] | 0.142 / 0.46 | 0.912 / 1 | 233.9 (256x256) | albedo 0.142 < 0.4; saturation 0.46 > 0.08; roughness 0.912 > 0.68 | rural:eye2 0.0%, rural:drive1 0.0%, rural:eye3 0.0% |

## Views

- nico:deck: 291 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_deck.jpg`
- nico:street: 367 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_street.jpg`
- nico:eye0: 319 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_eye0.jpg`
- nico:eye1: 437 materials, sky 1%, `docs/v2/shots/art/audit/base_nico_eye1.jpg`
- nico:eye2: 382 materials, sky 2%, `docs/v2/shots/art/audit/base_nico_eye2.jpg`
- nico:eye3: 245 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_eye3.jpg`
- nico:drive0: 18 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_drive0.jpg`
- nico:drive1: 211 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_drive1.jpg`
- downtown:aerial: 72 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_aerial.jpg`
- downtown:eye0: 40 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye0.jpg`
- downtown:eye1: 122 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye1.jpg`
- downtown:eye2: 78 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye2.jpg`
- downtown:eye3: 85 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye3.jpg`
- downtown:drive0: 102 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_drive0.jpg`
- downtown:drive1: 84 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_drive1.jpg`
- beach:ocean: 180 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_ocean.jpg`
- beach:eye0: 127 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_eye0.jpg`
- beach:eye1: 213 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_eye1.jpg`
- beach:eye2: 155 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_eye2.jpg`
- beach:eye3: 120 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_eye3.jpg`
- beach:drive0: 171 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_drive0.jpg`
- beach:drive1: 146 materials, sky 0%, `docs/v2/shots/art/audit/base_beach_drive1.jpg`
- rural:eye0: 251 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye0.jpg`
- rural:eye1: 121 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye1.jpg`
- rural:eye2: 84 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye2.jpg`
- rural:eye3: 205 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye3.jpg`
- rural:drive0: 263 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_drive0.jpg`
- rural:drive1: 216 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_drive1.jpg`
- airport:apron: 21 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_apron.jpg`
- airport:eye0: 58 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_eye0.jpg`
- airport:eye1: 115 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_eye1.jpg`
- airport:eye2: 149 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_eye2.jpg`
- airport:eye3: 16 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_eye3.jpg`
- airport:drive0: 119 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_drive0.jpg`
- airport:drive1: 99 materials, sky 0%, `docs/v2/shots/art/audit/base_airport_drive1.jpg`

## Console errors

- LOG Failed to load resource: the server responded with a status of 404 (Not Found) http://127.0.0.1:5200/favicon.ico
