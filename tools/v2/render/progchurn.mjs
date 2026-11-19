#!/usr/bin/env node
// Program-churn probe (render track, Nov 18): the allocation profile showed three.js getProgram / getParameters /
// String.replace running per frame. This counts, over --secs of standing still and then of a camera pan: how often the
// lights state version changes (every lit material then re-derives its program), program count growth, and per frame
// the point / spot / shadow light counts the renderer sees.
//   node tools/v2/render/progchurn.mjs [--secs 10] [--q "&lightfade=0"]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SECS = +(o.secs || 10);
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.hour || 11)}; return 1; })()`,
  );
  await b.sleep(15000);
  const run = async (label) =>
    JSON.parse(
      await b.eval(
        `new Promise((res) => {
    const R = game.renderer, mats = new Set(); game.scene.traverseVisible((m) => { if (m.isMesh && m.material && !Array.isArray(m.material) && m.material.lights !== false && mats.size < 400) mats.add(m.material); });
    const M = [...mats]; const last = M.map((m) => R.properties.get(m).lightsStateVersion);
    let frames = 0, verChanges = 0, matChanges = 0, keyCalls = 0; const p0 = R.info.programs.length; const hashes = new Map();
    const wrapped = []; for (const m of M) if (typeof m.customProgramCacheKey === 'function' && Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) { const f = m.customProgramCacheKey; m.customProgramCacheKey = function () { keyCalls++; return f.call(this); }; wrapped.push([m, f]); }
    let lv = null; const t0 = performance.now();
    const f = () => { frames++;
      for (let i = 0; i < M.length; i++) { const v = R.properties.get(M[i]).lightsStateVersion; if (v !== last[i]) { matChanges++; last[i] = v; } }
      const v0 = R.properties.get(M[0])?.lightsStateVersion; if (lv !== null && v0 !== lv) verChanges++; lv = v0;
      let pl = 0, sl = 0, ps = 0, ss = 0, dl = 0, ds = 0; game.scene.traverseVisible((l) => { if (!l.isLight) return; if (l.isPointLight) { pl++; if (l.castShadow) ps++; } else if (l.isSpotLight) { sl++; if (l.castShadow) ss++; } else if (l.isDirectionalLight) { dl++; if (l.castShadow) ds++; } });
      const k = pl + '/' + ps + ' ' + sl + '/' + ss + ' ' + dl + '/' + ds; hashes.set(k, (hashes.get(k) || 0) + 1);
      if (performance.now() - t0 < ${SECS * 1000}) requestAnimationFrame(f); else { for (const [m, fn] of wrapped) m.customProgramCacheKey = fn; res(JSON.stringify({ label: '${label}', frames, mats: M.length, verChanges, matChanges, keyCallsPerFrame: +(keyCalls / frames).toFixed(1), newPrograms: R.info.programs.length - p0, lightSets: [...hashes] })); } };
    requestAnimationFrame(f); })`,
        120000,
      ),
    );
  console.log(JSON.stringify(await run('still')));
  await b.eval(
    `(() => { const P = game.player.position; let a = 0; game.cameraOverride = (dt, c) => { a += dt * 0.6; c.position.set(P.x + Math.sin(a) * 6, P.y + 2, P.z + Math.cos(a) * 6); c.lookAt(P.x, P.y + 1, P.z); return true; }; return 1; })()`,
  );
  console.log(JSON.stringify(await run('orbit')));
});
