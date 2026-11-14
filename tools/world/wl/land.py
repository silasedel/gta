"""Landmass synthesis: authored shapes -> signed-distance field + coast-character noise -> organic coast,
blended into the real OSM coast just outside the real-Miami rectangle. Also coastal land-cover bands
(beach, dune scrub, mangrove fringe, salt marsh) and the bathymetry raster.
"""
import hashlib
import math
import os
import pickle
import time
import numpy as np
from scipy import ndimage
from shapely.geometry import Polygon, LineString, MultiPolygon, Point
from shapely.ops import unary_union
from shapely.prepared import prep
from . import design as D
from . import real as R
from .util import (BOUNDS, REAL, CELL, NX, NZ, catmull, ellipse, fbm, sdf, smoothstep, raster_polys, grid_xz, rng)

BLEND = 420.0          # real coast -> our coast blend distance outside the rectangle (m)
ZONE_TYPES = ['wild', 'beach', 'mangrove', 'marsh', 'rock', 'pin', 'dev']
# noise amplitude (m) for (extra-large 5 km, large 1800 m, mid 420 m, fine ridged 150 m) per coast character
ZONE_AMP = {'wild': (85, 48, 22, 6), 'beach': (40, 14, 3, 0), 'mangrove': (60, 55, 75, 48), 'marsh': (70, 45, 46, 26), 'rock': (60, 40, 34, 14),
            'pin': (0, 0, 0, 0), 'dev': (0, 20, 11, 0)}


def _poly(pts):
    p = Polygon(pts)
    return p if p.is_valid else p.buffer(0)


def authored_shapes():
    """Shapely geometry of the authored land (before noise) and named parts."""
    parts = {}
    parts['mainland'] = _poly(catmull(D.MAINLAND, closed=True, step=30))
    for k, loop in D.ISLANDS.items():
        parts[k] = _poly(catmull(loop, closed=True, step=20))
    for k, (cx, cz, rx, rz, a) in D.ELLIPSE_ISLANDS.items():
        parts[k] = _poly(ellipse(cx, cz, rx, rz, math.radians(a), 48))
    for k, (pts, w) in D.STROKES.items():
        parts[k] = LineString(catmull(pts, step=15)).buffer(w / 2.0, resolution=8)
    base = unary_union(list(parts.values()))
    # islet scatter fields: only in open water, clear of the authored land
    islets = []
    for name, poly, count, (r0, r1), seed in D.ISLET_FIELDS:
        P = _poly(poly)
        minx, minz, maxx, maxz = P.bounds
        rr = rng('islets', name, seed)
        placed, tries = 0, 0
        chosen = []
        while placed < count and tries < count * 60:
            tries += 1
            x, z = rr.uniform(minx, maxx), rr.uniform(minz, maxz)
            r = r0 + (r1 - r0) * rr.random() ** 1.8
            pt = Point(x, z)
            if not P.contains(pt) or base.distance(pt) < r + 55:
                continue
            if any(math.hypot(x - cx, z - cz) < r + cr + 45 for cx, cz, cr in chosen):
                continue
            chosen.append((x, z, r))
            e = _poly(ellipse(x, z, r, r * rr.uniform(0.38, 0.8), rr.uniform(0, math.pi), 20))
            islets.append(e)
            placed += 1
    parts['islets'] = unary_union(islets)
    cuts = [LineString(catmull(pts, step=15)).buffer(w / 2.0, resolution=6) for pts, w in D.CUT_STROKES.values()]
    cuts += [_poly(catmull(p, closed=True, step=25)) for p in D.CUT_POLYS.values()]
    base = unary_union([base, parts['islets']]).difference(unary_union(cuts))
    return base, parts


def _zone_rasters(shape):
    idx = np.zeros(shape, dtype=np.uint8)
    for kind, poly in D.COAST_ZONES:
        idx = raster_polys([_poly(poly)], shape, value=ZONE_TYPES.index(kind), canvas=idx)
    amps = []
    for j in range(4):
        lut = np.array([ZONE_AMP[t][j] for t in ZONE_TYPES], dtype=np.float32)
        a = lut[idx]
        amps.append(ndimage.gaussian_filter(a, 110.0 / CELL))
    return idx, amps


def _polys_from_mask(mask, sigma=1.0, level=0.5, simplify=1.2, min_area=120.0):
    """Smooth vector outlines of a raster mask: list of shapely Polygons with holes."""
    from contourpy import contour_generator, FillType
    g = ndimage.gaussian_filter(mask.astype(np.float32), sigma)
    xs, zs = grid_xz()
    cg = contour_generator(x=xs, y=zs, z=g, fill_type=FillType.OuterOffset)
    pts, offs = cg.filled(level, 10.0)
    out = []
    for p, o in zip(pts, offs):
        rings = [p[o[i]:o[i + 1]] for i in range(len(o) - 1)]
        if len(rings[0]) < 4:
            continue
        poly = Polygon(rings[0], [r for r in rings[1:] if len(r) >= 4])
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or poly.area < min_area:
            continue
        poly = poly.simplify(simplify, preserve_topology=True)
        for q in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
            if q.area >= min_area:
                out.append(q)
    return out


def _drop_small(mask, min_cells):
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum_labels(np.ones_like(lab, dtype=np.int32), lab, index=np.arange(1, n + 1))
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = sizes >= min_cells
    return keep[lab]


def synthesize(real, verbose=True):
    t0 = time.time()
    shape = (NZ, NX)
    xs, zs = grid_xz()
    base, parts = authored_shapes()
    m0 = raster_polys(base, shape) > 0
    f = sdf(m0)
    zidx, (a0, a1, a2, a3) = _zone_rasters(shape)
    if verbose:
        print(f'  land: base sdf {time.time()-t0:.1f}s')
    f += a0 * fbm(shape, 5200.0, 'coastXL', octaves=2)
    f += a1 * fbm(shape, 1800.0, 'coastL', octaves=3)
    f += a2 * fbm(shape, 420.0, 'coastM', octaves=4)
    f += a3 * fbm(shape, 150.0, 'coastF', octaves=3, ridged=True)
    del a0, a1, a2, a3
    if verbose:
        print(f'  land: noise {time.time()-t0:.1f}s')
    # --- blend into the real coast just outside the rectangle
    X = xs[None, :]
    Z = zs[:, None]
    dx = np.maximum(np.maximum(REAL['minX'] - X, X - REAL['maxX']), 0.0)
    dz = np.maximum(np.maximum(REAL['minZ'] - Z, Z - REAL['maxZ']), 0.0)
    dout = np.sqrt(dx * dx + dz * dz).astype(np.float32)           # 0 inside the rectangle
    if real.get('land') is not None:
        mr = raster_polys(real['land'], shape) > 0
        # only the padded box is known; compute the real sdf inside it
        fr = sdf(mr)
        w = smoothstep(40.0, BLEND, dout)                          # 0 near/inside rect -> 1 far
        f = w * f + (1.0 - w) * fr
        del fr, mr
    mask = f > 0.0
    # --- cleanup: no specks of land or water
    mask = _drop_small(mask, int(260 / (CELL * CELL)))
    mask = ~_drop_small(~mask, int(200 / (CELL * CELL)))
    if verbose:
        print(f'  land: mask {time.time()-t0:.1f}s, land cells {int(mask.sum())}')
    return dict(mask=mask, zidx=zidx, parts=parts, dout=dout)


def vectorize(mask):
    polys = _polys_from_mask(mask)
    # holes = enclosed water (ponds / lagoons): returned separately, land is emitted without holes
    ponds = []
    solid = []
    for p in polys:
        for h in p.interiors:
            hp = Polygon(h)
            if hp.area > 90:
                ponds.append(hp)
        solid.append(Polygon(p.exterior))
    return solid, ponds


def coastal_bands(mask, zidx):
    """Beach, dune scrub, mangrove fringe and salt marsh polygons from the final land raster."""
    shape = mask.shape
    d_in = ndimage.distance_transform_edt(mask).astype(np.float32) * CELL
    n = fbm(shape, 260.0, 'bands', octaves=3)
    out = {}
    T = ZONE_TYPES.index
    beach_w = 46.0 + 18.0 * n
    beach = mask & (zidx == T('beach')) & (d_in < beach_w)
    out['beach'] = _polys_from_mask(beach, sigma=0.8, min_area=200)
    scrub = mask & (zidx == T('beach')) & (d_in >= beach_w) & (d_in < beach_w + 55 + 25 * n)
    out['scrub'] = _polys_from_mask(scrub, sigma=0.8, min_area=300)
    mang = mask & (zidx == T('mangrove')) & (d_in < 120.0 + 70.0 * n)
    out['mangrove'] = _polys_from_mask(mang, sigma=0.8, min_area=300)
    marsh = mask & (zidx == T('marsh')) & (d_in < 90.0 + 50.0 * n)
    out['wetland'] = _polys_from_mask(marsh, sigma=0.8, min_area=300)
    rock = mask & (zidx == T('rock')) & (d_in < 22.0 + 10.0 * n)
    out['sand'] = _polys_from_mask(rock, sigma=0.8, min_area=300)
    return out


def bathymetry(mask, reef_polys=None):
    """Seabed depth (m, positive down) on the working raster. 0 on land."""
    shape = mask.shape
    xs, zs = grid_xz()
    d = ndimage.distance_transform_edt(~mask).astype(np.float32) * CELL          # distance to land
    zone = np.zeros(shape, dtype=np.uint8)                                        # 0 atlantic, 1 flats, 2 lagoon, 3 gulf
    for kind, poly in D.SEA_ZONES:
        zone = raster_polys([_poly(poly)], shape, value={'flats': 1, 'lagoon': 2, 'gulf': 3}[kind], canvas=zone)
    zf = [ndimage.gaussian_filter((zone == k).astype(np.float32), 160.0 / CELL) for k in range(4)]
    tot = zf[0] + zf[1] + zf[2] + zf[3] + 1e-6
    n1 = fbm(shape, 900.0, 'bathy1', octaves=4)
    n2 = fbm(shape, 240.0, 'bathy2', octaves=3, ridged=True)
    # reef-line distance for the Atlantic shelf break
    reef = LineString(catmull(D.REEF_LINE, step=40))
    rl = raster_polys([reef.buffer(30)], shape) > 0
    d_reef = ndimage.distance_transform_edt(~rl).astype(np.float32) * CELL
    atl = np.minimum(0.35 + 0.0105 * d + 1.2 * n1, 9.5 + 1.5 * n1)
    seaward = raster_polys([_poly(catmull(D.REEF_LINE, step=40) + [(-5750, 8300), (5400, 8300), (5400, 3100)])], shape) > 0
    atl = atl + np.where(seaward, np.minimum(d_reef * 0.055, 34.0), 0.0)
    atl = np.maximum(atl, np.clip((d - 700.0) * 0.03, 0.0, 34.0) * (zs[:, None] < 3000))
    flats = 0.25 + 0.0032 * d + 0.55 * (n1 * 0.5 + 0.5) + 0.9 * np.clip(n2 - 0.35, 0.0, 1.0) * 2.2   # banks 0.3-2 m with tidal runnels
    flats = np.minimum(flats, 2.6)
    lagoon = np.minimum(0.4 + 0.012 * d + 0.5 * (n1 * 0.5 + 0.5), 3.4)
    gulf = np.minimum(0.3 + 0.0058 * d + 0.9 * n1, 16.0)
    depth = (zf[0] * atl + zf[1] * flats + zf[2] * lagoon + zf[3] * gulf) / tot
    del atl, flats, lagoon, gulf, zf, tot
    # channels (dredged or tidal): smooth trapezoid cross-section
    for name, pts, w, dep in D.CHANNELS:
        ln = LineString(catmull(pts, step=25))
        cm = raster_polys([ln.buffer(w * 1.6)], shape) > 0
        ys, xs_i = np.where(cm)
        if len(ys) == 0:
            continue
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs_i.min(), xs_i.max() + 1
        core = raster_polys([ln.buffer(w * 0.5)], shape)[y0:y1, x0:x1] > 0
        dc = ndimage.distance_transform_edt(~core).astype(np.float32) * CELL
        k = 1.0 - smoothstep(0.0, w * 0.9, dc)
        sub = depth[y0:y1, x0:x1]
        depth[y0:y1, x0:x1] = np.maximum(sub, dep * k + sub * (1 - k) * 0.0 + np.minimum(sub, dep) * (1 - k))
    # reef patches rise toward the surface
    if reef_polys:
        rm = raster_polys(reef_polys, shape) > 0
        dr = ndimage.distance_transform_edt(rm).astype(np.float32) * CELL
        crest = np.clip(dr / 60.0, 0.0, 1.0)
        depth = np.where(rm, depth * (1 - 0.82 * crest) + (1.2 + 1.0 * (n2 * 0.5 + 0.5)) * 0.82 * crest, depth)
    depth = np.maximum(depth, 0.2)
    depth[mask] = 0.0
    return depth.astype(np.float32)


def cached(real, force=False):
    """synthesize() result cached on the hash of the design + this file + the real stamp."""
    os.makedirs(R.CACHE, exist_ok=True)
    h = hashlib.sha1()
    for fn in (D.__file__, __file__, os.path.join(os.path.dirname(__file__), 'util.py')):
        with open(fn, 'rb') as f:
            h.update(f.read())
    h.update(repr(real.get('stamp')).encode())
    key = h.hexdigest()
    pk = os.path.join(R.CACHE, 'land.pkl')
    if os.path.exists(pk) and not force:
        with open(pk, 'rb') as f:
            d = pickle.load(f)
        if d.get('key') == key:
            return d
    d = synthesize(real)
    d['key'] = key
    d['solid'], d['ponds'] = vectorize(d['mask'])
    d['bands'] = coastal_bands(d['mask'], d['zidx'])
    d.pop('dout', None)
    d['mask'] = np.packbits(d['mask'])
    with open(pk, 'wb') as f:
        pickle.dump(d, f, protocol=4)
    return d


def unpack_mask(d):
    return np.unpackbits(d['mask'])[:NZ * NX].reshape(NZ, NX).astype(bool)
