# Big update: plan (do NOT start until the user says go)

The user is filming the current state first, probably Nov 14 or 15. When they start this, they will run **Fable 5.2 on high effort**.
Rethink and retest everything from scratch: this is a full overhaul, not a patch. Use **American spelling** in all UI text and reports.
Keep it original. No copied GTA/Rockstar content (UI, characters, names, map art, music), and no exact replicas of real car or boat models or real brands.
Real-world Miami *architecture* (Art Deco, MiMo, glass towers, Mediterranean Revival) and real place layouts are fine. Shops and hotels get made-up brands.

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

## 2. Map
- **Extend the map:** downtown a few blocks further **west**, and the whole map a few blocks further **north**. Use a fresh OSM pull and keep the designed hard boundary.
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
- Push to GitHub (silasedel/claude-gta) when verified, then check the live site.
- When starting, fold `git log` and `BIG_UPDATE.md` into the plan, along with any extra notes the user adds before then.
