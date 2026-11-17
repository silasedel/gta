#!/bin/sh
# Stage 1 map v3: publish the staged build (tools/v2/map3/out) into the game's assets.
# Safe for pages that are loading while it runs (r2-roads, Nov 17): the new build folder is written completely under a temp name
# and renamed into place, then world.json / spots.json / layout.json are swapped by atomic renames, and old builds are only
# removed when they are not among the newest three AND older than 2 hours (a page that read the previous world.json keeps
# finding its files).
set -e
cd "$(dirname "$0")/../../.."
B=$(python3 -c "import json;print(json.load(open('tools/v2/map3/out/miami/world.json'))['dir'].strip('/'))")
mkdir -p public/assets/miami public/assets/world
D=public/assets/miami
if [ ! -d "$D/$B" ]; then
  rm -rf "$D/.$B.tmp"; cp -R "tools/v2/map3/out/miami/$B" "$D/.$B.tmp"; mv "$D/.$B.tmp" "$D/$B"
fi
swap() { cp "$1" "$2.tmp.$$" && mv -f "$2.tmp.$$" "$2"; }   # same-filesystem rename = atomic swap
[ -f tools/v2/map3/out/miami/spots.json ] && swap tools/v2/map3/out/miami/spots.json "$D/spots.json" || true
swap tools/v2/map3/out/world/layout.json public/assets/world/layout.json
swap tools/v2/map3/out/miami/world.json "$D/world.json"
cp tools/v2/map3/out/world/features.json tools/v2/map3/out/world/heights.bin tools/world/out/ 2>/dev/null || true
# keep the newest three published builds always; older ones only go once they are more than 2 hours old
python3 - "$D" "$B" <<'EOF'
import glob, os, shutil, sys, time
d, cur = sys.argv[1], sys.argv[2]
b = sorted(p for p in glob.glob(os.path.join(d, 'b2*')) if os.path.isdir(p))
for p in b[:-3]:
    if os.path.basename(p) != cur and time.time() - os.path.getmtime(p) > 2 * 3600: shutil.rmtree(p, ignore_errors=True)
EOF
echo "published $B"
