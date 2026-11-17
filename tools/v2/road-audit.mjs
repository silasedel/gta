#!/usr/bin/env node
// Road surface audit: ~12 junctions of different types, 3 views each (top-down 25 m, driver 30 m back on an approach,
// pedestrian on a corner) + optional far views (flicker check). Muted, headless, real gameplay start.
//   node tools/v2/road-audit.mjs --set before [--only urban4,keys] [--far] [--repick]
// Picks are cached in docs/v2/reports/road-audit-picks.json so before/after shoot the same junctions.
// Shots: docs/v2/shots/stage1/roads/<set>_<id>_<view>.png ; sheet: docs/v2/shots/stage1/roads/<set>_sheet.png
// Report: docs/v2/reports/road-audit-<set>.json (per junction: draw calls, frame ms, near-tile mesh counts)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const DIR = path.resolve('docs/v2/shots/stage1/roads'); fs.mkdirSync(DIR, { recursive: true });
const PICKS = path.resolve('docs/v2/reports/road-audit-picks.json');
const rep = { set: SET, when: new Date().toISOString(), junctions: {} };

// in-page picker: classify every junction node and take the most typical one per class
const PICK_JS = `(() => {
  const G = game.city.roadGraph, C = game.city, out = {};
  const zoneAt = C.zoneAt || (() => ''), distAt = C.districtAt || (() => '');
  const cand = {};
  const add = (k, n, score, extra) => { if (!cand[k] || score > cand[k].score) cand[k] = { id: n.id, x: n.x, z: n.z, score, ...extra }; };
  for (const n of G.nodes) {
    const es = (n.edges || []).map((k) => G.edges[k]).filter(Boolean); if (es.length < 3) continue;
    if (es.some((e) => e.elevated)) continue;
    const legs = es.map((e) => { const atA = e.a === n.id, p = e.pts, q = atA ? p[Math.min(2, p.length - 1)] : p[Math.max(0, p.length - 3)], r0 = atA ? p[0] : p[p.length - 1]; const dx = q[0] - r0[0], dz = q[1] - r0[1], L = Math.hypot(dx, dz) || 1; return { dx: dx / L, dz: dz / L, w: e.width, kind: e.kind, len: e.length, sw: e.sidewalk }; });
    if (legs.some((l) => l.len < 35)) continue; // short stubs: not a clean test subject
    const angs = legs.map((l) => Math.atan2(l.dz, l.dx)).sort((p, q) => p - q); let minA = 9; for (let i = 0; i < angs.length; i++) minA = Math.min(minA, ((angs[(i + 1) % angs.length] - angs[i]) + Math.PI * 4) % (Math.PI * 2));
    const z = String(zoneAt(n.x, n.z) || ''), d = String(distAt(n.x, n.z) || ''), deg = legs.length, kinds = legs.map((l) => l.kind).join(',');
    const urban = /downtown|business|brickell|commercial|midtown/.test(z), hwy = /trunk|motorway/.test(kinds), sig = !!n.signal;
    const ex = { deg, zone: z, dist: d, kinds, minAngle: +(minA * 57.3).toFixed(0), signal: sig, legs };
    const sq = 1 - Math.abs(minA - Math.PI / 2) / (Math.PI / 2);
    if (urban && deg === 4 && !hwy) add('urban4', n, sq * 2 + (sig ? 1 : 0) + (legs.every((l) => l.sw) ? 1 : 0) + (/downtown|brickell/i.test(z + d) ? 1.5 : 0), ex);
    if (urban && deg === 3 && !hwy) add('urbanT', n, sq + (legs.every((l) => l.sw) ? 1 : 0), ex);
    if (!hwy && deg >= 3 && minA < 1.05 && minA > 0.45 && !/Key/.test(d)) add('skewed', n, 1 - minA + (urban ? 0.5 : 0), ex);
    if (deg >= 5) add('five', n, deg + (urban ? 1 : 0), ex);
    if (hwy && !/Key|Airport/.test(d) && !/airport|port/.test(z)) add('highway', n, (sig ? 1 : 0) + sq + (legs.some((l) => !l.sw) ? 0.5 : 0), ex);
    if (!urban && deg === 3 && !hwy && /residential/.test(z) && !/Key/.test(d)) add('resT', n, sq + Math.random() * 0.1, ex);
    if (!urban && deg === 4 && !hwy && /residential/.test(z) && !/Key/.test(d)) add('res4', n, sq + (sig ? 0 : 0.3), ex);
    if (deg === 3 && !hwy && /rural|wilderness/.test(z) && !/Key/.test(d)) add('ruralT', n, sq + (legs.every((l) => !l.sw) ? 0.5 : 0), ex);
    if (/Key/.test(d)) add('keys', n, sq + (deg === 4 ? 0.5 : 0) + (hwy ? 0.3 : 0), ex);
    if (/beach|nightlife/.test(z)) add('beach', n, sq + (deg === 4 ? 0.5 : 0) + (sig ? 0.5 : 0), ex);
    if (/industrial|port/.test(z)) add('industrial', n, sq, ex);
    if (/Clewiston|Homestead/.test(d) && deg >= 3) add('town', n, sq + (sig ? 0.5 : 0), ex);
  }
  // fallback rural T: any non-urban, non-residential T
  if (!cand.ruralT) for (const n of G.nodes) { const es = (n.edges || []).map((k) => G.edges[k]); if (es.length !== 3 || es.some((e) => !e || e.elevated)) continue; const z = String(zoneAt(n.x, n.z) || ''); if (!/downtown|business|residential|beach|nightlife|commercial|brickell|port|industrial/.test(z) && es.every((e) => !e.sidewalk)) { cand.ruralT = { id: n.id, x: n.x, z: n.z, zone: z, dist: String(distAt(n.x, n.z) || ''), deg: 3, kinds: es.map((e) => e.kind).join(','), legs: es.map((e) => { const atA = e.a === n.id, p = e.pts, q = atA ? p[Math.min(2, p.length - 1)] : p[Math.max(0, p.length - 3)], r0 = atA ? p[0] : p[p.length - 1]; const dx = q[0] - r0[0], dz = q[1] - r0[1], L = Math.hypot(dx, dz) || 1; return { dx: dx / L, dz: dz / L, w: e.width, kind: e.kind }; }) }; break; } }
  return JSON.stringify(cand);
})()`;

const VIEWS = (j) => {
  const legs = j.legs, L0 = legs.slice().sort((p, q) => q.w - p.w)[0], wmax = Math.max(...legs.map((l) => l.w));
  const v = {};
  v.top = { eye: [j.x + 0.5, 25, j.z + 8], look: [j.x, 0, j.z] };
  v.drive = { eye: [j.x + L0.dx * 30, 1.35, j.z + L0.dz * 30], look: [j.x - L0.dx * 10, 0.6, j.z - L0.dz * 10] };
  // corner: bisector of the first two adjacent legs (by angle)
  const ang = legs.map((l) => Math.atan2(l.dz, l.dx)).sort((p, q) => p - q); let best = 0, gap = -1;
  for (let i = 0; i < ang.length; i++) { const g = ((ang[(i + 1) % ang.length] - ang[i]) + Math.PI * 4) % (Math.PI * 2); if (g > 0.6 && g < 2.4 && (gap < 0 || Math.abs(g - Math.PI / 2) < Math.abs(gap - Math.PI / 2))) { gap = g; best = i; } }
  const bis = ang[best] + gap / 2, cd = (wmax / 2 + 6) / Math.sin(Math.max(0.5, gap / 2)) - 3.5, cx = j.x + Math.cos(bis) * cd, cz = j.z + Math.sin(bis) * cd; // on the corner sidewalk, behind the curb return
  v.corner = { eye: [cx, 1.75, cz], look: [j.x - Math.cos(bis) * 12, 0.4, j.z - Math.sin(bis) * 12] };
  // corner: when the game exposes the junction outline, stand on the corner sidewalk 2.5 m behind a curb return
  if (j.cornerEye) v.corner = { eye: j.cornerEye, look: [j.x, 0.3, j.z] };
  if (o.far) { v.far = { eye: [j.x + L0.dx * 260, 45, j.z + L0.dz * 260], look: [j.x, 0, j.z] }; v.far2 = { eye: [j.x + L0.dx * 140, 9, j.z + L0.dz * 140], look: [j.x, 0, j.z] }; }
  return v;
};

await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1500) }, async (b) => {
  // other helpers save files while we run: block Vite's HMR socket so their edits never hot-reload this page mid-audit
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (String(p).includes('vite-hmr') || /[?&]token=/.test(String(u))) return { readyState: 0, addEventListener() {}, removeEventListener() {}, send() {}, close() {} }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 }); })();` });
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12.5; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); } catch (e) {} for (const id of ['hud','minimap','radar','ps-hud']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } return 1; })()`);
  let picks = null;
  if (!o.repick && fs.existsSync(PICKS)) picks = JSON.parse(fs.readFileSync(PICKS, 'utf8'));
  if (!picks) { picks = JSON.parse(await b.eval(PICK_JS)); fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1)); }
  else { // map rebuilds renumber the graph: re-bind every pick to the junction node nearest its saved position
    const ids = JSON.parse(await b.eval(`JSON.stringify(${JSON.stringify(Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, [v.x, v.z]])))}, null)`).then(async (q) => b.eval(`(() => { const q = ${q}, G = game.city.roadGraph, out = {}; for (const k in q) { let best = null, bd = 1e9; for (const n of G.nodes) { if ((n.edges || []).length < 3) continue; const d = Math.hypot(n.x - q[k][0], n.z - q[k][1]); if (d < bd) { bd = d; best = n; } } out[k] = best ? [best.id, best.x, best.z, bd] : null; } return JSON.stringify(out); })()`)));
    for (const k in ids) if (ids[k]) { picks[k].id = ids[k][0]; picks[k].x = ids[k][1]; picks[k].z = ids[k][2]; if (ids[k][3] > 5) console.log('pick moved', k, ids[k][3].toFixed(1), 'm'); }
  }
  if (!picks.keysLane) { // Keys neighborhood street (user's Key Largo street design): nearest lane-only junction to Nico's house
    const k = JSON.parse(await b.eval(`(() => { const G = game.city.roadGraph, C = game.city; let best = null, bd = 1e9; for (const n of G.nodes) { const es = (n.edges || []).map((k) => G.edges[k]); if (es.length < 3 || es.some((e) => !e || e.elevated || !/residential|tertiary|unclassified|service/.test(e.kind))) continue; if (!/Key/.test(String(C.districtAt(n.x, n.z)))) continue; const d = Math.hypot(n.x + 836, n.z - 5272); if (d < bd) { bd = d; best = n; } }
      if (!best) return 'null'; const legs = best.edges.map((k) => { const e = G.edges[k], atA = e.a === best.id, p = e.pts, q = atA ? p[Math.min(2, p.length - 1)] : p[Math.max(0, p.length - 3)], r0 = atA ? p[0] : p[p.length - 1], dx = q[0] - r0[0], dz = q[1] - r0[1], L = Math.hypot(dx, dz) || 1; return { dx: dx / L, dz: dz / L, w: e.width, kind: e.kind, len: e.length, sw: e.sidewalk }; });
      return JSON.stringify({ id: best.id, x: best.x, z: best.z, deg: legs.length, zone: String(C.zoneAt(best.x, best.z)), dist: String(C.districtAt(best.x, best.z)), kinds: legs.map((l) => l.kind).join(','), legs }); })()`));
    if (k) { picks.keysLane = k; fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1)); }
  }
  console.log('picks', Object.entries(picks).map(([k, v]) => `${k}:${v.id}@${v.x.toFixed(0)},${v.z.toFixed(0)} ${v.zone}/${v.dist} deg${v.deg} ${v.kinds}`).join('\n'));
  const only = o.only ? String(o.only).split(',') : Object.keys(picks);
  const sheet = [];
  // other helpers save files while we run: a hot reload replaces window.game, so re-enter gameplay when that happens
  const ensure = async () => { if (await b.eval("!!(window.game && game.ready === true && typeof game.teleport === 'function' && !(game.ui && game.ui.title))")) return;
    console.log('(re)starting game'); await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480); await startGame(b);
    await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12.5; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); } catch (e) {} const h = document.getElementById('ps-hud'); if (h) h.style.display = 'none'; return 1; })()`); };
  for (const id of only) {
    const j = picks[id]; if (!j) continue;
    await ensure();
    const ce = await b.eval(`(() => { const J = game.city.junctionOf ? game.city.junctionOf(${j.id}) : null; if (!J) return null; const c = J.corners.filter((c) => c.kind === 'fillet').sort((p, q) => (J.legs[q.i].sw > 0 && J.legs[q.j].sw > 0 ? 1 : 0) - (J.legs[p.i].sw > 0 && J.legs[p.j].sw > 0 ? 1 : 0))[0]; if (!c) return null; const m = c.arc[c.arc.length >> 1], dx = c.O[0] - m[0], dz = c.O[1] - m[1], l = Math.hypot(dx, dz) || 1; return [m[0] + dx / l * 2.5, 1.75, m[1] + dz / l * 2.5]; })()`).catch(() => null);
    if (ce && !o.views) { j.cornerEye = ce; fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1)); } // saved: a later job4=0 run stands on the same corner
    const vs = VIEWS(j); rep.junctions[id] = { node: j.id, x: j.x, z: j.z, zone: j.zone, dist: j.dist, kinds: j.kinds, views: {} };
    // park the player out of frame (40 m off the junction on the corner side, streams the tiles), then wait for streaming
    const tk = `tile-near-${Math.floor(j.x / 200)},${Math.floor(j.z / 200)}`;
    for (const [vk, v] of Object.entries(vs)) {
      if (o.views && !String(o.views).split(',').includes(vk)) continue;
      for (let attempt = 0; attempt < 4; attempt++) { try {
        await ensure();
        await b.eval(`(() => { const v = ${JSON.stringify(v)}; game.teleport(${j.x}, undefined, ${j.z + 60}, 0); game.cameraOverride = (dt, cam) => { cam.position.fromArray(v.eye); cam.lookAt(v.look[0], v.look[1], v.look[2]); return true; }; if (game.player) game.player.visible = false; return 1; })()`);
        await b.sleep(1500);
        let q = 99;
        for (let i = 0; i < +(o.stream || 60); i++) { q = await b.eval(`(() => { let has = false; game.scene.traverse((g) => { if (g.name === '${tk}') has = true; }); return has ? (game.city?.streamer?.pending?.() ?? 0) : 99; })()`); if (q < 2) break; await b.sleep(1000); }
        await b.sleep(+(o.settle || 1800));
        const perf = JSON.parse(await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 1500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render;
          let tiles = 0, meshes = 0; game.scene.traverse((g) => { if (g.isGroup && /^tile-near-/.test(g.name)) { tiles++; g.traverse((m) => { if (m.isMesh) meshes++; }); } });
          res(JSON.stringify({ avgMs: +avg.toFixed(2), med: +ts[ts.length >> 1].toFixed(2), calls: ri.calls, tris: ri.triangles, nearTiles: tiles, meshesPerTile: tiles ? +(meshes / tiles).toFixed(1) : 0 })); } }; requestAnimationFrame(f); })`));
        if (await b.eval("typeof game.teleport !== 'function'")) throw new Error('reloaded');
        await b.eval(`(() => { const v = ${JSON.stringify(v)}; game.cameraOverride = (dt, cam) => { cam.position.fromArray(v.eye); cam.lookAt(v.look[0], v.look[1], v.look[2]); return true; }; const h = document.getElementById('ps-hud'); if (h) h.style.display = 'none'; return 1; })()`); await b.sleep(400);
        const out = path.join(DIR, `${SET}_${id}_${vk}.png`);
        await b.screenshot(out);
        rep.junctions[id].views[vk] = perf; sheet.push(out);
        console.log(id, vk, JSON.stringify(perf));
        break;
      } catch (e) { console.log('retry', id, vk, String(e.message).slice(0, 120)); await b.sleep(3000); } }
    }
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }
  fs.writeFileSync(`docs/v2/reports/road-audit-${SET}${o.views ? '-' + String(o.views).replace(/,/g, '_') : ''}.json`, JSON.stringify(rep, null, 1));
  // per-junction sheets (3 views side by side) + one overview sheet
  for (const id of only) { const fs3 = sheet.filter((p) => path.basename(p).startsWith(`${SET}_${id}_`)); if (fs3.length) try { execFileSync('python3', ['tools/v2/montage.py', path.join(DIR, `sheet_${SET}_${id}.png`), ...fs3, '--w', '800']); } catch (e) { console.log('montage failed', e.message); } }
});
