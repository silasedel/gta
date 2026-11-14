// SOUTHLINE UI: the shared UI context. Built once by createHUD (hud.js) and by the dev pages; every UI module
// receives it:   createThing(game, ctx)
//   ctx.root      the .ps-ui root element (classes for scale, colorblind, reduced motion live here)
//   ctx.layer(name) -> a full-screen layer element in z order: 'world' < 'hud' < 'toast' < 'phone' < 'screen' < 'modal' < 'top'
//   ctx.settings  settings store (get / set / on)          ctx.bindings  input layer (glyphs, modes, actions)
//   ctx.nav       focus navigation (push scopes)           ctx.svc       guarded access to other tracks' systems
//   ctx.t         translate('English text')                ctx.sfx(name) UI sound hook ('move','select','back','tab','tick','deny','open','close','notify')
//   ctx.notify(text, ms, opts)  HUD notification (set by the HUD)   ctx.bus  UI-only events (on / emit)
import '../styles/fonts.css';
import '../styles/tokens.css';
import { el, emitter } from './dom.js';
import { createBindings } from '../input/bindings.js';
import { createFocusNav } from './focusNav.js';
import { createSettings } from '../settings/store.js';
import { createServices } from './services.js';
import { createI18n } from './i18n.js';

const LAYERS = ['world', 'hud', 'toast', 'phone', 'screen', 'modal', 'top'];

// Fonts are bundled (src/ui/styles/fonts.css, OFL): nothing is fetched from a font CDN (the desktop app is offline).
export function injectFonts() { /* kept for callers: fonts.css is imported above */ }

export function createUIContext(game, opts = {}) {
  if (game.uiContext && !opts.fresh) return game.uiContext;
  injectFonts();
  const root = opts.root || el('div', { class: 'ps-ui', id: 'ps-ui' });
  if (!root.isConnected) document.body.appendChild(root);
  const layers = {};
  for (const n of LAYERS) { layers[n] = el('div', { class: 'ps-layer ps-layer-' + n }); root.appendChild(layers[n]); }
  const bindings = createBindings(game, opts.bindings);
  const settings = createSettings(game, { bindings });
  settings.attach(root);
  const svc = createServices(game, settings);
  const sfx = (name, o) => svc.audio(name, o);
  const nav = createFocusNav(bindings, { sfx });
  const t = createI18n(() => settings.get('language'));
  const bus = emitter();
  const ctx = {
    game, root, layers, layer: (n) => layers[n] || layers.hud, bindings, settings, nav, svc, t, sfx, bus,
    notify: (text, ms, o) => game.hud?.notify?.(text, ms, o),
    reduced: () => !!settings.get('reducedMotion'),
  };
  game.uiContext = ctx; game.bindings = bindings; game.uiSettings = settings;
  settings.applyAll();
  return ctx;
}
