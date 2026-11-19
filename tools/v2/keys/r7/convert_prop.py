# r7: one of the user's downloaded props (FBX / OBJ / GLB) -> game GLB: meters, Y up, base at y = 0, centered, one PBR material
# from the shipped maps. Never runs scripts from the download (blender -Y).
#   blender -b -Y --python-exit-code 1 --python convert_prop.py -- <model> <out.glb> key=value ...
#   keys: base= rough= metal= normal= (texture paths), len=<target longest horizontal size m, 0 = keep (cm/mm sources are auto-scaled)>,
#         hk=<height multiplier>, h=<target height m>, keepmat=<material name to keep>, zcut=<drop faces above this source z>, rx=<degrees about X first (a source lying flat)>, rough_inv=1 (the 'rough' map is a gloss / reflection map)
import bpy, sys, os, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]; kv = dict(x.split('=', 1) for x in a[2:])
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
if len(obs) > 1: bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
import math, bmesh
if kv.get('keepmat'):   # keep only the faces of this material (one part of a multi-part download)
    names = [m.name if m else '' for m in o.data.materials]; keep = names.index(kv['keepmat'])
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.to_mesh(o.data); bm.free(); o.data.update()
if kv.get('zcut'):   # drop every face whose center is above this source height (e.g. a lamp's own shade, keep its stand)
    zc = float(kv['zcut']); bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > zc], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.to_mesh(o.data); bm.free(); o.data.update()
if float(kv.get('rx', 0)): o.data.transform(mathutils.Matrix.Rotation(math.radians(float(kv['rx'])), 4, 'X')); o.data.update()
vs = [v.co for v in o.data.vertices]
mn = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); mx = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
size = mx - mn; big = max(size.x, size.y)
Ht = float(kv.get('h', 0)); L = float(kv.get('len', 0)); k = (Ht / size.z) if Ht > 0 else (L / big) if L > 0 else (1.0 if big < 6 else 0.01 if big < 600 else 0.001); hk = float(kv.get('hk', 1))
print('CONV raw size', tuple(round(v, 3) for v in size), 'scale', round(k, 5))
for v in o.data.vertices:
    p = v.co; v.co = mathutils.Vector(((p.x - (mn.x + mx.x) / 2) * k, (p.y - (mn.y + mx.y) / 2) * k, (p.z - mn.z) * k * hk))
o.data.update()
if 'base' in kv:
    m = bpy.data.materials.new(os.path.splitext(os.path.basename(out))[0]); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    def tex(path, color=True):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(path)
        if not color: n.image.colorspace_settings.name = 'Non-Color'
        return n
    nt.links.new(tex(kv['base']).outputs['Color'], bs.inputs['Base Color'])
    if 'rough' in kv:
        rn = tex(kv['rough'], False); sep = nt.nodes.new('ShaderNodeSeparateColor'); src_ = rn.outputs['Color']
        if kv.get('rough_inv'): inv = nt.nodes.new('ShaderNodeInvert'); nt.links.new(src_, inv.inputs['Color']); src_ = inv.outputs['Color']
        nt.links.new(src_, sep.inputs['Color']); nt.links.new(sep.outputs[1], bs.inputs['Roughness'])
    if 'metal' in kv:
        mn_ = tex(kv['metal'], False); sep2 = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(mn_.outputs['Color'], sep2.inputs['Color']); nt.links.new(sep2.outputs[2], bs.inputs['Metallic'])
    else: bs.inputs['Metallic'].default_value = 0.0
    if 'normal' in kv:
        nn = tex(kv['normal'], False); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    o.data.materials.clear(); o.data.materials.append(m)
vs = [v.co for v in o.data.vertices]
print('CONV out size (m, x / depth / height)', round(max(v.x for v in vs) - min(v.x for v in vs), 3), round(max(v.y for v in vs) - min(v.y for v in vs), 3), round(max(v.z for v in vs), 3), 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_image_format='JPEG')
print('CONV wrote', out)
