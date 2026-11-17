# Overnight overhaul, Nov 16-17 (read this first, then STAGE1_AGENT_NOTES.md)

The user played the game and rejected the look: "nowhere near GTA 5", "sloppy", "copy and paste", "harsh lines",
"you never use my models". Their screenshots are in `docs/v2/plan/keys_feedback/user_shot_1..6.webp` and the target
look for Nico's street is `docs/v2/plan/nico_house/0_front_deck_mockup.webp` (plus `nico_house/1..6`). LOOK AT THEM.
They wake up at 7:00 and expect every point below fixed, by hand, verified with screenshots.

## What the user saw (each one is a bug to fix, and the same class of bug everywhere else on the map)
1. Potholes and road patches are flat dark rectangles, the wrong color, laid on wrong. They must be real 3D (a dip with
   a broken rim, or a raised sealed patch), follow the road surface orientation, and be COLOR MATCHED to the asphalt
   they sit on (same albedo/gamma/roughness family, only slightly darker/fresher), with soft irregular edges.
2. Road edges glitch through the rock/sand shoulder; the rock/gravel shoulder has a hard straight line against grass.
   Every material transition must blend: irregular cut-out edge pattern (rocks/sand breaking up into the grass), grass
   thinning out toward the edge, height/noise based blending. No straight seams, no z-fighting, no layer poking through
   another (pavement sticking through dirt, green and white polygons poking through a dock, tree-pit squares).
3. Grass/plants grow through the road and through cars. Nothing grows on asphalt, sidewalks, docks or under cars.
4. Things float (mangroves with roots in the air) or sink wrong. Every object sits on the ground: sample the ground at
   its footprint, sink roots/bases a bit, never float.
5. Copy-paste repetition: every trash can and mailbox identical, 5 mailboxes in one cluster, misaligned. EVERY repeated
   asset needs per-instance variation: small scale changes (+-8-15 %), mirror, rotation jitter, slight color/shade
   shifts, texture variants (graffiti removed/moved, stickers, dirt, rust, fading, dents/damage), realistic placement
   logic (one mailbox per house at its driveway, facing the street, aligned; bins at the curb in pairs; etc).
6. Library models not used: palms, mangroves, docks, cars, people, guns. USE THE USER'S MODELS in `Models/` for
   everything they cover (catalog: `Models/catalog.csv`, intake notes `Models/INTAKE_2026-11-16.md`). Convert with
   Blender (`/opt/homebrew/bin/blender -b --python-exit-code 1 ...`, auto-run scripts OFF, never run scripts that
   ship inside downloads). Retexture/blend/fix them so they match the scene (gamma, color, roughness) - never just
   drop them in. Remove real brand names/logos from textures (blank or invented brands).
7. Light props are solid walls. Bins, cones, small signs, chairs, mailboxes, boxes should react: pushable, tip over,
   knocked by cars (Rapier dynamic bodies woken on contact; heavy things stay static).
8. Flicker: "dotted parts of the house glitching and wobbling" - dithered/alpha-hash or z-fighting shimmer. Nothing may
   shimmer or crawl when the camera stands still or moves slowly.
9. Key Largo does not match the mock-up (Nico's lot, the street, docks, mangroves). Docks must be the user's dock
   models, properly sitting on piles in the water, blended into the sand, no stray layers.

## Quality rules for all helpers
- GTA 5 is the minimum everywhere. Compare your screenshots with the mock-up/photos side by side. If a thing looks
  fake, flat, repeated, floating, seamed or flickering, it is not done.
- Hand placement where it matters (Nico's neighborhood, Ocean Drive, Downtown core, docks): explicit coordinates and
  per-object choices in a data file, not just random scatter.
- Close-up AND grazing AND aerial checks, at 11:00 and 18:30, clear weather and after rain.
- UPDATE 00:30 from the user: "don't worry about too much efficiency right now - mainly make sure the graphics look insane,
  polished and accurate; physics and hitboxes along with that." LOOKS COME FIRST: spend GPU/memory on quality where it shows
  (denser grass and shrubs, higher-res textures, more geometry, better LODs farther out). Only hard limits: no load freezes /
  multi-second hitches, and the frame must not drop below ~30 fps at the spawn on this machine. The ground and the shrubs /
  grass must look great ALL OVER THE MAP, not only in Key Largo.
- Performance (secondary now): do not make the game slower without a visible gain. Use instancing (per-instance color/variant attributes), LODs, texture
  atlases, KTX2/WebP at sensible sizes (1-2K, 4K only for heroes). Report draw calls and ms before/after.
- American spelling, invented brands only, never the 4 "personal use only" rows of `Models/catalog.csv`.
- Never delete anything in `Models/` or `references/`; write converted files into `public/assets/...`.
- Tests: headless test pages no longer hot-reload when other helpers save files (tools/v2/browser.mjs). The dev server
  is at http://127.0.0.1:5200 - never start/stop it. The machine is shared by ~9 helpers: keep test runs short, compare
  performance as A/B inside one run, not across runs.
- Never `pkill -f <pattern>` or `killall`: other helpers' jobs match too. Kill only your own processes by PID or full path.
- COMMIT SAFELY (the index is shared by ~10 helpers; stale staged files have reverted other helpers' work tonight): commit ONLY with an explicit pathspec, `git commit -m "..." -- <your files>` (this ignores anything else staged), never a bare `git commit` after `git add`. Never `git add -A`/`git add .`, never `git checkout -- <file>`/`git restore`/`git stash` on files that are not yours. After committing, `git show --stat HEAD` must list only your files.
- Commit often, only your own files (`git add <files>`), message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Write your progress at the top of your own section in `docs/v2/briefs/OVERNIGHT_STATUS.md` (create your section if
  missing; edit only your section) with 2-3 screenshots paths per step. The lead reviews these through the night.
- Work until your whole list is done and verified, then do a second polish pass on your own area. Do not stop early.
