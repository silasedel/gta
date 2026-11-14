"""Shared helpers: deterministic RNG, noise, polyline and polygon utilities.

World frame (CONTRACT5): x east, z south, meters. Everything here is deterministic.
"""
import math
import zlib
import random
import numpy as np
from scipy import ndimage

# ----------------------------------------------------------------------------------------------- world extents
BOUNDS = dict(minX=-25450.0, maxX=5780.0, minZ=-24890.0, maxZ=20440.0)   # = the official map image (1041 x 1511 px) at 30 m per pixel   # whole world incl. ocean margin
REAL = dict(minX=-3708.9257588469422, maxX=4510.855652652842, minZ=-2653.776000000101, maxZ=2653.776000000101)       # real Miami (OSM owns)
CELL = 7.5                                                              # working raster cell (m)
NX = int(round((BOUNDS['maxX'] - BOUNDS['minX']) / CELL))
NZ = int(round((BOUNDS['maxZ'] - BOUNDS['minZ']) / CELL))
SEA_LEVEL = -0.12


def rng(*key):
    """Deterministic random.Random from any hashable key parts."""
    s = '|'.join(str(k) for k in key).encode()
    return random.Random(zlib.crc32(s) * 2654435761 % (2 ** 32))


def nprng(*key):
    s = '|'.join(str(k) for k in key).encode()
    return np.random.default_rng(zlib.crc32(s))


# ----------------------------------------------------------------------------------------------- raster helpers
def grid_xz(cell=CELL):
    """Cell-center coordinate vectors (xs, zs) of the working raster."""
    nx = int(round((BOUNDS['maxX'] - BOUNDS['minX']) / cell))
    nz = int(round((BOUNDS['maxZ'] - BOUNDS['minZ']) / cell))
    xs = BOUNDS['minX'] + (np.arange(nx) + 0.5) * cell
    zs = BOUNDS['minZ'] + (np.arange(nz) + 0.5) * cell
    return xs, zs


def to_px(x, z, cell=CELL):
    return ((x - BOUNDS['minX']) / cell, (z - BOUNDS['minZ']) / cell)


def value_noise(shape, wavelength_px, seed, order=3):
    """Smooth lattice noise in [-1, 1] for a (nz, nx) raster; wavelength in pixels."""
    nz, nx = shape
    r = nprng('vn', seed)
    gz = int(nz / wavelength_px) + 5
    gx = int(nx / wavelength_px) + 5
    lat = r.uniform(-1.0, 1.0, size=(gz, gx)).astype(np.float32)
    oz, ox = r.uniform(0.0, 1.0, size=2)
    zz = (np.arange(nz, dtype=np.float32) / wavelength_px + 1.0 + oz)
    xx = (np.arange(nx, dtype=np.float32) / wavelength_px + 1.0 + ox)
    # separable cubic interpolation via zoom-like map_coordinates on a mesh, done in strips to bound memory
    out = np.empty(shape, dtype=np.float32)
    strip = 512
    for z0 in range(0, nz, strip):
        z1 = min(nz, z0 + strip)
        cz, cx = np.meshgrid(zz[z0:z1], xx, indexing='ij')
        out[z0:z1] = ndimage.map_coordinates(lat, [cz, cx], order=order, mode='reflect')
    return out


def fbm(shape, wavelength_m, seed, octaves=5, gain=0.5, lac=2.0, cell=CELL, ridged=False):
    """Fractal noise, roughly in [-1, 1]."""
    out = np.zeros(shape, dtype=np.float32)
    amp, tot = 1.0, 0.0
    wl = wavelength_m / cell
    for o in range(octaves):
        if wl < 1.5:
            break
        n = value_noise(shape, wl, (seed, o))
        if ridged:
            n = 1.0 - 2.0 * np.abs(n)
        out += amp * n
        tot += amp
        amp *= gain
        wl /= lac
    return out / max(tot, 1e-6)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def sdf(mask, cell=CELL):
    """Signed distance (m): positive inside mask, negative outside."""
    inside = ndimage.distance_transform_edt(mask).astype(np.float32)
    outside = ndimage.distance_transform_edt(~mask).astype(np.float32)
    return (inside - outside) * cell


def raster_polys(polys, shape=None, cell=CELL, value=1, canvas=None):
    """Rasterize shapely polygons / multipolygons (with holes) to a uint8 raster (nz, nx)."""
    from PIL import Image, ImageDraw
    if shape is None:
        shape = (int(round((BOUNDS['maxZ'] - BOUNDS['minZ']) / cell)), int(round((BOUNDS['maxX'] - BOUNDS['minX']) / cell)))
    img = Image.fromarray(canvas) if canvas is not None else Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(img)
    ox, oz = BOUNDS['minX'], BOUNDS['minZ']

    def ring(c):
        return [((x - ox) / cell, (z - oz) / cell) for x, z in c]

    def one(p):
        if p.is_empty:
            return
        if p.geom_type == 'Polygon':
            if len(p.interiors) == 0:
                d.polygon(ring(p.exterior.coords), fill=value)
            else:
                tmp = Image.new('L', img.size, 0)
                td = ImageDraw.Draw(tmp)
                td.polygon(ring(p.exterior.coords), fill=255)
                for h in p.interiors:
                    td.polygon(ring(h.coords), fill=0)
                img.paste(value, mask=tmp)
        elif hasattr(p, 'geoms'):
            for g in p.geoms:
                one(g)

    if hasattr(polys, 'geom_type'):
        one(polys)
    else:
        for p in polys:
            one(p)
    return np.array(img)


# ----------------------------------------------------------------------------------------------- polylines
def catmull(pts, closed=False, step=20.0, alpha=0.5):
    """Centripetal Catmull-Rom through the control points, sampled about every `step` meters."""
    P = [np.array(p, dtype=float) for p in pts]
    n = len(P)
    if n < 3:
        return [tuple(p) for p in P]
    out = []

    def get(i):
        if closed:
            return P[i % n]
        if i < 0:
            return P[0] + (P[0] - P[1])
        if i >= n:
            return P[-1] + (P[-1] - P[-2])
        return P[i]

    segs = n if closed else n - 1
    for i in range(segs):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0), 1e-6) ** alpha
        t2 = t1 + max(np.linalg.norm(p2 - p1), 1e-6) ** alpha
        t3 = t2 + max(np.linalg.norm(p3 - p2), 1e-6) ** alpha
        m = max(2, int(math.ceil(np.linalg.norm(p2 - p1) / step)))
        for k in range(m):
            t = t1 + (t2 - t1) * k / m
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            c = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2
            out.append((float(c[0]), float(c[1])))
    if not closed:
        out.append((float(P[-1][0]), float(P[-1][1])))
    return out


def plen(pts):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def cumlen(pts):
    c = [0.0]
    for a, b in zip(pts, pts[1:]):
        c.append(c[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return c


def point_at(pts, s, cum=None):
    """(x, z, dx, dz) at arc length s along a polyline (clamped)."""
    if cum is None:
        cum = cumlen(pts)
    s = max(0.0, min(cum[-1], s))
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= s:
            lo = mid
        else:
            hi = mid
    a, b = pts[lo], pts[lo + 1]
    L = cum[lo + 1] - cum[lo]
    t = 0.0 if L < 1e-9 else (s - cum[lo]) / L
    dx, dz = (b[0] - a[0]), (b[1] - a[1])
    n = math.hypot(dx, dz) or 1.0
    return (a[0] + dx * t, a[1] + dz * t, dx / n, dz / n)


def resample(pts, step):
    cum = cumlen(pts)
    L = cum[-1]
    if L < 1e-6:
        return list(pts)
    n = max(1, int(round(L / step)))
    return [point_at(pts, L * i / n, cum)[:2] for i in range(n + 1)]


def sub_line(pts, s0, s1):
    """Portion of a polyline between arc lengths s0 < s1 (keeps interior vertices)."""
    cum = cumlen(pts)
    s0 = max(0.0, s0)
    s1 = min(cum[-1], s1)
    out = [point_at(pts, s0, cum)[:2]]
    for p, c in zip(pts, cum):
        if s0 + 1e-6 < c < s1 - 1e-6:
            out.append(tuple(p))
    out.append(point_at(pts, s1, cum)[:2])
    return out


def offset_line(pts, d):
    """Offset a polyline by d meters to the RIGHT of travel (negative = left). Miter-limited."""
    n = len(pts)
    out = []
    for i in range(n):
        if i == 0:
            dx, dz = pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]
        elif i == n - 1:
            dx, dz = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
        else:
            ax, az = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
            bx, bz = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
            la, lb = math.hypot(ax, az) or 1.0, math.hypot(bx, bz) or 1.0
            dx, dz = ax / la + bx / lb, az / la + bz / lb
        L = math.hypot(dx, dz) or 1.0
        dx, dz = dx / L, dz / L
        # right normal of travel direction (dx, dz) in x-east / z-south (map view, z down): (-dz, dx)
        nx, nz = -dz, dx
        k = 1.0
        if 0 < i < n - 1:
            ax, az = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
            la = math.hypot(ax, az) or 1.0
            c = (ax / la) * dx + (az / la) * dz
            k = 1.0 / max(c, 0.5)
        out.append((pts[i][0] + nx * d * k, pts[i][1] + nz * d * k))
    return out


def chaikin(pts, closed=False, n=1):
    for _ in range(n):
        out = []
        m = len(pts)
        rngi = range(m) if closed else range(m - 1)
        if not closed:
            out.append(pts[0])
        for i in rngi:
            a, b = pts[i], pts[(i + 1) % m]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        if not closed:
            out.append(pts[-1])
        pts = out
    return pts


def heading_of(dx, dz):
    """Game heading (radians): 0 faces +Z (south), atan2(dx, dz)."""
    return math.atan2(dx, dz)


def rot(px, pz, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (px * c - pz * s, px * s + pz * c)


def box(cx, cz, w, d, ang=0.0):
    """Rectangle ring centered at (cx, cz): w along local x, d along local z, rotated by ang (radians, x toward z)."""
    hw, hd = w / 2.0, d / 2.0
    out = []
    for lx, lz in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)):
        rx, rz = rot(lx, lz, ang)
        out.append((cx + rx, cz + rz))
    return out


def xf(local_pts, ox, oz, ang):
    """Transform local (u along, v right) points to world: u axis rotated by ang."""
    out = []
    for u, v in local_pts:
        rx, rz = rot(u, v, ang)
        out.append((ox + rx, oz + rz))
    return out


def ellipse(cx, cz, rx, rz, ang=0.0, n=40):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        px, pz = rot(rx * math.cos(t), rz * math.sin(t), ang)
        out.append((cx + px, cz + pz))
    return out


def r2(p):
    return (round(p[0], 2), round(p[1], 2))
