import os as _os_nosm
"""Geometry helpers: OSM JSON (Overpass 'out body geom') -> shapely geometry in the world frame."""
import json, os, re
from shapely.geometry import LineString, Polygon, MultiPolygon, GeometryCollection, box
from shapely.ops import unary_union, polygonize, linemerge
from shapely import make_valid
from config import proj, bounds, real_bounds

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache', 'v2')      # V2 pull; the V1 pull stays in cache/*.json


_loaded = {}


def load(name):
    if _os_nosm.environ.get('MIAMI_NO_OSM') == '1':
        return []          # stage 1 map v3: no real-Miami data
    if name not in _loaded:
        with open(os.path.join(CACHE, name + '.json')) as f:
            _loaded[name] = json.load(f)['elements']
    return _loaded[name]


def pts(geom):
    return [proj(p['lon'], p['lat']) for p in geom if p is not None]


def way_line(e):
    c = pts(e.get('geometry') or [])
    return LineString(c) if len(c) >= 2 else None


def polys_only(g):
    """Return a list of Polygons from any geometry."""
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    if isinstance(g, GeometryCollection):
        out = []
        for x in g.geoms:
            out += polys_only(x)
        return out
    return []


def fix(g):
    if g is None or g.is_empty:
        return None
    if not g.is_valid:
        g = make_valid(g)
    ps = [p for p in polys_only(g) if p.area > 0.01]
    if not ps:
        return None
    return ps[0] if len(ps) == 1 else MultiPolygon(ps)


def way_poly(e):
    c = pts(e.get('geometry') or [])
    if len(c) < 4 or c[0] != c[-1]:
        return None
    try:
        return fix(Polygon(c))
    except Exception:  # noqa: BLE001
        return None


def rel_poly(e):
    outer, inner = [], []
    for m in e.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'):
            continue
        c = pts(m['geometry'])
        if len(c) < 2:
            continue
        (inner if m.get('role') == 'inner' else outer).append(LineString(c))
    if not outer:
        return None

    def rings(lines):
        merged = linemerge(lines) if len(lines) > 1 else lines[0]
        return [p for p in polygonize(merged)] if not merged.is_empty else []

    try:
        o = unary_union([fix(p) for p in rings(outer) if fix(p)])
        if inner:
            i = unary_union([fix(p) for p in rings(inner) if fix(p)])
            o = o.difference(i)
        return fix(o)
    except Exception:  # noqa: BLE001
        return None


def elem_poly(e):
    if e['type'] == 'way':
        return way_poly(e)
    if e['type'] == 'relation':
        return rel_poly(e)
    return None


def world_box(pad=0.0):
    """The REAL (OSM) rectangle as a shapely box; all OSM geometry is clipped to it."""
    x0, z0, x1, z1 = real_bounds()
    return box(x0 - pad, z0 - pad, x1 + pad, z1 + pad)


_num = re.compile(r'[-+]?\d*\.?\d+')


def parse_len(v):
    """'12', '12 m', '40 ft', "40'", '12.5;13' -> metres or None."""
    if v is None:
        return None
    s = str(v).strip().lower().split(';')[0]
    m = _num.search(s)
    if not m:
        return None
    x = float(m.group())
    if "'" in s or 'ft' in s or 'feet' in s:
        x *= 0.3048
        m2 = re.search(r"'\s*(\d+)", s)
        if m2:
            x += float(m2.group(1)) * 0.0254
    return x if x > 0 else None


def parse_speed(v):
    if not v:
        return None
    s = str(v).lower()
    m = _num.search(s)
    if not m:
        return None
    x = float(m.group())
    return x * 1.609344 if 'mph' in s else x
