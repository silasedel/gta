# People pipeline (PEOPLE helper): one Tripo / library person -> rigged, LOD'd crowd GLB on the game's humanoid
# skeleton (the 52 Mixamo-named joints of public/assets/npc/arch/*.glb, which the procedural clip library in
# src/npc/arch/anim.js binds to).
#   blender -b --python-exit-code 1 -P tools/v2/npcs/rig_person.py -- --in <fbx|glb> --id p07 --height 1.81 --out <dir>
#     [--lods 20000,5000,1200] [--check <png>]
# Steps: import -> join -> face -Y, feet on z=0, centered -> scale to the person's height -> clean (merge by distance,
# drop stray islands, recalc normals) -> landmarks from the mesh (arm line, armpit, wrist, crotch, ankles, toes,
# shoulders, head) -> 52-bone armature -> skin weights by bone heat on a watertight voxel proxy, smoothed, transferred
# to each LOD (max 4 influences) -> re-pose to the canonical T-pose (arms exactly along +-X, legs straight down) and
# apply as rest, so every person shares one animation set at run time -> export GLB (Draco, no images) + meta json.
# Never runs scripts from downloads; only reads the mesh + textures.
import bpy, bmesh, sys, json, math, os
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
A = {}
i = 0
while i < len(argv):
    if argv[i].startswith('--'):
        A[argv[i][2:]] = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
        i += 2 if A[argv[i][2:]] is not True else 1
    else:
        i += 1
SRC, PID, OUT = A['in'], A['id'], A['out']
HT = float(A.get('height', 1.75))
HAT = float(A.get('hat', 0))   # hat / helmet height on top of the head (meters)
LODS = [int(x) for x in str(A.get('lods', '0,5000,1200')).split(',')]   # 0 = full mesh (user: looks first, full mesh up close)
os.makedirs(OUT, exist_ok=True)
log = lambda *a: print('[rig]', PID, *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
if SRC.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=SRC)
else:
    bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene

def activate(o, sel=True):
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(sel); bpy.context.view_layer.objects.active = o

# ---------------------------------------------------------------- join + normalize transform
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
    for m in meshes:
        for md in list(m.modifiers):
            if md.type == 'ARMATURE': m.modifiers.remove(md)
for m in meshes:
    mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
for x in meshes: x.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'src'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = body.data
if me.shape_keys:
    body.shape_key_clear()

def V():
    a = np.empty(len(me.vertices) * 3, dtype=np.float64); me.vertices.foreach_get('co', a); return a.reshape(-1, 3)

P = V()
mn, mx = P.min(0), P.max(0)
# up axis: the longest extent that is not the arm span; Tripo FBX are Z-up already, library GLBs may be Y-up
ext = mx - mn
up = 2
if ext[1] > ext[2] * 1.3 and ext[1] >= ext[0] * 0.9: up = 1
if up == 1:
    body.data.transform(Matrix.Rotation(math.radians(90), 4, 'X')); P = V(); mn, mx = P.min(0), P.max(0)
H0 = mx[2] - mn[2]
# facing: the toes reach further than the heels from the ankle column -> toes are the front
low = P[P[:, 2] < mn[2] + 0.03 * H0]
ank = P[(P[:, 2] > mn[2] + 0.08 * H0) & (P[:, 2] < mn[2] + 0.12 * H0)]
fy = (low[:, 1].min() + low[:, 1].max()) / 2
if fy > ank[:, 1].mean():  # toes toward +Y -> turn around to face -Y
    body.data.transform(Matrix.Rotation(math.pi, 4, 'Z')); P = V()
mn, mx = P.min(0), P.max(0)
s = (HT + HAT) / (mx[2] - mn[2])
cx = (mn[0] + mx[0]) / 2
feet = P[P[:, 2] < mn[2] + 0.1 * (mx[2] - mn[2])]
cy = (feet[:, 1].min() + feet[:, 1].max()) / 2
body.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -mn[2])))
body.data.update()

# ---------------------------------------------------------------- clean
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=HT * 2e-5)
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context='VERTS')
# islands: keep the big ones (the person and separate garment shells), drop stray floating bits
bm.verts.ensure_lookup_table(); seen = set(); islands = []
for v in bm.verts:
    if v.index in seen: continue
    st = [v]; seen.add(v.index); comp = []
    while st:
        a = st.pop(); comp.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in seen: seen.add(b.index); st.append(b)
    islands.append(comp)
islands.sort(key=len, reverse=True)
big = len(islands[0])
drop = []
for comp in islands[1:]:
    if len(comp) < max(60, big * 0.004): drop += comp
if drop: bmesh.ops.delete(bm, geom=drop, context='VERTS')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free(); me.update()
log('clean', 'islands', len(islands), 'dropped verts', len(drop), 'verts', len(me.vertices))

# ---------------------------------------------------------------- landmarks
P = V(); H = P[:, 2].max() - HAT   # landmark scale: the person, not the hat
X, Y, Z = P[:, 0], P[:, 1], P[:, 2]

def slab_x(d, side, w, zmin):
    m = (np.abs(side * X - d) < w) & (Z > zmin)
    return P[m]

def arm_side(side):
    tip = (side * X).max()
    # armpit: walking outward from the torso, the first slab whose (z > 0.55 H) vertical extent is arm-sized
    armpit = None
    for d in np.arange(0.06 * H, tip, 0.004 * H):
        q = slab_x(d, side, 0.004 * H, 0.5 * H)
        if len(q) < 4: continue
        if q[:, 2].max() - q[:, 2].min() < 0.11 * H:
            armpit = d; break
    if armpit is None: armpit = 0.13 * H
    # arm center line from slabs between the armpit and the wrist area
    ds, zs, ys = [], [], []
    for d in np.arange(armpit + 0.02 * H, tip - 0.13 * H, 0.008 * H):
        q = slab_x(d, side, 0.004 * H, 0.55 * H)
        if len(q) < 4: continue
        ds.append(d); zs.append((q[:, 2].max() + q[:, 2].min()) / 2); ys.append((q[:, 1].max() + q[:, 1].min()) / 2)
    ds, zs, ys = np.array(ds), np.array(zs), np.array(ys)
    bz = np.polyfit(ds, zs, 1) if len(ds) > 3 else np.array([0, 0.81 * H])
    by = np.polyfit(ds, ys, 1) if len(ds) > 3 else np.array([0, 0.0])
    # wrist: narrowest y extent between 0.17 H and 0.07 H from the finger tips
    best, wr = 1e9, tip - 0.105 * H
    for d in np.arange(tip - 0.17 * H, tip - 0.07 * H, 0.003 * H):
        q = slab_x(d, side, 0.003 * H, 0.55 * H)
        if len(q) < 4: continue
        zc = np.polyval(bz, d); q = q[np.abs(q[:, 2] - zc) < 0.06 * H]
        if len(q) < 4: continue
        e = q[:, 1].max() - q[:, 1].min()
        if e < best: best, wr = e, d
    sh = float(np.clip(armpit - 0.025 * H, 0.085 * H, 0.17 * H))
    return dict(tip=float(tip), armpit=float(armpit), sh=sh, wrist=float(wr), bz=bz, by=by)

armL, armR = arm_side(1), arm_side(-1)
zArm = (np.polyval(armL['bz'], armL['sh']) + np.polyval(armR['bz'], armR['sh'])) / 2

# crotch: lowest height where the surface crosses the midline (legs apart); skirts / dresses -> proportions
# (the midline slab spans most of the pelvis depth just above the crotch; touching thighs below it only make a thin
# contact strip). A crossing far down is a skirt / dress hem.
tq = P[np.abs(Z - 0.55 * H) < 0.004 * H]; tdepth = tq[:, 1].max() - tq[:, 1].min() if len(tq) else 0.12 * H
zc = None
for z in np.arange(0.22 * H, 0.58 * H, 0.004 * H):
    q = P[(np.abs(X) < 0.012 * H) & (np.abs(Z - z) < 0.003 * H)]
    if len(q) > 2 and q[:, 1].max() - q[:, 1].min() > 0.5 * tdepth: zc = z; break
skirt = zc is None or zc < 0.40 * H
crotch = 0.465 * H if skirt else float(np.clip(zc - 0.012 * H, 0.43 * H, 0.49 * H))
hipZ = crotch + 0.042 * H

def leg_side(side):
    sd = P[(side * X > 0.005 * H)]
    shin = sd[(sd[:, 2] > 0.06 * H) & (sd[:, 2] < 0.09 * H)]
    ax, ay = (shin[:, 0].max() + shin[:, 0].min()) / 2, (shin[:, 1].max() + shin[:, 1].min()) / 2
    foot = sd[sd[:, 2] < 0.04 * H]
    toe, heel = foot[:, 1].min(), foot[:, 1].max()
    fx = (foot[:, 0].max() + foot[:, 0].min()) / 2
    if not skirt:
        th = sd[(np.abs(sd[:, 2] - (crotch - 0.05 * H)) < 0.006 * H)]
        thx = (th[:, 0].max() + th[:, 0].min()) / 2 if len(th) > 4 else side * 0.06 * H
        hx = side * float(np.clip(abs(thx) * 0.92, 0.045 * H, 0.08 * H))
    else:
        hx = side * float(np.clip(abs(ax) * 0.7, 0.05 * H, 0.07 * H))
    return dict(ankle=Vector((ax, ay, 0.05 * H)), toe=float(toe), heel=float(heel), fx=float(fx), hx=hx)

legL, legR = leg_side(1), leg_side(-1)

def slice_center(z, half=0.11):
    m = (np.abs(Z - z) < 0.004 * H) & (np.abs(X) < half * H)
    q = P[m]
    if len(q) < 4: return 0.0, 0.0, 0.0
    return (q[:, 0].max() + q[:, 0].min()) / 2, (q[:, 1].max() + q[:, 1].min()) / 2, (q[:, 1].max() - q[:, 1].min()) / 2

J = {}
def put(n, v): J[n] = Vector(v)

# ---------------------------------------------------------------- fingers: knuckles and lanes from the hand mesh
# T-pose, palm down: the four fingers lie side by side along y (index at the front, -y), the thumb sticks out toward the
# front near the wrist. Joints sit at the knuckles; weights are assigned per lane later (FW).
FW = {}
def fingers_side(side, a, S, zl, yl):
    """hand frame from the mesh (the scan's hand may point a little forward / back of the arm line): u = along the hand,
    w = across it (toward the thumb side = front), lanes across w, phalanges along u"""
    wr, tip = a['wrist'], a['tip']; L = tip - wr
    zc = zl(wr)
    hand = P[(side * X > wr) & (np.abs(Z - zc) < 0.06 * H)]
    W0 = np.array([side * wr, yl(wr), zc])
    d = hand - W0
    # principal direction in the x-y plane, oriented outward
    m = d[:, :2] - d[:, :2].mean(0); cv = m.T @ m; ev, evec = np.linalg.eigh(cv); u2 = evec[:, -1]
    if u2[0] * side < 0: u2 = -u2
    u = np.array([u2[0], u2[1], 0.0]); u /= np.linalg.norm(u)
    w = np.array([-u[1], u[0], 0.0]) * side       # across, sign so that -y (front) is negative w for both hands? fix below
    if w[1] > 0: w = -w                            # w points to the front (-y): the index / thumb side
    al, ac = d @ u, d @ w
    Lh = al.max()
    dk = 0.56 * Lh                                  # knuckle line (MCP), along the hand
    fm = al > dk + 0.01 * H
    a0, a1 = np.percentile(ac[fm], 3), np.percentile(ac[fm], 97)   # across range of the four fingers (front = high)
    lw = (a1 - a0) / 4
    lanes = {}
    for k, f in enumerate(('Index', 'Middle', 'Ring', 'Pinky')):
        hi, lo = a1 - lw * k, a1 - lw * (k + 1)
        q = (ac >= lo) & (ac < hi) & fm
        ft = al[q].max() if q.sum() > 3 else Lh * (1 - 0.04 * k)
        fz = float(np.median(hand[q][:, 2])) if q.sum() > 3 else zc
        base = dk - (0.012 * H if f == 'Pinky' else 0.004 * H if f == 'Index' else 0)
        lanes[f] = dict(lo=lo, hi=hi, base=base, len=ft - base, z=fz)
        for j, t in enumerate((0.0, 0.45, 0.75)):
            pt = W0 + u * (base + (ft - base) * t) + w * ((lo + hi) / 2); pt[2] = fz
            put(S + 'Hand' + f + str(j + 1), pt)
    # Middle1 on the hand axis: the Hand bone points along the real hand (the re-pose straightens it to +-X)
    pm = W0 + u * dk; pm[2] = zl(wr)
    J[S + 'HandMiddle1'] = Vector(pm)
    # thumb: hand verts beyond the index lane (front) between the wrist and the knuckles
    tm = (al < dk + 0.2 * Lh) & (ac > a1 + 0.1 * lw)
    if tm.sum() > 10:
        tq = hand[tm]; tip_t = tq[np.argmax(ac[tm] + 0.5 * al[tm])]
        r0 = W0 + u * (0.1 * Lh) + w * (a1 - 0.3 * lw); r0[2] = zc - 0.008 * H
        thumb = dict(root=Vector(r0), tip=Vector(tip_t))
    else:
        r0 = W0 + u * (0.1 * Lh) + w * (a1 + 0.3 * lw); r0[2] = zc - 0.01 * H
        thumb = dict(root=Vector(r0), tip=Vector(r0 + u * 0.35 * Lh + w * 0.3 * lw))
    for j, t in enumerate((0.0, 0.4, 0.7)):
        put(S + 'HandThumb' + str(j + 1), thumb['root'] + (thumb['tip'] - thumb['root']) * t)
    FW[S] = dict(side=side, W0=Vector(W0), u=Vector(u), w=Vector(w), dk=dk, a1=a1, lw=lw, lanes=lanes, thumb=thumb)

_, hy, hd = slice_center(hipZ + 0.02 * H, 0.2)
put('Hips', (0, hy + 0.1 * hd, hipZ + 0.02 * H))
neckZ = zArm + 0.03 * H
headZ = zArm + 0.44 * (H - zArm)   # skull base (0.56 sat at the nose: jaw weighted to the neck)
for n, f in (('Spine', 0.2), ('Spine1', 0.45), ('Spine2', 0.7)):
    z = J['Hips'].z + (neckZ - J['Hips'].z) * f
    _, y, dd = slice_center(z, 0.16)
    put(n, (0, y + 0.15 * dd, z))
_, ny, nd = slice_center(neckZ + 0.02 * H, 0.06)
put('Neck', (0, ny, neckZ))
_, hy2, _ = slice_center(headZ + 0.04 * H, 0.08)
put('Head', (0, hy2, headZ))
for side, a in ((1, armL), (-1, armR)):
    S = 'Left' if side > 0 else 'Right'
    # canonical: every arm-chain joint on one horizontal line (shoulder height + depth of the arm at the shoulder)
    zl = lambda d: float(np.polyval(a['bz'], d)); yl = lambda d: float(np.polyval(a['by'], d))
    el = a['sh'] + 0.56 * (a['wrist'] - a['sh'])
    put(S + 'Shoulder', (side * max(0.025 * H, a['sh'] - 0.085 * H), yl(a['sh']), zl(a['sh'])))
    put(S + 'Arm', (side * a['sh'], yl(a['sh']), zl(a['sh'])))
    put(S + 'ForeArm', (side * el, yl(el), zl(el)))
    put(S + 'Hand', (side * a['wrist'], yl(a['wrist']), zl(a['wrist'])))
    fingers_side(side, a, S, zl, yl)
for side, l in ((1, legL), (-1, legR)):
    S = 'Left' if side > 0 else 'Right'
    hip = Vector((l['hx'], J['Hips'].y, hipZ))
    an = l['ankle']
    put(S + 'UpLeg', hip)
    put(S + 'Leg', hip + (an - hip) * 0.515)
    put(S + 'Foot', an)
    L = l['heel'] - l['toe']
    put(S + 'ToeBase', (l['fx'], l['toe'] + 0.27 * L, 0.018 * H))
TAIL = {'Head': lambda: J['Head'] + Vector((0, 0, H - J['Head'].z))}
PARENT = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head'}
for S in ('Left', 'Right'):
    PARENT.update({S + 'Shoulder': 'Spine2', S + 'Arm': S + 'Shoulder', S + 'ForeArm': S + 'Arm', S + 'Hand': S + 'ForeArm',
                   S + 'UpLeg': 'Hips', S + 'Leg': S + 'UpLeg', S + 'Foot': S + 'Leg', S + 'ToeBase': S + 'Foot'})
    CHILD.update({S + 'Shoulder': S + 'Arm', S + 'Arm': S + 'ForeArm', S + 'ForeArm': S + 'Hand', S + 'Hand': S + 'HandMiddle1',
                  S + 'UpLeg': S + 'Leg', S + 'Leg': S + 'Foot', S + 'Foot': S + 'ToeBase'})
    for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'):
        PARENT[S + 'Hand' + f + '1'] = S + 'Hand'
        PARENT[S + 'Hand' + f + '2'] = S + 'Hand' + f + '1'; CHILD[S + 'Hand' + f + '1'] = S + 'Hand' + f + '2'
        PARENT[S + 'Hand' + f + '3'] = S + 'Hand' + f + '2'; CHILD[S + 'Hand' + f + '2'] = S + 'Hand' + f + '3'
    side = 1 if S == 'Left' else -1
    TAIL[S + 'ToeBase'] = (lambda S=S: Vector((J[S + 'ToeBase'].x, (legL if S == 'Left' else legR)['toe'], J[S + 'ToeBase'].z)))
    for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'):
        TAIL[S + 'Hand' + f + '3'] = (lambda S=S, f=f: J[S + 'Hand' + f + '3'] + (J[S + 'Hand' + f + '3'] - J[S + 'Hand' + f + '2']) * 0.8)

# ---------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('Armature', arm_data)
scene.collection.objects.link(rig)
activate(rig)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
for n in J:
    b = eb.new('mixamorig:' + n)
    b.head = J[n]
    t = TAIL[n]() if n in TAIL else (J[CHILD[n]] if n in CHILD else J[n] + Vector((0, 0, 0.05 * H)))
    if (t - b.head).length < 1e-4: t = b.head + Vector((0, 0, 0.02 * H))
    b.tail = t
    b.roll = 0
for n in J:
    if PARENT.get(n): eb['mixamorig:' + n].parent = eb['mixamorig:' + PARENT[n]]
bpy.ops.object.mode_set(mode='OBJECT')
FINGER = lambda n: 'Hand' in n and any(f in n for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'))
for b in arm_data.bones:
    b.use_deform = not FINGER(b.name)      # off for bone heat; switched on after the finger weights are written

# ---------------------------------------------------------------- LOD meshes (decimated copies of the cleaned mesh)
bpy.ops.object.select_all(action='DESELECT')
activate(body)
bpy.ops.object.shade_smooth()
src_tris = sum(len(p.vertices) - 2 for p in me.polygons)
lods = []
for li, target in enumerate(LODS):
    o = body.copy(); o.data = body.data.copy(); scene.collection.objects.link(o)
    o.name = 'LOD%d_body' % li
    ratio = 1.0 if target <= 0 else min(1.0, target / max(1, src_tris))
    if ratio < 0.999:
        md = o.modifiers.new('dec', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = ratio; md.use_collapse_triangulate = True
        activate(o); bpy.ops.object.modifier_apply(modifier=md.name)
    lods.append(o)


def finger_weights(o):
    """finger lanes past the knuckles take over from the Hand bone (smooth ramps across knuckles and lanes)"""
    def g(n): return o.vertex_groups.get(n) or o.vertex_groups.new(name=n)
    for S, F in FW.items():
        W0, u, w = F['W0'], F['u'], F['w']
        for v in o.data.vertices:
            d = v.co - W0
            al = d.dot(u)
            if al < 0 or abs(d.z) > 0.07 * H: continue
            ac = d.dot(w)
            wset = {}
            ramp = min(1.0, max(0.0, (al - (F['dk'] - 0.012 * H)) / (0.022 * H)))
            if ramp > 0:
                for k, (f, ln) in enumerate(F['lanes'].items()):
                    c = (ln['lo'] + ln['hi']) / 2; hw = (ln['hi'] - ln['lo']) / 2
                    dd = abs(ac - c)
                    lane = 1.0 if dd < hw * 0.7 else max(0.0, 1 - (dd - hw * 0.7) / (hw * 0.6))
                    if f == 'Index' and ac > c: lane = 1.0
                    if f == 'Pinky' and ac < c: lane = 1.0
                    if lane <= 0: continue
                    t = (al - ln['base']) / max(1e-4, ln['len'])
                    for j, a0, a1 in ((1, -9, 0.45), (2, 0.45, 0.75), (3, 0.75, 9)):
                        bl = 0.05
                        if a0 + bl <= t < a1 - bl: wj = 1.0
                        elif abs(t - a0) < bl: wj = 0.5 + 0.5 * (t - a0) / bl
                        elif abs(t - a1) < bl: wj = 0.5 - 0.5 * (t - a1) / bl
                        else: wj = 0.0
                        if wj > 0: wset[S + 'Hand' + f + str(j)] = wset.get(S + 'Hand' + f + str(j), 0) + wj * lane * ramp
            T = F['thumb']; r0, r3 = T['root'], T['tip']
            ax = r3 - r0; L2 = ax.length_squared
            if L2 > 1e-8 and ac > F['a1'] - 0.2 * F['lw'] and al < F['dk'] + 0.25 * F['lw'] * 4:
                t = (v.co - r0).dot(ax) / L2
                if -0.2 < t < 1.4:
                    dist = (v.co - (r0 + ax * max(0, min(1, t)))).length
                    if dist < 0.03 * H:
                        k = min(1.0, max(0.0, (ac - (F['a1'] - 0.2 * F['lw'])) / (0.4 * F['lw'])))
                        j = 1 if t < 0.4 else 2 if t < 0.7 else 3
                        wset[S + 'HandThumb' + str(j)] = wset.get(S + 'HandThumb' + str(j), 0) + k * min(1.0, (t + 0.2) / 0.35)
            tot = sum(wset.values())
            if tot <= 0: continue
            keep = max(0.0, 1 - min(1.0, tot))
            for ge in list(v.groups): ge.weight *= keep
            sc = min(1.0, tot) / tot
            for n, wv in wset.items(): g('mixamorig:' + n).add([v.index], wv * sc, 'ADD')

# ---------------------------------------------------------------- weights: bone heat on a watertight proxy
deform = [b.name for b in arm_data.bones if b.use_deform]
def heat(voxel, upscale):
    """bone heat on a voxel remesh of the body; returns (proxy, bones that got no weight)"""
    pr = body.copy(); pr.data = body.data.copy(); scene.collection.objects.link(pr); pr.name = 'proxy'
    rm = pr.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel * H; rm.use_smooth_shade = True
    activate(pr); bpy.ops.object.modifier_apply(modifier=rm.name)
    # bone heat is more reliable at a larger scale (its solver has absolute tolerances)
    pr.scale = (upscale,) * 3; rig.scale = (upscale,) * 3
    bpy.ops.object.select_all(action='DESELECT')
    pr.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    pr.parent = None; pr.matrix_parent_inverse.identity()
    pr.scale = (1, 1, 1); rig.scale = (1, 1, 1); pr.location = (0, 0, 0)
    bpy.context.view_layer.update()
    W = np.zeros(len(deform))
    gi = {pr.vertex_groups[n].index: k for k, n in enumerate(deform) if pr.vertex_groups.get(n)}
    for v in pr.data.vertices:
        for ge in v.groups:
            if ge.group in gi and ge.weight > 0.01: W[gi[ge.group]] += 1
    return pr, [deform[k] for k in range(len(deform)) if W[k] == 0]
proxy, empty = None, deform
for voxel, up in ((0.0075, 10), (0.0075, 1), (0.009, 10), (0.006, 10), (0.011, 30)):
    if proxy is not None: bpy.data.objects.remove(proxy, do_unlink=True)
    proxy, empty = heat(voxel, up)
    major = [n for n in empty if not n.endswith('ToeBase')]
    if not major: break
    log('heat try', voxel, up, 'empty', len(empty))
heat_ok = not [n for n in empty if not n.endswith('ToeBase')]
if not heat_ok:
    # bone heat failed for some bones: envelope-like fallback (nearest bone segments) for the whole proxy
    log('heat failed for', empty, '-> distance weights')
    for g in list(proxy.vertex_groups): proxy.vertex_groups.remove(g)
    segs = [(n, rig.matrix_world @ arm_data.bones[n].head_local, rig.matrix_world @ arm_data.bones[n].tail_local) for n in deform]
    groups = {n: proxy.vertex_groups.new(name=n) for n in deform}
    for v in proxy.data.vertices:
        p = v.co; ds = []
        for n, a, b in segs:
            ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
            ds.append(((p - (a + ab * t)).length, n))
        ds.sort(); d0 = ds[0][0] + 1e-4
        ws = [(n, math.exp(-((d - d0) / (0.02 * H)) ** 2)) for d, n in ds[:3]]
        tot = sum(w for _, w in ws)
        for n, w in ws: groups[n].add([v.index], w / tot, 'REPLACE')
activate(proxy)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=4, expand=0.0)
bpy.ops.object.mode_set(mode='OBJECT')
for o in lods:
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    for n in deform: o.vertex_groups.new(name=n)
    dt = o.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = proxy
    dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    activate(o); bpy.ops.object.modifier_apply(modifier=dt.name)
    # vertices that got no weight (bits of the proxy that bone heat left empty, e.g. a fingertip island) take the
    # weights of the nearest weighted vertex: an unweighted vertex would collapse to the origin as a long spike
    from mathutils import kdtree
    vs = o.data.vertices
    # ... and vertices whose strongest bone is far away (bone heat sometimes hands a detached proxy island, e.g. a
    # fingertip, to a foot bone): they would be dragged across the body as a long spike
    from mathutils.geometry import intersect_point_line
    names0 = {g.index: g.name for g in o.vertex_groups}
    segs = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in arm_data.bones}
    def far(v):
        if not v.groups: return True
        g = max(v.groups, key=lambda e: e.weight); a, b = segs[names0[g.group]]
        p, t = intersect_point_line(v.co, a, b); t = max(0.0, min(1.0, t))
        return (v.co - (a + (b - a) * t)).length > 0.2 * H
    good, bad = [], []
    for v in vs: (bad if sum(g.weight for g in v.groups) <= 0.5 or far(v) else good).append(v.index)
    if bad and good:
        kd = kdtree.KDTree(len(good))
        for i, vi in enumerate(good): kd.insert(vs[vi].co, i)
        kd.balance()
        names = {g.index: g.name for g in o.vertex_groups}
        for vi in bad:
            _, j, _ = kd.find(vs[vi].co); src = vs[good[j]]
            for g in list(vs[vi].groups): o.vertex_groups[names[g.group]].remove([vi])
            for g in src.groups: o.vertex_groups[names[g.group]].add([vi], g.weight, 'REPLACE')
        log(o.name, 'fixed unweighted verts', len(bad))
    finger_weights(o)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = rig
    o.parent = rig
bpy.data.objects.remove(proxy, do_unlink=True)
bpy.data.objects.remove(body, do_unlink=True)
for b in arm_data.bones: b.use_deform = True

# ---------------------------------------------------------------- color probe for the far crowd tier (positions + UVs of LOD1, T-pose)
try:
    o1 = lods[1]; uvl = o1.data.uv_layers[0].data
    pr = np.array([list(o1.data.vertices[l.vertex_index].co) + list(uvl[l.index].uv) for l in o1.data.loops], dtype=np.float32)
    np.save(os.path.join(OUT, PID + '_probe.npy'), pr)
    json.dump({'H': float(H), 'zArm': float(zArm), 'headZ': float(headZ), 'sh': [armL['sh'], armR['sh']], 'wrist': [armL['wrist'], armR['wrist']], 'crotch': float(crotch), 'hat': HAT},
              open(os.path.join(OUT, PID + '_probe.json'), 'w'))
except Exception as e:
    log('probe failed', e)

# ---------------------------------------------------------------- re-pose to the canonical T-pose and apply as rest
activate(rig)
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
def aim(n, want):
    b = pb['mixamorig:' + n]
    bpy.context.view_layer.update()
    m = b.matrix.copy(); head = m.to_translation()
    cur = (b.tail - b.head).normalized()
    R = cur.rotation_difference(Vector(want).normalized()).to_matrix().to_4x4()
    b.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ m
    bpy.context.view_layer.update()
foot_rot = {S: pb['mixamorig:' + S + 'Foot'].matrix.to_3x3().copy() for S in ('Left', 'Right')}
for S, sx in (('Left', 1), ('Right', -1)):
    for n in ('Shoulder', 'Arm', 'ForeArm', 'Hand'): aim(S + n, (sx, 0, 0))
    for n in ('UpLeg', 'Leg'): aim(S + n, (0, 0, -1))
    b = pb['mixamorig:' + S + 'Foot']; bpy.context.view_layer.update()
    b.matrix = Matrix.Translation(b.matrix.to_translation()) @ foot_rot[S].to_4x4(); bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
for o in lods:
    activate(o)
    bpy.ops.object.modifier_apply(modifier='Armature')
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = rig
activate(rig)
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
# re-ground: lowest point of LOD0 on z = 0
z0 = min((o.matrix_world @ v.co).z for v in lods[0].data.vertices)
rig.location.z -= z0
bpy.context.view_layer.update()
activate(rig); bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
for o in lods:
    activate(o); bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# one material slot named personBody (textures are loaded by the game separately)
mat = bpy.data.materials.new('personBody')
for o in lods:
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons: p.material_index = 0
    # keep only the first UV map
    while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[-1])

# ---------------------------------------------------------------- meta + export
bones = {b.name.replace('mixamorig:', ''): list(rig.matrix_world @ b.head_local) for b in arm_data.bones}
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in lods}
allv = [o.matrix_world @ v.co for v in lods[0].data.vertices]
meta = {'id': PID, 'src': SRC, 'height': max(v.z for v in allv), 'hipH': bones['Hips'][2], 'tris': tris, 'heatOK': heat_ok,
        'skirt': bool(skirt), 'crotch': float(crotch), 'joints': {k: [round(x, 4) for x in v] for k, v in bones.items()},
        'armpit': [armL['armpit'], armR['armpit']], 'width': max(v.x for v in allv) - min(v.x for v in allv)}
json.dump(meta, open(os.path.join(OUT, PID + '.json'), 'w'), indent=1)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in lods: o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, PID + '.glb'), export_format='GLB', use_selection=True,
                          export_animations=False, export_skins=True, export_all_influences=False,
                          export_materials='PLACEHOLDER', export_image_format='NONE', export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10,
                          export_draco_texcoord_quantization=12, export_draco_generic_quantization=12,
                          export_tangents=False, export_normals=True, export_def_bones=True, export_rest_position_armature=True)
if A.get('blend'): bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, PID + '.blend'))
log('done', json.dumps({k: meta[k] for k in ('height', 'hipH', 'tris', 'heatOK', 'skirt')}))
