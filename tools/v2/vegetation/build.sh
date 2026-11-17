#!/bin/zsh
# Library plants -> public/assets/models/vegetation/<key>.glb + <key>_lod1.glb (Blender 5.x headless, scripts in the .blend files never run)
#   ./tools/v2/vegetation/build.sh [key ...]     (no keys: every species in species.json; 4 in parallel)
cd "$(dirname $0)/../../.."
O=public/assets/models/vegetation; R=tools/v2/vegetation/report.json; mkdir -p $O
keys=("$@"); [ ${#keys} -eq 0 ] && keys=($(python3 -c "import json;print(' '.join(json.load(open('tools/v2/vegetation/species.json'))['species']))"))
run() { /opt/homebrew/bin/blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P tools/v2/vegetation/convert.py -- tools/v2/vegetation/species.json $1 $O ${TMPDIR:-/tmp}/vegrep_$1.json > ${TMPDIR:-/tmp}/vegconv_$1.log 2>&1 && echo "ok $1" || { echo "FAIL $1"; grep -E "Error|error" ${TMPDIR:-/tmp}/vegconv_$1.log | tail -3; } }
i=0; for k in $keys; do run $k & i=$((i+1)); [ $((i % 4)) -eq 0 ] && wait; done; wait
python3 - $R $keys <<'PY'
import json, sys, os
R = sys.argv[1]; allr = json.load(open(R)) if os.path.exists(R) else {}
for k in sys.argv[2:]:
    p = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'vegrep_%s.json' % k)
    if os.path.exists(p): allr.update(json.load(open(p))); os.remove(p)
json.dump(allr, open(R, 'w'), indent=1)
for k in sys.argv[2:]:
    r = allr.get(k)
    if r: print(k, 'tris', r['tris_src'], '->', r['tris0'], '/', r['tris1'], 'h', r['height'], 'r', r['radius'], 'kb', r['kb0'], r['kb1'])
PY
