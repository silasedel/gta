// ELEVATED in-game drive test runner: production preview, own isolated muted headless Chrome (puppeteer.launch, pipe, temp profile).
// usage: node drive.mjs [url] [filter: all|names regex|cid list] [speeds e.g. 60,120,180] [maxRoutes]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const SP =
  '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const require = createRequire(SP + 'hl/node_modules/');
const puppeteer = require('puppeteer-core');
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [
  URL0 = 'http://127.0.0.1:5197/?map=miami',
  FILTER = 'all',
  SPEEDS = '60,120,180',
  MAXR = '999',
] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  protocolTimeout: 0,
  userDataDir: fs.mkdtempSync(SP + 'chrome-drive-'),
  args: [
    '--mute-audio',
    '--window-size=960,540',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
  ],
});
const out = [];
const logF = SP + 'drive_' + Date.now() + '.json';
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  let nErr = 0;
  page.on('pageerror', (e) => {
    if (nErr++ < 3) console.log('[pageerror]', String(e.stack || e).slice(0, 900));
  });
  await page.goto(URL0, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(
    'window.game && game.vehicles && game.vehicles.spawn && game.city && window.__elevated && game.enterVehicle',
    { timeout: 300000, polling: 1000 },
  );
  await page.evaluate(fs.readFileSync(path.join(here, 'drive_page.js'), 'utf8'));
  if (process.env.RANGE)
    await page.evaluate((r) => {
      window.__edriveRange = {};
      for (const t of r.split(',')) {
        const [c, a, b] = t.split(':').map(Number);
        window.__edriveRange[c] = [a, b];
      }
    }, process.env.RANGE);
  await page.evaluate(() => {
    document.querySelector('#start, #play, .start, button')?.click?.();
  });
  let routes = await page.evaluate('__edrive.routes()');
  if (FILTER !== 'all') {
    const ids = FILTER.split(',').map(Number);
    routes = /^[\d,]+$/.test(FILTER)
      ? routes.filter((r) => ids.includes(r.cid))
      : routes.filter((r) => new RegExp(FILTER, 'i').test(r.name));
  }
  routes = routes.slice(0, +MAXR);
  console.log(
    'routes',
    routes.length,
    routes.map((r) => r.cid + ':' + r.name + ':' + r.len).join(' '),
  );
  for (const r of routes)
    for (const d of r.dirs)
      for (const kmh of SPEEDS.split(',').map(Number)) {
        const t0 = Date.now();
        let res;
        const beacon = setInterval(async () => {
          try {
            const b = await page.evaluate('JSON.stringify(window.__dprog)');
            if (process.env.BEACON) console.log('  ..', b);
          } catch (e) {}
        }, 20000);
        try {
          res = await page.evaluate((c, dd, k) => __edrive.drive(c, dd, k), r.cid, d, kmh);
        } catch (e) {
          res = { cid: r.cid, error: String(e).slice(0, 300) };
        }
        clearInterval(beacon);
        res.secs = Math.round((Date.now() - t0) / 1000);
        out.push(res);
        fs.writeFileSync(logF, JSON.stringify(out));
        console.log(
          JSON.stringify({
            cid: r.cid,
            name: r.name,
            len: r.len,
            dir: d,
            kmh,
            done: res.done,
            prog: res.progress + '/' + res.total,
            vmax: Math.round(res.maxSpeed || 0),
            dev: +(res.maxDev || 0).toFixed(2),
            drops: res.drops?.length,
            bumps: res.bumps?.length,
            hits: res.nHits,
            stalls: res.stalls,
            err: res.error,
            dead: res.physicsDead,
            diag: res.decelDiag,
            firstDrop: res.drops?.[0],
            firstBump: res.bumps?.[0],
            firstHit: res.hits?.[0],
            secs: res.secs,
          }),
        );
      }
} catch (e) {
  console.error('FAILED', e);
} finally {
  await browser.close();
  console.log('log', logF);
}
