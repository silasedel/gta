# Build the two shared texture atlases for the human library (CHARACTER agent).
#   atlasS: all 22 skins @768 (LOD0 body)
#   atlasC: clothes, shoes, hats, hair/brows/lashes (alpha), eyes, small skins (LOD1+), white texel
# blender -b -P build_atlas.py -- <mpfb data dir> <outdir>
import bpy, os, sys, json, re
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
DATA, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)

def mhmat_diffuse(path):
    d = os.path.dirname(path)
    for line in open(path, encoding="utf-8", errors="ignore"):
        m = re.match(r"\s*diffuseTexture\s+(.+)", line)
        if m:
            p = m.group(1).strip()
            cand = os.path.join(d, os.path.basename(p))
            if os.path.exists(cand): return cand
            cand = os.path.join(d, p)
            if os.path.exists(cand): return cand
    return None

def collect(sub, names=None):
    out = {}
    base = os.path.join(DATA, sub)
    for n in sorted(os.listdir(base)):
        if names and n not in names: continue
        mh = os.path.join(base, n, n + ".mhmat")
        if os.path.exists(mh):
            p = mhmat_diffuse(mh)
            if p: out[n] = p
    return out

skins = {k: v for k, v in collect("skins").items() if "special_suit" not in k and "toon" not in k}
CLOTHES = ["male_casualsuit01", "male_casualsuit03", "male_casualsuit05", "male_elegantsuit01", "female_elegantsuit01", "female_sportsuit01", "male_worksuit01", "fedora01"]
clothes = collect("clothes", CLOTHES)
shoes = collect("clothes", ["shoes01", "shoes02", "shoes03", "shoes04", "shoes05", "shoes06"])
hair = collect("hair")
brows = collect("eyebrows")
lashes = collect("eyelashes")
eyes = {}
for f in sorted(os.listdir(os.path.join(DATA, "eyes", "materials"))):
    if f.endswith(".mhmat"):
        p = mhmat_diffuse(os.path.join(DATA, "eyes", "materials", f))
        if p: eyes[f[:-6]] = p

def load(path, size):
    img = bpy.data.images.load(path, check_existing=False)
    img.scale(size, size)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    bpy.data.images.remove(img)
    return a

def clean(name, a):
    """remove prints/labels/watermarks from clothing textures (fills with nearby fabric colour)"""
    h, w = a.shape[:2]
    def fill(x0, y0, x1, y1, sx, sy):  # rect in 0..1 image coords (y down), sample point
        X0, X1 = int(x0 * w), int(x1 * w); Y0, Y1 = int((1 - y1) * h), int((1 - y0) * h)
        c = a[int((1 - sy) * h), int(sx * w)].copy()
        a[Y0:Y1, X0:X1] = c
    # every MakeHuman texture carries a small "www.makehuman.org" watermark in the bottom-right corner
    fill(0.62, 0.955, 1.0, 1.0, 0.6, 0.985)
    if name == "male_worksuit01":
        fill(0.075, 0.44, 0.125, 0.475, 0.1, 0.5)   # pocket label
        fill(0.19, 0.78, 0.24, 0.86, 0.15, 0.82)    # size tag
    return a

entries = []  # (atlas, key, array, size, alpha)
for k, p in skins.items(): entries.append(("S", "skin:" + k, p, 1024))
for k, p in clothes.items(): entries.append(("C", "cloth:" + k, p, 768))
for k, p in shoes.items(): entries.append(("C", "shoes:" + k, p, 384))
for k, p in hair.items(): entries.append(("C", "hair:" + k, p, 640))
for k, p in skins.items(): entries.append(("C", "skinlow:" + k, p, 256))
for k, p in brows.items(): entries.append(("C", "brow:" + k, p, 192))
for k, p in lashes.items(): entries.append(("C", "lash:" + k, p, 192))
for k, p in eyes.items(): entries.append(("C", "eye:" + k, p, 192))

PAD = 6
DIMS = {"S": (5120, 4096), "C": (4096, 4096)}
layout = {"S": {}, "C": {}}
for atlas in ("S", "C"):
    W, H = DIMS[atlas]
    SIZE = W
    A = np.zeros((H, W, 4), dtype=np.float32)
    A[..., 3] = 1.0 if atlas == "S" else 0.0
    items = sorted([e for e in entries if e[0] == atlas], key=lambda e: -e[3])
    x = y = 0; rowh = 0
    for (_, key, path, s) in items:
        if x + s > W: x = 0; y += rowh + (PAD if atlas == 'C' else 0); rowh = 0
        if y + s > H: raise RuntimeError("atlas full " + atlas + " at " + key)
        arr = load(path, s)
        if key.startswith("cloth:"): arr = clean(key[6:], arr)
        if not key.startswith(("hair:", "brow:", "lash:")): arr[..., 3] = 1.0
        A[y:y + s, x:x + s] = arr
        # edge padding (repeat border pixels) against mip bleeding
        for p in range(1, PAD):
            if x - p >= 0: A[y:y + s, x - p] = arr[:, 0]
            if x + s - 1 + p < W: A[y:y + s, x + s - 1 + p] = arr[:, -1]
            if y - p >= 0: A[y - p, x:x + s] = arr[0, :]
            if y + s - 1 + p < H: A[y + s - 1 + p, x:x + s] = arr[-1, :]
        layout[atlas][key] = [x / W, y / H, (x + s) / W, (y + s) / H]  # Blender UV space (v up)
        x += s + (PAD if atlas == 'C' else 0); rowh = max(rowh, s)
    if atlas == "C":
        # white texel block for generated garments
        if x + 64 > W: x = 0; y += rowh + PAD
        A[y:y + 64, x:x + 64] = 1.0
        layout["C"]["white"] = [(x + 16) / W, (y + 16) / H, (x + 48) / W, (y + 48) / H]
    img = bpy.data.images.new("atlas" + atlas, W, H, alpha=(atlas == "C"))
    img.pixels.foreach_set(A.ravel())
    if atlas == "S":
        img.filepath_raw = os.path.join(OUT, "atlasS.jpg"); img.file_format = "JPEG"
    else:
        img.filepath_raw = os.path.join(OUT, "atlasC.webp"); img.file_format = "WEBP"
    scn = bpy.context.scene
    scn.render.image_settings.quality = 88
    img.save()
    print("ATLAS", atlas, len(layout[atlas]), "items; last row y", y)
json.dump(layout, open(os.path.join(OUT, "atlas_layout.json"), "w"), indent=0)
print("ATLAS DONE")
