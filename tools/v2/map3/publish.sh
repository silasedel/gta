#!/bin/sh
# Stage 1 map v3: publish the staged build (tools/v2/map3/out) into the game's assets.
set -e
cd "$(dirname "$0")/../../.."
B=$(python3 -c "import json;print(json.load(open('tools/v2/map3/out/miami/world.json'))['dir'].strip('/'))")
mkdir -p public/assets/miami
rm -rf "public/assets/miami/$B"; cp -R "tools/v2/map3/out/miami/$B" "public/assets/miami/$B"
cp tools/v2/map3/out/miami/world.json public/assets/miami/world.json
[ -f tools/v2/map3/out/miami/spots.json ] && cp tools/v2/map3/out/miami/spots.json public/assets/miami/spots.json || true
cp tools/v2/map3/out/world/layout.json public/assets/world/layout.json
cp tools/v2/map3/out/world/features.json tools/v2/map3/out/world/heights.bin tools/world/out/ 2>/dev/null || true
# keep only the newest two published builds
python3 -c "import glob,shutil; b=sorted(glob.glob('public/assets/miami/b2*')); [shutil.rmtree(x) for x in b[:-2]]"
echo "published $B"
