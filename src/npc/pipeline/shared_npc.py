# Port Solana V2 — shared NPC textures (PEOPLE-LOOK track), from the CC0 MakeHuman asset pack:
#   python3 shared_npc.py <mpfb data dir> <outdir>
# hair_<style>.webp : strand luminance normalized to the style's own mean (tinted per person at runtime, x2 in shader) + alpha
# brow_/lash_<id>.webp : same, for brows and lashes ; eye_<color>.webp : iris textures ; shoe_<variant>.webp : recolored shoes
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "player", "pipeline"))
import numpy as np
from PIL import Image
from texlib import save_img
from scipy import ndimage as ndi
MHD, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def norm_alpha(path, size, out, gain=1.0):
    im = Image.open(path).convert("RGBA").resize((size, size), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    lum = (rgb * [0.3, 0.59, 0.11]).sum(-1)
    m = al > 0.5
    ref = np.median(lum[m]) if m.any() else 0.3
    L = np.clip(lum / max(ref, 0.02) * 0.5 * gain, 0, 1)            # 0.5 = the person's hair color (x2 in the shader)
    # bleed color into transparent texels so mips never darken the card edges
    idx = ndi.distance_transform_edt(al < 0.05, return_distances=False, return_indices=True)
    L = L[idx[0], idx[1]]
    save_img(np.stack([L, L, L, al], -1), out, quality=88)

for st in ("afro01", "bob01", "bob02", "braid01", "long01", "ponytail01", "short01", "short02", "short03", "short04"):
    d = os.path.join(MHD, "hair", st); f = [x for x in os.listdir(d) if x.endswith("_diffuse.png")][0]
    norm_alpha(os.path.join(d, f), 1024, os.path.join(OUT, "hair_%s.webp" % st))
for i in range(1, 13):
    d = os.path.join(MHD, "eyebrows", "eyebrow%03d" % i)
    if os.path.isdir(d): norm_alpha(os.path.join(d, "eyebrow%03d.png" % i), 256, os.path.join(OUT, "brow_eyebrow%03d.webp" % i))
for i in range(1, 5):
    d = os.path.join(MHD, "eyelashes", "eyelashes0%d" % i)
    if os.path.isdir(d):
        f = [x for x in os.listdir(d) if x.endswith(".png")][0]
        norm_alpha(os.path.join(d, f), 256, os.path.join(OUT, "lash_eyelashes0%d.webp" % i))
for c in ("brown", "blue", "bluegreen", "brownlight", "darkbrown", "green", "lightblue", "ice"):
    f = os.path.join(MHD, "eyes", "materials", c + "_eye.png")
    if os.path.exists(f):
        a = np.asarray(Image.open(f).convert("RGB").resize((256, 256), Image.LANCZOS), np.float32) / 255
        a = a * 0.9                                                    # the photo sclera reads too bright in game
        save_img(a, os.path.join(OUT, "eye_%s.webp" % c), quality=90)

# shoes: recolor the CC0 MakeHuman shoes (no logos on these two sources), keep their shading and wear
def shoe(src, out, fn):
    d = os.path.join(MHD, "clothes", src); f = [x for x in os.listdir(d) if x.endswith("_diffuse.png")][0]
    a = np.asarray(Image.open(os.path.join(d, f)).convert("RGB").resize((1024, 1024), Image.LANCZOS), np.float32) / 255
    save_img(np.clip(fn(a), 0, 1), os.path.join(OUT, "shoe_%s.webp" % out), quality=90)
lum = lambda a: (a * [0.3, 0.59, 0.11]).sum(-1, keepdims=True)
def recolor(target, contrast=0.6, lift=0.0):
    t = np.array([int(target[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
    def fn(a):
        L = lum(a); m = L.mean(); k = (L - m) * contrast + 1.0
        return t * k + lift
    return fn
shoe("shoes02", "sneaker_white", recolor("#e9e7e1", 0.55, 0.02))
shoe("shoes02", "sneaker_gray", recolor("#8e9196", 0.7))
shoe("shoes02", "sneaker_black", recolor("#1d1d20", 0.9, 0.01))
def gold(a):
    L = lum(a); base = np.array([0.1, 0.1, 0.11], np.float32) * (0.6 + 0.8 * L / L.mean())
    sat = a.max(-1, keepdims=True) - a.min(-1, keepdims=True)
    return base + (np.array([0.89, 0.7, 0.24], np.float32) - base) * np.clip((sat - 0.12) * 4, 0, 1)
shoe("shoes02", "sneaker_gold", gold)
shoe("shoes04", "dress_black", lambda a: a)
shoe("shoes01", "dress_brown", lambda a: a * np.array([0.82, 0.78, 0.76], np.float32))
shoe("shoes03", "boots_black", recolor("#1c1a18", 0.9, 0.01))
shoe("shoes03", "boots_tan", recolor("#8a6440", 0.8))
print("shared done", len(os.listdir(OUT)))

# hair_shell: our own short-hair strand texture for the fade tops (stacked shells): dense short strokes running along v
from texlib import stamp_strokes
S = 1024; rs = np.random.RandomState(5)
n = 26000
x0 = rs.rand(n) * S; y0 = rs.rand(n) * S; L = rs.uniform(18, 46, n); ang = rs.normal(0, 0.22, n) + np.pi / 2
x1 = x0 + np.cos(ang) * L; y1 = y0 + np.sin(ang) * L; cx = (x0 + x1) / 2 + rs.normal(0, 3, n); cy = (y0 + y1) / 2
strokes = np.stack([x0, y0, cx, cy, x1, y1, rs.uniform(2.0, 3.6, n), rs.uniform(0.7, 1.0, n), rs.uniform(0.55, 1.15, n)], 1)
cov, shade = stamp_strokes(S, strokes)
# wrap the tile: stamp again shifted so strokes crossing the border continue
for dx, dy in ((S, 0), (-S, 0), (0, S), (0, -S)):
    s2 = strokes.copy(); s2[:, [0, 2, 4]] += dx; s2[:, [1, 3, 5]] += dy
    c2, sh2 = stamp_strokes(S, s2); m = c2 > cov; cov[m] = c2[m]; shade[m] = sh2[m]
Lh = np.clip(shade * 0.5, 0, 1); al = np.clip(cov * 1.15, 0, 1)
save_img(np.stack([Lh, Lh, Lh, al], -1), os.path.join(OUT, "hair_shell.webp"), quality=88)
print("hair_shell done")
