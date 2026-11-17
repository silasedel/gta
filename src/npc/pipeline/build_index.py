# Southline V2 — install generated NPC archetypes (PEOPLE-LOOK track):
#   python3 build_index.py <gen outdir> <paint outdir> <public/assets/npc/arch>
# copies <id>.glb, <id>_a.webp, <id>_n.webp and writes index.json from the per-archetype meta files
import sys, os, json, shutil
gen, paint, dst = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(dst, exist_ok=True)
metas = []
for f in sorted(os.listdir(gen)):
    if not f.endswith(".json"): continue
    m = json.load(open(os.path.join(gen, f))); i = m["id"]
    need = [os.path.join(gen, i + ".glb"), os.path.join(paint, i + "_a.webp"), os.path.join(paint, i + "_n.webp")]
    if not all(os.path.exists(p) for p in need): print("skip", i); continue
    for p in need: shutil.copy(p, os.path.join(dst, os.path.basename(p)))
    m.pop("placed", None); m.pop("secs", None)
    metas.append(m)
json.dump({"version": 1, "archetypes": metas}, open(os.path.join(dst, "index.json"), "w"), indent=1)
print("installed", len(metas))
