# Overnight status (each helper edits only its own section)

## lead
- 00:05 test pages confirmed: no reload while helpers save files; frame rate at the house spot 60 fps. Found the house test spot pointing at old coordinates (open water): sent to keys.
- 23:55 team launched


## keys
- 00:20 House spot checked: the house, its anchors and the player spawn are all at the layout.json spot (-873.6, 4825.2, heading 1.057); probe `docs/v2/reports/keys-k0-probe.json`. The stale (-836, 5272) was only in test tools: fixed in furniture-audit, road-audit, veg-audit, veg-perf, roads/mkspots.mjs, roads/spots/ground.json (keys2 moved by the same offset to (-937.6, 4883.2)). The last two are untracked (roads helper's files), edited in place, not committed by me. Added `anchors.front` (yard, facing the house) so s1-tour `house` lands in the yard. STAGE1_AGENT_NOTES.md and CONVENTIONS.md still say (-836, 5272): lead please update. New tool: `node tools/v2/keys/shots.mjs --set X` (cameras in house-local coordinates, `tools/v2/keys/spots.json`).
- 00:20 Baseline shots: `docs/v2/shots/keys/k0_{deck,front,aerial,back,dock,top}.png` (deck view 22 ms, 675 draw calls).
