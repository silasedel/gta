#!/usr/bin/env node
// Headless multiplayer test (MULTIPLAYER track).
//   node tools/v2/mp-test.mjs [--seconds 20] [--json out.json]
// Starts the real server (server/server.js) on a free port above 5300, connects 3 headless clients that run the
// same client core as the browser (src/net/clientCore.js), and runs two passes: a clean link, and a simulated
// link with 100 ms latency, 30 ms jitter and 2 % loss (TCP-style retransmit, as WebSockets behave).
// The clients walk, one drives a car, one shoots, one tries a speed hack. Checks: remote positions converge
// within 0.5 m, rendered motion error and per-frame snapping, bandwidth per client, server tick cost.
import net from 'node:net';
import fs from 'node:fs';
import { startServer } from '../../server/server.js';
import { NetClient } from '../../src/net/clientCore.js';
import { SEAT_NONE, F_IN_VEHICLE, F_GROUNDED, weaponIndex } from '../../src/net/protocol.js';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SECONDS = Number(opt('seconds', 20));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort(from = 5301) {
  for (let p = from; p < from + 200; p++) {
    if (p === 5310 && process.env.MP_AVOID_DEFAULT) {
      continue;
    }
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

// ground-truth motion of each bot, as a function of seconds since the pass started
function truth(i, t, out) {
  if (i === 0) {
    // walk a 10 m circle at 5 m/s, then drive straight east at 25 m/s, then park
    if (t < 8) {
      const a = t * 0.5;
      out.x = Math.cos(a) * 10;
      out.z = Math.sin(a) * 10;
      out.car = false;
    } else {
      const d = Math.min(t, 16) - 8;
      out.x = Math.cos(4) * 10 + d * 25;
      out.z = Math.sin(4) * 10 + Math.sin(d * 0.6) * 4;
      out.car = t < 16;
    }
  } else if (i === 1) {
    // a figure eight at about 6 m/s
    const tt = Math.min(t, 16);
    out.x = 15 + Math.sin(tt * 0.4) * 12;
    out.z = Math.sin(tt * 0.8) * 6;
    out.car = false;
  } else {
    // walks back and forth; at 10 s it tries a 200 m speed hack, at 12 s it declares a real teleport
    const tt = Math.min(t, 16);
    out.x = -10 + Math.sin(tt * 0.5) * 8;
    out.z = 5;
    if (t >= 12) {
      out.x += 300;
    }
    out.car = false;
  }
  out.y = 0;
  return out;
}

async function runPass(label, link) {
  const port = await freePort();
  const srv = startServer({ port, host: '127.0.0.1', log: () => {} });
  await sleep(150);
  const url = `ws://127.0.0.1:${port}`;
  const bots = [];
  for (let i = 0; i < 3; i++) {
    const c = new NetClient({ url, link });
    const w = await c.connect({ name: 'Bot ' + (i + 1), room: 'TEST1', outfit: [], body: {} });
    bots.push({ c, i, welcome: w, hits: 0, kills: 0, corrections: [], hitsTaken: 0 });
  }
  for (const b of bots) {
    b.c.on('correct', (m) => b.corrections.push(m));
    b.c.on('hit', () => b.hitsTaken++);
    b.c.on('hitok', () => b.hits++);
    b.c.sendJSON({ t: 'cfg', interp: 100 });
  }
  const room = srv.rooms.get('TEST1');
  const t0 = performance.now();
  const T = (now) => (now - t0) / 1000;
  const vehId = ((bots[0].c.id + 1) << 10) | 1;
  let vehSent = false;
  let tpSent = false;
  const a = {};
  const b2 = {};
  // send loop: 30 Hz
  const sendTimer = setInterval(() => {
    const now = performance.now();
    const t = T(now);
    if (t > SECONDS) {
      return;
    }
    for (const b of bots) {
      truth(b.i, t, a);
      truth(b.i, t + 0.01, b2);
      if (b.i === 0 && a.car && !vehSent) {
        vehSent = true;
        b.c.sendJSON({ t: 'veh', id: vehId, key: 'sedan', kind: 'car', color: 0x2a6f9e, p: [a.x, 0, a.z], r: [0, 0, 0] });
      }
      if (b.i === 2 && t >= 11.9 && !tpSent) {
        tpSent = true;
        b.c.sendJSON({ t: 'tp', reason: 'test' });
      }
      const hx = b2.x - a.x;
      const hz = b2.z - a.z;
      b.c.sendState({
        flags: (a.car ? F_IN_VEHICLE : 0) | F_GROUNDED,
        x: a.x + (b.i === 2 && t >= 10 && t < 11.5 ? 200 : 0),
        y: a.y,
        z: a.z,
        vx: hx * 100,
        vy: 0,
        vz: hz * 100,
        heading: Math.atan2(hx, hz),
        animSpeed: Math.hypot(hx, hz) * 100,
        health: 100,
        armor: 0,
        wanted: 0,
        weapon: weaponIndex('pistol'),
        veh: a.car ? vehId : 0,
        seat: a.car ? 0 : SEAT_NONE,
        pitch: 0,
        roll: 0,
        steer: 0,
        vflags: 0,
      });
    }
  }, 1000 / 30);
  // bot 2 (index 1) shoots at bot 1 (index 0) twice a second during the walking phase, aiming at what it sees
  const shootTimer = setInterval(() => {
    const t = T(performance.now());
    if (t < 2 || t > 7.5) {
      return;
    }
    const sh = bots[1];
    const r = sh.c.remotes.get(bots[0].c.id);
    const view = {};
    if (!r || !sh.c.sample(r, sh.c.renderT, view)) {
      return;
    }
    truth(1, t, a);
    const o = [a.x, 1.4, a.z];
    const d = [view.x - o[0], view.y + 1.2 - o[1], view.z - o[2]];
    sh.c.sendJSON({ t: 'shot', o, d, w: 'pistol', ct: performance.now() >>> 0, ip: Math.round(sh.c.interpDelay), vt: Math.round(sh.c.renderT) });
  }, 500);
  // render loop: 60 Hz; every bot renders the other two and we compare with ground truth
  const errs = [];
  const snaps = [];
  const prev = new Map();
  let lastFrame = performance.now();
  const view = {};
  const tr = {};
  const tr2 = {};
  let vehSeen = 0;
  const renderTimer = setInterval(() => {
    const now = performance.now();
    const dt = now - lastFrame;
    lastFrame = now;
    for (const ob of bots) {
      const rt = ob.c.advance(dt);
      for (const [id, r] of ob.c.remotes) {
        const tb = bots.find((x) => x.c.id === id);
        if (!tb || tb.i === 2 || !ob.c.render(r, rt, view)) {
          continue;
        }
        if (r.seat === 0 && r.veh === vehId) {
          vehSeen++;
        }
        const sp = room.players[id];
        if (!sp || sp.offset === null) {
          continue;
        }
        // the moment of the truth this rendered pose stands for, on the sender's clock
        const tl = T(rt - sp.offset);
        if (tl < 1 || tl > SECONDS - 0.5) {
          continue;
        }
        truth(tb.i, tl, tr);
        const e = Math.hypot(view.x - tr.x, view.z - tr.z);
        errs.push(e);
        const key = ob.i + ':' + id;
        const p = prev.get(key);
        if (p) {
          // snap: how far this frame's step strays from the true step over the same render interval
          truth(tb.i, T(p.rt - sp.offset), tr2);
          const dx = (view.x - p.x) - (tr.x - tr2.x);
          const dz = (view.z - p.z) - (tr.z - tr2.z);
          snaps.push(Math.hypot(dx, dz));
        }
        prev.set(key, { x: view.x, z: view.z, rt });
      }
    }
  }, 1000 / 60);
  await sleep(SECONDS * 1000 + 1500);
  clearInterval(sendTimer);
  clearInterval(shootTimer);
  clearInterval(renderTimer);
  // convergence: everyone stopped at t = 16; after a second each bot's view must match the final truth
  const conv = [];
  for (const ob of bots) {
    for (const [id, r] of ob.c.remotes) {
      const tb = bots.find((x) => x.c.id === id);
      ob.c.sample(r, ob.c.advance(0), view);
      truth(tb.i, SECONDS, tr);
      conv.push({ observer: ob.i, target: tb.i, err: Math.hypot(view.x - tr.x, view.z - tr.z) });
    }
  }
  const secs = (performance.now() - t0) / 1000;
  const bw = bots.map((b) => ({ bot: b.i, downBps: Math.round(b.c.bytesIn / secs), upBps: Math.round(b.c.bytesOut / secs) }));
  const statsRes = await fetch(`http://127.0.0.1:${port}/stats`).then((r) => r.json());
  const res = {
    label,
    link,
    port,
    seconds: +secs.toFixed(1),
    convergence: conv.map((c) => ({ ...c, err: +c.err.toFixed(3) })),
    convergedMax: +Math.max(...conv.map((c) => c.err)).toFixed(3),
    renderErr: pct(errs),
    frameSnap: pct(snaps),
    framesMeasured: errs.length,
    vehicleFramesSeen: vehSeen,
    bandwidth: bw,
    shots: room.stats.shots,
    hits: room.stats.hits,
    hitsConfirmed: bots[1].hits,
    hitsTaken: bots[0].hitsTaken,
    speedHackCorrections: bots[2].corrections.length,
    speedHackStrikes: room.players[bots[2].c.id]?.strikes,
    declaredTeleportsAccepted: room.stats.teleports,
    finalBot3X: +(room.players[bots[2].c.id]?.st?.x ?? NaN).toFixed(1),
    tick: statsRes.tick,
    interpDelayMs: bots.map((b) => +b.c.interpDelay.toFixed(1)),
  };
  for (const b of bots) {
    b.c.close();
  }
  srv.close();
  await sleep(200);
  return res;
}

function pct(a) {
  if (!a.length) {
    return null;
  }
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3);
  return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(3) };
}

const results = [];
results.push(await runPass('clean link', {}));
results.push(await runPass('100 ms lag, 30 ms jitter, 2 % loss', { lag: 100, jitter: 30, loss: 0.02 }));
let ok = true;
for (const r of results) {
  const pass = r.convergedMax < 0.5 && r.hits > 0 && r.speedHackCorrections > 0 && r.declaredTeleportsAccepted > 0 && r.finalBot3X > 200 && r.vehicleFramesSeen > 0;
  r.pass = pass;
  ok &&= pass;
  console.log(JSON.stringify(r, null, 1));
}
const out = opt('json', null);
if (out) {
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
}
console.log(ok ? 'MP TEST PASS' : 'MP TEST FAIL');
process.exit(ok ? 0 : 1);
