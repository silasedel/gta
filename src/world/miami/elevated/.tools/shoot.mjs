// screenshots of the dev viewer (isolated headless Chrome, muted). usage: node shoot.mjs views.json outDir [port]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(
  '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/hl/node_modules/',
);
const puppeteer = require('puppeteer-core');
const [
  viewsFile,
  outDir,
  port = '5199',
  pagePath = '/src/world/miami/elevated/.tools/viewer.html',
] = process.argv.slice(2);
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const SP =
  '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  userDataDir: fs.mkdtempSync(SP + 'chrome-'),
  args: [
    '--mute-audio',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--window-size=1600,900',
    '--no-first-run',
    '--no-default-browser-check',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[page]', m.text());
});
for (const grp of views) {
  await page.goto(
    `http://127.0.0.1:${port}${pagePath}?cx=${grp.cx}&cz=${grp.cz}&r=${grp.r || 420}`,
    { waitUntil: 'load', timeout: 120000 },
  );
  await page.waitForFunction('window.__ready || window.__err', { timeout: 180000 });
  const err = await page.evaluate('window.__err');
  if (err) {
    console.log('ERR', err);
    continue;
  }
  console.log(grp.name, await page.evaluate('window.__log.join(" | ")'));
  for (const v of grp.views) {
    await page.evaluate((v) => window.__view(...v.cam, v.fov), v);
    await page.screenshot({ path: path.join(outDir, `${grp.name}_${v.name}.png`) });
  }
}
await browser.close();
