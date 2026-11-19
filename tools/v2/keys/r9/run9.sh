#!/bin/sh
# r9: shots at every reference camera + the spawn camera, then reference | game sheets copied to docs/v2/plan/nico_house/r9/
#   sh tools/v2/keys/r9/run9.sh <set> [--only B,A]
S=$1; shift
node tools/v2/keys/r8/shots8.mjs --set "$S" --spots tools/v2/keys/r9/spots9.json --settle 3500 "$@" && python3 tools/v2/keys/r9/sheets9.py "$S"
