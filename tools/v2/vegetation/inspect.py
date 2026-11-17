# Inspect a library .blend (no scripts run): objects, tris, materials + their textures, bounds. Writes <out>.json
# blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P inspect.py -- <blend> <out.json>
import bpy, sys, json, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=argv[0], load_ui=False, use_scripts=False)
sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3); objs = []; tris = 0
for o in sc.objects:
    if o.type != 'MESH': continue
    vis = o.visible_get(); e = o.evaluated_get(dg); m = e.to_mesh(); t = sum(len(p.vertices) - 2 for p in m.polygons)
    b0 = mathutils.Vector((1e9,) * 3); b1 = mathutils.Vector((-1e9,) * 3)
    for v in m.vertices:
        w = o.matrix_world @ v.co; b0 = mathutils.Vector(map(min, b0, w)); b1 = mathutils.Vector(map(max, b1, w))
    if vis and len(m.vertices):
        tris += t; mn = mathutils.Vector(map(min, mn, b0)); mx = mathutils.Vector(map(max, mx, b1))
    objs.append({'name': o.name, 'vis': vis, 'tris': t, 'mats': [s.material.name if s.material else None for s in o.material_slots], 'min': [round(x, 2) for x in b0], 'max': [round(x, 2) for x in b1], 'mods': [md.type for md in o.modifiers], 'parent': o.parent.name if o.parent else None, 'coll': [c.name for c in o.users_collection]})
    e.to_mesh_clear()
mats = {}
for mt in bpy.data.materials:
    if not mt.users: continue
    tex = []
    if mt.use_nodes and mt.node_tree:
        for n in mt.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                links = [(l.to_node.name, l.to_socket.name) for l in n.outputs[0].links] + [('A:' + l.to_node.name, l.to_socket.name) for l in n.outputs[1].links]
                tex.append({'img': n.image.name, 'file': n.image.filepath, 'size': list(n.image.size), 'links': links})
    mats[mt.name] = {'blend': getattr(mt, 'blend_method', ''), 'tex': tex}
json.dump({'blend': argv[0], 'unit': sc.unit_settings.scale_length, 'tris': tris, 'min': list(mn), 'max': list(mx), 'objects': objs, 'materials': mats}, open(argv[1], 'w'), indent=1)
print('INSPECTED', argv[0], tris)
