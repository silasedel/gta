"""Curate the traced road graph into the world's road data (track maproads).

Run after trace.py and vectorize.py:  tools/world/.venv/bin/python -I tools/v2/maproads/curate.py
Reads out/vector.json, writes:
  out/roads_px.json      every curated road in image pixels (for overlay.py)
  out/maproads.json      the data tools/world/build.py reads: `main` (control polylines for the named main roads, image px)
                         and `roads` (extra roads in WORLD meters with kind / name / ref / lanes / junction flags)

Main roads are routed THROUGH the traced graph between hand-picked waypoints (so they follow the picture's curves);
where the picture's road is broken (a bridge over water, a gap under trees) the route falls back to the waypoint line.
Everything else that survives the filters (coast / beach edges, dense town blocks, the real Miami rectangle, airports)
becomes rural roads, classified by continuous length and apparent width.
"""
import sys, os, json, math, heapq
sys.path.append(os.path.expanduser('~/.local/lib/python3.13/site-packages'))
import numpy as np
from collections import defaultdict
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'out')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'world'))
from wl import trace as TR          # the image classifier and the image -> world transform (x = x0 + 30 px, z = z0 + 30 py)

REAL_PX = (724.7, 741.2, 998.7, 918.1)
AIRPORT_PX = [(515, 815, 680, 960), (205, 1258, 352, 1412)]

# ------------------------------------------------------------------ named main roads: waypoints in image px (read off ref_40)
MAIN = {
    # key: (kind, name, ref, lanes, waypoints). Keys match tools/world/build.py ROADS / RING.
    'ring': ('motorway', 'Cypress Belt Parkway', 'SR 836', 6,
             [(780.67, 738.17), (795, 660), (803, 560), (790, 450), (765, 385), (735, 320), (700, 262), (640, 222), (560, 207), (480, 228),
              (410, 262), (360, 320), (322, 400), (305, 470), (302, 560), (300, 640), (320, 720), (350, 770), (450, 795), (560, 805), (650, 800), (721.67, 800)]),
    'central': ('trunk', 'Citrus Belt Highway', 'US-27', 4, [(600, 213), (598, 300), (593, 400), (590, 500), (590, 600), (592, 700), (596, 800)]),
    'cross_a': ('trunk', 'Corkwood Road', 'SR 49', 4, [(302, 585), (450, 598), (590, 600), (700, 600), (803, 590)]),
    'cross_b': ('trunk', 'Lake Amaro Road', 'CR 720', 4, [(305, 520), (450, 507), (560, 500), (640, 515), (720, 515), (790, 450)]),
    'a1a': ('primary', 'Ocean Drive North', 'SR A1A', 2, [(977.33, 738.17), (962, 700), (945, 645), (925, 605), (895, 575), (860, 545), (845, 480), (825, 410), (800, 345), (770, 315), (735, 320)]),
    'calabash': ('secondary', 'Calabash Causeway', 'CR 64', 2, [(322, 400), (300, 412), (250, 425), (212, 440)]),
    'marisol': ('secondary', 'Marisol Road', 'CR 41', 2, [(320, 720), (300, 790), (272, 832)]),
    'west': ('primary', 'Tamiami Trail', 'US-41', 2, [(350, 770), (360, 860), (400, 930), (440, 990), (470, 1050), (520, 1070), (600, 1062)]),
    # the picture's diagonal from the US-27 / SR 49 interchange to the city's north-west corner (West Line Ave / NW 30th St)
    'diag_n': ('primary', 'Sabal Grove Parkway', 'SR 945', 4, [(630, 603), (670, 624), (705, 642), (738, 662), (740, 700), (721.67, 738.17)]),
    'diag': ('trunk', 'Pond Apple Expressway', 'SR 951', 4, [(350, 770), (420, 800), (480, 830), (530, 862), (600, 915), (660, 955), (712, 958)]),
}

FLORA = ['Corkwood', 'Tangelo', 'Saw Palmetto', 'Coontie', 'Gumbo Limbo', 'Wild Coffee', 'Firebush', 'Beautyberry', 'Coral Bean', 'Marlberry',
         'Paradise Tree', 'Pond Apple', 'Pigeon Plum', 'Strangler Fig', 'Wax Myrtle', 'Cocoplum', 'Seagrape', 'Buttonwood', 'Mahogany', 'Live Oak',
         'Slash Pine', 'Bald Cypress', 'Red Maple', 'Sweetbay', 'Myrsine', 'Necklace Pod', 'Sea Oats', 'Muhly Grass', 'Sabal', 'Cabbage Palm',
         'Satinleaf', 'Torchwood', 'Lignum Vitae', 'Joewood', 'Blolly', 'Willow Bustic', 'Lancewood', 'Crabwood', 'Wild Tamarind', 'Black Ironwood',
         'Spicewood', 'Snowberry', 'Christmas Berry', 'Indigo Berry', 'Sea Lavender', 'Coin Vine', 'Swamp Lily', 'Pickerelweed', 'Arrowhead', 'Duck Potato',
         'Sawgrass', 'Spartina', 'Fiddlewood', 'Calamondin', 'Kumquat', 'Honeybell', 'Satsuma', 'Valencia', 'Hamlin', 'Temple Orange',
         'Persimmon', 'Mulberry', 'Pawpaw', 'Hickory', 'Water Oak', 'Laurel Oak', 'Turkey Oak', 'Bluejack', 'Sand Pine', 'Pond Pine',
         'Loblolly Bay', 'Dahoon', 'Yaupon', 'Gallberry', 'Fetterbush', 'Staggerbush', 'Tarflower', 'Rusty Lyonia', 'Scrub Mint', 'Gopher Apple',
         'Coralroot', 'Butterfly Orchid', 'Ghost Orchid', 'Bromeliad', 'Resurrection Fern', 'Leather Fern', 'Royal Fern', 'Cinnamon Fern', 'Swamp Bay', 'Red Bay']
SUFFIX = {'secondary': ['Road', 'Highway', 'Road'], 'tertiary': ['Road', 'Trail', 'Grade', 'Road'], 'residential': ['Lane', 'Way', 'Trail', 'Drive'], 'unclassified': ['Lane', 'Track', 'Trail']}


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); d = b - a; L = math.hypot(*d); P = np.array(pts)
    dist = np.hypot(*(P - a).T) if L < 1e-9 else np.abs(d[0] * (P[:, 1] - a[1]) - d[1] * (P[:, 0] - a[0])) / L
    i = int(dist.argmax())
    if dist[i] > tol:
        return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol)
    return [pts[0], pts[-1]]


def plen(p):
    return sum(math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) for i in range(len(p) - 1))


def chaikin(p, n=2):
    p = [tuple(q) for q in p]
    for _ in range(n):
        if len(p) < 3:
            return p
        q = [p[0]]
        for i in range(len(p) - 1):
            a, b = p[i], p[i + 1]
            q.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            q.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        q.append(p[-1]); p = q
    return p


def resample(p, step):
    out = [p[0]]; acc = 0.0
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]; L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L == 0: continue
        t = step - acc
        while t <= L:
            out.append((a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)); t += step
        acc = (acc + L) % step
    if math.hypot(out[-1][0] - p[-1][0], out[-1][1] - p[-1][1]) > step * 0.3: out.append(p[-1])
    else: out[-1] = p[-1]
    return out


def main():
    V = json.load(open(os.path.join(OUT, 'vector.json')))
    nodes = [tuple(n) for n in V['nodes']]
    E = {r['id']: r for r in V['roads']}
    adj = defaultdict(list)
    for k, e in E.items():
        adj[e['a']].append(k); adj[e['b']].append(k)
    used_nodes = sorted(adj)
    NP = np.array([nodes[n] for n in used_nodes])

    def nearest_node(p, r=9.0):
        d = np.hypot(NP[:, 0] - p[0], NP[:, 1] - p[1]); i = int(d.argmin())
        return (used_nodes[i], float(d[i])) if d[i] <= r else (None, float(d[i]))

    def cost(e):
        return e['len'] / min(max(e['w'], 0.8), 2.4)

    def route(a, b):
        dist = {a: 0.0}; prev = {}; h = [(0.0, a)]
        while h:
            d, n = heapq.heappop(h)
            if n == b: break
            if d > dist.get(n, 1e18): continue
            for k in adj[n]:
                e = E[k]; m = e['b'] if e['a'] == n else e['a']
                nd = d + cost(e)
                if nd < dist.get(m, 1e18):
                    dist[m] = nd; prev[m] = (n, k); heapq.heappush(h, (nd, m))
        if b not in prev and a != b: return None
        path = []; n = b; ks = []
        while n != a:
            pn, k = prev[n]; e = E[k]
            seg = e['pts'] if e['b'] == n else e['pts'][::-1]
            path = [tuple(q) for q in seg[:-1]] + path if path else [tuple(q) for q in seg]
            ks.append(k); n = pn
        return path, ks

    # main roads: least-cost path on the ridge (road-likeness) raster between waypoints, so they follow the picture's
    # own curves and cross small gaps; then every traced edge running along the result is claimed by it.
    from skimage.graph import route_through_array
    RID = np.load(os.path.join(OUT, 'ridge.npy')).astype(np.float32) * 2.0          # sato response at 3x
    UP = 3
    COST = 1.0 + 40.0 * (1.0 - np.clip(RID, 0, 34) / 34.0) ** 2
    main_px = {}; main_edges = set(); log = []; main_nodes = defaultdict(set)
    for key, (kind, name, ref, lanes, wps) in MAIN.items():
        pts = [tuple(wps[0])]
        for i in range(len(wps) - 1):
            p, q = wps[i], wps[i + 1]
            m = 14
            x0, y0 = int(max(0, (min(p[0], q[0]) - m) * UP)), int(max(0, (min(p[1], q[1]) - m) * UP))
            x1, y1 = int(min(COST.shape[1], (max(p[0], q[0]) + m) * UP)), int(min(COST.shape[0], (max(p[1], q[1]) + m) * UP))
            sub = COST[y0:y1, x0:x1]
            a = (int(p[1] * UP) - y0, int(p[0] * UP) - x0); b = (int(q[1] * UP) - y0, int(q[0] * UP) - x0)
            path, c = route_through_array(sub, a, b, fully_connected=True, geometric=True)
            seg = [((x + x0) / UP, (y + y0) / UP) for y, x in path]
            seg = dp(seg, 0.5)
            pts += seg[1:]
        pts[0] = tuple(wps[0]); pts[-1] = tuple(wps[-1])
        sm = resample(chaikin(pts, 3), 2.0)
        main_px[key] = dict(kind=kind, name=name, ref=ref, lanes=lanes, px=[[round(x, 2), round(y, 2)] for x, y in sm])
        log.append(f'{key}: {round(plen(sm) * 0.03, 1)} km')
    # claim traced edges that run along a main road (>= 70 % of their samples within 3 px of it)
    from shapely.geometry import LineString as _LS, Point as _Pt
    mlines = {k: _LS(v['px']) for k, v in main_px.items()}
    for k, e in E.items():
        pts = resample([tuple(q) for q in e['pts']], 1.0)
        for mk, ml in mlines.items():
            near = sum(1 for p in pts if ml.distance(_Pt(p)) < 4.5) / len(pts)
            if near >= 0.6:
                main_edges.add(k); break
    # nodes touching a main road (within 3 px) are junctions with it
    for n in adj:
        for mk, ml in mlines.items():
            if ml.distance(_Pt(nodes[n])) < 3.0: main_nodes[n].add(mk)

    # ------------------------------------------------------------------ filters for the remaining traced edges
    C = TR.classify()
    ocean_d = ndimage.distance_transform_edt(~C['ocean'])
    sand = C['sand']
    H, W = ocean_d.shape
    def samp(p):
        x, y = int(min(max(p[0], 0), W - 1)), int(min(max(p[1], 0), H - 1)); return x, y
    def inbox(p, b): return b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]
    keep = {}; drop = defaultdict(int)
    for k, e in E.items():
        if k in main_edges: continue
        pts = resample([tuple(q) for q in e['pts']], 1.0)
        mid = pts[len(pts) // 2]
        if inbox(mid, (REAL_PX[0] - 4, REAL_PX[1] - 4, REAL_PX[2] + 4, REAL_PX[3] + 4)): drop['real'] += 1; continue
        if any(inbox(mid, b) for b in AIRPORT_PX): drop['airport'] += 1; continue
        if e['dense'] > 0.55: drop['town'] += 1; continue
        od = np.array([ocean_d[samp(p)[1], samp(p)[0]] for p in pts]); sd = np.array([sand[samp(p)[1], samp(p)[0]] for p in pts])
        if (od < 3.0).mean() > 0.5 or sd.mean() > 0.3: drop['coast'] += 1; continue
        if e['len'] < 3.0 and (len(adj[e['a']]) == 1 or len(adj[e['b']]) == 1): drop['spur'] += 1; continue
        keep[k] = e
    # second spur pass: dead-end edges under 2 px after the filters (60 m)
    deg = defaultdict(int)
    for k, e in keep.items(): deg[e['a']] += 1; deg[e['b']] += 1
    for n in main_nodes: deg[n] += 2
    for k in [k for k, e in keep.items() if e['len'] < 2.0 and (deg[e['a']] == 1 or deg[e['b']] == 1)]:
        keep.pop(k); drop['spur2'] += 1

    # ------------------------------------------------------------------ group edges into streets (straight continuation), classify, name
    kadj = defaultdict(list)
    for k, e in keep.items(): kadj[e['a']].append(k); kadj[e['b']].append(k)
    def dir_at(e, n):
        p = e['pts'] if e['a'] == n else e['pts'][::-1]
        q = p[min(len(p) - 1, 3)] if plen(p) > 4 else p[-1]
        v = (q[0] - p[0][0], q[1] - p[0][1]); L = math.hypot(*v) or 1
        return (v[0] / L, v[1] / L)
    group = {}; gi = 0
    for k in sorted(keep, key=lambda k: -keep[k]['len']):
        if k in group: continue
        group[k] = gi; stack = [k]
        while stack:
            c = stack.pop(); e = keep[c]
            for n in (e['a'], e['b']):
                if n in main_nodes: continue
                d0 = dir_at(e, n)
                best = None
                for o in kadj[n]:
                    if o == c or o in group: continue
                    d1 = dir_at(keep[o], n); dot = -(d0[0] * d1[0] + d0[1] * d1[1])
                    if dot > 0.82 and (best is None or dot > best[0]): best = (dot, o)
                if best: group[best[1]] = gi; stack.append(best[1])
        gi += 1
    glen = defaultdict(float); gw = defaultdict(float)
    for k, g in group.items(): glen[g] += keep[k]['len']; gw[g] += keep[k]['w'] * keep[k]['len']
    gkind = {}
    for g in glen:
        L = glen[g] * 30.0; w = gw[g] / max(glen[g], 1e-6)
        gkind[g] = 'secondary' if (L > 4500 and w > 1.25) else 'tertiary' if L > 1600 else 'residential' if L > 350 else 'unclassified'
    # the user wants the fictional land less dense: keep only continuous roads of 700 m or more (short traced bits were
    # mostly farm tracks, driveways and noise)
    for k in [k for k in keep if glen[group[k]] * 30.0 < 700]:
        keep.pop(k); drop['short'] += 1
    glen = {g: L for g, L in glen.items() if L * 30.0 >= 700}
    rngi = 0; gname = {}
    for g in sorted(glen, key=lambda g: -glen[g]):
        base = FLORA[rngi % len(FLORA)]; suf = SUFFIX[gkind[g]][(rngi // len(FLORA) + rngi) % len(SUFFIX[gkind[g]])]
        gname[g] = f'{base} {suf}' if rngi < len(FLORA) else f'{base} {suf} {["North", "South", "East", "West"][(rngi // len(FLORA)) % 4]}'
        rngi += 1

    # ------------------------------------------------------------------ dead ends: extend onto the nearest other road within 4 px (120 m)
    from shapely.geometry import LineString as _LS2, Point as _P2
    from shapely import STRtree as _STR
    smooth = {}
    for k, e in keep.items():
        p = [tuple(q) for q in e['pts']]
        sm = chaikin(p, 2) if len(p) > 2 else p
        sm[0], sm[-1] = p[0], p[-1]; smooth[k] = sm
    ks = list(smooth); lines = [_LS2(smooth[k]) for k in ks] + [mlines[m] for m in mlines]
    tree = _STR(lines); deg = defaultdict(int)
    for k, e in keep.items(): deg[e['a']] += 1; deg[e['b']] += 1
    nsnap = 0
    for i, k in enumerate(ks):
        e = keep[k]
        for end, n in ((0, e['a']), (-1, e['b'])):
            if deg[n] != 1 or n in main_nodes: continue
            p = _P2(smooth[k][end]); best = None
            for j in tree.query(p.buffer(4.0)):
                j = int(j)
                if j == i: continue
                d = lines[j].distance(p)
                if d < 4.0 and d > 0.05 and (best is None or d < best[0]): best = (d, j)
            if best:
                q = lines[best[1]].interpolate(lines[best[1]].project(p))
                if end == 0: smooth[k].insert(0, (q.x, q.y))
                else: smooth[k].append((q.x, q.y))
                nsnap += 1
    log.append(f'dead ends extended onto a neighbour: {nsnap}')
    # ------------------------------------------------------------------ output
    out_px = []; out_w = []
    for k, e in keep.items():
        g = group[k]; kind = gkind[g]
        sm = smooth[k]
        onmain = [e['a'] in main_nodes, e['b'] in main_nodes]
        out_px.append(dict(kind=kind, name=gname[g], pts=[[round(x, 2), round(y, 2)] for x, y in sm]))
        out_w.append(dict(kind=kind, name=gname[g], lanes=2 if kind != 'unclassified' else 1, onMain=onmain,
                          mainKeys=[sorted(main_nodes.get(e['a'], [])), sorted(main_nodes.get(e['b'], []))],
                          surface='asphalt' if kind != 'unclassified' else 'gravel', pts=[[round(TR.X0 + TR.S * x, 2), round(TR.Z0 + TR.S * y, 2)] for x, y in sm]))
    for key, m in main_px.items():
        out_px.append(dict(kind=m['kind'], name=m['name'], pts=m['px']))
    json.dump(dict(roads=out_px), open(os.path.join(OUT, 'roads_px.json'), 'w'))
    stats = defaultdict(float)
    for r in out_w: stats[r['kind']] += plen(r['pts']) / 1000
    json.dump(dict(source='tools/v2/maproads (traced from references/ref_40_map_user_official.webp)', transform=dict(x0=TR.X0, z0=TR.Z0, s=TR.S),
                   main=main_px, roads=out_w, stats={k: round(v, 1) for k, v in stats.items()}, log=log, dropped=dict(drop)),
              open(os.path.join(OUT, 'maproads.json'), 'w'))
    print('\n'.join(log)); print('kept', len(out_w), 'km', {k: round(v, 1) for k, v in stats.items()}, 'dropped', dict(drop))


if __name__ == '__main__':
    main()
