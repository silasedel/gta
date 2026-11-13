"""PNG previews + stats.md for docs/showcase/map (and visual validation)."""
import colorsys, hashlib, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import LineString
from osmgeom import polys_only
from raster import X0, Z0, X1, Z1
from build import SURF, ZONES, DOCS

S = 4.0  # metres per pixel -> ~2050 px wide
W, H = int((X1 - X0) / S), int((Z1 - Z0) / S)


def T(c):
    return [((x - X0) / S, (z - Z0) / S) for x, z in c]


def font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:
        return ImageFont.load_default()


def fill_poly(dr, g, col, hole=None):
    for p in polys_only(g):
        dr.polygon(T(p.exterior.coords), fill=col)
        for h in p.interiors:
            dr.polygon(T(h.coords), fill=hole)


def legend(dr, items, x=16, y=16, sz=22):
    f = font(sz)
    h = len(items) * (sz + 8) + 16
    dr.rectangle([x, y, x + 360, y + h], fill=(255, 255, 255, 215))
    for k, (name, col) in enumerate(items):
        yy = y + 10 + k * (sz + 8)
        dr.rectangle([x + 10, yy, x + 10 + sz, yy + sz], fill=col)
        dr.text((x + 20 + sz, yy - 2), name, fill=(20, 20, 20), font=f)


ROAD_COL = {'motorway': (232, 120, 90), 'trunk': (240, 160, 90), 'primary': (250, 200, 110), 'secondary': (250, 225, 140),
            'tertiary': (255, 255, 255), 'residential': (255, 255, 255), 'unclassified': (255, 255, 255),
            'living_street': (240, 240, 240), 'service': (225, 225, 225), 'road': (230, 230, 230)}


def overview(d):
    img = Image.new('RGB', (W, H), (88, 150, 196))
    dr = ImageDraw.Draw(img)
    fill_poly(dr, d['land'], (236, 230, 216), (88, 150, 196))
    C = {'park': (190, 222, 170), 'grass': (200, 228, 180), 'pitch': (170, 214, 160), 'wild': (170, 200, 150),
         'sand': (246, 228, 170), 'parking': (215, 212, 205), 'plaza': (228, 214, 200), 'dirt': (215, 200, 170),
         'marina': (210, 210, 215), 'pool': (130, 200, 235), 'playground': (200, 228, 190), 'island': (200, 225, 185)}
    for a in sorted(d['areas'], key=lambda a: -a['area']):
        if a['cls'] in C:
            fill_poly(dr, a['geom'], C[a['cls']])
    for p in d['sw_polys']:
        fill_poly(dr, p, (205, 202, 198))
    for e in sorted(d['edges'], key=lambda e: e['w']):
        if e['y'] is not None and max(e['y']) > 0.3:
            continue
        k = e['kind'].replace('_link', '')
        dr.line(T(e['pts']), fill=(150, 150, 150), width=max(1, int(e['w'] / S + 1.5)))
    for e in sorted(d['edges'], key=lambda e: e['w']):
        if e['y'] is not None and max(e['y']) > 0.3:
            continue
        k = e['kind'].replace('_link', '')
        dr.line(T(e['pts']), fill=ROAD_COL.get(k, (255, 255, 255)), width=max(1, int(e['w'] / S)))
    for p in d['piers']:
        fill_poly(dr, p['geom'], (160, 120, 80) if p['kind'] == 'pier' else (150, 150, 150))
    for b in sorted(d['bl'], key=lambda b: b['h']):
        t = min(1.0, math.log1p(b['h']) / math.log1p(250))
        c = int(200 - 150 * t)
        fill_poly(dr, b['geom'], (c, c - 6, c - 14))
    # elevated roads on top
    for e in d['edges']:
        if e['y'] is None or max(e['y']) <= 0.3:
            continue
        dr.line(T(e['pts']), fill=(90, 90, 100), width=max(2, int(e['w'] / S + 2)))
        dr.line(T(e['pts']), fill=(255, 190, 90), width=max(1, int(e['w'] / S)))
    sx, _, sz = d['spawn']
    px, pz = (sx - X0) / S, (sz - Z0) / S
    dr.ellipse([px - 9, pz - 9, px + 9, pz + 9], outline=(220, 20, 60), width=4)
    dr.text((px + 12, pz - 12), 'spawn', fill=(220, 20, 60), font=font(22))
    return img


def zones(d):
    pal = {'water': (80, 140, 190), 'beach': (245, 225, 150), 'nightlife': (230, 70, 160), 'downtown': (70, 70, 160),
           'business': (110, 110, 230), 'residential': (210, 190, 160), 'commercial': (240, 150, 80), 'park': (110, 190, 100),
           'port': (130, 110, 100), 'causeway': (180, 180, 180), 'industrial': (150, 120, 150)}
    z = d['zlab']
    rgb = np.zeros(z.shape + (3,), np.uint8)
    for i, n in enumerate(ZONES):
        rgb[z == i] = pal[n]
    img = Image.fromarray(rgb).resize((W, H), Image.NEAREST)
    dr = ImageDraw.Draw(img, 'RGBA')
    legend(dr, [(n, pal[n]) for n in ZONES])
    return img


def dcol(name):
    h = int(hashlib.md5(name.encode()).hexdigest()[:6], 16) / 0xFFFFFF
    r, g, b = colorsys.hsv_to_rgb(h, 0.45, 0.92)
    return int(r * 255), int(g * 255), int(b * 255)


def districts(d):
    lab = d['dlab']
    rgb = np.zeros(lab.shape + (3,), np.uint8)
    for i, n in enumerate(d['dnames']):
        rgb[lab == i] = dcol(n)
    img = Image.fromarray(rgb).resize((W, H), Image.NEAREST)
    dr = ImageDraw.Draw(img, 'RGBA')
    f = font(24)
    for i, n in enumerate(d['dnames']):
        jj, ii = np.nonzero(lab == i)
        if len(ii) < 30:
            continue
        cx, cz = (ii.mean() + 0.5) * 8 / S, (jj.mean() + 0.5) * 8 / S
        tw = dr.textlength(n, font=f)
        dr.rectangle([cx - tw / 2 - 4, cz - 14, cx + tw / 2 + 4, cz + 16], fill=(255, 255, 255, 190))
        dr.text((cx - tw / 2, cz - 13), n, fill=(20, 20, 20), font=f)
    return img


def heights(d):
    img = Image.new('RGB', (W, H), (18, 22, 30))
    dr = ImageDraw.Draw(img, 'RGBA')
    fill_poly(dr, d['land'], (44, 48, 56), (18, 22, 30))
    for e in d['edges']:
        dr.line(T(e['pts']), fill=(70, 74, 84), width=max(1, int(e['w'] / S)))
    for b in sorted(d['bl'], key=lambda b: b['h']):
        t = min(1.0, b['h'] / 200.0) ** 0.6
        r, g, bb = colorsys.hsv_to_rgb(0.62 - 0.62 * t, 0.85, 0.55 + 0.45 * t)
        fill_poly(dr, b['geom'], (int(r * 255), int(g * 255), int(bb * 255)))
    legend(dr, [(f'{h} m', tuple(int(c * 255) for c in colorsys.hsv_to_rgb(0.62 - 0.62 * min(1, h / 200) ** 0.6, 0.85,
                                                                          0.55 + 0.45 * min(1, h / 200) ** 0.6)))
                for h in (5, 15, 30, 60, 120, 200)])
    return img


def surfaces(d):
    pal = [(80, 140, 190), (70, 70, 75), (190, 190, 185), (200, 150, 120), (230, 230, 240), (245, 225, 150),
           (120, 190, 90), (90, 140, 60), (150, 110, 70), (160, 160, 150), (170, 120, 70), (120, 130, 150),
           (225, 222, 215), (190, 140, 90), (120, 100, 110)]
    s = d['surf']
    rgb = np.zeros(s.shape + (3,), np.uint8)
    for i in range(len(SURF)):
        rgb[s == i] = pal[i]
    img = Image.fromarray(rgb).resize((W, H), Image.BOX)
    dr = ImageDraw.Draw(img, 'RGBA')
    legend(dr, [(n, pal[i]) for i, n in enumerate(SURF)], sz=18)
    return img


def elevation(d):
    img = Image.new('RGB', (W, H), (240, 240, 236))
    dr = ImageDraw.Draw(img)
    fill_poly(dr, d['land'], (220, 216, 206), (180, 205, 225))
    for e in d['edges']:
        dr.line(T(e['pts']), fill=(160, 160, 160), width=max(1, int(e['w'] / S)))
    for e in d['edges']:
        if e['y'] is None:
            continue
        c = e['pts']
        for k in range(len(c) - 1):
            t = min(1, (e['y'][k] + e['y'][k + 1]) / 2 / 14)
            r, g, b = colorsys.hsv_to_rgb(0.66 - 0.66 * t, 0.9, 0.95)
            dr.line(T(c[k:k + 2]), fill=(int(r * 255), int(g * 255), int(b * 255)), width=max(2, int(e['w'] / S)))
    legend(dr, [(f'deck {h} m', tuple(int(v * 255) for v in colorsys.hsv_to_rgb(0.66 - 0.66 * min(1, h / 14), 0.9, 0.95)))
                for h in (1, 4, 8, 12, 14)])
    return img


def run(d, sizes, man):
    os.makedirs(DOCS, exist_ok=True)
    out = {}
    for name, fn in (('overview', overview), ('zones', zones), ('districts', districts), ('heights', heights),
                     ('surfaces', surfaces), ('bridges', elevation)):
        img = fn(d)
        p = os.path.join(DOCS, f'miami_{name}.png')
        img.save(p, optimize=True)
        out[name] = p
    # stats
    edges = d['edges']
    km = sum(LineString(e['pts']).length for e in edges) / 1000
    lane_km = sum(LineString(e['pts']).length * (e['lf'] + e['lb']) for e in edges) / 1000
    deg = {}
    for e in edges:
        for n in (e['a'], e['b']):
            deg[n] = deg.get(n, 0) + 1
    inter = sum(1 for v in deg.values() if v >= 3)
    tall = sorted(d['bl'], key=lambda b: -b['h'])[:5]
    b = man['bounds']
    wkm, hkm = (b['maxX'] - b['minX']) / 1000, (b['maxZ'] - b['minZ']) / 1000
    elev = [e for e in edges if e['y'] is not None]
    srcs = {}
    for bb in d['bl']:
        srcs[bb['src']] = srcs.get(bb['src'], 0) + 1
    lines = [
        '# Miami map data: stats', '',
        f'Generated {man["generated"]} from OpenStreetMap (© OpenStreetMap contributors, ODbL) by `tools/osm/build.py`.', '',
        '| Metric | Value |', '|---|---|',
        f'| Bounding box (lat/lon) | {man["bboxLatLon"]["south"]}..{man["bboxLatLon"]["north"]} N, {man["bboxLatLon"]["west"]}..{man["bboxLatLon"]["east"]} E |',
        f'| Play area | {wkm:.2f} km x {hkm:.2f} km ({wkm*hkm:.1f} km2) |',
        f'| Land area | {d["land"].area/1e6:.2f} km2 ({100*d["land"].area/1e6/(wkm*hkm):.0f}% of the area) |',
        f'| Buildings | {len(d["bl"]):,} (height from tag/levels/default: {srcs.get("tag",0):,} / {srcs.get("levels",0):,} / {srcs.get("default",0):,}) |',
        f'| Tallest buildings | {", ".join(f"{t["h"]:.0f} m" for t in tall)} |',
        f'| Drivable road graph | {len(edges):,} edges, {len(d["nodes"]):,} nodes, {inter:,} intersections |',
        f'| Total road length | {km:.1f} km centreline, {lane_km:.1f} lane-km |',
        f'| Elevated edges (bridges/ramps) | {len(elev)} (max deck {max((max(e["y"]) for e in elev), default=0):.1f} m) |',
        f'| Footpaths / cycleways | {len(d["fws"]):,} |',
        f'| Derived sidewalk lines | {len(d["ped_lines"]):,} ({sum(p["line"].length for p in d["ped_lines"])/1000:.0f} km) |',
        f'| Storefront lots | {len(d["storefronts"]):,} ({sum(1 for s in d["storefronts"] if s["poi"]):,} typed from OSM shop/amenity nodes) |',
        f'| Lean spots / benches | {len(d["lean"]):,} / {len(d["benches"]):,} |',
        f'| Street props (trees, palms, lamps, signals, ...) | {len(d["props"]):,} |',
        f'| Tiles (200 m) | {len(man["tiles"])} non-empty of {man["tilesX"]}x{man["tilesZ"]} |',
        f'| Districts | {len(d["dnames"])}: {", ".join(d["dnames"])} |',
        f'| Data size | {sum(sizes.values())/1e6:.1f} MB total (' + ', '.join(f'{k} {v/1e6:.2f} MB' for k, v in sizes.items()) + ') |',
        '', '## Previews', '',
    ]
    for k, p in out.items():
        lines.append(f'- `{os.path.basename(p)}`')
    with open(os.path.join(DOCS, 'stats.md'), 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('previews written to', DOCS)
