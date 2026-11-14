// Light single-engine airframes built on the kit: Caloosa Skimmer (high-wing trainer) and Matecumbe Skipjack 8 (turboprop floatplane).
// Original designs; shapes come from the section tables below, hard points from fleet.js.
import { THREE, loft, sec, liftSurface, hingedPanel, MAT, paintMat, tubeBetween, DEG, lerp } from '../kit/core.js';
import { propeller, wheelPant, gearLeg, floatHull, fit, M4 } from '../kit/parts.js';
import { Livery, paintFuselage, paintSurface } from '../kit/livery.js';
import { FLEET } from '../fleet.js';
import { Builder, identity, newModel, finishModel, mountSurface, addWheel, addLight, addCrew } from './common.js';

const P = {
  plane_trainer: {
    skin: 'rivet', ops: ['club', 'private'], interior: 0xb9b4a6,
    // [z, half width, top, bottom, exponent]
    S: [[2.42, 0.40, 0.46, 0.30, 2.6], [2.0, 0.52, 0.52, 0.48, 2.8], [1.5, 0.56, 0.56, 0.58, 3.2], [1.25, 0.57, 0.58, 0.62, 3.6], [0.62, 0.56, 0.92, 0.64, 3.8], [0, 0.55, 0.93, 0.64, 3.8], [-0.75, 0.52, 0.90, 0.60, 3.6], [-1.3, 0.44, 0.66, 0.52, 3], [-2.5, 0.30, 0.42, 0.36, 2.6], [-4.0, 0.16, 0.30, 0.18, 2.3], [-5.2, 0.05, 0.22, 0.02, 2]],
    ws: [0.64, 1.23, 58], sill: 0.2, winTop: 0.84, firewall: 1.3, rearBulk: -1.35,
    doors: [{ name: 'doorL', side: 1, z0: -0.02, z1: 0.6, y0: -0.5, y1: 0.88 }, { name: 'doorR', side: -1, z0: -0.02, z1: 0.6, y0: -0.5, y1: 0.88 }],
    windows: [[0.05, 0.55, 0.84], [-0.7, -0.1, 0.84], [-1.2, -0.82, 0.58]], backlight: [-1.27, -0.84, 40],
    wing: { semi: 5.45, c0: 1.63, c1: 1.15, y: 0.9, zLE: 0.55, dih: 1.5, t: 0.13, flap: [0.1, 0.5, 0.28], ail: [0.52, 0.93, 0.26], strut: [[0.55, -0.5, 0.22], 0.45] },
    htail: { semi: 1.7, c0: 1.05, c1: 0.7, pos: [0, 0.12, -4.25], sweep: 0.2, elev: 0.4 },
    fin: { span: 1.45, c0: 1.3, c1: 0.62, sweep: 0.8, pos: [0, 0.24, -3.9], rud: 0.38 },
    prop: { D: 1.9, blades: 2, spinnerR: 0.15, spinnerL: 0.36, chord: 0.15 }, propRad: 250,
    g: { belt: 0.2, roof: 0.93, belly: -0.64, noseZ: 2.42, tailZ: -5.2, finZ: -3.9, titleZ: -1.9, titleY: 0.02, tagY: -0.16, regZ: -3.05, regY: 0.1, logoZ: 1.75, logoY: 0.05, logoH: 0.42 }, titleH: 0.2, regH: 0.2,
  },
  seaplane: {
    skin: 'rivet', ops: ['tours'], interior: 0xc4c0b4,
    S: [[3.6, 0.30, 0.42, 0.22, 2.4], [3.0, 0.42, 0.50, 0.42, 2.6], [2.3, 0.58, 0.58, 0.62, 3], [1.95, 0.68, 0.62, 0.70, 3.4], [1.45, 0.74, 0.98, 0.74, 3.8], [0, 0.775, 1.0, 0.76, 4], [-1.9, 0.74, 0.97, 0.72, 3.8], [-2.6, 0.62, 0.80, 0.62, 3.2], [-4.5, 0.34, 0.52, 0.36, 2.6], [-6.3, 0.16, 0.38, 0.14, 2.2], [-7.3, 0.05, 0.28, 0.02, 2]],
    ws: [1.47, 1.93, 60], sill: 0.25, winTop: 0.9, firewall: 2.1, rearBulk: -2.1,
    doors: [{ name: 'doorL', side: 1, z0: 0.86, z1: 1.44, y0: -0.6, y1: 0.94 }, { name: 'doorR', side: -1, z0: 0.86, z1: 1.44, y0: -0.6, y1: 0.94 }, { name: 'cabinL', side: 1, z0: -1.52, z1: -0.6, y0: -0.62, y1: 0.94 }],
    windows: [[0.93, 1.38, 0.9], [0.15, 0.72, 0.9], [-0.5, 0.05, 0.9], [-1.42, -0.7, 0.9]], backlight: null,
    wing: { semi: 7.95, c0: 1.95, c1: 1.37, y: 0.98, zLE: 0.62, dih: 2.5, t: 0.14, flap: [0.08, 0.55, 0.3], ail: [0.57, 0.94, 0.26], strut: [[0.76, -0.55, 0.5], 0.42] },
    htail: { semi: 2.9, c0: 1.35, c1: 0.9, pos: [0, 0.3, -6.05], sweep: 0.3, elev: 0.42 },
    fin: { span: 2.1, c0: 1.9, c1: 0.85, sweep: 1.2, pos: [0, 0.34, -5.6], rud: 0.38 },
    prop: { D: 2.6, blades: 3, spinnerR: 0.2, spinnerL: 0.5, chord: 0.2 }, propRad: 200,
    g: { belt: 0.25, roof: 1.0, belly: -0.76, noseZ: 3.6, tailZ: -7.3, finZ: -5.6, titleZ: -3.5, titleY: 0.12, tagY: -0.12, regZ: -5.2, regY: 0.1, logoZ: 2.75, logoY: 0.02, logoH: 0.55 }, titleH: 0.32, regH: 0.2,
  },
};

export function buildLightPlane(key, opts = {}) {
  const def = FLEET[key], p = P[key], id = identity(key, opts, p.ops), B = new Builder(), M = newModel(key, def, id), traffic = opts.quality === 'traffic';
  const secs = p.S.map(([z, w, t, b, e]) => sec(z, w, t, b, 0, e, e * 0.9, e));
  const Q = loft(secs, { stations: 2, ring: 4 });
  // ---- regions: windshield, side windows (mirrored), doors
  const regions = [{ kind: 'glass', z0: p.ws[0], z1: p.ws[1], a0: -p.ws[2], a1: p.ws[2] }];
  for (const [z0, z1, top] of p.windows) { const zm = (z0 + z1) / 2; regions.push({ kind: 'glass', z0, z1, a0: Q.yToA(zm, top), a1: Q.yToA(zm, p.sill), mirror: true }); }
  if (p.backlight) regions.push({ kind: 'glass', z0: p.backlight[0], z1: p.backlight[1], a0: -p.backlight[2], a1: p.backlight[2] });
  const doorRegs = p.doors.map((d) => { const zm = (d.z0 + d.z1) / 2, a0 = Q.yToA(zm, d.y1), a1 = Q.yToA(zm, d.y0); return { kind: 'door', name: d.name, z0: d.z0, z1: d.z1, a0: d.side > 0 ? a0 : -a1, a1: d.side > 0 ? a1 : -a0 }; });
  regions.push(...doorRegs);
  const L = loft(secs, { ring: 44, stations: 44, regions, capA: true, capB: true });
  const Lv = new Livery(L, { w: 2048, h: 1024 });
  paintFuselage(Lv, id.op, p.g, { seed: id.seed, registration: id.registration, wearK: id.wearK, titleH: p.titleH, regH: p.regH });
  for (const side of [1, -1]) Lv.streak(side, p.S[1][0] - 0.2, p.S[1][0] - 2.6, -0.45, 0.16, 'rgba(34,28,24,0.55)');   // exhaust soot along the belly
  const skin = paintMat({ map: Lv.texture(), skin: p.skin }), glass = MAT.glass(0x9fb4bd, 0.28), rubber = MAT.rubber(), metal = MAT.metal(0xb5b8bc, 0.36), dark = MAT.dark(), chrome = MAT.chrome();
  B.add(L.geos.main, skin); B.add(L.geos['main:glass'], glass); B.add(L.geos['main:frame'], rubber); B.add(L.geos.capA, skin); B.add(L.geos.capB, dark);
  // ---- cabin liner (interior shell with bulkheads) and doors
  const linerMat = MAT.plastic(p.interior, 0.8);
  const Li = traffic ? null : loft(secs, { ring: 44, stations: 44, regions, inset: 0.028, flip: true, clip: [p.rearBulk, p.firewall], glassAsHole: true, capA: true, capB: true, frameW: 0 });
  if (Li) { B.add(Li.geos.main, linerMat); B.add(Li.geos.capA, linerMat); B.add(Li.geos.capB, linerMat); }
  for (const r of doorRegs) {
    const hp = hingedPanel(L, r, { skin, glass, frame: rubber }, { hinge: 'front', angle: 78 * DEG });
    if (Li && Li.geos[r.name]) { const g = Li.geos[r.name]; g.translate(-hp.pivot.x, -hp.pivot.y, -hp.pivot.z); hp.node.add(new THREE.Mesh(g, linerMat)); }
    B.root.add(hp.node); M.doors[r.name] = hp;
    const zc = r.z0 + 0.09, ac = (r.a0 + r.a1) / 2 + Math.sign(r.a0 + r.a1) * 12, pt = L.at(zc, ac, new THREE.Vector3()).sub(hp.pivot), n = L.normal(zc, ac);
    hp.node.add(new THREE.Mesh(fit.handle(pt.toArray(), n.toArray()), chrome));
    for (const k of [0.25, 0.75]) { const a = lerp(r.a0, r.a1, k), q = L.at(r.z1, a, new THREE.Vector3()), nn = L.normal(r.z1 - 0.02, a); B.add(fit.hinge(q.toArray(), nn.toArray()), metal); }
  }
  // ---- cowl details: cooling inlets / turbine intake, exhaust, access latches
  const nz = p.S[0][0], hub = def.hard.prop[0];
  if (def.engine.type === 'piston') { for (const sx of [1, -1]) B.add(new THREE.CircleGeometry(0.105, 16).scale(1.25, 0.72, 1), MAT.plastic(0x050505, 0.9), M4([sx * 0.21, hub[1] + 0.12, nz + 0.004])); B.add(new THREE.CircleGeometry(0.07, 12).scale(1.6, 0.6, 1), MAT.plastic(0x050505, 0.9), M4([0, hub[1] - 0.23, nz + 0.004])); B.add(fit.exhaust([0.2, -0.47, 1.75], [0.1, -1, -0.5], 0.2, 0.028), metal); }
  else { for (const sx of [1, -1]) B.add(fit.exhaust([sx * 0.4, 0.12, nz - 0.5], [sx * 0.9, -0.1, -0.7], 0.34, 0.07), MAT.metal(0x6a5a4c, 0.5));
    const sc = loft([sec(nz - 0.05, 0.16, 0.08, 0.1, -0.33, 3), sec(nz - 0.5, 0.2, 0.1, 0.14, -0.4, 3), sec(nz - 1.4, 0.1, 0.03, 0.06, -0.5, 2.5)], { ring: 14, stations: 8, capB: true }); B.add(sc.geos.main, skin.clone ? paintMat({ color: 0xe9e9e6, skin: 'rivetFine' }) : skin); B.add(sc.geos.capB, MAT.plastic(0x050505, 0.9)); }
  // ---- propeller
  const prop = propeller({ ...p.prop, spinnerMat: def.engine.type === 'piston' ? paintMat({ color: id.op.colors[0], skin: 'composite' }) : chrome });
  prop.node.position.set(hub[0], hub[1], Math.max(hub[2], nz + 0.06)); B.root.add(prop.node); M.props.push({ obj: prop, i: 0, maxRad: p.propRad });
  // ---- wings
  const w = p.wing, aspect = w.semi / ((w.c0 + w.c1) / 2);
  for (const side of [1, -1]) {
    const surf = liftSurface({ span: w.semi, c0: w.c0, c1: w.c1, t0: w.t, t1: w.t * 0.85, camber: 0.025, twist: -2, dihedral: w.dih, side, nSpan: 10, nChord: 12, controls: [{ name: 'flap', s0: w.flap[0], s1: w.flap[1], chord: w.flap[2] }, { name: 'ail', s0: w.ail[0], s1: w.ail[1], chord: w.ail[2] }] });
    const mat = paintMat({ map: paintSurface(id.op, 'wing', { seed: id.seed + side, registration: id.registration, wearK: id.wearK, side, aspect }), skin: p.skin });
    const pos = [0, w.y, w.zLE];
    mountSurface(B, M, 'wing' + side, surf, mat, pos, { flap: { k: 'flaps', gain: -side * 32 * DEG }, ail: { k: 'roll', gain: -20 * DEG } });
    // strut, fairings, tip lights, pitot, fuel cap, wicks, tie-down ring
    const sp = surf.frame(w.strut[1], 0.32, -1).add(new THREE.Vector3(...pos)), f0 = w.strut[0];
    B.add(tubeBetween([side * f0[0], f0[1], f0[2]], sp.toArray(), 0.022, 0.1, 10), skin);
    B.add(fit.ring([sp.x, sp.y - 0.03, sp.z - 0.12]), metal);
    const tip = surf.frame(1, 0.1, 1).add(new THREE.Vector3(...pos)), tipT = surf.frame(1, 0.9, 1).add(new THREE.Vector3(...pos));
    addLight(B, M, side > 0 ? 'nav_l' : 'nav_r', [tip.x + side * 0.12, tip.y - 0.03, tip.z - 0.15], 0.032); addLight(B, M, 'strobe', [tip.x + side * 0.1, tip.y - 0.02, tip.z - 0.42], 0.022);
    for (const s of [0.6, 0.75, 0.9]) { const q = surf.frame(s, 1, 1).add(new THREE.Vector3(...pos)); B.add(fit.wick(q.toArray(), 0.12), dark); }
    const fc = surf.frame(0.22, 0.3, 1).add(new THREE.Vector3(...pos)); B.add(fit.cap([fc.x, fc.y + 0.004, fc.z], [0, 1, 0], 0.045), metal);
    if (side > 0) { const pp = surf.frame(0.52, 0.12, -1).add(new THREE.Vector3(...pos)); B.add(fit.pitot(pp.toArray(), 1), metal); const ll = surf.frame(0.62, 0.0, 1).add(new THREE.Vector3(...pos)); addLight(B, M, 'landing', [ll.x, ll.y - 0.06, ll.z + 0.01], 0.05); addLight(B, M, 'taxi', [ll.x + 0.14, ll.y - 0.06, ll.z + 0.01], 0.04); }
    void tipT;
  }
  // ---- tail
  const h = p.htail, f = p.fin, tailMatH = paintMat({ map: paintSurface(id.op, 'htail', { seed: id.seed + 9, wearK: id.wearK }), skin: p.skin }), finMat = paintMat({ map: paintSurface(id.op, 'fin', { seed: id.seed + 11, wearK: id.wearK, aspect: f.span / ((f.c0 + f.c1) / 2), logoH: 0.55 }), skin: p.skin });
  for (const side of [1, -1]) mountSurface(B, M, 'htail' + side, liftSurface({ span: h.semi, c0: h.c0, c1: h.c1, sweep: h.sweep, t0: 0.09, camber: 0, side, nSpan: 5, nChord: 8, controls: [{ name: 'elev', s0: 0.04, s1: 0.97, chord: h.elev }] }), tailMatH, h.pos, { elev: { k: 'pitch', gain: side * 24 * DEG } });
  const finS = liftSurface({ span: f.span, c0: f.c0, c1: f.c1, sweep: f.sweep, t0: 0.09, camber: 0, vertical: true, nSpan: 5, nChord: 8, controls: [{ name: 'rud', s0: 0.03, s1: 0.97, chord: f.rud }] });
  mountSurface(B, M, 'fin', finS, finMat, f.pos, { rud: { k: 'yaw', gain: 24 * DEG } });
  addLight(B, M, 'beacon', [0, f.pos[1] + f.span + 0.02, f.pos[2] - f.sweep - f.c1 * 0.4], 0.035); addLight(B, M, 'tail', [0, p.S[p.S.length - 1][2] * 0.5, p.S[p.S.length - 1][0] - 0.03], 0.025);
  // dorsal fillet
  B.add(liftSurface({ span: f.span * 0.32, c0: f.c0 * 1.5, c1: f.c0 * 0.2, sweep: f.c0 * 1.25, t0: 0.035, camber: 0, vertical: true, nSpan: 3, nChord: 5, tip: 'flat' }).fixed, skin, M4([0, f.pos[1] - 0.06, f.pos[2] + f.c0 * 0.55]));
  // ---- landing gear or floats
  if (def.gear.type === 'floats') {
    const fl = def.gear.floats, floatMat = paintMat({ color: 0xdfe1e3, skin: 'rivetFine' }), accent = paintMat({ color: id.op.colors[0], skin: 'composite' });
    const rudders = [];
    for (const side of [1, -1]) {
      const fh = floatHull(fl), T = M4([side * fl.x, 0, 0]);
      B.add(fh.geo, floatMat, T); B.add(fh.cap, floatMat, T); for (const g of fh.extra.metal) B.add(g, metal, T); for (const g of fh.extra.dark) B.add(g, MAT.rubber(), T);
      const rn = B.node('wrud' + side, B.root, [side * fl.x + fh.extra.rudder.pos[0], fh.extra.rudder.pos[1], fh.extra.rudder.pos[2]]); rn.add(new THREE.Mesh(fh.extra.rudder.geo, metal)); rudders.push(rn);
      const dk = fl.deckY + 0.02, zf = 2.3, zr = -1.0;
      B.add(tubeBetween([side * fl.x, dk, zf], [side * 0.62, -0.55, 2.05], 0.03, 0.13, 10), skin); B.add(tubeBetween([side * fl.x, dk, zr], [side * 0.7, -0.6, -0.9], 0.03, 0.13, 10), skin);
      B.add(tubeBetween([side * fl.x, dk, zf - 0.1], [side * 0.7, -0.6, -0.75], 0.022, 0.09, 8), skin);
      B.add(tubeBetween([side * fl.x, dk, zr], [side * (w.strut[0][0] + 1.2), w.y - 0.5, 0.35], 0.018, 0.07, 8), skin);
      if (side > 0) for (let i = 0; i < 3; i++) B.add(new THREE.BoxGeometry(0.34, 0.02, 0.1), MAT.tread(), M4([side * (fl.x - 0.42 + i * 0.02), dk + 0.3 + i * 0.3, 0.62 + i * 0.0]));   // boarding ladder
      B.add(new THREE.BoxGeometry(0.03, 0.02, 2.0), accent, M4([side * (fl.x + fl.beam * 0.45), fl.deckY - 0.3, 1.6]));
    }
    for (const z of [2.3, -1.0]) B.add(tubeBetween([-fl.x, fl.deckY + 0.02, z], [fl.x, fl.deckY + 0.02, z], 0.035, 0.16, 10), skin);
    for (const [za, zb] of [[2.3, -1.0], [-1.0, 2.3]]) B.add(tubeBetween([-fl.x, fl.deckY + 0.04, za], [fl.x, fl.deckY + 0.04, zb], 0.006, 0, 5), metal);   // bracing wires
    M.extra.push((dt, s) => { const a = s.onWater && s.gs < 12 ? -s.yaw * 0.5 : 0; for (const r of rudders) { r.rotation.y = a; r.rotation.x = s.onWater || s.agl < 3 ? 0 : -1.2; } });
    // ventral fin for float stability
    B.add(liftSurface({ span: 0.5, c0: 1.3, c1: 0.5, sweep: -0.2, t0: 0.05, camber: 0, vertical: true, nSpan: 2, nChord: 5 }).fixed, skin, M4([0, 0, f.pos[2] - 0.3], [0, 0, Math.PI]));
  } else {
    const pts = def.gear.points, paintPlain = paintMat({ color: id.op.colors[2] === '#ffffff' ? 0xf4f4f2 : new THREE.Color(id.op.colors[2]).getHex(), skin: 'composite' });
    pts.forEach((gp, i) => {
      const c = [gp.p[0], gp.p[1] + gp.r, gp.p[2]], e = addWheel(B, M, i, c, gp.r, { steer: !!gp.steer, travel: def.gear.travel });
      if (gp.steer) { const leg = gearLeg([0, -0.4, c[2] + 0.06], [0, c[1] + gp.r * 1.25, c[2] + 0.02], gp.r, 'oleo'); for (const g of leg.paint) B.add(g, paintPlain); for (const g of leg.chrome) B.add(g, chrome); for (const g of leg.metal) B.add(g, metal);
        for (const sx of [1, -1]) B.add(tubeBetween([sx * gp.r * 0.5, gp.r * 1.25, 0.02], [sx * gp.r * 0.5, 0, 0], 0.016, 0.05, 6), metal, null, e.node); B.add(tubeBetween([-gp.r * 0.5, gp.r * 1.25, 0.02], [gp.r * 0.5, gp.r * 1.25, 0.02], 0.02, 0, 6), metal, null, e.node); }
      else { const sx = Math.sign(c[0]), leg = gearLeg([sx * 0.5, -0.58, c[2] + 0.1], [c[0] - sx * 0.09, c[1], c[2]], gp.r, 'spring'); for (const g of leg.paint) B.add(g, paintPlain); for (const g of leg.metal) B.add(g, metal); B.add(fit.step([sx * 0.62, -0.72, c[2] + 0.42], sx, 0.16), MAT.tread()); }
      B.add(wheelPant(gp.r, gp.r * 0.95), paintPlain, null, e.node);
    });
  }
  // ---- antennas and fittings
  B.add(fit.bladeAntenna([0, p.g.roof + 0.02, -0.4], 0.2), skin); B.add(fit.whip([0.12, p.g.roof - 0.02, -0.9], 0.55, -0.55), metal); B.add(fit.bladeAntenna([0, -p.S[5][3] + 0.01, -0.6], 0.16, true), skin);
  B.add(fit.whip([0, f.pos[1] + f.span - 0.1, f.pos[2] - f.sweep + 0.1], 0.5, 1.3), metal);
  if (opts.crew) addCrew(B, def, id.seed, opts.crew);
  return finishModel(B, M, opts);
}
