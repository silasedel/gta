# User playtest, Nov 18 evening (screenshots in this folder)

The user's direction: the lead account makes the MAP and HOUSE "all perfect" now, so the friend's account can spend its week on missions and gameplay. Fix systems, not spots. Look at every result yourself in the running game.

## Nico's house and lot (mock-ups: `docs/v2/plan/nico_house/r4/01..10` + `BRIEF.md`; also `docs/v2/plan/nico_house/0_front_deck_mockup.webp`, `1..6`)
1. Still does not match the mock-ups. Match them from all angles, in detail and atmosphere.
2. The back of the house, to the right of the basketball hoop where the stairs are, is wrong: copy the mock-ups exactly.
3. The carport / shop under the house must extend further out, under the deck and the stairs, reaching out and flattening over, as in the reference.
4. Put the junk and stored stuff back under the house (it had it before).
5. Make the deck boards / tiles / flooring look much better, like the references.
6. A clear dirt / crushed-shell driveway from the truck out to the road, exactly as in the balcony (roof) view mock-up, including the neighbor's fence, the things in the fence and the stones; everything aligned with the mock-ups.
7. Window frames: the inner frame flickers (two surfaces on the same layer, z-fighting) (`01`, `02`).
8. Nico floats a few feet above the dock.
9. Footsteps make water sounds on the dock (it thinks "above water" = in water). Footstep surface must come from what he stands on.
10. The boat in front of the house must be enterable and drivable properly, placed right there at the dock.
11. Remove the tripod the fishing rod is on; the rod lies on the ground / dock.
12. Replace the small ugly pond / lagoon next to the house with a canal-like inlet about 20 ft (6 m) wide running along that side of the house, seawall edged, like a real Keys canal.
13. Looking out from the back deck: a random house and dock sit in the middle of the water, underwater (`03`). The water line at the shore glitches and looks harsh.

## Map-wide (make a system that checks the whole map, then fix)
14. Weird overpasses / bridges all over: audit every elevated road and bridge.
15. Buildings, docks or houses placed in water (sunken), anywhere.
16. Sand: two different sand tones meet with a hard abrupt cut, not blended (`04`, `06`). The normal jagged soft verge is good; some places have extra weird ledges instead (`04`).
17. A hard light line on the road next to a car and a tire (`04`); bright rectangle shapes on the ground.
18. Parked cars in bushes (across the street from the house).
19. The light post has an unrealistic bright edge / reflection (`07`).
20. Lighting snaps darker / brighter instantly (exposure toggling).
21. Still anti-aliasing problems: coplanar edges and borders flicker.
22. Still slow; keep fps in mind (see `docs/v2/plan/PERF_FINDINGS_NOV18.md`).

## People
23. NPC gathering: about 10 NPCs stand clumped together doing nothing, glitching up and down, and they are mismatched (old people, a little girl, a random old man). Real groups are similar people doing something together (friends talking, a family, workers). Fix the gathering system.
