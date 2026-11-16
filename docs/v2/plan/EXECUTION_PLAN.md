# Execution plan: who does what (2026-11-15)

Inputs: section 13 of BIG_UPDATE_PLAN.md (the user's 50 answers), `~/Downloads/Models` (354 catalog rows: 50 cars, 36 NPC rows so far with about 102 Tripo people being organized, 15 buildings, 24 weapons, 14 boats, 21 trees), the road map and house images in `docs/v2/plan/`.

## Accounts (usage = weeks of a $200 plan)
| Lane | Account | Work | Estimate |
|---|---|---|---|
| A. Look + map | the user's own account (resets Thursday) | rendering/grain fix, locked 1080p/60 fps, smaller map traced from the road map, road system with signs/crosswalks/lights, Nico's house + neighborhood match, bug list | 0.8 week |
| B. Models + interiors | friend's $200 account (unused week) | import cars (to about 100), boats/air, buildings, props, all Tripo people (rig to the game skeleton, recolor variants), shop and casino shells built in code, interiors | 0.8 week |
| C. Gameplay | dad's account | police (GTA V scale + star 6), witnesses and cameras, dialogue wheel and NPC memory, shops and robbery, hotwire/theft, damage, jail, aircraft, side jobs, street events, then the casino heist if usage remains | 0.9 week |
| Lead (this account, nearly empty until reset) | | merge branches, run the Mac app, send screenshots after each big step, publish V2.1 | small |
Total about 2.5 weeks of usage, about 1 calendar week if lanes run in parallel. If a lane runs short, a capped top-up of about $300-600 covers it. Each lane works on its own git branch (`lane-a`, `lane-b`, `lane-c`) and never edits another lane's files; the lead merges in the order A, B, C.

## Start order
1. Lane A starts first (look is judged through everything else); Lane B starts the same day on imports; Lane C starts on police/NPC systems that do not depend on the new map.
2. After A's rendering step: user approval of screenshots. After the map step: user approval.
3. Merge A + B, then C. Test in the Mac app. Heist last.

## What exists vs what is missing (target = section 13)
| Need | Have | Missing |
|---|---|---|
| Cars | 50 | about 50 more: sedans, SUVs, trucks, vans, sports; plus taxi, 2-3 police cruisers, police bike, SWAT truck, ambulance, fire truck, garbage truck, delivery vans, 3 more buses |
| Boats / jet skis | 14 / 2 | 1-2 yachts, 2 more jet skis |
| Air | 3 heli, 3 planes | police helicopter, a small airport terminal |
| People | about 102 Tripo (in progress) + 3 | Nico (own face), 4 stragglers; a few kids; everything rigged |
| Buildings | 15 | about 45 more: downtown towers 15, apartments 8, houses 10, shop fronts/strip malls 10, hotels 4, port/warehouses 6, plus I generate extras from modular kits |
| Interiors/props | casino tables 8, shelves 5, kitchens 5, display cases 1, chairs 1 | slot machines (Tripo, 3 variants), bar bottles and glasses, stools, grocery shelves and coolers, registers, clothing racks, shoe shelf and shoes (Tripo), jail cell bunk/toilet, lockers, desks, couches, beds, vault door, cash stacks, duffel bag |
| Street props | bins 8, signs 8, lights 1, lamps 1, hydrants 3 | more traffic light and street lamp variants, bus stops, parking meters, news boxes, crosswalk signals, billboards |
| Animals | 10 | seagull, pelican, alligator, dog if missing |
| Textures | none | free CC0 road, wall, floor, carpet, tile textures |

## What the lanes build in code (not downloaded)
Casino bar and floor shell, shop shells (grocery, gas, gun, shoe, clothing, restaurant, pawn, barber), jail, roads, curbs, crosswalks, lane markings, sidewalks, signs, speed and red-light cameras, lights, weather, water, terrain, hitboxes.

## Tripo to-do (single props and people only)
Nico (own face), 3 slot-machine variants, 5 shoe styles, mask, cap, cash duffel, cash stacks, vault door, jail bunk, a few extra NPC types.

## Download to-do (free, CC0 or free for games; record the license page for each)
50 cars; 45 buildings; casino bar stools and bottles; grocery and clothing shop props; police station and jail props; yacht, jet skis; airport props; street furniture; 4 animals.

## Risks
- Catalog licenses are "unknown" for 312 rows and 4 are marked personal use only: record the license page and drop the 4 from the public build.
- 60 fps with 100+ people and a dense map: crowd LOD and instancing needed in lane B.
- Tripo hands are flat and clothes are baked in: fine for crowds, special handling for talking characters.
