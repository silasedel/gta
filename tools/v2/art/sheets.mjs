#!/usr/bin/env node
// r2-art before/after sheets of mixed scenes (a library model next to procedural geometry), in-session A/B:
// globalThis.__artCal(false) = materials as imported, true = calibrated (src/world/art/calibrate.js). Same frame, same light.
//   node tools/v2/art/sheets.mjs [--set r1] [--only downtown,beach,nico,rural,airport] [--hour 11] [--per 2] [--cams file.json]
// Cameras: fixed ones from --cams ({ name: { p:[x,z], eye:[x,h,z], look:[x,h,z] } }) and, per place, --per automatic ones
// framing the nearest library buildings (from __libBuildings.entries) from the street with their procedural neighbors.
// Writes docs/v2/shots/art/<set>_<cam>_{a,b}.jpg and the side-by-side sheet docs/v2/shots/art/sheet_<set>_<cam>.jpg (q90).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import { PLACES } from './places.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'r1',
  DIR = path.resolve('docs/v2/shots/art');
fs.mkdirSync(DIR, { recursive: true });
const only = o.only ? String(o.only).split(',') : Object.keys(PLACES);
const fixed = o.cams ? JSON.parse(fs.readFileSync(o.cams, 'utf8')) : {};
const pairs = [];
await withBrowser(
  { width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 1500) },
  async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(fs.readFileSync(new URL('./audit.page.js', import.meta.url), 'utf8'));
    await b.eval(
      `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); game.timeOfDay = ${+(o.hour || 11)}; return 1; })()`,
    );
    const jobs = [];
    for (const [n, c] of Object.entries(fixed)) jobs.push({ place: n, p: c.p, cams: { [n]: c } });
    for (const id of only)
      if (PLACES[id])
        jobs.push({
          place: id,
          p: PLACES[id].p,
          auto: +(o.per ?? 2),
          cams: Object.fromEntries(
            Object.entries(PLACES[id].cams || {}).map(([k, v]) => [
              id + '_' + k,
              { eye: [v[0], v[1], v[2]], look: [v[3], v[4], v[5]] },
            ]),
          ),
        });
    for (const J of jobs) {
      await b.eval(
        `(() => { game.cameraOverride = null; game.teleport(${J.p[0]}, undefined, ${J.p[1]}, 0); return 1; })()`,
      );
      await b.sleep(5000);
      for (let i = 0; i < 60; i++) {
        const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
        if (q < 3) break;
        await b.sleep(1000);
      }
      await b.sleep(2500);
      const cams = { ...J.cams };
      if (J.auto) {
        const auto =
          await b.eval(`(() => { const L = globalThis.__libBuildings; if (!L) return []; const P = [${J.p[0]}, ${J.p[1]}], out = [], used = [];
        const es = [...L.entries.values()].filter((e) => e.L && e.L.front && /house|shop|mid|rlow|ind|hangar|fixed|stilt/.test(e.cls)).map((e) => ({ e, d: Math.hypot(e.x - P[0], e.z - P[1]) })).filter((q) => q.d < 260).sort((p, q) => p.d - q.d);
        for (const { e } of es) { if (used.some((u) => Math.hypot(u[0] - e.x, u[1] - e.z) < 60)) continue; used.push([e.x, e.z]);
          const m = L.LIB[e.name], f = e.L.front, sd = [-f[1], f[0]], dep = (m.d * e.s) / 2, w = (m.w * e.s) / 2, back = dep + Math.max(14, Math.min(40, (m.h * e.sy) * 1.1 + w * 0.6));
          const look = [e.x - sd[0] * w * 0.25, Math.min(8, m.h * e.sy * 0.35), e.z - sd[1] * w * 0.25], cands = [];
          for (const [kb, ks] of [[1, 0.9], [1, -0.9], [1.5, 0.3], [0.8, 1.6], [0.8, -1.6]]) cands.push([e.x + f[0] * back * kb + sd[0] * w * ks, 1.8, e.z + f[1] * back * kb + sd[1] * w * ks]);
          out.push({ name: e.name, cands, look });
          if (out.length >= ${J.auto}) break; }
        return out; })()`);
        // line of sight: of 5 candidate eyes, keep the one where the library model covers the most of the frame (an overpass or a
        // tree in front of the lens otherwise makes a useless sheet)
        for (const c of auto) {
          let best = null,
            bestCov = -1;
          for (const eye of c.cands) {
            const cov =
              await b.eval(`(async () => { const g = (x, z) => { try { const v = game.city?.groundHeightAt?.(x, z); return Number.isFinite(v) ? v : 0; } catch (e) { return 0; } };
            const E = ${JSON.stringify(eye)}, Lk = ${JSON.stringify(c.look)}; const e = [E[0], g(E[0], E[2]) + E[1], E[2]], l = [Lk[0], g(Lk[0], Lk[2]) + Lk[1], Lk[2]];
            game.cameraOverride = (dt, cam) => { cam.position.fromArray(e); cam.lookAt(l[0], l[1], l[2]); return true; };
            await new Promise((r) => setTimeout(r, 400)); window.__artReset(); await window.__artCover('los', 0.25);
            let cv = 0; for (const m of window.__ART.mats.values()) { if ([...m.objs.keys()].some((o) => o.name === 'lib-${c.name}')) cv += m.cover.los || 0; } return cv; })()`);
            if (cov > bestCov) {
              bestCov = cov;
              best = eye;
            }
          }
          console.log('  los', c.name, (bestCov * 100).toFixed(1) + '%');
          if (bestCov > 0.04)
            cams[`${J.place}_auto${Object.keys(cams).length}_${c.name}`] = {
              eye: best,
              look: c.look,
            };
        }
      }
      for (const [cn, c] of Object.entries(cams)) {
        await b.eval(`(() => { const c = ${JSON.stringify(c)}; const g = (x, z) => { try { const v = game.city?.groundHeightAt?.(x, z); return Number.isFinite(v) ? v : 0; } catch (e) { return 0; } };
        const e = [c.eye[0], g(c.eye[0], c.eye[2]) + c.eye[1], c.eye[2]], l = [c.look[0], g(c.look[0], c.look[2]) + c.look[1], c.look[2]];
        game.cameraOverride = (dt, cam) => { cam.position.fromArray(e); cam.lookAt(l[0], l[1], l[2]); return true; }; return 1; })()`);
        await b.sleep(4000);
        for (let i = 0; i < 20; i++) {
          const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
          if (q < 3) break;
          await b.sleep(1000);
        }
        const fa = path.join(DIR, `${SET}_${cn}_a.jpg`),
          fb = path.join(DIR, `${SET}_${cn}_b.jpg`);
        const na = await b.eval('(globalThis.__artCal?.(false) ?? -1)');
        await b.sleep(1500);
        await b.screenshot(fa, { quality: 90 });
        const nb = await b.eval('(globalThis.__artCal?.(true) ?? -1)');
        await b.sleep(1500);
        await b.screenshot(fb, { quality: 90 });
        pairs.push([cn, fa, fb]);
        console.log(cn, 'materials toggled', na, nb);
      }
    }
    if (b.errors.length)
      console.log('CONSOLE ERRORS\n' + [...new Set(b.errors)].slice(0, 20).join('\n'));
  },
);
for (const [cn, fa, fb] of pairs) {
  const out = path.join(DIR, `sheet_${SET}_${cn}.jpg`);
  execFileSync('python3', ['-I', path.resolve('tools/v2/art/pair.py'), fa, fb, out, cn]);
  console.log('sheet', path.relative(process.cwd(), out));
}
