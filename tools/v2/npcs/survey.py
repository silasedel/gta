# Survey every person model: tris, islands, bounds, facing hint, textures. Usage:
#   blender -b --python-exit-code 1 -P tools/v2/npcs/survey.py -- out.json <model files...>
import bpy, sys, json, bmesh
args = sys.argv[sys.argv.index('--') + 1:]
out, files = args[0], args[1:]
res = []
for path in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
        else: bpy.ops.import_scene.gltf(filepath=path)
    except Exception as e:
        res.append({'path': path, 'error': str(e)}); continue
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    r = {'path': path, 'meshes': len(meshes), 'arm': [o.name for o in bpy.data.objects if o.type == 'ARMATURE']}
    tris = 0; vs = []
    for o in meshes:
        me = o.data; tris += sum(len(p.vertices) - 2 for p in me.polygons)
        mw = o.matrix_world
        vs += [mw @ v.co for v in me.vertices]
    r['tris'] = tris
    mn = [min(v[i] for v in vs) for i in range(3)]; mx = [max(v[i] for v in vs) for i in range(3)]
    r['min'] = [round(x, 4) for x in mn]; r['max'] = [round(x, 4) for x in mx]
    H = mx[2] - mn[2]
    # feet: verts in the lowest 4 % -> their y extent vs the ankle column (8-12 %)
    low = [v for v in vs if v[2] < mn[2] + 0.03 * H]; ank = [v for v in vs if mn[2] + 0.08 * H < v[2] < mn[2] + 0.12 * H]
    if low and ank:
        r['footY'] = [round(min(v[1] for v in low), 4), round(max(v[1] for v in low), 4)]
        r['ankY'] = round(sum(v[1] for v in ank) / len(ank), 4)
    # islands
    o = meshes[0]
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    seen = set(); isl = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; seen.add(v.index); n = 0
        while stack:
            a = stack.pop(); n += 1
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); stack.append(b)
        isl.append(n)
    isl.sort(reverse=True); r['islands'] = len(isl); r['islandSizes'] = isl[:8]
    r['images'] = sorted({(im.name, im.size[0], im.size[1]) for im in bpy.data.images if im.size[0]})
    res.append(r)
    print('done', path, tris, len(isl), flush=True)
json.dump(res, open(out, 'w'), indent=1)
