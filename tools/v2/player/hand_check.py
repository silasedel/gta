# Finger rig check: curls the fingers (relaxed, grip, fist) and renders the hand from above, the front and below.
#   blender -b <rig.blend> --python-exit-code 1 -P tools/v2/player/hand_check.py -- <basecolor.png> <outdir>
import bpy, sys, math, os
from mathutils import Matrix, Vector
argv = sys.argv[sys.argv.index('--') + 1:]; TEX, OUT = argv[0], argv[1]; os.makedirs(OUT, exist_ok=True)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in bpy.data.objects:
    if o.type == 'MESH': o.hide_render = not o.name.startswith('LOD0')
img = bpy.data.images.load(TEX)
for m in bpy.data.materials:
    m.use_nodes = True; nt = m.node_tree; bs = nt.nodes.get('Principled BSDF') or nt.nodes.new('ShaderNodeBsdfPrincipled')
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = img; nt.links.new(ti.outputs['Color'], bs.inputs['Base Color'])
    out = nt.nodes.get('Material Output') or nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(bs.outputs[0], out.inputs[0])
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = 520; sc.render.resolution_y = 420
cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 0.3
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
pb = rig.pose.bones
def rot(n, axis, deg):
    b = pb['mixamorig:' + n]; bpy.context.view_layer.update(); m = b.matrix.copy(); h = m.to_translation()
    b.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-h) @ m; bpy.context.view_layer.update()
J = {b.name.replace('mixamorig:', ''): rig.matrix_world @ b.head_local for b in rig.data.bones}
for pose, ang in (('open', (0, 0, 0)), ('relaxed', (25, 30, 20)), ('grip', (60, 75, 45)), ('fist', (85, 100, 70))):
    for b in pb: b.rotation_mode = 'XYZ'; b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
    bpy.context.view_layer.update()
    for f in ('Index', 'Middle', 'Ring', 'Pinky'):
        for j in (1, 2, 3): rot('LeftHand' + f + str(j), (0, 1, 0), ang[j - 1])
    for j in (1, 2, 3): rot('LeftHandThumb' + str(j), (1, 0, 0), -ang[j - 1] * 0.4)
    c = (J['LeftHand'] + J['LeftHandMiddle1']) / 2 + Vector((0.03, 0, 0))
    for nm, off, r in (('top', (0, 0, 2), (0, 0, 0)), ('front', (0, -2, 0), (math.radians(90), 0, 0)), ('below', (0, 0, -2), (math.radians(180), 0, 0))):
        cam.location = c + Vector(off); cam.rotation_euler = r
        sc.render.filepath = os.path.join(OUT, f'{pose}_{nm}.png'); bpy.ops.render.render(write_still=True)
print('[hand_check] done')
