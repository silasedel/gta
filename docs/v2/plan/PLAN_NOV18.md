# Plan from Nov 18: three parties working at the same time (user, friend, dad)

## Where the game stands (read Nov 18)
- **Good:** Nico's spawn yard in the Keys looks strong (palms, poincianas, parked cars, rusty convertible); weather, wet roads, day/night, the exact HUD, a six-star wanted state machine, jobs board (parcel, debt, shop protection), taxi/delivery/race/bounty activities, planes (prop, floatplane, jet), gangs and business modules, about 95 people, ragdolls, the traced map (442 km of roads), the Keys bridge fix, Mac app and website builds.
- **Weak:** downtown and dense districts still look flat (flat brick, dark plazas, camera clipping into roofs); textures not crisp; grainy shadows; foliage layered; the house is far from the mock-ups; road and sand edges near Nico's; fps 30-45 at busy spots (CPU-bound, draw calls and tile building).
- **Missing:** story missions and heists (none exist; only side jobs), a casino interior (no `casino` store type), police AI polish (a cop chased the user with no crime; officers' hands twist on guns), carjack/hotwire sequence, stealable planes with airport consequences, richer NPC behavior and dialogue.

## Who does what (files are split so nobody overwrites anyone)
| Who | When | Work | Owns (only edit these) |
|---|---|---|---|
| **Friend's account** | Tomorrow morning on (the big one) | `docs/v2/briefs/NEXT_FRIEND_polish.md`: graphics, map and bug polish, models in, 60 fps | `src/world/**`, `src/render/**`, `src/vehicles/**`, `tools/v2/map3/**`, `public/assets/**`, Nico's house, `desktop/**` |
| **User's own account (50%)** | After it resets tonight | Mechanics: stealing planes + airport response, better cops, better NPCs, carjack and hotwire, the casino interior; merge duty | `src/gameplay/police/**`, `src/gameplay/combat/**`, `src/npc/**`, `src/player/**`, `src/world/interiors/types/casino.js` |
| **Dad's account** | Whenever, at the same time | `docs/v2/briefs/NEXT_DAD_missions.md`: a mission framework, about 6 story missions, a casino heist with prep missions and a finale, all in new files | `src/story/**` only (new folder) |
All three work from the same zip of the project; each hands back the changed files and a short report. The user unpacks each into its own branch (`friend`, `lead`, `dad`) and the lead merges. Because the owned folders do not overlap, merging is copying folders plus a few small edits.

## Order of events
1. **Tonight (lead, a little usage):** write the friend's and dad's briefs (done in this file set), then use the rest of tonight's usage on the mechanics list below.
2. **Tomorrow day (friend):** works its brief; dad works his in parallel.
3. **After that:** the lead merges everything, plays it, fixes breakage, and spends remaining usage on missions polish, the casino interior and playtest bugs.

## Lead's mechanics list (the user's 50%)
1. **Stealable planes:** enter any parked plane at the airport (F at the door); airport security and a one-star response when you take one without a pilot's license or from the hangar; fly, land, take-off rules; small planes first, jet next.
2. **Better cops:** a chase never starts without a known crime; fix hand-on-gun poses; clear pursuit start (siren, shout, give-up window), roadblocks, spike strips, helicopter at 3 stars, SWAT van at 4+, arrest and surrender states, plausible loss-of-sight searching.
3. **Better NPCs:** reactions to the player (afraid after being hit or robbed, friendly after help), simple memory flags, richer dialogue lines by role and mood, pathing around trees and off roads, sitting and phone use.
4. **Carjack and hotwire:** door open, pull the driver out (ragdoll clear of bushes), get in, short hotwire when smashed or on old cars, driver flees or fights.
5. **Casino interior** as a store type on the interiors engine (`src/world/interiors/types/casino.js`, copy `gas_convenience.js`), with a vault, staff corridor, security room and loading dock, for the heist the dad builds.
