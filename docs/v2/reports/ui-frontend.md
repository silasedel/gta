# ui-frontend: report (Nov 13, about 7:45 PM MST)

## This pass: top-right HUD corner, HUD polish, pause map over the whole island

### Seen working in shots
- **Top-right corner to the user's mock-up (ref_46).** From top to bottom: a small clock and weapon line, six stars (dark grey with a dark outline when off, solid white with a soft glow when wanted; they pop in, blink while evading, and shake when the level rises), three round police-knowledge badges (hanger, head, car; red when known, dim grey when not; pop and ring when one turns on; the row is hidden when you are not wanted), the bank line with a purple house badge, and the cash line with a green wallet badge. No boxes, only soft shadows, so it stays readable over bright sky. All icons are original inline SVG in `src/ui/hud/corner.js`.
  - Shots: `docs/v2/shots/ui-frontend/hud_noon_sky.png`, `hud_wanted_two_badges.png`, side by side with the mock-up in `docs/v2/compare/hud_corner_vs_ref46.png` (git-ignored).
- **HUD polish** in the same style: thin white minimap rim with a drop shadow (no dark ring), lighter hint and notification cards with a round accent dot and condensed caps titles (the "PSST" card), and a lighter district label. Seen in `hud_noon_sky.png`.
- **Pause map** now covers the whole traced island. Bounds, palette, place names and set pieces are read from `public/assets/world/layout.json`, not hard-coded. It draws a deep navy sea, turquoise coastal shallows, gold sand, the land-cover classes from `city.mapLayers.cover` (forest, grove, sawgrass, farmland, runway and others), grey urban areas and pale roads. It also shows Nico's house and Low Tide Lola's markers, and labels are decluttered. Panning, zooming, the player marker and click-to-set-waypoint are the existing v1 controls. The v1 Miami-only off-limits ring is turned off for V2 data.
  - Shots: `pause_map_island.png` (zoomed out), `pause_map_zoomed_keys.png`, `pause_map_zoomed_player.png`.

### Built but not looked at
- Badges driven by real police facts. The corner reads `game.evidence.snapshot().facts` four times a second: `face` lights the head badge, `outfit.*` the hanger and `vehicle`/`plate` the car. That code ran, but my test had no facts, so the lit badges in the shot came from `game.hud.setKnown(...)`. `game.hud.setKnown(null)` hands control back to the evidence system.
- Restyled speedometer numerals and mission line (CSS only, not seen on screen).
- Waypoint setting on the new map style (v1 code, not re-tested).

### Not done / caveats
- **The live tiles are older than layout.json.** The live build covers x −15000…6000 and z −15800…14400, while the layout covers x −25450…5780 and z −24890…20110. So in the zoomed-out shot some place names (Port Calabash, Tangelo, Tern Key) sit over open sea, and Nico's house is in water in the Keys shot. This should fix itself once the re-merged tiles go live; nothing in the UI needs to change.
- Coastal shallows are a fixed-width band along every coast, not true bathymetry: `underwater.shallow_polygons` in layout.json is only a count. If WORLD exports real shallow polygons, I can draw those instead.
- The bank line appears only when `game.bank.balance` is a number. The live game has no `game.bank` or `game.wallet` (core-systems money is not wired in `main.js`), so the shots show cash only, taken from `player.money`. The bank line's layout was seen in an earlier shot, before the hide fix.
- Still open from the earlier handoff: the date and stamina in the HUD, the mapCore engine, the minimap rebuild, menus, settings UI and phone.

## Files
- New: `src/ui/hud/corner.js`, `src/ui/hud/corner.css`, `src/ui/hud/polish.css`.
- Changed: `src/ui/hud.js` (uses the corner, loads layout.json, union bounds, place and set-piece labels, `game.hud.setKnown`), `src/ui/mapRender.js` (layout palette, `setMapPalette`, cover layers, shallows, pale roads), `src/ui/mapBoundary.js` (no Miami ring on V2 data).

## New API
- `game.hud.setKnown({ outfit, face, vehicle })` sets the badges by hand; `null` hands them back to the evidence system.
- `game.worldLayout` is set from layout.json if no other module has set it.
