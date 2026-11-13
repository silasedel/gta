# Overnight run: goals and acceptance criteria

The user is asleep. Work all night and keep the game original (no copied content).

Rules carried over:
- No idle stops. When your task passes its checks, keep improving within your scope and re-run your checks.
- **Ports:** 5180 is the dev server. NEVER touch 5173.
- **Edits:** atomic only.
- **Testing:** muted, isolated headless Chrome only. Never attach to the user's browser.
- **Proof:** in a PRODUCTION build (`vite build --outDir /private/tmp/claude-501/<yours>` + `vite preview` on your own spare port).

## A. Overpasses and elevated roads (ELEVATED agent, `src/world/miami/elevated.js`)
- **Deck shape:** every elevated road is one continuous, smooth paved deck, with no stitched segments, steps, gaps or overlapping pieces.
  - Correct width and lane markings.
  - Vertical curves with grade at most 6–8%.
  - Banking on curves.
  - Ramps that merge tangentially into ground roads.
- **Structure:** solid concrete jersey barriers (real thickness, colliders that match exactly), bridge piers and columns with caps, a deck slab with fascia and an underside, expansion joints, and lamp posts.
  - No thin or floating barriers.
  - Nothing through other roads.
- **Driving:** a real car drives every elevated route at 60, 120 and 180 km/h with **zero** drops, zero bumps over 5 cm, and zero hits on barriers while centred in its lane.
- **Look:** screenshots from 4 angles plus the deck view of every cluster show no glitches.

## B. Detail parity everywhere (CITY agent)
- Downtown, Brickell, Edgewater, Overtown, PortMiami, Watson, Star, Palm, Hibiscus, the Venetian islands, Fisher Island and the causeways get the **same density and quality as the South Beach spawn area**:
  - Varied facades, storefronts with enterable shops, plazas, parks, sidewalk furniture and street trees.
  - Surface variety (sand, grass, pavers, concrete), signage, lamps and parked cars.
- **Measured per district:** props and enterable shops per km of street. Bring every district to at least 80% of South Beach's numbers.
- **Collisions:** the ground-collider coverage check shows zero holes, and the road audit stays clean.

## C. Vehicles (VEHICLES agent)
- **Crashes in a production Miami build:**
  - Ram parked and moving cars at 60, 120 and 200 km/h, with every car class including the supercar.
  - Zero pass-throughs, zero cars flung over others.
- **Boats:** finished.
- **GPU memory:** levels off over a 10-minute loop.

## D. Everyone
- GPU memory (geometries and textures) must level off within ±5% between laps of a 10-minute loop.
- No frame over 25 ms after loading, no console errors, and no physics crashes.
