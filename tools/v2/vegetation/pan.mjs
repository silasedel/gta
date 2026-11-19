#!/usr/bin/env node
// Far-tree crawl test: node tools/v2/vegetation/pan.mjs out_prefix [--rate 0.00025] [--n 10]
// Keys r5 aerial camera (nicoHouse-local), panning slowly (yaw per rendered frame). Three variants in one run, same path:
//   A = impostors as built, B = impostors without mips (aliased reference), C = impostors hidden (floor).
// Writes <out>_<v><i>.png frames; then: python3 tools/v2/keys/flicker.py heat.png frames... (temporal std-dev).
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  out = a[0] || 'pan',
  o = {};
for (let i = 1; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i];
const rate = +(o.rate || 0.00025),
  n = +(o.n || 10);
await withBrowser({ width: 1600, height: 900, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + ' && !!game.nicoHouse', 600);
  await startGame(b, 60);
  await b.eval(`(() => { const NH = game.nicoHouse, V = (p) => NH.toWorld(new game.THREE.Vector3(...p)); const e = V([-70, 48, 95]), l = V([-5, 0, 5]);
    game.timeOfDay = 11; try { game.teleport(e.x, undefined, e.z + 3, 0); } catch (x) {} window.__pan = { e, l, f: 0, on: false };
    const d0 = new game.THREE.Vector3().subVectors(l, e);
    game.cameraOverride = (dt, cam) => { const P = window.__pan; if (P.on) P.f++; const yaw = P.f * ${rate}, c = Math.cos(yaw), s = Math.sin(yaw);
      cam.position.copy(e); cam.lookAt(e.x + d0.x * c - d0.z * s, e.y + d0.y, e.z + d0.x * s + d0.z * c); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
  await b.sleep(15000);
  const imps = `(() => { const out = []; game.scene.traverse((o) => { const m = o.material; if (o.isMesh && m?.userData?.veg?.family === 'imp') out.push(o); }); return out; })()`;
  const filt = (lin) =>
    `(() => { const gl = game.renderer.getContext(); for (const o of ${imps}) { const t = game.renderer.properties.get(o.material.map).__webglTexture; if (!t) continue; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, ${lin ? 'gl.LINEAR' : 'gl.LINEAR_MIPMAP_LINEAR'}); } gl.bindTexture(gl.TEXTURE_2D, null); game.renderer.state.reset(); return 1; })()`;
  for (const v of ['A', 'B', 'C']) {
    if (v === 'B') await b.eval(filt(true));
    if (v === 'C') {
      await b.eval(filt(false));
      await b.eval(
        `(() => { for (const o of ${imps}) o.visible = false; game.vegetation?.countryside?.group && (window.__hideImp = true); return 1; })()`,
      );
    }
    await b.eval(`(() => { window.__pan.f = 0; window.__pan.on = true; return 1; })()`);
    await b.sleep(1500); // TAA history settles on the moving camera
    for (let i = 0; i < n; i++) {
      await b.screenshot(`${out}_${v}${i}.png`);
      await b.sleep(120);
    }
    await b.eval(`(() => { window.__pan.on = false; window.__pan.f = 0; return 1; })()`);
    await b.sleep(1500);
  }
  const errs = b.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) console.log('ERRORS', errs.slice(0, 8).join('\n'));
});
