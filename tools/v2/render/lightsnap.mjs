#!/usr/bin/env node
// LIGHT SNAP PROBE (render track, Nov 18; user: "lighting snaps darker / brighter instantly").
// Fixed camera, the clock running; every frame: mean luma of the presented frame (64x36 copy of the canvas right after
// the game's render) + exposure, env intensity, sun / hemi intensity, auto-exposure comp, env-map regenerations, static
// shadow redraws. Prints every frame-to-frame luma step over --thr (default 2.5%) with what changed in that frame.
//   node tools/v2/render/lightsnap.mjs [--hour 18.2] [--secs 40] [--rate 1] [--view deck|street] [--q "&x=1"] [--tag t]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SECS = +(o.secs || 40), THR = +(o.thr || 0.025), TAG = o.tag || 'run';
const out = {};
await withBrowser({ width: 1280, height: 720, maxSeconds: SECS + 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeOfDay = ${+(o.hour || 18.2)};
    const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`);
  await b.sleep(15000);
  await b.eval(`(() => { const T = game.THREE, P = game.player.position, h = game.player.heading || 0;
    const E = [P.x - Math.sin(h) * 4, P.y + 2.2, P.z - Math.cos(h) * 4], L = [P.x + Math.sin(h) * 10, P.y + 0.8, P.z + Math.cos(h) * 10];
    game.cameraOverride = (dt, c) => { c.position.fromArray(E); c.lookAt(L[0], L[1], L[2]); return true; };
    const S = window.__ls = { rows: [], ev: [] }; const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36; const cx = cv.getContext('2d', { willReadFrequently: true });
    const env = game.env || {}; const pm = env.pmrem || null;
    // env regen marker: the scene.environment texture's version / identity
    let lastEnvV = -1, lastShadow = 0;
    const sun = env.sun, hemi = env.hemi;
    const loop = () => { requestAnimationFrame(loop);
      try { cx.drawImage(game.renderer.domElement, 0, 0, 64, 36); const d = cx.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const envTex = game.scene.environment; const ev = envTex ? (envTex.version || 0) + (envTex.uuid || '') : '';
        const R = game.renderer, sm = game.lookAE || {};
        S.rows.push([+(performance.now() / 1000).toFixed(3), +(s / (64 * 36)).toFixed(2), +R.toneMappingExposure.toFixed(4), +(game.scene.environmentIntensity ?? 0).toFixed(3), +(sun?.intensity ?? 0).toFixed(3), +(hemi?.intensity ?? 0).toFixed(3), +(sm.comp ?? 0).toFixed(3), ev !== lastEnvV ? 1 : 0, +(game.timeOfDay ?? 0).toFixed(3), +(game.post?.renderScale ?? 1).toFixed(2)]);
        lastEnvV = ev;
      } catch (e) { S.err = String(e); } };
    requestAnimationFrame(() => requestAnimationFrame(loop)); return 1; })()`);
  await b.sleep(SECS * 1000);
  const r = JSON.parse(await b.eval('JSON.stringify(window.__ls)'));
  out.rows = r.rows; out.err = r.err; out.errors = b.errors.slice(0, 10);
});
const R = out.rows || [];
const cols = ['t', 'luma', 'expo', 'envI', 'sunI', 'hemiI', 'aeComp', 'envNew', 'tod', 'scale'];
const steps = [];
for (let i = 1; i < R.length; i++) {
  const p = R[i - 1], q = R[i]; const d = (q[1] - p[1]) / Math.max(1, p[1]);
  if (Math.abs(d) > THR) { const ch = []; for (let c = 2; c < cols.length; c++) if (c === 7 ? q[c] : Math.abs(q[c] - p[c]) > 1e-3 * Math.max(1, Math.abs(p[c]))) ch.push(`${cols[c]} ${p[c]}->${q[c]}`); steps.push({ t: q[0], luma: `${p[1]}->${q[1]}`, pct: +(d * 100).toFixed(1), changed: ch.join(', ') }); }
}
const envRegens = R.filter((r) => r[7]).length;
console.log(JSON.stringify({ frames: R.length, envRegens, lumaRange: [Math.min(...R.map((r) => r[1])), Math.max(...R.map((r) => r[1]))], steps: steps.length, err: out.err }));
for (const s of steps.slice(0, 40)) console.log(s.t, s.luma, s.pct + '%', s.changed);
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/lightsnap-${TAG}.json`, JSON.stringify({ cols, steps, envRegens, rows: R.filter((_, i) => i % 3 === 0) }, null, 0));
