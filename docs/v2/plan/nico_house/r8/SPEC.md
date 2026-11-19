# Nico's house, round 8: the exact spec (user, Nov 18 night). This overrides every earlier house brief.

The user is angry: the last rounds rotated the house wrong, made the front deck huge, put the back deck on the wrong side, left a sandy puddle instead of a canal, and ignored the downloaded models. Take as long as it needs. Do not stop until every reference view clearly matches.

## References (in this folder, plus `../r4/`)
- `A_dock_from_water_facing_S.webp` (= r4/17): from the water looking SOUTH (slightly east).
- `B_front_low_facing_N.webp` (= r4/14): low, from the driveway, looking exactly NORTH. The MOST important exterior view.
- `D_driveway_head_height_facing_N.webp` (= r4/11): head height, a bit to the right, still looking NORTH.
- `C_under_house_hoop.webp` (= r4/13): under the house past the stair; looking straight through the under-house passage you face NORTHWEST.
- `E_back_deck_sunset_canal_size.webp`: the back deck: its real size and look and the canal beside it (ignore where its stairs are).
- `F_gym_deck_view_canal_neighbor.webp` (= r4 view): from the gym deck across the canal to the blue neighbor house.
- `G_front_walkway_view_facing_S_driveway_street.webp`: from the front walkway/balcony looking SOUTH (slightly east) over the drive to the street: copy the layout exactly.
- Interior: `../r4/15_MAIN_living_room_looking_north.webp`, `../r4/16_MAIN_kitchen_wide_looking_south.webp`, `../r4/05`, `07`, `09`.
- Bugs to fix: `BUG_*.webp/png` in this folder.

## Orientation (non-negotiable)
- The house is DIAGONAL to the compass: its CORNERS point north, east, south and west; its walls face NE, SE, SW and NW.
- FRONT (driveway side, front door, the narrow front walkway-balcony) faces SOUTHWEST. Looking north from the drive (B, D) you see the house at 45 degrees.
- BACK (the big back deck, the dock and the water) faces NORTHEAST.
- The basketball backboard faces SOUTHEAST; you shoot toward the northwest, straight along the under-house passage (C).
- An earlier round had a `?nhrot=45` rotation: check it, it was probably closer to right. Verify with a top-down shot against the minimap north arrow AND by rendering the B/D/A cameras with the exact compass headings above.

## Exterior
- FRONT: NOT a big deck. A normal walkway-balcony about 4 ft (1.2 m) wide along the front; the FRONT DOOR in the middle of the front wall, as in the references. Between the upper windows, a small door/hatch in the gable (see B).
- The satellite dish: use the user's downloaded dish (`Models/_Inbox/home-tv-satellite-dish.zip` or its converted copy) exactly where B shows it (on the deck corner post at the head of the stair).
- Stairs: exactly as in B and D (two flights, landing, lattice under). Rails must connect to posts and stair stringers, no rail through the stairs, no floating rail ends, no layered/z-fighting boards, no gaps (BUG_deck_stairs_rail_glitch). Stair and wall HITBOXES must work: the user could not climb the stairs and walked through a wall.
- Remove the ladder leaning on the house.
- Under the house (C): exactly: the hoop under the beam, fluorescent tube, string lights, white downpipe on the post, vines and moss on posts, the annex door with the purple box light on lattice, wall lamp, meter, the green barrel, propane tank, flower pots, the second set of stairs coming down along the house, the shuttered window; the concrete pad cracked, with pebbles, dirt and plants exactly as C.
- Driveway and yard (B, D, G): a realistic, harsh dirt-and-gravel drive (crushed shell, ruts, tire tracks, puddles, leaf litter) curving round the grassy island with rocks, the silver garbage bin at the exact spot, the bushes with purple flowers, and trees exactly as B; the drive must actually reach the road. From G: the paved road ends where G shows it; the neighbor fence (white lattice) with flowers, the exact trash bin colors and placement, the neighbor's car type, the boat on a trailer across the street, the red dumpster outlined with rocks and a clear grass strip, the puddle/divot, palms, the other fence, houses and trees.
- Back deck (E, F, A): about HALF the current size, on the NORTHEAST side, oriented square to the house (diagonal to the compass), flush with the canal side; stairs come down from its edge running back toward the house, not sideways. The gym, table and umbrella, grill, towel as before.
- CANAL: about 20 ft (6 m) wide, running roughly north-south but diagonal: it meets the bay at the NORTHWEST end and runs in toward the SOUTHEAST. Straight, clean edges (no jagged polygon, also on the minimap: `BUG_minimap...png`: straight and a bit further south). Timber seawall boards on BOTH sides with a drop of a few feet to the water; the back deck aligns with the canal edge. A neighbor house sits on the far side of the canal (the blue house in F) and another house further in. Real water in the canal (not a sandy puddle): calm, clear teal, soft edges.
- DOCK (A): a walkway that leaves the seawall at an ANGLE (diagonal), then turns and runs straight to the big flat platform parallel to the seawall; posts, cross-braces, the KEEP OFF / NO ENTRY sign, ladder, chairs, cooler, rope, life ring, fishing gear (rod lying down), the skiff moored along the platform.

## Interior (15, 16)
- Layout: you enter by the FRONT DOOR into a short hallway: plants; the bathroom (bead curtain doorway) on the LEFT; the bedroom on the RIGHT; walking straight on brings you into the open kitchen/living room. Where the front door belongs there is currently a window: put the door there. Every doorway must be walkable (the bedroom and hall are blocked today).
- Living room: the couch, armchair and side table/lamp are on the wrong wall: put them on the wall to the LEFT as in 15; the TV setup faces them accordingly. Use the user's TV model (flatscreen-tv-46-inch) and TV table (ps2-soviet-tv-table), not code-built ones. The lamp: shade from the white modern lamp, base from the lamp-table model RECOLORED to warm gold/brass (actually change its texture/material color).
- Kitchen: must be walkable and match 16 with real detail: use the user's downloaded sink, microwave, toaster, kettle, utensils (kitchen*.zip in `Models/_Inbox` or converted in `Models/`); the fridge is too big (it sticks through the roof): resize it to a real 1.7 m top-freezer fridge and keep it aged. The terrarium with the snake goes at the end of the kitchen counter exactly as in 16/09.
- Remove loose/broken wood boards inside. Camera: beams must not be clipped through: the camera collides with them or they fade out smoothly.

## Physics
- Hitting the garbage bin must not explode it into blocks: realistic rigid-body bins that tip, roll and spill.

## Quality
- Adapt every downloaded model (READ_ME_FIRST "Using downloaded models"): resize, recolor, retexture, age, combine.
- No floating, clipping, z-fighting, see-through walls, missing hitboxes. Smooth frame rate.
- Make comparison sheets for every reference camera (A-G, 15, 16) with the exact compass headings, look at them, and iterate until they clearly match.
