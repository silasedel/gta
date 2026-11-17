# Front + side render of a source person model (EEVEE, textured) to judge pose / quality before rigging.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/render_src.py -- <model> <out.png>
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
if a[0].lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=a[0])
else: bpy.ops.import_scene.gltf(filepath=a[0])
ms = [o for o in bpy.data.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
c = (mn + mx) / 2; ext = mx - mn; size = max(ext) * 1.1
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'FLAT'
sc.render.resolution_x = 1400; sc.render.resolution_y = 1000
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.6
# view along the axis with the smallest extent (front)
ax = min(range(3), key=lambda i: ext[i])
d = Vector((0, 0, 0)); d[ax] = -1
cam.location = c + d * size * 3
cam.rotation_euler = (d * -1).to_track_quat('-Z', 'Z' if ax != 2 else 'Y').to_euler()
sc.render.filepath = a[1]; bpy.ops.render.render(write_still=True)
print('ext', [round(x, 3) for x in ext], 'axis', ax)
