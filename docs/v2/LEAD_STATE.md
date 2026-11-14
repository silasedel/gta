# Lead state (kept current so the lead can resume after a model switch or context compaction)

Updated: Nov 13, 6:00 PM MST. Read with `V2_PLAN.md` ("Schedule and budget"), `CONTRACT5.md`, `docs/v2/progress/*.json`, `docs/v2/reports/*.md`.

## Budget
- Weekly usage 6:00 PM: 57% all models, 60% Fable (user's reading). Stop at about 82% all models. The user will not buy more.
- Rough cost seen: 20 Fable high-effort agents ≈ 1 point (all models) every 2–3 minutes; one agent run of ~450k tokens ≈ 0.6 points.
- Lead turns are expensive (huge context): keep replies short, few tool calls, no screenshot unless it is worth showing the user.
- Deadline: v2.0.0 by 11 AM MST Nov 14. The rest goes to v2.1 after the weekly reset (Nov 18, 7 PM MST).

## Agents (IDs for SendMessage resume)
Still running or resumed on Fable (hard stops in brackets):
- world-osm a006539a996900b79 [7:00 PM] merge of tools/world/out/features.json into the tile set; one re-runnable command in tools/osm/README.md
- world-layout aa7d6857ae7fa3d76 [6:25 PM] third pass: closer arrangement to the user's concept, crisp map style, setpieces.keys_bar
- city-look a384b8d34dbd1495d [6:30 PM] PBR everywhere, facade variety; needs: skip `glassFront` when `sf.v2Facade` is set (interiors-engine request)
- design-system adf5305be17e06ad9 [6:30 PM] brands/logos/products/materials; note: hero-cars saw a Vite error from src/design/products/index.js mid-build; adopt marques Vireo, Vauclair, Merrow and tire brand Garrano
- interiors-engine a3cfc5fa611da48d2 [6:35 PM] "de-slop" pass: light contrast, wear, human element
- nico-house a7a338f5385c2e604 [7:30 PM] match references/ref_36_nico_house_user_design.webp exactly (the user's own design)
- keys-sign aad9f5f3be8fa966b [6:30 PM]
- character a4a7b345dea14a7b7 [6:30 PM]
- keys-bar a5bac553f75291b48 [6:55 PM] original Keys bar set piece
Finished: boats ab2a7c5da7a076f6c (4 center consoles + steering in game; MODEL_BRIEF.txt for the rest; user: "really good, a tad more detail"), hero-cars a00e4129fff8ed709 (1 of 5, body shape short of the bar).
Paused with handoffs (not wired into the game): vehicles-core acdaa79ae955fc7b9, npc-ai ae796cb30be311e75, police a8cee2fa809f4177a, ui-frontend a8c97d9e9b62e327d, core-systems accef007527792793, nav-gps a794d732163e6028f, wildlife adf173d8756047242, aircraft a9dbc9d0d082d44c3, yachts a2ccb56332e8bbbd4, combat aac77c76344ea0822.
Never launched: story-jobs, audio, environment, multiplayer, desktop (v2.1).

## Next steps for the lead
1. When the Fable agents stop: usage check, boot the game on 5200, fix integration breaks, production build, commit, `git push origin v2`.
2. Opus 5.5 agents (Agent tool `model: "opus"`), 3–5 at a time, usage check between batches, each continuing from a handoff: (a) world render of new region kinds in src/world/miami (city-look files) once the merged data is live; (b) vehicles-core: wire the new car bodies, uniqueness, driver personalities; (c) npc-ai: wire the unique-people generator and personalities; (d) police: evidence HUD; (e) ui-frontend: pause map + menu; (f) core-systems: save/clock wiring; (g) wildlife: gators, pelicans, dolphins; (h) more store types on the interiors engine using src/design brands; (i) nav-gps wiring.
3. Inspection pass, fixes, CHANGELOG, version 2.0.0, push `v2`. Final report: what is in, evidence, and everything from BIG_UPDATE.md that is not.

## Standing decisions
- No exact copies of ref_15–ref_35 (they contain another game's places and names). ref_36 is the user's own house design: match it exactly.
- Map: follow the user's concept arrangement and printed-map style; own coastline; real Miami stays the v1 rectangle.
- User feedback to apply everywhere: far more micro-detail (invented brand logos, decals, labels, hardware), wear, imperfection, atmosphere; nothing flat or "AI game slop".
- Game name: user wants a GTA-sounding name; nothing chosen (keep title strings in one constant).
- Tracker: `node tools/v2/tracker-snapshot.mjs 6` then publish_files to slug 58c78707-885c-498b-b557-54dafad71427 (base_version from the last publish; last was 1794616610-cc6a).
- An empty duplicate artifact (slug 501d327a-db16-476f-9634-7769d22f06e7) exists; delete only if the user asks.

## Update 6:08 PM
- Usage 59% all / 63% Fable. Finished since: world-osm (merged world live; `tools/osm/.venv/bin/python tools/osm/merge.py` rebuilds in 32 s), world-layout (3 passes; map v3 merged), city-look, keys-sign, interiors-engine (+ wear pass), boats, hero-cars.
- Still on Fable: design-system adf5305be17e06ad9, nico-house a7a338f5385c2e604, character a4a7b345dea14a7b7 (Nico's shirt looked wrong in a 6 PM game screenshot: check), keys-bar a5bac553f75291b48.
- Launched on Opus 5.5 high (budget ~70 tool calls each): world-render a8b2953a2aae6fe42 (owns src/world/miami renderer files now), vehicles-core adff2b7285418dd3e, npc-ai a16a16806cb23eb78.
- Lead to do: move spawn to Nico's house (data.setpieces.nico_house); tell renderer to skip glassFront when sf.v2Facade; drop city-look blade posts (keys-sign places blades); map preview shallow bands look bubbly around islets.
