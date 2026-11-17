# Convert a library .blend plant into a game GLB (see build.sh): meters, trunk base at the origin, decimated near mesh (+ optional
# texture-less LOD1 that reuses the near textures), textures within a pixel budget, similar materials merged.
# args: blend out.glb height_m target_tris [maxtex]
import bpy, sys, os, math, mathutils, bmesh
argv = sys.argv[sys.argv.index('--')+1:]
import json, re
blend, out, H, target = argv[0], argv[1], float(argv[2]), int(argv[3]); maxtex = int(argv[4]) if len(argv) > 4 else 2048
merge = json.loads(argv[5]) if len(argv) > 5 else {}
lod1 = int(argv[6]) if len(argv) > 6 else 0
keep = argv[7] if len(argv) > 7 else ''
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]
objs = []
for o in meshes:
    e = o.evaluated_get(dg); me = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=True, depsgraph=dg); me.transform(o.matrix_world)
    n = bpy.data.objects.new(o.name + '_w', me); sc.collection.objects.link(n); objs.append(n)
for o in list(sc.objects):
    if o not in objs: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
me = ob.data
zs = [v.co.z for v in me.vertices]; z0, z1 = min(zs), max(zs)
s = H / (z1 - z0) if H > 0 else 1.0
low = [v.co for v in me.vertices if v.co.z < z0 + (z1 - z0) * 0.03]
cx = sum(v.x for v in low) / len(low); cy = sum(v.y for v in low) / len(low)
for v in me.vertices: v.co = mathutils.Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - z0) * s))
tris = sum(len(p.vertices) - 2 for p in me.polygons)
def dec(o, ratio):
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = min(1.0, ratio); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
ntri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
if keep:  # leaf cards (alpha) are never decimated (collapse would merge cards); only the other materials share the budget
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in sc.objects if o.type == 'MESH']
    isk = lambda o: o.material_slots and o.material_slots[0].material and re.search(keep, o.material_slots[0].material.name)
    kept = sum(ntri(o) for o in parts if isk(o)); rest = sum(ntri(o) for o in parts if not isk(o))
    if target and rest > max(500, target - kept):
        for o in parts:
            if not isk(o): dec(o, max(500, target - kept) / rest)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
elif target and tris > target: dec(ob, target / tris)
ob = bpy.context.view_layer.objects.active
tris2 = ntri(ob)
for img in bpy.data.images:
    w, h = img.size[0], img.size[1]
    if not w: continue
    f = min(1.0, maxtex / max(w, h), (maxtex * maxtex / 4 / (w * h)) ** 0.5)
    if f < 1: img.scale(max(4, int(w * f)), max(4, int(h * f)))
# merge materials: {"keep name": "regex"} -> every slot whose material matches regex uses the 'keep' material
ob = bpy.context.view_layer.objects.active
for keep, rx in merge.items():
    km = bpy.data.materials.get(keep)
    for sl in ob.material_slots:
        if sl.material and re.search(rx, sl.material.name): sl.material = km
# drop unused / duplicate slots
bpy.ops.object.material_slot_remove_unused()
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True, export_image_format='AUTO', export_materials='EXPORT', export_yup=True, export_vertex_color='NONE')
if lod1 and tris2 > lod1:
    m = ob.modifiers.new('dec1', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = lod1 / tris2; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec1')
    bpy.ops.export_scene.gltf(filepath=out.replace('.glb', '_lod1.glb'), export_format='GLB', use_selection=False, export_apply=True, export_image_format='NONE', export_materials='EXPORT', export_yup=True, export_vertex_color='NONE')
    print('LOD1', sum(len(p.vertices) - 2 for p in ob.data.polygons))
print('CONVERTED', blend, 'tris', tris, '->', tris2, 'height', round((z1 - z0) * s, 2), 'scale', s)
