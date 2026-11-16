# Southline V2: the big update, the master plan

Living document. Started 2026-11-14 after the user's playtests (screenshots in `references/playtest_1114/`, local).
Every session that works on V2 reads this first, then the section for its job.

## 0. The goal and the bar

- **Goal:** an original open-world crime game set in a Florida world (real Miami geography plus our own island),
  at the quality level of current AAA open-world games, and good enough to be the centerpiece of a YouTube video.
  Original IP throughout: our own characters, story, map design, art and music. Real-world brands are replaced by
  made-up brands in a similar spirit, with original logos.
- **The visual style: photoreal with a smooth game finish.**
  - Realistic light and materials, simplified the way a real-time game is: clean, solid, continuous surfaces.
  - Soft natural shadows and bounce light, a light atmospheric haze, and believable reflections on cars, glass and
    water.
  - Nothing should look "layered": no flat cards, no stacked decals or strips floating on top of each other, no
    surfaces that flicker or fight, no objects that light differently from their neighbors.
  - Every object should look like one solid, real thing sitting in one shared light.
- **The bar:** 9/10 or better against the user's "after" reference images, judged in the **Mac app**, never only in
  a small headless shot. Anything that can't reach 9/10 from code gets a real model (section 4).
- **Explorable:** the whole map. Hand-made detail goes first where the camera spends the most time, and the whole
  map must still be clean and bug-free.
- **Choices, not buttons:** the player makes real decisions everywhere (section 6d). Nothing should be a single
  "press F" shortcut where a real process would be more fun.

### How work is done
1. **Models:**
   - **Opus 5.5** is the default for leads and most agents.
   - Use Sonnet only for basic, mechanical tasks (renaming, conversion, batch file work).
   - Use **Fable** (currently Fable 5.1) for the hardest problems: rendering architecture, physics, the map rebuild.
2. **Agent count:** as many as the job needs, but no more than the Mac can run well. That's about 4–6 at once;
   watch the load average.
3. **Reviewer and glitch-hunter on every job,** the way the user's car channel works (`SilasCars/CHANNEL.md`).
4. **Judge in the Mac app.** Rebuild with `npm run desktop:build -- --no-dmg`, take screenshots in the real window,
   and compare with the reference. Agents' self-reported scores don't count.
5. **User approval checkpoints:** when a section or a model is done, the lead sends the user screenshots
   (SendUserFile) and asks **Approve / Decline** (AskUserQuestion). A decline comes with notes, and the work goes
   back. A section isn't "done" until the user approves it.
6. **Don't claim done** until it's verified. Report honestly what's unverified.
7. **Real models over code models** (section 4). Code builds only what no model can be: roads, terrain, layout and
   systems.
8. **Budget:** check usage at every milestone. The user sets the cap each week.
9. **American English** everywhere: in docs, in the UI and in-game text.

## 1. Image quality and rendering (top priority, map-wide)

The user's main complaint: "pixelated, grainy, dotted, fringed edges".

Cause (diagnosed 2026-11-14):
- Many materials use dithered or hashed transparency: hair cards, NPC and vegetation LOD fades, glass, garment
  edges.
- At full resolution only SMAA ran; there was no temporal resolve, so the dither showed as grain.
- When the GPU was busy, resolution dropped and heavy sharpening created fringes.

Stopgaps already in: TAA always on, gentler sharpening, no resolution drop on High/Ultra (8366c46, 1486c56).

To do:
- [ ] **Remove dithering everywhere.**
  - LOD changes: per-object cross-fade with alpha blend, or a stable hard switch at a distance where it can't be
    seen, never a screen-door dither.
  - Hair: alpha-to-coverage under MSAA, or opaque cards with a soft edge texture.
  - Glass: real blended transparency, sorted, with a Fresnel reflection.
  - Leaves and plants: alpha-to-coverage, not hashed.
- [ ] **Resolution locked at 1920×1080 (Full HD)**, always, on every machine. It never goes up or down; it's
  upscaled cleanly to the window or screen.
- [ ] **60 fps on ordinary hardware,** not just the user's M3 Max. Minimum target: a base Apple-silicon MacBook (M1 or
  M2) and a mid-range Windows PC GPU, at the default preset. Pay for it with LOD, culling, instancing and baked
  lighting, never with resolution.
- [ ] Anti-aliasing: TAA tuned for no ghosting in motion, with light sharpening only. Verify while driving at speed.
- [ ] No film grain in gameplay. A subtle grain may stay in cutscenes only.
- [ ] Pop-in: streaming and LOD distances far enough that nothing visibly changes within about 60 m. Trees, props
  and buildings fade, never swap.
- [ ] Lighting:
  - neutral shade (already improved);
  - sunlit surfaces rich but not blown out;
  - realistic sunset and night (night clouds, street-lamp pools and awnings fixed);
  - proper reflections on cars, glass and water;
  - ambient occlusion that grounds objects.
- [ ] A consistent material profile: every imported model is normalized (roughness and metalness ranges, albedo
  brightness, normal strength) so nothing looks too matte or too shiny next to its neighbors.
- [ ] Measured: 60 fps in downtown, by Nico's house, on the highway and inside the club, on the minimum-spec target.
- **Acceptance:** side-by-side shots from the Mac app at noon, sunset and night in 5 spots, scored 9/10 or better
  against the "after" references (ref_57, 58, 59, 64). There's a separate 10-second capture driving at speed, to
  check for shimmer and ghosting.

## 2. The map: rebuild to the user's road map, at the right scale

Targets in this folder:
- `map_roads_target.webp` (1053×1493, updated 2026-11-14): black land, white roads. This is **the** road layout.
  Trace it pixel for pixel. It is a slightly different size from the color map, so first align the two (match
  the coastlines) and store the transform.
- `map_color_target.webp` (1041×1511, the same frame): the color version (water, land, parks, towns).

The old road map lined up with the color map; the new one must be aligned (above). The current world maps them with `x = -25450 + 30·px`, `z = -24890 + 30·py` (30 m per pixel). That
scale is a guess and is probably too big.

### 2.1 Work out the true scale from downtown
1. Find **downtown** in both images: the dense grid on the east coast by the bay. Measure its size in pixels across
   (from the water to where the grid ends) and along.
2. Match it to **real downtown Miami**. Measure the real span on the OSM data in `public/assets/miami/` (Biscayne
   Blvd to I-95, and from the Miami River to I-395). Measure; don't guess.
3. The **meters per pixel** = real meters ÷ map pixels. Apply that one scale to the whole island. The user expects
   the island to come out **smaller** than now.
4. Re-check against the user's own street counts (memory: fictional-land-scale):
   - downtown is 3–5 streets across (8–9 at the widest) and 15–16 long;
   - the round-lake town is 4×5;
   - the island towns have about 6 streets, or one road down the middle.
5. Write the result to `docs/v2/plan/map_scale.json`: px boxes, real meters, the chosen m/px, and the new transform.

### 2.1b Preliminary size estimate (measured 2026-11-15, rough; redo properly in the map job)
Measured on the road map (1053×1493 px):
- The island's bounding box is about 893×1321 px; land plus roads cover 28% of the image.
- Downtown street spacing is about 9 px (short direction) and 13 px (long direction); other towns run 4–8 px.
- Real downtown Miami blocks are about 80–100 m by 150–170 m, so the scale comes out at about **10–12 m per pixel**
  (the current world uses 30 m per pixel).
- At 11 m/px the island is about **9.8 × 14.5 km** (now 26.8 × 39.6 km), roughly **7 times smaller by area**.
- Road pixels are 16% of land: about 24,000 px of line at a typical 3 px width, so roughly **250 km of roads**
  (now about 850 km of made-up roads, plus the real Miami ones).
These are first estimates. The map job re-measures the downtown span against the real Miami OSM data.

### 2.2 Trace the roads exactly
- [ ] Skeletonize the white road pixels of `map_roads_target.webp` into a graph. Line width in pixels tells you the
  road class: motorway, arterial, local.
- [ ] Keep every road in the image and add none, except bridges and ramps the image clearly implies.
- [ ] **Count the roads per section** and check them against the image: each town grid, downtown, the highway ring
  and the island links. Print a table of image count against game count; every row must match.
- [ ] Rebuild with `tools/world/build.py` (maproads stage), keeping the real-Miami OSM part as it is.
- [ ] Every island and town reachable by road; no 1.6 m lips or steps (`tools/v2/maproads/drive-probe.mjs`).

### 2.3 Pieces of real Miami, placed onto the map
- Downtown, Brickell, South Beach / Ocean Drive, Wynwood and Little Havana are modeled on the real places: street
  layout, building heights, typical facades, landmark-like (but unbranded) buildings, palms, street furniture.
- They're placed where the map puts them, fitted to the traced roads.
- Hand-check every block in those districts: no doubled buildings, no plain boxes on visible corners, real shops at
  street level.

## 3. Roads, intersections, signs and street props (map-wide system)

The user: "sloppy", "grass over the road", "crosswalks that don't match", "a sign in the middle of the road".

- [ ] **Use the downloaded road templates** (`~/Downloads/Models/Roads`: pieces with sides, overpasses, tunnels) as
  the visual kit. Code places and deforms them along the traced graph.
- [ ] **Intersections:** one merged surface per junction, built from the actual roads meeting there:
  - corner curbs and sidewalks with real radii;
  - no grass or terrain drawn inside the road outline;
  - terrain flattened under the road.
- [ ] **Crosswalks:** one per approach, square to that road, as wide as the road, set back from the stop line, with
  curb ramps.
- [ ] **Signs and signals:** from `Models/Signs` and `Models/Traffic Lights`.
  - Placed by rules: on the curb, facing the traffic they serve, never inside the carriageway or on another prop.
  - Stop signs at minor junctions, signals at arterial crossings, street-name signs at corners, one-way and speed
    signs where they make sense.
- [ ] **Street props** (cones, transformers, parking meters, bins, benches, bus shelters, fences, gas pumps): placed
  by context rules, never overlapping anything. The occupancy index already exists (`src/world/ground/occupancy.js`).
- [ ] **Trees:** no crowns over lanes (partly fixed in 827e4d0). Street trees in grates, sized for the street. No
  copy-paste look: species mix, scale, tint.
- **Acceptance:** run the clipping audit (`tools/v2/clipaudit.mjs`) to zero in every category. Take 20 random
  intersection shots from the Mac app with nothing odd in any of them.

## 4. Models: what to use, what the user should make or find

All imported models go through one pipeline (`docs/v2/plan/` will hold the scripts' notes):
1. Replace real brands with made-up brands in a similar style, with original logos and badges; add Florida plates.
2. Normalize materials (section 1).
3. Make LODs.
4. Fit colliders and hitboxes.

Vehicles also get split wheels that spin and steer, per-wheel suspension, door, seat, light and exhaust points, and
damage pieces.

**Car colors:** realistic for Miami. Roughly:
- white 25%, black 20%, gray 18%, silver 12%, blue 9%, red 8%;
- the rest beige, brown, green, gold, orange and yellow;
- white and silver run higher than the US average in hot, sunny places.

Each car also varies in rims, tint, dirt and parts.

### Already downloaded (`~/Downloads/Models`, 136 assets, 13 GB)
- **Vehicles:**
  - cars: about 58 (sedans, SUVs, trucks, vans, ambulances, supercars, a graffiti wreck, an electric cargo van);
  - a transit bus, motorcycles, ATVs, jet skis, helicopters, seaplanes;
  - boats: yachts, fishing boats, a pontoon, a speedboat.
- **Roads:** road templates, overpasses, tunnels.
- **Street:** signs, traffic lights, cones, transformers, parking meters, bus shelters, gas pumps, fences, docks,
  benches, bins, beach items.
- **Buildings:** a graffiti shop, rusty-roof buildings, tarp shacks, urban wood cottages and others.

### Wanted from Tripo (about 55 credits each; the $30 plan gives about 6,000 credits)
1. **Nico, clothed** (palm-print camp shirt, white tee, khaki cargo pants, white sneakers):
   - 8K, A-pose or T-pose, about 100k polys, GLB;
   - this is the main character, so it gets the best possible version;
   - no wardrobe swapping is planned.
2. **NPC types (10–15)** in A-pose: a beach woman, a beach man, a tourist couple, an office man, an office woman,
   a club woman, a club man, a bartender, a cop, a gang member ×2, an elderly person, a jogger, a construction
   worker.
3. **Shop staff** (the regular owners and clerks): bodega clerk, diner cook, jeweler, pawn-shop owner, gun-store
   owner, shoe-store clerk.
4. **Hero props** that are missing: an ATM, a vending machine, a newspaper box, a fire hydrant, a mailbox, a
   lifeguard tower, beach chairs and umbrellas (if not enough), a food truck, a hot-dog cart, a phone booth
   (optional).

### Wanted from downloads (the user and ChatGPT are finding these)
- **Trees and palms (most needed):** coconut palm, royal palm, sabal palm, live oak, sea grape, mangrove, banyan,
  bushes and hedges, grass clumps. These replace the "copy-paste splotchy" trees.
- **Storefronts and shop interiors:** shelves, counters, registers, displays, clothing racks, a shoe wall, a jewelry
  case, a diner booth, a bar, club furniture.
- **Building kits:** Art Deco facades (Ocean Drive), glass towers (Brickell and downtown), Mediterranean houses,
  warehouses (Wynwood), strip malls.
- **Marina:** piers, boat lifts, fuel dock, bollards, buoys.
- **Interiors for the safehouse** and the main mission locations.

## 4b. Nico's house: copy these images exactly (`docs/v2/plan/nico_house/`)
The user designed the main house and its surroundings. **Copy the design exactly, including the neighborhood
around it.** Where the images show more than the game has, build what they show.
1. `1_front_street.webp`: front, from the street.
2. `2_back_dock.webp`: back, from the water (dock, boat, rocks).
3. `3_side_yard.webp`: side and yard (propane tank, lattice, chain-link fence).
4. `4_side_stairs.webp`: side with the stairs, basketball hoop and satellite dish.
5. `5_aerial_neighborhood.webp`: aerial view of the whole neighborhood: the street, neighbor houses, the marina,
   the bay with small islands, and a bridge in the distance. This is the reference for the surroundings.
6. `6_interior.webp`: interior (living room, kitchen, hallway).

Match the existing house (`src/world/setpieces/nicoHouse/`) to them, check it in the Mac app, and send the user
side-by-side comparisons for approval.

## 5. Characters and animation
- [ ] Nico from Tripo (section 4), rigged by us:
  - our skeleton moved onto the new body, with fingers, jaw and eyes;
  - every animation carried over;
  - no eyes through lids, no fringed hair, the watch on the correct wrist and the right way round.
- [ ] Movement:
  - stops blend with momentum (he no longer stops before the animation);
  - foot locking so feet don't slide;
  - camera collision so he can't see through walls (the bathroom see-through is a bug).
- [ ] NPCs:
  - Tripo models;
  - realistic movement, no sliding feet, no falling off things;
  - they use sidewalks and crosswalks;
  - their voices match them.
- [ ] Remove the beach volleyball players entirely.

## 6. Gameplay systems
- [ ] **Vehicles:**
  - cars can't be pushed by walking into them;
  - hitting a pedestrian always registers (the pass-through bug);
  - real crash damage;
  - unpausing never replays the engine start.
- [ ] **Water:**
  - jet ski rental and purchase;
  - boats;
  - sneaking onto yachts, which works and is fun;
  - seaplanes and helicopters can be flown.
- [ ] **Clubs:** the user's Epidemic Sound songs play in every club, in the app and on the website (done 132b75e);
  dancing crowds, bar, bouncer.
- [ ] **Shops:**
  - **every store usable**, including a **shoe store downtown**;
  - each has its own regular staff member with their own look, voice and behavior, its own stock and prices, and
    a security level (a jeweler has a guard and cameras, a bodega has one nervous clerk);
  - templates for the rest.
- [ ] **Police and wanted:** the existing system, polished and verified.
- [ ] Settings: only real options. Removed: traffic and pedestrian density, day length (b9cde62).

## 6b. HUD corner (top right): match `hud_corner_target.webp` exactly
The user designed this target. Replicate it pixel for pixel, scaled to the screen:
- **Wanted stars: SIX stars** in one evenly spaced row, chunky, with a thick black outline. Earned stars are dark charcoal
  (the example shows 4 earned); unearned stars are near-white. No gap between the two groups.
- **Evidence icons** below the stars: dark-red circles with a black outline and a white glyph, in this order: camera,
  witnesses (two heads), clothing (hanger), face seen (one head), weapon seen (pistol). Show only the ones that
  apply, keeping the same style.
- **Ammo:** a big bold number with a black outline. The clip count is white ("20"); the reserve is gray ("73").
- **Weapon icon:** a glossy, slightly 3D illustration of the current weapon (dark blue-steel pistol, black outline),
  under the ammo. Every weapon gets the same illustrated style.
- Everything right-aligned, with the same proportions and spacing as the image. Check it in the Mac app.

## 6c. Features to add (user's list, 2026-11-14)
**Required shop (user requirement, for fun)**
- [ ] There must be a shoe store somewhere on the map: a real, enterable shop with shoes on display and a clerk, usable like the other stores (buy shoes, change what Nico wears).

**Police and crime**
- [ ] A six-star wanted system with police responses that escalate at each level.
- [ ] Witnesses: NPCs report crimes; security cameras can identify suspects.
- [ ] Police recognition: officers remember the player's appearance, clothing and vehicle.
- [ ] Disguises: changing clothes or vehicle helps you escape.
- [ ] Realistic pursuits: police can recognize the player again after a chase.

**Vehicles**
- [ ] Vehicle security: older cars are easier to steal; expensive cars have better security.
- [ ] Alarms and trackers on some stolen vehicles.
- [ ] Ownership: register stolen vehicles to keep them for good.
- [ ] Fuel: cars sometimes need refueling, and electric cars need charging (gas pumps are in the model library).
- [ ] Storage: garages, and trunks that hold vehicles, weapons and equipment.

**Weapons and combat**
- [ ] Limited carrying: only a few weapons at once.
- [ ] Extra weapons stored in vehicles.
- [ ] Civilians react to large weapons carried openly.
- [ ] Non-lethal takedowns.
- [ ] Suppressing fire: enemies react to nearby gunfire and take cover.

**World and activities**
- [ ] More enterable buildings: shops, gas stations, restaurants, banks, houses.
- [ ] Robberies of stores and other places, with different approaches.
- [ ] Dynamic traffic: realistic density and rush-hour congestion.
- [ ] Drive-through restaurants: order food without leaving the car.
- [ ] Gym: working out improves strength, stamina and appearance.
- [ ] Food and health: different foods give temporary benefits.
- [ ] Interactive interiors: watch TV, sleep, eat, use objects.

**Missions and progression**
- [ ] Flexible missions: stealth, combat or alternative routes.
- [ ] Side missions discovered through NPC conversations and the environment.
- [ ] Money: separate cash, bank balance and stolen valuables.
- [ ] Safe houses: save, sleep, change clothes and store items.
- [ ] Fast travel by taxi and rideshare.

Some of this already exists in part: wanted evidence icons, witnesses, cameras, property and business income,
economy and money. Polish what exists, then build what's missing, after the look and the map (section 9).

## 6d. Real choices in every interaction (game-wide principle)
No single-button shortcuts. What you can do depends on where you stand, what you carry, what's around you and what
the object is. Each choice has its own realistic animation, timing, noise and risk.

**Example: stealing a car**
- Context prompts by position:
  - at the window: **smash the window** (an elbow, or a tool if carried, then reach in to unlock and climb in);
  - at the door: **slim jim** (needs the tool; slower, but quiet);
  - an owner getting out with the door open: **carjack** them;
  - you have the keys (stolen from the owner or a valet): **use the key**.
- The car's age decides the steps:
  - older cars: open the door, then **hotwire** under the dash;
  - modern cars: they need the key or fob, a **relay hack** (with a gadget), or stealing the key.
  - Alarms and trackers depend on value (section 6c).
- Every step is animated and takes time. Witnesses and cameras react to noise and to what they see.

**The same idea everywhere else**
- **Robberies:** threaten the clerk, sneak to the back, go in through a side door, or after hours.
- **Doors:** knock, pick the lock, kick it in, or find another way in.
- **Police:** comply, talk your way out, run, hide, or change your clothes or car.
- **Shops:** browse, try things on, buy, haggle, or shoplift.
- **Missions:** stealth, combat or a smart alternative route.

## 7. Missions, heists and things to do (so it's a game, not just a sandbox)
- [ ] A story arc of 8–12 missions with Nico, using the systems that exist: cars, boats, yachts, clubs, shops,
  police.
- [ ] **Heists (3–4):** planning phase (scout, crew, gear), setup missions, then the job, with branching approaches
  (quiet or loud). Ideas:
  - a jewelry store downtown;
  - a yacht party safe;
  - an armoured truck on the causeway;
  - a club's back office.
- [ ] Side activities: street races, boat races, taxi or delivery jobs, property and business income (already
  partly built), wanted-level challenges.
- [ ] Mission markers, objectives, checkpoints, fail and retry, rewards; cutscenes using the existing cinema system.

## 8. Known bugs (from playtests; fix and verify each one in the Mac app)
- [ ] Cars pass through pedestrians.
- [ ] Walking into a car pushes it.
- [ ] Tree crowns hang over roads (Brickell and elsewhere; partly fixed).
- [ ] A sign stands in the middle of the road, plus random "points" along roads.
- [ ] Crosswalks are wrong at odd-shaped junctions; grass overlaps roads in towns.
- [ ] Ground flickers in the water at shorelines (G2, never fixed).
- [ ] Objects pop in and change close to the player.
- [ ] The camera sees through the edges of walls (the bathroom).
- [ ] The sliding-door glass looks wrong at some angles.
- [ ] NPCs slide their feet, fall and look odd.
- [ ] Nico stops before his animation does.
- [ ] Unpausing while driving plays the engine start.
- [ ] Burning-car wheels glowed red (fixed 8195716; verify).
- [ ] The old "CALORA / CLICK TO PLAY" overlay still shows (`src/ui/hud.js`).
- [ ] The beach volleyball group: remove it.
- [ ] Ramp lips at 2 interchanges (about 0.2 m), one possible prop in the road at (-14800, -1652).

## 9. Order of work and budget
1. **Rendering and look** (section 1). Everything else is judged through it.
2. **Map scale and road trace** (section 2), then **the road system** (section 3).
3. **Import the models:** cars, boats, air, props, trees (section 4).
4. **Characters** (section 5) and **bugs** (section 8).
5. **Real-Miami districts** (2.3) and **shops** (6).
6. **Missions and heists** (section 7).
7. Final polish pass, rebuild the Mac app, and publish as **V2.1** (see "Publishing as V2.1" below).

Budget estimate with the asset library: about 1.5–2 weeks of plan usage, or about 1 week with capped extra usage
(about $800–1,500). Missions and heists add about 0.5 week. Re-estimate after step 1.

## 10. Publishing as V2.1 (keep the current V2 as it is)
The current build, V2, stays live and untouched at https://silasedel.github.io/gta-v2/ (repo `silasedel/gta-v2`,
branch `main`). The big update uploads as a separate **V2.1** so the user can compare the two and fall back to V2:
- **Repo:** same repo `silasedel/gta-v2`, on a new branch named **`v2.1`**. `main` is not touched.
- **Website:** published at its own address, **https://silasedel.github.io/gta-v2-1/**. Create a separate repo
  `silasedel/gta-v2-1` for that, because a Pages site lives at the repo's address, and push the `v2.1` branch to its
  `main`. In that repo's `.github/workflows/pages.yml`, set `PAGES_BASE: /gta-v2-1/` (it rewrites the absolute
  `/assets/` paths; see `vite.config.js`).
- **Mac app:** built as "Southline V2.1" in the same way, so both versions can sit side by side on the Desktop.
- **Order:** push only when the user asks. `main` of `silasedel/gta` and its live site are never touched.
- Everything is tagged in the plan and in release notes as V2.1.

## 11. Model pipeline: tweakable, consistent, and varied
All imported 3D models (cars, boats, props, buildings, NPCs) go through one pipeline so they share a style and so
many variants can be made from each one:
1. **Adjustable color and texture.** For every model, find its paint, trim and material regions and expose them as
   parameters. That lets the user, and the game's variation system, change color, roughness, metalness, dirt and
   texture without re-exporting the model.
2. **One shared style.** A material profile and color grade apply to every model so that "too matte" and "too shiny"
   models match their neighbors, and so mixed sources feel like one game.
3. **Swappable parts.** Break models into parts (bumpers, grilles, spoilers, wheels, mirrors, roof racks; signs,
   awnings and doors on buildings) so the variation system can swap them.
4. **Variants from one model.** From each base model, generate several versions by changing small things: paint,
   wheels, bumpers, tint, decals, wear and damage, and which parts are attached. This makes one body read as many
   different cars, and works the same way for props and buildings.
5. **Rare duplicates.** The traffic system picks bodies and variants by realistic frequency, so the same car is
   rarely seen twice in sight (Miami color statistics are in section 4).
6. **Editor for the user.** A simple local page (`tools/v2/modelstudio`) lets the user pick a model, change its
   colors and textures, swap parts, and save a variant, with a live 3D preview.

## 12. Scope decisions (user answers, 2026-11-15)
These override anything above that conflicts. "Priority" lines say what gets cut first if usage runs low.

**Priority:** graphics come first and are cut last. Features can be thin; the look cannot.

**In scope (build to a good standard):**
- Police: witnesses and security cameras, police remember your face/clothes/car, disguises, six-star escalation.
- NPC talk: a dialogue wheel (friendly / rude / threaten / ask), and relationships (NPCs remember how you treated them). No free typed/AI talk.
- Shops: walk in and buy (real interiors, staff, items), and rob them (threaten the clerk, cash, alarms, police sent). The required shoe store stays.
- Vehicles: basic theft only (smash a window, a simple hotwire; no carjacking set pieces), real damage (dents, glass, smoke, fire, wheels), boats and jet skis, a basic helicopter and plane system, and some police air units (no news helicopters).
- World: day/night and weather, busy streets (traffic and crowds), animals.
- Missions: small side jobs and random street events.

**Not in scope for now:** free typed/spoken AI conversation; clothing-store and shoe-wearing changes beyond what the shoe store needs; owning or working at a business; extra activities (volleyball, hoops, fishing, golf); a long story chain; many different heist types.

**Heist (conditional):** one decently large heist with a decent story, only if usage allows or the trajectory looks good. Build it last, after everything above works. Do not build several heist types.

**Round 2 answers (2026-11-15):**
- Nico's look does not change (no outfit or shoe changes). The shoe store is still a required, enterable shop; shoes are for sale/display only unless the user decides otherwise. Disguises therefore work through vehicle swaps (and any simple one-off cover like a hat only if cheap); confirm with the user.
- Every map area gets finished detail: downtown, Nico's neighborhood, beaches and bay, island and countryside.
- Driving should feel realistic (weight, real suspension, spin-outs), still controllable.
- Audience is both: great in the video and playable by anyone on the website (so 60 fps on ordinary hardware stays a hard rule).

**Round 3 answers (2026-11-15):**
- Disguises: vehicle swaps definitely count. No outfit changes. A hat and a mask are allowed as simple toggles; a mask worn during a store robbery hides the player's face so witnesses and cameras cannot identify them.
- Shoe store: enterable, normal-looking shop with shoppers inside. Shoes can be bought or stolen and kept at home (a closet or shelf), but cannot be worn. Purely for fun.
- Wanted scale: copy GTA V's structure (1-2 stars: warrant style, police only act if they clearly see and recognize you and may stop and question you; higher stars add more cars, aggressive pursuit, helicopters, SWAT, roadblocks, then military at 5). Star 6 is an over-the-top, nearly inescapable extreme version beyond 5. Check GTA V's exact scale before building; do not invent a different one.

**Round 4 answer (2026-11-15):** Everything should look visually insane. Highest priority, polished first and filmed up close: driving around the city, police chases, robbing a store, and Nico's house and neighborhood. The rest still has to look good, not rough.

## 13. Final scope answers (50-question interview, 2026-11-15)
Where an answer says "whatever GTA 6 will likely do", copy GTA 6 behavior. These override earlier sections.

**Look and performance:** photoreal with a game finish (GTA 6). Locked 60 fps, locked 1080p. Time of day and weather: whatever the game system provides (day/night + weather as in section 12).
**Map:** about 7x smaller than the first plan (the 2.1b estimate). Trace every road exactly from the user's map, filling in real-life locations. Required places: downtown towers, beach strip, marina, residential, industrial port, swamp, small towns, airport, plus whatever the real game would have. Countryside is weird swampy forest and farmland. No collectibles, secrets or easter eggs. Island link: whatever is on the map and what the real game would do.
**Interiors:** almost everything is enterable except apartment rooms and office rooms; those still get entrances, lobbies and hallways.
**Roads:** as accurate a real-life recreation as possible. Traffic obeys lights and reacts to the player; amount and crowds vary by place and time. Pedestrians sit, jog, talk, shop, walk dogs.
**Cars:** about 100 models (from the user's downloads), common ones in several colors; colors only, no other customization. Handling realistic but forgiving. Damage: dents, glass, fire, parts fall off. Theft: smash a window then hotwire, or just start it, depending on the car; simplified real life. Parking: park anywhere, with a garage-like area under the house; cars left in the open can be reported stolen and found by police. Water: one or two yachts, a few jet skis, many boats. Air: helicopter and plane. Camera: third person only, and move it closer to the character, matching real GTA 6 footage distance.
**People:** realistic population of 100+ unique people, each with a role (neighbors seen often, strangers rarely seen again). Vary bodies, faces, sizes, heights and clothes so nobody looks identical. Face quality high. Dialogue is context-based: first meeting = basic starters, later meetings refer to what happened last time. NPCs ragdoll and fight. Weapons: pistols, shotguns, rifles, melee. Violence pretty realistic, like GTA 5/6.
**Police:** cars, maybe motorcycles, and helicopters in extreme situations. Star 6 = harder 5 plus helicopters and aerial units plus a SWAT-style manhunt with a huge bounty. Outcome: arrest or death. Jail scenario where the player can break out or stay. Crimes noticed: speeding, red lights, hitting people, shooting, robbing, car theft, but only if something notices (witnesses, speed cameras, red-light cameras). Realistic camera density (more downtown, none rural); minor speeding without cameras is fine; bystanders may not report.
**Shops:** gas, grocery, gun, shoes, clothing, restaurants, barber, pawn, plus likely GTA 6 shops. Not every shop must be fully usable (barber is walk-in only, no haircuts). Robbery: threaten, cash, alarm, police.
**Missions:** side jobs: car theft orders, taxi, bounty. Street events: chases/crashes and muggings. The one big heist is a casino heist: just the heist, with a few steps (conditional on usage, per section 12). Reward: money.
**Audio and release:** several radio stations, all using the user's music-folder songs. Short voice lines. Keep the current title/menu. Release both as a website and a Mac app (V2.1). Save game yes.
**Process:** show screenshots after every big step.
