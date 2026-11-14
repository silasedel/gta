// Port Solana multiplayer session in the game (MULTIPLAYER track). Loaded only when ?mp= is set (see mp.v2.js).
// - uploads the local player (on foot or driving) at 30 Hz, reconciles server corrections
// - draws remote players with the game's own character system (createCharacter, same as game.playerCharacter),
//   their outfits, name tags, and the cars they drive (built with the vehicles track's buildCar)
// - shared time of day and weather come from the server; NPC traffic stays local
// - shots and melee go to the server, which decides PvP hits
import * as THREE from 'three';
import { NetClient } from './clientCore.js';
import {
  TICK_HZ, SEAT_NONE, weaponIndex, weaponKey,
  F_IN_VEHICLE, F_GROUNDED, F_SPRINT, F_JUMPING, F_SWIMMING, F_DEAD, F_AIMING, F_PUNCH,
  V_LIGHTS, V_BRAKE, V_REVERSE, V_SIREN,
} from './protocol.js';
import { createCharacter } from '../player/characterModel.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _pose = { x: 0, y: 0, z: 0, vx: 0, vz: 0, h: 0, extrap: 0 };

export async function startSession(game, opts) {
  const P = game.player;
  const scene = game.scene;
  const client = new NetClient({ url: opts.url, link: opts.link });
  const outfit = () => {
    try {
      return Object.values(game.wardrobe?.current?.() || {});
    } catch (e) {
      return [];
    }
  };
  const welcome = await client.connect({
    name: opts.name,
    room: opts.room,
    outfit: outfit(),
    body: { fat: P.body?.fat, muscle: P.body?.muscle },
  });
  game.hud?.notify?.(`Online: room ${welcome.room} as ${welcome.name}`, 5000);
  const info = new Map();
  for (const p of welcome.players) {
    info.set(p.id, p);
  }
  client.on('join', (m) => {
    info.set(m.id, m);
    game.hud?.notify?.(`${m.name} joined`, 2500);
  });
  client.on('look', (m) => {
    const i = info.get(m.id);
    if (i) {
      i.outfit = m.outfit;
      i.body = m.body;
      const a = avatars.get(m.id);
      if (a) {
        applyLook(a.char, i);
      }
    }
  });
  client.on('leave', (m) => {
    info.delete(m.id);
    dropAvatar(m.id);
    game.hud?.notify?.(`${m.name} left`, 2500);
  });

  // ---------------------------------------------------------------- shared world: time and weather
  const prevTimeExternal = game.timeExternal;
  game.timeExternal = true;
  const world = { tod: welcome.world.tod, rate: 24 / (welcome.world.dayMinutes * 60) };
  const applyWeather = (w) => {
    try {
      if (typeof game.weather?.set === 'function') {
        game.weather.set(w.weather, { rain: w.rain });
      } else {
        game.weather = Object.assign(game.weather && typeof game.weather === 'object' ? game.weather : {}, { kind: w.weather, rain: w.rain });
      }
    } catch (e) {
      console.warn('[net] weather', e);
    }
  };
  const onWorld = (w) => {
    world.tod = w.tod;
    world.rate = 24 / (w.dayMinutes * 60);
    applyWeather(w);
  };
  onWorld(welcome.world);
  game.timeOfDay = world.tod;
  client.on('world', onWorld);

  // ---------------------------------------------------------------- remote vehicles (proxies)
  const vdesc = new Map();
  for (const v of welcome.vehicles) {
    vdesc.set(v.id, v);
  }
  client.on('veh', (m) => vdesc.set(m.id, m));
  client.on('vpark', (m) => {
    const d = vdesc.get(m.id);
    if (d) {
      d.p = m.p;
      d.r = m.r;
      d.driver = null;
    }
  });
  client.on('vgone', (m) => {
    vdesc.delete(m.id);
    dropProxy(m.id);
  });
  const proxies = new Map();
  let carMod = null;
  import('../vehicles/carModel2.js').then((m) => {
    carMod = m;
  }).catch((e) => console.warn('[net] car models unavailable', e));
  let regMod = null;
  import('../vehicles/registry.js').then((m) => {
    regMod = m;
  }).catch(() => {});

  function makeProxy(d) {
    if (!carMod) {
      return null;
    }
    let car = null;
    try {
      if (regMod?.hasExternalModel?.(d.key)) {
        car = regMod.buildExternalCar(d.key, d.color ?? 0x888888, { seed: d.id });
      }
      if (!car) {
        const key = carMod.CAR_TYPES[d.key] ? d.key : 'sedan';
        if (carMod.isBuilt && !carMod.isBuilt(key, 'base')) {
          carMod.prebuild?.(key, 'base');
        }
        car = carMod.buildCar(key, d.look && d.look.key === key ? d.look : (d.color ?? 0x888888));
      }
    } catch (e) {
      console.warn('[net] proxy car failed', d.key, e);
      return null;
    }
    const spec = carMod.CAR_TYPES[d.key] || carMod.CAR_TYPES.sedan;
    // same rest height as vehicles.js: body origin = suspension at rest + wheel radius
    const susp = spec.susp || [0.36, 34];
    const groundOff = susp[0] - 9.81 / (4 * susp[1]) + (spec.r || 0.33);
    car.shell.position.y = -groundOff;
    scene.add(car.root);
    // a kinematic box so the local player and local cars bump into it
    let body = null;
    try {
      const R = game.RAPIER;
      body = game.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
      game.world.createCollider(R.ColliderDesc.cuboid((spec.W || 1.9) / 2, 0.7, (spec.L || 4.6) / 2).setTranslation(0, 0.7 - groundOff, 0), body);
    } catch (e) {
      body = null;
    }
    const px = { id: d.id, car, body, spin: 0, lx: 0, lz: 0, init: false };
    proxies.set(d.id, px);
    return px;
  }

  function dropProxy(id) {
    const px = proxies.get(id);
    if (!px) {
      return;
    }
    scene.remove(px.car.root);
    try {
      px.car.dispose?.();
      carMod?.releaseCar?.(px.car);
    } catch (e) {
      // already released
    }
    if (px.body) {
      try {
        game.world.removeRigidBody(px.body);
      } catch (e) {
        // already removed
      }
    }
    proxies.delete(id);
  }

  function placeProxy(px, x, y, z, h, pitch, roll, steer, vflags, dt) {
    const root = px.car.root;
    root.position.set(x, y, z);
    _e.set(pitch, h, roll, 'YXZ');
    root.quaternion.setFromEuler(_e);
    if (px.body) {
      px.body.setNextKinematicTranslation({ x, y, z });
      px.body.setNextKinematicRotation({ x: root.quaternion.x, y: root.quaternion.y, z: root.quaternion.z, w: root.quaternion.w });
    }
    // wheels roll with the ground speed, front wheels steer
    const sp = px.init && dt > 0 ? Math.hypot(x - px.lx, z - px.lz) / dt : 0;
    _v.set(x - px.lx, 0, z - px.lz);
    const fwd = Math.sin(h) * _v.x + Math.cos(h) * _v.z >= 0 ? 1 : -1;
    px.lx = x;
    px.lz = z;
    px.init = true;
    for (const w of px.car.wheels || []) {
      w.spin.rotation.x += fwd * sp * dt / (w.r || 0.33);
      if (w.front) {
        w.steer.rotation.y = steer * 0.6;
      }
    }
    const lm = px.car.lightMats;
    if (lm) {
      lm.head.emissiveIntensity = vflags & V_LIGHTS ? 7 : 0.9;
      lm.tail.emissiveIntensity = vflags & V_BRAKE ? 7 : vflags & V_LIGHTS ? 2.2 : 0.15;
      if (lm.reverse) {
        lm.reverse.emissiveIntensity = vflags & V_REVERSE ? 4 : 0;
      }
    }
  }

  // ---------------------------------------------------------------- remote players
  const avatars = new Map();
  const tagLayer = document.createElement('div');
  tagLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden';
  document.body.appendChild(tagLayer);

  function applyLook(ch, i) {
    try {
      if (i?.outfit?.length && ch?.outfit?.set) {
        ch.outfit.set(i.outfit);
      }
      if (i?.body && ch?.body?.set) {
        ch.body.set(i.body);
      }
    } catch (e) {
      console.warn('[net] outfit', e);
    }
  }

  function makeAvatar(id) {
    let ch = null;
    try {
      ch = createCharacter(game, { variant: 'player', seed: 1000 + id });
    } catch (e) {
      console.warn('[net] avatar', e);
    }
    if (!ch) {
      return null;
    }
    scene.add(ch.root);
    applyLook(ch, info.get(id));
    const tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-9999px,0);font:600 13px/1.2 "Barlow Condensed",system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000,0 0 2px #000;text-align:center;white-space:nowrap;letter-spacing:.04em';
    const nameEl = document.createElement('div');
    const bar = document.createElement('div');
    bar.style.cssText = 'margin:3px auto 0;width:56px;height:4px;border-radius:2px;background:rgba(0,0,0,.5);overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:100%;background:#4fd18b';
    bar.appendChild(fill);
    tag.append(nameEl, bar);
    tagLayer.appendChild(tag);
    const a = { id, char: ch, tag, nameEl, fill, label: '', hp: -1 };
    avatars.set(id, a);
    return a;
  }

  function dropAvatar(id) {
    const a = avatars.get(id);
    if (!a) {
      return;
    }
    scene.remove(a.char.root);
    try {
      a.char.dispose?.();
    } catch (e) {
      // ignore
    }
    a.tag.remove();
    avatars.delete(id);
  }

  const anim = {
    speed: 0,
    grounded: true,
    jumping: false,
    sprint: false,
    driving: false,
    punch: false,
    dead: false,
    swimming: false,
    wading: false,
  };
  const cam = game.camera;
  let lastCleanup = 0;

  function drawRemotes(dt) {
    const rt = client.advance(dt * 1000);
    const w = innerWidth;
    const h = innerHeight;
    const proxyUsed = new Set();
    for (const [id, r] of client.remotes) {
      let a = avatars.get(id);
      if (!a) {
        a = makeAvatar(id);
        if (!a) {
          continue;
        }
      }
      if (!client.render(r, rt, _pose)) {
        a.char.root.visible = false;
        continue;
      }
      const inCar = r.seat !== SEAT_NONE && vdesc.has(r.veh);
      if (inCar) {
        let px = proxies.get(r.veh);
        if (!px) {
          px = makeProxy(vdesc.get(r.veh));
        }
        if (px) {
          proxyUsed.add(r.veh);
          placeProxy(px, _pose.x, _pose.y, _pose.z, _pose.h, r.pitch, r.roll, r.steer, r.vflags, dt);
        }
      }
      const ch = a.char;
      ch.setVisible?.(!(inCar && proxies.has(r.veh)));
      ch.root.visible = !(inCar && proxies.has(r.veh));
      if (ch.root.visible) {
        ch.root.position.set(_pose.x, _pose.y, _pose.z);
        ch.root.rotation.y = _pose.h;
        const f = r.flags;
        anim.speed = r.animSpeed;
        anim.grounded = (f & F_GROUNDED) !== 0;
        anim.jumping = (f & F_JUMPING) !== 0;
        anim.sprint = (f & F_SPRINT) !== 0;
        anim.punch = (f & F_PUNCH) !== 0;
        anim.dead = (f & F_DEAD) !== 0;
        anim.swimming = (f & F_SWIMMING) !== 0;
        anim.driving = (f & F_IN_VEHICLE) !== 0;
        try {
          ch.update(dt, anim);
        } catch (e) {
          // a broken avatar must not stop the frame
        }
      }
      // name tag above the head (or above the car roof)
      const i = info.get(id);
      const label = (i?.name || 'Player') + (r.wanted ? ' ' + '★'.repeat(r.wanted) : '');
      if (label !== a.label) {
        a.label = label;
        a.nameEl.textContent = label;
      }
      if (r.health !== a.hp) {
        a.hp = r.health;
        a.fill.style.width = Math.max(0, Math.min(100, r.health)) + '%';
        a.fill.style.background = r.health < 35 ? '#ff5a5a' : '#4fd18b';
      }
      _v.set(_pose.x, _pose.y + (inCar ? 2.0 : 2.15), _pose.z);
      const dist = _v.distanceTo(cam.position);
      _v.project(cam);
      if (_v.z > 1 || dist > 160) {
        a.tag.style.transform = 'translate(-9999px,0)';
      } else {
        const sx = (_v.x * 0.5 + 0.5) * w;
        const sy = (-_v.y * 0.5 + 0.5) * h;
        a.tag.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
        a.tag.style.opacity = dist > 90 ? String(Math.max(0.25, 1 - (dist - 90) / 70)) : '1';
      }
    }
    // parked shared cars (their owner got out) stay where they were left
    for (const [vid, d] of vdesc) {
      if (proxyUsed.has(vid) || d.owner === client.id) {
        continue;
      }
      const drivenBy = [...client.remotes.values()].some((r) => r.veh === vid && r.seat !== SEAT_NONE);
      if (drivenBy) {
        continue;
      }
      const dx = d.p[0] - P.position.x;
      const dz = d.p[2] - P.position.z;
      if (dx * dx + dz * dz > 400 * 400) {
        dropProxy(vid);
        continue;
      }
      const px = proxies.get(vid) || makeProxy(d);
      if (px) {
        placeProxy(px, d.p[0], d.p[1], d.p[2], d.r[0], d.r[1], d.r[2], 0, 0, dt);
      }
    }
    // avatars of players that left our interest radius
    if (game.clock.elapsed - lastCleanup > 1) {
      lastCleanup = game.clock.elapsed;
      for (const id of [...avatars.keys()]) {
        if (!client.remotes.has(id)) {
          dropAvatar(id);
        }
      }
    }
  }

  // ---------------------------------------------------------------- local player upload + reconciliation
  const st = {
    flags: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, animSpeed: 0, health: 100, armor: 0,
    wanted: 0, weapon: 0, veh: 0, seat: SEAT_NONE, pitch: 0, roll: 0, steer: 0, vflags: 0,
  };
  let vehCounter = 0;
  let myVeh = null;
  let myVehId = 0;
  const vehIds = new WeakMap();
  let sendAcc = 0;
  const last = new THREE.Vector3().copy(P.position);
  let lastDead = false;

  const origTeleport = game.teleport;
  game.teleport = (...a) => {
    client.sendJSON({ t: 'tp', reason: 'teleport' });
    return origTeleport(...a);
  };

  function vehicleNetId(v) {
    let id = vehIds.get(v);
    if (!id) {
      vehCounter = (vehCounter % 1023) + 1;
      id = ((client.id + 1) << 10) | vehCounter;
      vehIds.set(v, id);
    }
    return id;
  }

  function poseOf(v, out) {
    const r = v.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _e.setFromQuaternion(_q, 'YXZ');
    out[0] = _e.y;
    out[1] = _e.x;
    out[2] = _e.z;
    return out;
  }

  function upload(dt) {
    const s = P.state;
    const v = s.inVehicle ? s.vehicle : null;
    // a jump no physics can make in one frame is a script teleport (respawn, interior, fast travel): declare it
    const jump = Math.hypot(P.position.x - last.x, P.position.z - last.z);
    const dead = P.health <= 0 || !!game.ui?.dead;
    if (jump > 25 || (lastDead && !dead)) {
      client.sendJSON({ t: 'tp', reason: 'jump' });
    }
    lastDead = dead;
    if (v !== myVeh) {
      if (myVeh && myVeh.body && myVeh.alive !== false) {
        const t = myVeh.body.translation();
        client.sendJSON({ t: 'vpark', id: myVehId, p: [t.x, t.y, t.z], r: poseOf(myVeh, [0, 0, 0]) });
      }
      myVeh = v;
      if (v && v.body) {
        myVehId = vehicleNetId(v);
        const t = v.body.translation();
        client.sendJSON({
          t: 'veh',
          id: myVehId,
          key: v.typeKey || v.kind || 'sedan',
          kind: v.kind || 'car',
          color: Number.isFinite(v.car?.look?.color) ? v.car.look.color : null,
          look: v.car?.look || null,
          p: [t.x, t.y, t.z],
          r: poseOf(v, [0, 0, 0]),
        });
      }
    }
    sendAcc += dt;
    if (sendAcc < 1 / TICK_HZ) {
      last.copy(P.position);
      return;
    }
    const sdt = sendAcc;
    sendAcc = 0;
    let f = 0;
    if (s.grounded) {
      f |= F_GROUNDED;
    }
    if (s.sprint) {
      f |= F_SPRINT;
    }
    if (s.jumping) {
      f |= F_JUMPING;
    }
    if (P.swimming) {
      f |= F_SWIMMING;
    }
    if (dead) {
      f |= F_DEAD;
    }
    if (P.aiming) {
      f |= F_AIMING;
    }
    if (s.punch) {
      f |= F_PUNCH;
    }
    st.heading = P.heading;
    st.seat = SEAT_NONE;
    st.veh = 0;
    if (v && v.body) {
      f |= F_IN_VEHICLE;
      const t = v.body.translation();
      const lv = v.body.linvel();
      st.x = t.x;
      st.y = t.y;
      st.z = t.z;
      st.vx = lv.x;
      st.vy = lv.y;
      st.vz = lv.z;
      const pr = poseOf(v, [0, 0, 0]);
      st.heading = pr[0];
      st.pitch = pr[1];
      st.roll = pr[2];
      st.steer = Math.max(-1, Math.min(1, (v.steerCur || 0) / 0.6));
      st.vflags = (v.lightsOn ? V_LIGHTS : 0) | (v.braking ? V_BRAKE : 0) | (v.reversing ? V_REVERSE : 0) | (v.sirenOn ? V_SIREN : 0);
      st.veh = myVehId;
      st.seat = 0;
      st.animSpeed = 0;
    } else {
      st.x = P.position.x;
      st.y = P.position.y;
      st.z = P.position.z;
      st.vx = (P.position.x - st.lx) / sdt || 0;
      st.vy = (P.position.y - st.ly) / sdt || 0;
      st.vz = (P.position.z - st.lz) / sdt || 0;
      if (jump > 25) {
        st.vx = 0;
        st.vy = 0;
        st.vz = 0;
      }
      st.animSpeed = Math.min(15, Math.hypot(st.vx, st.vz));
    }
    st.lx = P.position.x;
    st.ly = P.position.y;
    st.lz = P.position.z;
    st.flags = f;
    st.health = Math.max(0, P.health || 0);
    st.armor = Math.max(0, P.armor || 0);
    st.wanted = P.wanted || 0;
    st.weapon = weaponIndex(P.weapon);
    client.sendState(st);
    last.copy(P.position);
  }

  // reconciliation: the server refused a state (speed or teleport check); shift our body by the difference
  client.on('correct', (c) => {
    const v = P.state.inVehicle ? P.state.vehicle : null;
    const body = v?.body || P.body;
    if (!body) {
      return;
    }
    const t = body.translation();
    body.setTranslation({ x: t.x + c.dx, y: t.y + c.dy, z: t.z + c.dz }, true);
    if (v) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    P.position.x += c.dx;
    P.position.y += c.dy;
    P.position.z += c.dz;
    last.copy(P.position);
    console.warn('[net] position corrected by server', c.reason, c.dx.toFixed(1), c.dz.toFixed(1));
  });

  // ---------------------------------------------------------------- combat
  const offShot = (ev) => {
    if (!ev?.byPlayer || !ev.origin || !ev.dir) {
      return;
    }
    client.sendJSON({
      t: 'shot',
      o: [ev.origin.x, ev.origin.y, ev.origin.z],
      d: [ev.dir.x, ev.dir.y, ev.dir.z],
      w: ev.weapon,
      ct: performance.now() >>> 0,
      vt: Math.round(client.renderT),
      ip: Math.round(client.interpDelay),
    });
  };
  game.on('shot', offShot);
  game.on('shot:suppressed', offShot);
  game.on('punch', () => {
    client.sendJSON({ t: 'melee', w: weaponKey(weaponIndex(P.weapon)), ct: performance.now() >>> 0, vt: Math.round(client.renderT) });
  });
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  client.on('shot', (m) => {
    _a.set(m.o[0], m.o[1], m.o[2]);
    _b.set(m.o[0] + m.d[0] * m.len, m.o[1] + m.d[1] * m.len, m.o[2] + m.d[2] * m.len);
    try {
      const tracer = game.gameplay?.G?.tracer || game.combat?.gfx?.tracer;
      tracer?.(_a.clone(), _b.clone(), { speed: 300 });
      game.audio?.play?.(m.w, { position: { x: _a.x, y: _a.y, z: _a.z }, volume: 1 });
    } catch (e) {
      // effects are optional
    }
  });
  client.on('hit', (m) => {
    let d = m.dmg;
    const ar = Math.min(P.armor || 0, d * 0.66);
    P.armor = (P.armor || 0) - ar;
    d -= ar;
    P.health = Math.max(0, (P.health || 0) - d);
    game.emit?.('hit', { target: 'player', kind: 'bullet', damage: m.dmg, by: 'player:' + m.by, point: P.position.clone() });
  });
  client.on('kill', (m) => {
    const a = info.get(m.by)?.name || (m.by === client.id ? 'You' : 'Someone');
    const b = info.get(m.victim)?.name || (m.victim === client.id ? 'you' : 'someone');
    game.hud?.notify?.(`${a} took down ${b}`, 3000);
  });

  // ---------------------------------------------------------------- per frame
  let pingT = 0;
  const tick = function netTick(dt) {
    if (!client.connected) {
      return;
    }
    if (world.rate) {
      world.tod = (world.tod + dt * world.rate) % 24;
      let d = world.tod - game.timeOfDay;
      if (d > 12) {
        d -= 24;
      }
      if (d < -12) {
        d += 24;
      }
      game.timeOfDay = Math.abs(d) > 0.25 ? world.tod : (game.timeOfDay + d * Math.min(1, dt) + 24) % 24;
    }
    upload(dt);
    drawRemotes(dt);
    pingT -= dt;
    if (pingT <= 0) {
      pingT = 2;
      client.sendJSON({ t: 'cfg', interp: Math.round(client.interpDelay) });
    }
  };
  game.updaters.push(tick);

  client.on('close', () => {
    game.hud?.notify?.('Disconnected from the multiplayer server', 5000);
    for (const id of [...avatars.keys()]) {
      dropAvatar(id);
    }
    for (const id of [...proxies.keys()]) {
      dropProxy(id);
    }
    game.timeExternal = prevTimeExternal;
    game.teleport = origTeleport;
    tagLayer.remove();
  });

  return {
    client,
    room: welcome.room,
    id: welcome.id,
    avatars,
    proxies,
    chat(text) {
      client.sendJSON({ t: 'chat', text });
    },
    leave() {
      client.close();
    },
    stats() {
      return {
        remotes: client.remotes.size,
        avatars: avatars.size,
        proxies: proxies.size,
        interpDelay: client.interpDelay,
        bytesIn: client.bytesIn,
        bytesOut: client.bytesOut,
      };
    },
  };
}
