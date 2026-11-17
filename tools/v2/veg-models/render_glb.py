import bpy, sys, os, json, math, mathutils
argv = sys.argv[sys.argv.index('--')+1:]
blend, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=blend)
sc = bpy.context.scene
objs = [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]
dg = bpy.context.evaluated_depsgraph_get()
tris = 0; mats = set(); mn = mathutils.Vector((1e9,)*3); mx = mathutils.Vector((-1e9,)*3)
per = []
for o in objs:
    e = o.evaluated_get(dg); m = e.to_mesh()
    t = sum(len(p.vertices) - 2 for p in m.polygons); tris += t
    for s in o.material_slots:
        if s.material: mats.add(s.material.name)
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c); mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
    per.append((o.name, t, [s.material.name if s.material else None for s in o.material_slots], [round(v,2) for v in o.matrix_world.translation], [round(v,2) for v in o.dimensions]))
    e.to_mesh_clear()
info = {'blend': blend, 'objects': len(objs), 'tris': tris, 'mats': sorted(mats), 'min': list(mn), 'max': list(mx), 'per': per[:40], 'unit': sc.unit_settings.scale_length}
json.dump(info, open(out + '.json', 'w'), indent=1)
# render
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
c = (mn + mx) / 2; size = max(mx - mn)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50; cam.data.clip_start = size * 0.01; cam.data.clip_end = size * 20
d = size * 2.3
cam.location = c + mathutils.Vector((d * 0.7, -d * 0.7, d * 0.25))
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
if not sc.world: sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes.get('Background')
if bg: bg.inputs[0].default_value = (0.55, 0.7, 0.9, 1); bg.inputs[1].default_value = 0.8
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception: sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 480; sc.render.resolution_y = 480; sc.render.resolution_percentage = 100
sc.render.filepath = out + '.png'; sc.render.film_transparent = False
bpy.ops.render.render(write_still=True)
