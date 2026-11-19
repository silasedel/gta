#!/bin/bash
# Nico's ute (ute1): build the source from the low-poly shell, convert it like every library car, patch the measured plate
# mounts, measure seats, rebuild the fleet index.   usage: tools/v2/cars/ute1/make_ute1.sh
set -e
cd "$(dirname "$0")/../../../.."
D="Models/Cars/Trucks/Ute 1 - 1970 Coupe Utility"; OUT=public/assets/vehicles/cars; LOG=tools/v2/cars/logs; B=/opt/homebrew/bin/blender
# wheel parts (downloaded rim + tyre fitted to the wheel frame), built once; delete the file to rebuild
[ -f "$D/wheel/wheel_parts.blend" ] || { mkdir -p "$D/wheel"; $B -b --factory-startup --disable-autoexec -P tools/v2/cars/ute1/prep_wheel.py -- \
  Models/_Inbox/shiny-rim/source/rim2.blend Models/_Inbox/tyres/source/tyre.fbx "$D/wheel/wheel_parts.blend" 2>&1 | grep "\[wheel\]"; }
$B -b --factory-startup -P tools/v2/cars/ute1/build_ute1.py -- "$D/sketchfab-elcamino.fbx" "$D/ute1_src.blend" 2>&1 | grep "\[ute1\]"
cfg=$(python3 -c "import json;c=json.load(open('tools/v2/cars/cars.json'))['ute1'];print(json.dumps({x:y for x,y in c.items() if x!='src'}))")
$B -b --disable-autoexec --factory-startup -P tools/v2/cars/convert.py -- "$D/ute1_src.blend" $OUT ute1 "$cfg" > $LOG/ute1.log 2>&1
grep -h "DONE\|FAIL" $LOG/ute1.log || { grep -A4 Traceback $LOG/ute1.log; exit 1; }
python3 - "$D/ute1_src_plates.json" <<'PY'
import json, sys
p = 'public/assets/vehicles/cars/ute1.json'; m = json.load(open(p)); m['plates'] = json.load(open(sys.argv[1]))
json.dump(m, open(p, 'w'), separators=(',', ':')); print('plates', m['plates'])
PY
NPZ=$(mktemp -d)
$B -b --factory-startup -P tools/v2/cars/dump_geo.py -- $NPZ $OUT/ute1.glb > $LOG/_dump.log 2>&1
python3 -P tools/v2/cars/seats.py $NPZ ute1 | tail -3; rm -rf $NPZ
# hood stripe box: windshield base -> where the hood bends down to the grille (seats.py's guess runs onto the cab roof)
python3 - <<'PY'
import json
p = 'public/assets/vehicles/cars/ute1.json'; m = json.load(open(p)); s = m['shape']
m['stripe'] = {**m.get('stripe', {}), 'hood': [round(s['zA'] + 0.03, 3), round(s['front'] - 0.1, 3)], 'hoodY': 0.78}
json.dump(m, open(p, 'w'), separators=(',', ':')); print('stripe', m['stripe'])
PY
python3 tools/v2/cars/index.py
