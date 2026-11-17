#!/usr/bin/env node
// r2-look in-session A/B (game.lookR2 = false = the overnight look3, true = round 2): still shots at a few spots, a
// convertible cruise with consecutive-frame grabs (shadow flicker), perf medians per mode.
//   node tools/v2/look/r2-ab.mjs [--tag ab1] [--hour 10] [--only nico,drive,downtown,probes,perf]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'ab', HOUR = +(o.hour || 10), D = 'docs/v2/shots/r2look'; fs.mkdirSync(`${D}/frames`, { recursive: true });
const only = (o.only || 'user,nico,drive,downtown,probes,perf').split(',');
const MODES = [['old', 'false'], ['new', 'true']];
const rep = { tag: TAG, hour: HOUR, perf: {}, errors: [] };
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 1100) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`);
  for (const f of ['grab', 'drive', 'probes']) await b.eval(fs.readFileSync(`tools/v2/look/${f}.page.js`, 'utf8') + ';1');
  // the city must have booted (a helper's half-saved module makes it fall back to an empty plane): abort, do not shoot
  const bad = b.errors.filter((e) => /\[miami\] failed|no city data|Failed to fetch dynamically imported/.test(e));
  if (bad.length) { console.log('CITY DID NOT BOOT, aborting:\n' + bad.join('\n')); process.exitCode = 3; return; }
  const stream = async (n = 40) => { for (let i = 0; i < n; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 3) break; await b.sleep(1000); } };
  const mode = async (v) => { await b.eval(`game.lookR2 = ${v}, game.env?.regenerateEnvMap?.(), 1`); await b.sleep(2200); };
  const cam = (e, l) => b.eval(`(() => { const g=(x,z)=>game.city?.groundHeightAt?.(x,z)??0; const e=${JSON.stringify(e)}, l=${JSON.stringify(l)}; const E=[e[0], g(e[0],e[2])+e[1], e[2]], L=[l[0], g(l[0],l[2])+l[1], l[2]]; game.cameraOverride=(dt,cam)=>{cam.position.fromArray(E); cam.lookAt(L[0],L[1],L[2]); return true;}; return 1; })()`);
  const free = () => b.eval('game.cameraOverride = null, 1');
  const both = async (name) => { for (const [m, v] of MODES) { await mode(v); await b.screenshot(`${D}/${TAG}_${name}_${m}.png`); } };
  await b.eval(`game.timeOfDay = ${HOUR}, 1`);
  if (only.includes('nico')) {
    // gameplay camera behind the player at Nico's lot (as in the user's shots 01 / 03), plus a high look over the lot
    await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), 1`); await b.sleep(5000); await stream();
    for (const [k, yaw] of [['nico_yaw0', 0], ['nico_yaw90', Math.PI / 2], ['nico_yaw180', Math.PI], ['nico_yaw270', -Math.PI / 2]]) {
      await free(); await b.eval(`(() => { game.cameraYaw = ${yaw}; game.cameraPitch = -0.12; return 1; })()`); await b.sleep(1500);
      await both(k);
    }
  }
  if (only.includes('mock')) {
    // the mock-up camera (tools/v2/keys/spots_refs.json r0b_deck: Nico's house-local frame, fov 51, 11:00)
    const R = JSON.parse(fs.readFileSync('tools/v2/keys/spots_refs.json', 'utf8')).r0b_deck;
    await b.eval(`(() => { const NH = game.nicoHouse; const p = NH.toWorld(new game.THREE.Vector3(${R.eye[0]}, 0, ${R.eye[2] + 3})); game.teleport(p.x, undefined, p.z, 0); game.timeOfDay = ${R.tod}; return 1; })()`);
    await b.sleep(5000); await stream();
    await b.eval(`(() => { const NH = game.nicoHouse, V = (a) => new game.THREE.Vector3(...a); const E = NH.toWorld(V(${JSON.stringify(R.eye)})), L = NH.toWorld(V(${JSON.stringify(R.look)}));
      game.cameraOverride = (dt, cam) => { cam.position.copy(E); cam.lookAt(L); if (cam.fov !== ${R.fov}) { cam.fov = ${R.fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
    await both('mock');
    await b.eval(`game.camera.fov = 55, game.camera.updateProjectionMatrix(), game.timeOfDay = ${HOUR}, 1`);
  }
  if (only.includes('beach')) {
    await b.eval(`game.teleport(2398, undefined, 660, 0), 1`); await b.sleep(5000); await stream();
    await cam([2380, 4, 640], [2450, 2.5, 700]); await both('beach');
  }
  if (only.includes('user')) {
    // the user's shot_01 / shot_03 framings, relative to where the truck and the convertible are parked today
    await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), 1`); await b.sleep(5000); await stream();
    const L = JSON.parse(await b.eval(`(() => { const P = game.player.position; const f = (re) => game.vehicles.list.filter(v => re.test(v.name||'') && !v.ai && Math.abs(v.speed||0) < 0.5).sort((a,b)=>a.mesh.position.distanceTo(P)-b.mesh.position.distanceTo(P))[0];
      const o = {}; for (const [k, re] of [['truck', /Ridgeback 2500/], ['conv', /Bayline 65/]]) { const v = f(re); const q = v.mesh.quaternion; const fw = new game.THREE.Vector3(0, 0, 1).applyQuaternion(q); o[k] = { p: [v.mesh.position.x, v.mesh.position.z], f: [fw.x, fw.z] }; } return JSON.stringify(o); })()`));
    { const { p, f } = L.truck, sx = -f[1], sz = f[0]; // shot_01: side-front three-quarter, 7 m out, eye 1.9 m
      await cam([p[0] + sx * 6.5 + f[0] * 3, 1.9, p[1] + sz * 6.5 + f[1] * 3], [p[0], 0.9, p[1]]); await both('user01_truck'); }
    { const { p, f } = L.conv; // shot_03: from behind-left and above, the car 6 m ahead
      await cam([p[0] - f[0] * 6 - f[1] * 3, 3.0, p[1] - f[1] * 6 + f[0] * 3], [p[0], 0.4, p[1]]); await both('user03_conv'); }
    { const { p, f } = L.conv; // shot_04: low side view of the convertible
      await cam([p[0] - f[1] * 6, 0.9, p[1] + f[0] * 6], [p[0], 0.7, p[1]]); await both('user04_conv'); }
  }
  if (only.includes('clouds')) {
    // ground cloud shadows (aerial + street, on / off) and the sky (old / new cumulus)
    await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), 1`); await b.sleep(4000); await stream();
    for (const [k, e, l] of [['clouds_aerial', [-700, 160, 4700], [-1000, 0, 5100]], ['clouds_street', [-866, 2, 4836], [-800, 1, 4900]]]) {
      await cam(e, l);
      for (const [m, v] of [['off', 'false'], ['on', 'true']]) { await b.eval(`game.lookCloudShadows = ${v}, 1`); await b.sleep(2200); await b.screenshot(`${D}/${TAG}_${k}_${m}.png`); }
    }
    await cam([-866, 2, 4836], [-700, 300, 4950]); await both('sky');
  }
  if (only.includes('probes')) {
    await b.eval(`game.teleport(-30, undefined, 4190, 0), 1`); await b.sleep(5000); await stream();
    const p = JSON.parse(await b.eval(`(() => { const P = game.player.position; return JSON.stringify([P.x + 4, P.z + 3]); })()`));
    await b.eval(`window.__probes(${p[0]}, ${p[1]}, 0), 1`);
    await cam([p[0] + 1.5, 1.4, p[1] - 4.5], [p[0], 0.45, p[1]]); await both('probes');
    await b.eval('window.__probesOff(), 1');
  }
  if (only.includes('downtown')) {
    await b.eval(`game.teleport(407, undefined, -110, 0), 1`); await b.sleep(6000); await stream();
    await cam([380, 22, -60], [430, 6, -140]); await both('downtown_high');
    await free(); await b.eval(`game.cameraYaw = 0.6, game.cameraPitch = -0.1, 1`); await b.sleep(1500); await both('downtown_street');
  }
  if (only.includes('drive')) {
    await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), 1`); await b.sleep(4000); await stream();
    await free();
    await b.eval(`(() => { const P = game.player.position; const v = game.vehicles.list.filter(v => /Bayline 65/.test(v.name||'')).sort((a,b)=>a.mesh.position.distanceTo(P)-b.mesh.position.distanceTo(P))[0]; game.enterVehicle(v); window.__car = v; return 1; })()`);
    await b.sleep(1000);
    for (const [m, v] of MODES) {
      await mode(v);
      await b.eval(`JSON.stringify(window.__cruise(window.__car, -30, 4190, 90, 160))`); await b.sleep(2500); await stream(15); // same start each mode (the beach road of shot_09)
      await b.eval(`JSON.stringify(window.__cruise(window.__car, -30, 4190, 90, 160))`); await b.sleep(3000);
      await b.screenshot(`${D}/${TAG}_drive_${m}.png`);
      const fr = await b.eval(`window.__grab(8, [460, 380, 1000, 700], 0.6)`);
      fr.forEach((u, i) => fs.writeFileSync(`${D}/frames/${TAG}_drive_${m}_${i}.jpg`, Buffer.from(u.split(',')[1], 'base64')));
    }
    await b.eval('window.__cruiseStop(window.__car), 1');
  }
  if (only.includes('perf')) {
    await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), game.exitVehicle?.(), 1`).catch(() => {}); await b.sleep(5000); await stream(); await free();
    await b.eval(fs.readFileSync('tools/v2/s1-perf.page.js', 'utf8'));
    for (let r = 0; r < 3; r++) for (const [m, v] of MODES) {
      await mode(v);
      const p = JSON.parse(await b.eval(`window.__pf.measure(2500).then(JSON.stringify)`));
      (rep.perf[m] ||= []).push({ med: p.med, gpu: p.gpuMs, render: p.renderMs, shadow: p.shadowMs, calls: p.calls });
    }
  }
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
});
fs.writeFileSync(`docs/v2/reports/r2look-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep.perf), rep.errors.length ? 'ERRORS\n' + rep.errors.join('\n') : 'no errors');
