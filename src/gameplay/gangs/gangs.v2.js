// Gangs and territories (v2.1). Three original gangs hold street corners in their home districts. Members hang out
// on their corners; rival crews brawl when you pass between turfs; you earn or lose rep with each gang; you can take a
// corner in a turf fight (clear the corner, hold it against waves) and then it pays you; gangs that hate you hit
// back with drive-bys and raids on your corners. State persists through game.save ('gangs' slice).
// API: game.gangs = { list, territories, rep(id), standing(id), kitFor(id), startTurfFight(tid), war, layer }.
import * as THREE from 'three';
import { GANGS, GANG, TURFS_PER_GANG, TURF_RADIUS, TURF_INCOME_PER_HOUR, TURF_POT_CAP } from './data.js';
import { fmt, dist2, help, notify, canAct, spawnKitPed, pedOut, release, keepFighting, fireAtPlayer, makeMarker, removeMarker, groundY } from '../../jobs/kit.js';

export const order = 120;

const CREW_R = 160;       // spawn the corner crew inside this distance
const RELEASE_R = 240;    // let them go beyond this
const WAVES = [
  { n: 0, armed: 0 },     // wave 1 is the crew already on the corner
  { n: 4, armed: 1 },
  { n: 5, armed: 2 },
];
const MAX_MELEE = 3;
const HOLD_SECONDS = 20;

export async function initV2(game) {
  const city = game.city;
  const sf = city?.storefronts || [];
  if (!sf.length || !game.peds?.spawnAt) {
    console.warn('[gangs] no storefronts or ped system: gangs disabled');
    return;
  }

  // ---------------------------------------------------------------- territories from real storefronts
  const territories = [];
  for (const g of GANGS) {
    const pool = sf.filter((s) => g.home.includes(s.district) && Number.isFinite(s.fx));
    pool.sort((a, b) => a.id - b.id);
    if (!pool.length) continue;
    let cx = 0;
    let cz = 0;
    for (const s of pool) {
      cx += s.x;
      cz += s.z;
    }
    cx /= pool.length;
    cz /= pool.length;
    // first corner: closest to the center of the home turf; then farthest-point picks at least 140 m apart
    const picks = [];
    pool.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    picks.push(pool[0]);
    while (picks.length < TURFS_PER_GANG) {
      let best = null;
      let bd = 0;
      for (const s of pool) {
        const d = Math.min(...picks.map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
        const fromHome = Math.hypot(s.x - cx, s.z - cz);
        if (d > bd && d >= 140 && fromHome < 900) {
          bd = d;
          best = s;
        }
      }
      if (!best) break;
      picks.push(best);
    }
    picks.forEach((s, i) => {
      let dx = s.fx - s.x;
      let dz = s.fz - s.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const x = s.fx + dx * 3.2;
      const z = s.fz + dz * 3.2;
      territories.push({
        id: `${g.id}_${i + 1}`,
        gang: g.id,
        owner: g.id,
        x,
        z,
        r: TURF_RADIUS,
        street: s.street || g.homeName,
        district: s.district,
        name: `${s.street || g.homeName} corner`,
        crew: [],
        group: null,
        pot: 0,
        marker: null,
      });
    });
  }
  const T = Object.fromEntries(territories.map((t) => [t.id, t]));

  // ---------------------------------------------------------------- persistent state
  const S = { rep: {}, lostTo: {}, owned: {}, pots: {}, taken: 0, defended: 0, driveBys: 0 };
  const resetState = () => {
    S.rep = Object.fromEntries(GANGS.map((g) => [g.id, 0]));
    S.lostTo = {};
    S.owned = {};
    S.pots = {};
    S.taken = 0;
    S.defended = 0;
    S.driveBys = 0;
    for (const t of territories) {
      t.owner = t.gang;
      t.pot = 0;
    }
  };
  resetState();
  const syncOwnerVisuals = () => {
    for (const t of territories) {
      if (t.owner === 'player' && !t.marker) t.marker = makeMarker(game, t, 0x2fe0d0, { r: 0.8, h: 0.35 });
      if (t.owner !== 'player' && t.marker) {
        removeMarker(game, t.marker);
        t.marker = null;
      }
    }
  };
  game.save?.register?.('gangs', {
    version: 1,
    order: 60,
    save: () => {
      S.owned = {};
      S.pots = {};
      for (const t of territories) {
        if (t.owner !== t.gang) S.owned[t.id] = t.owner;
        if (t.pot > 0) S.pots[t.id] = Math.round(t.pot);
      }
      return JSON.parse(JSON.stringify(S));
    },
    load: (d) => {
      resetState();
      if (d) {
        Object.assign(S.rep, d.rep || {});
        S.lostTo = d.lostTo || {};
        S.taken = d.taken || 0;
        S.defended = d.defended || 0;
        S.driveBys = d.driveBys || 0;
        for (const [id, owner] of Object.entries(d.owned || {})) if (T[id]) T[id].owner = owner;
        for (const [id, pot] of Object.entries(d.pots || {})) if (T[id]) T[id].pot = pot;
      }
      for (const t of territories) dropCrew(t);
      syncOwnerVisuals();
    },
  });

  // ---------------------------------------------------------------- rep
  const clampRep = (v) => Math.max(-100, Math.min(100, v));
  const standing = (id) => {
    const r = S.rep[id] || 0;
    return r <= -40 ? 'hostile' : r < -10 ? 'wary' : r < 25 ? 'neutral' : r < 60 ? 'friendly' : 'allied';
  };
  function addRep(id, d, why) {
    const before = standing(id);
    S.rep[id] = clampRep((S.rep[id] || 0) + d);
    const after = standing(id);
    if (after !== before) notify(game, `${GANG[id].name}: you are now ${after.toUpperCase()}${why ? ` (${why})` : ''}`, 3600);
    game.emit?.('gangRep', { gang: id, rep: S.rep[id], standing: after });
  }
  function onKill(gangId) {
    addRep(gangId, -4, 'member down');
    for (const r of GANG[gangId].rivals) addRep(r, 2);
  }

  // ---------------------------------------------------------------- corner crews
  let seed = 1;
  function spawnCrew(t) {
    const g = GANG[t.owner];
    if (!g) return;
    t.group = { members: [], center: new THREE.Vector3(t.x, groundY(game, t.x, t.z), t.z), props: [] };
    const n = 3 + (seed % 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const p = spawnKitPed(game, { x: t.x + Math.sin(a) * 1.1, z: t.z + Math.cos(a) * 1.1 }, g.kit, seed++, { group: t.group, tag: { gang: g.id, turf: t.id } });
      if (!p) continue;
      p.heading = Math.atan2(t.x - p.pos.x, t.z - p.pos.z);
      p.idleStyle = Math.random() < 0.6 ? 'talk' : null;
      p.armed = Math.random() < g.armed;
      t.crew.push(p);
    }
  }
  function dropCrew(t) {
    for (const p of t.crew) release(p);
    t.crew = [];
    t.group = null;
  }
  // track deaths of everyone we spawned (corner crews, waves, brawlers)
  const tracked = new Set();
  const track = (p) => {
    if (p) tracked.add(p);
    return p;
  };
  function scanDeaths() {
    for (const p of tracked) {
      if (!p.active || p.v21 == null) {
        tracked.delete(p);
        continue;
      }
      if (pedOut(p) && !p._v21Dead) {
        p._v21Dead = true;
        const tag = p.v21;
        if (tag?.gang && p._hitByPlayer) onKill(tag.gang);
        tracked.delete(p);
      }
    }
  }
  game.on?.('hit', (d) => {
    const p = d?.object;
    if (d?.target !== 'ped' || !p?.v21?.gang) return;
    p._hitByPlayer = true;
    const tag = p.v21;
    if (tag.brawl) {
      // you picked a side in a street brawl
      addRep(tag.gang, -6, 'you jumped in');
      const other = brawl?.sides.find((s) => s.gang !== tag.gang);
      if (other) addRep(other.gang, 4);
      return;
    }
    const t = T[tag.turf];
    if (t && !war && t.owner === tag.gang) {
      addRep(tag.gang, -8, 'you started it');
      startTurfFight(t.id, 'provoked');
    }
  });

  // ---------------------------------------------------------------- turf fight
  let war = null;
  function startTurfFight(tid, why = 'player') {
    const t = T[tid];
    if (!t || war) return false;
    const attacking = t.owner !== 'player';
    const g = GANG[attacking ? t.owner : t.raider];
    if (!g) return false;
    if (attacking && !t.crew.length) spawnCrew(t);
    war = { t, g, wave: attacking ? 0 : 1, enemies: [], holdT: 0, awayT: 0, attacking, time: 0, nextShot: {} };
    for (const p of t.crew) {
      war.enemies.push(track(p));
    }
    if (!attacking) spawnWave();
    game.save?.inhibit?.('turf');
    game.wanted?.add?.(1, { x: t.x, y: 0, z: t.z });
    game.hud?.setMission?.(attacking ? `Take the ${t.street} corner from ${g.name}` : `Defend your ${t.street} corner from ${g.name}`);
    notify(game, attacking ? `Turf fight: clear the corner, then hold it. (${why === 'provoked' ? 'They saw you coming.' : 'Wave 1 of 3'})` : `${g.name} are hitting your corner. Hold it!`, 4200);
    game.emit?.('turfFight', { id: t.id, gang: g.id, attacking });
    return true;
  }
  function spawnWave() {
    const w = WAVES[war.wave];
    const t = war.t;
    const P = game.player.position;
    // they arrive from the side away from the player
    let ax = t.x - P.x;
    let az = t.z - P.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    for (let i = 0; i < w.n; i++) {
      const sx = t.x + ax * (22 + i * 1.5) + (Math.random() - 0.5) * 8;
      const sz = t.z + az * (22 + i * 1.5) + (Math.random() - 0.5) * 8;
      const p = spawnKitPed(game, { x: sx, z: sz }, war.g.kit, seed++, { tag: { gang: war.g.id, turf: t.id, wave: war.wave } });
      if (!p) continue;
      p.armed = i < w.armed;
      war.enemies.push(track(p));
    }
    notify(game, `Wave ${war.wave + 1} of ${WAVES.length}: ${w.n} ${war.g.short} incoming${w.armed ? ', armed' : ''}`, 2600);
  }
  function endWar(won) {
    const { t, g, attacking } = war;
    for (const p of war.enemies) release(p);
    war = null;
    t.crew = [];
    t.group = null;
    game.save?.release?.('turf');
    game.hud?.setMission?.(null);
    if (won) {
      t.owner = 'player';
      t.raider = null;
      if (attacking) {
        S.taken++;
        S.lostTo[g.id] = (S.lostTo[g.id] || 0) + 1;
        addRep(g.id, -15, 'you took their corner');
        for (const r of g.rivals) addRep(r, 8);
      } else S.defended++;
      notify(game, `${t.street} corner is yours. It pays into a stash here every hour.`, 4500);
      game.stats?.add?.(attacking ? 'turfTaken' : 'turfDefended', 1);
    } else {
      if (!attacking) {
        t.owner = t.raider || t.gang;
        t.raider = null;
        notify(game, `You lost the ${t.street} corner to ${g.name}.`, 4000);
      } else notify(game, 'Turf fight lost. The corner stays theirs.', 3500);
    }
    syncOwnerVisuals();
    game.save?.requestAutosave?.(3);
    game.emit?.('turfFightEnd', { id: t.id, gang: g.id, won });
  }
  function warTick(dt) {
    const w = war;
    w.time += dt;
    const P = game.player;
    const d = dist2(P.position, w.t);
    if (game.ui?.dead || game.ui?.arrested) {
      endWar(false);
      return;
    }
    w.awayT = d > 95 ? w.awayT + dt : 0;
    if (w.awayT > 10) {
      endWar(false);
      return;
    }
    const alive = w.enemies.filter((p) => !pedOut(p) && p.active);
    let melee = 0;
    for (const p of alive) {
      const dp = dist2(p.pos, P.position);
      if (p.armed && dp < 32 && dp > 4) {
        // shooters hold position and fire
        p.state = 'watch';
        p.heading = Math.atan2(P.position.x - p.pos.x, P.position.z - p.pos.z);
        p.stateT = 5;
        const k = p.id ?? 0;
        w.nextShot[k] = (w.nextShot[k] ?? 0.8 + Math.random()) - dt;
        if (w.nextShot[k] <= 0) {
          w.nextShot[k] = 1.5 + Math.random() * 1.2;
          p.punchNow = true;
          fireAtPlayer(game, p.pos, P.state?.inVehicle ? 0.15 : 0.28, 6);
        }
        continue;
      }
      if (melee < MAX_MELEE) {
        keepFighting(p);
        melee++;
      } else if (p.state !== 'down' && p.state !== 'gettingUp') {
        // waiting their turn: circle at a distance and taunt
        p.state = 'watch';
        p.stateT = 3;
        p.heading = Math.atan2(P.position.x - p.pos.x, P.position.z - p.pos.z);
      }
    }
    if (alive.length === 0) {
      if (w.wave < WAVES.length - 1) {
        w.wave++;
        w.enemies = [];
        spawnWave();
        game.hud?.setMission?.(`Hold the ${w.t.street} corner: wave ${w.wave + 1} of ${WAVES.length}`);
      } else {
        w.holdT += dt;
        game.hud?.setMission?.(`Hold the corner: ${Math.max(0, Math.ceil(HOLD_SECONDS - w.holdT))} s`);
        if (w.holdT >= HOLD_SECONDS) endWar(true);
      }
    }
  }

  // ---------------------------------------------------------------- rival brawls between neighboring turfs
  let brawl = null;
  let brawlT = 40;
  function startBrawl() {
    const P = game.player.position;
    const near = territories.filter((t) => t.owner !== 'player' && dist2(t, P) < 420);
    if (near.length < 1) return;
    const a = near[Math.floor(Math.random() * near.length)];
    const ga = GANG[a.owner];
    const gb = GANG[ga.rivals[Math.floor(Math.random() * ga.rivals.length)]];
    if (!gb) return;
    const sp = city.randomSidewalkPoint?.(P, 45);
    if (!sp || dist2(sp, P) < 18) return;
    const sides = [ga, gb].map((g, k) => ({ gang: g.id, people: [] }));
    sides.forEach((s, k) => {
      const g = GANG[s.gang];
      for (let i = 0; i < 2; i++) {
        const off = (k ? 1 : -1) * 3.5;
        const p = spawnKitPed(game, { x: sp.x + off + (Math.random() - 0.5), z: sp.z + (i - 0.5) * 1.6 }, g.kit, seed++, { tag: { gang: g.id, brawl: true } });
        if (!p) continue;
        p.state = 'argue';
        p.stateT = 1e9;
        p.nav = null;
        s.people.push(track(p));
      }
    });
    brawl = { sides, t: 0, x: sp.x, z: sp.z };
    notify(game, `${ga.name} and ${gb.name} are fighting in the street.`, 3000);
  }
  function brawlTick(dt) {
    const b = brawl;
    b.t += dt;
    const [A, B] = b.sides;
    const aliveA = A.people.filter((p) => !pedOut(p));
    const aliveB = B.people.filter((p) => !pedOut(p));
    const P = game.player.position;
    if (!aliveA.length || !aliveB.length || b.t > 50 || dist2(b, P) > 200) {
      const winner = !aliveB.length ? A : !aliveA.length ? B : null;
      for (const s of b.sides) for (const p of s.people) release(p);
      if (winner && dist2(b, P) < 120) notify(game, `${GANG[winner.gang].name} won the street fight.`, 2500);
      brawl = null;
      return;
    }
    // each fighter closes on a target from the other side and trades blows
    for (const [mine, theirs] of [[aliveA, aliveB], [aliveB, aliveA]]) {
      mine.forEach((p, i) => {
        if (p.state === 'down' || p.state === 'gettingUp' || p.rag) return;
        if (p._hitByPlayer && dist2(p.pos, P) < 14) {
          keepFighting(p);
          return;
        }
        const o = theirs[i % theirs.length];
        const dx = o.pos.x - p.pos.x;
        const dz = o.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        p.state = 'argue';
        p.heading = Math.atan2(dx, dz);
        if (d > 1.1) {
          p.pos.x += (dx / d) * 2.2 * dt;
          p.pos.z += (dz / d) * 2.2 * dt;
        } else {
          p._cd = (p._cd ?? Math.random()) - dt;
          if (p._cd <= 0) {
            p._cd = 0.8 + Math.random() * 0.6;
            p.punchNow = true;
            o.health = (o.health ?? 100) - (12 + Math.random() * 10);
            o.hitNow = true;
            o.knock?.set?.((dx / d) * 1.5, 0, (dz / d) * 1.5);
            o.shoveT = 0.3;
            if (o.health <= 0) game.peds.damage(o, 50, { x: dx / d, z: dz / d }, 'melee', { heavy: true, strength: 1 });
          }
        }
      });
    }
  }

  // ---------------------------------------------------------------- retaliation: drive-bys and raids on your corners
  let driveBy = null;
  function startDriveBy(g) {
    const P = game.player;
    if (driveBy || war || !game.vehicles?.spawn || game.interiorState?.inside) return;
    const rp = city.randomRoadPoint?.(P.position, 90);
    if (!rp || dist2(rp.position, P.position) < 45) return;
    const v = game.vehicles.spawn(g.car.type, rp.position, rp.heading, { ai: true, color: g.car.color });
    if (!v) return;
    driveBy = { v, g, t: 0, shots: 0, nextShot: 0 };
    S.driveBys++;
    notify(game, `${g.name} car rolling up on you. Drive-by!`, 3000);
    game.emit?.('driveBy', { gang: g.id });
  }
  function driveByTick(dt) {
    const d = driveBy;
    d.t += dt;
    const P = game.player;
    const vp = d.v.position || d.v.body?.translation?.();
    if (!d.v.alive || !vp || d.t > 45) {
      if (d.v.alive && vp && dist2(vp, P.position) > 60) game.vehicles.remove?.(d.v);
      if (!d.v.alive || d.t > 70) driveBy = null;
      return;
    }
    // steer the car at the player while it is close (the traffic AI keeps driving it otherwise)
    d.v.setChaseTarget?.(P.position);
    const dd = dist2(vp, P.position);
    if (dd < 30 && d.shots < 9) {
      d.nextShot -= dt;
      if (d.nextShot <= 0) {
        d.nextShot = 0.35 + Math.random() * 0.4;
        d.shots++;
        fireAtPlayer(game, { x: vp.x, y: (vp.y || 0) + 0.3, z: vp.z }, 0.18, 6);
      }
    }
    if (d.shots >= 9 && dd > 80) {
      game.vehicles.remove?.(d.v);
      driveBy = null;
    }
  }
  function hourlyGangs() {
    // passive income from your corners
    for (const t of territories) {
      if (t.owner !== 'player') continue;
      const [lo, hi] = TURF_INCOME_PER_HOUR;
      t.pot = Math.min(TURF_POT_CAP, t.pot + lo + Math.random() * (hi - lo));
    }
    // retaliation
    for (const g of GANGS) {
      const angry = (S.rep[g.id] || 0) <= -40 || (S.lostTo[g.id] || 0) > 0;
      if (!angry) continue;
      const roll = Math.random();
      if (roll < 0.22 * (0.5 + g.aggression)) startDriveBy(g);
      else if (roll < 0.36) {
        const mine = territories.filter((t) => t.owner === 'player' && t.gang === g.id);
        const t = mine[Math.floor(Math.random() * mine.length)];
        if (t && !war && !t.raid) {
          t.raid = { g: g.id, until: game.time?.now + 45 };
          t.raider = g.id;
          notify(game, `${g.name} are moving on your ${t.street} corner. Get there within 45 minutes.`, 5000);
          game.waypoint = { x: t.x, z: t.z };
        }
      }
    }
  }
  game.time?.every?.(60, hourlyGangs, { id: 'gangs:hour', catchUp: 'last' });

  // ---------------------------------------------------------------- frame update
  let scanT = 0;
  game.updaters.push(function gangsTick(dt) {
    if (!(dt > 0) || game.ui?.paused) return;
    const P = game.player;
    scanT -= dt;
    if (scanT <= 0) {
      scanT = 0.25;
      scanDeaths();
      for (const t of territories) {
        const d = dist2(t, P.position);
        if (war?.t === t) continue;
        if (t.owner !== 'player' && d < CREW_R && !t.crew.length && game.city?.groundHeightAt) spawnCrew(t);
        if (t.crew.length && (d > RELEASE_R || t.owner === 'player')) dropCrew(t);
        // crews of a gang that hates you come at you
        if (t.crew.length && standing(t.owner) === 'hostile' && d < 22 && !war) startTurfFight(t.id, 'provoked');
        // raids on your corners
        if (t.raid) {
          if (d < 90 && !war) {
            t.raid = null;
            startTurfFight(t.id, 'raid');
          } else if (game.time && game.time.now > t.raid.until) {
            t.owner = t.raid.g;
            t.raid = null;
            t.raider = null;
            t.pot = 0;
            syncOwnerVisuals();
            notify(game, `You lost the ${t.street} corner to ${GANG[t.owner].name}.`, 4000);
          }
        }
      }
      brawlT -= 0.25;
      if (brawlT <= 0 && !brawl && !war && !P.state?.inVehicle) {
        brawlT = 70 + Math.random() * 80;
        if (Math.random() < 0.6) startBrawl();
      }
    }
    if (war) warTick(dt);
    if (brawl) brawlTick(dt);
    if (driveBy) driveByTick(dt);
    // prompts: start a fight at an enemy corner, collect at your own
    let prompt = null;
    if (!war && canAct(game) && !P.state?.inVehicle) {
      for (const t of territories) {
        const d = dist2(t, P.position);
        if (d > 7) continue;
        if (t.owner === 'player') {
          prompt = `Your corner · stash ${fmt(t.pot)} · <b>E</b> collect`;
          if (game.input.pressed('KeyE') && t.pot >= 1) {
            game.wallet?.earn?.(Math.floor(t.pot), { category: 'turf', memo: `${t.street} corner take`, hot: true });
            notify(game, `Collected ${fmt(t.pot)} from the ${t.street} corner.`, 2600);
            t.pot = 0;
          }
        } else if (t.crew.length) {
          const g = GANG[t.owner];
          prompt = `${g.name} turf (${standing(g.id)}) · <b>E</b> start a turf fight`;
          if (game.input.pressed('KeyE')) startTurfFight(t.id);
        }
        break;
      }
    }
    help(game, 'gangs', prompt);
    for (const t of territories) if (t.marker) t.marker.userData.ring.rotation.z += dt * 0.6;
  });

  // ---------------------------------------------------------------- pause-map layer (overlay canvas on the big map)
  game.mapLayers = game.mapLayers || [];
  const layer = {
    id: 'turf',
    name: 'Gang turf',
    enabled: true,
    draw(g, toScreen, k) {
      for (const t of territories) {
        const [sx, sy] = toScreen(t.x, t.z);
        const col = t.owner === 'player' ? '#ffffff' : GANG[t.owner].color;
        const rr = Math.max(7, t.r * 2.2 * k);
        g.globalAlpha = 0.28;
        g.fillStyle = col;
        g.beginPath();
        g.arc(sx, sy, rr, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.95;
        g.lineWidth = 2;
        g.strokeStyle = col;
        g.stroke();
        if (k > 0.25) {
          g.font = '700 12px "Archivo Black", sans-serif';
          g.textAlign = 'center';
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(6,9,14,.8)';
          const label = t.owner === 'player' ? 'YOUR CORNER' : GANG[t.owner].short.toUpperCase();
          g.strokeText(label, sx, sy - rr - 6);
          g.fillStyle = '#fff';
          g.fillText(label, sx, sy - rr - 6);
        }
      }
      g.globalAlpha = 1;
    },
    legend: () => GANGS.map((g) => [g.color, `${g.name} (${standing(g.id)})`]).concat([['#ffffff', 'Your corners']]),
  };
  game.mapLayers.push(layer);
  installMapOverlay(game);

  game.gangs = {
    list: GANGS,
    territories,
    rep: (id) => S.rep[id] || 0,
    standing,
    addRep,
    kitFor: (id) => GANG[id]?.kit || null,
    gangOf: (ped) => ped?.v21?.gang || null,
    startTurfFight,
    get war() {
      return war;
    },
    get brawl() {
      return brawl;
    },
    get driveBy() {
      return driveBy;
    },
    startBrawl,
    startDriveBy: (id) => startDriveBy(GANG[id] || GANGS[0]),
    hourly: hourlyGangs,
    layer,
    state: S,
  };
}

// Draws every game.mapLayers entry on a canvas laid over the HUD's big map (hud.js has no layer hook yet).
// L on the open pause map toggles the layers.
function installMapOverlay(game) {
  if (game._v21MapOverlay) return;
  game._v21MapOverlay = true;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;pointer-events:none;z-index:9000;display:none';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  let on = true;
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyL' && game.ui?.paused) {
      on = !on;
      notify(game, `Map layers ${on ? 'on' : 'off'}`, 1500);
    }
  });
  const tick = () => {
    requestAnimationFrame(tick);
    const big = document.querySelector('.ps-bigmap');
    const view = game.ui?._mapView?.();
    const r = big?.getBoundingClientRect?.();
    if (!on || !game.ui?.paused || !big || !view || !r || r.width < 10) {
      if (cv.style.display !== 'none') cv.style.display = 'none';
      return;
    }
    const d = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) {
      cv.width = Math.round(r.width * d);
      cv.height = Math.round(r.height * d);
    }
    cv.style.display = 'block';
    cv.style.left = r.left + 'px';
    cv.style.top = r.top + 'px';
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const k = view.ppm;
    const ox = r.width / 2 - view.cx * k;
    const oz = r.height / 2 - view.cz * k;
    const toScreen = (x, z) => [ox + x * k, oz + z * k];
    const rows = [];
    for (const L of game.mapLayers || []) {
      if (!L.enabled) continue;
      try {
        L.draw(g, toScreen, k);
        rows.push(...(L.legend?.() || []));
      } catch (e) {
        /* a broken layer never breaks the map */
      }
    }
    if (rows.length) {
      const lw = 230;
      const lh = 30 + rows.length * 19;
      const lx = 16;
      const ly = r.height - lh - 46;
      g.fillStyle = 'rgba(9,11,18,.74)';
      g.fillRect(lx, ly, lw, lh);
      g.font = '700 12px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillStyle = '#9fb0c2';
      g.fillText('MAP LAYERS  (L to hide)', lx + 12, ly + 18);
      rows.forEach(([c, txt], i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(lx + 18, ly + 36 + i * 19, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#eef2f6';
        g.font = '600 12px Inter, system-ui, sans-serif';
        g.fillText(txt, lx + 30, ly + 40 + i * 19);
      });
    }
  };
  requestAnimationFrame(tick);
}
