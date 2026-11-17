// r2-mapui: minimap + area label + pause map at the normal spawn (Nico's yard, Key Largo) on a fresh load.
// FAILS=n makes the first n fetches of the map manifest (assets/miami/world.json) fail, to reproduce a map-data load
// failure (e.g. a republish in progress). Usage: node tools/v2/mapui/spawn-map-check.mjs <tag> [fails] [port]
import { withBrowser, startGame } from '../browser.mjs';
import fs from 'node:fs';

const TAG = process.argv[2] || 'now', FAILS = +(process.argv[3] || 0), PORT = process.argv[4] || '5200';
const OUT = 'docs/v2/shots/r2-mapui';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1600, height: 900, maxSeconds: 1500 }, async (b) => {
  if (FAILS) await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { let n = ${FAILS}; const f = window.fetch; window.fetch = function (u, o) { if (n > 0 && /assets\\/miami\\/world\\.json/.test(String(u && u.url || u))) { n--; return Promise.resolve(new Response('', { status: 404 })); } return f.apply(this, arguments); }; })();` });
  await b.goto(`http://127.0.0.1:${PORT}/?mute`);
  if (!(await startGame(b, 300))) throw new Error('game did not start');
  await b.sleep(8000);
  const info = await b.eval(`JSON.stringify({ land: game.city?.mapLayers?.land?.length || 0, pos: [game.player.position.x | 0, game.player.position.z | 0],
    district: (() => { try { return game.city.districtAt(game.player.position.x, game.player.position.z); } catch (e) { return 'ERR'; } })(),
    label: document.querySelector('.ps-mm-zone')?.textContent || null })`);
  console.log(TAG, info);
  await b.screenshot(`${OUT}/spawn_${TAG}_mini.jpg`, { clip: { x: 0, y: 600, width: 560, height: 300 } });
  await b.eval(`(() => { game.hud.setPaused(true); return 1; })()`); await b.sleep(5000);
  await b.screenshot(`${OUT}/spawn_${TAG}_pause.jpg`);
  console.log('warnings', b.logs.filter((l) => /\\[miami\\]/.test(l)).slice(0, 5));
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).map((e) => e.slice(0, 200)).slice(0, 6));
});
