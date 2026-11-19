#!/usr/bin/env node
// In-game shots and measurements for the houses track (isolated test browser, see tools/v2/browser.mjs).
//   node src/world/setpieces/houses/tools/ingame.mjs [--nohouses] [--shots a,b,c] [--out docs/v2/shots/houses]
// Shots: street (Pelican Point Lane from the road), highway, night, distA, distB. Prints houses stats, fps, draw calls, triangles.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../../../tools/v2/browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const OUT = o.out || 'docs/v2/shots/houses',
  tag = o.nohouses || o.notown ? 'before_' : '';
const shots = String(o.shots || 'street,highway,night,distA,distB').split(',');
const SPOTS = {
  street: { hour: 9.5, eye: [-6334, 1.75, 12446.5], look: [-6398, 3.2, 12424] },
  highway: { hour: 16.5, eye: [-6300, 2.2, 12420], look: [-6352, 3.5, 12560] },
  night: { hour: 21.3, eye: [-6334, 1.75, 12446.5], look: [-6398, 3.2, 12424] },
  highway2: { hour: 10, eye: [-6346, 1.8, 12545], look: [-6318, 3.2, 12462] },
  nicoSlider: { hour: 9.3, eye: [-6427.33, 5.58, 12418.15], look: [-6424.68, 4.88, 12419.05] },
  nicoRail: { hour: 9.3, eye: [-6422.13, 5.68, 12407.56], look: [-6415.18, 4.4, 12408.88] },
  townMain: { hour: 12, town: 'main' },
  townPlaza: { hour: 12, town: 'plaza' },
  townNight: { hour: 21, town: 'main' },
  townQuarter: { hour: 11, town: 'quarter' },
  townClose: { hour: 13, town: 'close' },
  townSatsuma: { hour: 15.5, town: 'main', tname: 'Satsuma' },
  townTangelo: { hour: 11.5, town: 'main', tname: 'Tangelo' },
  townCoontie: { hour: 16, town: 'main', tname: 'Coontie' },
  townSatsumaQ: { hour: 10, town: 'quarter', tname: 'Satsuma' },
  distA: { hour: 10.5, at: [700, -1100] },
  distB: { hour: 15.5, at: [2900, 700] },
};
const stage = (s) => `(async () => {
  if (${JSON.stringify(!!0)}) {}
  const s = ${JSON.stringify(s)}; game.timeExternal = true; if (game.time) game.time.paused = true; game.timeOfDay = s.hour;
  const V3 = game.camera.position.constructor; const eye = new V3(), look = new V3();
  if (s.town) {
    const TN = s.tname || 'Port Calabash', P = (await (await fetch('/assets/world/layout.json')).json()).places.find((p) => p.name === TN);
    game.teleport(P.x, null, P.z, 0);
    for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 300)); const T = game.towns?.list?.find((t) => t.name === TN); if (!game.towns || (T && (T.state === 'built' || T.state === 'none'))) break; }
    const T = game.towns?.list?.find((t) => t.name === TN), plan = T?.plan;
    if (plan && plan.shops.length) {
      const f = plan.shops[0].f, gy = plan.shops[0].y || 0;
      if (s.town === 'plaza' && plan.plaza) { const Q = plan.plaza; eye.set(Q.x - Q.nx * (Q.hd + 9) + f.tx * 6, gy + 2.2, Q.z - Q.nz * (Q.hd + 9) + f.tz * 6); look.set(Q.x, gy + 2.5, Q.z); }
      else if (s.town === 'quarter' && plan.shops.some((x) => x.quarter)) { const q = plan.shops.find((x) => x.quarter), g = q.f, sd = q.side, nx = -g.tz * sd, nz = g.tx * sd; eye.set(g.x - nx * 2 - g.tx * 6, gy + 1.8, g.z - nz * 2 - g.tz * 6); look.set(g.x + nx * 8 + g.tx * 22, gy + 3.0, g.z + nz * 8 + g.tz * 22); }
      else if (s.town === 'close') { const q = plan.shops[1] || plan.shops[0], g = q.f, sd = q.side, nx = -g.tz * sd, nz = g.tx * sd, b0 = { x: q.x - nx * (q.d / 2 + 4.5), z: q.z - nz * (q.d / 2 + 4.5) }; eye.set(b0.x - nx * 5.5 + g.tx * 6, gy + 1.7, b0.z - nz * 5.5 + g.tz * 6); look.set(q.x, gy + 2.2, q.z); }
      else { const sd = plan.shops[0].side, nx = -f.tz * sd, nz = f.tx * sd; eye.set(f.x - nx * 1.5 - f.tx * 22, gy + 1.9, f.z - nz * 1.5 - f.tz * 22); look.set(f.x + nx * 9 + f.tx * 12, gy + 3.2, f.z + nz * 9 + f.tz * 12); }
    } else { eye.set(P.x + 30, 30, P.z + 30); look.set(P.x, 0, P.z); }
    { const ge = game.city.groundHeightAt(eye.x, eye.z) || 0, dy = eye.y - ge; if (dy > 4) { const k = ge + (s.town === 'plaza' ? 2.2 : 1.85) - eye.y; eye.y += k; look.y += k; } }   // keep the eye at street level
    game.teleport(eye.x + 3, null, eye.z + 3, 0);
    window.__spot = { town: game.towns?.stats?.(), district: game.city.districtAt(eye.x, eye.z) };
  } else if (s.at) {
    game.teleport(s.at[0], null, s.at[1], 0);
    for (let i = 0; i < 160; i++) { await new Promise((r) => setTimeout(r, 250)); const n = game.lots.near(s.at[0], s.at[1], 160).filter((l) => l.source === 'map'); if (n.length > 6 && game.city.streamer.pending() === 0) break; }
    const n = game.lots.near(s.at[0], s.at[1], 160).filter((l) => l.source === 'map'); if (!n.length) return 'no lots';
    n.sort((p, q) => Math.hypot(p.x - s.at[0], p.z - s.at[1]) - Math.hypot(q.x - s.at[0], q.z - s.at[1]));
    const L = n[0], fx = Math.sin(L.heading), fz = Math.cos(L.heading), rx = Math.cos(L.heading), rz = -Math.sin(L.heading), gy = L.y || 0;
    eye.set(L.x + fx * (L.d / 2 + Math.min(10, L.roadGap + 5)) + rx * 9, gy + 1.8, L.z + fz * (L.d / 2 + Math.min(10, L.roadGap + 5)) + rz * 9); look.set(L.x - rx * 4, gy + 3, L.z - rz * 4);
    game.teleport(eye.x + fx * 4 + rx * 3, null, eye.z + fz * 4 + rz * 3, 0);
    window.__spot = { lot: L.id, style: L.style, district: game.city.districtAt(L.x, L.z) };
  } else { game.teleport(s.eye[0] + 2, null, s.eye[2] + 2, 0); eye.fromArray(s.eye); look.fromArray(s.look); window.__spot = { district: game.city.districtAt(s.eye[0], s.eye[2]) }; }
  game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; };
  if (!window.__css) { window.__css = document.createElement('style'); window.__css.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__css); }
  return true; })()`;
const MEASURE = `new Promise((res) => { const ri = game.renderer.info, out = { calls: [], tris: [] }; let n = 0;
  const tick = () => { out.calls.push(ri.render.calls); out.tris.push(ri.render.triangles); if (++n < 40) setTimeout(tick, 120); else res({ fps: +(game.perf?.fps ?? 0).toFixed(1), calls: Math.round(out.calls.reduce((a, b) => a + b) / n), callsMax: Math.max(...out.calls), trisM: +(out.tris.reduce((a, b) => a + b) / n / 1e6).toFixed(2), houses: game.houses?.stats?.(), spot: window.__spot }); }; tick(); })`;
const res = {};
await withBrowser({ width: 1280, height: 720, maxSeconds: 2400 }, async (b) => {
  // other tracks edit files all the time: keep Vite's HMR socket from reloading the page in the middle of a run
  await b.send('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "(() => { const W = window.WebSocket; function F(u, p) { if (String(p || '').includes('vite')) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new W(u, p); } F.prototype = W.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); window.WebSocket = F; })();",
  });
  await b.goto(
    'http://127.0.0.1:5200/?mute&menu=0' +
      (o.nohouses ? '&nohouses' : '') +
      (o.notown ? '&notown' : ''),
  );
  try {
    await b.waitFor(GAME_READY, 600);
  } catch (e) {
    console.log(
      'NOT READY',
      JSON.stringify(
        await b
          .eval(
            '({ ready: window.game?.ready, v2: window.game?.v2, title: document.title, msg: document.getElementById("loading")?.textContent?.slice(0, 120) })',
          )
          .catch(() => null),
      ),
      '\n' + b.errors.slice(0, 15).join('\n'),
    );
    throw e;
  }
  const pastTitle = async () => {
    await b.sleep(2000);
    await b.key('Enter', true, 'Enter');
    await b.key('Enter', false, 'Enter');
    await b.sleep(800);
    await b.click(640, 585);
    await b.sleep(2500);
  }; // past the title screen if it shows
  await pastTitle();
  for (let si = 0, tries = 0; si < shots.length; si++) {
    const id = shots[si];
    await b.waitFor(GAME_READY + ' && typeof game.teleport === "function" && !!game.houses', 300);
    if (tries) await pastTitle();
    const st = await b
      .eval(stage(SPOTS[id]), 200000)
      .catch((e) => 'stage error ' + String(e.message).slice(0, 300));
    if (st !== true) console.log('stage', id, st);
    await b.sleep(2000);
    try {
      await b.waitFor('game.city.streamer.pending() === 0', 60);
    } catch (e) {
      console.log('not settled', id);
    }
    await b.sleep(+(o.settle || 5000));
    await b.eval(
      `document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove()); true`,
    );
    const f = `${OUT}/${tag}${id}.png`;
    fs.mkdirSync(OUT, { recursive: true });
    await b.screenshot(f);
    res[id] = await b.eval(MEASURE).catch(() => undefined);
    if (!res[id]?.houses && tries++ < 2) {
      console.log('retry', id, '(page reloaded?)');
      si--;
      continue;
    }
    console.log(id, f, JSON.stringify(res[id]));
  }
  if (b.errors.length)
    console.log(
      'ERRORS',
      [...new Set(b.errors)]
        .filter((e) => !/favicon/.test(e))
        .slice(0, 12)
        .join('\n'),
    );
});
if (o.json) fs.writeFileSync(o.json, JSON.stringify(res, null, 1));
