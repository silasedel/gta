"""r4-keys: fill the Key Largo grid layout (keys_detail.py GRID) with lived-in frontage, called by build_v3.py after the Keys
detail buildings are in.

- The divided Overseas Highway (keys_detail roads with fill='hw') gets the Keys roadside program on its outer side: gas station, strip
  mall, tiki bar, bait / dive / gift shops, seafood market, motel, restaurants (tools/world/wl/gen.py TEMPLATES / PROGRAMS['keys']),
  each with its own parking lot, pylon sign, palms and props.
- Collectors and cross streets (fill='lots') get house / stilt-house lots on both sides (gen.lot_house), bay-side houses near the water
  a dock straight out into the bay.
- Parks at the SW and N tips (keys_detail areas).
Everything goes through World.free (land, roads, water, reserved lots), so nothing lands on a street, in the water or in Nico's lot.
"""
import math
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import nearest_points


def fill(W, G, KEYS, KREG, log=print):
    if not KEYS.get('grid'):
        return 0
    # occupancy: the main map's lots / buildings inside the region were dropped from W.buildings but stay in the occupancy index (ghost
    # footprints that rejected 1083 of the grid's lots): retire every 'bldg' / 'site' entry there that is not a current building
    cur = {tuple(round(v, 1) for v in Polygon(b['ring']).bounds) for b in W.buildings if KREG.intersects(Polygon(b['ring']))}
    nghost = 0
    for i, (g, t, gb, d) in enumerate(W.idx.items):
        if t in ('bldg', 'site') and KREG.contains(g.centroid) and (t == 'site' or tuple(round(v, 1) for v in gb) not in cur):
            W.idx.items[i] = (g, 'gone', gb, d); nghost += 1
    log(f'keys grid fill: {nghost} ghost footprints retired')
    # occupancy: every road in / near the region (World.free looks for 'road' footprints; the network is not indexed for us)
    reg = KREG.buffer(60)
    for r in W.roads:
        ln = LineString(r.pts)
        if ln.intersects(reg): W.idx.add(ln.buffer(r.width / 2 + 2.2, cap_style=2), 'road')
    if KEYS.get('keysBar'):
        b = KEYS['keysBar']; c, s = math.cos(b['heading']), math.sin(b['heading'])
        W.reserve(Polygon([(b['x'] + x * c + z * s, b['z'] - x * s + z * c) for x, z in ((-25, -20), (25, -20), (25, 20), (-25, 20))]), 'reserved')
    for a in KEYS.get('areas', []):
        W.add_area(Polygon(a['ring']), a.get('kind', 'park'), a.get('name'), clip=False, block='reserved')
    nb0 = len(W.buildings)
    # the highway frontage comes in 60-90 m pieces between the cross streets: the Keys program without the big sites (strip malls stay
    # rare and only fit where a block is long), sites start right at the cross street's footprint (World.free keeps them off it)
    G.PROGRAMS['keys_hw'] = [(1.6, 'bait_shop'), (1.6, 'dive_shop'), (1.8, 'gift_shop'), (1.4, 'seafood_market'), (2.0, 'restaurant'), (1.3, 'gas'),
                             (1.4, 'tiki_bar'), (0.6, 'laundromat'), (0.6, 'bank'), (0.7, 'auto_repair'), (0.8, 'strip_mall'), (0.5, 'motel')]
    shops = G.poi_picker(G.KEYS_RETAIL, 'keys_grid')
    ctx_hw = dict(region='Key Largo', pick_poi=shops, palette=G.KEYS)
    stats = {'hw': 0, 'lots': 0}
    import collections, os as _os
    why = collections.Counter(); _free = W.free
    def _dbg_free(poly, tags=('bldg', 'road', 'water', 'reserved', 'site'), margin=0.0, need_land=True):
        ok = _free(poly, tags, margin, need_land)
        if not ok:
            if need_land and not W.on_land(poly): why['land'] += 1
            else:
                for g, t, d in W.idx.near(poly, tags, margin):
                    if (g.distance(poly) < margin) if margin > 0 else g.intersects(poly): why[t] += 1; break
        return ok
    if _os.environ.get('KEYS_FILL_DEBUG'): W.free = _dbg_free
    roads = [r for r in W.roads if r.tags.get('keysFill') and KREG.buffer(5).contains(LineString(r.pts))]
    log(f'keys grid fill: {len(roads)} frontage pieces, {sum(LineString(r.pts).length for r in roads):.0f} m')
    for r in roads:
        f = r.tags['keysFill']
        try:
            if f == 'hw':        # the carriageway's outer side is its right (right-hand traffic, the median is on its left)
                stats['hw'] += G.walk(W, r, 1, 'keys_hw', ctx_hw, seed=('keys_hw', r.id), fill=0.95, gap=(1.0, 6.0), s0=1.0, s1=max(2.0, LineString(r.pts).length - 1.0))
            elif f == 'lots':
                for side in (1, -1):
                    z = 'stilt' if (hash((round(r.pts[0][0]), side)) & 3) == 0 else 'house'
                    stats['lots'] += G.walk(W, r, side, z, dict(region='Key Largo', palette=G.KEYS, style='stilt' if z == 'stilt' else 'house', tin=True),
                                            seed=('keys_lots', r.id, side), fill=0.9, gap=(0.5, 3.0), s0=1.0, s1=max(2.0, LineString(r.pts).length - 1.0))
        except Exception as e:      # one bad frontage must not lose the whole island
            log(f'keys fill {f} {r.name}: {e}')
    if _os.environ.get('KEYS_FILL_DEBUG'): W.free = _free; log('keys fill rejections', dict(why))
    # docks: bay-side houses near the water get a dock straight out
    axis = LineString(KEYS['grid']['axis'])
    coast = W.land.intersection(KREG).buffer(0).boundary
    nd = 0
    for b in W.buildings[nb0:]:
        if b.get('kind') != 'house': continue
        pg = Polygon(b['ring']); c = pg.centroid
        if hash((round(c.x), round(c.y))) % 10 >= 6: continue
        sp = axis.interpolate(axis.project(c)); q = axis.interpolate(min(axis.length, axis.project(c) + 3))
        tx, tz = q.x - sp.x, q.y - sp.y; tl = math.hypot(tx, tz) or 1; rx, rz = -tz / tl, tx / tl
        if (c.x - sp.x) * rx + (c.y - sp.y) * rz < 0: continue          # bay = right of the axis (NE -> SW), the NW side
        cp = nearest_points(coast, c)[0]
        if cp.distance(c) > 34: continue
        ox, oz = cp.x - c.x, cp.y - c.y; ol = math.hypot(ox, oz) or 1; ox, oz = ox / ol, oz / ol
        Ld = 14 + (hash((round(c.x * 3), round(c.y * 3))) % 12)
        p0, p1 = (cp.x - ox * 2, cp.y - oz * 2), (cp.x + ox * Ld, cp.y + oz * Ld)
        if W.idx.hit(LineString([p0, p1]).buffer(1.5), ('road', 'bldg'), 0): continue
        W.path([p0, p1], 'pier', 2.2, 'wood', None, y=None); nd += 1
    log(f"keys grid fill: {len(W.buildings) - nb0} buildings (highway sites {stats['hw']}, lots {stats['lots']}), docks {nd}, parks {len(KEYS.get('areas', []))}")
    return len(W.buildings) - nb0
