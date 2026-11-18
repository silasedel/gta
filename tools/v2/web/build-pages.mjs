#!/usr/bin/env node
// r2-web: the GitHub Pages build (silasedel.github.io/gta6). Does what the deploy note did by hand, plus the web extras:
//   node tools/v2/web/build-pages.mjs [--out ../pages-gta6] [--base /gta6/] [--app <checkout>] [--skip-vite] [--no-compress]
// 1. vite build with PAGES_BASE=<base> (root-absolute '/assets/...' in JS / CSS rewritten to the sub-path), public files
//    NOT copied by Vite
// 2. public/ copied in with hard links (no extra disk), minus what the site never loads: assets/originals/,
//    assets/characters/nico/ (only ?nico=old), .DS_Store, dev preview pages
// 3. web compression pass (compress.mjs: JSON minify, stale Miami builds; glb-compress.mjs: Draco geometry, --no-draco
//    to skip); files are rewritten out of place,
//    so public/ is never touched through a hard link
// 4. sw.js (from sw.template.js, versioned per build) + sw-manifest.json (content hash per file) + the
//    <meta name="sl-sw"> that turns the offline cache on (src/web/offline.v2.js)
// 5. .nojekyll, size / file count report (fails over 1000 MiB)
// The lead force-pushes <out> to gh-pages. This script never pushes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.resolve(ROOT, o.out || '../pages-gta6');
const BASE = (o.base || '/gta6/').replace(/\/?$/, '/');
const LIMIT = 1000 * 1048576;
const EXCLUDE = ['.DS_Store', 'originals/', 'assets/characters/nico/', '*.blend', '*.blend1', '*.psd', '*.fbx.bak'];
const t0 = Date.now();
const log = (...x) => console.log(`[pages ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...x);

const STAGE = OUT + '.app'; // Vite's own output (index.html, assets/*.js|css), merged into OUT after the public files
if (!o['skip-vite']) {
  log('vite build ->', STAGE, 'PAGES_BASE', BASE);
  process.env.PAGES_BASE = BASE;
  // --app <dir>: build the code from another checkout (a clean worktree, when the shared tree has a half-saved file);
  // public files always come from this project
  const APP = path.resolve(o.app || ROOT);
  process.chdir(APP);
  const { build } = await import(path.join(ROOT, 'node_modules/vite/dist/node/index.js'));
  await build({ root: APP, configFile: path.join(APP, 'vite.config.js'), logLevel: 'warn', build: { outDir: STAGE, emptyOutDir: true, copyPublicDir: false } });
}

log('linking public/ (hard links, incremental)');
// rsync --link-dest makes every unchanged file a hard link to public/ (no copy). Every later rewrite is out of place.
fs.mkdirSync(OUT, { recursive: true });
execFileSync('rsync', ['-a', '--delete', '--delete-excluded', ...EXCLUDE.map((e) => '--exclude=' + e), '--link-dest=' + path.join(ROOT, 'public'), path.join(ROOT, 'public') + '/', OUT + '/'], { stdio: 'inherit' });
log('merging the app build');
execFileSync('rsync', ['-a', STAGE + '/', OUT + '/'], { stdio: 'inherit' });

if (!o['no-compress']) {
  log('compression pass');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/v2/web/compress.mjs'), '--dir', OUT], { stdio: 'inherit' });
  // Draco geometry for uncompressed models (Pages does not gzip .glb); --no-draco keeps the authored files
  if (!o['no-draco']) execFileSync(process.execPath, [path.join(ROOT, 'tools/v2/web/glb-compress.mjs'), '--dir', OUT], { stdio: 'inherit' });
}

// remove dev-only pages copied from public (preview / test pages are not part of the game)
for (const f of walk(OUT)) if (/\/(preview|test)[^/]*\.html$/.test(f) && !f.endsWith('/index.html')) fs.rmSync(f);

// boot byte manifest for the loading bar (src/core/loadProgress.js): bytes per boot phase from a throttled profile
// (node tools/v2/web/loadbar.mjs --url <built site> --mbps 50 --bytes-out tools/v2/web/boot-bytes.json)
try { fs.copyFileSync(path.join(ROOT, 'tools/v2/web/boot-bytes.json'), path.join(OUT, 'boot-bytes.json')); log('boot-bytes.json copied'); } catch (e) { log('no tools/v2/web/boot-bytes.json: the loading bar counts by time only'); }

log('service worker + manifest');
const files = {};
let total = 0, count = 0;
for (const f of walk(OUT)) {
  const r = path.relative(OUT, f).split(path.sep).join('/');
  if (r === 'sw.js' || r === 'sw-manifest.json' || r === '.nojekyll') continue;
  const buf = fs.readFileSync(f);
  files[r] = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  total += buf.length; count++;
}
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + crypto.createHash('sha1').update(JSON.stringify(files)).digest('hex').slice(0, 8);
fs.writeFileSync(path.join(OUT, 'sw-manifest.json'), JSON.stringify({ version, files }));
const tpl = fs.readFileSync(path.join(ROOT, 'tools/v2/web/sw.template.js'), 'utf8').replace(/__VERSION__/g, version);
fs.writeFileSync(path.join(OUT, 'sw.js'), tpl);
const idx = path.join(OUT, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
if (!html.includes('name="sl-sw"')) html = html.replace('</head>', `  <meta name="sl-sw" content="sw.js" data-build="${version}">\n</head>`);
fs.writeFileSync(idx, html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const extra = fs.statSync(path.join(OUT, 'sw-manifest.json')).size + tpl.length;
total += extra; count += 3;
log(`done: ${count} files, ${(total / 1048576).toFixed(1)} MiB (limit ${LIMIT / 1048576} MiB), build ${version}`);
fs.writeFileSync(path.join(ROOT, 'docs/v2/reports/web-pages-build.json'), JSON.stringify({ out: OUT, base: BASE, version, files: count, mib: +(total / 1048576).toFixed(1), when: new Date().toISOString() }, null, 1));
if (total > LIMIT) { console.error(`OVER THE PAGES LIMIT: ${(total / 1048576).toFixed(1)} MiB`); process.exit(3); }

function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p); else if (e.isFile()) yield p;
  }
}
