# Friend's brief: graphics, map and bug polish (long run, use the whole usage)

Read `READ_ME_FIRST.md` first (mission, permissions, "leave about 5% unused", tell the user which model and effort to use as the work changes), then `docs/v2/plan/PLAN_NOV18.md`, then this file. You own `src/world/**`, `src/render/**`, `src/vehicles/**`, `tools/v2/map3/**`, `public/assets/**`, Nico's house and `desktop/**`. Do not edit `src/gameplay/**`, `src/npc/**`, `src/player/**` or `src/story/**` (the lead and another helper work there). Run the game, take screenshots, look at them yourself, fix, repeat. The bar: GTA 6 footage, smooth, crisp, 60 fps locked on an ordinary computer.

## Order of work (do each fully, test in the running app, then move on)
**1. Graphics, everywhere (highest priority).** Compare spawn with downtown, Overtown, Liberty City, the beach strip, the port, the Everglades, a highway at night.
- Downtown and dense districts look flat: flat brick, dark plazas, camera clipping into roofs and overhangs. Fix the camera against roofs and add real facade depth, trim, signs, lit windows, awnings, AC units, fire escapes, dirt and wear. Use the user's building models for ground floors (swap the low-resolution ground-floor textures for crisp ones).
- Textures need more resolution and crispness while staying smooth. Grainy or shimmering shadows (house fence rails shimmer). Barrier materials mottled in shade. Plants that look low-res and layered: proper foliage cards or geometry, no dotted dither (alpha to coverage and TAA).
- Keep the Keys spawn exactly as good as it is; do not regress it.
**2. Nico's house and yard.**
- Match mock-ups 01-10 in `docs/v2/plan/nico_house/r4/`. Stairs run from the deck corner with the satellite dish down toward the hoop; remove stray wood below the deck; the back side per mock-up 08; interior too dark with a red floor; the boat is too big (needs a skiff).
- Spawn yard: feet sink into the ground; sand color flips green/purple; black stripe across the ground; flat red plant; stray square of water in the yard (carved cove polygon); round the shoreline corners. Re-lay the yard props through `game.placement`; clear dirt/shell driveway out to Pelican Point Ln.
**3. Map and roads.** Road and sand edges everywhere (use the good verge treatment on all roads, including Keys side streets); rocks on roads; palms with floating roots (one ground-snap service); stop-sign plates off their posts (fix the street kit and `regulatory.v2.js`); a sign in the middle of a road; parked cars in narrow lanes; markings through some junctions; road connections must match the map.
**4. Keys bridge.** One continuous elevated Overseas Highway bridge (concrete deck, 3-4 column bents, solid parapets, no water on the deck or between the twin bridges); mangrove islets, moored sailboats, channel markers.
**5. Cars and models.** Tires with open sidewalls (audit every wheel); stray triangles on the G-wagon (suv1); doors that open (split doors in the car pipeline); wheel fits on super4, van1, truck5; suv5 conversion error; per-area variety ring so two of the same model do not sit together. Import every new model in `Models/` that the user added (see `docs/v2/reports/library-audit-r4.md` and `docs/v2/plan/nico_house/r4/MISSING_MODELS.md`), including the rough-district abandoned/rusty pieces.
**6. Physics-visual systems.** Thin wire fences use the chain-link model and break or bend instead of stopping a car dead; bushes squash and spring back under cars; foliage bends; swept car-vs-people hit test; ragdoll joint limits.
**7. Performance (60 fps).** The game is CPU-bound in busy places (tile building, GC, people skinning, draw calls). Typed-array tile batches, worker offload, instancing and merging; fewer draw calls at spawn (target at or above 60 on the test machine). Measure before and after and keep a table.
**8. Planes.** Make the airliners flyable; the jet in game; landing rollout; aircraft audio; gates on internal service roads. (The lead handles who can steal planes and the airport response.)
**9. Release hygiene.** Restore hot reload if it was disabled, rebuild the Mac app and the website build at the end, run `?rapierguard=1` and the 5-minute drive test and report the numbers.

## Rules
- Branch or folder: work in your copy; hand back the whole project folder (same layout, without `node_modules`), plus `docs/v2/briefs/STATUS_friend.md` (what is done, what is not, fps table, screenshots) and `docs/v2/briefs/MODEL_REQUESTS_friend.md`.
- Add small notes for the lead in `docs/v2/briefs/REQUESTS.md` if you need a change in files you do not own.
- Everything tested in the running app. No new slop (floating, clipping, sliding, z-fighting, see-through walls).
