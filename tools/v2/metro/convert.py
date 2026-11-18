# r2-metro: Blender conversion of the user's subway models into game GLBs (public/assets/metro/).
#   blender -b --disable-autoexec <source.blend> --python-exit-code 1 --python tools/v2/metro/convert.py -- <mode> <out.glb> [texdir]
# modes:
#   entrance : Street Props Pack 2 'subway' stair head only, transforms cleared, centered on the stair box, the fixed
#              fascia / wall textures from textures.py (SOUTHLINE instead of the real-world line bullets and words)
#   station  : Subway 3 (straight platform strip), joined per material
#   train    : Train 2 (blue car shell): the 0.96 M-triangle roof vent dropped, heavy parts decimated, mirrored at the
#              cart divider into one 24 m car, materials recalibrated to the art style (Southline livery is added at runtime)
# Textures are downscaled to 1024 px (2048 for the big atlases) so the whole metro stays a few MB.
import bpy, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
MODE, OUT = argv[0], argv[1]
TEX = argv[2] if len(argv) > 2 else None
sc = bpy.context.scene


def meshes():
    return [o for o in sc.objects if o.type == 'MESH']


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def select(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def apply_all():
    for o in meshes():
        o.hide_set(False); o.hide_viewport = False
    # unparent keeping transforms, then apply
    select(meshes())
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in meshes():
        if o.data.users > 1:
            o.data = o.data.copy()
    select(meshes())
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(sc.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o)


def join_by_material():
    groups = {}
    for o in meshes():
        if len(o.data.materials) <= 1:
            k = o.data.materials[0].name if o.data.materials and o.data.materials[0] else '_none'
        else:
            k = '_multi'
        groups.setdefault(k, []).append(o)
    for k, objs in groups.items():
        if len(objs) > 1:
            select(objs)
            bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = 'm_' + k


def shrink_images(maxpx=1024, big=None):
    big = big or {}
    for im in bpy.data.images:
        if im.size[0] == 0:
            continue
        lim = big.get(im.name, maxpx)
        w, h = im.size
        if max(w, h) > lim:
            s = lim / max(w, h)
            im.scale(max(1, int(w * s)), max(1, int(h * s)))


def principled(m):
    return m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None


def set_base(mname, rgb, rough=None, metal=None):
    m = bpy.data.materials.get(mname)
    b = principled(m)
    if not b:
        return
    b.inputs['Base Color'].default_value = (*rgb, 1)
    if rough is not None:
        b.inputs['Roughness'].default_value = rough
    if metal is not None:
        b.inputs['Metallic'].default_value = metal


def decimate(o, ratio):
    md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = ratio
    select([o]); bpy.ops.object.modifier_apply(modifier=md.name)


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    select(meshes())
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_image_format='AUTO', export_animations=False, export_cameras=False, export_lights=False)
    print('EXPORTED', OUT, 'tris', sum(tris(o) for o in meshes()), 'meshes', len(meshes()))


if MODE == 'entrance':
    for o in list(sc.objects):
        if o.type == 'MESH' and o.name != 'subway':
            bpy.data.objects.remove(o)
    apply_all()
    o = meshes()[0]
    # the pack places it at an angle: find the yaw that gives the tightest footprint and turn it square to the axes
    import math
    xy = [(v.co.x, v.co.y) for v in o.data.vertices]
    best = None
    for i in range(180):
        a = math.radians(i * 0.5); ca, sa = math.cos(a), math.sin(a)
        xs = [x * ca - y * sa for x, y in xy]; ys = [x * sa + y * ca for x, y in xy]
        ar = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if best is None or ar < best[0]:
            best = (ar, a)
    o.data.transform(Matrix.Rotation(best[1], 4, 'Z'))
    print('ENTRANCE yaw', round(math.degrees(best[1]), 1))
    bb = [v.co for v in o.data.vertices]
    mn = Vector([min(v[i] for v in bb) for i in range(3)]); mx = Vector([max(v[i] for v in bb) for i in range(3)])
    c = (mn + mx) / 2
    o.data.transform(Matrix.Translation((-c.x, -c.y, 0)))
    print('ENTRANCE bounds', tuple(round(v, 2) for v in (mn - Vector((c.x, c.y, 0)))), tuple(round(v, 2) for v in (mx - Vector((c.x, c.y, 0)))))
    if TEX:
        for im in bpy.data.images:
            n = im.filepath.replace('\\', '/').split('/')[-1]
            if n.startswith('Subway M Subway Roof Color'):
                im.filepath = os.path.join(TEX, 'ent_roof.jpg'); im.reload()
            elif n.startswith('Subway M Subway Base Color'):
                im.filepath = os.path.join(TEX, 'ent_base.jpg'); im.reload()
    shrink_images(1024)
    export()

elif MODE == 'station':
    apply_all()
    join_by_material()
    shrink_images(1024)
    export()

elif MODE == 'train':
    for o in list(sc.objects):
        if o.type == 'MESH' and o.name in ('Air_ventL', 'Cart_divider', 'floorparting'):
            bpy.data.objects.remove(o)
    apply_all()
    for o in meshes():
        t = tris(o)
        if t > 2000 and not any(k in o.name for k in ('Walls', 'Back_Wall', 'Roof', 'floor', 'Glass', 'glass', 'Door', 'door_1')):
            decimate(o, max(0.05, 1500 / t))
    # mirror at the cart divider (y = 0): one 24 m car with an end door at each end
    src = meshes()
    for o in src:
        d = o.copy(); d.data = o.data.copy(); sc.collection.objects.link(d)
        d.data.transform(Matrix.Scale(-1, 4, (0, 1, 0)))
        d.data.flip_normals()
    # recalibrate (ART_STYLE: no pure whites, painted metals 0.35-0.55, rubber near black, floors mid-dark)
    set_base('Floor', (0.16, 0.17, 0.18), rough=0.7)
    set_base('Roof', (0.42, 0.43, 0.44), rough=0.55, metal=0.3)
    set_base('Billboards', (0.62, 0.62, 0.6), rough=0.6)
    set_base('Divider', (0.09, 0.1, 0.11))
    set_base('Bars', (0.62, 0.63, 0.64), rough=0.3, metal=1.0)
    set_base('Glass', (0.35, 0.4, 0.42), rough=0.05)
    if TEX:   # graffiti-free atlases from kit_textures.py
        for im in bpy.data.images:
            n = im.filepath.replace('\\', '/').split('/')[-1]
            for k in ('Walls Color', 'Bench Color'):
                if n.startswith(k):
                    im.filepath = os.path.join(TEX, k + '.jpg'); im.reload()
    join_by_material()
    shrink_images(1024, big={})
    export()

elif MODE == 'props1':
    # one clean instance of each Subway 1 station prop (the kit merges every copy into one mesh): split loose parts,
    # cluster them by distance, keep the cluster nearest the kit's middle, sit it on its own origin (bottom center)
    import bmesh
    WANT = {'Banco': 'bench', 'Papelera': 'bin', 'CamaraSeguridad': 'camera', 'Megafono': 'speaker', 'FluorescenteLuz': 'lamp', 'Fluorescente': 'lampbody', 'CartelSalida Izquierda': 'exitsign'}
    apply_all()
    keep = []
    for key, out in WANT.items():
        objs = [o for o in meshes() if o.data.materials and o.data.materials[0] and o.data.materials[0].name.rstrip('+') == key and not o.name.startswith('prop_')]
        if not objs:
            print('MISSING', key); continue
        select(objs)
        if len(objs) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
        parts = [p for p in bpy.context.selected_objects]
        def cen(p):
            bb = [p.matrix_world @ Vector(c) for c in p.bound_box]; return sum(bb, Vector()) / 8
        cs = {p.name: cen(p) for p in parts}
        seed = min(parts, key=lambda p: (cs[p.name] - Vector((-4, -15, 1))).length)
        clus = [seed]; grow = True
        while grow:
            grow = False
            for p in parts:
                if p not in clus and min((cs[p.name] - cs[q.name]).length for q in clus) < 1.4:
                    clus.append(p); grow = True
        for p in parts:
            if p not in clus: bpy.data.objects.remove(p)
        select(clus)
        if len(clus) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        bb = [Vector(c) for c in o.bound_box]
        mn = Vector([min(v[i] for v in bb) for i in range(3)]); mx = Vector([max(v[i] for v in bb) for i in range(3)])
        o.data.transform(Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
        o.name = 'prop_' + out; keep.append(o)
        print('PROP', out, 'tris', tris(o), 'size', tuple(round(v, 2) for v in (mx - mn)), 'z0', round(mn.z, 2))
    for o in list(meshes()):
        if o not in keep: bpy.data.objects.remove(o)
    shrink_images(1024)
    export()

elif MODE == 'prop':
    # a single library prop: joined, decimated to argv[3] ratio, bottom-center origin
    apply_all()
    select(meshes())
    if len(meshes()) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    r = float(argv[3]) if len(argv) > 3 else 1.0
    if r < 1: decimate(o, r)
    bb = [Vector(c) for c in o.bound_box]
    mn = Vector([min(v[i] for v in bb) for i in range(3)]); mx = Vector([max(v[i] for v in bb) for i in range(3)])
    o.data.transform(Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
    print('PROP size', tuple(round(v, 2) for v in (mx - mn)))
    shrink_images(1024)
    export()
