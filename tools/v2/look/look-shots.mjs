#!/usr/bin/env node
// Look helper: fixed-camera shots at set places / hours / weather, with in-session A/B variants (no reload between A and B).
//   node tools/v2/look/look-shots.mjs --set base [--only nico_deck,downtown] [--hours 11,18.5] [--variants "old:game.lookV3=false;new:game.lookV3=true"]
//        [--weather clear|wet] [--shimmer] [--q "&foo"]
// Spot eyes/looks are [x, heightAboveGround, z]. Writes docs/v2/shots/look/<set>_<spot>_<hour>[_<variant>].png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'look';
const DIR = path.resolve('docs/v2/shots/look'); fs.mkdirSync(DIR, { recursive: true });
const SPOTS = {
  nico_deck: { eye: [-871.5, 6.8, 4828.5], look: [-852, 1.2, 4858], player: [-866.1, 4836.4] },
  nico_street: { eye: [-852, 1.7, 4852], look: [-874, 3.5, 4826], player: [-866.1, 4836.4] },
  downtown: { eye: [380, 22, -60], look: [430, 6, -140], player: [407, -110] },
  beach: { eye: [2380, 4, 640], look: [2450, 2.5, 700], player: [2398, 660] },
  glades: { eye: [-2200, 14, -1100], look: [-2120, 2, -1180], player: [-2200, -1100] },
  ...(o.spots ? JSON.parse(fs.readFileSync(o.spots, 'utf8')) : {}),
};
const only = o.only ? String(o.only).split(',') : ['nico_deck', 'downtown', 'beach'];
const hours = o.hours ? String(o.hours).split(',').map(Number) : [11];
const variants = o.variants ? String(o.variants).split(';').map((s) => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; }) : [['', '']];
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q ?? '&look3'));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.lookAEInstant = true; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`);
  if (o.weather === 'wet') await b.eval(`(() => { game.weather.set('rain', { instant: true }); game.weather.set('clear', { seconds: 0.05 }); return 1; })()`);
  else if (o.weather && o.weather !== 'clear') await b.eval(`game.weather.set(${JSON.stringify(o.weather)}, { instant: true }), 1`);
  else await b.eval(`game.weather?.set?.('clear', { instant: true }), 1`);
  for (const id of only) {
    const s = SPOTS[id]; if (!s) { console.log('no spot', id); continue; }
    await b.eval(`(() => { const s = ${JSON.stringify(s)}; game.teleport(s.player[0], undefined, s.player[1], 0); return 1; })()`);
    await b.sleep(4000);
    for (let i = 0; i < +(o.stream || 40); i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.eval(`(() => { const s = ${JSON.stringify(s)}; const g = (x, z) => { try { return game.city?.groundHeightAt?.(x, z) ?? 0; } catch (e) { return 0; } };
      const e = [s.eye[0], g(s.eye[0], s.eye[2]) + s.eye[1], s.eye[2]], l = [s.look[0], g(s.look[0], s.look[2]) + s.look[1], s.look[2]];
      game.cameraOverride = (dt, cam) => { cam.position.fromArray(e); cam.lookAt(l[0], l[1], l[2]); return true; }; return 1; })()`);
    for (const h of hours) {
      await b.eval(`game.timeOfDay = ${h}, game.env?.regenerateEnvMap?.(), setTimeout(() => game.env?.setShadowQuality?.({}), 300), 1`);
      await b.sleep(2500);
      for (const [vn, ve] of variants) {
        if (ve) await b.eval(`(() => { ${ve}; game.env?.regenerateEnvMap?.(); return 1; })()`);
        await b.sleep(+(o.settle || 1800));
        const tag = `${SET}_${id}_${String(h).replace('.', 'h')}${vn ? '_' + vn : ''}`;
        const perf = await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 1500) requestAnimationFrame(f); else { const avg = ts.reduce((p, c) => p + c, 0) / ts.length; res(JSON.stringify({ fps: +(1000 / avg).toFixed(1), calls: game.renderer.info.render.calls, ae: game.lookAE ? [+(game.lookAE.avgLog ?? 0).toFixed(2), +game.lookAE.comp.toFixed(2)] : null, exp: +game.renderer.toneMappingExposure.toFixed(3) })); } }; requestAnimationFrame(f); })`);
        await b.screenshot(path.join(DIR, tag + '.png'));
        if (o.shimmer) { await b.sleep(400); await b.screenshot(path.join(DIR, tag + '_s2.png')); }
        rep.shots[tag] = JSON.parse(perf);
        console.log(tag, perf);
      }
    }
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/look-${SET}.json`, JSON.stringify(rep, null, 2));
