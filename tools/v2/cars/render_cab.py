# Cab review renders (no browser): driver side 3/4 at window height.  <key>_cabmat.png colors by slot (paint light gray,
# glass cyan, trim dark, lamp red: missing side glass shows as a hole); <key>_cabin.png hides the glass and shows vertex
# colors, so light interior panels (white visors / headliner sheets) are easy to spot.
#   blender -b --factory-startup -P render_cab.py -- <outdir> <a.glb> ...
import bpy, sys, os, json, math, bmesh
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; out, glbs = a[0], a[1:]
os.makedirs(out, exist_ok=True)
COL = {'S_paint': (0.75, 0.75, 0.75, 1), 'S_glass': (0.2, 0.8, 0.9, 1), 'S_trim': (0.06, 0.06, 0.07, 1), 'S_lamp': (0.8, 0.1, 0.1, 1)}
for g in glbs:
    k = os.path.basename(g)[:-4]
    for mode in (os.environ.get('MODES') or 'cabmat,cabin,cabin_r').split(','):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'
        sh.color_type = 'MATERIAL' if mode == 'cabmat' else 'VERTEX'
        sc.render.resolution_x = 800; sc.render.resolution_y = 500
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 30
        bpy.ops.import_scene.gltf(filepath=g)
        man = json.load(open(g[:-4] + '.json'))
        for o in list(sc.objects):
            if o.type != 'MESH': continue
            if not o.name.startswith('body0'): o.hide_render = True; continue
            if o.data.color_attributes: o.data.color_attributes.active_color = o.data.color_attributes[0]
            for m in o.data.materials:
                for nm, c in COL.items():
                    if m.name.startswith(nm): m.diffuse_color = c
            if mode != 'cabmat':
                bm = bmesh.new(); bm.from_mesh(o.data)
                gi = [i for i, m in enumerate(o.data.materials) if m.name.startswith('S_glass')]
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in gi], context='FACES'); bm.to_mesh(o.data); bm.free()
        H = man['dims']['H']; s = man.get('seats') or []
        hip = s[0]['hip'] if s and isinstance(s[0], dict) and s[0].get('hip') else [0.4, H * 0.45, 0.2]
        sx = 1 if mode != 'cabin_r' else -1   # +x = car left = driver side (blender x = game x, blender -y = game z)
        eye = Vector((sx * 3.2, -(hip[2] - 1.6), hip[1] + 0.55)); look = Vector((0, -(hip[2] - 0.3), hip[1] + 0.25))
        cam.location = eye; cam.rotation_euler = (look - eye).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, k + '_' + mode + '.png'); bpy.ops.render.render(write_still=True)
print('CAB', len(glbs))
