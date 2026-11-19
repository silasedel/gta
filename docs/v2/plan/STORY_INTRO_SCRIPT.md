# Southline: the introduction (Phase B script)

Five missions played in order from **Play** (`src/story/intro.js`). Each one is a file in `src/story/missions/` with the
id below; today they are playable skeletons (real steps, waypoints, triggers, checkpoints, cutscene stubs with these
lines). This document is the source for fleshing them out: every cutscene's shots and lines, every step, and the fail
rules. Framework: `src/story/README.md`. Code style: `docs/v2/CONVENTIONS.md` section 0.

The tone: sun-bleached Keys crime story. Nico is a calm, capable boat man who owes money and says little. Short lines,
no speeches. Nobody explains the plot twice.

## Characters

| Who | Model | Notes |
|---|---|---|
| **Nico** | the player | Lives on Pelican Point Ln, Key Largo. Boat man, mechanic, owes a debt he does not talk about. |
| **Augusto Vale** ("Mr. Vale") | NPC 44 (`p44`) | The employer. Silver hair, cream linen suit, soft voice, never in a hurry. Runs cargo through the Keys from a marina office. Calls Nico "son". |
| **Dex Marlow** | NPC 159 (`p159`) | Vale's associate. Big, loud, likes Nico on sight. Drives the boat in Ocean Smuggling if Nico is busy. |
| **Lou Batista** | NPC 162 (`p162`) | Vale's other associate. Quiet, watchful, the radio voice. Does not trust Nico yet. |
| **Cisco Pardo** | NPC 155 (`p155`) | Vale's man on the ground in the Glades. Captured by the swamp crew during the drop. Rescued in Swamp Rescue. |
| **The Sawgrass Boys** | gang NPCs 150–157 (`p150`–`p157`, not 155) | A swamp crew who took Cisco and want the cargo. Rifles and shotguns, airboats. Leader: **Wade** (`p150`). |

## Places (world meters; CONVENTIONS section 1)

| Place | Where | Used in |
|---|---|---|
| Nico's house | Pelican Point Ln, Key Largo; set piece `nico_house` (-1008, 5174); anchors `game.nicoHouse.anchors.*` | B1 start, B4 end, B5 |
| **Pelican Point Marina** (Vale's office) | Key Largo strip, near the `keys_bar` set piece (~ -1287, 5787); dock on the bay side | B1, B2 start, B4 landing |
| **The drop zone** | open Atlantic south-east of Key Largo (see `missions/intro.oceanSmuggling.js`) | B2 |
| **Sawgrass landing** | a creek mouth on the Everglades shore (boat in, on foot from here) | B2 end, B3 start |
| **The Sawgrass shack** | the stilt camp in the Everglades (`camps.js` `stilt_south`, ~ -2600, -330) | B3 |
| **The far dock** | across the slough west of the shack (`stilt_west`, ~ -2950, -820): Vale's floatplane waits there | B3 end, B4 start |

Exact coordinates live at the top of each mission file (`const PLACES`), checked against `game.city.isWater`.

---

## B1. First Job (`intro.firstJob`)

**Goal:** meet Vale's crew at the marina. Teaches walking, driving and the waypoint.

### Cutscene 1: "The Call" (Nico's yard, morning, skippable)
- Shot 1 (5 s, 24 mm): wide from the street, Nico working under the hood of the yellow ute in his yard. Slow push in.
- Shot 2 (3 s, 50 mm): his phone buzzes on the fender. He looks at it a long beat.
- Phone card: **Vale** (on screen 0.5 s .. 12 s).
- Shot 3 (5 s, 85 mm): close on Nico answering, the bay behind him.
  - **Vale:** "Nico. Augusto Vale. Your name came up."
  - **Nico:** "Came up where?"
  - **Vale:** "With people who say you can drive a boat and keep your mouth shut."
  - **Vale:** "Pelican Point Marina. One hour. Ask for Dex."
- Shot 4 (3 s, 35 mm): Nico closes the hood, wipes his hands. End: Nico by the ute's driver door.

### Steps
1. **Get in your truck.** (`enterVehicle`: the ute, spawned at `anchors.truck`.) Fail: none (died / arrested only).
2. **Drive to Pelican Point Marina.** Waypoint: the marina lot. `reach` r 10 in the ute. Checkpoint (at the house,
   ute restored).
3. **Find Dex and Lou on the dock.** On foot; `reach` r 4 near the two associates (Dex `talk_g`, Lou `cross_arms`).
4. **Talk to Dex.** `interact` "talk to Dex".

### Cutscene 2: "Dock Talk" (marina dock, skippable)
- Shot 1 (4 s, 35 mm): over Nico's shoulder onto Dex and Lou.
  - **Dex:** "So you're the boat guy. You're smaller than I pictured."
  - **Lou:** "He's late."
  - **Nico:** "Traffic on the Overseas."
- Shot 2 (4 s, 50 mm): Vale steps out of the office in the cream suit, sunglasses in hand.
  - **Vale:** "There he is. Tomorrow a plane drops some packages off the reef. You pick them up. Dex goes with you."
  - **Vale:** "Five thousand for a morning on the water. Easy money, son."
- Shot 3 (3 s, 85 mm): Nico looks at the water. **Nico:** "Nothing out there is easy."
- **Pass:** $500 advance, flag `intro.firstJob.done`, `vale.met`. End: on the marina dock.

---

## B2. Ocean Smuggling (`intro.oceanSmuggling`)

**Goal:** follow the drop plane, collect the floating packages, then the job goes wrong.

### Cutscene 1: "Briefing" (marina dock, dawn, skippable)
- Shot 1 (4 s, 28 mm): the console boat at the dock, Dex loading fuel cans.
- Shot 2 (5 s, 50 mm): Lou on the radio by the boat. **Lou:** "Plane's wheels up. It comes in low over the reef, drops six, and keeps going."
- **Dex:** "We follow it, we fish them out, we come home. Nobody waves at the Coast Guard."
- Shot 3 (3 s, 35 mm): Nico steps onto the boat.

### Steps
1. **Get in the boat.** (`enterVehicle`: `console` boat at the marina dock.)
2. **Head out to the reef.** `reach` the drop-zone entry (boat). Checkpoint (at the marina, boat restored).
3. **Follow the plane.** The drop plane (`prop`, scripted path, low over the water) flies a line; stay within 400 m
   (`escaped` fail: "You lost the plane."). Ends when the plane has dropped its packages.
4. **Collect the packages (0/6).** `collect` six floating `package_waterproof` props on the water (drop points along
   the plane's line), by boat. Checkpoint.
5. **(Radio call)** in-step cutscene without letterbox: phone card **Lou** + lines:
   - **Lou:** "Nico. Cisco's not answering. Our man in the Glades."
   - **Lou:** "His last call said airboats. The Sawgrass boys have him. And they want what's in your boat."
   - **Dex:** "Then we go get him."
6. **Head to the swamp.** `reach` Sawgrass landing by boat. Fail: boat destroyed.
- **Pass:** flag `intro.oceanSmuggling.done`, item none (the packages stay in the boat). End: Sawgrass landing.

---

## B3. Swamp Rescue (`intro.swampRescue`)

**Goal:** on foot into the Everglades, through the Sawgrass Boys, free Cisco, run for the far dock.

### Cutscene 1: "Landing" (creek mouth, dusk, skippable)
- Shot 1 (4 s, 24 mm): the boat noses into the mangroves. Fog on the water.
- **Dex:** "I stay with the boat and the cargo. You go get Cisco."
- **Dex** hands Nico a pistol (`events`: give `pistol` + ammo on `always: true`).
- Shot 2 (3 s, 85 mm): Nico checks the clip. **Nico:** "If I'm not back in an hour, don't wait."

### Steps
1. **Go into the swamp.** `reach` the edge of the shack clearing on foot. Fail: `leftArea` 900 m.
2. **Deal with the Sawgrass Boys (0/4).** Four gang peds (`p151`–`p154`) around the shack, armed (`fireAtPlayer`),
   `killAll`. Checkpoint.
3. **Free Cisco.** `interact` "cut the zip ties" at the shack (Cisco `p155`, pose `kneel`, prop `zip_tie`). Then a
   short in-step cutscene:
   - **Cisco:** "Took you long enough. Who are you?"
   - **Nico:** "The boat guy."
   - **Cisco:** "Wade's coming back with more. There's a plane at the old dock, west. Vale keeps it there."
4. **Survive the second wave (0/4).** Wade (`p150`) and three more (`p156`, `p157`, `p152`) arrive by airboat;
   `killAll`; fail `protect: 'cisco'`. Checkpoint.
5. **Run to the far dock.** `reach` the floatplane dock with Cisco following. Fail `protect: 'cisco'`.
- **Pass:** flag `intro.swampRescue.done`, `cisco.saved`. End: at the far dock.

---

## B4. Seaplane Escape (`intro.seaplaneEscape`)

**Goal:** fly out of the Glades, land at the marina, get paid.

### Steps
1. **Get in the seaplane.** `enterVehicle`: the floatplane at the far dock.
2. **Take off.** `until`: plane above 40 m.
3. **Fly to Pelican Point Marina.** `reach` (air) above the marina water, r 300. Checkpoint (at the far dock).
4. **Land on the water.** `until`: plane on the water and slow, within 600 m of the marina.
5. **Taxi to the dock.** `reach` r 15 in the plane.
6. **Get out.** `until`: on foot.

### Cutscene: "Paid" (marina dock, sunset, skippable)
- Shot 1 (4 s, 35 mm): Vale waits on the dock with a briefcase (`briefcase` prop), Lou behind him.
  - **Vale:** "Cisco called me from the air. He says you walked in there with one pistol."
  - **Nico:** "It was enough."
- Shot 2 (4 s, 50 mm): Vale hands over the case (prop `cash`).
  - **Vale:** "Five thousand, as promised. And a little more for the trouble."
  - **Vale:** "Go home. Sleep. I'll call."
- **Then steps:** 7. **Drive home.** (`reach` the house, the ute is at the marina lot.) 8. **Go inside.** (`interact`
  "go inside" at the front door.)
- **Pass:** $5,000, flag `intro.seaplaneEscape.done`, `vale.trust` 1. End: inside the front door.

---

## B5. Free Roam Unlock (`intro.freeRoamUnlock`)

**Goal:** the intro ends; the city opens.

### Cutscene 1: "Home" (Nico's house, night, skippable)
- Shot 1 (5 s, 24 mm): the house from the bay, lights on, the floatplane's wake still on the water.
- Shot 2 (4 s, 50 mm): Nico on the porch with a beer. The phone buzzes.
- Phone card **Vale** (2 s .. 12 s):
  - **Vale:** "You did good work today, son."
  - **Vale:** "There's more where that came from. Guns, money, things under the water. When you're ready, find me."
  - **Nico:** "And if I'm not?"
  - **Vale:** "Everybody's ready eventually."
- Shot 3 (3 s, 85 mm): Nico puts the phone face down.

### Steps
1. (cutscene)
2. **"Free roam unlocked"** notice; the optional mission markers (Phase C: Weapon Purchase, Collecting Money, Diving
   Job) appear on the map.
- **Pass:** flags `intro.freeRoamUnlock.done`, `intro.done`; unlock `freeRoam`. No payout card text beyond the title.

---

## After the intro (Phase C hooks)

The optional missions use `requires: ['intro.done']` and Vale (`giver: 'Vale'`, blip letter V) or their own givers.
Flags the intro sets that they can read: `vale.met`, `vale.trust`, `cisco.saved`.
