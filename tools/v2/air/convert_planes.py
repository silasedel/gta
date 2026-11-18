# r4-air: converts the user's library planes (Models/Planes) into game GLBs at public/assets/vehicles/air/<key>.glb.
#   blender -b --disable-autoexec --python tools/v2/air/convert_planes.py -- <key|all>
# Output frame (glTF): +Z nose, +Y up, +X left wing, meters, y = 0 at the lowest gear / float contact, x = 0 centerline,
# z = 0 at the bounding-box center. Spinning parts become PROP<n> nodes (origin at the hub), control surfaces
# AIL_L / AIL_R / ELEV / RUD nodes (origin on the hinge line = their forward edge). Tiny over-dense parts are dropped.
import bpy, bmesh, sys, os, re, math, mathutils, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'Models', 'Planes')
OUT = os.path.join(ROOT, 'public', 'assets', 'vehicles', 'air')
CFG = {
  'floatplane': {'src': 'Plane 3 - Classic Bush Floatplane/Plane 3.glb',
                 'props': [r'^helice', r'^bol'], 'ail': (r'^aileronG', r'^aileronD'), 'elev': r'^profondeur', 'rud': r'^direction',
                 'drop': [r'^Cylindre'], 'tex': 1024},
  'prop':       {'src': 'Plane 9 - High-Wing Single-Prop Light Plane/Plane 9.glb',
                 'props': [r'^helice', r'^bol'], 'ail': (r'^aileronG', r'^aileronD'), 'elev': r'^profondeur', 'rud': r'^direction',
                 'drop': [r'^plaque'], 'tex': 1024},
  'bizjet':     {'src': 'Plane 13 - Gold-Trim Business Jet/Plane 13.glb', 'props': [], 'tex': 2048},
}
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
keys = list(CFG) if args[0] == 'all' else args
os.makedirs(OUT, exist_ok=True)
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def bbox(objs):
    mn = mathutils.Vector((1e9,) * 3); mx = -mn
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for i in range(3): mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx
def match(o, pats): return any(re.search(p, o.name) for p in pats)
report = {}
for key in keys:
    c = CFG[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, c['src']))
    sc = bpy.context.scene
    # bake every object's world transform into its mesh, unparent
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.data = o.data.copy(); o.data.transform(mw); o.matrix_world = mathutils.Matrix.Identity(4)
    for o in [o for o in sc.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    # drop: listed parts + tiny over-dense parts (instrument screws, plaques)
    for o in list(meshes):
        mn, mx = bbox([o]); sz = max(mx - mn)
        if match(o, c.get('drop', [])) or (tris(o) > 3000 and sz < 0.3):
            meshes.remove(o); bpy.data.objects.remove(o)
    mn, mx = bbox(meshes)
    # nose direction: the tail fin is the highest part; the nose is the other end of the long axis
    hi = mx[2] - 0.25 * (mx[2] - mn[2]); acc = [0.0, 0.0]; n = 0
    for o in meshes:
        for v in o.data.vertices:
            if v.co[2] > hi: acc[0] += v.co[0]; acc[1] += v.co[1]; n += 1
    off = [acc[i] / max(1, n) - (mn[i] + mx[i]) / 2 for i in (0, 1)]
    long = 0 if abs(off[0]) / (mx[0] - mn[0]) > abs(off[1]) / (mx[1] - mn[1]) else 1   # the fin sits off-center along the fuselage only
    tailAt = acc[long] / max(1, n); mid = (mn[long] + mx[long]) / 2
    noseSign = -1 if tailAt > mid else 1      # nose toward -axis when the fin sits on the + side
    # rotation that sends the nose to Blender -Y (glTF +Z), keeping +Z up
    nose = mathutils.Vector((0, 0, 0)); nose[long] = noseSign
    ang = math.atan2(nose[0], -nose[1])   # rotate about Z so `nose` -> (0,-1,0)
    R = mathutils.Matrix.Rotation(-ang, 4, 'Z')
    if (R @ nose - mathutils.Vector((0, -1, 0))).length > 1e-3: R = mathutils.Matrix.Rotation(ang, 4, 'Z')
    for o in meshes: o.data.transform(R)
    mn, mx = bbox(meshes)
    T = mathutils.Matrix.Translation((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))
    for o in meshes: o.data.transform(T)
    nodes = {}
    def group(name, pats, pivot):
        objs = [o for o in meshes if match(o, pats)]
        if not objs: return None
        for o in objs: meshes.remove(o)
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active; o.name = name
        a, b = bbox([o]); ctr = (a + b) / 2
        p = ctr.copy()
        if pivot == 'front': p[1] = a[1]                    # hinge on the forward edge (nose is -Y)
        o.data.transform(mathutils.Matrix.Translation(-p)); o.location = p
        nodes[name] = [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]   # glTF frame
        return o
    if c['props']: group('PROP0', c['props'], 'center')
    if c.get('ail'): group('AIL_L', [c['ail'][0]], 'front'); group('AIL_R', [c['ail'][1]], 'front')
    if c.get('elev'): group('ELEV', [c['elev']], 'front')
    if c.get('rud'): group('RUD', [c['rud']], 'front')
    # everything else -> one BODY object
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]; bpy.ops.object.join(); body = bpy.context.view_layer.objects.active; body.name = 'BODY'
    # textures: cap the size
    for img in bpy.data.images:
        if img.size[0] > c['tex'] or img.size[1] > c['tex']:
            f = c['tex'] / max(img.size); img.scale(max(1, int(img.size[0] * f)), max(1, int(img.size[1] * f)))
    a, b = bbox([o for o in sc.objects if o.type == 'MESH'])
    tot = sum(tris(o) for o in sc.objects if o.type == 'MESH')
    out = os.path.join(OUT, key + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='WEBP', export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False)
    report[key] = {'tris': tot, 'size_xyz_gltf': [round(b[0] - a[0], 2), round(b[2] - a[2], 2), round(b[1] - a[1], 2)], 'nodes': nodes, 'bytes': os.path.getsize(out), 'src': c['src']}
    print('CONVERTED', key, json.dumps(report[key]))
rp = os.path.join(OUT, 'manifest.json')
old = json.load(open(rp)) if os.path.exists(rp) else {}
old.update(report); json.dump(old, open(rp, 'w'), indent=1)
