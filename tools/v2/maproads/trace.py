"""Trace the road network from the user's official map (references/ref_40_map_user_official.webp, local only).

Run:  tools/world/.venv/bin/python -I tools/v2/maproads/trace.py
Writes tools/v2/maproads/out/traced.json (polylines in IMAGE PIXELS, native 1041 x 1511) and out/trace_mask.png.

Method: roads are thin pale beige lines (r ~ g, b lower) on green / dark green land. A road score
(non-green-ness + brightness) is top-hat filtered at 3x upsampling, thresholded, cleaned, skeletonized and
walked into a graph (junction / end nodes, pixel chains between them). Chains are simplified (Douglas-Peucker),
small gaps are bridged between aligned dead ends, spurs under ~60 m are dropped, and each chain carries
its mean apparent width and brightness for classification (see curate.py).
"""
import sys, os, json, math
sys.path.append(os.path.expanduser('~/.local/lib/python3.13/site-packages'))     # numpy / skimage live in the user site (-I hides it)
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize, remove_small_objects
from skimage.filters import sato, apply_hysteresis_threshold

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
IMG = os.path.join(ROOT, 'references', 'ref_40_map_user_official.webp')
OUT = os.path.join(HERE, 'out')
UP = 3                      # working upsample factor


def road_mask():
    im = Image.open(IMG).convert('RGB')
    W0, H0 = im.size
    a0 = np.asarray(im).astype(np.float32)
    a = np.asarray(im.resize((W0 * UP, H0 * UP), Image.BICUBIC)).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mean = (r + g + b) / 3.0
    # water (sea, lake, channels) at native res, dilated so shorelines do not read as ridges
    r0, g0, b0 = a0[..., 0], a0[..., 1], a0[..., 2]
    water0 = (b0 > r0 + 22) & (b0 > 0.78 * g0) & ~((r0 > 150) & (g0 > 150))
    water0 = ndimage.binary_opening(water0, iterations=1)
    water = np.kron(ndimage.binary_dilation(water0, iterations=2), np.ones((UP, UP), bool))
    # urban gray blocks (towns, city): r ~ g ~ b
    gray0 = (np.abs(r0 - g0) < 16) & (np.abs(g0 - b0) < 20) & ((r0 + g0 + b0) / 3 > 110)
    dense0 = ndimage.uniform_filter(gray0.astype(np.float32), 9) > 0.42
    dense = np.kron(dense0, np.ones((UP, UP), bool))
    # road score: not green (r - g) and pale; bright thin ridges of it are roads (Sato tubeness, 1.0-1.6 px at 3x)
    s = (r - g) * 1.5 + (mean - 120) * 1.0
    R = sato(s, sigmas=[1.0, 1.6], black_ridges=False)
    R[water] = 0
    m = apply_hysteresis_threshold(R, 10, 22)
    m = remove_small_objects(m, max_size=150)
    m = ndimage.binary_closing(m, structure=np.ones((3, 3), bool))
    return m, dense, water, (W0, H0), R

NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def graph(sk):
    """Skeleton -> list of pixel chains between nodes (ends or junctions)."""
    H, W = sk.shape
    ys, xs = np.nonzero(sk)
    S = set(zip(ys.tolist(), xs.tolist()))
    def nbrs(p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in NB if (y + dy, x + dx) in S]
    deg = {p: len(nbrs(p)) for p in S}
    nodes = {p for p, d in deg.items() if d != 2}
    seen_e = set()
    chains = []
    for n in nodes:
        for q in nbrs(n):
            if (n, q) in seen_e:
                continue
            ch = [n, q]; prev, cur = n, q
            seen_e.add((n, q))
            while cur not in nodes:
                nx_ = [t for t in nbrs(cur) if t != prev and t not in ch[-3:]]
                if not nx_:
                    break
                prev, cur = cur, nx_[0]
                ch.append(cur)
            seen_e.add((ch[-1], ch[-2]))
            chains.append(ch)
    # pure loops (no node)
    left = S - {p for c in chains for p in c}
    while left:
        p0 = left.pop(); ch = [p0]; prev = None; cur = p0
        while True:
            nx_ = [t for t in nbrs(cur) if t != prev and t in left]
            if not nx_:
                break
            prev, cur = cur, nx_[0]; left.discard(cur); ch.append(cur)
        if len(ch) > 8:
            chains.append(ch + [p0])
    return chains


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    d = b - a; L = np.hypot(*d)
    P = np.array(pts)
    if L < 1e-9:
        dist = np.hypot(*(P - a).T)
    else:
        dist = np.abs(d[0] * (P[:, 1] - a[1]) - d[1] * (P[:, 0] - a[0])) / L
    i = int(dist.argmax())
    if dist[i] > tol:
        return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol)
    return [pts[0], pts[-1]]


def main():
    os.makedirs(OUT, exist_ok=True)
    m, dense, water, (W0, H0), RID = road_mask()
    np.save(os.path.join(OUT, 'ridge.npy'), (RID / 2).clip(0, 255).astype(np.uint8))
    Image.fromarray((m * 255).astype(np.uint8)).resize((W0, H0), Image.BILINEAR).save(os.path.join(OUT, 'trace_mask.png'))
    dist = ndimage.distance_transform_edt(m)
    sk = skeletonize(m)
    chains = graph(sk)
    a = np.asarray(Image.open(IMG).convert('RGB')).astype(np.float32)
    res = []
    for ch in chains:
        pts = [((x + 0.5) / UP - 0.5 / UP * 0 , (y + 0.5) / UP) for y, x in ch]      # native image px (x, y)
        L = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
        wid = float(np.median([dist[y, x] for y, x in ch])) * 2 / UP
        dn = float(np.mean([dense[y, x] for y, x in ch]))
        simp = dp(pts, 0.35)
        res.append(dict(pts=[[round(x, 2), round(y, 2)] for x, y in simp], len=round(L, 2), w=round(wid, 2), dense=round(dn, 2),
                        ends=[[round(pts[0][0], 2), round(pts[0][1], 2)], [round(pts[-1][0], 2), round(pts[-1][1], 2)]]))
    json.dump(dict(image=os.path.basename(IMG), size=[W0, H0], up=UP, chains=res), open(os.path.join(OUT, 'traced.json'), 'w'))
    print('chains', len(res), 'total px', round(sum(c['len'] for c in res)), 'mask frac', round(float(m.mean()), 4))


if __name__ == '__main__':
    main()
