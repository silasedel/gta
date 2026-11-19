#!/usr/bin/env node
// Everglades r7: boot, go to the glades, print game.everglades.stats() + the found camp sites, aerial shot of each site.
//   node tools/v2/everglades/check.mjs [--q "&x=1"] [--set name] [--tod 11] [--sites 0] [--at x,z]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const DIR = 'docs/v2/shots/everglades_r7'; fs.mkdirSync(DIR, { recursive: true });
const SET = o.set || 'chk', at = (o.at || '-2600,-330').split(',').map(Number);
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600); await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 11)}; const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.veg-shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('veg-shot'); game.teleport(${at[0]}, undefined, ${at[1]}, 0); return 1; })()`);
  for (let i = 0; i < 60; i++) { await b.sleep(1000); const s = await b.eval('JSON.stringify(game.everglades ? game.everglades.parts.camps?.stats : null)'); if (i % 10 === 0) console.log(i, s); if (s && JSON.parse(s)?.sites && i > 15) break; }
  console.log('STATS', await b.eval('JSON.stringify(game.everglades?.stats())'));
  const sites = JSON.parse(await b.eval('JSON.stringify((game.everglades?.parts.camps?.sites || []).map((s) => ({ id: s.id, kind: s.kind, x: +s.x.toFixed(1), z: +s.z.toFixed(1), heading: +s.heading.toFixed(3), dW: s.dW, rd: Math.round(s.rd) })))'));
  console.log('SITES', JSON.stringify(sites)); fs.writeFileSync('docs/v2/reports/everglades-r7-sites.json', JSON.stringify(sites, null, 1));
  if (o.sites !== '0') for (const s of sites) {
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading), cx = s.x + fx * s.dW * 0.6, cz = s.z + fz * s.dW * 0.6;
    await b.eval(`(() => { game.teleport(${s.x - fx * 30}, undefined, ${s.z - fz * 30}, 0); const e = new game.THREE.Vector3(${cx - fx * 40 + fz * 25}, 22, ${cz - fz * 40 - fx * 25}), l = new game.THREE.Vector3(${cx}, 0, ${cz});
      game.cameraOverride = (dt, cam) => { cam.position.copy(e); cam.lookAt(l); if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); } return true; }; if (game.player?.mesh) game.player.mesh.visible = false; return 1; })()`);
    await b.sleep(14000);
    console.log(s.id, await b.eval('JSON.stringify(game.everglades?.stats())'));
    await b.screenshot(`${DIR}/${SET}_${s.id}.png`);
  }
  const errs = [...new Set(b.errors.filter((e) => !/favicon|nicoHouse/.test(e)))]; if (errs.length) console.log('ERRORS', errs.slice(0, 12).join('\n'));
});
