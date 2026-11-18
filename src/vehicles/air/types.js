// r4-air: flyable aircraft types (pure data). Models are the user's library planes converted by tools/v2/air/convert_planes.py
// into public/assets/vehicles/air/<glb>.glb (frame: +Z nose, +Y up, +X left wing, y = 0 at the lowest gear / float contact).
// Every point below is in that GLB frame; `cg` is where the physics body sits (the sim works around the CG).
// Brands and model names are invented for Southline (see fleet.js).
const v3 = (x, y, z) => [x, y, z];
export const AIR_TYPES = {
  prop: {
    glb: 'prop', brand: 'Caloosa Aircraft', model: 'Skimmer 210', cls: 'plane', engine: 'flat6', idleRpm: 700, maxRpm: 2700,
    mass: 1250, I: [2200, 3000, 1600], S: 16.2, CL0: 0.28, CLa: 5.0, aStall: 0.27, CD0: 0.03, K: 0.055, flapCL: 0.45, flapCD: 0.085,
    thrust: 6800, vThrust: 118, rates: { pitch: 1.05, roll: 2.1, yaw: 0.6 }, Ka: 2.2, Kb: 2.6, aTrim: 0.04, vRef: 34, vRot: 27,
    cg: v3(0, 1.25, 1.62),
    gear: [{ p: v3(0, 0, 3.0), steer: 1 }, { p: v3(1.34, 0.06, 1.2), brake: 1 }, { p: v3(-1.34, 0.06, 1.2), brake: 1 }],
    k: 70000, c: 7000,
    probes: { nose: v3(0, 1.0, 4.25), tail: v3(0, 0.85, -4.1), fin: v3(0, 2.9, -3.75), tipL: v3(5.55, 1.95, 1.15), tipR: v3(-5.55, 1.95, 1.15), belly: v3(0, 0.55, 0.4) },
    props: [{ node: 'PROP0', r: 0.95 }], exhaust: [v3(0.22, 0.52, 3.45)], tips: [v3(5.55, 1.93, 1.0), v3(-5.55, 1.93, 1.0)],
    seat: v3(0.28, 1.15, 1.65), exit: v3(2.1, 0, 1.6), half: v3(1.1, 1.2, 4.2), wing: { y: 1.9, z: 1.2, span: 11.1, chord: 1.6 },
    chase: { dist: 13, height: 3.4 },
  },
  floatplane: {
    glb: 'floatplane', brand: 'Matecumbe Aeromarine', model: 'Skipjack Float', cls: 'seaplane', engine: 'flat6', idleRpm: 650, maxRpm: 2300,
    mass: 2050, I: [4200, 5600, 3000], S: 23, CL0: 0.3, CLa: 5.0, aStall: 0.28, CD0: 0.045, K: 0.06, flapCL: 0.5, flapCD: 0.085,
    thrust: 11000, vThrust: 108, rates: { pitch: 0.95, roll: 1.75, yaw: 0.55 }, Ka: 2.2, Kb: 2.6, aTrim: 0.05, vRef: 34, vRot: 26,
    cg: v3(0, 1.8, 1.75),
    floats: [v3(0.95, 0.0, 1.95), v3(-0.95, 0.0, 1.95), v3(0.95, 0.15, 3.7), v3(-0.95, 0.15, 3.7), v3(0.95, 0.32, -1.05), v3(-0.95, 0.32, -1.05)],
    stepIdx: [0, 1], k: 60000, c: 9000,
    probes: { nose: v3(0, 1.9, 3.5), tail: v3(0, 1.75, -4.0), fin: v3(0, 3.85, -3.7), tipL: v3(5.4, 2.7, 1.0), tipR: v3(-5.4, 2.7, 1.0), belly: v3(0, 1.0, 1.0) },
    props: [{ node: 'PROP0', r: 1.17 }], exhaust: [v3(0.26, 1.35, 3.0)], tips: [v3(5.4, 2.68, 0.9), v3(-5.4, 2.68, 0.9)],
    seat: v3(0.27, 2.0, 1.75), exit: v3(2.2, 0, 1.8), half: v3(1.2, 1.9, 4.1), wing: { y: 2.65, z: 1.0, span: 10.8, chord: 1.6 },
    chase: { dist: 14, height: 3.8 },
  },
  bizjet: {
    glb: 'bizjet', brand: 'Biscayne Aerospace', model: 'Solstice 45', cls: 'jet', engine: 'electric', idleRpm: 3000, maxRpm: 12000,
    mass: 15000, I: [90000, 160000, 70000], S: 50, CL0: 0.2, CLa: 5.2, aStall: 0.25, CD0: 0.022, K: 0.045, flapCL: 0.55, flapCD: 0.065,
    thrust: 82000, vThrust: 340, rates: { pitch: 0.7, roll: 1.5, yaw: 0.32 }, Ka: 2.4, Kb: 3.0, aTrim: 0.04, vRef: 70, vRot: 58,
    // the library jet ships with its gear up: the game adds struts + wheels (raised by gearH) and retracts them (G)
    gearH: 1.35, retract: true,
    cg: v3(0, 2.6, 1.4),
    gear: [{ p: v3(0, 0, 9.4), steer: 1, r: 0.32 }, { p: v3(2.0, 0, -0.1), brake: 1, r: 0.45 }, { p: v3(-2.0, 0, -0.1), brake: 1, r: 0.45 }],
    k: 700000, c: 90000,
    probes: { nose: v3(0, 2.3, 13.0), tail: v3(0, 2.6, -12.8), fin: v3(0, 7.5, -11.5), tipL: v3(13.1, 2.4, -2.5), tipR: v3(-13.1, 2.4, -2.5), belly: v3(0, 1.3, 2.0) },
    props: [], exhaust: [v3(1.7, 3.45, -9.8), v3(-1.7, 3.45, -9.8)], tips: [v3(13.1, 2.5, -3.0), v3(-13.1, 2.5, -3.0)],
    seat: v3(0.4, 2.7, 9.5), exit: v3(3.0, 0, 8.0), half: v3(1.6, 2.4, 13.0), wing: { y: 2.4, z: 0.5, span: 26.2, chord: 3.2 },
    chase: { dist: 32, height: 7.5 },
  },
};
