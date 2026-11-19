// r2-mapui: top-right HUD corner shots in the real game (muted): 1920x1080 at DPR 1 and DPR 2 (Retina), day and night,
// with a weapon out and with none (money rows). Usage: node tools/v2/hudcorner/corner-shots.mjs <tag>
//   -> docs/v2/shots/hudcorner/corner_<tag>_<dpr1|dpr2>_<day|night>_<gun|none>.png (+ full frames *_full.jpg)
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';

const TAG = process.argv[2] || 'now';
const OUT = 'docs/v2/shots/hudcorner';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1920, height: 1080, maxSeconds: 1800 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  if (!(await startGame(b, 300))) throw new Error('game did not start');
  await b.sleep(4000);
  const setW = (on) =>
    b.eval(`(() => { const P = game.player, W = game.weapons;
    if (${on}) { try { W.give('pistol', 93); } catch (e) {} try { W.select('pistol'); } catch (e) {} P.weapon = 'pistol'; P.ammo.pistol = 93; P.clip.pistol = 20; }
    else { try { W.select('fist'); } catch (e) {} P.weapon = 'fist'; }
    P.money = 15150; game.hud.setKnown({ cameras: 1, witnesses: 1, outfit: 1, face: 1, weapon: 1 });
    game.wanted.set(4, P.position, { visual: true }); game.player.health = 100; return P.weapon; })()`);
  for (const dpr of [1, 2]) {
    await b.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: dpr,
      mobile: false,
    });
    await b.sleep(2500);
    for (const [tod, name] of [
      [13, 'day'],
      [22, 'night'],
    ]) {
      await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = ${tod}; return 1; })()`);
      for (const gun of [true, false]) {
        await setW(gun);
        await b.sleep(1500);
        const f = `${OUT}/corner_${TAG}_dpr${dpr}_${name}_${gun ? 'gun' : 'none'}`;
        await b.screenshot(f + '.png', { clip: { x: 1520, y: 0, width: 400, height: 460 } });
        if (dpr === 1) await b.screenshot(f + '_full.jpg');
      }
    }
  }
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).slice(0, 8));
});
