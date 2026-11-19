# Arms-down corrective shapes for a hero rigged from an arms-down scan (Mari): the rig binds in the T-pose, and plain
# linear skinning brings the arms back down with stretched deltoids and pinched armpits. The scan itself IS the
# arms-down shape, so: pose each upper arm to best match the scan (rotation about the shoulder joint, fitted to the
# upper-arm vertices), skin, and store (scan - skinned) around the shoulder as a shape key per side, in rest space.
# The game turns 'armDownL' / 'armDownR' on as the arm hangs (src/player/mari/shoulders.js).
#   blender -b <rig.blend> --python-exit-code 1 -P tools/v2/player/corrective.py -- <tpose_verts.npy> <tpose_orig.npy>
#     <out.glb> <meta.json> [<check dir>]
# Writes the GLB (same export settings as rig_nico.py) and adds 'corrective' (calibration arm directions) to meta.json.
import bpy
import json
import math
import os
import sys

import numpy as np
from mathutils import Matrix, Vector, kdtree

argv = sys.argv[sys.argv.index('--') + 1 :]
T_NPY, O_NPY, OUT_GLB, META = argv[:4]
CHECK = argv[4] if len(argv) > 4 else None
REGION = 0.2  # meters around the shoulder joint that get corrected (fades out from FADE_IN)
FADE_IN = 0.12
log = lambda *a: print('[corrective]', *a, flush=True)

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ob = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('LOD0'))
me = ob.data
MW = ob.matrix_world
N = len(me.vertices)
R0 = np.array([list(MW @ v.co) for v in me.vertices])

# ---------------------------------------------------------------- source position per rig vertex
P3 = np.load(T_NPY).astype(np.float64)
O = np.load(O_NPY).astype(np.float64)
UV3 = np.load(O_NPY.replace('_orig.npy', '_uv.npy')).astype(np.float64)
# match by UV (kept through every step, unlike positions: the rig re-poses the arms), ties by position
kd = kdtree.KDTree(len(UV3))
for i, t in enumerate(UV3):
    kd.insert(Vector((t[0], t[1], 0)), i)
kd.balance()
UVR = np.zeros((N, 2))
for lp in me.loops:
    UVR[lp.vertex_index] = me.uv_layers[0].data[lp.index].uv
idx = np.zeros(N, np.int64)
ok = np.zeros(N, bool)
for i in range(N):
    near = [j for _, j, d in kd.find_n(Vector((UVR[i, 0], UVR[i, 1], 0)), 6) if d < 1e-4]
    if near:
        idx[i] = min(near, key=lambda j: np.sum((P3[j] - R0[i]) ** 2))
        ok[i] = np.linalg.norm(P3[idx[i]] - R0[i]) < 0.05
log('uv matches', int(ok.sum()), 'of', N)
ORIG = O[idx]
ORIG[~ok] = np.nan
valid = ~np.isnan(ORIG[:, 0])
log('vertices with a source position', int(valid.sum()), 'of', N)

gnames = {g.index: g.name.replace('mixamorig:', '') for g in ob.vertex_groups}
def weight(v, name):
    return sum(e.weight for e in v.groups if gnames.get(e.group) == name)

pb = rig.pose.bones
calib = {}
for side, sx in (('Left', 1), ('Right', -1)):
    bone = pb['mixamorig:' + side + 'Arm']
    h = np.array(rig.matrix_world @ bone.head)
    w = np.array([weight(v, side + 'Arm') for v in me.vertices])
    sel = (w > 0.85) & valid & (np.linalg.norm(R0 - h, axis=1) < 0.32)
    A = R0[sel] - h
    B = ORIG[sel] - h
    # rotation about the joint that best maps the rest upper arm onto the scan's (Kabsch, fixed pivot)
    U, S, Vt = np.linalg.svd(A.T @ B)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Rm = Vt.T @ np.diag([1, 1, d]) @ U.T
    err = np.linalg.norm((Rm @ A.T).T - B, axis=1)
    log(side, 'arm fit verts', int(sel.sum()), 'rms %.4f m' % float(np.sqrt((err ** 2).mean())))
    M4 = Matrix(Rm.tolist()).to_4x4()
    bpy.context.view_layer.update()
    bone.matrix = Matrix.Translation(Vector(h)) @ M4 @ Matrix.Translation(Vector(-h)) @ bone.matrix
    bpy.context.view_layer.update()
    tail = np.array(rig.matrix_world @ bone.tail)
    dirv = (tail - h) / np.linalg.norm(tail - h)
    calib[side] = {'R': Rm, 'h': h, 'w': w, 'dir': dirv}

# skinned positions in that pose
dg = bpy.context.evaluated_depsgraph_get()
ev = ob.evaluated_get(dg)
Q = np.array([list(MW @ v.co) for v in ev.data.vertices])
delta = np.where(valid[:, None], ORIG - Q, 0.0)

shape = {}
SMOOTH_IT = 3
E = np.zeros(len(me.edges) * 2, np.int64)
me.edges.foreach_get('vertices', E)
E = E.reshape(-1, 2)
DEG = np.bincount(E.ravel(), minlength=N).astype(np.float64)
for side, sx in (('Left', 1), ('Right', -1)):
    c = calib[side]
    dd = np.linalg.norm(R0 - c['h'], axis=1)
    fade = np.clip((REGION - dd) / (REGION - FADE_IN), 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    fade[sx * R0[:, 0] < 0.03] = 0
    # world delta -> rest space: skinned = rest + w_arm * (R - I) (rest - h), so d(rest) = (I + w (R - I))^-1 d(world)
    D = np.zeros((N, 3))
    I3 = np.eye(3)
    for i in np.where(fade > 0)[0]:
        Ai = I3 + c['w'][i] * (c['R'] - I3)
        D[i] = np.linalg.solve(Ai, delta[i]) * fade[i]
    # vertices without a source position (hole caps): the mean of their valid neighbours
    reg = np.where(fade > 0)[0]
    good = reg[valid[reg]]
    kg = kdtree.KDTree(len(good))
    for j, i in enumerate(good):
        kg.insert(Vector(R0[i]), j)
    kg.balance()
    for i in reg[~valid[reg]]:
        nb = [good[j] for _, j, dist_ in kg.find_n(Vector(R0[i]), 8) if dist_ < 0.06]
        if nb:
            D[i] = D[nb].mean(0)
    # smooth the correction over the surface (fills the gaps between matched vertices, no crumpled patches)
    def neighbour_mean(X):
        acc = np.zeros_like(X)
        np.add.at(acc, E[:, 0], X[E[:, 1]])
        np.add.at(acc, E[:, 1], X[E[:, 0]])
        return acc / np.maximum(DEG, 1)[:, None]

    fill = (fade > 0) & ~valid
    for _ in range(SMOOTH_IT * 3):
        D[fill] = neighbour_mean(D)[fill]
    for _ in range(SMOOTH_IT):
        D = np.where((fade > 0)[:, None], 0.5 * D + 0.5 * neighbour_mean(D), D)
        D[fade <= 0] = 0
    n = np.linalg.norm(D, axis=1)
    big = n > 0.06
    D[big] *= (0.06 / n[big])[:, None]
    log(side, 'corrected verts', int((n > 1e-4).sum()), 'max %.3f m' % float(n.max()), 'mean %.4f' % float(n[n > 1e-4].mean()))
    shape[side] = D

# back to rest, add the shape keys (mesh local = world here; checked below)
for b in pb:
    b.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
assert np.allclose(np.array(MW), np.eye(4), atol=1e-5), 'LOD0 has a non-identity transform'
if not me.shape_keys:
    ob.shape_key_add(name='Basis', from_mix=False)
for side, key in (('Left', 'armDownL'), ('Right', 'armDownR')):
    sk = me.shape_keys.key_blocks.get(key) if me.shape_keys else None
    sk = sk or ob.shape_key_add(name=key, from_mix=False)
    co = (R0 + shape[side]).astype(np.float32)
    sk.data.foreach_set('co', co.ravel())

if CHECK:
    os.makedirs(CHECK, exist_ok=True)
    np.save(os.path.join(CHECK, 'shape_L.npy'), shape['Left'])

# ---------------------------------------------------------------- export + meta
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('LOD'):
        o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    use_selection=True,
    export_animations=False,
    export_skins=True,
    export_all_influences=False,
    export_morph=True,
    export_morph_normal=False,
    export_materials='PLACEHOLDER',
    export_image_format='NONE',
    export_yup=True,
    export_tangents=False,
    export_normals=True,
    export_def_bones=True,
    export_rest_position_armature=True,
)
bpy.ops.wm.save_mainfile()
meta = json.load(open(META))
# calibration arm directions, glTF axes (x, z, -y): the game blends each key in as the upper arm nears this direction
meta['corrective'] = {
    k[0]: [round(float(c['dir'][0]), 4), round(float(c['dir'][2]), 4), round(float(-c['dir'][1]), 4)]
    for k, c in calib.items()
}
json.dump(meta, open(META, 'w'), indent=1)
log('wrote', OUT_GLB, meta['corrective'])
