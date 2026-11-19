// r2-physics: collider overlay review sheet. Each row: scene | same view with every collider drawn (overlay.js colors),
// plus the ray-sweep numbers of that spot from docs/v2/reports/physics-colaudit[-tag].json.
//   node tools/v2/physics/colsheet.mjs [--tag x] [--out docs/v2/shots/r2-physics/colliders_sheet.jpg]
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const DIR = 'docs/v2/shots/r2-physics/colliders';
const rep = JSON.parse(
  fs.readFileSync(`docs/v2/reports/physics-colaudit${o.tag ? '-' + o.tag : ''}.json`, 'utf8'),
);
const rows = [];
for (const [spot, S] of Object.entries(rep.spots))
  for (const V of S.views || []) {
    const sc = path.resolve(DIR, `${spot}_${V.n}_scene.jpg`),
      ov = path.resolve(DIR, `${spot}_${V.n}_overlay.jpg`);
    if (fs.existsSync(sc) && fs.existsSync(ov))
      rows.push({ spot, view: V.n, sc, ov, stats: V.stats, sweep: S.sweep, parked: S.parked });
  }
const fmt = (r) => {
  const w = r.sweep;
  if (!w) return '';
  return (
    `ray sweep: ${w.rays} rays from ${w.points} standing points - walk-through ${w.walkThrough.length}, invisible walls ${w.invisible.length}` +
    (r.parked ? ` | parked cars ${r.parked.cars.length}, on something ${r.parked.bad.length}` : '')
  );
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#101317;color:#e8ecef;font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;width:1800px}
h1{font-size:24px;margin:18px 22px 2px} .sub{margin:0 22px 14px;color:#9aa6b2}
.row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 22px 4px} .row img{width:100%;border-radius:3px;display:block}
.cap{margin:2px 22px 16px;color:#c9d1d9;font-size:13px} .k{display:inline-block;width:12px;height:12px;border-radius:2px;margin:0 4px 0 12px;vertical-align:-1px}
</style></head><body><h1>Collider audit: scene | colliders</h1>
<div class="sub">Every Rapier collider within 45 m is drawn over the rendered frame:
<span class="k" style="background:#3dff6a"></span>ground / walkable faces <span class="k" style="background:#ffd23a"></span>walls / steep faces
<span class="k" style="background:#ff8a1e"></span>fixed props (primitives) <span class="k" style="background:#ff3b3b"></span>push props (dynamic)
<span class="k" style="background:#35e6ff"></span>cars <span class="k" style="background:#ff4bf0"></span>characters</div>
${rows.map((r) => `<div class="row"><img src="file://${r.sc}"><img src="file://${r.ov}"></div><div class="cap"><b>${r.spot} / ${r.view}</b> - ${fmt(r)}</div>`).join('')}
<script>document.title = 'ready';</script></body></html>`;
const f = path.resolve(DIR, '.sheet.html');
fs.writeFileSync(f, html);
await withBrowser({ width: 1800, height: 1200, maxSeconds: 300 }, async (b) => {
  await b.goto('file://' + f);
  await b.waitFor(
    "document.title === 'ready' && [...document.images].every((i) => i.complete)",
    30,
  );
  const h = await b.eval('document.body.scrollHeight');
  await b.screenshot(o.out || 'docs/v2/shots/r2-physics/colliders_sheet.jpg', {
    quality: 90,
    clip: { x: 0, y: 0, width: 1800, height: h },
  });
});
fs.unlinkSync(f);
console.log('sheet', rows.length, 'rows');
