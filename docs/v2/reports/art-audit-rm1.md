# Art audit (rm1): 2026-11-17T21:02:38.625Z

Tool: `node tools/v2/art/audit.mjs` (ranges: `src/world/art/ranges.json`, guide: `docs/v2/briefs/ART_STYLE.md`).
Materials on screen: 1007. Outliers (severity >= 0.35): 307. High-visibility outliers (>= 1% of the screen in some view): **7**.

Rank = sqrt(max screen % in any view) x severity. Severity sums the distance outside each class range (albedo in stops x1.4-1.8, roughness per 0.15, metalness per 0.3, saturation per 0.15, texel density in stops x0.8).

## Outliers by owner

| owner | outliers | high visibility |
|---|---|---|
| r2-keys | 45 | 3 |
| r2-veg | 206 | 2 |
| r2-art | 24 | 1 |
| unknown | 2 | 1 |
| r2-roads | 6 | 0 |
| r2-cars | 12 | 0 |
| r2-cars? | 4 | 0 |
| r2-ground | 1 | 0 |
| r2-people | 7 | 0 |

## Library vs code-built, same class (coverage-weighted)

A style is unified when the two columns agree: |albedo delta| < 0.5 stop, |roughness delta| < 0.12.

| class | library L / sat / rough | code-built L / sat / rough | albedo delta (stops) | roughness delta |
|---|---|---|---|---|
| foliage | 0.145 / 0.295 / 0.76 (118.3%) | 0.144 / 0.212 / 0.865 (21.7%) | 0.01 | -0.1 |
| bark | 0.159 / 0.151 / 0.863 (52.3%) | 0.178 / 0.21 / 0.925 (2.5%) | -0.16 | -0.06 |
| plastic | 0.076 / 0.403 / 0.873 (1.6%) | 0.063 / 0.086 / 0.73 (18%) | 0.27 | 0.14 **!** |
| generic | 0.126 / 0.518 / 0.86 (7%) | 0.285 / 0.15 / 0.685 (74.3%) | -1.18 **!** | 0.17 **!** |

## By material class

| class | materials | outliers | summed screen % |
|---|---|---|---|
| emissive | 39 | 0 | 431.8 |
| terrain | 3 | 1 | 344.9 |
| foliage | 273 | 120 | 140.0 |
| sand | 4 | 4 | 87.0 |
| generic | 331 | 41 | 81.3 |
| paintedWood | 10 | 3 | 65.7 |
| bark | 174 | 45 | 54.9 |
| stucco | 9 | 7 | 49.0 |
| flowers | 32 | 9 | 43.8 |
| glass | 9 | 6 | 31.4 |
| rawWood | 19 | 6 | 24.2 |
| plastic | 14 | 12 | 19.6 |
| galvanized | 15 | 14 | 5.0 |
| metalPainted | 15 | 11 | 3.6 |
| building | 6 | 1 | 2.7 |
| asphalt | 3 | 2 | 2.2 |
| cloth | 19 | 5 | 1.9 |
| concrete | 4 | 4 | 1.6 |
| wetSurface | 2 | 0 | 1.6 |
| hair | 2 | 2 | 1.4 |
| rubber | 2 | 1 | 0.7 |
| sign | 10 | 6 | 0.4 |
| stone | 3 | 3 | 0.2 |
| rustyMetal | 5 | 3 | 0.2 |
| marking | 2 | 1 | 0.1 |
| skin | 1 | 0 | 0.1 |
| water | 1 | 0 | 0.0 |

## Ranked outliers (top 80)

| # | rank | owner | class | material | source (object chain) | albedo L / sat | rough / metal | texel px/m (map) | issues | where |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5.54 | r2-keys | sand | ground:pbr:shell_floor_01:2.6:0:0:0:::1. | site:ground:pbr:shell_floor_01:2.6:0:0:0:::1.5:1::1.7: < nh_ | 0.36 / 0.05 | 0.967 / 0 | 785.9 (2048x2048) | normalScale 1.7 > 1 | nico:eye1 22.4%, nico:drive1 21.1%, nico:eye2 19.2% |
| 2 | 2.14 | r2-keys | foliage | keys:leaves | site:keys:leaves < nh_site < nicoHouse | 0.287 / 0.07 | 0.877 / 0 | 319.3 (512x512) | albedo 0.287 > 0.19; roughness 0.877 > 0.82 | nico:eye1 2.2%, nico:drive1 1.1%, nico:eye0 0.9% |
| 3 | 2.12 | r2-art | stucco | facade-far | chunk-mid--2,6 | 0.364 / 0.05 | 0.634 / 0.14 | - (-) | metalness 0.14 > 0.05; envMapIntensity 1.25 > 1.1 | beach:eye2 14.9%, beach:drive1 10.1%, beach:eye1 5.5% |
| 4 | 2.03 | r2-keys | galvanized | tin | ext:tin < nh_ext < nicoHouse | 0.518 / 0.11 | 0.95 / 0.562 | 850.2 (1024x1024) | saturation 0.11 > 0.08; roughness 0.95 > 0.68; metalness 0.562 < 0.75 | nico:drive1 0.6%, nico:eye2 0.2%, nico:street 0.1% |
| 5 | 1.95 | r2-art | glass | M.shopGlass | tile-near--5,25{tile} | 0.393 / 0.04 | 0.491 / 0.253 | - (-) | roughness 0.491 > 0.16; metalness 0.253 > 0.12 | beach:eye2 0.5%, beach:eye1 0.3%, beach:drive1 0.3% |
| 6 | 1.55 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.305 / 0.08 | 0.848 / 0.35 | 418.6 (1024x1011) | albedo 0.305 > 0.19; roughness 0.848 > 0.82; metalness 0.35 > 0.02 | nico:eye1 0.4%, nico:eye0 0.1%, nico:deck 0.0% |
| 7 | 1.49 | r2-roads | galvanized | M.guardrail | tile-near--5,24{tile} | 0.056 / 0.49 | 0.563 / 0.551 | - (-) | albedo 0.056 < 0.4; saturation 0.49 > 0.08; metalness 0.551 < 0.75 | nico:eye1 0.0%, nico:eye2 0.0%, nico:drive1 0.0% |
| 8 | 1.47 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.151 / 0.21 | 0.618 / 0.071 | 747.7 (1024x1024) | roughness 0.618 < 0.82; metalness 0.071 > 0.02 | beach:eye0 0.9%, beach:ocean 0.5%, beach:eye3 0.5% |
| 9 | 1.43 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.217 / 0.26 | 0.555 / 0.144 | 324.5 (1024x1024) | albedo 0.217 > 0.19; metalness 0.144 > 0.02 | beach:drive1 3.5%, beach:drive0 2.9%, beach:ocean 0.3% |
| 10 | 1.26 | r2-cars | plastic | car-trim-worn |  | 0.381 / 0 | 0.776 / 0.564 | - (-) | roughness 0.776 > 0.68; metalness 0.564 > 0.05 | nico:eye1 0.3%, nico:eye0 0.2%, nico:drive1 0.1% |
| 11 | 1.14 | unknown | generic | (unnamed) | vegCollars | 0.105 / 0.42 | 0.927 / 0 | 37.7 (128x128) | texel 38 px/m < 96 (map 128x128) | beach:eye1 1.1%, beach:eye2 1.1%, beach:eye0 1.0% |
| 12 | 0.94 | r2-art | galvanized | tin | houses:spawn:1:tin < houses | 0.369 / 0.03 | 0.742 / 0.631 | 663.8 (1024x1024) | albedo 0.369 < 0.4; roughness 0.742 > 0.68; metalness 0.631 < 0.75 | nico:eye1 0.9%, nico:eye0 0.6%, nico:deck 0.5% |
| 13 | 0.94 | r2-veg | foliage | (unnamed) | vegField_coconut [glTF] | 0.431 / 0.34 | 0.299 / 0.438 | 310.4 (595x1024) | albedo 0.431 > 0.19; roughness 0.299 < 0.42; metalness 0.438 > 0.02 | nico:street 0.0% |
| 14 | 0.86 | r2-keys | stucco | pbr:concrete_wall_008:1.6:0:0:0:14871030 | ext:pbr:concrete_wall_008:1.6:0:0:0:14871030::2.3:1:0.4:0.7: | 0.188 / 0.23 | 0.848 / 0.001 | 1281.5 (1024x1024) | albedo 0.188 < 0.28 | nico:eye1 1.1%, nico:eye2 0.7%, nico:drive1 0.7% |
| 15 | 0.86 | r2-keys | plastic | TrashCan(Blue) | keysYard:TrashCan(Blue) < nh_site < nicoHouse [glTF] | 0.046 / 0.37 | 0.848 / 0.003 | 457.8 (1024x1024) | roughness 0.848 > 0.68 | nico:eye0 0.6%, nico:eye1 0.5%, nico:street 0.1% |
| 16 | 0.78 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.285 / 0.02 | 0.694 / 0.167 | 604.6 (1024x1024) | albedo 0.285 > 0.19; metalness 0.167 > 0.02 | beach:eye1 0.3%, beach:eye2 0.2%, nico:drive1 0.0% |
| 17 | 0.74 | r2-keys | hair | plants:bark_brown_02 | plants:limbs < nh_ext < nicoHouse | 0.114 / 0.39 | 0.917 / 0.002 | 5254.3 (1024x1024) | roughness 0.917 > 0.75 | nico:drive1 0.4%, nico:eye3 0.4%, nico:eye1 0.2% |
| 18 | 0.71 | r2-cars | glass | car-glass-dusty |  | 0.175 / 0.04 | 0.231 / 0.177 | - (-) | albedo 0.175 > 0.16; roughness 0.231 > 0.16; metalness 0.177 > 0.12 | nico:drive1 0.6%, nico:eye1 0.6%, nico:eye0 0.2% |
| 19 | 0.7 | r2-veg | foliage | (unnamed) | vegField_coconut [glTF] | 0.214 / 0.18 | 0.736 / 0.135 | 302.5 (595x1024) | albedo 0.214 > 0.19; metalness 0.135 > 0.02 | nico:street 1.0%, nico:eye2 0.7%, nico:drive1 0.3% |
| 20 | 0.68 | r2-cars | glass | car-glass |  | 0.512 / 0.04 | 0.811 / 0.545 | - (-) | albedo 0.512 > 0.16; roughness 0.811 > 0.16; metalness 0.545 > 0.12 | nico:street 0.0%, beach:eye1 0.0% |
| 21 | 0.67 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.287 / 0.03 | 0.716 / 0.166 | 418.7 (1024x1024) | albedo 0.287 > 0.19; metalness 0.166 > 0.02 | beach:eye2 0.2%, beach:eye1 0.2%, nico:drive1 0.0% |
| 22 | 0.67 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.474 / 0.19 | 0.465 / 0.473 | 528.7 (1024x1024) | albedo 0.474 > 0.19; metalness 0.473 > 0.02 | nico:street 0.0%, nico:drive1 0.0%, beach:eye0 0.0% |
| 23 | 0.65 | r2-veg | foliage | (unnamed) |  [glTF] | 0.233 / 0.13 | 0.875 / 0 | 2031.7 (1024x1024) | albedo 0.233 > 0.19; roughness 0.875 > 0.82 | nico:street 0.5% |
| 24 | 0.64 | r2-roads | concrete | M.sidewalk | tile-near--5,24{tile} | 0.143 / 0.17 | 0.795 / 0.007 | 671 (2048x2048) | albedo 0.143 < 0.2; saturation 0.17 > 0.14 | beach:eye2 0.5%, beach:drive1 0.3%, beach:eye1 0.1% |
| 25 | 0.64 | r2-veg | bark | (unnamed) | vegField_coconut [glTF] | 0.228 / 0.15 | 0.77 / 0.124 | 356.5 (211x1024) | roughness 0.77 < 0.82; metalness 0.124 > 0.02 | nico:eye1 0.9%, nico:eye2 0.9%, nico:drive1 0.3% |
| 26 | 0.6 | r2-keys | sand | art:nh70_sand/int | int:art:nh70_sand/int < nh_int < nicoHouse | 0.168 / 0.52 | 0.863 / 0 | 236.1 (256x256) | albedo 0.168 < 0.22; saturation 0.52 > 0.18; texel 236 px/m < 256 (map 256x256) | nico:eye1 0.0%, nico:drive1 0.0%, nico:eye3 0.0% |
| 27 | 0.59 | r2-art | plastic | Cup Sleeve | miami-city [glTF] | 0.197 / 0.54 | 0.971 / 0.003 | 1216.4 (256x256) | roughness 0.971 > 0.68 | nico:eye3 0.1%, nico:eye1 0.1%, nico:eye0 0.1% |
| 28 | 0.58 | r2-art | plastic | Cup Base | miami-city | 0.219 / 0.5 | 0.977 / 0.003 | - (-) | roughness 0.977 > 0.68 | nico:eye1 0.1%, nico:eye3 0.1%, nico:eye0 0.1% |
| 29 | 0.55 | r2-art | stucco | pbr:concrete_wall_008:1.6:0:0:0:14871030 | houses:spawn:1:pbr:concrete_wall_008:1.6:0:0:0:14871030::2.3 | 0.17 / 0.25 | 0.88 / 0.003 | 709.4 (1024x1024) | albedo 0.170 < 0.28 | nico:street 0.3%, nico:eye3 0.1%, nico:drive1 0.0% |
| 30 | 0.51 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.189 / 0.07 | 0.703 / 0.075 | 661 (1024x1024) | roughness 0.703 < 0.82; metalness 0.075 > 0.02 | beach:eye2 0.3%, beach:eye3 0.2%, nico:eye0 0.1% |
| 31 | 0.5 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.302 / 0.04 | 0.652 / 0.083 | 488.2 (1024x1011) | albedo 0.302 > 0.19; metalness 0.083 > 0.02 | beach:eye2 0.1% |
| 32 | 0.5 | r2-art | sand | pbr:shell_floor_01:2.6:0:0:0:::1.4:1::: | houses:spawn:1:pbr:shell_floor_01:2.6:0:0:0:::1.4:1::: < hou | 0.162 / 0.3 | 0.863 / 0.004 | 787.7 (2048x2048) | albedo 0.162 < 0.22; saturation 0.30 > 0.18 | nico:deck 0.1%, nico:eye1 0.0%, nico:eye3 0.0% |
| 33 | 0.5 | r2-veg | bark | (unnamed) | vegField_coconut [glTF] | 0.168 / 0.05 | 0.865 / 0.06 | 135.3 (1024x1024) | metalness 0.06 > 0.02; texel 135 px/m < 200 (map 1024x1024) | nico:eye2 0.7%, nico:eye1 0.3%, nico:street 0.2% |
| 34 | 0.49 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.302 / 0.05 | 0.653 / 0.165 | 947 (696x734) | albedo 0.302 > 0.19; metalness 0.165 > 0.02 | beach:eye3 0.1%, beach:eye0 0.1%, nico:eye1 0.0% |
| 35 | 0.48 | r2-keys | plastic | fin:plastic | ext:fin:plastic < nh_ext < nicoHouse | 0.374 / 0.04 | 0.809 / 0.002 | - (-) | roughness 0.809 > 0.68 | nico:eye2 0.3%, nico:drive1 0.2%, nico:eye3 0.0% |
| 36 | 0.47 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.115 / 0.76 | 0.755 / 0 | 1328.1 (1024x1024) | saturation 0.76 > 0.38; roughness 0.755 < 0.82 | nico:drive1 0.0%, nico:eye2 0.0%, nico:street 0.0% |
| 37 | 0.47 | r2-cars | glass | car-glass |  | 0.205 / 0.23 | 0.903 / 0.006 | - (-) | albedo 0.205 > 0.16; roughness 0.903 > 0.16 | nico:eye2 0.0%, nico:street 0.0%, nico:eye1 0.0% |
| 38 | 0.47 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.192 / 0.28 | 0.676 / 0.129 | 783.7 (1024x1024) | roughness 0.676 < 0.82; metalness 0.129 > 0.02 | beach:eye3 0.1%, beach:eye0 0.0%, beach:drive1 0.0% |
| 39 | 0.46 | r2-roads | concrete | elevated-concrete | conc < elevated_-5_23 < tile-near--5,23{tile} | 0.146 / 0.41 | 0.81 / 0.01 | - (-) | albedo 0.146 < 0.2; saturation 0.41 > 0.14 | nico:drive1 0.0%, nico:street 0.0%, nico:eye2 0.0% |
| 40 | 0.46 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.129 / 0.77 | 0.763 / 0 | 18201.6 (256x512) | saturation 0.77 > 0.38; roughness 0.763 < 0.82 | nico:drive1 0.0%, nico:eye2 0.0%, nico:street 0.0% |
| 41 | 0.43 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.285 / 0.08 | 0.763 / 0.148 | 135.3 (1024x1024) | albedo 0.285 > 0.28; roughness 0.763 < 0.82; metalness 0.148 > 0.02; texel 135 px/m < 200 (map 1024x1024) | beach:eye1 0.1%, nico:eye1 0.0%, nico:eye2 0.0% |
| 42 | 0.43 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.135 / 0.77 | 0.754 / 0 | 26021.9 (256x512) | saturation 0.77 > 0.38; roughness 0.754 < 0.82 | nico:drive1 0.0%, nico:eye2 0.0%, nico:street 0.0% |
| 43 | 0.42 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.235 / 0.02 | 0.717 / 0.125 | 230.8 (1024x1024) | albedo 0.235 > 0.19; metalness 0.125 > 0.02 | beach:eye1 0.2%, nico:eye2 0.1%, nico:eye1 0.0% |
| 44 | 0.42 | r2-veg | bark | (unnamed) | vegField_coconut [glTF] | 0.447 / 0.32 | 0.319 / 0.455 | 354.8 (211x1024) | albedo 0.447 > 0.28; roughness 0.319 < 0.82; metalness 0.455 > 0.02 | nico:street 0.0% |
| 45 | 0.41 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.227 / 0.17 | 0.634 / 0.158 | 6654.8 (256x1024) | roughness 0.634 < 0.82; metalness 0.158 > 0.02 | beach:eye0 0.1%, beach:eye3 0.1% |
| 46 | 0.41 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.146 / 0.15 | 0.752 / 0.069 | 1.6 (8x8) | roughness 0.752 < 0.82; metalness 0.069 > 0.02 | beach:eye1 0.4%, beach:drive0 0.4%, beach:ocean 0.3% |
| 47 | 0.39 | r2-keys | foliage | plants:stem | plants:stems < nh_ext < nicoHouse | 0.199 / 0.23 | 0.957 / 0.003 | 751.8 (128x128) | albedo 0.199 > 0.19; roughness 0.957 > 0.82 | nico:eye2 0.1%, nico:drive1 0.1%, nico:eye3 0.1% |
| 48 | 0.39 | r2-keys | concrete | pbr:scuffed_cement:2.2:0:0:0:12374783::3 | site:pbr:scuffed_cement:2.2:0:0:0:12374783::3.4:1::: < nh_si | 0.146 / 0.13 | 0.754 / 0.004 | 878 (1024x1024) | albedo 0.146 < 0.2 | nico:drive1 0.4%, nico:eye2 0.1%, nico:street 0.0% |
| 49 | 0.39 | r2-veg | foliage | (unnamed) | vegField_coconut < houses [glTF] | 0.236 / 0.22 | 0.681 / 0.161 | 230.8 (1024x1024) | albedo 0.236 > 0.19; metalness 0.161 > 0.02 | nico:eye1 0.1%, nico:eye0 0.1%, nico:deck 0.0% |
| 50 | 0.37 | r2-keys | rubber | fin:rubber/int | int:fin:rubber/int < nh_int < nicoHouse | 0.23 / 0.23 | 0.912 / 0 | - (-) | albedo 0.230 > 0.06; saturation 0.23 > 0.2 | nico:eye0 0.0%, nico:eye1 0.0%, nico:drive1 0.0% |
| 51 | 0.36 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.124 / 0.73 | 0.78 / 0 | 1328.1 (1024x1024) | saturation 0.73 > 0.38; roughness 0.78 < 0.82 | nico:drive1 0.0%, nico:eye2 0.0% |
| 52 | 0.34 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.241 / 0.12 | 0.732 / 0.169 | 302.5 (595x1024) | albedo 0.241 > 0.19; metalness 0.169 > 0.02 | nico:deck 0.1%, nico:eye1 0.1%, nico:drive1 0.0% |
| 53 | 0.34 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.121 / 0.77 | 0.779 / 0 | 1329 (1024x1024) | saturation 0.77 > 0.38; roughness 0.779 < 0.82 | nico:drive1 0.0%, nico:eye2 0.0%, nico:street 0.0% |
| 54 | 0.34 | r2-art | plastic | Cup Sleeve Back | miami-city [glTF] | 0.194 / 0.5 | 0.974 / 0.002 | 1414.4 (256x256) | roughness 0.974 > 0.68 | nico:eye1 0.0%, nico:deck 0.0%, nico:street 0.0% |
| 55 | 0.34 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.197 / 0.11 | 0.739 / 0.074 | 515 (64x1024) | roughness 0.739 < 0.82; metalness 0.074 > 0.02 | beach:ocean 0.2%, beach:eye1 0.2% |
| 56 | 0.33 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.23 / 0.46 | 0.968 / 0.003 | 154.6 (64x1024) | saturation 0.46 > 0.38; texel 155 px/m < 200 (map 64x1024) | nico:eye0 0.2%, nico:eye3 0.1%, nico:eye1 0.1% |
| 57 | 0.33 | r2-keys | stone | pbr:long_white_tiles:0.55:0:0:0:::1.05:0 | int:pbr:long_white_tiles:0.55:0:0:0:::1.05:0:::/int < nh_int | 0.17 / 0.52 | 0.872 / 0 | 1861.8 (1024x1024) | saturation 0.52 > 0.3 | nico:eye1 0.1%, nico:eye2 0.0%, nico:eye0 0.0% |
| 58 | 0.3 | r2-art | metalPainted | Rail Short | miami-city [glTF] | 0.118 / 0.78 | 0.766 / 0 | 231.4 (512x512) | saturation 0.78 > 0.55; roughness 0.766 > 0.7 | nico:drive1 0.0%, nico:eye2 0.0%, nico:street 0.0% |
| 59 | 0.3 | r2-keys | metalPainted | Modular Wooden Pier Poles | keysDock:Modular Wooden Pier Poles < nh_dockFrame < nh_site  [glTF] | 0.155 / 0.19 | 0.976 / 0.004 | 411 (2048x2048) | roughness 0.976 > 0.7; normalScale 1 > 0.6 | nico:eye1 0.0%, nico:street 0.0%, nico:drive1 0.0% |
| 60 | 0.3 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.219 / 0.06 | 0.756 / 0.173 | 734.7 (1024x1024) | albedo 0.219 > 0.19; metalness 0.173 > 0.02 | beach:eye1 0.1%, beach:ocean 0.1% |
| 61 | 0.28 | r2-roads | asphalt | roadDecals | tile-near--5,24{tile} | 0.133 / 0.14 | 0.73 / 0.003 | 492.2 (2048x2048) | roughness 0.73 < 0.8 | nico:deck 0.4%, nico:street 0.3%, nico:eye1 0.1% |
| 62 | 0.28 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.21 / 0.17 | 0.699 / 0.14 | 273.1 (1024x512) | albedo 0.210 > 0.19; metalness 0.14 > 0.02 | nico:deck 0.2%, nico:eye1 0.1%, nico:eye0 0.0% |
| 63 | 0.28 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.132 / 0.18 | 0.817 / 0.025 | 142 (1024x1024) | texel 142 px/m < 200 (map 1024x1024) | beach:ocean 0.5%, beach:eye1 0.1% |
| 64 | 0.27 | r2-keys | rawWood | wooden_crate_02 | carport:wooden_crate_02 < nh_detail < nicoHouse [glTF] | 0.101 / 0.55 | 0.62 / 0.033 | 211.1 (512x512) | saturation 0.55 > 0.45; roughness 0.62 < 0.68 | nico:eye2 0.1%, nico:drive1 0.0% |
| 65 | 0.26 | r2-art | plastic | Bin Body | miami-city [glTF] | 0.129 / 0.49 | 0.957 / 0.037 | 327.1 (1024x1024) | roughness 0.957 > 0.68 | beach:eye2 0.0%, beach:ocean 0.0%, beach:eye1 0.0% |
| 66 | 0.26 | r2-keys | paintedWood | pbr:white_planks_clean:0.9:0:0:0:1605271 | int:pbr:white_planks_clean:0.9:0:0:0:16052710::2.05:0:::/int | 0.165 / 0.53 | 0.873 / 0 | 1137.8 (1024x1024) | albedo 0.165 < 0.22; saturation 0.53 > 0.45; roughness 0.873 > 0.82 | nico:eye0 0.0%, nico:eye1 0.0%, nico:eye2 0.0% |
| 67 | 0.26 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.247 / 0.12 | 0.713 / 0.163 | 270 (595x1024) | albedo 0.247 > 0.19; metalness 0.163 > 0.02 | beach:eye2 0.1%, beach:drive0 0.0%, beach:eye0 0.0% |
| 68 | 0.26 | r2-veg | foliage | (unnamed) |  [glTF] | 0.197 / 0.12 | 0.867 / 0 | 1699.8 (1024x1024) | albedo 0.197 > 0.19; roughness 0.867 > 0.82 | nico:street 0.4% |
| 69 | 0.25 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.119 / 0.73 | 0.8 / 0 | 1409.1 (1024x1024) | saturation 0.73 > 0.38; roughness 0.8 < 0.82 | nico:drive1 0.0%, nico:eye2 0.0%, nico:street 0.0% |
| 70 | 0.25 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.214 / 0.08 | 0.764 / 0.161 | 568.5 (64x1024) | roughness 0.764 < 0.82; metalness 0.161 > 0.02 | beach:eye1 0.1%, beach:ocean 0.1%, nico:deck 0.0% |
| 71 | 0.25 | r2-veg | foliage | (unnamed) |  [glTF] | 0.118 / 0.4 | 0.897 / 0.004 | 2382.6 (1024x1024) | roughness 0.897 > 0.82 | nico:drive1 0.2%, nico:eye3 0.0% |
| 72 | 0.25 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.187 / 0.06 | 0.755 / 0.09 | 4079.8 (1024x1024) | roughness 0.755 < 0.82; metalness 0.09 > 0.02 | beach:eye1 0.1%, beach:drive0 0.1% |
| 73 | 0.24 | r2-keys | metalPainted | fin:steel/int | int:fin:steel/int < nh_int < nicoHouse | 0.231 / 0.18 | 0.884 / 0 | - (-) | roughness 0.884 > 0.7 | nico:eye0 0.0%, nico:eye1 0.0%, nico:drive1 0.0% |
| 74 | 0.24 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.218 / 0.12 | 0.764 / 0.137 | 296.6 (595x1024) | albedo 0.218 > 0.19; metalness 0.137 > 0.02 | beach:eye0 0.1%, beach:drive0 0.1%, beach:eye3 0.1% |
| 75 | 0.24 | r2-cars? | galvanized | (unnamed) |  | 0.021 / 0.14 | 0.141 / 0.7 | - (-) | albedo 0.021 < 0.4; saturation 0.14 > 0.08; roughness 0.141 < 0.32; metalness 0.7 < 0.75 | beach:eye2 0.0% |
| 76 | 0.23 | r2-art | metalPainted | sig-pole | miami-city | 0.107 / 0.04 | 0.858 / 0.015 | - (-) | roughness 0.858 > 0.7 | beach:eye2 0.0%, beach:eye1 0.0%, nico:deck 0.0% |
| 77 | 0.23 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.228 / 0.09 | 0.744 / 0.155 | 310.4 (595x1024) | albedo 0.228 > 0.19; metalness 0.155 > 0.02 | nico:eye1 0.1%, nico:deck 0.0%, nico:drive1 0.0% |
| 78 | 0.23 | r2-keys | glass | glass:0:1 | ext:glass:0:1 < nh_ext < nicoHouse | 0.323 / 0.18 | 0.523 / 0.004 | 1111.5 (512x512) | albedo 0.323 > 0.16; roughness 0.523 > 0.16 | nico:eye2 0.0%, nico:eye3 0.0%, nico:street 0.0% |
| 79 | 0.23 | r2-veg | foliage | (unnamed) |  [glTF] | 0.112 / 0.45 | 0.929 / 0.004 | 2382.6 (1024x1024) | roughness 0.929 > 0.82 | nico:eye2 0.1% |
| 80 | 0.21 | r2-art | stucco | pbr:concrete_wall_008:1.4:0:0:0:::2.25:1 | houses:spawn:1:pbr:concrete_wall_008:1.4:0:0:0:::2.25:1::0.7 | 0.16 / 0.34 | 0.853 / 0.004 | 731.4 (1024x1024) | albedo 0.160 < 0.28 | nico:street 0.0%, nico:drive1 0.0%, nico:eye2 0.0% |

## Views

- nico:deck: 255 materials, sky 0%, `docs/v2/shots/art/audit/rm1_nico_deck.jpg`
- nico:street: 363 materials, sky 0%, `docs/v2/shots/art/audit/rm1_nico_street.jpg`
- nico:eye0: 260 materials, sky 1%, `docs/v2/shots/art/audit/rm1_nico_eye0.jpg`
- nico:eye1: 358 materials, sky 0%, `docs/v2/shots/art/audit/rm1_nico_eye1.jpg`
- nico:eye2: 401 materials, sky 2%, `docs/v2/shots/art/audit/rm1_nico_eye2.jpg`
- nico:eye3: 296 materials, sky 0%, `docs/v2/shots/art/audit/rm1_nico_eye3.jpg`
- nico:drive1: 417 materials, sky 1%, `docs/v2/shots/art/audit/rm1_nico_drive1.jpg`
- beach:ocean: 155 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_ocean.jpg`
- beach:eye0: 125 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_eye0.jpg`
- beach:eye1: 217 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_eye1.jpg`
- beach:eye2: 131 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_eye2.jpg`
- beach:eye3: 103 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_eye3.jpg`
- beach:drive0: 147 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_drive0.jpg`
- beach:drive1: 115 materials, sky 0%, `docs/v2/shots/art/audit/rm1_beach_drive1.jpg`
