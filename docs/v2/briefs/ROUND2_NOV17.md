# Round 2, Nov 17 morning: the user's review of the overnight build (read this first)

The user played the 06:30 build at http://127.0.0.1:5201 and said "much better, a lot still to go". Their screenshots are in
`docs/v2/plan/feedback_nov17_am/shot_01..14`. Look at every one of them. The bar is the reference images:
- `docs/v2/plan/nico_house/0_front_deck_mockup.webp` and `1..6`
- `references/ref_55-59`
- the map references `references/ref_37/39/40_map_*`

The user's words, in substance:
"Don't blindly follow the models. Think critically. Edit, tweak, and spend real time on every spot until it truly
looks real. Patch and stitch every seam. Take all the time you need."

## What the user found (each item is a bug class; fix it everywhere, not only in the shot)
1. **Colors and lighting:** too bright and pale. Surfaces don't absorb light (shot_01 truck, shot_03). Albedo is too high,
   so whites blow out, and materials read as flat color layers instead of real light response. Contrast and shading must
   look like the references.
2. **NPCs in cars sit in the wrong place** (shot_02: a woman stuck out through the hood). Rethink seating fully: per-model
   seat anchors and correct poses.
3. **Nico's convertible:**
   - fringing and glitching on its top (shimmer)
   - its shadow is dotted and changes length every other frame (shadow flicker)
   - it reads as flat and too bright
4. **Cars in sand:** slight sinking is fine, but the tires show through. Make the sinkage believable, and make driving in
   sand slightly less responsive.
5. **Waterline:** a hard line (shot_05). It needs a wet darker sand band, see-through shallow water over sand, and
   very subtle waves.
6. **On grass, a square outline follows the car** a few inches out (the grass-under-car mask). It must be invisible.
7. **The white beam in the sky** is the street-race start marker. Make mission/race markers subtle and GTA-like.
8. **The curvy road** (shot_08, State Road 916) is too perfectly sinusoidal and looks generated. Curves must look
   surveyed and natural.
9. **Map water outline** (shot_10): the map is "absolutely perfect" except the hard light-blue water outline. Match the
   user's map reference: almost no outline, a soft shallow-water fade.
10. **Plants, house blinds and window covers look dotted, splotchy and layered,** like thin layered models (shot_11,
    shot_12). They must look thick, smooth and polished: no dither dots, no paper-thin card look.
11. **Curb edge has a sharp triangle** (shot_12). Go everywhere and patch, connect and smooth every seam.
12. **Palm types differ a lot in color** (one brown, one gray and clean; shot_13). Put each type in its fitting area, and
    color-grade them to match the scene so they belong together.
13. **Roads** (shot_14): look good now. Remaining fixes:
    - add manhole covers at realistic US density
    - remove turn arrows in mid-block sections and any marking that isn't realistic
14. **Many cars still need texture work.**
15. **NPCs:**
    - some NPCs still aren't the user's models
    - NPC hands look weird: rig them so they're rounded and relaxed, and react
16. **Nico's house and yard vs the front-deck mock-up:**
    - **House and deck:** rotate the house so the deck and the view match the reference corner; the intersection must sit
      at the right viewpoint.
    - **Truck:** the exact stripe pattern and shades of the mock-up's truck, NOT painted over the windshield, and the
      right orientation.
    - **Placement:** truck, convertible, trash cans and telephone pole in the mock-up's places; trees in their places.
    - **Ground:** slight grass patches and gentle elevation instead of generic flat sand, and a puddle near the end of the
      driveway after rain.
    - **Light:** real lighting and contrast.
17. **Grass and terrain:** still generic. Use the user's grass models, and build a system for subtle natural elevation
    variation (micro-relief) like a human level artist would in Unreal.

## The user's added bar (09:40): ONE hand-made art style
"I want the bar insanely high, same or better than GTA 5... very handmade, polished, purposely perfect and the same
style. Different models have different qualities and textures... go in and manually adjust things so they all fit the
same lighting, resolution, look, smooth vs roughness, so it looks like a real human-made same-style game rather than a
bunch of models downloaded from the internet. Same for placement and for everything you model yourself."
- Every asset you touch gets the same treatment: calibrated albedo and roughness ranges for its material class, a
  consistent texel density (no blurry low-res next to crisp 4K), consistent normal strength, wear and grime level, and
  color grade. Procedural and code-built things must match the library models in quality, not fall below them.
- The r2-art helper (`docs/v2/briefs/ART_STYLE.md`, written as it goes) owns the shared style guide and audit tool;
  follow its ranges.
- **Need a model?** If a model would clearly beat what you can build, add it to `docs/v2/briefs/MODEL_REQUESTS_r2.md`
  (what, where it's used, quantity, style notes). The user will download it.


## Use the user's library first (user, Nov 17 evening)
"Really look through all the models and get a good sense of them all, so you can take advantage of them properly."
Before building ANY prop, furniture, bench, sign, lamp, vehicle, plant or building piece in code, search `Models/catalog.csv` (about 700 rows: name, style, category) and the folder tree under `Models/`. Use the user's model whenever one fits, calibrated to ART_STYLE. Code-built stand-ins only when nothing fits, and then add a row to `MODEL_REQUESTS_r2.md`.

## Rules (unchanged from OVERNIGHT_NOV17.md, all still apply)
- **Looks first.** No load freezes, and the frame rate should not get worse. Compare A/B in one session.
- **SHARED TREE SAFETY:** everyone's test pages load your unsaved work. Any change to a shared or core path (data loading, terrain heights, render pipeline, tilebuild) goes behind a flag that is OFF by default, wrapped in try/catch with a fallback, until you have booted the game with it on yourself (city loads, tiles stream, 0 console errors). Only then switch it on.
- **Commits:** commit ONLY with `git commit -m "..." -- <your files>`, then check `git show --stat HEAD`.
  - Never `git add -A`, stash, restore or checkout others' files.
  - Never `pkill -f`; kill only by PID.
  - `src/world/miami/tilebuild.js` and `docs/v2/briefs/OVERNIGHT_STATUS.md` are committed by the lead only: tell the
    lead "tilebuild ready: <name>" with a one-line description.
- **Testing:**
  - Dev server: http://127.0.0.1:5200. Never start or stop it.
  - Production preview runs at 5201; the lead rebuilds it.
  - Check the page console for errors after every save, because your unfinished code breaks everyone's tests.
  - Test muted, and keep runs short.
- **Brands and models:** American spelling. Invented brands only. Never the 4 "personal use only" rows in
  `Models/catalog.csv`. Never delete anything in `Models/` or `references/`.
- **Status:** write it in a NEW section of `docs/v2/briefs/OVERNIGHT_STATUS.md` named `## r2-<name>`, with screenshot
  paths. Make before/after sheets as JPG q90, next to the user's shot where one exists.
- **Done means:** work until every item you own is done, then do a second critical pass. Look at each shot like the user
  would.

## Helper ids (message each other with SendMessage, `to` = id)
r2-look a619186c4f6cd0a33 | r2-cars ab9f4864289178482 | r2-people ae01728fb19ebc914 | r2-ground a9915981d0baee497 |
r2-veg a8e0bf9ad31560854 | r2-keys ab80b88b7a3e7c376 | r2-roads ac999d622142a4c0c | r2-mapui ac7df24216768453d | r2-art a56f55f70e7c75f0b | lead = "main"

## GTA 6 quality targets (user, 09:20: "look at how good GTA 6's shaders and atmosphere are, make sure ours is good")
Match the QUALITY of these techniques, seen in public analyses of the trailers; copy no GTA content:
- reflections on paint, glass, mirrors and wet asphalt (SSR + probes + Fresnel)
- soft bounce light with deep but never black shade
- humid haze with sun in-scatter, and light shafts through canopies
- full volumetric-looking clouds with cloud shadows
- dark wet roads with rippling reflections
- subtle filmic bloom and flare, never grain
