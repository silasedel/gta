#!/usr/bin/env node
// look track: z-fighting check. Freezes a cinema wide shot (no motion, no handheld) and diffs two frames taken
// back to back; flicker shows up as speckle on static surfaces.
//   node src/render/.zfight.mjs --set after   (add --lookoff for the before)
import { withBrowser, GAME_READY } from '../../tools/v2/browser.mjs';

const a = process.argv.slice(2);
const o = {};
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
}
const SET = o.set || 'after';
const SHOTS = [
  { id: 'baywide', hour: 18.6, pos: [700, 25, -1330], look: [-2400, 80, 400], fov: 30 },
  { id: 'skyline', hour: 12.5, pos: [-900, 40, 300], look: [-2500, 80, 500], fov: 35 },
];
await withBrowser({ width: 1600, height: 900, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.lookoff ? '&lookoff' : ''));
  await b.waitFor(GAME_READY + ' && game.cinema && game.post', 420);
  for (const s of SHOTS) {
    await b.eval(`(() => {
      const s = ${JSON.stringify(s)};
      const T = window.THREE || game.THREE;
      if (game.time) game.time.paused = true;
      game.timeOfDay = s.hour;
      game.teleport(s.pos[0], null, s.pos[2], 0);
      game.cinema.begin({ letterbox: false, dof: false, flare: false, owner: 'zfight' });
      game.cinema.shot({ dur: 1000, speed: 0, handheld: 0, fov: s.fov, from: { pos: new T.Vector3(...s.pos), look: new T.Vector3(...s.look) } });
      if (!window.__zCss) { window.__zCss = document.createElement('style'); window.__zCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__zCss); }
      return true;
    })()`);
    await b.sleep(15000);
    await b.eval(`game.timeOfDay = ${s.hour}; true`);
    await b.sleep(2500);
    const near = await b.eval('game.camera.near');
    // two frames: make sure the page really rendered new frames in between (count rAF ticks)
    await b.screenshot(`docs/v2/shots/look/z_${SET}_${s.id}_a.png`);
    const ticks = await b.eval(
      'new Promise((res) => { let n = 0; const f = () => { if (++n < 3) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })',
    );
    await b.screenshot(`docs/v2/shots/look/z_${SET}_${s.id}_b.png`);
    console.log(s.id, 'frames between', ticks);
    console.log(s.id, 'near', near);
  }
  // full frame cost (scene + post) with scene MSAA 4x vs off, 10 renders between hard syncs, same frozen camera
  if (!o.lookoff) {
    const cost = await b.eval(`(() => {
      const r = game.renderer;
      const gl = r.getContext();
      const px = new Uint8Array(4);
      const sync = () => { r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      const L = game.quality.current.look;
      const keep = L.msaa;
      const out = {};
      for (const n of [4, 0, 4, 0]) {
        L.msaa = n;
        game.post.composer.render(0.016);
        game.post.composer.render(0.016);
        sync();
        const t = performance.now();
        for (let i = 0; i < 10; i++) game.post.composer.render(0.016);
        sync();
        const ms = (performance.now() - t) / 10;
        out['msaa' + n] = out['msaa' + n] ? Math.min(out['msaa' + n], +ms.toFixed(2)) : +ms.toFixed(2);
      }
      L.msaa = keep;
      out.buffer = [r.domElement.width, r.domElement.height];
      out.internal = game.post.internalSize;
      return out;
    })()`);
    console.log('cost', JSON.stringify(cost));
  }
});
