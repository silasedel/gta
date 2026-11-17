"""Ingest the synthetic world (tools/world/out/features.json + heights.bin, see tools/world/FORMAT.md)
into the same internal records the OSM stages produce, so one pipeline tiles the whole merged world.

Everything synthetic is clipped out of the real rectangle (road stubs up to their join points excepted).
"""
import json, math, os
from collections import defaultdict
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely import STRtree, prepare, contains_xy
from config import REAL_RECT
from osmgeom import fix, polys_only

# FORMAT area kind -> (cls, surface, zone)
AREA = {
    'beach': ('sand', 'sand', 'beach'), 'sand': ('sand', 'sand', None), 'park': ('park', 'grass_short', 'park'),
    'grass': ('grass', 'grass_short', None), 'scrub': ('scrub', 'grass_long', 'wilderness'),
    'forest': ('forest', 'grass_long', 'wilderness'), 'pine': ('pine', 'grass_long', 'wilderness'),
    'sawgrass': ('sawgrass', 'grass_long', 'wilderness'), 'wetland': ('wetland', 'grass_long', 'wilderness'),
    'mangrove': ('mangrove', 'dirt', 'wilderness'), 'farmland': ('farmland', 'dirt', 'rural'),
    'grove': ('grove', 'grass_short', 'rural'), 'dirt': ('dirt', 'dirt', None), 'parking': ('parking', 'asphalt', None),
    'paved': ('paved', 'concrete', None), 'apron': ('apron', 'concrete', 'airport'),
    'runway': ('runway', 'asphalt', 'airport'), 'taxiway': ('taxiway', 'asphalt', 'airport'),
    'residential': ('lu_residential', None, 'residential'), 'commercial': ('lu_commercial', None, 'commercial'),
    'industrial': ('lu_industrial', None, 'industrial'), 'campground': ('campground', 'dirt', 'park'),
    'golf': ('golf', 'grass_short', 'park'), 'marina': ('marina', 'concrete', None), 'plaza': ('plaza', 'pavers', None),
    'pitch': ('pitch', 'grass_short', 'park'), 'playground': ('playground', 'grass_short', 'park'),
    'airport': ('lu_airport', None, 'airport'), 'port': ('lu_industrial', None, 'port'), 'rock': ('rock', 'gravel', None),
    'gravel': ('gravel', 'gravel', None), 'pool': ('pool', 'tile', None), 'cemetery': ('park', 'grass_short', 'park'),
    'dune': ('dune', 'sand', 'beach'), 'marsh': ('wetland', 'grass_long', 'wilderness'), 'reef': (None, None, None),
    'seagrass': (None, None, None),
}
ROAD_KINDS = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
              'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'track', 'road'}
PATH_KIND = {'footway': 'footway', 'boardwalk': 'footway', 'trail': 'path', 'path': 'path', 'cycleway': 'cycleway',
             'steps': 'steps', 'sidewalk': 'sidewalk', 'crossing': 'crossing', 'pedestrian': 'pedestrian'}
TREE_TYPES = ['tree', 'palm', 'royal_palm', 'coconut', 'oak', 'pine', 'cypress', 'mangrove', 'citrus', 'gumbo', 'banyan', 'seagrape']
PROP_ALIAS = {'street_lamp': 'lamp', 'lamp': 'lamp', 'signal': 'signal', 'traffic_signals': 'signal', 'traffic_light': 'signal',
              'bus_stop': 'bus', 'bus': 'bus', 'stop': 'stop', 'stop_sign': 'stop', 'crossing': 'crossing',
              'waste_basket': 'waste', 'bin': 'waste', 'trash': 'waste', 'fountain': 'fountain', 'bike_rack': 'bike',
              'bicycle_parking': 'bike', 'hydrant': 'hydrant', 'fire_hydrant': 'hydrant', 'bench': 'bench'}


def ring_poly(outer, holes=None):
    try:
        if len(outer) < 3:
            return None
        return fix(Polygon(outer, [h for h in (holes or []) if len(h) >= 3]))
    except Exception:  # noqa: BLE001
        return None


def load(path, log=print):
    """-> dict of internal records, or None when there is no features file."""
    if not path or not os.path.exists(path):
        return None
    with open(path) as f:
        F = json.load(f)
    rx0, rz0, rx1, rz1 = REAL_RECT
    RB = box(rx0, rz0, rx1, rz1)
    rr = F.get('realRect')
    if rr and (abs(rr['minX'] - rx0) > 1 or abs(rr['maxX'] - rx1) > 1 or abs(rr['minZ'] - rz0) > 1 or abs(rr['maxZ'] - rz1) > 1):
        log(f'ingest: WARNING features realRect {rr} differs from config REAL_RECT {REAL_RECT}')
    # FORMAT v4: synthetic features also live inside the rectangle on `city_mask.newLand` (image land real data lacks)
    KO = RB
    cm = F.get('city_mask') or {}
    if cm.get('newLand'):
        nl = unary_union([g for g in (ring_poly(r['outer'], r.get('holes')) for r in cm['newLand']) if g is not None])
        KO = fix(RB.difference(nl.buffer(5.0)))
    # inland water also continues into the 150 m edge band of the rectangle (no straight shore on the rectangle line)
    KOw = fix(KO.difference(RB.difference(RB.buffer(-150.0)))) if cm.get('newLand') else RB
    KOp = KO.buffer(0)
    prepare(KOp)
    S = {'version': F.get('version', 1), 'bounds': F.get('bounds'), 'issues': []}
    issue = S['issues'].append

    def outside(g, min_area=1.0):
        """Clip a polygonal geometry out of the real rectangle."""
        if g is None:
            return None
        if g.intersects(RB):
            g = fix(g.difference(KO))
        if g is None or g.area < min_area:
            return None
        return g

    # ---- land and inland water
    lands = []
    for l in F.get('land', []):
        g = ring_poly(l['outer'], l.get('holes'))
        if g is not None:
            lands.append(g)
        else:
            issue(f"land {l.get('id')}: invalid polygon")
    S['land_raw'] = unary_union(lands) if lands else None
    S['water_polys'] = []
    for w in F.get('water', []):
        g = ring_poly(w['outer'], w.get('holes'))
        if g is not None and g.intersects(RB):
            g = fix(g.difference(KOw))
        g = g if (g is not None and g.area >= 4) else None
        if g is not None:
            S['water_polys'].append(dict(geom=g, kind=w.get('kind', 'lake'), name=w.get('name'), id=w.get('id'), depth=w.get('depth')))

    # ---- areas
    areas, unk = [], defaultdict(int)
    extra = []          # underwater / non-land features passed through to tiles untouched (reef, seagrass ...)
    for a in F.get('areas', []):
        k = a.get('kind')
        g = outside(ring_poly(a['outer'], a.get('holes')), 4)
        if g is None:
            continue
        if k not in AREA:
            unk[k] += 1
            cls, surf, zone = (k, 'grass_short', None)
        else:
            cls, surf, zone = AREA[k]
        if cls is None:
            extra.append(dict(kind=k, geom=g, name=a.get('name'), id=a.get('id')))
            continue
        areas.append(dict(cls=cls, surf=surf, geom=g, name=a.get('name'), area=g.area, zone=zone, synthetic=True, kind=k))
    if unk:
        issue(f'areas with kinds outside FORMAT.md (passed through as-is): {dict(unk)}')
    S['areas'], S['extra_areas'] = areas, extra

    # ---- roads -> ways for the shared graph builder
    ways = []
    for r in F.get('roads', []):
        c = [(float(p[0]), float(p[1])) for p in r.get('pts', [])]
        c = [p for i, p in enumerate(c) if i == 0 or p != c[i - 1]]
        if len(c) < 2:
            issue(f"road {r.get('id')}: fewer than 2 points")
            continue
        kind = r.get('kind', 'residential')
        if kind not in ROAD_KINDS:
            issue(f"road {r.get('id')}: unknown kind {kind}, treated as residential")
            kind = 'residential'
        ow = bool(r.get('oneway'))
        lf = int(r.get('lanesFwd', 1) or 1)
        lb = 0 if ow else int(r.get('lanesBack', 1) if r.get('lanesBack') is not None else 1)
        base = kind.replace('_link', '')
        lw = {'motorway': 3.6, 'trunk': 3.4, 'primary': 3.4, 'secondary': 3.3, 'tertiary': 3.2, 'service': 2.9, 'track': 2.6}.get(base, 3.0)
        w = float(r.get('width') or ((lf + lb) * lw + (0 if base == 'motorway' else 1.0)))
        if base in ('service', 'track') and not ow and not r.get('width'):
            w = min(w, 6.0)
        y = r.get('y')
        if y is not None and len(y) != len(r['pts']):
            issue(f"road {r.get('id')}: y has {len(y)} values for {len(r['pts'])} points; ignored")
            y = None
        a = dict(kind='unclassified' if kind == 'road' else kind, name=r.get('name') or r.get('ref') or None, oneway=ow, rev=False,
                 lf=lf, lb=lb, w=round(w, 1), sp=int(round(float(r.get('speedKmh') or 40))), br=bool(r.get('bridge')),
                 movable=bool(r.get('movable')), layer=int(r.get('layer') or (1 if r.get('bridge') else 0)), ref=r.get('ref') or None,
                 sidewalk=r.get('sidewalk'), surface=r.get('surface'), toll=bool(r.get('toll')), lit=bool(r.get('lit')),
                 spTag=True, tl=None, tlb=None, dst=r.get('destination'), dref=r.get('destinationRef'), brName=r.get('bridgeName'),
                 access=r.get('access'), junction=r.get('junction'), synthetic=True, sid=r.get('id'),
                 priv=r.get('access') in ('no', 'private'))
        ways.append(dict(pts=c, attrs=a, id=r.get('id'), y=[float(v) for v in y] if y is not None else None, surveyed=bool(r.get('surveyed'))))
    S['ways'] = ways
    S['joins'] = F.get('joins', [])

    # ---- paths, piers
    fws, piers = [], []
    for p in F.get('paths', []):
        c = [(float(q[0]), float(q[1])) for q in p.get('pts', [])]
        if len(c) < 2:
            continue
        k = p.get('kind', 'footway')
        w = float(p.get('width') or 2.0)
        ln = LineString(c)
        if ln.intersects(RB):
            ln = ln.difference(KO)
        for part in (ln.geoms if hasattr(ln, 'geoms') else [ln]):
            if part.geom_type != 'LineString' or part.length < 0.5:
                continue
            if k in ('pier', 'dock'):
                piers.append(dict(kind='pier', geom=part.buffer(w / 2, cap_style='flat'), floating=bool(p.get('floating')), synthetic=True,
                                  name=p.get('name'), sub=k))
            else:
                surf = p.get('surface') or ('wood' if k == 'boardwalk' else 'dirt' if k == 'trail' else None)
                fws.append(dict(kind=PATH_KIND.get(k, 'footway'), w=round(w, 1), surface=surf, br=bool(p.get('bridge')), layer=None,
                                name=p.get('name'), line=part, synthetic=True, sub=k))
    S['fws'], S['piers'] = fws, piers

    # ---- buildings
    bl = []
    for b in F.get('buildings', []):
        g = ring_poly(b.get('ring', []))
        if g is None or g.area < 2:
            issue(f"building {b.get('id')}: invalid ring")
            continue
        if g.geom_type != 'Polygon':
            g = max(polys_only(g), key=lambda q: q.area)
        rp_ = g.representative_point()
        if contains_xy(KOp, rp_.x, rp_.y):
            continue
        poi = b.get('poi') or None
        bl.append(dict(geom=g, h=float(b.get('h') or 4.0), mh=float(b.get('minH') or 0.0), lv=b.get('levels'),
                       typ=b.get('kind') or 'yes', zone=b.get('zone'), st=b.get('style') or 'lowrise', part=False, src='synthetic',
                       col=b.get('colour') or b.get('color'), rcol=b.get('roofColour') or b.get('roofColor'), rs=b.get('roof'),
                       area=g.area, name=b.get('name'), poi=(poi.get('type') if isinstance(poi, dict) else poi),
                       poiSub=(poi.get('sub') if isinstance(poi, dict) else None), tier=(poi.get('tier') if isinstance(poi, dict) else None),
                       sid=b.get('id'), synthetic=True, mat=b.get('material'), heading=b.get('heading')))
    S['buildings'] = bl

    def pt_ok(o):
        return not (rx0 <= o['x'] < rx1 and rz0 <= o['z'] < rz1) or not contains_xy(KOp, o['x'], o['z'])

    S['pois'] = [dict(k=p['type'], x=float(p['x']), z=float(p['z']), real=False, name=p.get('name'), sub=p.get('sub'), tier=p.get('tier'))
                 for p in F.get('pois', []) if p.get('type') and pt_ok(p)]
    S['props'] = [dict(type=PROP_ALIAS.get(p['type'], p['type']), x=float(p['x']), z=float(p['z']), heading=p.get('heading'))
                  for p in F.get('props', []) if p.get('type') and pt_ok(p)]
    S['trees'] = [dict(type=t.get('type') if t.get('type') in TREE_TYPES else 'tree', x=float(t['x']), z=float(t['z']))
                  for t in F.get('trees', []) if pt_ok(t)]
    S['places'] = F.get('places', [])
    S['setpieces'] = F.get('setpieces', [])
    for key_ in F:
        if key_ not in ('version', 'bounds', 'realRect', 'city_mask', 'land', 'water', 'areas', 'roads', 'paths', 'buildings', 'pois', 'props',
                        'trees', 'places', 'joins', 'setpieces', 'heights'):
            issue(f'features.json has a top-level key the ingest does not know: {key_} (kept in S["other"])')
            S.setdefault('other', {})[key_] = F[key_]

    # ---- heights
    S['heights'] = None
    hm = F.get('heights')
    if hm:
        hp = os.path.join(os.path.dirname(path), hm.get('file', 'heights.bin'))
        if os.path.exists(hp):
            raw = np.fromfile(hp, dtype='<i2')
            if raw.size == hm['nx'] * hm['nz']:
                S['heights'] = dict(cell=float(hm['cell']), minX=float(hm['minX']), minZ=float(hm['minZ']), nx=int(hm['nx']),
                                    nz=int(hm['nz']), unit=float(hm.get('unit', 0.1)), data=raw.reshape(hm['nz'], hm['nx']))
            else:
                issue(f"heights.bin has {raw.size} samples, expected {hm['nx']}x{hm['nz']}")
        else:
            issue(f'heights file {hp} is missing; the terrain is flat')
    log(f"ingest: land {0 if S['land_raw'] is None else S['land_raw'].area/1e6:.1f} km2, water {len(S['water_polys'])}, areas {len(areas)}, "
        f"roads {len(ways)}, paths {len(fws)}, piers {len(piers)}, buildings {len(bl)}, pois {len(S['pois'])}, props {len(S['props'])}, "
        f"trees {len(S['trees'])}, places {len(S['places'])}, joins {len(S['joins'])}, setpieces {len(S['setpieces'])}, "
        f"heights {'yes' if S['heights'] else 'no'}, issues {len(S['issues'])}")
    return S


def node_roads(ways, log=print, snap=1.5):
    """Make the synthetic road set a proper planar graph: road ends that stop on another road get a shared
    vertex there, and at-grade crossings without a shared vertex get one. Bridges are left alone."""
    lines = [LineString(w['pts']) for w in ways]
    tree = STRtree(lines)
    inserts = defaultdict(list)      # way index -> [(s along, (x, z))]
    n_end = n_x = 0
    vkeys = [set((round(p[0], 2), round(p[1], 2)) for p in w['pts']) for w in ways]
    for i, w in enumerate(ways):
        for end in (0, -1):
            p = w['pts'][end]
            P = Point(p)
            k0 = (round(p[0], 2), round(p[1], 2))
            best = None
            for j in tree.query(P.buffer(snap)):
                j = int(j)
                if j == i:
                    continue
                if k0 in vkeys[j]:
                    best = None
                    break
                d = lines[j].distance(P)
                if d <= snap and (best is None or d < best[0]):
                    best = (d, j)
            if best:
                j = best[1]
                s_ = lines[j].project(P)
                q = lines[j].interpolate(s_)
                # reuse an existing vertex of the other road when it is right there
                near = min(ways[j]['pts'], key=lambda v: (v[0] - q.x) ** 2 + (v[1] - q.y) ** 2)
                if (near[0] - q.x) ** 2 + (near[1] - q.y) ** 2 < 0.25:
                    w['pts'][end] = near
                else:
                    q = (round(q.x, 2), round(q.y, 2))
                    inserts[j].append((s_, q))
                    w['pts'][end] = q
                n_end += 1
    lines = [LineString(w['pts']) for w in ways]
    tree = STRtree(lines)
    for i, w in enumerate(ways):
        if w['attrs']['br']:
            continue
        for j in tree.query(lines[i], predicate='crosses'):
            j = int(j)
            if j <= i or ways[j]['attrs']['br'] or ways[j]['attrs']['layer'] != w['attrs']['layer']:
                continue
            x = lines[i].intersection(lines[j])
            for g in (x.geoms if hasattr(x, 'geoms') else [x]):
                if g.geom_type != 'Point':
                    continue
                q = (round(g.x, 2), round(g.y, 2))
                if q in vkeys[i] and q in vkeys[j]:
                    continue
                for k in (i, j):
                    if q not in vkeys[k]:
                        inserts[k].append((lines[k].project(g), q))
                        vkeys[k].add(q)
                n_x += 1
    for k, ins in inserts.items():
        w = ways[k]
        c = w['pts']
        cum = [0.0]
        for a in range(1, len(c)):
            cum.append(cum[-1] + math.hypot(c[a][0] - c[a - 1][0], c[a][1] - c[a - 1][1]))
        out, yy = [], []
        ins = sorted(ins)
        ii = 0
        for a in range(len(c)):
            while ii < len(ins) and ins[ii][0] < cum[a] - 1e-6:
                s_, q = ins[ii]
                if not out or out[-1] != q:
                    out.append(q)
                    if w['y'] is not None:
                        t = 0 if a == 0 or cum[a] == cum[a - 1] else (s_ - cum[a - 1]) / (cum[a] - cum[a - 1])
                        yy.append(w['y'][max(0, a - 1)] + (w['y'][a] - w['y'][max(0, a - 1)]) * max(0, min(1, t)))
                ii += 1
            if not out or out[-1] != c[a]:
                out.append(c[a])
                if w['y'] is not None:
                    yy.append(w['y'][a])
        for s_, q in ins[ii:]:
            if out[-1] != q:
                out.append(q)
                if w['y'] is not None:
                    yy.append(w['y'][-1])
        w['pts'] = out
        if w['y'] is not None:
            w['y'] = yy
    log(f'ingest: road noding: {n_end} road ends snapped onto another road, {n_x} at-grade crossings given a shared vertex')
    return n_end, n_x


def terrain_sampler(H):
    """Bilinear terrain height (meters) from the ingested height field; 0 outside it or inside the real rectangle."""
    rx0, rz0, rx1, rz1 = REAL_RECT
    if H is None:
        return lambda x, z: 0.0
    d, cell, mx, mz, nx, nz, unit = H['data'], H['cell'], H['minX'], H['minZ'], H['nx'], H['nz'], H['unit']

    def h(x, z):
        if rx0 <= x <= rx1 and rz0 <= z <= rz1:
            return 0.0
        fx, fz = (x - mx) / cell, (z - mz) / cell
        i, j = int(math.floor(fx)), int(math.floor(fz))
        if i < 0 or j < 0 or i >= nx - 1 or j >= nz - 1:
            if 0 <= i < nx and 0 <= j < nz:
                return float(d[j, i]) * unit
            return 0.0
        u, v = fx - i, fz - j
        return float((d[j, i] * (1 - u) + d[j, i + 1] * u) * (1 - v) + (d[j + 1, i] * (1 - u) + d[j + 1, i + 1] * u) * v) * unit
    return h
