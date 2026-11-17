# Per-material geometry report of a library .blend (no scripts run): tris, height range, radial extent, UV range, mean face
# area. Used to map unlinked materials (e.g. Palm Tree 10's "Palm Part 8x") to their texture sets.
# blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P matparts.py -- <blend>
import bpy, sys, json, math
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=argv[0], load_ui=False, use_scripts=False)
dg = bpy.context.evaluated_depsgraph_get(); out = {}
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH': continue
    me = ob.evaluated_get(dg).to_mesh(); mw = ob.matrix_world; uv = me.uv_layers.active.data if me.uv_layers.active else None
    for p in me.polygons:
        m = ob.material_slots[p.material_index].material.name if p.material_index < len(ob.material_slots) and ob.material_slots[p.material_index].material else '?'
        r = out.setdefault(m, {'tris': 0, 'z': [1e9, -1e9], 'rad': 0, 'u': [1e9, -1e9], 'v': [1e9, -1e9], 'area': 0, 'n': 0, 'cx': 0, 'cy': 0})
        r['tris'] += len(p.vertices) - 2; r['area'] += p.area; r['n'] += 1
        for li in p.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            r['z'][0] = min(r['z'][0], co.z); r['z'][1] = max(r['z'][1], co.z); r['cx'] += co.x; r['cy'] += co.y
            if uv: u, v = uv[li].uv; r['u'][0] = min(r['u'][0], u); r['u'][1] = max(r['u'][1], u); r['v'][0] = min(r['v'][0], v); r['v'][1] = max(r['v'][1], v)
for m, r in out.items():
    k = max(1, r['n'] * 3); r['area'] = round(r['area'] / max(1, r['n']), 5); r['c'] = [round(r.pop('cx') / k, 2), round(r.pop('cy') / k, 2)]
    r['z'] = [round(x, 2) for x in r['z']]; r['u'] = [round(x, 2) for x in r['u']]; r['v'] = [round(x, 2) for x in r['v']]
    print('MAT', m, json.dumps(r))
