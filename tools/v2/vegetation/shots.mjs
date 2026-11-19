#!/usr/bin/env node
// Vegetation shots: node tools/v2/vegetation/shots.mjs --set <name> --spots spots.json [--ab "&veglib=0"] [--w 1600 --h 900]
// A spot: { "at": [px, pz], "eye": [x, y, z] | "eyeRel": [dx, dy, dz], "look": [x, y, z] | "lookRel": [...], "tod": 11 }
// Teleports the player to `at` (tiles + countryside stream around it), waits until streaming settles, fixes the camera,
// measures 3 s of frames (avg / p95 ms, draw calls, triangles), screenshot -> docs/v2/shots/vegetation/overnight/<set>_<id>.png
// --ab: a second pass with that query (same browser run) -> <set>B_<id>.png, for before / after in one run.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const DIR = path.resolve('docs/v2/shots/vegetation/overnight');
fs.mkdirSync(DIR, { recursive: true });
const SPOTS = JSON.parse(fs.readFileSync(o.spots, 'utf8')),
  only = o.only ? String(o.only).split(',') : Object.keys(SPOTS);
const CAMS = {},
  SET = o.set || 'v',
  rep = { set: SET, when: new Date().toISOString(), runs: {} };
await withBrowser(
  { width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1500) },
  async (b) => {
    for (const [tag, q] of [['', o.q || ''], ...(o.ab ? [['B', o.ab]] : [])]) {
      await b.goto('http://127.0.0.1:5200/?mute' + q);
      const T0 = Date.now(),
        lg = (m) => console.log(`[${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
      lg('ready');
      await startGame(b);
      lg('started');
      await b.eval(
        `(() => { game.timeExternal = true; const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st); return 1; })()`,
      );
      const R = (rep.runs[tag || 'A'] = {});
      for (const id of only) {
        const s = { ...SPOTS[id] };
        if (!SPOTS[id]) continue;
        if (s.street)
          s.atExpr = `(() => { const G = game.city.roadGraph; const r = G.nearestEdge(${s.street[0]}, ${s.street[1]}, {}, 400); if (!r) return null; const e = r.edge, P = e.pts, i = Math.max(0, Math.floor(P.length / 2) - 1);
        const p = P[i], q = P[i + 1], px = p.x ?? p[0], pz = p.z ?? p[1], qx = q.x ?? q[0], qz = q.z ?? q[1], L = Math.hypot(qx - px, qz - pz) || 1, dx = (qx - px) / L, dz = (qz - pz) / L, off = e.width / 2 + ${s.side ?? 2.5};
        return [(px + qx) / 2 - dz * off, (pz + qz) / 2 + dx * off, Math.atan2(dz, dx)]; })()`;
        if (s.atExpr) {
          s.at = await b.eval(s.atExpr);
          console.log(id, 'at', JSON.stringify(s.at));
          if (!s.at) continue;
        }
        await b.eval(
          `(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 11; game.cameraOverride = null; game.teleport(s.at[0], undefined, s.at[1], s.heading ?? 0); return 1; })()`,
        );
        if (s.eval)
          console.log(
            id,
            'eval',
            JSON.stringify(await b.eval(s.eval).catch((e) => String(e).slice(0, 300))),
          );
        lg(id + ' teleported');
        let it = 0;
        for (let i = 0; i < 40; i++) {
          it = i;
          await b.sleep(1000);
          const ok = await b
            .eval(
              `(() => { const st = game.city.streamer; const cs = game.vegetation?.countryside?.stats?.(); return (!st || st.pending() === 0) && (!cs || !cs.pending); })()`,
            )
            .catch(() => false);
          if (ok && i > 3) break;
        }
        if (CAMS[id]) {
          s.eye = CAMS[id][0];
          s.look = CAMS[id][1];
        } // pass B: the very same camera as pass A
        CAMS[id] =
          await b.eval(`(() => { const s = ${JSON.stringify(s)}; const C = game.city; const gy = (x, z) => { const h = C.groundHeightAt(x, z); return Math.max(Number.isFinite(h) ? h : 0, C.isWater?.(x, z) ? (C.seaLevel ?? -0.12) : -1e9); }; // eyes over water stay above the surface
        if (s.at.length > 2) { const a = s.at[2] + (s.turn || 0), bk = s.back ?? 12; s.eyeRel = [-Math.cos(a) * bk, s.h ?? 2.4, -Math.sin(a) * bk]; s.lookRel = [Math.cos(a) * 14, s.lh ?? 1, Math.sin(a) * 14]; }
        const eye = s.eye || [s.at[0] + s.eyeRel[0], gy(s.at[0] + s.eyeRel[0], s.at[1] + s.eyeRel[2]) + s.eyeRel[1], s.at[1] + s.eyeRel[2]];
        const look = s.look || [s.at[0] + (s.lookRel ? s.lookRel[0] : 0), gy(s.at[0], s.at[1]) + (s.lookRel ? s.lookRel[1] : 1), s.at[1] + (s.lookRel ? s.lookRel[2] : 0)];
        if (s.hidePlayer && game.player?.mesh) game.player.mesh.visible = false;
        game.cameraOverride = (dt, cam) => { cam.position.fromArray(eye); cam.lookAt(look[0], look[1], look[2]); if (cam.fov !== (s.fov || 55)) { cam.fov = s.fov || 55; cam.updateProjectionMatrix(); } return true; }; return [eye, look]; })()`);
        lg(id + ' settled after ' + it);
        await b.sleep(2500);
        const perf = await b.eval(
          `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; (function f() { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 3000) requestAnimationFrame(f); else { ts.shift(); ts.sort((x, y) => x - y); const r = game.renderer.info.render; const cs = game.vegetation?.countryside?.stats?.() || {}; res({ avgMs: +(ts.reduce((x, y) => x + y, 0) / ts.length).toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(1), calls: r.calls, tris: r.triangles, csDraws: cs.drawCalls, csGenAvg: cs.genAvgMs, csGenMax: cs.genMaxMs, csRebucket: cs.rebucketAvgMs }); } })(); })`,
        );
        const f = path.join(DIR, `${SET}${tag}_${id}.png`);
        await b.screenshot(f);
        if (o.audit) {
          const au = await b
            .eval(`JSON.stringify(game.vegetation?.audit?.(${s.at[0]}, ${s.at[1]}, 220) || null)`)
            .catch((e) => String(e));
          perf.audit = au;
          console.log(tag || 'A', id, 'audit', au);
        }
        R[id] = perf;
        console.log(tag || 'A', id, JSON.stringify(perf));
      }
    }
    const errs = b.errors.filter((e) => !/favicon/.test(e));
    if (errs.length) console.log('ERRORS', errs.slice(0, 6).join('\n'));
  },
);
fs.writeFileSync(
  path.resolve('docs/v2/reports/vegetation-overnight-' + SET + '.json'),
  JSON.stringify(rep, null, 1),
);
