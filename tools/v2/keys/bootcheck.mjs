// quick boot check (track: keys): does the game reach READY with Nico's house, the yard, the dock and the hand lots? errors?
import { withBrowser, GAME_READY } from '../browser.mjs';
await withBrowser(
  { width: 960, height: 540, maxSeconds: +(process.argv[2] || 1500) },
  async (b) => {
    const t0 = Date.now();
    await b.goto('http://127.0.0.1:5200/?mute');
    for (let i = 0; i < 1400; i += 5) {
      const r = await b
        .eval(
          `JSON.stringify({ ready: !!(window.game && game.ready), nh: !!window.game?.nicoHouse, load: document.getElementById('loading')?.innerText?.slice(0, 60) || null })`,
        )
        .catch(() => null);
      if (i % 60 === 0) console.log(Math.round((Date.now() - t0) / 1000) + 's', r);
      if (r && JSON.parse(r).ready && JSON.parse(r).nh) break;
      await b.sleep(5000);
    }
    await b.sleep(8000);
    console.log(
      await b.eval(
        `JSON.stringify({ stats: game.nicoHouse?.house?.stats && { yard: game.nicoHouse.house.stats.keysYard, dock: game.nicoHouse.house.stats.keysDock, failed: game.nicoHouse.house.stats.failed }, dock: game.nicoHouse?.house?.plan?.dock, keysLots: game.keysLots && { lots: game.keysLots.lots, docks: game.keysLots.docks, extras: game.keysLots.extras, cars: (game.keysLots.cars || []).length }, dressing: game.dressing?.stats?.()?.spawn })`,
      ),
    );
    console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
  },
);
