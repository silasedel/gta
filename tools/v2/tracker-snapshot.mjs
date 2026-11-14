#!/usr/bin/env node
// Bakes the live tracker (docs/v2/tracker.html + progress files) into one self-contained page for publishing.
//   node tools/v2/tracker-snapshot.mjs  ->  .v2-tmp/tracker/index.html
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P = (f) => path.join(ROOT, f);
const J = (f) => { try { return JSON.parse(fs.readFileSync(P(f), 'utf8')); } catch (e) { return null; } };
const plan = J('docs/v2/progress/_plan.json'), agents = J('docs/v2/progress/_agents.json') || {}, stats = J('docs/v2/progress/_stats.json') || {};
const tracks = {}; for (const p of plan.planned) { const t = J(`docs/v2/progress/${p.track}.json`); if (t) tracks[p.track] = t; }
const shots = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-v2-snap-'));
for (const s of (stats.recentShots || []).filter((x) => !/\/before\//.test(x.file)).slice(0, Number(process.argv[2] || 8))) {
  try {
    const out = path.join(tmp, shots.length + '.jpg');
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', '800', P(s.file), '--out', out], { stdio: 'ignore' });
    shots.push({ src: 'data:image/jpeg;base64,' + fs.readFileSync(out).toString('base64'), name: s.file.replace('docs/v2/shots/', '') });
  } catch (e) { /* skip unreadable image */ }
}
fs.rmSync(tmp, { recursive: true, force: true });
const snap = { plan, agents, stats, tracks, shots, at: new Date().toISOString() };
const html = fs.readFileSync(P('docs/v2/tracker.html'), 'utf8').replace('/*__SNAP__*/', 'window.__SNAP__ = ' + JSON.stringify(snap).replace(/</g, '\\u003c') + ';');
fs.mkdirSync(P('.v2-tmp/tracker'), { recursive: true });
fs.writeFileSync(P('.v2-tmp/tracker/index.html'), html);
console.log('wrote .v2-tmp/tracker/index.html', Math.round(html.length / 1024) + ' KB', shots.length + ' shots');
