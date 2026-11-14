# world-layout report (Nov 13, 6:32 PM): world traced from the user's official map image

Run: `tools/world/.venv/bin/python tools/world/build.py && tools/world/.venv/bin/python tools/world/audit.py && tools/world/.venv/bin/python tools/world/render.py`
(venv: `python3 -m venv --system-site-packages tools/world/.venv && tools/world/.venv/bin/pip install shapely numpy pillow scipy contourpy`). Build about 90 s, deterministic. The earlier hand-authored generator is kept as `tools/world/build_v2_authored.py` (not used).

## What the build does now
1. `wl/trace.py` classifies every pixel of `references/ref_40_map_user_official.webp` (ocean, shallow turquoise, sand, land, inland water, urban gray, dark forest) and georeferences it with one uniform scale and a translation.
2. **Transform:** `x = -15000 + 20 * px`, `z = -15700 + 20 * py` (20 m per pixel, no rotation, no stretch). World bounds are exactly the image: x -15000 … 5820, z -15700 … 14300. The real Miami rectangle is image pixels x 564.6 … 975.5, y 652.3 … 917.7. Chosen so the image's barrier beach lies on real Miami Beach (east coast continuous) and its downtown falls inside the rectangle.
3. Coast, every islet, the lake, rivers, ponds and swamp channels, beaches, forest and the shallow band are contoured from the classified image (5 m working raster, smoothed) and written to `features.json` (`land`, `water`, `areas`, `shallows`). Within 380 m of the real rectangle the traced coast blends into the real OSM coast; inside the rectangle OSM wins and nothing synthetic is placed (audit: 0 m of synthetic road inside).
4. Main roads were hand-digitized in image pixels (ring highway, two cross roads, the central north–south highway, A1A up the north-east barrier, the Port Calabash causeway and bridge, the Punta Marisol spur, the west and south-west highway, the Overseas Highway down the Keys strip and across the long bridge to the airfield island) and run through the same transform. All 134 real edge roads on land are joined through fringe collectors; the graph is one component.
5. Local streets and lot-by-lot buildings are generated inside the traced gray town outlines; our place names are assigned to the matching spots.
6. `heights.bin`: dark forest in the image = high ground (density of dark-green pixels, tapered at coasts and water, ridged noise), peak 260.0 m at (-7552, -7708); roads are benched in (max terrain road grade 0.067).

## Counts (audit.json)
- 222 land polygons, 203 inland waters, 5738 road edges, 490.4 km ({'trunk': 48.31, 'primary': 27.65, 'secondary': 28.92, 'tertiary': 29.92, 'residential': 334.95, 'service': 22.39}), 73 bridge edges, 9772 buildings, 855 POIs of 88 types.
- Hard failures: none. Joins 134 of 136 real edge roads (two start over water). Max deck grade 0.061.
- Towns (hectares): {'South Shore': 353, 'Coontie': 224, 'Tern Key': 143, 'Port Cassia': 168, 'Port Calabash': 145, 'Punta Marisol': 138, 'West End': 91, 'Sabal Grove': 103, 'Key Paloma': 98, 'Amaro Landing': 88, 'Shellmound': 77, 'Playa Serena': 59, 'Citrus Flats': 50, 'Limpkin Park': 44, 'Tangelo': 28, 'Gumbo Limbo': 25, 'Corkwood': 16, 'Seagrape Heights': 14, 'Buttonwood': 13, 'Sandspur': 12, 'Mullet Creek': 9, 'Honeybell': 9, 'Spoonbill Flats': 9, 'Calamondin': 8, 'Junonia': 7, 'Whelk Harbor': 5, 'Satsuma': 5, 'North Shore': 3}

## Set pieces: old → new (two agents are building these)
| id | old (pass 4) | new | heading | lot |
|---|---|---|---|---|
| nico_house | (236, 4766) | (-2543.73, 9262.68) | 1.0895 | 60 x 60 m, bay side of the upper end of the Keys strip, back edge 8 m from the bay water, dock point in `setpieces[].dock`; no road, water or building inside |
| keys_bar | (-9, 5305) | (-2996.55, 10449.82) | 0.9716 | 40 x 32 m, bay side of the highway mid strip, center 25.5 m from the road centerline; clear |
| keys_sign | (702, 4678) | (-2225.76, 9096.52) | 2.9268 | 6.5 m verge on the inbound (southbound right-hand) side where the highway reaches the strip, 11.5 m from the centerline; clear |
Lot rings are in `features.json.setpieces[].lot` and `layout.json.setpieces`.

## Evidence
- Side by side with the official image at its own size: `docs/v2/compare/world-layout_vs_ref40.png` (git-ignored). Looked at twice: coast, islets, lake, rivers, swamp water, beaches, mountains, Keys strip and the triangular airfield island line up with the image.
- Preview: `docs/v2/shots/world-layout/map.png` (2602 x 3750, flat style, one soft shallow gradient).

## Where the trace and real Miami disagree most
- The image's city is about 5.5 km wide at 20 m per pixel; real Miami in the rectangle is 8.2 km. Along the rectangle's **north edge** the image has city land where the real upper bay is (x about -2000 … 1750), so the real bay ends at a nearly straight shore about 300 m north of the edge. The same happens along the **south edge** (x about -2950 … -300).
- The image's airport (pixels 525–665, 825–945) falls half inside the rectangle, so Solana International sits just west of it at x -5960 … -4060, z 1360 … 2730 (same latitude, about 1.5 km west of the picture).
- The image's bay islands and port inside the rectangle are replaced by the real ones.

## Honest gaps
- Roads were digitized by eye from the image (about ±200 m); only the main roads listed above, not every road in the picture. No motorway carriageways or interchanges in this version: the ring is a four-lane trunk and motorway joins are plain stubs to West Line Avenue.
- Town streets are generated grids, not the picture's street patterns. 760 street edges that did not connect to the main graph were dropped, so some small gray patches have no streets. Tamarind Key (the small mid key) has no buildings.
- Several civic sites did not fit (see `summary.json` log). No farmland, airboat routes, hammocks, underwater caves or wrecks in this version (the authored ones did not transfer); `layout.json` has channels, shallows count, airport approaches, regions and the transform.
- Height is inferred from darkness in the image, so it is plausible relief, not surveyed; it has not been seen in 3D.
- Approach glide angles are estimates. Nothing has been loaded by the tile pipeline; `merge.py` was not run.


## Pass 5 (6:48 PM): merge-audit fixes, seam, airports, ring motorway
Current counts: 223 land polygons, 245 inland waters, 5853 road edges, 557.4 km ({'motorway': 62.42, 'trunk': 43.71, 'primary': 19.1, 'secondary': 13.15, 'motorway_link': 5.4, 'tertiary': 14.28, 'residential': 375.69, 'service': 25.54}), 196 bridge edges, 11029 buildings, 627 POIs of 86 types. Hard failures: none. Set pieces did not move.

**Heights (the merge-audit failures).** `heights.bin` is now blurred, flat inside the real rectangle with a 400 m taper outside, zero at coasts and inland water, slope-limited to 30 % everywhere, and graded along the road graph (road height = min(terrain, neighbor + 5.5 % x distance), roadbed benched 1.5 cells either side, slopes re-limited, four rounds). `tools/world/audit.py` now runs the same checks as `tools/osm/audit.mjs`: max step between 16 m samples 4.8 m (their limit 20, target 6); ground pairs 2 m apart stepping over 0.8 m: 0 of 200,000; terrain road segments over 12.5 %: 0 (max 0.114 at 8 m sampling; a few short stretches are between 8 % and 11.4 %). Peak 271.8 m at (-6864, -2556). Not re-run through merge.py by me.

**Seam.** The real bay now continues outside the rectangle as tapering water with a diagonal, noisy shore (north: to about (1000, -3950); south: to about (-100, 4020)), so no shore follows the rectangle line there. Street grids grow out of the west, north and south edges (West End, North Shore, South Shore: dense for the first 500 to 650 m, thinned 'Outskirts' beyond). Synthetic roads inside the rectangle: 0 m. The audit still counts 1 straight shore run over 300 m near the line, at about (2158, -2670) on Miami Beach's bay side; cause not confirmed (my land fill there did not change it, so it is probably the real seawall).

**Airports.** Solana International: rotated 25 degrees (runways WNW to ESE), three parallel runways (10R/28L, 10C/28C, shorter 10L/28R), terminal, concourses, garages and apron on the north-east side, Airport Boulevard to West Line Avenue; center (-5150, 2000), sized 1.1x so the traced kidney lake to its west survives. Tern Key Airfield: main runway direction and length measured from the image's pixels (bearing 186.7 degrees), a second runway diverging from the north end, taxiway, apron, terminal and hangars on the east side, paved airfield filling the island, sandy rim, no town grid on the island.

**Ring.** Cypress Belt Parkway (SR 836) is two one-way three-lane carriageways (62 km of motorway edges). Roads that meet it connect through four ramps each to an elevated junction over the median (FORMAT supports this: layer 1 bridge pieces and `motorway_link` ramps). The two cross routes and the central highway are six-lane trunks, not divided.

**Other.** 39 street patches that had been dropped are now reconnected with short link roads; connectors that would need more than 220 m of bridge are skipped, so 329 street edges on islands without a causeway are still dropped. Swamp: sawgrass areas, 90 slough channels and two airboat loops (`layout.json.routes.airboat`). Farmland cells east of the lake. Preview palette is sampled from the image (`out/palette.json`); shallows are the image's own turquoise polygons; no glow, no dashed line. Crops: `docs/v2/compare/world-layout_crop_city_bay.png`, `_tern_key.png`, `_airport.png`.

**Still off (honest).**
- **City and bay do not look like ref_40, and cannot at this scale.** At 20 m per pixel the image's city, bay and beach are 5.5 km wide; real Miami in the rectangle is 8.2 km. The image's downtown therefore lands in the real bay. At **30 m per pixel** the two widths match (8.25 km vs 8.22 km) and the image's west city edge falls on the rectangle's west edge, which would remove most of this mismatch; it makes the world about 31 x 45 km and moves every set piece, so I did not do it. This needs the lead's decision.
- The image's bay islands that fall inside the rectangle are not added (real islands are there); the ones outside are traced, but several have no causeway.
- The image's ring island north of the rectangle is partly eroded where it meets the real bay.
- Main airport sits about 2 km west of its place in the picture and is smaller than drawn.
- Tern Key: second runway layout is my reading (a V from the north end), not measured; no islets were added or removed (they are the traced ones).
- Tamarind Key has no gray outline in the image, so it has no streets.
- Lakes and ponds are the traced outlines (5 m raster, light smoothing); I did not overlay each one individually.
- Last crop sheet looked at was one build earlier (before runway colors were darkened and stray connectors removed).
