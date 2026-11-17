# Review render of converted GLBs: front 3/4 view (front = three.js +Z = Blender -Y), sun, gray sky. Ground grid 1 m.
#   blender -b --factory-startup -P render.py -- out_dir a.glb b.glb ...
import bpy, sys, os, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
od = argv[0]
for f in argv[1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=f)
    sc = bpy.context.scene
    ms = [o for o in sc.objects if o.type == 'MESH']
    mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
    for o in ms:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c); mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
    bpy.ops.mesh.primitive_plane_add(size=max(mx - mn) * 3 + 2, location=((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, 0))
    pl = bpy.context.active_object; m = bpy.data.materials.new('g'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; ck = m.node_tree.nodes.new('ShaderNodeTexChecker'); ck.inputs['Scale'].default_value = (max(mx - mn) * 3 + 2)
    ck.inputs['Color1'].default_value = (0.5, 0.5, 0.5, 1); ck.inputs['Color2'].default_value = (0.42, 0.42, 0.42, 1); m.node_tree.links.new(ck.outputs['Color'], b.inputs['Base Color']); pl.data.materials.append(m)
    c = (mn + mx) / 2; size = max(mx - mn)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50; cam.data.clip_start = 0.01; cam.data.clip_end = 1000
    d = mathutils.Vector((0.55, -1, 0.4)).normalized() * size * 2.0; cam.location = c + d; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(45), 0, math.radians(20)); sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.6, 0.72, 0.88, 1); bg.inputs[1].default_value = 0.9
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = 480; sc.render.resolution_y = 480
    sc.render.filepath = os.path.join(od, os.path.basename(f).replace('.glb', '.png')); bpy.ops.render.render(write_still=True)
