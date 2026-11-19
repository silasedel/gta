#!/usr/bin/env node
// r4-library: gas station interior preview, close shot of the library commercial bin (was a code-built lathe can) + errors.
//   node tools/v2/library/r4-interior.mjs [--q "&libprops=0"]
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
const a = process.argv.slice(2);
const Q = a.includes('--q') ? a[a.indexOf('--q') + 1] : '',
  TAG = a.includes('--tag') ? a[a.indexOf('--tag') + 1] : 'r4';
const D = 'docs/v2/shots/library';
fs.mkdirSync(D, { recursive: true });
await withBrowser({ width: 1280, height: 800, maxSeconds: 300 }, async (b) => {
  await b.goto(
    'http://127.0.0.1:5200/src/world/interiors/preview.html?type=gas-convenience&n=1&hud=0&post=1' +
      Q,
  );
  await b.waitFor('window.ready === true', 180);
  await b.sleep(2500);
  const r = await b.eval(
    `JSON.stringify((() => { let hit = null; scene.traverse((o) => { if (hit || !o.isMesh) return; const ms = [].concat(o.material); if (ms.some((m) => /TrashCommercial/.test(m.name || ''))) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); hit = { c: bb.getCenter(new bb.min.constructor()).toArray(), s: bb.getSize(new bb.min.constructor()).toArray() }; } }); return hit; })())`,
  );
  console.log('bin', r);
  const B = JSON.parse(r || 'null');
  if (B) {
    // the bin sits by the door inside the front wall: look at it from inside the store
    const [x, y, z] = B.c;
    await b.eval(
      `(() => { camera.position.set(${x} + 1.4, 1.5, ${z} - 2.0); camera.lookAt(${x}, 0.55, ${z}); return 1; })()`,
    );
    await b.sleep(1500);
    await b.screenshot(`${D}/${TAG}_gas_bin.jpg`);
  }
  console.log('frameMax', await b.eval('window.frameMax'));
  const errs = [...new Set(b.errors)];
  console.log('CONSOLE ERRORS', errs.length, errs.slice(0, 6).join('\n'));
});
