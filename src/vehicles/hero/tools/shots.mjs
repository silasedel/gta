// Batch screenshots of the hero studio in ONE browser session.
// node src/vehicles/hero/tools/shots.mjs <carKey> <tag> view1,view2,... [env] [extra js run after show]
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const [key, tag, views = 'front34,side,rear34,top', env = 'studio', extra = ''] = process.argv.slice(2);
const out = 'docs/v2/shots/hero-cars';
await withBrowser({ width: 1600, height: 900, maxSeconds: 230 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/src/vehicles/hero/preview.html?car=${key}&noui&env=${env}&dpr=1`);
  await b.waitFor('window.ready', 90);
  if (extra) console.log('EXTRA', JSON.stringify(await b.eval(extra)));
  for (const v of views.split(',')) {
    if (v.startsWith('cam:')) { const n = v.slice(4).split('/').map(Number); await b.eval(`hero.cam([${n.slice(0, 3)}],[${n.slice(3, 6)}],${n[6] || 30})`); }
    else await b.eval(`hero.view('${v.split('@')[0]}')`);
    await b.sleep(700);
    const name = v.startsWith('cam:') ? 'cam' + views.split(',').indexOf(v) : v.replace('@', '_');
    console.log('SHOT', await b.screenshot(`${out}/${tag}_${name}.jpg`, { quality: 88 }));
  }
  console.log('STATS', JSON.stringify(await b.eval('JSON.stringify({s:hero.stats(),b:hero.bbox()})')));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 12).join('\n'));
});
