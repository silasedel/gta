// AIRCRAFT FLEET: pure data, no imports (Node-importable). Owned by the aircraft track lead; models and flight code read it.
// All coordinates are body space (see contract.js): origin = CG, +Z nose, +Y up, +X LEFT. Meters, kg, kW, m/s.
// Every maker / model / operator name here is invented for Southline. None is a replica of a real aircraft type:
// they are original designs in real categories.
//
// Hard points (models MUST match these exactly, physics and cameras rely on them):
//   gear.points[i].p  = tire / skid / keel contact point with the strut fully extended (static load compresses ~35 % of travel)
//   hard.prop[i]      = propeller hub center, hard.rotor = main rotor hub center (blade plane), hard.tailRotor = tail rotor / fan center
//   seats[i].hip      = seat hip point (pilot first). Planes: pilot sits LEFT (+X). Helicopters: pilot sits RIGHT (-X).
//   rest              = { cgY: CG height above the surface when parked, pitchDeg: nose-up ground attitude }
// perf (m/s unless noted) are the TARGETS the flight tuning must hit and the scripted tests check.

const KT = 0.5144;
export const FLEET = {
  // ------------------------------------------------------------------ HELICOPTERS
  heli_piston: {
    key: 'heli_piston', maker: 'Okeelanta Rotorcraft', name: 'Limpkin 2', role: 'Two-seat piston trainer / runabout', category: 'heli',
    dims: { length: 6.75, rotorD: 7.7, height: 2.75, cabinW: 1.15 }, mass: { empty: 420, max: 650, typical: 600 }, crew: 1, pax: 1,
    engine: { type: 'piston', count: 1, powerKW: 100, rotorRpm: 510, sound: 'flat4' },
    hard: { rotor: [0, 1.55, 0.05], rotorR: 3.85, rotorBlades: 2, tailRotor: [0.22, 0.25, -4.45], tailRotorR: 0.55, tailBlades: 2, tailKind: 'open', nose: 1.75, tail: -5.0 },
    gear: { type: 'skid', retract: false, travel: 0.12, points: [
      { name: 'skidFL', p: [0.96, -1.15, 0.95] }, { name: 'skidFR', p: [-0.96, -1.15, 0.95] },
      { name: 'skidRL', p: [0.96, -1.15, -0.75] }, { name: 'skidRR', p: [-0.96, -1.15, -0.75] }] },
    rest: { cgY: 1.13, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [-0.3, -0.35, 0.55] }, { name: 'copilot', hip: [0.3, -0.35, 0.55] }],
    doors: [{ name: 'doorR', side: -1, z: 0.6, seat: 0 }, { name: 'doorL', side: 1, z: 0.6, seat: 1 }],
    perf: { vCruise: 46, vMax: 53, vne: 56, climb: 5, hoverCeilingIGE: 1800, autorotVs: -8.5, autorotIas: 33 },
    price: 320000,
  },
  heli_light: {
    key: 'heli_light', maker: 'Okeelanta Rotorcraft', name: 'Anhinga 5T', role: 'Five-seat turbine: news, tours, charter', category: 'heli',
    dims: { length: 9.9, rotorD: 10.7, height: 3.2, cabinW: 1.75 }, mass: { empty: 1250, max: 2250, typical: 1900 }, crew: 1, pax: 4,
    engine: { type: 'turbine', count: 1, powerKW: 630, rotorRpm: 390, sound: 'turboshaft' },
    hard: { rotor: [0, 1.75, 0.05], rotorR: 5.35, rotorBlades: 3, tailRotor: [0.28, 0.55, -6.25], tailRotorR: 0.93, tailBlades: 2, tailKind: 'open', nose: 2.9, tail: -7.0, camera: [0, -1.05, 2.45] },
    gear: { type: 'skid', retract: false, travel: 0.14, points: [
      { name: 'skidFL', p: [1.1, -1.35, 1.3] }, { name: 'skidFR', p: [-1.1, -1.35, 1.3] },
      { name: 'skidRL', p: [1.1, -1.35, -0.9] }, { name: 'skidRR', p: [-1.1, -1.35, -0.9] }] },
    rest: { cgY: 1.33, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [-0.36, -0.42, 1.05] }, { name: 'copilot', hip: [0.36, -0.42, 1.05] },
      { name: 'pax1', hip: [-0.5, -0.42, 0.0] }, { name: 'pax2', hip: [0, -0.42, 0.0] }, { name: 'pax3', hip: [0.5, -0.42, 0.0] }],
    doors: [{ name: 'doorR', side: -1, z: 1.05, seat: 0 }, { name: 'doorL', side: 1, z: 1.05, seat: 1 }, { name: 'cabinR', side: -1, z: 0.05, seat: 2 }, { name: 'cabinL', side: 1, z: 0.05, seat: 4 }],
    perf: { vCruise: 64, vMax: 75, vne: 80, climb: 9, autorotVs: -9.5, autorotIas: 36 },
    price: 2400000,
  },
  heli_police: {
    key: 'heli_police', maker: 'Okeelanta Rotorcraft', name: 'Gallinule 4P', role: 'Police patrol helicopter with searchlight and camera turret', category: 'heli',
    dims: { length: 9.4, rotorD: 10.2, height: 3.3, cabinW: 1.6 }, mass: { empty: 1300, max: 2400, typical: 2100 }, crew: 2, pax: 2,
    engine: { type: 'turbine', count: 1, powerKW: 600, rotorRpm: 400, sound: 'turboshaft' },
    hard: { rotor: [0, 1.6, 0.05], rotorR: 5.1, rotorBlades: 4, tailRotor: [-0.25, 0.5, -5.9], tailRotorR: 0.85, tailBlades: 2, tailKind: 'open', nose: 2.75, tail: -6.65,
      searchlight: [0.55, -0.98, 1.6], camera: [0, -1.02, 2.2], speaker: [-0.6, -0.95, 1.2] },
    gear: { type: 'skid', retract: false, travel: 0.16, points: [
      { name: 'skidFL', p: [1.15, -1.55, 1.25] }, { name: 'skidFR', p: [-1.15, -1.55, 1.25] },
      { name: 'skidRL', p: [1.15, -1.55, -0.85] }, { name: 'skidRR', p: [-1.15, -1.55, -0.85] }] },
    rest: { cgY: 1.53, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [-0.36, -0.45, 1.0] }, { name: 'copilot', hip: [0.36, -0.45, 1.0] }, { name: 'pax1', hip: [-0.4, -0.45, -0.05] }, { name: 'pax2', hip: [0.4, -0.45, -0.05] }],
    doors: [{ name: 'doorR', side: -1, z: 1.0, seat: 0 }, { name: 'doorL', side: 1, z: 1.0, seat: 1 }, { name: 'cabinR', side: -1, z: 0.0, seat: 2 }, { name: 'cabinL', side: 1, z: 0.0, seat: 3 }],
    perf: { vCruise: 62, vMax: 72, vne: 78, climb: 9.5, autorotVs: -9.5, autorotIas: 35 },
    price: 3100000,
  },
  heli_twin: {
    key: 'heli_twin', maker: 'Okeelanta Rotorcraft', name: 'Spoonbill 900', role: 'Twin-turbine executive helicopter (also medevac)', category: 'heli',
    dims: { length: 12.0, rotorD: 12.0, height: 3.6, cabinW: 2.0 }, mass: { empty: 2700, max: 4600, typical: 4000 }, crew: 2, pax: 6,
    engine: { type: 'turbine', count: 2, powerKW: 560, rotorRpm: 350, sound: 'turboshaft_twin' },
    hard: { rotor: [0, 1.85, 0.1], rotorR: 6.0, rotorBlades: 5, tailRotor: [0, 0.75, -7.1], tailRotorR: 0.55, tailBlades: 10, tailKind: 'ducted', nose: 3.9, tail: -8.1 },
    gear: { type: 'tricycle', retract: true, travel: 0.22, points: [
      { name: 'nose', p: [0, -1.55, 3.0], r: 0.2, castor: true }, { name: 'mainL', p: [1.15, -1.55, -0.75], r: 0.25, brake: true }, { name: 'mainR', p: [-1.15, -1.55, -0.75], r: 0.25, brake: true }] },
    rest: { cgY: 1.5, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [-0.4, -0.5, 1.9] }, { name: 'copilot', hip: [0.4, -0.5, 1.9] },
      { name: 'pax1', hip: [-0.55, -0.5, 0.65], yaw: Math.PI }, { name: 'pax2', hip: [0, -0.5, 0.65], yaw: Math.PI }, { name: 'pax3', hip: [0.55, -0.5, 0.65], yaw: Math.PI },
      { name: 'pax4', hip: [-0.55, -0.5, -0.65] }, { name: 'pax5', hip: [0, -0.5, -0.65] }, { name: 'pax6', hip: [0.55, -0.5, -0.65] }],
    doors: [{ name: 'doorR', side: -1, z: 1.9, seat: 0 }, { name: 'doorL', side: 1, z: 1.9, seat: 1 }, { name: 'cabinR', side: -1, z: 0.0, seat: 2, slide: true }, { name: 'cabinL', side: 1, z: 0.0, seat: 4, slide: true }],
    perf: { vCruise: 75, vMax: 86, vne: 90, climb: 11, autorotVs: -10.5, autorotIas: 40 },
    price: 9800000,
  },
  heli_rescue: {
    key: 'heli_rescue', maker: 'Matecumbe Aeromarine', name: 'Frigate SAR', role: 'Coast-guard-style medium rescue helicopter with hoist', category: 'heli',
    dims: { length: 14.6, rotorD: 14.6, height: 4.6, cabinW: 2.2 }, mass: { empty: 3900, max: 6800, typical: 5800 }, crew: 3, pax: 6,
    engine: { type: 'turbine', count: 2, powerKW: 900, rotorRpm: 290, sound: 'turboshaft_twin' },
    hard: { rotor: [0, 2.15, 0.1], rotorR: 7.3, rotorBlades: 4, tailRotor: [0.35, 1.5, -8.9], tailRotorR: 1.35, tailBlades: 4, tailKind: 'open', nose: 4.6, tail: -10.0,
      hoist: [-1.05, 1.35, 0.9], searchlight: [0, -1.25, 3.4], radome: [0, -0.35, 4.3] },
    gear: { type: 'tricycle', retract: false, travel: 0.28, points: [
      { name: 'nose', p: [0, -1.75, 3.6], r: 0.22, castor: true }, { name: 'mainL', p: [1.45, -1.75, -1.1], r: 0.3, brake: true }, { name: 'mainR', p: [-1.45, -1.75, -1.1], r: 0.3, brake: true }] },
    rest: { cgY: 1.68, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [-0.45, -0.45, 2.5] }, { name: 'copilot', hip: [0.45, -0.45, 2.5] }, { name: 'hoistOp', hip: [-0.5, -0.5, 0.6], yaw: -Math.PI / 2 },
      { name: 'pax1', hip: [0.75, -0.5, 0.2], yaw: -Math.PI / 2 }, { name: 'pax2', hip: [0.75, -0.5, -0.5], yaw: -Math.PI / 2 }, { name: 'pax3', hip: [0.75, -0.5, -1.2], yaw: -Math.PI / 2 }],
    doors: [{ name: 'doorR', side: -1, z: 2.5, seat: 0 }, { name: 'doorL', side: 1, z: 2.5, seat: 1 }, { name: 'cabinR', side: -1, z: 0.5, seat: 2, slide: true }],
    perf: { vCruise: 72, vMax: 84, vne: 88, climb: 9, autorotVs: -11, autorotIas: 41 },
    price: 0,
  },
  // ------------------------------------------------------------------ PISTON / TURBOPROP PLANES
  plane_trainer: {
    key: 'plane_trainer', maker: 'Caloosa Aircraft', name: 'Skimmer', role: 'High-wing four-seat trainer', category: 'plane',
    dims: { length: 8.2, span: 10.9, height: 2.7, cabinW: 1.05 }, mass: { empty: 770, max: 1110, typical: 1000 }, crew: 1, pax: 3,
    engine: { type: 'piston', count: 1, powerKW: 134, propRpm: 2700, sound: 'flat4' },
    hard: { prop: [[0, 0.12, 2.52]], propD: 1.9, propBlades: 2, nose: 2.75, tail: -5.45 },
    wing: { layout: 'high', strut: true, area: 16.2, span: 10.9, mac: 1.49, y: 0.92, z: 0.08, dihedralDeg: 1.5, sweepDeg: 0, taper: 0.72 },
    tail: { layout: 'conventional', hArea: 3.4, hArm: 4.55, hY: 0.05, vArea: 1.7, vArm: 4.7, vY: 0.9 },
    gear: { type: 'tricycle', retract: false, travel: 0.25, points: [
      { name: 'nose', p: [0, -1.2, 1.55], r: 0.17, steer: true }, { name: 'mainL', p: [1.27, -1.2, -0.38], r: 0.2, brake: true }, { name: 'mainR', p: [-1.27, -1.2, -0.38], r: 0.2, brake: true }] },
    rest: { cgY: 1.12, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.28, -0.25, 0.45] }, { name: 'copilot', hip: [-0.28, -0.25, 0.45] }, { name: 'pax1', hip: [0.28, -0.25, -0.45] }, { name: 'pax2', hip: [-0.28, -0.25, -0.45] }],
    doors: [{ name: 'doorL', side: 1, z: 0.5, seat: 0 }, { name: 'doorR', side: -1, z: 0.5, seat: 1 }],
    perf: { vStall: 26, vStallFlaps: 24, vRotate: 28, vCruise: 59, vMax: 68, vne: 84, vApproach: 33, climb: 3.7, rollRateDeg: 60 },
    price: 210000,
  },
  plane_tourer: {
    key: 'plane_tourer', maker: 'Caloosa Aircraft', name: 'Tarpon GT', role: 'Low-wing retractable four-seat tourer', category: 'plane',
    dims: { length: 7.9, span: 10.4, height: 2.6, cabinW: 1.1 }, mass: { empty: 980, max: 1450, typical: 1300 }, crew: 1, pax: 3,
    engine: { type: 'piston', count: 1, powerKW: 230, propRpm: 2700, sound: 'flat6' },
    hard: { prop: [[0, 0.05, 2.45]], propD: 1.95, propBlades: 3, nose: 2.7, tail: -5.2 },
    wing: { layout: 'low', strut: false, area: 14.6, span: 10.4, mac: 1.45, y: -0.42, z: 0.05, dihedralDeg: 6, sweepDeg: 0, taper: 0.55 },
    tail: { layout: 'conventional', hArea: 3.1, hArm: 4.3, hY: 0.25, vArea: 1.5, vArm: 4.4, vY: 0.95 },
    gear: { type: 'tricycle', retract: true, travel: 0.22, points: [
      { name: 'nose', p: [0, -1.1, 1.6], r: 0.17, steer: true }, { name: 'mainL', p: [1.6, -1.1, -0.35], r: 0.2, brake: true }, { name: 'mainR', p: [-1.6, -1.1, -0.35], r: 0.2, brake: true }] },
    rest: { cgY: 1.03, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.27, -0.2, 0.3] }, { name: 'copilot', hip: [-0.27, -0.2, 0.3] }, { name: 'pax1', hip: [0.27, -0.2, -0.6] }, { name: 'pax2', hip: [-0.27, -0.2, -0.6] }],
    doors: [{ name: 'canopy', side: 0, z: 0.0, seat: 0, slide: true }],
    perf: { vStall: 32, vStallFlaps: 29, vRotate: 34, vCruise: 85, vMax: 98, vne: 110, vApproach: 39, climb: 5.5, rollRateDeg: 80 },
    price: 480000,
  },
  plane_biplane: {
    key: 'plane_biplane', maker: 'Caloosa Aircraft', name: 'Mockingbird', role: 'Two-seat aerobatic biplane', category: 'plane',
    dims: { length: 5.9, span: 6.1, height: 2.0, cabinW: 0.72 }, mass: { empty: 520, max: 740, typical: 680 }, crew: 1, pax: 1,
    engine: { type: 'piston', count: 1, powerKW: 195, propRpm: 2700, sound: 'flat6_aerobatic' },
    hard: { prop: [[0, 0.0, 1.85]], propD: 1.9, propBlades: 2, nose: 2.2, tail: -3.7 },
    wing: { layout: 'biplane', strut: true, area: 11.6, span: 6.1, mac: 0.95, y: 0.85, z: 0.45, lower: { span: 5.7, y: -0.45, z: 0.0 }, dihedralDeg: 1.5, sweepDeg: 6, taper: 1 },
    tail: { layout: 'conventional', hArea: 1.9, hArm: 3.3, hY: 0.1, vArea: 1.0, vArm: 3.5, vY: 0.6 },
    gear: { type: 'tailwheel', retract: false, travel: 0.16, points: [
      { name: 'mainL', p: [0.85, -1.05, 0.55], r: 0.19, brake: true }, { name: 'mainR', p: [-0.85, -1.05, 0.55], r: 0.19, brake: true }, { name: 'tail', p: [0, -0.45, -3.55], r: 0.07, steer: true, castor: true }] },
    rest: { cgY: 0.93, pitchDeg: 8.3 },
    seats: [{ name: 'pilot', hip: [0, -0.25, -0.75] }, { name: 'pax1', hip: [0, -0.25, 0.05] }],
    doors: [{ name: 'canopy', side: 0, z: -0.4, seat: 0, slide: false }],
    perf: { vStall: 27, vStallFlaps: 27, vRotate: 30, vCruise: 72, vMax: 88, vne: 103, vApproach: 38, climb: 13, rollRateDeg: 300 },
    price: 390000,
  },
  plane_twin: {
    key: 'plane_twin', maker: 'Caloosa Aircraft', name: 'Kingfish Twin', role: 'Six-seat piston twin', category: 'plane',
    dims: { length: 9.1, span: 11.9, height: 3.0, cabinW: 1.15 }, mass: { empty: 1650, max: 2500, typical: 2200 }, crew: 1, pax: 5,
    engine: { type: 'piston', count: 2, powerKW: 230, propRpm: 2700, sound: 'flat6' },
    hard: { prop: [[1.85, -0.2, 2.05], [-1.85, -0.2, 2.05]], propD: 1.95, propBlades: 3, nose: 3.6, tail: -5.5 },
    wing: { layout: 'low', strut: false, area: 18.6, span: 11.9, mac: 1.62, y: -0.45, z: 0.05, dihedralDeg: 6, sweepDeg: 0, taper: 0.5 },
    tail: { layout: 'conventional', hArea: 4.2, hArm: 5.0, hY: 0.3, vArea: 2.4, vArm: 5.1, vY: 1.1 },
    gear: { type: 'tricycle', retract: true, travel: 0.25, points: [
      { name: 'nose', p: [0, -1.25, 2.6], r: 0.18, steer: true }, { name: 'mainL', p: [1.85, -1.25, -0.45], r: 0.23, brake: true }, { name: 'mainR', p: [-1.85, -1.25, -0.45], r: 0.23, brake: true }] },
    rest: { cgY: 1.17, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.3, -0.2, 0.9] }, { name: 'copilot', hip: [-0.3, -0.2, 0.9] }, { name: 'pax1', hip: [0.3, -0.2, -0.1] }, { name: 'pax2', hip: [-0.3, -0.2, -0.1] }, { name: 'pax3', hip: [0.3, -0.2, -1.0] }, { name: 'pax4', hip: [-0.3, -0.2, -1.0] }],
    doors: [{ name: 'doorR', side: -1, z: 0.9, seat: 1 }, { name: 'cabinL', side: 1, z: -0.5, seat: 2 }],
    perf: { vStall: 36, vStallFlaps: 33, vRotate: 40, vCruise: 93, vMax: 108, vne: 120, vApproach: 46, climb: 7.5, rollRateDeg: 70 },
    price: 890000,
  },
  seaplane: {
    key: 'seaplane', maker: 'Matecumbe Aeromarine', name: 'Skipjack 8', role: 'Eight-seat turboprop floatplane', category: 'seaplane',
    dims: { length: 11.5, span: 15.9, height: 5.1, cabinW: 1.55 }, mass: { empty: 2150, max: 3600, typical: 3200 }, crew: 1, pax: 7,
    engine: { type: 'turboprop', count: 1, powerKW: 560, propRpm: 1900, sound: 'turboprop' },
    hard: { prop: [[0, 0.15, 3.75]], propD: 2.6, propBlades: 3, nose: 4.0, tail: -7.5 },
    wing: { layout: 'high', strut: true, area: 26, span: 15.9, mac: 1.66, y: 0.85, z: 0.1, dihedralDeg: 2.5, sweepDeg: 0, taper: 0.7 },
    tail: { layout: 'conventional', hArea: 6.5, hArm: 6.4, hY: 0.25, vArea: 3.6, vArm: 6.6, vY: 1.2 },
    // Twin floats: centerlines x = +-1.6, bow z = +4.4, stern z = -3.2, step at z = -0.15, max beam 0.95, depth 0.85 (about 3.7 m3 each).
    gear: { type: 'floats', retract: false, travel: 0, floats: { x: 1.6, bowZ: 4.4, sternZ: -3.2, stepZ: -0.15, beam: 0.95, depth: 0.85, keelY: -2.55, deckY: -1.7, volume: 3.7 }, points: [
      { name: 'floatL_bow', p: [1.6, -2.35, 3.6] }, { name: 'floatL_step', p: [1.6, -2.55, -0.15] }, { name: 'floatL_stern', p: [1.6, -2.3, -2.8] },
      { name: 'floatR_bow', p: [-1.6, -2.35, 3.6] }, { name: 'floatR_step', p: [-1.6, -2.55, -0.15] }, { name: 'floatR_stern', p: [-1.6, -2.3, -2.8] }] },
    rest: { cgY: 2.1, pitchDeg: 2 },   // floating; on land it would sit on the float keels
    seats: [{ name: 'pilot', hip: [0.33, -0.15, 1.35] }, { name: 'copilot', hip: [-0.33, -0.15, 1.35] }, { name: 'pax1', hip: [0.35, -0.15, 0.3] }, { name: 'pax2', hip: [-0.35, -0.15, 0.3] },
      { name: 'pax3', hip: [0.35, -0.15, -0.6] }, { name: 'pax4', hip: [-0.35, -0.15, -0.6] }, { name: 'pax5', hip: [0.35, -0.15, -1.5] }, { name: 'pax6', hip: [-0.35, -0.15, -1.5] }],
    doors: [{ name: 'doorL', side: 1, z: 1.4, seat: 0 }, { name: 'doorR', side: -1, z: 1.4, seat: 1 }, { name: 'cabinL', side: 1, z: -1.0, seat: 4 }],
    perf: { vStall: 31, vStallFlaps: 28, vRotate: 30, vCruise: 67, vMax: 82, vne: 90, vApproach: 38, climb: 5, rollRateDeg: 45, waterTakeoffRun: 420 },
    price: 2900000,
  },
  bizjet: {
    key: 'bizjet', maker: 'Biscayne Aerospace', name: 'Solstice 45', role: 'Eight-passenger twin business jet', category: 'jet',
    dims: { length: 15.6, span: 14.6, height: 4.6, cabinW: 1.6 }, mass: { empty: 5300, max: 8200, typical: 7200 }, crew: 2, pax: 6,
    engine: { type: 'turbofan', count: 2, thrustKN: 15.6, sound: 'turbofan_small' },
    hard: { jets: [[1.25, 0.45, -3.2], [-1.25, 0.45, -3.2]], nacelleD: 0.95, nacelleL: 2.5, nose: 7.6, tail: -8.0 },
    wing: { layout: 'low', strut: false, area: 25.5, span: 14.6, mac: 1.9, y: -0.55, z: -0.1, dihedralDeg: 3, sweepDeg: 20, taper: 0.38, winglets: true },
    tail: { layout: 'T', hArea: 5.6, hArm: 6.6, hY: 2.4, vArea: 5.0, vArm: 6.0, vY: 1.4 },
    gear: { type: 'tricycle', retract: true, travel: 0.3, points: [
      { name: 'nose', p: [0, -1.5, 5.3], r: 0.2, steer: true }, { name: 'mainL', p: [1.35, -1.5, -0.55], r: 0.28, brake: true }, { name: 'mainR', p: [-1.35, -1.5, -0.55], r: 0.28, brake: true }] },
    rest: { cgY: 1.4, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.36, -0.25, 4.4] }, { name: 'copilot', hip: [-0.36, -0.25, 4.4] },
      { name: 'pax1', hip: [0.45, -0.3, 2.6], yaw: Math.PI }, { name: 'pax2', hip: [-0.45, -0.3, 2.6], yaw: Math.PI }, { name: 'pax3', hip: [0.45, -0.3, 1.4] }, { name: 'pax4', hip: [-0.45, -0.3, 1.4] }, { name: 'pax5', hip: [0.45, -0.3, 0.2] }, { name: 'pax6', hip: [-0.45, -0.3, 0.2] }],
    doors: [{ name: 'airstair', side: 1, z: 3.55, seat: 0, stairs: true }],
    perf: { vStall: 50, vStallFlaps: 44, vRotate: 56, vCruise: 150, vMax: 170, vne: 180, vApproach: 60, climb: 18, rollRateDeg: 60 },
    price: 11500000,
  },
  plane_duster: {
    key: 'plane_duster', maker: 'Caloosa Aircraft', name: 'Canebrake', role: 'Turboprop crop duster (tailwheel, hopper and spray booms)', category: 'plane',
    dims: { length: 10.6, span: 15.2, height: 3.4, cabinW: 0.9 }, mass: { empty: 2100, max: 4200, typical: 3000 }, crew: 1, pax: 0,
    engine: { type: 'turboprop', count: 1, powerKW: 560, propRpm: 2000, sound: 'turboprop' },
    hard: { prop: [[0, 0.1, 4.2]], propD: 2.7, propBlades: 3, nose: 4.6, tail: -6.0, sprayBoom: { y: -0.75, z: -1.15, halfSpan: 6.8, nozzles: 34 }, hopper: [0, 0.2, 1.4] },
    wing: { layout: 'low', strut: false, area: 30, span: 15.2, mac: 2.0, y: -0.5, z: 0.1, dihedralDeg: 3.5, sweepDeg: 0, taper: 1 },
    tail: { layout: 'conventional', hArea: 5.2, hArm: 5.6, hY: 0.2, vArea: 2.6, vArm: 5.8, vY: 1.0 },
    gear: { type: 'tailwheel', retract: false, travel: 0.3, points: [
      { name: 'mainL', p: [1.35, -1.75, 1.3], r: 0.33, brake: true }, { name: 'mainR', p: [-1.35, -1.75, 1.3], r: 0.33, brake: true }, { name: 'tail', p: [0, -0.6, -5.6], r: 0.12, steer: true, castor: true }] },
    rest: { cgY: 1.5, pitchDeg: 9.5 },
    seats: [{ name: 'pilot', hip: [0, 0.35, -0.8] }],
    doors: [{ name: 'doorL', side: 1, z: -0.8, seat: 0 }],
    perf: { vStall: 30, vStallFlaps: 28, vRotate: 32, vCruise: 62, vMax: 80, vne: 90, vApproach: 38, climb: 5, rollRateDeg: 55 },
    price: 1300000,
  },
  plane_banner: {
    key: 'plane_banner', maker: 'Caloosa Aircraft', name: 'Scrub Jay', role: 'Fabric-covered tandem taildragger (banner tow)', category: 'plane',
    dims: { length: 6.9, span: 10.7, height: 2.05, cabinW: 0.7 }, mass: { empty: 480, max: 800, typical: 700 }, crew: 1, pax: 1,
    engine: { type: 'piston', count: 1, powerKW: 112, propRpm: 2700, sound: 'flat4' },
    hard: { prop: [[0, 0.0, 1.95]], propD: 1.85, propBlades: 2, nose: 2.2, tail: -4.7, towHook: [0, -0.25, -4.6] },
    wing: { layout: 'high', strut: true, area: 16.6, span: 10.7, mac: 1.6, y: 0.75, z: 0.1, dihedralDeg: 1, sweepDeg: 0, taper: 1 },
    tail: { layout: 'conventional', hArea: 2.5, hArm: 4.2, hY: 0.05, vArea: 1.1, vArm: 4.4, vY: 0.6 },
    gear: { type: 'tailwheel', retract: false, travel: 0.2, points: [
      { name: 'mainL', p: [0.95, -1.15, 0.55], r: 0.26, brake: true }, { name: 'mainR', p: [-0.95, -1.15, 0.55], r: 0.26, brake: true }, { name: 'tail', p: [0, -0.3, -4.35], r: 0.08, steer: true, castor: true }] },
    rest: { cgY: 0.98, pitchDeg: 9.8 },
    seats: [{ name: 'pilot', hip: [0, -0.25, 0.1] }, { name: 'pax1', hip: [0, -0.25, -0.75] }],
    doors: [{ name: 'doorR', side: -1, z: -0.2, seat: 0, split: true }],
    perf: { vStall: 19, vStallFlaps: 19, vRotate: 21, vCruise: 44, vMax: 56, vne: 68, vApproach: 26, climb: 4.5, rollRateDeg: 65 },
    price: 140000,
  },
  // ------------------------------------------------------------------ BLIMP
  blimp: {
    key: 'blimp', maker: 'Largo Lighter-Than-Air', name: 'Sundowner A-60', role: 'Advertising blimp with an LED screen', category: 'blimp',
    dims: { length: 58, span: 18, height: 19, envelopeD: 14.6, envelopeY: 2.6, gondola: { top: -4.7, bottom: -6.9, len: 7.5, w: 2.1, z: 1.0 } },
    mass: { empty: 4300, max: 6400, typical: 6200, buoyantLift: 6000, volume: 6800 }, crew: 2, pax: 6,
    engine: { type: 'piston', count: 2, powerKW: 160, propRpm: 2500, sound: 'flat6_ducted' },
    hard: { prop: [[2.4, -5.9, -1.0], [-2.4, -5.9, -1.0]], propD: 1.6, propBlades: 5, ducted: true, vector: true, nose: 29, tail: -29,
      screen: { z0: -9, z1: 9, a0: 48, a1: 128 }, fins: { z: -22, area: 28, layout: 'x' }, mooring: [0, 2.6, 29] },
    gear: { type: 'mono', retract: false, travel: 0.3, points: [{ name: 'wheel', p: [0, -7.6, 0.2], r: 0.3, castor: true }] },
    rest: { cgY: 7.5, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.45, -6.0, 2.6] }, { name: 'copilot', hip: [-0.45, -6.0, 2.6] }, { name: 'pax1', hip: [0.5, -6.0, 1.4] }, { name: 'pax2', hip: [-0.5, -6.0, 1.4] }, { name: 'pax3', hip: [0.5, -6.0, 0.4] }, { name: 'pax4', hip: [-0.5, -6.0, 0.4] }],
    doors: [{ name: 'doorL', side: 1, z: -0.6, seat: 0 }],
    perf: { vCruise: 15, vMax: 26, climb: 4, turnRateDeg: 6 },
    price: 0,
  },
  // ------------------------------------------------------------------ AIRLINERS (traffic; exterior fully detailed, not flyable)
  airliner_narrow: {
    key: 'airliner_narrow', maker: 'Biscayne Aerospace', name: 'Tradewind 220', role: 'Single-aisle twinjet (about 180 seats)', category: 'airliner',
    dims: { length: 38.2, span: 35.9, height: 12.1, fuselageD: 3.95, fuselageY: 0.3 }, mass: { empty: 42000, max: 78000, typical: 64000 }, crew: 2, pax: 180,
    engine: { type: 'turbofan', count: 2, thrustKN: 120, sound: 'turbofan_large' },
    hard: { jets: [[5.75, -1.75, 2.9], [-5.75, -1.75, 2.9]], nacelleD: 2.1, nacelleL: 4.4, nose: 17.4, tail: -20.8 },
    wing: { layout: 'low', area: 124, span: 35.9, mac: 4.2, y: -1.0, z: -0.6, dihedralDeg: 5.5, sweepDeg: 25, taper: 0.25, winglets: true },
    tail: { layout: 'conventional', hArea: 31, hArm: 17.5, hY: 1.2, vArea: 21.5, vArm: 16.5, vY: 5.0 },
    gear: { type: 'tricycle', retract: true, travel: 0.45, points: [
      { name: 'nose', p: [0, -3.35, 14.0], r: 0.38, steer: true, twin: 0.5 }, { name: 'mainL', p: [3.8, -3.35, -1.6], r: 0.58, brake: true, twin: 0.9 }, { name: 'mainR', p: [-3.8, -3.35, -1.6], r: 0.58, brake: true, twin: 0.9 }] },
    rest: { cgY: 3.2, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.55, 0.35, 15.2] }, { name: 'copilot', hip: [-0.55, 0.35, 15.2] }], doors: [{ name: 'L1', side: 1, z: 13.2 }, { name: 'L2', side: 1, z: -13.8 }],
    perf: { vStallFlaps: 58, vRotate: 75, vApproach: 70, vTaxi: 9, vCruise: 130, climb: 15, glideDeg: 3, rollRunM: 1900, landRunM: 1500 },
  },
  airliner_wide: {
    key: 'airliner_wide', maker: 'Biscayne Aerospace', name: 'Transoceanic 800', role: 'Twin-aisle long-haul twinjet (about 330 seats); freighter variant without windows', category: 'airliner',
    dims: { length: 63.7, span: 60.9, height: 17.0, fuselageD: 5.9, fuselageY: 0.4 }, mass: { empty: 128000, max: 250000, typical: 190000 }, crew: 2, pax: 330,
    engine: { type: 'turbofan', count: 2, thrustKN: 330, sound: 'turbofan_large' },
    hard: { jets: [[9.7, -2.6, 5.0], [-9.7, -2.6, 5.0]], nacelleD: 3.4, nacelleL: 6.2, nose: 29.5, tail: -34.2 },
    wing: { layout: 'low', area: 360, span: 60.9, mac: 7.0, y: -1.5, z: -1.2, dihedralDeg: 6, sweepDeg: 32, taper: 0.2, rakedTips: true },
    tail: { layout: 'conventional', hArea: 72, hArm: 28.5, hY: 1.8, vArea: 45, vArm: 27, vY: 7.5 },
    gear: { type: 'tricycle', retract: true, travel: 0.6, points: [
      { name: 'nose', p: [0, -5.05, 23.8], r: 0.5, steer: true, twin: 0.7 }, { name: 'mainL', p: [5.5, -5.05, -2.4], r: 0.65, brake: true, bogie: { axles: 3, pitch: 1.45, twin: 1.4 } }, { name: 'mainR', p: [-5.5, -5.05, -2.4], r: 0.65, brake: true, bogie: { axles: 3, pitch: 1.45, twin: 1.4 } }] },
    rest: { cgY: 4.85, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.6, 0.6, 26.6] }, { name: 'copilot', hip: [-0.6, 0.6, 26.6] }], doors: [{ name: 'L1', side: 1, z: 24.2 }, { name: 'L2', side: 1, z: 10.5 }, { name: 'L4', side: 1, z: -24.0 }],
    perf: { vStallFlaps: 62, vRotate: 82, vApproach: 75, vTaxi: 9, vCruise: 140, climb: 13, glideDeg: 3, rollRunM: 2400, landRunM: 1800 },
  },
  airliner_regional: {
    key: 'airliner_regional', maker: 'Caloosa Aircraft', name: 'Conch 48', role: 'High-wing twin turboprop regional airliner (48 seats)', category: 'airliner',
    dims: { length: 22.7, span: 24.6, height: 7.6, fuselageD: 2.7, fuselageY: 0.1 }, mass: { empty: 12500, max: 19000, typical: 17000 }, crew: 2, pax: 48,
    engine: { type: 'turboprop', count: 2, powerKW: 1800, propRpm: 1200, sound: 'turboprop_large' },
    hard: { prop: [[4.05, 0.95, 3.6], [-4.05, 0.95, 3.6]], propD: 3.9, propBlades: 6, nose: 10.6, tail: -12.1 },
    wing: { layout: 'high', area: 55, span: 24.6, mac: 2.3, y: 1.4, z: 0.2, dihedralDeg: 2.5, sweepDeg: 3, taper: 0.5 },
    tail: { layout: 'T', hArea: 11.5, hArm: 11.2, hY: 6.1, vArea: 12, vArm: 10.2, vY: 3.6 },
    gear: { type: 'tricycle', retract: true, travel: 0.35, points: [
      { name: 'nose', p: [0, -2.4, 8.2], r: 0.28, steer: true, twin: 0.4 }, { name: 'mainL', p: [2.05, -2.4, -0.9], r: 0.4, brake: true, twin: 0.55 }, { name: 'mainR', p: [-2.05, -2.4, -0.9], r: 0.4, brake: true, twin: 0.55 }] },
    rest: { cgY: 2.3, pitchDeg: 0 },
    seats: [{ name: 'pilot', hip: [0.45, 0.1, 8.9] }, { name: 'copilot', hip: [-0.45, 0.1, 8.9] }], doors: [{ name: 'L1', side: 1, z: 7.4, stairs: true }],
    perf: { vStallFlaps: 46, vRotate: 56, vApproach: 58, vTaxi: 8, vCruise: 105, climb: 9, glideDeg: 3, rollRunM: 1100, landRunM: 900 },
  },
};
export const FLYABLE = ['heli_piston', 'heli_light', 'heli_police', 'heli_twin', 'heli_rescue', 'plane_trainer', 'plane_tourer', 'plane_biplane', 'plane_twin', 'seaplane', 'bizjet', 'plane_duster', 'plane_banner', 'blimp'];
export const AIRLINERS = ['airliner_narrow', 'airliner_wide', 'airliner_regional'];
export const KNOT = KT;
export const fullName = (key) => { const d = FLEET[key]; return d ? `${d.maker.split(' ')[0]} ${d.name}` : key; };
