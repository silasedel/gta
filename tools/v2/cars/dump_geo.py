# Dump a converted car GLB (LOD0 body + wheel) to .npz in GAME space (x left, y up, z forward), one array set per slot.
# blender -b --factory-startup -P dump_geo.py -- <outdir> <a.glb> ...   -> <outdir>/<key>.npz  (keys: <slot>_v, <slot>_f, <slot>_c)
import bpy, sys, os, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]; out, glbs = a[0], a[1:]
os.makedirs(out, exist_ok=True)
for g in glbs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=g)
    acc = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        p = o
        while p and not (p.name.split('.')[0] in ('body0', 'wheel0', 'caliper0')): p = p.parent
        if not p: continue
        part = p.name.split('.')[0]
        me = o.data; me.calc_loop_triangles()
        M = np.array(o.matrix_world)
        n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        co = co @ M[:3, :3].T + M[:3, 3]
        co = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)  # blender -> game
        tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = tri.reshape(-1, 3)
        mi = np.empty(len(me.loop_triangles), dtype=np.int64); me.loop_triangles.foreach_get('material_index', mi)
        col = None
        if me.color_attributes:
            ca = me.color_attributes[0]
            c = np.empty(len(ca.data) * 4); ca.data.foreach_get('color', c); c = c.reshape(-1, 4)
            if ca.domain == 'CORNER':
                lv = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', lv)
                cv = np.zeros((n, 4)); cv[lv] = c; col = cv
            else: col = c
        for k in range(len(me.materials)):
            name = (me.materials[k].name if me.materials[k] else 'trim').replace('S_', '').split('.')[0]
            sel = tri[mi == k]
            if not len(sel): continue
            key = part + ':' + name
            L = acc.setdefault(key, {'v': [], 'f': [], 'c': [], 'n': 0})
            L['v'].append(co); L['f'].append(sel + L['n']); L['c'].append(col if col is not None else np.full((n, 4), 0.5)); L['n'] += n
    arrs = {}
    for k, L in acc.items():
        arrs[k + '_v'] = np.concatenate(L['v']).astype(np.float32); arrs[k + '_f'] = np.concatenate(L['f']).astype(np.int32); arrs[k + '_c'] = np.concatenate(L['c']).astype(np.float32)
    np.savez_compressed(os.path.join(out, os.path.basename(g)[:-4] + '.npz'), **arrs)
    print('DUMPED', g, list(acc.keys()), flush=True)
