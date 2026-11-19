#!/usr/bin/env node
// In-game multiplayer check (MULTIPLAYER track): the real game in the V2 test browser joins a local server
// through ?mp= with a simulated 100 ms / 30 ms jitter / 2 % loss link, two headless bots (same client core)
// walk and drive in front of the player. Saves a screenshot sequence and per-frame motion of the remote
// avatars measured inside the page.
//   node tools/v2/mp-browser.mjs [--out docs/v2/shots/multiplayer]
import net from 'node:net';
import fs from 'node:fs';
import { withBrowser, GAME_READY } from './browser.mjs';
import { startServer } from '../../server/server.js';
import { NetClient } from '../../src/net/clientCore.js';
import { SEAT_NONE, F_IN_VEHICLE, F_GROUNDED, weaponIndex } from '../../src/net/protocol.js';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'docs/v2/shots/multiplayer';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort(from = 5320) {
  for (let p = from; p < from + 100; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => s.close(() => res(true)));
    });
    if (ok) {
      return p;
    }
  }
  throw new Error('no free port');
}

const port = await freePort();
const srv = startServer({ port, host: '127.0.0.1', log: (m) => console.log(m) });
const link = { lag: 100, jitter: 30, loss: 0.02 };
const bots = [];
for (let i = 0; i < 2; i++) {
  const c = new NetClient({ url: `ws://127.0.0.1:${port}`, link });
  await c.connect({ name: i ? 'Marisol' : 'Dex', room: 'BEACH', outfit: [], body: {} });
  bots.push(c);
}
let anchor = null;
const t0 = performance.now();
const vehId = ((bots[1].id + 1) << 10) | 1;
bots[1].sendJSON({
  t: 'veh',
  id: vehId,
  key: 'sedan',
  kind: 'car',
  color: 0xb8322a,
  p: [0, 0, 0],
  r: [0, 0, 0],
});
function botPose(i, t, o) {
  const A = anchor;
  const fx = -Math.sin(A.yaw);
  const fz = -Math.cos(A.yaw);
  const rx = -fz;
  const rz = fx;
  if (i === 0) {
    // walks a 2.5 m circle 7 m in front of the camera
    const a = t * 1.0;
    o.x = A.x + fx * 7 + rx * -1.5 + Math.cos(a) * 2.5;
    o.z = A.z + fz * 7 + rz * -1.5 + Math.sin(a) * 2.5;
    o.y = A.y;
    o.car = false;
  } else {
    // drives back and forth across the view 14 m ahead at up to ~8 m/s
    const s = Math.sin(t * 0.35) * 16;
    o.x = A.x + fx * 14 + rx * s;
    o.z = A.z + fz * 14 + rz * s;
    o.y = A.y + 0.62;
    o.car = true;
  }
  return o;
}
const pa = {};
const pb = {};
const sendTimer = setInterval(() => {
  if (!anchor) {
    return;
  }
  const t = (performance.now() - t0) / 1000;
  for (let i = 0; i < 2; i++) {
    botPose(i, t, pa);
    botPose(i, t + 0.01, pb);
    const vx = (pb.x - pa.x) * 100;
    const vz = (pb.z - pa.z) * 100;
    bots[i].sendState({
      flags: (pa.car ? F_IN_VEHICLE : 0) | F_GROUNDED,
      x: pa.x,
      y: pa.y,
      z: pa.z,
      vx,
      vy: 0,
      vz,
      heading: Math.atan2(vx, vz),
      animSpeed: Math.hypot(vx, vz),
      health: i ? 100 : 72,
      armor: 0,
      wanted: i ? 2 : 0,
      weapon: weaponIndex('pistol'),
      veh: pa.car ? vehId : 0,
      seat: pa.car ? 0 : SEAT_NONE,
      pitch: 0,
      roll: 0,
      steer: Math.cos(t * 0.35) * 0.2,
      vflags: 0,
    });
  }
}, 1000 / 30);

const report = {};
try {
  await withBrowser({ width: 1280, height: 720, maxSeconds: 300 }, async (b) => {
    const url = `http://127.0.0.1:5200/?mute&mp=ws://127.0.0.1:${port}&room=BEACH&name=Nico&mpLag=100&mpJitter=30&mpLoss=2`;
    await b.goto(url);
    await b.waitFor(GAME_READY + ' && game.net', 200);
    await b.eval(
      `document.getElementById('title')?.remove(); game.ui.title = false; game.timeOfDay = 10; 1`,
    );
    const p = await b.eval(
      `({ x: game.player.position.x, y: game.player.position.y, z: game.player.position.z, yaw: game.cameraYaw })`,
    );
    anchor = p;
    report.anchor = p;
    await sleep(6000);
    // per-frame avatar motion inside the page for 4 s
    const motion = await b.eval(`new Promise((res) => {
      const out = {};
      let last = performance.now();
      const t0 = last;
      const step = (now) => {
        const dt = (now - last) / 1000;
        last = now;
        for (const [id, a] of game.net.avatars) {
          const r = a.char.root;
          const o = (out[id] ||= { prev: null, v: null, maxDv: 0, frames: 0, maxStep: 0 });
          if (o.prev && dt > 0) {
            const vx = (r.position.x - o.prev[0]) / dt;
            const vz = (r.position.z - o.prev[1]) / dt;
            o.maxStep = Math.max(o.maxStep, Math.hypot(r.position.x - o.prev[0], r.position.z - o.prev[1]));
            if (o.v) {
              o.maxDv = Math.max(o.maxDv, Math.hypot(vx - o.v[0], vz - o.v[1]));
            }
            o.v = [vx, vz];
            o.frames++;
          }
          o.prev = [r.position.x, r.position.z];
        }
        for (const [id, px] of game.net.proxies) {
          const r = px.car.root;
          const o = (out['car' + id] ||= { prev: null, v: null, maxDv: 0, frames: 0, maxStep: 0 });
          if (o.prev && dt > 0) {
            const vx = (r.position.x - o.prev[0]) / dt;
            const vz = (r.position.z - o.prev[1]) / dt;
            o.maxStep = Math.max(o.maxStep, Math.hypot(r.position.x - o.prev[0], r.position.z - o.prev[1]));
            if (o.v) {
              o.maxDv = Math.max(o.maxDv, Math.hypot(vx - o.v[0], vz - o.v[1]));
            }
            o.v = [vx, vz];
            o.frames++;
          }
          o.prev = [r.position.x, r.position.z];
        }
        if (now - t0 < 4000) requestAnimationFrame(step);
        else res(Object.fromEntries(Object.entries(out).map(([k, o]) => [k, { frames: o.frames, maxStepM: +o.maxStep.toFixed(3), maxSpeedChangePerFrame: +o.maxDv.toFixed(2) }])));
      };
      requestAnimationFrame(step);
    })`);
    report.motion = motion;
    for (let i = 0; i < 4; i++) {
      await b.screenshot(`${OUT}/ingame_${i}.png`);
      await sleep(700);
    }
    report.page = await b.eval(
      `({ stats: game.net.stats(), fps: game.perf?.fps, tod: game.timeOfDay, weather: game.weather })`,
    );
    // what the bots see of the browser player
    const me = srv.rooms.get('BEACH').players.find((x) => x && x.name === 'Nico');
    const r = bots[0].remotes.get(me.id);
    const v = {};
    bots[0].sample(r, bots[0].advance(0), v);
    report.botSeesBrowser = {
      server: [me.st.x, me.st.z].map((x) => +x.toFixed(2)),
      bot: [v.x, v.z].map((x) => +x.toFixed(2)),
    };
    report.errors = [...new Set(b.errors)].slice(0, 15);
  });
} finally {
  clearInterval(sendTimer);
  for (const c of bots) {
    c.close();
  }
  srv.close();
}
console.log(JSON.stringify(report, null, 1));
fs.writeFileSync(`${OUT}/ingame.json`, JSON.stringify(report, null, 1));
process.exit(0);
