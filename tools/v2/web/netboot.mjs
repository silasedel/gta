#!/usr/bin/env node
// r2-web: first-load profiler on a throttled home connection.
//   node tools/v2/web/netboot.mjs [--url http://127.0.0.1:5201/] [--set name] [--mbps 50] [--lat 20] [--up 20]
//        [--play] [--repeat] [--q "&param"] [--nothrottle]
// Fresh headless Chrome profile, cache disabled, Network.emulateNetworkConditions (50 Mbps down, 20 ms RTT by default).
// Page marks (ms from navigation start, performance.now in the page):
//   fcp      first contentful paint
//   art      the key art behind the loading / title screen is painted
//   title    the title screen (Press any key / menu) is on screen and answers input
//   ready    game.ready (world, systems, shaders warmed)
//   control  the player has control (title gone, gameplay live); with --play the script presses Enter like a player
// Network: every request with transfer bytes, start / end, status, served from SW / cache; bytes and requests
// before each mark; the critical path (largest / longest requests before title and before control); 404s.
// --repeat: a second visit in the same profile (cache on, service worker live) with the same marks.
// Writes docs/v2/reports/web-boot-<set>.json
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const URL0 = o.url || 'http://127.0.0.1:5201/';
const SET = o.set || 'run';
const MBPS = +(o.mbps || 50), LAT = +(o.lat || 20), UP = +(o.up || 20);
const Q = (URL0.includes('?') ? '&' : '?') + 'mute&menu=1' + (o.q || '');
const TIMEOUT = +(o.timeout || 600);

const EARLY = `(() => {
  const W = window.__web = { marks: {}, t0: performance.now() };
  const mark = (k) => { if (W.marks[k] == null) W.marks[k] = Math.round(performance.now()); };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') W.marks.fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  const vis = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.5; };
  const poll = () => {
    try {
      // key art painted: loading screen or title background has its image
      const art = document.querySelector('.sl-art, .pm-titleart, .wl-art');
      if (art && /url\\(/.test(art.style.backgroundImage || getComputedStyle(art).backgroundImage) && vis(art)) mark('art');
      // the title answers input: the real front end (.pm .pm-press) or the early title (.wl-title)
      const t = document.querySelector('.pm.in .pm-press, .pm.in .pm-menu:not([hidden]), .wl-title.ready');
      const load = document.getElementById('loading');
      const covered = load && load.isConnected && +getComputedStyle(load).opacity > 0.5 && !document.querySelector('.wl-title.ready');
      if (t && vis(t) && !covered) mark('title');
      const g = window.game;
      if (g && g.ready) mark('ready');
      if (g && g.ready && g.ui && !g.ui.title && (!load || !load.isConnected || +getComputedStyle(load).opacity < 0.1)) mark('control');
      if (g && g.ui && g.ui.title === true) W.sawTitle = true;
    } catch (e) {}
    if (W.marks.control == null) setTimeout(poll, 50);
  };
  poll();
})();`;

const reqs = new Map();
let nav0 = 0; // monotonic seconds of the document request
let visit = 0;
const onEvent = (m, p) => {
  if (m === 'Network.requestWillBeSent') {
    if (!nav0 && p.type === 'Document') nav0 = p.timestamp;
    if (!reqs.has(p.requestId)) reqs.set(p.requestId, { visit, url: p.request.url, type: p.type, t0: p.timestamp, prio: p.request.initialPriority });
  } else if (m === 'Network.responseReceived') {
    const r = reqs.get(p.requestId); if (!r) return;
    r.status = p.response.status; r.mime = p.response.mimeType; r.sw = !!p.response.fromServiceWorker; r.disk = !!p.response.fromDiskCache;
    r.enc = p.response.headers?.['content-encoding'] || p.response.headers?.['Content-Encoding'] || '';
    r.len = +(p.response.headers?.['content-length'] || p.response.headers?.['Content-Length'] || 0);
  } else if (m === 'Network.loadingFinished') {
    const r = reqs.get(p.requestId); if (!r) return; r.t1 = p.timestamp; r.bytes = p.encodedDataLength;
  } else if (m === 'Network.loadingFailed') {
    const r = reqs.get(p.requestId); if (!r) return; r.t1 = p.timestamp; r.failed = p.errorText; r.bytes = 0;
  }
};

const rep = { set: SET, url: URL0 + Q, when: new Date().toISOString(), throttle: o.nothrottle ? null : { mbps: MBPS, latencyMs: LAT, upMbps: UP }, visits: [] };

// the page can be busy for a long time on a loaded machine: never let one eval hold the run
const ev = (b, expr, ms = 8000) => Promise.race([b.eval(expr, ms), new Promise((_, j) => setTimeout(() => j(new Error('eval timeout')), ms + 2000))]);
async function oneVisit(b, label, cacheDisabled) {
  reqs.clear(); nav0 = 0;
  await b.send('Network.setCacheDisabled', { cacheDisabled });
  const tWall = Date.now();
  await b.goto(URL0 + Q);
  // wait for the title (or ready when the title is skipped)
  const want = o.play ? 'control' : 'ready';
  let pressed = null, lastShown = '', tPress = 0;
  const shot = {};
  const deadline = Date.now() + TIMEOUT * 1000;
  for (let i = 0; Date.now() < deadline; i++) {
    let M = {};
    try { M = JSON.parse(await ev(b, 'JSON.stringify(Object.assign({ pend: window.game && game.city && game.city.streamer && game.city.streamer.pending ? game.city.streamer.pending() : null, title: undefined }, window.__web && window.__web.marks || {}, { uiTitle: window.game && game.ui ? game.ui.title : null }))')); } catch (e) { /* navigating */ }
    const shown = Object.entries(M).filter(([k, v]) => k !== 'pend' && v != null).map(([k, v]) => k + '=' + v).join(' ');
    if (shown !== lastShown) { lastShown = shown; console.log(`  [${label} ${((Date.now() - tWall) / 1000).toFixed(0)}s] ${shown}  reqs=${reqs.size}`); }
    // --shots <dir>: a screenshot when each mark first appears (and the menu state after the first Enter)
    if (o.shots) for (const k of ['art', 'title', 'ready', 'control']) if (M[k] != null && !shot[label + k]) { shot[label + k] = 1; await Promise.race([b.screenshot(`${o.shots}/${SET}_${label}_${k}.jpg`), b.sleep(15000)]).catch(() => {}); }
    if (o.shots && pressed != null && !shot[label + 'menu'] && Date.now() - tPress > 2500) { shot[label + 'menu'] = 1; await Promise.race([b.screenshot(`${o.shots}/${SET}_${label}_afterpress.jpg`), b.sleep(15000)]).catch(() => {}); }
    if (M[want] != null && (want !== 'ready' || M.title != null || i > 20)) break;
    // play like a player: Enter as soon as the title answers, then Enter on the menu (New Game / Continue)
    if (o.play && M.title != null && (pressed == null || i % 3 === 0)) {
      if (pressed == null) { pressed = await ev(b, 'Math.round(performance.now())').catch(() => -1); tPress = Date.now(); }
      await Promise.race([(async () => { await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); })(), b.sleep(4000)]);
    }
    await b.sleep(500);
  }
  await b.sleep(o.play ? 2500 : 1500);
  let marks = {}, boot = { stages: [] };
  try { marks = JSON.parse(await ev(b, 'JSON.stringify(window.__web.marks)', 30000)); } catch (e) { console.log('  marks unavailable', e.message); }
  try { boot = JSON.parse(await ev(b, 'JSON.stringify({ stages: (window.__boot && window.__boot.stages) || [], ready: window.__boot && window.__boot.ready, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), streamer: window.game && game.city && game.city.streamer && game.city.streamer.pending ? game.city.streamer.pending() : null })', 30000)); } catch (e) { /* page busy */ }
  const list = [...reqs.values()].filter((r) => r.t0 >= nav0).map((r) => ({
    url: r.url.replace(/^https?:\/\/[^/]+/, ''), type: r.type, status: r.status, bytes: r.bytes || 0, len: r.len || 0, enc: r.enc,
    start: Math.round((r.t0 - nav0) * 1000), end: r.t1 ? Math.round((r.t1 - nav0) * 1000) : null, sw: r.sw, disk: r.disk, failed: r.failed,
  })).sort((x, y) => x.start - y.start);
  const before = (t) => { const l = list.filter((r) => r.end != null && r.end <= t); return { requests: l.length, bytes: l.reduce((s, r) => s + r.bytes, 0) }; };
  const sum = {};
  for (const k of ['fcp', 'art', 'title', 'ready', 'control']) if (marks[k] != null) sum[k] = { ms: marks[k], ...before(marks[k]) };
  const all = { requests: list.length, bytes: list.reduce((s, r) => s + r.bytes, 0) };
  const errs = list.filter((r) => r.status >= 400 || r.failed);
  const crit = (t) => list.filter((r) => r.end != null && r.end <= t).sort((x, y) => y.bytes - x.bytes).slice(0, 25).map((r) => `${(r.bytes / 1048576).toFixed(2).padStart(7)} MiB ${String(r.start).padStart(6)}-${String(r.end).padStart(6)} ms ${r.url}`);
  const byDir = (t) => { const m = {}; for (const r of list) { if (r.end == null || r.end > t) continue; const d = r.url.split('?')[0].split('/').slice(0, 4).join('/'); m[d] = (m[d] || 0) + r.bytes; } return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 20).map(([d, v]) => `${(v / 1048576).toFixed(2).padStart(7)} MiB ${d}`); };
  const end = marks.control ?? marks.ready ?? 1e9;
  const v = { label, wallMs: Date.now() - tWall, marks, pressedAt: pressed, sum, all, sw: boot.sw, streamerPending: boot.streamer, errors404: errs.map((r) => `${r.status || r.failed} ${r.url}`), consoleErrors: [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 30),
    critTitle: marks.title != null ? crit(marks.title) : [], critControl: crit(end), dirsControl: byDir(end), stages: boot.stages, requests: list };
  b.errors.length = 0;
  return v;
}

await withBrowser({ width: 1600, height: 900, maxSeconds: TIMEOUT * (o.repeat ? 2 : 1) + 900 }, async (b) => {
  b.on(onEvent);
  await b.send('Network.enable', { maxTotalBufferSize: 10e6, maxResourceBufferSize: 1e6 });
  if (!o.nothrottle) await b.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: MBPS * 1e6 / 8, uploadThroughput: UP * 1e6 / 8 });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  rep.visits.push(await oneVisit(b, 'first', true));
  if (o.repeat) {
    visit = 1;
    await b.goto('about:blank'); await b.sleep(1500);
    rep.visits.push(await oneVisit(b, 'repeat', false));
  }
});

const MB = (x) => (x / 1048576).toFixed(1) + ' MiB';
for (const v of rep.visits) {
  console.log(`\n=== ${v.label} visit (${rep.throttle ? rep.throttle.mbps + ' Mbps / ' + rep.throttle.latencyMs + ' ms' : 'no throttle'}), SW controlling: ${v.sw}`);
  for (const [k, s] of Object.entries(v.sum)) console.log(`  ${k.padEnd(8)} ${String(s.ms).padStart(7)} ms   ${String(s.requests).padStart(5)} requests  ${MB(s.bytes).padStart(10)}`);
  if (v.pressedAt != null) console.log(`  (Enter pressed at ${v.pressedAt} ms)`);
  console.log(`  total    ${String(v.all.requests).padStart(16)} requests  ${MB(v.all.bytes).padStart(10)}   streamer pending at end: ${v.streamerPending}`);
  console.log('  404 / failed:', v.errors404.length, v.errors404.slice(0, 20).join('\n    '));
  console.log('  console errors:', v.consoleErrors.length, v.consoleErrors.slice(0, 10).join('\n    '));
  console.log('  bytes by directory before control/ready:\n    ' + v.dirsControl.join('\n    '));
  console.log('  largest before control/ready:\n    ' + v.critControl.slice(0, 15).join('\n    '));
  if (v.critTitle.length) console.log('  largest before title:\n    ' + v.critTitle.slice(0, 10).join('\n    '));
}
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/web-boot-${SET}.json`, JSON.stringify(rep, null, 1));
console.log(`\nwrote docs/v2/reports/web-boot-${SET}.json`);
