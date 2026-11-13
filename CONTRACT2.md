# WAVE 2 contract (read CONTRACT.md first, then this). Deadline: safe working increments continuously; hard stop 18:40 MST.
Dev server: http://127.0.0.1:5180 (hot reload). NEVER touch port 5173 (user's frozen build).
ATOMIC EDITS ONLY: write temp copy -> esbuild check -> mv. The build must never break. Never edit files you don't own.
Everything ORIGINAL: no names/logos/characters/UI/map from any existing game. Real-world South Florida flavour is fine.
Assets: prefer high-quality CC0 models: Poly Haven models (API: https://api.polyhaven.com/assets?t=models  then https://api.polyhaven.com/files/<id> -> gltf 1k urls incl. bin+textures), Kenney (kenney.nl zips: city-kit-commercial, city-kit-suburban, furniture-kit, nature-kit, car-kit; audio: impact-sounds, rpg-audio, interface-sounds), Quaternius (CC0), ambientCG. Log in CREDITS.md (append). Optimise: instance, merge, small textures (1k max).

## Event bus (in main.js)
game.on(name, fn) ; game.emit(name, data) -> returns false if any listener returned false (veto).
Events:
- 'enterVehicle' {vehicle}           emitted by main before player enters; return false to veto (e.g. carjack animation handles it), then call game.enterVehicle(v) yourself later.
- 'punch' {position, heading}        player punched.
- 'crime' {type, position, severity 1..5, witnessed?:bool}   ANY module emits on crimes: 'assault','carjack','vehicle_theft','shoplift','robbery','shooting','hit_pedestrian','murder','cop_assault'. GAMEPLAY agent listens and drives wanted level.
- 'shot' {origin, dir, weapon}      player fired. peds/vehicles may react.
- 'hit' {target:'ped'|'vehicle'|'world', object, point, normal, damage, kind:'punch'|'bullet'|'melee'|'car'}  for audio/fx.
- 'crash' {vehicle, impulse, point}   vehicles emit on hard impacts.
- 'footstep' {surface:'concrete'|'asphalt'|'sand'|'grass'|'wood'|'tile'|'water'|'metal', position, run:bool}
Global helpers:
- game.enterVehicle(v), game.exitVehicle()
- game.fx (GRAPHICS agent, src/fx/fx.js, created inside createEnvironment): splash(pos, strength), ripple(pos), dust(pos, color), sparks(pos, normal), tireSmoke(pos), smoke(pos)   (all no-ops safe if missing; ALWAYS call as game.fx?.splash?.(...))
- game.audio (PLAYER agent, src/core/audio.js): play(name, {position, volume}) for 'punch_hit','bullet_hit_flesh','pistol','smg','shotgun','car_crash','glass','door','cash','siren','scream','splash', footsteps by surface. Call as game.audio?.play?.(...)
- game.surfaceAt(x, z) -> surface string (CITY agent exports city.surfaceAt; main aliases it)
- game.peds (CHARACTER agent): list; spawnAt(pos, opts{state:'flee'|'walk'|'fight'|'cop', variant, outfit}) -> ped; damage(ped, amount, dir, kind) -> ragdoll when dead; ped fields: pos, state, dead, health, root, isCop
- game.vehicles (VEHICLES agent): list, nearest, spawn(type, pos, heading, {ai:true, police:false}) -> vehicle; vehicle.driver (Object3D|null), vehicle.ejectDriver() -> world pos where the driver stands, vehicle.police, vehicle.siren(on), vehicle.setChaseTarget(vec3|null), vehicle.health, vehicle.locked
- game.interiors (INTERIORS agent): list of shops {name, type, open:bool, hours:[o,c], center:Vector3, isInside(pos), items:[{name, price, pos}], clerk, robbed}
- game.wanted (GAMEPLAY agent): add(stars, position), level, clear()
- game.player.weapon: 'fist'|'bat'|'pistol'|'smg'|'shotgun', game.player.ammo {pistol: n,...}, game.player.inventory
