#!/bin/bash
# Utility vehicles (user downloads, Nov 19): crew UTV utv1, sport ATV atv1, single-seat UTV utv2, golf cart golf1, baggage cart
# bagcart1.  Prep (tools/v2/cars/utility/prep.py: lettering out of the textures) + the shared car converter + seats (+ the
# hand-set seat fixes in seats_fix.py) + index.
#   tools/v2/cars/utility/build.sh [utv1 atv1 ...]      (default: all five)
# Sources: Models/Cars/Utility/ (cars.json src); prepared sources go to .v2-tmp/utility/ (local only).
cd "$(dirname "$0")/../../../.."
B=/opt/homebrew/bin/blender; OUT=public/assets/vehicles/cars; LOG=tools/v2/cars/logs; TMP=.v2-tmp/utility
mkdir -p $OUT $LOG $TMP
KEYS="${@:-utv1 atv1 utv2 golf1 bagcart1}"
for k in $KEYS; do
  rm -f "$TMP/$k.blend"
  src=$(python3 -c "import json;print(json.load(open('tools/v2/cars/cars.json'))['$k']['src'])")
  cfg=$(python3 -c "import json;c=json.load(open('tools/v2/cars/cars.json'))['$k'];print(json.dumps({x:y for x,y in c.items() if x!='src'}))")
  $B -b --factory-startup -P tools/v2/cars/utility/prep.py -- $k "$PWD/Models/Cars/$src" "$PWD/$TMP/$k.blend" > $LOG/${k}_prep.log 2>&1
  [ -f "$TMP/$k.blend" ] || { echo "PREP FAIL $k"; tail -5 $LOG/${k}_prep.log; continue; }
  $B -b --disable-autoexec --factory-startup -P tools/v2/cars/convert.py -- "$TMP/$k.blend" $OUT $k "$cfg" > $LOG/$k.log 2>&1
  grep -h "DONE\|FAIL" $LOG/$k.log || (echo "ERR $k"; grep -h -A3 "Traceback\|Error" $LOG/$k.log | tail -6)
done
NPZ=$(mktemp -d); G=$(for k in $KEYS; do [ -f $OUT/$k.glb ] && echo $OUT/$k.glb; done)
$B -b --factory-startup -P tools/v2/cars/dump_geo.py -- $NPZ $G > $LOG/_dump_utility.log 2>&1
python3 -P tools/v2/cars/seats.py $NPZ $KEYS | tail -5; rm -rf $NPZ
python3 -P tools/v2/cars/utility/seats_fix.py $KEYS
python3 tools/v2/cars/index.py
