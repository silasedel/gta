# Wheel axle / wobble audit (r4 wheels): how far each converted wheel's true axle is from the X axis the game spins it about.
#   python3 -P tools/v2/cars/wheel_axles.py [--dir public/assets/vehicles/cars] [--out docs/v2/reports/cars-r4-axles.json] [key ...]
# Dumps every wheel0 / wheelR0 (Blender, --disable-autoexec) and fits the tire: the dark rubber band outside 0.7 of the max
# radius, area-sampled; axle = its smallest-variance direction, hub = first harmonic of the outer radius per angle (robust
# to the tread pattern).  Per wheel: tilt (steer = about the vertical, camber = about the forward axis), hub offset from the
# spin axis, swash = lateral run-out of the tread edge (R sin tilt), run-out = radial (hub offset, both ways).
import json, os, subprocess, sys, tempfile
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BLENDER = '/opt/homebrew/bin/blender'
DUMP = r'''
import bpy, sys, os, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]; out, glbs = a[0], a[1:]
for g in glbs:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=g); acc = {}
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        p = o
        while p and p.name.split('.')[0] not in ('wheel0', 'wheelR0'): p = p.parent
        if not p: continue
        part = p.name.split('.')[0]; me = o.data; me.calc_loop_triangles(); M = np.array(o.matrix_world)
        n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        co = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)
        tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = tri.reshape(-1, 3)
        col = np.ones((n, 3))
        if me.color_attributes:
            ca = me.color_attributes[0]; c = np.empty(len(ca.data) * 4); ca.data.foreach_get('color', c); c = c.reshape(-1, 4)
            if ca.domain == 'CORNER':
                lv = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', lv); cv = np.zeros((n, 4)); cv[lv] = c; col = cv[:, :3]
            else: col = c[:, :3]
        L = acc.setdefault(part, [[], [], [], 0]); L[0].append(co); L[1].append(tri + L[3]); L[2].append(col); L[3] += n
    d = {}
    for part, (v, f, c, _) in acc.items(): d[part + '_v'] = np.concatenate(v); d[part + '_f'] = np.concatenate(f); d[part + '_c'] = np.concatenate(c)
    np.savez_compressed(os.path.join(out, os.path.basename(g)[:-4] + '.npz'), **d)
'''
rng = np.random.default_rng(1)
def sample(v, f, n=60000):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]; A = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    k = rng.choice(len(f), n, p=A / A.sum()); u, w = rng.random(n), rng.random(n); m = u + w > 1; u[m], w[m] = 1 - u[m], 1 - w[m]
    return a[k] + (b[k] - a[k]) * u[:, None] + (c[k] - a[k]) * w[:, None]
def basis(a):
    t = np.array([0, 1.0, 0]) if abs(a[1]) < 0.9 else np.array([1.0, 0, 0]); u = np.cross(a, t); u /= np.linalg.norm(u); return u, np.cross(a, u)
def harm_center(P, nb=120):
    c = np.zeros(2)
    for _ in range(4):
        d = P - c; rho = np.hypot(d[:, 0], d[:, 1]); th = np.arctan2(d[:, 1], d[:, 0]); bi = ((th + np.pi) / (2 * np.pi) * nb).astype(int) % nb
        mx = np.full(nb, -1.0); np.maximum.at(mx, bi, rho); ok = mx > 0.8 * mx.max(); tc = (np.arange(nb) + 0.5) / nb * 2 * np.pi - np.pi
        s = np.linalg.lstsq(np.stack([np.ones(ok.sum()), np.cos(tc[ok]), np.sin(tc[ok])], 1), mx[ok], rcond=None)[0]; c = c + s[1:]
        if np.hypot(*s[1:]) < 1e-5: break
    return c, float(s[0])
def tire_fit(v, f, col):
    L = col @ np.array([0.2126, 0.7152, 0.0722]); rho = np.hypot(v[:, 1], v[:, 2]); keep = (L < 0.09) & (rho > 0.7 * rho.max())
    m = keep[f].all(1)
    if m.sum() < 20: return None
    S = sample(v, f[m]); C = S.mean(0); ev, E = np.linalg.eigh(np.cov((S - C).T)); a = E[:, 0] * (1 if E[0, 0] >= 0 else -1); c = C
    for _ in range(3):
        u, w = basis(a); d = S - c; cc, R = harm_center(np.stack([d @ u, d @ w], 1)); c = c + cc[0] * u + cc[1] * w
    ax = (S - c) @ a; c = c + a * (ax.min() + ax.max()) / 2
    tilt = float(np.degrees(np.arccos(min(1, abs(a[0])))))
    return dict(tilt=round(tilt, 2), steer=round(float(np.degrees(np.arctan2(a[2], a[0]))), 2), camber=round(float(np.degrees(np.arctan2(a[1], a[0]))), 2),
                hub_mm=round(float(np.hypot(c[1], c[2]) * 1000), 1), R=round(R, 4), swash_mm=round(float(R * np.sin(np.radians(tilt)) * 1000), 1),
                clean=bool(ev[0] < 0.4 * ev[1] and ev[1] > 0.85 * ev[2]))
if __name__ == '__main__':
    a = sys.argv[1:]; opt = {}; keys = []
    i = 0
    while i < len(a):
        if a[i].startswith('--'): opt[a[i][2:]] = a[i + 1]; i += 2
        else: keys.append(a[i]); i += 1
    D = os.path.join(ROOT, opt.get('dir', 'public/assets/vehicles/cars'))
    keys = keys or sorted(f[:-4] for f in os.listdir(D) if f.endswith('.glb'))
    tmp = tempfile.mkdtemp(); sp = os.path.join(tmp, 'dump.py'); open(sp, 'w').write(DUMP)
    subprocess.run([BLENDER, '-b', '--disable-autoexec', '--factory-startup', '-P', sp, '--', tmp] + [os.path.join(D, k + '.glb') for k in keys], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rep = {}
    for k in keys:
        p = os.path.join(tmp, k + '.npz')
        if not os.path.exists(p): continue
        d = np.load(p)
        for part in ('wheel0', 'wheelR0'):
            if part + '_v' not in d: continue
            q = tire_fit(d[part + '_v'], d[part + '_f'], d[part + '_c'])
            if not q: continue
            rep[k + ':' + part] = q
            print(f"{k:8s} {part:7s} tilt {q['tilt']:6.2f} (steer {q['steer']:6.2f} camber {q['camber']:6.2f})  hub {q['hub_mm']:5.1f} mm  swash {q['swash_mm']:5.1f} mm  R {q['R']:.3f}{'' if q['clean'] else '  (fit not clean)'}")
    if opt.get('out'): json.dump(rep, open(os.path.join(ROOT, opt['out']), 'w'), indent=1)
