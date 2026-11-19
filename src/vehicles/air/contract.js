// AIRCRAFT TRACK: internal contract (read this before touching anything in src/vehicles/air).
// This file is the single source of truth for conventions shared by the kit, the models, the flight code,
// the traffic code and air.v2.js. It exports only constants; the long comments are the contract.
//
// ------------------------------------------------------------------------------------------------ AXES / UNITS
// Meters, kilograms, seconds, radians. Model/body space: +Z = nose (forward), +Y = up, +X = LEFT (port) wing.
// (Right-handed, same as cars: a vehicle faces +Z at heading 0, +X is its left.)
// World: x east, z south, y up, sea level y = -0.12. Heading 0 faces +Z (south); heading = atan2(fwd.x, fwd.z).
// The ORIGIN of every airframe (model group and physics body) is its center of gravity (CG) on the centerline.
// fleet.js gives, per aircraft, the hard points every model must honor exactly (gear contact points, prop / rotor
// hubs, seat hip points, door positions) so the physics, the cameras and the model always agree.
//
// ------------------------------------------------------------------------------------------------ FILE LAYOUT
// fleet.js            pure data (no imports): every aircraft type, dimensions, hard points, performance targets.
// flight/params.js    pure data: aerodynamic / rotor / engine tuning per fleet key (owned by the flight code).
// flight/*.js         pure JS + three math only (no DOM, no Rapier): runs in Node for scripted flight tests.
// kit/*.js            browser-side builders (three.js): lofted skins, wings, rivet/panel textures, liveries, parts.
// kit/cockpit.js      instrument panels, gauges, flight controls, seats (works without the rest of the kit).
// models/<key>.js     one file per aircraft type: export function build(THREE, kit, opts) -> AirframeModel.
// models/index.js     registry: key -> lazy import.
// traffic/*.js        airliner / general-aviation / blimp / banner / police-heli brains (kinematic AI).
// air.v2.js           game integration (spawns, enter/exit, cameras, HUD, crimes, game.air API).
// preview.html        studio turntable + flight sandbox; tests/ holds the scripted flight tests.
//
// ------------------------------------------------------------------------------------------------ AirframeModel
// build(THREE, kit, opts = { seed, operator, registration, quality: 'high'|'traffic' }) returns:
// {
//   group,          // Object3D, origin at CG, nose +Z. Must look right with no update() call (parked, engine off).
//   def,            // FLEET[key]
//   identity,       // { registration, operator, seed, liveryName }
//   update(dt, state),   // animate everything from a STATE object (below). Cheap. Never allocates per frame.
//   setDoor(name, t),    // 0 closed .. 1 open
//   seats,          // [{ name:'pilot'|'copilot'|'pax1'.., hip:[x,y,z], yaw }] in body space (pilot first)
//   cameras,        // { cockpit:{ pos:[x,y,z], fov }, chase:{ dist, height, lookAhead }, wing?, gear? }
//   colliders,      // [{ shape:'capsule'|'box'|'ball', ... }] rough collision volumes in body space (see kit)
//   lightsAt,       // world-space helper list for flares: [{ node, kind:'nav_l'|'nav_r'|'tail'|'strobe'|'beacon'|'landing'|'taxi'|'search' }]
//   dispose()
// }
//
// ------------------------------------------------------------------------------------------------ STATE
// One plain object per aircraft, written by the flight sim (or by the traffic AI) and read by model.update(),
// the cameras, the HUD and the AUDIO track. All fields always exist (see makeState()).
export function makeState() {
  return {
    t: 0, // seconds since spawn (drives blinking lights)
    engineOn: false,
    engines: [0], // per engine: 0..1 fraction of max rpm / N1 (piston idle is about 0.25, turbine idle 0.6)
    power: [0], // per engine: 0..1 delivered power / thrust fraction
    rotorRpm: 0, // helicopters: main rotor rpm fraction (1 = 100 %), 0 for planes
    tailRotorRpm: 0,
    throttle: 0, // 0..1 lever
    collective: 0, // 0..1 lever (helicopters)
    pitch: 0,
    roll: 0,
    yaw: 0, // control positions -1..1 (elevator / aileron / rudder or cyclic / pedals) AFTER assists
    flaps: 0, // 0..1 actual
    gear: 1, // 1 = down and locked, 0 = up (fixed gear stays 1)
    gearCompress: [0, 0, 0], // 0..1 per gear point (strut compression)
    wheelSpin: [0, 0, 0], // rad/s per gear point
    steer: 0, // nose / tail wheel angle, rad
    brake: 0,
    ias: 0, // indicated airspeed m/s
    gs: 0, // ground speed m/s
    alt: 0, // meters above sea level
    agl: 0, // meters above the surface below (ground, roof or water)
    vs: 0, // vertical speed m/s
    heading: 0, // rad, 0 = south (+Z), same convention as the game
    pitchAtt: 0,
    rollAtt: 0, // attitude, rad (nose up +, right wing down +)
    slip: 0, // sideslip rad
    aoa: 0, // angle of attack rad
    g: 1, // load factor
    stall: 0, // 0..1 stall warning / buffet
    onGround: false,
    onWater: false,
    waterSpeed: 0, // m/s through the water (floats / hull), for spray
    torque: 0, // 0..1 helicopter transmission torque (or prop torque)
    fuel: 1, // 0..1
    lights: {
      nav: false,
      strobe: false,
      beacon: false,
      landing: false,
      taxi: false,
      cabin: false,
      search: false,
    },
    searchAim: { yaw: 0, pitch: -0.9 }, // searchlight direction in body space (police helicopter)
    night: 0, // 0..1 (0 = day)
    damage: 0, // 0..1 (1 = destroyed)
    smoke: 0,
    fire: 0, // 0..1
    rotorBroken: false,
    propBroken: [false],
    doors: {}, // name -> 0..1
    spray: 0, // crop duster spray 0..1
    hoist: 0, // rescue hoist cable length m
    banner: 0, // banner deployed 0..1
  };
}

// ------------------------------------------------------------------------------------------------ CONTROLS (keyboard + mouse)
// Read by air.v2.js / preview sandbox, turned into sim.input(raw). Arrow keys are avoided (ArrowUp opens the phone).
export const KEYS = {
  throttleUp: 'KeyW',
  throttleDown: 'KeyS', // planes: throttle lever; helicopters: collective (assisted: climb / descend)
  left: 'KeyA',
  right: 'KeyD', // planes: roll (assisted: coordinated turn); helicopters: pedals (yaw)
  yawLeft: 'KeyQ',
  yawRight: 'KeyE', // planes: rudder; helicopters: cyclic roll (strafe) in assisted mode
  pitchUp: 'KeyK',
  pitchDown: 'KeyI',
  rollLeft: 'KeyJ',
  rollRight: 'KeyL', // keyboard stick (mouse does the same)
  brake: 'Space', // wheel brakes; helicopters: hold hover (assisted)
  gear: 'KeyG',
  flapsDown: 'KeyX',
  flapsUp: 'KeyZ',
  camera: 'KeyV',
  lights: 'KeyN',
  search: 'KeyB',
  mode: 'KeyT',
  engine: 'KeyY',
  special: 'KeyR', // R: spray / hoist / banner drop
  exit: 'KeyF', // on the ground; hold 1 s in the air to bail out
};
export const MODES = ['assisted', 'realistic'];

// ------------------------------------------------------------------------------------------------ EVENTS (game bus)
// Emitted by the aircraft track:
//   'crime' { type:'vehicle_theft', position, severity, vehicle }           stealing an aircraft
//   'crash' { vehicle, impulse, dv, speedKmh, point, byPlayer }             hard impacts (same shape as cars)
//   'aircraft:spawned' / 'aircraft:removed' { vehicle }
//   'aircraft:destroyed' { vehicle, position, cause:'crash'|'fire'|'water' }
//   'aircraft:eject' { vehicle, occupant:'player'|ped, position, velocity }  ragdoll / bail-out hook (veto with false)
//   'aircraft:rotorWash' { vehicle, position /* ground point */, radius, strength 0..1, surface }   water / sand / trees react
//   'aircraft:engine' { vehicle, on }      'aircraft:stall' { vehicle }      'aircraft:touchdown' { vehicle, vs, surface }
//   'explosion' { position, radius, source }                                 fuel fire reaches the tank
// Listened to: 'crime' (news helicopter for big ones), 'hit' { target:'vehicle', object } (bullet damage), 'medevac' { position }.
export const AIR_VERSION = 1;
