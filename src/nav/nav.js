// SOUTHLINE V2 navigation: game.nav. Glues the graph, the router, live traffic, the worker, the walking and boat routers,
// guidance (progress, re-route, prompts, ETA) and the consumer API for AI drivers, police, jobs and the map.

import { buildNavGraph, setControls, snap, KINDS, AF, str, edgePointAt } from './graph.js';
import { Router, computeLandmarks, compileProfile, PROFILES } from './engine.js';
import { assembleRoute, progressOn, remainingLine } from './route.js';
import { TrafficModel } from './traffic.js';
import { harvestControls } from './controls.js';
import { walkRoute, assembleWalk, buildWalkGraph } from './walk.js';
import { buildWaterGrid, waterMask, boatRoute, assembleBoat, assembleAir, BOAT_PROFILES } from './boat.js';
import { createPlaces } from './places.js';
import { createWorkerCore } from './workerCore.js';
import { formatDistance, formatDuration, formatClock, phrase, spoken, shortName, roadLabel, M_PER_MI } from './maneuvers.js';
import { drawRoute } from './draw.js';

const now = () => performance.now();
const OFF_TOL = { drive: 26, walk: 16, boat: 70, air: 400 };
const ARRIVE_R = { drive: 24, walk: 7, boat: 40, air: 120 };

export function createNav(game, opts = {}) {
  const listeners = new Map();
  const nav = {
    version: 1, ready: false, available: false, mode: 'walk', modeOverride: null,
    settings: { voice: true, avoidHighways: false, lanes: true, autoReroute: true },
    G: null, router: null, traffic: null, walk: null, water: null, places: null, worker: null,
    active: null, // current guidance state (see setDestination)
    stats: { reroutes: 0, lastPlanMs: 0, lastTreeMs: 0, lastRerouteMs: 0, worker: false, plans: 0 },
    format: { distance: formatDistance, duration: formatDuration, clock: formatClock, shortName, roadLabel, phrase, spoken },
    profiles: PROFILES, boatProfiles: BOAT_PROFILES,
    onSpeak: null, // audio hook: (text, info) => void
    on(name, fn) { let l = listeners.get(name); if (!l) listeners.set(name, (l = [])); l.push(fn); return () => l.splice(l.indexOf(fn), 1); },
  };
  const emit = (name, data) => {
    for (const fn of listeners.get(name) || []) { try { fn(data); } catch (e) { console.warn('[nav]', name, e); } }
    try { game.emit?.(name, data); } catch (e) { /* */ }
  };
  let G = null, router = null, traffic = null, core = null, worker = null, reqId = 0;
  const pending = new Map();
  let lastWp = null, clockHour = -1, trafficSentVersion = -1;
  const player = () => game.player;

  // ------------------------------------------------------------------------------------------------ worker plumbing
  function post(msg, transfer) {
    if (worker) worker.postMessage(msg, transfer || []);
    else if (core) setTimeout(() => core(msg), 0); // same code on the main thread when workers are not available
  }
  function ask(type, payload) { return new Promise((resolve) => { const id = ++reqId; pending.set(id, resolve); post({ type, id, ...payload }); }); }
  function onWorkerMessage(m) {
    switch (m.type) {
      case 'ready': nav.stats.workerReady = true; break;
      case 'landmarks': if (m.lm && router) { router.setLandmarks(m.lm); nav.stats.landmarkMs = m.lm.ms; nav.stats.landmarks = m.lm.count; emit('navLandmarks', { ms: m.lm.ms }); } break;
      case 'walk': nav.walk = m.W; nav.stats.walk = m.W.stats; emit('navWalkReady', m.W.stats); if (nav.active && nav.active.mode === 'walk' && !nav.active.route) plan('walk-ready'); break;
      case 'result': { const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m.raw ?? null); } break; }
      case 'planRoute': onPlanRoute(m); break;
      case 'planTree': onPlanTree(m); break;
      case 'error': { console.warn('[nav worker]', m.message); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(null); } break; }
      default: break;
    }
  }
  function startWorker() {
    try {
      if (opts.worker === false || typeof Worker === 'undefined') throw new Error('no worker');
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => onWorkerMessage(e.data);
      worker.onerror = (e) => { console.warn('[nav] worker failed, using the main thread', e?.message || e); try { worker.terminate(); } catch (er) { /* */ } worker = null; nav.stats.worker = false; core = createWorkerCore((msg) => onWorkerMessage(msg)); initCore(); };
      nav.stats.worker = true; nav.worker = worker;
    } catch (e) { worker = null; core = createWorkerCore((msg) => onWorkerMessage(msg)); nav.stats.worker = false; }
  }
  const cloneG = () => { const c = { ...G }; return c; };
  function initCore() {
    post({ type: 'init', G: cloneG(), landmarks: opts.landmarks || 16 });
    sendTraffic(true);
    if (nav._walkInit) post(nav._walkInit);
  }
  function sendTraffic(force) {
    if (!traffic || (!force && trafficSentVersion === traffic.version)) return;
    trafficSentVersion = traffic.version;
    router.setTraffic(traffic.mult, traffic.block, traffic.version);
    post({ type: 'traffic', mult: traffic.mult.slice(), block: traffic.block.slice(), version: traffic.version });
  }

  // ------------------------------------------------------------------------------------------------ init
  nav.init = async function init() {
    const city = game.city;
    const rg = city?.roadGraph;
    if (!rg || !rg.edges?.length) { console.warn('[nav] no road graph'); return nav; }
    const t0 = now();
    G = buildNavGraph(rg, { zoneAt: city.zoneAt, districtAt: city.districtAt, restrictions: rg.restrictions || city.turnRestrictions });
    router = new Router(G);
    traffic = new TrafficModel(G);
    nav.G = G; nav.router = router; nav.traffic = traffic;
    traffic.setTime(game.timeOfDay ?? 9, dayNumber(), 0);
    router.setTraffic(traffic.mult, traffic.block, traffic.version);
    nav.places = createPlaces(game, G);
    try { nav.places.index(city); } catch (e) { console.warn('[nav] places', e); }
    nav.stats.graph = G.stats; nav.stats.graphMs = Math.round(now() - t0);
    startWorker(); initCore();
    nav.available = true; nav.ready = true;
    emit('navReady', nav.stats);
    // background: signals and stop signs, water grid, walk graph, world places
    lateInit().catch((e) => console.warn('[nav] late init', e));
    return nav;
  };
  const frame = () => new Promise((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
  async function lateInit() {
    const city = game.city, data = game.miamiData || city;
    try {
      const c = await harvestControls(data, frame);
      if (c.signals.length || c.stops.length) {
        setControls(G, c.signals, c.stops); router.graphChanged();
        post({ type: 'controls', signals: c.signals, stops: c.stops });
        nav.stats.signals = G.stats.signals; nav.stats.stopSigns = c.stops.length;
        if (nav.active?.mode === 'drive' && nav.active.dest) plan('controls');
      }
    } catch (e) { console.warn('[nav] controls', e); }
    try {
      if (typeof city.isWater === 'function' && city.bounds) {
        nav.water = await buildWaterGrid({ bounds: city.bounds, isWater: city.isWater, depthAt: city.seabedDepthAt || data.seabedDepthAt, G, seaLevel: city.seaLevel }, frame);
        nav.stats.water = nav.water.stats;
        post({ type: 'grid', grid: stripScratch(nav.water) });
      }
    } catch (e) { console.warn('[nav] water grid', e); }
    try {
      const L = city.mapLayers || {};
      const areas = [...(L.park || []).map((p) => ({ kind: 'park', outer: p.outer, holes: p.holes, name: p.name })), ...(L.beach || []).map((p) => ({ kind: 'beach', outer: p.outer, holes: p.holes, name: p.name }))];
      nav._walkInit = { type: 'walkInit', paths: (data.paths || []).map((p) => ({ kind: p.kind, width: p.width, surface: p.surface, bridge: p.bridge, name: p.name, pf: p.pf || Float32Array.from((p.pts || []).flat()) })),
        sidewalks: (data.sidewalkLines || []).map((s) => ({ edge: s.edge, pf: s.pf })), areas, water: nav.water ? waterMask(nav.water) : null };
      post(nav._walkInit);
    } catch (e) { console.warn('[nav] walk init', e); }
    try { // world places (towns, airport, keys) once world-layout has published them
      const r = await fetch('/assets/world/layout.json'); if (r.ok) { const j = await r.json(); for (const p of j.places || []) nav.places.register({ id: `w:${p.name}`, name: p.name, kind: p.kind, category: p.kind === 'airport' ? 'airport' : null, x: p.x, z: p.z, source: 'world' }); }
    } catch (e) { /* not there yet */ }
  }
  const stripScratch = (o) => { const c = {}; for (const k in o) if (k[0] !== '_') c[k] = o[k]; return c; };
  const dayNumber = () => game.day ?? game.clock?.day ?? game.time?.day ?? 0;

  // ------------------------------------------------------------------------------------------------ consumer API
  const profileFor = (o) => (o?.profile ? o.profile : nav.settings.avoidHighways ? 'streets' : 'car');
  const pt = (p) => (p.position ? { x: p.position.x, z: p.position.z, y: p.position.y, heading: p.heading, speed: p.speed } : p);

  /** Nearest drivable road: { edgeId, x, z, dist, heading, name, kind, lanes, oneway, speedLimitMph, s } or null */
  nav.nearestRoad = (x, z, o = {}) => {
    if (!G) return null;
    const s = snap(G, x, z, { maxDist: o.maxDist ?? 400, y: o.y, need: o.connected === false ? 0 : 0, avoidFreeway: !!o.avoidFreeway, heading: o.heading });
    if (!s) return null;
    const k = s.edge;
    return { edgeId: G.eId[k], edge: k, s: s.s, x: s.x, z: s.z, y: s.y, dist: s.dist, heading: Math.atan2(s.dx, s.dz), name: str(G, G.eName[k]), ref: str(G, G.eRef[k]), kind: KINDS[G.eKind[k]],
      lanes: G.eLanesF[k] + G.eLanesB[k], oneway: !!(G.eFlags[k] & AF.ONEWAY), bridge: !!(G.eFlags[k] & AF.BRIDGE), speedLimitMph: Math.round(G.eLimit[k] / 0.44704 / 5) * 5 };
  };

  /** Synchronous route on the main thread. mode: 'drive' | 'walk' | 'boat' | 'air'. Returns a Route or null. */
  nav.routeSync = (from, to, o = {}) => {
    from = pt(from); to = pt(to);
    const mode = o.mode || 'drive';
    if (mode === 'air') return assembleAir(from, to, o);
    if (mode === 'walk') {
      if (!nav.walk) return directRoute(from, to, 'walk', 1.4, o);
      const raw = walkRoute(nav.walk, from, to, o); return raw ? assembleWalk(nav.walk, G, raw, o) : directRoute(from, to, 'walk', 1.4, o);
    }
    if (mode === 'boat') {
      if (!nav.water) return null;
      const raw = boatRoute(nav.water, from, to, { profile: o.profile }); return raw ? assembleBoat(nav.water, G, raw, { ...o, nameAt: game.city?.districtAt, profileName: typeof o.profile === 'string' ? o.profile : 'boat' }) : null;
    }
    if (!router) return null;
    const raw = router.route(from, to, { ...o, profile: profileFor(o) });
    return raw ? assembleRoute(G, router, raw, { from, to, destName: o.destName, lanes: o.lanes ?? nav.settings.lanes }) : null;
  };
  /** Route computed in the worker (no frame cost). Same result as routeSync. */
  nav.route = async (from, to, o = {}) => {
    from = pt(from); to = pt(to);
    const mode = o.mode || 'drive';
    if (mode === 'air') return assembleAir(from, to, o);
    if (mode === 'walk') { if (!nav.walk) return directRoute(from, to, 'walk', 1.4, o); const raw = await ask('walkRoute', { from, to, opts: { speed: o.speed } }); return raw ? assembleWalk(nav.walk, G, raw, o) : directRoute(from, to, 'walk', 1.4, o); }
    if (mode === 'boat') { if (!nav.water) return null; const raw = await ask('boatRoute', { from, to, opts: { profile: o.profile } }); return raw ? assembleBoat(nav.water, G, raw, { ...o, nameAt: game.city?.districtAt }) : null; }
    if (!router) return null;
    const raw = await ask('route', { from, to, opts: { profile: profileFor(o) } });
    return raw ? assembleRoute(G, router, raw, { from, to, destName: o.destName, lanes: o.lanes ?? nav.settings.lanes }) : null;
  };
  function directRoute(from, to, mode, speed, o) { const r = assembleAir(from, to, { cruise: speed, destName: o?.destName }); r.mode = mode; r.profile = mode; r.maneuvers[0].text = r.maneuvers[0].text.replace('Fly', 'Head'); return r; }
  /** { time (s), length (m), text } without building geometry. Sync. */
  nav.eta = (from, to, o = {}) => {
    from = pt(from); to = pt(to);
    const mode = o.mode || 'drive';
    if (mode !== 'drive') { const r = nav.routeSync(from, to, o); return r ? { time: r.time, length: r.length, text: formatDuration(r.time) } : null; }
    if (!router) return null;
    const raw = router.route(from, to, { profile: profileFor(o) }); if (!raw) return null;
    const ev = router.evaluate(raw.arcs, raw.startS, raw.endS, compileProfile(profileFor(o)).metric === 'time' ? profileFor(o) : 'car');
    return { time: ev.time, length: ev.length, text: formatDuration(ev.time), miles: ev.length / M_PER_MI };
  };
  /**
   * Where a suspect could be after `seconds` from a last known point: for the police search.
   * returns { center, radius, edges:Set(edgeId), contains(x, z), seconds }
   */
  nav.searchArea = (from, seconds, o = {}) => {
    from = pt(from);
    const mode = o.mode || 'drive';
    if (mode !== 'drive' || !router) { const r = seconds * (mode === 'boat' ? 14 : mode === 'walk' ? 3.2 : 20); return { center: { x: from.x, z: from.z }, radius: r, edges: new Set(), seconds, contains: (x, z) => Math.hypot(x - from.x, z - from.z) <= r }; }
    const iso = router.isochrone(from, seconds, { profile: o.profile || 'aggressive', anyDirection: true });
    if (!iso) return null;
    const edges = new Set(); for (let i = 0; i < iso.arcs.length; i++) if (iso.t[i] <= seconds + 4) edges.add(G.eId[G.aEdge[iso.arcs[i]]]);
    const idx = new Set(); for (let i = 0; i < iso.arcs.length; i++) idx.add(G.aEdge[iso.arcs[i]]);
    const s = {};
    return { center: iso.center, radius: iso.radius, edges, seconds, arcs: iso.arcs, times: iso.t,
      contains(x, z) { if (Math.hypot(x - iso.center.x, z - iso.center.z) > iso.radius + 60) return false; const q = snap(G, x, z, { maxDist: 90 }, s); return !!q && idx.has(q.edge); } };
  };
  /** Taxi / rideshare / delivery price for a trip (drive time and distance, surge with traffic). */
  nav.fare = (from, to, o = {}) => {
    const e = nav.eta(from, to, { profile: 'taxi' }); if (!e) return null;
    const kind = o.kind || 'taxi', miles = e.length / M_PER_MI, min = e.time / 60;
    const rate = kind === 'rideshare' ? { base: 2.2, mile: 1.35, min: 0.32, minFare: 7 } : kind === 'delivery' ? { base: 3.5, mile: 0.95, min: 0.12, minFare: 5 } : { base: 2.95, mile: 2.4, min: 0.4, minFare: 6 };
    const surge = kind === 'rideshare' ? Math.min(2.5, Math.max(1, avgCongestionNear(pt(from)))) : 1;
    const price = Math.max(rate.minFare, (rate.base + rate.mile * miles + rate.min * min) * surge);
    return { price: Math.round(price * 100) / 100, miles, minutes: min, surge: Math.round(surge * 10) / 10, kind };
  };
  /** Cost of a fast-travel trip (a cab you skip): grows with the drive, never free. */
  nav.fastTravelCost = (from, to) => { const f = nav.fare(from, to, { kind: 'taxi' }); return f ? { price: Math.ceil(f.price * 1.15), minutes: f.minutes, miles: f.miles, gameHours: (f.minutes * 60) * 24 / ((game.settings?.dayMinutes || 144) * 60) } : null; };
  function avgCongestionNear(p) { let s = 0, n = 0; const q = {}; for (const [dx, dz] of [[0, 0], [150, 0], [-150, 0], [0, 150], [0, -150]]) { const r = snap(G, p.x + dx, p.z + dz, { maxDist: 200 }, q); if (r) { const a = G.eArcF[r.edge]; s += traffic.mult[a]; n++; } } return n ? s / n : 1; }
  /** Nearest places of a category ranked by real drive (or walk) time. */
  nav.nearest = (category, from, o = {}) => {
    from = pt(from || player().position);
    const cands = nav.places.nearest(category, from, { limit: o.candidates ?? 8 });
    for (const c of cands) { const e = nav.eta(from, c, { mode: o.mode || 'drive' }); c.time = e ? e.time : Infinity; c.routeLength = e ? e.length : Infinity; }
    cands.sort((a, b) => a.time - b.time);
    return cands.slice(0, o.limit ?? 5);
  };
  /** Best visiting order for delivery / multi-stop jobs (nearest neighbor + 2-opt on drive times). Returns { order:[indices], time, legs }. */
  nav.optimizeStops = (from, stops, o = {}) => {
    from = pt(from); const P = [from, ...stops.map(pt)], n = P.length;
    const T = []; for (let i = 0; i < n; i++) { T.push(new Float64Array(n)); for (let j = 0; j < n; j++) if (i !== j && j !== 0) { const e = nav.eta(P[i], P[j], o); T[i][j] = e ? e.time : 1e7; } }
    const order = [0], left = new Set(); for (let i = 1; i < n; i++) left.add(i);
    while (left.size) { const c = order[order.length - 1]; let b = -1; for (const j of left) if (b < 0 || T[c][j] < T[c][b]) b = j; order.push(b); left.delete(b); }
    const cost = (ord) => { let s = 0; for (let i = 0; i < ord.length - 1; i++) s += T[ord[i]][ord[i + 1]]; return s; };
    let improved = true; while (improved) { improved = false; for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) { const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1)); if (cost(cand) < cost(order) - 1) { order.splice(0, n, ...cand); improved = true; } } }
    return { order: order.slice(1).map((i) => i - 1), time: cost(order) };
  };

  // ------------------------------------------------------------------------------------------------ traffic API + events
  nav.addIncident = (o) => { if (!traffic) return null; const id = traffic.addIncident(o); afterTrafficChange('incident'); emit('navIncident', { id, ...o }); return id; };
  nav.removeIncident = (id) => { if (traffic?.removeIncident(id)) afterTrafficChange('incident-cleared'); };
  nav.trafficLevelAt = (x, z) => { const s = snap(G, x, z, { maxDist: 60 }); if (!s) return 0; return Math.max(traffic.level(G.eArcF[s.edge]), G.eArcB[s.edge] >= 0 ? traffic.level(G.eArcB[s.edge]) : 0); };
  function afterTrafficChange(reason) { sendTraffic(false); if (nav.active?.dest && nav.active.mode === 'drive') plan(reason === 'clock' ? 'traffic' : reason); }
  function wireEvents() {
    if (typeof game.on !== 'function') return;
    const pos = (d) => { const p = d?.position || d?.point || d?.pos || d; return p && isFinite(p.x) && isFinite(p.z) ? p : null; };
    let lastCrash = 0;
    game.on('crash', (d) => {
      const p = pos(d); if (!p || !traffic) return;
      const sev = d.severity ?? d.impact ?? d.force ?? d.speed ?? 8;
      if (sev < 6 || now() - lastCrash < 1500) return;
      for (const inc of traffic.incidents.values()) if (inc.kind === 'crash' && Math.hypot(inc.x - p.x, inc.z - p.z) < 35) return;
      lastCrash = now();
      nav.addIncident({ kind: 'crash', x: p.x, z: p.z, y: p.y, heading: d.heading, factor: Math.min(5, 2 + sev * 0.08), ttl: 90 + Math.min(150, sev * 4) });
    });
    for (const ev of ['roadblock', 'policeRoadblock', 'roadblockPlaced']) game.on(ev, (d) => { const p = pos(d); if (p) nav.addIncident({ id: d.id !== undefined ? `rb:${d.id}` : undefined, kind: 'roadblock', x: p.x, z: p.z, y: p.y, heading: d.heading, ttl: d.ttl ?? 300 }); });
    for (const ev of ['roadblockRemoved', 'roadblockCleared', 'policeRoadblockRemoved']) game.on(ev, (d) => { if (d?.id !== undefined && traffic.removeIncident(`rb:${d.id}`)) return afterTrafficChange('incident-cleared'); const p = pos(d); if (p && traffic.removeIncidentsNear(p.x, p.z, 50, 'roadblock')) afterTrafficChange('incident-cleared'); });
    game.on('roadClosed', (d) => { const p = pos(d); if (p) nav.addIncident({ id: d.id !== undefined ? `rc:${d.id}` : undefined, kind: 'closure', x: p.x, z: p.z, radius: d.radius, hard: d.hard !== false, ttl: d.ttl ?? Infinity }); });
    game.on('roadOpened', (d) => { if (d?.id !== undefined && traffic.removeIncident(`rc:${d.id}`)) return afterTrafficChange('incident-cleared'); const p = pos(d); if (p && traffic.removeIncidentsNear(p.x, p.z, d.radius ?? 60, 'closure')) afterTrafficChange('incident-cleared'); });
    game.on('drawbridge', (d) => { const p = pos(d); if (!p) return; if (d.open || d.up) nav.addIncident({ id: `db:${d.id ?? 0}`, kind: 'drawbridge', x: p.x, z: p.z, radius: 70, ttl: d.ttl ?? 120 }); else nav.removeIncident(`db:${d.id ?? 0}`); });
  }

  // ------------------------------------------------------------------------------------------------ destination and guidance
  function autoMode() {
    if (nav.modeOverride) return nav.modeOverride;
    const st = player()?.state, v = st?.inVehicle ? st.vehicle : null;
    if (!v) return 'walk';
    if (v.isBoat || v.isJetSki || v.type === 'boat') return 'boat';
    if (v.isAircraft || v.isHeli || v.isPlane || v.isHelicopter || v.flying) return 'air';
    return 'drive';
  }
  function resolveDest(d) {
    if (!d) return null;
    if (typeof d === 'string') { const r = nav.places.get(d) || nav.places.search(d, { near: player()?.position, limit: 1 })[0]; return r ? { x: r.x, z: r.z, name: r.name, placeId: r.id } : null; }
    if (d.position) return { x: d.position.x, z: d.position.z, name: d.name || null };
    return isFinite(d.x) && isFinite(d.z) ? { x: d.x, z: d.z, name: d.name || null, placeId: d.id || null } : null;
  }
  /** Start guidance. dest: { x, z, name? } | place id | search text. opts: { stops:[...], mode, profile, silent } */
  nav.setDestination = (dest, o = {}) => {
    const d = resolveDest(dest);
    if (!d) return false;
    nav.active = { dest: d, stops: (o.stops || []).map(resolveDest).filter(Boolean), mode: o.mode || autoMode(), profile: o.profile || null, route: null, tree: null, planId: 0, prog: { i: -1 }, progState: { i: -1 },
      next: null, distToNext: 0, remainingDist: 0, remainingTime: 0, offT: 0, wrongT: 0, lastPlanAt: 0, said: new Map(), legs: [], startedAt: now(), silent: !!o.silent, fromWaypoint: !!o.fromWaypoint, arrived: false, pendingReason: null };
    if (!o.fromWaypoint) { game.waypoint = { x: d.x, z: d.z }; lastWp = game.waypoint; }
    plan('new');
    planLegs();
    emit('navDestination', { dest: d, stops: nav.active.stops });
    return true;
  };
  nav.addStop = (dest, index = null) => { const d = resolveDest(dest); if (!d) return false; if (!nav.active) return nav.setDestination(d); const all = [nav.active.dest, ...nav.active.stops]; if (index === null) all.push(d); else all.splice(index, 0, d); const cur = all[0]; nav.active.stops = all.slice(1); if (cur !== nav.active.dest) { nav.active.dest = cur; game.waypoint = { x: cur.x, z: cur.z }; lastWp = game.waypoint; plan('new'); } planLegs(); emit('navDestination', { dest: nav.active.dest, stops: nav.active.stops }); return true; };
  nav.removeStop = (i) => { const A = nav.active; if (!A || i < 0 || i >= A.stops.length) return false; A.stops.splice(i, 1); planLegs(); return true; };
  nav.clear = (o = {}) => { if (!nav.active) return; nav.active = null; if (!o.keepWaypoint) { game.waypoint = null; lastWp = null; } emit('navCleared', { reason: o.reason || 'user' }); };
  nav.setMode = (m) => { nav.modeOverride = m || null; };
  nav.destinations = () => (nav.active ? [nav.active.dest, ...nav.active.stops] : []);

  async function planLegs() { // routes between the later stops (for total ETA and the map)
    const A = nav.active; if (!A) return;
    const pts = [A.dest, ...A.stops], legs = [];
    for (let i = 0; i < pts.length - 1; i++) { const r = await nav.route(pts[i], pts[i + 1], { mode: A.mode === 'air' ? 'drive' : A.mode, destName: pts[i + 1].name }); if (nav.active !== A) return; legs.push(r); }
    A.legs = legs;
  }
  function origin() {
    const p = player(), st = p.state, v = st?.inVehicle ? st.vehicle : null;
    return { x: p.position.x, z: p.position.z, y: p.position.y, heading: motion.speed > 2 ? motion.heading : (v ? vehHeading(v) ?? p.heading : p.heading), speed: motion.speed };
  }
  const vehHeading = (v) => (typeof v.heading === 'number' ? v.heading : null);
  const motion = { x: 0, z: 0, heading: 0, speed: 0, has: false };

  function plan(reason) {
    const A = nav.active; if (!A || !A.dest) return;
    const from = origin(), to = { x: A.dest.x, z: A.dest.z };
    A.lastPlanAt = now(); A.pendingReason = reason;
    nav.stats.plans++;
    if (A.mode === 'drive') {
      if (!router) return;
      const id = ++reqId; A.planId = id; A.planSent = now();
      post({ type: 'plan', id, from, to, opts: { profile: A.profile || profileFor() } });
    } else {
      const id = ++reqId; A.planId = id; A.planSent = now();
      const prof = A.mode === 'boat' ? boatProfileOf() : undefined;
      (A.mode === 'air' ? Promise.resolve(assembleAir(from, to, { destName: A.dest.name })) : nav.route(from, to, { mode: A.mode, destName: A.dest.name, profile: prof })).then((r) => {
        if (nav.active !== A || A.planId !== id) return;
        if (!r) { emit('navNoRoute', { dest: A.dest, mode: A.mode }); return; }
        adopt(r, reason);
      });
    }
  }
  function boatProfileOf() { const v = player()?.state?.vehicle; const k = v?.spec?.class || v?.typeKey || ''; return /yacht/i.test(k) ? 'yacht' : /sail/i.test(k) ? 'sailboat' : /jet/i.test(k) ? 'jetski' : /police/i.test(k) ? 'police' : 'boat'; }
  function onPlanRoute(m) {
    const A = nav.active; if (!A || A.planId !== m.id) return;
    nav.stats.lastPlanMs = m.raw ? m.raw.ms : 0; nav.stats.lastPlanRoundTripMs = now() - A.planSent;
    if (!m.raw) { emit('navNoRoute', { dest: A.dest, mode: A.mode }); return; }
    const reason = A.pendingReason;
    const r = assembleRoute(G, router, m.raw, { from: origin(), to: A.dest, destName: A.dest.name, lanes: nav.settings.lanes });
    if ((reason === 'traffic' || reason === 'incident' || reason === 'incident-cleared' || reason === 'controls') && A.route && A.route.mode === 'drive') {
      // conditions changed while driving: keep the current route unless the new one is clearly faster now
      const cur = remainingOnCurrent(A);
      if (sameish(A.route, r)) return; // same roads: the times were refreshed in place, the line does not flicker
      if (cur - r.time > Math.max(40, cur * 0.08)) { adopt(r, reason); if (cur < Infinity) say(`Faster route found, saving ${formatDuration(cur - r.time)}`, { kind: 'reroute' }); else say('Road closed ahead. Rerouting', { kind: 'reroute' }); }
      return;
    }
    adopt(r, reason);
  }
  function onPlanTree(m) { const A = nav.active; if (!A || A.planId !== m.id || !m.tree) return; A.tree = m.tree; nav.stats.lastTreeMs = m.tree.ms; }
  function sameish(a, b) { if (!a || !b || a.mode !== 'drive') return false; const sa = new Set(a.arcs); let common = 0; for (const x of b.arcs) if (sa.has(x)) common++; return common >= b.arcs.length * 0.9; }
  function remainingOnCurrent(A) { // time left on the current route under the traffic of this moment (Infinity if it is now closed)
    const r = A.route, cost = router.costs(compileProfile(r.profile));
    for (let i = A.prog.arc ?? 0; i < r.arcs.length; i++) if (cost[r.arcs[i]] === Infinity) return Infinity;
    refreshTimes(A); updateProgress(A, 0);
    return A.remainingTime;
  }
  function refreshTimes(A) { const r = A.route; if (!r || r.mode !== 'drive') return; const nr = assembleRoute(G, router, { arcs: r.arcs, startS: r.startS, endS: r.endS, cost: r.cost, snapFrom: r.snapFrom, snapTo: r.snapTo, profile: r.profile }, { from: r.from, to: r.to, destName: r.destName, lanes: nav.settings.lanes }); r.arcT = nr.arcT; r.time = nr.time; for (let i = 0; i < r.maneuvers.length && i < nr.maneuvers.length; i++) r.maneuvers[i].time = nr.maneuvers[i].time; }
  function adopt(route, reason) {
    const A = nav.active; if (!A) return;
    const first = !A.route;
    A.route = route; A.progState.i = -1; A.offT = 0; A.wrongT = 0; A.said = new Map(); A.mode = route.mode === 'walk' || route.mode === 'boat' || route.mode === 'air' ? route.mode : A.mode;
    updateProgress(A, 0);
    emit('navRoute', { route, reason, first });
    if (reason === 'off-route' || reason === 'wrong-way') { nav.stats.reroutes++; emit('navReroute', { route, reason }); }
    if (!A.silent && (first || reason === 'new' || reason === 'mode')) {
      const m1 = route.maneuvers[1], dep = route.maneuvers[0];
      say(`${dep.text}${m1 && m1.type !== 'arrive' && m1.at < 500 ? `, then ${lower(m1.text)}` : ''}. ${formatDistance(route.length).spoken}, about ${formatDuration(route.time).replace('min', 'minutes').replace('hr', 'hours')}.`, { kind: 'start', maneuver: dep });
    } else if (!A.silent && (reason === 'off-route' || reason === 'wrong-way')) say('Rerouting', { kind: 'reroute' });
  }
  const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
  function say(text, info = {}) {
    emit('navPrompt', { text, ...info });
    if (!nav.settings.voice) return;
    try { if (typeof nav.onSpeak === 'function') nav.onSpeak(text, info); else game.audio?.speakNav?.(text, info); } catch (e) { /* */ }
  }

  function updateProgress(A, dt) {
    const r = A.route, p = player().position;
    progressOn(r, p.x, p.z, A.progState, A.prog);
    const d = A.prog.d;
    A.remainingDist = Math.max(0, r.length - d);
    A.remainingTime = Math.max(0, r.time - A.prog.t);
    let nx = null;
    for (const m of r.maneuvers) if (m.type !== 'depart' && m.at > d + 2) { nx = m; break; }
    if (!nx) nx = r.maneuvers[r.maneuvers.length - 1];
    A.next = nx; A.distToNext = Math.max(0, nx.at - d);
    A.then = r.maneuvers[nx.index + 1] && r.maneuvers[nx.index + 1].at - nx.at < 220 ? r.maneuvers[nx.index + 1] : null;
    let total = A.remainingTime, totalD = A.remainingDist; for (const l of A.legs) if (l) { total += l.time; totalD += l.length; }
    A.totalTime = total; A.totalDist = totalD;
    const dayMin = game.settings?.dayMinutes || 144;
    A.etaClock = formatClock((game.timeOfDay ?? 12) + total * 24 / (dayMin * 60));
    // current road
    if (r.mode === 'drive') { const a = r.arcs[A.prog.arc]; A.road = str(G, G.eName[G.aEdge[a]]) || str(G, G.eRef[G.aEdge[a]]); A.speedLimitMph = Math.round(G.eLimit[G.aEdge[a]] / 0.44704 / 5) * 5; A.traffic = traffic.level(a); }
    else { A.road = null; A.speedLimitMph = null; A.traffic = 0; }
    void dt;
  }
  function prompts(A) {
    const m = A.next; if (!m || A.silent) return;
    const v = Math.max(motion.speed, A.mode === 'walk' ? 1.4 : 3);
    const d = A.distToNext, key = m.index;
    let s = A.said.get(key) || 0;
    const far = A.mode === 'drive' ? (v > 22 ? 1609 : 800) : A.mode === 'boat' ? 600 : 0;
    const mid = A.mode === 'walk' ? 45 : Math.max(180, Math.min(420, v * 16));
    const near = A.mode === 'walk' ? 14 : Math.max(55, Math.min(150, v * 6));
    const nowR = A.mode === 'walk' ? 5 : Math.max(18, v * 1.6);
    let stage = 0;
    if (d <= nowR) stage = 4; else if (d <= near) stage = 3; else if (d <= mid) stage = 2; else if (far && d <= far && m.length !== undefined && d > far * 0.7) stage = 1;
    if (stage > s) {
      A.said.set(key, stage);
      if (stage === 3 && s === 2 && d > near * 0.6 && false) return;
      const text = stage === 4 ? spoken(m, 0) : spoken(m, d) + (stage >= 2 && A.then && A.then.type !== 'arrive' ? `, then ${lower(A.then.text)}` : '');
      say(text, { kind: 'maneuver', stage, maneuver: m, distance: d });
    }
  }

  nav.update = function update(dt) {
    if (!nav.ready) return;
    const P = player(); if (!P?.position) return;
    // motion estimate (works for any vehicle type)
    if (motion.has && dt > 0) { const dx = P.position.x - motion.x, dz = P.position.z - motion.z, sp = Math.hypot(dx, dz) / dt; if (sp < 120) { motion.speed += (sp - motion.speed) * Math.min(1, dt * 6); if (sp > 1.5) motion.heading = Math.atan2(dx, dz); } }
    motion.x = P.position.x; motion.z = P.position.z; motion.has = true;
    nav.mode = autoMode();
    // traffic clock: refresh every 10 game minutes; incidents tick in real seconds
    const hour = game.timeOfDay ?? 12;
    if (traffic) {
      if (clockHour < 0 || Math.abs(hour - clockHour) > 1 / 6) { clockHour = hour; traffic.setTime(hour, dayNumber(), game.weather?.rain ?? game.env?.rain ?? 0); afterTrafficChange('clock'); }
      if (traffic.tick(dt) | traffic.flushProbes()) afterTrafficChange('incident-cleared');
    }
    // the HUD's map sets game.waypoint: follow it
    const wp = game.waypoint;
    if (wp !== lastWp) {
      lastWp = wp;
      if (wp && isFinite(wp.x) && isFinite(wp.z)) { if (!nav.active || Math.hypot(nav.active.dest.x - wp.x, nav.active.dest.z - wp.z) > 1) nav.setDestination({ x: wp.x, z: wp.z, name: wp.name || null }, { fromWaypoint: true }); }
      else if (!wp && nav.active) nav.clear({ keepWaypoint: true, reason: 'waypoint' });
    }
    const A = nav.active; if (!A) return;
    if (nav.mode !== A.mode && !nav.modeOverride) { A.mode = nav.mode; A.route = null; A.tree = null; plan('mode'); planLegs(); return; }
    if (!A.route) { if (now() - A.lastPlanAt > 2500) plan(A.pendingReason || 'new'); return; }
    updateProgress(A, dt);
    // arrival
    const p = P.position, dEnd = Math.hypot(p.x - A.dest.x, p.z - A.dest.z);
    if (A.remainingDist < ARRIVE_R[A.mode] || dEnd < ARRIVE_R[A.mode] * 0.8) {
      say(A.dest.name ? `You have arrived at ${A.dest.name}` : 'You have arrived', { kind: 'arrive' });
      emit('navArrive', { dest: A.dest, more: A.stops.length });
      if (A.stops.length) { const nd = A.stops.shift(); A.dest = nd; A.route = null; A.tree = null; A.legs.shift(); game.waypoint = { x: nd.x, z: nd.z }; lastWp = game.waypoint; plan('new'); }
      else { nav.active = null; if (game.waypoint) { game.waypoint = null; lastWp = null; } emit('navCleared', { reason: 'arrived' }); }
      return;
    }
    // off route / wrong way
    const tol = OFF_TOL[A.mode] + (A.mode === 'drive' ? 0 : 0);
    if (A.prog.dist > tol) A.offT += dt; else A.offT = Math.max(0, A.offT - dt * 2);
    if (A.mode === 'drive' && motion.speed > 4 && A.prog.dist <= tol) {
      const i = A.prog.i, lx = A.route.line[2 * i + 2] - A.route.line[2 * i], lz = A.route.line[2 * i + 3] - A.route.line[2 * i + 1], l = Math.hypot(lx, lz) || 1;
      const al = (Math.sin(motion.heading) * lx + Math.cos(motion.heading) * lz) / l;
      if (al < -0.6) A.wrongT += dt; else A.wrongT = Math.max(0, A.wrongT - dt * 3);
    } else A.wrongT = Math.max(0, A.wrongT - dt);
    if (nav.settings.autoReroute && now() - A.lastPlanAt > 700 && (A.offT > 0.5 || A.wrongT > 2.2)) {
      const reason = A.offT > 0.5 ? 'off-route' : 'wrong-way';
      A.offT = 0; A.wrongT = 0;
      if (A.mode === 'drive' && A.tree && A.tree.trafficVersion === router.trafficVersion) {
        const t0 = now();
        const raw = router.fromTree(A.tree, origin(), { profile: A.tree.profile });
        if (raw) { const r = assembleRoute(G, router, raw, { from: origin(), to: A.dest, destName: A.dest.name, lanes: nav.settings.lanes }); nav.stats.lastRerouteMs = now() - t0; A.lastPlanAt = now(); adopt(r, reason); }
        else plan(reason);
      } else plan(reason);
      return;
    }
    prompts(A);
  };

  // ------------------------------------------------------------------------------------------------ map hand-off
  /** Remaining route as [[x, z], ...] for simple renderers (legacy HUD). */
  nav.remainingPts = () => { const A = nav.active; return A?.route ? remainingLine(A.route, A.prog) : null; };
  /**
   * Draw the active route (and later legs) on a 2D canvas whose transform already maps world x -> canvas x, world z -> canvas y.
   * opts: { px: world meters per screen pixel, width: line width in px, maneuvers: true, traffic: true, stops: true }
   */
  nav.draw = (g, o = {}) => { const A = nav.active; if (!A?.route) return false; drawRoute(g, A.route, { ...o, prog: A.prog, traffic: o.traffic === false ? null : traffic, G, legs: A.legs, stops: [A.dest, ...A.stops] }); return true; };
  nav.drawRoute = (g, route, o = {}) => drawRoute(g, route, { ...o, traffic: o.traffic ? traffic : null, G });
  /** Everything a custom map renderer needs for the active route. */
  nav.mapData = () => { const A = nav.active; if (!A?.route) return null; const r = A.route; return { mode: r.mode, line: r.line, cum: r.cum, progressIndex: A.prog.i, progressPoint: { x: A.prog.x, z: A.prog.z }, head: r.head, tail: r.tail, maneuvers: r.maneuvers, next: A.next, stops: [A.dest, ...A.stops], legs: A.legs.map((l) => l && l.line), bbox: r.bbox }; };
  /** Readout for the HUD: one object, refreshed every frame while guidance is on, null otherwise. */
  nav.readout = () => {
    const A = nav.active; if (!A?.route || !A.next) return null;
    const dn = formatDistance(A.distToNext), dr = formatDistance(A.totalDist ?? A.remainingDist);
    return { mode: A.mode, maneuver: A.next, then: A.then, distance: dn, instruction: A.next.text, banner: phrase(A.next, A.distToNext), road: A.road, lanes: A.distToNext < 500 ? A.next.lanes : null,
      remaining: dr, duration: formatDuration(A.totalTime ?? A.remainingTime), seconds: A.totalTime ?? A.remainingTime, etaClock: A.etaClock, traffic: A.traffic, speedLimitMph: A.speedLimitMph, stops: A.stops.length, dest: A.dest };
  };

  wireEvents();
  return nav;
}
