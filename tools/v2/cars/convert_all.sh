#!/bin/bash
# Convert library cars (cars.json) -> public/assets/vehicles/cars/<key>.glb/.json.  usage: convert_all.sh [key-regex] [jobs=3]
cd "$(dirname "$0")/../../.."
RE="${1:-.}"; J="${2:-3}"; OUT=public/assets/vehicles/cars; LOG=tools/v2/cars/logs; mkdir -p $OUT $LOG
keys=$(python3 -c "import json;print(' '.join(json.load(open('tools/v2/cars/cars.json')).keys()))")
for k in $keys; do
  [[ "$k" =~ ^($RE)$ ]] || continue
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do sleep 1; done
  ( cfg=$(python3 -c "import json;c=json.load(open('tools/v2/cars/cars.json'))['$k'];print(json.dumps({x:y for x,y in c.items() if x!='src'}))")
    src=$(python3 -c "import json;print(json.load(open('tools/v2/cars/cars.json'))['$k']['src'])")
    /opt/homebrew/bin/blender -b --disable-autoexec --factory-startup -P tools/v2/cars/convert.py -- "Models/Cars/$src" $OUT $k "$cfg" > $LOG/$k.log 2>&1
    grep -h "DONE\|FAIL" $LOG/$k.log || (echo "ERR $k"; grep -h -A3 "Traceback\|Error" $LOG/$k.log | tail -4) ) &
done
wait
python3 tools/v2/cars/index.py
