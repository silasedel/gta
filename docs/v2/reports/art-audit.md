# Art audit: 2026-11-17T19:11:03.663Z

Tool: `node tools/v2/art/audit.mjs` (ranges: `src/world/art/ranges.json`, guide: `docs/v2/briefs/ART_STYLE.md`).
Materials on screen: 761. Outliers (severity >= 0.35): 113. High-visibility outliers (>= 1% of the screen in some view): **3**.

Rank = sqrt(max screen % in any view) x severity. Severity sums the distance outside each class range (albedo in stops x1.4-1.8, roughness per 0.15, metalness per 0.3, saturation per 0.15, texel density in stops x0.8).

## Outliers by owner

| owner | outliers | high visibility |
|---|---|---|
| r2-art | 31 | 3 |
| r2-roads | 1 | 0 |
| r2-cars? | 16 | 0 |
| r2-keys | 5 | 0 |
| r2-veg | 57 | 0 |
| unknown | 2 | 0 |
| r2-ground | 1 | 0 |

## Ranked outliers (top 80)

| # | rank | owner | class | material | source (object chain) | albedo L / sat | rough / metal | texel px/m (map) | issues | where |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4.28 | r2-art | stucco | Building Facade | lib-curved_glass_tower < library-buildings < miami-city [glTF] | 0.101 / 0.06 | 0.248 / 0.045 | 84.3 (1024x1024) | albedo 0.101 < 0.28; roughness 0.248 < 0.78; texel 84 px/m < 128 (map 1024x1024) | downtown:drive0 0.5%, downtown:eye1 0.3%, downtown:aerial 0.0% |
| 2 | 3.42 | r2-roads | galvanized | M.guardrail | tile-near--5,24{tile} | 0.016 / 0.11 | 0.4 / 0.7 | - (-) | albedo 0.016 < 0.4; saturation 0.11 > 0.08 | rural:drive0 0.3%, nico:eye1 0.1%, rural:eye1 0.1% |
| 3 | 3.3 | r2-art | rawWood | wood | houses:spawn:1:wood < houses | 0.25 / 0.13 | 0.511 / 0 | 2624.9 (2048x2048) | roughness 0.511 < 0.68 | nico:street 8.5%, nico:eye1 1.4%, nico:eye0 1.0% |
| 4 | 2.68 | r2-art | building | Material | lib-deco_tower < library-buildings < miami-city [glTF] | 0.143 / 0.04 | 0.431 / 0 | 6.2 (256x64) | texel 6 px/m < 64 (map 256x64) | downtown:drive1 1.0%, downtown:eye3 0.4% |
| 5 | 1.71 | r2-cars? | galvanized | (unnamed) |  | 0.019 / 0.08 | 0.141 / 0.6 | - (-) | albedo 0.019 < 0.4; roughness 0.141 < 0.32; metalness 0.6 < 0.75 | downtown:eye3 0.0%, downtown:eye0 0.0% |
| 6 | 1.66 | r2-art | building | Surface 16 | lib-casino_tower < library-buildings < miami-city | 0.173 / 0.02 | 0.1 / 0.05 | - (-) | roughness 0.1 < 0.3 | downtown:eye1 1.6%, downtown:drive0 1.5%, downtown:aerial 1.4% |
| 7 | 1.28 | r2-keys | rawWood | Wood | keysLots [glTF] | 0.198 / 0.29 | 0.498 / 0 | 125.7 (1024x1024) | roughness 0.498 < 0.68; texel 126 px/m < 200 (map 1024x1024) | nico:drive1 0.5%, nico:eye2 0.5%, nico:street 0.3% |
| 8 | 1.26 | r2-art | brick | house:brick | town:Key Largo:far:house:brick < town:Key Largo:far < towns | 0.462 / 0.18 | 0.88 / 0 | 320 (512x512) | albedo 0.462 > 0.26 | rural:eye2 0.7%, rural:eye1 0.4%, rural:drive1 0.3% |
| 9 | 0.9 | r2-art | building | Material | lib-deco_tower < library-buildings < miami-city [glTF] | 0.126 / 0.03 | 0.431 / 0 | 27.4 (1024x256) | texel 27 px/m < 64 (map 1024x256) | downtown:eye1 0.9% |
| 10 | 0.73 | r2-cars? | galvanized | (unnamed) |  | 0.123 / 0.4 | 0.123 / 0.7 | - (-) | albedo 0.123 < 0.4; saturation 0.40 > 0.08; roughness 0.123 < 0.32; metalness 0.7 < 0.75 | rural:eye0 0.0%, rural:eye2 0.0%, rural:eye3 0.0% |
| 11 | 0.69 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.138 / 0.07 | 0.9 / 0 | 100.1 (64x1024) | texel 100 px/m < 200 (map 64x1024) | downtown:eye3 0.7%, downtown:eye1 0.5%, downtown:drive1 0.5% |
| 12 | 0.67 | r2-art | stucco | pbr:concrete_wall_008:1.6:0:0:0:14871030 | houses:spawn:1:pbr:concrete_wall_008:1.6:0:0:0:14871030::2.3 | 0.23 / 0.22 | 0.737 / 0 | 709.4 (1024x1024) | albedo 0.230 < 0.28; roughness 0.737 < 0.78 | nico:street 1.0%, rural:eye1 0.8%, rural:eye2 0.7% |
| 13 | 0.66 | r2-art | galvanized | (unnamed) | {sign} | 0.558 / 0.03 | 0.123 / 0.8 | - (-) | roughness 0.123 < 0.32 | downtown:eye1 0.3%, downtown:eye0 0.2%, downtown:drive0 0.1% |
| 14 | 0.54 | r2-art | galvanized | Building Maintenance Unit | lib-curved_glass_tower < library-buildings < miami-city [glTF] | 0.206 / 0.06 | 0.683 / 0.529 | 105.3 (1024x1024) | albedo 0.206 < 0.4; metalness 0.529 < 0.75; texel 105 px/m < 200 (map 1024x1024) | downtown:aerial 0.0% |
| 15 | 0.54 | r2-cars? | galvanized | (unnamed) |  | 0.023 / 0.15 | 0.141 / 0.7 | - (-) | albedo 0.023 < 0.4; saturation 0.15 > 0.08; roughness 0.141 < 0.32; metalness 0.7 < 0.75 | downtown:eye1 0.0%, downtown:eye0 0.0%, downtown:drive0 0.0% |
| 16 | 0.52 | r2-art | sand | pbr:shell_floor_01:2.6:0:0:0:::1.4:1::: | houses:spawn:1:pbr:shell_floor_01:2.6:0:0:0:::1.4:1::: < hou | 0.214 / 0.3 | 0.967 / 0 | 787.7 (2048x2048) | albedo 0.214 < 0.22; saturation 0.30 > 0.18 | nico:deck 0.4%, nico:eye1 0.2%, nico:eye0 0.1% |
| 17 | 0.51 | r2-cars? | galvanized | (unnamed) |  | 0.141 / 0.37 | 0.07 / 0.9 | - (-) | albedo 0.141 < 0.4; saturation 0.37 > 0.08; roughness 0.07 < 0.32 | rural:eye0 0.0%, rural:drive0 0.0%, rural:drive1 0.0% |
| 18 | 0.5 | unknown | generic | (unnamed) | vegCollars | 0.144 / 0.26 | 0.96 / 0 | 52.7 (128x128) | texel 53 px/m < 96 (map 128x128) | nico:street 0.5%, nico:deck 0.3%, nico:eye2 0.2% |
| 19 | 0.4 | r2-cars? | galvanized | (unnamed) |  | 0.048 / 0.27 | 0.123 / 0.6 | - (-) | albedo 0.048 < 0.4; saturation 0.27 > 0.08; roughness 0.123 < 0.32; metalness 0.6 < 0.75 | downtown:aerial 0.0% |
| 20 | 0.39 | r2-art | galvanized | (unnamed) | {sign} | 0.554 / 0.03 | 0.123 / 0.8 | - (-) | roughness 0.123 < 0.32 | downtown:eye3 0.1%, downtown:eye0 0.1% |
| 21 | 0.37 | r2-cars? | galvanized | (unnamed) |  | 0.113 / 0.13 | 0.193 / 0.85 | 320 (256x256) | albedo 0.113 < 0.4; saturation 0.13 > 0.08; roughness 0.193 < 0.32; normalScale 1 > 0.6 | downtown:aerial 0.0% |
| 22 | 0.35 | r2-cars? | skin | sig-head |  | 0.125 / 0.67 | 0.5 / 0 | - (-) | saturation 0.67 > 0.58 | downtown:drive0 0.3%, downtown:eye1 0.2%, nico:deck 0.0% |
| 23 | 0.35 | r2-cars? | galvanized | (unnamed) |  | 0.02 / 0.14 | 0.141 / 0.7 | - (-) | albedo 0.020 < 0.4; saturation 0.14 > 0.08; roughness 0.141 < 0.32; metalness 0.7 < 0.75 | downtown:eye1 0.0%, downtown:eye0 0.0% |
| 24 | 0.32 | r2-art | building | Roof | lib-old_brick_towers < library-buildings < miami-city [glTF] | 0.053 / 0.07 | 0.765 / 0 | 7.3 (256x256) | texel 7 px/m < 64 (map 256x256) | downtown:drive0 0.0%, downtown:eye2 0.0%, downtown:eye1 0.0% |
| 25 | 0.32 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.358 / 0.31 | 0.72 / 0 | 144.4 (128x1024) | albedo 0.358 > 0.19; texel 144 px/m < 200 (map 128x1024) | rural:eye3 0.0% |
| 26 | 0.31 | r2-cars? | galvanized | (unnamed) |  | 0.202 / 0.14 | 0.194 / 0.85 | 320 (256x256) | albedo 0.202 < 0.4; saturation 0.14 > 0.08; roughness 0.194 < 0.32; normalScale 1 > 0.6 | downtown:eye1 0.0%, downtown:eye0 0.0%, downtown:drive0 0.0% |
| 27 | 0.3 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.126 / 0.54 | 0.9 / 0 | 197.7 (128x1024) | saturation 0.54 > 0.38 | downtown:eye3 0.1%, downtown:drive1 0.1%, downtown:eye2 0.1% |
| 28 | 0.27 | r2-art | building | AIT01W2W3 | lib-grid_block < library-buildings < miami-city [glTF] | 0.093 / 0.05 | 0.859 / 0 | 37.7 (512x1024) | texel 38 px/m < 64 (map 512x1024) | downtown:aerial 0.2%, downtown:eye2 0.1%, downtown:drive1 0.0% |
| 29 | 0.26 | r2-cars? | galvanized | (unnamed) |  | 0.018 / 0.14 | 0.141 / 0.7 | - (-) | albedo 0.018 < 0.4; saturation 0.14 > 0.08; roughness 0.141 < 0.32; metalness 0.7 < 0.75 | downtown:eye0 0.0% |
| 30 | 0.25 | r2-veg | bark | (unnamed) | vegField_coconut < houses [glTF] | 0.155 / 0.03 | 0.9 / 0 | 135.3 (1024x1024) | texel 135 px/m < 200 (map 1024x1024) | nico:deck 0.3%, nico:eye0 0.2%, nico:eye1 0.1% |
| 31 | 0.25 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.151 / 0.08 | 0.9 / 0 | 93 (64x1024) | texel 93 px/m < 200 (map 64x1024) | downtown:aerial 0.1%, downtown:eye2 0.1%, downtown:drive0 0.0% |
| 32 | 0.24 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.257 / 0.17 | 0.72 / 0 | 302.5 (595x1024) | albedo 0.257 > 0.19 | nico:deck 0.1%, nico:eye1 0.1% |
| 33 | 0.23 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.115 / 0.45 | 0.9 / 0 | 441.3 (64x1024) | saturation 0.45 > 0.38 | rural:eye2 0.3%, rural:eye3 0.1%, rural:drive1 0.1% |
| 34 | 0.21 | r2-veg | foliage | (unnamed) | vegField_coconut < houses [glTF] | 0.28 / 0.17 | 0.72 / 0 | 298 (1024x1024) | albedo 0.280 > 0.19 | rural:drive1 0.0%, rural:eye3 0.0% |
| 35 | 0.19 | unknown | sign | M.graffiti | tile-near--5,24{tile} | 0.218 / 0.28 | 0.9 / 0 | 102.2 (1024x512) | roughness 0.9 > 0.7; texel 102 px/m < 128 (map 1024x512) | nico:eye0 0.0% |
| 36 | 0.19 | r2-art | stucco | Building Facade | lib-concrete_tower < library-buildings < miami-city [glTF] | 0.211 / 0.01 | 0.63 / 0.091 | 92.6 (1024x1024) | albedo 0.211 < 0.28; roughness 0.63 < 0.78; metalness 0.091 > 0.05; texel 93 px/m < 128 (map 1024x1024) | rural:drive1 0.0%, rural:eye3 0.0%, rural:drive0 0.0% |
| 37 | 0.18 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.26 / 0.16 | 0.72 / 0 | 374.5 (1024x1024) | albedo 0.260 > 0.19 | rural:drive1 0.1%, rural:drive0 0.0%, rural:eye1 0.0% |
| 38 | 0.18 | r2-art | glass | Windows | lib-old_brick_towers < library-buildings < miami-city [glTF] | 0 / 0 | 0.1 / 0 | 31.1 (256x256) | albedo 0.000 < 0.01; texel 31 px/m < 64 (map 256x256) | downtown:drive0 0.0% |
| 39 | 0.18 | r2-cars? | galvanized | (unnamed) |  | 0.205 / 0.15 | 0.194 / 0.85 | 320 (256x256) | albedo 0.205 < 0.4; saturation 0.15 > 0.08; roughness 0.194 < 0.32; normalScale 1 > 0.6 | downtown:eye3 0.0% |
| 40 | 0.17 | r2-keys | glass | Glass | keysLots [glTF] | 0.177 / 0.19 | 0.213 / 0 | 112.6 (1024x1024) | albedo 0.177 > 0.16; roughness 0.213 > 0.16; normalScale 1 > 0.3 | nico:drive1 0.0%, nico:eye3 0.0%, nico:street 0.0% |
| 41 | 0.16 | r2-art | galvanized | fin:steel | town:Key Largo:far:fin:steel < town:Key Largo:far < towns | 0.303 / 0.07 | 0.295 / 1 | - (-) | albedo 0.303 < 0.4; roughness 0.295 < 0.32 | nico:eye2 0.0%, nico:drive1 0.0%, rural:drive0 0.0% |
| 42 | 0.16 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.089 / 0.19 | 0.72 / 0 | 94.3 (512x512) | texel 94 px/m < 200 (map 512x512) | nico:eye2 0.0% |
| 43 | 0.16 | r2-veg | foliage | (unnamed) | vegField_coconut < houses [glTF] | 0.402 / 0.09 | 0.72 / 0 | 336.1 (1024x1024) | albedo 0.402 > 0.19 | rural:drive1 0.0% |
| 44 | 0.15 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.24 / 0.15 | 0.72 / 0 | 310.4 (595x1024) | albedo 0.240 > 0.19 | nico:drive1 0.1%, nico:eye1 0.0%, nico:eye2 0.0% |
| 45 | 0.14 | r2-keys | rawWood | Dock Diffuse | keysLots:Dock Diffuse < keysLots [glTF] | 0.306 / 0.06 | 1 / 0 | 237.9 (1024x1024) | roughness 1 > 0.94 | nico:eye2 0.1%, nico:eye3 0.1%, nico:drive1 0.1% |
| 46 | 0.13 | r2-art | generic | (unnamed) | apron < keys-welcome-sign | 0.079 / 0.25 | 0.95 / 0 | 18.7 (512x512) | texel 19 px/m < 96 (map 512x512) | nico:eye1 0.0%, nico:deck 0.0%, nico:eye3 0.0% |
| 47 | 0.12 | r2-art | building | AirTower01MAT | lib-control_tower < library-buildings < miami-city [glTF] | 0.216 / 0.07 | 0.673 / 0.066 | 2.2 (256x256) | texel 2 px/m < 64 (map 256x256) | nico:eye2 0.0% |
| 48 | 0.12 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.231 / 0.13 | 0.72 / 0 | 310.4 (595x1024) | albedo 0.231 > 0.19 | nico:eye1 0.1%, nico:deck 0.0% |
| 49 | 0.11 | r2-art | building | strip_diner_far | lib-strip_diner < library-buildings < miami-city [glTF] | 0.024 / 0.02 | 0.6 / 0 | 15.6 (1024x1024) | albedo 0.024 < 0.03; texel 16 px/m < 64 (map 1024x1024) | downtown:drive0 0.0%, downtown:eye1 0.0% |
| 50 | 0.11 | r2-art | generic | Color 009 1 | miami-city | 0.011 / 0.3 | 0.96 / 0 | - (-) | albedo 0.011 < 0.015 | rural:drive1 0.0%, rural:eye3 0.0%, rural:eye1 0.0% |
| 51 | 0.11 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.244 / 0.19 | 0.72 / 0 | 353.7 (1024x1024) | albedo 0.244 > 0.19 | nico:deck 0.0%, nico:eye0 0.0%, nico:eye2 0.0% |
| 52 | 0.11 | r2-art | building | Towers | lib-old_brick_towers < library-buildings < miami-city [glTF] | 0.15 / 0.04 | 0.696 / 0 | 8.3 (256x256) | texel 8 px/m < 64 (map 256x256) | downtown:eye1 0.0%, downtown:drive0 0.0% |
| 53 | 0.1 | r2-keys | metalPainted | Metal | keysLots [glTF] | 0.361 / 0.16 | 0.616 / 0 | 128.3 (1024x1024) | normalScale 1 > 0.6; texel 128 px/m < 200 (map 1024x1024) | nico:drive1 0.0%, nico:street 0.0%, nico:eye3 0.0% |
| 54 | 0.1 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.134 / 0.48 | 0.9 / 0 | 3160.5 (1024x1024) | saturation 0.48 > 0.38 | rural:drive0 0.0%, rural:eye0 0.0%, nico:eye1 0.0% |
| 55 | 0.09 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.111 / 0.44 | 0.9 / 0 | 2342.5 (1024x1024) | saturation 0.44 > 0.38 | nico:deck 0.0%, nico:eye1 0.0%, nico:eye0 0.0% |
| 56 | 0.09 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.226 / 0.01 | 0.72 / 0 | 1436.6 (1024x1024) | albedo 0.226 > 0.19 | downtown:eye1 0.0% |
| 57 | 0.09 | r2-veg | bark | (unnamed) |  [glTF] | 0.118 / 0.33 | 0.9 / 0 | 135.3 (1024x1024) | texel 135 px/m < 200 (map 1024x1024) | nico:eye2 0.0%, nico:drive1 0.0%, nico:eye1 0.0% |
| 58 | 0.09 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.358 / 0.08 | 0.72 / 0 | 894.4 (1024x760) | albedo 0.358 > 0.19 | rural:drive1 0.0% |
| 59 | 0.08 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.115 / 0.19 | 0.72 / 0 | 133.7 (64x1024) | texel 134 px/m < 200 (map 64x1024) | downtown:eye2 0.0%, downtown:eye3 0.0%, downtown:eye1 0.0% |
| 60 | 0.08 | r2-cars? | generic | (unnamed) |  | 0.006 / 0.22 | 0.132 / 0 | - (-) | albedo 0.006 < 0.015 | downtown:eye1 0.0%, downtown:eye0 0.0%, downtown:drive0 0.0% |
| 61 | 0.08 | r2-veg | bark | (unnamed) | vegField_coconut < houses [glTF] | 0.13 / 0.33 | 0.9 / 0 | 135.3 (1024x1024) | texel 135 px/m < 200 (map 1024x1024) | rural:eye0 0.0%, rural:drive0 0.0% |
| 62 | 0.06 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.224 / 0.11 | 0.72 / 0 | 1303 (492x492) | albedo 0.224 > 0.19 | rural:eye2 0.0%, rural:eye3 0.0%, rural:drive1 0.0% |
| 63 | 0.06 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.291 / 0.2 | 0.72 / 0 | 324.5 (1024x1024) | albedo 0.291 > 0.19 | rural:eye0 0.0% |
| 64 | 0.06 | r2-art | metalPainted | Rail Short | miami-city [glTF] | 0.242 / 0.01 | 0.278 / 0.341 | 231.4 (512x512) | metalness 0.341 > 0.15 | rural:eye3 0.0%, rural:drive1 0.0%, rural:eye0 0.0% |
| 65 | 0.06 | r2-art | glass | Windows | lib-ranch_house < library-buildings < miami-city [glTF] | 0.216 / 0.01 | 0.05 / 0 | 458.2 (903x709) | albedo 0.216 > 0.16 | rural:eye3 0.0%, rural:drive1 0.0% |
| 66 | 0.06 | r2-art | building | Material #65 | lib-fire_station < library-buildings < miami-city [glTF] | 0.112 / 0.21 | 0.859 / 0 | 13.5 (256x256) | texel 14 px/m < 64 (map 256x256) | downtown:drive0 0.0% |
| 67 | 0.06 | r2-art | plastic | Plastic Table | miami-city [glTF] | 0.323 / 1 | 0.44 / 0 | 144.8 (512x512) | saturation 1.00 > 0.72 | rural:drive1 0.0% |
| 68 | 0.06 | r2-veg | bark | (unnamed) | miami-city [glTF] | 0.136 / 0.49 | 0.9 / 0 | 213.2 (128x1024) | saturation 0.49 > 0.38 | downtown:aerial 0.0%, downtown:eye2 0.0%, downtown:drive0 0.0% |
| 69 | 0.06 | r2-cars? | generic | (unnamed) |  | 0.006 / 0.22 | 0.132 / 0 | - (-) | albedo 0.006 < 0.015 | downtown:eye0 0.0% |
| 70 | 0.05 | r2-art | building | airliner_far | lib-airliner < library-buildings < miami-city [glTF] | 0.316 / 0.01 | 0.6 / 0 | 25.4 (1024x1024) | texel 25 px/m < 64 (map 1024x1024) | downtown:drive0 0.0%, downtown:eye1 0.0% |
| 71 | 0.05 | r2-veg | bark | (unnamed) | countryside [glTF] | 0.107 / 0.32 | 0.9 / 0 | 104.3 (64x1024) | texel 104 px/m < 200 (map 64x1024) | rural:drive0 0.0% |
| 72 | 0.04 | r2-keys | plastic | Plastic | keysLots [glTF] | 0.268 / 0.24 | 0.439 / 0 | 122.3 (1024x1024) | normalScale 1 > 0.6; texel 122 px/m < 128 (map 1024x1024) | nico:eye3 0.0%, nico:drive1 0.0%, nico:street 0.0% |
| 73 | 0.04 | r2-art | building | Surface 1 | lib-casino_tower < library-buildings < miami-city | 0.12 / 0.1 | 0.1 / 0.05 | - (-) | roughness 0.1 < 0.3 | downtown:eye1 0.0% |
| 74 | 0.04 | r2-art | building | Lambert1 | lib-factory_plant < library-buildings < miami-city [glTF] | 0.096 / 0.07 | 0.75 / 0.129 | 30.7 (2048x2048) | texel 31 px/m < 64 (map 2048x2048) | downtown:drive0 0.0%, rural:drive1 0.0% |
| 75 | 0.04 | r2-veg | bark | (unnamed) | vegField_coconut < houses [glTF] | 0.15 / 0.12 | 0.9 / 0 | 135.3 (1024x1024) | texel 135 px/m < 200 (map 1024x1024) | rural:eye0 0.0% |
| 76 | 0.03 | r2-art | sign | art:signs:Key Largo | town:Key Largo:far:art:signs:Key Largo < town:Key Largo:far  | 0.127 / 0.36 | 0.75 / 0 | 115.6 (2048x1024) | roughness 0.75 > 0.7; texel 116 px/m < 128 (map 2048x1024) | nico:eye1 0.0% |
| 77 | 0.03 | r2-veg | foliage | (unnamed) | miami-city [glTF] | 0.11 / 0.4 | 0.72 / 0 | 123.8 (64x1024) | texel 124 px/m < 200 (map 64x1024) | downtown:aerial 0.0%, downtown:eye2 0.0%, downtown:eye1 0.0% |
| 78 | 0.03 | r2-cars? | generic | (unnamed) |  | 0.055 / 0.86 | 0.264 / 0 | - (-) | saturation 0.86 > 0.8 | downtown:eye0 0.0% |
| 79 | 0.03 | r2-veg | foliage | (unnamed) | countryside [glTF] | 0.127 / 0.45 | 0.72 / 0 | 138.5 (64x1024) | texel 139 px/m < 200 (map 64x1024) | rural:eye3 0.0%, rural:eye0 0.0% |
| 80 | 0.02 | r2-veg | generic | (unnamed) |  | 1.017 / 0.11 | 0.8 / 0 | - (x) | albedo 1.017 > 0.82 | rural:drive0 0.0%, nico:street 0.0% |

## Views

- nico:deck: 322 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_deck.jpg`
- nico:street: 224 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_street.jpg`
- nico:eye0: 274 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_eye0.jpg`
- nico:eye1: 274 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_eye1.jpg`
- nico:eye2: 232 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_eye2.jpg`
- nico:eye3: 194 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_eye3.jpg`
- nico:drive1: 200 materials, sky 0%, `docs/v2/shots/art/audit/base_nico_drive1.jpg`
- downtown:aerial: 77 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_aerial.jpg`
- downtown:eye0: 61 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye0.jpg`
- downtown:eye1: 126 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye1.jpg`
- downtown:eye2: 76 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye2.jpg`
- downtown:eye3: 89 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_eye3.jpg`
- downtown:drive0: 98 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_drive0.jpg`
- downtown:drive1: 79 materials, sky 0%, `docs/v2/shots/art/audit/base_downtown_drive1.jpg`
- rural:eye0: 238 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye0.jpg`
- rural:eye1: 107 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye1.jpg`
- rural:eye2: 76 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye2.jpg`
- rural:eye3: 201 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_eye3.jpg`
- rural:drive0: 246 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_drive0.jpg`
- rural:drive1: 217 materials, sky 0%, `docs/v2/shots/art/audit/base_rural_drive1.jpg`

## Console errors

- LOG Failed to load resource: the server responded with a status of 404 (Not Found) http://127.0.0.1:5200/favicon.ico
- ERR [vehicles] failed ReferenceError: Cannot access 'noPark' before initialization     at parkChecked (http://127.0.0.1:5200/src/vehicles/vehicles.js?t=1794940405184:1357:22)     at createVehicles (http://127.0.0.1:5200/src/vehicles/vehicles.js?t=1794940405184:1336:49)     at async safe (http://127.
- LOG Failed to load resource: the server responded with a status of 500 (Internal Server Error) http://127.0.0.1:5200/src/world/setpieces/nicoHouse/parts/05_site.js?t=1794940635913
- ERR [v2:./world/setpieces/nicoHouse/nicoHouse.v2.js] failed TypeError: Failed to fetch dynamically imported module: http://127.0.0.1:5200/src/world/setpieces/nicoHouse/nicoHouse.v2.js?t=1794940635913
