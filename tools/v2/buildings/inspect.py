# Blender: print a model's dimensions (m, Z up), triangle count, objects, materials and texture sizes as one JSON line.
#   blender -b -Y --python inspect.py -- <file.glb|fbx>
import bpy, sys, json, mathutils
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.glb'): bpy.ops.import_scene.gltf(filepath=src)
else: bpy.ops.import_scene.fbx(filepath=src)
ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = mathutils.Vector((1e9,) * 3); hi = -lo
tris = 0; big = []
for o in ms:
    for v in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(v)
        for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    t = sum(len(p.vertices) - 2 for p in o.data.polygons); tris += t; big.append((t, o.name))
big.sort(reverse=True)
mats = sorted({s.material.name for o in ms for s in o.material_slots if s.material})
imgs = sorted({(im.name, im.size[0], im.size[1]) for im in bpy.data.images if im.size[0]}, key=lambda x: -x[1] * x[2])
print('INSPECT ' + json.dumps({'file': src.split('/Models/')[-1], 'dims': [round(hi[i] - lo[i], 2) for i in range(3)], 'min': [round(lo[i], 2) for i in range(3)], 'tris': tris, 'objs': len(ms), 'top': [f'{n}:{t}' for t, n in big[:8]], 'mats': len(mats), 'matnames': mats[:30], 'imgs': [f'{n}:{w}x{h}' for n, w, h in imgs[:14]]}))
