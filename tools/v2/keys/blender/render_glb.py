# blender -b --python render_glb.py -- in.glb out.png [elev]: textured workbench thumbnail of a converted GLB (+ piece names)
import bpy, sys, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
sc = bpy.context.scene
ms = [o for o in sc.objects if o.type == 'MESH']
vs = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
for o in ms:
    w = [o.matrix_world @ v.co for v in o.data.vertices]
    print('PIECE', o.name, [round(min(v[i] for v in w), 2) for i in range(3)], [round(max(v[i] for v in w), 2) for i in range(3)])
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = 1000; sc.render.resolution_y = 650; sc.render.filepath = a[1]
c = (mn + mx) / 2; ext = (mx - mn).length; el = float(a[2]) if len(a) > 2 else 0.6
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
co.location = c + mathutils.Vector((0.8, -1.0, el)).normalized() * ext * 1.05
co.rotation_euler = (c - co.location).to_track_quat('-Z', 'Y').to_euler(); cam.clip_end = ext * 10
bpy.ops.render.render(write_still=True)
