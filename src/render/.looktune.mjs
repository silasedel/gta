#!/usr/bin/env node
// look track: live tuning of game.look (sun/shade balance) at one spot, several screenshots in one page.
//   node src/render/.looktune.mjs --spot house
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../tools/v2/browser.mjs';

const a = process.argv.slice(2);
const o = {};
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
}
const src = fs.readFileSync('src/render/.lookshots.mjs', 'utf8');
const views = JSON.parse(fs.readFileSync('docs/v2/shots/city-look/views.json', 'utf8'));
const stageSrc = src.slice(src.indexOf('const STAGE = (s) => `'), src.indexOf('const SETTLED'));
const STAGE = new Function('views', 'o', stageSrc + '\nreturn STAGE;')(views, o);
const SP = {
  sb: { hour: 11, kind: 'street', pose: views.sb },
  house: { hour: 11, kind: 'spawn' },
  cw: { hour: 12.5, kind: 'road', near: [942, -1305], re: 'Venetian', near2: [500, -110], re2: 'MacArthur' },
  jt: { hour: 15.5, kind: 'road', near: [0, -3600], re: 'Julia Tuttle|I-195|I 195', near2: [-1500, -3500], re2: 'I-195|I 195|Interstate 195' },
  dt15: { hour: 15.5, kind: 'street', pose: views.dt },
  dt13: { hour: 13, kind: 'street', pose: views.dt },
};
const VARS = JSON.parse(o.vars || '[["cur",{}],["strong",{"hemiDay":0.45,"envDay":0.6,"sunDay":1.25}]]');
await withBrowser({ width: 1600, height: 900, maxSeconds: 900 }, async (b) => {
  for (const spot of String(o.spot || 'house').split(',')) {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 420);
  await b.eval(`game.quality.set('high', { manual: true }) && true`);
  const st = await b.eval(STAGE(SP[spot]));
  if (st !== true) console.log('stage', spot, st);
  if (SP[spot].kind === 'road') console.log('road', JSON.stringify(await b.eval('window.__lookRoad')));
  await b.sleep(8000);
  console.log(JSON.stringify(await b.eval(`({ look: game.look, hemi: game.env.hemi.intensity, sun: game.env.sun.intensity, envI: game.scene ? game.scene.environmentIntensity : null, exp: game.renderer.toneMappingExposure, fog: game.scene && game.scene.fog ? game.scene.fog.density : null })`)));
  const base = await b.eval('JSON.stringify(game.look)');
  for (const [name, v] of VARS) {
    await b.eval(`Object.assign(game.look, ${base}, ${JSON.stringify(v)}) && true`);
    if (v.__js) await b.eval(v.__js);
    await b.sleep(1500);
    await b.screenshot(`docs/v2/shots/look/tune_${spot}_${name}.png`);
  }
  }
});
