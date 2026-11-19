#!/usr/bin/env node
// r4-water: inland shoreline probe + shots. Brickell Ave swamp (user shot_02, ~(377, 1070)), 3 inland water edges next to roads,
// one ocean beach edge. Per spot: close / mid / top views at the requested hours, plus a data + rendered-height probe.
//   node tools/v2/water/r4_shore.mjs --tag before --q "r4water=0" [--hours 11,17.5] [--probe] [--ab]
// --ab: shoot each view twice in one session, toggling game.env.ocean.r4 (uniform uR4On) instead of reloading.
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const TAG = arg('tag', 'probe'),
  Q = arg('q', ''),
  HOURS = arg('hours', '11,17.5').split(',').map(Number);
const PROBE = process.argv.includes('--probe'),
  AB = process.argv.includes('--ab'),
  ONLY = arg('only', '');
const OUT = 'docs/v2/shots/water/r4',
  REP = `docs/v2/reports/water-r4-${TAG}.json`;
fs.mkdirSync(OUT, { recursive: true });
const SPOTS_F = 'tools/v2/water/r4_spots.json';
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (Q ? '&' + Q : ''));
  await startGame(b);
  const rep = { tag: TAG, q: Q, spots: null, probe: {}, shots: [] };
  // ---- spots: cached so before / after shoot the very same cameras
  let spots = fs.existsSync(SPOTS_F) ? JSON.parse(fs.readFileSync(SPOTS_F, 'utf8')) : null;
  if (spots && process.argv.includes('--respot')) {
    for (const k of ['inland1', 'inland2', 'inland3']) delete spots[k];
    spots._keep = true;
  }
  if (!spots || spots._keep) {
    const keep = spots;
    spots = JSON.parse(
      await b.eval(
        `(() => { const d = game.miamiData, c = game.city, rg = d.roadGraph, q = {};
      const roadD = (x, z) => { const r = rg.nearestEdge(x, z, q, 40); return r ? r.dist - r.edge.width / 2 : 99; };
      // a shore point: water cell with land within 6 m, a road within 25 m on the land side
      function shoreNear(x0, z0, R, kinds, step = 4, ok = null) { let best = null;
        for (let z = z0 - R; z <= z0 + R; z += step) for (let x = x0 - R; x <= x0 + R; x += step) {
          const wk = d.waterKindAt(x, z); if (!wk || (kinds && !kinds.test(wk))) continue;
          for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2, lx = x + Math.cos(an) * 6, lz = z + Math.sin(an) * 6; if (d.isWater(lx, lz)) continue;
            const rd = roadD(lx, lz); if (rd > 25) continue; const s = Math.hypot(x - x0, z - z0) + rd * 2;
            const cand = { s, x, z, lx, lz, an, wk, rd }; if (ok && !ok(cand)) continue;
            if (!best || s < best.s) best = cand; break; } }
        return best; }
      const out = { brickell: shoreNear(377, 1070, 80, null, 2) };
      // inland water edges next to roads, spread over the city (not sea)
      const seen = []; const inl = [];
      for (let z = -3000; z <= 6000 && inl.length < 3; z += 140) for (let x = -2500; x <= 2500 && inl.length < 3; x += 140) {
        const wk = d.waterKindAt(x, z); if (!wk || wk === 'sea') continue; if (seen.some(([a, b2]) => Math.hypot(a - x, b2 - z) < 1500)) continue;
        const okS = (s) => s.rd >= 2 && s.rd <= 20 && Math.abs(d.groundHeightAt(s.lx, s.lz)) < 0.6 && Math.abs(d.groundHeightAt(s.lx - (s.x - s.lx) * 1.5, s.lz - (s.z - s.lz) * 1.5)) < 0.6 && d.groundHeightAt(s.x, s.z) < 0; // bank on the ground, not on a bridge / ramp
        const s = shoreNear(x, z, 70, /canal|river|pond|lake|marsh/, 4, okS); if (!s) continue;
        seen.push([x, z]); inl.push(s); }
      inl.forEach((s, i) => { out['inland' + (i + 1)] = s; });
      // ocean beach: sea water next to sand with open water around
      for (let z = -2000; z <= 6000 && !out.beach; z += 100) for (let x = 1500; x <= 5000 && !out.beach; x += 100) {
        if (d.waterKindAt(x, z) !== 'sea') continue; let w = 0; for (let a = 0; a < 12; a++) if (d.isWater(x + Math.cos(a * 0.52) * 300, z + Math.sin(a * 0.52) * 300)) w++; if (w < 6) continue;
        for (let r = 4; r < 120 && !out.beach; r += 4) for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2, lx = x + Math.cos(an) * r, lz = z + Math.sin(an) * r;
          if (!d.isWater(lx, lz) && /sand|beach/.test(String(d.surfaceAt(lx, lz)))) { out.beach = { x: lx - Math.cos(an) * 6, z: lz - Math.sin(an) * 6, lx, lz, an, wk: 'sea' }; break; } } }
      return JSON.stringify(out); })()`,
        600000,
      ),
    );
    if (keep) {
      spots.brickell = keep.brickell;
      spots.beach = keep.beach;
    }
    fs.writeFileSync(SPOTS_F, JSON.stringify(spots, null, 1));
  }
  rep.spots = spots;
  console.log('spots', JSON.stringify(spots));
  await b.eval(
    '(() => { game.timeExternal = true; game.timeOfDay = 11; if (game.weather?.set) try { game.weather.set("clear"); } catch (e) {} return 1; })()',
  );
  for (const [name, s] of Object.entries(spots)) {
    if (!s || (ONLY && !ONLY.split(',').includes(name))) continue;
    // ux, uz: from land toward the water
    const dx = s.x - s.lx,
      dz = s.z - s.lz,
      dl = Math.hypot(dx, dz) || 1,
      ux = dx / dl,
      uz = dz / dl,
      tx = -uz,
      tz = ux;
    const cams = {
      close: [
        s.lx - ux * 4 + tx * 3,
        2.2,
        s.lz - uz * 4 + tz * 3,
        s.x + ux * 12,
        -0.3,
        s.z + uz * 12,
      ],
      mid: [
        s.lx - ux * 30 + tx * 10,
        14,
        s.lz - uz * 30 + tz * 10,
        s.x + ux * 25,
        -0.3,
        s.z + uz * 25,
      ],
      top: [s.lx + ux * 2 + 0.01, 38, s.lz + uz * 2, s.lx + ux * 2, -0.2, s.lz + uz * 2],
    };
    if (name === 'brickell') cams.user = [s.lx + 8, 5.5, s.lz + 22, s.x - 18, -0.4, s.z - 6];
    await b.eval(
      `(async () => { const P = game.player, x = ${s.lx - ux * 6}, z = ${s.lz - uz * 6}, y = game.miamiData.groundHeightAt(x, z) + 1.2;
      P.body.setTranslation({ x, y, z }, true); P.position.set(x, y, z);
      game.cameraOverride = (dt, cam) => { cam.position.set(${cams.mid.slice(0, 3)}); cam.position.y += 0; cam.lookAt(${cams.mid.slice(3)}); return true; };
      for (let i = 0; i < 160; i++) { if (!game.city.collidersReadyAt || game.city.collidersReadyAt(x, z)) break; await new Promise((r) => setTimeout(r, 250)); } return 1; })()`,
      120000,
    );
    await b.sleep(12000);
    if (PROBE)
      rep.probe[name] = JSON.parse(
        await b.eval(
          `(async () => { const T = await import('/node_modules/.vite/deps/three.js'); const d = game.miamiData;
      const rc = new T.Raycaster(); rc.far = 400; const dn = new T.Vector3(0, -1, 0);
      const ux = ${ux}, uz = ${uz}, tx = ${tx}, tz = ${tz}, cx = ${s.lx}, cz = ${s.lz}, res = { transects: [], map: [] };
      const meshes = []; game.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && o.name !== 'ocean' && o.name !== 'ocean:transmit' && o.geometry) { o.geometry.computeBoundingSphere?.(); const bs = o.geometry.boundingSphere; if (!bs) return; const c2 = bs.center.clone().applyMatrix4(o.matrixWorld); if (Math.hypot(c2.x - cx, c2.z - cz) < bs.radius * Math.max(1, o.matrixWorld.getMaxScaleOnAxis()) + 60) meshes.push(o); } });
      const mname = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return (o.name || '?') + '|' + ((m && m.name) || m?.type || ''); };
      for (const off of [-12, 0, 12]) { const tr = [];
        for (let k = -14; k <= 14; k += 0.5) { const x = cx + ux * k + tx * off, z = cz + uz * k + tz * off; rc.set(new T.Vector3(x, 60, z), dn);
          const hit = rc.intersectObjects(meshes, false).slice(0, 2).map((h) => [Math.round(h.point.y * 1000) / 1000, mname(h.object)]);
          tr.push({ k, w: d.isWater(x, z) ? 1 : 0, wk: d.waterKindAt(x, z), gh: Math.round(d.groundHeightAt(x, z) * 1000) / 1000, th: Math.round((d.terrainHeightAt ? d.terrainHeightAt(x, z) : 0) * 1000) / 1000, s: d.surfaceAt(x, z), hit }); }
        res.transects.push({ off, tr }); }
      // 2 m map, 96 x 96 m: W water (kind letter), . land, R road (< 0 road distance)
      const q = {}; for (let j = -24; j < 24; j++) { let row = ''; for (let i = -24; i < 24; i++) { const x = cx + i * 2, z = cz + j * 2, wk = d.waterKindAt(x, z);
        if (wk) row += wk[0].toUpperCase(); else { const r = d.roadGraph.nearestEdge(x, z, q, 10); row += r && r.dist < r.edge.width / 2 ? '=' : '.'; } } res.map.push(row); }
      const W = game.waves, f = W?.fresh; res.freshOn = !!W?.freshOn; res.waveShader = !!W?.shaderOn; res.sea = game.city.seaLevel;
      const fu = W?.uniforms?.uFreshRect?.value, ft = W?.uniforms?.tFresh?.value; if (fu && ft?.image?.data) { const fd = []; for (let k = -14; k <= 14; k += 2) { const x = cx + ux * k, z = cz + uz * k, i = Math.floor((x - fu.x) * fu.z * 256), j = Math.floor((z - fu.y) * fu.z * 256); fd.push(i >= 0 && j >= 0 && i < 256 && j < 256 ? ft.image.data[j * 256 + i] : -1); } res.fresh = fd; }
      res.hRect = game.env?.ocean?.uniforms?.uHRect?.value?.toArray?.(); res.meshes = meshes.length; return JSON.stringify(res); })()`,
          120000,
        ),
      );
    for (const h of HOURS) {
      await b.eval(`(() => { game.timeOfDay = ${h}; return 1; })()`);
      for (const [cn, c] of Object.entries(cams)) {
        await b.eval(
          `(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${c.slice(0, 3)}); cam.lookAt(${c.slice(3)}); return true; }; return 1; })()`,
        );
        await b.sleep(3500);
        const hh = String(h).replace('.', '');
        for (const v of AB ? [0, 1] : [null]) {
          if (v !== null) {
            await b.eval(
              `(() => { const o = game.env?.ocean; if (o?.setR4) o.setR4(${v}); return 1; })()`,
            );
            await b.sleep(1800);
          }
          const f = `${OUT}/${name}_${cn}_${hh}_${v === null ? TAG : v ? 'after' : 'before'}.jpg`;
          await b.screenshot(f, { format: 'jpeg', quality: 90 });
          rep.shots.push(f);
        }
      }
    }
  }
  rep.errors = [...new Set(b.errors)].slice(0, 20);
  rep.r4 = await b.eval('JSON.stringify(game.env?.ocean?.r4State || null)');
  fs.writeFileSync(REP, JSON.stringify(rep, null, 1));
  console.log('errors', rep.errors.length, rep.errors.slice(0, 5));
});
