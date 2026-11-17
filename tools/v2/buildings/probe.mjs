#!/usr/bin/env node
// Run JS expressions in a started game and print the results (building audits / stats).
//   node tools/v2/buildings/probe.mjs --js file.js [--at x,z] [--q "&libmodels=0"] [--out report.json]
// file.js: an expression (may be async, e.g. (async () => {...})()) whose JSON-serializable value is printed.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const js = fs.readFileSync(o.js, 'utf8');
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  if (o.at) { const [x, z] = o.at.split(',').map(Number); await b.eval(`game.teleport(${x}, undefined, ${z}, 0)`); await b.sleep(8000); }
  const r = await b.eval(`Promise.resolve(${js}).then((v) => JSON.stringify(v))`);
  if (o.out) fs.writeFileSync(o.out, r); console.log(r.length > 20000 ? r.slice(0, 20000) + '...' : r);
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n'));
});
