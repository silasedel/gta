// Boot probe for the library fleet: node tools/v2/cars/boot.mjs [--q '&libcars=0']  -> time to READY, vehicle stage, errors
import { withBrowser, GAME_READY } from '../browser.mjs';
const a = process.argv.slice(2); const q = a[a.indexOf('--q') + 1] && a.includes('--q') ? a[a.indexOf('--q') + 1] : '';
await withBrowser({ width: 1280, height: 720, maxSeconds: 1000 }, async (b) => {
  const t0 = Date.now();
  await b.goto('http://127.0.0.1:5200/?mute' + q);
  let ok = false;
  for (let i = 0; i < 900; i++) {
    if (await b.eval(`!!(${GAME_READY})`).catch(() => false)) { ok = true; break; }
    if (i % 20 === 0) console.log(Math.round((Date.now() - t0) / 1000) + 's', await b.eval(`JSON.stringify({ stage: window.__boot?.stages?.slice?.(-2), cars: window.game?.vehicles?.list?.length ?? null, err: null })`).catch((e) => 'eval fail ' + e.message));
    await b.sleep(1000);
  }
  console.log('READY', ok, Math.round((Date.now() - t0) / 1000) + 's');
  if (ok) console.log(await b.eval(`JSON.stringify({ fleet: game.vehicles.fleet ? { keys: game.vehicles.fleet.keys.length, ...game.vehicles.fleet.stats } : null, cars: game.vehicles.list.map((v) => v.typeKey + (v.car.glb ? '' : '*')).join(','), stages: (window.__boot?.stages || []).filter((s) => /vehic/i.test(JSON.stringify(s))) })`));
  console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 15).join('\n'));
});
