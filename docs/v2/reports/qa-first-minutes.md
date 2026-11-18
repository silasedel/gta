# r2-qa: the first 2-3 minutes (fresh default boot on 5200, normal spawn at Nico's)

Script: `node tools/v2/qa/firstmin.mjs` (one boot). 69 frames in docs/v2/shots/qa/first/ (HUD on, default chase camera, a frame every 1.5 s), contact sheets first_sheet_1..6.jpg, log docs/v2/reports/qa-first-minutes.json.
Run: title -> yard 360 (8 x 45 deg) -> walk to the truck (truck9 at -862.8, 4835.7) -> close-ups -> enter -> drive toward the Overseas Hwy -> stop / exit -> the coupe4 (-864.4, 4842.5) -> enter -> pull away.
Coverage gap: `game.nav.route` from the yard to the Overseas Hwy returned no route, so the scripted drive aimed straight at the highway point, put the truck's nose on a post of the raised house after 1.5 m and stayed there for 60 s (my driver, not the game). The street and highway stops therefore show the yard; Pelican Point Ln is covered by the walk to the coupe and the earlier visual sweep (keys_street.jpg).

Ranked by how visible it is to the user in the first 2 minutes. Severity: H = obvious / immersion-breaking, M = noticeable, L = picky.

| # | sev | what the player sees | frame(s) | where (x, z) | likely owner / file |
|---|---|---|---|---|---|
| 1 | H | The loading screen does not clear cleanly: a ghost "LOADING..." line, the progress bar, the round logo and the tip text stay half-transparent over the game as it starts. | 001_title.jpg | spawn -865.7, 4836.5 | main / r2-web: the loading overlay fade (index.html #loading, src/core/loadProgress.js) |
| 2 | H | The flowering flamboyant tree right next to the spawn has branches made of straight dark sticks / flat triangular shards and leaves like flat paper cut-outs; it fills the right half of the very first frame. | 001, 002, 004, 066-069 | about -858, 4836 | r2-veg (flamboyant model) / r2-keys (yard planting) |
| 3 | H | The chase camera goes inside that tree's canopy: the whole screen is sticks and leaves while driving the coupe out (no camera collision with foliage). The same happens while looking around in the yard. | 004, 066-069 | -863, 4839 | main: updateCamera (src/main.js) camera obstruction; r2-veg (canopy has no camera blocker) |
| 4 | H | The truck shows no driver: after entering, the seat behind the windows looks empty from both sides, and at the stop. The coupe shows Nico fine. | 011, 012, 053 vs 064 | truck9 at -862.8, 4835.7 | r2-people (seat solver, src/player/seat.js) / r2-cars (truck9 seat anchors) |
| 5 | H | The white car parked under the flamboyant has the tree's branches and leaves passing through its body and roof. | 001, 002, 009 | about -858, 4834 | r2-keys (yard layout: car parked inside the tree) |
| 6 | H | The coupe stops dead under the flamboyant canopy: 12 km/h, then 0 km/h for 6 s with full throttle, with no trunk or wall in front (the trunk is to the left). It looks like an invisible blocker. | 066-069 | -863.1, 4838.7 | r2-physics (tree / branch colliders bigger than the trunk) / r2-keys |
| 7 | M | The bougainvillea in the yard is posterized magenta and green blobs (splotchy), right beside the truck. | 015-051 (right side), 002 | -861, 4832 | r2-veg |
| 8 | M | Flower clusters and leaf edges are stippled / dotted (screen-door dithering), most visible on the flamboyant flowers close to the camera. | 066, 004 | yard | r2-render (alpha hash / AA) |
| 9 | M | The red roll-off dumpster on Pelican Point Ln is tilted with one end in the air, overhangs the asphalt, and its lettering panel is a black slab. | 056-062 | about -853, 4849 | r2-keys (keysLots / dumpster placement) |
| 10 | M | The HUD crowds the first view: "Press F to enter vehicle", the PSST pistol notification and the big KEY LARGO area card all appear at once. 25 s later "Someone is being mugged nearby! Step in?" pops while you are still in the yard. | 002, 023 | spawn | r2-mapui (HUD) / gameplay events |
| 11 | M | Six empty wanted stars appear and disappear in the top right between frames (none in 002, shown in 004, 011, 015). | 002 vs 004 | spawn | r2-mapui (HUD wanted cluster) |
| 12 | M | An NPC by the street leans into a mailbox with his hand and leg through it. | 056 (right) | about -846, 4846 | r2-people |
| 13 | M | A speech bubble ("Hey neighbor, stay cool out here.") floats over a bush with nobody visible. | 064 | -864, 4842 | r2-people (talk bubbles anchored to hidden NPCs) |
| 14 | M | "Talk to Chad" prompts show for an NPC hidden behind the dumpster, still on screen with the camera 10 m away. | 062, 063 | -858, 4847 | r2-people (talk prompt range / occlusion) |
| 15 | M | The truck windshield has grey blotchy stains (a dirt layer that reads as smudged paint). | 002, 001 | truck9 | r2-cars (truck9 glass material) |
| 16 | M | The truck's B-pillar has a bright white streak, and the black pillar trim pokes above the roof line. | 011 | truck9 | r2-cars |
| 17 | M | A white specular blob sits on the passenger glass. | 012 | truck9 | r2-cars / r2-render |
| 18 | M | No GPS route from home to the Overseas Hwy: `game.nav.route({x:-865.7,z:4836.5}, {x:-772.5,z:4801.7})` returned null 90 s after boot. | log (events.route) | spawn to -772.5, 4801.7 | r2-mapui (src/nav/nav.js route; worker readiness) |
| 19 | M | The yard sand reads as bright white with dark noisy speckles and evenly scattered grass tufts. | 002, 009 | yard | r2-keys (yard ground sheet) |
| 20 | M | A wooden post comes up through the black trash can's lid on Pelican Point Ln (seen in the visual sweep at the same spot). | visual/keys_street.jpg | about -873, 4825 | r2-keys |
| 21 | M | Palm bark close up is a low-res smeared zebra texture. | visual/keys_street_dusk.jpg | Pelican Point Ln | r2-veg |
| 22 | L | The coupe pulls away with a white exhaust puff that looks like a flat sprite. | 066 | -863, 4839 | r2-cars / fx |
| 23 | L | Dark tire-track smears on the sand look like painted stripes. | 001, 002 | yard | r2-keys (yard decals) |
| 24 | L | Hibiscus / tropical beds in front of the house read as smooth green blobs with no leaf detail at mid range. | 015, 049 | -870, 4828 | r2-veg |
| 25 | L | The time of day races: the clock goes 09:01 to 09:59 in about 2.5 minutes. | 002 to 069 | | gameplay clock (main) |
| 26 | L | The minimap rotates with the camera and the cardinal letter jumps (E, NE, NW, N...) during the 360 look. That's fine, but the "N" badge overlaps the map edge. | 002-009 | | r2-mapui |
| 27 | L | Console: "[nicoHouse] atlas overflow nh72_atlas 2246" at boot: kitchen textures overflow the atlas, so some may be downscaled or cut. | console | | r2-keys (src/world/setpieces/nicoHouse/parts/72_kitchen.js:36) |
| 28 | L | Console: "THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed" once at boot. | console | | main |

Physics and state during the run: no NaN, no roll-over or bouncing (truck vy -0.04 to -0.09 at rest, up = 1.000), and entering and exiting worked both times. Walking into the dumpster stopped the player cleanly. No console errors.
