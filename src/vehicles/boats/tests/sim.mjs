#!/usr/bin/env node
// Runs an expression in the boat sim harness (src/vehicles/boats/sim.html) and writes the JSON result.
//   node src/vehicles/boats/tests/sim.mjs --impl v1|v2 --expr "window.steerTable()" --out docs/v2/shots/boats/steering_before.json [--shot file.png]
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const url = `http://127.0.0.1:5200/src/vehicles/boats/sim.html?impl=${o.impl || 'v2'}${o.query ? '&' + o.query : ''}`;
let bad = false;
await withBrowser({ width: 960, height: 540, maxSeconds: +(o.max || 235) }, async (b) => {
  await b.goto(url);
  await b.waitFor('window.ready', 90);
  const v = await b.eval(`JSON.stringify(${o.expr || 'window.steerTable()'})`, 220000);
  if (o.out) {
    fs.mkdirSync(path.dirname(o.out), { recursive: true });
    fs.writeFileSync(o.out, JSON.stringify(JSON.parse(v), null, 1));
    console.log('WROTE', o.out);
  } else console.log(v);
  if (o.shot) await b.screenshot(o.shot);
  const errs = b.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) {
    console.log('CONSOLE ERRORS:\n' + [...new Set(errs)].slice(0, 20).join('\n'));
    bad = true;
  }
});
process.exit(bad ? 1 : 0);
