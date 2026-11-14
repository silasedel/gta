# gangs-business (v2.1): money, gangs, businesses, side jobs

The scope was cut on Nov 13 at the coordinator's request for budget: 3 gangs, 3 businesses and 3 jobs.

## Files
- `src/systems/systems.v2.js` (new, order 5): runs `createSystems`. It takes over the clock: `game.timeOfDay` becomes an accessor and writes still stage the time. It aliases `game.player.money` to carried cash, ignoring v1 death and arrest deductions because the v2 rules apply instead. It adds the `player` save slice (position, heading, health, armor, outfit). On boot it continues the newest slot or starts a new game; `?newgame` and `?nosave` work. It writes an exit snapshot on `pagehide`.
- `src/systems/business.js`: adds a `convenience` type. Every type gets tiered upgrades (`staff_1/2`, `security_1/2`, `decor_1/2`), and tier 2 needs tier 1. Adds a stock level that decays hourly and scales demand. Adds `B.security(id)`, `B.restock(id)` and `B.raid.start(id, opts)`.
- `src/systems/economy.js`: adds the convenience store price anchor.
- `src/gameplay/gangs/data.js`: three original gangs.
  - Las Garzas: teal and white, Little Havana and Brickell, disciplined.
  - Lyric Boys: black and gold, Overtown and Downtown, aggressive, more often armed.
  - Paint Wolves: magenta and black, Wynwood and Edgewater, fight as a swarm.
  - Each gang has a clothing kit, a car and rivals.
- `src/gameplay/gangs/gangs.v2.js`: turf, crews, rep, turf fights, brawls, drive-bys and corner raids. It also handles turf income and the pause-map layer overlay.
- `src/gameplay/business/business.v2.js`: three sites on real storefronts, each with a purchase or management marker (E).
  - Velvet Undertow (nightclub): Española Way.
  - Bayside Suds (car wash): Alton Road.
  - Night Owl Mart (convenience store): SE 3rd Street.
  - It also runs the events (robbery defense, inspections, supply runs) and exposes `game.club`.
- `src/jobs/kit.js`: shared markers, panel, help text owner, kit-dressed peds and enemy gunfire.
- `src/jobs/jobs.v2.js`: the job board on K, with Parcel run, Debt collection and Protect a shop.

## How to play
- **Turf:** walk up to a crew on its corner and press E, or hit one of them, to start a turf fight. You fight three waves, with no more than three people in melee at once; armed members shoot from range. Then you hold the corner for 20 seconds. A corner you own fills a stash of $70 to $120 per game hour, capped at $2,400. Press E on the corner to collect it as hot cash.
- **Rep:** the scale runs from -100 to 100: hostile, wary, neutral, friendly, allied. Kills and taken corners lower rep with that gang and raise it with its rivals. A hostile crew starts a fight when you come close.
- **Retaliation:** every game hour, gangs that hate you or have lost corners may stage a drive-by (their car, colors and gunfire) or a raid on your corner. You have 45 game minutes to get to a raided corner, or you lose it.
- **Pause map:** turf circles, business squares and a legend are drawn over the HUD's big map. L toggles them.

## Hooks for other tracks
- **npc-life:** gang kits are `game.gangs.kitFor(id)` (`{ top, bottom, shoes, hats, chain }`), and `game.gangs.gangOf(ped)` tells you which gang a ped belongs to. Right now `src/jobs/kit.js` `applyKit` re-applies the look with `look.js` `applyLook` after `people.dress`. A `game.people.dressKit(ped, kit)` in people.v2.js would be the clean home for this.
- **ui-frontend:** `game.mapLayers = [{ id, name, enabled, draw(g, toScreen, k), legend() }]`. `drawBigMap` should call these, and then my overlay canvas can go away. The phone could list `game.jobs.list`, `game.business.owned()` and `game.gangs`.
- **audio:** `game.club.open`, `.owned` and `.pos`, plus the events `clubOpen` and `clubClosed`.
- **New events:** `gangRep`, `turfFight`, `turfFightEnd`, `driveBy`, `businessInspection`, `jobStart`, `jobEnd`, `clubOpen`, `clubClosed`.
- **lead / main.js:** none required. The v1 hospital and bust deductions are already ignored by the money accessor. The new-game money is now $120 cash and $680 checking, where v1 started with $2,450.

## Not done
- Bar, boat rental and tow yard businesses.
- Getaway, repo and smuggling jobs.
- Gangs 4 and 5.
- Camera wobble from needs.
- Models for dropped inventory items.
- Needs and inventory are wired but were not tested in game.

## Verification (headless game runs, Nov 13; load average 15 to 30)
- A new game has $120 cash and $680 in the bank. `game.player.money` mirrors cash, and the HUD shows it.
- **Turf (`corner_crew.png`, `turf_fight_wave3.png`, `pause_map_turf.png`):**
  - A crew of 4 Lyric Boys in black stood on the NE 3rd Street corner.
  - The turf fight ran waves 1 to 3. The hold was shortened from 20 to 3 seconds for the test. The corner became the player's.
  - Rep moved as designed: Lyric -67, Garzas +34, Wolves +34.
  - The map overlay showed the turf circles and the legend.
- **Business (`club_for_sale.png`, `club_owned_income.png`, `club_robbery.png`):**
  - The club was bought with a test grant of money.
  - After skipping 5 game hours the safe held $2,573 and the club was open (`game.club.open` was true). Collecting moved $2,573.39 into cash.
  - A robbery spawned 3 robbers. Clearing them resolved it as defended, and it was logged in the panel.
- **Jobs:** Parcel run and Debt collection ran to the end and paid out; debt collection was forced through pay, run and fight. Protect a shop started wave 1 with 3 thugs, but I never saw it finish: three runs were cut off by page reloads.
- **Save and reload:** I saved, reloaded the page and compared the state. Cash, bank, the owned club and its `decor_1` upgrade, the owned corner and its $718 stash, rep, the clock (4:03 PM) and the position were all identical.
- **Testing note:** other agents' edits to `main.js` and `peds.js` full-reload the page every few minutes, which cuts long test runs short.
