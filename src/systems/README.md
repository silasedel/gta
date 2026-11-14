# Core systems (`src/systems/`): the shared simulation backbone

Track: `core-systems`. Loaded by `systems.v2.js` with `order = 5`, so every API below exists on `game.*` before
almost every other V2 module runs. Still guard your calls (`game.wallet?.pay?.(...)`): a module can fail to load.

Everything here is plain data and rules. No three.js, no DOM (except storage). The whole backbone also runs in
Node (`node src/systems/tests/run.mjs`), which is how it is tested.

**Status legend:** every API in this file is implemented unless it is marked `(planned)`.

## Ground rules for callers
- **Time unit:** game minutes. `game.time.now` is a float count of game minutes since Day 1, 00:00.
  One game day = 1440 game minutes = `game.settings.dayMinutes` real minutes (default 144, so 1 game minute = 6 real seconds).
- **Money unit:** US dollars, stored as integer cents internally, exposed as dollars (numbers with at most 2 decimals).
- **Never write `game.player.money` for new code.** It still works (it is now an alias of carried cash, so v1 code keeps
  running), but new code calls `game.wallet.pay / earn / ...` so the ledger, the bank and the news can react.
- **Never write `game.timeOfDay` to move time forward in gameplay.** Use `game.time.skip(...)`. Writing `game.timeOfDay = 20`
  is still fine for staging screenshots: the clock adopts it (same day, no scheduled events fired for the jump).
- **Persist your own state** with `game.save.register(...)`. Do not use `localStorage` for game state.
- **Events** go through the existing bus: `game.on(name, fn)` / `game.emit(name, data)`.

---

## `game.save`: versioned slots, autosave, registry

```js
game.save.register(key, {
  version: 1,                      // integer, bump when your data shape changes
  save() { return plainJson; },    // called at save time; return JSON-safe data (no functions, no three.js objects)
  load(data, info) {},             // data === null means NEW GAME: reset your state to defaults
                                   // info = { slot, isNewGame, savedAt, fromVersion }
  migrate(data, fromVersion) { return data; }, // optional; called when the saved version is lower than `version`
  order: 100,                      // optional load order (lower loads first). Core systems use 0..50.
});
```
- If a game was already loaded when you register (late or lazy modules), your `load(data)` is called right away with
  your saved slice (or `null`).
- Keep slices small (kilobytes). Store ids and deltas, not whole worlds.
- `game.save.unregister(key)`.

```js
await game.save.save({ kind: 'manual' | 'auto' | 'exit', thumb: false, reason: 'sleep' }) -> { ok, slot, kind, bytes, meta } 
await game.save.continue({ slot? })      -> { ok, slot, kind, meta } | { ok: false, reason }   // newest valid record
await game.save.load(slot, kind?)        -> same. Falls back to the last-good backup if the record is corrupt.
await game.save.newGame({ slot? })       -> { ok, slot }   // calls every load(null), resets clock to Day 1, 9:00 AM
await game.save.list()                   -> [{ slot, latest: meta|null, records: { manual, auto, exit } , corrupt: bool }]
await game.save.delete(slot)
await game.save.hasContinue()            -> bool          // for the main menu's Continue button
await game.save.exportFile(slot?)        -> { filename, text, blob? }  // .pssave JSON text; in a browser also triggers a download when { download: true }
await game.save.importText(text, { slot? }) -> { ok, slot, meta } | { ok: false, reason }
game.save.slot            // active slot id, e.g. 'slot1'
game.save.meta            // meta of the game in memory: { day, clock, dateText, place, cash, bank, playtime, version }
game.save.playtime        // real seconds played in this slot
game.save.busy            // true while writing
game.save.inhibit(token) / game.save.release(token)  // block autosave (missions, cutscenes, mid-heist)
game.save.autosaveMinutes // real minutes between autosaves (settings key 'autosaveMinutes', default 3)
game.save.manualBoot = true  // set this in your initV2 (ui-frontend) to stop the automatic Continue-on-boot
```
- **Boot:** unless `manualBoot` is set (or the URL has `?newgame` / `?nosave`), the first frame after `game.ready`
  continues the most recent slot if one exists, otherwise starts a new game in `slot1`.
- **Storage:** IndexedDB (`port-solana-v2`), falling back to localStorage, falling back to memory. Each record is an
  envelope `{ format, v, checksum, payload }`. Before a record is overwritten the verified previous record becomes its
  `.bak`. A record that fails its checksum is never loaded; the backup is used and `'saveRecovered'` is emitted.
- A compact `exit` record is written synchronously to localStorage on `pagehide`, so closing the tab resumes exactly there.

Events: `'saved' {slot, kind, meta}`, `'loaded' {slot, kind, meta, isNewGame}`, `'newGame' {slot}`,
`'saveRecovered' {slot, kind, reason}`, `'saveFailed' {slot, reason}`.

What core-systems saves itself: player position/heading/camera/vehicle, health/armor/stamina, clock, wallet and bank,
inventory and dropped items, needs and body, property, owned vehicles, businesses, stocks, bets, lottery, stats,
news, world deltas, NPC memory store, settings that belong to a slot.

### `game.worldState.deltas`: small persistent world changes (shelves, recorders, broken props)
```js
game.worldState.deltas.set(scope, id, value)   // e.g. set('shelf:store_1234', 'slot_17', { taken: true })
game.worldState.deltas.get(scope, id) -> value | undefined
game.worldState.deltas.all(scope) -> { id: value }
game.worldState.deltas.clear(scope, id?)       
game.worldState.deltas.expire(scope, id, gameMinutes)  // auto-clear later (restock after 24 h: expire(..., 1440))
```
### `game.memory`: NPC memory store (npc-ai owns the meaning; this is the persisted key-value store)
```js
game.memory.get(npcId) -> object (mutable, auto-saved)     game.memory.forget(npcId)
game.memory.note(npcId, fact, value)                       game.memory.all() -> { npcId: object }
```

---

## `game.time`: clock, calendar, scheduler, moon, tide

```js
game.time.now          // game minutes since Day 1 00:00 (float)
game.time.hour         // 0..24 float, same as game.timeOfDay
game.time.day          // day counter, 1-based
game.time.minuteOfDay  // 0..1440
game.time.weekday      // 0 = Sunday .. 6 = Saturday
game.time.weekdayName  // 'Friday'
game.time.isWeekend    // Saturday or Sunday
game.time.date         // { year, month (1-12), day, text: 'Fri, Jun 5', long: 'Friday, June 5, 2026', iso: '2026-06-05' }
game.time.clockText(opts?) -> '9:00 AM'   // { h24: true } -> '09:00'
game.time.scale        // game minutes per real second (10 at 144-minute days)
game.time.dayMinutes   // real minutes per game day (reads/writes the setting)
game.time.paused       // set true to freeze the clock (cutscenes)
game.time.rate         // extra multiplier (1 = normal); waiting/sleep animations may raise it

game.time.skip(gameMinutes, { reason: 'sleep'|'wait'|'travel'|..., silent: false }) -> { from, to, minutes }
game.time.skipTo(hour, { nextDay: false, reason })  // skip forward to the next time the clock shows `hour`
game.time.set({ day, hour })                         // hard set (debug / staging); no catch-up events

// Scheduler. All callbacks receive (ev) = { now, day, hour, weekday, catchUp: bool, due }.
// During a skip, missed occurrences fire in time order with catchUp = true (policy per handle below).
game.time.at(absMinutes, fn, opts?)           -> handle    // once, at an absolute time
game.time.in(gameMinutes, fn, opts?)          -> handle    // once, after a delay
game.time.every(gameMinutes, fn, opts?)       -> handle    // repeating; opts.phase = offset in minutes
game.time.onHour(hour, fn, opts?)             -> handle    // every day when the clock passes `hour` (float ok: 17.5)
game.time.onHour(hour, fn, { days: [6, 0] })               // only on those weekdays (weekend fireworks)
game.time.cancel(handle)
// opts: { id: 'unique-name' (re-registering the same id replaces it), days: [0..6],
//         catchUp: 'all' | 'last' | 'none' (default 'all' for at/in/onHour, 'last' for every),
//         persist: false }   // persist: true keeps a one-shot `at/in` across save/load; needs opts.id and a
//                            // handler registered with game.time.handler(id, fn) on boot
game.time.handler(id, fn)

game.time.moon   // { phase: 0..1 (0 new, 0.5 full), illumination: 0..1, name: 'Waxing Gibbous', ageDays }
game.time.tide   // { height: -1..1, meters: offset from mean sea level, rising: bool, nextHighIn, nextLowIn (game minutes), rangeMeters }
game.time.sun    // { rise, set (hours), daylight: bool }
game.time.weatherSeed   // integer, fixed per save; changes for every new game. environment: seed your weather from this + day
game.time.isBetween(h0, h1) -> bool   // handles ranges that cross midnight
```
Events: `'minute' {now}` (each game minute), `'hour' {hour, day}`, `'newDay' {day, weekday, date}`,
`'timeSkip' {from, to, minutes, reason}` (emitted AFTER scheduled events and the systems' own catch-up),
`'timeSkipStart' {from, to, minutes, reason}`, `'dayLengthChanged' {dayMinutes}`.

Catch-up contract: when time is skipped, anything you simulate per frame should catch up. Listen to `'timeSkip'` and
advance by `minutes`, or better, compute state from `game.time.now` so there is nothing to catch up.

---

## `game.settingsStore`: persisted settings, difficulty, assists

```js
game.settingsStore.define(key, { default, type: 'number'|'bool'|'enum'|'string', min, max, step, options: [..],
                                 label, group: 'Gameplay', description, scope: 'global'|'slot', apply(value, game) {} })
game.settingsStore.get(key)            game.settingsStore.set(key, value)      // validates, persists, calls apply, emits
game.settingsStore.reset(key?)         game.settingsStore.all() -> { key: value }
game.settingsStore.schema() -> [{ key, ...def, value }]   // for the settings UI, grouped by `group`
game.settingsStore.onChange(key | '*', fn(value, key))
```
- Values mirror into `game.settings[key]` (the v1 object), so `game.settings.dayMinutes` keeps working.
- Built-in keys: `dayMinutes` (24..1440, default 144), `autosaveMinutes`, `difficulty` (`'relaxed'|'standard'|'hard'`),
  `needsEnabled`, `tirednessEnabled`, `bodyChangeEnabled`, `bodyChangeRate`, `cashLossOnDeath`, `aimAssist`, `driveAssist`,
  `clock24h`, `units` (`'imperial'|'metric'`), `subtitles`.
- `game.difficulty` -> `{ id, damageTaken, policeAggression, cashLossOnDeath, hospitalBill, fineMul, priceMul, payMul, needsRate }`
  (read these multipliers instead of hard-coding difficulty).
Event: `'settingChanged' {key, value, previous}`.

---

## `game.items`: item definitions (what a thing IS)

Definitions come from the design-system product catalog (`game.design` / `src/design/products`), normalized by
`src/systems/items.js`. Core-systems adds no brands. Tracks may register extra definitions for non-catalog things
(keys, IDs, mission objects, fish):

```js
game.items.define(def) / game.items.defineMany([def])
game.items.def(id) -> def | null         game.items.has(id)        game.items.all(filter?) -> [def]
game.items.create(id, { qty = 1, stolen = false, state, now }) -> item instance (not placed anywhere yet)
game.items.registerUse(kind, handler(item, def, ctx) -> result)   // custom use actions: 'scratch', 'read', 'wear', ...
game.items.price(id, { district?, shop? }) -> dollars    // catalog price x district price index x difficulty
game.items.isSpoiled(item) -> bool      game.items.freshness(item) -> 1 (fresh) .. 0 (spoiled)
```
Normalized definition:
```js
{ id, name, brand: brandId|null, category: 'food'|'drink'|'alcohol'|'medicine'|'tobacco'|'clothing'|'footwear'|'accessory'|
      'electronics'|'tool'|'weapon'|'ammo'|'key'|'document'|'ticket'|'valuable'|'fish'|'household'|'misc',
  price, weight (kg), size: 1 tiny | 2 small | 3 medium | 4 large | 5 huge (hands only), stack: max per stack,
  use: 'eat'|'drink'|'medicine'|'scratch'|'wear'|... | null,
  portions: bites or sips to finish it (default from kcal / volume),
  nutrition: { kcal, protein, carbs, sugar, fat, fiber, sodiumMg, waterMl, caffeineMg, alcoholG },   // for the WHOLE item
  quality: 'junk'|'snack'|'meal'|'fresh',  perishHours: shelf life at room temperature (null = never spoils),
  leftover: itemId left in hand after finishing (empty can, wrapper) | null,
  hand: 'one'|'two', throwable: true, tags: ['hot', 'frozen', 'glass', ...], heal, effects: { ... } }
```
Item instance: `{ uid, id, qty, stolen, state: { used: portions consumed, open, bornAt, spoilAt, ... }, meta }`.

## `game.inventory`: what the player carries

```js
game.inventory.add(itemOrId, { qty, stolen, to: 'auto'|'hand'|'pockets'|'bag', silent }) -> { ok, added, left, where, item, reason }
game.inventory.remove(uidOrId, qty = 1) -> removed qty         game.inventory.count(id) -> n       game.inventory.has(id, n = 1)
game.inventory.find(uid) -> { item, where }                     game.inventory.list('pockets'|'bag'|'all') -> [item]
game.inventory.canAdd(itemOrId, qty) -> { ok, room, reason: 'too_big'|'full'|'too_heavy' }
game.inventory.held -> item | null                               // the thing in Nico's hand
game.inventory.hold(uid) -> bool      game.inventory.stow() -> bool (puts the held item away; false if no room)
game.inventory.use(uid?, opts) -> result                         // default: the held item. Eat/drink starts a consume session
game.inventory.consume.active -> { item, def, portion, portions, kind: 'eat'|'drink' } | null
game.inventory.consume.cancel()
game.inventory.drop(uid?, { qty, position }) -> worldItem        // default: held item, at the player's feet
game.inventory.throw(uid?, { dir: {x,y,z}, power: 0..1 }) -> worldItem
game.inventory.give(target, uid?, { qty }) -> bool               // emits 'itemGiven' (vetoable by the receiver)
game.inventory.pickUp(worldItemUid) -> { ok, reason }            game.inventory.nearby(radius = 2) -> [worldItem]
game.inventory.capacity -> { pockets: { used, max }, bag: { used, max } | null, weight, maxWeight, encumbrance: 0..1 }
game.inventory.setPockets(units)      // character/wardrobe: cargo shorts 10, jeans 8, swim trunks 3
game.inventory.setBag(null | { id, units, maxSize })             // wearing a backpack or duffel
game.inventory.markStolen(uid, bool)  game.inventory.stolenItems() -> [item]   game.inventory.confiscate(filter) -> [item]
game.inventory.container(id, { units, maxSize, cool: bool }) -> container   // stashes, fridges, trunks: add/remove/list/transferTo
game.inventory.transfer(uid, toContainerOrWhere, qty)
game.inventory.world.items -> [worldItem]   // { uid, item, pos: [x,y,z], rotY, droppedAt, interior: id|null, resting: bool, vel }
game.inventory.world.near(x, z, r) -> [worldItem]      game.inventory.world.remove(uid)
game.inventory.world.place(item, pos, { interior, rotY })   // interiors: put an item on the floor or a table persistently
```
Sizes in pocket units: tiny 0.25, small 1, medium 2, large 4 (bag only), huge = hands only.
Events: `'itemAdded' {item, where}`, `'itemRemoved' {item, qty}`, `'itemHeld' {item|null, previous}`,
`'itemDropped' {worldItem}`, `'itemThrown' {worldItem, dir, power}`, `'itemLanded' {worldItem, position, noise}`,
`'itemPickedUp' {item, worldItem}`, `'itemGiven' {item, to}` (return `false` to refuse), `'itemUsed' {item, def, kind}`,
`'itemSpoiled' {item}`, `'inventoryFull' {item, reason}`.

### Eating and drinking (for `character` animations and product bite stages)
`game.inventory.use()` on food or a drink starts a session: one portion (bite or sip) at a time.
- `'consumeStart' {item, def, kind: 'eat'|'drink', portions, portion}`
- `'bite' {item, def, portion: n (1-based), portions, stage: 0..1 (fraction eaten), kcal, duration}`  (also `'sip'` for drinks)
- `'consumeEnd' {item, def, finished: bool, leftover: item|null}`
- Product models read `item.state.used / def.portions` for their bite stage.
- The session auto-continues every `duration` seconds while `game.inventory.consume.auto` is true (default), or call
  `game.inventory.consume.next()` per animation loop. Moving, sprinting or drawing a weapon does not cancel; `cancel()` does.

---

## `game.needs`: food, drink and the body

```js
game.needs.ingest(nutrition, { quality, spoiled, source })   // low-level: what a bite calls
game.needs.state -> { fullness: 0..1.3, kcalToday, kcalBurnedToday, hydration: 0..1, bac: %, caffeineMg, sick: 0..1,
                      awakeHours, tiredness: 0..1, hygiene: 0..1, wellFed: 0..1, lastSleepAt, lastShowerAt }
game.needs.effects -> { wobble: 0..1, drunk: 0..1, blur: 0..1, roll, sprintMul, staminaDrainMul, staminaRegenMul,
                        healMul, aimSway, steerNoise, drowsy: 0..1, nausea: 0..1, jitter: 0..1, overLimit: bool (BAC >= 0.08) }
game.needs.bacText -> '0.06%'
game.needs.exercise(kind: 'run'|'swim'|'gym_weights'|'gym_cardio'|'sport'|'walk', gameMinutes, intensity = 1)
game.needs.canSleep({ place }) -> { ok, reason }
await game.needs.sleep({ hours?, until? (clock hour), place: 'home'|'hotel'|'car'|'bench', propertyId?, save = true }) -> { ok, hours, healed }
game.needs.wait(gameMinutes)                       // time skip without rest
game.needs.shower({ place }) -> bool               // emits 'shower' {place} for police (clears the "seen at the crime" description)
game.needs.vomit()                                 // clears the stomach (sickness, far too drunk)
game.player.stamina   // 0..100
game.player.body      // { fat: 0..1, muscle: 0..1, weightKg, fatKg, leanKg }  // character blends the body shape from fat/muscle
```
Events: `'ate' {item, def, kcal}`, `'drank' {item, def}`, `'drunk' {bac, level: 'buzzed'|'tipsy'|'drunk'|'wasted'}`,
`'sober' {}`, `'caffeine' {mg}`, `'sick' {cause: 'spoiled'|'alcohol'|'overeating'}`, `'vomit' {position}`, `'passedOut' {cause}`,
`'tired' {level: 'tired'|'very_tired'|'exhausted'}`, `'sleepStart' {place, hours}`, `'sleepEnd' {place, hours, healed}`,
`'shower' {place}`, `'bodyChanged' {fat, muscle, weightKg}` (at most once per game day).

The numbers (calories per item, Widmark blood alcohol, MET energy burn, 7,700 kcal per kg of fat) are documented in `economy.md`.

---

## `game.wallet` (carried cash) and `game.bank` (safe money)

```js
game.wallet.cash                      // dollars on Nico; game.player.money is an alias
game.wallet.hot                       // part of the cash that came from crime (confiscated on arrest)
game.wallet.earn(amount, { category, memo, from, hot = false, method: 'cash'|'deposit' }) -> entry
game.wallet.pay(amount, { to, category, memo, method: 'auto'|'cash'|'card', accepts: ['cash','card'], place, brand }) 
        -> { ok, method, entry, reason: 'insufficient'|'cash_only'|'card_declined' }
game.wallet.canPay(amount, opts) -> { ok, method }
game.wallet.lose(amountOrFraction, { reason: 'death'|'arrest'|'mugged'|'pickpocket'|'dropped', by }) -> lost dollars
game.wallet.wage({ job, gross, hours, tips = 0, method: 'cash'|'deposit' }) -> { net, entry }

game.bank.balance                     // checking
game.bank.savings                     // savings (interest daily)
game.bank.card -> { last4, frozen, dailyLimit, spentToday }
game.bank.deposit(amount, { atm }) -> { ok, fee, reason }      game.bank.withdraw(amount, { atm }) -> { ok, fee, reason }
game.bank.transfer(amount, 'checking'|'savings', 'checking'|'savings')
game.bank.atm(atmInfo) -> { network: bool, fee, withdrawLimitLeft }   // atmInfo: { brand, place }
game.bank.statement({ limit = 50, account, category, sinceDay }) -> [entry]   // the phone banking app
game.bank.ledger -> all entries (newest last), each { id, t, day, clock, account: 'cash'|'checking'|'savings', amount (+/-),
                    balance, category, memo, party, place, method }
game.bank.loans.offer({ kind: 'mortgage'|'auto'|'boat'|'personal', principal, collateral }) -> { apr, weeks, weekly, down }
game.bank.loans.take(offer) -> loan          game.bank.loans.list() -> [loan]        game.bank.loans.payOff(id)
game.bank.netWorth() -> { cash, checking, savings, stocks, property, vehicles, businesses, debts, total }

game.fines.issue({ kind: 'speeding'|'red_light'|'parking'|'littering'|'traffic_stop'|'court', amount?, speedOver?, plate, place, camera: bool })
        -> fine    // mailed to the safehouse (next mail delivery), due in 7 game days
game.fines.list({ unpaid: true }) -> [fine]       game.fines.pay(id, { method }) -> { ok }
game.fines.overdue() -> [fine]                    // police: an overdue fine is a reason to hold you at a traffic stop
game.insurance.quote({ kind: 'vehicle'|'health', vehicleId? }) -> { weekly, deductible, coverage }
game.insurance.buy(quote) -> policy     game.insurance.cancel(policyId)     game.insurance.policies() -> [policy]
game.insurance.claim(vehicleId) -> { ok, deductible, readyAt, reason }
```
Rules: cash can be lost (death, arrest, muggers); bank money cannot. Cards leave a trail: `'cardUsed' {place, amount, brand}`
is emitted on every card payment (police can use it while you are wanted). ATMs of the player's own bank are free;
others charge a fee. Street carts and some small shops are cash only (`accepts: ['cash']`).
Events: `'money' {account, amount, balance, entry}`, `'paid' {...}`, `'cashLost' {amount, reason}`, `'wage' {job, net}`,
`'fineIssued' {fine}`, `'finePaid' {fine}`, `'fineOverdue' {fine}`, `'warrant' {reason, fines}`, `'mail' {propertyId, mail}`,
`'insuranceClaim' {policy, vehicleId}`, `'loanMissed' {loan}`, `'repossessed' {loan, collateral}`, `'rentDue' {...}`.

## `game.economy`: prices, incomes, districts
```js
game.economy.district(nameOrX, z?) -> { id, name, income: 0..1, tier: 'low'|'mid'|'high'|'luxury', medianIncome, priceIndex,
                                         rentIndex, tourist: 0..1, nightlife: 0..1, crime: 0..1 }
game.economy.price(base, { district, kind }) -> dollars      game.economy.jobs -> { jobId: { hourly, tips, perTask, ... } }
game.economy.anchors -> price anchors used by every track (cars by tier, boats, property by district, clothing tiers)
game.economy.wageFor(jobId, { hours, performance: 0..1 }) -> { gross, tips }
game.hours.forType(shopType) -> weekly schedule [[open, close] x 7] (Sunday first; null = closed that day)
game.hours.isOpen(shopOrType, now?) -> bool     game.hours.status(shopOrType) -> { open, opensIn, closesIn, text: 'Open until 10 PM' }
game.hours.define(shopType, schedule)           // category agents add their own types
```
The full sheet is `src/systems/economy.md` (income per job per real hour vs. the price of every tier of car, boat and property).

---

## `game.property`: homes, rooms, garages, slips; `game.garage`: owned vehicles

```js
game.property.define({ id, kind: 'house'|'apartment'|'hotel_room'|'garage'|'marina_slip'|'business', name, district, pos: [x,y,z],
                       price, rentPerWeek, nightly, features: { bed, wardrobe, stash, mail, shower, kitchen, fridge },
                       garageSlots: 0, boatSlips: 0, helipad: false, interiorId, entrance: { pos, heading }, spawn: { pos, heading } })
game.property.get(id) -> def + state        game.property.all(filter?)       game.property.owned() -> [..]   game.property.home -> the current safehouse
game.property.buy(id, { loan? }) -> { ok, reason }     game.property.sell(id) -> { ok, proceeds }
game.property.rent(id) -> { ok }                         game.property.endLease(id)
game.property.bookRoom(id, nights = 1) -> { ok, until }  // hotel: check-in now, check-out 11 AM
game.property.access(id) -> 'owned'|'rented'|'booked'|null       game.property.hasFeature(id, 'bed') -> bool
game.property.setHome(id)
game.property.stash(id) -> container (same API as inventory containers; also .cash, .depositCash(n), .withdrawCash(n))
game.property.mailbox(id) -> { items: [mail], unread, take(mailId), read(mailId) }   // mail: { id, kind, title, body, from, at, data }
game.property.sendMail(mail, { propertyId = home, delay })   // delivered at the next mail run (11 AM Mon-Sat)
game.property.nearest(x, z, { access: true, feature: 'bed' }) -> property

game.garage.register(vehicleOrSpec, { how: 'bought'|'gift'|'mission'|'stolen', price }) -> record
game.garage.records -> [{ id, modelKey, kind: 'car'|'boat'|'aircraft'|'bike', name, plate, value, custom: {}, condition: {},
                          location: { kind: 'world'|'garage'|'slip'|'impound'|'destroyed'|'delivery', propertyId, slot, pos, heading },
                          keys: true, hot: false, policyId, stats }]
game.garage.get(id)     game.garage.of(vehicle) -> record | null     game.garage.owns(vehicle) -> bool
game.garage.store(id, propertyId) -> { ok, slot, reason }       game.garage.retrieve(id, { pos, heading }) -> { ok, vehicle }
game.garage.impound(id, { reason, fee }) -> record               game.garage.release(id) -> { ok, fee }
game.garage.destroyed(id)                                        game.garage.sell(id) -> { ok, proceeds }
game.garage.setSpawner(fn(record, pos, heading) -> vehicle)      // vehicles-core / boats / aircraft plug in how to build one
game.garage.capture(vehicle) -> condition blob                   // setCapture(fn) lets vehicle tracks define what is stored
```
Events: `'propertyBought' {id}`, `'propertySold'`, `'propertyRented'`, `'leaseEnded' {id, reason}`, `'roomBooked' {id, until}`,
`'roomExpired' {id}`, `'vehicleRegistered' {record}`, `'vehicleStored'`, `'vehicleRetrieved'`, `'vehicleImpounded' {record, fee}`,
`'vehicleReleased'`, `'vehicleLost' {record, reason}`.

---

## `game.business`, `game.stocks`, `game.betting`, `game.lottery` (rules and state; UI is `ui-frontend` / interiors)

```js
game.business.types -> { nightclub, car_wash, marina, restaurant, garage }   // demand curves, costs, upgrades, roles
game.business.listings() -> [{ id, type, name, district, price, propertyId }]     game.business.addListing(listing)
game.business.buy(listingId, { loan? }) -> { ok }          game.business.owned() -> [biz]       game.business.get(id)
game.business.applicants(id) -> [{ id, name, role, skill, wage, traits }]         game.business.hire(id, applicantId)
game.business.fire(id, staffId)     game.business.setWage(id, staffId, hourly)    game.business.setPrice(id, level 0.6..1.6)
game.business.setHours(id, schedule)                      game.business.upgrade(id, upgradeKey) -> { ok, cost }
game.business.collect(id) -> dollars (safe -> wallet, as cash)                     game.business.report(id, days = 7) -> daily rows
game.business.launder(id, amount) -> { ok, accepted }      // hot cash becomes clean revenue over time (cash businesses only)
game.business.raid.resolve(id, { defended: bool, damage })                        // story/systems-2 runs the fight
```
Events: `'businessBought'`, `'businessDay' {id, row}`, `'businessRaid' {id, deadline, attackers, strength}`,
`'businessRaidResult' {id, lost, defended}`, `'staffQuit' {id, staff, reason}`, `'staffHired'`, `'staffFired'`.

```js
game.stocks.list() -> [{ symbol, brandId, name, sector, price, open, change, changePct, high52, low52, history: [..] }]
game.stocks.get(symbol)        game.stocks.marketOpen -> bool        game.stocks.index -> { value, changePct }
game.stocks.buy(symbol, shares) -> { ok, cost, reason }     game.stocks.sell(symbol, shares) -> { ok, proceeds }
game.stocks.portfolio() -> { positions: [{ symbol, shares, avgCost, value, pnl }], value, pnl }
game.stocks.impact(brandIdOrSymbol, pct, { reason, permanent: 0..1, rivals: true })   // -0.04 = a 4% hit
game.stocks.schedule(news)     // { at, brandId, pct, headline }: scheduled news that moves a price
```
Any module can report what the player did to a company: `game.emit('brandEvent', { brandId, kind: 'robbery'|'vandalism'|
'truck_destroyed'|'bulk_purchase'|'scandal'|'promo', magnitude: 0..1, place })`. Stocks, news and stats listen.
Events: `'stockMove' {symbol, pct, reason}`, `'marketOpen'`, `'marketClose'`, `'dividend' {symbol, amount}`.

```js
game.betting.events({ kind?, open: true }) -> [{ id, kind: 'horse'|'boat'|'league'|'street_race'|'jai_alai', name, startsAt,
                                                 runners: [{ id, name, odds (decimal), form }], status }]
game.betting.create(eventSpec) -> event      // jobs/races register real races; settle them with the true result
game.betting.place(eventId, runnerId, stake, { type: 'win'|'place', method }) -> { ok, bet }
game.betting.settle(eventId, resultOrder?)   // omitted: simulated from the true probabilities
game.betting.bets({ open }) -> [bet]         game.betting.collect(betId?) -> dollars

game.lottery.games -> [{ id, price, name, topPrize, overallOdds, tiers: [{ prize, odds }] }]
game.lottery.buy(gameId, { method, place }) -> { ok, item }   // the ticket is an inventory item; its outcome is fixed at purchase
game.lottery.scratch(itemOrUid) -> { prize, cells, matches }   // also the 'scratch' use action
game.lottery.redeem(itemOrUid, { place }) -> { ok, paid, how: 'cash'|'claim_mailed', reason }
```
Events: `'betPlaced'`, `'betSettled' {bet, won, payout}`, `'raceResult' {event, order}`, `'lotteryBought'`,
`'lotteryScratched' {item, prize}`, `'lotteryWon' {prize, game}`.

---

## `game.news`, `game.stats`

```js
game.news.post({ headline, body?, kind: 'crime'|'business'|'weather'|'sports'|'traffic'|'local'|'player'|'market'|'event',
                 about: 'player'|brandId|null, place, district, priority: 0..3, ttlHours = 24, channels: ['tv','radio','phone','social'],
                 data }) -> story
game.news.feed({ channel, kind, limit = 20, sinceMinutes }) -> [story] (newest first)       game.news.latest(channel) -> story|null
game.news.breaking -> story | null        // priority 3 within the last game hour (TVs cut to it)
game.news.subscribe(fn(story)) -> unsubscribe
game.news.playerReport({ crime, place, district, description: { shirt, vehicle, ... }, severity })   // police/npc: what witnesses said

game.stats.add(key, n = 1)     game.stats.set(key, v)     game.stats.max(key, v)     game.stats.get(key) -> number
game.stats.all() -> { key: value }      game.stats.log(text, { kind, data })      game.stats.journal -> [{ t, day, text, kind }]
game.stats.achievements -> [{ id, name, description, unlocked: bool, at }]            game.stats.defineAchievement({ id, name, description, test(stats) })
```
Events: `'news' {story}`, `'achievement' {id, name}`, `'stat' {key, value}` (only for keys someone subscribed to with
`game.stats.watch(key, fn)`).

---

## Events core-systems LISTENS to (emit these and things just work)
- `'crime' {type, position, severity, shop?, brandId?, amount?}`: stats, news, stock dips for the chain you robbed, hot cash.
- `'playerDied'`, `'arrest'`: cash loss rules, hospital bill, confiscation of stolen items and hot cash.
- `'pickup' {type}`: stats. `'activityEnd' {id, success}`: stats.
- `'brandEvent'` (above). `'missionComplete' {id}`: autosave + stats. `'jobPaid' {job, gross, tips, hours}`: wages via `game.wallet.wage`.
- `'vehicleDestroyed' {vehicle}`: owned-vehicle registry and insurance. `'vehicleTowed' {vehicle, reason}`: impound.

## Files
`systems.v2.js` (game wiring) · `index.js` (`createSystems(host)`, engine-free) · `util.js` · `storage.js` · `save.js` · `time.js` ·
`settings.js` · `items.js` · `inventory.js` · `needs.js` · `money.js` · `economy.js` · `property.js` · `business.js` · `stocks.js` ·
`betting.js` · `lottery.js` · `worldstate.js` (hours, news, stats, deltas, memory) · `economy.md` · `tests/`.
