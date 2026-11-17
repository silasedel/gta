// Southline page entry (r2-web). A tiny first script: the loading screen and the quick title (src/ui/menu/splash.js)
// paint from this chunk alone (a few KB plus the key art), then the engine (main.js, three.js, Rapier: ~5 MB) loads as
// its own chunk behind them. Before this, nothing could paint until the whole engine bundle was downloaded and parsed.
// gltfDecoders.js (Draco / meshopt for every GLTFLoader) downloads in parallel; it is evaluated long before the first
// model is parsed (boot starts with physics, sky and map data).
import '../ui/menu/splash.js';

const fail = (e) => {
  console.error('[boot] engine failed to load', e);
  const m = document.getElementById('loadmsg'); if (m) m.textContent = 'ERROR: the game could not load. Reload the page.';
  const p = document.getElementById('loadpct'); if (p) p.textContent = '100%';
};
import('./gltfDecoders.js').catch((e) => console.warn('[boot] model decoders', e));
import('../main.js').catch(fail);
