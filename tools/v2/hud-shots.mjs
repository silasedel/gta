// Stage 1 job 6 test: the top-right HUD corner against docs/v2/plan/hud_corner_target.webp.
// Loads the real game headless and muted, gives the player a pistol (clip 20 / reserve 73), lights all five evidence
// badges, forces wanted levels 0..6 through game.wanted and shoots the corner at 1920x1080 for each:
//   docs/v2/shots/stage1/hud_<n>.png          corner crop per wanted level
//   docs/v2/shots/stage1/hud_flash_a/b.png    3 stars while police have lost sight (flash on / off phase)
//   docs/v2/shots/stage1/hud_compare.png      target vs ours side by side, plus the 0..6 strip (tools/v2/hud-compare.py)
//   docs/v2/shots/stage1/hud_title.png        the title screen (frontend forced with ?menu=1): only the real title
// Usage: node tools/v2/hud-shots.mjs   (dev server on http://127.0.0.1:5200)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const OUT = 'docs/v2/shots/stage1';
const BASE = 'http://127.0.0.1:5200/';
const CLIP = { x: 1600, y: 0, width: 320, height: 380 };
fs.mkdirSync(OUT, { recursive: true });
const report = { levels: [], title: null, errors: [] };

await withBrowser({ width: 1920, height: 1080, maxSeconds: 900 }, async (b) => {
  // ---------------------------------------------------------------- title screen (frontend forced on)
  await b.goto(BASE + '?mute&menu=1');
  await b.waitFor(GAME_READY, 480);
  await b.waitFor('document.querySelector(".pm.in")', 120);
  await b.sleep(4000);
  await b.screenshot(`${OUT}/hud_title.png`);
  report.title = await b.eval(`(() => {
    const txt = document.body.innerText || '';
    return { oldTitle: !!document.querySelector('.ps-title, .ps-title-cta, .ps-logo-sub'), calora: /calora/i.test(txt), clickToPlay: /click to play/i.test(txt), frontend: !!document.querySelector('.pm') };
  })()`);
  console.log('title', JSON.stringify(report.title));

  // ---------------------------------------------------------------- gameplay (frontend skipped the way tests do)
  await b.goto(BASE + '?mute');
  if (!(await startGame(b, 180))) throw new Error('game did not start');
  const prep = `(() => {
    const P = game.player, W = game.weapons;
    try { W.give('pistol', 93); } catch (e) { P.inventory = [...new Set([...(P.inventory || []), 'pistol'])]; }
    try { W.select('pistol'); } catch (e) { P.weapon = 'pistol'; }
    P.weapon = 'pistol'; P.ammo.pistol = 93; P.clip.pistol = 20;
    game.hud.setKnown({ cameras: 1, witnesses: 1, outfit: 1, face: 1, weapon: 1 });
    return P.weapon;
  })()`;
  await b.eval(prep);
  for (let n = 0; n <= 6; n++) {
    await b.eval(
      `(() => { game.hud.setWantedFlash(false); if (${n} === 0) game.wanted.clear('hud test'); else game.wanted.set(${n}, game.player.position, { visual: true }); game.player.health = 100; game.player.ammo.pistol = 93; game.player.clip.pistol = 20; return game.wanted.level; })()`,
    );
    await b.sleep(900);
    const lvl = await b.eval('game.wanted.level');
    await b.screenshot(`${OUT}/hud_${n}.png`, { clip: CLIP });
    const stars = await b.eval('document.querySelectorAll(".ps-corner .hc-star.on").length');
    report.levels.push({ n, wanted: lvl, starsOn: stars });
    console.log(`wanted ${n}: game.wanted.level=${lvl} stars on=${stars}`);
  }
  // flashing (police lost sight): force it and catch both phases of the blink
  await b.eval(
    `(() => { game.wanted.set(3, game.player.position, { visual: true }); game.hud.setWantedFlash(true); return 1; })()`,
  );
  await b.sleep(300);
  // prove the blink runs live (sample the first earned star's fill), then freeze each phase for a stable screenshot
  const fills = [];
  for (let i = 0; i < 8; i++) {
    fills.push(
      await b.eval('getComputedStyle(document.querySelector(".ps-corner .hc-star.on")).fill'),
    );
    await b.sleep(130);
  }
  report.flashFills = [...new Set(fills)];
  console.log('flash fills seen:', report.flashFills.join(' / '));
  for (const [name, delay] of [
    ['a', '-0.1s'],
    ['b', '-0.6s'],
  ]) {
    await b.eval(`(() => { let st = document.getElementById('hud-shot-freeze'); if (!st) { st = document.createElement('style'); st.id = 'hud-shot-freeze'; document.head.appendChild(st); }
      st.textContent = '.ps-corner.evading .hc-star.on { animation-delay: ${delay} !important; animation-play-state: paused !important; }'; return 1; })()`);
    await b.sleep(200);
    await b.screenshot(`${OUT}/hud_flash_${name}.png`, { clip: CLIP });
  }
  await b.eval(`document.getElementById('hud-shot-freeze')?.remove(), 1`);
  await b.eval(
    `(() => { game.hud.setWantedFlash(null); game.hud.setKnown(null); game.wanted.clear('hud test'); return 1; })()`,
  );
  report.errors = b.errors.filter((e) => !/favicon/.test(e)).slice(0, 20);
});

fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync('docs/v2/reports/stage1-hud.json', JSON.stringify(report, null, 2));
execFileSync('python3', ['tools/v2/hud-compare.py', OUT], { stdio: 'inherit' });
const bad = report.levels.filter((l) => l.starsOn !== l.n);
console.log(bad.length ? `FAIL stars: ${JSON.stringify(bad)}` : 'stars 0..6: OK');
console.log((report.flashFills || []).length >= 2 ? 'flash: OK (blinking)' : 'flash: FAIL');
console.log(
  report.title && !report.title.oldTitle && !report.title.calora && !report.title.clickToPlay
    ? 'title: OK (frontend only)'
    : 'title: FAIL',
);
if (report.errors.length) console.log('console errors:', report.errors);
