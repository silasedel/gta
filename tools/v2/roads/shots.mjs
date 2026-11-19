#!/usr/bin/env node
// Road surface review shots (roads pass, Nov 19): the same spread-out road spots before / after.
//   node tools/v2/roads/shots.mjs --set before --q "&roadfix=0"      node tools/v2/roads/shots.mjs --set after
//   [--only keysBridge,downtown] [--spots tools/v2/roads/spots.json]
// Each spot: { name, x, z } on a road (snapped to the nearest edge) or a fixed camera { eye: [x,y,z], look: [x,y,z] }.
// Shots: docs/v2/shots/roads/<set>_<name>.jpg, sheet docs/v2/shots/roads/sheet_<set>.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after', DIR = path.resolve('docs/v2/shots/roads'); fs.mkdirSync(DIR, { recursive: true });
const spots = JSON.parse(fs.readFileSync(o.spots || 'tools/v2/roads/spots.json', 'utf8')).filter((s) => !o.only || String(o.only).split(',').includes(s.name));
const HIDE = `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11.5;
  try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); } catch (e) {}
  if (!window.__rsCss) { window.__rsCss = document.createElement('style'); window.__rsCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__rsCss); }
  game.wanted?.clear?.(); if (game.police) game.police.enabled = false; return 1; })()`;
await withBrowser({ width: 1600, height: 900, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (String(p).includes('vite-hmr') || /[?&]token=/.test(String(u))) return { readyState: 0, addEventListener() {}, removeEventListener() {}, send() {}, close() {} }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 }); })();` });
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(HIDE);
  const out = [];
  for (const s of spots) {
    // camera: fixed, or 16 m back along the road from the spot, 4.5 m up, looking past the spot
    const cam = s.eye ? { eye: s.eye, look: s.look } : JSON.parse(await b.eval(`(() => { const G = game.city.roadGraph, r = G.nearestEdge(${s.x}, ${s.z}, {}, 250); if (!r) return 'null'; const e = r.edge, P = e.pts; let bi = 0, bd = 1e9;
      for (let i = 0; i < P.length - 1; i++) { const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1; let t = ((${s.x} - P[i][0]) * dx + (${s.z} - P[i][1]) * dz) / L2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(P[i][0] + dx * t - ${s.x}, P[i][1] + dz * t - ${s.z}); if (d < bd) { bd = d; bi = i; } }
      const dx = P[bi + 1][0] - P[bi][0], dz = P[bi + 1][1] - P[bi][1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, x = r.x ?? ${s.x}, z = r.z ?? ${s.z}, sd = ${s.side ?? 0.35} * e.width;
      const y = game.city.groundHeightAt(x, z) || 0, back = ${s.back ?? 16}, up = ${s.up ?? 4.5};
      return JSON.stringify({ eye: [x - ux * back - uz * sd, y + up, z - uz * back + ux * sd], look: [x + ux * 10, y, z + uz * 10] }); })()`));
    if (!cam) { console.log('no road at', s.name); continue; }
    for (let attempt = 0; attempt < 3; attempt++) { try {
      await b.eval(`(() => { const c = ${JSON.stringify(cam)}; game.teleport(c.look[0] + 70, undefined, c.look[2] + 70, 0); game.cameraOverride = (dt, cm) => { if (game.player) game.player.visible = false; cm.position.fromArray(c.eye); cm.lookAt(c.look[0], c.look[1], c.look[2]); return true; }; if (game.player) game.player.visible = false; return 1; })()`);
      await b.sleep(1500);
      for (let i = 0; i < 60; i++) { const ok = await b.eval(`(() => { const s = game.city.streamer; return (!s.readyAround || s.readyAround(${cam.look[0]}, ${cam.look[2]}, 120)) && s.pending() < 2; })()`); if (ok) break; await b.sleep(1000); }
      await b.sleep(+(o.settle || 3500));
      const f = path.join(DIR, `${SET}_${s.name}.jpg`); await b.screenshot(f, { format: 'jpeg', quality: 86 }); out.push(f); console.log('shot', s.name, JSON.stringify(cam)); break;
    } catch (e) { console.log('retry', s.name, String(e.message).slice(0, 120)); await b.sleep(2000); } }
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
  try { execFileSync('python3', ['tools/v2/montage.py', path.join(DIR, `sheet_${SET}.jpg`), ...out, '--w', '640']); } catch (e) { console.log('montage failed', e.message); }
});
