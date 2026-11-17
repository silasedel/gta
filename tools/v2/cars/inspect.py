# Inventory one library car: objects (tris, world bbox, materials, parent), materials (color, textures, alpha, emission),
# overall bbox; renders a top view and a 3/4 view (Workbench, fast) so wheels / orientation can be checked by eye.
# blender -b --disable-autoexec --factory-startup -P inspect.py -- <src> <out_prefix>
import bpy, sys, math, mathutils, json, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
low = src.lower()
if low.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if low.endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
    elif low.endswith('.obj'): bpy.ops.wm.obj_import(filepath=src)
    else: bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
objs = [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3); per = []; tris = 0
for o in objs:
    e = o.evaluated_get(dg); m = e.to_mesh(); t = sum(len(p.vertices) - 2 for p in m.polygons); tris += t
    vs = [o.matrix_world @ v.co for v in m.vertices]
    if not vs: e.to_mesh_clear(); continue
    a = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); b = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
    mn = mathutils.Vector(map(min, mn, a)); mx = mathutils.Vector(map(max, mx, b))
    per.append({'name': o.name, 'tris': t, 'mats': [s.material.name if s.material else None for s in o.material_slots],
                'min': [round(v, 3) for v in a], 'max': [round(v, 3) for v in b], 'parent': o.parent.name if o.parent else None,
                'mods': [md.type for md in o.modifiers]})
    e.to_mesh_clear()
def tex_of(node_input):
    out_ = []
    for l in node_input.links:
        n = l.from_node; seen = 0
        while n is not None and seen < 6:
            seen += 1
            if n.type == 'TEX_IMAGE' and n.image: out_.append(n.image.name); break
            nxt = None
            for i in n.inputs:
                if i.links: nxt = i.links[0].from_node; break
            n = nxt
    return out_
mats = []
for m in bpy.data.materials:
    if m.users == 0: continue
    d = {'name': m.name, 'blend': getattr(m, 'blend_method', None), 'users': m.users}
    if m.use_nodes and m.node_tree:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        d['nodes'] = sorted(set(n.type for n in m.node_tree.nodes))
        if b:
            g = lambda k: b.inputs[k] if k in b.inputs else None
            d['base'] = [round(x, 3) for x in b.inputs['Base Color'].default_value]
            d['tex'] = tex_of(b.inputs['Base Color'])
            d['metal'] = round(b.inputs['Metallic'].default_value, 2); d['rough'] = round(b.inputs['Roughness'].default_value, 2)
            d['alpha'] = round(b.inputs['Alpha'].default_value, 2)
            tr = g('Transmission Weight') or g('Transmission')
            if tr: d['trans'] = round(tr.default_value, 2)
            em = g('Emission Color') or g('Emission')
            if em: d['emis'] = [round(x, 2) for x in em.default_value][:3]
            es = g('Emission Strength')
            if es: d['emisS'] = round(es.default_value, 2)
            d['ntex'] = tex_of(b.inputs['Normal']) if 'Normal' in b.inputs else []
    else:
        d['diffuse'] = [round(x, 3) for x in m.diffuse_color]
    mats.append(d)
imgs = [{'name': i.name, 'size': list(i.size), 'file': i.filepath, 'packed': bool(i.packed_file)} for i in bpy.data.images if i.users]
info = {'src': src, 'objects': len(per), 'tris': tris, 'min': [round(v, 3) for v in mn], 'max': [round(v, 3) for v in mx],
        'dims': [round(mx[i] - mn[i], 3) for i in range(3)], 'unit': sc.unit_settings.scale_length, 'per': per, 'images': imgs, 'mats': mats}
json.dump(info, open(out + '.json', 'w'), indent=1)
# renders
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
c = (mn + mx) / 2; size = max(mx - mn)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_cavity = False
sc.render.resolution_x = 640; sc.render.resolution_y = 480; sc.render.resolution_percentage = 100
for name, dirv, ortho in (('top', (0, 0, 1), True), ('q34', (0.7, -0.7, 0.35), False), ('q34b', (-0.7, 0.7, 0.35), False)):
    dv = mathutils.Vector(dirv).normalized()
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    cam.data.ortho_scale = size * 1.05; cam.data.lens = 40; cam.data.clip_start = size * 0.01; cam.data.clip_end = size * 30
    cam.location = c + dv * size * (1.25 if not ortho else 2.2)
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = out + '_' + name + '.png'
    bpy.ops.render.render(write_still=True)
print('INSPECTED', os.path.basename(src), 'tris', tris, 'dims', info['dims'])
