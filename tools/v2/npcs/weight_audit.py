# Weight audit: vertices whose strongest bone is far from them (they get dragged as spikes when that bone moves).
#   blender -b --python-exit-code 1 -P tools/v2/npcs/weight_audit.py -- <blend> [<blend>...]
import bpy, sys
from mathutils.geometry import intersect_point_line
args = sys.argv[sys.argv.index('--') + 1:]
for f in args:
    bpy.ops.wm.open_mainfile(filepath=f)
    rig = bpy.data.objects['Armature']; segs = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        names = {g.index: g.name for g in o.vertex_groups}; bad = []
        for v in o.data.vertices:
            if not v.groups: bad.append((v.index, 'none', 9)); continue
            g = max(v.groups, key=lambda e: e.weight); n = names[g.group]
            a, b = segs[n]; p, t = intersect_point_line(v.co, a, b); t = max(0, min(1, t)); d = (v.co - (a + (b - a) * t)).length
            if d > 0.28: bad.append((v.index, n, round(d, 2)))
        print(f.split('/')[-1], o.name, 'far verts', len(bad), bad[:6])
