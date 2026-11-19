#!/usr/bin/env node
// Multi-shot runner for the yacht preview page (one browser session, many cameras).
//   node src/vehicles/yachts/tests/pv.mjs --yacht <id> --out docs/v2/shots/yachts --shots "name:px,py,pz,tx,ty,tz[,fov];name2:..." [--q "night=1&lod=1"] [--eval "<js>"] [--w 1280 --h 720]
//   --views a,b,c   use named views from the yacht definition (def.views)
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const url = `http://127.0.0.1:5200/src/vehicles/yachts/preview.html?yacht=${o.yacht || '_kitcheck'}&noui=1${o.q ? '&' + o.q : ''}`;
let bad = false;
await withBrowser(
  { width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 230) },
  async (b) => {
    await b.goto(url);
    await b.waitFor('window.PV && PV.ready', 90);
    if (o.eval) console.log('EVAL', await b.eval(o.eval));
    console.log('INFO', await b.eval('JSON.stringify(PV.info())'));
    const shots = [];
    if (o.views)
      for (const v of String(o.views).split(','))
        shots.push([
          v.replace(/[^a-z0-9_-]/gi, '_'),
          `PV.cam(...PV.built[0].def.views[${JSON.stringify(v)}])`,
        ]);
    for (const s of String(o.shots || '')
      .split(';')
      .filter(Boolean)) {
      const [name, c] = s.split(':');
      shots.push([name, `PV.cam(${c})`]);
    }
    for (const [name, js] of shots) {
      await b.eval(js + ';1');
      await b.sleep(+(o.settle || 450));
      console.log(
        'SHOT',
        await b.screenshot(
          `${o.out || 'docs/v2/shots/yachts'}/${o.prefix ?? (o.yacht || 'kit')}_${name}.png`,
        ),
      );
    }
    const errs = b.errors.filter((e) => !/favicon/.test(e));
    if (errs.length) {
      console.log(
        'CONSOLE ERRORS (' + errs.length + '):\n' + [...new Set(errs)].slice(0, 20).join('\n'),
      );
      bad = true;
    }
  },
);
process.exit(bad ? 1 : 0);
