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
