"""Polygon rasterisation on the world grid (PIL), hole-aware, plus RLE encoding."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import Polygon
from shapely import STRtree
from config import bounds
from osmgeom import polys_only

X0, Z0, X1, Z1 = bounds()


class Grid:
    def __init__(self, res):
        self.res = res
        self.W = int(math.ceil((X1 - X0) / res))
        self.H = int(math.ceil((Z1 - Z0) / res))

    def _t(self, coords):
        r = self.res
        return [((x - X0) / r - 0.5, (z - Z0) / r - 0.5) for x, z in coords]

    def mask(self, geom):
        """Boolean mask (H, W) of a polygonal geometry (or list of geometries), holes respected."""
        img = Image.new('L', (self.W, self.H), 0)
        dr = ImageDraw.Draw(img)
        polys = []
        for g in (geom if isinstance(geom, (list, tuple)) else [geom]):
            polys += polys_only(g)
        if not polys:
            return np.zeros((self.H, self.W), bool)
        holes = []
        for p in polys:
            for h in p.interiors:
                holes.append(Polygon(h))
        depth = [0] * len(polys)
        if holes:
            tree = STRtree(holes)
            for i, p in enumerate(polys):
                if p.area < 1:
                    continue
                rp = p.representative_point()
                depth[i] = len(tree.query(rp, predicate='within'))
        order = sorted(range(len(polys)), key=lambda i: depth[i])
        for i in order:
            p = polys[i]
            c = self._t(p.exterior.coords)
            if len(c) >= 3:
                dr.polygon(c, fill=255)
            for h in p.interiors:
                c = self._t(h.coords)
                if len(c) >= 3:
                    dr.polygon(c, fill=0)
        return np.asarray(img) > 127

    def lines_mask(self, lines_with_width):
        """[(LineString, width_m)] -> mask by drawing thick lines (fast for many thin features)."""
        img = Image.new('L', (self.W, self.H), 0)
        dr = ImageDraw.Draw(img)
        for ln, w in lines_with_width:
            c = self._t(ln.coords)
            wp = max(1, int(round(w / self.res)))
            dr.line(c, fill=255, width=wp, joint='curve')
        return np.asarray(img) > 127

    def cell(self, x, z):
        i = int((x - X0) / self.res)
        j = int((z - Z0) / self.res)
        return min(max(i, 0), self.W - 1), min(max(j, 0), self.H - 1)

    def center(self, i, j):
        return X0 + (i + 0.5) * self.res, Z0 + (j + 0.5) * self.res


def dilate(mask, px):
    """Binary dilation by ~px pixels (square), via PIL MaxFilter."""
    img = Image.fromarray((mask * 255).astype(np.uint8))
    while px > 0:
        k = min(px, 3)
        img = img.filter(ImageFilter.MaxFilter(2 * k + 1))
        px -= k
    return np.asarray(img) > 127


def distance_steps(mask, steps):
    """Chebyshev-ish distance (in pixels) from True cells, capped at steps."""
    dist = np.full(mask.shape, steps, np.int32)
    dist[mask] = 0
    img = Image.fromarray((mask * 255).astype(np.uint8))
    for s in range(1, steps):
        img = img.filter(ImageFilter.MaxFilter(3))
        m = np.asarray(img) > 127
        dist[(dist == steps) & m] = s
    return dist


def label_fill(lab, unknown, steps=200):
    """Fill cells == unknown with nearest known label by iterative propagation (4-neighbour)."""
    lab = lab.copy()
    for _ in range(steps):
        u = lab == unknown
        if not u.any():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(lab, (dy, dx), axis=(0, 1))
            m = u & (sh != unknown)
            lab[m] = sh[m]
            u = lab == unknown
    return lab


def rle(arr):
    """uint8 2D -> bytes of (value u8, run u16 LE) triples, row-major, runs split at 65535."""
    a = arr.ravel()
    n = a.size
    change = np.flatnonzero(np.diff(a)) + 1
    starts = np.concatenate([[0], change])
    ends = np.concatenate([change, [n]])
    out = bytearray()
    for s, e in zip(starts.tolist(), ends.tolist()):
        v = int(a[s])
        L = e - s
        while L > 0:
            k = min(L, 65535)
            out += bytes((v, k & 255, k >> 8))
            L -= k
    return bytes(out)
