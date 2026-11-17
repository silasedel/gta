# Brief for brand-data agents (design-system track)

You are filling ONE brand data file in `src/design/brands/data/` for **Southline V2**, an original open-world
sandbox set in real-scale Miami inside a condensed Florida-style world (Vite + three.js). The design system is the
single source of truth for invented brands: every shop, product, sign, truck and ad in the game takes its brand from
here. The user's standard: no shortcuts, no placeholders, every store has its own distinct, recognizable style.
Take as long as you need; quality over speed.

## Read first (in this order)
1. `src/design/README.md` (the "Brands" section: the brand shape).
2. `src/design/brands/data/core.js` **in full**: seven reference brands. Yours must be at least this good and follow the same shape.
3. `src/design/logos/engine.js` header comment and `buildLayout` (what `logo` fields do), `src/design/logos/prims.js` (shapes you can use inside marks), `src/design/fonts.js` (the font role names: use roles, never raw font names).
4. `src/design/brands/categories.js` (canonical `category` ids: use them exactly; `sub` is free).
5. `src/design/brands/define.js` (defaults, `SIGN_TYPES`, `PACKAGING_STYLES`, `DISTRICTS`).

## Hard rules
- **Edit only your one data file.** Do not touch the engine, prims, fonts, index or anyone else's file. If the engine lacks something, work around it inside your brand (a custom `mark`, or `lockup: 'custom'` with `draw` + `aspect`) and mention it in your report.
- **The file must always parse**: other agents share a hot-reloading dev server. Write to `<file>.tmp`, run `npx esbuild <file>.tmp --loader:.tmp=js --format=esm --outfile=/dev/null`, then `mv` it over the real file. Never leave it half-written.
- **Never run git commands that change state.** Never start a dev server (one is running at http://127.0.0.1:5200). The only allowed browser is `node tools/v2/shot.mjs` (see "Verify").
- **American spelling** in all text. Spanish, Spanglish, Haitian Creole and Portuguese names and taglines are welcome where they fit (this is Miami) and must be correct.
- **Originality (most important):**
  - Every name must be invented. Check each one against real companies, products and trademarks you know, in any industry, and against real Miami/Florida businesses. If it is a real brand, or one letter away from one, or an obvious parody of one, pick another. No real logos, no real trade dress (for example: no red disc with white script for a cola, no swoosh, no three stripes, no golden arches, no green siren roundel, no interlocked letters that mimic a real fashion monogram).
  - Nothing from the Grand Theft Auto series or its fan maps. Banned outright: Vice City, Leonida, Grassrivers, Kalaga, Port Gellhorn, Ambrosia, Watson Bay, Key Lento, Hamlet, Rusty Anchor, Wonder Whale, Dinka, Vapid, Schafter, and any other name you recognize from that series (its car makers, radio stations, shops, beers, sodas, burger chains, clothing brands...).
  - Do not reuse a name another file already has: before you finish, run `grep -rhoE "name: (\"[^\"]+\"|'[^']+')" src/design/brands/data/ | sort | uniq -d` and rename any duplicate that involves your file. Avoid leaning on the same few words: at most two brands in your file may contain any one of Sol, Sun, Palm, Coral, Flamingo, Pelican, Tropic, Bay, Ocean, Miami, Key(s), Gator.
- **World names you may use** (ours): Southline (the city), Southline County, Key Paloma, Tern Key, Lake Amaro, Citrus Flats, Sawpalm Ridge, Port Cassia, plus real Miami geography (Calle Ocho / SW 8th Street, Little Havana, Brickell, Wynwood, Overtown, Biscayne Bay, Ocean Drive, Collins Avenue, Lincoln Road, Flagler Street, the Everglades, the Keys). District ids for `districts` / `home` are in `define.js` (`DISTRICTS`).

## What every brand needs
```js
B({
  id, name, legal, category, sub, tier: 'luxury' | 'mid' | 'budget', presence: 'chain' | 'regional' | 'local' | 'product' | 'maker' | 'civic',
  weight: 1..10, storefront: true/false, tagline, story (one specific backstory line: who, since when, reputation, a detail a local would know),
  founded, owner (locals), districts: ['*'] or a list, avoid: [...], home (locals),
  palette: { primary, secondary, accent, ink, paper, neon },
  fonts: { display, text },
  logo: { lockup, reverse, mark(g, s, P) {...}, word: {...}, sub: {...}, container: {...}, ... },
  signStyle: { type: <one of SIGN_TYPES>, ...details a sign builder can use (materials, colors, extras) },
  packaging: { style: <one of PACKAGING_STYLES>, bg, band, ... },
  appears: [...where a player sees it...], tags: [...],
  pattern: { draw(g, size, P, brand, {ink, bg}) {...}, bg, ink },   // required for fashion houses (their monogram/signature canvas); optional elsewhere
  family: { makes: [...], era, finish, shapes, colors: [...], plate, traits: {...} },  // required for makers (category manufacturer/tools/paint/construction)
})
```
Design rules:
- **A bespoke mark for (almost) every brand**, drawn with canvas paths inside the `s x s` box: a recognizable symbol that fits the brand's story, not a generic circle. Pure wordmarks are fine for a minority (fashion houses, some luxury and tech brands), but then the lettering treatment must carry it (parts, skew, outline, shadow, underline, arch, container). No two marks in your file may look alike, and do not copy the marks in `core.js`.
- **The tier must be readable at a glance.** Luxury: restraint, wide tracking, didone/engraved/thin faces, muted or deep palettes, metal, lots of air. Mid: confident and clean. Budget: loud, saturated, heavy or rounded type, outlines, shadows, bursts, containers. Local independents: hand-painted, sign-painter scripts, slab or typewriter faces, quirky marks, owner names.
- **Variety inside the file:** spread the lockups (`horizontal`, `stacked`, `wordmark`, `roundel`, `emblem`, `custom`), containers, font roles, palettes, sign types and packaging styles. Do not let two brands share a palette or a display face + lockup combination.
- Provide `logo.reverse` (palette remap for use on the brand's own color or on dark surfaces) whenever the full-color logo would vanish on `primary` or `ink`; the preview shows both, so check them.
- Lettering must be legible: test long names; use `lines` to stack words; keep `sub` lines short.
- Colors are hex strings. Marks may use `P.primary`, `P.secondary`, `P.accent`, `P.ink`, `P.paper`, `P.neon`, or literal hex for extra shades. Always draw through `P` where a palette color fits, so `reverse` works.
- Lore must fit the place: Cuban, Haitian, Colombian, Venezuelan, Nicaraguan, Argentine, Brazilian, Jewish, Bahamian and old-Florida roots are all part of Miami. Keep it grounded and specific; humor is welcome, parody of real brands is not.

## Verify (required: a screenshot you did not look at is not evidence)
Render your file as contact sheets and **Read every PNG**:
```
node tools/v2/shot.mjs --url "http://127.0.0.1:5200/src/design/preview_brands.html?file=<yourfile>&cols=4&per=16&page=0" \
  --wait "window.ready" --eval "JSON.stringify(window.report)" --w 1600 --h 1500 --allowErrors \
  --out docs/v2/shots/design-system/brands_<yourfile>_p0.png
```
(`page=1`, `page=2`, ... for the rest; 16 brands per page.) `window.report.errors` and `.dataErrors` must be empty.
Each card shows: the full logo on paper, the logo on the brand's primary color, the mark on ink, and the pattern tile.
Look for: text overflowing or tiny, marks that are blobs or unreadable, clashing or muddy colors, a logo that vanishes on its
own color, marks that look alike, anything that resembles a real brand. Fix and re-render until every card would pass as a real
company's identity. Work in batches (about 8 brands, render, fix, continue) so mistakes do not pile up.
The browser tool has a machine-wide queue; if it says it is waiting for a slot, just wait. Keep each run short.

## Report back (under 200 words)
How many brands, the ids grouped by category, anything you could not do, any name you are unsure about, and the screenshot paths you checked.
