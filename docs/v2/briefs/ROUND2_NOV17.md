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

## Rules (unchanged from OVERNIGHT_NOV17.md, all still apply)
- **Looks first.** No load freezes, and the frame rate should not get worse. Compare A/B in one session.
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
r2-veg a8e0bf9ad31560854 | r2-keys ab80b88b7a3e7c376 | r2-roads ac999d622142a4c0c | r2-mapui ac7df24216768453d | lead = "main"
