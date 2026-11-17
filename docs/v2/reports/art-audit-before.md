# Art audit (before): 2026-11-17T16:57:26.524Z

Tool: `node tools/v2/art/audit.mjs` (ranges: `src/world/art/ranges.json`, guide: `docs/v2/briefs/ART_STYLE.md`).
Materials on screen: 1258. Outliers (severity >= 0.35): 278. High-visibility outliers (>= 1% of the screen in some view): **13**.

Rank = sqrt(max screen % in any view) x severity. Severity sums the distance outside each class range (albedo in stops x1.4-1.8, roughness per 0.15, metalness per 0.3, saturation per 0.15, texel density in stops x0.8).

## Outliers by owner

| owner | outliers | high visibility |
|---|---|---|
| r2-art | 69 | 6 |
| r2-veg | 102 | 3 |
| r2-keys | 50 | 3 |
| r2-roads | 5 | 1 |
| r2-cars | 13 | 0 |
| r2-ground | 8 | 0 |
| r2-cars? | 19 | 0 |
| unknown | 3 | 0 |
| r2-people | 9 | 0 |

## Ranked outliers (top 80)

| # | rank | owner | class | material | source (object chain) | albedo L / sat | rough / metal | texel px/m (map) | issues | where |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3.95 | r2-art | concrete | pbr:scuffed_cement:1.6:0:0:0:::1.9:1 | town:Homestead:far:pbr:scuffed_cement:1.6:0:0:0:::1.9:1 < to | 0.203 / 0.4 | 0.752 / 0 | 640 (1024x1024) | saturation 0.40 > 0.14 | rural:eye0 5.2%, rural:eye3 2.3%, rural:drive1 0.0% |
| 2 | 3.24 | r2-art | rawWood | wood | houses:spawn:1:wood < houses | 0.251 / 0.13 | 0.511 / 0 | 2624.9 (2048x2048) | roughness 0.511 < 0.68 | nico:street 8.2%, nico:eye2 0.5%, nico:eye0 0.2% |
| 3 | 3.03 | r2-art | generic | Material | lib-deco_tower [glTF] | 0.17 / 0.14 | 0.431 / 0 | 6.9 (256x64) | texel 7 px/m < 96 (map 256x64) | downtown:drive1 1.0%, downtown:eye3 0.3%, airport:eye1 0.1% |
| 4 | 2.74 | r2-veg | bark | (unnamed) | vegField_liveoak [glTF] | 0.123 / 0.46 | 0.9 / 0 | 1217.8 (256x1024) | saturation 0.46 > 0.38 | nico:drive1 26.7%, nico:eye0 0.4%, nico:street 0.0% |
| 5 | 2.73 | r2-art | paintedWood | Door | lib-ranch_house < library-buildings < miami-city [glTF] | 0.047 / 0.06 | 0.5 / 0 | 162.4 (301x1024) | albedo 0.047 < 0.22; texel 162 px/m < 200 (map 301x1024) | airport:eye1 0.7%, airport:drive0 0.4% |
| 6 | 2.6 | r2-keys | stucco | pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 | ext:pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 < nh_ext < nicoH | 0.13 / 0.57 | 0.737 / 0 | 1281.5 (1024x1024) | albedo 0.130 < 0.28; saturation 0.57 > 0.42; roughness 0.737 < 0.78; normalScale 1 > 0.8 | nico:eye2 0.7%, nico:eye0 0.0%, nico:street 0.0% |
| 7 | 2.5 | r2-art | stucco | pbr:concrete_wall_008:1.4:0:0:0:::2.25:1 | houses:tile:-5_24:1:pbr:concrete_wall_008:1.4:0:0:0:::2.25:1 | 0.431 / 0.29 | 0.737 / 0 | 731.4 (1024x1024) | roughness 0.737 < 0.78; normalScale 1 > 0.8 | rural:eye2 16.2%, rural:drive1 14.2%, rural:eye0 7.2% |
| 8 | 2.28 | r2-keys | sand | ground:pbr:shell_floor_01:2.6:0:0:0:::1. | dockSite:ground:pbr:shell_floor_01:2.6:0:0:0:::1.5:1 < nh_do | 0.236 / 0.27 | 0.967 / 0 | 856.7 (2048x2048) | saturation 0.27 > 0.18 | nico:eye2 14.0%, nico:street 8.8%, nico:eye0 8.7% |
| 9 | 2.23 | r2-keys | rawWood | wood | ext:wood < nh_ext < nicoHouse | 0.175 / 0.19 | 0.511 / 0 | 8943.3 (2048x2048) | roughness 0.511 < 0.68 | nico:eye2 3.9%, nico:eye0 3.4%, nico:eye3 1.0% |
| 10 | 2.17 | r2-art | galvanized | sig-pole | miami-city | 0.081 / 0.02 | 0.5 / 0.35 | - (-) | albedo 0.081 < 0.4 | downtown:eye2 0.5%, beach:eye2 0.0%, downtown:drive1 0.0% |
| 11 | 2.13 | r2-art | generic | Material | lib-deco_tower < library-buildings < miami-city [glTF] | 0.111 / 0.12 | 0.431 / 0 | 27.4 (1024x256) | texel 27 px/m < 96 (map 1024x256) | downtown:aerial 2.1% |
| 12 | 2.1 | r2-art | galvanized | tin | houses:spawn:1:tin < houses | 0.138 / 0.09 | 0.709 / 1 | 750.3 (1024x1024) | albedo 0.138 < 0.4; saturation 0.09 > 0.08; roughness 0.709 > 0.68 | nico:eye0 0.7%, nico:eye2 0.1%, nico:drive1 0.1% |
| 13 | 2.02 | r2-art | galvanized | AIT01W2W3 | lib-grid_block [glTF] | 0.085 / 0.04 | 0.859 / 1 | 36.8 (512x1024) | albedo 0.085 < 0.4; roughness 0.859 > 0.68; texel 37 px/m < 200 (map 512x1024) | downtown:eye2 0.1%, downtown:aerial 0.1%, downtown:drive1 0.0% |
| 14 | 1.9 | r2-cars | generic | (unnamed) |  | 0.132 / 0.21 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:eye3 0.9%, nico:eye0 0.4%, nico:eye2 0.2% |
| 15 | 1.77 | r2-art | galvanized | Coated Metal | miami-city [glTF] | 0.226 / 0.5 | 0.254 / 0 | 3448.5 (1024x1024) | albedo 0.226 < 0.4; saturation 0.50 > 0.08; roughness 0.254 < 0.32; metalness 0 < 0.75; normalScale 1 > 0.6 | nico:eye0 0.1%, nico:eye3 0.0%, nico:street 0.0% |
| 16 | 1.73 | r2-keys | galvanized | tin | ext:tin < nh_ext < nicoHouse | 0.169 / 0.36 | 0.709 / 1 | 514.3 (1024x1024) | albedo 0.169 < 0.4; saturation 0.36 > 0.08; roughness 0.709 > 0.68 | nico:eye2 0.2%, nico:drive1 0.2%, nico:street 0.1% |
| 17 | 1.68 | r2-art | generic | OldHangar M | lib-hangar_arch < library-buildings < miami-city [glTF] | 0.059 / 0.14 | 0.571 / 0.033 | 7.7 (256x256) | texel 8 px/m < 96 (map 256x256) | airport:eye1 0.3%, airport:drive0 0.2% |
| 18 | 1.67 | r2-keys | galvanized | metal_toolbox | carport:metal_toolbox < nh_detail < nicoHouse [glTF] | 0.239 / 0.42 | 0.434 / 0.076 | 461.5 (512x512) | albedo 0.239 < 0.4; saturation 0.42 > 0.08; metalness 0.076 < 0.75; normalScale 1 > 0.6 | nico:eye0 0.1%, nico:eye2 0.0%, nico:eye3 0.0% |
| 19 | 1.56 | r2-ground | sand | sand:fine | miami-city | 0.146 / 0.31 | 0.96 / 0 | - (-) | albedo 0.146 < 0.22; saturation 0.31 > 0.18 | beach:drive0 0.8%, beach:eye1 0.5%, beach:ocean 0.1% |
| 20 | 1.48 | r2-art | stucco | pbr:coral_stone_wall:1.2:0:0:0:::1.6:1 | town:Homestead:far:pbr:coral_stone_wall:1.2:0:0:0:::1.6:1 <  | 0.321 / 0.28 | 0.734 / 0 | 853.3 (1024x1024) | roughness 0.734 < 0.78; normalScale 1 > 0.8 | rural:eye2 5.4%, rural:drive1 4.7%, rural:eye3 2.4% |
| 21 | 1.37 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.252 / 0.23 | 0.72 / 0 | 302.5 (595x1024) | albedo 0.252 > 0.19 | beach:drive1 3.5%, beach:drive0 3.0%, beach:ocean 0.3% |
| 22 | 1.36 | r2-art | generic | Roof | lib-old_brick_towers [glTF] | 0.157 / 0.24 | 0.763 / 0 | 8.1 (256x256) | texel 8 px/m < 96 (map 256x256) | downtown:drive1 0.2%, beach:drive1 0.0%, airport:drive0 0.0% |
| 23 | 1.33 | r2-keys | concrete | pbr:scuffed_cement:2.2:0:0:0:::2:1 | site:pbr:scuffed_cement:2.2:0:0:0:::2:1 < nh_site < nicoHous | 0.12 / 0.62 | 0.752 / 0 | 878 (1024x1024) | albedo 0.120 < 0.2; saturation 0.62 > 0.14 | nico:eye2 0.1%, nico:drive1 0.0%, nico:street 0.0% |
| 24 | 1.33 | r2-art | brick | house:brick | town:Homestead:far:house:brick < town:Homestead:far < towns | 0.468 / 0.18 | 0.88 / 0 | 320 (512x512) | albedo 0.468 > 0.26 | rural:eye2 0.8%, rural:drive1 0.2%, rural:eye3 0.0% |
| 25 | 1.31 | r2-roads | concrete | elevated-concrete | conc < elevated_-5_23 < tile-near--5,23{tile} | 0.123 / 0.29 | 0.92 / 0 | - (-) | albedo 0.123 < 0.2; saturation 0.29 > 0.14 | downtown:aerial 0.4%, nico:street 0.1%, downtown:eye3 0.0% |
| 26 | 1.3 | r2-keys | foliage | keys:leaves | site:keys:leaves < nh_site < nicoHouse | 0.197 / 0.35 | 0.95 / 0 | 320 (512x512) | albedo 0.197 > 0.19; roughness 0.95 > 0.82 | nico:eye2 1.8%, nico:eye0 1.3%, nico:eye3 1.0% |
| 27 | 1.29 | r2-roads | concrete | M.sidewalk | tile-near--5,24{tile} | 0.146 / 0.13 | 0.816 / 0 | 662.2 (2048x2048) | albedo 0.146 < 0.2 | rural:eye3 4.2%, rural:eye0 3.2%, rural:eye2 3.1% |
| 28 | 1.28 | r2-art | generic | Gltfnode111Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.673 / 0.03 | 0.2 / 0 | 29.4 (1024x1024) | texel 29 px/m < 96 (map 1024x1024) | airport:apron 0.9% |
| 29 | 1.25 | r2-roads | galvanized | M.guardrail | tile-near--5,24{tile} | 0.02 / 0.06 | 0.4 / 0.7 | - (-) | albedo 0.020 < 0.4 | rural:eye3 0.0%, rural:drive1 0.0%, nico:eye2 0.0% |
| 30 | 1.21 | r2-keys | stone | pbr:long_white_tiles:1.8:0:0:0:::1.5:0/i | int:pbr:long_white_tiles:1.8:0:0:0:::1.5:0/int < nh_int < ni | 0.186 / 0.44 | 0.243 / 0 | 1425.7 (1024x1024) | saturation 0.44 > 0.3; roughness 0.243 < 0.7 | nico:eye2 0.1%, nico:eye0 0.1%, nico:street 0.0% |
| 31 | 1.2 | r2-art | generic | Jetway | lib-jet_bridge < library-buildings < miami-city [glTF] | 0.226 / 0.04 | 0.37 / 0.145 | 30.7 (1024x1024) | texel 31 px/m < 96 (map 1024x1024) | airport:apron 0.8%, airport:eye3 0.2% |
| 32 | 1.18 | r2-art | galvanized | AIT01W2W3 | lib-grid_block < library-buildings < miami-city [glTF] | 0.062 / 0.05 | 0.859 / 1 | 33.7 (512x1024) | albedo 0.062 < 0.4; roughness 0.859 > 0.68; texel 34 px/m < 200 (map 512x1024) | airport:drive0 0.0%, airport:eye1 0.0% |
| 33 | 1.12 | r2-cars | generic | (unnamed) |  | 0.268 / 0.16 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:eye2 0.3%, nico:street 0.1%, beach:drive1 0.0% |
| 34 | 1.08 | r2-art | rawWood | Wooden Planks | miami-city [glTF] | 0.219 / 0.47 | 0.22 / 0 | 761 (1024x1024) | saturation 0.47 > 0.45; roughness 0.22 < 0.68 | nico:eye0 0.1%, nico:eye3 0.1%, nico:street 0.0% |
| 35 | 1.05 | r2-art | concrete | Slabs | lib-ranch_house < library-buildings < miami-city [glTF] | 0.38 / 0.24 | 1 / 0 | 353.4 (256x256) | saturation 0.24 > 0.14; roughness 1 > 0.96 | downtown:aerial 1.2% |
| 36 | 1.04 | r2-art | paintedWood | DoorFrame | lib-ranch_house < library-buildings < miami-city [glTF] | 0.4 / 0.3 | 1 / 0 | 219.2 (256x256) | roughness 1 > 0.82 | downtown:aerial 0.8% |
| 37 | 1.04 | r2-art | generic | AirTower01MAT | lib-control_tower < library-buildings < miami-city [glTF] | 0.166 / 0.08 | 0.673 / 0.062 | 22.7 (2048x2048) | texel 23 px/m < 96 (map 2048x2048) | airport:eye1 0.4%, airport:drive0 0.3% |
| 38 | 1.01 | r2-art | galvanized | B Hotr04 W2W7 T2 L1 | lib-stepped_midrise [glTF] | 0.291 / 0.14 | 0.859 / 1 | 27.6 (512x1024) | albedo 0.291 < 0.4; saturation 0.14 > 0.08; roughness 0.859 > 0.68; texel 28 px/m < 200 (map 512x1024) | beach:drive1 0.1%, beach:eye3 0.0%, airport:drive0 0.0% |
| 39 | 0.9 | r2-keys | rubber | fin:rubber | ext:fin:rubber < nh_ext < nicoHouse | 0.044 / 0.44 | 0.667 / 0 | - (-) | saturation 0.44 > 0.2; roughness 0.667 < 0.72 | nico:eye2 0.2%, nico:street 0.0%, nico:drive1 0.0% |
| 40 | 0.83 | r2-keys | galvanized | Modular Wooden Pier Poles | keysDock:Modular Wooden Pier Poles < nh_dockFrame < nh_site  [glTF] | 0.109 / 0.31 | 0.64 / 0 | 411 (2048x2048) | albedo 0.109 < 0.4; saturation 0.31 > 0.08; metalness 0 < 0.75; normalScale 1 > 0.6 | nico:eye0 0.0%, nico:street 0.0% |
| 41 | 0.82 | r2-roads | foliage | tree-grate | miami-city | 0.091 / 0.15 | 0.62 / 0.55 | - (-) | metalness 0.55 > 0.02 | downtown:eye0 0.2%, downtown:eye3 0.1%, downtown:eye2 0.1% |
| 42 | 0.74 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.141 / 0.08 | 0.9 / 0 | 93 (64x1024) | texel 93 px/m < 200 (map 64x1024) | downtown:eye3 0.7%, downtown:drive1 0.5%, downtown:eye2 0.4% |
| 43 | 0.69 | r2-cars | galvanized | (unnamed) |  [glTF] | 0.025 / 0.11 | 1 / 1 | 663.1 (1024x1024) | albedo 0.025 < 0.4; saturation 0.11 > 0.08 | downtown:eye3 0.0%, beach:eye2 0.0% |
| 44 | 0.68 | r2-art | galvanized | (unnamed) | lib-grid_tower < library-buildings < miami-city | 0.192 / 0.14 | 1 / 1 | - (-) | albedo 0.192 < 0.4; saturation 0.14 > 0.08; roughness 1 > 0.68 | beach:drive1 0.0%, beach:eye3 0.0% |
| 45 | 0.68 | r2-keys | rawWood | pbr:plywood:1.2:0:0:0::::0 | ext:pbr:plywood:1.2:0:0:0::::0 < nh_ext < nicoHouse | 0.026 / 0.41 | 0.75 / 0 | 1926 (1024x1024) | albedo 0.026 < 0.08 | nico:eye2 0.1%, nico:street 0.0% |
| 46 | 0.68 | r2-veg | foliage | (unnamed) | vegField_hibiscus [glTF] | 0.094 / 0.68 | 0.72 / 0 | 1646.9 (1024x1024) | saturation 0.68 > 0.62 | nico:eye2 2.5%, nico:eye0 1.3%, nico:eye3 0.0% |
| 47 | 0.66 | r2-art | glass | Glass | lib-jet_bridge < library-buildings < miami-city | 0.221 / 0.26 | 0.5 / 0 | - (-) | albedo 0.221 > 0.1; roughness 0.5 > 0.16 | airport:eye1 0.0%, airport:apron 0.0%, airport:drive0 0.0% |
| 48 | 0.63 | r2-art | generic | red_band_tower_far | lib-red_band_tower < library-buildings < miami-city [glTF] | 0.081 / 0.01 | 0.6 / 0.15 | 4.4 (1024x1024) | texel 4 px/m < 96 (map 1024x1024) | downtown:aerial 0.0% |
| 49 | 0.63 | r2-keys | rawWood | handsaw_wood | carport:handsaw_wood < nh_detail < nicoHouse [glTF] | 0.23 / 0.4 | 0.547 / 0.233 | 515.5 (256x256) | roughness 0.547 < 0.68; metalness 0.233 > 0.05 | nico:eye2 0.2%, nico:eye0 0.1%, nico:eye3 0.0% |
| 50 | 0.61 | r2-keys | hair | plants:bark_brown_02 | plants:limbs < nh_ext < nicoHouse | 0.136 / 0.32 | 0.935 / 0 | 5254.4 (1024x1024) | roughness 0.935 > 0.75 | nico:eye3 0.2%, nico:eye0 0.1%, nico:street 0.1% |
| 51 | 0.56 | r2-art | paintedWood | Lobby Interior Trimsheet | lib-grid_tower < library-buildings < miami-city [glTF] | 0.158 / 0.25 | 0.806 / 0 | 24.8 (512x512) | albedo 0.158 < 0.22; texel 25 px/m < 200 (map 512x512) | airport:eye1 0.0% |
| 52 | 0.52 | r2-art | sign | Sign Faces | miami-city [glTF] | 0.432 / 0.2 | 0.6 / 0.049 | 246.1 (1024x1024) | normalScale 1 > 0.4 | nico:street 0.3%, rural:eye3 0.1%, rural:drive1 0.0% |
| 53 | 0.52 | r2-cars? | galvanized | (unnamed) |  [glTF] | 0.085 / 0.02 | 1 / 1 | 134.3 (1024x1024) | albedo 0.085 < 0.4; normalScale 1 > 0.6; texel 134 px/m < 200 (map 1024x1024) | nico:eye0 0.0%, airport:drive0 0.0%, airport:eye2 0.0% |
| 54 | 0.52 | r2-art | stucco | pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 | houses:spawn:1:pbr:concrete_wall_008:1.6:0:0:0:::2.3:1 < hou | 0.289 / 0.27 | 0.737 / 0 | 709.4 (1024x1024) | roughness 0.737 < 0.78; normalScale 1 > 0.8 | rural:eye2 0.7%, rural:eye0 0.6%, rural:drive1 0.5% |
| 55 | 0.51 | r2-art | galvanized | (unnamed) | breech < weapon-sawnoff{weapon} < {weapon} | 0.113 / 0.35 | 0.176 / 1 | - (-) | albedo 0.113 < 0.4; saturation 0.35 > 0.08; roughness 0.176 < 0.32 | rural:eye0 0.0%, beach:eye1 0.0%, rural:eye3 0.0% |
| 56 | 0.51 | r2-cars? | galvanized | (unnamed) |  | 0.141 / 0.44 | 0.021 / 1 | - (-) | albedo 0.141 < 0.4; saturation 0.44 > 0.08; roughness 0.021 < 0.32 | rural:eye3 0.0%, rural:drive1 0.0%, beach:eye1 0.0% |
| 57 | 0.5 | r2-art | generic | Lambert1 | lib-factory_plant < library-buildings < miami-city [glTF] | 0.079 / 0.13 | 0.75 / 0.129 | 29.7 (2048x2048) | texel 30 px/m < 96 (map 2048x2048) | airport:drive0 0.1%, airport:eye1 0.1% |
| 58 | 0.49 | r2-roads | marking | M.markings | mark < elevated_-5_24 < tile-near--5,24{tile} | 0.107 / 0.6 | 0.771 / 0 | 409.4 (1024x1024) | albedo 0.107 < 0.18 | downtown:aerial 0.2%, airport:drive0 0.2%, airport:apron 0.2% |
| 59 | 0.48 | r2-keys | stucco | pbr:concrete_wall_008:2.4:0:0:0:::2.3:1 | ext:pbr:concrete_wall_008:2.4:0:0:0:::2.3:1 < nh_ext < nicoH | 0.334 / 0.19 | 0.737 / 0 | 808.9 (1024x1024) | roughness 0.737 < 0.78; normalScale 1 > 0.8 | nico:eye2 0.6%, nico:street 0.0%, nico:eye3 0.0% |
| 60 | 0.48 | r2-cars? | galvanized | (unnamed) |  | 0.14 / 0.39 | 0.088 / 0.9 | - (-) | albedo 0.140 < 0.4; saturation 0.39 > 0.08; roughness 0.088 < 0.32 | rural:eye0 0.0%, beach:drive0 0.0%, rural:drive1 0.0% |
| 61 | 0.47 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.265 / 0.21 | 0.72 / 0 | 616.5 (1024x1024) | albedo 0.265 > 0.19 | beach:eye1 0.3%, beach:eye2 0.2%, nico:eye2 0.0% |
| 62 | 0.46 | r2-art | glass | Windows | lib-grid_tower < library-buildings < miami-city [glTF] | 0.3 / 0.11 | 0.288 / 0 | 72.3 (512x137) | albedo 0.300 > 0.1; roughness 0.288 > 0.16; normalScale 1 > 0.3 | airport:drive0 0.0%, beach:eye3 0.0%, beach:drive1 0.0% |
| 63 | 0.44 | r2-art | stucco | Building Facade | lib-concrete_tower < library-buildings < miami-city [glTF] | 0.342 / 0.04 | 0.392 / 0.089 | 81.6 (1024x1024) | roughness 0.392 < 0.78; metalness 0.089 > 0.05; normalScale 1 > 0.8; texel 82 px/m < 128 (map 1024x1024) | airport:eye1 0.0%, beach:drive1 0.0%, beach:eye3 0.0% |
| 64 | 0.44 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.14 / 0.61 | 0.9 / 0 | 197.7 (128x1024) | saturation 0.61 > 0.38 | downtown:eye3 0.1%, downtown:drive1 0.1%, downtown:eye2 0.1% |
| 65 | 0.42 | r2-art | generic | Towers | lib-old_brick_towers [glTF] | 0.119 / 0.08 | 0.695 / 0 | 8.6 (256x256) | texel 9 px/m < 96 (map 256x256) | airport:drive0 0.0%, airport:eye1 0.0%, beach:drive1 0.0% |
| 66 | 0.42 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.304 / 0.03 | 0.72 / 0 | 436.2 (1024x1011) | albedo 0.304 > 0.19 | beach:eye2 0.1%, nico:eye2 0.0%, nico:drive1 0.0% |
| 67 | 0.4 | r2-art | concrete | Concrete Blocks.001 | lib-concrete_tower < library-buildings < miami-city [glTF] | 0.152 / 0.12 | 0.453 / 0 | 159.8 (1024x1024) | albedo 0.152 < 0.2; roughness 0.453 < 0.75; texel 160 px/m < 200 (map 1024x1024) | airport:eye1 0.0%, beach:drive1 0.0%, beach:eye3 0.0% |
| 68 | 0.4 | r2-art | galvanized | Gltfnode121Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.134 / 0.03 | 0.3 / 1 | 121 (128x128) | albedo 0.134 < 0.4; roughness 0.3 < 0.32; texel 121 px/m < 200 (map 128x128) | airport:apron 0.0% |
| 69 | 0.39 | r2-veg | foliage | (unnamed) |  [glTF] | 0.382 / 0.06 | 0.72 / 0 | 230.8 (1024x1024) | albedo 0.382 > 0.19 | nico:eye2 0.0%, nico:street 0.0%, nico:drive1 0.0% |
| 70 | 0.38 | unknown | rawWood | M.wood | tile-near--5,24{tile} | 0.143 / 0.78 | 0.737 / 0 | 341.3 (1024x1024) | saturation 0.78 > 0.45 | nico:eye0 0.0%, nico:eye2 0.0%, nico:drive1 0.0% |
| 71 | 0.38 | r2-art | galvanized | (unnamed) | lib-roof_tank < library-buildings < miami-city | 1 / 0 | 1 / 1 | - (-) | albedo 1.000 > 0.66; roughness 1 > 0.68 | downtown:aerial 0.0% |
| 72 | 0.37 | r2-art | generic | airliner_far | lib-airliner < library-buildings < miami-city [glTF] | 0.129 / 0.15 | 0.6 / 0.15 | 25.4 (1024x1024) | texel 25 px/m < 96 (map 1024x1024) | downtown:drive1 0.1%, airport:eye1 0.0%, beach:eye3 0.0% |
| 73 | 0.37 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.099 / 0.55 | 0.9 / 0 | 4233.7 (256x1024) | saturation 0.55 > 0.38 | airport:drive0 0.1%, airport:eye1 0.0%, beach:ocean 0.0% |
| 74 | 0.36 | r2-art | plastic | Plastic Table | miami-city [glTF] | 0.343 / 0.8 | 0.44 / 0 | 140.8 (512x512) | saturation 0.80 > 0.72; normalScale 1 > 0.6 | rural:eye0 0.1%, nico:eye2 0.0% |
| 75 | 0.36 | r2-cars | generic | (unnamed) |  | 0.316 / 0.12 | 0.03 / 0 | - (-) | roughness 0.03 < 0.08; envMapIntensity 2.6 > 1.6 | nico:eye0 0.0%, nico:street 0.0%, nico:eye2 0.0% |
| 76 | 0.36 | r2-art | generic | Gltfnode521Mtl | lib-airliner < library-buildings < miami-city [glTF] | 0.425 / 0.04 | 0.3 / 0.813 | 34.8 (512x512) | texel 35 px/m < 96 (map 512x512) | airport:apron 0.1% |
| 77 | 0.35 | r2-art | galvanized | Rail Short | miami-city [glTF] | 0.23 / 0.1 | 0.178 / 0.341 | 231.4 (512x512) | albedo 0.230 < 0.4; saturation 0.10 > 0.08; roughness 0.178 < 0.32; metalness 0.341 < 0.75; normalScale 1 > 0.6 | rural:drive1 0.0%, rural:eye3 0.0%, nico:eye2 0.0% |
| 78 | 0.35 | r2-art | generic | Main Body | lib-old_brick_towers [glTF] | 0.087 / 0.14 | 0.885 / 0 | 15.9 (256x256) | texel 16 px/m < 96 (map 256x256) | airport:eye1 0.0%, airport:drive0 0.0% |
| 79 | 0.35 | r2-keys | stucco | garden_hose_wall_mounted_01 | carport:garden_hose_wall_mounted_01 < nh_detail < nicoHouse [glTF] | 0.067 / 0.34 | 0.463 / 0.129 | 354.5 (512x512) | albedo 0.067 < 0.28; roughness 0.463 < 0.78; metalness 0.129 > 0.05; normalScale 1 > 0.8 | nico:eye2 0.0%, nico:drive1 0.0% |
| 80 | 0.34 | r2-art | generic | gun_shop_far | lib-gun_shop < library-buildings < miami-city [glTF] | 0.149 / 0.04 | 0.6 / 0.15 | 30.7 (1024x1024) | texel 31 px/m < 96 (map 1024x1024) | airport:eye1 0.1%, downtown:aerial 0.0% |

## Views

- nico:deck: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_nico_deck.jpg`
- nico:street: 341 materials, sky 2%, `docs/v2/shots/art/audit/before_nico_street.jpg`
- nico:eye0: 264 materials, sky 1%, `docs/v2/shots/art/audit/before_nico_eye0.jpg`
- nico:eye1: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_nico_eye1.jpg`
- nico:eye2: 406 materials, sky 2%, `docs/v2/shots/art/audit/before_nico_eye2.jpg`
- nico:eye3: 210 materials, sky 0%, `docs/v2/shots/art/audit/before_nico_eye3.jpg`
- nico:drive0: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_nico_drive0.jpg`
- nico:drive1: 244 materials, sky 0%, `docs/v2/shots/art/audit/before_nico_drive1.jpg`
- downtown:aerial: 83 materials, sky 0%, `docs/v2/shots/art/audit/before_downtown_aerial.jpg`
- downtown:eye0: 75 materials, sky 0%, `docs/v2/shots/art/audit/before_downtown_eye0.jpg`
- downtown:eye1: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_downtown_eye1.jpg`
- downtown:eye2: 88 materials, sky 0%, `docs/v2/shots/art/audit/before_downtown_eye2.jpg`
- downtown:eye3: 107 materials, sky 0%, `docs/v2/shots/art/audit/before_downtown_eye3.jpg`
- downtown:drive0: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_downtown_drive0.jpg`
- downtown:drive1: 92 materials, sky 0%, `docs/v2/shots/art/audit/before_downtown_drive1.jpg`
- beach:ocean: 199 materials, sky 0%, `docs/v2/shots/art/audit/before_beach_ocean.jpg`
- beach:eye0: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_beach_eye0.jpg`
- beach:eye1: 279 materials, sky 0%, `docs/v2/shots/art/audit/before_beach_eye1.jpg`
- beach:eye2: 174 materials, sky 0%, `docs/v2/shots/art/audit/before_beach_eye2.jpg`
- beach:eye3: 140 materials, sky 0%, `docs/v2/shots/art/audit/before_beach_eye3.jpg`
- beach:drive0: 208 materials, sky 0%, `docs/v2/shots/art/audit/before_beach_drive0.jpg`
- beach:drive1: 160 materials, sky 0%, `docs/v2/shots/art/audit/before_beach_drive1.jpg`
- rural:eye0: 346 materials, sky 0%, `docs/v2/shots/art/audit/before_rural_eye0.jpg`
- rural:eye1: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_rural_eye1.jpg`
- rural:eye2: 81 materials, sky 0%, `docs/v2/shots/art/audit/before_rural_eye2.jpg`
- rural:eye3: 278 materials, sky 0%, `docs/v2/shots/art/audit/before_rural_eye3.jpg`
- rural:drive0: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_rural_drive0.jpg`
- rural:drive1: 258 materials, sky 0%, `docs/v2/shots/art/audit/before_rural_drive1.jpg`
- airport:apron: 22 materials, sky 0%, `docs/v2/shots/art/audit/before_airport_apron.jpg`
- airport:eye0: 0 materials, sky 100%, `docs/v2/shots/art/audit/before_airport_eye0.jpg`
- airport:eye1: 121 materials, sky 0%, `docs/v2/shots/art/audit/before_airport_eye1.jpg`
- airport:eye2: 161 materials, sky 0%, `docs/v2/shots/art/audit/before_airport_eye2.jpg`
- airport:eye3: 24 materials, sky 0%, `docs/v2/shots/art/audit/before_airport_eye3.jpg`
- airport:drive0: 119 materials, sky 0%, `docs/v2/shots/art/audit/before_airport_drive0.jpg`
- airport:drive1: 96 materials, sky 0%, `docs/v2/shots/art/audit/before_airport_drive1.jpg`

## Console errors

- LOG Failed to load resource: the server responded with a status of 404 (Not Found) http://127.0.0.1:5200/favicon.ico
