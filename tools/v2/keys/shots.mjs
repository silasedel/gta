#!/usr/bin/env node
// Key Largo look tool (track: keys). One game boot, then fixed cameras given in Nico's HOUSE-LOCAL frame
// (+X east of the plan, +Z toward the street, y above the yard grade), so the shots follow the house wherever layout.json puts it.
//   node tools/v2/keys/shots.mjs --set k1 [--only deck,aerial] [--spots tools/v2/keys/spots.json] [--q "&foo=1"] [--probe]
// spot: { eye:[x,y,z], look:[x,y,z], tod:11, fov:55, weather:'clear'|'rain'|'afterrain'|..., world:true (eye/look are world coords), eval:"js" }
// Writes docs/v2/shots/keys/<set>_<id>.png and docs/v2/reports/keys-<set>.json (frame ms, draw calls, triangles per shot).
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
const SET = o.set || 'k';
const DIR = path.resolve('docs/v2/shots/keys');
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync('docs/v2/reports', { recursive: true });
const SPOTS = JSON.parse(fs.readFileSync(o.spots || 'tools/v2/keys/spots.json', 'utf8'));
const only = o.only ? String(o.only).split(',') : Object.keys(SPOTS).filter((k) => !SPOTS[k].skip);
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser(
  { width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 1100) },
  async (b) => {
    await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
    await b.waitFor(
      GAME_READY + " && typeof game.teleport === 'function' && !!game.nicoHouse",
      600,
    );
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(
      `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; if (!${!!o.hud}) { const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.keys-shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('keys-shot'); } return 1; })()`,
    );
    if (o.probe) {
      const pr = await b.eval(fs.readFileSync(o.probe, 'utf8'));
      fs.writeFileSync(
        `docs/v2/reports/keys-${SET}-probe.json`,
        typeof pr === 'string' ? pr : JSON.stringify(pr, null, 1),
      );
      console.log('probe written');
    }
    const runSpots = async (tag) => {
      for (const id of only) {
        const s = SPOTS[id];
        if (!s) continue;
        const setup = `(() => { const s = ${JSON.stringify(s)}; const NH = game.nicoHouse, V = (p) => s.world ? new game.THREE.Vector3(...p) : NH.toWorld(new game.THREE.Vector3(...p));
      const eye = V(s.eye), look = V(s.look); game.timeOfDay = s.tod ?? 11;
      if (game.weather?.set) { try { if (s.weather === 'afterrain') { game.weather.set('rain', { instant: true }); game.weather.set('clear', { seconds: 0.05 }); } else game.weather.set(s.weather || 'clear', { instant: true }); game.weather.hold?.(true); } catch (e) {} }
      const pl = s.player ? V(s.player) : V([s.eye[0], 0, s.eye[2] + 3]); try { game.teleport(pl.x, undefined, pl.z, s.heading ?? 0); } catch (e) {}
      game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (s.fov && cam.fov !== s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); } return true; };
      if (game.player?.mesh && s.hidePlayer !== false) game.player.mesh.visible = false;
      { ${s.eval || ''} }
      return 1; })()`;
        await b.eval(setup);
        await b.sleep(+(o.settle || 6000));
        for (let i = 0; i < +(o.stream || 40); i++) {
          const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
          if (q < 3) break;
          await b.sleep(1000);
        }
        await b.sleep(1500);
        const perf = await b.eval(
          `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), calls: ri.calls, tris: ri.triangles })); } }; requestAnimationFrame(f); })`,
        );
        const out = path.join(DIR, `${SET}_${id}${tag}.png`);
        await b.screenshot(out);
        // flicker check: more frames of the same still camera (or a slow dolly with "dolly":[dx,dy,dz] m per frame-step)
        for (let f = 1; f < +(o.frames || 1); f++) {
          if (s.dolly)
            await b.eval(
              `(() => { const s = ${JSON.stringify(s)}; const NH = game.nicoHouse; const k = ${f}; const e = new game.THREE.Vector3(...s.eye.map((v, i) => v + s.dolly[i] * k)), l = new game.THREE.Vector3(...s.look.map((v, i) => v + s.dolly[i] * k)); const E = s.world ? e : NH.toWorld(e), L = s.world ? l : NH.toWorld(l); game.cameraOverride = (dt, cam) => { cam.position.copy(E); cam.lookAt(L); return true; }; return 1; })()`,
            );
          await b.sleep(+(o.fgap || 250));
          await b.screenshot(path.join(DIR, `${SET}_${id}_f${f}.png`));
        }
        rep.shots[id + tag] = JSON.parse(perf);
        console.log(id, perf);
      }
    };
    await runSpots('');
    // --ab "&keys=0": same Chrome, the page reloaded with the alternate query, the same spots again (perf A/B in one run)
    if (o.ab) {
      await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || '') + o.ab);
      await b.waitFor(
        GAME_READY + " && typeof game.teleport === 'function' && !!game.nicoHouse",
        600,
      );
      await startGame(b);
      await b.eval(
        `(() => { game.timeExternal = true; const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.keys-shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('keys-shot'); return 1; })()`,
      );
      await runSpots('_ab');
    }
    if (b.errors.length) {
      rep.errors = [...new Set(b.errors)].slice(0, 30);
      console.log('ERRORS', rep.errors.join('\n'));
    }
  },
);
fs.writeFileSync(`docs/v2/reports/keys-${SET}.json`, JSON.stringify(rep, null, 2));
