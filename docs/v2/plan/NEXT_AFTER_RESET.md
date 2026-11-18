# Next, after the weekly reset (Nov 19)

1. **Keys map:** DONE. The new layout is live (b20261118-091900). The freeze was impacts.js touching freed car bodies (fixed in aea0be8b). `?rapierguard=1` logs the first Rapier error with its stack. To do: re-place Nico's yard props (DRIVE / LITTER / PLANTING in yard.data.js) on the new lot, since the old ones still show near the hoop side, and fix the shop-type reshuffle on 145 storefronts.
2. **Nico's house round 4** (orientation, wraparound deck, side stairs with landings, hoop and dock props fixed; sheet docs/v2/shots/nico_r4/sheet_before_after_r4h10.jpg) (`docs/v2/plan/nico_house/r4/`, mock-ups 01-10, `?nh=r3` = old):
   - **Interior:** never seen in game. Fix the camera spots and verify 04-07 and 09.
   - **Exterior:** much closer to the mock-ups in detail, materials, vines and atmosphere. The satellite dish looks like it floats in the side view. Do a TAA shimmer pass. Use a real skiff (missing model). Colliders for the late-loading dock chairs and ladder. Light shafts.
3. **Keys look:**
   - bridge bents (3-4 columns plus a cap beam), solid parapets, poles and wires, green signs (render 1)
   - mangrove islets, moored sailboats, channel markers
4. **Planes:**
   - make the airliners flyable
   - fly the jet in game
   - landing rollout, aircraft audio
   - fence gates on internal service roads
5. **Texture compression:** KTX2 needs KTX-Software (the macOS .pkg needs the user's admin password). The website sits at 977 MiB after WebP.
6. **Barriers:** still mottled in shade (flatten the scan's roughness on barrier faces).
7. **Smaller items:**
   - foot-sliding feedback (`?r4gaitfb=1`), unverified
   - doors that open on cars (needs doors split out in the car pipeline)
   - super4 / van1 / truck5 wheel fits
   - suv5 conversion error
8. **Models to download:** `docs/v2/reports/library-audit-r4.md` and `docs/v2/plan/nico_house/r4/MISSING_MODELS.md`.

9. **House look still off:** the boat is oversized (needs a skiff model). The interior is too dark and the floor reads red. Sky saturation, sun strength and the clear Caribbean water at the house all need a render / water pass toward the mock-ups' soft cinematic look.
