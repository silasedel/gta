#!/usr/bin/env node
// COMBAT track test runner (uses the only allowed browser: tools/v2/browser.mjs).
//   node src/gameplay/combat/tests/run.mjs <scenario> [--game]     scenario = file in this folder (without .mjs)
// A scenario exports `url` (optional) and `async run({ b, ev, shot, step, log })`.
import path from 'node:path';
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
const name = process.argv[2]; if (!name) { console.error('usage: run.mjs <scenario>'); process.exit(64); }
const sc = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), name + '.mjs'));
const full = !!sc.game || process.argv.includes('--game');
const url = sc.url || (full ? 'http://127.0.0.1:5200/?mute' : 'http://127.0.0.1:5200/src/gameplay/combat/range.html?manual');
const out = {};
let bad = false;
await withBrowser({ width: sc.width || 1280, height: sc.height || 720, maxSeconds: sc.maxSeconds || 230 }, async (b) => {
  await b.goto(url);
  await b.waitFor(full ? GAME_READY : 'window.rangeReady === true', full ? 170 : 90);
  const ev = (code) => b.eval(`(async () => { ${code} })()`);
  const shot = async (file) => { await b.sleep(120); const f = await b.screenshot('docs/v2/shots/combat/' + file); console.log('SHOT', f); return f; };
  const step = (n = 1, dt = 1 / 60) => ev(`return T.step(${n}, ${dt});`);
  const log = (k, v) => { out[k] = v; console.log('RESULT', k, typeof v === 'string' ? v : JSON.stringify(v)); };
  try { await sc.run({ b, ev, shot, step, log }); } catch (e) { console.log('SCENARIO ERROR', String(e).slice(0, 600)); bad = true; }
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  if (errs.length) { console.log('CONSOLE ERRORS (' + errs.length + '):\n' + errs.slice(0, 20).join('\n')); }
});
process.exit(bad ? 1 : 0);
