# Blender: library building / airport model -> game GLB (+ a decimated far LOD), driven by a JSON spec (models.json).
#   blender -b -Y --python-exit-code 1 --python convert_v2.py -- <spec.json> <name> <out_dir>
# Spec fields (all optional except src):
#   src        file under Models/ (glb or fbx; never .blend: no scripts run)
#   tris       LOD0 triangle target (0 = keep)          lod1     LOD1 triangle target (0 = no LOD1 file)
#   tex        LOD0 max texture size (default 1024)     tex1     LOD1 max texture size (default 256)
#   drop       regex: objects to leave out              keep     regex: only these objects
#   dropm      regex: faces with these materials go     cutz     drop faces that lie entirely below this z (source units, Z up)
#   scale      multiplier to meters                     rot      degrees about Z so the FRONT faces Blender -Y (= glTF +Z)
#   minpart    drop loose parts smaller than this (m, after scale)
#   rmax       drop objects whose center is farther than this from the median center (source units)
# Output: origin at the footprint center, ground (lowest remaining vertex, or `ground` z in source units) at y = 0.
import bpy, sys, os, re, json, math, mathutils, bmesh
a = sys.argv[sys.argv.index('--') + 1:]
spec = json.load(open(a[0]))[a[1]]; name = a[1]; outd = a[2]
ROOT = os.path.join(os.path.dirname(os.path.abspath(a[0])), '..', '..', '..', 'Models')
src = os.path.join(ROOT, spec['src']) if spec.get('src') else os.path.join(os.path.dirname(os.path.abspath(a[0])), '..', '..', '..', spec['path'])
rx = lambda k: re.compile(spec[k], re.I) if spec.get(k) else None
drop, keep, dropm = rx('drop'), rx('keep'), rx('dropm')
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.glb'): bpy.ops.import_scene.gltf(filepath=src)
else: bpy.ops.import_scene.fbx(filepath=src)
sc = bpy.context.scene
def tris_of(me): return sum(len(p.vertices) - 2 for p in me.polygons)
meshes = [o for o in sc.objects if o.type == 'MESH' and not (drop and drop.search(o.name)) and not (keep and not keep.search(o.name))]
if spec.get('rmax'):
    R = spec['rmax']; cs = [o.matrix_world @ (sum((mathutils.Vector(v) for v in o.bound_box), mathutils.Vector()) / 8) for o in meshes]
    med = mathutils.Vector([sorted(c[i] for c in cs)[len(cs) // 2] for i in range(3)])
    meshes = [o for o, c in zip(meshes, cs) if (c - med).xy.length <= R]
target = int(spec.get('tris', 0))
tot = sum(tris_of(o.data) for o in meshes)
if target > 0 and tot > target * 1.5:  # heavy models: decimate each object first (collapse stalls on one huge joined mesh)
    for o in meshes:
        n_ = tris_of(o.data)
        if n_ < 1500: continue
        if o.data.users > 1: o.data = o.data.copy()
        b_ = bmesh.new(); b_.from_mesh(o.data); bmesh.ops.remove_doubles(b_, verts=b_.verts, dist=0.002); b_.to_mesh(o.data); b_.free()
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        want = max(300, n_ * target / tot)
        if n_ > want * 1.3:
            md = o.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.003, want / n_); bpy.ops.object.modifier_apply(modifier='d')
    print('PEROBJ', tot, '->', sum(tris_of(o.data) for o in meshes))
# join into one mesh, one slot per distinct material
allm, mi = [], {}
bm = bmesh.new()
for o in meshes:
    me0 = o.data.copy(); me0.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me0.flip_normals()
    while len(me0.uv_layers) > 1: me0.uv_layers.remove(me0.uv_layers[-1])
    if len(me0.uv_layers) == 0: me0.uv_layers.new(name='UVMap')
    me0.uv_layers[0].name = 'UVMap'
    loc = []
    for s_ in o.material_slots:
        m = s_.material
        if m not in mi: mi[m] = len(allm); allm.append(m)
        loc.append(mi[m])
    if not loc:
        if None not in mi: mi[None] = len(allm); allm.append(None)
        loc = [mi[None]]
    n0 = len(bm.faces); bm.from_mesh(me0); bm.faces.ensure_lookup_table()
    for fi in range(n0, len(bm.faces)):
        f = bm.faces[fi]; f.material_index = loc[min(f.material_index, len(loc) - 1)]
    bpy.data.meshes.remove(me0)
me = bpy.data.meshes.new(name)
for m in allm: me.materials.append(m)
bm.to_mesh(me); bm.free()
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
# merge material slots that share the same base images / flat color (fewer draw calls)
def mkey(m):
    if not m or not m.use_nodes: return ('none', m.name if m else '')
    imgs = sorted(n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    col = tuple(round(x, 2) for x in bsdf.inputs['Base Color'].default_value) if bsdf else ()
    return (tuple(imgs), col if not imgs else (), m.blend_method if hasattr(m, 'blend_method') else '')
first, remap = {}, []
for i, s in enumerate(ob.material_slots): k = mkey(s.material); first.setdefault(k, i); remap.append(first[k])
for p in me.polygons: p.material_index = remap[p.material_index]
bm = bmesh.new(); bm.from_mesh(me); bad = []
cutz = spec.get('cutz')
for f in bm.faces:
    m = me.materials[f.material_index] if f.material_index < len(me.materials) else None
    if dropm and m and dropm.search(m.name): bad.append(f); continue
    if cutz is not None and all(v.co.z < cutz for v in f.verts): bad.append(f)
if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
if float(spec.get('weld', 0.001)) > 0: bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=float(spec.get('weld', 0.001)))  # weld 0: keep split verts (collapse stalls on some welded CAD meshes)
bm.to_mesh(me); bm.free()
# scale / rotate into meters, front toward -Y
S = float(spec.get('scale', 1)); rz = math.radians(float(spec.get('rot', 0)))
me.transform(mathutils.Matrix.Rotation(rz, 4, 'Z') @ mathutils.Matrix.Scale(S, 4))
if spec.get('minpart'):
    mp = float(spec['minpart']); b3 = bmesh.new(); b3.from_mesh(me); b3.faces.ensure_lookup_table(); seen = set(); kill = []
    for f0 in b3.faces:
        if f0.index in seen: continue
        comp = []; st = [f0]; seen.add(f0.index)
        while st:
            f = st.pop(); comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); st.append(g)
        vs = [v.co for f in comp for v in f.verts]
        d = (mathutils.Vector([max(v[i] for v in vs) for i in range(3)]) - mathutils.Vector([min(v[i] for v in vs) for i in range(3)])).length
        if d < mp: kill.extend(comp)
    bmesh.ops.delete(b3, geom=kill, context='FACES'); b3.to_mesh(me); b3.free(); print('MINPART faces', len(kill))
def bounds():
    vs = [v.co for v in me.vertices]
    return mathutils.Vector([min(v[i] for v in vs) for i in range(3)]), mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
lo0, hi0 = bounds()
def decimate(tgt):
    t = tris_of(me)
    if tgt <= 0 or t <= tgt * 1.25: return
    md = ob.modifiers.new('pl', 'DECIMATE'); md.decimate_type = 'DISSOLVE'; md.angle_limit = 0.0087; md.delimit = {'MATERIAL', 'UV'}
    bpy.ops.object.modifier_apply(modifier='pl')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
    for _ in range(10):
        t = tris_of(me)
        if t <= tgt * 1.25: break
        md = ob.modifiers.new("dec", "DECIMATE"); md.ratio = max(0.003, tgt / t); md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    # collapse can fling vertices of degenerate faces: drop faces that leave the original bounds
    pad = (hi0 - lo0) * 0.02; b2 = bmesh.new(); b2.from_mesh(me)
    badf = [f for f in b2.faces if any(any(v.co[i] < lo0[i] - pad[i] - 0.05 or v.co[i] > hi0[i] + pad[i] + 0.05 for i in range(3)) for v in f.verts)]
    if badf: bmesh.ops.delete(b2, geom=badf, context='FACES')
    b2.to_mesh(me); b2.free()
t_in = tris_of(me)
decimate(target)
lo, hi = bounds()
gz = lo.z if spec.get('ground') is None else float(spec['ground']) * S
off = mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, gz))
me.transform(mathutils.Matrix.Translation(-off))
me.validate(); me.update()
def fix_images():
    for im in list(bpy.data.images):
        if im.size[0] == 0 or (not im.is_float and im.channels in (3, 4) and im.depth in (24, 32)): continue
        w, h = im.size; px = list(im.pixels[:])
        if im.channels != 4:
            c = im.channels; q = []
            for i in range(w * h):
                v = px[i * c:(i + 1) * c]; q += (v * 3)[:3] + [1.0] if c < 3 else v[:3] + [1.0]
            px = q
        n2 = bpy.data.images.new(im.name + '_8', w, h, alpha=True); n2.pixels = px
        n2.colorspace_settings.name = im.colorspace_settings.name if im.colorspace_settings.name in ('sRGB', 'Non-Color') else 'sRGB'
        im.user_remap(n2); n2.pack()
fix_images()
def textures(mx):
    for im in bpy.data.images:
        if im.size[0] == 0: continue
        s = max(im.size[0], im.size[1])
        if s > mx: k = mx / s; im.scale(max(4, int(im.size[0] * k)), max(4, int(im.size[1] * k)))
def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_image_format='WEBP', export_image_quality=82,
                              export_apply=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_animations=False)
textures(int(spec.get('tex', 1024)))
lo, hi = bounds()
os.makedirs(outd, exist_ok=True)
if not spec.get('colonly'): export(os.path.join(outd, name + '.glb'))
info = {'name': name, 'tris_in': t_in, 'tris': tris_of(me), 'mats': len(set(p.material_index for p in me.polygons)), 'dims': [round(hi[i] - lo[i], 2) for i in range(3)], 'zmin': round(lo.z, 2)}
if spec.get('lod1'):
    if spec.get('minpart1'):
        mp = float(spec['minpart1']); b3 = bmesh.new(); b3.from_mesh(me); b3.faces.ensure_lookup_table(); seen = set(); kill = []
        for f0 in b3.faces:
            if f0.index in seen: continue
            comp = []; st = [f0]; seen.add(f0.index)
            while st:
                f = st.pop(); comp.append(f)
                for e in f.edges:
                    for g in e.link_faces:
                        if g.index not in seen: seen.add(g.index); st.append(g)
            vs = [v.co for f in comp for v in f.verts]
            d = (mathutils.Vector([max(v[i] for v in vs) for i in range(3)]) - mathutils.Vector([min(v[i] for v in vs) for i in range(3)])).length
            if d < mp: kill.extend(comp)
        bmesh.ops.delete(b3, geom=kill, context='FACES'); b3.to_mesh(me); b3.free()
    lo0, hi0 = bounds(); decimate(int(spec['lod1'])); textures(int(spec.get('tex1', 256)))
    export(os.path.join(outd, name + '_lod1.glb')); info['lod1'] = tris_of(me)
# collision mesh: same shape (walls, steps, porches, overhangs), small parts and materials gone, positions only
if spec.get('col', 2500):
    lo0, hi0 = bounds(); decimate(int(spec.get('col', 2500)))
    for i in range(len(me.materials)): me.materials[i] = None
    bpy.ops.export_scene.gltf(filepath=os.path.join(outd, name + '_col.glb'), export_format='GLB', use_selection=False, export_materials='NONE',
                              export_texcoords=False, export_normals=False, export_apply=True, export_yup=True, export_animations=False)
    info['col'] = tris_of(me)
print('CONV ' + json.dumps(info))
