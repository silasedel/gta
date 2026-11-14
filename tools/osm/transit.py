"""Transit: bus and trolley stops and routes on the road graph, plus the people mover, metro and rail lines
with their stations. Public infrastructure only: route numbers, line names and street-derived stop names.
Operator and company names are dropped or replaced by neutral ones.
"""
import heapq, math, re
from collections import defaultdict
from shapely.geometry import LineString, Point
from shapely.ops import linemerge
from shapely import STRtree
from config import proj
from osmgeom import load, world_box

STATION_RENAME = {
    'Brightline MiamiCentral Station': 'Central Station', 'Miami Central': 'Central Station', 'MiamiCentral': 'Central Station',
    'UHealth | Jackson': 'Civic Center', 'Brickell City Centre': 'Eighth Street', 'Adrienne Arsht Center': 'Omni',
}
LINE_KIND = {'monorail': 'people_mover', 'subway': 'metro', 'train': 'rail', 'light_rail': 'light_rail', 'tram': 'tram'}


def short(n):
    """'Northwest 7th Avenue' -> 'NW 7th Ave' (sign-style abbreviation for stop names)."""
    if not n:
        return n
    for a, b in (('Northwest ', 'NW '), ('Northeast ', 'NE '), ('Southwest ', 'SW '), ('Southeast ', 'SE '), ('North ', 'N '),
                 ('South ', 'S '), ('West ', 'W '), ('East ', 'E '), (' Street', ' St'), (' Avenue', ' Ave'), (' Boulevard', ' Blvd'),
                 (' Drive', ' Dr'), (' Road', ' Rd'), (' Court', ' Ct'), (' Terrace', ' Ter'), (' Place', ' Pl'), (' Highway', ' Hwy'),
                 (' Causeway', ' Cswy'), (' Lane', ' Ln')):
        n = n.replace(a, b)
    return n


ON_LAND = None     # set by build.py: False for a real point on the official picture's water


def build(nodes, edges, rails, ginfo, log=print):
    RB = world_box()
    lines = [LineString(e['pts']) for e in edges]
    drive = [i for i, e in enumerate(edges) if e['kind'] not in ('motorway', 'motorway_link')]
    tree = STRtree([lines[i] for i in drive])
    inc = defaultdict(list)
    for e in edges:
        inc[e['a']].append(e['id'])
        inc[e['b']].append(e['id'])
    by_way = defaultdict(list)
    for e in edges:
        for w in e.get('ways', ()):
            by_way[w].append(e['id'])
    # directed adjacency: node -> [(next node, edge id, dir, length)]
    adj = defaultdict(list)
    for e in edges:
        L = lines[e['id']].length
        adj[e['a']].append((e['b'], e['id'], 1, L))
        if not e['oneway']:
            adj[e['b']].append((e['a'], e['id'], -1, L))

    def cross_name(eid, s_):
        """'<street> & <nearest cross street>' for a point at distance s_ along edge eid."""
        e = edges[eid]
        L = lines[eid].length
        n = e['a'] if s_ < L / 2 else e['b']
        own = e['name']
        other = None
        for k in inc[n]:
            nm = edges[k]['name']
            if nm and nm != own:
                other = nm
                break
        if own and other:
            return f'{short(own)} & {short(other)}'
        return short(own or other) or None

    # ---- stop nodes
    pos = {}
    tags = {}
    for p in load('pois'):
        t = p.get('tags') or {}
        if 'lat' in p and (t.get('highway') == 'bus_stop' or t.get('public_transport') in ('platform', 'stop_position', 'station')
                           or t.get('railway') in ('station', 'stop', 'halt', 'tram_stop')):
            pos[p['id']] = proj(p['lon'], p['lat'])
            tags[p['id']] = t
    stops, stop_ix = [], {}

    def stop_for(nid):
        if nid in stop_ix:
            return stop_ix[nid]
        if nid not in pos:
            return None
        x, z = pos[nid]
        P = Point(x, z)
        if not RB.contains(P) or (ON_LAND and not ON_LAND(x, z)):
            return None
        k = tree.query_nearest(P, max_distance=45)
        if not len(k):
            return None
        eid = drive[int(k[0])]
        s_ = lines[eid].project(P)
        q = lines[eid].interpolate(s_)
        q2 = lines[eid].interpolate(min(lines[eid].length, s_ + 1.0))
        q0 = lines[eid].interpolate(max(0.0, s_ - 1.0))
        dx, dz = q2.x - q0.x, q2.y - q0.y
        side = 1 if (dx * (z - q.y) - dz * (x - q.x)) > 0 else -1      # +1 = right of the edge direction
        t = tags.get(nid, {})
        rec = dict(x=round(x, 1), z=round(z, 1), e=eid, s=round(s_, 1), side=side, name=cross_name(eid, s_) or f'Stop {len(stops) + 1}', kind='bus',
                   shelter=t.get('shelter') == 'yes', bench=t.get('bench') == 'yes', routes=[])
        stop_ix[nid] = len(stops)
        stops.append(rec)
        return stop_ix[nid]

    def path(n0, n1, pref, cap=9000.0):
        if n0 == n1:
            return []
        dist = {n0: 0.0}
        prev = {}
        hq = [(0.0, n0)]
        while hq:
            d, u = heapq.heappop(hq)
            if u == n1:
                break
            if d > dist.get(u, 1e18) + 1e-9 or d > cap:
                continue
            for v, eid, dr, L in adj[u]:
                c = L * (1.0 if eid in pref else 6.0)
                nd = d + c
                if nd < dist.get(v, 1e18):
                    dist[v] = nd
                    prev[v] = (u, eid, dr)
                    heapq.heappush(hq, (nd, v))
        if n1 not in prev:
            return None
        out = []
        u = n1
        while u != n0:
            pu, eid, dr = prev[u]
            out.append([eid, dr])
            u = pu
        return out[::-1]

    routes = []
    n_gap = 0
    for r in load('relations'):
        t = r.get('tags', {})
        if t.get('type') != 'route' or t.get('route') not in ('bus', 'trolleybus'):
            continue
        sids = []
        for m in r['members']:
            if m['type'] == 'node' and m.get('role', '').startswith(('stop', 'platform')) or m['type'] == 'node' and m.get('role') == '':
                si = stop_for(m['ref'])
                if si is not None and (not sids or sids[-1] != si):
                    sids.append(si)
        if len(sids) < 2:
            continue
        pref = set()
        for m in r['members']:
            if m['type'] == 'way':
                pref.update(by_way.get(m['ref'], ()))
        seq = []
        gaps = 0
        kept = [sids[0]]
        e0 = edges[stops[sids[0]]['e']]
        cur = e0['b'] if (e0['oneway'] or stops[sids[0]]['side'] > 0) else e0['a']
        seq.append([e0['id'], 1 if cur == e0['b'] else -1])
        for b in sids[1:]:
            eb = edges[stops[b]['e']]
            want = eb['b'] if (eb['oneway'] or stops[b]['side'] > 0) else eb['a']
            cands = [want] if eb['oneway'] else [want, eb['a'] if want == eb['b'] else eb['b']]
            done = False
            for cap in (9000.0, 60000.0):
                for nb in cands:
                    nb_in = eb['a'] if nb == eb['b'] else eb['b']
                    p_ = path(cur, nb_in, pref, cap) if cur != nb_in else []
                    if p_ is None:
                        continue
                    for s_ in p_ + [[eb['id'], 1 if nb == eb['b'] else -1]]:
                        if seq[-1] != s_:
                            seq.append(s_)
                    cur = nb
                    kept.append(b)
                    done = True
                    break
                if done:
                    break
            if not done:
                gaps += 1               # this stop cannot be reached by road from the previous one: the route skips it
        sids = kept
        if len(sids) < 2:
            continue
        n_gap += gaps
        nm = (t.get('name') or '') + ' ' + (t.get('network') or '')
        kind = 'trolley' if 'trolley' in nm.lower() else 'bus'
        ref = (t.get('ref') or '').strip()[:8] or None
        idx = len(routes)
        for si in set(sids):
            stops[si]['routes'].append(idx)
            if kind == 'trolley':
                stops[si]['kind'] = 'trolley' if stops[si]['kind'] != 'bus' or len(stops[si]['routes']) == 1 else stops[si]['kind']
        routes.append(dict(ref=ref, kind=kind, name=(f'Route {ref}' if ref else f'Route {idx + 1}') if kind == 'bus' else (f'Trolley {ref}' if ref else 'Trolley'),
                           stops=sids, edges=seq, loop=sids[0] == sids[-1] or t.get('roundtrip') == 'yes', gaps=gaps,
                           fromStop=stops[sids[0]]['name'], toStop=stops[sids[-1]]['name'],
                           length=round(sum(lines[e_]. length for e_, _ in seq))))
    # stops that no route relation uses still exist on the street
    for nid, t in tags.items():
        if t.get('highway') == 'bus_stop':
            stop_for(nid)
    log(f'transit: {len(stops)} bus/trolley stops, {len(routes)} routes ({sum(1 for r in routes if r["kind"] == "trolley")} trolley), '
        f'{n_gap} stops skipped as unreachable by road')

    # ---- rail lines
    seg_by_way = defaultdict(list)
    yv = {}
    for s_ in rails:
        seg_by_way[s_['way']].append(s_)
        for v, y in zip(s_['pts'], s_['y']):
            yv[(round(v[0], 2), round(v[1], 2))] = y
    rail_lines = []
    for r in load('relations'):
        t = r.get('tags', {})
        if t.get('type') != 'route' or t.get('route') not in LINE_KIND:
            continue
        kind = LINE_KIND[t['route']]
        segs = [s_ for m in r['members'] if m['type'] == 'way' for s_ in seg_by_way.get(m['ref'], ())]
        if not segs:
            continue
        mg = linemerge([s_['line'] for s_ in segs])
        parts = list(mg.geoms) if hasattr(mg, 'geoms') else [mg]
        parts = sorted(parts, key=lambda g: -g.length)
        nm = t.get('name') or ''
        if kind == 'people_mover':
            name = nm.replace('MDT ', '').strip() or 'Loop'
        elif kind == 'metro':
            name = nm.split(':')[0].strip() or 'Metro'
        else:
            name = 'Intercity Rail' if 'bright' in nm.lower() else 'Commuter Rail' if 'tri' in nm.lower() else 'Rail'
        for gi, g in enumerate(parts[:6]):
            if g.length < 60:
                continue
            c = list(g.coords)
            rail_lines.append(dict(kind=kind, name=name, ref=t.get('ref'), colour=t.get('colour'), part=gi,
                                   pts=[(round(x, 2), round(z, 2)) for x, z in c],
                                   y=[yv.get((round(x, 2), round(z, 2)), 0.0) for x, z in c],
                                   loop=c[0] == c[-1], length=round(g.length), stations=[]))
    # merge duplicate directions of the same line (same kind + name + nearly identical geometry)
    uniq = []
    for l in rail_lines:
        g = LineString(l['pts'])
        dup = False
        for u in uniq:
            if u['kind'] == l['kind'] and u['name'] == l['name'] and abs(u['length'] - l['length']) < 0.03 * l['length'] + 30 \
                    and LineString(u['pts']).hausdorff_distance(g) < 25:
                dup = True
                break
        if not dup:
            uniq.append(l)
    rail_lines = uniq
    # ---- stations
    stations = []
    seen = {}
    rtree = STRtree([s_['line'] for s_ in rails]) if rails else None
    for nid, t in tags.items():
        if t.get('railway') != 'station' and t.get('public_transport') != 'station':
            continue
        x, z = pos[nid]
        if not RB.contains(Point(x, z)) or (ON_LAND and not ON_LAND(x, z)):
            continue
        name = STATION_RENAME.get(t.get('name'), t.get('name')) or 'Station'
        kind = 'people_mover' if t.get('station') == 'monorail' or t.get('monorail') == 'yes' else \
            'metro' if t.get('station') == 'subway' or t.get('subway') == 'yes' else 'rail'
        key_ = (name, kind)
        if key_ in seen and math.hypot(seen[key_][0] - x, seen[key_][1] - z) < 150:
            continue
        seen[key_] = (x, z)
        y = 0.0
        if rtree is not None:
            k = rtree.query_nearest(Point(x, z), max_distance=60)
            if len(k):
                s_ = rails[int(k[0])]
                j = min(range(len(s_['pts'])), key=lambda i: (s_['pts'][i][0] - x) ** 2 + (s_['pts'][i][1] - z) ** 2)
                y = s_['y'][j]
        stations.append(dict(name=name, kind=kind, x=round(x, 1), z=round(z, 1), y=round(y, 2)))
    for li, l in enumerate(rail_lines):
        g = LineString(l['pts'])
        on = []
        for si, st in enumerate(stations):
            if st['kind'] == l['kind'] or (l['kind'] == 'rail' and st['kind'] == 'rail'):
                P = Point(st['x'], st['z'])
                if g.distance(P) < 45:
                    on.append((g.project(P), si))
        l['stations'] = [si for _, si in sorted(on)]
    log(f'transit: {len(rail_lines)} rail lines ' + str({k: sum(1 for l in rail_lines if l['kind'] == k) for k in set(l['kind'] for l in rail_lines)})
        + f', {len(stations)} stations')
    return dict(stops=stops, routes=routes, lines=rail_lines, stations=stations)
