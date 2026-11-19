# Southline story start: plan and split (Nov 19)

The user's spec (designed with ChatGPT) is quoted at the end. This file turns it into buildable workstreams, says which
account builds what, and sets the order. Rules for everyone: build into the existing game (same world, look, characters,
vehicles, systems); write readable code (CONVENTIONS.md section 0); reuse `src/systems/save.js`, `src/jobs/**`,
`src/activities/**`, `src/net/**` and `server/**` instead of writing parallel versions; commit only your own files.

## What already exists (start here, don't rebuild)
- Saves: `src/systems/save.js` (+ storage.js, worldstate.js).
- Jobs and activities: `src/jobs/jobs.v2.js`, `src/jobs/kit.js`, `src/activities/**` (jet ski, subway, yacht, dock, crew).
- Cutscene camera and title cards: `src/ui/menu/intros.v2.js`, `src/ui/menu/cinema.js` (filmed shots, letterbox, skip).
- Front end and menus: `src/ui/menu/frontend.v2.js`, pause menu (Map, Settings, Wardrobe, Controls, Stats).
- Phone: `src/ui/phone/**` (calls and texts for the employer).
- Police and wanted API: CONVENTIONS.md 4a. People: 4b. Activities API: 4c. Mission Passed sting: 4d.
- Boats, seaplanes (`floatplane.glb`), helicopters and aircraft controls: `src/vehicles/**`, `src/world/airport/heli.v2.js`.
- Combat, weapons, gangs: `src/gameplay/**`. Stealth guards: `src/gameplay/stealth/**`.
- Multiplayer: `server/server.js` + `server/room.js` (Node WebSocket server, `npm run server`), client `src/net/*`
  (binary state protocol, interest snapshots, reconciliation).

## Phase A: the story framework (this account, first; everything else builds on it)
A1. **Story state and mission runner** (`src/story/**`, new). Story stage flags, a mission definition format (steps with
    objective text, waypoint, trigger, fail conditions, checkpoints), an objective HUD line, waypoint plus map marker, fail and
    retry screen, and a "Mission Passed" end with payout (the sting exists). Autosave after each completed mission via save.js, and
    "Continue" resumes at the saved stage. Skipping a mission sets exactly the flags, unlocks, money and items that completing it would.
A2. **Cutscene sequencer**: script cutscenes as data (shots from cinema.js, phone call overlay, subtitles, character
    placement, vehicle placement) with a Skip button (hold to skip). Intro missions can't be skipped when started from Play.
A3. **Main menu redesign**: original design, simple. Story: Play (starts or continues the story), Free Roam (spawn at
    Nico's house, everything unlocked as after the intro), Restart Story (confirm, then wipe story progress). Multiplayer
    (Phase D). Settings, Quit. First-time players see only Play prominently.
Done when: a 2-step test mission can be started, failed, retried, passed, autosaved, continued after restart, and skipped
with correct flags.

## Phase B: the main introduction (this account)
B1. **First Job**: phone-call cutscene from the employer, he gets in his car (the yellow ute), drive to the marina
    waypoint, walk to two associates, interact.
B2. **Ocean Smuggling**: briefing cutscene, motorboat, follow the drop aircraft (an existing plane on a scripted path),
    collect 5–6 floating packages (buoyant props plus pickup), radio call (associate captured), head to the swamp marker.
B3. **Swamp Rescue**: dock, on foot into the swamp (Everglades), armed enemies (gang AI from `src/gameplay/gangs`),
    shack, free the associate (interact plus short animation), a second wave, run to the seaplane at the far dock.
B4. **Seaplane Escape**: board the floatplane, take off from the water, fly to the marina marker, land, taxi, exit.
    Cutscene: the employer pays and says go home. Drive home, enter the house.
B5. **Free Roam Unlock**: arrival cutscene, phone call ("more work"), "Free roam unlocked" notice, mission markers on
    the map.
Done when: all five play start to finish in the Mac app with no dev tools, each autosaves, and Continue lands right.

## Phase C: the first optional missions (friend's account after Phase A lands, or this account)
C1. **Weapon Purchase**: drive to a gun store, buy (store UI with a few guns and ammo), exit, ambush by criminals, win.
C2. **Collecting Money**: small business, confront the owner, he runs (chase on foot or by car), catch him, collect, return
    to the employer.
C3. **Diving Job**: meet a boat owner at a marina, boat to a shipwreck marker, dive (swim and dive exist), collect cargo
    underwater (oxygen timer), return to the boat, deliver.
Each one stands alone (markers after the intro, any order) and uses the Phase A runner. Each is one self-contained brief.

## Phase D: multiplayer and proximity voice (friend's account; independent of A–C)
D1. Menu: Multiplayer, then Host or Join. Host starts the bundled Node server inside the Electron app (or connects to
    one); Join by code or IP. Connected players spawn into the open world.
D2. Sync: player movement and animation, vehicles (driver authority), relevant interactions (doors, pickups, shots,
    wanted level per player) over the existing protocol.
D3. Proximity voice: WebRTC audio between peers, signaled over the existing WebSocket; each remote voice runs through a
    Web Audio panner at the speaker's position, with rolloff by distance (full within ~5 m, silent past ~60 m). Mic mute
    (key and HUD icon), voice volume slider, push-to-talk option. Mic permission prompt handled in Electron.
**Decided (user, Nov 19): over the internet.** Design:
- Deploy the existing `server/` (Node + ws) to a free cloud host (Fly.io, Render or Railway; one small always-on instance with
  WebSocket support). The user or friend creates that account and runs the deploy; the AI prepares the Dockerfile or config and
  the steps. The server URL lives in one config entry (`server/README.md` plus a game setting), so it can change.
- Host = create a room on that server and get a short room code; Join = enter the code. Game state relays through the
  server (it's already authoritative), so no port forwarding is needed.
- Voice: WebRTC peer-to-peer with public STUN, signaled through the server; if P2P fails (strict NAT), fall back to sending
  Opus voice frames through the server WebSocket. A TURN server is optional later.
- Use TLS (`wss://`), keep a room cap (e.g. 8 players), and add simple rate limits on the server.

## Phase E: the bigger systems (split between both accounts, see the schedule)
- E1 **Police AI v2** (this account): dispatch by wanted level, units that search the last known position, line of sight
  and sound, roadblocks at 3+ stars, helicopter at 4+, tactical response at 5, escape by breaking line of sight, and a cooldown.
  Builds on `src/gameplay/police/**` and CONVENTIONS 4a. Missions call into it.
- E2 **Smart NPCs** (friend): daily schedules (home, work, beach, nightlife by hour), reactions (flee, cower, call the
  police, film, fight back by personality), short memory of the player (you robbed them, they recognize you), and group
  behavior. Builds on `src/npc/**` and `src/gameplay/wantedSense.js`.
- E3 **Stores** (friend): one store system (enter, browse, buy, sell) for guns, clothes, **shoes**, food, car mods. Data-driven
  stock and prices on `src/systems/economy.js`, `inventory.js`, `items.js`; interiors from `src/world/interiors/**`. C1
  (Weapon Purchase) uses the gun store.
- E4 **Many small missions** (both, after A–C). **User decision (Nov 19): no big bank or casino heist; drop it.** Instead a
  steady stream of short, varied missions (deliveries, repo jobs, chases, boat runs, collections, escorts, races, odd jobs
  for locals), each one brief on the story framework, giving money, unlocks and new contacts.

## Schedule: a few days, both accounts in parallel
Agents per account: at most 4–5 at once (more starved CPU and browser slots). Each account works on its own branch and
merges through PRs, so two people never edit the same files at the same time.

| Day | This account (main session + agents) | Friend's account |
|---|---|---|
| Today (Nov 19) | Finish the polish pass, run the Prettier reformat, push `main`. Then **Phase A** (story framework + new main menu). | Pull `main` after the push. Start **D** (multiplayer + voice) and **E3** (stores) as two sessions. |
| Day 2 (Nov 20) | Push A. **Phase B** intro missions B1–B3 (First Job, Ocean Smuggling, Swamp Rescue), in parallel agents, one per mission. **E1** police AI v2 as one agent. | **C1–C3** optional missions (on Phase A, one session each). Continue D. **E2** smart NPCs. |
| Day 3 (Nov 21) | **B4–B5** (Seaplane Escape, Free Roam Unlock), full playthrough fixes, merge friend PRs, build, bench, push. | Finish D (deploy the server, two-machine test), C and E2/E3 fixes, PRs. |
| Day 4+ | Playtest-driven fixes; start E4 (more missions, the heist). | E4 missions from briefs. |

Integration rules: `main` must always build and boot. Before each merge, run the boot check (`npx vite build` then start
the app). PRs list what was verified in the game.

## Budget (realistic)
- This account: 25% of the week used, resets Nov 26. Phase A about 10%, Phase B about 25%, E1 about 8%, merges and fixes about
  12%. That leaves about 20% for playtest fixes after the video.
- Friend's account: D, C, E2, E3, about 4–6 sessions over three days; each session gets one brief below.

## Hand-off brief: Phase D (paste into the friend's Claude Code)
"Southline repo (GitHub silasedel/gta-v2), branch from `main` as `mp-voice`. Read `docs/v2/CONVENTIONS.md` (code style
section 0) and `docs/v2/plan/STORY_START_PLAN.md` Phase D. A multiplayer server and client already exist (`server/`,
`src/net/`; read their headers): extend them, don't rewrite them. Build D1–D3: a Host or Join menu, spawn into the world, synced
movement and vehicles and interactions, and WebRTC proximity voice with distance falloff, mute and volume. Play is OVER THE INTERNET: deploy the existing server to a free cloud host (Fly.io, Render or Railway) with wss, use room codes for host and join, voice P2P with STUN and fall back to relaying voice through the server (see Phase D "Decided"). Prepare the deploy config and write step-by-step instructions for the human to create the hosting account and deploy. Test with two app
windows on one Mac (`npm run server` plus two clients). Keep frame cost near zero when not in a session. Commit often,
readable code, push the branch and open a PR to `main`."

## Hand-off brief: Phase C (after Phase A is on `main`)
"Southline repo, branch `missions-c` from `main`. Read `docs/v2/CONVENTIONS.md`, `docs/v2/plan/STORY_START_PLAN.md` Phase
C, and the story framework in `src/story/**` (how a mission is defined, see the intro missions as examples). Build C1–C3
as independent optional missions with map markers, autosave and correct skip flags. Reuse stores, combat, chase AI,
boats, diving. Push the branch and open a PR."

## Hand-off brief: E2 smart NPCs (friend; can start now)
"Southline repo (GitHub silasedel/gta-v2), branch `npc-smart` from `main`. Read `docs/v2/CONVENTIONS.md` (section 0 code
style, 4b people) and `docs/v2/plan/STORY_START_PLAN.md` E2. Make pedestrians feel alive: daily schedules by hour and district,
reactions by personality (flee, cower, call the police, film with the phone, fight back), short memory of the player, and groups
that walk and talk together. Extend `src/npc/**`; don't rewrite the crowd renderer. Hold the frame budget (no more than
~1 ms extra downtown); think at low rates and only near the player. Commit often, push the branch, open a PR."

## Hand-off brief: E3 stores (friend; can start now)
"Southline repo, branch `stores` from `main`. Read `docs/v2/CONVENTIONS.md` and `docs/v2/plan/STORY_START_PLAN.md` E3. Build
one store system: walk in, browse a clean store UI, buy and sell, with data-driven stock and prices for guns and ammo, clothes
(hook into the wardrobe), **a shoe store (user request, Nov 19)**, food and drinks, and car mods. Use `src/systems/{economy,inventory,items,money}.js` and existing
interiors in `src/world/interiors/**`. Expose `game.stores.open(id)` and events so missions (the Weapon Purchase mission) can
use them. Commit often, push the branch, open a PR."

---

## The user's spec (verbatim summary)
1. Main menu: simple start options; spawn at the house; play with others (proximity chat); restart; a main Play that
   starts the introduction.
2. Opening Scene, First Job: phone call from the criminal employer, meet at the marina, get in the vehicle; drive by
   waypoint; meet two associates; interact.
3. Ocean Smuggling: briefing; motorboat; follow the aircraft; collect floating packages; radio call: associate captured;
   head to the swamp.
4. Swamp Rescue: dock; enter the swamp; armed enemies; reach the shack; free him; more enemies; run to the seaplane.
5. Seaplane Escape: enter, start, take off from the water, fly to the marina, land, taxi, exit; cutscene: paid, go home;
   drive home; enter the house.
6. Free Roam Unlock: arrival cutscene; phone call (more work); notice; unrestricted control; mission markers; start
   missions any time.
7. Optional missions: Weapon Purchase, Collecting Money, Diving Job (any order).
8. Skip button on every cutscene; from Play the intro missions can't be skipped, but Free Roam exists; restart; autosave
   after each mission; Continue at the right stage; skipping updates objectives, unlocks and flags correctly.
9. Multiplayer: a separate menu button; host or join; spawn into the world; sync movement, vehicles, interactions; proximity
   voice with distance falloff; mic mute and voice volume.
