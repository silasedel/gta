import bpy
print('VER', bpy.app.version_string)
for im in bpy.data.images: print('IMG', im.name, im.filepath, im.size[:], 'packed' if im.packed_file else '', 'ok' if im.has_data or im.packed_file else 'MISSING?')
for o in bpy.context.scene.objects: print('OBJ', o.name, o.type, tuple(round(v,3) for v in o.scale), o.parent.name if o.parent else '')
for m in bpy.data.materials:
    if not m.use_nodes: continue
    print('MAT', m.name, [ (n.type, n.image.name if getattr(n,'image',None) else '') for n in m.node_tree.nodes if n.type in ('TEX_IMAGE','BSDF_PRINCIPLED')])
