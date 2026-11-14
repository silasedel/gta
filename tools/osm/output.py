"""Write the merged world (tiles in region bundles + global files) from the build state (work/v.pkl).

Everything is written to a staging directory, renamed to public/assets/miami/<build>/ and then published by
atomically replacing public/assets/miami/world.json (the manifest, with `dir` pointing at the build). A running
game keeps reading the build it booted with; the two most recent builds are kept on disk.

Run standalone to re-emit without rebuilding: tools/osm/.venv/bin/python tools/osm/output.py
"""
import datetime, glob, json, math, os, pickle, shutil, sys, time, zlib
from collections import defaultdict
import numpy as np
from shapely.geometry import LineString, Point, box
from shapely import STRtree, prepare

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from config import BBOX, LAT0, LON0, SEA_LEVEL, TILE, REAL_RECT, bounds  # noqa: E402
from osmgeom import polys_only, CACHE  # noqa: E402
from raster import X0, Z0, X1, Z1  # noqa: E402
from build import SURF, ZONES, CURB, PIER_Y, Q, OUT_ROOT, WORK, q, flat, ring_flat, poly_rec, log  # noqa: E402

FORMAT_VERSION = 2
REGION = 4                      # tiles per region side (800 m), same as the streamer's chunk
TX0, TX1 = int(math.floor(X0 / TILE)), int(math.floor((X1 - 1e-6) / TILE))
TZ0, TZ1 = int(math.floor(Z0 / TILE)), int(math.floor((Z1 - 1e-6) / TILE))
NT_X, NT_Z = TX1 - TX0 + 1, TZ1 - TZ0 + 1


def tkey(i, j):
    return f'{i}_{j}'


def tile_of(x, z):
    return min(max(int(math.floor(x / TILE)), TX0), TX1), min(max(int(math.floor(z / TILE)), TZ0), TZ1)


def tbox(i, j):
    return box(i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE)


def rbox(a, b):
    s = TILE * REGION
    return box(a * s, b * s, (a + 1) * s, (b + 1) * s)


class Clipper:
    """Two-level polygon clipping: geometries are cut to 800 m regions once, then tiles clip the region pieces.
    Tiles that lie wholly inside a piece get the tile square without an intersection."""

    def __init__(self, geoms, min_area=0.5):
        self.geoms = geoms
        self.tree = STRtree(geoms) if geoms else None
        self.cache = {}
        self.min_area = min_area

    def region(self, a, b):
        key = (a, b)
        if key not in self.cache:
            rb = rbox(a, b)
            out = []
            if self.tree is not None:
                for k in self.tree.query(rb):
                    g = self.geoms[k]
                    if not g.intersects(rb):
                        continue
                    c = g if rb.contains(g) else g.intersection(rb)
                    for p in polys_only(c):
                        if p.area > self.min_area:
                            prepare(p)
                            out.append((int(k), p))
            if len(self.cache) > 400:
                self.cache.clear()
            self.cache[key] = out
        return self.cache[key]

    def tile(self, i, j):
        tb = tbox(i, j)
        out = []
        for k, p in self.region(i // REGION, j // REGION):
            if not p.intersects(tb):
                continue
            if p.contains(tb):
                out.append((k, tb))
                continue
            if tb.contains(p):
                out.append((k, p))
                continue
            for c in polys_only(p.intersection(tb)):
                if c.area > self.min_area:
                    out.append((k, c))
        return out


def clip_lines(tree, lines, tb):
    out = []
    for k in tree.query(tb):
        g = lines[k]
        c = g if tb.contains(g) else g.intersection(tb)
        for p in (c.geoms if hasattr(c, 'geoms') else [c]):
            if p.geom_type == 'LineString' and p.length > 0.3:
                out.append((int(k), p))
    return out


def dump(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, path)
    return os.path.getsize(path)


def rle_rows(arr):
    """uint8 2D -> (bytes, nruns): u32le run count per row, then (value u8, run u16le) per run, rows never merged.
    The loader keeps this run table in memory and looks cells up by binary search (no dense decode)."""
    H, W = arr.shape
    counts = np.zeros(H, '<u4')
    chunks = []
    for j in range(H):
        row = arr[j]
        ch = np.flatnonzero(np.diff(row)) + 1
        starts = np.concatenate([[0], ch])
        ends = np.concatenate([ch, [W]])
        n = len(starts)
        rec = np.zeros(n, dtype=[('v', 'u1'), ('n', '<u2')])
        rec['v'] = row[starts]
        rec['n'] = (ends - starts).astype('<u2') if W <= 65535 else 0
        counts[j] = n
        chunks.append(rec.tobytes())
    return counts.tobytes() + b''.join(chunks), int(counts.sum())


def scc_main(n_nodes, edges):
    """Largest strongly connected component of the directed road graph -> set of node ids (iterative Kosaraju)."""
    fwd = [[] for _ in range(n_nodes)]
    rev = [[] for _ in range(n_nodes)]
    for e in edges:
        fwd[e['a']].append(e['b'])
        rev[e['b']].append(e['a'])
        if not e['oneway']:
            fwd[e['b']].append(e['a'])
            rev[e['a']].append(e['b'])
    seen = [False] * n_nodes
    order = []
    for s in range(n_nodes):
        if seen[s]:
            continue
        st = [(s, 0)]
        seen[s] = True
        while st:
            u, i = st[-1]
            if i < len(fwd[u]):
                st[-1] = (u, i + 1)
                v = fwd[u][i]
                if not seen[v]:
                    seen[v] = True
                    st.append((v, 0))
            else:
                order.append(u)
                st.pop()
    comp = [-1] * n_nodes
    sizes = []
    for s in reversed(order):
        if comp[s] >= 0:
            continue
        c = len(sizes)
        st = [s]
        comp[s] = c
        n = 0
        while st:
            u = st.pop()
            n += 1
            for v in rev[u]:
                if comp[v] < 0:
                    comp[v] = c
                    st.append(v)
        sizes.append(n)
    best = max(range(len(sizes)), key=lambda c: sizes[c]) if sizes else -1
    return {i for i in range(n_nodes) if comp[i] == best}


def weak_components(n_nodes, edges):
    par = list(range(n_nodes))

    def find(a):
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
    order = sorted(length, key=lambda r: -length[r])
    cid = {r: i for i, r in enumerate(order)}
    return [cid[find(e['a'])] for e in edges], [round(length[r]) for r in order]


def run(d):
    t_start = time.time()
    build_id = 'b' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    os.makedirs(OUT_ROOT, exist_ok=True)
    OUT = os.path.join(OUT_ROOT, '.staging-' + build_id)
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'regions'))
    land, areas, nodes, edges, fws, piers = d['land'], d['areas'], d['nodes'], d['edges'], d['fws'], d['piers']
    bl, sw_polys, ped_lines = d['bl'], d['sw_polys'], d['ped_lines']
    PROPS, COVER = d['props_list'], d['cover_names']
    sizes = {}
    rx0, rz0, rx1, rz1 = REAL_RECT

    # ---------------- global: roadgraph
    names, kinds, refs, surfs = [], [], [], []

    def ix(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    comp, comp_len = weak_components(len(nodes), edges)
    main_scc = scc_main(len(nodes), edges)
    name_ix = {}
    E = []
    for e in edges:
        nm = e['name']
        if nm and nm not in name_ix:
            name_ix[nm] = len(names)
            names.append(nm)
        rec = {'a': e['a'], 'b': e['b'], 'p': flat(e['pts']), 'w': e['w'], 'lf': e['lf'], 'lb': e['lb'],
               'o': 1 if e['oneway'] else 0, 's': e['sp'], 'n': name_ix[nm] if nm else -1,
               'k': ix(kinds, e['kind'])}
        if e['br']:
            rec['br'] = 2 if e.get('movable') else 1
        if e['layer']:
            rec['l'] = e['layer']
        if e['y'] is not None:
            rec['y'] = [int(round(v * 100)) for v in e['y']]
            if e.get('tr'):
                rec['tr'] = 1
        if e.get('sw'):
            rec['sw'] = e['sw']
        if e.get('ref'):
            rec['r'] = ix(refs, e['ref'])
        if e.get('ca'):
            rec['ca'] = e['ca']
        if e.get('cb'):
            rec['cb'] = e['cb']
        if e.get('tl'):
            rec['tl'] = e['tl']
        if e.get('tlb'):
            rec['tlb'] = e['tlb']
        if e.get('toll'):
            rec['toll'] = 1
        if e.get('lit'):
            rec['lit'] = 1
        if e.get('spTag'):
            rec['st'] = 1
        if e.get('surface') and e['surface'] != 'asphalt':
            rec['sf'] = ix(surfs, e['surface'])
        if e.get('dst'):
            rec['dst'] = e['dst']
        if e.get('dref'):
            rec['dref'] = e['dref']
        if e.get('brName'):
            rec['bn'] = e['brName']
        if e.get('junction') in ('roundabout', 'circular'):
            rec['rb'] = 1
        if e.get('synthetic'):
            rec['syn'] = 1
        if e.get('priv'):
            rec['pv'] = 1
        if comp[e['id']]:
            rec['c'] = comp[e['id']]
        if not (e['a'] in main_scc and e['b'] in main_scc):
            rec['ns'] = 1               # not in the main strongly connected component (one-way dead end at the map edge, island)
        E.append(rec)
    rg = {'q': Q, 'yq': 100, 'names': names, 'kinds': kinds, 'refs': refs, 'surfaces': surfs, 'nodes': flat(nodes), 'edges': E,
          'signals': sorted(d['signal_nodes']), 'exits': {str(k): v for k, v in d['exits'].items()},
          'turns': {'no': [[a, n, b] for kind, a, n, b, rs in d['turn_no'] if kind == 'no'],
                    'only': [[a, n, b] for kind, a, n, b, rs in d['turn_no'] if kind == 'only'],
                    'via': [[kind, a, v, b] for kind, a, v, b, rs in d['turn_via']]},
          'components': comp_len[:50]}
    # mapped control and crossing points (the same nodes that appear as props in the tiles), so routing never has to walk tiles
    ctl = {'signal': [], 'stop': [], 'yield': [], 'crossing': []}
    for t, x, z in d['props']:
        n_ = PROPS[t]
        if n_ in ctl:
            ctl[n_] += [q(x), q(z)]
    rg['controls'] = {'signals': ctl['signal'], 'stops': ctl['stop'], 'yields': ctl['yield'], 'crossings': ctl['crossing']}
    sizes['roadgraph.json'] = dump(os.path.join(OUT, 'roadgraph.json'), rg)

    # ---------------- global: peds (derived sidewalk lines + OSM footpaths)
    fkinds = []
    pnames = []
    peds = {'pathNames': pnames, 'q': Q, 'zones': ZONES,
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
    def sf_rec(i, s):
        r = {'id': i, 'x': round(s['x'], 2), 'z': round(s['z'], 2), 'y': 0, 'w': s['w'], 'd': s['d'],
             'facing': round(s['facing'], 4), 'fx': round(s['fx'], 2), 'fz': round(s['fz'], 2),
             'kind': s['kind'], 'poi': s['poi'], 'buildingId': s['buildingId'], 'street': s['street'], 'zone': s['zone']}
        for k_, o_ in (('osm', 'osm'), ('sub', 'sub'), ('tier', 'tier'), ('addr', 'addr'), ('dt', 'driveThrough'), ('os', 'outdoorSeating')):
            if s.get(k_):
                r[o_] = s[k_]
        return r
    spots = {
        'storefronts': [sf_rec(i, s) for i, s in enumerate(d['storefronts'])],
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
        'water': layer([w[0] for w in d['inland']], 2.0, 50),
        'beach': layer([a['geom'] for a in areas if a['cls'] in ('sand', 'dune')], 2.0, 20),
        'park': layer([a['geom'] for a in areas if a['cls'] in ('park', 'pitch', 'grass', 'playground', 'golf', 'cemetery', 'garden') and a['area'] > 150], 2.0, 150),
        'cover': {},
        'buildings': [],
        'rails': [],
    }
    for cls in ('forest', 'pine', 'scrub', 'sawgrass', 'wetland', 'mangrove', 'farmland', 'grove', 'runway', 'taxiway', 'apron',
                'campground', 'parking', 'plaza', 'paved', 'wild', 'construction', 'dirt', 'rock'):
        gs = [a['geom'] for a in areas if a['cls'] == cls and a['area'] > (400 if cls in ('parking', 'plaza', 'paved', 'wild', 'dirt') else 60)]
        if gs:
            mp['cover'][cls] = layer(gs, 3.0, 60)
    for b in bl:
        r = poly_rec(b['geom'], 1.0)
        if r:
            r.pop('ho', None)
            r['h'] = b['h']
            mp['buildings'].append(r)
    for s_ in d['rails']:
        r = {'k': s_['kind'], 'p': flat(LineString(s_['pts']).simplify(1.5).coords)}
        if max(s_['y']) > 0.5:
            r['el'] = 1
        mp['rails'].append(r)
    sizes['map.json'] = dump(os.path.join(OUT, 'map.json'), mp)

    # ---------------- grids (one file, each layer deflated)
    grid_meta = []
    blob = bytearray()

    def add_layer(name, res, w, h, enc, raw, extra=None):
        comp_ = zlib.compress(raw, 6)
        m = {'name': name, 'w': int(w), 'h': int(h), 'res': res, 'x0': X0, 'z0': Z0, 'enc': enc, 'z': 1,
             'offset': len(blob), 'length': len(comp_), 'rawLength': len(raw)}
        if extra:
            m.update(extra)
        grid_meta.append(m)
        blob.extend(comp_)

    for name, arr, res in (('surface', d['surf'], 2.0), ('cover', d['cover'], 4.0), ('zone', d['zlab'], 8.0), ('district', d['dlab'], 8.0), ('wkind', d['wkind'], 8.0)):
        raw, nruns = rle_rows(arr)
        add_layer(name, res, arr.shape[1], arr.shape[0], 'rows', raw, {'runs': nruns})
    add_layer('depth', 8.0, d['depth_dm'].shape[1], d['depth_dm'].shape[0], 'u8', d['depth_dm'].tobytes(), {'unit': 0.1})
    hg = d['hgt']
    has_relief = bool((hg != 0).any())
    if has_relief:
        add_layer('height', 16.0, hg.shape[1], hg.shape[0], 'i16', hg.astype('<i2').tobytes(), {'unit': 0.1, 'node': 1})
    with open(os.path.join(OUT, 'grid.bin'), 'wb') as f:
        f.write(blob)
    sizes['grid.bin'] = len(blob)

    # ---------------- names index
    streets = defaultdict(list)
    refmap = defaultdict(list)
    for e in edges:
        if e['name']:
            streets[e['name']].append(e['id'])
        if e.get('ref'):
            for r_ in e['ref'].split(';'):
                refmap[r_].append(e['id'])
    dcent = {}
    dl = d['dlab']
    for i, n in enumerate(d['dnames']):
        jj, ii = np.nonzero(dl == i)
        if len(ii):
            dcent[n] = {'x': round(X0 + (ii.mean() + 0.5) * 8, 1), 'z': round(Z0 + (jj.mean() + 0.5) * 8, 1), 'cells': int(len(ii))}
    sizes['names.json'] = dump(os.path.join(OUT, 'names.json'), {'streets': streets, 'districts': dcent, 'refs': refmap})

    # ---------------- places (districts, layout places, set pieces, typed land-use sites)
    WATER_NAMES = {'Biscayne Bay', 'Atlantic Ocean', 'Miami River', 'Government Cut', 'Main Channel', "Fisherman's Channel",
                   'Dodge Island Cut', 'Collins Canal', 'Indian Creek', 'Norris Cut', 'Meloy Channel', 'Wagner Creek',
                   'Seybold Canal', 'Tamiami Canal'}
    syn_names = {p.get('name') for p in d['places']}
    places = []
    for n, c in dcent.items():
        if n in syn_names:
            continue
        kind = 'water' if n in WATER_NAMES else 'island' if ('Island' in n or 'Isle' in n or 'Key' in n) else \
            'causeway' if 'Causeway' in n or n == 'Port Boulevard' else 'district'
        places.append({'name': n, 'kind': kind, 'x': c['x'], 'z': c['z'], 'r': round(math.sqrt(c['cells'] * 64 / math.pi)), 'real': True})
    for p in d['places']:
        places.append({'name': p.get('name'), 'kind': p.get('kind', 'region'), 'x': p['x'], 'z': p['z'], 'r': p.get('r', 500)})
    site_recs = []
    for s_ in d['sites']:
        if s_['use'] == 'parking' and s_['area'] < 600:
            continue
        rp = s_['geom'].representative_point()
        r = {'use': s_['use'], 'x': round(rp.x, 1), 'z': round(rp.y, 1), 'r': round(math.sqrt(s_['area'] / math.pi), 1)}
        for k_ in ('kind', 'sub', 'tier'):
            if s_.get(k_):
                r[k_] = s_[k_]
        site_recs.append(r)
    for b in bl:
        if b.get('use') and b['use'] not in ('house', 'apartments', 'retail', 'office', 'parking_garage', 'utility', 'kiosk', 'toilets',
                                              'construction', 'warehouse', 'industrial') and not b.get('part'):
            rp = b['geom'].representative_point()
            r = {'use': b['use'], 'x': round(rp.x, 1), 'z': round(rp.y, 1), 'r': round(math.sqrt(b['area'] / math.pi), 1), 'b': b['id']}
            for k_ in ('sub', 'tier'):
                if b.get(k_):
                    r[k_] = b[k_]
            site_recs.append(r)
    sizes['places.json'] = dump(os.path.join(OUT, 'places.json'), {
        'places': places, 'setpieces': d['setpieces'], 'sites': site_recs, 'other': d.get('synth_other') or {},
        'exits': [{'node': int(k), 'ref': v, 'x': round(nodes[k][0], 1), 'z': round(nodes[k][1], 1)} for k, v in d['exits'].items()]})

    # ---------------- transit
    T_ = d['transit']
    tr = {'q': Q,
          'stops': T_['stops'],
          'routes': T_['routes'],
          'lines': [{**{k: v for k, v in l.items() if k not in ('pts', 'y')}, 'p': flat(l['pts']), 'y': [int(round(v * 100)) for v in l['y']]}
                    for l in T_['lines']],
          'stations': T_['stations']}
    sizes['transit.json'] = dump(os.path.join(OUT, 'transit.json'), tr)

    # ---------------- tiles
    log('tiling...')
    landC = Clipper(polys_only(land))
    swC = Clipper(sw_polys)
    lu = [a for a in areas if a['surf'] and a['cls'] not in ('lu_residential',) and not a['cls'].startswith('lu_')]
    luC = Clipper([a['geom'] for a in lu])
    sites = d['sites']
    siteC = Clipper([s_['geom'] for s_ in sites])
    xa = d['extra_areas']
    xaC = Clipper([a['geom'] for a in xa])
    fwLines = [f['line'] for f in fws]
    fwTree = STRtree(fwLines) if fwLines else None
    eLines = [LineString(e['pts']) for e in edges]
    eTree = STRtree(eLines)
    pierC = Clipper([p['geom'] for p in piers], 0.2)
    railLines = [LineString(s_['pts']) for s_ in d['rails']]
    railTree = STRtree(railLines) if railLines else None
    barLines = [b_['line'] for b_ in d['bars']]
    barTree = STRtree(barLines) if barLines else None
    hg_ = d['hgt']
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
        for k_, k2 in (('col', 'col'), ('rcol', 'rcol'), ('rs', 'rs'), ('use', 'u'), ('kind', 'kd'), ('osm', 'o'), ('sub', 'sb'),
                       ('tier', 'ti'), ('addr', 'ad'), ('mat', 'mt'), ('rmat', 'rm'), ('rh', 'rh'), ('rlv', 'rl'), ('year', 'yr'),
                       ('arch', 'ar'), ('tenants', 'tn'), ('heading', 'hd'), ('sid', 'sid')):
            if b.get(k_) is not None and b.get(k_) != '':
                r[k2] = b[k_]
        if b.get('synthetic'):
            r['syn'] = 1
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
    for t, x, z, h in d['props_h']:
        tiles[tile_of(x, z)]['ph'] += [t, q(x), q(z), int(round(math.degrees(h))) % 360]
    for p in d['pois']:
        r = {'k': p['k'], 'x': q(p['x']), 'z': q(p['z'])}
        for k_, k2 in (('osm', 'o'), ('sub', 's'), ('tier', 't'), ('b', 'b'), ('addr', 'a'), ('level', 'l')):
            if p.get(k_) is not None:
                r[k2] = p[k_]
        tiles[tile_of(p['x'], p['z'])]['poi'].append(r)
    for sp in d['setpieces']:
        if 'x' in sp and 'z' in sp:
            tiles[tile_of(sp['x'], sp['z'])]['sp'].append({'id': sp.get('id'), 'x': sp['x'], 'z': sp['z'], 'h': sp.get('heading', 0)})
    keys = []
    total = 0
    counts = defaultdict(int)
    regions = defaultdict(dict)
    boot_regions = set()
    t_tile = time.time()
    for j in range(TZ0, TZ1 + 1):
        for i in range(TX0, TX1 + 1):
            tb = tbox(i, j)
            T = tiles[(i, j)]
            ld = landC.tile(i, j)
            if ld:
                T['ld'] = [r for r in (poly_rec(p, 0.4) for _, p in ld) if r]
            sw = swC.tile(i, j)
            if sw:
                T['sw'] = [r for r in (poly_rec(p) for _, p in sw) if r]
            for k, p in luC.tile(i, j):
                a = lu[k]
                r = poly_rec(p, 0.3)
                if r:
                    r['c'] = a['cls']
                    r['s'] = a['surf']
                    T['lu'].append(r)
            for k, p in siteC.tile(i, j):
                s_ = sites[k]
                if p.area < 20:
                    continue
                r = poly_rec(p, 0.4)
                if r:
                    r['u'] = s_['use']
                    for k_, k2 in (('kind', 'kd'), ('sub', 'sb'), ('tier', 'ti')):
                        if s_.get(k_):
                            r[k2] = s_[k_]
                    T['st'].append(r)
            for k, p in xaC.tile(i, j):
                r = poly_rec(p, 0.5)
                if r:
                    r['k'] = xa[k]['kind']
                    T['xa'].append(r)
            if fwTree is not None:
                for k, ln in clip_lines(fwTree, fwLines, tb):
                    f = fws[k]
                    r = {'k': f['kind'], 'w': f['w'], 'p': flat(ln.coords)}
                    if f['surface']:
                        r['s'] = f['surface']
                    if f['br']:
                        r['br'] = 1
                    if f.get('sub'):
                        r['sb'] = f['sub']
                    T['fw'].append(r)
            T['rt'] = sorted(int(k) for k in eTree.query(tb, predicate='intersects'))
            for k, p in pierC.tile(i, j):
                r = poly_rec(p, 0.2)
                if r:
                    r['k'] = piers[k]['kind']
                    r['y'] = PIER_Y if piers[k]['kind'] == 'pier' else 0.6
                    T['pr'].append(r)
            if railTree is not None:
                for k, ln in clip_lines(railTree, railLines, tb):
                    s_ = d['rails'][k]
                    c = list(ln.coords)
                    r = {'k': s_['kind'], 'p': flat(c)}
                    if max(s_['y']) > 0.05:
                        full = railLines[k]
                        cum = [0.0]
                        for a_ in range(1, len(s_['pts'])):
                            cum.append(cum[-1] + math.hypot(s_['pts'][a_][0] - s_['pts'][a_ - 1][0], s_['pts'][a_][1] - s_['pts'][a_ - 1][1]))
                        r['y'] = [int(round(float(np.interp(full.project(Point(v)), cum, s_['y'])) * 100)) for v in c]
                    if s_['br']:
                        r['br'] = 1
                    T['rl'].append(r)
            if barTree is not None:
                for k, ln in clip_lines(barTree, barLines, tb):
                    b_ = d['bars'][k]
                    r = {'k': b_['kind'], 'p': flat(ln.coords)}
                    if b_.get('h'):
                        r['h'] = round(b_['h'], 1)
                    if b_.get('mat'):
                        r['m'] = b_['mat']
                    T['bar'].append(r)
            T = {k: v for k, v in T.items() if v}
            if not T or (list(T.keys()) == ['rt'] and not T['rt']):
                continue
            # terrain relief of this tile (decimetres), so the renderer knows when the ground is not flat
            gi0, gj0 = int((i * TILE - X0) // 16), int((j * TILE - Z0) // 16)
            n16 = int(TILE // 16) + 2
            sub = hg_[max(0, gj0):gj0 + n16, max(0, gi0):gi0 + n16]
            if sub.size and (sub != 0).any():
                T['hm'] = [int(sub.min()), int(sub.max())]
            T['k'] = tkey(i, j)
            T['i'], T['j'] = i, j
            T['x0'], T['z0'] = i * TILE, j * TILE
            for kk, vv in T.items():
                if isinstance(vv, list):
                    counts[kk] += len(vv) if kk not in ('pp', 'ph') else len(vv) // (3 if kk == 'pp' else 4)
            keys.append(tkey(i, j))
            rk = tkey(i // REGION, j // REGION)
            regions[rk][tkey(i, j)] = T
            if any(b_.get('t') == 'cruise_terminal' or b_.get('u') == 'cruise_terminal' for b_ in T.get('b', [])):
                boot_regions.add(rk)
        if (j - TZ0) % 10 == 9:
            log(f'  tile rows {j - TZ0 + 1}/{NT_Z} ({time.time() - t_tile:.0f}s)')
    region_sizes = {}
    for rk, tl in regions.items():
        region_sizes[rk] = dump(os.path.join(OUT, 'regions', rk + '.json'), {'k': rk, 'tiles': tl})
        total += region_sizes[rk]
    sizes['regions/*'] = total
    big = sorted(region_sizes.items(), key=lambda kv: -kv[1])[:5]
    log(f'tiles {len(keys)} of {NT_X}x{NT_Z} in {len(regions)} regions, {total/1e6:.2f} MB; largest regions {[(k, round(v/1e3)) for k, v in big]} KB', dict(counts))

    # ---------------- manifest
    sx, sy, sz = d['spawn']
    man = {
        'version': FORMAT_VERSION,
        'build': build_id,
        'dir': build_id + '/',
        'generated': datetime.datetime.now().isoformat(timespec='seconds'),
        'source': 'OpenStreetMap via Overpass API' + (' + synthetic regions (tools/world)' if d['has_synth'] else ''),
        'attribution': '© OpenStreetMap contributors (ODbL)',
        'bboxLatLon': {'south': BBOX[0], 'west': BBOX[1], 'north': BBOX[2], 'east': BBOX[3]},
        'origin': {'lat': LAT0, 'lon': LON0},
        'bounds': {'minX': X0, 'maxX': X1, 'minZ': Z0, 'maxZ': Z1},
        'realRect': {'minX': rx0, 'maxX': rx1, 'minZ': rz0, 'maxZ': rz1},
        'hasSynthetic': bool(d['has_synth']),
        'seaLevel': SEA_LEVEL, 'curb': CURB, 'pierY': PIER_Y, 'q': Q,
        'tileSize': TILE, 'tilesX': NT_X, 'tilesZ': NT_Z, 'tileOrigin': {'x': 0, 'z': 0},
        'tileRange': {'txMin': TX0, 'txMax': TX1, 'tzMin': TZ0, 'tzMax': TZ1},
        'tiles': keys,
        'regionTiles': REGION,
        'regions': sorted(regions.keys()),
        'regionBytes': region_sizes,
        'bootRegions': sorted(boot_regions),
        'playerSpawn': {'x': round(sx, 2), 'y': sy, 'z': round(sz, 2)}, 'playerSpawnHeading': round(d['spawnHeading'], 4),
        'surfaces': SURF, 'zones': ZONES, 'districts': d['dnames'], 'props': PROPS, 'cover': COVER,
        'waterKinds': [None, 'sea', 'lake', 'canal', 'river', 'pond', 'marsh'],
        'grids': grid_meta,
        'relief': has_relief,
        'files': {'roadgraph': 'roadgraph.json', 'peds': 'peds.json', 'spots': 'spots.json', 'map': 'map.json',
                  'names': 'names.json', 'places': 'places.json', 'transit': 'transit.json', 'grid': 'grid.bin',
                  'region': 'regions/{key}.json'},
        'stats': {'buildings': len(bl), 'edges': len(edges), 'nodes': len(nodes), 'tiles': len(keys), 'regions': len(regions),
                  'storefronts': len(d['storefronts']), 'storefrontsTyped': sum(1 for s in d['storefronts'] if s['poi']),
                  'sidewalkLines': len(ped_lines), 'paths': len(fws), 'pois': len(d['pois']),
                  'signals': len(d['signal_nodes']), 'turnRestrictions': len(d['turn_no']) + len(d['turn_via']),
                  'busStops': len(T_['stops']), 'busRoutes': len(T_['routes']), 'railLines': len(T_['lines']),
                  'stations': len(T_['stations']), 'roadComponents': len(comp_len),
                  'roadKm': round(sum(comp_len) / 1000, 1), 'mainComponentKm': round(comp_len[0] / 1000, 1) if comp_len else 0,
                  'bytes': sizes},
    }
    sizes['manifest.json'] = dump(os.path.join(OUT, 'manifest.json'), man)
    log('sizes', {k: f'{v/1e6:.2f} MB' for k, v in sizes.items()}, f'total {sum(sizes.values())/1e6:.2f} MB')

    # ---------------- publish: staging -> build dir, then one atomic manifest swap
    final = os.path.join(OUT_ROOT, build_id)
    os.rename(OUT, final)
    if os.environ.get('MIAMI_NO_PUBLISH'):
        log('built', final, '(not published: MIAMI_NO_PUBLISH is set)')
    else:
        tmp = os.path.join(OUT_ROOT, 'world.json.tmp')
        with open(tmp, 'w') as f:
            json.dump(man, f, separators=(',', ':'))
        os.replace(tmp, os.path.join(OUT_ROOT, 'world.json'))
        log('published', final)
        try:
            shutil.copyfile(os.path.join(final, 'spots.json'), os.path.join(OUT_ROOT, 'spots.json.tmp'))
            os.replace(os.path.join(OUT_ROOT, 'spots.json.tmp'), os.path.join(OUT_ROOT, 'spots.json'))
        except OSError:
            pass
        # keep this build and the previous one (a running game may still be streaming regions from it)
        olds = sorted(p for p in glob.glob(os.path.join(OUT_ROOT, 'b2*')) if os.path.isdir(p))
        for p in olds[:-2]:
            shutil.rmtree(p, ignore_errors=True)
            log('removed old build', os.path.basename(p))
    for p in glob.glob(os.path.join(OUT_ROOT, '.staging-*')):
        if time.time() - os.path.getmtime(p) > 3600:
            shutil.rmtree(p, ignore_errors=True)
    with open(os.path.join(WORK, 'last_build.json'), 'w') as f:
        json.dump({'build': build_id, 'dir': final, 'seconds': round(time.time() - t_start, 1)}, f)
    return man


if __name__ == '__main__':
    with open(os.path.join(WORK, 'v.pkl'), 'rb') as f:
        run(pickle.load(f))
