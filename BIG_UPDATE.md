# Big update: plan (do NOT start until the user says go)

The user is filming the current state first, probably Nov 14 or 15. When they start this, they will run **Fable 5.2 on high effort**.
Rethink and retest everything from scratch: this is a full overhaul, not a patch. Use **American spelling** in all UI text and reports.
Keep it original. No copied GTA/Rockstar content (UI, characters, names, map art, music), and no exact replicas of real car or boat models or real brands.
Real-world Miami *architecture* (Art Deco, MiMo, glass towers, Mediterranean Revival) and real place layouts are fine. Shops and hotels get made-up brands.

## Reference gallery (look at these first)
These images live in `references/`. That folder is kept locally only and is not on GitHub, so the links work in the project folder.
- **V2 agents must open and study these before building.**
- They set the bar for layout, quality, lighting and mood. Build our own original versions to that standard; don't trace or reuse their exact characters, names, logos or buildings.

### The map (top priority)
User's concept layout, with Nico's home marked by the white dot and a scale of about 13 km.

![Concept map](references/ref_15.webp)
![Map with Nico's home marked](references/ref_25.webp)
![Map scale, about 13 km](references/ref_26.webp)

### Nico's home (top priority): a Keys stilt house on the water
**Updated target (user, Nov 13, 6 PM): `references/ref_36_nico_house_user_design.webp` is the user's own design for the house (made with ChatGPT). Match THIS image as exactly as possible: massing, window and shutter placement, colors, weathering, deck, umbrella, string lights, lattice with bougainvillea, surfboard, bins, workbench, plants, sandy puddled drive.** The older `ref_24` stays a quality and mood reference only.

![Nico's house, the user's own design](references/ref_36_nico_house_user_design.webp)
![Keys stilt house reference](references/ref_24.webp)

### The Keys welcome sign (top priority)
![Keys welcome sign reference](references/ref_18.webp)

### Visual quality bar
![Highway, signs and skyline](references/ref_16.webp)
![Port road](references/ref_17.webp)
![Planes over the highway](references/ref_19.webp)
![Store interior](references/ref_20.webp)
![Characters at a van](references/ref_21.webp)
![Car interior](references/ref_22.webp)
![Golden-hour dock](references/ref_23.webp)
![Character close-up](references/ref_27.webp)
![Character by a seaplane](references/ref_28.webp)
![Character close-up 2](references/ref_29.webp)
![Keys bar patio](references/ref_30.webp)
![Boat scene](references/ref_31.webp)
![Underwater cave](references/ref_32.webp)
![Reef with sea turtle](references/ref_33.webp)
![Dolphin by a yacht](references/ref_34.webp)
![Street life with an iguana](references/ref_35.webp)

## Versioning (user, Nov 13)
- The current game is **v1.0.0**. This big update ships as **v2.0.0**, and the user will call it "V2".
- **MAJOR** (first number) = huge overhauls. **MINOR** (second) = decently large changes. **PATCH** (third) = tiny fixes. For example, v2.6.34.
- The version lives in `src/version.js` and shows on the title screen and pause menu. Bump it with every push, and keep a short CHANGELOG.md.

## 0. The bar and the approach (read first)
**Quality bar (raised, Nov 13).** The *worst* shop on the new map must be **WAY** better than today's *best* store. The user says today's stores "suck"; the new ones must be in a different league, not comparable at all. Before/after screenshots of the same store must look like two different games. It must also *work*: everything is polished, bug-checked and hitbox-accurate.

**Fully maxed out, not efficient (user, Nov 13).**
- Do NOT minimize, simplify or take shortcuts to save time, size or effort.
- Every single item and little thing gets its own detailed asset: either meticulously handcrafted, or a high-quality downloaded model (CC0 / CC-BY, credited).
- No placeholder boxes, no reused generic stand-ins, no "good enough".
- Download size and code size do not matter; quality does. Use the desktop app build to carry the full asset set.

**Nothing repeats.**
- Every exterior, apartment block, dock, elevator, storefront, gas station, sign, door, bench, lamp and clock varies like real life, where different brands and builders make things.
- Use invented manufacturer and brand families (elevator makers, dock builders, fixture brands), each with its own look. Seed variation per building.
- No two neighbors identical.

**"I can think of anything and do it."**
- Build systems, not one-off scripts. Example: robbing a bank should work through general systems: scouting, disguises, crews, alarms, vaults, getaway, police response.
- The player can also improvise: walk into any bank, threaten the teller, crack the vault, escape by boat.
- Every plausible plan should have a working path.

**Tiny realistic details.** Wall clocks show the current game time. Store hours, menus, receipts, screens and signs fit the time and place. You can always check the time (HUD, phone, clocks).

**Agent structure** (agreed Nov 13): run dozens of agents in waves.
1. **Design-system agent first:** a shared kit of materials, furniture, fixtures, lighting rules, invented brand families, and a style guide per area and per brand.
2. **Category agents:** gas stations, hotels, convenience stores, apartments (luxury / mid / run-down), restaurants, bars, clubs, offices, retail types, banks, docks and marinas, elevators and lobbies.
   - Each builds a variation generator, so no two match, plus 5–10 hand-made standout locations.
3. **Area agents:** one per district or island. Placement, street-level detail, real Miami land use.
4. **Systems agents:** missions and jobs, heists, businesses, wanted and police, pedestrian AI and dialogue, vehicles and damage, boats, water, weather, audio, map, saving, performance.
5. **Inspection team:**
   - Agents walk into every building, screenshot it and score it against the bar.
   - They test hitboxes, doors, stairs and furniture collisions, and play through every mission and job.
   - Failures go back for fixes. Repeat until clean.

## 0a. THE DETAIL STANDARD (the user's #1 expectation; applies to EVERY store, building and street on the WHOLE map)
- **Think "real place you could walk into", not "game level".**
  - **Example: the luxury fashion boutique** where the real one is in Miami.
    - True-to-life size, facade and floor plan, with the kind of stock that store really sells (handbags, small leather goods, shoes, luggage, ready-to-wear) at realistic sizes, displays and prices.
    - Lighting, mirrors, a security guard at the door, and sales associates who greet you, follow you around, take a bag from the shelf to show you, and offer you a bottle of water while you browse.
    - Branding is original, styled to match the tier.
  - **The same thought for every other place.** Examples:
    - A gas station clerk restocking the cooler.
    - A barista calling out orders.
    - A bartender wiping the counter.
    - A pharmacy line.
    - A sneaker store with a release-day queue.
    - Office workers in cubicles with lit screens.
    - Apartments with lived-in clutter, unique per unit.
- **Products and brands:** every product must be instantly recognizable as *what it is and what tier it is*: a flagship phone, a cheap prepaid phone, a designer handbag, a running shoe, a cola, a premium tequila, a chip bag.
  - Use **made-up brands** (no real logos, names or trade dress).
  - Each brand is a fully designed, consistent fake brand: its own logo, colors, packaging and typography, used across billboards, shops, products and ads.
  - The player can tell brands apart and recognize them across the map.
- **Items are specific, physical things (user, Nov 13).**
  - Every food, drink and product is a precisely identifiable item with its own model and name, for example "hot dog with mustard", "shrimp nigiri", "cafecito", "glazed donut", "pack of gum".
  - **Grab and steal animations:** you see the character's arm and hand reach out, grip and pick the item up smoothly (hand IK to the exact item), then pocket it, hold it or eat it. The item physically leaves the shelf, so the gap stays.
  - Clerks and cameras can notice.
  - **Eating and drinking:** visible eat/drink animations with bites taken out of the item. Each food has realistic calories and nutrition (for example, a hot dog with mustard ~290 kcal, a shrimp nigiri piece ~60 kcal), restoring health and stamina accordingly.
  - **Body changes:** overeating over time slowly makes the character slightly heavier (a gradual body-shape blend). Exercise (running, swimming, the gym) slims him back. Changes are subtle and capped.
  - **Effects:** coffee gives a short sprint boost, alcohol a wobble, junk food a smaller heal than real meals, and spoiled food a sickness wobble.

- **No "less important" area.** The worst corner of the map must still beat today's best interior. If an agent would leave a place generic, it is not done.
- **Visual quality bar:** high-resolution PBR textures everywhere (albedo, normal, roughness, AO), wear and dirt, real-scale props, proper reflections on glass and floors, soft shadows, and dense small props (receipts, price tags, magazines, plants, cables, trash).
- **Behavior quality bar:** every staff member and customer has a job, a routine and reactions. They talk, gesture, serve you, react to weapons, call security or the police, and go on breaks at the right times.
- **Inspection:** an agent screenshots every interior and street block and rejects anything below this bar.

## 0a1. Detail calibration, round 1 (user's ratings, Nov 13)
- **Good (hit this level):** gas station, small details, restaurants, street props, pedestrians, bank heist, car damage, beach, hotels. Use the examples from the questionnaire as the floor.
- **Lacking (needs MORE than described):**
  - Apartments: more elements per unit than "clutter, TV, residents cooking or sleeping".
  - The police-knowledge HUD.
- **Too much:** the luxury boutique *as described* (guard, associate showing bags, offering water, real-size products) is a bit beyond what's expected. Keep it detailed, but don't over-invest there at the expense of everywhere else.
- Round 2 of the questionnaire (tiered scenarios) refines this. See 0a1b when filled in.

## 0a1b. Detail calibration, round 2: THE TARGET TIERS (user picked, Nov 13). Apply to EVERY shop, corner and area.
- **Homes and apartments = Tier D, "Extreme".** Example: a mid-price 2-bedroom in Little Havana at 7 PM.
  - A family at home doing believable things on a daily schedule: school, work, dinner, sleep. For example, one cooking on a working stove with steam and sizzle, a kid doing homework, a parent on the phone.
  - Every drawer and cabinet opens with contents. A fridge with real-looking food, magnets and drawings.
  - A bathroom with toiletries and a fan. A balcony with plants and a drying rack.
  - Mail on the counter addressed to the residents, a laptop with a readable screen, unique family photos.
  - A wall clock at the right time, and a TV showing the in-game news (including reports about the player).
  - Neighbors' noise through the wall, plumbing sounds.
  - Residents react to intruders: scream, call 911, grab a bat.
  - Every unit is different and fits its area and income.
- **Police knowledge = Tier C, "Full knowledge model".** Example: rob a corner store at 3 stars, then flee.
  - Each piece of evidence is its own HUD icon with a countdown: the store camera records your face and outfit, the clerk describes your gun, a witness reads your plate.
  - Police radio repeats the description ("male, teal shirt, gray sedan"), and cops stop people who match it.
  - Swapping the car clears the car icon and a new shirt clears the outfit icon. Your face stays known for the day unless you wear a mask or hat.
  - Destroying the store's camera recorder before leaving means no camera evidence.
- **Streets = Tier D, "Extreme density".** Example: a random, non-landmark block of SW 8th Street on a Saturday afternoon.
  - Life: a walk-up coffee window with a line, old men playing dominoes in a park, a fruit cart vendor, music from a bakery.
  - Wear: murals, cracked sidewalks with gum stains, sneakers on power lines.
  - Activity: a double-parked delivery truck with hazards on and a driver unloading, someone washing a car, a dog tied outside a store, steam from restaurant vents.
  - PLUS: every window shows a different interior from outside, every parked car has unique dirt and stickers, flyers on poles you can read, birds on wires that scatter, puddles from AC drips, shop owners hosing the sidewalk at opening time.
- **Shops and boutiques = Tier C, "Service".**
  - Real store layout and lighting, mirrors, a guard at the door, associates who greet you, take items off the shelf to show you, and offer water.
  - Realistic products, sizes and prices.
  - Original brands styled to the store's tier.
- **Applies everywhere.** EVERY shop, corner and area gets this level: its own lore (who owns it, its history, regulars), its own style, and real, recognizable kinds of everyday objects. Brands stay original, but the objects (coffee makers, sneakers, phones, groceries) must read instantly as the real thing.
  - The user's words: "more than you could ever fathom".
  - When in doubt, add more.

## 0a1c. DONE MEANS VERIFIED (user rule)
- Never say the update is done until every place, system and area has been checked against this standard: screenshots, walkthroughs, and automated play tests.
- If anything falls short, keep working until it passes. Report the evidence, not just claims.

## 0a2. Wanted HUD: "what the police know" (added Nov 13)
- Under the six stars, show **evidence icons** for what the police currently know about you. Use our own original icon set and style, not a copy of any other game's HUD.
  - Seen on camera, witnesses, your outfit described, your face identified, your weapon described, your vehicle and plate.
  - Plus timers/counters (for example, how long until a description goes stale, and how many units are searching).
- Icons appear when that information becomes known (a witness calls it in, a camera spots you) and clear when you invalidate it: change clothes, swap or repaint the car, ditch the weapon, wear a mask or hat, or wait it out.
- Briefly highlight the icon that just changed, so you can see what blew your cover.
- This is tied to the realistic police tracking in item 9 below.

## 0b. Everything from the Nov 13 pitch: ALL approved
1. A story campaign of 15–25 missions with an original main character, crew, rivals and cutscenes.
2. Heists you plan and run: scope the place, recruit and **hire** a crew (each person has skills and a cut), buy gear, choose loud or quiet, plan the getaway. Banks, jewelry stores, yachts, the port, casinos, armored trucks.
3. Side jobs: taxi, delivery, tow truck, boat tours, lifeguard, valet, ambulance, firefighter, vigilante.
4. Street races and boat races with buy-ins and prize money.
5. Random street events: muggings, chases, hitchhikers, armored-truck robberies.
6. Businesses you own and **run**: nightclub, car wash, marina, restaurant, garage. Hire and fire staff, set prices, upgrade, defend from raids, earn passive income.
7. Property: apartments and houses to save at, and garages that store your cars and boats.
8. Stocks and betting: in-game companies whose prices react to what you do.
9. **A six-star wanted system that tracks you realistically:**
   - Witnesses call it in, with descriptions of you, your clothes and your car. Cameras, phones and plate reads count too.
   - Police search the last-known area. Changing clothes, swapping or repainting your car, hiding or lying low lowers the chance they find you.
   - It is hard to shake, but every escape method works.
10. A police response that grows with your stars: patrols, roadblocks, **spike strips**, helicopters with spotlights, **police boats**, **SWAT** vans and teams, and an extreme sixth-star response.
11. Bounty hunters who come after you if you lie low with a high bounty.
12. Gangs with territories that react to trouble on their turf.
13. Every building enterable, all detailed, all different.
14. Daily routines: shop hours, rush hour, a busy beach at noon, packed clubs at 1 AM, garbage trucks at dawn.
15. Events: beach festivals, car shows, boat parades, weekend fireworks.
16. News and social media reacting to what you do.
17. A rare hurricane event with flooding, debris and evacuations.
18. Weather and tides, plus a moon and stars at night.
19. Mini-games: pool, darts, arcade, golf, volleyball, basketball, fishing, jet-ski stunts.
20. A gym, tattoo parlor, barber and clothing stores that change your look. Outfits matter for police descriptions.
21. Food and drink with effects (health; drunk wobble).
22. A phone with contacts, missions, camera, map, banking, stocks, and the time.
23. Car customization with original parts: paint, wheels, tint, body kits, engine, neon.
24. Helicopters, small planes, jet skis, blimps.
25. **Realistic car damage, both visual and mechanical:**
    - Crumpled panels, broken lights and glass.
    - Damage that actually changes the car: bent steering pulls, a hit radiator overheats, a shot-out tire handles badly or blows out, an engine hit loses power, a big hit stalls it, a hit fuel tank leaks or catches fire.
    - What it takes to disable a car should match real life.
26. Delivery trucks, buses and garbage trucks running their actual routes.
27. A cover system, better aiming, weapon upgrades (sights, extended magazines, suppressors).
28. Melee combos and takedowns.
29. Destructible props: glass, fruit stands, hydrants that spray water, light poles that bend.
30. Ragdolls that react to cars, falls and explosions.
31. Original radio stations with DJs, ads and talk shows, written for the game.
32. A save system that resumes where you left off.
33. A desktop app version if the browser can't keep up.

## 0c. More added Nov 13
- **Security in expensive buildings:** banks, the financial district, luxury hotels and offices have metal detectors and guards. Carrying a gun can get you stopped, questioned or searched, and it escalates if you run or fight. Some areas need keycards or a disguise.
- **Talking pedestrians:**
  - People say context-aware lines as you pass and react to your outfit, your car, the time, the weather and what you just did.
  - They have short conversations with each other, and you can talk back with a few choices.
  - Use a large original written line bank plus a smart picker. Optionally, an AI dialogue mode, only if it can run without exposing keys.
- **Intense bug-checking:**
  - Accurate hitboxes for people, cars, props and buildings.
  - No stuck spots, no invisible walls, and doors and stairs that work.
  - Every job and mission completable from start to finish, with automated playthrough tests.

## 0d. V2 idea round (user's yes/no, Nov 13)

### YES
- **Real Miami transit:** the elevated downtown people-mover, city buses and trolleys, with stops, schedules and NPC riders. You can ride along.
- **Night car meets:** NPCs show off cars in lots at night, with cash races and pink-slip bets.
- **Disguises and uniforms:**
  - Wear delivery, security or staff uniforms to enter restricted areas unnoticed.
  - **People drop what they carry and wear:** kill or knock out a delivery driver and you can pick up and put on their uniform (also bags, hats, IDs, keys).
- **Parkour and climbing:** vault fences, climb ladders and fire escapes, run across rooftops.
- **A pet dog:** adopt one at a shelter. It follows you, rides in the car, barks at cops, and can be trained.
- **NPC memory:** the barista knows your usual, a clerk you robbed refuses service, and people across the city become friends or enemies.
- **Fishing (casual, no tournaments):** fish from piers, boats and bridges, with real Florida species, and sell the catch to stores.
- **Nightclub nights:** dress code and bouncers, VIP tables, bottle service, dancing, fights spilling outside.
- **Car upkeep:** fuel, tire wear and flats, breakdowns, and insurance to recover destroyed owned cars.
- **Cash vs. bank:** carried cash can be stolen or lost on death; the bank, card and ATMs keep it safe.
- **Traffic cameras:** speeding and red-light tickets mailed to your safehouse, and chases caught on camera add heat.
- **Light needs:** sleep at home to skip time and save, tiredness if you stay up too long, showers clear the "seen at the crime" description.
- **Rideshare:** call a ride as a passenger, or drive for the app.
- **Wet-weather driving:** slick roads, puddle hydroplaning, automatic wipers and headlights.
- **Modern influencer flavor (not a career):** NPC influencers filming content on the street, ring lights in apartments, selfie spots, people livestreaming your crimes. Ambient life only, no player career system.
- **Rare ocean-floor finds:** a few rare, realistic items on the seabed (a lost phone, a sunken small boat, an old anchor). Nothing crazy or unrealistic, and no treasure-hunting system.
- **Talking with people (big):**
  - NPCs speak to you with purpose: "we're hiring", someone who likes you flirts or wants to hang out, someone offers a deal (buy, sell, a job), someone warns you or asks for help.
  - **You can talk back:** a context dialogue wheel (friendly, rude, ask, threaten, accept or decline the offer, ask about the job) leads to real outcomes: a job, a discount, a friend, a fight, a police call.
- **Lore: few but high quality.** A small number of hand-written, polished stories and secrets. Quality over quantity, and no filler.

### NO
- Content creator career, skills that grow by use, treasure-diving system, food truck job, gadgets (drone, lockpick, scanner, binoculars), lots of collectibles and easter eggs, fishing tournaments.

## 0e. V2 idea round 2 (user's yes/no, Nov 13)

### YES
- **Police traffic stops:** for small offenses police pull you over first. Stop and pay a fine, or floor it and get stars.
- **Bribing a cop** at 1 star to make it go away (sometimes they refuse and add a star).
- **Impound:** your car gets towed from no-parking zones. Pay to get it back at the impound lot.
- **Flying through the windshield** in big crashes (ragdoll out of the car).
- **Drive-thrus:** order food from your car at fast-food windows.
- **Valet stands** at hotels: hand over your car, or steal one from the valet board.
- **Rentable e-scooters** on sidewalks that you can ride.
- **Sitting** on any bench, chair or stool with a key press.
- **Jumping off bridges and piers** into the water with a dive animation.
- **Rooftop hotel pools** you can swim in.
- **Manatees** drifting slowly in canals and marinas.
- **Dolphins** occasionally surfacing in the bay.
- **Street vendor carts:** buy a coconut, ice cream or churros.
- **Honk reactions:** people jump back, yell or flip you off.
- **Calling 911** on your phone brings police, an ambulance or a fire truck.
- **Hotel rooms** you can rent for a night to sleep, save and change clothes.
- **Scratch-off lottery tickets** at gas stations (small chance to win big).
- **Cold-morning iguanas:** on rare chilly mornings, stunned iguanas drop from palm trees.

### SOMETIMES (occasional, not every time)
- **Paramedics** sometimes arrive to treat people after crashes and fights.
- **Tow trucks** sometimes come to clear wrecks.

### NO
- Elbowing car windows to break in, the hotwire animation.

## 1. Buildings and interiors
- **Every building can be entered**, each with a fully detailed interior that fits it: apartments (luxury to run-down), hotel lobbies, offices, shops, restaurants, bars, clubs, gas stations, garages, churches, schools, warehouses.
- **Elevators and stairs** to upper floors and rooftops with skyline views.
- **Every building looks different.**
  - No generic repeats; same-type buildings (for example hotels) share a look but vary like different brands or versions: facade, colors, signage, entrance, balconies, lighting, rooftop.
  - Base the facade style on the real building's location and era where known: Art Deco on Ocean Drive and Collins, glass towers in Brickell and Downtown, MiMo, Mediterranean Revival, low-rise Little Havana, industrial port.
  - Real landmark-style buildings get recognizable treatments with made-up names.
- **Real-world land use**, not only apartments. Use what is actually there per OSM: gas stations, hotels, schools, churches, parking garages, offices, parks, marinas, hospitals, police and fire stations, supermarkets, car dealers, laundromats, gyms.
  - The block-by-block mix must change with the area (rich vs. poor, tourist vs. residential).
  - Fix the spawn island's rows of empty identical apartments.
- **Retexture everything:** buildings, roads, sidewalks, every prop (telephone and light poles, planters, plant pots, bins, benches, signs, fences, docks).
- **Every storefront is a real store** with a theme, stock, staff and furniture.
- **Detail parity everywhere:** downtown, every corner and every little island at least as detailed as the spawn area.

## 1b. Real-world precision (added Nov 13)
- **Put places where they really are.** Use OSM shop/amenity data (and its building outlines) so each store type sits at its real-world address and footprint.
  - Real luxury boutiques go at the real luxury addresses, and the same for shoe stores, pharmacies, gas stations, banks, restaurants and malls.
  - Interior layouts follow how that kind of store is really laid out: floor plan, fitting rooms, display walls, checkout position, back rooms.
- **Brands stay made-up.** No real logos, names, monogram patterns or signature store designs.
  - For example, where a real luxury fashion house has its Miami store, put an original high-end fashion house with its own name, monogram and boutique design, in the same spot with the same kind of layout (handbag walls, private salon, security at the door).
  - Real shopping areas (the Design District if the extended map reaches it, Brickell City Centre-style malls, Lincoln Road) get the same density and feel.
- **Shoe stores (required):** several shoe stores across the map, each different:
  - A sneaker boutique with sneaker walls, drop displays and a line outside on release days.
  - A mall athletic shoe chain.
  - A luxury shoe salon.
  - A discount or family shoe store.
  - Shoes can be bought and actually worn by the player, and they show in police descriptions.

## 1c. A whole state-style world (added Nov 13): real Miami inside a condensed Florida
**Concept:**
- A **perfect, real-scale copy of Miami** (Miami Beach, Downtown, Brickell, and the core neighborhoods west and north of it) sits on the east coast of a **larger, condensed Florida-style landmass**.
- The rest of the world is a believable, *compressed* blend of real South and Central Florida regions, stitched together naturally. No hard cutoffs.
- **Use our own layout and names.** Use real Florida geography as the source. Don't copy any other game's or fan map's layout or place names.

**Regions** (rough layout: city on the east coast, wilderness inland, islands to the south):
1. **Miami (real, 1:1 scale):**
   - Miami Beach and the bay islands, PortMiami, Downtown, Brickell (city detail all the way down through Brickell), Little Havana, Wynwood, Edgewater and the Design District.
   - Modeled as true to life as possible (see "street accuracy" below).
2. **The Everglades (condensed):** sawgrass marsh, mangrove channels, airboat routes, a two-lane highway crossing it, wildlife (gators, birds), fishing camps and a ranger station.
3. **The Keys (condensed):** a chain of small islands connected by long overseas bridges, ending in a small island town with an airfield. Marinas, dive spots, beach bars.
4. **North and inland (condensed):**
   - Suburbs and strip malls fading into farmland and a big inland lake.
   - A state forest or park with hills and trails.
   - A smaller second coastal town to the north.
   - A highway loop connecting everything.
5. **Suburbs between city and wilderness:** realistic South Florida subdivisions, canals, strip malls, gas stations.

**Size decision, updated (user, Nov 13, 5:30 PM): make the world about half the planned size so it can be finished to the full standard within 16 hours and the usage budget.**
- Same layout arrangement as the concept map, everything pulled in: land about 10.5 km across (about half the area first planned).
- Real Miami keeps exactly the area v1 already has (8.2 × 5.3 km at 1:1); the planned extension west, north and south is dropped for now.
- Every region keeps its full character and density (gators and airboats in the Everglades, many different shops in every town). The exact extents are in `CONTRACT5.md`.

**Earlier size decision (user, Nov 13), superseded where it conflicts:**
- About **10 km wide** total (the user's call: realistic and doable at the detail standard). Up to ~20 km only if detail never suffers.
- Miami core (Miami Beach through Brickell) stays at true 1:1 scale. The Everglades, Keys, suburbs and north are compressed so the Keys are a short, realistic-feeling drive away.
- Include an **international airport** with runways, terminals, planes taking off and landing on real-looking approach paths over the city, and a smaller Keys airfield.
- The user designed a concept map with ChatGPT and likes its overall shape: a big landmass with the city on the east coast, a national park and hills in the north, a large inland lake, wetlands in the middle-south, the airport west of downtown, and island chains south and west.
  - Use that overall *arrangement* as inspiration, but draw our own map from real Florida geography, with our own place names.
  - That image resembles another game's map, so don't trace it or reuse its names.

**Named locals with lore (user example):** recurring named NPCs tied to places, e.g. "Jeff" who runs a hot dog stand at one end of the beach and has the best prices. They have schedules, personalities and memory of you, and some offer deals or jobs. Few but high quality (see the lore rule).

**Highways and signage:**
- Realistic US-style green overhead signs, exit numbers and shields using **real Miami road names and numbers** (I-95, I-395, US-1, MacArthur Causeway, and so on). These are public infrastructure, so that's fine.
- Fictional regions get fictional names of our own.

**Spawn location and home (user, Nov 13; replaces the "suburban house" idea below):**
- **Where:** the start point is on the **upper end of the long Keys island chain**, just south-east of the Everglades: the first large inhabited key, where the overseas highway reaches the mainland. This matches the user's marked map (`references/ref_25.webp`, white dot).
- **Map extent:** roughly **13 km** from the northern park hills to the far south-west airfield island (`references/ref_26.webp`).
- **The home:** a **weathered Keys-style stilt house** on the waterfront, a real Florida Keys building type.
  - Raised on wooden piles, with a wraparound wooden deck, an exterior staircase, faded painted wood siding, shutters and a tin roof.
  - A satellite dish, a carport space underneath with a basketball hoop, a kayak and a beat-up muscle-pickup and dirt bike out front, a dock with a skiff, and water views on two sides.
  - Spend a LOT of time making it immaculate: every board, weathering, plants, clutter.
  - Fully furnished, lived-in interior.
- **Original design:** our own color, layout and details. The reference frame `ref_24` is another game's protagonist's house, so match the *quality and Keys vernacular*, not that exact building.

**Main character's name: Nico** (user's pick, Nov 13).

**Top-priority set pieces (user, Nov 13): give these the most care of anything in V2.**
1. **The map:** follow the user's concept layout (ref_15, ref_25, ref_26) as closely as possible in *arrangement and feel*:
   - the east-coast city with bay islands and the barrier beach
   - the northern park hills, the big inland lake, the central wetlands
   - the airport west of downtown
   - the southern Everglades
   - the Keys chain curving south-west to an airfield island, about 13 km overall
   - Nico's home at the marked dot
   Drawn as our own map (own coastline shapes, roads and place names), because those images closely resemble another game's map. Do not trace them.
2. **Nico's house:** a Keys stilt house as close in *quality, mood and type* to ref_24 as possible, with every board, weathering, plant and prop immaculate.
   - Our own design, colors and layout: that frame is another game's protagonist's home, so don't replicate that exact building.
3. **"Welcome to the Keys" sign** at the start of the island chain: a hand-painted wooden roadside sign in Keys style, with wildlife art (heron, fish), beside the highway, as nice as ref_18.
   - Original artwork and layout of our own; don't copy that exact sign.


**Spawn and start:**
- The player starts in a **small, realistic suburban house** (a modest 2-bedroom on a canal street) roughly in the middle of the map, between the city and the wilderness. That becomes the first safehouse.
- You start with little money and work up: jobs, buying bigger property later.

**Size:**
- Aim for a total world comparable to or larger than the big open-world crime games. GTA 5's map is commonly cited at roughly 80 km² (unofficial); GTA 6 is expected to be larger.
- Miami core at 1:1. Surrounding regions compressed (real Miami to the Keys is 100+ km), so travel stays fun.
- Everywhere playable must meet the detail standard. Wilderness gets nature detail (plants, water, wildlife, roads, small buildings) instead of city density.
- If the world is too big to hit the detail bar, keep the region list but shrink the wilderness before lowering quality anywhere.

**Street accuracy for Miami:**
- **Google Street View can't be used.** Its imagery is copyrighted and its terms forbid scraping or copying it, so agents won't scrape it or "drive every street" there.
- **Instead, model Miami from:**
  - OpenStreetMap: building outlines, heights, levels, colors, shop types and names.
  - **Mapillary** (street-level photos under CC-BY-SA) as visual reference for key streets.
  - Public-domain or openly licensed photos.
  - Architectural style knowledge per neighborhood.
- **Priority 1, highest fidelity:** the famous streets, e.g. Ocean Drive, Collins Ave, Lincoln Road, Brickell Ave, Biscayne Blvd, Calle Ocho and the Wynwood walls area.
- **Priority 2:** every other street, from data plus district style rules.
- Real *places* and layouts are fine; real *business names, brands and logos* stay replaced by our own.

## 2. Map
- **Extend the map:** downtown a few blocks further **west**, and the whole map a few blocks further **north**. Use a fresh OSM pull and keep the designed hard boundary.
- **Much bigger playable area** (user, Nov 13):
  - Extend at least 1 mile, ideally several miles, to the **west, south and north** (more of Downtown and Brickell, Little Havana, Coconut Grove direction, Wynwood, the Design District, Edgewater and so on).
  - Same detail standard everywhere inside.
- **City beyond the edge:**
  - Outside the playable boundary, the real city keeps going *visually*: low-detail buildings, roads and skyline out to the horizon, so you see the rest of Miami instead of void or ocean.
  - An **invisible barrier** at the boundary (a smooth, non-glitchy stop, with a short "Area off limits" hint).
  - On the map those outside parts are shown **dimmed, without detail or labels**, so they read as off limits. (A basic version of the dimmed map was added Nov 13.)
- **Rebuild the pause map:**
  - No flicker, no static, no things disappearing and reappearing while zooming.
  - Panning and zooming stay locked to the mouse/trackpad.
  - Crisp at every zoom.
  - GPS route lines, store icons by category, a legend, fast travel to discovered places.
- **Real GPS routing (user, Nov 13):** today the route zigzags street by street toward the destination. Replace it with true fastest-route routing, like a real navigation app.
  - **Travel time, not distance:** each road segment is weighted by length ÷ realistic speed for its class (highway/motorway > trunk > primary > secondary > residential > service and alleys), its lane count, and its speed limit.
  - **Intersections cost time:** left turns cost more than right turns, U-turns heavily, and traffic lights and stop signs add a wait. Going straight through a junction is cheapest.
  - **Rules:** one-way streets, highway on- and off-ramps, no illegal turns, no driving over medians, and bridges and causeways used properly. Prefer staying on bigger roads, like real GPS.
  - **Live traffic:** rush-hour slowdowns and accidents raise costs, and the route updates when you miss a turn (quick recalculation).
  - **Smooth display:** the route line follows the actual lanes on both the minimap and the pause map, with turn-by-turn arrows and an ETA and distance readout.
  - **Walking mode:** a separate on-foot route that uses sidewalks, crosswalks and parks.

## 3. People and AI
- **Pedestrian AI:**
  - Different behaviors, personalities and daily routines that fit the area and the time of day.
  - Strong reactions: they film you on phones, flee gunfire, call the police, crowd around crashes, argue, and help injured people.
- **Beach life:**
  - People sunbathing on towels, under umbrellas, hanging out, playing volleyball and swimming in the sea.
  - Lifeguard towers with lifeguards. You can climb into the lifeguard towers.
- **City life:**
  - Wildlife: pelicans, iguanas, seagulls.
  - Food trucks, street performers.
  - A nightclub district that comes alive at night.

## 4. Vehicles
- **Cars rebuilt:**
  - Each model clearly readable as its type.
  - Smooth, clean, high-detail bodies with no glitches.
  - Tiered by area: supercars in rich areas; cheap sedans and old SUVs in poorer areas.
- **Boats rebuilt** as original designs of real categories: center-console, speedboat, sailboat, yacht, fishing boat, police boat.
  - **Spend real time on boats; they must feel great.**
  - **Steering:** much more responsive (the user says it is far too low now). Speed-sensitive turning, planing lean into turns, and a tight low-speed turn for docking.
  - **Physics:** a convincing hull on the water: bow rise when planing, bounce over waves and wakes, spray, a believable drift/slide. No getting stuck on docks or other boats (a guard exists for docks; extend it to parked boats).
  - **Models and graphics:** high-detail, smooth hulls with no glitches. Detailed decks, consoles, seats, rails, windshields, outboard motors, lights at night, wet sheen. Engine sound per boat type.
  - **Boarding animation:** a really smooth climb from the water (grab the side, pull up, roll over) and a jump or step-on from a dock or shore, chosen by where the player is, with a smooth hand-off to the driving pose. Getting off is just as smooth.
  - **Test specifically:** steering feel at several speeds, every boat model up close (screenshots), and boarding and exiting from every direction (water, dock, beach).
- **Jet skis** you can steal, or rent from beach rental stands.
- **Helicopters and small planes** you can fly.
- **Car damage:** crumpling panels, shattering glass, detached bumpers and doors, smoke and fire states.
- **Driving feel:**
  - Retune the drift/slide physics (it feels a little weird now): tire smoke, a boost for sports cars.
  - No dedicated ramps. Instead, make every collision surface (roads, curbs, ledges, ramps of parking garages, loading docks) accurate, so natural jump spots exist.
- **Gas stations, car washes, and a repair/repaint garage** that work.
- **Traffic AI:** working traffic lights, lane changes, turn signals, pedestrians using crosswalks, honking, road rage, cars pulling over for sirens.

## 4b. Hero vehicles and yachts (added Nov 13)
- **User request:** exact replicas of specific real cars:
  - a green Lamborghini Urus
  - a red Huracán
  - a graphite Aventador SVJ
  - a purple Bugatti Chiron, like a well-known YouTuber's
- **Decision: we do NOT build exact replicas or use real brands.** Real car designs, names and badges are protected. Instead, build **original hero cars that fill the same roles, with the same colors and the same "wow"**: equally detailed, clearly in the same class, but our own body lines, lights, wheels and badges.
  - **Green super-SUV:** an aggressive high-riding performance SUV, angular hexagon-themed lights. Spotted in Brickell and on Miami Beach.
  - **Red V10-style supercar:** low and wedge-shaped, mid-engine, sharp side intakes, a howling engine sound.
  - **Graphite flagship V12-style hypercar:** wing, scissor doors, carbon aero, a loud exhaust with pops.
  - **Purple two-tone hypercar:** curved, a luxurious grand-touring hypercar look with a two-tone purple and black split, and a signature front grille shape of our own. Parked at a luxury hotel.
  - Each car has a cockpit interior, working doors and lights, a per-model engine sound, and damage. They spawn in rich areas, at valet stands and in garages.
- **Design quality bar for hero cars and all sports cars (user, Nov 13):** no "lame generic car".
  - Each must be a *beautiful*, premium design with the same proportions, stance, silhouette and feel as the real car it stands in for, so it feels like that class of car, not a cheap generic sports car:
    - wheelbase-to-length ratio, cab-forward mid-engine profile, roof height, track width
    - wheel size and fitment, overhangs, and the sharpness or softness of the surfaces
  - All details are our own: body lines, lights, grille, intakes, wheels, badges. No exact replica and no real branding.
  - Use real-car reference photos only for *proportions and class feel*. Do not trace any one car panel for panel.
  - Final check: put screenshots next to class references and confirm they look premium, not generic.
- **Engine sounds:**
  - Find real recordings of the same *engine type* for each hero car: naturally aspirated V10 shriek, V12 howl with crackles, quad-turbo W16 whoosh and whine, twin-turbo V8 burble, super-SUV twin-turbo V8.
  - Only CC0 / CC-BY recordings (credited in CREDITS.md). No ripped game or video audio.
  - Layer them with intake, exhaust, turbo, pops and a sub-bass layer, and tune them per model.
- **Boats: super, super detailed**, with true-to-category proportions and styling (hull shape, deadrise, freeboard, deck layout, helm, windshield, rails, cushions, T-top, outboards and swim platforms), the same quality bar as the hero cars, and realistic engine and hull audio.
- **Car tiers** (user, Nov 13). The user re-asked for exact traced replicas; the decision above stands (original designs only).
  - **Top tier (super and hyper cars):** only the four hero cars above.
  - **Next tier:** an **orange British-style mid-engine supercar** (teardrop canopy, dihedral doors, slim LED "eye" lights), our own design. A step below the hero four in rarity and drama.
  - **Mid tier:** plenty of general sports cars (coupes, roadsters, muscle cars, hot hatches) in many colors.
  - **Everyday tier:** sedans, SUVs, pickups, vans and taxis, matched to each neighborhood's income.
- **Yachts: fully detailed and boardable.**
  - Several sizes (a 40 ft cruiser up to a 120 ft superyacht).
  - Multiple decks with stairs: flybridge and helm, sundeck, salon, galley, cabins, swim platform, a tender garage.
  - Working lights, music and a hot tub. They moor at marinas or anchor offshore. You board by swimming or by tender, or step on at the dock.
  - **At the helm** you can:
    - ask the captain to let you steer, or forcefully take over;
    - just hang out: eat the food, use the hot tub, dance.
  - **Scenario-driven reactions:**
    - **Party yacht** (crowded, music): most guests don't care, a few get suspicious and stare or whisper, a bouncer type may eventually check on you.
    - **Rich family yacht:** they notice fast. The father confronts you, tells you to get off, gets angry and may shove you. Others back away or film. Someone calls the police, and the captain turns the yacht back to shore while police boats head out.
    - **Crewed charter:** crew ask for your booking, then call security.
    - Taking the helm by force escalates (wanted stars, passengers panic, someone may jump overboard).
- **This level of situational reaction is the standard for EVERY system and place.** People respond believably to who you are, what you're doing, where you are and who they are.

## 5. Police and wanted system
- **Rebuild the wanted system as six stars.**
  - GTA 6 is confirmed to use six stars; that is a common genre mechanic, so use our own UI and our own rules for it.
  - Witnesses or alarms are required before police respond.
  - Clear escalation per star; evasion that makes sense (line of sight, search zones, changing vehicles or clothes).
- **Police AI:** dispatched from stations (started Nov 13), helicopters with spotlights at high stars, spike strips, PIT maneuvers, boat police.

## 6. Water
- **Waves** that vary with the weather and the time of day, plus a **tide cycle** (high and low tide moving the waterline on beaches).
- Boat wakes and spray, underwater light patterns, **seagrass and fish**.
- **Sharks:** a very rare encounter in open water, roughly matching real-life odds. It can bite.
- Swimmable depth (at least 6 ft) wherever there are boats (started Nov 13).
- **Swimming and diving, much better:**
  - Smooth dive and surface controls, with a proper underwater swim stroke and turning.
  - Deep water you can explore: a detailed seabed with rocks, seagrass, shells, wrecks and fish schools.
  - Underwater light rays, murk that varies by area, bubbles, a muffled underwater audio filter.
  - Climbing out anywhere natural.
  - Started Nov 13: water is at least 5 m deep away from beaches, and there is a basic visible seabed.

## 7. World and atmosphere
- **Reference image set (local only):** `game/references/ref_15.webp` to `ref_35.webp` (git-ignored, because these frames appear to come from another game's trailers and must not be published).
  - **Quality bar for V2:**
    - Convenience-store interior lighting and clutter (ref_20).
    - Character close-ups with realistic skin, hair, clothing folds and accessories (ref_21, ref_22, ref_27, ref_28, ref_29, ref_31).
    - Golden-hour dock with a boat and outboard (ref_23), the Keys stilt house (ref_24).
    - A busy Keys bar patio with crowds (ref_30).
    - Underwater caves, reefs, sea turtles, rays and fish (ref_32, ref_33).
    - A dolphin beside a yacht in sparkling water (ref_34).
    - A street with a mobility scooter, an iguana, a dog, a bus and roadside attractions (ref_35).
    - Highways, port and skyline (ref_16 to ref_19). The concept map is ref_15.
  - Before V2 counts as done, take matching in-game shots and compare them side by side.
  - Match the *quality, lighting, density and mood* only. Use none of their characters, names, logos, brands, signs or exact buildings.
- **Visual target (user's reference screenshots, Nov 13):**
  - Sunlit highways with heavy traffic, haze and depth over the skyline, a port with cranes across the water, power lines, dirty and worn cars, palm shadows, a plane overhead, film-like color and soft light.
  - The game must reach that look. Before calling V2 done, take matching screenshots in-game and compare them side by side.
  - These look like another game's trailer frames: use them only as a quality and mood reference. Copy no names, signs, logos or vehicles from them.
- **Day length and start time:**
  - A full day/night cycle of **144 real minutes** (1 game minute = 6 real seconds). This matches what leaked GTA 6 footage suggests; Rockstar hasn't confirmed it. Today our game uses 48 minutes, the same as GTA 5.
  - No reliable info exists on GTA 6's starting time of day, so start a new game in the **morning (about 9 AM)**. Saves resume at their saved time.
  - Option in settings to change the day length.
- **Weather and time:** rain with wet reflective streets, Florida thunderstorms (lightning, wind in palms), sunsets, foggy mornings.
- **Lighting:** crazy neon and signage on every nightlife street, lit windows that vary at night, car headlight shadows, wet-road reflections.
- **Boat sounds:** find much better, realistic recorded boat audio (CC0 / CC-BY only, credited in CREDITS.md):
  - Outboard and inboard engines with idle, rev and planing layers.
  - Hull slap, wake and spray, horn.
  - A distinct engine per boat type (jet ski whine, center-console outboard, yacht diesel rumble).
- **A unique sound for every car model:**
  - Find new real engine recordings for the main classes (supercar V8/V10/V12, muscle V8, inline-4 compact, diesel truck, EV whine).
  - Then give every individual model its own slight variation: pitch, rev range, exhaust tone, intake noise, turbo/whistle, pops.
  - No two models should sound identical.
  - Keep the strong bass and the balanced mix.
- **Deep, satisfying sound** that you can feel on headphones and good speakers:
  - High-quality samples with real low-end bass for engines, crashes, impacts, explosions, gunfire and boat engines.
  - Layered crashes: metal crunch, glass, debris, and a sub-bass thump.
  - Mixed so it stays clear and doesn't clip.
- **Sound** (already good; improve everything): ambience per district, NPC footsteps by surface, rain, thunder and wind, music inside venues (clubs, bars, restaurants, shops), and venue music audible from the street.

## 8. Player and progression
- **Main character: a big upgrade.** Better face, hair, body proportions, skin and cloth shading, and smoother animations (walk, run, idle, enter/exit, swim).
  - **Signature outfit:** a hand-designed Miami tropical button-up shirt, original artwork.
    - Our own print: hand-drawn palms, leaves and hibiscus in our own layout.
    - Our own colorway, not a copy of any game character's shirt.
    - Proper fabric texture, a collar, buttons, and cloth that moves.
  - Have 2–3 shirt variants in the clothing stores.
- **Jobs and ways to earn money** so money matters: taxi, delivery, boat tours, lifeguard shifts, valet, robbery and heists.
- **Things to spend it on:** cars, boats, property, clothes, weapons, garage upgrades.
- **Clothing stores** where you actually change outfits.
- **A phone** with simple missions and jobs.
- **Save system:** position, money, owned vehicles and property, outfits. The game resumes where you left off.

## 8a. Main menu and front end (added Nov 13)
- **A proper, cinematic main menu** in the same *format* as modern open-world crime games, but **our own original design**: our logo, art, fonts, colors and character, nothing traced from another game.
  - A live 3D background: the main character posed on a Miami street, rooftop or marina at sunset, with slow camera moves, weather and time of day. The background changes between visits.
  - **"Fit" showcase:** the character model up front in the current outfit, rotatable, with an **Outfit / Wardrobe** button to change clothes right from the menu.
  - **Menu items:**
    - **Continue** and **Story / Missions** (chapter select, replay finished missions).
    - **Free Roam**.
    - **Play with Friends**: create or join a session, invite code, friends list, party chat. Uses the multiplayer server from 8c.
    - **Wardrobe**.
    - **Garage**: owned cars and boats.
    - **Settings**: graphics presets, resolution scale, render distance, audio levels, controls and rebinding, mouse sensitivity, subtitles, accessibility.
    - **Credits**.
  - Original menu music, smooth animated transitions, controller and keyboard support, and a news/updates panel.
- **Changing clothes (confirm it is fully built):**
  - Clothing stores, a home wardrobe and the menu Wardrobe, with shirts, pants, shorts, shoes, hats, sunglasses, masks and jewelry.
  - Saved outfits; everything shows correctly on the 3D character.
  - Outfits feed the police-description system: changing clothes clears the outfit evidence icon.

## 8b. Desktop app and near-AAA graphics (future-proofing, added Nov 13)
- **Downloadable desktop app:**
  - Wrap the game in **Electron** (bundles its own Chromium, so the same WebGPU/WebGL behavior on every PC and Mac).
  - Ship it as Mac (.dmg) and Windows (.exe) downloads via GitHub Releases, with the high-performance GPU, higher memory limits, no background-tab throttling, and fullscreen.
  - Tauri is lighter but uses the system webview (Safari's engine on Mac), which is less consistent for WebGPU. Prefer Electron.
  - Keep the GitHub Pages web version as the "play instantly" option.
- **Renderer upgrade path:**
  - Move to three.js **WebGPU** (WebGPURenderer + TSL shaders) with a WebGL2 fallback.
  - Unlocks compute shaders (GPU culling, particles, water simulation, many more lights), much cheaper draw calls and better post-processing.
- **AAA-style visuals within reach:**
  - Physically based materials with real texture sets (albedo/normal/roughness/AO) everywhere, compressed as KTX2/Basis so they load fast.
  - Meshopt/Draco-compressed models.
  - Cascaded shadow maps with soft contact shadows.
  - Screen-space reflections and global illumination (SSR/SSGI) or baked light probes, volumetric fog and god rays.
  - Better atmosphere and clouds, real water simulation, TAA plus upscaling, high-quality depth of field and motion blur at speed only.
- **Performance architecture:**
  - Tile building in Web Workers so streaming never stalls a frame.
  - GPU-driven instancing and culling, impostors (billboards) for far buildings and trees, and a long render distance with no pop-in.
  - Quality presets (Low → Ultra) plus auto-detect.
- **Honest ceiling:** a browser/Electron engine can get close to modern-console visuals with the above, but true AAA (Unreal-level) would mean porting to a native engine later. Keep the code and data (OSM pipeline, game systems, assets) engine-agnostic enough that a later port is possible.

## 8c. Multiplayer (added Nov 13)
- **Goal:** play the same Miami with friends: a free roam session of about 8–16 players, with co-op and PvP.
- **What players can do together:**
  - See each other with your own outfits; ride in the same car or boat (driver plus passengers); shoot from windows.
  - Co-op heists and missions with crew roles (driver, hacker, gunner, lookout) and shared payouts.
  - PvP: fights, races, police-vs-robbers, and bounties on other players.
  - Party up, use voice and text chat, see friends on the map, set waypoints for them, and give money or cars to each other.
- **Shared world:**
  - Traffic, pedestrians, police and props stay in sync for everyone nearby: same cars, same crashes, same explosions.
  - Each player has their own wanted level; police respond to whoever did the crime.
  - Businesses and property belong to their owners; others can visit them.
- **Networking:**
  - An authoritative game server (Node + WebSockets, or a framework like Colyseus) runs physics-critical state for its area.
  - Clients predict their own movement and smoothly interpolate other players, with lag compensation for hits.
  - AI is simulated by the server, or handed to the nearest player and moved between players as they travel.
  - Only nearby updates are sent (interest management), so bandwidth stays low.
  - Basic anti-cheat: the server checks money, damage, speed and position.
  - Single-player still works offline exactly as now.
- **Hosting (needs the user):**
  - GitHub Pages only serves static files, so multiplayer needs a small always-on server.
  - Options: Fly.io, Render or Railway (free or cheap tiers), or a player-hosted session over WebRTC with a small signaling server.
  - **The user must create and own the hosting account.** Claude never creates accounts. Choose the host before starting this part.
- **Accounts and saves:** guest play with a nickname to start. Optional sign-in later to keep saves, money and property across devices.
- **Testing:** automated multi-client tests (several headless players driving, shooting, entering the same car, doing a heist) plus a latency simulation (100–250 ms, packet loss) before shipping.

## 9. Quality
- **No lag and far render distance; nothing pops in.**
  - Cars, trees, props and buildings must already be there well before you reach them, at full detail near you and good detail far away.
  - First try to get there in the browser (better LOD and impostors, instancing, worker-thread tile building, GPU-driven culling, streaming far ahead of the camera).
  - If the browser truly can't hold it, ship a **desktop app** build (Electron/Tauri wrapper with higher memory limits and an unthrottled GPU), plus the web version as a lighter mode.
  - Measure the pop-in distance and frame times before and after.
- **Performance gate:** 60 fps target and fast first load (compressed assets, lazy-loaded districts).
- **Re-run every test after the update:** soak, drive, ram, road audit, swim/boat, click, sub-path, live site.
- No pop-in close to the player, no invisible walls, no falling through anything.

## Not doing
- Filming tools (the user declined them).

## Process (when started)
- Plan first, then parallel agents with clear file ownership.
- Production builds for every check; muted, isolated headless Chrome only; never touch the user's browser.
- Before/after numbers for each area; screenshots in `docs/showcase/`.
- Push to GitHub (silasedel/gta) when verified, then check the live site.
- When starting, fold `git log` and `BIG_UPDATE.md` into the plan, along with any extra notes the user adds before then.
