"""Read-only access to the real-Miami side: edge summary (from world-osm) and the raw OSM cache.

Used for (a) the seamless coast blend just outside the real rectangle, (b) joining every road that
crosses the rectangle edge, (c) drawing real Miami in the map preview, (d) obstacle heights under the
airport approach paths. Nothing here writes outside tools/world/out/.
"""
import json
import math
import os
import pickle
from shapely.geometry import LineString, Point, Polygon, box as sbox
from shapely.ops import unary_union, polygonize, linemerge
from shapely import STRtree
from .util import REAL

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OSM_CACHE = os.path.join(ROOT, 'tools', 'osm', 'cache')
OUT = os.path.join(ROOT, 'tools', 'world', 'out')
CACHE = os.path.join(OUT, 'cache')

LAT0, LON0 = 25.7790, -80.1650
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
PAD = 1000.0      # real coast is polygonized this far outside the rectangle


def proj(lon, lat):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


def _load(name):
    for sub in ('v2', ''):
        p = os.path.join(OSM_CACHE, sub, name + '.json')
        if os.path.exists(p):
            with open(p) as f:
                return json.load(f)['elements'], p
    return None, None


def edge_summary():
    p = os.path.join(OSM_CACHE, 'edge_summary.json')
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def real_rect_poly(pad=0.0):
    return sbox(REAL['minX'] - pad, REAL['minZ'] - pad, REAL['maxX'] + pad, REAL['maxZ'] + pad)


def _land_from_coast(elements, B):
    coast = []
    for e in elements:
        g = e.get('geometry')
        if e.get('type') == 'way' and g and len(g) >= 2:
            coast.append(LineString([proj(n['lon'], n['lat']) for n in g]))
    merged = linemerge(coast, directed=True)
    chains = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    clipped = []
    for c in chains:
        g = c.intersection(B)
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if isinstance(p, LineString) and not p.is_empty:
                clipped.append(p)
    probesL, probesR = [], []
    for ln in clipped:
        c = list(ln.coords)
        for i in range(len(c) - 1):
            (x0, z0), (x1, z1) = c[i], c[i + 1]
            dx, dz = x1 - x0, z1 - z0
            L = math.hypot(dx, dz)
            if L < 0.5:
                continue
            mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
            nx, nz = dz / L * 0.2, -dx / L * 0.2          # left of travel (OSM: land on the left)
            probesL.append(Point(mx + nx, mz + nz))
            probesR.append(Point(mx - nx, mz - nz))
    faces = list(polygonize(unary_union(clipped + [B.exterior])))
    tl, tr = STRtree(probesL), STRtree(probesR)
    land = [f for f in faces if len(tl.query(f, predicate='contains')) > len(tr.query(f, predicate='contains'))]
    return unary_union(land)


ROAD_KINDS = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
              'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service'}


def _poly_of(e):
    g = e.get('geometry')
    if e.get('type') == 'way' and g and len(g) >= 4:
        c = [proj(n['lon'], n['lat']) for n in g]
        if c[0] == c[-1]:
            try:
                p = Polygon(c)
                if not p.is_valid:
                    p = p.buffer(0)
                return p
            except Exception:
                return None
    if e.get('type') == 'relation':
        outers, inners = [], []
        for m in e.get('members', []):
            g = m.get('geometry')
            if m.get('type') == 'way' and g and len(g) >= 2:
                (outers if m.get('role') != 'inner' else inners).append(LineString([proj(n['lon'], n['lat']) for n in g]))
        try:
            po = unary_union(list(polygonize(unary_union(outers)))) if outers else None
            if po is None or po.is_empty:
                return None
            if inners:
                pi = unary_union(list(polygonize(unary_union(inners))))
                po = po.difference(pi)
            return po
        except Exception:
            return None
    return None


def _height(tags):
    for k in ('height', 'building:height'):
        v = tags.get(k)
        if v:
            try:
                return float(str(v).replace('m', '').strip())
            except ValueError:
                pass
    v = tags.get('building:levels')
    if v:
        try:
            return float(v) * 3.4 + 2.0
        except ValueError:
            pass
    return 0.0


def load_real(force=False):
    """Returns dict(land, roads, water, parks, beaches, buildings, src). Cached in tools/world/out/cache/real.pkl."""
    os.makedirs(CACHE, exist_ok=True)
    pk = os.path.join(CACHE, 'real.pkl')
    coast, cpath = _load('coastline')
    stamp = None
    if cpath:
        stamp = [REAL['minX'], REAL['maxZ'], PAD, os.path.getmtime(cpath)] + [os.path.getmtime(p) for p in
                                              (os.path.join(os.path.dirname(cpath), n + '.json') for n in ('highways', 'areas', 'buildings'))
                                              if os.path.exists(p)]
    if os.path.exists(pk) and not force:
        with open(pk, 'rb') as f:
            d = pickle.load(f)
        if d.get('stamp') == stamp:
            return d
    d = dict(stamp=stamp, land=None, roads=[], water=[], parks=[], beaches=[], buildings=[], src=cpath)
    if coast is None:
        return d
    B = real_rect_poly(PAD)
    d['land'] = _land_from_coast(coast, B)
    hw, _ = _load('highways')
    for e in hw or []:
        t = e.get('tags', {})
        k = t.get('highway')
        g = e.get('geometry')
        if k in ROAD_KINDS and g and len(g) >= 2:
            if k == 'service' and t.get('service') in ('parking_aisle', 'driveway', 'drive-through', 'alley'):
                continue
            pts = [proj(n['lon'], n['lat']) for n in g]
            d['roads'].append(dict(pts=pts, kind=k, name=t.get('name', ''), ref=t.get('ref', ''), bridge=t.get('bridge') not in (None, 'no'),
                                   oneway=t.get('oneway') == 'yes', lanes=t.get('lanes', '')))
    ar, _ = _load('areas')
    for e in ar or []:
        t = e.get('tags', {})
        kind = None
        if t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock') or t.get('landuse') in ('basin', 'reservoir'):
            if t.get('water') in ('swimming_pool', 'fountain', 'reflecting_pool', 'wastewater', 'pool'):
                continue
            kind = 'water'
        elif t.get('leisure') in ('park', 'garden', 'golf_course', 'nature_reserve', 'pitch') or t.get('landuse') in ('grass', 'recreation_ground', 'cemetery', 'forest') or t.get('natural') in ('wood', 'scrub', 'grassland'):
            kind = 'parks'
        elif t.get('natural') in ('beach', 'sand'):
            kind = 'beaches'
        if kind:
            p = _poly_of(e)
            if p is not None and not p.is_empty and p.area > 60:
                d[kind].append(p)
    bl, _ = _load('buildings')
    for e in bl or []:
        t = e.get('tags', {})
        if 'building' not in t and 'building:part' not in t:
            continue
        g = e.get('geometry')
        if e.get('type') == 'way' and g and len(g) >= 4:
            c = [proj(n['lon'], n['lat']) for n in g]
            d['buildings'].append((c, _height(t)))
    with open(pk, 'wb') as f:
        pickle.dump(d, f)
    return d
