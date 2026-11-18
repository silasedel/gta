#!/usr/bin/env node
// r3-people2 check: (1) foot cops sent to a spot behind a building: how often they stand on a building footprint, how close they get;
// (2) venue people in a convenience store stand on the interior floor.  node tools/v2/npcs/r3-cops.mjs [--q "&copnav=old"] [--shop]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const Q = o.q ?? ''; const D = 'docs/v2/shots/people/r3b'; fs.mkdirSync(D, { recursive: true });
await withBrowser({ width: 1280, height: 800, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; game.teleport(407, undefined, -110, 0); return 1; })()`);
  await b.sleep(25000);
  if (o.shop) {
    const st = JSON.parse(await b.eval(`JSON.stringify((game.interiors.list || []).filter((s) => /conv|gas/.test(s.type || '')).slice(0, 400).map((s) => ({ n: s.name, t: s.type, x: s.center.x, z: s.center.z, y: s.baseY })))`));
    console.log('stores', st.length);
    for (const s of st.slice(0, 6)) {
      await b.eval(`game.teleport(${s.x}, ${s.y + 0.5}, ${s.z}, 0)`); await b.sleep(14000);
      const r = await b.eval(`JSON.stringify((game.peds.list || []).filter((p) => p.active && p.v21).map((p) => ({ role: p.v21.role, dy: +(p.pos.y - p.v21.y).toFixed(3), y: +p.pos.y.toFixed(2) })))`);
      console.log(s.n, s.t, 'floor', s.y, r);
      if (JSON.parse(r).length) { await b.screenshot(`${D}/shop_${String(s.n).replace(/\W+/g, '_')}.jpg`); break; }
    }
  } else {
    const res = await b.eval(`(async () => {
      const C = game.city, sf = (x, z) => C.surfaceAt(x, z), pp = game.player.position, W = game.wanted;
      let A = null, B = null; const R = game.RAPIER, WD = game.world, F = R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS;
      const ray = (x, y, z, dx, dz, L) => { const h = WD.castRay(new R.Ray({ x, y, z }, { x: dx, y: 0, z: dz }), L, true, F); return h ? h.timeOfImpact : -1; };
      for (let t = 0; t < 3000 && !B; t++) {
        const ax = pp.x + (Math.random() - 0.5) * 160, az = pp.z + (Math.random() - 0.5) * 160; if (sf(ax, az) !== 'asphalt' && sf(ax, az) !== 'concrete' && sf(ax, az) !== 'pavers') continue;
        const y = (C.groundHeightAt?.(ax, az, 0) ?? 0) + 1.3, an = Math.random() * 6.283, dx = Math.sin(an), dz = Math.cos(an);
        const d1 = ray(ax, y, az, dx, dz, 60); if (d1 < 6 || d1 > 40) continue;
        const bx = ax + dx * (d1 + 22), bz = az + dz * (d1 + 22); if (C.isWater?.(bx, bz)) continue;
        const d2 = ray(bx, y, bz, -dx, -dz, 60); if (d2 < 10 || d2 > 40 || Math.abs((d1 + 22 - d2) - d1) > 14) continue;
        A = { x: ax, z: az }; B = { x: bx, z: bz };
      }
      if (!B) return JSON.stringify({ err: 'no pair', pp: [pp.x, pp.z], rap: !!R, wd: !!WD });
      W.level = 1; const P = game.police, us = [];
      const gy = C.groundHeightAt?.(A.x, A.z, 0) ?? 0;
      for (let i = 0; i < 4; i++) { const u = P.spawnCop({ x: A.x + i * 0.8, y: gy, z: A.z }, 0); if (u) us.push(u); }
      const st = us.map(() => ({ slow: 0, n: 0, minD: 1e9, stuck: 0 }));
      const t0 = performance.now();
      while (performance.now() - t0 < 30000) {
        await new Promise((r) => setTimeout(r, 250));
        us.forEach((u, i) => { if (!u.active || u.dead) return; u.wander = { x: B.x, y: 0, z: B.z, distanceTo() { return 0; } }; const q = st[i]; q.n++; if (u.speed < 0.6) q.slow++; q.minD = Math.min(q.minD, Math.hypot(u.pos.x - B.x, u.pos.z - B.z)); q.stuck = Math.max(q.stuck, u.stuckN || 0); });
      }
      return JSON.stringify({ A, B, dAB: Math.hypot(A.x - B.x, A.z - B.z) | 0, st, cops: us.length });
    })()`).catch((e) => String(e));
    console.log('pair', res);
  }
  console.log('errors', b.errors.length, b.errors.slice(0, 3));
});
