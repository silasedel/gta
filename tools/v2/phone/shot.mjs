// r2-phone: quick shots of the phone preview page (src/ui/phone/preview.html) at 1600x900, DPR 2.
// Usage: node tools/v2/phone/shot.mjs '<query>' <out.png> ['<js to eval after open>'] [waitMs] [--full]
// Several shots in one browser: pass a JSON file instead: node tools/v2/phone/shot.mjs --plan plan.json
//   plan: [{ q, out, js?, wait?, full? }]   (q is the preview query; same q reuses the loaded page)
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
const BASE = 'http://127.0.0.1:5200/src/ui/phone/preview.html';
let plan;
if (process.argv[2] === '--plan') plan = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
else plan = [{ q: process.argv[2] || '', out: process.argv[3] || '/tmp/phone.png', js: process.argv[4] || '', wait: Number(process.argv[5] || 900), full: process.argv.includes('--full') }];
await withBrowser({ width: 1600, height: 900, maxSeconds: 60 + plan.length * 25 }, async (b) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
  let curQ = null;
  for (const s of plan) {
    if (s.q !== curQ || s.reload) { await b.goto(BASE + '?mute&' + (s.q || '')); await b.waitFor('window.ready === true', 60); await b.sleep(s.q?.includes('open=') ? 1900 : 900); curQ = s.q; }
    if (s.js) { try { await b.eval(`(async () => { ${s.js} })()`); } catch (e) { console.log('eval error', e.message.slice(0, 300)); } }
    await b.sleep(s.wait ?? 900);
    let clip;
    if (!s.full) { const r = await b.eval(`(() => { const r = document.querySelector('.kp-device').getBoundingClientRect(); return { x: r.left - 24, y: Math.max(0, r.top - 24), width: r.width + 48, height: Math.min(900 - Math.max(0, r.top - 24), r.height + 48) }; })()`); clip = { ...r, scale: 1 }; }
    await b.screenshot(s.out, clip ? { clip } : {});
    console.log('shot', s.out);
  }
  if (b.errors.length) console.log('CONSOLE ERRORS\n' + b.errors.join('\n'));
});
