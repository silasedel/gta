# Arm survey (r3-people): measures, per rigged person GLB, where the ARM MESH really points at rest versus its bones.
# The game assumes every rig rests in the canonical T-pose (arm chain along +-X). People whose scan had raised arms
# can end up with the bones on X but the arm mesh still raised (landmark fit off), so the walk swings them "arms out".
# For each side: centroid of the vertices dominated by Arm / ForeArm / Hand, direction from the Arm joint, the
# elevation (deg above horizontal) and the forward angle. Writes JSON {id: {L: {...}, R: {...}}}.
# Usage: blender -b -P arm_survey.py -- <out.json> <glb>...
import bpy, sys, json, math, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
out, files = args[0], args[1:]
res = {}
for path in files:
    pid = os.path.basename(path)[:-4]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try: bpy.ops.import_scene.gltf(filepath=path)
    except Exception as e: print('FAIL', pid, e); continue
    rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not rig or not meshes: continue
    me = max(meshes, key=lambda o: len(o.data.vertices))   # LOD0
    bpy.context.view_layer.update()
    J = {b.name.replace('mixamorig:', ''): rig.matrix_world @ b.head_local for b in rig.data.bones}
    gi = {g.index: g.name.replace('mixamorig:', '') for g in me.vertex_groups}
    acc = {}
    mw = me.matrix_world
    for v in me.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda x: x.weight)
        if g.weight < 0.6: continue
        n = gi.get(g.group)
        if n is None: continue
        if not any(n.startswith(s) for s in ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand')): continue
        if n.startswith(('LeftHand', 'RightHand')): n = n[:n.index('Hand') + 4]
        a = acc.setdefault(n, [Vector((0, 0, 0)), 0])
        a[0] += mw @ v.co; a[1] += 1
    r = {'H': max((mw @ v.co).z for v in me.data.vertices)}
    for S, sx in (('Left', 1), ('Right', -1)):
        sh = J[S + 'Arm']; d = {}
        for part in ('Arm', 'ForeArm', 'Hand'):
            a = acc.get(S + part)
            if not a or not a[1]: continue
            c = a[0] / a[1]; w = c - sh
            # Blender is Z-up here; side axis = sx * X
            el = math.degrees(math.atan2(w.z, sx * w.x)); fw = math.degrees(math.atan2(-w.y, sx * w.x))
            d[part] = {'c': [round(x, 4) for x in c], 'el': round(el, 1), 'fw': round(fw, 1), 'n': a[1]}
        d['joints'] = {k: [round(x, 4) for x in J[S + k]] for k in ('Shoulder', 'Arm', 'ForeArm', 'Hand')}
        r[S[0]] = d
    res[pid] = r
    print('ARM', pid, ' '.join(f"{S}:{r[S].get('ForeArm',{}).get('el')}/{r[S].get('Hand',{}).get('el')}" for S in 'LR'), flush=True)
json.dump(res, open(out, 'w'), indent=1)
