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
Open question for the user: over-the-internet play needs either port forwarding on the host or a relay or signaling server
on the internet. LAN and direct-IP work without one.

## Phase E: the bigger systems (later, in pieces, both accounts)
New police system and AI, smart NPCs (schedules, reactions, memory), stores (buy and sell UI), more missions and the casino heist
(BIG_UPDATE_PLAN.md sections 6–7, 14). Each becomes its own brief once A–C are in.

## Budget and order (realistic)
- This account (~75% of the weekly limit left, resets Nov 26): finish the current polish pass, then the Prettier reformat and push, then
  Phase A (about 10–15% of the week), then Phase B (about 20–30%). Keep about 15% for fixes from playtests.
- Friend's account: Phase D now (no dependency), then Phase C once Phase A is pushed. Hand-off briefs are below; paste one
  per session. Pull `main` first, work on a branch, push the branch, open a PR.
- At most 4–5 agents at once on this machine (more starved the browser slots and the CPU this morning).

## Hand-off brief: Phase D (paste into the friend's Claude Code)
"Southline repo (GitHub silasedel/gta-v2), branch from `main` as `mp-voice`. Read `docs/v2/CONVENTIONS.md` (code style
section 0) and `docs/v2/plan/STORY_START_PLAN.md` Phase D. A multiplayer server and client already exist (`server/`,
`src/net/`; read their headers): extend them, don't rewrite them. Build D1–D3: a Host or Join menu, spawn into the world, synced
movement and vehicles and interactions, and WebRTC proximity voice with distance falloff, mute and volume. Test with two app
windows on one Mac (`npm run server` plus two clients). Keep frame cost near zero when not in a session. Commit often,
readable code, push the branch and open a PR to `main`."

## Hand-off brief: Phase C (after Phase A is on `main`)
"Southline repo, branch `missions-c` from `main`. Read `docs/v2/CONVENTIONS.md`, `docs/v2/plan/STORY_START_PLAN.md` Phase
C, and the story framework in `src/story/**` (how a mission is defined, see the intro missions as examples). Build C1–C3
as independent optional missions with map markers, autosave and correct skip flags. Reuse stores, combat, chase AI,
boats, diving. Push the branch and open a PR."

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
