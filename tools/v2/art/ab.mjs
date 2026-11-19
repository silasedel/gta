#!/usr/bin/env node
// r2-art A/B street shots across page variants (geometry changes that need a reload, e.g. ?hiproof=0): same cameras, same hour.
//   [--bld "10-46:residential|beach"] [--style "deco|office"] [--crop] (also a 2x center-crop pair)
//   spots "name:x,z[:h0-h1]": a third field frames map buildings of that height (zones from --zones) instead of the road  frame map buildings in that height range / zone instead of the road
//   node tools/v2/art/ab.mjs --set roofs --a "&hiproof=0" --b "" --spots "grove:-440,2420;havana:-660,-55" [--per 2] [--hour 11]
// Per spot: the nearest road point, cameras at 1.8 m looking along the road both ways (+ 30 deg toward the curb side).
// Writes docs/v2/shots/art/<set>_<spot>_<k>_{a,b}.jpg and the pair docs/v2/shots/art/sheet_<set>_<spot>_<k>.jpg (q90).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : '';
  }
const SET = o.set || 'ab',
  DIR = path.resolve('docs/v2/shots/art');
fs.mkdirSync(DIR, { recursive: true });
const spots = String(o.spots || 'grove:-440,2420')
  .split(';')
  .map((s) => {
    const [n, xy, bh] = s.split(':');
    const [x, z] = xy.split(',').map(Number);
    return { n, x, z, bld: bh ? bh + ':' + (o.zones || '.') : o.bld };
  });
const per = +(o.per || 2);
let cams = null;
for (const [tag, q] of [
  ['a', o.a ?? ''],
  ['b', o.b ?? ''],
].filter(([t]) => !(o['only-b'] !== undefined && t === 'a'))) {
  // --only-b: reuse earlier 'a' frames (--prev-a <set>)
  await withBrowser(
    { width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 1200) },
    async (b) => {
      await b.goto('http://127.0.0.1:5200/?mute' + q);
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
      if (!(await startGame(b))) console.log('WARN: title did not close');
      await b.eval(
        `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); game.timeOfDay = ${+(o.hour || 11)}; return 1; })()`,
      );
      if (!cams) cams = {};
      for (const S of spots) {
        await b.eval(
          `(() => { game.cameraOverride = null; game.teleport(${S.x}, undefined, ${S.z}, 0); return 1; })()`,
        );
        await b.sleep(6000);
        for (let i = 0; i < 60; i++) {
          const n = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
          if (n < 3) break;
          await b.sleep(1000);
        }
        if (!cams[S.n] && S.bld)
          cams[S.n] =
            await b.eval(`(() => { // building-framed cameras: map buildings near the spot that match --bld (h range, zones), seen square-on from 24 m off their longest face
        const D = game.miamiData, TS = D.tileSize || 200, [h0, h1] = ${JSON.stringify(String(S.bld).split(':')[0].split('-').map(Number))}, zr = new RegExp(${JSON.stringify(String(S.bld).split(':')[1] || '.')});
        const out = [], seen = new Set();
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const t = D.getTile(Math.floor(${S.x} / TS) + dx, Math.floor(${S.z} / TS) + dz); for (const b of (t && t.buildings) || []) {
          if (seen.has(b.id) || !b.rings || b.rings[0].length > 12 || b.part || !(b.h >= h0 && b.h <= h1) || !zr.test(b.zone || '') || (${JSON.stringify(o.style || '')} && !new RegExp(${JSON.stringify(o.style || '.')}).test(b.style || ''))) continue; seen.add(b.id);
          const r = b.rings[0]; let best = null; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!best || L > best.L) best = { p, q, L }; }
          if (!best || best.L < 10) continue; let cx = 0, cz = 0; for (const [x, z] of r) { cx += x; cz += z; } cx /= r.length; cz /= r.length;
          const mx = (best.p[0] + best.q[0]) / 2, mz = (best.p[1] + best.q[1]) / 2; let nx = -(best.q[1] - best.p[1]) / best.L, nz = (best.q[0] - best.p[0]) / best.L; if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
          out.push({ d: Math.hypot(cx - ${S.x}, cz - ${S.z}), id: b.id, eye: [mx + nx * 24 + (best.q[0] - best.p[0]) / best.L * 6, 1.8, mz + nz * 24 + (best.q[1] - best.p[1]) / best.L * 6], look: [mx, Math.min(b.h * 0.45, 12), mz] }); } }
        return out.sort((a, c) => a.d - c.d).slice(0, ${per}); })()`);
        if (!cams[S.n])
          cams[S.n] =
            await b.eval(`(() => { const G = game.city?.roadGraph; let r = G?.nearestEdge?.(${S.x}, ${S.z}, {}, 300); if (!r || !r.point) return []; const p = r.point, d = r.dir || { x: 1, z: 0 }, w = (r.edge?.width || 8) / 2 + 1.5, out = [];
        for (const sg of [1, -1]) { const dx = d.x * sg, dz = d.z * sg, nx = -dz, nz = dx; const ex = p.x - dx * 4 + nx * w, ez = p.z - dz * 4 + nz * w; const c = Math.cos(0.5), s = Math.sin(0.5), lx = dx * c + nx * s, lz = dz * c + nz * s; out.push({ eye: [ex, 1.8, ez], look: [ex + lx * 30, 2.5, ez + lz * 30] }); }
        return out; })()`);
        const list = cams[S.n].slice(0, per);
        for (let k = 0; k < list.length; k++) {
          const c = list[k];
          await b.eval(`(() => { const c = ${JSON.stringify(c)}; const g = (x, z) => { try { const v = game.city?.groundHeightAt?.(x, z); return Number.isFinite(v) ? v : 0; } catch (e) { return 0; } };
          const e = [c.eye[0], g(c.eye[0], c.eye[2]) + c.eye[1], c.eye[2]], l = [c.look[0], g(c.look[0], c.look[2]) + c.look[1], c.look[2]];
          game.cameraOverride = (dt, cam) => { cam.position.fromArray(e); cam.lookAt(l[0], l[1], l[2]); return true; }; return 1; })()`);
          await b.sleep(4000);
          for (let i = 0; i < 20; i++) {
            const n = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
            if (n < 3) break;
            await b.sleep(1000);
          }
          await b.sleep(1500);
          await b.screenshot(path.join(DIR, `${SET}_${S.n}_${k}_${tag}.jpg`), { quality: 90 });
          console.log(tag, S.n, k);
        }
      }
      if (b.errors.length)
        console.log(`CONSOLE ERRORS (${tag})\n` + [...new Set(b.errors)].slice(0, 20).join('\n'));
    },
  );
}
for (const S of spots)
  for (let k = 0; k < per; k++) {
    const fa = path.join(DIR, `${o['prev-a'] || SET}_${S.n}_${k}_a.jpg`),
      fb = path.join(DIR, `${SET}_${S.n}_${k}_b.jpg`);
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) continue;
    const out = path.join(DIR, `sheet_${SET}_${S.n}_${k}.jpg`);
    execFileSync('python3', [
      '-I',
      path.resolve('tools/v2/art/pair.py'),
      fa,
      fb,
      out,
      S.n,
      'BEFORE ' + (o.a || '(default)'),
      'AFTER ' + (o.b || '(default)'),
    ]);
    if (o.crop !== undefined) {
      const oc = path.join(DIR, `sheet_${SET}_${S.n}_${k}_crop2x.jpg`);
      execFileSync('python3', [
        '-I',
        path.resolve('tools/v2/art/pair.py'),
        fa,
        fb,
        oc,
        S.n + ' 2x center crop',
        'BEFORE ' + (o.a || '(default)'),
        'AFTER ' + (o.b || '(default)'),
        'crop',
      ]);
      console.log('sheet', path.relative(process.cwd(), oc));
    }
    console.log('sheet', path.relative(process.cwd(), out));
  }
