#!/usr/bin/env node
// r2-art quick probe: load the game (muted) and print page-side expressions + console errors.
//   node tools/v2/art/probe.mjs [--q "&foo"] [--no-start] "expr1" "expr2" ...
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {}, ex = [];
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; } else ex.push(a[i]);
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY, 480);
  if (!o['no-start']) await startGame(b);
  await b.sleep(+(o.wait || 3000));
  for (const e of ex) { try { console.log('>', e.slice(0, 80), '\n', JSON.stringify(await b.eval(e)).slice(0, 4000)); } catch (err) { console.log('> FAIL', e.slice(0, 80), String(err).slice(0, 400)); } }
  console.log('ERRORS', JSON.stringify([...new Set(b.errors)].slice(0, 20), null, 1));
});
