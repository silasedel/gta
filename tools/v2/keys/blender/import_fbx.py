# Blender (track: keys): import one of the user's FBX models into an empty scene and wire its loose texture maps, then hand
# over to convert_dock.py (same args after '--', plus env FBX=<file.fbx> TEX=<texture folder> [INSPECT=1] [KEEPMETAL=1]).
#   blender -b -Y --factory-startup --python-exit-code 1 --python import_fbx.py -- out.glb SCALE MAXTEX [PIECES] [DROP] [MAXTRIS] [ORIGIN]
# Maps are matched by name: *basecolor*/*albedo*/*diffuse* (sRGB), *rough*, *normal*, *metal* (non-color); AO / ground-AO maps are ignored.
import bpy, os, re, sys
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.fbx(filepath=os.environ['FBX'])
TEX = os.environ.get('TEX')
files = sorted(os.listdir(TEX)) if TEX and os.path.isdir(TEX) else []
def pick(rx, mname=''):
    ok = [f for f in files if re.search(rx, f, re.I) and not re.search(r'ground|_ao\b|ao\.', f, re.I)]
    own = [f for f in ok if mname and f.lower().startswith(mname.lower())]   # per-material maps (Cooler1_albedo, Cooler2_albedo)
    if own or ok: return os.path.join(TEX, (own or ok)[0])
    imgs = [f for f in files if re.search(r'\.(jpe?g|png)$', f, re.I)]
    if rx.startswith('base') and len(imgs) == 1: return os.path.join(TEX, imgs[0])   # a single loose image is the color map
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for n in [x for x in nt.nodes if x.type in ('TEX_IMAGE', 'NORMAL_MAP')]: nt.nodes.remove(n)
    def img(f, color):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(f); t.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; return t
    c, r, nm, mt = pick(r'base.?color|albedo|diffuse', m.name), pick(r'rough', m.name), pick(r'normal', m.name), pick(r'metal', m.name)
    if c: nt.links.new(img(c, True).outputs['Color'], bsdf.inputs['Base Color'])
    if r: nt.links.new(img(r, False).outputs['Color'], bsdf.inputs['Roughness'])
    if nm: q = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(img(nm, False).outputs['Color'], q.inputs['Color']); nt.links.new(q.outputs['Normal'], bsdf.inputs['Normal'])
    if mt and os.environ.get('KEEPMETAL'): nt.links.new(img(mt, False).outputs['Color'], bsdf.inputs['Metallic'])
    print('FBXWIRE', m.name, bool(c), bool(r), bool(nm), bool(mt))
if os.environ.get('INSPECT'):
    import mathutils
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [round(min(v[i] for v in vs), 3) for i in range(3)]; hi = [round(max(v[i] for v in vs), 3) for i in range(3)]
        print('OBJ', o.name, len(o.data.polygons), lo, hi, [s.material.name if s.material else None for s in o.material_slots])
    sys.exit(0)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'convert_dock.py')).read())
