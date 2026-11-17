#!/usr/bin/env python
"""Stage 1 map rebuild, step 2: trace every road of docs/v2/plan/map_roads_target.webp into a clean road graph.

Frame (the new map, CONVENTIONS): road-image pixel (px, py) -> world x = (px - OX) * S, z = (py - OY) * S, meters,
+X east, +Z south. S = 11 m per pixel (plan 2.1b: downtown streets ~9 px apart = ~100 m blocks; island ~9.8 x 14.5 km).

Pipeline: white-line mask -> skeleton -> pixel graph (junction clusters + edge chains) -> prune spurs / tiny loops ->
simplify (RDP) + light smoothing -> per-edge drawn width (distance transform) -> road class, lanes, speed ->
bridge flag where the colour map shows water under the road.
Writes tools/v2/map3/out/roads.json and roads_overlay.png (traced lines over the image for the overlay test).
Run: tools/world/.venv/bin/python tools/v2/map3/trace.py
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.morphology import skeletonize

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
S = 11.0
OX, OY = 700.0, 800.0                       # image pixel at world (0, 0): near downtown (best float precision there)

def p2w(px, py): return ((px - OX) * S, (py - OY) * S)

def load():
    g = np.asarray(Image.open(os.path.join(ROOT, 'docs/v2/plan/map_roads_target.webp')).convert('L')).astype(np.float32)
    reg = json.load(open(os.path.join(OUT, 'register.json')))
    c = np.asarray(Image.open(os.path.join(ROOT, 'docs/v2/plan/map_colour_target.webp')).convert('RGB')).astype(np.float32)
    return g, reg, c

def water_at_road_px(reg, c):
    """Boolean function on road-image pixel arrays: is the colour map water there?"""
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    water = (B > R + 25) & (B > G - 5)
    water = ndimage.binary_opening(water, iterations=1)
    def f(px, py):
        cx = np.clip((reg['s'] * np.asarray(px) + reg['tx']).round().astype(int), 0, water.shape[1] - 1)
        cy = np.clip((reg['s'] * np.asarray(py) + reg['ty']).round().astype(int), 0, water.shape[0] - 1)
        return water[cy, cx]
    return f

NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

def build_graph(sk):
    H, W = sk.shape
    k = np.ones((3, 3), np.int32); k[1, 1] = 0
    deg = ndimage.convolve(sk.astype(np.int32), k, mode='constant') * sk
    nodepx = sk & (deg != 2)
    # cluster junction pixels (a thick crossing skeletonizes into a small blob of degree>2 pixels)
    lab, n = ndimage.label(nodepx, structure=np.ones((3, 3)))
    cents = ndimage.center_of_mass(nodepx, lab, range(1, n + 1))
    nodes = [(float(cx), float(cy)) for cy, cx in cents]
    visited = np.zeros_like(sk)
    edges = []
    def neighbors(y, x):
        for dy, dx in NB:
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and sk[yy, xx]: yield yy, xx
    ys, xs = np.nonzero(nodepx)
    for y, x in zip(ys, xs):
        a = lab[y, x] - 1
        for yy, xx in neighbors(y, x):
            if nodepx[yy, xx] or visited[yy, xx]: continue
            # walk the chain
            chain = [(x, y), (xx, yy)]; visited[yy, xx] = True
            py_, px_ = y, x; cy, cx = yy, xx; end = None
            while True:
                nxt = None
                for ny, nx in neighbors(cy, cx):
                    if (ny, nx) == (py_, px_): continue
                    if nodepx[ny, nx]:
                        if lab[ny, nx] - 1 != a or len(chain) > 3: end = lab[ny, nx] - 1; chain.append((nx, ny)); break
                        continue
                    if visited[ny, nx]: continue
                    nxt = (ny, nx); break
                if end is not None or nxt is None: break
                py_, px_ = cy, cx; cy, cx = nxt; visited[cy, cx] = True; chain.append((cx, cy))
            if end is None:  # dead chain (should not happen: chain ends are degree-1 node pixels) -> new end node
                nodes.append((float(chain[-1][0]), float(chain[-1][1]))); end = len(nodes) - 1
            edges.append([a, end, chain])
    # isolated loops (rings without any junction)
    rest = sk & ~visited & ~nodepx
    rl, rn = ndimage.label(rest, structure=np.ones((3, 3)))
    for i in range(1, rn + 1):
        yy, xx = np.nonzero(rl == i)
        if len(yy) < 12: continue
        y0, x0 = yy[0], xx[0]; nodes.append((float(x0), float(y0))); a = len(nodes) - 1
        chain = [(x0, y0)]; visited[y0, x0] = True; cy, cx = y0, x0
        while True:
            nxt = None
            for ny, nx in neighbors(cy, cx):
                if rest[ny, nx] and not visited[ny, nx]: nxt = (ny, nx); break
            if nxt is None: break
            cy, cx = nxt; visited[cy, cx] = True; chain.append((cx, cy))
        chain.append((x0, y0)); edges.append([a, a, chain])
    return nodes, edges

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    ab = b - a; L = np.hypot(*ab)
    P = np.array(pts, float)
    if L < 1e-9: d = np.hypot(*(P - a).T)
    else: d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > eps: return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

def chaikin(pts, n=2):
    for _ in range(n):
        if len(pts) < 3: return pts
        out = [pts[0]]
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            out += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1), (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        out.append(pts[-1]); pts = out
    return pts

def plen(pts): return sum(math.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]))

def main():
    g, reg, c = load()
    H, W = g.shape
    road = g > 165
    road = ndimage.binary_closing(road, iterations=1) & (g > 120)
    # (no morphological opening: it erased thin anti-aliased diagonal roads; specks are removed by the size filter below)
    lab, n = ndimage.label(road, structure=np.ones((3, 3)))
    sizes = np.bincount(lab.ravel()); keep = sizes >= 18; keep[0] = False
    road = keep[lab]
    dist = ndimage.distance_transform_edt(road)
    sk = skeletonize(road)
    nodes, edges = build_graph(sk)
    print(f'raw graph: {len(nodes)} nodes, {len(edges)} edges')

    # ---- clean: merge near nodes, prune short spurs, drop tiny loops ----
    def node_deg():
        d = [0] * len(nodes)
        for a, b, ch in edges: d[a] += 1; d[b] += 1
        return d
    # merge nodes closer than 2.5 px (double junctions from blobby crossings)
    parent = list(range(len(nodes)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for a, b, ch in edges:
        if a != b and plen(ch) < 1.9: parent[find(a)] = find(b)
    groups = {}
    for i in range(len(nodes)): groups.setdefault(find(i), []).append(i)
    newpos = {}
    for r, members in groups.items():
        newpos[r] = (sum(nodes[m][0] for m in members) / len(members), sum(nodes[m][1] for m in members) / len(members))
    E = []
    for a, b, ch in edges:
        ra, rb = find(a), find(b)
        if ra == rb and plen(ch) < 1.9: continue
        E.append([ra, rb, ch])
    for it in range(4):
        deg = {}
        for a, b, ch in E: deg[a] = deg.get(a, 0) + 1; deg[b] = deg.get(b, 0) + 1
        E2 = []
        for a, b, ch in E:
            L = plen(ch)
            spur = (deg[a] == 1) != (deg[b] == 1) and L < 5.0        # dead-end stub hanging off a junction
            loop = a == b and L < 14.0                               # tiny ring from a blob
            if spur or loop: continue
            E2.append([a, b, ch])
        if len(E2) == len(E): break
        E = E2
    # merge degree-2 chains (edge, node, edge) into one edge so each road edge goes junction to junction
    def merge_deg2(E):
        changed = True
        while changed:
            changed = False
            inc = {}
            for i, (a, b, ch) in enumerate(E): inc.setdefault(a, []).append(i); inc.setdefault(b, []).append(i)
            for nd, lst in inc.items():
                if len(lst) != 2 or lst[0] == lst[1]: continue
                i, j = lst
                ai, bi, ci = E[i]; aj, bj, cj = E[j]
                if ai == bi or aj == bj: continue
                ci = ci if bi == nd else ci[::-1]; ai_ = ai if bi == nd else bi
                cj = cj if aj == nd else cj[::-1]; bj_ = bj if aj == nd else aj
                E[i] = [ai_, bj_, ci + cj[1:]]; E[j] = None
                E = [e for e in E if e is not None]; changed = True; break
        return E
    E = merge_deg2(E)

    # ---- geometry, width, class ----
    is_water = water_at_road_px(reg, c)
    roads = []
    widths = []
    for a, b, ch in E:
        pa, pb = newpos[a], newpos[b]
        pts = [pa] + [(float(x), float(y)) for x, y in ch[1:-1]] + [pb]
        if len(pts) < 2 or plen(pts) < 1.5: continue
        P = np.array(pts)
        # drawn width: 2 x distance-transform along the skeleton (median, robust to junction blobs)
        ix = np.clip(P[:, 0].round().astype(int), 0, W - 1); iy = np.clip(P[:, 1].round().astype(int), 0, H - 1)
        wv = dist[iy, ix]; core = wv[len(wv) // 5: max(len(wv) // 5 + 1, 4 * len(wv) // 5)]
        wpx = float(np.median(core if len(core) else wv)) * 2.0
        simp = rdp(pts, 0.55)
        smooth = chaikin(simp, 2) if plen(simp) > 6 else simp
        wat = is_water(P[:, 0], P[:, 1])
        roads.append(dict(a=int(a), b=int(b), px=[[round(x, 2), round(y, 2)] for x, y in smooth], wpx=round(wpx, 2), lenpx=round(plen(smooth), 2), waterFrac=round(float(wat.mean()), 3), water=wat.astype(int).tolist() if wat.any() else None))
        widths.append(wpx)
    widths = np.array(widths)
    print('width px percentiles', np.percentile(widths, [10, 25, 50, 75, 90, 97, 99]).round(2))
    res = dict(S=S, OX=OX, OY=OY, image=[W, H], nodes={str(k): [round(v[0], 2), round(v[1], 2)] for k, v in newpos.items()}, roads=roads)
    json.dump(res, open(os.path.join(OUT, 'roads_raw.json'), 'w'))
    # overlay
    img = Image.open(os.path.join(ROOT, 'docs/v2/plan/map_roads_target.webp')).convert('RGB').resize((W * 2, H * 2), Image.NEAREST)
    d = ImageDraw.Draw(img)
    for r in roads:
        col = (255, 60, 60) if r['wpx'] >= 4.2 else (255, 170, 0) if r['wpx'] >= 2.8 else (0, 200, 255)
        d.line([(x * 2, y * 2) for x, y in r['px']], fill=col, width=1)
    img.save(os.path.join(OUT, 'roads_overlay.png'))
    print(f'clean graph: {len(newpos)} nodes, {len(roads)} edges, total {sum(r["lenpx"] for r in roads) * S / 1000:.0f} km')

if __name__ == '__main__':
    main()
