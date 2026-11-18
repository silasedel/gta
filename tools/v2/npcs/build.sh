#!/bin/bash
# People pipeline: rig + LOD + textures for every person in tools/v2/npcs/people.json -> public/assets/npc/people/
#   tools/v2/npcs/build.sh [ids...]      (e.g. p07 p12 c01; default all)   JOBS=3 parallel Blender runs
set -e
cd "$(dirname "$0")/../../.."
# OUT / META / BL / LOG can be overridden (staging builds); SKIPTEX=1 rebuilds rigs only (textures and palettes kept)
OUT=${OUT:-public/assets/npc/people}; META=${META:-tools/v2/npcs/out/meta}; BL=${BL:-tools/v2/npcs/out/blend}; LOG=${LOG:-tools/v2/npcs/out/logs}
mkdir -p "$OUT" "$META" "$BL" "$LOG"
python3 -I - "$@" > tools/v2/npcs/out/jobs.txt <<'PY'
import json, sys, glob, os
want = set(sys.argv[1:])
for c in json.load(open('tools/v2/npcs/people.json'))['people']:
    if 'n' in c:
        pid = 'p%02d' % c['n']; d = glob.glob('Models/NPCs/NPC %d - */' % c['n'])[0]
        src = glob.glob(d + '*.fbx')[0]; tex = glob.glob(d + '*.fbm')[0]
    else:
        pid = 'c%02d' % c['char']; d = glob.glob('Models/Characters/Character %d - */' % c['char'])[0]
        src = c.get('src') or (glob.glob(d + '*.glb') + glob.glob(d + '*.fbx'))[0]; tex = d + 'textures'   # src: re-posed mesh (apose_lifeguard.py)
    if want and pid not in want: continue
    print('\t'.join([pid, src, tex, str(c['h']), str(c.get('hat', 0)), '1' if c.get('noflat') else '0']))
PY
run() {
  IFS=$'\t' read -r pid src tex h hat noflat <<< "$1"
  NF=""; [ "$noflat" = "1" ] && NF="--noflat 1"
  /opt/homebrew/bin/blender -b --python-exit-code 1 -P tools/v2/npcs/rig_person.py -- --in "$src" --id "$pid" --height "$h" --hat "$hat" $NF --out "$BL" --blend 1 > "$LOG/$pid.log" 2>&1 || { echo "FAIL $pid"; return 0; }
  mv "$BL/$pid.json" "$META/$pid.json"; mv "$BL/$pid.glb" "$OUT/$pid.glb"
  if [ -z "$SKIPTEX" ]; then
  python3 -P -E tools/v2/npcs/textures.py "$tex" "$pid" "$OUT" >> "$LOG/$pid.log" 2>&1 || echo "TEXFAIL $pid"
  python3 -P -E tools/v2/npcs/colors.py "$BL" "$tex" "$pid" >> "$LOG/$pid.log" 2>&1 && mv "$BL/${pid}_cols.json" "$META/" || echo "COLFAIL $pid"
  fi
  echo "ok $pid $(grep '\[rig\].*done' "$LOG/$pid.log" | cut -c1-160)"
}
export -f run; export OUT META BL LOG SKIPTEX
tr '\n' '\0' < tools/v2/npcs/out/jobs.txt | xargs -0 -P "${JOBS:-3}" -S 4096 -I{} bash -c 'run "$@"' _ {}
python3 -I tools/v2/npcs/build_index.py "$META" "$OUT"
