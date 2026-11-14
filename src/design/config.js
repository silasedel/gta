// Where design assets are served from. The default is relative to index.html (works under any base path);
// standalone preview pages under /src/ call setAssetBase('/assets/design/').
let base = 'assets/design/';
try { const b = import.meta.env && import.meta.env.BASE_URL; if (b && b !== './' && b !== '/') base = b.replace(/\/?$/, '/') + 'assets/design/'; } catch (e) { /* not under Vite */ }
export function assetBase() { return base; }
export function setAssetBase(url) { base = String(url).replace(/\/?$/, '/'); }
