# Southline design system (`src/design/`)

The single source of truth for invented brands, logos, signage, print, products and shared PBR materials.
**Never invent a one-off brand, product or flat material in your own module: take it from here** (or ask the
DESIGN-SYSTEM track to add it). That is what makes a brand recognizable across billboards, shops, products and trucks.

```js
import design from '../design/index.js';          // or: import { getBrand, buildProduct, materials } from ...
// in the game:  game.design  (set by src/design/design.v2.js, order 10, before every other V2 module)
await design.ready();                              // fonts registered; safe to draw logos after this
```

Conventions used everywhere: meters, `+Y` up, models sit on `y = 0` with their origin at the bottom center and their
front (label, face, screen) toward `+Z`. Colors are hex strings (`'#1b4f9c'`) in data; `brand.color('primary')` gives
a number for three.js. Everything is deterministic: the same id and seed give the same result.
Standalone preview pages must call `design.setAssetBase('/assets/design/')` (the default base is relative to `index.html`).

## Brands

```js
design.brands                                   // every brand (array)
design.getBrand('egret')                        // by id, or null
design.brandsFor({ category: 'fuel', tier: 'mid', district: 'little-havana' })   // filter; every field optional, lists allowed
design.pickBrand(seed, { category: 'pharmacy', district: 'brickell' }, { exclude: [idsUsedNearby] })  // deterministic weighted pick
design.CATEGORIES / design.categories           // canonical category ids (brands/categories.js)
design.DISTRICTS                                // canonical district ids
```
Query fields: `category`, `sub`, `tier` (`luxury | mid | budget`), `district`, `presence`
(`chain | regional | local | product | maker | civic`), `tag`, `group`, `storefront` (true = has shops), `filter(b)`.

A brand:
```js
{
  id, name, legal, tagline, story,               // story = one backstory line (who owns it, since when, reputation)
  category, sub, tier, presence, weight,         // weight 1..10 = how common it is
  districts: ['*'] | ['little-havana', ...], avoid: [...], home: 'key-paloma',   // where it appears
  storefront: true | false,                      // true when the brand has its own shops/venues
  founded: 1987, owner: 'Yolanda Ruiz',          // lore hooks for locals (optional)
  palette: { primary, secondary, accent, ink, paper, neon, onPrimary, dark },   // hex strings
  fonts: { display: <role>, text: <role> },      // font roles from fonts.js: font(role, px)
  logo: {...},                                   // drawn in code (see logos/engine.js)
  signStyle: { type, ... },                      // see "Signs"
  packaging: { style, ... },                     // label/bag/cup language (see "Print and packaging")
  pattern: { draw(g, size, P, brand, {ink, bg}), bg, ink },   // seamless tile (monograms); optional
  appears: ['storefront', 'billboard', 'truck', 'bag', 'cup', 'uniform', ...],
  tags: [...],
  // methods
  color(key) -> number
  logoCanvas(size = 1024, { variant: 'full' | 'mark' | 'word', mono: '#fff', bg, pad, square }) -> HTMLCanvasElement
  logoTexture(THREE, size = 1024, opts) -> CanvasTexture (cached, sRGB, userData.aspect)
  logoAspect(opts) -> width / height
  drawLogo(g, x, y, w, h, opts)                  // draw fitted into a box on your own canvas
  drawLogoOn(g, bgColor, x, y, w, h, opts)       // same, auto-knockout when the logo would vanish on bgColor
  patternCanvas(size = 512, { bg, ink }) / patternTexture(THREE, size, opts)   // seamless brand pattern
}
```
Car makers reuse the 15 names in `src/vehicles/catalog.js` (`category: 'automaker'`, same spelling), so badges match.

### Manufacturer families
Makers of fixtures, elevators, docks, lamps, benches, pumps, coolers and so on are brands with
`category: 'manufacturer'` (or `tools`, `paint`, `construction`) plus a `family` block describing their look:
```js
design.families                                  // every maker brand
design.familiesFor('elevator')                   // by product kind (family.makes includes it)
design.pickFamily(seed, 'street-lamp', { district })   // deterministic pick: use the building or block seed
brand.family = { makes: ['elevator', 'escalator'], era: '1990s', finish: 'brushed stainless', shapes: 'square buttons, amber display',
                 colors: ['#b9bcc0', '#2a2d31'], plate: 'engraved steel nameplate', traits: {...} }
```

## Products

```js
design.products                                  // every product definition (array)
design.getProduct('hot-dog-mustard')
design.productsFor({ category: 'food', sub, tier, brand, soldAt: 'convenience', tag })
design.pickProducts(seed, query, n)              // n distinct products, deterministic
design.buildProduct(THREE, id, opts) -> Object3D | null
design.productParts(THREE, id, opts) -> [{ geometry, material, matrix }]   // for InstancedMesh shelves
design.labelCanvas(id, size)                     // the flat label art of a packaged product
design.disposeProduct(id)                        // free cached geometry and textures for one product
```
A product:
```js
{
  id, name, brand: <brand id>, category, sub, tier, price,          // USD
  size: { w, h, d }, weight,                                         // meters, kg (real-world)
  nutrition: { kcal, protein, carbs, fat, sugar, sodium, caffeine, alcohol },   // per item; g, mg sodium/caffeine, alcohol in g
  effects: [{ type: 'heal' | 'stamina' | 'sprint' | 'drunk' | 'sick' | 'hydrate' | 'jitters', amount, seconds }],
  junk: true | false, bites: 4, sips: 6,                             // how many bites/sips it takes to finish
  states: ['closed', 'open'],                                        // where it makes sense
  soldAt: ['convenience', 'fuel', ...], shelf: 'cooler' | 'shelf' | 'counter' | 'hot-case' | 'rack' | 'display' | 'menu',
  hold: 'hand' | 'two-hands' | 'pinch' | 'cup' | 'bottle', wear: 'feet' | 'wrist' | ... (wearables),
  model: <builder name>, modelOpts: {...}, tags: [...]
}
```
`buildProduct` options: `{ bite: 0..bites, sip: 0..sips, state: 'open', labelSize: 512, seed, shared: true }`.
The returned object has `userData = { productId, product, size: {w,h,d}, grip: Vector3, parts }`; with `shared: true`
(default) geometry and materials are cached per product state, so do not mutate them (clone first).
Bite stages are real geometry: the bitten part is carved out and shows the inside.

## Materials

```js
const m = design.materials.get(THREE, 'terrazzo_cream', { repeat: [4, 4], tint: '#fff', wear: 0.3 });
design.materials.names()                         // every material name
design.materials.list({ category: 'wood', tag: 'floor' })   // definitions: { name, category, tile, tags, source, license }
design.materials.info(name)
design.materials.repeatFor(name, widthM, heightM) -> [u, v]   // real-scale repeat for a surface of that size
design.materials.preload(THREE, names) -> Promise             // warm textures before showing a room
design.materials.setBase(url)
```
Options: `repeat` (number or `[u, v]`), `tint` (multiplies the albedo), `wear` 0..1 (grime, scuffs and roughness break-up,
`wearSpace: 'world' | 'object'`), `wet` 0..1, `side`, `transparent`, `opacity`, `emissive`, `emissiveIntensity`,
`envMapIntensity`, `flatShading`. Materials are cached by name + options; never mutate a returned material.
Categories: `wood, metal, plastic, glass, fabric, leather, tile, terrazzo, stucco, concrete, carpet, laminate, stone,
brick, paint, paper, rubber, ceramic, neon, screen, food, ground`. Every set has albedo, normal, roughness and AO.

## Signs and print

```js
design.signs.build(THREE, brand, { style, width, height, lit, seed, text }) -> { group, lights, update(dt, night), size }
design.signs.billboard(THREE, brand, { size: '48x14' | 'poster' | 'bulletin', campaign, seed }) -> { group, ... }
design.print.poster(brand, opts)      -> canvas       design.print.menu(brandOrVenue, opts)   -> canvas
design.print.priceTag(product, opts)  -> canvas       design.print.receipt(venue, items, opts) -> canvas
design.print.flyer(brand, opts)       -> canvas       design.print.sticker(brand, opts)        -> canvas
design.print.plateFrame(brand, opts)  -> canvas       design.print.livery(brand, opts)         -> canvas (truck side)
design.print.bag(brand, opts)         -> canvas       design.print.cup(brand, opts)            -> canvas (wrap art)
design.print.label(product, opts)     -> canvas       design.print.texture(THREE, canvas)      -> CanvasTexture (sRGB)
design.signs.shoppingBag(THREE, brand, opts) -> Object3D
```
Sign styles: `channel-letters, reverse-channel, neon, blade, painted-wood, backlit-box, pylon, awning, vinyl-window,
marquee, hand-painted-wall, carved-stone, brass-plaque, led-screen, stencil, rooftop-letters`. With no `style`, the
brand's own `signStyle.type` is used, so the same brand always gets the same kind of sign.

## Style guides
```js
design.styleguide.district('little-havana')      // materials, colors, furniture, sign styles, brand mix for an area
design.styleguide.tier('luxury')                 // what a tier uses: finishes, lighting, fixtures, density
design.styleguide.forBrand(brand)                // interior scheme derived from the brand (floor, walls, counter, accent, lighting)
```
Prose version: `src/design/styleguide.md`.

## Files
| Path | What |
|---|---|
| `index.js` | Public API (this page) |
| `design.v2.js` | `initV2`: sets `game.design` |
| `util.js`, `fonts.js` | Seeded random, color and canvas helpers; typeface roles |
| `brands/` | `categories.js`, `define.js`, `index.js`, `data/*.js` |
| `logos/` | `engine.js` (lockups, wordmarks, containers), `prims.js` (shapes for marks), `icons.js` (label art) |
| `materials/` | PBR library: CC0 texture sets in `public/assets/design/tex/` plus procedural sets |
| `products/` | `kit.js` (containers, bites, labels), `builders/*.js` (models), `data/*.js` (catalog), `index.js` |
| `signs/` | 3D signs and print generators |
| `styleguide.js`, `styleguide.md` | District, tier and brand style rules |
| `preview_*.html` | Standalone contact sheets (brands, products, materials, signs) |
| `check.mjs` | Automated checks: unique names, banned names, every product has a model and a brand, every brand has a logo |
