# Design system track report (Nov 13, stopped at the 6:30 PM budget cut)

## What exists
- **API:** `src/design/index.js` (README.md is the contract), `design.v2.js` (order 10) sets `game.design`.
- **Logo engine:** `logos/engine.js` (lockups: horizontal, stacked, wordmark, roundel, emblem, custom; containers; arc text; reverse palettes and plates so a logo reads on any background). `logos/marks*.js`: 350 symbols drawn in code.
- **Brands:** 206 (`brands/data/core.js` 7 hand-built, `main.js` 199 in the compact `Q()` notation of `brands/q.js`). 76 of 123 categories covered. Car makers reuse the 15 catalog names.
- **Makers:** 22 manufacturer families with a `family` block (elevators x3, lamps, benches, docks, lifts, HVAC, plumbing, fire, ATM, coolers, espresso machines, pumps, cameras, impact windows, signals, tools, paint, construction).
- **Products:** 85 with real-size models and label art drawn from the brand's packaging data (21 builders). Bites are carved into the mesh.
- **Materials:** 79 procedural PBR sets with a wear option.
- **Signs and print:** `signs/index.js`: 16 sign styles, billboard, shopping bag; posters, menus, price tags, receipts, flyers, stickers, plate frames, truck liveries, bags, cups.
- **Style guide:** 21 districts, 3 tiers, `forBrand()`.

## Evidence
- `node src/design/check.mjs`: 0 failures.
- `src/design/tools/smoke.js` in the test browser: 2911 calls across every brand, sign style, print generator, product (closed, open, bitten), material and style guide entry: 0 failures.
- Sheets in `docs/v2/shots/design-system/`: `marks.png`, `brands_core.png`, `brands_main.png`, `products.png`, `products_close.png`, `materials.png`, `signs.png`.

## Short of the brief (honest list)
1. Breadth: 206 brands, not the 500+ planned; 47 categories have no brand yet (`check.mjs` prints them). The 20 empty files in `brands/data/` are slots for them and `tools/brand_brief.md` plus the per-file scopes below are ready to hand to agents. I could not delegate: the session's 20-subagent limit was already in use.
2. Only the first 71 brand logos were reviewed by eye. Horizontal lockups had small marks; I raised the default mark scale afterwards and did not re-shoot.
3. No CC0 photo textures were downloaded; every material is procedural. Nothing was added to `public/assets/design/`.
4. Products: no handbags, clothing, jewelry, watches, cosmetics, tools or luxury shoes. Sneakers are blocky. Food models other than the hot dog were only seen small.
5. Signs: neon and channel letters are layered alpha planes, not traced tube or extruded geometry. Two signs z-fought in the preview; patched, not re-shot. Print outputs ran without error but were not looked at.
6. Fonts: brands use font roles that resolve to macOS system faces (no font files bundled, because the contract allows CC0/CC-BY only). On Windows they fall back to plainer faces.
7. Full-game boot: `game.design` loaded (206 brands, 85 products, 79 materials), `game.v2.failed` empty, a product and a sign built in-game. The run hit the 240 s watchdog before its screenshot, so there is no boot image.

## Needs from the lead
- Decide on bundling open-license (OFL) fonts; `fonts.js` already looks for `PS ...` families first.
- New event: `design:ready` `{ brands, products, materials }`.
- File scopes for brand agents: fuel_grocery, fastfood, cuban_local_food, restaurants, nightlife_hotels, fashion, luxury_beauty, drinks, spirits, snacks_tobacco, pantry_household, tech_media, finance_services, civic_travel, leisure_transport, auto, marine_air, makers_building, makers_street, retail_misc. Each must avoid the names already in `core.js` and `main.js`.
