import { defineConfig } from 'vite';

// Relative base so the production build works at any URL path.
// The game code asks for public files at absolute paths ('/assets/...'). On GitHub Pages the game lives under a
// sub-path (silasedel.github.io/gta-v2/), so the Pages build sets PAGES_BASE=/gta-v2/ and this plugin rewrites
// those absolute asset paths in JS and CSS to that sub-path. Dev, preview and the Mac app (served at the root)
// are unaffected because PAGES_BASE is unset there.
const PAGES_BASE = process.env.PAGES_BASE || '';
const pagesAssets = () => ({
  name: 'pages-asset-base',
  enforce: 'pre',
  transform(code, id) {
    if (!PAGES_BASE || id.includes('node_modules') || !/\.(m?js|ts|css)(\?|$)/.test(id)) return null;
    if (!code.includes('/assets/')) return null;
    const out = code.replace(/(['"`(]|url:)\/assets\//g, (m, p) => `${p}${PAGES_BASE}assets/`);
    return out === code ? null : { code: out, map: null };
  },
});

export default defineConfig({
  base: './',
  plugins: [pagesAssets()],
  build: { chunkSizeWarningLimit: 4000 },
});
