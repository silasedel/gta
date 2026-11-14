"""Bay crossings the merged world must keep (highways track, Nov 13).

The Julia Tuttle Causeway (I-195) lies just north of the real rectangle, where the synthetic layout has its own bay islands and no
road across: mainland -> Miami Beach trips at 36th / 41st St went 30+ km around the north end of the bay. Here the real causeway is
put back from the cached OSM centerlines as two one-way carriageways (3 lanes each) that become part of the synthetic road set:

- each carriageway is trimmed to its outermost crossings with synthetic streets (mainland grid in the west, the beach grid in the east),
  so both ends are real junctions (no dead-end stubs);
- runs over the water become bridges (layer 1; the western span starts on the mainland so it clears the shore parkway viaduct:
  layer 2), the island runs between them stay on fill at grade and get junctions with the island streets (node_roads);
- the corridor is cleared of synthetic buildings, trees and props.

Deck heights then come from roads.elevate like every other bridge (12 m over long water spans, ramps at the shared grade).
"""
import json
import math
import os
from shapely.geometry import LineString, Point
from shapely.ops import unary_union, substring
from shapely import STRtree, prepare, contains_xy

from config import proj

HERE = os.path.dirname(os.path.abspath(__file__))
STREETS = ('primary', 'secondary', 'tertiary', 'residential', 'unclassified')
LANES, LANE_W = 3, 3.4
WIDTH = LANES * LANE_W + 1.0
MERGE_GAP = 120.0       # m: land runs shorter than this between two water runs stay bridge (sand bars, spoil islets)
ABUT = 25.0             # m: a bridge reaches this far onto the land at each end
WEST_LEAD = 420.0       # m: the first span starts this far west of the mainland shore (clears the shore parkway)


def _osm_lines(name):
    for sub in ('v2', ''):
        p = os.path.join(HERE, 'cache', sub, 'highways.json')
        if os.path.exists(p):
            els = json.load(open(p))['elements']
            break
    else:
        return []
    out = []
    for e in els:
        t = e.get('tags') or {}
        if e.get('type') == 'way' and t.get('name') == name and e.get('geometry') and t.get('highway') in ('motorway', 'trunk', 'primary'):
            out.append([proj(n['lon'], n['lat']) for n in e['geometry']])
    return out


def _chain(segs, east):
    ss = [c for c in segs if (c[-1][0] - c[0][0] > 0) == east and abs(c[-1][0] - c[0][0]) > 1.0]
    if not ss:
        return None
    ss.sort(key=lambda c: c[0][0] if east else -c[0][0])
    chain, used = list(ss[0]), {0}
    while True:
        nxt = next((i for i, c in enumerate(ss) if i not in used and math.hypot(c[0][0] - chain[-1][0], c[0][1] - chain[-1][1]) < 3.0), None)
        if nxt is None:
            break
        used.add(nxt)
        chain += ss[nxt][1:]
    return LineString(chain)


def _runs(ln, land_ok, step=5.0):
    """[(s0, s1)] runs of the line over water."""
    n = max(2, int(ln.length / step) + 1)
    wet = []
    for k in range(n + 1):
        s = ln.length * k / n
        p = ln.interpolate(s)
        wet.append((s, not land_ok(p.x, p.y)))
    runs, cur = [], None
    for s, w in wet:
        if w and cur is None:
            cur = [s, s]
        elif w:
            cur[1] = s
        elif cur is not None:
            runs.append(cur)
            cur = None
    if cur is not None:
        runs.append(cur)
    merged = []
    for a, b in runs:
        if merged and a - merged[-1][1] < MERGE_GAP:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [r for r in merged if r[1] - r[0] > 20.0]


def julia_tuttle(syn_ways, land_ok, log=print):
    """-> (ways, corridor polygon or None)"""
    segs = _osm_lines('Julia Tuttle Causeway')
    if not segs:
        log('causeways: Julia Tuttle not in the OSM cache')
        return [], None
    streets = [w for w in syn_ways if w['attrs']['kind'] in STREETS and not w['attrs']['br'] and not (w.get('y') and max(w['y']) > 0.3)]
    slines = [LineString(w['pts']) for w in streets]
    st = STRtree(slines)
    out, cor = [], []
    for east in (True, False):
        ln = _chain(segs, east)
        if ln is None:
            continue
        # outermost street crossings (west mainland grid, east beach grid)
        xs = []
        for j in st.query(ln, predicate='intersects'):
            ip = ln.intersection(slines[int(j)])
            for g in (ip.geoms if hasattr(ip, 'geoms') else [ip]):
                if g.geom_type == 'Point':
                    xs.append(ln.project(g))
        if len(xs) < 2:
            log(f'causeways: Julia Tuttle {"eb" if east else "wb"}: no street crossings')
            continue
        xs.sort()
        # the westernmost crossing west of x = -2700 (mainland grid) and the easternmost on the beach
        s_w = [s for s in xs if ln.interpolate(s).x <= -2700.0]
        s_e = [s for s in xs if ln.interpolate(s).x >= 1800.0]
        if not s_w or not s_e:
            log('causeways: Julia Tuttle: no mainland / beach crossing')
            continue
        s0 = max(s_w) if east else min(s_w)
        s1 = max(s_e, key=lambda s: ln.interpolate(s).x)
        a_, b_ = sorted((s0, s1))
        core = substring(ln, a_, b_)
        runs = _runs(core, land_ok)
        if not runs:
            continue
        # the first span (from the mainland) starts WEST_LEAD m before the shore
        iw = min(range(len(runs)), key=lambda k: core.interpolate(runs[k][0]).x if east else core.interpolate(runs[k][1]).x)
        spans = []
        for k, (a, b) in enumerate(runs):
            a, b = max(0.0, a - ABUT), min(core.length, b + ABUT)
            if k == iw:
                if east:
                    a = max(20.0, a - WEST_LEAD)
                else:
                    b = min(core.length - 20.0, b + WEST_LEAD)
            spans.append((a, b, k == iw))
        pos = 0.0
        name = 'Julia Tuttle Causeway'
        for k, (a, b, first) in enumerate(spans):
            pieces = []
            if a - pos > 2.0:
                pieces.append((pos, a, False, 0))
            pieces.append((a, b, True, 2 if first else 1))
            for p0, p1, br, layer in pieces:
                g = substring(core, p0, p1)
                c = [(round(x, 2), round(z, 2)) for x, z in g.coords]
                c = [v for i, v in enumerate(c) if i == 0 or v != c[i - 1]]
                if len(c) < 2:
                    continue
                attrs = dict(kind='trunk', name=name, oneway=True, rev=False, lf=LANES, lb=0, w=WIDTH, sp=88, br=br, movable=False, layer=layer,
                             ref='I-195', sidewalk='no', surface='asphalt', toll=False, lit=True, spTag=True, tl=None, tlb=None, dst=None, dref=None,
                             brName='Julia Tuttle Causeway Bridge' if br else None, access=None, junction=None, synthetic=True,
                             sid=f'jt:{"eb" if east else "wb"}:{len(out)}', priv=False)
                out.append(dict(pts=c, attrs=attrs, id=attrs['sid'], y=None))
            pos = b
        if core.length - pos > 2.0:
            g = substring(core, pos, core.length)
            c = [(round(x, 2), round(z, 2)) for x, z in g.coords]
            attrs = dict(out[-1]['attrs'], br=False, layer=0, brName=None, sid=f'jt:{"eb" if east else "wb"}:{len(out)}')
            out.append(dict(pts=c, attrs=attrs, id=attrs['sid'], y=None))
        cor.append(core.buffer(WIDTH / 2 + 4.0, cap_style=2))
        log(f'causeways: Julia Tuttle {"eb" if east else "wb"}: {round(core.length)} m from x {round(core.coords[0][0])} to {round(core.coords[-1][0])}, '
            f'spans {[(round(a), round(b)) for a, b, _ in spans]}')
    corridor = unary_union(cor) if cor else None
    if corridor is not None:
        prepare(corridor)
    return out, corridor


def clear_corridor(SY, corridor, log=print):
    """Drop synthetic buildings, trees, props and points of interest inside the causeway corridor."""
    if corridor is None or not SY:
        return
    nb = len(SY['buildings'])
    SY['buildings'] = [b for b in SY['buildings'] if not corridor.intersects(b['geom'])]
    cnt = {}
    for k in ('trees', 'props', 'pois'):
        n0 = len(SY.get(k) or [])
        SY[k] = [o for o in (SY.get(k) or []) if not contains_xy(corridor, o['x'], o['z'])]
        cnt[k] = n0 - len(SY[k])
    log(f'causeways: corridor cleared: {nb - len(SY["buildings"])} buildings, {cnt}')
