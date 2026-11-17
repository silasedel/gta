# Quick preview render of a .blend or .glb (Workbench, textured): blender -b --factory-startup --disable-autoexec -P preview.py -- <file> <out.png>
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
if src.endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
for o in sc.objects:
    if o.type != 'MESH' or not o.visible_get(): continue
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c); mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
c = (mn + mx) / 2; size = max(mx - mn)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.15; cam.data.clip_start = size * 0.001; cam.data.clip_end = size * 20
d = size * 3; up = 'Z'
cam.location = c + mathutils.Vector((d * 0.94, -d * 0.0, d * 0.12)) if not src.endswith('.glb') else c + mathutils.Vector((d * 0.94, 0, d * 0.12))
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_backface_culling = False
sc.render.resolution_x = 512; sc.render.resolution_y = 512; sc.render.film_transparent = False
if sc.world: sc.world.color = (0.6, 0.7, 0.8)
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
print('PREVIEW', out, [round(x, 2) for x in mn], [round(x, 2) for x in mx])
