# Blender: quick 3/4 thumbnail (workbench, texture colors) of a model file or a converted GLB.
#   blender -b -Y --python thumb.py -- <in.glb|fbx> <out.png> [az_deg] [size] [front 0|1]
import bpy, sys, math, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]; az = math.radians(float(a[2])) if len(a) > 2 else math.radians(35); size = int(a[3]) if len(a) > 3 else 640
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.glb') or src.lower().endswith('.gltf'): bpy.ops.import_scene.gltf(filepath=src)
else: bpy.ops.import_scene.fbx(filepath=src)
sc = bpy.context.scene
ms = [o for o in sc.objects if o.type == 'MESH']
lo = mathutils.Vector((1e9,) * 3); hi = -lo
for o in ms:
    for v in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(v)
        for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
c = (lo + hi) / 2; R = (hi - lo).length / 2
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50; el = math.radians(22)
d = R / math.sin(math.radians(17)) * 1.05
cam.location = c + mathutils.Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * d
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = d * 4; cam.data.clip_start = d / 1000
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_shadows = True; sc.display.shading.show_cavity = True
sc.render.resolution_x = size; sc.render.resolution_y = int(size * 0.75); sc.render.filepath = out
sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.55, 0.62, 0.7)
bpy.ops.render.render(write_still=True)
print('THUMB', out)
