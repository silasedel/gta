# Southline: your full brief

You are one stage in a relay. Four Claude Code sessions, each on a different account, build this game one after another. Each stage starts from the finished, tested result of the stage before it, does its own exact job, and hands back a better game to the next one. This document is everything you need.

## The game and the quality bar
Southline is an original open-world crime game (Vite, three.js 0.170, Rapier) in a real-scale Miami-style city plus a fictional island, built to the user's own road map. It is for a YouTube video and a playable website/Mac app. The bar is GTA 6 footage: **photoreal with a game finish**, smooth surfaces (no grain, no dot or dither patterns, no pixelation, no flat "slop" layers), **locked 1080p, 60 fps on ordinary hardware**. Graphics are cut last. Everything uses made-up brands, American spelling, and only files that are free for game use.
Repo: this folder. Modules auto-load via `import.meta.glob('./**/*.v2.js')` exporting `initV2(game)` and `order`. Plans and images: `docs/v2/plan/` (road map `map_roads_target.webp`, colour map, HUD `hud_corner_target.webp`, Nico's house photos `nico_house/1..6`). Model library: `Models/` (`Models/README.txt`, `Models/catalog.csv`; do not use the 4 rows marked "personal use only").

## How you work
- Work on branch `stage-<your number>`, created from the project exactly as the user gives it to you (it already contains every earlier stage). Never touch `main` or `v2`. Commit small and often.
- Do your job list below. If you find a bug in an earlier stage's work that blocks you, fix it. Do not rebuild earlier stages' systems that work; improve them only if your job says so.
- Read `docs/v2/CONVENTIONS.md` (spawn points, door markers, road graph, shop slots, naming). Follow it. Stage 1 writes it; every later stage keeps it up to date.
- After every big step, run the real app at 1080p, take screenshots, look at them yourself, and fix what looks bad. Save the best to `docs/v2/shots/<your lane>/`. Never say something is done without looking at it.
- Stop at the budget in your stage section. The accounts are shared with friends and family: never go past about 90% of the account's weekly usage (and never past your stated budget); check the usage display regularly. The last 10% stays free so the user can fix mistakes or continue. If you are near the limit, stop, finish and verify what exists, write the hand-back, and report.
- Measure performance: the frame budget is 16.6 ms at 1080p on a mid laptop GPU. Use instancing, LOD and culling. Report ms before and after.
- Your budget is stated in your section. Use the strongest model for design and hard problems, cheaper ones for mechanical checks, run heavy commands in the background. Do not ask questions the code or this document already answer. Do the jobs in order; each job has a budget and a done test. Do not start the next job until the current one passes its test. When your budget is nearly spent: finish and verify what exists, write your status, and hand back.
- Write `docs/v2/briefs/STATUS_stage<number>.md` as you go: done, in progress, blocked, screenshots, fps.
- Never publish, push to a public place, enter credentials, or delete assets.

## Models: what you need, and how to ask for them
You cannot download models yourself. If you need a model that is not in `Models/`, do not wait for it: build a simple code placeholder and keep going, and add the request to `docs/v2/briefs/MODEL_REQUESTS_<your number>.md`. Batch requests and send the file to the user whenever it has something new. For each model write: name, what it is, where it is used, size (small / medium / big), and search keywords. The user will handle each one like this:
- **Common, simple, small items** (props, street furniture, bottles, chairs, signs): the user downloads them from the free asset site.
- **Anything big or that must look polished** (buildings, large interiors, vehicles, boats, terrain pieces): the user downloads it from the free asset site. These are never made with AI generation.
- **Custom or unusual single items** (a slot machine, special shoes, a vault door, a specific person): the user generates them with the AI model tool (Tripo), from a reference image. That tool is good for custom single props and people, and bad at big, smooth, perfectly polished objects.
Tell the user the priority of each request so they can do the important ones first.

## Hand-back
Everything lives in one folder: this project folder (it also holds `Models/` with all downloaded models, `references/user_references/` with the user's reference photos, and `public/assets/audio/sfx/southline_death.mp3`). You may edit anything in it. When all jobs pass their tests, or your budget is nearly spent, give the user the whole project folder back as a zip, in exactly the same layout (leave out `node_modules`; do not rename, move or delete the existing folders; do not change anything inside `Models/` except adding files in the right category folder if the user asks). Include your STATUS and MODEL_REQUESTS files and your best screenshots inside the folder. The next stage starts from exactly this folder. Update `docs/v2/CONVENTIONS.md` with anything the next stage must know.

## The user's final decisions (these override anything else)
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



# YOUR STAGE: 1 of 4, WORLD FOUNDATION
Budget: 0.9 of a weekly $200 plan. Starting point: the project as it is now (the old world).

## Jobs (in order; budget is a share of your 0.9; do not start the next job until the current one passes its test)
1. **Rendering and look, 0.30.** Remove every source of grain, dots, dithering, pixelation and shimmer: alpha-hashed transparency (hair, LOD fades, glass, vegetation), shadow and SSAO noise, film grain, TAA/MSAA misconfiguration. Lock 1080p. Photoreal with a game finish: sky, sun, golden hour, tone mapping, color grade, bloom, reflections on paint, glass and water, wet roads at night, working lamps. Fix shoreline flicker and ground glitching in water. Move the third-person camera closer (GTA 6 distance) without clipping. TEST: clean smooth screenshots at spawn, downtown, bay, Nico's house, night; fps >= 60 at those places (report ms).
2. **Day/night and weather, 0.08.** A fixed-length day cycle (not a setting). Common weather: clear, partly cloudy, overcast, rain, heavy rain with thunder and lightning, fog, wind in palms and flags, with matching lighting, wet roads and puddles. No hurricane. TEST: screenshots at noon, sunset, night, rain, thunderstorm, fog; fps >= 60.
3. **Map rebuild and trace, 0.30.** Rebuild the map about 7x smaller (plan section 2.1b) and trace every road exactly from `docs/v2/plan/map_roads_target.webp`, using `map_colour_target.webp` for land and water. Real-style districts: downtown towers, beach strip, marina, residential, industrial port, airport, swamp, small towns, farmland and forest. Nico's neighborhood matches the images in `docs/v2/plan/nico_house/`. TEST: an overlay of your roads on the target image matches within about one road width; a 5-minute drive across the map has no pop-in, gaps or floating roads.
4. **Road system, 0.10.** Lane markings, crosswalks, curbs, sidewalks, intersections with working traffic lights, stop and speed-limit signs, street names. No roads or crosswalks on grass, no trees or props on roads. Simple AI traffic that follows lanes and obeys lights, amount varying by place and time. TEST: drive through 10 intersections with correct light behavior and AI cars stopping.
5. **Buildings and dressing, 0.07.** Place the library buildings and kit-bashed variants by district, instanced, grounded, no overlaps or z-fighting; street lamps, signs, bins, benches, palms. TEST: screenshots of 6 districts; fps >= 60.
6. **HUD, 0.05.** The corner HUD exactly as `docs/v2/plan/hud_corner_target.webp` (6 stars in one row, earned stars charcoal, five evidence icons, ammo "20" / "73", pistol art), wired to a wanted-level value others will drive. Keep the current title and menu. Remove the volleyball people. Fix the "CALORA / CLICK TO PLAY" overlay. TEST: HUD screenshots at 0-6 stars match the target.
7. **Write `docs/v2/CONVENTIONS.md`.** Where to find: spawn points for people and cars, road graph, parking spaces, shop slots (building door markers with an interior id), police station and jail locations, camera positions, airport and docks, the casino (including its back lot and loading dock road). Also the event names for crimes (`crime` with type, position, witnesses), stars (`wanted`), money, and missions, so later stages and the story systems connect.

## Not in this version (cut to fit the budget; do not build these)
Jail break-out (arrest leads to a short jail scene and respawn), deep NPC memory (rough memory only), random street events beyond police chases, hurricanes and extreme weather, a long multi-heist campaign (build the single heist in stage 4). Never cut: the grain fix, 60 fps, the road trace, correctly imported models, police basics, usable shops, a clean polished look.

## Models the user prepares for this stage
Buildings (about 45: downtown towers 15, apartments 8, houses 10, shop fronts and strip malls 10, hotels 4, port and warehouses 6); street props (traffic lights, street lamps, signs, bus stops, parking meters, news boxes, billboards); palms and trees; free CC0 textures for road, wall, floor, carpet. The user downloads all of these (big and polished things are downloaded, never AI-generated).
(If you need something that is not listed or not in `Models/`, use a code placeholder and add it to your model request file.)

## Hand-back test for this stage
A project running at 60 fps with the new traced map, roads, traffic lights, buildings, clean smooth graphics, the exact HUD, and `CONVENTIONS.md`. Include a tour of screenshots.

## Start
Set up the app, take a first screenshot of the current state, then do the jobs in order, checking every step visually and measuring fps.
