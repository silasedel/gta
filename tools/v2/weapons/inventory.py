# Blender (-b): list what is inside each weapon .blend (objects, tris, world dims, materials, linked images).
# usage: blender -b --python-exit-code 1 --python inventory.py -- <file.blend> [more...]
import bpy, sys, os, mathutils
files = sys.argv[sys.argv.index('--') + 1:]
for f in files:
    bpy.ops.wm.open_mainfile(filepath=f, load_ui=False, use_scripts=False)
    sc = bpy.context.scene
    print('=== FILE', os.path.basename(f), 'unit', sc.unit_settings.system, sc.unit_settings.scale_length)
    dg = bpy.context.evaluated_depsgraph_get()
    lo = mathutils.Vector((1e9,) * 3); hi = -lo
    tot = 0
    for o in sc.objects:
        line = f'  OBJ {o.type:8s} {o.name!r} parent={o.parent.name if o.parent else None!r} hide={o.hide_render}'
        if o.type == 'MESH':
            oe = o.evaluated_get(dg); me = oe.to_mesh()
            tris = sum(len(p.vertices) - 2 for p in me.polygons); tot += tris if not o.hide_render else 0
            bb = [o.matrix_world @ mathutils.Vector(v) for v in o.bound_box]
            l = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); h = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
            if not o.hide_render:
                for i in range(3): lo[i] = min(lo[i], l[i]); hi[i] = max(hi[i], h[i])
            line += f' tris={tris} min={tuple(round(x,3) for x in l)} max={tuple(round(x,3) for x in h)} mats={[s.material.name if s.material else None for s in o.material_slots]} mods={[m.type for m in o.modifiers]}'
            oe.to_mesh_clear()
        print(line)
    print('  TOTAL tris', tot, 'bounds', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi), 'size', tuple(round(hi[i] - lo[i], 3) for i in range(3)))
    for m in bpy.data.materials:
        if m.users == 0: continue
        imgs = []
        if m.use_nodes and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    im = n.image; links = [l.to_socket.name + '@' + l.to_node.name for l in n.outputs[0].links] if n.outputs[0].links else []
                    imgs.append(f'{im.name}[{im.size[0]}x{im.size[1]} packed={bool(im.packed_file)} ok={im.has_data or os.path.exists(bpy.path.abspath(im.filepath))} cs={im.colorspace_settings.name}]->{links}')
            b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            bc = tuple(round(x, 2) for x in b.inputs['Base Color'].default_value) if b else None
            mt = round(b.inputs['Metallic'].default_value, 2) if b else None; rg = round(b.inputs['Roughness'].default_value, 2) if b else None
        else: bc = mt = rg = None
        print(f'  MAT {m.name!r} base={bc} metal={mt} rough={rg} imgs={imgs}')
