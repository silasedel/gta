# Quick offline check of converted cars (no browser): vertex-color Workbench renders, front-left 3/4 + rear-right 3/4.
# blender -b --factory-startup -P render_glb.py -- <out.png> <a.glb> [b.glb ...]   (one row per car, two views)
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; out, glbs = a[0], a[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'VERTEX'
sc.render.resolution_x = 520; sc.render.resolution_y = 320
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 35
import os
paths = []
for g in glbs:
    for o in list(sc.objects):
        if o is not cam: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=g)
    for o in sc.objects:
        if o.type == 'MESH' and not o.name.startswith('body0') and not o.name.startswith('wheel0'): o.hide_render = True
        pass
    for o in sc.objects:
        if o.type == 'MESH' and o.data.color_attributes: o.data.color_attributes.active_color = o.data.color_attributes[0]
    mx = max((max((o.matrix_world @ Vector(c)).length for c in o.bound_box) for o in sc.objects if o.type == 'MESH' and not o.hide_render), default=3)
    for k, d in enumerate([(0.75, -1.0, 0.45), (-0.75, 1.0, 0.4)]):
        dv = Vector(d).normalized(); cam.location = Vector((0, 0, 0.7)) + dv * mx * 2.2
        cam.rotation_euler = (Vector((0, 0, 0.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        p = out.replace('.png', f'_{os.path.basename(g)[:-4]}_{k}.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); paths.append(p)
print('RENDERED', len(paths))
