# vehicles-look: report (Nov 13, about 21:00 MST, stopped early on the usage budget)

## Honest summary
The cars still do not read as familiar real-world kinds. This pass fixed glitches, added rear-end detail and a contact shadow, made the wear mix believable, added the rain-bead paint layer and smoothed traffic controls. **The real fix, redesigned bodies, has not started**: crisp feature lines, modern swept headlamps, real grille and intake shapes, and a proper glasshouse with black window surrounds. On the procedural bodies this is a few rounds of look-and-fix per archetype. The hero-cars B-spline kit (`src/vehicles/hero/kit/*`) is the better base for traffic bodies, if draw calls are merged.

## Glitches found and fixed
| Glitch | Cause | Fix | State |
|---|---|---|---|
| Lamps flicker or z-fight at range | Lamp patches sit 4 to 9 mm off the body; near plane 0.25 and far 8000 give about 2 to 3 mm depth precision past 100 m | `polygonOffset` (-2 / -4) on every lamp material (`model/materials.js` `lampMat`) | built, not looked at in game |
| Flicker at the LOD switch distance | `THREE.LOD` switched with no hysteresis | Hysteresis 0.12 on LOD1 and LOD2 (`carModel2.js`) | built |
| Cars look pasted onto the road | No contact or ambient occlusion under the car | Soft contact-shadow plane under each car, with an alpha map in the green channel and `polygonOffset` (`carModel2.js`) | built; weak in daylight next to the sun shadow |
| Headlamps read as white blobs | Light-colored reflector base | Darker chrome reflector color | partly; still blobby |
| Nearly every car dirty and rusty | Dirt was `age*0.55 + rand*0.3` | Dirt `0.03 + 0.12*rand + 0.5*age²`; rust only above age 0.7 | verified in `lineup_all.png` |

Not checked: shadow acne, wheels sinking or floating (both in `vehicles.js`), and interior and exterior fighting. Headlight flares: there are no flare sprites, only ground pools with `polygonOffset`.

## Built
- The rear end now has separate tail-lamp lens cells (dark mullions), bumper split lines front and rear, an 80s rubber bumper band (era 0), a plate recess pocket and a plate-lamp bar.
- Flatter side walls and a tighter shoulder for every non-boxy body (`model/shell.js` `styleOf`).
- Slightly larger headlamps and grilles.
- New model `tarpon_cabrio` (Tarpon Bayline Cabrio): a 1988 convertible for the ref_51 bar.
- Paint wetness: the global uniform `PAINT_WET` and `setPaintWetness(0..1)` in `model/materials.js`. They add rain beads (bumping the clear-coat normal), darker wet paint and a near-mirror clear coat. **Nothing drives it yet.** Beads were not visible at the test distance, so this is unverified.
- `traffic/smooth.js` `smoothAiControls(v, dt)` adds rate-limited, low-passed steering with yaw damping, plus jerk-limited, signed pedal demand with a coast deadband and a gentle final stop. It is wired by a 2-line hook marked `[vehicles-look hook]` in `vehicles.js`. **It was not measured in game.**

## ref_51 comparison (`cabrio_rear_after.png` against the reference, same rear view): score 4/10
Present: clear coat, invented plate in a recess, separate lens cells, visible shut lines, seats with headrests, dash and steering wheel.
Missing: a proper boxy 80s deck and tail profile, smoked lens depth, a sky reflection (the preview has no sky environment), seat stitching and seated occupants.

## Budget
Measured in the preview: 12 cars came to 468k triangles and 476 draw calls, so about 39k triangles and 40 calls per car at LOD0. That is over the 15 to 30k triangle target, and draw calls need merging.

## Needs from the lead
- Call `setPaintWetness(game.env.weather.wet)` each frame (environment or vehicles.js).
- Use the same staging camera for street shots. My in-game camera override did not take effect, and game loads timed out at a load of about 150, so there are no valid before/after street shots.
