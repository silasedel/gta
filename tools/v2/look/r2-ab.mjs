#!/usr/bin/env node
// r2-look in-session A/B (game.lookR2 = false = the overnight look3, true = round 2): still shots at a few spots, a
// convertible cruise with consecutive-frame grabs (shadow flicker), perf medians per mode.
//   node tools/v2/look/r2-ab.mjs [--tag ab1] [--hour 10] [--only nico,drive,downtown,probes,perf]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'ab', HOUR = +(o.hour || 10), D = 'docs/v2/shots/r2look'; fs.mkdirSync(`${D}/frames`, { recursive: true });
const only = (o.only || 'nico,drive,downtown,probes,perf').split(',');
const MODES = [['old', 'false'], ['new', 'true']];
const rep = { tag: TAG, hour: HOUR, perf: {}, errors: [] };
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 1100) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`);
  for (const f of ['grab', 'drive', 'probes']) await b.eval(fs.readFileSync(`tools/v2/look/${f}.page.js`, 'utf8') + ';1');
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
    await b.eval(`JSON.stringify(window.__cruise(window.__car, -866, 4836, 90))`); await b.sleep(3000); await stream(10);
    for (const [m, v] of MODES) {
      await mode(v); await b.screenshot(`${D}/${TAG}_drive_${m}.png`);
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
