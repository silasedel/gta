#!/usr/bin/env node
// Batch screenshots of the boat preview in one browser session.
//   node src/vehicles/boats/tests/shots.mjs --query "keys=cc26&seed=5" --views quarter,side,stern,helm,engine --prefix docs/v2/shots/boats/wip/cc26 [--i 0] [--stats]
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const url = `http://127.0.0.1:5200/src/vehicles/boats/preview.html?${o.query || ''}`;
let bad = false;
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 200) }, async (b) => {
  await b.goto(url); await b.waitFor('window.ready', 90); await b.sleep(400);
  if (o.stats) console.log('STATS', await b.eval('JSON.stringify(window.stats.map(s => ({key:s.key,name:s.name,reg:s.reg,tris:s.tris,calls:s.calls,ms:s.ms})))'));
  const views = (o.views || '').split(',').filter(Boolean);
  if (!views.length) { await b.eval('window.render()'); console.log('SHOT', await b.screenshot(`${o.prefix}.png`)); }
  for (const v of views) { const [name, k] = v.split(':'); await b.eval(`window.view(${JSON.stringify(name)}, ${+(o.i || 0)}, ${+(k || 1)})`); await b.sleep(120); console.log('SHOT', await b.screenshot(`${o.prefix}_${name}.png`)); }
  const errs = b.errors.filter((e) => !/favicon/.test(e)); if (errs.length) { console.log('CONSOLE ERRORS:\n' + [...new Set(errs)].slice(0, 12).join('\n')); bad = true; }
});
process.exit(bad ? 1 : 0);
