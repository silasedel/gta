#!/usr/bin/env python3
# r2-look: build a regularized color-grade LUT that moves our frame's tonal / color statistics toward a reference image
# (the mock-up), in Oklab. Tone: quantile-matched L curve, smoothed, slope-limited and blended with identity.
# Color: per tonal band (shadow / mid / highlight) mean a,b shift (clamped) and chroma scale (clamped).
#   python3 -P tools/v2/look/lut-match.py ours.png ref.webp out_lut.png [--tone 0.6] [--color 0.6] [--report out.json]
# LUT layout: 32^3 in a 1024 x 32 PNG strip, x = b * 32 + r, y = g (row 0 = g 0), sRGB display values in / out.
import sys, json
import numpy as np
from PIL import Image

a = sys.argv[1:]
ours_p, ref_p, out_p = a[0], a[1], a[2]
opt = {a[i][2:]: a[i + 1] for i in range(3, len(a) - 1) if a[i].startswith('--')}
K_TONE = float(opt.get('tone', 0.6)); K_COL = float(opt.get('color', 0.6))

def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]])
def to_ok(rgb):
    lms = np.cbrt(np.maximum(s2l(rgb) @ M1.T, 0)); return lms @ M2.T
def from_ok(lab):
    lms = lab @ np.linalg.inv(M2).T; return l2s((lms ** 3) @ np.linalg.inv(M1).T)

def load(p, crop_top=0.0):
    im = np.asarray(Image.open(p).convert('RGB').resize((640, 360)), dtype=np.float64) / 255.0
    h = im.shape[0]; im = im[int(h * crop_top):]
    return to_ok(im.reshape(-1, 3))
O = load(ours_p); R = load(ref_p)

# --- tone: quantile matching of L, smoothed + slope-limited, blended with identity
qs = np.linspace(0.01, 0.99, 50)
qo, qr = np.quantile(O[:, 0], qs), np.quantile(R[:, 0], qs)
xs = np.linspace(0, 1, 256)
f = np.interp(xs, np.concatenate([[0], qo, [1]]), np.concatenate([[0], qr, [1]]))
f = np.convolve(np.pad(f, 12, mode='edge'), np.ones(25) / 25, mode='valid')
d = np.clip(np.diff(f) / np.diff(xs), 0.55, 1.8); f = np.concatenate([[f[0]], f[0] + np.cumsum(d * np.diff(xs))])
f = f - f[0]; f = f / max(f[-1], 1e-6)
f = xs + (f - xs) * K_TONE

# --- color per band
def band_w(L, c, w): return np.exp(-((L - c) / w) ** 2)
bands = [(0.30, 0.15), (0.55, 0.15), (0.80, 0.15)]
rep = {'bands': []}
shifts = []
for c, w in bands:
    wo, wr = band_w(O[:, 0], c, w), band_w(R[:, 0], c, w)
    mo = (O[:, 1:] * wo[:, None]).sum(0) / wo.sum(); mr = (R[:, 1:] * wr[:, None]).sum(0) / wr.sum()
    co = np.sqrt((((O[:, 1:]) ** 2).sum(1) * wo).sum() / wo.sum()); cr = np.sqrt((((R[:, 1:]) ** 2).sum(1) * wr).sum() / wr.sum())
    sh = np.clip(mr - mo, -0.025, 0.025) * K_COL
    sc = float(np.clip(cr / max(co, 1e-6), 0.78, 1.15) ** K_COL)
    shifts.append((c, w, sh, sc))
    rep['bands'].append({'L': c, 'ours_ab': mo.round(4).tolist(), 'ref_ab': mr.round(4).tolist(), 'ours_chroma': round(float(co), 4), 'ref_chroma': round(float(cr), 4), 'shift': sh.round(4).tolist(), 'chroma_scale': round(sc, 3)})
rep['tone_curve_16'] = np.interp(np.linspace(0, 1, 17), xs, f).round(3).tolist()
rep['L_quantiles'] = {'ours': np.quantile(O[:, 0], [0.05, 0.25, 0.5, 0.75, 0.95]).round(3).tolist(), 'ref': np.quantile(R[:, 0], [0.05, 0.25, 0.5, 0.75, 0.95]).round(3).tolist()}

def grade(lab):
    L = lab[:, 0]; ab = lab[:, 1:].copy()
    wsum = np.zeros_like(L); out_ab = np.zeros_like(ab)
    for c, w, sh, sc in shifts:
        wt = band_w(L, c, w) + 1e-4
        out_ab += (ab * sc + sh) * wt[:, None]; wsum += wt
    ab2 = out_ab / wsum[:, None]
    # neutrals stay neutral-ish: the shift fades out for nearly gray pixels at the extremes (no tinted black / white)
    edge = np.clip(np.minimum(L, 1 - L) / 0.08, 0, 1)
    ab2 = ab + (ab2 - ab) * edge[:, None]
    L2 = np.interp(L, xs, f)
    return np.column_stack([L2, ab2])

N = 32
g = np.linspace(0, 1, N)
r_, g_, b_ = np.meshgrid(g, g, g, indexing='ij')  # [r, g, b]
rgb = np.stack([r_, g_, b_], -1).reshape(-1, 3)
out = from_ok(grade(to_ok(rgb))).reshape(N, N, N, 3)
img = np.zeros((N, N * N, 3))
for bi in range(N):
    img[:, bi * N:(bi + 1) * N, :] = out[:, :, bi, :].transpose(1, 0, 2)  # rows = g, cols = r
Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out_p)
# preview: our frame through the LUT
prev = Image.open(ours_p).convert('RGB')
pa = np.asarray(prev, dtype=np.float64) / 255.0
graded = from_ok(grade(to_ok(pa.reshape(-1, 3)))).reshape(pa.shape)
Image.fromarray((np.clip(graded, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out_p.replace('.png', '_preview.jpg'), quality=90)
if 'report' in opt: json.dump(rep, open(opt['report'], 'w'), indent=1)
print(json.dumps(rep))
