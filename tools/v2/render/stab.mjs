#!/usr/bin/env node
// r2-render: image-stability A/B in one session.
//   node tools/v2/render/stab.mjs [--tag s1] [--modes "old:game.renderR2=false|new:game.renderR2=true"] [--only deck,shot12,conv,trees,pan,perf,inv]
//        [--q "&foo=1"] [--w 1920 --h 1080] [--hour 11]
// Per spot and mode: still frame, 2x zoom crop, 8-frame temporal diff (wind frozen: what changes is render noise),
// and while panning slowly a zoom crop. Perf: frame time / GPU medians per mode (3 alternating reps).
// Output: docs/v2/shots/render/<tag>_*.{jpg,png}, docs/v2/reports/render-<tag>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 's1',
  HOUR = +(o.hour || 11),
  D = 'docs/v2/shots/render',
  W = +(o.w || 1600),
  H = +(o.h || 900);
fs.mkdirSync(`${D}/raw`, { recursive: true });
const only = (o.only || 'inv,deck,shot12,conv,trees,pan,perf').split(',');
const MODES = (o.modes || 'old:game.renderR2=false|new:game.renderR2=true').split('|').map((s) => {
  const i = s.indexOf(':');
  return [s.slice(0, i), s.slice(i + 1)];
});
const rep = { tag: TAG, hour: HOUR, size: [W, H], modes: MODES, spots: {}, perf: {}, errors: [] };
const save = (p, url) => fs.writeFileSync(p, Buffer.from(url.split(',')[1], 'base64'));
await withBrowser({ width: W, height: H, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); game.timeOfDay = ${HOUR}; return 1; })()`,
  );
  await b.eval(fs.readFileSync('tools/v2/render/stab.page.js', 'utf8'));
  const bad = b.errors.filter((e) =>
    /\[miami\] failed|no city data|Failed to fetch dynamically imported/.test(e),
  );
  if (bad.length) {
    console.log('CITY DID NOT BOOT, aborting:\n' + bad.join('\n'));
    process.exitCode = 3;
    return;
  }
  rep.quality = await b.eval(
    'JSON.stringify({ q: game.quality?.name, look: game.quality?.current?.look, pr: game.renderer.getPixelRatio(), internal: game.post.internalSize, dpr: devicePixelRatio })',
  );
  console.log('quality', rep.quality);
  const stream = async (n = 40) => {
    for (let i = 0; i < n; i++) {
      if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 3) break;
      await b.sleep(1000);
    }
  };
  const setMode = async (js) => {
    await b.eval(`(() => { ${js}; return 1; })()`);
    await b.sleep(1800);
  };
  const camAt = (E, L, fov = 55) =>
    b.eval(
      `(() => { const E=${JSON.stringify(E)}, L=${JSON.stringify(L)}; game.cameraOverride=(dt,c)=>{ c.position.fromArray(E); c.lookAt(L[0],L[1],L[2]); if (c.fov !== ${fov}) { c.fov = ${fov}; c.updateProjectionMatrix(); } return true; }; return 1; })()`,
    );
  const zoomCrop = [W * 0.3, H * 0.3, W * 0.4, H * 0.4].map(Math.round);
  async function shoot(name, crop = zoomCrop) {
    const R = (rep.spots[name] = {});
    for (const [m, js] of MODES) {
      await setMode(js);
      await b.eval('window.__rFreeze(true)');
      await b.sleep(600);
      await b.eval('window.__rFrames(48)'); // TAA converges (frames, not seconds)
      const s = await b.eval('window.__rStab(8, null, 0.5)');
      save(`${D}/raw/${TAG}_${name}_${m}.jpg`, s.first);
      save(`${D}/raw/${TAG}_${name}_${m}_diff.jpg`, s.diff);
      const z = await b.eval(`window.__rZoom(${JSON.stringify(crop)}, 2)`);
      save(`${D}/raw/${TAG}_${name}_${m}_zoom.png`, z);
      await b.eval('window.__rFreeze(false)');
      R[m] = { mad: s.mad, hot: s.hot, spatial: s.spatial, tsr: s.tsr };
      console.log(name, m, JSON.stringify(R[m]));
    }
  }
  const sect = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      console.log('SECTION FAILED', name, String(e).slice(0, 400));
      rep.failed = [...(rep.failed || []), name];
    }
  };
  const errNow = (tag) => {
    const e = [...new Set(b.errors)].filter((x) => !/favicon/.test(x));
    console.log(
      `console errors after ${tag}: ${e.length}`,
      e.slice(0, 5).join(' || ').slice(0, 600),
    );
  };
  errNow('boot');
  if (only.includes('deck') || only.includes('inv'))
    await sect('deck', async () => {
      const R = JSON.parse(fs.readFileSync('tools/v2/keys/spots_refs.json', 'utf8')).r0b_deck;
      await b.eval(
        `(() => { const NH = game.nicoHouse; const p = NH.toWorld(new game.THREE.Vector3(${R.eye[0]}, 0, ${R.eye[2] + 3})); game.teleport(p.x, undefined, p.z, 0); return 1; })()`,
      );
      await b.sleep(5000);
      await stream();
      const EL = JSON.parse(
        await b.eval(
          `(() => { const NH = game.nicoHouse, V = (a) => new game.THREE.Vector3(...a); return JSON.stringify([NH.toWorld(V(${JSON.stringify(R.eye)})).toArray(), NH.toWorld(V(${JSON.stringify(R.look)})).toArray()]); })()`,
        ),
      );
      await camAt(EL[0], EL[1], R.fov);
      await b.sleep(1500);
      if (only.includes('inv')) {
        rep.inventory = await b.eval('window.__rInv(400)');
        rep.aniso = await b.eval('window.__rAniso()');
        rep.coplanarDeck = await b.eval('window.__rCoplanar(30)');
        fs.writeFileSync(
          `docs/v2/reports/render-${TAG}-inventory.json`,
          JSON.stringify(
            { inventory: rep.inventory, aniso: rep.aniso, coplanarDeck: rep.coplanarDeck },
            null,
            1,
          ),
        );
      }
      if (only.includes('deck'))
        await shoot('deck', [W * 0.15, H * 0.35, W * 0.35, H * 0.35].map(Math.round));
    });
  errNow('previous section');
  if (only.includes('trees'))
    await sect('trees', async () => {
      // trees and their shadows on the ground at Nico's lot (high sun, looking across the yard)
      await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), 1`);
      await b.sleep(3000);
      await stream();
      const p = JSON.parse(await b.eval('JSON.stringify(game.player.position.toArray())'));
      await camAt([p[0] + 2, p[1] + 2.2, p[2] - 3], [p[0] - 14, p[1] - 0.5, p[2] + 14], 55);
      await b.sleep(1500);
      await shoot('trees');
    });
  errNow('previous section');
  if (only.includes('conv'))
    await sect('conv', async () => {
      await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), 1`);
      await b.sleep(3000);
      await stream();
      // the Bayline 65 convertible (user shots 03 / 04 / 11): park one next to the player when none stands near
      await b.eval(`(async () => { const P = game.player.position; if (game.vehicles.list.some(v => v.mesh && /Bayline 65/.test(v.name || '') && v.mesh.position.distanceTo(P) < 60)) return 1;
      try { await game.vehicles.spawnParked('conv1', { x: P.x + 7, z: P.z + 3, heading: 0.6, wear: 0.6 }); } catch (e) { return String(e); } return 2; })()`);
      await b.sleep(2500);
      const L = JSON.parse(
        await b.eval(
          `(() => { const P = game.player.position; const nm = (v) => (v.name || '') + '|' + (v.key || '') + '|' + (v.model || ''); const v = game.vehicles.list.filter(v => v.mesh && /Bayline 65/.test(nm(v))).sort((a,b)=>a.mesh.position.distanceTo(P)-b.mesh.position.distanceTo(P))[0]; if (!v) return JSON.stringify({ miss: game.vehicles.list.filter(v => v.mesh && v.mesh.position.distanceTo(P) < 60).map(nm) }); const fw = new game.THREE.Vector3(0, 0, 1).applyQuaternion(v.mesh.quaternion); return JSON.stringify({ p: v.mesh.position.toArray(), f: [fw.x, fw.z] }); })()`,
        ),
      );
      if (L && L.miss)
        console.log('conv: no Bayline near the lot', JSON.stringify(L.miss).slice(0, 400));
      if (L && L.p) {
        const { p, f } = L; // behind-left and above, 4.5 m out: the folded top and the rear deck
        await camAt(
          [p[0] - f[0] * 4.5 - f[1] * 2, p[1] + 1.6, p[2] - f[1] * 4.5 + f[0] * 2],
          [p[0], p[1] + 0.3, p[2]],
          50,
        );
        await b.sleep(1200);
        await shoot('conv', [W * 0.3, H * 0.3, W * 0.4, H * 0.4].map(Math.round));
        rep.coplanarConv = await b.eval('window.__rCoplanar(8)');
        rep.convPick = await b.eval(
          'JSON.stringify([[0.4, 0.62], [0.5, 0.66], [0.35, 0.7], [0.55, 0.5]].map(([x, y]) => window.__rPick(x, y)))',
        );
        console.log('conv pick', rep.convPick.slice(0, 900));
      }
    });
  errNow('previous section');
  if (only.includes('shot12'))
    await sect('shot12', async () => {
      await b.eval(`game.teleport(-1103.6, undefined, 3438.5, 0), 1`);
      await b.sleep(5000);
      await stream();
      const EL = JSON.parse(
        await b.eval(`(() => { const G = game.city.roadGraph, gy = (x, z) => game.city.groundHeightAt(x, z); let best = null, bd = 1e9; for (const n of G.nodes) { if ((n.edges || []).length < 3) continue; const d = Math.hypot(n.x + 1103.6, n.z - 3438.5); if (d < bd) { bd = d; best = n; } }
      const yaw = 135 * Math.PI / 180, D = 16; const e = [best.x + Math.sin(yaw) * D, 0, best.z + Math.cos(yaw) * D]; e[1] = gy(e[0], e[2]) + 6.5; return JSON.stringify([e, [best.x, gy(best.x, best.z), best.z]]); })()`),
      );
      await camAt(EL[0], EL[1], 55);
      await b.sleep(2000);
      await stream(15);
      await shoot('shot12');
      rep.coplanarShot12 = await b.eval('window.__rCoplanar(30)');
      // street level, looking along the shop fronts (plants, blinds)
      await camAt(
        [EL[1][0] + 9, EL[1][1] + 1.7, EL[1][2] + 9],
        [EL[1][0] - 20, EL[1][1] + 1.5, EL[1][2] + 2],
        55,
      );
      await b.sleep(1500);
      await shoot('street');
    });
  errNow('previous section');
  if (only.includes('pan'))
    await sect('pan', async () => {
      // slow pan at the shot12 corner: 0.15 degree per frame, zoom crop mid-pan (crawling edges, ghosting)
      for (const [m, js] of MODES) {
        await setMode(js);
        await b.eval(
          `(() => { const c = game.camera; const E = c.position.clone(); let yaw = 0; const base = c.quaternion.clone(); game.cameraOverride = (dt, cam) => { yaw += 0.0026; cam.position.copy(E); cam.quaternion.copy(base); cam.rotateY(yaw); return true; }; return 1; })()`,
        );
        await b.sleep(1500);
        const z = await b.eval(`window.__rZoom(${JSON.stringify(zoomCrop)}, 2)`);
        save(`${D}/raw/${TAG}_pan_${m}_zoom.png`, z);
        await b.eval(
          `(() => { const c = game.camera; const E = c.position.clone(); const base = c.quaternion.clone(); game.cameraOverride = (dt, cam) => { cam.position.copy(E); cam.quaternion.copy(base); return true; }; return 1; })()`,
        );
      }
    });
  errNow('previous section');
  if (only.includes('drive'))
    await sect('drive', async () => {
      for (const f of ['drive', 'grab'])
        await b.eval(fs.readFileSync(`tools/v2/look/${f}.page.js`, 'utf8') + ';1');
      await b.eval(`game.teleport(-866.1, undefined, 4836.4, 0), game.cameraOverride = null, 1`);
      await b.sleep(3000);
      await stream();
      await b.eval(
        `(() => { const P = game.player.position; const v = game.vehicles.list.filter(v => /Bayline 65/.test(v.name||'')).sort((a,b)=>a.mesh.position.distanceTo(P)-b.mesh.position.distanceTo(P))[0]; game.enterVehicle(v); window.__car = v; return 1; })()`,
      );
      await b.sleep(1000);
      for (const [m, js] of MODES) {
        await setMode(js);
        await b.eval(`JSON.stringify(window.__cruise(window.__car, -30, 4190, 60, 160))`);
        await b.sleep(2500);
        await stream(15);
        await b.eval(`JSON.stringify(window.__cruise(window.__car, -30, 4190, 60, 160))`);
        await b.sleep(3000);
        const z = await b.eval(
          `window.__rZoom(${JSON.stringify([W * 0.3, H * 0.4, W * 0.4, H * 0.45].map(Math.round))}, 2)`,
        );
        save(`${D}/raw/${TAG}_drive_${m}_zoom.png`, z);
        const fr = await b.eval(
          `window.__grab(4, [${Math.round(W * 0.3)}, ${Math.round(H * 0.4)}, ${Math.round(W * 0.4)}, ${Math.round(H * 0.45)}], 1)`,
        );
        fr.forEach((u, i) => save(`${D}/raw/${TAG}_drive_${m}_${i}.jpg`, u));
      }
      await b.eval('window.__cruiseStop(window.__car), 1');
    });
  errNow('previous section');
  if (only.includes('perf'))
    await sect('perf', async () => {
      await b
        .eval(`game.cameraOverride = null, game.teleport(-866.1, undefined, 4836.4, 0), 1`)
        .catch(() => {});
      await b.sleep(4000);
      await stream();
      await b.eval(fs.readFileSync('tools/v2/s1-perf.page.js', 'utf8'));
      for (let r = 0; r < 3; r++)
        for (const [m, js] of MODES) {
          await setMode(js);
          const p = JSON.parse(await b.eval(`window.__pf.measure(2500).then(JSON.stringify)`));
          (rep.perf[m] ||= []).push({
            med: p.med,
            p95: p.p95,
            gpu: p.gpuMs,
            render: p.renderMs,
            calls: p.calls,
          });
        }
      console.log('perf', JSON.stringify(rep.perf));
    });
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
});
fs.writeFileSync(`docs/v2/reports/render-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(rep.errors.length ? 'ERRORS\n' + rep.errors.join('\n') : 'no errors');
