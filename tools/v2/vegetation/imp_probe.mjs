#!/usr/bin/env node
// Far-card probe: node tools/v2/vegetation/imp_probe.mjs out_prefix [eyeX eyeY eyeZ lookX lookY lookZ] (nicoHouse-local coords,
// default = keys r5 aerial). Shoots the view, then the view with vegetation impostors hidden, then lists the visible far meshes.
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const [out = 'imp', ...nums] = process.argv.slice(2); const v = nums.map(Number);
const eye = v.length >= 6 ? v.slice(0, 3) : [-70, 48, 95], look = v.length >= 6 ? v.slice(3, 6) : [-5, 0, 5];
await withBrowser({ width: 1600, height: 900, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY + " && !!game.nicoHouse", 600); await startGame(b, 60);
  await b.eval(`(() => { const NH = game.nicoHouse, V = (p) => NH.toWorld(new game.THREE.Vector3(...p)); const e = V(${JSON.stringify(eye)}), l = V(${JSON.stringify(look)});
    game.timeOfDay = 11; window.__E = e; try { game.teleport(e.x, undefined, e.z + 3, 0); } catch (x) {}
    game.cameraOverride = (dt, cam) => { cam.position.copy(e); cam.lookAt(l); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
  await b.sleep(15000);
  await b.screenshot(out + '_a.png');
  const list = await b.eval(`(() => { const e = window.__E, rows = {}; game.scene.traverseVisible((o) => { if (!o.isMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; const fam = m?.userData?.veg?.family;
      const key = (fam ? 'veg-' + fam + ':' : '') + (o.name || '?') + ' <' + (o.parent?.name || '') + '> ' + (m?.type || '') + (m?.alphaTest ? ' aT' + m.alphaTest : '') + (m?.transparent ? ' tr' : '') + (m?.map ? ' map' : ' nomap');
      const r = rows[key] ||= { n: 0, inst: 0 }; r.n++; r.inst += o.isInstancedMesh ? o.count : 1; }); return JSON.stringify(Object.entries(rows).sort((a, b) => b[1].inst - a[1].inst).slice(0, 80)); })()`, 60000);
  console.log(list);
  const imps = `(() => { const out = []; game.scene.traverse((o) => { const m = o.material; if (o.isMesh && m?.userData?.veg?.family === 'imp') out.push(m); }); return [...new Set(out)]; })()`;
  // experiments: no mipmaps on the far cards; no alpha-to-coverage
  await b.eval(`(() => { const gl = game.renderer.getContext(); for (const m of ${imps}) { const t = game.renderer.properties.get(m.map).__webglTexture; if (!t) continue; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); } gl.bindTexture(gl.TEXTURE_2D, null); game.renderer.state.reset(); return 1; })()`); await b.sleep(2500); await b.screenshot(out + '_nomip.png');
  await b.eval(`(() => { const gl = game.renderer.getContext(); for (const m of ${imps}) { const t = game.renderer.properties.get(m.map).__webglTexture; if (t) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } m.alphaToCoverage = false; m.needsUpdate = true; } gl.bindTexture(gl.TEXTURE_2D, null); game.renderer.state.reset(); return 1; })()`); await b.sleep(4000); await b.screenshot(out + '_noa2c.png');
  await b.eval(`(() => { window.__hid = []; game.scene.traverse((o) => { const m = o.material; if (o.isMesh && m?.userData?.veg?.family === 'imp' && o.visible) { o.visible = false; window.__hid.push(o); } }); return window.__hid.length; })()`).then((n) => console.log('hidden veg imp meshes', n));
  await b.sleep(1500); await b.screenshot(out + '_noimp.png');
  const errs = b.errors.filter((e) => !/favicon/.test(e)); if (errs.length) console.log('ERRORS', errs.slice(0, 8).join('\n'));
});
