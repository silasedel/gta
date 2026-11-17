"""Road alignment naturalizing (round 2, item 8): turn traced road centerlines into surveyed-looking alignments.

The trace (trace.py) follows the skeleton of a 11 m/pixel drawing. On long, gently slanted roads the skeleton steps one pixel
sideways every few hundred meters; RDP + Chaikin turn each step into a small S-bend, so long roads wiggle with a regular,
generated-looking rhythm (the user's shot_08, State Road 916). Real roads are surveyed: long tangents, circular arcs,
spiral (clothoid) transitions between them, and no wiggles.

Method: every road is moved sideways inside a tube around its traced line (default +-6 m: the skeleton's half-pixel noise)
to the shape of least bending: minimize the integral of curvature^2 (straight wherever the tube allows) plus a curvature-change
term (transitions spread like spirals) plus a weak pull to the drawn line. Roads that continue straight through a node are
solved together (no kink at the node); junction nodes (3+ legs), dead ends, bridges / decks and any road that is not eligible
stay exactly where they are, and the tube narrows to zero over the last ~45 m before a junction so junction geometry
(curb returns, crosswalks) does not change. Topology, node ids, names and every other road stay identical.

Used by build_v3.py after buildings are placed (so the block / lot / building generation, and its random sequence, does not
change). Pure geometry: numpy + scipy + shapely.
"""
import math
from collections import defaultdict
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import splu
from shapely.geometry import LineString, Point
from shapely import STRtree

H = 4.0             # station spacing (m)
TAPER = 45.0        # tube grows from 0 at a fixed point to full width over this distance (m)
PAIR_DEG = 35.0     # two legs at a node within this deviation from straight continue each other
CONTEXT = 40.0      # meters of a fixed neighbour kept as context (tangent continuity into it)
L_JERK = 22.0       # length scale of the curvature-change term (m): larger = longer spiral transitions
MIN_NET = 2500.0     # roads of a separate network shorter than this (m) in total are left alone
L_PULL = 40.0       # length scale of the pull to the drawn line (m): larger = weaker pull


def _resample(P, h):
    """Polyline -> points every <= h m, original end points kept exactly."""
    out = [tuple(P[0])]
    for a, b in zip(P[:-1], P[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6: continue
        n = max(1, int(math.ceil(L / h)))
        for k in range(1, n + 1):
            t = k / n; out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def _leg_dir(pts, reach=20.0):
    """Unit direction from pts[0] toward the point ~reach m along."""
    x0, z0 = pts[0]; acc = 0.0; q = pts[-1]
    for a, b in zip(pts[:-1], pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); acc += L
        if acc >= reach: q = b; break
    dx, dz = q[0] - x0, q[1] - z0; L = math.hypot(dx, dz) or 1.0
    return dx / L, dz / L


def naturalize(roads, eligible, tube_of, log=print, pin=None, clear=None):
    """roads: list of objects with .pts (list of (x, z)) and .y (deck / ramp heights per point or None).
    eligible(r) -> bool, tube_of(r) -> max lateral move (m), pin(x, z) -> True where the line must not move,
    clear(r, x, z, nx, nz) -> (room toward -n, room toward +n) in meters (e.g. to the nearest building), or None.
    Ramp heights (.y) are carried over by arc position; bridge decks are never eligible. Rewrites .pts (and .y) of eligible
    roads in place. Returns a stats dict."""
    inc = defaultdict(list)
    for i, r in enumerate(roads):
        inc[tuple(r.pts[0])].append((i, 0)); inc[tuple(r.pts[-1])].append((i, 1))
    deg = {k: len(v) for k, v in inc.items()}
    # ---- pair legs that continue each other through a node
    partner = {}
    cosmax = -math.cos(math.radians(PAIR_DEG))
    for node, legs in inc.items():
        if len(legs) < 2: continue
        dirs = []
        for i, end in legs:
            P = roads[i].pts if end == 0 else roads[i].pts[::-1]
            if roads[i].pts[0] == roads[i].pts[-1]: continue          # self loop
            dirs.append(((i, end), _leg_dir(P)))
        cand = []
        for a in range(len(dirs)):
            for b in range(a + 1, len(dirs)):
                (ka, da), (kb, db) = dirs[a], dirs[b]
                if ka[0] == kb[0]: continue
                c = da[0] * db[0] + da[1] * db[1]
                if c < cosmax: cand.append((c, ka, kb))
        cand.sort()
        for c, ka, kb in cand:
            if ka in partner or kb in partner: continue
            partner[ka] = kb; partner[kb] = ka
    # ---- chains: walk edge to edge through paired ends
    seen = set(); chains = []
    def walk(i, end_in):
        """Start at road i entered at end `end_in` (0: traverse forward). Returns [(i, forward)]."""
        ch = []
        while True:
            if i in seen: break
            seen.add(i); fwd = end_in == 0; ch.append((i, fwd))
            out_end = 1 if fwd else 0
            nxt = partner.get((i, out_end))
            if not nxt: break
            i, end_in = nxt
        return ch
    for i in range(len(roads)):           # open chains first (start at an unpaired end)
        if i in seen: continue
        for end in (0, 1):
            if (i, end) not in partner:
                # walk backwards to the true start is not needed: start here, going away from the unpaired end
                chains.append(walk(i, end)); break
    for i in range(len(roads)):           # closed loops
        if i not in seen: chains.append(walk(i, 0))
    # ---- runs: maximal stretches of eligible roads in a chain, with fixed context on both sides
    stats = dict(runs=0, roads=0, moved=0, maxMove=0.0, reverted=0, stations=0)
    ok = [bool(eligible(r)) for r in roads]
    # small separate networks stay as drawn: the runtime build links or drops such scraps by their exact geometry
    par = {}
    def find(a):
        while par.setdefault(a, a) != a: par[a] = par[par[a]]; a = par[a]
        return a
    for r in roads: par[find(tuple(r.pts[0]))] = find(tuple(r.pts[-1]))
    comp_len = defaultdict(float)
    for r in roads: comp_len[find(tuple(r.pts[0]))] += LineString(r.pts).length
    for i, r in enumerate(roads):
        if comp_len[find(tuple(r.pts[0]))] < MIN_NET: ok[i] = False
    new_pts = {}
    for ch in chains:
        k = 0
        while k < len(ch):
            if not ok[ch[k][0]]: k += 1; continue
            k1 = k
            while k1 < len(ch) and ok[ch[k1][0]]: k1 += 1
            run = ch[k:k1]
            before = ch[k - 1] if k > 0 else None
            after = ch[k1] if k1 < len(ch) else None
            # a closed loop of only eligible roads: keep the first node fixed (it is a station anyway)
            res = _solve_run(roads, run, before, after, deg, tube_of, pin, clear)
            if res:
                for i, P in res.items(): new_pts[i] = P
                stats['runs'] += 1
            k = k1
    # ---- apply, then revert any run that created a crossing with another road
    lines = [LineString(r.pts) for r in roads]
    tree = STRtree(lines)
    for i, P in new_pts.items():
        old = lines[i]; new = LineString(P)
        bad = False
        for j in tree.query(new.buffer(0.5)):
            if j == i: continue
            o = lines[j]
            if new.crosses(o) and not old.crosses(o): bad = True; break
        if bad: stats['reverted'] += 1; continue
        mv = max(old.distance(Point(p)) for p in P)
        mv = max(mv, max(new.distance(Point(p)) for p in roads[i].pts))
        y = getattr(roads[i], 'y', None)
        if y:
            ys = _ysampler(roads[i], True); y2 = [round(ys(p), 2) for p in P]; y2[0], y2[-1] = y[0], y[-1]; roads[i].y = y2
        roads[i].pts = P
        stats['roads'] += 1; stats['maxMove'] = max(stats['maxMove'], round(mv, 2))
        if mv > 0.3: stats['moved'] += 1
    log(f"survey fit: {stats['runs']} runs, {stats['roads']} roads rewritten ({stats['moved']} moved > 0.3 m, max {stats['maxMove']} m), {stats['reverted']} reverted (new crossing)")
    return stats


def _solve_run(roads, run, before, after, deg, tube_of, pin, clear=None):
    # stations: context before (fixed), each road (node stations exact), context after (fixed)
    S = []          # [x, z, tube, owner (road idx or -1), is_node]
    def oriented(i, fwd): return list(roads[i].pts) if fwd else list(roads[i].pts)[::-1]
    if before is not None:
        P = oriented(*before)[::-1]            # walk away from the run's first node, into the neighbour
        ctx = _trim(P, CONTEXT)[::-1]          # ends at the run's first node
        for p in _resample(ctx, H)[:-1]: S.append([p[0], p[1], 0.0, -1, False])
    bounds = []                              # station index ranges per road
    for n_, (i, fwd) in enumerate(run):
        P = _resample(oriented(i, fwd), H)
        start = len(S) if n_ == 0 else len(S) - 1      # later roads start on the previous road's end node station
        if n_ == 0:
            S.append([P[0][0], P[0][1], 0.0, i, True])
        for p in P[1:]: S.append([p[0], p[1], 0.0 if (pin and pin(p[0], p[1])) else tube_of(roads[i]), i, False])
        S[-1][4] = True
        bounds.append((i, fwd, start, len(S) - 1))
    if after is not None:
        ctx = _trim(oriented(*after), CONTEXT)
        for p in _resample(ctx, H)[1:]: S.append([p[0], p[1], 0.0, -1, False])
    n = len(S)
    if n < 6: return None
    X = np.array([[s[0], s[1]] for s in S]); T = np.array([s[2] for s in S])
    # fixed points: the run's end nodes; inner nodes that are junctions (3+ legs) or not deg 2
    fixed = np.zeros(n, bool)
    for (i, fwd, a, b) in bounds:
        for idx in (a, b):
            key = (round(X[idx, 0], 2), round(X[idx, 1], 2))
            if deg.get(key, 0) != 2: fixed[idx] = True
    fixed[0] = fixed[-1] = True
    fixed |= T <= 0
    first_node = bounds[0][2]; last_node = bounds[-1][3]
    fixed[first_node] = True; fixed[last_node] = True
    # distance along the line to the nearest fixed point -> tube taper
    seg = np.r_[0.0, np.hypot(*np.diff(X, axis=0).T)]; s = np.cumsum(seg)
    fs = s[fixed]
    dist = np.min(np.abs(s[:, None] - fs[None, :]), axis=1) if len(fs) else np.full(n, 1e9)
    t = np.clip(dist / TAPER, 0, 1); taper = t * t * (3 - 2 * t)
    tube = np.where(fixed, 0.0, T * taper)
    if tube.max() < 0.3: return None
    # normals from a smoothed tangent (+-20 m), so a kink in the drawn line does not flip them
    idx_lo = np.searchsorted(s, s - 20.0, side='left'); idx_hi = np.clip(np.searchsorted(s, s + 20.0, side='right') - 1, 0, n - 1)
    tx = X[idx_hi, 0] - X[idx_lo, 0]; tz = X[idx_hi, 1] - X[idx_lo, 1]; tl = np.hypot(tx, tz); tl[tl < 1e-9] = 1
    N = np.stack([-tz / tl, tx / tl], 1)
    # least squares in d (lateral offsets): curvature^2 + L_JERK^2 * curvature-change^2 + pull
    rows, cols, vals, rhs = [], [], [], []
    r = 0
    def add_diff(coef, scale):
        """one row per window: the finite difference projected on the window's normal (lateral bending only; the
        along-track part comes from uneven station spacing and is not shape)."""
        nonlocal r
        m = len(coef)
        for i0 in range(n - m + 1):
            nc = N[i0:i0 + m].sum(0); nc /= (np.hypot(*nc) or 1.0)
            const = 0.0
            for k_, w in enumerate(coef):
                j = i0 + k_; const += w * (X[j, 0] * nc[0] + X[j, 1] * nc[1])
                rows.append(r); cols.append(j); vals.append(scale * w * (N[j, 0] * nc[0] + N[j, 1] * nc[1]))
            rhs.append(-scale * const); r += 1
    add_diff((1.0, -2.0, 1.0), 1.0 / H ** 2)
    add_diff((-1.0, 3.0, -3.0, 1.0), L_JERK / H ** 3)
    w_pull = 1.0 / L_PULL ** 2
    for j in range(n): rows.append(r); cols.append(j); vals.append(w_pull); rhs.append(0.0); r += 1
    A = sparse.csr_matrix((vals, (rows, cols)), shape=(r, n))
    lo, hi = -tube, tube.copy()
    if clear is not None:
        lo = lo.copy()
        for j in range(n):
            if tube[j] <= 0 or S[j][3] < 0: continue
            a, b = clear(roads[S[j][3]], X[j, 0], X[j, 1], N[j, 0], N[j, 1])
            lo[j] = -min(tube[j], max(0.0, a)); hi[j] = min(tube[j], max(0.0, b))
    d = _box_qp(A, np.array(rhs), lo, hi, fixed)
    Y = X + N * d[:, None]
    out = {}
    for (i, fwd, a, b) in bounds:
        P = [(round(float(Y[j, 0]), 2), round(float(Y[j, 1]), 2)) for j in range(a, b + 1)]
        # thin collinear stations (keeps curves dense, straights sparse); end points exact
        ln = LineString(P).simplify(0.04, preserve_topology=False)
        Q = [(round(x, 2), round(z, 2)) for x, z in ln.coords]
        Q[0], Q[-1] = P[0], P[-1]
        if not fwd: Q = Q[::-1]
        if len(Q) >= 2: out[i] = Q
    return out


def _ysampler(r, fwd):
    """(x, z) -> the road's height at the nearest point of its original line (None when the road has no heights)."""
    y = getattr(r, 'y', None)
    if not y: return None
    P = list(r.pts) if fwd else list(r.pts)[::-1]; Y = list(y) if fwd else list(y)[::-1]
    ln = LineString(P); cum = [0.0]
    for a, b in zip(P[:-1], P[1:]): cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    def f(p):
        s = ln.project(Point(p)); return float(np.interp(s, cum, Y))
    return f


def _box_qp(A, y, lb, ub, hard, iters=80):
    """min |A d - y|^2 subject to lb <= d <= ub (hard: d = 0). Primal-dual active set (semismooth Newton): each step
    fixes the variables predicted to sit on a bound and solves the banded system for the rest; converges in a few steps."""
    Q = (A.T @ A).tocsc(); c = A.T @ y; n = Q.shape[0]
    lb = np.where(hard, 0.0, lb); ub = np.where(hard, 0.0, ub)
    Q = (Q + sparse.identity(n, format='csc') * (1e-9 * float(Q.diagonal().mean()))).tocsc()
    C = float(Q.diagonal().mean())
    d = np.clip(splu(Q).solve(c), lb, ub); mu = np.zeros(n); prev = None
    for it in range(iters):
        up = mu + C * (d - ub) > 0; lo = mu + C * (d - lb) < 0; lo &= ~up
        key = (up.tobytes(), lo.tobytes())
        if key == prev: break
        prev = key
        I = ~(up | lo)
        d = np.where(up, ub, np.where(lo, lb, 0.0))
        if I.any():
            QI = Q[I][:, I].tocsc(); rhs = c[I] - Q[I][:, ~I] @ d[~I]
            d[I] = splu(QI).solve(rhs)
        mu = np.where(I, 0.0, c - Q @ d)
    return np.clip(d, lb, ub)


def _trim(P, L):
    """First L meters of polyline P."""
    out = [tuple(P[0])]; acc = 0.0
    for a, b in zip(P[:-1], P[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if acc + d >= L:
            t = (L - acc) / d if d > 0 else 0; out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); return out
        out.append(tuple(b)); acc += d
    return out
