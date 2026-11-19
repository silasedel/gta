# READ THIS FIRST: you are helping build Southline

The user is handing you this folder. It contains everything for the game: the code, the plans, the briefs, all downloaded models (`Models/`), the user's reference photos (`references/user_references/`), sound effects and music (`public/assets/audio/`). The user will also tell you **which stage you are** (1, 2, 3 or 4). Your full job description is in `docs/v2/briefs/STAGE_<your number>_*.md`. Read this file completely, then that brief, then start working.

## The situation
Southline is an original open-world crime game for the web and Mac (Vite, three.js, Rapier), set in a real-scale Miami-style city plus an island, built to the user's own road map. The user is a YouTuber making a video series about getting AI to build a GTA-style game. The first attempts looked bad (grain, pixelation, flat "slop"), and the user is very unhappy with anything that looks cheap. The work is being done as a **relay of four stages on four different accounts, one after another**. Each stage gets the folder exactly as the previous stage left it, does its own exact job, and hands back a better game. The accounts belong to the user's family and friends, who lent their weekly usage. Do not waste it.

## Folder map
- `READ_ME_FIRST.md` (this file) and `HANDOFF_ORDER.md` (the relay order the user follows).
- `docs/v2/briefs/STAGE_1..4_*.md`: your job description. `docs/v2/plan/BIG_UPDATE_PLAN.md`: the master plan (sections 12 to 14 and the user's final answers in section 13 win over older text). `docs/v2/CONVENTIONS.md`: how the systems connect (stage 1 writes it; every stage keeps it current).
- `docs/v2/plan/*.webp`: the road map, color map, HUD target, Nico's house photos (`nico_house/`).
- `Models/`: about 350 downloaded models in category folders, `Models/catalog.csv` (names, licenses) and `Models/README.txt`; `Models/NPCs/` holds the generated people.
- `references/user_references/`: the user's reference images (locations, Nico, NPC source photos, slot machines). `references/playtest_1114/BUGS.md`: the known bug list.
- `public/assets/`: the game's own assets, including `audio/music/` (club songs) and `audio/sfx/southline_death.mp3`.
- `src/`: the game; `tools/`: build and measurement scripts; `desktop/`: the Mac app.
- Old files (`V2_PLAN.md`, `OVERNIGHT.md`, `CONTRACT*.md`, `BIG_UPDATE.md`, `README.md`, `docs/v2/plan/EXECUTION_PLAN.md`) are history. If they conflict with this file or your stage brief, this file and your brief win.
- Some small uncommitted edits from earlier sessions exist (`git status`). Look at them with `git diff`; keep what works, fix or drop what does not. The dot-files in `src/render/` are old look-test helpers; you may delete them.

## What you are here to do
Do your stage's jobs, in order, to the best of your ability, to a **professional, shippable standard**. You are trusted to do this alone:
- **You have full permission to make every decision yourself.** Do not stop to ask the user questions that the code, the plans or the references already answer. If something is unclear, decide the way a senior game developer would, pick the more GTA-like option, write a short note in your STATUS file, and move on.
- **You may edit, add, rename, replace or delete anything inside this folder** (except the contents of `Models/`, which you only add to or read from, and the user's files in `references/`). Rebuild a system if the existing one is bad and your job covers it. Delete slop. The only hard limits: stay inside this folder, never publish or push anything to the internet, never enter credentials, and never use files marked "personal use only" in `Models/catalog.csv`.
- **Be hardworking and thorough.** Do not stop at "it basically works". Look at your own work in the real running app, find what is ugly, broken or slow, and fix it. Repeat until you would be proud to film it.

## Use your whole budget, wisely
- Your stage brief gives your budget (a share of the account's weekly usage). **Use all of it**, but pace it: spend it across your job list according to the budgets in the brief, do not burn it on the first job, and keep the last jobs funded.
- **Always leave about 5% of the account's weekly usage unused** (a few percent). Never go beyond that. Check the usage display regularly. If you are close to the limit, stop starting new things, finish and verify what exists, write the hand-back, and report.
- Use the strongest model for design and hard problems and cheaper ones for mechanical work. Run heavy commands in the background. Do not repeat work or re-read huge files for no reason.
- Measure before and after. Take screenshots after every big step and look at them yourself.

## Tell the user which model and effort to use (all through your stage)
The user can change your model and effort setting at any time, and you cannot. So **you decide what is best and tell them**:
- At the very start, after reading your brief, tell the user in one or two lines which model and effort you want for your first job, and why.
- Every time the kind of work changes, before you start it, say whether to keep or change the setting. Examples: switch to the strongest model and high effort for a hard rendering bug, a new system design or a stuck problem; switch to a cheaper model and lower effort for mechanical work such as renaming files, importing many models with a script, running tests, or writing repetitive code.
- Weigh both sides every time: **cost** (output tokens cost far more than input tokens, and higher effort and stronger models use the budget faster) against **capability** (a harder problem done wrongly costs more in retries than doing it once with the strongest setting). Never recommend the most expensive setting by default. Never recommend a cheap one for work where a mistake would be expensive to undo.
- Keep it short: one line like "Next: balance the shadow cascades. Switch to the strongest model, high effort (hard, subtle problem)." The user will change the setting and say "done". If they do not change it, carry on with what you have and do not ask again.
- Also tell the user once, early, how fast the usage meter is moving relative to your budget, and warn them if the pace means you will run out before your job list is done.

## Using downloaded models (the user's rule)
Never just drop a model in. Treat every download like a starting point you model from: resize, cut up, warp, combine parts from several models, retexture, recolor (e.g. darker wood), add wear and dirt, paint your own fabric prints, and erase real brand labels and paint a made-up name over them (do not reject a pack because of labels: fix the labels). If a model is the right style but too new, age it. If no model exists (string lights, ceiling fans, special lamps), build it well yourself. Common junk (oil drums, steel drums, crates) is easy for the user to get in bulk: just ask.

## The goal: as close to GTA as we can get
We are not making "a crime game". We are making the closest thing to a **GTA 5 / GTA 6 style game** that we legally and technically can. Broadly copy everything about how GTA feels and plays; do not copy its names, logos, characters, story, music, maps or any of its actual assets (use made-up brands, original characters and the given models). When a decision is open, ask: "What does GTA do here?" and do that, in your own original wording and art.
Match, as closely as is possible:
- **Open world feel:** a living city you can explore on foot and by vehicle with no loading, districts with different looks (downtown, beach, ghetto, suburbs, port, airport, swamp, countryside), ambient life everywhere.
- **Moment to moment play:** third-person camera close to the character (GTA 6 distance), sprint/jump/climb/vault, cover-based shooting with lock-on and a weapon wheel, punches and melee, car jacking, vehicle entry/exit animations, ragdoll, hitboxes, car damage, burning wrecks.
- **Vehicles:** realistic but forgiving handling, radio in every car with stations and a station name on screen, horns, sirens, motorcycles, boats, helicopters, planes.
- **The wanted system exactly as GTA V does it** (stars, search radius, line of sight, cops lose you, flashing stars, busted/wasted screens), with a harder sixth star.
- **Interface:** the minimap with blips and GPS route to a waypoint, the exact corner HUD in `docs/v2/plan/hud_corner_target.webp`, the pause map, subtitles, mission-passed screens, money counter, contextual button prompts.
- **Missions and heists:** mission markers, cutscene-style dialogue, objectives, checkpoints, payouts, retry on fail; one prep-and-finale heist like GTA V; short jobs and street events like its side content.
- **World systems:** day/night cycle, weather, traffic that obeys lights, crowds with roles, shops and interiors you walk into, ATMs and stores, news and radio chatter, phone-style flavor where cheap.
- **Polish:** photoreal with a game finish, smooth edges, no grain or dot patterns, locked 1080p and **60 fps on an ordinary computer**. Graphics are the last thing to cut.
If a feature in this list is not in your job list, you may add small GTA-like touches that cost little if you have budget left after your jobs pass their tests. Never skip a required job to add an extra.

## Standards (apply to everything)
- American spelling. Made-up brands only. Only free-for-game assets.
- Everything ships in the real game: no placeholder-looking final results, no floating or clipping objects, no sliding feet, no see-through walls, no z-fighting, no pop-in you can see.
- Every change is tested in the running app. If you cannot run it, you are not done.
- Keep the code organized: modules load automatically via `import.meta.glob('./**/*.v2.js')` exporting `initV2(game)` and `order`.
- Keep `docs/v2/CONVENTIONS.md` correct for the next stage. Write `docs/v2/briefs/STATUS_stage<N>.md` as you go and `docs/v2/briefs/MODEL_REQUESTS_stage<N>.md` for models you need.

## Models
You cannot download models. If one is missing, use a code placeholder and add it to your model request file with name, use, size and search words. The user downloads big or common ones from a free asset site and makes custom unique small ones (a slot machine, a vault door) with an AI model tool. Big, smooth, polished things (buildings, vehicles) come from downloads, never from AI generation.

## Handing back
When your jobs pass their tests, or your budget (minus the last 5%) is nearly spent, give the user the whole folder back as a zip in exactly the same layout (without `node_modules`), with your status and model request files and your best screenshots inside it. Tell the user plainly what is done, what is not, and what looks wrong.

Now read your stage brief and start. Your first action: run the app, take a screenshot of the current state, and look at it.
