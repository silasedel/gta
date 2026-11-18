# Next, after the weekly reset (Nov 19)

1. **Keys map:** the new layout matches the user's map but is turned off.
   - It's built as `public/assets/miami/b20261118-091900` and committed.
   - It causes an intermittent Rapier panic near the Keys: "recursive use of an object", most likely after an earlier swallowed panic in a castRay or collider build on new geometry.
   - Find the bad collider: wrap World.castRay / createCollider to log the first exception with a JS stack, or bisect by region.
   - Then publish with `tools/v2/map3/publish.sh`, and re-place Nico's yard (DRIVE / LITTER / PLANTING) on the new lot. The lot: origin (-1007.69, 5174.40), heading 0.4239.
   - The shop-type reshuffle on 145 mainland storefronts is cosmetic, but fixing it would be nice.
2. **Nico's house round 4** (`docs/v2/plan/nico_house/r4/`, mock-ups 01-10, `?nh=r3` = old):
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
