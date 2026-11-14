"""Stage 1: coastline -> land polygons; inland water polygons. Writes cache/work/land.pkl."""
import os, pickle, sys, time
from shapely.geometry import LineString, Point
from shapely.ops import unary_union, polygonize, linemerge
from shapely import STRtree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from osmgeom import load, pts, elem_poly, world_box, polys_only, fix, CACHE  # noqa: E402
from config import FETCH_PAD_M  # noqa: E402

WORK = os.environ.get('MIAMI_WORK') or os.path.join(CACHE, 'work')

NON_SWIM = {'swimming_pool', 'fountain', 'reflecting_pool', 'wastewater', 'pool'}


def land_from_coast(B):
    """Coastline ways -> land MultiPolygon inside the shapely box B (OSM rule: land is on the left)."""
    t0 = time.time()
    coast = []
    for e in load('coastline'):
        c = pts(e['geometry'])
        if len(c) >= 2:
            coast.append(LineString(c))
    merged = linemerge(coast, directed=True)
    chains = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    print(f'coastline: {len(coast)} ways -> {len(chains)} chains; closed {sum(c.is_ring for c in chains)}')
    clipped = []
    for c in chains:
        g = c.intersection(B)
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if isinstance(p, LineString) and not p.is_empty:
                clipped.append(p)
    # left-hand probes (OSM: land on the left). In x-east/z-south frame, left normal of (dx,dz) is (dz,-dx).
    probesL, probesR = [], []
    for ln in clipped:
        c = list(ln.coords)
        for i in range(len(c) - 1):
            (x0, z0), (x1, z1) = c[i], c[i + 1]
            dx, dz = x1 - x0, z1 - z0
            L = (dx * dx + dz * dz) ** 0.5
            if L < 0.5:
                continue
            mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
            nx, nz = dz / L * 0.2, -dx / L * 0.2
            probesL.append(Point(mx + nx, mz + nz))
            probesR.append(Point(mx - nx, mz - nz))
    noded = unary_union(clipped + [B.exterior])
    faces = list(polygonize(noded))
    tl, tr = STRtree(probesL), STRtree(probesR)
    land = []
    for f in faces:
        nl = len(tl.query(f, predicate='contains'))
        nr = len(tr.query(f, predicate='contains'))
        if nl > nr:
            land.append(f)
    landU = unary_union(land)
    print(f'faces {len(faces)} land {len(land)} area {landU.area/1e6:.2f} km2 of {B.area/1e6:.2f} ({time.time()-t0:.1f}s)')
    return landU


def inland_water():
    water = []
    for e in load('areas'):
        t = e.get('tags', {})
        isw = (t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock', 'canal_area')
               or t.get('landuse') in ('reservoir', 'basin'))
        if not isw or t.get('water') in NON_SWIM or t.get('leisure') == 'swimming_pool' or t.get('amenity') == 'fountain':
            continue
        p = elem_poly(e)
        if p is None or p.area < 20:
            continue
        water.append((p, t.get('name'), t.get('water') or t.get('waterway') or 'water'))
    return water


def build_land(pad=None):
    """Land for the real rectangle padded by `pad` meters (default: config.FETCH_PAD_M - 50), so the merge with
    the synthetic world and the edge summary both see the real coast just beyond the rectangle."""
    if pad is None:
        pad = FETCH_PAD_M - 50.0
    B = world_box(pad)
    landU = land_from_coast(B)
    water = inland_water()
    W = unary_union([w[0] for w in water]).intersection(B) if water else None
    land2 = fix(landU.difference(W)) if W is not None else landU
    print(f'inland water polys {len(water)}; land after holes {land2.area/1e6:.2f} km2')
    os.makedirs(WORK, exist_ok=True)
    with open(os.path.join(WORK, 'land.pkl'), 'wb') as f:
        pickle.dump({'land': land2, 'landCoast': landU, 'water': water, 'pad': pad}, f)
    return land2


if __name__ == '__main__':
    build_land()
