# Service trucks (tow + garbage): clean the user's source models before the shared car converter (tools/v2/cars/convert.py).
#   blender -b --factory-startup -P tools/v2/cars/service/prep.py -- <truck12|truck13> <src> <out.blend>
# truck12 (rollback tow truck, Models/Cars/Trucks/Truck 12): the source's front-right wheel is a broken, tilted copy that sits
#   30 units under the ground (the converter then found 0 wheels): it is replaced by the front-left wheel mirrored; the loose
#   traffic cones on the deck go; maker emblems are dropped by convert.py (dropMat).
# truck13 (front-load refuse truck, Truck 13; user: "a terrible plain version, round some edges"): every hard edge of the cab,
#   the refuse body, the hopper, bumpers, tanks and steps gets a small 3-segment bevel (angle-limited, so curved panels keep
#   their shape) and weighted normals, so the flat-shaded box panels read as pressed / rolled steel with soft radii.
import bpy, sys, math, re
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
KEY, SRC, OUT = a[0], a[1], a[2]
def log(*x): print('[prep]', KEY, *x, flush=True)

if SRC.lower().endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=SRC, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']

def bounds(o):
    ps = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(map(min, *ps)), Vector(map(max, *ps))

if KEY == 'truck12':
    byname = {o.name: o for o in meshes}
    fl = next(o for o in meshes if o.name.startswith('wheel_FL_'))
    bad = [o for o in meshes if o.name.startswith('wheel_FL001')]
    for o in bad: log('removed broken wheel', o.name); bpy.data.objects.remove(o, do_unlink=True)
    # mirror the front-left wheel about the truck's centerline (x = 0: the deck spans -134..134)
    fr = fl.copy(); fr.data = fl.data.copy(); fr.name = 'wheel_FR_mirror'; sc.collection.objects.link(fr)
    fr.matrix_world = __import__('mathutils').Matrix.Scale(-1, 4, Vector((1, 0, 0))) @ fl.matrix_world
    for o in [o for o in sc.objects if o.type == 'MESH' and re.match(r'cones', o.name)]:
        log('removed', o.name); bpy.data.objects.remove(o, do_unlink=True)
    for o in sc.objects:
        if o.type == 'MESH': mn, mx = bounds(o); log('obj', o.name, [round(v) for v in mn], [round(v) for v in mx])

if KEY == 'truck13':
    # what gets rounded: the big panel objects (cab, refuse body, hopper, tailgate, bumper, tanks, steps); not glass, lamps,
    # decals, wheels (their own rounded geometry) or tiny parts
    skip = re.compile(r'wheel|tire|tyre|hub|glass|wind|light|lamp|blinker|mirror|decal|sign|sticker|plate|number|logo|screen|wiper|dumpster|plane', re.I)
    n = 0
    for o in list(sc.objects):
        if o.type != 'MESH' or not o.visible_get() or skip.search(o.name): continue
        mn, mx = bounds(o); size = (mx - mn).length
        if size < 1.2 or len(o.data.polygons) < 6: continue   # small parts (cylinders, rams) keep their shape: bevels blew up their thin caps
        # bevel width in object space: about 1.6 cm on the real truck (the source is ~0.69 x real size), less on small parts
        sx = max(o.matrix_world.to_scale()) or 1.0
        w = (0.02 if size > 3 else min(0.011, size * 0.006)) / sx   # ~2.9 cm on the refuse body / cab, ~1.6 cm on smaller parts
        bpy.context.view_layer.objects.active = o
        for m in o.modifiers:
            if m.type == 'BEVEL': o.modifiers.remove(m)
        bv = o.modifiers.new('round', 'BEVEL')
        bv.width = w; bv.segments = 3; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(32)
        bv.use_clamp_overlap = True; bv.harden_normals = False
        wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = True; wn.weight = 50
        try: o.data.shade_smooth()
        except Exception:
            for p in o.data.polygons: p.use_smooth = True
        n += 1
        log('bevel', o.name, len(o.data.polygons), 'w', round(w * sx, 4))
    log('rounded objects', n)

for im in bpy.data.images:   # pack what exists (the converter samples textures); some sources reference missing files
    try:
        if im.source == 'FILE' and not im.packed_file and im.has_data: im.pack()
    except Exception as e: log('no pack', im.name)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True, relative_remap=True)
log('saved', OUT)
