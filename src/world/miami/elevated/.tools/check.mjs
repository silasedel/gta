import fs from 'node:fs';
import { createRequire } from 'node:module';
const SP =
  '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const require = createRequire(SP + 'hl/node_modules/');
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  userDataDir: fs.mkdtempSync(SP + 'chrome-chk-'),
  args: [
    '--mute-audio',
    '--window-size=960,540',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 600)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    errs.push(m.type() + ': ' + m.text().slice(0, 300));
});
await page.goto(process.argv[2] || 'http://127.0.0.1:5197/?map=miami', {
  waitUntil: 'load',
  timeout: 180000,
});
await page.waitForFunction('window.game && game.city && window.__elevated', {
  timeout: 300000,
  polling: 1000,
});
await new Promise((r) => setTimeout(r, 15000));
console.log(
  await page.evaluate(() => JSON.stringify({ dead: game.physicsDead || null, map: game.mapName })),
);
console.log([...new Set(errs)].slice(0, 15).join('\n'));
await browser.close();
