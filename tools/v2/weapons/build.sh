#!/bin/bash
# Convert the user's weapon models (Models/Weapons) into public/assets/weapons/<key>.glb + <key>.json, then the manifest.
#   tools/v2/weapons/build.sh [key ...]      (no keys = all)   STAGE=raw for a first look without the grip offset
cd "$(dirname "$0")"
OUT="${OUT:-../../../public/assets/weapons}"
KEYS="$@"; [ -z "$KEYS" ] && KEYS=$(python3 -c "import json;print(' '.join(json.load(open('weapons.json'))['models']))")
for k in $KEYS; do
  /opt/homebrew/bin/blender -b --factory-startup --python-exit-code 1 --python convert.py -- weapons.json "$k" "$OUT" "${STAGE:-final}" 2>&1 | grep -E "WCONV|MISSING|Error|error|Traceback|line [0-9]" | head -8
done
python3 manifest.py "$OUT"
