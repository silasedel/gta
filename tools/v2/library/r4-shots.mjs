#!/usr/bin/env node
// r4-library check: boots the game muted, then close shots of each library swap with the code-built fallback off:
// dog walker (the user's Doberman, procedural walk), Keys picnic table, NPC cap, storefront ATM, police roadblock barricade,
// beach umbrellas. Console errors are printed at the end.   node tools/v2/library/r4-shots.mjs [--only dog,cap,...] [--q "&libprops=0"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const ONLY = o.only ? String(o.only).split(',') : null, Q = o.q ?? '', TAG = o.tag || 'r4';
const want = (k) => !ONLY || ONLY.includes(k);
const D = 'docs/v2/shots/library'; fs.mkdirSync(D, { recursive: true });
const cam = (b, tx, ty, tz, cx, cy, cz, fov = 40) => b.eval(`(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${cx}, ${cy}, ${cz}); cam.lookAt(${tx}, ${ty}, ${tz}); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
await withBrowser({ width: 1280, height: 800, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; game.weather?.set?.('clear', { instant: true }); return 1; })()`);
  await b.sleep(6000);
  const shot = async (name) => { await b.sleep(1800); await b.screenshot(`${D}/${TAG}_${name}.jpg`); console.log('shot', name); };
  let capDone = false;
  async function capShot() { if (capDone) return true;
      await b.eval(`game.cameraOverride = null`); await b.sleep(8000);
      const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position; const out = []; game.scene.traverse((o) => { if (o.isMesh && (o.name === 'lib-cap' || /^prop-hat-cap/.test(o.name))) { const v = o.getWorldPosition(new o.position.constructor()); out.push({ x: v.x, y: v.y, z: v.z, tris: o.name === 'lib-cap' ? 999 : o.userData.tris, d: Math.hypot(v.x - pp.x, v.z - pp.z), id: o.uuid }); } }); out.sort((a, b) => a.d - b.d); return out.slice(0, 4); })())`);
      console.log('caps', r); let L = JSON.parse(r || '[]').filter((c) => c.tris > 500 && c.d < 60);
      console.log('hat kinds near', await b.eval(`JSON.stringify((() => { const k = {}; game.scene.traverse((o) => { if (o.isMesh && /^prop-hat|^lib-cap/.test(o.name)) k[o.name] = (k[o.name] || 0) + 1; }); return k; })())`));
      if (!L.length) { // nobody in a cap close by: put the library cap (props.js hat) on a fresh walker's head the way look.js attaches it
        const r2 = await b.eval(`(async () => { const PR = await import('/src/npc/props.js'); const pp = game.player.position, h = game.player.heading || 0;
          const p = game.peds.spawnAt({ x: pp.x + Math.sin(h) * 3, z: pp.z + Math.cos(h) * 3 }); if (!p) return 'no ped'; await new Promise((res) => setTimeout(res, 600));
          const head = p.char.getBone('Head'); const root = p.root || p.char.root; root.updateMatrixWorld(true);
          let top = -1e9; const src = await (await fetch('/src/npc/props.js')).text(); const THREE = await import(src.match(/from "([^"]*deps.three[.]js[^"]*)"/)[1]);
          const box = new THREE.Box3(); p.char.model.traverse((m) => { if (m.isSkinnedMesh && m.visible) { m.computeBoundingBox(); box.copy(m.boundingBox).applyMatrix4(m.matrixWorld); top = Math.max(top, box.max.y); } });
          const hp = head.getWorldPosition(new THREE.Vector3()); const f = new THREE.Vector3(0, 0, 0.012).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
          const m = PR.hat(77, 'cap'); const holder = new THREE.Group(); holder.position.set(hp.x + f.x, top + 0.004, hp.z + f.z); holder.quaternion.copy(root.getWorldQuaternion(new THREE.Quaternion())); holder.add(m); game.scene.add(holder); head.attach(holder);
          m.name = 'prop-hat-cap'; p.pinned = 999; p.state = 'idle'; return JSON.stringify({ tris: m.userData.tris, top }); })()`);
        console.log('forced cap', r2);
        const r3 = await b.eval(`JSON.stringify((() => { const pp = game.player.position; const out = []; game.scene.traverse((o) => { if (o.isMesh && o.name === 'prop-hat-cap' && o.userData.tris > 500) { const v = o.getWorldPosition(new o.position.constructor()); out.push({ x: v.x, y: v.y, z: v.z, tris: o.userData.tris, d: Math.hypot(v.x - pp.x, v.z - pp.z), id: o.uuid }); } }); out.sort((a, b) => a.d - b.d); return out.slice(0, 1); })())`);
        L = JSON.parse(r3 || '[]');
      }
      if (L.length) { const C = L[0]; await b.eval(`(() => { const id = '${C.id}'; let m = null; game.scene.traverse((o) => { if (o.uuid === id) m = o; }); window.__cap = m; game.cameraOverride = (dt, cam) => { const v = window.__cap.getWorldPosition(cam.position.clone()); let r = window.__cap; while (r.parent && r.parent !== game.scene) r = r.parent; const h = r.rotation.y; cam.position.set(v.x + Math.sin(h + 0.7) * 0.9, v.y + 0.05, v.z + Math.cos(h + 0.7) * 0.9); cam.lookAt(v.x, v.y - 0.12, v.z); if (cam.fov !== 35) { cam.fov = 35; cam.updateProjectionMatrix(); } return true; }; return 1; })()`); await shot('cap'); capDone = true; return true; } return false;
    }

  // ---- dog walker next to the player (spawn street at Nico's)
  if (want('dog')) {
    const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position, h = game.player.heading || 0; const p = game.peds.spawnAt({ x: pp.x + Math.sin(h) * 6, z: pp.z + Math.cos(h) * 6 }, { dog: true }); if (!p || !p.dog) return { err: 'no dog' }; window.__dogPed = p; return { lib: !!p.dog.lib, ok: p.dog.lib?.ok, x: p.pos.x, z: p.pos.z }; })())`);
    console.log('dog', r);
    for (const [k, t] of [[0, 2500], [1, 900], [2, 900]]) {
      await b.sleep(t);
      await b.eval(`(() => { const d = window.__dogPed.dog, p = d.pos, h = d.heading; const sx = Math.cos(h), sz = -Math.sin(h); const k = ${k};
        const off = k === 0 ? [-sx * 1.9 + Math.sin(h) * 0.6, 0.75, -sz * 1.9 + Math.cos(h) * 0.6] : k === 1 ? [Math.sin(h) * 2.4 + sx * 0.8, 0.7, Math.cos(h) * 2.4 + sz * 0.8] : [-sx * 4 + Math.sin(h) * 1, 1.6, -sz * 4 + Math.cos(h) * 1];
        game.cameraOverride = (dt, cam) => { const q = window.__dogPed.dog.pos; cam.position.set(q.x + off[0], q.y + off[1], q.z + off[2]); cam.lookAt(q.x, q.y + 0.4, q.z); if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await shot('dog_' + k);
    }
    // gait numbers: pose sampled for 1 s (thigh swing range) + ground offset
    console.log('dog gait', await b.eval(`JSON.stringify((() => { const d = window.__dogPed.dog; const gy = game.city.groundHeightAt(d.pos.x, d.pos.z, d.pos.y + 1); let lo = 0; d.lib?.g.traverse((o) => { if (o.isBone && o.name === 'toeL') { const v = o.getWorldPosition(new o.position.constructor()); lo = v.y - gy; } }); return { dy: +(d.pos.y - gy).toFixed(3), toeL: +lo.toFixed(3), spd: window.__dogPed.speed }; })())`));
  }
  // ---- picnic table in the Keys lots / spawn street
  if (want('picnic')) {
    const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position; let best = null, bd = 1e9; game.scene.traverse((o) => { if (o.isInstancedMesh && o.name === 'lib-picnic_table') { const m = new o.matrix.constructor(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const x = m.elements[12], y = m.elements[13], z = m.elements[14], d = Math.hypot(x - pp.x, z - pp.z); if (d < bd) { bd = d; best = { x, y, z, n: o.count }; } } } }); return best; })())`);
    console.log('picnic', r);
    const P = JSON.parse(r || 'null');
    if (P) { await b.eval(`game.teleport(${P.x + 14}, undefined, ${P.z + 14}, 0)`); await b.sleep(4000); for (const [k, ox, oz] of [[0, 2.6, 2.4], [1, -2.6, -2.4]]) { await cam(b, P.x, P.y + 0.45, P.z, P.x + ox, P.y + 3.0, P.z + oz, 45); await shot('picnic_' + k); } }
  }
  // ---- police roadblock barricade (spawned through the police api next to the player)
  if (want('barrier')) {
    const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position, h = game.player.heading || 0; const x = pp.x + Math.sin(h) * 5, z = pp.z + Math.cos(h) * 5, gy = game.city.groundHeightAt(x, z, pp.y + 1); const it = game.police.makeBarrier(x, z, h + Math.PI / 2, gy); window.__bar = it; return { lib: it.g.name, x, y: gy, z }; })())`);
    console.log('barrier', r); const B = JSON.parse(r);
    await cam(b, B.x, B.y + 0.8, B.z, B.x + 3.5, B.y + 1.6, B.z - 2.5); await shot('barrier');
    await b.eval(`game.police.removeBarrier(window.__bar)`);
  }
  // ---- storefront ATM + caps downtown
  if (want('atm') || want('cap')) {
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(407, undefined, -110, 0); return 1; })()`);
    await b.sleep(30000);
    if (want('atm')) {
      const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position; let best = null, bd = 1e9; game.scene.traverse((o) => { if (o.name === 'lib-atm' && o.parent && o.parent.parent === game.scene) { const v = o.getWorldPosition(new o.position.constructor()); const d = Math.hypot(v.x - pp.x, v.z - pp.z); if (d < bd) { bd = d; best = { x: v.x, y: v.y, z: v.z, h: o.parent.rotation.y, d }; } } }); return best; })())`);
      console.log('atm', r); const A = JSON.parse(r || 'null');
      if (A) { await b.eval(`game.teleport(${A.x + Math.sin(A.h) * 4}, undefined, ${A.z + Math.cos(A.h) * 4}, 0)`); await b.sleep(5000); await cam(b, A.x, A.y + 1.0, A.z, A.x + Math.sin(A.h) * 2.6 + Math.cos(A.h) * 1.4, A.y + 1.6, A.z + Math.cos(A.h) * 2.6 - Math.sin(A.h) * 1.4); await shot('atm'); }
    }
    if (want('cap')) await capShot();
  }
  // ---- beach umbrellas (sunbathers)
  if (want('umbrella')) {
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(2332, undefined, -660, 0); return 1; })()`);
    await b.sleep(8000);
    console.log('sand', await b.eval(`(() => { const pp = game.player.position; let q = game.peds._nav.sandPoint?.(pp, 400, true) || game.peds._nav.sandPoint?.(pp, 400);
      if (!q) { const C = game.city; outer: for (let r = 100; r < 3000; r += 100) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283, x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r; if (C.zoneAt(x, z) === 'beach' && !C.isWater(x, z) && C.surfaceAt(x, z) === 'sand') { q = { x, z }; break outer; } } }
      if (!q) return 'none'; game.teleport(q.x, undefined, q.z, 0); return [q.x | 0, q.z | 0].join(','); })()`));
    await b.sleep(15000);
    await b.eval(`(() => { const pp = game.player.position, h = game.player.heading || 0; window.__umb = []; for (let i = 0; i < 3; i++) { const x = pp.x + Math.sin(h) * 7 + Math.cos(h) * (i - 1) * 3.2, z = pp.z + Math.cos(h) * 7 - Math.sin(h) * (i - 1) * 3.2; window.__umb.push(game.peds._umbrella(x, game.city.groundHeightAt(x, z, pp.y + 2), z)); } return 1; })()`);
    await b.sleep(2000);
    const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position; let best = null, bd = 1e9; game.scene.traverse((o) => { if (/^lib-umbrella_beach/.test(o.name)) { const v = o.getWorldPosition(new o.position.constructor()); const d = Math.hypot(v.x - pp.x, v.z - pp.z); if (d < bd) { bd = d; best = { x: v.x, y: v.y, z: v.z, d, n: o.name }; } } }); return best; })())`);
    console.log('umbrella', r); const U = JSON.parse(r || 'null');
    if (U) { await cam(b, U.x, U.y + 1.4, U.z, U.x + 6.5, U.y + 1.9, U.z + 5.5, 50); await shot('umbrella'); }
  }
  if (want('cap') && !capDone) { await b.eval('game.cameraOverride = null'); await capShot(); }
  console.log('fps', await b.eval('game.perf?.fps'));
  const errs = [...new Set(b.errors)];
  console.log('CONSOLE ERRORS', errs.length, errs.slice(0, 8).join('\n'));
});
