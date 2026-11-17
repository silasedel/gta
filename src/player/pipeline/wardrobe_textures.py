# Southline V2 — wardrobe textures (CHARACTER track): body cover masks per garment and the tropical shirt prints,
# painted in code (our own artwork: fan palms, monstera, banana leaves, hibiscus; half-drop repeat, 0.6 m tile).
#   python3 wardrobe_textures.py <workdir> <outdir>
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from texlib import raster, tri_data, save_img, fbm
WORK, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT + "/prints", exist_ok=True); os.makedirs(OUT + "/covers", exist_ok=True)
d = np.load(WORK + "/nico_mesh.npz"); cov = np.load(WORK + "/garment_covers.npz")
for name in cov.files:
    f = cov[name].astype(np.float32); tv, tuv = tri_data(d["co"], d["polys_flat"], d["poly_len"], d["uv_body"], sel=~d["head_poly"])
    uvg = tuv.copy(); uvg[..., 1] = 1 - uvg[..., 1]
    m, mask = raster(uvg, f[tv][..., None], 512)
    Image.fromarray(((m[..., 0] > 0.999) * 255).astype(np.uint8)).save(OUT + "/covers/" + name + ".png")

S = 2048; SS = 2                                    # painted at 2x and reduced (clean edges)
PAL = {
  "lagoon":   dict(bg=(18, 96, 104), palm=(238, 226, 196), sand=(214, 190, 150), leaf=(120, 206, 170), jade=(36, 140, 118), bloom=(240, 104, 92), pink=(236, 72, 130), gold=(246, 178, 60), line=(10, 58, 66)),
  "sunset":   dict(bg=(244, 150, 112), palm=(30, 44, 86), sand=(250, 222, 190), leaf=(252, 204, 150), jade=(196, 84, 78), bloom=(252, 240, 220), pink=(255, 214, 120), gold=(52, 70, 120), line=(150, 62, 60)),
  "midnight": dict(bg=(16, 22, 44), palm=(40, 150, 128), sand=(28, 92, 100), leaf=(70, 190, 150), jade=(24, 110, 104), bloom=(226, 50, 140), pink=(250, 120, 170), gold=(244, 196, 90), line=(6, 10, 24)),
  "bone":     dict(bg=(236, 230, 214), palm=(122, 128, 84), sand=(196, 186, 150), leaf=(150, 150, 104), jade=(104, 112, 76), bloom=(178, 92, 62), pink=(204, 130, 96), gold=(150, 120, 70), line=(88, 84, 60)),
}
def wob(pts, r, a=1.6):                               # hand-drawn wobble
    return [(px + r.randn() * a, py + r.randn() * a) for px, py in pts]
def frond(dr, cx, cy, ang, L, col, line, r):          # fan palm frond: rib + tapering leaflets
    n = 26; rib = []
    for i in range(n + 1):
        t = i / n; a = ang + (t - 0.3) * 0.5; rib.append((cx + math.cos(ang) * L * t - math.sin(ang) * 0.10 * L * math.sin(t * 3.14), cy + math.sin(ang) * L * t + math.cos(ang) * 0.10 * L * math.sin(t * 3.14)))
    for i in range(2, n):
        t = i / n; px, py = rib[i]; ll = L * 0.36 * math.sin(t * 2.6 + 0.35) * (0.8 + 0.4 * r.rand())
        for s in (-1, 1):
            a = ang + s * (1.15 - 0.5 * t) + r.randn() * 0.06; tx, ty = px + math.cos(a) * ll, py + math.sin(a) * ll
            wx, wy = -math.sin(a) * L * 0.016, math.cos(a) * L * 0.016
            dr.polygon(wob([(px - wx, py - wy), ((px + tx) / 2 + wx * 1.6, (py + ty) / 2 + wy * 1.6), (tx, ty), ((px + tx) / 2 - wx * 1.2, (py + ty) / 2 - wy * 1.2), (px + wx, py + wy)], r), fill=col)
    dr.line(wob(rib, r, 1.0), fill=line, width=max(2, int(L * 0.012)))
def monstera(dr, cx, cy, ang, R, col, line, bg, r):
    pts = []
    for i in range(48):
        t = i / 48 * 2 * math.pi; rad = R * (0.62 + 0.38 * abs(math.cos(t / 2)) ** 0.8) * (1 - 0.22 * (abs(math.sin(t * 4.5)) ** 6))
        pts.append((cx + math.cos(t + ang) * rad, cy + math.sin(t + ang) * rad * 0.82))
    dr.polygon(wob(pts, r, 2.0), fill=col)
    for i in range(7):                                # holes and veins
        t = ang + (-1.2 + i * 0.4); px, py = cx + math.cos(t) * R * 0.45, cy + math.sin(t) * R * 0.38
        dr.ellipse((px - R * 0.07, py - R * 0.035, px + R * 0.07, py + R * 0.035), fill=bg)
        dr.line([(cx, cy), (cx + math.cos(t) * R * 0.8, cy + math.sin(t) * R * 0.66)], fill=line, width=max(2, int(R * 0.02)))
def hibiscus(dr, cx, cy, R, col, col2, gold, line, r):
    a0 = r.rand() * 6.28
    for i in range(5):
        a = a0 + i * 1.2566; pts = []
        for k in range(15):
            t = k / 14; w = math.sin(t * 3.14) ** 0.7 * 0.62; rr = R * t
            pts.append((cx + math.cos(a - w * (1 - t * 0.2)) * rr, cy + math.sin(a - w * (1 - t * 0.2)) * rr))
        for k in range(14, -1, -1):
            t = k / 14; w = math.sin(t * 3.14) ** 0.7 * 0.62; rr = R * t * (1 + 0.05 * math.sin(k * 2.1))
            pts.append((cx + math.cos(a + w) * rr, cy + math.sin(a + w) * rr))
        dr.polygon(wob(pts, r, 1.4), fill=col)
        dr.line([(cx, cy), (cx + math.cos(a) * R * 0.8, cy + math.sin(a) * R * 0.8)], fill=col2, width=max(2, int(R * 0.03)))
    dr.ellipse((cx - R * 0.16, cy - R * 0.16, cx + R * 0.16, cy + R * 0.16), fill=col2)
    a = a0 + 0.6; ex, ey = cx + math.cos(a) * R * 0.62, cy + math.sin(a) * R * 0.62
    dr.line([(cx, cy), (ex, ey)], fill=gold, width=max(3, int(R * 0.05)))
    for k in range(5): dr.ellipse((ex + math.cos(k * 1.3) * R * 0.07 - R * 0.035, ey + math.sin(k * 1.3) * R * 0.07 - R * 0.035, ex + math.cos(k * 1.3) * R * 0.07 + R * 0.035, ey + math.sin(k * 1.3) * R * 0.07 + R * 0.035), fill=gold)
def banana(dr, cx, cy, ang, L, col, line, r):
    pts = []
    for k in range(21):
        t = k / 20; w = math.sin(t * 3.14) ** 0.6 * L * 0.16 * (1 + 0.12 * math.sin(k * 3.0)); pts.append((cx + math.cos(ang) * L * t - math.sin(ang) * w, cy + math.sin(ang) * L * t + math.cos(ang) * w))
    for k in range(20, -1, -1):
        t = k / 20; w = math.sin(t * 3.14) ** 0.6 * L * 0.16 * (1 + 0.12 * math.cos(k * 2.3)); pts.append((cx + math.cos(ang) * L * t + math.sin(ang) * w, cy + math.sin(ang) * L * t - math.cos(ang) * w))
    dr.polygon(wob(pts, r, 1.8), fill=col); dr.line([(cx, cy), (cx + math.cos(ang) * L, cy + math.sin(ang) * L)], fill=line, width=max(2, int(L * 0.012)))
    for k in range(3, 19, 2):
        t = k / 20; px, py = cx + math.cos(ang) * L * t, cy + math.sin(ang) * L * t
        for s in (-1, 1): dr.line([(px, py), (px + math.cos(ang + s * 1.0) * L * 0.13, py + math.sin(ang + s * 1.0) * L * 0.13)], fill=line, width=2)
for name, P in PAL.items():
    r = np.random.RandomState({"lagoon": 5, "sunset": 9, "midnight": 14, "bone": 22}[name]); T = S * SS
    img = Image.new("RGB", (T, T), P["bg"]); dr = ImageDraw.Draw(img)
    items = []
    cols, rows = 3, 4
    for i in range(cols):
        for j in range(rows):
            bx = (i + 0.5) / cols * T + r.randn() * T * 0.03; by = (j + 0.5 + (0.5 if i % 2 else 0)) / rows * T + r.randn() * T * 0.02      # half-drop
            kind = [0, 1, 2, 3][(i * 2 + j + (0 if name in ("lagoon", "midnight") else 1)) % 4]
            items.append((0, "frond" if kind in (0, 2) else "banana" if kind == 1 else "monstera", bx, by, r.rand() * 6.28))
            items.append((1, "hibiscus", bx + T * 0.13 * math.cos(i + j * 2.1), by + T * 0.11 * math.sin(i * 1.7 + j), 0))
            if (i + j) % 2 == 0: items.append((0, "frond2", bx - T * 0.12, by + T * 0.10, r.rand() * 6.28))
    items.sort(key=lambda it: it[0])
    for _, kind, bx, by, ang in items:
        seed = r.randint(1 << 30)
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                rr = np.random.RandomState(seed); cx, cy = bx + ox, by + oy
                if kind == "frond": frond(dr, cx, cy, ang, T * 0.22, P["palm"], P["sand"], rr)
                elif kind == "frond2": frond(dr, cx, cy, ang, T * 0.15, P["jade"], P["line"], rr)
                elif kind == "banana": banana(dr, cx, cy, ang, T * 0.24, P["leaf"], P["jade"], rr)
                elif kind == "monstera": monstera(dr, cx, cy, ang, T * 0.10, P["jade"], P["leaf"], P["bg"], rr)
                else: hibiscus(dr, cx, cy, T * (0.052 + 0.012 * rr.rand()), P["bloom"] if rr.rand() < 0.65 else P["pink"], P["pink"] if name != "bone" else P["line"], P["gold"], P["line"], rr)
    img = img.resize((S, S), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32) / 255
    a *= (1 + fbm(S, 1.2, 2, seed=3, wrap=True)[..., None] * 0.035 + fbm(S, 40, 2, seed=4, wrap=True)[..., None] * 0.03)      # dry-brush / ink variation
    save_img(a, OUT + "/prints/tropical_" + name + ".webp", quality=92)
    if name == "lagoon": Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((700, 700)).save(WORK + "/print_prev.jpg", quality=85)
print("done")
