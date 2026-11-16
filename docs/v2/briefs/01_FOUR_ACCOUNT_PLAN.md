# Four accounts: the plan that applies (overrides the lane/account mapping in the README and EXECUTION_PLAN)

Capacity: 3 accounts at 90% of a weekly $200 plan + 1 account (dad) at 50% = **3.2 weeks**. Work for the full plan is about 4 weeks, so this plan trims scope to fit and says what is cut first. No lane may exceed its budget: when the budget is nearly spent, stop starting new things, finish and verify what exists, write STATUS, and hand over.

## Assignments
| Account | Budget | Lanes (see the lane brief files) | Scope notes |
|---|---|---|---|
| **1 World** | 0.9 | LANE_A (look, rendering, 60 fps, day/night, weather) + LANE_B (map, roads, signs, traffic lights, buildings placement) | Look 0.4, map and roads 0.5. Crowds and pedestrian behavior belong to account 2. Traffic: simple lane-following that obeys lights. |
| **2 People** | 0.9 | LANE_D (people, interiors, shops, Nico, house) | About 100 people, but rig and import in batches; build the key shops first (grocery, gas, gun, shoe, clothing, restaurant, pawn, casino, jail, police station), barber and hotel lobbies last. Pedestrian crowds, roles and walking. |
| **3 Vehicles + Law + Merge** | 0.9 | LANE_C (vehicles, damage, theft, boats, air) 0.4 + police from LANE_E item 1 (wanted scale, witnesses, cameras, jail) 0.3 + merge, Mac app build and V2.1 publish 0.2 | Import about 70 cars first, then more if budget remains. Merge duty moves here from lane A. |
| **4 Story (dad)** | 0.5 | LANE_E minus police and minus heist: HUD, dialogue wheel with NPC memory (light), shops buy and robbery, side jobs (taxi, car theft orders, bounty), street events, weapons, radio, save game | Heist only if someone finishes early. |

## Cut order if usage runs short (first to cut first)
1. Casino heist beyond a simple version. 2. Jail break-out (keep arrest and respawn). 3. NPC memory depth (keep first-meeting vs later-meeting lines). 4. Cars beyond 70. 5. Barber, hotel lobbies, extra interiors. 6. Weather beyond rain. 7. Extra polish. **Never cut:** the grain/pixelation fix, 60 fps, the road trace, models imported correctly, police basics, shops usable.

## Schedule
- Sun night: each account reads the README + its brief, creates its branch from `v2`, sets up the app, makes a first screenshot.
- Checkpoints (local time): Mon 12:00, Mon 22:00, Tue 12:00, Tue 22:00 (feature freeze), Wed 12:00 (final merge, Mac app build, V2.1 publish by account 3).
- Merge order at every checkpoint: 1, 2, 3, 4 into `integration`. Account 3 runs the game and logs breakage in `REQUESTS.md`.

## Hand-in and hand-back (zip workflow)
- The user zips the whole project folder with `.git` (no `node_modules`) for each account, plus a separate link to `~/Downloads/Models`.
- Each account returns a zip of **its branch's changed files and its `STATUS_<n>.md`** (and screenshots). The user unpacks into `lane-<n>` branches. If git is available, return `git bundle create lane-<n>.bundle --all` instead of loose files; the user runs `git fetch lane-<n>.bundle`.
- At each checkpoint accounts send the user a short message with: what is done, screenshots, fps, blockers.

## Starting message for every account (the user pastes it)
"Read `docs/v2/briefs/00_README_ALL_LANES.md`, `docs/v2/briefs/01_FOUR_ACCOUNT_PLAN.md` and your lane file (account 1: LANE_A and LANE_B; account 2: LANE_D; account 3: LANE_C plus the police part of LANE_E, plus merge duty; account 4: LANE_E without police and heist). Your budget is stated in the plan. Work on branch `lane-<number>`. Start now: set up the app, take a first screenshot, then work through your list in order, checking every step visually."
