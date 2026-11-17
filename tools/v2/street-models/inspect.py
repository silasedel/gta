# Inspect a library .blend: objects, tris, dims, materials, images; renders a preview PNG.
# blender -b --factory-startup -P inspect.py -- <file.blend> <out_prefix>
import bpy, sys, math, mathutils, json
argv = sys.argv[sys.argv.index('--')+1:]
src, out = argv[0], argv[1]
if src.endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
    else: bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
objs = [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]
mn = mathutils.Vector((1e9,)*3); mx = mathutils.Vector((-1e9,)*3); per = []; tris = 0
for o in objs:
    e = o.evaluated_get(dg); m = e.to_mesh(); t = sum(len(p.vertices)-2 for p in m.polygons); tris += t
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    for w in bb: mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
    omn = mathutils.Vector(map(min, *bb)) if len(bb) > 1 else bb[0]
    per.append({'name': o.name, 'tris': t, 'mats': [s.material.name if s.material else None for s in o.material_slots], 'min': [round(v,2) for v in mathutils.Vector([min(w[i] for w in bb) for i in range(3)])], 'max': [round(v,2) for v in mathutils.Vector([max(w[i] for w in bb) for i in range(3)])], 'parent': o.parent.name if o.parent else None})
    e.to_mesh_clear()
imgs = [{'name': i.name, 'size': list(i.size), 'file': i.filepath} for i in bpy.data.images]
mats = []
for m in bpy.data.materials:
    if not m.use_nodes: mats.append({'name': m.name}); continue
    b = m.node_tree.nodes.get('Principled BSDF')
    d = {'name': m.name}
    if b:
        d['base'] = [round(x,2) for x in b.inputs['Base Color'].default_value]
        d['tex'] = [l.from_node.image.name for l in b.inputs['Base Color'].links if hasattr(l.from_node, 'image') and l.from_node.image]
        d['metal'] = round(b.inputs['Metallic'].default_value,2); d['rough'] = round(b.inputs['Roughness'].default_value,2)
    mats.append(d)
info = {'src': src, 'objects': len(objs), 'tris': tris, 'min': [round(v,3) for v in mn], 'max': [round(v,3) for v in mx], 'unit': sc.unit_settings.scale_length, 'per': per, 'images': imgs, 'mats': mats}
json.dump(info, open(out + '.json', 'w'), indent=1)
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
c = (mn + mx) / 2; size = max(mx - mn)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50; cam.data.clip_start = size * 0.01; cam.data.clip_end = size * 20
d = size * 2.1
cam.location = c + mathutils.Vector((d * 0.75, -d * 0.75, d * 0.35))
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
if not sc.world: sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes.get('Background')
if bg: bg.inputs[0].default_value = (0.55, 0.7, 0.9, 1); bg.inputs[1].default_value = 0.8
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception: sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 512; sc.render.resolution_y = 512; sc.render.resolution_percentage = 100
sc.render.filepath = out + '.png'
bpy.ops.render.render(write_still=True)
print('INSPECTED', src, tris)
