# Rigid hands (Nov 19, NPC 193 the flight-line crewman): a person modelled with something held in a closed fist (the
# marshalling wands) gets everything past the wrist weighted 100 % to the hand bone, so the clips' finger curl cannot
# bend the held prop into a hook. Works on the rigged .blend this pipeline wrote (canonical T-pose rest, arms along
# +-X) and re-exports the GLB exactly like rig_person.py / hand_pass.py.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/rigid_hands.py -- --blend <in.blend> --id p193 --out <dir>
import bpy, sys, os, re

argv = sys.argv[sys.argv.index('--') + 1:]
A = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2)}
PID, OUT = A['id'], A['out']
PAST = float(A.get('past', 0.015))  # m past the hand bone's head (the wrist) where the rigid part starts
os.makedirs(OUT, exist_ok=True)
log = lambda *a: print('[rigid]', PID, *a, flush=True)

bpy.ops.wm.open_mainfile(filepath=A['blend'])
rig = bpy.data.objects['Armature']
lods = sorted([o for o in bpy.data.objects if o.type == 'MESH' and re.match(r'LOD\d_body', o.name)], key=lambda o: o.name)
assert lods, 'no LOD meshes'

# the two hand bones and the side of the body each one is on (rest pose, world space)
hands = []
for b in rig.data.bones:
    if re.search(r'(Left|Right)Hand$', b.name):
        hands.append((b.name, (rig.matrix_world @ b.head_local).x))
assert len(hands) == 2, hands

for o in lods:
    mw = o.matrix_world
    groups = {g.name: g for g in o.vertex_groups}
    n = 0
    for name, hx in hands:
        side = 1 if hx > 0 else -1
        limit = abs(hx) + PAST
        g = groups.get(name) or o.vertex_groups.new(name=name)
        ids = [v.index for v in o.data.vertices if (mw @ v.co).x * side > limit]
        for vg in o.vertex_groups:
            if vg.name != name:
                vg.remove(ids)
        g.add(ids, 1.0, 'REPLACE')
        n += len(ids)
    log(o.name, 'rigid verts', n)

# export exactly like rig_person.py
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in lods:
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, PID + '.glb'), export_format='GLB', use_selection=True,
                          export_animations=False, export_skins=True, export_all_influences=False,
                          export_materials='PLACEHOLDER', export_image_format='NONE', export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10,
                          export_draco_texcoord_quantization=12, export_draco_generic_quantization=12,
                          export_tangents=False, export_normals=True, export_def_bones=True, export_rest_position_armature=True)
log('done', hands)
