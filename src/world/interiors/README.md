# Interiors engine (V2): how to add a store or building type

`game.interiors` streams enterable interiors around the player. Every storefront lot (`city.storefronts`) whose kind matches a
**registered store type** is built by the V2 engine (`game.interiors.v2`); kinds with no V2 type yet still use v1 (`legacy/`).
Adding a category = one file in `types/` that calls `registerStoreType`. It is picked up automatically (`import.meta.glob`).

**Copy `types/gas_convenience.js`: it is the complete worked example** (variants, plan, fixtures, stock, lights, prints, back rooms).
Preview without the game: `http://127.0.0.1:5200/src/world/interiors/preview.html?type=<your-type>&n=6&t=14&view=eye|top|street&store=0`
(`t` = hour, `n` = variants in a row, `cut=2.5` clips the ceiling, `cam=x,y,z&look=x,y,z`). It sets `window.ready` when baked:
`node tools/v2/shot.mjs --url "<that url>" --wait "window.ready" --out docs/v2/shots/<track>/<name>.png`

## Frame and units
Store-local frame, meters: `x` across the frontage, `z` along the depth, **street side at `z = +D/2`**, `y` up, floor at `ctx.FLOOR_Y`.
Yaw `ry` 0 faces `+z`. Fixtures are authored in their own frame with `G.at(x, z, ry, () => { ... })`.

## registerStoreType(def)
```js
registerStoreType({
  type: 'pharmacy', label: 'Pharmacy',
  kinds: ['pharmacy', 'chemist'],        // OSM shop/amenity kinds this type claims (or match(sf, { kind, W, D }) -> 0..1)
  minSize: { w: 6, d: 7 }, variants: 6,  // smallest interior it fits; number of seeded variants
  profile(base, { sf, store, design, R }) { return { name, accent, floor, wall, ceil, lamp, wear, hours: [8, 22], open24, facade: { style }, ... }; },
  plan(P, ctx) { ... },                   // rooms, doors, storefront (plan.js)
  *fixtures(ctx) { ...; yield; ... },     // everything inside; `yield` between groups so no frame is long
  lighting(ctx) { ... },                  // optional; unlit rooms get defaultRig() by room kind
  staff(ctx) { return [{ role: 'clerk', post: 'post', routine: [...] }]; },   // data for the behavior framework (see "Not finished")
  behaviors: { customers: [...] },
  standouts: [{ id, osmId | near: [x, z, r], apply(profile, { sf, store }) }],   // hand-made locations override the seeded profile
});
```
`sf.storeType` forces a type and `sf.variant` a variant (area agents use this to place hand-made standouts).

### profile (variation.js)
`base` already holds seeded `variant, tier ('budget'|'mid'|'luxury'), wear 0..1, clutter, stock, priceK, accent, secondary, neutral,
lamp, floor, wall, ceil, facade, hours, owner, since, lore.regulars`. Return overrides. Take the banner brand from the design system
(`design.pickBrand(seed, { category })`) and fall back only while it has no data. Surfaces are `[surfaceName, opts]` pairs from
`kit/surfaces.js` (floors `vct terrazzo concrete wood ceramic cubanTile quarry carpet rubber`, walls `paint subway brick slatwall
pegboard woodPanel cmu frp stucco`, ceilings `dropTile tin deck`, finishes `steel laminate plastic cardboard fabric leather`);
opts `{ c, c2, c3 (colors baked in), wear }`. `wall: { surf, wainscot: { h, surf }, base, band: { y, h, c } }`, `ceil: { type: 'drop'|'gyp'|'open'|'tin', c }`.

### plan(P, ctx) (plan.js)
```js
const [back, sales] = cut(P.lot, 'back', 3);            // cut(rect, 'back'|'front'|'left'|'right', meters) -> [piece, rest]
P.room('sales', 'sales', sales, { h: 3, floor, wall, ceil });          // kinds: sales stock office restroom kitchen cooler fitting dining ...
P.room('stock', 'stock', back, { h: 2.8 });
P.door('sales', 'stock', { kind: 'swing', w: 1.3, at: 0.3, staff: true });  // kinds: hinged double swing auto open curtain cooler pass (pass-through window)
P.door('stock', 'outside:back', { kind: 'hinged', locked: true });
P.open('sales', 'nook');                                 // no wall between two zones
P.storefront({ style: 'aluminum'|'bronze'|'black'|'wood'|'tile'|'block', door: { kind: 'auto'|'double'|'hinged', w: P.doorW, x: P.doorX },
               bulkhead: 0.5, awning: { c, c2 } | { type: 'canopy' }, walkup: { x, w, sill } /* ventanita */, solid: [[x0, x1]], bars: true });
```
Rooms must tile the lot. Walls, openings, door frames and leaves, the glazed storefront, colliders and nav come from the plan.
In the game the door must stay at `P.doorX` / `P.doorW` (the city shell's collider gap). After `finalize`, mount things on walls with
`P.spans(room, 'back'|'left'|'right', minLen)` -> free spans, `P.onFace(face, u, off)` -> `{ x, z, ry }`, `P.take(face, a, b)`.
`P.stair()` / `P.lift()` are declared but **not built yet** (multi-floor is not finished).

### fixtures(ctx): the build context (build.js)
| Field | Use |
|---|---|
| `ctx.G` (`kit/geo.js`) | merged static geometry: `box boxB cyl cylB sphere plane lathe extrude tube add`, `G.at(x, z, ry, fn, y)` |
| `ctx.M` (`kit/materials.js`) | materials lit by the bake: `surf(name, opts)`, `flat(color, { rough, metal })`, `glow(color, k, circuit)`, `glass(opts)`, `shadow()` |
| `ctx.prints` (`prints.js`) | `poster(pid) promo(top, big, bottom) tag(pid) notice(kind) neon(text) menu(key, sections) storeSign(o) hours() screen(key, w, h, draw) make(key, w, h, draw, o)` -> `{ mat, rect }`; draw with `G.plane(p.mat, x, y, z, w, h, { ry, uvRect: p.rect })` |
| `ctx.item(pid, x, y, z, ry, o)` | one physical product (instanced until taken). Helpers in `items/stock.js`: `shelfRun pegRun stack` (also place price tags) |
| `ctx.solid(x0, y0, z0, x1, y1, z1, o)` | collider (+ bake occluder when tall). **Every fixture must add its colliders.** |
| `ctx.shadow(x, z, w, d)` | contact shadow blob |
| `ctx.light.*` (`lighting.js`) | `troffer strip can track pendant bulb sconce led glowPanel`; `ctx.gridRig(room, { type, lamp, k, sx, sz })` |
| `ctx.poi(tag, x, z, ry, data)` | where people stand: `browse register queue post restock coffee ...` |
| `ctx.use(x, y, z, { kind, r, label, onUse })` | interactable (built-in kinds: `register switch dvr lotto atm safe pour`) |
| `ctx.dyn(...)` / `ctx.dynHere(x, y, z, ry, (G) => ...)` | separately animated part (door, drawer, fan, clock hand); animate in `ctx.anim.push((dt, t, store, hour) => ...)` |
| `ctx.plan, ctx.profile, ctx.R, ctx.store, ctx.front (gh, fascia, glazed bays)` | plan, variation, seeded rng, store record, storefront metrics |

Shared fixtures: `fixtures/retail.js` (`family gondola wallShelf coolerBank checkout atm trashCan floorSign mopBucket cctvDome convexMirror
exitSign wallFan floorMat`) and `fixtures/backroom.js` (`stockRack handTruck officeDesk safe dvr restroom lockers wallClock lightSwitch breakerPanel`).
Put category-specific fixtures in your own `fixtures/<category>.js`.

### Products (items/)
`items/catalog.js` resolves brands and products from the design system first (`game.design`); entries registered here with
`registerBrands` / `registerProducts` are **provisional** and are replaced when the design system defines the same id.
A product = `{ id, name, brand, form, params, price, net, nutrition, art, swatch, category, shelf, effects }`; `form` is a shared shape in
`items/forms.js` (`can tin bottle glassbottle cup tub jar box carton jug pack case bag bar pouch flat blister sausage hotdog donut slice
wedge loaf roll icebag lighter shades`); add shapes with `registerForm(name, { aspect, px, build(F, params) })`. Label art is painted
once per product into a shared atlas (`items/labels.js`), so thousands of items cost a few draw calls.

## Lighting model
Nothing in an interior is lit by the sun or the scene ambient. Every vertex and every item instance carries three baked channels
(`kit/bakeCore.js`, run in a Worker): `0` main lights, `1` accent lights (neon, cooler glow, screens; stay on after hours), `2` daylight
through the storefront glazing (scaled by the time of day). Fixtures register their lights when you call `ctx.light.*`.
Four pooled real-time point lights follow the camera for characters and floor highlights. Light switch = circuit 0 of that store.

## What the engine does for you
Streaming (sliced build, worker bake, dispose on distance), colliders, nav grid (`built.nav.path`), doors (open for anyone near, front
door locks outside `profile.hours`), opening hours, wall clocks on game time, taking items with E (arm IK, gap persists in
`store.state.taken`), carrying, pocketing (G), eating (F -> `game.emit('consume', { productId })`), paying at a register (E cash / R card,
receipt canvas in `game.emit('purchase')`), shoplifting on exit (`game.emit('crime', { type: 'shoplift' })` and
`game.emit('evidence', { kind: 'witness' | 'camera', ... })`), a destroyable camera recorder (`dvr`, `game.emit('evidence-destroyed')`).

## Not finished (do not rely on it yet)
- **Staff and customers:** `staff()`, `behaviors` and `ctx.poi` are recorded but no people module spawns anyone yet (planned `people.js`,
  hooked at `engine.hooks.people = { update(store, dt, hour, sky), release(store) }`, actors listed in `built.people`).
- Stairs, elevators and upper floors; a stuck-spot walker; music per venue; openable drawers/cabinets other than cooler doors.
- First build of a type draws its textures and labels on the main thread (one-time slices over 25 ms).
- Only `gas-convenience` exists as a V2 type; Cuban cafe and sneaker boutique are not built.
