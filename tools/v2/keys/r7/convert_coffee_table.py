# r7: the user's coffee table (Models/_Inbox/coffee-table.zip: source/Coffee table.zip -> Coffee table.FBX, textures JT_Diff / JT_Refl /
# JT_Bump) -> public/assets/models/keys/coffee_table.glb, meters, Y up, base at y = 0, centered. The user wants ONLY its height at ~55 %.
#   blender -b -Y --python-exit-code 1 --python convert_coffee_table.py -- <Coffee table.FBX> <tex dir> <out.glb> [heightK=0.55]
import bpy, sys, os, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
fbx, tex, out = a[0], a[1], a[2]; HK = float(a[3]) if len(a) > 3 else 0.55
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
if len(obs) > 1: bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
mn = mathutils.Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); mx = mathutils.Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
size = mx - mn; big = max(size.x, size.y)
k = 1.0 if big < 4 else 0.01 if big < 400 else 0.001          # to meters (FBX in cm or mm); a coffee table is ~1 m long
print('CONV raw size', tuple(round(v, 3) for v in size), 'scale', k)
# Blender Z is up: scale X/Y by k, Z (height) by k * HK; base to z = 0, centered on x / y
for v in o.data.vertices:
    p = v.co; v.co = mathutils.Vector(((p.x - (mn.x + mx.x) / 2) * k, (p.y - (mn.y + mx.y) / 2) * k, (p.z - mn.z) * k * HK))
o.data.update()
# one PBR material from the shipped maps: diffuse, roughness from the reflection map (inverted), bump as a bump node
m = bpy.data.materials.new('coffee_table'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
def img(name):
    for ext in ('.jpeg', '.jpg', '.png'):
        p = os.path.join(tex, name + ext)
        if os.path.exists(p): return bpy.data.images.load(p)
d = nt.nodes.new('ShaderNodeTexImage'); d.image = img('JT_Diff'); nt.links.new(d.outputs['Color'], bs.inputs['Base Color'])
r = img('JT_Refl')
if r:
    rn = nt.nodes.new('ShaderNodeTexImage'); rn.image = r; rn.image.colorspace_settings.name = 'Non-Color'
    inv = nt.nodes.new('ShaderNodeInvert'); nt.links.new(rn.outputs['Color'], inv.inputs['Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(inv.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs[1], bs.inputs['Roughness'])
bs.inputs['Metallic'].default_value = 0.0
o.data.materials.clear(); o.data.materials.append(m)
o.name = 'coffee_table'
s2 = o.dimensions; print('CONV out size (m, x / depth / height)', round(s2.x, 3), round(s2.y, 3), round(s2.z, 3), 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_yup=True, export_apply=True, export_image_format='JPEG')
print('CONV wrote', out)
