#!/usr/bin/env node
// W2 per-car performance check in the vehicle sandbox (src/vehicles/drive.html, flat ground, fixed 60 Hz steps, no rendering):
// each car launches at full throttle on a straight, logs 0-100 km/h, 0-160 km/h, speed after 30 s (top speed, wrapped track),
// and 100-0 braking distance, next to the target from src/vehicles/glb/perf.js.
//   node tools/v2/cars/accel.mjs [--keys sedan1,coupe3,...]   -> docs/v2/reports/cars-accel.json
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
await withBrowser({ width: 640, height: 360, maxSeconds: 280 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/src/vehicles/drive.html?t=12&preload=all');
  await b.waitFor('window.game && game.vehicles && game.vehicles.list.length > 0', 120);
  await b.sleep(1500);
  const res = await b.eval(`(async () => {
    const { PERF } = await import('/src/vehicles/glb/perf.js');
    const V = game.vehicles, h = 1 / 60, THREE = game.THREE;
    const want = ${JSON.stringify(o.keys ? String(o.keys).split(',') : null)} || Object.keys(PERF).filter((k) => V.CAR_TYPES?.[k] || true);
    for (const v of V.list.slice()) { try { V.remove?.(v); } catch (e) {} v.body?.setEnabled?.(false); v.frozen = true; }
    const step = () => { for (const f of game.fixedHooks) f(h); game.world.step(); game.clock.elapsed += h; V.update(h); };
    const out = [];
    for (const key of want) {
      for (let w = 0; w < 400 && !(V.fleet?.loaded?.(key) ?? true); w++) await new Promise((r) => setTimeout(r, 50));
      let v = null; try { v = V.spawn(key, new THREE.Vector3(-360, 0, -300), Math.PI / 2, { exact: true, snap: false }); } catch (e) { out.push({ key, err: String(e).slice(0, 80) }); continue; }
      if (!v || v.typeKey !== key) { out.push({ key, err: 'spawn ' + (v && v.typeKey) }); if (v) V.remove?.(v); continue; }
      v.ai = null; v.playerDriven = true; v.engineOn = true; game.player.state.inVehicle = true; game.player.state.vehicle = v;
      for (let i = 0; i < 60; i++) { v.setControls({ throttle: 0, steer: 0, brake: 1 }); step(); }
      let t = 0, t100 = null, t160 = null, vmax = 0, dev = 0, dist = null;
      const kmh = () => { const l = v.body.linvel(); return Math.hypot(l.x, l.z) * 3.6; };
      const tick = (c) => { v.setControls(c); step(); const p = v.body.translation(); game.player.position.set(p.x, p.y, p.z);
        if (p.x > 370) v.body.setTranslation({ x: p.x - 720, y: p.y, z: p.z }, true); dev = Math.max(dev, Math.abs(p.z + 300)); return p; };
      // run 1: 0-100 then a full stop (100-0 distance)
      while (t < 40 && kmh() < 100) { tick({ throttle: 1, steer: 0, brake: 0 }); t += h; }
      t100 = kmh() >= 100 ? +t.toFixed(2) : null;
      { let d = 0, px = v.body.translation().x; for (let i = 0; i < 900 && kmh() > 0.5; i++) { const p = tick({ throttle: 0, steer: 0, brake: 1 }); let dx = p.x - px; if (dx < -300) dx += 720; d += dx; px = v.body.translation().x; } dist = +d.toFixed(1); }
      for (let i = 0; i < 60; i++) tick({ throttle: 0, steer: 0, brake: 1 });
      // run 2: top speed (30 s), 0-160
      t = 0;
      while (t < 30) { tick({ throttle: 1, steer: 0, brake: 0 }); t += h; const s = kmh(); vmax = Math.max(vmax, s); if (t160 == null && s >= 160) t160 = +t.toFixed(2); }
      const P = PERF[key] || {};
      out.push({ key, t100, target: P.t100, t160, top: Math.round(vmax), targetTop: P.vmax, brake100: dist, dev: +dev.toFixed(1), force: Math.round(v.spec.engine), mass: v.spec.mass, drive: v.spec.drive });
      game.player.state.inVehicle = false; game.player.state.vehicle = null; v.playerDriven = false;
      V.remove?.(v); if (V.list.includes(v)) { v.body.setEnabled?.(false); v.frozen = true; v.body.setTranslation({ x: 2000 + out.length * 30, y: 5, z: 2000 }, true); }
    }
    return JSON.stringify(out);
  })()`);
  const rows = JSON.parse(res);
  for (const r of rows)
    console.log(
      r.err
        ? `${r.key}: ${r.err}`
        : `${r.key.padEnd(8)} 0-100 ${String(r.t100).padStart(5)} (target ${r.target})  0-160 ${String(r.t160).padStart(5)}  top ${r.top} (${r.targetTop})  brake100 ${r.brake100} m  dev ${r.dev}  F ${r.force} N  ${r.mass} kg ${r.drive}`,
    );
  fs.mkdirSync('docs/v2/reports', { recursive: true });
  fs.writeFileSync('docs/v2/reports/cars-accel.json', JSON.stringify(rows, null, 1));
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 8));
});
