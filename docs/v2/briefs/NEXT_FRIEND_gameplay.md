# Friend's brief (replaces NEXT_FRIEND_polish.md): missions, heists and gameplay

Change of plan (user, Nov 18 evening): the lead account makes the map, house, rendering and people "all perfect" tonight, so this account spends its whole week on **gameplay**: missions, the casino heist, and the mechanics that make it feel like GTA. Read `READ_ME_FIRST.md` first (mission, permissions, leave about 5% unused, tell the user which model and effort to use as the work changes).

## 1. Missions and the casino heist (the most important part)
Do everything in `docs/v2/briefs/NEXT_DAD_missions.md` (mission framework in `src/story/`, about 6 story missions, the casino heist with two prep missions and a finale with the distraction choice: rigged jackpot, winning big at roulette, or the fire alarm; staff corridor, security room, vault window, duffel, loading-dock getaway, police chase). If the user's dad already started `src/story/`, the user will put his work in the folder first: continue from it.
- Build a real **casino interior** for the heist as a store type on the interiors engine (`src/world/interiors/types/casino.js`; copy `types/gas_convenience.js`; models in `Models/Casino/`, slot machines from the user's Tripo files): floor with tables and slots, a bar built in code, cashier cage, staff corridor, security room with monitors, vault, back loading dock. The casino tower stands at about x 2183, z -370 on Miami Beach.
## 1b. Intro and opening missions
A cinematic intro (cutscenes that set up Nico's story), then a few simple guided missions ("go here, do this") that teach the controls and end with Nico free at his house in the Keys. Keep the normal house spawn available (for example from the menu or after the intro is done).
## 2. Mechanics (in this order)
1. **Stealable planes:** enter any parked plane at the airports; airport security and a wanted response when you take one; take-off and landing rules. The new controls (W/S throttle lever with an on-screen bar, mouse as the stick) and fitted hitboxes are already in `src/vehicles/air/`.
2. **Better cops:** a chase never starts without a known crime; hands on guns; clear pursuit start, roadblocks, spike strips, helicopter from 3 stars, SWAT from 4, surrender and arrest; GTA V wanted scale with the sixth star (`src/gameplay/wantedCore.js` already has the state machine).
3. **Carjack and hotwire:** open the door, pull the driver out (ragdoll clear of bushes), get in; smash a window and hotwire old or locked cars; the driver flees or fights.
4. **NPC interaction:** the dialogue wheel with rough memory (helped, robbed, threatened: they greet you, fear you or avoid you), shops you can buy from and rob, more side jobs.
## Files
You own `src/story/**`, `src/gameplay/**`, `src/jobs/**`, `src/world/interiors/types/casino.js`, `src/vehicles/air/**` (gameplay only). The lead already fixed the map, rendering and people; do not rework those. Put cross-area needs in `docs/v2/briefs/REQUESTS.md`.
## Hand-back
The whole project folder in the same layout (without `node_modules`), plus `docs/v2/briefs/STATUS_friend.md` (what works, how to start each mission, what is missing) and screenshots. Everything tested in the running game: every mission playable start to finish, failable and retryable, no soft locks.
