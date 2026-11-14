// Shared model plumbing: the per-airframe update routine (props, rotors, control surfaces, gear, lights, doors, searchlight)
// and small helpers used by every airframe builder.
import { THREE, Builder, hingeNode, MAT, paintMat, clamp, lerp, rng, DEG } from '../kit/core.js';
import { wheel, lightFixture, updateLights, crewFigure } from '../kit/parts.js';
import { buildCockpit } from '../kit/cockpit.js';
import { OPERATORS, registration as makeReg, pickOperator } from '../kit/livery.js';

export function identity(key, opts, kinds) {
  const seed = opts.seed ?? 1, opId = opts.operator || pickOperator(kinds, seed), op = OPERATORS[opId] || OPERATORS.private1;
  return { seed, opId, op, registration: opts.registration || makeReg(seed), wearK: opts.wear ?? (0.25 + rng(seed * 3 + 1)() * 0.6) };
}
// Adds a lifting surface under a new node at `pos`; control parts become hinge nodes registered in M.surfaces.
// ctl: { partName: { k: 'roll'|'pitch'|'yaw'|'flaps', gain (rad at full deflection, sign included) } }
export function mountSurface(B, M, name, surf, mat, pos, ctl = {}, rot = null) {
  const n = B.node(name, B.root, pos); if (rot) n.rotation.set(...rot);
  B.add(surf.fixed, mat, null, n);
  for (const pn in surf.parts) { const h = hingeNode(surf.parts[pn], mat); n.add(h); const c = ctl[pn]; if (c) M.surfaces.push({ node: h, k: c.k, gain: c.gain }); }
  return n;
}
export function addWheel(B, M, i, center, r, { steer = false, twin = 0, travel = 0.2, w } = {}) {
  const n = B.node('gear' + i + '_' + M.gear.length, B.root, center), wh = wheel(r, w ?? r * 0.7, { twin }); n.add(wh);
  const e = { node: n, wheel: wh, i, y0: center[1], travel, steer }; M.gear.push(e); return e;
}
export function addLight(B, M, kind, pos, size, parent = B.root) { const f = lightFixture(kind, size); f.position.set(...pos); parent.add(f); M.fixtures.push(f); return f; }
export function addCrew(B, def, seed, n = 1, opt = {}) { for (let i = 0; i < n && i < def.seats.length; i++) { const c = crewFigure({ seed: seed * 7 + i, ...opt }); c.position.set(...def.seats[i].hip); c.position.y -= 0.02; c.rotation.y = def.seats[i].yaw || 0; c.name = 'crew' + i; B.root.add(c); (B.crew ||= []).push(c); } }

export function newModel(key, def, id) { return { key, def, identity: { registration: id.registration, operator: id.opId, operatorName: id.op.name, seed: id.seed }, props: [], rotor: null, tail: null, surfaces: [], gear: [], fixtures: [], doors: {}, retract: [], cockpit: null, searchlight: null, extra: [], phase: (id.seed % 17) * 0.13 }; }

export function finishModel(B, M, opts = {}) {
  const group = B.finish(), def = M.def;
  if (opts.cockpit !== false && def.seats && def.category !== 'airliner') { M.cockpit = buildCockpit({ key: M.key, def, seed: M.identity.seed, registration: M.identity.registration, operatorName: M.identity.operatorName, traffic: opts.quality === 'traffic' }); group.add(M.cockpit.group); }
  const crew = B.crew || [];
  const api = {
    group, def, key: M.key, identity: M.identity, seats: def.seats, parts: M,
    cameras: { cockpit: { pos: M.cockpit ? M.cockpit.eye : [def.seats[0].hip[0], def.seats[0].hip[1] + 0.76, def.seats[0].hip[2] + 0.05], fov: 68 }, chase: { dist: Math.max(def.dims.length, def.dims.span || def.dims.rotorD) * 1.25 + 3, height: def.dims.height * 0.75 + 1 } },
    cockpitActive: false,
    setCrewVisible(n) { crew.forEach((c, i) => { c.visible = i < n; }); },
    setDoor(name, t) { M.doors[name]?.open(t); },
    update(dt, s) {
      for (const p of M.props) p.obj.set(s.propBroken?.[p.i] ? 0 : (s.engines[p.i] ?? 0), dt, p.maxRad);
      if (M.rotor) { M.rotor.set(s.rotorBroken ? 0 : s.rotorRpm, dt, s.coning ?? null, s.discTiltX || 0, s.discTiltZ || 0, M.rotorRad || 40); M.rotor.node.visible = !s.rotorBroken; }
      if (M.tail) M.tail.set(s.rotorBroken ? 0 : (s.tailRotorRpm || s.rotorRpm), dt);
      for (const c of M.surfaces) c.node.userData.set(c.gain * (s[c.k] || 0));
      for (const g of M.gear) { g.node.position.y = g.y0 + (s.gearCompress[g.i] || 0) * g.travel; g.wheel.rotation.x += (s.wheelSpin[g.i] || 0) * dt; if (g.steer) g.node.rotation.y = s.steer; }
      for (const r of M.retract) { const up = 1 - s.gear; r.node.rotation[r.axis] = r.angle * up; r.node.visible = up < 0.985; }
      updateLights(M.fixtures, s, M.phase);
      for (const n in s.doors) M.doors[n]?.open(s.doors[n]);
      if (M.searchlight) { const sl = M.searchlight, on = s.lights.search; sl.yaw.rotation.y = s.searchAim.yaw; sl.pitch.rotation.x = -s.searchAim.pitch; sl.cone.visible = on && s.night > 0.25; if (sl.light) sl.light.intensity = on ? sl.power * (0.15 + 0.85 * s.night) : 0; }
      for (const f of M.extra) f(dt, s);
      if (M.cockpit && api.cockpitActive) { M.cockpit.setNight(s.night); M.cockpit.update(s, dt); }
    },
    dispose() { M.cockpit?.dispose(); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
  return api;
}
export { THREE, Builder, MAT, paintMat, clamp, lerp, rng, DEG };
