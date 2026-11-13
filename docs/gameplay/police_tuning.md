# Port Solana: wanted level and police tuning

These are our own values, balanced to feel like the genre without copying any specific game.

The code lives in two files:
- `src/gameplay/gameplay.js` holds `SEV`, `MINOR`, `HEAT_STEPS`, `SEARCH_R`, `CLEAR_TIME` and `WITNESS_CALL`.
- `src/gameplay/police.js` holds `SIGHT`, `CAR_TARGET` and `FOOT_TARGET`.

## 1. Crime → stars

| Crime | Base stars | Reported when |
|---|---|---|
| Punching a civilian, shoplifting, stealing a parked car, carjacking | 1★ | A cop sees it, or a civilian witness finishes a 5–8 s call. You can stop the call by killing or threatening (aiming at) the witness. Parked-car theft counts only if a cop sees it. |
| Gunfire in public | 2★ | Cop sight or witness call |
| Assaulting a police officer (melee) | 2★ | Always (the officer is the witness) |
| Hit-and-run (pedestrian) | 2★ | Cop sight or witness call |
| Armed robbery (store or ATM break-in) | 2★ | Cop sight or witness call, or straight away if a store clerk witnesses it |
| Taking a police car | 2★ | Always |
| Shooting at police (bullet or explosion hits a cop or cruiser) | 3★ | Always |
| Murder | 3★ | Cop sight or witness call |
| Killing a cop | 3★, or current +1 when already at 3★ or more | Always |

**Escalation.** Every reported crime adds its stars to a heat pool. The heat thresholds for 1★ to 5★ are 1, 3, 7, 14 and 24. While a cop can see you, fighting back adds 0.12 heat per second. Fighting back means you shot, hit a person, or hit a cop in the last 4 s. Sustained violence therefore reaches 4★ and then 5★.

## 2. Police sight

| Parameter | Value |
|---|---|
| Vision cone | 110° (±55° from the officer's or car's heading) |
| Range on foot | 60 m |
| Range in a car | 90 m |
| Close-range awareness (ignores the cone) | 8 m on foot, 15 m in a car |
| Night (before 06:30 or after 19:30) | range ×0.65 |
| You are in the water | range ×0.6 |
| You are under cover, such as a bridge or overpass | range ×0.7 |
| Line of sight | Ray against static world geometry; buildings and bridges block it |

## 3. Search area and losing the police

| Stars | Search radius (start) | Grows to (slowly) | Unseen time outside the area to lose the cops |
|---|---|---|---|
| 1★ | 150 m | 202 m | 10 s |
| 2★ | 250 m | 337 m | 15 s |
| 3★ | 400 m | 540 m | 25 s |
| 4★ | 600 m | 810 m | 35 s |
| 5★ | 800 m | 1080 m | 45 s |

- The circle starts once no officer or car has seen you for 2.5 s.
- It is centred on the last-seen position, which follows you for that 2.5 s grace period.
- Its radius grows by (1 + 0.6 × stars) m/s.
- Inside the circle the escape timer runs back down.
- If an officer sees you again, the circle disappears and both timers reset.
- The HUD draws `game.wanted.searchCenter` and `searchRadius`. `game.wanted.clearProgress` (0..1) is available for a progress ring.

## 4. Response

| Stars | Cruisers | Foot officers | Shooting | Other |
|---|---|---|---|---|
| 1★ | 1 | – (cops step out of cars) | Only against an armed suspect (aiming a gun or fired in the last 10 s) | Arrest possible |
| 2★ | 2 | up to 2 | Only against an armed suspect | Arrest possible |
| 3★ | 3 | up to 4 | Shoot on sight; some officers carry shotguns or SMGs | |
| 4★ | 4 | up to 6 | Shoot on sight; rifles, carbines; shooting from car windows | Roadblocks across the road ahead: two cruisers plus breakaway barriers, no spike strips |
| 5★ | 6 (faster respawn) | up to 8 | Maximum aggression | Roadblocks, fastest reinforcements |

**Arrest** is possible only at 1–2★, only on foot, and only while you are not resisting. An officer must stay within 1.6 m for 2 s. Resisting means any of these:
- sprinting away;
- hitting an officer in the last 4 s;
- holding a gun aimed, or having fired in the last 10 s.

If you are arrested you lose your weapons and pay a 10% cash fee, then respawn at the nearest precinct.
