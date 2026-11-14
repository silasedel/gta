# Derives wear masks for Nico's house from CC0 Poly Haven scans and procedural noise (track: nico-house).
# Run from the V2 folder:  python3 -I src/world/setpieces/nicoHouse/tools/make_masks.py
# Outputs (public/assets/setpieces/nicoHouse/tex): peel_a.png, peel_b.png (paint-presence distance fields, grain along V),
# grunge.png (R blotches, G vertical drips, B speckle), tin_wear.png (R rust streaks down the sheet, G spangle, B edge rust).
import sys, site
sys.path.append(site.getusersitepackages())   # numpy / PIL / scipy live in the user site; -I keeps the script folder off sys.path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
T = 'public/assets/setpieces/nicoHouse/tex/'
rs = np.random.RandomState(24)

def sdf(mask, maxd=28.0):
    m3 = np.tile(mask, (3, 3))
    din = ndi.distance_transform_edt(m3); dout = ndi.distance_transform_edt(~m3)
    h, w = mask.shape
    d = (din - dout)[h:2*h, w:2*w]
    return np.clip(0.5 + 0.5 * d / maxd, 0, 1)

def save(name, arr):
    a = (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(a).save(T + name, optimize=True)

def fbm(n, octs, seed, stretch=(1, 1), base=4):
    r = np.random.RandomState(seed); out = np.zeros((n, n)); amp = 1.0; tot = 0
    for o in range(octs):
        fy, fx = max(1, int(base * 2**o * stretch[0])), max(1, int(base * 2**o * stretch[1]))
        g = r.rand(fy, fx)
        g = np.pad(g, ((0, 1), (0, 1)), mode='wrap')
        z = ndi.zoom(g, (n / fy, n / fx), order=3, mode='grid-wrap', grid_mode=False)[:n, :n] if False else None
        # periodic bicubic upsample via FFT-free approach: tile, zoom, crop
        gt = np.tile(r.rand(fy, fx), (3, 3))
        z = ndi.zoom(gt, (n / fy, n / fx), order=3)[n:2*n, n:2*n]
        out += z * amp; tot += amp; amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min())

# ---- peel_a: blue paint flaking off brown wood (source streaks run along U; rotate so the grain runs along V)
def peel(score, thr, sig, maxd, seed):
    sc = ndi.gaussian_filter(score, sig, mode='wrap')
    m = sc > thr
    lab, k = ndi.label(m); sizes = ndi.sum(m, lab, range(1, k + 1)); m = np.isin(lab, 1 + np.where(sizes > 60)[0])
    lab, k = ndi.label(~m); sizes = ndi.sum(~m, lab, range(1, k + 1)); m = ~np.isin(lab, 1 + np.where(sizes > 40)[0])
    d = sdf(m, maxd)
    grain = fbm(1024, 4, seed, stretch=(0.2, 5), base=24)           # fine grain-aligned breakup so edges are ragged
    return np.clip(d + (grain - 0.5) * 0.10, 0, 1), m.mean()
im = np.asarray(Image.open(T + 'wood_peeling_paint_weathered_diff.jpg').convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255
a, f = peel(np.rot90(im[..., 2] - im[..., 0]).copy(), -0.03, 1.6, 34.0, 21)
save('peel_a.png', a); print('peel_a paint fraction', f)
# ---- peel_b: heavy flaking (white / green paint over red-brown timber), grain already along V
im = np.asarray(Image.open(T + 'weathered_peeling_timber_diff.jpg').convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255
mx, mn = im.max(-1), im.min(-1); sat = (mx - mn) / (mx + 1e-4)
score = np.maximum(np.clip((mx - 0.45) * 3, 0, 1) * np.clip((0.36 - sat) * 5, 0, 1), np.clip((im[..., 1] - np.maximum(im[..., 0], im[..., 2])) * 12, 0, 1))
b, f = peel(score, 0.22, 1.3, 26.0, 22)
save('peel_b.png', b); print('peel_b paint fraction', f)

# ---- grunge
n = 512
blot = fbm(n, 6, 1, base=3)
drip = fbm(n, 5, 2, stretch=(0.25, 6), base=4) ** 1.6
drip = np.clip(drip * 1.4 - 0.15, 0, 1)
speck = (fbm(n, 3, 3, base=64) > 0.62).astype(np.float32) * fbm(n, 2, 4, base=32)
speck = ndi.gaussian_filter(speck, 0.6, mode='wrap')
save('grunge.png', np.dstack([blot, drip, speck / max(speck.max(), 1e-3)]))

# ---- tin_wear: U across the sheet (tiles), V down the slope (0 = ridge end at top of image, 1 = eave)
n = 1024
streak = np.zeros((n, n), np.float32)
for i in range(520):
    x = rs.randint(0, n); y0 = rs.randint(-100, n - 40); ln = int(rs.gamma(2.0, 110)) + 30; wdt = rs.uniform(0.8, 4.5); st = rs.uniform(0.25, 1.0)
    ys = np.arange(max(0, y0), min(n, y0 + ln))
    if len(ys) == 0: continue
    fade = np.exp(-(ys - y0) / (ln * 0.45)) * st
    wob = (np.cumsum(rs.randn(len(ys)) * 0.12)).astype(np.int32)
    for k, y in enumerate(ys):
        xs = (x + wob[k] + np.arange(-6, 7)) % n
        streak[y, xs] = np.maximum(streak[y, xs], fade[k] * np.exp(-(np.arange(-6, 7) / wdt) ** 2))
streak = ndi.gaussian_filter(streak, (2.0, 0.7), mode='wrap')
blot = fbm(n, 6, 7, base=3)
patch = np.clip((blot - 0.56) * 5, 0, 1) * fbm(n, 4, 8, base=24)
rust = np.clip(streak * 0.9 + patch * 0.8, 0, 1)
spangle = fbm(n, 3, 9, base=96) * 0.6 + fbm(n, 5, 10, base=6) * 0.4
v = np.linspace(0, 1, n)[:, None]
edge = np.clip((v - 0.86) / 0.14, 0, 1) ** 1.5 * (0.5 + 0.5 * fbm(n, 4, 11, stretch=(0.5, 8), base=8))   # rust creeping up from the eave edge
edge = np.maximum(edge, np.clip((0.035 - v) / 0.035, 0, 1) * 0.6)
save('tin_wear.png', np.dstack([rust, spangle, np.broadcast_to(edge, (n, n))]))
print('done')
