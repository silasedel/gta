"""The picture wins inside the real rectangle (FORMAT v4 `city_mask`).

Real Miami (OSM) is kept only where it falls on the official map picture's land; where the picture shows water, real land,
roads, buildings and points are removed; where the picture shows land that real data lacks, `newLand` (with the layout's
synthetic streets and buildings) fills in. A 150 m band along the rectangle edge takes the picture's land as is, so no
straight box edge is left in the land, water or land use where real canals or slips meet the border.
"""
import json, math
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, substring
from shapely import prepare, contains_xy, STRtree
from osmgeom import fix, polys_only

EDGE_BAND = 150.0      # m inside the rectangle where the picture's land is taken as is (seam)
SLIVER = 400.0         # m2: holes / pieces of land smaller than this are dropped (trace noise)
ROAD_PAD = 6.0         # m: real roads are kept this far past the kept land (seawalls, shore drives)
SUPPORT = 12.0         # m: a road end this close to land is supported
MAX_SPAN = 2500.0      # m: longest picture-water crossing a real street keeps as a bridge span
PT_PAD = 15.0          # m: real buildings / points this close to land are kept


def _poly(r):
    try:
        g = Polygon(r['outer'], r.get('holes') or []).buffer(0)
    except Exception:
        return None
    return g if not g.is_empty else None


def _clean(g):
    out = []
    for p in polys_only(g):
        if p.area < SLIVER:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= SLIVER]
        out.append(Polygon(p.exterior, holes))
    return fix(unary_union(out)) if out else None


def load(features_path, real_land, RB, log=print):
    """-> dict(L, W, N, land_in, keep_pt(x, z), road_keep, support, causeways, islands, stats) or None without a mask."""
    try:
        F = json.load(open(features_path))
    except Exception:
        return None
    cm = F.get('city_mask')
    if not cm:
        return None
    L = fix(unary_union([g for g in map(_poly, cm.get('land', [])) if g is not None]))
    W = fix(unary_union([g for g in map(_poly, cm.get('water', [])) if g is not None]))
    N = fix(unary_union([g for g in map(_poly, cm.get('newLand', [])) if g is not None]))
    real_in = fix(real_land.intersection(RB))
    band = RB.difference(RB.buffer(-EDGE_BAND))
    parts = [real_in.intersection(L)]
    if N is not None:
        parts.append(N)
    parts.append(L.intersection(band))
    land_in = _clean(fix(unary_union(parts).intersection(RB)))
    removed = fix(real_in.difference(land_in))
    added = fix(land_in.difference(real_in))
    st = dict(rectKm2=round(RB.area / 1e6, 2), pictureLandKm2=round(L.area / 1e6, 2), realLandKm2=round(real_in.area / 1e6, 2),
              keptLandKm2=round(land_in.area / 1e6, 2), realLandRemovedKm2=round(removed.area / 1e6 if removed is not None else 0, 2),
              newLandKm2=round(added.area / 1e6 if added is not None else 0, 2))
    log(f'citymask: inside the rectangle land {st["keptLandKm2"]} km2 (picture {st["pictureLandKm2"]}, real {st["realLandKm2"]}); '
        f'real land removed {st["realLandRemovedKm2"]} km2, land added {st["newLandKm2"]} km2')
    road_keep = land_in.buffer(ROAD_PAD)
    drop_inner = removed.buffer(-ROAD_PAD) if removed is not None else None
    if drop_inner is not None and drop_inner.is_empty:
        drop_inner = None
    support = land_in.buffer(SUPPORT)
    ptk = land_in.buffer(PT_PAD)
    for g in (road_keep, support, ptk):
        prepare(g)
    rx0, rz0, rx1, rz1 = RB.bounds

    def keep_pt(x, z):
        """False for a real point inside the rectangle that sits on the picture's water."""
        if not (rx0 <= x < rx1 and rz0 <= z < rz1):
            return True
        return bool(contains_xy(ptk, x, z))
    return dict(L=L, W=W, N=N, land_in=land_in, removed=removed, added=added, drop_inner=drop_inner, road_keep=road_keep, support=support, keep_pt=keep_pt,
                causeways=cm.get('causeways', []), islands=cm.get('islands', []), stats=st, RB=RB)


def mask_ways(pieces, M, outside_land=None, log=print):
    """Clip real road pieces [(coords, attrs, id)] to the kept land. Non-bridges are clipped to the land (+6 m); bridges keep
    their spans but lose the parts over removed real land, and any bridge left with an end over water (not on land and not
    meeting another road) is dropped, repeatedly, so no road dangles into the bay. One-way pieces that the cut turned into
    dead ends become two-way (no one-way trap). `outside_land`: prepared polygon for pieces outside the rectangle."""
    if M is None:
        return pieces
    RB = M['RB']
    keep, drop_g = M['road_keep'], M['drop_inner']
    RBp = RB.buffer(0.05)
    prepare(RBp)
    out = []
    cut_n = 0
    # vertices of real bridges: a causeway road between two bridges keeps its run over the picture's water as a span
    bkeys = set()
    for c, a, wid in pieces:
        if a.get('br') or (a.get('layer') or 0) > 0:
            bkeys.update((round(v[0], 2), round(v[1], 2)) for v in (c[0], c[-1]))
    for c, a, wid in pieces:
        ln = LineString(c)
        inside = RBp.contains(ln)
        land_g = keep if inside else (outside_land if outside_land is not None else None)
        if land_g is None:
            out.append((c, a, wid, False))
            continue
        if not inside:
            g = ln if (a.get('br') or land_g.contains(ln)) else ln.intersection(land_g)
            if g.equals(ln):
                out.append((c, a, wid, False))
            else:
                cut_n += 1
                for p in (g.geoms if hasattr(g, 'geoms') else [g]):
                    if p.geom_type == 'LineString' and p.length > 2.0:
                        out.append((list(p.coords), a, wid, True))
            continue
        if land_g.contains(ln) or a.get('br') or (a.get('layer') or 0) > 0:
            # bridges stay whole: the support pass below drops the ones left hanging over the water
            out.append((c, a, wid, False))
            continue
        # a street or causeway that crosses the picture's water: a crossing between two pieces of land on the same way
        # becomes a bridge span (the real causeways); a run that reaches the end of the way is cut at the shore
        L_ = ln.length
        wet = ln.difference(land_g)
        iv = []
        for p in (wet.geoms if hasattr(wet, 'geoms') else [wet]):
            if p.geom_type != 'LineString' or p.length < 0.5:
                continue
            s0, s1 = sorted((ln.project(Point(p.coords[0])), ln.project(Point(p.coords[-1]))))
            if s1 - s0 < 0.5:
                continue
            okA = s0 > 0.5 or (round(c[0][0], 2), round(c[0][1], 2)) in bkeys
            okB = s1 < L_ - 0.5 or (round(c[-1][0], 2), round(c[-1][1], 2)) in bkeys
            span = okA and okB and (s1 - s0) <= MAX_SPAN
            iv.append((s0, s1, span))
        if not iv:
            out.append((c, a, wid, False))
            continue
        iv.sort()
        cut_n += 1
        ab = dict(a)
        ab.update(br=True, layer=max(1, a.get('layer') or 0))
        cur = 0.0
        prev_end = None
        segs = []
        for s0, s1, span in iv:
            if s0 > cur + 0.5:
                segs.append((cur, s0, a, True))
            if span:
                segs.append((s0, s1, ab, True))
            cur = max(cur, s1)
        if cur < L_ - 0.5:
            segs.append((cur, L_, a, True))
        dead = any(not sp for _, _, sp in iv)
        for s0, s1, aa, _ in segs:
            g = substring(ln, s0, s1)
            if g.geom_type != 'LineString' or g.length <= 2.0:
                prev_end = None
                continue
            cc = list(g.coords)
            if prev_end is not None and math.hypot(cc[0][0] - prev_end[0], cc[0][1] - prev_end[1]) < 0.01:
                cc[0] = prev_end
            out.append((cc, aa, wid, dead))
            prev_end = cc[-1]
    # support: a piece end must be on land, on the rectangle edge, or meet another piece
    sup = M['support']
    x0, z0, x1, z1 = RB.bounds

    def k(v):
        return (round(v[0], 2), round(v[1], 2))

    def on_edge(v):
        return min(abs(v[0] - x0), abs(v[0] - x1), abs(v[1] - z0), abs(v[1] - z1)) < 0.05
    alive = [True] * len(out)
    dropped = 0
    while True:
        cnt = {}
        for i, (c, a, wid, cut) in enumerate(out):
            if not alive[i]:
                continue
            for v in set(map(k, c)):
                cnt[v] = cnt.get(v, 0) + 1
        changed = False
        for i, (c, a, wid, cut) in enumerate(out):
            if not alive[i]:
                continue
            for v in (c[0], c[-1]):
                if cnt.get(k(v), 0) >= 2 or on_edge(v):
                    continue
                if contains_xy(sup, v[0], v[1]) or (outside_land is not None and not RB.contains(Point(v)) and contains_xy(outside_land, v[0], v[1])):
                    continue
                alive[i] = False
                dropped += 1
                changed = True
                break
        if not changed:
            break
    res = []
    two_way = 0
    for i, (c, a, wid, cut) in enumerate(out):
        if not alive[i]:
            continue
        if cut and a.get('oneway'):
            a = dict(a)
            a['oneway'] = False
            a['lb'] = max(1, a.get('lf') or 1)
            two_way += 1
        res.append((c, a, wid))
    log(f'citymask: real road pieces {len(pieces)} -> {len(res)} ({cut_n} cut at the picture shore, {dropped} pieces left over water dropped, '
        f'{two_way} cut one-way pieces made two-way)')
    return res


def causeway_ways(M, real_ways, syn_ways, land_ok, log=print, reach=350.0):
    """The mask's causeway centerlines as two-way bridge roads, from the nearest road vertex on one side to the nearest on
    the other. Skipped where a road bridge already crosses near it, or where either side has no road within reach."""
    if M is None or not M['causeways']:
        return []
    verts, bridges = [], []
    for c, a, wid in real_ways:
        verts.extend(c)
        if a.get('br'):
            bridges.append(LineString(c))
    for w in syn_ways:
        verts.extend(w['pts'])
        if w['attrs'].get('br'):
            bridges.append(LineString(w['pts']))
    verts = [v for v in {(round(v[0], 2), round(v[1], 2)) for v in verts} if land_ok(v[0], v[1])]
    if not verts:
        return []
    vt = STRtree([Point(v) for v in verts])
    bt = STRtree(bridges) if bridges else None
    out, skipped = [], []
    for i, cw in enumerate(M['causeways']):
        pts = [(float(p[0]), float(p[1])) for p in cw['pts']]
        cl = LineString(pts)
        if bt is not None and len(bt.query(cl.buffer(120))):
            skipped.append((cw.get('island'), 'bridge exists'))
            continue
        ends = []
        for p in (pts[0], pts[-1]):
            j = vt.query_nearest(Point(p), max_distance=reach)
            ends.append(verts[int(j[0])] if len(j) else None)
        if ends[0] is None or ends[1] is None or ends[0] == ends[1]:
            skipped.append((cw.get('island'), 'no road within reach'))
            continue
        c = [ends[0]] + pts + [ends[1]]
        c = [v for j, v in enumerate(c) if j == 0 or math.hypot(v[0] - c[j - 1][0], v[1] - c[j - 1][1]) > 0.5]
        a = dict(kind='residential', name=None, oneway=False, rev=False, lf=1, lb=1, w=8.0, sp=40, br=True, movable=False, layer=1,
                 ref=None, sidewalk='yes', surface='concrete', toll=False, lit=True, spTag=False, tl=None, tlb=None, dst=None, dref=None,
                 brName=None, access=None, junction=None, synthetic=True, sid=f'causeway:{cw.get("island")}', priv=False)
        out.append(dict(pts=c, attrs=a, id=f'causeway:{cw.get("island")}:{i}', y=None))
    log(f'citymask: {len(out)} mask causeways added as bridge roads; skipped {skipped}')
    return out


def bridge_components(nodes, edges, log=print, max_gap=1500.0, ferry_names=('Fisher Island',)):
    """After the picture's water cut real causeways: every road piece still apart from the main network (except the
    ferry-only islands) gets one two-way bridge road from its nearest junction to the nearest junction of the main
    network, if that gap is at most `max_gap`. Same rule as the mask causeways (shortest crossing, generated)."""
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
    length, members, ferry = {}, {}, set()
    for e in edges:
        r = find(e['a'])
        length[r] = length.get(r, 0.0) + LineString(e['pts']).length
        members.setdefault(r, set()).update((e['a'], e['b']))
        if any(f in (e.get('name') or '') for f in ferry_names):
            ferry.add(r)
    if len(length) < 2:
        return []
    main = max(length, key=length.get)
    mnodes = sorted(members[main])
    tree = STRtree([Point(nodes[n]) for n in mnodes])
    out = []
    for r in sorted(length, key=lambda r: -length[r]):
        if r == main or r in ferry or length[r] < 300:
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
        rec.update(a=n, b=m, pts=[tuple(nodes[n]), tuple(nodes[m])], ways={f'bridge:{n}:{m}'}, kind='tertiary', name=None, ref=None,
                   oneway=False, lf=1, lb=1, w=8.0, sp=40, br=True, layer=1, toll=False, tl=None, tlb=None, dst=None, dref=None,
                   priv=False, link=True, movable=False, brName=None, sidewalk='yes', synthetic=True)
        rec.pop('outside', None)
        out.append(rec)
    if out:
        log(f'citymask: {len(out)} road pieces cut off by the picture water joined with a bridge (spans {[round(LineString(o["pts"]).length) for o in out]} m)')
    return out
