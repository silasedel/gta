#!/usr/bin/env python3
"""Edge summary of the real-Miami rectangle for the world-layout track.

For each side of REAL_RECT: every drivable road (and rail line) that crosses it, and the land/water
intervals along it, so the synthetic landmass, coast and roads line up with the real OSM ones.
Writes tools/osm/cache/edge_summary.json.  Run: tools/osm/.venv/bin/python tools/osm/edge_summary.py
"""
import json, math, os, sys
from collections import defaultdict
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from config import REAL_RECT, FETCH_PAD_M, unproj  # noqa: E402
from osmgeom import load, pts, elem_poly, polys_only, CACHE  # noqa: E402
import land as LAND  # noqa: E402
import roads as R  # noqa: E402

X0, Z0, X1, Z1 = REAL_RECT
SIDES = {
    # name: (start point, end point, outward normal, coordinate that varies)
    'north': ((X0, Z0), (X1, Z0), (0, -1), 'x'),
    'south': ((X0, Z1), (X1, Z1), (0, 1), 'x'),
    'west': ((X0, Z0), (X0, Z1), (-1, 0), 'z'),
    'east': ((X1, Z0), (X1, Z1), (1, 0), 'z'),
}
RAIL = {'rail', 'light_rail', 'subway', 'monorail', 'tram'}


def crossings(line, side):
    """Points where a way's polyline crosses a rectangle side: [(x, z, dirx, dirz going outward)]."""
    (ax, az), (bx, bz), (nx, nz), _ = SIDES[side]
    c = list(line.coords)
    out = []
    for i in range(len(c) - 1):
        (x0, z0), (x1, z1) = c[i], c[i + 1]
        d0 = (x0 - ax) * nx + (z0 - az) * nz
        d1 = (x1 - ax) * nx + (z1 - az) * nz
        if (d0 < 0) == (d1 < 0) or d0 == d1:
            continue
        t = d0 / (d0 - d1)
        x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        lo, hi = (min(ax, bx), max(ax, bx)) if SIDES[side][3] == 'x' else (min(az, bz), max(az, bz))
        v = x if SIDES[side][3] == 'x' else z
        if not (lo <= v <= hi):
            continue
        # local direction averaged over ~40 m around the crossing, oriented outward
        j0, j1 = i, i + 1
        acc = 0.0
        while j0 > 0 and acc < 20:
            acc += math.hypot(c[j0][0] - c[j0 - 1][0], c[j0][1] - c[j0 - 1][1]); j0 -= 1
        acc = 0.0
        while j1 < len(c) - 1 and acc < 20:
            acc += math.hypot(c[j1 + 1][0] - c[j1][0], c[j1 + 1][1] - c[j1][1]); j1 += 1
        dx, dz = c[j1][0] - c[j0][0], c[j1][1] - c[j0][1]
        L = math.hypot(dx, dz) or 1.0
        dx, dz = dx / L, dz / L
        along = 1 if d1 > d0 else -1          # +1: the way's own direction leaves the rectangle here
        out.append((x, z, dx * along, dz * along, along))
    return out


def main():
    B = box(X0 - FETCH_PAD_M + 50, Z0 - FETCH_PAD_M + 50, X1 + FETCH_PAD_M - 50, Z1 + FETCH_PAD_M - 50)
    land = LAND.land_from_coast(B)
    have_areas = os.path.exists(os.path.join(CACHE, 'areas.json'))
    water = LAND.inland_water() if have_areas else []
    waterU = unary_union([w[0] for w in water]) if water else None
    named_water = [(w[0], w[1]) for w in water if w[1]]
    ww = []
    if have_areas:
        for e in load('areas'):
            t = e.get('tags', {})
            if t.get('waterway') in ('river', 'canal', 'stream', 'drain') and e['type'] == 'way':
                c = pts(e.get('geometry') or [])
                if len(c) >= 2:
                    ww.append((LineString(c), t.get('name'), t['waterway'], t.get('width')))
    landNet = land.difference(waterU) if waterU is not None else land

    out = {
        'version': 1,
        'note': 'World meters, CONTRACT4 frame (x east, z south). bearingDeg is a compass bearing (0 = north, 90 = east) '
                'of the road as it LEAVES the real rectangle; heading is the same direction in game radians '
                '(0 faces +Z/south, atan2(dx, dz)). flow: "out" = one-way leaving the rectangle, "in" = one-way '
                'entering, "both" = two-way. Intervals run along the side in increasing x (north/south) or z (west/east).',
        'realRect': {'minX': X0, 'maxX': X1, 'minZ': Z0, 'maxZ': Z1},
        'realRectLatLon': {'north': unproj(0, Z0)[1], 'south': unproj(0, Z1)[1], 'west': unproj(X0, 0)[0], 'east': unproj(X1, 0)[0]},
        'source': '(c) OpenStreetMap contributors (ODbL), Overpass pull in tools/osm/cache/v2',
        'inlandWaterIncluded': have_areas,
        'coastNote': 'sides.<side>.coast lists every point where the real shoreline meets the side, with the real shoreline polyline for the next ~340 m OUTSIDE the rectangle ("outside"), so a synthetic coast can continue it tangentially. The merge unions synthetic land with real OSM land, and real land wins inside the rectangle.',
        'sides': {},
    }
    # names for land intervals: the padded land components containing known reference points
    from config import proj
    refs = {'mainland': (25.7745, -80.2000), 'Miami Beach': (25.7850, -80.1320), 'Virginia Key': (25.7465, -80.1500),
            'Fisher Island': (25.7609, -80.1406), 'Watson Island': (25.7849, -80.1757), 'PortMiami': (25.7741, -80.1661)}
    landNames = []
    comps = polys_only(land)
    for nm_, (la, lo) in refs.items():
        x_, z_ = proj(lo, la)
        for c_ in comps:
            if c_.contains(Point(x_, z_)):
                landNames.append((nm_, c_))
    for e in load('districts') if os.path.exists(os.path.join(CACHE, 'districts.json')) else []:
        t = e.get('tags', {})
        if t.get('place') in ('island', 'islet') and t.get('name'):
            g = elem_poly(e)
            if g is not None:
                landNames.insert(0, (t['name'], g))
    mb = next((g for n_, g in landNames if n_ == 'Miami Beach'), None)

    def OCEAN_X(z):
        """x beyond which open water is the Atlantic at this z: east of the easternmost barrier land on this row."""
        ln = LineString([(1500, z), (X1 + 2000, z)]).intersection(land)
        if not ln.is_empty:
            return ln.bounds[2] - 1.0
        return proj(-80.1300, 0)[0]
    hw = load('highways')
    for side, ((ax, az), (bx, bz), (nx, nz), var) in SIDES.items():
        roads, rails = [], []
        for e in hw:
            t = e.get('tags', {})
            kind = t.get('highway')
            rail = t.get('railway')
            isroad = kind in R.DRIVE and t.get('area') != 'yes' and not (kind == 'service' and t.get('service') in R.SKIP_SERVICE)
            israil = rail in RAIL
            if not (isroad or israil):
                continue
            c = pts(e.get('geometry') or [])
            if len(c) < 2:
                continue
            for x, z, dx, dz, along in crossings(LineString(c), side):
                if israil and not isroad:
                    rails.append({'x': round(x, 1), 'z': round(z, 1), 'kind': rail, 'name': t.get('name'),
                                  'bridge': t.get('bridge') not in (None, 'no'), 'layer': t.get('layer'),
                                  'bearingDeg': round(math.degrees(math.atan2(dx, -dz)) % 360, 1),
                                  'heading': round(math.atan2(dx, dz), 4), 'osmWay': e['id']})
                    continue
                a = R.way_attrs(t)
                if a['oneway']:
                    fwd = along * (-1 if a['rev'] else 1)
                    flow = 'out' if fwd > 0 else 'in'
                    lanesOut, lanesIn = (a['lf'], 0) if flow == 'out' else (0, a['lf'])
                else:
                    flow = 'both'
                    lanesOut, lanesIn = (a['lf'], a['lb']) if along > 0 else (a['lb'], a['lf'])
                roads.append({
                    'x': round(x, 1), 'z': round(z, 1), 'name': t.get('name'), 'ref': t.get('ref'), 'kind': kind,
                    'lanes': a['lf'] + a['lb'], 'lanesOut': lanesOut, 'lanesIn': lanesIn, 'flow': flow,
                    'oneway': bool(a['oneway']), 'width': a['w'], 'speedKmh': a['sp'],
                    'bridge': bool(a['br']), 'layer': a['layer'], 'tunnel': t.get('tunnel') in ('yes',),
                    'surface': t.get('surface'),
                    'bearingDeg': round(math.degrees(math.atan2(dx, -dz)) % 360, 1),
                    'heading': round(math.atan2(dx, dz), 4), 'dir': [round(dx, 4), round(dz, 4)],
                    'onLand': bool(landNet.contains(Point(x - nx * 2, z - nz * 2))),
                    'osmWay': e['id'],
                })
        key = (lambda r: r['x']) if var == 'x' else (lambda r: r['z'])
        roads.sort(key=key)
        rails.sort(key=key)
        # corridors: carriageways of one road merged. Motorways (with their ramps) cluster by gap < 150 m;
        # other roads merge when they share a name/ref (or one side is an unnamed link) within 80 m.
        corridors = []
        for r in roads:
            kb = r['kind'].replace('_link', '')
            lab = r['ref'] if kb in ('motorway', 'trunk') and r['ref'] else (r['name'] or r['ref'])
            c = corridors[-1] if corridors else None
            gap = key(r) - c['_last'] if c else 1e9
            same = False
            if c and kb == c['kind']:
                if kb == 'motorway':
                    same = gap < 150
                elif lab and c['label'] == lab:
                    same = gap < 80
                elif (lab is None or c['label'] is None) and kb in ('trunk', 'primary', 'secondary') and gap < 60:
                    same = True
            if same:
                c['_m'].append(r)
                c['_last'] = key(r)
                c['label'] = c['label'] or lab
            else:
                corridors.append({'label': lab, 'kind': kb, '_m': [r], '_last': key(r)})
        cor = []
        for c in corridors:
            m = c['_m']
            if c['kind'] in ('service',) and not c['label']:
                continue
            n = len(m)
            cx = sum(r['x'] for r in m) / n
            cz = sum(r['z'] for r in m) / n
            dx = sum(r['dir'][0] for r in m)
            dz = sum(r['dir'][1] for r in m)
            main = [r for r in m if not r['kind'].endswith('_link')] or m

            def common(k):
                vals = [r[k] for r in main if r[k]] or [r[k] for r in m if r[k]]
                vals = [v for v in vals if 'EXPR' not in v] or vals
                return max(set(vals), key=vals.count) if vals else None
            cor.append({
                'name': common('name'), 'ref': common('ref'),
                'kind': c['kind'], 'x': round(cx, 1), 'z': round(cz, 1),
                'lanesOut': sum(r['lanesOut'] for r in m), 'lanesIn': sum(r['lanesIn'] for r in m),
                'carriageways': n, 'divided': n > 1, 'ramps': sum(1 for r in m if r['kind'].endswith('_link')),
                'span': round(max(key(r) for r in m) - min(key(r) for r in m), 1),
                'speedKmh': max(r['speedKmh'] for r in m), 'bridge': any(r['bridge'] for r in m),
                'layer': max(r['layer'] for r in m),
                'bearingDeg': round(math.degrees(math.atan2(dx, -dz)) % 360, 1), 'heading': round(math.atan2(dx, dz), 4),
                'onLand': any(r['onLand'] for r in m),
            })
        # land / water intervals along the side
        edge = LineString([(ax, az), (bx, bz)])
        iv = []

        def add(geom, typ):
            for g in (geom.geoms if hasattr(geom, 'geoms') else [geom]):
                if g.geom_type == 'LineString' and g.length > 0.5:
                    cs = list(g.coords)
                    v0, v1 = (cs[0][0], cs[-1][0]) if var == 'x' else (cs[0][1], cs[-1][1])
                    iv.append([min(v0, v1), max(v0, v1), typ])
        add(edge.intersection(landNet), 'land')
        add(edge.difference(landNet), 'water')
        iv.sort()
        merged = []
        for a_, b_, typ in iv:
            if merged and merged[-1][2] == typ and abs(merged[-1][1] - a_) < 0.6:
                merged[-1][1] = b_
            else:
                merged.append([a_, b_, typ])
        # absorb slivers under 3 m into the neighbor
        m2 = []
        for a_, b_, typ in merged:
            if b_ - a_ < 3 and m2:
                m2[-1][1] = b_
            elif m2 and m2[-1][2] == typ:
                m2[-1][1] = b_
            else:
                m2.append([a_, b_, typ])
        intervals = []
        for a_, b_, typ in m2:
            rec = {'from': round(a_, 1), 'to': round(b_, 1), 'type': typ, 'length': round(b_ - a_, 1)}
            mid = (a_ + b_) / 2
            px, pz = (mid, az) if var == 'x' else (ax, mid)
            P = Point(px, pz)
            if typ == 'water':
                nm, wk = None, 'sea'
                for g, n in named_water:
                    if g.distance(P) < 2:
                        nm = n
                        break
                best = None
                for ln, n, k, w in ww:
                    dd = ln.distance(P)
                    if dd < 70 and n and (best is None or dd < best[0]):
                        best = (dd, n, k)
                if land.contains(P):
                    wk = best[2] if best else 'inland'      # a river, canal, pond or lake cut out of the land
                    nm = nm or (best[1] if best else None)
                elif best and (b_ - a_) < 400:
                    nm = nm or best[1]
                if wk == 'sea' and (b_ - a_) < 200 and not (a_ <= min(ax, bx, az, bz) + 1 or b_ >= max(ax, bx) - 1):
                    wk = 'channel'                          # a narrow tidal channel between two pieces of land
                if not nm and wk == 'sea':
                    nm = 'Atlantic Ocean' if px > OCEAN_X(pz) else 'Biscayne Bay'
                rec['water'] = wk
                if nm:
                    rec['name'] = nm
            else:
                for nm_, g in landNames:
                    if g.buffer(3).contains(P):
                        rec['name'] = nm_
                        break
                else:
                    near = min(landNames, key=lambda t_: t_[1].distance(P)) if landNames else None
                    if near and near[1].distance(P) < 1500:
                        rec['name'] = near[0]
                if side == 'south' and rec.get('name') != 'mainland':
                    rec['name'] = 'Virginia Key'            # the south side cuts across the north end of Virginia Key
            intervals.append(rec)
        # shoreline continuation: where the real coast meets this side, its polyline for the next ~340 m outside
        strip = box(min(ax, bx) - (FETCH_PAD_M - 60 if nx else 0) * (1 if nx < 0 else 0), min(az, bz) - (FETCH_PAD_M - 60 if nz else 0) * (1 if nz < 0 else 0),
                    max(ax, bx) + (FETCH_PAD_M - 60 if nx else 0) * (1 if nx > 0 else 0), max(az, bz) + (FETCH_PAD_M - 60 if nz else 0) * (1 if nz > 0 else 0))
        coast = []
        bl = landNet.boundary.intersection(strip)
        from shapely.ops import linemerge
        bl = linemerge(bl) if bl.geom_type == 'MultiLineString' else bl
        for g in (bl.geoms if hasattr(bl, 'geoms') else [bl]):
            if g.geom_type != 'LineString' or g.length < 3:
                continue
            cs = list(g.coords)
            for cc in (cs, cs[::-1]):
                d0 = abs((cc[0][0] - ax) * nx + (cc[0][1] - az) * nz)
                dend = (cc[-1][0] - ax) * nx + (cc[-1][1] - az) * nz
                if d0 < 0.3 and dend > 0.3:
                    ln = LineString(cc)
                    # skip the artificial box boundary of the padded land (runs along the strip's outer edge)
                    q_ = ln.interpolate(min(40.0, ln.length))
                    ddx, ddz = q_.x - cc[0][0], q_.y - cc[0][1]
                    L_ = math.hypot(ddx, ddz) or 1.0
                    v = cc[0][0] if var == 'x' else cc[0][1]
                    if not (min(ax, bx, az, bz) - 1e9 < v):
                        continue
                    simp = ln.simplify(2.0)
                    coast.append({'at': round(v, 1), 'x': round(cc[0][0], 1), 'z': round(cc[0][1], 1),
                                  'bearingDeg': round(math.degrees(math.atan2(ddx, -ddz)) % 360, 1),
                                  'outsideLength': round(ln.length, 1),
                                  'outside': [[round(x_, 1), round(z_, 1)] for x_, z_ in simp.coords]})
                    break
        coast.sort(key=lambda c_: c_['at'])
        out['sides'][side] = {
            'line': {'from': [ax, az], 'to': [bx, bz], 'varies': var, 'outwardNormal': [nx, nz]},
            'intervals': intervals,
            'coast': coast,
            'corridors': cor,
            'roads': roads,
            'rails': rails,
        }
        print(f'{side}: {len(roads)} road crossings in {len(cor)} corridors, {len(rails)} rail, {len(intervals)} land/water intervals')
    # coastline points where the shore itself meets each side (handy anchors for the synthetic coast)
    path = os.path.join(HERE, 'cache', 'edge_summary.json')
    with open(path + '.tmp', 'w') as f:
        json.dump(out, f, indent=1)
    os.replace(path + '.tmp', path)
    print('wrote', path, os.path.getsize(path))


if __name__ == '__main__':
    main()
