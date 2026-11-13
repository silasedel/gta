# WAVE 3 (read CONTRACT.md + CONTRACT2.md first). Work ~40 min in safe increments; stop by 20:05 MST and report.
Dev: http://127.0.0.1:5180 (hot reload). NEVER touch 5173 (user's frozen build). ATOMIC EDITS ONLY (temp -> esbuild -> mv;
note esbuild can't resolve Vite absolute imports like '/src/fx/fx.js' — that specific error is fine, any other error is not).
Everything ORIGINAL: no real car brands/badges/logos or recognizable trademarked body designs, no names/UI/characters from existing games.
Generic archetypes are fine (wedge supercar, muscle car, luxury sedan, etc.) with made-up brand names.
Ownership this wave:
- VEHICLES agent: src/vehicles/*  (main.js enter/exit is the LEAD's)
- AUDIO agent:    src/core/audio.js, public/assets/audio/*
- GAMEPLAY agent: src/gameplay/*
- INTERIORS agent: src/world/interiors.js, src/world/interiors/*
- CITY agent:     src/world/city.js, src/world/city/*, public/assets/city/*
New cross-agent fields:
- vehicle.model = { key, brand, name, class: 'compact'|'sedan'|'suv'|'muscle'|'sports'|'super'|'van'|'taxi'|'police'|'pickup',
                    engine: 'i4'|'v6'|'v8'|'v10'|'v12'|'diesel'|'electric', maxRpm, idleRpm, gears }
- vehicle.rpm (0..maxRpm), vehicle.gear (int, -1 reverse), vehicle.throttle (0..1), vehicle.load (0..1)  — updated every frame by VEHICLES; AUDIO reads them for the player car and nearby cars.
- game.interiors shop.type may be 'guns' (Gun store): GAMEPLAY exposes game.weapons = { defs:{key:{name,price,ammoPrice,...}}, give(key, ammo), buyAmmo(key,n) } so INTERIORS can sell guns/ammo.
- city.shopLots grows (CITY adds more lots); INTERIORS fills every lot.
