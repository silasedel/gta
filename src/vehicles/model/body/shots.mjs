// Batch screenshots of the v3 body preview in ONE browser session.
// node src/vehicles/model/body/shots.mjs '<query>' out/prefix view1,view2 [idx] [w] [h]
//   views: front34, rear34, side, front, rear, top, low34, cab, 'none' (layout camera)
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const [query, prefix, views = 'none', idx = '0', W = '1400', H = '800'] = process.argv.slice(2);
await withBrowser({ width: +W, height: +H, maxSeconds: 230 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/src/vehicles/model/body/preview.html?${query}`);
  await b.waitFor('window.ready === true', 120);
  await b.sleep(600);
  const n = idx === 'all' ? await b.eval('cars.length') : 1;
  for (let i = 0; i < n; i++)
    for (const v of views.split(',')) {
      const k = idx === 'all' ? i : +idx;
      if (v !== 'none') await b.eval(`view('${v}', ${k})`);
      await b.sleep(400);
      console.log(
        'SHOT',
        await b.screenshot(idx === 'all' ? `${prefix}_${i}_${v}.jpg` : `${prefix}_${v}.jpg`, {
          quality: 82,
        }),
      );
    }
  console.log('STATS', JSON.stringify(await b.eval('JSON.stringify(stats())')));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 12).join('\n'));
});
