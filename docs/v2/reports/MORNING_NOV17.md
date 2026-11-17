# Morning report, Nov 17: overnight overhaul

This covers about 12 helpers and 303 commits on `stage-1`. Nothing was pushed or published.

**Play it:** http://127.0.0.1:5201/ is the production build.
- `?look3=0` brings back the old lighting.
- `?nico=old` brings back the old Nico.

Each section names the before/after sheets to look at, and every path is inside the project.

## Your complaints, one by one
| You said | Now | Look at |
|---|---|---|
| Potholes are flat, off-color squares | Real dips with broken rims, colored from the asphalt they sit in, and they fill with water in rain | `docs/v2/shots/stage1/gp7_pothole.png`, `gp8_pothole_rain.png` |
| Road glitches through the rock edge; rock meets grass in a hard line | Road edges crumble into sand or gravel, grass thins out into the shoulder, and borders between ground types wander instead of running straight | `docs/v2/shots/stage1/GROUNDPASS_keys_ab.png`, `GROUNDPASS_terrain_grazing.png` |
| Grass grows through the road and through cars | A hard-surface mask: nothing grows on asphalt, slabs, driveways, docks or under cars. A lane audit finds 0 plants in lanes | `docs/v2/shots/vegetation/overnight/t11_keys_street.png` |
| Generic roads | Visible aggregate, crack sealer, tire tracks, faded paint, sidewalk slabs with stains and lifted edges, crosswalk style by area | `docs/v2/shots/surfaces/SURF_closeups.png` |
| Dotted, wobbling parts of the house | The peeling-paint shader crawled under the anti-aliasing; fixed for every house built from the same kit. Still-camera noise roughly halved | `docs/v2/shots/keys/cmp_k17_r1_front.png` |
| Palms not from your models | Your palms, mangroves (including the stilt roots), oaks, ferns and flowers. Each instance varies in mirroring, size, lean, color and frond shape | `docs/v2/shots/vegetation/overnight/t14_deck_before_after.png` |
| Mangroves float, all identical | Grounded on several sample points, only on salt shores, three models mixed and varied | `docs/v2/shots/vegetation/overnight/t13_mangrove_close.png` |
| Identical bins and mailboxes, 5 mailboxes in a cluster | 22 props with 3–10 hand-edited texture versions each (graffiti moved or removed, rust, fade, stickers). One mailbox per house at the driveway; bins in pairs at the curb | `docs/v2/shots/props/review/FINAL_sheet.jpg` |
| Bins are solid walls | Push props (bins, carts, cones, chairs) shove when you walk into them and fly when a car hits them. Mailboxes and sign posts snap. Colliders were checked against every mesh | `docs/v2/shots/props/colliders/`, `t5_*.jpg` |
| Docks don't sit on the sand; layers poke through | Your pier kit starts at the waterline on piles, with riprap, ladder, skiff and buoy | `docs/v2/shots/keys/cmp_k17_r7_dock_close.png` |
| House and placement don't match the mock-up | Nico's lot is placed object by object from the mock-up, plus 12 hand-placed neighbor cottages | `docs/v2/shots/keys/cmp_k17_r0b_deck.png` (mock-up camera) |
| Use my models for everything | All covered below | |

## Your models now in the game
- **Main character:** your model from `Models/Main Character` is Nico.
  - Rigged onto the game skeleton with finger joints; 1.83 m tall; 4K textures; matte skin.
  - Feet stay within about 2 mm of the ground. Foot slide went from 0.14 to 0.03 m/s walking and from about 1.0 to 0.09 m/s running.
  - Sheets: `docs/v2/shots/player/compare_preview.png`, `SHEET_final_a.png`.
- **People:** all 95 of your NPC models are rigged, with fingers, and fill the crowds by role (police, staff, fishermen, suits). No two copies of the same person appear near each other. 60 of them on screen cost no more than the old crowd. Sheet: `docs/v2/shots/people/closeups_0.png`.
- **Cars:** 47 driving cars from your models. The 4 "personal use only" rows were skipped.
  - Wheels spin and steer, and each has its own suspension.
  - US paint mix: white 24 %, black 22 %, gray 18 %, silver 12 %, and so on.
  - One of each rare car on the map, placed by zone.
  - Nico's gray pickup with the black stripe sits next to the rusty classic.
  - Traffic roll-overs are down from 9 a minute to 0 in the latest test.
- **Weapons:** all 24 plus a machete. They are properly held, cops aim two-handed, and pickups are the real models with no beams. Sheet: `docs/v2/shots/weapons/fin_sheet_long_aim.png`.
- **Buildings:** 44 more of your models, including towers, motels, factories, the airport (hangars, control tower, jet bridges, airliners) and the rough districts. Each uses its own collision mesh. Sheet: `docs/v2/shots/stage1/CMP_B0_vs_R1_dt_overtown.png`.
- **Shops:** 608 shops that sat on grass now front the street over paving. Storefronts have 3D awnings, signs and doors, with real interiors behind the glass. Sheet: `docs/v2/shots/shops/sheet_ftm_clothes.png`.

## Physics and movement
- **Ragdoll:** car hits (above 15 km/h), falls over 4 m, explosions and death, followed by a get-up.
- **Vault:** over walls and fences from 0.5 to 1.2 m.
- **Sprint stamina:** about 14 s of sprint before he drops to a run.
- **Camera:** pulls in when a car or wall blocks the view.
- **Hit zones:** fitted to each character's own mesh, 95–99.5 % accurate.
- Sheets: `docs/v2/shots/player/SHEET_ragdoll.png`, `SHEET_feel.png`.

## Lighting
- **Shadows:** soft sun shadows that stay sharp at the point of contact.
- **Light balance:** deeper shade.
- **Color:** PBR Neutral tone mapping.
- **Sky:** colors by sun height (gold dusk instead of lavender).
- **Reflections:** wet-street reflections, and reflections that follow the time of day.
- **Night:** a little brighter.
- Sheet: `docs/v2/shots/look/sheet_final_nico_deck.jpg`.

## Speed
- **Loading:** ready in 18–27 s, down from 42 s, and no "page unresponsive". The area around the spawn is now fully built before the loading screen closes; before, 6 of the 7 nearby map squares were still missing.
- **Frames:** each change was measured on/off in one session while about 10 helpers loaded the machine, so absolute fps from tonight is not meaningful. Draw order, interior culling and parked-car sleep cut shader switches by 60 % and downtown worst-case frames by half.
- **What costs most now:** your building models downtown (+7 ms at street level), physics and tile-build spikes while driving, and the new textures (about 250 MB more GPU memory).

## Still not good enough (honest list)
- **Generated buildings at street level** are still crude in places: flat walls, simple windows, cartoon brick. See `docs/v2/shots/keys/h2_h_homestead_ab.png`. Your models look good; the procedural ones don't yet.
- **Car logos:** removed and checked on 7 cars. The rest were cleaned by the same automatic pass and are being re-checked until 06:45; check the status file for any car still listed.
- **Interiors:** salons, hardware and electronics shops still use the old toy-like interiors.
- **Driving:** still has hitches (physics and tile building). Fps on a quiet machine still needs measuring.
- **Police:** cop aiming was posed for the screenshot; it wasn't seen in a live chase.
- **Lifeguards:** the two lifeguard scans need a manual rig, so they aren't in the game.

Details per area: `docs/v2/briefs/OVERNIGHT_STATUS.md`. Each helper's section starts with a 3-line summary.
