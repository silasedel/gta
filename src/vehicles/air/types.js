// r4-air: flyable aircraft types (pure data). Models are the user's library planes converted by tools/v2/air/convert_planes.py
// into public/assets/vehicles/air/<glb>.glb (frame: +Z nose, +Y up, +X left wing, y = 0 at the lowest gear / float contact).
// Every point below is in that GLB frame; `cg` is where the physics body sits (the sim works around the CG).
// Brands and model names are invented for Southline (see fleet.js).
const v3 = (x, y, z) => [x, y, z];
// a fighter entry from a few measured numbers (GLB frame, y = 0 on the wheels): length / span / height, nose wheel [z, r],
// main wheels [x, z, r], seat [y, z], single or twin fins
function fighter(o) {
  const hl = o.L / 2, hs = o.span / 2, m = o.mass;
  return {
    glb: o.glb, lod1: o.glb + '_lod1', brand: 'Biscayne Aerospace', model: o.model, cls: 'jet', engine: 'electric', idleRpm: 3500, maxRpm: 14000, military: true,
    mass: m, I: [m * 8, m * 14, m * 6.5], S: o.span * 5.8, CL0: 0.1, CLa: 4.4, aStall: 0.4, CD0: 0.021, K: 0.085, flapCL: 0.35, flapCD: 0.05,
    thrust: o.thrust, vThrust: 560, rates: { pitch: 1.35, roll: 3.0, yaw: 0.5 }, Ka: 2.6, Kb: 3.2, aTrim: 0.03, vRef: 72, vRot: 66,
    cg: v3(0, 1.9, -0.4),
    gear: [{ p: v3(0, 0, o.nose[0]), steer: 1, r: o.nose[1] }, { p: v3(o.main[0], 0, o.main[1]), brake: 1, r: o.main[2] }, { p: v3(-o.main[0], 0, o.main[1]), brake: 1, r: o.main[2] }],
    k: m * 48, c: m * 5.8,
    probes: { nose: v3(0, 1.6, hl - 0.1), tail: v3(0, 1.9, -hl + 0.2), fin: v3(0, o.h - 0.1, -hl + 2.6), tipL: v3(hs - 0.1, 1.9, -2.6), tipR: v3(-hs + 0.1, 1.9, -2.6), belly: v3(0, 0.95, 0) },
    props: [], exhaust: [v3(0, 1.8, -hl + 0.6)], tips: [v3(hs - 0.1, 1.9, -2.8), v3(-hs + 0.1, 1.9, -2.8)],
    seat: v3(0, o.seat[0], o.seat[1]), exit: v3(3.2, 0, o.seat[1] - 1), half: v3(1.3, 1.4, hl), wing: { y: 1.9, z: -1.6, span: o.span, chord: 4.6 },
    chase: { dist: 20, height: 5 },
    hit: [[0, 1.8, 0, 1.2, 0.8, hl - 0.4], [hs / 2 + 0.6, 1.85, -1.8, hs / 2 - 0.6, 0.18, 2.4, 1], o.fins === 1 ? [0, (o.h + 2.4) / 2, -hl + 2.2, 0.15, (o.h - 2.4) / 2, 1.2] : [1.4, (o.h + 2.4) / 2, -hl + 2.4, 0.15, (o.h - 2.4) / 2, 1.0, 1],
      [o.main[0], 0.45, o.main[1], 0.2, 0.45, 0.4, 1], [0, 0.4, o.nose[0], 0.15, 0.4, 0.3]],
  };
}
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
    // hitboxes (model frame, [cx, cy, cz, hx, hy, hz]; m: 1 = also mirrored in x): fitted to slices of the real mesh (Nov 18), not one big box
    hit: [[0, 1.33, 0.75, 0.6, 0.78, 1.5], [0, 0.88, 3.1, 0.6, 0.88, 0.85], [0, 1.3, -1.9, 0.38, 0.32, 1.15], [0, 2.08, -3.45, 0.26, 0.89, 0.45],
      [0, 1.66, -3.0, 2.04, 0.32, 0.75], [0, 1.9, 1.15, 5.58, 0.13, 1.13], [1.34, 0.32, 1.2, 0.15, 0.32, 0.32, 1], [0, 0.32, 3.0, 0.12, 0.32, 0.3]],
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
    hit: [[0, 2.03, 1.28, 0.78, 0.68, 2.0], [0, 2.95, -3.4, 1.7, 0.9, 1.1], [0, 2.4, -1.5, 0.22, 0.3, 0.75], [0, 2.66, 1.1, 5.43, 0.14, 1.15],
      [0.95, 0.35, 1.6, 0.3, 0.35, 2.8, 1]],
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
    hit: [[0, 2.9, 4.0, 1.3, 1.5, 6.5], [0, 2.9, 12.0, 0.85, 1.0, 1.5], [0, 3.65, -6.1, 1.0, 0.95, 3.6], [0, 5.4, -10.0, 0.4, 2.2, 2.0],
      [0, 6.8, -11.4, 4.3, 0.3, 1.4], [2.0, 3.7, -5.3, 0.55, 0.6, 2.3, 1], [4.4, 2.5, 0.6, 3.1, 0.15, 2.7, 1], [10.3, 2.5, -3.5, 2.9, 0.15, 2.0, 1],
      [2.0, 0.5, -0.1, 0.2, 0.5, 0.45, 1], [0, 0.4, 9.4, 0.15, 0.4, 0.32]],
  },
  // W6 (airports agent, Nov 19): the military air base's stealable fighters (the user's downloaded F-16 / F-22 / F-35
  // models, converted by tools/v2/airport/convert_w6.py: insignia painted out, 2K atlas, far LOD <glb>_lod1 used by base.js).
  // Invented names; arcade fighter numbers (light for the thrust, quick roll). Gear / seat points measured on the GLBs.
  jet_f16: fighter({
    glb: 'jet_f16',
    model: 'Kestrel F-6',
    L: 15.1,
    span: 9.4,
    h: 5.2,
    nose: [2.16, 0.3],
    main: [1.07, -1.85, 0.38],
    seat: [2.2, 3.0],
    fins: 1,
    mass: 12000,
    thrust: 125000,
  }),
  jet_f22: fighter({
    glb: 'jet_f22',
    model: 'Stingray F-9',
    L: 19.0,
    span: 13.6,
    h: 5.2,
    nose: [3.86, 0.32],
    main: [1.59, -2.16, 0.42],
    seat: [2.5, 5.0],
    fins: 2,
    mass: 19000,
    thrust: 190000,
  }),
  jet_f35: fighter({
    glb: 'jet_f35',
    model: 'Manta F-11',
    L: 15.7,
    span: 13.2,
    h: 5.3,
    nose: [3.79, 0.3],
    main: [2.17, -2.06, 0.45],
    seat: [2.6, 4.3],
    fins: 2,
    mass: 16000,
    thrust: 160000,
  }),
};
