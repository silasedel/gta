# Clipping sweep (static world placement)

Audit: `node tools/v2/clipaudit.mjs --set before --q clipfix=0` / `--set after` (page side: `tools/v2/clipaudit.page.js`).
Spots: Downtown, Little Havana, South Beach, Keys bar, 2 causeways, 2 north-land towns, under the US-1 / SR 970 ramps (r = 150 m).
`?clipfix=0` switches every fix off for before/after comparisons.

| category | before | after |
|---|---|---|
| prop x prop overlap (incl. pole in crown, doubled poles) | 116 | 5 |
| prop through building | 29 | 15 |
| prop on carriageway / deck | 2 | 0 |
| floating / sunk base (> 5 cm) | 68 | 52 |
| z-fight cells (same depth bias, < 2 cm, different color) | 1242 | 276 |
| floating decals, broken barricades, flapping statics | 0 | 0 |

Reports: `docs/v2/reports/clipaudit-before.json`, `clipaudit-after.json` (ranked by source).
Shots: `docs/v2/shots/clipping/before_1..5.png`, `after_1..5.png`, `break_fence_0_before.png`, `break_fence_1.png`.

Fixes:
- `src/world/ground/occupancy.js` (new): shared footprint index (trunks, poles, crowns, spacing rules).
- `src/world/miami/tilebuild.js`: `resolveClips` (every tile prop checks the index; slides along the curb or drops), crown/pole and
  pole-spacing rules, walls, slab-top ground snap, causeway guardrails continuous across tile seams, sliver fill under the land
  polygons, per-building string-course heights, X1 breakable bins / hydrants / sign posts.
- `src/world/dressing/dressing.v2.js`: spawn-street poles and planting use the index; fences, mailboxes, wheelie bins breakable.
- `src/world/miami/breakables.js` (new): X1 breakable props (own box collider, break above 15 km/h, debris, crunch, damage, slowdown).

Remaining (other owners): house/town LOD layers drawn together (houses), facade cornice overlaps (city-look), sabal fields from
house yards inside map footprints (houses), elevated barrier lumps on ground streets under the ramps (highways), house-generator
fences are solid but not breakable (merged per cluster). The Nico-house spot never streams in the audit browser (always 0 items).

## Pass 2 (houses / city-look leftovers, ramps)

| category | pass 1 | pass 2 |
|---|---|---|
| prop x prop overlap | 5 | 5 |
| prop through building | 15 | 13 (MacArthur 2 -> 0; Little Havana 4 sabal left) |
| floating / sunk base | 52 | 47 |
| z-fight cells | 276 | 123 |

- Houses: the lot-hide mask held 4,095 ids; later lots got id 0 and their merged copy was never hidden under the near build.
  The mask is now 128 x 128, a lot without an id never gets a near build, and the audit skips masked lots.
- House yard trees and palms: dropped inside map building footprints and registered in the occupancy index (`houses.v2.js`).
- Every vegetation field: trees and palms are kept 0.7 m clear of map building footprints (`vegetation.v2.js`, `occupancy.inMapBuilding`).
- Sand-on-sand: beach exit aprons sit 2 cm under the sand areas instead of 2 mm.
- Ramps: jersey barriers only where the deck clears the ground beside it by more than 0.6 m, no orphan stubs under 8 m
  (`elevated/network.js`). Shots: `pass2_before_ramp.png`, `pass2_after_ramp.png`.
- Ground: off-slab props at curb height drop to the ground only where the slab visibly ends next to them (away from tile seams).
Left: 4 sabal in Little Havana (a field that skips the clearance), town undersides and trims at about 0.3 m, houses shingle-on-wood,
causeway verge props over a missing ground collider (North Venetian, 12).
