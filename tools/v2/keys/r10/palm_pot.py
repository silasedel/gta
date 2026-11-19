# usage: blender -b -Y --python-exit-code 1 --python tools/v2/keys/r10/palm_pot.py -- "<abs>/Models/Plant Pots/Plant Pot 1 - Four Potted Palms/Plant Pot 1.fbx" public/assets/models/keys/plants
# user's "Plant Pot 1 - Four Potted Palms" -> two game GLBs (large / small potted palm), meters, Y up, base at 0, centered, 2 materials
import bpy, sys, os, mathutils
a = sys.argv[sys.argv.index('--') + 1:]; src, outdir = a[0], a[1]; tex = os.path.join(os.path.dirname(src), 'textures')
def img(name, size, alpha=None):
    im = bpy.data.images.load(os.path.join(tex, name)); im.scale(size, size)
    if alpha:
        al = bpy.data.images.load(os.path.join(tex, alpha)); al.scale(size, size)
        px = list(im.pixels); ap = list(al.pixels)
        for i in range(0, len(px), 4): px[i + 3] = ap[i]
        im.pixels[:] = px
    im.pack(); return im
def mat(nm, col, nor, rough, alpha=False):
    m = bpy.data.materials.new(nm); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = col; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha: nt.links.new(t.outputs['Alpha'], b.inputs['Alpha']); m.blend_method = 'CLIP'
    if nor: n = nt.nodes.new('ShaderNodeTexImage'); n.image = nor; n.image.colorspace_settings.name = 'Non-Color'; nm2 = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm2.inputs['Color']); nt.links.new(nm2.outputs['Normal'], b.inputs['Normal'])
    if rough: rr = nt.nodes.new('ShaderNodeTexImage'); rr.image = rough; rr.image.colorspace_settings.name = 'Non-Color'; nt.links.new(rr.outputs['Color'], b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = 0
    return m
for tag, keep in (('large', ('flower_pot_2', '02_3')), ('small', ('flower_pot_3', '02_4'))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or o.name not in keep: bpy.data.objects.remove(o, do_unlink=True)
    MP = mat('pot', img('Flower Pot Color.png', 512), img('Flower Pot Normal.png', 512), img('Flower Pot Roughness.png', 256))
    ML = mat('leaves', img('Part 02 Color.jpeg', 512, 'Part 02 Alpha.jpg'), img('Part 02 Normal.jpeg', 256), None, alpha=True)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in obs:
        o.data.materials.clear(); o.data.materials.append(MP if 'pot' in o.name else ML)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [o.matrix_world @ mathutils.Vector(v) for o in obs for v in o.bound_box]
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2; cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2; z0 = min(v.z for v in bb)
    # center on the POT (the palm leans), base at 0
    pot = [o for o in obs if 'pot' in o.name][0]; pb = [pot.matrix_world @ mathutils.Vector(v) for v in pot.bound_box]
    cx = (min(v.x for v in pb) + max(v.x for v in pb)) / 2; cy = (min(v.y for v in pb) + max(v.y for v in pb)) / 2
    for o in obs:
        o.location -= mathutils.Vector((cx, cy, z0))
    bpy.ops.object.transform_apply(location=True)
    out = os.path.join(outdir, f'palm_pot_{tag}.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_yup=True, export_apply=True, export_image_format='WEBP')
    print('WROTE', out, os.path.getsize(out))
