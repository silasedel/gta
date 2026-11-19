// Pause menu redesign + subway map layer: screenshots of every tab, the map with the subway layer on / off, the
// Settings tab scrolled to Codes, plus a keyboard navigation check (Q / E tabs, arrows on Settings, Esc resumes).
//   node tools/v2/mapui/pause-shots.mjs     (dev server on http://127.0.0.1:5200)
//   -> docs/v2/shots/pause/*.png
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';

const OUT = 'docs/v2/shots/pause';
const BASE = process.env.BASE || 'http://127.0.0.1:5200/';
fs.mkdirSync(OUT, { recursive: true });
const press = async (b, code, key) => { await b.key(code, true, key); await b.sleep(40); await b.key(code, false, key); await b.sleep(160); };

await withBrowser({ width: 1600, height: 900, maxSeconds: 600 }, async (b) => {
  await b.goto(BASE + '?mute');
  if (!(await startGame(b, 240))) throw new Error('game did not start');
  await b.sleep(2500);
  // wait for the frontend to build the UI context (settings store) and the metro stations
  await b.waitFor('window.game && game.uiContext && game.uiContext.settings', 60);
  await b.waitFor('window.game && game.metro && game.metro.stations && game.metro.stations.length > 1', 60).catch(() => {});
  const shot = async (n) => { await b.sleep(700); await b.screenshot(`${OUT}/${n}.png`); console.log('shot', n); };
  await b.eval('game.hud.setPaused(true, false), 1');
  await b.sleep(800);
  // fit the whole map so the line is visible
  await b.eval(`(() => { const z = document.querySelector('.ps-map-zoom button[data-z="fit"]'); z && z.click(); return 1; })()`);
  await b.eval(`(() => { game.uiSettings.set('mapSubway', true); return 1; })()`);
  await shot('map_subway_on');
  await press(b, 'KeyU', 'u');
  const off = await b.eval('game.settings.mapSubway');
  await shot('map_subway_off');
  await press(b, 'KeyU', 'u');
  const on = await b.eval('game.settings.mapSubway');
  // zoom toward downtown for a closer look
  await b.eval(`(() => { const c = document.querySelector('.ps-bigmap'); const r = c.getBoundingClientRect(); const ev = new WheelEvent('wheel', { deltaY: -400, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }); c.dispatchEvent(ev); return 1; })()`);
  await b.sleep(900);
  await shot('map_subway_zoom');
  // tabs by keyboard: E -> Wardrobe, Settings, Controls, Stats
  const tabs = [];
  for (const n of ['wardrobe', 'settings', 'controls', 'stats']) {
    await press(b, 'KeyE', 'e');
    tabs.push(await b.eval(`document.querySelector('.ps-tab.on').textContent`));
    await shot('tab_' + n);
  }
  // back to Settings, arrows move focus, right changes a value
  await press(b, 'KeyQ', 'q'); await press(b, 'KeyQ', 'q');
  const f0 = await b.eval(`(document.querySelector('.ps-pause .is-focus')||{}).dataset?.key || (document.querySelector('.ps-pause .is-focus')||{}).className`);
  await press(b, 'ArrowDown', 'ArrowDown'); await press(b, 'ArrowDown', 'ArrowDown');
  const f1 = await b.eval(`(document.querySelector('.ps-pause .is-focus')||{}).dataset?.key || ''`);
  await shot('settings_focus');
  // scroll to the Codes section via the rail
  await b.eval(`(() => { document.querySelector('.pz-rail-b[data-sec="codes"]').click(); return 1; })()`);
  await b.sleep(900);
  await shot('settings_codes');
  // open the code panel from Settings
  await b.eval(`(() => { document.querySelector('[data-key="codes"]').click(); return 1; })()`);
  await shot('codes_panel');
  await press(b, 'Escape', 'Escape');
  const stillPaused = await b.eval('game.ui.paused');
  const panelOpen = await b.eval(`document.querySelector('.ps-dev-panel').classList.contains('open')`);
  // Esc resumes
  await b.sleep(500);
  await press(b, 'Escape', 'Escape');
  const resumed = await b.eval('!game.ui.paused');
  const mode = await b.eval('game.bindings && game.bindings.mode');
  // controller path through the same focus scope: RB -> next tab, B -> resume
  await b.eval('game.hud.setPaused(true, false), 1'); await b.sleep(500);
  const t0 = await b.eval(`document.querySelector('.ps-tab.on').textContent`);
  await b.eval(`game.uiContext.nav.send('tabNext', 'pad'), 1`); await b.sleep(300);
  const t1 = await b.eval(`document.querySelector('.ps-tab.on').textContent`);
  await b.eval(`game.uiContext.nav.send('back', 'pad'), 1`); await b.sleep(400);
  const padResumed = await b.eval('!game.ui.paused');
  // minimap with the subway line on, next to Downtown station
  await b.eval(`(() => { const s = game.metro.stations[2]; const y = game.city?.groundHeightAt?.(s.kx + 30, s.kz + 30) ?? 2; game.teleport(s.kx + 30, y + 1, s.kz + 30); game.uiSettings.set('mapSubwayMini', true); return 1; })()`);
  await b.sleep(2500);
  for (let i = 0; i < 4; i++) { await press(b, 'Enter', 'Enter'); await b.sleep(1500); }   // skip the district arrival intro
  await b.sleep(3000);
  await b.screenshot(`${OUT}/minimap_subway.png`);
  await b.eval(`(() => { game.uiSettings.set('mapSubwayMini', false); return 1; })()`);
  const res = { padTabs: [t0, t1], padResumed, off, on, tabs, f0, f1, stillPausedAfterPanelEsc: stillPaused, panelOpenAfterEsc: panelOpen, resumed, modeAfter: mode, errors: b.errors.slice(0, 20) };
  console.log(JSON.stringify(res, null, 1));
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(res, null, 1));
});
