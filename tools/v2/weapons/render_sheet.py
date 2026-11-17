# Blender (-b): studio renders of the converted weapon GLBs (shading / texture / logo review without a browser slot)
#   blender -b --python-exit-code 1 --python render_sheet.py -- <out_dir> <glb> [glb ...]
import bpy, sys, os, math, mathutils
a = sys.argv[sys.argv.index('--') + 1:]; out = a[0]
for f in a[1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    bpy.ops.import_scene.gltf(filepath=f)
    objs = [o for o in sc.objects if o.type == 'MESH']
    lo = mathutils.Vector((1e9,) * 3); hi = -lo
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    ctr = (lo + hi) / 2; size = (hi - lo).length
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.32, 0.34, 0.37, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    for loc, en, col in (((1.5, 2.0, 3.0), 4.0, (1, 0.96, 0.9)), ((-2.5, -1.5, 1.5), 1.5, (0.8, 0.88, 1.0))):
        ld = bpy.data.lights.new('l', 'SUN'); ld.energy = en; ld.color = col; lo_ = bpy.data.objects.new('l', ld); sc.collection.objects.link(lo_)
        lo_.rotation_euler = (mathutils.Vector(loc).to_track_quat('Z', 'Y')).to_euler()
    cam = bpy.data.cameras.new('c'); cam.lens = 60; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    # glTF +Z (barrel) = Blender -Y; view the gun's right side (-X) from slightly in front and above
    d = mathutils.Vector((-1.0, -0.35, 0.28)).normalized()
    co.location = ctr + d * size * 2.1
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, os.path.basename(f).replace('.glb', '.png'))
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
