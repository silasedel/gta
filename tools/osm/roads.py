"""Road graph: drivable OSM ways -> nodes/edges with lanes, width, speed, bridge elevation profiles."""
import heapq, math
from collections import defaultdict
from shapely.geometry import LineString, Point
from osmgeom import load, pts, world_box, parse_len, parse_speed

DRIVE = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
         'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street',
         'service', 'road'}
PED = {'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track', 'bridleway', 'platform'}
SKIP_SERVICE = {'parking_aisle', 'drive-through', 'driveway', 'emergency_access', 'slipway'}
LANES_DEF = {'motorway': 2, 'trunk': 2, 'primary': 2, 'secondary': 1, 'tertiary': 1, 'unclassified': 1,
             'residential': 1, 'living_street': 1, 'service': 1, 'road': 1}
LANE_W = {'motorway': 3.6, 'trunk': 3.4, 'primary': 3.4, 'secondary': 3.3, 'tertiary': 3.2,
          'unclassified': 3.0, 'residential': 3.0, 'living_street': 3.0, 'service': 2.9, 'road': 3.0}
SPEED_DEF = {'motorway': 89, 'trunk': 64, 'primary': 56, 'secondary': 48, 'tertiary': 48, 'unclassified': 40,
             'residential': 40, 'living_street': 24, 'service': 24, 'road': 40}
HIGHWAYISH = {'motorway', 'motorway_link', 'trunk', 'trunk_link'}
GRADE = 0.065
SIDEWALK_KINDS = {'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
                  'primary_link', 'secondary_link', 'tertiary_link', 'road'}


def base(kind):
    return kind.replace('_link', '')


def key(c):
    return (round(c[0], 2), round(c[1], 2))


def way_attrs(t):
    kind = t['highway']
    b = base(kind)
    link = kind.endswith('_link')
    ow = str(t.get('oneway', '')).lower()
    rev = ow == '-1'
    oneway = ow in ('yes', 'true', '1', '-1') or t.get('junction') in ('roundabout', 'circular') \
        or (kind in ('motorway', 'motorway_link') and ow != 'no')
    def ival(k):
        try:
            return max(0, int(float(str(t.get(k)).split(';')[0])))
        except Exception:  # noqa: BLE001
            return None
    lanes = ival('lanes')
    lf, lb = ival('lanes:forward'), ival('lanes:backward')
    d = 1 if link else LANES_DEF.get(b, 1)
    if oneway:
        lf = lanes or lf or d
        lb = 0
    else:
        if lf is None and lb is None:
            if lanes:
                lf = max(1, lanes // 2)
                lb = max(1, lanes - lf)
            else:
                lf = lb = d
        else:
            lf = lf or max(1, (lanes or 2) - (lb or 1))
            lb = lb or max(1, (lanes or 2) - lf)
    lf, lb = min(lf, 6), min(lb, 6)
    lw = LANE_W.get(b, 3.0)
    w = parse_len(t.get('width'))
    if not w or not (2.5 < w < 40):
        w = (lf + lb) * lw + (0 if b == 'motorway' else 1.0)
        if b == 'service' and not oneway:
            w = min(w, 6.0)
    sp = parse_speed(t.get('maxspeed')) or SPEED_DEF.get(b, 40) * (0.8 if link else 1)
    br = t.get('bridge') not in (None, 'no')
    try:
        layer = int(float(str(t.get('layer', '0')).split(';')[0]))
    except Exception:  # noqa: BLE001
        layer = 0
    name = t.get('name') or t.get('ref') or None
    return dict(kind=kind, name=name, oneway=oneway, rev=rev, lf=lf, lb=lb, w=round(w, 1), sp=round(sp),
                br=br, movable=t.get('bridge') == 'movable', layer=layer, ref=t.get('ref'),
                sidewalk=t.get('sidewalk'), surface=t.get('surface'))


ATTR_KEYS = ('kind', 'name', 'oneway', 'lf', 'lb', 'w', 'sp', 'br', 'layer')


def build_graph(is_water_pt):
    B = world_box()
    ways = []
    tunnels = 0
    for e in load('highways'):
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in DRIVE or t.get('area') == 'yes':
            continue
        if hw == 'service' and t.get('service') in SKIP_SERVICE:
            continue
        if t.get('tunnel') in ('yes', 'culvert') or t.get('access') == 'no' and hw == 'service':
            tunnels += t.get('tunnel') == 'yes'
            continue
        c = pts(e['geometry'])
        if len(c) < 2:
            continue
        a = way_attrs(t)
        if a['rev']:
            c = c[::-1]
        ln = LineString(c)
        g = ln.intersection(B) if not B.contains(ln) else ln
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.geom_type == 'LineString' and p.length > 0.5:
                ways.append((list(p.coords), a))
    # node detection
    cnt = defaultdict(int)
    for c, a in ways:
        seen = set()
        for i, v in enumerate(c):
            k = key(v)
            if i in (0, len(c) - 1):
                cnt[k] += 2
            elif k in seen:
                cnt[k] += 2
            else:
                cnt[k] += 1
            seen.add(k)
    nid = {}
    nodes = []

    def node(v):
        k = key(v)
        if k not in nid:
            nid[k] = len(nodes)
            nodes.append([v[0], v[1]])
        return nid[k]

    raw = []
    for c, a in ways:
        cur = [c[0]]
        for v in c[1:]:
            cur.append(v)
            if cnt[key(v)] >= 2 and len(cur) >= 2:
                raw.append(dict(a=node(cur[0]), b=node(cur[-1]), pts=cur, **{k: a[k] for k in a}))
                cur = [v]
    raw = [r for r in raw if not (r['a'] == r['b'] and len(r['pts']) < 4)]
    edges = merge_chains(raw)
    print(f'roads: {len(ways)} way pieces, {len(nodes)} raw nodes, {len(raw)} raw edges -> {len(edges)} merged edges; tunnels skipped {tunnels}')
    # compact node ids
    used = sorted({e['a'] for e in edges} | {e['b'] for e in edges})
    remap = {o: i for i, o in enumerate(used)}
    nodes = [nodes[o] for o in used]
    for e in edges:
        e['a'], e['b'] = remap[e['a']], remap[e['b']]
    # simplify + densify
    for e in edges:
        ln = LineString(e['pts']).simplify(0.6, preserve_topology=False)
        e['pts'] = densify(list(ln.coords), 12.0)
        e['pts'][0] = tuple(nodes[e['a']])
        e['pts'][-1] = tuple(nodes[e['b']])
    elevate(nodes, edges, is_water_pt)
    for e in edges:
        if max(e['y']) < 0.05:
            ln = LineString(e['pts']).simplify(0.6, preserve_topology=False)
            e['pts'] = list(ln.coords)
            e['y'] = None
    return nodes, edges


def densify(c, step):
    out = [c[0]]
    for i in range(1, len(c)):
        x0, z0 = c[i - 1]
        x1, z1 = c[i]
        L = math.hypot(x1 - x0, z1 - z0)
        n = int(L // step)
        for k in range(1, n + 1):
            t = k / (n + 1)
            out.append((x0 + (x1 - x0) * t, z0 + (z1 - z0) * t))
        out.append((x1, z1))
    return out


def merge_chains(raw):
    def ak(e):
        return tuple(e[k] for k in ATTR_KEYS)
    inc = defaultdict(list)
    for i, e in enumerate(raw):
        inc[e['a']].append(i)
        inc[e['b']].append(i)
    alive = [True] * len(raw)
    for n, lst in list(inc.items()):
        lst = [i for i in lst if alive[i]]
        if len(lst) != 2:
            continue
        i, j = lst
        if i == j:
            continue
        ei, ej = raw[i], raw[j]
        if ak(ei) != ak(ej):
            continue
        # orient ei to end at n, ej to start at n
        if ei['b'] != n:
            if ei['oneway']:
                if not (ej['b'] == n and ei['a'] == n):
                    continue
                ei, ej, i, j = ej, ei, j, i
            else:
                ei['a'], ei['b'], ei['pts'] = ei['b'], ei['a'], ei['pts'][::-1]
        if ej['a'] != n:
            if ej['oneway']:
                continue
            ej['a'], ej['b'], ej['pts'] = ej['b'], ej['a'], ej['pts'][::-1]
        if ei['b'] != n or ej['a'] != n or ei['a'] == ej['b'] == n:
            continue
        ei['pts'] = ei['pts'] + ej['pts'][1:]
        ei['b'] = ej['b']
        alive[j] = False
        inc[ej['b']] = [i if x == j else x for x in inc[ej['b']]]
    return [e for k, e in enumerate(raw) if alive[k]]


def elevate(nodes, edges, is_water_pt):
    """Bridge deck heights: y(v) = max(0, min(peakField, groundField)), both limited by GRADE."""
    # vertex ids: graph nodes keep their ids; interior vertices appended
    nV = len(nodes)
    adj = defaultdict(list)
    evid = []
    for e in edges:
        ids = [e['a']]
        for p in e['pts'][1:-1]:
            ids.append(nV)
            nV += 1
        ids.append(e['b'])
        evid.append(ids)
        c = e['pts']
        for k in range(len(ids) - 1):
            d = math.hypot(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1])
            adj[ids[k]].append((ids[k + 1], d))
            adj[ids[k + 1]].append((ids[k], d))
    deg = defaultdict(int)
    elevN = set()
    kinds_at = defaultdict(set)
    groundEdge = set()
    for e in edges:
        elev = e['br'] or (e['layer'] >= 1 and e['kind'] in HIGHWAYISH)
        for n in (e['a'], e['b']):
            deg[n] += 1
            kinds_at[n].add(e['kind'])
            if not elev and e['kind'] not in HIGHWAYISH:
                groundEdge.add(n)
        if elev:
            elevN.add(e['a'])
            elevN.add(e['b'])
    peak = {}
    for e, ids in zip(edges, evid):
        elev = e['br'] or (e['layer'] >= 1 and e['kind'] in HIGHWAYISH)
        if not elev:
            continue
        L = LineString(e['pts']).length
        mid = LineString(e['pts']).interpolate(0.5, normalized=True)
        water = is_water_pt(mid.x, mid.y)
        if water:
            H = 6.0 if e['movable'] else (12.0 if L > 150 else 8.0)
        else:
            H = 6.8 * max(1, e['layer'])
        for v in ids:
            peak[v] = max(peak.get(v, 0), H)
    ground = {}
    for n in range(len(nodes)):
        if deg[n] == 1 and n not in elevN:
            ground[n] = 0.0
        elif deg[n] >= 3 and n in groundEdge:
            ground[n] = 0.0
    # peak field (max-plus Dijkstra)
    P = dict(peak)
    hq = [(-h, v) for v, h in peak.items()]
    heapq.heapify(hq)
    while hq:
        h, v = heapq.heappop(hq)
        h = -h
        if h < P.get(v, 0) - 1e-9:
            continue
        for u, d in adj[v]:
            nh = h - GRADE * d
            if nh > P.get(u, 0) + 1e-6:
                P[u] = nh
                heapq.heappush(hq, (-nh, u))
    G = dict(ground)
    hq = [(0.0, v) for v in ground]
    heapq.heapify(hq)
    while hq:
        g, v = heapq.heappop(hq)
        if g > G.get(v, 1e9) + 1e-9:
            continue
        if g > 40:
            continue
        for u, d in adj[v]:
            ng = g + GRADE * d
            if ng < G.get(u, 1e9) - 1e-6:
                G[u] = ng
                heapq.heappush(hq, (ng, u))
    for e, ids in zip(edges, evid):
        e['y'] = [round(max(0.0, min(P.get(v, 0.0), G.get(v, 1e9))), 2) for v in ids]
    nE = sum(1 for e in edges if max(e['y']) > 0.05)
    print(f'elevation: {len(peak)} peak verts, {len(ground)} ground nodes, {nE} edges elevated, max {max(max(e["y"]) for e in edges):.1f} m')


def footways():
    B = world_box()
    out = []
    for e in load('highways'):
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in PED:
            continue
        if t.get('tunnel') == 'yes' or t.get('indoor') == 'yes' or t.get('level') not in (None, '0'):
            continue
        c = pts(e['geometry'])
        if len(c) < 2:
            continue
        kind = hw
        if hw == 'footway' and t.get('footway') in ('sidewalk', 'crossing', 'traffic_island'):
            kind = 'sidewalk' if t['footway'] != 'crossing' else 'crossing'
        if hw == 'pedestrian' and c[0] == c[-1] and t.get('area') == 'yes':
            continue
        w = parse_len(t.get('width'))
        if not w or not (0.8 < w < 30):
            w = {'pedestrian': 6.0, 'cycleway': 2.2, 'path': 1.8, 'steps': 2.0, 'track': 3.0}.get(kind, 2.0)
        surf = t.get('surface')
        if t.get('bridge') == 'boardwalk' or surf == 'wood':
            surf = 'wood'
        ln = LineString(c)
        g = ln.intersection(B) if not B.contains(ln) else ln
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.geom_type == 'LineString' and p.length > 0.5:
                p = p.simplify(0.4)
                out.append(dict(kind=kind, w=round(w, 1), surface=surf, br=t.get('bridge') not in (None, 'no'),
                                layer=t.get('layer'), name=t.get('name'), line=p))
    return out


def piers():
    out = []
    B = world_box()
    for e in load('highways'):
        t = e.get('tags', {})
        mm = t.get('man_made')
        if mm not in ('pier', 'breakwater', 'groyne'):
            continue
        c = pts(e['geometry'])
        if len(c) < 2:
            continue
        w = parse_len(t.get('width')) or (3.0 if mm == 'pier' else 4.0)
        if c[0] == c[-1] and len(c) >= 4:
            from osmgeom import way_poly
            g = way_poly(e)
        else:
            g = LineString(c).buffer(w / 2, cap_style='flat')
        if g is None:
            continue
        g = g.intersection(B)
        if g.is_empty:
            continue
        out.append(dict(kind=mm, geom=g, floating=t.get('floating') == 'yes'))
    return out
