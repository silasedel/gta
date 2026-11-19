# Everglades r7b: a downloaded FBX / OBJ with alpha-cut foliage -> GLB (PNG textures keep their alpha), meters, Y up,
# origin at the base center. Materials whose color map has an alpha channel become alpha-clip (MASK in glTF).
#   blender -b -Y --factory-startup --python-exit-code 1 --python convert_alpha.py -- SRC TEXDIR out.glb SCALE MAXTEX [DECIMATE_RATIO] [TINT r,g,b per-material regex=...]
# TINT env: "needles=0.9,1.0,0.8;bark=0.8,0.8,0.8" multiplies the color maps of matching materials (pixel edit, baked).
import bpy, os, re, sys, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
SRC, TEX, OUT, SCALE, MAXTEX = a[0], a[1], a[2], float(a[3]), int(a[4]); DEC = float(a[5]) if len(a) > 5 and a[5] else 1.0
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
if SRC.lower().endswith('.obj'): bpy.ops.wm.obj_import(filepath=SRC)
else: bpy.ops.import_scene.fbx(filepath=SRC)
files = sorted(os.listdir(TEX))
tints = {}
for part in (os.environ.get('TINT') or '').split(';'):
    if '=' in part: k, v = part.split('='); tints[k] = [float(x) for x in v.split(',')]
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    key = re.sub(r'[^a-z]', '', m.name.lower())
    cand = [f for f in files if re.sub(r'[^a-z]', '', os.path.splitext(f)[0].lower()) == key] or [f for f in files if key and key[:12] in re.sub(r'[^a-z]', '', f.lower()) and not re.search(r'nm|normal', f, re.I)]
    if not cand: print('NOMAP', m.name); continue
    for n in [x for x in nt.nodes if x.type in ('TEX_IMAGE', 'NORMAL_MAP')]: nt.nodes.remove(n)
    im = bpy.data.images.load(os.path.join(TEX, cand[0]))
    for k, t in tints.items():
        if re.search(k, m.name, re.I):
            px = list(im.pixels); 
            for i in range(0, len(px), 4): px[i] *= t[0]; px[i + 1] *= t[1]; px[i + 2] *= t[2]
            im.pixels = px; print('TINT', m.name, t)
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = im
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    if im.channels == 4 and im.depth >= 32:
        nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha']); m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.85
    nmf = [f for f in files if re.search(r'nm|normal', f, re.I) and key[:8] in re.sub(r'[^a-z]', '', f.lower())]
    if nmf:
        ni = nt.nodes.new('ShaderNodeTexImage'); ni.image = bpy.data.images.load(os.path.join(TEX, nmf[0])); ni.image.colorspace_settings.name = 'Non-Color'
        q = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(ni.outputs['Color'], q.inputs['Color']); nt.links.new(q.outputs['Normal'], bsdf.inputs['Normal'])
    print('WIRE', m.name, cand[0], im.channels, bool(nmf))
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects:
    if o.type != 'MESH': continue
for o in meshes:
    o.data.transform(o.matrix_world); o.matrix_world = mathutils.Matrix.Identity(4)
    o.data.transform(mathutils.Matrix.Scale(SCALE, 4))
vs = [v.co for o in meshes for v in o.data.vertices]
lo = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); hi = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
T = mathutils.Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
for o in meshes: o.data.transform(T)
if DEC < 1:
    for o in meshes:
        bpy.context.view_layer.objects.active = o; md = o.modifiers.new('d', 'DECIMATE'); md.ratio = DEC; bpy.ops.object.modifier_apply(modifier='d')
for im in bpy.data.images:
    if im.size[0] and max(im.size) > MAXTEX: k = MAXTEX / max(im.size); im.scale(max(4, int(im.size[0] * k)), max(4, int(im.size[1] * k)))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='AUTO', export_apply=True, export_yup=True, export_materials='EXPORT', export_animations=False)
print('CONV', os.path.basename(OUT), 'tris', sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons), 'dims', [round(hi[i] - lo[i], 2) for i in range(3)])
