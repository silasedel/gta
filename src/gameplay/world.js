// Street furniture you can interact with (ATMs, soda machines, payphones) + random ambient street events.
import * as THREE from 'three';
import { rand, pick, sfx, tryCall, pointNear, distXZ, makeMarker, inView, groundAt, removeColliderSafe, vAlive } from './util.js';
import { createCellStreamer } from './stream.js';


function screenTex(lines, bg, fg) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 22px Arial';
  lines.forEach((l, i) => g.fillText(l, 64, 40 + i * 30));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const M = {
  atmBody: new THREE.MeshStandardMaterial({ color: 0x8a939c, metalness: 0.7, roughness: 0.35 }),
  atmScreen: new THREE.MeshStandardMaterial({ map: screenTex(['SOLANA', 'BANK', '24/7'], '#0b3a6e', '#9fe0ff'), emissive: 0xffffff, emissiveIntensity: 0.9, emissiveMap: null }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.6 }),
  vendBody: new THREE.MeshStandardMaterial({ color: 0xd8222f, roughness: 0.4, metalness: 0.2 }),
  vendFront: new THREE.MeshStandardMaterial({ map: screenTex(['SOLANA', 'FIZZ', '$2'], '#ffefe0', '#d8222f'), emissive: 0xffffff, emissiveIntensity: 0.7 }),
  booth: new THREE.MeshStandardMaterial({ color: 0x2b6f8f, metalness: 0.5, roughness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.25, roughness: 0.05 }),
  sign: new THREE.MeshStandardMaterial({ map: screenTex(['PHONE'], '#1e88c8', '#ffffff'), emissive: 0xffffff, emissiveIntensity: 0.8 }),
};
M.atmScreen.emissiveMap = M.atmScreen.map; M.vendFront.emissiveMap = M.vendFront.map; M.sign.emissiveMap = M.sign.map;

const _bxCache = new Map();
function bx(w, h, d, mat, x, y, z) { const k = w + ',' + h + ',' + d; let geo = _bxCache.get(k); if (!geo) { geo = new THREE.BoxGeometry(w, h, d); _bxCache.set(k, geo); } const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
const _propProto = new Map();
function buildProp(type) { let p = _propProto.get(type); if (!p) { p = buildPropRaw(type); _propProto.set(type, p); } return p.clone(); }
function buildPropRaw(type) {
  const g = new THREE.Group();
  if (type === 'atm') {
    g.add(bx(0.8, 1.6, 0.6, M.atmBody, 0, 0.8, 0));
    g.add(bx(0.5, 0.36, 0.02, M.atmScreen, 0, 1.25, 0.31));
    g.add(bx(0.4, 0.14, 0.12, M.dark, 0, 0.98, 0.33));
    g.add(bx(0.86, 0.12, 0.66, M.dark, 0, 1.66, 0));
  } else if (type === 'vending') {
    g.add(bx(1.0, 1.9, 0.75, M.vendBody, 0, 0.95, 0));
    g.add(bx(0.62, 1.2, 0.02, M.vendFront, -0.12, 1.15, 0.38));
    g.add(bx(0.18, 0.5, 0.03, M.dark, 0.34, 1.2, 0.38));
    g.add(bx(0.6, 0.18, 0.04, M.dark, -0.12, 0.35, 0.38));
  } else {
    g.add(bx(0.08, 2.3, 0.08, M.booth, -0.45, 1.15, -0.45)); g.add(bx(0.08, 2.3, 0.08, M.booth, 0.45, 1.15, -0.45));
    g.add(bx(0.08, 2.3, 0.08, M.booth, -0.45, 1.15, 0.45)); g.add(bx(0.08, 2.3, 0.08, M.booth, 0.45, 1.15, 0.45));
    g.add(bx(1.0, 0.1, 1.0, M.booth, 0, 2.33, 0));
    g.add(bx(0.9, 0.22, 0.04, M.sign, 0, 2.15, 0.47));
    g.add(bx(0.86, 1.6, 0.02, M.glass, 0, 1.2, -0.46)); g.add(bx(0.02, 1.6, 0.86, M.glass, -0.46, 1.2, 0)); g.add(bx(0.02, 1.6, 0.86, M.glass, 0.46, 1.2, 0));
    g.add(bx(0.3, 0.45, 0.12, M.dark, 0, 1.35, -0.38));
  }
  return g;
}
const SIZE = { atm: [0.42, 0.85, 0.32], vending: [0.52, 0.95, 0.4], phone: [0.5, 1.2, 0.5] };

export function createWorldStuff(game, G) {
  const { scene, world, RAPIER } = game;
  const P = game.player;
  const props = [];

  // ---------------- streamed placement (storefronts first, then sidewalks), per ~200 m cell
  const C = G.city;
  const ZONE_PROPS = {
    downtown: ['atm', 'atm', 'vending', 'phone'], business: ['atm', 'atm', 'vending'], nightlife: ['vending', 'atm', 'vending', 'phone'],
    beach: ['vending', 'vending', 'phone'], residential: ['phone', 'vending'], commercial: ['atm', 'vending', 'phone', 'vending'],
    park: ['vending', 'phone'], port: ['vending', 'phone'], industrial: ['vending', 'phone'], causeway: [],
  };
  // a prop must stand with its back to a building wall (<1.6 m behind it), away from road lanes,
  // on the building side of the sidewalk (not across the walking line)
  const SW = game.city?.grid?.sidewalkWidth || 4;
  function wallBehind(x, z, gh, heading) {
    try {
      const bx = -Math.sin(heading), bz = -Math.cos(heading);
      const h = world.castRay(new RAPIER.Ray({ x, y: gh + 1.0, z }, { x: bx, y: 0, z: bz }), 1.6, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      return !!h;
    } catch (e) { return false; }
  }
  function clearSpot(x, z, gh, heading) {
    if (heading !== undefined && !wallBehind(x, z, gh, heading)) return false;
    { const ne = C?.nearestEdge(x, z); if (ne && ne.dist < (ne.edge?.width || 10) / 2 + SW * 0.55) return false; }
    for (const [ox, oz] of [[0, 0], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6]]) if (groundAt(game, x + ox, z + oz, gh + 40) > gh + 1.0) return false;
    const ne = C?.nearestEdge(x, z);
    if (ne && ne.dist < (ne.edge?.width || 10) / 2 + 0.8) return false;
    return true;
  }
  function generate(cell) {
    const spots = [];
    if (!C) return { spots };
    const zone = C.zoneAt(cell.cx, cell.cz);
    const kinds = ZONE_PROPS[zone] || ZONE_PROPS.commercial;
    if (!kinds.length) return { spots };
    const want = 1 + (Math.random() < 0.6 ? 1 : 0) + (['downtown', 'business', 'nightlife', 'commercial'].includes(zone) ? 1 : 0);
    const center = new THREE.Vector3(cell.cx, 0, cell.cz);
    const fronts = C.storefrontsNear(center, 100).filter((f) => Math.abs((f.x ?? 0) - cell.cx) <= 100 && Math.abs((f.z ?? 0) - cell.cz) <= 100);
    for (let k = 0; k < fronts.length * 2 && spots.length < want; k++) {
      const f = fronts[(Math.random() * fronts.length) | 0];
      const fa = f.facing ?? 0, fx = Math.sin(fa), fz = Math.cos(fa), ax = Math.cos(fa), az = -Math.sin(fa);
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = f.x + fx * ((f.d || 10) / 2 + 0.7) + ax * side * Math.max(0, (f.w || 8) / 2 - 1.2);
      const z = f.z + fz * ((f.d || 10) / 2 + 0.7) + az * side * Math.max(0, (f.w || 8) / 2 - 1.2);
      if (C.isWater(x, z)) continue;
      const gh = C.groundHeight(x, z);
      if (!clearSpot(x, z, gh, fa) || spots.some((q) => Math.hypot(q.x - x, q.z - z) < 12)) continue;
      spots.push({ type: kinds[spots.length % kinds.length], x, y: gh, z, heading: fa, hp: 100, robbedT: -999 });
    }
    for (let k = 0; k < 6 && spots.length < want; k++) {
      const p = C.sidewalkPoint(center, 0, 105, null, { wall: true, tries: 5 });
      if (!p) continue;
      let heading = p.heading;
      if (heading === undefined) { const ne = C.nearestEdge(p.x, p.z); heading = ne ? Math.atan2(ne.point.x - p.x, ne.point.z - p.z) : 0; }
      const gh = Number.isFinite(p.y) ? p.y : C.groundHeight(p.x, p.z);
      if (!clearSpot(p.x, p.z, gh, heading) || spots.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 12)) continue;
      spots.push({ type: kinds[spots.length % kinds.length], x: p.x, y: gh, z: p.z, heading, hp: 100, robbedT: -999 });
    }
    return { spots };
  }
  function load(cell) {
    cell.data.objs = [];
    for (const sp of cell.data.spots || []) {
      const g = buildProp(sp.type);
      g.position.set(sp.x, sp.y, sp.z); g.rotation.y = sp.heading;
      scene.add(g);
      const sz = SIZE[sp.type];
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.heading);
      let col = null;
      try { col = world.createCollider(RAPIER.ColliderDesc.cuboid(sz[0], sz[1], sz[2]).setTranslation(sp.x, sp.y + sz[1], sp.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })); } catch (e) { /* ignore */ }
      const p = sp; p.g = g; p.col = col; p.pos = new THREE.Vector3(sp.x, sp.y, sp.z);
      props.push(p); cell.data.objs.push(p);
    }
  }
  function unload(cell) {
    for (const p of cell.data.objs || []) {
      scene.remove(p.g); if (p.col) removeColliderSafe(game, p.col);
      p.g = null; p.col = null;
      const i = props.indexOf(p); if (i >= 0) props.splice(i, 1);
    }
    cell.data.objs = [];
  }
  const streamer = createCellStreamer(game, { cell: 200, loadR: 250, unloadR: 400, perTick: 1, generate, load, unload });
  try { streamer.tick(0, true); } catch (e) { console.warn('[world props] stream', e); }

  // ---------------- interaction
  const front = (p) => new THREE.Vector3(p.pos.x + Math.sin(p.heading) * 0.9, p.pos.y, p.pos.z + Math.cos(p.heading) * 0.9);
  let nearProp = null;
  const PHONE_LINES = [
    'Dial tone. You hang up — nobody uses payphones anymore.',
    '"Port Solana Weather Line: hot, humid, chance of trouble."',
    '"You\'ve reached Big Lou\'s Bait & Tackle. We\'re closed."',
    'A recorded voice offers you a timeshare in Key Calora.',
  ];
  function interact(p) {
    const now = game.clock.elapsed;
    if (p.type === 'atm') {
      if (now - p.robbedT < 120) { game.hud?.notify?.('ATM: OUT OF SERVICE', 2000); return; }
      sfx(game, 'beep', p.pos, 0.6);
      game.hud?.notify?.(`Solana Bank: card declined. Your balance is safe in your pocket ($${Math.round(P.money || 0)}).`, 3200);
    } else if (p.type === 'vending') {
      if ((P.money || 0) < 2) { game.hud?.notify?.('Not enough cash.', 1800); return; }
      P.money -= 2; P.health = Math.min(100, P.health + 10);
      sfx(game, 'can', p.pos, 0.8);
      game.hud?.notify?.('Purchased: Solana Fizz (+10 health)', 2200);
    } else if (p.type === 'phone') {
      sfx(game, 'ring', p.pos, 0.6);
      const W = G.wanted;
      if (W.level > 0 && W.evading && (P.money || 0) >= 400) {
        P.money -= 400; W.heat = 0; W.level = Math.max(0, W.level - 1);
        if (W.level === 0) W.clear(); else { W.clearT = 0; }
        game.hud?.notify?.('Hush Line: "Consider it handled." Heat lowered ($400).', 3500);
      } else if (W.level > 0 && W.evading) game.hud?.notify?.('Hush Line wants $400 to make your problem smaller.', 3000);
      else game.hud?.notify?.(pick(PHONE_LINES), 3200);
    }
  }
  function meleeHit(pos, dir, dmg) {
    for (const p of props) {
      if (p.type !== 'atm' || game.clock.elapsed - p.robbedT < 120) continue;
      const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 1.9 || (dx * dir.x + dz * dir.z) / (d || 1) < 0.2) continue;
      p.hp -= dmg;
      sfx(game, 'bat_hit', p.pos, 0.6);
      game.emit?.('hit', { target: 'world', object: p, point: p.pos.clone().setY(p.pos.y + 1.1), normal: dir.clone().negate(), damage: dmg, kind: 'melee', byPlayer: true });
      if (p.hp <= 0) {
        p.hp = 100; p.robbedT = game.clock.elapsed;
        const n = 4 + (Math.random() * 4 | 0);
        for (let i = 0; i < n; i++) G.pickups?.spawn?.('cash', front(p).add(new THREE.Vector3(rand(-0.9, 0.9), 0.05, rand(-0.9, 0.9))), { temp: true, life: 40, amount: (40 + Math.random() * 90) | 0 });
        sfx(game, 'cash', p.pos, 1);
        game.hud?.notify?.('The ATM spits out cash!', 2000);
        G.reportCrime?.('robbery', p.pos.clone());
      } else if (p.hp < 70) G.reportCrime?.('robbery', p.pos.clone(), null, { copOnly: true, witnessed: false });
    }
  }

  // ---------------- street events
  const events = [];
  let eventCd = rand(25, 40);
  const vehicles = () => game.vehicles;
  function spawnCar(type, pos, heading) {
    const vs = vehicles();
    if (!vs?.spawn) return null;
    return tryCall('vehicles.spawn', () => vs.spawn(type, pos, heading, { ai: true }), null);
  }
  const leftovers = [];
  function removeCar(v) {
    if (!v) return;
    const vs = vehicles(); const rm = vs?.remove || vs?.despawn;
    if (!rm) return;
    // only make cars vanish when nobody is looking
    let far = true;
    if (!vAlive(game, v)) return;
    try { const t = v.body.translation(); far = distXZ(t, P.position) > 70 && !inView(game, new THREE.Vector3(t.x, t.y, t.z)); } catch (e) { far = true; }
    if (v.playerDriven || !far) { if (!leftovers.includes(v)) leftovers.push(v); return; }
    tryCall('vehicles.remove', () => rm.call(vs, v));
  }
  function leftoversTick() {
    for (const v of leftovers.slice()) {
      if (v.playerDriven || P.state.vehicle === v) continue;
      if (!(vehicles()?.list || []).includes(v)) { leftovers.splice(leftovers.indexOf(v), 1); continue; }
      if (!vAlive(game, v)) { leftovers.splice(leftovers.indexOf(v), 1); continue; }
      let t; try { t = v.body.translation(); } catch (e) { leftovers.splice(leftovers.indexOf(v), 1); continue; }
      if (distXZ(t, P.position) > 90 && !inView(game, new THREE.Vector3(t.x, t.y, t.z))) { leftovers.splice(leftovers.indexOf(v), 1); removeCar(v); }
    }
  }
  function startMugging() {
    const peds = game.peds; if (!peds?.spawnAt) return null;
    const q = G.city?.sidewalkPoint(P.position, 22, 45); const r = q ? { position: q } : pointNear(game, P.position, 22, 45, 'sidewalk', false); if (!r) return null;
    const victim = tryCall('spawnAt', () => peds.spawnAt(r.position.clone(), {}), null);
    const mpos = r.position.clone().add(new THREE.Vector3(0.9, 0, 0.3));
    const mugger = tryCall('spawnAt', () => peds.spawnAt(mpos, {}), null);
    if (!victim || !mugger || victim === mugger) return null;
    victim.state = 'cower'; victim.stateT = 30; victim.threat = { x: mugger.pos.x, z: mugger.pos.z }; victim.idleStyle = 'cower'; victim.pending = null;
    mugger.state = 'talk'; mugger.talkT = 30; mugger.groupCenter = { x: victim.pos.x, z: victim.pos.z }; mugger.idleStyle = 'talk'; mugger.pending = null;
    mugger._gpCriminal = true; mugger._gpHitByPlayer = false;
    const marker = makeMarker('$', '#ff8a1f', 0.5); scene.add(marker);
    game.hud?.notify?.('Someone is being mugged nearby! Step in?', 3000);
    return { kind: 'mugging', t: 0, victim, mugger, marker, stage: 0 };
  }
  function tickMugging(e, dt) {
    const { victim, mugger } = e;
    e.marker.position.set(mugger.pos.x, mugger.pos.y + 2.2, mugger.pos.z);
    const dP = distXZ(mugger.pos, P.position);
    const muggerDown = mugger.dead || mugger.state === 'dead';
    if (e.stage === 0) {
      if (muggerDown || mugger._gpHitByPlayer) { e.stage = 2; }
      else if (dP < 6 && !P.state.inVehicle) {
        e.stage = 1;
        if (Math.random() < 0.5) { mugger.state = 'fight'; mugger.fightT = 12; mugger.hitCd = 0.8; mugger.guard = true; }
        else { mugger.state = 'flee'; mugger.fleeT = 8; mugger.threat = { x: P.position.x, z: P.position.z }; }
      } else if (e.t > 28) {
        mugger.state = 'flee'; mugger.fleeT = 10; mugger.threat = { x: victim.pos.x, z: victim.pos.z };
        victim.state = 'walk'; return true;
      } else {
        if (mugger.state !== 'talk') { mugger.state = 'talk'; mugger.talkT = 5; }
        if (victim.state !== 'cower' && !victim.dead) { victim.state = 'cower'; victim.stateT = 5; }
      }
    } else if (e.stage === 1) {
      if (muggerDown || mugger._gpHitByPlayer) e.stage = 2;
      else if (dP > 60 || e.t > 45) return true;
    }
    if (e.stage === 2) {
      e.stage = 3;
      if (!victim.dead && victim.state !== 'dead') {
        const reward = (60 + Math.random() * 140) | 0;
        G.pickups?.spawn?.('cash', victim.pos.clone().setY(victim.pos.y + 0.05), { temp: true, life: 30, amount: reward });
        game.hud?.notify?.('Victim: "Thank you! Here — take this."', 3000);
        victim.state = 'flee'; victim.fleeT = 4; victim.threat = { x: mugger.pos.x, z: mugger.pos.z };
      }
      return true;
    }
    return e.t > 60;
  }
  function endMugging(e) { scene.remove(e.marker); e.mugger._gpCriminal = false; }

  function startRacers() {
    const r = G.city?.roadPoint(P.position, 90, 160, { avoidView: true, inView: (x) => inView(game, x) }) || pointNear(game, P.position, 90, 150, 'road', true); if (!r) return null;
    const cars = [];
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    for (let i = 0; i < 2; i++) {
      const v = spawnCar('sports', r.position.clone().add(new THREE.Vector3(-fx * i * 9, 0, -fz * i * 9)), r.heading);
      if (v) { if (v.ai) { v.ai.cruise = 30 + i * 2; } cars.push(v); }
    }
    if (!cars.length) {
      // no spawn API: borrow traffic
      for (const v of vehicles()?.list || []) {
        if (cars.length >= 2) break;
        if (v.ai && !v.playerDriven && !v.police && vAlive(game, v) && distXZ(v.body.translation(), P.position) < 200) { v._gpCruise = v.ai.cruise; v.ai.cruise = 29; cars.push(v); }
      }
      if (!cars.length) return null;
      return { kind: 'racers', t: 0, cars, borrowed: true };
    }
    return { kind: 'racers', t: 0, cars };
  }
  function endRacers(e) {
    for (const v of e.cars) {
      if (e.borrowed) { if (v.ai && v._gpCruise) v.ai.cruise = v._gpCruise; }
      else { if (v.ai) v.ai.cruise = 12; removeCar(v); }
    }
  }
  function startChase() {
    const vs = vehicles(); if (!vs?.spawn) return null;
    const r = G.city?.roadPoint(P.position, 100, 170, { avoidView: true, inView: (x) => inView(game, x) }) || pointNear(game, P.position, 100, 160, 'road', true); if (!r) return null;
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    const runner = spawnCar(pick(['sports', 'sedan', 'compact']), r.position, r.heading);
    if (!runner) return null;
    if (runner.ai) runner.ai.cruise = 27;
    const cop = G.police?.spawnPoliceCar?.(r.position.clone().add(new THREE.Vector3(-fx * 14, 0, -fz * 14)), r.heading, true);
    if (!cop) { removeCar(runner); return null; }
    cop._gpNpcChase = true;
    return { kind: 'chase', t: 0, runner, cop };
  }
  function tickChase(e) {
    if (!vAlive(game, e.cop) || !vAlive(game, e.runner)) return true;
    if (e.cop.playerDriven || e.runner.playerDriven) return true;
    if (typeof e.cop.setChaseTarget === 'function') tryCall('setChaseTarget', () => e.cop.setChaseTarget(e.runner.body.translation()));
    else if (e.cop.ai) e.cop.ai.cruise = 26;
    if (typeof e.cop.siren === 'function') tryCall('siren', () => e.cop.siren(true)); else e.cop.sirenOn = true;
    const d = distXZ(e.runner.body.translation(), P.position);
    return e.t > 70 || (e.t > 10 && d > 220);
  }
  function endChase(e) { tryCall('setChaseTarget', () => e.cop.setChaseTarget?.(null)); removeCar(e.runner); removeCar(e.cop); }

  function startBreakdown() {
    let best = null;
    for (const v of vehicles()?.list || []) {
      if (v.ai || v.playerDriven || v.police || v.typeKey === 'police' || v._gpBrokenDown) continue;
      const d = distXZ(v.body.translation(), P.position);
      if (d > 30 && d < 140 && (!best || Math.random() < 0.4)) best = v;
    }
    if (!best) return null;
    best._gpBrokenDown = true;
    let owner = null;
    if (game.peds?.spawnAt) {
      const ep = tryCall('exitPosition', () => best.exitPosition(), null);
      if (ep) {
        owner = tryCall('spawnAt', () => game.peds.spawnAt(ep.clone().add(new THREE.Vector3(0.5, 0, 0.5)), {}), null);
        if (owner) { const t = best.body.translation(); owner.state = 'talk'; owner.talkT = 90; owner.groupCenter = { x: t.x, z: t.z }; owner.idleStyle = 'phone'; owner.pending = null; }
      }
    }
    return { kind: 'breakdown', t: 0, v: best, owner, smokeT: 0 };
  }
  function tickBreakdown(e, dt) {
    const v = e.v;
    if (!vAlive(game, v) || v.playerDriven || v.ai) return true;
    const blink = (game.clock.elapsed * 1.6) % 1 < 0.5 ? 6 : 0;
    const lm = v.model?.lightMats;
    if (lm?.blinkL) { lm.blinkL.emissiveIntensity = blink; lm.blinkR.emissiveIntensity = blink; }
    e.smokeT -= dt;
    if (e.smokeT <= 0 && distXZ(v.body.translation(), P.position) < 90) {
      e.smokeT = 0.35;
      tryCall('fx.smoke', () => {
        const t = v.body.translation(); const r = v.body.rotation();
        const fw = new THREE.Vector3(0, 0, (v.spec?.L || 4.4) * 0.38).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        game.fx?.smoke?.(new THREE.Vector3(t.x + fw.x, t.y + 0.6, t.z + fw.z));
      });
    }
    if (e.owner && e.owner.state !== 'talk') e.owner = null;
    return e.t > 100 || distXZ(v.body.translation(), P.position) > 250;
  }
  function endBreakdown(e) { e.v._gpBrokenDown = false; }

  const KINDS = {
    mugging: { start: startMugging, tick: tickMugging, end: endMugging },
    racers: { start: startRacers, tick: (e) => e.t > 40, end: endRacers },
    chase: { start: startChase, tick: tickChase, end: endChase },
    breakdown: { start: startBreakdown, tick: tickBreakdown, end: endBreakdown },
  };
  function eventsTick(dt) {
    for (const e of events.slice()) {
      e.t += dt;
      let done = true;
      try { done = KINDS[e.kind].tick(e, dt); } catch (err) { done = true; }
      if (done) { tryCall('event.end', () => KINDS[e.kind].end(e)); events.splice(events.indexOf(e), 1); }
    }
    eventCd -= dt;
    if (eventCd > 0 || G.wanted.level > 0 || G.dead || G.busted || events.length >= 2) return;
    eventCd = rand(40, 80);
    const order = ['mugging', 'breakdown', 'racers', 'chase'].sort(() => Math.random() - 0.5);
    for (const k of order) {
      if (events.some((e) => e.kind === k)) continue;
      const e = tryCall('event.start.' + k, () => KINDS[k].start(), null);
      if (e) { events.push(e); break; }
    }
  }

  let lodT = 0, leftT = 1;
  function update(dt) {
    const pp = P.position;
    lodT -= dt;
    streamer.tick(dt);
    if (lodT <= 0) { lodT = 0.5; for (const p of props) if (p.g) p.g.visible = distXZ(p.pos, pp) < 150; }
    // interaction prompt
    nearProp = null;
    if (!P.state.inVehicle && !G.dead && !G.busted) {
      let bd = 1.9;
      for (const p of props) { const d = distXZ(front(p), pp); if (d < bd) { bd = d; nearProp = p; } }
    }
    // police car trunks (empty, parked/stopped cruisers)
    let trunk = null;
    if (!P.state.inVehicle && !G.dead && !G.busted) {
      for (const v of vehicles()?.list || []) {
        if (!(v.police || v.typeKey === 'police') || v.playerDriven || v.driver || (v.speedKmh || 0) > 4) continue;
        let t, r; try { t = v.body.translation(); r = v.body.rotation(); } catch (e) { continue; }
        if (Math.abs(t.x - pp.x) > 6 || Math.abs(t.z - pp.z) > 6) continue;
        const back = new THREE.Vector3(0, 0, -((v.spec?.L || 4.8) / 2 + 0.55)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        if (Math.hypot(t.x + back.x - pp.x, t.z + back.z - pp.z) < 1.3) { trunk = v; break; }
      }
    }
    if (G.arrestT > 0) G.setHelp?.('A cop is grabbing you — <b>Sprint</b> to break free!');
    else if (trunk) {
      const empty = game.clock.elapsed - (trunk._gpTrunkT ?? -1e9) < 240;
      G.setHelp?.(empty ? 'The trunk has already been cleaned out.' : 'Press <b>E</b> to pop the police trunk');
      const ui = game.ui || {};
      if (!empty && game.input.pressed('KeyE') && !ui.phoneOpen && !ui.paused) {
        trunk._gpTrunkT = game.clock.elapsed;
        const r = Math.random(), key = r < 0.45 ? 'shotgun' : r < 0.8 ? 'carbine' : 'rifle';
        const d = game.weapons?.defs?.[key];
        game.weapons?.give?.(key, d?.ammoPick);
        P.armor = Math.min(100, (P.armor || 0) + 25);
        sfx(game, 'door', pp, 0.8); sfx(game, 'reload', pp, 0.8);
        game.hud?.notify?.(`Trunk: ${d?.name || key} + vest`, 2600);
        G.reportCrime?.('vehicle_theft', pp.clone(), null, { copOnly: true, witnessed: false });
      }
    } else if (nearProp) {
      const txt = nearProp.type === 'atm' ? 'Press <b>E</b> to use ATM · hit it to break it open'
        : nearProp.type === 'vending' ? 'Press <b>E</b> to buy a Solana Fizz ($2)'
          : G.wanted.level > 0 && G.wanted.evading ? 'Press <b>E</b> to call the Hush Line ($400)' : 'Press <b>E</b> to use payphone';
      G.setHelp?.(txt);
      const ui = game.ui || {};
      if (game.input.pressed('KeyE') && !ui.phoneOpen && !ui.paused) tryCall('interact', () => interact(nearProp));
    } else G.setHelp?.(null);
    tryCall('events', () => eventsTick(dt));
    leftT -= dt; if (leftT <= 0) { leftT = 1; tryCall('leftovers', leftoversTick); }
  }
  return { props, events, update, meleeHit, streamer, startEvent: (k) => { const e = KINDS[k]?.start(); if (e) events.push(e); return !!e; } };
}
