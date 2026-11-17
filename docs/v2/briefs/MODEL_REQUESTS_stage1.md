# Model requests, stage 1 (world foundation)

Put each download in `Models/<Category>/` like the existing ones (any name; I rename and catalog them). Free-for-games
licenses only (CC0 or CC-BY is best). No real brands or logos. Big and polished things: download, never AI-generate.
Stage 1 already has: 15 buildings, 1 street lamp (wooden lantern), 1 traffic light (vintage), 8 sign sets, 21 trees and
palms, road kits, benches, bins, bus shelters, hydrants, mailboxes, fences, docks.

Priority: **P1 = needed to make the new map look like GTA (please do these first)**, P2 = big improvement, P3 = nice.


## P0 (Nov 16): what stands between us and "better than GTA 5"
Code can blend, retexture, stitch and place, but these need real source material. Best free sources: Poly Haven
(polyhaven.com, CC0), ambientCG (CC0), Sketchfab "downloadable + CC-BY/CC0", Fab free assets (check the license).
| Priority | What | Why | Search words |
|---|---|---|---|
| P0 | **Grass and ground scans, 4K PBR**: short lawn, patchy lawn with dirt, dry sandy grass, beach sand, wet sand, forest floor with leaves, mud | the ground covers most of the screen; GTA 5 ground looks real because it is photoscanned | Poly Haven "aerial grass", "coast sand", "forest leaves", "rocky trail"; ambientCG "Grass", "Ground", "Sand" |
| P0 | **Grass blade / foliage card atlas** (photoscanned grass clumps, weeds, small flowers with alpha) | dense close-up grass that beats GTA 5 needs real card textures, not drawn blades | "grass atlas pbr", "foliage pack cc0", Poly Haven "grass" models |
| P0 | **More buildings: 40-60 unique** (Miami style): glass towers, condo towers with balconies, art deco hotels, strip malls, gas station, cottages / Keys houses, warehouses | hand-modeled buildings are where GTA 5 is strongest; generated facades alone will not beat it | see the P1 building table above |
| P0 | **US traffic signal on a mast arm + modern street lamps** (cobra head single/double) | every city junction shows these up close; the one traffic light in the library is a vintage style | "traffic light mast arm", "street light pole" |
| P1 | Utility poles with wires, US road signs pack, guardrail, highway gantry, chain-link fence, billboards | street dressing seen everywhere | see P2 table above |
| P1 | Asphalt decals: cracks, patches, oil stains, manhole covers, storm drains | breaks up roads like GTA 5 | "road decals pack", "manhole cover" |

## P1: textures (biggest single quality win; the current ground textures are noisy and read as "grain")
Free CC0 PBR texture sets, 2K, with color + normal + roughness (ambientCG or Poly Haven). Put them in `Models/Textures/` (new folder).
| Name | Use | Search words |
|---|---|---|
| Asphalt, fresh | main city roads | "asphalt 2K PBR", "road asphalt clean" |
| Asphalt, worn and patched | older roads, parking lots | "asphalt cracked", "asphalt patched" |
| Concrete sidewalk slabs | sidewalks | "concrete pavement tiles", "sidewalk" |
| Concrete, plain smooth | curbs, plazas, ramps | "concrete smooth", "concrete floor" |
| Short grass / lawn | lawns, parks, medians | "grass lawn short PBR" |
| Sand, fine beach | beaches | "beach sand PBR" |
| Dirt / dry ground, LOW contrast | empty lots, verges, farms | "ground dirt dry", "soil" (avoid high-contrast gravel) |
| Stucco wall, white/cream | Miami houses and deco hotels | "stucco plaster wall" |
| Red brick | older downtown buildings | "brick wall red" |
| Mud / swamp ground | swamp and mangrove areas | "mud wet ground" |

## P1: buildings (about 30 more; the map needs ~45 kinds so streets don't repeat)
Medium to big, downloaded, textured, game-ready (under ~50k triangles each if possible).
| Count | Kind | Where | Search words |
|---|---|---|---|
| 6 | Modern glass skyscrapers / condo towers | downtown, Brickell-style area | "skyscraper glass low poly game", "condo tower" |
| 5 | Mid-rise apartment blocks (5 to 12 floors), balconies | city neighborhoods | "apartment building game ready", "residential block" |
| 4 | Art deco beach hotels (3 to 6 floors, pastel) | beach strip | "art deco building", "miami hotel building" |
| 5 | Small shop fronts / one-story strip mall / corner store | every town and district | "strip mall", "shop building low poly", "convenience store building" |
| 4 | Warehouses, industrial sheds, port buildings | port and industrial zone | "warehouse building", "industrial hangar" |
| 4 | Florida-style suburban houses (one story, stucco, tile or metal roof) | residential areas | "suburban house low poly", "florida house" |
| 1 | Gas station with canopy (no brand) | towns and highways | "gas station" |
| 1 | Airport terminal (small/regional) | airport | "airport terminal building" |
| 1 | Motel (two-story, outdoor walkway) | highway towns | "motel building" |

## P1: street furniture
| Count | Item | Use | Search words |
|---|---|---|---|
| 2 | Modern street lamp (tall "cobra head" pole, single and double arm) | every city road | "street light pole modern", "cobra head street lamp" |
| 1 | US-style traffic signal on a mast arm (pole + horizontal arm + signal heads) | every big intersection | "traffic light mast arm", "american traffic light" |
| 1 | Simple traffic light on a pole (3-light head) | small intersections | "traffic light pole" |

## P2
| Count | Item | Use | Search words |
|---|---|---|---|
| 1 set | US road signs: STOP, speed limit, yield, one way, street-name blade | intersections | "us road signs pack" |
| 2 | Utility pole with wires / crossarms | suburbs, rural roads | "utility pole power line" |
| 1 | Highway guardrail (W-beam) segment | highways, ramps | "guardrail highway" |
| 1 | Overhead highway sign gantry | highways | "highway sign gantry" |
| 2 | Billboard on pole (blank) | highways, city | "billboard" |
| 1 | Chain-link fence segment + gate | lots, port | "chain link fence" |
| 2 | Shipping container + port gantry crane | port | "shipping container", "container crane" |
| 2 | Bald cypress tree (with knees) + saw palmetto | swamp | "cypress tree", "palmetto" |
| 1 | Newspaper box / vending boxes | sidewalks | "newspaper vending box" |

## P3
| Count | Item | Use | Search words |
|---|---|---|---|
| 1 | Lifeguard tower (pastel) | beach (one exists; a second style) | "lifeguard tower" |
| 1 | Marina floating dock + boat slips | marina | "marina dock" |
| 1 | Airport hangar + control tower | airport | "hangar", "control tower" |
| 1 | Farm barn + silo | farmland | "barn", "silo" |
