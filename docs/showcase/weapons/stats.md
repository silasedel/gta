# Port Solana: arsenal

All weapon models are procedural and original designs (no real manufacturers, names or logos). They are built in `src/gameplay/gunModels.js`:
- Side profiles are extruded with bevels.
- Parts are merged per material, so each gun is 2 to 9 draw calls.
- Materials are PBR, with procedural roughness and bump maps for parkerized steel, stippled polymer, wood grain, checkering and knurling.
- Optics use iridescent lens glass.

Renders: `lineup.png` and `closeup_*.png`. They come from `src/gameplay/gunPreview.html` (`?model=<key>` gives a close-up) and were captured headless at 1600×900.

## Firearms

| Key | Name | Class | Damage | RPM | Clip | Range (m) | Reload (s) | Notes | Tris | Draws |
|---|---|---|---|---|---|---|---|---|---|---|
| pistol | Solana Service 9 Pistol | handgun | 30 | 300 | 15 | 140 | 1.3 | tritium sights, slide serrations, open trigger guard, raked stippled grip, accessory rail | 1152 | 7 |
| revolver | Caballo .44 Revolver | handgun | 72 | 109 | 6 | 170 | 2.1 | fluted cylinder, half underlug, vent rib, checkered wood | 1212 | 6 |
| microsmg | Wasp Micro-SMG | smg | 13 | 1154 | 30 | 70 | 1.4 | integral suppressor, mini red dot, folding stock | 1124 | 9 |
| smg | Kestrel SMG | smg | 18 | 800 | 35 | 100 | 1.6 | holographic sight, slotted modular handguard | 1372 | 8 |
| rifle | Biscayne GR-27 Assault Rifle | rifle | 29 | 600 | 30 | 230 | 2.0 | free-float rail, red dot, muzzle brake, FDE furniture | 2324 | 8 |
| carbine | Coastline Carbine | rifle | 38 | 400 | 20 | 260 | 1.8 | LPVO scope, suppressor, vertical grip | 2360 | 8 |
| shotgun | Breaker Pump Shotgun | shotgun | 14 × 8 pellets | 71 | 6 | 45 | 2.4 | ribbed wood pump, bead sight | 632 | 5 |
| sawnoff | Hacksaw Double-Barrel | shotgun | 13 × 11 pellets | 200 | 2 | 24 | 1.7 | side-by-side, twin hammers | 568 | 4 |
| sniper | Longshot .308 Sniper | sniper | 165 | 48 | 5 | 500 | 2.6 | 6–12× scope (overlay on RMB), fluted barrel, bipod | 2308 | 8 |
| grenade | Frag Grenade | throwable | 160 (7.5 m radius) | — | 1 | throw arc | — | physics bounce, 2.6 s fuse, pushes cars and ragdolls | 1144 | 4 |

Shotgun pellet damage falls off with distance.

### Hit-zone damage multipliers (per-limb capsules on the bones)

| Zone | Limb | Multiplier |
|---|---|---|
| head | head | ×4.0 |
| head | neck | ×2.5 |
| torso | upper torso | ×1.25 |
| torso | lower torso | ×1.0 |
| arm | upper arm | ×0.7 |
| arm | forearm | ×0.6 |
| leg | thigh | ×0.75 |
| leg | shin | ×0.6 |

## Melee (swept arc, combos)

| Key | Reach (m) | Light | Heavy (3rd combo hit or sprinting) | Tris |
|---|---|---|---|---|
| fist | 0.9 | 14 | 32 | — |
| knife | 1.1 | 52 | 85 | 268 |
| bat | 1.5 | 42 | 72 | 384 |

Melee zone multipliers are head ×1.6, torso ×1.0 and limbs ×0.8. A hit that doesn't kill makes the target stagger.
