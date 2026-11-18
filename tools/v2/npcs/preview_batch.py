# Quick front + side preview of source people (FBX / GLB in Models/NPCs), one Blender session for all of them.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/preview_batch.py -- <out_dir> <folder> [<folder> ...]
# Reads the mesh + its textures only (no scripts from the downloads), renders Workbench with texture colors.
import bpy, sys, os, glob, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
out, folders = a[0], a[1:]
os.makedirs(out, exist_ok=True)
for d in folders:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    f = (glob.glob(os.path.join(d, '*.fbx')) + glob.glob(os.path.join(d, '*.glb')))
    if not f: print('[prev] none', d); continue
    try:
        if f[0].lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=f[0])
        else: bpy.ops.import_scene.gltf(filepath=f[0])
    except Exception as e: print('[prev] fail', d, e); continue
    sc = bpy.context.scene
    ms = [o for o in sc.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) / 2; ext = mx - mn; up = 2 if ext.z >= ext.y else 1
    H = ext[up]
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(ext.x, H) * 1.08
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
    sc.render.resolution_x, sc.render.resolution_y = 300, 420; sc.render.film_transparent = False
    name = os.path.basename(d.rstrip('/')).split(' - ')[0].replace(' ', '')
    for k, (dx, dy) in enumerate([(0, -1), (-1, 0)]):
        dist = H * 3
        if up == 2: cam.location = (c.x + dx * dist, c.y + dy * dist, c.z); cam.rotation_euler = (math.pi / 2, 0, math.atan2(dx, -dy) if (dx or dy) else 0)
        else: cam.location = (c.x + dx * dist, c.y, c.z + dy * dist); cam.rotation_euler = (0, 0, 0)
        if up == 2 and dx == -1: cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
        sc.render.filepath = os.path.join(out, f'{name}_{k}.png'); bpy.ops.render.render(write_still=True)
    print('[prev] ok', name, round(H, 3), up, flush=True)
