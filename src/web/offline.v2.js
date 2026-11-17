// Southline web build (r2-web): offline cache registration. Inert unless the page carries
// <meta name="sl-sw" content="sw.js">, which only the GitHub Pages build (tools/v2/web/build-pages.mjs) injects, so the
// dev server, the 5201 preview and the Mac app never get a service worker. ?sw=0 turns it off; ?sw=unregister removes it.
// The worker is registered once the game is live (it never competes with the first load), then the page hands it the
// list of files it already loaded so they are copied in from the HTTP cache; everything streamed later is cached as it
// arrives (src: tools/v2/web/sw.template.js).
export const order = 990;

export async function initV2(game) {
  const meta = document.querySelector('meta[name="sl-sw"]');
  const q = new URLSearchParams(location.search).get('sw');
  if (!('serviceWorker' in navigator)) return;
  if (q === 'unregister') { for (const r of await navigator.serviceWorker.getRegistrations()) r.unregister(); return; }
  if (!meta || q === '0') return;
  const url = new URL(meta.content || 'sw.js', document.baseURI);
  const scope = new URL('./', document.baseURI).pathname;
  const state = (game.offline = { registered: false, warmed: 0, controlled: !!navigator.serviceWorker.controller });
  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register(url, { scope });
      state.registered = true;
      await navigator.serviceWorker.ready;
      const sw = reg.active || navigator.serviceWorker.controller;
      if (!sw) return;
      const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin + scope)))];
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'warmed') state.warmed = e.data.n; });
      sw.postMessage({ type: 'warm', urls });
    } catch (e) { console.warn('[offline] service worker not registered', e?.message || e); }
  };
  // after control (title gone), or 20 s after the game is ready, in idle time
  const t0 = performance.now();
  const wait = setInterval(() => {
    const live = game.ready && (!game.ui?.title || performance.now() - t0 > 20000);
    if (!live) return;
    clearInterval(wait);
    (window.requestIdleCallback || setTimeout)(() => start(), { timeout: 4000 });
  }, 500);
}
