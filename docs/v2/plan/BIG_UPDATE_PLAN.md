# Southline V2: the big update, the master plan

Living document. Started 2026-11-14 after the user's playtests (screenshots in `references/playtest_1114/`, local).
Every session that works on V2 reads this first, then the section for its job.

## 0. The goal and the bar

- **Goal:** a polished, explorable open-world game in the style of a modern AAA Florida crime game (original IP: no
  real brands, logos or names from other games). It should look and play well enough to be the centrepiece of a
  YouTube video.
- **Visual bar:** 9/10 or better against the user's "after" reference images, judged in the **Mac app at full Retina
  resolution**, never only in a small headless shot. Anything that can't reach 9/10 from code gets a real model
  (section 4).
- **Feel:** smooth, clean, shiny where it should be, no grain, no dots, no flicker, no pop-in, no clipping, no bugs.
- **Explorable:** the whole map. Hand-made detail goes first where the camera spends the most time, and the whole
  map must still be clean and bug-free.

### How work is done (lessons from the first V2 push, which the user called "a shortcut job")
1. **No 15-agent swarms.** One lead session plus at most 2–3 helper agents. Sonnet does the bulk work; Opus plans
   and reviews.
2. **Every job has a reviewer and a glitch-hunter pass**, the way the user's car channel works (`SilasCars/CHANNEL.md`).
3. **Judge in the Mac app.** Rebuild with `npm run desktop:build -- --no-dmg`, take screenshots in the real window,
   and compare with the reference. Agents' self-reported scores don't count.
4. **Don't claim done** until it's checked. Report honestly what's unverified.
5. **Real models over code models.** Use `~/Downloads/Models` (136 assets) and `~/Downloads/Cars`, plus Tripo
   models the user makes (section 4). Code only builds what no model can be: roads, terrain, layout and systems.
6. **Budget:** check usage at every milestone. The cap is decided by the user each week.

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
- [ ] Resolution: at least 1080p internal at all times, native on High/Ultra. Find the real cost, then fix it with
  LOD and culling, not resolution.
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
- [ ] A consistent material profile: every imported model is normalised (roughness and metalness ranges, albedo
  brightness, normal strength) so nothing looks too matte or too shiny next to its neighbours.
- [ ] Steady 60 fps on the user's M3 Max at Ultra, in downtown, by Nico's house, on the highway and inside the club.
- **Acceptance:** side-by-side shots from the Mac app at noon, sunset and night in 5 spots, scored 9/10 or better
  against the "after" references (ref_57, 58, 59, 64). There's a separate 10-second capture driving at speed, to
  check for shimmer and ghosting.

## 2. The map: rebuild to the user's road map, at the right scale

Targets in this folder:
- `map_roads_target.webp` (1041×1511): black land, white roads. This is **the** road layout. Trace it pixel for pixel.
- `map_colour_target.webp` (1041×1511, the same frame): the colour version (water, land, parks, towns).

They line up. The current world maps them with `x = -25450 + 30·px`, `z = -24890 + 30·py` (30 m per pixel). That
scale is a guess and is probably too big.

### 2.1 Work out the true scale from downtown
1. Find **downtown** in both images: the dense grid on the east coast by the bay. Measure its size in pixels across
   (from the water to where the grid ends) and along.
2. Match it to **real downtown Miami**. Measure the real span on the OSM data in `public/assets/miami/` (Biscayne
   Blvd to I-95, and from the Miami River to I-395). Measure; don't guess.
3. The **metres per pixel** = real metres ÷ map pixels. Apply that one scale to the whole island. The user expects
   the island to come out **smaller** than now.
4. Re-check against the user's own street counts (memory: fictional-land-scale):
   - downtown is 3–5 streets across (8–9 at the widest) and 15–16 long;
   - the round-lake town is 4×5;
   - the island towns have about 6 streets, or one road down the middle.
5. Write the result to `docs/v2/plan/map_scale.json`: px boxes, real metres, the chosen m/px, and the new transform.

### 2.2 Trace the roads exactly
- [ ] Skeletonise the white road pixels of `map_roads_target.webp` into a graph. Line width in pixels tells you the
  road class: motorway, arterial, local.
- [ ] Keep every road in the image and add none, except bridges and ramps the image clearly implies.
- [ ] **Count the roads per section** and check them against the image: each town grid, downtown, the highway ring
  and the island links. Print a table of image count against game count; every row must match.
- [ ] Rebuild with `tools/world/build.py` (maproads stage), keeping the real-Miami OSM part as it is.
- [ ] Every island and town reachable by road; no 1.6 m lips or steps (`tools/v2/maproads/drive-probe.mjs`).

### 2.3 Pieces of real Miami, placed onto the map
- Downtown, Brickell, South Beach / Ocean Drive, Wynwood and Little Havana are modelled on the real places: street
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
1. Remove brands; add Southline logos and Florida plates.
2. Normalise materials (section 1).
3. Make LODs.
4. Fit colliders and hitboxes.

Vehicles also get split wheels that spin and steer, per-wheel suspension, door, seat, light and exhaust points, and
damage pieces.

**Car colours:** realistic for Miami. Roughly:
- white 25%, black 20%, grey 18%, silver 12%, blue 9%, red 8%;
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
3. **Shop staff** (the regular owners and clerks): bodega clerk, diner cook, jeweller, pawn-shop owner, gun-store
   owner, shoe-store clerk.
4. **Hero props** that are missing: an ATM, a vending machine, a newspaper box, a fire hydrant, a mailbox, a
   lifeguard tower, beach chairs and umbrellas (if not enough), a food truck, a hot-dog cart, a phone booth
   (optional).

### Wanted from downloads (the user and ChatGPT are finding these)
- **Trees and palms (most needed):** coconut palm, royal palm, sabal palm, live oak, sea grape, mangrove, banyan,
  bushes and hedges, grass clumps. These replace the "copy-paste splotchy" trees.
- **Storefronts and shop interiors:** shelves, counters, registers, displays, clothing racks, a shoe wall, a jewellery
  case, a diner booth, a bar, club furniture.
- **Building kits:** Art Deco facades (Ocean Drive), glass towers (Brickell and downtown), Mediterranean houses,
  warehouses (Wynwood), strip malls.
- **Marina:** piers, boat lifts, fuel dock, bollards, buoys.
- **Interiors for the safehouse** and the main mission locations.

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
  - each has its own regular staff member with their own look, voice and behaviour, its own stock and prices, and
    a security level (a jeweller has a guard and cameras, a bodega has one nervous clerk);
  - templates for the rest.
- [ ] **Police and wanted:** the existing system, polished and verified.
- [ ] Settings: only real options. Removed: traffic and pedestrian density, day length (b9cde62).

## 6b. HUD corner (top right): match `hud_corner_target.webp` exactly
The user designed this target. Replicate it pixel for pixel, scaled to the screen:
- **Wanted stars: SIX stars** in one evenly spaced row, chunky, with a thick black outline. Earned stars are mid-grey
  (the example shows 4 earned); unearned stars are near-white. No gap between the two groups.
- **Evidence icons** below the stars: dark-red circles with a black outline and a white glyph, in this order: camera,
  witnesses (two heads), clothing (hanger), face seen (one head), weapon seen (pistol). Show only the ones that
  apply, keeping the same style.
- **Ammo:** a big bold number with a black outline. The clip count is white ("20"); the reserve is grey ("73").
- **Weapon icon:** a glossy, slightly 3D illustration of the current weapon (dark blue-steel pistol, black outline),
  under the ammo. Every weapon gets the same illustrated style.
- Everything right-aligned, with the same proportions and spacing as the image. Check it in the Mac app.

## 6c. Features to add (user's list, 2026-11-14)
**Police and crime**
- [ ] A six-star wanted system with police responses that escalate at each level.
- [ ] Witnesses: NPCs report crimes; security cameras can identify suspects.
- [ ] Police recognition: officers remember the player's appearance, clothing and vehicle.
- [ ] Disguises: changing clothes or vehicle helps you escape.
- [ ] Realistic pursuits: police can recognise the player again after a chase.

**Vehicles**
- [ ] Vehicle security: older cars are easier to steal; expensive cars have better security.
- [ ] Alarms and trackers on some stolen vehicles.
- [ ] Ownership: register stolen vehicles to keep them for good.
- [ ] Fuel: cars sometimes need refuelling, and electric cars need charging (gas pumps are in the model library).
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

## 7. Missions, heists and things to do (so it's a game, not just a sandbox)
- [ ] A story arc of 8–12 missions with Nico, using the systems that exist: cars, boats, yachts, clubs, shops,
  police.
- [ ] **Heists (3–4):** planning phase (scout, crew, gear), setup missions, then the job, with branching approaches
  (quiet or loud). Ideas:
  - a jewellery store downtown;
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
7. Final polish pass, rebuild the Mac app, publish to https://silasedel.github.io/gta-v2/ (repo `silasedel/gta-v2`;
   push with `git push gtav2 v2:main`, only when the user asks).

Budget estimate with the asset library: about 1.5–2 weeks of plan usage, or about 1 week with capped extra usage
(about $800–1,500). Missions and heists add about 0.5 week. Re-estimate after step 1.
