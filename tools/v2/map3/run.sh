#!/bin/sh
# Stage 1 map v3: full rebuild into staging (tools/v2/map3/out/*). The live game is untouched until publish.sh.
set -e
cd "$(dirname "$0")/../../.."
R="$PWD"
tools/world/.venv/bin/python tools/v2/map3/register.py
tools/world/.venv/bin/python tools/v2/map3/trace.py
MAP3_OUT="$R/tools/v2/map3/out/world" tools/world/.venv/bin/python tools/v2/map3/build_v3.py
MIAMI_NO_OSM=1 WORLD_FEATURES="$R/tools/v2/map3/out/world/features.json" MIAMI_OUT="$R/tools/v2/map3/out/miami" MIAMI_WORK="$R/tools/v2/map3/out/work" tools/osm/.venv/bin/python tools/osm/merge.py --force
