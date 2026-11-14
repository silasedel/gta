"""Clean the traced skeleton chains into a road graph (image pixels).

Run after trace.py:  tools/world/.venv/bin/python -I tools/v2/maproads/vectorize.py
Reads out/traced.json, writes out/vector.json: {roads: [{pts (px), len, w, dense}]}.

Steps: node snapping (chain ends within 0.8 px share a node), iterative spur pruning (< 2 px = 60 m),
removal of short isolated bits, merging through degree-2 nodes, gap bridging between aligned dead ends
(<= 5 px = 150 m, direction within 40 deg), Douglas-Peucker 0.6 px, then a final drop of free-floating
pieces under 8 px (240 m) that touch nothing.
"""
import sys, os, json, math
sys.path.append(os.path.expanduser('~/.local/lib/python3.13/site-packages'))
import numpy as np
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')


def plen(p):
    return sum(math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) for i in range(len(p) - 1))


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); d = b - a; L = math.hypot(*d); P = np.array(pts)
    dist = np.hypot(*(P - a).T) if L < 1e-9 else np.abs(d[0] * (P[:, 1] - a[1]) - d[1] * (P[:, 0] - a[0])) / L
    i = int(dist.argmax())
    if dist[i] > tol:
        return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol)
    return [pts[0], pts[-1]]


class G:
    def __init__(self, chains, snap=0.8):
        self.nodes = []          # [x, y]
        self.edges = {}          # id -> dict(a, b, pts, w, dense)
        grid = defaultdict(list)
        def nid(p):
            k = (int(p[0] // 2), int(p[1] // 2))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for n in grid[(k[0] + dx, k[1] + dy)]:
                        q = self.nodes[n]
                        if math.hypot(q[0] - p[0], q[1] - p[1]) <= snap:
                            return n
            self.nodes.append(list(p)); grid[k].append(len(self.nodes) - 1)
            return len(self.nodes) - 1
        for i, c in enumerate(chains):
            pts = [tuple(p) for p in c['pts']]
            if len(pts) < 2:
                continue
            a, b = nid(pts[0]), nid(pts[-1])
            if a == b and plen(pts) < 6:
                continue
            pts[0] = tuple(self.nodes[a]); pts[-1] = tuple(self.nodes[b])
            self.edges[i] = dict(a=a, b=b, pts=pts, w=c['w'], dense=c['dense'])
        self.next = max(self.edges) + 1 if self.edges else 0

    def adj(self):
        A = defaultdict(set)
        for k, e in self.edges.items():
            A[e['a']].add(k); A[e['b']].add(k)
        return A

    def prune(self, spur=2.0, rounds=4):
        for _ in range(rounds):
            A = self.adj(); kill = []
            for k, e in self.edges.items():
                da, db = len(A[e['a']]), len(A[e['b']]); L = plen(e['pts'])
                if (da == 1) != (db == 1) and L < spur: kill.append(k)
                elif da == 1 and db == 1 and L < 6: kill.append(k)
            for k in kill:
                self.edges.pop(k, None)
            self.merge()
            if not kill:
                break

    def merge(self):
        changed = True
        while changed:
            changed = False
            A = self.adj()
            for n, ks in A.items():
                if len(ks) != 2:
                    continue
                k1, k2 = list(ks)
                if k1 == k2 or k1 not in self.edges or k2 not in self.edges:
                    continue
                e1, e2 = self.edges[k1], self.edges[k2]
                p1 = e1['pts'] if e1['b'] == n else e1['pts'][::-1]
                p2 = e2['pts'] if e2['a'] == n else e2['pts'][::-1]
                a = e1['a'] if e1['b'] == n else e1['b']
                b = e2['b'] if e2['a'] == n else e2['a']
                L1, L2 = plen(p1), plen(p2)
                w = (e1['w'] * L1 + e2['w'] * L2) / max(L1 + L2, 1e-6)
                dn = (e1['dense'] * L1 + e2['dense'] * L2) / max(L1 + L2, 1e-6)
                self.edges.pop(k1); self.edges.pop(k2)
                self.edges[self.next] = dict(a=a, b=b, pts=p1 + p2[1:], w=w, dense=dn); self.next += 1
                changed = True
                break

    def bridge(self, reach=5.0, ang=40):
        A = self.adj()
        ends = []
        for n, ks in A.items():
            if len(ks) != 1:
                continue
            e = self.edges[next(iter(ks))]
            pts = e['pts'] if e['b'] == n else e['pts'][::-1]
            q = pts[max(0, len(pts) - 4)] if plen(pts) > 3 else pts[0]
            d = (pts[-1][0] - q[0], pts[-1][1] - q[1]); L = math.hypot(*d) or 1
            ends.append((n, (d[0] / L, d[1] / L)))
        used = set(); added = 0
        # dead end -> nearest point on any other edge ahead of it (T) or another dead end (gap)
        segs = []
        for k, e in self.edges.items():
            for i in range(len(e['pts']) - 1):
                segs.append((k, e['pts'][i], e['pts'][i + 1]))
        S = np.array([[s[1][0], s[1][1], s[2][0], s[2][1]] for s in segs])
        for n, d in ends:
            if n in used:
                continue
            p = self.nodes[n]
            ax, ay, bx, by = S.T
            vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy + 1e-9
            t = np.clip(((p[0] - ax) * vx + (p[1] - ay) * vy) / L2, 0, 1)
            qx, qy = ax + t * vx, ay + t * vy
            dist = np.hypot(qx - p[0], qy - p[1])
            own = np.array([self.edges[s[0]]['a'] == n or self.edges[s[0]]['b'] == n for s in segs])
            dist[own] = 1e9
            cand = np.argsort(dist)[:12]
            best = None
            for j in cand:
                if dist[j] > reach or dist[j] < 0.3:
                    continue
                v = (qx[j] - p[0], qy[j] - p[1]); L = math.hypot(*v)
                c = (v[0] * d[0] + v[1] * d[1]) / L
                if c < math.cos(math.radians(ang)):
                    continue
                best = (dist[j], (float(qx[j]), float(qy[j])))
                break
            if best:
                self.nodes.append(list(best[1])); m = len(self.nodes) - 1
                self.edges[self.next] = dict(a=n, b=m, pts=[tuple(p), best[1]], w=1.0, dense=0.0, bridged=True); self.next += 1
                used.add(n); added += 1
        return added


def main():
    T = json.load(open(os.path.join(OUT, 'traced.json')))
    g = G(T['chains'])
    print('edges in', len(g.edges))
    g.prune(spur=2.2)
    print('after prune', len(g.edges))
    nb = g.bridge()
    g.merge(); g.prune(spur=2.2, rounds=2)
    print('bridged', nb, 'edges', len(g.edges))
    # drop free-floating short pieces
    A = g.adj(); out = []
    for k, e in g.edges.items():
        L = plen(e['pts'])
        if len(A[e['a']]) == 1 and len(A[e['b']]) == 1 and L < 8:
            continue
        out.append(dict(id=k, a=e['a'], b=e['b'], pts=[[round(x, 2), round(y, 2)] for x, y in dp(e['pts'], 0.6)], len=round(L, 2), w=round(e['w'], 2), dense=round(e['dense'], 2)))
    json.dump(dict(size=T['size'], nodes=g.nodes, roads=out), open(os.path.join(OUT, 'vector.json'), 'w'))
    print('roads', len(out), 'km', round(sum(r['len'] for r in out) * 0.03, 1))


if __name__ == '__main__':
    main()
