// Airports (airports agent, Nov 19): Miami International and Key West International, built from airports.json
// (tools/v2/airport/design.py): runways / taxiways / aprons with FAA markings (pavement.js, markings.js), runway,
// approach, PAPI and taxiway lights that glow at night (lights.js), towers, hangars, jet bridges, wind socks, signs and
// ground equipment (structures.js), a walk-in terminal with check-in, security and gate lounges (terminal.js), the
// perimeter fence with gates (fence.js) that you can climb (climb.js), airside trespass -> wanted (security below),
// AI airline traffic (src/vehicles/air/traffic/traffic.js) and boarding a flight at a gate (boarding below).
// Streaming: an airport is built in steps when the player comes within 3.5 km and hidden past 5 km; traffic pauses.
// ?airport=0 turns all of it off; game.airport = { list, at(x, z), inAirside(x, z), stats(), traffic, board(...) }.
import * as THREE from 'three';
import DATA from './airports.json';
import { pip, ringDist } from './geom.js';
import { buildPavement } from './pavement.js';
import { buildMarkings } from './markings.js';
import { buildLights } from './lights.js';
import { buildStructures } from './structures.js';
import { buildTerminal } from './terminal.js';
import { buildFence } from './fence.js';
import { createClimb } from './climb.js';
import { planBase, buildBase, zoneConfig, fenceOpts, BASE_NAME } from './base.js';
import { airportZoneConfig } from './security.js';
import { createZone } from '../../gameplay/stealth/zone.js';
import { createTraffic } from '../../vehicles/air/traffic/traffic.js';
import { help } from '../../jobs/kit.js';
import { payCash } from '../../activities/common.js';

export const order = 184;
const Q = typeof location !== 'undefined' ? location.search : '';
const OFF = /[?&]airport=0\b/.test(Q), NO_TRAFFIC = /[?&]airtraffic=0\b/.test(Q);
const BUILD_R = 3500, HIDE_R = 5000;
const FARE = { mia: 189, eyw: 129 };
// W6 (Nov 19 playtest): the smaller airport (Key West) is a military air base (base.js); ?base=0 keeps it civilian
const MILITARY = new Set(/[?&]base=0\b/.test(Q) ? [] : ['eyw']);
const STEALTH_OFF = /[?&]stealth=0\b/.test(Q);

export async function initV2(game) {
  if (OFF) return;
  const { scene, world, RAPIER, renderer } = game, city = game.city;
  if (!scene || !world || !RAPIER || !city?.groundHeightAt) return;
  const ground = (x, z) => city.groundHeightAt(x, z);
  const list = DATA.airports.map((ap) => ({ ap, id: ap.id, military: MILITARY.has(ap.id), name: MILITARY.has(ap.id) ? BASE_NAME : ap.name, state: 'idle', group: null, parts: {}, airside: ap.airside, landside: ap.landside, cx: ap.center[0], cz: ap.center[1], stats: {} }));
  const at = (x, z) => list.find((a) => Math.abs(x - a.cx) < 2500 && Math.abs(z - a.cz) < 2500 && (pip(a.airside, x, z) || (a.landside && pip(a.landside, x, z)))) || null;
  const inAirside = (x, z) => { for (const a of list) if (Math.abs(x - a.cx) < 2500 && Math.abs(z - a.cz) < 2500 && pip(a.airside, x, z) && !a.parts.terminal?.inside(x, z, 0.5)) return a; return null; };
  const isFree = (x, z) => { if (city.isWater?.(x, z)) return true; const zn = city.zoneAt?.(x, z); if (!/airport|park|rural|wilderness/.test(zn || '')) return false; try { const r = city.roadGraph?.nearestEdge?.(x, z, {}, 20); if (r && r.dist < (r.edge.width || 8) / 2 + 2) return false; } catch (e) { /* */ } return true; };
  const frameWait = () => new Promise((r) => requestAnimationFrame(() => r()));
  // no trees / palms on the curb, the terminal or the aprons (the vegetation streamer also drops plants already placed there)
  try { for (const ap of DATA.airports) for (const poly of [ap.forecourt, ap.terminal?.ring]) { if (!poly) continue;   // one box each (the airside itself grows no trees: zone airport)
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    game.vegetation?.block?.({ x0: x0 - 4, z0: z0 - 4, x1: x1 + 4, z1: z1 + 4 }); } } catch (e) { console.warn('[airport] vegetation block', e); }

  async function build(A) {
    A.state = 'building'; const t0 = performance.now(), ap = A.ap;
    const group = new THREE.Group(); group.name = 'airport-' + ap.id; game.shaderWarmWrap?.(group); scene.add(group); A.group = group;   // new programs compile in parallel before the parts show (no frame stall)
    const ctx = { renderer, ground, group, world, RAPIER, game, isFree };
    const step = async (name, fn) => { const t1 = performance.now(); try { A.parts[name] = await fn(); } catch (e) { console.warn('[airport] ' + ap.id + ' ' + name, e); } (A.stats.stepMs ||= {})[name] = Math.round(performance.now() - t1); await frameWait(); };
    await step('pavement', () => buildPavement(ap, ctx));
    await step('markings', () => buildMarkings(ap, ctx));
    await step('lights', () => buildLights(ap, ctx));
    if (A.military) {   // military air base: no terminal, no airline ground equipment; a tall razor-wire fence climbable at a few spots
      A.plan = planBase(ap, ctx);
      await step('structures', () => buildStructures({ ...ap, stands: [] }, ctx));
      await step('fence', () => buildFence({ group, world, RAPIER, ground, ring: ap.airside, gates: ap.fenceGates || [], inside: (x, z) => pip(ap.airside, x, z), ...fenceOpts, climbSpots: A.plan.climbSpots }));
      await step('base', () => buildBase(ap, ctx, A.plan, A.parts.fence));
    } else {
    await step('terminal', () => buildTerminal(ap, ctx));
    await step('structures', () => buildStructures(ap, ctx));
    await step('fence', () => buildFence({ group, world, RAPIER, ground, ring: ap.airside, gates: ap.fenceGates || [], inside: (x, z) => pip(ap.airside, x, z),
      skip: (x, z) => { const T = ap.terminal; return T && ringDist(T.ring, x, z) < 2.0 || pip(T.ring, x, z); } }));
    }
    if (!STEALTH_OFF) await step('zone', () => makeZone(A));
    if (A.parts.terminal && traffic) { const tA = traffic.AP.find((x) => x.ap.id === ap.id); if (tA) tA.onBoard = (rows) => A.parts.terminal.drawBoard(rows); }
    A.stats.buildMs = Math.round(performance.now() - t0); A.stats.marks = A.parts.markings?.counts; A.stats.lights = A.parts.lights?.counts; A.stats.fence = A.parts.fence?.stats;
    A.state = 'live';
  }

  // W6 stealth zones: guards + cameras (src/gameplay/stealth/zone.js). The base: 4 stars on detection, 5 if seen again.
  function makeZone(A) {
    const ap = A.ap, F = A.parts.fence, T = A.parts.terminal;
    const cfg = A.military ? zoneConfig(ap, A.plan, A.parts.base || {}, F) : airportZoneConfig(ap, F);
    const Z = createZone(game, { id: ap.id, label: A.military ? 'AIR STATION' : 'AIRPORT', ...cfg, cx: A.cx, cz: A.cz, thinkR: 400, sleepR: 3000,
      contains: A.military ? (x, z) => pip(ap.airside, x, z) : (x, z) => { if (!pip(ap.airside, x, z) || T?.inside?.(x, z, 0.5)) return false; const v = game.player?.state?.vehicle; return !(v && v.air) && !sec.pass && !boarding.active; },
      nearFence: (x, z) => !!F?.nearest?.(x, z, 2.5),
      stars: A.military ? 4 : 2, stars2: A.military ? 5 : 3, siren: A.military, airspace: A.military ? 1100 : 0,
      alertText: A.military ? 'Southline Air Station: intruder on the base. Security forces responding.' : 'Airport security: intruder airside',
      escalateText: A.military ? 'Base alert: military response authorized' : 'Airport police requesting backup' });
    if (F?.body) Z.setFenceBody(F.body);
    return Z;
  }

  // ---------------------------------------------------------------- traffic, climbing, security, boarding
  let traffic = null;
  if (!NO_TRAFFIC) try { traffic = createTraffic(game, DATA.airports.filter((ap) => !MILITARY.has(ap.id))); } catch (e) { console.warn('[airport] traffic', e); }
  const climb = createClimb(game, () => list.filter((a) => a.parts.fence).map((a) => a.parts.fence));
  game.fixedHooks.unshift(function airportClimbInput() {
    if (game.ui?.paused || game.ui?.phoneOpen || climb.active || !game.input?.pressed?.('Space')) return;
    climb.tryClimb();
  });
  game.fixedHooks.push(function airportClimbFixed(dt) { climb.fixed(dt); });

  const sec = { inside: null, t: 0, reported: false, outT: 0, pass: null, onTrespass: [] };
  function security(dt) {
    const P = game.player; if (!P) return;
    const v = P.state?.vehicle, inAir = !!(v && v.air);
    let a = inAirside(P.position.x, P.position.z); if (a && (a.parts.zone || a.military) && !STEALTH_OFF) a = null;   // guarded zones report by sight (zone.js)
    if (a && !inAir && !sec.pass && !boarding.active) {
      if (sec.inside !== a) { sec.inside = a; sec.t = 0; }
      sec.t += dt; sec.outT = 0;
      if (sec.t > 1.5 && !sec.reported) {
        sec.reported = true;
        game.hud?.notify?.('Restricted area: airport security has been alerted', 3500);
        game.emit?.('crime', { type: 'trespass', position: P.position.clone(), severity: 2, police: true, airport: a.id, airside: true });
        sec.bumpUntil = (game.clock?.elapsed ?? 0) + 12;   // airport security escalates: at least two stars (below, once the report lands)
        for (const f of sec.onTrespass) try { f({ airport: a.id, position: P.position.clone() }); } catch (e) { /* */ }
      }
    } else { sec.outT += dt; if (sec.outT > 25) { sec.reported = false; sec.inside = null; } }
    if (sec.bumpUntil && (game.clock?.elapsed ?? 0) < sec.bumpUntil) { const W = game.wanted; const lv = W?.level ?? 0;
      if (lv >= 2) sec.bumpUntil = 0; else if (lv === 1) { try { if (W.set) W.set(2, P.position.clone(), { visual: true }); else W.add?.(1, P.position.clone()); } catch (e) { /* */ } sec.bumpUntil = 0; } }
  }

  // boarding: E at a gate podium inside the terminal -> ticket (fare) -> fade -> the flight takes off with you aboard -> arrival
  const fadeEl = (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .9s ease;z-index:80;display:flex;align-items:flex-end;justify-content:center;'; const t = document.createElement('div'); t.style.cssText = 'margin-bottom:12vh;color:#f3ede2;font:700 20px/1.4 var(--ps-font, system-ui, sans-serif);letter-spacing:.12em;text-transform:uppercase;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.8)'; d.appendChild(t); document.body.appendChild(d); return { d, t }; })();
  const fade = (on, text = '') => { fadeEl.d.style.opacity = on ? '1' : '0'; fadeEl.t.innerHTML = text; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const boarding = { active: false, cam: null };
  function nearPodium() {
    const P = game.player; if (!P || P.state?.inVehicle) return null;
    for (const a of list) { const T = a.parts.terminal; if (!T || !T.inside(P.position.x, P.position.z)) continue;
      for (const g of T.gates) { const d = Math.hypot(P.position.x - g.podium.x, P.position.z - g.podium.z); if (d < 3.2) return { a, g }; } }
    return null;
  }
  async function board(a, g) {
    if (boarding.active) return false;
    const dest = list.find((x) => x !== a && !x.military); if (!dest) return false;
    const fare = FARE[a.id] || 150;
    if (!payCash(game, fare, { to: 'Southline Air', memo: `Flight to ${dest.name}`, place: a.name, category: 'travel', accepts: ['card', 'bank', 'cash'] })) { game.hud?.notify?.(`Not enough money for the $${fare} fare`, 2500); return false; }
    boarding.active = true; sec.pass = a.id;
    const P = game.player;
    help(game, 'airport', null);
    fade(true, `Boarding &middot; Southline Air to ${dest.name}`);
    await sleep(1200);
    // the aircraft at this gate (or a fresh one) lines up with you aboard; the camera watches it take off
    let f = traffic?.flights.find((x) => x.A.ap.id === a.id && x.st?.id === g.id && x.phase === 'parked');
    const tA = traffic?.AP.find((x) => x.ap.id === a.id);
    try { P.state.hidden = true; game.setPlayerHidden?.(true); } catch (e) { /* */ }
    if (traffic && tA) {
      if (!f) { const st = tA.stands.find((s) => s.id === g.id) || tA.stands[0]; if (st.busy) traffic.remove(st.busy); f = await traffic.spawnParked(tA, st, 0); }
      if (f) {
        f.passenger = true; const route = traffic.depPath(tA, f); f.route = route; f.st.busy = null;
        // cut straight to the line-up (the taxi is skipped by the cut)
        const L = route.lineup, F = tA.F; f.x = L[0]; f.z = L[1]; f.h = Math.atan2(F.ux * route.dir, F.uz * route.dir); f.phase = 'roll'; f.t = 0; f.v = 0; f.dir = route.dir; f.pitch = 0; tA.rwUser = f;
        const side = 1; let tt = 0;
        boarding.cam = (dt, cam) => { tt += dt; const hx = Math.sin(f.h), hz = Math.cos(f.h), sx = hz * side, sz = -hx * side;
          const k = Math.min(1, tt / 18), back = 40 + k * 60;
          cam.position.set(f.x - hx * back + sx * (55 - k * 30), f.y + 8 + k * 25, f.z - hz * back + sz * (55 - k * 30)); cam.up.set(0, 1, 0); cam.lookAt(f.x, f.y + 3, f.z); return true; };
        game.cameraOverride = boarding.cam;
        await sleep(300); fade(false);
        const t0 = performance.now(); while (performance.now() - t0 < 24000 && !game.input?.pressed?.('Space') && !game.input?.pressed?.('KeyE')) await sleep(100);
      }
    }
    fade(true, `Southline Air &middot; arriving at ${dest.name}`);
    await sleep(1500);
    if (game.cameraOverride === boarding.cam) game.cameraOverride = null;
    if (f) { f.passenger = false; f.gone = true; }
    // arrival: out of the terminal's landside doors at the destination
    const dT = dest.ap.terminal, c = Math.cos(dT.heading), s = Math.sin(dT.heading), lz = -dT.depth / 2 - 4, lx = 7.5;   // just outside the doors, between the canopy columns
    const ax = dT.x + lx * c + lz * s, az = dT.z - lx * s + lz * c;
    try { game.teleport(ax, undefined, az, dT.heading + Math.PI); } catch (e) { /* */ }
    try { P.state.hidden = false; game.setPlayerHidden?.(false); } catch (e) { /* */ }
    try { game.timeOfDay = ((game.timeOfDay ?? 12) + 0.75) % 24; } catch (e) { /* */ }
    await sleep(1800);
    fade(false); game.hud?.notify?.(`Welcome to ${dest.name}`, 3500);
    game.emit?.('airport:arrived', { from: a.id, to: dest.id });
    boarding.active = false; sec.pass = null;
    return true;
  }

  // ---------------------------------------------------------------- per frame
  let lastStream = 0;
  function update(dt) {
    const P = game.player, pp = P?.position; if (!pp) return;
    const t = game.clock?.elapsed ?? 0;
    if (t - lastStream > 0.5) { lastStream = t;
      for (const A of list) { const d = Math.hypot(pp.x - A.cx, pp.z - A.cz); if (A.state === 'idle' && d < BUILD_R) build(A).catch((e) => { console.warn('[airport] build', e); A.state = 'failed'; }); if (A.group) { const vis = d < HIDE_R; if (A.group.visible !== vis) A.group.visible = vis; } } }
    // far from both airports (and no flight with the player aboard): nothing else runs
    let near = false; for (const A of list) if (Math.abs(pp.x - A.cx) < HIDE_R + 1500 && Math.abs(pp.z - A.cz) < HIDE_R + 1500) near = true;
    if (!near && !boarding.active) { if (sec.inside) security(dt); return; }
    const cam = game.camera;
    for (const A of list) {
      if (A.state !== 'live' || !A.group.visible) continue;
      A.parts.lights?.update?.(dt, cam, renderer);
      A.parts.structures?.update?.(dt, cam, t);
      A.parts.terminal?.update?.(dt, pp);
    }
    for (const A of list) if (A.parts.zone) try { A.parts.zone.update(dt); } catch (e) { console.warn('[airport] zone', e); A.parts.zone = null; }
    try { traffic?.update(dt, pp, cam, renderer); } catch (e) { console.warn('[airport] traffic', e); }
    climb.poseUpdate();
    security(dt);
    // prompts: gate podium (board), fence (climb)
    if (!boarding.active) {
      const np = nearPodium();
      const npDest = np && list.find((x) => x !== np.a && !x.military);
      if (np && !npDest) help(game, 'airport', 'No departures today: Key West is a military airfield now');
      else if (np) { const dest = npDest; help(game, 'airport', `Press <b>E</b> to board the flight to ${dest.name} ($${FARE[np.a.id]})`); if (game.input?.pressed?.('KeyE')) board(np.a, np.g); }
      else if (!climb.active && !P.state?.inVehicle && climb.probe()) help(game, 'airport', 'Press <b>SPACE</b> to climb the fence');
      else help(game, 'airport', null);
    }
  }
  game.updaters.push(update);
  const baseA = list.find((a) => a.military);
  game.base = baseA ? {
    get state() { return baseA.state; }, get plan() { return baseA.plan; }, get zone() { return baseA.parts.zone; }, get built() { return baseA.parts.base; },
    // dev teleports: 'gate' (outside the main gate), 'climb' / 'climb2' / 'climb3' (outside a climb spot), 'pad' (the helipad), 'jet'
    spot(name = 'gate') { const P0 = baseA.plan, B = baseA.parts.base; if (!P0) return null;
      if (name.startsWith('climb')) { const c = P0.climbSpots[(+name.slice(5) || 1) - 1]; return c && { x: c.x - c.nx * 4, z: c.z - c.nz * 4 }; }
      if (name === 'pad') return { x: P0.pad.x + 12, z: P0.pad.z };
      if (name === 'jet') { const j = B?.jets?.[0]; return j && { x: j.mesh.position.x + 4, z: j.mesh.position.z + 6 }; }
      const g = B?.gate; return g ? { x: g.x + g.ox * 30, z: g.z + g.oz * 30 } : { x: P0.main.x, z: P0.main.z }; },
    tp(name = 'gate') { const s = this.spot(name) || { x: -4470, z: 6040 }; return game.dev?.teleportTo ? game.dev.teleportTo(s.x, s.z) : game.teleport?.(s.x, undefined, s.z, 0); },
  } : null;
  game.airport = {
    list, at, inAirside, traffic, climb, board, data: DATA,
    onTrespass: (fn) => sec.onTrespass.push(fn),
    fenceStats: () => list.filter((a) => a.parts.fence).map((a) => ({ id: a.id, ...a.parts.fence.stats })),
    stats: () => list.map((a) => ({ id: a.id, state: a.state, ...a.stats })),
    build: (id) => { const A = list.find((a) => a.id === id); if (A && A.state === 'idle') return build(A); },
  };
}
