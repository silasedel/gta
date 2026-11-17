#!/usr/bin/env python3
# Road decal atlas (stage 1 job 4): 4 x 4 cells of 512 px, from the top-down bakes of the user's road-detail scans
# (tools/v2/roads/bake_out, see bake_decals.mjs) + Models/Road Details textures, plus hand-drawn worn paint arrows (wear taken
# from Road 1's RoadLines scan) and oil stains. Writes public/assets/textures/roads/decals_col.png (RGBA, alpha = blend mask),
# decals_nrm.png (OpenGL normal, R = +u, G = +v), decals_arm.png (R AO, G roughness, B metal) and appends to SOURCES.txt.
#   python3 tools/v2/roads/build_decal_atlas.py
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BK = os.path.join(ROOT, 'tools', 'v2', 'roads', 'bake_out'); OUT = os.path.join(ROOT, 'public', 'assets', 'textures', 'roads')
C = 512; N = 4
col = np.zeros((N * C, N * C, 4), np.float32); nrm = np.zeros((N * C, N * C, 3), np.float32); nrm[..., :] = (0.5, 0.5, 1.0); arm = np.zeros((N * C, N * C, 3), np.float32); arm[..., 0] = 1; arm[..., 1] = 0.9
ASPH = np.array([0.387, 0.367, 0.350])  # mean albedo of the street asphalt scan (Road 6) the decals sit on
rng = np.random.default_rng(7)
def load(p, mode='RGB'): return np.asarray(Image.open(p).convert(mode), np.float32) / 255.0
def crop(a, box, size=C): im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)); return np.asarray(im.crop(box).resize((size, size), Image.LANCZOS), np.float32) / 255.0
def blur(a, r): im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)); return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0
def tone(c, mask=None):  # scale so the asphalt (median) matches the street asphalt
    m = np.median(c.reshape(-1, 3), axis=0) if mask is None else np.median(c[mask > 0.5].reshape(-1, 3), axis=0)
    return np.clip(c * (ASPH / np.maximum(m, 1e-3)), 0, 1)
yy, xx = np.mgrid[0:C, 0:C] / (C - 1) * 2 - 1; RR = np.sqrt(xx ** 2 + yy ** 2)
def noise(s=6):
    n = rng.random((C // 16, C // 16)); return np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((C, C), Image.BICUBIC), np.float32) / 255.0
def put(i, c, a, n=None, rough=0.9, metal=0.0):
    y, x = (i // N) * C, (i % N) * C
    col[y:y + C, x:x + C, :3] = c; col[y:y + C, x:x + C, 3] = np.clip(a, 0, 1)
    if n is not None: nrm[y:y + C, x:x + C] = n
    arm[y:y + C, x:x + C, 1] = rough if np.isscalar(rough) else rough; arm[y:y + C, x:x + C, 2] = metal if np.isscalar(metal) else metal
src = []
# --- 0, 1: crack networks (Road Crack 1 scan; Pothole 1 scan's crazed corner): only the cracks themselves are painted
def cracks(c, n, h=None):
    lum = c.mean(-1); d = np.clip((blur(lum, 9) - lum - 0.06) * 10.0, 0, 1)
    dev = np.clip(((1 - n[..., 2]) - 0.06) * 12, 0, 1)
    a = blur(np.clip(np.maximum(d, dev * 0.5), 0, 1), 0.8) * np.clip(1.25 - RR, 0, 1) ** 0.7
    return np.clip(c * 0.55, 0, 1), a
c0 = load(f'{BK}/crack1_color.png'); n0 = load(f'{BK}/crack1_normal.png'); box = (520, 520, 1530, 1530)
cc, aa = cracks(crop(c0, box), crop(n0, box)); put(0, cc, aa, crop(n0, box), 0.95); src.append('cell 0 crack: Road Details/Road Crack 1 (top-down bake of the 100k scan)')
c1 = load(f'{BK}/pothole1_color.png'); n1 = load(f'{BK}/pothole1_normal.png'); box = (1180, 60, 2008, 888)
cc, aa = cracks(crop(c1, box), crop(n1, box)); put(1, cc, aa, crop(n1, box), 0.95); src.append('cell 1 crack network: Road Details/Pothole 1 (crazed corner of the 1M scan)')
# --- 2: open pothole (Pothole 2 textures, top-down plane), 3: patched pothole (Pothole 1 bake)
pc = load(os.path.join(ROOT, 'Models/Road Details/Pothole 2 - Broken Asphalt Pothole Plane/textures/Pot Hole Color.png')); pn = load(os.path.join(ROOT, 'Models/Road Details/Pothole 2 - Broken Asphalt Pothole Plane/textures/Pot Hole Normal.png'))
box = (640, 140, 1520, 1020); c2 = tone(crop(pc, box)); a2 = np.clip((1.0 - RR) * 2.2, 0, 1) * np.clip(0.75 + noise() * 0.5, 0, 1)
put(2, c2, a2, crop(pn, box), 0.92); src.append('cell 2 pothole: Road Details/Pothole 2 (Pot Hole Color/Normal)')
box = (150, 250, 1650, 1750); c3 = tone(crop(c1, box)); put(3, c3, np.clip((1.0 - RR) * 2.0, 0, 1) * np.clip(0.7 + noise() * 0.6, 0, 1), crop(n1, box), 0.9); src.append('cell 3 patched pothole: Road Details/Pothole 1 (top-down bake of the 1M scan)')
# --- 4, 5: manhole covers (Manhole 1 bake, Manhole 2 bake), cover kept whole, a ring of their own patched asphalt fades out
m1 = load(f'{BK}/manhole1_color.png'); mn1 = load(f'{BK}/manhole1_normal.png'); box = (424, 424, 1624, 1624)
put(4, tone(crop(m1, box)), np.clip((0.98 - RR) * 3.0, 0, 1), crop(mn1, box), 0.75, np.where(RR < 0.42, 0.55, 0.0)); src.append('cell 4 manhole: Sewer Grates/Manhole 1 (top-down bake of the 1M scan; cover ~0.6 m)')
m2 = load(f'{BK}/manhole2_color.png'); mn2 = load(f'{BK}/manhole2_normal.png'); box = (180, 180, 1868, 1868)
put(5, crop(m2, box), np.clip((0.93 - RR) * 6.0, 0, 1), crop(mn2, box), 0.7, np.where(RR < 0.8, 0.5, 0.0)); src.append('cell 5 water-meter cover: Sewer Grates/Manhole 2 (top-down bake)')
# --- 6: storm drain grate (Sewer Grate 1 bake, rusty variant)
if os.path.exists(f'{BK}/grate1_color.png'):
    g = load(f'{BK}/grate1_color.png'); gn = load(f'{BK}/grate1_normal.png'); hb = load(f'{BK}/grate1_height.png', 'L')
    box = (0, 0, g.shape[1], g.shape[0])  # the bake is already zoomed onto one 2:1 grate piece
    put(6, crop(g, box), np.ones((C, C)) * np.clip((1 - np.maximum(abs(xx), abs(yy))) * 40, 0, 1), crop(gn, box), 0.6, 0.6); src.append('cell 6 storm-drain grate: Sewer Grates/Sewer Grate 1 (FBX, top-down bake with Sewage Old Color)')
# --- 7, 8: oil stains (lanes, stop bars): soft dark blotches, glossy
for i in (7, 8):
    a = np.zeros((C, C), np.float32); im = Image.new('L', (C, C), 0); d = ImageDraw.Draw(im)
    for k in range(40): r = rng.uniform(20, 90) * (1 - k / 60); x, y = rng.normal(C / 2, C / 7, 2); d.ellipse((x - r, y - r * rng.uniform(0.5, 1.2), x + r, y + r * rng.uniform(0.5, 1.2)), fill=int(rng.uniform(40, 120)))
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(14)), np.float32) / 255.0 * (0.6 + 0.4 * noise())
    put(i, np.ones((C, C, 3)) * np.array([0.05, 0.05, 0.055]), np.clip(a * 1.4, 0, 0.8), None, np.clip(0.9 - a * 0.9, 0.3, 0.9))
src.append('cells 7-8 oil stains: drawn (soft blotches, glossy)')
# --- 9-13: worn white paint arrows (US MUTCD shapes), wear = Road 1 RoadLines scan white line
L = load(os.path.join(ROOT, 'Models/Roads/Road 1 - Long Asphalt Road Strip/textures/RoadLines Color.jpg')).mean(-1)
wear = np.asarray(Image.fromarray((L[:, 177:232] * 255).astype(np.uint8)).resize((C, C), Image.BICUBIC), np.float32) / 255.0
wear = np.clip((wear - 0.45) / 0.25, 0, 1)
def arrow(kind):
    im = Image.new('L', (C, C), 0); d = ImageDraw.Draw(im); W = 34; cx = C / 2
    def shaft(x0, y0, x1, y1): d.line((x0, y0, x1, y1), fill=255, width=W)
    def head(x, y, ang):  # triangle head pointing along ang (radians, 0 = up)
        s, c = math.sin(ang), math.cos(ang); L0, H = 110, 70
        p = [(x + s * L0, y - c * L0), (x - c * H, y - s * H), (x + c * H, y + s * H)]; d.polygon(p, fill=255)
    if kind in ('S', 'SL', 'SR'): shaft(cx, C - 20, cx, 170); head(cx, 175, 0)
    if kind in ('L', 'SL'): shaft(cx, C - 20, cx, 300); d.line((cx, 300, cx - 110, 300), fill=255, width=W); head(cx - 110, 300, -math.pi / 2)
    if kind in ('R', 'SR'): shaft(cx, C - 20, cx, 300); d.line((cx, 300, cx + 110, 300), fill=255, width=W); head(cx + 110, 300, math.pi / 2)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255.0
    return a * (0.55 + 0.45 * wear)
for i, k in zip((9, 10, 11, 12, 13), ('S', 'L', 'R', 'SL', 'SR')):
    put(i, np.ones((C, C, 3)) * np.array([0.93, 0.92, 0.88]), arrow(k), None, 0.75)
src.append('cells 9-13 turn arrows (straight, left, right, straight+left, straight+right): drawn, worn with the Road 1 RoadLines scan')
# --- 14: sealed rectangular patch (tone of Pothole 1's patch asphalt), 15: tar-sealed crack line (crack 0 darker, thin)
patch = crop(c1, (700, 500, 1100, 900)); patch = np.clip(patch * (ASPH * 0.8 / np.maximum(np.median(patch.reshape(-1, 3), 0), 1e-3)), 0, 1)
pa = np.clip((1 - np.maximum(abs(xx), abs(yy))) * 30, 0, 1) * np.clip(0.85 + noise() * 0.3, 0, 1)
put(14, patch, pa, crop(n1, (700, 500, 1100, 900)), 0.85); src.append('cell 14 sealed patch: Road Details/Pothole 1 patch asphalt')
cc, aa = cracks(crop(c0, (520, 520, 1530, 1530)), crop(n0, (520, 520, 1530, 1530))); put(15, np.ones((C, C, 3)) * 0.06, np.clip(blur(aa, 2) * 1.6, 0, 1), None, 0.5); src.append('cell 15 tar-sealed crack: Road Crack 1 crack mask, filled with tar')
Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'decals_col.png'))
Image.fromarray((np.clip(nrm, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'decals_nrm.png'))
Image.fromarray((np.clip(arm, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'decals_arm.png'))
with open(os.path.join(OUT, 'SOURCES.txt'), 'a') as f: f.write('\ndecals (atlas 4 x 4 cells, tools/v2/roads/build_decal_atlas.py):\n  ' + '\n  '.join(src) + '\n')
print('\n'.join(src))
