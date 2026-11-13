#!/usr/bin/env python3
"""Miami OSM -> game data. Run: tools/osm/.venv/bin/python tools/osm/build.py
Inputs: tools/osm/cache/*.json (fetch.py). Outputs: public/assets/miami/*, docs/showcase/map/*.
"""
import hashlib, json, math, os, pickle, sys, time
from collections import defaultdict
import numpy as np
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import STRtree, prepare, contains_xy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from config import BBOX, LAT0, LON0, SEA_LEVEL, TILE, proj, bounds  # noqa: E402
from osmgeom import load, pts, elem_poly, way_line, polys_only, fix, parse_len, CACHE  # noqa: E402
from raster import Grid, dilate, distance_steps, label_fill, rle, X0, Z0, X1, Z1  # noqa: E402
import roads as R  # noqa: E402

GAME = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(GAME, 'public', 'assets', 'miami')
TILES = os.path.join(OUT, 'tiles')
DOCS = os.path.join(GAME, 'docs', 'showcase', 'map')
WORK = os.path.join(CACHE, 'work')

SURF = ['water', 'asphalt', 'concrete', 'pavers', 'tile', 'sand', 'grass_short', 'grass_long', 'dirt', 'gravel',
        'wood', 'metal', 'sidewalk', 'pier', 'building']
S = {n: i for i, n in enumerate(SURF)}
ZONES = ['water', 'beach', 'nightlife', 'downtown', 'business', 'residential', 'commercial', 'park', 'port',
         'causeway', 'industrial']
Z = {n: i for i, n in enumerate(ZONES)}
PROPS = ['tree', 'palm', 'lamp', 'signal', 'bus', 'stop', 'crossing', 'waste', 'fountain', 'bike', 'art', 'hydrant']
CURB = 0.15
PIER_Y = 1.2
Q = 10  # coordinate quantisation: ints in decimetres

T0 = time.time()


def log(*a):
    print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)


def q(v):
    return int(round(v * Q))


def flat(coords):
    out = []
    for x, z in coords:
        out.append(q(x))
        out.append(q(z))
    return out


def ring_flat(c):
    c = list(c)
    if len(c) > 1 and c[0] == c[-1]:
        c = c[:-1]
    return flat(c)


def poly_rec(p, tol=0.0):
    if tol:
        p = p.simplify(tol, preserve_topology=True)
    if p.is_empty or p.geom_type != 'Polygon':
        ps = polys_only(p)
        if not ps:
            return None
        p = max(ps, key=lambda g: g.area)
    p = orient(p, 1.0)
    r = {'p': ring_flat(p.exterior.coords)}
    if p.interiors:
        r['ho'] = [ring_flat(h.coords) for h in p.interiors if len(h.coords) >= 4]
    return r


def hsh(*a):
    return int(hashlib.md5(('|'.join(map(str, a))).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def ll(lat, lon):
    return proj(lon, lat)


# ---------------------------------------------------------------- land
def stage_land():
    path = os.path.join(WORK, 'land.pkl')
    if not os.path.exists(path):
        import land
        land.build_land()
    d = pickle.load(open(path, 'rb'))
    return d


# ---------------------------------------------------------------- areas
def classify_area(t):
    n, lu, le, am = t.get('natural'), t.get('landuse'), t.get('leisure'), t.get('amenity')
    surf = t.get('surface')
    if le in ('swimming_pool',) or am == 'fountain' or t.get('water') in ('swimming_pool', 'fountain', 'reflecting_pool'):
        return 'pool', 'tile'
    if n in ('beach', 'sand') or lu == 'dune':
        return 'sand', 'sand'
    if le == 'pitch' or le in ('track', 'court_area', 'pitch_area'):
        s = {'grass': 'grass_short', 'artificial_turf': 'grass_short', 'sand': 'sand', 'clay': 'dirt',
             'asphalt': 'asphalt', 'concrete': 'concrete', 'acrylic': 'asphalt', 'tartan': 'asphalt',
             'dirt': 'dirt', 'paved': 'asphalt'}.get(surf, 'grass_short')
        return 'pitch', s
    if le in ('park', 'garden', 'dog_park', 'recreation_ground', 'nature_reserve', 'golf_course', 'common') \
            or lu in ('recreation_ground', 'village_green', 'cemetery') or am == 'grave_yard':
        return 'park', 'grass_short'
    if le == 'playground':
        return 'playground', 'pavers' if surf in ('paving_stones', 'concrete') else 'sand' if surf == 'sand' else 'grass_short'
    if lu in ('grass', 'meadow', 'flowerbed') or n == 'grassland':
        return 'grass', 'grass_short'
    if n in ('heath', 'scrub', 'wood', 'wetland', 'tree_row') or lu in ('forest', 'greenfield'):
        return 'wild', 'grass_long'
    if lu in ('construction', 'brownfield'):
        return 'dirt', 'dirt'
    if am == 'parking' and t.get('parking') not in ('multi-storey', 'underground', 'rooftop'):
        return 'parking', 'asphalt'
    if t.get('area:highway') in ('footway', 'pedestrian') or (t.get('highway') == 'pedestrian') or t.get('place') == 'square':
        return 'plaza', 'pavers' if surf not in ('concrete', 'asphalt') else surf
    if t.get('area:highway') == 'traffic_island':
        return 'island', 'grass_short' if surf in (None, 'grass') else 'concrete'
    if le == 'marina' or lu == 'marina':
        return 'marina', 'concrete'
    if lu in ('commercial', 'retail'):
        return 'lu_commercial', None
    if lu in ('industrial', 'port', 'railway', 'military'):
        return 'lu_industrial', None
    if lu == 'residential':
        return 'lu_residential', None
    return None, None


def stage_areas():
    out = []
    for e in load('areas'):
        t = e.get('tags', {})
        cls, surf = classify_area(t)
        if not cls:
            continue
        p = elem_poly(e)
        if p is None or p.area < 4:
            continue
        out.append(dict(cls=cls, surf=surf, geom=p, name=t.get('name'), area=p.area))
    # pedestrian area highways from highways.json (area=yes)
    for e in load('highways'):
        t = e.get('tags', {})
        if t.get('highway') == 'pedestrian' and t.get('area') == 'yes':
            p = elem_poly(e)
            if p is not None:
                out.append(dict(cls='plaza', surf='pavers', geom=p, name=t.get('name'), area=p.area))
    log('areas', len(out), dict(sorted(((c, sum(1 for a in out if a['cls'] == c)) for c in {a['cls'] for a in out}))))
    return out


# ---------------------------------------------------------------- districts
def stage_districts(land, areas, ww_lines):
    G = Grid(8)
    names = []

    def did(n):
        if n not in names:
            names.append(n)
        return names.index(n)

    UNK = 255
    landM = G.mask(land)
    lab = np.full((G.H, G.W), UNK, np.uint8)
    xs = X0 + (np.arange(G.W) + 0.5) * G.res
    zs = Z0 + (np.arange(G.H) + 0.5) * G.res
    XX, ZZ = np.meshgrid(xs, zs)
    # water names
    lab[~landM] = did('Biscayne Bay')
    xcut = ll(LAT0, -80.160)[0]
    atl = did('Atlantic Ocean')
    for j in range(G.H):
        cols = np.flatnonzero(landM[j] & (xs > xcut))
        e = cols.max() + 1 if cols.size else int((ll(LAT0, -80.135)[0] - X0) / G.res)
        m = ~landM[j, e:]
        lab[j, e:][m] = atl
    for name, line in ww_lines:
        if name in ('Atlantic Intracoastal Waterway',):
            continue
        r = 70 if name in ('Miami River', 'Collins Canal') else 100
        m = G.mask(line.buffer(r)) & ~landM
        if name in ('Government Cut', 'Main Channel', "Fisherman's Channel", 'Dodge Island Cut'):
            m &= lab != atl
        lab[m] = did(name)
    landDistrict = len(names)  # ids >= this are land names
    # land components
    comps = polys_only(land)
    known = {
        'Brickell': ll(25.7615, -80.1929), 'Downtown': ll(25.7745, -80.1920), 'Watson Island': ll(25.7849, -80.1757),
        'PortMiami': ll(25.7741, -80.1661), 'Fisher Island': ll(25.7609, -80.1406), 'Brickell Key': ll(25.7673, -80.1850),
        'Miami Beach': ll(25.7800, -80.1320),
    }
    compName = {}
    for nm, (x, z) in known.items():
        for k, c in enumerate(comps):
            if c.contains(Point(x, z)):
                compName[k] = nm
    lm = landM.copy()
    for k, c in enumerate(comps):
        nm = compName.get(k)
        if nm is None or nm == 'Miami Beach':
            continue
        if nm == 'Downtown':
            m = G.mask(c)
            zA, zE = ll(25.7875, LON0)[1], ll(25.7945, LON0)[1]
            lab[m & (ZZ > zA)] = did('Downtown')
            lab[m & (ZZ <= zA) & (ZZ > zE)] = did('Arts & Entertainment District')
            lab[m & (ZZ <= zE)] = did('Edgewater')
        elif nm == 'Watson Island':
            m = G.mask(c)
            xc = ll(LAT0, -80.1728)[0]
            lab[m & (XX <= xc)] = did('Watson Island')
            lab[m & (XX > xc)] = did('MacArthur Causeway')
        else:
            lab[G.mask(c)] = did(nm)
    dd = {e['tags'].get('name'): e for e in load('districts')}
    if 'Overtown' in dd:
        p = elem_poly(dd['Overtown'])
        if p is not None:
            lab[G.mask(p) & lm] = did('Overtown')
    if 'Miami Beach' in dd:
        mb = elem_poly(dd['Miami Beach'])
        m = G.mask(mb) & lm if mb is not None else np.zeros_like(lm)
        for k, c in enumerate(comps):
            if compName.get(k) == 'Miami Beach':
                m |= G.mask(c)
        z5, zD = ll(25.7737, LON0)[1], ll(25.7935, LON0)[1]
        mbm = m & lm
        lab[mbm & (ZZ > z5)] = did('South of Fifth')
        lab[mbm & (ZZ <= z5) & (ZZ > zD)] = did('South Beach')
        lab[mbm & (ZZ <= zD)] = did('Collins Park')
    # Sunset Islands (unnamed fingers north of Venetian Causeway, west of Alton Rd)
    sx0, sz0 = ll(25.7965, -80.1510)
    sx1, sz1 = ll(25.8030, -80.1395)
    for k, c in enumerate(comps):
        rp = c.representative_point()
        if compName.get(k) is None and sx0 < rp.x < sx1 and sz1 < rp.y < sz0:
            lab[G.mask(c)] = did('Sunset Islands')
            compName[k] = 'Sunset Islands'
    # named islands (override)
    for e in load('districts'):
        t = e.get('tags', {})
        if t.get('place') in ('island', 'islet') and t.get('name'):
            p = elem_poly(e)
            if p is not None:
                lab[G.mask(p) & lm] = did(t['name'])
    for a in areas:
        pass
    # unknown land comps: causeway strips or nearest fill
    return G, lab, names, landM, UNK, comps, compName


# ---------------------------------------------------------------- main
def main():
    os.makedirs(TILES, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)
    os.makedirs(WORK, exist_ok=True)
    L = stage_land()
    land = L['land']
    prepare(land)
    log(f'land {land.area/1e6:.2f} km2')

    def is_water_pt(x, z):
        return not contains_xy(land, x, z)

    areas = stage_areas()
    clipped = []
    for a in areas:
        g = a['geom']
        if not land.contains(g):
            g = fix(g.intersection(land))
            if g is None or g.area < 4:
                continue
            a['geom'], a['area'] = g, g.area
        clipped.append(a)
    log(f'areas clipped to land: {len(areas)} -> {len(clipped)}')
    areas = clipped
    ww_lines = []
    for e in load('areas'):
        t = e.get('tags', {})
        if t.get('waterway') in ('river', 'canal') and t.get('name') and e['type'] == 'way':
            ln = way_line(e)
            if ln is not None:
                ww_lines.append((t['name'], ln))

    # ---- roads first (needed for causeway corridors & nightlife)
    nodes, edges = R.build_graph(is_water_pt)
    for i, e in enumerate(edges):
        e['id'] = i
        e['line'] = LineString(e['pts'])
    fws = R.footways()
    piers = R.piers()
    log(f'graph nodes {len(nodes)} edges {len(edges)}; footways {len(fws)}; piers {len(piers)}')

    # ---- districts
    G8, dlab, dnames, land8, UNK, comps, compName = stage_districts(land, areas, ww_lines)
    corridor_names = {'MacArthur Causeway': 'MacArthur Causeway', 'Venetian Way': 'Venetian Causeway',
                      'Venetian Causeway': 'Venetian Causeway', 'Port Boulevard': 'Port Boulevard',
                      'Rickenbacker Causeway': 'Rickenbacker Causeway'}

    def did(n):
        if n not in dnames:
            dnames.append(n)
        return dnames.index(n)

    corr = defaultdict(list)
    for e in edges:
        if e['name'] in corridor_names:
            corr[corridor_names[e['name']]].append(e['line'])
    corrM = np.zeros_like(land8)
    for nm, lines in corr.items():
        m = G8.mask(unary_union(lines).buffer(22))
        corrM |= m
        # water corridor and unnamed land strips along it
        dlab[m & ~land8] = did(nm)
    for k, c in enumerate(comps):
        if compName.get(k):
            continue
        cm = G8.mask(c)
        if not cm.any():
            continue
        cur = dlab[cm]
        if (cur != UNK).mean() > 0.5:
            continue
        hit = None
        for nm, lines in corr.items():
            if any(c.distance(l) < 25 for l in lines):
                hit = nm
                break
        if hit:
            dlab[cm & (dlab == UNK)] = did(hit)
        elif c.area < 60000:
            dlab[cm & (dlab == UNK)] = did('Biscayne Bay Islands')
    dlab = label_fill(dlab, UNK)
    log('districts', dnames)

    # ---- zones (8 m)
    zlab = np.full(dlab.shape, Z['residential'], np.uint8)
    zlab[~land8] = Z['water']
    for a in areas:
        if a['cls'] == 'lu_commercial':
            zlab[G8.mask(a['geom']) & land8] = Z['commercial']
        elif a['cls'] == 'lu_industrial':
            zlab[G8.mask(a['geom']) & land8] = Z['industrial']
    pois_raw = [e for e in load('pois') if e.get('tags')]
    cnt = np.zeros(dlab.shape, np.float32)
    for e in pois_raw:
        t = e['tags']
        if 'shop' in t or t.get('amenity') in ('restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'nightclub', 'bank', 'pharmacy'):
            x, z = proj(e.get('lon', e.get('center', {}).get('lon', 0)), e.get('lat', e.get('center', {}).get('lat', 0)))
            i, j = G8.cell(x, z)
            cnt[j, i] += 1
    k = 9
    cs = np.cumsum(np.cumsum(np.pad(cnt, ((k // 2 + 1, k // 2), (k // 2 + 1, k // 2))), 0), 1)
    box9 = cs[k:, k:] - cs[:-k, k:] - cs[k:, :-k] + cs[:-k, :-k]
    zlab[(box9 >= 4) & land8 & (zlab == Z['residential'])] = Z['commercial']
    dn = {n: i for i, n in enumerate(dnames)}
    for n, zn in (('Downtown', 'downtown'), ('Arts & Entertainment District', 'downtown'), ('Brickell', 'business'),
                  ('Brickell Key', 'business'), ('PortMiami', 'port'), ('Watson Island', 'park'),
                  ('MacArthur Causeway', 'causeway'), ('Venetian Causeway', 'causeway'), ('Port Boulevard', 'causeway')):
        if n in dn:
            zlab[(dlab == dn[n]) & land8] = Z[zn]
    zlab[corrM & ~land8] = Z['causeway']
    for a in areas:
        if a['cls'] in ('park', 'pitch', 'playground') and a['area'] >= 1500 or (a['cls'] == 'grass' and a['area'] >= 6000):
            m = G8.mask(a['geom']) & land8
            zlab[m & (zlab != Z['port'])] = Z['park']
    sobe = np.isin(dlab, [dn.get(n, -1) for n in ('South Beach', 'South of Fifth', 'Collins Park')])
    z5, z16 = ll(25.7735, LON0)[1], ll(25.7905, LON0)[1]
    nl = [e['line'] for e in edges if e['name'] in ('Ocean Drive', 'Collins Avenue', 'Washington Avenue')]
    nl2 = [e['line'] for e in edges if e['name'] in ('Española Way', 'Espanola Way', 'Lincoln Road')]
    nl2 += [f['line'] for f in fws if f.get('name') in ('Lincoln Road', 'Española Way', 'Lincoln Road Mall')]
    ZZ = Z0 + (np.arange(dlab.shape[0]) + 0.5) * 8
    band = ((ZZ < z5) & (ZZ > z16))[:, None]
    nmask = (G8.mask(unary_union(nl).buffer(70)) & band) | G8.mask(unary_union(nl2).buffer(45))
    zlab[nmask & sobe & land8 & (zlab != Z['park'])] = Z['nightlife']
    sand8 = G8.mask([a['geom'] for a in areas if a['cls'] == 'sand']) & land8
    beachParks = [a['geom'] for a in areas if a['cls'] == 'park' and a['name'] in ('Lummus Park', 'Marjory Stoneman Douglas Ocean Beach Park')]
    zlab[dilate(sand8, 1) & land8] = Z['beach']
    if beachParks:
        zlab[G8.mask(beachParks) & land8 & sobe] = Z['beach']
    log('zones', {n: int((zlab == i).sum()) for i, n in enumerate(ZONES)})

    def zone_at(x, z):
        i, j = G8.cell(x, z)
        return int(zlab[j, i])

    def dist_at(x, z):
        i, j = G8.cell(x, z)
        return int(dlab[j, i])

    # ---- buildings
    bl = stage_buildings(zone_at)
    ground_b = [b for b in bl if b['mh'] < 0.5]
    btree = STRtree([b['geom'] for b in ground_b])
    log(f'buildings {len(bl)} (ground {len(ground_b)}), tallest {max(b["h"] for b in bl):.0f} m')

    # ---- sidewalks / carriageways
    carr_lines = [e['line'].buffer(e['w'] / 2, quad_segs=4) for e in edges if e['y'] is None]
    carriage = unary_union(carr_lines)
    log('carriage union done')
    sw_edges = []
    outer = []
    for e in edges:
        if e['y'] is not None or e['kind'] not in R.SIDEWALK_KINDS:
            continue
        if e['kind'] == 'trunk' and e['name'] in ('MacArthur Causeway',):
            continue
        if e.get('sidewalk') == 'no' or e.get('sidewalk') == 'none':
            continue
        mid = e['line'].interpolate(0.5, normalized=True)
        zn = ZONES[zone_at(mid.x, mid.y)]
        if zn in ('port', 'water'):
            continue
        sw = {'downtown': 3.4, 'business': 3.4, 'nightlife': 3.2, 'commercial': 3.0, 'beach': 3.0}.get(zn, 2.2)
        e['sw'] = sw
        sw_edges.append(e)
        outer.append(e['line'].buffer(e['w'] / 2 + sw, quad_segs=4))
    outerU = unary_union(outer)
    bunion = unary_union([b['geom'] for b in ground_b])
    sidewalk = outerU.difference(carriage).intersection(land).difference(bunion)
    sw_polys = [p.simplify(0.25, preserve_topology=True) for p in polys_only(sidewalk) if p.area > 3]
    sw_polys = [p for p in sw_polys if p.is_valid and not p.is_empty]
    log(f'sidewalk polys {len(sw_polys)} area {sum(p.area for p in sw_polys)/1e6:.3f} km2')
    swtree = STRtree(sw_polys)
    ped_lines = []
    for e in sw_edges:
        off = e['w'] / 2 + e['sw'] / 2
        for side in (1, -1):
            try:
                oc = e['line'].offset_curve(side * off, quad_segs=4, join_style='mitre', mitre_limit=2.0)
            except Exception:  # noqa: BLE001
                continue
            if oc.is_empty:
                continue
            cands = swtree.query(oc)
            if not len(cands):
                continue
            g = oc.intersection(unary_union([sw_polys[k].buffer(0.3) for k in cands]))
            for p in (g.geoms if hasattr(g, 'geoms') else [g]):
                if p.geom_type == 'LineString' and p.length >= 6:
                    p = p.simplify(0.5)
                    m = p.interpolate(0.5, normalized=True)
                    ped_lines.append(dict(e=e['id'], side=side, line=p, zn=zone_at(m.x, m.y)))
    log(f'ped sidewalk lines {len(ped_lines)} total {sum(p["line"].length for p in ped_lines)/1000:.1f} km')

    # ---- surface raster (2 m)
    G2 = Grid(2)
    land2 = G2.mask(land)
    zup = np.repeat(np.repeat(zlab, 4, 0), 4, 1)[:G2.H, :G2.W]
    surf = np.full((G2.H, G2.W), S['concrete'], np.uint8)
    for zn in ('residential', 'park', 'causeway', 'beach'):
        surf[zup == Z[zn]] = S['grass_short']
    order = ['lu_residential', 'wild', 'grass', 'park', 'island', 'dirt', 'parking', 'marina', 'pitch', 'playground', 'plaza', 'sand', 'pool']
    for cls in order:
        groups = defaultdict(list)
        for a in areas:
            if a['cls'] == cls and a['surf']:
                groups[a['surf']].append(a['geom'])
        for s_, gs in groups.items():
            surf[G2.mask(gs) & land2] = S[s_]
    fwsurf = {'concrete': 'concrete', 'asphalt': 'asphalt', 'paving_stones': 'pavers', 'paved': 'concrete', 'sett': 'pavers',
              'brick': 'pavers', 'concrete:plates': 'concrete', 'sand': 'sand', 'wood': 'wood', 'metal': 'metal',
              'unpaved': 'dirt', 'dirt': 'dirt', 'ground': 'dirt', 'compacted': 'gravel', 'gravel': 'gravel', 'grass': 'grass_short'}
    groups = defaultdict(list)
    for f in fws:
        if f['br'] and f['surface'] != 'wood':
            continue
        s_ = fwsurf.get(f['surface'] or '', 'pavers' if f['kind'] == 'pedestrian' else 'concrete')
        groups[s_].append((f['line'], f['w']))
    for s_, ls in groups.items():
        surf[G2.lines_mask(ls) & land2] = S[s_]
    surf[G2.mask(sw_polys) & land2] = S['sidewalk']
    carrM = G2.mask(carriage) & land2
    surf[carrM] = S['asphalt']
    bM = G2.mask([b['geom'] for b in ground_b])
    surf[bM] = S['building']
    surf[~land2] = S['water']
    pierM = G2.mask([p['geom'] for p in piers if p['kind'] == 'pier'])
    bwM = G2.mask([p['geom'] for p in piers if p['kind'] != 'pier']) & ~land2
    surf[bwM] = S['gravel']
    surf[pierM & ~bM] = S['pier']
    log('surface raster', {n: int((surf == i).sum()) for i, n in enumerate(SURF)})

    # ---- seabed depth (4 m), decimetres
    G4 = Grid(4)
    land4 = G4.mask(land)
    sand4 = G4.mask([a['geom'] for a in areas if a['cls'] == 'sand'])
    STEPS = 70
    dL = distance_steps(land4, STEPS) * 4.0
    dS = distance_steps(sand4 & land4, STEPS) * 4.0
    beachy = dS <= dL + 4
    d_beach = np.minimum(0.25 + 0.035 * dL, 5.0)
    d_wall = np.minimum(2.2 + 0.03 * dL, 6.0)
    depth = np.where(beachy, d_beach, d_wall)
    chan = G4.mask([ln.buffer(90) for n, ln in ww_lines if n in ('Government Cut', 'Main Channel', "Fisherman's Channel", 'Dodge Island Cut')])
    depth = np.where(chan & ~land4, np.maximum(depth, np.minimum(4 + 0.05 * dL, 12)), depth)
    riv = G4.mask([ln.buffer(60) for n, ln in ww_lines if n in ('Miami River', 'Collins Canal')])
    depth = np.where(riv & ~land4, np.minimum(depth, 4.0), depth)
    depth[land4] = 0
    depth_dm = np.clip(np.round(depth * 10), 0, 255).astype(np.uint8)

    # ---- POIs / props
    pois, props, benches_raw = [], [], []
    PALM = ('sabal', 'roystonea', 'cocos', 'phoenix', 'washingtonia', 'veitchia', 'wodyetia', 'adonidia', 'palm',
            'dypsis', 'livistona', 'bismarckia', 'ptychosperma', 'thrinax', 'coccothrinax', 'arecaceae', 'pritchardia', 'syagrus')
    B = box(X0, Z0, X1, Z1)
    for e in pois_raw:
        t = e['tags']
        lat = e.get('lat', e.get('center', {}).get('lat'))
        lon = e.get('lon', e.get('center', {}).get('lon'))
        if lat is None:
            continue
        x, z = proj(lon, lat)
        if not (X0 <= x <= X1 and Z0 <= z <= Z1):
            continue
        hw = t.get('highway')
        if t.get('natural') == 'tree':
            s = ' '.join(str(t.get(k, '')) for k in ('species', 'genus', 'taxon', 'leaf_type', 'species:en', 'taxon:en', 'name')).lower()
            props.append((PROPS.index('palm' if any(p in s for p in PALM) else 'tree'), x, z))
        elif hw == 'street_lamp':
            props.append((PROPS.index('lamp'), x, z))
        elif hw == 'traffic_signals':
            props.append((PROPS.index('signal'), x, z))
        elif hw == 'bus_stop':
            props.append((PROPS.index('bus'), x, z))
        elif hw == 'stop':
            props.append((PROPS.index('stop'), x, z))
        elif hw == 'crossing':
            props.append((PROPS.index('crossing'), x, z))
        elif t.get('amenity') == 'bench':
            benches_raw.append((x, z))
        elif t.get('amenity') == 'waste_basket':
            props.append((PROPS.index('waste'), x, z))
        elif t.get('amenity') in ('fountain', 'drinking_water'):
            props.append((PROPS.index('fountain'), x, z))
        elif t.get('amenity') == 'bicycle_parking':
            props.append((PROPS.index('bike'), x, z))
        elif t.get('tourism') == 'artwork':
            props.append((PROPS.index('art'), x, z))
        elif t.get('emergency') == 'fire_hydrant':
            props.append((PROPS.index('hydrant'), x, z))
        k = poi_kind(t)
        if k:
            pois.append(dict(k=k, x=x, z=z, real=True))
    log(f'pois {len(pois)} props {len(props)} benches {len(benches_raw)}')

    # ---- storefronts + lean spots
    named = [e for e in edges if e['name'] and e['kind'] not in ('motorway', 'motorway_link')]
    named_lines = [e['line'] for e in named]
    for f in fws:
        if f['kind'] == 'pedestrian' and f.get('name'):
            named.append(dict(name=f['name'], line=f['line'], id=-1))
            named_lines.append(f['line'])
    ntree = STRtree(named_lines)
    storefronts, lean = stage_storefronts(ground_b, btree, pois, named, ntree, zone_at, surf, G2)
    benches = []
    alltree_lines = [e['line'] for e in edges] + [f['line'] for f in fws]
    atree = STRtree(alltree_lines)
    for x, z in benches_raw:
        k = atree.query_nearest(Point(x, z), max_distance=30)
        h = 0.0
        if len(k):
            qp = alltree_lines[int(k[0])].interpolate(alltree_lines[int(k[0])].project(Point(x, z)))
            h = math.atan2(qp.x - x, qp.y - z)
        benches.append(dict(x=x, z=z, heading=h))
    log(f'storefronts {len(storefronts)} ({sum(1 for s in storefronts if s["poi"])} from POIs), lean spots {len(lean)}, benches {len(benches)}')

    # ---- player spawn: Ocean Drive west sidewalk near 9th-10th St facing north along the strip
    tx, tz = ll(25.7800, -80.1307)
    best = None
    for pl in ped_lines:
        e = edges[pl['e']]
        if e['name'] != 'Ocean Drive':
            continue
        mp = pl['line'].interpolate(pl['line'].project(Point(tx, tz)))
        ep = e['line'].interpolate(e['line'].project(mp))
        if mp.x > ep.x:  # want the west (hotel) side
            continue
        d = mp.distance(Point(tx, tz))
        if best is None or d < best[0]:
            best = (d, mp, pl)
    if best:
        sp = best[1]
        spawn = (sp.x, CURB, sp.y)
    else:
        spawn = (tx, CURB, tz)
    spawnHeading = math.pi  # facing north (-Z) along Ocean Drive: deco hotels on the left, Lummus Park + beach on the right
    log('spawn', spawn, 'dist', best[0] if best else None)

    # ---- write everything
    write_outputs(locals())


def poi_kind(t):
    s, a, tr = t.get('shop'), t.get('amenity'), t.get('tourism')
    if s and s not in ('vacant', 'no', 'yes'):
        m = {'alcohol': 'liquor', 'wine': 'liquor', 'beverages': 'liquor', 'mobile_phone': 'electronics',
             'computer': 'electronics', 'hairdresser': 'salon', 'beauty': 'salon', 'cosmetics': 'beauty',
             'department_store': 'clothes', 'boutique': 'clothes', 'fashion_accessories': 'clothes', 'bag': 'clothes',
             'chemist': 'pharmacy', 'deli': 'convenience', 'kiosk': 'convenience', 'variety_store': 'convenience',
             'tobacco': 'smoke', 'e-cigarette': 'smoke', 'swimwear': 'clothes', 'perfumery': 'beauty', 'tattoo': 'tattoo'}
        return m.get(s, s)
    if a in ('restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'nightclub', 'ice_cream', 'bank', 'pharmacy', 'fuel',
             'cinema', 'theatre', 'car_rental', 'bureau_de_change', 'stripclub', 'casino', 'dentist', 'clinic'):
        return 'bar' if a == 'pub' else a
    if tr in ('hotel', 'hostel', 'motel', 'guest_house'):
        return 'hotel'
    if t.get('leisure') == 'fitness_centre':
        return 'gym'
    return None


DEFAULT_KINDS = {
    'nightlife': ['bar', 'restaurant', 'cafe', 'clothes', 'gift', 'nightclub', 'ice_cream', 'convenience', 'liquor'],
    'beach': ['cafe', 'gift', 'ice_cream', 'convenience', 'restaurant'],
    'downtown': ['cafe', 'convenience', 'pharmacy', 'bank', 'clothes', 'restaurant', 'fast_food', 'electronics', 'jewelry'],
    'business': ['cafe', 'restaurant', 'bank', 'pharmacy', 'convenience', 'clothes', 'fast_food'],
    'commercial': ['convenience', 'restaurant', 'fast_food', 'clothes', 'liquor', 'salon', 'pharmacy', 'hardware'],
}


def stage_buildings(zone_at):
    out = []
    parts = []
    els = load('buildings')
    B = box(X0, Z0, X1, Z1)
    for e in els:
        t = e.get('tags', {})
        g = elem_poly(e)
        if g is None or g.area < 6:
            continue
        rp = g.representative_point()
        if not B.contains(rp):
            continue
        rec = dict(t=t, geom=g, part='building:part' in t and 'building' not in t)
        (parts if rec['part'] else out).append(rec)
    ptree = STRtree([p['geom'] for p in parts]) if parts else None
    res = []

    def heights(t, g, zn, default_type):
        h = parse_len(t.get('height')) or parse_len(t.get('building:height'))
        lv = None
        try:
            lv = float(str(t.get('building:levels')).split(';')[0]) if t.get('building:levels') else None
        except ValueError:
            lv = None
        mh = parse_len(t.get('min_height')) or 0.0
        if not mh and t.get('building:min_level'):
            try:
                mh = float(t['building:min_level']) * 3.2
            except ValueError:
                pass
        src = 'tag'
        if not h and lv:
            h = lv * 3.2 + (1.0 if lv <= 3 else 2.0)
            src = 'levels'
        if not h:
            h = default_height(default_type, zn, g.area, g)
            src = 'default'
        h = min(h, 400)
        if h < mh + 2:
            h = mh + 2.5
        return round(h, 1), round(mh, 1), lv, src

    for p in parts:
        t = p['t']
        rp = p['geom'].representative_point()
        zn = zone_at(rp.x, rp.y)
        h, mh, lv, src = heights(t, p['geom'], ZONES[zn], t.get('building:part', 'yes'))
        p.update(h=h, mh=mh, lv=lv, src=src, zn=zn)
    for b in out:
        t = b['t']
        g = b['geom']
        rp = g.representative_point()
        zn = zone_at(rp.x, rp.y)
        typ = t.get('building', 'yes')
        h, mh, lv, src = heights(t, g, ZONES[zn], typ)
        if typ == 'roof' and not t.get('min_height'):
            mh = max(0.0, h - 0.8)
        cover = 0.0
        maxp = 0.0
        if ptree is not None:
            for k in ptree.query(g):
                pg = parts[k]['geom']
                if g.contains(pg.representative_point()):
                    try:
                        cover += pg.intersection(g).area
                    except Exception:  # noqa: BLE001
                        pass
                    maxp = max(maxp, parts[k]['h'])
                    parts[k]['owner'] = b
        if src == 'default' and maxp:
            h = maxp
        b.update(h=h, mh=mh, lv=lv, src=src, zn=zn, typ=typ, partsCover=cover / g.area)
    for b in out:
        if b['partsCover'] >= 0.7:
            continue  # rendered by its parts
        res.append(mk_building(b, b['typ']))
    for p in parts:
        typ = p['owner']['typ'] if p.get('owner') else 'yes'
        if p.get('owner') and p['owner']['partsCover'] < 0.7:
            continue  # outline already rendered; skip parts to avoid z-fighting
        res.append(mk_building(p, typ, part=True))
    for i, b in enumerate(res):
        b['id'] = i
    return res


def mk_building(b, typ, part=False):
    t = b['t']
    g = b['geom']
    gs = g.simplify(0.3, preserve_topology=True)
    if gs.is_empty or gs.geom_type != 'Polygon':
        ps = polys_only(gs) or polys_only(g)
        gs = max(ps, key=lambda p: p.area)
    gs = orient(gs, 1.0)
    h = b['h']
    zn = ZONES[b['zn']]
    if typ in ('house', 'detached', 'semidetached_house', 'bungalow', 'residential') and h < 12:
        st = 'house'
    elif h >= 45:
        st = 'tower'
    elif zn in ('nightlife', 'beach') and h <= 24:
        st = 'deco'
    elif typ in ('roof', 'carport'):
        st = 'canopy'
    elif typ in ('parking',):
        st = 'garage'
    elif typ in ('industrial', 'warehouse', 'cruise_terminal', 'hangar', 'service', 'shed', 'garages', 'garage'):
        st = 'industrial'
    elif h >= 20:
        st = 'midrise'
    else:
        st = 'lowrise'
    return dict(geom=gs, h=h, mh=b['mh'], lv=b['lv'], typ=typ, zn=b['zn'], st=st, part=part, src=b['src'],
                col=t.get('building:colour') or t.get('colour'), rcol=t.get('roof:colour'),
                rs=t.get('roof:shape'), area=gs.area)


def default_height(typ, zn, area, g):
    r = 0.85 + 0.3 * hsh(round(g.centroid.x, 1), round(g.centroid.y, 1))
    big = area > 1500
    T = {'house': 6.5, 'detached': 6.5, 'semidetached_house': 6.5, 'bungalow': 5, 'garage': 3, 'garages': 3,
         'shed': 3, 'carport': 3, 'hut': 3, 'roof': 4.5, 'lifeguard_tower': 3.5, 'kiosk': 3.5, 'toilets': 3.5,
         'church': 12, 'school': 10, 'university': 14, 'public': 10, 'civic': 10, 'government': 12,
         'industrial': 9, 'warehouse': 9, 'service': 4, 'cruise_terminal': 16, 'train_station': 9,
         'transportation': 8, 'parking': 14 if not big else 20, 'museum': 14, 'stadium': 25}
    if typ in T:
        return T[typ] * r
    if typ == 'apartments':
        return (45 if big else 28) * r if zn in ('downtown', 'business') else (14 if zn in ('nightlife', 'beach') else 12) * r
    if typ in ('commercial', 'retail', 'office', 'hotel', 'construction'):
        if zn in ('downtown', 'business'):
            return (50 if big else 24) * r
        if typ == 'hotel':
            return 16 * r
        return 8 * r
    if zn in ('downtown', 'business'):
        return (55 if area > 2500 else 30 if area > 800 else 12) * r
    if zn in ('nightlife', 'beach'):
        return (14 if area > 800 else 10) * r
    if zn == 'commercial':
        return 8 * r
    if zn in ('port', 'industrial'):
        return 11 * r
    if zn == 'residential':
        return (15 if area > 900 else 6.5) * r
    return 6 * r


def stage_storefronts(ground_b, btree, pois, named, ntree, zone_at, surf, G2):
    COM = {'commercial', 'retail', 'hotel', 'office', 'supermarket', 'kiosk', 'mixed', 'mixed_use'}
    bpois = defaultdict(list)
    for pi, p in enumerate(pois):
        for k in btree.query(Point(p['x'], p['z']).buffer(2.0)):
            if ground_b[k]['geom'].distance(Point(p['x'], p['z'])) < 2.0:
                bpois[int(k)].append(pi)
                break
    stores, lean = [], []
    for bi, b in enumerate(ground_b):
        zn = ZONES[b['zn']]
        hasP = bi in bpois
        elig = hasP or b['typ'] in COM or (zn in ('nightlife', 'downtown', 'business', 'commercial') and
                                            b['typ'] in ('yes', 'apartments', 'hotel', 'office', 'commercial', 'retail') and b['area'] > 120)
        leanZone = zn in ('nightlife', 'downtown', 'business', 'commercial', 'beach')
        if (not elig and not leanZone) or b['h'] < 3 or b['st'] in ('canopy', 'house', 'garage', 'industrial'):
            continue
        g = b['geom']
        c = list(g.exterior.coords)
        facades = []
        for i in range(len(c) - 1):
            (x0, z0), (x1, z1) = c[i], c[i + 1]
            dx, dz = x1 - x0, z1 - z0
            Ls = math.hypot(dx, dz)
            if Ls < 6:
                continue
            nx, nz = dz / Ls, -dx / Ls
            mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
            probe = Point(mx + nx * 1.5, mz + nz * 1.5)
            if any(ground_b[k]['geom'].contains(probe) for k in btree.query(probe)):
                continue
            k = ntree.query_nearest(probe, max_distance=28)
            if not len(k):
                continue
            ne = named[int(k[0])]
            qp = ne['line'].interpolate(ne['line'].project(probe))
            vx, vz = qp.x - mx, qp.y - mz
            vd = math.hypot(vx, vz)
            if vd < 1e-3 or (vx * nx + vz * nz) / vd < 0.55:
                continue
            facades.append(dict(x0=x0, z0=z0, dx=dx / Ls, dz=dz / Ls, L=Ls, nx=nx, nz=nz, street=ne['name'], dist=vd))
        if not facades:
            continue
        used = []

        def place(f, s, kind, real):
            # s = distance along facade of the shop centre
            for w in (9.0, 7.0, 5.5):
                if w > f['L'] - 0.6:
                    continue
                s_ = min(max(s, w / 2 + 0.3), f['L'] - w / 2 - 0.3)
                fx, fz = f['x0'] + f['dx'] * s_, f['z0'] + f['dz'] * s_
                if any(math.hypot(fx - u[0], fz - u[1]) < (w + u[2]) / 2 + 0.8 for u in used):
                    continue
                for d in (10.0, 8.0, 6.0, 4.5):
                    corners = [(fx + f['dx'] * w / 2 * a - f['nx'] * d * bb, fz + f['dz'] * w / 2 * a - f['nz'] * d * bb)
                               for a, bb in ((-1, 0.02), (1, 0.02), (1, 1), (-1, 1))]
                    if all(g.buffer(0.25).contains(Point(cx, cz)) for cx, cz in corners):
                        used.append((fx, fz, w))
                        stores.append(dict(x=fx - f['nx'] * d / 2, z=fz - f['nz'] * d / 2, y=0.0, w=w, d=d,
                                           facing=math.atan2(f['nx'], f['nz']), fx=fx, fz=fz, kind=kind, poi=real,
                                           buildingId=b['id'], street=f['street'], zone=zn))
                        return True
            return False

        if elig:
            for pi in bpois.get(bi, [])[:4]:
                p = pois[pi]
                best = min(facades, key=lambda f: abs((p['x'] - f['x0']) * f['nx'] + (p['z'] - f['z0']) * f['nz']))
                s = (p['x'] - best['x0']) * best['dx'] + (p['z'] - best['z0']) * best['dz']
                place(best, s, p['k'], True)
            if bi not in bpois:
                lst = DEFAULT_KINDS.get(zn, DEFAULT_KINDS['commercial'])
                nmax = 1 if b['area'] < 400 else 2 if b['area'] < 2000 else 3
                n = 0
                for f in sorted(facades, key=lambda f: (f['dist'], -f['L'])):
                    if n >= nmax:
                        break
                    kinds = int(hsh(b['id'], n, 'k') * len(lst))
                    if place(f, f['L'] / 2, lst[kinds], False):
                        n += 1
                    if f['L'] > 22 and n < nmax and place(f, f['L'] * 0.2, lst[(kinds + 3) % len(lst)], False):
                        n += 1
        if leanZone:
            for f in facades:
                s = 3.0
                while s < f['L'] - 2.5:
                    fx, fz = f['x0'] + f['dx'] * s, f['z0'] + f['dz'] * s
                    px, pz = fx + f['nx'] * 0.45, fz + f['nz'] * 0.45
                    if not any(math.hypot(fx - u[0], fz - u[1]) < u[2] / 2 + 1.5 for u in used):
                        i, j = G2.cell(fx + f['nx'] * 2.2, fz + f['nz'] * 2.2)
                        if surf is None or int(surf[j, i]) in (S['sidewalk'], S['concrete'], S['pavers'], S['tile']):
                            lean.append(dict(x=px, z=pz, heading=math.atan2(f['nx'], f['nz'])))
                    s += 11.0
    # dedupe lean spots near each other
    return stores, lean


# ---------------------------------------------------------------- output
KEEP = ('land', 'areas', 'nodes', 'edges', 'fws', 'piers', 'dlab', 'dnames', 'zlab', 'bl', 'sw_polys', 'ped_lines',
        'surf', 'depth_dm', 'pois', 'props', 'storefronts', 'lean', 'benches', 'spawn', 'spawnHeading', 'carriage', 'L')


def write_outputs(V):
    d = {k: V[k] for k in KEEP}
    for e in d['edges']:
        e.pop('line', None)
    with open(os.path.join(WORK, 'v.pkl'), 'wb') as f:
        pickle.dump(d, f)
    log('saved work/v.pkl')
    import output
    output.run(d)


if __name__ == '__main__':
    main()
