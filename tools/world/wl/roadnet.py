"""Road network machinery: dual-carriageway motorways, ramps and interchanges, grade separation, planarization into one
connected graph (shared vertices = junctions), automatic bridges over water with deck profiles and navigation humps,
and elevation propagation (viaducts, ramps, embankments) at limited grades.
"""
import heapq
import math
from collections import defaultdict
from shapely.geometry import LineString, Point, MultiPoint, box as sbox
from shapely.ops import unary_union, substring
from shapely import STRtree
from shapely.prepared import prep
from .util import catmull, cumlen, point_at, offset_line, sub_line, resample, plen, r2, BOUNDS
from .world import Road, RANK
from . import design as D

MOTOR = ('motorway', 'motorway_link')


def bezier(p0, t0, p1, t1, k=0.38, n=None):
    """Cubic from p0 (leaving along unit t0) to p1 (arriving along unit t1)."""
    d = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    c0 = (p0[0] + t0[0] * d * k, p0[1] + t0[1] * d * k)
    c1 = (p1[0] - t1[0] * d * k, p1[1] - t1[1] * d * k)
    n = n or max(6, int(d / 14))
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        e = t ** 3
        out.append((a * p0[0] + b * c0[0] + c * c1[0] + e * p1[0], a * p0[1] + b * c0[1] + c * c1[1] + e * p1[1]))
    return out


class Motorway:
    """A divided highway built from one centerline: two one-way carriageways (fwd follows the centerline direction)."""

    def __init__(self, world, ctrl, name, ref, lanes=3, median=10.0, speed=105, region='', spline=True, viaduct=None, step=24.0, kind='motorway'):
        self.world = world
        self.center = catmull(ctrl, step=step) if spline else [tuple(p) for p in ctrl]
        self.center = resample(self.center, step)
        self.cum = cumlen(self.center)
        self.length = self.cum[-1]
        self.lanes = lanes
        self.name, self.ref = name, ref
        w = lanes * 3.65 + 5.0
        self.off = median / 2.0 + w / 2.0
        self.width = w
        tags = {'mw': ref or name}
        if viaduct:
            tags['T'] = viaduct
        common = dict(ref=ref, lf=lanes, oneway=True, speed=speed, region=region, tags=tags)
        f = offset_line(self.center, self.off)
        b = offset_line(self.center, -self.off)[::-1]
        self.fwd = world.road(f, kind, name, **common)
        self.back = world.road(b, kind, name, **common)
        if viaduct:
            for r in (self.fwd, self.back):
                r.bridge = True
                r.layer = 1

    def at(self, s):
        return point_at(self.center, s, self.cum)

    def carriage_point(self, s, fwd=True):
        x, z, dx, dz = self.at(s)
        k = self.off if fwd else -self.off
        nx, nz = -dz, dx
        p = (x + nx * k, z + nz * k)
        t = (dx, dz) if fwd else (-dx, -dz)
        return p, t

    def nearest_s(self, p):
        return LineString(self.center).project(Point(p))


def snap_on(road, p):
    """Insert the point of `road` nearest to p as a vertex; returns that vertex."""
    ln = LineString(road.pts)
    s = ln.project(Point(p))
    q = ln.interpolate(s)
    q = r2((q.x, q.y))
    cum = cumlen(road.pts)
    for i, c in enumerate(cum):
        if abs(c - s) < 0.4:
            return road.pts[i]
    for i in range(len(cum) - 1):
        if cum[i] < s < cum[i + 1]:
            road.pts.insert(i + 1, q)
            return q
    return road.pts[-1] if s >= cum[-1] else road.pts[0]


def ramp(world, a, ta, b, tb, name='', lanes=1, region='', k=0.36, tags=None, speed=60):
    return world.road(bezier(a, ta, b, tb, k), 'motorway_link', name, lf=lanes, oneway=True, speed=speed, region=region, tags=tags or {})


def diamond(world, mw, cross, s_c=None, reach=300.0, lateral=140.0, which='NESW', name='', region=''):
    """Diamond interchange between a Motorway and a crossing road (Road object, at-grade both sides)."""
    cl = LineString(mw.center)
    xl = cross.line
    ip = cl.intersection(xl)
    if ip.is_empty:
        world.log.append(f'diamond: {mw.ref} x {cross.name}: no crossing')
        return
    if ip.geom_type != 'Point':
        ip = list(ip.geoms)[0]
    s_c = cl.project(ip)
    x, z, dx, dz = mw.at(s_c)
    nx, nz = -dz, dx
    sx = xl.project(ip)
    made = 0
    for side, fwd in ((1, True), (-1, False)):
        # terminal on the crossroad on this side of the motorway
        best = None
        for sgn in (1, -1):
            q = xl.interpolate(max(0.0, min(xl.length, sx + sgn * lateral)))
            lat = (q.x - x) * nx + (q.y - z) * nz
            if lat * side > 0 and (best is None or abs(lat) > abs(best[1])):
                best = (q, lat)
        if best is None or abs(best[1]) < lateral * 0.5:
            continue
        term = snap_on(cross, (best[0].x, best[0].y))
        t = (dx, dz) if fwd else (-dx, -dz)
        s_off = s_c - reach if fwd else s_c + reach
        s_on = s_c + reach if fwd else s_c - reach
        if 0 < s_off < mw.length:
            a, ta = mw.carriage_point(s_off, fwd)
            a = snap_on(mw.fwd if fwd else mw.back, a)
            ramp(world, a, ta, term, t, name, region=region, tags={'ramp': 'off'})
            made += 1
        if 0 < s_on < mw.length:
            c, tc = mw.carriage_point(s_on, fwd)
            c = snap_on(mw.fwd if fwd else mw.back, c)
            ramp(world, term, t, c, tc, name, region=region, tags={'ramp': 'on'})
            made += 1
    return made


def tee(world, through, ending, at_end=True, reach=360.0, region=''):
    """System interchange: `ending` motorway terminates at `through`. Four direct / semi-direct ramps."""
    e_in, e_out = (ending.fwd, ending.back) if at_end else (ending.back, ending.fwd)
    pin, pout = e_in.pts[-1], e_out.pts[0]
    tin = _dir(e_in.pts[-2], e_in.pts[-1])
    tout = _dir(e_out.pts[0], e_out.pts[1])
    mid = ((pin[0] + pout[0]) / 2, (pin[1] + pout[1]) / 2)
    s_c = through.nearest_s(mid)
    x, z, dx, dz = through.at(s_c)
    nx, nz = -dz, dx
    side = 1 if ((mid[0] - x) * nx + (mid[1] - z) * nz) > 0 else -1
    # near carriageway = the one on the ending motorway's side
    near_fwd = side > 0
    for fwd in (True, False):
        down = s_c + reach if fwd else s_c - reach      # downstream merge point on this carriageway
        up = s_c - reach if fwd else s_c + reach        # upstream diverge point
        car = through.fwd if fwd else through.back
        if 0 < down < through.length:
            p, t = through.carriage_point(down, fwd)
            p = snap_on(car, p)
            ramp(world, pin, tin, p, t, region=region, k=0.42 if fwd == near_fwd else 0.5, tags={'ramp': 'sys'}, speed=75)
        if 0 < up < through.length:
            p, t = through.carriage_point(up, fwd)
            p = snap_on(car, p)
            ramp(world, p, t, pout, tout, region=region, k=0.42 if fwd == near_fwd else 0.5, tags={'ramp': 'sys'}, speed=75)


def _dir(a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1.0
    return (dx / L, dz / L)


# ------------------------------------------------------------------------------------------------ grade separation
def grade_separate(world, deck=6.8):
    """Where a motorway (or ramp) properly crosses another road at the same layer, lift one of them onto an overpass
    section (layer 1 bridge). Motorway mainlines stay down unless the other road is tagged 'under'."""
    roads = world.raw_roads
    lines = [r.line for r in roads]
    tree = STRtree(lines)
    cuts = defaultdict(list)       # road index -> [(s, halfspan)]
    for i, r in enumerate(roads):
        if r.kind not in MOTOR or r.layer != 0:
            continue
        for j in tree.query(lines[i], predicate='intersects'):
            j = int(j)
            if j == i:
                continue
            o = roads[j]
            if o.layer != 0:
                continue
            if o.kind in MOTOR and j < i and r.kind == o.kind:
                continue
            ip = lines[i].intersection(lines[j])
            if ip.is_empty:
                continue
            pts = [g for g in (ip.geoms if hasattr(ip, 'geoms') else [ip]) if g.geom_type == 'Point']
            for p in pts:
                si, sj = lines[i].project(p), lines[j].project(p)
                # merges / diverges at endpoints are junctions, not crossings
                if min(si, lines[i].length - si) < 4.0 or min(sj, lines[j].length - sj) < 4.0:
                    continue
                # which one goes over?
                if o.kind == 'motorway' and r.kind == 'motorway':
                    over = j if o.tags.get('over') else i if r.tags.get('over') else max(i, j)
                elif r.kind == 'motorway' and o.kind == 'motorway_link':
                    over = j
                elif r.kind == 'motorway_link' and o.kind == 'motorway':
                    over = i
                elif o.kind in MOTOR:
                    over = max(i, j)
                elif o.tags.get('under'):
                    over = i
                else:
                    over = j
                under = i if over == j else j
                half = roads[under].width / 2.0 + 7.0
                cuts[over].append((lines[over].project(p), half))
    new = []
    for i, r in enumerate(roads):
        if i not in cuts:
            new.append(r)
            continue
        spans = sorted((s - h, s + h) for s, h in cuts[i])
        merged = []
        for a, b in spans:
            if merged and a <= merged[-1][1] + 45.0:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        L = lines[i].length
        pos = 0.0
        for a, b in merged:
            a, b = max(0.0, a), min(L, b)
            if a - pos > 0.5:
                new.append(r.copy_with(sub_line(r.pts, pos, a)))
            br = r.copy_with(resample(sub_line(r.pts, a, b), 8.0))
            br.bridge = True
            br.layer = r.layer + 1
            br.tags = dict(r.tags, T=deck, over=1)
            new.append(br)
            pos = b
        if L - pos > 0.5:
            new.append(r.copy_with(sub_line(r.pts, pos, L)))
    world.raw_roads = new


# ------------------------------------------------------------------------------------------------ planarize
def _cluster(points, tol=0.9):
    """Greedy grid clustering: map each point to a representative within tol."""
    grid = {}
    rep = {}
    for p in points:
        if p in rep:
            continue
        cx, cz = int(math.floor(p[0] / tol)), int(math.floor(p[1] / tol))
        found = None
        for ax in (cx - 1, cx, cx + 1):
            for az in (cz - 1, cz, cz + 1):
                for q in grid.get((ax, az), ()):
                    if abs(q[0] - p[0]) <= tol and abs(q[1] - p[1]) <= tol and math.hypot(q[0] - p[0], q[1] - p[1]) <= tol:
                        found = q
                        break
                if found:
                    break
            if found:
                break
        if found is None:
            grid.setdefault((cx, cz), []).append(p)
            rep[p] = p
        else:
            rep[p] = found
    return rep


def planarize(world, snap_tol=1.6):
    roads = [r for r in world.raw_roads if len(r.pts) >= 2 and plen(r.pts) > 0.5]
    lines = [r.line for r in roads]
    tree = STRtree(lines)
    ins = defaultdict(list)            # road index -> points to insert
    # 1. endpoint snapping onto other roads (T junctions)
    for i, r in enumerate(roads):
        for end in (0, -1):
            p = Point(r.pts[end])
            best = None
            for j in tree.query(p.buffer(snap_tol)):
                j = int(j)
                if j == i:
                    continue
                o = roads[j]
                d = lines[j].distance(p)
                if d < snap_tol and (best is None or d < best[0]):
                    best = (d, j)
            if best is not None:
                j = best[1]
                s = lines[j].project(p)
                q = lines[j].interpolate(s)
                q = r2((q.x, q.y))
                ins[j].append(q)
                r.pts[end] = q
    lines = [r.line for r in roads]
    tree = STRtree(lines)
    # 2. same-layer crossings
    for i, r in enumerate(roads):
        for j in tree.query(lines[i], predicate='intersects'):
            j = int(j)
            if j <= i:
                continue
            o = roads[j]
            if o.layer != r.layer:
                # different levels only connect at shared endpoints
                continue
            ip = lines[i].intersection(lines[j])
            if ip.is_empty:
                continue
            geoms = list(ip.geoms) if hasattr(ip, 'geoms') else [ip]
            for g in geoms:
                if g.geom_type == 'Point':
                    q = r2((g.x, g.y))
                    ins[i].append(q)
                    ins[j].append(q)
                elif g.geom_type in ('LineString', 'MultiLineString'):
                    for ln in (g.geoms if hasattr(g, 'geoms') else [g]):
                        for c in (ln.coords[0], ln.coords[-1]):
                            q = r2(c)
                            ins[i].append(q)
                            ins[j].append(q)
    # 3. cluster all junction candidates + endpoints so nearly-coincident nodes become one
    allp = []
    for i, r in enumerate(roads):
        allp.append(r.pts[0])
        allp.append(r.pts[-1])
        allp.extend(ins.get(i, ()))
    rep = _cluster(allp)
    out = []
    for i, r in enumerate(roads):
        ln = lines[i]
        pts = list(r.pts)
        pts[0] = rep.get(pts[0], pts[0])
        pts[-1] = rep.get(pts[-1], pts[-1])
        if i in ins:
            cum = cumlen(r.pts)
            L = cum[-1]
            add = sorted({rep.get(q, q) for q in ins[i]}, key=lambda q: ln.project(Point(q)))
            merged = [(c, p, False) for c, p in zip(cum, pts)]
            for q in add:
                s = ln.project(Point(q))
                merged.append((s, q, True))
            merged.sort(key=lambda t: (t[0], not t[2]))
            res = []
            for s, p, isj in merged:
                if res and math.hypot(res[-1][1][0] - p[0], res[-1][1][1] - p[1]) < 0.75:
                    if isj and not res[-1][2]:
                        # junction replaces a plain vertex (but never the road's own endpoints unless identical)
                        if len(res) == 1 and res[-1][1] != p:
                            res[-1] = (res[-1][0], p, True)
                        else:
                            res[-1] = (s, p, True)
                    continue
                res.append((s, p, isj))
            # keep the true end
            end = pts[-1]
            if math.hypot(res[-1][1][0] - end[0], res[-1][1][1] - end[1]) < 0.75:
                res[-1] = (res[-1][0], end if not res[-1][2] else res[-1][1], res[-1][2])
            pts = [p for _, p, _ in res]
        r.pts = pts
        if len(pts) >= 2:
            out.append(r)
    # 4. split at nodes
    use = defaultdict(int)
    for r in out:
        seen = set()
        for k, p in enumerate(r.pts):
            if p in seen:
                continue
            seen.add(p)
            use[p] += 2 if k in (0, len(r.pts) - 1) else 1
    final = []
    for r in out:
        cur = [r.pts[0]]
        for k in range(1, len(r.pts)):
            p = r.pts[k]
            cur.append(p)
            if k < len(r.pts) - 1 and use[p] >= 2:
                if plen(cur) > 0.3:
                    final.append(r.copy_with(cur))
                cur = [p]
        if len(cur) >= 2 and plen(cur) > 0.3:
            final.append(r.copy_with(cur))
    # 5. drop duplicate edges (same end nodes, nearly the same path): keep the higher class
    best = {}
    for r in final:
        a, b = r.pts[0], r.pts[-1]
        key = (min(a, b), max(a, b), round(plen(r.pts) / 3.0), r.layer)
        if key in best:
            o = best[key]
            if r.oneway and o.oneway and (r.pts[0] != o.pts[0]):
                key = key + ('rev',)
                best[key] = r
                continue
            if RANK[r.kind] < RANK[o.kind]:
                best[key] = r
        else:
            best[key] = r
    world.raw_roads = list(best.values())
    return world.raw_roads


# ------------------------------------------------------------------------------------------------ water bridges
def _clearance(depth):
    return 19.8 if depth >= 5.0 else 12.0 if depth >= 4.0 else 8.0


def split_bridges(world, wet):
    """Split every road where it runs over water; the water part becomes a bridge edge with a class and humps."""
    wet_p = prep(wet)
    chans = [(name, LineString(catmull(pts, step=25)), w, dep) for name, pts, w, dep in D.CHANNELS]
    out = []
    nb = 0
    for r in world.raw_roads:
        ln = r.line
        if r.tags.get('T') or not wet_p.intersects(ln):
            out.append(r)
            continue
        inter = ln.intersection(wet)
        segs = [g for g in (inter.geoms if hasattr(inter, 'geoms') else [inter]) if g.geom_type == 'LineString' and g.length > 0.6]
        if not segs:
            out.append(r)
            continue
        L = ln.length
        iv = sorted((ln.project(Point(g.coords[0])), ln.project(Point(g.coords[-1]))) for g in segs)
        iv = [(min(a, b), max(a, b)) for a, b in iv]
        merged = []
        for a, b in iv:
            if merged and a <= merged[-1][1] + 22.0:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        pos = 0.0
        for a, b in merged:
            span = b - a
            ab = 7.0 if span > 30 else 4.0
            a2, b2 = max(0.0, a - ab), min(L, b + ab)
            if a2 < pos:
                a2 = pos
            if a2 - pos > 0.6:
                out.append(r.copy_with(sub_line(r.pts, pos, a2)))
            br = r.copy_with(resample(sub_line(r.pts, a2, b2), 10.0 if span > 60 else 5.0))
            br.bridge = True
            cls = r.bclass or ('low' if span < 45 else 'mid' if span < 260 else 'long')
            if r.kind == 'track' and span < 30 and not r.bclass:
                cls = 'flat'
            base = {'flat': 1.2, 'low': 2.4 if RANK[r.kind] >= RANK['tertiary'] else 3.2, 'mid': 5.5, 'long': 6.2, 'high': 6.2}[cls]
            humps = []
            bl = LineString(br.pts)
            for name, cl, w, dep in chans:
                if cls in ('flat', 'low') and span < 45:
                    continue
                ip = bl.intersection(cl)
                if ip.is_empty:
                    continue
                for g in (ip.geoms if hasattr(ip, 'geoms') else [ip]):
                    if g.geom_type == 'Point':
                        humps.append((round(bl.project(g), 1), _clearance(dep), name, w))
            br.tags = dict(r.tags, bclass=cls, base=base, humps=humps, span=round(span, 1))
            out.append(br)
            nb += 1
            pos = b2
        if L - pos > 0.6:
            out.append(r.copy_with(sub_line(r.pts, pos, L)))
    world.raw_roads = out
    return nb


# ------------------------------------------------------------------------------------------------ elevation
def elevate(world, grade=0.06, grade_fast=0.05):
    """Per-vertex deck heights: bridge targets (with navigation humps), viaducts and pinned join heights are sources;
    heights fall away along the graph at the maximum grade. Roads that stay on the ground get y = None."""
    roads = world.raw_roads
    # densify anything that carries or may carry elevation
    T = {}
    for r in roads:
        tg = r.tags
        if r.bridge and 'bclass' in tg:
            pts = r.pts
            cum = cumlen(pts)
            L = cum[-1]
            base = tg['base']
            for p, s in zip(pts, cum):
                h = base
                for hs, clr, name, w in tg['humps']:
                    g = grade_fast
                    h = max(h, clr + 1.6 - g * max(0.0, abs(s - hs) - w * 0.5 - 6.0))
                # ease into the abutments on short bridges so the hump is not a table top
                edge = min(s, L - s)
                if tg['bclass'] in ('low', 'flat') and L > 1:
                    h = min(h, 0.9 + (base - 0.9) * min(1.0, edge / max(4.0, L * 0.3)))
                T[p] = max(T.get(p, 0.0), h)
        elif tg.get('T'):
            for p in r.pts:
                T[p] = max(T.get(p, 0.0), float(tg['T']))
        if 'y0' in tg:
            T[r.pts[0]] = max(T.get(r.pts[0], 0.0), float(tg['y0']))
        if 'y1' in tg:
            T[r.pts[-1]] = max(T.get(r.pts[-1], 0.0), float(tg['y1']))
    if not T:
        return
    # roads within reach of a source need vertices to carry the ramp: densify them
    src = MultiPoint([Point(p) for p in T.keys()])
    reach = max(T.values()) / grade_fast + 30.0
    src_tree = STRtree([Point(p) for p in T.keys()])
    for r in roads:
        if r.bridge and ('bclass' in r.tags or r.tags.get('T')):
            continue
        ln = r.line
        hits = src_tree.query(ln.buffer(reach))
        if len(hits) == 0:
            continue
        # keep end nodes, resample interior to ~10 m
        r.pts = [r.pts[0]] + [r2(p) for p in resample(r.pts, 10.0)[1:-1]] + [r.pts[-1]]
    # graph over vertices
    adj = defaultdict(list)
    for r in roads:
        g = grade_fast if r.kind in ('motorway', 'trunk', 'motorway_link') else grade
        for a, b in zip(r.pts, r.pts[1:]):
            d = math.hypot(b[0] - a[0], b[1] - a[1])
            adj[a].append((b, d, g))
            adj[b].append((a, d, g))
    H = dict(T)
    heap = [(-h, p) for p, h in T.items()]
    heapq.heapify(heap)
    while heap:
        nh, p = heapq.heappop(heap)
        h = -nh
        if h < H.get(p, 0.0) - 1e-9:
            continue
        for q, d, g in adj.get(p, ()):
            hq = h - g * d
            if hq > 0.03 and hq > H.get(q, 0.0) + 1e-6:
                H[q] = hq
                heapq.heappush(heap, (-hq, q))
    node_use = defaultdict(int)
    for r in roads:
        node_use[r.pts[0]] += 1
        node_use[r.pts[-1]] += 1
    for r in roads:
        ys = [H.get(p, 0.0) for p in r.pts]
        if max(ys) < 0.04:
            r.y = None
            continue
        # vertical-curve smoothing on interior vertices (two passes), never below a hard target
        for _ in range(3):
            sm = list(ys)
            for k in range(1, len(ys) - 1):
                v = 0.25 * ys[k - 1] + 0.5 * ys[k] + 0.25 * ys[k + 1]
                sm[k] = max(v, T.get(r.pts[k], 0.0) if r.bridge else 0.0) if r.bridge else v
            ys = sm
        r.y = [round(v, 2) for v in ys]


def finalize(world, wet):
    """raw_roads -> world.roads (graph edges with ids)."""
    grade_separate(world)
    planarize(world)
    nb = split_bridges(world, wet)
    planarize(world)
    elevate(world)
    world.roads = []
    for r in world.raw_roads:
        if len(r.pts) < 2:
            continue
        r.id = world.nid('r')
        world.roads.append(r)
    return nb


def connectivity(roads):
    """Union-find over shared end vertices. Returns (components sorted by size desc as lists of road indexes)."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for r in roads:
        a, b = find(r.pts[0]), find(r.pts[-1])
        if a != b:
            parent[a] = b
    comp = defaultdict(list)
    for i, r in enumerate(roads):
        comp[find(r.pts[0])].append(i)
    return sorted(comp.values(), key=len, reverse=True)
