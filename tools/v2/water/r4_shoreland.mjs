#!/usr/bin/env node
// r4-shoreland: real-Miami land-base banks (Brickell Ave swamp + 2 inland banks), flat ramp-leftover slabs, highway barrier and
// bridge barrier shots + a probe of the elevated chains / low concrete near the swamp.
//   node tools/v2/water/r4_shoreland.mjs --tag before [--q "r4shore=0&r4barrier=0"] [--probe] [--flagcheck "r4shore=0&r4barrier=0"]
// --flagcheck: boot once with those flags first (console errors only), then the normal run.
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('tag', 'probe'), Q = arg('q', ''), PROBE = process.argv.includes('--probe'), FC = arg('flagcheck', ''), ONLY = arg('only', '');
const OUT = 'docs/v2/shots/water/r4shore', REP = `docs/v2/reports/r4-shoreland-${TAG}.json`, SP = 'tools/v2/water/r4_shoreland_spots.json';
fs.mkdirSync(OUT, { recursive: true });
const R4 = JSON.parse(fs.readFileSync('tools/v2/water/r4_spots.json', 'utf8'));
await withBrowser({ width: 1280, height: 720, maxSeconds: 1700 }, async (b) => {
  const rep = { tag: TAG, q: Q, shots: [], probe: {} };
  if (FC) {
    await b.goto('http://127.0.0.1:5200/?mute=1&' + FC); await startGame(b);
    await b.eval(`(async () => { const P = game.player, x = 371, z = 1050, y = game.miamiData.groundHeightAt(x, z) + 1.5; P.body.setTranslation({ x, y, z }, true); P.position.set(x, y, z); return 1; })()`);
    await b.sleep(15000); rep.flagcheck = { q: FC, errors: [...new Set(b.errors)].slice(0, 20) }; b.errors.length = 0;
    console.log('flagcheck errors', rep.flagcheck.errors.length, rep.flagcheck.errors.slice(0, 4));
  }
  await b.goto('http://127.0.0.1:5200/?mute=1' + (Q ? '&' + Q : ''));
  await startGame(b);
  await b.eval('(() => { game.timeExternal = true; game.timeOfDay = 11; if (game.weather?.set) try { game.weather.set("clear"); } catch (e) {} return 1; })()');
  // ---- elevated spots (cached): a highway barrier on an open viaduct over land, a bridge barrier over water
  let spots = fs.existsSync(SP) ? JSON.parse(fs.readFileSync(SP, 'utf8')) : null;
  if (!spots) {
    spots = JSON.parse(await b.eval(`(() => { const net = window.__elevated.network, out = {};
      const pick = (ok, x0, z0) => { let best = null; for (const c of net.chains) for (let i = 6; i < c.n - 6; i++) { if (!ok(c, i)) continue; const d = Math.hypot(c.x[i] - x0, c.z[i] - z0); if (!best || d < best.d) best = { d, id: c.id, i, kind: c.kind }; } return best; };
      const run = (c, i, f) => { for (let k = i - 6; k <= i + 6; k++) if (!f(c, k)) return false; return true; };
      out.highway = pick((c, i) => /motorway|trunk/.test(c.kind) && run(c, i, (c, k) => c.type[k] === 2 && c.barR[k] && c.vis[k] && !c.water[k] && c.y[k] > 5 && c.y[k] < 12), 377, 1070);
      out.bridge = pick((c, i) => run(c, i, (c, k) => c.type[k] === 2 && c.barR[k] && c.vis[k] && c.water[k] && c.y[k] > 2.5), 377, 1070);
      return JSON.stringify(out); })()`, 120000));
    fs.writeFileSync(SP, JSON.stringify(spots, null, 1));
  }
  console.log('spots', JSON.stringify(spots));
  const go = async (x, z, wait = 12000) => {
    await b.eval(`(async () => { const P = game.player, x = ${x}, z = ${z}, y = Math.max(game.miamiData.groundHeightAt(x, z), 0) + 1.5; P.body.setTranslation({ x, y, z }, true); P.position.set(x, y, z);
      for (let i = 0; i < 160; i++) { if (!game.city.collidersReadyAt || game.city.collidersReadyAt(x, z)) break; await new Promise((r) => setTimeout(r, 250)); } return 1; })()`, 120000);
    await b.sleep(wait);
  };
  const shoot = async (name, c) => {
    await b.eval(`(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${c.slice(0, 3)}); cam.lookAt(${c.slice(3)}); return true; }; return 1; })()`);
    await b.sleep(3500); const f = `${OUT}/${name}_${TAG}.jpg`; await b.screenshot(f, { format: 'jpeg', quality: 90 }); rep.shots.push(f);
  };
  // ---- banks
  for (const name of ['brickell', 'inland1', 'inland2']) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    const s = R4[name], dx = s.x - s.lx, dz = s.z - s.lz, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl, tx = -uz, tz = ux;
    const cams = {
      close: [s.lx - ux * 4 + tx * 3, 2.2, s.lz - uz * 4 + tz * 3, s.x + ux * 12, -0.3, s.z + uz * 12],
      mid: [s.lx - ux * 30 + tx * 10, 14, s.lz - uz * 30 + tz * 10, s.x + ux * 25, -0.3, s.z + uz * 25],
      top: [s.lx + ux * 2 + 0.01, 38, s.lz + uz * 2, s.lx + ux * 2, -0.2, s.lz + uz * 2],
    };
    if (name === 'brickell') { cams.user = [s.lx + 8, 5.5, s.lz + 22, s.x - 18, -0.4, s.z - 6]; cams.low = [s.lx + 2, 1.0, s.lz + 10, s.x - 6, -0.2, s.z - 10]; cams.slabs = [377.01, 60, 1070, 377, 0, 1070]; }
    await go(s.lx - ux * 6, s.lz - uz * 6);
    if (PROBE) rep.probe[name] = JSON.parse(await b.eval(`(async () => { const T = await import('/node_modules/.vite/deps/three.js'); const d = game.miamiData, cx = ${s.lx}, cz = ${s.lz}, res = {};
      res.real = [[cx, cz], [${s.x}, ${s.z}]].map(([x, z]) => d.inRealMiami ? d.inRealMiami(x, z) : null);
      const rc = new T.Raycaster(); rc.far = 400; const dn = new T.Vector3(0, -1, 0), meshes = []; game.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && o.geometry && !/ocean/.test(o.name)) meshes.push(o); });
      const mn = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return (o.name || '?') + '|' + ((m && m.name) || ''); };
      // low concrete near the point: elevated-concrete hits under 0.6 m on a 2 m grid, 120 x 120 m
      const low = []; for (let z = cz - 60; z <= cz + 60; z += 2) for (let x = cx - 60; x <= cx + 60; x += 2) { rc.set(new T.Vector3(x, 40, z), dn); const h = rc.intersectObjects(meshes, false)[0]; if (h && /elevated-concrete/.test(mn(h.object)) && h.point.y < 0.6) low.push([x, z, +h.point.y.toFixed(2)]); }
      res.low = low.length; res.lowPts = low.slice(0, 400);
      // elevated chain samples within 80 m
      const net = window.__elevated.network, ch = []; for (const c of net.chains) { const rows = []; for (let i = 0; i < c.n; i++) if (Math.hypot(c.x[i] - cx, c.z[i] - cz) < 80) rows.push([i, +c.x[i].toFixed(1), +c.z[i].toFixed(1), +c.y[i].toFixed(2), +c.gY[i].toFixed(2), c.type[i], c.water[i], c.barL[i], c.barR[i], c.vis[i]]); if (rows.length) ch.push({ id: c.id, kind: c.kind, rows }); }
      res.chains = ch; return JSON.stringify(res); })()`, 180000));
    for (const [cn, c] of Object.entries(cams)) await shoot(`${name}_${cn}`, c);
  }
  // ---- barriers
  for (const name of ['highway', 'bridge']) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    const sp = spots[name]; if (!sp) continue;
    const f = JSON.parse(await b.eval(`(() => { const c = window.__elevated.network.chains.find((q) => q.id === ${sp.id}), i = ${sp.i}; return JSON.stringify({ x: c.x[i], z: c.z[i], y: c.y[i] + 0.05, tx: c.tx[i], tz: c.tz[i], vR: c.vR[i], gY: c.gY[i] }); })()`));
    const P = (ds, o, y) => [f.x + f.tx * ds - f.tz * o, y, f.z + f.tz * ds + f.tx * o];
    const cams = {
      deck: [...P(-6, f.vR - 2.6, f.y + 1.55), ...P(7, f.vR - 0.3, f.y + 0.55)],
      near: [...P(-1.6, f.vR - 1.4, f.y + 1.2), ...P(1.2, f.vR - 0.2, f.y + 0.4)],
      side: name === 'highway' ? [...P(-12, f.vR - 9, f.y + 1.7), ...P(5, f.vR, f.y + 0.5)] : [...P(-14, f.vR + 16, f.y + 0.5), ...P(2, f.vR, f.y + 0.2)],
    };
    await b.eval('(() => { if (game.player?.mesh) game.player.mesh.visible = false; if (game.player?.model) game.player.model.visible = false; return 1; })()');
    await go(f.x - f.tz * (f.vR - 2), f.z + f.tx * (f.vR - 2), 14000);
    for (const [cn, c] of Object.entries(cams)) await shoot(`${name}_${cn}`, c);
  }
  rep.errors = [...new Set(b.errors)].slice(0, 20);
  rep.fps = await b.eval('JSON.stringify(game.perf?.fps ?? game.fps ?? null)');
  fs.writeFileSync(REP, JSON.stringify(rep, null, 1)); console.log('errors', rep.errors.length, rep.errors.slice(0, 5));
});
