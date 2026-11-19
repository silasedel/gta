// POLICE track: the escalating response on top of the patrol units.
//   3+ stars  Skywatch helicopter (searchlight at night, sweeps the search area, sees over walls, hard to shake),
//             spike strips laid across the road at roadblocks
//   4+ stars  helicopter marksman, SWAT vans (Ironside) dropping armored officers with rifles
//   6 stars   TIDEWALL: a second helicopter, faster SWAT, a statewide bounty
// Everything is pooled and built once; nothing runs while the wanted level is zero and no unit is left on the map.
import * as THREE from 'three';
import { tryCall, sfx, distXZ, rand, inView, hasLOS, groundAt } from '../util.js';
import { buildPoliceHeli } from './modelsAir.js';
import { buildSpikeStrip } from './models.js';

const HELI_ALT = 52,
  HELI_SPEED = 34,
  HELI_SIGHT = 240;
export function createResponse(game, G, law, police) {
  const S = law.S,
    P = game.player,
    scene = game.scene;
  const helis = [],
    spikes = [];
  const _v = new THREE.Vector3(),
    _w = new THREE.Vector3(),
    _aim = new THREE.Vector3(),
    _eye = new THREE.Vector3(),
    _tgt = new THREE.Vector3();
  const night = () => {
    const t = game.timeOfDay ?? 12;
    return t < 6.8 || t > 18.8;
  };

  // ------------------------------------------------------------------ rotor audio: a looping thump through the ambience bus, positional
  function rotorAudio(h) {
    const ctx = game.audio?.ctx;
    if (!ctx || h.snd) return;
    tryCall('heli audio', () => {
      const len = ctx.sampleRate * 2,
        buf = ctx.createBuffer(1, len, ctx.sampleRate),
        d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        b = b * 0.97 + (Math.random() * 2 - 1) * 0.03;
        const ph = ((i / ctx.sampleRate) * 11.5) % 1;
        d[i] = b * 9 * (ph < 0.22 ? 1 : 0.25) + (Math.random() * 2 - 1) * 0.03;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 650;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = 40;
      pan.rolloffFactor = 1.1;
      pan.maxDistance = 900;
      src
        .connect(f)
        .connect(g)
        .connect(pan)
        .connect(game.audio.ambienceBus || ctx.destination);
      src.start();
      h.snd = { src, g, pan };
    });
  }
  function rotorAudioTick(h) {
    const s = h.snd;
    if (!s) return;
    const ctx = game.audio.ctx,
      p = h.m.group.position;
    tryCall('pan', () => {
      s.pan.positionX.value = p.x;
      s.pan.positionY.value = p.y;
      s.pan.positionZ.value = p.z;
      s.g.gain.setTargetAtTime(h.state === 'gone' ? 0 : 0.9, ctx.currentTime, 0.4);
    });
  }
  function stopAudio(h) {
    const s = h.snd;
    if (!s) return;
    tryCall('stop', () => {
      s.g.gain.setTargetAtTime(0, game.audio.ctx.currentTime, 0.3);
      setTimeout(() => {
        try {
          s.src.stop();
        } catch (e) {
          /* */
        }
      }, 900);
    });
    h.snd = null;
  }

  // ------------------------------------------------------------------ helicopters
  function makeHeli(i) {
    const m = buildPoliceHeli(THREE, { seed: 41 + i * 7, unit: i + 1 });
    m.group.visible = false;
    scene.add(m.group, m.spotTarget, m.pool);
    m.spot.castShadow = false;
    m.setSpot(false);
    const h = {
      m,
      i,
      state: 'gone',
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      t: 0,
      orbitA: Math.random() * 6.28,
      fireCd: 4,
      spotA: 0,
      sees: false,
      name: i ? 'Skywatch 2' : 'Skywatch 1',
      obs: { o: null, kind: 'heli', dist: 0, perception: 0.8, name: '', callTime: 1.2 },
      _susp: 0,
      lostT: 0,
    };
    h.obs.o = h;
    h.obs.name = h.name;
    return h;
  }
  function launch(h) {
    const pp = P.position,
      stn = police.stations?.nearest?.(pp);
    // they come in from the nearest station's side, out of view, at altitude
    const dx = stn ? stn.x - pp.x : 1,
      dz = stn ? stn.z - pp.z : 0,
      l = Math.hypot(dx, dz) || 1;
    const r = 320;
    h.pos.set(pp.x + (dx / l) * r, groundAt(game, pp.x, pp.z) + HELI_ALT + 20, pp.z + (dz / l) * r);
    h.vel.set(0, 0, 0);
    h.state = 'inbound';
    h.t = 0;
    h.m.group.visible = true;
    h._susp = 0;
    h.m.group.position.copy(h.pos);
    rotorAudio(h);
    tryCall('radio', () => law.radio?.say('spotted', { unit: h.name, kind: 'heli' }));
    game.emit?.('police:heli', { on: true, name: h.name });
  }
  function retire(h) {
    h.state = 'leave';
    h.t = 0;
    h.m.setSpot(false);
  }
  const wantHelis = () => (S.level >= 6 ? 2 : S.level >= 3 ? 1 : 0);
  let heliDelay = 0;
  function heliTick(dt) {
    const want = wantHelis();
    let flying = 0;
    for (const h of helis) if (h.state !== 'gone' && h.state !== 'leave') flying++;
    if (want > flying) {
      heliDelay -= dt;
      if (heliDelay <= 0) {
        let h = helis.find((x) => x.state === 'gone');
        if (!h && helis.length < 2) {
          h = makeHeli(helis.length);
          helis.push(h);
        }
        if (h) launch(h);
        heliDelay = rand(10, 16);
      }
    } else heliDelay = Math.max(heliDelay, want ? 4 : rand(12, 18)); // first one arrives some seconds after the third star
    if (want < flying)
      for (const h of helis)
        if (h.state !== 'gone' && h.state !== 'leave' && h.i >= want) retire(h);
    const pp = P.position;
    for (const h of helis) {
      if (h.state === 'gone') continue;
      h.t += dt;
      const gy = groundAt(game, h.pos.x, h.pos.z);
      // where to be: over the player while someone has eyes on, otherwise circling the search area
      let cx, cz, R;
      if (h.state === 'leave') {
        const a = Math.atan2(h.pos.x - pp.x, h.pos.z - pp.z);
        cx = pp.x + Math.sin(a) * 900;
        cz = pp.z + Math.cos(a) * 900;
        R = 0;
      } else if (S.seen || !S.search) {
        cx = pp.x;
        cz = pp.z;
        R = 48 + h.i * 22;
      } else {
        cx = S.search.center.x;
        cz = S.search.center.z;
        R = Math.min(140, S.search.radius * 0.45);
      }
      h.orbitA += dt * (R > 0 ? (HELI_SPEED * 0.35) / Math.max(30, R) : 0) * (h.i ? -1 : 1);
      _v.set(
        cx + Math.sin(h.orbitA) * R,
        Math.max(gy, groundAt(game, cx, cz)) + HELI_ALT + h.i * 8,
        cz + Math.cos(h.orbitA) * R,
      );
      _w.subVectors(_v, h.pos);
      const d = _w.length();
      const vmax = h.state === 'inbound' ? HELI_SPEED * 1.4 : HELI_SPEED;
      if (d > 0.01) _w.multiplyScalar(Math.min(vmax, d * 0.6) / d);
      h.vel.lerp(_w, Math.min(1, dt * 0.9));
      h.pos.addScaledVector(h.vel, dt);
      if (h.state === 'inbound' && distXZ(h.pos, pp) < 140) h.state = 'on';
      if (h.state === 'leave' && h.t > 25) {
        h.state = 'gone';
        h.m.group.visible = false;
        h.m.setSpot(false);
        stopAudio(h);
        game.emit?.('police:heli', { on: false, name: h.name });
        continue;
      }
      const g = h.m.group;
      g.position.copy(h.pos);
      // nose into the motion, bank into turns
      const sp = Math.hypot(h.vel.x, h.vel.z),
        yaw = sp > 2 ? Math.atan2(h.vel.x, h.vel.z) : Math.atan2(pp.x - h.pos.x, pp.z - h.pos.z);
      let dy = yaw - g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.rotation.y += dy * Math.min(1, dt * 1.5);
      g.rotation.x = Math.min(0.22, sp * 0.006);
      g.rotation.z = -dy * 0.5;
      h.m.update(dt, { rotorSpeed: 1 });
      // eyes: a downward camera / searchlight sees far, ignores the cone, blocked only by roofs and bridges
      _eye.set(h.pos.x, h.pos.y - 1, h.pos.z);
      _tgt.set(pp.x, pp.y + 1.2, pp.z);
      const hd = _eye.distanceTo(_tgt);
      h.seeT = (h.seeT || 0) - dt;
      if (h.seeT <= 0) {
        h.seeT = 0.25;
        h.sees =
          h.state !== 'leave' &&
          hd < HELI_SIGHT * (night() ? 0.8 : 1) &&
          !P.state.indoor &&
          !game.interiors?.current &&
          hasLOS(game, _eye, _tgt);
      }
      // searchlight: on the player while seen, sweeping the search area otherwise (night only, like the real thing)
      const spotOn = night() && h.state !== 'leave';
      if (spotOn) {
        if (S.seen && h.sees) _aim.set(pp.x, pp.y, pp.z);
        else {
          h.spotA += dt * 0.55;
          const c = S.search?.center || S.lastKnown,
            rr = Math.min(70, (S.search?.radius || 60) * 0.35);
          _aim.set(c.x + Math.sin(h.spotA * 1.3) * rr, 0, c.z + Math.cos(h.spotA) * rr);
          _aim.y = groundAt(game, _aim.x, _aim.z);
        }
        if (!h.spotOn) {
          h.m.setSpot(true);
          h.spotOn = true;
          h.aim = _aim.clone();
        }
        h.aim.lerp(_aim, Math.min(1, dt * 3));
        h.m.aimSpot(h.aim);
      } else if (h.spotOn) {
        h.m.setSpot(false);
        h.spotOn = false;
      }
      // marksman from four stars
      if (S.level >= 4 && h.sees && S.seen && h.state === 'on' && !police.arrest?.holdFire?.()) {
        h.fireCd -= dt;
        if (h.fireCd <= 0) {
          h.fireCd = rand(2.2, 3.6);
          tryCall('heli shot', () =>
            police.copShoot?.({ aim: 0.55, gunKey: 'rifle' }, _tgt.clone(), hd * 0.5, _eye.clone()),
          );
        }
      }
      rotorAudioTick(h);
    }
  }
  const obsList = [];
  function observers() {
    obsList.length = 0;
    for (const h of helis)
      if (h.state === 'on' && h.sees) {
        h.obs.dist = distXZ(h.pos, P.position);
        obsList.push(h.obs);
      }
    return obsList;
  }

  // ------------------------------------------------------------------ spike strips (laid with a roadblock, in front of it)
  function addSpikes(b, ra, gy) {
    if (S.level < 3) return;
    if (S.level === 3 && Math.random() < 0.4) return;
    const W2 = Math.max(6, ra.width || 10),
      L = Math.min(9, W2 * 0.8);
    const m = buildSpikeStrip(THREE, { length: L, deployed: 0.05 });
    const back = 14; // in front of the block, on the player's side
    const cx = ra.x - ra.dir.x * back,
      cz = ra.z - ra.dir.z * back;
    m.group.position.set(cx, gy + 0.02, cz);
    // the strip's length runs along its local X: lay it across the road (perpendicular to the travel direction)
    m.group.rotation.y = Math.atan2(ra.dir.x, ra.dir.z); // local Z along the road, so the strip's length (local X) lies across it
    scene.add(m.group);
    const s = {
      b,
      m,
      x: cx,
      z: cz,
      dx: ra.dir.x,
      dz: ra.dir.z,
      half: L / 2,
      k: 0.05,
      hit: new WeakSet(),
      t: 0,
    };
    spikes.push(s);
    b.spikes = s;
    tryCall('event', () =>
      game.emit?.('spikeStrip', {
        position: new THREE.Vector3(cx, gy, cz),
        heading: Math.atan2(ra.dir.x, ra.dir.z),
        width: L,
      }),
    );
  }
  function removeSpikes(b) {
    const s = b?.spikes;
    if (!s) return;
    scene.remove(s.m.group);
    const i = spikes.indexOf(s);
    if (i >= 0) spikes.splice(i, 1);
    b.spikes = null;
  }
  // a burst tyre until the vehicle physics owns tyres (README: v.tires): the car drags, pulls to the burst side and sparks
  const flats = new Set();
  function blowTires(v, s) {
    if (!v.tires)
      v.tires = [0, 1, 2, 3].map(() => ({ wear: 0, pressure: 1, flat: false, blown: false }));
    let n = 0;
    for (let i = 0; i < 4; i++)
      if (!v.tires[i].blown && Math.random() < (i < 2 ? 0.9 : 0.7)) {
        v.tires[i].blown = v.tires[i].flat = true;
        v.tires[i].pressure = 0;
        n++;
        tryCall('tire ev', () =>
          game.emit?.('vehicle:tire', { vehicle: v, index: i, cause: 'spike' }),
        );
      }
    if (!n) return;
    flats.add(v);
    sfx(game, 'backfire', v.body.translation(), 1);
    sfx(game, 'glass', v.body.translation(), 0.4);
    if (v.playerDriven) law.notify?.('Tires blown! The car will not get far.', 2600);
    void s;
  }
  const _imp = { x: 0, y: 0, z: 0 };
  function flatTick(dt) {
    for (const v of flats) {
      if (!v.body || v.removed || v.disposed) {
        flats.delete(v);
        continue;
      }
      let nb = 0;
      for (const t of v.tires) if (t.blown) nb++;
      if (!nb) {
        flats.delete(v);
        continue;
      }
      let lv;
      try {
        lv = v.body.linvel();
      } catch (e) {
        flats.delete(v);
        continue;
      }
      const sp = Math.hypot(lv.x, lv.z);
      if (sp < 0.5) continue;
      const m = tryCall('mass', () => v.body.mass(), 1400) || 1400;
      // rolling drag of shredded rubber on the rims + a speed cap around 55 km/h
      const drag = (0.9 + nb * 0.55 + Math.max(0, sp - 15) * 0.35) * dt * m;
      _imp.x = (-lv.x / sp) * drag;
      _imp.z = (-lv.z / sp) * drag;
      _imp.y = 0;
      tryCall('drag', () => v.body.applyImpulse(_imp, true));
      // pull: a small yaw wobble toward the burst side
      const side =
        (v.tires[0].blown || v.tires[2].blown ? 1 : 0) -
          (v.tires[1].blown || v.tires[3].blown ? 1 : 0) || 1;
      tryCall('pull', () =>
        v.body.applyTorqueImpulse(
          {
            x: 0,
            y:
              side *
              m *
              0.9 *
              dt *
              Math.min(1, sp / 12) *
              (0.7 + Math.sin(game.clock.elapsed * 9) * 0.3),
            z: 0,
          },
          true,
        ),
      );
      if (sp > 6 && Math.random() < dt * 14) {
        const t = v.body.translation();
        tryCall('sparks', () =>
          game.fx?.sparks?.(new THREE.Vector3(t.x, t.y - 0.3, t.z), new THREE.Vector3(0, 1, 0)),
        );
      }
    }
  }
  function spikeTick(dt) {
    for (const s of spikes) {
      s.t += dt;
      if (s.k < 1) {
        s.k = Math.min(1, s.k + dt * 1.8);
        s.m.setDeployed(s.k);
      }
      for (const v of game.vehicles?.list || []) {
        if (v.police || v.isBoat || v.isAircraft || s.hit.has(v)) continue;
        let t;
        try {
          t = v.body.translation();
        } catch (e) {
          continue;
        }
        const rx = t.x - s.x,
          rz = t.z - s.z;
        const along = rx * s.dx + rz * s.dz,
          across = Math.abs(-rx * s.dz + rz * s.dx);
        if (
          Math.abs(along) < 1.6 &&
          across < s.half + 0.6 &&
          Math.abs(t.y - s.m.group.position.y) < 2.5
        ) {
          s.hit.add(v);
          blowTires(v, s);
        }
      }
    }
  }

  // ------------------------------------------------------------------ SWAT (4+) and the six-star manhunt
  let swatCd = 20,
    swatRadio = false;
  function swatTick(dt) {
    if (S.level < 4) {
      swatCd = Math.min(swatCd, 14);
      swatRadio = false;
      return;
    }
    swatCd -= dt;
    let vans = 0;
    for (const c of police.cars) if (c.swat) vans++;
    const want = S.level >= 6 ? 3 : S.level >= 5 ? 2 : 1;
    if (swatCd <= 0 && vans < want) {
      swatCd = S.level >= 6 ? rand(14, 20) : rand(24, 34);
      const c = police.dispatchUnit?.({ swat: true });
      if (c && !swatRadio) {
        swatRadio = true;
        tryCall('radio', () => law.radio?.say('swat'));
      }
    }
  }
  game.on?.('wanted:manhunt', (d) => {
    law.notify?.(
      `STATEWIDE ALERT: $${Math.round(d.bounty).toLocaleString('en-US')} on your head. Every unit in the county is coming.`,
      5200,
      { kind: 'crime' },
    );
    tryCall('phone', () =>
      game.emit?.('phone:alert', {
        title: 'Emergency Alert',
        body: 'Armed and dangerous suspect at large. Stay indoors. Report sightings to 911.',
      }),
    );
  });

  function tick(dt) {
    let air = false;
    for (const h of helis) if (h.state !== 'gone') air = true;
    const active = S.level > 0 || air || spikes.length || flats.size;
    if (!active) return;
    heliTick(dt);
    spikeTick(dt);
    flatTick(dt);
    swatTick(dt);
  }
  function reset() {
    for (const h of helis) {
      h.state = 'gone';
      h.m.group.visible = false;
      h.m.setSpot(false);
      stopAudio(h);
    }
    for (const s of spikes.slice()) removeSpikes(s.b);
    heliDelay = 0;
    swatCd = 20;
  }
  return {
    tick,
    reset,
    observers,
    addSpikes,
    removeSpikes,
    helis,
    spikes,
    flats,
    blowTires,
    get stats() {
      return {
        helis: helis.filter((h) => h.state !== 'gone').length,
        heliOn: helis.filter((h) => h.state === 'on').length,
        spikes: spikes.length,
      };
    },
  };
}
