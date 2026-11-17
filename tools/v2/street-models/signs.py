# Regulatory sign plates + U-channel post from the library sign sets (US MUTCD-style faces, worn): each plate is exported
# with its face toward Blender -Y (three.js +Z), centered, at its real size; the post is 1 unit tall (scaled in game).
#   blender -b --factory-startup -P signs.py -- <Models dir> <out dir> <info.json>
# Output GLBs: sign_set1.glb (stop, dne, noparking, nostanding, nobike, notruck, nouturn) and sign_set5.glb (oneway_l,
# oneway_r, passcare, rightonly, post). info.json: per plate the front-face UV rect (for re-painted faces: speed limits).
import bpy, bmesh, sys, os, json, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
MD, OD, INFO = argv[0], argv[1], argv[2]
SETS = {
    'sign_set1': ('Signs/Sign Set 1 - Prohibition Signs/Sign Set 1.blend', {
        'stop': ('pCylinder1', 0.76), 'dne': ('pCube66', 0.76), 'notruck': ('pCube65', 0.61), 'nobike': ('pCube67', 0.61),
        'noparking': ('pCube76', 0.46), 'nostanding': ('pCube75', 0.46), 'nouturn': ('pCube68', 0.61)}, None),
    'sign_set5': ('Signs/Sign Set 5 - Regulation Signs/Sign Set 5.blend', {
        'oneway_l': ('pCube134', 0.91), 'oneway_r': ('pCube133', 0.91), 'passcare': ('pCube128', 0.61), 'rightonly': ('pCube129', 0.61)}, 'pCube101'),
}
info = {}
for out, (path, plates, post) in SETS.items():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(MD, path))
    sc = bpy.context.scene
    keep = {v[0]: k for k, v in plates.items()}
    if post: keep[post] = 'post'
    made = []
    for o in list(sc.objects):
        if o.type != 'MESH' or o.name not in keep: continue
        name = keep[o.name]
        me = o.data.copy(); me.transform(o.matrix_world)
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); uvl = bm.loops.layers.uv.active
        if name == 'post':
            vs = [v.co for v in bm.verts]; mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
            ax = max(range(3), key=lambda i: mx[i] - mn[i]); L = mx[ax] - mn[ax]
            c = (mn + mx) / 2
            bmesh.ops.translate(bm, verts=bm.verts, vec=-c)
            if ax == 0: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'Y'))
            if ax == 1: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'X'))
            bmesh.ops.scale(bm, verts=bm.verts, vec=(1 / L, 1 / L, 1 / L)); bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
            vs = [v.co for v in bm.verts]; info['post'] = {'w': max(v.x for v in vs) - min(v.x for v in vs), 'd': max(v.y for v in vs) - min(v.y for v in vs), 'srcLen': L}
        else:
            big = sorted(bm.faces, key=lambda f: -f.calc_area())[:2]
            vc = lambda f: sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
            front = min(big, key=vc)  # sign art lies below the blank back in the atlas (smaller Blender v)
            n = front.normal.copy(); c = front.calc_center_median()
            # rotate face normal -> -Y, keep 'up' as +Z
            yaw = -math.pi / 2 - math.atan2(n.y, n.x)
            bmesh.ops.translate(bm, verts=bm.verts, vec=-c)
            R = mathutils.Matrix.Rotation(yaw, 3, 'Z'); bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=R)
            n2 = R @ n
            if abs(n2.z) > 0.5:  # plate lying flat: tip it up
                bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(-math.pi / 2 if n2.z > 0 else math.pi / 2, 3, 'X'))
            vs = [v.co for v in bm.verts]; w = max(v.x for v in vs) - min(v.x for v in vs); h = max(v.z for v in vs) - min(v.z for v in vs)
            s = plates[name][1] / w; bmesh.ops.scale(bm, verts=bm.verts, vec=(s, s, s))
            # art orientation: the face's lowest-v corner (bottom of the art in the atlas) must be at the bottom (-Z)
            bm.faces.ensure_lookup_table(); fr = min(sorted(bm.faces, key=lambda f: -f.calc_area())[:2], key=vc)
            lo = min(fr.loops, key=lambda l: l[uvl].uv.y); hi = max(fr.loops, key=lambda l: l[uvl].uv.y)
            if lo.vert.co.z > hi.vert.co.z: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi, 3, 'Y'))
            us = [l[uvl].uv for l in fr.loops]
            vs = [v.co for v in bm.verts]
            info[name] = {'set': out, 'uv': [min(u.x for u in us), min(u.y for u in us), max(u.x for u in us), max(u.y for u in us)], 'w': plates[name][1], 'h': (max(v.z for v in vs) - min(v.z for v in vs)), 'd': max(v.y for v in vs) - min(v.y for v in vs)}
        bm.to_mesh(me); bm.free()
        no = bpy.data.objects.new(name, me); made.append(no)
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    for o in made: sc.collection.objects.link(o)
    for im in bpy.data.images:
        if im.size[0] > 1024: im.scale(1024, 1024)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OD, out + '.glb'), export_format='GLB', use_selection=False, export_apply=True, export_image_format='JPEG', export_jpeg_quality=90, export_materials='EXPORT', export_yup=True)
    print('SIGNS', out, [o.name for o in made])
json.dump(info, open(INFO, 'w'), indent=1)
print('INFO', json.dumps(info))
