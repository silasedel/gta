#!/bin/bash
# Build Mari, the second protagonist, from the user's Tripo export (Models/Main Character 3 - Woman ..., or the Tripo zip
# unpacked anywhere) into public/assets/characters/mari/. Her scan stands arms down, so it is first re-posed to a T-pose
# (fbx_to_glb.py -> tools/v2/npcs/apose_lifeguard.py, landmarks 'mari' there). Then the same pipeline as Nico
# (build.sh): rig_nico.py (clean,
# landmarks, the 52-bone Mixamo-named skeleton, bone-heat weights, LOD 0/1/2, canonical T-pose) -> textures.py (4K albedo,
# normal, matte roughness) -> measure.py (hit-zone / ragdoll capsules). No wardrobe region mask (regions.py keys on Nico's
# teal shirt); the runtime treats a missing mask as "baked outfit only".
#   ./tools/v2/player/build_mari.sh [source dir with *.fbx + *.fbm] [scratch dir]
# Never modifies Models/ and never runs anything inside the source folder.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC_DIR="${1:-$(ls -d "$ROOT/Models/Main Character/Main Character 3"* 2>/dev/null | head -1)}"
SCR="${2:-${TMPDIR:-/tmp}/mari_build}"
FBX="$(ls "$SRC_DIR"/*.fbx | head -1)"
FBM="$(ls -d "$SRC_DIR"/*.fbm | head -1)"
OUT="$ROOT/public/assets/characters/mari"
mkdir -p "$SCR" "$OUT"
cd "$SCR"
mkdir -p "$SCR/src"
/opt/homebrew/bin/blender -b --python-exit-code 1 --python "$ROOT/tools/v2/player/fbx_to_glb.py" -- "$FBX" \
  "$(ls "$FBM"/*basecolor.jpg | head -1)" "$SCR/src/mari_src.glb" 2>&1 | grep -E '\[fbx2glb\]|Error|Traceback' || true
/opt/homebrew/bin/blender -b --python-exit-code 1 --python "$ROOT/tools/v2/npcs/apose_lifeguard.py" -- \
  --in "$SCR/src/mari_src.glb" --id mari --height "${MARI_HEIGHT:-1.69}" --mode pose --out "$SCR/apose" 2>&1 |
  grep -E '\[apose\] mari (bbox posed|wrote)|Error|Traceback' || true
test -s "$SCR/apose/mari_tpose.glb"
/opt/homebrew/bin/blender -b --python-exit-code 1 --python "$ROOT/tools/v2/player/rig_nico.py" -- \
  --in "$SCR/apose/mari_tpose.glb" \
  --id mari --height "${MARI_HEIGHT:-1.69}" --out "$SCR/rig" --lods 0,24000,7000 --blend 1 2>&1 |
  grep -E '\[rig-nico\]|Error|Traceback' || true
test -s "$SCR/rig/mari.glb"
python3 "$ROOT/tools/v2/player/textures.py" "$FBM" "$SCR/tex"
/opt/homebrew/bin/blender -b "$SCR/rig/mari.blend" --python-exit-code 1 \
  --python "$ROOT/tools/v2/player/measure.py" -- "$SCR/fit.json" 2>&1 |
  grep -E '\[measure\]|Error|Traceback' || true
cp "$SCR/rig/mari.glb" "$OUT/mari.glb"
python3 - "$SCR/rig/mari.json" "$OUT/mari.json" "$SCR/fit.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
m['fit'] = json.load(open(sys.argv[3]))
m['src'] = 'Tripo FBX tripo_convert_6f9eb2ce (Main_Female_Character), T-pose'
json.dump(m, open(sys.argv[2], 'w'), indent=1)
PY
cp "$SCR/tex/"*.webp "$OUT/"
ls -la "$OUT"
