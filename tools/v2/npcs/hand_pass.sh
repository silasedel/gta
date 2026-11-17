#!/bin/bash
# Hand pass over every rigged person (one Blender at a time): tools/v2/npcs/out/blend/<id>.blend -> <OUT>/<id>.glb
#   tools/v2/npcs/hand_pass.sh [ids...]     OUT=tools/v2/npcs/out/handpass by default (copy into public/ after review)
cd "$(dirname "$0")/../../.."
OUT=${OUT:-tools/v2/npcs/out/handpass}; mkdir -p "$OUT"
ids="$*"; [ -z "$ids" ] && ids=$(ls tools/v2/npcs/out/blend/*.blend | xargs -n1 basename | sed 's/\.blend$//')
for id in $ids; do
  /opt/homebrew/bin/blender -b --python-exit-code 1 -P tools/v2/npcs/hand_pass.py -- --blend "tools/v2/npcs/out/blend/$id.blend" --id "$id" --out "$OUT" > "$OUT/$id.log" 2>&1 && echo "ok $id" || echo "FAIL $id"
done
