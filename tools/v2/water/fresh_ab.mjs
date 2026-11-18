#!/usr/bin/env node
// r2-water: freshwater A/B in one session (uFreshRect.w 0 = r2-ground's sea model, 1 = tannin freshwater), at a glades canal
// bank and a glades lake, eye height on the bank. -> docs/v2/shots/water/fresh_<spot>_{before,after}.jpg + sheet
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
await withBrowser({ width: 1280, height: 720, maxSeconds: 700 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await startGame(b);
  await b.eval('(() => { game.timeOfDay = 10.5; game.timeExternal = true; return 1; })()');
  const spotsOnly = process.argv.includes('--canal'); const spots = JSON.parse(await b.eval(`(() => { const c = game.city, GL = /^(Everglades|Everglades City|Big Cypress)$/; let canal = null, lake = null;
    for (let x = -7000; x <= 0 && !(canal && lake); x += 60) for (let z = -6000; z <= 4000 && !(canal && lake); z += 60) {
      if (!GL.test(c.districtAt(x, z) || '') || !c.isWater(x, z)) continue;
      let far = 0; for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; for (const r of [220, 450]) if (c.isWater(x + Math.cos(an) * r, z + Math.sin(an) * r)) far++; } if (far / 24 > 0.4) continue; // inland only
      let w = 0, land = null; for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; for (const r of [20, 60]) { const wx = x + Math.cos(an) * r, wz = z + Math.sin(an) * r; if (c.isWater(wx, wz)) w++; else if (!land && r === 20) land = [wx, wz, an]; } }
      if (!canal && land && w >= 10 && w <= 22) { const ux = x - land[0], uz = z - land[1], ul = Math.hypot(ux, uz) || 1, ox = land[0] - ux / ul * 6, oz = land[1] - uz / ul * 6, RA = game.RAPIER;
        let clear = !!RA; if (RA) for (const h of [1.9, 3.0]) { if (game.world.castRay(new RA.Ray({ x: ox, y: c.groundHeightAt(ox, oz) + h, z: oz }, { x: ux / ul, y: -0.05, z: uz / ul }), 35, true)) clear = false; for (const a of [-0.5, 0.5]) if (game.world.castRay(new RA.Ray({ x: ox, y: c.groundHeightAt(ox, oz) + h, z: oz }, { x: Math.cos(Math.atan2(uz, ux) + a), y: 0, z: Math.sin(Math.atan2(uz, ux) + a) }), 20, true)) clear = false; }
        if (clear) canal = { x, z, lx: land[0], lz: land[1], an: land[2] }; }
      if (!lake && w >= 30) { for (let r = 60; r < 400; r += 20) { const an = 0.7, lx = x + Math.cos(an) * r, lz = z + Math.sin(an) * r; if (!c.isWater(lx, lz)) { lake = { x, z, lx, lz, an }; break; } } }
    } return JSON.stringify({ canal, lake }); })()`, 300000));
  console.log(JSON.stringify(spots));
  const rep = { spots, shots: [] };
  for (const [name, s] of Object.entries(spots)) {
    if (!s) continue;
    // stand on the bank, 6 m back from the water's edge, looking across the water
    const dx = s.x - s.lx, dz = s.z - s.lz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, cx = s.lx - ux * 6, cz = s.lz - uz * 6;
    await b.eval(`(async () => { const P = game.player, y = game.city.groundHeightAt(${cx}, ${cz}) + 1.2; P.body.setTranslation({ x: ${cx}, y, z: ${cz} }, true); P.position.set(${cx}, y, ${cz});
      for (let i = 0; i < 120; i++) { if (!game.city.collidersReadyAt || game.city.collidersReadyAt(${cx}, ${cz})) break; await new Promise((r) => setTimeout(r, 250)); }
      game.cameraOverride = (dt, cam) => { const gy = game.city.groundHeightAt(${cx}, ${cz}); cam.position.set(${cx}, gy + 1.9, ${cz}); cam.lookAt(${cx + ux * 30}, gy - 0.6, ${cz + uz * 30}); return true; }; return 1; })()`, 120000);
    await b.sleep(9000);
    // now that the bank's colliders are streamed: slide along the bank / back off until the view across the water is clear
    const pick = JSON.parse(await b.eval(`(() => { const c = game.city, RA = game.RAPIER, ux = ${ux}, uz = ${uz}, tx = -uz, tz = ux;
      for (const back of [6, 3, 10]) for (const along of [0, 12, -12, 25, -25, 40, -40, 60, -60]) { const ox = ${s.lx} - ux * back + tx * along, oz = ${s.lz} - uz * back + tz * along; if (c.isWater(ox, oz)) continue;
        const y = c.groundHeightAt(ox, oz) + 1.9; let ok = true;
        for (const a of [-0.35, 0, 0.35]) { const dx = ux * Math.cos(a) - uz * Math.sin(a), dz = uz * Math.cos(a) + ux * Math.sin(a); if (game.world.castRay(new RA.Ray({ x: ox, y, z: oz }, { x: dx, y: -0.04, z: dz }), 30, true)) { ok = false; break; } }
        if (ok) return JSON.stringify({ ox, oz }); }
      return JSON.stringify(null); })()`));
    if (pick) await b.eval(`(() => { game.cameraOverride = (dt, cam) => { const gy = game.city.groundHeightAt(${pick.ox}, ${pick.oz}); cam.position.set(${pick.ox}, gy + 1.9, ${pick.oz}); cam.lookAt(${pick.ox} + ${ux} * 30, gy - 0.6, ${pick.oz} + ${uz} * 30); return true; }; return 1; })()`);
    rep[name + 'View'] = pick; await b.sleep(2500);
    for (const [tag, on] of [['before', 0], ['after', 1]]) {
      await b.eval(`(() => { const u = game.waves?.uniforms?.uFreshRect; if (u) u.value.w = ${on}; return !!u; })()`); await b.sleep(1200);
      rep.shots.push(await b.screenshot(`docs/v2/shots/water/fresh_${name}_${tag}.jpg`, { format: 'jpeg', quality: 90 }));
    }
  }
  rep.freshOn = await b.eval('!!game.waves?.freshOn'); rep.builds = await b.eval('game.waves?.fresh?.builds');
  rep.errors = [...new Set(b.errors)].slice(0, 10);
  fs.writeFileSync('docs/v2/reports/water-fresh-ab.json', JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep));
});
