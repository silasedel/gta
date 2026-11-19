// Offline mix test for src/core/audio.js (audio-clean track).
// Runs the real audio engine against a small mock `game` inside an OfflineAudioContext, steps the
// simulation at 30 Hz with ctx.suspend()/resume(), and returns the rendered mix plus per-bus meter peaks.
// Nothing is played out loud: an OfflineAudioContext has no output device.
//   mixtest.html?sc=drive|city|walk|crash|beach|driveby&dur=30&engine=v10
//   &impl=/path/to/candidate/audio.js renders a candidate build instead of the live module.
import * as THREE from 'three';
import { createAudio as liveCreateAudio } from '../core/audio.js';

const SR = 48000;
const FPS = 30;
const q = new URLSearchParams(location.search);
const SC = q.get('sc') || 'drive';
const DUR = +(q.get('dur') || 30);
const ENGINE = q.get('engine') || 'v10';

function emitter() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(fn);
    },
    emit(name, e) {
      for (const fn of map.get(name) || []) fn(e);
    },
  };
}

function makeCar(opts) {
  const mesh = new THREE.Object3D();
  mesh.position.set(opts.x ?? 0, 0.5, opts.z ?? 0);
  const car = {
    id: opts.id,
    mesh,
    model: {
      class: opts.cls || 'sedan',
      engine: opts.engine || 'v6',
      vmax: opts.vmax || 200,
    },
    typeKey: opts.cls || 'sedan',
    ai: !opts.player,
    speedKmh: 0,
    speed: 0,
    throttle: 0,
    dir: opts.dir ?? 1,
    ctrl: { throttle: 0, brake: 0, handbrake: false },
    body: {
      linvel: () => ({ x: 0, y: 0, z: car.dir * car.speed }),
    },
  };
  return car;
}

function makeGame() {
  const ev = emitter();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  const game = {
    on: ev.on,
    emit: ev.emit,
    camera,
    clock: { elapsed: 0 },
    timeOfDay: 13,
    ui: {},
    env: { indoor: 0 },
    interiors: { list: [] },
    vehicles: { list: [] },
    player: {
      position: new THREE.Vector3(0, 0, 0),
      state: { inVehicle: false, vehicle: null },
      waterDepth: 0,
    },
    city: {
      zone: 'downtown',
      surface: 'concrete',
      seaLevel: -0.12,
      zoneAt() {
        return game.city.zone;
      },
      surfaceAt() {
        return game.city.surface;
      },
      isWater() {
        return false;
      },
    },
  };
  return game;
}

// ---- scenarios: setup(game) once, step(game, t, dt) every frame ----
function traffic(game, n, x0) {
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1;
    const c = makeCar({
      id: 'ai' + i,
      cls: ['sedan', 'suv', 'compact', 'taxi', 'pickup', 'van'][i % 6],
      engine: ['v6', 'v6', 'i3', 'i4', 'v8', 'diesel'][i % 6],
      x: x0 + (dir > 0 ? 2 : -2),
      z: -dir * (60 + i * 45),
      dir,
    });
    c.speed = (40 + ((i * 7) % 25)) / 3.6;
    c.speedKmh = c.speed * 3.6;
    c.throttle = 0.35;
    game.vehicles.list.push(c);
  }
}
function moveTraffic(game, dt) {
  for (const c of game.vehicles.list) {
    if (!c.ai) continue;
    c.mesh.position.z += c.dir * c.speed * dt;
    if (Math.abs(c.mesh.position.z - game.camera.position.z) > 260)
      c.mesh.position.z -= c.dir * 500;
  }
}
function chase(game, car) {
  const p = car.mesh.position;
  game.camera.position.set(p.x, p.y + 2.2, p.z - 6.5);
  game.camera.lookAt(p.x, p.y + 0.8, p.z + 10);
  game.camera.updateMatrixWorld();
  game.player.position.copy(p);
}
// supercar driver: launch, upshifts, lift (overrun), cruise, brake, launch again
function driveProfile(car, t, dt) {
  let thr = 0;
  let brake = 0;
  if (t < 1.5) thr = 0;
  else if (t < 12) thr = 1;
  else if (t < 13.5) thr = 0;
  else if (t < 19) thr = 0.35;
  else if (t < 22) brake = 1;
  else if (t < 29) thr = 1;
  const a = thr * 9.5 * Math.max(0.15, 1 - car.speed / 95) - brake * 11 - 0.4;
  car.speed = Math.max(0, car.speed + a * dt);
  car.speedKmh = car.speed * 3.6;
  car.throttle = thr;
  car.ctrl.throttle = thr;
  car.ctrl.brake = brake;
  car.braking = brake > 0;
  car.mesh.position.z += car.speed * dt;
}
let pc = null;
let stepT = 0;
const SCENES = {
  drive: {
    setup(g) {
      g.city.zone = 'downtown';
      pc = makeCar({ id: 'player', player: true, cls: 'super', engine: ENGINE, vmax: 330 });
      g.player.state = { inVehicle: true, vehicle: pc };
      g.vehicles.list.push(pc);
      traffic(g, 8, 0);
      chase(g, pc);
    },
    step(g, t, dt) {
      driveProfile(pc, t, dt);
      moveTraffic(g, dt);
      chase(g, pc);
    },
  },
  crash: {
    setup(g) {
      SCENES.drive.setup(g);
    },
    step(g, t, dt) {
      if (t < 9) driveProfile(pc, t, dt);
      else if (!pc._crashed) {
        pc._crashed = true;
        g.emit('crash', { vehicle: pc, point: pc.mesh.position.clone(), impulse: 22000 });
        pc.speed = 0;
        pc.speedKmh = 0;
        pc.throttle = 0;
      }
      if (t > 15 && t < 15.05)
        g.emit('crash', { vehicle: pc, point: pc.mesh.position.clone(), impulse: 6000 });
      moveTraffic(g, dt);
      chase(g, pc);
    },
  },
  city: {
    setup(g) {
      g.city.zone = 'downtown';
      g.camera.position.set(0, 1.6, 0);
      g.camera.lookAt(10, 1.6, 0);
      g.camera.updateMatrixWorld();
      traffic(g, 8, 8);
    },
    step(g, t, dt) {
      moveTraffic(g, dt);
      stepT -= dt;
      if (stepT <= 0) {
        stepT = 7;
        g.emit('pedVoice', {
          kind: 'greet',
          position: new THREE.Vector3(3, 0, 4),
          gender: 'female',
        });
      }
    },
  },
  walk: {
    setup(g) {
      g.city.zone = 'residential';
      g.city.surface = 'concrete';
      g.camera.position.set(0, 1.8, -3);
      g.camera.updateMatrixWorld();
      traffic(g, 3, 25);
    },
    step(g, t, dt) {
      g.player.position.z += 1.4 * dt;
      g.camera.position.set(0, 1.8, g.player.position.z - 3);
      g.camera.lookAt(0, 1.2, g.player.position.z + 5);
      g.camera.updateMatrixWorld();
      moveTraffic(g, dt);
      stepT -= dt;
      if (stepT <= 0) {
        stepT = 0.55;
        g.emit('footstep', {
          position: g.player.position.clone(),
          surface: t > 15 ? 'grass' : 'concrete',
        });
      }
    },
  },
  beach: {
    setup(g) {
      g.city.zone = 'beach';
      g.city.surface = 'sand';
      g.camera.position.set(470, 1.8, -3);
      g.camera.updateMatrixWorld();
      g.player.position.set(470, 0, 0);
    },
    step(g, t, dt) {
      g.player.position.z += 1.3 * dt;
      g.camera.position.set(470, 1.8, g.player.position.z - 3);
      g.camera.lookAt(500, 1, g.player.position.z);
      g.camera.updateMatrixWorld();
      stepT -= dt;
      if (stepT <= 0) {
        stepT = 0.58;
        g.emit('footstep', { position: g.player.position.clone(), surface: 'sand' });
      }
    },
  },
  // fixed roadside listener, the supercar (AI-driven) passes twice at speed
  driveby: {
    setup(g) {
      g.city.zone = 'residential';
      g.camera.position.set(0, 1.6, 0);
      g.camera.lookAt(10, 1.6, 0);
      g.camera.updateMatrixWorld();
      pc = makeCar({ id: 'super', cls: 'super', engine: ENGINE, vmax: 330, x: 6, z: -260, dir: 1 });
      pc.speed = 30;
      g.vehicles.list.push(pc);
    },
    step(g, t, dt) {
      const p = pc.mesh.position;
      const target = t < 15 ? 55 : 40;
      pc.speed += Math.sign(target - pc.speed) * Math.min(Math.abs(target - pc.speed), 6 * dt);
      pc.throttle = pc.speed < target - 1 ? 1 : 0.4;
      pc.ctrl.throttle = pc.throttle;
      pc.speedKmh = pc.speed * 3.6;
      p.z += pc.dir * pc.speed * dt;
      if (t > 14.9 && t < 15 && pc.dir > 0) {
        pc.dir = -1;
        p.z = 300;
        p.x = 9;
      }
    },
  },
};

function toB64(buf) {
  const n = buf.length;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const out = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
    out[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
  }
  const bytes = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// deterministic randomness so before / after renders compare like for like
function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function run() {
  seedRandom(+(q.get('seed') || 7));
  const off = new OfflineAudioContext(2, Math.round(SR * DUR), SR);
  window.AudioContext = function FakeAudioContext() {
    return off;
  };
  window.webkitAudioContext = window.AudioContext;
  const game = makeGame();
  const scene = SCENES[SC];
  scene.setup(game);
  const createAudio = q.get('impl')
    ? (await import(/* @vite-ignore */ q.get('impl'))).createAudio
    : liveCreateAudio;
  const audio = createAudio(game);
  game.audio = audio;
  if (q.has('vol')) audio.setVolume(+q.get('vol'));
  else audio.setVolume(0.9);
  if (q.get('bus')) {
    const [bus, v] = q.get('bus').split(':');
    audio.setBusVolume?.(bus, +v);
  }
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
  // warm-up: let the banks and lazily-loaded loops decode before time starts
  for (let i = 0; i < 80; i++) {
    audio.update(0.001);
    await new Promise((r) => setTimeout(r, 50));
  }
  const peaks = {};
  const dt = 1 / FPS;
  const frames = Math.floor(DUR * FPS) - 1;
  for (let i = 1; i <= frames; i++) {
    const t = i * dt;
    off.suspend(t).then(() => {
      game.clock.elapsed = t;
      scene.step(game, t, dt);
      audio.update(dt);
      if (i % 3 === 0) {
        const m = audio.meter();
        for (const [k, v] of Object.entries(m)) peaks[k] = Math.max(peaks[k] ?? -200, v);
      }
      off.resume();
    });
  }
  const buf = await off.startRendering();
  let pk = 0;
  let s2 = 0;
  let clip = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > pk) pk = a;
      if (a >= 0.999) clip++;
      s2 += d[i] * d[i];
    }
  }
  window.result = {
    sc: SC,
    engine: ENGINE,
    peakDb: +(20 * Math.log10(pk + 1e-9)).toFixed(2),
    rmsDb: +(10 * Math.log10(s2 / (2 * buf.length) + 1e-12)).toFixed(2),
    clippedSamples: clip,
    busPeaks: peaks,
    debug: audio.debug,
  };
  window.wav = toB64(buf);
  window.ready = true;
}
run().catch((e) => {
  window.failed = String((e && e.stack) || e);
});
