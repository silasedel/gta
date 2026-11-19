#!/usr/bin/env node
// r2-web: lossless web compression pass over a Pages build folder (never over public/).
//   node tools/v2/web/compress.mjs --dir ../pages-gta6
// - JSON: minified (whitespace only; values unchanged). Pages gzips JSON too; minified JSON parses faster and gzips smaller.
// - Miami data: only the build folder named by assets/miami/world.json ships; older build folders are dropped.
// Every rewrite unlinks the file first, so a hard link back into public/ is broken, never written through.
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const DIR = path.resolve(o.dir);
if (!o.dir || !fs.existsSync(path.join(DIR, 'index.html'))) {
  console.error('compress: --dir must be a build folder');
  process.exit(2);
}
if (path.resolve(DIR).endsWith(path.sep + 'public')) {
  console.error('compress: refusing to touch public/');
  process.exit(2);
}

const replace = (f, data) => {
  const tmp = f + '.tmp-web';
  fs.writeFileSync(tmp, data);
  fs.unlinkSync(f);
  fs.renameSync(tmp, f);
};
function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

let saved = 0,
  n = 0;
// 1. stale Miami builds
try {
  const mi = path.join(DIR, 'assets/miami');
  const cur = JSON.parse(fs.readFileSync(path.join(mi, 'world.json'), 'utf8')).dir?.replace(
    /\/$/,
    '',
  );
  if (cur)
    for (const e of fs.readdirSync(mi)) {
      if (/^b\d{8}-\d{6}$/.test(e) && e !== cur) {
        const p = path.join(mi, e);
        for (const f of walk(p)) saved += fs.statSync(f).size;
        fs.rmSync(p, { recursive: true });
        console.log('  dropped stale Miami build', e);
      }
    }
} catch (e) {
  console.warn('  miami check skipped:', e.message);
}
// 2. JSON minify
for (const f of walk(DIR)) {
  if (!f.endsWith('.json') || f.endsWith('sw-manifest.json')) continue;
  const s = fs.readFileSync(f, 'utf8');
  if (s.length < 2048) continue;
  let j;
  try {
    j = JSON.parse(s);
  } catch (e) {
    continue;
  }
  const m = JSON.stringify(j);
  if (m.length < s.length * 0.97) {
    replace(f, m);
    saved += s.length - m.length;
    n++;
  }
}
console.log(`  compress: ${n} JSON files minified, ${(saved / 1048576).toFixed(1)} MiB saved`);
