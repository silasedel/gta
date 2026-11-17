# Brand / emblem review renders (no browser): front close-up, rear close-up and a front-wheel close-up per car, vertex colors
# (paint shows white), wheels placed from the manifest.  blender -b --factory-startup -P render_review.py -- <outdir> <a.glb> ...
import bpy, sys, os, json, math
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]; out, glbs = a[0], a[1:]
os.makedirs(out, exist_ok=True)
for g in glbs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'VERTEX'
    sc.render.resolution_x = 640; sc.render.resolution_y = 400
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 35
    bpy.ops.import_scene.gltf(filepath=g)
    man = json.load(open(g[:-4] + '.json'))
    wheel = None
    for o in list(sc.objects):
        if o.type != 'MESH': continue
        if o.name.startswith('wheel0'): wheel = o
        elif not o.name.startswith('body0'): o.hide_render = True
        if o.data.color_attributes: o.data.color_attributes.active_color = o.data.color_attributes[0]
    if wheel is not None:
        for i, w in enumerate(man.get('wheels', [])):
            x, y, z = w['pos']  # game frame: x left, y up, z forward -> blender (x, -z, y)
            o = wheel if i == 0 else bpy.data.objects.new('w%d' % i, wheel.data)
            if i: sc.collection.objects.link(o)
            o.location = (x, -z, y); o.rotation_euler = (0, 0, math.pi if x < 0 else 0)
    L = man['dims']['L']; H = man['dims']['H']; fr = man['shape']['front']; rr = man['shape']['rear']
    w0 = man['wheels'][0]['pos'] if man.get('wheels') else [0.8, 0.35, 1.3]
    views = {'front': (Vector((0.6, -(fr + 2.6), H * 0.55)), Vector((0, -fr, H * 0.45))),
             'rear': (Vector((-0.6, -(rr - 2.6), H * 0.6)), Vector((0, -rr, H * 0.5))),
             'wheel': (Vector((w0[0] + 1.6, -w0[2] - 0.4, w0[1] + 0.2)), Vector((w0[0], -w0[2], w0[1])))}
    for name, (eye, look) in views.items():
        cam.location = eye; cam.rotation_euler = (look - eye).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, os.path.basename(g)[:-4] + '_' + name + '.png'); bpy.ops.render.render(write_still=True)
print('REVIEWED', len(glbs))
