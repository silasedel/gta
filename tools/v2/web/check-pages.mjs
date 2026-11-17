#!/usr/bin/env node
// r2-web: deploy check for the GitHub Pages build. Serves the build under /gta6/ with a case-sensitive lookup and
// Pages MIME / gzip (pages-serve.mjs), boots the game like a player on a 50 Mbps / 20 ms line (netboot.mjs --play),
// optionally a second visit through the service worker (--repeat), and fails on any 404, case mismatch or console error.
//   node tools/v2/web/check-pages.mjs [--dir ../pages-gta6] [--port 5207] [--repeat] [--set name] [--q "&quick=1"]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.resolve(ROOT, o.dir || '../pages-gta6');
const PORT = +(o.port || 5207);
const SET = o.set || 'pages-check';
const LOG = path.join(ROOT, `docs/v2/reports/web-404-${SET}.json`);
// MIME spot check: the formats Pages must serve right
const MIME_WANT = { glb: 'model/gltf-binary', wasm: 'application/wasm', ogg: 'audio/ogg', ktx2: 'image/ktx2', json: 'application/json', js: 'application/javascript', webp: 'image/webp' };

const srv = spawn(process.execPath, [path.join(ROOT, 'tools/v2/web/pages-serve.mjs'), '--dir', DIR, '--port', String(PORT), '--base', '/gta6/', '--log', LOG], { stdio: ['ignore', 'pipe', 'inherit'] });
let srvOut = '';
srv.stdout.on('data', (d) => { srvOut += d; });
const stop = () => { try { srv.kill('SIGTERM'); } catch (e) { /* */ } };
process.on('exit', stop);
for (let i = 0; i < 100 && !srvOut.includes('pages-serve:'); i++) await new Promise((r) => setTimeout(r, 100));

let fail = 0;
// 1. MIME types of one file per format (the Pages types; real Pages comes from the same mime-db list)
for (const [ext, want] of Object.entries(MIME_WANT)) {
  const f = spawnSync('find', [DIR, '-name', '*.' + ext, '-type', 'f', '-print', '-quit'], { encoding: 'utf8' }).stdout.trim();
  if (!f) { console.log(`  mime .${ext}: no file in the build`); continue; }
  const url = `http://127.0.0.1:${PORT}/gta6/` + path.relative(DIR, f).split(path.sep).map(encodeURIComponent).join('/');
  const r = await fetch(url, { method: 'HEAD' });
  const got = r.headers.get('content-type') || '';
  const ok = r.status === 200 && got.startsWith(want);
  if (!ok) fail++;
  console.log(`  mime .${ext}: ${r.status} ${got} ${ok ? 'ok' : 'WANT ' + want}`);
}
// 2. boot like a player
const args = [path.join(ROOT, 'tools/v2/web/netboot.mjs'), '--url', `http://127.0.0.1:${PORT}/gta6/`, '--set', SET, '--play'];
if (o.repeat) args.push('--repeat');
if (o.q) args.push('--q', o.q);
if (o.timeout) args.push('--timeout', String(o.timeout));
const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
stop();
let misses = [];
try { misses = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (e) { /* none */ }
const rep = JSON.parse(fs.readFileSync(path.join(ROOT, `docs/v2/reports/web-boot-${SET}.json`), 'utf8'));
const errs = rep.visits.flatMap((v) => v.consoleErrors.map((e) => v.label + ': ' + e));
console.log(`\nserver 404s: ${misses.length} (case mismatches: ${misses.filter((m) => m.why === 'case').length})`);
for (const m of misses.slice(0, 40)) console.log(`  ${m.why} ${m.url}${m.disk ? '  disk: ' + m.disk : ''}`);
console.log(`console errors: ${errs.length}`);
for (const e of errs.slice(0, 20)) console.log('  ' + e);
if (r.status !== 0) { console.log('netboot failed'); fail++; }
if (misses.length || errs.length) fail++;
console.log(fail ? '\nCHECK FAILED' : '\nCHECK PASSED');
process.exit(fail ? 1 : 0);
