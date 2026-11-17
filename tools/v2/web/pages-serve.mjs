#!/usr/bin/env node
// r2-web: a GitHub Pages look-alike static server for deploy checks.
//   node tools/v2/web/pages-serve.mjs [--dir dist] [--port 5207] [--base /gta6/] [--log file.json]
// - serves <dir> under <base> only (anything outside the base is a 404, like silasedel.github.io/gta6/)
// - CASE-SENSITIVE lookup (macOS's file system is not; Pages is): every path segment must match the directory entry
//   byte for byte, otherwise 404 and the mismatch is logged with the on-disk spelling
// - Pages-like MIME types and gzip only for the text types Pages (Fastly) compresses; no custom headers,
//   Cache-Control max-age=600 like Pages
// - every 404 / case miss is printed and written to --log (array of { url, why, disk })
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const ROOT = path.resolve(o.dir || 'dist');
const PORT = +(o.port || 5207);
const BASE = (o.base || '/gta6/').replace(/\/?$/, '/');
const LOG = o.log || null;

// GitHub Pages uses the mime-db types (same list as the `mime` package)
export const MIME = {
  html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', csv: 'text/csv; charset=utf-8', xml: 'application/xml',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', avif: 'image/avif', ktx2: 'image/ktx2', hdr: 'application/octet-stream', exr: 'application/octet-stream',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', wasm: 'application/wasm',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', aac: 'audio/aac', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', webmanifest: 'application/manifest+json',
};
// Pages compresses text-like responses only (binary formats are sent as they are)
const GZIP = /^(text\/|application\/(javascript|json|xml|manifest\+json|wasm)|image\/svg\+xml|model\/gltf\+json)/;

const misses = [];
const dirCache = new Map();
function entries(dir) { let e = dirCache.get(dir); if (!e) { try { e = new Set(fs.readdirSync(dir)); } catch (x) { e = null; } dirCache.set(dir, e); } return e; }
// exact-case resolve; returns { file } or { why, disk }
function resolveExact(rel) {
  let cur = ROOT;
  const segs = rel.split('/').filter(Boolean);
  for (const s of segs) {
    if (s === '..' || s === '.') return { why: 'bad path' };
    const e = entries(cur);
    if (!e) return { why: 'not a directory' };
    if (!e.has(s)) {
      const lower = s.toLowerCase();
      const hit = [...e].find((x) => x.toLowerCase() === lower);
      return hit ? { why: 'case', disk: path.relative(ROOT, path.join(cur, hit)) } : { why: 'missing' };
    }
    cur = path.join(cur, s);
  }
  try { if (fs.statSync(cur).isDirectory()) { const e = entries(cur); if (e && e.has('index.html')) return { file: path.join(cur, 'index.html') }; return { why: 'directory' }; } } catch (x) { return { why: 'missing' }; }
  return { file: cur };
}
function flush() { if (LOG) try { fs.writeFileSync(LOG, JSON.stringify(misses, null, 1)); } catch (e) { /* */ } }

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p; try { p = decodeURIComponent(u.pathname); } catch (e) { p = u.pathname; }
  if (p === BASE.slice(0, -1)) { res.writeHead(301, { Location: BASE }); res.end(); return; }
  const fail = (why, disk) => {
    misses.push({ url: p, why, disk }); flush();
    console.log(`404 ${why.padEnd(8)} ${p}${disk ? '   (disk: ' + disk + ')' : ''}`);
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>');
  };
  if (!p.startsWith(BASE)) return fail('outside base');
  const r = resolveExact(p.slice(BASE.length));
  if (!r.file) return fail(r.why, r.disk);
  const ext = path.extname(r.file).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const st = fs.statSync(r.file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const h = { 'Content-Type': type, 'Cache-Control': 'max-age=600', ETag: etag, 'Last-Modified': st.mtime.toUTCString(), 'Access-Control-Allow-Origin': '*', Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
  const gz = GZIP.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 512;
  // Range requests (media elements stream with them)
  const range = !gz && req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...h, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(r.file, { start, end }).pipe(res); return;
  }
  if (gz) {
    res.writeHead(200, { ...h, 'Content-Encoding': 'gzip' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(r.file).pipe(zlib.createGzip({ level: 6 })).pipe(res); return;
  }
  res.writeHead(200, { ...h, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(r.file).pipe(res);
});
srv.listen(PORT, '127.0.0.1', () => console.log(`pages-serve: ${ROOT} at http://127.0.0.1:${PORT}${BASE} (case-sensitive, Pages MIME + gzip)`));
