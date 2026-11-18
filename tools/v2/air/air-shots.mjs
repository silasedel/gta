#!/usr/bin/env node
// r4-air check: boots the game muted with ?air=1, then: GA apron at Miami International (parked planes), the perimeter
// fence (gate + run + aerial), a full autopilot pattern in the prop plane (takeoff, loop, downwind, final, landing) as a
// frame sheet, and a floatplane water takeoff off Key Largo. Prints spawn / fence stats and console errors.
//   node tools/v2/air/air-shots.mjs [--only apron,fence,fly,water] [--q "&foo=1"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const ONLY = o.only ? String(o.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
const D = 'docs/v2/shots/air'; fs.mkdirSync(D, { recursive: true });
const AP = fs.readFileSync(new URL('./autopilot.page.js', import.meta.url), 'utf8');
const RW = { a: [-2000, 530], b: [-792, 572] };
const frames = [];
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => { try {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 17.4; game.weather?.set?.('clear', { instant: true }); return 1; })()`);
  await b.eval(AP + '; 1');
  const shot = async (name, wait = 1500) => { await b.sleep(wait); const f = `${D}/${name}.jpg`; await b.screenshot(f); console.log('shot', f); return f; };
  const camAt = (cx, cy, cz, tx, ty, tz, fov = 50) => b.eval(`(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${cx}, ${cy}, ${cz}); cam.up.set(0, 1, 0); cam.lookAt(${tx}, ${ty}, ${tz}); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
  // ---- MIA: wait for the apron planes + fence
  await b.eval(`game.teleport(-1300, undefined, 960, 0)`);
  await b.waitFor(`game.air && game.air.sites[0].state === 'live' && game.air.sites[0].fence`, 150).catch((e) => console.log('WARN', e.message));
  await b.sleep(4000);
  const info = JSON.parse(await b.eval(`JSON.stringify({ cover: !!(game.city.coverAt || game.city.data?.coverAt), fence: game.air.fenceStats(), spots: game.air.sites[0].spotInfo, planes: game.air.list.map((A) => ({ k: A.typeKey, x: +A.S.pos.x.toFixed(1), y: +A.S.pos.y.toFixed(2), z: +A.S.pos.z.toFixed(1) })), gates: (game.air.sites[0].fence?.gates || []).slice(0, 6).map((g) => [Math.round(g.a.x), Math.round(g.a.z), Math.round(g.b.x), Math.round(g.b.z)]) })`));
  console.log('INFO', JSON.stringify(info));
  if (want('apron') && info.planes.length) {
    const ps = info.planes.filter((p) => Math.hypot(p.x - info.planes[0].x, p.z - info.planes[0].z) < 200);
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.z, 0) / ps.length;
    await camAt(cx + 38, 9, cz + 30, cx, 1.5, cz, 50); await shot('r4air_apron');
    const p0 = info.planes[0]; await camAt(p0.x + 7, 2.2, p0.z + 6.5, p0.x, 1.3, p0.z, 45); await shot('r4air_prop_close');
    const fp = info.planes.find((p) => p.k === 'floatplane'); if (fp) { await camAt(fp.x - 8, 2.8, fp.z + 7, fp.x, 1.8, fp.z, 45); await shot('r4air_floatplane_apron'); }
    const bj = info.planes.find((p) => p.k === 'bizjet'); if (bj) { await camAt(bj.x + 20, 5, bj.z + 18, bj.x, 2.5, bj.z, 45); await shot('r4air_bizjet'); }
  }
  if (want('fence')) {
    // a long straight run near the GA apron: posts from the instanced mesh, the camera outside the fence
    const pick = async (i0, tag) => {
      const r = JSON.parse(await b.eval(`JSON.stringify((() => { const F = game.air.sites[0].fence, im = F.group.getObjectByName('fence-posts'), M = new THREE_M(); const n = im.count; const P = (i) => { im.getMatrixAt(i, M); return [M.elements[12], M.elements[13], M.elements[14]]; };
        const pp = game.air.list[0].S.pos; let best = 0, bd = 1e9; for (let i = 0; i < n - 8; i += 3) { const a = P(i), c = P(i + 6); if (Math.hypot(c[0] - a[0], c[2] - a[2]) < 17 || Math.hypot(c[0] - a[0], c[2] - a[2]) > 19) continue; const d = Math.hypot(a[0] - pp.x, a[2] - pp.z) + (${i0}) * Math.random(); if (d < bd) { bd = d; best = i; } }
        const a = P(best), c = P(best + 6), L = Math.hypot(c[0] - a[0], c[2] - a[2]), ux = (c[0] - a[0]) / L, uz = (c[2] - a[2]) / L; let nx = -uz, nz = ux; if (F.inside(a[0] + nx * 6, a[2] + nz * 6)) { nx = -nx; nz = -nz; }
        return { a, ux, uz, nx, nz }; })())`.replace('THREE_M', 'game.camera.matrix.constructor')));
      return r;
    };
    const f = await pick(0);
    if (f) { const [x, y, z] = f.a;
      await b.eval(`game.teleport(${x + f.nx * 20}, undefined, ${z + f.nz * 20}, 0)`); await b.sleep(6000);
      await camAt(x + f.nx * 6 - f.ux * 7, y + 1.7, z + f.nz * 6 - f.uz * 7, x + f.ux * 6, y + 1.4, z + f.uz * 6, 55); await shot('r4air_fence_run', 2500);
      await camAt(x + f.nx * 1.6 + f.ux * 1.5, y + 1.9, z + f.nz * 1.6 + f.uz * 1.5, x + f.ux * 3.5 - f.nx * 0.3, y + 2.1, z + f.uz * 3.5 - f.nz * 0.3, 50); await shot('r4air_fence_close');
      await camAt(x + f.nx * 30, y + 14, z + f.nz * 30, x - f.nx * 40, y, z - f.nz * 40, 55); await shot('r4air_fence_high');
    }
    const g = info.gates[0];
    if (g) { const mx = (g[0] + g[2]) / 2, mz = (g[1] + g[3]) / 2, dx = g[2] - g[0], dz = g[3] - g[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      const out = await b.eval(`game.air.sites[0].fence.inside(${mx - uz * 8}, ${mz + ux * 8}) ? -1 : 1`); const nx = -uz * out, nz = ux * out;
      await b.eval(`game.teleport(${mx + nx * 20}, undefined, ${mz + nz * 20}, 0)`); await b.sleep(6000);
      const gy = await b.eval(`game.city.groundHeightAt(${mx}, ${mz})`);
      await camAt(mx + nx * 16 + ux * 4, gy + 2.2, mz + nz * 16 + uz * 4, mx - ux * 6, gy + 1.2, mz - uz * 6, 55); await shot('r4air_fence_gate', 2500);
    }
  }
  if (want('fly')) {
    await b.eval(`game.cameraOverride = null; 1`);
    const ok = await b.eval(`(() => { const A = game.air.list.find((x) => x.typeKey === 'prop'); if (!A) return 'no prop'; window.__A = A;
      const rw = ${JSON.stringify(RW)}, hd = Math.atan2(rw.b[0] - rw.a[0], rw.b[1] - rw.a[1]), S = A.S, gy = game.city.groundHeightAt(rw.a[0], rw.a[1]);
      S.pos.set(rw.a[0], gy + A.T.cg[1] + 0.02, rw.a[1]); S.q.setFromAxisAngle(S.pos.clone().set(0, 1, 0), hd); S.vel.set(0, 0, 0); S.w.set(0, 0, 0);
      A.body.setTranslation({ x: S.pos.x, y: S.pos.y, z: S.pos.z }, true); A.body.setRotation(S.q, true);
      game.teleport(rw.a[0] + 4, gy, rw.a[1] + 3, hd); return 'ok'; })()`);
    console.log('fly setup', ok);
    await b.sleep(7000);
    await b.eval(`(() => { game.enterVehicle(window.__A); return 1; })()`);
    await b.sleep(2500);
    await b.eval(`(() => { window.__airAP(window.__A, ${JSON.stringify(RW)}, { loop: true, loopAlt: 230 }); return 1; })()`);
    let lastPhase = '', lastShot = 0; const t0 = Date.now();
    for (;;) {
      await b.sleep(1000);
      const s = JSON.parse(await b.eval(`JSON.stringify({ p: __ap.phase, tp: __ap.tp, t: __ap.t, kmh: Math.round(__A.S.vel.length() * 3.6), alt: Math.round(__A.S.agl), dmg: +__A.S.damage.toFixed(2), g: +__A.S.g.toFixed(1), inV: game.player.state.vehicle === __A, fx: game.air.fx.stats() })`));
      const el = (Date.now() - t0) / 1000;
      const take = (s.p !== lastPhase && !['stopped'].includes(lastPhase)) || (s.p === 'loop' && el - lastShot > 2.4) || (el - lastShot > 14 && s.p !== 'downwind') || (el - lastShot > 30);
      if (take) { const f = await shot(`r4air_fly_${String(frames.length).padStart(2, '0')}_${s.p}`, 0); frames.push({ f, label: `${s.p} ${s.kmh} km/h ${s.alt} m${s.g > 1.6 ? ' ' + s.g + ' g' : ''}` }); lastShot = el; console.log('state', JSON.stringify(s)); }
      lastPhase = s.p;
      if (s.p === 'stopped' || s.dmg >= 1 || el > 420) { console.log('dmgLog', await b.eval('JSON.stringify(__A.dmgLog || [])')); console.log('end', JSON.stringify(s), JSON.stringify(await b.eval('JSON.stringify(__ap.log)')), JSON.stringify(await b.eval('JSON.stringify(__ap.td)'))); break; }
    }
    await b.eval(`(() => { window.__A.ap = null; game.exitVehicle(); return 1; })()`);
  }
  if (want('water')) {
    await b.eval(`game.cameraOverride = null; game.teleport(-836, undefined, 5272, 0); 1`);
    await b.waitFor(`game.air.sites.find((s) => s.id === 'keylargo').state === 'live'`, 120).catch((e) => console.log('WARN', e.message));
    await b.sleep(5000);
    const m = JSON.parse(await b.eval(`JSON.stringify((() => { const s = game.air.sites.find((s) => s.id === 'keylargo'); const A = s.planes[0]; window.__F = A; return { spot: s.spotInfo, n: s.planes.length, x: A && A.S.pos.x, z: A && A.S.pos.z, h: A && Math.atan2(new A.S.pos.constructor(0, 0, 1).applyQuaternion(A.S.q).x, new A.S.pos.constructor(0, 0, 1).applyQuaternion(A.S.q).z) }; })())`));
    console.log('mooring', JSON.stringify(m));
    if (m.n) {
      await camAt(m.x + Math.sin(m.h + 2.2) * 16, 3.5, m.z + Math.cos(m.h + 2.2) * 16, m.x, 1.2, m.z, 45); await shot('r4air_keys_moored', 3000);
      // clear water ahead? pick the heading with the longest open water run
      const hd = await b.eval(`(() => { const A = window.__F, p = A.S.pos; let best = 0, bl = -1; for (let a = 0; a < 6.283; a += 0.13) { let l = 0; while (l < 900 && game.city.isWater(p.x + Math.sin(a) * l, p.z + Math.cos(a) * l)) l += 10; if (l > bl) { bl = l; best = a; } } A.S.q.setFromAxisAngle(p.clone().set(0, 1, 0), best); A.body.setRotation(A.S.q, true); return best; })()`);
      await b.eval(`(() => { game.player.position.set(window.__F.S.pos.x, 0, window.__F.S.pos.z); game.enterVehicle(window.__F); return 1; })()`);
      await b.sleep(2500);
      await b.eval(`(() => { window.__airAP(window.__F, { a: [0, 0], b: [Math.sin(${hd}), Math.cos(${hd})] }, { water: true }); return 1; })()`);
      const wf = [];
      for (let i = 0; i < 12; i++) { await b.sleep(i < 3 ? 2500 : 1400); const s = JSON.parse(await b.eval(`JSON.stringify({ p: __ap.phase, kmh: Math.round(__F.S.vel.length() * 3.6), alt: Math.round(__F.S.agl), water: __F.S.onWater, fx: game.air.fx.stats() })`)); const f = await shot(`r4air_water_${String(i).padStart(2, '0')}`, 0); wf.push({ f, label: `${s.p} ${s.kmh} km/h ${s.alt} m${s.water ? ' on water' : ''}` }); console.log('water', JSON.stringify(s)); }
      fs.writeFileSync(`${D}/water_frames.json`, JSON.stringify(wf));
    }
  }
  fs.writeFileSync(`${D}/fly_frames.json`, JSON.stringify(frames));
  console.log('perf', await b.eval(`JSON.stringify({ fps: game.perf?.fps, calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles })`));
  } catch (e) { console.log('SCRIPT ERROR', String(e).slice(0, 600)); }
  console.log('physicsDead', await b.eval('String(game.physicsDead || "")').catch(() => '?'));
  console.log('CONSOLE ERRORS', b.errors.length, JSON.stringify(b.errors.slice(0, 12)).slice(0, 4000));
});
