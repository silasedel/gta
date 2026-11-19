#!/bin/bash
# Service trucks: prep (tools/v2/cars/service/prep.py) + the shared car converter + seats + index.
#   tools/v2/cars/service/build.sh [truck12|truck13 ...]      (default: both)
# Prepared sources go to .v2-tmp/service/ (local only); outputs to public/assets/vehicles/cars/<key>.glb/.json.
cd "$(dirname "$0")/../../../.."
B=/opt/homebrew/bin/blender; OUT=public/assets/vehicles/cars; LOG=tools/v2/cars/logs; TMP=.v2-tmp/service; mkdir -p $OUT $LOG $TMP
KEYS="${@:-truck12 truck13}"
for k in $KEYS; do
  rm -f "$TMP/$k.blend"
  src=$(python3 -c "import json;print(json.load(open('tools/v2/cars/cars.json'))['$k']['src'])")
  cfg=$(python3 -c "import json;c=json.load(open('tools/v2/cars/cars.json'))['$k'];print(json.dumps({x:y for x,y in c.items() if x!='src'}))")
  $B -b --factory-startup -P tools/v2/cars/service/prep.py -- $k "Models/Cars/$src" "$PWD/$TMP/$k.blend" > $LOG/${k}_prep.log 2>&1; [ -f "$TMP/$k.blend" ] || { echo "PREP FAIL $k"; tail -5 $LOG/${k}_prep.log; continue; }
  $B -b --disable-autoexec --factory-startup -P tools/v2/cars/convert.py -- "$TMP/$k.blend" $OUT $k "$cfg" > $LOG/$k.log 2>&1
  grep -h "DONE\|FAIL" $LOG/$k.log || (echo "ERR $k"; grep -h -A3 "Traceback\|Error" $LOG/$k.log | tail -6)
done
NPZ=$(mktemp -d); G=$(for k in $KEYS; do [ -f $OUT/$k.glb ] && echo $OUT/$k.glb; done)
$B -b --factory-startup -P tools/v2/cars/dump_geo.py -- $NPZ $G > $LOG/_dump_service.log 2>&1
python3 -P tools/v2/cars/seats.py $NPZ $KEYS | tail -3; rm -rf $NPZ
python3 tools/v2/cars/index.py
