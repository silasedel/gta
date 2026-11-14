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


## Pass 6 (7:13 PM): 30 m per pixel, the picture wins everywhere
**This section supersedes the numbers above.** `merge.py` not run by me.

**Transform.** `x = -25450 + 30 * px`, `z = -24890 + 30 * py`; world = the image, 31.2 x 45 km. Scale fixed at 30 m/px; x0 by least squares over five control points, z0 from the barrier island's south tip on South Pointe (z 1903). Residuals: ocean shore +42, +24, -36 m (three rows, measured from pixels); beach bay shore +610 m and downtown bayfront -650 m (both read by eye from the image, so ±100 m). The real rectangle is image pixels x 724.7 … 998.7, y 741.2 … 918.1. Recorded in FORMAT.md v4, `features.json.imageTransform`, `layout.json.imageTransform`.

**Picture wins.** `land[]` is the image's land for the whole world, inside the rectangle too, with no blend into the OSM coast, so there is no box. `features.json.city_mask` gives the merge agent what it needs: image land and water polygons inside the rectangle, `newLand` (8.32 km2 of image land that real data lacks), `removeRealLand` (3.03 km2 of real land the image shows as water), 17 island outlines and 10 causeway centerlines (generated as the shortest crossing to the next larger land, not digitized). Synthetic streets and buildings are generated on `newLand`; nothing synthetic sits on land that is both real and in the image (audit: 0 buildings, 0 m of road there). Until merge clips real features to the mask, the merged world will still show real Miami's own coast inside the rectangle.

**Counts (audit.json).** 234 land polygons, 349 inland waters, 15553 road edges, 1448.9 km ({'motorway': 104.56, 'trunk': 72.15, 'primary': 32.78, 'secondary': 16.75, 'motorway_link': 6.09, 'tertiary': 21.86, 'residential': 1163.77, 'service': 38.97}), 274 bridge edges, 24414 buildings (cap 23,300 before the last towns; target under 25,000), 503 POIs of 82 types, 32 towns. Joins 135 of 136. One road component.

**Audit with the merge thresholds: PASS, hard failures none.** Max step between 16 m samples 4.9 m; ground pairs 2 m apart over 0.8 m: 0 of 200,000; terrain road segments over 12.5 %: 0 (max 0.119; this is close to the limit, graded at 4.5 % along the graph); max deck grade 0.062.

**Relief.** Peak 384.6 m at (-8834, -15170). Inside the traced forest polygons: median 1.1 m, 75th percentile 93.8 m, 95th percentile 251.0 m; 41 % of forest is above 20 m. The forest class also covers the low southern swamp forest, which is flat by design (heights are zeroed south of image row 800), hence the low median. Not seen in 3D.

**Set pieces (same image pixels, new coordinates).**
| id | pass 5 | pass 6 | heading | lot |
|---|---|---|---|---|
| nico_house | (-2543.7, 9262.7) | (-7064.99, 13125.06) | 1.0736 | 60 x 60 m on land, no road or building inside; water behind (-Z, 32 m from the back edge) and on the +X side (True) |
| keys_bar | (-2996.6, 10449.8) | (-7434.29, 14341.92) | 0.9717 | 40 x 32 m, bay side of the Overseas Highway |
| keys_sign | (-2225.8, 9096.5) | (-6282.91, 12306.1) | 2.9337 | 6.5 m verge, inbound side |
The lot clearance check (roads, buildings, water in each lot) was run in pass 5; in pass 6 the same placement code ran but I did not re-run that separate check.

**Airports.** Solana International is at the image's position: center (-6122, 1773) is the tower; block center = image pixel (595, 885), rotated 25 degrees, scaled 1.9x (3.3 km runways), three parallel runways, terminal north-east. It clears the rectangle, so no shift. Tern Key Airfield: main runway measured from pixels (bearing 194.5 degrees, 3005 m). **The second runway could not be measured from pixels** (the detector found no second elongated bright strip), so it is still my V-shaped guess from the north end.

**Lake overlay (traced water vs the image's inland-water pixels, 4x supersampled).**
| image px | pixels | recall | precision |
|---|---|---|---|
| (649, 455) | 8493 | 0.94 | 0.95 |
| (506, 697) | 5903 | 0.78 | 0.55 |
| (862, 639) | 3458 | 0.84 | 0.41 |
| (307, 444) | 1945 | 0.9 | 0.85 |
| (399, 855) | 1525 | 0.68 | 0.69 |
| (688, 768) | 1201 | 0.53 | 0.5 |
| (482, 448) | 923 | 0.49 | 0.46 |
| (670, 268) | 802 | 0.87 | 0.87 |
| (390, 814) | 617 | 0.16 | 0.14 |
| (554, 787) | 613 | 0.42 | 0.41 |
| (424, 525) | 475 | 0.36 | 0.35 |
| (375, 455) | 410 | 0.46 | 0.41 |
The big round lake and the two compact northern lakes match (0.87 to 0.95). The kidney lake is only 0.68 / 0.69 and the thin rivers and swamp networks are 0.1 to 0.55: thin channels (1 to 2 px) are partly lost or shifted by the smoothing in the trace. I did not find the cause for the kidney lake in time. This item is not met.

**Sand and shallows.** Sampled from the image: sand [238, 219, 167], shallows [35, 136, 149]; written as `colour` on beach areas and shallows and in `palette`. Sand is now only within 150 m of the ocean (pale inland pixels were roads and roofs).

**Still off.**
- Inside the rectangle the preview shows real streets and buildings where they fall on image land (two paler blocks: downtown and Miami Beach) and generated grids elsewhere; the two textures differ visibly.
- Causeway centerlines are generated, not the picture's; island towns farther than 650 m of water from other land have no road.
- The image's bridges are classified as thin land strips, so the Keys bridges are partly 'land' in the trace rather than open water under a bridge.
- Town street patterns are generated grids at real block size, not the picture's streets. Main roads are still the hand-digitized set (±300 m at this scale).
- Cross routes and the central highway are six-lane trunks, not divided.
- No motorway interchange between the ring and I-95/836 stubs; joins are stubs to the fringe collectors.


## Pass 7 (7:45 PM), STAGED in `tools/world/out_pass7/` (live files untouched)
Files: `tools/world/out_pass7/features.json`, `heights.bin`, `layout.json`, `map.png`, `audit.json`, `summary.json`. Side-by-sides: `docs/v2/compare/world-layout_vs_ref40_p7.png`, `world-layout_crop_city_bay_p7.png`, `_tern_key_p7.png`, `_airport_p7.png`. Build with `WL_OUT=out_pass7 tools/world/.venv/bin/python tools/world/build.py` (then `audit.py`, `render.py` with the same variable). Without the variable the same code writes the live paths.

**Found and fixed a registration bug that affects the live pass 4 to 6 outputs.** The official image is 1041 x 1511 px; I had assumed 1500 rows. The traced land was squeezed north–south by 0.73 % (up to 330 m at the south end) relative to the transform and to the hand-digitized roads. This was the cause of the poor lake overlays. `bounds.maxZ` is now 20440.

**Overlay scores (traced vs the image's pixels, 4x supersampled).** Land/coast IoU 0.989. All 17 largest inland waters (big round lake, the northern lakes, the kidney lake, the ring canal, swamp networks, rivers): recall 1.0 to 1.0, precision 0.98 to 1.0. The kidney lake went from 0.68 to 1.0.

**Audit (merge thresholds): PASS, no hard failures.** Max 16 m step 4.9 m; ground pairs over 0.8 m: 0; terrain road max grade 0.08; segments over 12.5 %: 0. One road component, joins 134 of 136. 455 land polygons, 11905 road edges (1263.4 km), 245 bridge edges, 25198 buildings (198 over the 25,000 target: Amaro Landing alone took 3317 trailer lots), 536 POIs. Peak 361.3 m at (-12914, -4882).

**Set pieces.** Lot check now runs inside `audit.py` (`setpiece_lots`): all three lots have 0 roads, 0 buildings, 0 water and are fully on land. `keys_bar` (-7434.29, 14341.92) and `keys_sign` (-6282.91, 12306.1) did not move. **`nico_house` had to move**: its pass 6 lot (-7064.99, 13125.06) is not valid on the corrected land. New: (-6420.26, 12416.02), heading 1.2411, back edge 14 m from the bay; water on the +X side: False (no spot with water on both sides passed the stricter on-land margin).

**Per item.**
1. Ring island: traced. Inner island (189.9 ha, `Corona Island`), ring canal as water with the island as a hole, outer ring as traced land, `Corona Loop` road around the island, bridge roads north and south, golf area inside. The loop road is an inset of the island outline, not the picture's own road.
2. Roads: **not traced from pixels.** Main roads are still my hand-digitized polylines (about ±300 m). What changed: the picture's bridges and causeway decks are now open water, so those crossings are real bridges (245 bridge edges); town grids take their orientation from the picture where a dominant direction could be measured (20 of 25 traced towns), with varied block sizes, skips and jitter. No diagonals, curves or interchange loops from the picture.
3. Runways: measured by an iterated Hough vote on pale pavement pixels. Main airport: 2 strips found (3641 m at 94.5 deg, 4203 m at 123.0 deg); the picture appears to have more, so the count is probably short. Tern Key: 2 strips (2678 m, 2487 m), both measured, no guessed runway. Taxiways, aprons and terminals are still generated, not measured.
4. Building look: `districts[]` with `type`, `tint`, `roofTint` sampled inside each outline. Types assigned: {"old_town": 1, "suburb": 18, "resort": 4, "downtown": 2, "rural_florida": 1, "industrial_port": 1, "rural_town": 5}. Honest limit: at this image resolution the medians are all near grey-beige (for example West End #a59f97), so the terracotta/pink versus white-tower contrast the user describes is not captured; types come from position rules, not from color.
5. Lake town: Amaro Landing is tagged `rural_florida`: trailer lots, bait shops, fish camp, bar, repair shop, farm stand, two thirds of its residential streets `dirt` or `gravel`, a boat ramp POI on the lake shore, pickup, trailer and swamp-buggy props. It is too dense (3317 lots).
6. Racetrack: I did not detect an oval in the picture (no detection was attempted beyond choosing a site). Placed Solana Motor Speedway at (-11650, 2260), south-west of the airport near the kidney lake: 330 x 170 m semi-axis oval, infield road course, pit lane, grandstand, pit garages, parking, Speedway Boulevard.
7. Swamp: the square patch is gone; marsh areas are now built from the picture's own channel network (dilated and closed), central and southern. 36 extra generated slough channels remain inside them.
8. Lot clearance: see Set pieces.

**Still differs.** Roads (item 2) are the main gap. Airport runway count and all taxiways/aprons. District colors. Causeways are still generated shortest crossings except where the picture's bridge was removed and a digitized road crosses it. Crop sheet viewed once after the final staged build: city and bay, ring island and Tern Key read like the picture; the airport is the weakest crop.
