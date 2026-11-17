# Hand pass (r2-people, item 15 "hands look weird"): re-places the finger and thumb joints and rewrites the finger / thumb
# weights of an already rigged person (tools/v2/npcs/out/blend/<id>.blend, canonical T-pose rest) with the current
# rig_person.py hand logic, then re-exports the GLB. Much faster than a full re-rig (no bone heat, no LOD rebuild); the
# rest of the body is untouched. What it fixes: the old lane split often gave the thumb the "Index" lane (every lane one
# finger off, Thumb bones empty, thumb joints floating in the air in front of the hand), hard finger-joint blends (claw
# creases) and a wide knuckle ramp.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/hand_pass.py -- --blend <in.blend> --id p07 --out <dir> [--save 1]
# Never runs scripts from downloads; only reads the rigged .blend this pipeline wrote.
import bpy, sys, json, os, re
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
A = {}
for i in range(0, len(argv) - 1, 2): A[argv[i][2:]] = argv[i + 1]
PID, OUT = A['id'], A['out']
os.makedirs(OUT, exist_ok=True)
log = lambda *a: print('[hand]', PID, *a, flush=True)
bpy.ops.wm.open_mainfile(filepath=A['blend'])
rig = bpy.data.objects['Armature']
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and re.match(r'LOD\d_body', o.name)], key=lambda o: o.name)
assert lods, 'no LOD meshes'

# the hand functions of the rigger, taken from its source (one source of truth)
SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rig_person.py')).read()
def chunk(a, b):
    i = SRC.index(a); j = SRC.index(b, i); return SRC[i:j]
code = chunk('def fingers_side(', '_, hy, hd = slice_center') + '\n' + chunk('def finger_weights(o):', '# ---------------------------------------------------------------- weights: bone heat')

o0 = lods[0]
mw = o0.matrix_world
P = np.array([list(mw @ v.co) for v in o0.data.vertices], dtype=np.float64)
X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
H = float(Z.max())
J = {}
def put(n, v): J[n] = Vector(v)
FW = {}
ns = dict(np=np, Vector=Vector, P=P, X=X, Y=Y, Z=Z, H=H, J=J, put=put, FW=FW)
exec(code, ns)
for side, S in ((1, 'Left'), (-1, 'Right')):
    hb = rig.data.bones['mixamorig:' + S + 'Hand']; wh = rig.matrix_world @ hb.head_local
    a = dict(wrist=float(side * wh.x), tip=float((side * X).max()))
    ns['fingers_side'](side, a, S, lambda d, z=wh.z: float(z), lambda d, y=wh.y: float(y))
names = [n for n in J if 'Hand' in n and any(f in n for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'))]
log('joints', len(names))

# move the finger / thumb joints (edit mode; children follow their own new heads)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active = rig
inv = rig.matrix_world.inverted()
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for S in ('Left', 'Right'):
    for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'):
        for j in (1, 2, 3):
            n = S + 'Hand' + f + str(j); b = eb.get('mixamorig:' + n)
            if not b or n not in J: continue
            b.use_connect = False
            b.head = inv @ J[n]
            nxt = J.get(S + 'Hand' + f + str(j + 1))
            t = nxt if nxt is not None else J[n] + (J[n] - J[S + 'Hand' + f + str(j - 1)]) * 0.8
            if (t - J[n]).length < 1e-4: t = J[n] + Vector((0.01 * (1 if S == 'Left' else -1), 0, 0))
            b.tail = inv @ t
    hb = eb.get('mixamorig:' + S + 'Hand')
    if hb and (S + 'HandMiddle1') in J: hb.tail = inv @ J[S + 'HandMiddle1']
bpy.ops.object.mode_set(mode='OBJECT')

# weights: fold the old finger weights back into the hand, then the new finger / thumb lanes
FING = lambda n: 'Hand' in n and any(f in n for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'))
for o in lods:
    assert all(abs(x - y) < 1e-6 for x, y in zip(sum(map(list, o.matrix_world), []), sum(map(list, rig.matrix_world), []))), 'mesh / rig transforms differ'
    gi = {g.index: g.name for g in o.vertex_groups}
    hand = {S: (o.vertex_groups.get('mixamorig:' + S + 'Hand') or o.vertex_groups.new(name='mixamorig:' + S + 'Hand')) for S in ('Left', 'Right')}
    for v in o.data.vertices:
        move = {'Left': 0.0, 'Right': 0.0}
        for g in list(v.groups):
            n = gi.get(g.group, '').replace('mixamorig:', '')
            if FING(n):
                S = 'Left' if n.startswith('Left') else 'Right'; move[S] += g.weight
                o.vertex_groups[g.group].remove([v.index])
        for S, wv in move.items():
            if wv > 0: hand[S].add([v.index], wv, 'ADD')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    ns['finger_weights'](o)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

# export exactly like rig_person.py
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
if A.get('save') == '1': bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, PID + '.blend'))
log('done', json.dumps({k: [round(x, 4) for x in J[k]] for k in ('LeftHandThumb1', 'LeftHandIndex1', 'LeftHandPinky1') if k in J}))
