#!/usr/bin/env node
// Collider audit (overnight props pass): for each street prop type, up to N instances in game, a close camera shot with the
// Rapier colliders drawn as a wireframe over the mesh (green = dynamic body, yellow = small fixed body, red = static soup).
// One contact sheet per type: docs/v2/shots/props/colliders/<type>.jpg
//   node tools/v2/street-models/collider-audit.mjs [--n 20] [--only cart,hydrant]
import fs from 'node:fs'; import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import { execFileSync } from 'node:child_process';
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const N = +(o.n || 20), DIR = path.resolve('docs/v2/shots/props/colliders'), TMP = fs.mkdtempSync('/tmp/colaudit-'); fs.mkdirSync(DIR, { recursive: true });
const H = fs.readFileSync(new URL('./steps/helpers.js', import.meta.url), 'utf8'), OV = fs.readFileSync(new URL('./steps/coloverlay.js', import.meta.url), 'utf8');
// [type, place [x, z], js returning [{x, y, z}] candidates, camera distance, height]
const lotOf = (re) => `[...game.lotProps.owners.values()].flat().filter((i) => /${re}/.test(i.name)).map((i) => ({ x: i.x, y: i.y, z: i.z }))`;
const TYPES = [
  ['cart', [-866, 4836], lotOf('^(cart|bin_wheel)$'), 2.6, 1.4], ['mailbox_post', [-866, 4836], lotOf('^mailbox'), 2.6, 1.5],
  ['stop_sign', [-866, 4836], "game.regSigns.list(game.player.position.x, game.player.position.z, 160)", 3.2, 1.8],
  ['utility_pole', [-866, 4836], "__findKind('upole', -866, 4836, 400)", 4.5, 2.5],
  ['hydrant', [407, -110], "__findKind('hydrant', 407, -110, 500)", 2.2, 1.2], ['bench', [407, -110], "__findKind('bench', 407, -110, 400)", 2.8, 1.5],
  ['street_bin', [407, -110], "__findKind('bin', 407, -110, 400)", 2.4, 1.4], ['parking_meter', [407, -110], "__findKind('meter', 407, -110, 400)", 2.4, 1.4],
  ['sign_post', [407, -110], "__findKind('signPost', 407, -110, 400)", 3.2, 1.8], ['bus_shelter', [407, -110], "__findKind('shelter', 407, -110, 900)", 6, 2.4],
  ['signal_pole', [407, -110], "__findKind('sigPole', 407, -110, 400)", 5, 2.5], ['street_lamp', [407, -110], "__findKind('lamp', 407, -110, 300)", 4.5, 2.5],
  ['planter', [407, -110], "__workNear(407, -110, 800).filter((p) => /planter/.test(p.v))", 2.6, 1.6], ['jersey_site', [560, 40], "__workNear(560, 40, 1500).filter((p) => /jersey|site_cabin|barricade2|rolloff|tarp/.test(p.v))", 5, 2.5],
  ['cafe_table_chairs', [2398, 660], "__findKind('cafe', 2398, 660, 900)", 3, 1.8], ['bike_rack', [2398, 660], "__findKind('bike', 2398, 660, 900).concat(__findKind('bike', 407, -110, 600))", 3.4, 1.6],
];
const only = o.only ? String(o.only).split(',') : null;
await withBrowser({ width: 960, height: 720, maxSeconds: +(o.max || 2400) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) console.log('WARN title');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; window.__spawn = [game.player.position.x, game.player.position.z]; const e0 = game.emit; game.emit = (n, d) => (n === 'crime' || n === 'witness' ? 0 : e0.call(game, n, d)); return 1; })()`);
  await b.eval(H); await b.eval(OV);
  let at = null;
  for (const [type, place, js, dist, h] of TYPES) {
    if (only && !only.includes(type)) continue;
    if (!at || at[0] !== place[0]) { await b.eval(`(() => { game.cameraOverride = null; game.teleport(${place[0]}, undefined, ${place[1]}, 0); return 1; })()`); await b.sleep(4000); for (let i = 0; i < 60; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 2) break; await b.sleep(1000); } await b.sleep(2500); at = place; }
    const list = JSON.parse(await b.eval(`JSON.stringify((${js}).slice(0, ${N}))`) || '[]'); const files = [];
    for (let k = 0; k < list.length; k++) {
      const p = list[k];
      const n = await b.eval(`(() => { const p = ${JSON.stringify(p)}; const y = p.y ?? (game.city.groundHeightAt(p.x, p.z) || 0); __lookAt(p.x, y, p.z, ${dist}, ${h}, ${(k % 3 - 1) * 0.6}); return __colOverlay(p.x, y + 0.5, p.z, ${Math.max(1.6, dist * 0.6)}); })()`);
      await b.sleep(450); const f = path.join(TMP, `${type}_${k}.png`); await b.screenshot(f, { clip: { x: 180, y: 90, width: 600, height: 540 } }); files.push(f);
    }
    await b.eval(`(() => { if (window.__colLines) { game.scene.remove(window.__colLines); window.__colLines = null; } return 1; })()`);
    if (files.length) { execFileSync('python3', ['-c', `import sys\nfrom PIL import Image, ImageDraw\nfs=sys.argv[2:]; c=5; w,h=300,270\nS=Image.new('RGB',(c*w,((len(fs)+c-1)//c)*h),'white')\nfor i,f in enumerate(fs):\n  im=Image.open(f).convert('RGB').resize((w,h)); S.paste(im,((i%c)*w,(i//c)*h))\nImageDraw.Draw(S).text((6,6),sys.argv[1].split('/')[-1][:-4]+' ('+str(len(fs))+')',fill=(255,255,0))\nS.save(sys.argv[1] if sys.argv[1].endswith('.jpg') else sys.argv[1], quality=82)`, path.join(DIR, type + '.jpg'), ...files]); }
    console.log(type, 'instances', list.length, '->', path.relative(process.cwd(), path.join(DIR, type + '.jpg')));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n').slice(0, 2000));
});
fs.rmSync(TMP, { recursive: true, force: true });
