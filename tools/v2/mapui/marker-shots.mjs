// r2-mapui: world markers (item 7). Real game, muted. Puts the old beam marker (HEAD code, rebuilt in-page) and the new
// markers (src/gameplay/markers.js) on the same street, day and night, same camera, same session.
// Usage: node tools/v2/mapui/marker-shots.mjs [x,z | x,z,fx,fz (exact road point + direction)]  ->  docs/v2/shots/r2-mapui/markers_<old|new>_<day|night>[_far].jpg
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';

const OUT = 'docs/v2/shots/r2-mapui';
fs.mkdirSync(OUT, { recursive: true });
const AT = process.argv[2] || '';
await withBrowser({ width: 1600, height: 900, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  if (!(await startGame(b, 240))) throw new Error('game did not start');
  const setup = await b.eval(`(async () => {
    const THREE = game.THREE || (await import('three'));
    const { createMarker } = await import('/src/gameplay/markers.js?t=' + Date.now());
    const C = game.city, P = game.player.position;
    ${AT ? `const near = { x: ${AT.split(',')[0]}, z: ${AT.split(',')[1]} };` : 'const near = { x: P.x, z: P.z };'}
    // a straight-ish road stretch: sample road points, keep the one whose next 90 m stay on the road
    let best = null;
    ${AT.split(',').length === 4 ? `best = { x: ${AT.split(',')[0]}, z: ${AT.split(',')[1]}, fx: ${AT.split(',')[2]}, fz: ${AT.split(',')[3]} };` : ''}
    for (let i = 0; i < 60 && !best; i++) {
      const r = C.randomRoadPoint(near, 500); if (!r) continue;
      const p = r.position || r.pos || r, h = r.heading ?? r.h ?? 0, fx = Math.sin(h), fz = Math.cos(h);
      let ok = true; for (let d = 10; d <= 95; d += 5) { const s = C.streetNameAt?.(p.x + fx * d, p.z + fz * d); if (!s || (C.isWater && C.isWater(p.x + fx * d, p.z + fz * d))) { ok = false; break; } }
      if (ok) best = { x: p.x, z: p.z, fx, fz };
    }
    if (!best) return 'no road';
    game.teleport(best.x - best.fx * 12, undefined, best.z - best.fz * 12);
    const gy = (x, z) => { try { const y = C.groundHeightAt ? C.groundHeightAt(x, z) : C.groundHeight(x, z); return Number.isFinite(y) ? y : 0; } catch (e) { return 0; } };
    const at = (d, side = 0) => ({ x: best.x + best.fx * d - best.fz * side, z: best.z + best.fz * d + best.fx * side });
    // old marker: the HEAD activities.js beam + torus, rebuilt here for the A/B
    const oldTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.8)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
    const oldMarker = (pos, color, r, h, ringColor) => { const g = new THREE.Group(); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 40, 18, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ map: oldTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.55, toneMapped: false })); beam.scale.set(r, h, r); const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: ringColor ?? color, transparent: true, opacity: 0.85, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; ring.scale.setScalar(r); g.add(beam, ring); g.position.set(pos.x, gy(pos.x, pos.z) + 0.02, pos.z); return g; };
    const place = (g, pos) => { g.position.set(pos.x, gy(pos.x, pos.z) + 0.02, pos.z); return g; };
    const OLD = new THREE.Group(), NEW = new THREE.Group();
    OLD.add(oldMarker(at(14, 3), 0xffffff, 0.7, 0.6, 0x2fe0d0), oldMarker(at(32, -3), 0xffd25a, 0.6, 1), oldMarker(at(55, 4), 0xff9a3a, 0.6, 1), oldMarker(at(85, -2), 0x55e08a, 0.7, 0.5));
    const hd = Math.atan2(best.fx, best.fz);
    NEW.add(place(createMarker(THREE, { color: 0x2fe0d0, radius: 3.2, icon: 'flag', iconY: 2.4 }), at(14, 3)),
            place(createMarker(THREE, { color: 0xffd25a, radius: 1.2 }), at(32, -3)),
            place(createMarker(THREE, { color: 0xff9a3a, radius: 1.2 }), at(55, 4)),
            place(createMarker(THREE, { color: 0x55e08a, radius: 1.26 }), at(85, -2)),
            place(createMarker(THREE, { color: 0x2fe0d0, radius: 6, wall: 1.4, icon: 'arrow', iconY: 3.4, iconSize: 2.2, dir: { x: best.fx, z: best.fz } }), at(120, 0)));
    game.scene.add(OLD, NEW); OLD.visible = false;
    window.__mk = { OLD, NEW, best };
    const eye = [best.x - best.fx * 9, gy(best.x - best.fx * 9, best.z - best.fz * 9) + 1.9, best.z - best.fz * 9];
    const look = [best.x + best.fx * 40, gy(best.x + best.fx * 40, best.z + best.fz * 40) + 3.5, best.z + best.fz * 40];
    window.__mkCam = (far) => { game.cameraOverride = (dt, c) => { if (far) { c.position.set(eye[0] - best.fx * 60 + best.fz * 9, eye[1] + 7, eye[2] - best.fz * 60 - best.fx * 9); c.lookAt(look[0], look[1] + 12, look[2]); } else { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); } if (c.fov !== 55) { c.fov = 55; c.updateProjectionMatrix(); } return true; }; };
    window.__mkCam(false);
    game.timeExternal = true;
    // traffic parked in the frame hides the markers: hide cars near the stretch for the shots
    window.__hideCars = () => { for (const v of game.vehicles?.list || []) { const q = v.mesh?.position; if (q && Math.hypot(q.x - best.x, q.z - best.z) < 200) v.mesh.visible = false; } };
    if (!window.__hide) { window.__hide = document.createElement('style'); window.__hide.textContent = '#ps-hud, #title { display: none !important; }'; document.head.appendChild(window.__hide); }
    return JSON.stringify(best);
  })()`);
  console.log('road', setup);
  if (setup === 'no road') return;
  await b.sleep(20000); // let the streamed ground and roads around the stretch finish loading
  for (const [tod, name] of [
    [13, 'day'],
    [21.5, 'night'],
  ]) {
    await b.eval(
      `(() => { game.timeOfDay = ${tod}; game.env?.regenerateEnvMap?.(); return 1; })()`,
    );
    for (const far of [false, true]) {
      await b.eval(`(() => { window.__mkCam(${far}); return 1; })()`);
      for (const which of ['old', 'new']) {
        await b.eval(
          `(() => { __mk.OLD.visible = ${which === 'old'}; __mk.NEW.visible = ${which === 'new'}; return 1; })()`,
        );
        await b.eval('(window.__hideCars(), 1)');
        await b.sleep(2500);
        await b.eval('(window.__hideCars(), 1)');
        await b.screenshot(`${OUT}/markers_${which}_${name}${far ? '_far' : ''}.jpg`);
      }
    }
  }
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).slice(0, 10));
});
