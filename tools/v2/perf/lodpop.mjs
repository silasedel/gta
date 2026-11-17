#!/usr/bin/env node
// r2-perf LOD pop test driver: for each model, LOD0 vs every generated level at 0.5x / 1x / 2x of the level's switch
// distance (tools/v2/perf/lodpop.html). Writes docs/v2/reports/r2-lodpop-<set>.json and, per level, a crop pair
// (LOD0 | level) at the switch distance: docs/v2/shots/perf/lodpop/<model>_L<n>.jpg (A left, B right).
//   node tools/v2/perf/lodpop.mjs --models assets/models/docks/boathouse.glb,assets/vehicles/cars/suv12.glb [--errPx 1]
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'pop';
const models = String(o.models || '').split(',').filter(Boolean);
const rep = { set: SET, when: new Date().toISOString(), errPx: +(o.errPx || 1), models: [] };
fs.mkdirSync('docs/v2/shots/perf/lodpop', { recursive: true });
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/tools/v2/perf/lodpop.html');
  await b.waitFor('window.popReady === true', 120);
  for (const m of models) {
    const url = '/' + m.replace(/^\/+/, '').replace(/^public\//, '');
    const r = await b.eval(`window.runPop(${JSON.stringify(url)}, { errPx: ${rep.errPx} }).then(JSON.stringify)`, 240000);
    const res = JSON.parse(r);
    const name = url.split('/').pop().replace(/\.glb$/, '');
    for (const s of res.strips || []) {
      // stitch A | B as one JPG via a tiny page-side canvas
      const jpg = await b.eval(`(async () => { const L = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
        const A = await L(${JSON.stringify(s.a)}), B = await L(${JSON.stringify(s.b)}); const c = document.createElement('canvas'); c.width = 520; c.height = 256;
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 520, 256); g.drawImage(A, 0, 0); g.drawImage(B, 264, 0); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; })()`);
      fs.writeFileSync(`docs/v2/shots/perf/lodpop/${name}_L${s.level}.jpg`, Buffer.from(jpg, 'base64'));
    }
    delete res.strips;
    rep.models.push(res);
    console.log(name, JSON.stringify(res));
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 10); console.log('ERRORS', rep.errors.join('\n').slice(0, 1500)); }
});
fs.writeFileSync(`docs/v2/reports/r2-lodpop-${SET}.json`, JSON.stringify(rep, null, 1));
