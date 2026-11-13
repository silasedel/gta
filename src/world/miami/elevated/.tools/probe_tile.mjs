// ELEVATED-2: build one tile's elevated colliders inside the production page and report failures. usage: node probe_tile.mjs url tx tz
import fs from 'node:fs'; import { createRequire } from 'node:module';
const SP = '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const require = createRequire(SP + 'hl/node_modules/'); const puppeteer = require('puppeteer-core');
const [URL0, TX, TZ] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', pipe: true, protocolTimeout: 0, userDataDir: fs.mkdtempSync(SP + 'chrome-probe-'), args: ['--mute-audio', '--no-first-run', '--use-angle=metal'] });
try {
  const page = await browser.newPage(); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(URL0, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.game && game.city && window.__elevated', { timeout: 300000, polling: 1000 });
  const out = await page.evaluate((tx, tz) => {
    const g = window.game, R = g.RAPIER, el = window.__elevated, T = 200, b0 = { minX: tx * T, minZ: tz * T, maxX: tx * T + T, maxZ: tz * T + T };
    let r; try { r = el.buildTile(tx, tz, b0, { visual: false }); } catch (e) { return { buildErr: String(e.stack || e).slice(0, 600) }; }
    const w = new R.World({ x: 0, y: -9.81, z: 0 }), res = { n: r.colliderDescs.length, kinds: {}, fails: [] };
    for (const c of r.colliderDescs) { res.kinds[c.kind] = (res.kinds[c.kind] || 0) + 1; try { w.createCollider(c.desc); } catch (e) { res.fails.push([c.kind, String(e).slice(0, 200)]); } }
    return res;
  }, +TX, +TZ);
  console.log(JSON.stringify(out));
} catch (e) { console.error('FAILED', e); } finally { await browser.close(); }
