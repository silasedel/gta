"""Road graph: drivable OSM ways -> nodes/edges with lanes, width, speed, bridge elevation profiles."""
import heapq, math
from collections import defaultdict
from shapely.geometry import LineString, Point
from osmgeom import load, pts, world_box, parse_len, parse_speed
# centerline simplify tolerance (m). Roads fitted by tools/v2/map3/survey.py (features road `surveyed`) keep 0.12 m: at 0.6 m
# their arcs would turn into 30-60 m chords with 3-9 degree kinks. Every other road keeps 0.6 m (its graph must not change).
SIMPLIFY, SIMPLIFY_FIT = 0.6, 0.12

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
    ref = norm_ref(t.get('ref'))
    name = t.get('name') or ref or None
    sw = t.get('sidewalk') or t.get('sidewalk:both')
    if not sw and (t.get('sidewalk:left') == 'no' and t.get('sidewalk:right') == 'no'):
        sw = 'no'
    tl = t.get('turn:lanes') or t.get('turn:lanes:forward')
    return dict(kind=kind, name=name, oneway=oneway, rev=rev, lf=lf, lb=lb, w=round(w, 1), sp=round(sp),
                br=br, movable=t.get('bridge') == 'movable', layer=layer, ref=ref,
                sidewalk=sw, surface=t.get('surface'), toll=t.get('toll') == 'yes', lit=t.get('lit') == 'yes',
                spTag=bool(parse_speed(t.get('maxspeed'))), tl=tl, tlb=t.get('turn:lanes:backward'),
                dst=t.get('destination'), dref=norm_ref(t.get('destination:ref')),
                brName=t.get('bridge:name'), access=t.get('access'), junction=t.get('junction'))


ATTR_KEYS = ('kind', 'name', 'ref', 'oneway', 'lf', 'lb', 'w', 'sp', 'br', 'layer', 'toll', 'tl', 'dst', 'priv')


def norm_ref(r):
    """OSM ref -> sign text: 'I 95' -> 'I-95', 'US 1' -> 'US-1', 'SR 836 Toll' -> 'SR 836', 'I 95;US 1' -> 'I-95;US-1'."""
    if not r:
        return None
    out = []
    for part in str(r).split(';'):
        part = part.strip().replace(' Toll', '').replace(' EXPR', ' Express')
        if part.startswith(('I ', 'US ')):
            part = part.replace(' ', '-', 1)
        if part and part not in out:
            out.append(part)
    return ';'.join(out) or None


def osm_ways():
    """Drivable OSM ways clipped to the real rectangle -> [(coords, attrs, way id)], {osm node id: (x, z)},
    and the list of clipped ends that sit on the rectangle boundary (where synthetic roads join)."""
    B = world_box()
    x0, z0, x1, z1 = B.bounds
    ways = []
    tunnels = 0
    osm_xy = {}
    bnd = []
    for e in load('highways'):
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in DRIVE or t.get('area') == 'yes':
            continue
        if hw == 'service' and t.get('service') in SKIP_SERVICE:
            continue
        if t.get('tunnel') in ('yes', 'culvert'):
            tunnels += t.get('tunnel') == 'yes'
            continue
        c = pts(e['geometry'])
        if len(c) < 2:
            continue
        for nid_, v in zip(e.get('nodes') or [], c):
            osm_xy[nid_] = v
        a = way_attrs(t)
        # gated yards and private drives stay in the graph (they keep the port and campuses connected) but are flagged
        a['priv'] = t.get('access') in ('no', 'private', 'customers', 'permit', 'delivery', 'military') and hw == 'service'
        if a['rev']:
            c = c[::-1]
        a['_hw'] = hw
        ln = LineString(c)
        g = ln.intersection(B) if not B.contains(ln) else ln
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.geom_type == 'LineString' and p.length > 0.5:
                ways.append((list(p.coords), a, e['id']))
    if MASK is not None:
        import citymask
        ways = citymask.mask_ways(ways, MASK, log=_mlog)
    for cc, a, wid in ways:
        for end in (0, -1):
            x, z = cc[end]
            side = 'west' if abs(x - x0) < 0.02 else 'east' if abs(x - x1) < 0.02 else 'north' if abs(z - z0) < 0.02 else 'south' if abs(z - z1) < 0.02 else None
            if side:
                # flow: 'out' when traffic on this piece can leave the rectangle here, 'in' when it can enter
                flow = 'both' if not a['oneway'] else ('out' if end == -1 else 'in')
                bnd.append(dict(x=x, z=z, side=side, flow=flow, kind=a['_hw'], name=a['name'], ref=a['ref'], lf=a['lf'], lb=a['lb'],
                                w=a['w'], sp=a['sp'], way=wid, br=a['br'], layer=a['layer']))
    for cc, a, wid in ways:
        a.pop('_hw', None)
    return ways, osm_xy, bnd, tunnels


MASK = None              # citymask.load(...) result: the picture's land / water inside the rectangle (set by build.py)
OUTSIDE_LAND = None      # prepared picture land (+6 m) outside the rectangle, for real roads kept just outside it
_mlog = print


def rescue_outside(ways, pad=800.0, log=print):
    """Roads that leave the rectangle and come back (a bridge just past the edge, a loop street) leave pieces of the
    network stranded after clipping. Add the real OSM pieces OUTSIDE the rectangle (within `pad`) that tie a stranded
    piece back to the main network. -> extra [(coords, attrs, way id)] with attrs['outside'] = True."""
    B = world_box()
    P = world_box(pad)
    outer = []
    for e in load('highways'):
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in DRIVE or t.get('area') == 'yes' or t.get('tunnel') in ('yes', 'culvert'):
            continue
        if hw == 'service' and t.get('service') in SKIP_SERVICE:
            continue
        c = pts(e['geometry'])
        if len(c) < 2:
            continue
        ln = LineString(c)
        if B.contains(ln) or not ln.intersects(P):
            continue
        a = way_attrs(t)
        if a['rev']:
            ln = LineString(c[::-1])
        g = ln.intersection(P).difference(B)
        if OUTSIDE_LAND is not None:
            g = g.intersection(OUTSIDE_LAND)       # the picture wins outside the rectangle too
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.geom_type == 'LineString' and p.length > 0.5:
                a2 = dict(a)
                a2['outside'] = True
                a2['priv'] = False
                outer.append((list(p.coords), a2, e['id']))
    allw = list(ways) + outer
    nin = len(ways)
    par = list(range(len(allw)))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    # inside-only connectivity first
    owner = {}
    for i, (c, a, w) in enumerate(ways):
        for v in c:
            k = key(v)
            if k in owner:
                ra, rb = find(i), find(owner[k])
                if ra != rb:
                    par[ra] = rb
            else:
                owner[k] = i
    length = defaultdict(float)
    for i, (c, a, w) in enumerate(ways):
        length[find(i)] += LineString(c).length
    main = max(length, key=length.get)
    comp_in = [find(i) for i in range(nin)]
    stranded = {r for r in set(comp_in) if r != main and length[r] >= 150}
    ramps = _seam_ramps(ways, outer, B, log)
    if not stranded:
        return ramps
    # adjacency through shared vertices, inside + outside
    vown = defaultdict(list)
    for i, (c, a, w) in enumerate(allw):
        for v in c:
            vown[key(v)].append(i)
    adj = defaultdict(set)
    for lst in vown.values():
        if len(lst) > 1:
            for i in lst:
                adj[i].update(x for x in lst if x != i)
    use = set()
    fixed = 0
    for r in stranded:
        start = [i for i in range(nin) if comp_in[i] == r]
        prev = {i: None for i in start}
        dq = list(start)
        hit = None
        while dq and hit is None:
            u = dq.pop(0)
            for v in adj[u]:
                if v in prev:
                    continue
                if v < nin:
                    if comp_in[v] == main:
                        prev[v] = u
                        hit = v
                        break
                    continue            # another stranded piece: only travel through outside pieces
                prev[v] = u
                dq.append(v)
        if hit is None:
            continue
        u = prev[hit]
        while u is not None and u >= nin:
            use.add(u)
            u = prev[u]
        fixed += 1
    extra = [allw[i] for i in sorted(use)]
    have = {id(x) for x in extra}
    extra += [x for x in ramps if id(x) not in have]
    log(f'roads: {len(stranded)} clipped pieces of the network were stranded; {fixed} tied back with {len(extra)} real road pieces just outside the rectangle '
        f'({sum(LineString(c).length for c, a, w in extra):.0f} m)')
    return extra


MOTOR_KINDS = ('motorway', 'motorway_link', 'trunk', 'trunk_link')


def _seam_ramps(ways, outer, B, log=print, max_len=1500.0):
    """Interchange ramps that leave the rectangle and come straight back (I-95 north -> I-395 east loops just west of the edge):
    the network stays connected through the synthetic roads, so the stranded-piece rescue never sees them, and the GPS drove
    a 5 km detour through the synthetic grid (highways track, Nov 14). For every one-way motorway-class piece that LEAVES the
    rectangle, follow the real one-way motorway-class pieces outside (in driving direction, at most `max_len`) to a piece that
    ENTERS it again, and keep that outside chain."""
    x0, z0, x1, z1 = B.bounds
    on_edge = lambda v: min(abs(v[0] - x0), abs(v[0] - x1), abs(v[1] - z0), abs(v[1] - z1)) < 0.05
    starts = defaultdict(list)       # outside piece index by its first vertex key
    for j, (c, a, w) in enumerate(outer):
        if a['kind'] in MOTOR_KINDS and a['oneway']:
            starts[key(c[0])].append(j)
    entries = set(key(c[0]) for c, a, w in ways if a['kind'] in MOTOR_KINDS and a['oneway'] and on_edge(c[0]))
    exits = [c[-1] for c, a, w in ways if a['kind'] in MOTOR_KINDS and a['oneway'] and on_edge(c[-1])]
    use = set()
    for v in exits:
        # depth-first along driving direction through outside pieces
        stack = [(key(v), 0.0, ())]
        while stack:
            k, L, path = stack.pop()
            for j in starts.get(k, ()):
                if j in path:
                    continue
                c = outer[j][0]
                L2 = L + LineString(c).length
                if L2 > max_len:
                    continue
                k2 = key(c[-1])
                if k2 in entries:
                    use.update(path + (j,))
                    continue
                stack.append((k2, L2, path + (j,)))
    out = [outer[j] for j in sorted(use)]
    if out:
        log(f'roads: {len(out)} real interchange ramp pieces just outside the rectangle re-link motorway exits to entries '
            f'({sum(LineString(c).length for c, a, w in out):.0f} m)')
    return out


def stitch(syn, bnd, log=print):
    """Join synthetic roads to the real ones at the rectangle edge.
    1. A synthetic road end within 3 m of a clipped OSM end is snapped onto it exactly (30 m when the name or ref matches,
       or when it is listed in `joins`).
    2. Each remaining OSM boundary end (the other carriageway of a divided road, a ramp) gets a short one-way connector to
       the nearest joined synthetic road of a compatible class, so both directions of travel continue.
    Returns (extra connector ways, report dict)."""
    from shapely import STRtree
    if not syn:
        return [], dict(snapped=0, connectors=0, unjoined=[dict(b) for b in bnd])
    bp = [Point(b['x'], b['z']) for b in bnd]
    tree = STRtree(bp) if bp else None
    used = {}
    snapped = 0
    far = []
    ends = []
    for wi, w in enumerate(syn):
        for end in (0, -1):
            ends.append((wi, end))
    # nearest-first so two synthetic ends do not fight over one OSM end
    cand = []
    for wi, end in ends:
        w = syn[wi]
        p = w['pts'][end]
        P = Point(p)
        if tree is None:
            continue
        for k in tree.query(P.buffer(32)):
            k = int(k)
            d = bp[k].distance(P)
            b = bnd[k]
            a = w['attrs']
            same = bool((b['name'] and b['name'] == a['name']) or (b['ref'] and a['ref'] and b['ref'] == a['ref']))
            if d <= 3.0 or (d <= 32 and same):
                cand.append((d, wi, end, k))
    cand.sort()
    done_end = set()
    for d, wi, end, k in cand:
        if (wi, end) in done_end:
            continue
        b = bnd[k]
        w = syn[wi]
        a = w['attrs']
        # direction compatibility: a one-way synthetic road must flow the same way as a one-way OSM piece
        if a['oneway'] and b['flow'] != 'both':
            syn_flow_out_of_rect = (end == 0)          # synthetic road starts at the edge -> carries traffic out of the rectangle
            if (b['flow'] == 'out') != syn_flow_out_of_rect:
                continue
        if k in used and not (a['oneway'] and bnd[k]['flow'] == 'both'):
            # one OSM end can take several synthetic ends only if they are distinct carriageways; keep the nearest
            continue
        pts_ = list(w['pts'])
        pts_[end] = (b['x'], b['z'])
        w['pts'] = pts_
        used.setdefault(k, []).append((wi, end))
        done_end.add((wi, end))
        snapped += 1
        if d > 3.0:
            far.append(dict(road=w['id'], moved=round(d, 1), to=b['name'] or b['ref']))
    # connectors for OSM ends nobody joined
    extra = []
    unjoined = []
    BASE = lambda k_: k_.replace('_link', '')  # noqa: E731
    rank = {'motorway': 5, 'trunk': 4, 'primary': 3, 'secondary': 2, 'tertiary': 1}
    joined_pts = [(bnd[k], syn[wi], end) for k, lst in used.items() for wi, end in lst]
    for k, b in enumerate(bnd):
        if k in used:
            continue
        best = None
        for jb, w, end in joined_pts:
            if jb['side'] != b['side']:
                continue
            d = math.hypot(jb['x'] - b['x'], jb['z'] - b['z'])
            if d > 160:
                continue
            ra, rb = rank.get(BASE(w['attrs']['kind']), 0), rank.get(BASE(b['kind']), 0)
            if abs(ra - rb) > 1 and not (b['kind'].endswith('_link') and ra >= rb - 2):
                continue
            samename = (b['name'] and b['name'] == jb['name']) or (b['ref'] and b['ref'] == jb['ref'])
            score = d - (60 if samename else 0)
            # the synthetic road must be able to carry this end's flow
            a = w['attrs']
            if a['oneway']:
                out_ok = end == 0
                if b['flow'] == 'out' and not out_ok or b['flow'] == 'in' and out_ok:
                    continue
            if best is None or score < best[0]:
                best = (score, d, w, end)
        if best is None:
            unjoined.append(dict(b))
            continue
        _, d, w, end = best
        # merge point on the synthetic road, 2.5 x the gap away from the edge (at least 35 m), where the carriageways meet
        c = w['pts'] if end == 0 else w['pts'][::-1]
        ln = LineString(c)
        s_ = min(max(35.0, 2.5 * d), max(ln.length - 1.0, ln.length * 0.9))
        if ln.length < 12:
            unjoined.append(dict(b))
            continue
        q = ln.interpolate(s_)
        q = (round(q.x, 2), round(q.y, 2))
        # insert the merge vertex into the synthetic road
        cum = 0.0
        ins = None
        for i in range(1, len(c)):
            seg = math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])
            if cum + seg >= s_ - 1e-6:
                ins = i
                break
            cum += seg
        if ins is None:
            ins = len(c) - 1
        if c[ins] != q and c[ins - 1] != q:
            c2 = c[:ins] + [q] + c[ins:]
            yv = w.get('y')
            if yv is not None:
                yy = yv if end == 0 else yv[::-1]
                seg = math.hypot(c[ins][0] - c[ins - 1][0], c[ins][1] - c[ins - 1][1]) or 1.0
                t = (s_ - cum) / seg
                yy = yy[:ins] + [yy[ins - 1] + (yy[ins] - yy[ins - 1]) * max(0, min(1, t))] + yy[ins:]
                w['y'] = yy if end == 0 else yy[::-1]
            w['pts'] = c2 if end == 0 else c2[::-1]
        elif c[ins] == q or c[ins - 1] == q:
            q = c[ins] if c[ins] == q else c[ins - 1]
        # a gentle S-curve from the OSM end to the merge point
        bx, bz = b['x'], b['z']
        n = max(3, int(math.hypot(q[0] - bx, q[1] - bz) / 10))
        # tangent of the real road is perpendicular to the side; ease along it
        tx, tz = {'north': (0, -1), 'south': (0, 1), 'west': (-1, 0), 'east': (1, 0)}[b['side']]
        L = math.hypot(q[0] - bx, q[1] - bz)
        c1 = (bx + tx * L * 0.4, bz + tz * L * 0.4)
        curve = []
        for i in range(n + 1):
            u = i / n
            x = (1 - u) ** 2 * bx + 2 * (1 - u) * u * c1[0] + u * u * q[0]
            z = (1 - u) ** 2 * bz + 2 * (1 - u) * u * c1[1] + u * u * q[1]
            curve.append((round(x, 2), round(z, 2)))
        curve[0] = (bx, bz)
        curve[-1] = q
        if b['flow'] == 'in':
            curve = curve[::-1]
        a = dict(w['attrs'])
        one = b['flow'] != 'both'
        lanes = b['lf'] if one else b['lf'] + b['lb']
        a.update(kind=b['kind'], oneway=one, lf=b['lf'] if one else max(1, b['lf']), lb=0 if one else max(1, b['lb']),
                 w=b['w'], sp=b['sp'], name=b['name'] or a['name'], ref=b['ref'] or a['ref'], br=False, layer=0, synthetic=True,
                 connector=True, sid=f"join:{b['way']}")
        extra.append(dict(pts=curve, attrs=a, id=f"join:{b['way']}:{k}", y=None))
    rep = dict(snapped=snapped, snappedFar=far, connectors=len(extra), unjoined=unjoined, osmEnds=len(bnd))
    log(f"stitch: {len(bnd)} OSM road ends on the rectangle edge; {snapped} synthetic ends snapped ({len(far)} moved > 3 m), "
        f"{len(extra)} carriageway connectors, {len(unjoined)} OSM ends left as dead ends")
    return extra, rep


def build_graph(is_water_pt, synthetic=None, terrain=None, log=print):
    """-> nodes [[x, z]], edges [dict], info.
    `synthetic`: ingested road ways [dict(pts, attrs, id, y)], already stitched and noded.
    `terrain(x, z)`: ground height; edge 'y' is the ABSOLUTE road surface height (terrain + deck), None when flat at 0.
    Each edge carries 'ways' (set of OSM / synthetic way ids) so relations and profiles can be resolved."""
    ways, osm_xy, bnd, tunnels = osm_ways()
    fit_ids = {w['id'] for w in (synthetic or []) if w.get('surveyed')}
    tol = lambda e: SIMPLIFY_FIT if e.get('ways') and (e['ways'] & fit_ids) else SIMPLIFY
    if ways: ways += rescue_outside(ways, log=log)   # stage 1 map v3 (MIAMI_NO_OSM): no OSM ways to rescue
    prof = {}
    for w in synthetic or []:
        ways.append((w['pts'], w['attrs'], w['id']))
        if w.get('y') is not None:
            prof[w['id']] = (LineString(w['pts']), w['pts'], w['y'])
    # node detection
    cnt = defaultdict(int)
    for c, a, wid in ways:
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
    for c, a, wid in ways:
        cur = [c[0]]
        for v in c[1:]:
            if key(v) == key(cur[-1]):
                continue
            cur.append(v)
            if cnt[key(v)] >= 2 and len(cur) >= 2:
                raw.append(dict(a=node(cur[0]), b=node(cur[-1]), pts=cur, ways={wid}, **{k: a[k] for k in a}))
                cur = [v]
    raw = [r for r in raw if not (r['a'] == r['b'] and len(r['pts']) < 4)]
    # contract edges shorter than 0.6 m (their two junctions become one)
    rep = {}

    def rfind(a):
        while rep.get(a, a) != a:
            a = rep[a]
        return a
    for r in raw:
        if LineString(r['pts']).length < 0.6:
            a_, b_ = rfind(r['a']), rfind(r['b'])
            if a_ != b_:
                rep[b_] = a_
            r['_drop'] = True
    if rep or any(r.get('_drop') for r in raw):
        keep = []
        for r in raw:
            if r.get('_drop'):
                continue
            a_, b_ = rfind(r['a']), rfind(r['b'])
            if a_ != r['a']:
                r['a'] = a_
                r['pts'] = [tuple(nodes[a_])] + list(r['pts'][1:])
            if b_ != r['b']:
                r['b'] = b_
                r['pts'] = list(r['pts'][:-1]) + [tuple(nodes[b_])]
            keep.append(r)
        raw = keep
    edges = merge_chains(raw)
    edges, dropped = prune_components(edges, 600.0, world_box().exterior)
    if dropped:
        log(f'roads: dropped {dropped[0]} edges in {dropped[1]} disconnected scraps (under 600 m in total, or under 150 m at the rectangle edge): {dropped[2]:.0f} m')
    edges += link_components(nodes, edges, log)
    if MASK is not None:
        import citymask
        edges += citymask.bridge_components(nodes, edges, log)
    log(f'roads: {len(ways)} way pieces, {len(nodes)} raw nodes, {len(raw)} raw edges -> {len(edges)} merged edges; tunnels skipped {tunnels}')
    # compact node ids
    used = sorted({e['a'] for e in edges} | {e['b'] for e in edges})
    remap = {o: i for i, o in enumerate(used)}
    nodes = [nodes[o] for o in used]
    for e in edges:
        e['a'], e['b'] = remap[e['a']], remap[e['b']]
    node_key = {k: remap[v] for k, v in nid.items() if v in remap}
    # simplify + densify
    for e in edges:
        ln = LineString(e['pts']).simplify(tol(e), preserve_topology=False)
        e['pts'] = densify(list(ln.coords), 12.0)
        e['pts'][0] = tuple(nodes[e['a']])
        e['pts'][-1] = tuple(nodes[e['b']])
    elevate(nodes, edges, is_water_pt)
    n_prof = n_terr = 0
    for e in edges:
        # explicit deck profiles from the synthetic world win over the computed bridge heights
        pw = [prof[w] for w in e['ways'] if w in prof]
        if pw:
            yy = []
            for v in e['pts']:
                P = Point(v)
                ln, c, y = min(pw, key=lambda t: t[0].distance(P))
                s_ = ln.project(P)
                cum = 0.0
                val = y[-1]
                for i in range(1, len(c)):
                    seg = math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])
                    if cum + seg >= s_ - 1e-9:
                        t = (s_ - cum) / seg if seg > 0 else 0
                        val = y[i - 1] + (y[i] - y[i - 1]) * max(0, min(1, t))
                        break
                    cum += seg
                yy.append(round(val, 2))
            e['y'] = yy
            n_prof += 1
        deck = max(e['y'])
        if terrain is not None:
            th = [terrain(v[0], v[1]) for v in e['pts']]
            if max(abs(h) for h in th) > 0.05:
                e['y'] = [round(max(h, 0.0) + (d if not pw else max(0.0, d - max(h, 0.0))), 2) if not pw else round(max(h, d), 2)
                          for h, d in zip(th, e['y'])]
                e['yg'] = [round(h, 2) for h in th]
                if deck < 0.3 and not pw:
                    e['tr'] = True          # follows the terrain; not a structure
                n_terr += 1
                e['_prof'] = bool(pw)
                continue
        if deck < 0.05:
            ln = LineString(e['pts']).simplify(tol(e), preserve_topology=False)
            e['pts'] = list(ln.coords)
            e['y'] = None
        e['_prof'] = bool(pw)
    # real decks that reach the rectangle edge (expressway viaducts, clipped bridges) carry their height into the
    # synthetic roads that continue them: the height decays along the synthetic network at the ramp grade
    Hn = {}
    for e in edges:
        if e.get('synthetic') or e['y'] is None:
            continue
        for n, v in ((e['a'], e['y'][0]), (e['b'], e['y'][-1])):
            if v > 0.05:
                Hn[n] = max(Hn.get(n, 0.0), v)
    sadj = defaultdict(list)
    for e in edges:
        if e.get('synthetic'):
            L_ = LineString(e['pts']).length
            sadj[e['a']].append((e['b'], L_))
            sadj[e['b']].append((e['a'], L_))
    Hn = {n: h for n, h in Hn.items() if n in sadj}
    hq = [(-h, n) for n, h in Hn.items()]
    heapq.heapify(hq)
    while hq:
        h, u = heapq.heappop(hq)
        h = -h
        if h < Hn.get(u, 0) - 1e-9:
            continue
        for v, L_ in sadj[u]:
            nh = h - GRADE * L_
            if nh > Hn.get(v, 0) + 1e-6 and nh > 0.05:
                Hn[v] = nh
                heapq.heappush(hq, (-nh, v))
    n_carry = 0
    for e in edges:
        if not e.get('synthetic'):
            continue
        ha, hb = Hn.get(e['a'], 0.0), Hn.get(e['b'], 0.0)
        if ha <= 0.05 and hb <= 0.05:
            continue
        if e['y'] is None:
            e['pts'] = densify(e['pts'], 12.0)
            e['y'] = [0.0] * len(e['pts'])
        c = e['pts']
        cum = [0.0]
        for i in range(1, len(c)):
            cum.append(cum[-1] + math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]))
        e['y'] = [round(max(y_, ha - GRADE * s_, hb - GRADE * (cum[-1] - s_)), 2) for y_, s_ in zip(e['y'], cum)]
        e.pop('tr', None)
        n_carry += 1
    if n_carry:
        log(f'roads: {n_carry} synthetic edges ramp down from real elevated roads at the rectangle edge')
    # continuity at junctions: every edge meeting at a node must agree on its height there. Real roads are the reference,
    # then explicit profiles; other edges are blended to them over up to 120 m.
    tgt = {}
    for e in edges:
        ya = e['y'][0] if e['y'] is not None else 0.0
        yb = e['y'][-1] if e['y'] is not None else 0.0
        for n, v in ((e['a'], ya), (e['b'], yb)):
            t = tgt.get(n)
            pr = (0 if e.get('synthetic') else 1, v)
            if t is None or pr > t:
                tgt[n] = pr
    n_fix = 0
    for e in edges:
        ya = e['y'][0] if e['y'] is not None else 0.0
        yb = e['y'][-1] if e['y'] is not None else 0.0
        da, db = tgt[e['a']][1] - ya, tgt[e['b']][1] - yb
        if abs(da) < 0.05 and abs(db) < 0.05:
            continue
        if not e.get('synthetic'):
            continue
        if e['y'] is None:
            e['pts'] = densify(e['pts'], 12.0)
            e['y'] = [0.0] * len(e['pts'])
        c = e['pts']
        cum = [0.0]
        for i in range(1, len(c)):
            cum.append(cum[-1] + math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]))
        L = cum[-1] or 1.0
        one = abs(da) < 0.05 or abs(db) < 0.05
        R_ = min(max(120.0, max(abs(da), abs(db)) / GRADE), L if one else L / 2)
        for i in range(len(c)):
            wa = max(0.0, 1 - cum[i] / R_) if abs(da) >= 0.05 else 0.0
            wb = max(0.0, 1 - (L - cum[i]) / R_) if abs(db) >= 0.05 else 0.0
            # smoothstep for a soft ramp
            wa, wb = wa * wa * (3 - 2 * wa), wb * wb * (3 - 2 * wb)
            e['y'][i] = round(max(0.0, e['y'][i] + da * wa + db * wb), 2)
        e['y'][0], e['y'][-1] = round(tgt[e['a']][1], 2), round(tgt[e['b']][1], 2)
        e.pop('tr', None) if max(e['y']) - max(e.get('yg') or [0]) > 0.3 else None
        n_fix += 1
        # a short synthetic link pinned between two real roads at different levels (a viaduct end and the street under
        # it) cannot be built: it is removed, and both real roads keep their own connections
        worst = max((abs(e['y'][i] - e['y'][i - 1]) / (cum[i] - cum[i - 1]) for i in range(1, len(c)) if cum[i] - cum[i - 1] > 0.5), default=0)
        if worst > 0.125 and tgt[e['a']][0] == 1 and tgt[e['b']][0] == 1:
            e['_kill'] = True
    # slope limit on the synthetic network: authored deck profiles may step up within a few meters of a junction or of
    # the rectangle edge. Heights are lowered to the 8 % envelope of their surroundings (real roads stay fixed, roads on
    # hills keep the terrain), which turns every step into a ramp.
    G8_ = 0.08
    val, fixed, nbr = {}, set(), defaultdict(list)
    for ei, e in enumerate(edges):
        ya = e['y'][0] if e['y'] is not None else 0.0
        yb = e['y'][-1] if e['y'] is not None else 0.0
        if not e.get('synthetic') or e.get('yg'):
            for n, v in ((e['a'], ya), (e['b'], yb)):
                k = ('n', n)
                val[k] = v if k not in fixed else max(val[k], v) if e.get('yg') else val[k]
                fixed.add(k)
    for ei, e in enumerate(edges):
        if not e.get('synthetic') or e.get('yg'):
            continue
        c = e['pts']
        n_ = len(c)
        ids = [('n', e['a'])] + [(ei, i) for i in range(1, n_ - 1)] + [('n', e['b'])]
        for i, k in enumerate(ids):
            y_ = e['y'][i] if e['y'] is not None else 0.0
            if k not in fixed:
                val[k] = min(val.get(k, 1e9), y_)
            if i:
                d_ = math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])
                nbr[k].append((ids[i - 1], d_))
                nbr[ids[i - 1]].append((k, d_))
    hq = [(v, i, k) for i, (k, v) in enumerate(val.items())]
    heapq.heapify(hq)
    cnt_ = len(hq)
    while hq:
        v, _, k = heapq.heappop(hq)
        if v > val[k] + 1e-9:
            continue
        for w, d_ in nbr[k]:
            if w in fixed:
                continue
            nv = v + G8_ * d_
            if nv < val[w] - 1e-6:
                val[w] = nv
                cnt_ += 1
                heapq.heappush(hq, (nv, cnt_, w))
    n_lim = 0
    for ei, e in enumerate(edges):
        if not e.get('synthetic') or e.get('yg') or e['y'] is None:
            continue
        n_ = len(e['pts'])
        ids = [('n', e['a'])] + [(ei, i) for i in range(1, n_ - 1)] + [('n', e['b'])]
        ny = [round(max(0.0, val[k]), 2) for k in ids]
        if any(abs(a_ - b_) > 0.02 for a_, b_ in zip(ny, e['y'])):
            n_lim += 1
        e['y'] = ny
        if max(ny) < 0.05:
            e['y'] = None
            e['pts'] = list(LineString(e['pts']).simplify(tol(e), preserve_topology=False).coords)
    if n_lim:
        log(f'roads: {n_lim} synthetic edges had steps in their deck profile turned into 8 % ramps')
    n_kill = sum(1 for e in edges if e.get('_kill'))
    if n_kill:
        edges[:] = [e for e in edges if not e.get('_kill')]
        log(f'roads: removed {n_kill} synthetic links that joined a real viaduct end straight to a street at another level')
    for e in edges:
        e.pop('_prof', None)
    if n_prof or n_terr or n_fix:
        log(f'roads: {n_prof} edges with explicit deck profiles, {n_terr} edges on non-flat terrain, {n_fix} edges blended to meet their neighbors')
    return nodes, edges, dict(nodeKey=node_key, osmNode=osm_xy, boundary=bnd)


def link_components(nodes, edges, log=print, max_gap=140.0, island_km=5.0):
    """Tie leftover pieces (gated estates whose driveway OSM maps as private, yards) to the main network with a short
    service link between the two nearest junctions. Big separate networks (an island reached only by ferry) stay apart."""
    from shapely import STRtree
    par = {}

    def find(a):
        par.setdefault(a, a)
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    for e in edges:
        ra, rb = find(e['a']), find(e['b'])
        if ra != rb:
            par[ra] = rb
    length = defaultdict(float)
    members = defaultdict(set)
    for e in edges:
        r = find(e['a'])
        length[r] += LineString(e['pts']).length
        members[r].update((e['a'], e['b']))
    if len(length) < 2:
        return []
    main = max(length, key=length.get)
    mnodes = sorted(members[main])
    tree = STRtree([Point(nodes[n]) for n in mnodes])
    out = []
    for r in sorted(length, key=lambda r: -length[r]):
        if r == main or length[r] > island_km * 1000:
            continue
        best = None
        for n in members[r]:
            P = Point(nodes[n])
            k = tree.query_nearest(P, max_distance=max_gap)
            if len(k):
                m = mnodes[int(k[0])]
                d = P.distance(Point(nodes[m]))
                if best is None or d < best[0]:
                    best = (d, n, m)
        if best is None:
            continue
        d, n, m = best
        a0 = next(e for e in edges if e['a'] == n or e['b'] == n)
        rec = dict(a0)
        rec.update(a=n, b=m, pts=[tuple(nodes[n]), tuple(nodes[m])], ways={f'link:{n}:{m}'}, kind='service', name=None, ref=None,
                   oneway=False, lf=1, lb=1, w=6.0, sp=24, br=False, layer=0, toll=False, tl=None, tlb=None, dst=None, dref=None,
                   priv=True, link=True, movable=False, brName=None, sidewalk='no')
        out.append(rec)
    if out:
        log(f'roads: {len(out)} leftover pieces linked to the main network with a short service link (gaps {[round(LineString(o["pts"]).length) for o in out]} m)')
    return out


def prune_components(edges, min_len, edge_line=None):
    """Drop weakly connected components whose total length is under min_len (clipped stubs, mapping scraps)."""
    par = {}

    def find(a):
        par.setdefault(a, a)
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    for e in edges:
        ra, rb = find(e['a']), find(e['b'])
        if ra != rb:
            par[ra] = rb
    length = defaultdict(float)
    for e in edges:
        c = e['pts']
        length[find(e['a'])] += sum(math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]) for i in range(1, len(c)))
    bad = {r for r, L in length.items() if L < min_len}
    if edge_line is not None:
        # pieces that reach the rectangle edge are kept down to 150 m: a synthetic road may join them there
        touch = set()
        for e in edges:
            for v in (e['pts'][0], e['pts'][-1]):
                if edge_line.distance(Point(v)) < 0.05:
                    touch.add(find(e['a']))
        bad = {r for r in bad if r not in touch or length[r] < 150}
    if not bad:
        return edges, None
    keep = [e for e in edges if find(e['a']) not in bad]
    return keep, (len(edges) - len(keep), len(bad), sum(length[r] for r in bad))


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
        return tuple(e.get(k) for k in ATTR_KEYS) + (bool(e.get('outside')), bool(e.get('synthetic')))
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
        ei['ways'] = ei['ways'] | ej['ways']
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


# ------------------------------------------------------------------ V2: relations, controls, rail
def restrictions(nodes, edges, info):
    """Turn restrictions -> [(kind 'no'|'only', fromEdge, viaNode, toEdge)] and via-way ones
    [(kind, fromEdge, [viaEdges], toEdge)], resolved against the built graph."""
    by_way = defaultdict(list)
    for e in edges:
        for w in e.get('ways', ()):
            by_way[w].append(e['id'])
    inc = defaultdict(set)
    for e in edges:
        inc[e['a']].add(e['id'])
        inc[e['b']].add(e['id'])
    out, outv, skipped = [], [], 0
    for r in load('relations'):
        t = r.get('tags', {})
        if t.get('type') != 'restriction':
            continue
        rs = t.get('restriction') or t.get('restriction:motorcar') or ''
        kind = 'no' if rs.startswith('no_') else 'only' if rs.startswith('only_') else None
        if not kind or t.get('except') == 'motorcar':
            skipped += 1
            continue
        fr = [m['ref'] for m in r['members'] if m['role'] == 'from' and m['type'] == 'way']
        to = [m['ref'] for m in r['members'] if m['role'] == 'to' and m['type'] == 'way']
        vn = [m['ref'] for m in r['members'] if m['role'] == 'via' and m['type'] == 'node']
        vw = [m['ref'] for m in r['members'] if m['role'] == 'via' and m['type'] == 'way']
        if not fr or not to:
            skipped += 1
            continue
        ok = False
        if vn and vn[0] in info['osmNode']:
            n = info['nodeKey'].get(key(info['osmNode'][vn[0]]))
            if n is not None:
                for f in fr:
                    fe = [k for k in by_way.get(f, ()) if k in inc[n]]
                    te = [k for k in by_way.get(to[0], ()) if k in inc[n]]
                    for a_ in fe:
                        for b_ in te:
                            if a_ != b_ or rs == 'no_u_turn':
                                out.append((kind, a_, n, b_, rs))
                                ok = True
        elif vw:
            vE = [k for w in vw for k in by_way.get(w, ())]
            vN = set()
            for k in vE:
                vN.add(edges[k]['a'])
                vN.add(edges[k]['b'])
            fe = [k for k in by_way.get(fr[0], ()) if edges[k]['a'] in vN or edges[k]['b'] in vN]
            te = [k for k in by_way.get(to[0], ()) if edges[k]['a'] in vN or edges[k]['b'] in vN]
            if fe and te and vE and len(vE) <= 4:
                outv.append((kind, fe[0], vE, te[0], rs))
                ok = True
        if not ok:
            skipped += 1
    print(f'restrictions: {len(out)} via-node, {len(outv)} via-way, {skipped} unresolved or not applicable')
    return out, outv


def controls(nodes, edges):
    """Traffic signals, stop and yield signs from OSM nodes.
    Sets e['ca'] / e['cb'] (control faced when ARRIVING at node a / node b: 1 signal, 2 stop, 3 yield) and
    returns (signalNodes set, exits {node: ref}, counts)."""
    from shapely import STRtree
    lines = [LineString(e['pts']) for e in edges]
    tree = STRtree(lines)
    deg = defaultdict(int)
    for e in edges:
        deg[e['a']] += 1
        deg[e['b']] += 1
    B = world_box()
    npts = [Point(n) for n in nodes]
    ntree = STRtree(npts)
    sig = set()
    exits = {}
    n_stop = n_yield = 0
    for p in load('pois'):
        t = p.get('tags') or {}
        hw = t.get('highway') or ''
        if 'lat' not in p or not hw:
            continue
        from config import proj
        x, z = proj(p['lon'], p['lat'])
        P = Point(x, z)
        if not B.contains(P):
            continue
        if hw.startswith('traffic_signals'):
            best = None
            for k in ntree.query(P.buffer(42)):
                d = npts[k].distance(P)
                if d <= 42 and deg[int(k)] >= 3 and (best is None or d < best[0]):
                    best = (d, int(k))
            if best is None:
                k = ntree.nearest(P)
                if npts[k].distance(P) < 6:
                    best = (0, int(k))
            if best:
                sig.add(best[1])
        elif hw in ('stop', 'give_way'):
            k = tree.nearest(P)
            e = edges[int(k)]
            ln = lines[int(k)]
            if ln.distance(P) > 6:
                continue
            s_ = ln.project(P)
            code = 2 if hw == 'stop' else 3
            end = None
            if s_ <= 45 and s_ <= ln.length - s_ and deg[e['a']] >= 3:
                end = 'ca'
            elif ln.length - s_ <= 45 and deg[e['b']] >= 3:
                end = 'cb'
            elif s_ <= 45 and deg[e['a']] >= 3:
                end = 'ca'
            if end == 'ca' and e['oneway']:
                end = None                  # traffic never arrives at node a on a one-way edge
            if end:
                e[end] = code
                n_stop += hw == 'stop'
                n_yield += hw != 'stop'
        elif hw == 'motorway_junction':
            k = ntree.nearest(P)
            if npts[k].distance(P) < 8 and t.get('ref'):
                exits[int(k)] = t['ref']
    # stage 1 map v3 (no OSM): rule-based controls, US practice. Rank roads; at every junction of 3+ approaches:
    #   two main roads (trunk / primary / secondary) meet -> traffic signal
    #   a main road meets minor roads -> stop signs on the minor approaches (the main road runs free)
    #   minor x minor: 4+ legs -> all-way stop; T junction -> stop on the leg that ends (the side street)
    import config as _cfg
    if _cfg.NO_OSM:
        RANKK = {'motorway': 5, 'trunk': 4, 'primary': 3, 'secondary': 2, 'tertiary': 1, 'residential': 0, 'unclassified': 0, 'service': -1, 'track': -1}
        inc = defaultdict(list)
        for i, e in enumerate(edges):
            if e.get('br') or (e.get('layer') or 0) > 0: continue
            inc[e['a']].append((i, 'ca')); inc[e['b']].append((i, 'cb'))
        def heading(e, end):
            p = e['pts']; a, b = (p[0], p[min(2, len(p) - 1)]) if end == 'ca' else (p[-1], p[max(0, len(p) - 3)])
            return math.atan2(b[0] - a[0], b[1] - a[1])
        for nd, lst in inc.items():
            if len(lst) < 3: continue
            rk = [RANKK.get(base(edges[i].get('kind') or 'residential'), 0) for i, _ in lst]
            mains = [k for k in rk if k >= 2]
            if len(mains) >= 2 and len(lst) >= 3 and not (len(mains) == 2 and len(lst) == 3 and min(rk) >= 2 and len(set(rk)) == 1 and False):
                sig.add(nd); continue
            if mains:
                for (i, end), k in zip(lst, rk):
                    if k < 2 and not (end == 'ca' and edges[i]['oneway']):
                        edges[i][end] = 2; n_stop += 1
                continue
            if len(lst) >= 4:
                for i, end in lst:
                    if not (end == 'ca' and edges[i]['oneway']): edges[i][end] = 2; n_stop += 1
            else:
                # T: the leg whose direction is farthest from straight-through with another leg gets the stop
                hs = [heading(edges[i], end) for i, end in lst]
                best = None
                for x in range(3):
                    for y in range(x + 1, 3):
                        d = abs(((hs[x] - hs[y] + math.pi) % (2 * math.pi)) - math.pi)
                        if best is None or d > best[0]: best = (d, x, y)
                stem = 3 - best[1] - best[2]
                i, end = lst[stem]
                if not (end == 'ca' and edges[i]['oneway']): edges[i][end] = 2; n_stop += 1
    for e in edges:
        if e['b'] in sig:
            e['cb'] = 1
        if e['a'] in sig and not e['oneway']:
            e['ca'] = 1
    print(f'controls: {len(sig)} signalized nodes, {n_stop} stop approaches, {n_yield} yield approaches, {len(exits)} numbered exits')
    return sig, exits


RAIL_KINDS = {'rail': 'rail', 'light_rail': 'light_rail', 'subway': 'metro', 'monorail': 'people_mover', 'tram': 'tram'}


def rails():
    """Rail, metro and people-mover track center lines with deck heights.
    -> [dict(kind, line LineString, y [per vertex], br, layer, ways)]."""
    B = world_box()
    segs = []
    for e in load('highways'):
        t = e.get('tags', {})
        rk = RAIL_KINDS.get(t.get('railway'))
        if not rk or t.get('tunnel') == 'yes' or t.get('service') in ('yard', 'siding', 'spur') and rk == 'rail' and not t.get('name'):
            continue
        c = pts(e['geometry'])
        if len(c) < 2:
            continue
        try:
            layer = int(float(str(t.get('layer', '0')).split(';')[0]))
        except Exception:  # noqa: BLE001
            layer = 0
        br = t.get('bridge') not in (None, 'no')
        if rk in ('people_mover', 'metro') and not br and layer >= 1:
            br = True                       # the whole system is on viaduct; some ways just miss the tag
        ln = LineString(c)
        g = ln.intersection(B) if not B.contains(ln) else ln
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.geom_type == 'LineString' and p.length > 1:
                segs.append(dict(kind=rk, pts=densify(list(p.simplify(0.4).coords), 12.0), br=br, layer=layer, way=e['id'],
                                 gauge=t.get('gauge')))
    # deck heights: viaducts sit at 6.8 m per layer (min 7.5 m for the people mover), ramps at 4 % along the track
    H = {}
    adj = defaultdict(list)
    for s_ in segs:
        c = s_['pts']
        h = (max(7.5, 6.8 * max(1, s_['layer'])) if s_['kind'] in ('people_mover', 'metro') else 6.8 * max(1, s_['layer'])) if s_['br'] else 0.0
        for i, v in enumerate(c):
            k = key(v)
            if h:
                H[k] = max(H.get(k, 0), h)
            if i:
                d = math.hypot(v[0] - c[i - 1][0], v[1] - c[i - 1][1])
                adj[k].append((key(c[i - 1]), d))
                adj[key(c[i - 1])].append((k, d))
    P = dict(H)
    hq = [(-h, v) for v, h in H.items()]
    heapq.heapify(hq)
    while hq:
        h, v = heapq.heappop(hq)
        h = -h
        if h < P.get(v, 0) - 1e-9:
            continue
        for u, d in adj[v]:
            nh = h - 0.04 * d
            if nh > P.get(u, 0) + 1e-6:
                P[u] = nh
                heapq.heappush(hq, (-nh, u))
    for s_ in segs:
        s_['y'] = [round(P.get(key(v), 0.0), 2) for v in s_['pts']]
        s_['line'] = LineString(s_['pts'])
    from collections import Counter
    print('rails:', dict(Counter(s_['kind'] for s_ in segs)), 'elevated', sum(1 for s_ in segs if max(s_['y']) > 0.5))
    return segs
