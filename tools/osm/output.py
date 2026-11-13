"""Write tiles + global files + previews from the build state (cache/work/v.pkl).
Run standalone to re-emit without rebuilding: tools/osm/.venv/bin/python tools/osm/output.py
"""
import datetime, glob, json, math, os, pickle, shutil, sys
from collections import defaultdict
import numpy as np
from shapely.geometry import LineString, Point, box
from shapely.geometry.polygon import orient
from shapely import STRtree
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from config import BBOX, LAT0, LON0, SEA_LEVEL, TILE, bounds  # noqa: E402
from osmgeom import polys_only, CACHE  # noqa: E402
from raster import rle, X0, Z0, X1, Z1  # noqa: E402
from build import SURF, ZONES, PROPS, CURB, PIER_Y, Q, OUT, TILES, DOCS, WORK, q, flat, ring_flat, poly_rec, log  # noqa: E402

# Tile grid is aligned to world multiples of TILE (tile (tx,tz) covers [tx*T,(tx+1)*T) x [tz*T,(tz+1)*T)),
# matching the CITY streamer's floor(x / tileSize) indexing. Keys are "tx_tz" (may be negative).
TX0, TX1 = int(math.floor(X0 / TILE)), int(math.floor((X1 - 1e-6) / TILE))
TZ0, TZ1 = int(math.floor(Z0 / TILE)), int(math.floor((Z1 - 1e-6) / TILE))
NT_X, NT_Z = TX1 - TX0 + 1, TZ1 - TZ0 + 1


def tkey(i, j):
    return f'{i}_{j}'


def tile_of(x, z):
    return min(max(int(math.floor(x / TILE)), TX0), TX1), min(max(int(math.floor(z / TILE)), TZ0), TZ1)


def tbox(i, j):
    return box(i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE)


def clip_polys(tree, geoms, tb):
    out = []
    for k in tree.query(tb):
        g = geoms[k]
        if tb.contains(g):
            out.append(g)
            continue
        c = g.intersection(tb)
        out += [p for p in polys_only(c) if p.area > 0.5]
    return out


def clip_lines(tree, lines, tb):
    out = []
    for k in tree.query(tb):
        g = lines[k]
        c = g if tb.contains(g) else g.intersection(tb)
        for p in (c.geoms if hasattr(c, 'geoms') else [c]):
            if p.geom_type == 'LineString' and p.length > 0.3:
                out.append((k, p))
    return out


def dump(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, path)
    return os.path.getsize(path)


def run(d):
    os.makedirs(TILES, exist_ok=True)
    for f in glob.glob(os.path.join(TILES, '*.json')):
        os.remove(f)
    land, areas, nodes, edges, fws, piers = d['land'], d['areas'], d['nodes'], d['edges'], d['fws'], d['piers']
    bl, sw_polys, ped_lines = d['bl'], d['sw_polys'], d['ped_lines']
    sizes = {}

    # ---------------- global: roadgraph
    names, kinds = [], []

    def ix(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    E = []
    for e in edges:
        rec = {'a': e['a'], 'b': e['b'], 'p': flat(e['pts']), 'w': e['w'], 'lf': e['lf'], 'lb': e['lb'],
               'o': 1 if e['oneway'] else 0, 's': e['sp'], 'n': ix(names, e['name']) if e['name'] else -1,
               'k': ix(kinds, e['kind'])}
        if e['br']:
            rec['br'] = 2 if e.get('movable') else 1
        if e['layer']:
            rec['l'] = e['layer']
        if e['y'] is not None:
            rec['y'] = [int(round(v * 100)) for v in e['y']]
        if e.get('sw'):
            rec['sw'] = e['sw']
        E.append(rec)
    rg = {'q': Q, 'yq': 100, 'names': names, 'kinds': kinds, 'nodes': flat(nodes), 'edges': E}
    sizes['roadgraph.json'] = dump(os.path.join(OUT, 'roadgraph.json'), rg)

    # ---------------- global: peds (derived sidewalk lines + OSM footpaths)
    fkinds = []
    pnames = []
    peds = {'pathNames': pnames,'q': Q, 'zones': ZONES,
            'sidewalks': [{'e': p['e'], 'p': flat(p['line'].coords), 'zn': p['zn']} for p in ped_lines],
            'pathKinds': fkinds,
            'paths': []}
    for f in fws:
        r = {'k': ix(fkinds, f['kind']), 'w': f['w'], 'p': flat(f['line'].coords)}
        if f['surface']:
            r['s'] = f['surface']
        if f['br']:
            r['br'] = 1
        if f.get('name'):
            r['n'] = ix(pnames, f['name'])
        peds['paths'].append(r)
    sizes['peds.json'] = dump(os.path.join(OUT, 'peds.json'), peds)

    # ---------------- global: spots
    spots = {
        'storefronts': [{'id': i, 'x': round(s['x'], 2), 'z': round(s['z'], 2), 'y': 0, 'w': s['w'], 'd': s['d'],
                         'facing': round(s['facing'], 4), 'fx': round(s['fx'], 2), 'fz': round(s['fz'], 2),
                         'kind': s['kind'], 'poi': s['poi'], 'buildingId': s['buildingId'], 'street': s['street'],
                         'zone': s['zone']} for i, s in enumerate(d['storefronts'])],
        'benches': [{'x': round(b['x'], 2), 'z': round(b['z'], 2), 'heading': round(b['heading'], 3)} for b in d['benches']],
        'leanSpots': [{'x': round(b['x'], 2), 'z': round(b['z'], 2), 'heading': round(b['heading'], 3)} for b in d['lean']],
    }
    sizes['spots.json'] = dump(os.path.join(OUT, 'spots.json'), spots)

    # ---------------- global: map layers (minimap / pause map)
    def layer(geoms, tol, minA):
        out = []
        for g in geoms:
            for p in polys_only(g):
                if p.area < minA:
                    continue
                r = poly_rec(p, tol)
                if r and len(r['p']) >= 6:
                    out.append(r)
        return out

    mp = {
        'q': Q,
        'land': layer([land], 3.0, 50),
        'water': layer([w[0] for w in d['L']['water']], 2.0, 50),
        'beach': layer([a['geom'] for a in areas if a['cls'] == 'sand'], 2.0, 20),
        'park': layer([a['geom'] for a in areas if a['cls'] in ('park', 'pitch', 'grass', 'playground') and a['area'] > 150], 2.0, 150),
        'buildings': [],
    }
    for b in bl:
        r = poly_rec(b['geom'], 1.0)
        if r:
            r.pop('ho', None)
            r['h'] = b['h']
            mp['buildings'].append(r)
    sizes['map.json'] = dump(os.path.join(OUT, 'map.json'), mp)

    # ---------------- grids
    grid_meta = []
    blob = bytearray()
    for name, arr, res in (('surface', d['surf'], 2.0), ('depth', d['depth_dm'], 4.0), ('zone', d['zlab'], 8.0), ('district', d['dlab'], 8.0)):
        data = rle(arr)
        grid_meta.append({'name': name, 'w': int(arr.shape[1]), 'h': int(arr.shape[0]), 'res': res, 'x0': X0, 'z0': Z0,
                          'offset': len(blob), 'length': len(data)})
        blob += data
        while len(blob) % 4:
            blob += b'\0'
    with open(os.path.join(OUT, 'grid.bin.tmp'), 'wb') as f:
        f.write(blob)
    os.replace(os.path.join(OUT, 'grid.bin.tmp'), os.path.join(OUT, 'grid.bin'))
    sizes['grid.bin'] = len(blob)

    # ---------------- names index
    streets = defaultdict(list)
    for e in edges:
        if e['name']:
            streets[e['name']].append(e['id'])
    dcent = {}
    dl = d['dlab']
    for i, n in enumerate(d['dnames']):
        jj, ii = np.nonzero(dl == i)
        if len(ii):
            dcent[n] = {'x': round(X0 + (ii.mean() + 0.5) * 8, 1), 'z': round(Z0 + (jj.mean() + 0.5) * 8, 1), 'cells': int(len(ii))}
    sizes['names.json'] = dump(os.path.join(OUT, 'names.json'), {'streets': streets, 'districts': dcent})

    # ---------------- tiles
    log('tiling...')
    landPolys = polys_only(land)
    landTree = STRtree(landPolys)
    swTree = STRtree(sw_polys)
    lu = [a for a in areas if a['surf'] and a['cls'] not in ('lu_residential',)]
    luGeoms = [a['geom'] for a in lu]
    luTree = STRtree(luGeoms)
    fwLines = [f['line'] for f in fws]
    fwTree = STRtree(fwLines)
    eLines = [LineString(e['pts']) for e in edges]
    eTree = STRtree(eLines)
    pierG = [p['geom'] for p in piers]
    pierTree = STRtree(pierG)
    tiles = defaultdict(lambda: defaultdict(list))
    for b in bl:
        rp = b['geom'].representative_point()
        i, j = tile_of(rp.x, rp.y)
        r = poly_rec(b['geom'])
        if not r:
            continue
        r.update({'id': b['id'], 'h': b['h'], 't': b['typ'], 'st': b['st'], 'zn': b['zn']})
        if b['mh']:
            r['mh'] = b['mh']
        if b['lv']:
            r['lv'] = b['lv']
        if b['part']:
            r['part'] = 1
        for k_, k2 in (('col', 'col'), ('rcol', 'rcol'), ('rs', 'rs')):
            if b.get(k_):
                r[k2] = b[k_]
        tiles[(i, j)]['b'].append(r)
    for e, ln in zip(edges, eLines):
        m = ln.interpolate(0.5, normalized=True)
        tiles[tile_of(m.x, m.y)]['r'].append(e['id'])
    for k, s in enumerate(d['storefronts']):
        tiles[tile_of(s['x'], s['z'])]['sf'].append(k)
    for k, s in enumerate(d['benches']):
        tiles[tile_of(s['x'], s['z'])]['bn'].append(k)
    for k, s in enumerate(d['lean']):
        tiles[tile_of(s['x'], s['z'])]['ls'].append(k)
    for t, x, z in d['props']:
        tiles[tile_of(x, z)]['pp'] += [t, q(x), q(z)]
    for p in d['pois']:
        tiles[tile_of(p['x'], p['z'])]['poi'].append({'k': p['k'], 'x': q(p['x']), 'z': q(p['z'])})
    keys = []
    total = 0
    counts = defaultdict(int)
    bundle = {}
    for j in range(TZ0, TZ1 + 1):
        for i in range(TX0, TX1 + 1):
            tb = tbox(i, j)
            T = tiles[(i, j)]
            ld = clip_polys(landTree, landPolys, tb)
            if ld:
                T['ld'] = [poly_rec(p, 0.4) for p in ld]
                T['ld'] = [r for r in T['ld'] if r]
            sw = clip_polys(swTree, sw_polys, tb)
            if sw:
                T['sw'] = [r for r in (poly_rec(p) for p in sw) if r]
            for k in luTree.query(tb):
                a = lu[k]
                g = a['geom']
                for p in ([g] if tb.contains(g) else polys_only(g.intersection(tb))):
                    if p.area < 0.5:
                        continue
                    r = poly_rec(p, 0.3)
                    if r:
                        r['c'] = a['cls']
                        r['s'] = a['surf']
                        T['lu'].append(r)
            for k, ln in clip_lines(fwTree, fwLines, tb):
                f = fws[k]
                r = {'k': f['kind'], 'w': f['w'], 'p': flat(ln.coords)}
                if f['surface']:
                    r['s'] = f['surface']
                if f['br']:
                    r['br'] = 1
                T['fw'].append(r)
            T['rt'] = sorted(int(k) for k in eTree.query(tb, predicate='intersects'))
            for k in pierTree.query(tb):
                for p in polys_only(pierG[k].intersection(tb)):
                    r = poly_rec(p, 0.2)
                    if r:
                        r['k'] = piers[k]['kind']
                        r['y'] = PIER_Y if piers[k]['kind'] == 'pier' else 0.6
                        T['pr'].append(r)
            T = {k: v for k, v in T.items() if v}
            if not T or (list(T.keys()) == ['rt'] and not T['rt']):
                continue
            T['k'] = tkey(i, j)
            T['i'], T['j'] = i, j
            T['x0'], T['z0'] = i * TILE, j * TILE
            for kk, vv in T.items():
                if isinstance(vv, list):
                    counts[kk] += len(vv) if kk != 'pp' else len(vv) // 3
            total += dump(os.path.join(TILES, tkey(i, j) + '.json'), T)
            keys.append(tkey(i, j))
            bundle[tkey(i, j)] = T
    sizes['tiles/*'] = total
    sizes['tiles.bundle.json'] = dump(os.path.join(OUT, 'tiles.bundle.json'), bundle)
    log(f'tiles {len(keys)} of {NT_X}x{NT_Z}, {total/1e6:.2f} MB', dict(counts))

    # ---------------- manifest
    sx, sy, sz = d['spawn']
    man = {
        'version': 1,
        'generated': datetime.date.today().isoformat(),
        'source': 'OpenStreetMap via Overpass API',
        'attribution': '© OpenStreetMap contributors (ODbL)',
        'bboxLatLon': {'south': BBOX[0], 'west': BBOX[1], 'north': BBOX[2], 'east': BBOX[3]},
        'origin': {'lat': LAT0, 'lon': LON0},
        'bounds': {'minX': X0, 'maxX': X1, 'minZ': Z0, 'maxZ': Z1},
        'seaLevel': SEA_LEVEL, 'curb': CURB, 'pierY': PIER_Y, 'q': Q,
        'tileSize': TILE, 'tilesX': NT_X, 'tilesZ': NT_Z, 'tileOrigin': {'x': 0, 'z': 0},
        'tileRange': {'txMin': TX0, 'txMax': TX1, 'tzMin': TZ0, 'tzMax': TZ1},
        'tiles': keys,
        'playerSpawn': {'x': round(sx, 2), 'y': sy, 'z': round(sz, 2)}, 'playerSpawnHeading': round(d['spawnHeading'], 4),
        'surfaces': SURF, 'zones': ZONES, 'districts': d['dnames'], 'props': PROPS,
        'grids': grid_meta,
        'files': {'roadgraph': 'roadgraph.json', 'peds': 'peds.json', 'spots': 'spots.json', 'map': 'map.json',
                  'names': 'names.json', 'grid': 'grid.bin', 'tiles': 'tiles/{key}.json', 'tileBundle': 'tiles.bundle.json'},
        'stats': {'buildings': len(bl), 'edges': len(edges), 'nodes': len(nodes), 'tiles': len(keys),
                  'storefronts': len(d['storefronts']), 'sidewalkLines': len(ped_lines), 'paths': len(fws)},
    }
    sizes['manifest.json'] = dump(os.path.join(OUT, 'manifest.json'), man)
    log('sizes', {k: f'{v/1e6:.2f} MB' for k, v in sizes.items()}, f'total {sum(sizes.values())/1e6:.2f} MB')
    import preview
    preview.run(d, sizes, man)


if __name__ == '__main__':
    with open(os.path.join(WORK, 'v.pkl'), 'rb') as f:
        run(pickle.load(f))
