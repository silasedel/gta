#!/usr/bin/env python
"""Stage 1 map rebuild, step 1: register the road map (docs/v2/plan/map_roads_target.webp, the layout to trace) onto the
colour map (docs/v2/plan/map_colour_target.webp, land / water / beach / forest). Finds the uniform scale + offset that
maps road-image pixels to colour-image pixels by maximizing land-mask overlap.
Writes tools/v2/map3/out/register.json: { s, tx, ty, iou }  (colour_px = s * road_px + t)
Run: tools/world/.venv/bin/python tools/v2/map3/register.py
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)

def road_land():
    r = np.asarray(Image.open(os.path.join(ROOT, 'docs/v2/plan/map_roads_target.webp')).convert('L')).astype(np.float32)
    # sea is flat mid gray (~127); land is near black, roads white. Land = anything not close to the sea gray.
    sea = np.abs(r - 127) < 14
    sea = ndimage.binary_opening(sea, iterations=1)
    land = ~sea
    return ndimage.binary_fill_holes(ndimage.binary_closing(land, iterations=2)) & land | ndimage.binary_closing(land, iterations=1)

def colour_land():
    c = np.asarray(Image.open(os.path.join(ROOT, 'docs/v2/plan/map_colour_target.webp')).convert('RGB')).astype(np.float32)
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    water = (B > R + 25) & (B > G - 5)          # deep blue and turquoise shallows
    land = ~water
    return ndimage.binary_opening(land, iterations=1)

def main():
    A = road_land(); Bm = colour_land()
    la, na = ndimage.label(A); lb, nb = ndimage.label(Bm)
    # main island = largest component in each
    ia = np.argmax(np.bincount(la.ravel())[1:]) + 1; ib = np.argmax(np.bincount(lb.ravel())[1:]) + 1
    ya, xa = np.nonzero(la == ia); yb, xb = np.nonzero(lb == ib)
    s0 = ((yb.max() - yb.min()) / (ya.max() - ya.min()) + (xb.max() - xb.min()) / (xa.max() - xa.min())) / 2
    tx0 = xb.mean() - s0 * xa.mean(); ty0 = yb.mean() - s0 * ya.mean()
    H, W = Bm.shape
    def iou(s, tx, ty):
        # sample the road-land mask in colour space (nearest), compare with colour land
        yy, xx = np.mgrid[0:H:3, 0:W:3]
        sx = ((xx - tx) / s).round().astype(int); sy = ((yy - ty) / s).round().astype(int)
        ok = (sx >= 0) & (sy >= 0) & (sx < A.shape[1]) & (sy < A.shape[0])
        a = np.zeros_like(ok); a[ok] = A[sy[ok], sx[ok]]
        b = Bm[yy, xx]
        return (a & b).sum() / max(1, (a | b).sum())
    best = (iou(s0, tx0, ty0), s0, tx0, ty0)
    for step_s, step_t in [(0.01, 4.0), (0.004, 1.5), (0.0015, 0.5)]:
        improved = True
        while improved:
            improved = False
            _, s, tx, ty = best
            for ds in (-step_s, 0, step_s):
                for dx in (-step_t, 0, step_t):
                    for dy in (-step_t, 0, step_t):
                        v = iou(s + ds, tx + dx, ty + dy)
                        if v > best[0] + 1e-5: best = (v, s + ds, tx + dx, ty + dy); improved = True
    v, s, tx, ty = best
    res = dict(s=round(s, 5), tx=round(tx, 3), ty=round(ty, 3), iou=round(float(v), 4), roadsImage=[A.shape[1], A.shape[0]], colourImage=[W, H])
    json.dump(res, open(os.path.join(OUT, 'register.json'), 'w'), indent=1)
    print(res)
    # overlay for a visual check: colour land (green), road land (magenta edges)
    yy, xx = np.mgrid[0:H, 0:W]
    sx = ((xx - tx) / s).round().astype(int); sy = ((yy - ty) / s).round().astype(int)
    ok = (sx >= 0) & (sy >= 0) & (sx < A.shape[1]) & (sy < A.shape[0])
    a = np.zeros((H, W), bool); a[ok] = A[sy[ok], sx[ok]]
    img = np.zeros((H, W, 3), np.uint8); img[Bm] = (40, 120, 40); img[a & ~Bm] = (200, 40, 200); img[~a & Bm] = (240, 200, 40)
    Image.fromarray(img).save(os.path.join(OUT, 'register_overlay.png'))

if __name__ == '__main__':
    main()
