#!/usr/bin/env node
// Desktop app vs headless Chrome: same build, same scene, same protocol.
//   node desktop/scripts/measure.mjs app    [--minutes 5] [--bin <path to app binary>] [--port 9411]
//   node desktop/scripts/measure.mjs chrome [--minutes 5] [--url http://127.0.0.1:5311/?mute]
// Protocol: boot to game.ready, press Enter, then half the time idle at Nico's spawn and half moving
// (W held, sprint bursts, turns, and a few teleports so the streamer loads new tiles).
// Records every frame time (rAF) for avg fps, 1% low, p99 and long frames; samples JS heap and the
// whole process tree's RSS every 10 s; takes screenshots into docs/v2/shots/desktop/.
// Results: docs/v2/reports/desktop-measure-<mode>.json
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = path.join(ROOT, 'docs/v2/shots/desktop');
const mode = process.argv[2];
const argv = process.argv.slice(3);

function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) {
    return fallback;
  }
  return argv[i + 1];
}

const MINUTES = Number(opt('minutes', '5'));
// The app runs native fullscreen; Chrome is emulated at the same CSS size and density
// (MacBook Pro 14/16 with the notch: 1512x949 CSS px at 2x).
const WIDTH = Number(opt('w', '1512'));
const HEIGHT = Number(opt('h', '949'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(SHOTS, { recursive: true });

// ---------- process tree memory ----------
function treeRssMB(rootPid) {
  let out = '';
  try {
    out = execSync('ps -axo pid=,ppid=,rss=', { encoding: 'utf8' });
  } catch (e) {
    return null;
  }
  const kids = new Map();
  const rss = new Map();
  for (const line of out.trim().split('\n')) {
    const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
    rss.set(pid, kb);
    if (!kids.has(ppid)) {
      kids.set(ppid, []);
    }
    kids.get(ppid).push(pid);
  }
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    total += rss.get(p) || 0;
    for (const c of kids.get(p) || []) {
      stack.push(c);
    }
  }
  return Math.round(total / 1024);
}

function childPid(parentPid, match) {
  try {
    const out = execSync('ps -axo pid=,ppid=,command=', { encoding: 'utf8' });
    for (const line of out.trim().split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      if (m && Number(m[2]) === parentPid && m[3].includes(match)) {
        return Number(m[1]);
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// ---------- minimal CDP client for the Electron run ----------
async function connectPage(port, urlPrefix, seconds) {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pg = list.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix));
      if (pg) {
        const ws = new WebSocket(pg.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.onopen = res;
          ws.onerror = rej;
        });
        return ws;
      }
    } catch (e) {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error('could not attach to the app');
}

function cdpApi(ws) {
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
      return;
    }
    if (d.method === 'Runtime.exceptionThrown') {
      errors.push('EXC ' + String(d.params.exceptionDetails?.exception?.description || '').slice(0, 300));
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const api = {
    errors,
    send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.result?.exceptionDetails) {
        throw new Error(String(r.result.exceptionDetails.exception?.description || 'eval failed').slice(0, 400));
      }
      return r.result?.result?.value;
    },
    async waitFor(expr, seconds) {
      for (let i = 0; i < seconds * 2; i++) {
        try {
          if (await api.eval(`!!(${expr})`)) {
            return true;
          }
        } catch (e) {
          // page loading
        }
        await sleep(500);
      }
      throw new Error('timed out: ' + expr);
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
  };
  return api;
}

// ---------- in-page probes ----------
const INSTALL_RECORDER = `(() => {
  if (window.__psRec) return true;
  const rec = { d: [], last: 0, on: true };
  window.__psRec = rec;
  const f = (t) => {
    if (rec.last) rec.d.push(t - rec.last);
    rec.last = t;
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  return true;
})()`;

const UNPAUSE = `(() => {
  const was = !!(game.ui && game.ui.paused);
  if (was) game.hud.setPaused(false, false);
  return was;
})()`;

const TAKE_FRAMES = `(() => {
  const d = window.__psRec.d;
  window.__psRec.d = [];
  return d;
})()`;

const SAMPLE = `(() => {
  const m = performance.memory || {};
  const r = window.game && game.renderer && game.renderer.info;
  const p = window.game && game.player && game.player.position;
  return {
    heapMB: Math.round((m.usedJSHeapSize || 0) / 1048576),
    heapLimitMB: Math.round((m.jsHeapSizeLimit || 0) / 1048576),
    gameFps: game.perf ? Math.round(game.perf.fps) : null,
    calls: r ? r.render.calls : null,
    tris: r ? r.render.triangles : null,
    geometries: r ? r.memory.geometries : null,
    textures: r ? r.memory.textures : null,
    pos: p ? [Math.round(p.x), Math.round(p.z)] : null,
    pixelRatio: game.renderer ? game.renderer.getPixelRatio() : null,
    pacing: game.framePacing ? { hz: game.framePacing.hz, on: game.framePacing.on, skipped: game.framePacing.skipped } : null,
    shaderWarm: game.shaderWarm ? JSON.parse(JSON.stringify(game.shaderWarm)) : null,
  };
})()`;

function frameStats(d) {
  if (!d.length) {
    return null;
  }
  const s = [...d].sort((a, b) => a - b);
  const total = s.reduce((a, b) => a + b, 0);
  const avg = total / s.length;
  const worstN = Math.max(1, Math.floor(s.length * 0.01));
  const worst = s.slice(s.length - worstN);
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  const pct = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return {
    frames: s.length,
    seconds: +(total / 1000).toFixed(1),
    avgFps: +(1000 / avg).toFixed(1),
    low1Fps: +(1000 / worstAvg).toFixed(1),
    p50Ms: +pct(0.5).toFixed(2),
    p99Ms: +pct(0.99).toFixed(2),
    maxMs: +s[s.length - 1].toFixed(1),
    over25ms: s.filter((x) => x > 25).length,
    over50ms: s.filter((x) => x > 50).length,
  };
}

async function key(b, code, down) {
  const k = code.replace(/^Key/, '').toLowerCase();
  await b.send('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    code,
    key: code === 'ShiftLeft' ? 'Shift' : k,
    windowsVirtualKeyCode: code === 'ShiftLeft' ? 16 : k.toUpperCase().charCodeAt(0),
  });
}

async function protocol(b, label, rootPidFn) {
  const res = {
    mode: label,
    when: new Date().toISOString(),
    load: os.loadavg().map((x) => +x.toFixed(1)),
    samples: [],
  };
  const t0 = Date.now();
  await b.waitFor('window.game && game.ready === true && game.v2', 300);
  res.bootSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  res.failed = await b.eval('JSON.stringify(game.v2.failed)');
  res.loaded = await b.eval('game.v2.loaded.length');
  res.env = await b.eval(`JSON.stringify({
    desktop: window.portSolanaDesktop || null,
    ua: navigator.userAgent,
    dpr: devicePixelRatio,
    drawingBuffer: [game.renderer.getContext().drawingBufferWidth, game.renderer.getContext().drawingBufferHeight],
    size: [innerWidth, innerHeight],
    gpu: (() => {
      const gl = game.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })(),
    webgpu: !!navigator.gpu,
  })`);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
  await sleep(500);
  await b.eval(`dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter' })); 1`);
  await b.eval(INSTALL_RECORDER);
  await sleep(1500);
  // Driven runs have no real pointer lock, so the HUD's lock-loss pause would hold the game on the
  // pause menu. Resume without relocking (never grab the user's real mouse).
  await b.eval(UNPAUSE);
  await sleep(3000);
  await b.eval(UNPAUSE);
  await b.screenshot(path.join(SHOTS, `${label}_spawn.png`));
  await b.eval(TAKE_FRAMES);

  const half = (MINUTES * 60 * 1000) / 2;
  const phases = { idle: [], move: [] };
  const sample = async (phase) => {
    const s = JSON.parse(JSON.stringify(await b.eval(SAMPLE)));
    s.t = Math.round((Date.now() - t0) / 1000);
    s.phase = phase;
    s.wasPaused = await b.eval(UNPAUSE);
    s.rssMB = treeRssMB(rootPidFn());
    res.samples.push(s);
    phases[phase].push(...(await b.eval(TAKE_FRAMES)));
  };

  // idle at spawn
  const idleEnd = Date.now() + half;
  while (Date.now() < idleEnd) {
    await sleep(10000);
    await sample('idle');
  }
  await b.screenshot(path.join(SHOTS, `${label}_idle_end.png`));

  // movement: walk/sprint, turn, and teleport to stream new areas
  const spots = await b.eval(`JSON.stringify((() => {
    const p = game.player.position;
    return [[p.x, p.z], [-2505, 555], [-900, 120], [1800, -600], [p.x, p.z]];
  })())`);
  const route = JSON.parse(spots);
  const moveStart = Date.now();
  const moveEnd = moveStart + half;
  let leg = 0;
  await key(b, 'KeyW', true);
  while (Date.now() < moveEnd) {
    const elapsed = Date.now() - moveStart;
    const want = Math.min(route.length - 1, Math.floor((elapsed / half) * route.length));
    if (want !== leg) {
      leg = want;
      const [x, z] = route[leg];
      await b.eval(`game.teleport(${x}, null, ${z}, ${(leg * 1.3).toFixed(2)}); 1`);
    }
    await key(b, 'ShiftLeft', true);
    await sleep(3000);
    await key(b, 'ShiftLeft', false);
    await key(b, 'KeyA', true);
    await sleep(700);
    await key(b, 'KeyA', false);
    await sleep(3300);
    await key(b, 'KeyD', true);
    await sleep(500);
    await key(b, 'KeyD', false);
    await sleep(2500);
    await sample('move');
    if (leg === 2 && !fs.existsSync(path.join(SHOTS, `${label}_moving.png`))) {
      await b.screenshot(path.join(SHOTS, `${label}_moving.png`));
    }
  }
  await key(b, 'KeyW', false);
  await b.screenshot(path.join(SHOTS, `${label}_end.png`));

  res.idle = frameStats(phases.idle);
  res.move = frameStats(phases.move);
  res.all = frameStats([...phases.idle, ...phases.move]);
  const rss = res.samples.map((s) => s.rssMB).filter((x) => x);
  const heap = res.samples.map((s) => s.heapMB);
  res.memory = {
    rssStartMB: rss[0],
    rssEndMB: rss[rss.length - 1],
    rssMaxMB: Math.max(...rss),
    heapStartMB: heap[0],
    heapEndMB: heap[heap.length - 1],
    heapMaxMB: Math.max(...heap),
    heapLimitMB: res.samples[0]?.heapLimitMB,
  };
  res.loadEnd = os.loadavg().map((x) => +x.toFixed(1));
  res.pageErrors = (b.errors || []).slice(0, 20);
  return res;
}

function save(res) {
  const out = path.join(ROOT, `docs/v2/reports/desktop-measure-${res.mode}.json`);
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  const brief = {
    mode: res.mode,
    boot: res.bootSeconds,
    failed: res.failed,
    idle: res.idle,
    move: res.move,
    memory: res.memory,
    load: [res.load, res.loadEnd],
  };
  console.log(JSON.stringify(brief, null, 1));
}

if (mode === 'app') {
  const bin = opt('bin', path.join(ROOT, 'desktop/dist/mac-arm64/Southline.app/Contents/MacOS/Southline'));
  const port = Number(opt('port', '9411'));
  if (port <= 9400 || port === 9222 || port === 9333) {
    throw new Error('use a debugging port above 9400');
  }
  const child = spawn(bin, [
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    '--ps-fullscreen',
    '--ps-test-profile',
    '--ps-query=mute',
  ], { stdio: 'ignore' });
  const watchdog = setTimeout(() => {
    child.kill('SIGKILL');
    process.exit(2);
  }, (MINUTES * 60 + 420) * 1000);
  try {
    const ws = await connectPage(port, 'app://game', 60);
    const b = cdpApi(ws);
    await b.send('Runtime.enable');
    await b.send('Page.enable');
    const res = await protocol(b, 'app', () => child.pid);
    save(res);
    await b.send('Browser.close').catch(() => {});
    ws.close();
  } finally {
    clearTimeout(watchdog);
    await sleep(1500);
    try {
      child.kill('SIGTERM');
    } catch (e) {
      // already gone
    }
  }
} else if (mode === 'chrome') {
  const { withBrowser } = await import(path.join(ROOT, 'tools/v2/browser.mjs'));
  const url = opt('url', 'http://127.0.0.1:5311/?mute');
  await withBrowser({ width: WIDTH, height: HEIGHT, maxSeconds: MINUTES * 60 + 400 }, async (b) => {
    const rootPid = () => childPid(process.pid, 'Google Chrome');
    // Same pixel density as the app on this Retina Mac.
    await b.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await b.goto(url);
    const res = await protocol(b, 'chrome', rootPid);
    save(res);
  });
} else {
  console.log('usage: measure.mjs app|chrome [--minutes 5]');
  process.exit(1);
}
