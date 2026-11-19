# Nov 19 playtest: fix list (user feedback, morning)

Target: testable on video around 13:00. Each workstream has one owner; owners commit their own files only.

## W1 House (Nico's house, Keys): owner house agent
- Rotate the whole house (with its deck, stairs, dock and yard; not the canal or beach) ~10° counterclockwise.
- Back stairs from the main back deck go down on the OTHER side of the deck. They should reach the ground sooner (steeper, further left).
- Basketball hoop on the face at the bottom of those stairs (now it stands in the middle).
- Gym deck: weight bench, yoga mat and table against the back wall next to the canal.
- Plants look terrible (outside and inside): use the user's plant-pot models, remove random plants on floors and around chairs, fix glitching plants, and move the plant blocking the driveway exit.
- Barrel clipping a pole; pot and pan clipping each other.
- Snake terrarium: rotate 90°, keep it against the counter.
- Kitchen sink: use the user's sink model, with nothing over it.
- Mirror the bedroom and bathroom (swap sides of the hallway).
- Front door color: more grey.
- Dock: one purposeful, connected structure, not pieces thrown together; smooth joints to the seawall. Buckets and cases pop in late a few feet away: load them with the dock, or place them properly.
- Concrete pad edge: blend into dirt and rubble, no harsh end.
- Map: the canal on the pause map and minimap looks like a high heel, not a canal; match the real canal.
- Layout inside is right (keep it). Canal and beach look good (keep them).

## W2 Vehicles: owner vehicles agent
- Driving camera still jitters back and forth (lead fixes this, see W7).
- Per-model handling, acceleration, top speed and sound from the real car each resembles (G-Wagon-like = heavy SUV, Porsche-like = quick sports car, EVs = instant torque).
- Supercars and luxury cars should actually spawn (luxury districts, Brickell, downtown, Miami Beach).
- Car mesh glitches: "diamonds" and z-fighting layers on bodies, LOD swap glitches, interiors plain white with no texture.
- Boat: more realistic wave and water physics; better seated pose for the driver; boats drive far too far onto land.
- Stealing: a hotwire minigame for cars that aren't yours, plus the break-window entry (the user likes the window animation).
- Radio: a good-looking radio wheel or bar with station icons at the top.
- Military vehicles: Humvee (user's downloads: ~/Downloads/humvee.zip, ~/Downloads/ukrainian-modified-humvee.zip; check licenses).

## W3 Menus and HUD: owner UI agent
- Pause tabs order: Map, Settings, Wardrobe, Controls, Stats. Pause always opens on Map.
- Dev mode: a "Dev mode" toggle in Settings; turning it on asks for the code each time; turning it off works.
- Dev teleport loading: use the main menu's loading screen look.
- Mute button (top right) for menu or loading music; not muted by default.
- Death screen: "WASTED" instead of "Lights out".
- Remove the bad "jump before landing" hint.
- "Don't have F or E as an option": interaction prompts should show one key, not "F or E".
- NPC and cop UI polish (wanted level, police HUD, NPC interaction prompts), groundwork for missions.

## W4 World, roads, trees: owner world agent
- Road layers z-fighting (same-height layers flicker by angle): map-wide fix.
- Keys-to-mainland overpass and bridges: too low and plain. Arc to ~6 m (20 ft) above the water at the peak, with a nice arc like the reference images. Make the overpass look good.
- Concrete slabs with dots (tactile pads / random slabs) placed broadly: remove or put only at crossings.
- A brick store a few feet thick and glitched; driving into an invisible or brick wall (collider mismatch).
- Trees and palms pop in last minute at low quality: proper LOD chain (impostors far, better mid, full near) with a longer range.
- Tree grates and grass at city palms look flat: real 3D grass, better grate and pit.
- Palms colliding with things.
- A luxury street in Brickell modeled on a well-known rich street.
- Everglades: crisp, good-looking.
- Walking on water (beach).

## W5 Player: owner player agent
- Lighting on the character still looks off.
- Get-up after a fall or death: slower, realistic (crawl, push up), no glitch.
- Camera can go through the ceiling indoors.

## W6 Military base and airport: owner airport agent
- The smaller airport becomes a military base: fence, a gate checkpoint with guards, armed guards patrolling, cameras, jets, a big cargo plane (user's model if present), Humvees. Very hard to sneak in: climb the fence on a side unseen; if seen, a high wanted level.
- Helipad on the Keys near spawn with a stealable helicopter. Flying in normally and landing well isn't suspicious until they see you get out; erratic flying is.
- Jets stealable.
- The main airport: commercial planes, runways that work, security and cameras, harder to enter but less than the base.

## W7 Performance (lead)
- Driving ~20 fps reported; need 30 minimum.
- Driving camera jitter.

## Models the user can provide
Ask for: plant pots (user has some), sink (user has one), C-130 style cargo plane, guard NPCs (can make with Tripo), Humvee (downloaded). Anything specific is hard to find; generic parts are fine.
