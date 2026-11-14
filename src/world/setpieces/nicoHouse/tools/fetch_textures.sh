#!/bin/sh
# Downloads the CC0 Poly Haven texture sets used by Nico's house (track: nico-house) into public/assets/setpieces/nicoHouse/tex.
# Usage: sh src/world/setpieces/nicoHouse/tools/fetch_textures.sh   (run from the V2 folder; safe to re-run)
OUT="public/assets/setpieces/nicoHouse/tex"; mkdir -p "$OUT"
get() { # id res maps...
  id="$1"; res="$2"; shift 2
  for m in "$@"; do
    f="$OUT/${id}_${m}.jpg"
    [ -s "$f" ] || curl -s -m 90 -o "$f" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${res}/${id}/${id}_${m}_${res}.jpg" &
  done
}
get rough_wood 2k diff nor_gl rough
get shell_floor_01 2k diff nor_gl rough
get wood_peeling_paint_weathered 2k diff
get weathered_peeling_timber 2k diff
for id in sand_01 grass_path_2 leafy_grass concrete_wall_008 scuffed_cement palm_tree_bark bark_brown_02 plywood wood_table_worn wood_floor_worn \
  old_linoleum_flooring_01 long_white_tiles kitchen_wood wood_cabinet_worn_long rusty_metal_02 rusty_metal_04 rusty_painted_metal green_metal_rust \
  denim_fabric cotton_jersey terry_cloth waffle_pique_cotton fabric_leather_01 wool_boucle tatami_mat dirty_carpet white_planks_clean corrugated_iron \
  weathered_planks coral_stone_wall; do
  get "$id" 1k diff nor_gl rough
done
wait
ls -la "$OUT" | awk '$5 < 2000 {print "SMALL/FAILED:", $9, $5}'
du -sh "$OUT"
