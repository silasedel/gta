# src/vehicles/physics (r2-physics)

Car dynamics and world collision fidelity. Loaded by `physics.v2.js` (order 5); the controller is wired into `vehicles.js`
`makeController()`.

| File | What |
|---|---|
| `suspension.js` | `createShapeVehicle(game, body, wheels, spec, restLen, stiff)`: shape-cast suspension and tire model ("carphys 2"), with the same API as Rapier's ray-cast vehicle controller |
| `relief.js` | Road relief that the tires feel but that has no collider triangles: pothole bowls (a port of the decal shader's depth function), patched potholes, manhole seats, speed humps. `game.physics.relief / addRelief / reliefDip / reliefNear` |
| `rocks.js` | Streams static convex-hull colliders for the rendered ground-cover rocks within 70 m (`game.vegetation.rocksNear`) |
| `clearance.js` | Parked-car spawn checks: `game.physics.clearForCar`, `findCarSpot`, `watchParked` |
| `overlay.js` | Collider audit overlay: `?colliders=1`, F9, or `game.physics.colliderOverlay.enable(true, { radius })` |

Switches:
- `?carphys=2` selects the shape-cast physics; `?carphys=1` selects the Rapier ray-cast controller.
- `game.physics.setCarPhysics(1|2)` switches at runtime (A/B in one session) and rebuilds every live controller.

## Model (carphys 2), per wheel and fixed tick
1. **Contact.** A rounded cylinder (tire radius, 90 % of tire width) is swept down the suspension axis, starting one
   tire radius above full bump. The contact normal comes from the hit, so a curb edge pushes the wheel up and back.
   The cast looks past faces beside the tire, such as the curb face when the car drives along a curb.
   Cars more than 70 m from the player use one ray per wheel instead.
2. **Vertical.** A quarter car: unsprung mass on a tire spring and damper.
   - Coil spring: the class ride frequency comes from `spec.susp`, and the preload keeps the old ride height.
   - Damper: separate bump and rebound rates, digressive above 0.2 m/s.
   - Bump stop: progressive over the last 45 % of travel, with a hard stop at `spec.archGap + 1.5 cm`.
   - Droop limit and an anti-roll bar per axle.
   - The wheel solve runs 4 substeps per tick.
3. **Tires.** Lateral force follows a brush curve on slip angle: peak at 6-8 deg, falling to 82 % when sliding.
   - Relaxation-length lag, load-sensitive mu, and a friction ellipse with drive, brake and rolling resistance.
   - Surface: `game.surfaceAt`, sampled at 5 Hz per wheel, sets mu, rolling resistance and roughness.
   - Rain wetness (`WEATHER_U[0]`) lowers mu.
   - Sand's soft-ground model belongs to r2-cars (`v.soft` in vehicles.js) and stays on top.
4. **Body motion.** Pitch and roll come from the forces themselves: brake dive, throttle squat and cornering lean (with
   a little anti-dive and roll-center height). The old fake shell sway is off while carphys 2 runs.

## Tests
- `node tools/v2/physics/lab.mjs --phys 2 --tests curb20,curb40,pothole30,rock25,bump30 --strips` records every tick
  and writes strips by exact pose replay. `--phys 1` runs the same tests on the old controller.
- `node tools/v2/physics/sheet.mjs` builds the review sheets (strip + travel / pitch / roll / accel / speed plots).
- `node tools/v2/physics/colaudit.mjs` takes overlay shots and runs the mesh-vs-collider ray sweep (walk-through and
  invisible-wall finder).
