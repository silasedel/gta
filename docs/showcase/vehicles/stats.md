# Port Solana — vehicle lineup stats

Generated from the live parametric generator (`src/vehicles/catalog.js` + `carModel.js` + `bodyLoft.js`). All brands, names and designs are invented.

- **Base models:** 52 across 12 classes (city cars, hatches, hot hatch, rally, compact/mid/full/luxury/executive sedans, coupes, GTs, roadsters & convertibles, muscle, supercars, hypercar, compact/mid/full-size/luxury SUVs, off-roaders, mid/full/heavy-duty pickups, panel van, passenger van, minibus, box truck, step van, city bus, taxis, police sedan/SUV/unmarked, ambulance, fire engine).
- **Variant combinations:** ~53,590 (paint palette x body kit [base/sport/lux] x wheel design [5 spoke patterns x 6 finishes or OEM] x two-tone roof). Every spawned car also gets a unique made-up Calora licence plate.
- **LODs:** 3 levels per body (THREE.LOD; switch at 38 m / 110 m, x2.2 for heavy vehicles). LOD1 drops interior, mirrors, plates, small chrome and seams; LOD2 keeps only paint/glass/roof/trim + head/tail lights. Wheels swap to a 14-segment low tyre beyond 70 m (160 m heavy).
- **Body construction:** side profile -> lofted cross-sections (smooth barrel sides, rounded shoulders, tumblehome greenhouse, crowned hood/roof, plan-view corner rounding). Pillars, drip rails, B-pillar and roof are material regions of the same lofted greenhouse surface. Details (lights, grilles, handles, seams, mirrors, badges, wipers, antenna, interior, exhaust tips, flares, kits) are sculpted onto the same surface function.
- **Collision:** convex hull chassis built from the LOD2 body (paint + cabin + box), ray-cast wheels with true radius.

## Models

| key | brand | model | class | engine | aspiration | mass kg | drive force N | top km/h | drive | grip | susp rest/k | colours | LOD0 tris/meshes | LOD1 | LOD2 | wheels tris (4) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compact | Pico | Uno | compact | i4/4cyl | na | 1150 | 5800 | 175 | fwd | 2.3 | 0.34/38 | 8 | 12038/24 | 5764/11 | 2484/6 | 13760 |
| pico_volt | Pico | Volt | compact | electric | electric | 950 | 5200 | 150 | fwd | 2.3 | 0.33/38 | 8 | 12038/24 | 5764/11 | 2484/6 | 13760 |
| mirabel_dot | Mirabel | Dot | compact | i4/3cyl | turbo | 950 | 4600 | 150 | fwd | 2.3 | 0.33/38 | 8 | 12038/24 | 5764/11 | 2484/6 | 13712 |
| tarpon_go | Tarpon | Go | compact | i4/3cyl | turbo | 950 | 4600 | 150 | fwd | 2.3 | 0.33/38 | 10 | 12038/24 | 5764/11 | 2484/6 | 13712 |
| marlin_hatch | Marlin | Coast 5 | compact | i4/4cyl | na | 1150 | 5800 | 175 | fwd | 2.3 | 0.34/38 | 10 | 12038/24 | 5764/11 | 2484/6 | 13760 |
| kestrel_line_h | Kestrel | Line H | compact | i4/4cyl | turbo | 1150 | 6600 | 175 | fwd | 2.3 | 0.34/38 | 10 | 12038/24 | 5764/11 | 2484/6 | 13760 |
| pico_rs | Pico | Uno RS | sports | i4/4cyl | turbo | 1150 | 8200 | 230 | fwd | 2.7 | 0.3/44 | 8 | 12194/24 | 5920/11 | 2544/6 | 13952 |
| kestrel_rally | Kestrel | Terra R | sports | i4/4cyl | turbo | 1150 | 9000 | 225 | awd | 2.6 | 0.38/36 | 8 | 12438/24 | 6164/11 | 2884/6 | 13760 |
| kestrel_line | Kestrel | Line | sedan | i4/4cyl | na | 1400 | 6800 | 185 | fwd | 2.2 | 0.36/34 | 10 | 12014/24 | 5764/11 | 2484/6 | 14048 |
| sedan | Marlin | Coastline | sedan | i4/4cyl | na | 1400 | 6800 | 185 | fwd | 2.2 | 0.36/34 | 10 | 12014/24 | 5764/11 | 2484/6 | 13712 |
| osprey_mid | Osprey | Meridian | sedan | v6/6cyl | na | 1400 | 7600 | 185 | fwd | 2.2 | 0.36/34 | 10 | 12014/24 | 5764/11 | 2484/6 | 13760 |
| cayo_grand | Cayo | Grandeur | sedan | v6/6cyl | na | 1650 | 8400 | 185 | fwd | 2.2 | 0.36/34 | 7 | 12038/24 | 5788/11 | 2484/6 | 14048 |
| marlin_cab | Marlin | Coastline Cabrio | sports | v6/6cyl | na | 1400 | 7600 | 185 | fwd | 2.2 | 0.36/34 | 8 | 10118/23 | 5554/10 | 2346/5 | 14048 |
| luxury | Aurelia | Regent | sedan | v8/8cyl | twin-turbo | 1950 | 11000 | 250 | awd | 2.3 | 0.38/29 | 7 | 12086/24 | 5836/11 | 2484/6 | 14048 |
| aurelia_sov | Aurelia | Sovereign L | sedan | v8/8cyl | twin-turbo | 2150 | 12000 | 250 | awd | 2.3 | 0.38/29 | 7 | 12086/24 | 5836/11 | 2484/6 | 13952 |
| halcyon_vesta | Halcyon | Vesta | sedan | v6/6cyl | twin-turbo | 1950 | 10500 | 250 | rwd | 2.3 | 0.38/29 | 7 | 12086/24 | 5836/11 | 2484/6 | 13856 |
| halcyon_e | Halcyon | Vesta E | sedan | electric | electric | 1950 | 13000 | 240 | awd | 2.3 | 0.38/29 | 7 | 12062/24 | 5812/11 | 2484/6 | 13952 |
| solano_corsa | Solano | Corsa | sports | i4/4cyl | turbo | 1450 | 8200 | 230 | rwd | 2.4 | 0.32/40 | 8 | 11966/24 | 5728/11 | 2508/6 | 13856 |
| sports | Solano | GT 400 | sports | v6/6cyl | twin-turbo | 1350 | 9800 | 260 | rwd | 2.6 | 0.3/42 | 8 | 11594/24 | 5356/11 | 2568/6 | 13760 |
| aurelia_gt | Aurelia | Gran Tourer | sports | v12/12cyl | na | 1800 | 12500 | 300 | rwd | 2.4 | 0.32/40 | 7 | 11582/24 | 5344/11 | 2508/6 | 13856 |
| roadster | Aurelia | Spyder | sports | i4/4cyl | turbo | 1150 | 8600 | 235 | rwd | 2.6 | 0.3/44 | 8 | 9686/23 | 5122/10 | 2346/5 | 13856 |
| pico_spider | Pico | Spider | sports | i4/4cyl | na | 1000 | 6600 | 205 | rwd | 2.6 | 0.3/44 | 8 | 9686/23 | 5122/10 | 2346/5 | 13952 |
| vireo_barchetta | Vireo | Barchetta | super | v10/10cyl | na | 1150 | 12500 | 310 | awd | 3 | 0.3/44 | 8 | 10430/23 | 5866/10 | 2970/5 | 13952 |
| muscle | Brava | Thunder 6.4 | muscle | v8/8cyl | na | 1650 | 10500 | 250 | rwd | 2.25 | 0.36/31 | 8 | 12390/24 | 6152/11 | 2872/6 | 13712 |
| brava_stallion | Brava | Stallion | muscle | v8/8cyl | supercharged | 1650 | 11800 | 270 | rwd | 2.25 | 0.36/31 | 8 | 12390/24 | 6152/11 | 2872/6 | 13856 |
| tarpon_classic | Tarpon | Bayline 69 | muscle | v8/8cyl | na | 1650 | 9200 | 220 | rwd | 2.25 | 0.36/31 | 8 | 12050/24 | 5812/11 | 2508/6 | 13712 |
| super | Vireo | Saetta V12 | super | v12/12cyl | na | 1450 | 13200 | 330 | awd | 3.1 | 0.26/56 | 8 | 12438/24 | 6212/11 | 3676/6 | 13712 |
| vireo_fulmine | Vireo | Fulmine | super | v10/10cyl | na | 1450 | 12600 | 320 | awd | 3.1 | 0.26/56 | 8 | 12438/24 | 6212/11 | 3676/6 | 13760 |
| solano_scirocco | Solano | Scirocco | super | v8/8cyl | supercharged | 1450 | 12000 | 315 | awd | 3.1 | 0.26/56 | 8 | 12438/24 | 6212/11 | 3676/6 | 13712 |
| vireo_aeterna | Vireo | Aeterna | super | v12/16cyl | quad-turbo | 1800 | 17000 | 400 | awd | 3.1 | 0.26/56 | 7 | 12438/24 | 6212/11 | 3676/6 | 13760 |
| cayo_mini | Cayo | Breeze | suv | i4/4cyl | turbo | 1450 | 6600 | 200 | awd | 2.2 | 0.42/25 | 8 | 12146/24 | 5872/11 | 2568/6 | 13952 |
| suv | Cayo | Trail XL | suv | v6/6cyl | na | 1850 | 8200 | 200 | awd | 2.2 | 0.42/25 | 10 | 12146/24 | 5872/11 | 2568/6 | 13952 |
| cayo_max | Cayo | Max | suv | v8/8cyl | na | 2500 | 10500 | 200 | awd | 2.2 | 0.42/25 | 10 | 12146/24 | 5872/11 | 2568/6 | 13856 |
| aurelia_x | Aurelia | Xanthe | suv | v8/8cyl | twin-turbo | 1850 | 11500 | 250 | awd | 2.2 | 0.42/25 | 7 | 12194/24 | 5920/11 | 2568/6 | 13760 |
| ridgeback_scout | Ridgeback | Scout | suv | v6/6cyl | na | 2100 | 8000 | 170 | awd | 2 | 0.48/22 | 6 | 12206/25 | 5884/11 | 2580/6 | 14048 |
| ridgeback_dune | Ridgeback | Dune 2 | suv | v8/8cyl | na | 2100 | 8000 | 170 | awd | 2 | 0.48/22 | 8 | 10358/24 | 5710/10 | 2418/5 | 13952 |
| ridgeback_mid | Ridgeback | 1500 Trail | pickup | v6/6cyl | na | 1900 | 9800 | 180 | rwd | 2.1 | 0.42/29 | 6 | 12134/24 | 5896/11 | 2568/6 | 13856 |
| pickup | Ridgeback | 2500 HD | pickup | diesel/6cyl | turbo | 2100 | 9800 | 180 | rwd | 2.1 | 0.42/29 | 6 | 12134/24 | 5896/11 | 2568/6 | 13952 |
| ridgeback_3500 | Ridgeback | 3500 Dually | pickup | diesel/6cyl | turbo | 2900 | 11500 | 165 | rwd | 2.1 | 0.42/29 | 6 | 12134/24 | 5896/11 | 2568/6 | 13952 |
| van | Corvo | Cargo | van | diesel/6cyl | turbo | 2300 | 7200 | 150 | rwd | 1.9 | 0.4/28 | 6 | 12074/24 | 5848/11 | 2544/6 | 13760 |
| corvo_shuttle | Corvo | Shuttle | van | diesel/6cyl | turbo | 2300 | 7200 | 150 | rwd | 1.9 | 0.4/28 | 6 | 12098/24 | 5872/11 | 2568/6 | 13856 |
| corvo_minibus | Corvo | Metro 16 | van | diesel/6cyl | turbo | 3400 | 9500 | 130 | rwd | 1.9 | 0.4/28 | 6 | 12098/24 | 5872/11 | 2568/6 | 13856 |
| atlas_box | Atlas | Box 26 | truck | diesel/6cyl | turbo | 5200 | 15000 | 115 | rwd | 1.8 | 0.42/30 | 6 | 12358/25 | 6108/12 | 2800/7 | 13760 |
| atlas_step | Atlas | Step Van | truck | diesel/6cyl | turbo | 4000 | 15000 | 115 | rwd | 1.8 | 0.42/30 | 6 | 12382/25 | 6108/12 | 2800/7 | 13856 |
| citybus | Solana Transit | Metro S12 | bus | diesel/6cyl | turbo | 11000 | 26000 | 95 | rwd | 1.8 | 0.42/30 | 1 | 12590/27 | 6340/14 | 2700/6 | 13760 |
| taxi | Marlin | Coastline Cab | taxi | i4/4cyl | na | 1400 | 6800 | 170 | fwd | 2.2 | 0.36/34 | 1 | 12042/27 | 5792/14 | 2496/6 | 13712 |
| taxi_xl | Cayo | Trail Cab XL | taxi | v6/6cyl | na | 1850 | 8200 | 200 | awd | 2.2 | 0.42/25 | 1 | 12174/27 | 5900/14 | 2580/6 | 13952 |
| police | Marlin | Interceptor | police | v8/8cyl | na | 1400 | 8800 | 230 | fwd | 2.5 | 0.36/34 | 1 | 12126/28 | 5876/15 | 2532/6 | 13952 |
| police_suv | Cayo | Interceptor Utility | police | v8/8cyl | na | 1850 | 9800 | 220 | awd | 2.2 | 0.42/25 | 1 | 12258/28 | 5984/15 | 2616/6 | 13856 |
| unmarked | Osprey | Meridian (unmarked) | police | v8/8cyl | na | 1400 | 8800 | 230 | fwd | 2.2 | 0.36/34 | 3 | 12062/26 | 5812/13 | 2484/6 | 13712 |
| ambulance | Corvo | Medic One | van | diesel/6cyl | turbo | 4200 | 13000 | 140 | rwd | 1.8 | 0.42/30 | 1 | 12494/30 | 6208/16 | 2812/7 | 13760 |
| firetruck | Atlas | Engine 9 | truck | diesel/6cyl | turbo | 9000 | 24000 | 120 | rwd | 1.8 | 0.42/30 | 1 | 13442/28 | 6208/15 | 2812/6 | 13760 |

## Handling notes

- Automatic gearbox per model (3–9 ratios + final drive), torque curve by engine type (diesel flat-low, EV single gear, petrol peaky). Shift cuts, burnout clutch slip, rev-matched downshifts; exposed as vehicle.rpm/gear/throttle/load.
- Supercars/hypercar: downforce scale 1.2–2.0x, AWD, stiff low suspension. Muscle cars: reduced rear grip + power-oversteer (rear side friction drops with throttle+steer). SUVs/vans/trucks: soft springs, high CoM, large visual body roll. Handbrake drifts on all RWD/AWD cars.
- Measured (Rapier, 60 Hz): supercar 0–100 km/h 2.8 s; GT 4.2 s; muscle 4.4 s; compact 6.3 s; van ~14 s to 90 km/h.
