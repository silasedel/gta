#!/usr/bin/env node
// city-look: fixed-viewpoint screenshots + render metrics in the real game (V2 test browser only).
//   node src/world/miami/.shots.mjs --set before [--views sb,dt,br,port,cw,isl] [--hours 14,21.5] [--angles street,aerial]
// Writes docs/v2/shots/city-look/<set>/<view>_<angle>_<hour>.png and metrics_<set>.json (draw calls, triangles,
// frame times, GPU memory counts). Camera poses are resolved once and stored in views.json so before/after match exactly.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const OUT = path.resolve('docs/v2/shots/city-look');
const VIEWS = [
  // id, label, x, z, optional street-name regex (snapped to the nearest matching drivable edge)
  { id: 'sb', label: 'South Beach (Ocean Drive)', x: 3478, z: -77, re: 'Ocean Dr' },
  { id: 'dt', label: 'Downtown (Flagler / Biscayne)', x: -2420, z: 520, re: 'Flagler' },
  { id: 'br', label: 'Brickell Avenue', x: -2676, z: 1647, re: 'Brickell Ave' },
  { id: 'port', label: 'PortMiami', x: -300, z: 480, re: 'Port' },
  { id: 'cw', label: 'MacArthur Causeway', x: 500, z: -110, re: 'MacArthur' },
  { id: 'isl', label: 'Residential island (Venetian / Di Lido)', x: 942, z: -1305, re: '' },
  { id: 'col', label: 'Collins Avenue', x: 3330, z: -700, re: 'Collins' },
  { id: 'lh', label: 'Calle Ocho (SW 8th St)', x: -3300, z: 1380, re: '8th' },
  { id: 'wyn', label: 'Wynwood', x: -3050, z: -2400, re: '' },
  { id: 'oh', label: 'Overseas Highway (rural Keys)', x: -7005, z: 6529, re: 'Overseas' },
];
const want = (o.views ? String(o.views).split(',') : VIEWS.slice(0, 6).map((v) => v.id));
const hours = (o.hours ? String(o.hours).split(',').map(Number) : [14, 21.5]);
const angles = (o.angles ? String(o.angles).split(',') : ['street', 'aerial']);
const posesFile = path.join(OUT, 'views.json');
let poses = {}; try { poses = JSON.parse(fs.readFileSync(posesFile, 'utf8')); } catch (e) { /* first run */ }
fs.mkdirSync(path.join(OUT, SET), { recursive: true });
const load = execSync('uptime').toString().trim();
const metrics = { set: SET, when: new Date().toISOString(), uptime: load, views: {} };
const metricsFile = path.join(OUT, `metrics_${SET}.json`);
try { Object.assign(metrics.views, JSON.parse(fs.readFileSync(metricsFile, 'utf8')).views); } catch (e) { /* */ }

const RESOLVE = (v) => `(() => {
  const g = game.city.roadGraph, re = ${v.re ? `new RegExp(${JSON.stringify(v.re)}, 'i')` : 'null'};
  let r = null;
  try { r = g.nearestEdge(${v.x}, ${v.z}, {}, 900, re ? (e) => re.test(e.name || '') : (e) => /residential|tertiary|secondary|primary/.test(e.kind || '')); } catch (e) {}
  if (!r) { try { r = g.nearestEdge(${v.x}, ${v.z}, {}, 900); } catch (e) {} }
  if (!r) return { x: ${v.x}, z: ${v.z}, dx: 0, dz: -1, y: 0, name: null };
  return { x: r.point.x, z: r.point.z, dx: r.dir.x, dz: r.dir.z, y: r.y || 0, name: r.edge.name || null, kind: r.edge.kind, w: r.edge.width };
})()`;

const STAGE = (p, angle, hour) => `(() => {
  const p = ${JSON.stringify(p)};
  game.timeExternal = true; game.timeOfDay = ${hour};
  const gy = (game.city.groundHeightAt ? game.city.groundHeightAt(p.x, p.z, p.y + 1) : 0) || 0;
  game.teleport(p.x - p.dz * (p.w ? p.w / 2 + 1.6 : 5), null, p.z + p.dx * (p.w ? p.w / 2 + 1.6 : 5), Math.atan2(p.dx, p.dz));
  const T = window.THREE || game.THREE;
  const eye = new T.Vector3(), look = new T.Vector3();
  if (${JSON.stringify(angle)} === 'street') { eye.set(p.x - p.dx * 6, gy + 1.75, p.z - p.dz * 6); look.set(p.x + p.dx * 60, gy + 5.5, p.z + p.dz * 60); }
  else { eye.set(p.x - p.dx * 70 + p.dz * 25, gy + 48, p.z - p.dz * 70 - p.dx * 25); look.set(p.x + p.dx * 90, gy + 4, p.z + p.dz * 90); }
  game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); } return true; };
  for (const id of ['ps-hud', 'title', 'loading']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  if (!window.__clShotCss) { window.__clShotCss = document.createElement('style'); window.__clShotCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; visibility: hidden !important; }'; document.head.appendChild(window.__clShotCss); }
  return { gy, district: game.city.districtAt?.(p.x, p.z), zone: game.city.zoneAt?.(p.x, p.z) };
})()`;

const SETTLED = `(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`;
const MEASURE = `new Promise((res) => {
  const r = game.renderer, ft = []; let last = performance.now(), n = 0;
  const step = () => { const t = performance.now(); ft.push(t - last); last = t; if (++n < 150) requestAnimationFrame(step); else {
    ft.shift(); ft.sort((x, y) => x - y); const avg = ft.reduce((s, v) => s + v, 0) / ft.length;
    res({ calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length || 0,
      frameMsAvg: +avg.toFixed(2), frameMsP95: +ft[Math.floor(ft.length * 0.95)].toFixed(2), frameMsMax: +ft[ft.length - 1].toFixed(2), fps: +(1000 / avg).toFixed(1),
      stream: game.city.streamer ? { near: game.city.streamer.stats.near, mid: game.city.streamer.stats.mid, far: game.city.streamer.stats.far } : null });
  } };
  requestAnimationFrame(step);
})`;

let bad = false;
await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 235) }, async (b) => {
  await b.goto(o.url || 'http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 150);
  if (o.pre) console.log('PRE', JSON.stringify(await b.eval(String(o.pre))));
  for (const id of want) {
    const v = VIEWS.find((q) => q.id === id); if (!v) continue;
    if (!poses[id]) { poses[id] = await b.eval(RESOLVE(v)); poses[id].label = v.label; }
    for (const hour of hours) for (const angle of angles) {
      const info = await b.eval(STAGE(poses[id], angle, hour));
      await b.sleep(1200);
      try { await b.waitFor(SETTLED, +(o.settleWait || 45)); } catch (e) { console.log('  (stream not settled)', id); }
      await b.sleep(+(o.settle || 2500));
      // re-stage: a save load or the clock can move the hour after the first staging
      await b.eval(STAGE(poses[id], angle, hour));
      await b.sleep(3000);
      console.log('  hour', await b.eval('game.timeOfDay'));
      const m = o.nomeasure ? { calls: await b.eval('game.renderer.info.render.calls'), triangles: await b.eval('game.renderer.info.render.triangles') } : await b.eval(MEASURE);
      const tag = `${id}_${angle}_${String(hour).replace('.', 'h')}`;
      const file = path.join(OUT, SET, tag + '.png');
      let shot = false; for (let k = 0; k < 3 && !shot; k++) { try { await b.screenshot(file); shot = true; } catch (e) { const r = await b.send('Page.captureScreenshot', { format: 'png' }); console.log('  screenshot retry', tag, JSON.stringify(r.error || r.result?.exceptionDetails || Object.keys(r)).slice(0, 200)); await b.sleep(1500); } }
      m.shot = shot;
      metrics.views[tag] = { ...m, ...info, street: poses[id].name };
      console.log(tag, JSON.stringify(metrics.views[tag]));
    }
  }
  if (b.errors.length) { console.log('CONSOLE ERRORS (' + b.errors.length + '):\n' + [...new Set(b.errors)].slice(0, 20).join('\n')); metrics.errors = [...new Set(b.errors)].slice(0, 40); bad = !o.allowErrors; }
});
fs.writeFileSync(posesFile, JSON.stringify(poses, null, 1));
fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 1));
process.exit(bad ? 1 : 0);
