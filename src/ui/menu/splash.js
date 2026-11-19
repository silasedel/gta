// SOUTHLINE: the boot screen (main-menu track). Imported first by main.js: while the engine loads, the shared loading
// screen (loadScreen.js: stylized key art, logo, LOADING bar, tips) sits inside #loading. main.js keeps writing
// #loadmsg / #loadpct; this mirrors them into the bar. main.js fades and removes #loading; the live title is under it.
import { createLoadScreen } from './loadScreen.js';
import { installQuickTitle, quickTitleEnabled } from './quickTitle.js';
import * as loadingMusic from '../../audio/loadingMusic.js';
import { mountMusicMute } from './musicMute.js';

function install() {
  const L = document.getElementById('loading');
  if (!L || L.dataset.sl) return;
  L.dataset.sl = '1';
  // the first loading screen plays the same loop as the second (user): started here, before the engine exists, on a private AudioContext
  try {
    loadingMusic.start({}, { owner: 'boot' });
    window.__bootLoop = true;
  } catch (e) {
    console.warn('[boot music]', e);
  }
  try {
    mountMusicMute();
  } catch (e) {
    /* */
  }
  for (const c of L.children) c.style.visibility = 'hidden';
  L.style.background = '#12061c';
  const ls = createLoadScreen({ mount: L });
  ls.el.style.position = 'absolute';
  const pc = document.getElementById('loadpct'),
    mg = document.getElementById('loadmsg');
  const t = setInterval(() => {
    if (!L.isConnected) {
      clearInterval(t);
      return;
    }
    const p = parseFloat(pc?.textContent || '0') || 0;
    ls.set(p, (mg?.textContent || '').replace(/^LOADING$/, 'Starting up'));
  }, 120);
  // r2-web: the title and menu go up at once, over the loading screen, while the engine loads behind them
  if (quickTitleEnabled()) {
    try {
      installQuickTitle();
    } catch (e) {
      console.warn('[quickTitle] skipped', e);
    }
  }
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}
