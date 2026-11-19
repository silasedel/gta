#!/usr/bin/env node
// Runs the built-in benchmark (src/perf/bench.v2.js) in the Mac app and prints the summary.
//   node tools/v2/bench.mjs --label after [--app desktop/dist/mac-arm64/Southline.app] [--web <built web dir>] [--q "&foo=1"]
//        [--preset high] [--secs 1] [--windowed]
// --app: the packaged app binary (default when it exists); --web: run unpackaged Electron (npx electron desktop/app) on a
// web build folder instead (fast A/B without repacking). Report: docs/v2/reports/bench-<label>.json; the app log of the
// test profile (~/Library/Application Support/Port Solana Test/logs/app.log) gets the summary lines too.
// Prints the machine load before and after: only trust runs with a load average under ~6 (other agents' browsers).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const label = o.label || 'run';
const out = path.resolve(`docs/v2/reports/bench-${label}.json`);
const q = [
  'mute',
  o.preset ? `benchpreset=${o.preset}` : '',
  o.secs ? `benchsecs=${o.secs}` : '',
  (o.q || '').replace(/^&/, ''),
]
  .filter(Boolean)
  .join('&');
const appArgs = [`--ps-bench=${label}`, `--ps-bench-out=${out}`, `--ps-query=${q}`];
if (!o.windowed) appArgs.push('--ps-fullscreen');
if (o.jsflags) appArgs.push(`--ps-js-flags=${o.jsflags}`);
let cmd, args;
if (o.web) {
  cmd = 'npx';
  args = ['electron', 'desktop/app', `--ps-web-root=${path.resolve(o.web)}`, ...appArgs];
} else {
  const app = path.resolve(o.app || 'desktop/dist/mac-arm64/Southline.app');
  cmd = path.join(app, 'Contents/MacOS/Southline');
  args = appArgs;
}
const load = () =>
  execSync('uptime')
    .toString()
    .trim()
    .replace(/.*load averages?: /, '');
const l0 = load();
console.log('load before', l0);
try {
  fs.rmSync(out);
} catch (e) {
  /* none */
}
// --gclog <file>: the app's stdout / stderr (with --jsflags "--trace-gc": every V8 GC of the run)
const p = spawn(cmd, args, {
  stdio: o.gclog ? ['ignore', fs.openSync(o.gclog, 'w'), fs.openSync(o.gclog, 'a')] : 'ignore',
});
const kill = setTimeout(
  () => {
    console.log('timeout: killing');
    p.kill('SIGKILL');
  },
  +(o.max || 1200) * 1000,
);
p.on('exit', () => {
  clearTimeout(kill);
  console.log('load after', load());
  if (!fs.existsSync(out)) {
    console.log('no report');
    process.exit(1);
  }
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  r.loadBefore = l0;
  r.loadAfter = load();
  fs.writeFileSync(out, JSON.stringify(r, null, 1));
  if (r.error) {
    console.log('ERROR', r.error);
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      gate: r.gate,
      display: r.display,
      quality: r.quality,
      gcCount: r.gcCount,
      gcMB: r.gcMB,
      heapMB: r.heapMB,
    }),
  );
  for (const s of r.segments)
    console.log(
      `${s.id.padEnd(16)} n ${String(s.frames).padStart(5)} p50 ${s.p50} p95 ${s.p95} p99 ${s.p99} max ${s.max} >17.5 ${s.over16_7} >25 ${s.over25} >33 ${s.over33} >50 ${s.over50} >100 ${s.over100} cpu50 ${s.cpuP50} cpu99 ${s.cpuP99} calls ${s.calls} tris ${s.tris} gpu ${s.gpuMs} gc ${s.gc}\n    ${s.sys
        .slice(0, 8)
        .map((x) => x.join(' '))
        .join(', ')}`,
    );
  console.log('worst:');
  for (const w of r.worst.slice(0, 12))
    console.log(
      `  ${w.seg} +${w.t}s gap ${w.gap} work ${w.work} prog ${w.newPrograms} gc ${w.gcMB} calls ${w.calls} | ${w.top.map((x) => x.join(' ')).join(', ')}`,
    );
});
