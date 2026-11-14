#!/usr/bin/env node
// KEYS-SIGN track helper around tools/v2/browser.mjs: one page, several screenshots, and the page's console output
// even when the wait times out.  node run.mjs --url U --w 1600 --h 900 [--wait EXPR] [--waitSeconds 150]
//   [--shot out.png] [--do "js" --shot out2.png ...] [--eval "js"] [--game]
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
const a = process.argv.slice(2); const steps = []; const o = {};
for (let i = 0; i < a.length; i++) { const k = a[i].replace(/^--/, ''), v = a[i + 1]; if (['shot', 'do', 'eval', 'sleep'].includes(k)) { steps.push([k, v]); i++; } else if (k === 'game') o.game = true; else { o[k] = v; i++; } }
let bad = 0;
await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 235) }, async (b) => {
  await b.goto(o.url);
  const wait = o.game ? GAME_READY : (o.wait || 'window.ready || window.err');
  try { await b.waitFor(wait, +(o.waitSeconds || 150)); } catch (e) { console.log('WAIT FAILED', e.message); bad = 1; }
  const err = await b.eval('String(window.err || "")').catch(() => ''); if (err) { console.log('PAGE ERR', err); bad = 1; }
  for (const [k, v] of steps) {
    try {
      if (k === 'shot') { await b.sleep(+(o.settle || 400)); console.log('SHOT', await b.screenshot(v)); }
      else if (k === 'sleep') await b.sleep(+v);
      else { const r = await b.eval(v); if (k === 'eval') console.log('EVAL', typeof r === 'string' ? r : JSON.stringify(r)); }
    } catch (e) { console.log('STEP FAILED', k, e.message); bad = 1; }
  }
  if (b.errors.length) { console.log('CONSOLE ERRORS (' + b.errors.length + '):\n' + [...new Set(b.errors)].slice(0, 20).join('\n')); if (!o.allowErrors) bad = 1; }
  if (o.logs) console.log('LOGS\n' + b.logs.slice(-(+o.logs)).join('\n'));
});
process.exit(bad);
