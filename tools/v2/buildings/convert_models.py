# Blender: library building -> game GLB (joined per material, decimated, textures <= maxtex JPEG, origin at footprint center / ground)
import bpy, sys, os, re, mathutils, json
a = sys.argv[sys.argv.index('--')+1:]
src, out, target, maxtex = a[0], a[1], int(a[2]), int(a[3]); drop = re.compile(a[4]) if len(a) > 4 and a[4] else None
dropm = re.compile(a[5]) if len(a) > 5 and a[5] else None
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.endswith('.glb'): bpy.ops.import_scene.gltf(filepath=src)
else: bpy.ops.import_scene.fbx(filepath=src)
sc = bpy.context.scene
import bmesh
dg = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in sc.objects if o.type == 'MESH' and not (drop and drop.search(o.name))]
if len(a) > 6 and a[6]:  # drop stray objects whose center lies farther than R from the median object center
    Rmax = float(a[6]); cs = [o.matrix_world @ (sum((mathutils.Vector(v) for v in o.bound_box), mathutils.Vector()) / 8) for o in meshes]
    med = mathutils.Vector([sorted(c[i] for c in cs)[len(cs) // 2] for i in range(3)])
    meshes = [o for o, c in zip(meshes, cs) if (c - med).xy.length <= Rmax]
# heavy CAD models: decimate every object on its own first (collapse stalls on one huge joined mesh)
import bmesh as _bm
_tot = sum(len(o.data.polygons) for o in meshes)
if target > 0 and _tot > target * 1.5:
    for o in meshes:
        if len(o.data.polygons) < 1500: continue
        b_ = _bm.new(); b_.from_mesh(o.data); _bm.ops.remove_doubles(b_, verts=b_.verts, dist=0.01); b_.to_mesh(o.data); b_.free()
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        for _ in range(3):
            n_ = len(o.data.polygons); want = max(200, n_ * target / _tot)
            if n_ <= want * 1.3: break
            md = o.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.002, want / n_); bpy.ops.object.modifier_apply(modifier='d')
    print('PEROBJ', _tot, '->', sum(len(o.data.polygons) for o in meshes))
allm = []; mi = {}
bm = bmesh.new()
for o in meshes:
    me0 = o.data.copy()
    me0.transform(o.matrix_world)
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
    n0 = len(bm.faces)
    bm.from_mesh(me0)
    bm.faces.ensure_lookup_table()
    for fi in range(n0, len(bm.faces)):
        f = bm.faces[fi]; f.material_index = loc[min(f.material_index, len(loc) - 1)]
    bpy.data.meshes.remove(me0)
me = bpy.data.meshes.new('bld')
for m in allm: me.materials.append(m)
bm.to_mesh(me); bm.free()
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
ob = bpy.data.objects.new('bld', me); sc.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
# merge duplicate material slots that share the same base image (cuts draw calls)
def key(m):
    if not m or not m.use_nodes: return ('none', m.name if m else '')
    imgs = sorted(n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    col = tuple(round(x, 2) for x in bsdf.inputs['Base Color'].default_value) if bsdf else ()
    return (tuple(imgs), col if not imgs else ())
slots = [s.material for s in ob.material_slots]
first = {}; remap = []
for i, m in enumerate(slots):
    k = key(m); first.setdefault(k, i); remap.append(first[k])
for p in me.polygons: p.material_index = remap[p.material_index]
newmats = sorted(set(p.material_index for p in me.polygons))
if dropm:
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    bad = [f for f in bm.faces if me.materials[f.material_index] and dropm.search(me.materials[f.material_index].name)]
    bmesh.ops.delete(bm, geom=bad, context='FACES'); bm.to_mesh(me); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.012); bpy.ops.object.mode_set(mode='OBJECT')
tris = sum(len(p.vertices) - 2 for p in me.polygons)
if len(a) > 7 and a[7]:  # drop loose parts smaller than MINPART m (bolts, mullion bits): far LOD / heavy CAD models
    import bmesh
    minpart = float(a[7]); bm3 = bmesh.new(); bm3.from_mesh(me); bm3.faces.ensure_lookup_table(); seen = set(); kill = []
    for f0 in bm3.faces:
        if f0.index in seen: continue
        comp = []; stack = [f0]; seen.add(f0.index)
        while stack:
            f = stack.pop(); comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        vs = [v.co for f in comp for v in f.verts]
        d = (mathutils.Vector([max(v[i] for v in vs) for i in range(3)]) - mathutils.Vector([min(v[i] for v in vs) for i in range(3)])).length
        if d < minpart: kill.extend(comp)
    bmesh.ops.delete(bm3, geom=kill, context='FACES'); bm3.to_mesh(me); bm3.free(); print('MINPART removed faces', len(kill))
bb0 = [ob.matrix_world @ mathutils.Vector(v) for v in ob.bound_box]
lo0 = mathutils.Vector([min(v[i] for v in bb0) for i in range(3)]); hi0 = mathutils.Vector([max(v[i] for v in bb0) for i in range(3)])
if target > 0 and tris > target * 1.25:  # CAD meshes: merge coplanar triangles first (lossless look), then collapse
    md = ob.modifiers.new('pl', 'DECIMATE'); md.decimate_type = 'DISSOLVE'; md.angle_limit = 0.0087; md.delimit = {'MATERIAL', 'UV'}
    bpy.ops.object.modifier_apply(modifier='pl')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
for _ in range(10):  # collapse decimation stalls on fragmented CAD meshes: repeat until near the target
    t_ = sum(len(p.vertices) - 2 for p in me.polygons)
    if target <= 0 or t_ <= target * 1.25: break
    md = ob.modifiers.new('dec', 'DECIMATE'); md.ratio = max(0.002, target / t_); md.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
# collapse can fling vertices of degenerate faces far away: drop faces that leave the original bounds
import bmesh
pad = (hi0 - lo0) * 0.02
bm2 = bmesh.new(); bm2.from_mesh(me)
bad = [f for f in bm2.faces if any(any(v.co[i] < lo0[i] - pad[i] - 0.05 or v.co[i] > hi0[i] + pad[i] + 0.05 for i in range(3)) for v in f.verts)]
if bad: bmesh.ops.delete(bm2, geom=bad, context='FACES')
bm2.to_mesh(me); bm2.free(); print('STRAY faces removed', len(bad))
# origin: footprint center, ground at 0
bb = [ob.matrix_world @ mathutils.Vector(v) for v in ob.bound_box]
mn = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
off = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
me.transform(mathutils.Matrix.Translation(-off)); ob.location = (0, 0, 0)
# textures: downscale, JPEG
for im in bpy.data.images:
    if im.size[0] == 0: continue
    s = max(im.size[0], im.size[1])
    if s > maxtex: k = maxtex / s; im.scale(max(4, int(im.size[0] * k)), max(4, int(im.size[1] * k)))
tris2 = sum(len(p.vertices) - 2 for p in me.polygons)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_image_format='JPEG', export_jpeg_quality=82, export_apply=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_animations=False)
print('CONV', os.path.basename(out), 'tris', tris, '->', tris2, 'mats', len(newmats), 'dims', [round(mx[i] - mn[i], 2) for i in range(3)])
