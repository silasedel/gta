#!/usr/bin/env node
// Airports agent: boot the game once (headless, muted), start play, optionally teleport and run checks / screenshots.
//   node tools/v2/airport/boot.mjs [--q "&foo=1"] [--at x,z] [--shot path.jpg] [--eval "expr"] [--wait 8]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 900) }, async (b) => {
  const t0 = Date.now();
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  try { await b.waitFor(GAME_READY, 480); } catch (e) { console.log('NOT READY', String(e).slice(0, 200)); }
  console.log('ready after', Math.round((Date.now() - t0) / 1000), 's');
  await startGame(b);
  if (o.at) { const [x, z] = String(o.at).split(',').map(Number); await b.eval(`game.teleport(${x}, undefined, ${z}, 0)`); }
  await b.sleep(+(o.wait || 8) * 1000);
  if (o.eval) console.log('EVAL', await b.eval(`(async () => { try { return JSON.stringify(await (${o.eval})); } catch (e) { return 'ERR ' + e; } })()`));
  if (o.shot) { await b.screenshot(o.shot); console.log('shot', o.shot); }
  console.log('CONSOLE ERRORS', b.errors.length, JSON.stringify([...new Set(b.errors)].slice(0, 15)).slice(0, 3000));
});
