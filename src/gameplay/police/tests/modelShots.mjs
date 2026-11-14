// Screenshots of the police models: node src/gameplay/police/tests/modelShots.mjs [name ...]
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const B = 'http://127.0.0.1:5200/src/gameplay/police/preview.html';
const SHOTS = {
  heli: '?m=heli&az=40&el=12', heli_side: '?m=heli&az=90&el=6&dist=17&static', heli_night: '?m=heli&night=1&fly&az=30&el=4&dist=30',
  drone: '?m=drone&az=30&el=20', k9: '?m=k9&az=70&el=10', spikes: '?m=spikes&az=20&el=30', barriers: '?m=barriers&az=25&el=18', barriers_night: '?m=barriers&az=25&el=18&night=1',
  cameras: '?m=cameras&az=30&el=6', cameras_close: '?m=cameras&close&az=10&el=18', checkpoint: '?m=checkpoint&az=25&el=8', impound: '?m=impound&az=25&el=24', impound_night: '?m=impound&az=25&el=24&night=1', gear: '?m=gear&az=15&el=8',
};
const want = process.argv.slice(2); const names = want.length ? want : Object.keys(SHOTS);
await withBrowser({ width: 1280, height: 720, maxSeconds: 200 }, async (b) => {
  for (const n of names) {
    await b.goto(B + SHOTS[n]); await b.waitFor('window.ready === true', 40); await b.sleep(500);
    const st = await b.eval('JSON.stringify(window.stats)');
    await b.screenshot(`docs/v2/shots/police/model_${n}.png`); console.log(n, st);
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10));
});
