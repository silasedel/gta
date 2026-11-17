#!/usr/bin/env python
"""Fit the user's detailed Key Largo image (docs/v2/plan/keys_detail.webp) onto the main map's Key Largo strip.

Similarity transform  world = R(rot) * (px, py) * mpp + (tx, tz)   (x' = x cos - y sin, z' = x sin + y cos).

- mpp is pinned near 0.95 m/px: the two-lane highway is ~12 px wide (11 m) and houses are 12-15 px (12-15 m).
- The image's north tip (the wide road ends at the shore at px (785, 232), i.e. the highway's bridge to the mainland) is
  anchored on the main map's Overseas Highway from Florida City (it reaches the strip there), within +-30 m across it.
- Rotation / position along that highway maximize land IoU of the image's main island against the main map's strip land
  (features.json of a build WITHOUT the Keys detail; cached in out/keys_main_cache.json by keys_detail.py).
Writes tools/v2/map3/out/keys_fit.json.
"""
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from shapely.geometry import Polygon, LineString
from shapely import contains_xy

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'out')
TIP = (785.0, 232.0)
# the main map's highway from the north where it reaches Key Largo (features.json r6550/r6551 of the pre-detail build)
TRUNK = LineString([(-924.15, 4556.71), (-836.0, 4804.0)])


def water_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    w = (b - r > 18) & (b > 0.78 * g)            # deep blue and turquoise shallows; vegetation / sand / roofs are not
    return ndimage.gaussian_filter(w.astype(np.float32), 2.0) > 0.5


def main_strip():
    """Main-map land around the strip from a build WITHOUT the Keys detail (cached by keys_detail.load_main)."""
    sys.path.insert(0, HERE)
    from keys_detail import load_main
    return load_main()['land']


def main():
    rgb = np.asarray(Image.open(os.path.join(ROOT, 'docs/v2/plan/keys_detail.webp')).convert('RGB')).astype(np.float32)
    land = ~water_mask(rgb)
    land[:350, 900:] = False                     # the NE islet is not part of the strip the main map draws
    H, W = land.shape
    yy, xx = np.mgrid[0:H:8, 0:W:8]
    X = xx.ravel().astype(float); Y = yy.ravel().astype(float); PL = land[yy.ravel(), xx.ravel()]
    strip = Polygon([(-650, 4650), (-1050, 4600), (-2150, 6150), (-2000, 6400), (-1800, 6350), (-550, 4850)])
    S = main_strip().intersection(strip)
    best = None
    for mpp in (0.93, 0.95, 0.97):
        for rotd in np.arange(-12, 0.01, 1.0):
            rot = math.radians(rotd); c, s = math.cos(rot), math.sin(rot)
            for d in np.arange(40, 220, 10):
                q = TRUNK.interpolate(d)
                for off in range(-30, 31, 10):     # across the highway (its normal ~ (0.94, -0.34))
                    ax, az = q.x + off * 0.942, q.y - off * 0.336
                    tx = ax - (TIP[0] * c - TIP[1] * s) * mpp; tz = az - (TIP[0] * s + TIP[1] * c) * mpp
                    wx = (X * c - Y * s) * mpp + tx; wz = (X * s + Y * c) * mpp + tz
                    ML = contains_xy(S, wx, wz)
                    iou = (ML & PL).sum() / max(1, (ML | PL).sum())
                    sc = iou - 0.002 * abs(off) / 10 - 0.02 * abs(mpp - 0.95) / 0.02
                    if best is None or sc > best[0]:
                        best = (sc, iou, mpp, rot, tx, tz, d, off)
    sc, iou, mpp, rot, tx, tz, d, off = best
    res = dict(mpp=mpp, rot=round(rot, 5), tx=round(float(tx), 2), tz=round(float(tz), 2), landIoU=round(float(iou), 3), image=[W, H],
               anchor=dict(px=list(TIP), along=float(d), across=off))
    json.dump(res, open(os.path.join(OUT, 'keys_fit.json'), 'w'), indent=1)
    print(res)


if __name__ == '__main__':
    main()
