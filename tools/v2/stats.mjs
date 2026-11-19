#!/usr/bin/env node
// Live build stats for the V2 tracker. Writes docs/v2/progress/_stats.json.
//   node tools/v2/stats.mjs            (once)
//   node tools/v2/stats.mjs --loop 20  (every 20 s, until killed)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/v2/progress/_stats.json');
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.css', '.html', '.py', '.glsl', '.sh']);
const CODE_DIRS = ['src', 'server', 'desktop', 'tools'];
const SKIP = new Set([
  'node_modules',
  '.venv',
  'cache',
  'dist',
  '.git',
  'out',
  '__pycache__',
  '.v2-tmp',
]);
// v1.1.1 baseline, measured at the start of the V2 build (same counting rules)
const BASE = { lines: 42050, files: 185 };

function walk(dir, fn) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, fn);
    else if (e.isFile()) fn(p, e.name);
  }
}
function countLines(p) {
  try {
    const b = fs.readFileSync(p);
    let n = 0;
    for (let i = 0; i < b.length; i++) if (b[i] === 10) n++;
    return n + (b.length && b[b.length - 1] !== 10 ? 1 : 0);
  } catch (e) {
    return 0;
  }
}

function once() {
  const byDir = {};
  let lines = 0,
    files = 0;
  const recent = [];
  for (const d of CODE_DIRS)
    walk(path.join(ROOT, d), (p, name) => {
      if (!CODE_EXT.has(path.extname(name)) || name.endsWith('.tmp')) return;
      if (/\/(staging|snap|\.last)\//.test(p) || /_staging\.js$/.test(name)) return;
      const n = countLines(p);
      lines += n;
      files++;
      const rel = path.relative(ROOT, p),
        top = rel.split(path.sep).slice(0, 2).join('/');
      byDir[top] = (byDir[top] || 0) + n;
      try {
        recent.push([fs.statSync(p).mtimeMs, rel, n]);
      } catch (e) {
        /* */
      }
    });
  recent.sort((a, b) => b[0] - a[0]);
  let assets = 0,
    assetBytes = 0;
  walk(path.join(ROOT, 'public/assets'), (p) => {
    assets++;
    try {
      assetBytes += fs.statSync(p).size;
    } catch (e) {
      /* */
    }
  });
  const shots = [];
  walk(path.join(ROOT, 'docs/v2/shots'), (p, name) => {
    if (/\.(png|jpe?g|webp)$/i.test(name)) {
      try {
        shots.push([fs.statSync(p).mtimeMs, path.relative(ROOT, p)]);
      } catch (e) {
        /* */
      }
    }
  });
  shots.sort((a, b) => b[0] - a[0]);
  let commits = 0;
  try {
    commits = Number(
      execSync('git rev-list --count c5addaa..HEAD', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim(),
    );
  } catch (e) {
    /* */
  }
  const stats = {
    at: new Date().toISOString(),
    lines,
    files,
    base: BASE,
    addedLines: lines - BASE.lines,
    addedFiles: files - BASE.files,
    assets,
    assetMB: Math.round(assetBytes / 1048576),
    commits,
    screenshots: shots.length,
    topDirs: Object.entries(byDir)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14),
    recentFiles: recent
      .slice(0, 12)
      .map(([t, rel, n]) => ({
        file: rel,
        lines: n,
        secondsAgo: Math.round((Date.now() - t) / 1000),
      })),
    recentShots: shots
      .slice(0, 18)
      .map(([t, rel]) => ({ file: rel, secondsAgo: Math.round((Date.now() - t) / 1000) })),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(stats));
  fs.renameSync(OUT + '.tmp', OUT);
  return stats;
}

const i = process.argv.indexOf('--loop');
if (i < 0) {
  const s = once();
  console.log(
    JSON.stringify({
      lines: s.lines,
      files: s.files,
      assets: s.assets,
      screenshots: s.screenshots,
    }),
  );
} else {
  const every = Math.max(5, Number(process.argv[i + 1]) || 20);
  once();
  setInterval(() => {
    try {
      once();
    } catch (e) {
      /* keep going */
    }
  }, every * 1000);
}
