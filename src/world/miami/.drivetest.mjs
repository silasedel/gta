// End-to-end drive test: own isolated, muted headless Chrome (temp profile) on the production preview; real car + physics.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const URL0 = process.argv[2] || 'http://127.0.0.1:5291/';
const PLAN = process.argv[3] || 'quick';
let PORT = 0; // Chrome picks a free port in OUR fresh profile (DevToolsActivePort); never a fixed port
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'city2-drive-'));
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--mute-audio',
    `--user-data-dir=${prof}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=800,450',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=document-user-activation-required',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws,
  id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 80 && !PORT; i++) {
    try {
      PORT = Number(fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    } catch (e) {
      await sleep(250);
    }
  }
  for (let i = 0; i < 50; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const pg = l.find((t) => t.type === 'page');
      if (pg) {
        ws = new WebSocket(pg.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        break;
      }
    } catch (e) {
      /* */
    }
    await sleep(200);
  }
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalP = async (expr, timeout = 600000) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (r.result?.exceptionDetails)
    throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
};
const out = [];
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL0 });
  // wait for the game (city + vehicles) to be up
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    let ok = false;
    try {
      ok = await evalP(
        '!!(window.game && game.vehicles && game.vehicles.spawn && game.city && game.city.deckSurfaceAt && game.enterVehicle)',
        5000,
      );
    } catch (e) {
      /* */
    }
    if (ok) break;
    if (i === 239) throw new Error('game did not load');
  }
  await evalP(fs.readFileSync(path.join(here, '.drive_harness.js'), 'utf8'));
  // click to unblock any start screen
  await evalP(`(document.querySelector('#start, #play, .start, button')?.click?.(), true)`).catch(
    () => {},
  );

  const routes = await evalP(
    '__drive.chains(150, 2.5).map((r, i) => ({ i, name: r.name, len: r.len, ymax: r.ymax }))',
  );
  console.log('routes', routes.length, JSON.stringify(routes.slice(0, 50)));
  const speeds = PLAN === 'full' ? [60, 120, 180] : [180];
  const pick = routes.slice(0, Number(process.argv[4] || 6));
  await evalP('window.__routes = __drive.chains(150, 2.5), true');
  for (const r of pick)
    for (const kmh of speeds)
      for (const rev of [false, true]) {
        const t0 = Date.now();
        let res;
        try {
          res = await evalP(`__drive.drive(__routes[${r.i}], ${kmh}, ${rev})`);
        } catch (e) {
          res = { route: r.name, kmh, reverse: rev, error: String(e).slice(0, 300) };
        }
        res.secs = Math.round((Date.now() - t0) / 1000);
        out.push(res);
        console.log(
          JSON.stringify({
            i: r.i,
            name: res.route,
            len: res.len,
            kmh,
            rev,
            done: res.done,
            prog: `${res.progress}/${res.total}`,
            maxDrop: res.maxDrop && +res.maxDrop.toFixed(2),
            drops: res.drops?.length,
            air: res.airborne?.length,
            err: res.error,
            firstDrop: res.drops?.[0],
            firstAir: res.airborne?.[0],
            stalled: res.stalled,
          }),
        );
      }
} catch (e) {
  console.error('FAILED', e);
} finally {
  fs.writeFileSync(path.join(here, `drivelog_${PLAN}.json`), JSON.stringify(out, null, 1));
  try {
    ws?.close();
  } catch (e) {
    /* */
  }
  chrome.kill('SIGKILL');
  await sleep(300);
  fs.rmSync(prof, { recursive: true, force: true });
}
