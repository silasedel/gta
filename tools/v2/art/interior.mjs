#!/usr/bin/env node
// r2-art interior before/after: walks into the storefront of a kind nearest a point and frames the back wall (lobby desk / counter).
//   node tools/v2/art/interior.mjs --set int1 [--a "&intart=0"] [--b ""] [--spots "lobby:2398,660:hotel;shop:407,-110:clothes|boutique|pharmacy"]
// Writes docs/v2/shots/art/<set>_<name>_{a,b}.jpg and sheet_<set>_<name>.jpg (q90).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : ''; }
const SET = o.set || 'int1', DIR = path.resolve('docs/v2/shots/art'); fs.mkdirSync(DIR, { recursive: true });
const spots = String(o.spots || 'lobby:2398,660:hotel|motel;shop:407,-110:clothes|boutique|pharmacy|liquor').split(';').map((s) => { const [n, xy, re] = s.split(':'); const [x, z] = xy.split(',').map(Number); return { n, x, z, re }; });
for (const [tag, q] of [['a', o.a ?? '&intart=0'], ['b', o.b ?? '']]) {
  await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 1500) }, async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute' + q);
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 13; game.weather?.set?.('clear', { instant: true }); const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`);
    for (const S of spots) {
      // nearest storefront of that kind; stand 2.5 m inside the door, look at the back wall
      const ok = await b.eval(`(() => { const L = game.city.storefronts || []; const re = new RegExp(${JSON.stringify(S.re)}); let f = null, bd = 1e12; for (const s of L) { if (!re.test(s.kind || '')) continue; const d = Math.hypot((s.fx ?? s.x) - ${S.x}, (s.fz ?? s.z) - ${S.z}); if (d < bd) { bd = d; f = s; } }
        if (!f) return null; window.__intF = f; const fx = f.fx ?? f.x, fz = f.fz ?? f.z, ox = Math.sin(f.facing || 0), oz = Math.cos(f.facing || 0);
        game.teleport(fx - ox * 1.2, undefined, fz - oz * 1.2, 0); return [f.kind, +fx.toFixed(1), +fz.toFixed(1)]; })()`);
      console.log(tag, S.n, JSON.stringify(ok)); if (!ok) continue;
      await b.sleep(15000);
      await b.eval(`(() => { const f = window.__intF, fx = f.fx ?? f.x, fz = f.fz ?? f.z, ox = Math.sin(f.facing || 0), oz = Math.cos(f.facing || 0), rx = -oz, rz = ox, gy = game.city.groundHeightAt(fx, fz) || 0;
        const e = [fx - ox * 0.9 + rx * 0.6, gy + 1.65, fz - oz * 0.9 + rz * 0.6], l = [fx - ox * 8, gy + 1.0, fz - oz * 8];
        game.cameraOverride = (dt, c) => { c.position.fromArray(e); c.lookAt(l[0], l[1], l[2]); return true; }; return 1; })()`);
      await b.sleep(6000);
      await b.screenshot(path.join(DIR, `${SET}_${S.n}_${tag}.jpg`), { quality: 90 });
    }
    if (b.errors.length) console.log(`CONSOLE ERRORS (${tag})\n` + [...new Set(b.errors)].slice(0, 12).join('\n'));
  });
}
for (const S of spots) { const fa = path.join(DIR, `${SET}_${S.n}_a.jpg`), fb = path.join(DIR, `${SET}_${S.n}_b.jpg`); if (!fs.existsSync(fa) || !fs.existsSync(fb)) continue;
  const out = path.join(DIR, `sheet_${SET}_${S.n}.jpg`); execFileSync('python3', ['-I', path.resolve('tools/v2/art/pair.py'), fa, fb, out, S.n, 'BEFORE ' + (o.a ?? '&intart=0'), 'AFTER']); console.log('sheet', path.relative(process.cwd(), out)); }
