#!/usr/bin/env node
// r2-render: find the source of a still-frame dot pattern at the QA camera (r0b_deck, 1280x720, 12:30): per variant, the QA's
// 2x2 checker metric (share of 2x2 cells with |a-b-c+d|/4 > 6) on one frame and on the mean of 16 frames (a temporal pattern
// vanishes in the mean, a fixed one does not), plus 2x crops of the QA's worst tile.
//   node tools/v2/render/ditherprobe.mjs [--tag dp1]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'dp1',
  D = 'docs/v2/shots/render/raw';
fs.mkdirSync(D, { recursive: true });
const FREEZE = 'window.__rFreeze(true);';
const VARS =
  o.set === 'filt'
    ? [
        ['filter', FREEZE],
        ['nofilter', FREEZE + 'game.renderTaaFilter = false;'],
        ['old', FREEZE + 'game.renderR2 = false;'],
      ]
    : o.set === 'aa'
      ? [
          ['new', FREEZE],
          ['msaa0', FREEZE + 'game.quality.current.look.msaa = 0;'],
          ['taaoff', FREEZE + 'game.quality.current.look.taa = false;'],
          ['old', FREEZE + 'game.renderR2 = false;'],
          ['vpfix_old', FREEZE + 'game.renderR2 = false; game.renderVPFix = true;'],
        ]
      : [
          ['default', ''],
          ['frozen', FREEZE],
          [
            'nofades',
            FREEZE +
              'game.scene.traverse((m) => { const u = m.material?.userData?.veg?.u; if (u?.uFade) u.uFade.value.set(0, 0, 0, 0); });',
          ],
          [
            'nograssA2C',
            FREEZE +
              "game.scene.traverse((m) => { const mt = m.material; if (mt && /groundGrass/.test(mt.name || '') && mt.alphaToCoverage) { mt.alphaToCoverage = false; mt.needsUpdate = true; } });",
          ],
          ['nopcss', FREEZE + 'game.look3Parts.pcss = false;'],
          ['old', FREEZE + 'game.renderR2 = false;'],
        ];
const rep = { tag: TAG, v: {} };
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12.5; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`,
  );
  await b.eval(fs.readFileSync('tools/v2/render/stab.page.js', 'utf8'));
  await b.eval(`window.__rDither = (n) => new Promise((res) => {
    const cvs = game.renderer.domElement, W = cvs.width, H = cvs.height, c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const cx = c2.getContext('2d', { willReadFrequently: true }), acc = new Float32Array(W * H); let k = 0, first = null, firstURL = null;
    const metric = (Y) => { let c = 0, n = 0; for (let y = 0; y + 1 < H; y += 2) for (let x = 0; x + 1 < W; x += 2) { const i = y * W + x; const e = Math.abs(Y[i] - Y[i + 1] - Y[i + W] + Y[i + W + 1]) / 4; if (e > 6) c++; n++; } return +(c / n).toFixed(4); };
    const post = game.post, orig = post.render;
    post.render = function (dt) { orig.call(this, dt); cx.drawImage(cvs, 0, 0); const d = cx.getImageData(0, 0, W, H).data; const Y = new Float32Array(W * H);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { Y[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; acc[j] += Y[j]; }
      if (!first) { first = Y; firstURL = c2.toDataURL('image/png'); }
      if (++k >= n) { post.render = orig; for (let j = 0; j < acc.length; j++) acc[j] /= n; res({ one: metric(first), mean: metric(acc), W, H, png: firstURL }); } };
  })`);
  const R = JSON.parse(fs.readFileSync('tools/v2/keys/spots_refs.json', 'utf8')).r0b_deck;
  await b.eval(
    `(() => { const NH = game.nicoHouse; const p = NH.toWorld(new game.THREE.Vector3(${R.eye[0]}, 0, ${R.eye[2] + 3})); game.teleport(p.x, undefined, p.z, 0); return 1; })()`,
  );
  await b.sleep(6000);
  for (let i = 0; i < 40; i++) {
    if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 3) break;
    await b.sleep(1000);
  }
  await b.eval(`(() => { const NH = game.nicoHouse, V = (a) => new game.THREE.Vector3(...a); const E = NH.toWorld(V(${JSON.stringify(R.eye)})), L = NH.toWorld(V(${JSON.stringify(R.look)}));
    game.cameraOverride = (dt, cam) => { cam.position.copy(E); cam.lookAt(L); if (cam.fov !== ${R.fov}) { cam.fov = ${R.fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
  console.log('console errors after boot:', [...new Set(b.errors)].length);
  for (const [name, js] of VARS) {
    await b.eval(
      `(() => { window.__rFreeze(false); game.renderR2 = true; game.renderVPFix = false; game.renderTaaFilter = true; game.look3Parts.pcss = true; game.quality.current.look.msaa = 4; game.quality.current.look.taa = 'always'; ${js} return 1; })()`,
    );
    await b.sleep(800);
    await b.eval('window.__rFrames(48)');
    const r = await b.eval('window.__rDither(16)');
    fs.writeFileSync(`${D}/${TAG}_${name}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
    rep.v[name] = { one: r.one, mean: r.mean };
    console.log(
      name,
      JSON.stringify(rep.v[name]),
      await b.eval(
        'JSON.stringify([game.post.taa?.enabled, game.post.taa?.jx, game.quality.current.look.msaa, game.camera.projectionMatrix.elements[8]])',
      ),
    );
  }
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
});
fs.writeFileSync(`docs/v2/reports/render-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(rep.errors.length ? 'ERRORS\n' + rep.errors.join('\n') : 'no errors');
