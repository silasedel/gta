#!/usr/bin/env node
// r2-water drive tests (one browser, muted, short):
//   node tools/v2/water/drive.mjs --scene airboat|speedboat|beach|all [--q "boatphys=2&glades=1"] [--tag after] [--secs 8]
// airboat: Everglades sawgrass, spawn an airboat on the ground, enter, full throttle + a turn, chase-cam shots, exit
// speedboat: open bay water, the racer at full throttle through the swell, shots
// beach: a center console 45 m off a sand beach at full throttle toward it; reports where it stops (on the sand, not through it)
// Writes docs/v2/shots/water/<scene>_<tag>_<n>.jpg and prints a JSON report (speeds, fps, ground contact, console errors).
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SCENES = o.scene === 'all' || !o.scene ? ['airboat', 'speedboat', 'beach'] : String(o.scene).split(',');
const TAG = o.tag || 'after', Q = o.q ?? 'boatphys=2&glades=1', SECS = +(o.secs || 8);
const OUT = 'docs/v2/shots/water'; fs.mkdirSync(OUT, { recursive: true });
const FIX = o.spots ? JSON.parse(fs.readFileSync(o.spots, 'utf8')) : {}; // fixed spots per scene (same places for before / after)
const rep = { q: Q, tag: TAG, scenes: {} };
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/?mute&${Q}`);
  await startGame(b);
  await b.eval(`(() => { game.timeOfDay = 10.5; game.timeExternal = true; window.__wr = { fps: [] }; return 1; })()`);
  const hold = async (code, ms) => { await b.key(code, true); await b.sleep(ms); await b.key(code, false); };
  const tele = async (x, z, extra = '') => b.eval(`(async () => { const P = game.player; const y = game.city.groundHeightAt(${x}, ${z}) + 1.2; P.body.setTranslation({ x: ${x}, y: Math.max(y, game.city.seaLevel + 1.2), z: ${z} }, true); P.position.set(${x}, y, ${z}); ${extra}
    for (let i = 0; i < 120; i++) { if (!game.city.collidersReadyAt || game.city.collidersReadyAt(${x}, ${z})) break; await new Promise((r) => setTimeout(r, 250)); } return 1; })()`, 120000);
  const sample = () => b.eval(`(() => { const v = game.player.state.vehicle; const f = game.perf?.fps ?? null; window.__wr.fps.push(f);
    if (!v) return JSON.stringify({ inVehicle: false, fps: f }); const t = v.body.translation();
    return JSON.stringify({ kmh: +(v.speedKmh || 0).toFixed(1), x: +t.x.toFixed(1), y: +t.y.toFixed(2), z: +t.z.toFixed(1), ground: +(v.grounded || 0).toFixed(2), gk: v.groundKind || null, trim: +((v.trim || 0) * 57.3).toFixed(1), lean: +((v.lean || 0) * 57.3).toFixed(1), rpm: Math.round(v.rpm || 0), fps: f, water: game.city.isWater(t.x, t.z), sheet: game.gladesWater?.levelAt?.(t.x, t.z) ?? null }); })()`).then(JSON.parse);
  // chase camera behind the boat (low, like the game's)
  const chase = (dist = 9, hgt = 3.2, side = 0) => b.eval(`(() => { game.cameraOverride = (dt, cam) => { const v = game.player.state.vehicle || window.__boat; if (!v) return false; const t = v.body.translation(); const h = v.heading;
      cam.position.set(t.x - Math.sin(h) * ${dist} + Math.cos(h) * ${side}, t.y + ${hgt}, t.z - Math.cos(h) * ${dist} - Math.sin(h) * ${side}); cam.lookAt(t.x + Math.sin(h) * 4, t.y + 0.8, t.z + Math.cos(h) * 4); return true; }; return 1; })()`);
  for (const sc of SCENES) {
    const R = rep.scenes[sc] = { samples: [] };
    let n = 0; const shot = async () => R.shots = [...(R.shots || []), await b.screenshot(`${OUT}/${sc}_${TAG}_${n++}.jpg`, { format: 'jpeg', quality: 90 })];
    if (sc === 'airboat') {
      const spot = FIX[sc] || JSON.parse(await b.eval(`(() => { const c = game.city, T = c.terrain, L = T.LAYERS.map((l) => l.key), G = c.roadGraph; let best = null;
        for (let x = -7000; x <= 0 && !best; x += 160) for (let z = -6000; z <= 4000 && !best; z += 160) { const d = c.districtAt(x, z); if (!d || !/Everglades|Big Cypress/.test(d)) continue;
          let ok = 0; for (let i = 0; i < 9; i++) { const k = L[T.layerAt(x + (i % 3 - 1) * 40, z + ((i / 3 | 0) - 1) * 40)]; if (k === 'sawgrass' || k === 'marsh') ok++; } if (ok < 9) continue;
          const ne = G.nearestEdge(x, z, {}, 300); if (!ne || ne.dist < 50) continue; best = { x, z, rd: Math.round(ne.dist) }; }
        return JSON.stringify(best); })()`, 200000));
      R.spot = spot; if (!spot) { R.error = 'no glades spot'; continue; }
      await tele(spot.x, spot.z);
      await b.sleep(4000);
      await b.eval(`(() => { const g = game.city.groundHeightAt(${spot.x + 4}, ${spot.z}); window.__boat = game.vehicles.spawnBoat('airboat', { x: ${spot.x + 4}, z: ${spot.z} }, 0.6, { y: g + 0.35 }); return 1; })()`);
      await b.sleep(5000);
      R.loaded = await b.eval('!!(window.__boat && window.__boat.airVis)');
      await chase(10, 3.4, 4); await b.sleep(800); await shot();               // parked on the sawgrass
      await b.eval(`(() => { const v = window.__boat; game.cameraOverride = (dt, cam) => { const t = v.body.translation(), h = v.heading; cam.position.set(t.x + Math.cos(h) * 5.2 + Math.sin(h) * 2.5, t.y + 1.9, t.z - Math.sin(h) * 5.2 + Math.cos(h) * 2.5); cam.lookAt(t.x, t.y + 0.7, t.z); return true; }; return 1; })()`);
      await b.sleep(800); await shot();                                         // close-up: model, cage, rudders
      await b.eval('(() => { game.enterVehicle(window.__boat); return 1; })()'); await b.sleep(1800);
      R.entered = await b.eval('game.player.state.vehicle === window.__boat');
      await chase(7.5, 2.7, 0);
      await b.key('KeyW', true);
      for (let i = 0; i < SECS * 2; i++) { await b.sleep(500); R.samples.push(await sample()); if (i === 6) await shot(); if (i === Math.round(SECS)) await b.key('KeyD', true); if (i === Math.round(SECS) + 4) { await b.key('KeyD', false); await chase(8, 2.6, -5); await shot(); } }
      await b.key('KeyW', false); await chase(10, 3.4, 6);
      for (let i = 0; i < 6; i++) { await b.sleep(500); R.samples.push(await sample()); } await shot();
      await b.eval('(() => { game.exitVehicle(); return 1; })()'); await b.sleep(1500);
      R.exited = await b.eval('!game.player.state.inVehicle');
      // airboat stands along the glades roads (?glades=1): how many, and the nearest one's boats
      R.stands = JSON.parse(await b.eval(`(() => { const S = game.vehicles.boats ? (game.vehicles.boatNav, null) : null; const bs = game.vehicles.boats.filter((x) => x.isAirboat && x.site); const st = bs[0]?.site;
        return JSON.stringify({ standBoats: bs.length, near: st ? { x: Math.round(st.x), z: Math.round(st.z), road: st.road } : null }); })()`));
      // frame-time A/B in one session: the glades sheet water on / off (same camera, 4 s each, twice)
      if (await b.eval('!!game.gladesWater')) { await chase(9, 3.2, 3); const ab = [];
        for (const on of [true, false, true, false]) { await b.eval(`(() => { game.gladesWater.group.visible = ${on}; window.__ft = []; window.__ftl = performance.now(); const f = () => { const n = performance.now(); window.__ft.push(n - window.__ftl); window.__ftl = n; if (window.__ft.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
          await b.sleep(4000); ab.push({ on, ms: await b.eval('(() => { const a = window.__ft.slice(5).sort((x, y) => x - y); return +(a.reduce((s2, x) => s2 + x, 0) / a.length).toFixed(2); })()') }); }
        await b.eval('(() => { game.gladesWater.group.visible = true; return 1; })()'); R.abGlades = ab; }
    } else if (sc === 'speedboat' || sc === 'beach') {
      // open water: from the spawn, search a water point with 120 m of water around (speedboat) / 45 m off a sand beach (beach)
      const spot = FIX[sc] || JSON.parse(await b.eval(`(() => { const c = game.city, p = game.player.position; let best = null;
        for (let r = 200; r < 4000 && !best; r += 150) for (let k = 0; k < 24 && !best; k++) { const a = k / 24 * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (!c.isWater(x, z)) continue;
          if (${sc === 'speedboat'}) { let ok = true; for (let j = 0; j < 12 && ok; j++) { const b2 = j / 12 * Math.PI * 2; for (const d of [60, 120, 200]) if (!c.isWater(x + Math.cos(b2) * d, z + Math.sin(b2) * d)) { ok = false; break; } } if (ok) best = { x, z, h: a }; }
          else { for (let j = 0; j < 16 && !best; j++) { const b2 = j / 16 * Math.PI * 2; const sx = x + Math.cos(b2) * 45, sz = z + Math.sin(b2) * 45; if (c.isWater(sx, sz)) continue; const sf = c.surfaceAt(sx, sz) || ''; if (!/sand|beach/.test(sf)) continue;
            let w = 0; for (let d = 0; d < 40; d += 5) if (c.isWater(x + Math.cos(b2) * d, z + Math.sin(b2) * d)) w++; if (w < 8) continue; if (c.groundHeightAt(x, z) > c.seaLevel - 1.2) continue;
            { const RA = game.RAPIER || window.RAPIER; let blocked = false; for (const off of [-2, 0, 2]) { const ox = x - Math.sin(b2) * off, oz = z + Math.cos(b2) * off; const ray = new RA.Ray({ x: ox, y: c.seaLevel + 0.7, z: oz }, { x: Math.cos(b2), y: 0, z: Math.sin(b2) }); if (game.world.castRay(ray, 40, true)) blocked = true; } if (blocked) continue; } best = { x, z, h: Math.atan2(Math.cos(b2), Math.sin(b2)), beachX: sx, beachZ: sz }; } } }
        return JSON.stringify(best); })()`, 200000));
      R.spot = spot; if (!spot) { R.error = 'no spot'; continue; }
      await tele(spot.x, spot.z);
      await b.sleep(4000);
      const key = sc === 'speedboat' ? 'racer' : 'console';
      await b.eval(`(() => { window.__boat = game.vehicles.spawnBoat('${key}', { x: ${spot.x}, z: ${spot.z} }, ${sc === 'speedboat' ? spot.h + 1.2 : spot.h}); return 1; })()`);
      await b.sleep(4000);
      await b.eval('(() => { game.enterVehicle(window.__boat); return 1; })()'); await b.sleep(1800);
      R.entered = await b.eval('game.player.state.vehicle === window.__boat');
      await chase(sc === 'speedboat' ? 14 : 12, 3.6, sc === 'speedboat' ? 3 : 7);
      await b.key('KeyW', true);
      const N = sc === 'speedboat' ? SECS * 2 : 22;
      for (let i = 0; i < N; i++) { await b.sleep(500); R.samples.push(await sample()); if (sc === 'speedboat' && (i === 8 || i === N - 2)) await shot(); if (sc === 'beach' && (i === 6 || i === 12)) await shot(); if (sc === 'speedboat' && i === 10) await b.key('KeyA', true); if (sc === 'speedboat' && i === 13) await b.key('KeyA', false); }
      await b.key('KeyW', false);
      for (let i = 0; i < 6; i++) { await b.sleep(500); R.samples.push(await sample()); }
      await shot();
      if (sc === 'speedboat') { // boat physics cost A/B in one session: the boats' fixed hook, v1 vs v2 (all boats near the player)
        await b.eval(`(() => { const H = game.fixedHooks; const i = H.findIndex((f) => f.name === 'boatsFixed'); if (i < 0) return 0; const f0 = H[i]; window.__bf = { ms: 0, n: 0 };
          const w = function (dt) { const t = performance.now(); f0(dt); window.__bf.ms += performance.now() - t; window.__bf.n++; }; Object.defineProperty(w, 'name', { value: 'boatsFixed' }); H[i] = w; window.__bfOrig = f0; return 1; })()`);
        const ab = [];
        for (const mode of [1, 2, 1, 2]) { await b.eval(`(() => { (game.physics ||= {}).boatphys = ${mode}; window.__bf.ms = 0; window.__bf.n = 0; return 1; })()`); await b.sleep(3000);
          ab.push({ mode, msPerStep: await b.eval('+(window.__bf.ms / Math.max(1, window.__bf.n)).toFixed(3)'), boats: await b.eval('game.vehicles.boats.filter((x) => !x.frozen).length') }); }
        await b.eval(`(() => { delete game.physics.boatphys; const H = game.fixedHooks; const i = H.findIndex((f) => f.name === 'boatsFixed'); if (i >= 0 && window.__bfOrig) H[i] = window.__bfOrig; return 1; })()`);
        R.abPhys = ab;
      }
      if (sc === 'beach') R.final = JSON.parse(await b.eval(`(() => { const v = window.__boat, t = v.body.translation(); return JSON.stringify({ onSand: !game.city.isWater(t.x, t.z), surf: game.city.surfaceAt(t.x, t.z), ground: +game.city.groundHeightAt(t.x, t.z).toFixed(2), keelY: +(t.y - v.spec.draft).toFixed(2), beached: v.beached }); })()`));
      await b.eval('(() => { game.exitVehicle(); return 1; })()'); await b.sleep(1200);
      R.exited = await b.eval('!game.player.state.inVehicle');
    }
    { const f = R.samples.map((x) => x.fps).filter(Boolean); R.fps = f.length ? +(f.reduce((a2, x) => a2 + x, 0) / f.length).toFixed(1) : null; R.maxKmh = Math.max(0, ...R.samples.map((x) => x.kmh || 0)); }
    if (sc === 'stand') {
      // an airboat stand on the Tamiami-style glades roads: two airboats + the mossy pier landing; enter one and drive off
      const g = FIX.airboat || { x: -4280, z: 1040 }; await tele(g.x, g.z); await b.sleep(3000);
      const site = JSON.parse(await b.eval(`(() => { const S = game.boatSystem?.gladeSites || []; const p = game.player.position; let best = null, bd = 1e9;
        for (const s2 of S) { const d = Math.hypot(s2.x - p.x, s2.z - p.z); if (d < bd) { bd = d; best = s2; } }
        return JSON.stringify({ n: S.length, site: best ? { x: best.x, z: best.z, heading: best.heading, along: best.along, road: best.road } : null }); })()`));
      R.sites = site.n; R.site = site.site; if (!site.site) { R.error = 'no stands'; continue; }
      const st = site.site, rx = st.x - Math.sin(st.heading) * 14, rz = st.z - Math.cos(st.heading) * 14;
      await tele(rx, rz); await b.sleep(9000);
      R.standBoats = await b.eval(`game.vehicles.boats.filter((x) => x.isAirboat && x.site && Math.hypot(x.site.x - ${st.x}, x.site.z - ${st.z}) < 1).length`);
      R.pier = await b.eval(`(() => { const s2 = (game.boatSystem.gladeSites || []).find((q) => Math.hypot(q.x - ${st.x}, q.z - ${st.z}) < 1); return !!(s2 && s2.pier && s2.pier.mesh); })()`);
      await b.eval(`(() => { const s = ${JSON.stringify(st)}; game.cameraOverride = (dt, cam) => { const fx = Math.sin(s.heading), fz = Math.cos(s.heading); cam.position.set(s.x - fx * 9 + s.along[0] * 12, game.city.groundHeightAt(s.x, s.z) + 3.2, s.z - fz * 9 + s.along[1] * 12); cam.lookAt(s.x + fx * 3 + s.along[0] * 2, 0.6, s.z + fz * 3 + s.along[1] * 2); return true; }; return 1; })()`);
      await b.sleep(1200); await shot();
      const ok = await b.eval(`(() => { const v = game.vehicles.boats.find((x) => x.isAirboat && x.site && Math.hypot(x.site.x - ${st.x}, x.site.z - ${st.z}) < 1); if (!v) return false; window.__boat = v; game.enterVehicle(v); return true; })()`);
      R.entered = ok;
      if (ok) { await b.sleep(1500); await chase(7.5, 2.7, 2); await b.key('KeyW', true); for (let i = 0; i < 10; i++) { await b.sleep(500); R.samples.push(await sample()); if (i === 7) await shot(); } await b.key('KeyW', false);
        await b.sleep(2500); await b.eval('(() => { game.exitVehicle(); return 1; })()'); await b.sleep(1200); R.exited = await b.eval('!game.player.state.inVehicle'); }
    }
    if (sc === 'wade') {
      // a pickup driven through ~30 cm of water off a beach: should keep driving (drag, spray, wake), engine running
      const spot = FIX.wade || JSON.parse(await b.eval(`(() => { const c = game.city, p = game.player.position; let best = null;
        for (let r = 100; r < 4000 && !best; r += 60) for (let k = 0; k < 32 && !best; k++) { const a = k / 32 * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (!c.isWater(x, z)) continue;
          const bed = (qx, qz) => { const g = c.groundHeightAt(qx, qz), sb = c.seabed?.heightAt?.(qx, qz); return Number.isFinite(sb) ? Math.max(g, sb) : g; }; const d = c.seaLevel - bed(x, z); if (d < 0.2 || d > 0.4) continue; let ok = 0; for (let j = 1; j <= 6; j++) { const d2 = c.seaLevel - bed(x + Math.cos(a) * j * 4, z + Math.sin(a) * j * 4); if (c.isWater(x + Math.cos(a) * j * 4, z + Math.sin(a) * j * 4) && d2 > 0.15 && d2 < 0.5) ok++; } if (ok >= 5) { const RA = game.RAPIER, hit = game.world.castRay(new RA.Ray({ x, y: 4, z }, { x: 0, y: -1, z: 0 }), 10, true); const hy = hit ? 4 - (hit.timeOfImpact ?? hit.toi) : null; if (hy !== null && hy < c.seaLevel - 0.12 && hy > c.seaLevel - 0.5) best = { x, z, h: Math.atan2(Math.cos(a), Math.sin(a)) }; } }
        return JSON.stringify(best); })()`, 200000));
      R.spot = spot; if (!spot) { R.error = 'no shallow spot'; continue; }
      await tele(spot.x, spot.z); await b.sleep(3000);
      R.bedCollider = await b.eval(`(() => { const RA = game.RAPIER; const h = game.world.castRay(new RA.Ray({ x: ${spot.x}, y: 3, z: ${spot.z} }, { x: 0, y: -1, z: 0 }), 10, true); return h ? +(3 - (h.timeOfImpact ?? h.toi)).toFixed(2) : null; })()`);
      await b.eval(`(() => { const v = game.vehicles.spawn('pickup', new (game.camera.position.constructor)(${spot.x}, game.city.groundHeightAt(${spot.x}, ${spot.z}) + 1.2, ${spot.z}), ${spot.h}); window.__car = v; game.enterVehicle(v); return 1; })()`);
      await b.sleep(2000); await chase(9, 3, 4);
      await b.key('KeyW', true);
      for (let i = 0; i < 12; i++) { await b.sleep(500); R.samples.push(JSON.parse(await b.eval(`(() => { const v = window.__car, t = v.body.translation(); return JSON.stringify({ kmh: +(v.speedKmh ?? Math.abs(v.speed * 3.6) ?? 0).toFixed(1), y: +t.y.toFixed(2), wading: +(v.wading || 0).toFixed(2), depth: +(v.waterDepth || 0).toFixed(2), flooded: !!v.flooded, engineOn: !!v.engineOn, fps: game.perf?.fps ?? null }); })()`))); if (i === 6) await shot(); }
      await b.key('KeyW', false); await shot();
      await b.eval('(() => { game.exitVehicle(); game.cameraOverride = null; return 1; })()'); await b.sleep(1000);
      await b.eval('(() => { try { game.vehicles.remove(window.__car); } catch (e) {} return 1; })()');
    }
    if (sc === 'car') {
      // a sedan launched off a seawall into 4+ m of water: float, nose down, sink, settle (car water physics)
      const spot = FIX[sc] || JSON.parse(await b.eval(`(() => { const c = game.city, p = game.player.position; let best = null;
        for (let r = 150; r < 3000 && !best; r += 120) for (let k = 0; k < 24 && !best; k++) { const a = k / 24 * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (!c.isWater(x, z) || c.groundHeightAt(x, z) > c.seaLevel - 4) continue;
          let ok = true; for (let j = 0; j < 8 && ok; j++) { const b2 = j / 8 * Math.PI * 2; if (!c.isWater(x + Math.cos(b2) * 25, z + Math.sin(b2) * 25)) ok = false; } if (ok) best = { x, z }; }
        return JSON.stringify(best); })()`, 200000));
      R.spot = spot; if (!spot) { R.error = 'no spot'; continue; }
      await tele(spot.x + 30, spot.z); await b.sleep(3000);
      await b.eval(`(() => { const v = game.vehicles.spawn('sedan', new (game.camera.position.constructor)(${spot.x}, game.city.seaLevel + 2.2, ${spot.z}), 0.3); window.__car = v; v.body.setTranslation({ x: ${spot.x}, y: game.city.seaLevel + 2.2, z: ${spot.z} }, true); v.body.setLinvel({ x: Math.sin(0.3) * 7, y: 0, z: Math.cos(0.3) * 7 }, true);
        game.cameraOverride = (dt, cam) => { const t = v.body.translation(); cam.position.set(t.x + 9, game.city.seaLevel + 2.4, t.z - 6); cam.lookAt(t.x, game.city.seaLevel, t.z); return true; }; return 1; })()`);
      for (let i = 0; i < 28; i++) { await b.sleep(500); R.samples.push(JSON.parse(await b.eval(`(() => { const v = window.__car, t = v.body.translation(), r = v.body.rotation(); const q = new (game.camera.quaternion.constructor)(r.x, r.y, r.z, r.w); const f = new (game.camera.position.constructor)(0, 0, 1).applyQuaternion(q);
          return JSON.stringify({ y: +t.y.toFixed(2), pitch: +(Math.asin(f.y) * 57.3).toFixed(1), sub: +(v.submerged || 0).toFixed(2), air: v.cw ? v.cw.air.map((a) => +a.toFixed(2)) : null, fps: game.perf?.fps ?? null }); })()`)));
        if (i === 3 || i === 10 || i === 20) await shot(); }
      await b.eval('(() => { game.cameraOverride = null; return 1; })()'); await b.sleep(300);
      await b.eval('(() => { try { game.vehicles.remove(window.__car); } catch (e) {} return 1; })()');
    }
    await b.eval('(() => { game.cameraOverride = null; try { if (window.__boat && !game.player.state.inVehicle) game.vehicles.removeBoat(window.__boat); } catch (e) {} window.__boat = null; return 1; })()');
  }
  const fps = JSON.parse(await b.eval('JSON.stringify(window.__wr.fps.filter((f) => f))'));
  rep.fpsAvg = fps.length ? +(fps.reduce((s, f) => s + f, 0) / fps.length).toFixed(1) : null;
  rep.errors = [...new Set(b.errors)].slice(0, 20);
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/water-drive-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep).slice(0, 6000));
