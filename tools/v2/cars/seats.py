# Seat anchors measured from each converted car's LOD0 interior (python3 seats.py <npzdir> [keys...]).
# npz from dump_geo.py (game space: x = car left, y up, z forward, ground y = 0).  Writes `seats` + `wheel` into
# public/assets/vehicles/cars/<key>.json and docs/v2/reports/cars-seats.json; per-car overrides: cars.json "seatFix".
#   hip   = H-point (hip joint): ~9 cm above the cushion surface, ~13 cm ahead of the seatback
#   heel  = footwell floor under the pedals / in front of the seat;  wheel = steering wheel rim center, radius, tilt
#   roofY = roof liner over the hip column; doorX = inner door panel |x| beside the hip
import sys, os, json, numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
OUT = os.path.join(ROOT, 'public/assets/vehicles/cars')
CFG = json.load(open(os.path.join(os.path.dirname(__file__), 'cars.json')))
G = 0.02  # grid cell (m)

def load(npz):
    d = np.load(npz); V, F, N = [], [], []
    off = 0
    for k in d.files:
        if not k.endswith('_f') or not k.startswith('body0:'): continue
        slot = k[6:-2]
        if slot in ('glass', 'lamp'): continue
        v = d[k[:-2] + '_v'].astype(np.float64); f = d[k].astype(np.int64)
        V.append(v); F.append(f + off); off += len(v)
    V = np.concatenate(V); F = np.concatenate(F)
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, c - a); ar = np.linalg.norm(n, axis=1) * 0.5; n = n / np.maximum(1e-12, ar[:, None] * 2)
    return V, F, n, ar

def tri_points(V, F, ar, step=0.012):
    # sample points over every triangle (dense enough for a 2 cm grid): returns pts, face index
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    k = np.clip(np.ceil(ar / (step * step)).astype(int), 1, 400)
    idx = np.repeat(np.arange(len(F)), k)
    r1 = np.sqrt(np.random.rand(len(idx))); r2 = np.random.rand(len(idx))
    p = a[idx] * (1 - r1)[:, None] + b[idx] * (r1 * (1 - r2))[:, None] + c[idx] * (r1 * r2)[:, None]
    return np.concatenate([p, V[F].reshape(-1, 3)]), np.concatenate([idx, np.repeat(np.arange(len(F)), 3)])

def seg_runs(mask):
    runs, s = [], None
    for i, m in enumerate(mask):
        if m and s is None: s = i
        if not m and s is not None: runs.append((s, i - 1)); s = None
    if s is not None: runs.append((s, len(mask) - 1))
    return runs

def measure(key):
    man = json.load(open(os.path.join(OUT, key + '.json')))
    sh = man['shape']; yb, belt, roof = sh['yb'], sh['belt'], sh['roofY']
    W = sh.get('bodyW', man['dims']['W']); half = W / 2
    fix = CFG.get(key, {}).get('seatFix', {})
    V, F, n, ar = load(NPZ + key + '.npz')
    P, fi = tri_points(V, F, ar)
    ny = n[fi, 1]
    zF, zR = man['wheels'][0]['pos'][2], man['wheels'][2]['pos'][2]
    r = man['r']
    beltC = fix.get('belt', belt)
    # cabin box: between the axles (+ a bit), inside the side walls, from the floor to above the belt
    zlo, zhi = zR - 0.6, zF + 0.2
    inC = (np.abs(P[:, 0]) < half - 0.04) & (P[:, 2] > zlo) & (P[:, 2] < zhi) & (P[:, 1] > yb - 0.15) & (P[:, 1] < roof - 0.02)
    hor = inC & (np.abs(ny) > 0.6)
    up = hor & (P[:, 1] < beltC + 0.25)
    nz = int(np.ceil((zhi - zlo) / G)); zs = zlo + (np.arange(nz) + 0.5) * G
    def profile(xc, hw=0.1, pts=up):
        m = pts & (np.abs(P[:, 0] - xc) < hw)
        h = np.full(nz, np.nan)
        zi = ((P[m, 2] - zlo) / G).astype(int); y = P[m, 1]
        for i in range(nz):
            s = y[zi == i]
            if len(s) >= 3: h[i] = np.percentile(s, 90)
        return h
    # floor: low upward surfaces in the cabin
    fl = P[hor & (np.abs(P[:, 0]) > 0.15) & (np.abs(P[:, 0]) < half - 0.2) & (P[:, 1] > yb + 0.03), 1]
    floor = float(np.percentile(fl, 8)) if len(fl) > 50 else yb + 0.05
    floor = fix.get('floor', floor)
    # side section of a seat column as an occupancy grid (z, y), 2 cm cells; the H-point is found by template matching:
    # a cushion under the thighs, a backrest behind the hips, and EMPTY space where the thighs and torso go.
    y0g = yb - 0.1; ny_ = int((roof - y0g) / G) + 1
    def occ(xc, hw=0.08):
        m = inC & (np.abs(P[:, 0] - xc) < hw)
        O = np.zeros((nz, ny_), bool)
        zi = ((P[m, 2] - zlo) / G).astype(int); yi = ((P[m, 1] - y0g) / G).astype(int)
        k = (zi >= 0) & (zi < nz) & (yi >= 0) & (yi < ny_)
        O[zi[k], yi[k]] = True
        return O
    def cell(z, y): return int(round((z - zlo) / G)), int(round((y - y0g) / G))
    def frac_cols(O, za, zb, ya, yb_):
        i0, j0 = cell(za, ya); i1, j1 = cell(zb, yb_)
        i0, i1 = max(0, i0), min(nz, i1); j0, j1 = max(0, j0), min(ny_, j1)
        if i1 <= i0 or j1 <= j0: return 0.0
        return float(O[i0:i1, j0:j1].any(axis=1).mean())
    def frac_rows(O, za, zb, ya, yb_):
        i0, j0 = cell(za, ya); i1, j1 = cell(zb, yb_)
        i0, i1 = max(0, i0), min(nz, i1); j0, j1 = max(0, j0), min(ny_, j1)
        if i1 <= i0 or j1 <= j0: return 0.0
        return float(O[i0:i1, j0:j1].any(axis=0).mean())
    def frac_fill(O, za, zb, ya, yb_):
        i0, j0 = cell(za, ya); i1, j1 = cell(zb, yb_)
        i0, i1 = max(0, i0), min(nz, i1); j0, j1 = max(0, j0), min(ny_, j1)
        if i1 <= i0 or j1 <= j0: return 1.0
        return float(O[i0:i1, j0:j1].mean())
    def best_hip(xc, zmin, zmax):
        # the FRONTMOST seat whose score is close to the best one (the rear bench scores as well as the front seat)
        O = occ(xc); cands = []
        for z in np.arange(zmin, zmax, G):
            best = None
            for y in np.arange(max(floor + 0.14, yb + 0.08), min(floor + 0.8, roof - 0.7), G):
                cu = frac_cols(O, z - 0.02, z + 0.36, y - 0.15, y - 0.06)
                if cu < 0.45: continue
                bk = frac_rows(O, z - 0.32, z - 0.07, y + 0.05, y + 0.5)
                fr = frac_fill(O, z + 0.04, z + 0.34, y + 0.0, y + 0.12) + frac_fill(O, z - 0.02, z + 0.18, y + 0.14, y + 0.56)
                sc_ = cu + bk - 6 * fr
                if best is None or sc_ > best[0]: best = (sc_, z, y, cu, bk, fr)
            if best: cands.append(best)
        if not cands: return None
        top = max(c[0] for c in cands)
        good = [c for c in cands if c[0] >= top - 0.12 and c[0] > 0.9]
        if not good: return None
        zf = max(c[1] for c in good)
        near = [c for c in good if c[1] > zf - 0.1]   # the H-point: best score within 10 cm of the frontmost good spot
        return max(near, key=lambda c: c[0])
    best = None
    xs = fix.get('xs', list(np.arange(0.3, max(0.31, min(0.52, half - 0.26)), 0.04)))
    for xc in xs:
        bh = best_hip(xc, zR + 0.1, zF - 0.35)
        if bh is None: continue
        sc_ = bh[0] - abs(xc - 0.4) * 0.5
        if best is None or sc_ > best[0]: best = (sc_, xc, bh)
    res = {'floor': round(floor, 3)}
    def hip_from(c, xc, row):
        L = c['z1'] - c['z0']
        cz = c['z0'] + min(0.14, L * 0.3)
        return [float(xc), c['yRear'] + 0.09, cz]
    seats = []
    if best:
        _, xc, bh = best
        xc = fix.get('x', float(np.clip(xc, 0.34, max(0.36, half * 0.44))))
        hip = [float(xc), float(bh[2]), float(bh[1])]
        res['front'] = {'score': round(bh[0], 2), 'cushion': round(bh[3], 2), 'back': round(bh[4], 2), 'free': round(bh[5], 3)}
    else:
        xc = fix.get('x', 0.38 if half > 0.8 else 0.32)
        hip = [xc, max(floor + 0.3, beltC - 0.3), (zF + zR) / 2 + 0.05]
        res['front'] = None
    if 'hip' in fix: hip = fix['hip']
    else:
        if 'dy' in fix: hip[1] += fix['dy']
        if 'dz' in fix: hip[2] += fix['dz']
    # floor at the heels: lowest upward surface 0.55 .. 0.95 m in front of the hip
    hz = hip[2]
    m = hor & (np.abs(P[:, 0] - hip[0]) < 0.14) & (P[:, 2] > hz + 0.5) & (P[:, 2] < hz + 0.95)
    heelY = float(np.percentile(P[m, 1], 10)) if m.sum() > 20 else floor
    heel = [hip[0], heelY, hz + 0.78]
    # steering wheel: the rearmost geometry in the driver column at hands height, ahead of the hip
    wsel = inC & (np.abs(P[:, 0] - hip[0]) < 0.2) & (P[:, 1] > hip[1] + 0.12) & (P[:, 1] < hip[1] + 0.62) & (P[:, 2] > hz + 0.25) & (P[:, 2] < hz + 1.0)
    wheel = None
    if wsel.sum() > 30:
        Q = P[wsel]; z0 = np.percentile(Q[:, 2], 1.5)
        ring = Q[Q[:, 2] < z0 + 0.10]
        if len(ring) > 20:
            x0, x1 = np.percentile(ring[:, 0], [2, 98]); y0, y1 = np.percentile(ring[:, 1], [2, 98])
            rr = float(np.clip(max(x1 - x0, y1 - y0) / 2, 0.15, 0.22))
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if abs(cx - hip[0]) > 0.12: cx = hip[0]
            wheel = {'c': [round(float(cx), 3), round(float(cy), 3), round(float(np.median(ring[:, 2])), 3)], 'r': round(rr, 3), 'tilt': 0.38}
    if wheel and not (0.22 <= wheel['c'][1] - hip[1] <= 0.56 and 0.24 <= wheel['c'][2] - hz <= 0.8): wheel = None   # not a steering wheel
    if 'wheel' in fix: wheel = {'c': fix['wheel'], 'r': fix.get('wheelR', 0.19), 'tilt': 0.38}
    if wheel is None: wheel = {'c': [round(hip[0], 3), round(hip[1] + 0.34, 3), round(hz + 0.5, 3)], 'r': 0.185, 'tilt': 0.38, 'est': True}
    def liner(x, z, y0):
        m = inC & (n[fi, 1] < -0.4) & (np.abs(P[:, 0] - x) < 0.15) & (np.abs(P[:, 2] - z) < 0.2) & (P[:, 1] > y0 + 0.45)
        return float(np.percentile(P[m, 1], 5)) if m.sum() > 10 else None
    def door(x, z, y):
        sgn = 1 if x > 0 else -1
        m = inC & (sgn * P[:, 0] > abs(x) + 0.12) & (np.abs(P[:, 2] - z) < 0.25) & (P[:, 1] > y) & (P[:, 1] < y + 0.35)
        return float(np.percentile(np.abs(P[m, 0]), 5)) if m.sum() > 10 else half - 0.06
    def seat(id_, x, y, z, hy=None):
        ry = liner(x, z, y)
        if ry is not None and not (y + 0.72 <= ry <= y + 1.35): ry = None
        if ry is None: ry = min(roof - 0.05, y + 1.0)
        hy = heelY if hy is None else hy
        if not (y - 0.7 <= hy <= y - 0.24): hy = y - (0.42 if y - yb > 0.5 else 0.3)
        return {'id': id_, 'hip': [round(x, 3), round(y, 3), round(z, 3)], 'yaw': 0, 'heel': [round(x, 3), round(hy, 3), round(z + 0.78, 3)],
                'roofY': round(ry, 3), 'doorX': round(float(np.clip(door(x, z, y), abs(x) + 0.14, half)), 3)}
    seats.append(seat('driver', hip[0], hip[1], hip[2]))
    seats.append(seat('front', -hip[0], hip[1], hip[2]))
    # rear row: a cushion behind the front seatback (front hip - 0.55 .. )
    nrear = fix.get('rear', None)
    if nrear != 0:
        bestR = None
        for xc in fix.get('xsR', list(np.arange(0.3, max(0.31, min(0.52, half - 0.26)), 0.04))):
            bh = best_hip(xc, zR - 0.6, hz - 0.6)
            if bh is None: continue
            sc_ = bh[0] - abs(xc - 0.42) * 0.5
            if bestR is None or sc_ > bestR[0]: bestR = (sc_, xc, bh)
        if (bestR and bestR[0] > 0.9) or 'rearHip' in fix:
            if 'rearHip' in fix: hr = fix['rearHip']
            else:
                _, xr, bh = bestR
                hr = [float(np.clip(xr, 0.34, max(0.38, half * 0.46))), float(bh[2]), float(bh[1])]
                res['rear'] = {'score': round(bh[0], 2), 'cushion': round(bh[3], 2), 'back': round(bh[4], 2), 'free': round(bh[5], 3)}
            # rear feet: floor just in front of the rear cushion (behind the front seat)
            m = hor & (np.abs(P[:, 0] - hr[0]) < 0.14) & (P[:, 2] > hr[2] + 0.3) & (P[:, 2] < hr[2] + 0.6)
            hy = float(np.percentile(P[m, 1], 10)) if m.sum() > 20 else floor
            seats.append(seat('rearL', hr[0], hr[1], hr[2], hy)); seats.append(seat('rearR', -hr[0], hr[1], hr[2], hy))
            if half > 0.85 and fix.get('rearC', True): seats.append(seat('rearC', 0.0, hr[1] + 0.02, hr[2], hy))
    for s_ in seats: s_['rearHeel'] = None
    for s_ in seats: s_.pop('rearHeel')
    return man, seats, wheel, res

def stripe_boxes(key, man):
    # racing-stripe boxes measured on the paint shell (glbCar reads man.stripe): the hood = up-facing paint along the centerline
    # from the windshield base to where the hood drops to the grille; the roof = up-facing paint above the glass line
    d = np.load(NPZ + key + '.npz')
    if 'body0:paint_v' not in d.files: return None
    v = d['body0:paint_v'].astype(np.float64); f = d['body0:paint_f']; a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    n = np.cross(b - a, c - a); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12; cen = (a + b + c) / 3
    sh = man['shape']; up = (np.abs(n[:, 1]) > 0.75) & (np.abs(cen[:, 0]) < 0.3)
    zs = np.arange(sh['rear'], sh['front'], 0.1); prof = []
    for z0 in zs:
        m = up & (cen[:, 2] >= z0) & (cen[:, 2] < z0 + 0.1)
        prof.append(float(np.percentile(cen[m, 1], 90)) if m.sum() >= 3 else np.nan)
    prof = np.array(prof); zA = sh['zA']
    hood = [(z, y) for z, y in zip(zs, prof) if not np.isnan(y) and z > zA - 0.25 and y > sh['belt'] - 0.15]
    roof = [(z, y) for z, y in zip(zs, prof) if not np.isnan(y) and y > sh['roofY'] - 0.3]
    out = {}
    if hood:
        hy = np.median([y for _, y in hood]); hz = [z for z, y in hood if abs(y - hy) < 0.12]
        if hz: out['hood'] = [round(min(hz), 3), round(max(hz) + 0.1, 3)]; out['hoodY'] = round(hy - 0.12, 3)
    if roof:
        ry = np.median([y for _, y in roof]); rz = [z for z, y in roof if abs(y - ry) < 0.1]
        if rz: out['roof'] = [round(min(rz), 3), round(max(rz) + 0.1, 3)]; out['roofY'] = round(ry - 0.12, 3)
    return out or None

if __name__ == '__main__':
    NPZ = sys.argv[1].rstrip('/') + '/'
    keys = sys.argv[2:] or sorted(k[:-4] for k in os.listdir(NPZ) if k.endswith('.npz'))
    rep = {}
    for k in keys:
        man = json.load(open(os.path.join(OUT, k + '.json')))
        if man.get('static') or 'wheels' not in man or not man['wheels']: continue
        np.random.seed(7)
        man, seats, wheel, res = measure(k)
        man['seats'] = seats; man['wheel'] = wheel
        try:
            st = stripe_boxes(k, man)
            if st: man['stripe'] = st
        except Exception as e: print('stripe', k, e)
        json.dump(man, open(os.path.join(OUT, k + '.json'), 'w'))
        rep[k] = {'seats': seats, 'wheel': wheel, 'debug': res}
        d = seats[0]
        print(k.ljust(8), 'hip', d['hip'], 'heel', d['heel'][1], 'wheel', wheel['c'], wheel['r'], 'roof', d['roofY'], 'door', d['doorX'], 'n', len(seats), 'EST' if wheel.get('est') else '')
    p = os.path.join(ROOT, 'docs/v2/reports/cars-seats.json')
    old = json.load(open(p)) if os.path.exists(p) and len(keys) < 40 else {}
    old.update(rep); json.dump(old, open(p, 'w'), indent=1)
