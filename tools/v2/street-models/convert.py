# Library street-furniture model -> game GLB (public/assets/models/street/). Blender 5.x headless. See build.sh.
#   blender -b --factory-startup -P convert.py -- '<json spec>'
# spec: src (.blend/.fbx/.glb, absolute), out (.glb), height (m, 0 = keep size), scale (extra), tris (decimate target, 0 = none),
#   maxtex (px), keep (regex on object names), box [x0,y0,z0,x1,y1,z1] (keep objects whose bbox center lies inside, source
#   units after scale_length), rotz (deg, so the FRONT of the model faces Blender -Y = three.js +Z), tex {color, normal,
#   rough, metal} (file names in the asset's textures folder, linked to every material without an image; "auto" = guess),
#   tint [r,g,b] (multiplies base color), center 'base' (default: x/y bbox center, z min -> 0) | 'none',
#   rough / metal overrides, flatten true (one material: bake the material colors into vertex colors, for untextured CAD).
# Prints CONVERTED <out> tris <n> size <x y z> mats <list>.
import bpy, sys, os, re, json, math, mathutils, glob
argv = sys.argv[sys.argv.index('--') + 1:]
S = json.loads(argv[0])
src = S['src']; out = S['out']
if src.endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
    else: bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
folder = os.path.dirname(src)
texdir = os.path.join(folder, 'textures') if os.path.isdir(os.path.join(folder, 'textures')) else folder
dg = bpy.context.evaluated_depsgraph_get()
box = S.get('box'); keep = S.get('keep'); drop = S.get('drop')
objs = []
for o in [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]:
    if keep and not re.search(keep, o.name): continue
    if drop and re.search(drop, o.name): continue
    if box:
        bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]; c = sum(bb, mathutils.Vector()) / 8
        if not all(box[i] <= c[i] <= box[i + 3] for i in range(3)): continue
    e = o.evaluated_get(dg); me = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=True, depsgraph=dg); me.transform(o.matrix_world)
    n = bpy.data.objects.new(o.name + '_w', me); sc.collection.objects.link(n); objs.append(n)
for o in list(sc.objects):
    if o not in objs: bpy.data.objects.remove(o, do_unlink=True)
if not objs: print('CONVERT-ERROR nothing selected', src); sys.exit(0)
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; me = ob.data
# texture hookup for materials that lost their image links
def img(name):
    p = os.path.join(texdir, name)
    if not os.path.exists(p): p = os.path.join(folder, name)
    if not os.path.exists(p): return None
    return bpy.data.images.load(p, check_existing=True)
def guess(kind):
    pats = {'color': r'(color|albedo|diffuse|base)', 'normal': r'normal', 'rough': r'rough', 'metal': r'metal'}[kind]
    fs = [f for f in sorted(os.listdir(texdir)) if re.search(pats, f, re.I) and re.search(r'\.(png|jpe?g)$', f, re.I) and not re.search(r'(shadow|dirty|mask)', f, re.I)]
    if kind == 'color': fs = [f for f in fs if not re.search(r'(normal|rough|metal)', f, re.I)]
    return fs[0] if fs else None
T = S.get('tex')
if T and not any(me.materials):
    nm = bpy.data.materials.new('Body'); nm.use_nodes = True; me.materials.clear(); me.materials.append(nm)
for m in me.materials:
    if not m or not m.use_nodes: continue
    nt = m.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: continue
    if T and (S.get('texForce') or not any(l.from_node.type == 'TEX_IMAGE' for l in b.inputs['Base Color'].links)):
        tf = {k: (guess(k) if v == 'auto' else v) for k, v in T.items()}
        if tf.get('color') and img(tf['color']):
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(tf['color']); nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Base Color'].default_value = (1, 1, 1, 1)
        if tf.get('normal') and img(tf['normal']):
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(tf['normal']); t.image.colorspace_settings.name = 'Non-Color'
            nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        if tf.get('rough') and img(tf['rough']):
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(tf['rough']); t.image.colorspace_settings.name = 'Non-Color'; nt.links.new(t.outputs['Color'], b.inputs['Roughness'])
        if tf.get('metal') and img(tf['metal']):
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(tf['metal']); t.image.colorspace_settings.name = 'Non-Color'; nt.links.new(t.outputs['Color'], b.inputs['Metallic'])
        print('TEX', m.name, tf)
    if 'rough' in S and not b.inputs['Roughness'].links: b.inputs['Roughness'].default_value = S['rough']
    if 'metal' in S and not b.inputs['Metallic'].links: b.inputs['Metallic'].default_value = S['metal']
    if 'tint' in S:
        c = b.inputs['Base Color'].default_value; t = S['tint']; b.inputs['Base Color'].default_value = (c[0] * t[0], c[1] * t[1], c[2] * t[2], 1)
# clip: drop faces with a vertex below a source-coordinate plane (e.g. one arm of a twin lamp): {"axis": 1, "min": -6.75}
if S.get('dropmat'): # drop faces whose material name matches (scene ground pieces caught by the box)
    import bmesh
    mn_ = [m.name if m else '' for m in me.materials]; bmd = bmesh.new(); bmd.from_mesh(me)
    bmesh.ops.delete(bmd, geom=[f for f in bmd.faces if re.search(S['dropmat'], mn_[f.material_index] if f.material_index < len(mn_) else '')], context='FACES'); bmd.to_mesh(me); bmd.free()
if S.get('clip'):
    import bmesh
    bmc = bmesh.new(); bmc.from_mesh(me); ax, lo = S['clip']['axis'], S['clip']['min']; print('CLIP range', min(v.co[ax] for v in bmc.verts), max(v.co[ax] for v in bmc.verts), len(bmc.faces))
    bmesh.ops.delete(bmc, geom=[f for f in bmc.faces if any(v.co[ax] < lo for v in f.verts)], context='FACES'); bmc.to_mesh(me); bmc.free()
if S.get('clipz') is not None: # keep only faces fully above a source height; the origin stays at the source ground (z 0)
    import bmesh
    bmz = bmesh.new(); bmz.from_mesh(me); bmesh.ops.delete(bmz, geom=[f for f in bmz.faces if any(v.co.z < S['clipz'] for v in f.verts)], context='FACES'); bmz.to_mesh(me); bmz.free()
    me.vertices.add(1); me.vertices[-1].co = (sum(v.co.x for v in me.vertices) / len(me.vertices), sum(v.co.y for v in me.vertices) / len(me.vertices), 0.0)  # keeps z-min at the ground
# orientation + scale + origin
if S.get('rotz'):
    R = mathutils.Matrix.Rotation(math.radians(S['rotz']), 4, 'Z'); me.transform(R)
if S.get('rotx'):
    R = mathutils.Matrix.Rotation(math.radians(S['rotx']), 4, 'X'); me.transform(R)
vs = [v.co for v in me.vertices]
mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
H = S.get('height', 0); s = (H / (mx.z - mn.z) if H else 1.0) * S.get('scale', 1.0)
if S.get('center', 'base') == 'base':
    if S.get('pivot'): cx, cy = S['pivot']
    else: cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    T4 = mathutils.Matrix.Scale(s, 4) @ mathutils.Matrix.Translation((-cx, -cy, -mn.z))
else: T4 = mathutils.Matrix.Scale(s, 4)
me.transform(T4)
ntri = lambda: sum(len(p.vertices) - 2 for p in me.polygons)
tris = ntri()
# merge duplicate vertices (CAD exports), then decimate to the target
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
if S.get('tris') and ntri() > S['tris']:
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = S['tris'] / ntri(); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
if S.get('flatten'): # one vertex-colored material from the material base colors (untextured CAD parts)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = ca
    for p in me.polygons:
        mm = me.materials[p.material_index] if me.materials else None; c = (0.8, 0.8, 0.8, 1)
        if mm and mm.use_nodes:
            bb = next((n for n in mm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bb: c = tuple(bb.inputs['Base Color'].default_value)
        elif mm: c = tuple(mm.diffuse_color)
        for li in p.loop_indices: ca.data[li].color = c
    nm = bpy.data.materials.new('flat'); nm.use_nodes = True; bb = nm.node_tree.nodes.get('Principled BSDF')
    vc = nm.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nm.node_tree.links.new(vc.outputs['Color'], bb.inputs['Base Color'])
    bb.inputs['Roughness'].default_value = S.get('rough', 0.6); bb.inputs['Metallic'].default_value = S.get('metal', 0.3)
    me.materials.clear(); me.materials.append(nm)
# texture budget
mt = S.get('maxtex', 1024)
for im in bpy.data.images:
    w, h = im.size[0], im.size[1]
    if not w: continue
    f = min(1.0, mt / max(w, h))
    if f < 1: im.scale(max(4, int(w * f)), max(4, int(h * f)))
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
try: bpy.ops.object.material_slot_remove_unused()
except Exception as e: print('note: slot cleanup skipped')
vs = [v.co for v in me.vertices]
size = [round(max(v[i] for v in vs) - min(v[i] for v in vs), 3) for i in range(3)]
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True, export_image_format='JPEG' if S.get('jpeg', True) else 'AUTO',
    export_jpeg_quality=88, export_materials='EXPORT', export_yup=True, export_vertex_color='ACTIVE' if S.get('flatten') else 'NONE')
print('CONVERTED', out, 'tris', tris, '->', ntri(), 'size', size, 'scale', round(s, 4), 'mats', [m.name for m in me.materials])
