# Inspect a .blend: objects, dimensions, poly counts, materials; render a workbench thumbnail.
# blender -b -Y <file.blend> --python-exit-code 1 --python inspect.py -- out.png
import bpy, sys, mathutils
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[0] if argv else None
tot = 0
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
for o in bpy.context.scene.objects:
    if o.type != 'MESH': print('OBJ', o.type, o.name); continue
    n = len(o.data.polygons); tot += n
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    lo = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); hi = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
    mn = mathutils.Vector([min(mn[i], lo[i]) for i in range(3)]); mx = mathutils.Vector([max(mx[i], hi[i]) for i in range(3)])
    print('MESH %-40s polys %7d  lo %s hi %s mats %s' % (o.name[:40], n, tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi), [m.name for m in o.data.materials if m][:4]))
print('TOTAL polys', tot, 'bbox', tuple(round(v, 2) for v in mn), tuple(round(v, 2) for v in mx))
if out:
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = 900; sc.render.resolution_y = 600; sc.render.filepath = out
    c = (mn + mx) / 2; ext = (mx - mn).length
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = c + mathutils.Vector((0.75, -1.0, 0.6)).normalized() * ext * 1.1
    co.rotation_euler = (c - co.location).to_track_quat('-Z', 'Y').to_euler()
    cam.clip_end = ext * 10
    bpy.ops.render.render(write_still=True)
