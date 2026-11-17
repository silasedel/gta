#!/bin/bash
# Build the hero Nico from the user's main-character model (Models/Main Character 1) into public/assets/characters/nico_tripo/.
#   ./tools/v2/player/build.sh [scratch dir]
# Steps: rig_nico.py (Blender: clean, landmarks, 52-bone Mixamo-named skeleton, bone-heat weights, LOD 0/1/2, canonical
# T-pose) -> textures.py (4K albedo, normal, matte roughness) -> copy GLB + meta + textures. Never modifies Models/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCR="${1:-${TMPDIR:-/tmp}/nico_tripo_build}"
SRC_DIR="$ROOT/Models/Main Character/Main Character 1 - Man In Teal Palm Shirt And Cargo Pants"
FBX="$(ls "$SRC_DIR"/*.fbx | head -1)"; FBM="$(ls -d "$SRC_DIR"/*.fbm | head -1)"
OUT="$ROOT/public/assets/characters/nico_tripo"
mkdir -p "$SCR" "$OUT"
cd "$SCR"
/opt/homebrew/bin/blender -b --python-exit-code 1 --python "$ROOT/tools/v2/player/rig_nico.py" -- --in "$FBX" --id nico_tripo \
  --height "${NICO_HEIGHT:-1.83}" --out "$SCR/rig" --lods 0,24000,7000 --blend 1 2>&1 | grep -E '\[rig-nico\]|Error|Traceback' || true
test -s "$SCR/rig/nico_tripo.glb"
python3 "$ROOT/tools/v2/player/textures.py" "$FBM" "$SCR/tex"
python3 -c "from PIL import Image; Image.open('$SCR/tex/albedo_1k.webp').save('$SCR/alb1k.png')"
/opt/homebrew/bin/blender -b "$SCR/rig/nico_tripo.blend" --python-exit-code 1 --python "$ROOT/tools/v2/player/regions.py" -- "$SCR/alb1k.png" "$SCR/regions.npz" 2>&1 | grep -E '\[regions\]|Error|Traceback' || true
python3 "$ROOT/tools/v2/player/regions_raster.py" "$SCR/regions.npz" "$SCR/tex/regions.webp"
/opt/homebrew/bin/blender -b "$SCR/rig/nico_tripo.blend" --python-exit-code 1 --python "$ROOT/tools/v2/player/measure.py" -- "$SCR/fit.json" 2>&1 | grep -E '\[measure\]|Error|Traceback' || true
cp "$SCR/rig/nico_tripo.glb" "$OUT/nico_tripo.glb"
python3 - "$SCR/rig/nico_tripo.json" "$OUT/nico_tripo.json" "$SCR/fit.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m['fit'] = json.load(open(sys.argv[3]))   # hit zones / ragdoll / capsule fit (measure.py)
m['src'] = 'Models/Main Character/Main Character 1 - Man In Teal Palm Shirt And Cargo Pants (Tripo FBX, T-pose)'
json.dump(m, open(sys.argv[2], 'w'), indent=1)
PY
cp "$SCR/tex/"*.webp "$OUT/"
ls -la "$OUT"
