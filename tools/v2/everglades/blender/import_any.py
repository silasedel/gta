# Everglades r7b copy of tools/v2/keys/blender/import_fbx.py: meshes without any material get one (OBJ / FBX downloads that
# ship loose maps but no material slot), so the maps can be wired. Original header:
# Blender (track: keys): import one of the user's FBX models into an empty scene and wire its loose texture maps, then hand
# over to convert_dock.py (same args after '--', plus env FBX=<file.fbx> TEX=<texture folder> [INSPECT=1] [KEEPMETAL=1]).
#   blender -b -Y --factory-startup --python-exit-code 1 --python import_fbx.py -- out.glb SCALE MAXTEX [PIECES] [DROP] [MAXTRIS] [ORIGIN]
# Maps are matched by name: *basecolor*/*albedo*/*diffuse* (sRGB), *rough*, *normal*, *metal* (non-color); AO / ground-AO maps are ignored.
import bpy, os, re, sys
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
SRC = os.environ['FBX']   # .fbx, .obj or .glb (Maya .ma / .mel files next to an .obj are never touched)
if SRC.lower().endswith('.obj'): bpy.ops.wm.obj_import(filepath=SRC)
elif SRC.lower().endswith(('.glb', '.gltf')): bpy.ops.import_scene.gltf(filepath=SRC)
else: bpy.ops.import_scene.fbx(filepath=SRC)
if os.environ.get('DROPBIG'):   # drop huge faces (a ground / backdrop plane shipped inside the model's mesh), in source units^2
    import bmesh
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        bm = bmesh.new(); bm.from_mesh(o.data); big = [f for f in bm.faces if f.calc_area() > float(os.environ['DROPBIG'])]
        bmesh.ops.delete(bm, geom=list({v for f in big for v in f.verts}), context='VERTS'); bm.to_mesh(o.data); bm.free(); print('DROPPED', o.name, len(big))
for o in [x for x in bpy.data.objects if x.type == 'MESH']:
    if not any(sl.material for sl in o.material_slots):
        m = bpy.data.materials.get('Surface') or bpy.data.materials.new('Surface'); m.use_nodes = True
        if o.data.materials: o.data.materials[0] = m
        else: o.data.materials.append(m)
TEX = os.environ.get('TEX')
files = sorted(os.listdir(TEX)) if TEX and os.path.isdir(TEX) else []
def pick(rx, mname=''):
    ok = [f for f in files if re.search(rx, f, re.I) and not re.search(r'ground|_ao\b|ao\.', f, re.I)]
    own = [f for f in ok if mname and f.lower().startswith(mname.lower())]   # per-material maps (Cooler1_albedo, Cooler2_albedo)
    if own or ok: return os.path.join(TEX, (own or ok)[0])
    imgs = [f for f in files if re.search(r'\.(jpe?g|png)$', f, re.I)]
    if rx.startswith('base') and len(imgs) == 1: return os.path.join(TEX, imgs[0])   # a single loose image is the color map
    if rx.startswith('base') and mname:   # a map named after the material with no kind keyword ('Wicker chair.png') is its color map
        key = re.sub(r'[^a-z0-9]', '', mname.lower())
        named = [f for f in imgs if re.sub(r'[^a-z0-9]', '', os.path.splitext(f)[0].lower()) == key]
        if named: return os.path.join(TEX, named[0])
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for nm_, v in (('Transmission Weight', 0.0), ('Transmission', 0.0), ('Specular IOR Level', 0.5), ('Specular', 0.5), ('Coat Weight', 0.0)):   # Arnold / Maya imports come in as glass
        if nm_ in bsdf.inputs and not bsdf.inputs[nm_].links: bsdf.inputs[nm_].default_value = v
    if not files: continue   # no loose maps: keep the file's own (embedded) textures
    for n in [x for x in nt.nodes if x.type in ('TEX_IMAGE', 'NORMAL_MAP')]: nt.nodes.remove(n)
    def img(f, color):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(f); t.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; return t
    c, r, nm, mt = pick(r'base.?color|albedo|diffuse|_d\.', m.name), pick(r'rough|_r\.', m.name), pick(r'normal|_n\.', m.name), pick(r'metal|_mt\.', m.name)
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
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'keys', 'blender', 'convert_dock.py')).read())
