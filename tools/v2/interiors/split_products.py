# Split a library product pack into one small GLB per product (for src/world/interiors/items/modelProducts.js).
#   Blender -b <pack.blend> -P tools/v2/interiors/split_products.py -- <spec.json>
# spec: { "out": folder, "maxtex": 512, "items": { "<object name regex>": { "id": "...", "h": meters (height after scaling, z up) } } }
# Each product: own mesh, applied transforms, base at z 0, centered in x/y, front toward Blender -Y (three.js +Z), images
# downscaled to maxtex and packed into the GLB.
import bpy, sys, json, re, os, mathutils
S = json.load(open(sys.argv[sys.argv.index('--') + 1])); os.makedirs(S['out'], exist_ok=True); mt = S.get('maxtex', 512)
for img in bpy.data.images:
    if img.size[0] > mt or img.size[1] > mt:
        k = mt / max(img.size); img.scale(max(4, int(img.size[0] * k)), max(4, int(img.size[1] * k)))
objs = [o for o in bpy.data.objects if o.type == 'MESH']; packed = []
for rx, it in S['items'].items():
    hits = [o for o in objs if re.fullmatch(rx, o.name)]
    if not hits: print('MISS', rx); continue
    o = hits[0]; bpy.ops.object.select_all(action='DESELECT')
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c); c.parent = None; c.matrix_world = o.matrix_world.copy()
    bpy.context.view_layer.objects.active = c; c.select_set(True); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if it.get('rotx'): c.data.transform(mathutils.Matrix.Rotation(it['rotx'] * 3.14159265 / 180, 4, 'X'))
    bb = [mathutils.Vector(v.co) for v in c.data.vertices]; mn = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
    s = it['h'] / max(1e-6, (mx.z - mn.z)); ctr = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for v in c.data.vertices: v.co = (v.co - ctr) * s
    if it.get('rotz'): c.rotation_euler = (0, 0, it['rotz'] * 3.14159265 / 180); bpy.ops.object.transform_apply(rotation=True)
    tex = it.get('tex') or S.get('tex')
    if tex:  # library packs often ship their albedo unlinked: one textured material for the whole product
        path = os.path.join(S['texdir'], tex); im = bpy.data.images.load(path, check_existing=True)
        if im.size[0] > mt or im.size[1] > mt: k = mt / max(im.size); im.scale(max(4, int(im.size[0] * k)), max(4, int(im.size[1] * k)))
        m = bpy.data.materials.new(it['id']); m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF'); t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = im; m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.5
        c.data.materials.clear(); c.data.materials.append(m)
    if S.get('pack'): c.name = it['id']; c.location.x = len(packed) * 0.5; packed.append(c); print('PRODUCT', it['id'], [round((mx[i] - mn[i]) * s, 3) for i in range(3)]); continue
    out = os.path.join(S['out'], it['id'] + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_image_format='JPEG', export_jpeg_quality=88)
    print('PRODUCT', it['id'], [round((mx[i] - mn[i]) * s, 3) for i in range(3)], os.path.getsize(out))
    bpy.data.objects.remove(c, do_unlink=True)
if packed:  # one GLB for the whole pack (shared texture): each product is a named node
    bpy.ops.object.select_all(action='DESELECT')
    for c in packed: c.select_set(True)
    out = os.path.join(S['out'], S['pack'] + '.glb'); bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_image_format='JPEG', export_jpeg_quality=88); print('PACK', out, os.path.getsize(out))
