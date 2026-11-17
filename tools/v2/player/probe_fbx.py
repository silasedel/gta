# Probe a Tripo FBX: objects, armature, bones, mesh stats, materials, bounds. Usage: blender -b -P probe_fbx.py -- <fbx>
import bpy, sys, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=args[0])
for o in bpy.data.objects:
    print('OBJ', o.name, o.type, 'parent=', o.parent.name if o.parent else None, 'scale', tuple(round(s, 4) for s in o.scale), 'rot', tuple(round(r, 3) for r in o.rotation_euler))
    if o.type == 'MESH':
        me = o.data
        bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        mn = [min(v[i] for v in bb) for i in range(3)]; mx = [max(v[i] for v in bb) for i in range(3)]
        print('  verts', len(me.vertices), 'faces', len(me.polygons), 'uvs', [u.name for u in me.uv_layers], 'vgroups', len(o.vertex_groups))
        print('  bounds', [round(x, 3) for x in mn], [round(x, 3) for x in mx])
        print('  mats', [m.name for m in me.materials], 'mods', [m.type for m in o.modifiers])
        if o.vertex_groups: print('  groups', [g.name for g in o.vertex_groups][:80])
    if o.type == 'ARMATURE':
        for b in o.data.bones:
            print('  BONE', b.name, 'parent', b.parent.name if b.parent else None, 'head', tuple(round(x, 3) for x in (o.matrix_world @ b.head_local)))
for m in bpy.data.materials:
    if m.node_tree:
        print('MAT', m.name, [(n.type, getattr(n, 'image', None) and n.image.name) for n in m.node_tree.nodes])
print('ACTIONS', [a.name for a in bpy.data.actions])
