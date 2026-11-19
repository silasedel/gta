#!/bin/bash
# Convert the airport library models (tools/v2/airport/models.json) into public/assets/models/airport/ with the shared
# building converter (tools/v2/buildings/convert_v2.py: meters, origin at the footprint center on the ground, +Z front,
# WebP textures, optional far LOD). Then tools/v2/airport/fix_textures.py repaints labels / ages textures.
#   tools/v2/airport/convert.sh [name ...]
S="$(cd "$(dirname "$0")" && pwd)"; O="$S/../../../public/assets/models/airport"; B="$S/../buildings"
mkdir -p "$O"
names=("$@"); [ ${#names[@]} -eq 0 ] && names=($(python3 -c "import json;print(' '.join(json.load(open('$S/models.json'))))"))
printf "%s\n" "${names[@]}" | xargs -P 3 -I{} sh -c '/opt/homebrew/bin/blender -b -Y --python-exit-code 1 --python "$0/convert_v2.py" -- "$1/models.json" {} "$2" 2>&1 | grep -E "^CONV|Error|Traceback" | head -3' "$B" "$S" "$O"
