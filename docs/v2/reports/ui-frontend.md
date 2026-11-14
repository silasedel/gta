# ui-frontend: handoff (paused Nov 13, about 5:45 PM MST)
**The game is untouched and bootable:** `src/ui/hud.js`, `hud.css`, `mapRender.js` are the v1 files, unmodified. Nothing new is imported by the game yet. No `.v2.js` module exists. Nothing is verified except one look at the logo.
## What exists (all new, all parse with esbuild, none run in the game)
- `src/ui/brand.js`: the ONE constant for the game name (wordmark, titles). `src/ui/core/logo.js`: original SVG wordmark + tide-sun emblem, reads BRAND, type fallback for unknown letters (looked at: good).
- `src/ui/styles/tokens.css`: design guide (header comment), variables, `--u` scaling unit, component kit, colorblind and reduced-motion classes.
- `src/ui/core/`: `dom.js` helpers, `icons.js` (about 150 original line icons + weapon silhouettes; NOT yet viewed, some paths may be off), `focusNav.js` (keyboard/controller spatial focus), `services.js` (guarded access to core-systems, story, net, etc.), `i18n.js`, `context.js` (`createUIContext(game)`: layers, bindings, settings, nav, svc).
- `src/ui/input/bindings.js`: rebinding by synthetic canonical key events, Gamepad API polling, UI/phone/capture modes, glyphs, `formatPrompt`. Untested.
- `src/ui/settings/schema.js` + `store.js`: full schema, presets, auto-detect, localStorage, live apply, emits `'settings:changed'`, `adopt(game.settingsStore)`. Untested. No settings UI yet.
- `src/ui/map/mapCore.js`: new tile engine (level commit + cross-fade so no flicker, depth bands, land-cover kinds, shields, zoom-step label layout, POI categories with monotonic declutter, themes). Written, never run.
- Dev: `src/ui/dev/mockGame.js`, `mockSystems.js`, `kit.html` (`?s=logo|kit|icons`). `mockGame` world `'florida'` needs `src/ui/dev/mockWorld.js`, which does not exist.
- Test runner (prints console errors): scratchpad `ui-frontend/run.mjs`; copy it to `tools/` if kept.
## Not started
Map view (pan/zoom/inertia, overlays, fog, fast travel, legend), minimap, pixel-diff sweep; main menu and 3D background; pause menu; settings UI; HUD polish and evidence slot; phone; loading restyle; every screenshot and navigation test.
## Next steps, in the lead's order
1. `src/ui/map/mapView.js` (pause map + minimap on mapCore), test page on real Miami data via `mockGame({world:'miami'})`, then swap into hud.js. 2. Main menu using `game.cameraOverride`, `player.script.lock`, `bindings.pushMode('ui')`. 3. Settings view from `SCHEMA`. 4. Restyle the v1 HUD with tokens; add date, cash vs. bank, stamina, `<div data-slot="evidence">` under the stars. 5. Phone.
Planned approach: keep v1 hud.js as the HUD core, strip its title/pause/phone/map parts and call the new modules. Subagents could not be spawned (limit of 20 reached).
## Needs from the lead
None yet. Later: apply `game.settings.fpsLimit`, `cameraShake`, `cameraAutoCenter` in main.js; allow walking while `ui.phoneOpen`.
