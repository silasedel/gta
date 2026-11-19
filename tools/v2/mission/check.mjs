// One short browser check of the mission prop library: node tools/v2/mission/check.mjs
import { withBrowser } from '../browser.mjs';

await withBrowser({ width: 1280, height: 480, maxSeconds: 180 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/tools/v2/mission/preview.html');
  await b.waitFor('window.ready === true', 90);
  console.log('STATS', await b.eval('JSON.stringify(window.stats || window.error)'));
  await b.screenshot('docs/v2/shots/mission_props/_browser_check.png');
  if (b.errors.length) {
    console.log('CONSOLE ERRORS', b.errors);
  }
});
