#!/usr/bin/env python3
"""Ground texture set for the terrain shader (src/world/terrain/groundtex.js).

Reads the user's ground scans / textures in Models/Textures (+ two Poly Haven CC0 sets already in the repo) and writes
public/assets/textures/ground/<key>_{col,h,nrm,arm}.jpg:
  col  1024 sRGB albedo: de-lit (large-scale luminance splotches / baked shading divided out), mean luminance and
       contrast normalized to a per-surface target so scans and clean textures match
  h    1024 height (8-bit) for height-based blending; from the source height map or derived from luminance
  nrm  512  OpenGL (Y+) tangent-space normal; DirectX sources get green flipped (convention verified against the height
       gradient and printed), sources without a normal map get one derived from the height
  arm  512  R = ambient occlusion, G = roughness, B = 0
Non-tiling sources are made tileable (offset + height-aware seam blend).

  python3 tools/v2/ground/prep_ground.py            (from the project root)
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'Models', 'Textures')
PH = os.path.join(ROOT, 'public', 'assets', 'city', 'pbr')
OUT = os.path.join(ROOT, 'public', 'assets', 'textures', 'ground')
COL, AUX = 2048, 1024  # ground pass (overnight): 2K albedo / height, 1K normal + arm (looks first)

G1 = 'Ground 1 - Mottled Green Lawn With Dirt Patches/'
S2 = 'Sand 2 - Fine Peach Beach Sand With Footprints/'
D1 = 'Dirt 1 - Pale Gray Gravelly Dirt/'
G4 = 'Grass Cards 4 - Green Grass Chunks On Ground Patch/textures/'
G2 = 'Ground 2 - Dark Mud With Dry Grass Terrain Patch/textures/'
# key: color, normal, normal convention ('gl' | 'dx' | None = derive), height, rough, ao, target luma (sRGB mean), max luma std,
#      delight strength (0 = keep large-scale variation, it is content), tileable, normal strength when derived
LAYERS = [
    dict(key='grass', col='Grass Cards 3 - Dark Dry Grass Plates With Seamless Top/textures/Top Seamless.png', luma=0.36, std=0.13, delight=0.5, nstr=2.5, rough=0.86),
    dict(key='lawn', col=G1 + 'Lawn Color.png', nrm=G1 + 'Lawn Normal.png', conv='auto', rough=G1 + 'Lawn Roughness.png', ao=G1 + 'Lawn AO.png', luma=0.34, std=0.10, delight=0.15),
    dict(key='sand', col=S2 + 'Sand Color.png', nrm=S2 + 'Sand Normal DX.png', conv='dx', h=S2 + 'Sand Height.png', rough=S2 + 'Sand Roughness.png', luma=0.66, std=0.06, delight=0.8),
    dict(key='sandgrass', col='Sand 1 - Dry Grassy Sand Scan Patch/Sand Scan Color.jpg', luma=0.50, std=0.12, delight=0.75, tile=True, crop=0.80, nstr=2.0, rough=0.9),
    dict(key='gravel', col=D1 + 'Dirt Color.png', nrm=D1 + 'Dirt Normal DX.png', conv='dx', h=D1 + 'Dirt Height.png', rough=D1 + 'Dirt Roughness.png', luma=0.56, std=0.08, delight=0.8),
    dict(key='soil', col=G4 + 'Ground Close 04 Color.jpeg', nrm=G4 + 'Ground Close 04 Normal GL.jpeg', conv='gl', h=G4 + 'Ground Close 04 High.jpg', ao=G4 + 'Ground Close 04 Occlusion.jpeg', luma=0.36, std=0.09, delight=0.8, rough=0.9, desat=0.55),  # pink fallen leaves read purple in lawns
    dict(key='mud', col=G2 + 'Mud Tile Color.jpeg', nrm=G2 + 'Mud Tile Normal GL.jpeg', conv='gl', rough=G2 + 'Mud Tile Roughness (green channel).png', rough_ch=1, luma=0.30, std=0.07, delight=0.7),
    # Gravel 1 (pebble beach) was tried: its color map is the scan's UV atlas (islands + blurred padding), not a usable ground texture
    dict(key='leaves', ph='forest_leaves_02', luma=0.34, std=0.11, delight=0.6, desat=0.6),  # ground pass: Florida hammock litter is brown, not autumn orange
    dict(key='stony', ph='forest_ground_04', luma=0.42, std=0.09, delight=0.6),
]


def load(path, mode='RGB'):
    im = Image.open(path)
    if im.mode in ('I;16', 'I;16B', 'I'):
        a = np.array(im).astype(np.float32)
        return (a - a.min()) / max(1e-6, a.max() - a.min())
    return np.asarray(im.convert(mode)).astype(np.float32) / 255.0


def resize(a, n):
    if a.shape[0] == n and a.shape[1] == n:
        return a
    if a.ndim == 2:
        return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((n, n), Image.LANCZOS)).clip(0, 1)
    return np.stack([resize(a[..., c], n) for c in range(a.shape[2])], -1)


def lum(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def blur(a, s):
    return ndimage.gaussian_filter(a, s, mode='wrap')


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def make_tileable(c, h):
    """Offset the image by half and blend it back over the borders with a height-aware, noise-perturbed mask."""
    n = c.shape[0]
    cb, hb = np.roll(c, (n // 2, n // 2), (0, 1)), np.roll(h, (n // 2, n // 2), (0, 1))
    y, x = np.mgrid[0:n, 0:n] / (n - 1)
    edge = np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y))  # 0 at the border, 0.5 at the center
    rng = np.random.default_rng(7)
    noise = blur(rng.standard_normal((n, n)).astype(np.float32), n / 40)
    noise /= np.abs(noise).max() + 1e-6
    m = edge * 2 + noise * 0.18 + (h - hb) * 0.35
    m = np.clip((m - 0.32) / 0.16, 0, 1)
    m = m * m * (3 - 2 * m)
    return c * m[..., None] + cb * (1 - m[..., None]), h * m + hb * (1 - m)


def normal_from_height(h, strength):
    gy, gx = np.gradient(blur(h, 0.6))  # gy: d/drow (down the image), gx: d/dcol
    nx, ny = -gx * strength * h.shape[0] / 64, gy * strength * h.shape[0] / 64  # GL: green up = height rising toward the image top
    nz = np.ones_like(nx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1)


def convention(nrm, h):
    """+1 if the normal map is OpenGL (Y+), -1 if DirectX, measured against the height gradient."""
    gy, _ = np.gradient(blur(h, 1.0))
    g = nrm[..., 1] - 0.5
    return float(np.sign(np.mean(g * gy))), float(np.corrcoef(g.ravel(), gy.ravel())[0, 1])


def main():
    os.makedirs(OUT, exist_ok=True)
    report = []
    only = sys.argv[1:]
    for L in LAYERS:
        k = L['key']
        if only and k not in only:
            continue
        if 'ph' in L:
            col = load(os.path.join(PH, L['ph'] + '_col.jpg'))
            nrm = load(os.path.join(PH, L['ph'] + '_nrm.jpg'))
            arm = load(os.path.join(PH, L['ph'] + '_arm.jpg'))
            col, nrm, arm = resize(col, COL), resize(nrm, COL), resize(arm, COL)
            ao, rough = arm[..., 0], arm[..., 1]
            conv = 'gl'
            h = None
        else:
            col = load(os.path.join(SRC, L['col']), 'RGB')
            if L.get('crop'):  # scan patch: keep the inner part (borders of the scan are inpainted / smeared)
                n0 = col.shape[0]; m0 = int(n0 * (1 - L['crop']) / 2); col = col[m0:n0 - m0, m0:n0 - m0]
            col = resize(col, COL)
            nrm = resize(load(os.path.join(SRC, L['nrm'])), COL) if L.get('nrm') else None
            h = resize(load(os.path.join(SRC, L['h']), 'L'), COL) if L.get('h') else None
            if isinstance(L.get('rough'), str):
                r = load(os.path.join(SRC, L['rough']), 'RGB')
                rough = resize(r[..., L.get('rough_ch', 0)], COL)
            else:
                rough = None
            ao = resize(load(os.path.join(SRC, L['ao']), 'L'), COL) if L.get('ao') else None
            conv = L.get('conv')
        # height: source map, else luminance high-pass (bright = raised: grass blades, pebbles, leaves)
        if h is None:
            Ll = lum(col)
            h = Ll - blur(Ll, COL / 48)
            if ao is not None:
                h = h * 0.6 + (ao - ao.mean()) * 0.4
            h = (h - np.percentile(h, 1)) / max(1e-6, np.percentile(h, 99) - np.percentile(h, 1))
        h = np.clip(h, 0, 1)
        if L.get('tile'):
            col, h = make_tileable(col, h)
        # normal convention check / conversion to OpenGL
        if nrm is not None:
            sgn, cc = convention(nrm, h)
            if conv == 'auto':
                conv = 'gl' if sgn > 0 else 'dx'
            if conv == 'dx':
                nrm = nrm.copy(); nrm[..., 1] = 1 - nrm[..., 1]
            sgn2, cc2 = convention(nrm, h)
            report.append(f'{k}: normal declared {L.get("conv") or "gl"} -> using {conv}; after conversion corr(G, dh/drow) = {cc2:+.3f}')
            if L.get('ph') is None and cc2 < 0:
                print('WARN', k, 'normal still anti-correlated with height; check convention')
        else:
            n3 = normal_from_height(h, L.get('nstr', 2.0))
            nrm = n3 * 0.5 + 0.5
            report.append(f'{k}: normal derived from height (GL)')
        # de-light: divide out large-scale luminance (baked light / AO splotches), keep color; then normalize mean and contrast
        lin = srgb2lin(col)
        Y = lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722
        low = blur(Y, COL / 10)
        f = (low / max(1e-6, Y.mean())) ** -L['delight']
        lin = lin * f[..., None]
        c = lin2srgb(lin)
        l = lum(c)
        sd = l.std()
        if sd > L['std']:  # compress contrast around the mean (no "grain" at grazing light)
            m = l.mean(); k2 = L['std'] / sd
            c = (c - l[..., None]) + (m + (l - m) * k2)[..., None]
        if L.get('desat'):
            l2 = lum(c)[..., None]; c = c + (l2 - c) * L['desat']
        c = np.clip(c * (L['luma'] / max(1e-6, lum(c).mean())), 0, 1)
        if rough is None:
            rough = np.clip(L.get('rough', 0.9) - (h - 0.5) * 0.08, 0, 1)
        if ao is None:
            ao = np.clip(1 - np.clip(blur(h, 2) - h, 0, 1) * 2.5 - (1 - h) * 0.15, 0, 1)
        Image.fromarray((c * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{k}_col.jpg'), quality=90)
        Image.fromarray((h * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{k}_h.jpg'), quality=92)
        Image.fromarray((resize(nrm, AUX) * 255 + 0.5).clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, f'{k}_nrm.jpg'), quality=94)
        arm = np.stack([resize(ao, AUX), resize(rough, AUX), np.zeros((AUX, AUX), np.float32)], -1)
        Image.fromarray((arm * 255 + 0.5).clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, f'{k}_arm.jpg'), quality=92)
        report.append(f'  {k}: luma {lum(c).mean():.3f} std {lum(c).std():.3f} rough {rough.mean():.2f} ao {ao.mean():.2f}')
        print(report[-2]); print(report[-1]); sys.stdout.flush()


if __name__ == '__main__':
    main()
