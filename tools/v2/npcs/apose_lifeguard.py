# Lifeguard scans (Models/Characters/Character 1-2, posed: arms down, a hand on the hip) -> T-posed GLB that
# rig_person.py can landmark. Hand-tuned per model (landmarks in LM below, picked from the plot sheets).
#   blender -b --python-exit-code 1 -P tools/v2/npcs/apose_lifeguard.py -- --in <glb> --id c01 --height 1.68 --mode plot|pose
#     --out tools/v2/npcs/out/lifeguard
# plot: cleaned mesh -> front / side / top-slice sheets with a 5 cm grid (to pick landmarks)
# pose: temporary arm armature on the hand-picked landmarks, own skin weights (geodesic arm membership, hand cut free
#       from the hip), arms raised to the T-pose (along +-X, palms down) with dual-quaternion skinning, applied, exported
#       with the scan's UVs (KHR_texture_transform baked in) -> <out>/<id>_tpose.glb + check renders.
# Reads the GLB as data only; never opens .blend files or runs scripts from downloads.
import bpy, bmesh, sys, os, json, math, struct
import numpy as np
from mathutils import Vector, Matrix, Quaternion, kdtree

argv = sys.argv[sys.argv.index('--') + 1:]
A = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
SRC, PID, OUT, MODE = A['in'], A['id'], A['out'], A.get('mode', 'plot')
HT = float(A.get('height', 1.75))
os.makedirs(OUT, exist_ok=True)
log = lambda *a: print('[apose]', PID, *a, flush=True)

# ---------------------------------------------------------------- load (GLB json read as data for the UV transform)
raw = open(SRC, 'rb').read()
gj = json.loads(raw[20:20 + struct.unpack('<I', raw[12:16])[0]])
tt = gj['materials'][0]['pbrMetallicRoughness']['baseColorTexture'].get('extensions', {}).get('KHR_texture_transform', {})
toff, tsc = tt.get('offset', [0, 0]), tt.get('scale', [1, 1])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for m in meshes:
    mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
def activate(o):
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
for x in meshes: x.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active; body.name = 'body'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = body.data

# bake the texture transform into the UVs (glTF: uv' = off + s * uv, v flipped in Blender)
uvl = me.uv_layers[0].data
uv = np.empty(len(uvl) * 2); uvl.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
ug, vg = uv[:, 0], 1 - uv[:, 1]
ug = toff[0] + tsc[0] * ug; vg = toff[1] + tsc[1] * vg
uv = np.stack([ug, 1 - vg], 1); uvl.foreach_set('uv', uv.ravel())
log('uv range', uv.min(0).round(3), uv.max(0).round(3))
while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])
# material: keep the scan's base color image only (renders + export)
for m in bpy.data.materials:
    nt = m.node_tree
    img = next((n.image for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('Color') and 'Emission' not in n.image.name), None)
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color']); nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    bs.inputs['Roughness'].default_value = 0.8
    nt.nodes.active = tx

def V():
    a = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', a); return a.reshape(-1, 3)
P = V(); mn, mx = P.min(0), P.max(0)
low = P[P[:, 2] < mn[2] + 0.03 * (mx[2] - mn[2])]
ank = P[(P[:, 2] > mn[2] + 0.08 * (mx[2] - mn[2])) & (P[:, 2] < mn[2] + 0.12 * (mx[2] - mn[2]))]
if (low[:, 1].min() + low[:, 1].max()) / 2 > ank[:, 1].mean():
    me.transform(Matrix.Rotation(math.pi, 4, 'Z')); P = V()
mn, mx = P.min(0), P.max(0)
s = HT / (mx[2] - mn[2])
feet = P[P[:, 2] < mn[2] + 0.1 * (mx[2] - mn[2])]
me.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-(mn[0] + mx[0]) / 2, -(feet[:, 1].min() + feet[:, 1].max()) / 2, -mn[2])))
me.update()

# ---------------------------------------------------------------- clean: weld the UV-seam splits, drop stray islands
bm = bmesh.new(); bm.from_mesh(me)
nv0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=HT * 2e-5)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
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
drop = [v for comp in islands[1:] if len(comp) < max(60, len(islands[0]) * 0.004) for v in comp]
if drop: bmesh.ops.delete(bm, geom=drop, context='VERTS')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free(); me.update()
log('clean verts', nv0, '->', len(me.vertices), 'islands', len(islands), 'sizes', [len(c) for c in islands[:6]], 'dropped', len(drop))
P = V()

# ---------------------------------------------------------------- plot helpers (numpy raster -> PNG through bpy images)
def save_png(img, path):
    h, w = img.shape[:2]
    im = bpy.data.images.new('p', w, h)
    px = np.concatenate([img[::-1].astype(np.float32) / 255, np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels.foreach_set(px.ravel()); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)

def sheet(Q, path, views, S=1000, marks=None, cols=None):
    """views: list of (axis_h, axis_v, x_off, sign_h, (vmin, vmax) or None); 5 cm grid, 25 cm darker; marks: {name: xyz}"""
    W = 40 + sum(int(w * S) + 40 for *_, w in views); Hh = int((Q[:, 2].max() + 0.06) * S) + 40
    img = np.full((Hh, W, 3), 255, np.uint8)
    x0 = 40
    for ah, av, sh, w in views:
        cxp = x0 + int(w * S / 2)
        for g in np.arange(-3, 3.001, 0.05):
            gx = int(cxp + sh * g * S)
            if x0 <= gx < x0 + int(w * S): img[:, gx] = (200, 200, 255) if abs(g * 4 - round(g * 4)) > 1e-6 else (120, 120, 220)
        for g in np.arange(0, 3, 0.05):
            gy = int(Hh - 20 - g * S)
            if 0 <= gy < Hh: img[gy, x0:x0 + int(w * S)] = (200, 200, 255) if abs(g * 4 - round(g * 4)) > 1e-6 else (120, 120, 220)
        xs = (cxp + sh * Q[:, ah] * S).astype(int); ys = (Hh - 20 - Q[:, av] * S).astype(int)
        ok = (xs >= x0) & (xs < x0 + int(w * S)) & (ys >= 0) & (ys < Hh)
        img[ys[ok], xs[ok]] = (90, 90, 90) if cols is None else cols[ok]
        if marks:
            for n, p in marks.items():
                px_, py_ = int(cxp + sh * p[ah] * S), int(Hh - 20 - p[av] * S)
                img[max(0, py_ - 3):py_ + 4, max(0, px_ - 3):px_ + 4] = (230, 0, 0)
        x0 += int(w * S) + 40
    save_png(img, path)

def render_views(obj, path, views, size=700, light='STUDIO', color='TEXTURE'):
    """views: list of (dir xyz from target to camera, target xyz, ortho scale); composed side by side"""
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = light; sc.display.shading.color_type = color
    sc.display.shading.show_cavity = False
    sc.render.resolution_x = size; sc.render.resolution_y = size; sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new('w')
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam; cam.data.type = 'ORTHO'; cam.data.clip_start = 0.01; cam.data.clip_end = 20
    tiles = []
    for k, (d, t, osz) in enumerate(views):
        d = Vector(d).normalized(); t = Vector(t)
        cam.location = t + d * 5; cam.data.ortho_scale = osz
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        f = path + '.tmp%d.png' % k; sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(f); a = np.array(im.pixels[:]).reshape(size, size, 4)[::-1, :, :3]
        tiles.append((a * 255).astype(np.uint8)); bpy.data.images.remove(im); os.remove(f)
    save_png(np.concatenate(tiles, 1), path)

if MODE == 'plot':
    c = HT / 2
    render_views(body, os.path.join(OUT, PID + '_src_views.png'), [((0, -1, 0), (0, 0, c), HT * 1.05), ((1, 0, 0), (0, 0, c), HT * 1.05), ((0, 1, 0), (0, 0, c), HT * 1.05), ((-1, 0, 0), (0, 0, c), HT * 1.05)], size=800)
    for nm_, d in (('L', 1), ('R', -1)):
        render_views(body, os.path.join(OUT, PID + '_src_arm' + nm_ + '.png'), [((0, -1, 0), (d * 0.17, 0, 0.62 * HT), 0.5), ((d, 0, 0), (d * 0.17, 0, 0.62 * HT), 0.5), ((0, 1, 0), (d * 0.17, 0, 0.62 * HT), 0.5), ((d, -1, 0), (d * 0.17, 0, 0.62 * HT), 0.5)], size=700)
    np.save(os.path.join(OUT, PID + '_verts.npy'), P.astype(np.float32))
    # front (x right = +X, viewer at -Y), side (y), and zoomed hand / shoulder detail at 2.5x
    sheet(P, os.path.join(OUT, PID + '_plot_front.png'), [(0, 2, 1, 0.9), (1, 2, -1, 0.5)], S=900 / HT)
    for nm_, (zlo, zhi) in (('shoulder', (0.62, 0.86)), ('hip', (0.42, 0.66))):
        Q = P[(P[:, 2] > zlo * HT) & (P[:, 2] < zhi * HT)].copy(); Q[:, 2] -= zlo * HT
        sheet(Q, os.path.join(OUT, PID + '_plot_' + nm_ + '.png'), [(0, 2, 1, 0.6), (1, 2, -1, 0.35)], S=2600)
        log('zoom', nm_, 'z offset', round(zlo * HT, 3))
    # horizontal slices: x-y outlines every 4 cm in the arm range
    for z in np.arange(0.40, 0.84, 0.04):
        pass
    zs = np.arange(0.44, 0.84, 0.03) * HT
    rows = []
    for z in zs:
        q = P[np.abs(P[:, 2] - z) < 0.003]
        rows.append(q)
    S = 1200; cw, ch = int(0.9 * S), int(0.45 * S)
    ncol = 4; nrow = math.ceil(len(zs) / ncol)
    img = np.full((nrow * (ch + 20), ncol * (cw + 20), 3), 255, np.uint8)
    for k, q in enumerate(rows):
        ox, oy = (k % ncol) * (cw + 20), (k // ncol) * (ch + 20)
        for g in np.arange(-0.45, 0.451, 0.05):
            gx = int(ox + cw / 2 + g * S); img[oy:oy + ch, gx] = (200, 200, 255)
        for g in np.arange(-0.2, 0.201, 0.05):
            gy = int(oy + ch / 2 + g * S); img[gy, ox:ox + cw] = (200, 200, 255)
        xs = (ox + cw / 2 + q[:, 0] * S).astype(int); ys = (oy + ch / 2 + q[:, 1] * S).astype(int)
        ok = (xs > ox) & (xs < ox + cw) & (ys > oy) & (ys < oy + ch)
        img[ys[ok], xs[ok]] = (0, 0, 0)
        # label: tick count = slice index
        img[oy + 4:oy + 10, ox + 4:ox + 4 + 8 * (k + 1):8] = (220, 0, 0)
    save_png(img[::-1], os.path.join(OUT, PID + '_plot_slices.png'))
    log('slices z', [round(z, 3) for z in zs])
    log('bbox', P.min(0).round(3), P.max(0).round(3))
    sys.exit(0)

# ================================================================ pose
# Hand-picked landmarks (meters, after the normalize above: feet on z=0, facing -Y, +X = the person's left), read off
# the plot sheets (*_plot_*.png, arm zooms with a 1 cm grid). sh = shoulder joint center, el = elbow, wr = wrist,
# kn = middle knuckle, tip = finger tips (optional: straightens the fingers), palm = rough palm normal (sign hint),
# pca = refine the palm normal from the hand mesh (flat hands; off for fists), zone = radius around the shoulder joint
# inside which arm and body skin stay connected (outside it, touching arm / body skin is cut apart and capped).
LM = {
    'c01': {'spine_y': 0.01, 'legx': 0.085,
            'L': dict(sh=(0.168, 0.045, 1.33), el=(0.31, 0.13, 1.135), wr=(0.195, 0.012, 0.99), kn=(0.13, -0.045, 0.975),
                      tip=(0.075, -0.075, 0.955), palm=(-0.75, 0.62, 0.1), pca=False, zone=0.085,
                      # thumb wrapped around the waist (to the back): swung to the front of the hand
                      thumb=dict(base=(0.183, 0.017, 0.99), tip=(0.10, 0.048, 1.032), r=0.02)),
            'R': dict(sh=(-0.172, 0.02, 1.33), el=(-0.186, 0.012, 1.065), wr=(-0.184, -0.036, 0.835), kn=(-0.192, -0.055, 0.745),
                      tip=(-0.19, -0.045, 0.665), palm=(1.0, 0.0, 0.0), pca=True, zone=0.085),
            # (arm, center, radius, star axis xy): where the hand / arm is fused to the body; inside the sphere the body
            # surface is interpolated from the ring around it (radius from the axis vs. angle and height) and skin
            # standing out of it belongs to the arm
            'contacts': [('L', (0.155, -0.02, 0.975), 0.065, 'cloth'), ('L', (0.10, -0.085, 0.96), 0.055, 'cloth'),
                         ('L', (0.13, 0.035, 1.01), 0.04, 'cloth'), ('L', (0.095, -0.085, 0.995), 0.045, 'clothdrop'),
                         ('R', (-0.17, -0.045, 0.67), 0.065, (-0.09, 0.0), 0.022),
                         ('R', (-0.17, -0.03, 0.76), 0.05, (-0.06, 0.0), 0.022)]},
    'c02': {'spine_y': 0.02, 'legx': 0.09,
            'L': dict(sh=(0.215, 0.05, 1.43), el=(0.245, 0.06, 1.12), wr=(0.25, -0.025, 0.89), kn=(0.258, -0.045, 0.81),
                      tip=None, palm=(-1.0, 0.3, 0.0), pca=False, zone=0.095),
            'R': dict(sh=(-0.215, 0.05, 1.43), el=(-0.25, 0.045, 1.12), wr=(-0.25, -0.07, 0.895), kn=(-0.225, -0.115, 0.80),
                      tip=None, palm=(1.0, 0.3, 0.0), pca=False, zone=0.095),
            'rmax': 1.25, 'skin_tol': 9,      # no skin-only shoulder rule here: it tore the tank-top armholes in the rig
            'contacts': [('L', (0.225, -0.065, 0.79), 0.045, 'cloth')]},
    # Mari (player 2, tools/v2/player/build_mari.sh, 1.69 m): arms hang free of the body, tank top like c02; read from
    # arm slices of mari_verts.npy (armpit ~1.13 m, finger tips ~0.69 m)
    'mari': {'spine_y': 0.02, 'legx': 0.085,
             'L': dict(sh=(0.168, 0.03, 1.33), el=(0.212, 0.026, 1.05), wr=(0.255, -0.035, 0.865), kn=(0.258, -0.058, 0.77),
                       tip=None, palm=(-1.0, 0.3, 0.0), pca=False, zone=0.09),
             'R': dict(sh=(-0.168, 0.03, 1.33), el=(-0.214, 0.026, 1.05), wr=(-0.258, -0.03, 0.865), kn=(-0.258, -0.058, 0.77),
                       tip=None, palm=(1.0, 0.3, 0.0), pca=False, zone=0.09),
             'rmax': 1.25, 'skin_tol': 9},
    # NPC 193 flight-line crewman (1.80 m, Nov 19): arms hang free, a gloved fist round a marshalling wand on each side;
    # read from arm slices of p193_verts.npy (elbow gap opens ~1.12 m, glove cuff ~0.97 m, fist ~0.85 m)
    'p193': {'spine_y': 0.02, 'legx': 0.09,
             'L': dict(sh=(0.195, 0.075, 1.43), el=(0.29, 0.075, 1.12), wr=(0.335, 0.03, 0.965), kn=(0.338, 0.01, 0.85),
                       tip=None, palm=(-1.0, 0.3, 0.0), pca=False, zone=0.095),
             'R': dict(sh=(-0.195, 0.075, 1.43), el=(-0.29, 0.075, 1.12), wr=(-0.333, 0.025, 0.965), kn=(-0.336, 0.01, 0.85),
                       tip=None, palm=(1.0, 0.3, 0.0), pca=False, zone=0.095),
             'rmax': 1.25, 'skin_tol': 9},
}[PID]
for k in ('L', 'R'):
    for j in ('sh', 'el', 'wr', 'kn', 'tip', 'palm'):
        if LM[k].get(j) is not None: LM[k][j] = np.array(LM[k][j], dtype=np.float64)
N = len(P)
from mathutils.bvhtree import BVHTree
bm0 = bmesh.new(); bm0.from_mesh(me); bvh = BVHTree.FromBMesh(bm0); bm0.free()

# ---------------------------------------------------------------- segments (arm bones + body bones that compete for skin)
Hz = HT; sy = LM['spine_y']; lx = LM['legx']
SEG = []   # (label, a, b)
BODY = 0
for side, k, base in ((1, 'L', 1), (-1, 'R', 5)):
    a = LM[k]
    tip = a['tip'] if a.get('tip') is not None else a['kn'] + (a['kn'] - a['wr']) * 0.7
    a['tip_'] = tip
    SEG += [(base, a['sh'], a['el']), (base + 1, a['el'], a['wr']), (base + 2, a['wr'], a['kn']), (base + 3, a['kn'], tip)]
    # shoulder girdle (body): sternum -> just inside the shoulder joint
    SEG.append((BODY, np.array([0, sy, a['sh'][2] + 0.04]), a['sh'] - np.array([side * 0.045, 0, -0.01])))
    SEG += [(BODY, np.array([side * lx, sy, 0.50 * Hz]), np.array([side * lx, sy, 0.28 * Hz])),
            (BODY, np.array([side * lx, sy, 0.28 * Hz]), np.array([side * lx, 0.02, 0.05 * Hz])),
            (BODY, np.array([0, sy, 0.52 * Hz]), np.array([side * lx, sy, 0.50 * Hz]))]
SEG += [(BODY, np.array([0, sy, 0.52 * Hz]), np.array([0, sy, 0.86 * Hz])), (BODY, np.array([0, 0, 0.86 * Hz]), np.array([0, 0, Hz]))]
SA = np.array([s[1] for s in SEG]); SB = np.array([s[2] for s in SEG]); SL = np.array([s[0] for s in SEG])

def seg_closest(Q, a, b):
    ab = b - a; t = np.clip(((Q - a) @ ab) / max(1e-12, ab @ ab), 0, 1)
    return a + t[:, None] * ab, t

# distance of every vertex to every segment
D = np.empty((N, len(SEG))); CP = np.empty((N, len(SEG), 3))
for i in range(len(SEG)):
    c, _ = seg_closest(P, SA[i], SB[i]); CP[:, i] = c; D[:, i] = np.linalg.norm(P - c, axis=1)
armd = D[:, SL > 0].min(1)
near = np.where(armd < 0.16)[0]
label = np.zeros(N, np.int32)
NRM = np.empty(N * 3); me.vertices.foreach_get('normal', NRM); NRM = NRM.reshape(-1, 3)
# an arm segment only owns skin within its limb radius whose normal points away from its axis (skin of the body that
# touches the arm faces the arm: its normal points toward the bone)
RMAX = {k_: v_ * LM.get('rmax', 1.0) for k_, v_ in {1: 0.08, 2: 0.06, 3: 0.06, 4: 0.055}.items()}
seg_ok = np.ones((N, len(SEG)), bool)
for i in range(len(SEG)):
    if SL[i] == 0: continue
    kind = (SL[i] - 1) % 4 + 1
    r = P - CP[:, i]; rn = np.linalg.norm(r, axis=1) + 1e-9
    seg_ok[:, i] = (D[:, i] < RMAX[kind]) & (((r / rn[:, None]) * NRM).sum(1) > (0.3 if kind >= 3 else -0.1))
order = np.argsort(np.where(seg_ok[near], D[near], D[near] + 10), axis=1)
nblock = 0
for ii, vi in enumerate(near):
    v = Vector(P[vi]); best = None
    for si in order[ii][:8]:
        if not seg_ok[vi, si]: continue
        c = Vector(CP[vi, si]); dv = c - v; L = dv.length
        if L < 1e-5: best = si; break
        dn = dv / L
        hit = bvh.ray_cast(v + dn * 0.0008, dn, L - 0.0016)
        if hit[0] is None: best = si; break
        nblock += 1
    if best is None: best = next((si for si in order[ii] if SL[si] == 0), order[ii][0])
    label[vi] = SL[best]
if A.get('dbg'):
    np.save(os.path.join(OUT, PID + '_labels.npy'), label)
    for nm_, box in (('Rtips', ((-0.23, -0.14), (-0.10, 0.02), (0.60, 0.70))), ('Lthumb', ((0.08, 0.20), (0.0, 0.12), (0.97, 1.06)))):
        m = np.all([(P[:, j] > box[j][0]) & (P[:, j] < box[j][1]) for j in range(3)], 0)
        idx = np.where(m)[0]
        log(nm_, len(idx), 'labels', np.bincount(label[idx], minlength=9).tolist())
        for si in range(len(SEG)):
            if SL[si] in (3, 4, 7, 8):
                log('  seg', si, SL[si], 'ok frac', seg_ok[idx, si].mean().round(2), 'dmin', D[idx, si].min().round(3), 'dmed', np.median(D[idx, si]).round(3))
log('labels: near', len(near), 'blocked rays', nblock, 'counts', np.bincount(label, minlength=9).tolist())

# ---------------------------------------------------------------- mesh graph; keep each arm one connected piece
E = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
adj = [[] for _ in range(N)]
for a_, b_ in E: adj[a_].append(b_); adj[b_].append(a_)
side_of = lambda l: 0 if l == 0 else (1 if l <= 4 else 2)
SIDE = np.array([side_of(l) for l in range(9)])
def components(mask):
    seen = np.zeros(N, bool); comps = []
    for s0 in np.where(mask)[0]:
        if seen[s0]: continue
        st = [s0]; seen[s0] = True; comp = []
        while st:
            x = st.pop(); comp.append(x)
            for y in adj[x]:
                if mask[y] and not seen[y]: seen[y] = True; st.append(y)
        comps.append(comp)
    return sorted(comps, key=len, reverse=True)
# ---------------------------------------------------------------- per-vertex albedo (scan texture at the vertex UVs)
img = next(i for i in bpy.data.images if i.name.endswith('Color') and 'Emission' not in i.name)
IW, IH = img.size
TEX = np.empty(IW * IH * 4, np.float32); img.pixels.foreach_get(TEX); TEX = TEX.reshape(IH, IW, 4)[:, :, :3]
LV = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', LV)
LUV = np.empty(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', LUV); LUV = LUV.reshape(-1, 2)
def tex_at(uv):
    px = np.clip((uv[:, 0] % 1) * (IW - 1), 0, IW - 1).astype(int); py = np.clip((uv[:, 1] % 1) * (IH - 1), 0, IH - 1).astype(int)
    return TEX[py, px]
VC = np.zeros((N, 3)); cntc = np.zeros(N)
np.add.at(VC, LV, tex_at(LUV)); np.add.at(cntc, LV, 1); VC /= np.maximum(cntc, 1)[:, None]
SKIN = (VC[:, 1] / np.maximum(VC[:, 0], 1e-3) > 0.42) & (VC[:, 0] > 0.18)
if A.get('dbg'):
    for nm_, m in (('arm', label != 0), ('body', label == 0)):
        log('albedo', nm_, 'median', np.median(VC[m], 0).round(3), 'skin frac', SKIN[m].mean().round(2))

# ---------------------------------------------------------------- contacts: hand / arm skin fused to the body
CT = LM.get('contacts', [])
in_any = np.zeros(N, bool)
for k, c, r, ax, *_ in CT: in_any |= np.linalg.norm(P - np.array(c), axis=1) < r
for k, c, r, ax, *_ in CT:
    c = np.array(c); base = 1 if k == 'L' else 5
    d = np.linalg.norm(P - c, axis=1)
    segs = [i for i in range(len(SEG)) if SL[i] in (base, base + 1, base + 2, base + 3)]
    if ax == 'clothdrop':
        continue                                  # handled with the drops: skin left on the cloth there goes
    if ax == 'cloth':
        # bare hand on clothing: skin-colored = the hand, cloth = the body
        idx = np.where(d < r)[0]
        sk = SKIN[idx]
        for vi, isk in zip(idx, sk):
            label[vi] = SL[min(segs, key=lambda si: D[vi, si])] if isk else 0
        log('contact', k, c, r, 'cloth split: skin', int(sk.sum()), 'cloth', int((~sk).sum()))
        continue
    # local body surface: quadric height field fitted to the body skin in a ring around the contact
    ref = np.where((label == 0) & ~in_any & (d < 1.9 * r))[0]
    n = NRM[ref].mean(0); n /= np.linalg.norm(n)
    e1 = np.cross(n, [0, 0, 1.0]); e1 = e1 / np.linalg.norm(e1) if np.linalg.norm(e1) > 1e-3 else np.array([1.0, 0, 0]); e2 = np.cross(n, e1)
    def uvh(Q):
        R0 = Q - c; return R0 @ e1, R0 @ e2, R0 @ n
    u, v, h = uvh(P[ref])
    Mq = np.stack([u * u, u * v, v * v, u, v, np.ones_like(u)], 1)
    coef = np.linalg.lstsq(Mq, h, rcond=None)[0]
    res = np.abs(Mq @ coef - h)
    idx = np.where(d < r)[0]
    u, v, h = uvh(P[idx])
    hq = h - np.stack([u * u, u * v, v * v, u, v, np.ones_like(u)], 1) @ coef
    facing = NRM[idx] @ n
    segs = [i for i in range(len(SEG)) if SL[i] in (base, base + 1, base + 2, base + 3)]
    add = rem = 0
    for j, vi in enumerate(idx):
        # keep the ray / normal labels unless the body surface clearly disagrees: skin well above it is the arm's
        # (fingertips fused to the thigh), arm-labeled skin lying on it and facing out like it is the body's
        if label[vi] == 0 and hq[j] > 0.007:
            label[vi] = SL[min(segs, key=lambda si: D[vi, si])]; add += 1
        elif label[vi] != 0 and hq[j] < 0.003 and facing[j] > 0.5:
            label[vi] = 0; rem += 1
    log('contact', k, c, r, 'verts', len(idx), '+arm', add, '-arm', rem, 'ref', len(ref), 'fit res %.4f' % np.median(res))

# arm skin only: non-skin colored bits labeled upper arm near the shoulder (shirt armholes, suit straps) are the body's
fore = np.isin(label, (2, 6))
SKINREF = np.median(VC[fore], 0) if fore.any() else np.array([0.6, 0.4, 0.3])
chrom = lambda c: c / np.maximum(c.sum(-1, keepdims=True), 1e-3)      # brightness-free: shaded skin is still skin
skin_like = np.linalg.norm(chrom(VC) - chrom(SKINREF), axis=1) < float(A.get('skin_tol', LM.get('skin_tol', 0.07)))
for k, base in (('L', 1), ('R', 5)):
    near_sh = np.linalg.norm(P - LM[k]['sh'], axis=1) < LM[k]['zone'] * 1.6
    m = (label == base) & near_sh & ~skin_like
    label[m] = 0
    log(k, 'non-skin shoulder verts -> body', int(m.sum()), 'skin ref', SKINREF.round(2))
# smooth the arm / body border (ragged borders leave flaps when the arm swings away): neighbor majority
zone_any = np.zeros(N, bool)
for k in ('L', 'R'): zone_any |= np.linalg.norm(P - LM[k]['sh'], axis=1) < LM[k]['zone']
for it in range(int(A.get('smooth_lab', 8))):
    sd_ = SIDE[label]; chg = 0
    bnd = np.unique(E[sd_[E[:, 0]] != sd_[E[:, 1]]].ravel())
    newl = label.copy()
    for vi in bnd:
        nb = [label[y] for y in adj[vi]]
        nsd = [SIDE[l] for l in nb]
        best = max(set(nsd), key=nsd.count)
        if best != sd_[vi] and nsd.count(best) >= 0.6 * len(nsd):
            cand_ = [l for l in nb if SIDE[l] == best]; newl[vi] = max(set(cand_), key=cand_.count); chg += 1
    label = newl
log('border smoothing changed', chg)

# inside the cloth contacts: close small gaps (painted nails, seams) by neighbor majority
cloth_zone = np.zeros(N, bool)
for k, c, r, ax, *_ in CT:
    if ax == 'cloth': cloth_zone |= np.linalg.norm(P - np.array(c), axis=1) < r
for it in range(2):
    for vi in np.where(cloth_zone & (label == 0))[0]:
        nb = [label[y] for y in adj[vi]]
        arm_nb = [l for l in nb if l != 0]
        if len(arm_nb) >= 0.6 * len(nb) and nb: label[vi] = max(set(arm_nb), key=arm_nb.count)
for sd in (1, 2):
    m = SIDE[label] == sd
    cs = components(m)
    for comp in cs[1:]:
        fseg = [i for i in range(len(SEG)) if SL[i] == (4 if sd == 1 else 8)]
        if cloth_zone[comp].mean() > 0.5 and SKIN[comp].mean() > 0.6 and np.median(D[comp][:, fseg].min(1)) < 0.04:
            continue   # a fingertip cut off by a painted nail
        label[comp] = 0
    log('arm', sd, 'pieces', [len(c) for c in cs[:5]])
# leftovers of the fused hand standing out of the body skin inside a contact (palm pockets, fingertip crumbs): dropped
# and capped later. Height above a quadric fitted to the body skin around the contact.
DROP = np.zeros(N, bool); QFIT = []
for k, c, r, ax, *hg in CT:
    if ax == 'clothdrop':
        DROP[(np.linalg.norm(P - np.array(c), axis=1) < r) & (label == 0) & SKIN] = True
        continue
    c = np.array(c); d = np.linalg.norm(P - c, axis=1)
    ref = np.where((label == 0) & ~in_any & (d < 1.9 * r))[0]
    n = NRM[ref].mean(0); n /= np.linalg.norm(n)
    e1 = np.cross(n, [0, 0, 1.0]); e1 = e1 / np.linalg.norm(e1) if np.linalg.norm(e1) > 1e-3 else np.array([1.0, 0, 0]); e2 = np.cross(n, e1)
    R0 = P[ref] - c; u, v, h = R0 @ e1, R0 @ e2, R0 @ n
    coef = np.linalg.lstsq(np.stack([u * u, u * v, v * v, u, v, np.ones_like(u)], 1), h, rcond=None)[0]
    idx = np.where((d < r) & (label == 0))[0]
    R0 = P[idx] - c; u, v, h = R0 @ e1, R0 @ e2, R0 @ n
    hq = h - np.stack([u * u, u * v, v * v, u, v, np.ones_like(u)], 1) @ coef
    DROP[idx[hq > float(A.get('drop_h', 0.004))]] = True
    QFIT.append((c, r, n, e1, e2, coef))
    # body skin hugging the hand (cloth between the fingers, finger undersides fused to the thigh): dropped too, the
    # cap then rebuilds the body surface from the fit
    base = 1 if k == 'L' else 5
    armv = np.where((SIDE[label] == SIDE[base]) & (d < r + 0.03))[0]
    if len(armv):
        kda = kdtree.KDTree(len(armv))
        for j, vi in enumerate(armv): kda.insert(P[vi], j)
        kda.balance()
        for vi in idx:
            if kda.find(P[vi])[2] < (hg[0] if hg else float(A.get('hug', 0.012))): DROP[vi] = True
log('drop protruding / hugging verts', int(DROP.sum()))

# body islands enclosed by an arm (small) -> that arm (nearest arm label)
cs = components(SIDE[label] == 0)
for comp in cs[1:]:
    if len(comp) > 4000: continue
    nb = [label[y] for x in comp for y in adj[x] if label[y] != 0]
    if nb: label[comp] = max(set(nb), key=nb.count)

# ---------------------------------------------------------------- cut: touching arm / body skin outside the shoulder zones
zone_ok = np.zeros(N, bool)
for k in ('L', 'R'):
    zone_ok |= np.linalg.norm(P - LM[k]['sh'], axis=1) < LM[k]['zone']
sdE = SIDE[label[E[:, 0]]] != SIDE[label[E[:, 1]]]
cutE = sdE & ~(zone_ok[E[:, 0]] & zone_ok[E[:, 1]])
log('cut edges', int(cutE.sum()))

# ---------------------------------------------------------------- debug: label colors (rest pose) -> <id>_labels_*.png
if A.get('dbg'):
    PAL = np.array([[0.75, 0.75, 0.75], [0.9, 0.2, 0.2], [0.9, 0.6, 0.1], [0.2, 0.7, 0.2], [0.1, 0.5, 0.9], [0.7, 0.1, 0.6], [0.9, 0.9, 0.1], [0.1, 0.8, 0.8], [0.3, 0.3, 0.9]])
    ca = me.color_attributes.new('lab', 'FLOAT_COLOR', 'POINT')
    col = np.concatenate([PAL[label], np.ones((N, 1))], 1)
    cutv = np.zeros(N, bool); cutv[E[cutE].ravel()] = True; col[cutv, :3] = (0, 0, 0); col[DROP, :3] = (1, 0, 1)
    ca.data.foreach_set('color', col.ravel().astype(np.float32))
    me.color_attributes.active_color = ca
    for k, sd in (('L', 1), ('R', -1)):
        a = LM[k]; t = (a['sh'] + a['wr']) / 2
        render_views(body, os.path.join(OUT, PID + '_labels_' + k + '.png'), [((0, -1, 0), t, 0.62), ((sd, 0, 0), t, 0.62), ((0, 1, 0), t, 0.62), ((-sd, -0.2, 0), t, 0.62)], size=650, light='STUDIO', color='VERTEX')
        t = a['wr'] * 0.6 + a['kn'] * 0.4
        render_views(body, os.path.join(OUT, PID + '_labelsH_' + k + '.png'), [((0, -1, 0), t, 0.3), ((sd, 0, 0), t, 0.3), ((0, 1, 0), t, 0.3), ((sd, -1, 0.3), t, 0.3)], size=600, light='STUDIO', color='VERTEX')
    # body only (arms removed), around the contacts
    tmp = body.copy(); tmp.data = me.copy(); scene.collection.objects.link(tmp); body.hide_render = True
    bmt = bmesh.new(); bmt.from_mesh(tmp.data); bmt.verts.ensure_lookup_table()
    bmesh.ops.delete(bmt, geom=[bmt.verts[i] for i in np.where(label != 0)[0]], context='VERTS'); bmt.to_mesh(tmp.data); bmt.free()
    for j, (k, c, r, ax, *_) in enumerate(CT):
        sd = 1 if k == 'L' else -1
        render_views(tmp, os.path.join(OUT, PID + '_bodyonly_%d.png' % j), [((0, -1, 0), c, r * 3), ((sd, -0.4, 0), c, r * 3), ((sd, 0.6, 0.2), c, r * 3)], size=500, light='STUDIO', color='VERTEX')
    bpy.data.objects.remove(tmp, do_unlink=True)
    tmp = body.copy(); tmp.data = me.copy(); scene.collection.objects.link(tmp); tmp.hide_render = False
    bmt = bmesh.new(); bmt.from_mesh(tmp.data); bmt.verts.ensure_lookup_table()
    bmesh.ops.delete(bmt, geom=[bmt.verts[i] for i in np.where(label == 0)[0]], context='VERTS'); bmt.to_mesh(tmp.data); bmt.free()
    for k, sd in (('L', 1), ('R', -1)):
        t = LM[k]['wr'] * 0.5 + LM[k]['kn'] * 0.5
        render_views(tmp, os.path.join(OUT, PID + '_armonly_' + k + '.png'), [((-sd, 0, 0), t, 0.22), ((-sd, -1, 0), t, 0.22), ((0, 0, -1), t, 0.22), ((-sd, 1, 0), t, 0.22)], size=450, light='STUDIO', color='VERTEX')
    bpy.data.objects.remove(tmp, do_unlink=True); body.hide_render = False
    me.color_attributes.remove(ca)
# ---------------------------------------------------------------- weights: 9 channels (body, L upper/fore/hand/fing, R ...)
W = np.zeros((N, 9)); W[np.arange(N), label] = 1.0
for side, k, base in ((1, 'L', 1), (-1, 'R', 5)):
    a = LM[k]; au = (a['el'] - a['sh']) / np.linalg.norm(a['el'] - a['sh'])
    s_sh = (P - a['sh']) @ au; dsh = np.linalg.norm(P - a['sh'], axis=1)
    ss = lambda x, e0, e1: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
    f = ss(s_sh, -0.05, 0.035)
    # arm skin near the joint: part body (shoulder cap)
    m = label == base
    W[m, base] = f[m]; W[m, 0] = 1 - f[m]
    # body skin around the joint follows the arm a little (armpit / shoulder cap), fading with distance
    zr = a['zone']
    mb = (label == 0) & (dsh < zr * 1.3) & (side * P[:, 0] > side * a['sh'][0] - 0.07)
    wb = f[mb] * (1 - ss(dsh[mb], zr * 0.45, zr * 1.3)) * 0.85
    W[mb, base] = wb; W[mb, 0] = 1 - wb
# smooth (not across cut edges), only around the arms
keepE = E[~cutE]
act = np.zeros(N, bool); act[near] = True
for it in range(8):
    acc = W.copy(); cnt = np.ones(N)
    np.add.at(acc, keepE[:, 0], W[keepE[:, 1]]); np.add.at(acc, keepE[:, 1], W[keepE[:, 0]])
    np.add.at(cnt, keepE[:, 0], 1); np.add.at(cnt, keepE[:, 1], 1)
    Wn = acc / cnt[:, None]
    W[act] = Wn[act]
# vertices of an arm must not take weights from the other arm; renormalize
W /= W.sum(1, keepdims=True)
W = np.concatenate([W, np.zeros((N, 2))], 1)      # 9 = L thumb, 10 = R thumb (swing about the thumb base)
for k, base, ch in (('L', 1, 9), ('R', 5, 10)):
    th = LM[k].get('thumb')
    if not th: continue
    tb, tt = np.array(th['base']), np.array(th['tip']); td = (tt - tb) / np.linalg.norm(tt - tb)
    cpt, tpar = seg_closest(P, tb, tt)
    along = (P - tb) @ td
    m = np.isin(label, (base + 2, base + 3)) & (np.linalg.norm(P - cpt, axis=1) < th['r']) & (along > -0.005)
    f = np.clip((along[m] + 0.005) / 0.03, 0, 1); f = f * f * (3 - 2 * f)
    W[np.where(m)[0], ch] = f * (W[m, base + 2] + W[m, base + 3])
    W[np.where(m)[0], base + 2] *= (1 - f); W[np.where(m)[0], base + 3] *= (1 - f)
    log(k, 'thumb verts', int(m.sum()))

# ---------------------------------------------------------------- target rotations (frames -> T-pose: arm along +-X, crease to the front, palm down)
def q_from_mat(Mx): return np.array(Matrix(Mx.tolist()).to_quaternion())
def q_axis(axis, ang):
    axis = np.asarray(axis, float); axis = axis / np.linalg.norm(axis); return np.array([math.cos(ang / 2), *(math.sin(ang / 2) * axis)])
def q_between(u, v):
    u = u / np.linalg.norm(u); v = v / np.linalg.norm(v); c = np.dot(u, v)
    if c < -0.9999:
        o = np.cross(u, [1, 0, 0]);
        if np.linalg.norm(o) < 1e-3: o = np.cross(u, [0, 1, 0])
        return q_axis(o, math.pi)
    ax = np.cross(u, v); q = np.array([1 + c, *ax]); return q / np.linalg.norm(q)
def qmul(a, b):
    w1, x1, y1, z1 = np.moveaxis(a, -1, 0); w2, x2, y2, z2 = np.moveaxis(b, -1, 0)
    return np.stack([w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2], -1)
def qconj(q): return q * np.array([1, -1, -1, -1])
def qrot(q, v):
    vq = np.concatenate([np.zeros(v.shape[:-1] + (1,)), v], -1)
    return qmul(qmul(q, vq), qconj(q))[..., 1:]
def frame_q(a, b, a2, b2):
    """rotation taking a -> a2 and (b orthogonalized to a) -> b2"""
    a = a / np.linalg.norm(a); b = b - a * (b @ a); b /= np.linalg.norm(b)
    a2 = a2 / np.linalg.norm(a2); b2 = b2 - a2 * (b2 @ a2); b2 /= np.linalg.norm(b2)
    M1 = np.stack([a, b, np.cross(a, b)], 1); M2 = np.stack([a2, b2, np.cross(a2, b2)], 1)
    return q_from_mat(M2 @ M1.T)
def twist_angle(q, axis):
    return 2 * math.atan2(q[1:] @ axis, q[0])

POSE = {}
for side, k, base in ((1, 'L', 1), (-1, 'R', 5)):
    a = LM[k]; Xs = np.array([side, 0.0, 0.0])
    au = a['el'] - a['sh']; au /= np.linalg.norm(au)
    af = a['wr'] - a['el']; af /= np.linalg.norm(af)
    crease = af - au * (af @ au); bend = math.degrees(math.acos(np.clip(au @ af, -1, 1)))
    front = np.array([0, -1.0, 0]); front_o = front - au * (front @ au); front_o /= np.linalg.norm(front_o)
    if np.linalg.norm(crease) > 1e-6: crease /= np.linalg.norm(crease)
    wgt = np.clip((bend - 6) / 14, 0, 1)
    crease = crease * wgt + front_o * (1 - wgt); crease /= np.linalg.norm(crease)
    Su = q_between(au, Xs)
    c1 = qrot(Su, crease); beta = math.atan2(np.cross(c1, front) @ Xs, c1 @ front)
    RU = qmul(q_axis(Xs, beta), Su)
    af1 = qrot(RU, af); RF0 = qmul(q_between(af1, Xs), RU)
    # hand frame
    hd = a['kn'] - a['wr']; hd /= np.linalg.norm(hd)
    pn = a['palm'] / np.linalg.norm(a['palm'])
    if a['pca']:
        hm = (label == base + 2) | (label == base + 3)
        Q = P[hm] - P[hm].mean(0); ev, evec = np.linalg.eigh(Q.T @ Q); n0 = evec[:, 0]
        if n0 @ pn < 0: n0 = -n0
        log(k, 'palm pca', n0.round(2), 'hint', pn.round(2), 'eig', (ev / len(Q)).round(6))
        pn = n0
    pn = pn - hd * (pn @ hd); pn /= np.linalg.norm(pn)
    RH = frame_q(hd, pn, Xs, np.array([0, 0, -1.0]))
    Qres = qmul(RH, qconj(RF0)); alpha = twist_angle(Qres, Xs)
    # finger straightening (about the knuckles, in the rest frame)
    RC = np.array([1.0, 0, 0, 0])
    if a.get('tip') is not None:
        fd = a['tip'] - a['kn']; fd /= np.linalg.norm(fd)
        full = q_between(fd, hd); ang = 2 * math.acos(np.clip(full[0], -1, 1))
        RC = q_axis(full[1:] if np.linalg.norm(full[1:]) > 1e-8 else [1, 0, 0], ang * 0.85) if ang > 1e-4 else RC
    el2 = a['sh'] + qrot(RU, a['el'] - a['sh'])
    wr2 = el2 + qrot(RF0, a['wr'] - a['el'])
    kn2 = wr2 + qrot(RH, a['kn'] - a['wr'])
    POSE[k] = dict(Xs=Xs, Su=Su, beta=beta, RU=RU, RF0=RF0, alpha=alpha, RH=RH, RC=RC, el2=el2, wr2=wr2, kn2=kn2)
    log(k, 'bend %.0f beta %.0f alpha %.0f' % (bend, math.degrees(beta), math.degrees(alpha)), 'wr2', wr2.round(3))

# ---------------------------------------------------------------- per-vertex bone transforms -> dual-quaternion blend
def dq(q, t):
    tq = np.concatenate([np.zeros(t.shape[:-1] + (1,)), t], -1)
    return q, 0.5 * qmul(tq, q)
ones = np.tile([1.0, 0, 0, 0], (N, 1))
QS = [ones]; TS = [np.zeros((N, 3))]
for side, k, base in ((1, 'L', 1), (-1, 'R', 5)):
    a = LM[k]; p = POSE[k]; Xs = p['Xs']
    _, tu = seg_closest(P, a['sh'], a['el'])
    _, tf = seg_closest(P, a['el'], a['wr'])
    # upper: swing at the joint, the humeral twist spread from 40% at the shoulder to 100% at the elbow
    fu = 0.4 + 0.6 * tu
    qu = qmul(np.stack([q_axis(Xs, p['beta'] * x) for x in fu]), np.tile(p['Su'], (N, 1)))
    QS.append(qu); TS.append(a['sh'] - qrot(qu, np.tile(a['sh'], (N, 1))))
    # fore: hinge straightened, the forearm twist toward the hand spread along it
    g = np.clip((tf - 0.1) / 0.8, 0, 1); g = g * g * (3 - 2 * g)
    qf = qmul(np.stack([q_axis(Xs, p['alpha'] * x) for x in g]), np.tile(p['RF0'], (N, 1)))
    QS.append(qf); TS.append(p['el2'] - qrot(qf, np.tile(a['el'], (N, 1))))
    qh = np.tile(p['RH'], (N, 1))
    QS.append(qh); TS.append(p['wr2'] - qrot(qh, np.tile(a['wr'], (N, 1))))
    qg = np.tile(qmul(p['RH'], p['RC']), (N, 1))
    QS.append(qg); TS.append(p['kn2'] - qrot(qg, np.tile(a['kn'], (N, 1))))
for k in ('L', 'R'):
    a = LM[k]; p = POSE[k]; th = a.get('thumb')
    qh = np.tile(p['RH'], (N, 1))
    if th:
        tb, tt = np.array(th['base']), np.array(th['tip'])
        want = qrot(qconj(p['RH']), np.array([p['Xs'][0] * 0.45, -0.85, -0.25]))
        qt = qmul(p['RH'], q_between(tt - tb, want)); qh = np.tile(qt, (N, 1))
        tb2 = p['wr2'] + qrot(p['RH'], tb - a['wr'])
        QS.append(qh); TS.append(tb2 - qrot(qh, np.tile(tb, (N, 1))))
    else:
        QS.append(qh); TS.append(p['wr2'] - qrot(qh, np.tile(a['wr'], (N, 1))))
QS = np.stack(QS, 1); TS = np.stack(TS, 1)        # N x 9 x 4, N x 9 x 3
R_, D_ = dq(QS, TS)
piv = R_[np.arange(N), W.argmax(1)]
sgn = np.sign((R_ * piv[:, None, :]).sum(-1)); sgn[sgn == 0] = 1
Rb = (W[:, :, None] * sgn[:, :, None] * R_).sum(1); Db = (W[:, :, None] * sgn[:, :, None] * D_).sum(1)
nr = np.linalg.norm(Rb, axis=1, keepdims=True); Rb /= nr; Db /= nr
tt_ = 2 * qmul(Db, qconj(Rb))[:, 1:]
P2 = qrot(Rb, P) + tt_

if A.get('dbg'):
    for k, sd in (('L', 1), ('R', -1)):
        w2 = POSE[k]['wr2']
        m = (sd * P2[:, 0] > sd * w2[0] - 0.02) & (np.abs(P2[:, 1] - w2[1]) < 0.12) & (P2[:, 2] > w2[2] + 0.035)
        log(k, 'fin verts', int(m.sum()), 'labels', np.bincount(label[m], minlength=9).tolist(), 'rest mean', P[m].mean(0).round(3) if m.any() else '-',
            'rest min', P[m].min(0).round(3) if m.any() else '-', 'rest max', P[m].max(0).round(3) if m.any() else '-', 'thumbW', W[m, 9:].max(0).round(2) if m.any() else '-')
# ---------------------------------------------------------------- write back, cut, cap holes
me.vertices.foreach_set('co', P2.ravel()); me.update()
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
uvl_ = bm.loops.layers.uv.active
lab_side = SIDE[label]
cut_faces = set()
ekey = {}
for i, (a_, b_) in enumerate(E):
    if cutE[i]: ekey[(min(a_, b_), max(a_, b_))] = 1
for f in bm.faces:
    vs = [v.index for v in f.verts]
    sds = set(lab_side[vs])
    if len(sds) > 1:
        if not all(zone_ok[x] for x in vs): cut_faces.add(f)
    if any(DROP[x] for x in vs): cut_faces.add(f)
log('cut faces', len(cut_faces))
bmesh.ops.delete(bm, geom=list(cut_faces), context='FACES_ONLY')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.verts.ensure_lookup_table()
# side label per bmesh vert (indices shifted after deletes: keep a layer)
# (recompute from position: nearest original index via kd-tree on P2)
from mathutils import kdtree
kd = kdtree.KDTree(N)
for i in range(N): kd.insert(P2[i], i)
kd.balance()
VID = bm.verts.layers.int.new('vid')
uvl_ = bm.loops.layers.uv.active
bm.verts.index_update()
for v in bm.verts: v[VID] = v.index + 1
vside = {v: lab_side[kd.find(v.co)[1]] for v in bm.verts}
filled = 0
ALL_LOOPS = []
for sd in (0, 1, 2):
    bnd = [e for e in bm.edges if e.is_boundary and vside[e.verts[0]] == sd and vside[e.verts[1]] == sd]
    # chains of boundary edges of this side
    nb = {}
    for e in bnd:
        a_, b_ = e.verts; nb.setdefault(a_, []).append(b_); nb.setdefault(b_, []).append(a_)
    used = set(); loops = []; chains = []
    for s0 in list(nb):
        if s0 in used or len(nb[s0]) != 1: continue
        ch = [s0]; used.add(s0); cur = s0
        while True:
            nx = [x for x in nb[cur] if x not in used]
            if not nx: break
            cur = nx[0]; used.add(cur); ch.append(cur)
        chains.append(ch)
    for s0 in list(nb):
        if s0 in used: continue
        ch = [s0]; used.add(s0); cur = s0
        while True:
            nx = [x for x in nb[cur] if x not in used]
            if not nx: break
            cur = nx[0]; used.add(cur); ch.append(cur)
        loops.append(ch)
    # join open chains end-to-start by nearest ends (greedy) into loops
    while chains:
        ch = chains.pop(0)
        while chains:
            end = ch[-1].co
            j, rev = min(((j, r) for j in range(len(chains)) for r in (0, 1)), key=lambda jr: (chains[jr[0]][-1 if jr[1] else 0].co - end).length)
            gap = (chains[j][-1 if rev else 0].co - end).length
            if gap > (ch[0].co - end).length or gap > 0.05: break
            c2 = chains.pop(j); ch += (c2[::-1] if rev else c2)
        loops.append(ch)
    ALL_LOOPS += [[v[VID] for v in lp] for lp in loops]
from mathutils.geometry import delaunay_2d_cdt
def pip(pts, poly):
    x, y = pts[:, 0][:, None], pts[:, 1][:, None]
    x1, y1 = poly[:, 0][None], poly[:, 1][None]; x2, y2 = np.roll(poly[:, 0], -1)[None], np.roll(poly[:, 1], -1)[None]
    cr = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1)
    return cr.sum(1) % 2 == 1
def cap_loop(lp):
    """membrane cap: constrained Delaunay of the loop (projected on its best-fit plane) plus a 6 mm grid of inner
    points; inner points relaxed in 3D with the rim fixed. Returns the new faces, or None if it fails."""
    C = np.array([list(v.co) for v in lp]); c0 = C.mean(0); n = len(lp)
    ev, evec = np.linalg.eigh((C - c0).T @ (C - c0)); e1, e2 = evec[:, 2], evec[:, 1]
    U = np.stack([(C - c0) @ e1, (C - c0) @ e2], 1)
    st = 0.006
    gx, gy = np.meshgrid(np.arange(U[:, 0].min(), U[:, 0].max(), st), np.arange(U[:, 1].min(), U[:, 1].max(), st))
    G = np.stack([gx.ravel(), gy.ravel()], 1)
    if len(G):
        G = G[pip(G, U)]
        if len(G):
            dmin = np.min(np.linalg.norm(G[:, None, :] - U[None, :, :], axis=2), axis=1); G = G[dmin > st * 0.6]
    pts = [Vector((float(a), float(b))) for a, b in np.concatenate([U, G]) ]
    edges = [(i, (i + 1) % n) for i in range(n)]
    try:
        vo, eo, fo, ov, oe, of = delaunay_2d_cdt(pts, edges, [], 1, 1e-6)
    except Exception as ex:
        return None
    if not fo: return None
    # map output verts -> bm verts (rim: original loop verts; inner: new)
    vmap_ = {}
    for k, origs in enumerate(ov):
        rim = [o for o in origs if o < n]
        if rim: vmap_[k] = lp[rim[0]]
    if len(set(id(v) for v in vmap_.values())) < n * 0.9: return None
    P3 = {}
    for k in range(len(vo)):
        if k in vmap_: continue
        uv_ = vo[k]; P3[k] = c0 + e1 * uv_[0] + e2 * uv_[1]
    nbr = {k: set() for k in range(len(vo))}
    for f in fo:
        for a, b in zip(f, f[1:] + f[:1]): nbr[a].add(b); nbr[b].add(a)
    pos = {k: (np.array(list(vmap_[k].co)) if k in vmap_ else P3[k]) for k in range(len(vo))}
    inner_k = [k for k in range(len(vo)) if k not in vmap_]
    for it in range(int(A.get('relax', 80))):
        newp = {k: np.mean([pos[j] for j in nbr[k]], 0) for k in inner_k if nbr[k]}
        pos.update(newp)
    # body holes inside a contact: inner points onto the fitted body surface (no dent where the hand was)
    for (qc, qr, qn, qe1, qe2, qcoef) in QFIT:
        if np.linalg.norm(c0 - qc) < qr * 1.2 and all(vside.get(v, -1) == 0 for v in lp[:3]):
            for k in inner_k:
                R0 = pos[k] - qc; u, v = R0 @ qe1, R0 @ qe2
                pos[k] = qc + qe1 * u + qe2 * v + qn * (np.array([u * u, u * v, v * v, u, v, 1.0]) @ qcoef)
            break
    # sanity: the membrane must stay within the rim's reach and its triangles must agree on a side
    rim = np.array([pos[k] for k in vmap_]); rc = rim.mean(0); rr = np.max(np.linalg.norm(rim - rc, axis=1))
    if any(np.linalg.norm(pos[k] - rc) > rr * 1.05 for k in inner_k): return None
    tn = []
    for f in fo:
        a_, b_, c_ = pos[f[0]], pos[f[1]], pos[f[2]]; tn.append(np.cross(b_ - a_, c_ - a_))
    tn = np.array(tn); mn_ = tn.sum(0)
    if np.linalg.norm(mn_) < 1e-12 or ((tn @ mn_) < 0).mean() > 0.08: return None
    for k in inner_k:
        vmap_[k] = bm.verts.new(Vector(pos[k])); vmap_[k][VID] = 0
    faces = []
    for f in fo:
        vs = [vmap_[k] for k in f]
        if len(set(vs)) < 3: continue
        try: faces.append(bm.faces.new(vs))
        except ValueError: pass
    return faces

for lpi in ALL_LOOPS:
    vmap = {v[VID]: v for v in bm.verts if v[VID] > 0}; lp = [vmap[i] for i in lpi if i in vmap]
    if len(lp) < 3: continue
    # candidate UVs: centers of the faces around the rim (inside their atlas chart, away from seam bleed)
    cand = []
    for f_ in {f_ for v in lp for f_ in v.link_faces}:
        cand.append(sum((l[uvl_].uv for l in f_.loops), Vector((0, 0))) / len(f_.loops))
    cols = tex_at(np.array([[u.x, u.y] for u in cand])) if cand else np.zeros((1, 3))
    med = np.percentile(cols, 50 if vside.get(lp[0], 0) == 0 else 35, axis=0); uv0 = cand[int(np.argmin(np.linalg.norm(cols - med, axis=1)))] if cand else Vector((0, 0))
    # straighten the rim (the cut follows triangle edges and the drop zones: a saw-tooth edge reads as a torn seam)
    if len(lp) >= 8:
        for it in range(int(A.get('rim_smooth', 6))):
            co = [v.co.copy() for v in lp]
            for i_, v in enumerate(lp):
                v.co = co[i_] * 0.5 + (co[i_ - 1] + co[(i_ + 1) % len(lp)]) * 0.25
    faces = cap_loop(lp) if len(lp) >= 5 else None
    if faces is None:
        # fallback: fan around a center vertex (no long cross-loop slivers)
        cv = bm.verts.new(sum((v.co for v in lp), Vector()) / len(lp)); cv[VID] = 0
        faces = []
        for a_, b_ in zip(lp, lp[1:] + lp[:1]):
            if a_ is b_: continue
            try: faces.append(bm.faces.new((a_, b_, cv)))
            except ValueError: pass
    # winding: a cap face and the original face sharing a rim edge must run that edge in opposite directions
    capset = set(faces); votes = 0
    for ff in faces:
        for l in ff.loops:
            e = l.edge
            for of in e.link_faces:
                if of in capset: continue
                ol = next(x for x in of.loops if x.edge == e)
                votes += 1 if ol.vert == l.vert else -1     # same start vertex = same direction = flipped cap
    if votes > 0: bmesh.ops.reverse_faces(bm, faces=faces)
    for ff in faces:
        for l in ff.loops: l[uvl_].uv = uv0
        ff.smooth = True
    filled += 1
log('capped holes', filled)
bm.to_mesh(me); bm.free(); me.update()

# ---------------------------------------------------------------- checks + export
P3 = V()
log('bbox posed', P3.min(0).round(3), P3.max(0).round(3))
np.save(os.path.join(OUT, PID + '_tpose_verts.npy'), P3.astype(np.float32))
if A.get('orig'):
    # --orig 1: each output vertex's position in the source (arms-down) pose, NaN for the cap vertices; the player
    # build turns it into an arms-down corrective shape (tools/v2/player/corrective.py)
    vid = np.zeros(len(me.vertices), np.int64)
    me.attributes['vid'].data.foreach_get('value', vid)
    O = np.full(P3.shape, np.nan, np.float32)
    for i in np.where(vid > 0)[0]: O[i] = P[kd.find(Vector(P3[i]))[1]]
    np.save(os.path.join(OUT, PID + '_tpose_orig.npy'), O)
    UVV = np.zeros((len(me.vertices), 2), np.float32)   # a UV per vertex: matches survive the rig's own re-pose
    for lp in me.loops: UVV[lp.vertex_index] = me.uv_layers[0].data[lp.index].uv
    np.save(os.path.join(OUT, PID + '_tpose_uv.npy'), UVV)
    log('orig positions', int((vid > 0).sum()), 'of', len(vid))
np.save(os.path.join(OUT, PID + '_labels.npy'), label)
c = HT / 2; span = np.ptp(P3[:, 0]) * 1.05
render_views(body, os.path.join(OUT, PID + '_tpose_views.png'), [((0, -1, 0), (0, 0, c), max(HT, span) * 1.02), ((0, 1, 0), (0, 0, c), max(HT, span) * 1.02), ((1, 0, 0), (0, 0, c), HT * 1.02)], size=900)
zsh = (LM['L']['sh'][2] + LM['R']['sh'][2]) / 2
for k, sd in (('L', 1), ('R', -1)):
    t = (sd * (abs(LM[k]['sh'][0]) + 0.12), 0, zsh - 0.05)
    render_views(body, os.path.join(OUT, PID + '_tpose_arm' + k + '.png'), [((0, -1, 0), t, 0.55), ((0, 1, 0), t, 0.55), ((0, 0, -1), t, 0.55), ((0, -1, 1), t, 0.55)], size=650)
    t2 = (sd * 0.14, -0.02, LM[k]['wr'][2])
    render_views(body, os.path.join(OUT, PID + '_tpose_hip' + k + '.png'), [((0, -1, 0), t2, 0.35), ((sd, -0.3, 0), t2, 0.35), ((sd, 0.5, 0), t2, 0.35)], size=600)
    t3 = POSE[k]['wr2'] + POSE[k]['Xs'] * 0.08
    render_views(body, os.path.join(OUT, PID + '_tpose_hand' + k + '.png'), [((0, 0, 1), t3, 0.25), ((0, 0, -1), t3, 0.25), ((0, -1, 0), t3, 0.25)], size=500)
activate(body)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, PID + '_tpose.glb'), export_format='GLB', use_selection=True,
                          export_animations=False, export_materials='EXPORT', export_image_format='NONE', export_yup=True,
                          export_normals=True, export_tangents=False)
log('wrote', os.path.join(OUT, PID + '_tpose.glb'))
