# Port Solana V2 — Nico skin, eye and far-LOD textures (CHARACTER track).
#   python3 nico_textures.py <workdir with nico_mesh.npz> <source skin png (MakeHuman CC0)> <outdir> [head|body|eyes|far|all] [size]
# The CC0 MakeHuman skin is only the painting base: it is regraded to Nico's complexion and everything that makes the
# face his is painted here in code, in 3D-aware UV space: brows (with the scar), stubble, scalp and fade, pores, lip
# lines, moles, color zones, body hair, plus normal / roughness / thickness / effect masks.
# Outputs (glTF UV convention, flipY=false): head_albedo, head_normal, head_m1 (R AO, G roughness, B thickness),
#   head_m2 (R sweat zone, G flush/sunburn zone, B lips), body_* likewise (m2.B = usually-covered zone for tan lines),
#   eye_iris, eye_sclera, skin_far (original MakeHuman layout, one map for far LODs).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy import ndimage as ndi
from texlib import *

WORK, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
WHAT = sys.argv[4] if len(sys.argv) > 4 else "all"
SZ = int(sys.argv[5]) if len(sys.argv) > 5 else 4096
os.makedirs(OUT, exist_ok=True)
d = np.load(os.path.join(WORK, "nico_mesh.npz"))
co, vn, ao = d["co"], d["vn"], d["ao"]
pf, pl, head_poly = d["polys_flat"], d["poly_len"], d["head_poly"]
WN = list(d["weights_names"]); WT = d["weights"]
def wsum(*names):
    out = np.zeros(len(co), dtype=np.float32)
    for i, n in enumerate(WN):
        if any(k in n for k in names): out += WT[i]
    return out
EYE_L, EYE_R = d["eyeL"], d["eyeR"]
rs = np.random.RandomState(11)

# Nico's palette (sRGB 0..1)
SKIN_GAIN = np.array([0.66, 0.535, 0.455], dtype=np.float32)       # linear gain from the light CC0 base to olive tan
HAIR = np.array([0.050, 0.032, 0.020], dtype=np.float32)           # linear, near-black warm brown
def loop_vert_attr(a): return a[pf]                                  # per-loop copy of a per-vertex attribute

def jacobian(P, mask):
    dPdx = (np.roll(P, -1, 1) - np.roll(P, 1, 1)) * 0.5; dPdy = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) * 0.5
    ok = mask & np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1)
    return dPdx, dPdy, ok

def hair_strokes(density, ok, dPdx, dPdy, n, dir_fn, len_m, width_px, alpha=(0.6, 1.0), curve=0.18, jitter=0.35, seed=1, P=None, N=None):
    """Sample hair roots with probability ~ density * skin area and build bezier strokes that follow a 3D direction field."""
    r = np.random.RandomState(seed)
    area = np.linalg.norm(np.cross(dPdx, dPdy), axis=-1)
    w = (density * area * ok).astype(np.float64).ravel(); tot = w.sum()
    if tot <= 0 or n <= 0: return np.zeros((0, 9))
    idx = r.choice(w.size, size=n, p=w / tot)
    ys, xs = np.unravel_index(idx, density.shape)
    p = P[ys, xs]; nn = N[ys, xs]; tx = dPdx[ys, xs].astype(np.float64); ty = dPdy[ys, xs].astype(np.float64)
    dv = dir_fn(p, nn).astype(np.float64)
    dv += r.randn(n, 3) * jitter * np.linalg.norm(dv, axis=1, keepdims=True)
    dv -= nn * (dv * nn).sum(1, keepdims=True)                        # keep in the tangent plane
    dv /= np.linalg.norm(dv, axis=1, keepdims=True) + 1e-12
    a11 = (tx * tx).sum(1); a12 = (tx * ty).sum(1); a22 = (ty * ty).sum(1); b1 = (tx * dv).sum(1); b2 = (ty * dv).sum(1)
    det = a11 * a22 - a12 * a12 + 1e-30
    du = (a22 * b1 - a12 * b2) / det; dvv = (a11 * b2 - a12 * b1) / det      # pixels per meter along the hair
    L = (len_m(p, r) if callable(len_m) else np.full(n, len_m)) * (0.75 + 0.5 * r.rand(n))
    x0 = xs + r.rand(n); y0 = ys + r.rand(n); x1 = x0 + du * L; y1 = y0 + dvv * L
    px, py = -(y1 - y0), (x1 - x0); c = (r.rand(n) - 0.5) * 2 * curve
    cx = (x0 + x1) / 2 + px * c; cy = (y0 + y1) / 2 + py * c
    wd = (width_px(p, r) if callable(width_px) else np.full(n, width_px)) * (0.8 + 0.4 * r.rand(n))
    al = alpha[0] + (alpha[1] - alpha[0]) * r.rand(n); sh = 0.75 + 0.5 * r.rand(n)
    return np.stack([x0, y0, cx, cy, x1, y1, wd, al, sh], 1)

def blob(P, c, r):
    return np.exp(-(((P - np.asarray(c, dtype=np.float32)) ** 2).sum(-1)) / (r * r))
def blob2(P, c, r):                                                   # mirrored left/right
    c = np.asarray(c, dtype=np.float32); c2 = c * np.array([-1, 1, 1], dtype=np.float32)
    return np.maximum(blob(P, c, r), blob(P, c2, r))

# ================================================================== HEAD
def paint_head():
    print("[tex] head: raster"); sys.stdout.flush()
    tv, tuv = tri_data(co, pf, pl, d["uv_head"], sel=head_poly)
    _, tuvo = tri_data(co, pf, pl, d["uv_body"], sel=head_poly)
    uvg = tuv.copy(); uvg[..., 1] = 1 - uvg[..., 1]
    attr = np.concatenate([co[tv], vn[tv], tuvo, ao[tv][..., None]], -1)
    maps, mask = raster(uvg, attr, SZ)
    P = maps[..., 0:3]; N = maps[..., 3:6]; N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
    UVO = maps[..., 6:8]; AO = maps[..., 8]
    src = load_rgb(SRC); S = src.shape[0]
    base = bilinear(src, UVO[..., 0] * S, (1 - UVO[..., 1]) * S)
    dPdx, dPdy, ok = jacobian(P, mask)
    ppm = 1.0 / (0.5 * (np.linalg.norm(dPdx, axis=-1) + np.linalg.norm(dPdy, axis=-1)) + 1e-9)     # pixels per meter
    print("[tex] head px/mm median", round(float(np.median(ppm[ok]) / 1000), 2)); sys.stdout.flush()
    x, y, z = P[..., 0], P[..., 1], P[..., 2]; ax = np.abs(x)
    lab, nlab = ndi.label(mask); sizes = ndi.sum(mask, lab, range(1, nlab + 1)); main = lab == (1 + int(np.argmax(sizes)))
    full_mask = mask; mask = main; ok = ok & main                      # paint on the outer head only; inner islands keep the regraded base

    # ---- regions (3D)
    lum_s = base.mean(-1); red = base[..., 0] / (base[..., 1] + 1e-4)
    red_n = red - ndi.gaussian_filter(red, 40 * SZ / 4096)
    mouth_box = (ax < 0.036) & (z > 1.592) & (z < 1.630) & (y < -0.135)
    lips = smooth(0.035, 0.11, red_n) * mouth_box; lips = ndi.gaussian_filter(lips.astype(np.float32), 2.0 * SZ / 4096)
    ear = (ax > 0.071) & (z > 1.640) & (z < 1.716) & (y > -0.066) & (y < 0.004)
    Cc = np.array([0, -0.045, 1.715], dtype=np.float32)
    dd = P - Cc; az = np.degrees(np.arctan2(np.abs(dd[..., 0]), -dd[..., 1])); el = np.degrees(np.arctan2(dd[..., 2], np.hypot(dd[..., 0], dd[..., 1])))
    edge_n = fbm(SZ, 26 * SZ / 4096, 3, seed=5) * 3.2 + fbm(SZ, 5 * SZ / 4096, 2, seed=6) * 1.6      # irregular hairline (degrees)
    hl_az = np.array([0, 14, 28, 44, 58, 68, 76, 88, 93, 104, 118, 140, 180], dtype=np.float32)
    hl_el = np.array([23, 23, 25, 29, 24, 8, -28, -30, -7, -9, -30, -44, -48], dtype=np.float32)
    hl = np.interp(az, hl_az, hl_el)
    hair_d = (el - hl + edge_n)                                        # degrees above the hairline
    scalp = smooth(-1.0, 3.5, hair_d) * (~ear) * mask
    # hair length over the scalp (m): skin fade low on the sides and nape, longer above
    fade = smooth(0, 26, hair_d) * (0.35 + 0.65 * smooth(60, 30, az))
    top_zone = smooth(8, 30, el) * smooth(3, 14, hair_d)             # where the long hair cards root
    # beard / stubble zone
    t = np.clip((y + 0.06) / (-0.15 + 0.06), 0, 1); zline = 1.668 + (1.631 - 1.668) * t
    cheek = smooth(0.004, -0.010, z - zline) * smooth(-0.022, -0.045, y)
    must = ((ax < 0.036) & (y < -0.138)) * smooth(1.6135, 1.618, z) * smooth(1.637, 1.630, z) * (1 - 0.55 * blob(P, (0, -0.172, 1.624), 0.006))
    neck_f = smooth(1.497, 1.545, z)
    beard = np.clip(np.maximum(cheek * neck_f, must), 0, 1) * (1 - np.clip(lips * 3, 0, 1)) * (~ear) * mask
    dens = 0.50 + 0.5 * np.maximum(blob(P, (0, -0.150, 1.575), 0.035), must) + 0.25 * smooth(1.625, 1.60, z) * smooth(0.02, 0.05, ax)
    dens *= 1 - 0.55 * smooth(1.60, 1.648, z) * smooth(0.035, 0.05, ax)       # sparse high on the cheeks
    dens *= 0.55 + 0.45 * smooth(1.53, 1.56, z)                               # sparser down the neck
    dens *= 1 - 0.5 * blob2(P, (0.021, -0.150, 1.602), 0.008)                 # thin patch beside the lower lip
    beard_d = beard * np.clip(dens, 0, 1.2) * (0.8 + 0.3 * fbm(SZ, 30 * SZ / 4096, 2, seed=9))
    # brows: around the MakeHuman brow strip, our own shape
    bc = d["brows_co"]
    def brow_field(side):
        b = bc[bc[:, 0] * side > 0]; o = b[np.argsort(np.abs(b[:, 0]))]
        inner = o[:6].mean(0); outer = o[-6:].mean(0); mid = b.mean(0)
        return inner, mid, outer
    brow = np.zeros((SZ, SZ), dtype=np.float32); brow_t = np.zeros((SZ, SZ), dtype=np.float32); BF = {}
    for side in (1, -1):
        inner, mid, outer = brow_field(side); BF[side] = (inner, mid, outer)
        axv = outer - inner; L = np.linalg.norm(axv); axn = axv / L
        tt = ((P - inner) @ axn) / L                                    # 0 inner .. 1 outer
        arc = mid + (inner + axv * 0.5 - mid) * 0                       # centre line: quadratic through inner, mid, outer
        cz = inner[2] + (outer[2] - inner[2]) * tt + 4 * (mid[2] - (inner[2] + outer[2]) / 2) * tt * (1 - tt) + 0.0015
        half = 0.0052 * (1 - 0.55 * smooth(0.45, 1.05, tt)) * smooth(-0.10, 0.03, tt) * smooth(1.10, 0.98, tt)
        m = smooth(1.0, 0.55, np.abs(z - cz) / (half + 1e-5)) * (x * side > 0) * (y < -0.10) * (tt > -0.12) * (tt < 1.12)
        brow = np.maximum(brow, m); brow_t = np.where(m > 0, tt, brow_t)
    # the scar: a pale diagonal nick through the outer third of the left brow (character's left = +x)
    inner, mid, outer = BF[1]
    sc_c = inner + (outer - inner) * 0.66 + np.array([0, -0.002, 0.001]); sc_dir = np.array([0.35, 0, 1.0]); sc_dir /= np.linalg.norm(sc_dir)
    rel = P - sc_c.astype(np.float32); along = rel @ sc_dir.astype(np.float32); perp = np.sqrt(np.maximum(((rel ** 2).sum(-1) - along ** 2), 0))
    scar = smooth(0.0011, 0.0004, perp) * smooth(0.0085, 0.006, np.abs(along)) * (x > 0) * (y < -0.10)
    brow = brow * (1 - scar)

    # ---- albedo
    print("[tex] head: albedo"); sys.stdout.flush()
    lin = srgb2lin(base) * SKIN_GAIN
    # even out the baked scalp tint of the source (we paint our own hair) by pulling the scalp toward the forehead tone
    fh = lin[(blob(P, (0, -0.155, 1.745), 0.02) > 0.5) & mask].mean(0)
    k = (scalp * 0.85)[..., None]; lin = lin * (1 - k) + (fh * (0.9 + 0.1 * (lum_s / (lum_s[mask].mean() + 1e-6)))[..., None]) * k
    # zones: flush on cheeks, nose, ears; warm forehead; cool, darker eye sockets; beard shadow
    flush = np.clip(0.75 * blob2(P, (0.048, -0.135, 1.650), 0.026) + 0.9 * blob(P, (0, -0.172, 1.645), 0.016) + 0.7 * ear + 0.35 * blob(P, (0, -0.152, 1.578), 0.02), 0, 1)
    flush *= 0.75 + 0.5 * fbm(SZ, 60 * SZ / 4096, 3, seed=2)
    lin *= 1 + flush[..., None] * np.array([0.10, -0.10, -0.10], dtype=np.float32)
    sock = blob2(P, (0.031, -0.142, 1.682), 0.017) * smooth(1.70, 1.69, z)
    lin *= 1 - sock[..., None] * np.array([0.16, 0.14, 0.08], dtype=np.float32)
    lin *= 1 + (blob(P, (0, -0.150, 1.745), 0.045) * 0.05)[..., None] * np.array([1, 0.9, 0.5], dtype=np.float32)
    # mottling: large soft melanin variation + fine speckle
    mot = fbm(SZ, 90 * SZ / 4096, 4, seed=3); fine = fbm(SZ, 2.2 * SZ / 4096, 2, seed=4)
    lin *= (1 + 0.055 * mot + 0.035 * fine)[..., None]
    lin *= 1 + (fbm(SZ, 40 * SZ / 4096, 3, seed=12) * 0.04)[..., None] * np.array([1, -0.3, -0.6], dtype=np.float32)
    # lips: richer, slightly darker rose-brown
    lin = lin * (1 - lips[..., None] * 0.42) + lips[..., None] * 0.42 * np.array([0.36, 0.115, 0.095], dtype=np.float32)
    # moles (identity marks) and a few freckles across the nose bridge
    moles = [((0.047, -0.139, 1.632), 0.0011, 0.75), ((-0.060, -0.105, 1.612), 0.0009, 0.6), ((0.030, -0.075, 1.535), 0.0012, 0.7), ((-0.018, -0.158, 1.724), 0.0006, 0.4)]
    for c, r, a in moles:
        m = smooth(1.0, 0.45, np.sqrt(((P - np.array(c, dtype=np.float32)) ** 2).sum(-1)) / r) * a
        lin = lin * (1 - m[..., None]) + m[..., None] * np.array([0.10, 0.052, 0.035], dtype=np.float32)
    fz = (blob(P, (0, -0.165, 1.668), 0.03) + blob2(P, (0.04, -0.14, 1.655), 0.025)) * mask
    fr = hair_strokes(fz, ok, dPdx, dPdy, 260, lambda p, n: np.tile([1.0, 0, 0], (len(p), 1)), 0.0002, lambda p, r: 1.5 + 2.2 * r.rand(len(p)), alpha=(0.10, 0.28), seed=21, P=P, N=N)
    fcov, _ = stamp_strokes(SZ, fr); fcov = ndi.gaussian_filter(fcov, 0.9)
    lin *= 1 - fcov[..., None] * np.array([0.35, 0.5, 0.6], dtype=np.float32)

    # ---- hair layers: scalp + fade, stubble, brows
    print("[tex] head: hair strokes"); sys.stdout.flush()
    scale = SZ / 4096.0
    def scalp_dir(p, n):
        # crown whorl slightly right of centre at the back-top; hair flows away from it, combed forward-left on top, down on the sides
        q = p - np.array([-0.012, 0.012, 1.80]); v = np.stack([q[:, 0], q[:, 1] - 0.03, -0.55 * np.ones(len(q))], 1)
        v += np.stack([0.25 * np.ones(len(q)), np.zeros(len(q)), np.zeros(len(q))], 1) * smooth(1.74, 1.79, p[:, 2])[:, None]
        return v
    def scalp_len(p, r):
        dd = p - Cc; e = np.degrees(np.arctan2(dd[:, 2], np.hypot(dd[:, 0], dd[:, 1]))); a = np.degrees(np.arctan2(np.abs(dd[:, 0]), -dd[:, 1]))
        h = np.interp(a, hl_az, hl_el); f = smooth(0, 26, e - h) * (0.35 + 0.65 * smooth(60, 30, a))
        return 0.0012 + 0.0052 * f
    n_scalp = int(430000 * scale * scale * 1.0)
    st = hair_strokes(scalp * (0.25 + 0.75 * smooth(-1, 9, hair_d)), ok, dPdx, dPdy, n_scalp, scalp_dir, scalp_len, 1.5 * scale, alpha=(0.55, 1.0), seed=31, P=P, N=N)
    cov_s, sh_s = stamp_strokes(SZ, st)
    def beard_dir(p, n):
        v = np.stack([np.sign(p[:, 0]) * 0.35 * smooth(0.0, 0.03, np.abs(p[:, 0])), -0.25 * np.ones(len(p)), -np.ones(len(p))], 1)
        up = (p[:, 2] < 1.555)                                        # under the jaw the growth turns up toward the chin
        v[up] = np.stack([np.zeros(up.sum()), -0.6 * np.ones(up.sum()), 0.6 * np.ones(up.sum())], 1)
        return v
    n_beard = int(75000 * scale * scale)                              # heavy stubble (pass 3)
    bt = hair_strokes(beard_d, ok, dPdx, dPdy, n_beard, beard_dir, lambda p, r: 0.0017 + 0.0015 * r.rand(len(p)), 1.45 * scale, alpha=(0.5, 1.0), jitter=0.55, seed=41, P=P, N=N)
    cov_b, sh_b = stamp_strokes(SZ, bt)
    def brow_dir_for(side):
        inner, mid, outer = BF[side]; axv = outer - inner; L = np.linalg.norm(axv); axn = axv / L
        def f(p, n):
            tt = np.clip(((p - inner) @ axn) / L, 0, 1)
            cz = inner[2] + (outer[2] - inner[2]) * tt + 4 * (mid[2] - (inner[2] + outer[2]) / 2) * tt * (1 - tt) + 0.0015
            upper = (p[:, 2] > cz)
            up = (1.25 * (1 - smooth(0.0, 0.42, tt)) + 0.10) * np.where(upper, 0.35, 1.0) - np.where(upper, 0.5, 0.0) * smooth(0.25, 0.8, tt) - 0.45 * smooth(0.6, 1.0, tt)
            return axn[None, :] * 1.0 + np.array([0, 0, 1.0])[None, :] * up[:, None]
        return f
    bs = []
    for side in (1, -1):
        dm = brow * (x * side > 0) * (0.55 + 0.45 * smooth(-0.05, 0.25, brow_t)) * (1 - 0.35 * smooth(0.75, 1.05, brow_t))
        bs.append(hair_strokes(dm, ok, dPdx, dPdy, int(1500 * scale * scale), brow_dir_for(side), lambda p, r: 0.0050 + 0.0035 * r.rand(len(p)), 1.6 * scale, alpha=(0.55, 1.0), curve=0.10, jitter=0.16, seed=50 + side, P=P, N=N))
    cov_w, sh_w = stamp_strokes(SZ, np.concatenate(bs))
    # follicle shadow under the skin (blurred coverage) then the hairs themselves
    shadow = np.clip(ndi.gaussian_filter(cov_b, 5 * scale) * 2.2 + ndi.gaussian_filter(beard_d, 10 * scale) * 0.30, 0, 1)
    lin *= 1 - shadow[..., None] * np.array([0.30, 0.25, 0.20], dtype=np.float32)
    sc_sh = np.clip(ndi.gaussian_filter(cov_s, 4 * scale) * 1.8 + scalp * 0.25 * smooth(2, 14, hair_d), 0, 1)
    lin *= 1 - sc_sh[..., None] * np.array([0.52, 0.50, 0.46], dtype=np.float32)
    bw_sh = np.clip(ndi.gaussian_filter(cov_w, 4 * scale) * 1.3, 0, 1); lin *= 1 - bw_sh[..., None] * 0.30
    for cov, sh, op in ((cov_s, sh_s, 0.95), (cov_b, sh_b, 0.92), (cov_w, sh_w, 0.95)):
        a = (cov * op)[..., None]; lin = lin * (1 - a) + (HAIR * (0.75 + 0.9 * (sh[..., None] - 0.75))) * a
    lin = lin * (1 - scar[..., None] * 0.5) + scar[..., None] * 0.5 * np.array([0.62, 0.40, 0.33], dtype=np.float32)   # pale scar tissue
    # ambient occlusion from the mesh, kept gentle in the albedo (most of it goes to the AO channel)
    lin *= (0.90 + 0.10 * AO)[..., None]
    alb = lin2srgb(lin)
    alb = np.where(main[..., None], alb, lin2srgb(srgb2lin(base) * SKIN_GAIN * np.array([0.9, 0.62, 0.62], dtype=np.float32) * (0.55 + 0.45 * AO)[..., None]))   # mouth cavity: darker, redder
    mask = full_mask
    save_img(dilate_fill(alb, mask), os.path.join(OUT, "head_albedo.webp"), quality=93)

    # ---- height -> normal
    print("[tex] head: normal + masks"); sys.stdout.flush()
    skin_only = main & (scalp < 0.5)
    hp = lum_s - ndi.gaussian_filter(lum_s, 14 * scale); hp = ndi.gaussian_filter(hp, 1.2 * scale)             # creases of the source (lids, nasolabial, lips)
    H = np.clip(hp, -0.05, 0.05) * 60.0
    zone_p = 0.55 + 0.75 * blob2(P, (0.042, -0.140, 1.652), 0.03) + 0.9 * blob(P, (0, -0.168, 1.650), 0.02) + 0.3 * blob(P, (0, -0.150, 1.74), 0.05)
    n_p = int(1150000 * scale * scale)
    w = (skin_only * ok).astype(np.float64).ravel(); idx = rs.choice(w.size, size=n_p, p=w / w.sum()); ys, xs = np.unravel_index(idx, mask.shape)
    zp = zone_p[ys, xs]
    dots = np.stack([xs + rs.rand(n_p), ys + rs.rand(n_p), (0.75 + 0.55 * rs.rand(n_p)) * (0.8 + 0.35 * zp) * scale, -(0.35 + 0.5 * rs.rand(n_p)) * zp], 1)
    pores = stamp_dots(SZ, dots)
    H += pores * 0.9
    H += fbm(SZ, 1.6 * scale, 2, seed=14) * 0.35 * skin_only                                                    # micro relief between pores
    # lip lines: fine vertical furrows
    lipn = np.sin((x * 2600.0) + fbm(SZ, 8 * scale, 2, seed=15) * 5.0) * 0.5 + fbm(SZ, 1.4 * scale, 1, seed=16) * 0.6
    H += lips * lipn * 1.3
    # forehead lines (faint) and crow's feet hints
    fl = np.sin((z - 1.72) * 620.0 + fbm(SZ, 50 * scale, 2, seed=17) * 3.0)
    H += -np.clip(fl - 0.86, 0, 1) * 4.0 * blob(P, (0, -0.152, 1.742), 0.03) * 0.35
    H += cov_b * 1.6 + cov_w * 1.8 + cov_s * 1.3 - scar * 1.6
    nrm = normal_from_height(H, 0.42)
    save_img(dilate_fill(nrm * 0.5 + 0.5, mask), os.path.join(OUT, "head_normal.webp"), quality=95)

    # ---- masks
    tz = np.clip(blob(P, (0, -0.152, 1.742), 0.035) + blob(P, (0, -0.168, 1.655), 0.022) + 0.6 * blob(P, (0, -0.152, 1.58), 0.02), 0, 1)
    rough = 0.50 - 0.11 * tz + 0.05 * fbm(SZ, 20 * scale, 3, seed=18) - 0.20 * lips + 0.10 * np.clip(cov_s + scalp * 0.6, 0, 1) + 0.06 * cov_b - np.clip(pores, -1, 0) * 0.05
    cav = np.clip(1 + np.clip(pores, -1, 0) * 0.25 + np.clip(hp * 6, -0.3, 0.1), 0, 1)
    aom = np.clip(AO * 1.05, 0, 1) * cav
    thick = np.clip(1.0 * ear + 0.9 * blob(P, (0, -0.172, 1.640), 0.012) + 0.6 * blob2(P, (0.014, -0.160, 1.634), 0.008) + 0.35 * lips + 0.25 * blob2(P, (0.03, -0.146, 1.676), 0.012), 0, 1)
    thick = ndi.gaussian_filter(thick.astype(np.float32), 6 * scale)
    save_img(dilate_fill(np.stack([aom, np.clip(rough, 0.05, 1), thick], -1), mask), os.path.join(OUT, "head_m1.webp"), quality=90)
    sweat = np.clip(blob(P, (0, -0.150, 1.745), 0.05) + blob2(P, (0.062, -0.10, 1.725), 0.03) + 0.8 * must + 0.6 * blob(P, (0, -0.168, 1.66), 0.02) + 0.4 * smooth(1.56, 1.52, z), 0, 1) * (scalp < 0.5)
    burn = np.clip(0.9 * blob2(P, (0.045, -0.138, 1.655), 0.03) + blob(P, (0, -0.168, 1.662), 0.022) + 0.7 * blob(P, (0, -0.150, 1.748), 0.045) + 0.8 * ear + 0.5 * smooth(1.56, 1.52, z) * smooth(-0.02, 0.03, y), 0, 1) * (scalp < 0.5)
    save_img(dilate_fill(np.stack([sweat, burn, np.clip(lips, 0, 1)], -1), mask), os.path.join(OUT, "head_m2.webp"), quality=88)
    # where the long hair cards root (for the hair generator) + debug sheet
    np.savez_compressed(os.path.join(WORK, "head_masks.npz"), scalp=scalp.astype(np.float16), top=top_zone.astype(np.float16), fade=fade.astype(np.float16))
    dbg = np.stack([scalp, beard_d, np.maximum(brow, lips)], -1)
    save_img(dbg[::4, ::4], os.path.join(WORK, "dbg_head_masks.png"))
    save_img(alb[::4, ::4], os.path.join(WORK, "dbg_head_albedo.png"))
    return alb, mask

# ================================================================== BODY
def paint_body():
    print("[tex] body: raster"); sys.stdout.flush()
    sel = ~head_poly
    tv, tuv = tri_data(co, pf, pl, d["uv_body"], sel=sel)
    uvg = tuv.copy(); uvg[..., 1] = 1 - uvg[..., 1]
    wf = wsum("HandIndex", "HandMiddle", "HandRing", "HandPinky", "HandThumb"); wh = wsum("Hand") ; wfa = wsum("ForeArm"); wua = wsum("LeftArm", "RightArm")
    wll = wsum("LeftLeg", "RightLeg"); wul = wsum("UpLeg"); wft = wsum("Foot", "Toe"); wsp = wsum("Spine", "Hips", "Shoulder", "Neck")
    attr = np.concatenate([co[tv], vn[tv], ao[tv][..., None], wf[tv][..., None], wh[tv][..., None], wfa[tv][..., None], wua[tv][..., None], wll[tv][..., None], wul[tv][..., None], wft[tv][..., None], wsp[tv][..., None]], -1)
    maps, mask = raster(uvg, attr, SZ)
    P = maps[..., 0:3]; N = maps[..., 3:6]; N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
    AO = maps[..., 6]; Wf, Wh, Wfa, Wua, Wll, Wul, Wft, Wsp = (maps[..., 7 + i] for i in range(8))
    src = load_rgb(SRC, SZ)
    dPdx, dPdy, ok = jacobian(P, mask)
    x, y, z = P[..., 0], P[..., 1], P[..., 2]; ax = np.abs(x); scale = SZ / 4096.0
    lum_s = src.mean(-1)
    print("[tex] body: albedo"); sys.stdout.flush()
    lin = srgb2lin(src) * SKIN_GAIN
    # usually-covered zone (waist to mid-thigh): a touch paler; forearms, neck and shoulders carry the sun
    covered = smooth(0.80, 0.86, z) * smooth(1.08, 1.02, z) * np.clip(Wul + Wsp, 0, 1)
    sun = np.clip(Wfa * 0.9 + Wh * 0.7 + 0.6 * smooth(1.42, 1.50, z) * Wsp + 0.5 * Wua * smooth(1.30, 1.40, z) + 0.6 * Wll, 0, 1)
    lin *= (1 + 0.07 * covered - 0.06 * sun)[..., None]
    # warm joints: knuckles, elbows, knees; cooler inner arms
    kn = np.clip(Wf * 0.6 + blob2(P, (0.391, -0.012, 1.243), 0.04) * 0.5 + blob2(P, (0.153, -0.075, 0.524), 0.05) * 0.5, 0, 1)
    lin *= 1 + kn[..., None] * np.array([0.07, -0.07, -0.07], dtype=np.float32)
    mot = fbm(SZ, 120 * scale, 4, seed=61); fine = fbm(SZ, 2.4 * scale, 2, seed=62)
    lin *= (1 + 0.06 * mot + 0.03 * fine)[..., None]
    lin *= 1 + (fbm(SZ, 50 * scale, 3, seed=63) * 0.04)[..., None] * np.array([1, -0.3, -0.6], dtype=np.float32)
    # a few moles on the torso and arms
    w = (mask & ok & (Wsp + Wua > 0.5)).astype(np.float64).ravel(); idx = rs.choice(w.size, size=26, p=w / w.sum()); ys, xs = np.unravel_index(idx, mask.shape)
    md = stamp_dots(SZ, np.stack([xs, ys, (2.0 + 3.5 * rs.rand(26)) * scale, 0.5 + 0.4 * rs.rand(26)], 1))
    lin = lin * (1 - np.clip(md, 0, 0.85)[..., None]) + np.clip(md, 0, 0.85)[..., None] * np.array([0.11, 0.058, 0.04], dtype=np.float32)
    # body hair: forearms, lower legs, light chest and a line below the navel; thighs sparse
    print("[tex] body: hair"); sys.stdout.flush()
    chest = (blob(P, (0, -0.10, 1.36), 0.11) * 0.55 + blob(P, (0, -0.105, 1.10), 0.035) * 0.9 + blob(P, (0, -0.10, 1.17), 0.03) * 0.5) * (y < -0.02) * Wsp
    hd = np.clip(Wfa * 0.9 * smooth(-0.3, 0.3, N[..., 2] + 0.2) + Wll * 0.85 + Wul * 0.25 * smooth(0.75, 0.6, z) + chest + Wh * 0.25 * (1 - Wf) + 0.2 * Wua, 0, 1) * mask
    hd *= 0.6 + 0.5 * fbm(SZ, 40 * scale, 2, seed=64)
    def body_hair_dir(p, n):
        v = np.tile(np.array([0.0, 0, -1.0]), (len(p), 1))            # down the legs and torso
        arm = np.abs(p[:, 0]) > 0.24
        v[arm] = np.stack([np.sign(p[arm, 0]) * 0.85, -0.25 * np.ones(arm.sum()), -0.55 * np.ones(arm.sum())], 1)     # along the forearm toward the wrist, sweeping outward
        return v
    hs = hair_strokes(hd, ok, dPdx, dPdy, int(210000 * scale * scale), body_hair_dir, lambda p, r: 0.004 + 0.007 * r.rand(len(p)), 1.25 * scale, alpha=(0.22, 0.6), curve=0.3, jitter=0.4, seed=65, P=P, N=N)
    cov_h, sh_h = stamp_strokes(SZ, hs)
    a = (cov_h * 0.8)[..., None]; lin = lin * (1 - a) + HAIR * 1.6 * a
    lin *= (0.90 + 0.10 * AO)[..., None]
    alb = lin2srgb(lin)
    save_img(dilate_fill(alb, mask), os.path.join(OUT, "body_albedo.webp"), quality=92)
    print("[tex] body: normal + masks"); sys.stdout.flush()
    hp = lum_s - ndi.gaussian_filter(lum_s, 16 * scale); hp = ndi.gaussian_filter(hp, 1.0 * scale)
    H = np.clip(hp, -0.05, 0.05) * 70.0 * (0.6 + 0.9 * np.clip(Wf + Wh + Wft, 0, 1))                             # knuckle / palm / nail creases from the source
    n_p = int(1500000 * scale * scale)
    w = (mask & ok).astype(np.float64).ravel(); idx = rs.choice(w.size, size=n_p, p=w / w.sum()); ys, xs = np.unravel_index(idx, mask.shape)
    dots = np.stack([xs + rs.rand(n_p), ys + rs.rand(n_p), (0.8 + 0.6 * rs.rand(n_p)) * scale, -(0.25 + 0.4 * rs.rand(n_p))], 1)
    pores = stamp_dots(SZ, dots)
    # skin micro-relief: crossing fine lines (rhomboid pattern) stronger on the backs of hands, elbows, knees
    lines = fbm(SZ, 1.3 * scale, 1, seed=66) * 0.5 + np.sin(x * 4200 + z * 2300 + fbm(SZ, 12 * scale, 2, seed=67) * 4) * np.sin(x * 2100 - z * 3900 + fbm(SZ, 12 * scale, 2, seed=68) * 4) * 0.35
    H += pores * 0.8 + lines * (0.5 + 0.6 * np.clip(Wh + Wf + kn, 0, 1)) + cov_h * 1.2
    nrm = normal_from_height(H, 0.40)
    save_img(dilate_fill(nrm * 0.5 + 0.5, mask), os.path.join(OUT, "body_normal.webp"), quality=95)
    # nails: detect the pale glossy nail plates of the source on fingers and toes (lighter + less saturated than the skin around)
    sat = (src.max(-1) - src.min(-1)); nail = smooth(0.04, 0.10, (lum_s - ndi.gaussian_filter(lum_s, 10 * scale))) * smooth(0.5, 0.9, Wf + Wft * 0.9) * smooth(0.02, -0.01, sat - ndi.gaussian_filter(sat, 10 * scale))
    nail = ndi.gaussian_filter(nail.astype(np.float32), 1.5 * scale)
    rough = 0.56 + 0.05 * fbm(SZ, 24 * scale, 3, seed=69) - 0.30 * nail + 0.05 * cov_h - np.clip(pores, -1, 0) * 0.04 - 0.05 * np.clip(Wh - Wf, 0, 1)
    aom = np.clip(AO * 1.05, 0, 1) * np.clip(1 + np.clip(pores, -1, 0) * 0.2 + np.clip(hp * 6, -0.3, 0.1), 0, 1)
    thick = ndi.gaussian_filter(np.clip(Wf * 0.9 + Wft * 0.3 + 0.25 * Wh, 0, 1).astype(np.float32), 4 * scale)
    save_img(dilate_fill(np.stack([aom, np.clip(rough, 0.05, 1), thick], -1), mask), os.path.join(OUT, "body_m1.webp"), quality=90)
    sweat = np.clip(0.9 * blob(P, (0, -0.10, 1.38), 0.12) * (y < 0) + 0.9 * blob(P, (0, 0.10, 1.36), 0.14) * (y > 0) + 0.7 * smooth(1.42, 1.52, z) * Wsp + 0.5 * blob2(P, (0.17, 0.0, 1.38), 0.06), 0, 1) * mask
    burn = np.clip(0.9 * smooth(1.40, 1.50, z) * Wsp + 0.8 * Wua * smooth(-0.2, 0.5, N[..., 2]) + 0.6 * Wfa * smooth(-0.2, 0.5, N[..., 2]) + 0.5 * blob(P, (0, -0.10, 1.40), 0.10) + 0.4 * Wll * (y < 0), 0, 1) * mask
    save_img(dilate_fill(np.stack([sweat, burn, np.clip(covered, 0, 1)], -1), mask), os.path.join(OUT, "body_m2.webp"), quality=88)
    save_img(alb[::4, ::4], os.path.join(WORK, "dbg_body_albedo.png"))
    return alb, mask

# ================================================================== EYES
def paint_eyes():
    print("[tex] eyes"); sys.stdout.flush()
    S = 1024; yy, xx = np.mgrid[0:S, 0:S].astype(np.float32); u = (xx + 0.5) / S * 2 - 1; v = (yy + 0.5) / S * 2 - 1
    r = np.hypot(u, v); th = np.arctan2(v, u)
    # iris texture: r = 1 at the limbus. Hazel: amber-brown collarette, olive-green outer zone, dark limbal ring.
    ang = (th / (2 * np.pi) + 0.5)
    def radial(seed, freq, sharp):
        rr = np.random.RandomState(seed); base = rr.rand(int(freq * 2) + 4)
        a = ang * freq; i0 = np.floor(a).astype(int); f = a - i0
        n1 = base[i0 % freq]; n2 = base[(i0 + 1) % freq]; return (n1 * (1 - f) + n2 * f) ** sharp
    warp = fbm(S, 30, 3, seed=71) * 0.03
    fib = 0.55 * radial(72, 190, 1.0) + 0.3 * radial(73, 420, 1.0) + 0.25 * radial(74, 64, 1.5)
    fib = ndi.gaussian_filter(fib, 0.8) + fbm(S, 3, 2, seed=75) * 0.10
    pupil_r = 0.30; coll = 0.47 + warp * 2
    inner = np.array([0.62, 0.36, 0.11]); outer = np.array([0.36, 0.38, 0.17]); deep = np.array([0.17, 0.15, 0.07])
    t = smooth(coll - 0.06, coll + 0.20, r)
    col = inner[None, None, :] * (1 - t[..., None]) + outer[None, None, :] * t[..., None]
    col = col * (0.50 + 0.85 * fib[..., None])
    crypt = smooth(0.62, 0.9, radial(76, 46, 1.0) * (0.6 + fbm(S, 12, 2, seed=77))) * smooth(coll, coll + 0.1, r) * smooth(0.95, 0.7, r)
    col = col * (1 - 0.45 * crypt[..., None]) + deep * 0.45 * crypt[..., None]
    ringc = np.exp(-((r - coll) / 0.035) ** 2); col += ringc[..., None] * np.array([0.16, 0.09, 0.02]) * (0.5 + fib[..., None])
    limb = smooth(0.80, 1.0, r); col = col * (1 - 0.82 * limb[..., None])
    pm = smooth(pupil_r + 0.012, pupil_r - 0.012, r); col = col * (1 - pm[..., None]) + np.array([0.012, 0.010, 0.010]) * pm[..., None]
    h = fib * (1 - pm) * smooth(1.0, 0.85, r)                                 # iris relief in alpha (the shader uses it for a little self-shadowing)
    save_img(np.concatenate([np.clip(col, 0, 1), np.clip(h, 0, 1)[..., None]], -1), os.path.join(OUT, "eye_iris.webp"), quality=95)
    # sclera, azimuthal map (centre = pupil axis, r = 1 at the back pole): warm white, pinker and veined toward the rim
    base = np.array([0.90, 0.875, 0.845])[None, None, :] * (1 - 0.10 * smooth(0.25, 0.6, r)[..., None]) * np.ones((S, S, 1))
    base = base * (1 + fbm(S, 40, 3, seed=78)[..., None] * 0.02)
    rr = np.random.RandomState(79); strokes = []
    for i in range(46):
        a = rr.rand() * 2 * np.pi; r0 = 0.62 + rr.rand() * 0.15; x0 = S / 2 + np.cos(a) * r0 * S / 2; y0 = S / 2 + np.sin(a) * r0 * S / 2
        for seg in range(5):
            a += (rr.rand() - 0.5) * 0.5; r1 = r0 - (0.035 + rr.rand() * 0.05)
            x1 = S / 2 + np.cos(a) * r1 * S / 2; y1 = S / 2 + np.sin(a) * r1 * S / 2
            strokes.append([x0, y0, (x0 + x1) / 2 + rr.randn() * 5, (y0 + y1) / 2 + rr.randn() * 5, x1, y1, 2.4 - seg * 0.4, 0.5 - seg * 0.07, 1])
            if rr.rand() < 0.35:
                a2 = a + (rr.rand() - 0.5) * 1.2; xb = S / 2 + np.cos(a2) * (r1 - 0.04) * S / 2; yb = S / 2 + np.sin(a2) * (r1 - 0.04) * S / 2
                strokes.append([x1, y1, (x1 + xb) / 2, (y1 + yb) / 2, xb, yb, 1.4, 0.3, 1])
            x0, y0, r0 = x1, y1, r1
            if r0 < 0.28: break
    cov, _ = stamp_strokes(S, np.array(strokes)); cov = ndi.gaussian_filter(cov, 0.9)
    base = base * (1 - cov[..., None] * np.array([0.10, 0.55, 0.50]))
    pink = smooth(0.45, 0.9, r)[..., None] * np.array([0.0, 0.10, 0.10]); base = base * (1 - pink)
    save_img(np.clip(base, 0, 1), os.path.join(OUT, "eye_sclera.webp"), quality=92)

# ================================================================== FAR LOD ATLAS (original MakeHuman layout, head resampled back in, eye patch)
def paint_far():
    print("[tex] far atlas"); sys.stdout.flush()
    S = 2048
    body = load_rgb(os.path.join(OUT, "body_albedo.webp"), S); head = load_rgb(os.path.join(OUT, "head_albedo.webp"))
    tv, tuvo = tri_data(co, pf, pl, d["uv_body"], sel=head_poly); _, tuvh = tri_data(co, pf, pl, d["uv_head"], sel=head_poly)
    uvg = tuvo.copy(); uvg[..., 1] = 1 - uvg[..., 1]
    maps, m = raster(uvg, tuvh, S)
    hs = head.shape[0]; samp = bilinear(head, maps[..., 0] * hs, (1 - maps[..., 1]) * hs)
    samp = dilate_fill(samp, m, 6); mm = ndi.binary_dilation(m, iterations=4)
    out = np.where(mm[..., None], samp, body)
    # eye patch at uv (0.92..0.99, 0.92..0.99) (Blender v) -> top-right in the image
    yy, xx = np.mgrid[0:S, 0:S]; cx, cy = 0.955 * S, (1 - 0.955) * S; r = np.hypot(xx - cx, yy - cy) / (0.035 * S)
    eye = np.where((r < 0.42)[..., None], np.array([0.20, 0.17, 0.08]), np.array([0.86, 0.84, 0.82])); eye = np.where((r < 0.17)[..., None], np.array([0.02, 0.02, 0.02]), eye)
    box = (np.abs(xx - cx) < 0.045 * S) & (np.abs(yy - cy) < 0.045 * S)
    out = np.where(box[..., None], eye, out)
    save_img(out, os.path.join(OUT, "skin_far.webp"), quality=88)

# ================================================================== TILEABLE DETAIL (shared by every skin material)
def paint_detail():
    print("[tex] detail tiles"); sys.stdout.flush()
    S = 512
    # skin micro-geometry: rhomboid furrows + tiny pores, tileable
    h = fbm(S, 1.1, 1, seed=81, wrap=True) * 0.6
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32); u = xx / S * 2 * np.pi; v = yy / S * 2 * np.pi
    w1 = fbm(S, 14, 2, seed=82, wrap=True) * 2.5; w2 = fbm(S, 14, 2, seed=83, wrap=True) * 2.5
    h += (np.abs(np.sin(u * 13 + v * 7 + w1)) ** 0.5 + np.abs(np.sin(u * 8 - v * 12 + w2)) ** 0.5 - 1.3) * 0.9
    r2 = np.random.RandomState(84); n = 2600
    h = stamp_dots(S, np.stack([r2.rand(n) * S, r2.rand(n) * S, 0.9 + r2.rand(n) * 0.8, -(0.6 + 0.6 * r2.rand(n))], 1), h)
    h = ndi.gaussian_filter(h, 0.6, mode="wrap")
    save_img(normal_from_height(h, 0.9) * 0.5 + 0.5, os.path.join(OUT, "skin_micro_n.webp"), lossless=True)
    # water / sweat droplets: lens-shaped beads, tileable. RG = normal xy, B = bead id (threshold it to grow the number of beads), A = bead mask
    S = 1024; hh = np.zeros((S, S), dtype=np.float32); idm = np.zeros((S, S), dtype=np.float32)
    r3 = np.random.RandomState(85); pts = []
    for i in range(900):
        rad = 2.5 + (r3.rand() ** 2.2) * 15
        for _ in range(20):
            cx, cy = r3.rand() * S, r3.rand() * S
            if all(((cx - a + S / 2) % S - S / 2) ** 2 + ((cy - b + S / 2) % S - S / 2) ** 2 > (rad + c + 2) ** 2 for a, b, c in pts): pts.append((cx, cy, rad)); break
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for i, (cx, cy, rad) in enumerate(pts):
        x0, x1 = int(cx - rad - 2), int(cx + rad + 3); y0, y1 = int(cy - rad - 2), int(cy + rad + 3)
        ys = np.arange(y0, y1) % S; xs = np.arange(x0, x1) % S
        dx = (np.arange(x0, x1) + 0.5 - cx)[None, :]; dy = ((np.arange(y0, y1) + 0.5 - cy) * (0.82 + 0.18 * r3.rand()))[:, None]     # slightly elongated downward
        q = 1 - (dx * dx + dy * dy) / (rad * rad); m = q > 0
        bead = np.sqrt(np.clip(q, 0, 1)) * rad * 0.55
        sub = hh[np.ix_(ys, xs)]; hh[np.ix_(ys, xs)] = np.where(m, np.maximum(sub, bead), sub)
        sid = idm[np.ix_(ys, xs)]; idm[np.ix_(ys, xs)] = np.where(m, (i + 1) / (len(pts) + 1), sid)
    nrm = normal_from_height(hh, 1.0)
    save_img(np.stack([nrm[..., 0] * 0.5 + 0.5, nrm[..., 1] * 0.5 + 0.5, idm, (hh > 0).astype(np.float32)], -1), os.path.join(OUT, "droplets.webp"), lossless=True)

if WHAT in ("detail", "all"): paint_detail()
if WHAT in ("head", "all"): paint_head()
if WHAT in ("body", "all"): paint_body()
if WHAT in ("eyes", "all"): paint_eyes()
if WHAT in ("far", "all"): paint_far()
print("[tex] done")
