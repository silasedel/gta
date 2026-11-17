# Inspect FBX/GLB people: objects, armature, tris, bounds, materials. Usage: blender -b --python-exit-code 1 -P inspect.py -- <file>...
import bpy, sys, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
for path in args:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
    else: bpy.ops.import_scene.gltf(filepath=path)
    print('=====', path)
    for o in bpy.data.objects:
        info = [o.name, o.type, tuple(round(v, 3) for v in o.dimensions), tuple(round(v,3) for v in o.rotation_euler), tuple(round(v,3) for v in o.scale)]
        if o.type == 'MESH':
            me = o.data
            tris = sum(len(p.vertices) - 2 for p in me.polygons)
            info += ['verts', len(me.vertices), 'tris', tris, 'uv', [u.name for u in me.uv_layers], 'mats', [m.name if m else None for m in me.materials], 'vg', len(o.vertex_groups)]
            ws = [o.matrix_world @ v.co for v in me.vertices]
            mn = [min(w[i] for w in ws) for i in range(3)]; mx = [max(w[i] for w in ws) for i in range(3)]
            info += ['bbox', [round(x, 3) for x in mn], [round(x, 3) for x in mx]]
        if o.type == 'ARMATURE':
            info += ['bones', len(o.data.bones), [b.name for b in o.data.bones][:60]]
        print(*info)
    for m in bpy.data.materials:
        if m.use_nodes:
            print('mat', m.name, [(n.type, getattr(n, 'image', None) and n.image.name) for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'])
