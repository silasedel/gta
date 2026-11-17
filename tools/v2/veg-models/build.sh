#!/bin/zsh
# Library plants -> game GLBs (public/assets/models/vegetation/). Blender 5.x, headless.
#   convert.py args: <blend> <out.glb> <height m> <near tris> <max texture px> <material merge json> <lod1 tris> <keep regex (leaf cards, not decimated)>
set -e
cd "$(dirname $0)/../../.."
B=Models; O=public/assets/models/vegetation; C=tools/v2/veg-models/convert.py
run() { blender -b --factory-startup -P $C -- "$@" 2>&1 | grep -E "CONVERTED|LOD1|Error" }
run "$PWD/$B/Trees/Palm Tree 7 - Tall Royal Palm/Palm Tree 7.blend" $O/royal_palm.glb 16 10000 2048 '{"Roy Leaflet 01":"Leaflet","Roy Leaf Stalk 01":"Leaf Stalk"}' 1500
run "$PWD/$B/Trees/Palm Tree 2 - Tall Slim Coconut Palm/Palm Tree 2.blend" $O/coconut_palm.glb 12 8000 2048 '{}' 1200
run "$PWD/$B/Trees/Banyan Tree 2 - Large Banyan With Hanging Roots/Banyan Tree 2.blend" $O/banyan.glb 16 45000 2048 '{}' 0 'Leaves|Vines|Branches'
run "$PWD/$B/Plants/Shrub 5 - Low-Poly Fern Clump/Shrub 5.blend" $O/fern_clump.glb 0.85 0 1024
