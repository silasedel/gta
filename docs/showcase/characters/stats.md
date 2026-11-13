# Port Solana — character library stats

Generated headless with **Blender 5.2 + MPFB2 2.0.18** (MakeHuman, assets CC0) by `pipeline/gen_humans.py` (specs: `pipeline/make_specs.py`, manifest: `pipeline/build_manifest.py`, renders: `pipeline/showcase.py`).

| | |
|---|---|
| Characters | **121** (120 pedestrians + the player) — 63 men / 58 women, ages 18–73 |
| Zones | casual 36 · beach 32 · business 20 · nightlife 12 · sport 12 · port 8 · player 1 |
| Ethnic mix (macro blends) | latino 31 · black 26 · white 24 · asian 19 · latino2 12 · mixed 9 |
| Skins | 22 MakeHuman CC0 skins (young / middle-aged / old × african / asian / caucasian × m/f) + soft subsurface-style shader |
| Hair | 10 card-hair styles + bald; hair colour tinted per instance (black / brown / fair / grey by age & background) |
| Clothing | MakeHuman CC0 garments (suits, blouse+skirt, sportswear, overalls, 6 shoe types, fedora) + procedurally modelled garment shells cut from each body with plane-cut hems (tee, tank, polo, shorts, board shorts, swim trunks, bikini top + briefs); colours / prints vary per instance |
| Rig | Mixamo-compatible 52-bone skeleton (MPFB `mixamo` rig); clips retargeted once and shared (hips scaled per person) |
| LOD0 | avg **18,331 verts / 32,023 tris** (min 14,379, max 22,104 verts) |
| LOD1 | avg **6,307 verts / 10,009 tris** (decimate 0.32) |
| LOD2 | avg **2,463 verts / 3,390 tris** (decimate 0.10) |
| Files | 121 Draco GLBs, avg 311 KB (38.6 MB) + 67 shared textures (16.2 MB, ≤1024 px) |
| Animation clips (32) | mocap (Mixamo, via three.js examples): idle ×2, walk ×2, run, sprint · procedural: jump, fall, punch L/R, guard, drive, death ×2, get-up (back / front), hit reaction, phone, phone call, talk, film, cower, hands-up flee, lie, sit-on-sand, sit-on-bench, lean on wall, dance, volleyball, frisbee throw, swim (crawl), kneel/garden, dog leash |
| Ragdoll | 11 bodies, 75 kg mass distribution (head 7 %, torso 43 %, arms ~5 %, legs ~16 % each), hinge knees/elbows with limits, soft cone limits + joint friction elsewhere, max 6 active, settle → freeze |
| Runtime | up to 60 peds near the player (time-of-day density), 3 mesh LODs + animation LOD (far peds update at 1/2–1/6 rate) |

Renders in this folder (EEVEE, 1600 px): `lineup.png`, `portrait_player.png`, `portrait_h21_casual_f.png`, `wireframe.png`, `rig.png`.


## v2 (cloth + merge pass)
- Garments are real cloth now: inflated 1–3.5 cm off the body, Laplacian-smoothed (no anatomy showing through), tops drape straight below the chest, loose flared sleeves, shorts leg openings stand off the thigh, solidified hems/collars with rims; swimwear fitted but with thickness. Procedural skirts (dress / maxi / sarong), open linen shirts over tees, hi-vis vests (port), flip-flops/sandal soles.
- Logos/text removed: the printed MakeHuman tee outfit is no longer used, watermark/label areas are painted out of every clothing texture in the atlas.
- One skinned mesh per person per LOD: LOD0 = 2 draw calls (skin atlas + everything else), LOD1/LOD2 = 1 draw call; shared atlases `atlasS.jpg` (5120x4096 skins) + `atlasC.webp` (4096² clothes/hair/eyes); per-person tint palette + fabric shading from vertex colours. Shadows only for peds within ~45 m.
- LOD0 avg 17,423 verts / 32,690 tris · LOD1 9,806 tris · LOD2 3,268 tris.
- Before/after: `before/lineup_before.png`, `before/portrait_player_before.png` vs `lineup.png`, `portrait_player.png`.
