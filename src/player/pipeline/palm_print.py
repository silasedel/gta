# Port Solana V2 — Nico's signature shirt print (CHARACTER track): pale sea-green coconut palms of varied sizes on faded
# teal, slightly distressed and washed. Our own artwork, painted in code; seamless tile (0.6 m repeat on the shirt).
#   python3 palm_print.py <outdir> [workdir for the cover masks]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT + "/prints", exist_ok=True)
S = 2048
SS = 2
W = S * SS
BG = np.array([30, 118, 120], dtype=np.float32)
INK = (190, 228, 206)
rng = np.random.RandomState(42)


def palm(dr, x, y, h, lean, r):
    # trunk: curved, tapering, ringed
    n = 24
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((x + lean * h * (t ** 1.6) + math.sin(t * 2.4) * h * 0.03, y - h * t))
    for i in range(n):
        t = i / n
        w = h * (0.045 - 0.022 * t)
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        dr.polygon([(x0 - w, y0), (x0 + w, y0), (x1 + w * 0.93, y1), (x1 - w * 0.93, y1)], fill=255)
    cx, cy = pts[-1]
    # crown: drooping fronds with leaflets
    nf = 8 + r.randint(0, 3)
    for k in range(nf):
        a0 = -math.pi / 2 + (k / (nf - 1) - 0.5) * 2.9 + r.randn() * 0.12
        L = h * (0.42 + 0.18 * r.rand())
        rib = []
        for i in range(14):
            t = i / 13
            ang = a0 + (0.9 * t * t) * (1 if math.cos(a0) > 0 else -1)
            droop = t * t * L * 0.55
            rib.append((cx + math.cos(a0) * L * t, cy + math.sin(a0) * L * t + droop))
        for i in range(1, 13):
            t = i / 13
            px, py = rib[i]
            qx, qy = rib[i + 1]
            dx, dy = qx - px, qy - py
            dl = math.hypot(dx, dy) + 1e-6
            nx, ny = -dy / dl, dx / dl
            ll = L * 0.20 * math.sin(t * 3.0) * (0.8 + 0.4 * r.rand())
            for s in (-1, 1):
                tx = px + (nx * s * 0.8 + dx / dl * 0.6) * ll
                ty = py + (ny * s * 0.8 + dy / dl * 0.6) * ll + ll * 0.35
                dr.polygon([(px, py), (px + dx * 0.5, py + dy * 0.5), (tx, ty)], fill=255)
        dr.line(rib, fill=255, width=max(2, int(h * 0.012)))
    # coconuts
    for k in range(3):
        rr = h * 0.022
        ox = cx + (k - 1) * rr * 1.6
        dr.ellipse([ox - rr, cy + rr * 0.2, ox + rr, cy + rr * 2.2], fill=255)


ink = Image.new("L", (W, W), 0)
dr = ImageDraw.Draw(ink)
# scatter palms in a jittered grid (varied sizes, a few leaning), drawn with wrap so the tile repeats
cells = 4
for gy in range(cells):
    for gx in range(cells):
        if rng.rand() < 0.18:
            continue
        x = (gx + 0.15 + 0.7 * rng.rand()) / cells * W
        y = (gy + 0.55 + 0.4 * rng.rand()) / cells * W
        h = W * (0.20 + 0.16 * rng.rand())
        lean = (rng.rand() - 0.5) * 0.5
        for ox in (-W, 0, W):
            for oy in (-W, 0, W):
                palm(dr, x + ox, y + oy, h, lean, np.random.RandomState(gx * 31 + gy * 7))
ink = ink.resize((S, S), Image.LANCZOS)
a = np.asarray(ink, dtype=np.float32) / 255.0


def fbm(n, scale, octaves, seed):
    r = np.random.RandomState(seed)
    out = np.zeros((n, n), np.float32)
    amp = 1.0
    tot = 0.0
    for o in range(octaves):
        g = max(2, int(scale * 2 ** o))
        z = r.rand(g, g).astype(np.float32)
        z = np.asarray(Image.fromarray((z * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC), np.float32) / 255.0
        out += z * amp
        tot += amp
        amp *= 0.5
    return out / tot


# distress: worn-through specks and a cracked, washed print; dye fade varies across the tile
wear = fbm(S, 6, 4, 3)
speck = fbm(S, 90, 2, 5)
a = a * np.clip((wear - 0.15) * 2.6, 0.6, 1.0) * np.clip((speck - 0.10) * 4.0, 0.25, 1.0)
a = a * (0.88 + 0.12 * fbm(S, 3, 2, 8))
fade = 0.92 + 0.12 * fbm(S, 4, 3, 11)
weave = 0.97 + 0.03 * fbm(S, 300, 1, 13)
bg = BG[None, None, :] * fade[..., None] * weave[..., None]
col = bg * (1 - a[..., None]) + np.array(INK, np.float32)[None, None, :] * a[..., None] * (0.92 + 0.08 * fade[..., None])
img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))
img.save(OUT + "/prints/palm_teal.webp", quality=92)
img.resize((600, 600)).save(OUT + "/prints/palm_teal_preview.jpg", quality=85) if len(sys.argv) > 3 else None
print("[print] palm_teal", S)

# body cover masks for every garment cut (skin under clothes is not drawn)
if len(sys.argv) > 2:
    from texlib import raster, tri_data
    WORK = sys.argv[2]
    os.makedirs(OUT + "/covers", exist_ok=True)
    d = np.load(WORK + "/nico_mesh.npz")
    cov = np.load(WORK + "/garment_covers.npz")
    for name in cov.files:
        f = cov[name].astype(np.float32)
        tv, tuv = tri_data(d["co"], d["polys_flat"], d["poly_len"], d["uv_body"], sel=~d["head_poly"])
        uvg = tuv.copy()
        uvg[..., 1] = 1 - uvg[..., 1]
        m, mask = raster(uvg, f[tv][..., None], 512)
        Image.fromarray(((m[..., 0] > 0.999) * 255).astype(np.uint8)).save(OUT + "/covers/" + name + ".png")
        print("[cover]", name)
