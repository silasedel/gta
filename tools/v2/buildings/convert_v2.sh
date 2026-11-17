#!/bin/bash
# Convert library models listed in models.json (all, or the names given) into public/assets/models/buildings/.
#   tools/v2/buildings/convert_v2.sh [name ...]      (4 in parallel; Blender with auto-run scripts off)
S="$(cd "$(dirname "$0")" && pwd)"; O="$S/../../../public/assets/models/buildings"
names=("$@"); [ ${#names[@]} -eq 0 ] && names=($(python3 -c "import json;print(' '.join(json.load(open('$S/models.json'))))"))
printf "%s\n" "${names[@]}" | xargs -P 4 -I{} sh -c '/opt/homebrew/bin/blender -b -Y --python-exit-code 1 --python "$0/convert_v2.py" -- "$0/models.json" {} "$1" 2>&1 | grep -E "^CONV|Error|Traceback" | head -3' "$S" "$O"
