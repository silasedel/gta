# Traffic signal kit from the library's "Traffic Light 1 - Vintage Signal Poles" (pole SketchUp.004): kitbashed into
# separate instancing pieces, all in the MAST-ARM frame: pole axis at the origin, ground z = 0, arm along +X (Blender),
# signal faces toward Blender +Y (three.js -Z).  Output nodes (one GLB):
#   pole     pole + base + arm clamp            arm   truss mast arm (tip at x = ARM_TIP; scaled along X in game)
#   head     3-section 12" head with backplate + visors, origin at its hanger (head center x, y 0, arm height)
#   lens_r / lens_a / lens_g   the three lens discs of `head` (same origin)  -> lit by the game per signal phase
#   ped      pedestrian signal head + pole bracket, rotated about the pole axis so its face points Blender -Y... (see below)
#   ped_walk / ped_dont        WALK person / DONT WALK hand icons of `ped`
# Materials are baked into vertex colors (one material per piece; the CAD file has flat colors only).
#   blender -b --factory-startup -P signals.py -- <Traffic Light 1.blend> <out.glb> <info.json>
import bpy, bmesh, sys, math, json, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, info_out = argv[0], argv[1], argv[2]
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.name != 'SketchUp.004': bpy.data.objects.remove(o, do_unlink=True)
ob = sc.objects['SketchUp.004']
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data
# arm frame: pole axis (-9.41, -7.43), arm toward (-5.13, -8.2)
PX, PY = -9.41, -7.43
A = math.atan2(-8.2 - PY, -5.13 - PX)
me.transform(mathutils.Matrix.Rotation(-A, 4, 'Z') @ mathutils.Matrix.Translation((-PX, -PY, 0)))
# refine the pole axis: center of the main shaft vertices between z 1 and 5 using the MAST ARM material
mats = [m.name if m else '' for m in me.materials]
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
shaft = [v.co for f in bm.faces if mats[f.material_index] == 'MAST ARM' for v in f.verts if 0.6 < v.co.z < 6.8 and abs(v.co.x) < 0.2 and abs(v.co.y) < 0.2]
cx = sum(v.x for v in shaft) / len(shaft); cy = sum(v.y for v in shaft) / len(shaft)
bmesh.ops.translate(bm, verts=bm.verts, vec=(-cx, -cy, 0))
zmin = min(v.co.z for v in bm.verts); bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -zmin))
# connected components (loose parts)
bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
seen = set(); comps = []
for f in bm.faces:
    if f.index in seen: continue
    stack = [f]; seen.add(f.index); fs = []
    while stack:
        g = stack.pop(); fs.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen: seen.add(h.index); stack.append(h)
    vs = [v.co for g in fs for v in g.verts]
    mn = [min(v[i] for v in vs) for i in range(3)]; mx = [max(v[i] for v in vs) for i in range(3)]
    comps.append({'faces': [g.index for g in fs], 'mn': mn, 'mx': mx, 'c': [(mn[i] + mx[i]) / 2 for i in range(3)], 'mat': mats[fs[0].material_index]})
print('components', len(comps))
inbox = (lambda c, b: all(b[i] <= c['c'][i] <= b[i + 3] for i in range(3)))
PED_BOX = [-0.25, -0.7, 2.3, 0.5, 0.25, 3.25]
piece = {}
for c in comps:
    m = c['mat']; x, y, z = c['c']; r = math.hypot(x, y)
    k = None
    if x > 3.85 and z > 5.6 and m != 'MAST ARM':
        k = {'12 Inch RED': 'lens_r', '12 Inch AMBER': 'lens_a', '12 Inch GREEN': 'lens_g'}.get(m, 'head')
    elif m in ('MAST ARM', 'POST BOLTS'):
        k = 'pole' if r < 0.36 or (z < 1.0 and r < 0.6) else ('arm' if x > 0.2 and z > 4.8 else None)
    elif inbox(c, PED_BOX):
        k = {'WALK LENS': 'ped_walk', 'DONT WALK LENS': 'ped_dont'}.get(m, 'ped')
    if k: piece.setdefault(k, []).extend(c['faces'])
print({k: len(v) for k, v in piece.items()})
# per-piece meshes with baked vertex colors
def color_of(name):
    mm = bpy.data.materials.get(name)
    if not mm: return (0.5, 0.5, 0.5, 1)
    if mm.use_nodes:
        b = next((n for n in mm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b: return tuple(b.inputs['Base Color'].default_value)
    return tuple(mm.diffuse_color)
OVERRIDE = {'ALUMINUM SIGNAL': (0.62, 0.36, 0.015, 1), 'LFE VISOR': (0.62, 0.36, 0.015, 1), 'BRACKETS': (0.55, 0.32, 0.015, 1), 'Red': (0.03, 0.03, 0.03, 1), 'REFLECTOR BOWLS': (0.05, 0.05, 0.05, 1),
            '12 Inch RED': (0.25, 0.02, 0.01, 1), '12 Inch AMBER': (0.3, 0.12, 0.0, 1), '12 Inch GREEN': (0.02, 0.18, 0.12, 1), 'WALK LENS': (0.6, 0.6, 0.6, 1), 'DONT WALK LENS': (0.6, 0.25, 0.04, 1), 'MAST ARM': (0.11, 0.115, 0.12, 1), 'POST BOLTS': (0.08, 0.08, 0.08, 1)}
info = {}
pieces = []
for k, fl in piece.items():
    b2 = bm.copy(); b2.faces.ensure_lookup_table()
    keepf = set(fl)
    bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in keepf], context='FACES')
    nm = bpy.data.meshes.new(k); b2.to_mesh(nm); b2.free()
    for mm in me.materials: nm.materials.append(mm)  # keep the slots so the baked colors find their source material
    o = bpy.data.objects.new(k, nm); sc.collection.objects.link(o); pieces.append(o)
for o in pieces:
    nm = o.data
    ca = nm.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); nm.color_attributes.active_color = ca
    try: nm.color_attributes.render_color_index = nm.color_attributes.active_color_index
    except Exception: pass
    for p in nm.polygons:
        mname = nm.materials[p.material_index].name if nm.materials and nm.materials[p.material_index] else ''
        c = OVERRIDE.get(mname) or color_of(mname)
        for li in p.loop_indices: ca.data[li].color = c
    nm.materials.clear()
    mt = bpy.data.materials.new('sig_' + o.name); mt.use_nodes = True; bb = mt.node_tree.nodes.get('Principled BSDF')
    vc = mt.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; mt.node_tree.links.new(vc.outputs['Color'], bb.inputs['Base Color'])
    bb.inputs['Roughness'].default_value = 0.55; bb.inputs['Metallic'].default_value = 0.4
    nm.materials.append(mt)
bpy.data.objects.remove(ob, do_unlink=True)
P = {o.name: o for o in pieces}
def bbox(o):
    vs = [v.co for v in o.data.vertices]; return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]
# head: origin at its hanger point (head center x, y = 0, top of the hanger bracket = arm underside)
hmn, hmx = bbox(P['head']); hx = (hmn[0] + hmx[0]) / 2; amn, amx = bbox(P['arm']) if 'arm' in P else ([0, 0, 0], [0, 0, 0])
hz = hmx[2]
for k in ('head', 'lens_r', 'lens_a', 'lens_g'):
    if k in P: P[k].data.transform(mathutils.Matrix.Translation((-hx, 0, -hz)))
info['head'] = {'x': hx, 'top': hz, 'size': [hmx[i] - hmn[i] for i in range(3)], 'bottom': hmn[2] - hz}
info['arm'] = {'tip': amx[0], 'zmin': amn[2], 'zmax': amx[2]}
pmn, pmx = bbox(P['pole']); info['pole'] = {'h': pmx[2], 'r': max(pmx[0], -pmn[0], pmx[1], -pmn[1])}
# lens centers (for the night glow sprites / audit)
for k in ('lens_r', 'lens_a', 'lens_g'):
    if k in P: mn, mx = bbox(P[k]); info[k] = [(mn[i] + mx[i]) / 2 for i in range(3)]
# ped head: rotate about the pole axis so the icons face Blender +Y (same as the vehicle heads); origin stays on the pole axis
if 'ped_walk' in P:
    nrm = mathutils.Vector((0, 0, 0))
    for p in P['ped_walk'].data.polygons: nrm += p.normal * p.area
    for p in P['ped_dont'].data.polygons: nrm += p.normal * p.area
    ang = math.atan2(nrm.y, nrm.x); R = mathutils.Matrix.Rotation(math.pi / 2 - ang, 4, 'Z')
    for k in ('ped', 'ped_walk', 'ped_dont'): P[k].data.transform(R)
    mn, mx = bbox(P['ped']); info['ped'] = {'mn': mn, 'mx': mx}
    for k in ('ped_walk', 'ped_dont'): mn, mx = bbox(P[k]); info[k] = [(mn[i] + mx[i]) / 2 for i in range(3)]
# decimate the heavy pieces
TGT = {'head': 3200, 'ped': 1600, 'pole': 900, 'arm': 700}
for k, t in TGT.items():
    o = P.get(k)
    if not o: continue
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    bpy.context.view_layer.objects.active = o
    bm3 = bmesh.new(); bm3.from_mesh(o.data); bmesh.ops.remove_doubles(bm3, verts=bm3.verts, dist=0.0004); bm3.to_mesh(o.data); bm3.free()
    if n > t:
        m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = t / n; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    info.setdefault('tris', {})[k] = [n, sum(len(p.vertices) - 2 for p in o.data.polygons)]
bm.free()
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True, export_materials='EXPORT', export_yup=True, export_vertex_color='ACTIVE')
json.dump(info, open(info_out, 'w'), indent=1)
print('SIGNALS', json.dumps(info))
