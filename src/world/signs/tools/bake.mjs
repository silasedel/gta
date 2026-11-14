#!/usr/bin/env node
// KEYS-SIGN track: bakes the code-painted sign art to public/assets/signs/ (so the game does not repaint 4K at boot).
//   node src/world/signs/tools/bake.mjs welcome 4096 | back 2048
import fs from 'node:fs';
import { withBrowser } from '../../../../tools/v2/browser.mjs';
const [art = 'welcome', w = '4096', page = 'setpieces/keysSign/preview_art.html', name = 'keys_' + art] = process.argv.slice(2);
const dir = 'public/assets/signs/'; fs.mkdirSync(dir, { recursive: true });
await withBrowser({ width: 800, height: 450, maxSeconds: 235 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/src/world/${page}?art=${art}&w=${w}`);
  await b.waitFor('window.ready || window.err', 200);
  const err = await b.eval('String(window.err||"")'); if (err) throw new Error(err);
  const save = async (expr, file) => { const d = await b.eval(expr); fs.writeFileSync(dir + file, Buffer.from(d.split(',')[1], 'base64')); console.log(file, (fs.statSync(dir + file).size / 1024 | 0) + ' KB'); };
  await save(`out.color.toDataURL('image/jpeg', 0.9)`, name + '_color.jpg');
  await save(`out.normal.toDataURL('image/jpeg', 0.93)`, name + '_normal.jpg');
  await save(`(()=>{const c=document.createElement('canvas');c.width=out.width/2;c.height=out.height/2;c.getContext('2d').drawImage(out.orm,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.88)})()`, name + '_orm.jpg');
  const meta = await b.eval(`JSON.stringify({ outline: out.outline.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]), aspect: out.aspect, width: out.width, height: out.height, paintMs: Math.round(paintMs) })`);
  fs.writeFileSync(dir + name + '.json', meta); console.log(name + '.json', JSON.parse(meta).outline.length, 'outline points, paint ms', JSON.parse(meta).paintMs);
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 5));
});
