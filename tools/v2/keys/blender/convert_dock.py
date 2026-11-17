# Blender (track: keys): one of the user's dock models -> game GLB in meters, Y up.
#   blender -b -Y "<Dock N.blend>" --python-exit-code 1 --python convert_dock.py -- out.glb SCALE MAXTEX [PIECES] [DROP] [MAXTRIS]
# SCALE: multiplier that brings the model to meters (applied on top of the object transforms).
# ORIGIN (7th): 'deck' or 'base'.
# PIECES: 'join' (one node) or 'split' (one node per source object, named like the source: modular kits).
# DROP: regex of object names to leave out. MAXTRIS: decimate each piece to about this many triangles (0 = keep).
# Every exported node carries extras: deckY (the walking surface height, from the largest up-facing area) and the
# bounding box in meters, so the game can stand the dock on its piles at the waterline without guessing.
# Never runs scripts from the downloaded .blend (-Y), only reads its data.
import bpy, sys, os, re, math, mathutils, bmesh
a = sys.argv[sys.argv.index('--') + 1:]
out, SCALE, MAXTEX = a[0], float(a[1]), int(a[2])
PIECES = a[3] if len(a) > 3 and a[3] else 'join'
DROP = re.compile(a[4]) if len(a) > 4 and a[4] else None
MAXTRIS = int(a[5]) if len(a) > 5 and a[5] else 0
ORIGIN = a[6] if len(a) > 6 and a[6] else 'deck'   # 'deck' (walking surface at y = 0) or 'base' (lowest point at y = 0: props)
sc = bpy.context.scene
# AUTOWIRE (8th arg, a texture folder next to the .blend): materials named 'Part NN' whose image nodes are missing get
# '<Color|Roughness|Normal>[ N].png' wired in (the library files ship the maps loose; N = NN when NN > 1)
WIRE = a[7] if len(a) > 7 and a[7] else None
if WIRE:
    import os.path as osp
    for m in bpy.data.materials:
        mm = re.match(r'Part (\d+)', m.name or '')
        if not mm or not m.use_nodes or any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes): continue
        n = int(mm.group(1)); suf = '' if n == 1 else ' %d' % n; nt = m.node_tree; bsdf = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        def img(kind, color):
            f = osp.join(WIRE, kind + suf + '.png')
            if not osp.exists(f): return None
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(f); t.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; return t
        c = img('Color', True); rgh = img('Roughness', False); nor = img('Normal', False)
        if c: nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
        if rgh: nt.links.new(rgh.outputs['Color'], bsdf.inputs['Roughness'])
        if nor: nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nor.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        print('WIRED', m.name, bool(c), bool(rgh), bool(nor))
meshes = [o for o in sc.objects if o.type == 'MESH' and not (DROP and DROP.search(o.name))]
S = mathutils.Matrix.Scale(SCALE, 4)

def bake(o):
    me = o.data.copy(); me.transform(S @ o.matrix_world)
    if o.matrix_world.determinant() < 0: me.flip_normals()
    while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])
    return me

groups = {}
for o in meshes:
    k = 'dock' if PIECES == 'join' else re.sub(r'[^A-Za-z0-9_]+', '_', o.name).strip('_').lower()
    groups.setdefault(k, []).append(o)

new = []
for k, objs in groups.items():
    mats = []; bm = bmesh.new()
    for o in objs:
        me = bake(o); loc = []
        for s in o.material_slots:
            if s.material not in mats: mats.append(s.material)
            loc.append(mats.index(s.material))
        n0 = len(bm.faces); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        for fi in range(n0, len(bm.faces)):
            f = bm.faces[fi]; f.material_index = loc[min(f.material_index, len(loc) - 1)] if loc else 0
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(k)
    for m in mats: me.materials.append(m)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(k, me); new.append(ob)
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
for ob in new: sc.collection.objects.link(ob); ob.name = ob.data.name = re.sub(r'\.\d+$', '', ob.name)   # no .001 suffix (glTF names drop the dot)

# decimate (per piece) when asked
for ob in new:
    me = ob.data; t = sum(len(p.vertices) - 2 for p in me.polygons)
    if MAXTRIS and t > MAXTRIS * 1.2:
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        md = ob.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.02, MAXTRIS / t); md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='d'); ob.select_set(False)

# global bbox, origin: plan center of everything, z = 0 at the main walking surface
allv = [ob.matrix_world @ v.co for ob in new for v in ob.data.vertices]
lo = mathutils.Vector([min(v[i] for v in allv) for i in range(3)]); hi = mathutils.Vector([max(v[i] for v in allv) for i in range(3)])
hist = {}
for ob in new:
    for p in ob.data.polygons:
        if p.normal.z > 0.92 and p.area > 1e-4:
            zb = round(p.center.z / 0.05) * 0.05; hist[zb] = hist.get(zb, 0) + p.area
deck = max(hist.items(), key=lambda kv: kv[1])[0] if hist else lo.z
# the plank tops of the most-used level (top of the band)
tops = [p.center.z for ob in new for p in ob.data.polygons if p.normal.z > 0.92 and abs(p.center.z - deck) < 0.08]
deck = max(tops) if tops else deck
if ORIGIN == 'base': deck = lo.z
off = mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, deck))
for ob in new:
    if PIECES == 'splitc':   # every piece centered on its own footprint, base at 0 (sets of separate props: bins, rocks)
        vs0 = [v.co for v in ob.data.vertices]
        off = mathutils.Vector(((min(v.x for v in vs0) + max(v.x for v in vs0)) / 2, (min(v.y for v in vs0) + max(v.y for v in vs0)) / 2, min(v.z for v in vs0)))
    ob.data.transform(mathutils.Matrix.Translation(-off))
    vs = [v.co for v in ob.data.vertices]
    l2 = [min(v[i] for v in vs) for i in range(3)]; h2 = [max(v[i] for v in vs) for i in range(3)]
    ob['bbox'] = [round(x, 3) for x in l2 + h2]   # Blender axes (x, y, z up) in meters, origin at the deck surface
    ob['deckY'] = 0.0
    ob['tris'] = sum(len(p.vertices) - 2 for p in ob.data.polygons)

# materials: wood is never metal; textures downscaled
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for l in list(n.inputs['Metallic'].links): m.node_tree.links.remove(l)
            n.inputs['Metallic'].default_value = 0.0
for im in bpy.data.images:
    if im.size[0] == 0: continue
    s = max(im.size[0], im.size[1])
    if s > MAXTEX: k = MAXTEX / s; im.scale(max(4, int(im.size[0] * k)), max(4, int(im.size[1] * k)))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85, export_apply=True, export_yup=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_animations=False, export_extras=True)
print('CONV', os.path.basename(out), 'pieces', len(new), 'tris', sum(o['tris'] for o in new), 'dims', [round(hi[i] - lo[i], 2) for i in range(3)], 'deck', round(deck, 2), 'below', round(lo.z - deck, 2), 'above', round(hi.z - deck, 2))
for ob in new: print('  PIECE', ob.name, ob['tris'], ob['bbox'])
