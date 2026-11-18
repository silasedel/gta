#!/usr/bin/env node
// r3-perf retainer hunt: boots the game, drives the r3-leak autopilot for --secs, then marks every tracked geometry
// (tools/v2/perf/r3-leak.track.js) that is no longer in the scene but still alive (an R3LeakMark object on it), takes a
// V8 heap snapshot (streamed to disk, parsed without loading it as one string) and prints the shortest retainer path from
// the GC roots to each marked geometry, grouped. Answers "who keeps disposed tiles / cars / people alive".
//   node tools/v2/perf/r3-retain.mjs [--secs 240] [--q "&leakfix=0"] [--out /tmp/x.heapsnapshot]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SECS = +(o.secs || 240);
const OUT = o.out || path.join(os.tmpdir(), `r3-retain-${process.pid}.heapsnapshot`);
const TRACK = fs.readFileSync(new URL('./r3-leak.track.js', import.meta.url), 'utf8');
const AP = fs.readFileSync(new URL('./r3-leak.ap.js', import.meta.url), 'utf8');

await withBrowser({ width: 1280, height: 720, maxSeconds: SECS + 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 15; return 1; })()`);
  console.log('tracker', await b.eval(TRACK));
  const start = (o.from || '0,1760').split(',').map(Number);
  await b.eval(`(async () => { game.teleport(${start[0]}, undefined, ${start[1]}); const st = game.city.streamer; const t0 = performance.now();
    while (performance.now() - t0 < 40000) { await new Promise((r) => setTimeout(r, 200)); if (st.readyAround(${start[0]}, ${start[1]}, 120) && game.city.collidersReadyAt(${start[0]}, ${start[1]})) break; } return 1; })()`, 60000);
  await b.eval(`(() => { const G = game.city.roadGraph, P = game.player.position; let e = G.nearestEdge(P.x, P.z, {}, 2000).edge, node = e.a, used = new Map(), pts = [], len = 0;
    const rank = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1 };
    for (let g = 0; g < 20000 && len < 9000; g++) { used.set(e.id, (used.get(e.id) || 0) + 1); const fwd = e.a === node; const ep = fwd ? e.pts : [...e.pts].reverse(); const ey = fwd ? [...(e.y || [])] : [...(e.y || [])].reverse();
      for (let i = pts.length ? 1 : 0; i < ep.length; i++) { pts.push([ep[i][0], ey[i] || 0, ep[i][1]]); if (pts.length > 1) { const p = pts[pts.length - 2], q = pts[pts.length - 1]; len += Math.hypot(q[0] - p[0], q[2] - p[2]); } }
      node = fwd ? e.b : e.a; const nd = G.nodes[node]; const a2 = ep[ep.length - 2], a3 = ep[ep.length - 1]; const dx = a3[0] - a2[0], dz = a3[1] - a2[1], dl = Math.hypot(dx, dz) || 1; let best = null;
      for (const k of nd.edges) { const f = G.edges[k]; if (f.id === e.id || (f.oneway && f.a !== node)) continue; const fp = f.a === node ? f.pts : [...f.pts].reverse(); const ex = fp[1][0] - fp[0][0], ez = fp[1][1] - fp[0][1], el = Math.hypot(ex, ez) || 1;
        const mid = fp[(fp.length / 2) | 0]; const home = Math.hypot(mid[0] - ${start[0]}, mid[1] - ${start[1]}) > 1600 ? -3 : 0;
        const sc = (dx * ex + dz * ez) / (dl * el) * 1.5 + (rank[f.kind] || 0) * 0.35 + Math.random() * 1.2 - (used.get(f.id) || 0) * 1.5 + home; if (!best || sc > best[0]) best = [sc, f]; }
      if (!best) break; e = best[1]; }
    window.__route = pts; return pts.length; })()`);
  await b.eval(AP); await b.eval('window.__apNewCar()');
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < SECS) { await b.sleep(10000); await b.eval(`(() => { if ((game.wanted?.level ?? 0) < 3) game.wanted.set(3, game.player.position, { visual: true }); try { window.__apKeep(); } catch (e) {} if (game.player.health < 50) game.player.health = 100; return 1; })()`).catch(() => {}); }
  await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.collectGarbage');
  // mark: off-scene tracked geometries that still hold array data (by creation site)
  const marked = await b.eval(`(() => { class R3LeakMark { constructor(site, mb) { this.site = site; this.mb = mb; } } const inScene = new Set(); game.scene.traverse((o) => { if (o.geometry) inScene.add(o.geometry); });
    const by = {}; let n = 0; for (const e of window.__trk.list) { const g = e.r.deref(); if (!g || e.kind !== 'geo' || inScene.has(g)) continue; let bytes = 0; for (const k in g.attributes) { const ar = g.attributes[k].array || g.attributes[k].data?.array; if (ar) bytes += ar.byteLength; } if (bytes < 65536) continue;
      g.__r3mark = new R3LeakMark(e.site, bytes / 1048576); n++; by[e.site] = (by[e.site] || 0) + bytes / 1048576; }
    return JSON.stringify({ n, by: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [Math.round(v) + ' MB', k.slice(0, 160)]) }); })()`);
  console.log('marked', marked);
  // snapshot -> file
  const fd = fs.openSync(OUT, 'w'); let bytes = 0;
  b.on((m, p) => { if (m === 'HeapProfiler.addHeapSnapshotChunk') { fs.writeSync(fd, p.chunk); bytes += p.chunk.length; } });
  const ts = Date.now(); await b.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); fs.closeSync(fd);
  console.log('snapshot', Math.round(bytes / 1048576), 'MB in', Math.round((Date.now() - ts) / 1000), 's ->', OUT);
});

// ---- parse the snapshot without one big string: meta, then nodes / edges int arrays, then strings ----
const buf = fs.readFileSync(OUT);
const find = (s, from = 0) => buf.indexOf(Buffer.from(s), from);
const metaEnd = find('"nodes":');
const snapInfo = JSON.parse(buf.slice(0, metaEnd).toString().replace(/,\s*$/, '') + '}').snapshot, meta = snapInfo.meta;
function intArray(key, count) {
  let i = find('"' + key + '":[') + key.length + 4; const out = new Int32Array(count); let n = 0, cur = 0, inNum = false;
  for (; i < buf.length; i++) { const c = buf[i]; if (c >= 48 && c <= 57) { cur = cur * 10 + (c - 48); inNum = true; } else { if (inNum) { out[n++] = cur; cur = 0; inNum = false; } if (c === 93) break; } }
  return out.subarray(0, n);
}
const nodes = intArray('nodes', snapInfo.node_count * meta.node_fields.length), edges = intArray('edges', snapInfo.edge_count * meta.edge_fields.length);
const s0 = find('"strings":[') + 10; let s1 = buf.length - 1; while (buf[s1] !== 93) s1--;
const strings = JSON.parse(buf.slice(s0, s1 + 1).toString());
const NF = meta.node_fields.length, EF = meta.edge_fields.length;
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nEC = meta.node_fields.indexOf('edge_count');
const eType = meta.edge_fields.indexOf('type'), eName = meta.edge_fields.indexOf('name_or_index'), eTo = meta.edge_fields.indexOf('to_node');
const nodeTypes = meta.node_types[nType], edgeTypes = meta.edge_types[eType];
const N = nodes.length / NF; const firstEdge = new Int32Array(N + 1); for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += nodes[i * NF + nEC] * EF; } firstEdge[N] = edges.length;
// BFS from the root (node 0), skipping weak edges; parent pointers
const parent = new Int32Array(N).fill(-1), pEdge = new Int32Array(N).fill(-1); parent[0] = 0; const q = new Int32Array(N); let qh = 0, qt = 0; q[qt++] = 0;
while (qh < qt) { const v = q[qh++]; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) { if (edgeTypes[edges[e + eType]] === 'weak') continue; const to = edges[e + eTo] / NF; if (parent[to] !== -1) continue; parent[to] = v; pEdge[to] = e; q[qt++] = to; } }
const nameOf = (i) => strings[nodes[i * NF + nName]];
const edgeLabel = (e) => { const t = edgeTypes[edges[e + eType]], nm = edges[e + eName]; return t === 'element' || t === 'hidden' ? `[${nm}]` : t === 'context' ? `<ctx ${strings[nm]}>` : (t === 'internal' ? `{${strings[nm]}}` : '.' + strings[nm]); };
const groups = {};
for (let i = 0; i < N; i++) {
  if (nameOf(i) !== 'R3LeakMark' || nodeTypes[nodes[i * NF + nType]] !== 'object') continue;
  if (parent[i] === -1) continue;
  const chain = []; let v = i; for (let d = 0; d < 40 && v !== 0; d++) { chain.push(edgeLabel(pEdge[v]) + ' ' + nameOf(parent[v]).slice(0, 40)); v = parent[v]; }
  const key = chain.slice(1, 22).reverse().join('  ->  ');
  groups[key] = (groups[key] || 0) + 1;
}
const top = Object.entries(groups).sort((x, y) => y[1] - x[1]).slice(0, 12);
console.log('retainer paths (root ... -> geometry), count:');
for (const [k, n] of top) console.log(n, '\n   ', k, '\n');
try { fs.rmSync(OUT); } catch (e) { /* */ }
