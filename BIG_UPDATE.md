# Big update: plan (do NOT start until the user says go)

The user is filming the current state first, probably Nov 14 or 15. When they start this, they will run **Fable 5.2 on high effort**.
Rethink and retest everything from scratch: this is a full overhaul, not a patch. Use **American spelling** in all UI text and reports.
Keep it original. No copied GTA/Rockstar content (UI, characters, names, map art, music), and no exact replicas of real car or boat models or real brands.
Real-world Miami *architecture* (Art Deco, MiMo, glass towers, Mediterranean Revival) and real place layouts are fine. Shops and hotels get made-up brands.

## 0. The bar and the approach (read first)
**Quality bar (raised, Nov 13).** The *worst* shop on the new map must be **WAY** better than today's *best* store. The user says today's stores "suck"; the new ones must be in a different league, not comparable at all. Before/after screenshots of the same store must look like two different games. It must also *work*: everything is polished, bug-checked and hitbox-accurate.

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

## Open question
- "Cursor 6" from the user's voice note. Ask what it meant before starting.

## Process (when started)
- Plan first, then parallel agents with clear file ownership.
- Production builds for every check; muted, isolated headless Chrome only; never touch the user's browser.
- Before/after numbers for each area; screenshots in `docs/showcase/`.
- Push to GitHub (silasedel/gta) when verified, then check the live site.
- When starting, fold `git log` and `BIG_UPDATE.md` into the plan, along with any extra notes the user adds before then.
