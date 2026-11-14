"""District (neighborhood) raster for the merged world, 8 m cells.

Real Miami: real neighborhood names, from OSM polygons where they exist (Overtown, Wynwood, Brickell, the named
islands), from the land components (islands), and otherwise from the real dividing streets, highways and the river.
Synthetic regions: nearest `places` entry of the world layout (names are the world-layout track's own).
"""
import numpy as np
from shapely.geometry import Point, box
from shapely.ops import unary_union
from config import LAT0, LON0, REAL_RECT, proj
from osmgeom import load, elem_poly, polys_only
from raster import Grid, label_fill, X0, Z0

UNK = 255


def ll(lat, lon):
    return proj(lon, lat)


def X(lon):
    return proj(lon, LAT0)[0]


def Zc(lat):
    return proj(LON0, lat)[1]


def stage_districts(land, land_real, edges, ww_lines, synth=None):
    """-> G8, lab (uint8 ids), names, landMask, corridor mask. `land` is the merged world land,
    `land_real` the OSM land inside the real rectangle."""
    G = Grid(8)
    names = []

    def did(n):
        if n not in names:
            names.append(n)
        return names.index(n)

    landM = G.mask(land)
    lab = np.full((G.H, G.W), UNK, np.uint8)
    xs = X0 + (np.arange(G.W) + 0.5) * G.res
    zs = Z0 + (np.arange(G.H) + 0.5) * G.res
    XX, ZZ = np.meshgrid(xs, zs)
    rx0, rz0, rx1, rz1 = REAL_RECT
    inReal = (XX >= rx0) & (XX < rx1) & (ZZ >= rz0) & (ZZ < rz1)

    # ------------------------------------------------------------ real water names
    bay = did('Biscayne Bay')
    atl = did('Atlantic Ocean')
    lab[~landM & inReal] = bay
    # Atlantic: east of the easternmost barrier land on each row (Miami Beach, Fisher Island, Virginia Key)
    xcut = X(-80.160)
    for j in range(G.H):
        if not (rz0 <= zs[j] < rz1):
            continue
        cols = np.flatnonzero(landM[j] & (xs > xcut) & (xs < rx1))
        e = cols.max() + 1 if cols.size else int((X(-80.135) - X0) / G.res)
        m = ~landM[j, e:] & inReal[j, e:]
        lab[j, e:][m] = atl
    for name, line in ww_lines:
        if name in ('Atlantic Intracoastal Waterway',) or not name:
            continue
        r = 70 if name in ('Miami River', 'Collins Canal', 'Indian Creek', 'Wagner Creek', 'Seybold Canal', 'Tamiami Canal') else 100
        m = G.mask(line.buffer(r)) & ~landM & inReal
        if name in ('Government Cut', 'Main Channel', "Fisherman's Channel", 'Dodge Island Cut', 'Norris Cut', 'Meloy Channel'):
            m &= lab != atl
        lab[m] = did(name)

    # ------------------------------------------------------------ real land: components
    comps = [c for c in polys_only(land_real) if c.area > 30]
    known = {
        'mainland': ll(25.7745, -80.2000), 'Watson Island': ll(25.7849, -80.1757), 'PortMiami': ll(25.7741, -80.1661),
        'Fisher Island': ll(25.7609, -80.1406), 'Brickell Key': ll(25.7673, -80.1850), 'Miami Beach': ll(25.7850, -80.1320),
        'Virginia Key': ll(25.7490, -80.1500),
    }
    compName = {}
    for nm, (x, z) in known.items():
        for k, c in enumerate(comps):
            if c.contains(Point(x, z)):
                compName[k] = nm
    lm = landM & inReal
    dd = {}
    for e in load('districts'):
        n = e.get('tags', {}).get('name')
        if n:
            dd[n] = e

    def osm_mask(n):
        if n in dd:
            p = elem_poly(dd[n])
            if p is not None:
                return G.mask(p) & lm
        return None

    for k, c in enumerate(comps):
        nm = compName.get(k)
        if nm is None or nm in ('Miami Beach', 'mainland'):
            continue
        m = G.mask(c)
        if nm == 'Watson Island':
            xc = X(-80.1728)
            lab[m & (XX <= xc)] = did('Watson Island')
            lab[m & (XX > xc)] = did('MacArthur Causeway')
        else:
            lab[m] = did(nm)

    # ------------------------------------------------------------ mainland neighborhoods (real dividing lines)
    main = np.zeros_like(lm)
    for k, c in enumerate(comps):
        if compName.get(k) == 'mainland':
            main |= G.mask(c)
    main &= lm
    # every other large unnamed component west of the bay belongs to the mainland too (cut off by the river or canals)
    for k, c in enumerate(comps):
        if compName.get(k) is None and c.representative_point().x < X(-80.1830) and c.area > 4000:
            main |= G.mask(c) & lm
            compName[k] = 'mainland'
    river = next((ln for n, ln in ww_lines if n == 'Miami River'), None)
    # south of the river = below the river line at this x (the river runs roughly NW -> SE)
    if river is not None:
        rc = sorted(river.coords)
        rxs = np.array([c[0] for c in rc])
        rzs = np.array([c[1] for c in rc])
        order = np.argsort(rxs)
        rz_at = np.interp(XX[0], rxs[order], rzs[order], left=rzs[order][0], right=rzs[order][-1])
        south = ZZ > rz_at[None, :]
    else:
        south = ZZ > Zc(25.7700)
    i95n, i95s = X(-80.2050), X(-80.2005)          # I-95 north / south of the river
    fec = X(-80.1940)                               # FEC railway / NE 1st Ave corridor
    bisc = X(-80.1893)                              # Biscayne Boulevard
    nmia = X(-80.1953)                              # North Miami Avenue
    z5st, z395, z14, z20, z29, z36 = Zc(25.7790), Zc(25.7875), Zc(25.7885), Zc(25.7955), Zc(25.8040), Zc(25.8106)
    z836 = Zc(25.7838)
    zA, zE = Zc(25.7875), Zc(25.7945)
    N = ~south
    lab[main & N & (ZZ > zA)] = did('Downtown')
    lab[main & N & (ZZ <= zA) & (ZZ > zE)] = did('Arts & Entertainment District')
    lab[main & N & (ZZ <= zE)] = did('Edgewater')
    lab[main & N & (ZZ <= z29) & (ZZ > z36) & (XX < bisc) & (XX >= nmia)] = did('Midtown')
    lab[main & N & (ZZ <= z20) & (ZZ > z29) & (XX < fec) & (XX >= i95n)] = did('Wynwood')
    lab[main & N & (ZZ <= z29) & (ZZ > z36) & (XX < nmia) & (XX >= i95n)] = did('Wynwood')
    lab[main & N & (ZZ <= z36) & (XX < X(-80.1885)) & (XX >= nmia)] = did('Design District')
    lab[main & N & (ZZ <= z36) & (XX < nmia) & (XX >= i95n)] = did('Buena Vista')
    lab[main & N & (ZZ <= z5st) & (ZZ > z20) & (XX < fec) & (XX >= i95n)] = did('Overtown')
    lab[main & N & (ZZ <= z395) & (ZZ > z20) & (XX < nmia) & (XX >= i95n)] = did('Overtown')
    lab[main & N & (XX < i95n) & (ZZ > z836)] = did('Spring Garden')
    lab[main & N & (XX < i95n) & (ZZ <= z836) & (ZZ > z20)] = did('Health District')
    lab[main & N & (XX < i95n) & (ZZ <= z20)] = did('Allapattah')
    lab[main & N & (XX < i95n) & (XX < X(-80.2085)) & (ZZ > z5st)] = did('Little Havana')   # river bend: west bank strip
    for n in ('Wynwood', 'Overtown'):
        m = osm_mask(n)
        if m is not None and m.any():
            lab[m & main & N] = did(n)
    # south of the river
    S = south
    lab[main & S] = did('Brickell')
    z11, zcw = Zc(25.7640), Zc(25.7505)
    lab[main & S & (XX < i95s) & (ZZ <= z11)] = did('Little Havana')
    lab[main & S & (XX < i95s) & (ZZ > z11)] = did('The Roads')
    # Coral Way (SW 22nd St / SW 3rd Ave) is the diagonal south edge of The Roads; below it, the bayside hammock
    cw = [e for e in edges if e.get('name') in ('Southwest 3rd Avenue', 'Coral Way', 'Southwest 22nd Street')]
    if cw:
        from shapely.geometry import LineString
        cwl = unary_union([LineString(e['pts']) for e in cw])
        pts_ = sorted([c for g in (cwl.geoms if hasattr(cwl, 'geoms') else [cwl]) for c in g.coords])
        cx = np.array([p[0] for p in pts_])
        cz = np.array([p[1] for p in pts_])
        keep = cx < i95s + 300
        if keep.sum() >= 2:
            o = np.argsort(cx[keep])
            cz_at = np.interp(XX[0], cx[keep][o], cz[keep][o], left=cz[keep][o][0], right=cz[keep][o][-1])
            lab[main & S & (XX < i95s + 200) & (ZZ > cz_at[None, :] + 20) & (ZZ > z11)] = did('Brickell Hammock')
    m = osm_mask('Brickell')
    if m is not None and m.any():
        lab[m & main & S] = did('Brickell')

    # ------------------------------------------------------------ Miami Beach
    mbm = np.zeros_like(lm)
    for k, c in enumerate(comps):
        if compName.get(k) == 'Miami Beach':
            mbm |= G.mask(c)
    mbo = osm_mask('Miami Beach')
    if mbo is not None:
        # city limits also cover the Venetian / Sunset islands; only unnamed components join the beach here
        for k, c in enumerate(comps):
            if compName.get(k) is None and c.representative_point().x > X(-80.1480) and c.representative_point().y < Zc(25.7700):
                cm = G.mask(c)
                if (cm & mbo).sum() > 0.5 * cm.sum():
                    mbm |= cm
                    compName[k] = 'Miami Beach'
    mbm &= lm
    z5, zD, z24, zC = Zc(25.7737), Zc(25.7935), Zc(25.8000), Zc(25.7985)
    lab[mbm & (ZZ > z5)] = did('South of Fifth')
    lab[mbm & (ZZ <= z5) & (ZZ > zD)] = did('South Beach')
    lab[mbm & (ZZ <= zD)] = did('Bayshore')
    lab[mbm & (ZZ <= zD) & (ZZ > zC) & (XX > X(-80.1345))] = did('Collins Park')
    lab[mbm & (ZZ <= zC) & (XX > X(-80.1290))] = did('Mid-Beach')
    lab[mbm & (ZZ <= z24) & (XX > X(-80.1255))] = did('Mid-Beach')
    # Sunset Islands (fingers north of the Venetian Causeway, west of Alton Road)
    sx0, sz0 = ll(25.7965, -80.1510)
    sx1, sz1 = ll(25.8090, -80.1395)
    for k, c in enumerate(comps):
        rp = c.representative_point()
        if compName.get(k) in (None,) and sx0 < rp.x < sx1 and sz1 < rp.y < sz0:
            lab[G.mask(c) & lm] = did('Sunset Islands')
            compName[k] = 'Sunset Islands'
    # named islands (OSM polygons override)
    for e in load('districts'):
        t = e.get('tags', {})
        if t.get('place') in ('island', 'islet') and t.get('name'):
            p = elem_poly(e)
            if p is not None:
                lab[G.mask(p) & lm] = did(t['name'])
    # causeway corridors (water under and unnamed land strips along them)
    corridor_names = {'MacArthur Causeway': 'MacArthur Causeway', 'Venetian Way': 'Venetian Causeway',
                      'Venetian Causeway': 'Venetian Causeway', 'Port Boulevard': 'Port Boulevard',
                      'Rickenbacker Causeway': 'Rickenbacker Causeway', 'Julia Tuttle Causeway': 'Julia Tuttle Causeway'}
    from collections import defaultdict
    from shapely.geometry import LineString
    corr = defaultdict(list)
    for e in edges:
        nm = e.get('name')
        if nm in corridor_names:
            corr[corridor_names[nm]].append(LineString(e['pts']))
        elif e.get('ref') == 'I-195' and e['pts'][0][0] > X(-80.1870) and not e.get('synthetic'):
            corr['Julia Tuttle Causeway'].append(LineString(e['pts']))
    corrM = np.zeros_like(landM)
    for nm, lines in corr.items():
        m = G.mask(unary_union(lines).buffer(24)) & inReal
        corrM |= m
        lab[m & ~landM] = did(nm)
    for k, c in enumerate(comps):
        if compName.get(k):
            continue
        cm = G.mask(c) & lm
        if not cm.any():
            continue
        if (lab[cm] != UNK).mean() > 0.5:
            continue
        hit = None
        for nm, lines in corr.items():
            if any(c.distance(l) < 25 for l in lines):
                hit = nm
                break
        if hit:
            lab[cm & (lab == UNK)] = did(hit)
        elif c.area < 60000:
            lab[cm & (lab == UNK)] = did('Biscayne Bay Islands')

    # ------------------------------------------------------------ synthetic regions
    if synth is not None:
        out = ~inReal
        def on_land(p):
            i, j = G.cell(p['x'], p['z'])
            return bool(landM[j, i])
        allp = [p for p in synth.get('places', []) if p.get('name')]
        # a place whose point sits on water names the water around it (bays, sounds, inlets); the rest name land
        places = [p for p in allp if on_land(p) or p.get('kind') in ('town', 'district', 'key', 'island', 'park', 'airport')]
        # named inland water bodies keep their own name
        for w in synth.get('water_polys', []):
            if w.get('name'):
                lab[G.mask(w['geom']) & out] = did(w['name'])
        # land: the smallest-radius place whose circle covers the cell wins; leftovers take the nearest place
        landOut = landM & out
        bestR = np.full(lab.shape, 1e9, np.float32)
        for p in sorted(places, key=lambda p: -float(p.get('r', 500))):
            if p.get('kind') in ('lake',):
                continue
            r = float(p.get('r', 500))
            d2 = (XX - p['x']) ** 2 + (ZZ - p['z']) ** 2
            m = (d2 <= r * r) & landOut & (r < bestR)
            lab[m] = did(p['name'])
            bestR[m] = r
        rest = landOut & (lab == UNK)
        if rest.any() and places:
            bestD = np.full(lab.shape, 1e18, np.float32)
            for p in places:
                if p.get('kind') in ('lake', 'beach'):
                    continue
                d2 = ((XX - p['x']) ** 2 + (ZZ - p['z']) ** 2) / max(1.0, float(p.get('r', 500))) ** 2
                m = rest & (d2 < bestD)
                lab[m] = did(p['name'])
                bestD[m] = d2[m]
        # open water outside the real rectangle: named sea areas from the layout, else the two real ones continue
        seaP = [p for p in allp if p not in places and p.get('kind') != 'lake']
        wOut = ~landM & out & (lab == UNK)
        if seaP:
            bestD = np.full(lab.shape, 1e18, np.float32)
            for p in seaP:
                d2 = ((XX - p['x']) ** 2 + (ZZ - p['z']) ** 2) / max(1.0, float(p.get('r', 1500))) ** 2
                m = wOut & (d2 < bestD) & (d2 <= 2.25)
                lab[m] = did(p['name'])
                bestD[m] = d2[m]
    # open water nobody named (outside the real rectangle) is ocean; land leftovers take the nearest label
    lab[(lab == UNK) & ~landM & ~inReal] = atl
    lab = label_fill(lab, UNK, steps=600)
    lab[lab == UNK] = atl
    return G, lab, names, landM, corrM
