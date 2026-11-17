# Southline V2 — NPC atlas painter (PEOPLE-LOOK track). Plain python3 + numpy/scipy/numba/PIL, our own procedural art.
#   python3 paint_npc.py <npc_specs.json> <workdir with gen_npc .npz> <outdir> <mpfb data dir> [id,id,...]
# Per archetype writes <outdir>/<id>_a.webp (RGB albedo: skin + every garment in the body UV layout, page 2 for outer
# layers; A = material byte slot << 5 | fabric, lossless) and <outdir>/<id>_n.webp at half size (R,G normal, B occlusion).
# Everything is painted from per-texel 3D positions (rasterized from the mesh), so seams, folds, fades, prints and the
# hair line follow the body and stay continuous across UV islands.
import sys, os, json, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "player", "pipeline"))
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw, ImageFont
from texlib import _raster, srgb2lin, lin2srgb, save_img as _save_img
import subprocess
def save_img(arr01, path, quality=92):
    """WebP with -exact: the albedo alpha is the material byte (0 = skin), so RGB under alpha 0 must be kept as is"""
    a = (np.clip(arr01, 0, 1) * 255 + 0.5).astype(np.uint8); tmp = path + ".tmp.png"; Image.fromarray(a).save(tmp, compress_level=1)
    subprocess.run(["/opt/homebrew/bin/cwebp", "-quiet", "-mt", "-m", "4", "-exact", "-q", str(quality), "-sharp_yuv", "-alpha_q", "100", "-alpha_filter", "none", tmp, "-o", path], check=True); os.remove(tmp)

FAB = {"skin": 0, "jersey": 1, "rib": 2, "pique": 3, "denim": 4, "twill": 5, "poplin": 6, "oxford": 6, "linen": 7, "suiting": 8, "nylon": 9,
       "satin": 10, "leather": 11, "lycra": 12, "mesh": 13, "canvas": 14, "knit": 15, "rayon": 16, "silk": 17, "drill": 18, "uniform": 19,
       "rubber": 20, "tweed": 21, "hair": 22, "poly": 23, "metal": 24, "patent": 25}
SLOT = {"fixed": 0, "top": 1, "bottom": 2, "outer": 3, "hat": 4, "shoe": 5}
TOP_T = {"tee", "henley", "tank", "crop", "polo", "camp", "guayabera", "dress_shirt", "rolled_shirt", "blouse", "chef", "police_shirt", "sports_bra", "bikini_top"}
OUTER_T = {"bomber", "vest", "hivis", "blazer"}
BOTTOM_T = {"jeans", "chinos", "trousers", "chef_pants", "cargo_pants", "cargo_shorts", "shorts", "boardshorts", "run_shorts", "leggings", "bikini_bottom", "overalls"}
WOVEN = {"camp", "guayabera", "dress_shirt", "rolled_shirt", "blouse", "chef", "police_shirt"}
TONES = {"fair": (1.06, 1.0, 0.97), "light": (1.0, 0.97, 0.92), "olive": (0.93, 0.86, 0.73), "tan": (0.86, 0.75, 0.6),
         "brown": (0.86, 0.76, 0.66), "deep": (0.84, 0.77, 0.71), "dark": (0.74, 0.68, 0.64)}
SHOE_COL = {"sneaker_white": "#ecebe6", "sneaker_gray": "#9a9ca0", "sneaker_black": "#1e1e20", "sneaker_gold": "#18181a", "dress_black": "#141414",
            "dress_brown": "#6b4026", "boots_black": "#1c1a18", "boots_tan": "#8a6440", "heels_black": "#101012", "heels_nude": "#c9a283", "heels_wine": "#141414", "flipflops": "#2a3442", "sandals": "#8a6a46"}

def hexlin(h):
    h = h.lstrip("#"); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)
    return srgb2lin(c)

# ------------------------------------------------------------------ 3D value noise (continuous across UV seams)
_PERM = np.random.RandomState(7).permutation(512).astype(np.int64) % 256
_PERM = np.concatenate([_PERM, _PERM])
_GR = np.random.RandomState(11).rand(256).astype(np.float32) * 2 - 1
def vnoise3(p, seed=0):
    p = p + seed * 17.13
    i = np.floor(p).astype(np.int64); f = (p - i).astype(np.float32); u = f * f * (3 - 2 * f)
    i &= 255
    def h(dx, dy, dz): return _GR[_PERM[_PERM[_PERM[i[:, 0] + dx] + i[:, 1] + dy] + i[:, 2] + dz]]
    x0 = h(0, 0, 0) * (1 - u[:, 0]) + h(1, 0, 0) * u[:, 0]; x1 = h(0, 1, 0) * (1 - u[:, 0]) + h(1, 1, 0) * u[:, 0]
    x2 = h(0, 0, 1) * (1 - u[:, 0]) + h(1, 0, 1) * u[:, 0]; x3 = h(0, 1, 1) * (1 - u[:, 0]) + h(1, 1, 1) * u[:, 0]
    y0 = x0 * (1 - u[:, 1]) + x1 * u[:, 1]; y1 = x2 * (1 - u[:, 1]) + x3 * u[:, 1]
    return y0 * (1 - u[:, 2]) + y1 * u[:, 2]
def fbm3(p, scale, octaves=4, seed=0, gain=0.5):
    out = np.zeros(len(p), dtype=np.float32); a = 1.0; tot = 0.0; q = p / scale
    for o in range(octaves):
        out += a * vnoise3(q, seed + o * 3); tot += a; a *= gain; q = q * 2.03
    return out / tot
sm = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0 + 1e-12), 0, 1))
gauss = lambda x, w: np.exp(-(x / w) ** 2)

# ------------------------------------------------------------------ raster helpers
def raster(tuv, tattr, W, H):
    px = np.empty(tuv.shape, dtype=np.float64); px[..., 0] = tuv[..., 0] * W; px[..., 1] = (1 - tuv[..., 1]) * H
    out = np.zeros((H, W, tattr.shape[2]), dtype=np.float32); mask = np.zeros((H, W), dtype=np.uint8)
    _raster(np.ascontiguousarray(px), np.ascontiguousarray(tattr.astype(np.float64)), H, W, out, mask)
    return out, mask.astype(bool)

def chain(pos, pts, side_sign):
    """param t along a 3-point joint chain, distance, and an angle around the limb (0 front, +pi/2 outside, -pi/2 inside)"""
    best_d = np.full(len(pos), 1e9, np.float32); t = np.zeros(len(pos), np.float32); phi = np.zeros(len(pos), np.float32)
    for i in range(len(pts) - 1):
        a = np.array(pts[i], np.float32); b = np.array(pts[i + 1], np.float32); ab = b - a; L2 = ab @ ab
        tt = np.clip(((pos - a) @ ab) / L2, -0.4, 1.4); c = a + np.clip(tt, 0, 1)[:, None] * ab
        r = pos - c; d = np.linalg.norm(r, axis=1)
        ax = ab / math.sqrt(L2); f = np.array([0, -1, 0], np.float32); f = f - ax * (f @ ax); f /= np.linalg.norm(f) + 1e-9
        o = np.cross(ax, f); o = o * (1 if o[0] * side_sign > 0 else -1)
        ph = np.arctan2(r @ o, r @ f)
        m = d < best_d; best_d[m] = d[m]; t[m] = (i + tt)[m]; phi[m] = ph[m]
    return t, best_d, phi

class Fields:
    """per-texel fields of one piece"""
    def __init__(self, pos, nrm, hem, mpp, L):
        self.p = pos; self.n = nrm; self.hem = hem * 0.1; self.mpp = mpp; self.L = L
        x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]; self.x, self.y, self.z = x, y, z
        cy = (L["Spine2"][1] + L["Hips"][1]) * 0.5; self.cy = cy
        self.theta = np.arctan2(x, -(y - cy)); self.r = np.hypot(x, y - cy); self.s = self.theta * np.maximum(self.r, 0.08)
        self.armT, self.armD, self.armPhi = np.zeros_like(x), np.full_like(x, 9), np.zeros_like(x)
        for side, key in ((1, "armL"), (-1, "armR")):
            t, d, ph = chain(pos, L[key], side); m = (x * side > 0)
            self.armT[m], self.armD[m], self.armPhi[m] = t[m], d[m], ph[m]
        self.legT, self.legD, self.legPhi = np.zeros_like(x), np.full_like(x, 9), np.zeros_like(x)
        for side, key in ((1, "legL"), (-1, "legR")):
            t, d, ph = chain(pos, L[key], side); m = (x * side > 0)
            self.legT[m], self.legD[m], self.legPhi[m] = t[m], d[m], ph[m]
        self.onArm = (self.armT > 0.02) & (self.armD < 0.11) & (np.abs(x) > np.abs(np.array(L["armL"][0])[0]) - 0.03)
        self.onLeg = (z < L["crotchZ"] + 0.02) & (self.legT > 0.05)
        self.front = y < cy

def piece_fields(d, key, W, H, L):
    co, nr, tri, tuv, hem = d[key + "_co"], d[key + "_n"], d[key + "_tri"], d[key + "_uv"], d[key + "_hem"]
    if len(tri) == 0: return None, None
    # meters per pixel per triangle
    P3 = co[tri]; a3 = 0.5 * np.linalg.norm(np.cross(P3[:, 1] - P3[:, 0], P3[:, 2] - P3[:, 0]), axis=1)
    U = tuv * np.array([W, H], np.float32); a2 = 0.5 * np.abs((U[:, 1, 0] - U[:, 0, 0]) * (U[:, 2, 1] - U[:, 0, 1]) - (U[:, 2, 0] - U[:, 0, 0]) * (U[:, 1, 1] - U[:, 0, 1]))
    mpp = np.sqrt(a3 / np.maximum(a2, 1e-6))
    attr = np.concatenate([co[tri], nr[tri], hem[tri][..., None], np.repeat(mpp[:, None, None], 3, 1)], axis=2)
    out, mask = raster(tuv, attr, W, H)
    v = out[mask]
    n = v[:, 3:6]; n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    return Fields(v[:, 0:3], n, v[:, 6], np.clip(v[:, 7], 0.0005, 0.02), L), mask

# ------------------------------------------------------------------ seams, stitches, bands
def line(dist, w):          # groove profile around a seam line (dist in m)
    return gauss(dist, w)
def stitch_row(dist, off, along, w=0.0011, period=0.0042):
    """a topstitch row 'off' m beside the seam: thin line, dashed along 'along' (m)"""
    dash = 0.55 + 0.45 * np.sign(np.sin(along / period * 2 * math.pi))
    return gauss(np.abs(dist) - off, w) * dash

class Paint:
    """accumulates albedo (linear), height (m), ao, fabric byte for one piece"""
    def __init__(self, F, color, fabric, slot, seed=0):
        self.F = F; N = len(F.x)
        self.c = np.tile(color, (N, 1)).astype(np.float32); self.h = np.zeros(N, np.float32); self.ao = np.ones(N, np.float32)
        self.code = np.full(N, (SLOT[slot] << 5) | FAB.get(fabric, 1), np.uint8); self.seed = seed; self.thread = None
    def mul(self, k, m=None):
        k = np.asarray(k, np.float32)
        if k.ndim == 1: k = k[:, None]
        self.c *= k if m is None else np.where(m[:, None], k, 1)
    def mix(self, col, w):
        w = np.clip(np.asarray(w, np.float32), 0, 1)[:, None]; self.c = self.c * (1 - w) + np.asarray(col, np.float32) * w
    def seam(self, dist, along, rows=(0.0045,), depth=0.0007, w=0.0016, dark=0.22, thread=None, mask=None):
        g = line(dist, w)
        if mask is not None: g = g * mask
        self.h -= depth * g; self.mul(1 - dark * g); self.ao *= 1 - 0.25 * g
        tc = thread if thread is not None else (self.thread if self.thread is not None else None)
        for off in rows:
            s = stitch_row(dist, off, along) * (1 if mask is None else mask)
            self.h += 0.00025 * s
            if tc is not None: self.mix(tc, s * 0.7)
            else: self.mul(1 - 0.14 * s)
    def band(self, m, depth=0.0012, edge_w=0.002, shade=0.94, stitch=True, along=None, width=0.02):
        """finished edge band of 'width' m (hem, cuff, waistband): double layer + stitch line at the band edge"""
        hd = self.F.hem
        b = sm(width + 0.002, width - 0.001, hd) * m
        self.h += depth * b; self.mul(1 - (1 - shade) * b)
        e = gauss(hd - width, edge_w) * m; self.h -= 0.0006 * e; self.ao *= 1 - 0.3 * e
        if stitch:
            al = along if along is not None else self.F.s
            s = stitch_row(hd - width, 0.003, al) * m
            if self.thread is not None: self.mix(self.thread, s * 0.6)
            else: self.mul(1 - 0.12 * s)
        # rolled edge highlight
        r = gauss(hd, 0.0018) * m; self.mul(1 + 0.08 * r)
    def button(self, cx, cz, r=0.0058, col=None, front=True, y_side=None):
        F = self.F; m = F.front if front else ~F.front
        d = np.hypot(F.x - cx, F.z - cz)
        disc = sm(r + 0.001, r - 0.0005, d) * m
        col = col if col is not None else self.c.mean(0) * 0.85 + 0.06
        self.mix(col, disc); self.h += 0.0018 * disc * (1 - (d / r) ** 2).clip(0, 1) ** 0.5
        self.ao *= 1 - 0.35 * gauss(d - r - 0.0012, 0.0012) * m
        hole = sum(gauss(np.hypot(F.x - cx - dx, F.z - cz - dz), 0.0007) for dx, dz in ((0.0016, 0.0016), (-0.0016, 0.0016), (0.0016, -0.0016), (-0.0016, -0.0016))) * m
        self.mul(1 - 0.5 * np.clip(hole, 0, 1))
        self.code = np.where(disc > 0.5, (self.code & 0xE0) | FAB["poly"], self.code).astype(np.uint8)
    def noise_dye(self, amt=0.05, scale=0.18, fine=0.0):
        F = self.F; n = fbm3(F.p, scale, 3, self.seed)
        self.mul(1 + amt * n)
        if fine: self.mul(1 + fine * vnoise3(F.p / 0.004, self.seed + 5))
    def crumple(self, amp=0.0012, scale=0.05):
        n = fbm3(self.F.p, scale, 3, self.seed + 9); self.h += amp * (1 - np.abs(n) * 2.2).clip(-1, 1)

# ------------------------------------------------------------------ fold generators (height in m)
def folds_ring(F, t, center, width, length_m, wl, amp, phase_seed, chevron=0.9, phi=None, face=0.0):
    """compression folds around a limb (elbow, knee back, ankle stack): bands across the axis, zig-zagging"""
    m = gauss(t - center, width)
    along = t * length_m
    ph = phi if phi is not None else np.zeros_like(t)
    zig = chevron * np.abs(np.sin(ph * 1.5 + phase_seed)) * wl
    n = fbm3(F.p, 0.04, 2, int(phase_seed * 10)) * wl * 0.8
    w = np.sin((along + zig + n) / wl * 2 * math.pi)
    side = 1.0 if face == 0 else (0.5 + 0.5 * np.cos(ph - face))
    return amp * m * w * side

def folds_drape(F, z0, z1, wl, amp, seed):
    """long vertical drape folds below the bust / in skirts"""
    m = sm(z0, z0 - 0.06, F.z) * sm(z1 - 0.02, z1 + 0.04, F.z)
    n = fbm3(np.stack([F.s * 3, F.z * 0.4, np.zeros_like(F.z)], 1), 0.3, 2, seed)
    return amp * m * np.sin((F.s + 0.03 * n) / wl * 2 * math.pi + 1.7 * n)

def folds_band(F, zc, width, wl, amp, seed):
    """horizontal gathers / compression above a waistband or a hem"""
    m = gauss(F.z - zc, width)
    n = fbm3(F.p, 0.06, 2, seed)
    return amp * m * np.sin((F.z + 0.012 * np.sin(F.s / 0.07 + n * 3)) / wl * 2 * math.pi + n * 2.0)

def folds_pull(F, origin, direction, wl, amp, radius, seed):
    """diagonal pull lines radiating from a point (armpits, crotch whiskers)"""
    o = np.array(origin, np.float32); d = F.p - o; dist = np.linalg.norm(d, axis=1)
    ang = np.arctan2(d[:, 2], d[:, 0] * np.sign(direction[0] + 1e-9))
    n = fbm3(F.p, 0.05, 2, seed)
    return amp * sm(radius, radius * 0.25, dist) * sm(0.0, 0.03, dist) * np.sin(ang / wl * 2 * math.pi + n * 1.3)

# ------------------------------------------------------------------ prints
def print_coords(F):
    """2D print space in meters: cylinder around the torso / limbs"""
    u = F.s.copy(); v = F.z.copy()
    if hasattr(F, "onArm"):
        m = F.onArm; u[m] = F.armPhi[m] * 0.05 + np.sign(F.x[m]) * 0.6; v[m] = F.armT[m] * 0.28
        m2 = F.onLeg; u[m2] = F.legPhi[m2] * 0.08 + np.sign(F.x[m2]) * 0.6; v[m2] = -F.legT[m2] * 0.45
    return u, v

def motif_field(u, v, cell, seed, kind):
    """returns (mask0..1 of motif, motif id) on a half-drop grid of cells (m)"""
    gx = np.floor(u / cell); gy = np.floor(v / cell - 0.5 * (gx % 2))
    fx = u / cell - gx; fy = v / cell - 0.5 * (gx % 2) - gy
    hsh = ((gx.astype(np.int64) * 73856093) ^ (gy.astype(np.int64) * 19349663) ^ seed) & 0xffff
    jx = ((hsh * 37) % 100) / 100 * 0.4 + 0.3; jy = ((hsh * 53) % 100) / 100 * 0.4 + 0.3
    rot = ((hsh * 97) % 360) / 180 * math.pi
    dx = fx - jx; dy = fy - jy
    rx = dx * np.cos(rot) - dy * np.sin(rot); ry = dx * np.sin(rot) + dy * np.cos(rot)
    r = np.hypot(rx, ry); a = np.arctan2(ry, rx)
    if kind == "hibiscus":
        petal = 0.26 * (0.65 + 0.35 * np.abs(np.cos(a * 2.5)))
        m = sm(petal + 0.02, petal - 0.01, r); core = sm(0.07, 0.04, r)
        return m, core
    if kind == "leaf":
        lf = sm(0.03, 0.0, np.abs(ry) - 0.14 * np.sqrt(np.clip(1 - (rx / 0.42) ** 2, 0, 1))) * (np.abs(rx) < 0.42)
        vein = gauss(ry, 0.008) * (np.abs(rx) < 0.38) + gauss(np.abs(ry) - np.abs(rx - 0.2) * 0.4 + 0.02, 0.006) * 0.0
        return lf, vein
    if kind == "dot":
        return sm(0.2, 0.17, np.hypot(fx - 0.5, fy - 0.5)), np.zeros_like(u)
    if kind == "splatter":
        blob = sm(0.22, 0.1, r * (1 + 0.5 * np.sin(a * 7 + hsh))) * ((hsh % 3) == 0)
        return blob, np.zeros_like(u)
    if kind == "floral":
        petal = 0.18 * (0.55 + 0.45 * np.abs(np.cos(a * 2.5)))
        return sm(petal + 0.015, petal - 0.01, r), sm(0.05, 0.03, r)
    return np.zeros_like(u), np.zeros_like(u)

def apply_print(P, name, seed):
    F = P.F; u, v = print_coords(F)
    if name.startswith("stripe"):
        col = {"stripe_coral": ["#f0ede6", "#2a6fb5"], "stripe_navy": ["#f0ede6", "#c9a043"]}[name]
        w = np.mod(v / 0.045 + 0.0, 1.0)
        st = sm(0.0, 0.02, w) * sm(0.24, 0.22, w); st2 = sm(0.5, 0.52, w) * sm(0.6, 0.58, w)
        P.mix(hexlin(col[0]), st * 0.95); P.mix(hexlin(col[1]), st2 * 0.95)
    elif name == "leaf_navy":
        m, vein = motif_field(u, v, 0.085, seed, "leaf"); P.mix(hexlin("#2f6e5a"), m * 0.95); P.mix(hexlin("#9cc9a6"), vein * m * 0.8)
        m2, core = motif_field(u + 0.04, v + 0.02, 0.11, seed + 3, "hibiscus"); P.mix(hexlin("#d9a14a"), m2 * 0.6 * (1 - m)); P.mix(hexlin("#f2e6c8"), core * m2 * 0.5)
    elif name == "hibiscus_sun":
        m, core = motif_field(u, v, 0.09, seed, "hibiscus"); P.mix(hexlin("#d9432b"), m * 0.95); P.mix(hexlin("#f6d36a"), core * 0.9)
        l, vein = motif_field(u + 0.045, v + 0.03, 0.08, seed + 2, "leaf"); P.mix(hexlin("#2f8a5a"), l * (1 - m) * 0.95)
    elif name == "floral_cream":
        m, core = motif_field(u, v, 0.06, seed, "floral"); P.mix(hexlin("#c95a6a"), m * 0.85); P.mix(hexlin("#f2c94c"), core * 0.85)
        l, _ = motif_field(u + 0.03, v + 0.02, 0.05, seed + 4, "leaf"); P.mix(hexlin("#6f9a6a"), l * (1 - m) * 0.7)
    elif name == "dot_rust":
        m, _ = motif_field(u, v, 0.032, seed, "dot"); P.mix(hexlin("#f0ede6"), m * 0.9)
    elif name == "check_small":
        a = np.mod(u / 0.024, 1.0) < 0.5; b = np.mod(v / 0.024, 1.0) < 0.5
        P.mix(hexlin("#e9e6dc"), (a ^ b).astype(np.float32) * 0.85)
    elif name == "splatter_magenta":
        m, _ = motif_field(u, v, 0.13, seed, "splatter"); P.mix(hexlin("#e23d9a"), m)
        m2, _ = motif_field(u + 0.05, v, 0.07, seed + 1, "splatter"); P.mix(hexlin("#f0ede6"), m2 * 0.9)

def text_stamp(P, text, cx, cz, height, back=True, col="#f0ede6", font_px=96):
    """flat print of text on the chest or back (planar projection, sharp, no brand)"""
    F = P.F
    try: font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_px)
    except Exception: font = ImageFont.load_default()
    bb = ImageDraw.Draw(Image.new("L", (10, 10))).textbbox((0, 0), text, font=font)
    im = Image.new("L", (bb[2] - bb[0] + 8, bb[3] - bb[1] + 8), 0); ImageDraw.Draw(im).text((4 - bb[0], 4 - bb[1]), text, fill=255, font=font)
    a = np.asarray(im, np.float32) / 255; ih, iw = a.shape; wm = height * iw / ih
    sx = (F.x - cx) if not back else (cx - F.x)                   # mirrored on the back so it reads correctly
    u = (sx / wm + 0.5) * iw; v = (0.5 - (F.z - cz) / height) * ih
    m = (u >= 0) & (u < iw - 1) & (v >= 0) & (v < ih - 1) & ((F.y > F.cy) if back else (F.y < F.cy)) & ~F.onArm
    val = np.zeros(len(u), np.float32)
    val[m] = a[v[m].astype(int), u[m].astype(int)]
    P.mix(hexlin(col), val * 0.95); P.h += 0.00015 * val

# ------------------------------------------------------------------ garment recipes
def paint_top(P, t, g, L, F, tucked):
    sh_z = (L["LeftArm"][2] + L["RightArm"][2]) / 2; neckZ = L["neckBaseZ"]; bust = L["bustZ"]; hip = L["hipZ"]
    knit = t in ("tee", "henley", "tank", "crop", "polo", "sports_bra", "bikini_top") or t.startswith("knit_dress")
    P.noise_dye(0.04 if knit else 0.05, 0.2, 0.025 if g.get("fabric") in ("jersey", "rib", "pique") else 0.0)
    if g.get("print"): apply_print(P, g["print"], P.seed)
    # folds
    sl = g.get("sleeve", 0)
    if F.onArm.any():
        if sl > 1.2: P.h += folds_ring(F, F.armT, 1.0, 0.18, 0.28, 0.022, 0.0028, 1.3, 0.8, F.armPhi, face=-math.pi * 0.5) * F.onArm
        P.h += folds_ring(F, F.armT, 0.12, 0.12, 0.28, 0.03, 0.0016, 2.1, 0.6, F.armPhi, face=-math.pi * 0.6) * F.onArm
        if g.get("roll"): P.h += folds_ring(F, F.armT, 1.32, 0.06, 0.28, 0.012, 0.0024, 0.3, 0.2, F.armPhi) * F.onArm
    tor = ~F.onArm
    if not knit or t == "tee": P.h += folds_drape(F, bust - 0.03, hip - 0.1, 0.075, 0.0022, P.seed) * tor
    if tucked: P.h += folds_band(F, hip + 0.1, 0.035, 0.022, 0.0026, P.seed + 1) * tor
    elif knit and t != "sports_bra": P.h += folds_band(F, hip + 0.02, 0.045, 0.03, 0.0018, P.seed + 1) * tor
    for sx, key in ((1, "LeftArm"), (-1, "RightArm")):
        ap = np.array(L[key], np.float32) + np.array([-sx * 0.03, 0, -0.06], np.float32)
        P.h += folds_pull(F, ap, (sx, 0, 0), 0.22, 0.0008, 0.13, P.seed + 2) * tor * (F.front | (F.y > F.cy + 0.05))
    P.crumple(0.0007 if knit else 0.001, 0.05)
    # seams
    side_d = (np.abs(np.abs(F.theta) - math.pi / 2)) * np.maximum(F.r, 0.08)
    if not knit or t in ("polo",): P.seam(side_d, F.z, rows=(), depth=0.0006, mask=tor.astype(np.float32))
    if sl > 0:
        P.seam(np.abs(F.armT - 0.06) * 0.28, F.armPhi * 0.05, rows=(0.004,) if not knit else (), mask=(np.abs(F.x) > 0.12).astype(np.float32))
        P.seam(np.abs(np.abs(F.armPhi) - math.pi) * 0.04, F.armT * 0.28, rows=(), depth=0.0004, mask=F.onArm.astype(np.float32))   # under-sleeve seam
    shm = tor & (F.z > sh_z - 0.03)
    yS = (L["LeftArm"][1] + L["RightArm"][1]) / 2 + 0.005
    P.seam(np.abs(F.y - yS), F.x, rows=(0.004,) if not knit else (), mask=shm.astype(np.float32))
    if t in WOVEN:   # back yoke
        P.seam(np.abs(F.z - (sh_z - 0.09)), F.x, rows=(0.004,), mask=((F.y > F.cy) & tor).astype(np.float32))
    # finished edges: neckband, hems, cuffs
    nm = (F.z > neckZ - 0.12) & tor & (F.hem < 0.05)
    hm = (F.z < hip + 0.05) & tor
    P.band(hm.astype(np.float32), width=0.018 if knit else 0.012)
    if F.onArm.any(): P.band(F.onArm.astype(np.float32), width=0.022 if not g.get("roll") else 0.05)
    if knit: P.band(nm.astype(np.float32), width=0.016, shade=0.9, depth=0.0016)
    # plackets, buttons
    if t == "henley" or t == "polo":
        pl = g.get("placket", 0.11); zt = neckZ + 0.01; zb = zt - (0.11 if t == "henley" else 0.12)
        m = F.front & (F.z > zb) & (F.z < zt + 0.02)
        P.seam(np.abs(np.abs(F.x) - 0.014), F.z, rows=(0.003,), mask=m.astype(np.float32)); P.seam(np.abs(F.z - zb), F.x, rows=(), mask=(m | (np.abs(F.z - zb) < 0.01)).astype(np.float32) * (np.abs(F.x) < 0.016))
        for k in range(3 if t == "henley" else 2): P.button(0.0, zt - 0.025 - k * 0.032, 0.0048)
    if t in WOVEN and t != "chef":
        zv = neckZ - (0.14 if t == "camp" else 0.12 if t == "guayabera" else 0.11 if t == "blouse" else 0.07 if t == "rolled_shirt" else 0.0)
        m = F.front & (F.z < zv + 0.01) & tor
        P.seam(np.abs(F.x - 0.017), F.z, rows=(0.003,), mask=m.astype(np.float32))
        P.seam(np.abs(F.x + 0.017), F.z, rows=(), depth=0.0012, dark=0.3, mask=m.astype(np.float32))
        z = zv - 0.03
        while z > hip - 0.02: P.button(0.0, z, 0.0055 if t != "blouse" else 0.0048); z -= 0.088
    if t == "chef":
        for sx in (0.06, -0.06):
            for k in range(5): P.button(sx, neckZ - 0.04 - k * 0.075, 0.0075, col=hexlin("#f6f4ef"))
        P.seam(np.abs(F.x + 0.09), F.z, rows=(0.004,), mask=(F.front & tor).astype(np.float32))
    if t in ("camp", "dress_shirt", "rolled_shirt", "guayabera", "police_shirt") or t == "polo" and False:
        pk = [(0.1, bust + 0.03)] if t != "police_shirt" else [(0.1, bust + 0.04), (-0.1, bust + 0.04)]
        if t == "guayabera": pk = [(0.1, bust + 0.03), (-0.1, bust + 0.03), (0.1, hip + 0.04), (-0.1, hip + 0.04)]
        for px, pz in pk:
            dx = np.abs(F.x - px) - 0.052; dz = np.abs(F.z - (pz - 0.06)) - 0.065
            edge = np.maximum(dx, dz); m = F.front & tor & (edge < 0.004)
            P.seam(np.abs(edge), F.z + F.x, rows=(0.003,), mask=m.astype(np.float32))
            top = F.front & tor & (np.abs(F.z - (pz + 0.005)) < 0.004) & (np.abs(F.x - px) < 0.052); P.h += 0.0005 * top; P.mul(np.where(top, 0.93, 1.0))
            if t == "police_shirt":
                flap = F.front & tor & (F.z > pz - 0.035) & (F.z < pz + 0.005) & (np.abs(F.x - px) < 0.054)
                P.ao *= np.where(flap & (F.z < pz - 0.03), 0.75, 1.0); P.h += 0.0012 * flap
    if t == "guayabera":
        for sx in (0.045, 0.075, -0.045, -0.075):
            P.seam(np.abs(F.x - sx), F.z, rows=(0.0025,), depth=0.0012, dark=0.1, mask=(F.front & tor & (F.z < bust + 0.12)).astype(np.float32))
    if t == "police_shirt":
        # badge (wearer's left chest), name plate (right), shoulder patches: invented "Southline Police" insignia
        d = np.hypot(F.x - 0.1, F.z - (bust + 0.085)); ang = np.arctan2(F.z - (bust + 0.085), F.x - 0.1)
        shield = sm(0.024, 0.021, d * (1 + 0.18 * np.cos(ang * 5))) * F.front
        P.mix(hexlin("#c9a043"), shield); P.h += 0.0015 * shield; P.code = np.where(shield > 0.5, (P.code & 0xE0) | FAB["metal"], P.code).astype(np.uint8)
        star = sm(0.011, 0.008, d * (1 + 0.45 * np.cos(ang * 5))) * F.front; P.mix(hexlin("#8a6a2a"), star * 0.7)
        plate = F.front & (np.abs(F.x + 0.1) < 0.03) & (np.abs(F.z - (bust + 0.06)) < 0.007)
        P.mix(hexlin("#d8c27a"), plate.astype(np.float32)); P.code = np.where(plate, (P.code & 0xE0) | FAB["metal"], P.code).astype(np.uint8)
        if F.onArm.any():
            pm = F.onArm & (np.abs(F.armT - 0.3) < 0.2)
            dp = np.hypot((F.armT - 0.3) * 0.28, (F.armPhi - math.pi * 0.5) * 0.05)
            patch = sm(0.04, 0.037, dp) * pm
            P.mix(hexlin("#14213a"), patch); P.mix(hexlin("#c9a043"), gauss(dp - 0.034, 0.0025) * pm); P.mix(hexlin("#e9e1cf"), sm(0.016, 0.012, dp) * pm)
        ep = tor & (F.z > sh_z - 0.01) & (np.abs(F.y - yS) < 0.022)
        P.h += 0.0012 * ep * sm(0.022, 0.018, np.abs(F.y - yS))
        P.seam(np.abs(np.abs(F.y - yS) - 0.02), F.x, rows=(), mask=ep.astype(np.float32))
    if g.get("text"):
        text_stamp(P, g["text"], 0.0, bust + 0.02, 0.06, back=True)
        text_stamp(P, g["text"], 0.085, bust + 0.06, 0.018, back=False)
    if g.get("trim"):
        tm = gauss(F.hem - 0.008, 0.004) * (nm | (F.onArm & (F.hem < 0.03)))
        P.mix(hexlin(g["trim"]), tm)
    if t == "sports_bra" or t == "bikini_top":
        P.band(np.ones_like(F.z), width=0.008, shade=0.9)
    if t.startswith("knit_dress"):
        P.h += 0.0004 * np.sin(F.s / 0.006 * 2 * math.pi) * sm(0.0, 0.02, F.hem)   # rib knit visible at close range
    # ambient occlusion: armpits, under the bust
    for key in ("LeftArm", "RightArm"):
        a = np.array(L[key], np.float32); d = np.linalg.norm(F.p - (a + np.array([0, 0, -0.07], np.float32)), axis=1)
        P.ao *= 1 - 0.35 * sm(0.1, 0.02, d)

def paint_outer(P, t, g, L, F):
    sh_z = (L["LeftArm"][2] + L["RightArm"][2]) / 2; neckZ = L["neckBaseZ"]; bust = L["bustZ"]; hip = L["hipZ"]
    tor = ~F.onArm
    P.noise_dye(0.05, 0.2, 0.01)
    if t == "bomber":
        rib = hexlin(g["color"]) * 0.7
        P.h += folds_ring(F, F.armT, 1.0, 0.25, 0.28, 0.03, 0.005, 1.1, 0.9, F.armPhi, face=-math.pi * 0.5) * F.onArm
        P.h += folds_ring(F, F.armT, 0.5, 0.25, 0.28, 0.045, 0.003, 2.4, 0.9, F.armPhi) * F.onArm
        P.h += folds_band(F, hip + 0.06, 0.05, 0.035, 0.0025, P.seed) * tor
        P.h += folds_drape(F, bust, hip, 0.09, 0.003, P.seed + 1) * tor
        P.crumple(0.002, 0.07)
        cuff = F.onArm & (F.hem < 0.055); band = tor & (F.z < hip + 0.03) & (F.hem < 0.07)
        collar = tor & (F.z > neckZ - 0.02) & (F.hem < 0.05) & ~(F.front & (np.abs(F.x) < 0.045) & (F.z < neckZ))
        for m, wdt in ((cuff, 0.05), (band, 0.06), (collar, 0.04)):
            mm = m.astype(np.float32) * sm(wdt + 0.002, wdt - 0.003, F.hem)
            P.mix(rib, mm); P.h += 0.0006 * np.sin(F.s / 0.005 * 2 * math.pi) * mm
            P.code = np.where(mm > 0.5, (SLOT["outer"] << 5) | FAB["rib"], P.code).astype(np.uint8)
            P.seam(F.hem - wdt, F.s, rows=(0.003,), mask=m.astype(np.float32))
        zip_ = F.front & tor & (F.hem < 0.005) & (F.z < neckZ - 0.01) & (np.abs(F.x) < 0.06)
        P.mix(hexlin("#8a8c90"), zip_ * 0.85); P.code = np.where(zip_, (P.code & 0xE0) | FAB["metal"], P.code).astype(np.uint8)
        P.h += 0.0012 * zip_ * (0.5 + 0.5 * np.sin(F.z / 0.003 * 2 * math.pi))
        P.seam(np.abs(F.hem - 0.016), F.z, rows=(), mask=(F.front & tor & (np.abs(F.x) < 0.07)).astype(np.float32))
        if F.onArm.any():   # utility pocket on the left upper sleeve
            pm = F.onArm & (F.x > 0) & (np.abs(F.armT - 0.45) < 0.2) & (np.abs(F.armPhi - math.pi * 0.35) < 0.7)
            e = np.maximum(np.abs(F.armT - 0.45) * 0.28 - 0.045, np.abs(F.armPhi - math.pi * 0.35) * 0.05 - 0.028)
            P.seam(np.abs(e), F.armT, rows=(0.003,), mask=(F.onArm & (F.x > 0) & (e < 0.004)).astype(np.float32)); P.h += 0.0015 * (pm & (e < 0))
        for sx in (1, -1):   # slash pockets
            d = np.abs((F.z - (hip + 0.11)) - (np.abs(F.x) - 0.09) * 1.6 * sx * 0 - (np.abs(F.x) - 0.1) * 1.4)
            m = F.front & tor & (F.x * sx > 0.07) & (F.x * sx < 0.14) & (F.z > hip + 0.05) & (F.z < hip + 0.2)
            P.seam(d, F.z, rows=(0.004,), depth=0.0012, dark=0.35, mask=m.astype(np.float32))
        side_d = (np.abs(np.abs(F.theta) - math.pi / 2)) * np.maximum(F.r, 0.08)
        P.seam(side_d, F.z, rows=(0.004,), mask=tor.astype(np.float32))
        P.seam(np.abs(F.armT - 0.06) * 0.28, F.armPhi, rows=(0.004,), mask=(np.abs(F.x) > 0.13).astype(np.float32))
    elif t == "vest":
        back = F.y > F.cy + 0.01
        P.mix(hexlin(g["color"]) * 0.75, back.astype(np.float32)); P.code = np.where(back, (SLOT["outer"] << 5) | FAB["satin"], P.code).astype(np.uint8)
        P.h += folds_band(F, hip + 0.1, 0.05, 0.025, 0.0015, P.seed) * tor; P.crumple(0.0007, 0.05)
        P.band(np.ones_like(F.z), width=0.008, shade=0.9)
        zV = neckZ - 0.25
        z = zV - 0.02
        for k in range(4): P.button(0.0 + 0.0, z - k * 0.055, 0.0062, col=hexlin("#1a1a1c") * 1.5)
        for sx in (1, -1):
            m = F.front & (np.abs(F.x - sx * 0.09) < 0.045) & (np.abs(F.z - (hip + 0.06)) < 0.006)
            P.h -= 0.0012 * m; P.ao *= np.where(m, 0.6, 1.0)
            P.seam(np.abs(F.x - sx * 0.1), F.z, rows=(), depth=0.0006, dark=0.15, mask=(F.front & (F.z < bust + 0.05)).astype(np.float32))
        P.seam(np.abs(F.z - (hip + 0.16)), F.x, rows=(), depth=0.0004, mask=back.astype(np.float32) * (np.abs(F.x) < 0.09))  # back strap
    elif t == "hivis":
        for zc in (bust - 0.02, hip + 0.1):
            m = sm(0.03, 0.024, np.abs(F.z - zc))
            P.mix(hexlin("#c9ccd0"), m); P.code = np.where(m > 0.5, (SLOT["fixed"] << 5) | FAB["metal"], P.code).astype(np.uint8)
            P.seam(np.abs(np.abs(F.z - zc) - 0.027), F.s, rows=(), mask=np.ones_like(F.z))
        P.band(np.ones_like(F.z), width=0.012, shade=0.75)
        P.h += folds_drape(F, bust, hip, 0.1, 0.003, P.seed); P.crumple(0.0015, 0.06)
        text_stamp(P, "CREW", 0.0, bust + 0.04, 0.05, back=True, col="#1a1a1c")
    elif t == "blazer":
        P.h += folds_ring(F, F.armT, 1.0, 0.18, 0.28, 0.025, 0.0024, 1.3, 0.8, F.armPhi, face=-math.pi * 0.5) * F.onArm
        P.h += folds_drape(F, bust, hip - 0.15, 0.1, 0.0015, P.seed) * tor; P.crumple(0.0006, 0.05)
        zV = neckZ - 0.26
        lap = F.front & tor & (F.hem < 0.075) & (F.z > zV)
        P.seam(np.abs(F.hem - 0.07), F.z, rows=(0.004,), depth=0.0014, dark=0.3, mask=lap.astype(np.float32))
        P.h += 0.0018 * lap; P.ao *= np.where(lap, 0.92, 1.0)
        P.button(0.0, zV - 0.03, 0.009, col=hexlin("#1a1a1c")); P.button(0.0, zV - 0.12, 0.009, col=hexlin("#1a1a1c"))
        for sx in (1, -1):
            m = F.front & (np.abs(F.x - sx * 0.1) < 0.06) & (np.abs(F.z - (hip - 0.02)) < 0.022)
            P.h += 0.0012 * m; P.seam(np.abs(F.z - (hip - 0.0)), F.x, rows=(), depth=0.001, dark=0.3, mask=(F.front & (np.abs(F.x - sx * 0.1) < 0.06)).astype(np.float32))
        P.seam(np.abs(F.x - 0.1) + 0 * F.z, F.z, rows=(), depth=0.0004, mask=(F.front & (F.z > bust) & (F.z < bust + 0.03)).astype(np.float32))
        P.band(np.ones_like(F.z), width=0.012, shade=0.95)
        side_d = (np.abs(np.abs(F.theta) - math.pi * 0.62)) * np.maximum(F.r, 0.08)
        P.seam(side_d, F.z, rows=(), mask=tor.astype(np.float32))
        P.seam(np.abs(F.x) + (F.y < F.cy) * 9, F.z, rows=(), mask=(tor & (F.z < hip)).astype(np.float32))   # back vent
    for key in ("LeftArm", "RightArm"):
        a = np.array(L[key], np.float32); d = np.linalg.norm(F.p - (a + np.array([0, 0, -0.07], np.float32)), axis=1)
        P.ao *= 1 - 0.3 * sm(0.11, 0.02, d)

def paint_bottom(P, t, g, L, F, part=None):
    hip = L["hipZ"]; crotch = L["crotchZ"]; topZ = F.z.max()
    denim = g.get("fabric") == "denim"
    thread = hexlin("#c88a3a") if denim and not g.get("undyed") else None
    P.thread = thread
    leg = F.onLeg; hipz = ~leg
    if part == "bib":
        P.noise_dye(0.05, 0.2); P.band(np.ones_like(F.z), width=0.012, shade=0.88)
        for sx in (0.07, -0.07): P.button(sx, F.z.max() - 0.03, 0.009, col=hexlin("#b8954a"))
        m = F.front & (np.abs(F.x) < 0.07) & (np.abs(F.z - (L["bustZ"] - 0.04)) < 0.06)
        e = np.maximum(np.abs(F.x) - 0.065, np.abs(F.z - (L["bustZ"] - 0.04)) - 0.055)
        P.seam(np.abs(e), F.z, rows=(0.004,), mask=(F.front & (e < 0.006)).astype(np.float32))
        return
    if denim:
        base = P.c.copy(); light = np.clip(base * np.array([2.6, 2.4, 2.0], np.float32) + 0.05, 0, 1)
        fade = g.get("fade", 0.5)
        ff = np.zeros_like(F.z)
        ff += leg * sm(0.1, 0.35, F.legT) * sm(0.95, 0.6, F.legT) * (0.5 + 0.5 * np.cos(F.legPhi)) * 0.8           # front thighs
        ff += leg * gauss(F.legT - 1.0, 0.12) * (0.5 + 0.5 * np.cos(F.legPhi)) * 0.7                                  # knees
        ff += hipz * (~F.front) * sm(hip - 0.02, hip - 0.12, F.z) * 0.6                                               # seat
        streak = fbm3(np.stack([F.legT * 2.0, F.s * 30, F.x * 30], 1) if True else F.p, 1.0, 3, P.seed)
        ff *= (0.75 + 0.35 * streak)
        # whiskers: light creases radiating from the crotch over the front upper thighs
        wh = np.zeros_like(F.z)
        for sx in (1, -1):
            o = np.array([sx * 0.025, F.cy - 0.05, crotch + 0.02], np.float32); d = F.p - o
            ang = np.arctan2(d[:, 2], np.abs(d[:, 0])); dist = np.hypot(d[:, 0], d[:, 2])
            m = F.front & (F.x * sx > 0) & (dist < 0.2) & (dist > 0.03)
            for k, a0 in enumerate((0.05, 0.28, 0.5, 0.7)):
                wh += gauss(ang - a0 - 0.05 * np.sin(dist * 40 + k), 0.035) * m * sm(0.2, 0.06, dist) * sm(0.03, 0.06, dist)
        hc = np.zeros_like(F.z)   # honeycombs behind the knees
        for k in range(3):
            hc += leg * gauss(F.legT - 0.97 - 0.035 * k, 0.012) * gauss(np.abs(F.legPhi) - math.pi, 0.7) * (0.6 + 0.4 * np.sin(F.legPhi * 6 + k))
        tot = np.clip(ff * fade + wh * fade * 0.9 + hc * fade * 0.8, 0, 1)
        P.c = base * (1 - tot[:, None] * 0.75) + light * (tot[:, None] * 0.75)
        P.h -= 0.0012 * wh + 0.0015 * hc
        P.mul(1 + 0.08 * fbm3(np.stack([F.legT * 6, F.s * 120, F.z * 2], 1), 1.0, 2, P.seed + 3))   # ring-dye slub streaks
    else:
        P.noise_dye(0.05, 0.2, 0.012)
        if g.get("print"): apply_print(P, g["print"], P.seed)
    # folds
    long_ = F.legT.max() > 1.6
    P.h += folds_ring(F, F.legT, 1.0, 0.09, 0.45, 0.025, 0.0025 if t != "leggings" else 0.0008, 0.7, 0.9, F.legPhi, face=math.pi) * leg
    if long_ and t != "leggings":
        P.h += folds_ring(F, F.legT, 1.86, 0.08, 0.45, 0.022, 0.0035, 2.3, 1.2, F.legPhi) * leg   # ankle stack
    P.h += folds_drape(F, crotch - 0.02, L["ankleZ"], 0.11, 0.0012, P.seed) * leg
    for sx in (1, -1):
        P.h += folds_pull(F, (sx * 0.02, F.cy - 0.05, crotch + 0.02), (sx, 0, 0), 0.25, 0.0012 if t != "leggings" else 0.0006, 0.16, P.seed + 4) * F.front
    P.crumple(0.0008, 0.05)
    # seams: outseam, inseam, crotch, waistband, fly, pockets, hem
    side = np.sign(F.x)
    if t != "leggings" and t != "bikini_bottom":
        P.seam(np.abs(F.legPhi - math.pi / 2) * 0.07, F.legT, rows=(0.005,) if denim else (), mask=leg.astype(np.float32))
        P.seam(np.abs(F.legPhi + math.pi / 2) * 0.06, F.legT, rows=(0.004,) if denim else (), mask=leg.astype(np.float32))
        P.seam(np.abs(F.x), F.z, rows=(0.004,) if denim else (), mask=(hipz & (F.z < hip + 0.06)).astype(np.float32))
        side_d = (np.abs(np.abs(F.theta) - math.pi / 2)) * np.maximum(F.r, 0.08)
        P.seam(side_d, F.z, rows=(), mask=hipz.astype(np.float32))
    elif t == "leggings":
        P.seam(np.abs(F.legPhi + math.pi / 2) * 0.05, F.legT, rows=(0.002,), mask=leg.astype(np.float32))
    wb = (F.z > topZ - 0.06) & (F.hem < 0.05)
    wbw = 0.038 if t not in ("boardshorts", "run_shorts", "leggings", "bikini_bottom", "chef_pants") else 0.03
    P.band(wb.astype(np.float32), width=wbw, shade=0.9, depth=0.0018)
    hem_m = leg & (F.legT > 0.3)
    P.band(hem_m.astype(np.float32), width=0.022 if long_ else 0.018)
    if t in ("jeans", "chinos", "trousers", "cargo_pants", "cargo_shorts", "shorts", "overalls"):
        # belt loops
        for a0 in (-2.4, -1.35, -0.5, 0.5, 1.35, 2.4, math.pi):
            d = np.abs(F.theta - a0) * np.maximum(F.r, 0.08)
            loop = (d < 0.006) & (F.z > topZ - 0.045) & (F.z < topZ - 0.004)
            P.h += 0.0018 * loop; P.ao *= np.where(np.abs(d - 0.007) < 0.0015, 0.8, 1.0) * (1 - 0.0 * loop)
        # fly: J stitch on the front
        fm = F.front & (F.z > crotch + 0.03) & (F.z < topZ - wbw)
        jd = np.where(F.z > crotch + 0.07, np.abs(F.x - 0.032), np.hypot(F.x - 0.0, F.z - (crotch + 0.07)) - 0.032)
        P.seam(jd, F.z, rows=(), depth=0.0005, mask=fm.astype(np.float32) * (F.x > -0.01))
        P.seam(np.abs(F.x - 0.004), F.z, rows=(), depth=0.0012, dark=0.35, mask=fm.astype(np.float32))
        # front pockets: curved openings from the waistband to the side seam
        for sx in (1, -1):
            px = np.abs(F.x) - 0.095; pz = (topZ - wbw) - F.z
            curve = np.hypot(np.maximum(0, px + 0.0) * 1.0, np.maximum(0, pz)) - 0.075
            m = F.front & (F.x * sx > 0.07) & (pz > -0.005) & (pz < 0.11)
            P.seam(np.abs(curve), F.z, rows=(0.005,), depth=0.0012, dark=0.35, mask=m.astype(np.float32))
            P.ao *= np.where(m & (curve < 0) & (curve > -0.006), 0.8, 1.0)
        # back patch pockets
        for sx in (1, -1):
            cxp = sx * 0.085; ztop = topZ - wbw - 0.03
            ex = np.abs(F.x - cxp) - 0.065 + np.clip((ztop - F.z - 0.11) * 0.6, 0, 0.03); ez = np.maximum(F.z - ztop, (ztop - 0.15) - F.z + np.abs(F.x - cxp) * 0.25)
            e = np.maximum(ex, ez); m = (~F.front) & (F.z > ztop - 0.17) & (F.z < ztop + 0.01) & (e < 0.006)
            P.seam(np.abs(e), F.z + F.x, rows=(0.004,) if denim else (), mask=m.astype(np.float32))
            P.h += 0.0008 * ((~F.front) & (e < 0)); P.seam(np.abs(F.z - ztop), F.x, rows=(), depth=0.0003, mask=((~F.front) & (np.abs(F.x - cxp) < 0.066)).astype(np.float32))
    if t in ("cargo_pants", "cargo_shorts"):
        for sx in (1, -1):
            m = leg & (F.x * sx > 0) & (np.abs(F.legPhi - math.pi / 2) < 0.75) & (np.abs(F.legT - 0.6) < 0.2)
            e = np.maximum(np.abs(F.legPhi - math.pi / 2) * 0.07 - 0.05, np.abs(F.legT - 0.6) * 0.45 - 0.08)
            P.seam(np.abs(e), F.legT, rows=(0.004,), mask=(leg & (F.x * sx > 0) & (e < 0.006)).astype(np.float32))
            flap = (e < 0) & (F.legT < 0.46) & (F.x * sx > 0) & leg
            P.h += 0.0015 * flap; P.ao *= np.where(flap & (F.legT > 0.44), 0.7, 1.0)
    if t == "trousers" or g.get("stripe"):
        cm = leg & (np.abs(F.legPhi) < 0.08)
        if t == "trousers" and g.get("fabric") in ("suiting", "uniform"): P.h += 0.0012 * gauss(F.legPhi, 0.03) * leg; P.mul(1 + 0.06 * gauss(F.legPhi, 0.03) * leg)
        if g.get("stripe"): P.mix(hexlin("#c9a043"), leg * gauss(F.legPhi - math.pi / 2, 0.08) * 0.85)
    if t == "boardshorts":
        lace = F.front & (np.abs(F.x) < 0.012) & (F.z > topZ - 0.05)
        P.mix(hexlin("#f0ede6"), lace * 0.8 * (0.5 + 0.5 * np.sin(F.z / 0.006 * 6.28)))
    if t == "run_shorts":
        P.band(leg.astype(np.float32), width=0.01, shade=0.8)
    # ambient occlusion: crotch, inner thighs, under the waistband
    d = np.linalg.norm(F.p - np.array([0, F.cy, crotch], np.float32), axis=1); P.ao *= 1 - 0.35 * sm(0.12, 0.02, d)
    P.ao *= 1 - 0.25 * leg * gauss(F.legPhi + math.pi / 2, 0.5) * sm(0.6, 0.1, F.legT)

def paint_skirt(P, t, g, L, F, part):
    hip = L["hipZ"]
    P.noise_dye(0.05, 0.2, 0.015)
    if g.get("print"): apply_print(P, g["print"], P.seed)
    flare = t in ("sundress",) or part == "skirt" and t == "sundress"
    P.h += folds_drape(F, F.z.max() - 0.03, F.z.min() - 0.05, 0.05 if flare else 0.08, 0.004 if flare else 0.0018, P.seed)
    if t in ("knit_dress", "mini_skirt", "pencil_skirt", "slip_dress"):
        P.h += folds_band(F, hip - 0.03, 0.06, 0.03, 0.0012, P.seed + 1) * (1 - F.front * 0.5)
    if t == "knit_dress": P.h += 0.0004 * np.sin(F.s / 0.006 * 2 * math.pi)
    P.crumple(0.0008 if t != "mini_skirt" else 0.0014, 0.05)
    P.band((F.z < F.z.min() + 0.05).astype(np.float32), width=0.02 if t != "slip_dress" else 0.008)
    top = (F.z > F.z.max() - 0.05).astype(np.float32)
    if t in ("mini_skirt", "pencil_skirt", "apron"): P.band(top, width=0.03, shade=0.88)
    side_d = (np.abs(np.abs(F.theta) - math.pi / 2)) * np.maximum(F.r, 0.08)
    P.seam(side_d, F.z, rows=(), mask=np.ones_like(F.z))
    if t == "pencil_skirt":
        P.seam(np.abs(F.x) + F.front * 9, F.z, rows=(0.003,), mask=(F.z < F.z.min() + 0.15).astype(np.float32))
    if t == "apron":
        m = (np.abs(F.x) < 0.1) & (np.abs(F.z - (hip - 0.12)) < 0.07)
        e = np.maximum(np.abs(F.x) - 0.095, np.abs(F.z - (hip - 0.12)) - 0.065)
        P.seam(np.abs(e), F.z, rows=(0.004,), mask=(e < 0.006).astype(np.float32))
        P.seam(np.abs(F.x), F.z, rows=(), mask=m.astype(np.float32))
    if t == "mini_skirt":
        zipm = (~F.front) & (np.abs(F.x) < 0.005) & (F.z > F.z.max() - 0.15)
        P.mix(hexlin("#6a6c70"), zipm * 0.8)

def paint_hat(P, hs, L, F, part):
    if part == "brim":
        P.noise_dye(0.04, 0.1)
        for k in range(5):
            r = np.hypot(F.x - L["Head"][0], F.y - (L["Head"][1] - 0.0)); P.seam(np.abs(r - (0.12 + k * 0.012)), F.x, rows=(), depth=0.0004, mask=np.ones_like(F.z))
        return
    top = F.z.max()
    if hs["type"] == "beanie":
        P.noise_dye(0.04, 0.12, 0.03)
        P.h += 0.0003 * np.sin(F.theta * 70) * (1 - sm(top - 0.04, top, F.z))
        if not hs.get("skull"):
            cuff = F.hem < 0.05
            P.h += 0.0025 * sm(0.052, 0.046, F.hem); P.ao *= np.where(np.abs(F.hem - 0.05) < 0.003, 0.65, 1.0)
            P.h += 0.0002 * np.sin(F.theta * 90) * cuff
        P.h += 0.0015 * np.sin(F.theta * 6) * sm(top - 0.03, top, F.z)
    else:
        P.noise_dye(0.04, 0.12)
        for k in range(6):
            a0 = -math.pi + k * math.pi / 3 + math.pi / 6
            d = np.abs(np.angle(np.exp(1j * (F.theta - a0)))) * np.maximum(np.hypot(F.x, F.y - L["Head"][1]), 0.02)
            P.seam(d, F.z, rows=(0.003,), mask=sm(top - 0.12, top - 0.03, F.z))
        btn = sm(0.009, 0.006, np.hypot(F.x - L["Head"][0], F.y - L["Head"][1] - 0.01)) * (F.z > top - 0.01)
        P.mix(P.c.mean(0) * 0.8, btn); P.h += 0.002 * btn
        P.band(np.ones_like(F.z), width=0.012, shade=0.85)
        if hs.get("police"):
            d = np.hypot(F.x, F.z - (top - 0.055)); ang = np.arctan2(F.z - (top - 0.055), F.x)
            badge = sm(0.022, 0.019, d * (1 + 0.15 * np.cos(ang * 5))) * F.front
            P.mix(hexlin("#c9a043"), badge); P.code = np.where(badge > 0.5, (P.code & 0xE0) | FAB["metal"], P.code).astype(np.uint8)

# ------------------------------------------------------------------ skin, scalp hair, beards, make-up
def ndi_soft(vals, F, mask):
    """blur a per-texel value inside the piece's raster (soft mask edges, ~3 px)"""
    H, W = mask.shape; img = np.zeros((H, W), np.float32); img[mask] = vals; m = mask.astype(np.float32)
    b = ndi.gaussian_filter(img, 2.0); n = ndi.gaussian_filter(m, 2.0)
    return (b / np.maximum(n, 1e-3))[mask]

def head_frame(L, Fb):
    """nose tip, mouth, chin, eye line from the head geometry"""
    head = np.array(L["Head"], np.float32); top = L["topZ"]
    hm = (Fb.z > head[2] + 0.02) & (np.abs(Fb.x) < 0.03)
    tip = Fb.p[hm][np.argmin(Fb.y[hm])] if hm.any() else head + np.array([0, -0.1, 0.07], np.float32)
    eyeZ = (L["eyeL"][2] + L["eyeR"][2]) / 2 if "eyeL" in L else tip[2] + 0.035
    return head, top, tip, eyeZ

def paint_skin(alb, hgt, code, Fb, mask, L, spec, W, H):
    head, top, tip, eyeZ = head_frame(L, Fb)
    hair = spec["hair"]; style = hair["style"]; trim = hair.get("trim"); hc = hexlin(hair["color"])
    x, y, z = Fb.x - head[0], Fb.y - head[1], Fb.z
    hz = z > head[2] - 0.05                                   # head and neck top
    ang = np.arctan2(x, -(y + 0.0))                           # 0 = face front
    # hair line height around the head (front high, ears low, nape lowest)
    ca = np.cos(ang)
    hl = np.where(ca > 0, eyeZ + 0.052 + 0.012 * ca, eyeZ + 0.052 - (eyeZ + 0.052 - (eyeZ - 0.085)) * np.clip(-ca, 0, 1) ** 1.2)
    side = np.abs(np.sin(ang)) ** 4
    hl = hl - side * 0.035 * (ca > -0.3)                      # sideburn / around the ears
    ears = (np.abs(x) > 0.07) & (np.abs(z - (eyeZ - 0.03)) < 0.02) & (y > 0.0) & (y < 0.026)
    scalp = hz & (z > hl) & ~ears
    dens = sm(hl, hl + 0.012, z) * hz * ~ears
    # clean the photo hair off the scalp: replace with forehead skin
    fh = hz & (np.abs(z - (eyeZ + 0.03)) < 0.01) & (np.abs(x) < 0.03) & (y < -0.05)
    skin_ref = alb[mask][fh].mean(0) if fh.any() else alb[mask].mean(0)
    cur = alb[mask]
    n = fbm3(Fb.p, 0.02, 3, 3)
    clean = skin_ref * (0.97 + 0.05 * n[:, None])
    k = np.clip(dens * 1.2, 0, 1)
    cur = cur * (1 - k[:, None]) + clean * k[:, None]
    # hair density: full under hair cards, fades, shaved
    soft_h = fbm3(Fb.p, 0.005, 2, 41) * 0.5 + 0.5
    fine = vnoise3(Fb.p / 0.0016, 21) * 0.5 + 0.5; strands = vnoise3(np.stack([Fb.p[:, 0] / 0.0012, Fb.p[:, 1] / 0.0012, Fb.p[:, 2] / 0.008], 1), 23) * 0.5 + 0.5
    if style == "none" or trim == "shaved":
        d = dens * (0.22 + 0.2 * fine)
    elif trim == "fade":
        fz = sm(top - 0.16, top - 0.07, z)                       # 0 at the low fade line .. 1 on top
        d = dens * np.clip(0.62 + 0.38 * fz, 0, 1) * (0.82 + 0.18 * soft_h)
        d = np.maximum(d, dens * 0.15 * fine)
    else:
        d = dens * (0.75 + 0.25 * strands)
    hcol = hc * (0.85 + 0.3 * strands[:, None])
    cur = cur * (1 - d[:, None] * 0.92) + hcol * (d[:, None] * 0.92)
    ccode = np.where(d > 0.45, FAB["hair"], 0)
    # beards and stubble
    beard = spec.get("beard")
    fz = (y < 0.02) & hz & (z < tip[2] + 0.01) & (z > tip[2] - 0.14)
    jaw = fz & (np.abs(x) < 0.075)
    if beard:
        mouth_z = tip[2] - 0.035
        lip = gauss(np.abs(x) / 1.0, 0.025) * gauss(z - (mouth_z), 0.007)       # leave the lips clear
        cheek_line = tip[2] - 0.02 - 0.03 * (np.abs(x) / 0.07)
        region = jaw & (z < cheek_line)
        if beard == "mustache": region = fz & (np.abs(x) < 0.03) & (z > mouth_z + 0.004) & (z < mouth_z + 0.02)
        if beard == "goatee": region = (fz & (np.abs(x) < 0.028) & (z < mouth_z + 0.02)) & ~((z > mouth_z - 0.006) & (z < mouth_z + 0.004))
        amt = {"stubble": 0.3, "full": 0.72, "goatee": 0.7, "mustache": 0.7}[beard]
        neck_ext = (z > head[2] - 0.04) & (z < tip[2] - 0.09) & (y < 0.0) & (np.abs(x) < 0.06) & (beard in ("stubble", "full"))
        edge = sm(0.0, 0.012, np.minimum(np.abs(z - cheek_line), 0.05)) if beard in ('full', 'stubble') else 1.0
        soft = fbm3(Fb.p, 0.006, 2, 31) * 0.5 + 0.5
        # soft-edged mask (cheek line on top, fading down the neck), then per-texel hair grain
        top_e = sm(0.0, 0.014, cheek_line - z) if beard in ("full", "stubble") else 1.0
        neck_e = sm(tip[2] - 0.14, tip[2] - 0.095, z)
        reg = (region | neck_ext).astype(np.float32)
        reg = np.clip(ndi_soft(reg, Fb, mask), 0, 1)
        grain = np.random.RandomState(7).rand(len(z)).astype(np.float32)
        base = reg * top_e * neck_e * amt * (0.8 + 0.2 * soft)
        bd = np.clip(base * (0.45 + 0.75 * grain), 0, 1) * (1 - np.clip(lip * 2, 0, 1) * (beard != "mustache"))
        bd = bd * sm(0.0, 0.01, np.abs(z - (mouth_z)) + 0.004)
        bc = hc * (0.75 + 0.5 * grain[:, None])
        cur = cur * (1 - bd[:, None] * 0.85) + bc * (bd[:, None] * 0.85)
        ccode = np.where(bd > 0.5, FAB["hair"], ccode)
    mk = spec.get("makeup")
    if mk:
        mouth_z = tip[2] - 0.036
        lips = gauss(np.abs(x), 0.021) * gauss(z - mouth_z, 0.0075) * (y < -0.03) * hz
        lc = hexlin("#9c3a4a" if mk == "evening" else "#b85a5a")
        cur = cur * (1 - lips[:, None] * 0.55) + lc * cur.mean(1, keepdims=True) * 2.4 * (lips[:, None] * 0.55)
        if "eyeL" in L:
            for e in (L["eyeL"], L["eyeR"]):
                de = np.hypot(Fb.x - e[0], (Fb.z - e[2] - 0.006) * 1.6) * (Fb.y < e[1] + 0.01)
                sh = gauss(de, 0.016 if mk == "evening" else 0.012) * hz * (Fb.z > e[2] - 0.004)
                cur = cur * (1 - sh[:, None] * (0.45 if mk == "evening" else 0.2)) + cur * np.array([0.55, 0.45, 0.5], np.float32) * (sh[:, None] * (0.45 if mk == "evening" else 0.2))
        blush = gauss(np.abs(x) - 0.045, 0.015) * gauss(z - (tip[2] - 0.005), 0.015) * (y < -0.02) * hz
        cur = cur * (1 - blush[:, None] * 0.15) + cur * np.array([1.15, 0.85, 0.85], np.float32) * (blush[:, None] * 0.15)
    alb[mask] = cur
    c2 = code[mask]; c2 = np.where(ccode > 0, ccode, c2); code[mask] = c2.astype(np.uint8)
    return scalp

# ------------------------------------------------------------------ main
def normal_from(hgt, mpp, owner, valid):
    """tangent-space normal from a height field (m), finite differences only inside one piece"""
    H, W = hgt.shape
    def diff(axis):
        a = np.roll(hgt, -1, axis); b = np.roll(hgt, 1, axis); oa = np.roll(owner, -1, axis); ob = np.roll(owner, 1, axis)
        okA = (oa == owner) & valid; okB = (ob == owner) & valid
        d = np.where(okA & okB, (a - b) * 0.5, np.where(okA, a - hgt, np.where(okB, hgt - b, 0.0)))
        return d / np.maximum(mpp, 1e-4)
    dx = diff(1); dy = diff(0)
    n = np.stack([-dx, dy, np.ones_like(hgt)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n

def paint(spec, d, mhd, out):
    names = [json.loads(str(n)) for n in d["names"]]; L = json.loads(str(d["landmarks"])); outer = bool(d["outer"])
    W = 2048 if outer else 1024; H = 1024; page = H
    alb = np.zeros((H, W, 3), np.float32); hgt = np.zeros((H, W), np.float32); ao = np.ones((H, W), np.float32)
    code = np.zeros((H, W), np.uint8); owner = np.full((H, W), -1, np.int16); mppm = np.full((H, W), 0.003, np.float32)
    # skin: the MakeHuman photo texture for this age / ancestry, toned
    sd = os.path.join(mhd, "skins", spec["skin"]); sf = next(f for f in os.listdir(sd) if f.endswith(".png"))
    sk = srgb2lin(np.asarray(Image.open(os.path.join(sd, sf)).convert("RGB").resize((page, page), Image.LANCZOS), np.float32) / 255)
    tone = np.array(TONES[spec["tone"]], np.float32)
    lum = sk.mean(2, keepdims=True); sk = lum + (sk - lum) * 0.84                    # a touch less saturated (MakeHuman skins run pink)
    sk = sk * tone
    alb[:, :page] = sk
    # skin high-pass relief (wrinkles, pores in the photo) at 1 px
    L1 = sk.mean(2); hp = L1 - ndi.gaussian_filter(L1, 2.0)
    hgt[:, :page] = hp / max(1e-4, L1.mean()) * 0.00045
    ao[:, :page] = 1.0
    # body pieces
    order = []
    for i, nm in enumerate(names):
        key = "p%d" % i
        if nm["type"] == "skin": continue
        t = nm["type"]; layer = nm["layer"]
        g = next((x for x in spec["garments"] if x["type"] == t), None) or (spec.get("hat") if nm.get("part") in ("crown", "brim") else None) or {"type": t, "color": SHOE_COL.get(t, "#202020"), "fabric": "leather"}
        tucked = any(TOPS_TUCK(x) for x in spec["garments"])
        z = 1
        if t in BOTTOM_T or nm.get("part") == "bib": z = 0 if not tucked else 2
        if t in TOP_T: z = 1 if not TOPS_TUCK(g) else 0
        if layer == "outer": z = 3
        order.append((z, i, key, nm, g))
    # skin first (positions for the scalp, beard, make-up), lowsrc feet for painted shoes
    Fb, mb = piece_fields(d, "p0", W, H, L)
    scalp = paint_skin(alb, hgt, code, Fb, mb, L, spec, W, H)
    owner[mb] = 0; mppm[mb] = Fb.mpp
    Fl, ml = piece_fields(d, "p1", W, H, L)
    if Fl is not None:
        feet = (Fl.z < L["ankleZ"] + 0.035) & (np.abs(Fl.x) > 0.02)
        if spec["shoes"] not in ("flipflops", "sandals"):
            sc = hexlin(SHOE_COL.get(spec["shoes"], "#202020")); sole = hexlin("#e9e6dc" if spec["shoes"].startswith("sneaker") else "#1a1a1a")
            fl = np.zeros(ml.sum(), bool); fl[:] = feet
            cur = alb[ml]; cur[fl] = sc * (0.9 + 0.1 * vnoise3(Fl.p[fl] / 0.01, 4)[:, None]); cur[fl & (Fl.z < 0.022 + (L["minZ"] if "minZ" in L else 0))] = sole
            alb[ml] = cur; c2 = code[ml]; c2[fl] = (SLOT["shoe"] << 5) | FAB["leather"]; code[ml] = c2
            o2 = owner[ml]; o2[fl] = 1; owner[ml] = o2
    for z, i, key, nm, g in sorted(order):
        F, m = piece_fields(d, key, W, H, L)
        if F is None: continue
        t = nm["type"]; part = nm.get("part")
        col = hexlin(g.get("color", "#808080")) if part not in ("sole", "heel", "strap", "pump") else hexlin(SHOE_COL.get(t, "#404040"))
        fab = g.get("fabric") or "jersey"
        slot = "outer" if nm["layer"] == "outer" else "top" if (t in TOP_T or part == "bodice") else "bottom" if (t in BOTTOM_T or t in ("mini_skirt", "pencil_skirt") or part == "skirt") else "hat" if part in ("crown", "brim") else "shoe" if part in ("sole", "heel", "strap", "pump") else "fixed"
        if fab == "denim" and not g.get("undyed"): slot = "fixed"
        if part in ("sole", "heel", "strap", "pump"): fab = "patent" if t.startswith("heels") else "leather" if part != "sole" else "rubber"
        Pt = Paint(F, col, fab, slot, seed=i * 7 + 1)
        if part in ("crown", "brim"): paint_hat(Pt, g, L, F, part)
        elif t in TOP_T or part == "bodice": paint_top(Pt, t if part != "bodice" else t + "_top", g, L, F, TOPS_TUCK(g))
        elif t in OUTER_T: paint_outer(Pt, t, g, L, F)
        elif t in BOTTOM_T or part == "bib": paint_bottom(Pt, t, g, L, F, part)
        elif part == "skirt" or t in ("mini_skirt", "pencil_skirt", "apron"): paint_skirt(Pt, t, g, L, F, part)
        elif part in ("sole", "heel", "strap", "pump"):
            Pt.noise_dye(0.04, 0.05)
            if part == "sole" and t == "sandals": Pt.mix(hexlin("#c8a878"), sm(0.9, 1.0, (F.z - F.z.min()) / max(1e-3, np.ptp(F.z))))
            if part == "pump": Pt.band(np.ones_like(F.z), width=0.004, shade=0.8, stitch=False)
        # write (overwrite in z-order)
        alb[m] = Pt.c; hgt[m] = Pt.h; ao[m] = np.clip(Pt.ao, 0.2, 1); code[m] = Pt.code; owner[m] = i; mppm[m] = F.mpp
        grow = ndi.binary_dilation(m, iterations=2) & ~m & (owner <= 0)
        if grow.any():
            ii = ndi.distance_transform_edt(~m, return_distances=False, return_indices=True)
            gy, gx = np.nonzero(grow); sy, sx = ii[0][gy, gx], ii[1][gy, gx]
            alb[gy, gx] = alb[sy, sx]; code[gy, gx] = code[sy, sx]; ao[gy, gx] = ao[sy, sx]
    valid = owner >= 0
    nrm = normal_from(hgt, mppm, owner, valid)
    # cavity AO from the height field, dilate everything into the gutters
    cav = np.clip(1 + (hgt - ndi.gaussian_filter(hgt, 3)) * 160, 0.6, 1.1)
    ao = np.clip(ao * cav, 0.15, 1.0)
    from texlib import dilate_fill
    alb_s = lin2srgb(alb)
    vm = valid | np.zeros_like(valid)
    vm[:, :page] |= True                                       # page 1 keeps the full skin layout
    alb_s = dilate_fill(alb_s, vm, 16)
    nrm = dilate_fill(nrm * 0.5 + 0.5, valid, 16)
    ao = dilate_fill(ao, valid, 16)
    code_f = code.copy(); idx = ndi.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    code_f = code[idx[0], idx[1]]
    os.makedirs(out, exist_ok=True)
    rgba = np.concatenate([alb_s, code_f[..., None].astype(np.float32) / 255], -1)
    save_img(rgba, os.path.join(out, spec["id"] + "_a.webp"), quality=90)
    nmap = np.concatenate([nrm[..., :2], ao[..., None]], -1)
    small = np.asarray(Image.fromarray((np.clip(nmap, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((W // 2, H // 2), Image.BOX), np.float32) / 255
    save_img(small, os.path.join(out, spec["id"] + "_n.webp"), quality=92)
    return W, H

def TOPS_TUCK(g):
    return g.get("type") in ("dress_shirt", "rolled_shirt", "police_shirt", "blouse") and g.get("type") != "blouse" or g.get("tucked", False)

if __name__ == "__main__":
    specs = json.load(open(sys.argv[1])); work, out, mhd = sys.argv[2], sys.argv[3], sys.argv[4]
    only = set(sys.argv[5].split(",")) if len(sys.argv) > 5 and sys.argv[5] else None
    import time
    for s in specs:
        if only and s["id"] not in only: continue
        f = os.path.join(work, s["id"] + ".npz")
        if not os.path.exists(f): print("missing", f); continue
        t0 = time.time()
        W, H = paint(s, np.load(f, allow_pickle=False), mhd, out)
        print("painted", s["id"], W, H, round(time.time() - t0, 1), "s"); sys.stdout.flush()
