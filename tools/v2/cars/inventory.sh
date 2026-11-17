#!/bin/bash
# Inventory every source car in sources.txt: tools/v2/cars/inspect.py -> <out>/<key>.json + top / 3/4 renders.
# usage: inventory.sh <outdir> [key-regex]   (4 Blender jobs at a time)
cd "$(dirname "$0")/../../.."
OUT="$1"; RE="${2:-.}"; mkdir -p "$OUT"
run() { /opt/homebrew/bin/blender -b --disable-autoexec --factory-startup -P tools/v2/cars/inspect.py -- "Models/Cars/$2" "$OUT/$1" > "$OUT/$1.log" 2>&1; grep -h INSPECTED "$OUT/$1.log" || echo "FAIL $1"; }
while IFS='|' read -r k p; do
  [[ "$k" =~ $RE ]] || continue
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 1; done
  run "$k" "$p" &
done < tools/v2/cars/sources.txt
wait
