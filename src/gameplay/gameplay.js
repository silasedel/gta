// GAMEPLAY agent: wanted level, witnesses, police, weapons, pickups, carjacking, death/arrest, regen, world interactions.
import * as THREE from 'three';
import { rand, sfx, tryCall, hasLOS, distXZ, pointNear, makeMarker, warnOnce, groundAt } from './util.js';
import { createPickups } from './pickups.js';
import { createWeapons } from './weapons.js';
import { createPolice } from './police.js';
import { createWorldStuff } from './world.js';
import { createCityAdapter } from './cityApi.js';
import { createActivities } from './activities.js';

// ---- wanted tuning (documented in docs/gameplay/police_tuning.md)
export const SEV = { assault: 1, shoplift: 1, vehicle_theft: 1, carjack: 1, shooting: 2, robbery: 2, hit_pedestrian: 2, cop_assault: 2, cop_shot: 3, murder: 3, cop_murder: 3 };
export const MINOR = new Set(['assault', 'shoplift', 'vehicle_theft', 'carjack']); // need a cop or a successful witness call
export const CLEAR_TIME = [0, 10, 15, 25, 35, 45];       // s unseen outside the search area to lose the cops
export const SEARCH_R = [0, 150, 250, 400, 600, 800];    // search-area radius per star (m)
export const HEAT_STEPS = [0, 1, 3, 7, 14, 24];          // accumulated heat needed for each star
export const WITNESS_CALL = [5, 8];                      // s a witness needs to phone it in

export async function createGameplay(game) {
  if (/[?&]nogameplay\b/.test(location.search)) return { update() {} }; // debug: isolate other systems
  const P = game.player;
  const G = { dead: false, busted: false, combatT: 99, jack: null, owned: new WeakSet() };
  G.city = createCityAdapter(game);
  game.gameplayCity = G.city;
  game.ui = game.ui || {};

  // ------------------------------------------------------------------ WANTED
  const W = {
    level: 0, heat: 0, evading: false, searchCenter: null, searchRadius: 0,
    lastSeen: new THREE.Vector3(), unseenT: 0, clearT: 0, seen: false,
    add(stars, position) { addStars(stars, position); },
    clear() { clearWanted(); },
  };
  G.wanted = W;
  game.wanted = W;
  try {
    // HUD reads player.wanted; keep it bound to our level (main.js' own decay/increment writes are ignored)
    Object.defineProperty(P, 'wanted', { configurable: true, enumerable: true, get: () => W.level, set: (v) => { if (+v === 0 && W.level > 0) clearWanted(); } });
  } catch (e) { warnOnce('defineProperty wanted', e); }

  function addStars(stars, position) {
    if (G.dead || G.busted) return;
    const before = W.level;
    W.heat += stars;
    let fromHeat = 0;
    for (let i = 1; i <= 5; i++) if (W.heat >= HEAT_STEPS[i]) fromHeat = i;
    W.level = Math.min(5, Math.max(W.level, Math.min(3, Math.round(stars)), fromHeat));
    W.lastSeen.copy(position || P.position);
    W.unseenT = 0; W.clearT = 0; W.evading = false; W.searchCenter = null; W.searchRadius = 0;
    if (W.level > before) {
      game.emit?.('wantedChange', { level: W.level, before });
      if (before === 0) sfx(game, 'whistle', null, 0.5);
    }
  }
  function clearWanted(silent) {
    const had = W.level > 0;
    W.level = 0; W.heat = 0; W.evading = false; W.searchCenter = null; W.searchRadius = 0; W.unseenT = 0; W.clearT = 0;
    reports.length = 0;
    G.police?.clearAll?.();
    if (had) { game.emit?.('wantedChange', { level: 0 }); if (!silent) tryCall('notify', () => game.hud?.notify?.('You lost the cops.', 2600)); }
  }

  // ------------------------------------------------------------------ CRIMES + WITNESSES
  const reports = []; // {ped, t, stars, pos, type, marker}
  let lastHit = { ped: null, t: -9 };
  game.on?.('hit', (d) => { if (d?.target === 'ped' && d.object) lastHit = { ped: d.object, t: game.clock.elapsed }; });

  function pedWitness(pos, exclude) {
    let best = null, bd = 1e9;
    const tgt = new THREE.Vector3(pos.x, (pos.y || 0) + 1.2, pos.z);
    for (const ped of game.peds?.list || []) {
      if (ped === exclude || ped.dead || ped.state === 'dead' || ped._gpCriminal || !ped.pos) continue;
      const d = distXZ(ped.pos, pos);
      if (d > 25 || d >= bd) continue;
      if (!hasLOS(game, new THREE.Vector3(ped.pos.x, ped.pos.y + 1.6, ped.pos.z), tgt)) continue;
      best = ped; bd = d;
    }
    return best;
  }
  // type, position, victim(optional)
  function reportCrime(type, position, victim = null, opts = {}) {
    if (G.dead || G.busted) return;
    game.emit?.('crime', { type, position: position.clone(), severity: SEV[type] || 1, witnessed: false, _gp: true, victim, ...opts });
  }
  G.reportCrime = reportCrime;

  const NAMES = { assault: 'Assault', carjack: 'Carjacking', vehicle_theft: 'Vehicle theft', shoplift: 'Shoplifting', robbery: 'Robbery', shooting: 'Shots fired', hit_pedestrian: 'Hit and run', murder: 'Homicide', cop_assault: 'Assaulting an officer', cop_murder: 'Officer down' };
  const toastSeen = {};
  function crimeToast(type, isGp) {
    if (!isGp) return; // HUD already toasts crimes other modules flag as witnessed
    const now = performance.now();
    if (toastSeen[type] && now - toastSeen[type] < 4000) return;
    toastSeen[type] = now;
    tryCall('notify', () => game.hud?.notify?.(`Crime reported: ${NAMES[type] || type}`, 3000, { kind: 'crime' }));
  }
  function handleCrime(d) {
    if (!d || G.dead || G.busted) return;
    let type = d.type || 'assault';
    const pos = d.position ? new THREE.Vector3(d.position.x, d.position.y || 0, d.position.z) : P.position.clone();
    let victim = d.victim || (game.clock.elapsed - lastHit.t < 0.1 ? lastHit.ped : null);
    if (victim && victim._gpCriminal && (type === 'assault' || type === 'murder')) { victim._gpHitByPlayer = true; return; } // vigilante justice
    if (victim && victim.isCop) { if (type === 'murder') type = 'cop_murder'; else if (type === 'assault') type = 'cop_assault'; }
    let stars = SEV[type] ?? d.severity ?? 1;
    if (type === 'cop_murder' && W.level >= 3) stars = W.level + 1; // killing cops while hot keeps escalating
    if (d.police) stars = Math.max(stars, 2);
    stars = Math.min(5, stars);
    // direct report: cops see it (or it targets a cop / police car)
    const copSaw = type.startsWith('cop_') || d.police || tryCall('copWitness', () => G.police?.copWitness?.(pos), false) || (W.level > 0 && W.seen);
    if (copSaw) { addStars(stars, pos); crimeToast(type, !!d._gp); return; }
    if (d.copOnly) return;
    // civilian witness calls it in after 3s
    const existing = reports.find((r) => distXZ(r.pos, pos) < 30);
    if (existing) { existing.stars = Math.max(existing.stars, stars); return; }
    const w = pedWitness(pos, victim);
    if (!w) {
      // other modules (e.g. store clerks) may assert a witness we can't see in the ped list
      if (!d._gp && d.witnessed === true && (type === 'shoplift' || type === 'robbery')) {
        const t = setTimeout(() => { if (!G.dead && !G.busted) addStars(stars, pos); }, type === 'robbery' ? 4000 : 2500);
        void t;
      }
      return;
    }
    const marker = makeMarker('!', '#ff4d5e', 0.55);
    game.scene.add(marker);
    reports.push({ ped: w, t: rand(WITNESS_CALL[0], WITNESS_CALL[1]), stars, pos, type, marker, created: game.clock.elapsed, gp: !!d._gp });
    w.state = w.char?.hasPhone ? 'film' : 'cower'; w.stateT = 4; w.threat = { x: pos.x, z: pos.z }; w.pending = null;
    w.idleStyle = w.char?.hasPhone ? 'film' : 'phone';
    tryCall('notify', () => game.hud?.notify?.('A witness is calling the cops!', 2400));
  }
  game.on?.('crime', (d) => { try { handleCrime(d); } catch (e) { warnOnce('handleCrime', e); } });

  function reportsTick(dt) {
    for (let i = reports.length - 1; i >= 0; i--) {
      const r = reports[i];
      r.t -= dt;
      const ped = r.ped;
      const gone = !ped || ped.dead || ped.state === 'dead' || (ped._gpScaredT && ped._gpScaredT > r.created + 0.05) || distXZ(ped.pos, P.position) > 80;
      if (ped?.pos) r.marker.position.set(ped.pos.x, ped.pos.y + 2.25 + Math.sin(game.clock.elapsed * 6) * 0.05, ped.pos.z);
      if (gone) {
        game.scene.remove(r.marker); reports.splice(i, 1);
        if (ped && (ped.dead || ped.state === 'dead' || ped._gpScaredT > r.created)) tryCall('notify', () => game.hud?.notify?.('Witness silenced.', 1600));
        continue;
      }
      if (ped.state !== 'film' && ped.state !== 'cower' && ped.state !== 'flee') { ped.state = 'film'; ped.stateT = 2; }
      if (r.t <= 0) { game.scene.remove(r.marker); reports.splice(i, 1); addStars(r.stars, r.pos); crimeToast(r.type, r.gp); sfx(game, 'ring', ped.pos, 0.4); }
    }
  }

  function wantedTick(dt) {
    P._wantedT = 0; // disable main.js' legacy decay
    P.wantedEvading = W.evading;
    if (W.level === 0) { W.seen = false; return; }
    const seen = tryCall('anySees', () => G.police?.anySees?.(), false);
    W.seen = !!seen;
    // sustained violence escalates: fighting in view of the police keeps adding heat
    if (seen && W.level >= 2 && game.clock.elapsed - Math.max(G.copAggroT ?? -99, G.lastShotT ?? -99, G.lastConfirmedHit ?? -99) < 4) {
      W.heat += dt * 0.12;
      let fromHeat = 0; for (let i = 1; i <= 5; i++) if (W.heat >= HEAT_STEPS[i]) fromHeat = i;
      if (fromHeat > W.level) { W.level = Math.min(5, fromHeat); game.emit?.('wantedChange', { level: W.level }); }
    }
    if (seen) {
      W.lastSeen.copy(P.position); W.unseenT = 0; W.clearT = 0;
      if (W.evading) { W.evading = false; W.searchCenter = null; W.searchRadius = 0; }
      return;
    }
    W.unseenT += dt;
    if (W.unseenT > 2.5) {
      const R0 = SEARCH_R[W.level];
      if (!W.evading) { W.evading = true; W.searchCenter = W.lastSeen.clone(); W.searchRadius = R0; }
      W.searchRadius = Math.min(R0 * 1.35, W.searchRadius + dt * (1 + W.level * 0.6)); // the net widens slowly
      if (distXZ(P.position, W.searchCenter) > W.searchRadius) W.clearT += dt;
      else W.clearT = Math.max(0, W.clearT - dt * 0.5); // inside the search area you are not getting away
      W.clearProgress = W.clearT / CLEAR_TIME[W.level];
      if (W.clearT > CLEAR_TIME[W.level]) clearWanted();
    } else {
      // short grace: cops still know roughly where you are
      W.lastSeen.lerp(P.position, Math.min(1, dt * 2));
    }
  }

  // ------------------------------------------------------------------ SUBSYSTEMS
  G.pickups = tryCall('pickups', () => createPickups(game, G), null);
  G.weapons = tryCall('weapons', () => createWeapons(game, G), null);
  G.police = tryCall('police', () => createPolice(game, G), null);
  G.props = tryCall('world', () => createWorldStuff(game, G), null);
  G.activities = tryCall('activities', () => createActivities(game, G), null);
  G.playerArmedRecently = () => !!game.weapons?.isGun?.(P.weapon) && (P.aiming || game.clock.elapsed - (G.lastShotT ?? -99) < 10);
  game.on?.('shot', (d) => { if (d?.byPlayer) G.lastShotT = game.clock.elapsed; });
  game.police = G.police;

  // cash from knocked-out peds
  game.on?.('hit', (d) => {
    if (d?.target !== 'ped' || !d.object || d.object.isCop) return;
    const ped = d.object;
    if (!(ped.dead || ped.state === 'dead')) return;
    const now = game.clock.elapsed;
    if (ped._gpDropT && now - ped._gpDropT < 20) return;
    ped._gpDropT = now;
    if (Math.random() < 0.4 && ped.pos) tryCall('drop cash', () => G.pickups?.spawn?.('cash', ped.pos.clone().add(new THREE.Vector3(rand(-0.5, 0.5), 0.05, rand(-0.5, 0.5))), { temp: true, life: 35, amount: (5 + Math.random() * 55) | 0 }));
  });

  // ------------------------------------------------------------------ CARJACKING / THEFT
  game.on?.('enterVehicle', (d) => {
    const v = d?.vehicle;
    if (!v) return true;
    if (G.dead || G.busted || G.jack) return false;
    const occupied = !!v.driver || (!!v.ai && !v.playerDriven && !v.parked);
    if (occupied) {
      const ep = v.exitPosition ? v.exitPosition() : P.position.clone();
      G.jack = { v, t: 0, door: ep, start: P.position.clone(), ejected: false, cruise: v.ai?.cruise };
      if (v.ai) v.ai.cruise = 0;
      return false;
    }
    if (!G.owned.has(v)) {
      G.owned.add(v);
      if (v.police || v.typeKey === 'police') reportCrime('vehicle_theft', P.position.clone(), null, { police: true });
      else if (!v._gpBrokenDown) reportCrime('vehicle_theft', P.position.clone(), null, { copOnly: true, witnessed: false });
    }
    return true;
  });
  function jackTick(dt) {
    const j = G.jack; if (!j) return;
    j.t += dt;
    if (j.t > 2.0) { if (j.v?.ai && j.cruise) j.v.ai.cruise = j.cruise; G.jack = null; return; } // watchdog: never hold the player
    const v = j.v;
    let vt; try { vt = v.body.translation(); } catch (e) { G.jack = null; return; }
    if (distXZ(vt, P.position) > 7 || P.state.inVehicle || G.dead) { if (v.ai && j.cruise) v.ai.cruise = j.cruise; G.jack = null; return; }
    if (v.ai) v.ai.cruise = 0;
    try { j.door = v.exitPosition ? v.exitPosition() : j.door; } catch (e) { /* keep */ }
    if (j.t > 0.55 && !j.ejected) {
      j.ejected = true;
      P.state.punch = true; // yank animation
      sfx(game, 'door', j.door, 0.8);
      let pos = tryCall('ejectDriver', () => v.ejectDriver?.(), null);
      if (!pos) pos = j.door.clone().add(new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading)).multiplyScalar(-1.2));
      const state = Math.random() < 0.2 ? 'fight' : 'flee';
      const ped = tryCall('spawnAt', () => game.peds?.spawnAt?.(new THREE.Vector3(pos.x, groundAt(game, pos.x, pos.z, (pos.y || 0) + 2), pos.z), { state }), null);
      if (ped) ped.pending = null;
      reportCrime(v.police || v.typeKey === 'police' ? 'vehicle_theft' : 'carjack', P.position.clone(), ped, v.police || v.typeKey === 'police' ? { police: true } : {});
    }
    if (j.t > 1.0) {
      G.jack = null; G.owned.add(v);
      if (v.ai && j.cruise) v.ai.cruise = j.cruise;
      tryCall('enterVehicle', () => game.enterVehicle?.(v));
    }
  }

  // ------------------------------------------------------------------ DEATH / ARREST
  const spawnPt = game.city?.playerSpawn?.clone?.() || new THREE.Vector3();
  // respawn points come from the city API at the moment they're needed (nearest suitable zone / POI)
  G.respawnAt = (kind) => tryCall('respawnPoint', () => G.city.respawnPoint(kind, P.position), null) || spawnPt.clone();
  let freezePos = null, stateT = 0;
  function teleport(p) {
    if (P.state.inVehicle) tryCall('exitVehicle', () => game.exitVehicle?.());
    const gy = groundAt(game, p.x, p.z, 20);
    const y = Math.max(gy, p.y || 0);
    tryCall('teleport', () => P.body?.setTranslation?.({ x: p.x, y: y + 0.87 + 0.05, z: p.z }, true));
    P.position.set(p.x, y, p.z);
  }
  function die() {
    if (G.dead) return;
    G.resetAim?.();
    G.dead = true; stateT = 0;
    if (P.state.inVehicle) tryCall('exitVehicle', () => game.exitVehicle?.());
    P.health = 0;
    freezePos = P.position.clone();
    game.ui.dead = true;
    game.emit?.('playerDied', {});
  }
  function bust() {
    if (G.busted || G.dead) return;
    G.resetAim?.();
    G.busted = true; stateT = 0;
    freezePos = P.position.clone();
    const fee = Math.round((P.money || 0) * 0.1);
    G.bustFee = fee;
    game.ui.arrested = { fee };
    game.emit?.('arrest', { fee });
    sfx(game, 'whistle', null, 0.8);
  }
  G.bust = bust;
  function deathTick(dt) {
    if (freezePos && !G.dead && !G.busted) freezePos = null; // watchdog: freeze only while dead/arrested
    if ((G.dead || G.busted) && stateT > 8) { stateT = 8; } // respawn paths below fire at 3.5-4.5 s
    if (!G.dead && !G.busted && P.health <= 0) die();
    if (!G.dead && !G.busted) return;
    stateT += dt;
    if (G.dead && stateT > 4.5) {
      G.dead = false; freezePos = null;
      clearWanted(true); G.police?.hardReset?.();
      const hp = G.respawnAt('hospital'); teleport(hp);
      P.health = 100; P.armor = 0;
      const bill = Math.min(500, P.money || 0); P.money = (P.money || 0) - bill;
      game.ui.dead = false;
      tryCall('notify', () => game.hud?.notify?.(`Discharged from Solana General${G.city?.districtAt(hp.x, hp.z) ? ' (' + G.city.districtAt(hp.x, hp.z) + ')' : ''}. Medical bill: $${bill}`, 4500));
    }
    if (G.busted && stateT > 3.5) {
      G.busted = false; freezePos = null;
      clearWanted(true); G.police?.hardReset?.();
      const sp = G.respawnAt('police'); teleport(sp);
      P.money = Math.max(0, (P.money || 0) - (G.bustFee || 0));
      G.weapons?.strip?.();
      game.ui.arrested = false;
      tryCall('notify', () => game.hud?.notify?.(`Released from the ${G.city?.districtAt(sp.x, sp.z) || 'Port Solana'} PD precinct. Weapons confiscated.`, 4500));
    }
  }

  // ------------------------------------------------------------------ fixed hook (runs after the player controller)
  let jackKcc = null;
  try { jackKcc = game.world.createCharacterController(0.03); jackKcc.setUp({ x: 0, y: 1, z: 0 }); jackKcc.enableSnapToGround(0.3); jackKcc.enableAutostep(0.3, 0.2, true); jackKcc.setApplyImpulsesToDynamicBodies(false); } catch (e) { warnOnce('jackKcc', e); }
  game.fixedHooks.push((fdt) => {
    try {
      const b = P.body; if (!b || P.state.inVehicle) return;
      if (freezePos) {
        b.setNextKinematicTranslation({ x: freezePos.x, y: freezePos.y + 0.92, z: freezePos.z });
        P.position.copy(freezePos);
        return;
      }
      if (G.jack) {
        // collision-aware approach to the driver door: KCC sweep, stop ~0.9m short, never push into the chassis
        const j = G.jack, t = b.translation();
        const dx = j.door.x - t.x, dz = j.door.z - t.z, dist = Math.hypot(dx, dz);
        let nx = t.x, nz = t.z, ny = t.y;
        if (dist > 0.9 && P.collider) {
          const step = Math.min(dist - 0.9, 3.2 * (fdt || 1 / 60));
          const desired = { x: dx / dist * step, y: -0.02, z: dz / dist * step };
          let mv = { x: 0, y: 0, z: 0 };
          try {
            jackKcc.computeColliderMovement(P.collider, desired, game.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
            mv = jackKcc.computedMovement();
          } catch (e) { mv = { x: 0, y: 0, z: 0 }; }
          nx = t.x + mv.x; ny = t.y + Math.max(mv.y, -0.05); nz = t.z + mv.z;
        }
        b.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
        P.position.x = nx; P.position.z = nz;
        try { const vt = j.v.body.translation(); P.heading = Math.atan2(vt.x - nx, vt.z - nz); } catch (e) { /* ignore */ }
        return;
      }
      if (G.faceCamera) P.heading = Math.atan2(-Math.sin(game.cameraYaw), -Math.cos(game.cameraYaw));
    } catch (e) { warnOnce('fixed', e); }
  });

  // ------------------------------------------------------------------ main update
  let helpOwned = false;
  G.setHelp = (txt) => {
    if (txt) { tryCall('help', () => game.hud?.help?.(txt)); helpOwned = true; }
    else if (helpOwned) { tryCall('help', () => game.hud?.help?.(null)); helpOwned = false; }
  };
  function update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    G.combatT += dt;
    tryCall('jack', () => jackTick(dt));
    tryCall('reports', () => reportsTick(dt));
    tryCall('wanted', () => wantedTick(dt));
    tryCall('weapons.update', () => G.weapons?.update(dt));
    tryCall('pickups.update', () => G.pickups?.update(dt));
    tryCall('police.update', () => G.police?.update(dt));
    tryCall('world.update', () => G.props?.update?.(dt));
    tryCall('activities.update', () => G.activities?.update?.(dt));
    tryCall('death', () => deathTick(dt));
    // regen to 50% out of combat
    if (!G.dead && P.health > 0 && P.health < 50 && G.combatT > 8) P.health = Math.min(50, P.health + 1.5 * dt);
  }
  return { update, wanted: W, G };
}
