# blender -b --factory-startup -P preview_glb.py -- in.glb out.png  : workbench textured render, 3/4 view
import bpy, sys, mathutils, math
a = sys.argv[sys.argv.index('--') + 1:]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=a[0])
ms = [o for o in bpy.data.objects if o.type == 'MESH']
vs = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
lo = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); hi = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
c = (lo + hi) / 2; r = (hi - lo).length
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam)
cam.location = c + mathutils.Vector((r * 0.9, -r * 0.9, r * 0.6)); d = c - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = cam
s = bpy.context.scene; s.render.engine = 'BLENDER_WORKBENCH'; s.display.shading.color_type = 'TEXTURE'; s.display.shading.light = 'STUDIO'
s.render.resolution_x = 640; s.render.resolution_y = 400; s.render.filepath = a[1]
bpy.ops.render.render(write_still=True)
print('PREV', a[1], [round(x, 2) for x in (hi - lo)])
