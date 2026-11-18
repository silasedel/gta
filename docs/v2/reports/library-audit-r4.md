# Library audit r4 (Nov 18): code-built props vs the user's library

The user said "no more of your crappy models". This file lists every code-built prop the player can see and the best match in
`Models/catalog.csv` for each. The last section lists what the library is missing, with search terms for downloading it.

How to read the table:
- **SWAPPED r4**: now uses the library model. The code version stays as the fallback while the file loads, if the file is
  missing, or with `?libprops=0` (dogs: `?libdog=0`).
- **already library**: done before r4.
- **candidate**: a good match that is not swapped yet.
- **partial**: something similar exists, but it does not really fit.
- **none**: nothing in the library. These are in the download list.

The visibility column marks a prop **high** when it is common on streets or the beach, or in a place the player visits often,
and close to the camera.

## Swapped in r4

| prop | was | now (library) | file | budget |
|---|---|---|---|---|
| walked dogs | capsule + sphere dog, cylinder legs (`npc/peds.js` makeDog) | **Dog 1, Rigged Doberman**: rig kept (31 bones), procedural walk, trot and idle, ground snap. Three coat colors (black, red and blue Doberman). | `animals/dog_doberman.glb` + `_red/_blue.jpg` | 4.1k tris, 1K |
| beach umbrellas (sunbathers) | cone + pole | **Umbrella 1** (colored panels) and **Umbrella 2** (orange and white stripes), picked at random | `street/umbrella_beach1/2.glb` | 2.0k / 0.6k tris, 1K |
| storefront ATMs | 4 boxes + canvas screen (`gameplay/world.js`) | **ATM 1** (the logo-free texture from r3-props) | `street/atm.glb` | 6k tris, 1K |
| police roadblock barrier | striped box + 2 legs (`gameplay/police.js`) | **Sign Set 8**, striped barricade. Collider fitted to it. | `street/barricade2.glb` | 3k tris |
| NPC baseball caps (cap, capBack) | sphere + disc brim (`npc/props.js` hat) | **Cap 1**: one cap, colored per person like before (brim can be a second color) | `street/cap.glb` | 0.7k tris, no texture |
| picnic tables (spawn street, Keys lots) | box planks (`dressing/kit.js`) | **Picnic Table 1**, dark weathered wood, instanced | `street/picnic_table.glb` | 3k tris (from 10k), 1K (from 4K) |
| gas station trash can | lathe can (`interiors/fixtures/retail.js`) | **Street Props Pack 1**, TrashCommercial | `street/bin_commercial.glb` | 1.5k tris |

## NPCs and the player

| prop | builder | seen | vis | library match |
|---|---|---|---|---|
| baseball cap | `npc/props.js` hat | worn by NPCs | high | **SWAPPED r4**: Cap 1 |
| straw hat, bucket hat, fedora, visor, beanie, hard hat, headwrap | `npc/props.js` hat | worn by NPCs | high | none |
| sunglasses / glasses | `npc/props.js:258` | NPC faces | high | none |
| headphones | `npc/props.js:259` | NPC heads | med | none |
| lanyard, stethoscope, camera, neck chain | `npc/props.js:260-263` | NPC necks | med | partial: Chain 1 is a long rigging chain, not jewelry |
| apron, tool belt | `npc/props.js:264-265` | vendors, workers | med | none |
| cane, baby carrier | `npc/props.js` | seniors, parents | med | none |
| tote, shopping bags, briefcase, purse, backpack, duffel, yoga mat | `npc/props.js:237-243` | carried by NPCs | high | none |
| beach towel (walkers), draped towel, flip-flops | `npc/props.js:134`, `npc/beachTowel.js` | beach | high | candidate: Beach Kit 1 has a towel (flat, 2K). Flip-flops: none |
| beach umbrella | `npc/peds.js` makeUmbrella | beach | high | **SWAPPED r4**: Umbrella 1 / 2 (Umbrella 4 is a spare) |
| beach ball | `npc/peds.js` propGeo.ball | beach | med | candidate: Beach Kit 1 ball |
| frisbee | `npc/peds.js` propGeo.disc | beach | low | none |
| walked dog | `npc/peds.js` makeDog | residential, parks | high | **SWAPPED r4**: Dog 1. Dog 2 (short-hair) is a spare breed, but its FBX bind pose comes in rotated and its only take is a sit / roll, so it needs a Blender cleanup first. Dog 5 is a Call of Duty rip and stays reference only. |
| phone | `player/pedStyle.js:191` | player, cops, staff | high | none |
| cop cap, duty belt | `player/pedStyle.js`, `police.js:37` | cops | med | none |
| wristwatch, neck chain | `player/wardrobe/outfit.js` | player | med | none |
| stroller, scooter, walker, bike, skateboard, luggage, hand truck, cooler, vendor carts, chairs, crate, cone, tools, guitar, speaker, gurney (rest of PROP_BUILDERS) | `npc/props.js` | only in the props preview page today | low | cooler: Cooler 1 / 2. Hand truck: partial (Trolley 3). Cone: already a GLB on the streets (`street/cone.glb`). Chair: Table And Chairs 1. Bicycle, stroller, skateboard, guitar: none |

## Weapons and pickups

| prop | builder | vis | library match |
|---|---|---|---|
| revolver, shotgun, sawn-off, grenade, molotov | `gameplay/gunModels.js` BUILD | high | none (the Weapons rows are pistols, rifles, SMGs, bats, crowbars and a machete, all already in use) |
| knife | `gunModels.js` BUILD | high | partial: Knife 1 is a fish fillet knife |
| bottle (weapon) | `gunModels.js` BUILD | med | none: Bottle Set 1 is plastic water bottles |
| armor crate, first-aid kit, ammo box | `gameplay/pickups.js` | med | already library (Crates, First Aid Box 1, Ammo Box 1) |
| cash stack | `pickups.js:61` | med | none |
| scallop shell collectible | `activities.js:433` | low | none |
| police roadblock barrier | `police.js` makeBarrier | med | **SWAPPED r4**: Sign Set 8 |

## Streets (`tilebuild.js` is lead-only, so items there are listed for the lead)

| prop | builder | vis | library match |
|---|---|---|---|
| hydrants, bins, benches, shelters, mailboxes, meters, lamps, signals, poles, cones, barricades, cafe sets, umbrellas, food carts, bike racks, planters, litter | `miami/streetkit.js` | high | already library (the code fallbacks in tilebuild only show if the kit fails) |
| lifeguard tower | `tilebuild.js:330` | high | **candidate (lead)**: Lifeguard Stand 1 (tall blue tower with flag) or Lifeguard Stand 2 (teal hut, used by r3-people) |
| shipping containers | `tilebuild.js:165` BOXG | med | **candidate (lead)**: Industrial Props Pack 1 has red and blue shipping containers |
| rooftop AC unit | `tilebuild.js:184` | med | partial: Ventilator 2 (roof vent covers); Gas Station 2 has AC units in its file |
| string-light bulbs, aviation beacon | `tilebuild.js:338`, `:186` | med / low | none |
| tree grate | `tilebuild.js:341` | high | partial: Sewer Grate 1 (strips) |
| storefront ATM | `gameplay/world.js` | high | **SWAPPED r4**: ATM 1 |
| soda vending machine | `gameplay/world.js` | high | none |
| payphone booth | `gameplay/world.js` | med | none |
| town bench, bin, planter, grate, bistro table | `setpieces/towns/towns.js:197-201` | med | candidate: Bench 1-3, Trash Can 3 / 4, `street/planter_box.glb`, Table And Chairs 1 |
| lot mailbox and carts | `props/lotProps.v2.js` | high | already library |
| wheel stop | `dressing/kit.js` | med | none |
| pay station | `dressing/kit.js` | med | partial: Parking Meter 1 / 2 |
| dumpster | `dressing/kit.js` | med | candidate: Dumpster 1 / 2 (`street/dumpster.glb` exists) |
| crab-trap stack, fishing-float pile | `dressing/kit.js` | med | none (Buoy 1 is a navigation buoy) |
| propane tank | `dressing/kit.js` | med | partial: Tank 1 / 2 are big storage tanks |
| picnic table | `dressing/kit.js` | med | **SWAPPED r4**: Picnic Table 1 |
| kayak, boat trailer | `dressing/kit.js` | med | none |
| resin patio chair | `dressing/keysLots.js:111` | low | candidate: Table And Chairs 1 chair (`street/chair.glb`) or Patio Chair 1 |
| kettle grill | `dressing/keysLots.js:119` | low | candidate: Barbecue 1 (untextured: needs a black enamel material) |
| porch chairs | `setpieces/houses/generator.js:612` | med | candidate: Patio Chair 1, Wicker Chair 1 / 2 |
| hose reel, satellite dish, lawn flamingos | `houses/generator.js` | med | none |
| AC condenser | `houses/generator.js` | med | none |
| entry pots | `houses/generator.js` | med | candidate: `street/planter_pot.glb` (Street Props Pack 2) |
| clothesline | `houses/generator.js:752` | med | candidate: Clothesline 1 |
| metro litter (napkin, cup, receipt) | `metro/metro.v2.js` | low | candidate: `street/cup.glb`, `street/can.glb` |
| yacht loungers, tables, cooler | `vehicles/yachts/kit/furnish.js` | low | candidate: Pool Chairs 1, Cooler 1 |

## V2 interiors (gas station, cafe, restaurant, bar, club, boutique, lobby)

| prop | builder | vis | library match |
|---|---|---|---|
| ATM, wall clock, rubber plant, potted palm | fixtures | high / med | already library |
| trash can | `fixtures/retail.js` trashCan | med | **SWAPPED r4**: Street Props Pack 1 TrashCommercial |
| packaged goods (cans, bottles, boxes, snacks...) | `interiors/items/forms.js` | high | partial: Interior 6 / 9 (supermarket goods packs), Soda Can Set 1, Bottle Set 1 / 2 |
| liquor bottles (back bars) | `interiors/kit/bottles.js` | high | none |
| gondola, wall shelf, cooler bank | `fixtures/retail.js` | high | partial: Shelf 2 (modular store shelving), Interior 7 (freezers), Display Case 1 |
| checkout counter, POS, counter clutter | `fixtures/retail.js` | high | none (no cash register) |
| wet-floor sign | `fixtures/retail.js` | med | none |
| mop bucket | `fixtures/retail.js` | med | partial: Bucket 1 (5-gallon; still a .rar, not unpacked) |
| CCTV dome | `fixtures/retail.js` | med | partial: Security Camera 2. The mesh is named `cctv_cam_07a.smd` (a Source engine export), so check where it comes from before shipping it |
| convex mirror, exit sign, wall fan | `fixtures/retail.js` | med | partial: Interior 12 (exit door with sign), Ventilator 1 |
| stock rack, office desk, restroom | `fixtures/backroom.js` | low | candidate: Shelf 1 / 5, Desk 1, Bathroom 1 |
| hand truck, safe, DVR, lockers, breaker panel | `fixtures/backroom.js` | low | none (Trolley 3 is a luggage cart) |
| dining table and chair, booth | `fixtures/dining.js` | high | candidate: Diner Booth 1 / 2, Booth 4 |
| pastry case | `fixtures/dining.js` | med | candidate: Display Case 1 |
| espresso machine, menu board, beer taps, TV | `fixtures/dining.js` | med | none |
| ceiling fan, hanging bulbs, pool table | `fixtures/dining.js` | med | none |
| kitchen pass | `fixtures/dining.js` | med | candidate: Kitchen Counter 1-3, Stove 1 / 2, Sink 1 |
| bar counter, back bar, banquette | `fixtures/venue.js` | high | partial: Reception Desk 1-3 |
| bar stool, sofa, armchair | `fixtures/venue.js` | high | none |
| bar cart | — | — | spare: Trolley 1 (round brass bar cart) |
| candle lantern, glassware, stanchions, sconce, speakers, pendants, art frames, disco ball, neon | `fixtures/venue.js`, `kit/fx.js`, `kit/neon.js` | med | none |
| garment rack | `fixtures/fashion.js` | med | candidate: Shelf 4 (clothing rack with shirts) |
| mannequin, fold table, fitting rooms, sneaker wall | `fixtures/fashion.js` | med | partial: Storefront 4 has mannequins |

## Legacy interiors (grocery, liquor, pharmacy, electronics, clothing, laundromat, barber, guns, pawn...)

| prop | builder | vis | library match |
|---|---|---|---|
| chair, stool, table | `legacy/props.js` | med | partial: Chair 1 (office), Table And Chairs 1 |
| plant pot | `legacy/props.js` | med | candidate: `street/plant_ficus.glb`, `street/planter_pot.glb` |
| A-frame sign | `legacy/props.js` | med | none |
| bin | `legacy/props.js` | med | candidate: `street/bin_commercial.glb` |
| products (chips, cereal, six-packs...) | `legacy/products.js` | high | partial: Interior 6 / 9 |
| gondola, wall shelf, fridge, produce, wine rack, glass case | `legacy/fixtures.js` | med | partial: Shelf 2, Interior 7, Interior 9, Display Case 1 |
| washers / dryers | `legacy/fixtures.js` | med | candidate: Interior 5 (laundromat) machines |
| garment wall | `legacy/fixtures.js` | med | candidate: Shelf 4 |
| barber chairs, guitar wall, tire stack, surfboard rack | `legacy/fixtures.js` | med | none (the old tire GLTF from Nico's carport could fill the tire stack) |
| gun wall | `legacy/fixtures.js` | med | candidate: the Weapons rows (static) |
| food stations, jukebox, lucky cat, tiki torches, chandeliers | `legacy/decor.js` | med | partial: Kitchens rows. The rest: none |

## Nico's house (the user likes this set, so swap here only on request)

| prop | where | library match |
|---|---|---|
| white cooler (carport, kitchen) | `45_carport.js`, `72_kitchen.js` | candidate: Cooler 1 (`keys/coolers.glb`, already used in the yard) |
| bucket | `45_carport.js` | candidate: Bucket 2 (galvanized) |
| push broom, rake, hall broom | `45_carport.js`, `76_bath_hall.js` | candidate: Broom 1 (untextured: needs a material) |
| first-aid box (bathroom) | `76_bath_hall.js:164` | candidate: First Aid Box 1 (`pickups/first_aid.glb`) |
| cinder blocks, lumber | `45_carport.js` | candidate: Cinder Block 1, Pallet 1-3 |
| clothesline | `45_carport.js` | candidate: Clothesline 1 |
| propane grill | `45_carport.js` | partial: Barbecue 1 is a kettle grill |
| box AC, window AC | `47_frontbay.js`, `70_living.js` | candidate: Window AC 1 (`keys/window_ac.glb`, already in the yard) |
| dock cleats, coiled line, dock ladder, dock light | `06_dock.js` | partial: Dock 6 kit (posts and bollards) |
| sofa, armchair, rug, bed, dresser, wardrobe, desk, fridge, range, microwave, coffee maker, ceiling and box fans, guitar, laundry basket, washer-dryer, fire extinguisher, satellite dish, AC condenser, outdoor shower, basketball hoop, steel drum, wheelbarrow, hammock | parts 40-76 | none (washer-dryer: partial, Interior 5) |

## Keys Bar (`setpieces/keysBar/keysBar.js`)

| prop | library match |
|---|---|
| picnic tables | Picnic Table 1 would fit. They are left code-built on purpose: the bar's tables are painted in five colors with set wear levels |
| trash barrel | candidate: Trash Can 7 (`keys/galv_can.glb`) |
| mailbox | candidate: Mailbox 2 / 6 (`keys/mailbox_post.glb`) |
| bike rack | candidate: `street/bike_rack.glb` |
| glass-door beer cooler | partial: Display Case 1, Interior 7 |
| porch cooler | candidate: Cooler 1 / 2 |
| bottles, register, glasses, fans, golf cart, cruiser bikes, string lights, lobster buoys, stage speakers, flag | none |

## Download list (props still code-built because the library has no model)

The search terms below are for Sketchfab, CGTrader, TurboSquid or Fab. Look for "game ready", PBR textures, under 10k tris,
and no real brand logos (or logos that can be painted out).

1. **Sun hats**: "straw sun hat PBR game ready", "bucket hat 3d model", "fedora hat low poly"
2. **Hard hat and beanie**: "construction hard hat PBR", "knit beanie 3d model"
3. **Sunglasses / glasses**: "sunglasses low poly PBR", "aviator sunglasses game asset", "eyeglasses 3d model"
4. **Headphones**: "over-ear headphones game ready", "headphones low poly PBR"
5. **Bags**: "backpack low poly PBR", "leather handbag game asset", "paper shopping bag 3d", "duffel bag PBR"
6. **Briefcase**: "briefcase game ready PBR", "leather briefcase low poly"
7. **Smartphone**: "smartphone low poly PBR", "generic cell phone 3d model"
8. **Flip-flops and beach towel**: "flip flops sandals PBR", "folded beach towel 3d model"
9. **Soda vending machine**: "vending machine game ready PBR", "soda machine 3d model"
10. **Payphone**: "payphone booth 3d model", "public telephone PBR"
11. **Liquor bottles**: "liquor bottle set PBR", "whiskey rum tequila bottles low poly", "bar bottles game ready"
12. **Cash register / POS**: "cash register 3d model PBR", "POS terminal low poly"
13. **Wet floor sign and mop bucket**: "wet floor sign PBR", "mop bucket wringer 3d model"
14. **Fire extinguisher**: "fire extinguisher game ready", "fire extinguisher wall mount PBR"
15. **Bar stools and diner stools**: "bar stool PBR game ready", "chrome diner stool 3d"
16. **Sofa and armchair**: "sofa low poly PBR", "armchair game ready", "lounge sofa 3d model"
17. **Flat TV**: "flat screen tv low poly", "wall mounted tv 3d model"
18. **Fans**: "ceiling fan low poly PBR", "box fan 3d model", "pedestal fan game ready"
19. **Kitchen appliances**: "microwave PBR game ready", "coffee maker 3d model", "espresso machine game asset"
20. **AC condenser and rooftop HVAC**: "air conditioner outdoor unit PBR", "rooftop hvac unit game ready"
21. **Satellite dish**: "satellite dish 3d model PBR", "tv satellite dish low poly"
22. **Kayak**: "kayak game ready PBR", "sit on top kayak 3d model"
23. **Boat trailer**: "boat trailer 3d model", "galvanized boat trailer PBR"
24. **Crab and lobster traps, fishing floats**: "crab trap 3d model", "lobster pot PBR", "fishing buoy float set"
25. **Propane tank and gas grill**: "propane tank 20 lb 3d model", "gas grill PBR game ready"
26. **Wheelbarrow**: "wheelbarrow PBR game ready", "garden wheelbarrow low poly"
27. **Beach cruiser bicycle**: "beach cruiser bicycle 3d PBR", "city bike game ready"
28. **Cash stack**: "money stack 3d model", "banknote bundle PBR"
29. **Guitar**: "acoustic guitar game ready PBR", "electric guitar low poly"
30. **Pool table and jukebox**: "pool table PBR game ready", "jukebox 3d model"
31. **Golf cart**: "golf cart game ready PBR", "golf buggy 3d model"
32. **String lights**: "string lights bulbs 3d model", "festoon lights low poly"
33. **Lawn flamingo and hose reel**: "plastic lawn flamingo 3d", "garden hose reel PBR"
34. **Police gear**: "police duty belt 3d model", "police peaked cap PBR"

Library rows that need a cleanup more than a download: Dog 2 (rotated FBX bind pose), Bucket 1 and Trash Can 7 sources (.rar,
not unpacked), Barbecue 1 / Broom 1 / Cap 1 (untextured), Security Camera 2 (check where it comes from).

## Check shots (`docs/v2/shots/library/`, 0 console errors in every run)

- Dog: `r4_dog_1.jpg`, `r4_dog_2.jpg` (walking beside the owner). `r4_dog_0.jpg` is blocked by a dumpster. Fallback with
  `?libdog=0`: `r4off_dog_*.jpg`.
- Picnic table (Keys lot D, moved off the cottage wall): `r4_picnic_0.jpg`, `r4_picnic_1.jpg`
- Cap: `r4_cap.jpg`. Downtown had nobody in a cap during the runs, so the shot script puts a props.js cap on a fresh walker.
- ATM: `r4_atm.jpg`. Roadblock barricade: `r4_barrier.jpg`; the code fallback is `r4off_barrier.jpg`.
- Beach umbrellas: `r4_umbrella.jpg`. Gas station bin (interiors preview): `r4_gas_bin.jpg`
- Scripts: `tools/v2/library/r4-shots.mjs` (game) and `tools/v2/library/r4-interior.mjs` (interiors preview)

Notes:
- The game has no stray dogs today. Only walked dogs exist (`npc/peds.js` act 'dog').
- `peds.spawnAt(pos, { dog: true })` now gives the walker a dog. `peds._umbrella` and `peds._removeProp` are test hooks.
