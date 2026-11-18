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

## User's last playtest (Nov 18 midday), still to fix: a full polish pass, every item checked in game
- **Visuals:**
  - Textures need more resolution and crispness, keeping the smooth look.
  - Shadows are grainy or pixelated in places, and the house fence rails shimmer.
- **Spawn yard:**
  - Nico's feet sink into the ground (yard sheet above the collider).
  - Sand changes color between greenish and purple across the ground sheets.
  - The red plant looks flat.
  - A black stripe runs across the ground.
- **Stop signs:** every street stop sign's plate sits off its post (only the yard ones were fixed, in 55_yard.js); fix the street kit and `regulatory.v2.js`. A street sign stands in the middle of a road.
- **Stairs:** the top of the stairs must land at the main front corner, the one with the satellite dish, seen from the drive. Some rails don't connect to the stairs.
- **Police:** a cop came after the user with no crime committed. Officers' hands twist on their guns.
- **Car entry and hands:**
  - You must stand next to a car's door to get in, and use the passenger door if someone is driving.
  - Nico's hands don't sit on the steering wheel.
- **People:** they slide through car edges when hit (low-speed hits fixed in 33ae7546; check fast hits and the edges).
- **Palms:** roots float a few inches above the ground.
- **Keys overpass:** one stretch of road lies flat on the water where it should be one continuous elevated bridge, and there's water between the bridges on the overpass. Make it one polished, big bridge.
- **Map:** make sure road connections match the map.
- **Done this round:**
  - Dev mode in settings (94e68056).
  - Extra High preset label.
  - Electric cars: no start sound, instant torque (6b0448a5).
  - Parked cars in bushes recycled (0a6698d1).
  - Yard stop signs centered.
- **Plants:** many still look low-res and layered (bushes and trees near Nico's yard): proper LOD0 foliage and denser, higher-resolution leaf cards or real geometry.
- **Map shoreline near Nico's lot:** a stray filled square of water is drawn in the yard (the carved cove polygon); round the shoreline corners slightly.
- **Wire fences:** thin wire fences (posts plus wires, e.g. at the Keys lot by the stop sign) are rigid walls. Fill them with the user's chain-link / wire mesh model and make them break or bend (low energy in breakables) instead of stopping the car dead.
- **Police:** "hit and run" while being chased (likely a ped bumped at low speed after the low-speed hit change): the officer saw it, so this is expected, but check what started the original chase.
- **Stairs (user again):** they should run from the deck corner down toward the middle, next to the basketball hoop. Stray glitched wood pieces sit below the deck. The back side's stairs and room are off: copy mockup 08 exactly.
- **Road and sand edges:** still bad near Nico's. Rocks on the road (yard rocks fixed in this round; check the other lot dressing). Asphalt edge blending into sand.
- **Wanted stars:** the blinking looks weird. Animate like a real open-world HUD: a smooth flash on gain, a pulse while searching, a fade on loss, gentle light-up timing.
- **Overseas Hwy bridge:** where the divided highway meets the single carriageway at the islet (user map screenshot), the bridge dips underwater and drops off. Make it one continuous elevated bridge like render 1: concrete deck, multi-column bents, no water on the deck or between the twin bridges.
- **Fence physics:** the thin wire / map-data fence that stopped the car dead needs the energy-break model (chain / wire low energy) and the mesh fabric from the user's model.
