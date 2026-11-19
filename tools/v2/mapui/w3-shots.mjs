// W3 (Nov 19 playtest) menus + HUD check: title mute button, pause tab order / opens on Map, Settings Dev mode row,
// wanted + police tag + radio + help / NPC prompts, dev-teleport loading screen, death card.
//   node tools/v2/mapui/w3-shots.mjs [all|hud]   (hud skips the title + pause checks)  -> docs/v2/shots/w3/*.png
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
const OUT = 'docs/v2/shots/w3';
const BASE = process.env.BASE || 'http://127.0.0.1:5200/';
const ONLY = process.argv[2] || 'all';
fs.mkdirSync(OUT, { recursive: true });
const res = {};
await withBrowser({ width: 1600, height: 900, maxSeconds: 290 }, async (b) => {
  const shot = async (n, ms = 600) => {
    await b.sleep(ms);
    await b.screenshot(`${OUT}/${n}.png`);
    console.log('shot', n);
  };
  await b.goto(BASE + (ONLY === 'hud' ? '' : '?menu=1'));
  if (ONLY !== 'hud') {
    await b.sleep(9000);
    res.muteBtn = await b.eval(
      `(() => { const m = document.querySelector('.sl-mute'); return m ? { show: m.classList.contains('show'), muted: m.classList.contains('muted') } : null; })()`,
    );
    await shot('title_mute');
  }
  if (!(await startGame(b, 200))) throw new Error('game did not start');
  await b.sleep(4000);
  await b.waitFor('window.game && game.uiContext && game.uiContext.settings', 60);
  if (ONLY !== 'hud') {
    // pause: always lands on Map, tab order
    await b.eval(`game.hud.setPaused(true, false), 1`);
    await b.sleep(500);
    res.tabs = await b.eval(
      `[...document.querySelectorAll('.ps-tab')].map((t) => t.textContent).join(',')`,
    );
    res.openTab1 = await b.eval(`document.querySelector('.ps-tab.on').textContent`);
    await b.eval(`document.querySelectorAll('.ps-tab')[3].click(), 1`);
    await b.eval(`game.hud.setPaused(false, false), 1`);
    await b.sleep(300);
    await b.eval(`game.hud.setPaused(true, false), 1`);
    await b.sleep(500);
    res.openTab2 = await b.eval(`document.querySelector('.ps-tab.on').textContent`);
    await b.eval(`document.querySelectorAll('.ps-tab')[1].click(), 1`);
    await b.sleep(400);
    await b.eval(
      `(() => { const r = document.querySelector('[data-key="devMode"]'); const sc = r.closest('.ps-scroll'); sc.style.scrollBehavior = 'auto'; sc.scrollTop = sc.scrollHeight; return 1; })()`,
    );
    await shot('settings_devmode');
    // dev toggle: on -> asks for code
    await b.eval(
      `game.dev.setOn(false), document.querySelector('[data-key="devMode"]').click(), 1`,
    );
    await b.sleep(400);
    res.panelOpen = await b.eval(
      `document.querySelector('.ps-dev-panel').classList.contains('open')`,
    );
    for (const d of '6969') {
      await b.key('Digit' + d, true, d);
      await b.key('Digit' + d, false, d);
      await b.sleep(60);
    }
    await b.key('Enter', true, 'Enter');
    await b.key('Enter', false, 'Enter');
    await b.sleep(1200);
    res.devOnAfterCode = await b.eval(`game.dev.on`);
    res.panelClosed = await b.eval(
      `!document.querySelector('.ps-dev-panel').classList.contains('open')`,
    );
    await shot('settings_devmode_on', 200);
    await b.eval(`document.querySelector('[data-key="devMode"]').click(), 1`);
    await b.sleep(300);
    res.devOffNoCode = await b.eval(
      `!game.dev.on && !document.querySelector('.ps-dev-panel').classList.contains('open')`,
    );
    await b.eval(`game.hud.setPaused(false, false), 1`);
    await b.sleep(400);
  }
  // HUD: wanted + police tag + radio card + help prompt + NPC prompt
  await b.eval(`(() => { try { game.dev.setPoliceLock(false, true); } catch (e) {} game.wanted.add(3, game.player.position.clone());
    const h = document.querySelector('.ps-help'); h.innerHTML = 'Press <kbd>E</kbd> to use payphone'; h.classList.add('on');
    game.emit('police:radio', { speaker: 'Dispatch', code: 'Condition Red', priority: 3, text: 'Condition Red. Blocks and sticks authorized. PIT at your discretion.' });
    const p = document.createElement('div'); p.className = 'npcTalkPrompt w3probe'; p.style.display = 'block'; p.innerHTML = '<b>U</b>Talk to Marisol'; document.body.appendChild(p);
    return 1; })()`);
  await shot('hud_wanted_help', 1500);
  res.copTag = await b.eval(
    `(() => { const t = document.querySelector('.hc-police'); return t ? t.className + ' ' + t.textContent : null; })()`,
  );
  await b.eval(
    `(() => { try { Object.defineProperty(game.wanted, 'evading', { configurable: true, get: () => true }); } catch (e) {} game.hud.setWantedFlash(true); return 1; })()`,
  );
  await shot('hud_wanted_evading', 900);
  res.copTagSearch = await b.eval(
    `(() => { const t = document.querySelector('.hc-police'); return t ? t.className + ' ' + t.textContent : null; })()`,
  );
  await b.eval(
    `(() => { try { delete game.wanted.evading; } catch (e) {} game.hud.setWantedFlash(null); game.wanted.clear(); document.querySelector('.w3probe')?.remove(); document.querySelector('.ps-help').classList.remove('on'); return 1; })()`,
  );
  // dev teleport: the main menu's loading screen
  await b.eval(
    `(() => { game.dev.setOn(true); const p = game.player.position; game.dev.teleportTo(p.x + 400, p.z + 150); return 1; })()`,
  );
  await shot('dev_teleport_loading', 1800);
  await b.waitFor('!game.dev.busy', 45).catch(() => {});
  res.teleport = await b.eval('JSON.stringify(game.dev.lastTeleport)');
  res.loadGone = await b.eval(
    `!document.querySelector('.sl-load') || getComputedStyle(document.querySelector('.sl-load')).display === 'none'`,
  );
  await b.eval('game.dev.setOn(false), 1');
  // death card
  await b.eval(`(() => { game.ui.dead = true; return 1; })()`);
  await shot('death', 1600);
  await b.eval(`(() => { game.ui.dead = false; return 1; })()`);
  if (b.errors.length) res.errors = b.errors.slice(0, 8);
});
fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 2));
